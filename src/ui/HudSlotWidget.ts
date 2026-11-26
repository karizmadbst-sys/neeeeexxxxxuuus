import type { ViewportMetrics } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import type { ControlSlotLayout, HudStatusSlotId } from '../input/ControlSettings';
import type { AmmoType, LootItemDefinition } from '../loot/ILootSystem';
import { clamp } from '../utils/MathUtils';
import {
  getAmmoSvg,
  getArmorSvg,
  getEmptyWeaponSlotSvg,
  getHealthHudSvg,
  getHelmetSvg,
  getLootItemSvg,
  getPunchSvg,
  getWeaponSvg,
} from './icons/GameIcons';

export interface HudStatusRenderState {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  armorTier: 0 | 1 | 2 | 3;
  armorDurability: number;
  maxArmorDurability: number;
  helmetTier: 0 | 1 | 2 | 3;
  helmetDurability: number;
  maxHelmetDurability: number;
  activeSlotIndex: 0 | 1 | 2 | 3;
  isUnarmed: boolean;
  isMeleeActive?: boolean;
  activeWeaponId?: string | null;
  weapon1: {
    id: string;
    accentHex: string;
    ammoInMag: number;
    reserveAmmo: number;
    magSize: number;
    isMelee?: boolean;
  } | null;
  weapon2: {
    id: string;
    accentHex: string;
    ammoInMag: number;
    reserveAmmo: number;
    magSize: number;
    isMelee?: boolean;
  } | null;
  activeAmmoType: AmmoType | null;
  activeAmmoInMag: number;
  activeAmmoReserve: number;
  isReloading: boolean;
  medDef: LootItemDefinition | null;
  medCount: number;
  specialDef: LootItemDefinition | null;
  specialCount: number;
  healRemainingSec: number;
  healProgress?: number;
  punchCooldownRatio?: number;
  unlimitedAmmo?: boolean;
}

const DEFAULT_MED_ICON_DEF: LootItemDefinition = {
  id: 'med_kit',
  category: 'health',
  name: 'Medkit',
  rarity: 'rare',
  description: '',
  stackable: true,
  maxStack: 3,
  spawnWeight: 0,
  accentHex: '#10b981',
  iconTag: 'MED',
};

const DEFAULT_SPECIAL_ICON_DEF: LootItemDefinition = {
  id: 'special_adrenaline',
  category: 'special',
  name: 'Adrenaline',
  rarity: 'epic',
  description: '',
  stackable: true,
  maxStack: 2,
  spawnWeight: 0,
  accentHex: '#a855f7',
  iconTag: 'ADR',
};

export class HudSlotWidget {
  readonly id: HudStatusSlotId;
  readonly element: HTMLButtonElement;

  private readonly iconEl: HTMLElement;
  private readonly badgeEl: HTMLElement;
  private readonly secondaryBadgeEl: HTMLElement;
  private readonly ringArcEl: SVGCircleElement;
  private readonly ringSecondaryArcEl: SVGCircleElement;
  private lastIconKey = '';
  private baseOpacity = 0.9;
  private readonly baseWidthPx: number;
  private readonly baseHeightPx: number;
  private lastState: HudStatusRenderState | null = null;

  constructor(id: HudStatusSlotId, title: string, onTrigger?: () => void) {
    this.id = id;
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.dataset.controlId = id;
    this.element.setAttribute('aria-label', title);

    const isWide = id === 'weapon1' || id === 'weapon2';
    this.baseWidthPx = isWide ? 88 : 54;
    this.baseHeightPx = isWide ? 48 : 54;
    this.element.style.width = `${this.baseWidthPx}px`;
    this.element.style.height = `${this.baseHeightPx}px`;
    this.element.className =
      'absolute bg-transparent border-0 p-0 flex items-center justify-center touch-none select-none pointer-events-auto transition-transform duration-100 focus:outline-none';

    const ringSize = isWide ? 88 : 54;
    const radius = isWide ? 21 : 23;
    const circumference = 2 * Math.PI * radius;

    this.element.innerHTML = `
      <svg data-role="ring-svg" viewBox="0 0 ${ringSize} ${isWide ? 48 : 54}" class="${isWide ? 'hidden' : 'absolute inset-0 w-full h-full pointer-events-none -rotate-90'}" aria-hidden="true">
        <circle cx="27" cy="27" r="${radius}" stroke="rgba(148,163,184,0.22)" stroke-width="2.5" fill="none"/>
        <circle data-role="ring-arc" cx="27" cy="27" r="${radius}" stroke="#10b981" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" fill="none"/>
        <circle data-role="ring-arc-2" cx="27" cy="27" r="${radius - 3.5}" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * (radius - 3.5)}" stroke-dashoffset="${2 * Math.PI * (radius - 3.5)}" fill="none"/>
      </svg>
      <div data-role="icon" class="w-[74%] h-[74%] flex items-center justify-center pointer-events-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.92)]"></div>
      <span data-role="badge" class="pointer-events-none absolute -bottom-0.5 right-0.5 px-1 min-w-[18px] h-[16px] rounded bg-slate-950/85 border border-slate-400/35 text-[10px] font-black tabular-nums leading-[14px] text-white text-center drop-shadow"></span>
      <span data-role="sec-badge" class="pointer-events-none hidden absolute -top-0.5 left-0.5 px-1 h-[15px] rounded bg-slate-950/85 border border-sky-400/40 text-[9px] font-black tabular-nums leading-[13px] text-sky-300 text-center"></span>
    `;

    this.iconEl = this.element.querySelector('[data-role="icon"]')!;
    this.badgeEl = this.element.querySelector('[data-role="badge"]')!;
    this.secondaryBadgeEl = this.element.querySelector('[data-role="sec-badge"]')!;
    this.ringArcEl = this.element.querySelector('[data-role="ring-arc"]')!;
    this.ringSecondaryArcEl = this.element.querySelector('[data-role="ring-arc-2"]')!;

    if (id === 'medkit') {
      this.setIcon('med:med_kit', getLootItemSvg(DEFAULT_MED_ICON_DEF));
      this.badgeEl.textContent = '0';
      this.secondaryBadgeEl.classList.remove('hidden');
      this.secondaryBadgeEl.textContent = '3';
    } else if (id === 'special') {
      this.setIcon('spec:special_adrenaline', getLootItemSvg(DEFAULT_SPECIAL_ICON_DEF));
      this.badgeEl.textContent = '0';
      this.secondaryBadgeEl.classList.remove('hidden');
      this.secondaryBadgeEl.textContent = '4';
    }

    if (onTrigger) {
      this.element.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      this.element.addEventListener('click', (e) => {
        e.stopPropagation();
        onTrigger();
      });
    }
  }

  setTitle(title: string): void {
    this.element.setAttribute('aria-label', title);
  }

  refreshLocale(): void {
    if (this.lastState) {
      this.syncState(this.lastState);
    }
  }

  applyLayout(layout: ControlSlotLayout, metrics?: ViewportMetrics): void {
    this.baseOpacity = layout.opacity;
    const effScale = clamp(layout.scale * (metrics ? metrics.hudScale : 1), 0.5, 1.85);
    if (metrics) {
      const halfW = this.baseWidthPx * effScale * 0.5;
      const halfH = this.baseHeightPx * effScale * 0.5;
      const minX = metrics.safeInsets.left + halfW + 4;
      const maxX = Math.max(minX, metrics.width - metrics.safeInsets.right - halfW - 4);
      const minY = metrics.safeInsets.top + halfH + 4;
      const maxY = Math.max(minY, metrics.height - metrics.safeInsets.bottom - halfH - 4);
      const xPx = clamp((layout.xPct / 100) * metrics.width, minX, maxX);
      const yPx = clamp((layout.yPct / 100) * metrics.height, minY, maxY);
      this.element.style.left = `${xPx.toFixed(1)}px`;
      this.element.style.top = `${yPx.toFixed(1)}px`;
    } else {
      this.element.style.left = `${layout.xPct}%`;
      this.element.style.top = `${layout.yPct}%`;
    }
    this.element.style.opacity = String(this.baseOpacity);
    this.element.style.display = layout.visible ? 'flex' : 'none';
    this.element.style.transform = `translate3d(-50%, -50%, 0) scale(${effScale.toFixed(3)})`;
  }

  setSamplePreviewState(): void {
    this.syncState({
      health: 184,
      maxHealth: 200,
      shield: 50,
      maxShield: 50,
      armorTier: 2,
      armorDurability: 88,
      maxArmorDurability: 100,
      helmetTier: 2,
      helmetDurability: 100,
      maxHelmetDurability: 100,
      activeSlotIndex: 0,
      isUnarmed: false,
      weapon1: { id: 'scar', accentHex: '#f59e0b', ammoInMag: 30, reserveAmmo: 120, magSize: 30 },
      weapon2: { id: 'awm', accentHex: '#84cc16', ammoInMag: 5, reserveAmmo: 20, magSize: 5 },
      activeAmmoType: 'AR',
      activeAmmoInMag: 30,
      activeAmmoReserve: 120,
      isReloading: false,
      medDef: DEFAULT_MED_ICON_DEF,
      medCount: 2,
      specialDef: DEFAULT_SPECIAL_ICON_DEF,
      specialCount: 1,
      healRemainingSec: 0,
      healProgress: 0,
      punchCooldownRatio: 0,
    });
  }

  syncState(state: HudStatusRenderState): void {
    this.lastState = state;
    switch (this.id) {
      case 'health': {
        this.setIcon('health', getHealthHudSvg());
        const hpRatio = state.maxHealth > 0 ? Math.max(0, Math.min(1, state.health / state.maxHealth)) : 0;
        const hpColor = hpRatio <= 0.3 ? '#f43f5e' : hpRatio <= 0.6 ? '#f59e0b' : '#10b981';
        this.setArc(this.ringArcEl, 23, hpRatio, hpColor);
        const shieldRatio = state.maxShield > 0 ? Math.max(0, Math.min(1, state.shield / state.maxShield)) : 0;
        this.setArc(this.ringSecondaryArcEl, 19.5, shieldRatio, '#38bdf8');
        this.badgeEl.textContent = String(Math.ceil(state.health));
        this.badgeEl.style.color = hpRatio <= 0.3 ? '#fda4af' : '#ffffff';
        if (state.shield > 0) {
          this.secondaryBadgeEl.classList.remove('hidden');
          this.secondaryBadgeEl.textContent = `+${Math.ceil(state.shield)}`;
        } else {
          this.secondaryBadgeEl.classList.add('hidden');
        }
        break;
      }
      case 'armor': {
        this.setIcon(`armor:${state.armorTier}`, getArmorSvg(state.armorTier));
        const ratio =
          state.armorTier > 0 && state.maxArmorDurability > 0
            ? Math.max(0, Math.min(1, state.armorDurability / state.maxArmorDurability))
            : 0;
        const tierColor =
          state.armorTier === 3 ? '#f59e0b' : state.armorTier === 2 ? '#38bdf8' : '#94a3b8';
        this.setArc(this.ringArcEl, 23, ratio, tierColor);
        this.setArc(this.ringSecondaryArcEl, 19.5, 0, '#38bdf8');
        this.iconEl.style.opacity = state.armorTier > 0 ? '1' : '0.4';
        this.badgeEl.textContent = state.armorTier > 0 ? `${Math.round(ratio * 100)}%` : '0';
        this.secondaryBadgeEl.classList.toggle('hidden', state.armorTier === 0);
        this.secondaryBadgeEl.textContent = state.armorTier > 0 ? String(state.armorTier) : '';
        break;
      }
      case 'helmet': {
        this.setIcon(`helmet:${state.helmetTier}`, getHelmetSvg(state.helmetTier));
        const ratio =
          state.helmetTier > 0 && state.maxHelmetDurability > 0
            ? Math.max(0, Math.min(1, state.helmetDurability / state.maxHelmetDurability))
            : 0;
        const tierColor =
          state.helmetTier === 3 ? '#f59e0b' : state.helmetTier === 2 ? '#38bdf8' : '#94a3b8';
        this.setArc(this.ringArcEl, 23, ratio, tierColor);
        this.setArc(this.ringSecondaryArcEl, 19.5, 0, '#38bdf8');
        this.iconEl.style.opacity = state.helmetTier > 0 ? '1' : '0.4';
        this.badgeEl.textContent = state.helmetTier > 0 ? `${Math.round(ratio * 100)}%` : '0';
        this.secondaryBadgeEl.classList.toggle('hidden', state.helmetTier === 0);
        this.secondaryBadgeEl.textContent = state.helmetTier > 0 ? String(state.helmetTier) : '';
        break;
      }
      case 'ammo': {
        if (state.isMeleeActive && state.activeWeaponId && !state.isUnarmed) {
          this.setIcon(
            `melee:${state.activeWeaponId}`,
            getWeaponSvg(state.activeWeaponId, '#f8fafc'),
          );
          this.iconEl.style.opacity = '1';
          const readyRatio = 1 - Math.max(0, Math.min(1, state.punchCooldownRatio ?? 0));
          this.setArc(this.ringArcEl, 23, readyRatio, '#38bdf8');
          this.setArc(this.ringSecondaryArcEl, 19.5, 0, '#38bdf8');
          this.badgeEl.textContent = i18n.t('hud.meleeLabel');
          this.badgeEl.style.color = '#e2e8f0';
          this.secondaryBadgeEl.classList.add('hidden');
          break;
        }
        if (state.isUnarmed || !state.activeAmmoType) {
          this.setIcon('punch', getPunchSvg());
          this.iconEl.style.opacity = '1';
          const readyRatio = 1 - Math.max(0, Math.min(1, state.punchCooldownRatio ?? 0));
          this.setArc(this.ringArcEl, 23, readyRatio, '#f97316');
          this.setArc(this.ringSecondaryArcEl, 19.5, 0, '#38bdf8');
          this.badgeEl.textContent = i18n.t('hud.punchBadge');
          this.badgeEl.style.color = '#fdba74';
          this.secondaryBadgeEl.classList.add('hidden');
          break;
        }
        const type = state.activeAmmoType;
        this.setIcon(`ammo:${type}`, getAmmoSvg(type));
        this.iconEl.style.opacity = '1';
        this.setArc(this.ringArcEl, 23, 0, '#f59e0b');
        this.setArc(this.ringSecondaryArcEl, 19.5, 0, '#38bdf8');
        this.badgeEl.textContent = state.isReloading
          ? '...'
          : state.unlimitedAmmo
            ? `${state.activeAmmoInMag}/∞`
            : `${state.activeAmmoInMag}/${state.activeAmmoReserve}`;
        this.badgeEl.style.color =
          !state.unlimitedAmmo && state.activeAmmoInMag === 0 ? '#fda4af' : '#ffffff';
        this.secondaryBadgeEl.classList.add('hidden');
        break;
      }
      case 'weapon1':
      case 'weapon2': {
        const slotIndex = this.id === 'weapon1' ? 0 : 1;
        const w = slotIndex === 0 ? state.weapon1 : state.weapon2;
        const isActive = !state.isUnarmed && state.activeSlotIndex === slotIndex && w !== null;
        if (w) {
          this.setIcon(`w:${w.id}:${w.accentHex}`, getWeaponSvg(w.id, w.accentHex));
          this.iconEl.style.opacity = '1';
          if (w.isMelee || w.magSize <= 0) {
            this.badgeEl.textContent = i18n.t('hud.meleeLabel');
            this.badgeEl.style.color = '#e2e8f0';
          } else {
            this.badgeEl.textContent = state.unlimitedAmmo
              ? `${w.ammoInMag}/∞`
              : `${w.ammoInMag}/${w.reserveAmmo}`;
            this.badgeEl.style.color =
              !state.unlimitedAmmo && w.ammoInMag === 0 ? '#fda4af' : '#ffffff';
          }
        } else {
          this.setIcon('w:empty', getEmptyWeaponSlotSvg());
          this.iconEl.style.opacity = '0.48';
          this.badgeEl.textContent = '0';
          this.badgeEl.style.color = '#94a3b8';
        }
        this.secondaryBadgeEl.classList.remove('hidden');
        this.secondaryBadgeEl.textContent = String(slotIndex + 1);
        this.element.style.filter = isActive
          ? 'drop-shadow(0 0 8px rgba(249,115,22,0.85)) brightness(1.12)'
          : '';
        this.secondaryBadgeEl.style.borderColor = isActive
          ? 'rgba(249,115,22,0.9)'
          : 'rgba(148,163,184,0.35)';
        this.secondaryBadgeEl.style.color = isActive ? '#fdba74' : '#cbd5e1';
        break;
      }
      case 'medkit': {
        const def = state.medDef ?? DEFAULT_MED_ICON_DEF;
        this.setIcon(`med:${def.id}`, getLootItemSvg(def));
        this.iconEl.style.opacity = state.medCount > 0 || state.healRemainingSec > 0 ? '1' : '0.42';
        const isHealingNow = state.healRemainingSec > 0;
        const ringRatio = isHealingNow
          ? Math.max(0.02, Math.min(1, state.healProgress ?? 1))
          : state.medCount > 0
            ? 1
            : 0;
        this.setArc(
          this.ringArcEl,
          23,
          ringRatio,
          isHealingNow ? '#f59e0b' : '#10b981',
        );
        this.setArc(this.ringSecondaryArcEl, 19.5, 0, '#38bdf8');
        this.badgeEl.textContent = isHealingNow
          ? i18n.t('common.secondsShort', { s: state.healRemainingSec.toFixed(1) })
          : String(state.medCount);
        this.badgeEl.style.color = isHealingNow ? '#fde68a' : '#ffffff';
        this.secondaryBadgeEl.classList.remove('hidden');
        this.secondaryBadgeEl.textContent = '3';
        break;
      }
      case 'special': {
        const def = state.specialDef ?? DEFAULT_SPECIAL_ICON_DEF;
        this.setIcon(`spec:${def.id}`, getLootItemSvg(def));
        this.iconEl.style.opacity = state.specialCount > 0 ? '1' : '0.42';
        this.setArc(this.ringArcEl, 23, state.specialCount > 0 ? 1 : 0, '#a855f7');
        this.setArc(this.ringSecondaryArcEl, 19.5, 0, '#38bdf8');
        this.badgeEl.textContent = String(state.specialCount);
        this.secondaryBadgeEl.classList.remove('hidden');
        this.secondaryBadgeEl.textContent = '4';
        break;
      }
    }
  }

  private setIcon(key: string, svgHtml: string): void {
    if (this.lastIconKey === key) return;
    this.lastIconKey = key;
    this.iconEl.innerHTML = svgHtml;
  }

  private setArc(
    circle: SVGCircleElement,
    radius: number,
    ratio: number,
    colorHex: string,
  ): void {
    const c = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(1, ratio));
    circle.setAttribute('stroke', colorHex);
    circle.setAttribute('stroke-dasharray', String(c));
    circle.setAttribute('stroke-dashoffset', String(c * (1 - clamped)));
  }
}
