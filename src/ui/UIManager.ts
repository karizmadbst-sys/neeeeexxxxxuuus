import type { AudioManager } from '../audio/AudioManager';
import type { AbilityRuntimeSnapshot } from '../characters/AbilityManager';
import type { CharacterDefinition } from '../characters/CharacterData';
import type { CharacterManager } from '../characters/CharacterManager';
import type { CharacterPreviewRenderer } from '../characters/CharacterPreviewRenderer';
import type { LoadingProgress } from '../core/LoadingManager';
import type { SettingsManager } from '../core/SettingsManager';
import type {
  AppLanguage,
  DeviceProfile,
  GameSettings,
  GlooWallPlacementMode,
  LobbyGameMode,
  QualityPreset,
  ScreenId,
  Subsystem,
  ViewportMetrics,
} from '../core/Types';
import { getEmoteById } from '../emotes/EmoteCatalog';
import { i18n } from '../i18n/I18nManager';
import type { ControlSettings, GameAction } from '../input/ControlSettings';
import type { AirplaneDropSnapshot } from '../drop/IAirplaneDropSystem';
import type {
  InventorySnapshot,
  WeaponReplacementPrompt,
} from '../inventory/IInventorySystem';
import type { WeaponSlotIndex } from '../weapons/WeaponData';
import type { PickupPromptSnapshot } from '../loot/PickupSystem';
import type { MapId } from '../maps/IMapSystem';
import type { MinimapSnapshot, WorldInteractPrompt } from '../maps/MapManager';
import type { PlayerStateSnapshot } from '../player/IPlayerController';
import type { R6Customization, R6PetId } from '../player/R6CustomizationData';
import type { PlayerAccountSnapshot } from '../progression/PlayerProfileManager';
import type { FirebaseAuthState } from '../firebase/FirebaseAuthService';
import type {
  ShopActionResult,
  ShopBrowseTab,
  ShopCatalogItem,
  ShopSnapshot,
} from '../shop/IShopSystem';
import type { WeaponHudSnapshot } from '../weapons/WeaponManager';
import type { InventoryUICallbacks } from './InventoryUI';
import type { ScopeOverlayState } from './ScopeOverlay';
import {
  AuthScreen,
  type AuthScreenViewState,
  type UsernameAvailabilityResult,
} from './screens/AuthScreen';
import { BattleRoyaleScreen } from './screens/BattleRoyaleScreen';
import { CharacterSelectionUI } from './screens/CharacterSelectionUI';
import { ControlLayoutEditor } from './screens/ControlLayoutEditor';
import { EmoteWheelOverlay } from './screens/EmoteWheelOverlay';
import { LoadingScreen } from './screens/LoadingScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { MapSelectionScreen } from './screens/MapSelectionScreen';
import { OrientationGuard } from './OrientationGuard';
import { PetsScreen } from './screens/PetsScreen';
import { PostLoginLoadingScreen } from './screens/PostLoginLoadingScreen';
import { ProfileModal } from './screens/ProfileModal';
import { RankedScreen, type RankedScreenCallbacks } from './screens/RankedScreen';
import { SettingsScreen, type SettingsAccountInfo } from './screens/SettingsScreen';
import { ShopScreen } from './screens/ShopScreen';
import { TestArenaHud, type SquadmateHudStatus } from './screens/TestArenaHud';
import { VaultScreen } from './screens/VaultScreen';
import { WaitingLobbyLoadingOverlay } from './screens/WaitingLobbyLoadingOverlay';
import type {
  BattleRoyaleEliminationPayload,
  BattleRoyaleMatchConfig,
  BattleRoyaleResultPayload,
} from '../battleroyale/BattleRoyaleTypes';
import type {
  FriendLookupResponse,
  FriendRequestEntry,
  KillFeedEntry,
  MailboxStateSnapshot,
  OutgoingFriendRequestEntry,
  PlayerGender,
  RankedMatchResultPayload,
  RankedProfile,
  ServerZoneState,
  SquadFriendEntry,
  SquadInviteNotification,
  SquadSize,
  SquadStateSnapshot,
} from '../ranked/RankedTypes';

export interface UIManagerCallbacks {
  onScreenChange: (screen: ScreenId) => void;
  onSelectGameMode: (mode: LobbyGameMode) => void;
  onSelectSquadSize: (size: SquadSize) => void;
  onCreateParty: () => void;
  onToggleSquadReady: (ready: boolean) => void;
  onTransferSquadLeader: (playerId: string) => void;
  onInviteFriend: (friendId: string) => void;
  onRespondSquadInvite: (inviteId: string, accept: boolean) => void;
  onLeaveSquad: () => void;
  onKickSquadMember: (playerId: string) => void;
  onLookupFriendById: (queryId: string) => Promise<FriendLookupResponse>;
  onSendFriendRequest: (targetPlayerId: string) => Promise<void>;
  onRespondFriendRequest: (requestId: string, accept: boolean) => Promise<void>;
  onCancelFriendRequest: (requestId: string) => Promise<void>;
  onRemoveFriend: (friendPlayerId: string) => Promise<void>;
  onOpenMailbox?: () => Promise<void>;
  onReadMail: (mailId: string) => Promise<void>;
  onClaimMailReward: (mailId: string) => Promise<void>;
  onArchiveMail: (mailId: string, archived: boolean) => Promise<void>;
  onDeleteMail: (mailId: string) => Promise<void>;
  onMainMenuStartPressed: () => void;
  onCancelMainMenuQueue: () => void;
  onConfirmMapSelection: (mapId: MapId) => void;
  onSelectMap: (mapId: MapId) => void;
  onCycleArenaMap: () => void;
  onNewArenaMatch: () => void;
  onPreviewCharacter: (character: CharacterDefinition) => void;
  onSelectCharacter: (character: CharacterDefinition) => void;
  onPreviewCustomization: (custom: R6Customization) => void;
  onUpdateCustomization: (custom: R6Customization, targetCharacterId?: string) => void;
  onTriggerPetReaction: () => void;
  onRotateCharacterPreview: (deltaYaw: number) => void;
  onSetCharacterPreviewYaw: (yaw: number) => void;
  onResetCharacterPreview: () => void;
  onToggleAutoSpin: () => boolean;
  onRenameUsernameOnce: (newName: string) => Promise<void>;
  onUpdateGender: (gender: PlayerGender) => Promise<void>;
  onInspectPlayer: (idOrNumericId: string) => Promise<RankedProfile | null>;
  onSignInNexusId?: (identifier: string, password: string) => Promise<void>;
  onRegisterNexusId?: (username: string, email: string, password: string) => Promise<void>;
  onRecoverNexusId?: (identifier: string) => Promise<string>;
  onCheckNexusUsername?: (username: string) => Promise<UsernameAvailabilityResult>;
  onResendNexusVerification?: () => Promise<void>;
  onCheckNexusVerification?: () => Promise<boolean>;
  onSignOutNexusId?: () => Promise<void>;
  onLoginEnterGame?: () => Promise<void>;
  onRetryLoginLoad?: () => Promise<void>;
  onCancelLoginLoad?: () => void;
  canAccessGameScreens?: () => boolean;
  canAccessLoginLoadingScreen?: () => boolean;
  onSelectShopPreview: (item: ShopCatalogItem) => void;
  onPurchaseShopItem: (item: ShopCatalogItem) => ShopActionResult;
  onEquipShopItem: (item: ShopCatalogItem) => ShopActionResult;
  onUnequipShopItem: (item: ShopCatalogItem) => ShopActionResult;
  onEquipAvatar: (avatarId: string) => ShopActionResult;
  onEquipBanner: (bannerId: string) => ShopActionResult;
  onEquipEmoteSlot: (item: ShopCatalogItem, slotIndex: number) => ShopActionResult;
  onUnequipEmoteSlot: (slotIndex: number) => ShopActionResult;
  onRequestOpenEmoteWheel: () => void;
  onPlayEmote: (emoteId: string) => void;
  onStopEmote: () => void;
  onEmoteWheelOpenChange?: (open: boolean) => void;
  onToggleArenaCameraMode: () => void;
  onInventoryOpenChange: (open: boolean) => void;
  onFullMapOpenChange?: (open: boolean) => void;
  onSettingsOpenChange?: (open: boolean) => void;
  onToggleMute?: () => void;
  onSetQualityPreset?: (quality: QualityPreset) => void;
  onSetGlooPlacementMode?: (mode: GlooWallPlacementMode) => void;
  onGlooPreviewConfirm?: () => void;
  onGlooPreviewCancel?: () => void;
  onGlooPreviewRotateStep?: (dir: -1 | 1) => void;
  onGlooPreviewRotateHold?: (dir: -1 | 0 | 1) => void;
  onSelectWeaponSlot?: (slotIndex: number) => void;
  onConfirmWeaponReplace?: (lootInstanceId: string, replaceSlotIndex: WeaponSlotIndex) => void;
  onCancelWeaponReplace?: () => void;
  onCycleScopeZoom: () => void;
  onAirborneJump: () => void;
  onAirborneDeployChute: () => void;
  onHudOptionSelected?: () => void;
  inventoryActions: Omit<InventoryUICallbacks, 'onClose'>;
  onVirtualMove: (x: number, y: number, sprint: boolean) => void;
  onVirtualActionHold: (action: GameAction, held: boolean) => void;
  onVirtualActionPress: (action: GameAction) => void;
  rankedCallbacks: Omit<RankedScreenCallbacks, 'onBack'>;
  onRankedReturnToLobby: () => void;
  onLaunchBattleRoyale: (config: BattleRoyaleMatchConfig) => void;
  onBattleRoyaleConfigChange?: (config: BattleRoyaleMatchConfig) => void;
  onBattleRoyalePlayAgain: () => void;
  onBattleRoyaleExitMenu: () => void;
}

export class UIManager implements Subsystem {
  private currentScreen: ScreenId = 'loading';
  private editorReturnScreen: ScreenId = 'settings';
  private latestMetrics: ViewportMetrics;
  private latestCustomization: R6Customization;
  private activeMapId: MapId;
  private activeMapName = '';
  private taglineTimer = 0;
  private i18nUnsubscribe: (() => void) | null = null;

  private readonly loadingScreen: LoadingScreen;
  private readonly authScreen: AuthScreen;
  private readonly postLoginLoadingScreen: PostLoginLoadingScreen;
  private readonly mainMenuScreen: MainMenuScreen;
  private readonly emoteWheelOverlay: EmoteWheelOverlay;
  private readonly profileModal: ProfileModal;
  readonly mapSelectionScreen: MapSelectionScreen;
  readonly battleRoyaleScreen: BattleRoyaleScreen;
  readonly rankedScreen: RankedScreen;
  private readonly characterSelectionUI: CharacterSelectionUI;
  private readonly petsScreen: PetsScreen;
  private readonly shopScreen: ShopScreen;
  private readonly vaultScreen: VaultScreen;
  private readonly settingsScreen: SettingsScreen;
  private readonly controlLayoutEditor: ControlLayoutEditor;
  private readonly testArenaHud: TestArenaHud;
  private readonly waitingLobbyLoadingOverlay: WaitingLobbyLoadingOverlay;
  private readonly orientationGuard: OrientationGuard;
  private latestPlayerUsername = 'OPERATOR';
  private latestEquippedAvatarId = 'avatar-nexus-recruit';

  private readonly screenMap: Record<ScreenId, HTMLElement>;

  constructor(
    private readonly uiRoot: HTMLElement,
    private readonly deviceProfile: DeviceProfile,
    initialMetrics: ViewportMetrics,
    private readonly settingsManager: SettingsManager,
    private readonly controlSettings: ControlSettings,
    private readonly characterManager: CharacterManager,
    private readonly audioManager: AudioManager,
    private readonly previewRenderer: CharacterPreviewRenderer,
    initialMapId: MapId,
    initialCustomization: R6Customization,
    initialProfile: PlayerAccountSnapshot,
    initialShopSnapshot: ShopSnapshot,
    private readonly callbacks: UIManagerCallbacks,
    earlyLoadingScreen?: LoadingScreen,
  ) {
    this.latestMetrics = initialMetrics;
    this.latestCustomization = { ...initialCustomization };
    this.activeMapId = initialMapId;
    this.latestPlayerUsername = initialProfile.username;
    this.latestEquippedAvatarId = initialShopSnapshot.equippedAvatarId;
    const initialSettings = this.settingsManager.getSettings();

    this.loadingScreen = earlyLoadingScreen ?? new LoadingScreen(deviceProfile);

    this.authScreen = new AuthScreen({
      onSignInNexusId: async (identifier, password) => {
        this.audioManager.playClick();
        if (this.callbacks.onSignInNexusId) {
          await this.callbacks.onSignInNexusId(identifier, password);
        }
      },
      onRegisterNexusId: async (username, email, password) => {
        this.audioManager.playClick();
        if (this.callbacks.onRegisterNexusId) {
          await this.callbacks.onRegisterNexusId(username, email, password);
        }
      },
      onRecoverNexusId: async (identifier) => {
        this.audioManager.playClick();
        return (
          (await this.callbacks.onRecoverNexusId?.(identifier)) ??
          i18n.t('auth.recoverSentInfo')
        );
      },
      onCheckNexusUsername: async (username) => {
        if (this.callbacks.onCheckNexusUsername) {
          return this.callbacks.onCheckNexusUsername(username);
        }
        return { available: false, valid: false };
      },
      onResendNexusVerification: async () => {
        this.audioManager.playClick();
        await this.callbacks.onResendNexusVerification?.();
      },
      onCheckNexusVerification: async () => {
        this.audioManager.playClick();
        return Boolean(await this.callbacks.onCheckNexusVerification?.());
      },
      onSignOutNexusId: async () => {
        this.audioManager.playBack();
        await this.callbacks.onSignOutNexusId?.();
      },
      onLoginEnterGame: async () => {
        this.audioManager.playDeploy();
        await this.callbacks.onLoginEnterGame?.();
      },
    });

    this.postLoginLoadingScreen = new PostLoginLoadingScreen({
      onRetry: () => {
        this.audioManager.playDeploy();
        void this.callbacks.onRetryLoginLoad?.().catch(() => {});
      },
      onBackToAuth: () => {
        this.audioManager.playBack();
        this.callbacks.onCancelLoginLoad?.();
      },
    });

    this.profileModal = new ProfileModal(
      initialProfile,
      this.characterManager.getSelectedCharacter(),
      initialCustomization,
      initialShopSnapshot,
      this.previewRenderer,
      {
        onRenameOnce: async (newName) => {
          await this.callbacks.onRenameUsernameOnce(newName);
          this.audioManager.playDeploy();
        },
        onUpdateGender: async (gender) => {
          this.audioManager.playClick();
          await this.callbacks.onUpdateGender(gender);
        },
        onLookupPlayer: async (idOrNumericId) => {
          return this.callbacks.onInspectPlayer(idOrNumericId);
        },
        onEquipAvatar: (avatarId) => {
          return this.callbacks.onEquipAvatar(avatarId);
        },
        onEquipBanner: (bannerId) => {
          return this.callbacks.onEquipBanner(bannerId);
        },
        onOpenShopTab: (tab: ShopBrowseTab) => {
          this.audioManager.playClick();
          this.profileModal.close();
          this.showScreen('shop');
          this.shopScreen.openScreen(tab);
        },
        onOpenCharacters: () => {
          this.audioManager.playClick();
          this.characterSelectionUI.openStudio('fighter');
          this.showScreen('characters');
        },
        onSignOut: async () => {
          this.audioManager.playBack();
          await this.callbacks.onSignOutNexusId?.();
        },
        onClose: () => {
          this.audioManager.playBack();
        },
      },
      { isSoftwareGl: deviceProfile.isSoftwareGl },
    );

    this.mainMenuScreen = new MainMenuScreen(
      deviceProfile,
      initialMetrics,
      initialSettings.audio.muted,
      initialMapId,
      this.characterManager.getSelectedCharacter(),
      initialCustomization,
      initialProfile,
      this.previewRenderer,
      {
        onNavigate: (target, options) => {
          if (target === 'test-arena') {
            this.audioManager.playDeploy();
          } else {
            this.audioManager.playClick();
          }
          if (target === 'characters') {
            this.characterSelectionUI.openStudio(options?.openCustomize ? 'customize' : 'fighter');
          } else if (target === 'pets') {
            this.petsScreen.openScreen(this.latestCustomization);
          }
          this.showScreen(target);
        },
        onOpenProfile: () => {
          this.audioManager.playClick();
          this.profileModal.open();
        },
        onSelectGameMode: (mode) => {
          this.audioManager.playClick();
          this.callbacks.onSelectGameMode(mode);
        },
        onStartPressed: () => {
          this.callbacks.onMainMenuStartPressed();
        },
        onCancelRankedQueue: () => {
          this.audioManager.playBack();
          this.callbacks.onCancelMainMenuQueue();
        },
        onOpenMapSelection: () => {
          this.audioManager.playClick();
          this.showScreen('map-select');
        },
        onToggleMute: () => {
          const current = this.settingsManager.getSettings().audio.muted;
          this.settingsManager.update({ audio: { muted: !current } });
          if (current) {
            this.audioManager.playClick();
          }
        },
        onRotateCharacter: (deltaYaw) => {
          this.audioManager.playClick();
          this.callbacks.onRotateCharacterPreview(deltaYaw);
        },
        onToggleAutoSpin: () => {
          this.audioManager.playClick();
          return this.callbacks.onToggleAutoSpin();
        },
        onUpdateCustomization: (custom) => {
          this.audioManager.playClick();
          this.latestCustomization = { ...custom };
          this.characterSelectionUI.setCustomization(custom);
          this.petsScreen.setCustomization(custom);
          this.callbacks.onUpdateCustomization(custom);
        },
        onOpenEmoteWheel: () => {
          this.audioManager.playClick();
          this.callbacks.onRequestOpenEmoteWheel();
        },
        onStopEmote: () => {
          this.callbacks.onStopEmote();
        },
        onSelectSquadSize: (size) => {
          this.audioManager.playClick();
          this.callbacks.onSelectSquadSize(size);
        },
        onCreateParty: () => {
          this.audioManager.playClick();
          this.callbacks.onCreateParty();
        },
        onToggleSquadReady: (ready) => {
          this.audioManager.playClick();
          this.callbacks.onToggleSquadReady(ready);
        },
        onTransferSquadLeader: (playerId) => {
          this.audioManager.playClick();
          this.callbacks.onTransferSquadLeader(playerId);
        },
        onInviteFriend: (friendId) => {
          this.audioManager.playClick();
          this.callbacks.onInviteFriend(friendId);
        },
        onRespondSquadInvite: (inviteId, accept) => {
          this.audioManager.playClick();
          this.callbacks.onRespondSquadInvite(inviteId, accept);
        },
        onLeaveSquad: () => {
          this.audioManager.playBack();
          this.callbacks.onLeaveSquad();
        },
        onKickSquadMember: (playerId) => {
          this.audioManager.playClick();
          this.callbacks.onKickSquadMember(playerId);
        },
        onInspectPlayer: (playerId) => {
          this.openPlayerProfile(playerId);
        },
        onLookupFriendById: (queryId) => this.callbacks.onLookupFriendById(queryId),
        onSendFriendRequest: (targetPlayerId) => this.callbacks.onSendFriendRequest(targetPlayerId),
        onRespondFriendRequest: (requestId, accept) =>
          this.callbacks.onRespondFriendRequest(requestId, accept),
        onCancelFriendRequest: (requestId) => this.callbacks.onCancelFriendRequest(requestId),
        onRemoveFriend: (friendPlayerId) => this.callbacks.onRemoveFriend(friendPlayerId),
        onOpenMailbox: () => this.callbacks.onOpenMailbox?.() ?? Promise.resolve(),
        onReadMail: (mailId) => this.callbacks.onReadMail(mailId),
        onClaimMailReward: (mailId) => this.callbacks.onClaimMailReward(mailId),
        onArchiveMail: (mailId, archived) => this.callbacks.onArchiveMail(mailId, archived),
        onDeleteMail: (mailId) => this.callbacks.onDeleteMail(mailId),
      },
    );
    this.mainMenuScreen.setShopCosmetics(
      initialShopSnapshot.equippedAvatarId,
      initialShopSnapshot.equippedBannerId,
    );
    this.mainMenuScreen.setCurrencyBalance(initialShopSnapshot.credits);

    this.emoteWheelOverlay = new EmoteWheelOverlay({
      onSelectEmote: (emoteId) => {
        this.callbacks.onEmoteWheelOpenChange?.(false);
        this.callbacks.onPlayEmote(emoteId);
      },
      onOpenEmoteShop: () => {
        if (this.currentScreen === 'test-arena') return;
        this.callbacks.onEmoteWheelOpenChange?.(false);
        this.audioManager.playClick();
        this.openEmotesShop();
      },
      onClose: () => {
        this.callbacks.onEmoteWheelOpenChange?.(false);
        this.audioManager.playBack();
      },
    });

    this.characterSelectionUI = new CharacterSelectionUI(
      this.characterManager,
      initialCustomization,
      this.previewRenderer,
      {
        onPreviewCharacter: (character) => {
          this.audioManager.playClick();
          this.callbacks.onPreviewCharacter(character);
        },
        onConfirmSelect: (character) => {
          this.audioManager.playDeploy();
          this.mainMenuScreen.setSelectedCharacter(character);
          this.callbacks.onSelectCharacter(character);
        },
        onPreviewCustomization: (custom) => {
          this.audioManager.playClick();
          this.callbacks.onPreviewCustomization(custom);
        },
        onUpdateCustomization: (custom, targetCharacterId) => {
          this.audioManager.playDeploy();
          const selectedId = this.characterManager.getSelectedCharacter().id;
          if (!targetCharacterId || targetCharacterId === selectedId) {
            this.latestCustomization = { ...custom };
            this.mainMenuScreen.setCustomization(custom);
            this.petsScreen.setCustomization(custom);
          }
          this.callbacks.onUpdateCustomization(custom, targetCharacterId);
        },
        onOpenPets: () => {
          this.audioManager.playClick();
          this.petsScreen.openScreen(this.latestCustomization);
          this.showScreen('pets');
        },
        onRotatePreview: (deltaYaw) => {
          this.audioManager.playClick();
          this.callbacks.onRotateCharacterPreview(deltaYaw);
        },
        onSetPreviewYaw: (yaw) => {
          this.audioManager.playClick();
          this.callbacks.onSetCharacterPreviewYaw(yaw);
        },
        onResetPreview: () => {
          this.audioManager.playClick();
          this.callbacks.onResetCharacterPreview();
        },
        onToggleAutoSpin: () => {
          this.audioManager.playClick();
          return this.callbacks.onToggleAutoSpin();
        },
        onBack: () => {
          this.audioManager.playBack();
          this.showScreen('main-menu');
        },
      },
    );

    this.petsScreen = new PetsScreen(
      initialCustomization,
      this.previewRenderer,
      {
        onPreviewPet: (petId: R6PetId) => {
          this.audioManager.playClick();
          this.callbacks.onPreviewCustomization({ ...this.latestCustomization, petId });
        },
        onEquipPet: (petId: R6PetId, petEnabled: boolean) => {
          this.audioManager.playDeploy();
          const updated: R6Customization = {
            ...this.latestCustomization,
            petId,
            petEnabled,
          };
          this.latestCustomization = updated;
          this.mainMenuScreen.setCustomization(updated);
          this.characterSelectionUI.setCustomization(updated);
          this.callbacks.onUpdateCustomization(updated);
        },
        onToggleFollow: (petEnabled: boolean) => {
          this.audioManager.playClick();
          const updated: R6Customization = {
            ...this.latestCustomization,
            petEnabled,
          };
          this.latestCustomization = updated;
          this.mainMenuScreen.setCustomization(updated);
          this.characterSelectionUI.setCustomization(updated);
          this.callbacks.onUpdateCustomization(updated);
        },
        onTriggerReaction: () => {
          this.audioManager.playClick();
          this.callbacks.onTriggerPetReaction();
        },
        onRotatePreview: (deltaYaw) => {
          this.audioManager.playClick();
          this.callbacks.onRotateCharacterPreview(deltaYaw);
        },
        onSetPreviewYaw: (yaw) => {
          this.audioManager.playClick();
          this.callbacks.onSetCharacterPreviewYaw(yaw);
        },
        onBack: () => {
          this.audioManager.playBack();
          this.showScreen('main-menu');
        },
      },
    );

    this.shopScreen = new ShopScreen(
      initialShopSnapshot,
      this.characterManager.getSelectedCharacter(),
      initialCustomization,
      this.previewRenderer,
      {
        onSelectOffer: (item) => {
          this.audioManager.playClick();
          this.callbacks.onSelectShopPreview(item);
        },
        onPurchaseItem: (item) => {
          return this.callbacks.onPurchaseShopItem(item);
        },
        onEquipItem: (item) => {
          return this.callbacks.onEquipShopItem(item);
        },
        onUnequipItem: (item) => {
          return this.callbacks.onUnequipShopItem(item);
        },
        onEquipEmoteSlot: (item, slotIndex) => {
          return this.callbacks.onEquipEmoteSlot(item, slotIndex);
        },
        onUnequipEmoteSlot: (slotIndex) => {
          return this.callbacks.onUnequipEmoteSlot(slotIndex);
        },
        onPreviewEmote: (emoteId) => {
          const emote = getEmoteById(emoteId);
          this.audioManager.playDanceMusic(emoteId, emote?.durationSeconds ?? 10);
        },
        onStopPreviewEmote: () => {
          this.audioManager.stopDanceMusic(false);
        },
        onPreviewGlooWall: () => {
          this.audioManager.playGlooDeploy(0);
        },
        onOpenVault: () => {
          this.audioManager.playClick();
          this.showScreen('vault');
        },
        onBack: () => {
          this.audioManager.playBack();
          this.showScreen('main-menu');
        },
      },
    );

    this.vaultScreen = new VaultScreen(
      initialShopSnapshot,
      this.characterManager.getSelectedCharacter(),
      initialCustomization,
      this.previewRenderer,
      {
        onSelectOffer: (item) => {
          this.audioManager.playClick();
          this.callbacks.onSelectShopPreview(item);
        },
        onEquipItem: (item) => {
          return this.callbacks.onEquipShopItem(item);
        },
        onUnequipItem: (item) => {
          return this.callbacks.onUnequipShopItem(item);
        },
        onEquipEmoteSlot: (item, slotIndex) => {
          return this.callbacks.onEquipEmoteSlot(item, slotIndex);
        },
        onUnequipEmoteSlot: (slotIndex) => {
          return this.callbacks.onUnequipEmoteSlot(slotIndex);
        },
        onPreviewEmote: (emoteId) => {
          const emote = getEmoteById(emoteId);
          this.audioManager.playDanceMusic(emoteId, emote?.durationSeconds ?? 10);
        },
        onStopPreviewEmote: () => {
          this.audioManager.stopDanceMusic(false);
        },
        onPreviewGlooWall: () => {
          this.audioManager.playGlooDeploy(0);
        },
        onOpenShop: (tab: ShopBrowseTab) => {
          this.audioManager.playClick();
          this.showScreen('shop');
          this.shopScreen.openScreen(tab);
        },
        onBack: () => {
          this.audioManager.playBack();
          this.showScreen('main-menu');
        },
      },
    );

    this.settingsScreen = new SettingsScreen(
      this.settingsManager,
      this.controlSettings,
      this.deviceProfile,
      initialMetrics,
      {
        onOpenLayoutEditor: () => {
          this.audioManager.playClick();
          this.editorReturnScreen = 'settings';
          this.controlLayoutEditor.openEditor();
          this.showScreen('control-editor');
        },
        onOpenProfile: () => {
          this.audioManager.playClick();
          this.profileModal.open();
        },
        onSignOut: async () => {
          this.audioManager.playBack();
          await this.callbacks.onSignOutNexusId?.();
        },
        onBack: () => {
          this.audioManager.playBack();
          this.showScreen('main-menu');
        },
      },
    );

    this.controlLayoutEditor = new ControlLayoutEditor(
      this.controlSettings,
      initialMetrics,
      {
        onClose: () => {
          this.audioManager.playClick();
          this.testArenaHud.applySettingsAndViewport(
            this.settingsManager.getSettings(),
            this.latestMetrics,
          );
          this.showScreen(this.editorReturnScreen);
        },
      },
    );

    this.testArenaHud = new TestArenaHud(
      this.deviceProfile,
      this.controlSettings,
      initialMetrics,
      initialSettings,
      {
        onExitToMenu: () => {
          this.audioManager.playBack();
          this.testArenaHud.resetArenaOverlays();
          this.showScreen('main-menu');
        },
        onToggleCameraMode: () => {
          this.audioManager.playClick();
          this.callbacks.onToggleArenaCameraMode();
        },
        onCycleMap: () => {
          this.audioManager.playClick();
          this.callbacks.onCycleArenaMap();
        },
        onNewMatch: () => {
          this.audioManager.playDeploy();
          this.callbacks.onNewArenaMatch();
        },
        onOpenLayoutEditor: () => {
          this.audioManager.playClick();
          this.editorReturnScreen = 'test-arena';
          this.controlLayoutEditor.openEditor();
          this.showScreen('control-editor');
        },
        onInventoryOpenChange: this.callbacks.onInventoryOpenChange,
        onFullMapOpenChange: this.callbacks.onFullMapOpenChange,
        onSettingsOpenChange: this.callbacks.onSettingsOpenChange,
        onToggleMute: () => {
          if (this.callbacks.onToggleMute) {
            this.callbacks.onToggleMute();
          } else {
            const current = this.settingsManager.getSettings().audio.muted;
            this.settingsManager.update({ audio: { muted: !current } });
            if (current) {
              this.audioManager.playClick();
            }
          }
        },
        onSetQualityPreset: (quality) => {
          this.audioManager.playClick();
          if (this.callbacks.onSetQualityPreset) {
            this.callbacks.onSetQualityPreset(quality);
          } else {
            this.settingsManager.applyQualityPreset(quality);
          }
        },
        onSetGlooPlacementMode: (mode) => {
          this.audioManager.playClick();
          if (this.callbacks.onSetGlooPlacementMode) {
            this.callbacks.onSetGlooPlacementMode(mode);
          } else {
            this.settingsManager.update({ controls: { glooPlacementMode: mode } });
          }
        },
        onGlooPreviewConfirm: this.callbacks.onGlooPreviewConfirm,
        onGlooPreviewCancel: this.callbacks.onGlooPreviewCancel,
        onGlooPreviewRotateStep: this.callbacks.onGlooPreviewRotateStep,
        onGlooPreviewRotateHold: this.callbacks.onGlooPreviewRotateHold,
        onSelectLanguage: (lang: AppLanguage) => {
          this.audioManager.playClick();
          this.settingsManager.update({ language: lang });
        },
        onSelectWeaponSlot: this.callbacks.onSelectWeaponSlot,
        onConfirmWeaponReplace: this.callbacks.onConfirmWeaponReplace,
        onCancelWeaponReplace: this.callbacks.onCancelWeaponReplace,
        onCycleScopeZoom: this.callbacks.onCycleScopeZoom,
        onAirborneJump: this.callbacks.onAirborneJump,
        onAirborneDeployChute: this.callbacks.onAirborneDeployChute,
        onHudOptionSelected: this.callbacks.onHudOptionSelected,
        inventoryActions: this.callbacks.inventoryActions,
        onVirtualMove: this.callbacks.onVirtualMove,
        onVirtualActionHold: this.callbacks.onVirtualActionHold,
        onVirtualActionPress: this.callbacks.onVirtualActionPress,
        onRankedReturnToLobby: this.callbacks.onRankedReturnToLobby,
        onBattleRoyalePlayAgain: this.callbacks.onBattleRoyalePlayAgain,
        onBattleRoyaleExitMenu: this.callbacks.onBattleRoyaleExitMenu,
        onZoneWarningPing: () => this.audioManager.playZoneWarning(),
        onOpenEmoteWheel: () => {
          this.audioManager.playClick();
          this.callbacks.onRequestOpenEmoteWheel();
        },
      },
    );

    this.mapSelectionScreen = new MapSelectionScreen(initialMapId, {
      onSelectMap: (mapId) => {
        this.audioManager.playClick();
        this.callbacks.onConfirmMapSelection(mapId);
      },
      onBack: () => {
        this.audioManager.playBack();
        this.showScreen('main-menu');
      },
    });

    this.battleRoyaleScreen = new BattleRoyaleScreen(initialMapId, {
      onLaunchMatch: (cfg) => {
        this.audioManager.playDeploy();
        this.callbacks.onLaunchBattleRoyale(cfg);
      },
      onSelectMap: (mapId) => {
        this.audioManager.playClick();
        this.callbacks.onSelectMap(mapId);
      },
      onConfigChange: (cfg) => {
        this.callbacks.onBattleRoyaleConfigChange?.(cfg);
      },
      onBack: () => {
        this.audioManager.playBack();
        this.showScreen('main-menu');
      },
    });

    this.rankedScreen = new RankedScreen({
      ...this.callbacks.rankedCallbacks,
      onInspectPlayer: (idOrNumericId) => {
        this.openPlayerProfile(idOrNumericId);
      },
      onBack: () => {
        this.audioManager.playBack();
        this.showScreen('main-menu');
      },
    });

    this.waitingLobbyLoadingOverlay = new WaitingLobbyLoadingOverlay();
    this.orientationGuard = new OrientationGuard(this.deviceProfile);
    this.orientationGuard.updateViewport(initialMetrics, 'loading');

    this.screenMap = {
      loading: this.loadingScreen.element,
      auth: this.authScreen.element,
      'login-loading': this.postLoginLoadingScreen.element,
      'main-menu': this.mainMenuScreen.element,
      'map-select': this.mapSelectionScreen.element,
      'battle-royale': this.battleRoyaleScreen.element,
      ranked: this.rankedScreen.element,
      characters: this.characterSelectionUI.element,
      pets: this.petsScreen.element,
      shop: this.shopScreen.element,
      vault: this.vaultScreen.element,
      settings: this.settingsScreen.element,
      'control-editor': this.controlLayoutEditor.element,
      'test-arena': this.testArenaHud.element,
    };

    Object.entries(this.screenMap).forEach(([id, el]) => {
      if (id === 'loading') {
        el.style.display = 'flex';
        if (el.parentElement !== this.uiRoot) {
          this.uiRoot.appendChild(el);
        }
      } else {
        el.style.display = 'none';
        this.uiRoot.appendChild(el);
      }
    });
    this.uiRoot.appendChild(this.emoteWheelOverlay.element);
    this.uiRoot.appendChild(this.profileModal.element);
    this.uiRoot.appendChild(this.waitingLobbyLoadingOverlay.element);
    this.uiRoot.appendChild(this.orientationGuard.element);
    this.mainMenuScreen.setShowFps(initialSettings.graphics.showFps);
    this.testArenaHud.setLocalPlayerCosmetics(
      this.latestPlayerUsername,
      this.latestEquippedAvatarId,
    );

    this.currentScreen = 'loading';

    this.taglineTimer = window.setInterval(() => {
      if (this.currentScreen === 'main-menu') {
        this.mainMenuScreen.cycleTagline();
      }
    }, 4500);

    this.i18nUnsubscribe = i18n.subscribe(() => {
      const key = this.activeIsTrainingGround
        ? 'training_ground'
        : (this.activeMapId ?? this.activeMapName);
      this.testArenaHud.setMapName(i18n.translateMapName(key));
    });
  }

  getCurrentScreen(): ScreenId {
    return this.currentScreen;
  }

  updatePlayerProfile(snapshot: PlayerAccountSnapshot, customization: R6Customization): void {
    const equippedChar = this.characterManager.getSelectedCharacter();
    this.latestCustomization = { ...customization };
    this.latestPlayerUsername = snapshot.username;
    this.mainMenuScreen.setPlayerProfile(snapshot);
    this.mainMenuScreen.setSelectedCharacter(equippedChar);
    this.mainMenuScreen.setCustomization(customization);
    this.profileModal.updateData(snapshot, equippedChar, customization);
    this.shopScreen.setOperatorContext(equippedChar, customization);
    this.vaultScreen.setOperatorContext(equippedChar, customization);
    this.testArenaHud.setLocalPlayerCosmetics(
      this.latestPlayerUsername,
      this.latestEquippedAvatarId,
    );
  }

  updateShopSnapshot(snapshot: ShopSnapshot): void {
    this.latestEquippedAvatarId = snapshot.equippedAvatarId;
    this.shopScreen.updateSnapshot(snapshot);
    this.vaultScreen.updateSnapshot(snapshot);
    this.mainMenuScreen.setShopCosmetics(snapshot.equippedAvatarId, snapshot.equippedBannerId);
    this.mainMenuScreen.setCurrencyBalance(snapshot.credits);
    this.profileModal.setShopSnapshot(snapshot);
    this.testArenaHud.setLocalPlayerCosmetics(
      this.latestPlayerUsername,
      this.latestEquippedAvatarId,
    );
  }

  showScreen(screen: ScreenId, notify = true): void {
    let targetScreen = screen;
    if (targetScreen === 'login-loading') {
      if (
        this.callbacks.canAccessLoginLoadingScreen &&
        !this.callbacks.canAccessLoginLoadingScreen()
      ) {
        targetScreen = 'auth';
      }
    } else if (
      targetScreen !== 'loading' &&
      targetScreen !== 'auth' &&
      this.callbacks.canAccessGameScreens &&
      !this.callbacks.canAccessGameScreens()
    ) {
      targetScreen = 'auth';
    }
    this.currentScreen = targetScreen;
    this.orientationGuard.updateViewport(this.latestMetrics, targetScreen);
    for (const [id, el] of Object.entries(this.screenMap)) {
      el.style.display = id === targetScreen ? 'flex' : 'none';
    }
    screen = targetScreen;
    if (screen !== 'main-menu') {
      this.mainMenuScreen.setInventoryOpen(false);
      this.mainMenuScreen.setMailboxOpen(false);
      this.mainMenuScreen.setFriendsPanelOpen(false);
      this.mainMenuScreen.setEmotingState(null);
      this.emoteWheelOverlay.close(false);
      if (screen !== 'ranked') {
        this.profileModal.close();
      }
    } else {
      this.mainMenuScreen.setSelectedCharacter(this.characterManager.getSelectedCharacter());
      this.mainMenuScreen.setCustomization(this.latestCustomization);
      if (!this.waitingLobbyLoadingOverlay.isActive()) {
        this.mainMenuScreen.setStartingMatch(false);
      }
    }
    if (screen !== 'shop') {
      this.shopScreen.closeScreen();
    }
    if (screen !== 'vault') {
      this.vaultScreen.closeScreen();
    }
    if (screen === 'characters') {
      this.characterSelectionUI.ensureOpened();
    } else if (screen === 'pets') {
      this.petsScreen.ensureOpened(this.latestCustomization);
    } else if (screen === 'shop') {
      this.shopScreen.setOperatorContext(
        this.characterManager.getSelectedCharacter(),
        this.latestCustomization,
      );
      this.shopScreen.openScreen();
    } else if (screen === 'vault') {
      this.vaultScreen.setOperatorContext(
        this.characterManager.getSelectedCharacter(),
        this.latestCustomization,
      );
      this.vaultScreen.openScreen();
    }
    if (notify) {
      this.callbacks.onScreenChange(screen);
    }
  }

  openPlayerProfile(idOrNumericId: string): void {
    this.audioManager.playClick();
    void this.profileModal.openPlayerLookup(idOrNumericId);
  }

  openEmotesShop(): void {
    if (this.currentScreen === 'test-arena') return;
    this.showScreen('shop');
    this.shopScreen.openScreen('dances');
  }

  openEmoteWheel(centerX: number, centerY: number, wheelSlots: readonly (string | null)[]): void {
    if (this.currentScreen === 'main-menu') {
      if (this.isMainMenuModalOpen()) return;
    } else if (this.currentScreen === 'test-arena') {
      if (
        this.isArenaInventoryOpen() ||
        this.isArenaFullMapOpen() ||
        this.isArenaSettingsOpen() ||
        this.isWeaponReplacePromptOpen()
      ) {
        return;
      }
    } else {
      return;
    }
    this.callbacks.onEmoteWheelOpenChange?.(true);
    this.emoteWheelOverlay.open(centerX, centerY, wheelSlots, {
      inMatch: this.currentScreen === 'test-arena',
    });
  }

  closeEmoteWheel(): void {
    const wasOpen = this.emoteWheelOverlay.isOpen();
    this.emoteWheelOverlay.close(false);
    if (wasOpen) {
      this.callbacks.onEmoteWheelOpenChange?.(false);
    }
  }

  isEmoteWheelOpen(): boolean {
    return this.emoteWheelOverlay.isOpen();
  }

  isMainMenuModalOpen(): boolean {
    return (
      this.profileModal.isModalOpen() ||
      this.mainMenuScreen.isInventoryModalOpen() ||
      this.mainMenuScreen.isMailboxModalOpen()
    );
  }

  setLobbyEmotingState(emoteName: string | null): void {
    this.mainMenuScreen.setEmotingState(emoteName);
  }

  refreshShopIfOpened(): void {
    this.shopScreen.refreshIfOpened();
  }

  updateLoadingProgress(progress: LoadingProgress): void {
    this.loadingScreen.updateProgress(progress);
  }

  isWaitingLobbyLoadingActive(): boolean {
    return this.waitingLobbyLoadingOverlay.isActive();
  }

  setMainMenuStartLocked(locked: boolean): void {
    this.mainMenuScreen.setStartingMatch(locked);
  }

  showWaitingLobbyLoading(mapName: string, onComplete: () => void): boolean {
    this.mainMenuScreen.setInventoryOpen(false);
    this.mainMenuScreen.setMailboxOpen(false);
    this.mainMenuScreen.setFriendsPanelOpen(false);
    this.mainMenuScreen.setEmotingState(null);
    this.emoteWheelOverlay.close(false);
    this.profileModal.close();
    return this.waitingLobbyLoadingOverlay.start(mapName, onComplete, 10_000);
  }

  hideWaitingLobbyLoading(): void {
    this.waitingLobbyLoadingOverlay.hide();
  }

  updateFps(fps: number): void {
    this.testArenaHud.setFps(fps);
    this.mainMenuScreen.setFps(fps);
  }

  syncPlayerStats(deltaSeconds: number, snapshot: PlayerStateSnapshot): void {
    this.testArenaHud.syncPlayerStats(deltaSeconds, snapshot);
  }

  syncArenaAbility(
    deltaSeconds: number,
    characterName: string,
    abilitySnapshot: AbilityRuntimeSnapshot,
  ): void {
    this.testArenaHud.syncAbilityStatus(
      deltaSeconds,
      characterName,
      abilitySnapshot.activeAbilityName,
      abilitySnapshot.status,
      abilitySnapshot.activeRemaining,
      abilitySnapshot.cooldownRemaining,
    );
  }

  syncArenaWeapon(deltaSeconds: number, weaponSnapshot: WeaponHudSnapshot): void {
    this.testArenaHud.syncWeaponState(deltaSeconds, weaponSnapshot);
  }

  setArenaCrosshairEnemyTargeted(targeted: boolean): void {
    this.testArenaHud.setCrosshairEnemyTargeted(targeted);
  }

  setArenaAiming(aiming: boolean): void {
    this.testArenaHud.setAiming(aiming);
  }

  setArenaScopeAvailable(available: boolean): void {
    this.testArenaHud.setScopeAvailable(available);
  }

  setArenaUnarmedState(unarmed: boolean, hasStoredWeapons = false): void {
    this.testArenaHud.setUnarmedState(unarmed, hasStoredWeapons);
  }

  syncArenaScope(state: ScopeOverlayState): void {
    this.testArenaHud.syncScopeOverlay(state);
  }

  notifyArenaAction(action: GameAction, customToast?: string): void {
    this.testArenaHud.handleActionFeedback(action, customToast);
  }

  showArenaToast(text: string): void {
    this.testArenaHud.showToast(text);
  }

  setArenaCameraModeLabel(mode: 'PLAYER' | 'ORBIT'): void {
    this.testArenaHud.setCameraModeLabel(mode);
  }

  private activeIsTrainingGround = false;

  setActiveMapName(mapName: string, mapId: MapId, isTrainingGround = false): void {
    this.activeIsTrainingGround = isTrainingGround;
    this.activeMapId = mapId;
    this.activeMapName = mapName;
    if (!isTrainingGround) {
      this.mainMenuScreen.setSelectedMap(mapId);
      this.mapSelectionScreen.setSelectedMap(mapId);
      this.battleRoyaleScreen.setSelectedMap(mapId);
    }
    this.testArenaHud.setMapName(
      i18n.translateMapName(isTrainingGround ? 'training_ground' : (mapId ?? mapName)),
    );
  }

  setMainMenuLobbyMode(mode: LobbyGameMode): void {
    this.mainMenuScreen.setSelectedMode(mode);
    this.mapSelectionScreen.setMode(mode);
  }

  setMainMenuBattleRoyaleConfig(config: BattleRoyaleMatchConfig): void {
    this.mainMenuScreen.setBattleRoyaleConfig(config);
  }

  setMainMenuRankedQueueState(
    queuing: boolean,
    info?: { waitSec: number; queuedPlayers: number; mapName?: string; message?: string },
  ): void {
    this.mainMenuScreen.setRankedQueueStatus(queuing, info);
  }

  setLobbyMapSelectionConfirmed(confirmed: boolean): void {
    this.mainMenuScreen.setMapSelectionConfirmed(confirmed);
  }

  setMainMenuSquadSize(size: SquadSize): void {
    this.mainMenuScreen.setSquadSize(size);
  }

  setMainMenuSquadState(state: SquadStateSnapshot): void {
    this.mainMenuScreen.setSquadState(state);
  }

  setMainMenuFriendsList(friends: SquadFriendEntry[]): void {
    this.mainMenuScreen.setFriendsList(friends);
  }

  setMainMenuFriendRequests(
    requests: FriendRequestEntry[],
    outgoingTargetIds?: string[],
    outgoingRequests?: OutgoingFriendRequestEntry[],
  ): void {
    this.mainMenuScreen.setFriendRequests(requests, outgoingTargetIds, outgoingRequests);
  }

  setMainMenuMailboxState(snapshot: MailboxStateSnapshot): void {
    this.mainMenuScreen.setMailboxState(snapshot);
  }

  setMainMenuFriendsPanelOpen(open: boolean): void {
    this.mainMenuScreen.setFriendsPanelOpen(open);
  }

  setMainMenuIncomingSquadInvite(invite: SquadInviteNotification | null): void {
    this.mainMenuScreen.setIncomingSquadInvite(invite);
  }

  showLobbyToast(text: string, tone: 'info' | 'success' | 'error' = 'info'): void {
    this.mainMenuScreen.showToast(text, tone);
  }

  setAuthState(authState: FirebaseAuthState): void {
    this.authScreen.setState({ authState });
    this.profileModal.setAccountEmail(authState.user?.email ?? null);
  }

  setAuthScreenState(state: Partial<AuthScreenViewState>): void {
    this.authScreen.setState(state);
  }

  setSettingsAccountInfo(info: SettingsAccountInfo | null): void {
    this.settingsScreen.setAccountInfo(info);
  }

  startPostLoginLoading(onComplete: () => void): void {
    this.postLoginLoadingScreen.start(onComplete);
  }

  setPostLoginLoadingStage(stageText: string): void {
    this.postLoginLoadingScreen.setStageText(stageText);
  }

  markPostLoginDataReady(): void {
    this.postLoginLoadingScreen.markDataReady();
  }

  failPostLoginLoading(errorMessage: string): void {
    this.postLoginLoadingScreen.setError(errorMessage);
  }

  stopPostLoginLoading(): void {
    this.postLoginLoadingScreen.stop();
  }

  syncArenaMinimap(snapshot: MinimapSnapshot): void {
    this.testArenaHud.syncMinimap(snapshot);
  }

  syncArenaCompass(
    yawRad: number,
    playerX = 0,
    playerZ = 0,
    safeCenterX?: number,
    safeCenterZ?: number,
  ): void {
    this.testArenaHud.syncCompass(yawRad, playerX, playerZ, safeCenterX, safeCenterZ);
  }

  syncArenaAirdrop(snapshot: AirplaneDropSnapshot): void {
    this.testArenaHud.syncAirdrop(snapshot);
  }

  syncArenaWaitingBanner(
    snapshot: AirplaneDropSnapshot,
    modeLabel: string,
    participantCount: number,
  ): void {
    this.testArenaHud.syncWaitingArena(snapshot, modeLabel, participantCount);
  }

  syncArenaInventoryAndPickup(
    deltaSeconds: number,
    invSnap: InventorySnapshot,
    pickupPrompt: PickupPromptSnapshot | null,
    worldPrompt: WorldInteractPrompt | null = null,
  ): void {
    this.testArenaHud.syncInventoryAndPickup(deltaSeconds, invSnap, pickupPrompt, worldPrompt);
  }

  isArenaInventoryOpen(): boolean {
    return this.testArenaHud.isInventoryOpen();
  }

  setArenaInventoryOpen(open: boolean): void {
    this.testArenaHud.setInventoryOpen(open);
  }

  isArenaFullMapOpen(): boolean {
    return this.testArenaHud.isFullMapOpen();
  }

  setArenaFullMapOpen(open: boolean): void {
    this.testArenaHud.setFullMapOpen(open);
  }

  isArenaSettingsOpen(): boolean {
    return this.testArenaHud.isSettingsModalOpen();
  }

  setArenaSettingsOpen(open: boolean): void {
    this.testArenaHud.setSettingsModalOpen(open);
  }

  showWeaponReplacePrompt(prompt: WeaponReplacementPrompt | null): void {
    this.testArenaHud.showWeaponReplacePrompt(prompt);
  }

  isWeaponReplacePromptOpen(): boolean {
    return this.testArenaHud.isWeaponReplacePromptOpen();
  }

  getPendingWeaponReplacePrompt(): WeaponReplacementPrompt | null {
    return this.testArenaHud.getPendingWeaponReplacePrompt();
  }

  isTouchControlsActive(): boolean {
    return this.testArenaHud.isTouchControlsActive();
  }

  setArenaHudMode(mode: 'practice' | 'ranked' | 'battle-royale'): void {
    this.testArenaHud.setArenaHudMode(mode);
  }

  setRankedMatchHudActive(active: boolean): void {
    this.testArenaHud.setRankedMode(active);
  }

  syncRankedHudMatchState(
    aliveCount: number,
    localKills: number,
    zone: ServerZoneState | null,
    inDangerZone = false,
  ): void {
    this.testArenaHud.syncRankedHudState(aliveCount, localKills, zone, inDangerZone);
  }

  pushRankedKillFeed(entry: KillFeedEntry): void {
    this.testArenaHud.pushRankedKillFeed(entry);
  }

  getArenaOverlayRoot(): HTMLElement {
    return this.testArenaHud.getDamageOverlayRoot();
  }

  setArenaKillsCounter(kills: number): void {
    this.testArenaHud.setKillsCounterValue(kills);
  }

  syncArenaGlooWallState(
    count: number,
    maxCount: number,
    previewActive = false,
  ): void {
    this.testArenaHud.syncGlooWallState(count, maxCount, previewActive);
  }

  syncArenaGlooManualPreview(
    active: boolean,
    valid: boolean,
    reason?: 'blocked' | 'overlap' | 'bounds' | 'player',
  ): void {
    this.testArenaHud.syncGlooManualPreview(active, valid, reason);
  }

  showArenaKillNotification(
    killerName: string,
    victimName: string,
    weaponName: string,
    isHeadshot: boolean,
    isSelfKiller: boolean,
    isSelfVictim: boolean,
  ): void {
    this.testArenaHud.showKillNotification(
      killerName,
      victimName,
      weaponName,
      isHeadshot,
      isSelfKiller,
      isSelfVictim,
    );
  }

  showRankedSpectatorBanner(targetName: string | null, isSquadmate = false): void {
    this.testArenaHud.showRankedSpectatorBanner(targetName, isSquadmate);
  }

  setArenaSquadmateStatuses(statuses: ReadonlyArray<SquadmateHudStatus>): void {
    this.testArenaHud.setSquadmateStatuses(statuses);
  }

  showRankedResultModal(result: RankedMatchResultPayload): void {
    this.testArenaHud.showRankedResultModal(result);
  }

  updateRankedMatchWinner(winnerName: string): void {
    this.testArenaHud.updateRankedMatchWinner(winnerName);
  }

  showBattleRoyaleEliminationModal(payload: BattleRoyaleEliminationPayload): void {
    this.testArenaHud.showBattleRoyaleEliminationModal(payload);
  }

  updateBattleRoyaleAliveCount(aliveCount: number): void {
    this.testArenaHud.updateBattleRoyaleAliveCount(aliveCount);
  }

  showBattleRoyaleResultModal(result: BattleRoyaleResultPayload): void {
    this.testArenaHud.showBattleRoyaleResultModal(result);
  }

  resetArenaOverlays(): void {
    this.testArenaHud.resetArenaOverlays();
  }

  isOrientationBlocked(): boolean {
    return this.orientationGuard.isBlocked();
  }

  resetArenaTouchControls(): void {
    this.testArenaHud.touchInputManager.resetAll();
  }

  onViewportChange(metrics: ViewportMetrics): void {
    this.latestMetrics = metrics;
    this.orientationGuard.updateViewport(metrics, this.currentScreen);
    this.waitingLobbyLoadingOverlay.updateViewport();
    this.mainMenuScreen.updateDeviceBadge(this.deviceProfile, metrics);
    this.settingsScreen.updateViewport(metrics);
    this.controlLayoutEditor.updateViewport(metrics);
    this.testArenaHud.applySettingsAndViewport(this.settingsManager.getSettings(), metrics);
  }

  onSettingsChange(settings: GameSettings, metrics: ViewportMetrics): void {
    this.mainMenuScreen.setMuted(settings.audio.muted);
    this.mainMenuScreen.setShowFps(settings.graphics.showFps);
    this.testArenaHud.applySettingsAndViewport(settings, metrics);
  }

  onControlSettingsChange(metrics: ViewportMetrics): void {
    this.testArenaHud.applySettingsAndViewport(this.settingsManager.getSettings(), metrics);
  }

  dispose(): void {
    if (this.taglineTimer) {
      clearInterval(this.taglineTimer);
      this.taglineTimer = 0;
    }
    this.i18nUnsubscribe?.();
    this.i18nUnsubscribe = null;
    this.loadingScreen.dispose();
    this.authScreen.dispose();
    this.postLoginLoadingScreen.dispose();
    this.mainMenuScreen.dispose();
    this.emoteWheelOverlay.dispose();
    this.profileModal.dispose();
    this.mapSelectionScreen.dispose();
    this.battleRoyaleScreen.dispose();
    this.rankedScreen.dispose();
    this.characterSelectionUI.dispose();
    this.petsScreen.dispose();
    this.shopScreen.dispose();
    this.vaultScreen.dispose();
    this.settingsScreen.dispose();
    this.controlLayoutEditor.dispose();
    this.testArenaHud.dispose();
    this.waitingLobbyLoadingOverlay.dispose();
    this.orientationGuard.dispose();
    this.uiRoot.innerHTML = '';
  }
}
