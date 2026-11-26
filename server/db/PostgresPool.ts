import crypto from 'node:crypto';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

const TRANSIENT_PG_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
]);

function shouldUseSsl(connectionString: string): false | { rejectUnauthorized: boolean; ca?: string } {
  const normalized = connectionString.trim();
  const explicitDisable =
    /[?&]sslmode=disable\b/i.test(normalized) ||
    process.env.PG_SSL_MODE?.trim().toLowerCase() === 'disable';
  if (explicitDisable) {
    return false;
  }

  let hostname = '';
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    hostname = '';
  }

  const isLocalHost =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const explicitRequire =
    /[?&]sslmode=(require|verify-ca|verify-full)\b/i.test(normalized) ||
    process.env.PG_SSL_MODE?.trim().toLowerCase() === 'require';

  if (isLocalHost && !explicitRequire) {
    return false;
  }

  const ca = process.env.PG_CA_CERT?.trim();
  if (ca) {
    return {
      ca: ca.replace(/\\n/g, '\n'),
      rejectUnauthorized: true,
    };
  }

  return {
    rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true',
  };
}

export function getConfiguredDatabaseUrl(): string | null {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.NEON_DATABASE_URL,
  ];
  for (const val of candidates) {
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return null;
}

export function getRedactedDatabaseTarget(connectionString: string): {
  protocol: string;
  isLocal: boolean;
  sslEnabled: boolean;
} {
  let protocol = 'postgres';
  let isLocal = false;
  try {
    const parsed = new URL(connectionString);
    protocol = parsed.protocol.replace(/:$/, '') || 'postgres';
    const host = parsed.hostname.toLowerCase();
    isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    protocol = 'postgres';
  }
  return {
    protocol,
    isLocal,
    sslEnabled: Boolean(shouldUseSsl(connectionString)),
  };
}

export class PostgresDatabase {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    const ssl = shouldUseSsl(connectionString);
    this.pool = new Pool({
      connectionString,
      ssl,
      max: Number(process.env.PG_POOL_MAX || 15),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'nexus-royale-server',
    });

    this.pool.on('error', (err) => {
      const code = (err as { code?: string })?.code ?? 'UNKNOWN';
      console.error(`[PostgresDatabase] Idle pool client error (code=${code})`);
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    return this.withRetry(() =>
      params && params.length > 0
        ? this.pool.query<T>(text, [...params])
        : this.pool.query<T>(text),
    );
  }

  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore rollback failure on dropped socket
        }
        throw err;
      } finally {
        client.release();
      }
    });
  }

  async withAdvisoryLock<T>(lockKey: number, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
      return await fn(client);
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      } catch {
        // Released automatically when connection closes if unlock fails
      }
      client.release();
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; serverVersion?: string }> {
    const started = Date.now();
    try {
      const res = await this.pool.query<{ version: string }>('SELECT version() AS version');
      const fullVersion = res.rows[0]?.version ?? '';
      const shortVersion = fullVersion.split(',')[0]?.trim();
      return {
        ok: true,
        latencyMs: Math.max(0, Date.now() - started),
        serverVersion: shortVersion || undefined,
      };
    } catch {
      return {
        ok: false,
        latencyMs: Math.max(0, Date.now() - started),
      };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  static computeChecksum(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private async withRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastErr = err;
        const code = String((err as { code?: unknown })?.code ?? '');
        if (!TRANSIENT_PG_CODES.has(code) || attempt >= maxAttempts) {
          throw err;
        }
        const delayMs = 75 * attempt + Math.floor(Math.random() * 50);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastErr;
  }
}
