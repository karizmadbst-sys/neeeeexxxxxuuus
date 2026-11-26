import loadingBackdropUrl from '../../assets/images/nexus_loading_backdrop_1795433423083.jpg';
import { i18n } from '../../i18n/I18nManager';
import { clamp } from '../../utils/MathUtils';

const POST_LOGIN_DURATION_MS = 5_000;
const MAX_PENDING_PROGRESS = 0.92;
const COMPLETE_HOLD_MS = 90;

export interface PostLoginLoadingCallbacks {
  onRetry: () => void;
  onBackToAuth: () => void;
}

const NEXUS_LOGO_SVG = `
  <svg class="w-11 h-11 sm:w-14 sm:h-14 shrink-0" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <polygon points="32,4 58,19 58,45 32,60 6,45 6,19" stroke="#f97316" stroke-width="2.5" fill="rgba(249,115,22,0.14)" />
    <polygon points="32,14 48,23 48,41 32,50 16,41 16,23" stroke="#38bdf8" stroke-width="2" />
    <circle cx="32" cy="32" r="5" fill="#f97316" />
  </svg>
`;

export class PostLoginLoadingScreen {
  readonly element: HTMLElement;

  private readonly badgeEl: HTMLElement;
  private readonly subBadgeEl: HTMLElement;
  private readonly brandTitleEl: HTMLElement;
  private readonly headingEl: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly percentEl: HTMLElement;
  private readonly countdownEl: HTMLElement;
  private readonly fillEl: HTMLElement;
  private readonly progressPanelEl: HTMLElement;
  private readonly errorPanelEl: HTMLElement;
  private readonly errorTitleEl: HTMLElement;
  private readonly errorMessageEl: HTMLElement;
  private readonly retryBtnEl: HTMLButtonElement;
  private readonly backBtnEl: HTMLButtonElement;

  private rafId = 0;
  private completeTimeoutId = 0;
  private activeToken = 0;
  private startedAtMs = 0;
  private dataReady = false;
  private dataReadyAtMs = 0;
  private dataReadyAnchorProgress = 0;
  private displayedProgress = 0;
  private failed = false;
  private completed = false;
  private lastCountdownSec = 5;
  private stageText = '';
  private errorMessage = '';
  private onCompleteCb: (() => void) | null = null;
  private unsubI18n: (() => void) | null = null;

  constructor(private readonly callbacks: PostLoginLoadingCallbacks) {
    this.element = document.createElement('div');
    this.element.setAttribute('data-screen', 'login-loading');
    this.element.setAttribute('role', 'progressbar');
    this.element.setAttribute('aria-valuemin', '0');
    this.element.setAttribute('aria-valuemax', '100');
    this.element.setAttribute('aria-valuenow', '0');
    this.element.className =
      'absolute inset-0 z-40 flex flex-col justify-between bg-[#070b14] pointer-events-auto overflow-hidden select-none';

    this.element.innerHTML = `
      <!-- Cinematic Battle Royale Key-Art Backdrop -->
      <div
        class="absolute inset-0 pointer-events-none overflow-hidden"
        style="background: radial-gradient(circle at 50% 35%, rgba(56,189,248,0.18) 0%, rgba(249,115,22,0.12) 42%, #070b14 82%);"
        aria-hidden="true"
      >
        <img
          src="${loadingBackdropUrl}"
          alt=""
          decoding="async"
          fetchpriority="high"
          referrerpolicy="no-referrer"
          class="w-full h-full object-cover object-center opacity-85 nexus-auth-backdrop-anim select-none"
        />
        <div
          class="absolute inset-0"
          style="background: linear-gradient(180deg, rgba(7,11,20,0.82) 0%, rgba(7,11,20,0.22) 38%, rgba(7,11,20,0.94) 100%);"
        ></div>
      </div>

      <!-- Responsive Content Shell -->
      <div class="relative z-10 w-full h-full safe-pad nexus-scroll overflow-y-auto flex flex-col justify-between gap-4">
        <!-- Top Header & NEXUS ROYALE Brand Strip -->
        <header class="w-full max-w-5xl mx-auto flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            ${NEXUS_LOGO_SVG}
            <div class="flex flex-col min-w-0">
              <h1
                data-role="login-load-brand"
                class="text-xl sm:text-3xl font-black tracking-[0.16em] uppercase text-white leading-none truncate drop-shadow-[0_3px_14px_rgba(0,0,0,0.9)]"
              >${i18n.t('menu.title')}</h1>
              <span
                data-role="login-load-subbadge"
                class="mt-1 text-[10px] sm:text-xs font-extrabold tracking-[0.22em] uppercase text-orange-400 truncate"
              >${i18n.t('loading.badge')}</span>
            </div>
          </div>

          <span
            data-role="login-load-badge"
            class="hidden sm:inline-block text-[10px] sm:text-xs font-extrabold tracking-[0.22em] uppercase text-sky-300/90 shrink-0"
          >${i18n.t('loginLoad.badge')}</span>
        </header>

        <!-- Bottom Docked Loading Progress & Error Recovery Card -->
        <footer class="w-full max-w-3xl mx-auto mt-auto shrink-0">
          <div class="nexus-panel rounded-lg border border-sky-400/35 p-4 sm:p-6 flex flex-col gap-3.5">
            <!-- Active Loading State -->
            <div data-role="login-load-progress-panel" class="flex flex-col gap-3">
              <div class="flex items-end justify-between gap-4 min-w-0">
                <div class="flex flex-col gap-1 min-w-0">
                  <span
                    data-role="login-load-heading"
                    class="text-sm sm:text-base font-black tracking-[0.2em] uppercase text-white"
                  >${i18n.t('loginLoad.heading')}</span>
                  <span
                    data-role="login-load-stage"
                    class="text-xs sm:text-sm font-semibold text-slate-300 truncate"
                  >${i18n.t('loginLoad.stage.session')}</span>
                </div>

                <div class="flex items-baseline gap-2.5 shrink-0 tabular-nums whitespace-nowrap">
                  <span
                    data-role="login-load-percent"
                    class="text-lg sm:text-2xl font-black text-sky-300"
                  >0%</span>
                  <span class="text-slate-500 font-bold" aria-hidden="true">&middot;</span>
                  <span
                    data-role="login-load-countdown"
                    class="text-sm sm:text-base font-black text-amber-300"
                  >5s</span>
                </div>
              </div>

              <!-- Smooth GPU-Composited Progress Track -->
              <div class="relative w-full h-2.5 sm:h-3 rounded-sm bg-slate-900/95 border border-slate-700/80 overflow-hidden">
                <div
                  data-role="login-load-fill"
                  class="absolute inset-0"
                  style="
                    background: linear-gradient(90deg, #38bdf8 0%, #22d3ee 48%, #f97316 100%);
                    box-shadow: 0 0 18px rgba(56, 189, 248, 0.55);
                    transform: scaleX(0);
                    transform-origin: left center;
                    will-change: transform;
                  "
                ></div>
              </div>
            </div>

            <!-- Connection / Data Failure Recovery Panel -->
            <div
              data-role="login-load-error"
              role="alert"
              class="hidden flex-col gap-3 pt-1 border-t border-rose-500/30"
            >
              <div class="flex items-start gap-2.5">
                <svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span
                    data-role="login-load-error-title"
                    class="text-xs font-black tracking-[0.16em] uppercase text-rose-300"
                  >${i18n.t('loginLoad.errorTitle')}</span>
                  <p
                    data-role="login-load-error-message"
                    class="text-xs sm:text-sm font-medium text-rose-100 leading-snug"
                  ></p>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  data-action="login-load-back"
                  class="nexus-btn-secondary px-4 py-2.5 rounded-md text-xs font-extrabold tracking-[0.14em] uppercase min-h-[42px] cursor-pointer"
                >${i18n.t('loginLoad.backToAuth')}</button>
                <button
                  type="button"
                  data-action="login-load-retry"
                  class="nexus-btn-primary px-5 py-2.5 rounded-md text-xs font-black tracking-[0.16em] uppercase min-h-[42px] cursor-pointer"
                >${i18n.t('loginLoad.retry')}</button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    `;

    this.badgeEl = this.element.querySelector('[data-role="login-load-badge"]')!;
    this.subBadgeEl = this.element.querySelector('[data-role="login-load-subbadge"]')!;
    this.brandTitleEl = this.element.querySelector('[data-role="login-load-brand"]')!;
    this.headingEl = this.element.querySelector('[data-role="login-load-heading"]')!;
    this.stageEl = this.element.querySelector('[data-role="login-load-stage"]')!;
    this.percentEl = this.element.querySelector('[data-role="login-load-percent"]')!;
    this.countdownEl = this.element.querySelector('[data-role="login-load-countdown"]')!;
    this.fillEl = this.element.querySelector('[data-role="login-load-fill"]')!;
    this.progressPanelEl = this.element.querySelector('[data-role="login-load-progress-panel"]')!;
    this.errorPanelEl = this.element.querySelector('[data-role="login-load-error"]')!;
    this.errorTitleEl = this.element.querySelector('[data-role="login-load-error-title"]')!;
    this.errorMessageEl = this.element.querySelector('[data-role="login-load-error-message"]')!;
    this.retryBtnEl = this.element.querySelector('[data-action="login-load-retry"]')!;
    this.backBtnEl = this.element.querySelector('[data-action="login-load-back"]')!;

    this.retryBtnEl.addEventListener('click', () => {
      this.callbacks.onRetry();
    });
    this.backBtnEl.addEventListener('click', () => {
      this.callbacks.onBackToAuth();
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshStaticTexts();
    });
  }

  private refreshStaticTexts(): void {
    this.brandTitleEl.textContent = i18n.t('menu.title');
    this.subBadgeEl.textContent = i18n.t('loading.badge');
    this.badgeEl.textContent = i18n.t('loginLoad.badge');
    this.headingEl.textContent = i18n.t('loginLoad.heading');
    this.errorTitleEl.textContent = i18n.t('loginLoad.errorTitle');
    this.retryBtnEl.textContent = i18n.t('loginLoad.retry');
    this.backBtnEl.textContent = i18n.t('loginLoad.backToAuth');
    if (this.stageText) {
      this.stageEl.textContent = this.stageText;
    }
    this.countdownEl.textContent = i18n.t('common.secondsShort', { s: this.lastCountdownSec });
    const isRtl = document.documentElement.dir === 'rtl';
    this.fillEl.style.transformOrigin = isRtl ? 'right center' : 'left center';
  }

  start(onComplete: () => void): void {
    this.stopTimers();
    this.activeToken++;
    const token = this.activeToken;
    this.onCompleteCb = onComplete;
    this.startedAtMs = performance.now();
    this.dataReady = false;
    this.dataReadyAtMs = 0;
    this.dataReadyAnchorProgress = 0;
    this.displayedProgress = 0;
    this.failed = false;
    this.completed = false;
    this.lastCountdownSec = 5;
    this.errorMessage = '';
    this.stageText = i18n.t('loginLoad.stage.session');

    this.refreshStaticTexts();
    this.progressPanelEl.classList.remove('opacity-70');
    this.errorPanelEl.classList.add('hidden');
    this.errorPanelEl.classList.remove('flex');
    this.errorMessageEl.textContent = '';

    this.renderProgress(0, 5);

    const tick = (now: number) => {
      if (token !== this.activeToken || this.failed || this.completed) return;

      const elapsedMs = Math.max(0, now - this.startedAtMs);
      const remainingSec = Math.max(
        0,
        Math.ceil((POST_LOGIN_DURATION_MS - elapsedMs) / 1000),
      );

      let nextProgress: number;
      if (!this.dataReady) {
        // Strictly prevent displaying 100% while required data is still loading
        nextProgress = Math.min(
          MAX_PENDING_PROGRESS,
          (elapsedMs / POST_LOGIN_DURATION_MS) * MAX_PENDING_PROGRESS,
        );
        if (elapsedMs >= POST_LOGIN_DURATION_MS) {
          this.stageEl.textContent = i18n.t('loginLoad.stage.finalizing');
        }
      } else if (elapsedMs < POST_LOGIN_DURATION_MS) {
        const span = Math.max(1, POST_LOGIN_DURATION_MS - this.dataReadyAtMs);
        const t = clamp((elapsedMs - this.dataReadyAtMs) / span, 0, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        nextProgress =
          this.dataReadyAnchorProgress + (0.995 - this.dataReadyAnchorProgress) * eased;
      } else {
        // Both 5-second timer AND required data readiness are satisfied
        this.completed = true;
        this.displayedProgress = 1;
        this.stageText = i18n.t('loginLoad.stage.ready');
        this.stageEl.textContent = this.stageText;
        this.renderProgress(1, 0);
        this.rafId = 0;
        this.completeTimeoutId = window.setTimeout(() => {
          if (token !== this.activeToken || this.failed) return;
          const cb = this.onCompleteCb;
          this.onCompleteCb = null;
          cb?.();
        }, COMPLETE_HOLD_MS);
        return;
      }

      this.displayedProgress = Math.max(this.displayedProgress, Math.min(0.995, nextProgress));
      this.renderProgress(this.displayedProgress, remainingSec);
      this.rafId = window.requestAnimationFrame(tick);
    };

    this.rafId = window.requestAnimationFrame(tick);
  }

  setStageText(text: string): void {
    if (this.failed || this.completed) return;
    this.stageText = text;
    this.stageEl.textContent = text;
  }

  markDataReady(): void {
    if (this.failed || this.completed || this.dataReady) return;
    this.dataReady = true;
    this.dataReadyAtMs = performance.now() - this.startedAtMs;
    this.dataReadyAnchorProgress = this.displayedProgress;
  }

  setError(message: string): void {
    this.stopTimers();
    this.failed = true;
    this.dataReady = false;
    this.onCompleteCb = null;
    this.errorMessage = message || i18n.t('loginLoad.errDataLoad');

    // Never display 100% on error
    this.displayedProgress = Math.min(0.95, this.displayedProgress);
    this.renderProgress(this.displayedProgress, this.lastCountdownSec);

    this.progressPanelEl.classList.add('opacity-70');
    this.errorMessageEl.textContent = this.errorMessage;
    this.errorPanelEl.classList.remove('hidden');
    this.errorPanelEl.classList.add('flex');
  }

  stop(): void {
    this.stopTimers();
    this.activeToken++;
    this.onCompleteCb = null;
    this.dataReady = false;
    this.failed = false;
    this.completed = false;
  }

  private renderProgress(progress01: number, countdownSec: number): void {
    const safeProgress = clamp(progress01, 0, 1);
    const pct = Math.round(safeProgress * 100);
    this.lastCountdownSec = countdownSec;
    this.fillEl.style.transform = `scaleX(${safeProgress.toFixed(4)})`;
    this.percentEl.textContent = `${pct}%`;
    this.countdownEl.textContent = i18n.t('common.secondsShort', { s: countdownSec });
    this.element.setAttribute('aria-valuenow', String(pct));
  }

  private stopTimers(): void {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.completeTimeoutId) {
      clearTimeout(this.completeTimeoutId);
      this.completeTimeoutId = 0;
    }
  }

  dispose(): void {
    this.stop();
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.element.remove();
  }
}
