import { AudioManager } from '../audio/AudioManager';
import { getGlooWallSkinById } from '../combat/GlooWallSkins';
import type { CharacterDefinition } from '../characters/CharacterData';
import { CharacterManager } from '../characters/CharacterManager';
import { CharacterPreviewRenderer } from '../characters/CharacterPreviewRenderer';
import { getR6CharacterPreset } from '../characters/R6CharacterCatalog';
import { getR6AnimationClips, getR6IdleClip } from '../characters/R6AnimationClips';
import { getEmoteById } from '../emotes/EmoteCatalog';
import { AssetManager } from '../core/AssetManager';
import { CameraManager } from '../core/CameraManager';
import { GameLoop } from '../core/GameLoop';
import { LoadingManager } from '../core/LoadingManager';
import { RendererManager } from '../core/RendererManager';
import { SceneManager } from '../core/SceneManager';
import { SettingsManager } from '../core/SettingsManager';
import { i18n } from '../i18n/I18nManager';
import type {
  DeviceProfile,
  GamePhaseState,
  GameSettings,
  LobbyGameMode,
  ScreenId,
  Subsystem,
} from '../core/Types';
import { ControlSettings } from '../input/ControlSettings';
import { InputManager, type InputLookDelta, type InputMoveVector } from '../input/InputManager';
import { InventoryManager, type ActionOutcome } from '../inventory/InventoryManager';
import { MilitaryBaseLobby } from '../lobby/MilitaryBaseLobby';
import { TacticalCompanion } from '../lobby/TacticalCompanion';
import { LootManager } from '../loot/LootManager';
import { AirplaneDropManager } from '../drop/AirplaneDropManager';
import type { MapId } from '../maps/IMapSystem';
import { MAP_CONFIGS, MAP_LIST } from '../maps/MapData';
import { MapManager, type FlightMinimapOverlay } from '../maps/MapManager';
import {
  applyAllCharOverrides,
  exportAllCharOverrides,
  loadR6Customization,
  normalizeR6Customization,
  resetR6CustomizationStorage,
  resolveCharacterCustomization,
  saveCharacterCustomizationOverride,
  saveR6Customization,
  type R6Customization,
} from '../player/R6CustomizationData';
import { Player } from '../player/Player';
import { PlayerCamera } from '../player/PlayerCamera';
import { PlayerController } from '../player/PlayerController';
import { PlayerProfileManager } from '../progression/PlayerProfileManager';
import type { ShopCatalogItem } from '../shop/IShopSystem';
import { ShopManager } from '../shop/ShopManager';
import type { ScopeOverlayState } from '../ui/ScopeOverlay';
import { UIManager } from '../ui/UIManager';
import { LoadingScreen } from '../ui/screens/LoadingScreen';
import { DeviceDetector } from '../utils/DeviceDetector';
import { ResponsiveManager, tryLockLandscapeFullscreen } from '../utils/ResponsiveManager';
import { AimAssistSystem } from '../weapons/AimAssistSystem';
import { getWeaponGlbUrl, hasWeaponGlbFile, WEAPON_LIST } from '../weapons/WeaponData';
import { WeaponManager } from '../weapons/WeaponManager';
import type { User as FirebaseUser } from 'firebase/auth';
import { getApiUrl } from '../config/RuntimeConfig';
import { verifyFirestoreConnection } from '../firebase/firebaseApp';
import {
  connectRankedPresenceNonBlocking,
  signInNexusAccount,
} from '../firebase/auth/NexusSignInFlow';
import { FirebaseAuthService } from '../firebase/FirebaseAuthService';
import { FirebaseFriendsService } from '../firebase/FirebaseFriendsService';
import { FirebasePartyService } from '../firebase/FirebasePartyService';
import { cloudPublicToRankedProfile, FirebasePlayerService } from '../firebase/FirebasePlayerService';
import { fetchApiJson, isBackendReachabilityError } from '../network/ApiResponse';
import { RankedApiClient } from '../ranked/RankedApiClient';
import { RankedNetworkClient } from '../ranked/RankedNetworkClient';
import { RemotePlayerManager } from '../ranked/RemotePlayerManager';
import type {
  CloudSyncStatePayload,
  DroppedLootSync,
  FriendRequestEntry,
  KillFeedEntry,
  LobbySnapshot,
  MailboxStateSnapshot,
  MatchDropPhase,
  MatchLifecyclePhase,
  OutgoingFriendRequestEntry,
  RankedAnimationState,
  RankedMapId,
  RankedMatchResultPayload,
  RankedProfile,
  RankedVaultState,
  RemotePlayerDeltaSnapshot,
  RemotePlayerSnapshot,
  ServerOnlineStatus,
  ServerZoneState,
  SquadFriendEntry,
  SquadInviteNotification,
  SquadMemberInfo,
  SquadSize,
  SquadStateSnapshot,
} from '../ranked/RankedTypes';
import { SafeZoneManager } from '../zone/SafeZoneManager';
import { BattleRoyaleManager } from '../battleroyale/BattleRoyaleManager';
import type {
  BattleRoyaleMatchConfig,
  SquadFillMemberPreset,
} from '../battleroyale/BattleRoyaleTypes';
import { DamageNumberSystem } from '../combat/DamageNumberSystem';
import { EliminationEffectSystem } from '../combat/EliminationEffectSystem';
import {
  GLOO_WALL_CONFIG,
  GlooWallManager,
  extractGlooWallIdFromTarget,
  type GlooWallPlacementValidation,
} from '../combat/GlooWallManager';
import type { LootItem } from '../loot/LootItem';
import { TRAINING_GROUND_WEAPON_RACKS } from '../maps/TrainingGroundData';
import type { ServerGlooWall } from '../ranked/RankedTypes';
import * as THREE from 'three';

export class Game implements Subsystem {
  readonly deviceProfile: DeviceProfile;
  readonly responsiveManager: ResponsiveManager;
  readonly settingsManager: SettingsManager;
  readonly controlSettings: ControlSettings;
  readonly characterManager: CharacterManager;
  readonly loadingManager: LoadingManager;
  readonly assetManager: AssetManager;
  readonly audioManager: AudioManager;
  readonly rendererManager: RendererManager;
  readonly sceneManager: SceneManager;
  readonly cameraManager: CameraManager;
  readonly inputManager: InputManager;
  readonly militaryLobby: MilitaryBaseLobby;
  readonly gameplayCompanion: TacticalCompanion;
  readonly mapManager: MapManager;
  readonly lootManager: LootManager;
  readonly inventoryManager: InventoryManager;
  readonly weaponManager: WeaponManager;
  readonly aimAssistSystem = new AimAssistSystem();
  readonly airplaneDropManager: AirplaneDropManager;
  readonly player: Player;
  readonly playerCamera: PlayerCamera;
  readonly playerController: PlayerController;
  readonly uiManager: UIManager;
  readonly gameLoop: GameLoop;
  readonly rankedApi: RankedApiClient;
  readonly playerProfileManager: PlayerProfileManager;
  readonly shopManager: ShopManager;
  readonly previewRenderer: CharacterPreviewRenderer;
  readonly rankedNetwork: RankedNetworkClient;
  readonly safeZoneManager: SafeZoneManager;
  readonly remotePlayerManager: RemotePlayerManager;
  readonly battleRoyaleManager: BattleRoyaleManager;
  readonly glooWallManager: GlooWallManager;
  readonly damageNumberSystem: DamageNumberSystem;
  readonly eliminationEffectSystem: EliminationEffectSystem;
  readonly firebaseAuthService: FirebaseAuthService;
  readonly firebasePlayerService: FirebasePlayerService;
  readonly firebaseFriendsService: FirebaseFriendsService;
  readonly firebasePartyService: FirebasePartyService;

  private phaseState: GamePhaseState = 'booting';
  private arenaCameraMode: 'PLAYER' | 'ORBIT' = 'PLAYER';
  private r6Customization: R6Customization = loadR6Customization();
  private autoSpinEnabled = false;
  private arenaPausedForOverlay = false;
  private wasPlayerEmoting = false;
  private readonly emoteMoveScratch = { x: 0, y: 0, sprint: false };
  private brMatchStatsRecorded = false;
  private gameplayCompanionSnapped = false;
  private readonly companionPosScratch = new THREE.Vector3();
  private backgroundWarmupPromise: Promise<void> | null = null;
  private remainingWeaponsPromise: Promise<void> | null = null;
  private remainingWeaponsTimer = 0;
  private vaultSyncTimer = 0;
  private cloudStateSyncTimer = 0;
  private isHydratingCloudState = false;
  private cloudStateHydratedUid: string | null = null;
  private firebaseActiveUid: string | null = null;
  private latestFirebaseIdToken: string | null = null;
  private hasCompletedPreLobbyLogin = false;
  private loginLoadingActive = false;
  private loginAttemptNonce = 0;
  private preparedAuthSession: {
    uid: string;
    profile: RankedProfile;
    secretToken: string;
    vault: RankedVaultState;
    isDeveloper: boolean;
  } | null = null;
  private preparingAuthPromise: Promise<void> | null = null;
  private preparingAuthUid: string | null = null;
  private authScreenEnteringLobby = false;
  private firebasePublicSyncTimer = 0;
  private readonly handleWindowBeforeUnload = (): void => {
    if (this.firebaseActiveUid) {
      void this.firebaseFriendsService.setPresenceStatus('offline').catch(() => {});
    }
  };

  private matchMode: 'practice' | 'ranked' | 'battle-royale' = 'practice';
  private selectedLobbyMode: LobbyGameMode = 'battle-royale';
  private isRankedQueuingFromLobby = false;
  private rankedWaitingParticipantCount = 0;
  private activeBattleRoyaleConfig: BattleRoyaleMatchConfig = {
    mapId: 'desert',
    botCount: 50,
    difficulty: 'mixed',
  };
  private activeRankedMatchId: string | null = null;
  private localRankedPlayerId: string | null = null;
  private rankedAliveCount = 0;
  private rankedLocalKills = 0;
  private rankedEliminated = false;
  private spectateTargetName: string | null = null;
  private readonly spectatePos = new THREE.Vector3();
  private stateSendAccum = 0;
  private rankedStatusTimer = 0;
  private rankedAuthReady = false;
  private lobbySquadSize: SquadSize = 1;
  private lobbySquadState: SquadStateSnapshot | null = null;
  private lobbyFriendsList: SquadFriendEntry[] = [];
  private lobbyFriendRequests: FriendRequestEntry[] = [];
  private lobbyOutgoingFriendTargetIds: string[] = [];
  private lobbyOutgoingFriendRequests: OutgoingFriendRequestEntry[] = [];
  private lobbyMailboxState: MailboxStateSnapshot = {
    messages: [],
    unreadCount: 0,
    unclaimedRewardCount: 0,
  };
  private lobbyReconnectTimer = 0;
  private lobbyPresencePromise: Promise<void> | null = null;
  private wasZipliningPrev = false;
  private waitingLobbyTransitionActive = false;
  private isDisposed = false;
  private practiceKills = 0;
  private practiceGlooRespawnAccum = 0;
  private readonly glooActorOverlapScratch: Array<{ x: number; y: number; z: number }> = [];
  private readonly practiceGlooCheckScratch: LootItem[] = [];
  private readonly elimBurstPosScratch = new THREE.Vector3();
  private glooManualPreviewActive = false;
  private glooManualYawOffset = 0;
  private glooManualRotateHoldDir: -1 | 0 | 1 = 0;
  private glooConfirmFireSuppress = false;
  private readonly glooPreviewPlacement: GlooWallPlacementValidation = {
    valid: false,
    reason: 'blocked',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    heightScale: 1,
  };

  private activeScopeZoom = 1.0;
  private lastScopeConfigKey = '';
  private lastScopeProfileCacheKey = '';
  private cachedScopeProfile: {
    canScope: boolean;
    zoomLevels: number[];
    reticleStyle: 'reflex' | 'tactical' | 'marksman' | 'sniper';
    equippedOpticLabel: string | null;
  } = {
    canScope: false,
    zoomLevels: [1],
    reticleStyle: 'reflex',
    equippedOpticLabel: null,
  };
  private lastAirplaneStateSentAt = 0;

  private readonly menuLookDelta: InputLookDelta = { yaw: 0, pitch: 0, zoom: 0 };
  private readonly airborneMoveVec: InputMoveVector = { x: 0, y: 0, sprint: false };
  private readonly airborneCamTarget = new THREE.Vector3();
  private readonly aimRayOrigin = new THREE.Vector3();
  private readonly aimRayDir = new THREE.Vector3(0, 0, -1);
  private readonly isCompactDevice: boolean;
  private minimapAccum = 1;
  private rangefinderAccum = 0.2;
  private lastRangeMeters: number | null = null;
  private lastAirbornePhase = '';
  private readonly flightOverlayScratch: FlightMinimapOverlay = {
    startX: 0,
    startZ: 0,
    endX: 0,
    endZ: 0,
    planeX: 0,
    planeZ: 0,
    planeHeadingRad: 0,
    showPlane: true,
  };
  private readonly scopeOverlayScratch: ScopeOverlayState = {
    scopeBlend: 0,
    weaponName: '',
    reticleStyle: 'reflex',
    currentZoom: 1,
    zoomLevels: [1],
    rangeMeters: null,
    ammoInMagazine: 0,
    magazineSize: 0,
    equippedOpticLabel: null,
    isBoltCycling: false,
    boltCycleProgress: 0,
    unlimitedAmmo: false,
  };
  private readonly safeZoneCenterScratch = { x: 0, z: 0 };
  private readonly isSphereInFrustumBound = (x: number, y: number, z: number, r: number): boolean =>
    this.mapManager.isSphereInFrustum(x, y, z, r);
  private readonly onRecoilKickBound = (yawRad: number, pitchRad: number): void => {
    this.playerCamera.addRecoilKick(yawRad, pitchRad);
  };
  private readonly combatInputScratch: {
    aimOrigin: THREE.Vector3;
    aimDir: THREE.Vector3;
    isAiming: boolean;
    isFirstPersonScoped: boolean;
    triggerHeld: boolean;
    triggerJustPressed: boolean;
    modifiers: Record<string, number>;
    onRecoilKick: (yawRad: number, pitchRad: number) => void;
  };
  private readonly unsubscribes: Array<() => void> = [];
  private readonly lobbyRaycaster = new THREE.Raycaster();
  private readonly lobbyPointerNdc = new THREE.Vector2();
  private readonly lobbyProjVec = new THREE.Vector3();
  private lobbyTapDown: { id: number; x: number; y: number; time: number } | null = null;

  constructor(webglMount: HTMLElement, uiRoot: HTMLElement) {
    this.deviceProfile = DeviceDetector.detect();
    this.responsiveManager = new ResponsiveManager();
    this.settingsManager = new SettingsManager(this.deviceProfile);
    this.controlSettings = new ControlSettings();
    this.characterManager = new CharacterManager();
    this.loadingManager = new LoadingManager();
    this.assetManager = new AssetManager(this.loadingManager);

    const initialSettings = this.settingsManager.getSettings();
    i18n.setLanguage(initialSettings.language);
    const initialMetrics = this.responsiveManager.getMetrics();
    const earlyLoadingScreen = new LoadingScreen(this.deviceProfile);
    uiRoot.innerHTML = '';
    uiRoot.appendChild(earlyLoadingScreen.element);

    this.isCompactDevice =
      this.deviceProfile.isMobile ||
      this.deviceProfile.isAndroid ||
      this.deviceProfile.isTablet ||
      this.deviceProfile.performanceTier === 'low-end-pc';

    this.audioManager = new AudioManager(initialSettings.audio);
    this.rendererManager = new RendererManager(
      webglMount,
      this.deviceProfile,
      initialSettings.graphics,
    );
    this.assetManager.setMaxAnisotropy(this.rendererManager.getMaxAnisotropy());

    this.sceneManager = new SceneManager(this.rendererManager.environmentMap);

    this.cameraManager = new CameraManager(initialMetrics);
    this.inputManager = new InputManager(
      this.rendererManager.renderer.domElement,
      this.controlSettings,
    );
    this.inputManager.setOptions(
      initialSettings.controls.lookSensitivity,
      initialSettings.controls.invertY,
    );

    this.militaryLobby = new MilitaryBaseLobby(this.deviceProfile, this.assetManager);
    this.gameplayCompanion = new TacticalCompanion(this.r6Customization.petId);
    this.gameplayCompanion.root.visible = false;
    this.mapManager = new MapManager(
      this.assetManager,
      this.sceneManager,
      this.deviceProfile,
      null,
    );
    this.lootManager = new LootManager(this.mapManager, this.isCompactDevice);
    this.weaponManager = new WeaponManager(this.mapManager, this.audioManager);
    this.inventoryManager = new InventoryManager(this.audioManager);
    this.rankedApi = new RankedApiClient(this.deviceProfile);
    this.playerProfileManager = new PlayerProfileManager(this.characterManager, this.rankedApi);
    this.shopManager = new ShopManager();
    this.firebaseAuthService = new FirebaseAuthService();
    this.firebasePlayerService = new FirebasePlayerService();
    this.firebaseFriendsService = new FirebaseFriendsService(this.firebasePlayerService);
    this.firebasePartyService = new FirebasePartyService();
    window.addEventListener('beforeunload', this.handleWindowBeforeUnload);
    this.militaryLobby.setShopAccent(this.shopManager.getActiveBeaconHex());
    this.previewRenderer = new CharacterPreviewRenderer(
      this.assetManager,
      this.rendererManager.isSoftwareGl,
    );
    this.previewRenderer.setPaused(true);
    this.rankedNetwork = new RankedNetworkClient();
    this.safeZoneManager = new SafeZoneManager();
    this.remotePlayerManager = new RemotePlayerManager(
      this.assetManager,
      this.weaponManager.hitDetection,
      this.audioManager,
    );
    this.remotePlayerManager.setGroundHeightSampler((x, z, refY) =>
      this.mapManager.getGroundHeightAt(x, z, refY),
    );
    this.remotePlayerManager.root.visible = false;

    this.battleRoyaleManager = new BattleRoyaleManager(
      this.assetManager,
      this.mapManager,
      this.audioManager,
      this.weaponManager.hitDetection,
      this.isCompactDevice,
      {
        onKillFeed: (entry) => this.uiManager.pushRankedKillFeed(entry),
        onPlayerDamaged: (dmg, attackerName, weaponName, isHeadshot) => {
          this.inventoryManager.interruptHealing(i18n.t('inv.msg.healingInterruptedDmg'));
          this.inventoryManager.applyCombatGearWear(dmg, isHeadshot);
          this.audioManager.playHitmarker(isHeadshot);
          const localizedWeapon = i18n.translateWeaponName(weaponName);
          this.uiManager.showArenaToast(
            i18n.t(isHeadshot ? 'toast.critDamage' : 'toast.hitDamage', {
              dmg,
              attacker: attackerName,
              weapon: localizedWeapon,
            }),
          );
        },
        onZoneDamagePlayer: (dmg) => {
          this.uiManager.showArenaToast(i18n.t('toast.outsideZoneDmg', { dmg }));
        },
        onPlayerKillConfirmed: (victimName) => {
          this.gameplayCompanion.triggerReaction();
          this.uiManager.showArenaToast(i18n.t('toast.eliminatedVictim', { victim: victimName }));
        },
        onCombatElimination: (info) => {
          this.eliminationEffectSystem.spawnBurst(
            info.victimX,
            info.victimY,
            info.victimZ,
            info.isHeadshot,
          );
          const isSelfKiller = info.killerId === 'local-player';
          const isSelfVictim = info.victimId === 'local-player';
          if (isSelfKiller) {
            this.audioManager.playKillConfirmed(info.isHeadshot);
          }
          this.uiManager.showArenaKillNotification(
            info.killerName,
            info.victimName,
            info.weaponName,
            info.isHeadshot,
            isSelfKiller,
            isSelfVictim,
          );
        },
        onPlayerEliminated: (payload) => {
          this.player.stats.isAlive = false;
          this.player.stats.health = 0;
          this.player.stats.shield = 0;
          this.playerController.forceExitScope();
          this.uiManager.setArenaInventoryOpen(false);
          this.uiManager.setArenaFullMapOpen(false);
          this.inputManager.setPointerLockAllowed(false);
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          this.audioManager.playEliminated();
          const spectateName = this.battleRoyaleManager.getFirstAliveBotPosition(this.spectatePos);
          this.spectateTargetName = spectateName;
          const spectatingSquadmate = Boolean(
            payload.squadStillAlive && this.battleRoyaleManager.hasAliveAlly(),
          );
          this.uiManager.showRankedSpectatorBanner(spectateName, spectatingSquadmate);
          if (spectatingSquadmate) {
            if (spectateName) {
              this.uiManager.showArenaToast(
                i18n.t('toast.spectatingSquadmate', { name: spectateName }),
              );
            }
          } else if (payload.aliveRemaining > 1) {
            if (!this.brMatchStatsRecorded) {
              this.brMatchStatsRecorded = true;
              const xpRes = this.playerProfileManager.recordBattleRoyaleMatch({
                placement: payload.placement,
                totalPlayers: payload.totalFighters,
                kills: payload.kills,
                damage: payload.damage,
                survivedSec: payload.survivedSec,
                isWinner: false,
              });
              const nxRes = this.shopManager.grantMatchCredits({
                placement: payload.placement,
                kills: payload.kills,
                damage: payload.damage,
                isWinner: false,
                isRanked: false,
              });
              this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
              const xpLine = i18n.t('toast.xpEarnedMatch', {
                xp: xpRes.xpEarned,
                nx: nxRes.creditsEarned,
              });
              const lvlSuffix = xpRes.leveledUp
                ? i18n.t('toast.xpLevelUpSuffix', { level: xpRes.newLevel })
                : '';
              this.uiManager.showArenaToast(`${xpLine}${lvlSuffix}`);
            }
            this.uiManager.showBattleRoyaleEliminationModal(payload);
          }
        },
        onAliveCountChanged: (aliveCount) => {
          this.uiManager.updateBattleRoyaleAliveCount(aliveCount);
        },
        onMatchResult: (res) => {
          this.playerController.forceExitScope();
          this.uiManager.setArenaInventoryOpen(false);
          this.uiManager.setArenaFullMapOpen(false);
          this.inputManager.setPointerLockAllowed(false);
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          if (!this.brMatchStatsRecorded) {
            this.brMatchStatsRecorded = true;
            const xpRes = this.playerProfileManager.recordBattleRoyaleMatch({
              placement: res.placement,
              totalPlayers: res.totalFighters,
              kills: res.kills,
              damage: res.damage,
              survivedSec: res.survivedSec,
              isWinner: res.isWinner,
            });
            const nxRes = this.shopManager.grantMatchCredits({
              placement: res.placement,
              kills: res.kills,
              damage: res.damage,
              isWinner: res.isWinner,
              isRanked: false,
            });
            this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
            const xpLine = i18n.t('toast.xpEarnedMatch', {
              xp: xpRes.xpEarned,
              nx: nxRes.creditsEarned,
            });
            const lvlSuffix = xpRes.leveledUp
              ? i18n.t('toast.xpLevelUpSuffix', { level: xpRes.newLevel })
              : '';
            this.uiManager.showArenaToast(`${xpLine}${lvlSuffix}`);
          }
          if (res.isWinner) {
            this.audioManager.playVictory();
          }
          this.uiManager.showBattleRoyaleResultModal(res);
        },
      },
    );
    this.battleRoyaleManager.root.visible = false;

    this.player = new Player(this.assetManager, this.mapManager);
    const initialGlider = this.shopManager.getActiveGliderColors();
    this.airplaneDropManager = new AirplaneDropManager(
      this.mapManager,
      this.player,
      this.audioManager,
      this.isCompactDevice,
    );
    this.airplaneDropManager.setParachuteColors(initialGlider.primaryHex, initialGlider.accentHex);
    this.airplaneDropManager.setOnLandedCallback(() => {
      this.mapManager.setAirborneFogScale(1.0);
      this.gameplayCompanionSnapped = false;
      this.gameplayCompanion.triggerReaction();
      if (
        this.uiManager.getCurrentScreen() === 'test-arena' &&
        this.arenaCameraMode === 'PLAYER' &&
        !this.uiManager.isArenaInventoryOpen() &&
        !this.uiManager.isArenaFullMapOpen() &&
        !this.uiManager.isArenaSettingsOpen() &&
        !this.uiManager.isWeaponReplacePromptOpen()
      ) {
        this.inputManager.setPointerLockAllowed(!this.isTouchGameplayActive());
      }
      this.uiManager.showArenaToast(i18n.t('toast.touchdown'));
    });
    this.characterManager.bindPlayer(this.player);
    this.weaponManager.bindPlayer(this.player);
    this.player.movement.setActionCallbacks(
      (wasBroken) => {
        this.playerController.forceExitScope();
        this.audioManager.playVault();
        if (!wasBroken) {
          this.audioManager.playGlassBreak();
          const sill = this.player.movement.vaultSillHands;
          if (sill) {
            this.weaponManager.bulletSystem.spawnShatterBurst(
              (sill.leftX + sill.rightX) * 0.5,
              sill.sillY + 0.55,
              (sill.leftZ + sill.rightZ) * 0.5,
            );
          }
        }
      },
      () => {
        this.audioManager.playStand();
      },
      (active, ziplineId, progress, reverse, speedMps) => {
        if (!this.wasZipliningPrev && active) {
          this.playerController.forceExitScope();
          this.audioManager.playZiplineAttach();
        } else if (this.wasZipliningPrev && !active) {
          this.audioManager.playZiplineDetach();
        }
        this.wasZipliningPrev = active;
        this.audioManager.setZiplineSliding(active, speedMps ?? 16.5);
        if (active && ziplineId && progress !== undefined) {
          this.mapManager.notifyZiplineProgress(ziplineId, progress, Boolean(reverse));
        }
      },
    );
    this.weaponManager.setOnMeleeTargetHitCallback((targetId, dirX, dirZ) => {
      if (this.matchMode === 'battle-royale') {
        this.battleRoyaleManager.applyMeleeKnockback(targetId, dirX, dirZ);
      }
    });
    this.inventoryManager.bindSubsystems(this.player, this.weaponManager, this.lootManager);
    this.inventoryManager.setHealingCallbacks(
      (reason) => {
        this.uiManager.showArenaToast(reason);
      },
      (def) => {
        const parts: string[] = [];
        if (def.healAmount) parts.push(`+${def.healAmount} ${i18n.t('common.hp')}`);
        if (def.shieldAmount) parts.push(`+${def.shieldAmount} ${i18n.t('common.shield')}`);
        const localizedName = i18n.translateLootName(def.id, def.name);
        this.uiManager.showArenaToast(
          parts.length > 0
            ? `${localizedName} · ${parts.join(' / ')}`
            : i18n.t('inv.msg.usedConsumable', { name: localizedName }),
        );
      },
    );
    this.inventoryManager.setOnGearChangedCallback(() => {
      this.characterManager.abilityManager.setExternalModifiers(
        this.inventoryManager.getActiveItemModifiers(),
        this.player.stats,
      );
    });

    this.playerCamera = new PlayerCamera(initialMetrics);
    this.playerCamera.setOptions(
      initialSettings.controls.lookSensitivity,
      initialSettings.controls.invertY,
      initialSettings.controls.adsSensitivity,
      initialSettings.controls.aimStability,
    );
    this.playerController = new PlayerController(
      this.player,
      this.playerCamera,
      this.inputManager,
    );
    this.combatInputScratch = {
      aimOrigin: this.aimRayOrigin,
      aimDir: this.aimRayDir,
      isAiming: false,
      isFirstPersonScoped: false,
      triggerHeld: false,
      triggerJustPressed: false,
      modifiers: this.characterManager.abilityManager.getComputedModifiers(),
      onRecoilKick: this.onRecoilKickBound,
    };
    this.applyGraphicsQuality(initialSettings);

    const savedMapId = initialSettings.selectedMapId;
    this.activeBattleRoyaleConfig.mapId = savedMapId;
    const notifyOutcome = (outcome: ActionOutcome): void => {
      if (outcome.weaponReplacePrompt) {
        this.playerController.forceExitScope();
        this.uiManager.showWeaponReplacePrompt(outcome.weaponReplacePrompt);
        this.syncArenaPointerLock(false);
        return;
      }
      if (outcome.message) {
        this.uiManager.showArenaToast(outcome.message);
      }
    };

    this.r6Customization = this.getResolvedCustomizationForCharacter();
    saveR6Customization(this.r6Customization);
    this.shopManager.setCurrentCustomization(this.r6Customization);
    this.weaponManager.setEquippedWeaponSkins(this.shopManager.getEquippedWeaponSkins());

    this.uiManager = new UIManager(
      uiRoot,
      this.deviceProfile,
      initialMetrics,
      this.settingsManager,
      this.controlSettings,
      this.characterManager,
      this.audioManager,
      this.previewRenderer,
      savedMapId,
      this.r6Customization,
      this.playerProfileManager.getSnapshot(),
      this.shopManager.getSnapshot(),
      {
        onScreenChange: (screen) => this.handleScreenChange(screen),
        onSelectGameMode: (mode) => {
          this.selectedLobbyMode = mode;
          if (this.isRankedQueuingFromLobby) {
            this.cancelMainMenuRankedQueue();
          }
          this.uiManager.setMainMenuLobbyMode(mode);
          this.scheduleCloudStateSync();
        },
        onSelectSquadSize: (size) => {
          void this.handleSelectSquadSize(size);
        },
        onCreateParty: () => {
          void this.handleCreateParty();
        },
        onToggleSquadReady: (ready) => {
          void this.handleToggleSquadReady(ready);
        },
        onTransferSquadLeader: (playerId) => {
          void this.handleTransferSquadLeader(playerId);
        },
        onInviteFriend: (friendId) => {
          void this.handleInviteFriend(friendId);
        },
        onRespondSquadInvite: (inviteId, accept) => {
          void this.handleRespondSquadInvite(inviteId, accept);
        },
        onLeaveSquad: () => {
          void this.handleLeaveSquad();
        },
        onKickSquadMember: (playerId) => {
          void this.handleKickSquadMember(playerId);
        },
        onLookupFriendById: async (queryId) => {
          if (this.firebaseActiveUid) {
            return this.firebaseFriendsService.lookupFriendById(queryId);
          }
          await this.rankedApi.ensureProfile();
          return this.rankedApi.lookupPlayerForFriend(queryId);
        },
        onSendFriendRequest: async (targetPlayerId) => {
          if (this.firebaseActiveUid) {
            await this.firebaseFriendsService.sendFriendRequest(targetPlayerId);
            return;
          }
          const state = await this.rankedApi.sendFriendRequest(targetPlayerId);
          this.applyFriendsSnapshotState(state);
        },
        onRespondFriendRequest: async (requestId, accept) => {
          if (this.firebaseActiveUid) {
            await this.firebaseFriendsService.respondToFriendRequest(requestId, accept);
            if (accept) {
              this.audioManager.playDeploy();
            } else {
              this.audioManager.playBack();
            }
            return;
          }
          const state = await this.rankedApi.respondFriendRequest(requestId, accept);
          this.applyFriendsSnapshotState(state);
          if (accept) {
            this.audioManager.playDeploy();
          } else {
            this.audioManager.playBack();
          }
        },
        onCancelFriendRequest: async (requestId) => {
          if (this.firebaseActiveUid) {
            await this.firebaseFriendsService.cancelFriendRequest(requestId);
            this.audioManager.playBack();
            return;
          }
          const state = await this.rankedApi.cancelFriendRequest(requestId);
          this.applyFriendsSnapshotState(state);
          this.audioManager.playBack();
        },
        onRemoveFriend: async (friendPlayerId) => {
          if (this.firebaseActiveUid) {
            await this.firebaseFriendsService.removeFriend(friendPlayerId);
            this.audioManager.playBack();
            return;
          }
          const state = await this.rankedApi.removeFriend(friendPlayerId);
          this.applyFriendsSnapshotState(state);
          this.audioManager.playBack();
        },
        onOpenMailbox: async () => {
          await this.refreshMailboxState();
        },
        onReadMail: async (mailId) => {
          let changed = false;
          const nextMsgs = this.lobbyMailboxState.messages.map((m) => {
            if (m.mailId === mailId && !m.isRead) {
              changed = true;
              return { ...m, isRead: true };
            }
            return m;
          });
          if (changed) {
            this.applyMailboxState({
              ...this.lobbyMailboxState,
              messages: nextMsgs,
              unreadCount: nextMsgs.filter((m) => !m.isRead && !m.isArchived).length,
            });
          }
          const nextState = await this.rankedApi.markMailRead(mailId);
          this.applyMailboxState(nextState);
        },
        onClaimMailReward: async (mailId) => {
          const res = await this.rankedApi.claimMailReward(mailId);
          this.shopManager.applyAuthoritativeCredits(res.newBalance);
          this.applyMailboxState(res.mailbox);
          this.audioManager.playDeploy();
          this.uiManager.showLobbyToast(
            i18n.t('mail.toast.claimed', { amount: res.creditsAwarded.toLocaleString() }),
            'success',
          );
          if (this.firebaseActiveUid) {
            await this.firebasePlayerService
              .syncPrivateVault(this.firebaseActiveUid, this.shopManager.exportVaultState())
              .catch(() => {});
          }
        },
        onArchiveMail: async (mailId, archived) => {
          const nextState = await this.rankedApi.archiveMail(mailId, archived);
          this.applyMailboxState(nextState);
          this.audioManager.playClick();
        },
        onDeleteMail: async (mailId) => {
          const nextState = await this.rankedApi.deleteMail(mailId);
          this.applyMailboxState(nextState);
          this.audioManager.playBack();
        },
        onMainMenuStartPressed: () => this.handleMainMenuStartPressed(),
        onCancelMainMenuQueue: () => this.cancelMainMenuRankedQueue(),
        onConfirmMapSelection: (mapId) => this.confirmMapSelection(mapId),
        onSelectMap: (mapId) => {
          this.activeBattleRoyaleConfig.mapId = mapId;
          this.settingsManager.update({ selectedMapId: mapId });
          this.switchMap(mapId);
          this.scheduleCloudStateSync();
        },
        onCycleArenaMap: () => this.cycleNextMap(),
        onNewArenaMatch: () => this.restartArenaMatch(),
        onPreviewCharacter: (character) => {
          this.player.setModelSpec(character.model);
          this.player.setCustomization(this.getResolvedCustomizationForCharacter(character));
        },
        onSelectCharacter: (character) => {
          this.characterManager.selectCharacter(character.id);
          this.syncSelectedCharacterAppearance();
          this.uiManager.updatePlayerProfile(
            this.playerProfileManager.getSnapshot(),
            this.r6Customization,
          );
          if (this.rankedNetwork.state === 'connected' && this.rankedAuthReady) {
            this.rankedNetwork.updateSquadCharacter(
              character.id,
              { ...this.r6Customization },
              {
                avatarId: this.shopManager.getEquippedAvatarId(),
                bannerId: this.shopManager.getEquippedBannerId(),
                weaponSkins: this.shopManager.getEquippedWeaponSkins(),
              },
            );
          }
          this.syncLobbySquadVisuals(false);
          this.scheduleFirebasePublicProfileSync();
          this.scheduleCloudStateSync();
        },
        onPreviewCustomization: (custom) => {
          this.player.setCustomization(custom);
          this.militaryLobby.setPetKind(custom.petId);
        },
        onUpdateCustomization: (custom, targetCharacterId) => {
          const selectedChar = this.characterManager.getSelectedCharacter();
          const targetChar =
            (targetCharacterId
              ? this.characterManager.getCharacterById(targetCharacterId)
              : undefined) ?? selectedChar;
          const targetPreset = getR6CharacterPreset(targetChar.model.humanModelId).appearance;
          saveCharacterCustomizationOverride(targetChar.id, custom, targetPreset);

          if (targetChar.id === selectedChar.id) {
            this.r6Customization = { ...custom };
            saveR6Customization(this.r6Customization);
            this.shopManager.setCurrentCustomization(this.r6Customization);
            this.player.setCustomization(this.r6Customization);
            this.militaryLobby.setPetKind(this.r6Customization.petId);
            this.gameplayCompanion.setKind(this.r6Customization.petId);
            this.uiManager.updatePlayerProfile(
              this.playerProfileManager.getSnapshot(),
              this.r6Customization,
            );
            if (this.rankedNetwork.state === 'connected' && this.rankedAuthReady) {
              this.rankedNetwork.updateSquadCharacter(
                selectedChar.id,
                { ...this.r6Customization },
                {
                  avatarId: this.shopManager.getEquippedAvatarId(),
                  bannerId: this.shopManager.getEquippedBannerId(),
                  weaponSkins: this.shopManager.getEquippedWeaponSkins(),
                },
              );
            }
            this.syncLobbySquadVisuals(false);
          } else {
            this.r6Customization = {
              ...this.r6Customization,
              armorId: custom.armorId,
              accessoryId: custom.accessoryId,
              petId: custom.petId,
              petEnabled: custom.petEnabled,
            };
            saveR6Customization(this.r6Customization);
            this.shopManager.setCurrentCustomization(this.r6Customization);
            this.player.setCustomization(custom);
            this.militaryLobby.setPetKind(custom.petId);
            this.gameplayCompanion.setKind(custom.petId);
            this.uiManager.updatePlayerProfile(
              this.playerProfileManager.getSnapshot(),
              this.r6Customization,
            );
          }
          this.scheduleCloudStateSync();
        },
        onTriggerPetReaction: () => {
          this.militaryLobby.triggerCompanionReaction();
        },
        onRotateCharacterPreview: (deltaYaw) => {
          this.player.addPreviewYawDelta(deltaYaw);
        },
        onSetCharacterPreviewYaw: (yaw) => {
          this.player.setPreviewYaw(yaw);
        },
        onResetCharacterPreview: () => {
          this.autoSpinEnabled = false;
          this.player.resetPreviewYaw();
        },
        onToggleAutoSpin: () => {
          this.autoSpinEnabled = !this.autoSpinEnabled;
          this.player.setAutoSpin(this.autoSpinEnabled);
          return this.autoSpinEnabled;
        },
        onRenameUsernameOnce: async (newName) => {
          await this.handleUsernameChange(newName);
        },
        onUpdateGender: async (gender) => {
          await this.playerProfileManager.setPlayerGender(gender);
          const cached = this.rankedApi.getCachedProfile();
          if (cached) {
            this.uiManager.rankedScreen.setProfile(cached);
          }
          this.scheduleFirebasePublicProfileSync();
          if (this.rankedNetwork.state === 'connected') {
            this.sendRankedAuthHello();
          }
        },
        onInspectPlayer: async (idOrNumericId) => {
          if (this.firebaseActiveUid) {
            const cloudRes = await this.firebasePlayerService
              .lookupPublicProfileById(idOrNumericId)
              .catch(() => null);
            if (cloudRes) {
              return cloudRes.rankedProfile;
            }
          }
          return this.rankedApi.fetchPublicProfile(idOrNumericId);
        },
        onSignInNexusId: async (identifier, password) => {
          this.uiManager.setAuthScreenState({ errorMessage: null });
          await signInNexusAccount(identifier, password, {
            loginWithIdentifier: (id, pwd) => this.rankedApi.loginWithIdentifier(id, pwd),
            signInWithEmail: (email, pwd) => this.firebaseAuthService.signInWithEmail(email, pwd),
            onVerifiedUser: (user) => this.prepareAuthenticatedCloudAccount(user),
          });
        },
        onRegisterNexusId: async (username, email, password) => {
          this.uiManager.setAuthScreenState({ errorMessage: null });
          const check = await this.rankedApi.checkUsername(username);
          if (!check.valid || !check.available) {
            const msg = check.error
              ? i18n.translateServerMessage(check.error, check.code)
              : i18n.t('auth.usernameCheck.taken');
            throw new Error(msg);
          }
          const cleanUsername = (check.cleaned || username).trim();
          const user = await this.firebaseAuthService.registerWithNexusId(
            cleanUsername,
            email,
            password,
          );
          const idToken = await this.firebaseAuthService.getIdToken(true);
          if (!idToken) {
            await user.delete().catch(() => {});
            await this.firebaseAuthService.signOutUser().catch(() => {});
            throw new Error(i18n.t('auth.errSessionExpired'));
          }
          try {
            await this.rankedApi.registerInitialProfile(idToken, cleanUsername);
          } catch (err) {
            await user.delete().catch(() => {});
            await this.firebaseAuthService.signOutUser().catch(() => {});
            throw err;
          }
          if (user.emailVerified) {
            await this.prepareAuthenticatedCloudAccount(user);
          }
        },
        onRecoverNexusId: async (identifier) => {
          this.uiManager.setAuthScreenState({ errorMessage: null });
          const cleanIdentifier = identifier.trim();
          try {
            return await this.rankedApi.recoverPassword(cleanIdentifier);
          } catch (err) {
            if (isBackendReachabilityError(err) && cleanIdentifier.includes('@')) {
              await this.firebaseAuthService.sendResetPasswordEmail(cleanIdentifier);
              return i18n.t('auth.recoverSentInfo');
            }
            if (isBackendReachabilityError(err) && !cleanIdentifier.includes('@')) {
              throw new Error(
                'Unable to reach the authentication server for username lookup. Enter your registered email address to reset your password.',
              );
            }
            throw err;
          }
        },
        onCheckNexusUsername: async (username) => {
          return this.rankedApi.checkUsername(username);
        },
        onResendNexusVerification: async () => {
          this.uiManager.setAuthScreenState({ errorMessage: null });
          await this.firebaseAuthService.resendVerificationEmail();
        },
        onCheckNexusVerification: async () => {
          this.uiManager.setAuthScreenState({ errorMessage: null });
          const reloadedUser = await this.firebaseAuthService.reloadVerificationStatus();
          const verified = Boolean(reloadedUser && reloadedUser.emailVerified);
          if (verified && reloadedUser) {
            await this.prepareAuthenticatedCloudAccount(reloadedUser);
          }
          return verified;
        },
        onSignOutNexusId: async () => {
          await this.firebaseAuthService.signOutUser(() =>
            this.firebaseFriendsService.setPresenceStatus('offline').catch(() => {}),
          );
        },
        onLoginEnterGame: async () => {
          await this.enterLobbyFromAuthScreen();
        },
        onRetryLoginLoad: async () => {
          await this.enterLobbyFromAuthScreen();
        },
        onCancelLoginLoad: () => {
          this.cancelLoginLoadingToAuth();
        },
        canAccessGameScreens: () => this.canAccessGameScreens(),
        canAccessLoginLoadingScreen: () => this.canAccessLoginLoadingScreen(),
        onSelectShopPreview: (item) => {
          this.militaryLobby.setShopAccent(item.accentHex);
          this.mapManager.setShopAccent(item.accentHex);
          if (item.customizationPatch) {
            this.player.setCustomization({
              ...this.r6Customization,
              ...item.customizationPatch,
            });
          } else {
            this.player.setCustomization(this.r6Customization);
          }
        },
        onPurchaseShopItem: (item) => {
          const result = this.shopManager.purchase(item.id);
          if (result.ok) {
            this.audioManager.playDeploy();
            this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
            this.syncVaultStateToServer();
          } else {
            this.audioManager.playClick();
          }
          return result;
        },
        onEquipShopItem: (item) => {
          this.shopManager.setCurrentCustomization(this.r6Customization);
          const result = this.shopManager.equip(item.id);
          if (result.ok) {
            this.audioManager.playDeploy();
            this.applyShopEquipmentSideEffects(item);
            this.syncVaultStateToServer();
          } else {
            this.audioManager.playClick();
          }
          return result;
        },
        onUnequipShopItem: (item) => {
          this.shopManager.setCurrentCustomization(this.r6Customization);
          const result = this.shopManager.unequip(item.id);
          if (result.ok) {
            this.audioManager.playClick();
            this.applyShopEquipmentSideEffects(item);
            this.syncVaultStateToServer();
          } else {
            this.audioManager.playClick();
          }
          return result;
        },
        onEquipAvatar: (avatarId) => {
          const result = this.shopManager.equipAvatar(avatarId);
          if (result.ok) {
            this.audioManager.playDeploy();
            this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
            this.syncVaultStateToServer();
            if (this.uiManager.getCurrentScreen() === 'main-menu') {
              this.syncLobbySquadVisuals(false);
            }
          } else {
            this.audioManager.playClick();
          }
          return result;
        },
        onEquipBanner: (bannerId) => {
          const result = this.shopManager.equipBanner(bannerId);
          if (result.ok) {
            this.audioManager.playDeploy();
            this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
            this.syncVaultStateToServer();
            if (this.uiManager.getCurrentScreen() === 'main-menu') {
              this.syncLobbySquadVisuals(false);
            }
          } else {
            this.audioManager.playClick();
          }
          return result;
        },
        onEquipEmoteSlot: (item, slotIndex) => {
          const result = this.shopManager.equipEmoteToSlot(item.emoteId ?? item.id, slotIndex);
          if (result.ok) {
            this.audioManager.playDeploy();
            this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
            this.syncVaultStateToServer();
          } else {
            this.audioManager.playClick();
          }
          return result;
        },
        onUnequipEmoteSlot: (slotIndex) => {
          const result = this.shopManager.unequipEmoteSlot(slotIndex);
          this.audioManager.playClick();
          if (result.ok) {
            this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
            this.syncVaultStateToServer();
          }
          return result;
        },
        onRequestOpenEmoteWheel: () => {
          this.openEmoteWheelForCurrentScreen();
        },
        onPlayEmote: (emoteId) => {
          this.triggerEmote(emoteId);
        },
        onStopEmote: () => {
          this.stopActiveEmote(true);
        },
        onEmoteWheelOpenChange: (open) => {
          if (open) {
            this.playerController.forceExitScope();
            this.inputManager.setPointerLockAllowed(false);
          } else {
            this.syncArenaPointerLock(true);
          }
        },
        onToggleArenaCameraMode: () => this.toggleArenaCameraMode(),
        onInventoryOpenChange: (open) => {
          if (open) {
            this.playerController.forceExitScope();
            this.inputManager.setPointerLockAllowed(false);
          } else {
            this.syncArenaPointerLock(true);
          }
        },
        onFullMapOpenChange: (open) => {
          if (open) {
            this.minimapAccum = 1;
            this.playerController.forceExitScope();
            this.inputManager.setPointerLockAllowed(false);
          } else {
            this.syncArenaPointerLock(true);
          }
        },
        onSettingsOpenChange: (open) => {
          if (open) {
            this.playerController.forceExitScope();
            this.inputManager.setPointerLockAllowed(false);
          } else {
            this.syncArenaPointerLock(true);
          }
        },
        onToggleMute: () => {
          const current = this.settingsManager.getSettings().audio.muted;
          this.settingsManager.update({ audio: { muted: !current } });
          if (current) {
            this.audioManager.playClick();
          }
        },
        onSetQualityPreset: (quality) => {
          this.settingsManager.applyQualityPreset(quality);
        },
        onSetGlooPlacementMode: (mode) => {
          this.settingsManager.update({ controls: { glooPlacementMode: mode } });
        },
        onGlooPreviewConfirm: () => {
          if (this.confirmManualGlooPlacement()) {
            this.glooConfirmFireSuppress = true;
          }
        },
        onGlooPreviewCancel: () => {
          this.cancelManualGlooPreview(true);
        },
        onGlooPreviewRotateStep: (dir) => {
          this.rotateManualGlooPreview(dir * (Math.PI / 12));
        },
        onGlooPreviewRotateHold: (dir) => {
          this.glooManualRotateHoldDir = dir;
        },
        onSelectWeaponSlot: (slotIndex) => {
          this.playerController.forceExitScope();
          if (slotIndex === -1) {
            const wasGloo = this.switchOutOfGlooHold();
            const prevSlot = this.inventoryManager.getSnapshot().activeWeaponSlotIndex;
            const outcome = this.inventoryManager.holsterActiveWeapon();
            if (wasGloo && prevSlot === -1) {
              this.audioManager.playBack();
            }
            notifyOutcome(outcome);
          } else if (slotIndex === 0 || slotIndex === 1 || slotIndex === 2 || slotIndex === 3) {
            const prevSlot = this.inventoryManager.getSnapshot().activeWeaponSlotIndex;
            const outcome = this.inventoryManager.equipWeaponSlot(slotIndex);
            if (outcome.success) {
              const wasGloo = this.switchOutOfGlooHold();
              if (wasGloo && prevSlot === slotIndex) {
                this.audioManager.playClick();
              }
            }
            notifyOutcome(outcome);
          }
        },
        onConfirmWeaponReplace: (lootInstanceId, replaceSlotIndex) => {
          this.playerController.forceExitScope();
          this.switchOutOfGlooHold();
          notifyOutcome(
            this.inventoryManager.confirmWeaponReplacement(lootInstanceId, replaceSlotIndex),
          );
          this.syncArenaPointerLock(true);
        },
        onCancelWeaponReplace: () => {
          this.syncArenaPointerLock(true);
        },
        onCycleScopeZoom: () => {
          this.cycleActiveScopeZoom(1);
        },
        onAirborneJump: () => {
          if (this.airplaneDropManager.triggerJump()) {
            this.inputManager.clearJustPressed();
            this.syncArenaPointerLock(true);
          }
        },
        onAirborneDeployChute: () => {
          this.airplaneDropManager.triggerParachuteDeploy();
        },
        onHudOptionSelected: () => {
          this.syncArenaPointerLock(true);
        },
        inventoryActions: {
          onEquipWeaponSlot: (slotIdx) => {
            const prevSlot = this.inventoryManager.getSnapshot().activeWeaponSlotIndex;
            const outcome = this.inventoryManager.equipWeaponSlot(slotIdx);
            if (outcome.success) {
              const wasGloo = this.switchOutOfGlooHold();
              if (wasGloo && prevSlot === slotIdx) {
                this.audioManager.playClick();
              }
            }
            notifyOutcome(outcome);
          },
          onReloadWeaponSlot: (slotIdx) =>
            notifyOutcome(this.inventoryManager.reloadWeaponSlot(slotIdx)),
          onUnequipWeaponSlot: (slotIdx) =>
            notifyOutcome(this.inventoryManager.unequipWeaponSlot(slotIdx)),
          onEquipHolsteredWeapon: (id) =>
            notifyOutcome(this.inventoryManager.equipHolsteredWeapon(id)),
          onToggleHolster: () => {
            this.playerController.forceExitScope();
            this.switchOutOfGlooHold();
            notifyOutcome(this.inventoryManager.toggleHolsterWeapons());
          },
          onSwapWeaponSlots: () => {
            this.switchOutOfGlooHold();
            notifyOutcome(this.inventoryManager.swapWeaponSlots());
          },
          onDropWeaponSlot: (slotIdx) => notifyOutcome(this.inventoryManager.dropWeaponSlot(slotIdx)),
          onEquipHealing: (id) => notifyOutcome(this.inventoryManager.equipHealingItem(id)),
          onUnequipHealing: () => notifyOutcome(this.inventoryManager.unequipHealingSlot()),
          onEquipArmor: (id) => notifyOutcome(this.inventoryManager.equipArmorItem(id)),
          onUnequipArmor: () => notifyOutcome(this.inventoryManager.unequipArmorSlot()),
          onEquipHelmet: (id) => notifyOutcome(this.inventoryManager.equipHelmetItem(id)),
          onUnequipHelmet: () => notifyOutcome(this.inventoryManager.unequipHelmetSlot()),
          onEquipBackpack: (id) => notifyOutcome(this.inventoryManager.equipBackpackItem(id)),
          onUnequipBackpack: () => notifyOutcome(this.inventoryManager.unequipBackpackSlot()),
          onEquipScope: (id) => notifyOutcome(this.inventoryManager.equipScopeItem(id)),
          onUnequipScope: () => notifyOutcome(this.inventoryManager.unequipScopeSlot()),
          onEquipSpecial: (id) => notifyOutcome(this.inventoryManager.equipSpecialItem(id)),
          onUnequipSpecial: () => notifyOutcome(this.inventoryManager.unequipSpecialSlot()),
          onUseItem: (id) => {
            const outcome = this.inventoryManager.useItemById(id);
            notifyOutcome(outcome);
            if (
              outcome.success &&
              this.inventoryManager.isHealing() &&
              this.uiManager.isArenaInventoryOpen()
            ) {
              this.uiManager.setArenaInventoryOpen(false);
            }
          },
          onDropItem: (id) => notifyOutcome(this.inventoryManager.dropItemById(id)),
          onDropAmmo: (ammoType) => notifyOutcome(this.inventoryManager.dropAmmo(ammoType)),
        },
        onVirtualMove: (x, y, sprint) => {
          this.inputManager.setVirtualMove(x, y, sprint);
        },
        onVirtualActionHold: (action, held) => {
          this.inputManager.setVirtualActionHold(action, held);
        },
        onVirtualActionPress: (action) => {
          this.inputManager.triggerVirtualAction(action);
        },
        rankedCallbacks: {
          onRename: async (newName) => {
            try {
              await this.handleUsernameChange(newName);
              this.uiManager.rankedScreen.setStatusBanner('');
            } catch (err) {
              this.uiManager.rankedScreen.setStatusBanner(
                err instanceof Error ? i18n.translateServerMessage(err.message) : i18n.t('toast.renameFailed'),
              );
            }
          },
          onFindMatch: (preferredMap) => {
            void this.startRankedQueue(preferredMap);
          },
          onCancelQueue: () => {
            this.rankedNetwork.leaveQueue();
          },
          onToggleReady: (ready) => {
            this.rankedNetwork.setLobbyReady(ready);
          },
          onVoteMap: (mapId) => {
            this.rankedNetwork.voteLobbyMap(mapId);
          },
          onLeaveLobby: () => {
            this.rankedNetwork.leaveLobby();
          },
          onRefreshLeaderboard: async () => {
            try {
              const entries = await this.rankedApi.fetchLeaderboard(50);
              this.uiManager.rankedScreen.setLeaderboard(entries);
            } catch {
              // Ignore transient network error
            }
          },
          onRefreshProfile: async () => {
            try {
              if (!this.rankedApi.hasBackendSessionToken() && this.firebaseActiveUid) {
                const pub = await this.firebasePlayerService.readPublicDoc(this.firebaseActiveUid);
                if (pub) {
                  const prof = cloudPublicToRankedProfile(pub, this.shopManager.exportVaultState());
                  this.uiManager.rankedScreen.setProfile(prof);
                }
                return;
              }
              const p = await this.rankedApi.refreshProfile();
              if (p) this.uiManager.rankedScreen.setProfile(p);
            } catch {
              // Ignore transient network error
            }
          },
        },
        onRankedReturnToLobby: () => {
          this.audioManager.playBack();
          this.cleanupRankedMatch(true);
          this.uiManager.showScreen('ranked');
        },
        onLaunchBattleRoyale: (config) => {
          this.activeBattleRoyaleConfig = { ...config };
          this.settingsManager.update({ selectedMapId: config.mapId });
          this.uiManager.setMainMenuBattleRoyaleConfig(config);
          this.beginWaitingLobbyEntry(config);
        },
        onBattleRoyaleConfigChange: (config) => {
          this.activeBattleRoyaleConfig = { ...config };
          this.uiManager.setMainMenuBattleRoyaleConfig(config);
          this.scheduleCloudStateSync();
        },
        onBattleRoyalePlayAgain: () => {
          this.audioManager.playDeploy();
          this.beginWaitingLobbyEntry(this.activeBattleRoyaleConfig);
        },
        onBattleRoyaleExitMenu: () => {
          this.audioManager.playBack();
          this.cleanupBattleRoyaleMatch();
          this.uiManager.showScreen('main-menu');
        },
      },
      earlyLoadingScreen,
    );

    this.glooWallManager = new GlooWallManager(this.sceneManager.scene, {
      onWallDamaged: (_wallId, _hp, _maxHp, pos) => {
        const dist = this.player.position.distanceTo(pos);
        this.audioManager.playGlooHit(dist);
      },
      onWallDestroyed: (_wallId, pos) => {
        const dist = this.player.position.distanceTo(pos);
        this.audioManager.playGlooShatter(dist);
      },
    });
    this.damageNumberSystem = new DamageNumberSystem(this.uiManager.getArenaOverlayRoot());
    this.eliminationEffectSystem = new EliminationEffectSystem(this.sceneManager.scene);

    this.weaponManager.hitDetection.setGlooWallHooks({
      raycastSegment: (origin, dir, near, far, outPoint, outNormal) =>
        this.glooWallManager.raycastSegment(origin, dir, near, far, outPoint, outNormal),
      hasLineOfSight: (ax, ay, az, bx, by, bz) =>
        this.glooWallManager.hasLineOfSight(ax, ay, az, bx, by, bz),
    });
    this.mapManager.setDynamicCollisionResolver((pos, radius, height) =>
      this.glooWallManager.resolveHorizontalCollision(pos, radius, height),
    );
    this.weaponManager.setOnLocalHitConfirmedCallback((notif) => {
      if (
        notif.hx !== undefined &&
        notif.hy !== undefined &&
        notif.hz !== undefined &&
        notif.damageResult.totalDamage > 0
      ) {
        this.damageNumberSystem.spawn(
          notif.hx,
          notif.hy,
          notif.hz,
          notif.damageResult.totalDamage,
          notif.damageResult.isHeadshot,
        );
      }
    });
    this.weaponManager.setOnDummyEliminatedCallback(
      (dummyName, weaponName, isHeadshot, x, y, z) => {
        if (this.matchMode !== 'practice') return;
        this.practiceKills++;
        this.uiManager.setArenaKillsCounter(this.practiceKills);
        this.uiManager.showArenaKillNotification(
          this.playerProfileManager.getUsername(),
          dummyName,
          weaponName,
          isHeadshot,
          true,
          false,
        );
        this.eliminationEffectSystem.spawnBurst(x, y, z, isHeadshot);
        this.audioManager.playKillConfirmed(isHeadshot);
      },
    );

    // Route tactical actions to CharacterManager, InventoryManager, WeaponManager, and HUD
    this.playerController.setActionFeedbackCallback((action) => {
      switch (action) {
        case 'aim':
          if (this.glooManualPreviewActive) {
            this.playerController.forceExitScope();
            this.cancelManualGlooPreview(true);
            break;
          }
          this.audioManager.playClick();
          break;
        case 'prone':
          this.audioManager.playClick();
          break;
        case 'glooWall':
          this.handleDeployGlooWall();
          break;
        case 'ability': {
          const activated = this.characterManager.triggerActiveAbility();
          if (activated) {
            this.audioManager.playDeploy();
          }
          this.uiManager.notifyArenaAction(action);
          break;
        }
        case 'reload':
          if (this.glooManualPreviewActive) {
            break;
          }
          if (this.weaponManager.isUnlimitedAmmo()) {
            break;
          }
          if (this.inventoryManager.isHealing()) {
            this.uiManager.showArenaToast(i18n.t('toast.healingInProgress'));
            break;
          }
          if (this.weaponManager.triggerReload()) {
            this.playerController.forceExitScope();
          }
          break;
        case 'slot1':
        case 'slot2':
        case 'slot3':
        case 'slot4': {
          const slotIdx = (
            action === 'slot1' ? 0 : action === 'slot2' ? 1 : action === 'slot3' ? 2 : 3
          ) as 0 | 1 | 2 | 3;
          const prevSlot = this.inventoryManager.getSnapshot().activeWeaponSlotIndex;
          this.playerController.forceExitScope();
          const outcome = this.inventoryManager.equipWeaponSlot(slotIdx);
          if (outcome.success) {
            const wasGloo = this.switchOutOfGlooHold();
            if (wasGloo && prevSlot === slotIdx) {
              this.audioManager.playClick();
            }
          }
          notifyOutcome(outcome);
          break;
        }
        case 'holster': {
          this.playerController.forceExitScope();
          if (this.glooManualPreviewActive) {
            this.switchOutOfGlooHold();
            const prevSlot = this.inventoryManager.getSnapshot().activeWeaponSlotIndex;
            const outcome = this.inventoryManager.holsterActiveWeapon();
            if (prevSlot === -1) {
              this.audioManager.playBack();
            }
            notifyOutcome(outcome);
            break;
          }
          notifyOutcome(this.inventoryManager.toggleHolsterWeapons());
          break;
        }
        case 'useMedkit': {
          const outcome = this.inventoryManager.useEquippedHealing();
          notifyOutcome(outcome);
          if (outcome.success && this.inventoryManager.isHealing()) {
            this.switchOutOfGlooHold();
            this.playerController.forceExitScope();
          }
          break;
        }
        case 'useSpecial': {
          const outcome = this.inventoryManager.useEquippedSpecial();
          notifyOutcome(outcome);
          if (outcome.success && this.inventoryManager.isHealing()) {
            this.switchOutOfGlooHold();
            this.playerController.forceExitScope();
          }
          break;
        }
        case 'weaponSwitch': {
          this.playerController.forceExitScope();
          const wasGloo = this.switchOutOfGlooHold();
          const outcome = this.inventoryManager.swapWeaponSlots();
          if (wasGloo && !outcome.success) {
            const invSnap = this.inventoryManager.getSnapshot();
            if (invSnap.activeWeaponSlotIndex >= 0) {
              this.audioManager.playClick();
              break;
            }
          }
          notifyOutcome(outcome);
          break;
        }
        case 'pickup': {
          if (this.player.movement.isZiplining) {
            this.player.movement.detachZipline(false);
            break;
          }
          if (this.player.movement.isSitting) {
            this.player.movement.standUp(false);
            break;
          }
          const isWaitingArena = this.airplaneDropManager.getPhase() === 'waiting';
          const nearLoot = isWaitingArena ? null : this.lootManager.getNearestLoot(this.player.position);
          if (nearLoot) {
            const outcome = this.inventoryManager.pickupNearestLoot(this.player.position);
            notifyOutcome(outcome);
            if (outcome.success && nearLoot.definition.category === 'weapon') {
              this.switchOutOfGlooHold();
            }
          } else {
            const toggled = this.mapManager.tryToggleNearestDoor(this.player.position);
            if (toggled) {
              this.audioManager.playClick();
              const doorName = i18n.translateDoorLabel(toggled.label);
              this.uiManager.showArenaToast(
                i18n.t(toggled.isOpen ? 'toast.doorOpened' : 'toast.doorClosed', {
                  door: doorName,
                }),
              );
            } else {
              const seat = this.mapManager.findNearestSeat(this.player.position);
              if (seat) {
                this.playerController.forceExitScope();
                if (this.player.movement.trySit(seat)) {
                  this.audioManager.playSit();
                }
              } else {
                const camYaw = this.playerCamera.getYaw();
                const lookX = -Math.sin(camYaw);
                const lookZ = -Math.cos(camYaw);
                const zipPlan = this.mapManager.getNearestZiplinePlan(
                  this.player.position,
                  lookX,
                  lookZ,
                );
                if (zipPlan && this.player.movement.tryStartZipline(zipPlan)) {
                  this.uiManager.showArenaToast(
                    i18n.t('toast.ziplineRide', {
                      name: i18n.translateZiplineLabel(zipPlan.label),
                    }),
                  );
                } else {
                  this.player.movement.tryVaultNearestWindow(lookX, lookZ, 1.65);
                }
              }
            }
          }
          break;
        }
        case 'drop':
          this.playerController.forceExitScope();
          notifyOutcome(this.inventoryManager.dropActiveWeapon());
          break;
        case 'minimap':
          this.uiManager.notifyArenaAction(action);
          this.minimapAccum = 1;
          break;
        default:
          this.uiManager.notifyArenaAction(action);
          break;
      }
    });

    this.gameLoop = new GameLoop(
      this.rendererManager,
      (delta, elapsed) => this.update(delta, elapsed),
      (fps) => this.uiManager.updateFps(fps),
    );

    this.bindSubsystemEvents();
    this.bindLobbyEmoteTapDetection();
  }

  private bindLobbyEmoteTapDetection(): void {
    const canvas = this.rendererManager.renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (this.uiManager.getCurrentScreen() !== 'main-menu') {
        this.lobbyTapDown = null;
        return;
      }
      if (this.uiManager.isMainMenuModalOpen() || this.uiManager.isEmoteWheelOpen()) {
        this.lobbyTapDown = null;
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) {
        this.lobbyTapDown = null;
        return;
      }
      this.lobbyTapDown = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      };
    };

    const onPointerUp = (e: PointerEvent) => {
      const start = this.lobbyTapDown;
      this.lobbyTapDown = null;
      if (!start || start.id !== e.pointerId) return;
      if (this.uiManager.getCurrentScreen() !== 'main-menu') return;
      if (this.uiManager.isMainMenuModalOpen() || this.uiManager.isEmoteWheelOpen()) return;

      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const elapsedMs = performance.now() - start.time;
      if (dist >= 12 || elapsedMs >= 380) return;

      if (this.isPointHittingLobbyCharacter(e.clientX, e.clientY)) {
        this.audioManager.playClick();
        this.openEmoteWheelForCurrentScreen();
      }
    };

    const onPointerCancel = () => {
      this.lobbyTapDown = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    this.unsubscribes.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
    });
  }

  private isPointHittingLobbyCharacter(clientX: number, clientY: number): boolean {
    const rect = this.rendererManager.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this.lobbyPointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.lobbyRaycaster.setFromCamera(this.lobbyPointerNdc, this.cameraManager.camera);
    const hits = this.lobbyRaycaster.intersectObject(this.player.visuals.root, true);
    if (hits.length > 0) return true;

    // Forgiving bounding cylinder check around lobby character center for mobile finger taps
    const ray = this.lobbyRaycaster.ray;
    const closest = new THREE.Vector3();
    const charCenter = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + 0.95,
      this.player.position.z,
    );
    ray.closestPointToPoint(charCenter, closest);
    const radialDist = Math.hypot(closest.x - charCenter.x, closest.z - charCenter.z);
    return radialDist <= 0.62 && closest.y >= this.player.position.y - 0.15 && closest.y <= this.player.position.y + 2.05;
  }

  private canEmoteInArena(): boolean {
    if (!this.player.stats.isAlive) return false;
    if (this.airplaneDropManager.isAirborne()) return false;
    if (
      this.player.movement.isSitting ||
      this.player.movement.isVaulting ||
      this.player.movement.isZiplining ||
      this.player.movement.isSwimming
    ) {
      return false;
    }
    if (this.inventoryManager.isHealing()) return false;
    if (this.matchMode === 'battle-royale' && this.battleRoyaleManager.isLocalEliminated()) {
      return false;
    }
    if (this.matchMode === 'ranked' && this.rankedEliminated) {
      return false;
    }
    return true;
  }

  private openEmoteWheelForCurrentScreen(): void {
    const screen = this.uiManager.getCurrentScreen();
    if (screen === 'main-menu') {
      const rect = this.rendererManager.renderer.domElement.getBoundingClientRect();
      this.lobbyProjVec.set(
        this.player.position.x,
        this.player.position.y + 1.0,
        this.player.position.z,
      );
      this.lobbyProjVec.project(this.cameraManager.camera);
      const sx = rect.left + (this.lobbyProjVec.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-this.lobbyProjVec.y * 0.5 + 0.5) * rect.height;
      this.uiManager.openEmoteWheel(sx, sy, this.shopManager.getEquippedEmoteWheel());
      return;
    }

    if (screen === 'test-arena') {
      if (!this.canEmoteInArena()) return;
      this.uiManager.openEmoteWheel(
        window.innerWidth * 0.5,
        window.innerHeight * 0.5,
        this.shopManager.getEquippedEmoteWheel(),
      );
    }
  }

  private triggerEmote(emoteId: string): void {
    const emote = getEmoteById(emoteId);
    if (!emote) return;
    if (
      !this.shopManager.isOwned(emote.shopItemId) ||
      !this.shopManager.getEquippedEmoteWheel().includes(emote.id)
    ) {
      return;
    }
    const screen = this.uiManager.getCurrentScreen();
    if (screen === 'test-arena' && !this.canEmoteInArena()) {
      this.uiManager.closeEmoteWheel();
      return;
    }

    this.uiManager.closeEmoteWheel();
    // Never allow two dances to play simultaneously
    this.stopActiveEmote(false);

    if (screen === 'test-arena') {
      this.playerController.forceExitScope();
    }

    if (this.player.playEmote(emote.id)) {
      this.wasPlayerEmoting = true;
      // Start dance animation and music at the exact same moment
      this.audioManager.playDanceMusic(emote.id, emote.durationSeconds);
      if (screen === 'main-menu') {
        const loc = i18n.translateShopItem(emote.shopItemId, emote.name, emote.description);
        this.uiManager.setLobbyEmotingState(loc.name);
      }
    }
  }

  private stopActiveEmote(playSound: boolean): void {
    const wasEmoting = this.player.isEmoting() || this.wasPlayerEmoting;
    this.player.stopEmote();
    this.wasPlayerEmoting = false;
    this.audioManager.stopDanceMusic(playSound && wasEmoting);
    this.uiManager.setLobbyEmotingState(null);
  }

  async start(): Promise<void> {
    this.phaseState = 'loading';

    await this.loadingManager.runPipeline([
      {
        id: 'detect-device',
        label: `Calibrating ${this.deviceProfile.performanceTier} profile...`,
        weight: 1,
        run: () => {
          this.responsiveManager.recompute();
        },
      },
      {
        id: 'procedural-assets',
        label: 'Generating procedural PBR textures & materials...',
        weight: 2,
        run: () => {
          this.assetManager.createRadialShadowTexture();
          const envMap = this.rendererManager.initEnvironmentMap();
          this.sceneManager.setEnvironmentMap(envMap);
        },
      },
      {
        id: 'preload-characters',
        label: 'Initializing Roblox R6 character rigs & animations...',
        weight: 2,
        run: () => {
          getR6IdleClip();
        },
      },
      {
        id: 'preload-weapons',
        label: 'Loading 15 3D PBR weapon models (.glb)...',
        weight: 2,
        run: async () => {
          await this.assetManager.preloadWeaponGlb('scar', getWeaponGlbUrl('scar'));
        },
      },
      {
        id: 'build-test-arena',
        label: 'Preparing Nexus Lobby...',
        weight: 2,
        run: () => {
          this.sceneManager.add(this.militaryLobby.root);
          this.sceneManager.add(this.mapManager.root);
          this.sceneManager.add(this.lootManager.root);
          this.sceneManager.add(this.weaponManager.root);
          this.sceneManager.add(this.airplaneDropManager.root);
          this.sceneManager.add(this.safeZoneManager.root);
          this.sceneManager.add(this.remotePlayerManager.root);
          this.sceneManager.add(this.battleRoyaleManager.root);
          this.sceneManager.add(this.player.visuals.root);
          this.sceneManager.add(this.gameplayCompanion.root);

          const initialMapId = this.settingsManager.getSettings().selectedMapId;
          const cfg = MAP_CONFIGS[initialMapId];
          this.applyGraphicsQuality(this.settingsManager.getSettings());
          this.syncSelectedCharacterAppearance();
          this.syncUnlimitedAmmoMode();
          this.uiManager.setActiveMapName(cfg.name, cfg.id);
          this.enterLobbyScene();
          this.player.updateVisuals(0.016, 0);
        },
      },
      {
        id: 'precompile-shaders',
        label: 'Compiling WebGL shaders...',
        weight: 2,
        run: async () => {
          this.cameraManager.setPreset('menu-orbit', true);
          this.cameraManager.update(0.016, 0);
          await this.rendererManager.precompileAsync(this.sceneManager.scene, this.cameraManager.camera);
        },
      },
    ]);

    const initialUser = await this.firebaseAuthService.waitForInitialAuth();
    if (this.isDisposed) return;

    void verifyFirestoreConnection();

    this.phaseState = 'menu';
    this.syncOrientationInputGuard();
    this.inputManager.setSuppressGameKeys(false);
    this.inputManager.setPointerLockAllowed(false);
    this.uiManager.updatePlayerProfile(
      this.playerProfileManager.getSnapshot(),
      this.r6Customization,
    );
    this.uiManager.showScreen('auth', false);
    this.syncLobbyBackground('auth');
    this.syncLobbySquadVisuals(true);
    this.syncLobbyMusicState();
    this.gameLoop.start();
    this.previewRenderer.setPaused(false);
    this.scheduleBackgroundAssetWarmup();
    DeviceDetector.probeSupportedRefreshRate(() => {
      this.settingsManager.reconcileWithDeviceCapabilities();
    });

    if (initialUser && initialUser.emailVerified) {
      void this.prepareAuthenticatedCloudAccount(initialUser);
    }
  }

  private syncOrientationInputGuard(): void {
    const blocked = this.uiManager.isOrientationBlocked();
    if (blocked) {
      this.inputManager.setEnabled(false);
      this.inputManager.releasePointerLock();
      this.uiManager.resetArenaTouchControls?.();
    } else if (this.phaseState !== 'paused' && this.phaseState !== 'loading') {
      this.inputManager.setEnabled(true);
    }
  }

  private ensureRemainingWeaponGlbs(concurrency = 2): Promise<void> {
    if (this.remainingWeaponsPromise) {
      return this.remainingWeaponsPromise;
    }
    const missing = WEAPON_LIST.filter(
      (weapon) => hasWeaponGlbFile(weapon.id) && !this.assetManager.hasWeaponGlb(weapon.id),
    );
    if (missing.length === 0) {
      this.remainingWeaponsPromise = Promise.resolve();
      return this.remainingWeaponsPromise;
    }
    let loadedAny = false;
    this.remainingWeaponsPromise = this.assetManager
      .preloadWeaponGlbsBatched(
        missing.map((weapon) => ({ id: weapon.id, url: getWeaponGlbUrl(weapon.id) })),
        concurrency,
        () => {
          loadedAny = true;
        },
      )
      .then(() => {
        if (loadedAny) {
          this.previewRenderer.invalidateShopItemSnapshots();
          this.uiManager.refreshShopIfOpened();
        }
      });
    return this.remainingWeaponsPromise;
  }

  private scheduleBackgroundAssetWarmup(): void {
    if (this.backgroundWarmupPromise) return;
    this.remainingWeaponsTimer = window.setTimeout(() => {
      this.remainingWeaponsTimer = 0;
      this.backgroundWarmupPromise = (async () => {
        getR6AnimationClips();
        this.player.visuals.ensureAllAnimationClipsBound();
        this.assetManager.createProceduralGridTexture();
        this.assetManager.createBrushedMetalTexture();
        await this.ensureRemainingWeaponGlbs(2);
      })();
    }, 450);
  }

  getPhaseState(): GamePhaseState {
    return this.phaseState;
  }

  private bindSubsystemEvents(): void {
    this.unsubscribes.push(
      this.loadingManager.onProgress((progress) => {
        this.uiManager.updateLoadingProgress(progress);
      }),
    );

    this.unsubscribes.push(
      this.responsiveManager.onChange((metrics) => {
        this.rendererManager.resize(metrics.width, metrics.height);
        this.cameraManager.updateViewport(metrics);
        this.playerCamera.updateViewport(metrics);
        this.uiManager.onViewportChange(metrics);
        this.syncOrientationInputGuard();
      }),
    );

    this.unsubscribes.push(
      this.settingsManager.onChange((settings) => {
        i18n.setLanguage(settings.language);
        this.applyGraphicsQuality(settings);
        this.audioManager.applySettings(settings.audio);
        this.inputManager.setOptions(
          settings.controls.lookSensitivity,
          settings.controls.invertY,
        );
        this.playerCamera.setOptions(
          settings.controls.lookSensitivity,
          settings.controls.invertY,
          settings.controls.adsSensitivity,
          settings.controls.aimStability,
        );
        this.uiManager.onSettingsChange(settings, this.responsiveManager.getMetrics());
        if (settings.controls.glooPlacementMode === 'auto' && this.glooManualPreviewActive) {
          this.cancelManualGlooPreview(false);
        }
        if (!this.isHydratingCloudState) {
          this.scheduleCloudStateSync();
        }
      }),
    );

    this.unsubscribes.push(
      i18n.subscribe(() => {
        this.lastScopeProfileCacheKey = '';
        this.minimapAccum = 1;
      }),
    );

    this.unsubscribes.push(
      this.controlSettings.onChange(() => {
        this.uiManager.onControlSettingsChange(this.responsiveManager.getMetrics());
        if (!this.isHydratingCloudState) {
          this.scheduleCloudStateSync();
        }
      }),
    );

    this.unsubscribes.push(
      this.rankedNetwork.onStateChange((state) => {
        this.uiManager.rankedScreen.setConnectionState(state, this.rankedNetwork.getRttMs());
        if (state === 'connected') {
          if (this.lobbyReconnectTimer) {
            clearTimeout(this.lobbyReconnectTimer);
            this.lobbyReconnectTimer = 0;
          }
        } else if (state === 'disconnected' || state === 'error') {
          this.rankedAuthReady = false;
          this.lobbyPresencePromise = null;
          this.scheduleLobbyPresenceReconnect();
        }
      }),
    );

    this.unsubscribes.push(
      this.rankedNetwork.onPacket((pkt) => {
        this.handleRankedPacket(pkt.type, pkt.payload);
      }),
    );

    this.uiManager.setAuthState(this.firebaseAuthService.getState());
    this.unsubscribes.push(
      this.firebaseAuthService.onChange((authState, rawUser) => {
        this.uiManager.setAuthState(authState);
        if (rawUser && rawUser.emailVerified) {
          if (
            (this.hasCompletedPreLobbyLogin || this.loginLoadingActive) &&
            this.firebaseActiveUid &&
            this.firebaseActiveUid !== rawUser.uid
          ) {
            this.loginAttemptNonce++;
            this.loginLoadingActive = false;
            this.authScreenEnteringLobby = false;
            this.hasCompletedPreLobbyLogin = false;
            this.firebaseActiveUid = null;
            this.cloudStateHydratedUid = null;
            if (this.cloudStateSyncTimer) {
              clearTimeout(this.cloudStateSyncTimer);
              this.cloudStateSyncTimer = 0;
            }
            this.latestFirebaseIdToken = null;
            this.rankedApi.setFirebaseIdToken(null);
            this.preparedAuthSession = null;
            this.uiManager.stopPostLoginLoading();
            this.firebaseFriendsService.stop();
            this.firebasePartyService.stop();
            this.rankedApi.clearCredentials();
            this.applyMailboxState({ messages: [], unreadCount: 0, unclaimedRewardCount: 0 });
            this.localRankedPlayerId = null;
            this.controlSettings.resetAllToDefaults();
            this.characterManager.unlockSystem.setDeveloperAccess(false);
            this.characterManager.unlockSystem.resetToDefaults();
            resetR6CustomizationStorage();
            this.r6Customization = loadR6Customization();
            this.shopManager.setDeveloperMode(false);
            this.shopManager.resetToGuestDefaultVault();
            this.playerProfileManager.setDeveloperVerified(false);
            const guestSnap = this.playerProfileManager.resetToGuestAccount();
            this.syncSelectedCharacterAppearance();
            this.uiManager.updatePlayerProfile(guestSnap, this.r6Customization);
            this.uiManager.setSettingsAccountInfo(null);
            this.uiManager.showScreen('auth');
          }
          if (!this.preparedAuthSession || this.preparedAuthSession.uid !== rawUser.uid) {
            void this.prepareAuthenticatedCloudAccount(rawUser);
          }
        } else if (!authState.busy) {
          this.preparedAuthSession = null;
          this.uiManager.setAuthScreenState({
            preparingAccount: false,
            enteringLobby: false,
            preparedAccount: null,
          });
          if (this.firebaseActiveUid || this.hasCompletedPreLobbyLogin || this.loginLoadingActive) {
            void this.handleFirebaseSignedOut();
          }
        }
      }),
    );

    this.unsubscribes.push(
      this.playerProfileManager.onChange((snapshot) => {
        this.uiManager.updatePlayerProfile(snapshot, this.r6Customization);
        this.syncSettingsAccountInfo();
        this.firebasePartyService.updateSelfInfo({
          username: snapshot.username,
          level: snapshot.level,
          tier: snapshot.tier,
        });
        this.scheduleFirebasePublicProfileSync();
      }),
    );

    this.unsubscribes.push(
      this.shopManager.onChange((snap) => {
        this.syncLobbyWeaponFromShop(true);
        this.uiManager.updateShopSnapshot(snap);
        this.firebasePartyService.updateSelfInfo({
          avatarId: snap.equippedAvatarId,
        });
        this.scheduleVaultSync();
        if (this.rankedNetwork.state === 'connected' && this.rankedAuthReady) {
          this.rankedNetwork.updateSquadCharacter(
            this.characterManager.getSelectedCharacter().id,
            { ...this.r6Customization },
            {
              avatarId: snap.equippedAvatarId,
              bannerId: snap.equippedBannerId,
              weaponSkins: snap.equippedWeaponSkins,
            },
          );
        }
      }),
    );
  }

  private syncLobbyWeaponFromShop(animate = true): void {
    this.weaponManager.setEquippedWeaponSkins(this.shopManager.getEquippedWeaponSkins());
    const inActiveMatch = this.phaseState === 'test-arena' || this.arenaPausedForOverlay;
    if (!inActiveMatch) {
      this.weaponManager.syncLobbyWeapon(
        this.shopManager.getEquippedLobbyWeaponId(),
        animate,
      );
    }
  }

  private applyShopEquipmentSideEffects(item?: ShopCatalogItem): void {
    const isCosmeticClothingOrOutfit =
      item?.customizationPatch !== undefined ||
      item?.category === 'featured' ||
      item?.category === 'outfits' ||
      item?.category === 'clothing';

    if (isCosmeticClothingOrOutfit) {
      const updated = this.shopManager.getCurrentCustomization();
      const selectedChar = this.characterManager.getSelectedCharacter();
      this.r6Customization = updated;
      saveR6Customization(updated);
      saveCharacterCustomizationOverride(
        selectedChar.id,
        updated,
        getR6CharacterPreset(selectedChar.model.humanModelId).appearance,
      );
      this.player.setCustomization(updated);
      this.uiManager.updatePlayerProfile(
        this.playerProfileManager.getSnapshot(),
        updated,
      );
    }

    const gliderColors = this.shopManager.getActiveGliderColors();
    this.airplaneDropManager.setParachuteColors(
      gliderColors.primaryHex,
      gliderColors.accentHex,
    );
    this.syncLobbyWeaponFromShop(item?.category === 'weapons');
    this.militaryLobby.setShopAccent(this.shopManager.getActiveBeaconHex());
    this.militaryLobby.triggerCompanionReaction();
    this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
    if (this.uiManager.getCurrentScreen() === 'main-menu') {
      this.syncLobbySquadVisuals(false);
    }
    this.scheduleCloudStateSync();
  }

  private scheduleVaultSync(): void {
    if (this.isDisposed) return;
    if (this.vaultSyncTimer) {
      clearTimeout(this.vaultSyncTimer);
    }
    this.vaultSyncTimer = window.setTimeout(() => {
      this.vaultSyncTimer = 0;
      this.syncVaultStateToServer();
    }, 350);
  }

  private syncVaultStateToServer(): void {
    if (this.isDisposed) return;
    if (this.vaultSyncTimer) {
      clearTimeout(this.vaultSyncTimer);
      this.vaultSyncTimer = 0;
    }
    const vaultState = this.shopManager.exportVaultState();
    void this.rankedApi.syncVaultState(vaultState).catch(() => {});
    if (this.firebaseActiveUid) {
      void this.firebasePlayerService.syncPrivateVault(this.firebaseActiveUid, vaultState).catch(() => {});
      this.scheduleFirebasePublicProfileSync();
    }
  }

  private buildCloudStatePayload(): CloudSyncStatePayload {
    return {
      settings: this.settingsManager.exportCloudSettings(),
      controlSettings: this.controlSettings.exportCloudControls(),
      selectedCharacterId: this.characterManager.getSelectedCharacter().id,
      customization: {
        ...this.r6Customization,
      } as unknown as CloudSyncStatePayload['customization'],
      charOverrides: exportAllCharOverrides() as unknown as CloudSyncStatePayload['charOverrides'],
      checkpoints: {
        lobbyMode: this.selectedLobbyMode,
        battleRoyaleConfig: { ...this.activeBattleRoyaleConfig },
        lastArenaMapId: this.settingsManager.getSettings().selectedMapId,
        updatedAt: Date.now(),
      },
    };
  }

  private applyCloudStatePayload(cloudState?: CloudSyncStatePayload | null): void {
    if (!cloudState || typeof cloudState !== 'object') return;
    this.isHydratingCloudState = true;
    try {
      if (cloudState.settings && typeof cloudState.settings === 'object') {
        this.settingsManager.applyCloudSettings(cloudState.settings);
      }
      if (cloudState.controlSettings && typeof cloudState.controlSettings === 'object') {
        this.controlSettings.applyCloudControls(cloudState.controlSettings);
      }
      if (cloudState.charOverrides && typeof cloudState.charOverrides === 'object') {
        applyAllCharOverrides(
          cloudState.charOverrides as unknown as Record<string, Partial<R6Customization>>,
        );
      }
      if (
        typeof cloudState.selectedCharacterId === 'string' &&
        cloudState.selectedCharacterId.trim()
      ) {
        this.characterManager.unlockSystem.applyCloudSelection(cloudState.selectedCharacterId);
        this.characterManager.selectCharacter(cloudState.selectedCharacterId);
      }
      if (cloudState.customization && typeof cloudState.customization === 'object') {
        const normalized = normalizeR6Customization(
          cloudState.customization as unknown as Partial<R6Customization> & Record<string, unknown>,
        );
        this.r6Customization = normalized;
        saveR6Customization(normalized);
        const selectedChar = this.characterManager.getSelectedCharacter();
        saveCharacterCustomizationOverride(
          selectedChar.id,
          normalized,
          getR6CharacterPreset(selectedChar.model.humanModelId).appearance,
        );
      } else {
        this.r6Customization = this.getResolvedCustomizationForCharacter();
        saveR6Customization(this.r6Customization);
      }
      this.syncSelectedCharacterAppearance();

      const checkpoints = cloudState.checkpoints;
      if (checkpoints && typeof checkpoints === 'object') {
        if (
          checkpoints.lobbyMode === 'battle-royale' ||
          checkpoints.lobbyMode === 'ranked' ||
          checkpoints.lobbyMode === 'practice'
        ) {
          this.selectedLobbyMode = checkpoints.lobbyMode;
          this.uiManager.setMainMenuLobbyMode(this.selectedLobbyMode);
        }
        if (
          checkpoints.battleRoyaleConfig &&
          typeof checkpoints.battleRoyaleConfig === 'object'
        ) {
          const cfg = checkpoints.battleRoyaleConfig as Partial<BattleRoyaleMatchConfig>;
          const validMap =
            cfg.mapId === 'desert' || cfg.mapId === 'forest' || cfg.mapId === 'snow'
              ? cfg.mapId
              : this.activeBattleRoyaleConfig.mapId;
          const validBots =
            typeof cfg.botCount === 'number' && Number.isFinite(cfg.botCount)
              ? Math.max(2, Math.min(99, Math.floor(cfg.botCount)))
              : this.activeBattleRoyaleConfig.botCount;
          const validDiff =
            cfg.difficulty === 'recruit' ||
            cfg.difficulty === 'tactical' ||
            cfg.difficulty === 'veteran' ||
            cfg.difficulty === 'mixed'
              ? cfg.difficulty
              : this.activeBattleRoyaleConfig.difficulty;
          this.activeBattleRoyaleConfig = {
            mapId: validMap,
            botCount: validBots,
            difficulty: validDiff,
          };
          this.uiManager.setMainMenuBattleRoyaleConfig(this.activeBattleRoyaleConfig);
        }
      }

      const effectiveMapId =
        checkpoints?.lastArenaMapId === 'desert' ||
        checkpoints?.lastArenaMapId === 'forest' ||
        checkpoints?.lastArenaMapId === 'snow'
          ? checkpoints.lastArenaMapId
          : this.settingsManager.getSettings().selectedMapId;
      this.activeBattleRoyaleConfig.mapId = effectiveMapId;
      this.switchMap(effectiveMapId);
    } finally {
      this.isHydratingCloudState = false;
    }
  }

  private scheduleCloudStateSync(): void {
    if (this.isDisposed || this.isHydratingCloudState || !this.firebaseActiveUid) return;
    const uid = this.firebaseActiveUid;
    if (this.cloudStateSyncTimer) {
      clearTimeout(this.cloudStateSyncTimer);
    }
    this.cloudStateSyncTimer = window.setTimeout(() => {
      this.cloudStateSyncTimer = 0;
      if (this.isDisposed || this.firebaseActiveUid !== uid) return;
      const payload = this.buildCloudStatePayload();
      void this.firebasePlayerService
        .syncCloudState(uid, payload, this.latestFirebaseIdToken)
        .catch(() => {});
    }, 450);
  }

  private syncSettingsAccountInfo(): void {
    const authUser = this.firebaseAuthService.getCurrentUser();
    if (!authUser || !this.firebaseActiveUid) {
      this.uiManager.setSettingsAccountInfo(null);
      return;
    }
    const snap = this.playerProfileManager.getSnapshot();
    this.uiManager.setSettingsAccountInfo({
      username: snap.username,
      playerId: snap.playerId,
      numericId: snap.numericId,
      email: authUser.email ?? null,
      emailVerified: Boolean(authUser.emailVerified),
    });
  }

  private async handleUsernameChange(newName: string): Promise<RankedProfile | null> {
    const prevName = this.playerProfileManager.getUsername();
    const cleaned = newName.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2 || cleaned.length > 18) {
      throw new Error(i18n.t('profile.err.length'));
    }
    if (!/^[\p{L}\p{N} _.-]{2,18}$/u.test(cleaned)) {
      throw new Error(i18n.t('auth.errUsernameInvalid'));
    }
    if (cleaned.toLowerCase() === prevName.trim().toLowerCase()) {
      throw new Error(i18n.t('profile.err.sameName'));
    }

    if (this.firebaseActiveUid && this.localRankedPlayerId) {
      await this.firebasePlayerService.updateUsernameOnCloud(
        this.firebaseActiveUid,
        this.localRankedPlayerId,
        cleaned,
        prevName,
      );
    }

    let res;
    try {
      res = await this.playerProfileManager.changeUsername(cleaned);
    } catch (err) {
      if (this.firebaseActiveUid && this.localRankedPlayerId) {
        await this.firebasePlayerService
          .updateUsernameOnCloud(
            this.firebaseActiveUid,
            this.localRankedPlayerId,
            prevName,
            cleaned,
          )
          .catch(() => {});
      }
      throw err;
    }

    if (this.firebaseActiveUid) {
      await this.firebaseAuthService.updateDisplayUsername(res.snapshot.username);
    }

    if (res.serverProfile) {
      if (this.preparedAuthSession) {
        this.preparedAuthSession = {
          ...this.preparedAuthSession,
          profile: res.serverProfile,
        };
        this.uiManager.setAuthScreenState({
          preparedAccount: {
            uid: this.preparedAuthSession.uid,
            username: res.serverProfile.name,
            playerId: res.serverProfile.playerId,
            numericId: res.serverProfile.numericId || res.serverProfile.playerId,
          },
        });
      }
      this.uiManager.rankedScreen.setProfile(res.serverProfile);
    }

    this.firebasePartyService.updateSelfInfo({
      username: res.snapshot.username,
    });
    this.syncSettingsAccountInfo();
    this.scheduleFirebasePublicProfileSync();
    if (this.rankedNetwork.state === 'connected') {
      this.sendRankedAuthHello();
    }
    return res.serverProfile;
  }

  private scheduleFirebasePublicProfileSync(): void {
    if (this.isDisposed || !this.firebaseActiveUid) return;
    const uid = this.firebaseActiveUid;
    if (this.firebasePublicSyncTimer) {
      clearTimeout(this.firebasePublicSyncTimer);
    }
    this.firebasePublicSyncTimer = window.setTimeout(() => {
      this.firebasePublicSyncTimer = 0;
      if (this.isDisposed || this.firebaseActiveUid !== uid) return;
      const snap = this.playerProfileManager.getSnapshot();
      const cosmetics = {
        avatarId: this.shopManager.getEquippedAvatarId(),
        bannerId: this.shopManager.getEquippedBannerId(),
      };
      void this.firebasePlayerService.syncPublicProfileSnapshot(uid, snap, cosmetics).catch(() => {});
    }, 350);
  }

  private syncFirebasePresenceStatus(): void {
    if (this.isDisposed || !this.firebaseActiveUid) return;
    const status =
      this.matchMode !== 'practice'
        ? 'in-match'
        : (this.lobbySquadState?.members.length ?? 1) > 1
          ? 'in-squad'
          : 'online';
    void this.firebaseFriendsService.setPresenceStatus(status).catch(() => {});
  }

  private canAccessGameScreens(): boolean {
    return (
      this.hasCompletedPreLobbyLogin &&
      this.firebaseAuthService.isSignedIn() &&
      Boolean(this.firebaseActiveUid)
    );
  }

  private canAccessLoginLoadingScreen(): boolean {
    return this.loginLoadingActive && this.firebaseAuthService.isSignedIn();
  }

  private async prepareAuthenticatedCloudAccount(user: FirebaseUser): Promise<void> {
    if (this.isDisposed || !user.emailVerified) return;
    if (this.preparedAuthSession?.uid === user.uid) {
      this.uiManager.setAuthScreenState({
        preparingAccount: false,
        errorMessage: null,
        preparedAccount: {
          uid: this.preparedAuthSession.uid,
          username: this.preparedAuthSession.profile.name,
          playerId: this.preparedAuthSession.profile.playerId,
          numericId:
            this.preparedAuthSession.profile.numericId ||
            this.preparedAuthSession.profile.playerId,
        },
      });
      return;
    }

    if (this.preparingAuthPromise) {
      const sameUidInFlight = this.preparingAuthUid === user.uid;
      await this.preparingAuthPromise.catch(() => {});
      if (sameUidInFlight || this.preparedAuthSession?.uid === user.uid || this.isDisposed) {
        return;
      }
    }

    const uid = user.uid;
    this.preparingAuthUid = uid;
    this.uiManager.setAuthScreenState({
      preparingAccount: true,
      errorMessage: null,
      preparedAccount: null,
    });

    const runPrepare = async () => {
      try {
        const result = await this.firebasePlayerService.initializeAuthenticatedAccount({
          user,
          platform: this.rankedApi.getPlatform(),
          guestCredentials: null,
          fallbackVault: this.shopManager.exportVaultState(),
          fallbackAccountSnapshot: this.playerProfileManager.getSnapshot(),
          fallbackCloudState: this.buildCloudStatePayload(),
        });

        if (this.isDisposed || this.firebaseAuthService.getCurrentUser()?.uid !== uid) {
          return;
        }

        this.preparedAuthSession = {
          uid,
          profile: result.profile,
          secretToken: result.secretToken,
          vault: result.vault,
          isDeveloper: Boolean(result.isDeveloper && result.profile.isDeveloper),
        };

        this.uiManager.setAuthScreenState({
          preparingAccount: false,
          errorMessage: null,
          preparedAccount: {
            uid,
            username: result.profile.name,
            playerId: result.profile.playerId,
            numericId: result.profile.numericId || result.profile.playerId,
          },
        });
      } catch (err) {
        if (this.isDisposed) return;
        this.preparedAuthSession = null;
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to verify your NEXUS ROYAL ID and Player ID.';
        this.uiManager.setAuthScreenState({
          preparingAccount: false,
          preparedAccount: null,
          errorMessage: msg,
        });
      } finally {
        this.preparingAuthPromise = null;
        this.preparingAuthUid = null;
      }
    };

    this.preparingAuthPromise = runPrepare();
    await this.preparingAuthPromise;
  }

  private cancelLoginLoadingToAuth(): void {
    this.loginAttemptNonce++;
    this.loginLoadingActive = false;
    this.authScreenEnteringLobby = false;
    this.hasCompletedPreLobbyLogin = false;
    this.uiManager.stopPostLoginLoading();
    this.firebaseFriendsService.stop();
    this.firebasePartyService.stop();
    if (this.rankedNetwork.state === 'connected') {
      this.rankedNetwork.disconnect();
    }
    this.rankedAuthReady = false;
    this.lobbyPresencePromise = null;
    this.firebaseActiveUid = null;
    this.latestFirebaseIdToken = null;
    this.rankedApi.setFirebaseIdToken(null);
    this.localRankedPlayerId = null;
    this.characterManager.unlockSystem.setDeveloperAccess(false);
    this.shopManager.setDeveloperMode(false);
    this.playerProfileManager.setDeveloperVerified(false);
    this.uiManager.showScreen('auth');
  }

  private async enterLobbyFromAuthScreen(): Promise<void> {
    if (this.isDisposed || this.authScreenEnteringLobby) return;

    const rawUser = this.firebaseAuthService.getCurrentUser();
    if (!rawUser || !rawUser.emailVerified) {
      this.loginAttemptNonce++;
      this.loginLoadingActive = false;
      this.hasCompletedPreLobbyLogin = false;
      this.preparedAuthSession = null;
      this.uiManager.stopPostLoginLoading();
      this.uiManager.setAuthScreenState({
        enteringLobby: false,
        preparedAccount: null,
        errorMessage: i18n.t('auth.errAuthRequired'),
      });
      if (this.uiManager.getCurrentScreen() !== 'auth') {
        this.uiManager.showScreen('auth');
      }
      return;
    }

    const uid = rawUser.uid;
    const attemptId = ++this.loginAttemptNonce;
    this.authScreenEnteringLobby = true;
    this.loginLoadingActive = true;
    this.hasCompletedPreLobbyLogin = false;
    this.uiManager.setAuthScreenState({
      enteringLobby: false,
      errorMessage: null,
    });

    // Immediately enter the dedicated 5-second post-LOGIN loading screen
    this.uiManager.showScreen('login-loading');
    this.uiManager.startPostLoginLoading(() => {
      if (
        this.isDisposed ||
        attemptId !== this.loginAttemptNonce ||
        !this.loginLoadingActive
      ) {
        return;
      }
      const activeUser = this.firebaseAuthService.getCurrentUser();
      if (!activeUser || !activeUser.emailVerified || activeUser.uid !== uid) {
        this.loginLoadingActive = false;
        this.authScreenEnteringLobby = false;
        this.hasCompletedPreLobbyLogin = false;
        this.uiManager.showScreen('auth');
        return;
      }
      this.loginLoadingActive = false;
      this.authScreenEnteringLobby = false;
      this.hasCompletedPreLobbyLogin = true;
      this.uiManager.showScreen('main-menu');
    });

    const isAttemptStillActive = () =>
      !this.isDisposed &&
      attemptId === this.loginAttemptNonce &&
      this.loginLoadingActive &&
      this.firebaseAuthService.getCurrentUser()?.uid === uid;

    try {
      // 1. Verify Firebase authentication session & fresh token
      this.uiManager.setPostLoginLoadingStage(i18n.t('loginLoad.stage.session'));
      const freshToken = await this.firebaseAuthService.getIdToken(true);
      if (!isAttemptStillActive()) return;
      if (!freshToken || !this.firebaseAuthService.getCurrentUser()?.emailVerified) {
        this.preparedAuthSession = null;
        this.latestFirebaseIdToken = null;
        this.rankedApi.setFirebaseIdToken(null);
        throw new Error(i18n.t('auth.errSessionExpired'));
      }
      this.latestFirebaseIdToken = freshToken;
      this.rankedApi.setFirebaseIdToken(freshToken);

      // 2. Load & verify permanent Player ID, profile, avatar, banner, level & XP
      this.uiManager.setPostLoginLoadingStage(i18n.t('loginLoad.stage.profile'));
      const currentUser = this.firebaseAuthService.getCurrentUser()!;
      const result = await this.firebasePlayerService.initializeAuthenticatedAccount({
        user: currentUser,
        platform: this.rankedApi.getPlatform(),
        guestCredentials: null,
        fallbackVault: this.shopManager.exportVaultState(),
        fallbackAccountSnapshot: this.playerProfileManager.getSnapshot(),
        fallbackCloudState: this.buildCloudStatePayload(),
      });
      if (!isAttemptStillActive()) return;

      const resolvedAvatarId =
        result?.profile?.equippedAvatarId || result?.vault?.equippedAvatarId;
      const resolvedBannerId =
        result?.profile?.equippedBannerId || result?.vault?.equippedBannerId;

      if (
        !result?.profile?.playerId ||
        !resolvedAvatarId ||
        !resolvedBannerId ||
        typeof result.profile.level !== 'number' ||
        typeof result.profile.xp !== 'number'
      ) {
        throw new Error(i18n.t('loginLoad.errDataLoad'));
      }

      const isVerifiedDeveloper = Boolean(
        result.isDeveloper && result.profile.isDeveloper,
      );

      this.preparedAuthSession = {
        uid,
        profile: result.profile,
        secretToken: result.secretToken,
        vault: result.vault,
        isDeveloper: isVerifiedDeveloper,
      };
      this.uiManager.setAuthScreenState({
        preparingAccount: false,
        errorMessage: null,
        preparedAccount: {
          uid,
          username: result.profile.name,
          playerId: result.profile.playerId,
          numericId: result.profile.numericId || result.profile.playerId,
        },
      });

      this.firebaseActiveUid = uid;
      this.localRankedPlayerId = result.profile.playerId;

      this.rankedApi.setAuthenticatedSession(
        {
          playerId: result.profile.playerId,
          secretToken: result.secretToken,
        },
        result.profile,
      );

      this.characterManager.unlockSystem.setDeveloperAccess(isVerifiedDeveloper);
      this.shopManager.setDeveloperMode(isVerifiedDeveloper);
      this.playerProfileManager.setDeveloperVerified(isVerifiedDeveloper);

      if (this.cloudStateHydratedUid !== uid) {
        this.applyCloudStatePayload(result.cloudState);
        this.cloudStateHydratedUid = uid;
      }

      const accountSnap = this.playerProfileManager.applyCloudProfile(result.profile);
      this.shopManager.applyCloudVaultState(result.vault);
      this.syncSelectedCharacterAppearance();
      this.uiManager.rankedScreen.setProfile(result.profile);
      this.uiManager.updatePlayerProfile(accountSnap, this.r6Customization);
      this.syncSettingsAccountInfo();
      this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
      this.syncLobbyWeaponFromShop(false);
      this.militaryLobby.setShopAccent(this.shopManager.getActiveBeaconHex());

      // 3. Synchronize real-time friends list & online presence from Cloud Firestore (non-blocking on offline fallback)
      this.uiManager.setPostLoginLoadingStage(i18n.t('loginLoad.stage.friends'));
      try {
        await this.firebaseFriendsService.startAndAwaitInitialSync(
          uid,
          {
            playerId: result.profile.playerId,
            numericId: result.profile.numericId || result.profile.playerId,
            platform: this.rankedApi.getPlatform(),
          },
          (friendsSnap) => {
            if (this.firebaseActiveUid !== uid) return;
            this.applyFriendsSnapshotState(friendsSnap);
          },
        );
      } catch {
        // Keep lobby entry non-blocking if transient friends sync fails
      }
      if (!isAttemptStillActive()) return;

      this.firebasePartyService.start(
        uid,
        {
          uid,
          playerId: result.profile.playerId,
          numericId: result.profile.numericId || result.profile.playerId,
          username: result.profile.name,
          avatarId: resolvedAvatarId,
          level: result.profile.level,
          tier: result.profile.tier,
        },
        {
          onIncomingInvitesChanged: (cloudInvites) => {
            if (this.firebaseActiveUid !== uid) return;
            if (cloudInvites.length > 0 && (!this.lobbySquadState?.squadId || this.lobbySquadState.members.length <= 1)) {
              const latest = cloudInvites[0];
              if (latest && latest.fromPlayerId !== this.localRankedPlayerId) {
                this.uiManager.setMainMenuIncomingSquadInvite(latest);
              }
            }
          },
        },
      );
      this.syncFirebasePresenceStatus();

      // 4. Attempt online services & multiplayer WebSocket connection without blocking lobby entry
      this.uiManager.setPostLoginLoadingStage(i18n.t('loginLoad.stage.services'));
      if (this.rankedNetwork.state === 'connected') {
        this.rankedNetwork.disconnect();
      }
      this.rankedAuthReady = false;
      this.lobbyPresencePromise = null;
      await connectRankedPresenceNonBlocking({
        ensureLobbyPresenceConnected: () => this.ensureLobbyPresenceConnected(),
        isStillActive: () => isAttemptStillActive(),
        onConnected: () => {
          this.uiManager.rankedScreen.setConnectionState(
            this.rankedNetwork.state,
            this.rankedNetwork.getRttMs(),
          );
          void this.refreshMailboxState();
        },
        onDisconnected: () => {
          this.rankedAuthReady = false;
          this.uiManager.rankedScreen.setConnectionState(
            this.rankedNetwork.state,
            this.rankedNetwork.getRttMs(),
          );
        },
        markLobbyReady: () => {
          this.uiManager.markPostLoginDataReady();
        },
      });
    } catch (err) {
      if (this.isDisposed || attemptId !== this.loginAttemptNonce) return;
      this.hasCompletedPreLobbyLogin = false;
      this.authScreenEnteringLobby = false;
      this.firebaseFriendsService.stop();
      this.firebasePartyService.stop();
      if (this.rankedNetwork.state === 'connected') {
        this.rankedNetwork.disconnect();
      }
      this.rankedAuthReady = false;
      this.lobbyPresencePromise = null;

      const msg =
        err instanceof Error && err.message
          ? err.message
          : i18n.t('loginLoad.errDataLoad');
      this.uiManager.failPostLoginLoading(msg);
    }
  }

  private async handleFirebaseSignedOut(): Promise<void> {
    if (this.isDisposed) return;
    if (this.firebasePublicSyncTimer) {
      clearTimeout(this.firebasePublicSyncTimer);
      this.firebasePublicSyncTimer = 0;
    }
    if (this.vaultSyncTimer) {
      clearTimeout(this.vaultSyncTimer);
      this.vaultSyncTimer = 0;
    }
    if (this.cloudStateSyncTimer) {
      clearTimeout(this.cloudStateSyncTimer);
      this.cloudStateSyncTimer = 0;
    }

    this.loginAttemptNonce++;
    this.loginLoadingActive = false;
    this.authScreenEnteringLobby = false;
    this.hasCompletedPreLobbyLogin = false;
    this.uiManager.stopPostLoginLoading();
    this.preparedAuthSession = null;
    this.firebaseActiveUid = null;
    this.cloudStateHydratedUid = null;
    this.latestFirebaseIdToken = null;
    this.rankedApi.setFirebaseIdToken(null);
    this.firebaseFriendsService.stop();
    this.firebasePartyService.stop();
    this.rankedApi.clearCredentials();
    this.localRankedPlayerId = null;

    this.applyFriendsSnapshotState({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      outgoingTargetIds: [],
    });
    this.applyMailboxState({
      messages: [],
      unreadCount: 0,
      unclaimedRewardCount: 0,
    });

    this.controlSettings.resetAllToDefaults();
    this.characterManager.unlockSystem.setDeveloperAccess(false);
    this.characterManager.unlockSystem.resetToDefaults();
    resetR6CustomizationStorage();
    this.r6Customization = loadR6Customization();
    this.shopManager.setDeveloperMode(false);
    this.shopManager.resetToGuestDefaultVault();
    this.playerProfileManager.setDeveloperVerified(false);
    const resetSnap = this.playerProfileManager.resetToGuestAccount();
    this.syncSelectedCharacterAppearance();
    this.uiManager.updatePlayerProfile(resetSnap, this.r6Customization);
    this.uiManager.setSettingsAccountInfo(null);
    this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
    this.syncLobbyWeaponFromShop(false);
    this.militaryLobby.setShopAccent(this.shopManager.getActiveBeaconHex());

    if (this.rankedNetwork.state === 'connected') {
      this.rankedNetwork.disconnect();
    }
    this.rankedAuthReady = false;
    this.lobbyPresencePromise = null;
    this.lobbySquadSize = 1;
    this.lobbySquadState = this.buildLocalFallbackSquadState(1);
    this.uiManager.setMainMenuSquadSize(1);
    this.uiManager.setMainMenuSquadState(this.lobbySquadState);
    this.uiManager.setAuthScreenState({
      preparingAccount: false,
      enteringLobby: false,
      preparedAccount: null,
    });

    const cur = this.uiManager.getCurrentScreen();
    if (cur !== 'auth' && cur !== 'loading') {
      this.uiManager.showScreen('auth');
    }
  }

  private syncLobbyBackground(screen: ScreenId): void {
    const lobbyBg = document.getElementById('lobby-bg');
    if (lobbyBg) {
      const visible = screen === 'main-menu';
      lobbyBg.classList.toggle('hidden', !visible);
      lobbyBg.style.display = visible ? 'block' : 'none';
    }
  }

  private handleScreenChange(screen: ScreenId): void {
    if (screen === 'login-loading' && !this.canAccessLoginLoadingScreen()) {
      this.uiManager.showScreen('auth');
      return;
    }
    if (
      screen !== 'loading' &&
      screen !== 'auth' &&
      screen !== 'login-loading' &&
      !this.canAccessGameScreens()
    ) {
      this.uiManager.showScreen('auth');
      return;
    }

    this.syncLobbyBackground(screen);
    this.inputManager.clearJustPressed();
    this.stopActiveEmote(false);
    this.uiManager.closeEmoteWheel();
    if (screen !== 'test-arena') {
      this.inputManager.setWeaponScrollSwitchEnabled(false);
    }

    if (
      this.matchMode === 'ranked' &&
      screen !== 'test-arena' &&
      screen !== 'control-editor' &&
      screen !== 'settings'
    ) {
      this.cleanupRankedMatch(true);
    } else if (
      this.matchMode === 'battle-royale' &&
      screen !== 'test-arena' &&
      screen !== 'control-editor' &&
      screen !== 'settings'
    ) {
      this.cleanupBattleRoyaleMatch();
    }

    if (screen !== 'ranked') {
      this.stopRankedStatusPoll();
    }
    if (screen !== 'main-menu' && this.isRankedQueuingFromLobby && screen !== 'test-arena') {
      this.cancelMainMenuRankedQueue();
    }

    switch (screen) {
      case 'loading':
        this.phaseState = 'loading';
        this.inputManager.setEnabled(false);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.setPointerLockAllowed(false);
        break;
      case 'auth':
      case 'login-loading':
        this.arenaPausedForOverlay = false;
        this.phaseState = 'menu';
        this.inputManager.setEnabled(false);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.resetCursorVisibleOverride();
        this.inputManager.setPointerLockAllowed(false);
        break;
      case 'main-menu':
        this.arenaPausedForOverlay = false;
        this.phaseState = 'menu';
        this.inputManager.setEnabled(true);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.resetCursorVisibleOverride();
        this.inputManager.setPointerLockAllowed(false);
        this.syncSelectedCharacterAppearance();
        this.enterLobbyScene();
        this.cameraManager.setPreset('menu-orbit', true);
        this.syncLobbySquadVisuals(true);
        void this.ensureLobbyPresenceConnected();
        break;
      case 'map-select':
      case 'battle-royale':
        this.phaseState = 'menu';
        this.inputManager.setEnabled(true);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.setPointerLockAllowed(false);
        this.syncSelectedCharacterAppearance();
        this.enterLobbyScene();
        this.militaryLobby.setSquadStageVisible(false);
        this.cameraManager.setPreset('menu-orbit', true);
        this.cameraManager.setLobbySquadCount(1, true);
        break;
      case 'ranked':
        this.phaseState = 'menu';
        this.inputManager.setEnabled(true);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.setPointerLockAllowed(false);
        this.syncSelectedCharacterAppearance();
        this.enterLobbyScene();
        this.uiManager.setArenaCrosshairEnemyTargeted(false);
        this.militaryLobby.setSquadStageVisible(false);
        this.cameraManager.setPreset('menu-orbit', true);
        this.cameraManager.setLobbySquadCount(1, true);
        void this.enterRankedScreen();
        break;
      case 'characters':
        this.phaseState = 'menu';
        this.inputManager.setEnabled(true);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.setPointerLockAllowed(false);
        this.syncSelectedCharacterAppearance();
        this.enterLobbyScene();
        this.militaryLobby.setSquadStageVisible(false);
        this.cameraManager.setPreset('characters-showcase', true);
        this.cameraManager.setLobbySquadCount(1, true);
        break;
      case 'pets':
        this.phaseState = 'menu';
        this.inputManager.setEnabled(true);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.setPointerLockAllowed(false);
        this.syncSelectedCharacterAppearance();
        this.enterLobbyScene();
        this.militaryLobby.setSquadStageVisible(false);
        this.cameraManager.setPreset('pets-showcase', true);
        this.cameraManager.setLobbySquadCount(1, true);
        break;
      case 'shop':
      case 'vault':
        this.phaseState = 'menu';
        this.inputManager.setEnabled(true);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.resetCursorVisibleOverride();
        this.inputManager.setPointerLockAllowed(false);
        this.syncSelectedCharacterAppearance();
        this.enterLobbyScene();
        this.militaryLobby.setSquadStageVisible(false);
        this.militaryLobby.setShopAccent(this.shopManager.getActiveBeaconHex());
        this.cameraManager.setPreset('shop-showcase', true);
        this.cameraManager.setLobbySquadCount(1, true);
        void this.ensureRemainingWeaponGlbs(6);
        break;
      case 'settings':
      case 'control-editor':
        this.cancelManualGlooPreview(false);
        if (this.phaseState === 'test-arena') {
          this.arenaPausedForOverlay = true;
        }
        this.phaseState = 'paused';
        this.inputManager.setEnabled(false);
        this.inputManager.setSuppressGameKeys(false);
        this.inputManager.setPointerLockAllowed(false);
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
        this.audioManager.setAirborneAudio('inactive', 0);
        break;
      case 'test-arena': {
        if (this.deviceProfile.isMobile || this.deviceProfile.isTablet) {
          void tryLockLandscapeFullscreen(false);
        }
        const resumingFromOverlay = this.arenaPausedForOverlay;
        this.arenaPausedForOverlay = false;
        this.phaseState = 'test-arena';
        this.inputManager.setEnabled(true);
        this.inputManager.setSuppressGameKeys(true);
        this.arenaCameraMode = 'PLAYER';
        this.uiManager.setArenaCameraModeLabel('PLAYER');
        if (this.matchMode === 'practice' && !resumingFromOverlay) {
          this.syncUnlimitedAmmoMode();
          this.inputManager.resetCursorVisibleOverride();
          this.practiceKills = 0;
          this.practiceGlooRespawnAccum = 0;
          this.glooWallManager.clearAll();
          this.damageNumberSystem.clear();
          this.eliminationEffectSystem.clearAll();
          if (
            !this.mapManager.hasActiveMap() ||
            !this.mapManager.getActiveConfig().isTrainingGround
          ) {
            this.mapManager.loadTrainingGround();
          }
          this.safeZoneManager.setActive(false);
          this.mapManager.setRankedZoneState(null);
          this.uiManager.setArenaHudMode('practice');
          this.uiManager.setArenaKillsCounter(0);
          this.uiManager.resetArenaOverlays();
          this.weaponManager.setPracticeTargetsVisible(true, 'training-ground');
          this.enterArenaScene();
          this.beginMatchDrop(this.createRandomMatchSeed());
          this.uiManager.showArenaToast(
            i18n.t('toast.practiceMode', { map: i18n.translateMapName('training_ground') }),
          );
        } else if (resumingFromOverlay) {
          this.uiManager.onControlSettingsChange(this.responsiveManager.getMetrics());
          this.syncArenaPointerLock(true);
        }
        break;
      }
    }

    this.syncOrientationInputGuard();
    this.syncLobbyMusicState();
  }

  private syncLobbyMusicState(): void {
    const screen = this.uiManager.getCurrentScreen();
    const inLobby =
      screen !== 'auth' &&
      screen !== 'login-loading' &&
      screen !== 'loading' &&
      (this.phaseState === 'menu' ||
        (this.phaseState === 'paused' && !this.arenaPausedForOverlay));
    const inGameplay = screen === 'test-arena' || this.arenaPausedForOverlay;
    if (inLobby && !inGameplay) {
      this.audioManager.startLobbyMusic();
    } else {
      this.audioManager.stopLobbyMusic();
    }
  }

  private syncUnlimitedAmmoMode(): void {
    const unlimited = this.matchMode === 'practice';
    this.weaponManager.setUnlimitedAmmo(unlimited);
    this.inventoryManager.setUnlimitedAmmo(unlimited);
  }

  private createRandomMatchSeed(): number {
    return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  }

  private beginMatchDrop(matchSeed: number): void {
    const cfg = this.mapManager.getActiveConfig();
    const spawn = this.mapManager.spawnPointManager.getPrimarySpawn();

    this.playerCamera.setWaitingPitchClamp(false);
    this.player.movement.clearMovementModes();
    this.characterManager.resetForArena();
    this.lootManager.spawnForMapPoints(
      this.mapManager.getCombinedLootPoints(),
      spawn,
      matchSeed,
    );
    this.cancelManualGlooPreview(false);
    this.glooConfirmFireSuppress = false;
    this.glooWallManager.clearAll();
    this.damageNumberSystem.clear();
    this.eliminationEffectSystem.clearAll();

    if (this.matchMode === 'practice') {
      this.practiceKills = 0;
      this.practiceGlooRespawnAccum = 0;
      this.uiManager.setArenaKillsCounter(0);
      if (cfg.isTrainingGround) {
        for (const rack of TRAINING_GROUND_WEAPON_RACKS) {
          this.lootManager.spawnDroppedItem(
            rack.itemId,
            rack.x,
            rack.z,
            rack.count ?? 1,
            {},
            0.6,
          );
        }
      } else {
        const sampleDrops: Array<[string, number, number]> = [
          ['weapon_m4a1', 2.4, -2.0],
          ['weapon_ak24', 3.6, -2.0],
          ['weapon_parafal', 4.8, -2.0],
          ['weapon_awm', 2.4, -3.4],
          ['weapon_kar98k', 3.6, -3.4],
          ['weapon_m1014', 4.8, -3.4],
          ['weapon_m1887', 6.0, -3.4],
          ['weapon_desert_eagle', 2.4, -4.8],
          ['weapon_glock', 3.6, -4.8],
          ['weapon_combat_knife', 4.8, -4.8],
          ['weapon_baseball_bat', 6.0, -4.8],
          ['ammo_ar', 2.4, -6.1],
          ['ammo_sniper', 3.6, -6.1],
          ['ammo_shotgun', 4.8, -6.1],
          ['ammo_pistol', 6.0, -6.1],
        ];
        for (const [id, ox, oz] of sampleDrops) {
          this.lootManager.spawnDroppedItem(
            id,
            spawn.x + ox,
            spawn.z + oz,
            1,
          );
        }
      }
    }
    this.weaponManager.syncEnvironmentMeshes();
    this.weaponManager.resetArenaLoadout();
    this.inventoryManager.resetStarterLoadout(this.matchMode === 'practice' ? 3 : 2);

    this.inputManager.clearJustPressed();
    if (this.matchMode === 'practice' && cfg.isTrainingGround) {
      this.airplaneDropManager.spawnGroundedAtPrimary(cfg);
      const dropSnap = this.airplaneDropManager.getSnapshot();
      // Face camera North toward Armory Welcome Bench, Training Ground Arch & Container Yard
      this.playerCamera.setAirborneAngles(this.player.rotation.y + Math.PI, 0.16);
      this.playerCamera.snapToPlayer(this.player.position);
      this.syncArenaPointerLock(true);
      this.minimapAccum = 1;
      this.rangefinderAccum = 0.2;
      this.lastRangeMeters = null;
      this.lastAirbornePhase = 'landed';
      this.mapManager.setAirborneFogScale(1.0);
      this.uiManager.setActiveMapName(cfg.name, cfg.id, true);
      this.uiManager.syncArenaAirdrop(dropSnap);
      return;
    }

    this.airplaneDropManager.startMatchDrop(cfg, matchSeed);
    const dropSnap = this.airplaneDropManager.getSnapshot();

    this.playerCamera.setAirborneAngles(dropSnap.airplaneHeadingRad + Math.PI, 0.36);
    this.airborneCamTarget.set(dropSnap.airplaneX, dropSnap.airplaneY, dropSnap.airplaneZ);
    this.playerCamera.snapToPlayer(this.airborneCamTarget);

    // Keep desktop cursor unlocked inside the airplane so the JUMP button is directly clickable
    this.inputManager.setPointerLockAllowed(false);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }

    this.minimapAccum = 1;
    this.rangefinderAccum = 0.2;
    this.lastRangeMeters = null;
    this.lastAirbornePhase = '';
    this.mapManager.setAirborneFogScale(0.42);
    this.uiManager.setActiveMapName(cfg.name, cfg.id);
    this.uiManager.syncArenaAirdrop(dropSnap);
  }

  private lastGraphicsKey = '';

  private isTouchGameplayActive(): boolean {
    return (
      this.deviceProfile.isMobile ||
      this.deviceProfile.isTablet ||
      this.uiManager.isTouchControlsActive()
    );
  }

  private applyGraphicsQuality(settings: GameSettings): void {
    const q = settings.graphics.quality;
    const shadowsEnabled =
      !this.rendererManager.isSoftwareGl && settings.graphics.shadowsEnabled;
    const inLobby = !this.mapManager.root.visible;
    const gKey = `${q}:${shadowsEnabled ? 1 : 0}:${settings.graphics.pixelRatioCap}:${settings.graphics.fpsLimit}:${inLobby ? 0 : 1}`;
    if (this.lastGraphicsKey === gKey) return;
    this.lastGraphicsKey = gKey;

    const farClip = inLobby ? 360 : q === 'low' ? 920 : q === 'medium' ? 1300 : 2000;
    const shadowInterval: 1 | 2 =
      !shadowsEnabled || (q === 'high' && settings.graphics.fpsLimit <= 60 && !inLobby)
        ? 1
        : 2;

    this.rendererManager.applyGraphicsSettings(settings.graphics, this.sceneManager.scene);
    this.rendererManager.setShadowCadence(shadowInterval);
    this.sceneManager.applyQualityProfile(q, shadowsEnabled, this.isCompactDevice, inLobby);
    this.playerCamera.setFarClip(farClip);
    this.cameraManager.setFarClip(farClip);
    this.mapManager.setQualityPreset(q, shadowsEnabled);
    this.lootManager.setQualityPreset(q);
    this.weaponManager.setQualityPreset(q);
    this.battleRoyaleManager.setQualityPreset(q, shadowsEnabled);
    this.remotePlayerManager.setQualityPreset(q, shadowsEnabled);

    if (inLobby) {
      this.militaryLobby.applyAtmosphere(this.sceneManager);
      this.sceneManager.applyQualityProfile(q, shadowsEnabled, this.isCompactDevice, true);
    } else if (this.airplaneDropManager.isAirborne()) {
      this.mapManager.setAirborneFogScale(0.42);
    }
  }

  private enterLobbyScene(): void {
    if (this.phaseState !== 'loading') {
      this.previewRenderer.setPaused(false);
    }
    this.airplaneDropManager.deactivate();
    this.airplaneDropManager.root.visible = false;
    this.playerController.forceExitScope();
    this.playerCamera.resetScope();
    this.playerCamera.resetRecoil();
    this.aimAssistSystem.reset();
    this.playerCamera.setAimAssistLockActive(false);
    this.player.visuals.root.visible = true;
    this.gameplayCompanion.root.visible = false;
    this.gameplayCompanionSnapped = false;
    this.mapManager.setAirborneFogScale(1.0);
    this.militaryLobby.root.visible = true;
    this.mapManager.root.visible = false;
    this.lootManager.root.visible = false;
    this.weaponManager.root.visible = false;
    this.cancelManualGlooPreview(false);
    this.glooWallManager.clearAll();
    this.damageNumberSystem.clear();
    this.eliminationEffectSystem.clearAll();
    // Unload heavyweight combat map & loot when returning to Lobby to free RAM/VRAM
    if (this.mapManager.hasActiveMap()) {
      this.mapManager.unloadMap();
      this.lootManager.clearAll();
      this.weaponManager.syncEnvironmentMeshes();
    }
    this.militaryLobby.applyAtmosphere(this.sceneManager);
    this.applyGraphicsQuality(this.settingsManager.getSettings());
    this.rendererManager.invalidateShadowMap();
    this.militaryLobby.setPetKind(this.r6Customization.petId);
    this.player.setArenaGearVisuals(null, null, null);
    this.player.reset(0, 0);
    this.player.position.set(0, 0, 0);
    this.player.rotation.set(0, 0, 0);
    this.player.setLobbyMode(true);
    this.player.setIsAiming(false);
    this.inventoryManager.clear();
    this.weaponManager.setEquippedWeaponSkins(this.shopManager.getEquippedWeaponSkins());
    this.weaponManager.enterLobbyMode(this.shopManager.getEquippedLobbyWeaponId());
  }

  private getResolvedCustomizationForCharacter(character?: CharacterDefinition): R6Customization {
    const target = character ?? this.characterManager.getSelectedCharacter();
    const presetApp = getR6CharacterPreset(target.model.humanModelId).appearance;
    return resolveCharacterCustomization(target.id, presetApp, this.r6Customization);
  }

  private syncSelectedCharacterAppearance(): void {
    const selected = this.characterManager.getSelectedCharacter();
    const resolved = this.getResolvedCustomizationForCharacter(selected);
    this.r6Customization = resolved;
    saveR6Customization(resolved);
    this.shopManager.setCurrentCustomization(resolved);
    this.characterManager.applySelectedToPlayer();
    this.player.setCustomization(resolved);
    this.militaryLobby.setPetKind(resolved.petId);
    this.gameplayCompanion.setKind(resolved.petId);
  }

  private enterArenaScene(): void {
    this.audioManager.stopLobbyMusic();
    // Pause & release preview thumbnail renderer + PMREM before combat starts
    this.previewRenderer.setPaused(true);
    this.previewRenderer.releaseGpuResources();
    this.militaryLobby.root.visible = false;
    this.mapManager.root.visible = true;
    this.lootManager.root.visible = true;
    this.weaponManager.root.visible = true;
    this.airplaneDropManager.root.visible = true;
    this.syncSelectedCharacterAppearance();
    this.player.visuals.ensureAllAnimationClipsBound();
    void this.ensureRemainingWeaponGlbs(6);
    this.autoSpinEnabled = false;
    this.player.resetPreviewYaw();
    this.player.setLobbyMode(false);
    this.weaponManager.exitLobbyMode();
    this.gameplayCompanion.setKind(this.r6Customization.petId);
    this.gameplayCompanionSnapped = false;
    this.applyGraphicsQuality(this.settingsManager.getSettings());
    this.rendererManager.invalidateShadowMap();
    this.mapManager.reapplyBiomeEnvironment();
  }

  private restartArenaMatch(): void {
    if (this.matchMode === 'ranked') return;
    if (this.matchMode === 'battle-royale') {
      this.startBattleRoyaleMatch(this.activeBattleRoyaleConfig);
      return;
    }
    this.mapManager.loadTrainingGround();
    this.weaponManager.setPracticeTargetsVisible(true, 'training-ground');
    this.beginMatchDrop(this.createRandomMatchSeed());
    this.uiManager.showArenaToast(
      i18n.t('toast.practiceMode', { map: i18n.translateMapName('training_ground') }),
    );
  }

  private handleMainMenuStartPressed(): void {
    if (this.waitingLobbyTransitionActive || this.uiManager.isWaitingLobbyLoadingActive()) {
      return;
    }
    const mapId = this.settingsManager.getSettings().selectedMapId;
    const inParty = Boolean(this.lobbySquadState?.squadId);
    if (inParty && this.lobbySquadState) {
      const selfMember = this.lobbySquadState.members.find(
        (m) => m.isSelf || (this.localRankedPlayerId !== null && m.playerId === this.localRankedPlayerId),
      );
      const isSelfLeader = selfMember ? selfMember.isLeader : true;
      if (!isSelfLeader) {
        this.uiManager.showLobbyToast(i18n.t('toast.onlyLeaderCanStart'), 'error');
        return;
      }
      const humanMembers = this.lobbySquadState.members.filter((m) => !m.isBotAlly);
      const allReady = humanMembers.every(
        (m) => (m.status ?? (m.ready ? 'ready' : 'not-ready')) === 'ready',
      );
      if (!allReady) {
        this.uiManager.showLobbyToast(i18n.t('toast.mustBeReady'), 'error');
        return;
      }
      if (this.selectedLobbyMode === 'battle-royale' && humanMembers.length > 1) {
        if (this.rankedNetwork.state !== 'connected' || !this.rankedAuthReady) {
          this.uiManager.showLobbyToast(i18n.t('ranked.wsUnavailable'), 'error');
          return;
        }
        this.rankedNetwork.startSquadBattleRoyale({
          mapId,
          botCount: this.activeBattleRoyaleConfig.botCount,
          difficulty: this.activeBattleRoyaleConfig.difficulty,
          squadSize: this.lobbySquadSize,
        });
        return;
      }
    }

    if (this.selectedLobbyMode === 'ranked') {
      void this.startRankedQueueFromMainMenu(mapId);
      return;
    }
    if (this.selectedLobbyMode === 'practice') {
      this.cleanupRankedMatch(false);
      this.battleRoyaleManager.clearMatch();
      this.matchMode = 'practice';
      this.syncUnlimitedAmmoMode();
      this.audioManager.playDeploy();
      this.uiManager.showScreen('test-arena');
      return;
    }
    this.beginWaitingLobbyEntry({
      ...this.activeBattleRoyaleConfig,
      mapId,
      squadSize: this.lobbySquadSize,
      squadAllies: this.buildBattleRoyaleSquadAllies(),
    });
  }

  private buildBattleRoyaleSquadAllies(): SquadFillMemberPreset[] {
    const members = this.lobbySquadState?.members;
    if (!members || members.length <= 1) return [];
    const allies: SquadFillMemberPreset[] = [];
    for (const m of members) {
      if (m.isSelf || (this.localRankedPlayerId && m.playerId === this.localRankedPlayerId)) {
        continue;
      }
      allies.push({
        playerId: m.playerId,
        name: m.name,
        characterId: m.characterId,
        customization: { ...m.customization },
      });
    }
    return allies;
  }

  private beginWaitingLobbyEntry(config: BattleRoyaleMatchConfig): void {
    if (
      this.isDisposed ||
      this.waitingLobbyTransitionActive ||
      this.uiManager.isWaitingLobbyLoadingActive()
    ) {
      return;
    }

    this.waitingLobbyTransitionActive = true;
    this.uiManager.setMainMenuStartLocked(true);
    this.audioManager.playDeploy();
    this.inputManager.setEnabled(false);
    this.inputManager.setSuppressGameKeys(false);
    this.inputManager.setPointerLockAllowed(false);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }

    const matchConfig: BattleRoyaleMatchConfig = { ...config };
    const started = this.uiManager.showWaitingLobbyLoading(
      i18n.translateMapName(matchConfig.mapId),
      () => {
        if (this.isDisposed) return;
        try {
          this.startBattleRoyaleMatch(matchConfig);
        } finally {
          this.waitingLobbyTransitionActive = false;
          this.uiManager.setMainMenuStartLocked(false);
        }
      },
    );

    if (!started) {
      this.waitingLobbyTransitionActive = false;
      this.uiManager.setMainMenuStartLocked(false);
    }
  }

  private async startRankedQueueFromMainMenu(preferredMap: RankedMapId): Promise<void> {
    this.isRankedQueuingFromLobby = true;
    const mapCfg = MAP_LIST.find((m) => m.id === preferredMap);
    const localizedMapName = i18n.translateMapName(mapCfg?.id ?? preferredMap);
    this.uiManager.setMainMenuRankedQueueState(true, {
      waitSec: 0,
      queuedPlayers: 1,
      mapName: localizedMapName,
      message: i18n.t('toast.connectingRanked', { map: localizedMapName }),
    });
    try {
      if (this.firebaseActiveUid && !this.rankedApi.hasBackendSessionToken()) {
        const refreshed = await this.tryRefreshFirebaseBackendSession();
        if (!refreshed) {
          throw new Error(i18n.t('ranked.wsUnavailable'));
        }
      } else {
        await this.rankedApi.ensureProfile();
      }
      await this.ensureRankedSocketConnected();
      if (!this.isRankedQueuingFromLobby) return;
      this.rankedNetwork.joinQueue({
        preferredMap,
        characterId: this.characterManager.getSelectedCharacter().id,
        customization: { ...this.r6Customization },
        avatarId: this.shopManager.getEquippedAvatarId(),
        bannerId: this.shopManager.getEquippedBannerId(),
        weaponSkins: this.shopManager.getEquippedWeaponSkins(),
      });
    } catch (err) {
      this.isRankedQueuingFromLobby = false;
      this.rankedAuthReady = false;
      this.uiManager.setMainMenuRankedQueueState(false);
      this.uiManager.rankedScreen.setConnectionState(
        this.rankedNetwork.state,
        this.rankedNetwork.getRttMs(),
      );
      this.uiManager.rankedScreen.setStatusBanner(
        err instanceof Error ? i18n.translateServerMessage(err.message) : i18n.t('ranked.unableQueue'),
      );
      this.uiManager.showScreen('ranked');
    }
  }

  private cancelMainMenuRankedQueue(): void {
    this.isRankedQueuingFromLobby = false;
    this.rankedNetwork.leaveQueue();
    this.uiManager.setMainMenuRankedQueueState(false);
  }

  private confirmMapSelection(mapId: MapId): void {
    this.activeBattleRoyaleConfig.mapId = mapId;
    this.settingsManager.update({ selectedMapId: mapId });
    this.switchMap(mapId);
    this.uiManager.setLobbyMapSelectionConfirmed(true);
    this.uiManager.showScreen('main-menu');
    this.scheduleCloudStateSync();
  }

  private switchMap(mapId: MapId): void {
    const inArena = this.uiManager.getCurrentScreen() === 'test-arena';
    if (inArena) return;

    const cfg = MAP_CONFIGS[mapId];
    this.uiManager.setActiveMapName(cfg.name, cfg.id);
  }

  private cycleNextMap(): void {
    // Dedicated Training Ground is isolated from Battle Royale maps
    return;
  }

  private syncArenaPointerLock(recaptureIfAllowed = false): void {
    const canLock =
      this.uiManager.getCurrentScreen() === 'test-arena' &&
      this.phaseState === 'test-arena' &&
      this.arenaCameraMode === 'PLAYER' &&
      !this.isTouchGameplayActive() &&
      this.airplaneDropManager.getPhase() !== 'airplane' &&
      !this.uiManager.isArenaInventoryOpen() &&
      !this.uiManager.isArenaFullMapOpen() &&
      !this.uiManager.isArenaSettingsOpen() &&
      !this.uiManager.isEmoteWheelOpen() &&
      !this.uiManager.isWeaponReplacePromptOpen() &&
      !(this.matchMode === 'battle-royale' && this.battleRoyaleManager.isLocalEliminated()) &&
      !(this.matchMode === 'ranked' && this.rankedEliminated);

    this.inputManager.setPointerLockAllowed(canLock);
    if (canLock && recaptureIfAllowed) {
      this.inputManager.recapturePointerLockIfAllowed();
    }
  }

  private toggleArenaCameraMode(): void {
    if (this.arenaCameraMode === 'PLAYER') {
      this.arenaCameraMode = 'ORBIT';
      this.inputManager.setPointerLockAllowed(false);
      this.cameraManager.setPreset('arena-orbit');
    } else {
      this.arenaCameraMode = 'PLAYER';
      this.syncArenaPointerLock(true);
      if (this.airplaneDropManager.getPhase() === 'airplane') {
        const dropSnap = this.airplaneDropManager.getSnapshot();
        this.airborneCamTarget.set(dropSnap.airplaneX, dropSnap.airplaneY, dropSnap.airplaneZ);
        this.playerCamera.snapToPlayer(this.airborneCamTarget);
      } else {
        this.playerCamera.snapToPlayer(this.player.position);
      }
    }
    this.uiManager.setArenaCameraModeLabel(this.arenaCameraMode);
  }

  private update(delta: number, elapsed: number): void {
    const screen = this.uiManager.getCurrentScreen();

    if (screen === 'main-menu') {
      if (
        !this.isRankedQueuingFromLobby &&
        (this.inputManager.consumeJustPressed('Enter') ||
          this.inputManager.consumeJustPressed('Space'))
      ) {
        this.handleMainMenuStartPressed();
      } else {
        this.inputManager.consumeJustPressed('Enter');
        this.inputManager.consumeJustPressed('Space');
      }
    } else if (
      screen === 'map-select' ||
      screen === 'battle-royale' ||
      screen === 'ranked' ||
      screen === 'characters' ||
      screen === 'pets' ||
      screen === 'shop' ||
      screen === 'settings' ||
      screen === 'test-arena'
    ) {
      if (this.inputManager.consumeJustPressed('Escape')) {
        if (screen === 'test-arena' && this.uiManager.isWeaponReplacePromptOpen()) {
          this.audioManager.playBack();
          this.uiManager.showWeaponReplacePrompt(null);
          this.syncArenaPointerLock(true);
        } else if (screen === 'test-arena' && this.uiManager.isEmoteWheelOpen()) {
          this.audioManager.playBack();
          this.uiManager.closeEmoteWheel();
        } else if (screen === 'test-arena' && this.uiManager.isArenaFullMapOpen()) {
          this.audioManager.playClick();
          this.uiManager.setArenaFullMapOpen(false);
        } else if (screen === 'test-arena' && this.uiManager.isArenaInventoryOpen()) {
          this.audioManager.playClick();
          this.uiManager.setArenaInventoryOpen(false);
        } else if (screen === 'test-arena' && this.uiManager.isArenaSettingsOpen()) {
          this.audioManager.playClick();
          this.uiManager.setArenaSettingsOpen(false);
        } else if (screen === 'test-arena' && this.glooManualPreviewActive) {
          this.cancelManualGlooPreview(true);
        } else {
          this.audioManager.playBack();
          this.uiManager.showScreen('main-menu');
        }
      }
    }

    if (this.phaseState === 'paused' || this.uiManager.isOrientationBlocked()) {
      return;
    }

    if (screen === 'test-arena') {
      if (this.inputManager.consumeJustPressed('KeyC')) {
        this.audioManager.playClick();
        this.toggleArenaCameraMode();
      }
      if (this.inputManager.consumeJustPressed('KeyB')) {
        if (this.uiManager.isEmoteWheelOpen()) {
          this.audioManager.playBack();
          this.uiManager.closeEmoteWheel();
        } else if (
          !this.uiManager.isArenaInventoryOpen() &&
          !this.uiManager.isArenaFullMapOpen() &&
          !this.uiManager.isArenaSettingsOpen() &&
          !this.uiManager.isWeaponReplacePromptOpen()
        ) {
          this.audioManager.playClick();
          this.openEmoteWheelForCurrentScreen();
        }
      }
    }

    if (this.militaryLobby.root.visible) {
      this.militaryLobby.update(delta, elapsed);
    }
    if (this.mapManager.root.visible) {
      this.mapManager.update(delta, elapsed);
      if (screen === 'test-arena') {
        this.mapManager.updateFrustum(
          this.arenaCameraMode === 'PLAYER' ? this.playerCamera.camera : this.cameraManager.camera,
        );
      }
    }
    if (this.lootManager.root.visible) {
      const lootCullPos =
        this.airplaneDropManager.getPhase() === 'airplane' ? undefined : this.player.position;
      this.lootManager.update(delta, elapsed, lootCullPos);
    }

    if (screen === 'test-arena' && this.arenaCameraMode === 'PLAYER') {
      if (this.airplaneDropManager.getPhase() === 'waiting') {
        this.airplaneDropManager.updateWaiting(delta);
      }

      if (this.matchMode === 'ranked') {
        const rankedDropPhase = this.airplaneDropManager.getPhase();
        if (rankedDropPhase !== 'waiting') {
          this.safeZoneManager.update(delta);
        }
        this.remotePlayerManager.update(
          delta,
          elapsed,
          this.player.position,
          this.isSphereInFrustumBound,
        );
        const rankedDanger =
          !this.rankedEliminated &&
          rankedDropPhase === 'landed' &&
          !this.safeZoneManager.isInsideSafeZone(this.player.position.x, this.player.position.z);
        if (rankedDropPhase === 'waiting') {
          this.uiManager.syncArenaWaitingBanner(
            this.airplaneDropManager.getSnapshot(),
            i18n.t('toast.realPlayersOnly'),
            Math.max(1, this.rankedWaitingParticipantCount || this.rankedAliveCount),
          );
        } else {
          this.uiManager.syncRankedHudMatchState(
            this.rankedAliveCount,
            this.rankedLocalKills,
            this.safeZoneManager.getServerZone(),
            rankedDanger,
          );
        }

        if (this.rankedEliminated) {
          this.inputManager.setWeaponScrollSwitchEnabled(false);
          this.player.visuals.root.visible = false;
          this.gameplayCompanion.root.visible = false;
          this.gameplayCompanionSnapped = false;
          if (this.inputManager.consumeActionJustPressed('minimap')) {
            this.uiManager.notifyArenaAction('minimap');
            this.minimapAccum = 1;
          }
          this.inputManager.consumeLookDelta(this.menuLookDelta);
          if (
            Math.abs(this.menuLookDelta.yaw) > 0.00001 ||
            Math.abs(this.menuLookDelta.pitch) > 0.00001
          ) {
            this.playerCamera.addLookDelta(this.menuLookDelta.yaw, this.menuLookDelta.pitch);
          }
          if (Math.abs(this.menuLookDelta.zoom) > 0.0001) {
            this.playerCamera.addZoomDelta(this.menuLookDelta.zoom);
          }
          const aliveTargetName = this.remotePlayerManager.getFirstAliveTargetPosition(
            this.spectatePos,
          );
          const rankedSpectatingAlly = this.remotePlayerManager.hasAliveTeammate();
          if (aliveTargetName && aliveTargetName !== this.spectateTargetName) {
            this.spectateTargetName = aliveTargetName;
            this.uiManager.showRankedSpectatorBanner(aliveTargetName, rankedSpectatingAlly);
          }
          const camFocus = aliveTargetName ? this.spectatePos : this.player.position;
          this.playerCamera.update(delta, camFocus, false, this.mapManager, false, false);
          this.mapManager.getActiveSafeZoneCenter(this.safeZoneCenterScratch);
          this.uiManager.syncArenaCompass(
            this.playerCamera.getYaw(),
            camFocus.x,
            camFocus.z,
            this.safeZoneCenterScratch.x,
            this.safeZoneCenterScratch.z,
          );
          this.uiManager.setArenaSquadmateStatuses(
            this.remotePlayerManager.getSquadmateHudStatuses(),
          );
          this.minimapAccum += delta;
          if (this.minimapAccum >= 0.055) {
            this.minimapAccum = 0;
            this.mapManager.setTeammateMarkers(this.remotePlayerManager.getTeammateMarkers());
            this.uiManager.syncArenaMinimap(
              this.mapManager.getMinimapSnapshot(
                camFocus.x,
                camFocus.z,
                this.playerCamera.getYaw(),
              ),
            );
          }
          const snapshot = this.player.getSnapshot();
          this.uiManager.syncPlayerStats(delta, snapshot);
          if (this.mapManager.root.visible) {
            this.mapManager.updateVisibilityAndLOD(
              this.playerCamera.camera,
              camFocus.x,
              camFocus.z,
            );
          }
          this.updateArenaCombatSystems(delta, this.playerCamera.camera, true);
          this.rendererManager.render(this.sceneManager.scene, this.playerCamera.camera);
          return;
        }

        this.stateSendAccum += delta;
        if (this.stateSendAccum >= 0.05) {
          this.stateSendAccum = 0;
          this.uploadLocalRankedState();
        }
      } else if (this.matchMode === 'battle-royale') {
        const brDropSnap = this.airplaneDropManager.getSnapshot();
        const isScopedBr =
          brDropSnap.phase === 'landed' &&
          !this.uiManager.isArenaInventoryOpen() &&
          !this.uiManager.isArenaFullMapOpen() &&
          !this.uiManager.isArenaSettingsOpen() &&
          !this.uiManager.isWeaponReplacePromptOpen() &&
          this.playerController.isAiming() &&
          this.playerCamera.getScopeBlend() > 0.34;
        if (isScopedBr) {
          this.playerCamera.getAimRay(this.aimRayOrigin, this.aimRayDir);
        }
        this.battleRoyaleManager.update(
          delta,
          elapsed,
          this.player,
          this.lootManager,
          brDropSnap,
          this.spectatePos,
          isScopedBr ? this.aimRayDir : undefined,
          isScopedBr,
        );
        const brZone = this.battleRoyaleManager.getHudZoneState();
        this.safeZoneManager.applyServerZone(brZone);
        if (brDropSnap.phase !== 'waiting') {
          this.safeZoneManager.update(delta);
        }
        this.mapManager.setRankedZoneState(brZone);
        const brDanger =
          !this.battleRoyaleManager.isLocalEliminated() &&
          brDropSnap.phase === 'landed' &&
          !this.safeZoneManager.isInsideSafeZone(this.player.position.x, this.player.position.z);
        if (brDropSnap.phase === 'waiting') {
          this.uiManager.syncArenaWaitingBanner(
            brDropSnap,
            i18n.t('toast.aiBotsMode'),
            this.battleRoyaleManager.getAliveCount(true),
          );
        } else {
          this.uiManager.syncRankedHudMatchState(
            this.battleRoyaleManager.getAliveCount(this.player.stats.isAlive),
            this.battleRoyaleManager.getLocalKills(),
            brZone,
            brDanger,
          );
        }

        if (this.battleRoyaleManager.isLocalEliminated()) {
          this.inputManager.setWeaponScrollSwitchEnabled(false);
          this.player.visuals.root.visible = false;
          this.gameplayCompanion.root.visible = false;
          this.gameplayCompanionSnapped = false;
          if (this.inputManager.consumeActionJustPressed('minimap')) {
            this.uiManager.notifyArenaAction('minimap');
            this.minimapAccum = 1;
          }
          this.inputManager.consumeLookDelta(this.menuLookDelta);
          if (
            Math.abs(this.menuLookDelta.yaw) > 0.00001 ||
            Math.abs(this.menuLookDelta.pitch) > 0.00001
          ) {
            this.playerCamera.addLookDelta(this.menuLookDelta.yaw, this.menuLookDelta.pitch);
          }
          if (Math.abs(this.menuLookDelta.zoom) > 0.0001) {
            this.playerCamera.addZoomDelta(this.menuLookDelta.zoom);
          }
          const aliveTargetName = this.battleRoyaleManager.getFirstAliveBotPosition(
            this.spectatePos,
          );
          const brSpectatingAlly = this.battleRoyaleManager.hasAliveAlly();
          if (aliveTargetName && aliveTargetName !== this.spectateTargetName) {
            this.spectateTargetName = aliveTargetName;
            this.uiManager.showRankedSpectatorBanner(aliveTargetName, brSpectatingAlly);
          }
          const camFocus = aliveTargetName ? this.spectatePos : this.player.position;
          this.playerCamera.update(delta, camFocus, false, this.mapManager, false, false);
          this.mapManager.getActiveSafeZoneCenter(this.safeZoneCenterScratch);
          this.uiManager.syncArenaCompass(
            this.playerCamera.getYaw(),
            camFocus.x,
            camFocus.z,
            this.safeZoneCenterScratch.x,
            this.safeZoneCenterScratch.z,
          );
          this.uiManager.setArenaSquadmateStatuses(
            this.battleRoyaleManager.getSquadmateHudStatuses(),
          );
          this.minimapAccum += delta;
          if (this.minimapAccum >= 0.055) {
            this.minimapAccum = 0;
            this.mapManager.setTeammateMarkers(this.battleRoyaleManager.getTeammateMarkers());
            this.uiManager.syncArenaMinimap(
              this.mapManager.getMinimapSnapshot(
                camFocus.x,
                camFocus.z,
                this.playerCamera.getYaw(),
              ),
            );
          }
          const snapshot = this.player.getSnapshot();
          this.uiManager.syncPlayerStats(delta, snapshot);
          if (this.mapManager.root.visible) {
            this.mapManager.updateVisibilityAndLOD(
              this.playerCamera.camera,
              camFocus.x,
              camFocus.z,
            );
          }
          this.updateArenaCombatSystems(delta, this.playerCamera.camera, true);
          this.rendererManager.render(this.sceneManager.scene, this.playerCamera.camera);
          return;
        }
      }

      if (
        this.matchMode === 'practice' &&
        (!this.player.stats.isAlive || this.player.position.y < -12)
      ) {
        const spawn = this.mapManager.spawnPointManager.getPrimarySpawn();
        const groundY = this.mapManager.getGroundHeightAt(spawn.x, spawn.z);
        this.player.reset(groundY, spawn.yaw);
        this.player.position.set(spawn.x, groundY, spawn.z);
        this.player.rotation.y = spawn.yaw;
        this.playerCamera.setAirborneAngles(spawn.yaw + Math.PI, 0.16);
        this.playerCamera.snapToPlayer(this.player.position);
      }

      if (this.rendererManager.renderer.shadowMap.enabled) {
        this.sceneManager.updateShadowCenter(this.player.position.x, this.player.position.z);
      }

      if (this.airplaneDropManager.isAirborne()) {
        this.inputManager.setWeaponScrollSwitchEnabled(false);
        const { jumpPressed: rawJumpPressed } = this.playerController.updateAirborneInputs(
          this.airborneMoveVec,
        );
        const fPressed = this.inputManager.consumeJustPressed('KeyF');
        const jumpPressed =
          rawJumpPressed ||
          (this.airplaneDropManager.getPhase() === 'airplane' && fPressed);

        this.airplaneDropManager.update(
          delta,
          elapsed,
          this.airborneMoveVec,
          this.playerCamera.getYaw(),
          this.playerCamera.getPitch(),
          jumpPressed,
        );

        const dropSnap = this.airplaneDropManager.getSnapshot();
        if (dropSnap.phase !== 'airplane') {
          this.syncArenaPointerLock(false);
        }

        if (
          dropSnap.phase === 'airplane' ||
          dropSnap.phase === 'freefall' ||
          dropSnap.phase === 'parachute'
        ) {
          this.player.visuals.root.visible = true;
          this.player.updateVisuals(delta, elapsed);
          this.gameplayCompanion.root.visible = false;
          this.gameplayCompanionSnapped = false;

          if (dropSnap.phase === 'airplane') {
            this.airborneCamTarget.set(dropSnap.airplaneX, dropSnap.airplaneY, dropSnap.airplaneZ);
          } else {
            this.airborneCamTarget.copy(this.player.position);
          }

          this.playerCamera.updateAirborne(
            delta,
            elapsed,
            this.airborneCamTarget,
            dropSnap.phase,
            dropSnap.totalSpeedMps,
            this.mapManager,
          );
          this.mapManager.getActiveSafeZoneCenter(this.safeZoneCenterScratch);
          this.uiManager.syncArenaCompass(
            this.playerCamera.getYaw(),
            this.airborneCamTarget.x,
            this.airborneCamTarget.z,
            this.safeZoneCenterScratch.x,
            this.safeZoneCenterScratch.z,
          );

          if (this.lastAirbornePhase !== dropSnap.phase) {
            this.lastAirbornePhase = dropSnap.phase;
            this.minimapAccum = 1;
          }
          this.minimapAccum += delta;
          if (this.minimapAccum >= 0.055) {
            this.minimapAccum = 0;
            const fl = this.flightOverlayScratch;
            fl.startX = dropSnap.flightStartX;
            fl.startZ = dropSnap.flightStartZ;
            fl.endX = dropSnap.flightEndX;
            fl.endZ = dropSnap.flightEndZ;
            fl.planeX = dropSnap.airplaneX;
            fl.planeZ = dropSnap.airplaneZ;
            fl.planeHeadingRad = dropSnap.airplaneHeadingRad;
            fl.showPlane = true;

            this.mapManager.setTeammateMarkers(
              this.matchMode === 'ranked'
                ? this.remotePlayerManager.getTeammateMarkers()
                : this.matchMode === 'battle-royale'
                  ? this.battleRoyaleManager.getTeammateMarkers()
                  : [],
            );
            this.uiManager.syncArenaMinimap(
              this.mapManager.getMinimapSnapshot(
                this.player.position.x,
                this.player.position.z,
                this.playerCamera.getYaw(),
                fl,
              ),
            );
          }
          if (this.matchMode === 'ranked') {
            this.uiManager.setArenaSquadmateStatuses(
              this.remotePlayerManager.getSquadmateHudStatuses(),
            );
          } else if (this.matchMode === 'battle-royale') {
            this.uiManager.setArenaSquadmateStatuses(
              this.battleRoyaleManager.getSquadmateHudStatuses(),
            );
          } else {
            this.uiManager.setArenaSquadmateStatuses([]);
          }
          this.uiManager.syncArenaAirdrop(dropSnap);

          const snapshot = this.player.getSnapshot();
          this.uiManager.syncPlayerStats(delta, snapshot);

          if (this.mapManager.root.visible) {
            this.mapManager.updateVisibilityAndLOD(
              this.playerCamera.camera,
              this.airborneCamTarget.x,
              this.airborneCamTarget.z,
            );
          }
          this.updateArenaCombatSystems(delta, this.playerCamera.camera, true);
          this.rendererManager.render(this.sceneManager.scene, this.playerCamera.camera);
          return;
        }
      }

      const invOpen = this.uiManager.isArenaInventoryOpen();
      const fullMapOpen = this.uiManager.isArenaFullMapOpen();
      const settingsOpen = this.uiManager.isArenaSettingsOpen();
      let weaponReplaceOpen = this.uiManager.isWeaponReplacePromptOpen();
      if (weaponReplaceOpen) {
        const pendingReplace = this.uiManager.getPendingWeaponReplacePrompt();
        const stillExists = pendingReplace
          ? this.lootManager.getLootItemById(pendingReplace.lootInstanceId) !== null
          : false;
        const distSq = pendingReplace
          ? (this.player.position.x - pendingReplace.lootPosX) ** 2 +
            (this.player.position.z - pendingReplace.lootPosZ) ** 2
          : Infinity;
        if (
          !pendingReplace ||
          !this.player.stats.isAlive ||
          this.airplaneDropManager.getPhase() !== 'landed' ||
          !stillExists ||
          distSq > 4.5 * 4.5
        ) {
          this.uiManager.showWeaponReplacePrompt(null);
          this.syncArenaPointerLock(true);
          weaponReplaceOpen = false;
        } else {
          let chosenSlot: (0 | 1 | 2 | 3) | null = null;
          if (this.inputManager.consumeJustPressed('Digit1')) chosenSlot = 0;
          else if (this.inputManager.consumeJustPressed('Digit2')) chosenSlot = 1;
          else if (this.inputManager.consumeJustPressed('Digit3')) chosenSlot = 2;
          else if (this.inputManager.consumeJustPressed('Digit4')) chosenSlot = 3;
          else if (
            pendingReplace.candidates.length === 1 &&
            this.inputManager.consumeJustPressed('Enter')
          ) {
            chosenSlot = pendingReplace.candidates[0].slotIndex;
          }
          if (chosenSlot !== null) {
            const validCandidate = pendingReplace.candidates.find(
              (c) => c.slotIndex === chosenSlot,
            );
            if (validCandidate) {
              this.audioManager.playClick();
              this.uiManager.showWeaponReplacePrompt(null);
              const replaceOutcome = this.inventoryManager.confirmWeaponReplacement(
                pendingReplace.lootInstanceId,
                validCandidate.slotIndex,
              );
              if (replaceOutcome.message) {
                this.uiManager.showArenaToast(replaceOutcome.message);
              }
              this.syncArenaPointerLock(true);
              weaponReplaceOpen = false;
            }
          }
        }
      }
      const matchEndedPause =
        this.matchMode === 'battle-royale' && this.battleRoyaleManager.isMatchEnded();
      const blockCombat =
        invOpen ||
        fullMapOpen ||
        settingsOpen ||
        weaponReplaceOpen ||
        matchEndedPause ||
        this.player.movement.isSitting ||
        this.player.movement.isVaulting ||
        this.player.movement.isZiplining;

      const isWaitingPhase = this.airplaneDropManager.getPhase() === 'waiting';
      this.playerCamera.setWaitingPitchClamp(isWaitingPhase);

      const allowScrollSwitch =
        !blockCombat && this.player.stats.isAlive && !this.playerController.isAiming();
      this.inputManager.setWeaponScrollSwitchEnabled(allowScrollSwitch);
      if (allowScrollSwitch) {
        const wheelStep = this.inputManager.consumeWeaponSwitchStep();
        if (wheelStep !== 0) {
          if (this.glooManualPreviewActive) {
            this.rotateManualGlooPreview(wheelStep * (Math.PI / 12));
          } else {
            this.playerController.forceExitScope();
            const swOutcome = this.inventoryManager.cycleEquippedWeapon(wheelStep);
            if (swOutcome.message) {
              this.uiManager.showArenaToast(swOutcome.message);
            }
          }
        }
      }

      this.inventoryManager.update(delta);
      const isHealingNow = this.inventoryManager.isHealing();
      const switchingWeapon = this.weaponManager.isSwitchingWeapon();
      const scopeProfile = this.syncActiveScopeProfile();
      this.playerController.setCanScope(
        !isWaitingPhase &&
          !blockCombat &&
          !switchingWeapon &&
          !isHealingNow &&
          !this.glooManualPreviewActive &&
          scopeProfile.canScope,
      );
      if (
        isWaitingPhase ||
        this.weaponManager.isReloading() ||
        switchingWeapon ||
        isHealingNow ||
        matchEndedPause
      ) {
        this.playerController.forceExitScope();
      }

      this.characterManager.abilityManager.setExternalModifiers(
        this.inventoryManager.getActiveItemModifiers(),
        this.player.stats,
      );
      this.characterManager.update(delta);

      if (this.player.isEmoting()) {
        this.inputManager.getMoveVector(this.emoteMoveScratch);
        const wantsMove =
          Math.hypot(this.emoteMoveScratch.x, this.emoteMoveScratch.y) > 0.15;
        const wantsCombatOrAction =
          this.inputManager.hasActionIntent('fire') ||
          this.inputManager.hasActionIntent('aim') ||
          this.inputManager.hasActionIntent('jump') ||
          this.inputManager.hasActionIntent('crouch') ||
          this.inputManager.hasActionIntent('prone') ||
          this.inputManager.hasActionIntent('reload') ||
          this.inputManager.hasActionIntent('ability') ||
          this.inputManager.hasActionIntent('slot1') ||
          this.inputManager.hasActionIntent('slot2') ||
          this.inputManager.hasActionIntent('slot3') ||
          this.inputManager.hasActionIntent('slot4') ||
          this.inputManager.hasActionIntent('useMedkit') ||
          this.inputManager.hasActionIntent('useSpecial') ||
          this.inputManager.hasActionIntent('weaponSwitch') ||
          this.inputManager.hasActionIntent('holster') ||
          this.inputManager.hasActionIntent('glooWall') ||
          this.inputManager.hasActionIntent('pickup');
        if (wantsMove || wantsCombatOrAction || !this.canEmoteInArena()) {
          this.stopActiveEmote(false);
        }
      }

      this.playerController.update(delta);
      const zoomCycleDelta = this.playerController.consumeScopeZoomCycleDelta();
      if (zoomCycleDelta !== 0) {
        this.cycleActiveScopeZoom(zoomCycleDelta > 0 ? 1 : -1);
      }

      const isAimingNow =
        !isWaitingPhase &&
        !blockCombat &&
        !switchingWeapon &&
        !isHealingNow &&
        scopeProfile.canScope &&
        this.playerController.isAiming();
      this.player.setIsAiming(isAimingNow);
      this.playerCamera.setScopeTargetZoom(this.activeScopeZoom);

      this.airplaneDropManager.updatePassiveEffects(delta, elapsed);

      this.updateManualGlooPreview(delta, elapsed);

      const fireJustPressed = this.playerController.consumeFireJustPressed();
      const fireHeldNow = this.playerController.isFireHeld();
      if (this.glooConfirmFireSuppress && !fireHeldNow) {
        this.glooConfirmFireSuppress = false;
      }
      if (this.glooManualPreviewActive && fireJustPressed && !blockCombat) {
        if (this.confirmManualGlooPlacement()) {
          this.glooConfirmFireSuppress = true;
        }
      }
      const blockWeaponForGloo = this.glooManualPreviewActive || this.glooConfirmFireSuppress;

      this.playerCamera.getAimRay(this.aimRayOrigin, this.aimRayDir);
      if (!isWaitingPhase && !blockCombat && !isHealingNow) {
        const speedSq =
          this.player.velocity.x * this.player.velocity.x +
          this.player.velocity.z * this.player.velocity.z;
        const aa = this.aimAssistSystem.evaluate({
          deltaSeconds: delta,
          strength: this.settingsManager.getSettings().controls.aimAssistStrength,
          weapon: this.weaponManager.getActiveWeapon(),
          playerPos: this.player.position,
          cameraPos: this.aimRayOrigin,
          cameraDir: this.aimRayDir,
          currentYaw: this.playerCamera.getYaw(),
          currentPitch: this.playerCamera.getPitch(),
          targetYaw: this.playerCamera.getTargetYaw(),
          targetPitch: this.playerCamera.getTargetPitch(),
          currentZoomFactor: this.playerCamera.getCurrentZoomFactor(),
          isAiming: isAimingNow,
          isFireHeld: !blockWeaponForGloo && (fireHeldNow || fireJustPressed),
          isMoving: speedSq > 0.2,
          isRecentlyLooking: this.playerController.isRecentlyLooking(),
          isActivelyLooking: this.playerController.isActivelyLooking(),
          hitDetection: this.weaponManager.hitDetection,
        });
        this.playerController.setAimAssistSlowdown(aa.slowdownScale);
        this.playerCamera.setAimAssistLockActive(aa.hasTargetLock);
        if (Math.abs(aa.deltaYaw) > 0.000001 || Math.abs(aa.deltaPitch) > 0.000001) {
          this.playerCamera.applyAimAssistDelta(aa.deltaYaw, aa.deltaPitch);
        }
      } else {
        this.aimAssistSystem.reset();
        this.playerCamera.setAimAssistLockActive(false);
        this.playerController.setAimAssistSlowdown(1.0);
      }

      const ci = this.combatInputScratch;
      ci.isAiming = isAimingNow;
      ci.isFirstPersonScoped = isAimingNow && this.playerCamera.isFirstPersonScoped();
      ci.triggerHeld = !blockCombat && !isHealingNow && !blockWeaponForGloo && fireHeldNow;
      ci.triggerJustPressed = !blockCombat && !isHealingNow && !blockWeaponForGloo && fireJustPressed;
      ci.modifiers = this.characterManager.abilityManager.getComputedModifiers();
      this.weaponManager.setFrameCombatInput(ci);
      this.weaponManager.update(delta, elapsed);
      if (this.matchMode === 'battle-royale') {
        this.battleRoyaleManager.processPendingEliminations(this.player, this.lootManager);
      }

      this.player.updateVisuals(delta, elapsed);
      const emotingNow = this.player.isEmoting();
      if (this.wasPlayerEmoting && !emotingNow) {
        this.audioManager.stopDanceMusic(false);
        this.uiManager.setLobbyEmotingState(null);
      }
      this.wasPlayerEmoting = emotingNow;
      this.updateGameplayCompanion(delta, elapsed, this.airplaneDropManager.getPhase());
      this.playerCamera.update(
        delta,
        this.player.position,
        this.player.isSprinting,
        this.mapManager,
        this.player.isCrouching,
        isAimingNow,
        this.player.movement.isSitting,
        this.player.isProne,
      );
      this.player.visuals.root.visible = !this.playerCamera.shouldHidePlayerMesh();

      let enemyInCrosshair = false;
      if (
        !isWaitingPhase &&
        !blockCombat &&
        this.airplaneDropManager.getPhase() === 'landed' &&
        this.player.stats.isAlive &&
        !this.glooManualPreviewActive &&
        !matchEndedPause
      ) {
        this.playerCamera.getAimRay(this.aimRayOrigin, this.aimRayDir);
        const eyeHeight = this.player.isProne ? 0.52 : this.player.isCrouching ? 0.95 : 1.42;
        enemyInCrosshair = this.weaponManager.isEnemyInCrosshair(
          this.aimRayOrigin,
          this.aimRayDir,
          this.player.position,
          eyeHeight,
          this.playerCamera.isFirstPersonScoped(),
        );
      }
      this.uiManager.setArenaCrosshairEnemyTargeted(enemyInCrosshair);

      const snapshot = this.player.getSnapshot();
      const charName = this.characterManager.getSelectedCharacter().name;
      const abilitySnap = this.characterManager.abilityManager.getRuntimeSnapshot();
      const weaponSnap = this.weaponManager.getHudSnapshot();
      const invSnap = this.inventoryManager.getSnapshot();
      const pickupKey = this.controlSettings.getBinding('pickup');
      const pickupPrompt =
        this.player.movement.isSitting || isWaitingPhase
          ? null
          : this.lootManager.getPromptSnapshot(this.player.position, pickupKey);
      const camYaw = this.playerCamera.getYaw();
      this.mapManager.getActiveSafeZoneCenter(this.safeZoneCenterScratch);
      this.uiManager.syncArenaCompass(
        camYaw,
        this.player.position.x,
        this.player.position.z,
        this.safeZoneCenterScratch.x,
        this.safeZoneCenterScratch.z,
      );
      const worldPrompt = pickupPrompt
        ? null
        : this.mapManager.getWorldInteractPrompt(
            this.player.position,
            pickupKey,
            this.player.movement.isSitting,
            -Math.sin(camYaw),
            -Math.cos(camYaw),
            this.player.movement.isZiplining,
          );

      const dropSnap = this.airplaneDropManager.getSnapshot();
      if (this.lastAirbornePhase !== dropSnap.phase) {
        this.lastAirbornePhase = dropSnap.phase;
        this.minimapAccum = 1;
      }

      this.minimapAccum += delta;
      if (this.minimapAccum >= 0.055) {
        this.minimapAccum = 0;
        let flightOverlay: FlightMinimapOverlay | undefined;
        if (dropSnap.phase === 'landed' && dropSnap.flightProgress < 1.05) {
          const fl = this.flightOverlayScratch;
          fl.startX = dropSnap.flightStartX;
          fl.startZ = dropSnap.flightStartZ;
          fl.endX = dropSnap.flightEndX;
          fl.endZ = dropSnap.flightEndZ;
          fl.planeX = dropSnap.airplaneX;
          fl.planeZ = dropSnap.airplaneZ;
          fl.planeHeadingRad = dropSnap.airplaneHeadingRad;
          fl.showPlane = true;
          flightOverlay = fl;
        }

        const radarRadius = Math.max(24, abilitySnap.computedModifiers.enemyDetectionRadius ?? 0);
        this.mapManager.setTeammateMarkers(
          this.matchMode === 'ranked'
            ? this.remotePlayerManager.getTeammateMarkers()
            : this.matchMode === 'battle-royale'
              ? this.battleRoyaleManager.getTeammateMarkers()
              : [],
        );
        this.mapManager.setEnemyMarkers(
          this.matchMode === 'ranked'
            ? this.remotePlayerManager.getEnemyRadarMarkers(this.player.position, radarRadius)
            : this.matchMode === 'battle-royale'
              ? this.battleRoyaleManager.getEnemyRadarMarkers(this.player.position, radarRadius)
              : this.weaponManager.getEnemyRadarMarkers(this.player.position, radarRadius),
        );
        this.uiManager.syncArenaMinimap(
          this.mapManager.getMinimapSnapshot(
            this.player.position.x,
            this.player.position.z,
            this.playerCamera.getYaw(),
            flightOverlay,
          ),
        );
      }

      if (this.matchMode === 'ranked') {
        this.uiManager.setArenaSquadmateStatuses(
          this.remotePlayerManager.getSquadmateHudStatuses(),
        );
      } else if (this.matchMode === 'battle-royale') {
        this.uiManager.setArenaSquadmateStatuses(
          this.battleRoyaleManager.getSquadmateHudStatuses(),
        );
      } else {
        this.uiManager.setArenaSquadmateStatuses([]);
      }
      this.uiManager.syncArenaAirdrop(dropSnap);
      this.uiManager.setArenaAiming(isAimingNow);
      this.uiManager.setArenaScopeAvailable(
        !isWaitingPhase && !blockCombat && !switchingWeapon && !isHealingNow && scopeProfile.canScope,
      );
      const hasStoredWeapons = Boolean(
        invSnap.weaponSlot1 ||
          invSnap.weaponSlot2 ||
          invSnap.weaponSlot3 ||
          invSnap.weaponSlot4 ||
          invSnap.holsteredWeapons.length > 0,
      );
      this.uiManager.setArenaUnarmedState(invSnap.activeWeaponSlotIndex === -1, hasStoredWeapons);
      const scopeBlend = this.playerCamera.getScopeBlend();
      const activeWeapon = this.weaponManager.getActiveWeapon();
      if (scopeBlend > 0.34) {
        this.rangefinderAccum += delta;
        if (this.rangefinderAccum >= 0.08) {
          this.rangefinderAccum = 0;
          this.lastRangeMeters = this.weaponManager.measureRangefinderDistance(
            activeWeapon?.definition.range ?? 160,
          );
        }
      } else {
        this.rangefinderAccum = 0.08;
        this.lastRangeMeters = null;
      }

      const scopeSnap = this.scopeOverlayScratch;
      scopeSnap.scopeBlend = scopeBlend;
      scopeSnap.weaponName = weaponSnap.weaponName;
      scopeSnap.reticleStyle = scopeProfile.reticleStyle;
      scopeSnap.currentZoom = this.activeScopeZoom;
      scopeSnap.zoomLevels = scopeProfile.zoomLevels;
      scopeSnap.rangeMeters = this.lastRangeMeters;
      scopeSnap.ammoInMagazine = weaponSnap.ammoInMagazine;
      scopeSnap.magazineSize = weaponSnap.magazineSize;
      scopeSnap.equippedOpticLabel = scopeProfile.equippedOpticLabel;
      scopeSnap.isBoltCycling = weaponSnap.isBoltCycling;
      scopeSnap.boltCycleProgress = weaponSnap.boltCycleProgress;
      scopeSnap.unlimitedAmmo = weaponSnap.unlimitedAmmo;
      scopeSnap.enemyTargeted = enemyInCrosshair;
      this.uiManager.syncArenaScope(scopeSnap);
      this.uiManager.syncPlayerStats(delta, snapshot);
      this.uiManager.syncArenaAbility(delta, charName, abilitySnap);
      this.uiManager.syncArenaWeapon(delta, weaponSnap);
      this.uiManager.syncArenaInventoryAndPickup(delta, invSnap, pickupPrompt, worldPrompt);

      if (this.mapManager.root.visible) {
        this.mapManager.updateVisibilityAndLOD(
          this.playerCamera.camera,
          this.player.position.x,
          this.player.position.z,
        );
      }
      this.updateArenaCombatSystems(delta, this.playerCamera.camera, true);
      this.rendererManager.render(this.sceneManager.scene, this.playerCamera.camera);
    } else {
      this.inputManager.setWeaponScrollSwitchEnabled(false);
      this.inputManager.consumeLookDelta(this.menuLookDelta);
      if (screen === 'characters' || screen === 'main-menu' || screen === 'pets') {
        // Horizontal drag rotates the 3D human character 360 deg directly; vertical tilts camera subtly
        if (Math.abs(this.menuLookDelta.yaw) > 0.00001) {
          this.player.addPreviewYawDelta(this.menuLookDelta.yaw * 1.45);
        }
        if (Math.abs(this.menuLookDelta.pitch) > 0.00001) {
          this.cameraManager.addLookDelta(0, this.menuLookDelta.pitch * 0.6);
        }
      } else {
        if (
          Math.abs(this.menuLookDelta.yaw) > 0.00001 ||
          Math.abs(this.menuLookDelta.pitch) > 0.00001
        ) {
          this.cameraManager.addLookDelta(this.menuLookDelta.yaw, this.menuLookDelta.pitch);
        }
      }
      if (Math.abs(this.menuLookDelta.zoom) > 0.0001) {
        this.cameraManager.addZoomDelta(this.menuLookDelta.zoom);
      }

      if (screen === 'test-arena' && (this.matchMode === 'ranked' || this.matchMode === 'battle-royale')) {
        if (this.matchMode === 'battle-royale') {
          const brDropSnap = this.airplaneDropManager.getSnapshot();
          this.battleRoyaleManager.update(
            delta,
            elapsed,
            this.player,
            this.lootManager,
            brDropSnap,
            this.spectatePos,
          );
          const brZone = this.battleRoyaleManager.getHudZoneState();
          this.safeZoneManager.applyServerZone(brZone);
          this.mapManager.setRankedZoneState(brZone);
          this.uiManager.syncRankedHudMatchState(
            this.battleRoyaleManager.getAliveCount(this.player.stats.isAlive),
            this.battleRoyaleManager.getLocalKills(),
            brZone,
            !this.battleRoyaleManager.isLocalEliminated() &&
              brDropSnap.phase === 'landed' &&
              !this.safeZoneManager.isInsideSafeZone(this.player.position.x, this.player.position.z),
          );
        } else {
          this.uiManager.syncRankedHudMatchState(
            this.rankedAliveCount,
            this.rankedLocalKills,
            this.safeZoneManager.getServerZone(),
            !this.rankedEliminated &&
              this.airplaneDropManager.getPhase() === 'landed' &&
              !this.safeZoneManager.isInsideSafeZone(this.player.position.x, this.player.position.z),
          );
        }
        this.safeZoneManager.update(delta);
      }

      this.player.visuals.root.visible = true;
      this.player.updateVisuals(delta, elapsed);
      const menuEmotingNow = this.player.isEmoting();
      if (this.wasPlayerEmoting && !menuEmotingNow) {
        this.audioManager.stopDanceMusic(false);
        this.uiManager.setLobbyEmotingState(null);
      }
      this.wasPlayerEmoting = menuEmotingNow;
      if (screen === 'main-menu') {
        if (!menuEmotingNow) {
          this.uiManager.setLobbyEmotingState(null);
        }
      }
      if (screen === 'test-arena') {
        this.updateGameplayCompanion(delta, elapsed, this.airplaneDropManager.getPhase());
      } else {
        this.gameplayCompanion.root.visible = false;
      }
      this.cameraManager.update(delta, elapsed);
      if (this.mapManager.root.visible) {
        this.mapManager.updateVisibilityAndLOD(
          this.cameraManager.camera,
          this.player.position.x,
          this.player.position.z,
        );
      }
      if (screen === 'test-arena') {
        this.updateArenaCombatSystems(delta, this.cameraManager.camera, true);
      }
      this.rendererManager.render(this.sceneManager.scene, this.cameraManager.camera);
    }
  }

  private canUseGlooWallNow(): boolean {
    if (this.uiManager.getCurrentScreen() !== 'test-arena') return false;
    if (!this.player.stats.isAlive) return false;
    if (this.airplaneDropManager.getPhase() !== 'landed') return false;
    if (
      this.uiManager.isArenaInventoryOpen() ||
      this.uiManager.isArenaFullMapOpen() ||
      this.uiManager.isArenaSettingsOpen() ||
      this.uiManager.isEmoteWheelOpen() ||
      this.uiManager.isWeaponReplacePromptOpen()
    ) {
      return false;
    }
    if (
      this.player.movement.isSitting ||
      this.player.movement.isVaulting ||
      this.player.movement.isZiplining
    ) {
      return false;
    }
    if (this.matchMode === 'battle-royale' && this.battleRoyaleManager.isLocalEliminated()) return false;
    if (this.matchMode === 'ranked' && this.rankedEliminated) return false;
    return true;
  }

  private fillGlooActorsAndGetOwner(): { ownerId: string; ignoreWallId: string | null } {
    const actors = this.glooActorOverlapScratch;
    actors.length = 0;
    if (this.matchMode === 'ranked') {
      this.remotePlayerManager.fillActorPositions(actors);
    } else if (this.matchMode === 'battle-royale') {
      this.battleRoyaleManager.fillAliveBotPositions(actors);
    }
    const ownerId =
      this.matchMode === 'ranked'
        ? (this.localRankedPlayerId ?? 'local-player')
        : 'local-player';
    const activeOwned = this.glooWallManager.getActiveWallCountForOwner(ownerId);
    const ignoreWallId =
      activeOwned >= GLOO_WALL_CONFIG.maxActivePerPlayer
        ? this.glooWallManager.getOldestActiveWallIdForOwner(ownerId)
        : null;
    return { ownerId, ignoreWallId };
  }

  private executeGlooDeployment(placement: GlooWallPlacementValidation, localOwnerId: string): void {
    this.playerController.forceExitScope();
    if (this.player.isEmoting()) {
      this.stopActiveEmote(false);
    }

    const equippedSkinId = this.shopManager.getEquippedGlooSkinId();
    const equippedSkin = getGlooWallSkinById(equippedSkinId);
    this.player.triggerGlooDeploy(equippedSkin.accentHex);

    if (this.matchMode === 'ranked') {
      this.rankedNetwork.sendGlooDeploy({
        x: placement.x,
        y: placement.y,
        z: placement.z,
        yaw: placement.yaw,
        skinId: equippedSkinId,
        heightScale: placement.heightScale,
      });
      this.uiManager.notifyArenaAction('glooWall');
      return;
    }

    this.glooWallManager.spawnLocal(
      placement.x,
      placement.y,
      placement.z,
      placement.yaw,
      localOwnerId,
      this.playerProfileManager.getUsername(),
      equippedSkinId,
      placement.heightScale,
    );
    this.audioManager.playGlooDeploy(0);
    this.uiManager.notifyArenaAction('glooWall');
  }

  private enterManualGlooPreview(): void {
    if (!this.canUseGlooWallNow()) return;
    if (this.inventoryManager.isHealing()) {
      this.inventoryManager.interruptHealing(i18n.t('inv.msg.healingCanceled'));
    }
    if (this.player.isEmoting()) {
      this.stopActiveEmote(false);
    }
    this.playerController.forceExitScope();
    this.glooManualPreviewActive = true;
    this.glooManualYawOffset = 0;
    this.glooManualRotateHoldDir = 0;
    const equippedSkin = getGlooWallSkinById(this.shopManager.getEquippedGlooSkinId());
    this.player.setGlooHeld(true, equippedSkin.accentHex);
    this.audioManager.playClick();
  }

  private switchOutOfGlooHold(): boolean {
    if (!this.glooManualPreviewActive) return false;
    this.cancelManualGlooPreview(false);
    return true;
  }

  private cancelManualGlooPreview(playSound = false): void {
    const wasActive = this.glooManualPreviewActive;
    this.glooManualPreviewActive = false;
    this.glooManualRotateHoldDir = 0;
    this.player.setGlooHeld(false);
    this.glooWallManager.hidePreviewGhost();
    this.uiManager.syncArenaGlooManualPreview(false, false);
    if (wasActive && playSound) {
      this.audioManager.playBack();
    }
  }

  private rotateManualGlooPreview(deltaRad: number): void {
    if (!this.glooManualPreviewActive) return;
    const next = this.glooManualYawOffset + deltaRad;
    this.glooManualYawOffset = Math.atan2(Math.sin(next), Math.cos(next));
  }

  private evaluateCurrentManualPreview(): {
    placement: GlooWallPlacementValidation;
    ownerId: string;
  } {
    const { ownerId, ignoreWallId } = this.fillGlooActorsAndGetOwner();
    const camYaw = this.playerCamera.getYaw();
    const camPitch = this.playerCamera.getPitch();
    const pitchT = Math.max(0, Math.min(1, (0.46 - camPitch) / 0.66));
    const targetDist = 1.65 + pitchT * 3.45;
    const targetX = this.player.position.x - Math.sin(camYaw) * targetDist;
    const targetZ = this.player.position.z - Math.cos(camYaw) * targetDist;
    const rawPlacementYaw = camYaw + Math.PI + this.glooManualYawOffset;
    const placementYaw = Math.atan2(Math.sin(rawPlacementYaw), Math.cos(rawPlacementYaw));

    this.glooWallManager.evaluateManualTransform(
      this.player.position,
      targetX,
      targetZ,
      placementYaw,
      this.mapManager,
      this.glooActorOverlapScratch,
      ignoreWallId,
      this.glooPreviewPlacement,
    );
    return { placement: this.glooPreviewPlacement, ownerId };
  }

  private updateManualGlooPreview(deltaSeconds: number, elapsedSeconds: number): void {
    if (!this.glooManualPreviewActive) return;
    if (
      !this.canUseGlooWallNow() ||
      this.inventoryManager.isHealing() ||
      this.player.isEmoting() ||
      this.settingsManager.getSettings().controls.glooPlacementMode === 'auto'
    ) {
      this.cancelManualGlooPreview(false);
      return;
    }

    const equippedSkinId = this.shopManager.getEquippedGlooSkinId();
    const equippedSkin = getGlooWallSkinById(equippedSkinId);
    this.player.setGlooHeld(true, equippedSkin.accentHex);

    if (this.glooManualRotateHoldDir !== 0) {
      this.rotateManualGlooPreview(this.glooManualRotateHoldDir * 2.25 * deltaSeconds);
    }
    if (this.inputManager.consumeJustPressed('BracketLeft')) {
      this.rotateManualGlooPreview(Math.PI / 12);
    }
    if (this.inputManager.consumeJustPressed('BracketRight')) {
      this.rotateManualGlooPreview(-Math.PI / 12);
    }

    const { placement } = this.evaluateCurrentManualPreview();
    this.glooWallManager.updatePreviewGhost(
      placement.x,
      placement.y,
      placement.z,
      placement.yaw,
      placement.heightScale,
      placement.valid,
      equippedSkinId,
      elapsedSeconds,
    );
    this.uiManager.syncArenaGlooManualPreview(true, placement.valid, placement.reason);
  }

  private confirmManualGlooPlacement(): boolean {
    if (!this.glooManualPreviewActive) return false;
    if (!this.canUseGlooWallNow()) {
      this.cancelManualGlooPreview(false);
      return false;
    }
    const { placement, ownerId } = this.evaluateCurrentManualPreview();
    if (!placement.valid) {
      this.uiManager.showArenaToast(i18n.t('hud.gloo.blocked'));
      this.audioManager.playClick();
      return false;
    }
    this.executeGlooDeployment(placement, ownerId);
    // Keep Gloo Wall equipped in hand & manual placement preview active for consecutive deployments
    return true;
  }

  private handleDeployGlooWall(): void {
    if (!this.canUseGlooWallNow()) return;

    const mode = this.settingsManager.getSettings().controls.glooPlacementMode;
    if (mode === 'manual') {
      if (!this.glooManualPreviewActive) {
        this.enterManualGlooPreview();
      } else {
        this.confirmManualGlooPlacement();
      }
      return;
    }

    const { ownerId, ignoreWallId } = this.fillGlooActorsAndGetOwner();
    const rawPlacementYaw = this.playerCamera.getYaw() + Math.PI;
    const placementYaw = Math.atan2(Math.sin(rawPlacementYaw), Math.cos(rawPlacementYaw));
    const placement = this.glooWallManager.computeCandidateTransform(
      this.player.position,
      placementYaw,
      this.mapManager,
      this.glooActorOverlapScratch,
      ignoreWallId,
    );
    if (!placement.valid) {
      this.uiManager.showArenaToast(i18n.t('hud.gloo.blocked'));
      return;
    }

    this.executeGlooDeployment(placement, ownerId);
  }

  private replenishTrainingGroundStations(): void {
    for (const rack of TRAINING_GROUND_WEAPON_RACKS) {
      const nearby = this.lootManager.getLootItemsInRadius(
        rack.x,
        rack.z,
        0.48,
        this.practiceGlooCheckScratch,
      );
      let hasItem = false;
      for (let i = 0; i < nearby.length; i++) {
        if (nearby[i].definition.id === rack.itemId) {
          hasItem = true;
          break;
        }
      }
      if (!hasItem) {
        this.lootManager.spawnDroppedItem(
          rack.itemId,
          rack.x,
          rack.z,
          rack.count ?? 1,
          {},
          0.6,
        );
      }
    }
  }

  private updateArenaCombatSystems(
    delta: number,
    camera: THREE.Camera,
    allowHudSync: boolean,
  ): void {
    this.glooWallManager.update(delta, camera);
    this.eliminationEffectSystem.update(delta);
    const metrics = this.responsiveManager.getMetrics();
    this.damageNumberSystem.update(delta, camera, metrics.width, metrics.height);
    if (allowHudSync) {
      const localOwnerId =
        this.matchMode === 'ranked'
          ? (this.localRankedPlayerId ?? 'local-player')
          : 'local-player';
      const activeOwnedWalls = this.glooWallManager.getActiveWallCountForOwner(localOwnerId);
      this.uiManager.syncArenaGlooWallState(
        activeOwnedWalls,
        GLOO_WALL_CONFIG.maxActivePerPlayer,
        this.glooManualPreviewActive,
      );
      if (
        this.matchMode === 'practice' &&
        this.mapManager.hasActiveMap() &&
        this.mapManager.getActiveConfig().isTrainingGround &&
        this.airplaneDropManager.getPhase() === 'landed'
      ) {
        this.practiceGlooRespawnAccum += delta;
        if (this.practiceGlooRespawnAccum >= 3.5) {
          this.practiceGlooRespawnAccum = 0;
          this.replenishTrainingGroundStations();
        }
      }
    }
  }

  private updateGameplayCompanion(delta: number, elapsed: number, dropPhase: string): void {
    const shouldShow =
      this.r6Customization.petEnabled &&
      this.r6Customization.petId !== 'none' &&
      this.player.stats.isAlive &&
      (dropPhase === 'landed' || dropPhase === 'waiting');

    if (!shouldShow) {
      this.gameplayCompanion.root.visible = false;
      this.gameplayCompanionSnapped = false;
      return;
    }

    if (this.gameplayCompanion.getKind() !== this.r6Customization.petId) {
      this.gameplayCompanion.setKind(this.r6Customization.petId);
    }
    this.gameplayCompanion.root.visible = true;

    const dt = Math.min(0.05, Math.max(0.001, delta));
    const pYaw = this.player.rotation.y;
    const fwdX = Math.sin(pYaw);
    const fwdZ = Math.cos(pYaw);
    const rightX = -Math.cos(pYaw);
    const rightZ = Math.sin(pYaw);

    // Position companion beside-right of character in lower-right foreground below eyeHeight ray
    const targetX = this.player.position.x + rightX * 1.02 + fwdX * 0.24;
    const targetZ = this.player.position.z + rightZ * 1.02 + fwdZ * 0.24;

    const curPos = this.gameplayCompanion.root.position;
    const distToPlayer = Math.hypot(
      this.player.position.x - curPos.x,
      this.player.position.z - curPos.z,
    );

    if (!this.gameplayCompanionSnapped || distToPlayer > 16) {
      const groundY = this.mapManager.getGroundHeightAt(targetX, targetZ, this.player.position.y);
      this.companionPosScratch.set(targetX, groundY, targetZ);
      this.mapManager.resolveHorizontalCollision(this.companionPosScratch, 0.34, 0.9);
      this.companionPosScratch.y = this.mapManager.getGroundHeightAt(
        this.companionPosScratch.x,
        this.companionPosScratch.z,
        this.player.position.y,
      );
      this.gameplayCompanion.root.position.copy(this.companionPosScratch);
      this.gameplayCompanion.root.rotation.y = pYaw;
      this.gameplayCompanionSnapped = true;
      this.gameplayCompanion.setMotionState(0, false);
      this.gameplayCompanion.update(dt, elapsed);
      return;
    }

    const dx = targetX - curPos.x;
    const dz = targetZ - curPos.z;
    const dist = Math.hypot(dx, dz);
    const playerSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const desiredSpeed =
      dist < 0.32 ? 0 : Math.min(Math.max(7.2, playerSpeed * 1.22), dist * 4.4);

    if (desiredSpeed > 0.05 && dist > 0.001) {
      const step = Math.min(dist, desiredSpeed * dt);
      const moveX = (dx / dist) * step;
      const moveZ = (dz / dist) * step;
      this.companionPosScratch.set(curPos.x + moveX, curPos.y, curPos.z + moveZ);
      this.mapManager.resolveHorizontalCollision(this.companionPosScratch, 0.34, 0.9);
      const targetY = this.mapManager.getGroundHeightAt(
        this.companionPosScratch.x,
        this.companionPosScratch.z,
        curPos.y,
      );
      const yAlpha = 1 - Math.exp(-14 * dt);
      this.companionPosScratch.y = curPos.y + (targetY - curPos.y) * yAlpha;
      curPos.copy(this.companionPosScratch);

      const moveYaw = Math.atan2(moveX, moveZ);
      const yawDiff = Math.atan2(
        Math.sin(moveYaw - this.gameplayCompanion.root.rotation.y),
        Math.cos(moveYaw - this.gameplayCompanion.root.rotation.y),
      );
      this.gameplayCompanion.root.rotation.y += yawDiff * (1 - Math.exp(-10 * dt));
    } else {
      const yawDiff = Math.atan2(
        Math.sin(pYaw - this.gameplayCompanion.root.rotation.y),
        Math.cos(pYaw - this.gameplayCompanion.root.rotation.y),
      );
      this.gameplayCompanion.root.rotation.y += yawDiff * (1 - Math.exp(-6 * dt));
      const targetY = this.mapManager.getGroundHeightAt(curPos.x, curPos.z, curPos.y);
      curPos.y += (targetY - curPos.y) * (1 - Math.exp(-14 * dt));
    }

    this.gameplayCompanion.setMotionState(desiredSpeed, false);
    this.gameplayCompanion.update(dt, elapsed);
  }

  private syncActiveScopeProfile(): {
    canScope: boolean;
    zoomLevels: number[];
    reticleStyle: 'reflex' | 'tactical' | 'marksman' | 'sniper';
    equippedOpticLabel: string | null;
  } {
    const weapon = this.weaponManager.getActiveWeapon();
    const spec = weapon?.definition.scope;

    // Close-range weapons, assault rifles without dedicated optics, and empty hands cannot scope.
    if (!weapon || !spec) {
      this.activeScopeZoom = 1.0;
      this.lastScopeConfigKey = 'no-scope';
      if (this.lastScopeProfileCacheKey !== 'no-scope') {
        this.lastScopeProfileCacheKey = 'no-scope';
        this.cachedScopeProfile = {
          canScope: false,
          zoomLevels: [1],
          reticleStyle: 'reflex',
          equippedOpticLabel: null,
        };
      }
      return this.cachedScopeProfile;
    }

    const equippedOptic = this.inventoryManager.getEquippedScopeLevel();
    const clampedOptic =
      equippedOptic > 0 ? Math.min(equippedOptic, spec.maxSupportedScope) : 0;
    const levelSet = new Set<number>(
      spec.zoomLevels.length > 0 ? spec.zoomLevels : [spec.defaultZoom],
    );
    if (clampedOptic > 0) {
      levelSet.add(clampedOptic);
    }
    const zoomLevels = Array.from(levelSet).sort((a, b) => a - b);

    const reticleStyle: 'reflex' | 'tactical' | 'marksman' | 'sniper' =
      spec.reticleStyle === 'sniper' || clampedOptic >= 8
        ? 'sniper'
        : clampedOptic >= 4
          ? 'marksman'
          : spec.reticleStyle;
    const equippedOpticLabel = clampedOptic > 0 ? i18n.translateOpticLabel(clampedOptic) : null;

    const configKey = `${weapon.definition.id}:${clampedOptic}:${zoomLevels.join(',')}`;
    if (configKey !== this.lastScopeConfigKey) {
      this.lastScopeConfigKey = configKey;
      if (clampedOptic > 0 && zoomLevels.includes(clampedOptic)) {
        this.activeScopeZoom = clampedOptic;
      } else {
        this.activeScopeZoom = zoomLevels.includes(spec.defaultZoom)
          ? spec.defaultZoom
          : zoomLevels[0];
      }
    }

    const cacheKey = `${configKey}:${i18n.getLanguage()}`;
    if (cacheKey === this.lastScopeProfileCacheKey) {
      return this.cachedScopeProfile;
    }

    this.lastScopeProfileCacheKey = cacheKey;
    this.cachedScopeProfile = {
      canScope: true,
      zoomLevels,
      reticleStyle,
      equippedOpticLabel,
    };
    return this.cachedScopeProfile;
  }

  private cycleActiveScopeZoom(step: 1 | -1): void {
    const levels = this.cachedScopeProfile.zoomLevels;
    if (!this.cachedScopeProfile.canScope || levels.length <= 1) return;
    const currentIdx = levels.indexOf(this.activeScopeZoom);
    const baseIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextIdx = (baseIdx + step + levels.length) % levels.length;
    this.activeScopeZoom = levels[nextIdx];
    this.audioManager.playClick();
  }

  private async enterRankedScreen(): Promise<void> {
    this.uiManager.rankedScreen.setStatusBanner('');
    this.uiManager.rankedScreen.setConnectionState(
      this.rankedNetwork.state,
      this.rankedNetwork.getRttMs(),
    );
    const cachedProfile =
      this.preparedAuthSession?.profile ?? this.rankedApi.getCachedProfile();
    if (cachedProfile) {
      this.uiManager.rankedScreen.setProfile(cachedProfile);
    }

    if (this.firebaseActiveUid && !this.rankedApi.hasBackendSessionToken()) {
      await this.tryRefreshFirebaseBackendSession();
    }

    if (this.rankedApi.hasBackendSessionToken() || !this.firebaseActiveUid) {
      try {
        const profile = await this.rankedApi.ensureProfile();
        this.uiManager.rankedScreen.setProfile(profile);
        if (profile.vault) {
          this.shopManager.mergeServerVaultState(profile.vault);
        }
      } catch (err) {
        if (!cachedProfile) {
          this.uiManager.rankedScreen.setStatusBanner(
            err instanceof Error ? i18n.translateServerMessage(err.message) : i18n.t('ranked.unableServer'),
          );
          return;
        }
      }
    }

    if (this.rankedApi.hasBackendSessionToken() || !this.firebaseActiveUid) {
      try {
        await this.ensureRankedSocketConnected();
      } catch {
        this.rankedAuthReady = false;
        this.uiManager.rankedScreen.setConnectionState(
          this.rankedNetwork.state,
          this.rankedNetwork.getRttMs(),
        );
        this.uiManager.rankedScreen.setStatusBanner(i18n.t('ranked.wsUnavailable'));
      }
    } else {
      this.rankedAuthReady = false;
      this.uiManager.rankedScreen.setConnectionState(
        this.rankedNetwork.state,
        this.rankedNetwork.getRttMs(),
      );
      this.uiManager.rankedScreen.setStatusBanner(i18n.t('ranked.wsUnavailable'));
    }

    try {
      const [status, leaderboard] = await Promise.all([
        this.rankedApi.fetchServerStatus(),
        this.rankedApi.fetchLeaderboard(50),
      ]);
      this.uiManager.rankedScreen.setServerStatus(status);
      this.uiManager.rankedScreen.setLeaderboard(leaderboard);
    } catch {
      // Ignore transient HTTP refresh error
    }

    this.stopRankedStatusPoll();
    this.rankedStatusTimer = window.setInterval(() => {
      if (this.uiManager.getCurrentScreen() !== 'ranked') return;
      this.uiManager.rankedScreen.setConnectionState(
        this.rankedNetwork.state,
        this.rankedNetwork.getRttMs(),
      );
      void this.rankedApi
        .fetchServerStatus()
        .then((s) => this.uiManager.rankedScreen.setServerStatus(s))
        .catch(() => {});
    }, 3000);
  }

  private stopRankedStatusPoll(): void {
    if (this.rankedStatusTimer) {
      clearInterval(this.rankedStatusTimer);
      this.rankedStatusTimer = 0;
    }
  }

  private sendRankedAuthHello(): void {
    const creds = this.rankedApi.getCredentials();
    if (!creds) return;
    this.rankedNetwork.sendAuthHello({
      playerId: creds.playerId,
      secretToken: creds.secretToken,
      firebaseIdToken: this.latestFirebaseIdToken ?? undefined,
      characterId: this.characterManager.getSelectedCharacter().id,
      customization: { ...this.r6Customization },
      avatarId: this.shopManager.getEquippedAvatarId(),
      bannerId: this.shopManager.getEquippedBannerId(),
      weaponSkins: this.shopManager.getEquippedWeaponSkins(),
    });
    if (this.firebaseActiveUid) {
      void this.firebaseAuthService.getIdToken(false).then((tok) => {
        if (tok && tok !== this.latestFirebaseIdToken) {
          this.latestFirebaseIdToken = tok;
          this.rankedApi.setFirebaseIdToken(tok);
          if (this.rankedNetwork.state === 'connected') {
            this.rankedNetwork.updateFirebaseToken(tok);
          }
        }
      });
    }
  }

  private buildLocalSelfSquadMember(): SquadMemberInfo {
    const snap = this.playerProfileManager.getSnapshot();
    const selfId = this.localRankedPlayerId ?? snap.playerId ?? 'local';
    return {
      playerId: selfId,
      numericId: snap.numericId || selfId,
      name: snap.username,
      tier: snap.tier,
      rp: snap.rp,
      level: snap.level,
      characterId: this.characterManager.getSelectedCharacter().id,
      customization: { ...this.r6Customization },
      avatarId: this.shopManager.getEquippedAvatarId(),
      bannerId: this.shopManager.getEquippedBannerId(),
      isLeader: true,
      ready: false,
      status: 'not-ready',
      isSelf: true,
    };
  }

  private buildLocalFallbackSquadState(maxSize: SquadSize): SquadStateSnapshot {
    const selfMember = this.buildLocalSelfSquadMember();
    return {
      squadId: null,
      maxSize,
      leaderId: selfMember.playerId,
      members: [selfMember],
      pendingInviteIds: [],
    };
  }

  private syncLobbySquadVisuals(snap: boolean): void {
    if (this.uiManager.getCurrentScreen() !== 'main-menu') {
      this.militaryLobby.setSquadStageVisible(false);
      this.cameraManager.setLobbySquadCount(1, true);
      return;
    }

    const baseState =
      this.lobbySquadState ?? this.buildLocalFallbackSquadState(this.lobbySquadSize);
    const localId = this.localRankedPlayerId;
    const members: SquadMemberInfo[] = baseState.members.map((m) =>
      m.isSelf || (localId !== null && m.playerId === localId)
        ? {
            ...m,
            isSelf: true,
            characterId: this.characterManager.getSelectedCharacter().id,
            customization: { ...this.r6Customization },
            avatarId: this.shopManager.getEquippedAvatarId(),
            bannerId: this.shopManager.getEquippedBannerId(),
          }
        : m,
    );

    if (members.length === 0) {
      members.push(this.buildLocalSelfSquadMember());
    }

    const effectiveSelfId = localId ?? members.find((m) => m.isSelf)?.playerId ?? 'local';
    this.militaryLobby.setSquadStageVisible(true);
    const placement = this.militaryLobby.setSquadMembers(members, effectiveSelfId, snap);
    this.player.position.set(placement.localSlotX, 0, placement.localSlotZ);
    this.player.rotation.y = placement.localSlotYaw;
    this.cameraManager.setLobbySquadCount(placement.totalShown, snap);
  }

  private applyFriendsSnapshotState(state: {
    friends: SquadFriendEntry[];
    incomingRequests: FriendRequestEntry[];
    outgoingTargetIds: string[];
    outgoingRequests?: OutgoingFriendRequestEntry[];
  }): void {
    this.lobbyFriendsList = state.friends;
    this.lobbyFriendRequests = state.incomingRequests;
    this.lobbyOutgoingFriendTargetIds = state.outgoingTargetIds;
    if (Array.isArray(state.outgoingRequests)) {
      this.lobbyOutgoingFriendRequests = state.outgoingRequests;
    }
    this.uiManager.setMainMenuFriendsList(this.lobbyFriendsList);
    this.uiManager.setMainMenuFriendRequests(
      this.lobbyFriendRequests,
      this.lobbyOutgoingFriendTargetIds,
      this.lobbyOutgoingFriendRequests,
    );
  }

  private applyMailboxState(state: MailboxStateSnapshot): void {
    this.lobbyMailboxState = state;
    this.uiManager.setMainMenuMailboxState(state);
  }

  private async refreshMailboxState(notifyOnNewUnread = false): Promise<void> {
    if (this.isDisposed) return;
    const prevUnread = this.lobbyMailboxState.unreadCount;
    try {
      const next = await this.rankedApi.fetchMailboxState();
      if (this.isDisposed) return;
      this.applyMailboxState(next);
      if (notifyOnNewUnread && next.unreadCount > prevUnread) {
        this.uiManager.showLobbyToast(i18n.t('mail.toast.newMail'), 'info');
        this.audioManager.playClick();
      }
    } catch {
      // Ignore transient mailbox sync failures
    }
  }

  private scheduleLobbyPresenceReconnect(): void {
    if (this.isDisposed || this.lobbyReconnectTimer) return;
    if (this.uiManager.getCurrentScreen() !== 'main-menu') return;
    this.lobbyReconnectTimer = window.setTimeout(() => {
      this.lobbyReconnectTimer = 0;
      if (this.isDisposed || this.uiManager.getCurrentScreen() !== 'main-menu') return;
      void this.ensureLobbyPresenceConnected();
    }, 2500);
  }

  private async tryRefreshFirebaseBackendSession(): Promise<boolean> {
    if (!this.firebaseActiveUid || !this.localRankedPlayerId) return false;
    const currentUser = this.firebaseAuthService.getCurrentUser();
    if (!currentUser || currentUser.uid !== this.firebaseActiveUid) return false;
    try {
      const idToken = await currentUser.getIdToken();
      if (!idToken) return false;
      this.latestFirebaseIdToken = idToken;
      this.rankedApi.setFirebaseIdToken(idToken);
      const cached =
        this.preparedAuthSession?.profile ?? this.rankedApi.getCachedProfile();
      const { res, data } = await fetchApiJson<{
        profile?: RankedProfile;
        secretToken?: string;
      }>(getApiUrl('/api/firebase/session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          platform: this.rankedApi.getPlatform(),
          displayName: cached?.name || currentUser.displayName,
          existingCloudIds: {
            playerId: this.localRankedPlayerId,
            numericId: cached?.numericId || this.localRankedPlayerId,
          },
        }),
      });
      if (!res.ok || !data.profile || !data.secretToken) {
        return false;
      }
      const nextProfile = cached ?? data.profile;
      this.rankedApi.setAuthenticatedSession(
        {
          playerId: data.profile.playerId,
          secretToken: data.secretToken,
        },
        nextProfile,
      );
      if (this.preparedAuthSession && this.preparedAuthSession.uid === this.firebaseActiveUid) {
        this.preparedAuthSession = {
          ...this.preparedAuthSession,
          secretToken: data.secretToken,
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  private async ensureLobbyPresenceConnected(): Promise<boolean> {
    if (this.rankedNetwork.state === 'connected' && this.rankedAuthReady) {
      return true;
    }
    if (!this.lobbyPresencePromise) {
      this.lobbyPresencePromise = (async () => {
        try {
          if (this.firebaseActiveUid && !this.rankedApi.hasBackendSessionToken()) {
            const refreshed = await this.tryRefreshFirebaseBackendSession();
            if (!refreshed) {
              this.rankedAuthReady = false;
              this.scheduleLobbyPresenceReconnect();
              return;
            }
          } else {
            await this.rankedApi.ensureProfile();
          }
          await this.ensureRankedSocketConnected();
          if (this.rankedNetwork.state === 'connected' && this.rankedAuthReady) {
            this.rankedNetwork.requestFriendsList();
            if (this.lobbySquadSize !== 1) {
              this.rankedNetwork.setSquadSize(this.lobbySquadSize);
            }
          }
          void this.refreshMailboxState();
        } catch {
          this.rankedAuthReady = false;
          if (!this.firebaseActiveUid) {
            const fallbackState = await this.rankedApi.fetchFriendsState().catch(() => null);
            if (fallbackState) {
              this.applyFriendsSnapshotState(fallbackState);
            }
          }
          void this.refreshMailboxState();
          this.scheduleLobbyPresenceReconnect();
        } finally {
          this.lobbyPresencePromise = null;
        }
      })();
    }
    await this.lobbyPresencePromise;
    return this.rankedNetwork.state === 'connected' && this.rankedAuthReady;
  }

  private async handleCreateParty(): Promise<void> {
    if (this.lobbySquadState?.squadId) {
      return;
    }
    this.lobbySquadSize = 4;
    this.uiManager.setMainMenuSquadSize(4);
    const connected = await this.ensureLobbyPresenceConnected();
    if (connected) {
      this.rankedNetwork.createParty(4);
      this.rankedNetwork.requestFriendsList();
    }
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.createParty(4).catch(() => {});
    }
    this.uiManager.showLobbyToast(i18n.t('toast.partyCreated'), 'info');
  }

  private async handleSelectSquadSize(size: SquadSize): Promise<void> {
    const inParty = Boolean(this.lobbySquadState?.squadId);
    const selfMember = this.lobbySquadState?.members.find((m) => m.isSelf);
    const isSelfLeader = selfMember ? selfMember.isLeader : true;
    if (inParty && !isSelfLeader && size !== 1) {
      this.uiManager.setMainMenuSquadSize(this.lobbySquadSize);
      this.uiManager.showLobbyToast(i18n.t('toast.onlyLeaderCanStart'), 'error');
      return;
    }
    if (size === 1) {
      await this.handleLeaveSquad();
      return;
    }
    if (inParty && this.lobbySquadState && size < this.lobbySquadState.members.length) {
      this.uiManager.setMainMenuSquadSize(this.lobbySquadSize);
      return;
    }

    this.lobbySquadSize = size;
    this.uiManager.setMainMenuSquadSize(size);
    if (this.lobbySquadState) {
      this.lobbySquadState = {
        ...this.lobbySquadState,
        maxSize: size,
      };
      this.uiManager.setMainMenuSquadState(this.lobbySquadState);
      this.syncLobbySquadVisuals(false);
    } else {
      this.syncLobbySquadVisuals(false);
    }

    const connected = await this.ensureLobbyPresenceConnected();
    if (connected) {
      this.rankedNetwork.setSquadSize(this.lobbySquadSize);
      this.rankedNetwork.requestFriendsList();
    }
    if (this.firebaseActiveUid && (size === 2 || size === 4)) {
      if (this.firebasePartyService.getActivePartyId()) {
        void this.firebasePartyService.resizeParty(size).catch(() => {});
      } else {
        void this.firebasePartyService.createParty(size).catch(() => {});
      }
    }
  }

  private async handleToggleSquadReady(ready: boolean): Promise<void> {
    const connected = await this.ensureLobbyPresenceConnected();
    if (connected) {
      this.rankedNetwork.setSquadReady(ready);
    }
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.setMemberStatus(ready ? 'ready' : 'not-ready').catch(() => {});
    }
  }

  private async handleTransferSquadLeader(targetPlayerId: string): Promise<void> {
    const connected = await this.ensureLobbyPresenceConnected();
    if (connected) {
      this.rankedNetwork.transferSquadLeader(targetPlayerId);
    }
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.transferLeadership(targetPlayerId).catch(() => {});
    }
  }

  private async handleInviteFriend(friendId: string): Promise<void> {
    const inParty = Boolean(this.lobbySquadState?.squadId);
    const selfMember = this.lobbySquadState?.members.find((m) => m.isSelf);
    const isSelfLeader = selfMember ? selfMember.isLeader : true;
    if (inParty && !isSelfLeader) {
      this.uiManager.showLobbyToast(i18n.t('toast.onlyLeaderCanStart'), 'error');
      return;
    }

    const friendEntry = this.lobbyFriendsList.find((f) => f.playerId === friendId);
    if (friendEntry?.status === 'offline') {
      this.uiManager.showLobbyToast(i18n.translateServerMessage('Friend is currently offline'), 'error');
      return;
    }
    if (friendEntry?.status === 'in-match') {
      this.uiManager.showLobbyToast(i18n.translateServerMessage('Player is currently in a match'), 'error');
      return;
    }
    if (
      inParty &&
      this.lobbySquadState &&
      this.lobbySquadState.members.length >= Math.min(4, this.lobbySquadState.maxSize)
    ) {
      this.uiManager.showLobbyToast(i18n.translateServerMessage('Squad is already full'), 'error');
      return;
    }

    if (this.lobbySquadSize === 1) {
      this.lobbySquadSize = 4;
      this.uiManager.setMainMenuSquadSize(4);
    }
    const connected = await this.ensureLobbyPresenceConnected();
    if (!connected) return;
    this.rankedNetwork.inviteFriendToSquad(friendId);
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.sendPartyInvite(friendId).catch(() => {});
    }
    if (friendEntry?.name) {
      this.uiManager.showLobbyToast(i18n.t('toast.squadInviteSent', { name: friendEntry.name }), 'info');
    }
  }

  private async handleRespondSquadInvite(inviteId: string, accept: boolean): Promise<void> {
    this.uiManager.setMainMenuIncomingSquadInvite(null);
    if (this.firebaseActiveUid && this.firebasePartyService.hasCloudInvite(inviteId)) {
      void this.firebasePartyService.respondToPartyInvite(inviteId, accept).catch(() => {});
    }
    const connected = await this.ensureLobbyPresenceConnected();
    if (!connected) return;
    this.rankedNetwork.respondToSquadInvite(inviteId, accept);
  }

  private async handleLeaveSquad(): Promise<void> {
    this.lobbySquadSize = 1;
    this.lobbySquadState = this.buildLocalFallbackSquadState(1);
    this.uiManager.setMainMenuSquadState(this.lobbySquadState);
    this.uiManager.setMainMenuFriendsPanelOpen(false);
    this.syncLobbySquadVisuals(false);

    const connected = await this.ensureLobbyPresenceConnected();
    if (connected) {
      this.rankedNetwork.leaveSquad();
    }
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.leaveParty().catch(() => {});
    }
  }

  private async handleKickSquadMember(playerId: string): Promise<void> {
    const connected = await this.ensureLobbyPresenceConnected();
    if (!connected) return;
    this.rankedNetwork.kickSquadMember(playerId);
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.kickMember(playerId).catch(() => {});
    }
  }

  private async ensureRankedSocketConnected(): Promise<void> {
    if (this.rankedNetwork.state !== 'connected') {
      this.rankedAuthReady = false;
      await this.rankedNetwork.connect();
    }
    if (!this.rankedAuthReady) {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (err?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          unsub();
          if (err) reject(err);
          else resolve();
        };
        const unsub = this.rankedNetwork.onPacket((pkt) => {
          if (pkt.type === 'auth:ok') {
            this.rankedAuthReady = true;
            finish();
          } else if (pkt.type === 'auth:error') {
            const rawMsg = (pkt.payload as { message?: string })?.message;
            const msg = rawMsg ? i18n.translateServerMessage(rawMsg) : i18n.t('ranked.authFailed');
            finish(new Error(msg));
          }
        });
        const timeout = window.setTimeout(() => {
          finish(new Error(i18n.t('ranked.authTimedOut')));
        }, 4500);
        this.sendRankedAuthHello();
      });
    }
  }

  private async startRankedQueue(preferredMap: RankedMapId | 'any'): Promise<void> {
    this.uiManager.rankedScreen.setStatusBanner('');
    try {
      if (this.firebaseActiveUid && !this.rankedApi.hasBackendSessionToken()) {
        const refreshed = await this.tryRefreshFirebaseBackendSession();
        if (!refreshed) {
          throw new Error(i18n.t('ranked.wsUnavailable'));
        }
      } else {
        await this.rankedApi.ensureProfile();
      }
      await this.ensureRankedSocketConnected();
      this.rankedNetwork.joinQueue({
        preferredMap,
        characterId: this.characterManager.getSelectedCharacter().id,
        customization: { ...this.r6Customization },
        avatarId: this.shopManager.getEquippedAvatarId(),
        bannerId: this.shopManager.getEquippedBannerId(),
        weaponSkins: this.shopManager.getEquippedWeaponSkins(),
      });
    } catch (err) {
      this.rankedAuthReady = false;
      this.uiManager.rankedScreen.setConnectionState(
        this.rankedNetwork.state,
        this.rankedNetwork.getRttMs(),
      );
      this.uiManager.rankedScreen.setStatusBanner(
        err instanceof Error ? i18n.translateServerMessage(err.message) : i18n.t('ranked.unableQueue'),
      );
    }
  }

  private handleRankedPacket(type: string, rawPayload: unknown): void {
    switch (type) {
      case 'auth:ok': {
        this.rankedAuthReady = true;
        const p = rawPayload as { profile?: RankedProfile };
        if (p?.profile) {
          this.uiManager.rankedScreen.setProfile(p.profile);
          this.localRankedPlayerId = p.profile.playerId;
          if (p.profile.vault) {
            this.shopManager.mergeServerVaultState(p.profile.vault);
          }
        }
        this.rankedNetwork.requestFriendsList();
        break;
      }
      case 'friends:list': {
        if (this.firebaseActiveUid) break;
        const p = rawPayload as { friends?: SquadFriendEntry[] };
        this.lobbyFriendsList = Array.isArray(p?.friends) ? p.friends : [];
        this.uiManager.setMainMenuFriendsList(this.lobbyFriendsList);
        break;
      }
      case 'friends:requests': {
        if (this.firebaseActiveUid) break;
        const p = rawPayload as {
          requests?: FriendRequestEntry[];
          outgoingTargetIds?: string[];
          outgoingRequests?: OutgoingFriendRequestEntry[];
        };
        this.lobbyFriendRequests = Array.isArray(p?.requests) ? p.requests : [];
        if (Array.isArray(p?.outgoingTargetIds)) {
          this.lobbyOutgoingFriendTargetIds = p.outgoingTargetIds;
        }
        if (Array.isArray(p?.outgoingRequests)) {
          this.lobbyOutgoingFriendRequests = p.outgoingRequests;
        }
        this.uiManager.setMainMenuFriendRequests(
          this.lobbyFriendRequests,
          this.lobbyOutgoingFriendTargetIds,
          this.lobbyOutgoingFriendRequests,
        );
        break;
      }
      case 'friends:requestReceived': {
        if (this.firebaseActiveUid) break;
        const p = rawPayload as { request?: FriendRequestEntry };
        if (
          p?.request &&
          !this.lobbyFriendRequests.some((r) => r.requestId === p.request!.requestId)
        ) {
          this.lobbyFriendRequests = [p.request, ...this.lobbyFriendRequests];
          this.uiManager.setMainMenuFriendRequests(
            this.lobbyFriendRequests,
            this.lobbyOutgoingFriendTargetIds,
            this.lobbyOutgoingFriendRequests,
          );
          this.audioManager.playClick();
        }
        break;
      }
      case 'friends:requestResponded': {
        if (this.firebaseActiveUid) break;
        const p = rawPayload as { accepted?: boolean };
        this.rankedNetwork.requestFriendsList();
        if (p?.accepted) {
          this.audioManager.playDeploy();
        }
        break;
      }
      case 'mailbox:updated': {
        void this.refreshMailboxState(true);
        break;
      }
      case 'squad:state': {
        const incoming = rawPayload as SquadStateSnapshot;
        if (!incoming || !Array.isArray(incoming.members)) break;
        const prevState = this.lobbySquadState;
        const prevCount = prevState?.members.length ?? 1;
        if (prevState?.squadId && incoming.squadId === prevState.squadId) {
          const prevIds = new Set(prevState.members.map((m) => m.playerId));
          const nextIds = new Set(incoming.members.map((m) => m.playerId));
          for (const m of incoming.members) {
            if (!m.isSelf && !prevIds.has(m.playerId)) {
              this.uiManager.showLobbyToast(i18n.t('toast.squadJoined', { name: m.name }), 'success');
            }
          }
          for (const m of prevState.members) {
            if (!m.isSelf && !nextIds.has(m.playerId)) {
              this.uiManager.showLobbyToast(i18n.t('toast.squadLeft', { name: m.name }), 'info');
            }
          }
        }
        this.lobbySquadState = incoming;
        this.lobbySquadSize = incoming.maxSize;
        this.uiManager.setMainMenuSquadState(incoming);
        this.syncFirebasePresenceStatus();
        if (incoming.members.length !== prevCount) {
          this.audioManager.playClick();
        }
        if (this.uiManager.getCurrentScreen() === 'main-menu') {
          this.syncLobbySquadVisuals(false);
        }
        break;
      }
      case 'squad:inviteReceived': {
        const notif = rawPayload as SquadInviteNotification;
        if (notif?.inviteId) {
          this.uiManager.setMainMenuIncomingSquadInvite(notif);
          this.audioManager.playClick();
        }
        break;
      }
      case 'squad:inviteDeclined': {
        const p = rawPayload as { name?: string };
        if (p?.name) {
          this.uiManager.showLobbyToast(i18n.t('toast.squadInviteDeclined', { name: p.name }), 'info');
        }
        this.rankedNetwork.requestFriendsList();
        break;
      }
      case 'squad:leaderTransferred': {
        const p = rawPayload as { newLeaderName?: string };
        if (p?.newLeaderName) {
          this.uiManager.showLobbyToast(
            i18n.t('toast.leaderTransferred', { name: p.newLeaderName }),
            'info',
          );
          this.audioManager.playClick();
        }
        break;
      }
      case 'squad:kicked': {
        const p = rawPayload as { byName?: string };
        this.uiManager.showLobbyToast(
          i18n.t('toast.kickedFromParty', { name: p?.byName ?? 'Leader' }),
          'error',
        );
        this.audioManager.playBack();
        break;
      }
      case 'squad:brMatchLaunch': {
        const p = rawPayload as { config?: Partial<BattleRoyaleMatchConfig> };
        const mapId = p?.config?.mapId ?? this.settingsManager.getSettings().selectedMapId;
        this.beginWaitingLobbyEntry({
          ...this.activeBattleRoyaleConfig,
          ...(p?.config ?? {}),
          mapId,
          squadSize: this.lobbySquadSize,
          squadAllies: this.buildBattleRoyaleSquadAllies(),
        });
        break;
      }
      case 'auth:error':
      case 'server:error': {
        const p = rawPayload as { message?: string };
        const msg = p?.message
          ? i18n.translateServerMessage(p.message)
          : i18n.t('ranked.serverError');
        this.uiManager.rankedScreen.setStatusBanner(msg);
        if (this.uiManager.getCurrentScreen() !== 'ranked') {
          this.uiManager.showLobbyToast(msg, 'error');
        }
        if (this.isRankedQueuingFromLobby) {
          this.isRankedQueuingFromLobby = false;
          this.uiManager.setMainMenuRankedQueueState(false);
        }
        break;
      }
      case 'server:status': {
        this.uiManager.rankedScreen.setServerStatus(rawPayload as ServerOnlineStatus);
        break;
      }
      case 'queue:update': {
        const p = rawPayload as {
          waitSec: number;
          rpTolerance: number;
          queuedPlayers: number;
          preferredMap?: RankedMapId | 'any';
        };
        this.uiManager.rankedScreen.setQueueState('queuing', p);
        if (!this.isRankedQueuingFromLobby && this.uiManager.getCurrentScreen() === 'main-menu') {
          this.isRankedQueuingFromLobby = true;
        }
        if (this.isRankedQueuingFromLobby) {
          const mapName =
            p.preferredMap && p.preferredMap !== 'any'
              ? i18n.translateMapName(
                  MAP_LIST.find((m) => m.id === p.preferredMap)?.id ?? p.preferredMap,
                )
              : undefined;
          this.uiManager.setMainMenuRankedQueueState(true, {
            waitSec: p.waitSec,
            queuedPlayers: p.queuedPlayers,
            mapName,
          });
        }
        break;
      }
      case 'queue:left':
      case 'lobby:left': {
        this.isRankedQueuingFromLobby = false;
        this.uiManager.setMainMenuRankedQueueState(false);
        this.uiManager.rankedScreen.setQueueState('idle');
        break;
      }
      case 'lobby:state': {
        this.uiManager.rankedScreen.setQueueState('lobby', undefined, rawPayload as LobbySnapshot);
        break;
      }
      case 'match:start': {
        this.startRankedMatchFromServer(
          rawPayload as {
            matchId: string;
            selfPlayerId: string;
            selfSquadId?: string | null;
            mapId: RankedMapId;
            matchSeed: number;
            matchPhase?: MatchLifecyclePhase;
            waitingRemainingSec?: number;
            waitingDurationSec?: number;
            flightIdx: number;
            flightProgress: number;
            totalPlayers: number;
            players: RemotePlayerSnapshot[];
            zone: ServerZoneState;
            collectedLootIds: string[];
            droppedLoot: DroppedLootSync[];
            glooWalls?: ServerGlooWall[];
            selfGlooWalls?: number;
          },
        );
        break;
      }
      case 'match:playerJoined': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { player: RemotePlayerSnapshot; totalPlayers: number };
        if (p?.player) {
          this.remotePlayerManager.addOrUpdateSinglePlayer(p.player);
          this.rankedWaitingParticipantCount = p.totalPlayers;
          this.rankedAliveCount = p.totalPlayers;
          this.uiManager.showArenaToast(
            i18n.t('toast.joinedWaiting', { name: p.player.name, count: p.totalPlayers }),
          );
        }
        break;
      }
      case 'match:playerLeft': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { playerId: string; totalPlayers: number };
        if (p?.playerId) {
          const leftName = this.remotePlayerManager.getPlayerName(p.playerId);
          this.remotePlayerManager.removePlayer(p.playerId);
          this.rankedWaitingParticipantCount = p.totalPlayers;
          this.rankedAliveCount = p.totalPlayers;
          if (leftName) {
            this.uiManager.showArenaToast(
              i18n.t('toast.leftWaiting', { name: leftName, count: p.totalPlayers }),
            );
          }
        }
        break;
      }
      case 'match:dropStart': {
        if (this.matchMode !== 'ranked') return;
        this.transitionRankedToAirplaneFromServer(
          rawPayload as {
            matchId: string;
            mapId: RankedMapId;
            matchSeed: number;
            flightIdx: number;
            flightProgress: number;
            totalPlayers: number;
            players: RemotePlayerSnapshot[];
          },
        );
        break;
      }
      case 'match:requeued': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { reason?: string };
        this.cleanupRankedMatch(false);
        this.isRankedQueuingFromLobby = true;
        this.uiManager.showScreen('main-menu');
        this.uiManager.setMainMenuRankedQueueState(true, {
          waitSec: 0,
          queuedPlayers: 1,
          message: p?.reason ?? i18n.t('toast.requeuing'),
        });
        break;
      }
      case 'match:state': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as {
          matchPhase?: MatchLifecyclePhase;
          waitingRemainingSec?: number;
          flightProgress: number;
          aliveCount: number;
          totalPlayers?: number;
          zone: ServerZoneState;
          players: (RemotePlayerSnapshot | RemotePlayerDeltaSnapshot)[];
        };
        if (p.matchPhase === 'waiting') {
          this.airplaneDropManager.setServerWaitingRemainingSec(p.waitingRemainingSec ?? 0);
          this.rankedWaitingParticipantCount = p.totalPlayers ?? p.aliveCount;
        } else {
          this.airplaneDropManager.setServerWaitingRemainingSec(null);
          this.airplaneDropManager.setServerFlightProgress(p.flightProgress);
        }
        this.safeZoneManager.applyServerZone(p.zone);
        this.mapManager.setRankedZoneState(p.zone);
        this.remotePlayerManager.syncPlayers(p.players);
        this.rankedAliveCount = p.aliveCount;
        if (this.airplaneDropManager.getPhase() !== 'waiting') {
          this.uiManager.syncRankedHudMatchState(
            this.rankedAliveCount,
            this.rankedLocalKills,
            this.safeZoneManager.getServerZone(),
          );
        }
        break;
      }
      case 'combat:remoteShot': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as {
          shooterId: string;
          weaponId: string;
          ox: number;
          oy: number;
          oz: number;
          dx: number;
          dy: number;
          dz: number;
        };
        this.remotePlayerManager.spawnRemoteShot(
          p.shooterId,
          p.weaponId,
          p.ox,
          p.oy,
          p.oz,
          p.dx,
          p.dy,
          p.dz,
          this.player.position,
        );
        break;
      }
      case 'combat:damage': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as {
          attackerId: string;
          targetId: string;
          weaponId: string;
          weaponName: string;
          isHeadshot: boolean;
          totalDamage: number;
          shieldDamage: number;
          healthDamage: number;
          distanceM: number;
          targetHealth: number;
          targetShield: number;
          hx?: number;
          hy?: number;
          hz?: number;
        };
        if (p.attackerId === this.localRankedPlayerId) {
          const targetEntity = this.remotePlayerManager.getPlayerName(p.targetId) ?? p.targetId;
          this.weaponManager.recordAuthoritativeHit({
            targetName: targetEntity,
            weaponName: p.weaponName,
            totalDamage: p.totalDamage,
            shieldDamage: p.shieldDamage,
            healthDamage: p.healthDamage,
            isHeadshot: p.isHeadshot,
            distance: p.distanceM,
          });
          if (p.totalDamage > 0) {
            let hitX = p.hx;
            let hitY = p.hy;
            let hitZ = p.hz;
            if (!Number.isFinite(hitX) || !Number.isFinite(hitY) || !Number.isFinite(hitZ)) {
              if (this.remotePlayerManager.getPlayerPosition(p.targetId, this.elimBurstPosScratch)) {
                hitX = this.elimBurstPosScratch.x;
                hitY = this.elimBurstPosScratch.y + (p.isHeadshot ? 1.55 : 1.05);
                hitZ = this.elimBurstPosScratch.z;
              }
            }
            if (hitX !== undefined && hitY !== undefined && hitZ !== undefined) {
              this.damageNumberSystem.spawn(hitX, hitY, hitZ, p.totalDamage, p.isHeadshot);
            }
          }
        }
        if (p.targetId === this.localRankedPlayerId) {
          this.inventoryManager.interruptHealing(i18n.t('inv.msg.healingInterruptedDmg'));
          this.player.stats.health = p.targetHealth;
          this.player.stats.shield = p.targetShield;
          this.audioManager.playHitmarker(p.isHeadshot);
          const localizedWeapon = i18n.translateWeaponName(p.weaponName);
          const attackerLabel =
            this.remotePlayerManager.getPlayerName(p.attackerId) ?? i18n.t('common.loading');
          this.uiManager.showArenaToast(
            i18n.t(p.isHeadshot ? 'toast.critDamage' : 'toast.hitDamage', {
              dmg: p.totalDamage,
              attacker: attackerLabel,
              weapon: localizedWeapon,
            }),
          );
        } else {
          this.remotePlayerManager.applyDamageUpdate(p.targetId, p.targetHealth, p.targetShield);
        }
        break;
      }
      case 'gloo:spawned': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { wall?: ServerGlooWall };
        if (p?.wall) {
          this.glooWallManager.spawnOrSync(p.wall);
          const dist = Math.hypot(
            p.wall.x - this.player.position.x,
            p.wall.z - this.player.position.z,
          );
          this.audioManager.playGlooDeploy(dist);
          if (p.wall.ownerId !== this.localRankedPlayerId) {
            const skin = getGlooWallSkinById(p.wall.skinId);
            this.remotePlayerManager.triggerGlooDeployAnimation(p.wall.ownerId, skin.accentHex);
          }
        }
        break;
      }
      case 'gloo:updated': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { wallId: string; hp: number; maxHp: number };
        if (p?.wallId) {
          this.glooWallManager.applyHpUpdate(p.wallId, p.hp, p.maxHp);
        }
        break;
      }
      case 'gloo:destroyed': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { wallId: string };
        if (p?.wallId) {
          this.glooWallManager.destroyWall(p.wallId);
        }
        break;
      }
      case 'gloo:inventory': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { glooWalls?: number };
        if (typeof p?.glooWalls === 'number') {
          this.inventoryManager.setGlooWalls(p.glooWalls);
        }
        break;
      }
      case 'player:vitals': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { health: number; shield: number; zoneDamage?: number };
        this.player.stats.health = p.health;
        this.player.stats.shield = p.shield;
        if (p.zoneDamage && p.zoneDamage > 0) {
          this.uiManager.showArenaToast(i18n.t('toast.outsideZoneDmg', { dmg: p.zoneDamage }));
        }
        break;
      }
      case 'loot:collected': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { lootId: string; collectorId: string };
        if (p.collectorId !== this.localRankedPlayerId) {
          this.lootManager.collectNode(p.lootId, p.collectorId);
        }
        break;
      }
      case 'loot:dropped': {
        if (this.matchMode !== 'ranked') return;
        const d = rawPayload as DroppedLootSync;
        this.lootManager.spawnSyncedDroppedItem(
          d.lootId,
          d.itemId,
          d.x,
          d.y,
          d.z,
          d.quantity,
          {
            weaponAmmoInMag: d.weaponAmmoInMag,
            armorDurability: d.armorDurability,
          },
        );
        break;
      }
      case 'match:elimination': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as {
          kill: KillFeedEntry;
          victimId: string;
          killerId: string | null;
          killerKills: number;
          aliveCount: number;
          placement?: number | null;
        };
        this.rankedAliveCount = p.aliveCount;
        this.uiManager.pushRankedKillFeed(p.kill);
        const isSelfKiller = p.killerId === this.localRankedPlayerId;
        const isSelfVictim = p.victimId === this.localRankedPlayerId;
        this.uiManager.showArenaKillNotification(
          p.kill.killerName,
          p.kill.victimName,
          p.kill.weaponName,
          p.kill.isHeadshot,
          isSelfKiller,
          isSelfVictim,
        );
        if (isSelfKiller) {
          this.rankedLocalKills = p.killerKills;
          this.audioManager.playKillConfirmed(p.kill.isHeadshot);
          this.uiManager.showArenaToast(
            i18n.t('toast.eliminatedVictim', { victim: p.kill.victimName }),
          );
        }
        if (isSelfVictim) {
          this.eliminationEffectSystem.spawnBurst(
            this.player.position.x,
            this.player.position.y,
            this.player.position.z,
            p.kill.isHeadshot,
          );
          this.rankedEliminated = true;
          this.player.stats.isAlive = false;
          this.player.stats.health = 0;
          this.player.stats.shield = 0;
          this.playerController.forceExitScope();
          this.uiManager.setArenaInventoryOpen(false);
          this.uiManager.setArenaFullMapOpen(false);
          this.inputManager.setPointerLockAllowed(false);
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          const spectateName = this.remotePlayerManager.getFirstAliveTargetPosition(
            this.spectatePos,
          );
          this.spectateTargetName = spectateName;
          const spectatingAlly = Boolean(
            p.placement === null && this.remotePlayerManager.hasAliveTeammate(),
          );
          this.uiManager.showRankedSpectatorBanner(spectateName, spectatingAlly);
          if (spectatingAlly && spectateName) {
            this.uiManager.showArenaToast(
              i18n.t('toast.spectatingSquadmate', { name: spectateName }),
            );
          }
        } else {
          if (this.remotePlayerManager.getPlayerPosition(p.victimId, this.elimBurstPosScratch)) {
            this.eliminationEffectSystem.spawnBurst(
              this.elimBurstPosScratch.x,
              this.elimBurstPosScratch.y,
              this.elimBurstPosScratch.z,
              p.kill.isHeadshot,
            );
          }
          this.remotePlayerManager.markEliminated(p.victimId);
        }
        this.uiManager.syncRankedHudMatchState(
          this.rankedAliveCount,
          this.rankedLocalKills,
          this.safeZoneManager.getServerZone(),
        );
        break;
      }
      case 'match:result': {
        if (this.matchMode !== 'ranked') return;
        const rankedResult = rawPayload as RankedMatchResultPayload;
        this.playerController.forceExitScope();
        this.uiManager.setArenaInventoryOpen(false);
        this.uiManager.setArenaFullMapOpen(false);
        this.inputManager.setPointerLockAllowed(false);
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
        if (rankedResult.isWinner) {
          this.audioManager.playVictory();
        }
        this.playerProfileManager.recordRankedMatchXp({
          placement: rankedResult.placement,
          totalPlayers: rankedResult.totalPlayers,
          kills: rankedResult.kills,
          damage: rankedResult.damage,
          survivedSec: rankedResult.survivedSec,
          isWinner: rankedResult.isWinner,
        });
        const rankedNx = this.shopManager.grantMatchCredits({
          placement: rankedResult.placement,
          kills: rankedResult.kills,
          damage: rankedResult.damage,
          isWinner: rankedResult.isWinner,
          isRanked: true,
        });
        this.uiManager.updateShopSnapshot(this.shopManager.getSnapshot());
        this.uiManager.showArenaToast(i18n.t('toast.nxEarned', { nx: rankedNx.creditsEarned }));
        this.uiManager.showRankedResultModal(rankedResult);
        void this.rankedApi
          .refreshProfile()
          .then((prof) => {
            if (prof) {
              this.uiManager.rankedScreen.setProfile(prof);
              this.playerProfileManager.syncFromRankedProfile(prof);
            }
          })
          .catch(() => {});
        void this.rankedApi
          .fetchLeaderboard(50)
          .then((entries) => this.uiManager.rankedScreen.setLeaderboard(entries))
          .catch(() => {});
        break;
      }
      case 'match:finished': {
        if (this.matchMode !== 'ranked') return;
        const p = rawPayload as { matchId: string; winnerId: string | null; winnerName: string };
        this.uiManager.updateRankedMatchWinner(p.winnerName);
        break;
      }
    }
  }

  private startRankedMatchFromServer(payload: {
    matchId: string;
    selfPlayerId: string;
    selfSquadId?: string | null;
    mapId: RankedMapId;
    matchSeed: number;
    matchPhase?: MatchLifecyclePhase;
    waitingRemainingSec?: number;
    waitingDurationSec?: number;
    flightIdx: number;
    flightProgress: number;
    totalPlayers: number;
    players: RemotePlayerSnapshot[];
    zone: ServerZoneState;
    collectedLootIds: string[];
    droppedLoot: DroppedLootSync[];
    glooWalls?: ServerGlooWall[];
    selfGlooWalls?: number;
  }): void {
    this.stopRankedStatusPoll();
    this.isRankedQueuingFromLobby = false;
    this.uiManager.setMainMenuRankedQueueState(false);
    this.uiManager.rankedScreen.setQueueState('idle');

    this.matchMode = 'ranked';
    this.syncFirebasePresenceStatus();
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.setMemberStatus('in-match').catch(() => {});
    }
    this.syncUnlimitedAmmoMode();
    this.activeRankedMatchId = payload.matchId;
    this.localRankedPlayerId = payload.selfPlayerId;
    this.rankedWaitingParticipantCount = payload.totalPlayers;
    this.rankedAliveCount = payload.players.filter((p) => p.isAlive).length;
    this.rankedLocalKills = 0;
    this.rankedEliminated = false;
    this.spectateTargetName = null;
    this.stateSendAccum = 0;
    this.glooWallManager.clearAll();
    this.damageNumberSystem.clear();
    this.eliminationEffectSystem.clearAll();

    this.phaseState = 'test-arena';
    this.inputManager.setEnabled(true);
    this.inputManager.setSuppressGameKeys(true);
    this.inputManager.resetCursorVisibleOverride();
    this.arenaCameraMode = 'PLAYER';
    this.uiManager.setArenaCameraModeLabel('PLAYER');
    this.uiManager.resetArenaOverlays();
    this.uiManager.setRankedMatchHudActive(true);

    const isWaitingPhase = (payload.matchPhase ?? 'waiting') === 'waiting';
    const destCfg = MAP_CONFIGS[payload.mapId];
    const cfg = isWaitingPhase
      ? this.mapManager.loadWaitingArena()
      : this.mapManager.loadMap(payload.mapId);
    this.enterArenaScene();

    this.weaponManager.setPracticeTargetsVisible(false);
    this.safeZoneManager.setActive(true);
    this.safeZoneManager.applyServerZone(payload.zone);
    this.mapManager.setRankedZoneState(payload.zone);

    this.remotePlayerManager.clearAll();
    this.remotePlayerManager.setLocalPlayerId(payload.selfPlayerId);
    this.remotePlayerManager.setLocalSquadId(payload.selfSquadId ?? null);
    this.remotePlayerManager.root.visible = true;
    this.remotePlayerManager.syncPlayers(payload.players);
    this.uiManager.setArenaSquadmateStatuses(this.remotePlayerManager.getSquadmateHudStatuses());

    const spawn = this.mapManager.spawnPointManager.getPrimarySpawn();
    this.player.movement.clearMovementModes();
    this.syncSelectedCharacterAppearance();
    this.characterManager.resetForArena();
    if (!isWaitingPhase) {
      this.lootManager.spawnForMapPoints(
        this.mapManager.getCombinedLootPoints(),
        spawn,
        payload.matchSeed,
      );
      for (const collectedId of payload.collectedLootIds) {
        this.lootManager.collectNode(collectedId, 'server');
      }
      for (const d of payload.droppedLoot) {
        this.lootManager.spawnSyncedDroppedItem(d.lootId, d.itemId, d.x, d.y, d.z, d.quantity, {
          weaponAmmoInMag: d.weaponAmmoInMag,
          armorDurability: d.armorDurability,
        });
      }
      if (payload.glooWalls) {
        for (const w of payload.glooWalls) {
          this.glooWallManager.spawnOrSync(w);
        }
      }
    } else {
      this.lootManager.clearAll();
    }

    this.weaponManager.syncEnvironmentMeshes();
    this.weaponManager.resetArenaLoadout();
    this.inventoryManager.resetStarterLoadout(2);
    if (typeof payload.selfGlooWalls === 'number') {
      this.inventoryManager.setGlooWalls(payload.selfGlooWalls);
    }

    // Wire online authoritative sync hooks
    this.airplaneDropManager.setOnWaitingCompleteCallback(undefined);
    this.airplaneDropManager.setOnlineSyncCallbacks({
      onJump: () => this.rankedNetwork.sendJump(),
      onDeployChute: () => this.rankedNetwork.sendDeployChute(),
    });

    this.inventoryManager.setOnlineSyncHooks({
      onCollectLoot: (lootId, itemId) => this.rankedNetwork.sendLootCollect({ lootId, itemId }),
      onDropLoot: (itemId, x, y, z, quantity, meta) =>
        this.rankedNetwork.sendLootDrop({
          itemId,
          x,
          y,
          z,
          quantity,
          weaponAmmoInMag: meta.weaponAmmoInMag,
          armorDurability: meta.armorDurability,
        }),
      onUseConsumable: (itemId) => this.rankedNetwork.sendUseConsumable(itemId),
    });

    this.weaponManager.controller.setOnShotFiredCallback((shot) => {
      this.rankedNetwork.sendShot(shot);
    });
    this.weaponManager.bulletSystem.setOnRemoteHitClaimCallback((claim) => {
      if (this.airplaneDropManager.getPhase() === 'waiting') {
        return true;
      }
      const wallId = extractGlooWallIdFromTarget(claim.targetId);
      if (wallId) {
        this.rankedNetwork.sendGlooDamage({
          wallId,
          weaponId: claim.weaponId,
          distance: claim.distance,
        });
        return true;
      }
      if (!this.remotePlayerManager.isRemoteTargetId(claim.targetId)) {
        return false;
      }
      this.rankedNetwork.sendHitClaim({
        targetId: claim.targetId,
        weaponId: claim.weaponId,
        isHeadshot: claim.isHeadshot,
        ox: claim.ox,
        oy: claim.oy,
        oz: claim.oz,
        dx: claim.dx,
        dy: claim.dy,
        dz: claim.dz,
        hx: claim.hx,
        hy: claim.hy,
        hz: claim.hz,
      });
      return true;
    });

    this.minimapAccum = 1;
    this.rangefinderAccum = 0.2;
    this.lastRangeMeters = null;
    this.lastAirbornePhase = '';
    this.uiManager.setActiveMapName(cfg.name, cfg.id);

    if (isWaitingPhase) {
      const selfSnap = payload.players.find((p) => p.playerId === payload.selfPlayerId);
      const waitDur = payload.waitingDurationSec ?? 30;
      const waitRem = payload.waitingRemainingSec ?? waitDur;
      this.airplaneDropManager.setServerFlightProgress(null);
      this.airplaneDropManager.setServerWaitingRemainingSec(waitRem);
      this.airplaneDropManager.startWaitingArena(
        cfg,
        payload.matchSeed,
        waitDur,
        payload.flightIdx,
        selfSnap ? { x: selfSnap.x, z: selfSnap.z, yaw: selfSnap.yaw } : undefined,
        payload.mapId,
      );
      this.mapManager.setAirborneFogScale(1.0);
      this.playerCamera.setWaitingPitchClamp(true);
      this.playerCamera.setAirborneAngles(this.player.rotation.y + Math.PI, 0.24);
      this.playerCamera.snapToPlayer(this.player.position);

      const dropSnap = this.airplaneDropManager.getSnapshot();
      this.uiManager.syncArenaAirdrop(dropSnap);
      this.uiManager.syncArenaWaitingBanner(
        dropSnap,
        i18n.t('toast.realPlayersOnly'),
        payload.totalPlayers,
      );
      this.uiManager.showScreen('test-arena', false);
      this.syncArenaPointerLock(true);
      this.audioManager.playDeploy();
      this.uiManager.showArenaToast(
        i18n.t('toast.waitingStartRanked', {
          count: payload.totalPlayers,
          map: i18n.translateMapName(destCfg.id),
        }),
      );
      return;
    }

    this.airplaneDropManager.setServerWaitingRemainingSec(null);
    this.airplaneDropManager.setServerFlightProgress(payload.flightProgress);
    this.airplaneDropManager.startMatchDrop(cfg, payload.matchSeed, payload.flightIdx);

    const dropSnap = this.airplaneDropManager.getSnapshot();
    this.playerCamera.setAirborneAngles(dropSnap.airplaneHeadingRad + Math.PI, 0.36);
    this.airborneCamTarget.set(dropSnap.airplaneX, dropSnap.airplaneY, dropSnap.airplaneZ);
    this.playerCamera.snapToPlayer(this.airborneCamTarget);

    this.inputManager.setPointerLockAllowed(false);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }

    this.mapManager.setAirborneFogScale(0.42);
    this.uiManager.syncArenaAirdrop(dropSnap);
    this.uiManager.syncRankedHudMatchState(
      this.rankedAliveCount,
      this.rankedLocalKills,
      this.safeZoneManager.getServerZone(),
    );
    this.uiManager.showScreen('test-arena', false);
    this.audioManager.playDeploy();
    this.uiManager.showArenaToast(
      i18n.t('toast.rankedStarted', {
        count: payload.totalPlayers,
        map: i18n.translateMapName(cfg.id),
      }),
    );
  }

  private transitionRankedToAirplaneFromServer(payload: {
    matchId: string;
    mapId: RankedMapId;
    matchSeed: number;
    flightIdx: number;
    flightProgress: number;
    totalPlayers: number;
    players: RemotePlayerSnapshot[];
  }): void {
    if (this.matchMode !== 'ranked' || payload.matchId !== this.activeRankedMatchId) return;
    // Unload Waiting Arena cleanly and load the actual ranked battle map
    const cfg = this.mapManager.loadMap(payload.mapId);
    this.weaponManager.syncEnvironmentMeshes();
    this.uiManager.setActiveMapName(cfg.name, cfg.id);
    const spawn = this.mapManager.spawnPointManager.getPrimarySpawn();

    this.rankedWaitingParticipantCount = payload.totalPlayers;
    this.rankedAliveCount = payload.players.filter((p) => p.isAlive).length;
    this.player.stats.reset();
    this.player.movement.clearMovementModes();
    this.characterManager.resetForArena();
    this.lootManager.spawnForMapPoints(
      this.mapManager.getCombinedLootPoints(),
      spawn,
      payload.matchSeed,
    );
    this.weaponManager.resetArenaLoadout();
    this.inventoryManager.resetStarterLoadout(GLOO_WALL_CONFIG.maxActivePerPlayer);
    this.glooWallManager.clearAll();
    this.damageNumberSystem.clear();
    this.eliminationEffectSystem.clearAll();
    this.remotePlayerManager.syncPlayers(payload.players);

    this.airplaneDropManager.setServerWaitingRemainingSec(null);
    this.airplaneDropManager.setServerFlightProgress(payload.flightProgress);
    this.airplaneDropManager.startMatchDrop(cfg, payload.matchSeed, payload.flightIdx);
    this.inputManager.clearJustPressed();

    const dropSnap = this.airplaneDropManager.getSnapshot();
    this.playerCamera.setWaitingPitchClamp(false);
    this.playerCamera.setAirborneAngles(dropSnap.airplaneHeadingRad + Math.PI, 0.36);
    this.airborneCamTarget.set(dropSnap.airplaneX, dropSnap.airplaneY, dropSnap.airplaneZ);
    this.playerCamera.snapToPlayer(this.airborneCamTarget);

    this.inputManager.setPointerLockAllowed(false);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }

    this.mapManager.setAirborneFogScale(0.42);
    this.lastAirbornePhase = '';
    this.minimapAccum = 1;
    this.uiManager.syncArenaAirdrop(dropSnap);
    this.uiManager.syncRankedHudMatchState(
      this.rankedAliveCount,
      this.rankedLocalKills,
      this.safeZoneManager.getServerZone(),
    );
    this.audioManager.playDeploy();
    this.uiManager.showArenaToast(
      i18n.t('toast.boardingAircraft', { map: i18n.translateMapName(cfg.id) }),
    );
  }

  private uploadLocalRankedState(): void {
    if (!this.activeRankedMatchId || this.rankedEliminated) return;
    const dropPhase = this.airplaneDropManager.getPhase() as MatchDropPhase;
    const nowMs = performance.now();
    if (dropPhase === 'airplane' && nowMs - this.lastAirplaneStateSentAt < 450) {
      return;
    }
    if (dropPhase === 'airplane') {
      this.lastAirplaneStateSentAt = nowMs;
    }

    const invSnap = this.inventoryManager.getSnapshot();
    const activeWeapon = this.weaponManager.getActiveWeapon();
    const animState = this.player.animationState as RankedAnimationState;

    this.rankedNetwork.sendPlayerState({
      x: Math.round(this.player.position.x * 100) / 100,
      y: Math.round(this.player.position.y * 100) / 100,
      z: Math.round(this.player.position.z * 100) / 100,
      yaw: Math.round(this.player.rotation.y * 1000) / 1000,
      pitch: Math.round(this.playerCamera.getPitch() * 1000) / 1000,
      dropPhase,
      animationState: animState,
      isCrouching: this.player.isCrouching,
      isSprinting: this.player.isSprinting,
      isGrounded: this.player.movement.isGrounded,
      activeWeaponId: activeWeapon ? activeWeapon.definition.id : null,
      armorTier: (invSnap.armorSlot?.definition.armorLevel ?? 0) as 0 | 1 | 2 | 3,
      helmetTier: (invSnap.helmetSlot?.definition.helmetLevel ?? 0) as 0 | 1 | 2 | 3,
      backpackTier: (invSnap.backpackSlot?.definition.backpackLevel ?? 0) as 0 | 1 | 2 | 3,
      damageReductionPct: invSnap.totalArmorReductionPct,
    });
  }

  private startBattleRoyaleMatch(config: BattleRoyaleMatchConfig): void {
    this.cleanupRankedMatch(false);
    this.battleRoyaleManager.clearMatch();
    this.brMatchStatsRecorded = false;
    this.isRankedQueuingFromLobby = false;
    this.uiManager.setMainMenuRankedQueueState(false);

    const effectiveConfig: BattleRoyaleMatchConfig = {
      ...config,
      squadSize: config.squadSize ?? this.lobbySquadSize,
      squadAllies: config.squadAllies ?? this.buildBattleRoyaleSquadAllies(),
    };
    this.activeBattleRoyaleConfig = { ...effectiveConfig };
    this.matchMode = 'battle-royale';
    this.syncFirebasePresenceStatus();
    if (this.rankedNetwork.state === 'connected' && this.rankedAuthReady) {
      this.rankedNetwork.setSquadMatchStatus(true);
    }
    if (this.firebaseActiveUid) {
      void this.firebasePartyService.setMemberStatus('in-match').catch(() => {});
    }
    this.syncUnlimitedAmmoMode();
    this.spectateTargetName = null;
    this.player.visuals.root.visible = true;

    this.phaseState = 'test-arena';
    this.inputManager.setEnabled(true);
    this.inputManager.setSuppressGameKeys(true);
    this.inputManager.resetCursorVisibleOverride();
    this.arenaCameraMode = 'PLAYER';
    this.uiManager.setArenaCameraModeLabel('PLAYER');
    this.uiManager.resetArenaOverlays();
    this.uiManager.setArenaHudMode('battle-royale');

    const matchSeed = this.createRandomMatchSeed();
    const battleMapCfg = MAP_CONFIGS[config.mapId];
    // Load the independent Orbital Staging Arena first; never pre-load or mix battle-map loot here
    const waitCfg = this.mapManager.loadWaitingArena();
    this.enterArenaScene();

    this.weaponManager.setPracticeTargetsVisible(false);
    this.player.movement.clearMovementModes();
    this.syncSelectedCharacterAppearance();
    this.characterManager.resetForArena();
    this.lootManager.clearAll();

    this.weaponManager.syncEnvironmentMeshes();
    this.weaponManager.resetArenaLoadout();
    this.inventoryManager.resetStarterLoadout(GLOO_WALL_CONFIG.maxActivePerPlayer);
    this.glooWallManager.clearAll();
    this.damageNumberSystem.clear();
    this.eliminationEffectSystem.clearAll();

    // Attribute local hits cleanly and block pre-match damage while inside the Waiting Arena
    this.weaponManager.bulletSystem.setOnRemoteHitClaimCallback((claim) => {
      if (this.airplaneDropManager.getPhase() === 'waiting') {
        return true;
      }
      if (extractGlooWallIdFromTarget(claim.targetId)) {
        return false;
      }
      this.battleRoyaleManager.recordLocalPlayerDamageHit(
        claim.targetId,
        claim.weaponName,
        claim.previewDamage.totalDamage,
        claim.isHeadshot,
      );
      return false;
    });

    this.airplaneDropManager.setOnlineSyncCallbacks(null);
    this.airplaneDropManager.setServerFlightProgress(null);
    this.airplaneDropManager.setServerWaitingRemainingSec(null);
    this.airplaneDropManager.startWaitingArena(
      waitCfg,
      matchSeed,
      30,
      undefined,
      undefined,
      config.mapId,
    );
    const dropSnap = this.airplaneDropManager.getSnapshot();

    this.airplaneDropManager.setOnWaitingCompleteCallback(() => {
      if (this.matchMode !== 'battle-royale') return;
      this.airplaneDropManager.setOnWaitingCompleteCallback(undefined);

      // Unload Waiting Arena cleanly and load the actual destination battle map
      const cfg = this.mapManager.loadMap(config.mapId);
      const battleSpawn = this.mapManager.spawnPointManager.getPrimarySpawn();
      this.uiManager.setActiveMapName(cfg.name, cfg.id);

      this.player.stats.reset();
      this.player.movement.clearMovementModes();
      this.characterManager.resetForArena();
      this.weaponManager.syncEnvironmentMeshes();
      const combinedLoot = this.mapManager.getCombinedLootPoints();
      this.lootManager.spawnForMapPoints(
        combinedLoot,
        battleSpawn,
        matchSeed,
      );
      this.weaponManager.resetArenaLoadout();
      this.inventoryManager.resetStarterLoadout(GLOO_WALL_CONFIG.maxActivePerPlayer);
      this.glooWallManager.clearAll();
      this.damageNumberSystem.clear();
      this.eliminationEffectSystem.clearAll();

      this.airplaneDropManager.startMatchDrop(cfg, matchSeed);
      this.inputManager.clearJustPressed();
      const nextDrop = this.airplaneDropManager.getSnapshot();
      this.battleRoyaleManager.enterAirplaneFromWaiting(
        combinedLoot,
        nextDrop.flightStartX,
        nextDrop.flightStartZ,
        nextDrop.flightEndX,
        nextDrop.flightEndZ,
      );

      this.playerCamera.setWaitingPitchClamp(false);
      this.playerCamera.setAirborneAngles(nextDrop.airplaneHeadingRad + Math.PI, 0.36);
      this.airborneCamTarget.set(nextDrop.airplaneX, nextDrop.airplaneY, nextDrop.airplaneZ);
      this.playerCamera.snapToPlayer(this.airborneCamTarget);

      this.inputManager.setPointerLockAllowed(false);
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      this.mapManager.setAirborneFogScale(0.42);
      this.lastAirbornePhase = '';
      this.minimapAccum = 1;
      this.uiManager.syncArenaAirdrop(nextDrop);
      this.uiManager.syncRankedHudMatchState(
        this.battleRoyaleManager.getAliveCount(true),
        0,
        this.battleRoyaleManager.getHudZoneState(),
      );
      this.audioManager.playDeploy();
      this.uiManager.showArenaToast(
        i18n.t('toast.boardingAircraft', { map: i18n.translateMapName(cfg.id) }),
      );
    });

    this.battleRoyaleManager.startMatch(
      effectiveConfig,
      battleMapCfg,
      dropSnap.flightStartX,
      dropSnap.flightStartZ,
      dropSnap.flightEndX,
      dropSnap.flightEndZ,
      matchSeed,
      this.playerProfileManager.getUsername(),
      'waiting',
    );
    this.uiManager.setArenaSquadmateStatuses(this.battleRoyaleManager.getSquadmateHudStatuses());

    const hudZone = this.battleRoyaleManager.getHudZoneState();
    this.safeZoneManager.setActive(true);
    this.safeZoneManager.applyServerZone(hudZone);
    this.mapManager.setRankedZoneState(hudZone);

    this.mapManager.setAirborneFogScale(1.0);
    this.playerCamera.setWaitingPitchClamp(true);
    this.playerCamera.setAirborneAngles(this.player.rotation.y + Math.PI, 0.24);
    this.playerCamera.snapToPlayer(this.player.position);

    this.minimapAccum = 1;
    this.rangefinderAccum = 0.2;
    this.lastRangeMeters = null;
    this.lastAirbornePhase = '';
    this.uiManager.setActiveMapName(waitCfg.name, waitCfg.id);
    this.uiManager.syncArenaAirdrop(dropSnap);
    this.uiManager.syncArenaWaitingBanner(
      dropSnap,
      i18n.t('toast.aiBotsMode'),
      this.battleRoyaleManager.getAliveCount(true),
    );
    this.uiManager.showScreen('test-arena', false);
    this.syncArenaPointerLock(true);
    this.audioManager.playDeploy();
    this.uiManager.showArenaToast(
      i18n.t('toast.waitingStartBr', {
        count: config.botCount,
        map: i18n.translateMapName(battleMapCfg.id),
      }),
    );
  }

  private cleanupBattleRoyaleMatch(): void {
    const wasBr = this.matchMode === 'battle-royale';
    this.matchMode = 'practice';
    this.syncFirebasePresenceStatus();
    if (wasBr) {
      if (this.rankedNetwork.state === 'connected' && this.rankedAuthReady) {
        this.rankedNetwork.setSquadMatchStatus(false);
      }
      if (this.firebaseActiveUid) {
        void this.firebasePartyService.setMemberStatus('not-ready').catch(() => {});
      }
    }
    this.syncUnlimitedAmmoMode();
    this.playerCamera.setWaitingPitchClamp(false);
    this.spectateTargetName = null;
    this.wasZipliningPrev = false;
    this.audioManager.setZiplineSliding(false);
    this.airplaneDropManager.setOnWaitingCompleteCallback(undefined);
    this.weaponManager.bulletSystem.setOnRemoteHitClaimCallback(undefined);
    this.weaponManager.setPracticeTargetsVisible(true);
    this.cancelManualGlooPreview(false);
    this.glooWallManager.clearAll();
    this.damageNumberSystem.clear();
    this.eliminationEffectSystem.clearAll();
    this.battleRoyaleManager.clearMatch();
    this.safeZoneManager.setActive(false);
    this.mapManager.setRankedZoneState(null);
    this.mapManager.setTeammateMarkers([]);
    this.mapManager.setEnemyMarkers([]);
    this.uiManager.setArenaSquadmateStatuses([]);
    this.uiManager.setArenaHudMode('practice');
    this.uiManager.resetArenaOverlays();
  }

  private cleanupRankedMatch(notifyServer: boolean): void {
    const wasRanked = this.matchMode === 'ranked';
    if (notifyServer && this.activeRankedMatchId) {
      this.rankedNetwork.sendLeaveMatch();
    }
    this.matchMode = 'practice';
    this.syncFirebasePresenceStatus();
    if (wasRanked && this.firebaseActiveUid) {
      void this.firebasePartyService.setMemberStatus('not-ready').catch(() => {});
    }
    this.syncUnlimitedAmmoMode();
    this.playerCamera.setWaitingPitchClamp(false);
    this.activeRankedMatchId = null;
    this.rankedWaitingParticipantCount = 0;
    this.rankedEliminated = false;
    this.spectateTargetName = null;
    this.wasZipliningPrev = false;
    this.audioManager.setZiplineSliding(false);
    this.cancelManualGlooPreview(false);
    this.glooWallManager.clearAll();
    this.damageNumberSystem.clear();
    this.eliminationEffectSystem.clearAll();

    this.airplaneDropManager.setOnWaitingCompleteCallback(undefined);
    this.airplaneDropManager.setOnlineSyncCallbacks(null);
    this.airplaneDropManager.setServerFlightProgress(null);
    this.airplaneDropManager.setServerWaitingRemainingSec(null);
    this.inventoryManager.setOnlineSyncHooks(null);
    this.weaponManager.controller.setOnShotFiredCallback(undefined);
    this.weaponManager.bulletSystem.setOnRemoteHitClaimCallback(undefined);
    this.weaponManager.setPracticeTargetsVisible(true);

    this.safeZoneManager.setActive(false);
    this.mapManager.setRankedZoneState(null);
    this.mapManager.setTeammateMarkers([]);
    this.mapManager.setEnemyMarkers([]);
    this.remotePlayerManager.setLocalSquadId(null);
    this.remotePlayerManager.clearAll();
    this.remotePlayerManager.root.visible = false;

    this.uiManager.setArenaSquadmateStatuses([]);
    this.uiManager.setArenaHudMode('practice');
    this.uiManager.resetArenaOverlays();
  }

  dispose(): void {
    this.isDisposed = true;
    this.waitingLobbyTransitionActive = false;
    window.removeEventListener('beforeunload', this.handleWindowBeforeUnload);
    if (this.firebaseActiveUid) {
      void this.firebaseFriendsService.setPresenceStatus('offline').catch(() => {});
      this.firebaseActiveUid = null;
    }
    if (this.firebasePublicSyncTimer) {
      clearTimeout(this.firebasePublicSyncTimer);
      this.firebasePublicSyncTimer = 0;
    }
    if (this.remainingWeaponsTimer) {
      clearTimeout(this.remainingWeaponsTimer);
      this.remainingWeaponsTimer = 0;
    }
    if (this.vaultSyncTimer) {
      clearTimeout(this.vaultSyncTimer);
      this.vaultSyncTimer = 0;
    }
    if (this.cloudStateSyncTimer) {
      clearTimeout(this.cloudStateSyncTimer);
      this.cloudStateSyncTimer = 0;
    }
    if (this.lobbyReconnectTimer) {
      clearTimeout(this.lobbyReconnectTimer);
      this.lobbyReconnectTimer = 0;
    }
    this.stopRankedStatusPoll();
    this.cleanupRankedMatch(false);
    this.battleRoyaleManager.dispose();
    this.glooWallManager.dispose();
    this.damageNumberSystem.dispose();
    this.eliminationEffectSystem.dispose();
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes.length = 0;

    this.firebasePartyService.dispose();
    this.firebaseFriendsService.dispose();
    this.firebaseAuthService.dispose();
    this.gameLoop.dispose();
    this.uiManager.dispose();
    this.playerController.dispose();
    this.playerCamera.dispose();
    this.player.dispose();
    this.airplaneDropManager.dispose();
    this.safeZoneManager.dispose();
    this.remotePlayerManager.dispose();
    this.rankedNetwork.dispose();
    this.inventoryManager.dispose();
    this.weaponManager.dispose();
    this.lootManager.dispose();
    this.inputManager.dispose();
    this.militaryLobby.dispose();
    this.gameplayCompanion.dispose();
    this.mapManager.dispose();
    this.cameraManager.dispose();
    this.sceneManager.dispose();
    this.rendererManager.dispose();
    this.audioManager.dispose();
    this.previewRenderer.dispose();
    this.shopManager.dispose();
    this.playerProfileManager.dispose();
    this.assetManager.dispose();
    this.loadingManager.dispose();
    this.characterManager.dispose();
    this.controlSettings.dispose();
    this.settingsManager.dispose();
    this.responsiveManager.dispose();
  }
}
