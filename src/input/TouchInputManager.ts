import type { OrientationMode, Subsystem, ViewportMetrics } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import { getFireBulletActionSvg, getPunchSvg } from '../ui/icons/GameIcons';
import { ActionButton, MOBILE_ACTION_DEFINITIONS } from './ActionButton';
import type {
  GameAction,
  HudActionSlotId,
  OrientationControlLayout,
} from './ControlSettings';
import { VirtualJoystick, type VirtualJoystickValue } from './VirtualJoystick';

export interface TouchInputCallbacks {
  onMove: (value: VirtualJoystickValue) => void;
  onActionPress: (action: GameAction) => void;
  onActionHoldChange: (action: GameAction, held: boolean) => void;
  onDesktopActionComplete?: (action: GameAction) => void;
}

export class TouchInputManager implements Subsystem {
  readonly container: HTMLElement;
  readonly joystick: VirtualJoystick;
  readonly buttons = new Map<HudActionSlotId, ActionButton>();

  private joystickPointerId: number | null = null;
  private readonly buttonPointerMap = new Map<number, ActionButton>();
  private touchModeEnabled = false;
  private arenaVisible = false;
  private airbornePhase: 'ground' | 'airplane' | 'freefall' | 'parachute' = 'ground';
  private lastLayout: OrientationControlLayout | null = null;
  private unarmedMode: boolean | null = null;
  private unlimitedAmmoMode = false;

  private readonly onPointerDownBound = (e: PointerEvent) => {
    if (!this.arenaVisible) return;

    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-control-id]');
    if (!target) return;

    const controlId = target.dataset.controlId as ('joystick' | HudActionSlotId) | undefined;
    if (!controlId) return;

    if (controlId === 'joystick') {
      if (!this.touchModeEnabled) return;
      e.stopPropagation();
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      this.container.setPointerCapture?.(e.pointerId);
      this.joystick.beginDrag();
      const val = this.joystick.updateDrag(e.clientX, e.clientY);
      this.callbacks.onMove(val);
      return;
    }

    const btn = this.buttons.get(controlId);
    if (!btn || !btn.isAvailable()) return;

    e.stopPropagation();
    this.buttonPointerMap.set(e.pointerId, btn);
    this.container.setPointerCapture?.(e.pointerId);

    if (btn.mode === 'toggle') {
      const next = !btn.isActive();
      btn.setActive(next);
      this.callbacks.onActionHoldChange(btn.id as GameAction, next);
      this.callbacks.onActionPress(btn.id as GameAction);
    } else {
      btn.setActive(true);
      this.callbacks.onActionHoldChange(btn.id as GameAction, true);
      this.callbacks.onActionPress(btn.id as GameAction);
    }
  };

  private readonly onPointerMoveBound = (e: PointerEvent) => {
    if (!this.arenaVisible || !this.touchModeEnabled) return;
    if (e.pointerId === this.joystickPointerId) {
      e.stopPropagation();
      const val = this.joystick.updateDrag(e.clientX, e.clientY);
      this.callbacks.onMove(val);
    }
  };

  private readonly onPointerEndBound = (e: PointerEvent) => {
    if (e.pointerId === this.joystickPointerId) {
      this.joystickPointerId = null;
      const val = this.joystick.reset();
      this.callbacks.onMove(val);
    }

    const btn = this.buttonPointerMap.get(e.pointerId);
    if (btn) {
      this.buttonPointerMap.delete(e.pointerId);
      if (btn.mode === 'momentary') {
        btn.setActive(false);
        this.callbacks.onActionHoldChange(btn.id as GameAction, false);
      }
      if (e.pointerType === 'mouse' && btn.id !== 'inventory' && btn.id !== 'minimap') {
        this.callbacks.onDesktopActionComplete?.(btn.id as GameAction);
      }
    }
  };

  constructor(private readonly callbacks: TouchInputCallbacks) {
    this.container = document.createElement('div');
    this.container.className = 'absolute inset-0 pointer-events-none select-none';

    this.joystick = new VirtualJoystick();
    this.container.appendChild(this.joystick.element);

    for (const def of MOBILE_ACTION_DEFINITIONS) {
      const btn = new ActionButton(def);
      this.buttons.set(def.id, btn);
      this.container.appendChild(btn.element);
    }

    // Single delegated listener set for all HUD action controls
    this.container.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound, { passive: true });
    window.addEventListener('pointerup', this.onPointerEndBound, { passive: true });
    window.addEventListener('pointercancel', this.onPointerEndBound, { passive: true });
  }

  /**
   * Controls whether touch-exclusive thumbstick & touch fire button are active
   * (independent from arena HUD action icons which remain usable on both PC & touch).
   */
  setEnabled(touchModeEnabled: boolean): void {
    this.touchModeEnabled = touchModeEnabled;
    if (!touchModeEnabled) {
      this.joystickPointerId = null;
      const val = this.joystick.reset();
      this.callbacks.onMove(val);
    }
    this.refreshPhaseVisibility();
  }

  setArenaVisible(visible: boolean): void {
    this.arenaVisible = visible;
    this.container.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.resetAll();
    } else {
      this.refreshPhaseVisibility();
    }
  }

  applyLayout(
    layout: OrientationControlLayout,
    _orientation: OrientationMode,
    metrics?: ViewportMetrics,
  ): void {
    this.lastLayout = layout;
    this.joystick.applyLayout(layout.joystick, metrics);
    for (const [id, btn] of this.buttons) {
      const slot = layout[id];
      if (slot) {
        btn.applyLayout(slot, metrics);
      }
    }
    this.refreshPhaseVisibility();
  }

  setUnlimitedAmmoMode(enabled: boolean): void {
    if (this.unlimitedAmmoMode === enabled) return;
    this.unlimitedAmmoMode = enabled;
    this.setButtonAvailable('reload', !Boolean(this.unarmedMode) && !this.unlimitedAmmoMode);
  }

  setUnarmedMode(unarmed: boolean, hasStoredWeapons = false): void {
    const holsterBtn = this.buttons.get('holster');
    if (holsterBtn && holsterBtn.isActive() !== unarmed) {
      holsterBtn.setActive(unarmed);
    }
    this.setButtonAvailable('reload', !unarmed && !this.unlimitedAmmoMode);

    if (this.unarmedMode !== unarmed) {
      this.unarmedMode = unarmed;
      const fireBtn = this.buttons.get('fire');
      if (fireBtn) {
        if (unarmed) {
          fireBtn.setIcon('punch', getPunchSvg());
          fireBtn.setLabel(i18n.translateTouchActionCaption('fire', true), true);
        } else {
          fireBtn.setIcon('fire', getFireBulletActionSvg());
          fireBtn.setLabel(i18n.translateTouchActionCaption('fire', false), false);
        }
      }
    }

    if (holsterBtn) {
      holsterBtn.setBadgeText(unarmed && hasStoredWeapons ? i18n.t('touch.badge.back') : null);
    }
  }

  refreshLanguage(): void {
    const unarmed = Boolean(this.unarmedMode);
    for (const [id, btn] of this.buttons) {
      btn.refreshLanguage(id === 'fire' && unarmed);
    }
    const holsterBtn = this.buttons.get('holster');
    if (holsterBtn && unarmed && holsterBtn.isActive()) {
      // Badge text is updated cleanly on next setUnarmedMode or immediately if non-empty
      const badgeEl = holsterBtn.element.querySelector('[data-role="badge"]');
      if (badgeEl && !badgeEl.classList.contains('hidden')) {
        holsterBtn.setBadgeText(i18n.t('touch.badge.back'));
      }
    }
  }

  setToggleState(id: HudActionSlotId, active: boolean): void {
    const btn = this.buttons.get(id);
    if (btn && btn.mode === 'toggle' && btn.isActive() !== active) {
      btn.setActive(active);
      this.callbacks.onActionHoldChange(id as GameAction, active);
    }
  }

  setBadgeText(id: HudActionSlotId, text: string | null): void {
    this.buttons.get(id)?.setBadgeText(text);
  }

  setButtonAvailable(id: HudActionSlotId, available: boolean): void {
    const btn = this.buttons.get(id);
    if (btn) {
      btn.setAvailable(available);
    }
  }

  setPickupHighlighted(available: boolean): void {
    const btn = this.buttons.get('pickup');
    if (!btn) return;
    for (const activeBtn of this.buttonPointerMap.values()) {
      if (activeBtn === btn) return;
    }
    btn.setActive(available);
  }

  setAirbornePhase(phase: 'ground' | 'airplane' | 'freefall' | 'parachute'): void {
    this.airbornePhase = phase;
    this.refreshPhaseVisibility();
  }

  private refreshPhaseVisibility(): void {
    const phase = this.airbornePhase;
    if (phase === 'airplane') {
      this.joystick.element.style.display = 'none';
      for (const btn of this.buttons.values()) {
        btn.element.style.display = 'none';
      }
      return;
    }

    if (phase === 'freefall' || phase === 'parachute') {
      const joyVisible =
        this.touchModeEnabled && (this.lastLayout ? this.lastLayout.joystick.visible : true);
      this.joystick.element.style.display = joyVisible ? 'flex' : 'none';
      for (const [id, btn] of this.buttons) {
        const slotVisible = this.lastLayout ? (this.lastLayout[id]?.visible ?? true) : true;
        btn.element.style.display =
          this.touchModeEnabled && id === 'minimap' && slotVisible ? 'flex' : 'none';
      }
      return;
    }

    const joyVisible =
      this.touchModeEnabled && (this.lastLayout ? this.lastLayout.joystick.visible : true);
    this.joystick.element.style.display = joyVisible ? 'flex' : 'none';

    for (const [id, btn] of this.buttons) {
      const slotVisible = this.lastLayout ? (this.lastLayout[id]?.visible ?? true) : true;
      btn.element.style.display = this.touchModeEnabled && slotVisible ? 'flex' : 'none';
    }
  }

  resetAll(): void {
    this.joystickPointerId = null;
    const val = this.joystick.reset();
    this.callbacks.onMove(val);

    this.buttonPointerMap.clear();
    for (const btn of this.buttons.values()) {
      btn.setActive(false);
      this.callbacks.onActionHoldChange(btn.id as GameAction, false);
    }
  }

  dispose(): void {
    this.container.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerEndBound);
    window.removeEventListener('pointercancel', this.onPointerEndBound);
    this.buttons.clear();
    this.container.remove();
  }
}
