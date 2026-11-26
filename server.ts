import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  isAuthorizedDeveloperAccount,
} from './server/DeveloperPrivileges.ts';
import { RankedMatchServer } from './server/RankedMatchServer.ts';
import { normalizeNexusUsername, RankedStore } from './server/RankedStore.ts';

function loadFirebaseConfig(): {
  projectId?: string;
  firestoreDatabaseId?: string;
  apiKey?: string;
} {
  const candidatePaths = [
    path.resolve(process.cwd(), 'android/app/src/main/assets/firebase-client-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const cfgPath of candidatePaths) {
    try {
      if (!fs.existsSync(cfgPath)) continue;
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        projectId?: unknown;
        firestoreDatabaseId?: unknown;
        apiKey?: unknown;
      };
      const projectId =
        typeof parsed.projectId === 'string' && parsed.projectId.trim()
          ? parsed.projectId.trim()
          : undefined;
      const firestoreDatabaseId =
        typeof parsed.firestoreDatabaseId === 'string' && parsed.firestoreDatabaseId.trim()
          ? parsed.firestoreDatabaseId.trim()
          : undefined;
      const apiKey =
        typeof parsed.apiKey === 'string' && parsed.apiKey.trim()
          ? parsed.apiKey.trim()
          : undefined;
      if (projectId) {
        return { projectId, firestoreDatabaseId, apiKey };
      }
    } catch {
      // Try next config candidate
    }
  }
  return {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined,
    firestoreDatabaseId: '(default)',
    apiKey: process.env.FIREBASE_WEB_API_KEY || undefined,
  };
}

const firebaseCfg = loadFirebaseConfig();
const firebaseProjectId = firebaseCfg.projectId;
const firestoreDatabaseId = firebaseCfg.firestoreDatabaseId ?? '(default)';
const firebaseWebApiKey = firebaseCfg.apiKey ?? '';
const firebaseAdminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);

function getAdminFirestore() {
  return firestoreDatabaseId && firestoreDatabaseId !== '(default)'
    ? getFirestore(firebaseAdminApp, firestoreDatabaseId)
    : getFirestore(firebaseAdminApp);
}

async function decodeFirebaseToken(token: string): Promise<DecodedIdToken | null> {
  const cleaned = token.trim();
  if (!cleaned || cleaned.length > 8192) {
    return null;
  }
  try {
    const decoded = await getAuth(firebaseAdminApp).verifyIdToken(cleaned);
    if (!decoded.uid) {
      return null;
    }
    if (firebaseProjectId && typeof decoded.aud === 'string' && decoded.aud !== firebaseProjectId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

async function verifyRawFirebaseToken(token: string): Promise<DecodedIdToken | null> {
  const decoded = await decodeFirebaseToken(token);
  if (!decoded || decoded.email_verified !== true) {
    return null;
  }
  return decoded;
}

async function extractBearerStatus(
  req: express.Request,
): Promise<
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; status: number; code: string; error: string }
> {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Missing Firebase authorization header.',
    };
  }
  const decoded = await decodeFirebaseToken(authHeader.slice(7));
  if (!decoded) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Invalid or expired Firebase ID token.',
    };
  }
  if (decoded.email_verified !== true) {
    return {
      ok: false,
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
      error: 'Please verify your email address before continuing.',
    };
  }
  return { ok: true, decoded };
}

async function requireVerifiedDeveloper(
  req: express.Request,
): Promise<
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; status: number; code: string; error: string }
> {
  const authResult = await extractBearerStatus(req);
  if (!authResult.ok) {
    return authResult;
  }
  const { decoded } = authResult;
  if (
    !isAuthorizedDeveloperAccount({
      firebaseUid: decoded.uid,
      projectId: firebaseProjectId,
      aud: decoded.aud,
      emailVerified: decoded.email_verified,
    })
  ) {
    return {
      ok: false,
      status: 403,
      code: 'DEVELOPER_FORBIDDEN',
      error: 'Exclusive developer privileges are restricted to the verified creator account.',
    };
  }
  return { ok: true, decoded };
}

function toUsernameDocKey(username: string): string {
  const lower = username.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return `u_${Buffer.from(lower, 'utf8').toString('hex')}`.slice(0, 128);
}

async function isUsernameTakenInFirestore(username: string): Promise<boolean> {
  const norm = normalizeNexusUsername(username);
  if (!norm.valid) return false;
  try {
    const db = getAdminFirestore();
    const snap = await Promise.race([
      db.collection('usernames').doc(toUsernameDocKey(norm.cleaned)).get(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    return Boolean(snap && snap.exists);
  } catch {
    return false;
  }
}

async function resolveEmailByUsernameFallback(username: string): Promise<string | null> {
  const norm = normalizeNexusUsername(username);
  if (!norm.valid) return null;
  try {
    const db = getAdminFirestore();
    const keySnap = await db.collection('usernames').doc(toUsernameDocKey(norm.cleaned)).get();
    const legacySnap = !keySnap.exists ? await db.collection('usernames').doc(norm.lower).get() : null;
    const snap = keySnap.exists ? keySnap : legacySnap;
    if (!snap || !snap.exists) return null;
    const uid = snap.data()?.uid;
    if (typeof uid !== 'string' || !uid.trim()) return null;
    const userRecord = await getAuth(firebaseAdminApp).getUser(uid.trim());
    return typeof userRecord.email === 'string' && userRecord.email.includes('@')
      ? userRecord.email.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function createAuthRateLimiter(maxRequestsPerMinute: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    const existing = buckets.get(ip);
    if (!existing || existing.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + 60_000 });
      if (buckets.size > 2000) {
        for (const [k, v] of buckets.entries()) {
          if (v.resetAt <= now) buckets.delete(k);
        }
      }
      next();
      return;
    }
    if (existing.count >= maxRequestsPerMinute) {
      res.status(429).json({
        error: 'Too many authentication attempts. Please wait a minute and try again.',
        code: 'RATE_LIMITED',
      });
      return;
    }
    existing.count += 1;
    next();
  };
}

function buildAllowedCorsOrigins(): Set<string> {
  const allowed = new Set<string>([
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
    'file://',
    'null',
    'https://ais-dev-o45j3avytqf2cxv34uusrr-658856767272.europe-west3.run.app',
    'https://ais-pre-o45j3avytqf2cxv34uusrr-658856767272.europe-west3.run.app',
    'https://gen-lang-client-0539248410.web.app',
    'https://gen-lang-client-0539248410.firebaseapp.com',
  ]);
  const envOrigins = [
    process.env.APP_URL,
    process.env.VITE_BACKEND_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
  ];
  for (const candidate of envOrigins) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim().replace(/\/+$/, '');
    if (!trimmed) continue;
    try {
      allowed.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed origin string
    }
  }
  return allowed;
}

function isAllowedNativeOrAppOrigin(
  origin: string,
  reqHost: string | undefined,
  allowlist: Set<string>,
): boolean {
  if (allowlist.has(origin)) return true;
  if (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('https://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('https://127.0.0.1:')
  ) {
    return true;
  }
  if (origin.startsWith('app://')) {
    return true;
  }
  if (reqHost && (origin === `https://${reqHost}` || origin === `http://${reqHost}`)) {
    return true;
  }
  return false;
}

function applyApiCorsHeaders(
  req: express.Request,
  res: express.Response,
  allowedCorsOrigins: Set<string>,
): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const reqHost = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  if (origin && isAllowedNativeOrAppOrigin(origin, reqHost, allowedCorsOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>,
): express.RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

function readBodyObject(req: express.Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return {};
  }
  return req.body as Record<string, unknown>;
}

export async function createAppServer(options?: {
  port?: number;
  storePath?: string;
  skipVite?: boolean;
}) {
  const app = express();
  const allowedCorsOrigins = buildAllowedCorsOrigins();
  const authRateLimit = createAuthRateLimiter(30);

  app.use('/api', (req, res, next) => {
    applyApiCorsHeaders(req, res, allowedCorsOrigins);
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use('/api', express.json({ limit: '1mb' }));

  const store = new RankedStore(options?.storePath);
  await store.init();
  const matchServer = new RankedMatchServer(store, {
    firebaseProjectId,
    firestoreDatabaseId,
    verifyFirebaseToken: async (token: string) => {
      const decoded = await verifyRawFirebaseToken(token);
      return decoded ? { uid: decoded.uid } : null;
    },
  });

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const dbHealth = await store.pingDatabase();
      res.status(dbHealth.ok ? 200 : 503).json({
        ok: dbHealth.ok,
        status: matchServer.getOnlineStatus(),
        storage: dbHealth,
      });
    }),
  );

  app.get('/api/ranked/status', (_req, res) => {
    res.json(matchServer.getOnlineStatus());
  });

  app.post(
    '/api/auth/check-username',
    asyncHandler(async (req, res) => {
      const body = readBodyObject(req);
      const username = typeof body.username === 'string' ? body.username : '';
      const excludePlayerId =
        typeof body.excludePlayerId === 'string' ? body.excludePlayerId.trim() : undefined;
      const localCheck = store.checkUsernameAvailability(username, excludePlayerId);
      if (localCheck.valid && localCheck.available && !excludePlayerId) {
        const takenCloud = await isUsernameTakenInFirestore(localCheck.cleaned || username);
        if (takenCloud) {
          res.json({
            valid: true,
            available: false,
            cleaned: localCheck.cleaned,
            code: 'USERNAME_TAKEN',
            error: 'This username is already taken.',
          });
          return;
        }
      }
      res.json(localCheck);
    }),
  );

  app.post(
    '/api/auth/register-profile',
    authRateLimit,
    asyncHandler(async (req, res) => {
      const authHeader = req.headers.authorization;
      if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Firebase authorization token.', code: 'UNAUTHORIZED' });
        return;
      }
      const decoded = await decodeFirebaseToken(authHeader.slice(7));
      if (!decoded || typeof decoded.email !== 'string' || !decoded.email.includes('@')) {
        res.status(401).json({ error: 'Invalid Firebase account token.', code: 'UNAUTHORIZED' });
        return;
      }
      const body = readBodyObject(req);
      const username = typeof body.username === 'string' ? body.username : '';
      const outcome = await store.registerFirebaseEmailAccountAsync({
        firebaseUid: decoded.uid,
        email: decoded.email,
        username,
        platform: typeof body.platform === 'string' ? (body.platform as never) : undefined,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      res.json({
        ok: true,
        playerId: outcome.playerId,
        numericId: outcome.numericId,
        username: outcome.profile.name,
      });
    }),
  );

  app.post(
    '/api/auth/login',
    authRateLimit,
    asyncHandler(async (req, res) => {
      const body = readBodyObject(req);
      const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!identifier || !password || identifier.length > 254 || password.length > 256) {
        res.status(400).json({
          error: 'Enter your email or username and password.',
          code: 'MISSING_CREDENTIALS',
        });
        return;
      }
      if (!firebaseWebApiKey) {
        res.status(503).json({
          error: 'Authentication service is not configured.',
          code: 'AUTH_NOT_CONFIGURED',
        });
        return;
      }

      let resolvedEmail = store.resolveLoginEmailByIdentifier(identifier);
      if (!resolvedEmail && !identifier.includes('@')) {
        resolvedEmail = await resolveEmailByUsernameFallback(identifier);
      }

      if (!resolvedEmail) {
        res.status(401).json({
          error: 'Invalid email, username, or password.',
          code: 'INVALID_CREDENTIALS',
        });
        return;
      }

      try {
        const idRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseWebApiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: resolvedEmail,
              password,
              returnSecureToken: false,
            }),
          },
        );
        if (!idRes.ok) {
          const errBody = (await idRes.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          const fbMsg = errBody?.error?.message ?? '';
          if (fbMsg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
            res.status(429).json({
              error: 'Too many failed attempts. Please wait a moment and try again.',
              code: 'RATE_LIMITED',
            });
            return;
          }
          if (fbMsg.includes('USER_DISABLED')) {
            res.status(403).json({
              error: 'This NEXUS ROYAL ID account has been disabled.',
              code: 'ACCOUNT_DISABLED',
            });
            return;
          }
          res.status(401).json({
            error: 'Invalid email, username, or password.',
            code: 'INVALID_CREDENTIALS',
          });
          return;
        }

        // Only reveal resolved email after password verification succeeded
        res.json({ ok: true, email: resolvedEmail });
      } catch {
        res.status(503).json({
          error: 'Unable to reach authentication server.',
          code: 'AUTH_UNAVAILABLE',
        });
      }
    }),
  );

  app.post(
    '/api/auth/recover',
    authRateLimit,
    asyncHandler(async (req, res) => {
      const body = readBodyObject(req);
      const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
      if (!identifier || identifier.length > 254) {
        res.status(400).json({
          error: 'Enter your email address or username.',
          code: 'INVALID_IDENTIFIER',
        });
        return;
      }

      const uniformResponse = {
        ok: true,
        message: 'If an account matches that email or username, a recovery email has been sent.',
      };

      if (!firebaseWebApiKey) {
        res.json(uniformResponse);
        return;
      }

      let resolvedEmail = store.resolveRecoveryEmailByIdentifier(identifier);
      if (!resolvedEmail && !identifier.includes('@')) {
        resolvedEmail = await resolveEmailByUsernameFallback(identifier);
      }

      if (resolvedEmail) {
        try {
          await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(firebaseWebApiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestType: 'PASSWORD_RESET',
                email: resolvedEmail,
              }),
            },
          );
        } catch {
          // Return uniform response even on transient email lookup failures
        }
      }

      res.json(uniformResponse);
    }),
  );

  app.get(
    '/api/auth/developer-status',
    asyncHandler(async (req, res) => {
      const authResult = await extractBearerStatus(req);
      if (!authResult.ok) {
        res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
        return;
      }
      const { decoded } = authResult;
      const isDeveloper = isAuthorizedDeveloperAccount({
        firebaseUid: decoded.uid,
        projectId: firebaseProjectId,
        aud: decoded.aud,
        emailVerified: decoded.email_verified,
      });
      res.json({
        ok: true,
        uid: decoded.uid,
        projectId: firebaseProjectId ?? null,
        isDeveloper,
      });
    }),
  );

  app.post(
    '/api/dev/sync-privileges',
    asyncHandler(async (req, res) => {
      const devAuth = await requireVerifiedDeveloper(req);
      if (!devAuth.ok) {
        res.status(devAuth.status).json({ error: devAuth.error, code: devAuth.code });
        return;
      }
      const profile = await store.reconcileVerifiedDeveloperSessionAsync(devAuth.decoded.uid);
      if (!profile || profile.isDeveloper !== true) {
        res.status(403).json({
          error: 'Verified creator account record could not be matched.',
          code: 'DEVELOPER_ACCOUNT_MISMATCH',
        });
        return;
      }
      await store.flushToDisk();
      matchServer.syncSessionFromStore(profile.playerId);
      res.json({
        ok: true,
        isDeveloper: true,
        profile,
      });
    }),
  );

  app.post(
    '/api/firebase/session',
    asyncHandler(async (req, res) => {
      const authResult = await extractBearerStatus(req);
      if (!authResult.ok) {
        res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
        return;
      }
      const decoded = authResult.decoded;
      const body = readBodyObject(req);
      const rawExisting = body.existingCloudIds as Record<string, unknown> | undefined;
      const existingCloudIds =
        rawExisting && typeof rawExisting === 'object'
          ? {
              playerId:
                typeof rawExisting.playerId === 'string'
                  ? rawExisting.playerId
                  : undefined,
              numericId:
                typeof rawExisting.numericId === 'string'
                  ? rawExisting.numericId
                  : undefined,
            }
          : undefined;

      const result = await store.resolveFirebaseSessionAsync({
        firebaseUid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : undefined,
        displayName:
          typeof body.displayName === 'string'
            ? body.displayName
            : typeof decoded.name === 'string'
              ? decoded.name
              : undefined,
        platform: typeof body.platform === 'string' ? (body.platform as never) : undefined,
        existingCloudIds,
      });
      const isDeveloper =
        isAuthorizedDeveloperAccount({
          firebaseUid: decoded.uid,
          projectId: firebaseProjectId,
          aud: decoded.aud,
          emailVerified: decoded.email_verified,
        }) && result.profile.isDeveloper === true;

      await store.flushToDisk();
      matchServer.syncSessionFromStore(result.profile.playerId);
      res.json({
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : '',
        isDeveloper,
        profile: isDeveloper ? result.profile : { ...result.profile, isDeveloper: undefined },
        secretToken: result.secretToken,
        created: result.created,
        cloudState: result.cloudState,
      });
    }),
  );

  app.post(
    '/api/firebase/sync-cloud',
    asyncHandler(async (req, res) => {
      const authResult = await extractBearerStatus(req);
      if (!authResult.ok) {
        res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
        return;
      }
      const decoded = authResult.decoded;
      const body = readBodyObject(req);
      const profile = await store.syncCloudProfileSnapshotAsync({
        firebaseUid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : undefined,
        username: typeof body.username === 'string' ? body.username : undefined,
        gender: body.gender === 'male' || body.gender === 'female' ? body.gender : undefined,
        platform: typeof body.platform === 'string' ? (body.platform as never) : undefined,
        avatarCharacterId:
          typeof body.avatarCharacterId === 'string' ? body.avatarCharacterId : undefined,
        vault: body.vault && typeof body.vault === 'object' ? body.vault : undefined,
        cloudState: body.cloudState && typeof body.cloudState === 'object' ? body.cloudState : undefined,
      });
      if (!profile) {
        res.status(404).json({ error: 'Bound player session not found.', code: 'NOT_FOUND' });
        return;
      }
      const isDeveloper =
        isAuthorizedDeveloperAccount({
          firebaseUid: decoded.uid,
          projectId: firebaseProjectId,
          aud: decoded.aud,
          emailVerified: decoded.email_verified,
        }) && profile.isDeveloper === true;

      await store.flushToDisk();
      matchServer.syncSessionFromStore(profile.playerId);
      res.json({
        isDeveloper,
        profile: isDeveloper ? profile : { ...profile, isDeveloper: undefined },
      });
    }),
  );

  app.post(
    '/api/ranked/profile',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const result = await store.upsertProfileAsync({
        playerId: typeof body.playerId === 'string' ? body.playerId : undefined,
        secretToken: typeof body.secretToken === 'string' ? body.secretToken : undefined,
        name: typeof body.name === 'string' ? body.name : undefined,
        platform: body.platform,
      });
      await store.flushToDisk();
      res.json(result);
    }),
  );

  app.get('/api/ranked/profile/:playerId', (req, res) => {
    const rawId = typeof req.params.playerId === 'string' ? req.params.playerId.trim() : '';
    if (!rawId || rawId.length > 64) {
      res.status(400).json({ error: 'Invalid player identifier' });
      return;
    }
    const stripPrivateVault = req.query.public === '1';
    const profile = store.getProfile(rawId, stripPrivateVault);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile });
  });

  app.get('/api/ranked/leaderboard', (req, res) => {
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 50;
    res.json({ leaderboard: store.getLeaderboard(limit) });
  });

  const handleUpdateUsername = asyncHandler(async (req: express.Request, res: express.Response) => {
    const body = req.body ?? {};
    const playerId = typeof body.playerId === 'string' ? body.playerId : '';
    const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
    const newName = typeof body.newName === 'string' ? body.newName : '';
    const outcome = await store.updateUsernameAsync({ playerId, secretToken, newName });
    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
      return;
    }
    await store.flushToDisk();
    matchServer.syncSessionFromStore(playerId);
    res.json({ profile: outcome.profile });
  });

  app.post('/api/profile/update-username', handleUpdateUsername);
  app.post('/api/profile/rename-once', handleUpdateUsername);

  app.post(
    '/api/profile/update-gender',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';
      const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
      const outcome = await store.updateGenderAsync({
        playerId,
        secretToken,
        gender: body.gender,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      matchServer.syncSessionFromStore(playerId);
      res.json({ profile: outcome.profile });
    }),
  );

  app.post(
    '/api/profile/sync-progression',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';
      const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
      const profile = await store.syncAccountProgressionAsync({
        playerId,
        secretToken,
        avatarCharacterId:
          typeof body.avatarCharacterId === 'string' ? body.avatarCharacterId : undefined,
        gender: body.gender,
      });
      if (!profile) {
        res.status(401).json({ error: 'Invalid player credentials' });
        return;
      }
      await store.flushToDisk();
      matchServer.syncSessionFromStore(playerId);
      res.json({ profile });
    }),
  );

  app.post(
    '/api/profile/sync-vault',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';
      const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
      const vault = body.vault && typeof body.vault === 'object' ? body.vault : {};
      const profile = await store.syncVaultStateAsync({
        playerId,
        secretToken,
        vault,
      });
      if (!profile) {
        res.status(401).json({ error: 'Invalid player credentials' });
        return;
      }
      await store.flushToDisk();
      matchServer.syncSessionFromStore(playerId);
      res.json({ profile });
    }),
  );

  app.post('/api/friends/lookup', (req, res) => {
    const body = req.body ?? {};
    const playerId = typeof body.playerId === 'string' ? body.playerId : '';
    const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
    const queryId = typeof body.queryId === 'string' ? body.queryId : '';
    const outcome = store.lookupPlayerForFriendAdd({ playerId, secretToken, queryId });
    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
      return;
    }
    res.json({
      player: outcome.player,
      relationStatus: outcome.relationStatus,
      pendingRequestId: outcome.pendingRequestId,
    });
  });

  app.post('/api/friends/state', (req, res) => {
    const body = req.body ?? {};
    const playerId = typeof body.playerId === 'string' ? body.playerId : '';
    const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
    const verified = store.verifyCredentials(playerId, secretToken);
    if (!verified) {
      res.status(401).json({ error: 'Invalid player credentials.', code: 'UNAUTHORIZED' });
      return;
    }
    res.json(matchServer.getFriendsSnapshotForPlayer(verified.playerId));
  });

  app.post(
    '/api/friends/request',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';
      const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
      const targetId = typeof body.targetId === 'string' ? body.targetId : '';
      const outcome = await store.sendFriendRequestAsync({
        playerId,
        secretToken,
        targetIdOrNumericId: targetId,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      matchServer.pushFriendsSyncToPlayer(outcome.fromPlayerId);
      matchServer.notifyFriendRequestReceived(outcome.toPlayerId, outcome.request);
      res.json({
        ok: true,
        request: outcome.request,
        ...matchServer.getFriendsSnapshotForPlayer(outcome.fromPlayerId),
      });
    }),
  );

  app.post(
    '/api/friends/respond',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';
      const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
      const requestId = typeof body.requestId === 'string' ? body.requestId : '';
      const accept = Boolean(body.accept);
      const outcome = await store.respondToFriendRequestAsync({
        playerId,
        secretToken,
        requestId,
        accept,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      matchServer.pushFriendsSyncToPlayer(outcome.toPlayerId);
      matchServer.notifyFriendRequestResponded(outcome.fromPlayerId, {
        requestId,
        accepted: outcome.accepted,
        byPlayerId: outcome.toPlayerId,
        byName: outcome.responderName,
      });
      res.json({
        ok: true,
        accepted: outcome.accepted,
        ...matchServer.getFriendsSnapshotForPlayer(outcome.toPlayerId),
      });
    }),
  );

  app.post(
    '/api/friends/cancel',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';
      const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
      const requestId = typeof body.requestId === 'string' ? body.requestId : '';
      const outcome = await store.cancelFriendRequestAsync({
        playerId,
        secretToken,
        requestId,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      matchServer.pushFriendsSyncToPlayer(outcome.fromPlayerId);
      matchServer.pushFriendsSyncToPlayer(outcome.toPlayerId);
      res.json({
        ok: true,
        requestId: outcome.requestId,
        ...matchServer.getFriendsSnapshotForPlayer(outcome.fromPlayerId),
      });
    }),
  );

  app.post(
    '/api/friends/remove',
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const playerId = typeof body.playerId === 'string' ? body.playerId : '';
      const secretToken = typeof body.secretToken === 'string' ? body.secretToken : '';
      const friendPlayerId = typeof body.friendPlayerId === 'string' ? body.friendPlayerId : '';
      const outcome = await store.removeFriendAsync({
        playerId,
        secretToken,
        friendPlayerId,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      matchServer.pushFriendsSyncToPlayer(outcome.playerId);
      matchServer.pushFriendsSyncToPlayer(outcome.friendPlayerId);
      res.json({
        ok: true,
        friendPlayerId: outcome.friendPlayerId,
        ...matchServer.getFriendsSnapshotForPlayer(outcome.playerId),
      });
    }),
  );

  const resolveMailboxCallerPlayerId = async (
    req: express.Request,
  ): Promise<
    | { ok: true; playerId: string }
    | { ok: false; status: number; error: string; code: string }
  > => {
    const body = req.body ?? {};
    const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
    const secretToken = typeof body.secretToken === 'string' ? body.secretToken.trim() : '';
    if (playerId && secretToken) {
      const verifiedPid = store.verifyCredentialsAndGetId(playerId, secretToken);
      if (verifiedPid) {
        return { ok: true, playerId: verifiedPid };
      }
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const authRes = await extractBearerStatus(req);
      if (authRes.ok) {
        const mappedPid = store.getPlayerIdByFirebaseUid(authRes.decoded.uid);
        if (mappedPid) {
          return { ok: true, playerId: mappedPid };
        }
        return {
          ok: false,
          status: 404,
          code: 'PROFILE_NOT_INITIALIZED',
          error: 'Player profile is not initialized yet.',
        };
      }
      return {
        ok: false,
        status: authRes.status,
        code: authRes.code,
        error: authRes.error,
      };
    }
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Invalid player credentials.',
    };
  };

  app.post(
    '/api/mailbox/state',
    asyncHandler(async (req, res) => {
      const caller = await resolveMailboxCallerPlayerId(req);
      if (!caller.ok) {
        res.status(caller.status).json({ error: caller.error, code: caller.code });
        return;
      }
      res.json(store.buildMailboxSnapshotForPlayer(caller.playerId, true));
    }),
  );

  app.post(
    '/api/mailbox/read',
    asyncHandler(async (req, res) => {
      const caller = await resolveMailboxCallerPlayerId(req);
      if (!caller.ok) {
        res.status(caller.status).json({ error: caller.error, code: caller.code });
        return;
      }
      const mailId = typeof req.body?.mailId === 'string' ? req.body.mailId : '';
      const outcome = await store.markMailboxReadAsync({ playerId: caller.playerId, mailId });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      res.json({ ok: true, ...outcome.state });
    }),
  );

  app.post(
    '/api/mailbox/claim',
    asyncHandler(async (req, res) => {
      const caller = await resolveMailboxCallerPlayerId(req);
      if (!caller.ok) {
        res.status(caller.status).json({ error: caller.error, code: caller.code });
        return;
      }
      const mailId = typeof req.body?.mailId === 'string' ? req.body.mailId : '';
      const outcome = await store.claimMailboxRewardAsync({ playerId: caller.playerId, mailId });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      matchServer.syncSessionFromStore(caller.playerId);
      res.json({
        ok: true,
        mailId: outcome.mailId,
        creditsGranted: outcome.creditsGranted,
        newBalance: outcome.newBalance,
        vault: outcome.vault,
        state: outcome.state,
      });
    }),
  );

  app.post(
    '/api/mailbox/archive',
    asyncHandler(async (req, res) => {
      const caller = await resolveMailboxCallerPlayerId(req);
      if (!caller.ok) {
        res.status(caller.status).json({ error: caller.error, code: caller.code });
        return;
      }
      const mailId = typeof req.body?.mailId === 'string' ? req.body.mailId : '';
      const archived = req.body?.archived !== false;
      const outcome = await store.setMailboxArchivedAsync({
        playerId: caller.playerId,
        mailId,
        archived,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      res.json({ ok: true, ...outcome.state });
    }),
  );

  app.post(
    '/api/mailbox/delete',
    asyncHandler(async (req, res) => {
      const caller = await resolveMailboxCallerPlayerId(req);
      if (!caller.ok) {
        res.status(caller.status).json({ error: caller.error, code: caller.code });
        return;
      }
      const mailId = typeof req.body?.mailId === 'string' ? req.body.mailId : '';
      const outcome = await store.deleteMailboxMessageAsync({
        playerId: caller.playerId,
        mailId,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      res.json({ ok: true, ...outcome.state });
    }),
  );

  app.post(
    '/api/mailbox/send',
    asyncHandler(async (req, res) => {
      const devAuth = await requireVerifiedDeveloper(req);
      if (!devAuth.ok) {
        res.status(devAuth.status).json({ error: devAuth.error, code: devAuth.code });
        return;
      }
      const body = readBodyObject(req);
      const outcome = await store.sendDeveloperMailboxMessageAsync({
        category: typeof body.category === 'string' ? (body.category as never) : 'system',
        title: typeof body.title === 'string' ? body.title : '',
        sender: typeof body.sender === 'string' ? body.sender : undefined,
        content: typeof body.content === 'string' ? body.content : '',
        rewardCredits: typeof body.rewardCredits === 'number' ? body.rewardCredits : 0,
        targetQuery: typeof body.targetQuery === 'string' ? body.targetQuery : undefined,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
        return;
      }
      await store.flushToDisk();
      matchServer.notifyMailboxUpdated(outcome.targetPlayerIds);
      res.json({ ok: true, mail: outcome.mail });
    }),
  );

  // Guarantee every unmatched or errored /api/* request returns valid JSON (never Vite SPA or Express HTML)
  app.use('/api', (req, res) => {
    applyApiCorsHeaders(req, res, allowedCorsOrigins);
    res.status(404).json({
      ok: false,
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      code: 'API_NOT_FOUND',
    });
  });

  app.use(
    '/api',
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      applyApiCorsHeaders(req, res, allowedCorsOrigins);
      if (res.headersSent) return;
      const errObj = err as { type?: string; status?: number; code?: string; message?: string };
      if (errObj?.type === 'entity.parse.failed') {
        res.status(400).json({
          ok: false,
          error: 'Invalid JSON request body.',
          code: 'INVALID_JSON',
        });
        return;
      }
      if (errObj?.type === 'entity.too.large') {
        res.status(413).json({
          ok: false,
          error: 'Request payload is too large.',
          code: 'PAYLOAD_TOO_LARGE',
        });
        return;
      }
      if (
        errObj?.code === 'DATABASE_ERROR' ||
        errObj?.code === 'USERNAME_TAKEN' ||
        errObj?.code === 'CONFLICT'
      ) {
        const dbStatus = errObj.status === 409 ? 409 : 503;
        res.status(dbStatus).json({
          ok: false,
          error:
            dbStatus === 409
              ? errObj.message || 'Conflicting database record.'
              : 'Database write failed. Changes were not saved.',
          code: errObj.code,
        });
        return;
      }
      const status =
        typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
          ? errObj.status
          : 500;
      res.status(status).json({
        ok: false,
        error: status >= 500 ? 'Internal server error.' : 'Invalid request.',
        code: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
      });
    },
  );

  const isProd = process.env.NODE_ENV === 'production';
  if (!options?.skipVite && !isProd) {
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/javascript').send(`
import "/@vite/env";
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== "undefined") {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = void 0; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
const ErrorOverlay = typeof HTMLElement !== "undefined" ? class extends HTMLElement {} : class {};
export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
`.trim());
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!options?.skipVite) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/|\/ws\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  httpServer.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url ?? '/';
    const pathname = reqUrl.split('?')[0];
    if (pathname === '/ws/ranked') {
      matchServer.handleUpgrade(request, socket, head);
    } else {
      socket.destroy();
    }
  });

  const port = options?.port ?? Number(process.env.PORT || 3000);
  await new Promise<void>((resolve) => {
    httpServer.listen(port, '0.0.0.0', () => {
      resolve();
    });
  });

  return {
    app,
    httpServer,
    store,
    matchServer,
    close: async () => {
      matchServer.dispose();
      await store.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

// Start server when executed directly via `tsx server.ts` or `node server.ts`
const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('server.ts');

if (isDirectRun) {
  createAppServer()
    .then(() => {
      const port = Number(process.env.PORT || 3000);
      console.log(`NEXUS ROYALE server listening on http://0.0.0.0:${port}`);
    })
    .catch((err) => {
      console.error('Failed to start NEXUS ROYALE server:', err);
      process.exit(1);
    });
}
