import type {
  AppLanguage,
  DeviceProfile,
  GameSettings,
  GlooWallPlacementMode,
  QualityPreset,
  ViewportMetrics,
} from '../../core/Types';
import { i18n } from '../../i18n/I18nManager';
import type { ControlSettings, GameAction, HudStatusSlotId } from '../../input/ControlSettings';
import { TouchInputManager } from '../../input/TouchInputManager';
import type { AirplaneDropSnapshot } from '../../drop/IAirplaneDropSystem';
import type {
  InventorySnapshot,
  WeaponReplacementPrompt,
} from '../../inventory/IInventorySystem';
import type { AmmoType, LootItemDefinition } from '../../loot/ILootSystem';
import { getLootDefinition, RARITY_COLORS } from '../../loot/LootData';
import type { PickupPromptSnapshot } from '../../loot/PickupSystem';
import type { MinimapSnapshot, WorldInteractPrompt } from '../../maps/MapManager';
import type { PlayerStateSnapshot } from '../../player/IPlayerController';
import { clamp } from '../../utils/MathUtils';
import type { WeaponHudSnapshot } from '../../weapons/WeaponManager';
import { WEAPON_BY_ID, type WeaponSlotIndex } from '../../weapons/WeaponData';
import {
  getRankTierSpec,
  type KillFeedEntry,
  type RankedMatchResultPayload,
  type ServerZoneState,
} from '../../ranked/RankedTypes';
import type {
  BattleRoyaleEliminationPayload,
  BattleRoyaleResultPayload,
} from '../../battleroyale/BattleRoyaleTypes';
import { AirdropOverlay } from '../AirdropOverlay';
import { HudSlotWidget, type HudStatusRenderState } from '../HudSlotWidget';
import {
  getAlivePersonSvg,
  getArmorSvg,
  getAudioToggleSvg,
  getBackpackSvg,
  getClockTimerSvg,
  getEditHudSvg,
  getElimSkullSvg,
  getEmoteWheelTriggerSvg,
  getEmptyWeaponSlotSvg,
  getGlooWallSvg,
  getHelmetSvg,
  getHudActionSvg,
  getLootItemSvg,
  getMapGlobeSvg,
  getPunchSvg,
  getSettingsCogSvg,
  getWeaponSvg,
  getZoneWarningTriangleSvg,
} from '../icons/GameIcons';
import { InventoryUI, type InventoryUICallbacks } from '../InventoryUI';
import { Minimap } from '../Minimap';
import { ScopeOverlay, type ScopeOverlayState } from '../ScopeOverlay';
import { DEFAULT_AVATAR_ID, getAvatarById } from '../../shop/AvatarBannerCatalog';
import { getAvatarSvg } from '../icons/AvatarBannerSvg';

export interface TestArenaHudCallbacks {
  onExitToMenu: () => void;
  onToggleCameraMode: () => void;
  onCycleMap: () => void;
  onNewMatch: () => void;
  onOpenLayoutEditor: () => void;
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
  onSelectLanguage?: (language: AppLanguage) => void;
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
  onRankedReturnToLobby?: () => void;
  onBattleRoyalePlayAgain?: () => void;
  onBattleRoyaleExitMenu?: () => void;
  onZoneWarningPing?: () => void;
  onOpenEmoteWheel?: () => void;
}

export interface SquadmateHudStatus {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  isAlive: boolean;
}

const COMPASS_PX_PER_DEG = 1.85;

type CardinalDir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const CARDINAL_DIRS: Record<number, { dir: CardinalDir; highlight?: boolean }> = {
  0: { dir: 'N', highlight: true },
  45: { dir: 'NE' },
  90: { dir: 'E' },
  135: { dir: 'SE' },
  180: { dir: 'S' },
  225: { dir: 'SW' },
  270: { dir: 'W' },
  315: { dir: 'NW' },
};

function buildCompassTicksHtml(): string {
  const parts: string[] = [];
  for (let deg = -120; deg <= 480; deg += 15) {
    const norm = ((deg % 360) + 360) % 360;
    const cardinal = CARDINAL_DIRS[norm];
    const xPx = (deg * COMPASS_PX_PER_DEG).toFixed(2);
    const label = cardinal ? i18n.translateCardinal(cardinal.dir) : String(norm);
    const isMajor = Boolean(cardinal);
    const labelClass = cardinal?.highlight
      ? 'text-[11px] font-black text-amber-300'
      : isMajor
        ? 'text-[11px] font-black text-white'
        : 'text-[9px] font-bold text-slate-200/85 tabular-nums';
    const tickH = isMajor ? 'h-1.5 bg-white/85' : 'h-1 bg-white/45';
    parts.push(
      `<div class="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none" style="left:${xPx}px">
         <span class="w-[1px] ${tickH}"></span>
         <span class="${labelClass} leading-none mt-0.5 tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">${label}</span>
       </div>`,
    );
  }
  return parts.join('');
}

export class TestArenaHud {
  readonly element: HTMLElement;
  readonly touchInputManager: TouchInputManager;

  // Top-left elements
  private readonly fpsEl: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly editHudBtn: HTMLButtonElement;
  private readonly fullMapBtn: HTMLButtonElement;
  private readonly emoteWheelBtn: HTMLButtonElement;
  private readonly killFeedEl: HTMLElement;
  private readonly squadHudListEl: HTMLElement;

  // Top-center compass & banners
  private readonly compassTrackEl: HTMLElement;
  private readonly compassTicksEl: HTMLElement;
  private readonly compassDegEl: HTMLElement;
  private readonly compassSafePipEl: HTMLElement;
  private readonly zoneWarningEl: HTMLElement;
  private readonly dangerVignetteEl: HTMLElement;
  private readonly waitingBannerEl: HTMLElement;
  private readonly waitingTitleEl: HTMLElement;
  private readonly waitingBoardingLabelEl: HTMLElement;
  private readonly waitingCountdownEl: HTMLElement;
  private readonly waitingMetaEl: HTMLElement;
  private readonly waitingBarEl: HTMLElement;

  // Top-right match status & weapon panel
  private readonly topRightClusterEl: HTMLElement;
  private readonly statusZoneBadgeEl: HTMLElement;
  private readonly statusZoneTextEl: HTMLElement;
  private readonly rankedAliveEl: HTMLElement;
  private readonly rankedKillsEl: HTMLElement;
  private readonly settingsGearBtn: HTMLButtonElement;
  private readonly activeWeaponCardEl: HTMLElement;
  private readonly weaponAmmoMagEl: HTMLElement;
  private readonly weaponAmmoResEl: HTMLElement;
  private readonly weaponNameBadgeEl: HTMLElement;
  private readonly weaponFireDotEl: HTMLElement;
  private readonly weaponActiveSvgEl: HTMLElement;
  private readonly quickReloadBtn: HTMLButtonElement;
  private readonly quickReloadBarEl: HTMLElement;
  private readonly slotTile1Btn: HTMLButtonElement;
  private readonly slotTile2Btn: HTMLButtonElement;
  private readonly slotTile3Btn: HTMLButtonElement;
  private readonly slotTile4Btn: HTMLButtonElement;
  private readonly slotTileFistsBtn: HTMLButtonElement;
  private readonly slot1IconEl: HTMLElement;
  private readonly slot1AmmoEl: HTMLElement;
  private readonly slot2IconEl: HTMLElement;
  private readonly slot2AmmoEl: HTMLElement;
  private readonly slot3IconEl: HTMLElement;
  private readonly slot3AmmoEl: HTMLElement;
  private readonly slot4IconEl: HTMLElement;
  private readonly slot4AmmoEl: HTMLElement;
  private readonly weaponReplaceModalEl: HTMLElement;
  private readonly weaponReplaceTitleEl: HTMLElement;
  private readonly weaponReplaceSubtitleEl: HTMLElement;
  private readonly weaponReplaceIncomingEl: HTMLElement;
  private readonly weaponReplaceChoicesEl: HTMLElement;
  private readonly weaponReplaceCancelBtn: HTMLButtonElement;
  private pendingWeaponReplace: WeaponReplacementPrompt | null = null;

  // Bottom-center health, armor & tactical row
  private readonly bottomHudBarEl: HTMLElement;
  private readonly bottomAvatarEl: HTMLElement;
  private readonly bottomCallsignEl: HTMLElement;
  private readonly bottomHelmetIconEl: HTMLElement;
  private readonly bottomHelmetTextEl: HTMLElement;
  private readonly bottomArmorIconEl: HTMLElement;
  private readonly bottomArmorTextEl: HTMLElement;
  private readonly bottomHpTextEl: HTMLElement;
  private readonly bottomShieldTextEl: HTMLElement;
  private readonly bottomHpFillEl: HTMLElement;
  private readonly bottomShieldFillEl: HTMLElement;
  private localCallsign = 'OPERATOR';
  private localAvatarId = DEFAULT_AVATAR_ID;
  private readonly tileMedBtn: HTMLButtonElement;
  private readonly tileMedIconEl: HTMLElement;
  private readonly tileMedCountEl: HTMLElement;
  private readonly tileSpecBtn: HTMLButtonElement;
  private readonly tileSpecIconEl: HTMLElement;
  private readonly tileSpecCountEl: HTMLElement;
  private readonly tileGlooBtn: HTMLButtonElement;
  private readonly tileGlooCountEl: HTMLElement;
  private readonly tileAbilityBtn: HTMLButtonElement;
  private readonly tileAbilityBadgeEl: HTMLElement;
  private readonly tileBagBtn: HTMLButtonElement;
  private readonly tileBagIconEl: HTMLElement;
  private readonly tileBagBadgeEl: HTMLElement;
  private readonly killBannerEl: HTMLElement;

  // Center reticle, prompts & overlays
  private readonly hudStatusLayerEl: HTMLElement;
  private readonly hudWidgets = new Map<HudStatusSlotId, HudSlotWidget>();
  private readonly crosshairContainerEl: HTMLElement;
  private readonly crosshairReticleEl: HTMLElement;
  private readonly crosshairCenterSvgEl: SVGSVGElement;
  private readonly crosshairRingEl: SVGCircleElement;
  private readonly crosshairDotEl: SVGCircleElement;
  private readonly hitmarkerEl: HTMLElement;
  private readonly actionToastEl: HTMLElement;
  private readonly pickupPromptEl: HTMLButtonElement;
  private readonly damageReadoutEl: HTMLElement;
  private readonly reloadWrapEl: HTMLElement;
  private readonly reloadBarEl: HTMLElement;
  private readonly healWrapEl: HTMLElement;
  private readonly healLabelEl: HTMLElement;
  private readonly healTimeEl: HTMLElement;
  private readonly healBarEl: HTMLElement;

  // Minimaps & Modals
  private readonly minimap: Minimap;
  private readonly fullMapMinimap: Minimap;
  private readonly fullMapModalEl: HTMLElement;
  private readonly fullMapTitleEl: HTMLElement;
  private readonly fullMapCloseBtn: HTMLButtonElement;
  private readonly fullMapZoneEl: HTMLElement;
  private readonly fullMapMountEl: HTMLElement;
  private readonly fullMapLegendSafeEl: HTMLElement;
  private readonly fullMapLegendNextEl: HTMLElement;
  private readonly fullMapLegendBlueEl: HTMLElement;
  private readonly matchSettingsModalEl: HTMLElement;
  private readonly settingsModalTitleEl: HTMLElement;
  private readonly settingsCloseBtn: HTMLButtonElement;
  private readonly settingsLangLabelEl: HTMLElement;
  private readonly settingsLanguageButtons: Record<AppLanguage, HTMLButtonElement>;
  private readonly settingsGraphicsLabelEl: HTMLElement;
  private readonly settingsMuteBtn: HTMLButtonElement;
  private readonly settingsCamBtn: HTMLButtonElement;
  private readonly settingsPracticeActionsEl: HTMLElement;
  private readonly settingsCycleMapBtn: HTMLButtonElement;
  private readonly settingsNewMatchBtn: HTMLButtonElement;
  private readonly settingsHudEditorBtn: HTMLButtonElement;
  private readonly settingsExitMenuBtn: HTMLButtonElement;
  private readonly qualityButtons: Record<QualityPreset, HTMLButtonElement>;
  private readonly settingsGlooLabelEl: HTMLElement;
  private readonly glooModeButtons: Record<GlooWallPlacementMode, HTMLButtonElement>;
  private readonly quickReloadLabelEl: HTMLElement;
  private readonly minimapMountEl: HTMLElement;
  private readonly helmetTitleWrapEl: HTMLElement;
  private readonly armorTitleWrapEl: HTMLElement;
  private readonly airdropOverlay: AirdropOverlay;
  private readonly scopeOverlay: ScopeOverlay;
  private readonly inventoryUI: InventoryUI;
  private readonly spectatorBannerEl: HTMLElement;
  private readonly spectatorTextEl: HTMLElement;
  private readonly spectatorResultsBtn: HTMLButtonElement;
  private readonly spectatorLeaveBtn: HTMLButtonElement;
  private readonly rankedResultModalEl: HTMLElement;
  private readonly rankedResultContentEl: HTMLElement;

  private fullMapOpen = false;
  private inventoryOpen = false;
  private settingsModalOpen = false;
  private lastFullMapZoneKey = '';
  private lastAbilitySyncAccum = 0;
  private lastWeaponSyncAccum = 0;
  private lastInventorySyncAccum = 0;
  private toastTimeoutId = 0;
  private killBannerTimeoutId = 0;
  private lastGlooHudKey = '';
  private glooHeldActive = false;
  private isAiming = false;
  private showTouchControls = false;
  private airborneActive = false;
  private currentSettings: GameSettings;
  private latestMetrics: ViewportMetrics;
  private currentCameraModeLabel: 'PLAYER' | 'ORBIT' = 'PLAYER';

  private lastScopeAvailable: boolean | null = null;
  private lastUnarmedState: boolean | null = null;
  private lastHasStoredWeapons: boolean | null = null;
  private lastCrosshairUnarmed: boolean | null = null;
  private lastCrosshairEnemyTargeted: boolean | null = null;
  private lastCrouchToggle: boolean | null = null;
  private lastProneToggle: boolean | null = null;
  private lastSprintToggle: boolean | null = null;

  private readonly statusState: HudStatusRenderState = {
    health: 200,
    maxHealth: 200,
    shield: 0,
    maxShield: 100,
    armorTier: 0,
    armorDurability: 0,
    maxArmorDurability: 100,
    helmetTier: 0,
    helmetDurability: 0,
    maxHelmetDurability: 100,
    activeSlotIndex: 0,
    isUnarmed: false,
    isMeleeActive: false,
    activeWeaponId: null,
    weapon1: null,
    weapon2: null,
    activeAmmoType: 'AR',
    activeAmmoInMag: 0,
    activeAmmoReserve: 0,
    isReloading: false,
    medDef: null,
    medCount: 0,
    specialDef: null,
    specialCount: 0,
    healRemainingSec: 0,
    healProgress: 0,
    punchCooldownRatio: 0,
    unlimitedAmmo: false,
  };

  private readonly killFeedEntries: KillFeedEntry[] = [];
  private activeHudMode: 'practice' | 'ranked' | 'battle-royale' = 'practice';
  private lastBrElimPayload: BattleRoyaleEliminationPayload | null = null;
  private lastBrResultPayload: BattleRoyaleResultPayload | null = null;
  private lastRankedResultPayload: RankedMatchResultPayload | null = null;
  private activeResultModalKind: 'ranked' | 'br-elim' | 'br-result' | null = null;
  private lastSpectatorTarget: string | null = null;
  private lastSpectatorIsSquadmate = false;
  private lastSquadHudKey = '';
  private lastSquadStatuses: SquadmateHudStatus[] = [];
  private lastWaitingArgs: {
    snap: AirplaneDropSnapshot;
    modeLabel: string;
    participantCount: number;
  } | null = null;
  private readonly waitingArgsScratch: {
    snap: AirplaneDropSnapshot | null;
    modeLabel: string;
    participantCount: number;
  } = { snap: null, modeLabel: '', participantCount: 0 };
  private lastRankedZoneArgs: {
    aliveCount: number;
    localKills: number;
    zone: ServerZoneState | null;
    inDangerZone: boolean;
  } | null = null;
  private readonly rankedZoneArgsScratch: {
    aliveCount: number;
    localKills: number;
    zone: ServerZoneState | null;
    inDangerZone: boolean;
  } = { aliveCount: 0, localKills: 0, zone: null, inDangerZone: false };
  private lastPlayerStatsSnapshot: PlayerStateSnapshot | null = null;
  private lastWeaponSnapshot: WeaponHudSnapshot | null = null;
  private lastWaitingKey = '';
  private unsubI18n: (() => void) | null = null;

  // Dirty-check caches for zero-reflow per-frame sync
  private lastCompassDeg = -999;
  private lastSafeBearingDeg = -999;
  private lastRankedAlive = -1;
  private lastRankedKills = -1;
  private lastRankedZoneSec = -1;
  private lastRankedZonePhase = -1;
  private lastRankedZoneTotalPhases = -1;
  private lastRankedZoneState = '';
  private lastRankedZoneDps = -1;
  private lastRankedZoneDanger = false;
  private lastRankedZoneLang = '';
  private lastRankedZoneKey = '';
  private lastZoneWarningKey = '';
  private lastDangerVignetteActive = false;
  private lastZonePingCueKey = '';
  private lastHitmarkerActive: boolean | null = null;
  private lastHitmarkerHeadshot: boolean | null = null;
  private lastDmgKey = '';
  private lastReticleOpacity = '';
  private lastWeaponKey = '';
  private lastUnlimitedAmmoState: boolean | null = null;
  private lastBurstHitRef: unknown = null;
  private burstTargetKey = '';
  private burstDamageTotal = 0;
  private burstLastHitTimeMs = 0;
  private lastFiringState: boolean | null = null;
  private lastReloadKey = '';
  private lastHealKey = '';
  private lastPromptKey = '';
  private lastPromptHighlight: boolean | null = null;
  private lastBagKey = '';
  private lastAbilityKey = '';
  private lastStatsKey = '';
  private lastInvStatusKey = '';
  private lastFps = -1;

  constructor(
    private readonly deviceProfile: DeviceProfile,
    private readonly controlSettings: ControlSettings,
    initialMetrics: ViewportMetrics,
    initialSettings: GameSettings,
    private readonly callbacks: TestArenaHudCallbacks,
  ) {
    this.currentSettings = initialSettings;
    this.latestMetrics = initialMetrics;
    this.element = document.createElement('div');
    this.element.className = 'absolute inset-0 z-20 pointer-events-none select-none overflow-hidden';

    const compactMinimapSize = this.computeCornerMinimapSize(initialMetrics);

    this.element.innerHTML = `
      <!-- TOP-LEFT: Compact Tactical Minimap + Vertical Utility Rail + FPS + Kill Feed -->
      <div class="pointer-events-none fixed hud-safe-tl z-25 flex flex-col items-start gap-1 sm:gap-1.5">
        <div class="flex items-start gap-1 sm:gap-1.5">
          <div
            data-role="minimap-mount"
            data-ltr="true"
            dir="ltr"
            title="${i18n.t('hud.aria.fullMap')}"
            class="pointer-events-auto cursor-pointer shrink-0"
          ></div>

          <div class="pointer-events-auto flex flex-col gap-1">
            <button
              type="button"
              data-action="toggle-mute"
              aria-label="${i18n.t('hud.aria.toggleMute')}"
              title="${i18n.t('hud.aria.toggleMute')}"
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/68 border border-white/25 hover:border-white/55 text-slate-100 flex items-center justify-center transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            >
              <span class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">${getAudioToggleSvg(initialSettings.audio.muted)}</span>
            </button>

            <button
              type="button"
              data-action="open-layout-editor"
              aria-label="${i18n.t('hud.aria.editHud')}"
              title="${i18n.t('hud.aria.editHud')}"
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/68 border border-white/25 hover:border-sky-400/75 text-sky-300 hover:text-white flex items-center justify-center transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            >
              <span class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">${getEditHudSvg()}</span>
            </button>

            <button
              type="button"
              data-action="open-full-map"
              aria-label="${i18n.t('hud.aria.fullMap')}"
              title="${i18n.t('hud.aria.fullMap')}"
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/68 border border-white/25 hover:border-amber-300/75 text-slate-200 hover:text-white flex items-center justify-center transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            >
              <span class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">${getMapGlobeSvg()}</span>
            </button>

            <button
              type="button"
              data-action="open-emote-wheel"
              aria-label="${i18n.t('hud.aria.emotes')}"
              title="${i18n.t('hud.aria.emotes')}"
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/68 border border-white/25 hover:border-orange-400/80 text-orange-300 hover:text-white flex items-center justify-center transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            >
              <span class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">${getEmoteWheelTriggerSvg()}</span>
            </button>
          </div>
        </div>

        <span
          data-role="fps"
          class="pointer-events-none px-1.5 py-0.5 rounded-sm bg-slate-950/68 border border-white/15 text-[10px] font-black tabular-nums text-amber-300 tracking-wider leading-none"
        >${i18n.t('hud.fps', { fps: 60 })}</span>

        <!-- Live Match Kill Feed -->
        <div
          data-role="kill-feed"
          class="hidden pointer-events-none flex flex-col gap-1 max-w-[235px]"
        ></div>

        <!-- Compact Squadmate HP / Shield Strip -->
        <div
          data-role="squad-hud-list"
          class="hidden pointer-events-none flex flex-col gap-1 w-[144px] sm:w-[172px]"
        ></div>
      </div>

      <!-- TOP-CENTER: Horizontal Tactical Compass + Center Degree Readout -->
      <div dir="ltr" data-ltr="true" class="pointer-events-none fixed hud-safe-tc left-1/2 -translate-x-1/2 z-25 w-[132px] sm:w-[250px] md:w-[320px] flex flex-col items-center">
        <div
          class="relative w-full h-6 sm:h-7 overflow-hidden bg-slate-950/45 rounded-sm border-b border-white/20"
          style="mask-image: linear-gradient(to right, transparent 0%, black 16%, black 84%, transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0%, black 16%, black 84%, transparent 100%);"
        >
          <!-- Center Top Downward Pointer Chevron -->
          <div class="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 z-10 border-x-[4px] border-x-transparent border-t-[5px] border-t-amber-400"></div>

          <!-- Sliding Tick Strip anchored at center -->
          <div class="relative left-1/2 w-0 h-full will-change-transform" data-role="compass-track">
            <div data-role="compass-ticks" class="contents">${buildCompassTicksHtml()}</div>
            <div
              data-role="compass-safe-pip"
              title="${i18n.t('hud.title.safeZoneDir')}"
              class="hidden absolute top-[1px] -translate-x-1/2 w-2 h-2 rotate-45 bg-sky-400 border border-white shadow-[0_0_6px_rgba(56,189,248,0.95)]"
            ></div>
          </div>
        </div>

        <div
          data-role="compass-deg"
          class="-mt-0.5 px-1.5 py-[1px] rounded-sm bg-slate-950/82 border border-white/25 text-[9px] sm:text-[10px] font-black text-white tabular-nums tracking-wider leading-tight"
        >000°</div>
      </div>

      <!-- TOP-RIGHT: Match Status Strip + Active Weapon Card + 3-Tile Weapon Selector -->
      <div
        data-role="top-right-cluster"
        class="pointer-events-none fixed hud-safe-tr z-25 flex flex-col items-end gap-1 sm:gap-1.5"
      >
        <!-- Match Status Strip -->
        <div class="pointer-events-auto flex items-center gap-1.5 sm:gap-2 px-2 py-1 rounded-sm bg-slate-950/72 border border-white/25 text-[11px] font-black tracking-wider uppercase shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          <div
            data-role="status-zone-badge"
            class="flex items-center gap-1 text-sky-300 tabular-nums border-r border-white/20 pr-1.5"
          >
            <span class="w-3.5 h-3.5 flex items-center justify-center shrink-0">${getClockTimerSvg()}</span>
            <span data-role="status-zone-text" class="text-[10px] sm:text-[11px] whitespace-nowrap">${i18n.t('hud.zone.practice')}</span>
          </div>

          <div class="flex items-center gap-1 text-slate-100 tabular-nums">
            <span class="w-3.5 h-3.5 flex items-center justify-center text-sky-300 shrink-0">${getAlivePersonSvg()}</span>
            <strong data-role="ranked-alive" class="text-white font-black">1</strong>
          </div>

          <div class="flex items-center gap-1 text-slate-100 tabular-nums border-l border-white/20 pl-1.5">
            <span class="w-3.5 h-3.5 flex items-center justify-center text-rose-400 shrink-0">${getElimSkullSvg()}</span>
            <strong data-role="ranked-kills" class="text-white font-black">0</strong>
          </div>

          <button
            type="button"
            data-action="open-settings"
            aria-label="${i18n.t('hud.aria.settingsMenu')}"
            title="${i18n.t('hud.aria.settingsMenu')}"
            class="ml-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-sm bg-white/10 hover:bg-white/20 border border-white/25 text-slate-100 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <span class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">${getSettingsCogSvg()}</span>
          </button>
        </div>

        <!-- Active Weapon Card -->
        <div
          data-role="active-weapon-card"
          class="pointer-events-auto w-[192px] sm:w-[264px] rounded-sm bg-slate-950/66 border border-white/25 px-2 sm:px-2.5 py-1 sm:py-1.5 flex flex-col gap-0.5 sm:gap-1 shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex flex-col">
              <div class="flex items-baseline gap-1 leading-none">
                <span data-role="weapon-ammo-mag" class="text-base sm:text-2xl font-black text-white tabular-nums tracking-tight">30</span>
                <span data-role="weapon-ammo-res" class="text-[10px] sm:text-xs font-bold text-slate-300 tabular-nums">/120</span>
              </div>
              <div class="flex items-center gap-1 mt-0.5">
                <span data-role="weapon-fire-dot" class="hidden w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                <span data-role="weapon-name-badge" class="text-[9px] font-extrabold tracking-wider text-slate-200 uppercase truncate">SCAR-L</span>
              </div>
            </div>

            <div
              data-role="weapon-active-svg"
              class="w-[64px] sm:w-[94px] h-6 sm:h-8 flex items-center justify-end text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] shrink-0"
            ></div>
          </div>

          <button
            type="button"
            data-action="quick-reload"
            class="relative w-full h-3.5 sm:h-4 rounded-[2px] bg-slate-900/85 border border-white/20 hover:border-amber-300/60 overflow-hidden flex items-center px-1.5 text-[8px] sm:text-[9px] font-bold tracking-wider uppercase text-slate-200"
          >
            <span data-role="quick-reload-bar" class="absolute inset-y-0 left-0 bg-amber-400/55 transition-[width] duration-75" style="width: 0%"></span>
            <span class="relative z-10 flex items-center justify-between w-full">
              <span data-role="quick-reload-label">${i18n.t('hud.quickReload')}</span>
              <span class="text-slate-300 hidden sm:inline">[R]</span>
            </span>
          </button>
        </div>

        <!-- 5-Tile Free Fire Weapon Selector Row: Large 1 | Large 2 | Pistol | Melee | Fists -->
        <div class="pointer-events-auto w-[192px] sm:w-[264px] grid grid-cols-5 gap-1">
          <button
            type="button"
            data-action="equip-slot-1"
            title="Large Weapon 1 [1]"
            class="relative h-8 sm:h-11 rounded-sm bg-slate-950/62 border border-amber-400/85 px-0.5 py-0.5 flex flex-col items-center justify-between overflow-hidden transition-colors"
          >
            <span class="pointer-events-none absolute top-0 left-0.5 text-[7px] font-black text-amber-300/90 leading-none">1</span>
            <span data-role="slot1-icon" class="w-full h-5 sm:h-6 flex items-center justify-center text-white"></span>
            <span data-role="slot1-ammo" class="text-[8px] sm:text-[9px] font-black text-white tabular-nums leading-none">30</span>
          </button>

          <button
            type="button"
            data-action="equip-slot-2"
            title="Large Weapon 2 [2]"
            class="relative h-8 sm:h-11 rounded-sm bg-slate-950/62 border border-white/25 px-0.5 py-0.5 flex flex-col items-center justify-between overflow-hidden transition-colors"
          >
            <span class="pointer-events-none absolute top-0 left-0.5 text-[7px] font-black text-slate-300/85 leading-none">2</span>
            <span data-role="slot2-icon" class="w-full h-5 sm:h-6 flex items-center justify-center text-slate-300"></span>
            <span data-role="slot2-ammo" class="text-[8px] sm:text-[9px] font-black text-slate-300 tabular-nums leading-none">—</span>
          </button>

          <button
            type="button"
            data-action="equip-slot-3"
            title="Pistol Slot [3]"
            class="relative h-8 sm:h-11 rounded-sm bg-slate-950/62 border border-white/25 px-0.5 py-0.5 flex flex-col items-center justify-between overflow-hidden transition-colors"
          >
            <span class="pointer-events-none absolute top-0 left-0.5 text-[7px] font-black text-sky-300/85 leading-none">3</span>
            <span data-role="slot3-icon" class="w-full h-5 sm:h-6 flex items-center justify-center text-slate-300"></span>
            <span data-role="slot3-ammo" class="text-[8px] sm:text-[9px] font-black text-slate-300 tabular-nums leading-none">—</span>
          </button>

          <button
            type="button"
            data-action="equip-slot-4"
            title="Melee Slot [4]"
            class="relative h-8 sm:h-11 rounded-sm bg-slate-950/62 border border-white/25 px-0.5 py-0.5 flex flex-col items-center justify-between overflow-hidden transition-colors"
          >
            <span class="pointer-events-none absolute top-0 left-0.5 text-[7px] font-black text-emerald-300/85 leading-none">4</span>
            <span data-role="slot4-icon" class="w-full h-5 sm:h-6 flex items-center justify-center text-slate-300"></span>
            <span data-role="slot4-ammo" class="text-[8px] sm:text-[9px] font-black text-slate-300 tabular-nums leading-none">—</span>
          </button>

          <button
            type="button"
            data-action="equip-fists"
            title="${i18n.t('hud.title.unarmed')}"
            class="relative h-8 sm:h-11 rounded-sm bg-slate-950/62 border border-white/25 px-0.5 py-0.5 flex flex-col items-center justify-between overflow-hidden transition-colors"
          >
            <span class="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-white">${getPunchSvg()}</span>
            <span class="text-[9px] sm:text-[10px] font-black text-slate-200 leading-none">∞</span>
          </button>
        </div>
      </div>

      <!-- Outside Safe Zone Blue Zone Vignette -->
      <div
        data-role="danger-vignette"
        class="hidden pointer-events-none fixed inset-0 z-[8]"
        style="box-shadow: inset 0 0 54px rgba(37, 99, 235, 0.56);"
      ></div>

      <!-- Safe Zone Shrink Warning Banner (with red warning triangle) -->
      <div
        data-role="zone-warning"
        class="hidden pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-sm bg-slate-950/78 border border-rose-500/75 text-[10px] sm:text-[11px] font-black tracking-[0.12em] uppercase tabular-nums whitespace-nowrap flex items-center gap-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
      ></div>

      <!-- Pre-Match Waiting Arena 30s Countdown Banner -->
      <div
        data-role="waiting-banner"
        class="hidden pointer-events-none fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-20 w-[86vw] max-w-[380px] nexus-panel px-3.5 py-2 rounded border border-sky-400/70 flex flex-col gap-1"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div data-role="waiting-title" class="text-[10px] font-black tracking-[0.15em] uppercase text-sky-300 truncate"></div>
            <div data-role="waiting-meta" class="text-[10px] font-bold tracking-wider uppercase text-slate-200 tabular-nums truncate"></div>
          </div>
          <div class="text-right shrink-0">
            <div data-role="waiting-boarding-label" class="text-[8px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('hud.waiting.boardingIn')}</div>
            <div data-role="waiting-countdown" class="text-lg font-black text-amber-300 tabular-nums leading-none">30S</div>
          </div>
        </div>
        <div class="w-full h-1.5 bg-slate-800 rounded-sm overflow-hidden">
          <div data-role="waiting-bar" class="h-full bg-amber-400 transition-[width] duration-100" style="width: 100%"></div>
        </div>
      </div>

      <!-- Free Fire-style Top-Center Elimination Notification Banner -->
      <div
        data-role="kill-banner"
        class="pointer-events-none fixed top-[4.6rem] sm:top-[5.2rem] left-1/2 -translate-x-1/2 z-30 opacity-0 scale-95 transition-all duration-200 ease-out"
      ></div>

      <!-- Eliminated Spectator Banner -->
      <div data-role="spectator-banner" class="hidden pointer-events-auto fixed top-20 left-1/2 -translate-x-1/2 z-30 nexus-panel px-4 py-2 rounded border-rose-500/60 flex items-center gap-2.5">
        <span data-role="spectator-text" class="text-xs font-black tracking-wider uppercase text-rose-300">${i18n.t('hud.spectator.concluding')}</span>
        <button type="button" data-action="spectator-results" class="hidden nexus-btn-primary px-2.5 py-1 rounded text-[10px] font-extrabold uppercase whitespace-nowrap">${i18n.t('hud.spectator.resultsBtn')}</button>
        <button type="button" data-action="spectator-leave" class="nexus-btn-secondary px-2.5 py-1 rounded text-[10px] font-extrabold uppercase whitespace-nowrap">${i18n.t('hud.spectator.rankedLobbyBtn')}</button>
      </div>

      <!-- Match Elimination / Winner Results Modal -->
      <div data-role="ranked-result-modal" class="hidden pointer-events-auto fixed inset-0 z-40 bg-slate-950/88 flex items-center justify-center safe-pad">
        <div data-role="ranked-result-content" class="nexus-panel rounded p-4 sm:p-6 w-full max-w-lg max-h-[92dvh] overflow-y-auto nexus-scroll flex flex-col gap-3 sm:gap-4"></div>
      </div>

      <!-- Fixed Screen-Center Crosshair & Hitmarker -->
      <div data-role="crosshair" class="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
        <div data-role="crosshair-reticle" class="relative w-12 h-12 flex items-center justify-center transition-opacity duration-75">
          <svg
            data-role="crosshair-center-svg"
            viewBox="0 0 24 24"
            class="w-6 h-6 overflow-visible"
            style="filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9))"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="7.2" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="2.5" />
            <circle data-role="crosshair-ring" cx="12" cy="12" r="7.2" fill="none" stroke="#ffffff" stroke-width="1.45" />
            <circle cx="12" cy="12" r="2.25" fill="rgba(0,0,0,0.55)" />
            <circle data-role="crosshair-dot" cx="12" cy="12" r="1.6" fill="#ffffff" />
          </svg>
        </div>
        <div data-role="hitmarker" class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-75">
          <span class="text-sm font-black leading-none select-none">✕</span>
        </div>
        <div data-role="reload-wrap" class="hidden pointer-events-none fixed top-[58%] left-1/2 -translate-x-1/2 w-28 h-1.5 bg-slate-900/80 border border-slate-600/70 rounded-full overflow-hidden">
          <div data-role="reload-bar" class="h-full bg-orange-400" style="width: 0%"></div>
        </div>
        <div data-role="heal-wrap" class="hidden pointer-events-none fixed top-[60.5%] left-1/2 -translate-x-1/2 w-48 nexus-panel-subtle px-2.5 py-1.5 rounded border border-emerald-400/50 flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2 text-[10px] font-black tracking-wider uppercase">
            <span data-role="heal-label" class="text-emerald-300 truncate">HEALING</span>
            <span data-role="heal-time" class="text-amber-300 tabular-nums shrink-0">3.0s</span>
          </div>
          <div class="w-full h-1.5 bg-slate-900/90 border border-slate-600/60 rounded-full overflow-hidden">
            <div data-role="heal-bar" class="h-full bg-emerald-400" style="width: 0%"></div>
          </div>
        </div>
      </div>

      <!-- Last Hit / Range Band Readout -->
      <div
        data-role="damage-readout"
        class="pointer-events-none fixed top-[54%] left-1/2 -translate-x-1/2 z-20 text-[11px] font-extrabold tracking-wider uppercase tabular-nums opacity-0 transition-opacity duration-150"
      ></div>

      <!-- Proximity Loot INTERACT Prompt -->
      <button
        type="button"
        data-role="pickup-prompt"
        class="pointer-events-auto hidden fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 nexus-panel px-4 py-2 rounded border-2 border-amber-400 text-xs font-black tracking-wider text-amber-300 uppercase shadow-lg z-25"
      >INTERACT</button>

      <div
        data-role="action-toast"
        class="pointer-events-none fixed top-32 left-1/2 -translate-x-1/2 nexus-panel-subtle px-3 py-1 rounded text-[11px] font-bold tracking-[0.16em] text-amber-300 uppercase opacity-0 transition-opacity duration-150 z-30"
      ></div>

      <!-- Weapon Replacement Choice Modal (Free Fire Style Category Cap) -->
      <div
        data-role="weapon-replace-modal"
        class="hidden pointer-events-auto fixed inset-0 z-40 bg-slate-950/76 flex items-center justify-center safe-pad"
      >
        <div class="w-full max-w-[440px] bg-slate-900/95 border border-amber-400/75 rounded-lg shadow-[0_14px_38px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
          <div class="px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div data-role="weapon-replace-title" class="text-xs font-black tracking-[0.14em] uppercase text-amber-300">REPLACE WEAPON</div>
              <div data-role="weapon-replace-subtitle" class="text-[10px] font-semibold text-slate-300 truncate">Choose which equipped weapon to drop and replace</div>
            </div>
            <button
              type="button"
              data-action="cancel-weapon-replace"
              class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[10px] font-black tracking-wider uppercase text-slate-200 shrink-0"
            >CANCEL [ESC]</button>
          </div>
          <div class="p-3 flex flex-col gap-2.5">
            <div data-role="weapon-replace-incoming" class="rounded-md bg-slate-950/85 border border-sky-400/55 px-3 py-2 flex items-center justify-between gap-3"></div>
            <div class="text-[10px] font-black tracking-[0.14em] uppercase text-slate-400">SELECT WEAPON TO REPLACE</div>
            <div data-role="weapon-replace-choices" class="grid grid-cols-1 gap-2"></div>
          </div>
        </div>
      </div>

      <!-- BOTTOM-CENTER: Slim Health, Armor, Shield & 4 Tactical Quick Tiles -->
      <div
        data-role="bottom-hud-bar"
        class="pointer-events-none fixed hud-safe-bc left-1/2 -translate-x-1/2 z-25 w-[min(68vw,272px)] sm:w-[348px] flex flex-col items-center gap-1"
      >
        <!-- 4 Compact Tactical Tiles: Medkit [3], Special [4], Ability [Q], Bag [TAB] -->
        <div class="pointer-events-auto flex items-center justify-center gap-1.5">
          <button
            type="button"
            data-action="hud-medkit"
            title="${i18n.t('hud.title.medkit')}"
            class="relative w-8 h-7 sm:w-9 sm:h-8 rounded-sm bg-slate-950/68 border border-white/25 hover:border-emerald-400/70 flex items-center justify-center text-white transition-colors"
          >
            <span data-role="tile-med-icon" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center"></span>
            <span data-role="tile-med-count" class="absolute -bottom-1 -right-1 px-1 rounded-[2px] bg-slate-950/90 border border-white/25 text-[8px] font-black tabular-nums leading-[11px] text-emerald-300">0</span>
          </button>

          <button
            type="button"
            data-action="hud-special"
            title="${i18n.t('hud.title.special')}"
            class="relative w-8 h-7 sm:w-9 sm:h-8 rounded-sm bg-slate-950/68 border border-white/25 hover:border-sky-400/70 flex items-center justify-center text-white transition-colors"
          >
            <span data-role="tile-spec-icon" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center"></span>
            <span data-role="tile-spec-count" class="absolute -bottom-1 -right-1 px-1 rounded-[2px] bg-slate-950/90 border border-white/25 text-[8px] font-black tabular-nums leading-[11px] text-sky-300">0</span>
          </button>

          <button
            type="button"
            data-action="hud-gloo"
            title="${i18n.t('hud.title.glooWall')}"
            class="relative w-8 h-7 sm:w-9 sm:h-8 rounded-sm bg-slate-950/68 border border-sky-400/60 hover:border-sky-300 flex items-center justify-center text-sky-200 overflow-hidden transition-colors"
          >
            <span class="relative z-10 w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">${getGlooWallSvg()}</span>
            <span class="pointer-events-none hidden sm:block absolute top-0 left-0.5 text-[7px] font-black text-sky-300/90 leading-none">V</span>
            <span data-role="tile-gloo-count" class="relative z-20 absolute -bottom-0.5 -right-0.5 px-1 rounded-[2px] bg-slate-950/95 border border-sky-400/60 text-[8px] font-black tabular-nums leading-[11px] text-sky-200">0/3</span>
          </button>

          <button
            type="button"
            data-action="hud-ability"
            title="${i18n.t('hud.title.ability')}"
            class="relative w-8 h-7 sm:w-9 sm:h-8 rounded-sm bg-slate-950/68 border border-amber-300/45 hover:border-amber-300 flex items-center justify-center text-amber-200 transition-colors"
          >
            <span data-role="tile-ability-icon" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">${getHudActionSvg('ability')}</span>
            <span data-role="tile-ability-badge" class="hidden absolute -bottom-1 -right-1 px-1 rounded-[2px] bg-slate-950/90 border border-amber-400/50 text-[8px] font-black tabular-nums leading-[11px] text-amber-300">Q</span>
          </button>

          <button
            type="button"
            data-action="hud-bag"
            title="${i18n.t('hud.title.bag')}"
            class="relative w-8 h-7 sm:w-9 sm:h-8 rounded-sm bg-slate-950/68 border border-white/25 hover:border-white/60 flex items-center justify-center text-white transition-colors"
          >
            <span data-role="tile-bag-icon" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">${getBackpackSvg(2)}</span>
            <span data-role="tile-bag-badge" class="absolute -bottom-1 -right-1 px-1 rounded-[2px] bg-slate-950/90 border border-white/25 text-[8px] font-black tabular-nums leading-[11px] text-slate-200">0</span>
          </button>
        </div>

        <!-- Slim Avatar, Armor, Helmet & Segmented HP + Shield Strip -->
        <div class="pointer-events-none w-full rounded-sm bg-slate-950/72 border border-white/20 px-2 py-1 flex items-center gap-2 shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
          <div
            data-role="bottom-player-avatar"
            class="w-8 h-8 sm:w-9 sm:h-9 rounded-sm overflow-hidden border border-white/35 bg-slate-900 shrink-0 shadow"
          >${getAvatarSvg(DEFAULT_AVATAR_ID, 'w-full h-full')}</div>

          <div class="flex items-center gap-1.5 shrink-0">
            <div data-role="helmet-title-wrap" class="relative flex items-center gap-0.5" title="${i18n.t('hud.title.helmet')}">
              <span data-role="bottom-helmet-icon" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">${getHelmetSvg(0)}</span>
              <span data-role="bottom-helmet-text" class="text-[9px] font-black tabular-nums text-slate-300">0</span>
            </div>
            <div data-role="armor-title-wrap" class="relative flex items-center gap-0.5" title="${i18n.t('hud.title.armor')}">
              <span data-role="bottom-armor-icon" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">${getArmorSvg(0)}</span>
              <span data-role="bottom-armor-text" class="text-[9px] font-black tabular-nums text-slate-300">0</span>
            </div>
          </div>

          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <div class="flex items-baseline justify-between gap-1 leading-none">
              <span data-role="bottom-player-callsign" class="hidden sm:inline text-[9px] font-extrabold uppercase tracking-wider text-sky-300 truncate max-w-[78px]">OPERATOR</span>
              <span data-role="bottom-hp-text" class="text-[11px] sm:text-xs font-black text-white tabular-nums tracking-wide">${i18n.t('hud.hpStrip', { hpLabel: i18n.t('common.hp'), cur: 200, max: 200 })}</span>
              <span data-role="bottom-shield-text" class="hidden text-[10px] font-extrabold text-sky-300 tabular-nums">${i18n.t('hud.shieldShort', { sh: 0 })}</span>
            </div>
            <div class="relative w-full h-1.5 sm:h-2 rounded-[2px] bg-slate-900/95 border border-white/15 overflow-hidden">
              <div data-role="bottom-hp-fill" class="h-full bg-white transition-[width] duration-100" style="width: 100%"></div>
              <div data-role="bottom-shield-fill" class="hidden absolute inset-y-0 left-0 bg-sky-400/75 transition-[width] duration-100" style="width: 0%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Full Tactical Map Modal -->
      <div
        data-role="full-map-modal"
        class="hidden pointer-events-auto fixed inset-0 z-35 bg-slate-950/88 flex items-center justify-center safe-pad"
      >
        <div
          data-role="full-map-card"
          class="nexus-panel rounded border border-sky-400/50 p-2.5 sm:p-4 flex flex-col items-center gap-2 max-w-full max-h-full overflow-y-auto nexus-scroll"
        >
          <div class="w-full flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div data-role="full-map-title" class="text-xs sm:text-sm font-black tracking-[0.16em] uppercase text-white">${i18n.t('hud.fullMap.title')}</div>
              <div data-role="full-map-zone" class="text-[11px] font-extrabold tracking-wider uppercase text-sky-300 tabular-nums">${i18n.t('hud.fullMap.safeActive')}</div>
            </div>
            <button
              type="button"
              data-action="close-full-map"
              class="nexus-btn-secondary px-3 py-1.5 rounded text-xs font-black tracking-wider uppercase min-h-[34px] shrink-0"
            >${i18n.t('common.close')}</button>
          </div>
          <div data-role="full-map-canvas-mount" data-ltr="true" dir="ltr" class="flex items-center justify-center"></div>
          <div class="w-full flex flex-wrap items-center justify-center gap-3 text-[10px] font-bold tracking-wider uppercase text-slate-300">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span><span data-role="legend-safe">${i18n.t('hud.fullMap.legendSafe')}</span></span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full border border-dashed border-amber-400 inline-block"></span><span data-role="legend-next">${i18n.t('hud.fullMap.legendNext')}</span></span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-blue-600/80 inline-block"></span><span data-role="legend-blue">${i18n.t('hud.fullMap.legendBlue')}</span></span>
          </div>
        </div>
      </div>

      <!-- In-Match Settings & Pause Modal -->
      <div
        data-role="match-settings-modal"
        class="hidden pointer-events-auto fixed inset-0 z-40 bg-slate-950/82 flex items-center justify-center safe-pad"
      >
        <div class="nexus-panel rounded border border-white/25 w-[min(390px,94vw)] max-h-[92dvh] overflow-y-auto nexus-scroll p-3.5 sm:p-5 flex flex-col gap-3 sm:gap-3.5 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
            <h3 data-role="settings-modal-title" class="text-sm font-black tracking-[0.16em] uppercase text-white">${i18n.t('hud.settings.modalTitle')}</h3>
            <button
              type="button"
              data-action="close-settings"
              class="nexus-btn-secondary px-2.5 py-1 rounded text-[11px] font-extrabold uppercase min-h-[34px]"
            >${i18n.t('hud.settings.resume')}</button>
          </div>

          <div class="flex flex-col gap-1.5">
            <span data-role="settings-lang-label" class="text-[10px] font-extrabold tracking-widest uppercase text-amber-400">${i18n.t('lang.title')}</span>
            <div class="grid grid-cols-3 gap-2">
              <button type="button" data-match-lang="en" dir="ltr" class="py-2 rounded text-[11px] font-black tracking-wide border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">English</button>
              <button type="button" data-match-lang="ar" dir="rtl" class="py-2 rounded text-[11px] font-black tracking-wide border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">العربية</button>
              <button type="button" data-match-lang="es" dir="ltr" class="py-2 rounded text-[11px] font-black tracking-wide border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">Español</button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <span data-role="settings-graphics-label" class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('hud.settings.graphicsPreset')}</span>
            <div class="grid grid-cols-3 gap-2">
              <button type="button" data-quality="low" class="py-2 rounded text-[11px] font-black uppercase tracking-wider border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">${i18n.t('quality.low')}</button>
              <button type="button" data-quality="medium" class="py-2 rounded text-[11px] font-black uppercase tracking-wider border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">${i18n.t('quality.medium')}</button>
              <button type="button" data-quality="high" class="py-2 rounded text-[11px] font-black uppercase tracking-wider border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">${i18n.t('quality.high')}</button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <span data-role="settings-gloo-label" class="text-[10px] font-extrabold tracking-widest uppercase text-sky-400">${i18n.t('settings.section.glooWall')}</span>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" data-match-gloo-mode="auto" class="py-2 rounded text-[11px] font-black uppercase tracking-wider border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">${i18n.t('settings.glooWall.modeAuto')}</button>
              <button type="button" data-match-gloo-mode="manual" class="py-2 rounded text-[11px] font-black uppercase tracking-wider border border-slate-700 bg-slate-900/90 text-slate-200 min-h-[38px]">${i18n.t('settings.glooWall.modeManual')}</button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-action="settings-mute"
              class="nexus-btn-secondary py-2.5 px-3 rounded text-[11px] font-extrabold tracking-wider uppercase min-h-[40px]"
            >${i18n.t('hud.settings.audioOn')}</button>
            <button
              type="button"
              data-action="settings-camera"
              class="nexus-btn-secondary py-2.5 px-3 rounded text-[11px] font-extrabold tracking-wider uppercase min-h-[40px]"
            >${i18n.t('hud.settings.camLabel', { mode: i18n.t('hud.camMode.PLAYER') })}</button>
          </div>

          <div data-role="settings-practice-actions" class="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-action="settings-cycle-map"
              class="nexus-btn-secondary py-2.5 px-3 rounded text-[11px] font-extrabold tracking-wider uppercase text-emerald-200 border-emerald-400/50 min-h-[40px]"
            >${i18n.t('hud.settings.switchMapBtn')}</button>
            <button
              type="button"
              data-action="settings-new-match"
              class="nexus-btn-secondary py-2.5 px-3 rounded text-[11px] font-extrabold tracking-wider uppercase text-orange-200 border-orange-400/50 min-h-[40px]"
            >${i18n.t('hud.settings.newMatchBtn')}</button>
          </div>

          <button
            type="button"
            data-action="settings-hud-editor"
            class="nexus-btn-secondary w-full py-2.5 px-3 rounded text-[11px] font-extrabold tracking-wider uppercase text-sky-200 min-h-[40px]"
          >${i18n.t('hud.settings.hudLayoutBtn')}</button>

          <button
            type="button"
            data-action="settings-exit-menu"
            class="w-full py-2.5 px-3 rounded bg-rose-600/85 hover:bg-rose-500 border border-rose-300/40 text-xs font-black tracking-[0.14em] uppercase text-white min-h-[42px]"
          >${i18n.t('hud.settings.exitMenu')}</button>
        </div>
      </div>

      <!-- Battle Royale Airplane Drop & Skydiving Overlay -->
      <div data-role="airdrop-mount" class="contents"></div>

      <!-- Circular Sniper / Tactical Scope Overlay -->
      <div data-role="scope-mount" class="contents"></div>

      <!-- Full Tactical Inventory Mount -->
      <div data-role="inventory-mount" class="contents"></div>

      <!-- Optional Edge Touch Status Slots (Medkit & Special on Mobile) -->
      <div data-role="hud-status-layer" data-ltr="true" dir="ltr" class="absolute inset-0 z-10 pointer-events-none"></div>

      <!-- Edge Touch Action Buttons & Joystick (TouchInputManager) -->
      <div data-role="touch-mount" data-ltr="true" dir="ltr" class="absolute inset-0 z-10 pointer-events-none"></div>
    `;

    // Bind Top-Left
    this.fpsEl = this.element.querySelector('[data-role="fps"]')!;
    this.muteBtn = this.element.querySelector('[data-action="toggle-mute"]')!;
    this.editHudBtn = this.element.querySelector('[data-action="open-layout-editor"]')!;
    this.fullMapBtn = this.element.querySelector('[data-action="open-full-map"]')!;
    this.emoteWheelBtn = this.element.querySelector('[data-action="open-emote-wheel"]')!;
    this.killFeedEl = this.element.querySelector('[data-role="kill-feed"]')!;
    this.squadHudListEl = this.element.querySelector('[data-role="squad-hud-list"]')!;

    // Bind Top-Center Compass & Banners
    this.compassTrackEl = this.element.querySelector('[data-role="compass-track"]')!;
    this.compassTicksEl = this.element.querySelector('[data-role="compass-ticks"]')!;
    this.compassDegEl = this.element.querySelector('[data-role="compass-deg"]')!;
    this.compassSafePipEl = this.element.querySelector('[data-role="compass-safe-pip"]')!;
    this.zoneWarningEl = this.element.querySelector('[data-role="zone-warning"]')!;
    this.dangerVignetteEl = this.element.querySelector('[data-role="danger-vignette"]')!;
    this.waitingBannerEl = this.element.querySelector('[data-role="waiting-banner"]')!;
    this.waitingTitleEl = this.element.querySelector('[data-role="waiting-title"]')!;
    this.waitingBoardingLabelEl = this.element.querySelector('[data-role="waiting-boarding-label"]')!;
    this.waitingCountdownEl = this.element.querySelector('[data-role="waiting-countdown"]')!;
    this.waitingMetaEl = this.element.querySelector('[data-role="waiting-meta"]')!;
    this.waitingBarEl = this.element.querySelector('[data-role="waiting-bar"]')!;

    // Bind Top-Right Match Status & Weapon Panel
    this.topRightClusterEl = this.element.querySelector('[data-role="top-right-cluster"]')!;
    this.statusZoneBadgeEl = this.element.querySelector('[data-role="status-zone-badge"]')!;
    this.statusZoneTextEl = this.element.querySelector('[data-role="status-zone-text"]')!;
    this.rankedAliveEl = this.element.querySelector('[data-role="ranked-alive"]')!;
    this.rankedKillsEl = this.element.querySelector('[data-role="ranked-kills"]')!;
    this.settingsGearBtn = this.element.querySelector('[data-action="open-settings"]')!;
    this.activeWeaponCardEl = this.element.querySelector('[data-role="active-weapon-card"]')!;
    this.weaponAmmoMagEl = this.element.querySelector('[data-role="weapon-ammo-mag"]')!;
    this.weaponAmmoResEl = this.element.querySelector('[data-role="weapon-ammo-res"]')!;
    this.weaponNameBadgeEl = this.element.querySelector('[data-role="weapon-name-badge"]')!;
    this.weaponFireDotEl = this.element.querySelector('[data-role="weapon-fire-dot"]')!;
    this.weaponActiveSvgEl = this.element.querySelector('[data-role="weapon-active-svg"]')!;
    this.quickReloadBtn = this.element.querySelector('[data-action="quick-reload"]')!;
    this.quickReloadLabelEl = this.element.querySelector('[data-role="quick-reload-label"]')!;
    this.quickReloadBarEl = this.element.querySelector('[data-role="quick-reload-bar"]')!;
    this.slotTile1Btn = this.element.querySelector('[data-action="equip-slot-1"]')!;
    this.slotTile2Btn = this.element.querySelector('[data-action="equip-slot-2"]')!;
    this.slotTile3Btn = this.element.querySelector('[data-action="equip-slot-3"]')!;
    this.slotTile4Btn = this.element.querySelector('[data-action="equip-slot-4"]')!;
    this.slotTileFistsBtn = this.element.querySelector('[data-action="equip-fists"]')!;
    this.slot1IconEl = this.element.querySelector('[data-role="slot1-icon"]')!;
    this.slot1AmmoEl = this.element.querySelector('[data-role="slot1-ammo"]')!;
    this.slot2IconEl = this.element.querySelector('[data-role="slot2-icon"]')!;
    this.slot2AmmoEl = this.element.querySelector('[data-role="slot2-ammo"]')!;
    this.slot3IconEl = this.element.querySelector('[data-role="slot3-icon"]')!;
    this.slot3AmmoEl = this.element.querySelector('[data-role="slot3-ammo"]')!;
    this.slot4IconEl = this.element.querySelector('[data-role="slot4-icon"]')!;
    this.slot4AmmoEl = this.element.querySelector('[data-role="slot4-ammo"]')!;
    this.weaponReplaceModalEl = this.element.querySelector('[data-role="weapon-replace-modal"]')!;
    this.weaponReplaceTitleEl = this.element.querySelector('[data-role="weapon-replace-title"]')!;
    this.weaponReplaceSubtitleEl = this.element.querySelector('[data-role="weapon-replace-subtitle"]')!;
    this.weaponReplaceIncomingEl = this.element.querySelector('[data-role="weapon-replace-incoming"]')!;
    this.weaponReplaceChoicesEl = this.element.querySelector('[data-role="weapon-replace-choices"]')!;
    this.weaponReplaceCancelBtn = this.element.querySelector('[data-action="cancel-weapon-replace"]')!;

    // Bind Bottom-Center Bar
    this.bottomHudBarEl = this.element.querySelector('[data-role="bottom-hud-bar"]')!;
    this.bottomAvatarEl = this.element.querySelector('[data-role="bottom-player-avatar"]')!;
    this.bottomCallsignEl = this.element.querySelector('[data-role="bottom-player-callsign"]')!;
    this.bottomHelmetIconEl = this.element.querySelector('[data-role="bottom-helmet-icon"]')!;
    this.bottomHelmetTextEl = this.element.querySelector('[data-role="bottom-helmet-text"]')!;
    this.bottomArmorIconEl = this.element.querySelector('[data-role="bottom-armor-icon"]')!;
    this.bottomArmorTextEl = this.element.querySelector('[data-role="bottom-armor-text"]')!;
    this.bottomHpTextEl = this.element.querySelector('[data-role="bottom-hp-text"]')!;
    this.bottomShieldTextEl = this.element.querySelector('[data-role="bottom-shield-text"]')!;
    this.bottomHpFillEl = this.element.querySelector('[data-role="bottom-hp-fill"]')!;
    this.bottomShieldFillEl = this.element.querySelector('[data-role="bottom-shield-fill"]')!;
    this.tileMedBtn = this.element.querySelector('[data-action="hud-medkit"]')!;
    this.tileMedIconEl = this.element.querySelector('[data-role="tile-med-icon"]')!;
    this.tileMedCountEl = this.element.querySelector('[data-role="tile-med-count"]')!;
    this.tileSpecBtn = this.element.querySelector('[data-action="hud-special"]')!;
    this.tileSpecIconEl = this.element.querySelector('[data-role="tile-spec-icon"]')!;
    this.tileSpecCountEl = this.element.querySelector('[data-role="tile-spec-count"]')!;
    this.tileGlooBtn = this.element.querySelector('[data-action="hud-gloo"]')!;
    this.tileGlooCountEl = this.element.querySelector('[data-role="tile-gloo-count"]')!;
    this.tileAbilityBtn = this.element.querySelector('[data-action="hud-ability"]')!;
    this.tileAbilityBadgeEl = this.element.querySelector('[data-role="tile-ability-badge"]')!;
    this.tileBagBtn = this.element.querySelector('[data-action="hud-bag"]')!;
    this.tileBagIconEl = this.element.querySelector('[data-role="tile-bag-icon"]')!;
    this.tileBagBadgeEl = this.element.querySelector('[data-role="tile-bag-badge"]')!;
    this.killBannerEl = this.element.querySelector('[data-role="kill-banner"]')!;

    // Bind Crosshair / Prompts / Modals
    this.helmetTitleWrapEl = this.element.querySelector('[data-role="helmet-title-wrap"]')!;
    this.armorTitleWrapEl = this.element.querySelector('[data-role="armor-title-wrap"]')!;
    this.spectatorBannerEl = this.element.querySelector('[data-role="spectator-banner"]')!;
    this.spectatorTextEl = this.element.querySelector('[data-role="spectator-text"]')!;
    this.spectatorResultsBtn = this.element.querySelector<HTMLButtonElement>('[data-action="spectator-results"]')!;
    this.spectatorLeaveBtn = this.element.querySelector('[data-action="spectator-leave"]')!;
    this.rankedResultModalEl = this.element.querySelector('[data-role="ranked-result-modal"]')!;
    this.rankedResultContentEl = this.element.querySelector('[data-role="ranked-result-content"]')!;
    this.hudStatusLayerEl = this.element.querySelector('[data-role="hud-status-layer"]')!;
    this.crosshairContainerEl = this.element.querySelector('[data-role="crosshair"]')!;
    this.crosshairReticleEl = this.element.querySelector('[data-role="crosshair-reticle"]')!;
    this.crosshairCenterSvgEl = this.element.querySelector('[data-role="crosshair-center-svg"]')!;
    this.crosshairRingEl = this.element.querySelector('[data-role="crosshair-ring"]')!;
    this.crosshairDotEl = this.element.querySelector('[data-role="crosshair-dot"]')!;
    this.hitmarkerEl = this.element.querySelector('[data-role="hitmarker"]')!;
    this.reloadWrapEl = this.element.querySelector('[data-role="reload-wrap"]')!;
    this.reloadBarEl = this.element.querySelector('[data-role="reload-bar"]')!;
    this.healWrapEl = this.element.querySelector('[data-role="heal-wrap"]')!;
    this.healLabelEl = this.element.querySelector('[data-role="heal-label"]')!;
    this.healTimeEl = this.element.querySelector('[data-role="heal-time"]')!;
    this.healBarEl = this.element.querySelector('[data-role="heal-bar"]')!;
    this.actionToastEl = this.element.querySelector('[data-role="action-toast"]')!;
    this.pickupPromptEl = this.element.querySelector('[data-role="pickup-prompt"]')!;
    this.damageReadoutEl = this.element.querySelector('[data-role="damage-readout"]')!;

    this.matchSettingsModalEl = this.element.querySelector('[data-role="match-settings-modal"]')!;
    this.settingsModalTitleEl = this.matchSettingsModalEl.querySelector('[data-role="settings-modal-title"]')!;
    this.settingsCloseBtn = this.matchSettingsModalEl.querySelector('[data-action="close-settings"]')!;
    this.settingsLangLabelEl = this.matchSettingsModalEl.querySelector('[data-role="settings-lang-label"]')!;
    this.settingsLanguageButtons = {
      en: this.matchSettingsModalEl.querySelector('[data-match-lang="en"]')!,
      ar: this.matchSettingsModalEl.querySelector('[data-match-lang="ar"]')!,
      es: this.matchSettingsModalEl.querySelector('[data-match-lang="es"]')!,
    };
    this.settingsGraphicsLabelEl = this.matchSettingsModalEl.querySelector('[data-role="settings-graphics-label"]')!;
    this.settingsMuteBtn = this.element.querySelector('[data-action="settings-mute"]')!;
    this.settingsCamBtn = this.element.querySelector('[data-action="settings-camera"]')!;
    this.settingsPracticeActionsEl = this.matchSettingsModalEl.querySelector('[data-role="settings-practice-actions"]')!;
    this.settingsCycleMapBtn = this.matchSettingsModalEl.querySelector('[data-action="settings-cycle-map"]')!;
    this.settingsNewMatchBtn = this.matchSettingsModalEl.querySelector('[data-action="settings-new-match"]')!;
    this.settingsHudEditorBtn = this.matchSettingsModalEl.querySelector('[data-action="settings-hud-editor"]')!;
    this.settingsExitMenuBtn = this.matchSettingsModalEl.querySelector('[data-action="settings-exit-menu"]')!;
    this.qualityButtons = {
      low: this.matchSettingsModalEl.querySelector('[data-quality="low"]')!,
      medium: this.matchSettingsModalEl.querySelector('[data-quality="medium"]')!,
      high: this.matchSettingsModalEl.querySelector('[data-quality="high"]')!,
    };
    this.settingsGlooLabelEl = this.matchSettingsModalEl.querySelector('[data-role="settings-gloo-label"]')!;
    this.glooModeButtons = {
      auto: this.matchSettingsModalEl.querySelector('[data-match-gloo-mode="auto"]')!,
      manual: this.matchSettingsModalEl.querySelector('[data-match-gloo-mode="manual"]')!,
    };

    this.createStatusWidgets();

    // Top-left compact square minimap
    this.minimap = new Minimap(compactMinimapSize, true);
    const minimapMount = this.element.querySelector<HTMLElement>('[data-role="minimap-mount"]')!;
    this.minimapMountEl = minimapMount;
    minimapMount.appendChild(this.minimap.element);
    minimapMount.addEventListener('pointerdown', (e) => e.stopPropagation());
    minimapMount.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFullMapOpen(!this.fullMapOpen);
    });

    this.fullMapModalEl = this.element.querySelector('[data-role="full-map-modal"]')!;
    this.fullMapTitleEl = this.fullMapModalEl.querySelector('[data-role="full-map-title"]')!;
    this.fullMapCloseBtn = this.fullMapModalEl.querySelector('[data-action="close-full-map"]')!;
    this.fullMapZoneEl = this.element.querySelector('[data-role="full-map-zone"]')!;
    this.fullMapMountEl = this.element.querySelector('[data-role="full-map-canvas-mount"]')!;
    this.fullMapLegendSafeEl = this.fullMapModalEl.querySelector('[data-role="legend-safe"]')!;
    this.fullMapLegendNextEl = this.fullMapModalEl.querySelector('[data-role="legend-next"]')!;
    this.fullMapLegendBlueEl = this.fullMapModalEl.querySelector('[data-role="legend-blue"]')!;
    const fullMapSize = this.computeFullMapSize(initialMetrics);
    this.fullMapMinimap = new Minimap(fullMapSize, false);
    this.fullMapMinimap.setCustomSize(fullMapSize, true);
    this.fullMapMountEl.appendChild(this.fullMapMinimap.element);

    this.fullMapModalEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.fullMapModalEl.addEventListener('click', (e) => {
      if (e.target === this.fullMapModalEl) {
        this.setFullMapOpen(false);
      }
    });
    this.fullMapCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFullMapOpen(false);
    });

    this.airdropOverlay = new AirdropOverlay({
      onJump: () => this.callbacks.onAirborneJump(),
      onDeployParachute: () => {
        this.callbacks.onAirborneDeployChute();
        this.callbacks.onHudOptionSelected?.();
      },
    });
    this.element.querySelector<HTMLElement>('[data-role="airdrop-mount"]')!.appendChild(this.airdropOverlay.element);

    this.scopeOverlay = new ScopeOverlay(() => {
      this.callbacks.onCycleScopeZoom();
      this.callbacks.onHudOptionSelected?.();
    });
    this.element.querySelector<HTMLElement>('[data-role="scope-mount"]')!.appendChild(this.scopeOverlay.element);

    this.inventoryUI = new InventoryUI({
      ...this.callbacks.inventoryActions,
      onClose: () => this.setInventoryOpen(false),
    });
    this.element.querySelector<HTMLElement>('[data-role="inventory-mount"]')!.appendChild(this.inventoryUI.element);

    const touchMount = this.element.querySelector<HTMLElement>('[data-role="touch-mount"]')!;
    this.touchInputManager = new TouchInputManager({
      onMove: (val) => this.callbacks.onVirtualMove(val.x, val.y, val.sprint),
      onActionHoldChange: (action, held) => this.callbacks.onVirtualActionHold(action, held),
      onActionPress: (action) => this.callbacks.onVirtualActionPress(action),
      onDesktopActionComplete: () => this.callbacks.onHudOptionSelected?.(),
    });
    this.touchInputManager.setArenaVisible(true);
    touchMount.appendChild(this.touchInputManager.container);

    this.wireHudEvents();
    this.refreshInitialIcons();
    this.applySettingsAndViewport(initialSettings, initialMetrics);

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocale();
    });
  }

  private wireHudEvents(): void {
    const stopDown = (e: Event) => e.stopPropagation();

    this.muteBtn.addEventListener('pointerdown', stopDown);
    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleMute?.();
      this.callbacks.onHudOptionSelected?.();
    });

    this.editHudBtn.addEventListener('pointerdown', stopDown);
    this.editHudBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onOpenLayoutEditor();
    });

    this.fullMapBtn.addEventListener('pointerdown', stopDown);
    this.fullMapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFullMapOpen(!this.fullMapOpen);
    });

    this.emoteWheelBtn.addEventListener('pointerdown', stopDown);
    this.emoteWheelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onOpenEmoteWheel?.();
    });

    this.settingsGearBtn.addEventListener('pointerdown', stopDown);
    this.settingsGearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setSettingsModalOpen(!this.settingsModalOpen);
    });

    this.activeWeaponCardEl.addEventListener('pointerdown', stopDown);
    this.activeWeaponCardEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.lastUnarmedState) {
        this.callbacks.onVirtualActionPress('slot1');
      } else if (!this.lastUnlimitedAmmoState) {
        this.callbacks.onVirtualActionPress('reload');
      }
      this.callbacks.onHudOptionSelected?.();
    });

    this.quickReloadBtn.addEventListener('pointerdown', stopDown);
    this.quickReloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.lastUnlimitedAmmoState) {
        this.callbacks.onVirtualActionPress('reload');
      }
      this.callbacks.onHudOptionSelected?.();
    });

    this.slotTile1Btn.addEventListener('pointerdown', stopDown);
    this.slotTile1Btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onSelectWeaponSlot) {
        this.callbacks.onSelectWeaponSlot(0);
      } else {
        this.callbacks.onVirtualActionPress('slot1');
      }
      this.callbacks.onHudOptionSelected?.();
    });

    this.slotTile2Btn.addEventListener('pointerdown', stopDown);
    this.slotTile2Btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onSelectWeaponSlot) {
        this.callbacks.onSelectWeaponSlot(1);
      } else {
        this.callbacks.onVirtualActionPress('slot2');
      }
      this.callbacks.onHudOptionSelected?.();
    });

    this.slotTile3Btn.addEventListener('pointerdown', stopDown);
    this.slotTile3Btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onSelectWeaponSlot) {
        this.callbacks.onSelectWeaponSlot(2);
      } else {
        this.callbacks.onVirtualActionPress('slot3');
      }
      this.callbacks.onHudOptionSelected?.();
    });

    this.slotTile4Btn.addEventListener('pointerdown', stopDown);
    this.slotTile4Btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onSelectWeaponSlot) {
        this.callbacks.onSelectWeaponSlot(3);
      } else {
        this.callbacks.onVirtualActionPress('slot4');
      }
      this.callbacks.onHudOptionSelected?.();
    });

    this.slotTileFistsBtn.addEventListener('pointerdown', stopDown);
    this.slotTileFistsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onSelectWeaponSlot) {
        this.callbacks.onSelectWeaponSlot(-1);
      } else {
        this.callbacks.onVirtualActionPress('holster');
      }
      this.callbacks.onHudOptionSelected?.();
    });

    // Weapon Replacement Choice Modal Events
    this.weaponReplaceModalEl.addEventListener('pointerdown', stopDown);
    this.weaponReplaceModalEl.addEventListener('click', (e) => {
      if (e.target === this.weaponReplaceModalEl) {
        this.showWeaponReplacePrompt(null);
        this.callbacks.onCancelWeaponReplace?.();
        return;
      }
      const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-replace-slot]');
      if (!btn || !this.pendingWeaponReplace) return;
      e.stopPropagation();
      const rawSlot = Number(btn.dataset.replaceSlot);
      if (rawSlot === 0 || rawSlot === 1 || rawSlot === 2 || rawSlot === 3) {
        const lootId = this.pendingWeaponReplace.lootInstanceId;
        this.showWeaponReplacePrompt(null);
        this.callbacks.onConfirmWeaponReplace?.(lootId, rawSlot);
      }
    });
    this.weaponReplaceCancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showWeaponReplacePrompt(null);
      this.callbacks.onCancelWeaponReplace?.();
    });

    // Bottom Tactical Tiles
    this.tileMedBtn.addEventListener('pointerdown', stopDown);
    this.tileMedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onVirtualActionPress('useMedkit');
      this.callbacks.onHudOptionSelected?.();
    });

    this.tileSpecBtn.addEventListener('pointerdown', stopDown);
    this.tileSpecBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onVirtualActionPress('useSpecial');
      this.callbacks.onHudOptionSelected?.();
    });

    this.tileGlooBtn.addEventListener('pointerdown', stopDown);
    this.tileGlooBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onVirtualActionPress('glooWall');
      this.callbacks.onHudOptionSelected?.();
    });

    this.tileAbilityBtn.addEventListener('pointerdown', stopDown);
    this.tileAbilityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onVirtualActionPress('ability');
      this.callbacks.onHudOptionSelected?.();
    });

    this.tileBagBtn.addEventListener('pointerdown', stopDown);
    this.tileBagBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setInventoryOpen(!this.inventoryOpen);
    });

    // Pickup prompt
    this.pickupPromptEl.addEventListener('pointerdown', stopDown);
    this.pickupPromptEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onVirtualActionPress('pickup');
      this.callbacks.onHudOptionSelected?.();
    });

    // Spectator buttons
    this.spectatorResultsBtn.addEventListener('click', () => {
      if (this.lastBrResultPayload) {
        this.showBattleRoyaleResultModal(this.lastBrResultPayload);
      } else if (this.lastBrElimPayload) {
        this.showBattleRoyaleEliminationModal(this.lastBrElimPayload);
      }
    });
    this.spectatorLeaveBtn.addEventListener('click', () => {
      if (this.activeHudMode === 'battle-royale') {
        this.callbacks.onBattleRoyaleExitMenu?.();
      } else {
        this.callbacks.onRankedReturnToLobby?.();
      }
    });

    // Match Settings Modal events
    this.matchSettingsModalEl.addEventListener('pointerdown', stopDown);
    this.matchSettingsModalEl.addEventListener('click', (e) => {
      if (e.target === this.matchSettingsModalEl) {
        this.setSettingsModalOpen(false);
      }
    });
    this.settingsCloseBtn.addEventListener('click', () => {
      this.setSettingsModalOpen(false);
    });
    (['en', 'ar', 'es'] as const).forEach((lang) => {
      this.settingsLanguageButtons[lang].addEventListener('click', () => {
        i18n.setLanguage(lang);
        this.callbacks.onSelectLanguage?.(lang);
      });
    });
    (['low', 'medium', 'high'] as const).forEach((preset) => {
      this.qualityButtons[preset].addEventListener('click', () => {
        this.callbacks.onSetQualityPreset?.(preset);
      });
    });
    (['auto', 'manual'] as const).forEach((mode) => {
      this.glooModeButtons[mode].addEventListener('click', () => {
        this.callbacks.onSetGlooPlacementMode?.(mode);
      });
    });

    this.settingsMuteBtn.addEventListener('click', () => {
      this.callbacks.onToggleMute?.();
    });
    this.settingsCamBtn.addEventListener('click', () => {
      this.callbacks.onToggleCameraMode();
    });
    this.settingsCycleMapBtn.addEventListener('click', () => {
      this.setSettingsModalOpen(false);
      this.callbacks.onCycleMap();
    });
    this.settingsNewMatchBtn.addEventListener('click', () => {
      this.setSettingsModalOpen(false);
      this.callbacks.onNewMatch();
    });
    this.settingsHudEditorBtn.addEventListener('click', () => {
      this.setSettingsModalOpen(false);
      this.callbacks.onOpenLayoutEditor();
    });
    this.settingsExitMenuBtn.addEventListener('click', () => {
      this.setSettingsModalOpen(false);
      this.callbacks.onExitToMenu();
    });
  }

  private refreshInitialIcons(): void {
    this.weaponActiveSvgEl.innerHTML = getWeaponSvg('scar', '#f8fafc');
    this.slot1IconEl.innerHTML = getWeaponSvg('scar', '#f8fafc');
    this.slot2IconEl.innerHTML = getEmptyWeaponSlotSvg();
    this.slot3IconEl.innerHTML = getEmptyWeaponSlotSvg();
    this.slot4IconEl.innerHTML = getEmptyWeaponSlotSvg();
    const defaultMedDef: LootItemDefinition = getLootDefinition('med_kit') ?? {
      id: 'med_kit',
      name: 'Med Kit',
      category: 'health',
      rarity: 'uncommon',
      description: '',
      stackable: true,
      maxStack: 4,
      spawnWeight: 1,
      accentHex: '#34d399',
      iconTag: 'MED',
    };
    const defaultSpecDef: LootItemDefinition = getLootDefinition('special_adrenaline') ??
      getLootDefinition('shield_cell') ?? {
        id: 'shield_cell',
        name: 'Shield Cell',
        category: 'shield',
        rarity: 'common',
        description: '',
        stackable: true,
        maxStack: 4,
        spawnWeight: 1,
        accentHex: '#38bdf8',
        iconTag: 'SHD',
      };
    this.tileMedIconEl.innerHTML = getLootItemSvg(defaultMedDef);
    this.tileSpecIconEl.innerHTML = getLootItemSvg(defaultSpecDef);
  }

  private createStatusWidgets(): void {
    const specs: Array<{ id: HudStatusSlotId; trigger: () => void }> = [
      {
        id: 'health',
        trigger: () => {
          this.callbacks.onVirtualActionPress('useMedkit');
          this.callbacks.onHudOptionSelected?.();
        },
      },
      { id: 'armor', trigger: () => this.setInventoryOpen(!this.inventoryOpen) },
      { id: 'helmet', trigger: () => this.setInventoryOpen(!this.inventoryOpen) },
      {
        id: 'ammo',
        trigger: () => {
          this.callbacks.onVirtualActionPress(this.lastUnarmedState ? 'fire' : 'reload');
          this.callbacks.onHudOptionSelected?.();
        },
      },
      {
        id: 'weapon1',
        trigger: () => {
          this.callbacks.onVirtualActionPress('slot1');
          this.callbacks.onHudOptionSelected?.();
        },
      },
      {
        id: 'weapon2',
        trigger: () => {
          this.callbacks.onVirtualActionPress('slot2');
          this.callbacks.onHudOptionSelected?.();
        },
      },
      {
        id: 'medkit',
        trigger: () => {
          this.callbacks.onVirtualActionPress('useMedkit');
          this.callbacks.onHudOptionSelected?.();
        },
      },
      {
        id: 'special',
        trigger: () => {
          this.callbacks.onVirtualActionPress('useSpecial');
          this.callbacks.onHudOptionSelected?.();
        },
      },
    ];

    for (const s of specs) {
      const widget = new HudSlotWidget(s.id, i18n.translateHudSlotLabel(s.id), s.trigger);
      this.hudWidgets.set(s.id, widget);
      this.hudStatusLayerEl.appendChild(widget.element);
    }
  }

  syncCompass(
    yawRad: number,
    playerX = 0,
    playerZ = 0,
    safeCenterX?: number,
    safeCenterZ?: number,
  ): void {
    const rawDeg = ((-yawRad * 180) / Math.PI) % 360;
    const headingDeg = (rawDeg + 360) % 360;
    const roundedDeg = Math.round(headingDeg) % 360;

    if (Math.abs(headingDeg - this.lastCompassDeg) >= 0.35 || this.lastCompassDeg < 0) {
      this.lastCompassDeg = headingDeg;
      const offsetPx = -headingDeg * COMPASS_PX_PER_DEG;
      this.compassTrackEl.style.transform = `translate3d(${offsetPx.toFixed(1)}px, 0, 0)`;
      this.compassDegEl.textContent = `${String(roundedDeg).padStart(3, '0')}°`;
    }

    if (
      this.activeHudMode !== 'practice' &&
      safeCenterX !== undefined &&
      safeCenterZ !== undefined
    ) {
      const dx = safeCenterX - playerX;
      const dz = safeCenterZ - playerZ;
      if (dx * dx + dz * dz > 16) {
        const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        // Wrap bearing within [-180, +180] relative to current heading so it slides across [-120..480] track seamlessly
        let diff = bearing - headingDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        const trackDeg = headingDeg + diff;
        if (Math.abs(trackDeg - this.lastSafeBearingDeg) >= 0.6 || this.lastSafeBearingDeg < -500) {
          this.lastSafeBearingDeg = trackDeg;
          this.compassSafePipEl.style.left = `${(trackDeg * COMPASS_PX_PER_DEG).toFixed(1)}px`;
          this.compassSafePipEl.classList.remove('hidden');
        }
      } else if (this.lastSafeBearingDeg > -500) {
        this.lastSafeBearingDeg = -999;
        this.compassSafePipEl.classList.add('hidden');
      }
    } else if (this.lastSafeBearingDeg > -500) {
      this.lastSafeBearingDeg = -999;
      this.compassSafePipEl.classList.add('hidden');
    }
  }

  setArenaHudMode(mode: 'practice' | 'ranked' | 'battle-royale'): void {
    this.activeHudMode = mode;
    const isMatch = mode !== 'practice';
    if (mode === 'ranked') {
      this.statusZoneTextEl.textContent = i18n.t('hud.zone.ranked');
      this.spectatorLeaveBtn.textContent = i18n.t('hud.spectator.rankedLobbyBtn');
      this.spectatorResultsBtn.classList.add('hidden');
    } else if (mode === 'battle-royale') {
      this.statusZoneTextEl.textContent = i18n.t('hud.zone.br');
      this.spectatorLeaveBtn.textContent = i18n.t('hud.spectator.leaveBtn');
      this.spectatorResultsBtn.classList.remove('hidden');
    } else {
      this.statusZoneTextEl.textContent = i18n.t('hud.zone.practice');
      this.lastRankedAlive = 1;
      this.lastRankedKills = 0;
      this.rankedAliveEl.textContent = '1';
      this.rankedKillsEl.textContent = '0';
      this.spectatorResultsBtn.classList.add('hidden');
    }

    this.settingsPracticeActionsEl.classList.toggle('hidden', isMatch);
    this.settingsCycleMapBtn.classList.toggle('hidden', mode === 'practice');
    this.settingsPracticeActionsEl.classList.toggle('grid-cols-1', mode === 'practice');
    this.settingsPracticeActionsEl.classList.toggle('grid-cols-2', mode !== 'practice');
    this.killFeedEl.classList.toggle('hidden', !isMatch);
    if (!isMatch) {
      this.spectatorBannerEl.classList.add('hidden');
      this.rankedResultModalEl.classList.add('hidden');
      this.zoneWarningEl.classList.add('hidden');
      this.dangerVignetteEl.classList.add('hidden');
      this.lastZoneWarningKey = '';
      this.lastDangerVignetteActive = false;
      this.lastZonePingCueKey = '';
      this.lastRankedZoneState = '';
      this.lastRankedZoneSec = -1;
      this.lastRankedZoneArgs = null;
      this.lastBrElimPayload = null;
      this.lastBrResultPayload = null;
      this.lastRankedResultPayload = null;
      this.activeResultModalKind = null;
      this.lastSpectatorTarget = null;
      this.lastSpectatorIsSquadmate = false;
      this.setSquadmateStatuses([]);
      this.killFeedEntries.length = 0;
      this.killFeedEl.innerHTML = '';
    }
  }

  setRankedMode(active: boolean): void {
    this.setArenaHudMode(active ? 'ranked' : 'practice');
  }

  syncRankedHudState(
    aliveCount: number,
    localKills: number,
    zone: ServerZoneState | null,
    inDangerZone = false,
  ): void {
    const zoneArgs = this.rankedZoneArgsScratch;
    zoneArgs.aliveCount = aliveCount;
    zoneArgs.localKills = localKills;
    zoneArgs.zone = zone;
    zoneArgs.inDangerZone = inDangerZone;
    this.lastRankedZoneArgs = zoneArgs;
    if (this.lastRankedAlive !== aliveCount) {
      this.lastRankedAlive = aliveCount;
      this.rankedAliveEl.textContent = String(aliveCount);
    }
    if (this.lastRankedKills !== localKills) {
      this.lastRankedKills = localKills;
      this.rankedKillsEl.textContent = String(localKills);
    }
    if (!zone) {
      this.lastRankedZoneState = '';
      this.lastRankedZoneSec = -1;
      if (this.lastZoneWarningKey !== '') {
        this.lastZoneWarningKey = '';
        this.zoneWarningEl.classList.add('hidden');
      }
      if (this.lastDangerVignetteActive) {
        this.lastDangerVignetteActive = false;
        this.dangerVignetteEl.classList.add('hidden');
      }
      return;
    }

    const sec = Math.max(0, Math.ceil(zone.timeRemainingSec));
    const lang = i18n.getLanguage();
    if (
      this.lastRankedZoneSec === sec &&
      this.lastRankedZonePhase === zone.phase &&
      this.lastRankedZoneTotalPhases === zone.totalPhases &&
      this.lastRankedZoneState === zone.state &&
      this.lastRankedZoneDps === zone.damagePerSec &&
      this.lastRankedZoneDanger === inDangerZone &&
      this.lastRankedZoneLang === lang
    ) {
      return;
    }
    this.lastRankedZoneSec = sec;
    this.lastRankedZonePhase = zone.phase;
    this.lastRankedZoneTotalPhases = zone.totalPhases;
    this.lastRankedZoneState = zone.state;
    this.lastRankedZoneDps = zone.damagePerSec;
    this.lastRankedZoneDanger = inDangerZone;
    this.lastRankedZoneLang = lang;

    const clockStr = this.formatZoneClock(sec);
    const zoneKey = `${zone.state}:${zone.phase}:${sec}:${inDangerZone ? 1 : 0}`;
    if (this.lastRankedZoneKey !== zoneKey) {
      this.lastRankedZoneKey = zoneKey;
      if (inDangerZone) {
        this.statusZoneTextEl.textContent = i18n.t('hud.zone.dpsBadge', {
          dps: zone.damagePerSec,
        });
        this.statusZoneBadgeEl.className =
          'flex items-center gap-1 text-rose-300 font-black tabular-nums border-r border-white/20 pr-1.5';
      } else if (zone.state === 'shrinking') {
        this.statusZoneTextEl.textContent = i18n.t('hud.zone.phaseClock', {
          phase: zone.phase,
          clock: clockStr,
        });
        this.statusZoneBadgeEl.className =
          'flex items-center gap-1 text-sky-300 tabular-nums border-r border-white/20 pr-1.5';
      } else if (zone.state === 'final') {
        this.statusZoneTextEl.textContent = i18n.t('hud.zone.finalLabel');
        this.statusZoneBadgeEl.className =
          'flex items-center gap-1 text-amber-300 tabular-nums border-r border-white/20 pr-1.5';
      } else {
        this.statusZoneTextEl.textContent = clockStr;
        this.statusZoneBadgeEl.className =
          sec <= 15
            ? 'flex items-center gap-1 text-amber-300 tabular-nums border-r border-white/20 pr-1.5'
            : 'flex items-center gap-1 text-sky-300 tabular-nums border-r border-white/20 pr-1.5';
      }
    }

    const fullZoneText =
      zone.state === 'shrinking'
        ? i18n.t('hud.zone.fullShrinking', {
            phase: zone.phase,
            total: zone.totalPhases,
            clock: clockStr,
            dps: zone.damagePerSec,
          })
        : zone.state === 'final'
          ? i18n.t('hud.zone.fullFinal', { dps: zone.damagePerSec })
          : i18n.t('hud.zone.fullMovesIn', {
              phase: zone.phase,
              total: zone.totalPhases,
              clock: clockStr,
              dps: zone.damagePerSec,
            });
    if (this.lastFullMapZoneKey !== fullZoneText) {
      this.lastFullMapZoneKey = fullZoneText;
      this.fullMapZoneEl.textContent = fullZoneText;
    }

    if (this.lastDangerVignetteActive !== inDangerZone) {
      this.lastDangerVignetteActive = inDangerZone;
      this.dangerVignetteEl.classList.toggle('hidden', !inDangerZone);
    }

    let warnKey = '';
    if (inDangerZone) {
      warnKey = `DANGER:${zone.damagePerSec}`;
      if (this.lastZoneWarningKey !== warnKey) {
        this.lastZoneWarningKey = warnKey;
        this.setZoneWarningBanner(
          i18n.t('hud.zone.warningOutside', { dps: zone.damagePerSec }),
          'border-rose-500/85 text-rose-200',
        );
      }
    } else if (zone.state === 'waiting' && sec > 0 && sec <= 15) {
      warnKey = `PRE:${zone.phase}:${sec}`;
      if (this.lastZoneWarningKey !== warnKey) {
        this.lastZoneWarningKey = warnKey;
        this.setZoneWarningBanner(
          i18n.t('hud.zone.warningClosingSec', { sec }),
          'border-amber-400/85 text-amber-200',
        );
      }
      if (sec === 10 || sec === 5 || sec === 3 || sec === 1) {
        const cueKey = `pre:${zone.phase}:${sec}`;
        if (this.lastZonePingCueKey !== cueKey) {
          this.lastZonePingCueKey = cueKey;
          this.callbacks.onZoneWarningPing?.();
        }
      }
    } else if (zone.state === 'shrinking') {
      warnKey = `SHRINK:${zone.phase}:${sec}`;
      if (this.lastZoneWarningKey !== warnKey) {
        this.lastZoneWarningKey = warnKey;
        this.setZoneWarningBanner(
          i18n.t('hud.zone.warningShrinking', { clock: clockStr }),
          'border-rose-500/80 text-white',
        );
      }
      const shrinkCueKey = `shrink:${zone.phase}`;
      if (this.lastZonePingCueKey !== shrinkCueKey) {
        this.lastZonePingCueKey = shrinkCueKey;
        this.callbacks.onZoneWarningPing?.();
      }
    } else if (this.lastZoneWarningKey !== '') {
      this.lastZoneWarningKey = '';
      this.zoneWarningEl.classList.add('hidden');
    }
  }

  private setZoneWarningBanner(text: string, borderAndTextClass: string): void {
    this.zoneWarningEl.innerHTML = `<span class="w-4 h-4 flex items-center justify-center shrink-0">${getZoneWarningTriangleSvg()}</span><span>${this.escapeHud(text)}</span>`;
    this.zoneWarningEl.className = `pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-sm bg-slate-950/78 border ${borderAndTextClass} text-[10px] sm:text-[11px] font-black tracking-[0.12em] uppercase tabular-nums whitespace-nowrap flex items-center gap-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.65)]`;
  }

  pushRankedKillFeed(entry: KillFeedEntry): void {
    this.killFeedEntries.unshift(entry);
    if (this.killFeedEntries.length > 4) {
      this.killFeedEntries.length = 4;
    }
    this.renderKillFeed();
  }

  private renderKillFeed(): void {
    const hsLabel = i18n.t('hud.killfeed.hsTag').trim();
    this.killFeedEl.innerHTML = this.killFeedEntries
      .map((k) => {
        const hs = k.isHeadshot ? ` [${hsLabel}]` : '';
        const weapon = i18n.translateWeaponName(k.weaponName);
        return `
          <div class="bg-slate-950/72 border border-white/15 px-2 py-0.5 rounded-sm text-[9px] sm:text-[10px] font-bold tracking-wide text-slate-200 flex items-center gap-1 truncate">
            <span class="text-orange-300 truncate">${this.escapeHud(k.killerName)}</span>
            <span class="text-slate-400 shrink-0">▸ ${this.escapeHud(weapon)}${hs} ▸</span>
            <span class="text-rose-300 truncate">${this.escapeHud(k.victimName)}</span>
          </div>
        `;
      })
      .join('');
  }

  setSquadmateStatuses(statuses: ReadonlyArray<SquadmateHudStatus>): void {
    if (statuses.length === 0) {
      if (this.lastSquadHudKey !== '') {
        this.lastSquadHudKey = '';
        this.lastSquadStatuses = [];
        this.squadHudListEl.innerHTML = '';
        this.squadHudListEl.classList.add('hidden');
      }
      return;
    }

    let key = `${i18n.getLanguage()}|`;
    for (let i = 0; i < statuses.length; i++) {
      const s = statuses[i];
      const hp = Math.max(0, Math.round(s.health));
      const maxHp = Math.max(1, Math.round(s.maxHealth));
      const sh = Math.max(0, Math.round(s.shield));
      const maxSh = Math.max(1, Math.round(s.maxShield));
      key += `${s.id}:${s.isAlive ? 1 : 0}:${hp}/${maxHp}:${sh}/${maxSh}|`;
    }
    if (key === this.lastSquadHudKey) return;
    this.lastSquadHudKey = key;

    this.lastSquadStatuses = statuses.map((s) => ({ ...s }));
    const koLabel = i18n.t('hud.squad.ko');
    this.squadHudListEl.innerHTML = statuses
      .map((s) => {
        const hp = Math.max(0, Math.round(s.health));
        const maxHp = Math.max(1, Math.round(s.maxHealth));
        const sh = Math.max(0, Math.round(s.shield));
        const maxSh = Math.max(1, Math.round(s.maxShield));
        const hpPct = s.isAlive ? Math.min(100, Math.round((hp / maxHp) * 100)) : 0;
        const shPct = s.isAlive ? Math.min(100, Math.round((sh / maxSh) * 100)) : 0;
        const borderCls = s.isAlive ? 'border-emerald-400/55' : 'border-rose-500/45 opacity-70';
        const dotCls = s.isAlive ? 'bg-emerald-400' : 'bg-rose-500';
        const statusText = s.isAlive ? `${hp}` : koLabel;
        const statusCls = s.isAlive ? 'text-emerald-200' : 'text-rose-300';
        return `
          <div class="bg-slate-950/72 border ${borderCls} rounded-sm px-2 py-1 flex flex-col gap-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
            <div class="flex items-center justify-between gap-1.5 text-[9px] sm:text-[10px] font-black tracking-wide leading-none">
              <span class="flex items-center gap-1 min-w-0">
                <span class="w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}"></span>
                <span class="text-white truncate">${this.escapeHud(s.name)}</span>
              </span>
              <span class="tabular-nums shrink-0 ${statusCls}">${statusText}</span>
            </div>
            <div class="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-400 transition-[width] duration-100" style="width:${hpPct}%"></div>
            </div>
            <div class="w-full h-[2px] bg-slate-900 rounded-full overflow-hidden">
              <div class="h-full bg-sky-400 transition-[width] duration-100" style="width:${shPct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
    this.squadHudListEl.classList.remove('hidden');
  }

  showRankedSpectatorBanner(targetName: string | null, isSquadmate = false): void {
    this.lastSpectatorTarget = targetName;
    this.lastSpectatorIsSquadmate = isSquadmate;
    this.spectatorBannerEl.classList.toggle('border-emerald-400/70', isSquadmate);
    this.spectatorBannerEl.classList.toggle('border-rose-500/60', !isSquadmate);
    this.spectatorTextEl.classList.toggle('text-emerald-300', isSquadmate);
    this.spectatorTextEl.classList.toggle('text-rose-300', !isSquadmate);
    this.spectatorTextEl.textContent = targetName
      ? i18n.t(
          isSquadmate ? 'hud.spectator.squadBanner' : 'hud.spectator.eliminatedBanner',
          { name: targetName },
        )
      : i18n.t('hud.spectator.concluding');
    this.spectatorBannerEl.classList.remove('hidden');
  }

  setLocalPlayerCosmetics(username: string, avatarId: string): void {
    const cleanName = (username || 'OPERATOR').trim().slice(0, 18) || 'OPERATOR';
    const def = getAvatarById(avatarId);
    const nextAvatarId = def.id;
    const avatarChanged = nextAvatarId !== this.localAvatarId;
    this.localCallsign = cleanName;
    this.localAvatarId = nextAvatarId;
    this.bottomCallsignEl.textContent = cleanName;
    if (avatarChanged || !this.bottomAvatarEl.innerHTML) {
      this.bottomAvatarEl.innerHTML = getAvatarSvg(nextAvatarId, 'w-full h-full');
      this.bottomAvatarEl.style.borderColor = def.accentHex;
    }
  }

  showRankedResultModal(result: RankedMatchResultPayload): void {
    this.lastRankedResultPayload = result;
    this.activeResultModalKind = 'ranked';
    this.spectatorBannerEl.classList.add('hidden');
    const spec = getRankTierSpec(result.rpAfter);
    const avatarDef = getAvatarById(this.localAvatarId);
    const deltaStr = result.rpDelta >= 0 ? `+${result.rpDelta}` : `${result.rpDelta}`;
    const deltaColor = result.rpDelta >= 0 ? 'text-emerald-300' : 'text-rose-400';
    const title = result.isWinner
      ? i18n.t('result.br.victoryTitle')
      : i18n.t('hud.result.eliminatedNum', { rank: result.placement });
    const titleColor = result.isWinner ? 'text-amber-300' : 'text-sky-300';

    this.rankedResultContentEl.innerHTML = `
      <div class="text-center border-b border-slate-800 pb-4">
        <div class="text-[11px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('hud.result.rankedHeader')} · ${i18n.translateMapName(result.mapId)}</div>
        <div class="mx-auto mt-2.5 w-14 h-14 rounded-lg overflow-hidden border-2 shadow-lg" style="border-color:${avatarDef.accentHex}">
          ${getAvatarSvg(this.localAvatarId, 'w-full h-full')}
        </div>
        <h3 class="text-2xl sm:text-3xl font-black tracking-[0.12em] uppercase mt-2 ${titleColor}">${title}</h3>
        <div class="text-xs font-bold text-slate-300 mt-1.5">
          ${i18n.t('hud.result.winnerLabel')}: <span data-role="ranked-winner-name" class="text-amber-300 font-black">${this.escapeHud(result.winnerName)}</span>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2.5 text-center">
        <div class="bg-slate-900 border border-slate-800 rounded p-3">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.placement')}</div>
          <div class="text-lg font-black text-white tabular-nums mt-0.5">#${result.placement} / ${result.totalPlayers}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-3">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.kills')}</div>
          <div class="text-lg font-black text-orange-300 tabular-nums mt-0.5">${result.kills}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-3">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.damage')}</div>
          <div class="text-lg font-black text-sky-300 tabular-nums mt-0.5">${result.damage}</div>
        </div>
      </div>

      <div class="bg-slate-900/90 border rounded p-3 flex items-center justify-between" style="border-color:${spec.colorHex}">
        <div>
          <div class="text-[10px] font-bold uppercase text-slate-400">${i18n.t('hud.result.rankProgression')}</div>
          <div class="text-base font-black uppercase" style="color:${spec.colorHex}">${i18n.translateRankTier(result.tierAfter)} · ${result.rpAfter} RP</div>
        </div>
        <div class="text-xl font-black tabular-nums ${deltaColor}">${deltaStr} RP</div>
      </div>

      <button
        type="button"
        data-action="ranked-return"
        class="nexus-btn-primary w-full py-3 rounded text-xs font-black tracking-[0.18em] uppercase min-h-[44px] whitespace-nowrap"
      >${i18n.t('result.btn.returnLobby')}</button>
    `;

    this.rankedResultModalEl.classList.remove('hidden');
    this.rankedResultContentEl
      .querySelector('[data-action="ranked-return"]')
      ?.addEventListener('click', () => {
        this.activeResultModalKind = null;
        this.rankedResultModalEl.classList.add('hidden');
        this.callbacks.onRankedReturnToLobby?.();
      });
  }

  updateRankedMatchWinner(winnerName: string): void {
    if (this.lastRankedResultPayload) {
      this.lastRankedResultPayload.winnerName = winnerName;
    }
    const el = this.rankedResultContentEl.querySelector<HTMLElement>('[data-role="ranked-winner-name"]');
    if (el) {
      el.textContent = winnerName;
    }
  }

  showBattleRoyaleEliminationModal(payload: BattleRoyaleEliminationPayload): void {
    this.lastBrElimPayload = payload;
    this.activeResultModalKind = 'br-elim';
    const avatarDef = getAvatarById(this.localAvatarId);
    const mins = Math.floor(payload.survivedSec / 60);
    const secs = String(payload.survivedSec % 60).padStart(2, '0');

    this.rankedResultContentEl.innerHTML = `
      <div class="text-center border-b border-slate-800 pb-4">
        <div class="text-[11px] font-extrabold tracking-widest uppercase text-slate-400">
          ${i18n.t('hud.result.brHeader')} · ${i18n.translateMapName(payload.mapId)} · ${i18n.translateDifficulty(payload.difficulty)}
        </div>
        <div class="mx-auto mt-2.5 w-14 h-14 rounded-lg overflow-hidden border-2 shadow-lg" style="border-color:${avatarDef.accentHex}">
          ${getAvatarSvg(this.localAvatarId, 'w-full h-full')}
        </div>
        <h3 class="text-2xl sm:text-3xl font-black tracking-[0.12em] uppercase mt-2 text-rose-400">
          ${i18n.t('result.br.defeatTitle')}
        </h3>
        <div class="text-sm font-black tracking-wider text-white mt-1 tabular-nums">
          ${i18n.t('hud.result.rankOf', { rank: payload.placement, total: payload.totalFighters })}
        </div>
        <div class="text-xs font-semibold text-slate-300 mt-1.5">
          ${i18n.t('hud.result.elimByLine', {
            killer: `<span class="text-orange-300 font-bold">${this.escapeHud(i18n.translateCombatActor(payload.killerName))}</span>`,
            weapon: `<span class="text-slate-200">${this.escapeHud(i18n.translateWeaponName(payload.weaponName))}</span>`,
          })}
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.placement')}</div>
          <div class="text-base font-black text-white tabular-nums mt-0.5">#${payload.placement} / ${payload.totalFighters}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.kills')}</div>
          <div class="text-base font-black text-orange-300 tabular-nums mt-0.5">${payload.kills}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.damage')}</div>
          <div class="text-base font-black text-sky-300 tabular-nums mt-0.5">${payload.damage}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.survived')}</div>
          <div class="text-base font-black text-emerald-300 tabular-nums mt-0.5">${mins}:${secs}</div>
        </div>
      </div>

      <div class="bg-slate-900/90 border border-slate-700/80 rounded px-3.5 py-2.5 flex items-center justify-between gap-3">
        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">${i18n.t('hud.result.continuesUntil1')}</span>
        <span class="text-xs font-black tabular-nums text-amber-300">
          ${i18n.t('hud.result.aliveCount', {
            alive: `<span data-role="br-alive-remaining">${payload.aliveRemaining}</span>`,
          })}
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          data-action="br-again"
          class="nexus-btn-primary py-3 px-4 rounded text-xs font-black tracking-[0.12em] uppercase min-h-[44px] whitespace-nowrap"
        >${i18n.t('result.btn.playAgain')}</button>
        <button
          type="button"
          data-action="br-spectate"
          class="nexus-btn-secondary py-3 px-4 rounded text-xs font-black tracking-[0.12em] uppercase min-h-[44px] whitespace-nowrap"
        >${i18n.t('hud.result.spectateBtn')}</button>
        <button
          type="button"
          data-action="br-menu"
          class="nexus-btn-secondary py-3 px-4 rounded text-xs font-black tracking-[0.12em] uppercase min-h-[44px] whitespace-nowrap"
        >${i18n.t('result.btn.exitMenu')}</button>
      </div>
    `;

    this.rankedResultModalEl.classList.remove('hidden');
    this.rankedResultContentEl
      .querySelector('[data-action="br-again"]')
      ?.addEventListener('click', () => {
        this.activeResultModalKind = null;
        this.rankedResultModalEl.classList.add('hidden');
        this.callbacks.onBattleRoyalePlayAgain?.();
      });
    this.rankedResultContentEl
      .querySelector('[data-action="br-spectate"]')
      ?.addEventListener('click', () => {
        this.activeResultModalKind = null;
        this.rankedResultModalEl.classList.add('hidden');
      });
    this.rankedResultContentEl
      .querySelector('[data-action="br-menu"]')
      ?.addEventListener('click', () => {
        this.activeResultModalKind = null;
        this.rankedResultModalEl.classList.add('hidden');
        this.callbacks.onBattleRoyaleExitMenu?.();
      });
  }

  updateBattleRoyaleAliveCount(aliveRemaining: number): void {
    if (this.lastBrElimPayload) {
      this.lastBrElimPayload.aliveRemaining = aliveRemaining;
    }
    const el = this.rankedResultContentEl.querySelector<HTMLElement>('[data-role="br-alive-remaining"]');
    if (el) {
      el.textContent = String(aliveRemaining);
    }
  }

  showBattleRoyaleResultModal(result: BattleRoyaleResultPayload): void {
    this.spectatorBannerEl.classList.add('hidden');
    this.lastBrResultPayload = result;
    this.activeResultModalKind = 'br-result';
    const mins = Math.floor(result.survivedSec / 60);
    const secs = String(result.survivedSec % 60).padStart(2, '0');
    const elimAttribution =
      !result.isWinner && result.eliminatedBy
        ? i18n.t('hud.result.elimByLine', {
            killer: this.escapeHud(i18n.translateCombatActor(result.eliminatedBy)),
            weapon: result.eliminatedWeapon
              ? this.escapeHud(i18n.translateWeaponName(result.eliminatedWeapon))
              : '—',
          })
        : i18n.t('hud.result.outlastedLine', {
            outlasted: Math.max(0, result.totalFighters - 1),
            total: result.totalFighters,
          });

    this.rankedResultContentEl.innerHTML = `
      <div class="text-center border-b border-slate-800 pb-4">
        <div class="text-[11px] font-extrabold tracking-widest uppercase text-slate-400">
          ${i18n.t('hud.result.lastBotStanding')} · ${i18n.translateMapName(result.mapId)} · ${i18n.translateDifficulty(result.difficulty)}
        </div>

        <div class="mx-auto mt-2.5 w-14 h-14 rounded-lg overflow-hidden border-2 shadow-lg" style="border-color:${
          result.isWinner ? '#facc15' : getAvatarById(this.localAvatarId).accentHex
        }">
          ${getAvatarSvg(this.localAvatarId, 'w-full h-full')}
        </div>

        <h3 class="text-3xl font-black tracking-[0.14em] uppercase mt-2 ${
          result.isWinner ? 'text-amber-300' : 'text-white'
        }">
          ${result.isWinner ? i18n.t('hud.result.winnerTitle') : i18n.t('hud.result.matchWinnerTitle')}
        </h3>
        <div class="text-sm font-black tracking-wider uppercase mt-1 ${
          result.isWinner ? 'text-emerald-300' : 'text-amber-300'
        }">
          ${
            result.isWinner
              ? `${this.escapeHud(result.playerName)} · ${i18n.t('hud.result.brWinnerBanner')}`
              : `${this.escapeHud(result.winnerName)} · ${i18n.t('hud.result.lastBotStanding')}`
          }
        </div>
        <div class="text-xs font-medium text-slate-400 mt-1.5">${elimAttribution}</div>
      </div>

      ${
        !result.isWinner
          ? `<div class="bg-amber-500/10 border border-amber-400/50 rounded px-4 py-2.5 flex items-center justify-between gap-3">
              <div>
                <div class="text-[10px] font-extrabold tracking-wider uppercase text-amber-300/80">${i18n.t('hud.result.champion')}</div>
                <div class="text-base font-black tracking-wide text-amber-200 uppercase">${this.escapeHud(result.winnerName)}</div>
              </div>
              <div class="text-right tabular-nums">
                <div class="text-[10px] font-extrabold tracking-wider uppercase text-amber-300/80">${i18n.t('hud.result.botKills')}</div>
                <div class="text-base font-black text-amber-300">${result.winnerKills}</div>
              </div>
            </div>`
          : ''
      }

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.placement')}</div>
          <div class="text-base font-black text-white tabular-nums mt-0.5">#${result.placement} / ${result.totalFighters}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.kills')}</div>
          <div class="text-base font-black text-orange-300 tabular-nums mt-0.5">${result.kills}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.damage')}</div>
          <div class="text-base font-black text-sky-300 tabular-nums mt-0.5">${result.damage}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('result.stat.survived')}</div>
          <div class="text-base font-black text-emerald-300 tabular-nums mt-0.5">${mins}:${secs}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          data-action="br-again"
          class="nexus-btn-primary py-3 px-4 rounded text-xs font-black tracking-[0.14em] uppercase min-h-[44px] whitespace-nowrap"
        >${i18n.t('result.btn.playAgain')}</button>
        <button
          type="button"
          data-action="br-menu"
          class="nexus-btn-secondary py-3 px-4 rounded text-xs font-black tracking-[0.14em] uppercase min-h-[44px] whitespace-nowrap"
        >${i18n.t('result.btn.exitMenu')}</button>
      </div>
    `;

    this.rankedResultModalEl.classList.remove('hidden');
    this.rankedResultContentEl
      .querySelector('[data-action="br-again"]')
      ?.addEventListener('click', () => {
        this.activeResultModalKind = null;
        this.rankedResultModalEl.classList.add('hidden');
        this.callbacks.onBattleRoyalePlayAgain?.();
      });
    this.rankedResultContentEl
      .querySelector('[data-action="br-menu"]')
      ?.addEventListener('click', () => {
        this.activeResultModalKind = null;
        this.rankedResultModalEl.classList.add('hidden');
        this.callbacks.onBattleRoyaleExitMenu?.();
      });
  }

  private escapeHud(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  setMapName(_mapName: string): void {
    // Minimap renders active map name directly inside corner overlay
  }

  private formatZoneClock(totalSec: number): string {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private computeCornerMinimapSize(metrics: ViewportMetrics): number {
    return clamp(Math.round(Math.min(metrics.width * 0.145, metrics.height * 0.24)), 68, 124);
  }

  private computeFullMapSize(metrics: ViewportMetrics): number {
    const availW = metrics.width - metrics.safeInsets.left - metrics.safeInsets.right - 56;
    const availH = metrics.height - metrics.safeInsets.top - metrics.safeInsets.bottom - 124;
    return clamp(Math.floor(Math.min(availW, availH)), 176, 520);
  }

  syncMinimap(snapshot: MinimapSnapshot): void {
    this.minimap.render(snapshot);
    if (this.fullMapOpen) {
      this.fullMapMinimap.render(snapshot);
    }
  }

  syncAirdrop(snap: AirplaneDropSnapshot): void {
    this.airdropOverlay.sync(snap);
    const airborne =
      snap.phase === 'airplane' || snap.phase === 'freefall' || snap.phase === 'parachute';

    if (airborne !== this.airborneActive) {
      this.airborneActive = airborne;
      this.crosshairContainerEl.style.display = airborne ? 'none' : 'flex';
      this.topRightClusterEl.style.display = airborne ? 'none' : 'flex';
      this.bottomHudBarEl.style.display = airborne ? 'none' : 'flex';
      this.hudStatusLayerEl.style.display = !airborne && this.showTouchControls ? 'block' : 'none';
      if (airborne) {
        this.scopeOverlay.hideImmediate();
        this.pickupPromptEl.classList.add('hidden');
        this.hitmarkerEl.style.opacity = '0';
        this.damageReadoutEl.style.opacity = '0';
        if (this.inventoryOpen) {
          this.setInventoryOpen(false);
        }
        if (this.settingsModalOpen) {
          this.setSettingsModalOpen(false);
        }
      }
    }

    if (snap.phase === 'airplane' || snap.phase === 'freefall' || snap.phase === 'parachute') {
      this.touchInputManager.setAirbornePhase(snap.phase);
    } else {
      this.touchInputManager.setAirbornePhase('ground');
    }

    if (snap.phase !== 'waiting' && this.lastWaitingKey !== '0') {
      this.lastWaitingKey = '0';
      this.waitingBannerEl.classList.add('hidden');
    }
  }

  syncWaitingArena(
    snap: AirplaneDropSnapshot,
    modeLabel: string,
    participantCount: number,
  ): void {
    const wa = this.waitingArgsScratch;
    wa.snap = snap;
    wa.modeLabel = modeLabel;
    wa.participantCount = participantCount;
    this.lastWaitingArgs = wa as {
      snap: AirplaneDropSnapshot;
      modeLabel: string;
      participantCount: number;
    };
    const isWaiting = snap.phase === 'waiting';
    if (!isWaiting) {
      if (this.lastWaitingKey !== '0') {
        this.lastWaitingKey = '0';
        this.waitingBannerEl.classList.add('hidden');
      }
      return;
    }

    const sec = Math.max(0, Math.ceil(snap.waitingRemainingSec));
    const pct = clamp(
      (snap.waitingRemainingSec / Math.max(1, snap.waitingDurationSec)) * 100,
      0,
      100,
    );
    const key = `1:${sec}:${snap.mapName}:${modeLabel}:${participantCount}:${i18n.getLanguage()}`;
    if (this.lastWaitingKey === key) return;
    this.lastWaitingKey = key;

    this.waitingBannerEl.classList.remove('hidden');
    this.zoneWarningEl.classList.add('hidden');
    this.statusZoneTextEl.textContent = i18n.t('hud.waiting.timerShort', { sec });
    this.rankedAliveEl.textContent = String(participantCount);
    this.waitingTitleEl.textContent = i18n.t('hud.waiting.bannerTitle', {
      map: i18n.translateMapName(snap.mapName),
    });
    this.waitingMetaEl.textContent = i18n.t('hud.waiting.bannerMeta', {
      count: participantCount,
      mode: modeLabel,
    });
    this.waitingCountdownEl.textContent = i18n.t('common.secondsShort', { s: sec });
    this.waitingCountdownEl.className =
      sec <= 5
        ? 'text-lg font-black text-rose-400 tabular-nums leading-none'
        : 'text-lg font-black text-amber-300 tabular-nums leading-none';
    this.waitingBarEl.style.width = `${pct.toFixed(1)}%`;
  }

  setFps(fps: number): void {
    if (this.lastFps === fps) return;
    this.lastFps = fps;
    this.fpsEl.textContent = i18n.t('hud.fps', { fps });
  }

  setCameraModeLabel(mode: 'PLAYER' | 'ORBIT'): void {
    this.currentCameraModeLabel = mode;
    this.settingsCamBtn.textContent = i18n.t('hud.settings.camLabel', {
      mode: i18n.t(`hud.camMode.${mode}`),
    });
  }

  setAiming(aiming: boolean): void {
    if (this.isAiming !== aiming) {
      this.isAiming = aiming;
      this.touchInputManager.setToggleState('aim', aiming);
    }
  }

  setScopeAvailable(available: boolean): void {
    if (this.lastScopeAvailable === available) return;
    this.lastScopeAvailable = available;
    this.touchInputManager.setButtonAvailable('aim', available);
  }

  setUnarmedState(unarmed: boolean, hasStoredWeapons = false): void {
    if (this.lastUnarmedState === unarmed && this.lastHasStoredWeapons === hasStoredWeapons) {
      return;
    }
    this.lastUnarmedState = unarmed;
    this.lastHasStoredWeapons = hasStoredWeapons;
    this.touchInputManager.setUnarmedMode(unarmed, hasStoredWeapons);
    this.updateSlotTileHighlights();
  }

  private updateSlotTileHighlights(): void {
    const slotIdx = this.glooHeldActive ? -2 : (this.lastUnarmedState ? -1 : this.statusState.activeSlotIndex);
    const activeCls =
      'relative h-8 sm:h-11 rounded-sm bg-slate-900/85 border border-amber-400 px-0.5 py-0.5 flex flex-col items-center justify-between overflow-hidden shadow-[0_0_8px_rgba(251,191,36,0.28)] transition-colors';
    const idleCls =
      'relative h-8 sm:h-11 rounded-sm bg-slate-950/62 border border-white/25 hover:border-white/55 px-0.5 py-0.5 flex flex-col items-center justify-between overflow-hidden transition-colors';
    this.slotTile1Btn.className = slotIdx === 0 ? activeCls : idleCls;
    this.slotTile2Btn.className = slotIdx === 1 ? activeCls : idleCls;
    this.slotTile3Btn.className = slotIdx === 2 ? activeCls : idleCls;
    this.slotTile4Btn.className = slotIdx === 3 ? activeCls : idleCls;
    this.slotTileFistsBtn.className = slotIdx === -1 ? activeCls : idleCls;
  }

  syncScopeOverlay(state: ScopeOverlayState): void {
    if (
      this.airborneActive ||
      this.inventoryOpen ||
      this.fullMapOpen ||
      this.settingsModalOpen ||
      this.pendingWeaponReplace !== null
    ) {
      this.scopeOverlay.hideImmediate();
      if (this.lastReticleOpacity !== '1') {
        this.lastReticleOpacity = '1';
        this.crosshairReticleEl.style.opacity = '1';
      }
      return;
    }
    this.scopeOverlay.sync(state);
    const nextOp = state.scopeBlend > 0.36 ? '0' : '1';
    if (this.lastReticleOpacity !== nextOp) {
      this.lastReticleOpacity = nextOp;
      this.crosshairReticleEl.style.opacity = nextOp;
    }
  }

  setCrosshairEnemyTargeted(targeted: boolean): void {
    if (this.lastCrosshairEnemyTargeted === targeted) return;
    this.lastCrosshairEnemyTargeted = targeted;
    const color = targeted ? '#ef4444' : '#ffffff';
    this.crosshairRingEl.setAttribute('stroke', color);
    this.crosshairDotEl.setAttribute('fill', color);
    this.crosshairCenterSvgEl.style.filter = targeted
      ? 'drop-shadow(0 0 3px rgba(239, 68, 68, 0.72))'
      : 'drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9))';
  }

  syncWeaponState(deltaSeconds: number, snap: WeaponHudSnapshot): void {
    this.lastWeaponSnapshot = snap;
    if (
      this.lastHitmarkerActive !== snap.hitmarkerActive ||
      (snap.hitmarkerActive && this.lastHitmarkerHeadshot !== snap.hitmarkerHeadshot)
    ) {
      this.lastHitmarkerActive = snap.hitmarkerActive;
      this.lastHitmarkerHeadshot = snap.hitmarkerHeadshot;
      if (snap.hitmarkerActive) {
        this.hitmarkerEl.style.opacity = '1';
        this.hitmarkerEl.className = `pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-75 ${
          snap.hitmarkerHeadshot ? 'text-orange-400' : 'text-white'
        }`;
      } else {
        this.hitmarkerEl.style.opacity = '0';
      }
    }

    const firingNow = Boolean(snap.isFiring);
    if (this.lastFiringState !== firingNow) {
      this.lastFiringState = firingNow;
      this.weaponFireDotEl.classList.toggle('hidden', !firingNow);
      this.activeWeaponCardEl.style.borderColor = firingNow
        ? 'rgba(251, 191, 36, 0.92)'
        : 'rgba(255, 255, 255, 0.25)';
    }

    if (snap.lastHit && snap.hitmarkerActive) {
      const h = snap.lastHit;
      if (this.activeHudMode === 'practice' && h !== this.lastBurstHitRef) {
        this.lastBurstHitRef = h;
        const nowMs = performance.now();
        const tKey = h.targetId ?? h.targetName;
        if (tKey === this.burstTargetKey && nowMs - this.burstLastHitTimeMs <= 1600) {
          this.burstDamageTotal += h.damageResult.totalDamage;
        } else {
          this.burstTargetKey = tKey;
          this.burstDamageTotal = h.damageResult.totalDamage;
        }
        this.burstLastHitTimeMs = nowMs;
      }
      const burstRounded =
        this.activeHudMode === 'practice' && this.burstDamageTotal > h.damageResult.totalDamage
          ? Math.round(this.burstDamageTotal)
          : 0;
      const dmgKey = `1:${h.damageResult.totalDamage}:${h.damageResult.isHeadshot ? 1 : 0}:${Math.round(h.distance)}:${h.damageResult.rangeBand}:${burstRounded}:${i18n.getLanguage()}`;
      if (dmgKey !== this.lastDmgKey) {
        this.lastDmgKey = dmgKey;
        const critTag = h.damageResult.isHeadshot
          ? i18n.t('hud.hit.headshot')
          : i18n.t('hud.hit.hit');
        const bandLabel = i18n.t(`hud.rangeBand.${h.damageResult.rangeBand}`);
        const basePopup = i18n.t('hud.damagePopup', {
          dmg: h.damageResult.totalDamage,
          tag: critTag,
          dist: Math.round(h.distance),
          band: bandLabel,
        });
        this.damageReadoutEl.textContent =
          burstRounded > 0 ? `${basePopup} · ${burstRounded}Σ` : basePopup;
        this.damageReadoutEl.className = `pointer-events-none fixed top-[54%] left-1/2 -translate-x-1/2 z-20 text-[11px] font-extrabold tracking-wider uppercase tabular-nums ${
          h.damageResult.isHeadshot ? 'text-orange-400' : 'text-sky-300'
        }`;
        this.damageReadoutEl.style.opacity = '1';
      }
    } else if (this.lastDmgKey !== '0') {
      this.lastDmgKey = '0';
      this.damageReadoutEl.style.opacity = '0';
    }

    const isUnarmedNow = snap.weaponType === 'NONE';
    const isMeleeNow = snap.weaponType === 'MELEE';
    if (this.lastCrosshairUnarmed !== (isUnarmedNow || isMeleeNow)) {
      this.lastCrosshairUnarmed = isUnarmedNow || isMeleeNow;
      this.crosshairCenterSvgEl.style.opacity = isUnarmedNow || isMeleeNow ? '0.62' : '1';
    }

    const punchCdQ = isUnarmedNow || isMeleeNow ? Math.round((snap.punchCooldownRatio ?? 0) * 20) : 0;
    const isUnlimited = Boolean(snap.unlimitedAmmo);
    if (this.lastUnlimitedAmmoState !== isUnlimited) {
      this.lastUnlimitedAmmoState = isUnlimited;
      this.touchInputManager.setUnlimitedAmmoMode(isUnlimited);
      this.quickReloadBtn.classList.toggle('hidden', isUnlimited);
    }
    const weaponKey = `${snap.activeSlotIndex}|${snap.weaponId ?? ''}|${snap.weaponName}|${snap.weaponType}|${snap.ammoInMagazine}|${snap.reserveAmmo}|${snap.isReloading ? 1 : 0}|${punchCdQ}|${isUnlimited ? 1 : 0}`;
    if (weaponKey !== this.lastWeaponKey) {
      this.lastWeaponKey = weaponKey;
      this.statusState.activeSlotIndex =
        snap.activeSlotIndex >= 0 && snap.activeSlotIndex <= 3
          ? (snap.activeSlotIndex as WeaponSlotIndex)
          : 0;
      this.statusState.isUnarmed = isUnarmedNow;
      this.statusState.isMeleeActive = isMeleeNow;
      this.statusState.activeWeaponId = snap.weaponId;
      this.statusState.activeAmmoType =
        isUnarmedNow || isMeleeNow ? null : (snap.weaponType as AmmoType);
      this.statusState.activeAmmoInMag = snap.ammoInMagazine;
      this.statusState.activeAmmoReserve = snap.reserveAmmo;
      this.statusState.isReloading = snap.isReloading;
      this.statusState.punchCooldownRatio = snap.punchCooldownRatio ?? 0;
      this.statusState.unlimitedAmmo = isUnlimited;
      this.hudWidgets.get('ammo')?.syncState(this.statusState);

      if (isUnarmedNow) {
        this.weaponAmmoMagEl.textContent = '∞';
        this.weaponAmmoResEl.textContent = i18n.t('hud.unarmedLabel');
        this.weaponNameBadgeEl.textContent = i18n.t('hud.fistsLabel');
        this.weaponActiveSvgEl.innerHTML = getPunchSvg();
      } else if (isMeleeNow) {
        this.weaponAmmoMagEl.textContent = '∞';
        this.weaponAmmoResEl.textContent = i18n.t('hud.meleeLabel');
        this.weaponNameBadgeEl.textContent = i18n.translateWeaponName(
          snap.weaponId ?? snap.weaponName,
        );
        this.weaponActiveSvgEl.innerHTML = snap.weaponId
          ? getWeaponSvg(snap.weaponId, '#f8fafc')
          : getPunchSvg();
      } else {
        this.weaponAmmoMagEl.textContent = String(snap.ammoInMagazine);
        const isLowAmmo =
          !isUnlimited &&
          snap.ammoInMagazine <= Math.max(3, Math.floor(snap.magazineSize * 0.2));
        this.weaponAmmoMagEl.className = isLowAmmo
          ? 'text-lg sm:text-2xl font-black text-rose-400 tabular-nums tracking-tight'
          : 'text-lg sm:text-2xl font-black text-white tabular-nums tracking-tight';
        this.weaponAmmoResEl.textContent = isUnlimited ? '/∞' : `/${snap.reserveAmmo}`;
        this.weaponNameBadgeEl.textContent = i18n.translateWeaponName(
          snap.weaponId ?? snap.weaponName,
        );
        this.weaponActiveSvgEl.innerHTML = snap.weaponId
          ? getWeaponSvg(snap.weaponId, '#f8fafc')
          : getEmptyWeaponSlotSvg();
      }
      this.updateSlotTileHighlights();
    }

    const activeStateKey = !isUnlimited && snap.isReloading ? 'R' : snap.isBoltCycling ? 'B' : 'IDLE';
    const wasReloadOrBolt = this.lastReloadKey.startsWith('R:') || this.lastReloadKey.startsWith('B:');
    const nowIdle = activeStateKey === 'IDLE';
    this.lastWeaponSyncAccum += deltaSeconds;
    if (this.lastWeaponSyncAccum < 0.05 && !(wasReloadOrBolt && nowIdle)) return;
    this.lastWeaponSyncAccum = 0;

    const reloadKey =
      !isUnlimited && snap.isReloading
        ? `R:${Math.round(snap.reloadProgress * 100)}`
        : snap.isBoltCycling
          ? `B:${Math.round(snap.boltCycleProgress * 100)}`
          : 'IDLE';
    if (reloadKey !== this.lastReloadKey) {
      this.lastReloadKey = reloadKey;
      if (!isUnlimited && snap.isReloading) {
        const pct = Math.round(snap.reloadProgress * 100);
        this.reloadWrapEl.classList.remove('hidden');
        this.reloadBarEl.className = 'h-full bg-orange-400';
        this.reloadBarEl.style.width = `${pct}%`;
        this.quickReloadBarEl.className = 'absolute inset-y-0 left-0 bg-amber-400/55 transition-[width] duration-75';
        this.quickReloadBarEl.style.width = `${pct}%`;
      } else if (snap.isBoltCycling) {
        const pct = Math.round(snap.boltCycleProgress * 100);
        this.reloadWrapEl.classList.remove('hidden');
        this.reloadBarEl.className = 'h-full bg-sky-400';
        this.reloadBarEl.style.width = `${pct}%`;
        this.quickReloadBarEl.className = 'absolute inset-y-0 left-0 bg-sky-400/55 transition-[width] duration-75';
        this.quickReloadBarEl.style.width = `${pct}%`;
      } else {
        this.reloadWrapEl.classList.add('hidden');
        this.reloadBarEl.style.width = '0%';
        this.quickReloadBarEl.style.width = '0%';
      }
    }
  }

  syncInventoryAndPickup(
    deltaSeconds: number,
    invSnap: InventorySnapshot,
    pickupPrompt: PickupPromptSnapshot | null,
    worldPrompt: WorldInteractPrompt | null = null,
  ): void {
    const anyModal = this.inventoryOpen || this.fullMapOpen || this.settingsModalOpen;
    if (pickupPrompt && !anyModal) {
      const text = this.showTouchControls
        ? pickupPrompt.mobilePrompt
        : pickupPrompt.desktopPrompt;
      const pKey = `L:${pickupPrompt.rarity}:${text}`;
      if (pKey !== this.lastPromptKey) {
        this.lastPromptKey = pKey;
        const rarityHex = RARITY_COLORS[pickupPrompt.rarity];
        this.pickupPromptEl.textContent = text;
        this.pickupPromptEl.style.borderColor = rarityHex;
        this.pickupPromptEl.style.color = '#fcd34d';
        this.pickupPromptEl.classList.remove('hidden');
      }
      if (this.lastPromptHighlight !== true) {
        this.lastPromptHighlight = true;
        this.touchInputManager.setPickupHighlighted(true);
      }
    } else if (worldPrompt && !anyModal) {
      const text = this.showTouchControls
        ? worldPrompt.mobilePrompt
        : worldPrompt.desktopPrompt;
      const pKey = `W:${worldPrompt.kind}:${text}`;
      if (pKey !== this.lastPromptKey) {
        this.lastPromptKey = pKey;
        this.pickupPromptEl.textContent = text;
        if (worldPrompt.kind === 'seat' || worldPrompt.kind === 'stand') {
          this.pickupPromptEl.style.borderColor = '#34d399';
          this.pickupPromptEl.style.color = '#a7f3d0';
        } else if (worldPrompt.kind === 'window') {
          this.pickupPromptEl.style.borderColor = '#fbbf24';
          this.pickupPromptEl.style.color = '#fde68a';
        } else if (worldPrompt.kind === 'zipline') {
          this.pickupPromptEl.style.borderColor = '#06b6d4';
          this.pickupPromptEl.style.color = '#a5f3fc';
        } else {
          this.pickupPromptEl.style.borderColor = '#38bdf8';
          this.pickupPromptEl.style.color = '#bae6fd';
        }
        this.pickupPromptEl.classList.remove('hidden');
      }
      if (this.lastPromptHighlight !== true) {
        this.lastPromptHighlight = true;
        this.touchInputManager.setPickupHighlighted(true);
      }
    } else {
      if (this.lastPromptKey !== '') {
        this.lastPromptKey = '';
        this.pickupPromptEl.classList.add('hidden');
      }
      if (this.lastPromptHighlight !== false) {
        this.lastPromptHighlight = false;
        this.touchInputManager.setPickupHighlighted(false);
      }
    }

    if (this.inventoryOpen) {
      this.inventoryUI.render(invSnap);
    }

    const activeHeal = invSnap.activeHealing;
    const healHudKey = activeHeal?.active
      ? `${activeHeal.itemId}:${activeHeal.remainingSec.toFixed(1)}:${Math.round(activeHeal.progress * 100)}`
      : '0';
    if (healHudKey !== this.lastHealKey) {
      this.lastHealKey = healHudKey;
      if (activeHeal?.active) {
        this.healWrapEl.classList.remove('hidden');
        this.healLabelEl.textContent = i18n.t('hud.applying', {
          item: activeHeal.itemName.toUpperCase(),
        });
        this.healTimeEl.textContent = i18n.t('common.secondsShort', {
          s: activeHeal.remainingSec.toFixed(1),
        });
        const barColor =
          activeHeal.kind === 'shield'
            ? 'bg-sky-400'
            : activeHeal.kind === 'syringe'
              ? 'bg-purple-400'
              : activeHeal.kind === 'drink'
                ? 'bg-cyan-400'
                : 'bg-emerald-400';
        this.healBarEl.className = `h-full ${barColor}`;
        this.healBarEl.style.width = `${Math.round(activeHeal.progress * 100)}%`;
      } else {
        this.healWrapEl.classList.add('hidden');
        this.healBarEl.style.width = '0%';
      }
    }

    const wasHealing = this.statusState.healRemainingSec > 0;
    const isHealingNow = Boolean(activeHeal?.active);
    this.lastInventorySyncAccum += deltaSeconds;
    if (this.lastInventorySyncAccum < 0.08 && !isHealingNow && !wasHealing) return;
    this.lastInventorySyncAccum = 0;

    const bagKey = `${invSnap.bagUsed}/${invSnap.bagCapacity}`;
    if (bagKey !== this.lastBagKey) {
      this.lastBagKey = bagKey;
      this.touchInputManager.setBadgeText('inventory', bagKey);
      this.tileBagBadgeEl.textContent = String(invSnap.bagUsed);
    }

    const toWeaponSlotState = (entry: InventorySnapshot['weaponSlot1']) => {
      if (!entry?.definition.weaponId) return null;
      const def = WEAPON_BY_ID[entry.definition.weaponId];
      const isMelee = def?.type === 'MELEE' || (def?.magazineSize ?? 30) <= 0;
      const ammoType: AmmoType =
        def?.type === 'SMG'
          ? 'SMG'
          : def?.type === 'SHOTGUN'
            ? 'SHOTGUN'
            : def?.type === 'SNIPER'
              ? 'SNIPER'
              : def?.type === 'PISTOL'
                ? 'PISTOL'
                : 'AR';
      return {
        id: entry.definition.weaponId,
        accentHex: entry.definition.accentHex,
        ammoInMag: entry.weaponMagAmmo ?? def?.magazineSize ?? 30,
        reserveAmmo: isMelee ? 0 : (invSnap.ammo[ammoType] ?? 0),
        magSize: def?.magazineSize ?? 30,
        isMelee,
      };
    };

    const w1 = toWeaponSlotState(invSnap.weaponSlot1);
    const w2 = toWeaponSlotState(invSnap.weaponSlot2);
    const w3 = toWeaponSlotState(invSnap.weaponSlot3);
    const w4 = toWeaponSlotState(invSnap.weaponSlot4);
    const armorTier = (invSnap.armorSlot?.definition.armorLevel ?? 0) as 0 | 1 | 2 | 3;
    const armorDur = Math.round(invSnap.armorSlot?.durability ?? 0);
    const armorMax = Math.round(invSnap.armorSlot?.maxDurability ?? 100);
    const helmetTier = (invSnap.helmetSlot?.definition.helmetLevel ?? 0) as 0 | 1 | 2 | 3;
    const helmetDur = Math.round(invSnap.helmetSlot?.durability ?? 0);
    const helmetMax = Math.round(invSnap.helmetSlot?.maxDurability ?? 100);
    const medCount = invSnap.healingSlot?.quantity ?? 0;
    const specCount = invSnap.specialSlot?.quantity ?? 0;

    const isUnlimitedInv = Boolean(invSnap.unlimitedAmmo);
    const invStatusKey = [
      invSnap.activeWeaponSlotIndex,
      w1 ? `${w1.id}:${w1.ammoInMag}:${w1.reserveAmmo}` : '0',
      w2 ? `${w2.id}:${w2.ammoInMag}:${w2.reserveAmmo}` : '0',
      w3 ? `${w3.id}:${w3.ammoInMag}:${w3.reserveAmmo}` : '0',
      w4 ? `${w4.id}:1` : '0',
      `${armorTier}:${armorDur}:${armorMax}`,
      `${helmetTier}:${helmetDur}:${helmetMax}`,
      `${invSnap.healingSlot?.definition.id ?? '0'}:${medCount}`,
      `${invSnap.specialSlot?.definition.id ?? '0'}:${specCount}`,
      invSnap.backpackSlot?.definition.backpackLevel ?? 1,
      healHudKey,
      isUnlimitedInv ? 1 : 0,
    ].join('|');

    if (invStatusKey !== this.lastInvStatusKey) {
      this.lastInvStatusKey = invStatusKey;
      this.statusState.isUnarmed = invSnap.activeWeaponSlotIndex === -1;
      this.statusState.activeSlotIndex =
        invSnap.activeWeaponSlotIndex >= 0 && invSnap.activeWeaponSlotIndex <= 3
          ? (invSnap.activeWeaponSlotIndex as WeaponSlotIndex)
          : 0;
      this.statusState.weapon1 = w1;
      this.statusState.weapon2 = w2;
      this.statusState.armorTier = armorTier;
      this.statusState.armorDurability = armorDur;
      this.statusState.maxArmorDurability = armorMax;
      this.statusState.helmetTier = helmetTier;
      this.statusState.helmetDurability = helmetDur;
      this.statusState.maxHelmetDurability = helmetMax;
      this.statusState.medDef = invSnap.healingSlot?.definition ?? null;
      this.statusState.medCount = medCount;
      this.statusState.specialDef = invSnap.specialSlot?.definition ?? null;
      this.statusState.specialCount = specCount;
      this.statusState.healRemainingSec = activeHeal?.active ? activeHeal.remainingSec : 0;
      this.statusState.healProgress = activeHeal?.active ? activeHeal.progress : 0;
      this.statusState.unlimitedAmmo = isUnlimitedInv;

      this.hudWidgets.get('weapon1')?.syncState(this.statusState);
      this.hudWidgets.get('weapon2')?.syncState(this.statusState);
      this.hudWidgets.get('armor')?.syncState(this.statusState);
      this.hudWidgets.get('helmet')?.syncState(this.statusState);
      this.hudWidgets.get('medkit')?.syncState(this.statusState);
      this.hudWidgets.get('special')?.syncState(this.statusState);
      this.hudWidgets.get('ammo')?.syncState(this.statusState);

      // Update top-right 5-tile Free Fire selector icons & ammo counts
      const renderSlotTile = (
        slotData: typeof w1,
        iconEl: HTMLElement,
        ammoEl: HTMLElement,
      ): void => {
        if (slotData) {
          iconEl.innerHTML = getWeaponSvg(slotData.id, '#f8fafc');
          ammoEl.textContent =
            slotData.isMelee || isUnlimitedInv ? '∞' : String(slotData.ammoInMag + slotData.reserveAmmo);
        } else {
          iconEl.innerHTML = getEmptyWeaponSlotSvg();
          ammoEl.textContent = '—';
        }
      };
      renderSlotTile(w1, this.slot1IconEl, this.slot1AmmoEl);
      renderSlotTile(w2, this.slot2IconEl, this.slot2AmmoEl);
      renderSlotTile(w3, this.slot3IconEl, this.slot3AmmoEl);
      renderSlotTile(w4, this.slot4IconEl, this.slot4AmmoEl);
      this.updateSlotTileHighlights();

      // Update bottom helmet & armor indicators
      this.bottomHelmetIconEl.innerHTML = getHelmetSvg(helmetTier);
      this.bottomHelmetTextEl.textContent =
        helmetTier > 0 ? i18n.t('hud.levelShort', { level: helmetTier }) : '0';
      this.bottomHelmetTextEl.className =
        helmetTier >= 3
          ? 'text-[9px] font-black tabular-nums text-amber-300'
          : helmetTier >= 1
            ? 'text-[9px] font-black tabular-nums text-sky-300'
            : 'text-[9px] font-black tabular-nums text-slate-400';

      this.bottomArmorIconEl.innerHTML = getArmorSvg(armorTier);
      this.bottomArmorTextEl.textContent =
        armorTier > 0 ? i18n.t('hud.levelShort', { level: armorTier }) : '0';
      this.bottomArmorTextEl.className =
        armorTier >= 3
          ? 'text-[9px] font-black tabular-nums text-amber-300'
          : armorTier >= 1
            ? 'text-[9px] font-black tabular-nums text-sky-300'
            : 'text-[9px] font-black tabular-nums text-slate-400';

      // Update bottom tactical medkit, special & bag tiles
      const medDef: LootItemDefinition = invSnap.healingSlot?.definition ??
        getLootDefinition('med_kit') ?? {
          id: 'med_kit',
          name: 'Med Kit',
          category: 'health',
          rarity: 'uncommon',
          description: '',
          stackable: true,
          maxStack: 4,
          spawnWeight: 1,
          accentHex: '#64748b',
          iconTag: 'MED',
        };
      this.tileMedIconEl.innerHTML = getLootItemSvg(medDef);
      this.tileMedCountEl.textContent = String(medCount);
      this.tileMedBtn.style.opacity = medCount > 0 ? '1' : '0.52';

      const specDef: LootItemDefinition = invSnap.specialSlot?.definition ??
        getLootDefinition('special_adrenaline') ??
        getLootDefinition('shield_cell') ?? {
          id: 'shield_cell',
          name: 'Shield Cell',
          category: 'shield',
          rarity: 'common',
          description: '',
          stackable: true,
          maxStack: 4,
          spawnWeight: 1,
          accentHex: '#64748b',
          iconTag: 'SHD',
        };
      this.tileSpecIconEl.innerHTML = getLootItemSvg(specDef);
      this.tileSpecCountEl.textContent = String(specCount);
      this.tileSpecBtn.style.opacity = specCount > 0 ? '1' : '0.52';

      const bpLvl = (invSnap.backpackSlot?.definition.backpackLevel ?? 1) as 1 | 2 | 3;
      this.tileBagIconEl.innerHTML = getBackpackSvg(bpLvl);
    }
  }

  isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  setInventoryOpen(open: boolean): void {
    if (this.inventoryOpen === open) return;
    if (open && this.fullMapOpen) {
      this.setFullMapOpen(false);
    }
    if (open && this.settingsModalOpen) {
      this.setSettingsModalOpen(false);
    }
    this.inventoryOpen = open;
    this.inventoryUI.setVisible(open);
    this.touchInputManager.setToggleState('inventory', open);
    this.callbacks.onInventoryOpenChange(open);
  }

  isFullMapOpen(): boolean {
    return this.fullMapOpen;
  }

  setFullMapOpen(open: boolean): void {
    if (this.fullMapOpen === open) return;
    if (open && this.inventoryOpen) {
      this.setInventoryOpen(false);
    }
    if (open && this.settingsModalOpen) {
      this.setSettingsModalOpen(false);
    }
    this.fullMapOpen = open;
    this.fullMapModalEl.classList.toggle('hidden', !open);
    this.touchInputManager.setToggleState('minimap', open);
    this.callbacks.onFullMapOpenChange?.(open);
  }

  isSettingsModalOpen(): boolean {
    return this.settingsModalOpen;
  }

  setSettingsModalOpen(open: boolean): void {
    if (this.settingsModalOpen === open) return;
    if (open && this.inventoryOpen) {
      this.setInventoryOpen(false);
    }
    if (open && this.fullMapOpen) {
      this.setFullMapOpen(false);
    }
    this.settingsModalOpen = open;
    this.matchSettingsModalEl.classList.toggle('hidden', !open);
    this.callbacks.onSettingsOpenChange?.(open);
  }

  syncAbilityStatus(
    deltaSeconds: number,
    _characterName: string,
    _abilityName: string,
    status: 'ready' | 'active' | 'cooldown',
    activeRemaining: number,
    cooldownRemaining: number,
  ): void {
    this.lastAbilitySyncAccum += deltaSeconds;
    if (this.lastAbilitySyncAccum < 0.12) return;
    this.lastAbilitySyncAccum = 0;

    const abKey = `${status}|${status === 'active' ? Math.ceil(activeRemaining) : status === 'cooldown' ? Math.ceil(cooldownRemaining) : 0}`;
    if (abKey === this.lastAbilityKey) return;
    this.lastAbilityKey = abKey;

    if (status === 'active') {
      const text = `${Math.ceil(activeRemaining)}`;
      this.touchInputManager.setBadgeText('ability', text);
      this.touchInputManager.buttons.get('ability')?.setActive(true);
      this.tileAbilityBadgeEl.textContent = text;
      this.tileAbilityBadgeEl.classList.remove('hidden');
      this.tileAbilityBtn.style.borderColor = 'rgba(251, 191, 36, 0.95)';
    } else if (status === 'cooldown') {
      const text = `${Math.ceil(cooldownRemaining)}`;
      this.touchInputManager.setBadgeText('ability', text);
      this.touchInputManager.buttons.get('ability')?.setActive(false);
      this.tileAbilityBadgeEl.textContent = text;
      this.tileAbilityBadgeEl.classList.remove('hidden');
      this.tileAbilityBtn.style.borderColor = 'rgba(148, 163, 184, 0.35)';
    } else {
      this.touchInputManager.setBadgeText('ability', null);
      this.touchInputManager.buttons.get('ability')?.setActive(false);
      this.tileAbilityBadgeEl.classList.add('hidden');
      this.tileAbilityBtn.style.borderColor = 'rgba(252, 211, 77, 0.55)';
    }
  }

  getDamageOverlayRoot(): HTMLElement {
    return this.element;
  }

  setKillsCounterValue(kills: number): void {
    if (this.lastRankedKills === kills) return;
    this.lastRankedKills = kills;
    this.rankedKillsEl.textContent = String(kills);
  }

  showWeaponReplacePrompt(prompt: WeaponReplacementPrompt | null): void {
    this.pendingWeaponReplace = prompt;
    if (!prompt) {
      this.weaponReplaceModalEl.classList.add('hidden');
      this.weaponReplaceIncomingEl.innerHTML = '';
      this.weaponReplaceChoicesEl.innerHTML = '';
      return;
    }
    if (this.inventoryOpen) this.setInventoryOpen(false);
    if (this.fullMapOpen) this.setFullMapOpen(false);
    if (this.settingsModalOpen) this.setSettingsModalOpen(false);

    const groupTitle =
      prompt.group === 'LARGE'
        ? 'LARGE WEAPON SLOTS FULL (2/2)'
        : prompt.group === 'PISTOL'
          ? 'PISTOL SLOT FULL (1/1)'
          : 'MELEE SLOT FULL (1/1)';
    this.weaponReplaceTitleEl.textContent = groupTitle;
    this.weaponReplaceSubtitleEl.textContent =
      prompt.candidates.length > 1
        ? 'Select which equipped weapon to drop and replace'
        : 'Confirm replacing your equipped weapon in this category';

    const incomingName = this.escapeHud(
      i18n.translateWeaponName(prompt.incomingWeaponDef.id),
    );
    const incomingCat = this.escapeHud(
      i18n.translateWeaponCategory(prompt.incomingWeaponDef.type),
    );
    const incomingRarityHex = RARITY_COLORS[prompt.incomingLootDef.rarity];
    const incomingIsMelee = prompt.incomingWeaponDef.type === 'MELEE';
    this.weaponReplaceIncomingEl.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-16 h-10 rounded bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0">
          ${getWeaponSvg(prompt.incomingWeaponDef.id, prompt.incomingLootDef.accentHex)}
        </div>
        <div class="min-w-0">
          <div class="text-[9px] font-black tracking-[0.14em] uppercase text-sky-300">PICKING UP</div>
          <div class="text-sm font-black tracking-wide text-white uppercase truncate">${incomingName}</div>
          <div class="text-[10px] font-bold text-slate-300 uppercase">
            <span style="color:${incomingRarityHex}">${incomingCat}</span>
            ${incomingIsMelee ? ' · MELEE' : ` · MAG ${prompt.incomingMagAmmo}/${prompt.incomingWeaponDef.magazineSize}`}
          </div>
        </div>
      </div>
      <span class="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/60 text-[9px] font-black tracking-wider uppercase text-sky-200 shrink-0">NEW</span>
    `;

    this.weaponReplaceChoicesEl.innerHTML = prompt.candidates
      .map((cand) => {
        const wId = cand.entry.definition.weaponId ?? '';
        const wDef = wId ? WEAPON_BY_ID[wId] : undefined;
        const wName = this.escapeHud(
          i18n.translateWeaponName(wId || cand.entry.definition.name),
        );
        const wCat = wDef
          ? this.escapeHud(i18n.translateWeaponCategory(wDef.type))
          : prompt.group;
        const isMelee = wDef?.type === 'MELEE';
        const magText = isMelee
          ? 'MELEE'
          : `MAG ${cand.entry.weaponMagAmmo ?? wDef?.magazineSize ?? 0}/${wDef?.magazineSize ?? 0}`;
        const slotNum = cand.slotIndex + 1;
        return `
          <button
            type="button"
            data-replace-slot="${cand.slotIndex}"
            class="w-full rounded-md bg-slate-950/85 hover:bg-slate-800/95 active:scale-[0.99] border border-slate-700 hover:border-amber-400 px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-6 h-6 rounded bg-slate-800 border border-amber-400/70 text-[11px] font-black text-amber-300 flex items-center justify-center shrink-0 tabular-nums">${slotNum}</span>
              <div class="w-14 h-9 rounded bg-slate-900 border border-slate-700/70 flex items-center justify-center shrink-0">
                ${getWeaponSvg(wId, cand.entry.definition.accentHex)}
              </div>
              <div class="min-w-0">
                <div class="text-xs font-black tracking-wide text-white uppercase truncate">${wName}</div>
                <div class="text-[10px] font-bold text-slate-400 uppercase">${wCat} · ${magText}</div>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/70 text-[10px] font-black tracking-wider uppercase text-amber-200 shrink-0">REPLACE</span>
          </button>
        `;
      })
      .join('');

    this.weaponReplaceModalEl.classList.remove('hidden');
  }

  isWeaponReplacePromptOpen(): boolean {
    return this.pendingWeaponReplace !== null;
  }

  getPendingWeaponReplacePrompt(): WeaponReplacementPrompt | null {
    return this.pendingWeaponReplace;
  }

  syncGlooWallState(
    activeOwnedCount: number,
    maxActiveCount: number,
    previewActive = false,
  ): void {
    if (this.glooHeldActive !== previewActive) {
      this.glooHeldActive = previewActive;
      this.updateSlotTileHighlights();
    }
    const key = `${activeOwnedCount}/${maxActiveCount}|${previewActive ? 1 : 0}`;
    if (key === this.lastGlooHudKey) return;
    this.lastGlooHudKey = key;

    const atCap = activeOwnedCount >= maxActiveCount;
    const badge = `${activeOwnedCount}/${maxActiveCount}`;
    this.tileGlooCountEl.textContent = badge;
    this.tileGlooBtn.style.opacity = '1';
    this.tileGlooBtn.style.borderColor = previewActive
      ? 'rgba(34, 211, 238, 1)'
      : atCap
        ? 'rgba(56, 189, 248, 0.95)'
        : 'rgba(56, 189, 248, 0.78)';
    this.tileGlooBtn.style.backgroundColor = previewActive
      ? 'rgba(14, 116, 144, 0.72)'
      : '';
    this.tileGlooBtn.style.boxShadow = previewActive
      ? '0 0 12px rgba(34, 211, 238, 0.55)'
      : '';

    this.touchInputManager.setBadgeText('glooWall', badge);
    this.touchInputManager.setButtonAvailable('glooWall', true);
    this.touchInputManager.buttons.get('glooWall')?.setActive(previewActive);
  }

  syncGlooManualPreview(
    _active: boolean,
    _valid: boolean,
    _reason?: 'blocked' | 'overlap' | 'bounds' | 'player',
  ): void {
    // Manual placement bar removed per user request; 3D placement ghost remains active.
  }

  showKillNotification(
    killerName: string,
    victimName: string,
    weaponName: string,
    isHeadshot: boolean,
    isSelfKiller: boolean,
    isSelfVictim: boolean,
  ): void {
    const kName = this.escapeHud(i18n.translateCombatActor(killerName));
    const vName = this.escapeHud(i18n.translateCombatActor(victimName));
    const wName = this.escapeHud(i18n.translateWeaponName(weaponName));

    const borderClass = isSelfKiller
      ? isHeadshot
        ? 'border-red-400/90 shadow-[0_0_24px_rgba(239,68,68,0.55)]'
        : 'border-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.45)]'
      : isSelfVictim
        ? 'border-rose-500/90 shadow-[0_0_20px_rgba(244,63,94,0.45)]'
        : 'border-slate-500/75 shadow-[0_4px_18px_rgba(0,0,0,0.65)]';

    const killerClass = isSelfKiller ? 'text-amber-300' : 'text-sky-200';
    const victimClass = isSelfVictim ? 'text-rose-300' : 'text-white';
    const hsBadge = isHeadshot
      ? `<span class="px-1.5 py-0.5 rounded bg-red-600 text-[9px] font-black tracking-wider text-amber-200 uppercase">${this.escapeHud(i18n.t('hud.kill.headshot'))}</span>`
      : '';

    this.killBannerEl.innerHTML = `
      <div class="px-3.5 py-1.5 rounded bg-slate-950/90 border ${borderClass} flex flex-col items-center gap-0.5 backdrop-blur-sm">
        <div class="flex items-center gap-2 text-xs sm:text-sm font-black tracking-wide uppercase whitespace-nowrap">
          <span class="${killerClass}">${kName}</span>
          <span class="w-4 h-4 text-rose-400 flex items-center justify-center shrink-0">${getElimSkullSvg()}</span>
          ${hsBadge}
          <span class="${victimClass}">${vName}</span>
        </div>
        <div class="text-[9px] font-extrabold tracking-[0.16em] uppercase text-slate-400">${wName}</div>
      </div>
    `;

    this.killBannerEl.classList.remove('opacity-0', 'scale-95');
    this.killBannerEl.classList.add('opacity-100', 'scale-100');

    if (this.killBannerTimeoutId) {
      clearTimeout(this.killBannerTimeoutId);
    }
    this.killBannerTimeoutId = window.setTimeout(() => {
      this.killBannerEl.classList.remove('opacity-100', 'scale-100');
      this.killBannerEl.classList.add('opacity-0', 'scale-95');
    }, 2600);
  }

  handleActionFeedback(action: GameAction, customToast?: string): void {
    if (customToast) {
      this.showToast(customToast);
      return;
    }

    switch (action) {
      case 'ability':
        this.showToast(i18n.t('hud.ability.triggered'));
        break;
      case 'minimap':
        this.setFullMapOpen(!this.fullMapOpen);
        break;
      case 'inventory':
        this.setInventoryOpen(!this.inventoryOpen);
        break;
    }
  }

  showToast(text: string): void {
    this.actionToastEl.textContent = text;
    this.actionToastEl.style.opacity = '1';
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = window.setTimeout(() => {
      this.actionToastEl.style.opacity = '0';
    }, 1100);
  }

  syncPlayerStats(_deltaSeconds: number, snapshot: PlayerStateSnapshot): void {
    this.lastPlayerStatsSnapshot = snapshot;
    if (this.lastCrouchToggle !== snapshot.isCrouching) {
      this.lastCrouchToggle = snapshot.isCrouching;
      this.touchInputManager.setToggleState('crouch', snapshot.isCrouching);
    }
    const isProne = Boolean(snapshot.isProne);
    if (this.lastProneToggle !== isProne) {
      this.lastProneToggle = isProne;
      this.touchInputManager.setToggleState('prone', isProne);
    }
    if (this.lastSprintToggle !== snapshot.isSprinting) {
      this.lastSprintToggle = snapshot.isSprinting;
      this.touchInputManager.setToggleState('sprint', snapshot.isSprinting);
    }

    const hp =
      !snapshot.isAlive || snapshot.health <= 0
        ? 0
        : Math.max(1, Math.round(snapshot.health));
    const sh = snapshot.shield <= 0 ? 0 : Math.round(snapshot.shield);
    const key = `${hp}/${snapshot.maxHealth}:${sh}/${snapshot.maxShield}:${snapshot.isAlive ? 1 : 0}`;
    if (key === this.lastStatsKey) return;
    this.lastStatsKey = key;

    this.statusState.health = hp;
    this.statusState.maxHealth = snapshot.maxHealth;
    this.statusState.shield = sh;
    this.statusState.maxShield = snapshot.maxShield;
    this.hudWidgets.get('health')?.syncState(this.statusState);

    const hpPct = clamp((hp / Math.max(1, snapshot.maxHealth)) * 100, 0, 100);
    this.bottomHpTextEl.textContent = i18n.t('hud.hpStrip', {
      hpLabel: i18n.t('common.hp'),
      cur: hp,
      max: snapshot.maxHealth,
    });
    this.bottomHpFillEl.style.width = `${hpPct.toFixed(1)}%`;
    this.bottomHpFillEl.className =
      hpPct <= 25
        ? 'h-full bg-rose-400 transition-[width] duration-100'
        : hpPct <= 55
          ? 'h-full bg-amber-300 transition-[width] duration-100'
          : 'h-full bg-white transition-[width] duration-100';

    if (sh > 0 && snapshot.maxShield > 0) {
      const shPct = clamp((sh / snapshot.maxShield) * 100, 0, 100);
      this.bottomShieldTextEl.textContent = i18n.t('hud.shieldShort', { sh });
      this.bottomShieldTextEl.classList.remove('hidden');
      this.bottomShieldFillEl.style.width = `${shPct.toFixed(1)}%`;
      this.bottomShieldFillEl.classList.remove('hidden');
    } else {
      this.bottomShieldTextEl.classList.add('hidden');
      this.bottomShieldFillEl.classList.add('hidden');
    }
  }

  applySettingsAndViewport(settings: GameSettings, metrics: ViewportMetrics): void {
    this.currentSettings = settings;
    this.latestMetrics = metrics;
    this.fpsEl.style.display = settings.graphics.showFps ? 'inline-block' : 'none';
    this.minimap.setCustomSize(this.computeCornerMinimapSize(metrics));
    this.fullMapMinimap.setCustomSize(this.computeFullMapSize(metrics), true);

    // Sync mute buttons, language buttons & quality buttons inside match settings modal
    const muteIconWrap = this.muteBtn.firstElementChild;
    if (muteIconWrap) {
      muteIconWrap.innerHTML = getAudioToggleSvg(settings.audio.muted);
    }
    this.settingsMuteBtn.textContent = settings.audio.muted
      ? i18n.t('hud.settings.audioMuted')
      : i18n.t('hud.settings.audioOn');
    this.settingsCamBtn.textContent = i18n.t('hud.settings.camLabel', {
      mode: i18n.t(`hud.camMode.${this.currentCameraModeLabel}`),
    });

    const activeLang = settings.language ?? i18n.getLanguage();
    (['en', 'ar', 'es'] as const).forEach((lang) => {
      const active = activeLang === lang;
      this.settingsLanguageButtons[lang].className = active
        ? 'py-2 rounded text-[11px] font-black tracking-wide border border-amber-400 bg-amber-500/20 text-amber-200 min-h-[38px]'
        : 'py-2 rounded text-[11px] font-black tracking-wide border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white min-h-[38px]';
    });

    (['low', 'medium', 'high'] as const).forEach((preset) => {
      const active = settings.graphics.quality === preset;
      this.qualityButtons[preset].className = active
        ? 'py-2 rounded text-[11px] font-black uppercase tracking-wider border border-amber-400 bg-amber-500/20 text-amber-200 min-h-[38px]'
        : 'py-2 rounded text-[11px] font-black uppercase tracking-wider border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white min-h-[38px]';
    });

    (['auto', 'manual'] as const).forEach((mode) => {
      const active = settings.controls.glooPlacementMode === mode;
      this.glooModeButtons[mode].className = active
        ? 'py-2 rounded text-[11px] font-black uppercase tracking-wider border border-sky-400 bg-sky-500/20 text-sky-200 min-h-[38px]'
        : 'py-2 rounded text-[11px] font-black uppercase tracking-wider border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white min-h-[38px]';
    });

    const isMobileOrTablet = this.deviceProfile.isMobile || this.deviceProfile.isTablet;
    const showTouch =
      settings.controls.touchControlsEnabled === 'always' ||
      (settings.controls.touchControlsEnabled === 'auto' && isMobileOrTablet);

    this.showTouchControls = showTouch;
    const layout = this.controlSettings.getLayout(metrics.orientation);

    this.touchInputManager.setEnabled(showTouch);
    this.touchInputManager.applyLayout(layout, metrics.orientation, metrics);

    this.hudStatusLayerEl.style.display = !this.airborneActive && showTouch ? 'block' : 'none';
    for (const [id, widget] of this.hudWidgets) {
      const slot = layout[id];
      if (slot) {
        widget.applyLayout(slot, metrics);
      }
    }
  }

  private refreshLocale(): void {
    // Refresh static tooltips, labels & buttons
    this.minimapMountEl.title = i18n.t('hud.aria.fullMap');
    this.muteBtn.setAttribute('aria-label', i18n.t('hud.aria.toggleMute'));
    this.muteBtn.title = i18n.t('hud.aria.toggleMute');
    this.editHudBtn.setAttribute('aria-label', i18n.t('hud.aria.editHud'));
    this.editHudBtn.title = i18n.t('hud.aria.editHud');
    this.fullMapBtn.setAttribute('aria-label', i18n.t('hud.aria.fullMap'));
    this.fullMapBtn.title = i18n.t('hud.aria.fullMap');
    this.emoteWheelBtn.setAttribute('aria-label', i18n.t('hud.aria.emotes'));
    this.emoteWheelBtn.title = i18n.t('hud.aria.emotes');
    this.settingsGearBtn.setAttribute('aria-label', i18n.t('hud.aria.settingsMenu'));
    this.settingsGearBtn.title = i18n.t('hud.aria.settingsMenu');
    this.compassSafePipEl.title = i18n.t('hud.title.safeZoneDir');
    this.quickReloadLabelEl.textContent = i18n.t('hud.quickReload');
    this.slotTile1Btn.title = i18n.t('hud.title.primary1');
    this.slotTile2Btn.title = i18n.t('hud.title.secondary2');
    this.slotTileFistsBtn.title = i18n.t('hud.title.unarmed');
    this.waitingBoardingLabelEl.textContent = i18n.t('hud.waiting.boardingIn');
    this.spectatorResultsBtn.textContent = i18n.t('hud.spectator.resultsBtn');
    this.tileMedBtn.title = i18n.t('hud.title.medkit');
    this.tileSpecBtn.title = i18n.t('hud.title.special');
    this.tileGlooBtn.title = i18n.t('hud.title.glooWall');
    this.tileAbilityBtn.title = i18n.t('hud.title.ability');
    this.tileBagBtn.title = i18n.t('hud.title.bag');
    this.helmetTitleWrapEl.title = i18n.t('hud.title.helmet');
    this.armorTitleWrapEl.title = i18n.t('hud.title.armor');
    this.bottomCallsignEl.textContent = this.localCallsign;

    this.fullMapTitleEl.textContent = i18n.t('hud.fullMap.title');
    this.fullMapCloseBtn.textContent = i18n.t('common.close');
    this.fullMapLegendSafeEl.textContent = i18n.t('hud.fullMap.legendSafe');
    this.fullMapLegendNextEl.textContent = i18n.t('hud.fullMap.legendNext');
    this.fullMapLegendBlueEl.textContent = i18n.t('hud.fullMap.legendBlue');
    this.fullMapZoneEl.textContent = i18n.t('hud.fullMap.safeActive');

    this.settingsModalTitleEl.textContent = i18n.t('hud.settings.modalTitle');
    this.settingsCloseBtn.textContent = i18n.t('hud.settings.resume');
    this.settingsLangLabelEl.textContent = i18n.t('lang.title');
    this.settingsGraphicsLabelEl.textContent = i18n.t('hud.settings.graphicsPreset');
    this.qualityButtons.low.textContent = i18n.t('quality.low');
    this.qualityButtons.medium.textContent = i18n.t('quality.medium');
    this.qualityButtons.high.textContent = i18n.t('quality.high');
    this.settingsGlooLabelEl.textContent = i18n.t('settings.section.glooWall');
    this.glooModeButtons.auto.textContent = i18n.t('settings.glooWall.modeAuto');
    this.glooModeButtons.manual.textContent = i18n.t('settings.glooWall.modeManual');
    this.settingsCycleMapBtn.textContent = i18n.t('hud.settings.switchMapBtn');
    this.settingsNewMatchBtn.textContent = i18n.t('hud.settings.newMatchBtn');
    this.settingsHudEditorBtn.textContent = i18n.t('hud.settings.hudLayoutBtn');
    this.settingsExitMenuBtn.textContent = i18n.t('hud.settings.exitMenu');

    // Rebuild compass cardinal ticks
    this.compassTicksEl.innerHTML = buildCompassTicksHtml();

    // Clear dirty-check caches so active HUD elements re-render cleanly
    this.lastCompassDeg = -999;
    this.lastRankedZoneKey = '';
    this.lastRankedZoneState = '';
    this.lastRankedZoneLang = '';
    this.lastFullMapZoneKey = '';
    this.lastZoneWarningKey = '';
    this.lastWeaponKey = '';
    this.lastUnlimitedAmmoState = null;
    this.lastDmgKey = '';
    this.lastPromptKey = '';
    this.lastHealKey = '';
    this.lastWaitingKey = '';
    this.lastStatsKey = '';
    this.lastAbilityKey = '';
    this.lastInvStatusKey = '';
    if (this.lastFps >= 0) {
      this.fpsEl.textContent = i18n.t('hud.fps', { fps: this.lastFps });
    }

    for (const [id, widget] of this.hudWidgets) {
      widget.setTitle(i18n.translateHudSlotLabel(id));
      widget.refreshLocale();
    }

    // Re-sync mode/zone labels, waiting banner, spectator banner, killfeed & result modals
    this.setArenaHudMode(this.activeHudMode);
    if (this.lastRankedZoneArgs) {
      this.syncRankedHudState(
        this.lastRankedZoneArgs.aliveCount,
        this.lastRankedZoneArgs.localKills,
        this.lastRankedZoneArgs.zone,
        this.lastRankedZoneArgs.inDangerZone,
      );
    }
    if (this.lastWaitingArgs) {
      this.syncWaitingArena(
        this.lastWaitingArgs.snap,
        this.lastWaitingArgs.modeLabel,
        this.lastWaitingArgs.participantCount,
      );
    }
    if (!this.spectatorBannerEl.classList.contains('hidden')) {
      this.showRankedSpectatorBanner(this.lastSpectatorTarget, this.lastSpectatorIsSquadmate);
    }
    if (this.lastSquadStatuses.length > 0) {
      this.lastSquadHudKey = '';
      this.setSquadmateStatuses(this.lastSquadStatuses);
    }
    if (this.killFeedEntries.length > 0) {
      this.renderKillFeed();
    }
    if (this.lastPlayerStatsSnapshot) {
      this.syncPlayerStats(0, this.lastPlayerStatsSnapshot);
    }
    if (this.lastWeaponSnapshot) {
      this.syncWeaponState(0, this.lastWeaponSnapshot);
    }
    if (!this.rankedResultModalEl.classList.contains('hidden')) {
      if (this.activeResultModalKind === 'ranked' && this.lastRankedResultPayload) {
        this.showRankedResultModal(this.lastRankedResultPayload);
      } else if (this.activeResultModalKind === 'br-elim' && this.lastBrElimPayload) {
        this.showBattleRoyaleEliminationModal(this.lastBrElimPayload);
      } else if (this.activeResultModalKind === 'br-result' && this.lastBrResultPayload) {
        this.showBattleRoyaleResultModal(this.lastBrResultPayload);
      }
    }

    this.applySettingsAndViewport(this.currentSettings, this.latestMetrics);
  }

  isTouchControlsActive(): boolean {
    return this.showTouchControls;
  }

  resetArenaOverlays(): void {
    this.fullMapOpen = false;
    this.inventoryOpen = false;
    this.settingsModalOpen = false;
    this.lastFullMapZoneKey = '';
    this.airborneActive = false;
    this.isAiming = false;
    this.lastScopeAvailable = null;
    this.lastUnarmedState = null;
    this.lastHasStoredWeapons = null;
    this.lastCrosshairUnarmed = null;
    this.lastCrouchToggle = null;
    this.lastProneToggle = null;
    this.lastSprintToggle = null;
    this.lastCompassDeg = -999;
    this.lastSafeBearingDeg = -999;
    this.lastStatsKey = '';
    this.lastAbilityKey = '';
    this.lastInvStatusKey = '';
    this.lastBagKey = '';
    this.lastGlooHudKey = '';
    this.glooHeldActive = false;
    this.tileGlooBtn.style.boxShadow = '';
    this.lastWeaponKey = '';
    this.lastFiringState = null;
    this.lastReloadKey = '';
    this.lastHealKey = '';
    this.lastRankedZoneKey = '';
    this.lastZoneWarningKey = '';
    this.lastDangerVignetteActive = false;
    this.lastZonePingCueKey = '';
    this.lastWaitingKey = '';
    this.lastBrElimPayload = null;
    this.lastBrResultPayload = null;
    this.lastSpectatorIsSquadmate = false;
    this.setSquadmateStatuses([]);
    if (this.killBannerTimeoutId) {
      clearTimeout(this.killBannerTimeoutId);
      this.killBannerTimeoutId = 0;
    }
    this.killBannerEl.classList.remove('opacity-100', 'scale-100');
    this.killBannerEl.classList.add('opacity-0', 'scale-95');
    this.killBannerEl.innerHTML = '';
    this.fullMapModalEl.classList.add('hidden');
    this.matchSettingsModalEl.classList.add('hidden');
    this.showWeaponReplacePrompt(null);
    this.waitingBannerEl.classList.add('hidden');
    this.zoneWarningEl.classList.add('hidden');
    this.dangerVignetteEl.classList.add('hidden');
    this.compassSafePipEl.classList.add('hidden');
    this.minimap.setExpanded(false);
    this.inventoryUI.setVisible(false);
    this.scopeOverlay.hideImmediate();
    this.airdropOverlay.reset();
    this.crosshairContainerEl.style.display = 'flex';
    this.crosshairReticleEl.style.opacity = '1';
    this.setCrosshairEnemyTargeted(false);
    this.topRightClusterEl.style.display = 'flex';
    this.bottomHudBarEl.style.display = 'flex';
    this.crosshairCenterSvgEl.style.opacity = '1';
    this.hudStatusLayerEl.style.display = this.showTouchControls ? 'block' : 'none';
    this.reloadWrapEl.classList.add('hidden');
    this.healWrapEl.classList.add('hidden');
    this.healBarEl.style.width = '0%';
    this.pickupPromptEl.classList.add('hidden');
    this.touchInputManager.setAirbornePhase('ground');
    this.touchInputManager.setPickupHighlighted(false);
    this.touchInputManager.setButtonAvailable('aim', true);
    this.touchInputManager.setUnarmedMode(false, false);
    this.touchInputManager.resetAll();
    this.setRankedMode(false);
    this.applySettingsAndViewport(this.currentSettings, this.latestMetrics);
  }

  dispose(): void {
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    if (this.killBannerTimeoutId) {
      clearTimeout(this.killBannerTimeoutId);
    }
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.minimap.dispose();
    this.fullMapMinimap.dispose();
    this.airdropOverlay.dispose();
    this.scopeOverlay.dispose();
    this.inventoryUI.dispose();
    this.touchInputManager.dispose();
  }
}
