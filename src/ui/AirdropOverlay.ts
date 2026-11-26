import type { AirplaneDropSnapshot } from '../drop/IAirplaneDropSystem';
import { i18n } from '../i18n/I18nManager';
import { clamp } from '../utils/MathUtils';

export interface AirdropOverlayCallbacks {
  onJump: () => void;
  onDeployParachute: () => void;
}

export class AirdropOverlay {
  readonly element: HTMLElement;

  private readonly flightBannerEl: HTMLElement;
  private readonly flightTitleEl: HTMLElement;
  private readonly flightRouteEl: HTMLElement;
  private readonly flightScoutEl: HTMLElement;
  private readonly flightTimerEl: HTMLElement;
  private readonly flightProgressBarEl: HTMLElement;

  private readonly jumpBtn: HTMLButtonElement;
  private readonly jumpTitleEl: HTMLElement;
  private readonly jumpSubEl: HTMLElement;
  private readonly deployBtn: HTMLButtonElement;
  private readonly deployTitleEl: HTMLElement;
  private readonly steeringHintEl: HTMLElement;

  private readonly deploySubEl: HTMLElement | null;
  private readonly altLabelEl: HTMLElement;
  private readonly speedLabelEl: HTMLElement;
  private readonly altValueEl: HTMLElement;
  private readonly speedValueEl: HTMLElement;
  private readonly phaseTagEl: HTMLElement;
  private readonly altMarkerEl: HTMLElement;

  private lastActive: boolean | null = null;
  private lastAltText = '';
  private lastSpdText = '';
  private lastAltHeight = '';
  private lastFlightTitle = '';
  private lastFlightRoute = '';
  private lastFlightTimer = '';
  private lastFlightProg = '';
  private lastDeploySub = '';
  private lastHint = '';
  private lastPhaseTag = '';
  private lastPhaseClass = '';
  private lastAltClass = '';
  private lastModeKey = '';
  private lastSnapshot: AirplaneDropSnapshot | null = null;
  private unsubI18n: (() => void) | null = null;

  constructor(private readonly callbacks: AirdropOverlayCallbacks) {
    this.element = document.createElement('div');
    this.element.className =
      'pointer-events-none hidden absolute inset-0 z-20 flex flex-col justify-between safe-pad';

    this.element.innerHTML = `
      <!-- Top-Center Aircraft Flight Path Strip -->
      <div data-role="flight-banner" class="mt-9 sm:mt-14 mx-auto w-full max-w-[min(62vw,370px)] sm:max-w-[400px] nexus-panel px-3 sm:px-4 py-1.5 sm:py-2 rounded flex flex-col gap-1 sm:gap-1.5">
        <div class="flex items-center justify-between gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-black tracking-[0.14em] uppercase">
          <span data-role="flight-title" class="text-sky-300 truncate"></span>
          <span data-role="flight-timer" class="text-amber-300 tabular-nums shrink-0"></span>
        </div>
        <div class="w-full h-1.5 bg-slate-800 rounded-sm overflow-hidden">
          <div data-role="flight-progress" class="h-full bg-orange-500 transition-[width] duration-75" style="width: 10%"></div>
        </div>
        <div class="flex items-center justify-between text-[9px] sm:text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
          <span data-role="flight-route" class="truncate"></span>
          <span data-role="flight-scout" class="shrink-0"></span>
        </div>
      </div>

      <!-- Left-Side Vertical Altimeter & Airspeed Gauge (clear of Minimap & Touch Aim) -->
      <aside dir="ltr" data-ltr="true" class="pointer-events-none absolute hud-safe-left top-[56%] sm:top-1/2 -translate-y-1/2 nexus-panel px-2 sm:px-3 py-2 sm:py-3 rounded flex items-center gap-2 sm:gap-3">
        <div class="relative w-2.5 sm:w-3 h-24 sm:h-36 bg-slate-900 border border-slate-700 rounded-sm overflow-hidden">
          <!-- Live altitude indicator bar -->
          <div
            data-role="alt-marker"
            class="absolute bottom-0 left-0 right-0 bg-sky-400"
            style="height: 90%"
          ></div>
        </div>

        <div class="flex flex-col gap-1 sm:gap-2 min-w-[68px] sm:min-w-[86px]">
          <div class="flex flex-col">
            <span data-role="alt-label" class="text-[8px] sm:text-[9px] font-bold tracking-widest text-slate-400 uppercase"></span>
            <span data-role="alt-value" class="text-sm sm:text-lg font-black text-white tabular-nums leading-tight"></span>
          </div>
          <div class="flex flex-col">
            <span data-role="speed-label" class="text-[8px] sm:text-[9px] font-bold tracking-widest text-slate-400 uppercase"></span>
            <span data-role="speed-value" class="text-xs sm:text-sm font-extrabold text-amber-300 tabular-nums leading-tight"></span>
          </div>
          <div class="pt-0.5 sm:pt-1 border-t border-slate-800">
            <span data-role="phase-tag" class="text-[9px] sm:text-[10px] font-black tracking-wider text-sky-300 uppercase block"></span>
          </div>
        </div>
      </aside>

      <!-- Bottom-Center Primary JUMP / LANDING Action Area -->
      <div class="mb-2 sm:mb-8 mx-auto flex flex-col items-center gap-1.5 sm:gap-2 pointer-events-none">
        <button
          type="button"
          data-action="airdrop-jump"
          class="pointer-events-auto nexus-btn-primary min-w-[196px] sm:min-w-[270px] min-h-[48px] sm:min-h-[60px] px-6 sm:px-10 py-2.5 sm:py-3.5 rounded-md border-2 border-amber-300 shadow-[0_12px_36px_rgba(249,115,22,0.5)] flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-manipulation"
        >
          <span data-role="jump-title" class="text-lg sm:text-2xl font-black tracking-[0.2em] text-white leading-none"></span>
          <span data-role="jump-sub" class="text-[9px] sm:text-[10px] font-bold tracking-[0.14em] text-amber-100 uppercase"></span>
        </button>

        <button
          type="button"
          data-action="airdrop-chute"
          class="pointer-events-auto hidden min-w-[196px] sm:min-w-[260px] min-h-[48px] sm:min-h-[58px] px-6 sm:px-8 py-2.5 sm:py-3 rounded-md bg-sky-600 hover:bg-sky-500 active:scale-[0.98] border-2 border-sky-300 shadow-[0_10px_28px_rgba(14,165,233,0.48)] flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-manipulation transition-transform"
        >
          <span data-role="deploy-title" class="text-base sm:text-xl font-black tracking-[0.18em] text-white leading-none"></span>
          <span data-role="deploy-sub" class="text-[9px] sm:text-[10px] font-bold tracking-widest text-sky-100 uppercase tabular-nums"></span>
        </button>

        <div data-role="steering-hint" class="nexus-panel-subtle px-3 py-1 rounded text-[9px] sm:text-[11px] font-bold tracking-wider text-slate-200 uppercase text-center max-w-[78vw] sm:max-w-[92vw]"></div>
      </div>
    `;

    this.flightBannerEl = this.element.querySelector('[data-role="flight-banner"]')!;
    this.flightTitleEl = this.element.querySelector('[data-role="flight-title"]')!;
    this.flightRouteEl = this.element.querySelector('[data-role="flight-route"]')!;
    this.flightScoutEl = this.element.querySelector('[data-role="flight-scout"]')!;
    this.flightTimerEl = this.element.querySelector('[data-role="flight-timer"]')!;
    this.flightProgressBarEl = this.element.querySelector('[data-role="flight-progress"]')!;

    this.jumpBtn = this.element.querySelector('[data-action="airdrop-jump"]')!;
    this.jumpTitleEl = this.jumpBtn.querySelector('[data-role="jump-title"]')!;
    this.jumpSubEl = this.jumpBtn.querySelector('[data-role="jump-sub"]')!;
    this.deployBtn = this.element.querySelector('[data-action="airdrop-chute"]')!;
    this.deployTitleEl = this.deployBtn.querySelector('[data-role="deploy-title"]')!;
    this.deploySubEl = this.deployBtn.querySelector('[data-role="deploy-sub"]');
    this.steeringHintEl = this.element.querySelector('[data-role="steering-hint"]')!;

    this.altLabelEl = this.element.querySelector('[data-role="alt-label"]')!;
    this.speedLabelEl = this.element.querySelector('[data-role="speed-label"]')!;
    this.altValueEl = this.element.querySelector('[data-role="alt-value"]')!;
    this.speedValueEl = this.element.querySelector('[data-role="speed-value"]')!;
    this.phaseTagEl = this.element.querySelector('[data-role="phase-tag"]')!;
    this.altMarkerEl = this.element.querySelector('[data-role="alt-marker"]')!;

    this.applyStaticTranslations();

    this.jumpBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.jumpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.jumpBtn.blur();
      this.callbacks.onJump();
    });
    this.deployBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.deployBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deployBtn.blur();
      this.callbacks.onDeployParachute();
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.applyStaticTranslations();
      this.clearCaches();
      if (this.lastSnapshot && this.lastActive) {
        this.sync(this.lastSnapshot);
      }
    });
  }

  private applyStaticTranslations(): void {
    this.flightScoutEl.textContent = i18n.t('airdrop.dragScout');
    this.altLabelEl.textContent = i18n.t('airdrop.altShort');
    this.speedLabelEl.textContent = i18n.t('airdrop.speedShort');
    this.jumpTitleEl.textContent = i18n.t('airdrop.jumpAction');
    this.jumpSubEl.textContent = i18n.t('airdrop.exitSub');
    this.deployTitleEl.textContent = i18n.t('airdrop.chuteHintMobile');
  }

  private clearCaches(): void {
    this.lastAltText = '';
    this.lastSpdText = '';
    this.lastFlightTitle = '';
    this.lastFlightRoute = '';
    this.lastFlightTimer = '';
    this.lastDeploySub = '';
    this.lastHint = '';
    this.lastPhaseTag = '';
  }

  sync(snap: AirplaneDropSnapshot): void {
    this.lastSnapshot = snap;
    const active =
      snap.phase === 'airplane' || snap.phase === 'freefall' || snap.phase === 'parachute';
    if (this.lastActive !== active) {
      this.lastActive = active;
      this.element.style.display = active ? 'flex' : 'none';
    }
    if (!active) return;

    const altRounded = Math.round(snap.altitudeMeters);
    const spdRounded = Math.round(snap.totalSpeedMps);
    const altText = i18n.t('common.metersShort', { m: altRounded });
    if (this.lastAltText !== altText) {
      this.lastAltText = altText;
      this.altValueEl.textContent = altText;
    }
    const spdText = i18n.t('common.mpsShort', { v: snap.phase === 'airplane' ? 24 : spdRounded });
    if (this.lastSpdText !== spdText) {
      this.lastSpdText = spdText;
      this.speedValueEl.textContent = spdText;
    }

    const maxRefAlt = 155;
    const altPct = clamp((snap.altitudeMeters / maxRefAlt) * 100, 0, 100);
    const altHeight = `${altPct.toFixed(1)}%`;
    if (this.lastAltHeight !== altHeight) {
      this.lastAltHeight = altHeight;
      this.altMarkerEl.style.height = altHeight;
    }

    const modeKey = `${snap.phase}:${snap.canDeployParachute ? 1 : 0}`;
    if (modeKey !== this.lastModeKey) {
      this.lastModeKey = modeKey;
      if (snap.phase === 'airplane') {
        this.flightBannerEl.style.display = 'flex';
        this.jumpBtn.classList.remove('hidden');
        this.deployBtn.classList.add('hidden');
      } else if (snap.phase === 'freefall') {
        this.flightBannerEl.style.display = 'none';
        this.jumpBtn.classList.add('hidden');
        this.deployBtn.classList.toggle('hidden', !snap.canDeployParachute);
      } else {
        this.flightBannerEl.style.display = 'none';
        this.jumpBtn.classList.add('hidden');
        this.deployBtn.classList.add('hidden');
      }
    }

    if (snap.phase === 'airplane') {
      const title = i18n.t('airdrop.transitTitle', {
        map: i18n.translateMapName(snap.mapName),
      });
      if (this.lastFlightTitle !== title) {
        this.lastFlightTitle = title;
        this.flightTitleEl.textContent = title;
      }
      const routeText = i18n.translateFlightLabel(snap.flightLabel, snap.flightLabel);
      if (this.lastFlightRoute !== routeText) {
        this.lastFlightRoute = routeText;
        this.flightRouteEl.textContent = routeText;
      }
      const timer = i18n.t('airdrop.autoDropCountdown', {
        s: Math.ceil(snap.timeRemainingInPlaneSec),
      });
      if (this.lastFlightTimer !== timer) {
        this.lastFlightTimer = timer;
        this.flightTimerEl.textContent = timer;
      }
      const prog = `${Math.round(snap.flightProgress * 100)}%`;
      if (this.lastFlightProg !== prog) {
        this.lastFlightProg = prog;
        this.flightProgressBarEl.style.width = prog;
      }

      const hint = i18n.t('airdrop.dragScoutFull');
      if (this.lastHint !== hint) {
        this.lastHint = hint;
        this.steeringHintEl.textContent = hint;
      }
      const phaseText = i18n.t('airdrop.phase.airplane');
      if (this.lastPhaseTag !== phaseText) {
        this.lastPhaseTag = phaseText;
        this.phaseTagEl.textContent = phaseText;
      }
      const phaseCls = 'text-[10px] font-black tracking-wider text-amber-300 uppercase block';
      if (this.lastPhaseClass !== phaseCls) {
        this.lastPhaseClass = phaseCls;
        this.phaseTagEl.className = phaseCls;
      }
      const altCls = 'absolute bottom-0 left-0 right-0 bg-amber-400';
      if (this.lastAltClass !== altCls) {
        this.lastAltClass = altCls;
        this.altMarkerEl.className = altCls;
      }
    } else if (snap.phase === 'freefall') {
      if (snap.canDeployParachute && this.deploySubEl) {
        const subText = i18n.t('airdrop.chuteHintDesktop');
        if (this.lastDeploySub !== subText) {
          this.lastDeploySub = subText;
          this.deploySubEl.textContent = subText;
        }
      }
      const hint = i18n.t('airdrop.freefallHint');
      if (this.lastHint !== hint) {
        this.lastHint = hint;
        this.steeringHintEl.textContent = hint;
      }
      const phaseText = i18n.t('airdrop.phase.freefall');
      if (this.lastPhaseTag !== phaseText) {
        this.lastPhaseTag = phaseText;
        this.phaseTagEl.textContent = phaseText;
      }
      const phaseCls = 'text-[10px] font-black tracking-wider text-orange-400 uppercase block';
      if (this.lastPhaseClass !== phaseCls) {
        this.lastPhaseClass = phaseCls;
        this.phaseTagEl.className = phaseCls;
      }
      const altCls = 'absolute bottom-0 left-0 right-0 bg-orange-500';
      if (this.lastAltClass !== altCls) {
        this.lastAltClass = altCls;
        this.altMarkerEl.className = altCls;
      }
    } else {
      const hint = i18n.t('airdrop.steerHintFull');
      if (this.lastHint !== hint) {
        this.lastHint = hint;
        this.steeringHintEl.textContent = hint;
      }
      const pTag =
        altRounded <= 22 ? i18n.t('airdrop.phase.landed') : i18n.t('airdrop.phase.parachute');
      if (this.lastPhaseTag !== pTag) {
        this.lastPhaseTag = pTag;
        this.phaseTagEl.textContent = pTag;
      }
      const phaseCls =
        altRounded <= 22
          ? 'text-[10px] font-black tracking-wider text-amber-300 uppercase block'
          : 'text-[10px] font-black tracking-wider text-emerald-400 uppercase block';
      if (this.lastPhaseClass !== phaseCls) {
        this.lastPhaseClass = phaseCls;
        this.phaseTagEl.className = phaseCls;
      }
      const altCls = 'absolute bottom-0 left-0 right-0 bg-emerald-400';
      if (this.lastAltClass !== altCls) {
        this.lastAltClass = altCls;
        this.altMarkerEl.className = altCls;
      }
    }
  }

  reset(): void {
    this.lastActive = false;
    this.lastModeKey = '';
    this.lastSnapshot = null;
    this.element.style.display = 'none';
    this.jumpBtn.classList.add('hidden');
    this.deployBtn.classList.add('hidden');
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
  }
}
