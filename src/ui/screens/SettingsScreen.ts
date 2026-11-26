import type { SettingsManager } from '../../core/SettingsManager';
import type {
  AppLanguage,
  DeviceProfile,
  FpsLimit,
  GameSettings,
  GlooWallPlacementMode,
  QualityPreset,
  ViewportMetrics,
} from '../../core/Types';
import { i18n } from '../../i18n/I18nManager';
import type { ControlSettings, GameAction } from '../../input/ControlSettings';
import { getGlooWallSvg } from '../icons/GameIcons';

export interface SettingsAccountInfo {
  username: string;
  playerId: string;
  numericId: string;
  email: string | null;
  emailVerified: boolean;
}

export interface SettingsScreenCallbacks {
  onOpenLayoutEditor: () => void;
  onOpenProfile?: () => void;
  onSignOut?: () => Promise<void> | void;
  onBack: () => void;
}

const REBINDABLE_ACTIONS: readonly GameAction[] = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'fire',
  'aim',
  'reload',
  'jump',
  'sprint',
  'crouch',
  'prone',
  'pickup',
  'drop',
  'ability',
  'glooWall',
  'weaponSwitch',
  'holster',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'useMedkit',
  'useSpecial',
  'inventory',
  'minimap',
];

export class SettingsScreen {
  readonly element: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly hdrTitleEl: HTMLElement;
  private readonly hdrSubEl: HTMLElement;
  private readonly closeBtnEl: HTMLButtonElement;
  private readonly resetBtnEl: HTMLButtonElement;
  private readonly doneBtnEl: HTMLButtonElement;
  private capturingAction: GameAction | null = null;
  private unsubI18n: (() => void) | null = null;
  private unsubSettings: (() => void) | null = null;
  private suppressSettingsRerender = false;
  private lastRenderedSupportedFpsCount = 0;
  private lastRenderedGlooMode: GlooWallPlacementMode = 'auto';
  private accountInfo: SettingsAccountInfo | null = null;
  private signingOut = false;

  private readonly onCaptureKeyDownBound = (e: KeyboardEvent) => {
    if (!this.capturingAction) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.code !== 'Escape') {
      this.controlSettings.setKeyBinding(this.capturingAction, e.code);
    }
    this.stopCapture();
  };

  private readonly onCaptureMouseDownBound = (e: MouseEvent) => {
    if (!this.capturingAction) return;
    e.preventDefault();
    e.stopPropagation();

    this.controlSettings.setKeyBinding(this.capturingAction, `Mouse${e.button}`);
    this.stopCapture();
  };

  constructor(
    private readonly settingsManager: SettingsManager,
    private readonly controlSettings: ControlSettings,
    private readonly deviceProfile: DeviceProfile,
    private metrics: ViewportMetrics,
    private readonly callbacks: SettingsScreenCallbacks,
  ) {
    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-30 flex items-center justify-center safe-pad bg-[#070b14]/75 pointer-events-auto';

    this.element.innerHTML = `
      <div class="nexus-panel w-full max-w-2xl max-h-full flex flex-col rounded overflow-hidden">
        <header class="nr-studio-header flex items-center justify-between px-3.5 sm:px-5 py-2.5 sm:py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 data-role="hdr-title" class="text-base sm:text-lg font-black tracking-[0.16em] text-white uppercase">${i18n.t('settings.headerTitle')}</h2>
            <p data-role="hdr-sub" class="text-[11px] sm:text-xs text-slate-400">${i18n.t('settings.headerSub')}</p>
          </div>
          <button
            type="button"
            data-action="back"
            class="nexus-btn-secondary px-3.5 sm:px-4 py-1.5 sm:py-2 rounded text-xs font-bold tracking-widest uppercase min-h-[36px] sm:min-h-[40px]"
          >
            ${i18n.t('common.close')}
          </button>
        </header>

        <div data-role="body" class="nexus-scroll overflow-y-auto p-3.5 sm:p-5 flex flex-col gap-4 sm:gap-6"></div>

        <footer class="flex items-center justify-between px-3.5 sm:px-5 py-2.5 sm:py-3.5 border-t border-slate-800 shrink-0 bg-slate-950/60">
          <button
            type="button"
            data-action="reset"
            class="nexus-btn-secondary px-3 sm:px-3.5 py-1.5 sm:py-2 rounded text-xs font-semibold tracking-wider uppercase"
          >
            ${i18n.t('settings.resetAll')}
          </button>
          <button
            type="button"
            data-action="done"
            class="nexus-btn-primary px-4 sm:px-5 py-1.5 sm:py-2 rounded text-xs font-extrabold tracking-widest uppercase"
          >
            ${i18n.t('settings.applyBack')}
          </button>
        </footer>
      </div>
    `;

    this.bodyEl = this.element.querySelector('[data-role="body"]')!;
    this.hdrTitleEl = this.element.querySelector('[data-role="hdr-title"]')!;
    this.hdrSubEl = this.element.querySelector('[data-role="hdr-sub"]')!;
    this.closeBtnEl = this.element.querySelector<HTMLButtonElement>('[data-action="back"]')!;
    this.resetBtnEl = this.element.querySelector<HTMLButtonElement>('[data-action="reset"]')!;
    this.doneBtnEl = this.element.querySelector<HTMLButtonElement>('[data-action="done"]')!;

    this.closeBtnEl.addEventListener('click', () => {
      this.stopCapture();
      this.callbacks.onBack();
    });
    this.doneBtnEl.addEventListener('click', () => {
      this.stopCapture();
      this.callbacks.onBack();
    });
    this.resetBtnEl.addEventListener('click', () => {
      this.stopCapture();
      this.settingsManager.resetToDefaults();
      this.controlSettings.resetKeyBindings();
      this.controlSettings.resetLayout('landscape');
      this.controlSettings.resetLayout('portrait');
      this.render();
    });

    this.render();
    this.unsubI18n = i18n.subscribe(() => this.render());
    this.unsubSettings = this.settingsManager.onChange((nextSettings) => {
      if (this.suppressSettingsRerender) return;
      if (
        this.lastRenderedSupportedFpsCount !== this.deviceProfile.supportedFpsOptions.length ||
        this.lastRenderedGlooMode !== nextSettings.controls.glooPlacementMode
      ) {
        this.render();
        return;
      }
      const mutedInput = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="muted"]');
      if (mutedInput) mutedInput.checked = nextSettings.audio.muted;
      const musicMutedInput = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="musicMuted"]');
      if (musicMutedInput) musicMutedInput.checked = nextSettings.audio.musicMuted;
      const musicSlider = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="musicVolume"]');
      const musicValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="music-volume-val"]');
      const musicPct = Math.round(nextSettings.audio.musicVolume * 100);
      if (musicSlider) musicSlider.value = String(musicPct);
      if (musicValEl) {
        musicValEl.textContent = nextSettings.audio.musicMuted ? i18n.t('common.off') : `${musicPct}%`;
      }
      const sensSlider = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="sensitivity"]');
      const sensValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="sensitivity-val"]');
      if (sensSlider) sensSlider.value = String(Math.round(nextSettings.controls.lookSensitivity * 100));
      if (sensValEl) sensValEl.textContent = `${nextSettings.controls.lookSensitivity.toFixed(2)}x`;
      const adsSlider = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="adsSensitivity"]');
      const adsValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="ads-sensitivity-val"]');
      if (adsSlider) adsSlider.value = String(Math.round(nextSettings.controls.adsSensitivity * 100));
      if (adsValEl) adsValEl.textContent = `${nextSettings.controls.adsSensitivity.toFixed(2)}x`;
      const stabilitySlider = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="aimStability"]');
      const stabilityValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="aim-stability-val"]');
      const stabilityPct = Math.round(nextSettings.controls.aimStability * 100);
      if (stabilitySlider) stabilitySlider.value = String(stabilityPct);
      if (stabilityValEl) stabilityValEl.textContent = `${stabilityPct}%`;
    });
  }

  setAccountInfo(info: SettingsAccountInfo | null): void {
    this.accountInfo = info;
    this.signingOut = false;
    this.render();
  }

  updateViewport(metrics: ViewportMetrics): void {
    this.metrics = metrics;
    this.render();
  }

  render(): void {
    const s = this.settingsManager.getSettings();
    const bindings = this.controlSettings.getKeyBindings();
    const activeLang = s.language ?? i18n.getLanguage();
    const langOptions = i18n.getLanguageOptions();

    this.hdrTitleEl.textContent = i18n.t('settings.headerTitle');
    this.hdrSubEl.textContent = i18n.t('settings.headerSub');
    this.closeBtnEl.textContent = i18n.t('common.close');
    this.resetBtnEl.textContent = i18n.t('settings.resetAll');
    this.doneBtnEl.textContent = i18n.t('settings.applyBack');

    const langButtonsHtml = langOptions
      .map((opt) => {
        const active = opt.id === activeLang;
        return `
          <button
            type="button"
            data-lang="${opt.id}"
            dir="${opt.dir}"
            class="${
              active
                ? 'nexus-btn-primary border border-orange-300/80 shadow-[0_0_16px_rgba(249,115,22,0.35)]'
                : 'nexus-btn-secondary border border-slate-700/80'
            } flex-1 min-w-[110px] px-3.5 py-2.5 rounded flex items-center justify-center gap-2 text-xs sm:text-sm font-black tracking-wide"
          >
            <span>${opt.nativeLabel}</span>
          </button>
        `;
      })
      .join('');

    const keyRowsHtml = REBINDABLE_ACTIONS.map((action) => {
      const isCapturing = this.capturingAction === action;
      const label = i18n.translateKeyActionLabel(action);
      const codeText = isCapturing
        ? i18n.t('settings.keybindings.pressPrompt')
        : i18n.translateBindingCode(bindings[action]);
      return `
        <div class="flex items-center justify-between bg-slate-900/75 px-3 py-2 rounded border ${
          isCapturing ? 'border-orange-400' : 'border-slate-800'
        }">
          <span class="text-xs font-medium text-slate-200">${label}</span>
          <button
            type="button"
            data-rebind="${action}"
            class="${
              isCapturing ? 'nexus-btn-primary' : 'nexus-btn-secondary'
            } px-3 py-1 rounded text-[11px] font-bold tracking-wider uppercase min-w-[76px]"
          >
            ${codeText}
          </button>
        </div>
      `;
    }).join('');

    const qualityDesc =
      s.graphics.quality === 'low'
        ? i18n.t('settings.graphics.descSmooth')
        : s.graphics.quality === 'medium'
          ? i18n.t('settings.graphics.descStandard')
          : i18n.t('settings.graphics.descUltra');
    const recommendedLabel = i18n.translateQualityPreset(this.deviceProfile.recommendedQuality);
    const orientationLabel =
      this.metrics.orientation === 'landscape'
        ? i18n.t('settings.orientation.landscape')
        : i18n.t('settings.orientation.portrait');

    this.bodyEl.innerHTML = `
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">${i18n.t('lang.title')}</h3>
          <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">${i18n.t('lang.savedBadge')}</span>
        </div>
        <div class="flex flex-col gap-2.5 bg-slate-900/80 p-3.5 rounded border border-amber-400/25">
          <div class="text-xs text-slate-300">${i18n.t('lang.subtitle')}</div>
          <div class="flex flex-wrap gap-2" data-group="language">
            ${langButtonsHtml}
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">${i18n.t('settings.section.account')}</h3>
          <span class="text-[10px] font-bold uppercase tracking-wider ${
            this.accountInfo?.emailVerified ? 'text-emerald-400' : 'text-slate-400'
          }">${this.accountInfo?.emailVerified ? i18n.t('settings.account.verifiedStatus') : i18n.t('settings.account.guestStatus')}</span>
        </div>
        <div class="bg-slate-900/80 p-3.5 rounded border border-slate-800 flex flex-col gap-3">
          ${
            this.accountInfo
              ? `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div class="bg-slate-950/75 border border-slate-800/80 rounded p-2.5 min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${i18n.t('settings.account.username')}</div>
                    <div class="text-sm font-extrabold text-white truncate mt-0.5">${this.escapeHtml(this.accountInfo.username)}</div>
                  </div>
                  <div class="bg-slate-950/75 border border-slate-800/80 rounded p-2.5 min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${i18n.t('settings.account.nexusId')}</div>
                    <div class="text-sm font-extrabold text-sky-300 tabular-nums truncate mt-0.5">${this.escapeHtml(this.accountInfo.numericId)}</div>
                  </div>
                  <div class="bg-slate-950/75 border border-slate-800/80 rounded p-2.5 min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${i18n.t('settings.account.email')}</div>
                    <div class="text-xs font-bold text-slate-200 truncate mt-1">${this.escapeHtml(this.accountInfo.email || '—')}</div>
                  </div>
                </div>
              `
              : ''
          }
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span class="text-[11px] text-slate-400 leading-snug">${i18n.t('settings.account.syncNote')}</span>
            <div class="flex items-center gap-2 shrink-0">
              ${
                this.callbacks.onOpenProfile
                  ? `<button type="button" data-action="settings-open-profile" class="nexus-btn-secondary px-3 py-2 rounded text-xs font-bold tracking-wider uppercase min-h-[40px] whitespace-nowrap">${i18n.t('settings.account.openProfile')}</button>`
                  : ''
              }
              ${
                this.callbacks.onSignOut
                  ? `<button type="button" data-action="settings-sign-out" ${this.signingOut ? 'disabled' : ''} class="px-3.5 py-2 rounded border border-rose-500/50 bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 text-xs font-extrabold tracking-wider uppercase min-h-[40px] whitespace-nowrap disabled:opacity-55">${this.signingOut ? i18n.t('auth.signingOut') : i18n.t('auth.signOut')}</button>`
                  : ''
              }
            </div>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-sky-400">${i18n.t('settings.section.graphics')}</h3>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/70 p-3 rounded border border-slate-800">
          <div>
            <div class="text-sm font-semibold text-white">${i18n.t('settings.graphics.desc')}</div>
            <div class="text-xs text-slate-400">
              ${qualityDesc} · ${i18n.t('settings.graphics.recommendedPrefix')}: ${recommendedLabel}
            </div>
          </div>
          <div class="flex gap-1.5" data-group="quality"></div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/70 p-3 rounded border border-slate-800">
          <div>
            <div class="text-sm font-medium text-slate-200">${i18n.t('settings.graphics.fpsCap')}</div>
            <div class="text-xs text-slate-400" dir="ltr">Max ${this.deviceProfile.maxRefreshHz}Hz</div>
          </div>
          <div class="flex flex-wrap gap-1.5" data-group="fpsLimit"></div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label class="flex items-center justify-between bg-slate-900/70 p-3 rounded border border-slate-800 cursor-pointer">
            <span class="text-sm font-medium text-slate-200">${i18n.t('settings.graphics.shadows')}</span>
            <input type="checkbox" data-setting="shadows" class="w-4 h-4 accent-orange-500" ${s.graphics.shadowsEnabled ? 'checked' : ''} />
          </label>

          <label class="flex items-center justify-between bg-slate-900/70 p-3 rounded border border-slate-800 cursor-pointer">
            <span class="text-sm font-medium text-slate-200">${i18n.t('settings.graphics.showFps')}</span>
            <input type="checkbox" data-setting="fps" class="w-4 h-4 accent-orange-500" ${s.graphics.showFps ? 'checked' : ''} />
          </label>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/70 p-3 rounded border border-slate-800">
          <span class="text-sm font-medium text-slate-200">${i18n.t('settings.graphics.pixelRatio')}</span>
          <div class="flex gap-1.5" data-group="dpr"></div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-cyan-400">${i18n.t('settings.section.aimSensitivity')}</h3>
          <button
            type="button"
            data-action="reset-aim-sensitivity"
            class="nexus-btn-secondary px-2.5 py-1 rounded text-[11px] font-bold tracking-wider uppercase"
          >
            ${i18n.t('settings.aim.resetDefaults')}
          </button>
        </div>

        <div class="bg-slate-900/70 p-3 rounded border border-slate-800 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-sm font-medium text-slate-200">${i18n.t('settings.aim.cameraRotation')}</span>
              <div class="text-[11px] text-slate-400">${i18n.t('settings.aim.cameraRotationHint')}</div>
            </div>
            <span data-role="sensitivity-val" dir="ltr" class="text-xs font-bold tabular-nums text-sky-400 shrink-0">${s.controls.lookSensitivity.toFixed(2)}x</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" data-aim-step="sensitivity:-5" aria-label="-" class="nexus-btn-secondary w-7 h-7 rounded text-xs font-black shrink-0">-</button>
            <input type="range" min="30" max="250" step="1" value="${Math.round(s.controls.lookSensitivity * 100)}" data-setting="sensitivity" class="w-full accent-sky-400" />
            <button type="button" data-aim-step="sensitivity:5" aria-label="+" class="nexus-btn-secondary w-7 h-7 rounded text-xs font-black shrink-0">+</button>
          </div>
        </div>

        <div class="bg-slate-900/70 p-3 rounded border border-slate-800 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-sm font-medium text-slate-200">${i18n.t('settings.aim.adsSensitivity')}</span>
              <div class="text-[11px] text-slate-400">${i18n.t('settings.aim.adsSensitivityHint')}</div>
            </div>
            <span data-role="ads-sensitivity-val" dir="ltr" class="text-xs font-bold tabular-nums text-cyan-400 shrink-0">${s.controls.adsSensitivity.toFixed(2)}x</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" data-aim-step="adsSensitivity:-5" aria-label="-" class="nexus-btn-secondary w-7 h-7 rounded text-xs font-black shrink-0">-</button>
            <input type="range" min="30" max="250" step="1" value="${Math.round(s.controls.adsSensitivity * 100)}" data-setting="adsSensitivity" class="w-full accent-cyan-400" />
            <button type="button" data-aim-step="adsSensitivity:5" aria-label="+" class="nexus-btn-secondary w-7 h-7 rounded text-xs font-black shrink-0">+</button>
          </div>
        </div>

        <div class="bg-slate-900/70 p-3 rounded border border-slate-800 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-sm font-medium text-slate-200">${i18n.t('settings.aim.stability')}</span>
              <div class="text-[11px] text-slate-400">${i18n.t('settings.aim.stabilityHint')}</div>
            </div>
            <span data-role="aim-stability-val" dir="ltr" class="text-xs font-bold tabular-nums text-emerald-400 shrink-0">${Math.round(s.controls.aimStability * 100)}%</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" data-aim-step="aimStability:-5" aria-label="-" class="nexus-btn-secondary w-7 h-7 rounded text-xs font-black shrink-0">-</button>
            <input type="range" min="0" max="100" step="1" value="${Math.round(s.controls.aimStability * 100)}" data-setting="aimStability" class="w-full accent-emerald-400" />
            <button type="button" data-aim-step="aimStability:5" aria-label="+" class="nexus-btn-secondary w-7 h-7 rounded text-xs font-black shrink-0">+</button>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-4 h-4 text-sky-400 flex items-center justify-center shrink-0">${getGlooWallSvg()}</span>
            <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-sky-400">${i18n.t('settings.section.glooWall')}</h3>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">${i18n.t('lang.savedBadge')}</span>
        </div>

        <div class="bg-slate-900/80 p-3.5 rounded border border-sky-400/25 flex flex-col gap-3">
          <div class="flex flex-col gap-0.5">
            <div class="text-sm font-semibold text-white">${i18n.t('settings.glooWall.placementMode')}</div>
            <div class="text-[11px] text-slate-400">${i18n.t('settings.glooWall.placementHint')}</div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-group="glooPlacementMode">
            ${(['auto', 'manual'] as const)
              .map((mode) => {
                const active = s.controls.glooPlacementMode === mode;
                const titleKey =
                  mode === 'auto' ? 'settings.glooWall.modeAuto' : 'settings.glooWall.modeManual';
                const descKey =
                  mode === 'auto'
                    ? 'settings.glooWall.modeAutoDesc'
                    : 'settings.glooWall.modeManualDesc';
                return `
                  <button
                    type="button"
                    data-gloo-mode="${mode}"
                    class="text-start p-3 rounded border transition-all flex flex-col gap-1 ${
                      active
                        ? 'bg-sky-500/18 border-sky-400 text-white shadow-[0_0_16px_rgba(56,189,248,0.22)]'
                        : 'bg-slate-950/75 border-slate-800 text-slate-300 hover:border-slate-600'
                    }"
                  >
                    <div class="flex items-center justify-between gap-2 w-full">
                      <span class="text-xs sm:text-sm font-black tracking-wide uppercase ${active ? 'text-sky-300' : 'text-slate-200'}">${i18n.t(titleKey)}</span>
                      <span class="w-2.5 h-2.5 rounded-full ${active ? 'bg-sky-400 shadow-[0_0_8px_#38bdf8]' : 'bg-slate-700'}"></span>
                    </div>
                    <span class="text-[11px] leading-snug ${active ? 'text-slate-200' : 'text-slate-400'}">${i18n.t(descKey)}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">${i18n.t('settings.section.audioTouch')}</h3>

        <div class="bg-slate-900/70 p-3 rounded border border-slate-800 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-200">${i18n.t('settings.audio.masterLabel')}</span>
            <span data-role="volume-val" class="text-xs font-bold tabular-nums text-sky-400">${Math.round(s.audio.masterVolume * 100)}%</span>
          </div>
          <input type="range" min="0" max="100" value="${Math.round(s.audio.masterVolume * 100)}" data-setting="volume" class="w-full accent-orange-500" />
        </div>

        <div class="bg-slate-900/70 p-3 rounded border border-slate-800 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-200">${i18n.t('settings.audio.musicLabel')}</span>
            <span data-role="music-volume-val" class="text-xs font-bold tabular-nums ${s.audio.musicMuted ? 'text-slate-400' : 'text-orange-400'}">${
              s.audio.musicMuted ? i18n.t('common.off') : `${Math.round(s.audio.musicVolume * 100)}%`
            }</span>
          </div>
          <input type="range" min="0" max="100" value="${Math.round(s.audio.musicVolume * 100)}" data-setting="musicVolume" class="w-full accent-orange-500" />
        </div>

        <div class="bg-slate-900/70 p-3 rounded border border-slate-800 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-slate-200">${i18n.t('settings.controls.aimAssist')}</span>
              <div class="text-[11px] text-slate-400">${i18n.t('settings.aimAssist.hintPrecision')}</div>
            </div>
            <span data-role="aim-assist-val" class="text-xs font-bold tabular-nums ${s.controls.aimAssistStrength <= 0.005 ? 'text-slate-400' : 'text-orange-400'}">${
              s.controls.aimAssistStrength <= 0.005
                ? i18n.t('common.off')
                : `${Math.round(s.controls.aimAssistStrength * 100)}%`
            }</span>
          </div>
          <input type="range" min="0" max="100" value="${Math.round(s.controls.aimAssistStrength * 100)}" data-setting="aimAssist" class="w-full accent-orange-500" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label class="flex items-center justify-between bg-slate-900/70 p-3 rounded border border-slate-800 cursor-pointer">
            <span class="text-sm font-medium text-slate-200">${i18n.t('settings.audio.muteAudio')}</span>
            <input type="checkbox" data-setting="muted" class="w-4 h-4 accent-orange-500" ${s.audio.muted ? 'checked' : ''} />
          </label>

          <label class="flex items-center justify-between bg-slate-900/70 p-3 rounded border border-slate-800 cursor-pointer">
            <span class="text-sm font-medium text-slate-200">${i18n.t('settings.audio.muteMusic')}</span>
            <input type="checkbox" data-setting="musicMuted" class="w-4 h-4 accent-orange-500" ${s.audio.musicMuted ? 'checked' : ''} />
          </label>

          <label class="flex items-center justify-between bg-slate-900/70 p-3 rounded border border-slate-800 cursor-pointer">
            <span class="text-sm font-medium text-slate-200">${i18n.t('settings.controls.invertLookY')}</span>
            <input type="checkbox" data-setting="invertY" class="w-4 h-4 accent-orange-500" ${s.controls.invertY ? 'checked' : ''} />
          </label>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/70 p-3 rounded border border-slate-800">
          <span class="text-sm font-medium text-slate-200">${i18n.t('settings.controls.onScreenTouchHud')}</span>
          <div class="flex gap-1.5" data-group="touch"></div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/70 p-3 rounded border border-sky-400/25">
          <div>
            <div class="text-sm font-semibold text-white">${i18n.t('settings.controls.hudLayoutLabel')}</div>
            <div class="text-xs text-slate-400">${i18n.t('settings.controls.hudLayoutSub')} (${orientationLabel})</div>
          </div>
          <button
            type="button"
            data-action="open-layout-editor"
            class="nexus-btn-primary px-4 py-2 rounded text-xs font-extrabold tracking-widest uppercase"
          >
            ${i18n.t('settings.controls.editHud')}
          </button>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-sky-400">${i18n.t('settings.keybindings.desktopTitle')}</h3>
          <button
            type="button"
            data-action="reset-keybinds"
            class="nexus-btn-secondary px-2.5 py-1 rounded text-[11px] font-bold tracking-wider uppercase"
          >
            ${i18n.t('settings.keybindings.reset')}
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${keyRowsHtml}
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">${i18n.t('settings.diag.title')}</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-950/80 p-3 rounded border border-slate-800/80">
          <div><span class="text-slate-500">${i18n.t('settings.diag.category')}:</span> <span class="text-slate-200 font-semibold">${i18n.translateDeviceCategory(this.deviceProfile.category)}</span></div>
          <div><span class="text-slate-500">${i18n.t('settings.diag.tier')}:</span> <span class="text-sky-400 font-semibold">${i18n.translatePerformanceTier(this.deviceProfile.performanceTier)}</span></div>
          <div><span class="text-slate-500">${i18n.t('settings.diag.orientation')}:</span> <span class="text-slate-200 font-semibold">${orientationLabel}</span></div>
          <div><span class="text-slate-500">${i18n.t('settings.diag.viewport')}:</span> <span class="text-slate-200 tabular-nums font-semibold" dir="ltr">${this.metrics.width}×${this.metrics.height} (${this.metrics.aspectBand})</span></div>
          <div><span class="text-slate-500">${i18n.t('settings.diag.touch')}:</span> <span class="text-slate-200 font-semibold">${this.deviceProfile.hasTouch ? i18n.t('settings.diag.touchEnabled') : i18n.t('settings.diag.touchNone')}</span></div>
          <div><span class="text-slate-500">${i18n.t('settings.diag.cores')}:</span> <span class="text-slate-200 tabular-nums font-semibold">${this.deviceProfile.hardwareConcurrency}</span></div>
        </div>
      </section>
    `;

    this.lastRenderedGlooMode = s.controls.glooPlacementMode;

    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang as AppLanguage;
        i18n.setLanguage(lang);
        this.settingsManager.update({ language: lang });
        this.render();
      });
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-gloo-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.glooMode as GlooWallPlacementMode;
        if (mode !== 'auto' && mode !== 'manual') return;
        this.settingsManager.update({ controls: { glooPlacementMode: mode } });
        this.render();
      });
    });

    this.bindButtonGroup<QualityPreset>(
      '[data-group="quality"]',
      [
        { value: 'low', label: i18n.t('quality.low') },
        { value: 'medium', label: i18n.t('quality.medium') },
        { value: 'high', label: i18n.t('quality.high') },
      ],
      s.graphics.quality,
      (val) => {
        this.settingsManager.applyQualityPreset(val);
        this.render();
      },
    );

    this.lastRenderedSupportedFpsCount = this.deviceProfile.supportedFpsOptions.length;
    const allFpsModes: readonly FpsLimit[] = [30, 60, 90, 120];
    this.bindButtonGroup<FpsLimit>(
      '[data-group="fpsLimit"]',
      allFpsModes.map((fps) => ({
        value: fps,
        label: `${fps}`,
        disabled: !this.deviceProfile.supportedFpsOptions.includes(fps),
      })),
      s.graphics.fpsLimit,
      (val) => {
        this.settingsManager.update({ graphics: { fpsLimit: val } });
        this.render();
      },
    );

    this.bindButtonGroup<number>(
      '[data-group="dpr"]',
      [
        { value: 0.85, label: '0.85x' },
        { value: 1.0, label: '1.0x' },
        { value: 1.5, label: '1.5x' },
        { value: 2.0, label: '2.0x' },
      ],
      s.graphics.pixelRatioCap,
      (val) => {
        this.settingsManager.update({ graphics: { pixelRatioCap: val } });
        this.render();
      },
    );

    this.bindButtonGroup<GameSettings['controls']['touchControlsEnabled']>(
      '[data-group="touch"]',
      [
        { value: 'auto', label: i18n.t('settings.touch.auto') },
        { value: 'always', label: i18n.t('settings.touch.always') },
        { value: 'off', label: i18n.t('settings.touch.off') },
      ],
      s.controls.touchControlsEnabled,
      (val) => {
        this.settingsManager.update({ controls: { touchControlsEnabled: val } });
        this.render();
      },
    );

    this.bodyEl.querySelector('[data-action="reset-aim-sensitivity"]')!.addEventListener('click', () => {
      this.stopCapture();
      this.settingsManager.resetAimSensitivityDefaults();
      this.render();
    });

    this.bodyEl.querySelector('[data-action="settings-open-profile"]')?.addEventListener('click', () => {
      this.stopCapture();
      this.callbacks.onOpenProfile?.();
    });

    this.bodyEl.querySelector('[data-action="settings-sign-out"]')?.addEventListener('click', () => {
      if (this.signingOut || !this.callbacks.onSignOut) return;
      this.stopCapture();
      this.signingOut = true;
      this.render();
      void Promise.resolve(this.callbacks.onSignOut()).finally(() => {
        this.signingOut = false;
        this.render();
      });
    });

    this.bodyEl.querySelector('[data-action="open-layout-editor"]')!.addEventListener('click', () => {
      this.stopCapture();
      this.callbacks.onOpenLayoutEditor();
    });

    this.bodyEl.querySelector('[data-action="reset-keybinds"]')!.addEventListener('click', () => {
      this.stopCapture();
      this.controlSettings.resetKeyBindings();
      this.render();
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-rebind]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.rebind as GameAction;
        this.startCapture(action);
      });
    });

    this.bodyEl.querySelector<HTMLInputElement>('[data-setting="shadows"]')!.addEventListener('change', (e) => {
      this.settingsManager.update({
        graphics: { shadowsEnabled: (e.target as HTMLInputElement).checked },
      });
    });

    this.bodyEl.querySelector<HTMLInputElement>('[data-setting="fps"]')!.addEventListener('change', (e) => {
      this.settingsManager.update({
        graphics: { showFps: (e.target as HTMLInputElement).checked },
      });
    });

    this.bodyEl.querySelector<HTMLInputElement>('[data-setting="muted"]')!.addEventListener('change', (e) => {
      this.settingsManager.update({
        audio: { muted: (e.target as HTMLInputElement).checked },
      });
    });

    const musicVolValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="music-volume-val"]');
    const musicMutedEl = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="musicMuted"]')!;
    musicMutedEl.addEventListener('change', (e) => {
      const musicMuted = (e.target as HTMLInputElement).checked;
      this.suppressSettingsRerender = true;
      this.settingsManager.update({
        audio: { musicMuted },
      });
      this.suppressSettingsRerender = false;
      if (musicVolValEl) {
        const pct = Math.round(this.settingsManager.getSettings().audio.musicVolume * 100);
        musicVolValEl.textContent = musicMuted ? i18n.t('common.off') : `${pct}%`;
        musicVolValEl.className = `text-xs font-bold tabular-nums ${musicMuted ? 'text-slate-400' : 'text-orange-400'}`;
      }
    });

    this.bodyEl.querySelector<HTMLInputElement>('[data-setting="invertY"]')!.addEventListener('change', (e) => {
      this.settingsManager.update({
        controls: { invertY: (e.target as HTMLInputElement).checked },
      });
    });

    const volumeValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="volume-val"]');
    this.bodyEl.querySelector<HTMLInputElement>('[data-setting="volume"]')!.addEventListener('input', (e) => {
      const pct = Number((e.target as HTMLInputElement).value);
      const vol = pct / 100;
      if (volumeValEl) volumeValEl.textContent = `${Math.round(pct)}%`;
      this.suppressSettingsRerender = true;
      this.settingsManager.update({ audio: { masterVolume: vol } });
      this.suppressSettingsRerender = false;
    });

    this.bodyEl.querySelector<HTMLInputElement>('[data-setting="musicVolume"]')!.addEventListener('input', (e) => {
      const pct = Number((e.target as HTMLInputElement).value);
      const vol = pct / 100;
      const isMuted = this.settingsManager.getSettings().audio.musicMuted;
      if (musicVolValEl) {
        musicVolValEl.textContent = isMuted ? i18n.t('common.off') : `${Math.round(pct)}%`;
      }
      this.suppressSettingsRerender = true;
      this.settingsManager.update({ audio: { musicVolume: vol } });
      this.suppressSettingsRerender = false;
    });

    const sensValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="sensitivity-val"]');
    const sensInputEl = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="sensitivity"]')!;
    const applySensitivity = (rawPct: number) => {
      const clamped = Math.max(30, Math.min(250, Math.round(rawPct)));
      const sens = clamped / 100;
      sensInputEl.value = String(clamped);
      if (sensValEl) sensValEl.textContent = `${sens.toFixed(2)}x`;
      this.suppressSettingsRerender = true;
      this.settingsManager.update({ controls: { lookSensitivity: sens } });
      this.suppressSettingsRerender = false;
    };
    sensInputEl.addEventListener('input', (e) => {
      applySensitivity(Number((e.target as HTMLInputElement).value));
    });

    const adsValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="ads-sensitivity-val"]');
    const adsInputEl = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="adsSensitivity"]')!;
    const applyAdsSensitivity = (rawPct: number) => {
      const clamped = Math.max(30, Math.min(250, Math.round(rawPct)));
      const adsSens = clamped / 100;
      adsInputEl.value = String(clamped);
      if (adsValEl) adsValEl.textContent = `${adsSens.toFixed(2)}x`;
      this.suppressSettingsRerender = true;
      this.settingsManager.update({ controls: { adsSensitivity: adsSens } });
      this.suppressSettingsRerender = false;
    };
    adsInputEl.addEventListener('input', (e) => {
      applyAdsSensitivity(Number((e.target as HTMLInputElement).value));
    });

    const stabilityValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="aim-stability-val"]');
    const stabilityInputEl = this.bodyEl.querySelector<HTMLInputElement>('[data-setting="aimStability"]')!;
    const applyAimStability = (rawPct: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(rawPct)));
      const stability = clamped / 100;
      stabilityInputEl.value = String(clamped);
      if (stabilityValEl) stabilityValEl.textContent = `${clamped}%`;
      this.suppressSettingsRerender = true;
      this.settingsManager.update({ controls: { aimStability: stability } });
      this.suppressSettingsRerender = false;
    };
    stabilityInputEl.addEventListener('input', (e) => {
      applyAimStability(Number((e.target as HTMLInputElement).value));
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-aim-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spec = btn.dataset.aimStep ?? '';
        const [field, deltaStr] = spec.split(':');
        const delta = Number(deltaStr);
        if (!Number.isFinite(delta)) return;
        if (field === 'sensitivity') {
          applySensitivity(Number(sensInputEl.value) + delta);
        } else if (field === 'adsSensitivity') {
          applyAdsSensitivity(Number(adsInputEl.value) + delta);
        } else if (field === 'aimStability') {
          applyAimStability(Number(stabilityInputEl.value) + delta);
        }
      });
    });

    const aimValEl = this.bodyEl.querySelector<HTMLElement>('[data-role="aim-assist-val"]');
    this.bodyEl.querySelector<HTMLInputElement>('[data-setting="aimAssist"]')!.addEventListener('input', (e) => {
      const pct = Number((e.target as HTMLInputElement).value);
      const strength = pct / 100;
      if (aimValEl) {
        const isOff = strength <= 0.005;
        aimValEl.textContent = isOff ? i18n.t('common.off') : `${Math.round(pct)}%`;
        aimValEl.className = `text-xs font-bold tabular-nums ${isOff ? 'text-slate-400' : 'text-orange-400'}`;
      }
      this.suppressSettingsRerender = true;
      this.settingsManager.update({ controls: { aimAssistStrength: strength } });
      this.suppressSettingsRerender = false;
    });
  }

  private startCapture(action: GameAction): void {
    this.stopCapture();
    this.capturingAction = action;
    window.addEventListener('keydown', this.onCaptureKeyDownBound, true);
    window.addEventListener('mousedown', this.onCaptureMouseDownBound, true);
    this.render();
  }

  private stopCapture(): void {
    if (!this.capturingAction) return;
    this.capturingAction = null;
    window.removeEventListener('keydown', this.onCaptureKeyDownBound, true);
    window.removeEventListener('mousedown', this.onCaptureMouseDownBound, true);
    this.render();
  }

  private bindButtonGroup<T>(
    selector: string,
    options: Array<{ value: T; label: string; disabled?: boolean }>,
    current: T,
    onSelect: (val: T) => void,
  ): void {
    const container = this.bodyEl.querySelector(selector);
    if (!container) return;

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = opt.value === current;
      const disabled = Boolean(opt.disabled);
      btn.disabled = disabled;
      btn.className = `${
        active ? 'nexus-btn-primary' : 'nexus-btn-secondary'
      } px-3 py-1.5 rounded text-xs font-bold tracking-wider ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`;
      btn.textContent = opt.label;
      if (!disabled) {
        btn.addEventListener('click', () => onSelect(opt.value));
      }
      container.appendChild(btn);
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  dispose(): void {
    this.stopCapture();
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.unsubSettings?.();
    this.unsubSettings = null;
  }
}
