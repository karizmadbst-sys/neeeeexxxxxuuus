import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AVATAR_CATALOG,
  BANNER_CATALOG,
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
  isValidAvatarId,
  isValidBannerId,
} from '../src/shop/AvatarBannerCatalog.ts';
import {
  calculateMatchRpDelta,
  getRankTier,
  type CloudSyncStatePayload,
  type FriendLookupPlayerSummary,
  type FriendLookupResponse,
  type FriendRelationStatus,
  type FriendRequestEntry,
  type LeaderboardEntry,
  type MailboxCategory,
  type MailboxMessageView,
  type MailboxStateSnapshot,
  type OutgoingFriendRequestEntry,
  type PlatformType,
  type PlayerGender,
  type RankedMapId,
  type RankedMatchHistoryEntry,
  type RankedProfile,
  type RankedVaultState,
  type RankTier,
} from '../src/ranked/RankedTypes.ts';
import { isValidWeaponSkinId } from '../src/weapons/WeaponSkins.ts';
import {
  DEVELOPER_CREDITS,
  DEVELOPER_FIREBASE_UID,
  DEVELOPER_LEVEL,
  DEVELOPER_NUMERIC_ID,
  DEVELOPER_PLAYER_ID,
  DEVELOPER_XP,
  getAllDeveloperOwnedItemIds,
  getCatalogItemPriceMap,
  isDeveloperPlayerIdentity,
} from './DeveloperPrivileges.ts';
import { getConfiguredDatabaseUrl, PostgresDatabase } from './db/PostgresPool.ts';
import {
  DatabasePersistenceError,
  mapPgErrorToPersistenceFailure,
  PostgresStoreRepository,
  type LoadedRankedStoreSnapshot,
  type PersistedPlayerRow,
} from './db/PostgresStoreRepository.ts';

interface StoredPlayerRecord extends RankedProfile {
  secretToken: string;
  numericId: string;
  gender: PlayerGender | null;
  firebaseUid?: string;
  email?: string;
  cloudState?: CloudSyncStatePayload;
}

export interface StoredFriendshipRecord {
  playerA: string;
  playerB: string;
  createdAt: number;
}

export interface StoredFriendRequestRecord {
  requestId: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
}

export interface StoredMailboxMessage {
  mailId: string;
  category: MailboxCategory;
  title: string;
  sender: string;
  content: string;
  createdAt: number;
  expiresAt: number | null;
  rewardCredits: number;
}

export interface StoredMailboxUserItemState {
  readAt?: number;
  claimedAt?: number;
  archivedAt?: number;
  deletedAt?: number;
}

interface StoreFileShape {
  version: number;
  players: Record<string, StoredPlayerRecord>;
  friendships?: StoredFriendshipRecord[];
  friendRequests?: StoredFriendRequestRecord[];
  mailboxBroadcasts?: StoredMailboxMessage[];
  mailboxDirectMessages?: Record<string, StoredMailboxMessage[]>;
  mailboxUserStates?: Record<string, Record<string, StoredMailboxUserItemState>>;
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

function createDefaultVaultState(): RankedVaultState {
  return {
    credits: 2000,
    ownedIds: [...DEFAULT_VAULT_OWNED_IDS],
    equippedOutfitId: null,
    equippedGliderId: 'glider-nexus-standard',
    equippedEmoteId: 'emote-amber-flare',
    equippedGlooSkinId: 'shop-gloo-arctic-classic',
    equippedAvatarId: DEFAULT_AVATAR_ID,
    equippedBannerId: DEFAULT_BANNER_ID,
    equippedWeaponSkins: {},
    equippedEmoteWheel: ['dance-floss', null, null, null, null, null, null, null],
    equippedArmoryIds: {},
  };
}

function sanitizeVaultState(
  raw: Partial<RankedVaultState> | undefined,
  existing?: RankedVaultState,
  options?: { isDeveloper?: boolean; enforcePurchaseIntegrity?: boolean },
): RankedVaultState {
  const isDev = Boolean(options?.isDeveloper);
  const enforceIntegrity = Boolean(options?.enforcePurchaseIntegrity && existing && !isDev);
  const base = existing ?? createDefaultVaultState();
  const ownedSet = new Set<string>([...DEFAULT_VAULT_OWNED_IDS, ...base.ownedIds]);
  if (isDev) {
    for (const devId of getAllDeveloperOwnedItemIds()) {
      ownedSet.add(devId);
    }
  }

  let validatedCredits = base.credits;
  const priceMap = getCatalogItemPriceMap();
  const candidateCredits =
    raw && typeof raw.credits === 'number' && Number.isFinite(raw.credits) && raw.credits >= 0
      ? Math.floor(raw.credits)
      : base.credits;

  if (raw && Array.isArray(raw.ownedIds)) {
    const requestedNewIds: string[] = [];
    for (const id of raw.ownedIds) {
      if (typeof id === 'string') {
        const cleaned = id.trim().slice(0, 64);
        if (cleaned && !ownedSet.has(cleaned)) {
          requestedNewIds.push(cleaned);
        }
      }
    }

    if (enforceIntegrity) {
      const uniqueNewIds = Array.from(new Set(requestedNewIds));
      let addedCost = 0;
      let allKnownInCatalog = true;
      for (const newId of uniqueNewIds) {
        const entry = priceMap.get(newId);
        if (!entry || (!entry.defaultOwned && entry.priceCredits <= 0)) {
          allKnownInCatalog = false;
          break;
        }
        if (!entry.defaultOwned) {
          addedCost += entry.priceCredits;
        }
      }

      if (uniqueNewIds.length > 0) {
        const purchaseValid =
          allKnownInCatalog &&
          uniqueNewIds.length <= 10 &&
          addedCost <= base.credits &&
          candidateCredits <= base.credits - addedCost;
        if (purchaseValid) {
          for (const newId of uniqueNewIds) {
            ownedSet.add(newId);
          }
          validatedCredits = Math.max(0, Math.floor(base.credits - addedCost));
        } else {
          validatedCredits = base.credits;
        }
      } else {
        // Equip / unequip only: never allow client payloads to inflate credits
        validatedCredits = base.credits;
      }
    } else {
      for (const newId of requestedNewIds) {
        ownedSet.add(newId);
      }
      validatedCredits = candidateCredits;
    }
  } else if (enforceIntegrity) {
    validatedCredits = base.credits;
  } else {
    validatedCredits = candidateCredits;
  }

  if (isDev) {
    validatedCredits = DEVELOPER_CREDITS;
  }

  const equippedWeaponSkins: Record<string, string> = {};
  const sourceSkins =
    raw && raw.equippedWeaponSkins && typeof raw.equippedWeaponSkins === 'object'
      ? raw.equippedWeaponSkins
      : base.equippedWeaponSkins;
  for (const [wId, skinId] of Object.entries(sourceSkins)) {
    if (
      typeof wId === 'string' &&
      wId.trim() &&
      typeof skinId === 'string' &&
      isValidWeaponSkinId(skinId)
    ) {
      equippedWeaponSkins[wId.trim().slice(0, 32)] = skinId;
    }
  }

  const equippedArmoryIds: Record<string, string> = {};
  const sourceArmory =
    raw && raw.equippedArmoryIds && typeof raw.equippedArmoryIds === 'object'
      ? raw.equippedArmoryIds
      : base.equippedArmoryIds;
  for (const [cat, itemId] of Object.entries(sourceArmory)) {
    if (
      typeof cat === 'string' &&
      typeof itemId === 'string' &&
      ownedSet.has(itemId)
    ) {
      equippedArmoryIds[cat.slice(0, 32)] = itemId;
    }
  }

  const wheel: (string | null)[] = new Array(8).fill(null);
  const sourceWheel =
    raw && Array.isArray(raw.equippedEmoteWheel)
      ? raw.equippedEmoteWheel
      : base.equippedEmoteWheel;
  for (let i = 0; i < 8; i++) {
    const val = sourceWheel[i];
    wheel[i] = typeof val === 'string' && val.trim() ? val.trim().slice(0, 48) : null;
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
    credits: validatedCredits,
    ownedIds: Array.from(ownedSet),
    equippedOutfitId:
      raw && raw.equippedOutfitId === null
        ? null
        : raw && typeof raw.equippedOutfitId === 'string' && ownedSet.has(raw.equippedOutfitId)
          ? raw.equippedOutfitId
          : base.equippedOutfitId,
    equippedGliderId:
      raw && typeof raw.equippedGliderId === 'string' && ownedSet.has(raw.equippedGliderId)
        ? raw.equippedGliderId
        : base.equippedGliderId,
    equippedEmoteId:
      raw && typeof raw.equippedEmoteId === 'string' && ownedSet.has(raw.equippedEmoteId)
        ? raw.equippedEmoteId
        : base.equippedEmoteId,
    equippedGlooSkinId:
      raw && typeof raw.equippedGlooSkinId === 'string' && ownedSet.has(raw.equippedGlooSkinId)
        ? raw.equippedGlooSkinId
        : base.equippedGlooSkinId,
    equippedAvatarId:
      raw && isAvatarOwned(raw.equippedAvatarId)
        ? raw.equippedAvatarId
        : isAvatarOwned(base.equippedAvatarId)
          ? base.equippedAvatarId
          : DEFAULT_AVATAR_ID,
    equippedBannerId:
      raw && isBannerOwned(raw.equippedBannerId)
        ? raw.equippedBannerId
        : isBannerOwned(base.equippedBannerId)
          ? base.equippedBannerId
          : DEFAULT_BANNER_ID,
    equippedWeaponSkins,
    equippedEmoteWheel: wheel,
    equippedArmoryIds,
  };
}

const MAX_HISTORY_ENTRIES = 25;

function sanitizePlayerName(rawName: unknown, fallbackSuffix: string): string {
  if (typeof rawName !== 'string') {
    return `FIGHTER-${fallbackSuffix}`;
  }
  const cleaned = rawName.replace(/[\r\n\t<>/{}\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) {
    return `FIGHTER-${fallbackSuffix}`;
  }
  return cleaned.slice(0, 18);
}

export function normalizeNexusUsername(rawName: unknown): {
  valid: boolean;
  cleaned: string;
  lower: string;
  code?: string;
  error?: string;
} {
  if (typeof rawName !== 'string') {
    return {
      valid: false,
      cleaned: '',
      lower: '',
      code: 'INVALID_USERNAME',
      error: 'Username must be between 2 and 18 characters.',
    };
  }
  const cleaned = rawName.replace(/[\r\n\t<>/{}\\]/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2 || cleaned.length > 18) {
    return {
      valid: false,
      cleaned,
      lower: cleaned.toLowerCase(),
      code: 'INVALID_USERNAME',
      error: 'Username must be between 2 and 18 characters.',
    };
  }
  if (!/^[\p{L}\p{N} _.-]{2,18}$/u.test(cleaned) || !/[\p{L}\p{N}]/u.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      lower: cleaned.toLowerCase(),
      code: 'INVALID_USERNAME',
      error: 'Username may only use letters, numbers, spaces, dots, hyphens, and underscores.',
    };
  }
  return {
    valid: true,
    cleaned,
    lower: cleaned.toLowerCase(),
  };
}

function normalizeEmail(rawEmail: unknown): string {
  if (typeof rawEmail !== 'string') return '';
  return rawEmail.trim().toLowerCase().slice(0, 254);
}

function sanitizeCloudState(
  raw: Partial<CloudSyncStatePayload> | undefined,
  existing?: CloudSyncStatePayload,
): CloudSyncStatePayload | undefined {
  if (!raw || typeof raw !== 'object') {
    return existing;
  }
  const next: CloudSyncStatePayload = existing ? { ...existing } : {};
  if (raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)) {
    next.settings = raw.settings;
  }
  if (raw.controlSettings && typeof raw.controlSettings === 'object' && !Array.isArray(raw.controlSettings)) {
    next.controlSettings = {
      bindings:
        raw.controlSettings.bindings && typeof raw.controlSettings.bindings === 'object'
          ? raw.controlSettings.bindings
          : existing?.controlSettings?.bindings,
      touchLayouts:
        raw.controlSettings.touchLayouts && typeof raw.controlSettings.touchLayouts === 'object'
          ? raw.controlSettings.touchLayouts
          : existing?.controlSettings?.touchLayouts,
    };
  }
  if (typeof raw.selectedCharacterId === 'string' && raw.selectedCharacterId.trim()) {
    next.selectedCharacterId = raw.selectedCharacterId.trim().slice(0, 32);
  }
  if (raw.customization && typeof raw.customization === 'object' && !Array.isArray(raw.customization)) {
    next.customization = raw.customization;
  }
  if (raw.charOverrides && typeof raw.charOverrides === 'object' && !Array.isArray(raw.charOverrides)) {
    next.charOverrides = raw.charOverrides;
  }
  if (raw.checkpoints && typeof raw.checkpoints === 'object' && !Array.isArray(raw.checkpoints)) {
    next.checkpoints = raw.checkpoints;
  }
  return next;
}

function sanitizePlatform(raw: unknown): PlatformType {
  if (raw === 'android' || raw === 'ios' || raw === 'tablet' || raw === 'pc') {
    return raw;
  }
  return 'pc';
}

function sanitizeGender(raw: unknown): PlayerGender | null {
  if (raw === 'male' || raw === 'female') {
    return raw;
  }
  return null;
}

function isValidNumericId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^\d{8,12}$/.test(raw.trim());
}

function computeNextLevelXp(level: number): number {
  const safeLevel = Math.max(1, Math.min(300, Math.floor(level)));
  return 100 + (safeLevel - 1) * 35;
}

function tokensMatch(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function canonicalFriendshipKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

export class RankedStore {
  private readonly filePath: string;
  private readonly players = new Map<string, StoredPlayerRecord>();
  private readonly numericIdToPlayerId = new Map<string, string>();
  private readonly firebaseUidToPlayerId = new Map<string, string>();
  private readonly usernameLowerToPlayerId = new Map<string, string>();
  private readonly emailLowerToPlayerId = new Map<string, string>();
  private readonly friendships = new Map<string, StoredFriendshipRecord>();
  private readonly friendsByPlayerId = new Map<string, Set<string>>();
  private readonly friendRequests = new Map<string, StoredFriendRequestRecord>();
  private readonly requestPairToId = new Map<string, string>();
  private readonly mailboxBroadcasts = new Map<string, StoredMailboxMessage>();
  private readonly mailboxDirectMessages = new Map<string, StoredMailboxMessage[]>();
  private readonly mailboxUserStates = new Map<string, Map<string, StoredMailboxUserItemState>>();
  private readonly databaseUrl: string | null;
  private pgDb: PostgresDatabase | null = null;
  private pgRepo: PostgresStoreRepository | null = null;
  private readonly injectedPgDb: PostgresDatabase | null = null;
  private initialized = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writeInProgress = false;
  private pendingWrite = false;

  constructor(
    storePath?: string,
    options?: { disablePostgres?: boolean; pgDb?: PostgresDatabase },
  ) {
    this.filePath =
      storePath ?? path.resolve(process.cwd(), 'data', 'ranked-store.json');
    this.injectedPgDb = options?.pgDb ?? null;
    const configuredDbUrl = this.injectedPgDb
      ? 'postgres://injected-test-db'
      : options?.disablePostgres || storePath
        ? null
        : getConfiguredDatabaseUrl();
    const requirePostgres =
      !options?.disablePostgres &&
      !storePath &&
      !this.injectedPgDb &&
      (process.env.RENDER === 'true' || process.env.REQUIRE_POSTGRES === 'true');
    if (requirePostgres && !configuredDbUrl) {
      throw new Error(
        '[RankedStore] DATABASE_URL must be configured when running in production on Render.',
      );
    }
    this.databaseUrl = configuredDbUrl;
    if (!this.databaseUrl) {
      this.loadFromDisk();
      this.ensureDefaultMailboxBroadcasts();
      this.initialized = true;
    }
  }

  getStorageMode(): 'postgres' | 'file' {
    return this.databaseUrl ? 'postgres' : 'file';
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.databaseUrl) {
      this.initialized = true;
      return;
    }

    this.pgDb = this.injectedPgDb ?? new PostgresDatabase(this.databaseUrl);
    this.pgRepo = new PostgresStoreRepository(this.pgDb);
    const snapshot = await this.pgRepo.ensureSchemaAndLoad();
    this.loadFromPostgresSnapshot(snapshot);
    this.ensureDefaultMailboxBroadcasts();
    this.initialized = true;
  }

  async pingDatabase(): Promise<{ mode: 'postgres' | 'file'; ok: boolean; latencyMs?: number }> {
    if (!this.pgDb) {
      return { mode: 'file', ok: true };
    }
    const ping = await this.pgDb.ping();
    return {
      mode: 'postgres',
      ok: ping.ok,
      latencyMs: ping.latencyMs,
    };
  }

  async close(): Promise<void> {
    await this.flushToDisk();
    if (this.pgDb) {
      if (!this.injectedPgDb) {
        await this.pgDb.close();
      }
      this.pgDb = null;
      this.pgRepo = null;
    }
  }

  private toPersistedPlayerRow(rec: StoredPlayerRecord): PersistedPlayerRow {
    return {
      playerId: rec.playerId,
      numericId: rec.numericId,
      firebaseUid: rec.firebaseUid,
      email: rec.email,
      secretToken: rec.secretToken,
      name: rec.name,
      usernameChanged: Boolean(rec.usernameChanged),
      platform: rec.platform,
      gender: sanitizeGender(rec.gender),
      avatarCharacterId: rec.avatarCharacterId || 'char-01',
      rp: rec.rp,
      tier: rec.tier,
      wins: rec.wins,
      kills: rec.kills,
      deaths: rec.deaths,
      top3: rec.top3,
      matchesPlayed: rec.matchesPlayed,
      totalDamage: rec.totalDamage,
      bestKillsInMatch: rec.bestKillsInMatch,
      level: rec.level ?? 1,
      xp: rec.xp ?? 0,
      careerMatches: rec.careerMatches ?? rec.matchesPlayed,
      careerWins: rec.careerWins ?? rec.wins,
      careerKills: rec.careerKills ?? rec.kills,
      careerDeaths: rec.careerDeaths ?? rec.deaths,
      careerDamage: rec.careerDamage ?? rec.totalDamage,
      careerBestKills: rec.careerBestKills ?? rec.bestKillsInMatch,
      vault: rec.vault ?? createDefaultVaultState(),
      cloudState: rec.cloudState,
      history: rec.history,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
  }

  private loadFromPostgresSnapshot(snapshot: LoadedRankedStoreSnapshot): void {
    this.players.clear();
    this.numericIdToPlayerId.clear();
    this.firebaseUidToPlayerId.clear();
    this.usernameLowerToPlayerId.clear();
    this.emailLowerToPlayerId.clear();
    this.friendships.clear();
    this.friendsByPlayerId.clear();
    this.friendRequests.clear();
    this.requestPairToId.clear();
    this.mailboxBroadcasts.clear();
    this.mailboxDirectMessages.clear();
    this.mailboxUserStates.clear();

    for (const row of snapshot.players) {
      const cleanedEmail = normalizeEmail(row.email);
      const isDevRecord = isDeveloperPlayerIdentity({
        firebaseUid: row.firebaseUid,
        playerId: row.playerId,
        numericId: row.numericId,
      });
      const stored: StoredPlayerRecord = {
        ...row,
        email: cleanedEmail || undefined,
        gender: sanitizeGender(row.gender),
        usernameChanged: false,
        isDeveloper: isDevRecord ? true : undefined,
        level: typeof row.level === 'number' && row.level >= 1 ? Math.floor(row.level) : 1,
        xp: typeof row.xp === 'number' && row.xp >= 0 ? Math.floor(row.xp) : 0,
        tier: getRankTier(row.rp ?? 0),
        vault: sanitizeVaultState(row.vault, undefined, { isDeveloper: isDevRecord }),
        cloudState: sanitizeCloudState(row.cloudState),
        history: Array.isArray(row.history) ? row.history.slice(0, MAX_HISTORY_ENTRIES) : [],
      };
      if (!isDevRecord) {
        delete stored.isDeveloper;
      }
      this.players.set(stored.playerId, stored);
      if (stored.firebaseUid) {
        this.firebaseUidToPlayerId.set(stored.firebaseUid, stored.playerId);
      }
      if (cleanedEmail) {
        this.emailLowerToPlayerId.set(cleanedEmail, stored.playerId);
      }
      if (isValidNumericId(stored.numericId)) {
        this.numericIdToPlayerId.set(stored.numericId, stored.playerId);
      }
      const nameNorm = normalizeNexusUsername(stored.name);
      if (nameNorm.valid) {
        const existingOwner = this.usernameLowerToPlayerId.get(nameNorm.lower);
        const existingRec = existingOwner ? this.players.get(existingOwner) : undefined;
        if (!existingOwner || (stored.firebaseUid && !existingRec?.firebaseUid)) {
          this.usernameLowerToPlayerId.set(nameNorm.lower, stored.playerId);
        }
      }
    }

    for (const f of snapshot.friendships) {
      if (this.players.has(f.playerA) && this.players.has(f.playerB)) {
        this.addMutualFriendshipInternal(f.playerA, f.playerB, f.createdAt);
      }
    }

    for (const r of snapshot.friendRequests) {
      if (
        this.players.has(r.fromPlayerId) &&
        this.players.has(r.toPlayerId) &&
        !this.areFriends(r.fromPlayerId, r.toPlayerId)
      ) {
        this.friendRequests.set(r.requestId, r);
        this.requestPairToId.set(`${r.fromPlayerId}->${r.toPlayerId}`, r.requestId);
      }
    }

    for (const m of snapshot.mailboxBroadcasts) {
      const cleaned = this.sanitizeStoredMailboxMessage(m);
      if (cleaned) {
        this.mailboxBroadcasts.set(cleaned.mailId, cleaned);
      }
    }

    for (const dm of snapshot.mailboxDirectMessages) {
      if (!this.players.has(dm.recipientPlayerId)) continue;
      const cleaned = this.sanitizeStoredMailboxMessage(dm);
      if (!cleaned) continue;
      const list = this.mailboxDirectMessages.get(dm.recipientPlayerId) ?? [];
      list.push(cleaned);
      this.mailboxDirectMessages.set(dm.recipientPlayerId, list);
    }

    for (const st of snapshot.mailboxUserStates) {
      if (!this.players.has(st.playerId)) continue;
      let inner = this.mailboxUserStates.get(st.playerId);
      if (!inner) {
        inner = new Map<string, StoredMailboxUserItemState>();
        this.mailboxUserStates.set(st.playerId, inner);
      }
      inner.set(st.mailId, st.state);
    }

    const devPid = this.firebaseUidToPlayerId.get(DEVELOPER_FIREBASE_UID);
    const devRec = devPid ? this.players.get(devPid) : undefined;
    if (devRec) {
      this.enforceDeveloperEntitlement(devRec);
    }
  }

  private generateUniqueNumericId(): string {
    for (let attempt = 0; attempt < 64; attempt++) {
      const candidate = String(crypto.randomInt(100_000_000, 1_000_000_000));
      if (!this.numericIdToPlayerId.has(candidate)) {
        return candidate;
      }
    }
    let fallback = Date.now() % 900_000_000 + 100_000_000;
    while (this.numericIdToPlayerId.has(String(fallback))) {
      fallback = (fallback + 1) % 900_000_000 + 100_000_000;
    }
    return String(fallback);
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreFileShape>;
      const missingNumericIds: StoredPlayerRecord[] = [];
      if (parsed && parsed.players && typeof parsed.players === 'object') {
        for (const [id, rec] of Object.entries(parsed.players)) {
          if (rec && typeof rec.playerId === 'string' && typeof rec.secretToken === 'string') {
            const rawNumeric = isValidNumericId(rec.numericId) ? rec.numericId.trim() : '';
            const assignedNumeric =
              rawNumeric && !this.numericIdToPlayerId.has(rawNumeric) ? rawNumeric : '';
            const cleanedEmail = normalizeEmail(rec.email);
            const isDevRecord = isDeveloperPlayerIdentity({
              firebaseUid: rec.firebaseUid,
              playerId: rec.playerId,
              numericId: assignedNumeric,
            });
            const stored: StoredPlayerRecord = {
              ...rec,
              numericId: assignedNumeric,
              email: cleanedEmail || undefined,
              gender: sanitizeGender(rec.gender),
              usernameChanged: false,
              isDeveloper: isDevRecord ? true : undefined,
              level: typeof rec.level === 'number' && rec.level >= 1 ? Math.floor(rec.level) : 1,
              xp: typeof rec.xp === 'number' && rec.xp >= 0 ? Math.floor(rec.xp) : 0,
              avatarCharacterId:
                typeof rec.avatarCharacterId === 'string' && rec.avatarCharacterId
                  ? rec.avatarCharacterId
                  : 'char-01',
              careerMatches:
                typeof rec.careerMatches === 'number'
                  ? rec.careerMatches
                  : (rec.matchesPlayed ?? 0),
              careerWins:
                typeof rec.careerWins === 'number' ? rec.careerWins : (rec.wins ?? 0),
              careerKills:
                typeof rec.careerKills === 'number' ? rec.careerKills : (rec.kills ?? 0),
              careerDeaths:
                typeof rec.careerDeaths === 'number' ? rec.careerDeaths : (rec.deaths ?? 0),
              careerDamage:
                typeof rec.careerDamage === 'number' ? rec.careerDamage : (rec.totalDamage ?? 0),
              careerBestKills:
                typeof rec.careerBestKills === 'number'
                  ? rec.careerBestKills
                  : (rec.bestKillsInMatch ?? 0),
              tier: getRankTier(rec.rp ?? 0),
              vault: sanitizeVaultState(rec.vault, undefined, { isDeveloper: isDevRecord }),
              cloudState: sanitizeCloudState(rec.cloudState),
              history: Array.isArray(rec.history) ? rec.history.slice(0, MAX_HISTORY_ENTRIES) : [],
            };
            if (!isDevRecord) {
              delete stored.isDeveloper;
            }
            this.players.set(id, stored);
            if (typeof stored.firebaseUid === 'string' && stored.firebaseUid.trim()) {
              const cleanedUid = stored.firebaseUid.trim();
              stored.firebaseUid = cleanedUid;
              this.firebaseUidToPlayerId.set(cleanedUid, id);
            }
            if (cleanedEmail) {
              this.emailLowerToPlayerId.set(cleanedEmail, id);
            }
            const nameNorm = normalizeNexusUsername(stored.name);
            if (nameNorm.valid && !this.usernameLowerToPlayerId.has(nameNorm.lower)) {
              this.usernameLowerToPlayerId.set(nameNorm.lower, id);
            } else if (nameNorm.valid && stored.firebaseUid) {
              const prevOwner = this.usernameLowerToPlayerId.get(nameNorm.lower);
              const prevRec = prevOwner ? this.players.get(prevOwner) : undefined;
              if (!prevRec?.firebaseUid) {
                this.usernameLowerToPlayerId.set(nameNorm.lower, id);
              }
            }
            if (assignedNumeric) {
              this.numericIdToPlayerId.set(assignedNumeric, id);
            } else {
              missingNumericIds.push(stored);
            }
          }
        }
      }
      if (Array.isArray(parsed?.friendships)) {
        for (const f of parsed.friendships) {
          if (
            f &&
            typeof f.playerA === 'string' &&
            typeof f.playerB === 'string' &&
            f.playerA !== f.playerB &&
            this.players.has(f.playerA) &&
            this.players.has(f.playerB)
          ) {
            this.addMutualFriendshipInternal(
              f.playerA,
              f.playerB,
              typeof f.createdAt === 'number' && Number.isFinite(f.createdAt)
                ? f.createdAt
                : Date.now(),
            );
          }
        }
      }
      if (Array.isArray(parsed?.friendRequests)) {
        for (const r of parsed.friendRequests) {
          if (
            r &&
            typeof r.requestId === 'string' &&
            r.requestId.trim() &&
            typeof r.fromPlayerId === 'string' &&
            typeof r.toPlayerId === 'string' &&
            r.fromPlayerId !== r.toPlayerId &&
            this.players.has(r.fromPlayerId) &&
            this.players.has(r.toPlayerId) &&
            !this.areFriends(r.fromPlayerId, r.toPlayerId)
          ) {
            const pairKey = `${r.fromPlayerId}->${r.toPlayerId}`;
            if (!this.requestPairToId.has(pairKey)) {
              const cleaned: StoredFriendRequestRecord = {
                requestId: r.requestId.trim(),
                fromPlayerId: r.fromPlayerId,
                toPlayerId: r.toPlayerId,
                createdAt:
                  typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
                    ? r.createdAt
                    : Date.now(),
              };
              this.friendRequests.set(cleaned.requestId, cleaned);
              this.requestPairToId.set(pairKey, cleaned.requestId);
            }
          }
        }
      }
      if (Array.isArray(parsed?.mailboxBroadcasts)) {
        for (const m of parsed.mailboxBroadcasts) {
          const cleaned = this.sanitizeStoredMailboxMessage(m);
          if (cleaned) {
            this.mailboxBroadcasts.set(cleaned.mailId, cleaned);
          }
        }
      }
      if (parsed?.mailboxDirectMessages && typeof parsed.mailboxDirectMessages === 'object') {
        for (const [pid, list] of Object.entries(parsed.mailboxDirectMessages)) {
          if (!this.players.has(pid) || !Array.isArray(list)) continue;
          const cleanedList: StoredMailboxMessage[] = [];
          for (const m of list) {
            const cleaned = this.sanitizeStoredMailboxMessage(m);
            if (cleaned) cleanedList.push(cleaned);
          }
          if (cleanedList.length > 0) {
            this.mailboxDirectMessages.set(pid, cleanedList);
          }
        }
      }
      if (parsed?.mailboxUserStates && typeof parsed.mailboxUserStates === 'object') {
        for (const [pid, stateMap] of Object.entries(parsed.mailboxUserStates)) {
          if (!this.players.has(pid) || !stateMap || typeof stateMap !== 'object') continue;
          const inner = new Map<string, StoredMailboxUserItemState>();
          for (const [mailId, st] of Object.entries(stateMap)) {
            if (!mailId || !st || typeof st !== 'object') continue;
            const entry: StoredMailboxUserItemState = {};
            if (typeof st.readAt === 'number' && Number.isFinite(st.readAt)) entry.readAt = st.readAt;
            if (typeof st.claimedAt === 'number' && Number.isFinite(st.claimedAt)) entry.claimedAt = st.claimedAt;
            if (typeof st.archivedAt === 'number' && Number.isFinite(st.archivedAt)) entry.archivedAt = st.archivedAt;
            if (typeof st.deletedAt === 'number' && Number.isFinite(st.deletedAt)) entry.deletedAt = st.deletedAt;
            inner.set(mailId, entry);
          }
          if (inner.size > 0) {
            this.mailboxUserStates.set(pid, inner);
          }
        }
      }
      if (missingNumericIds.length > 0) {
        for (const stored of missingNumericIds) {
          const nextNum = this.generateUniqueNumericId();
          stored.numericId = nextNum;
          this.numericIdToPlayerId.set(nextNum, stored.playerId);
        }
        this.scheduleSave();
      }
      const devPid = this.firebaseUidToPlayerId.get(DEVELOPER_FIREBASE_UID);
      const devRec = devPid ? this.players.get(devPid) : undefined;
      if (devRec && this.enforceDeveloperEntitlement(devRec)) {
        this.writeStoreSync();
      }
    } catch (err) {
      console.warn('[RankedStore] Could not read existing store, starting fresh:', err);
    }
  }

  private sanitizeStoredMailboxMessage(raw: unknown): StoredMailboxMessage | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Partial<StoredMailboxMessage>;
    if (typeof obj.mailId !== 'string' || !obj.mailId.trim()) return null;
    if (typeof obj.title !== 'string' || !obj.title.trim()) return null;
    if (typeof obj.content !== 'string' || !obj.content.trim()) return null;
    const cat: MailboxCategory =
      obj.category === 'system' ||
      obj.category === 'developer' ||
      obj.category === 'notification' ||
      obj.category === 'reward'
        ? obj.category
        : 'system';
    return {
      mailId: obj.mailId.trim().slice(0, 80),
      category: cat,
      title: obj.title.trim().slice(0, 120),
      sender:
        typeof obj.sender === 'string' && obj.sender.trim()
          ? obj.sender.trim().slice(0, 64)
          : 'NEXUS COMMAND',
      content: obj.content.trim().slice(0, 2000),
      createdAt:
        typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt)
          ? obj.createdAt
          : Date.now(),
      expiresAt:
        typeof obj.expiresAt === 'number' && Number.isFinite(obj.expiresAt)
          ? obj.expiresAt
          : null,
      rewardCredits:
        typeof obj.rewardCredits === 'number' && Number.isFinite(obj.rewardCredits) && obj.rewardCredits > 0
          ? Math.min(100_000, Math.floor(obj.rewardCredits))
          : 0,
    };
  }

  private ensureDefaultMailboxBroadcasts(): void {
    const defaults: StoredMailboxMessage[] = [
      {
        mailId: 'mail_welcome_season1',
        category: 'system',
        title: 'NEXUS ROYALE Operational Briefing',
        sender: 'NEXUS COMMAND',
        content:
          'Welcome to NEXUS ROYALE! Ranked online combat, Squad parties, and cloud progression are active across Desktop and Android. Equip your preferred weapons and outfit in the Vault before dropping into combat.',
        createdAt: 1764000000000,
        expiresAt: null,
        rewardCredits: 0,
      },
      {
        mailId: 'mail_dev_dispatch_social',
        category: 'developer',
        title: 'Developer Dispatch: Friends & Lobby Upgrades',
        sender: 'karizma · Creator',
        content:
          'Social Friend Requests, Player Profile inspection, Live Online Status, and the In-Game Mailbox are now active. Search friends by their NEXUS ID or Username and team up for Duo or Quad matches.',
        createdAt: 1764043200000,
        expiresAt: null,
        rewardCredits: 0,
      },
      {
        mailId: 'mail_reward_launch_crate',
        category: 'reward',
        title: 'Founders Supply Grant (+500 Credits)',
        sender: 'NEXUS LOGISTICS',
        content:
          'Thank you for fighting in NEXUS ROYALE! Claim your complimentary 500 Credits supply drop below and spend them in the Shop on weapon skins, outfits, emotes, avatars, or banners.',
        createdAt: 1764086400000,
        expiresAt: null,
        rewardCredits: 500,
      },
    ];
    let added = false;
    for (const msg of defaults) {
      if (!this.mailboxBroadcasts.has(msg.mailId)) {
        this.mailboxBroadcasts.set(msg.mailId, msg);
        added = true;
      }
    }
    if (added && !this.pgRepo && fs.existsSync(this.filePath)) {
      this.scheduleSave();
    }
  }

  private isRecordVerifiedDeveloper(rec: StoredPlayerRecord): boolean {
    return (
      isDeveloperPlayerIdentity({
        firebaseUid: rec.firebaseUid,
        playerId: rec.playerId,
        numericId: rec.numericId,
      }) &&
      (!this.firebaseUidToPlayerId.has(DEVELOPER_FIREBASE_UID) ||
        this.firebaseUidToPlayerId.get(DEVELOPER_FIREBASE_UID) === DEVELOPER_PLAYER_ID)
    );
  }

  private enforceDeveloperEntitlement(rec: StoredPlayerRecord): boolean {
    if (!this.isRecordVerifiedDeveloper(rec)) {
      if (rec.isDeveloper !== undefined) {
        delete rec.isDeveloper;
        return true;
      }
      return false;
    }
    let changed = false;
    if (rec.isDeveloper !== true) {
      rec.isDeveloper = true;
      changed = true;
    }
    if (rec.level !== DEVELOPER_LEVEL) {
      rec.level = DEVELOPER_LEVEL;
      changed = true;
    }
    if (rec.xp !== DEVELOPER_XP) {
      rec.xp = DEVELOPER_XP;
      changed = true;
    }
    const allIds = getAllDeveloperOwnedItemIds();
    const prevOwnedCount = rec.vault?.ownedIds?.length ?? 0;
    const prevCredits = rec.vault?.credits;
    rec.vault = sanitizeVaultState(rec.vault, rec.vault, { isDeveloper: true });
    if (rec.vault.credits !== prevCredits || rec.vault.ownedIds.length !== prevOwnedCount || rec.vault.ownedIds.length < allIds.length) {
      changed = true;
    }
    return changed;
  }

  private serializeMailboxUserStates(): Record<string, Record<string, StoredMailboxUserItemState>> {
    const out: Record<string, Record<string, StoredMailboxUserItemState>> = {};
    for (const [pid, map] of this.mailboxUserStates.entries()) {
      if (map.size > 0) {
        out[pid] = Object.fromEntries(map.entries());
      }
    }
    return out;
  }

  private writeStoreSync(): void {
    if (this.pgRepo) {
      return;
    }
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const obj: StoreFileShape = {
        version: 1,
        players: Object.fromEntries(this.players.entries()),
        friendships: Array.from(this.friendships.values()),
        friendRequests: Array.from(this.friendRequests.values()),
        mailboxBroadcasts: Array.from(this.mailboxBroadcasts.values()),
        mailboxDirectMessages: Object.fromEntries(this.mailboxDirectMessages.entries()),
        mailboxUserStates: this.serializeMailboxUserStates(),
      };
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('[RankedStore] Failed synchronous store persist:', err);
    }
  }

  private clonePlayerRecord(rec: StoredPlayerRecord): StoredPlayerRecord {
    return {
      ...rec,
      vault: rec.vault
        ? {
            ...rec.vault,
            ownedIds: [...rec.vault.ownedIds],
            equippedWeaponSkins: { ...rec.vault.equippedWeaponSkins },
            equippedEmoteWheel: [...rec.vault.equippedEmoteWheel],
            equippedArmoryIds: { ...rec.vault.equippedArmoryIds },
          }
        : createDefaultVaultState(),
      cloudState: rec.cloudState ? { ...rec.cloudState } : undefined,
      history: rec.history.map((h) => ({ ...h })),
    };
  }

  private commitPlayerRecordToMemory(candidate: StoredPlayerRecord): void {
    const existing = this.players.get(candidate.playerId);
    if (existing) {
      const prevNorm = normalizeNexusUsername(existing.name);
      if (prevNorm.valid && this.usernameLowerToPlayerId.get(prevNorm.lower) === existing.playerId) {
        this.usernameLowerToPlayerId.delete(prevNorm.lower);
      }
      if (existing.email && this.emailLowerToPlayerId.get(existing.email) === existing.playerId) {
        this.emailLowerToPlayerId.delete(existing.email);
      }
    }
    this.players.set(candidate.playerId, candidate);
    if (isValidNumericId(candidate.numericId)) {
      this.numericIdToPlayerId.set(candidate.numericId, candidate.playerId);
    }
    if (candidate.firebaseUid) {
      this.firebaseUidToPlayerId.set(candidate.firebaseUid, candidate.playerId);
    }
    const nextNorm = normalizeNexusUsername(candidate.name);
    if (nextNorm.valid) {
      this.usernameLowerToPlayerId.set(nextNorm.lower, candidate.playerId);
    }
    const cleanedEmail = normalizeEmail(candidate.email);
    if (cleanedEmail) {
      candidate.email = cleanedEmail;
      this.emailLowerToPlayerId.set(cleanedEmail, candidate.playerId);
    }
  }

  private async commitPlayerCandidateAsync(candidate: StoredPlayerRecord): Promise<void> {
    if (this.pgRepo) {
      try {
        await this.pgRepo.commitPlayerUpsert(this.toPersistedPlayerRow(candidate));
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        throw new DatabasePersistenceError(mapped.status, mapped.code, mapped.error);
      }
      this.commitPlayerRecordToMemory(candidate);
      return;
    }
    this.commitPlayerRecordToMemory(candidate);
    this.scheduleSave();
  }

  private addMutualFriendshipInternal(idA: string, idB: string, createdAt: number): boolean {
    if (!idA || !idB || idA === idB) return false;
    const key = canonicalFriendshipKey(idA, idB);
    if (this.friendships.has(key)) return false;
    const [playerA, playerB] = idA < idB ? [idA, idB] : [idB, idA];
    this.friendships.set(key, { playerA, playerB, createdAt });
    let setA = this.friendsByPlayerId.get(playerA);
    if (!setA) {
      setA = new Set<string>();
      this.friendsByPlayerId.set(playerA, setA);
    }
    setA.add(playerB);
    let setB = this.friendsByPlayerId.get(playerB);
    if (!setB) {
      setB = new Set<string>();
      this.friendsByPlayerId.set(playerB, setB);
    }
    setB.add(playerA);
    return true;
  }

  private scheduleSave(): void {
    if (this.pgRepo) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushToDisk();
    }, 120);
  }

  async flushToDisk(): Promise<void> {
    if (this.pgRepo) {
      await this.pgRepo.flush();
      return;
    }
    if (this.writeInProgress) {
      this.pendingWrite = true;
      return;
    }
    this.writeInProgress = true;
    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      const obj: StoreFileShape = {
        version: 1,
        players: Object.fromEntries(this.players.entries()),
        friendships: Array.from(this.friendships.values()),
        friendRequests: Array.from(this.friendRequests.values()),
        mailboxBroadcasts: Array.from(this.mailboxBroadcasts.values()),
        mailboxDirectMessages: Object.fromEntries(this.mailboxDirectMessages.entries()),
        mailboxUserStates: this.serializeMailboxUserStates(),
      };
      const tmpPath = `${this.filePath}.tmp`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
      await fs.promises.rename(tmpPath, this.filePath);
    } catch (err) {
      console.error('[RankedStore] Failed to persist store:', err);
    } finally {
      this.writeInProgress = false;
      if (this.pendingWrite) {
        this.pendingWrite = false;
        void this.flushToDisk();
      }
    }
  }

  private toPublicProfile(
    rec: StoredPlayerRecord,
    stripPrivateVault = false,
    includeDeveloperFlag = false,
  ): RankedProfile {
    const {
      secretToken: _omitted,
      firebaseUid: _omittedUid,
      email: _omittedEmail,
      cloudState: _omittedCloudState,
      isDeveloper: _omittedDev,
      ...pub
    } = rec;
    const level = typeof pub.level === 'number' && pub.level >= 1 ? Math.floor(pub.level) : 1;
    const equippedAvatarId =
      pub.vault && isValidAvatarId(pub.vault.equippedAvatarId)
        ? pub.vault.equippedAvatarId
        : DEFAULT_AVATAR_ID;
    const equippedBannerId =
      pub.vault && isValidBannerId(pub.vault.equippedBannerId)
        ? pub.vault.equippedBannerId
        : DEFAULT_BANNER_ID;
    const out: RankedProfile = {
      ...pub,
      usernameChanged: false,
      numericId: pub.numericId,
      gender: sanitizeGender(pub.gender),
      level,
      xp: typeof pub.xp === 'number' && pub.xp >= 0 ? Math.floor(pub.xp) : 0,
      nextLevelXp: computeNextLevelXp(level),
      equippedAvatarId,
      equippedBannerId,
      history: [...pub.history],
    };
    if (includeDeveloperFlag && !stripPrivateVault && this.isRecordVerifiedDeveloper(rec)) {
      out.isDeveloper = true;
    }
    if (stripPrivateVault) {
      delete out.vault;
    }
    return out;
  }

  checkUsernameAvailability(
    rawUsername: string,
    excludePlayerId?: string,
  ): { available: boolean; valid: boolean; cleaned?: string; code?: string; error?: string } {
    const norm = normalizeNexusUsername(rawUsername);
    if (!norm.valid) {
      return {
        available: false,
        valid: false,
        code: norm.code,
        error: norm.error,
      };
    }
    const existingPid = this.usernameLowerToPlayerId.get(norm.lower);
    if (existingPid && existingPid !== excludePlayerId) {
      return {
        available: false,
        valid: true,
        cleaned: norm.cleaned,
        code: 'USERNAME_TAKEN',
        error: 'This username is already taken.',
      };
    }
    return {
      available: true,
      valid: true,
      cleaned: norm.cleaned,
    };
  }

  resolveLoginEmailByIdentifier(identifier: string): string | null {
    const trimmed = typeof identifier === 'string' ? identifier.trim() : '';
    if (!trimmed || trimmed.length > 254) return null;
    if (trimmed.includes('@')) {
      return normalizeEmail(trimmed) || null;
    }
    const pid = this.usernameLowerToPlayerId.get(trimmed.toLowerCase());
    if (!pid) return null;
    const rec = this.players.get(pid);
    return rec?.email ? normalizeEmail(rec.email) : null;
  }

  resolveRecoveryEmailByIdentifier(identifier: string): string | null {
    return this.resolveLoginEmailByIdentifier(identifier);
  }

  async registerFirebaseEmailAccountAsync(input: {
    firebaseUid: string;
    email: string;
    username: string;
    platform?: PlatformType;
  }): Promise<
    | { ok: true; profile: RankedProfile; playerId: string; numericId: string }
    | { ok: false; status: number; code: string; error: string }
  > {
    const uid = input.firebaseUid.trim();
    const cleanedEmail = normalizeEmail(input.email);
    if (!uid || !cleanedEmail || !cleanedEmail.includes('@')) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ACCOUNT_INPUT',
        error: 'Valid Firebase UID and email are required.',
      };
    }

    const normName = normalizeNexusUsername(input.username);
    if (!normName.valid) {
      return {
        ok: false,
        status: 400,
        code: normName.code ?? 'INVALID_USERNAME',
        error: normName.error ?? 'Username must be between 2 and 18 characters.',
      };
    }

    const existingUidPid = this.firebaseUidToPlayerId.get(uid);
    const existingRec = existingUidPid ? this.players.get(existingUidPid) : undefined;
    const takenByPid = this.usernameLowerToPlayerId.get(normName.lower);
    if (takenByPid && takenByPid !== existingRec?.playerId) {
      return {
        ok: false,
        status: 409,
        code: 'USERNAME_TAKEN',
        error: 'This username is already taken.',
      };
    }

    const now = Date.now();
    if (existingRec) {
      const candidate = this.clonePlayerRecord(existingRec);
      candidate.email = cleanedEmail;
      candidate.name = normName.cleaned;
      if (input.platform) {
        candidate.platform = sanitizePlatform(input.platform);
      }
      candidate.updatedAt = now;
      try {
        await this.commitPlayerCandidateAsync(candidate);
      } catch (err) {
        if (err instanceof DatabasePersistenceError) {
          return { ok: false, status: err.status, code: err.code, error: err.message };
        }
        return {
          ok: false,
          status: 503,
          code: 'DATABASE_ERROR',
          error: 'Database write failed. Changes were not saved.',
        };
      }
      return {
        ok: true,
        profile: this.toPublicProfile(candidate),
        playerId: candidate.playerId,
        numericId: candidate.numericId,
      };
    }

    const playerId = this.generateUniquePlayerId();
    const secretToken = crypto.randomBytes(24).toString('hex');
    const numericId = this.generateUniqueNumericId();
    const candidate: StoredPlayerRecord = {
      playerId,
      numericId,
      firebaseUid: uid,
      email: cleanedEmail,
      secretToken,
      name: normName.cleaned,
      usernameChanged: false,
      platform: sanitizePlatform(input.platform),
      gender: null,
      rp: 200,
      tier: getRankTier(200),
      wins: 0,
      kills: 0,
      deaths: 0,
      top3: 0,
      matchesPlayed: 0,
      totalDamage: 0,
      bestKillsInMatch: 0,
      level: 1,
      xp: 0,
      avatarCharacterId: 'char-01',
      vault: createDefaultVaultState(),
      careerMatches: 0,
      careerWins: 0,
      careerKills: 0,
      careerDeaths: 0,
      careerDamage: 0,
      careerBestKills: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.commitPlayerCandidateAsync(candidate);
    } catch (err) {
      if (err instanceof DatabasePersistenceError) {
        return { ok: false, status: err.status, code: err.code, error: err.message };
      }
      return {
        ok: false,
        status: 503,
        code: 'DATABASE_ERROR',
        error: 'Database write failed. Changes were not saved.',
      };
    }
    return {
      ok: true,
      profile: this.toPublicProfile(candidate),
      playerId,
      numericId,
    };
  }

  async upsertProfileAsync(input: {
    playerId?: string;
    secretToken?: string;
    name?: string;
    platform?: PlatformType;
  }): Promise<{ profile: RankedProfile; secretToken: string; created: boolean }> {
    const now = Date.now();
    const existing =
      input.playerId && typeof input.playerId === 'string'
        ? this.players.get(input.playerId)
        : undefined;

    if (existing && input.secretToken && tokensMatch(existing.secretToken, input.secretToken)) {
      const candidate = this.clonePlayerRecord(existing);
      if (!isValidNumericId(candidate.numericId)) {
        candidate.numericId = this.generateUniqueNumericId();
      }
      if (input.platform) {
        candidate.platform = sanitizePlatform(input.platform);
      }
      candidate.updatedAt = now;
      await this.commitPlayerCandidateAsync(candidate);
      return {
        profile: this.toPublicProfile(candidate),
        secretToken: candidate.secretToken,
        created: false,
      };
    }

    const playerId = this.generateUniquePlayerId();
    const secretToken = crypto.randomBytes(24).toString('hex');
    const numericId = this.generateUniqueNumericId();
    const suffix = playerId.slice(-4).toUpperCase();
    const candidate: StoredPlayerRecord = {
      playerId,
      numericId,
      secretToken,
      name: sanitizePlayerName(input.name, suffix),
      usernameChanged: false,
      platform: sanitizePlatform(input.platform),
      gender: null,
      rp: 200,
      tier: getRankTier(200),
      wins: 0,
      kills: 0,
      deaths: 0,
      top3: 0,
      matchesPlayed: 0,
      totalDamage: 0,
      bestKillsInMatch: 0,
      level: 1,
      xp: 0,
      avatarCharacterId: 'char-01',
      vault: createDefaultVaultState(),
      careerMatches: 0,
      careerWins: 0,
      careerKills: 0,
      careerDeaths: 0,
      careerDamage: 0,
      careerBestKills: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.commitPlayerCandidateAsync(candidate);
    return {
      profile: this.toPublicProfile(candidate),
      secretToken,
      created: true,
    };
  }

  private generateUniquePlayerId(): string {
    for (let attempt = 0; attempt < 64; attempt++) {
      const candidate = `p_${crypto.randomBytes(8).toString('hex')}`;
      if (!this.players.has(candidate)) {
        return candidate;
      }
    }
    let fallback = `p_${Date.now().toString(16)}${crypto.randomBytes(4).toString('hex')}`;
    while (this.players.has(fallback)) {
      fallback = `p_${crypto.randomBytes(8).toString('hex')}`;
    }
    return fallback;
  }

  async resolveFirebaseSessionAsync(input: {
    firebaseUid: string;
    email?: string;
    displayName?: string;
    platform?: PlatformType;
    existingCloudIds?: {
      playerId?: string;
      numericId?: string;
    };
    guestLink?: {
      playerId?: string;
      secretToken?: string;
    };
  }): Promise<{
    profile: RankedProfile;
    secretToken: string;
    created: boolean;
    cloudState: CloudSyncStatePayload | null;
  }> {
    const now = Date.now();
    const uid = input.firebaseUid.trim();
    const boundPlayerId = this.firebaseUidToPlayerId.get(uid);
    const existingBound = boundPlayerId ? this.players.get(boundPlayerId) : undefined;

    if (existingBound) {
      const candidate = this.clonePlayerRecord(existingBound);
      if (!isValidNumericId(candidate.numericId)) {
        candidate.numericId = this.generateUniqueNumericId();
      }
      if (input.email) {
        const cleaned = normalizeEmail(input.email);
        if (cleaned) candidate.email = cleaned;
      }
      if (input.platform) {
        candidate.platform = sanitizePlatform(input.platform);
      }
      this.enforceDeveloperEntitlement(candidate);
      candidate.updatedAt = now;
      await this.commitPlayerCandidateAsync(candidate);
      return {
        profile: this.toPublicProfile(candidate, false, true),
        secretToken: candidate.secretToken,
        created: false,
        cloudState: candidate.cloudState ?? null,
      };
    }

    const cloudPid =
      typeof input.existingCloudIds?.playerId === 'string' &&
      /^[a-zA-Z0-9_-]{3,64}$/.test(input.existingCloudIds.playerId.trim())
        ? input.existingCloudIds.playerId.trim()
        : '';
    const cloudNumeric = isValidNumericId(input.existingCloudIds?.numericId)
      ? input.existingCloudIds!.numericId!.trim()
      : '';

    if (cloudPid && cloudNumeric) {
      const pidRecord = this.players.get(cloudPid);
      const numericOwner = this.numericIdToPlayerId.get(cloudNumeric);
      if (pidRecord && (!pidRecord.firebaseUid || pidRecord.firebaseUid === uid)) {
        const candidate = this.clonePlayerRecord(pidRecord);
        candidate.firebaseUid = uid;
        if (input.email) {
          const cleaned = normalizeEmail(input.email);
          if (cleaned) candidate.email = cleaned;
        }
        if (input.platform) {
          candidate.platform = sanitizePlatform(input.platform);
        }
        this.enforceDeveloperEntitlement(candidate);
        candidate.updatedAt = now;
        await this.commitPlayerCandidateAsync(candidate);
        return {
          profile: this.toPublicProfile(candidate, false, true),
          secretToken: candidate.secretToken,
          created: false,
          cloudState: candidate.cloudState ?? null,
        };
      }
      if (!pidRecord && !numericOwner) {
        const secretToken = crypto.randomBytes(24).toString('hex');
        const suffix = cloudPid.slice(-4).toUpperCase();
        const initialName = sanitizePlayerName(input.displayName, suffix);
        const restored: StoredPlayerRecord = {
          playerId: cloudPid,
          numericId: cloudNumeric,
          firebaseUid: uid,
          email: normalizeEmail(input.email) || undefined,
          secretToken,
          name: initialName,
          usernameChanged: false,
          platform: sanitizePlatform(input.platform),
          gender: null,
          rp: 200,
          tier: getRankTier(200),
          wins: 0,
          kills: 0,
          deaths: 0,
          top3: 0,
          matchesPlayed: 0,
          totalDamage: 0,
          bestKillsInMatch: 0,
          level: 1,
          xp: 0,
          avatarCharacterId: 'char-01',
          vault: createDefaultVaultState(),
          careerMatches: 0,
          careerWins: 0,
          careerKills: 0,
          careerDeaths: 0,
          careerDamage: 0,
          careerBestKills: 0,
          history: [],
          createdAt: now,
          updatedAt: now,
        };
        this.enforceDeveloperEntitlement(restored);
        await this.commitPlayerCandidateAsync(restored);
        return {
          profile: this.toPublicProfile(restored, false, true),
          secretToken,
          created: false,
          cloudState: null,
        };
      }
    }

    const playerId = this.generateUniquePlayerId();
    const secretToken = crypto.randomBytes(24).toString('hex');
    const numericId = this.generateUniqueNumericId();
    const suffix = playerId.slice(-4).toUpperCase();
    let initialName = sanitizePlayerName(input.displayName, suffix);
    const normInit = normalizeNexusUsername(initialName);
    if (normInit.valid && this.usernameLowerToPlayerId.has(normInit.lower)) {
      initialName = `${normInit.cleaned.slice(0, 12)}_${numericId.slice(-4)}`;
    }
    const candidate: StoredPlayerRecord = {
      playerId,
      numericId,
      firebaseUid: uid,
      email: normalizeEmail(input.email) || undefined,
      secretToken,
      name: initialName,
      usernameChanged: false,
      platform: sanitizePlatform(input.platform),
      gender: null,
      rp: 200,
      tier: getRankTier(200),
      wins: 0,
      kills: 0,
      deaths: 0,
      top3: 0,
      matchesPlayed: 0,
      totalDamage: 0,
      bestKillsInMatch: 0,
      level: 1,
      xp: 0,
      avatarCharacterId: 'char-01',
      vault: createDefaultVaultState(),
      careerMatches: 0,
      careerWins: 0,
      careerKills: 0,
      careerDeaths: 0,
      careerDamage: 0,
      careerBestKills: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.commitPlayerCandidateAsync(candidate);
    return {
      profile: this.toPublicProfile(candidate),
      secretToken,
      created: true,
      cloudState: null,
    };
  }

  async syncCloudProfileSnapshotAsync(input: {
    firebaseUid: string;
    email?: string;
    username?: string;
    gender?: PlayerGender | null;
    platform?: PlatformType;
    level?: number;
    xp?: number;
    rp?: number;
    avatarCharacterId?: string;
    totalMatches?: number;
    wins?: number;
    eliminations?: number;
    deaths?: number;
    totalDamage?: number;
    bestKillsInMatch?: number;
    rankedMatches?: number;
    rankedWins?: number;
    rankedKills?: number;
    rankedTop3?: number;
    vault?: Partial<RankedVaultState>;
    cloudState?: Partial<CloudSyncStatePayload>;
  }): Promise<RankedProfile | null> {
    const pid = this.firebaseUidToPlayerId.get(input.firebaseUid.trim());
    const rec = pid ? this.players.get(pid) : undefined;
    if (!rec) return null;

    const candidate = this.clonePlayerRecord(rec);
    const isDev = this.isRecordVerifiedDeveloper(candidate);
    if (input.email) {
      const cleaned = normalizeEmail(input.email);
      if (cleaned) candidate.email = cleaned;
    }
    if (typeof input.username === 'string') {
      const norm = normalizeNexusUsername(input.username);
      if (norm.valid) {
        const owner = this.usernameLowerToPlayerId.get(norm.lower);
        if (!owner || owner === candidate.playerId) {
          candidate.name = norm.cleaned;
        }
      }
    }
    if (input.gender === 'male' || input.gender === 'female') {
      candidate.gender = input.gender;
    }
    if (input.platform) {
      candidate.platform = sanitizePlatform(input.platform);
    }
    if (typeof input.avatarCharacterId === 'string' && input.avatarCharacterId.trim()) {
      candidate.avatarCharacterId = input.avatarCharacterId.trim().slice(0, 32);
    }
    if (input.vault && typeof input.vault === 'object') {
      // Server-authoritative: only sync equipped cosmetic selections for already-owned items (never credits, inventory, XP, RP, or stats)
      candidate.vault = sanitizeVaultState(
        {
          equippedOutfitId: input.vault.equippedOutfitId,
          equippedGliderId: input.vault.equippedGliderId,
          equippedEmoteId: input.vault.equippedEmoteId,
          equippedGlooSkinId: input.vault.equippedGlooSkinId,
          equippedAvatarId: input.vault.equippedAvatarId,
          equippedBannerId: input.vault.equippedBannerId,
          equippedWeaponSkins: input.vault.equippedWeaponSkins,
          equippedEmoteWheel: input.vault.equippedEmoteWheel,
          equippedArmoryIds: input.vault.equippedArmoryIds,
        },
        candidate.vault,
        {
          isDeveloper: isDev,
          enforcePurchaseIntegrity: !isDev,
        },
      );
    }
    this.enforceDeveloperEntitlement(candidate);
    if (input.cloudState && typeof input.cloudState === 'object') {
      candidate.cloudState = sanitizeCloudState(input.cloudState, candidate.cloudState);
    }

    candidate.updatedAt = Date.now();
    await this.commitPlayerCandidateAsync(candidate);
    return this.toPublicProfile(candidate, false, isDev);
  }

  async updateUsernameAsync(input: {
    playerId: string;
    secretToken: string;
    newName: string;
  }): Promise<
    | { ok: true; profile: RankedProfile }
    | { ok: false; status: number; code: string; error: string }
  > {
    const rec = this.players.get(input.playerId);
    if (!rec || !tokensMatch(rec.secretToken, input.secretToken)) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Invalid player credentials.',
      };
    }

    const norm = normalizeNexusUsername(input.newName);
    if (!norm.valid) {
      return {
        ok: false,
        status: 400,
        code: norm.code ?? 'INVALID_USERNAME',
        error: norm.error ?? 'Username must be between 2 and 18 characters.',
      };
    }
    if (norm.lower === rec.name.trim().toLowerCase()) {
      return {
        ok: false,
        status: 400,
        code: 'SAME_USERNAME',
        error: 'New username must be different from your current username.',
      };
    }
    const takenByPid = this.usernameLowerToPlayerId.get(norm.lower);
    if (takenByPid && takenByPid !== rec.playerId) {
      return {
        ok: false,
        status: 409,
        code: 'USERNAME_TAKEN',
        error: 'This username is already taken by another player.',
      };
    }

    const candidate = this.clonePlayerRecord(rec);
    candidate.name = norm.cleaned;
    candidate.usernameChanged = false;
    candidate.updatedAt = Date.now();
    try {
      await this.commitPlayerCandidateAsync(candidate);
    } catch (err) {
      if (err instanceof DatabasePersistenceError) {
        return { ok: false, status: err.status, code: err.code, error: err.message };
      }
      return {
        ok: false,
        status: 503,
        code: 'DATABASE_ERROR',
        error: 'Database write failed. Changes were not saved.',
      };
    }
    return {
      ok: true,
      profile: this.toPublicProfile(candidate),
    };
  }

  async renameOnceAsync(input: {
    playerId: string;
    secretToken: string;
    newName: string;
  }): Promise<
    | { ok: true; profile: RankedProfile }
    | { ok: false; status: number; code: string; error: string }
  > {
    return this.updateUsernameAsync(input);
  }

  async updateGenderAsync(input: {
    playerId: string;
    secretToken: string;
    gender: unknown;
  }): Promise<
    | { ok: true; profile: RankedProfile }
    | { ok: false; status: number; code: string; error: string }
  > {
    const rec = this.players.get(input.playerId);
    if (!rec || !tokensMatch(rec.secretToken, input.secretToken)) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Invalid player credentials.',
      };
    }
    const sanitized = sanitizeGender(input.gender);
    if (!sanitized) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_GENDER',
        error: 'Gender must be either male or female.',
      };
    }
    const candidate = this.clonePlayerRecord(rec);
    candidate.gender = sanitized;
    candidate.updatedAt = Date.now();
    try {
      await this.commitPlayerCandidateAsync(candidate);
    } catch (err) {
      if (err instanceof DatabasePersistenceError) {
        return { ok: false, status: err.status, code: err.code, error: err.message };
      }
      return {
        ok: false,
        status: 503,
        code: 'DATABASE_ERROR',
        error: 'Database write failed. Changes were not saved.',
      };
    }
    return {
      ok: true,
      profile: this.toPublicProfile(candidate),
    };
  }

  async syncAccountProgressionAsync(input: {
    playerId: string;
    secretToken: string;
    level?: number;
    xp?: number;
    avatarCharacterId?: string;
    gender?: unknown;
  }): Promise<RankedProfile | null> {
    const rec = this.players.get(input.playerId);
    if (!rec || !tokensMatch(rec.secretToken, input.secretToken)) {
      return null;
    }

    // Server-authoritative: never accept client-submitted level, xp, rp, credits, or match results
    const candidate = this.clonePlayerRecord(rec);
    const isDev = this.isRecordVerifiedDeveloper(candidate);

    if (typeof input.avatarCharacterId === 'string' && input.avatarCharacterId.trim()) {
      candidate.avatarCharacterId = input.avatarCharacterId.trim().slice(0, 32);
    }

    const sanitizedGender = sanitizeGender(input.gender);
    if (sanitizedGender) {
      candidate.gender = sanitizedGender;
    }

    this.enforceDeveloperEntitlement(candidate);
    candidate.updatedAt = Date.now();
    await this.commitPlayerCandidateAsync(candidate);
    return this.toPublicProfile(candidate, false, isDev);
  }

  async syncVaultStateAsync(input: {
    playerId: string;
    secretToken: string;
    vault: Partial<RankedVaultState>;
  }): Promise<RankedProfile | null> {
    const rec = this.players.get(input.playerId);
    if (!rec || !tokensMatch(rec.secretToken, input.secretToken)) {
      return null;
    }
    const candidate = this.clonePlayerRecord(rec);
    const isDev = this.isRecordVerifiedDeveloper(candidate);
    candidate.vault = sanitizeVaultState(input.vault, candidate.vault, {
      isDeveloper: isDev,
      enforcePurchaseIntegrity: !isDev,
    });
    this.enforceDeveloperEntitlement(candidate);
    candidate.updatedAt = Date.now();
    await this.commitPlayerCandidateAsync(candidate);
    return this.toPublicProfile(candidate, false, isDev);
  }

  async reconcileVerifiedDeveloperSessionAsync(
    firebaseUid: string,
  ): Promise<RankedProfile | null> {
    const cleanedUid = typeof firebaseUid === 'string' ? firebaseUid.trim() : '';
    if (cleanedUid !== DEVELOPER_FIREBASE_UID) return null;
    const pid = this.firebaseUidToPlayerId.get(cleanedUid);
    const rec = pid ? this.players.get(pid) : undefined;
    if (!rec || !this.isRecordVerifiedDeveloper(rec)) return null;
    const candidate = this.clonePlayerRecord(rec);
    const changed = this.enforceDeveloperEntitlement(candidate);
    if (changed) {
      candidate.updatedAt = Date.now();
      await this.commitPlayerCandidateAsync(candidate);
      if (!this.pgRepo) {
        this.writeStoreSync();
      }
      return this.toPublicProfile(candidate, false, true);
    }
    return this.toPublicProfile(rec, false, true);
  }

  verifyCredentials(playerId: string, secretToken: string): RankedProfile | null {
    const rec = this.players.get(playerId);
    if (!rec || !tokensMatch(rec.secretToken, secretToken)) return null;
    return this.toPublicProfile(rec);
  }

  private resolvePlayerRecord(idOrNumericOrUsername: string): StoredPlayerRecord | null {
    const rawTrimmed = idOrNumericOrUsername.trim();
    if (!rawTrimmed || rawTrimmed.length > 64) return null;
    const cleaned = rawTrimmed.replace(/^nx-/i, '');
    let rec = this.players.get(rawTrimmed) ?? this.players.get(cleaned);
    if (!rec) {
      const resolvedId =
        this.numericIdToPlayerId.get(cleaned) ?? this.numericIdToPlayerId.get(rawTrimmed);
      if (resolvedId) {
        rec = this.players.get(resolvedId);
      }
    }
    if (!rec) {
      const byUsername = this.usernameLowerToPlayerId.get(rawTrimmed.toLowerCase());
      if (byUsername) {
        rec = this.players.get(byUsername);
      }
    }
    return rec ?? null;
  }

  getPlayerIdByFirebaseUid(firebaseUid: string): string | null {
    const cleaned = typeof firebaseUid === 'string' ? firebaseUid.trim() : '';
    if (!cleaned) return null;
    return this.firebaseUidToPlayerId.get(cleaned) ?? null;
  }

  verifyCredentialsAndGetId(playerId: string, secretToken: string): string | null {
    const rec = this.players.get(playerId);
    if (!rec || !tokensMatch(rec.secretToken, secretToken)) return null;
    return rec.playerId;
  }

  private toFriendPlayerSummary(rec: StoredPlayerRecord): FriendLookupPlayerSummary {
    const avatarId =
      rec.vault && isValidAvatarId(rec.vault.equippedAvatarId)
        ? rec.vault.equippedAvatarId
        : DEFAULT_AVATAR_ID;
    const bannerId =
      rec.vault && isValidBannerId(rec.vault.equippedBannerId)
        ? rec.vault.equippedBannerId
        : DEFAULT_BANNER_ID;
    return {
      playerId: rec.playerId,
      numericId: rec.numericId,
      name: rec.name,
      tier: rec.tier,
      rp: rec.rp,
      level: typeof rec.level === 'number' && rec.level >= 1 ? Math.floor(rec.level) : 1,
      gender: sanitizeGender(rec.gender),
      avatarId,
      bannerId,
    };
  }

  private toFriendRequestEntry(
    rec: StoredFriendRequestRecord,
    sender: StoredPlayerRecord,
  ): FriendRequestEntry {
    const avatarId =
      sender.vault && isValidAvatarId(sender.vault.equippedAvatarId)
        ? sender.vault.equippedAvatarId
        : DEFAULT_AVATAR_ID;
    return {
      requestId: rec.requestId,
      fromPlayerId: sender.playerId,
      fromNumericId: sender.numericId,
      fromName: sender.name,
      fromTier: sender.tier,
      fromRp: sender.rp,
      fromLevel: typeof sender.level === 'number' && sender.level >= 1 ? Math.floor(sender.level) : 1,
      fromGender: sanitizeGender(sender.gender),
      fromAvatarId: avatarId,
      createdAt: rec.createdAt,
    };
  }

  areFriends(playerIdA: string, playerIdB: string): boolean {
    if (!playerIdA || !playerIdB || playerIdA === playerIdB) return false;
    return this.friendships.has(canonicalFriendshipKey(playerIdA, playerIdB));
  }

  getFriendIds(playerId: string): string[] {
    const set = this.friendsByPlayerId.get(playerId);
    return set ? Array.from(set) : [];
  }

  getIncomingFriendRequests(playerId: string): FriendRequestEntry[] {
    const list: FriendRequestEntry[] = [];
    for (const req of this.friendRequests.values()) {
      if (req.toPlayerId !== playerId) continue;
      const sender = this.players.get(req.fromPlayerId);
      if (!sender) continue;
      list.push(this.toFriendRequestEntry(req, sender));
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }

  getOutgoingFriendRequestTargetIds(playerId: string): string[] {
    const ids: string[] = [];
    for (const req of this.friendRequests.values()) {
      if (req.fromPlayerId === playerId) {
        ids.push(req.toPlayerId);
      }
    }
    return ids;
  }

  getOutgoingFriendRequests(playerId: string): OutgoingFriendRequestEntry[] {
    const list: OutgoingFriendRequestEntry[] = [];
    for (const req of this.friendRequests.values()) {
      if (req.fromPlayerId !== playerId) continue;
      const target = this.players.get(req.toPlayerId);
      if (!target) continue;
      const avatarId =
        target.vault && isValidAvatarId(target.vault.equippedAvatarId)
          ? target.vault.equippedAvatarId
          : DEFAULT_AVATAR_ID;
      list.push({
        requestId: req.requestId,
        toPlayerId: target.playerId,
        toNumericId: target.numericId,
        toName: target.name,
        toTier: target.tier,
        toRp: target.rp,
        toLevel: typeof target.level === 'number' && target.level >= 1 ? Math.floor(target.level) : 1,
        toGender: sanitizeGender(target.gender),
        toAvatarId: avatarId,
        createdAt: req.createdAt,
      });
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }

  lookupPlayerForFriendAdd(input: {
    playerId: string;
    secretToken: string;
    queryId: string;
  }):
    | ({ ok: true } & FriendLookupResponse)
    | { ok: false; status: number; code: string; error: string } {
    const caller = this.players.get(input.playerId);
    if (!caller || !tokensMatch(caller.secretToken, input.secretToken)) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Invalid player credentials.',
      };
    }

    const cleanedQuery = typeof input.queryId === 'string' ? input.queryId.trim() : '';
    if (!cleanedQuery || cleanedQuery.length > 64) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_PLAYER_ID',
        error: 'Enter a valid Player ID.',
      };
    }

    const target = this.resolvePlayerRecord(cleanedQuery);
    if (!target) {
      return {
        ok: false,
        status: 404,
        code: 'PLAYER_NOT_FOUND',
        error: 'No player found with that ID.',
      };
    }

    let relationStatus: FriendRelationStatus = 'none';
    let pendingRequestId: string | undefined;

    if (target.playerId === caller.playerId) {
      relationStatus = 'self';
    } else if (this.areFriends(caller.playerId, target.playerId)) {
      relationStatus = 'friends';
    } else if (this.requestPairToId.has(`${caller.playerId}->${target.playerId}`)) {
      relationStatus = 'outgoing_pending';
      pendingRequestId = this.requestPairToId.get(`${caller.playerId}->${target.playerId}`);
    } else {
      const incomingId = this.requestPairToId.get(`${target.playerId}->${caller.playerId}`);
      if (incomingId) {
        relationStatus = 'incoming_pending';
        pendingRequestId = incomingId;
      }
    }

    return {
      ok: true,
      player: this.toFriendPlayerSummary(target),
      relationStatus,
      pendingRequestId,
    };
  }

  async sendFriendRequestAsync(input: {
    playerId: string;
    secretToken: string;
    targetIdOrNumericId: string;
  }): Promise<
    | {
        ok: true;
        request: FriendRequestEntry;
        fromPlayerId: string;
        toPlayerId: string;
      }
    | { ok: false; status: number; code: string; error: string }
  > {
    const caller = this.players.get(input.playerId);
    if (!caller || !tokensMatch(caller.secretToken, input.secretToken)) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Invalid player credentials.',
      };
    }

    const cleanedTarget =
      typeof input.targetIdOrNumericId === 'string' ? input.targetIdOrNumericId.trim() : '';
    if (!cleanedTarget || cleanedTarget.length > 64) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_PLAYER_ID',
        error: 'Enter a valid Player ID.',
      };
    }

    const target = this.resolvePlayerRecord(cleanedTarget);
    if (!target) {
      return {
        ok: false,
        status: 404,
        code: 'PLAYER_NOT_FOUND',
        error: 'No player found with that ID.',
      };
    }

    if (target.playerId === caller.playerId) {
      return {
        ok: false,
        status: 400,
        code: 'CANNOT_ADD_SELF',
        error: 'You cannot send a friend request to yourself.',
      };
    }

    if (this.areFriends(caller.playerId, target.playerId)) {
      return {
        ok: false,
        status: 409,
        code: 'ALREADY_FRIENDS',
        error: 'You are already friends with this player.',
      };
    }

    const outgoingKey = `${caller.playerId}->${target.playerId}`;
    if (this.requestPairToId.has(outgoingKey)) {
      return {
        ok: false,
        status: 409,
        code: 'REQUEST_ALREADY_SENT',
        error: 'Friend request already sent.',
      };
    }

    const reverseKey = `${target.playerId}->${caller.playerId}`;
    if (this.requestPairToId.has(reverseKey)) {
      return {
        ok: false,
        status: 409,
        code: 'INCOMING_REQUEST_EXISTS',
        error: 'This player already sent you a friend request.',
      };
    }

    const requestId = `fr_${crypto.randomBytes(6).toString('hex')}`;
    const storedReq: StoredFriendRequestRecord = {
      requestId,
      fromPlayerId: caller.playerId,
      toPlayerId: target.playerId,
      createdAt: Date.now(),
    };

    if (this.pgRepo) {
      try {
        const res = await this.pgRepo.commitFriendRequest(storedReq);
        if (!res.inserted) {
          return {
            ok: false,
            status: 409,
            code: 'REQUEST_ALREADY_SENT',
            error: 'Friend request already sent.',
          };
        }
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    this.friendRequests.set(requestId, storedReq);
    this.requestPairToId.set(outgoingKey, requestId);
    if (!this.pgRepo) {
      this.scheduleSave();
    }

    return {
      ok: true,
      request: this.toFriendRequestEntry(storedReq, caller),
      fromPlayerId: caller.playerId,
      toPlayerId: target.playerId,
    };
  }

  async respondToFriendRequestAsync(input: {
    playerId: string;
    secretToken: string;
    requestId: string;
    accept: boolean;
  }): Promise<
    | {
        ok: true;
        accepted: boolean;
        fromPlayerId: string;
        toPlayerId: string;
        responderName: string;
      }
    | { ok: false; status: number; code: string; error: string }
  > {
    const caller = this.players.get(input.playerId);
    if (!caller || !tokensMatch(caller.secretToken, input.secretToken)) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Invalid player credentials.',
      };
    }

    const cleanedReqId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
    if (!cleanedReqId || cleanedReqId.length > 64) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_REQUEST_ID',
        error: 'Invalid friend request identifier.',
      };
    }

    const req = this.friendRequests.get(cleanedReqId);
    if (!req) {
      return {
        ok: false,
        status: 404,
        code: 'REQUEST_NOT_FOUND',
        error: 'Friend request not found or already handled.',
      };
    }

    // Strict authorization check: only the intended receiver may accept or reject
    if (req.toPlayerId !== caller.playerId) {
      return {
        ok: false,
        status: 403,
        code: 'UNAUTHORIZED_REQUEST_ACTION',
        error: 'You are not authorized to respond to this friend request.',
      };
    }

    const friendshipCreatedAt = Date.now();
    if (this.pgRepo) {
      try {
        const res = await this.pgRepo.commitRespondFriendRequest({
          requestId: req.requestId,
          fromPlayerId: req.fromPlayerId,
          toPlayerId: req.toPlayerId,
          accept: Boolean(input.accept),
          friendshipCreatedAt,
        });
        if (res.deletedCount === 0) {
          this.friendRequests.delete(req.requestId);
          this.requestPairToId.delete(`${req.fromPlayerId}->${req.toPlayerId}`);
          return {
            ok: false,
            status: 404,
            code: 'REQUEST_NOT_FOUND',
            error: 'Friend request not found or already handled.',
          };
        }
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    this.friendRequests.delete(req.requestId);
    this.requestPairToId.delete(`${req.fromPlayerId}->${req.toPlayerId}`);
    if (input.accept) {
      const reverseKey = `${req.toPlayerId}->${req.fromPlayerId}`;
      const reverseId = this.requestPairToId.get(reverseKey);
      if (reverseId) {
        this.friendRequests.delete(reverseId);
        this.requestPairToId.delete(reverseKey);
      }
      if (this.players.has(req.fromPlayerId) && this.players.has(req.toPlayerId)) {
        this.addMutualFriendshipInternal(req.fromPlayerId, req.toPlayerId, friendshipCreatedAt);
      }
    }
    if (!this.pgRepo) {
      this.scheduleSave();
    }

    return {
      ok: true,
      accepted: Boolean(input.accept),
      fromPlayerId: req.fromPlayerId,
      toPlayerId: req.toPlayerId,
      responderName: caller.name,
    };
  }

  async cancelFriendRequestAsync(input: {
    playerId: string;
    secretToken: string;
    requestId: string;
  }): Promise<
    | { ok: true; requestId: string; fromPlayerId: string; toPlayerId: string }
    | { ok: false; status: number; code: string; error: string }
  > {
    const caller = this.players.get(input.playerId);
    if (!caller || !tokensMatch(caller.secretToken, input.secretToken)) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Invalid player credentials.',
      };
    }
    const cleanedReqId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
    if (!cleanedReqId || cleanedReqId.length > 64) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_REQUEST_ID',
        error: 'Invalid friend request identifier.',
      };
    }
    const req = this.friendRequests.get(cleanedReqId);
    if (!req) {
      return {
        ok: false,
        status: 404,
        code: 'REQUEST_NOT_FOUND',
        error: 'Friend request not found or already handled.',
      };
    }
    if (req.fromPlayerId !== caller.playerId) {
      return {
        ok: false,
        status: 403,
        code: 'UNAUTHORIZED_REQUEST_ACTION',
        error: 'Only the sender can cancel an outgoing friend request.',
      };
    }

    if (this.pgRepo) {
      try {
        await this.pgRepo.commitDeleteFriendRequest(req.requestId);
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    this.friendRequests.delete(req.requestId);
    this.requestPairToId.delete(`${req.fromPlayerId}->${req.toPlayerId}`);
    if (!this.pgRepo) {
      this.scheduleSave();
    }
    return {
      ok: true,
      requestId: req.requestId,
      fromPlayerId: req.fromPlayerId,
      toPlayerId: req.toPlayerId,
    };
  }

  async removeFriendAsync(input: {
    playerId: string;
    secretToken: string;
    friendPlayerId: string;
  }): Promise<
    | { ok: true; playerId: string; friendPlayerId: string; removerName: string }
    | { ok: false; status: number; code: string; error: string }
  > {
    const caller = this.players.get(input.playerId);
    if (!caller || !tokensMatch(caller.secretToken, input.secretToken)) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        error: 'Invalid player credentials.',
      };
    }
    const cleanedFriend = typeof input.friendPlayerId === 'string' ? input.friendPlayerId.trim() : '';
    const target = this.resolvePlayerRecord(cleanedFriend);
    if (!target) {
      return {
        ok: false,
        status: 404,
        code: 'PLAYER_NOT_FOUND',
        error: 'Friend not found.',
      };
    }
    const key = canonicalFriendshipKey(caller.playerId, target.playerId);
    if (!this.friendships.has(key)) {
      return {
        ok: false,
        status: 404,
        code: 'NOT_FRIENDS',
        error: 'You are not friends with this player.',
      };
    }

    if (this.pgRepo) {
      try {
        await this.pgRepo.commitDeleteFriendship(caller.playerId, target.playerId);
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    this.friendships.delete(key);
    this.friendsByPlayerId.get(caller.playerId)?.delete(target.playerId);
    this.friendsByPlayerId.get(target.playerId)?.delete(caller.playerId);
    if (!this.pgRepo) {
      this.scheduleSave();
    }
    return {
      ok: true,
      playerId: caller.playerId,
      friendPlayerId: target.playerId,
      removerName: caller.name,
    };
  }

  private getMailboxUserStateMap(
    playerId: string,
    createIfMissing = false,
  ): Map<string, StoredMailboxUserItemState> | null {
    let map = this.mailboxUserStates.get(playerId);
    if (!map && createIfMissing) {
      map = new Map<string, StoredMailboxUserItemState>();
      this.mailboxUserStates.set(playerId, map);
    }
    return map ?? null;
  }

  private collectPlayerMailboxRaw(playerId: string): StoredMailboxMessage[] {
    const combined: StoredMailboxMessage[] = [];
    const seen = new Set<string>();
    const direct = this.mailboxDirectMessages.get(playerId) ?? [];
    for (const m of direct) {
      if (!seen.has(m.mailId)) {
        seen.add(m.mailId);
        combined.push(m);
      }
    }
    for (const m of this.mailboxBroadcasts.values()) {
      if (!seen.has(m.mailId)) {
        seen.add(m.mailId);
        combined.push(m);
      }
    }
    return combined;
  }

  buildMailboxSnapshotForPlayer(playerId: string, includeArchived = true): MailboxStateSnapshot {
    const now = Date.now();
    const stateMap = this.getMailboxUserStateMap(playerId, false);
    const rawList = this.collectPlayerMailboxRaw(playerId);
    const messages: MailboxMessageView[] = [];
    let unreadCount = 0;
    let unclaimedRewardCount = 0;

    for (const msg of rawList) {
      if (msg.expiresAt && msg.expiresAt <= now) continue;
      const st = stateMap?.get(msg.mailId);
      if (st?.deletedAt) continue;
      const isArchived = Boolean(st?.archivedAt);
      const isRead = Boolean(st?.readAt);
      const isClaimed = Boolean(st?.claimedAt);
      if (!isArchived) {
        if (!isRead) unreadCount += 1;
        if (msg.rewardCredits > 0 && !isClaimed) unclaimedRewardCount += 1;
      }
      if (!includeArchived && isArchived) continue;
      messages.push({
        mailId: msg.mailId,
        category: msg.category,
        title: msg.title,
        sender: msg.sender,
        content: msg.content,
        createdAt: msg.createdAt,
        expiresAt: msg.expiresAt,
        rewardCredits: msg.rewardCredits,
        isRead,
        isClaimed,
        claimedAt: st?.claimedAt ?? null,
        isArchived,
      });
    }

    messages.sort((a, b) => b.createdAt - a.createdAt);
    return {
      messages,
      unreadCount,
      unclaimedRewardCount,
    };
  }

  async markMailboxReadAsync(input: {
    playerId: string;
    mailId: string;
  }): Promise<
    | { ok: true; state: MailboxStateSnapshot }
    | { ok: false; status: number; code: string; error: string }
  > {
    const rec = this.players.get(input.playerId);
    if (!rec) {
      return { ok: false, status: 404, code: 'PLAYER_NOT_FOUND', error: 'Player not found.' };
    }
    const mailId = typeof input.mailId === 'string' ? input.mailId.trim() : '';
    const msg = this.collectPlayerMailboxRaw(rec.playerId).find((m) => m.mailId === mailId);
    if (!msg) {
      return { ok: false, status: 404, code: 'MAIL_NOT_FOUND', error: 'Message not found.' };
    }
    const existingMap = this.getMailboxUserStateMap(rec.playerId, false);
    const prev = existingMap?.get(mailId) ?? {};
    if (prev.deletedAt) {
      return { ok: false, status: 404, code: 'MAIL_NOT_FOUND', error: 'Message not found.' };
    }
    if (!prev.readAt) {
      const next = { ...prev, readAt: Date.now() };
      if (this.pgRepo) {
        try {
          await this.pgRepo.commitMailboxUserState(rec.playerId, mailId, next);
        } catch (err) {
          const mapped = mapPgErrorToPersistenceFailure(err);
          return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
        }
      }
      const map = this.getMailboxUserStateMap(rec.playerId, true)!;
      map.set(mailId, next);
      if (!this.pgRepo) {
        this.scheduleSave();
      }
    }
    return { ok: true, state: this.buildMailboxSnapshotForPlayer(rec.playerId, true) };
  }

  async claimMailboxRewardAsync(input: {
    playerId: string;
    mailId: string;
  }): Promise<
    | {
        ok: true;
        mailId: string;
        creditsGranted: number;
        newBalance: number;
        vault: RankedVaultState;
        state: MailboxStateSnapshot;
      }
    | { ok: false; status: number; code: string; error: string }
  > {
    const rec = this.players.get(input.playerId);
    if (!rec) {
      return { ok: false, status: 404, code: 'PLAYER_NOT_FOUND', error: 'Player not found.' };
    }
    const mailId = typeof input.mailId === 'string' ? input.mailId.trim() : '';
    const msg = this.collectPlayerMailboxRaw(rec.playerId).find((m) => m.mailId === mailId);
    if (!msg || (msg.expiresAt && msg.expiresAt <= Date.now())) {
      return { ok: false, status: 404, code: 'MAIL_NOT_FOUND', error: 'Message not found or expired.' };
    }
    if (msg.rewardCredits <= 0) {
      return { ok: false, status: 400, code: 'NO_REWARD', error: 'This message has no claimable reward.' };
    }

    const existingMap = this.getMailboxUserStateMap(rec.playerId, false);
    const prev = existingMap?.get(mailId) ?? {};
    if (prev.deletedAt) {
      return { ok: false, status: 404, code: 'MAIL_NOT_FOUND', error: 'Message not found.' };
    }
    if (prev.claimedAt) {
      return {
        ok: false,
        status: 409,
        code: 'ALREADY_CLAIMED',
        error: 'This reward has already been claimed.',
      };
    }

    const now = Date.now();
    const nextUserState: StoredMailboxUserItemState = {
      ...prev,
      readAt: prev.readAt ?? now,
      claimedAt: now,
    };

    const candidate = this.clonePlayerRecord(rec);
    const isDev = this.isRecordVerifiedDeveloper(candidate);
    const currentVault = candidate.vault ?? createDefaultVaultState();
    let creditsGranted = 0;
    if (isDev) {
      candidate.vault = sanitizeVaultState(currentVault, currentVault, { isDeveloper: true });
      creditsGranted = 0;
    } else {
      creditsGranted = msg.rewardCredits;
      candidate.vault = {
        ...currentVault,
        credits: Math.max(0, Math.floor(currentVault.credits) + creditsGranted),
      };
    }
    candidate.updatedAt = now;

    if (this.pgRepo) {
      try {
        const res = await this.pgRepo.commitMailboxClaim({
          player: this.toPersistedPlayerRow(candidate),
          mailId,
          userState: nextUserState,
        });
        if (res.alreadyClaimed) {
          return {
            ok: false,
            status: 409,
            code: 'ALREADY_CLAIMED',
            error: 'This reward has already been claimed.',
          };
        }
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    const map = this.getMailboxUserStateMap(rec.playerId, true)!;
    map.set(mailId, nextUserState);
    this.commitPlayerRecordToMemory(candidate);
    if (!this.pgRepo) {
      this.writeStoreSync();
    }

    return {
      ok: true,
      mailId,
      creditsGranted,
      newBalance: candidate.vault.credits,
      vault: candidate.vault,
      state: this.buildMailboxSnapshotForPlayer(candidate.playerId, true),
    };
  }

  async setMailboxArchivedAsync(input: {
    playerId: string;
    mailId: string;
    archived: boolean;
  }): Promise<
    | { ok: true; state: MailboxStateSnapshot }
    | { ok: false; status: number; code: string; error: string }
  > {
    const rec = this.players.get(input.playerId);
    if (!rec) {
      return { ok: false, status: 404, code: 'PLAYER_NOT_FOUND', error: 'Player not found.' };
    }
    const mailId = typeof input.mailId === 'string' ? input.mailId.trim() : '';
    const msg = this.collectPlayerMailboxRaw(rec.playerId).find((m) => m.mailId === mailId);
    if (!msg) {
      return { ok: false, status: 404, code: 'MAIL_NOT_FOUND', error: 'Message not found.' };
    }
    const existingMap = this.getMailboxUserStateMap(rec.playerId, false);
    const prev = existingMap?.get(mailId) ?? {};
    if (prev.deletedAt) {
      return { ok: false, status: 404, code: 'MAIL_NOT_FOUND', error: 'Message not found.' };
    }
    const next: StoredMailboxUserItemState = { ...prev };
    if (input.archived) {
      next.archivedAt = prev.archivedAt ?? Date.now();
      next.readAt = prev.readAt ?? Date.now();
    } else {
      delete next.archivedAt;
    }

    if (this.pgRepo) {
      try {
        await this.pgRepo.commitMailboxUserState(rec.playerId, mailId, next);
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    const map = this.getMailboxUserStateMap(rec.playerId, true)!;
    map.set(mailId, next);
    if (!this.pgRepo) {
      this.scheduleSave();
    }
    return { ok: true, state: this.buildMailboxSnapshotForPlayer(rec.playerId, true) };
  }

  async deleteMailboxMessageAsync(input: {
    playerId: string;
    mailId: string;
  }): Promise<
    | { ok: true; state: MailboxStateSnapshot }
    | { ok: false; status: number; code: string; error: string }
  > {
    const rec = this.players.get(input.playerId);
    if (!rec) {
      return { ok: false, status: 404, code: 'PLAYER_NOT_FOUND', error: 'Player not found.' };
    }
    const mailId = typeof input.mailId === 'string' ? input.mailId.trim() : '';
    const msg = this.collectPlayerMailboxRaw(rec.playerId).find((m) => m.mailId === mailId);
    if (!msg) {
      return { ok: false, status: 404, code: 'MAIL_NOT_FOUND', error: 'Message not found.' };
    }
    const existingMap = this.getMailboxUserStateMap(rec.playerId, false);
    const prev = existingMap?.get(mailId) ?? {};
    if (msg.rewardCredits > 0 && !prev.claimedAt) {
      return {
        ok: false,
        status: 400,
        code: 'UNCLAIMED_REWARD',
        error: 'Claim the reward before deleting this message.',
      };
    }
    const nextState: StoredMailboxUserItemState = {
      ...prev,
      readAt: prev.readAt ?? Date.now(),
      deletedAt: Date.now(),
    };

    if (this.pgRepo) {
      try {
        await this.pgRepo.commitMailboxUserState(rec.playerId, mailId, nextState);
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    const map = this.getMailboxUserStateMap(rec.playerId, true)!;
    map.set(mailId, nextState);
    if (!this.pgRepo) {
      this.scheduleSave();
    }
    return { ok: true, state: this.buildMailboxSnapshotForPlayer(rec.playerId, true) };
  }

  async sendDeveloperMailboxMessageAsync(input: {
    category: MailboxCategory;
    title: string;
    sender?: string;
    content: string;
    rewardCredits?: number;
    targetQuery?: string;
  }): Promise<
    | { ok: true; mail: StoredMailboxMessage; targetPlayerIds: string[] | 'all' }
    | { ok: false; status: number; code: string; error: string }
  > {
    const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
    const content = typeof input.content === 'string' ? input.content.trim().slice(0, 2000) : '';
    if (title.length < 2 || content.length < 2) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_MAIL_CONTENT',
        error: 'Title and message content are required.',
      };
    }
    const category: MailboxCategory =
      input.category === 'system' ||
      input.category === 'developer' ||
      input.category === 'notification' ||
      input.category === 'reward'
        ? input.category
        : 'developer';
    const rewardCredits =
      typeof input.rewardCredits === 'number' && Number.isFinite(input.rewardCredits) && input.rewardCredits > 0
        ? Math.min(100_000, Math.floor(input.rewardCredits))
        : 0;
    const mail: StoredMailboxMessage = {
      mailId: `mail_${crypto.randomBytes(6).toString('hex')}`,
      category: rewardCredits > 0 && category !== 'developer' ? 'reward' : category,
      title,
      sender:
        typeof input.sender === 'string' && input.sender.trim()
          ? input.sender.trim().slice(0, 64)
          : 'karizma · Creator',
      content,
      createdAt: Date.now(),
      expiresAt: null,
      rewardCredits,
    };

    const targetQuery = typeof input.targetQuery === 'string' ? input.targetQuery.trim() : '';
    if (targetQuery) {
      const targetRec = this.resolvePlayerRecord(targetQuery);
      if (!targetRec) {
        return {
          ok: false,
          status: 404,
          code: 'PLAYER_NOT_FOUND',
          error: 'Target player not found.',
        };
      }
      if (this.pgRepo) {
        try {
          await this.pgRepo.commitMailboxDirectMessage(targetRec.playerId, mail);
        } catch (err) {
          const mapped = mapPgErrorToPersistenceFailure(err);
          return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
        }
      }
      const list = this.mailboxDirectMessages.get(targetRec.playerId) ?? [];
      list.unshift(mail);
      this.mailboxDirectMessages.set(targetRec.playerId, list);
      if (!this.pgRepo) {
        this.writeStoreSync();
      }
      return { ok: true, mail, targetPlayerIds: [targetRec.playerId] };
    }

    if (this.pgRepo) {
      try {
        await this.pgRepo.commitMailboxBroadcast(mail);
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        return { ok: false, status: mapped.status, code: mapped.code, error: mapped.error };
      }
    }

    this.mailboxBroadcasts.set(mail.mailId, mail);
    if (!this.pgRepo) {
      this.writeStoreSync();
    }
    return { ok: true, mail, targetPlayerIds: 'all' };
  }

  getFirebaseUidByPlayerId(playerId: string): string | null {
    const rec = this.resolvePlayerRecord(playerId);
    return rec?.firebaseUid ?? null;
  }

  getProfile(idOrNumericId: string, stripPrivateVault = false): RankedProfile | null {
    const rec = this.resolvePlayerRecord(idOrNumericId);
    return rec ? this.toPublicProfile(rec, stripPrivateVault) : null;
  }

  getLeaderboard(limit = 50): LeaderboardEntry[] {
    const all = Array.from(this.players.values());
    all.sort((a, b) => {
      if (b.rp !== a.rp) return b.rp - a.rp;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.createdAt - b.createdAt;
    });

    return all.slice(0, Math.max(1, limit)).map((rec, idx) => ({
      rank: idx + 1,
      playerId: rec.playerId,
      numericId: rec.numericId,
      name: rec.name,
      platform: rec.platform,
      gender: sanitizeGender(rec.gender),
      level: typeof rec.level === 'number' && rec.level >= 1 ? Math.floor(rec.level) : 1,
      avatarId:
        rec.vault && isValidAvatarId(rec.vault.equippedAvatarId)
          ? rec.vault.equippedAvatarId
          : DEFAULT_AVATAR_ID,
      bannerId:
        rec.vault && isValidBannerId(rec.vault.equippedBannerId)
          ? rec.vault.equippedBannerId
          : DEFAULT_BANNER_ID,
      rp: rec.rp,
      tier: rec.tier,
      wins: rec.wins,
      kills: rec.kills,
      deaths: rec.deaths,
      matchesPlayed: rec.matchesPlayed,
    }));
  }

  async recordMatchOutcomeAsync(input: {
    playerId: string;
    matchId: string;
    mapId: RankedMapId;
    placement: number;
    totalPlayers: number;
    kills: number;
    damage: number;
    survivedSec: number;
    died: boolean;
  }): Promise<{
    rpBefore: number;
    rpAfter: number;
    rpDelta: number;
    tierBefore: RankTier;
    tierAfter: RankTier;
    profile: RankedProfile;
  } | null> {
    const rec = this.players.get(input.playerId);
    if (!rec) return null;

    const existingHist = rec.history.find((h) => h.matchId === input.matchId);
    if (existingHist) {
      return {
        rpBefore: existingHist.rpBefore,
        rpAfter: existingHist.rpAfter,
        rpDelta: existingHist.rpDelta,
        tierBefore: getRankTier(existingHist.rpBefore),
        tierAfter: existingHist.tierAfter,
        profile: this.toPublicProfile(rec),
      };
    }

    const candidate = this.clonePlayerRecord(rec);
    const isDev = this.isRecordVerifiedDeveloper(candidate);
    const rpBefore = candidate.rp;
    const tierBefore = candidate.tier;
    const { rpDelta, rpAfter } = calculateMatchRpDelta({
      currentRp: rpBefore,
      placement: input.placement,
      totalPlayers: input.totalPlayers,
      kills: input.kills,
      damage: input.damage,
      survivedSec: input.survivedSec,
    });
    const tierAfter = getRankTier(rpAfter);

    candidate.rp = rpAfter;
    candidate.tier = tierAfter;
    candidate.matchesPlayed += 1;
    candidate.careerMatches = (candidate.careerMatches ?? 0) + 1;
    if (input.placement === 1) {
      candidate.wins += 1;
      candidate.careerWins = (candidate.careerWins ?? 0) + 1;
    }
    if (input.placement <= 3) {
      candidate.top3 += 1;
    }
    const safeKills = Math.max(0, input.kills);
    const safeDmg = Math.max(0, Math.round(input.damage));
    candidate.kills += safeKills;
    candidate.careerKills = (candidate.careerKills ?? 0) + safeKills;
    if (input.died) {
      candidate.deaths += 1;
      candidate.careerDeaths = (candidate.careerDeaths ?? 0) + 1;
    }
    candidate.totalDamage += safeDmg;
    candidate.careerDamage = (candidate.careerDamage ?? 0) + safeDmg;
    if (input.kills > candidate.bestKillsInMatch) {
      candidate.bestKillsInMatch = input.kills;
    }
    candidate.careerBestKills = Math.max(candidate.careerBestKills ?? 0, safeKills);

    // Server-authoritative XP & level progression from simulated match
    if (!isDev) {
      const xpGain = Math.min(
        220,
        40 + safeKills * 15 + (input.placement === 1 ? 65 : input.placement <= 3 ? 30 : 0),
      );
      let curLvl = Math.max(1, Math.min(300, candidate.level ?? 1));
      let curXp = Math.max(0, candidate.xp ?? 0) + xpGain;
      let needed = computeNextLevelXp(curLvl);
      while (curXp >= needed && curLvl < 300) {
        curXp -= needed;
        curLvl += 1;
        needed = computeNextLevelXp(curLvl);
      }
      candidate.level = curLvl;
      candidate.xp = curXp;
    } else {
      this.enforceDeveloperEntitlement(candidate);
    }

    const now = Date.now();
    candidate.updatedAt = now;

    const histEntry: RankedMatchHistoryEntry = {
      matchId: input.matchId,
      mapId: input.mapId,
      placement: input.placement,
      totalPlayers: input.totalPlayers,
      kills: input.kills,
      damage: Math.round(input.damage),
      survivedSec: Math.round(input.survivedSec),
      rpBefore,
      rpAfter,
      rpDelta,
      tierAfter,
      timestamp: now,
    };
    candidate.history.unshift(histEntry);
    if (candidate.history.length > MAX_HISTORY_ENTRIES) {
      candidate.history.length = MAX_HISTORY_ENTRIES;
    }

    if (this.pgRepo) {
      try {
        const res = await this.pgRepo.commitMatchOutcome(
          this.toPersistedPlayerRow(candidate),
          histEntry,
        );
        if (!res.inserted) {
          return {
            rpBefore,
            rpAfter: rec.rp,
            rpDelta: 0,
            tierBefore,
            tierAfter: rec.tier,
            profile: this.toPublicProfile(rec),
          };
        }
      } catch (err) {
        const mapped = mapPgErrorToPersistenceFailure(err);
        throw new DatabasePersistenceError(mapped.status, mapped.code, mapped.error);
      }
    }

    this.commitPlayerRecordToMemory(candidate);
    if (!this.pgRepo) {
      this.scheduleSave();
    }
    return {
      rpBefore,
      rpAfter,
      rpDelta,
      tierBefore,
      tierAfter,
      profile: this.toPublicProfile(candidate),
    };
  }
}
