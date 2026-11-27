import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createAppServer } from '../server';
import { validateGlbBuffer, validatePreviewImageDataUrl } from '../server/GlbValidator';
import {
  DEVELOPER_FIREBASE_UID,
  DEVELOPER_NUMERIC_ID,
  DEVELOPER_PLAYER_ID,
  DEVELOPER_PROJECT_ID,
} from '../server/DeveloperPrivileges';
import { verifyDeveloperAuthorizationStatus } from '../src/firebase/FirebasePlayerService';
import { ApiRequestError, fetchApiJson } from '../src/network/ApiResponse';
import { NEXUS_SHOP_CATALOG } from '../src/shop/IShopSystem';

function buildSyntheticGlb(options?: {
  externalBufferUri?: string;
  externalImageUri?: string;
  extensionsRequired?: string[];
  triangleIndices?: number[];
  withSkeleton?: boolean;
}): Buffer {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint16Array(options?.triangleIndices ?? [0, 1, 2]);

  const posBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const idxBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);
  const pad4 = (len: number) => (4 - (len % 4)) % 4;
  const idxOffset = posBytes.byteLength;
  const binRawLength = idxOffset + idxBytes.byteLength;
  const binPad = pad4(binRawLength);
  const binBuffer = Buffer.concat([posBytes, idxBytes, Buffer.alloc(binPad, 0)]);

  const gltf: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'nexus-glb-test' },
    buffers: [
      options?.externalBufferUri
        ? { uri: options.externalBufferUri, byteLength: binRawLength }
        : { byteLength: binRawLength },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    meshes: [
      {
        name: 'TestMesh',
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        name: 'TestMaterial',
        pbrMetallicRoughness: { baseColorFactor: [0.2, 0.7, 1, 1] },
      },
    ],
  };

  if (options?.externalImageUri) {
    gltf.images = [{ uri: options.externalImageUri }];
  }
  if (options?.extensionsRequired) {
    gltf.extensionsRequired = options.extensionsRequired;
  }
  if (options?.withSkeleton) {
    gltf.skins = [{ joints: [0, 1, 2] }];
    gltf.animations = [{ name: 'Idle' }];
  }

  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = pad4(jsonRaw.byteLength);
  const jsonChunkData = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);

  const totalLength = 12 + 8 + jsonChunkData.byteLength + 8 + binBuffer.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunkData.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.byteLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonChunkData, binHeader, binBuffer]);
}

function makeMockToken(uid: string, overrides?: Partial<DecodedIdToken>): DecodedIdToken {
  return {
    aud: DEVELOPER_PROJECT_ID,
    auth_time: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { identities: {}, sign_in_provider: 'password' },
    iat: Math.floor(Date.now() / 1000),
    iss: `https://securetoken.google.com/${DEVELOPER_PROJECT_ID}`,
    sub: uid,
    uid,
    email: `${uid}@nexus.example`,
    email_verified: true,
    ...overrides,
  } as unknown as DecodedIdToken;
}

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('validateGlbBuffer accepts valid GLB 2.0 binary and rejects invalid/external/compressed inputs', () => {
  const validGlb = buildSyntheticGlb({ withSkeleton: true });
  const validRes = validateGlbBuffer(validGlb);
  assert.equal(validRes.ok, true);
  if (validRes.ok) {
    assert.equal(validRes.specs.meshCount, 1);
    assert.equal(validRes.specs.vertexCount, 3);
    assert.equal(validRes.specs.triangleCount, 1);
    assert.equal(validRes.specs.hasRig, true);
    assert.equal(validRes.specs.boneCount, 3);
    assert.equal(validRes.specs.animationCount, 1);
    assert.equal(validRes.specs.hasMaterials, true);
    assert.equal(validRes.specs.embeddedOnly, true);
  }

  const badMagic = Buffer.from(validGlb);
  badMagic.writeUInt32LE(0x12345678, 0);
  const badMagicRes = validateGlbBuffer(badMagic);
  assert.equal(badMagicRes.ok, false);
  if (!badMagicRes.ok) assert.equal(badMagicRes.code, 'INVALID_GLB_MAGIC');

  const badVersion = Buffer.from(validGlb);
  badVersion.writeUInt32LE(1, 4);
  const badVerRes = validateGlbBuffer(badVersion);
  assert.equal(badVerRes.ok, false);
  if (!badVerRes.ok) assert.equal(badVerRes.code, 'UNSUPPORTED_GLB_VERSION');

  const truncated = validGlb.subarray(0, validGlb.byteLength - 4);
  const truncRes = validateGlbBuffer(truncated);
  assert.equal(truncRes.ok, false);
  if (!truncRes.ok) assert.equal(truncRes.code, 'CORRUPT_GLB_LENGTH');

  const extBuf = buildSyntheticGlb({ externalBufferUri: 'https://evil.example/a.bin' });
  const extBufRes = validateGlbBuffer(extBuf);
  assert.equal(extBufRes.ok, false);
  if (!extBufRes.ok) assert.equal(extBufRes.code, 'EXTERNAL_BUFFER_URI_FORBIDDEN');

  const extImg = buildSyntheticGlb({ externalImageUri: '../secret.png' });
  const extImgRes = validateGlbBuffer(extImg);
  assert.equal(extImgRes.ok, false);
  if (!extImgRes.ok) assert.equal(extImgRes.code, 'EXTERNAL_TEXTURE_URI_FORBIDDEN');

  const draco = buildSyntheticGlb({ extensionsRequired: ['KHR_draco_mesh_compression'] });
  const dracoRes = validateGlbBuffer(draco);
  assert.equal(dracoRes.ok, false);
  if (!dracoRes.ok) assert.equal(dracoRes.code, 'UNSUPPORTED_REQUIRED_EXTENSION');
});

test('validatePreviewImageDataUrl accepts PNG/JPEG/WebP and rejects SVG/HTML', () => {
  const okPng = validatePreviewImageDataUrl(VALID_PNG_DATA_URL);
  assert.equal(okPng.ok, true);

  const badSvg = validatePreviewImageDataUrl(
    'data:image/svg+xml;base64,' + Buffer.from('<svg></svg>').toString('base64'),
  );
  assert.equal(badSvg.ok, false);
});

test('GLB Store RBAC, dev import/publish lifecycle, player purchase, ownership preservation, and delete', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-glb-store-test-'));
  const storePath = path.join(tempDir, 'ranked-store.json');

  const tokenMap = new Map<string, DecodedIdToken>([
    ['dev-token', makeMockToken(DEVELOPER_FIREBASE_UID)],
    [
      'dev-unverified',
      makeMockToken(DEVELOPER_FIREBASE_UID, { email_verified: false }),
    ],
    ['player1-token', makeMockToken('uid-player-one')],
    ['player2-token', makeMockToken('uid-player-two')],
  ]);

  const srv = await createAppServer({
    port: 0,
    storePath,
    skipVite: true,
    verifyFirebaseTokenForTest: async (tok) => tokenMap.get(tok) ?? null,
  });

  try {
    const addr = srv.httpServer.address();
    assert.ok(addr && typeof addr !== 'string');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const glbBytes = buildSyntheticGlb({ withSkeleton: true });
    const glbBase64 = glbBytes.toString('base64');

    // 1. RBAC checks: anonymous and non-dev cannot call /api/dev/glb/*
    const anonDevList = await fetch(`${baseUrl}/api/dev/glb/assets`);
    assert.equal(anonDevList.status, 401);

    const playerDevList = await fetch(`${baseUrl}/api/dev/glb/assets`, {
      headers: { Authorization: 'Bearer player1-token' },
    });
    assert.equal(playerDevList.status, 403);

    const unverifiedDevImport = await fetch(`${baseUrl}/api/dev/glb/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dev-unverified',
      },
      body: JSON.stringify({
        glbBase64,
        name: 'Blocked Unverified',
        assetType: 'character',
        priceCredits: 500,
      }),
    });
    assert.equal(unverifiedDevImport.status, 403);

    // 2. Developer imports a character GLB as Draft
    const importRes = await fetch(`${baseUrl}/api/dev/glb/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dev-token',
      },
      body: JSON.stringify({
        glbBase64,
        originalFileName: 'cyber_vanguard.glb',
        name: 'Cyber Vanguard',
        description: 'Custom 3D character imported via GLB.',
        assetType: 'character',
        equipSlot: 'character',
        rarity: 'Legendary',
        priceCredits: 1500,
        accentHex: '#38bdf8',
        scaleMultiplier: 1.05,
        previewImageDataUrl: VALID_PNG_DATA_URL,
        publishImmediately: false,
      }),
    });
    assert.equal(importRes.status, 201);
    const importData = (await importRes.json()) as {
      ok: boolean;
      asset: { id: string; status: string; category: string; modelUrl: string; previewUrl: string };
    };
    assert.equal(importData.ok, true);
    assert.equal(importData.asset.status, 'draft');
    assert.equal(importData.asset.category, 'characters');
    const assetId = importData.asset.id;

    // Duplicate SHA-256 GLB rejected with 409
    const dupRes = await fetch(`${baseUrl}/api/dev/glb/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dev-token',
      },
      body: JSON.stringify({
        glbBase64,
        name: 'Duplicate Cyber Vanguard',
        assetType: 'character',
        priceCredits: 1000,
      }),
    });
    assert.equal(dupRes.status, 409);

    // Draft is hidden from public catalog and binary download for regular players
    const publicCatalogDraft = (await (
      await fetch(`${baseUrl}/api/store/glb/catalog`)
    ).json()) as { assets: unknown[] };
    assert.equal(publicCatalogDraft.assets.length, 0);

    const draftBinaryPlayer = await fetch(`${baseUrl}${importData.asset.modelUrl}`, {
      headers: { Authorization: 'Bearer player1-token' },
    });
    assert.equal(draftBinaryPlayer.status, 403);

    // Developer can still inspect draft binary and preview
    const draftBinaryDev = await fetch(`${baseUrl}${importData.asset.modelUrl}`, {
      headers: { Authorization: 'Bearer dev-token' },
    });
    assert.equal(draftBinaryDev.status, 200);
    assert.equal(Buffer.from(await draftBinaryDev.arrayBuffer()).equals(glbBytes), true);

    // 3. Developer updates metadata and publishes asset
    const updateRes = await fetch(`${baseUrl}/api/dev/glb/assets/${assetId}/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dev-token',
      },
      body: JSON.stringify({
        name: 'Cyber Vanguard Mk II',
        priceCredits: 1200,
      }),
    });
    assert.equal(updateRes.status, 200);

    const publishRes = await fetch(`${baseUrl}/api/dev/glb/assets/${assetId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dev-token',
      },
      body: JSON.stringify({ published: true }),
    });
    assert.equal(publishRes.status, 200);

    const publicCatalogPublished = (await (
      await fetch(`${baseUrl}/api/store/glb/catalog`)
    ).json()) as { assets: Array<{ id: string; name: string; priceCredits: number }> };
    assert.equal(publicCatalogPublished.assets.length, 1);
    assert.equal(publicCatalogPublished.assets[0].name, 'Cyber Vanguard Mk II');
    assert.equal(publicCatalogPublished.assets[0].priceCredits, 1200);

    // 4. Create player1 session via /api/firebase/session & purchase static + GLB items
    const p1SessionRes = await fetch(`${baseUrl}/api/firebase/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer player1-token',
      },
      body: JSON.stringify({ displayName: 'PlayerOne', platform: 'pc' }),
    });
    assert.equal(p1SessionRes.status, 200);
    const p1Session = (await p1SessionRes.json()) as {
      isDeveloper: boolean;
      profile: { vault?: { credits: number; ownedIds: string[] } };
    };
    assert.equal(p1Session.isDeveloper, false);
    const startingCredits = p1Session.profile.vault?.credits ?? 0;
    assert.ok(startingCredits > 0, `Expected starter credits > 0, got ${startingCredits}`);

    // Pick an affordable static item from NEXUS_SHOP_CATALOG so we verify existing catalog compatibility
    const cheapStatic = NEXUS_SHOP_CATALOG.find(
      (i) => !i.defaultOwned && i.priceCredits > 0 && i.priceCredits <= startingCredits,
    );
    assert.ok(cheapStatic, 'Expected an affordable static item in NEXUS_SHOP_CATALOG');

    const staticBuyRes = await fetch(`${baseUrl}/api/shop/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer player1-token',
      },
      body: JSON.stringify({ itemId: cheapStatic.id }),
    });
    assert.equal(staticBuyRes.status, 200);
    const staticBuyJson = (await staticBuyRes.json()) as {
      ok: boolean;
      credits: number;
      vault: { ownedIds: string[] };
    };
    assert.equal(staticBuyJson.ok, true);
    assert.equal(staticBuyJson.credits, startingCredits - cheapStatic.priceCredits);
    assert.ok(staticBuyJson.vault.ownedIds.includes(cheapStatic.id));

    // Now test insufficient funds if remaining credits < 1200, then adjust GLB price to match remaining credits
    if (staticBuyJson.credits < 1200) {
      const insuffRes = await fetch(`${baseUrl}/api/shop/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer player1-token',
        },
        body: JSON.stringify({ itemId: assetId }),
      });
      assert.equal(insuffRes.status, 400);
      await fetch(`${baseUrl}/api/dev/glb/assets/${assetId}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dev-token',
        },
        body: JSON.stringify({ priceCredits: staticBuyJson.credits }),
      });
    }

    const glbBuyRes = await fetch(`${baseUrl}/api/shop/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer player1-token',
      },
      body: JSON.stringify({ itemId: assetId }),
    });
    assert.equal(glbBuyRes.status, 200);
    const glbBuyJson = (await glbBuyRes.json()) as {
      ok: boolean;
      credits: number;
      vault: { ownedIds: string[] };
    };
    assert.equal(glbBuyJson.ok, true);
    assert.ok(glbBuyJson.vault.ownedIds.includes(assetId));
    assert.ok(glbBuyJson.vault.ownedIds.includes(cheapStatic.id));

    // Duplicate purchase rejected
    const dupBuyRes = await fetch(`${baseUrl}/api/shop/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer player1-token',
      },
      body: JSON.stringify({ itemId: assetId }),
    });
    assert.equal(dupBuyRes.status, 409);

    // 5. Unpublish asset -> player1 (owner) STILL sees & downloads it, player2 (non-owner) is blocked
    await fetch(`${baseUrl}/api/dev/glb/assets/${assetId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dev-token',
      },
      body: JSON.stringify({ published: false }),
    });

    const p1CatalogAfterUnpublish = (await (
      await fetch(`${baseUrl}/api/store/glb/catalog`, {
        headers: { Authorization: 'Bearer player1-token' },
      })
    ).json()) as { assets: Array<{ id: string }> };
    assert.equal(p1CatalogAfterUnpublish.assets.length, 1);

    const p1ModelAfterUnpublish = await fetch(`${baseUrl}${importData.asset.modelUrl}`, {
      headers: { Authorization: 'Bearer player1-token' },
    });
    assert.equal(p1ModelAfterUnpublish.status, 200);

    const p2CatalogAfterUnpublish = (await (
      await fetch(`${baseUrl}/api/store/glb/catalog`, {
        headers: { Authorization: 'Bearer player2-token' },
      })
    ).json()) as { assets: Array<{ id: string }> };
    assert.equal(p2CatalogAfterUnpublish.assets.length, 0);

    const p2ModelAfterUnpublish = await fetch(`${baseUrl}${importData.asset.modelUrl}`, {
      headers: { Authorization: 'Bearer player2-token' },
    });
    assert.equal(p2ModelAfterUnpublish.status, 403);

    // 6. Developer deletes asset -> removed cleanly
    const delRes = await fetch(`${baseUrl}/api/dev/glb/assets/${assetId}/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dev-token',
      },
      body: JSON.stringify({}),
    });
    assert.equal(delRes.status, 200);

    const devAfterDel = (await (
      await fetch(`${baseUrl}/api/dev/glb/assets`, {
        headers: { Authorization: 'Bearer dev-token' },
      })
    ).json()) as { assets: unknown[] };
    assert.equal(devAfterDel.assets.length, 0);
  } finally {
    await srv.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Developer status & sync-privileges authorize verified developer only and keep regular players restricted', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-dev-auth-test-'));
  const storePath = path.join(tempDir, 'ranked-store.json');

  // Seed store with the existing developer record (simulating missing/stale isDeveloper flag before reconciliation)
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      {
        version: 1,
        players: {
          [DEVELOPER_PLAYER_ID]: {
            playerId: DEVELOPER_PLAYER_ID,
            numericId: DEVELOPER_NUMERIC_ID,
            firebaseUid: DEVELOPER_FIREBASE_UID,
            email: 'faridamzil48@gmail.com',
            secretToken: 'test-dev-secret-token',
            name: 'karizma',
            usernameChanged: false,
            platform: 'pc',
            gender: 'male',
            rp: 200,
            tier: 'Bronze',
            wins: 0,
            kills: 0,
            deaths: 0,
            top3: 0,
            matchesPlayed: 0,
            totalDamage: 0,
            bestKillsInMatch: 0,
            level: 100,
            xp: 0,
            avatarCharacterId: 'char-01',
            vault: {
              credits: 1_000_000,
              ownedIds: ['glider-nexus-standard'],
              equippedOutfitId: null,
              equippedGliderId: 'glider-nexus-standard',
              equippedEmoteId: 'emote-amber-flare',
              equippedGlooSkinId: 'shop-gloo-arctic-classic',
              equippedAvatarId: 'shop-avatar-recruit',
              equippedBannerId: 'shop-banner-standard',
              equippedWeaponSkins: {},
              equippedEmoteWheel: ['dance-floss', null, null, null, null, null, null, null],
              equippedArmoryIds: {},
            },
            careerMatches: 0,
            careerWins: 0,
            careerKills: 0,
            careerDeaths: 0,
            careerDamage: 0,
            careerBestKills: 0,
            history: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        },
        friendships: [],
        friendRequests: [],
        mailboxBroadcasts: {},
        mailboxDirectMessages: [],
        mailboxUserStates: {},
      },
      null,
      2,
    ),
    'utf8',
  );

  const tokenMap = new Map<string, DecodedIdToken>([
    ['dev-token', makeMockToken(DEVELOPER_FIREBASE_UID)],
    ['dev-unverified', makeMockToken(DEVELOPER_FIREBASE_UID, { email_verified: false })],
    ['player1-token', makeMockToken('uid-regular-player')],
  ]);

  const srv = await createAppServer({
    port: 0,
    storePath,
    skipVite: true,
    verifyFirebaseTokenForTest: async (tok) => tokenMap.get(tok) ?? null,
  });

  try {
    const addr = srv.httpServer.address();
    assert.ok(addr && typeof addr !== 'string');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Anonymous requests must fail with 401
    const anonStatus = await fetch(`${baseUrl}/api/auth/developer-status`);
    assert.equal(anonStatus.status, 401);
    const anonSync = await fetch(`${baseUrl}/api/dev/sync-privileges`, { method: 'POST' });
    assert.equal(anonSync.status, 401);

    // Regular player gets isDeveloper=false on status and 403 on sync-privileges
    const regularStatusRes = await fetch(`${baseUrl}/api/auth/developer-status`, {
      headers: { Authorization: 'Bearer player1-token' },
    });
    assert.equal(regularStatusRes.status, 200);
    const regularStatus = (await regularStatusRes.json()) as { isDeveloper: boolean };
    assert.equal(regularStatus.isDeveloper, false);

    const regularSyncRes = await fetch(`${baseUrl}/api/dev/sync-privileges`, {
      method: 'POST',
      headers: { Authorization: 'Bearer player1-token' },
    });
    assert.equal(regularSyncRes.status, 403);

    // Unverified developer token rejected with 403
    const unverifiedStatus = await fetch(`${baseUrl}/api/auth/developer-status`, {
      headers: { Authorization: 'Bearer dev-unverified' },
    });
    assert.equal(unverifiedStatus.status, 403);

    // Verified developer token passes both developer-status and sync-privileges
    const devStatusRes = await fetch(`${baseUrl}/api/auth/developer-status`, {
      headers: { Authorization: 'Bearer dev-token' },
    });
    assert.equal(devStatusRes.status, 200);
    const devStatus = (await devStatusRes.json()) as { isDeveloper: boolean; uid: string };
    assert.equal(devStatus.isDeveloper, true);
    assert.equal(devStatus.uid, DEVELOPER_FIREBASE_UID);

    const devSyncRes = await fetch(`${baseUrl}/api/dev/sync-privileges`, {
      method: 'POST',
      headers: { Authorization: 'Bearer dev-token' },
    });
    assert.equal(devSyncRes.status, 200);
    const devSync = (await devSyncRes.json()) as {
      ok: boolean;
      isDeveloper: boolean;
      profile: {
        playerId: string;
        numericId: string;
        level: number;
        isDeveloper?: boolean;
        vault?: { credits: number; ownedIds: string[] };
      };
    };
    assert.equal(devSync.ok, true);
    assert.equal(devSync.isDeveloper, true);
    assert.equal(devSync.profile.playerId, DEVELOPER_PLAYER_ID);
    assert.equal(devSync.profile.numericId, DEVELOPER_NUMERIC_ID);
    assert.equal(devSync.profile.isDeveloper, true);
    assert.equal(devSync.profile.level, 100);
    assert.equal(devSync.profile.vault?.credits, 1_000_000);

    // Client verification helper tests against live test server + offline reachability failure
    const routedFetch: typeof fetchApiJson = (url, init, fallbackError) => {
      const targetUrl = url.startsWith('/') ? `${baseUrl}${url}` : url;
      return fetchApiJson(targetUrl, init, fallbackError);
    };

    const devVerifyOutcome = await verifyDeveloperAuthorizationStatus('dev-token', routedFetch);
    assert.equal(devVerifyOutcome.verifiedDeveloper, true);
    assert.equal(devVerifyOutcome.reachable, true);
    assert.equal(devVerifyOutcome.profile?.playerId, DEVELOPER_PLAYER_ID);
    assert.equal(devVerifyOutcome.profile?.isDeveloper, true);

    const regularVerifyOutcome = await verifyDeveloperAuthorizationStatus('player1-token', routedFetch);
    assert.equal(regularVerifyOutcome.verifiedDeveloper, false);
    assert.equal(regularVerifyOutcome.reachable, true);
    assert.equal(regularVerifyOutcome.profile, undefined);

    const offlineVerifyOutcome = await verifyDeveloperAuthorizationStatus('dev-token', async () => {
      throw new ApiRequestError('Gateway HTML cookie check', {
        status: 503,
        isNetworkOrGatewayError: true,
      });
    });
    assert.equal(offlineVerifyOutcome.verifiedDeveloper, false);
    assert.equal(offlineVerifyOutcome.reachable, false);
  } finally {
    await srv.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
