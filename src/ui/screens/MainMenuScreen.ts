import { resolvePublicAssetUrl } from '../../config/RuntimeConfig';
import type { CharacterDefinition } from '../../characters/CharacterData';
import type { CharacterPreviewRenderer } from '../../characters/CharacterPreviewRenderer';
import {
  type DeviceProfile,
  type LobbyGameMode,
  type ScreenId,
  type ViewportMetrics,
} from '../../core/Types';
import type { MapId } from '../../maps/IMapSystem';
import { MAP_CONFIGS } from '../../maps/MapData';
import { getMapPreviewUrl } from '../../maps/MapPreviewAssets';
import {
  R6_ACCESSORIES,
  R6_ARMORS,
  R6_PETS,
  R6_TOPS,
  type R6Customization,
} from '../../player/R6CustomizationData';
import type { PlayerAccountSnapshot } from '../../progression/PlayerProfileManager';
import { i18n } from '../../i18n/I18nManager';
import type { BattleRoyaleMatchConfig, LobbyDifficultySetting } from '../../battleroyale/BattleRoyaleTypes';
import {
  getRankTierSpec,
  type FriendLookupResponse,
  type FriendRequestEntry,
  type MailboxCategory,
  type MailboxMessageView,
  type MailboxStateSnapshot,
  type OutgoingFriendRequestEntry,
  type SquadFriendEntry,
  type SquadInviteNotification,
  type SquadSize,
  type SquadStateSnapshot,
} from '../../ranked/RankedTypes';
import {
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
} from '../../shop/AvatarBannerCatalog';
import { getAvatarSvg, getBannerSvg } from '../icons/AvatarBannerSvg';
import {
  getArmorSvg,
  getAudioToggleSvg,
  getBackpackSvg,
  getBattleRoyaleModeSvg,
  getCurrencyCoinSvg,
  getCustomizeIconSvg,
  getFriendsPersonSvg,
  getGenderIconSvg,
  getMailEnvelopeSvg,
  getMapGlobeSvg,
  getOperatorIconSvg,
  getPetCompanionSvg,
  getPlayDeploySvg,
  getPlusIconSvg,
  getPracticeTargetSvg,
  getRankedShieldSvg,
  getSettingsCogSvg,
  getShopCrateSvg,
  getWeaponSvg,
} from '../icons/GameIcons';

export interface MainMenuCallbacks {
  onNavigate: (screen: ScreenId, options?: { openCustomize?: boolean }) => void;
  onOpenGlbImport?: () => void;
  onOpenProfile: () => void;
  onSelectGameMode: (mode: LobbyGameMode) => void;
  onStartPressed: () => void;
  onCancelRankedQueue: () => void;
  onOpenMapSelection: () => void;
  onToggleMute: () => void;
  onRotateCharacter: (deltaYaw: number) => void;
  onToggleAutoSpin: () => boolean;
  onUpdateCustomization: (custom: R6Customization) => void;
  onOpenEmoteWheel: () => void;
  onStopEmote: () => void;
  onSelectSquadSize: (size: SquadSize) => void;
  onCreateParty: () => void;
  onToggleSquadReady: (ready: boolean) => void;
  onTransferSquadLeader: (playerId: string) => void;
  onInviteFriend: (friendId: string) => void;
  onRespondSquadInvite: (inviteId: string, accept: boolean) => void;
  onLeaveSquad: () => void;
  onKickSquadMember: (playerId: string) => void;
  onInspectPlayer?: (playerId: string) => void;
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
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class MainMenuScreen {
  readonly element: HTMLElement;
  private readonly profileBannerBgEl: HTMLElement;
  private readonly profileCosmeticAvatarEl: HTMLElement;
  private readonly profileAvatarImg: HTMLImageElement;
  private readonly profileNameEl: HTMLElement;
  private readonly profileGenderIconEl: HTMLElement;
  private readonly profileTierEl: HTMLElement;
  private readonly profileLevelEl: HTMLElement;
  private readonly profileXpTextEl: HTMLElement;
  private readonly profileXpBarEl: HTMLElement;
  private equippedAvatarId = DEFAULT_AVATAR_ID;
  private equippedBannerId = DEFAULT_BANNER_ID;
  private readonly muteBtn: HTMLButtonElement;
  private readonly muteIconEl: HTMLElement;
  private readonly modeBadgeEl: HTMLElement;
  private readonly mapThumbImg: HTMLImageElement;
  private readonly mapNameEl: HTMLElement;
  private readonly mapSubtitleEl: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly startLabelEl: HTMLElement;
  private readonly startSubLabelEl: HTMLElement;
  private readonly brModeBtn: HTMLButtonElement;
  private readonly rankedModeBtn: HTMLButtonElement;
  private readonly practiceModeBtn: HTMLButtonElement;
  private readonly queueStatusEl: HTMLElement;
  private readonly queueStatusTextEl: HTMLElement;
  private readonly mapSelectCardEl: HTMLElement;
  private readonly mapSelectPillEl: HTMLElement;
  private readonly inventoryModalEl: HTMLElement;
  private readonly inventoryContentEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly squadCountBadgeEl: HTMLElement;
  private readonly squadCreateBtn: HTMLButtonElement;
  private readonly squadMembersRowEl: HTMLElement;
  private readonly squadReadyBtn: HTMLButtonElement;
  private readonly squadLeaveBtn: HTMLButtonElement;
  private readonly squadSizeBtns = new Map<SquadSize, HTMLButtonElement>();
  private readonly currencyAmountEl: HTMLElement;
  private readonly currencyAddBtn: HTMLButtonElement;
  private readonly friendsToggleBtn: HTMLButtonElement;
  private readonly friendsReqBadgeEl: HTMLElement;
  private readonly mailOpenBtn: HTMLButtonElement;
  private readonly mailUnreadBadgeEl: HTMLElement;
  private readonly friendsPanelBodyEl: HTMLElement;
  private readonly friendsTabFriendsBtn: HTMLButtonElement;
  private readonly friendsTabRequestsBtn: HTMLButtonElement;
  private readonly friendSearchFormEl: HTMLFormElement;
  private readonly friendSearchInputEl: HTMLInputElement;
  private readonly friendSearchBtnEl: HTMLButtonElement;
  private readonly friendSearchResultEl: HTMLElement;
  private readonly friendRequestsSectionEl: HTMLElement;
  private readonly friendsListEl: HTMLElement;
  private readonly friendsCountEl: HTMLElement;
  private readonly mailboxModalEl: HTMLElement;
  private readonly mailboxTabInboxBtn: HTMLButtonElement;
  private readonly mailboxTabArchivedBtn: HTMLButtonElement;
  private readonly mailboxUnreadHeaderEl: HTMLElement;
  private readonly mailboxListEl: HTMLElement;
  private readonly mailboxReaderEl: HTMLElement;
  private readonly incomingInviteBannerEl: HTMLElement;
  private readonly incomingInviteAvatarEl: HTMLElement;
  private readonly incomingInviteMetaEl: HTMLElement;
  private readonly incomingInviteBodyEl: HTMLElement;
  private readonly lobbyToastEl: HTMLElement;
  private lobbyToastTimer = 0;
  private lastFps = -1;
  private activeEmoteName: string | null = null;

  private selectedMapId: MapId;
  private selectedMode: LobbyGameMode = 'battle-royale';
  private selectedSquadSize: SquadSize = 1;
  private squadState: SquadStateSnapshot;
  private friendsList: SquadFriendEntry[] = [];
  private friendRequests: FriendRequestEntry[] = [];
  private outgoingRequests: OutgoingFriendRequestEntry[] = [];
  private outgoingRequestTargetIds = new Set<string>();
  private friendsActiveTab: 'friends' | 'requests' = 'friends';
  private confirmRemoveFriendId: string | null = null;
  private removingFriendIds = new Set<string>();
  private cancellingRequestIds = new Set<string>();
  private friendSearchResult: FriendLookupResponse | null = null;
  private friendSearchError = '';
  private isSearchingFriend = false;
  private sendingFriendTargetId: string | null = null;
  private respondingRequestIds = new Set<string>();
  private isFriendsPanelOpen = false;

  private mailboxState: MailboxStateSnapshot = {
    messages: [],
    unreadCount: 0,
    unclaimedRewardCount: 0,
  };
  private isMailboxOpen = false;
  private mailboxActiveTab: 'inbox' | 'archived' = 'inbox';
  private selectedMailId: string | null = null;
  private claimingMailIds = new Set<string>();
  private mutatingMailIds = new Set<string>();

  private pendingIncomingInvite: SquadInviteNotification | null = null;
  private brBotCount = 50;
  private brDifficulty: LobbyDifficultySetting = 'mixed';
  private selectedCharacter: CharacterDefinition;
  private customization: R6Customization;
  private latestProfile: PlayerAccountSnapshot;
  private latestQueueInfo?: { waitSec: number; queuedPlayers: number; mapName?: string; message?: string };
  private cancelAvatarRequest: (() => void) | null = null;
  private lastAvatarKey = '';
  private readonly petSnapshotCancels: Array<() => void> = [];
  private isQueuing = false;
  private isStartingMatch = false;
  private isInventoryOpen = false;
  private isDeveloperVerified = false;
  private readonly glbImportNavBtn: HTMLButtonElement;
  private i18nUnsubscribe: (() => void) | null = null;

  constructor(
    _deviceProfile: DeviceProfile,
    _initialMetrics: ViewportMetrics,
    initialMuted: boolean,
    initialMapId: MapId,
    initialCharacter: CharacterDefinition,
    initialCustomization: R6Customization,
    initialProfile: PlayerAccountSnapshot,
    private readonly previewRenderer: CharacterPreviewRenderer,
    private readonly callbacks: MainMenuCallbacks,
  ) {
    this.selectedMapId = initialMapId;
    this.selectedCharacter = initialCharacter;
    this.customization = { ...initialCustomization };
    this.latestProfile = initialProfile;
    this.squadState = {
      squadId: null,
      maxSize: 1,
      leaderId: 'local',
      members: [
        {
          playerId: 'local',
          name: initialProfile.username,
          tier: initialProfile.tier,
          rp: initialProfile.rp,
          characterId: initialCharacter.id,
          customization: { ...initialCustomization },
          isLeader: true,
          ready: true,
          isSelf: true,
        },
      ],
      pendingInviteIds: [],
    };

    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-20 flex flex-col justify-between safe-pad pointer-events-none';

    this.element.innerHTML = `
      <!-- Top Bar: Compact Top-Left Player Profile Card + Brand | Utility Actions -->
      <header class="flex items-start justify-between gap-2 w-full">
        <div class="pointer-events-auto flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
          <!-- Top-Left Player Profile Card -->
          <button
            type="button"
            data-action="open-profile"
            class="nr-lobby-profile relative overflow-hidden nexus-panel-subtle px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-md flex items-center gap-2 sm:gap-2.5 border border-orange-400/45 hover:border-orange-400 transition-colors text-left min-h-[50px] sm:min-h-[54px] w-full max-w-[235px] sm:w-auto sm:max-w-[300px] min-w-0"
            title="${i18n.t('menu.title.profile')}"
          >
            <div data-role="profile-banner-bg" class="absolute inset-0 opacity-45 pointer-events-none" aria-hidden="true">
              ${getBannerSvg(DEFAULT_BANNER_ID, 'w-full h-full object-cover')}
            </div>
            <div class="absolute inset-0 bg-slate-950/60 pointer-events-none" aria-hidden="true"></div>
            <div class="nr-lobby-avatar relative z-10 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-950 border-2 border-sky-400/70 overflow-hidden shrink-0 flex items-center justify-center">
              <img
                data-role="profile-avatar"
                src=""
                alt="Player 3D avatar"
                class="hidden w-full h-full object-cover opacity-0 transition-opacity duration-200"
              />
              <div data-role="profile-cosmetic-avatar" class="w-full h-full">
                ${getAvatarSvg(DEFAULT_AVATAR_ID, 'w-full h-full')}
              </div>
            </div>
            <div class="relative z-10 min-w-0 flex-1 flex flex-col gap-0.5 sm:gap-1">
              <div class="flex items-center justify-between gap-1.5">
                <div class="flex items-center gap-1 min-w-0">
                  <span data-role="profile-username" class="text-[11px] sm:text-xs font-black tracking-wider text-white truncate max-w-[84px] sm:max-w-[126px]">
                    ${i18n.t('menu.fighterDefault')}
                  </span>
                  <span data-role="profile-gender-icon" class="hidden w-3.5 h-3.5 shrink-0" aria-hidden="true"></span>
                </div>
                <span data-role="profile-level" class="px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-400/70 text-[10px] font-black tracking-wider text-orange-300 tabular-nums shrink-0">
                  ${i18n.t('menu.lvlShort', { level: 1 })}
                </span>
              </div>
              <div class="w-full h-1.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                <div data-role="profile-xp-bar" class="h-full rounded-full transition-[width] duration-300" style="width: 0%; background: linear-gradient(90deg, #38bdf8 0%, #f97316 100%);"></div>
              </div>
              <div class="flex items-center justify-between gap-2 text-[9px] font-bold tracking-wider uppercase tabular-nums">
                <span data-role="profile-tier" class="text-sky-300 truncate">${i18n.translateRankTier('Bronze')}</span>
                <span data-role="profile-xp-text" class="text-slate-200 whitespace-nowrap">${i18n.t('menu.xpFraction', { xp: 0, next: 100 })}</span>
              </div>
            </div>
          </button>
        </div>

        <div class="pointer-events-auto flex flex-col-reverse sm:flex-row sm:items-center items-end gap-1 sm:gap-2 shrink-0">
          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span
              data-role="lobby-fps"
              class="hidden md:inline-block nexus-panel-subtle px-2.5 py-1.5 rounded-md text-[11px] font-extrabold tracking-wider text-emerald-300 tabular-nums border border-emerald-500/30 whitespace-nowrap"
            >${i18n.t('hud.fps', { fps: 60 })}</span>

            <!-- Game-Style Currency Balance + Quick Shop Add -->
            <div
              data-role="lobby-currency-box"
              title="${escapeHtml(i18n.t('lobby.currency.title'))}"
              class="nr-lobby-currency-pill nexus-panel-subtle rounded-md border border-amber-400/55 bg-slate-950/85 pl-2 pr-1 py-1 flex items-center gap-1.5 sm:gap-2 min-h-[34px] sm:min-h-[42px] shrink-0 shadow-lg"
            >
              <span class="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0">${getCurrencyCoinSvg()}</span>
              <span
                data-role="lobby-currency-amount"
                class="text-[11px] sm:text-[13px] font-black tracking-wide text-amber-200 tabular-nums whitespace-nowrap"
              >2,000</span>
              <button
                type="button"
                data-action="currency-add"
                aria-label="${escapeHtml(i18n.t('lobby.currency.add'))}"
                title="${escapeHtml(i18n.t('lobby.currency.add'))}"
                class="w-6 h-6 sm:w-7 sm:h-7 rounded bg-amber-500/25 hover:bg-amber-500/45 active:scale-95 border border-amber-400/80 text-amber-100 flex items-center justify-center transition-colors shrink-0"
              >
                <span class="w-3.5 h-3.5">${getPlusIconSvg()}</span>
              </button>
            </div>
          </div>

          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <!-- Friends Person Icon + Pending Requests Badge -->
            <button
              type="button"
              data-action="toggle-friends-panel"
              aria-expanded="false"
              aria-label="${escapeHtml(i18n.t('lobby.friends.aria'))}"
              title="${escapeHtml(i18n.t('lobby.friends.aria'))}"
              class="relative nr-lobby-top-btn nexus-btn-secondary px-2 sm:px-2.5 py-2 rounded-md flex items-center justify-center min-h-[40px] sm:min-h-[42px] min-w-[40px] sm:min-w-[42px] border-sky-400/50 hover:border-sky-300 text-sky-200 hover:text-white shrink-0"
            >
              <span class="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0">${getFriendsPersonSvg()}</span>
              <span
                data-role="friends-req-badge"
                class="hidden absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black leading-none flex items-center justify-center border border-slate-950 tabular-nums shadow"
              >0</span>
            </button>

            <!-- Mail Envelope Icon + Unread Message Badge (Immediately Beside Friends Icon) -->
            <button
              type="button"
              data-action="open-mailbox"
              aria-expanded="false"
              aria-label="${escapeHtml(i18n.t('mail.openAria'))}"
              title="${escapeHtml(i18n.t('mail.openAria'))}"
              class="relative nr-lobby-top-btn nexus-btn-secondary px-2 sm:px-2.5 py-2 rounded-md flex items-center justify-center min-h-[40px] sm:min-h-[42px] min-w-[40px] sm:min-w-[42px] border-amber-400/45 hover:border-amber-300 text-amber-200 hover:text-white shrink-0"
            >
              <span class="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0">${getMailEnvelopeSvg()}</span>
              <span
                data-role="mail-unread-badge"
                class="hidden absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black leading-none flex items-center justify-center border border-slate-950 tabular-nums shadow"
              >0</span>
            </button>

            <button
              type="button"
              data-nav="settings"
              class="nr-lobby-top-btn nr-lobby-top-settings nexus-btn-secondary px-2.5 sm:px-3 py-2 rounded-md text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 min-h-[42px] whitespace-nowrap shrink-0"
              aria-label="${i18n.t('menu.nav.settings')}"
              title="${i18n.t('menu.nav.settings')}"
            >
              <span class="w-4 h-4 text-slate-200 shrink-0">${getSettingsCogSvg()}</span>
              <span data-i18n="settings-top" class="hidden md:inline">${i18n.t('menu.nav.settings')}</span>
            </button>

            <button
              type="button"
              data-action="mute"
              class="nr-lobby-top-btn nexus-btn-secondary px-2.5 sm:px-3 py-2 rounded-md text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 min-h-[40px] sm:min-h-[42px] whitespace-nowrap shrink-0"
              aria-label="${i18n.t('hud.aria.toggleMute')}"
              title="${i18n.t('hud.aria.toggleMute')}"
            >
              <span data-role="mute-icon" class="w-4 h-4 shrink-0"></span>
            </button>
          </div>
        </div>
      </header>

      <!-- Middle Row: Compact Left Tactical Dock (Center Left Completely Open for 3D Operator!) -->
      <main class="nr-lobby-main w-full flex-1 min-h-0 flex items-center justify-between gap-2 py-1 sm:py-2">
        <nav class="nr-lobby-nav pointer-events-auto w-auto flex flex-col gap-1.5 sm:gap-2" aria-label="Lobby Navigation">
          <button
            type="button"
            data-nav="characters"
            class="nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-slate-700/80 hover:border-sky-400"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0">${getOperatorIconSvg()}</span>
            <span data-i18n="nav-characters" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('menu.charactersBtn')}</span>
          </button>

          <button
            type="button"
            data-nav="pets"
            class="nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-slate-700/80 hover:border-amber-400"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0">${getPetCompanionSvg()}</span>
            <span data-i18n="nav-pets" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('menu.petsBtn')}</span>
          </button>

          <button
            type="button"
            data-action="toggle-inventory"
            class="nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-slate-700/80 hover:border-orange-400"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 shrink-0">${getBackpackSvg(2)}</span>
            <span data-i18n="nav-inventory" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('menu.nav.inventory')}</span>
          </button>

          <button
            type="button"
            data-action="customize-rail"
            class="nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-slate-700/80 hover:border-sky-400"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 shrink-0">${getCustomizeIconSvg()}</span>
            <span data-i18n="nav-customize" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('menu.customizeBtn')}</span>
          </button>

          <button
            type="button"
            data-nav="vault"
            class="nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-sky-400/50 hover:border-sky-300"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0">${getBackpackSvg(3)}</span>
            <span data-i18n="nav-vault" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('menu.nav.vault')}</span>
          </button>

          <button
            type="button"
            data-nav="shop"
            class="nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-slate-700/80 hover:border-amber-400"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0">${getShopCrateSvg()}</span>
            <span data-i18n="nav-shop" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('menu.nav.shop')}</span>
          </button>

          <button
            type="button"
            data-action="open-glb-import"
            class="hidden nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-amber-400/75 bg-amber-500/15 text-amber-200 hover:border-amber-300"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0">${getCustomizeIconSvg()}</span>
            <span data-i18n="nav-glb-import" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('shop.tab.glb-import')}</span>
          </button>

          <button
            type="button"
            data-nav="settings"
            class="nr-mobile-only-nav sm:hidden nexus-btn-secondary px-2 sm:px-3 py-2 sm:py-2.5 rounded-md flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2.5 min-h-[42px] sm:min-h-[44px] min-w-0 border-slate-700/80 hover:border-slate-400"
          >
            <span class="w-4 h-4 sm:w-5 sm:h-5 text-slate-300 shrink-0">${getSettingsCogSvg()}</span>
            <span data-i18n="nav-settings" class="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase truncate">${i18n.t('menu.nav.settings')}</span>
          </button>
        </nav>

        <!-- Right Side left visually clear above bottom-right Combat Dock -->
        <div class="hidden lg:block w-[1px]" aria-hidden="true"></div>
      </main>

      <!-- Bottom Bar: Bottom-Right Deployment Dock (Map, Modes, START) -->
      <footer class="nr-lobby-footer w-full flex flex-row items-end justify-end gap-2">

        <!-- Bottom-Right Combat Deployment Dock -->
        <section class="nr-lobby-dock ml-auto pointer-events-auto w-[280px] sm:w-[320px] lg:w-[348px] flex flex-col gap-1.5 sm:gap-2 shrink-0">
          <div data-role="lobby-queue-bar" class="hidden nexus-panel px-3 py-2 rounded-md border border-amber-400/70 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div data-i18n="queue-title" class="text-[10px] font-black tracking-widest uppercase text-amber-300">${i18n.t('menu.queue.title')}</div>
              <div data-role="lobby-queue-text" class="text-xs font-semibold text-slate-200 tabular-nums truncate">${i18n.t('menu.queue.searching')}</div>
            </div>
            <button
              type="button"
              data-action="cancel-queue"
              class="nexus-btn-secondary px-2.5 py-1.5 rounded text-[10px] font-extrabold tracking-wider uppercase text-rose-300 border-rose-400/50 whitespace-nowrap shrink-0"
            >${i18n.t('common.cancel')}</button>
          </div>

          <!-- Party / Squad Controls (Create Party, Solo / 2P / 4P, Ready Toggle & Live Party Roster) -->
          <div class="nr-lobby-squad-bar nexus-panel-subtle p-1.5 rounded-md border border-slate-600/80 flex flex-col gap-1.5">
            <div class="nr-lobby-squad-head flex items-center justify-between gap-1.5">
              <div class="flex items-center gap-1.5 min-w-0">
                <span data-i18n="squad-label" class="text-[9px] font-black tracking-[0.14em] uppercase text-sky-300 px-1 truncate">${i18n.t('menu.squad.partyTitle')}</span>
                <span data-role="squad-count-badge" class="text-[9px] font-extrabold tracking-wider uppercase text-slate-300 tabular-nums shrink-0">${i18n.t('menu.squad.count', { count: 1, max: 1 })}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-action="create-party"
                  class="px-2 py-0.5 rounded bg-sky-500/25 hover:bg-sky-500/45 border border-sky-400/70 text-[9px] font-black tracking-wider uppercase text-sky-100 whitespace-nowrap transition-colors"
                >${escapeHtml(i18n.t('menu.squad.createParty'))}</button>
                <button
                  type="button"
                  data-action="leave-squad"
                  class="hidden px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/60 text-[9px] font-black tracking-wider uppercase text-rose-200 whitespace-nowrap transition-colors"
                >${escapeHtml(i18n.t('menu.squad.leaveParty'))}</button>
              </div>
            </div>
            <div class="nr-lobby-squad-grid grid grid-cols-3 gap-1">
              <button
                type="button"
                data-squad-size="1"
                class="nexus-btn-secondary py-1.5 px-1.5 rounded font-black text-[10px] tracking-wider uppercase text-center min-h-[32px] border-2 border-sky-400 bg-sky-500/20 text-white"
              >${i18n.t('menu.squad.solo')}</button>
              <button
                type="button"
                data-squad-size="2"
                class="nexus-btn-secondary py-1.5 px-1.5 rounded font-black text-[10px] tracking-wider uppercase text-center min-h-[32px] border-slate-700 text-slate-300"
              >${i18n.t('menu.squad.duo')}</button>
              <button
                type="button"
                data-squad-size="4"
                class="nexus-btn-secondary py-1.5 px-1.5 rounded font-black text-[10px] tracking-wider uppercase text-center min-h-[32px] border-slate-700 text-slate-300"
              >${i18n.t('menu.squad.quad')}</button>
            </div>
            <div data-role="squad-members-strip" class="nr-lobby-squad-strip hidden flex flex-col gap-1.5 pt-1 border-t border-slate-800/90">
              <div class="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  data-action="toggle-squad-ready"
                  class="w-full py-1 px-2 rounded border text-[10px] font-black tracking-wider uppercase transition-colors bg-amber-500/20 border-amber-400/70 text-amber-200 hover:bg-amber-500/35"
                >${escapeHtml(i18n.t('menu.squad.notReady'))}</button>
              </div>
              <div data-role="squad-members-list" class="nr-party-members-scroll nexus-scroll overflow-y-auto max-h-[120px] sm:max-h-[152px] flex flex-col gap-1 min-w-0"></div>
            </div>
          </div>

          <!-- Selected Map Selector Card -->
          <div
            data-action="open-map-select"
            role="button"
            tabindex="0"
            aria-label="${i18n.t('menu.mapSelectPrompt')}"
            class="nr-lobby-map-card nexus-panel-subtle p-2 rounded-md flex items-center gap-2.5 cursor-pointer border border-slate-600/80 hover:border-orange-400 transition-colors focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            <div class="nr-lobby-map-thumb relative w-20 aspect-video rounded overflow-hidden bg-slate-900 shrink-0 border border-slate-700/80">
              <img
                data-role="selected-map-img"
                src=""
                alt="Selected battleground map preview"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover"
              />
            </div>
            <div class="min-w-0 flex-1 flex flex-col gap-0.5">
              <div data-role="lobby-mode-badge" class="text-[9px] font-extrabold tracking-[0.14em] uppercase text-sky-300 truncate">
                ${i18n.t('menu.brModeLabel')}
              </div>
              <div data-role="selected-map-name" class="text-sm font-black tracking-wider uppercase text-white truncate">
                ${i18n.translateMapName('desert')}
              </div>
              <div data-role="selected-map-sub" class="text-[10px] text-slate-300 truncate tabular-nums">
                ${i18n.t('menu.mapMetaBotsKm', { km: '2.4' })}
              </div>
            </div>
            <span data-role="map-select-pill" class="px-2.5 py-1.5 rounded bg-slate-800/95 border border-slate-600/80 text-[10px] font-extrabold tracking-wider uppercase text-sky-300 flex items-center gap-1 whitespace-nowrap shrink-0">
              <span class="w-3.5 h-3.5">${getMapGlobeSvg()}</span>
              <span data-i18n="map-btn">${i18n.t('menu.mapButton')}</span>
            </span>
          </div>

          <!-- Mode Buttons: BATTLE ROYALE, RANKED ONLINE & PRACTICE -->
          <div class="nr-lobby-modes grid grid-cols-3 gap-1.5">
            <button
              type="button"
              data-mode-select="battle-royale"
              class="nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border-2 border-sky-400 bg-sky-500/20 text-white"
            >
              <span class="w-4 h-4 text-sky-300 shrink-0">${getBattleRoyaleModeSvg()}</span>
              <span data-i18n="mode-br" class="leading-tight truncate">${i18n.t('menu.mode.br')}</span>
            </button>

            <button
              type="button"
              data-mode-select="ranked"
              class="nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border border-amber-400/55 bg-amber-500/10 text-amber-200"
            >
              <span class="w-4 h-4 shrink-0">${getRankedShieldSvg()}</span>
              <span data-i18n="mode-ranked" class="leading-tight truncate">${i18n.t('menu.mode.ranked')}</span>
            </button>

            <button
              type="button"
              data-mode-select="practice"
              class="nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
            >
              <span class="w-4 h-4 text-emerald-300 shrink-0">${getPracticeTargetSvg()}</span>
              <span data-i18n="mode-practice" class="leading-tight truncate">${i18n.t('menu.mode.practice')}</span>
            </button>
          </div>

          <!-- Primary START CTA -->
          <button
            type="button"
            data-action="start-match"
            class="nr-lobby-start nexus-btn-primary w-full py-3.5 px-5 rounded-md font-black text-base tracking-[0.18em] uppercase flex items-center justify-between min-h-[54px]"
          >
            <span class="flex items-center gap-2.5">
              <span class="w-5 h-5 shrink-0">${getPlayDeploySvg()}</span>
              <span data-role="start-label">${i18n.t('menu.startBtn')}</span>
            </span>
            <span data-role="start-sub-label" class="text-[11px] font-bold tracking-widest opacity-95 whitespace-nowrap">
              ${i18n.t('menu.brLobbyBtn', { map: i18n.translateMapName('desert') })}
            </span>
          </button>
        </section>
      </footer>

      <!-- Friends Dropdown Panel (Opened/Closed from Upper Friends Person Icon) -->
      <aside
        data-role="friends-drawer-wrap"
        class="nr-friends-drawer-wrap absolute top-[62px] sm:top-[68px] right-2 sm:right-4 z-30 flex items-start pointer-events-auto"
        aria-label="${i18n.t('menu.squad.friendsTitle')}"
      >
        <div
          data-role="friends-panel-body"
          class="nr-friends-panel-body hidden nexus-panel w-[280px] sm:w-[320px] rounded-md border border-sky-400/50 flex flex-col overflow-hidden shadow-2xl"
        >
          <div class="px-2.5 py-2 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/70">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-4 h-4 text-sky-300 shrink-0">${getFriendsPersonSvg()}</span>
              <span data-i18n="friends-title" class="text-[10.5px] font-black tracking-[0.14em] uppercase text-sky-300 truncate">${i18n.t('menu.squad.friendsTitle')}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span data-role="friends-squad-count" class="text-[10px] font-extrabold text-amber-300 tabular-nums">1/1</span>
              <button
                type="button"
                data-action="close-friends-panel"
                aria-label="${escapeHtml(i18n.t('common.close'))}"
                class="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-black leading-none flex items-center justify-center"
              >&times;</button>
            </div>
          </div>

          <form data-role="friend-search-form" class="px-2 py-1.5 border-b border-slate-800/90 bg-slate-950/50 flex items-center gap-1.5">
            <input
              type="text"
              data-role="friend-search-input"
              maxlength="48"
              autocomplete="off"
              spellcheck="false"
              placeholder="${escapeHtml(i18n.t('friends.searchPlaceholder'))}"
              class="min-w-0 flex-1 px-2 py-1.5 rounded bg-slate-900/95 border border-slate-700/90 focus:border-sky-400 focus:outline-none text-[11px] font-bold text-white placeholder:text-slate-500"
            />
            <button
              type="submit"
              data-action="friend-search-submit"
              class="px-2.5 py-1.5 rounded bg-sky-500/25 hover:bg-sky-500/45 border border-sky-400/70 text-[9.5px] font-black tracking-wider uppercase text-sky-100 whitespace-nowrap shrink-0 min-h-[28px] transition-colors"
            >${escapeHtml(i18n.t('friends.findBtn'))}</button>
          </form>

          <div data-role="friend-search-result" class="hidden px-2 py-1.5 border-b border-slate-800/90 bg-slate-950/70"></div>

          <!-- Friends / Requests Sub-Tabs -->
          <div class="grid grid-cols-2 gap-1 p-1.5 border-b border-slate-800/90 bg-slate-950/40">
            <button
              type="button"
              data-friends-tab="friends"
              class="py-1.5 px-2 rounded text-[10px] font-black tracking-wider uppercase border border-sky-400 bg-sky-500/25 text-white transition-colors"
            >${escapeHtml(i18n.t('friends.tabFriends'))} (0)</button>
            <button
              type="button"
              data-friends-tab="requests"
              class="py-1.5 px-2 rounded text-[10px] font-black tracking-wider uppercase border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500 transition-colors"
            >${escapeHtml(i18n.t('friends.tabRequests'))} (0)</button>
          </div>

          <div data-role="friend-requests-section" class="hidden nexus-scroll overflow-y-auto max-h-[260px] p-1.5 flex flex-col gap-1.5"></div>
          <div
            data-role="friends-list-items"
            class="nr-friends-scroll nexus-scroll overflow-y-auto max-h-[250px] sm:max-h-[300px] p-1.5 flex flex-col gap-1"
          ></div>
        </div>
      </aside>

      <!-- Incoming Party Invite Notification Banner (Multi-client live invite) -->
      <div
        data-role="squad-invite-banner"
        class="hidden absolute top-[58px] sm:top-[68px] left-1/2 -translate-x-1/2 z-40 pointer-events-auto nexus-panel px-3 py-2 rounded-md border border-amber-400/80 flex items-center gap-2.5 shadow-2xl max-w-[92vw]"
      >
        <div data-role="incoming-invite-avatar" class="w-8 h-8 rounded-full overflow-hidden border border-amber-400/70 bg-slate-950 shrink-0">
          ${getAvatarSvg(DEFAULT_AVATAR_ID, 'w-full h-full')}
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span data-i18n="incoming-invite-title" class="text-[9px] font-black tracking-[0.14em] uppercase text-amber-300">${i18n.t('menu.squad.incomingTitle')}</span>
            <span data-role="incoming-invite-meta" class="text-[9px] font-bold text-slate-400 tabular-nums truncate"></span>
          </div>
          <div data-role="incoming-invite-body" class="text-xs font-bold text-white truncate"></div>
        </div>
        <button
          type="button"
          data-action="accept-squad-invite"
          class="px-2.5 py-1.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400 text-[10px] font-black uppercase text-emerald-100 whitespace-nowrap min-h-[32px]"
        >${i18n.t('menu.squad.accept')}</button>
        <button
          type="button"
          data-action="decline-squad-invite"
          class="px-2.5 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/70 text-[10px] font-black uppercase text-rose-100 whitespace-nowrap min-h-[32px]"
        >${i18n.t('menu.squad.decline')}</button>
      </div>

      <!-- Lobby Feedback Toast -->
      <div
        data-role="lobby-toast"
        class="hidden absolute top-[112px] sm:top-[122px] left-1/2 -translate-x-1/2 z-40 pointer-events-none nexus-panel px-3.5 py-1.5 rounded-md border text-xs font-extrabold tracking-wide shadow-2xl max-w-[90vw] truncate"
      ></div>

      <!-- Functional Lobby Armory & Inventory Drawer Modal -->
      <div
        data-role="lobby-inventory-modal"
        class="hidden absolute inset-0 z-30 flex items-center justify-center safe-pad bg-slate-950/75 pointer-events-auto"
      >
        <div class="nexus-panel w-full max-w-2xl max-h-[92dvh] rounded-lg flex flex-col overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="w-6 h-6 shrink-0">${getBackpackSvg(3)}</span>
              <div>
                <h2 data-i18n="inv-modal-title" class="text-sm font-black tracking-widest uppercase text-white">${i18n.t('menu.inv.title')}</h2>
                <p data-i18n="inv-modal-sub" class="text-[11px] text-slate-400">${i18n.t('menu.inv.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              data-action="close-inventory"
              class="nexus-btn-secondary px-3 py-1.5 rounded text-xs font-bold tracking-wider uppercase min-h-[36px]"
            >${i18n.t('common.close')}</button>
          </div>
          <div data-role="lobby-inventory-body" class="nexus-scroll overflow-y-auto p-4 flex flex-col gap-4"></div>
        </div>
      </div>

      <!-- Professional In-Game Mailbox Modal -->
      <div
        data-role="lobby-mailbox-modal"
        class="hidden absolute inset-0 z-40 flex items-center justify-center safe-pad bg-slate-950/80 backdrop-blur-sm pointer-events-auto"
      >
        <div class="nexus-panel w-full max-w-3xl max-h-[90dvh] rounded-lg border border-amber-400/45 flex flex-col overflow-hidden shadow-2xl">
          <div class="px-4 py-3 border-b border-slate-800 bg-slate-950/75 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-6 h-6 text-amber-300 shrink-0">${getMailEnvelopeSvg()}</span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 data-i18n="mail-modal-title" class="text-sm font-black tracking-widest uppercase text-white truncate">${escapeHtml(i18n.t('mail.title'))}</h2>
                  <span data-role="mail-modal-unread" class="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/60 text-[10px] font-black text-rose-200 tabular-nums">0</span>
                </div>
                <p data-i18n="mail-modal-sub" class="text-[11px] text-slate-400 truncate">${escapeHtml(i18n.t('mail.subtitle'))}</p>
              </div>
            </div>
            <button
              type="button"
              data-action="close-mailbox"
              class="nexus-btn-secondary px-3 py-1.5 rounded text-xs font-bold tracking-wider uppercase min-h-[36px] shrink-0"
            >${i18n.t('common.close')}</button>
          </div>

          <div class="px-4 py-2 border-b border-slate-800/90 bg-slate-950/45 flex items-center gap-2">
            <button
              type="button"
              data-mail-tab="inbox"
              class="px-3 py-1.5 rounded text-[10.5px] font-black tracking-wider uppercase border border-amber-400 bg-amber-500/20 text-amber-100 transition-colors"
            >${escapeHtml(i18n.t('mail.tabInbox'))}</button>
            <button
              type="button"
              data-mail-tab="archived"
              class="px-3 py-1.5 rounded text-[10.5px] font-black tracking-wider uppercase border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500 transition-colors"
            >${escapeHtml(i18n.t('mail.tabArchived'))}</button>
          </div>

          <div class="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
            <div
              data-role="mailbox-list"
              class="nexus-scroll sm:w-[44%] max-h-[34dvh] sm:max-h-none overflow-y-auto border-b sm:border-b-0 sm:border-r border-slate-800 p-2 flex flex-col gap-1.5 bg-slate-950/35"
            ></div>
            <div
              data-role="mailbox-reader"
              class="nexus-scroll flex-1 min-h-[220px] overflow-y-auto p-4 flex flex-col justify-between gap-4 bg-slate-900/40"
            ></div>
          </div>
        </div>
      </div>
    `;

    this.profileBannerBgEl = this.element.querySelector('[data-role="profile-banner-bg"]')!;
    this.profileCosmeticAvatarEl = this.element.querySelector('[data-role="profile-cosmetic-avatar"]')!;
    this.profileAvatarImg = this.element.querySelector('[data-role="profile-avatar"]')!;
    this.profileNameEl = this.element.querySelector('[data-role="profile-username"]')!;
    this.profileGenderIconEl = this.element.querySelector('[data-role="profile-gender-icon"]')!;
    this.profileTierEl = this.element.querySelector('[data-role="profile-tier"]')!;
    this.profileLevelEl = this.element.querySelector('[data-role="profile-level"]')!;
    this.profileXpTextEl = this.element.querySelector('[data-role="profile-xp-text"]')!;
    this.profileXpBarEl = this.element.querySelector('[data-role="profile-xp-bar"]')!;
    this.muteBtn = this.element.querySelector('[data-action="mute"]')!;
    this.muteIconEl = this.element.querySelector('[data-role="mute-icon"]')!;
    this.modeBadgeEl = this.element.querySelector('[data-role="lobby-mode-badge"]')!;
    this.mapThumbImg = this.element.querySelector('[data-role="selected-map-img"]')!;
    this.mapNameEl = this.element.querySelector('[data-role="selected-map-name"]')!;
    this.mapSubtitleEl = this.element.querySelector('[data-role="selected-map-sub"]')!;
    this.startBtn = this.element.querySelector('[data-action="start-match"]')!;
    this.startLabelEl = this.element.querySelector('[data-role="start-label"]')!;
    this.startSubLabelEl = this.element.querySelector('[data-role="start-sub-label"]')!;
    this.brModeBtn = this.element.querySelector('[data-mode-select="battle-royale"]')!;
    this.rankedModeBtn = this.element.querySelector('[data-mode-select="ranked"]')!;
    this.practiceModeBtn = this.element.querySelector('[data-mode-select="practice"]')!;
    this.queueStatusEl = this.element.querySelector('[data-role="lobby-queue-bar"]')!;
    this.queueStatusTextEl = this.element.querySelector('[data-role="lobby-queue-text"]')!;
    this.mapSelectCardEl = this.element.querySelector('[data-action="open-map-select"]')!;
    this.mapSelectPillEl = this.element.querySelector('[data-role="map-select-pill"]')!;
    this.inventoryModalEl = this.element.querySelector('[data-role="lobby-inventory-modal"]')!;
    this.inventoryContentEl = this.element.querySelector('[data-role="lobby-inventory-body"]')!;
    this.fpsEl = this.element.querySelector('[data-role="lobby-fps"]')!;
    this.squadCountBadgeEl = this.element.querySelector('[data-role="squad-count-badge"]')!;
    this.squadCreateBtn = this.element.querySelector('[data-action="create-party"]')!;
    this.squadMembersRowEl = this.element.querySelector('[data-role="squad-members-strip"]')!;
    this.squadReadyBtn = this.element.querySelector('[data-action="toggle-squad-ready"]')!;
    this.squadLeaveBtn = this.element.querySelector('[data-action="leave-squad"]')!;
    this.currencyAmountEl = this.element.querySelector('[data-role="lobby-currency-amount"]')!;
    this.currencyAddBtn = this.element.querySelector('[data-action="currency-add"]')!;
    this.friendsToggleBtn = this.element.querySelector('[data-action="toggle-friends-panel"]')!;
    this.friendsReqBadgeEl = this.element.querySelector('[data-role="friends-req-badge"]')!;
    this.mailOpenBtn = this.element.querySelector('[data-action="open-mailbox"]')!;
    this.mailUnreadBadgeEl = this.element.querySelector('[data-role="mail-unread-badge"]')!;
    this.friendsPanelBodyEl = this.element.querySelector('[data-role="friends-panel-body"]')!;
    this.friendsTabFriendsBtn = this.element.querySelector('[data-friends-tab="friends"]')!;
    this.friendsTabRequestsBtn = this.element.querySelector('[data-friends-tab="requests"]')!;
    this.friendSearchFormEl = this.element.querySelector('[data-role="friend-search-form"]')!;
    this.friendSearchInputEl = this.element.querySelector('[data-role="friend-search-input"]')!;
    this.friendSearchBtnEl = this.element.querySelector('[data-action="friend-search-submit"]')!;
    this.friendSearchResultEl = this.element.querySelector('[data-role="friend-search-result"]')!;
    this.friendRequestsSectionEl = this.element.querySelector('[data-role="friend-requests-section"]')!;
    this.friendsListEl = this.element.querySelector('[data-role="friends-list-items"]')!;
    this.friendsCountEl = this.element.querySelector('[data-role="friends-squad-count"]')!;
    this.mailboxModalEl = this.element.querySelector('[data-role="lobby-mailbox-modal"]')!;
    this.mailboxTabInboxBtn = this.element.querySelector('[data-mail-tab="inbox"]')!;
    this.mailboxTabArchivedBtn = this.element.querySelector('[data-mail-tab="archived"]')!;
    this.mailboxUnreadHeaderEl = this.element.querySelector('[data-role="mail-modal-unread"]')!;
    this.mailboxListEl = this.element.querySelector('[data-role="mailbox-list"]')!;
    this.mailboxReaderEl = this.element.querySelector('[data-role="mailbox-reader"]')!;
    this.incomingInviteBannerEl = this.element.querySelector('[data-role="squad-invite-banner"]')!;
    this.incomingInviteAvatarEl = this.element.querySelector('[data-role="incoming-invite-avatar"]')!;
    this.incomingInviteMetaEl = this.element.querySelector('[data-role="incoming-invite-meta"]')!;
    this.incomingInviteBodyEl = this.element.querySelector('[data-role="incoming-invite-body"]')!;
    this.lobbyToastEl = this.element.querySelector('[data-role="lobby-toast"]')!;
    this.glbImportNavBtn = this.element.querySelector('[data-action="open-glb-import"]')!;

    this.element.querySelectorAll<HTMLButtonElement>('[data-squad-size]').forEach((btn) => {
      const sz = Number(btn.dataset.squadSize) as SquadSize;
      if (sz === 1 || sz === 2 || sz === 4) {
        this.squadSizeBtns.set(sz, btn);
        btn.addEventListener('click', () => {
          this.handleSquadSizeSelected(sz);
        });
      }
    });

    this.squadCreateBtn.addEventListener('click', () => {
      this.callbacks.onCreateParty();
      this.setFriendsPanelOpen(true);
    });

    this.squadReadyBtn.addEventListener('click', () => {
      const selfMember = this.squadState.members.find((m) => m.isSelf);
      const currentStatus = selfMember?.status ?? (selfMember?.ready ? 'ready' : 'not-ready');
      if (currentStatus === 'in-match') return;
      this.callbacks.onToggleSquadReady(currentStatus !== 'ready');
    });

    this.currencyAddBtn.addEventListener('click', () => {
      this.callbacks.onNavigate('shop');
    });

    this.friendsToggleBtn.addEventListener('click', () => {
      this.setFriendsPanelOpen(!this.isFriendsPanelOpen);
    });

    this.element.querySelector('[data-action="close-friends-panel"]')?.addEventListener('click', () => {
      this.setFriendsPanelOpen(false);
    });

    this.friendsTabFriendsBtn.addEventListener('click', () => {
      this.setFriendsActiveTab('friends');
    });
    this.friendsTabRequestsBtn.addEventListener('click', () => {
      this.setFriendsActiveTab('requests');
    });

    this.mailOpenBtn.addEventListener('click', () => {
      this.setMailboxOpen(!this.isMailboxOpen);
    });
    this.element.querySelector('[data-action="close-mailbox"]')?.addEventListener('click', () => {
      this.setMailboxOpen(false);
    });
    this.mailboxModalEl.addEventListener('click', (e) => {
      if (e.target === this.mailboxModalEl) {
        this.setMailboxOpen(false);
      }
    });
    this.mailboxTabInboxBtn.addEventListener('click', () => {
      this.mailboxActiveTab = 'inbox';
      this.renderMailboxModal();
    });
    this.mailboxTabArchivedBtn.addEventListener('click', () => {
      this.mailboxActiveTab = 'archived';
      this.renderMailboxModal();
    });

    this.friendSearchFormEl.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleFriendSearchSubmit();
    });

    this.friendSearchInputEl.addEventListener('input', () => {
      if (this.friendSearchError) {
        this.friendSearchError = '';
        this.renderFriendSearchResult();
      }
      if (!this.friendSearchInputEl.value.trim() && this.friendSearchResult) {
        this.friendSearchResult = null;
        this.renderFriendSearchResult();
      }
    });

    this.squadLeaveBtn.addEventListener('click', () => {
      this.callbacks.onLeaveSquad();
    });

    this.element.querySelector('[data-action="accept-squad-invite"]')?.addEventListener('click', () => {
      if (!this.pendingIncomingInvite) return;
      const inviteId = this.pendingIncomingInvite.inviteId;
      this.setIncomingSquadInvite(null);
      this.callbacks.onRespondSquadInvite(inviteId, true);
    });

    this.element.querySelector('[data-action="decline-squad-invite"]')?.addEventListener('click', () => {
      if (!this.pendingIncomingInvite) return;
      const inviteId = this.pendingIncomingInvite.inviteId;
      this.setIncomingSquadInvite(null);
      this.callbacks.onRespondSquadInvite(inviteId, false);
    });

    this.setMuted(initialMuted);
    this.setSelectedCharacter(initialCharacter);
    this.setPlayerProfile(initialProfile);
    this.setSelectedMap(initialMapId);
    this.setSelectedMode('battle-royale');
    this.renderSquadControls();
    this.renderFriendsList();

    this.startBtn.addEventListener('click', () => {
      if (this.isStartingMatch) return;
      if (this.isQueuing) {
        this.callbacks.onCancelRankedQueue();
      } else {
        this.callbacks.onStartPressed();
      }
    });

    this.element.querySelector('[data-action="cancel-queue"]')?.addEventListener('click', () => {
      this.callbacks.onCancelRankedQueue();
    });

    this.brModeBtn.addEventListener('click', () => {
      this.callbacks.onSelectGameMode('battle-royale');
    });

    this.rankedModeBtn.addEventListener('click', () => {
      this.callbacks.onSelectGameMode('ranked');
    });

    this.practiceModeBtn.addEventListener('click', () => {
      this.callbacks.onSelectGameMode('practice');
    });

    this.mapSelectCardEl.addEventListener('click', () => {
      if (this.selectedMode === 'practice') return;
      this.callbacks.onOpenMapSelection();
    });
    this.mapSelectCardEl.addEventListener('keydown', (e) => {
      if (this.selectedMode === 'practice') return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.callbacks.onOpenMapSelection();
      }
    });

    this.element.querySelector('[data-action="open-profile"]')?.addEventListener('click', () => {
      this.callbacks.onOpenProfile();
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.nav as ScreenId;
        this.callbacks.onNavigate(target);
      });
    });

    this.glbImportNavBtn.addEventListener('click', () => {
      if (!this.isDeveloperVerified) return;
      this.callbacks.onOpenGlbImport?.();
    });

    const openCustomize = () => {
      this.callbacks.onNavigate('characters', { openCustomize: true });
    };
    this.element.querySelector('[data-action="customize-rail"]')?.addEventListener('click', openCustomize);

    this.element.querySelector('[data-action="toggle-inventory"]')?.addEventListener('click', () => {
      this.setInventoryOpen(!this.isInventoryOpen);
    });
    this.element.querySelector('[data-action="close-inventory"]')?.addEventListener('click', () => {
      this.setInventoryOpen(false);
    });
    this.inventoryModalEl.addEventListener('click', (e) => {
      if (e.target === this.inventoryModalEl) {
        this.setInventoryOpen(false);
      }
    });

    this.muteBtn.addEventListener('click', () => {
      this.callbacks.onToggleMute();
    });

    this.i18nUnsubscribe = i18n.subscribe(() => {
      this.refreshLocale();
    });
  }

  refreshLocale(): void {
    const q = (sel: string) => this.element.querySelector<HTMLElement>(sel);
    q('[data-action="open-profile"]')?.setAttribute('title', i18n.t('menu.title.profile'));
    this.element.querySelectorAll('[data-nav="settings"]').forEach((el) => {
      el.setAttribute('title', i18n.t('menu.nav.settings'));
      el.setAttribute('aria-label', i18n.t('menu.nav.settings'));
    });
    q('[data-action="mute"]')?.setAttribute('title', i18n.t('hud.aria.toggleMute'));
    q('[data-action="mute"]')?.setAttribute('aria-label', i18n.t('hud.aria.toggleMute'));
    q('[data-action="open-map-select"]')?.setAttribute('aria-label', i18n.t('menu.mapSelectPrompt'));

    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    setText('[data-i18n="settings-top"]', i18n.t('menu.nav.settings'));
    setText('[data-i18n="nav-characters"]', i18n.t('menu.charactersBtn'));
    setText('[data-i18n="nav-pets"]', i18n.t('menu.petsBtn'));
    setText('[data-i18n="nav-inventory"]', i18n.t('menu.nav.inventory'));
    setText('[data-i18n="nav-customize"]', i18n.t('menu.customizeBtn'));
    setText('[data-i18n="nav-vault"]', i18n.t('menu.nav.vault'));
    setText('[data-i18n="nav-shop"]', i18n.t('menu.nav.shop'));
    setText('[data-i18n="nav-glb-import"]', i18n.t('shop.tab.glb-import'));
    setText('[data-i18n="nav-settings"]', i18n.t('menu.nav.settings'));
    setText('[data-i18n="queue-title"]', i18n.t('menu.queue.title'));
    setText('[data-action="cancel-queue"]', i18n.t('common.cancel'));
    setText('[data-i18n="map-btn"]', i18n.t('menu.mapButton'));
    setText('[data-i18n="mode-br"]', i18n.t('menu.mode.br'));
    setText('[data-i18n="mode-ranked"]', i18n.t('menu.mode.ranked'));
    setText('[data-i18n="mode-practice"]', i18n.t('menu.mode.practice'));
    setText('[data-i18n="inv-modal-title"]', i18n.t('menu.inv.title'));
    setText('[data-i18n="inv-modal-sub"]', i18n.t('menu.inv.subtitle'));
    setText('[data-action="close-inventory"]', i18n.t('common.close'));
    setText('[data-i18n="squad-label"]', i18n.t('menu.squad.partyTitle'));
    setText('[data-action="create-party"]', i18n.t('menu.squad.createParty'));
    setText('[data-squad-size="1"]', i18n.t('menu.squad.solo'));
    setText('[data-squad-size="2"]', i18n.t('menu.squad.duo'));
    setText('[data-squad-size="4"]', i18n.t('menu.squad.quad'));
    setText('[data-action="leave-squad"]', i18n.t('menu.squad.leaveParty'));
    setText('[data-i18n="friends-title"]', i18n.t('menu.squad.friendsTitle'));
    setText('[data-i18n="incoming-invite-title"]', i18n.t('menu.squad.incomingTitle'));
    setText('[data-action="accept-squad-invite"]', i18n.t('menu.squad.accept'));
    setText('[data-action="decline-squad-invite"]', i18n.t('menu.squad.decline'));
    setText('[data-i18n="mail-modal-title"]', i18n.t('mail.title'));
    setText('[data-i18n="mail-modal-sub"]', i18n.t('mail.subtitle'));
    setText('[data-action="close-mailbox"]', i18n.t('common.close'));
    q('[data-role="lobby-currency-box"]')?.setAttribute('title', i18n.t('lobby.currency.title'));
    this.currencyAddBtn.title = i18n.t('lobby.currency.add');
    this.currencyAddBtn.setAttribute('aria-label', i18n.t('lobby.currency.add'));
    this.friendsToggleBtn.title = i18n.t('lobby.friends.aria');
    this.friendsToggleBtn.setAttribute('aria-label', i18n.t('lobby.friends.aria'));
    this.mailOpenBtn.title = i18n.t('mail.openAria');
    this.mailOpenBtn.setAttribute('aria-label', i18n.t('mail.openAria'));
    this.friendSearchInputEl.placeholder = i18n.t('friends.searchPlaceholder');
    this.friendSearchBtnEl.textContent = i18n.t('friends.findBtn');

    this.setPlayerProfile(this.latestProfile);
    this.setSelectedCharacter(this.selectedCharacter);
    this.setRankedQueueStatus(this.isQueuing, this.latestQueueInfo);
    this.refreshSelectionCard();
    this.renderSquadControls();
    this.renderFriendsTabs();
    this.renderFriendSearchResult();
    this.renderFriendRequests();
    this.renderFriendsList();
    this.renderIncomingInviteBanner();
    if (this.isMailboxOpen) {
      this.renderMailboxModal();
    }
    if (this.lastFps >= 0) {
      this.fpsEl.textContent = i18n.t('hud.fps', { fps: this.lastFps });
    }
    if (this.isInventoryOpen) {
      this.renderInventoryModal();
    }
  }

  setInventoryOpen(open: boolean): void {
    this.isInventoryOpen = open;
    this.inventoryModalEl.classList.toggle('hidden', !open);
    if (open) {
      this.renderInventoryModal();
    } else {
      this.clearPetSnapshotCancels();
    }
  }

  private clearPetSnapshotCancels(): void {
    for (const cancel of this.petSnapshotCancels) {
      cancel();
    }
    this.petSnapshotCancels.length = 0;
  }

  private renderInventoryModal(): void {
    this.clearPetSnapshotCancels();
    const c = this.selectedCharacter;
    const armor = R6_ARMORS.find((a) => a.id === this.customization.armorId) ?? R6_ARMORS[0];
    const cName = i18n.translateCharacterName(c.id, c.name);
    const cRole = i18n.translateCharacterRole(c.role);
    const cDesc = i18n.translateCharacterDesc(c.id, c.description);
    const cRarity = i18n.translateRarity(c.rarity);
    const armorLabel = i18n.translateCustomizationOption('armorId', armor.id, armor.name);

    this.inventoryContentEl.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="bg-slate-900/85 border border-slate-800 rounded-md p-3 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-4 h-4 text-sky-400 shrink-0">${getGenderIconSvg(c.gender)}</span>
              <span class="text-sm font-black uppercase tracking-wider text-white truncate">${cName}</span>
            </div>
            <span class="text-[11px] font-bold text-orange-400 tabular-nums">${cRarity}</span>
          </div>
          <div class="text-[11px] text-slate-300">${cRole} · ${cDesc}</div>
          <div class="grid grid-cols-3 gap-2 pt-1 text-center tabular-nums">
            <div class="bg-slate-950/80 rounded p-1.5 border border-slate-800">
              <div class="text-[9px] text-slate-400">${i18n.t('menu.inv.health')}</div>
              <div class="text-xs font-extrabold text-emerald-400">${c.maxHealth}</div>
            </div>
            <div class="bg-slate-950/80 rounded p-1.5 border border-slate-800">
              <div class="text-[9px] text-slate-400">${i18n.t('menu.inv.shield')}</div>
              <div class="text-xs font-extrabold text-sky-400">${c.shield}</div>
            </div>
            <div class="bg-slate-950/80 rounded p-1.5 border border-slate-800">
              <div class="text-[9px] text-slate-400">${i18n.t('menu.inv.speed')}</div>
              <div class="text-xs font-extrabold text-orange-400">${c.movementSpeed.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div class="bg-slate-900/85 border border-slate-800 rounded-md p-3 flex flex-col gap-2">
          <div class="text-[10px] font-extrabold tracking-widest uppercase text-sky-400">${i18n.t('menu.inv.dropKit')}</div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-slate-950/80 border border-slate-800 rounded p-2 flex flex-col items-center gap-1">
              <div class="w-9 h-7">${getArmorSvg(armor.tier)}</div>
              <div class="text-[10px] font-bold text-slate-200 truncate w-full">${armorLabel}</div>
            </div>
            <div class="bg-slate-950/80 border border-slate-800 rounded p-2 flex flex-col items-center gap-1">
              <div class="w-9 h-7">${getBackpackSvg(2)}</div>
              <div class="text-[10px] font-bold text-slate-200 truncate w-full">${i18n.t('menu.inv.dropPack')}</div>
            </div>
            <div class="bg-slate-950/80 border border-slate-800 rounded p-2 flex flex-col items-center gap-1">
              <div class="w-11 h-7">${getWeaponSvg('scar', '#e2e8f0')}</div>
              <div class="text-[10px] font-bold text-slate-200 truncate w-full">${i18n.t('menu.inv.arenaLoot')}</div>
            </div>
          </div>
          <div class="text-[10px] text-slate-400">${i18n.t('menu.inv.arenaLootDesc')}</div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('menu.inv.armorPreset')}</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          ${R6_ARMORS.map(
            (a) => `
            <button
              type="button"
              data-inv-key="armorId"
              data-inv-val="${a.id}"
              class="px-2.5 py-2 rounded border text-left text-[11px] font-bold flex items-center gap-2 transition-colors ${
                this.customization.armorId === a.id
                  ? 'bg-sky-500/20 border-sky-400 text-white'
                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
              }"
            >
              <span class="w-3 h-3 rounded-sm border border-white/30 shrink-0" style="background-color:${a.metalHex};"></span>
              <span class="truncate">${i18n.translateCustomizationOption('armorId', a.id, a.name)}</span>
            </button>`,
          ).join('')}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('menu.inv.gearPreset')}</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          ${R6_ACCESSORIES.map(
            (acc) => `
            <button
              type="button"
              data-inv-key="accessoryId"
              data-inv-val="${acc.id}"
              class="px-2.5 py-2 rounded border text-left text-[11px] font-bold flex items-center gap-2 transition-colors ${
                this.customization.accessoryId === acc.id
                  ? 'bg-orange-500/20 border-orange-400 text-white'
                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
              }"
            >
              <span class="w-3 h-3 rounded-sm border border-white/30 shrink-0" style="background-color:${acc.swatchHex};"></span>
              <span class="truncate">${i18n.translateCustomizationOption('accessoryId', acc.id, acc.name)}</span>
            </button>`,
          ).join('')}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('menu.inv.uniformPreset')}</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          ${R6_TOPS.slice(0, 4)
            .map(
              (cl) => `
            <button
              type="button"
              data-inv-key="topId"
              data-inv-val="${cl.id}"
              class="px-2.5 py-2 rounded border text-left text-[11px] font-bold flex items-center gap-2 transition-colors ${
                this.customization.topId === cl.id
                  ? 'bg-sky-500/20 border-sky-400 text-white'
                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
              }"
            >
              <span class="w-3 h-3 rounded-sm border border-white/30 shrink-0" style="background-color:${cl.swatchHex};"></span>
              <span class="truncate">${i18n.translateCustomizationOption('topId', cl.id, cl.name)}</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('menu.inv.petUnit')}</div>
          <button
            type="button"
            data-action="inv-toggle-pet-follow"
            class="px-2.5 py-1 rounded border text-[10px] font-extrabold uppercase tracking-wider ${
              this.customization.petEnabled
                ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }"
          >${this.customization.petEnabled ? i18n.t('menu.inv.matchFollowOn') : i18n.t('menu.inv.matchFollowOff')}</button>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          ${R6_PETS.map((pet) => {
            const petName = i18n.translatePet(pet.id).name;
            return `
            <button
              type="button"
              data-inv-key="petId"
              data-inv-val="${pet.id}"
              class="rounded border overflow-hidden text-left flex flex-col transition-colors ${
                this.customization.petId === pet.id
                  ? 'bg-emerald-500/15 border-emerald-400 text-white'
                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
              }"
            >
              <div class="w-full aspect-square bg-slate-950/90 flex items-center justify-center overflow-hidden border-b border-slate-800">
                <img
                  data-inv-pet-thumb="${pet.id}"
                  src=""
                  alt="${petName}"
                  class="w-full h-full object-contain p-1 opacity-0 transition-opacity duration-200"
                />
              </div>
              <div class="px-1.5 py-1 text-[10px] font-bold truncate">${petName}</div>
            </button>`;
          }).join('')}
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          data-action="inv-to-pets"
          class="nexus-btn-secondary px-3.5 py-2 rounded text-xs font-extrabold tracking-wider uppercase border-amber-400/50 text-amber-200"
        >${i18n.t('menu.inv.petsBay')} →</button>
        <button
          type="button"
          data-action="inv-to-studio"
          class="nexus-btn-primary px-4 py-2 rounded text-xs font-extrabold tracking-wider uppercase"
        >${i18n.t('menu.inv.fullStudio')} →</button>
      </div>
    `;

    for (const pet of R6_PETS) {
      const thumbImg = this.inventoryContentEl.querySelector<HTMLImageElement>(
        `[data-inv-pet-thumb="${pet.id}"]`,
      );
      if (thumbImg) {
        const cancel = this.previewRenderer.requestPetSnapshot(pet.id, (dataUrl) => {
          thumbImg.src = dataUrl;
          thumbImg.classList.remove('opacity-0');
        });
        this.petSnapshotCancels.push(cancel);
      }
    }

    this.inventoryContentEl.querySelectorAll<HTMLButtonElement>('[data-inv-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.invKey as keyof R6Customization;
        const val = btn.dataset.invVal!;
        this.customization = { ...this.customization, [key]: val };
        this.callbacks.onUpdateCustomization({ ...this.customization });
        this.renderInventoryModal();
      });
    });

    this.inventoryContentEl
      .querySelector('[data-action="inv-toggle-pet-follow"]')
      ?.addEventListener('click', () => {
        this.customization = {
          ...this.customization,
          petEnabled: !this.customization.petEnabled,
        };
        this.callbacks.onUpdateCustomization({ ...this.customization });
        this.renderInventoryModal();
      });

    this.inventoryContentEl.querySelector('[data-action="inv-to-pets"]')?.addEventListener('click', () => {
      this.setInventoryOpen(false);
      this.callbacks.onNavigate('pets');
    });

    this.inventoryContentEl.querySelector('[data-action="inv-to-studio"]')?.addEventListener('click', () => {
      this.setInventoryOpen(false);
      this.callbacks.onNavigate('characters', { openCustomize: true });
    });
  }

  setAutoSpinState(_active: boolean): void {
    // Lobby rotation control bar removed.
  }

  setEmotingState(emoteName: string | null): void {
    if (this.activeEmoteName === emoteName) return;
    this.activeEmoteName = emoteName;
  }

  isInventoryModalOpen(): boolean {
    return this.isInventoryOpen;
  }

  setSelectedCharacter(character: CharacterDefinition): void {
    this.selectedCharacter = character;
    this.refreshProfileAvatar();
    if (this.isInventoryOpen) {
      this.renderInventoryModal();
    }
  }

  setCustomization(custom: R6Customization): void {
    this.customization = { ...custom };
    this.refreshProfileAvatar();
    if (this.isInventoryOpen) {
      this.renderInventoryModal();
    }
  }

  setShopCosmetics(avatarId: string, bannerId: string): void {
    const nextAvatar = avatarId || DEFAULT_AVATAR_ID;
    const nextBanner = bannerId || DEFAULT_BANNER_ID;
    if (this.equippedAvatarId !== nextAvatar) {
      this.equippedAvatarId = nextAvatar;
      this.profileCosmeticAvatarEl.innerHTML = getAvatarSvg(nextAvatar, 'w-full h-full');
    }
    if (this.equippedBannerId !== nextBanner) {
      this.equippedBannerId = nextBanner;
      this.profileBannerBgEl.innerHTML = getBannerSvg(nextBanner, 'w-full h-full object-cover');
    }
  }

  setPlayerProfile(snapshot: PlayerAccountSnapshot): void {
    this.latestProfile = snapshot;
    this.profileNameEl.textContent = snapshot.username;
    if (snapshot.gender === 'male') {
      this.profileGenderIconEl.innerHTML = getGenderIconSvg('male');
      this.profileGenderIconEl.className = 'inline-flex items-center justify-center w-3.5 h-3.5 text-sky-400 shrink-0';
    } else if (snapshot.gender === 'female') {
      this.profileGenderIconEl.innerHTML = getGenderIconSvg('female');
      this.profileGenderIconEl.className = 'inline-flex items-center justify-center w-3.5 h-3.5 text-pink-400 shrink-0';
    } else {
      this.profileGenderIconEl.innerHTML = '';
      this.profileGenderIconEl.className = 'hidden w-3.5 h-3.5 shrink-0';
    }
    this.profileLevelEl.textContent = i18n.t('menu.lvlShort', { level: snapshot.level });
    this.profileTierEl.textContent = i18n.t('menu.tierRpLine', {
      tier: i18n.translateRankTier(snapshot.tier).toUpperCase(),
      rp: snapshot.rp,
    });
    this.profileXpTextEl.textContent = i18n.t('menu.xpFraction', {
      xp: snapshot.xp,
      next: snapshot.nextLevelXp,
    });
    const pct = Math.max(
      0,
      Math.min(100, Math.round((snapshot.xp / Math.max(1, snapshot.nextLevelXp)) * 100)),
    );
    this.profileXpBarEl.style.width = `${pct}%`;
  }

  private refreshProfileAvatar(): void {
    const nextKey = this.previewRenderer.getCacheKey({
      mode: 'avatar',
      humanModelId: this.selectedCharacter.model.humanModelId ?? 'r6-vanguard',
      primaryColorHex: this.selectedCharacter.model.primaryColorHex,
      visorColorHex: this.selectedCharacter.model.visorColorHex,
      customization: this.customization,
    });
    if (nextKey === this.lastAvatarKey && (this.profileAvatarImg.getAttribute('src') || this.cancelAvatarRequest)) {
      return;
    }
    this.lastAvatarKey = nextKey;
    this.cancelAvatarRequest?.();
    this.cancelAvatarRequest = this.previewRenderer.requestCharacterSnapshot(
      this.selectedCharacter,
      this.customization,
      'avatar',
      (dataUrl) => {
        this.profileAvatarImg.src = dataUrl;
        this.profileAvatarImg.classList.remove('opacity-0');
      },
    );
  }

  setDeveloperAccess(isVerifiedDeveloper: boolean): void {
    this.isDeveloperVerified = Boolean(isVerifiedDeveloper);
    this.glbImportNavBtn.classList.toggle('hidden', !this.isDeveloperVerified);
  }

  setSelectedMode(mode: LobbyGameMode): void {
    this.selectedMode = mode;
    this.refreshSelectionCard();

    const activeBr =
      'nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border-2 border-sky-400 bg-sky-500/20 text-white';
    const inactiveBr =
      'nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border border-sky-400/50 bg-sky-500/10 text-sky-200 hover:border-sky-300';
    const activeRanked =
      'nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border-2 border-amber-400 bg-amber-500/20 text-white';
    const inactiveRanked =
      'nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border border-amber-400/55 bg-amber-500/10 text-amber-200 hover:border-amber-300';
    const activePractice =
      'nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border-2 border-emerald-400 bg-emerald-500/20 text-white';
    const inactivePractice =
      'nexus-btn-secondary py-2 px-2 rounded-md text-left font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5 min-h-[44px] min-w-0 border border-emerald-400/50 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300';

    this.brModeBtn.className = mode === 'battle-royale' ? activeBr : inactiveBr;
    this.rankedModeBtn.className = mode === 'ranked' ? activeRanked : inactiveRanked;
    this.practiceModeBtn.className = mode === 'practice' ? activePractice : inactivePractice;
  }

  setBattleRoyaleConfig(config: Pick<BattleRoyaleMatchConfig, 'botCount' | 'difficulty'>): void {
    this.brBotCount = config.botCount;
    this.brDifficulty = config.difficulty;
    this.refreshSelectionCard();
  }

  setSelectedMap(mapId: MapId): void {
    this.selectedMapId = mapId;
    this.refreshSelectionCard();
  }

  private refreshSelectionCard(): void {
    const isTrainingGround = this.selectedMode === 'practice';
    const cfg = MAP_CONFIGS[this.selectedMapId];
    const mapLabel = isTrainingGround
      ? i18n.translateMapName('training_ground')
      : i18n.translateMapName(this.selectedMapId);
    const km = isTrainingGround ? '0.7' : ((cfg.radiusMeters * 2) / 1000).toFixed(1);
    this.mapThumbImg.src = isTrainingGround
      ? resolvePublicAssetUrl('assets/aistudio/__________________-_Brave_11_17_2026_7_10_42_AM_acbd4e94.png')
      : getMapPreviewUrl(this.selectedMapId);
    this.mapThumbImg.alt = mapLabel;
    this.mapNameEl.textContent = mapLabel;
    this.mapSelectPillEl.classList.toggle('hidden', isTrainingGround);
    this.mapSelectCardEl.classList.toggle('cursor-pointer', !isTrainingGround);
    this.mapSelectCardEl.classList.toggle('hover:border-orange-400', !isTrainingGround);
    this.mapSelectCardEl.setAttribute('aria-disabled', String(isTrainingGround));
    this.mapSelectCardEl.tabIndex = isTrainingGround ? -1 : 0;

    if (this.selectedMode === 'ranked') {
      this.modeBadgeEl.textContent = i18n.t('menu.rankedModeLabel');
      this.modeBadgeEl.className =
        'text-[9px] font-extrabold tracking-[0.14em] uppercase text-amber-300 truncate';
      this.mapSubtitleEl.textContent = i18n.t('menu.mapMetaRealKm', { km });
    } else if (isTrainingGround) {
      this.modeBadgeEl.textContent = i18n.t('menu.practiceModeLabel');
      this.modeBadgeEl.className =
        'text-[9px] font-extrabold tracking-[0.14em] uppercase text-emerald-300 truncate';
      this.mapSubtitleEl.textContent = i18n.t('menu.mapMetaPracticeKm', { km });
    } else {
      this.modeBadgeEl.textContent = i18n.t('menu.brModeLabel');
      this.modeBadgeEl.className =
        'text-[9px] font-extrabold tracking-[0.14em] uppercase text-sky-300 truncate';
      this.mapSubtitleEl.textContent =
        this.brBotCount === 50 && this.brDifficulty === 'mixed'
          ? i18n.t('menu.mapMetaBotsKm', { km })
          : i18n.t('menu.mapMetaCustomBotsKm', {
              count: this.brBotCount,
              diff: i18n.translateDifficulty(this.brDifficulty),
              km,
            });
    }

    if (!this.isQueuing) {
      const inParty = Boolean(this.squadState.squadId);
      const selfMember = this.squadState.members.find((m) => m.isSelf);
      const isSelfLeader = selfMember ? selfMember.isLeader : true;
      const humanMembers = this.squadState.members.filter((m) => !m.isBotAlly);
      const allReady = humanMembers.every(
        (m) => (m.status ?? (m.ready ? 'ready' : 'not-ready')) === 'ready',
      );
      const blockedByParty = inParty && (!isSelfLeader || !allReady);

      if (inParty && !isSelfLeader) {
        this.startLabelEl.textContent = i18n.t('menu.squad.waitingLeader');
        this.startSubLabelEl.textContent = i18n.t('menu.squad.waitingLeaderSub');
      } else if (inParty && !allReady) {
        this.startLabelEl.textContent = i18n.t('menu.squad.teamNotReady');
        this.startSubLabelEl.textContent = i18n.t('menu.squad.teamNotReadySub');
      } else {
        this.startLabelEl.textContent = i18n.t('menu.startBtn');
        this.startSubLabelEl.textContent =
          this.selectedMode === 'ranked'
            ? i18n.t('menu.rankedLobbyBtn', { map: mapLabel })
            : isTrainingGround
              ? i18n.t('menu.practiceLobbyBtn', { map: mapLabel })
              : i18n.t('menu.brLobbyBtn', { map: mapLabel });
      }
      this.startBtn.classList.toggle('opacity-65', blockedByParty && !this.isStartingMatch);
    } else {
      this.startBtn.classList.remove('opacity-65');
    }
  }

  setRankedQueueStatus(
    queuing: boolean,
    info?: { waitSec: number; queuedPlayers: number; mapName?: string; message?: string },
  ): void {
    this.isQueuing = queuing;
    this.latestQueueInfo = info;
    this.queueStatusEl.classList.toggle('hidden', !queuing);
    if (queuing) {
      this.startLabelEl.textContent = i18n.t('menu.queue.title');
      this.startSubLabelEl.textContent = i18n.t('menu.tapToCancel');
      const mapLabel = info?.mapName
        ? i18n.translateMapName(info.mapName)
        : i18n.translateMapName(this.selectedMapId);
      this.queueStatusTextEl.textContent = info?.message
        ? info.message
        : i18n.t('menu.queueStatsLine', {
            map: mapLabel,
            count: info?.queuedPlayers ?? 1,
            sec: info?.waitSec ?? 0,
          });
    } else {
      this.refreshSelectionCard();
    }
  }

  setStartingMatch(starting: boolean): void {
    this.isStartingMatch = starting;
    this.startBtn.disabled = starting;
    this.startBtn.setAttribute('aria-disabled', String(starting));
    this.startBtn.classList.toggle('opacity-70', starting);
    this.startBtn.classList.toggle('pointer-events-none', starting);
  }

  setMapSelectionConfirmed(_confirmed: boolean): void {
    this.refreshSelectionCard();
  }

  cycleTagline(): void {
    // Brand badge removed from top-left header.
  }

  setMuted(muted: boolean): void {
    this.muteIconEl.innerHTML = getAudioToggleSvg(muted);
  }

  setFps(fps: number): void {
    if (this.lastFps === fps) return;
    this.lastFps = fps;
    this.fpsEl.textContent = i18n.t('hud.fps', { fps });
  }

  setShowFps(show: boolean): void {
    this.fpsEl.style.display = show ? '' : 'none';
  }

  updateDeviceBadge(_profile: DeviceProfile, _metrics: ViewportMetrics): void {
    // Device layout adapts automatically via responsive flex/grid classes
  }

  showToast(text: string, tone: 'info' | 'success' | 'error' = 'info'): void {
    if (this.lobbyToastTimer) {
      clearTimeout(this.lobbyToastTimer);
      this.lobbyToastTimer = 0;
    }
    const toneClass =
      tone === 'error'
        ? 'border-rose-400/80 text-rose-100 bg-rose-950/90'
        : tone === 'success'
          ? 'border-emerald-400/80 text-emerald-100 bg-emerald-950/90'
          : 'border-sky-400/80 text-sky-100 bg-slate-950/90';
    this.lobbyToastEl.className = `absolute top-[112px] sm:top-[122px] left-1/2 -translate-x-1/2 z-40 pointer-events-none nexus-panel px-3.5 py-1.5 rounded-md border text-xs font-extrabold tracking-wide shadow-2xl max-w-[90vw] truncate ${toneClass}`;
    this.lobbyToastEl.textContent = text;
    this.lobbyToastEl.classList.remove('hidden');
    this.lobbyToastTimer = window.setTimeout(() => {
      this.lobbyToastTimer = 0;
      this.lobbyToastEl.classList.add('hidden');
    }, 3200);
  }

  private handleSquadSizeSelected(size: SquadSize): void {
    const inParty = Boolean(this.squadState.squadId);
    const selfMember = this.squadState.members.find((m) => m.isSelf);
    const isSelfLeader = selfMember ? selfMember.isLeader : true;
    if (inParty && !isSelfLeader && size !== 1) {
      this.showToast(i18n.t('toast.onlyLeaderCanStart'), 'error');
      return;
    }
    this.selectedSquadSize = size;
    this.callbacks.onSelectSquadSize(size);
    if (size === 2 || size === 4) {
      this.setFriendsPanelOpen(true);
    } else {
      this.setFriendsPanelOpen(false);
    }
    this.renderSquadControls();
    this.renderFriendsList();
  }

  setSquadSize(size: SquadSize): void {
    this.selectedSquadSize = size;
    this.renderSquadControls();
    this.renderFriendsList();
  }

  setSquadState(state: SquadStateSnapshot): void {
    this.squadState = state;
    this.selectedSquadSize = state.maxSize;
    this.renderSquadControls();
    this.renderFriendsList();
  }

  setCurrencyBalance(credits: number): void {
    const clean =
      typeof credits === 'number' && Number.isFinite(credits) && credits >= 0
        ? Math.floor(credits)
        : 0;
    this.currencyAmountEl.textContent = clean.toLocaleString();
  }

  setFriendsList(friends: SquadFriendEntry[]): void {
    this.friendsList = friends;
    if (
      this.confirmRemoveFriendId &&
      !friends.some((f) => f.playerId === this.confirmRemoveFriendId)
    ) {
      this.confirmRemoveFriendId = null;
    }
    this.renderFriendsTabs();
    this.syncDisplayedSearchResultRelation();
    this.renderFriendSearchResult();
    this.renderFriendsList();
  }

  setFriendRequests(
    requests: FriendRequestEntry[],
    outgoingTargetIds?: string[],
    outgoingRequests?: OutgoingFriendRequestEntry[],
  ): void {
    this.friendRequests = requests;
    if (outgoingRequests) {
      this.outgoingRequests = outgoingRequests;
    }
    if (outgoingTargetIds) {
      this.outgoingRequestTargetIds = new Set(outgoingTargetIds);
    } else if (outgoingRequests) {
      this.outgoingRequestTargetIds = new Set(outgoingRequests.map((r) => r.toPlayerId));
    }

    const pendingCount = requests.length;
    this.friendsReqBadgeEl.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
    this.friendsReqBadgeEl.classList.toggle('hidden', pendingCount === 0);

    this.renderFriendsTabs();
    this.syncDisplayedSearchResultRelation();
    this.renderFriendSearchResult();
    this.renderFriendRequests();
  }

  private setFriendsActiveTab(tab: 'friends' | 'requests'): void {
    this.friendsActiveTab = tab;
    this.confirmRemoveFriendId = null;
    this.renderFriendsTabs();
    this.renderFriendsList();
    this.renderFriendRequests();
  }

  private renderFriendsTabs(): void {
    const friendCount = this.friendsList.length;
    const reqBadgeCount = this.friendRequests.length + this.outgoingRequests.length;
    this.friendsTabFriendsBtn.textContent = `${i18n.t('friends.tabFriends')} (${friendCount})`;
    this.friendsTabRequestsBtn.textContent = `${i18n.t('friends.tabRequests')} (${reqBadgeCount})`;

    const activeCls =
      'py-1.5 px-2 rounded text-[10px] font-black tracking-wider uppercase border border-sky-400 bg-sky-500/25 text-white transition-colors';
    const inactiveCls =
      'py-1.5 px-2 rounded text-[10px] font-black tracking-wider uppercase border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500 transition-colors';
    this.friendsTabFriendsBtn.className = this.friendsActiveTab === 'friends' ? activeCls : inactiveCls;
    this.friendsTabRequestsBtn.className =
      this.friendsActiveTab === 'requests'
        ? activeCls
        : this.friendRequests.length > 0
          ? 'py-1.5 px-2 rounded text-[10px] font-black tracking-wider uppercase border border-amber-400/60 bg-amber-500/15 text-amber-200 hover:border-amber-300 transition-colors'
          : inactiveCls;
  }

  setFriendsPanelOpen(open: boolean): void {
    this.isFriendsPanelOpen = open;
    if (open && this.isMailboxOpen) {
      this.setMailboxOpen(false);
    }
    this.friendsPanelBodyEl.classList.toggle('hidden', !open);
    this.friendsToggleBtn.setAttribute('aria-expanded', String(open));
    this.friendsToggleBtn.classList.toggle('border-sky-400', open);
    this.friendsToggleBtn.classList.toggle('bg-sky-500/20', open);
    if (!open) {
      this.confirmRemoveFriendId = null;
    }
  }

  setMailboxState(snapshot: MailboxStateSnapshot): void {
    this.mailboxState = snapshot;
    const unread = Math.max(0, Math.floor(snapshot.unreadCount));
    this.mailUnreadBadgeEl.textContent = unread > 99 ? '99+' : String(unread);
    this.mailUnreadBadgeEl.classList.toggle('hidden', unread === 0);
    this.mailboxUnreadHeaderEl.textContent = String(unread);

    if (this.isMailboxOpen) {
      this.renderMailboxModal();
    }
  }

  setMailboxOpen(open: boolean): void {
    this.isMailboxOpen = open;
    if (open) {
      if (this.isFriendsPanelOpen) {
        this.setFriendsPanelOpen(false);
      }
      if (this.isInventoryOpen) {
        this.setInventoryOpen(false);
      }
      void this.callbacks.onOpenMailbox?.();
    }
    this.mailboxModalEl.classList.toggle('hidden', !open);
    this.mailOpenBtn.setAttribute('aria-expanded', String(open));
    this.mailOpenBtn.classList.toggle('border-amber-400', open);
    this.mailOpenBtn.classList.toggle('bg-amber-500/20', open);
    if (open) {
      this.renderMailboxModal();
    }
  }

  isMailboxModalOpen(): boolean {
    return this.isMailboxOpen;
  }

  setIncomingSquadInvite(invite: SquadInviteNotification | null): void {
    this.pendingIncomingInvite = invite;
    this.renderIncomingInviteBanner();
  }

  private renderIncomingInviteBanner(): void {
    const inv = this.pendingIncomingInvite;
    if (!inv) {
      this.incomingInviteBannerEl.classList.add('hidden');
      this.incomingInviteMetaEl.textContent = '';
      this.incomingInviteBodyEl.textContent = '';
      return;
    }
    this.incomingInviteBannerEl.classList.remove('hidden');
    this.incomingInviteAvatarEl.innerHTML = getAvatarSvg(
      inv.fromAvatarId || DEFAULT_AVATAR_ID,
      'w-full h-full',
    );
    const metaParts: string[] = [];
    if (inv.fromNumericId) metaParts.push(`ID ${inv.fromNumericId}`);
    if (inv.fromLevel) metaParts.push(`LV.${inv.fromLevel}`);
    this.incomingInviteMetaEl.textContent = metaParts.join(' · ');
    this.incomingInviteBodyEl.textContent = i18n.t('menu.squad.incomingBody', {
      name: inv.fromName,
      count: inv.memberCount,
      max: inv.maxSize,
    });
  }

  private renderSquadControls(): void {
    const activeCls =
      'nexus-btn-secondary py-1.5 px-1.5 rounded font-black text-[10px] tracking-wider uppercase text-center min-h-[32px] border-2 border-sky-400 bg-sky-500/20 text-white';
    const inactiveCls =
      'nexus-btn-secondary py-1.5 px-1.5 rounded font-black text-[10px] tracking-wider uppercase text-center min-h-[32px] border border-slate-700 text-slate-300 hover:border-slate-500';

    const inParty = Boolean(this.squadState.squadId);
    const selfMember = this.squadState.members.find((m) => m.isSelf);
    const isSelfLeader = selfMember ? selfMember.isLeader : true;

    for (const [sz, btn] of this.squadSizeBtns.entries()) {
      btn.className = sz === this.selectedSquadSize ? activeCls : inactiveCls;
      const lockedForNonLeader = inParty && !isSelfLeader && sz !== 1;
      btn.classList.toggle('opacity-55', lockedForNonLeader);
    }

    const memberCount = Math.max(1, this.squadState.members.length);
    const maxSize = Math.max(this.selectedSquadSize, this.squadState.maxSize);
    this.squadCountBadgeEl.textContent = i18n.t('menu.squad.count', {
      count: memberCount,
      max: maxSize,
    });
    this.friendsCountEl.textContent = `${memberCount}/${maxSize}`;

    this.squadCreateBtn.classList.toggle('hidden', inParty);
    this.squadLeaveBtn.classList.toggle('hidden', !inParty && memberCount <= 1);

    const membersListEl = this.squadMembersRowEl.querySelector<HTMLElement>('[data-role="squad-members-list"]');
    const showStrip = inParty || maxSize > 1 || memberCount > 1;
    this.squadMembersRowEl.classList.toggle('hidden', !showStrip);
    if (!showStrip || !membersListEl) {
      this.refreshSelectionCard();
      return;
    }

    const selfStatus = selfMember?.status ?? (selfMember?.ready ? 'ready' : 'not-ready');
    const isSelfInMatch = selfStatus === 'in-match';
    const isSelfReady = selfStatus === 'ready';
    this.squadReadyBtn.disabled = isSelfInMatch;
    if (isSelfInMatch) {
      this.squadReadyBtn.textContent = i18n.t('menu.squad.inMatch');
      this.squadReadyBtn.className =
        'w-full py-1 px-2 rounded border text-[10px] font-black tracking-wider uppercase bg-sky-500/20 border-sky-400/70 text-sky-200 opacity-75 cursor-not-allowed';
    } else if (isSelfReady) {
      this.squadReadyBtn.textContent = i18n.t('menu.squad.ready');
      this.squadReadyBtn.className =
        'w-full py-1 px-2 rounded border text-[10px] font-black tracking-wider uppercase transition-colors bg-emerald-500/25 border-emerald-400 text-emerald-100 hover:bg-emerald-500/40';
    } else {
      this.squadReadyBtn.textContent = i18n.t('menu.squad.notReady');
      this.squadReadyBtn.className =
        'w-full py-1 px-2 rounded border text-[10px] font-black tracking-wider uppercase transition-colors bg-amber-500/20 border-amber-400/80 text-amber-100 hover:bg-amber-500/35';
    }

    membersListEl.innerHTML = this.squadState.members
      .map((m) => {
        const safeName = escapeHtml(m.name);
        const safeMemberId = escapeHtml(m.playerId);
        const displayId = escapeHtml(m.numericId || m.playerId);
        const displayLevel = Math.max(1, Math.floor(m.level ?? 1));
        const memberStatus = m.status ?? (m.ready ? 'ready' : 'not-ready');
        const statusText =
          memberStatus === 'ready'
            ? i18n.t('menu.squad.ready')
            : memberStatus === 'in-match'
              ? i18n.t('menu.squad.inMatch')
              : i18n.t('menu.squad.notReady');
        const statusBadgeCls =
          memberStatus === 'ready'
            ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
            : memberStatus === 'in-match'
              ? 'bg-sky-500/20 border-sky-400/70 text-sky-200'
              : 'bg-amber-500/20 border-amber-400/70 text-amber-200';
        const canInspect = !m.isBotAlly && !m.isSelf;
        const leaderControls =
          isSelfLeader && !m.isSelf
            ? `
              <button
                type="button"
                data-transfer-leader="${safeMemberId}"
                title="${escapeHtml(i18n.t('menu.squad.makeLeader'))}"
                class="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/40 border border-amber-400/60 text-[8px] font-black uppercase text-amber-200 whitespace-nowrap leading-none"
              >&#9733;</button>
              <button
                type="button"
                data-kick-member="${safeMemberId}"
                title="${escapeHtml(i18n.t('menu.squad.kick'))}"
                class="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 border border-rose-400/60 text-[9px] font-black text-rose-200 leading-none"
              >&times;</button>
            `
            : '';
        const nameHtml = canInspect
          ? `<button type="button" data-inspect-member="${safeMemberId}" class="truncate text-[10.5px] font-extrabold text-white hover:text-sky-300 transition-colors text-left">${safeName}</button>`
          : `<span class="truncate text-[10.5px] font-extrabold text-white">${safeName}</span>`;
        return `
          <div class="nr-party-member-card px-1.5 py-1 rounded bg-slate-900/95 border ${m.isLeader ? 'border-amber-400/55' : 'border-slate-700/90'} flex items-center justify-between gap-1.5 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <div class="w-6 h-6 rounded-full overflow-hidden border border-sky-400/60 bg-slate-950 shrink-0">
                ${getAvatarSvg(m.avatarId || DEFAULT_AVATAR_ID, 'w-full h-full')}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1 min-w-0">
                  ${m.isLeader ? '<span class="text-amber-300 text-[10px] shrink-0" title="Leader">&#9733;</span>' : ''}
                  ${nameHtml}
                </div>
                <div class="text-[8.5px] font-bold text-slate-400 tabular-nums truncate">ID ${displayId} &middot; LV.${displayLevel}</div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <span class="px-1.5 py-0.5 rounded border text-[8px] font-black uppercase whitespace-nowrap ${statusBadgeCls}">${escapeHtml(statusText)}</span>
              ${leaderControls}
            </div>
          </div>
        `;
      })
      .join('');

    membersListEl.querySelectorAll<HTMLButtonElement>('[data-inspect-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.inspectMember;
        if (targetId) {
          this.callbacks.onInspectPlayer?.(targetId);
        }
      });
    });

    membersListEl.querySelectorAll<HTMLButtonElement>('[data-transfer-leader]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.transferLeader;
        if (targetId) {
          this.callbacks.onTransferSquadLeader(targetId);
        }
      });
    });

    membersListEl.querySelectorAll<HTMLButtonElement>('[data-kick-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.kickMember;
        if (targetId) {
          this.callbacks.onKickSquadMember(targetId);
        }
      });
    });

    this.refreshSelectionCard();
  }

  private renderFriendsList(): void {
    if (this.friendsActiveTab !== 'friends') {
      this.friendsListEl.classList.add('hidden');
      return;
    }
    this.friendsListEl.classList.remove('hidden');

    const memberIds = new Set(this.squadState.members.map((m) => m.playerId));
    const pendingSet = new Set(this.squadState.pendingInviteIds);
    const inParty = Boolean(this.squadState.squadId);
    const selfMember = this.squadState.members.find((m) => m.isSelf);
    const isSelfLeader = selfMember ? selfMember.isLeader : true;
    const maxSize = Math.max(this.selectedSquadSize, this.squadState.maxSize);
    const isFull = this.squadState.members.length >= maxSize && maxSize > 1;

    if (this.friendsList.length === 0) {
      this.friendsListEl.innerHTML = `
        <div class="px-2 py-5 text-center text-[11px] font-semibold text-slate-400">
          ${escapeHtml(i18n.t('menu.squad.noFriends'))}
        </div>
      `;
      return;
    }

    this.friendsListEl.innerHTML = this.friendsList
      .map((f) => {
        const inSquad = memberIds.has(f.playerId) || f.status === 'in-squad';
        const isInvited = Boolean(f.invited || pendingSet.has(f.playerId));
        const tierSpec = getRankTierSpec(f.rp);
        const safeName = escapeHtml(f.name);
        const safeId = escapeHtml(f.playerId);
        const safeNumeric = escapeHtml(f.numericId || f.playerId);
        const canInspect = !f.isBotAlly;
        const isConfirmingRemove = this.confirmRemoveFriendId === f.playerId;
        const isRemoving = this.removingFriendIds.has(f.playerId);
        const genderBadge =
          f.gender === 'male'
            ? `<span class="w-3 h-3 text-sky-400 shrink-0">${getGenderIconSvg('male')}</span>`
            : f.gender === 'female'
              ? `<span class="w-3 h-3 text-pink-400 shrink-0">${getGenderIconSvg('female')}</span>`
              : '';

        const dotClass =
          inSquad
            ? 'bg-sky-400'
            : f.status === 'online'
              ? 'bg-emerald-400'
              : f.status === 'in-match'
                ? 'bg-amber-400'
                : 'bg-slate-500';

        const statusLabel =
          inSquad
            ? i18n.t('menu.squad.statusInSquad')
            : f.status === 'in-match'
              ? i18n.t('menu.squad.statusInMatch')
              : f.status === 'offline'
                ? i18n.t('menu.squad.offlineBtn')
                : i18n.t('menu.squad.statusOnline');

        let inviteHtml = '';
        if (inSquad) {
          inviteHtml = `<span class="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-[8.5px] font-black uppercase text-sky-200 whitespace-nowrap">${escapeHtml(i18n.t('menu.squad.inSquadBtn'))}</span>`;
        } else if (isInvited) {
          inviteHtml = `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/60 text-[8.5px] font-black uppercase text-amber-200 whitespace-nowrap">${escapeHtml(i18n.t('menu.squad.invitedBtn'))}</span>`;
        } else if (f.status === 'in-match') {
          inviteHtml = `<span class="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-[8.5px] font-bold uppercase text-slate-400 whitespace-nowrap">${escapeHtml(i18n.t('menu.squad.inMatchBtn'))}</span>`;
        } else if (f.status === 'offline') {
          inviteHtml = `<span class="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-[8.5px] font-bold uppercase text-slate-500 whitespace-nowrap">${escapeHtml(i18n.t('menu.squad.offlineBtn'))}</span>`;
        } else if (inParty && !isSelfLeader) {
          inviteHtml = `<span class="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-[8.5px] font-bold uppercase text-slate-400 whitespace-nowrap">${escapeHtml(i18n.t('menu.squad.leaderOnlyInvite'))}</span>`;
        } else if (isFull) {
          inviteHtml = `<span class="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-[8.5px] font-bold uppercase text-slate-400 whitespace-nowrap">${escapeHtml(i18n.t('menu.squad.fullBadge'))}</span>`;
        } else {
          inviteHtml = `
            <button
              type="button"
              data-invite-friend="${safeId}"
              class="px-2 py-1 rounded bg-sky-500/25 hover:bg-sky-500/45 active:scale-95 border border-sky-400 text-[9px] font-black tracking-wider uppercase text-white whitespace-nowrap min-h-[26px] transition-colors"
            >${escapeHtml(i18n.t('menu.squad.inviteBtn'))}</button>
          `;
        }

        const removeHtml = f.isBotAlly
          ? ''
          : isConfirmingRemove
            ? `
              <button
                type="button"
                data-confirm-remove-friend="${safeId}"
                ${isRemoving ? 'disabled' : ''}
                class="px-1.5 py-0.5 rounded bg-rose-500/35 hover:bg-rose-500/55 border border-rose-400 text-[8.5px] font-black uppercase text-white whitespace-nowrap min-h-[26px] disabled:opacity-50"
              >${escapeHtml(i18n.t('friends.confirmRemoveBtn'))}</button>
              <button
                type="button"
                data-cancel-remove-friend="1"
                class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] font-black text-slate-200 min-h-[26px]"
              >&times;</button>
            `
            : `
              <button
                type="button"
                data-remove-friend="${safeId}"
                title="${escapeHtml(i18n.t('friends.removeBtn'))}"
                aria-label="${escapeHtml(i18n.t('friends.removeBtn'))}"
                class="w-6 h-6 rounded bg-slate-800/90 hover:bg-rose-500/25 border border-slate-700 hover:border-rose-400/70 text-[11px] font-black text-slate-400 hover:text-rose-200 flex items-center justify-center transition-colors shrink-0"
              >&times;</button>
            `;

        const avatarWrap = `
          <div class="relative w-8 h-8 shrink-0">
            <div class="w-8 h-8 rounded-full overflow-hidden border border-sky-400/60 bg-slate-950">
              ${getAvatarSvg(f.avatarId || DEFAULT_AVATAR_ID, 'w-full h-full')}
            </div>
            <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${dotClass} border-2 border-slate-950"></span>
          </div>
        `;

        const identityHtml = canInspect
          ? `
            <button
              type="button"
              data-inspect-friend="${safeId}"
              class="min-w-0 flex-1 flex items-center gap-2 text-left hover:opacity-95 group"
              title="${escapeHtml(i18n.t('menu.profile.view'))}"
            >
              ${avatarWrap}
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1 min-w-0">
                  <span class="text-[11px] font-extrabold text-white group-hover:text-sky-300 truncate transition-colors">${safeName}</span>
                  ${genderBadge}
                </div>
                <div class="text-[8.5px] font-bold text-slate-400 tabular-nums truncate">
                  ID ${safeNumeric} &middot; <span style="color:${tierSpec.colorHex};">${escapeHtml(i18n.translateRankTier(f.tier))}</span> &middot; ${escapeHtml(statusLabel)}
                </div>
              </div>
            </button>
          `
          : `
            <div class="min-w-0 flex-1 flex items-center gap-2">
              ${avatarWrap}
              <div class="min-w-0 flex-1">
                <div class="text-[11px] font-extrabold text-white truncate">${safeName}</div>
                <div class="text-[8.5px] font-bold text-slate-400 tabular-nums truncate">
                  <span style="color:${tierSpec.colorHex};">${escapeHtml(i18n.translateRankTier(f.tier))}</span> &middot; ${escapeHtml(statusLabel)}
                </div>
              </div>
            </div>
          `;

        return `
          <div class="px-2 py-1.5 rounded bg-slate-900/90 border border-slate-800/90 flex items-center justify-between gap-1.5">
            ${identityHtml}
            <div class="flex items-center gap-1 shrink-0">
              ${inviteHtml}
              ${removeHtml}
            </div>
          </div>
        `;
      })
      .join('');

    this.friendsListEl.querySelectorAll<HTMLButtonElement>('[data-inspect-friend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const friendId = btn.dataset.inspectFriend;
        if (friendId) {
          this.callbacks.onInspectPlayer?.(friendId);
        }
      });
    });

    this.friendsListEl.querySelectorAll<HTMLButtonElement>('[data-invite-friend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const friendId = btn.dataset.inviteFriend;
        if (friendId) {
          this.callbacks.onInviteFriend(friendId);
        }
      });
    });

    this.friendsListEl.querySelectorAll<HTMLButtonElement>('[data-remove-friend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const friendId = btn.dataset.removeFriend;
        if (friendId) {
          this.confirmRemoveFriendId = friendId;
          this.renderFriendsList();
        }
      });
    });

    this.friendsListEl.querySelectorAll<HTMLButtonElement>('[data-cancel-remove-friend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmRemoveFriendId = null;
        this.renderFriendsList();
      });
    });

    this.friendsListEl.querySelectorAll<HTMLButtonElement>('[data-confirm-remove-friend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const friendId = btn.dataset.confirmRemoveFriend;
        if (friendId) {
          void this.handleRemoveFriend(friendId);
        }
      });
    });
  }

  private async handleRemoveFriend(friendPlayerId: string): Promise<void> {
    if (this.removingFriendIds.has(friendPlayerId)) return;
    this.removingFriendIds.add(friendPlayerId);
    this.renderFriendsList();
    try {
      await this.callbacks.onRemoveFriend(friendPlayerId);
      this.confirmRemoveFriendId = null;
      this.showToast(i18n.t('friends.toast.friendRemoved'), 'info');
    } catch (err) {
      this.showToast(
        err instanceof Error ? err.message : i18n.t('friends.err.respondFailed'),
        'error',
      );
    } finally {
      this.removingFriendIds.delete(friendPlayerId);
      this.renderFriendsList();
    }
  }

  private async handleFriendSearchSubmit(): Promise<void> {
    const queryId = this.friendSearchInputEl.value.trim();
    if (!queryId || this.isSearchingFriend) return;
    this.isSearchingFriend = true;
    this.friendSearchError = '';
    this.friendSearchResult = null;
    this.friendSearchBtnEl.disabled = true;
    this.renderFriendSearchResult();
    try {
      const result = await this.callbacks.onLookupFriendById(queryId);
      this.friendSearchResult = result;
      this.syncDisplayedSearchResultRelation();
    } catch (err) {
      this.friendSearchError = err instanceof Error ? err.message : i18n.t('friends.err.notFound');
    } finally {
      this.isSearchingFriend = false;
      this.friendSearchBtnEl.disabled = false;
      this.renderFriendSearchResult();
    }
  }

  private async handleSendFriendRequest(targetPlayerId: string): Promise<void> {
    if (this.sendingFriendTargetId) return;
    this.sendingFriendTargetId = targetPlayerId;
    this.friendSearchError = '';
    this.renderFriendSearchResult();
    try {
      await this.callbacks.onSendFriendRequest(targetPlayerId);
      this.outgoingRequestTargetIds.add(targetPlayerId);
      this.syncDisplayedSearchResultRelation();
      this.showToast(i18n.t('friends.toast.requestSent'), 'success');
    } catch (err) {
      this.friendSearchError = err instanceof Error ? err.message : i18n.t('friends.err.sendFailed');
    } finally {
      this.sendingFriendTargetId = null;
      this.renderFriendSearchResult();
    }
  }

  private async handleRespondFriendRequest(requestId: string, accept: boolean): Promise<void> {
    if (this.respondingRequestIds.has(requestId)) return;
    this.respondingRequestIds.add(requestId);
    this.renderFriendRequests();
    this.renderFriendSearchResult();
    try {
      await this.callbacks.onRespondFriendRequest(requestId, accept);
    } catch (err) {
      this.friendSearchError = err instanceof Error ? err.message : i18n.t('friends.err.respondFailed');
      this.renderFriendSearchResult();
    } finally {
      this.respondingRequestIds.delete(requestId);
      this.renderFriendRequests();
      this.renderFriendSearchResult();
    }
  }

  private async handleCancelFriendRequest(requestId: string): Promise<void> {
    if (this.cancellingRequestIds.has(requestId)) return;
    this.cancellingRequestIds.add(requestId);
    this.renderFriendRequests();
    this.renderFriendSearchResult();
    try {
      await this.callbacks.onCancelFriendRequest(requestId);
      this.showToast(i18n.t('friends.toast.requestCancelled'), 'info');
    } catch (err) {
      this.showToast(
        err instanceof Error ? err.message : i18n.t('friends.err.respondFailed'),
        'error',
      );
    } finally {
      this.cancellingRequestIds.delete(requestId);
      this.renderFriendRequests();
      this.renderFriendSearchResult();
    }
  }

  private syncDisplayedSearchResultRelation(): void {
    const cur = this.friendSearchResult;
    if (!cur || cur.relationStatus === 'self') return;
    const pid = cur.player.playerId;
    if (this.friendsList.some((f) => f.playerId === pid)) {
      this.friendSearchResult = { ...cur, relationStatus: 'friends', pendingRequestId: undefined };
      return;
    }
    const incoming = this.friendRequests.find((r) => r.fromPlayerId === pid);
    if (incoming) {
      this.friendSearchResult = {
        ...cur,
        relationStatus: 'incoming_pending',
        pendingRequestId: incoming.requestId,
      };
      return;
    }
    const outgoing = this.outgoingRequests.find((r) => r.toPlayerId === pid);
    if (outgoing || this.outgoingRequestTargetIds.has(pid)) {
      this.friendSearchResult = {
        ...cur,
        relationStatus: 'outgoing_pending',
        pendingRequestId: outgoing?.requestId ?? cur.pendingRequestId,
      };
    } else if (
      cur.relationStatus === 'incoming_pending' ||
      cur.relationStatus === 'outgoing_pending' ||
      cur.relationStatus === 'friends'
    ) {
      this.friendSearchResult = { ...cur, relationStatus: 'none', pendingRequestId: undefined };
    }
  }

  private renderFriendSearchResult(): void {
    if (this.isSearchingFriend) {
      this.friendSearchResultEl.classList.remove('hidden');
      this.friendSearchResultEl.innerHTML = `
        <div class="px-1.5 py-1 text-[10px] font-bold text-sky-300">${escapeHtml(i18n.t('friends.searching'))}</div>
      `;
      return;
    }

    if (this.friendSearchError && !this.friendSearchResult) {
      this.friendSearchResultEl.classList.remove('hidden');
      this.friendSearchResultEl.innerHTML = `
        <div class="px-1.5 py-1 flex items-center justify-between gap-1.5 text-[10px] font-bold text-rose-300">
          <span class="truncate">${escapeHtml(this.friendSearchError)}</span>
          <button type="button" data-action="clear-friend-search" class="text-slate-400 hover:text-white font-black leading-none px-1">&times;</button>
        </div>
      `;
      this.friendSearchResultEl
        .querySelector('[data-action="clear-friend-search"]')
        ?.addEventListener('click', () => {
          this.friendSearchError = '';
          this.renderFriendSearchResult();
        });
      return;
    }

    const res = this.friendSearchResult;
    if (!res) {
      this.friendSearchResultEl.classList.add('hidden');
      this.friendSearchResultEl.innerHTML = '';
      return;
    }

    const p = res.player;
    const safeName = escapeHtml(p.name);
    const safeNumeric = escapeHtml(p.numericId);
    const genderBadge =
      p.gender === 'male'
        ? `<span class="w-3 h-3 text-sky-400 shrink-0">${getGenderIconSvg('male')}</span>`
        : p.gender === 'female'
          ? `<span class="w-3 h-3 text-pink-400 shrink-0">${getGenderIconSvg('female')}</span>`
          : '';

    let actionHtml = '';
    if (res.relationStatus === 'self') {
      actionHtml = `<span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-bold uppercase text-slate-400 whitespace-nowrap shrink-0">${escapeHtml(i18n.t('friends.selfNote'))}</span>`;
    } else if (res.relationStatus === 'friends') {
      actionHtml = `<span class="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/60 text-[9px] font-black uppercase text-emerald-200 whitespace-nowrap shrink-0">${escapeHtml(i18n.t('friends.friendBadge'))}</span>`;
    } else if (res.relationStatus === 'outgoing_pending') {
      if (res.pendingRequestId) {
        const busy = this.cancellingRequestIds.has(res.pendingRequestId);
        actionHtml = `<button type="button" data-action="cancel-search-request" data-req-id="${escapeHtml(res.pendingRequestId)}" ${busy ? 'disabled' : ''} class="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/70 text-[9px] font-black uppercase text-rose-100 whitespace-nowrap shrink-0 disabled:opacity-50">${escapeHtml(i18n.t('friends.cancelBtn'))}</button>`;
      } else {
        actionHtml = `<span class="px-2 py-1 rounded bg-amber-500/20 border border-amber-400/60 text-[9px] font-black uppercase text-amber-200 whitespace-nowrap shrink-0">${escapeHtml(i18n.t('friends.sentBadge'))}</span>`;
      }
    } else if (res.relationStatus === 'incoming_pending' && res.pendingRequestId) {
      const busy = this.respondingRequestIds.has(res.pendingRequestId);
      actionHtml = `<button type="button" data-action="accept-search-request" data-req-id="${escapeHtml(res.pendingRequestId)}" ${busy ? 'disabled' : ''} class="px-2 py-1 rounded bg-emerald-500/25 hover:bg-emerald-500/45 border border-emerald-400 text-[9px] font-black uppercase text-emerald-100 whitespace-nowrap shrink-0 disabled:opacity-50">${escapeHtml(i18n.t('friends.acceptBtn'))}</button>`;
    } else {
      const busy = this.sendingFriendTargetId === p.playerId;
      actionHtml = `<button type="button" data-action="send-friend-request" data-target-id="${escapeHtml(p.playerId)}" ${busy ? 'disabled' : ''} class="px-2 py-1 rounded bg-sky-500/30 hover:bg-sky-500/50 border border-sky-400 text-[9px] font-black uppercase text-white whitespace-nowrap shrink-0 disabled:opacity-50">${escapeHtml(i18n.t('friends.addBtn'))}</button>`;
    }

    const inlineErr = this.friendSearchError
      ? `<div class="mt-1 text-[9px] font-bold text-rose-300 truncate">${escapeHtml(this.friendSearchError)}</div>`
      : '';

    this.friendSearchResultEl.classList.remove('hidden');
    this.friendSearchResultEl.innerHTML = `
      <div class="px-1.5 py-1 rounded bg-slate-900/95 border border-sky-400/40 flex items-center justify-between gap-1.5">
        <div class="w-7 h-7 rounded-full overflow-hidden border border-sky-400/60 bg-slate-950 shrink-0">
          ${getAvatarSvg(p.avatarId || DEFAULT_AVATAR_ID, 'w-full h-full')}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1 min-w-0">
            <span class="text-[11px] font-extrabold text-white truncate">${safeName}</span>
            ${genderBadge}
          </div>
          <div class="text-[9px] font-bold text-slate-400 tabular-nums truncate">ID ${safeNumeric}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${actionHtml}
          <button type="button" data-action="clear-friend-search" class="text-slate-400 hover:text-white font-black leading-none px-1">&times;</button>
        </div>
      </div>
      ${inlineErr}
    `;

    this.friendSearchResultEl
      .querySelector('[data-action="clear-friend-search"]')
      ?.addEventListener('click', () => {
        this.friendSearchResult = null;
        this.friendSearchError = '';
        this.renderFriendSearchResult();
      });

    this.friendSearchResultEl
      .querySelector<HTMLButtonElement>('[data-action="send-friend-request"]')
      ?.addEventListener('click', (e) => {
        const targetId = (e.currentTarget as HTMLButtonElement).dataset.targetId;
        if (targetId) {
          void this.handleSendFriendRequest(targetId);
        }
      });

    this.friendSearchResultEl
      .querySelector<HTMLButtonElement>('[data-action="cancel-search-request"]')
      ?.addEventListener('click', (e) => {
        const reqId = (e.currentTarget as HTMLButtonElement).dataset.reqId;
        if (reqId) {
          void this.handleCancelFriendRequest(reqId);
        }
      });

    this.friendSearchResultEl
      .querySelector<HTMLButtonElement>('[data-action="accept-search-request"]')
      ?.addEventListener('click', (e) => {
        const reqId = (e.currentTarget as HTMLButtonElement).dataset.reqId;
        if (reqId) {
          void this.handleRespondFriendRequest(reqId, true);
        }
      });
  }

  private renderFriendRequests(): void {
    if (this.friendsActiveTab !== 'requests') {
      this.friendRequestsSectionEl.classList.add('hidden');
      this.friendRequestsSectionEl.innerHTML = '';
      return;
    }

    this.friendRequestsSectionEl.classList.remove('hidden');

    if (this.friendRequests.length === 0 && this.outgoingRequests.length === 0) {
      this.friendRequestsSectionEl.innerHTML = `
        <div class="px-2 py-5 text-center text-[11px] font-semibold text-slate-400">
          ${escapeHtml(i18n.t('friends.noRequests'))}
        </div>
      `;
      return;
    }

    const incomingHtml =
      this.friendRequests.length > 0
        ? `
        <div>
          <div class="px-1 pb-1 text-[9px] font-black tracking-[0.12em] uppercase text-amber-300">
            ${escapeHtml(i18n.t('friends.requestsTitle', { count: this.friendRequests.length }))}
          </div>
          <div class="flex flex-col gap-1">
            ${this.friendRequests
              .map((req) => {
                const safeReqId = escapeHtml(req.requestId);
                const safeName = escapeHtml(req.fromName);
                const safeNumeric = escapeHtml(req.fromNumericId);
                const busy = this.respondingRequestIds.has(req.requestId);
                const genderBadge =
                  req.fromGender === 'male'
                    ? `<span class="w-2.5 h-2.5 text-sky-400 shrink-0">${getGenderIconSvg('male')}</span>`
                    : req.fromGender === 'female'
                      ? `<span class="w-2.5 h-2.5 text-pink-400 shrink-0">${getGenderIconSvg('female')}</span>`
                      : '';
                return `
                  <div class="px-1.5 py-1.5 rounded bg-slate-900/90 border border-amber-400/35 flex items-center justify-between gap-1.5">
                    <div class="w-7 h-7 rounded-full overflow-hidden border border-amber-400/60 bg-slate-950 shrink-0">
                      ${getAvatarSvg(req.fromAvatarId || DEFAULT_AVATAR_ID, 'w-full h-full')}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1 min-w-0">
                        <span class="text-[10.5px] font-extrabold text-white truncate">${safeName}</span>
                        ${genderBadge}
                      </div>
                      <div class="text-[8.5px] font-bold text-slate-400 tabular-nums truncate">ID ${safeNumeric}</div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-friend-req-accept="${safeReqId}"
                        ${busy ? 'disabled' : ''}
                        class="px-2 py-1 rounded bg-emerald-500/25 hover:bg-emerald-500/45 border border-emerald-400 text-[8.5px] font-black uppercase text-emerald-100 whitespace-nowrap min-h-[26px] disabled:opacity-50"
                      >${escapeHtml(i18n.t('friends.acceptBtn'))}</button>
                      <button
                        type="button"
                        data-friend-req-reject="${safeReqId}"
                        ${busy ? 'disabled' : ''}
                        class="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/70 text-[8.5px] font-black uppercase text-rose-100 whitespace-nowrap min-h-[26px] disabled:opacity-50"
                      >${escapeHtml(i18n.t('friends.rejectBtn'))}</button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `
        : '';

    const outgoingHtml =
      this.outgoingRequests.length > 0
        ? `
        <div>
          <div class="px-1 pb-1 text-[9px] font-black tracking-[0.12em] uppercase text-sky-300">
            ${escapeHtml(i18n.t('friends.outgoingTitle', { count: this.outgoingRequests.length }))}
          </div>
          <div class="flex flex-col gap-1">
            ${this.outgoingRequests
              .map((req) => {
                const safeReqId = escapeHtml(req.requestId);
                const safeName = escapeHtml(req.toName);
                const safeNumeric = escapeHtml(req.toNumericId);
                const busy = this.cancellingRequestIds.has(req.requestId);
                return `
                  <div class="px-1.5 py-1.5 rounded bg-slate-900/85 border border-slate-700/80 flex items-center justify-between gap-1.5">
                    <div class="w-7 h-7 rounded-full overflow-hidden border border-sky-400/50 bg-slate-950 shrink-0">
                      ${getAvatarSvg(req.toAvatarId || DEFAULT_AVATAR_ID, 'w-full h-full')}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-[10.5px] font-extrabold text-white truncate">${safeName}</div>
                      <div class="text-[8.5px] font-bold text-slate-400 tabular-nums truncate">
                        ID ${safeNumeric} &middot; ${escapeHtml(i18n.t('friends.pendingStatus'))}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-friend-req-cancel="${safeReqId}"
                      ${busy ? 'disabled' : ''}
                      class="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/70 text-[8.5px] font-black uppercase text-rose-100 whitespace-nowrap min-h-[26px] shrink-0 disabled:opacity-50"
                    >${escapeHtml(i18n.t('friends.cancelBtn'))}</button>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `
        : '';

    this.friendRequestsSectionEl.innerHTML = `${incomingHtml}${outgoingHtml}`;

    this.friendRequestsSectionEl
      .querySelectorAll<HTMLButtonElement>('[data-friend-req-accept]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const reqId = btn.dataset.friendReqAccept;
          if (reqId) {
            void this.handleRespondFriendRequest(reqId, true);
          }
        });
      });

    this.friendRequestsSectionEl
      .querySelectorAll<HTMLButtonElement>('[data-friend-req-reject]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const reqId = btn.dataset.friendReqReject;
          if (reqId) {
            void this.handleRespondFriendRequest(reqId, false);
          }
        });
      });

    this.friendRequestsSectionEl
      .querySelectorAll<HTMLButtonElement>('[data-friend-req-cancel]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const reqId = btn.dataset.friendReqCancel;
          if (reqId) {
            void this.handleCancelFriendRequest(reqId);
          }
        });
      });
  }

  private getMailboxCategoryBadge(category: MailboxCategory): { label: string; cls: string } {
    switch (category) {
      case 'developer':
        return {
          label: i18n.t('mail.cat.developer'),
          cls: 'bg-purple-500/20 border-purple-400/70 text-purple-200',
        };
      case 'reward':
        return {
          label: i18n.t('mail.cat.reward'),
          cls: 'bg-amber-500/25 border-amber-400 text-amber-200',
        };
      case 'notification':
        return {
          label: i18n.t('mail.cat.notification'),
          cls: 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200',
        };
      default:
        return {
          label: i18n.t('mail.cat.announcement'),
          cls: 'bg-sky-500/20 border-sky-400/70 text-sky-200',
        };
    }
  }

  private formatMailDate(ms: number): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms));
    } catch {
      return new Date(ms).toLocaleDateString();
    }
  }

  private renderMailboxModal(): void {
    const activeTabCls =
      'px-3 py-1.5 rounded text-[10.5px] font-black tracking-wider uppercase border border-amber-400 bg-amber-500/20 text-amber-100 transition-colors';
    const inactiveTabCls =
      'px-3 py-1.5 rounded text-[10.5px] font-black tracking-wider uppercase border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500 transition-colors';

    const inboxItems = this.mailboxState.messages.filter((m) => !m.isArchived);
    const archivedItems = this.mailboxState.messages.filter((m) => m.isArchived);
    this.mailboxTabInboxBtn.textContent = `${i18n.t('mail.tabInbox')} (${inboxItems.length})`;
    this.mailboxTabArchivedBtn.textContent = `${i18n.t('mail.tabArchived')} (${archivedItems.length})`;
    this.mailboxTabInboxBtn.className = this.mailboxActiveTab === 'inbox' ? activeTabCls : inactiveTabCls;
    this.mailboxTabArchivedBtn.className =
      this.mailboxActiveTab === 'archived' ? activeTabCls : inactiveTabCls;

    const visibleMessages = this.mailboxActiveTab === 'inbox' ? inboxItems : archivedItems;
    if (visibleMessages.length === 0) {
      this.selectedMailId = null;
      this.mailboxListEl.innerHTML = `
        <div class="px-3 py-8 text-center text-xs font-semibold text-slate-400">
          ${escapeHtml(this.mailboxActiveTab === 'inbox' ? i18n.t('mail.emptyInbox') : i18n.t('mail.emptyArchived'))}
        </div>
      `;
      this.mailboxReaderEl.innerHTML = `
        <div class="flex-1 flex items-center justify-center text-xs font-semibold text-slate-500">
          ${escapeHtml(i18n.t('mail.selectPrompt'))}
        </div>
      `;
      return;
    }

    let selectedMsg: MailboxMessageView | undefined = visibleMessages.find(
      (m) => m.mailId === this.selectedMailId,
    );
    if (!selectedMsg) {
      selectedMsg = visibleMessages[0];
      this.selectedMailId = selectedMsg.mailId;
      if (!selectedMsg.isRead) {
        void this.callbacks.onReadMail(selectedMsg.mailId).catch(() => {});
      }
    }

    this.mailboxListEl.innerHTML = visibleMessages
      .map((m) => {
        const isSelected = m.mailId === selectedMsg?.mailId;
        const cat = this.getMailboxCategoryBadge(m.category);
        const rewardChip =
          m.rewardCredits > 0 && !m.isClaimed
            ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/80 text-[8.5px] font-black text-amber-200 tabular-nums shrink-0">+${m.rewardCredits.toLocaleString()}</span>`
            : '';
        return `
          <button
            type="button"
            data-select-mail="${escapeHtml(m.mailId)}"
            class="w-full text-left px-2.5 py-2 rounded border transition-colors flex flex-col gap-1 ${
              isSelected
                ? 'bg-sky-500/20 border-sky-400 shadow-sm'
                : m.isRead
                  ? 'bg-slate-900/65 border-slate-800 hover:border-slate-600'
                  : 'bg-slate-900/95 border-amber-400/50 hover:border-amber-300'
            }"
          >
            <div class="flex items-center justify-between gap-1.5">
              <div class="flex items-center gap-1.5 min-w-0">
                ${
                  !m.isRead
                    ? '<span class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>'
                    : '<span class="w-2 h-2 rounded-full bg-slate-700 shrink-0"></span>'
                }
                <span class="px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider whitespace-nowrap ${cat.cls}">${escapeHtml(cat.label)}</span>
                ${rewardChip}
              </div>
              <span class="text-[9px] font-bold text-slate-400 tabular-nums shrink-0">${escapeHtml(this.formatMailDate(m.createdAt))}</span>
            </div>
            <div class="text-xs font-extrabold ${m.isRead ? 'text-slate-200' : 'text-white'} truncate">${escapeHtml(m.title)}</div>
            <div class="text-[10px] font-semibold text-slate-400 truncate">${escapeHtml(m.sender)}</div>
          </button>
        `;
      })
      .join('');

    this.mailboxListEl.querySelectorAll<HTMLButtonElement>('[data-select-mail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mailId = btn.dataset.selectMail;
        if (!mailId) return;
        this.selectedMailId = mailId;
        const target = this.mailboxState.messages.find((m) => m.mailId === mailId);
        if (target && !target.isRead) {
          target.isRead = true;
          void this.callbacks.onReadMail(mailId).catch(() => {});
        }
        this.renderMailboxModal();
      });
    });

    const cat = this.getMailboxCategoryBadge(selectedMsg.category);
    const hasReward = selectedMsg.rewardCredits > 0;
    const isClaiming = this.claimingMailIds.has(selectedMsg.mailId);
    const isMutating = this.mutatingMailIds.has(selectedMsg.mailId);
    const hasUnclaimedReward = hasReward && !selectedMsg.isClaimed;

    const rewardSectionHtml = hasReward
      ? selectedMsg.isClaimed
        ? `
          <div class="p-3 rounded-md bg-emerald-500/10 border border-emerald-400/50 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-emerald-200 text-xs font-black uppercase tracking-wider">
              <span class="w-5 h-5 shrink-0">${getCurrencyCoinSvg()}</span>
              <span>${escapeHtml(i18n.t('mail.claimedBadge', { amount: selectedMsg.rewardCredits.toLocaleString() }))}</span>
            </div>
            <span class="text-emerald-300 font-black text-xs">&#10003;</span>
          </div>
        `
        : `
          <div class="p-3 rounded-md bg-amber-500/10 border border-amber-400/60 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 shrink-0">${getCurrencyCoinSvg()}</span>
              <span class="text-xs font-black tracking-wide text-amber-200 tabular-nums">+${selectedMsg.rewardCredits.toLocaleString()} NEXUS CREDITS</span>
            </div>
            <button
              type="button"
              data-action="claim-mail-reward"
              data-mail-id="${escapeHtml(selectedMsg.mailId)}"
              ${isClaiming ? 'disabled' : ''}
              class="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-black tracking-wider uppercase shadow-lg transition-colors disabled:opacity-50"
            >${escapeHtml(isClaiming ? i18n.t('mail.claimingBtn') : i18n.t('mail.claimBtn', { amount: selectedMsg.rewardCredits.toLocaleString() }))}</button>
          </div>
        `
      : '';

    this.mailboxReaderEl.innerHTML = `
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="px-2 py-0.5 rounded border text-[9.5px] font-black uppercase tracking-wider ${cat.cls}">${escapeHtml(cat.label)}</span>
          <span class="text-[11px] font-bold text-slate-400 tabular-nums">${escapeHtml(this.formatMailDate(selectedMsg.createdAt))}</span>
        </div>
        <div>
          <h3 class="text-base font-black tracking-wide text-white">${escapeHtml(selectedMsg.title)}</h3>
          <div class="text-[11px] font-bold text-sky-300 mt-0.5">${escapeHtml(i18n.t('mail.senderLabel'))}: ${escapeHtml(selectedMsg.sender)}</div>
        </div>
        <div class="p-3.5 rounded-md bg-slate-950/75 border border-slate-800 text-xs sm:text-[13px] leading-relaxed text-slate-200 whitespace-pre-line">
          ${escapeHtml(selectedMsg.content)}
        </div>
        ${rewardSectionHtml}
      </div>
      <div class="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <span class="text-[10px] font-semibold text-amber-300/90">
          ${hasUnclaimedReward ? escapeHtml(i18n.t('mail.deleteDisabledHint')) : ''}
        </span>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-action="archive-mail"
            data-mail-id="${escapeHtml(selectedMsg.mailId)}"
            data-next-archived="${String(!selectedMsg.isArchived)}"
            ${isMutating ? 'disabled' : ''}
            class="nexus-btn-secondary px-3 py-1.5 rounded text-[10.5px] font-black tracking-wider uppercase min-h-[34px] disabled:opacity-50"
          >${escapeHtml(selectedMsg.isArchived ? i18n.t('mail.unarchiveBtn') : i18n.t('mail.archiveBtn'))}</button>
          <button
            type="button"
            data-action="delete-mail"
            data-mail-id="${escapeHtml(selectedMsg.mailId)}"
            ${isMutating || hasUnclaimedReward ? 'disabled' : ''}
            class="px-3 py-1.5 rounded border border-rose-400/70 bg-rose-500/20 hover:bg-rose-500/35 text-rose-100 text-[10.5px] font-black tracking-wider uppercase min-h-[34px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >${escapeHtml(i18n.t('mail.deleteBtn'))}</button>
        </div>
      </div>
    `;

    this.mailboxReaderEl
      .querySelector<HTMLButtonElement>('[data-action="claim-mail-reward"]')
      ?.addEventListener('click', (e) => {
        const mailId = (e.currentTarget as HTMLButtonElement).dataset.mailId;
        if (mailId) {
          void this.handleClaimMailReward(mailId);
        }
      });

    this.mailboxReaderEl
      .querySelector<HTMLButtonElement>('[data-action="archive-mail"]')
      ?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const mailId = btn.dataset.mailId;
        const nextArchived = btn.dataset.nextArchived === 'true';
        if (mailId) {
          void this.handleArchiveMail(mailId, nextArchived);
        }
      });

    this.mailboxReaderEl
      .querySelector<HTMLButtonElement>('[data-action="delete-mail"]')
      ?.addEventListener('click', (e) => {
        const mailId = (e.currentTarget as HTMLButtonElement).dataset.mailId;
        if (mailId) {
          void this.handleDeleteMail(mailId);
        }
      });
  }

  private async handleClaimMailReward(mailId: string): Promise<void> {
    if (this.claimingMailIds.has(mailId)) return;
    this.claimingMailIds.add(mailId);
    this.renderMailboxModal();
    try {
      await this.callbacks.onClaimMailReward(mailId);
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Claim failed', 'error');
    } finally {
      this.claimingMailIds.delete(mailId);
      if (this.isMailboxOpen) {
        this.renderMailboxModal();
      }
    }
  }

  private async handleArchiveMail(mailId: string, archived: boolean): Promise<void> {
    if (this.mutatingMailIds.has(mailId)) return;
    this.mutatingMailIds.add(mailId);
    this.renderMailboxModal();
    try {
      await this.callbacks.onArchiveMail(mailId, archived);
      this.showToast(
        i18n.t(archived ? 'mail.toast.archived' : 'mail.toast.unarchived'),
        'info',
      );
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      this.mutatingMailIds.delete(mailId);
      if (this.isMailboxOpen) {
        this.renderMailboxModal();
      }
    }
  }

  private async handleDeleteMail(mailId: string): Promise<void> {
    if (this.mutatingMailIds.has(mailId)) return;
    this.mutatingMailIds.add(mailId);
    this.renderMailboxModal();
    try {
      await this.callbacks.onDeleteMail(mailId);
      if (this.selectedMailId === mailId) {
        this.selectedMailId = null;
      }
      this.showToast(i18n.t('mail.toast.deleted'), 'info');
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      this.mutatingMailIds.delete(mailId);
      if (this.isMailboxOpen) {
        this.renderMailboxModal();
      }
    }
  }

  dispose(): void {
    if (this.lobbyToastTimer) {
      clearTimeout(this.lobbyToastTimer);
      this.lobbyToastTimer = 0;
    }
    this.i18nUnsubscribe?.();
    this.i18nUnsubscribe = null;
    this.cancelAvatarRequest?.();
    this.cancelAvatarRequest = null;
    this.clearPetSnapshotCancels();
  }
}
