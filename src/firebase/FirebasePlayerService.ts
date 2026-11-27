import type { User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import type { PlayerAccountSnapshot } from '../progression/PlayerProfileManager';
import type { StoredRankedCredentials } from '../ranked/RankedApiClient';
import {
  getRankTier,
  type CloudSyncStatePayload,
  type PlatformType,
  type PlayerGender,
  type RankedProfile,
  type RankedVaultState,
  type RankTier,
} from '../ranked/RankedTypes';
import {
  AVATAR_CATALOG,
  BANNER_CATALOG,
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
  isValidAvatarId,
  isValidBannerId,
} from '../shop/AvatarBannerCatalog';
import { getApiUrl } from '../config/RuntimeConfig';
import { ApiRequestError, fetchApiJson, isBackendReachabilityError } from '../network/ApiResponse';
import { firestoreDb, handleFirestoreError, OperationType } from './firebaseApp';

export interface CloudPlayerPrivateDoc {
  uid: string;
  playerId: string;
  numericId: string;
  email: string;
  photoURL?: string;
  vault?: RankedVaultState;
  cloudState?: CloudSyncStatePayload;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CloudPublicProfileDoc {
  uid: string;
  playerId: string;
  numericId: string;
  username: string;
  usernameChanged: boolean;
  avatarId: string;
  bannerId: string;
  avatarCharacterId: string;
  gender: 'male' | 'female' | 'unset';
  platform: PlatformType;
  level: number;
  xp: number;
  rp: number;
  tier: RankTier;
  totalMatches: number;
  wins: number;
  eliminations: number;
  deaths: number;
  totalDamage: number;
  bestKillsInMatch: number;
  rankedMatches: number;
  rankedWins: number;
  rankedKills: number;
  rankedTop3: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const DEFAULT_VAULT_OWNED_IDS = [
  'glider-nexus-standard',
  'emote-amber-flare',
  'emote-dance-floss',
  'shop-gloo-arctic-classic',
  'cloth-top-hoodie-urban',
  'cloth-pants-cargo-charcoal',
  'cloth-shoes-sneakers-white',
  'shop-avatar-recruit',
  'shop-banner-standard',
];

function sanitizeUsername(raw: unknown, fallbackSuffix: string): string {
  const base = typeof raw === 'string' ? raw : '';
  const cleaned = base.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length >= 2) {
    return cleaned.slice(0, 18);
  }
  return `FIGHTER-${fallbackSuffix}`.slice(0, 18);
}

export function validateStrictUsernameInput(raw: string): string {
  const cleaned = raw.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2 || cleaned.length > 18) {
    throw new Error('Username must be 2 to 18 characters long.');
  }
  if (!/^[\p{L}\p{N} _.-]{2,18}$/u.test(cleaned)) {
    throw new Error('Username may only contain letters, numbers, spaces, "_", "-", or ".".');
  }
  return cleaned;
}

export function toUsernameDocKey(username: string): string {
  const lower = username.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const bytes = new TextEncoder().encode(lower);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `u_${hex}`.slice(0, 128);
}

function clampInt(val: unknown, min: number, max: number, fallback = min): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(val)));
}

function sanitizePlatform(raw: unknown): PlatformType {
  if (raw === 'android' || raw === 'ios' || raw === 'tablet' || raw === 'pc') {
    return raw;
  }
  return 'pc';
}

function toCloudGender(raw: unknown): 'male' | 'female' | 'unset' {
  if (raw === 'male' || raw === 'female') return raw;
  return 'unset';
}

function fromCloudGender(raw: unknown): PlayerGender | null {
  if (raw === 'male' || raw === 'female') return raw;
  return null;
}

function sanitizePlainObject(raw: unknown, maxKeys: number): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || k.length > 64 || v === undefined) continue;
    out[k] = v;
    count++;
    if (count >= maxKeys) break;
  }
  return out;
}

export function sanitizeCloudStateForFirestore(
  raw?: CloudSyncStatePayload | null,
): CloudSyncStatePayload {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned: CloudSyncStatePayload = {};

  const settings = sanitizePlainObject(raw.settings, 64);
  if (settings && Object.keys(settings).length > 0) {
    cleaned.settings = settings;
  }

  if (raw.controlSettings && typeof raw.controlSettings === 'object') {
    const bindings = sanitizePlainObject(raw.controlSettings.bindings, 64) as
      | Record<string, string>
      | undefined;
    const touchLayouts = sanitizePlainObject(raw.controlSettings.touchLayouts, 32);
    cleaned.controlSettings = {
      ...(bindings ? { bindings } : {}),
      ...(touchLayouts ? { touchLayouts } : {}),
    };
  }

  if (typeof raw.selectedCharacterId === 'string' && raw.selectedCharacterId.trim()) {
    cleaned.selectedCharacterId = raw.selectedCharacterId.trim().slice(0, 32);
  }

  if (raw.customization && typeof raw.customization === 'object') {
    const customObj = sanitizePlainObject(raw.customization, 32);
    if (customObj && typeof customObj.skinId === 'string') {
      cleaned.customization = customObj as unknown as CloudSyncStatePayload['customization'];
    }
  }

  if (raw.charOverrides && typeof raw.charOverrides === 'object') {
    const overrides = sanitizePlainObject(raw.charOverrides, 32);
    if (overrides && Object.keys(overrides).length > 0) {
      cleaned.charOverrides = overrides as CloudSyncStatePayload['charOverrides'];
    }
  }

  if (raw.checkpoints && typeof raw.checkpoints === 'object') {
    const checkpoints = sanitizePlainObject(raw.checkpoints, 16);
    if (checkpoints && Object.keys(checkpoints).length > 0) {
      cleaned.checkpoints = checkpoints as CloudSyncStatePayload['checkpoints'];
    }
  }

  return cleaned;
}

export function sanitizeVaultForFirestore(raw?: Partial<RankedVaultState> | null): RankedVaultState {
  const ownedSet = new Set<string>(DEFAULT_VAULT_OWNED_IDS);
  if (raw && Array.isArray(raw.ownedIds)) {
    for (const id of raw.ownedIds) {
      if (typeof id === 'string') {
        const cleaned = id.trim().slice(0, 64);
        if (cleaned) ownedSet.add(cleaned);
      }
      if (ownedSet.size >= 500) break;
    }
  }

  const equippedWeaponSkins: Record<string, string> = {};
  if (raw?.equippedWeaponSkins && typeof raw.equippedWeaponSkins === 'object') {
    let count = 0;
    for (const [k, v] of Object.entries(raw.equippedWeaponSkins)) {
      if (typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim()) {
        equippedWeaponSkins[k.trim().slice(0, 32)] = v.trim().slice(0, 64);
        count++;
        if (count >= 64) break;
      }
    }
  }

  const equippedArmoryIds: Record<string, string> = {};
  if (raw?.equippedArmoryIds && typeof raw.equippedArmoryIds === 'object') {
    let count = 0;
    for (const [k, v] of Object.entries(raw.equippedArmoryIds)) {
      if (typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim()) {
        equippedArmoryIds[k.trim().slice(0, 32)] = v.trim().slice(0, 64);
        count++;
        if (count >= 32) break;
      }
    }
  }

  const wheel: (string | null)[] = new Array(8).fill(null);
  if (Array.isArray(raw?.equippedEmoteWheel)) {
    for (let i = 0; i < 8; i++) {
      const slot = raw.equippedEmoteWheel[i];
      wheel[i] = typeof slot === 'string' && slot.trim() ? slot.trim().slice(0, 64) : null;
    }
  } else {
    wheel[0] = 'dance-floss';
  }

  const isAvatarOwned = (avatarId: unknown): avatarId is string => {
    if (!isValidAvatarId(avatarId)) return false;
    const def = AVATAR_CATALOG.find((a) => a.id === avatarId);
    return Boolean(def && (def.defaultOwned || ownedSet.has(def.shopItemId)));
  };
  const isBannerOwned = (bannerId: unknown): bannerId is string => {
    if (!isValidBannerId(bannerId)) return false;
    const def = BANNER_CATALOG.find((b) => b.id === bannerId);
    return Boolean(def && (def.defaultOwned || ownedSet.has(def.shopItemId)));
  };

  return {
    credits: clampInt(raw?.credits, 0, 100000000, 2000),
    ownedIds: Array.from(ownedSet),
    equippedOutfitId:
      typeof raw?.equippedOutfitId === 'string' && raw.equippedOutfitId.trim()
        ? raw.equippedOutfitId.trim().slice(0, 64)
        : null,
    equippedGliderId:
      typeof raw?.equippedGliderId === 'string' && raw.equippedGliderId.trim()
        ? raw.equippedGliderId.trim().slice(0, 64)
        : 'glider-nexus-standard',
    equippedEmoteId:
      typeof raw?.equippedEmoteId === 'string' && raw.equippedEmoteId.trim()
        ? raw.equippedEmoteId.trim().slice(0, 64)
        : 'emote-amber-flare',
    equippedGlooSkinId:
      typeof raw?.equippedGlooSkinId === 'string' && raw.equippedGlooSkinId.trim()
        ? raw.equippedGlooSkinId.trim().slice(0, 64)
        : 'shop-gloo-arctic-classic',
    equippedAvatarId:
      raw && isAvatarOwned(raw.equippedAvatarId) ? raw.equippedAvatarId : DEFAULT_AVATAR_ID,
    equippedBannerId:
      raw && isBannerOwned(raw.equippedBannerId) ? raw.equippedBannerId : DEFAULT_BANNER_ID,
    equippedWeaponSkins,
    equippedEmoteWheel: wheel,
    equippedArmoryIds,
  };
}

export function cloudPublicToRankedProfile(
  pub: CloudPublicProfileDoc,
  privateVault?: RankedVaultState,
): RankedProfile {
  const level = clampInt(pub.level, 1, 300, 1);
  return {
    playerId: pub.playerId,
    numericId: pub.numericId,
    name: pub.username,
    usernameChanged: Boolean(pub.usernameChanged),
    platform: sanitizePlatform(pub.platform),
    gender: fromCloudGender(pub.gender),
    rp: clampInt(pub.rp, 0, 100000, 200),
    tier: pub.tier || getRankTier(pub.rp ?? 200),
    wins: clampInt(pub.rankedWins, 0, 1000000, 0),
    kills: clampInt(pub.rankedKills, 0, 10000000, 0),
    deaths: clampInt(pub.deaths, 0, 1000000, 0),
    top3: clampInt(pub.rankedTop3, 0, 1000000, 0),
    matchesPlayed: clampInt(pub.rankedMatches, 0, 1000000, 0),
    totalDamage: clampInt(pub.totalDamage, 0, 1000000000, 0),
    bestKillsInMatch: clampInt(pub.bestKillsInMatch, 0, 200, 0),
    level,
    xp: clampInt(pub.xp, 0, 1000000, 0),
    nextLevelXp: 100 + (level - 1) * 35,
    avatarCharacterId: pub.avatarCharacterId || 'char-01',
    equippedAvatarId: pub.avatarId || DEFAULT_AVATAR_ID,
    equippedBannerId: pub.bannerId || DEFAULT_BANNER_ID,
    vault: privateVault,
    careerMatches: clampInt(pub.totalMatches, 0, 1000000, 0),
    careerWins: clampInt(pub.wins, 0, 1000000, 0),
    careerKills: clampInt(pub.eliminations, 0, 10000000, 0),
    careerDeaths: clampInt(pub.deaths, 0, 1000000, 0),
    careerDamage: clampInt(pub.totalDamage, 0, 1000000000, 0),
    careerBestKills: clampInt(pub.bestKillsInMatch, 0, 200, 0),
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export interface FirebaseSessionApiResponse {
  uid: string;
  email: string;
  isDeveloper?: boolean;
  profile: RankedProfile;
  secretToken: string;
  cloudState?: CloudSyncStatePayload;
  created: boolean;
  error?: string;
  code?: string;
}

export interface InitializedAuthenticatedAccount {
  uid: string;
  isDeveloper: boolean;
  profile: RankedProfile;
  secretToken: string;
  vault: RankedVaultState;
  publicDoc: CloudPublicProfileDoc;
  cloudState: CloudSyncStatePayload;
  hydratedFromFirestoreOffline?: boolean;
}

export interface FirebasePlayerServiceDeps {
  readPrivateDoc?: (uid: string) => Promise<CloudPlayerPrivateDoc | null>;
  readPublicDoc?: (uid: string) => Promise<CloudPublicProfileDoc | null>;
  fetchSessionApi?: (
    url: string,
    init?: RequestInit,
    fallbackErrorMessage?: string,
  ) => Promise<{ res: Response; data: FirebaseSessionApiResponse }>;
  fetchSyncCloudApi?: (
    url: string,
    init?: RequestInit,
  ) => Promise<{ res: Response; data: { isDeveloper?: boolean; profile?: RankedProfile } }>;
  ensureIndexEntries?: (uid: string, playerId: string, numericId: string) => Promise<void>;
  claimUsername?: (uid: string, playerId: string, username: string) => Promise<void>;
  writePrivateDoc?: (
    uid: string,
    existingPrivate: CloudPlayerPrivateDoc | null,
    createPayload: DocumentData,
    updatePayload: DocumentData,
  ) => Promise<void>;
  writePublicDoc?: (
    uid: string,
    existingPublic: CloudPublicProfileDoc | null,
    createPayload: DocumentData,
    updatePayload: DocumentData,
  ) => Promise<void>;
}

export function hasValidExistingFirestoreAccount(
  uid: string,
  existingPrivate: CloudPlayerPrivateDoc | null,
  existingPublic: CloudPublicProfileDoc | null,
): existingPrivate is CloudPlayerPrivateDoc & {
  existingPublic?: never;
} {
  if (!existingPrivate || !existingPublic) return false;
  const privPlayerId =
    typeof existingPrivate.playerId === 'string' ? existingPrivate.playerId.trim() : '';
  const privNumericId =
    typeof existingPrivate.numericId === 'string' ? existingPrivate.numericId.trim() : '';
  const pubPlayerId =
    typeof existingPublic.playerId === 'string' ? existingPublic.playerId.trim() : '';
  const pubNumericId =
    typeof existingPublic.numericId === 'string' ? existingPublic.numericId.trim() : '';
  if (!privPlayerId || !privNumericId || !pubPlayerId || !pubNumericId) {
    return false;
  }
  if (privPlayerId !== pubPlayerId || privNumericId !== pubNumericId) {
    return false;
  }
  if (existingPrivate.uid && existingPrivate.uid !== uid) {
    return false;
  }
  if (existingPublic.uid && existingPublic.uid !== uid) {
    return false;
  }
  if (typeof existingPublic.username !== 'string' || existingPublic.username.trim().length < 2) {
    return false;
  }
  return true;
}

export function buildOfflineAccountResultFromFirestore(input: {
  uid: string;
  existingPrivate: CloudPlayerPrivateDoc;
  existingPublic: CloudPublicProfileDoc;
  platform: PlatformType;
}): InitializedAuthenticatedAccount {
  const { uid, existingPrivate, existingPublic, platform } = input;
  const vaultSource: Partial<RankedVaultState> = {
    ...(existingPrivate.vault ?? {}),
    equippedAvatarId: existingPrivate.vault?.equippedAvatarId || existingPublic.avatarId,
    equippedBannerId: existingPrivate.vault?.equippedBannerId || existingPublic.bannerId,
  };
  const effectiveVault = sanitizeVaultForFirestore(vaultSource);
  const effectiveCloudState = sanitizeCloudStateForFirestore(existingPrivate.cloudState);

  const normalizedPublicDoc: CloudPublicProfileDoc = {
    ...existingPublic,
    uid,
    playerId: existingPublic.playerId.trim(),
    numericId: existingPublic.numericId.trim(),
    username: existingPublic.username.trim().slice(0, 18),
    usernameChanged: Boolean(existingPublic.usernameChanged),
    avatarId: existingPublic.avatarId || effectiveVault.equippedAvatarId || DEFAULT_AVATAR_ID,
    bannerId: existingPublic.bannerId || effectiveVault.equippedBannerId || DEFAULT_BANNER_ID,
    avatarCharacterId: existingPublic.avatarCharacterId || 'char-01',
    gender:
      existingPublic.gender === 'male' || existingPublic.gender === 'female'
        ? existingPublic.gender
        : 'unset',
    platform: sanitizePlatform(existingPublic.platform || platform),
    level: clampInt(existingPublic.level, 1, 300, 1),
    xp: clampInt(existingPublic.xp, 0, 1000000, 0),
    rp: clampInt(existingPublic.rp, 0, 100000, 200),
    tier: existingPublic.tier || getRankTier(clampInt(existingPublic.rp, 0, 100000, 200)),
    totalMatches: clampInt(existingPublic.totalMatches, 0, 1000000, 0),
    wins: clampInt(existingPublic.wins, 0, 1000000, 0),
    eliminations: clampInt(existingPublic.eliminations, 0, 10000000, 0),
    deaths: clampInt(existingPublic.deaths, 0, 1000000, 0),
    totalDamage: clampInt(existingPublic.totalDamage, 0, 1000000000, 0),
    bestKillsInMatch: clampInt(existingPublic.bestKillsInMatch, 0, 200, 0),
    rankedMatches: clampInt(existingPublic.rankedMatches, 0, 1000000, 0),
    rankedWins: clampInt(existingPublic.rankedWins, 0, 1000000, 0),
    rankedKills: clampInt(existingPublic.rankedKills, 0, 10000000, 0),
    rankedTop3: clampInt(existingPublic.rankedTop3, 0, 1000000, 0),
  };

  const finalProfile = cloudPublicToRankedProfile(normalizedPublicDoc, effectiveVault);
  delete finalProfile.isDeveloper;

  return {
    uid,
    isDeveloper: false,
    profile: finalProfile,
    secretToken: '',
    vault: effectiveVault,
    publicDoc: normalizedPublicDoc,
    cloudState: effectiveCloudState,
    hydratedFromFirestoreOffline: true,
  };
}

export class FirebasePlayerService {
  constructor(private readonly deps: FirebasePlayerServiceDeps = {}) {}

  async readPrivateDoc(uid: string): Promise<CloudPlayerPrivateDoc | null> {
    if (this.deps.readPrivateDoc) {
      return this.deps.readPrivateDoc(uid);
    }
    const path = `players/${uid}`;
    try {
      const snap = await getDoc(doc(firestoreDb, 'players', uid));
      return snap.exists() ? (snap.data() as CloudPlayerPrivateDoc) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async readPublicDoc(uid: string): Promise<CloudPublicProfileDoc | null> {
    if (this.deps.readPublicDoc) {
      return this.deps.readPublicDoc(uid);
    }
    const path = `publicProfiles/${uid}`;
    try {
      const snap = await getDoc(doc(firestoreDb, 'publicProfiles', uid));
      return snap.exists() ? (snap.data() as CloudPublicProfileDoc) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async resolveUidByIdOrNumeric(
    idOrNumericId: string,
  ): Promise<{ uid: string; playerId: string; numericId: string } | null> {
    const rawTrimmed = idOrNumericId.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rawTrimmed || rawTrimmed.length > 64) {
      return null;
    }

    let cleaned = rawTrimmed;
    const nxMatch = /^nx-(\d{8,12})$/i.exec(cleaned);
    if (nxMatch) {
      cleaned = nxMatch[1];
    }

    if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
      const indexPath = `playerIdIndex/${cleaned}`;
      try {
        const snap = await getDoc(doc(firestoreDb, 'playerIdIndex', cleaned));
        if (snap.exists()) {
          const data = snap.data() as { uid?: string; playerId?: string; numericId?: string };
          if (data.uid && data.playerId && data.numericId) {
            return {
              uid: data.uid,
              playerId: data.playerId,
              numericId: data.numericId,
            };
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, indexPath);
      }
    }

    if (rawTrimmed.length >= 2 && rawTrimmed.length <= 18 && /^[\p{L}\p{N} _.-]{2,18}$/u.test(rawTrimmed)) {
      const usernameKey = toUsernameDocKey(rawTrimmed);
      const usernamePath = `usernames/${usernameKey}`;
      try {
        const uSnap = await getDoc(doc(firestoreDb, 'usernames', usernameKey));
        if (uSnap.exists()) {
          const uData = uSnap.data() as { uid?: string; playerId?: string };
          if (uData.uid) {
            const pub = await this.readPublicDoc(uData.uid);
            if (pub) {
              return {
                uid: uData.uid,
                playerId: pub.playerId || uData.playerId || '',
                numericId: pub.numericId || pub.playerId || '',
              };
            }
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, usernamePath);
      }
    }

    return null;
  }

  async lookupPublicProfileById(idOrNumericId: string): Promise<{
    uid: string;
    docData: CloudPublicProfileDoc;
    rankedProfile: RankedProfile;
  } | null> {
    const resolved = await this.resolveUidByIdOrNumeric(idOrNumericId);
    if (!resolved) return null;
    const pub = await this.readPublicDoc(resolved.uid);
    if (!pub) return null;
    return {
      uid: resolved.uid,
      docData: pub,
      rankedProfile: cloudPublicToRankedProfile(pub),
    };
  }

  private async ensurePlayerIdIndexEntries(
    uid: string,
    playerId: string,
    numericId: string,
  ): Promise<void> {
    const keys = Array.from(new Set([numericId, playerId]));
    for (const idKey of keys) {
      const indexPath = `playerIdIndex/${idKey}`;
      try {
        const ref = doc(firestoreDb, 'playerIdIndex', idKey);
        const existing = await getDoc(ref);
        if (!existing.exists()) {
          await setDoc(ref, {
            idKey,
            uid,
            playerId,
            numericId,
            createdAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, indexPath);
      }
    }
  }

  async claimOrUpdateUsernameDoc(
    uid: string,
    playerId: string,
    newUsername: string,
    previousUsername?: string | null,
  ): Promise<void> {
    const clean = validateStrictUsernameInput(newUsername);
    const key = toUsernameDocKey(clean);
    const usernameLower = clean.toLowerCase();
    const ref = doc(firestoreDb, 'usernames', key);
    const path = `usernames/${key}`;

    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as { uid?: string; username?: string };
        if (existingData.uid && existingData.uid !== uid) {
          throw new Error('This username is already taken by another player.');
        }
        if (existingData.username !== clean) {
          await updateDoc(ref, {
            usernameLower,
            username: clean,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        await setDoc(ref, {
          usernameKey: key,
          usernameLower,
          username: clean,
          uid,
          playerId,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already taken')) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }

    if (previousUsername) {
      const oldKey = toUsernameDocKey(previousUsername);
      if (oldKey !== key) {
        try {
          const oldRef = doc(firestoreDb, 'usernames', oldKey);
          const oldSnap = await getDoc(oldRef);
          if (oldSnap.exists() && (oldSnap.data() as { uid?: string }).uid === uid) {
            await deleteDoc(oldRef);
          }
        } catch {
          // Non-fatal cleanup
        }
      }
    }
  }

  async updateUsernameOnCloud(
    uid: string,
    playerId: string,
    newUsername: string,
    previousUsername?: string | null,
  ): Promise<string> {
    const clean = validateStrictUsernameInput(newUsername);
    await this.claimOrUpdateUsernameDoc(uid, playerId, clean, previousUsername);
    const publicPath = `publicProfiles/${uid}`;
    try {
      const publicRef = doc(firestoreDb, 'publicProfiles', uid);
      const snap = await getDoc(publicRef);
      if (snap.exists()) {
        await updateDoc(publicRef, {
          username: clean,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, publicPath);
    }
    return clean;
  }

  async initializeAuthenticatedAccount(input: {
    user: User;
    platform: PlatformType;
    guestCredentials: StoredRankedCredentials | null;
    fallbackVault: RankedVaultState;
    fallbackAccountSnapshot: PlayerAccountSnapshot;
    fallbackCloudState?: CloudSyncStatePayload;
  }): Promise<InitializedAuthenticatedAccount> {
    const {
      user,
      platform,
      guestCredentials,
      fallbackVault,
      fallbackAccountSnapshot,
      fallbackCloudState,
    } = input;
    const uid = user.uid;
    const idToken = await user.getIdToken();

    const [existingPrivate, existingPublic] = await Promise.all([
      this.readPrivateDoc(uid),
      this.readPublicDoc(uid),
    ]);

    const existingCloudIds =
      existingPublic?.playerId && existingPublic?.numericId
        ? { playerId: existingPublic.playerId, numericId: existingPublic.numericId }
        : existingPrivate?.playerId && existingPrivate?.numericId
          ? { playerId: existingPrivate.playerId, numericId: existingPrivate.numericId }
          : undefined;

    // 1. Resolve permanent collision-free Player ID + Numeric ID on trusted backend when reachable
    let sessionData: FirebaseSessionApiResponse | null = null;
    try {
      const fetchSession = this.deps.fetchSessionApi ?? fetchApiJson<FirebaseSessionApiResponse>;
      const { res, data } = await fetchSession(
        getApiUrl('/api/firebase/session'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            platform,
            displayName: user.displayName || fallbackAccountSnapshot.username,
            existingCloudIds,
            guestLink: !existingCloudIds && guestCredentials ? guestCredentials : undefined,
          }),
        },
        'Failed to initialize authenticated session.',
      );

      if (!res.ok || !data.profile) {
        throw new ApiRequestError(
          data.error || `Failed to initialize authenticated session (${res.status})`,
          {
            status: res.status,
            code: data.code,
            isNetworkOrGatewayError: res.status >= 500,
          },
        );
      }
      sessionData = data;
    } catch (err) {
      if (!isBackendReachabilityError(err)) {
        throw err;
      }

      if (hasValidExistingFirestoreAccount(uid, existingPrivate, existingPublic)) {
        return buildOfflineAccountResultFromFirestore({
          uid,
          existingPrivate: existingPrivate!,
          existingPublic: existingPublic!,
          platform,
        });
      }

      throw new ApiRequestError(
        'Your NEXUS ROYALE Firestore profile is missing or incomplete while the backend server is unavailable. Account recovery or server migration is required before signing in.',
        {
          status: 503,
          code: 'FIRESTORE_PROFILE_MISSING',
          isNetworkOrGatewayError: true,
        },
      );
    }

    const isDeveloper = Boolean(sessionData.isDeveloper && sessionData.profile?.isDeveloper === true);
    const permanentPlayerId = sessionData.profile.playerId;
    const permanentNumericId = sessionData.profile.numericId || permanentPlayerId;
    const email = (user.email || sessionData.email || `${uid}@users.noreply.local`).slice(0, 254);

    // 2. Ensure immutable Player ID index records exist in Firestore
    if (this.deps.ensureIndexEntries) {
      await this.deps.ensureIndexEntries(uid, permanentPlayerId, permanentNumericId);
    } else {
      await this.ensurePlayerIdIndexEntries(uid, permanentPlayerId, permanentNumericId);
    }

    // 3. Reconcile private doc (/players/{uid}), vault, and cloudState
    const effectiveVault = isDeveloper
      ? sanitizeVaultForFirestore({
          ...(sessionData.profile.vault ?? fallbackVault),
          ...(existingPrivate?.vault
            ? {
                equippedOutfitId: existingPrivate.vault.equippedOutfitId ?? null,
                equippedGliderId: existingPrivate.vault.equippedGliderId,
                equippedEmoteId: existingPrivate.vault.equippedEmoteId,
                equippedGlooSkinId: existingPrivate.vault.equippedGlooSkinId,
                equippedAvatarId: existingPrivate.vault.equippedAvatarId,
                equippedBannerId: existingPrivate.vault.equippedBannerId,
                equippedWeaponSkins: existingPrivate.vault.equippedWeaponSkins,
                equippedEmoteWheel: existingPrivate.vault.equippedEmoteWheel,
                equippedArmoryIds: existingPrivate.vault.equippedArmoryIds,
              }
            : {}),
          ownedIds: Array.from(
            new Set([
              ...(existingPrivate?.vault?.ownedIds ?? []),
              ...(sessionData.profile.vault?.ownedIds ?? []),
            ]),
          ),
          credits: 1_000_000,
        })
      : existingPrivate?.vault
        ? sanitizeVaultForFirestore(existingPrivate.vault)
        : sanitizeVaultForFirestore(sessionData.profile.vault ?? fallbackVault);

    const effectiveCloudState = sanitizeCloudStateForFirestore(
      existingPrivate?.cloudState && Object.keys(existingPrivate.cloudState).length > 0
        ? existingPrivate.cloudState
        : sessionData.cloudState && Object.keys(sessionData.cloudState).length > 0
          ? sessionData.cloudState
          : fallbackCloudState,
    );

    const privatePayload: DocumentData = {
      uid,
      playerId: permanentPlayerId,
      numericId: permanentNumericId,
      email,
      ...(user.photoURL ? { photoURL: user.photoURL.slice(0, 512) } : {}),
      vault: effectiveVault,
      ...(Object.keys(effectiveCloudState).length > 0 ? { cloudState: effectiveCloudState } : {}),
      updatedAt: serverTimestamp(),
    };
    const privateUpdatePayload: DocumentData = {
      email,
      ...(user.photoURL ? { photoURL: user.photoURL.slice(0, 512) } : {}),
      vault: effectiveVault,
      ...(Object.keys(effectiveCloudState).length > 0 ? { cloudState: effectiveCloudState } : {}),
      updatedAt: serverTimestamp(),
    };

    const privatePath = `players/${uid}`;
    try {
      if (this.deps.writePrivateDoc) {
        await this.deps.writePrivateDoc(uid, existingPrivate, privatePayload, privateUpdatePayload);
      } else {
        const privateRef = doc(firestoreDb, 'players', uid);
        if (!existingPrivate) {
          await setDoc(privateRef, {
            ...privatePayload,
            createdAt: serverTimestamp(),
          });
        } else {
          await updateDoc(privateRef, privateUpdatePayload);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }

    // 4. Reconcile public profile doc (/publicProfiles/{uid}) — ZERO PII
    const suffix = permanentPlayerId.slice(-4).toUpperCase();
    const serverProf = sessionData.profile;
    const cloudLevel = existingPublic ? clampInt(existingPublic.level, 1, 300, 1) : 1;
    const serverLevel = clampInt(serverProf.level, 1, 300, 1);
    const mergedLevel = isDeveloper ? 100 : Math.max(cloudLevel, serverLevel);
    const mergedXp = isDeveloper
      ? 0
      : cloudLevel > serverLevel
        ? clampInt(existingPublic?.xp, 0, 1000000, 0)
        : serverLevel > cloudLevel
          ? clampInt(serverProf.xp, 0, 1000000, 0)
          : Math.max(
              clampInt(existingPublic?.xp, 0, 1000000, 0),
              clampInt(serverProf.xp, 0, 1000000, 0),
            );
    const mergedRp = Math.max(
      clampInt(existingPublic?.rp, 0, 100000, 200),
      clampInt(serverProf.rp, 0, 100000, 200),
    );
    const preferredUsername =
      existingPublic?.username ||
      (user.displayName && user.displayName.trim().length >= 2
        ? user.displayName
        : serverProf.name);
    const finalUsername = sanitizeUsername(preferredUsername, suffix);

    // Best-effort reservation in /usernames/{usernameKey}
    try {
      if (this.deps.claimUsername) {
        await this.deps.claimUsername(uid, permanentPlayerId, finalUsername);
      } else {
        await this.claimOrUpdateUsernameDoc(uid, permanentPlayerId, finalUsername);
      }
    } catch {
      // Non-fatal during session hydration
    }

    const publicPayload: Omit<CloudPublicProfileDoc, 'createdAt' | 'updatedAt'> = {
      uid,
      playerId: permanentPlayerId,
      numericId: permanentNumericId,
      username: finalUsername,
      usernameChanged: Boolean(existingPublic?.usernameChanged || serverProf.usernameChanged),
      avatarId: effectiveVault.equippedAvatarId || DEFAULT_AVATAR_ID,
      bannerId: effectiveVault.equippedBannerId || DEFAULT_BANNER_ID,
      avatarCharacterId: (
        existingPublic?.avatarCharacterId ||
        serverProf.avatarCharacterId ||
        fallbackAccountSnapshot.avatarCharacterId ||
        'char-01'
      ).slice(0, 32),
      gender:
        existingPublic?.gender === 'male' || existingPublic?.gender === 'female'
          ? existingPublic.gender
          : toCloudGender(serverProf.gender),
      platform: sanitizePlatform(platform),
      level: mergedLevel,
      xp: mergedXp,
      rp: mergedRp,
      tier: getRankTier(mergedRp),
      totalMatches: Math.max(
        clampInt(existingPublic?.totalMatches, 0, 1000000, 0),
        clampInt(serverProf.careerMatches ?? serverProf.matchesPlayed, 0, 1000000, 0),
      ),
      wins: Math.max(
        clampInt(existingPublic?.wins, 0, 1000000, 0),
        clampInt(serverProf.careerWins ?? serverProf.wins, 0, 1000000, 0),
      ),
      eliminations: Math.max(
        clampInt(existingPublic?.eliminations, 0, 10000000, 0),
        clampInt(serverProf.careerKills ?? serverProf.kills, 0, 10000000, 0),
      ),
      deaths: Math.max(
        clampInt(existingPublic?.deaths, 0, 1000000, 0),
        clampInt(serverProf.careerDeaths ?? serverProf.deaths, 0, 1000000, 0),
      ),
      totalDamage: Math.max(
        clampInt(existingPublic?.totalDamage, 0, 1000000000, 0),
        clampInt(serverProf.careerDamage ?? serverProf.totalDamage, 0, 1000000000, 0),
      ),
      bestKillsInMatch: Math.max(
        clampInt(existingPublic?.bestKillsInMatch, 0, 200, 0),
        clampInt(serverProf.careerBestKills ?? serverProf.bestKillsInMatch, 0, 200, 0),
      ),
      rankedMatches: Math.max(
        clampInt(existingPublic?.rankedMatches, 0, 1000000, 0),
        clampInt(serverProf.matchesPlayed, 0, 1000000, 0),
      ),
      rankedWins: Math.max(
        clampInt(existingPublic?.rankedWins, 0, 1000000, 0),
        clampInt(serverProf.wins, 0, 1000000, 0),
      ),
      rankedKills: Math.max(
        clampInt(existingPublic?.rankedKills, 0, 10000000, 0),
        clampInt(serverProf.kills, 0, 10000000, 0),
      ),
      rankedTop3: Math.max(
        clampInt(existingPublic?.rankedTop3, 0, 1000000, 0),
        clampInt(serverProf.top3, 0, 1000000, 0),
      ),
    };
    const publicUpdatePayload: DocumentData = {
      username: publicPayload.username,
      usernameChanged: publicPayload.usernameChanged,
      avatarId: publicPayload.avatarId,
      bannerId: publicPayload.bannerId,
      avatarCharacterId: publicPayload.avatarCharacterId,
      gender: publicPayload.gender,
      platform: publicPayload.platform,
      level: publicPayload.level,
      xp: publicPayload.xp,
      rp: publicPayload.rp,
      tier: publicPayload.tier,
      totalMatches: publicPayload.totalMatches,
      wins: publicPayload.wins,
      eliminations: publicPayload.eliminations,
      deaths: publicPayload.deaths,
      totalDamage: publicPayload.totalDamage,
      bestKillsInMatch: publicPayload.bestKillsInMatch,
      rankedMatches: publicPayload.rankedMatches,
      rankedWins: publicPayload.rankedWins,
      rankedKills: publicPayload.rankedKills,
      rankedTop3: publicPayload.rankedTop3,
      updatedAt: serverTimestamp(),
    };

    const publicPath = `publicProfiles/${uid}`;
    try {
      if (this.deps.writePublicDoc) {
        await this.deps.writePublicDoc(uid, existingPublic, publicPayload, publicUpdatePayload);
      } else {
        const publicRef = doc(firestoreDb, 'publicProfiles', uid);
        if (!existingPublic) {
          await setDoc(publicRef, {
            ...publicPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(publicRef, publicUpdatePayload);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, publicPath);
    }

    // 5. Mirror reconciled cloud profile back to Express RankedStore so WebSocket / Ranked matches stay consistent
    let finalProfile = cloudPublicToRankedProfile(publicPayload as CloudPublicProfileDoc, effectiveVault);
    try {
      const fetchSyncCloud =
        this.deps.fetchSyncCloudApi ??
        fetchApiJson<{
          isDeveloper?: boolean;
          profile?: RankedProfile;
        }>;
      const { res: syncRes, data: synced } = await fetchSyncCloud(getApiUrl('/api/firebase/sync-cloud'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          username: publicPayload.username,
          usernameChanged: publicPayload.usernameChanged,
          gender: fromCloudGender(publicPayload.gender),
          platform: publicPayload.platform,
          level: publicPayload.level,
          xp: publicPayload.xp,
          rp: publicPayload.rp,
          avatarCharacterId: publicPayload.avatarCharacterId,
          totalMatches: publicPayload.totalMatches,
          wins: publicPayload.wins,
          eliminations: publicPayload.eliminations,
          deaths: publicPayload.deaths,
          totalDamage: publicPayload.totalDamage,
          bestKillsInMatch: publicPayload.bestKillsInMatch,
          rankedMatches: publicPayload.rankedMatches,
          rankedWins: publicPayload.rankedWins,
          rankedKills: publicPayload.rankedKills,
          rankedTop3: publicPayload.rankedTop3,
          vault: effectiveVault,
          cloudState: effectiveCloudState,
        }),
      });
      if (syncRes.ok && synced.profile) {
        finalProfile = {
          ...synced.profile,
          vault: effectiveVault,
          ...(isDeveloper && synced.isDeveloper ? { isDeveloper: true } : {}),
        };
      }
    } catch {
      // Non-fatal if Express mirror fails transiently; Firestore holds source of truth
    }

    if (isDeveloper) {
      finalProfile = { ...finalProfile, isDeveloper: true };
    } else {
      delete finalProfile.isDeveloper;
    }

    return {
      uid,
      isDeveloper,
      profile: finalProfile,
      secretToken: sessionData.secretToken,
      vault: effectiveVault,
      publicDoc: publicPayload as CloudPublicProfileDoc,
      cloudState: effectiveCloudState,
    };
  }

  async syncPublicProfileSnapshot(
    uid: string,
    snapshot: PlayerAccountSnapshot,
    cosmetics: { avatarId: string; bannerId: string },
  ): Promise<void> {
    const publicPath = `publicProfiles/${uid}`;
    try {
      const publicRef = doc(firestoreDb, 'publicProfiles', uid);
      const existing = await getDoc(publicRef);
      if (!existing.exists()) return;
      const prev = existing.data() as CloudPublicProfileDoc;
      const safeUsername = sanitizeUsername(snapshot.username, prev.playerId.slice(-4).toUpperCase());
      await updateDoc(publicRef, {
        username: safeUsername,
        usernameChanged: Boolean(prev.usernameChanged || snapshot.usernameChanged),
        avatarId: isValidAvatarId(cosmetics.avatarId) ? cosmetics.avatarId : DEFAULT_AVATAR_ID,
        bannerId: isValidBannerId(cosmetics.bannerId) ? cosmetics.bannerId : DEFAULT_BANNER_ID,
        avatarCharacterId: (snapshot.avatarCharacterId || 'char-01').slice(0, 32),
        gender: toCloudGender(snapshot.gender),
        platform: sanitizePlatform(snapshot.platform),
        level: clampInt(snapshot.level, 1, 300, 1),
        xp: clampInt(snapshot.xp, 0, 1000000, 0),
        rp: clampInt(snapshot.rp, 0, 100000, 200),
        tier: snapshot.tier || getRankTier(snapshot.rp),
        totalMatches: clampInt(snapshot.totalMatches, 0, 1000000, 0),
        wins: clampInt(snapshot.wins, 0, 1000000, 0),
        eliminations: clampInt(snapshot.eliminations, 0, 10000000, 0),
        deaths: clampInt(snapshot.deaths, 0, 1000000, 0),
        totalDamage: clampInt(snapshot.totalDamage, 0, 1000000000, 0),
        bestKillsInMatch: clampInt(snapshot.bestKillsInMatch, 0, 200, 0),
        rankedMatches: clampInt(snapshot.rankedMatches, 0, 1000000, 0),
        rankedWins: clampInt(snapshot.rankedWins, 0, 1000000, 0),
        rankedKills: clampInt(snapshot.rankedKills, 0, 10000000, 0),
        rankedTop3: clampInt(snapshot.rankedTop3, 0, 1000000, 0),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, publicPath);
    }
  }

  async syncPrivateVault(uid: string, vault: RankedVaultState): Promise<void> {
    const privatePath = `players/${uid}`;
    const cleanVault = sanitizeVaultForFirestore(vault);
    try {
      await updateDoc(doc(firestoreDb, 'players', uid), {
        vault: cleanVault,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, privatePath);
    }
  }

  async syncCloudState(
    uid: string,
    cloudState: CloudSyncStatePayload,
    idToken?: string | null,
  ): Promise<void> {
    const privatePath = `players/${uid}`;
    const cleanState = sanitizeCloudStateForFirestore(cloudState);
    try {
      await updateDoc(doc(firestoreDb, 'players', uid), {
        cloudState: cleanState,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, privatePath);
    }

    if (idToken) {
      try {
        await fetch(getApiUrl('/api/firebase/sync-cloud'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            cloudState: cleanState,
          }),
        });
      } catch {
        // Non-fatal mirror error; Firestore already holds cloudState
      }
    }
  }
}

export interface DeveloperVerificationOutcome {
  verifiedDeveloper: boolean;
  reachable: boolean;
  profile?: RankedProfile;
}

export async function verifyDeveloperAuthorizationStatus(
  idToken: string,
  fetchJson: typeof fetchApiJson = fetchApiJson,
): Promise<DeveloperVerificationOutcome> {
  const cleanedToken = typeof idToken === 'string' ? idToken.trim() : '';
  if (!cleanedToken) {
    return { verifiedDeveloper: false, reachable: true };
  }

  try {
    const { res, data } = await fetchJson<{
      ok?: boolean;
      isDeveloper?: boolean;
      error?: string;
    }>(
      getApiUrl('/api/auth/developer-status'),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanedToken}`,
        },
      },
      'Failed to verify developer authorization status.',
    );

    if (!res.ok) {
      return {
        verifiedDeveloper: false,
        reachable: res.status < 500,
      };
    }

    if (data?.isDeveloper !== true) {
      return { verifiedDeveloper: false, reachable: true };
    }

    try {
      const { res: syncRes, data: syncData } = await fetchJson<{
        ok?: boolean;
        isDeveloper?: boolean;
        profile?: RankedProfile;
      }>(
        getApiUrl('/api/dev/sync-privileges'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanedToken}`,
          },
          body: JSON.stringify({}),
        },
        'Failed to synchronize developer privileges.',
      );

      if (
        syncRes.ok &&
        syncData?.isDeveloper === true &&
        syncData.profile &&
        syncData.profile.isDeveloper === true
      ) {
        return {
          verifiedDeveloper: true,
          reachable: true,
          profile: syncData.profile,
        };
      }

      if (syncRes.status === 403 || syncRes.status === 401) {
        return { verifiedDeveloper: false, reachable: true };
      }
    } catch {
      // Status check already succeeded on verified backend; keep verifiedDeveloper true without synthetic profile override
    }

    return { verifiedDeveloper: true, reachable: true };
  } catch (err) {
    return {
      verifiedDeveloper: false,
      reachable: !isBackendReachabilityError(err),
    };
  }
}
