import type { PoolClient } from 'pg';
import type {
  CloudSyncStatePayload,
  MailboxCategory,
  PlatformType,
  PlayerGender,
  RankedMapId,
  RankedMatchHistoryEntry,
  RankedVaultState,
  RankTier,
} from '../../src/ranked/RankedTypes.ts';
import type { PostgresDatabase } from './PostgresPool.ts';
import { ensureRankedPostgresSchema } from './PostgresSchema.ts';

export interface PersistedPlayerRow {
  playerId: string;
  numericId: string;
  firebaseUid?: string;
  email?: string;
  secretToken: string;
  name: string;
  usernameChanged: boolean;
  platform: PlatformType;
  gender: PlayerGender | null;
  avatarCharacterId: string;
  rp: number;
  tier: RankTier;
  wins: number;
  kills: number;
  deaths: number;
  top3: number;
  matchesPlayed: number;
  totalDamage: number;
  bestKillsInMatch: number;
  level: number;
  xp: number;
  careerMatches: number;
  careerWins: number;
  careerKills: number;
  careerDeaths: number;
  careerDamage: number;
  careerBestKills: number;
  vault: RankedVaultState;
  cloudState?: CloudSyncStatePayload;
  history: RankedMatchHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface PersistedFriendshipRow {
  playerA: string;
  playerB: string;
  createdAt: number;
}

export interface PersistedFriendRequestRow {
  requestId: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
}

export interface PersistedMailboxMessageRow {
  mailId: string;
  category: MailboxCategory;
  title: string;
  sender: string;
  content: string;
  createdAt: number;
  expiresAt: number | null;
  rewardCredits: number;
}

export interface PersistedMailboxUserStateRow {
  readAt?: number;
  claimedAt?: number;
  archivedAt?: number;
  deletedAt?: number;
}

export interface LoadedRankedStoreSnapshot {
  players: PersistedPlayerRow[];
  friendships: PersistedFriendshipRow[];
  friendRequests: PersistedFriendRequestRow[];
  mailboxBroadcasts: PersistedMailboxMessageRow[];
  mailboxDirectMessages: Array<PersistedMailboxMessageRow & { recipientPlayerId: string }>;
  mailboxUserStates: Array<{
    playerId: string;
    mailId: string;
    state: PersistedMailboxUserStateRow;
  }>;
}

export class DatabasePersistenceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DatabasePersistenceError';
    this.status = status;
    this.code = code;
  }
}

export function mapPgErrorToPersistenceFailure(err: unknown): {
  status: number;
  code: string;
  error: string;
} {
  const pgErr = err as { code?: unknown; constraint?: unknown; detail?: unknown } | null;
  const sqlState = typeof pgErr?.code === 'string' ? pgErr.code : '';
  const constraint = typeof pgErr?.constraint === 'string' ? pgErr.constraint : '';
  const detail = typeof pgErr?.detail === 'string' ? pgErr.detail : '';
  if (sqlState === '23505') {
    if (constraint.includes('name_lower') || detail.includes('name_lower')) {
      return {
        status: 409,
        code: 'USERNAME_TAKEN',
        error: 'This username is already taken.',
      };
    }
    return {
      status: 409,
      code: 'CONFLICT',
      error: 'A conflicting record already exists in the database.',
    };
  }
  return {
    status: 503,
    code: 'DATABASE_ERROR',
    error: 'Database write failed. Changes were not saved.',
  };
}

const SCHEMA_ADVISORY_LOCK_ID = 74291000;

function toFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clonePersistedPlayerRow(rec: PersistedPlayerRow): PersistedPlayerRow {
  return {
    ...rec,
    vault: {
      ...rec.vault,
      ownedIds: [...rec.vault.ownedIds],
      equippedWeaponSkins: { ...rec.vault.equippedWeaponSkins },
      equippedEmoteWheel: [...rec.vault.equippedEmoteWheel],
      equippedArmoryIds: { ...rec.vault.equippedArmoryIds },
    },
    cloudState: rec.cloudState ? { ...rec.cloudState } : undefined,
    history: [...rec.history],
  };
}

export async function upsertPlayerRowWithClient(
  client: PoolClient,
  rec: PersistedPlayerRow,
  options?: { onlyIfNewer?: boolean },
): Promise<void> {
  const email = typeof rec.email === 'string' && rec.email.trim() ? rec.email.trim() : null;
  const emailLower = email ? email.toLowerCase() : null;
  const firebaseUid =
    typeof rec.firebaseUid === 'string' && rec.firebaseUid.trim() ? rec.firebaseUid.trim() : null;
  const nameClean = rec.name.trim();
  const nameLower = nameClean.toLowerCase();
  const credits = Math.max(0, Math.floor(rec.vault?.credits ?? 0));
  const cloudStateJson = JSON.stringify(rec.cloudState ?? {});
  const vaultJson = JSON.stringify(rec.vault);

  const sql = options?.onlyIfNewer
    ? `INSERT INTO players (
        player_id, numeric_id, firebase_uid, email, email_lower, secret_token,
        name, name_lower, username_changed, platform, gender, avatar_character_id,
        rp, tier, wins, kills, deaths, top3, matches_played, total_damage, best_kills_in_match,
        level, xp, career_matches, career_wins, career_kills, career_deaths, career_damage, career_best_kills,
        credits, vault, cloud_state, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,$25,$26,$27,$28,$29,
        $30,$31::jsonb,$32::jsonb,$33,$34
      )
      ON CONFLICT (player_id) DO UPDATE SET
        numeric_id = EXCLUDED.numeric_id,
        firebase_uid = COALESCE(players.firebase_uid, EXCLUDED.firebase_uid),
        email = COALESCE(EXCLUDED.email, players.email),
        email_lower = COALESCE(EXCLUDED.email_lower, players.email_lower),
        secret_token = COALESCE(NULLIF(players.secret_token, ''), EXCLUDED.secret_token),
        name = EXCLUDED.name,
        name_lower = EXCLUDED.name_lower,
        username_changed = EXCLUDED.username_changed,
        platform = EXCLUDED.platform,
        gender = EXCLUDED.gender,
        avatar_character_id = EXCLUDED.avatar_character_id,
        rp = EXCLUDED.rp,
        tier = EXCLUDED.tier,
        wins = EXCLUDED.wins,
        kills = EXCLUDED.kills,
        deaths = EXCLUDED.deaths,
        top3 = EXCLUDED.top3,
        matches_played = EXCLUDED.matches_played,
        total_damage = EXCLUDED.total_damage,
        best_kills_in_match = EXCLUDED.best_kills_in_match,
        level = EXCLUDED.level,
        xp = EXCLUDED.xp,
        career_matches = EXCLUDED.career_matches,
        career_wins = EXCLUDED.career_wins,
        career_kills = EXCLUDED.career_kills,
        career_deaths = EXCLUDED.career_deaths,
        career_damage = EXCLUDED.career_damage,
        career_best_kills = EXCLUDED.career_best_kills,
        credits = EXCLUDED.credits,
        vault = EXCLUDED.vault,
        cloud_state = EXCLUDED.cloud_state,
        updated_at = EXCLUDED.updated_at
      WHERE players.updated_at < EXCLUDED.updated_at;`
    : `INSERT INTO players (
        player_id, numeric_id, firebase_uid, email, email_lower, secret_token,
        name, name_lower, username_changed, platform, gender, avatar_character_id,
        rp, tier, wins, kills, deaths, top3, matches_played, total_damage, best_kills_in_match,
        level, xp, career_matches, career_wins, career_kills, career_deaths, career_damage, career_best_kills,
        credits, vault, cloud_state, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,$25,$26,$27,$28,$29,
        $30,$31::jsonb,$32::jsonb,$33,$34
      )
      ON CONFLICT (player_id) DO UPDATE SET
        numeric_id = EXCLUDED.numeric_id,
        firebase_uid = COALESCE(players.firebase_uid, EXCLUDED.firebase_uid),
        email = COALESCE(EXCLUDED.email, players.email),
        email_lower = COALESCE(EXCLUDED.email_lower, players.email_lower),
        secret_token = COALESCE(NULLIF(players.secret_token, ''), EXCLUDED.secret_token),
        name = EXCLUDED.name,
        name_lower = EXCLUDED.name_lower,
        username_changed = EXCLUDED.username_changed,
        platform = EXCLUDED.platform,
        gender = EXCLUDED.gender,
        avatar_character_id = EXCLUDED.avatar_character_id,
        rp = EXCLUDED.rp,
        tier = EXCLUDED.tier,
        wins = EXCLUDED.wins,
        kills = EXCLUDED.kills,
        deaths = EXCLUDED.deaths,
        top3 = EXCLUDED.top3,
        matches_played = EXCLUDED.matches_played,
        total_damage = EXCLUDED.total_damage,
        best_kills_in_match = EXCLUDED.best_kills_in_match,
        level = EXCLUDED.level,
        xp = EXCLUDED.xp,
        career_matches = EXCLUDED.career_matches,
        career_wins = EXCLUDED.career_wins,
        career_kills = EXCLUDED.career_kills,
        career_deaths = EXCLUDED.career_deaths,
        career_damage = EXCLUDED.career_damage,
        career_best_kills = EXCLUDED.career_best_kills,
        credits = EXCLUDED.credits,
        vault = EXCLUDED.vault,
        cloud_state = EXCLUDED.cloud_state,
        updated_at = EXCLUDED.updated_at;`;

  await client.query(sql, [
    rec.playerId,
    rec.numericId,
    firebaseUid,
    email,
    emailLower,
    rec.secretToken,
    nameClean,
    nameLower,
    Boolean(rec.usernameChanged),
    rec.platform,
    rec.gender ?? null,
    rec.avatarCharacterId || 'char-01',
    Math.floor(rec.rp),
    rec.tier,
    Math.floor(rec.wins),
    Math.floor(rec.kills),
    Math.floor(rec.deaths),
    Math.floor(rec.top3),
    Math.floor(rec.matchesPlayed),
    Math.floor(rec.totalDamage),
    Math.floor(rec.bestKillsInMatch),
    Math.floor(rec.level),
    Math.floor(rec.xp),
    Math.floor(rec.careerMatches),
    Math.floor(rec.careerWins),
    Math.floor(rec.careerKills),
    Math.floor(rec.careerDeaths),
    Math.floor(rec.careerDamage),
    Math.floor(rec.careerBestKills),
    credits,
    vaultJson,
    cloudStateJson,
    Math.floor(rec.createdAt),
    Math.floor(rec.updatedAt),
  ]);
}

export async function insertHistoryEntryWithClient(
  client: PoolClient,
  playerId: string,
  entry: RankedMatchHistoryEntry,
): Promise<boolean> {
  const res = await client.query(
    `INSERT INTO ranked_match_history (
      match_id, player_id, map_id, placement, total_players,
      kills, deaths, damage, rp_before, rp_after, rp_delta, tier_after, duration_sec, played_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (match_id, player_id) DO NOTHING`,
    [
      entry.matchId,
      playerId,
      entry.mapId,
      Math.floor(entry.placement),
      Math.floor(entry.totalPlayers),
      Math.floor(entry.kills),
      0,
      Math.floor(entry.damage),
      Math.floor(entry.rpBefore),
      Math.floor(entry.rpAfter),
      Math.floor(entry.rpDelta),
      entry.tierAfter,
      Math.floor(entry.survivedSec),
      Math.floor(entry.timestamp),
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

export class PostgresStoreRepository {
  private readonly db: PostgresDatabase;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(db: PostgresDatabase) {
    this.db = db;
  }

  async ensureSchemaAndLoad(): Promise<LoadedRankedStoreSnapshot> {
    await this.db.withAdvisoryLock(SCHEMA_ADVISORY_LOCK_ID, async (client) => {
      await ensureRankedPostgresSchema(client);
    });

    const [
      playersRes,
      historyRes,
      friendshipsRes,
      friendRequestsRes,
      broadcastsRes,
      directMessagesRes,
      userStatesRes,
    ] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT
          player_id, numeric_id, firebase_uid, email, secret_token,
          name, username_changed, platform, gender, avatar_character_id,
          rp, tier, wins, kills, deaths, top3, matches_played, total_damage, best_kills_in_match,
          level, xp, career_matches, career_wins, career_kills, career_deaths, career_damage, career_best_kills,
          credits, vault, cloud_state, created_at, updated_at
        FROM players`,
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT
          match_id, player_id, map_id, placement, total_players,
          kills, damage, rp_before, rp_after, rp_delta, tier_after, duration_sec, played_at
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY played_at DESC, id DESC) AS rn
          FROM ranked_match_history
        ) ranked_hist
        WHERE rn <= 25
        ORDER BY played_at DESC, id DESC`,
      ),
      this.db.query<Record<string, unknown>>(
        'SELECT player_a, player_b, created_at FROM friendships',
      ),
      this.db.query<Record<string, unknown>>(
        'SELECT request_id, from_player_id, to_player_id, created_at FROM friend_requests',
      ),
      this.db.query<Record<string, unknown>>(
        'SELECT mail_id, category, title, sender, content, created_at, expires_at, reward_credits FROM mailbox_broadcasts',
      ),
      this.db.query<Record<string, unknown>>(
        'SELECT mail_id, recipient_player_id, category, title, sender, content, created_at, expires_at, reward_credits FROM mailbox_direct_messages ORDER BY created_at DESC',
      ),
      this.db.query<Record<string, unknown>>(
        'SELECT player_id, mail_id, read_at, claimed_at, archived_at, deleted_at FROM mailbox_user_states',
      ),
    ]);

    const historyByPlayer = new Map<string, RankedMatchHistoryEntry[]>();
    for (const row of historyRes.rows) {
      const pid = String(row.player_id);
      const list = historyByPlayer.get(pid) ?? [];
      list.push({
        matchId: String(row.match_id),
        mapId: String(row.map_id) as RankedMapId,
        placement: toFiniteNumber(row.placement, 1),
        totalPlayers: toFiniteNumber(row.total_players, 1),
        kills: toFiniteNumber(row.kills, 0),
        damage: toFiniteNumber(row.damage, 0),
        survivedSec: toFiniteNumber(row.duration_sec, 0),
        rpBefore: toFiniteNumber(row.rp_before, 200),
        rpAfter: toFiniteNumber(row.rp_after, 200),
        rpDelta: toFiniteNumber(row.rp_delta, 0),
        tierAfter: String(row.tier_after) as RankTier,
        timestamp: toFiniteNumber(row.played_at, Date.now()),
      });
      historyByPlayer.set(pid, list);
    }

    const players: PersistedPlayerRow[] = playersRes.rows.map((row) => {
      const playerId = String(row.player_id);
      const vault = (row.vault ?? {}) as RankedVaultState;
      const cloudRaw = row.cloud_state as CloudSyncStatePayload | null | undefined;
      const hasCloud =
        cloudRaw && typeof cloudRaw === 'object' && Object.keys(cloudRaw).length > 0;
      const dbCredits = toFiniteNumber(row.credits, vault.credits ?? 2000);
      return {
        playerId,
        numericId: String(row.numeric_id),
        firebaseUid: typeof row.firebase_uid === 'string' ? row.firebase_uid : undefined,
        email: typeof row.email === 'string' ? row.email : undefined,
        secretToken: String(row.secret_token),
        name: String(row.name),
        usernameChanged: Boolean(row.username_changed),
        platform: String(row.platform || 'pc') as PlatformType,
        gender:
          row.gender === 'male' || row.gender === 'female' ? (row.gender as PlayerGender) : null,
        avatarCharacterId: String(row.avatar_character_id || 'char-01'),
        rp: toFiniteNumber(row.rp, 200),
        tier: String(row.tier || 'Bronze') as RankTier,
        wins: toFiniteNumber(row.wins, 0),
        kills: toFiniteNumber(row.kills, 0),
        deaths: toFiniteNumber(row.deaths, 0),
        top3: toFiniteNumber(row.top3, 0),
        matchesPlayed: toFiniteNumber(row.matches_played, 0),
        totalDamage: toFiniteNumber(row.total_damage, 0),
        bestKillsInMatch: toFiniteNumber(row.best_kills_in_match, 0),
        level: toFiniteNumber(row.level, 1),
        xp: toFiniteNumber(row.xp, 0),
        careerMatches: toFiniteNumber(row.career_matches, 0),
        careerWins: toFiniteNumber(row.career_wins, 0),
        careerKills: toFiniteNumber(row.career_kills, 0),
        careerDeaths: toFiniteNumber(row.career_deaths, 0),
        careerDamage: toFiniteNumber(row.career_damage, 0),
        careerBestKills: toFiniteNumber(row.career_best_kills, 0),
        vault: {
          ...vault,
          credits: dbCredits,
        },
        cloudState: hasCloud ? cloudRaw : undefined,
        history: historyByPlayer.get(playerId) ?? [],
        createdAt: toFiniteNumber(row.created_at, Date.now()),
        updatedAt: toFiniteNumber(row.updated_at, Date.now()),
      };
    });

    const friendships: PersistedFriendshipRow[] = friendshipsRes.rows.map((row) => ({
      playerA: String(row.player_a),
      playerB: String(row.player_b),
      createdAt: toFiniteNumber(row.created_at, Date.now()),
    }));

    const friendRequests: PersistedFriendRequestRow[] = friendRequestsRes.rows.map((row) => ({
      requestId: String(row.request_id),
      fromPlayerId: String(row.from_player_id),
      toPlayerId: String(row.to_player_id),
      createdAt: toFiniteNumber(row.created_at, Date.now()),
    }));

    const mailboxBroadcasts: PersistedMailboxMessageRow[] = broadcastsRes.rows.map((row) => ({
      mailId: String(row.mail_id),
      category: String(row.category) as MailboxCategory,
      title: String(row.title),
      sender: String(row.sender),
      content: String(row.content),
      createdAt: toFiniteNumber(row.created_at, Date.now()),
      expiresAt: row.expires_at === null ? null : toFiniteNumber(row.expires_at, 0),
      rewardCredits: toFiniteNumber(row.reward_credits, 0),
    }));

    const mailboxDirectMessages = directMessagesRes.rows.map((row) => ({
      mailId: String(row.mail_id),
      recipientPlayerId: String(row.recipient_player_id),
      category: String(row.category) as MailboxCategory,
      title: String(row.title),
      sender: String(row.sender),
      content: String(row.content),
      createdAt: toFiniteNumber(row.created_at, Date.now()),
      expiresAt: row.expires_at === null ? null : toFiniteNumber(row.expires_at, 0),
      rewardCredits: toFiniteNumber(row.reward_credits, 0),
    }));

    const mailboxUserStates = userStatesRes.rows.map((row) => {
      const state: PersistedMailboxUserStateRow = {};
      if (row.read_at !== null && row.read_at !== undefined) state.readAt = toFiniteNumber(row.read_at);
      if (row.claimed_at !== null && row.claimed_at !== undefined) state.claimedAt = toFiniteNumber(row.claimed_at);
      if (row.archived_at !== null && row.archived_at !== undefined) state.archivedAt = toFiniteNumber(row.archived_at);
      if (row.deleted_at !== null && row.deleted_at !== undefined) state.deletedAt = toFiniteNumber(row.deleted_at);
      return {
        playerId: String(row.player_id),
        mailId: String(row.mail_id),
        state,
      };
    });

    return {
      players,
      friendships,
      friendRequests,
      mailboxBroadcasts,
      mailboxDirectMessages,
      mailboxUserStates,
    };
  }

  private runSerialized<T>(label: string, op: (db: PostgresDatabase) => Promise<T>): Promise<T> {
    const task = this.writeChain.then(async () => {
      try {
        return await op(this.db);
      } catch (err) {
        const pgCode = (err as { code?: unknown })?.code;
        console.error(
          `[PostgresStoreRepository] Commit failed (${label}, code=${String(pgCode ?? 'ERR')})`,
        );
        throw err;
      }
    });
    // Keep serialized chain alive for future operations even if one write fails
    this.writeChain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  async commitPlayerUpsert(rec: PersistedPlayerRow): Promise<void> {
    const snapshot = clonePersistedPlayerRow(rec);
    await this.runSerialized(`upsertPlayer:${snapshot.playerId}`, async (db) => {
      await db.withTransaction(async (client) => {
        await upsertPlayerRowWithClient(client, snapshot);
      });
    });
  }

  async commitMatchOutcome(
    rec: PersistedPlayerRow,
    entry: RankedMatchHistoryEntry,
  ): Promise<{ inserted: boolean }> {
    const snapshot = clonePersistedPlayerRow(rec);
    const entrySnapshot: RankedMatchHistoryEntry = { ...entry };
    return this.runSerialized(`matchOutcome:${snapshot.playerId}:${entrySnapshot.matchId}`, async (db) =>
      db.withTransaction(async (client) => {
        const inserted = await insertHistoryEntryWithClient(
          client,
          snapshot.playerId,
          entrySnapshot,
        );
        if (inserted) {
          await upsertPlayerRowWithClient(client, snapshot);
        }
        return { inserted };
      }),
    );
  }

  async commitFriendRequest(req: PersistedFriendRequestRow): Promise<{ inserted: boolean }> {
    const snapshot = { ...req };
    return this.runSerialized(`saveFriendRequest:${snapshot.requestId}`, async (db) =>
      db.withTransaction(async (client) => {
        const res = await client.query(
          `INSERT INTO friend_requests (request_id, from_player_id, to_player_id, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (from_player_id, to_player_id) DO NOTHING
           RETURNING request_id`,
          [snapshot.requestId, snapshot.fromPlayerId, snapshot.toPlayerId, Math.floor(snapshot.createdAt)],
        );
        return { inserted: (res.rowCount ?? 0) > 0 };
      }),
    );
  }

  async commitRespondFriendRequest(input: {
    requestId: string;
    fromPlayerId: string;
    toPlayerId: string;
    accept: boolean;
    friendshipCreatedAt: number;
  }): Promise<{ deletedCount: number }> {
    const snapshot = { ...input };
    return this.runSerialized(`respondFriendRequest:${snapshot.requestId}`, async (db) =>
      db.withTransaction(async (client) => {
        const delRes = await client.query(
          'DELETE FROM friend_requests WHERE request_id = $1 RETURNING request_id',
          [snapshot.requestId],
        );
        const deletedCount = delRes.rowCount ?? 0;
        if (deletedCount === 0) {
          return { deletedCount: 0 };
        }
        if (snapshot.accept) {
          await client.query(
            'DELETE FROM friend_requests WHERE from_player_id = $1 AND to_player_id = $2',
            [snapshot.toPlayerId, snapshot.fromPlayerId],
          );
          const [playerA, playerB] =
            snapshot.fromPlayerId < snapshot.toPlayerId
              ? [snapshot.fromPlayerId, snapshot.toPlayerId]
              : [snapshot.toPlayerId, snapshot.fromPlayerId];
          await client.query(
            `INSERT INTO friendships (player_a, player_b, created_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (player_a, player_b) DO NOTHING`,
            [playerA, playerB, Math.floor(snapshot.friendshipCreatedAt)],
          );
        }
        return { deletedCount };
      }),
    );
  }

  async commitDeleteFriendRequest(requestId: string): Promise<void> {
    await this.runSerialized(`deleteFriendRequest:${requestId}`, async (db) => {
      await db.withTransaction(async (client) => {
        await client.query('DELETE FROM friend_requests WHERE request_id = $1', [requestId]);
      });
    });
  }

  async commitDeleteFriendship(idA: string, idB: string): Promise<void> {
    const [playerA, playerB] = idA < idB ? [idA, idB] : [idB, idA];
    await this.runSerialized(`deleteFriendship:${playerA}:${playerB}`, async (db) => {
      await db.withTransaction(async (client) => {
        await client.query('DELETE FROM friendships WHERE player_a = $1 AND player_b = $2', [
          playerA,
          playerB,
        ]);
      });
    });
  }

  async commitMailboxBroadcast(msg: PersistedMailboxMessageRow): Promise<void> {
    const snapshot = { ...msg };
    await this.runSerialized(`saveMailboxBroadcast:${snapshot.mailId}`, async (db) => {
      await db.withTransaction(async (client) => {
        await client.query(
          `INSERT INTO mailbox_broadcasts (mail_id, category, title, sender, content, created_at, expires_at, reward_credits)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (mail_id) DO NOTHING`,
          [
            snapshot.mailId,
            snapshot.category,
            snapshot.title,
            snapshot.sender,
            snapshot.content,
            Math.floor(snapshot.createdAt),
            snapshot.expiresAt === null ? null : Math.floor(snapshot.expiresAt),
            Math.floor(snapshot.rewardCredits),
          ],
        );
      });
    });
  }

  async commitMailboxDirectMessage(
    recipientPlayerId: string,
    msg: PersistedMailboxMessageRow,
  ): Promise<void> {
    const snapshot = { ...msg };
    await this.runSerialized(`saveMailboxDM:${snapshot.mailId}`, async (db) => {
      await db.withTransaction(async (client) => {
        await client.query(
          `INSERT INTO mailbox_direct_messages (
            mail_id, recipient_player_id, category, title, sender, content, created_at, expires_at, reward_credits
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (mail_id) DO NOTHING`,
          [
            snapshot.mailId,
            recipientPlayerId,
            snapshot.category,
            snapshot.title,
            snapshot.sender,
            snapshot.content,
            Math.floor(snapshot.createdAt),
            snapshot.expiresAt === null ? null : Math.floor(snapshot.expiresAt),
            Math.floor(snapshot.rewardCredits),
          ],
        );
      });
    });
  }

  async commitMailboxUserState(
    playerId: string,
    mailId: string,
    st: PersistedMailboxUserStateRow,
  ): Promise<void> {
    const snapshot = { ...st };
    await this.runSerialized(`saveMailboxUserState:${playerId}:${mailId}`, async (db) => {
      await db.withTransaction(async (client) => {
        await client.query(
          `INSERT INTO mailbox_user_states (player_id, mail_id, read_at, claimed_at, archived_at, deleted_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (player_id, mail_id) DO UPDATE SET
             read_at = COALESCE(mailbox_user_states.read_at, EXCLUDED.read_at),
             claimed_at = COALESCE(mailbox_user_states.claimed_at, EXCLUDED.claimed_at),
             archived_at = EXCLUDED.archived_at,
             deleted_at = COALESCE(mailbox_user_states.deleted_at, EXCLUDED.deleted_at)`,
          [
            playerId,
            mailId,
            snapshot.readAt ?? null,
            snapshot.claimedAt ?? null,
            snapshot.archivedAt ?? null,
            snapshot.deletedAt ?? null,
          ],
        );
      });
    });
  }

  async commitMailboxClaim(input: {
    player: PersistedPlayerRow;
    mailId: string;
    userState: PersistedMailboxUserStateRow;
  }): Promise<{ alreadyClaimed: boolean }> {
    const playerSnapshot = clonePersistedPlayerRow(input.player);
    const st = { ...input.userState };
    return this.runSerialized(`claimMail:${playerSnapshot.playerId}:${input.mailId}`, async (db) =>
      db.withTransaction(async (client) => {
        const res = await client.query<{ claimed_at: unknown }>(
          'SELECT claimed_at FROM mailbox_user_states WHERE player_id = $1 AND mail_id = $2 FOR UPDATE',
          [playerSnapshot.playerId, input.mailId],
        );
        if (res.rows[0]?.claimed_at) {
          return { alreadyClaimed: true };
        }
        await client.query(
          `INSERT INTO mailbox_user_states (player_id, mail_id, read_at, claimed_at, archived_at, deleted_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (player_id, mail_id) DO UPDATE SET
             read_at = COALESCE(mailbox_user_states.read_at, EXCLUDED.read_at),
             claimed_at = COALESCE(mailbox_user_states.claimed_at, EXCLUDED.claimed_at),
             archived_at = COALESCE(mailbox_user_states.archived_at, EXCLUDED.archived_at),
             deleted_at = COALESCE(mailbox_user_states.deleted_at, EXCLUDED.deleted_at)`,
          [
            playerSnapshot.playerId,
            input.mailId,
            st.readAt ?? null,
            st.claimedAt ?? null,
            st.archivedAt ?? null,
            st.deletedAt ?? null,
          ],
        );
        await upsertPlayerRowWithClient(client, playerSnapshot);
        return { alreadyClaimed: false };
      }),
    );
  }
}
