import assert from 'node:assert/strict';
import test from 'node:test';
import type { User as FirebaseUser } from 'firebase/auth';
import firebaseClientConfig from '../android/app/src/main/assets/firebase-client-config.json';
import {
  getApiUrl,
  getBackendHttpOrigin,
  getWebSocketUrl,
  isCapacitorNative,
  isElectronDesktop,
} from '../src/config/RuntimeConfig';
import { detectAuthPlatform } from '../src/firebase/auth/AuthAdapter';
import {
  connectRankedPresenceNonBlocking,
  signInNexusAccount,
  USERNAME_LOOKUP_UNAVAILABLE_ERROR,
} from '../src/firebase/auth/NexusSignInFlow';
import {
  FirebasePlayerService,
  type CloudPlayerPrivateDoc,
  type CloudPublicProfileDoc,
} from '../src/firebase/FirebasePlayerService';
import { ApiRequestError, parseJsonResponse } from '../src/network/ApiResponse';
import { RankedApiClient } from '../src/ranked/RankedApiClient';
import type { PlayerAccountSnapshot } from '../src/progression/PlayerProfileManager';
import type { RankedVaultState } from '../src/ranked/RankedTypes';

function makeMockUser(overrides: Partial<FirebaseUser> = {}): FirebaseUser {
  return {
    uid: 'uid-existing-player-123',
    email: 'pilot@nexusroyale.example',
    displayName: 'AlphaPilot',
    emailVerified: true,
    photoURL: null,
    getIdToken: async () => 'mock-firebase-id-token-abc',
    ...overrides,
  } as unknown as FirebaseUser;
}

function makeFallbackVault(): RankedVaultState {
  return {
    credits: 2000,
    ownedIds: ['glider-nexus-standard'],
    equippedOutfitId: null,
    equippedGliderId: 'glider-nexus-standard',
    equippedEmoteId: 'emote-amber-flare',
    equippedGlooSkinId: 'shop-gloo-arctic-classic',
    equippedAvatarId: 'avatar-recruit',
    equippedBannerId: 'banner-standard',
    equippedWeaponSkins: {},
    equippedEmoteWheel: ['dance-floss', null, null, null, null, null, null, null],
    equippedArmoryIds: {},
  };
}

function makeFallbackSnapshot(): PlayerAccountSnapshot {
  return {
    playerId: 'local-operator',
    numericId: '999999999',
    username: 'FIGHTER',
    usernameChanged: false,
    platform: 'pc',
    gender: null,
    level: 1,
    xp: 0,
    nextLevelXp: 100,
    avatarCharacterId: 'char-01',
    totalMatches: 0,
    wins: 0,
    eliminations: 0,
    deaths: 0,
    totalDamage: 0,
    bestKillsInMatch: 0,
    winRatePct: 0,
    kdRatio: 0,
    rp: 200,
    tier: 'Bronze',
    rankedMatches: 0,
    rankedWins: 0,
    rankedKills: 0,
    rankedTop3: 0,
  };
}

function makeExistingPrivateDoc(): CloudPlayerPrivateDoc {
  return {
    uid: 'uid-existing-player-123',
    playerId: 'nx-445566778',
    numericId: '445566778',
    email: 'pilot@nexusroyale.example',
    vault: {
      credits: 18750,
      ownedIds: [
        'glider-nexus-standard',
        'emote-amber-flare',
        'emote-dance-floss',
        'shop-gloo-arctic-classic',
        'cloth-top-hoodie-urban',
        'cloth-pants-cargo-charcoal',
        'cloth-shoes-sneakers-white',
        'shop-avatar-recruit',
        'shop-banner-standard',
        'skin-scar-crimson',
      ],
      equippedOutfitId: 'outfit-cyber-wolf',
      equippedGliderId: 'glider-nexus-standard',
      equippedEmoteId: 'emote-amber-flare',
      equippedGlooSkinId: 'shop-gloo-arctic-classic',
      equippedAvatarId: 'avatar-recruit',
      equippedBannerId: 'banner-standard',
      equippedWeaponSkins: { scar: 'skin-scar-crimson' },
      equippedEmoteWheel: ['dance-floss', 'amber-flare', null, null, null, null, null, null],
      equippedArmoryIds: { rifle: 'scar' },
    },
    cloudState: {
      selectedCharacterId: 'char-04',
      settings: { graphicsQuality: 'high', sensitivity: 1.4 },
      controlSettings: {
        bindings: { fire: 'Mouse0', jump: 'Space' },
      },
      customization: {
        skinId: 'skin-warm',
        eyesId: 'eyes-sharp',
        mouthId: 'mouth-neutral',
        hairStyleId: 'hair-tactical',
        hairColorId: 'color-black',
        topId: 'cloth-top-hoodie-urban',
        pantsId: 'cloth-pants-cargo-charcoal',
        shoesId: 'cloth-shoes-sneakers-white',
        hatId: null,
        glassesId: null,
        maskId: null,
        armorId: null,
        accessoryId: null,
        petId: 'none',
      },
    },
  };
}

function makeExistingPublicDoc(): CloudPublicProfileDoc {
  return {
    uid: 'uid-existing-player-123',
    playerId: 'nx-445566778',
    numericId: '445566778',
    username: 'AlphaPilot',
    usernameChanged: true,
    avatarId: 'avatar-recruit',
    bannerId: 'banner-standard',
    avatarCharacterId: 'char-04',
    gender: 'male',
    platform: 'android',
    level: 27,
    xp: 640,
    rp: 1840,
    tier: 'Diamond',
    totalMatches: 84,
    wins: 19,
    eliminations: 215,
    deaths: 65,
    totalDamage: 48920,
    bestKillsInMatch: 14,
    rankedMatches: 42,
    rankedWins: 11,
    rankedKills: 118,
    rankedTop3: 24,
  };
}

test('Scenario 1: Email login authenticates directly with Firebase without calling /api/auth/login', async () => {
  let backendLookupCalled = false;
  let firebaseEmailCalled: string | null = null;
  let verifiedCallbackUid: string | null = null;

  const user = await signInNexusAccount('  pilot@nexusroyale.example  ', 'SecretPass123!', {
    loginWithIdentifier: async () => {
      backendLookupCalled = true;
      throw new ApiRequestError('Failed to fetch', {
        status: 0,
        code: 'NETWORK_ERROR',
        isNetworkOrGatewayError: true,
      });
    },
    signInWithEmail: async (email) => {
      firebaseEmailCalled = email;
      return makeMockUser({ email });
    },
    onVerifiedUser: async (u) => {
      verifiedCallbackUid = u.uid;
    },
  });

  assert.equal(backendLookupCalled, false, 'Email login must not call /api/auth/login');
  assert.equal(firebaseEmailCalled, 'pilot@nexusroyale.example');
  assert.equal(verifiedCallbackUid, 'uid-existing-player-123');
  assert.equal(user.uid, 'uid-existing-player-123');
});

test('Scenario 1b: Username login shows clear email fallback message when backend returns HTML cookie check or Failed to fetch', async () => {
  // Simulate HTML <!doctype html> response parsed by ApiResponse
  const htmlResponse = new Response('<!doctype html><html><body>__cookie_check</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

  let htmlErr: unknown;
  try {
    await parseJsonResponse(htmlResponse);
  } catch (err) {
    htmlErr = err;
  }
  assert.ok(htmlErr instanceof ApiRequestError);
  assert.equal(htmlErr.isNetworkOrGatewayError, true);
  assert.equal(htmlErr.isHtmlResponse, true);

  let firebaseCalled = false;
  await assert.rejects(
    () =>
      signInNexusAccount('AlphaPilot', 'SecretPass123!', {
        loginWithIdentifier: async () => {
          throw htmlErr;
        },
        signInWithEmail: async () => {
          firebaseCalled = true;
          return makeMockUser();
        },
        onVerifiedUser: async () => {},
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, USERNAME_LOOKUP_UNAVAILABLE_ERROR);
      return true;
    },
  );
  assert.equal(firebaseCalled, false);
});

test('Scenario 2: Wrong password returns Firebase authentication error without calling backend', async () => {
  let backendCalled = false;
  let verifiedCalled = false;

  await assert.rejects(
    () =>
      signInNexusAccount('pilot@nexusroyale.example', 'WrongPass!', {
        loginWithIdentifier: async () => {
          backendCalled = true;
          return { email: 'pilot@nexusroyale.example' };
        },
        signInWithEmail: async () => {
          throw new Error('Invalid email, username, or password.');
        },
        onVerifiedUser: async () => {
          verifiedCalled = true;
        },
      }),
    /Invalid email, username, or password\./,
  );

  assert.equal(backendCalled, false);
  assert.equal(verifiedCalled, false);
});

test('Scenario 3: Existing player loads exact Firestore profile & vault when /api/firebase/session is unreachable without overwriting Firestore or minting IDs', async () => {
  let writePrivateCalled = false;
  let writePublicCalled = false;
  let ensureIndexCalled = false;

  const existingPrivate = makeExistingPrivateDoc();
  const existingPublic = makeExistingPublicDoc();

  const service = new FirebasePlayerService({
    readPrivateDoc: async () => existingPrivate,
    readPublicDoc: async () => existingPublic,
    fetchSessionApi: async () => {
      throw new ApiRequestError('Server returned HTML cookie check', {
        status: 502,
        code: 'BACKEND_AUTH_PROXY_HTML',
        isNetworkOrGatewayError: true,
        isHtmlResponse: true,
      });
    },
    ensureIndexEntries: async () => {
      ensureIndexCalled = true;
    },
    writePrivateDoc: async () => {
      writePrivateCalled = true;
    },
    writePublicDoc: async () => {
      writePublicCalled = true;
    },
  });

  const result = await service.initializeAuthenticatedAccount({
    user: makeMockUser(),
    platform: 'pc',
    guestCredentials: null,
    fallbackVault: makeFallbackVault(),
    fallbackAccountSnapshot: makeFallbackSnapshot(),
    fallbackCloudState: { selectedCharacterId: 'char-01' },
  });

  assert.equal(result.hydratedFromFirestoreOffline, true);
  assert.equal(result.secretToken, '');
  assert.equal(result.isDeveloper, false, 'Developer privileges must never be self-granted offline');
  assert.equal(result.profile.isDeveloper, undefined);
  assert.equal(result.profile.playerId, 'nx-445566778');
  assert.equal(result.profile.numericId, '445566778');
  assert.equal(result.profile.name, 'AlphaPilot');
  assert.equal(result.profile.level, 27);
  assert.equal(result.profile.xp, 640);
  assert.equal(result.profile.rp, 1840);
  assert.equal(result.profile.tier, 'Diamond');
  assert.equal(result.profile.wins, 11);
  assert.equal(result.profile.kills, 118);
  assert.equal(result.profile.top3, 24);
  assert.equal(result.profile.matchesPlayed, 42);
  assert.equal(result.profile.careerMatches, 84);
  assert.equal(result.profile.careerWins, 19);
  assert.equal(result.profile.careerKills, 215);
  assert.equal(result.vault.credits, 18750);
  assert.ok(result.vault.ownedIds.includes('skin-scar-crimson'));
  assert.equal(result.vault.equippedWeaponSkins.scar, 'skin-scar-crimson');
  assert.equal(result.cloudState.selectedCharacterId, 'char-04');
  assert.deepEqual(result.cloudState.settings, { graphicsQuality: 'high', sensitivity: 1.4 });
  assert.equal(writePrivateCalled, false, 'Must not overwrite existing Firestore private doc with defaults');
  assert.equal(writePublicCalled, false, 'Must not overwrite existing Firestore public doc with defaults');
  assert.equal(ensureIndexCalled, false);
});

test('Scenario 4: Missing or incomplete Firestore profile does NOT create duplicate profile or replacement ID when backend is unavailable', async () => {
  let writePrivateCalled = false;
  let writePublicCalled = false;
  let ensureIndexCalled = false;

  // Case A: Missing private doc
  const serviceMissingPrivate = new FirebasePlayerService({
    readPrivateDoc: async () => null,
    readPublicDoc: async () => makeExistingPublicDoc(),
    fetchSessionApi: async () => {
      throw new ApiRequestError('Unable to reach server', {
        status: 0,
        code: 'NETWORK_ERROR',
        isNetworkOrGatewayError: true,
      });
    },
    ensureIndexEntries: async () => {
      ensureIndexCalled = true;
    },
    writePrivateDoc: async () => {
      writePrivateCalled = true;
    },
    writePublicDoc: async () => {
      writePublicCalled = true;
    },
  });

  await assert.rejects(
    () =>
      serviceMissingPrivate.initializeAuthenticatedAccount({
        user: makeMockUser(),
        platform: 'pc',
        guestCredentials: null,
        fallbackVault: makeFallbackVault(),
        fallbackAccountSnapshot: makeFallbackSnapshot(),
      }),
    (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      assert.equal(err.code, 'FIRESTORE_PROFILE_MISSING');
      return true;
    },
  );
  assert.equal(writePrivateCalled, false);
  assert.equal(writePublicCalled, false);
  assert.equal(ensureIndexCalled, false);

  // Case B: Mismatched IDs between players/{uid} and publicProfiles/{uid}
  const mismatchedPrivate = makeExistingPrivateDoc();
  mismatchedPrivate.playerId = 'nx-000000001';
  const serviceMismatched = new FirebasePlayerService({
    readPrivateDoc: async () => mismatchedPrivate,
    readPublicDoc: async () => makeExistingPublicDoc(),
    fetchSessionApi: async () => {
      throw new ApiRequestError('Unable to reach server', {
        status: 0,
        code: 'NETWORK_ERROR',
        isNetworkOrGatewayError: true,
      });
    },
    writePrivateDoc: async () => {
      writePrivateCalled = true;
    },
    writePublicDoc: async () => {
      writePublicCalled = true;
    },
  });

  await assert.rejects(
    () =>
      serviceMismatched.initializeAuthenticatedAccount({
        user: makeMockUser(),
        platform: 'pc',
        guestCredentials: null,
        fallbackVault: makeFallbackVault(),
        fallbackAccountSnapshot: makeFallbackSnapshot(),
      }),
    (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      assert.equal(err.code, 'FIRESTORE_PROFILE_MISSING');
      return true;
    },
  );
  assert.equal(writePrivateCalled, false);
  assert.equal(writePublicCalled, false);
});

test('Scenario 5: Ranked WebSocket failure does not block entering the main menu and RankedApiClient never mints guest profiles while offline', async () => {
  let onConnectedCalled = false;
  let onDisconnectedCalled = false;
  let markLobbyReadyCalled = false;

  const connected = await connectRankedPresenceNonBlocking({
    ensureLobbyPresenceConnected: async () => {
      throw new Error('WebSocket connection failed');
    },
    onConnected: () => {
      onConnectedCalled = true;
    },
    onDisconnected: () => {
      onDisconnectedCalled = true;
    },
    markLobbyReady: () => {
      markLobbyReadyCalled = true;
    },
  });

  assert.equal(connected, false);
  assert.equal(onConnectedCalled, false, 'Must never falsely report online multiplayer connected');
  assert.equal(onDisconnectedCalled, true);
  assert.equal(markLobbyReadyCalled, true, 'Must allow entry into main menu despite WS failure');

  // Verify RankedApiClient preserves offline Firestore identity without hitting guest /api/ranked/profile
  const origStorage = (globalThis as { localStorage?: Storage }).localStorage;
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() {
      return mem.size;
    },
  };

  let fetchCalled = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('Should not fetch /api/ranked/profile when offline');
  }) as typeof fetch;

  try {
    const client = new RankedApiClient({
      isMobile: false,
      isTablet: false,
      isAndroid: false,
      isIOS: false,
      isTouch: false,
      tier: 'high',
      dpr: 1,
      screenWidth: 1920,
      screenHeight: 1080,
      isPortrait: false,
    });
    const offlineProfile = new FirebasePlayerService();
    void offlineProfile;
    const svc = new FirebasePlayerService({
      readPrivateDoc: async () => makeExistingPrivateDoc(),
      readPublicDoc: async () => makeExistingPublicDoc(),
      fetchSessionApi: async () => {
        throw new ApiRequestError('offline', {
          status: 0,
          code: 'NETWORK_ERROR',
          isNetworkOrGatewayError: true,
        });
      },
    });
    const hydrated = await svc.initializeAuthenticatedAccount({
      user: makeMockUser(),
      platform: 'pc',
      guestCredentials: null,
      fallbackVault: makeFallbackVault(),
      fallbackAccountSnapshot: makeFallbackSnapshot(),
    });

    client.setFirebaseIdToken('mock-token');
    client.setAuthenticatedSession(
      { playerId: hydrated.profile.playerId, secretToken: hydrated.secretToken },
      hydrated.profile,
    );

    assert.equal(client.hasBackendSessionToken(), false);
    await assert.rejects(() => client.ensureProfile(), /offline/i);
    assert.equal(await client.syncVaultState(hydrated.vault), null);
    assert.equal(await client.syncAccountProgression({ level: 27, xp: 640 }), null);
    assert.equal((await client.refreshProfile())?.playerId, 'nx-445566778');
    assert.equal(fetchCalled, false, 'Must never call guest /api/ranked/profile over offline Firebase identity');
  } finally {
    globalThis.fetch = origFetch;
    (globalThis as { localStorage?: Storage }).localStorage = origStorage;
  }
});

test('Scenario 6: Android APK, Windows Electron, Web platform detection and Firebase project/DB configuration remain intact', () => {
  assert.equal(firebaseClientConfig.projectId, 'gen-lang-client-0539248410');
  assert.equal(
    firebaseClientConfig.firestoreDatabaseId,
    'ai-studio-remixremixremixr-8acde1bb-0f68-49e5-8b92-365bf5c2e31f',
  );

  const g = globalThis as unknown as {
    window?: Record<string, unknown>;
    navigator?: { userAgent: string };
  };
  const prevWindow = g.window;

  try {
    // Web mode
    g.window = { location: { protocol: 'https:', host: 'nexusroyale.web.app' } };
    assert.equal(isCapacitorNative(), false);
    assert.equal(isElectronDesktop(), false);
    assert.equal(detectAuthPlatform(), 'web');
    assert.equal(getBackendHttpOrigin(), '');
    assert.equal(getApiUrl('/api/ranked/status'), '/api/ranked/status');
    assert.equal(getWebSocketUrl('/ws/ranked'), 'wss://nexusroyale.web.app/ws/ranked');

    // Android APK (Capacitor)
    g.window = {
      location: { protocol: 'capacitor:', host: 'localhost' },
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    };
    assert.equal(isCapacitorNative(), true);
    assert.equal(detectAuthPlatform(), 'android-capacitor');
    assert.ok(getBackendHttpOrigin().startsWith('https://'));

    // Windows Electron
    g.window = {
      location: { protocol: 'file:', host: '' },
      nexusDesktop: { isElectron: true, platform: 'win32' },
    };
    assert.equal(isElectronDesktop(), true);
    assert.equal(detectAuthPlatform(), 'windows-electron');
    assert.ok(getBackendHttpOrigin().startsWith('https://'));
  } finally {
    g.window = prevWindow;
  }
});
