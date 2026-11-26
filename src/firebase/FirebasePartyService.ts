import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  RankTier,
  SquadInviteNotification,
  SquadMemberStatus,
} from '../ranked/RankedTypes';
import { DEFAULT_AVATAR_ID } from '../shop/AvatarBannerCatalog';
import { firestoreDb, handleFirestoreError, OperationType } from './firebaseApp';

export interface FirestorePartyMemberEntry {
  uid: string;
  playerId: string;
  numericId: string;
  username: string;
  avatarId: string;
  level: number;
  status: SquadMemberStatus;
  joinedAt: number;
}

export interface FirestorePartyDoc {
  partyId: string;
  leaderUid: string;
  leaderPlayerId: string;
  maxSize: 2 | 4;
  memberUids: string[];
  members: Record<string, FirestorePartyMemberEntry>;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface FirestorePartyInviteDoc {
  inviteId: string;
  partyId: string;
  fromUid: string;
  fromPlayerId: string;
  fromNumericId: string;
  fromName: string;
  fromTier: RankTier;
  fromLevel: number;
  fromAvatarId: string;
  toUid: string;
  toPlayerId: string;
  maxSize: 2 | 4;
  memberCount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PartySelfProfileInfo {
  uid: string;
  playerId: string;
  numericId: string;
  username: string;
  avatarId: string;
  level: number;
  tier: RankTier;
}

export interface FirebasePartyCallbacks {
  onPartyChanged?: (party: FirestorePartyDoc | null) => void;
  onIncomingInvitesChanged?: (invites: SquadInviteNotification[]) => void;
}

function generatePartyId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `pty_${hex}`;
}

export class FirebasePartyService {
  private activeUid: string | null = null;
  private selfInfo: PartySelfProfileInfo | null = null;
  private callbacks: FirebasePartyCallbacks = {};
  private activePartyId: string | null = null;
  private activePartyDoc: FirestorePartyDoc | null = null;

  private unsubMembership: Unsubscribe | null = null;
  private unsubParty: Unsubscribe | null = null;
  private unsubInvites: Unsubscribe | null = null;
  private incomingInvites = new Map<string, FirestorePartyInviteDoc>();

  start(uid: string, selfInfo: PartySelfProfileInfo, callbacks: FirebasePartyCallbacks): void {
    this.stop();
    this.activeUid = uid;
    this.selfInfo = { ...selfInfo };
    this.callbacks = callbacks;

    const membershipRef = doc(firestoreDb, 'partyMemberships', uid);
    this.unsubMembership = onSnapshot(
      membershipRef,
      (snap) => {
        if (!this.activeUid || this.activeUid !== uid) return;
        if (!snap.exists()) {
          this.subscribeToParty(null);
          return;
        }
        const data = snap.data() as { partyId?: unknown };
        const partyId = typeof data?.partyId === 'string' && data.partyId ? data.partyId : null;
        this.subscribeToParty(partyId);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, membershipRef.path);
      },
    );

    const invitesQuery = query(
      collection(firestoreDb, 'partyInvites'),
      where('toUid', '==', uid),
      where('status', '==', 'pending'),
    );
    this.unsubInvites = onSnapshot(
      invitesQuery,
      (snap) => {
        if (!this.activeUid || this.activeUid !== uid) return;
        this.incomingInvites.clear();
        const notifs: SquadInviteNotification[] = [];
        for (const d of snap.docs) {
          const inv = d.data() as FirestorePartyInviteDoc;
          this.incomingInvites.set(inv.inviteId, inv);
          notifs.push({
            inviteId: inv.inviteId,
            squadId: inv.partyId,
            fromPlayerId: inv.fromPlayerId,
            fromNumericId: inv.fromNumericId,
            fromName: inv.fromName,
            fromTier: inv.fromTier,
            fromLevel: inv.fromLevel,
            fromAvatarId: inv.fromAvatarId,
            maxSize: inv.maxSize,
            memberCount: inv.memberCount,
          });
        }
        this.callbacks.onIncomingInvitesChanged?.(notifs);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'partyInvites');
      },
    );
  }

  updateSelfInfo(partial: Partial<PartySelfProfileInfo>): void {
    if (!this.selfInfo) return;
    const prev = this.selfInfo;
    this.selfInfo = { ...prev, ...partial };
    if (
      this.activeUid &&
      this.activePartyId &&
      (prev.username !== this.selfInfo.username ||
        prev.avatarId !== this.selfInfo.avatarId ||
        prev.level !== this.selfInfo.level)
    ) {
      void this.syncSelfMemberMetadata().catch(() => {});
    }
  }

  async syncSelfMemberMetadata(): Promise<void> {
    if (!this.activeUid || !this.activePartyId || !this.selfInfo) return;
    const uid = this.activeUid;
    const info = this.selfInfo;
    const partyRef = doc(firestoreDb, 'parties', this.activePartyId);
    try {
      await runTransaction(firestoreDb, async (tx) => {
        const snap = await tx.get(partyRef);
        if (!snap.exists()) return;
        const party = snap.data() as FirestorePartyDoc;
        if (!Array.isArray(party.memberUids) || !party.memberUids.includes(uid)) return;
        tx.update(partyRef, {
          [`members.${uid}.username`]: info.username.slice(0, 18),
          [`members.${uid}.avatarId`]: info.avatarId || DEFAULT_AVATAR_ID,
          [`members.${uid}.level`]: Math.max(1, Math.min(300, Math.floor(info.level || 1))),
          updatedAt: serverTimestamp(),
        });
      });
    } catch {
      // Non-fatal metadata sync failure
    }
  }

  getActivePartyId(): string | null {
    return this.activePartyId;
  }

  getActivePartyDoc(): FirestorePartyDoc | null {
    return this.activePartyDoc;
  }

  hasCloudInvite(inviteId: string): boolean {
    return this.incomingInvites.has(inviteId);
  }

  private isPermissionDeniedError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const code = (err as { code?: unknown }).code;
    if (code === 'permission-denied') return true;
    const msg = (err as { message?: unknown }).message;
    return typeof msg === 'string' && msg.includes('Missing or insufficient permissions');
  }

  private async cleanupOrphanedMembership(uid: string, partyId: string): Promise<void> {
    if (!this.activeUid || this.activeUid !== uid) return;
    const membershipRef = doc(firestoreDb, 'partyMemberships', uid);
    try {
      const mSnap = await getDoc(membershipRef);
      if (!mSnap.exists()) return;
      const data = mSnap.data() as { partyId?: unknown };
      if (data?.partyId === partyId) {
        await deleteDoc(membershipRef);
      }
    } catch (cleanupErr) {
      handleFirestoreError(cleanupErr, OperationType.WRITE, membershipRef.path);
    }
  }

  private async handlePartyReadPermissionDenied(
    uid: string,
    partyId: string,
    originalErr: unknown,
  ): Promise<void> {
    if (!this.activeUid || this.activeUid !== uid) return;
    if (this.activePartyId === partyId) {
      this.unsubParty?.();
      this.unsubParty = null;
      this.activePartyId = null;
      this.activePartyDoc = null;
      this.callbacks.onPartyChanged?.(null);
    }

    const membershipRef = doc(firestoreDb, 'partyMemberships', uid);
    try {
      const mSnap = await getDoc(membershipRef);
      if (mSnap.exists()) {
        const data = mSnap.data() as { partyId?: unknown };
        if (data?.partyId === partyId) {
          // Stale partyMemberships pointer to an inaccessible or disbanded party: heal self membership cleanly.
          await deleteDoc(membershipRef);
        }
      }
    } catch {
      handleFirestoreError(originalErr, OperationType.GET, `parties/${partyId}`);
    }
  }

  private subscribeToParty(partyId: string | null): void {
    if (partyId === this.activePartyId && (partyId === null || this.unsubParty !== null)) {
      return;
    }
    this.unsubParty?.();
    this.unsubParty = null;
    this.activePartyId = partyId;
    if (!partyId || !this.activeUid) {
      this.activePartyDoc = null;
      this.callbacks.onPartyChanged?.(null);
      return;
    }

    const uid = this.activeUid;
    const partyRef = doc(firestoreDb, 'parties', partyId);
    this.unsubParty = onSnapshot(
      partyRef,
      (snap) => {
        if (!this.activeUid || this.activeUid !== uid || this.activePartyId !== partyId) return;
        if (!snap.exists()) {
          this.unsubParty?.();
          this.unsubParty = null;
          this.activePartyId = null;
          this.activePartyDoc = null;
          this.callbacks.onPartyChanged?.(null);
          void this.cleanupOrphanedMembership(uid, partyId).catch(() => {});
          return;
        }
        const docData = snap.data() as FirestorePartyDoc;
        if (!Array.isArray(docData.memberUids) || !docData.memberUids.includes(uid)) {
          this.unsubParty?.();
          this.unsubParty = null;
          this.activePartyId = null;
          this.activePartyDoc = null;
          this.callbacks.onPartyChanged?.(null);
          void this.cleanupOrphanedMembership(uid, partyId).catch(() => {});
          return;
        }
        this.activePartyDoc = docData;
        this.callbacks.onPartyChanged?.(docData);
      },
      (err) => {
        if (this.isPermissionDeniedError(err)) {
          void this.handlePartyReadPermissionDenied(uid, partyId, err).catch(() => {});
          return;
        }
        handleFirestoreError(err, OperationType.GET, partyRef.path);
      },
    );
  }

  private async ensureCleanPreviousMembership(): Promise<void> {
    if (!this.activeUid) return;
    const uid = this.activeUid;
    const membershipRef = doc(firestoreDb, 'partyMemberships', uid);
    try {
      const mSnap = await getDoc(membershipRef);
      if (!mSnap.exists()) return;
      const oldPartyId = (mSnap.data() as { partyId?: string }).partyId;
      if (oldPartyId) {
        await this.leavePartyById(oldPartyId);
      } else {
        await deleteDoc(membershipRef);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, membershipRef.path);
    }
  }

  async createParty(maxSize: 2 | 4 = 4): Promise<string | null> {
    if (!this.activeUid || !this.selfInfo) return null;
    await this.ensureCleanPreviousMembership();

    const uid = this.activeUid;
    const info = this.selfInfo;
    const partyId = generatePartyId();
    const partyRef = doc(firestoreDb, 'parties', partyId);
    const membershipRef = doc(firestoreDb, 'partyMemberships', uid);
    const safeMax: 2 | 4 = maxSize === 2 ? 2 : 4;

    try {
      const batch = writeBatch(firestoreDb);
      batch.set(partyRef, {
        partyId,
        leaderUid: uid,
        leaderPlayerId: info.playerId,
        maxSize: safeMax,
        memberUids: [uid],
        members: {
          [uid]: {
            uid,
            playerId: info.playerId,
            numericId: info.numericId || '000000000',
            username: info.username.slice(0, 18),
            avatarId: info.avatarId || DEFAULT_AVATAR_ID,
            level: Math.max(1, Math.min(300, Math.floor(info.level || 1))),
            status: 'not-ready',
            joinedAt: Date.now(),
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(membershipRef, {
        uid,
        partyId,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      this.subscribeToParty(partyId);
      return partyId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, partyRef.path);
    }
  }

  async sendPartyInvite(targetPlayerId: string): Promise<void> {
    if (!this.activeUid || !this.selfInfo) return;
    let partyId = this.activePartyId;
    if (!partyId) {
      partyId = await this.createParty(4);
    }
    if (!partyId) return;

    const indexRef = doc(firestoreDb, 'playerIdIndex', targetPlayerId);
    let targetUid: string | null = null;
    try {
      const indexSnap = await getDoc(indexRef);
      if (indexSnap.exists()) {
        const uid = (indexSnap.data() as { uid?: unknown }).uid;
        if (typeof uid === 'string' && uid) targetUid = uid;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, indexRef.path);
    }
    if (!targetUid || targetUid === this.activeUid) return;

    const partyRef = doc(firestoreDb, 'parties', partyId);
    let partyDoc: FirestorePartyDoc | null = null;
    try {
      const pSnap = await getDoc(partyRef);
      if (!pSnap.exists()) return;
      partyDoc = pSnap.data() as FirestorePartyDoc;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, partyRef.path);
    }

    if (
      partyDoc.leaderUid !== this.activeUid ||
      partyDoc.memberUids.length >= partyDoc.maxSize ||
      partyDoc.memberUids.includes(targetUid)
    ) {
      return;
    }

    const inviteId = `${partyId}_${targetUid}`;
    const inviteRef = doc(firestoreDb, 'partyInvites', inviteId);
    const info = this.selfInfo;
    try {
      const prevSnap = await getDoc(inviteRef);
      if (prevSnap.exists()) {
        const prev = prevSnap.data() as FirestorePartyInviteDoc;
        if (prev.status === 'pending') return;
        await deleteDoc(inviteRef);
      }
      const batch = writeBatch(firestoreDb);
      batch.set(inviteRef, {
        inviteId,
        partyId,
        fromUid: this.activeUid,
        fromPlayerId: info.playerId,
        fromNumericId: info.numericId || '000000000',
        fromName: info.username.slice(0, 18),
        fromTier: info.tier,
        fromLevel: Math.max(1, Math.min(300, Math.floor(info.level || 1))),
        fromAvatarId: info.avatarId || DEFAULT_AVATAR_ID,
        toUid: targetUid,
        toPlayerId: targetPlayerId,
        maxSize: partyDoc.maxSize,
        memberCount: partyDoc.memberUids.length,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, inviteRef.path);
    }
  }

  async respondToPartyInvite(inviteId: string, accept: boolean): Promise<void> {
    if (!this.activeUid || !this.selfInfo) return;
    const uid = this.activeUid;
    const info = this.selfInfo;
    const inviteRef = doc(firestoreDb, 'partyInvites', inviteId);

    if (!accept) {
      try {
        await runTransaction(firestoreDb, async (tx) => {
          const snap = await tx.get(inviteRef);
          if (!snap.exists()) return;
          const inv = snap.data() as FirestorePartyInviteDoc;
          if (inv.status !== 'pending' || inv.toUid !== uid) return;
          tx.update(inviteRef, {
            status: 'rejected',
            updatedAt: serverTimestamp(),
          });
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, inviteRef.path);
      }
      return;
    }

    await this.ensureCleanPreviousMembership();

    try {
      await runTransaction(firestoreDb, async (tx) => {
        const invSnap = await tx.get(inviteRef);
        if (!invSnap.exists()) return;
        const inv = invSnap.data() as FirestorePartyInviteDoc;
        if (inv.status !== 'pending' || inv.toUid !== uid) return;

        const partyRef = doc(firestoreDb, 'parties', inv.partyId);
        const partySnap = await tx.get(partyRef);
        if (!partySnap.exists()) return;
        const party = partySnap.data() as FirestorePartyDoc;
        if (party.memberUids.length >= party.maxSize || party.memberUids.includes(uid)) {
          return;
        }

        const membershipRef = doc(firestoreDb, 'partyMemberships', uid);
        tx.update(inviteRef, {
          status: 'accepted',
          updatedAt: serverTimestamp(),
        });
        tx.update(partyRef, {
          memberUids: [...party.memberUids, uid],
          [`members.${uid}`]: {
            uid,
            playerId: info.playerId,
            numericId: info.numericId || '000000000',
            username: info.username.slice(0, 18),
            avatarId: info.avatarId || DEFAULT_AVATAR_ID,
            level: Math.max(1, Math.min(300, Math.floor(info.level || 1))),
            status: 'not-ready',
            joinedAt: Date.now(),
          },
          updatedAt: serverTimestamp(),
        });
        tx.set(membershipRef, {
          uid,
          partyId: inv.partyId,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, inviteRef.path);
    }
  }

  async setMemberStatus(status: SquadMemberStatus): Promise<void> {
    if (!this.activeUid || !this.activePartyId) return;
    const uid = this.activeUid;
    const partyRef = doc(firestoreDb, 'parties', this.activePartyId);
    try {
      await runTransaction(firestoreDb, async (tx) => {
        const snap = await tx.get(partyRef);
        if (!snap.exists()) return;
        const party = snap.data() as FirestorePartyDoc;
        if (!party.memberUids.includes(uid)) return;
        tx.update(partyRef, {
          [`members.${uid}.status`]: status,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, partyRef.path);
    }
  }

  async transferLeadership(targetPlayerId: string): Promise<void> {
    if (!this.activeUid || !this.activePartyId) return;
    const uid = this.activeUid;
    const partyRef = doc(firestoreDb, 'parties', this.activePartyId);
    try {
      await runTransaction(firestoreDb, async (tx) => {
        const snap = await tx.get(partyRef);
        if (!snap.exists()) return;
        const party = snap.data() as FirestorePartyDoc;
        if (party.leaderUid !== uid) return;
        const targetEntry = Object.values(party.members).find((m) => m.playerId === targetPlayerId);
        if (!targetEntry || targetEntry.uid === uid) return;
        tx.update(partyRef, {
          leaderUid: targetEntry.uid,
          leaderPlayerId: targetEntry.playerId,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, partyRef.path);
    }
  }

  async kickMember(targetPlayerId: string): Promise<void> {
    if (!this.activeUid || !this.activePartyId) return;
    const uid = this.activeUid;
    const partyRef = doc(firestoreDb, 'parties', this.activePartyId);
    try {
      await runTransaction(firestoreDb, async (tx) => {
        const snap = await tx.get(partyRef);
        if (!snap.exists()) return;
        const party = snap.data() as FirestorePartyDoc;
        if (party.leaderUid !== uid) return;
        const targetEntry = Object.values(party.members).find((m) => m.playerId === targetPlayerId);
        if (!targetEntry || targetEntry.uid === uid) return;

        const remainingUids = party.memberUids.filter((id) => id !== targetEntry.uid);
        const targetMembershipRef = doc(firestoreDb, 'partyMemberships', targetEntry.uid);
        tx.update(partyRef, {
          memberUids: remainingUids,
          [`members.${targetEntry.uid}`]: deleteField(),
          updatedAt: serverTimestamp(),
        });
        tx.delete(targetMembershipRef);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, partyRef.path);
    }
  }

  async resizeParty(maxSize: 2 | 4): Promise<void> {
    if (!this.activeUid || !this.activePartyId) return;
    const uid = this.activeUid;
    const partyRef = doc(firestoreDb, 'parties', this.activePartyId);
    try {
      await runTransaction(firestoreDb, async (tx) => {
        const snap = await tx.get(partyRef);
        if (!snap.exists()) return;
        const party = snap.data() as FirestorePartyDoc;
        if (party.leaderUid !== uid || party.memberUids.length > maxSize) return;
        tx.update(partyRef, {
          maxSize,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, partyRef.path);
    }
  }

  async leaveParty(): Promise<void> {
    if (!this.activePartyId) {
      await this.ensureCleanPreviousMembership();
      return;
    }
    await this.leavePartyById(this.activePartyId);
  }

  private async leavePartyById(partyId: string): Promise<void> {
    if (!this.activeUid) return;
    const uid = this.activeUid;
    const partyRef = doc(firestoreDb, 'parties', partyId);
    const membershipRef = doc(firestoreDb, 'partyMemberships', uid);

    // Detach the room listener before leaving so post-leave permission revocation cannot race onSnapshot.
    if (this.activePartyId === partyId) {
      this.subscribeToParty(null);
    }

    try {
      await runTransaction(firestoreDb, async (tx) => {
        const snap = await tx.get(partyRef);
        if (!snap.exists()) {
          tx.delete(membershipRef);
          return;
        }
        const party = snap.data() as FirestorePartyDoc;
        if (!party.memberUids.includes(uid)) {
          tx.delete(membershipRef);
          return;
        }

        const remainingUids = party.memberUids.filter((id) => id !== uid);
        if (remainingUids.length === 0) {
          tx.delete(partyRef);
          tx.delete(membershipRef);
          return;
        }

        const nextLeaderUid = party.leaderUid === uid ? remainingUids[0] : party.leaderUid;
        const nextLeaderPlayerId =
          party.leaderUid === uid
            ? party.members[nextLeaderUid]?.playerId ?? party.leaderPlayerId
            : party.leaderPlayerId;

        const updates: Record<string, unknown> = {
          memberUids: remainingUids,
          [`members.${uid}`]: deleteField(),
          updatedAt: serverTimestamp(),
        };
        if (party.leaderUid === uid) {
          updates.leaderUid = nextLeaderUid;
          updates.leaderPlayerId = nextLeaderPlayerId;
        }
        tx.update(partyRef, updates);
        tx.delete(membershipRef);
      });
      if (this.activePartyId === partyId) {
        this.subscribeToParty(null);
      }
    } catch (error) {
      if (this.isPermissionDeniedError(error)) {
        try {
          const mSnap = await getDoc(membershipRef);
          if (mSnap.exists() && (mSnap.data() as { partyId?: unknown }).partyId === partyId) {
            await deleteDoc(membershipRef);
          }
          return;
        } catch {
          // Fall through to structured Firestore error handler below
        }
      }
      handleFirestoreError(error, OperationType.WRITE, partyRef.path);
    }
  }

  stop(): void {
    this.unsubMembership?.();
    this.unsubMembership = null;
    this.unsubParty?.();
    this.unsubParty = null;
    this.unsubInvites?.();
    this.unsubInvites = null;
    this.incomingInvites.clear();
    this.activePartyId = null;
    this.activePartyDoc = null;
    this.activeUid = null;
    this.selfInfo = null;
    this.callbacks = {};
  }

  dispose(): void {
    this.stop();
  }
}
