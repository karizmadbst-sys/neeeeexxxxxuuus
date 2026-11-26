import { resolvePublicAssetUrl } from '../../config/RuntimeConfig';
import { i18n } from '../../i18n/I18nManager';
import { clamp } from '../../utils/MathUtils';

const LOADING_ARTWORK_URL = resolvePublicAssetUrl(
  'assets/aistudio/__________________-_Brave_11_17_2026_6_21_20_AM_5ff39a2e.png',
);

const DEFAULT_DURATION_MS = 10_000;

export class WaitingLobbyLoadingOverlay {
  readonly element: HTMLElement;

  private readonly ambientImgEl: HTMLImageElement;
  private readonly heroImgEl: HTMLImageElement;
  private readonly titleEl: HTMLElement;
  private readonly destinationEl: HTMLElement;
  private readonly dockEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly percentEl: HTMLElement;
  private readonly countdownEl: HTMLElement;
  private readonly fillEl: HTMLElement;
  private readonly trackEl: HTMLElement;

  private active = false;
  private rafId = 0;
  private startedAtMs = 0;
  private durationMs = DEFAULT_DURATION_MS;
  private destinationMapLabel = '';
  private currentProgress = 0;
  private lastCountdownSec = 10;
  private lastStageIdx = -1;
  private onCompleteCb: (() => void) | null = null;
  private unsubI18n: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.setAttribute('data-role', 'waiting-lobby-loading');
    this.element.setAttribute('role', 'progressbar');
    this.element.setAttribute('aria-valuemin', '0');
    this.element.setAttribute('aria-valuemax', '100');
    this.element.setAttribute('aria-valuenow', '0');
    this.element.className =
      'hidden absolute inset-0 z-[80] w-full h-full overflow-hidden flex-col justify-between bg-[#070515] select-none pointer-events-auto';
    this.element.style.display = 'none';

    this.element.innerHTML = `
      <!-- Full-bleed atmospheric fallback & blurred ambient backfill for all aspect ratios/orientations -->
      <div
        class="absolute inset-0 pointer-events-none overflow-hidden"
        style="background: radial-gradient(circle at 50% 35%, rgba(217, 70, 239, 0.28) 0%, rgba(56, 189, 248, 0.14) 38%, rgba(7, 5, 21, 0.98) 82%);"
        aria-hidden="true"
      >
        <img
          data-role="ambient-art"
          src="${LOADING_ARTWORK_URL}"
          alt=""
          decoding="async"
          fetchpriority="high"
          referrerpolicy="no-referrer"
          class="absolute inset-0 w-full h-full object-cover object-center scale-110 blur-2xl opacity-60 brightness-50"
        />
      </div>

      <!-- Zero-crop responsive hero artwork layer centered cleanly inside viewport -->
      <div class="absolute inset-0 z-[1] flex items-center justify-center overflow-hidden pointer-events-none">
        <img
          data-role="hero-art"
          src="${LOADING_ARTWORK_URL}"
          alt="Nexus Royale waiting lobby artwork"
          decoding="async"
          fetchpriority="high"
          referrerpolicy="no-referrer"
          class="w-full h-full object-contain object-center"
        />
      </div>

      <!-- Measured contrast scrims at top & bottom edges -->
      <div
        class="absolute inset-x-0 top-0 h-[22%] z-[2] pointer-events-none"
        style="background: linear-gradient(180deg, rgba(6, 4, 18, 0.72) 0%, rgba(6, 4, 18, 0) 100%);"
        aria-hidden="true"
      ></div>
      <div
        class="absolute inset-x-0 bottom-0 h-[42%] z-[2] pointer-events-none"
        style="background: linear-gradient(0deg, rgba(5, 3, 14, 0.94) 0%, rgba(7, 5, 22, 0.68) 46%, rgba(7, 5, 22, 0) 100%);"
        aria-hidden="true"
      ></div>

      <!-- Top Header Strip (safe-area aware) -->
      <header
        class="relative z-[3] w-full shrink-0 pointer-events-none"
        style="padding: max(0.6rem, env(safe-area-inset-top, 0px)) max(1rem, env(safe-area-inset-right, 0px)) 0.35rem max(1rem, env(safe-area-inset-left, 0px));"
      >
        <div class="w-full max-w-5xl mx-auto flex items-center justify-between gap-3 min-w-0">
          <span
            data-role="brand-title"
            class="font-black tracking-[0.16em] uppercase text-white truncate drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]"
            style="font-size: clamp(0.8rem, 2.2vw, 1.15rem);"
          >${i18n.t('menu.title')}</span>
          <span
            data-role="destination"
            class="font-bold tracking-wider uppercase text-slate-200/95 truncate drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
            style="font-size: clamp(0.68rem, 1.7vw, 0.85rem);"
          ></span>
        </div>
      </header>

      <!-- Bottom Loading Progress & 10-Second Countdown Dock -->
      <footer
        class="relative z-[3] w-full shrink-0 mt-auto pointer-events-none"
        style="padding: 0.45rem max(0.85rem, env(safe-area-inset-right, 0px)) max(0.7rem, env(safe-area-inset-bottom, 0px)) max(0.85rem, env(safe-area-inset-left, 0px));"
      >
        <div
          data-role="dock"
          class="w-full max-w-3xl mx-auto rounded-xl border border-white/15 bg-[#0a071c]/82 backdrop-blur-md shadow-[0_14px_40px_rgba(0,0,0,0.72)] flex flex-col gap-2"
          style="padding: clamp(0.6rem, 1.6vh, 0.95rem) clamp(0.8rem, 2.4vw, 1.35rem);"
        >
          <div class="flex items-baseline justify-between gap-3 min-w-0">
            <span
              data-role="status"
              class="font-bold text-slate-100 truncate min-w-0"
              style="font-size: clamp(0.75rem, 2.1vw, 0.95rem);"
            >${i18n.t('lobbyLoading.preparing')}</span>

            <div
              class="flex items-baseline gap-2 shrink-0 whitespace-nowrap tabular-nums"
              style="font-size: clamp(0.78rem, 2.2vw, 1rem);"
            >
              <span data-role="percent" class="font-extrabold text-sky-300">0%</span>
              <span class="text-slate-400 font-bold" aria-hidden="true">·</span>
              <span data-role="countdown" class="font-black text-amber-300">10s</span>
            </div>
          </div>

          <div
            data-role="track"
            class="relative w-full rounded-full bg-slate-900/95 border border-white/15 overflow-hidden"
            style="height: clamp(0.55rem, 1.4vh, 0.78rem);"
          >
            <div
              data-role="fill"
              class="absolute inset-0 rounded-full"
              style="
                background: linear-gradient(90deg, #38bdf8 0%, #e879f9 55%, #f97316 100%);
                box-shadow: 0 0 14px rgba(232, 121, 249, 0.55);
                transform: scaleX(0);
                transform-origin: left center;
                will-change: transform;
              "
            ></div>
          </div>
        </div>
      </footer>
    `;

    this.ambientImgEl = this.element.querySelector('[data-role="ambient-art"]')!;
    this.heroImgEl = this.element.querySelector('[data-role="hero-art"]')!;
    this.titleEl = this.element.querySelector('[data-role="brand-title"]')!;
    this.destinationEl = this.element.querySelector('[data-role="destination"]')!;
    this.dockEl = this.element.querySelector('[data-role="dock"]')!;
    this.statusEl = this.element.querySelector('[data-role="status"]')!;
    this.percentEl = this.element.querySelector('[data-role="percent"]')!;
    this.countdownEl = this.element.querySelector('[data-role="countdown"]')!;
    this.fillEl = this.element.querySelector('[data-role="fill"]')!;
    this.trackEl = this.element.querySelector('[data-role="track"]')!;

    const hideBrokenImg = (img: HTMLImageElement) => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      });
    };
    hideBrokenImg(this.ambientImgEl);
    hideBrokenImg(this.heroImgEl);

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocalizedCopy();
    });
  }

  isActive(): boolean {
    return this.active;
  }

  updateViewport(): void {
    // Keep fill transform-origin aligned with RTL/LTR text direction cleanly
    const isRtl = document.documentElement.dir === 'rtl';
    this.fillEl.style.transformOrigin = isRtl ? 'right center' : 'left center';
    const compactH = window.innerHeight <= 420;
    this.dockEl.style.gap = compactH ? '0.35rem' : '';
    this.trackEl.style.height = compactH ? '0.5rem' : 'clamp(0.55rem, 1.4vh, 0.78rem)';
  }

  start(
    destinationMapLabel: string,
    onComplete: () => void,
    durationMs = DEFAULT_DURATION_MS,
  ): boolean {
    if (this.active) {
      return false;
    }

    this.active = true;
    this.durationMs = Math.max(1000, durationMs);
    this.destinationMapLabel = destinationMapLabel;
    this.onCompleteCb = onComplete;
    this.currentProgress = 0;
    this.lastCountdownSec = Math.ceil(this.durationMs / 1000);
    this.lastStageIdx = -1;

    this.updateViewport();
    this.refreshLocalizedCopy();
    this.renderFrame(0);

    this.element.classList.remove('hidden');
    this.element.style.display = 'flex';

    this.startedAtMs = performance.now();
    this.rafId = window.requestAnimationFrame(this.tick);
    return true;
  }

  hide(): void {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.active = false;
    this.onCompleteCb = null;
    this.element.classList.add('hidden');
    this.element.style.display = 'none';
  }

  private readonly tick = (nowMs: number): void => {
    if (!this.active) return;

    const elapsedMs = Math.max(0, nowMs - this.startedAtMs);
    const progress = clamp(elapsedMs / this.durationMs, 0, 1);
    this.renderFrame(progress);

    if (elapsedMs >= this.durationMs) {
      this.rafId = 0;
      const done = this.onCompleteCb;
      this.onCompleteCb = null;
      if (done) {
        done();
      }
      this.hide();
      return;
    }

    this.rafId = window.requestAnimationFrame(this.tick);
  };

  private renderFrame(progress: number): void {
    this.currentProgress = progress;
    const pct = Math.round(progress * 100);
    const remainingMs = Math.max(0, (1 - progress) * this.durationMs);
    const countdownSec = progress >= 1 ? 0 : Math.ceil(remainingMs / 1000);

    this.fillEl.style.transform = `scaleX(${progress.toFixed(4)})`;
    this.percentEl.textContent = `${pct}%`;
    this.element.setAttribute('aria-valuenow', String(pct));

    if (countdownSec !== this.lastCountdownSec || progress === 0 || progress >= 1) {
      this.lastCountdownSec = countdownSec;
      this.countdownEl.textContent = i18n.t('common.secondsShort', { s: countdownSec });
    }

    const stageIdx =
      progress < 0.25 ? 0 : progress < 0.55 ? 1 : progress < 0.85 ? 2 : 3;
    if (stageIdx !== this.lastStageIdx) {
      this.lastStageIdx = stageIdx;
      this.statusEl.textContent = this.getStageText(stageIdx);
    }
  }

  private getStageText(stageIdx: number): string {
    switch (stageIdx) {
      case 0:
        return i18n.t('lobbyLoading.preparing');
      case 1:
        return i18n.t('lobbyLoading.loadingArena');
      case 2:
        return i18n.t('lobbyLoading.syncingPlayers');
      default:
        return i18n.t('lobbyLoading.entering');
    }
  }

  private refreshLocalizedCopy(): void {
    this.titleEl.textContent = i18n.t('menu.title');
    this.destinationEl.textContent = this.destinationMapLabel
      ? i18n.t('lobbyLoading.destination', { map: this.destinationMapLabel })
      : '';
    this.countdownEl.textContent = i18n.t('common.secondsShort', {
      s: this.lastCountdownSec,
    });
    this.statusEl.textContent = this.getStageText(Math.max(0, this.lastStageIdx));
    const isRtl = document.documentElement.dir === 'rtl';
    this.fillEl.style.transformOrigin = isRtl ? 'right center' : 'left center';
    if (this.active) {
      this.fillEl.style.transform = `scaleX(${this.currentProgress.toFixed(4)})`;
    }
  }

  dispose(): void {
    this.hide();
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.element.remove();
  }
}
