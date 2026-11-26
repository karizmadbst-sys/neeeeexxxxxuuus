import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface BackupVerificationResult {
  sourcePath: string;
  backupPath: string;
  manifestPath: string;
  sha256: string;
  byteSize: number;
  playerCount: number;
  friendshipCount: number;
  friendRequestCount: number;
  broadcastCount: number;
}

export function createAndVerifyRankedStoreBackup(options?: {
  sourcePath?: string;
  backupDir?: string;
}): BackupVerificationResult {
  const sourcePath =
    options?.sourcePath ?? path.resolve(process.cwd(), 'data', 'ranked-store.json');
  const backupDir =
    options?.backupDir ?? path.resolve(process.cwd(), 'data', 'backups');

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file does not exist: ${sourcePath}`);
  }

  const rawText = fs.readFileSync(sourcePath, 'utf8');
  const parsed = JSON.parse(rawText) as {
    version?: number;
    players?: Record<string, unknown>;
    friendships?: unknown[];
    friendRequests?: unknown[];
    mailboxBroadcasts?: unknown[];
  };

  if (parsed?.version !== 1 || !parsed.players || typeof parsed.players !== 'object') {
    throw new Error('Source JSON failed schema verification (expected version=1 and players map).');
  }

  const sourceHash = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(backupDir, { recursive: true });

  const backupFileName = `ranked-store.${stamp}.json`;
  const backupPath = path.join(backupDir, backupFileName);
  const manifestPath = path.join(backupDir, `${backupFileName}.sha256`);

  fs.writeFileSync(backupPath, rawText, 'utf8');
  const readBack = fs.readFileSync(backupPath, 'utf8');
  const verifyHash = crypto.createHash('sha256').update(readBack, 'utf8').digest('hex');

  if (verifyHash !== sourceHash) {
    throw new Error('Backup SHA-256 verification failed after write.');
  }

  const playerCount = Object.keys(parsed.players).length;
  const friendshipCount = Array.isArray(parsed.friendships) ? parsed.friendships.length : 0;
  const friendRequestCount = Array.isArray(parsed.friendRequests) ? parsed.friendRequests.length : 0;
  const broadcastCount = Array.isArray(parsed.mailboxBroadcasts) ? parsed.mailboxBroadcasts.length : 0;

  const manifest = {
    createdAt: new Date().toISOString(),
    sourceFile: 'data/ranked-store.json',
    backupFile: backupFileName,
    sha256: verifyHash,
    byteSize: Buffer.byteLength(readBack, 'utf8'),
    counts: {
      players: playerCount,
      friendships: friendshipCount,
      friendRequests: friendRequestCount,
      mailboxBroadcasts: broadcastCount,
    },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    sourcePath,
    backupPath,
    manifestPath,
    sha256: verifyHash,
    byteSize: manifest.byteSize,
    playerCount,
    friendshipCount,
    friendRequestCount,
    broadcastCount,
  };
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('backup-ranked-store.ts');

if (isDirectRun) {
  const result = createAndVerifyRankedStoreBackup();
  console.log(
    JSON.stringify(
      {
        ok: true,
        backupFile: path.relative(process.cwd(), result.backupPath),
        sha256: result.sha256,
        byteSize: result.byteSize,
        playerCount: result.playerCount,
        friendshipCount: result.friendshipCount,
        friendRequestCount: result.friendRequestCount,
        broadcastCount: result.broadcastCount,
      },
      null,
      2,
    ),
  );
}
