import 'dotenv/config';
import {
  getConfiguredDatabaseUrl,
  getRedactedDatabaseTarget,
  PostgresDatabase,
} from '../server/db/PostgresPool.ts';

async function main(): Promise<void> {
  const dbUrl = getConfiguredDatabaseUrl();
  if (!dbUrl) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          configured: false,
          reason: 'DATABASE_URL is not set in environment or .env.',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const target = getRedactedDatabaseTarget(dbUrl);
  const db = new PostgresDatabase(dbUrl);
  try {
    const ping = await db.ping();
    console.log(
      JSON.stringify(
        {
          ok: ping.ok,
          configured: true,
          protocol: target.protocol,
          isLocal: target.isLocal,
          sslEnabled: target.sslEnabled,
          latencyMs: ping.latencyMs,
          serverVersion: ping.serverVersion ?? null,
        },
        null,
        2,
      ),
    );
    if (!ping.ok) {
      process.exit(1);
    }
  } finally {
    await db.close();
  }
}

void main();
