import type { DeviceProfile, Subsystem, ViewportMetrics } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import { tryLockLandscapeFullscreen } from '../utils/ResponsiveManager';

export class OrientationGuard implements Subsystem {
  readonly element: HTMLElement;

  private readonly badgeEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private readonly fullscreenBtnEl: HTMLButtonElement;
  private readonly dimsEl: HTMLElement;

  private blocked = false;
  private unsubI18n: (() => void) | null = null;
  private readonly onVisibilityOrFocusBound = () => {
    // Re-attempt lock cleanly if browser permits
    if (this.shouldEnforce()) {
      void tryLockLandscapeFullscreen(false);
    }
  };

  constructor(private readonly deviceProfile: DeviceProfile) {
    this.element = document.createElement('div');
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('data-role', 'orientation-guard');
    this.element.className =
      'hidden fixed inset-0 z-[90] bg-[#060a13]/96 safe-pad flex-col items-center justify-center text-center pointer-events-auto select-none';
    this.element.style.display = 'none';

    this.element.innerHTML = `
      <div class="nexus-panel max-w-sm w-full rounded-lg p-5 flex flex-col items-center gap-4 border border-orange-400/50">
        <span data-role="rotate-badge" class="px-2.5 py-1 rounded bg-orange-500/15 border border-orange-400/50 text-[10px] font-black tracking-[0.2em] uppercase text-orange-300">
          ${i18n.t('rotate.badge')}
        </span>

        <div class="w-20 h-20 flex items-center justify-center text-sky-300">
          <svg class="w-16 h-16 nexus-rotate-phone-anim" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <rect x="20" y="8" width="24" height="48" rx="4" stroke="currentColor" stroke-width="2.5" fill="rgba(56,189,248,0.1)" />
            <circle cx="32" cy="49" r="2" fill="#f97316" />
            <path d="M12 24c-3 5-3 11 0 16M52 24c3 5 3 11 0 16" stroke="#f97316" stroke-width="2" stroke-linecap="round" opacity="0.85" />
          </svg>
        </div>

        <div class="flex flex-col gap-1.5">
          <h2 data-role="rotate-title" class="text-lg font-black tracking-[0.14em] uppercase text-white">
            ${i18n.t('rotate.title')}
          </h2>
          <p data-role="rotate-desc" class="text-xs text-slate-300 leading-relaxed">
            ${i18n.t('rotate.desc')}
          </p>
        </div>

        <button
          type="button"
          data-action="lock-landscape"
          class="nexus-btn-primary w-full py-3 px-4 rounded text-xs font-black tracking-[0.16em] uppercase min-h-[44px]"
        >
          ${i18n.t('rotate.fullscreenBtn')}
        </button>

        <div data-role="rotate-dims" dir="ltr" class="text-[10px] font-bold tracking-wider uppercase text-slate-500 tabular-nums"></div>
      </div>
    `;

    this.badgeEl = this.element.querySelector('[data-role="rotate-badge"]')!;
    this.titleEl = this.element.querySelector('[data-role="rotate-title"]')!;
    this.descEl = this.element.querySelector('[data-role="rotate-desc"]')!;
    this.fullscreenBtnEl = this.element.querySelector('[data-action="lock-landscape"]')!;
    this.dimsEl = this.element.querySelector('[data-role="rotate-dims"]')!;

    this.fullscreenBtnEl.addEventListener('click', () => {
      void tryLockLandscapeFullscreen(true);
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.badgeEl.textContent = i18n.t('rotate.badge');
      this.titleEl.textContent = i18n.t('rotate.title');
      this.descEl.textContent = i18n.t('rotate.desc');
      this.fullscreenBtnEl.textContent = i18n.t('rotate.fullscreenBtn');
    });

    window.addEventListener('focus', this.onVisibilityOrFocusBound, { passive: true });
  }

  private shouldEnforce(): boolean {
    return this.deviceProfile.isMobile || this.deviceProfile.isTablet;
  }

  updateViewport(metrics: ViewportMetrics, activeScreen: string = 'main-menu'): boolean {
    const isGameplayScreen = activeScreen === 'test-arena' || activeScreen === 'control-editor';
    const shouldBlock = this.shouldEnforce() && isGameplayScreen && metrics.orientation === 'portrait';
    this.dimsEl.textContent = `${metrics.width}×${metrics.height} · ${metrics.orientation.toUpperCase()}`;

    document.documentElement.dataset.orientationBlocked = String(shouldBlock);
    if (shouldBlock !== this.blocked) {
      this.blocked = shouldBlock;
      this.element.classList.toggle('hidden', !shouldBlock);
      this.element.style.display = shouldBlock ? 'flex' : 'none';
    }
    return this.blocked;
  }

  isBlocked(): boolean {
    return this.blocked;
  }

  dispose(): void {
    window.removeEventListener('focus', this.onVisibilityOrFocusBound);
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.element.remove();
  }
}
