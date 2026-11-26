import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEVELOPER_CREDITS,
  DEVELOPER_FIREBASE_UID,
  DEVELOPER_LEVEL,
  DEVELOPER_NUMERIC_ID,
  DEVELOPER_PLAYER_ID,
} from '../server/DeveloperPrivileges.ts';
import { getConfiguredDatabaseUrl, PostgresDatabase } from '../server/db/PostgresPool.ts';
import { ensureRankedPostgresSchema } from '../server/db/PostgresSchema.ts';
import {
  insertHistoryEntryWithClient,
  upsertPlayerRowWithClient,
  type PersistedPlayerRow,
} from '../server/db/PostgresStoreRepository.ts';
import type {
  CloudSyncStatePayload,
  MailboxCategory,
  PlatformType,
  PlayerGender,
  RankedMatchHistoryEntry,
  RankedVaultState,
  RankTier,
} from '../src/ranked/RankedTypes.ts';
import { createAndVerifyRankedStoreBackup } from './backup-ranked-store.ts';

const MIGRATION_ID = 'initial_ranked_store_v1';
const MIGRATION_ADVISORY_LOCK_ID = 74291001;

interface RawJsonStore {
  version?: number;
  players?: Record<string, Partial<PersistedPlayerRow>>;
  friendships?: Array<{ playerA?: string; playerB?: string; createdAt?: number }>;
  friendRequests?: Array<{
    requestId?: string;
    fromPlayerId?: string;
    toPlayerId?: string;
    createdAt?: number;
  }>;
  mailboxBroadcasts?: Array<{
    mailId?: string;
    category?: string;
    title?: string;
    sender?: string;
    content?: string;
    createdAt?: number;
    expiresAt?: number | null;
    rewardCredits?: number;
  }>;
  mailboxDirectMessages?: Record<
    string,
    Array<{
      mailId?: string;
      category?: string;
      title?: string;
      sender?: string;
      content?: string;
      createdAt?: number;
      expiresAt?: number | null;
      rewardCredits?: number;
    }>
  >;
  mailboxUserStates?: Record<
    string,
    Record<
      string,
      {
        readAt?: number;
        claimedAt?: number;
        archivedAt?: number;
        deletedAt?: number;
      }
    >
  >;
}

async function runMigration(): Promise<void> {
  if (!process.argv.includes('--confirm-migrate')) {
    console.error(
      'Refusing to migrate without explicit --confirm-migrate flag. No database writes were made.',
    );
    process.exit(1);
  }

  const dbUrl = getConfiguredDatabaseUrl();
  if (!dbUrl) {
    console.error('DATABASE_URL is not configured. Set DATABASE_URL before migrating.');
    process.exit(1);
  }

  const storePath = path.resolve(process.cwd(), 'data', 'ranked-store.json');
  if (!fs.existsSync(storePath)) {
    console.error('data/ranked-store.json not found.');
    process.exit(1);
  }

  const backup = createAndVerifyRankedStoreBackup({ sourcePath: storePath });
  const rawJson = fs.readFileSync(storePath, 'utf8');
  const parsed = JSON.parse(rawJson) as RawJsonStore;
  const playersEntries = Object.values(parsed.players ?? {}).filter(
    (p): p is Partial<PersistedPlayerRow> & { playerId: string; secretToken: string } =>
      Boolean(p && typeof p.playerId === 'string' && typeof p.secretToken === 'string'),
  );

  const db = new PostgresDatabase(dbUrl);
  try {
    const summary = await db.withAdvisoryLock(MIGRATION_ADVISORY_LOCK_ID, async (lockClient) => {
      await lockClient.query('BEGIN');
      try {
        await ensureRankedPostgresSchema(lockClient);

        const existingMig = await lockClient.query<{ migration_id: string }>(
          'SELECT migration_id FROM schema_migrations WHERE migration_id = $1',
          [MIGRATION_ID],
        );
        if ((existingMig.rowCount ?? 0) > 0) {
          await lockClient.query('COMMIT');
          return { skipped: true, reason: 'already_applied', backupSha256: backup.sha256 };
        }

        let importedPlayers = 0;
        let importedHistory = 0;
        for (const p of playersEntries) {
          const row: PersistedPlayerRow = {
            playerId: p.playerId,
            numericId: String(p.numericId ?? ''),
            firebaseUid: typeof p.firebaseUid === 'string' ? p.firebaseUid : undefined,
            email: typeof p.email === 'string' ? p.email : undefined,
            secretToken: p.secretToken,
            name: String(p.name ?? `FIGHTER-${p.playerId.slice(-4)}`),
            usernameChanged: Boolean(p.usernameChanged),
            platform: (p.platform ?? 'pc') as PlatformType,
            gender: (p.gender ?? null) as PlayerGender | null,
            avatarCharacterId: String(p.avatarCharacterId ?? 'char-01'),
            rp: Number(p.rp ?? 200),
            tier: (p.tier ?? 'Bronze') as RankTier,
            wins: Number(p.wins ?? 0),
            kills: Number(p.kills ?? 0),
            deaths: Number(p.deaths ?? 0),
            top3: Number(p.top3 ?? 0),
            matchesPlayed: Number(p.matchesPlayed ?? 0),
            totalDamage: Number(p.totalDamage ?? 0),
            bestKillsInMatch: Number(p.bestKillsInMatch ?? 0),
            level: Number(p.level ?? 1),
            xp: Number(p.xp ?? 0),
            careerMatches: Number(p.careerMatches ?? p.matchesPlayed ?? 0),
            careerWins: Number(p.careerWins ?? p.wins ?? 0),
            careerKills: Number(p.careerKills ?? p.kills ?? 0),
            careerDeaths: Number(p.careerDeaths ?? p.deaths ?? 0),
            careerDamage: Number(p.careerDamage ?? p.totalDamage ?? 0),
            careerBestKills: Number(p.careerBestKills ?? p.bestKillsInMatch ?? 0),
            vault: p.vault as RankedVaultState,
            cloudState: p.cloudState as CloudSyncStatePayload | undefined,
            history: Array.isArray(p.history) ? (p.history as RankedMatchHistoryEntry[]) : [],
            createdAt: Number(p.createdAt ?? Date.now()),
            updatedAt: Number(p.updatedAt ?? Date.now()),
          };

          await upsertPlayerRowWithClient(lockClient, row, { onlyIfNewer: true });
          importedPlayers += 1;

          for (const h of row.history) {
            const inserted = await insertHistoryEntryWithClient(lockClient, row.playerId, h);
            if (inserted) importedHistory += 1;
          }
        }

        for (const f of parsed.friendships ?? []) {
          if (!f?.playerA || !f?.playerB || f.playerA === f.playerB) continue;
          const [playerA, playerB] = f.playerA < f.playerB ? [f.playerA, f.playerB] : [f.playerB, f.playerA];
          await lockClient.query(
            `INSERT INTO friendships (player_a, player_b, created_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (player_a, player_b) DO NOTHING`,
            [playerA, playerB, Math.floor(Number(f.createdAt ?? Date.now()))],
          );
        }

        for (const r of parsed.friendRequests ?? []) {
          if (!r?.requestId || !r?.fromPlayerId || !r?.toPlayerId || r.fromPlayerId === r.toPlayerId) {
            continue;
          }
          await lockClient.query(
            `INSERT INTO friend_requests (request_id, from_player_id, to_player_id, created_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (from_player_id, to_player_id) DO NOTHING`,
            [r.requestId, r.fromPlayerId, r.toPlayerId, Math.floor(Number(r.createdAt ?? Date.now()))],
          );
        }

        for (const b of parsed.mailboxBroadcasts ?? []) {
          if (!b?.mailId || !b?.title || !b?.content) continue;
          await lockClient.query(
            `INSERT INTO mailbox_broadcasts (mail_id, category, title, sender, content, created_at, expires_at, reward_credits)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (mail_id) DO NOTHING`,
            [
              b.mailId,
              (b.category ?? 'system') as MailboxCategory,
              b.title,
              b.sender ?? 'NEXUS COMMAND',
              b.content,
              Math.floor(Number(b.createdAt ?? Date.now())),
              b.expiresAt === null || b.expiresAt === undefined ? null : Math.floor(Number(b.expiresAt)),
              Math.floor(Number(b.rewardCredits ?? 0)),
            ],
          );
        }

        for (const [pid, msgs] of Object.entries(parsed.mailboxDirectMessages ?? {})) {
          if (!Array.isArray(msgs)) continue;
          for (const m of msgs) {
            if (!m?.mailId || !m?.title || !m?.content) continue;
            await lockClient.query(
              `INSERT INTO mailbox_direct_messages (
                mail_id, recipient_player_id, category, title, sender, content, created_at, expires_at, reward_credits
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
              ON CONFLICT (mail_id) DO NOTHING`,
              [
                m.mailId,
                pid,
                (m.category ?? 'developer') as MailboxCategory,
                m.title,
                m.sender ?? 'karizma · Creator',
                m.content,
                Math.floor(Number(m.createdAt ?? Date.now())),
                m.expiresAt === null || m.expiresAt === undefined ? null : Math.floor(Number(m.expiresAt)),
                Math.floor(Number(m.rewardCredits ?? 0)),
              ],
            );
          }
        }

        for (const [pid, stateMap] of Object.entries(parsed.mailboxUserStates ?? {})) {
          if (!stateMap || typeof stateMap !== 'object') continue;
          for (const [mailId, st] of Object.entries(stateMap)) {
            await lockClient.query(
              `INSERT INTO mailbox_user_states (player_id, mail_id, read_at, claimed_at, archived_at, deleted_at)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (player_id, mail_id) DO UPDATE SET
                 read_at = COALESCE(mailbox_user_states.read_at, EXCLUDED.read_at),
                 claimed_at = COALESCE(mailbox_user_states.claimed_at, EXCLUDED.claimed_at),
                 archived_at = COALESCE(mailbox_user_states.archived_at, EXCLUDED.archived_at),
                 deleted_at = COALESCE(mailbox_user_states.deleted_at, EXCLUDED.deleted_at)`,
              [
                pid,
                mailId,
                st.readAt ?? null,
                st.claimedAt ?? null,
                st.archivedAt ?? null,
                st.deletedAt ?? null,
              ],
            );
          }
        }

        // Verify developer account preservation inside transaction before commit
        const devExpectedInJson = playersEntries.some((p) => p.playerId === DEVELOPER_PLAYER_ID);
        if (devExpectedInJson) {
          const devCheck = await lockClient.query<{
            player_id: string;
            numeric_id: string;
            firebase_uid: string;
            level: number;
            credits: string;
          }>(
            'SELECT player_id, numeric_id, firebase_uid, level, credits FROM players WHERE player_id = $1',
            [DEVELOPER_PLAYER_ID],
          );
          const row = devCheck.rows[0];
          if (
            !row ||
            row.firebase_uid !== DEVELOPER_FIREBASE_UID ||
            row.numeric_id !== DEVELOPER_NUMERIC_ID ||
            Number(row.level) !== DEVELOPER_LEVEL ||
            Number(row.credits) < DEVELOPER_CREDITS
          ) {
            throw new Error('Post-migration verification failed for developer account record.');
          }
        }

        await lockClient.query(
          `INSERT INTO schema_migrations (migration_id, checksum, applied_at, details)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            MIGRATION_ID,
            backup.sha256,
            Date.now(),
            JSON.stringify({ importedPlayers, importedHistory }),
          ],
        );

        await lockClient.query('COMMIT');
        return {
          skipped: false,
          importedPlayers,
          importedHistory,
          backupSha256: backup.sha256,
        };
      } catch (err) {
        await lockClient.query('ROLLBACK');
        throw err;
      }
    });

    console.log(JSON.stringify({ ok: true, migrationId: MIGRATION_ID, ...summary }, null, 2));
  } finally {
    await db.close();
  }
}

void runMigration().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Migration failed: ${msg}`);
  process.exit(1);
});
