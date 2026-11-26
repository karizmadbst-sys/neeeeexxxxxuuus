import type { LoadingProgress } from '../../core/LoadingManager';
import type { DeviceProfile } from '../../core/Types';
import { i18n } from '../../i18n/I18nManager';

export class LoadingScreen {
  readonly element: HTMLElement;
  private progressBar!: HTMLElement;
  private percentText!: HTMLElement;
  private statusText!: HTMLElement;
  private lastProgress: LoadingProgress | null = null;
  private unsubI18n: (() => void) | null = null;

  constructor(private readonly deviceProfile: DeviceProfile) {
    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-40 flex flex-col items-center justify-between bg-[#070b14] safe-pad pointer-events-auto';

    this.renderShell();
    this.unsubI18n = i18n.subscribe(() => {
      this.renderShell();
      if (this.lastProgress) {
        this.updateProgress(this.lastProgress);
      }
    });
  }

  private renderShell(): void {
    const pct = this.lastProgress
      ? Math.round(Math.max(0, Math.min(1, this.lastProgress.progress)) * 100)
      : 0;
    const statusLabel = this.lastProgress
      ? i18n.translateLoadingStage(this.lastProgress.label)
      : i18n.t('loading.webglCore');
    const tagline = i18n.translateTagline(0);
    const tierLabel = i18n.translatePerformanceTier(this.deviceProfile.performanceTier);
    const deviceCat = i18n.translateDeviceCategory(this.deviceProfile.category);
    const touchVal = this.deviceProfile.hasTouch ? i18n.t('loading.yes') : i18n.t('loading.no');
    const qualityVal = i18n.translateQualityPreset(this.deviceProfile.recommendedQuality);

    this.element.innerHTML = `
      <div class="w-full max-w-2xl flex items-center justify-between text-[10px] sm:text-xs uppercase tracking-[0.2em] text-slate-400 shrink-0">
        <span>${i18n.t('loading.badgePhase')}</span>
        <span class="tabular-nums text-sky-400">${tierLabel}</span>
      </div>

      <div class="w-full max-w-xl flex flex-col items-center text-center px-4 my-auto">
        <svg class="w-10 h-10 sm:w-16 sm:h-16 mb-2 sm:mb-4 text-orange-500" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <polygon points="32,4 58,19 58,45 32,60 6,45 6,19" stroke="currentColor" stroke-width="2.5" fill="rgba(249,115,22,0.12)" />
          <polygon points="32,14 48,23 48,41 32,50 16,41 16,23" stroke="#38bdf8" stroke-width="2" />
          <circle cx="32" cy="32" r="5" fill="#f97316" />
        </svg>
        <h1 class="text-2xl sm:text-5xl font-black tracking-[0.16em] text-white">${i18n.t('menu.title')}</h1>
        <p class="mt-1.5 sm:mt-3 text-xs sm:text-base text-slate-300 tracking-wide">"${tagline}"</p>

        <div class="w-full mt-5 sm:mt-10">
          <div class="flex items-center justify-between text-[11px] sm:text-xs font-medium text-slate-300 mb-1.5 sm:mb-2">
            <span data-role="status">${statusLabel}</span>
            <span data-role="percent" class="tabular-nums text-sky-400">${pct}%</span>
          </div>
          <div class="w-full h-2 sm:h-2.5 bg-slate-800/90 border border-slate-700 overflow-hidden rounded-sm">
            <div data-role="bar" class="h-full bg-gradient-to-r from-sky-400 via-cyan-300 to-orange-500 transition-[width] duration-150 ease-out" style="width:${pct}%"></div>
          </div>
        </div>
      </div>

      <div class="w-full max-w-2xl flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-1 text-[10px] sm:text-[11px] uppercase tracking-widest text-slate-500 shrink-0">
        <span>${i18n.t('loading.deviceLabel')} ${deviceCat}</span>
        <span>${i18n.t('loading.touchLabel')} ${touchVal}</span>
        <span>${i18n.t('loading.qualityLabel')} ${qualityVal}</span>
      </div>
    `;

    this.progressBar = this.element.querySelector('[data-role="bar"]')!;
    this.percentText = this.element.querySelector('[data-role="percent"]')!;
    this.statusText = this.element.querySelector('[data-role="status"]')!;
  }

  updateProgress(state: LoadingProgress): void {
    this.lastProgress = state;
    const pct = Math.round(Math.max(0, Math.min(1, state.progress)) * 100);
    this.progressBar.style.width = `${pct}%`;
    this.percentText.textContent = `${pct}%`;
    this.statusText.textContent = i18n.translateLoadingStage(state.label);
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
  }
}
