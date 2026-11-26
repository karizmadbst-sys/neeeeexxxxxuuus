import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { DEFAULT_R6_CUSTOMIZATION } from '../player/R6CustomizationData';
import type {
  FriendLookupResponse,
  FriendRelationStatus,
  FriendRequestEntry,
  OutgoingFriendRequestEntry,
  PlatformType,
  RankedCustomizationPayload,
  SquadFriendEntry,
} from '../ranked/RankedTypes';
import { DEFAULT_AVATAR_ID } from '../shop/AvatarBannerCatalog';
import { firestoreDb, handleFirestoreError, OperationType } from './firebaseApp';
import type { CloudPublicProfileDoc, FirebasePlayerService } from './FirebasePlayerService';

interface FirestoreFriendRequestDoc {
  requestId: string;
  fromUid: string;
  toUid: string;
  fromPlayerId: string;
  fromNumericId: string;
  toPlayerId: string;
  toNumericId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface FirestoreFriendshipDoc {
  friendshipId: string;
  users: [string, string];
  playerIds: [string, string];
  createdAt?: Timestamp | null;
}

interface FirestorePresenceDoc {
  uid: string;
  playerId: string;
  status: 'online' | 'in-squad' | 'in-match' | 'offline';
  platform: PlatformType;
  lastSeenAt?: Timestamp | null;
}

export interface FriendsRealtimeSnapshot {
  friends: SquadFriendEntry[];
  incomingRequests: FriendRequestEntry[];
  outgoingRequests: OutgoingFriendRequestEntry[];
  outgoingTargetIds: string[];
}

function canonicalPairId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function timestampToMs(ts?: Timestamp | null): number {
  if (ts && typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }
  return Date.now();
}

function buildFallbackCustomization(): RankedCustomizationPayload {
  return {
    skinId: DEFAULT_R6_CUSTOMIZATION.skinId,
    eyesId: DEFAULT_R6_CUSTOMIZATION.eyesId,
    mouthId: DEFAULT_R6_CUSTOMIZATION.mouthId,
    hairStyleId: DEFAULT_R6_CUSTOMIZATION.hairStyleId,
    hairColorId: DEFAULT_R6_CUSTOMIZATION.hairColorId,
    topId: DEFAULT_R6_CUSTOMIZATION.topId,
    pantsId: DEFAULT_R6_CUSTOMIZATION.pantsId,
    shoesId: DEFAULT_R6_CUSTOMIZATION.shoesId,
    hatId: DEFAULT_R6_CUSTOMIZATION.hatId,
    glassesId: DEFAULT_R6_CUSTOMIZATION.glassesId,
    maskId: DEFAULT_R6_CUSTOMIZATION.maskId,
    armorId: DEFAULT_R6_CUSTOMIZATION.armorId,
    accessoryId: DEFAULT_R6_CUSTOMIZATION.accessoryId,
    petId: DEFAULT_R6_CUSTOMIZATION.petId,
  };
}

export class FirebaseFriendsService {
  private activeUid: string | null = null;
  private selfProfile: {
    playerId: string;
    numericId: string;
    platform: PlatformType;
  } | null = null;
  private onUpdateCallback: ((snapshot: FriendsRealtimeSnapshot) => void) | null = null;

  private unsubIncoming: Unsubscribe | null = null;
  private unsubOutgoing: Unsubscribe | null = null;
  private unsubFriendships: Unsubscribe | null = null;
  private readonly friendProfileUnsubs = new Map<string, Unsubscribe>();
  private readonly friendPresenceUnsubs = new Map<string, Unsubscribe>();
  private readonly requesterProfileUnsubs = new Map<string, Unsubscribe>();
  private readonly outgoingTargetProfileUnsubs = new Map<string, Unsubscribe>();

  private incomingReqs = new Map<string, FirestoreFriendRequestDoc>();
  private outgoingReqs = new Map<string, FirestoreFriendRequestDoc>();
  private friendships = new Map<string, { friendUid: string; friendPlayerId: string }>();
  private friendProfiles = new Map<string, CloudPublicProfileDoc>();
  private friendPresence = new Map<string, FirestorePresenceDoc>();
  private requesterProfiles = new Map<string, CloudPublicProfileDoc>();
  private outgoingTargetProfiles = new Map<string, CloudPublicProfileDoc>();
  private presenceCreated = false;
  private syncRunId = 0;

  constructor(private readonly playerService: FirebasePlayerService) {}

  start(
    uid: string,
    selfProfile: { playerId: string; numericId: string; platform: PlatformType },
    onUpdate: (snapshot: FriendsRealtimeSnapshot) => void,
  ): void {
    void this.startAndAwaitInitialSync(uid, selfProfile, onUpdate).catch(() => {});
  }

  startAndAwaitInitialSync(
    uid: string,
    selfProfile: { playerId: string; numericId: string; platform: PlatformType },
    onUpdate: (snapshot: FriendsRealtimeSnapshot) => void,
    timeoutMs = 15_000,
  ): Promise<void> {
    this.stopSyncOnly();
    const runId = ++this.syncRunId;
    this.activeUid = uid;
    this.selfProfile = { ...selfProfile };
    this.onUpdateCallback = onUpdate;
    this.presenceCreated = false;

    return new Promise<void>((resolve, reject) => {
      let incomingReady = false;
      let outgoingReady = false;
      let friendshipsReady = false;
      let presenceReady = false;
      let settled = false;

      const checkReady = () => {
        if (settled || runId !== this.syncRunId) return;
        if (incomingReady && outgoingReady && friendshipsReady && presenceReady) {
          settled = true;
          clearTimeout(timeoutId);
          resolve();
        }
      };

      const failInitialSync = (err: unknown) => {
        if (settled || runId !== this.syncRunId) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const timeoutId = window.setTimeout(() => {
        failInitialSync(new Error('Timed out while syncing friends list from Cloud Firestore.'));
      }, timeoutMs);

      const incomingQ = query(
        collection(firestoreDb, 'friendRequests'),
        where('toUid', '==', uid),
      );
      this.unsubIncoming = onSnapshot(
        incomingQ,
        (snap) => {
          if (runId !== this.syncRunId) return;
          this.incomingReqs.clear();
          const neededSenderUids = new Set<string>();
          snap.forEach((d) => {
            const data = d.data() as FirestoreFriendRequestDoc;
            if (data.status === 'pending') {
              this.incomingReqs.set(d.id, data);
              neededSenderUids.add(data.fromUid);
            }
          });
          this.reconcileRequesterListeners(neededSenderUids);
          this.emitSnapshot();
          incomingReady = true;
          checkReady();
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'friendRequests');
          } catch (formattedErr) {
            if (!settled) {
              failInitialSync(formattedErr);
              return;
            }
            throw formattedErr;
          }
        },
      );

      const outgoingQ = query(
        collection(firestoreDb, 'friendRequests'),
        where('fromUid', '==', uid),
      );
      this.unsubOutgoing = onSnapshot(
        outgoingQ,
        (snap) => {
          if (runId !== this.syncRunId) return;
          this.outgoingReqs.clear();
          const neededTargetUids = new Set<string>();
          snap.forEach((d) => {
            const data = d.data() as FirestoreFriendRequestDoc;
            if (data.status === 'pending') {
              this.outgoingReqs.set(d.id, data);
              neededTargetUids.add(data.toUid);
            }
          });
          this.reconcileOutgoingTargetListeners(neededTargetUids);
          this.emitSnapshot();
          outgoingReady = true;
          checkReady();
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'friendRequests');
          } catch (formattedErr) {
            if (!settled) {
              failInitialSync(formattedErr);
              return;
            }
            throw formattedErr;
          }
        },
      );

      const friendshipsQ = query(
        collection(firestoreDb, 'friendships'),
        where('users', 'array-contains', uid),
      );
      this.unsubFriendships = onSnapshot(
        friendshipsQ,
        (snap) => {
          if (runId !== this.syncRunId) return;
          this.friendships.clear();
          const neededFriendUids = new Set<string>();
          snap.forEach((d) => {
            const data = d.data() as FirestoreFriendshipDoc;
            if (!Array.isArray(data.users) || data.users.length !== 2) return;
            const isFirst = data.users[0] === uid;
            const friendUid = isFirst ? data.users[1] : data.users[0];
            const friendPlayerId =
              Array.isArray(data.playerIds) && data.playerIds.length === 2
                ? isFirst
                  ? data.playerIds[1]
                  : data.playerIds[0]
                : friendUid;
            if (friendUid && friendUid !== uid) {
              this.friendships.set(friendUid, { friendUid, friendPlayerId });
              neededFriendUids.add(friendUid);
            }
          });
          this.reconcileFriendListeners(neededFriendUids);
          this.emitSnapshot();
          friendshipsReady = true;
          checkReady();
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'friendships');
          } catch (formattedErr) {
            if (!settled) {
              failInitialSync(formattedErr);
              return;
            }
            throw formattedErr;
          }
        },
      );

      void this.setPresenceStatus('online')
        .then(() => {
          presenceReady = true;
          checkReady();
        })
        .catch((err) => {
          failInitialSync(err);
        });
    });
  }

  private reconcileRequesterListeners(neededUids: Set<string>): void {
    for (const [uid, unsub] of this.requesterProfileUnsubs.entries()) {
      if (!neededUids.has(uid)) {
        unsub();
        this.requesterProfileUnsubs.delete(uid);
        this.requesterProfiles.delete(uid);
      }
    }

    for (const senderUid of neededUids) {
      if (this.requesterProfileUnsubs.has(senderUid)) continue;
      const path = `publicProfiles/${senderUid}`;
      const unsub = onSnapshot(
        doc(firestoreDb, 'publicProfiles', senderUid),
        (snap) => {
          if (snap.exists()) {
            this.requesterProfiles.set(senderUid, snap.data() as CloudPublicProfileDoc);
          } else {
            this.requesterProfiles.delete(senderUid);
          }
          this.emitSnapshot();
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, path);
        },
      );
      this.requesterProfileUnsubs.set(senderUid, unsub);
    }
  }

  private reconcileOutgoingTargetListeners(neededUids: Set<string>): void {
    for (const [uid, unsub] of this.outgoingTargetProfileUnsubs.entries()) {
      if (!neededUids.has(uid)) {
        unsub();
        this.outgoingTargetProfileUnsubs.delete(uid);
        this.outgoingTargetProfiles.delete(uid);
      }
    }

    for (const targetUid of neededUids) {
      if (this.outgoingTargetProfileUnsubs.has(targetUid)) continue;
      const path = `publicProfiles/${targetUid}`;
      const unsub = onSnapshot(
        doc(firestoreDb, 'publicProfiles', targetUid),
        (snap) => {
          if (snap.exists()) {
            this.outgoingTargetProfiles.set(targetUid, snap.data() as CloudPublicProfileDoc);
          } else {
            this.outgoingTargetProfiles.delete(targetUid);
          }
          this.emitSnapshot();
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, path);
        },
      );
      this.outgoingTargetProfileUnsubs.set(targetUid, unsub);
    }
  }

  private reconcileFriendListeners(neededUids: Set<string>): void {
    for (const [uid, unsub] of this.friendProfileUnsubs.entries()) {
      if (!neededUids.has(uid)) {
        unsub();
        this.friendProfileUnsubs.delete(uid);
        this.friendProfiles.delete(uid);
      }
    }
    for (const [uid, unsub] of this.friendPresenceUnsubs.entries()) {
      if (!neededUids.has(uid)) {
        unsub();
        this.friendPresenceUnsubs.delete(uid);
        this.friendPresence.delete(uid);
      }
    }

    for (const friendUid of neededUids) {
      if (!this.friendProfileUnsubs.has(friendUid)) {
        const profilePath = `publicProfiles/${friendUid}`;
        const unsubProf = onSnapshot(
          doc(firestoreDb, 'publicProfiles', friendUid),
          (snap) => {
            if (snap.exists()) {
              this.friendProfiles.set(friendUid, snap.data() as CloudPublicProfileDoc);
            } else {
              this.friendProfiles.delete(friendUid);
            }
            this.emitSnapshot();
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, profilePath);
          },
        );
        this.friendProfileUnsubs.set(friendUid, unsubProf);
      }

      if (!this.friendPresenceUnsubs.has(friendUid)) {
        const presencePath = `presence/${friendUid}`;
        const unsubPres = onSnapshot(
          doc(firestoreDb, 'presence', friendUid),
          (snap) => {
            if (snap.exists()) {
              this.friendPresence.set(friendUid, snap.data() as FirestorePresenceDoc);
            } else {
              this.friendPresence.delete(friendUid);
            }
            this.emitSnapshot();
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, presencePath);
          },
        );
        this.friendPresenceUnsubs.set(friendUid, unsubPres);
      }
    }
  }

  private emitSnapshot(): void {
    if (!this.onUpdateCallback) return;

    const friends: SquadFriendEntry[] = [];
    for (const [friendUid, rel] of this.friendships.entries()) {
      const pub = this.friendProfiles.get(friendUid);
      const pres = this.friendPresence.get(friendUid);
      let status: SquadFriendEntry['status'] = pres?.status ?? 'offline';
      // Mark offline if heartbeat is older than 5 minutes
      if (
        pres?.lastSeenAt &&
        typeof pres.lastSeenAt.toMillis === 'function' &&
        Date.now() - pres.lastSeenAt.toMillis() > 5 * 60 * 1000
      ) {
        status = 'offline';
      }

      const fallbackCustom = buildFallbackCustomization();
      friends.push({
        playerId: pub?.playerId ?? rel.friendPlayerId,
        numericId: pub?.numericId ?? rel.friendPlayerId,
        name: pub?.username ?? 'FIGHTER',
        tier: pub?.tier ?? 'Bronze',
        rp: typeof pub?.rp === 'number' ? pub.rp : 200,
        level: typeof pub?.level === 'number' ? pub.level : 1,
        gender: pub?.gender === 'male' || pub?.gender === 'female' ? pub.gender : null,
        avatarId: pub?.avatarId ?? DEFAULT_AVATAR_ID,
        characterId: pub?.avatarCharacterId ?? 'char-01',
        customization: fallbackCustom,
        status,
        isBotAlly: false,
      });
    }

    const statusOrder: Record<SquadFriendEntry['status'], number> = {
      online: 0,
      'in-squad': 1,
      'in-match': 2,
      offline: 3,
    };
    friends.sort((a, b) => {
      const diff = statusOrder[a.status] - statusOrder[b.status];
      if (diff !== 0) return diff;
      return b.rp - a.rp;
    });

    const incomingRequests: FriendRequestEntry[] = [];
    for (const req of this.incomingReqs.values()) {
      const senderPub = this.requesterProfiles.get(req.fromUid);
      incomingRequests.push({
        requestId: req.requestId,
        fromPlayerId: req.fromPlayerId,
        fromNumericId: req.fromNumericId,
        fromName: senderPub?.username ?? req.fromNumericId,
        fromTier: senderPub?.tier ?? 'Bronze',
        fromRp: typeof senderPub?.rp === 'number' ? senderPub.rp : 200,
        fromLevel: typeof senderPub?.level === 'number' ? senderPub.level : 1,
        fromGender:
          senderPub?.gender === 'male' || senderPub?.gender === 'female' ? senderPub.gender : null,
        fromAvatarId: senderPub?.avatarId ?? DEFAULT_AVATAR_ID,
        createdAt: timestampToMs(req.createdAt),
      });
    }
    incomingRequests.sort((a, b) => b.createdAt - a.createdAt);

    const outgoingRequests: OutgoingFriendRequestEntry[] = [];
    for (const req of this.outgoingReqs.values()) {
      const targetPub = this.outgoingTargetProfiles.get(req.toUid);
      outgoingRequests.push({
        requestId: req.requestId,
        toPlayerId: req.toPlayerId,
        toNumericId: req.toNumericId,
        toName: targetPub?.username ?? req.toNumericId,
        toTier: targetPub?.tier ?? 'Bronze',
        toRp: typeof targetPub?.rp === 'number' ? targetPub.rp : 200,
        toLevel: typeof targetPub?.level === 'number' ? targetPub.level : 1,
        toGender:
          targetPub?.gender === 'male' || targetPub?.gender === 'female' ? targetPub.gender : null,
        toAvatarId: targetPub?.avatarId ?? DEFAULT_AVATAR_ID,
        createdAt: timestampToMs(req.createdAt),
      });
    }
    outgoingRequests.sort((a, b) => b.createdAt - a.createdAt);

    const outgoingTargetIds = outgoingRequests.map((r) => r.toPlayerId);
    this.onUpdateCallback({
      friends,
      incomingRequests,
      outgoingRequests,
      outgoingTargetIds,
    });
  }

  async setPresenceStatus(status: 'online' | 'in-squad' | 'in-match' | 'offline'): Promise<void> {
    if (!this.activeUid || !this.selfProfile) return;
    const uid = this.activeUid;
    const presencePath = `presence/${uid}`;
    const ref = doc(firestoreDb, 'presence', uid);
    try {
      if (!this.presenceCreated) {
        const snap = await getDoc(ref);
        this.presenceCreated = snap.exists();
      }
      if (!this.presenceCreated) {
        await setDoc(ref, {
          uid,
          playerId: this.selfProfile.playerId,
          status,
          platform: this.selfProfile.platform,
          lastSeenAt: serverTimestamp(),
        });
        this.presenceCreated = true;
      } else {
        await updateDoc(ref, {
          status,
          platform: this.selfProfile.platform,
          lastSeenAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, presencePath);
    }
  }

  async lookupFriendById(queryId: string): Promise<FriendLookupResponse> {
    if (!this.activeUid || !this.selfProfile) {
      throw new Error('Sign in with your NEXUS ROYAL ID to search and add cloud friends.');
    }
    const found = await this.playerService.lookupPublicProfileById(queryId);
    if (!found) {
      throw new Error('No player found with that ID.');
    }
    const targetPub = found.docData;
    const targetUid = found.uid;

    let relationStatus: FriendRelationStatus = 'none';
    let pendingRequestId: string | undefined;

    if (targetUid === this.activeUid) {
      relationStatus = 'self';
    } else {
      const friendshipRef = doc(
        firestoreDb,
        'friendships',
        canonicalPairId(this.activeUid, targetUid),
      );
      let friendshipExists = false;
      try {
        friendshipExists = (await getDoc(friendshipRef)).exists();
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, friendshipRef.path);
      }

      if (friendshipExists) {
        relationStatus = 'friends';
      } else {
        const incomingReqId = `${targetUid}_${this.activeUid}`;
        const outgoingReqId = `${this.activeUid}_${targetUid}`;
        let incomingSnapData: FirestoreFriendRequestDoc | null = null;
        let outgoingSnapData: FirestoreFriendRequestDoc | null = null;
        try {
          const [inSnap, outSnap] = await Promise.all([
            getDoc(doc(firestoreDb, 'friendRequests', incomingReqId)),
            getDoc(doc(firestoreDb, 'friendRequests', outgoingReqId)),
          ]);
          incomingSnapData = inSnap.exists() ? (inSnap.data() as FirestoreFriendRequestDoc) : null;
          outgoingSnapData = outSnap.exists() ? (outSnap.data() as FirestoreFriendRequestDoc) : null;
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'friendRequests');
        }

        if (outgoingSnapData?.status === 'pending') {
          relationStatus = 'outgoing_pending';
          pendingRequestId = outgoingReqId;
        } else if (incomingSnapData?.status === 'pending') {
          relationStatus = 'incoming_pending';
          pendingRequestId = incomingReqId;
        }
      }
    }

    return {
      player: {
        playerId: targetPub.playerId,
        numericId: targetPub.numericId,
        name: targetPub.username,
        tier: targetPub.tier,
        rp: targetPub.rp,
        level: targetPub.level,
        gender: targetPub.gender === 'male' || targetPub.gender === 'female' ? targetPub.gender : null,
        avatarId: targetPub.avatarId || DEFAULT_AVATAR_ID,
        bannerId: targetPub.bannerId || 'banner-standard',
      },
      relationStatus,
      pendingRequestId,
    };
  }

  async sendFriendRequest(targetPlayerIdOrNumeric: string): Promise<void> {
    if (!this.activeUid || !this.selfProfile) {
      throw new Error('Sign in with your NEXUS ROYAL ID to send friend requests.');
    }
    const found = await this.playerService.lookupPublicProfileById(targetPlayerIdOrNumeric);
    if (!found) {
      throw new Error('No player found with that ID.');
    }
    const targetUid = found.uid;
    const targetPub = found.docData;
    if (targetUid === this.activeUid) {
      throw new Error('You cannot send a friend request to yourself.');
    }

    const friendshipId = canonicalPairId(this.activeUid, targetUid);
    const friendshipRef = doc(firestoreDb, 'friendships', friendshipId);
    try {
      if ((await getDoc(friendshipRef)).exists()) {
        throw new Error('You are already friends with this player.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already friends')) throw error;
      handleFirestoreError(error, OperationType.GET, friendshipRef.path);
    }

    const reverseReqRef = doc(firestoreDb, 'friendRequests', `${targetUid}_${this.activeUid}`);
    try {
      const reverseSnap = await getDoc(reverseReqRef);
      if (reverseSnap.exists() && (reverseSnap.data() as FirestoreFriendRequestDoc).status === 'pending') {
        throw new Error('This player already sent you a friend request.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already sent')) throw error;
      handleFirestoreError(error, OperationType.GET, reverseReqRef.path);
    }

    const requestId = `${this.activeUid}_${targetUid}`;
    const reqRef = doc(firestoreDb, 'friendRequests', requestId);
    const reqPath = `friendRequests/${requestId}`;
    try {
      const existingSnap = await getDoc(reqRef);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as FirestoreFriendRequestDoc;
        if (existingData.status === 'pending') {
          throw new Error('Friend request already sent.');
        }
        // Clean up prior rejected / orphaned accepted request before creating fresh request
        await deleteDoc(reqRef);
      }

      await setDoc(reqRef, {
        requestId,
        fromUid: this.activeUid,
        toUid: targetUid,
        fromPlayerId: this.selfProfile.playerId,
        fromNumericId: this.selfProfile.numericId,
        toPlayerId: targetPub.playerId,
        toNumericId: targetPub.numericId,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Friend request already sent.') throw error;
      handleFirestoreError(error, OperationType.WRITE, reqPath);
    }
  }

  async respondToFriendRequest(requestId: string, accept: boolean): Promise<void> {
    if (!this.activeUid || !this.selfProfile) {
      throw new Error('Sign in with your NEXUS ROYAL ID to respond to friend requests.');
    }
    const reqRef = doc(firestoreDb, 'friendRequests', requestId);
    const reqPath = `friendRequests/${requestId}`;
    let reqData: FirestoreFriendRequestDoc | null = null;
    try {
      const snap = await getDoc(reqRef);
      if (!snap.exists()) {
        throw new Error('Friend request not found or already handled.');
      }
      reqData = snap.data() as FirestoreFriendRequestDoc;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) throw error;
      handleFirestoreError(error, OperationType.GET, reqPath);
    }

    if (reqData.toUid !== this.activeUid) {
      throw new Error('You are not authorized to respond to this friend request.');
    }
    if (reqData.status !== 'pending') {
      throw new Error('Friend request has already been handled.');
    }

    if (accept) {
      const uidA = reqData.fromUid < reqData.toUid ? reqData.fromUid : reqData.toUid;
      const uidB = reqData.fromUid < reqData.toUid ? reqData.toUid : reqData.fromUid;
      const pidA = reqData.fromUid < reqData.toUid ? reqData.fromPlayerId : reqData.toPlayerId;
      const pidB = reqData.fromUid < reqData.toUid ? reqData.toPlayerId : reqData.fromPlayerId;
      const friendshipId = `${uidA}_${uidB}`;
      const friendshipRef = doc(firestoreDb, 'friendships', friendshipId);

      try {
        const batch = writeBatch(firestoreDb);
        batch.update(reqRef, {
          status: 'accepted',
          updatedAt: serverTimestamp(),
        });
        batch.set(friendshipRef, {
          friendshipId,
          users: [uidA, uidB],
          playerIds: [pidA, pidB],
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `friendships/${friendshipId}`);
      }
    } else {
      try {
        await updateDoc(reqRef, {
          status: 'rejected',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, reqPath);
      }
    }
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    if (!this.activeUid || !this.selfProfile) {
      throw new Error('Sign in with your NEXUS ROYAL ID to manage friend requests.');
    }
    const reqRef = doc(firestoreDb, 'friendRequests', requestId);
    const reqPath = `friendRequests/${requestId}`;
    let reqData: FirestoreFriendRequestDoc | null = null;
    try {
      const snap = await getDoc(reqRef);
      if (!snap.exists()) {
        throw new Error('Friend request not found or already handled.');
      }
      reqData = snap.data() as FirestoreFriendRequestDoc;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) throw error;
      handleFirestoreError(error, OperationType.GET, reqPath);
    }

    if (reqData.fromUid !== this.activeUid) {
      throw new Error('You can only cancel requests you sent.');
    }
    if (reqData.status !== 'pending') {
      throw new Error('Friend request has already been handled.');
    }

    try {
      await deleteDoc(reqRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, reqPath);
    }
  }

  async removeFriend(friendPlayerId: string): Promise<void> {
    if (!this.activeUid || !this.selfProfile) {
      throw new Error('Sign in with your NEXUS ROYAL ID to remove friends.');
    }
    let targetUid: string | null = null;
    for (const [uid, rel] of this.friendships.entries()) {
      if (rel.friendPlayerId === friendPlayerId || uid === friendPlayerId) {
        targetUid = uid;
        break;
      }
    }
    if (!targetUid) {
      const resolved = await this.playerService.resolveUidByIdOrNumeric(friendPlayerId);
      if (resolved) {
        targetUid = resolved.uid;
      }
    }
    if (!targetUid || targetUid === this.activeUid) {
      throw new Error('Friend not found.');
    }

    const friendshipId = canonicalPairId(this.activeUid, targetUid);
    const friendshipRef = doc(firestoreDb, 'friendships', friendshipId);
    try {
      await deleteDoc(friendshipRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, friendshipRef.path);
    }

    // Best-effort cleanup of accepted request docs owned by either user
    for (const reqId of [`${this.activeUid}_${targetUid}`, `${targetUid}_${this.activeUid}`]) {
      try {
        const ref = doc(firestoreDb, 'friendRequests', reqId);
        const snap = await getDoc(ref);
        if (snap.exists() && (snap.data() as FirestoreFriendRequestDoc).fromUid === this.activeUid) {
          await deleteDoc(ref);
        }
      } catch {
        // Non-fatal cleanup
      }
    }
  }

  private stopSyncOnly(): void {
    this.unsubIncoming?.();
    this.unsubIncoming = null;
    this.unsubOutgoing?.();
    this.unsubOutgoing = null;
    this.unsubFriendships?.();
    this.unsubFriendships = null;

    for (const unsub of this.friendProfileUnsubs.values()) unsub();
    this.friendProfileUnsubs.clear();
    for (const unsub of this.friendPresenceUnsubs.values()) unsub();
    this.friendPresenceUnsubs.clear();
    for (const unsub of this.requesterProfileUnsubs.values()) unsub();
    this.requesterProfileUnsubs.clear();
    for (const unsub of this.outgoingTargetProfileUnsubs.values()) unsub();
    this.outgoingTargetProfileUnsubs.clear();

    this.incomingReqs.clear();
    this.outgoingReqs.clear();
    this.friendships.clear();
    this.friendProfiles.clear();
    this.friendPresence.clear();
    this.requesterProfiles.clear();
    this.outgoingTargetProfiles.clear();
  }

  stop(): void {
    this.syncRunId++;
    this.stopSyncOnly();
    this.activeUid = null;
    this.selfProfile = null;
    this.onUpdateCallback = null;
    this.presenceCreated = false;
  }

  dispose(): void {
    this.stop();
  }
}
