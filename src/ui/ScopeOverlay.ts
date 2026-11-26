import { i18n } from '../i18n/I18nManager';
import { clamp } from '../utils/MathUtils';
import type { ScopeReticleStyle } from '../weapons/WeaponData';

export interface ScopeOverlayState {
  scopeBlend: number; // 0..1 smooth transition
  weaponName: string;
  reticleStyle: ScopeReticleStyle;
  currentZoom: number;
  zoomLevels: readonly number[];
  rangeMeters: number | null;
  ammoInMagazine: number;
  magazineSize: number;
  equippedOpticLabel: string | null;
  isBoltCycling?: boolean;
  boltCycleProgress?: number;
  unlimitedAmmo?: boolean;
  enemyTargeted?: boolean;
}

export class ScopeOverlay {
  readonly element: HTMLElement;

  private readonly lensEl: HTMLElement;
  private readonly reticleSvgEl: SVGSVGElement;
  private readonly zoomBtnEl: HTMLButtonElement;
  private centerDotEl: SVGCircleElement | null = null;

  private lastStyle: ScopeReticleStyle | null = null;
  private lastZoomLevelsKey = '';
  private lastVisible = false;
  private lastAlphaStr = '';
  private lastScaleStr = '';
  private lastEnemyTargeted: boolean | null = null;
  private lastState: ScopeOverlayState | null = null;
  private unsubI18n: (() => void) | null = null;

  constructor(private readonly onCycleZoom: () => void) {
    this.element = document.createElement('div');
    this.element.className =
      'pointer-events-none fixed inset-0 z-[9] hidden items-center justify-center overflow-hidden select-none';

    this.element.innerHTML = `
      <div
        data-role="scope-lens"
        data-ltr="true"
        dir="ltr"
        class="relative flex items-center justify-center"
        style="width: clamp(148px, min(38dvw, 38dvh), 320px); height: clamp(148px, min(38dvw, 38dvh), 320px); background: transparent;"
      >
        <svg
          data-role="scope-reticle"
          viewBox="0 0 400 400"
          class="pointer-events-none w-full h-full overflow-visible"
          style="filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.88));"
          aria-hidden="true"
        ></svg>

        <button
          type="button"
          data-role="scope-zoom-btn"
          class="pointer-events-auto hidden absolute bottom-[1.5%] left-1/2 -translate-x-1/2 z-20 px-2.5 py-0.5 rounded-sm bg-slate-950/60 border border-white/25 hover:border-sky-300/70 text-[10px] sm:text-[11px] font-black tracking-[0.12em] text-white uppercase tabular-nums min-h-[24px] transition-colors"
        >
          ZOOM 4X ↻
        </button>
      </div>
    `;

    this.lensEl = this.element.querySelector('[data-role="scope-lens"]')!;
    this.reticleSvgEl = this.element.querySelector('[data-role="scope-reticle"]')!;
    this.zoomBtnEl = this.element.querySelector('[data-role="scope-zoom-btn"]')!;

    const stopDown = (e: Event) => {
      e.stopPropagation();
    };
    this.zoomBtnEl.addEventListener('pointerdown', stopDown);
    this.zoomBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onCycleZoom();
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.lastZoomLevelsKey = '';
      if (this.lastVisible && this.lastState) {
        this.sync(this.lastState);
      }
    });
  }

  sync(state: ScopeOverlayState): void {
    this.lastState = state;
    const visualAlpha = clamp((state.scopeBlend - 0.34) / 0.52, 0, 1);
    const shouldShow = visualAlpha > 0.01;

    if (shouldShow !== this.lastVisible) {
      this.lastVisible = shouldShow;
      this.element.style.display = shouldShow ? 'flex' : 'none';
    }

    if (!shouldShow) {
      return;
    }

    const alphaStr = visualAlpha.toFixed(3);
    if (alphaStr !== this.lastAlphaStr) {
      this.lastAlphaStr = alphaStr;
      this.element.style.opacity = alphaStr;
      const lensScale = 1.08 - 0.08 * visualAlpha;
      const scaleStr = `scale(${lensScale.toFixed(4)})`;
      if (scaleStr !== this.lastScaleStr) {
        this.lastScaleStr = scaleStr;
        this.lensEl.style.transform = scaleStr;
      }
    }

    if (state.reticleStyle !== this.lastStyle) {
      this.lastStyle = state.reticleStyle;
      this.reticleSvgEl.innerHTML = this.buildReticleSvg(state.reticleStyle);
      this.centerDotEl = this.reticleSvgEl.querySelector('[data-role="scope-center-dot"]');
      this.lastEnemyTargeted = null;
    }

    const targeted = Boolean(state.enemyTargeted);
    if (this.centerDotEl && targeted !== this.lastEnemyTargeted) {
      this.lastEnemyTargeted = targeted;
      this.centerDotEl.setAttribute('fill', targeted ? '#ef4444' : '#ffffff');
    }

    const isVariableZoom = state.zoomLevels.length > 1;
    const zoomText = Number.isInteger(state.currentZoom)
      ? `${state.currentZoom}X`
      : `${state.currentZoom.toFixed(1)}X`;
    const zoomLevelsKey = isVariableZoom ? `${state.zoomLevels.join(',')}:${zoomText}` : 'fixed';
    if (zoomLevelsKey !== this.lastZoomLevelsKey) {
      this.lastZoomLevelsKey = zoomLevelsKey;
      this.zoomBtnEl.classList.toggle('hidden', !isVariableZoom);
      if (isVariableZoom) {
        this.zoomBtnEl.textContent = i18n.t('scope.zoomPill', { zoom: zoomText });
      }
    }
  }

  hideImmediate(): void {
    if (!this.lastVisible) return;
    this.lastVisible = false;
    this.lastAlphaStr = '0';
    this.element.style.display = 'none';
    this.element.style.opacity = '0';
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
  }

  private buildReticleSvg(style: ScopeReticleStyle): string {
    if (style === 'sniper') {
      return `
        <circle cx="200" cy="200" r="192" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="1.5"/>
        <line x1="12" y1="200" x2="112" y2="200" stroke="#ffffff" stroke-width="2.2" stroke-opacity="0.78" stroke-linecap="round"/>
        <line x1="288" y1="200" x2="388" y2="200" stroke="#ffffff" stroke-width="2.2" stroke-opacity="0.78" stroke-linecap="round"/>
        <line x1="200" y1="12" x2="200" y2="112" stroke="#ffffff" stroke-width="2.2" stroke-opacity="0.78" stroke-linecap="round"/>
        <line x1="200" y1="288" x2="200" y2="388" stroke="#ffffff" stroke-width="2.2" stroke-opacity="0.78" stroke-linecap="round"/>

        <line x1="112" y1="200" x2="192" y2="200" stroke="#f8fafc" stroke-width="1.1" stroke-opacity="0.92"/>
        <line x1="208" y1="200" x2="288" y2="200" stroke="#f8fafc" stroke-width="1.1" stroke-opacity="0.92"/>
        <line x1="200" y1="112" x2="200" y2="192" stroke="#f8fafc" stroke-width="1.1" stroke-opacity="0.92"/>
        <line x1="200" y1="208" x2="200" y2="288" stroke="#f8fafc" stroke-width="1.1" stroke-opacity="0.92"/>

        <circle cx="136" cy="200" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="156" cy="200" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="176" cy="200" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="224" cy="200" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="244" cy="200" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="264" cy="200" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="200" cy="136" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="200" cy="156" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>
        <circle cx="200" cy="176" r="1.8" fill="#f8fafc" fill-opacity="0.9"/>

        <line x1="192" y1="220" x2="208" y2="220" stroke="#f8fafc" stroke-width="1.2" stroke-opacity="0.9"/>
        <line x1="187" y1="240" x2="213" y2="240" stroke="#f8fafc" stroke-width="1.2" stroke-opacity="0.9"/>
        <line x1="182" y1="260" x2="218" y2="260" stroke="#f8fafc" stroke-width="1.2" stroke-opacity="0.9"/>
        <line x1="177" y1="280" x2="223" y2="280" stroke="#f8fafc" stroke-width="1.2" stroke-opacity="0.9"/>

        <circle data-role="scope-center-dot" cx="200" cy="200" r="2.4" fill="#ffffff"/>
      `;
    }

    if (style === 'marksman') {
      return `
        <circle cx="200" cy="200" r="192" fill="none" stroke="rgba(255,255,255,0.38)" stroke-width="1.4"/>
        <line x1="22" y1="200" x2="132" y2="200" stroke="#f8fafc" stroke-width="2" stroke-opacity="0.78"/>
        <line x1="268" y1="200" x2="378" y2="200" stroke="#f8fafc" stroke-width="2" stroke-opacity="0.78"/>
        <line x1="200" y1="265" x2="200" y2="378" stroke="#f8fafc" stroke-width="2" stroke-opacity="0.78"/>

        <line x1="132" y1="200" x2="188" y2="200" stroke="#f8fafc" stroke-width="1.15" stroke-opacity="0.9"/>
        <line x1="212" y1="200" x2="268" y2="200" stroke="#f8fafc" stroke-width="1.15" stroke-opacity="0.9"/>
        <line x1="200" y1="128" x2="200" y2="188" stroke="#f8fafc" stroke-width="1.15" stroke-opacity="0.75"/>
        <line x1="200" y1="210" x2="200" y2="265" stroke="#f8fafc" stroke-width="1.15" stroke-opacity="0.9"/>

        <line x1="160" y1="195" x2="160" y2="205" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.85"/>
        <line x1="240" y1="195" x2="240" y2="205" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.85"/>
        <line x1="190" y1="224" x2="210" y2="224" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.85"/>
        <line x1="186" y1="244" x2="214" y2="244" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.85"/>

        <polyline points="191,209 200,200 209,209" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.88"/>
        <circle data-role="scope-center-dot" cx="200" cy="200" r="2.2" fill="#ffffff"/>
      `;
    }

    if (style === 'tactical') {
      return `
        <circle cx="200" cy="200" r="192" fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="1.35"/>
        <line x1="36" y1="200" x2="148" y2="200" stroke="#f8fafc" stroke-width="1.6" stroke-opacity="0.65"/>
        <line x1="252" y1="200" x2="364" y2="200" stroke="#f8fafc" stroke-width="1.6" stroke-opacity="0.65"/>
        <line x1="200" y1="36" x2="200" y2="148" stroke="#f8fafc" stroke-width="1.6" stroke-opacity="0.65"/>
        <line x1="200" y1="252" x2="200" y2="364" stroke="#f8fafc" stroke-width="1.6" stroke-opacity="0.65"/>

        <circle cx="200" cy="200" r="24" fill="none" stroke="#ffffff" stroke-width="1.45" stroke-opacity="0.84"/>
        <line x1="168" y1="200" x2="188" y2="200" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.9"/>
        <line x1="212" y1="200" x2="232" y2="200" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.9"/>
        <line x1="200" y1="168" x2="200" y2="188" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.9"/>
        <line x1="200" y1="212" x2="200" y2="232" stroke="#f8fafc" stroke-width="1.3" stroke-opacity="0.9"/>
        <circle data-role="scope-center-dot" cx="200" cy="200" r="2.3" fill="#ffffff"/>
      `;
    }

    // Reflex / Close-Quarters Optic
    return `
      <circle cx="200" cy="200" r="192" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.25"/>
      <circle cx="200" cy="200" r="32" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.78" stroke-dasharray="16 10"/>
      <line x1="150" y1="200" x2="182" y2="200" stroke="#f8fafc" stroke-width="1.5" stroke-opacity="0.86"/>
      <line x1="218" y1="200" x2="250" y2="200" stroke="#f8fafc" stroke-width="1.5" stroke-opacity="0.86"/>
      <line x1="200" y1="150" x2="200" y2="182" stroke="#f8fafc" stroke-width="1.5" stroke-opacity="0.86"/>
      <line x1="200" y1="218" x2="200" y2="250" stroke="#f8fafc" stroke-width="1.5" stroke-opacity="0.86"/>
      <circle data-role="scope-center-dot" cx="200" cy="200" r="2.5" fill="#ffffff"/>
    `;
  }
}
