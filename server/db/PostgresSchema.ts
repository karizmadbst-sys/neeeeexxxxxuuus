import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

export const RANKED_PG_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at BIGINT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
  );`,

  `CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    numeric_id TEXT NOT NULL UNIQUE,
    firebase_uid TEXT UNIQUE,
    email TEXT,
    email_lower TEXT,
    secret_token TEXT NOT NULL,
    name TEXT NOT NULL,
    name_lower TEXT NOT NULL,
    username_changed BOOLEAN NOT NULL DEFAULT FALSE,
    platform TEXT NOT NULL DEFAULT 'pc',
    gender TEXT,
    avatar_character_id TEXT NOT NULL DEFAULT 'char-01',
    rp INTEGER NOT NULL DEFAULT 200,
    tier TEXT NOT NULL DEFAULT 'Bronze',
    wins INTEGER NOT NULL DEFAULT 0,
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    top3 INTEGER NOT NULL DEFAULT 0,
    matches_played INTEGER NOT NULL DEFAULT 0,
    total_damage INTEGER NOT NULL DEFAULT 0,
    best_kills_in_match INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    career_matches INTEGER NOT NULL DEFAULT 0,
    career_wins INTEGER NOT NULL DEFAULT 0,
    career_kills INTEGER NOT NULL DEFAULT 0,
    career_deaths INTEGER NOT NULL DEFAULT 0,
    career_damage INTEGER NOT NULL DEFAULT 0,
    career_best_kills INTEGER NOT NULL DEFAULT 0,
    credits BIGINT NOT NULL DEFAULT 2000,
    vault JSONB NOT NULL,
    cloud_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );`,

  `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_bound_name_lower
    ON players (name_lower)
    WHERE firebase_uid IS NOT NULL;`,

  `CREATE INDEX IF NOT EXISTS idx_players_email_lower
    ON players (email_lower)
    WHERE email_lower IS NOT NULL;`,

  `CREATE INDEX IF NOT EXISTS idx_players_leaderboard
    ON players (rp DESC, wins DESC, kills DESC, created_at ASC);`,

  `CREATE TABLE IF NOT EXISTS ranked_match_history (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    map_id TEXT NOT NULL,
    placement INTEGER NOT NULL,
    total_players INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    deaths INTEGER NOT NULL DEFAULT 0,
    damage INTEGER NOT NULL,
    rp_before INTEGER NOT NULL,
    rp_after INTEGER NOT NULL,
    rp_delta INTEGER NOT NULL,
    tier_after TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    played_at BIGINT NOT NULL,
    UNIQUE (match_id, player_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_history_player_played
    ON ranked_match_history (player_id, played_at DESC, id DESC);`,

  `CREATE TABLE IF NOT EXISTS friendships (
    player_a TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    player_b TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (player_a, player_b),
    CHECK (player_a < player_b)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_friendships_b
    ON friendships (player_b);`,

  `CREATE TABLE IF NOT EXISTS friend_requests (
    request_id TEXT PRIMARY KEY,
    from_player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    to_player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    UNIQUE (from_player_id, to_player_id),
    CHECK (from_player_id <> to_player_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_friend_requests_to
    ON friend_requests (to_player_id, created_at DESC);`,

  `CREATE TABLE IF NOT EXISTS mailbox_broadcasts (
    mail_id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT,
    reward_credits INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS mailbox_direct_messages (
    mail_id TEXT PRIMARY KEY,
    recipient_player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT,
    reward_credits INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE INDEX IF NOT EXISTS idx_mailbox_dm_recipient
    ON mailbox_direct_messages (recipient_player_id, created_at DESC);`,

  `CREATE TABLE IF NOT EXISTS mailbox_user_states (
    player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    mail_id TEXT NOT NULL,
    read_at BIGINT,
    claimed_at BIGINT,
    archived_at BIGINT,
    deleted_at BIGINT,
    PRIMARY KEY (player_id, mail_id)
  );`,

  `CREATE TABLE IF NOT EXISTS glb_assets (
    asset_id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft',
    metadata JSONB NOT NULL,
    glb_bytes BYTEA NOT NULL,
    preview_bytes BYTEA,
    preview_ext TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_glb_assets_status
    ON glb_assets (status, created_at DESC);`,
];

export const CORE_SCHEMA_MIGRATION_ID = '001_ranked_core_schema';

export async function ensureRankedPostgresSchema(client: PoolClient): Promise<void> {
  for (const sql of RANKED_PG_SCHEMA_STATEMENTS) {
    await client.query(sql);
  }
  const checksum = crypto
    .createHash('sha256')
    .update(RANKED_PG_SCHEMA_STATEMENTS.join('\n'), 'utf8')
    .digest('hex');
  await client.query(
    `INSERT INTO schema_migrations (migration_id, checksum, applied_at, details)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (migration_id) DO NOTHING`,
    [
      CORE_SCHEMA_MIGRATION_ID,
      checksum,
      Date.now(),
      JSON.stringify({ statementCount: RANKED_PG_SCHEMA_STATEMENTS.length }),
    ],
  );
}
