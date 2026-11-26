import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applicationDefault, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  DEVELOPER_CREDITS,
  DEVELOPER_FIREBASE_UID,
  DEVELOPER_LEVEL,
  DEVELOPER_NUMERIC_ID,
  DEVELOPER_PLAYER_ID,
  isDeveloperPlayerIdentity,
} from '../server/DeveloperPrivileges.ts';
import {
  RankedStore,
  type StoredFriendRequestRecord,
  type StoredFriendshipRecord,
  type StoredMailboxMessage,
  type StoredMailboxUserItemState,
} from '../server/RankedStore.ts';
import { getConfiguredDatabaseUrl, PostgresDatabase } from '../server/db/PostgresPool.ts';
import type { PersistedPlayerRow } from '../server/db/PostgresStoreRepository.ts';
import {
  getRankTier,
  type CloudSyncStatePayload,
  type MailboxCategory,
  type PlatformType,
  type PlayerGender,
  type RankedMapId,
  type RankedMatchHistoryEntry,
  type RankedVaultState,
  type RankTier,
} from '../src/ranked/RankedTypes.ts';
import { createAndVerifyRankedStoreBackup } from './backup-ranked-store.ts';

interface FirebaseTargetConfig {
  projectId: string;
  firestoreDatabaseId: string;
  sourceFile: string;
}

interface RawRankedStoreFile {
  version?: number;
  players?: Record<string, PersistedPlayerRow>;
  friendships?: StoredFriendshipRecord[];
  friendRequests?: StoredFriendRequestRecord[];
  mailboxBroadcasts?: StoredMailboxMessage[];
  mailboxDirectMessages?: Record<string, StoredMailboxMessage[]>;
  mailboxUserStates?: Record<string, Record<string, StoredMailboxUserItemState>>;
}

interface SourceStatusReport {
  status: 'ok' | 'not_present' | 'not_configured' | 'error';
  detail?: string;
  errorCode?: string;
  errorMessage?: string;
  counts: Record<string, number>;
}

interface AuditIssue {
  severity: 'critical' | 'warning' | 'info';
  category:
    | 'duplicate_identity'
    | 'missing_field'
    | 'tier_mismatch'
    | 'developer_drift'
    | 'orphaned_relation'
    | 'unsynchronized_source'
    | 'conflicting_record';
  source: string;
  subject: string;
  message: string;
  details?: Record<string, unknown>;
}

interface AuthUserSafeSummary {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  disabled: boolean;
  providerIds: string[];
  creationTime: string | null;
  lastSignInTime: string | null;
}

interface FirestoreExportResult {
  projectId: string;
  databaseId: string;
  status: 'ok' | 'partial' | 'error';
  collections: Record<
    string,
    {
      status: 'ok' | 'error';
      count: number;
      errorCode?: string;
      errorMessage?: string;
      docs: Array<{ id: string; data: Record<string, unknown> }>;
    }
  >;
}

interface AuthExportResult {
  projectId: string;
  status: 'ok' | 'error';
  userCount: number;
  errorCode?: string;
  errorMessage?: string;
  users: AuthUserSafeSummary[];
}

interface RestoreVerificationReport {
  liveDataRestoreChecked: boolean;
  livePlayersVerified: number;
  syntheticRoundTripVerified: boolean;
  syntheticSha256Matched: boolean;
  syntheticEntitiesVerified: {
    players: number;
    friendships: number;
    friendRequests: number;
    mailboxBroadcasts: number;
    mailboxDirectMessages: number;
    mailboxUserStates: number;
    historyEntries: number;
  };
  errors: string[];
}

const FIRESTORE_COLLECTIONS = [
  'players',
  'publicProfiles',
  'playerIdIndex',
  'usernames',
  'friendRequests',
  'friendships',
  'presence',
  'parties',
  'partyMemberships',
  'partyInvites',
  'matchHistory',
  'mailboxBroadcasts',
  'mailboxDirectMessages',
  'mailboxUserStates',
] as const;

function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadFirebaseConfigs(): {
  target: FirebaseTargetConfig | null;
  legacy: FirebaseTargetConfig | null;
} {
  const androidCfgPath = path.resolve(
    process.cwd(),
    'android',
    'app',
    'src',
    'main',
    'assets',
    'firebase-client-config.json',
  );
  const appletCfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');

  const readCfg = (filePath: string): FirebaseTargetConfig | null => {
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      if (!parsed.projectId) return null;
      return {
        projectId: parsed.projectId,
        firestoreDatabaseId: parsed.firestoreDatabaseId || '(default)',
        sourceFile: path.relative(process.cwd(), filePath),
      };
    } catch {
      return null;
    }
  };

  const androidCfg = readCfg(androidCfgPath);
  const appletCfg = readCfg(appletCfgPath);

  const target = androidCfg ?? appletCfg;
  const legacy =
    appletCfg &&
    target &&
    (appletCfg.projectId !== target.projectId ||
      appletCfg.firestoreDatabaseId !== target.firestoreDatabaseId)
      ? appletCfg
      : null;

  return { target, legacy };
}

function serializeFirestoreValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(serializeFirestoreValue);
  const maybeTs = val as { toMillis?: () => number; toDate?: () => Date };
  if (typeof maybeTs.toMillis === 'function') {
    return { _type: 'Timestamp', ms: maybeTs.toMillis() };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out[k] = serializeFirestoreValue(v);
  }
  return out;
}

function toFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function readPostgresReadOnly(dbUrl: string): Promise<{
  report: SourceStatusReport;
  schemaMigrations: Array<Record<string, unknown>>;
  players: PersistedPlayerRow[];
  friendships: StoredFriendshipRecord[];
  friendRequests: StoredFriendRequestRecord[];
  mailboxBroadcasts: StoredMailboxMessage[];
  mailboxDirectMessages: Record<string, StoredMailboxMessage[]>;
  mailboxUserStates: Record<string, Record<string, StoredMailboxUserItemState>>;
}> {
  const empty = {
    schemaMigrations: [] as Array<Record<string, unknown>>,
    players: [] as PersistedPlayerRow[],
    friendships: [] as StoredFriendshipRecord[],
    friendRequests: [] as StoredFriendRequestRecord[],
    mailboxBroadcasts: [] as StoredMailboxMessage[],
    mailboxDirectMessages: {} as Record<string, StoredMailboxMessage[]>,
    mailboxUserStates: {} as Record<string, Record<string, StoredMailboxUserItemState>>,
  };

  const db = new PostgresDatabase(dbUrl);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const regRes = await client.query<{
      players: string | null;
      ranked_match_history: string | null;
      friendships: string | null;
      friend_requests: string | null;
      mailbox_broadcasts: string | null;
      mailbox_direct_messages: string | null;
      mailbox_user_states: string | null;
      schema_migrations: string | null;
    }>(`
      SELECT
        to_regclass('public.players') AS players,
        to_regclass('public.ranked_match_history') AS ranked_match_history,
        to_regclass('public.friendships') AS friendships,
        to_regclass('public.friend_requests') AS friend_requests,
        to_regclass('public.mailbox_broadcasts') AS mailbox_broadcasts,
        to_regclass('public.mailbox_direct_messages') AS mailbox_direct_messages,
        to_regclass('public.mailbox_user_states') AS mailbox_user_states,
        to_regclass('public.schema_migrations') AS schema_migrations
    `);

    const reg = regRes.rows[0];
    if (!reg?.players) {
      await client.query('COMMIT');
      return {
        ...empty,
        report: {
          status: 'not_present',
          detail: 'PostgreSQL reachable, but public.players table does not exist yet.',
          counts: {},
        },
      };
    }

    if (reg.schema_migrations) {
      const migRes = await client.query<Record<string, unknown>>(
        'SELECT migration_id, checksum, applied_at, details FROM schema_migrations ORDER BY applied_at ASC',
      );
      empty.schemaMigrations = migRes.rows;
    }

    const historyByPlayer = new Map<string, RankedMatchHistoryEntry[]>();
    if (reg.ranked_match_history) {
      const histRes = await client.query<{
        match_id: string;
        player_id: string;
        map_id: string;
        placement: number;
        total_players: number;
        kills: number;
        damage: number;
        rp_before: number;
        rp_after: number;
        rp_delta: number;
        tier_after: string;
        duration_sec: number;
        played_at: string | number;
      }>(
        `SELECT match_id, player_id, map_id, placement, total_players, kills, damage,
                rp_before, rp_after, rp_delta, tier_after, duration_sec, played_at
         FROM ranked_match_history
         ORDER BY played_at DESC, id DESC`,
      );
      for (const row of histRes.rows) {
        const list = historyByPlayer.get(row.player_id) ?? [];
        list.push({
          matchId: row.match_id,
          mapId: row.map_id as RankedMapId,
          placement: toFiniteNumber(row.placement, 1),
          totalPlayers: toFiniteNumber(row.total_players, 1),
          kills: toFiniteNumber(row.kills, 0),
          damage: toFiniteNumber(row.damage, 0),
          survivedSec: toFiniteNumber(row.duration_sec, 0),
          rpBefore: toFiniteNumber(row.rp_before, 200),
          rpAfter: toFiniteNumber(row.rp_after, 200),
          rpDelta: toFiniteNumber(row.rp_delta, 0),
          tierAfter: row.tier_after as RankTier,
          timestamp: toFiniteNumber(row.played_at, Date.now()),
        });
        historyByPlayer.set(row.player_id, list);
      }
    }

    const playersRes = await client.query<{
      player_id: string;
      numeric_id: string;
      firebase_uid: string | null;
      email: string | null;
      secret_token: string;
      name: string;
      username_changed: boolean;
      platform: string;
      gender: string | null;
      avatar_character_id: string;
      rp: number;
      tier: string;
      wins: number;
      kills: number;
      deaths: number;
      top3: number;
      matches_played: number;
      total_damage: number;
      best_kills_in_match: number;
      level: number;
      xp: number;
      career_matches: number;
      career_wins: number;
      career_kills: number;
      career_deaths: number;
      career_damage: number;
      career_best_kills: number;
      vault: RankedVaultState;
      cloud_state: CloudSyncStatePayload | null;
      created_at: string | number;
      updated_at: string | number;
    }>('SELECT * FROM players ORDER BY created_at ASC');

    for (const r of playersRes.rows) {
      empty.players.push({
        playerId: r.player_id,
        numericId: r.numeric_id,
        firebaseUid: r.firebase_uid ?? undefined,
        email: r.email ?? undefined,
        secretToken: r.secret_token,
        name: r.name,
        usernameChanged: Boolean(r.username_changed),
        platform: r.platform as PlatformType,
        gender: (r.gender as PlayerGender | null) ?? null,
        avatarCharacterId: r.avatar_character_id,
        rp: toFiniteNumber(r.rp, 200),
        tier: r.tier as RankTier,
        wins: toFiniteNumber(r.wins, 0),
        kills: toFiniteNumber(r.kills, 0),
        deaths: toFiniteNumber(r.deaths, 0),
        top3: toFiniteNumber(r.top3, 0),
        matchesPlayed: toFiniteNumber(r.matches_played, 0),
        totalDamage: toFiniteNumber(r.total_damage, 0),
        bestKillsInMatch: toFiniteNumber(r.best_kills_in_match, 0),
        level: toFiniteNumber(r.level, 1),
        xp: toFiniteNumber(r.xp, 0),
        careerMatches: toFiniteNumber(r.career_matches, 0),
        careerWins: toFiniteNumber(r.career_wins, 0),
        careerKills: toFiniteNumber(r.career_kills, 0),
        careerDeaths: toFiniteNumber(r.career_deaths, 0),
        careerDamage: toFiniteNumber(r.career_damage, 0),
        careerBestKills: toFiniteNumber(r.career_best_kills, 0),
        vault: r.vault,
        cloudState: r.cloud_state ?? undefined,
        history: historyByPlayer.get(r.player_id) ?? [],
        createdAt: toFiniteNumber(r.created_at, 0),
        updatedAt: toFiniteNumber(r.updated_at, 0),
      });
    }

    if (reg.friendships) {
      const frRes = await client.query<{
        player_a: string;
        player_b: string;
        created_at: string | number;
      }>('SELECT player_a, player_b, created_at FROM friendships');
      for (const r of frRes.rows) {
        empty.friendships.push({
          playerA: r.player_a,
          playerB: r.player_b,
          createdAt: toFiniteNumber(r.created_at, 0),
        });
      }
    }

    if (reg.friend_requests) {
      const reqRes = await client.query<{
        request_id: string;
        from_player_id: string;
        to_player_id: string;
        created_at: string | number;
      }>('SELECT request_id, from_player_id, to_player_id, created_at FROM friend_requests');
      for (const r of reqRes.rows) {
        empty.friendRequests.push({
          requestId: r.request_id,
          fromPlayerId: r.from_player_id,
          toPlayerId: r.to_player_id,
          createdAt: toFiniteNumber(r.created_at, 0),
        });
      }
    }

    if (reg.mailbox_broadcasts) {
      const bRes = await client.query<{
        mail_id: string;
        category: string;
        title: string;
        sender: string;
        content: string;
        created_at: string | number;
        expires_at: string | number | null;
        reward_credits: number;
      }>('SELECT * FROM mailbox_broadcasts ORDER BY created_at DESC');
      for (const r of bRes.rows) {
        empty.mailboxBroadcasts.push({
          mailId: r.mail_id,
          category: r.category as MailboxCategory,
          title: r.title,
          sender: r.sender,
          content: r.content,
          createdAt: toFiniteNumber(r.created_at, 0),
          expiresAt: r.expires_at === null ? null : toFiniteNumber(r.expires_at, 0),
          rewardCredits: toFiniteNumber(r.reward_credits, 0),
        });
      }
    }

    if (reg.mailbox_direct_messages) {
      const dRes = await client.query<{
        mail_id: string;
        recipient_player_id: string;
        category: string;
        title: string;
        sender: string;
        content: string;
        created_at: string | number;
        expires_at: string | number | null;
        reward_credits: number;
      }>('SELECT * FROM mailbox_direct_messages ORDER BY created_at DESC');
      for (const r of dRes.rows) {
        const list = empty.mailboxDirectMessages[r.recipient_player_id] ?? [];
        list.push({
          mailId: r.mail_id,
          category: r.category as MailboxCategory,
          title: r.title,
          sender: r.sender,
          content: r.content,
          createdAt: toFiniteNumber(r.created_at, 0),
          expiresAt: r.expires_at === null ? null : toFiniteNumber(r.expires_at, 0),
          rewardCredits: toFiniteNumber(r.reward_credits, 0),
        });
        empty.mailboxDirectMessages[r.recipient_player_id] = list;
      }
    }

    if (reg.mailbox_user_states) {
      const sRes = await client.query<{
        player_id: string;
        mail_id: string;
        read_at: string | number | null;
        claimed_at: string | number | null;
        archived_at: string | number | null;
        deleted_at: string | number | null;
      }>('SELECT * FROM mailbox_user_states');
      for (const r of sRes.rows) {
        const map = empty.mailboxUserStates[r.player_id] ?? {};
        map[r.mail_id] = {
          ...(r.read_at !== null ? { readAt: toFiniteNumber(r.read_at, 0) } : {}),
          ...(r.claimed_at !== null ? { claimedAt: toFiniteNumber(r.claimed_at, 0) } : {}),
          ...(r.archived_at !== null ? { archivedAt: toFiniteNumber(r.archived_at, 0) } : {}),
          ...(r.deleted_at !== null ? { deletedAt: toFiniteNumber(r.deleted_at, 0) } : {}),
        };
        empty.mailboxUserStates[r.player_id] = map;
      }
    }

    await client.query('COMMIT');

    const totalHistory = Array.from(historyByPlayer.values()).reduce((sum, a) => sum + a.length, 0);
    const totalDirect = Object.values(empty.mailboxDirectMessages).reduce((sum, a) => sum + a.length, 0);
    const totalUserStates = Object.values(empty.mailboxUserStates).reduce(
      (sum, m) => sum + Object.keys(m).length,
      0,
    );

    return {
      ...empty,
      report: {
        status: 'ok',
        detail: 'PostgreSQL read-only export completed.',
        counts: {
          players: empty.players.length,
          matchHistory: totalHistory,
          friendships: empty.friendships.length,
          friendRequests: empty.friendRequests.length,
          mailboxBroadcasts: empty.mailboxBroadcasts.length,
          mailboxDirectMessages: totalDirect,
          mailboxUserStates: totalUserStates,
        },
      },
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback error
    }
    const e = err as { code?: string; message?: string };
    return {
      ...empty,
      report: {
        status: 'error',
        errorCode: typeof e?.code === 'string' ? e.code : 'PG_READ_ERROR',
        errorMessage: e instanceof Error ? e.message : String(err),
        counts: {},
      },
    };
  } finally {
    client.release();
    await db.close();
  }
}

async function readFirestoreReadOnly(
  cfg: FirebaseTargetConfig,
  appName: string,
): Promise<{ result: FirestoreExportResult; app: App }> {
  const app = initializeApp(
    {
      credential: applicationDefault(),
      projectId: cfg.projectId,
    },
    appName,
  );
  const db =
    cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)'
      ? getFirestore(app, cfg.firestoreDatabaseId)
      : getFirestore(app);

  const collections: FirestoreExportResult['collections'] = {};
  let okCount = 0;
  let errCount = 0;

  for (const name of FIRESTORE_COLLECTIONS) {
    try {
      const snap = await db.collection(name).get();
      const docs = snap.docs.map((d) => ({
        id: d.id,
        data: serializeFirestoreValue(d.data()) as Record<string, unknown>,
      }));
      collections[name] = {
        status: 'ok',
        count: docs.length,
        docs,
      };
      okCount += 1;
    } catch (err) {
      const e = err as { code?: unknown; message?: string };
      collections[name] = {
        status: 'error',
        count: 0,
        errorCode: e?.code !== undefined ? String(e.code) : 'FIRESTORE_READ_ERROR',
        errorMessage: e instanceof Error ? e.message : String(err),
        docs: [],
      };
      errCount += 1;
    }
  }

  return {
    app,
    result: {
      projectId: cfg.projectId,
      databaseId: cfg.firestoreDatabaseId,
      status: errCount === 0 ? 'ok' : okCount > 0 ? 'partial' : 'error',
      collections,
    },
  };
}

async function readFirebaseAuthReadOnly(app: App, projectId: string): Promise<AuthExportResult> {
  try {
    const auth = getAuth(app);
    const users: AuthUserSafeSummary[] = [];
    let nextPageToken: string | undefined;

    do {
      const page = await auth.listUsers(1000, nextPageToken);
      for (const u of page.users as UserRecord[]) {
        users.push({
          uid: u.uid,
          email: u.email ?? null,
          emailVerified: Boolean(u.emailVerified),
          displayName: u.displayName ?? null,
          disabled: Boolean(u.disabled),
          providerIds: u.providerData.map((p) => p.providerId),
          creationTime: u.metadata?.creationTime ?? null,
          lastSignInTime: u.metadata?.lastSignInTime ?? null,
        });
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);

    return {
      projectId,
      status: 'ok',
      userCount: users.length,
      users,
    };
  } catch (err) {
    const e = err as { code?: unknown; message?: string };
    return {
      projectId,
      status: 'error',
      userCount: 0,
      errorCode: e?.code !== undefined ? String(e.code) : 'AUTH_LIST_ERROR',
      errorMessage: e instanceof Error ? e.message : String(err),
      users: [],
    };
  }
}

function auditSinglePlayerCollection(
  sourceLabel: string,
  players: PersistedPlayerRow[],
  friendships: StoredFriendshipRecord[],
  friendRequests: StoredFriendRequestRecord[],
  mailboxBroadcasts: StoredMailboxMessage[],
  mailboxDirectMessages: Record<string, StoredMailboxMessage[]>,
  mailboxUserStates: Record<string, Record<string, StoredMailboxUserItemState>>,
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const playerMap = new Map<string, PersistedPlayerRow>();
  const byNumeric = new Map<string, string[]>();
  const byUid = new Map<string, string[]>();
  const byNameLower = new Map<string, string[]>();
  const byEmailLower = new Map<string, string[]>();

  for (const p of players) {
    if (playerMap.has(p.playerId)) {
      issues.push({
        severity: 'critical',
        category: 'duplicate_identity',
        source: sourceLabel,
        subject: p.playerId,
        message: `Duplicate playerId "${p.playerId}" found in ${sourceLabel}.`,
      });
    }
    playerMap.set(p.playerId, p);

    const numKey = (p.numericId || '').trim();
    if (!/^\d{8,12}$/.test(numKey)) {
      issues.push({
        severity: 'warning',
        category: 'missing_field',
        source: sourceLabel,
        subject: p.playerId,
        message: `Player "${p.playerId}" has missing or non-standard numericId ("${numKey}").`,
      });
    } else {
      const list = byNumeric.get(numKey) ?? [];
      list.push(p.playerId);
      byNumeric.set(numKey, list);
    }

    if (p.firebaseUid) {
      const uid = p.firebaseUid.trim();
      const list = byUid.get(uid) ?? [];
      list.push(p.playerId);
      byUid.set(uid, list);
    }

    const nameLower = (p.name || '').trim().toLowerCase();
    if (!nameLower) {
      issues.push({
        severity: 'warning',
        category: 'missing_field',
        source: sourceLabel,
        subject: p.playerId,
        message: `Player "${p.playerId}" has an empty username.`,
      });
    } else {
      const list = byNameLower.get(nameLower) ?? [];
      list.push(p.playerId);
      byNameLower.set(nameLower, list);
    }

    if (p.email) {
      const emailLower = p.email.trim().toLowerCase();
      const list = byEmailLower.get(emailLower) ?? [];
      list.push(p.playerId);
      byEmailLower.set(emailLower, list);
    }

    const expectedTier = getRankTier(p.rp);
    if (p.tier !== expectedTier) {
      issues.push({
        severity: 'warning',
        category: 'tier_mismatch',
        source: sourceLabel,
        subject: p.playerId,
        message: `Tier mismatch for "${p.playerId}": stored "${p.tier}" vs computed "${expectedTier}" at ${p.rp} RP.`,
      });
    }

    if (!p.vault || !Array.isArray(p.vault.ownedIds)) {
      issues.push({
        severity: 'critical',
        category: 'missing_field',
        source: sourceLabel,
        subject: p.playerId,
        message: `Player "${p.playerId}" is missing a valid vault object.`,
      });
    }

    if (
      isDeveloperPlayerIdentity({
        firebaseUid: p.firebaseUid,
        playerId: p.playerId,
        numericId: p.numericId,
      })
    ) {
      if (
        p.playerId !== DEVELOPER_PLAYER_ID ||
        p.numericId !== DEVELOPER_NUMERIC_ID ||
        p.firebaseUid !== DEVELOPER_FIREBASE_UID ||
        p.level !== DEVELOPER_LEVEL ||
        (p.vault?.credits ?? 0) < DEVELOPER_CREDITS
      ) {
        issues.push({
          severity: 'warning',
          category: 'developer_drift',
          source: sourceLabel,
          subject: p.playerId,
          message: `Developer account identity or entitlement differs from expected defaults.`,
        });
      }
    }
  }

  for (const [num, ids] of byNumeric.entries()) {
    if (ids.length > 1) {
      issues.push({
        severity: 'critical',
        category: 'duplicate_identity',
        source: sourceLabel,
        subject: num,
        message: `Duplicate numericId "${num}" assigned to multiple players.`,
        details: { playerIds: ids },
      });
    }
  }
  for (const [uid, ids] of byUid.entries()) {
    if (ids.length > 1) {
      issues.push({
        severity: 'critical',
        category: 'duplicate_identity',
        source: sourceLabel,
        subject: uid,
        message: `Duplicate firebaseUid "${uid}" linked to multiple players.`,
        details: { playerIds: ids },
      });
    }
  }
  for (const [nameLower, ids] of byNameLower.entries()) {
    if (ids.length > 1) {
      const boundIds = ids.filter((id) => Boolean(playerMap.get(id)?.firebaseUid));
      issues.push({
        severity: boundIds.length > 1 ? 'critical' : 'warning',
        category: 'duplicate_identity',
        source: sourceLabel,
        subject: nameLower,
        message: `Username "${nameLower}" appears on ${ids.length} records (${boundIds.length} bound to Firebase).`,
        details: { playerIds: ids, boundPlayerIds: boundIds },
      });
    }
  }
  for (const [emailLower, ids] of byEmailLower.entries()) {
    if (ids.length > 1) {
      issues.push({
        severity: 'warning',
        category: 'duplicate_identity',
        source: sourceLabel,
        subject: emailLower,
        message: `Email "${emailLower}" appears on ${ids.length} player records.`,
        details: { playerIds: ids },
      });
    }
  }

  const friendshipKeys = new Set<string>();
  for (const f of friendships) {
    if (f.playerA === f.playerB || !playerMap.has(f.playerA) || !playerMap.has(f.playerB)) {
      issues.push({
        severity: 'warning',
        category: 'orphaned_relation',
        source: sourceLabel,
        subject: `${f.playerA}<->${f.playerB}`,
        message: `Orphaned or self-referential friendship (${f.playerA}, ${f.playerB}).`,
      });
    } else {
      const key = f.playerA < f.playerB ? `${f.playerA}:${f.playerB}` : `${f.playerB}:${f.playerA}`;
      friendshipKeys.add(key);
    }
  }

  for (const r of friendRequests) {
    if (
      r.fromPlayerId === r.toPlayerId ||
      !playerMap.has(r.fromPlayerId) ||
      !playerMap.has(r.toPlayerId)
    ) {
      issues.push({
        severity: 'warning',
        category: 'orphaned_relation',
        source: sourceLabel,
        subject: r.requestId,
        message: `Orphaned friend request "${r.requestId}" (${r.fromPlayerId} -> ${r.toPlayerId}).`,
      });
    } else {
      const pairKey =
        r.fromPlayerId < r.toPlayerId
          ? `${r.fromPlayerId}:${r.toPlayerId}`
          : `${r.toPlayerId}:${r.fromPlayerId}`;
      if (friendshipKeys.has(pairKey)) {
        issues.push({
          severity: 'warning',
          category: 'conflicting_record',
          source: sourceLabel,
          subject: r.requestId,
          message: `Pending friend request "${r.requestId}" exists between players who are already friends.`,
        });
      }
    }
  }

  const allMailIds = new Set<string>(mailboxBroadcasts.map((b) => b.mailId));
  for (const [recipientPid, list] of Object.entries(mailboxDirectMessages)) {
    if (!playerMap.has(recipientPid)) {
      issues.push({
        severity: 'warning',
        category: 'orphaned_relation',
        source: sourceLabel,
        subject: recipientPid,
        message: `Direct mailbox messages exist for unknown playerId "${recipientPid}".`,
      });
    }
    for (const m of list) {
      allMailIds.add(m.mailId);
    }
  }

  for (const [pid, stateMap] of Object.entries(mailboxUserStates)) {
    if (!playerMap.has(pid)) {
      issues.push({
        severity: 'warning',
        category: 'orphaned_relation',
        source: sourceLabel,
        subject: pid,
        message: `Mailbox user states exist for unknown playerId "${pid}".`,
      });
    }
    for (const mailId of Object.keys(stateMap)) {
      if (!allMailIds.has(mailId)) {
        issues.push({
          severity: 'info',
          category: 'orphaned_relation',
          source: sourceLabel,
          subject: `${pid}:${mailId}`,
          message: `Mailbox user state references mailId "${mailId}" not found in broadcasts/direct mail.`,
        });
      }
    }
  }

  return issues;
}

function auditCrossSourceSync(params: {
  pgPlayers: PersistedPlayerRow[];
  jsonPlayers: PersistedPlayerRow[];
  firestoreTarget: FirestoreExportResult | null;
  authTarget: AuthExportResult | null;
}): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const { pgPlayers, jsonPlayers, firestoreTarget, authTarget } = params;

  const pgById = new Map(pgPlayers.map((p) => [p.playerId, p]));
  const jsonById = new Map(jsonPlayers.map((p) => [p.playerId, p]));

  if (pgPlayers.length > 0 && jsonPlayers.length > 0) {
    for (const jp of jsonPlayers) {
      const pp = pgById.get(jp.playerId);
      if (!pp) {
        issues.push({
          severity: 'warning',
          category: 'unsynchronized_source',
          source: 'postgresql_vs_ranked_store_json',
          subject: jp.playerId,
          message: `Player "${jp.playerId}" (${jp.name}) exists in ranked-store.json but is missing from PostgreSQL.`,
        });
      } else if (
        pp.numericId !== jp.numericId ||
        pp.rp !== jp.rp ||
        pp.level !== jp.level ||
        pp.xp !== jp.xp
      ) {
        issues.push({
          severity: 'warning',
          category: 'conflicting_record',
          source: 'postgresql_vs_ranked_store_json',
          subject: jp.playerId,
          message: `Field divergence between PostgreSQL and ranked-store.json for "${jp.playerId}".`,
          details: {
            pg: { numericId: pp.numericId, rp: pp.rp, level: pp.level, xp: pp.xp },
            json: { numericId: jp.numericId, rp: jp.rp, level: jp.level, xp: jp.xp },
          },
        });
      }
    }
    for (const pp of pgPlayers) {
      if (!jsonById.has(pp.playerId)) {
        issues.push({
          severity: 'info',
          category: 'unsynchronized_source',
          source: 'postgresql_vs_ranked_store_json',
          subject: pp.playerId,
          message: `Player "${pp.playerId}" exists in PostgreSQL only (not in ranked-store.json).`,
        });
      }
    }
  }

  if (firestoreTarget && firestoreTarget.collections.players?.status === 'ok') {
    const fsPlayersByUid = new Map(
      firestoreTarget.collections.players.docs.map((d) => [d.id, d.data]),
    );
    const fsPublicByUid = new Map(
      (firestoreTarget.collections.publicProfiles?.docs ?? []).map((d) => [d.id, d.data]),
    );

    const authoritativePlayers = pgPlayers.length > 0 ? pgPlayers : jsonPlayers;
    for (const p of authoritativePlayers) {
      if (!p.firebaseUid) {
        issues.push({
          severity: 'info',
          category: 'unsynchronized_source',
          source: 'backend_vs_firestore',
          subject: p.playerId,
          message: `Player "${p.playerId}" (${p.name}) is a guest/unbound record with no firebaseUid.`,
        });
        continue;
      }
      const fsPriv = fsPlayersByUid.get(p.firebaseUid);
      const fsPub = fsPublicByUid.get(p.firebaseUid);
      if (!fsPriv || !fsPub) {
        issues.push({
          severity: 'warning',
          category: 'unsynchronized_source',
          source: 'backend_vs_firestore',
          subject: p.playerId,
          message: `Bound player "${p.playerId}" (uid=${p.firebaseUid}) is missing ${!fsPriv ? 'players/{uid}' : ''}${!fsPriv && !fsPub ? ' and ' : ''}${!fsPub ? 'publicProfiles/{uid}' : ''} in Firestore.`,
        });
        continue;
      }
      if (
        String(fsPub.playerId ?? '') !== p.playerId ||
        String(fsPub.numericId ?? '') !== p.numericId ||
        Number(fsPub.rp ?? -1) !== p.rp ||
        Number(fsPub.level ?? -1) !== p.level
      ) {
        issues.push({
          severity: 'warning',
          category: 'conflicting_record',
          source: 'backend_vs_firestore',
          subject: p.playerId,
          message: `Firestore publicProfiles/{uid} differs from authoritative backend record for "${p.playerId}".`,
        });
      }
    }

    if (authTarget?.status === 'ok') {
      for (const u of authTarget.users) {
        if (!fsPlayersByUid.has(u.uid) || !fsPublicByUid.has(u.uid)) {
          issues.push({
            severity: 'warning',
            category: 'unsynchronized_source',
            source: 'firebase_auth_vs_firestore',
            subject: u.uid,
            message: `Firebase Auth user "${u.uid}" (${u.email ?? 'no-email'}) has incomplete Firestore profile docs.`,
          });
        }
      }
    }
  }

  return issues;
}

async function runRestoreVerification(params: {
  liveSnapshot: RawRankedStoreFile | null;
}): Promise<RestoreVerificationReport> {
  const report: RestoreVerificationReport = {
    liveDataRestoreChecked: false,
    livePlayersVerified: 0,
    syntheticRoundTripVerified: false,
    syntheticSha256Matched: false,
    syntheticEntitiesVerified: {
      players: 0,
      friendships: 0,
      friendRequests: 0,
      mailboxBroadcasts: 0,
      mailboxDirectMessages: 0,
      mailboxUserStates: 0,
      historyEntries: 0,
    },
    errors: [],
  };

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-phase1-restore-'));
  try {
    // 1. If live records exist, test restoring them into an isolated RankedStore instance
    if (params.liveSnapshot && Object.keys(params.liveSnapshot.players ?? {}).length > 0) {
      const liveRestorePath = path.join(tempRoot, 'live-restore.json');
      fs.writeFileSync(liveRestorePath, JSON.stringify(params.liveSnapshot, null, 2), 'utf8');
      const liveStore = new RankedStore(liveRestorePath, { disablePostgres: true });
      await liveStore.init();
      const restoredCount = Object.keys(params.liveSnapshot.players ?? {}).length;
      let matched = 0;
      for (const expected of Object.values(params.liveSnapshot.players ?? {})) {
        const loaded = liveStore.getProfile(expected.playerId);
        if (
          loaded &&
          loaded.playerId === expected.playerId &&
          loaded.numericId === expected.numericId &&
          loaded.rp === expected.rp &&
          loaded.level === expected.level &&
          loaded.xp === expected.xp &&
          loaded.vault?.credits === expected.vault?.credits &&
          loaded.history.length === (expected.history?.length ?? 0)
        ) {
          matched += 1;
        } else {
          report.errors.push(`Live restore mismatch for player ${expected.playerId}`);
        }
      }
      await liveStore.close();
      report.liveDataRestoreChecked = true;
      report.livePlayersVerified = matched;
      if (matched !== restoredCount) {
        report.errors.push(`Expected ${restoredCount} live players restored, verified ${matched}`);
      }
    }

    // 2. Deterministic synthetic round-trip restore verification (isolated temp dir)
    const now = Date.now();
    const syntheticStorePath = path.join(tempRoot, 'synthetic-ranked-store.json');
    const syntheticBackupDir = path.join(tempRoot, 'backups');

    const defaultVault: RankedVaultState = {
      credits: 4500,
      ownedIds: ['glider-nexus-standard', 'emote-amber-flare', 'shop-avatar-recruit', 'shop-banner-standard'],
      equippedOutfitId: null,
      equippedGliderId: 'glider-nexus-standard',
      equippedEmoteId: 'emote-amber-flare',
      equippedGlooSkinId: 'shop-gloo-arctic-classic',
      equippedAvatarId: 'avatar-recruit',
      equippedBannerId: 'banner-standard',
      equippedWeaponSkins: { ar_m4: 'skin-crimson' },
      equippedEmoteWheel: ['dance-floss', null, null, null, null, null, null, null],
      equippedArmoryIds: {},
    };

    const syntheticFixture: RawRankedStoreFile = {
      version: 1,
      players: {
        'nx-p-alpha001': {
          playerId: 'nx-p-alpha001',
          numericId: '100000001',
          firebaseUid: 'uid-alpha-001',
          email: 'alpha@example.com',
          secretToken: 'synthetic-token-alpha-001',
          name: 'AlphaTester',
          usernameChanged: false,
          platform: 'pc',
          gender: 'male',
          avatarCharacterId: 'char-01',
          rp: 1450,
          tier: getRankTier(1450),
          wins: 4,
          kills: 19,
          deaths: 7,
          top3: 8,
          matchesPlayed: 11,
          totalDamage: 3250,
          bestKillsInMatch: 6,
          level: 14,
          xp: 185,
          careerMatches: 18,
          careerWins: 6,
          careerKills: 29,
          careerDeaths: 12,
          careerDamage: 5100,
          careerBestKills: 6,
          vault: defaultVault,
          history: [
            {
              matchId: 'match-synth-1',
              mapId: 'br-island',
              placement: 1,
              totalPlayers: 16,
              kills: 6,
              damage: 910,
              survivedSec: 420,
              rpBefore: 1390,
              rpAfter: 1450,
              rpDelta: 60,
              tierAfter: getRankTier(1450),
              timestamp: now - 60_000,
            },
          ],
          createdAt: now - 86_400_000,
          updatedAt: now - 60_000,
        },
        'nx-p-bravo002': {
          playerId: 'nx-p-bravo002',
          numericId: '100000002',
          firebaseUid: 'uid-bravo-002',
          email: 'bravo@example.com',
          secretToken: 'synthetic-token-bravo-002',
          name: 'BravoTester',
          usernameChanged: false,
          platform: 'android',
          gender: 'female',
          avatarCharacterId: 'char-01',
          rp: 850,
          tier: getRankTier(850),
          wins: 1,
          kills: 5,
          deaths: 4,
          top3: 2,
          matchesPlayed: 5,
          totalDamage: 1200,
          bestKillsInMatch: 3,
          level: 6,
          xp: 45,
          careerMatches: 5,
          careerWins: 1,
          careerKills: 5,
          careerDeaths: 4,
          careerDamage: 1200,
          careerBestKills: 3,
          vault: defaultVault,
          history: [],
          createdAt: now - 43_200_000,
          updatedAt: now - 20_000,
        },
        [DEVELOPER_PLAYER_ID]: {
          playerId: DEVELOPER_PLAYER_ID,
          numericId: DEVELOPER_NUMERIC_ID,
          firebaseUid: DEVELOPER_FIREBASE_UID,
          email: 'dev@example.com',
          secretToken: 'synthetic-token-dev-001',
          name: 'karizma',
          usernameChanged: false,
          platform: 'pc',
          gender: 'male',
          avatarCharacterId: 'char-01',
          rp: 4200,
          tier: getRankTier(4200),
          wins: 12,
          kills: 48,
          deaths: 3,
          top3: 15,
          matchesPlayed: 16,
          totalDamage: 11200,
          bestKillsInMatch: 11,
          level: DEVELOPER_LEVEL,
          xp: 0,
          careerMatches: 20,
          careerWins: 15,
          careerKills: 60,
          careerDeaths: 4,
          careerDamage: 14000,
          careerBestKills: 11,
          vault: { ...defaultVault, credits: DEVELOPER_CREDITS },
          history: [],
          createdAt: now - 172_800_000,
          updatedAt: now - 30_000,
        },
      },
      friendships: [
        {
          playerA: [DEVELOPER_PLAYER_ID, 'nx-p-alpha001'].sort()[0],
          playerB: [DEVELOPER_PLAYER_ID, 'nx-p-alpha001'].sort()[1],
          createdAt: now - 50_000,
        },
      ],
      friendRequests: [
        {
          requestId: 'fr_synth_001',
          fromPlayerId: 'nx-p-bravo002',
          toPlayerId: DEVELOPER_PLAYER_ID,
          createdAt: now - 10_000,
        },
      ],
      mailboxBroadcasts: [
        {
          mailId: 'mail_synth_broadcast_1',
          category: 'system',
          title: 'Phase 1 Restore Test',
          sender: 'NEXUS COMMAND',
          content: 'Verification message for non-destructive restore audit.',
          createdAt: now - 20_000,
          expiresAt: null,
          rewardCredits: 250,
        },
      ],
      mailboxDirectMessages: {
        'nx-p-alpha001': [
          {
            mailId: 'mail_synth_dm_1',
            category: 'reward',
            title: 'Direct Reward Test',
            sender: 'karizma · Creator',
            content: 'Direct reward preservation check.',
            createdAt: now - 15_000,
            expiresAt: null,
            rewardCredits: 500,
          },
        ],
      },
      mailboxUserStates: {
        'nx-p-alpha001': {
          mail_synth_broadcast_1: { readAt: now - 5_000 },
        },
      },
    };

    fs.writeFileSync(syntheticStorePath, JSON.stringify(syntheticFixture, null, 2), 'utf8');
    const verifiedBackup = createAndVerifyRankedStoreBackup({
      sourcePath: syntheticStorePath,
      backupDir: syntheticBackupDir,
    });

    const restoredFilePath = path.join(tempRoot, 'restored-target.json');
    fs.copyFileSync(verifiedBackup.backupPath, restoredFilePath);
    const restoredHash = sha256Text(fs.readFileSync(restoredFilePath, 'utf8'));
    report.syntheticSha256Matched = restoredHash === verifiedBackup.sha256;

    const store = new RankedStore(restoredFilePath, { disablePostgres: true });
    await store.init();

    const p1 = store.getProfile('nx-p-alpha001');
    const p2 = store.getProfile('nx-p-bravo002');
    const pDev = store.getProfile(DEVELOPER_PLAYER_ID);
    const friendIds = store.getFriendIds('nx-p-alpha001');
    const devIncoming = store.getIncomingFriendRequests(DEVELOPER_PLAYER_ID);
    const mailboxSnap = store.buildMailboxSnapshotForPlayer('nx-p-alpha001', true);

    const p1Ok =
      Boolean(p1) &&
      p1!.numericId === '100000001' &&
      p1!.rp === 1450 &&
      p1!.tier === getRankTier(1450) &&
      p1!.level === 14 &&
      p1!.xp === 185 &&
      p1!.vault?.credits === 4500 &&
      p1!.history.length === 1;
    const p2Ok =
      Boolean(p2) &&
      p2!.numericId === '100000002' &&
      p2!.rp === 850 &&
      p2!.level === 6;
    const pDevOk =
      Boolean(pDev) &&
      pDev!.numericId === DEVELOPER_NUMERIC_ID &&
      pDev!.level === DEVELOPER_LEVEL &&
      (pDev!.vault?.credits ?? 0) >= DEVELOPER_CREDITS;
    const friendOk = friendIds.includes(DEVELOPER_PLAYER_ID);
    const reqOk = devIncoming.some((r) => r.requestId === 'fr_synth_001');
    const mailOk =
      mailboxSnap.messages.some((m) => m.mailId === 'mail_synth_broadcast_1' && m.isRead) &&
      mailboxSnap.messages.some((m) => m.mailId === 'mail_synth_dm_1' && m.rewardCredits === 500);

    await store.close();

    report.syntheticEntitiesVerified = {
      players: (p1Ok ? 1 : 0) + (p2Ok ? 1 : 0) + (pDevOk ? 1 : 0),
      friendships: friendOk ? 1 : 0,
      friendRequests: reqOk ? 1 : 0,
      mailboxBroadcasts: mailboxSnap.messages.filter((m) => m.mailId === 'mail_synth_broadcast_1').length,
      mailboxDirectMessages: mailboxSnap.messages.filter((m) => m.mailId === 'mail_synth_dm_1').length,
      mailboxUserStates: mailboxSnap.messages.some((m) => m.mailId === 'mail_synth_broadcast_1' && m.isRead) ? 1 : 0,
      historyEntries: p1?.history.length ?? 0,
    };

    report.syntheticRoundTripVerified =
      report.syntheticSha256Matched && p1Ok && p2Ok && pDevOk && friendOk && reqOk && mailOk;

    if (!report.syntheticRoundTripVerified) {
      report.errors.push('Synthetic restore verification failed one or more field checks.');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return report;
}

function readCliArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    const val = process.argv[idx + 1]?.trim();
    return val ? val : null;
  }
  return null;
}

async function main(): Promise<void> {
  const createdAtIso = new Date().toISOString();
  const stamp = createdAtIso.replace(/[:.]/g, '-');
  const backupRoot = path.resolve(process.cwd(), 'data', 'backups', `phase1-${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });

  const { target: targetFirebaseCfg, legacy: legacyFirebaseCfg } = loadFirebaseConfigs();

  // 1. Source A: data/ranked-store.json (read-only; never create if absent)
  const customStoreArg = readCliArg('--store-path') ?? process.env.RANKED_STORE_PATH?.trim() ?? null;
  const storePath = customStoreArg
    ? path.resolve(process.cwd(), customStoreArg)
    : path.resolve(process.cwd(), 'data', 'ranked-store.json');
  let jsonStoreData: RawRankedStoreFile | null = null;
  let jsonReport: SourceStatusReport;

  if (fs.existsSync(storePath)) {
    try {
      const rawText = fs.readFileSync(storePath, 'utf8');
      jsonStoreData = JSON.parse(rawText) as RawRankedStoreFile;
      const players = Object.values(jsonStoreData.players ?? {});
      const totalHistory = players.reduce(
        (sum, p) => sum + (Array.isArray(p.history) ? p.history.length : 0),
        0,
      );
      const totalDirect = Object.values(jsonStoreData.mailboxDirectMessages ?? {}).reduce(
        (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
        0,
      );
      const totalStates = Object.values(jsonStoreData.mailboxUserStates ?? {}).reduce(
        (sum, m) => sum + Object.keys(m ?? {}).length,
        0,
      );
      jsonReport = {
        status: 'ok',
        detail: `Loaded data/ranked-store.json (sha256=${sha256Text(rawText).slice(0, 16)}...)`,
        counts: {
          players: players.length,
          matchHistory: totalHistory,
          friendships: (jsonStoreData.friendships ?? []).length,
          friendRequests: (jsonStoreData.friendRequests ?? []).length,
          mailboxBroadcasts: (jsonStoreData.mailboxBroadcasts ?? []).length,
          mailboxDirectMessages: totalDirect,
          mailboxUserStates: totalStates,
        },
      };
    } catch (err) {
      jsonReport = {
        status: 'error',
        errorCode: 'JSON_PARSE_ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
        counts: {},
      };
    }
  } else {
    jsonReport = {
      status: 'not_present',
      detail: 'data/ranked-store.json does not exist in workspace (not created).',
      counts: {},
    };
  }

  // 2. Source B: PostgreSQL (read-only)
  const dbUrl = getConfiguredDatabaseUrl();
  let pgData: Awaited<ReturnType<typeof readPostgresReadOnly>> | null = null;
  let pgReport: SourceStatusReport;
  if (!dbUrl) {
    pgReport = {
      status: 'not_configured',
      detail: 'DATABASE_URL / POSTGRES_URL / NEON_DATABASE_URL is not set in environment.',
      counts: {},
    };
  } else {
    pgData = await readPostgresReadOnly(dbUrl);
    pgReport = pgData.report;
  }

  // 3 & 4. Sources C & D: Firestore + Firebase Auth (read-only)
  let targetFirestore: FirestoreExportResult | null = null;
  let legacyFirestore: FirestoreExportResult | null = null;
  let targetAuth: AuthExportResult | null = null;
  const adminAppsToClean: App[] = [];

  try {
    if (targetFirebaseCfg) {
      const targetRead = await readFirestoreReadOnly(targetFirebaseCfg, 'phase1-audit-target');
      adminAppsToClean.push(targetRead.app);
      targetFirestore = targetRead.result;
      targetAuth = await readFirebaseAuthReadOnly(targetRead.app, targetFirebaseCfg.projectId);
    }
    if (legacyFirebaseCfg) {
      const legacyRead = await readFirestoreReadOnly(legacyFirebaseCfg, 'phase1-audit-legacy');
      adminAppsToClean.push(legacyRead.app);
      legacyFirestore = legacyRead.result;
    }
  } finally {
    await Promise.all(adminAppsToClean.map((a) => deleteApp(a).catch(() => {})));
  }

  // Optional Firebase CLI export fallback (--auth-export <path>) if Admin Auth listing is blocked
  const authExportArg = readCliArg('--auth-export');
  if (authExportArg && targetAuth && targetAuth.status !== 'ok') {
    const authExportPath = path.resolve(process.cwd(), authExportArg);
    if (fs.existsSync(authExportPath)) {
      const parsedAuth = JSON.parse(fs.readFileSync(authExportPath, 'utf8')) as {
        users?: Array<{
          localId?: string;
          email?: string;
          emailVerified?: boolean;
          displayName?: string;
          disabled?: boolean;
          providerUserInfo?: Array<{ providerId?: string }>;
          createdAt?: string;
          lastSignedInAt?: string;
        }>;
      };
      const importedUsers: AuthUserSafeSummary[] = (parsedAuth.users ?? [])
        .filter((u) => typeof u.localId === 'string' && u.localId.length > 0)
        .map((u) => ({
          uid: u.localId!,
          email: u.email ?? null,
          emailVerified: Boolean(u.emailVerified),
          displayName: u.displayName ?? null,
          disabled: Boolean(u.disabled),
          providerIds: (u.providerUserInfo ?? [])
            .map((p) => p.providerId)
            .filter((p): p is string => Boolean(p)),
          creationTime: u.createdAt ?? null,
          lastSignInTime: u.lastSignedInAt ?? null,
        }));
      targetAuth = {
        projectId: targetAuth.projectId,
        status: 'ok',
        userCount: importedUsers.length,
        users: importedUsers,
      };
    }
  }

  // 5. Audit all extracted sources
  const auditIssues: AuditIssue[] = [];
  if (jsonStoreData && jsonReport.status === 'ok') {
    auditIssues.push(
      ...auditSinglePlayerCollection(
        'ranked_store_json',
        Object.values(jsonStoreData.players ?? {}),
        jsonStoreData.friendships ?? [],
        jsonStoreData.friendRequests ?? [],
        jsonStoreData.mailboxBroadcasts ?? [],
        jsonStoreData.mailboxDirectMessages ?? {},
        jsonStoreData.mailboxUserStates ?? {},
      ),
    );
  }
  if (pgData && pgReport.status === 'ok') {
    auditIssues.push(
      ...auditSinglePlayerCollection(
        'postgresql',
        pgData.players,
        pgData.friendships,
        pgData.friendRequests,
        pgData.mailboxBroadcasts,
        pgData.mailboxDirectMessages,
        pgData.mailboxUserStates,
      ),
    );
  }

  auditIssues.push(
    ...auditCrossSourceSync({
      pgPlayers: pgData?.players ?? [],
      jsonPlayers: Object.values(jsonStoreData?.players ?? {}),
      firestoreTarget: targetFirestore,
      authTarget: targetAuth,
    }),
  );

  // Flag dual-project configuration mismatch
  if (targetFirebaseCfg && legacyFirebaseCfg) {
    auditIssues.push({
      severity: 'warning',
      category: 'unsynchronized_source',
      source: 'workspace_firebase_configs',
      subject: `${targetFirebaseCfg.projectId} vs ${legacyFirebaseCfg.projectId}`,
      message: `Config split detected: ${targetFirebaseCfg.sourceFile} targets "${targetFirebaseCfg.projectId}" while ${legacyFirebaseCfg.sourceFile} targets "${legacyFirebaseCfg.projectId}". Kept untouched in Phase 1.`,
    });
  }

  // Build restorable live snapshot if PG or JSON yielded players
  let liveSnapshotForRestore: RawRankedStoreFile | null = null;
  if (pgData && pgData.players.length > 0) {
    liveSnapshotForRestore = {
      version: 1,
      players: Object.fromEntries(pgData.players.map((p) => [p.playerId, p])),
      friendships: pgData.friendships,
      friendRequests: pgData.friendRequests,
      mailboxBroadcasts: pgData.mailboxBroadcasts,
      mailboxDirectMessages: pgData.mailboxDirectMessages,
      mailboxUserStates: pgData.mailboxUserStates,
    };
  } else if (jsonStoreData && Object.keys(jsonStoreData.players ?? {}).length > 0) {
    liveSnapshotForRestore = jsonStoreData;
  }

  // 6. Run non-destructive read + restore verification
  const restoreVerification = await runRestoreVerification({
    liveSnapshot: liveSnapshotForRestore,
  });

  // 7. Write backup bundle + checksums + readback verification
  const fullBackupPayload = {
    schemaVersion: 'phase1-backup-v1',
    createdAt: createdAtIso,
    sources: {
      rankedStoreJson: {
        status: jsonReport,
        data: jsonStoreData,
      },
      postgresql: {
        status: pgReport,
        schemaMigrations: pgData?.schemaMigrations ?? [],
        data: pgData
          ? {
              players: pgData.players,
              friendships: pgData.friendships,
              friendRequests: pgData.friendRequests,
              mailboxBroadcasts: pgData.mailboxBroadcasts,
              mailboxDirectMessages: pgData.mailboxDirectMessages,
              mailboxUserStates: pgData.mailboxUserStates,
            }
          : null,
      },
      firestoreTarget: targetFirestore,
      firestoreLegacyApplet: legacyFirestore,
      firebaseAuthTarget: targetAuth,
    },
  };

  const fullBackupText = JSON.stringify(fullBackupPayload, null, 2);
  const fullBackupPath = path.join(backupRoot, 'full-backup.json');
  fs.writeFileSync(fullBackupPath, fullBackupText, 'utf8');
  const fullBackupVerifySha = sha256Text(fs.readFileSync(fullBackupPath, 'utf8'));
  const expectedFullBackupSha = sha256Text(fullBackupText);
  if (fullBackupVerifySha !== expectedFullBackupSha) {
    throw new Error('full-backup.json SHA-256 readback mismatch');
  }

  const uniqueLivePlayerKeys = new Set<string>();
  for (const p of pgData?.players ?? []) {
    uniqueLivePlayerKeys.add(p.firebaseUid ? `uid:${p.firebaseUid}` : `pid:${p.playerId}`);
  }
  for (const p of Object.values(jsonStoreData?.players ?? {})) {
    uniqueLivePlayerKeys.add(p.firebaseUid ? `uid:${p.firebaseUid}` : `pid:${p.playerId}`);
  }
  for (const doc of targetFirestore?.collections.players?.docs ?? []) {
    uniqueLivePlayerKeys.add(`uid:${doc.id}`);
  }
  for (const doc of targetFirestore?.collections.publicProfiles?.docs ?? []) {
    uniqueLivePlayerKeys.add(`uid:${doc.id}`);
  }

  const livePlayerRecordSummary = {
    rankedStoreJsonPlayers: Object.keys(jsonStoreData?.players ?? {}).length,
    postgresPlayers: pgData?.players.length ?? 0,
    firestoreTargetPlayers: targetFirestore?.collections.players?.count ?? 0,
    firestoreTargetPublicProfiles: targetFirestore?.collections.publicProfiles?.count ?? 0,
    firebaseAuthUsers: targetAuth?.userCount ?? 0,
    uniqueCombinedLivePlayers: uniqueLivePlayerKeys.size,
  };

  const auditReportPayload = {
    schemaVersion: 'phase1-audit-v1',
    createdAt: createdAtIso,
    targetFirebase: targetFirebaseCfg,
    legacyAppletFirebase: legacyFirebaseCfg,
    livePlayerRecordSummary,
    sourceStatuses: {
      rankedStoreJson: jsonReport,
      postgresql: pgReport,
      firestoreTarget: targetFirestore
        ? {
            projectId: targetFirestore.projectId,
            databaseId: targetFirestore.databaseId,
            status: targetFirestore.status,
            collections: Object.fromEntries(
              Object.entries(targetFirestore.collections).map(([k, v]) => [
                k,
                {
                  status: v.status,
                  count: v.count,
                  ...(v.errorCode ? { errorCode: v.errorCode } : {}),
                  ...(v.errorMessage ? { errorMessage: v.errorMessage } : {}),
                },
              ]),
            ),
          }
        : null,
      firestoreLegacyApplet: legacyFirestore
        ? {
            projectId: legacyFirestore.projectId,
            databaseId: legacyFirestore.databaseId,
            status: legacyFirestore.status,
            collections: Object.fromEntries(
              Object.entries(legacyFirestore.collections).map(([k, v]) => [
                k,
                {
                  status: v.status,
                  count: v.count,
                  ...(v.errorCode ? { errorCode: v.errorCode } : {}),
                  ...(v.errorMessage ? { errorMessage: v.errorMessage } : {}),
                },
              ]),
            ),
          }
        : null,
      firebaseAuthTarget: targetAuth
        ? {
            projectId: targetAuth.projectId,
            status: targetAuth.status,
            userCount: targetAuth.userCount,
            ...(targetAuth.errorCode ? { errorCode: targetAuth.errorCode } : {}),
            ...(targetAuth.errorMessage ? { errorMessage: targetAuth.errorMessage } : {}),
          }
        : null,
    },
    auditSummary: {
      totalIssues: auditIssues.length,
      critical: auditIssues.filter((i) => i.severity === 'critical').length,
      warning: auditIssues.filter((i) => i.severity === 'warning').length,
      info: auditIssues.filter((i) => i.severity === 'info').length,
      issues: auditIssues,
    },
    restoreVerification,
  };

  const auditReportText = JSON.stringify(auditReportPayload, null, 2);
  const auditReportPath = path.join(backupRoot, 'audit-report.json');
  fs.writeFileSync(auditReportPath, auditReportText, 'utf8');
  const auditReportVerifySha = sha256Text(fs.readFileSync(auditReportPath, 'utf8'));

  const manifest = {
    createdAt: createdAtIso,
    backupDir: path.relative(process.cwd(), backupRoot),
    files: {
      'full-backup.json': {
        sha256: fullBackupVerifySha,
        bytes: Buffer.byteLength(fullBackupText, 'utf8'),
        verifiedOnReadBack: true,
      },
      'audit-report.json': {
        sha256: auditReportVerifySha,
        bytes: Buffer.byteLength(auditReportText, 'utf8'),
        verifiedOnReadBack: true,
      },
    },
  };
  const manifestPath = path.join(backupRoot, 'manifest.sha256.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Output redacted safe summary only (zero secrets/tokens/connection strings)
  console.log(
    JSON.stringify(
      {
        ok: true,
        backupDir: path.relative(process.cwd(), backupRoot),
        manifest,
        auditReport: auditReportPayload,
      },
      null,
      2,
    ),
  );
}

void main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Phase 1 backup and audit failed: ${message}`);
  process.exit(1);
});
