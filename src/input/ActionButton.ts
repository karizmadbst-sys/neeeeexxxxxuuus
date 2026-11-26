import type { ViewportMetrics } from '../core/Types';
import type { ControlSlotLayout, HudActionSlotId } from './ControlSettings';
import { i18n } from '../i18n/I18nManager';
import { getHudActionSvg } from '../ui/icons/GameIcons';
import { clamp } from '../utils/MathUtils';

export interface ActionButtonDefinition {
  id: HudActionSlotId;
  label: string;
  sizePx: number;
  variant: 'primary' | 'danger' | 'accent' | 'neutral';
  mode: 'momentary' | 'toggle';
}

const ACTION_CAPTIONS: Record<HudActionSlotId, string> = {
  fire: 'FIRE',
  aim: 'AIM',
  jump: 'JUMP',
  sprint: 'SPRINT',
  crouch: 'CROUCH',
  prone: 'PRONE',
  reload: 'RELOAD',
  weaponSwitch: 'SWAP',
  holster: 'UNARM',
  pickup: 'LOOT',
  drop: 'DROP',
  ability: 'SKILL',
  glooWall: 'GLOO',
  inventory: 'BAG',
  minimap: 'MAP',
};

export class ActionButton {
  readonly id: HudActionSlotId;
  readonly element: HTMLButtonElement;
  readonly mode: 'momentary' | 'toggle';

  private active = false;
  private available = true;
  private baseOpacity = 0.85;
  private readonly baseSizePx: number;
  private currentIconKey = '';
  private readonly ringEl: HTMLElement;
  private readonly iconEl: HTMLElement;
  private readonly captionEl: HTMLElement;
  private readonly badgeEl: HTMLElement;

  constructor(def: ActionButtonDefinition) {
    this.id = def.id;
    this.mode = def.mode;
    this.baseSizePx = def.sizePx;
    this.currentIconKey = def.id;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.dataset.controlId = def.id;
    const localizedLabel = i18n.translateHudSlotLabel(def.id);
    this.element.setAttribute('aria-label', localizedLabel);

    const toneClass =
      def.variant === 'danger'
        ? 'text-white border-orange-300/75 bg-slate-950/58'
        : def.variant === 'primary'
          ? 'text-white border-white/55 bg-slate-950/56'
          : def.variant === 'accent'
            ? 'text-amber-100 border-amber-300/65 bg-slate-950/56'
            : 'text-slate-100 border-white/45 bg-slate-950/54';

    this.element.className = `absolute rounded-full border ${toneClass} shadow-[0_3px_12px_rgba(0,0,0,0.58)] flex items-center justify-center touch-none select-none pointer-events-auto transition-transform duration-75 focus:outline-none`;
    this.element.style.width = `${def.sizePx}px`;
    this.element.style.height = `${def.sizePx}px`;

    const captionText = i18n.translateTouchActionCaption(def.id, false) || ACTION_CAPTIONS[def.id];
    const iconSizeClass = def.id === 'fire' ? 'w-[54%] h-[54%] -translate-y-[4px]' : 'w-[52%] h-[52%] -translate-y-[4px]';

    this.element.innerHTML = `
      <span data-role="inner-ring" class="absolute inset-[3px] rounded-full border border-white/18 pointer-events-none"></span>
      <span data-role="ring" class="absolute inset-0 rounded-full border-2 border-transparent pointer-events-none"></span>
      <span data-role="icon" class="${iconSizeClass} flex items-center justify-center pointer-events-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.92)]">
        ${getHudActionSvg(def.id)}
      </span>
      <span data-role="caption" class="pointer-events-none absolute bottom-[4px] left-1/2 -translate-x-1/2 text-[7.5px] font-black tracking-wider uppercase leading-none text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.98)] whitespace-nowrap">${captionText}</span>
      <span data-role="badge" class="hidden pointer-events-none absolute -bottom-1 -right-0.5 px-1 min-w-[16px] h-[15px] rounded bg-slate-950/90 border border-white/35 text-[9px] font-black tabular-nums leading-[13px] text-white text-center"></span>
    `;

    this.ringEl = this.element.querySelector('[data-role="ring"]')!;
    this.iconEl = this.element.querySelector('[data-role="icon"]')!;
    this.captionEl = this.element.querySelector('[data-role="caption"]')!;
    this.badgeEl = this.element.querySelector('[data-role="badge"]')!;
  }

  applyLayout(layout: ControlSlotLayout, metrics?: ViewportMetrics): void {
    this.baseOpacity = layout.opacity;
    const effScale = clamp(layout.scale * (metrics ? metrics.hudScale : 1), 0.5, 1.85);
    if (metrics) {
      const half = (this.baseSizePx * effScale) * 0.5;
      const minX = metrics.safeInsets.left + half + 4;
      const maxX = Math.max(minX, metrics.width - metrics.safeInsets.right - half - 4);
      const minY = metrics.safeInsets.top + half + 4;
      const maxY = Math.max(minY, metrics.height - metrics.safeInsets.bottom - half - 4);
      const xPx = clamp((layout.xPct / 100) * metrics.width, minX, maxX);
      const yPx = clamp((layout.yPct / 100) * metrics.height, minY, maxY);
      this.element.style.left = `${xPx.toFixed(1)}px`;
      this.element.style.top = `${yPx.toFixed(1)}px`;
    } else {
      this.element.style.left = `${layout.xPct}%`;
      this.element.style.top = `${layout.yPct}%`;
    }
    this.element.style.opacity = String(
      this.available ? this.baseOpacity : Math.min(0.28, this.baseOpacity),
    );
    this.element.style.display = layout.visible ? 'flex' : 'none';
    this.element.style.transform = `translate3d(-50%, -50%, 0) scale(${effScale.toFixed(3)})`;
  }

  setAvailable(available: boolean): void {
    if (this.available === available) return;
    this.available = available;
    this.element.style.opacity = String(
      available ? this.baseOpacity : Math.min(0.28, this.baseOpacity),
    );
    this.element.style.pointerEvents = available ? 'auto' : 'none';
    if (!available && this.active) {
      this.setActive(false);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  setIcon(iconKey: string, svgHtml: string): void {
    if (this.currentIconKey === iconKey) return;
    this.currentIconKey = iconKey;
    this.iconEl.innerHTML = svgHtml;
  }

  setLabel(label: string, unarmedFire = false): void {
    this.element.setAttribute('aria-label', label);
    if (this.id === 'fire') {
      this.captionEl.textContent = i18n.translateTouchActionCaption('fire', unarmedFire);
    }
  }

  refreshLanguage(unarmedFire = false): void {
    const label = i18n.translateHudSlotLabel(this.id);
    this.element.setAttribute('aria-label', label);
    this.captionEl.textContent = i18n.translateTouchActionCaption(this.id, unarmedFire);
  }

  setBadgeText(text: string | null): void {
    if (text === null || text === '') {
      this.badgeEl.classList.add('hidden');
      this.badgeEl.textContent = '';
    } else {
      this.badgeEl.classList.remove('hidden');
      this.badgeEl.textContent = text;
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.ringEl.classList.remove('border-transparent');
      this.ringEl.classList.add('border-amber-400', 'bg-amber-400/18');
      this.iconEl.style.filter = 'drop-shadow(0 0 8px rgba(251,191,36,0.9)) brightness(1.22)';
    } else {
      this.ringEl.classList.add('border-transparent');
      this.ringEl.classList.remove('border-amber-400', 'bg-amber-400/18');
      this.iconEl.style.filter = '';
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

export const MOBILE_ACTION_DEFINITIONS: readonly ActionButtonDefinition[] = [
  { id: 'fire', label: 'Fire / Punch', sizePx: 70, variant: 'danger', mode: 'momentary' },
  { id: 'aim', label: 'Scope / Aim', sizePx: 52, variant: 'primary', mode: 'toggle' },
  { id: 'jump', label: 'Jump / Vault', sizePx: 54, variant: 'primary', mode: 'momentary' },
  { id: 'sprint', label: 'Sprint', sizePx: 50, variant: 'accent', mode: 'toggle' },
  { id: 'crouch', label: 'Crouch', sizePx: 48, variant: 'neutral', mode: 'toggle' },
  { id: 'prone', label: 'Prone', sizePx: 48, variant: 'neutral', mode: 'toggle' },
  { id: 'reload', label: 'Reload', sizePx: 46, variant: 'neutral', mode: 'momentary' },
  { id: 'weaponSwitch', label: 'Switch Weapon', sizePx: 46, variant: 'neutral', mode: 'momentary' },
  { id: 'holster', label: 'Holster / Unarm', sizePx: 46, variant: 'neutral', mode: 'toggle' },
  { id: 'pickup', label: 'Pickup / Interact', sizePx: 52, variant: 'accent', mode: 'momentary' },
  { id: 'drop', label: 'Drop Weapon', sizePx: 44, variant: 'neutral', mode: 'momentary' },
  { id: 'ability', label: 'Tactical Ability', sizePx: 50, variant: 'accent', mode: 'momentary' },
  { id: 'glooWall', label: 'Gloo Wall', sizePx: 52, variant: 'primary', mode: 'momentary' },
  { id: 'inventory', label: 'Backpack', sizePx: 48, variant: 'neutral', mode: 'toggle' },
  { id: 'minimap', label: 'Minimap', sizePx: 46, variant: 'neutral', mode: 'toggle' },
] as const;
