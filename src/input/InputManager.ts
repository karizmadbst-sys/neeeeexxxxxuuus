import type { Subsystem } from '../core/Types';
import { clamp } from '../utils/MathUtils';
import type { ControlSettings, GameAction } from './ControlSettings';

export interface InputMoveVector {
  x: number; // -1 (left) to +1 (right)
  y: number; // -1 (back) to +1 (forward)
  sprint: boolean;
}

export interface InputLookDelta {
  yaw: number;
  pitch: number;
  zoom: number;
}

export class InputManager implements Subsystem {
  private readonly heldInputs = new Set<string>();
  private readonly justPressedInputs = new Set<string>();

  private readonly heldVirtualActions = new Set<GameAction>();
  private readonly justPressedVirtualActions = new Set<GameAction>();

  private isPointerDown = false;
  private activePointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private pendingYaw = 0;
  private pendingPitch = 0;
  private pendingZoom = 0;

  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private virtualJoystickSprint = false;

  private lookSensitivity = 1.0;
  private invertY = false;
  private enabled = true;
  private pointerLockAllowed = false;
  private cursorVisibleOverride = false;
  private pointerLockPending = false;
  private suppressGameKeys = false;
  private weaponScrollSwitchEnabled = false;
  private wheelSwitchAccum = 0;
  private pendingWeaponSwitchStep: -1 | 0 | 1 = 0;
  private lastWeaponWheelSwitchMs = 0;

  private readonly onPointerLockChangeBound = () => {
    if (document.pointerLockElement === this.targetEl) {
      this.pointerLockPending = false;
      this.cursorVisibleOverride = false;
      this.targetEl.style.cursor = '';
      this.isPointerDown = false;
      this.activePointerId = null;
      this.pendingYaw = 0;
      this.pendingPitch = 0;
      this.pendingZoom = 0;
    } else {
      this.pointerLockPending = false;
      this.pendingYaw = 0;
      this.pendingPitch = 0;
      this.pendingZoom = 0;
      this.clearMouseButtonStates();
      this.targetEl.style.cursor = this.cursorVisibleOverride ? 'auto' : '';
    }
  };

  private readonly onPointerLockErrorBound = () => {
    this.pointerLockPending = false;
    this.targetEl.style.cursor = this.cursorVisibleOverride ? 'auto' : '';
  };

  private readonly onKeyDownBound = (e: KeyboardEvent) => {
    if (e.code === 'F1' || e.key === 'F1') {
      e.preventDefault();
      if (!e.repeat && this.enabled) {
        this.toggleMouseCursorCapture();
      }
      return;
    }

    if (!this.enabled) return;

    if (this.suppressGameKeys && (e.code === 'Tab' || e.code === 'Space')) {
      e.preventDefault();
    }

    if (!this.heldInputs.has(e.code)) {
      this.justPressedInputs.add(e.code);
    }
    this.heldInputs.add(e.code);
  };

  private readonly onKeyUpBound = (e: KeyboardEvent) => {
    this.heldInputs.delete(e.code);
  };

  private readonly onBlurBound = () => {
    this.heldInputs.clear();
    this.justPressedInputs.clear();
    this.heldVirtualActions.clear();
    this.justPressedVirtualActions.clear();
    this.isPointerDown = false;
    this.activePointerId = null;
    this.virtualMoveX = 0;
    this.virtualMoveY = 0;
    this.virtualJoystickSprint = false;
    this.wheelSwitchAccum = 0;
    this.pendingWeaponSwitchStep = 0;
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.pendingZoom = 0;
    this.pointerLockPending = false;
  };

  private readonly onContextMenuBound = (e: MouseEvent) => {
    if (this.enabled && this.suppressGameKeys) {
      e.preventDefault();
    }
  };

  private readonly onPointerDownBound = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.target !== this.targetEl) return;

    if (e.pointerType === 'mouse') {
      if (this.pointerLockAllowed && document.pointerLockElement !== this.targetEl) {
        const wasCursorOverride = this.cursorVisibleOverride;
        if (wasCursorOverride || e.button === 0) {
          this.setCursorVisible(false);
        }
        // Clicking outside UI/menus while the F1 cursor is shown hides the cursor and
        // recaptures the mouse without firing an accidental shot or scope press.
        if (wasCursorOverride) {
          return;
        }
      }

      const mouseCode = `Mouse${e.button}`;
      if (!this.heldInputs.has(mouseCode)) {
        this.justPressedInputs.add(mouseCode);
      }
      this.heldInputs.add(mouseCode);

      // In PC pointer-lock gameplay, mouse drag must never rotate the camera when unlocked.
      if (this.pointerLockAllowed) {
        return;
      }
    }

    if (this.activePointerId === null && !(e.pointerType === 'mouse' && this.cursorVisibleOverride)) {
      this.isPointerDown = true;
      this.activePointerId = e.pointerId;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private readonly onPointerMoveBound = (e: PointerEvent) => {
    if (!this.enabled || this.cursorVisibleOverride) return;

    if (document.pointerLockElement === this.targetEl && e.pointerType === 'mouse') {
      const sens = 0.0026 * this.lookSensitivity;
      this.pendingYaw += e.movementX * sens;
      this.pendingPitch += e.movementY * sens * (this.invertY ? -1 : 1);
      return;
    }

    if (this.pointerLockAllowed && e.pointerType === 'mouse') {
      return;
    }

    if (!this.isPointerDown || e.pointerId !== this.activePointerId) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    const isTouch = e.pointerType === 'touch';
    const yawSens = (isTouch ? 0.0056 : 0.0048) * this.lookSensitivity;
    const pitchSens = (isTouch ? 0.0068 : 0.0048) * this.lookSensitivity;
    this.pendingYaw += dx * yawSens;
    this.pendingPitch += dy * pitchSens * (this.invertY ? -1 : 1);
  };

  private readonly onPointerUpBound = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.heldInputs.delete(`Mouse${e.button}`);
    }
    if (e.pointerId === this.activePointerId) {
      this.isPointerDown = false;
      this.activePointerId = null;
    }
  };

  private isWheelOverScrollableOrMenuUi(target: EventTarget | null): boolean {
    if (document.pointerLockElement === this.targetEl) {
      return false;
    }
    if (!(target instanceof Element)) return false;
    if (target === this.targetEl) return false;

    const blockingSelector =
      '[data-role="inv-body"], [data-role="inventory-panel"], [data-role="full-map-modal"], [data-role="ranked-result-modal"], [data-role="match-settings-modal"], .nexus-scroll, dialog, [role="dialog"], input, select, textarea';
    if (target.closest(blockingSelector)) {
      return true;
    }

    let cur: Element | null = target;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur === this.targetEl) break;
      const style = window.getComputedStyle(cur);
      const oy = style.overflowY;
      const ox = style.overflowX;
      if (
        ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
          cur.scrollHeight > cur.clientHeight + 1) ||
        ((ox === 'auto' || ox === 'scroll' || ox === 'overlay') &&
          cur.scrollWidth > cur.clientWidth + 1)
      ) {
        return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  private readonly onWheelBound = (e: WheelEvent) => {
    if (!this.enabled) return;
    if (this.isWheelOverScrollableOrMenuUi(e.target)) return;

    const dy =
      e.deltaMode === 1
        ? e.deltaY * 32
        : e.deltaMode === 2
          ? e.deltaY * 320
          : e.deltaY;
    if (Math.abs(dy) < 0.5) return;

    if (this.weaponScrollSwitchEnabled) {
      // Reset accumulator on direction reversal so trackpads and mice switch immediately
      if ((dy < 0 && this.wheelSwitchAccum > 0) || (dy > 0 && this.wheelSwitchAccum < 0)) {
        this.wheelSwitchAccum = 0;
      }
      this.wheelSwitchAccum += dy;
      if (Math.abs(this.wheelSwitchAccum) >= 32) {
        const now = performance.now();
        if (now - this.lastWeaponWheelSwitchMs >= 80) {
          // Scroll UP (deltaY < 0) -> next weapon (+1); Scroll DOWN (deltaY > 0) -> prev weapon (-1)
          this.pendingWeaponSwitchStep = this.wheelSwitchAccum < 0 ? 1 : -1;
          this.lastWeaponWheelSwitchMs = now;
        }
        this.wheelSwitchAccum = 0;
      }
      return;
    }

    if (
      this.cursorVisibleOverride ||
      (this.pointerLockAllowed && document.pointerLockElement !== this.targetEl)
    ) {
      return;
    }

    // Outside active ground combat (menus, orbit camera, airborne), preserve camera zoom
    if (e.target !== this.targetEl && document.pointerLockElement !== this.targetEl) {
      return;
    }
    this.pendingZoom += clamp(dy * 0.008, -2.5, 2.5);
  };

  constructor(
    private readonly targetEl: HTMLElement,
    private readonly controlSettings: ControlSettings,
  ) {
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    document.addEventListener('pointerlockerror', this.onPointerLockErrorBound);

    targetEl.addEventListener('contextmenu', this.onContextMenuBound);
    targetEl.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound, { passive: true });
    window.addEventListener('pointerup', this.onPointerUpBound, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUpBound, { passive: true });
    window.addEventListener('wheel', this.onWheelBound, { passive: true });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.resetCursorVisibleOverride();
      this.releasePointerLock();
      this.onBlurBound();
    }
  }

  setSuppressGameKeys(suppress: boolean): void {
    this.suppressGameKeys = suppress;
  }

  setWeaponScrollSwitchEnabled(enabled: boolean): void {
    if (this.weaponScrollSwitchEnabled !== enabled) {
      this.weaponScrollSwitchEnabled = enabled;
      this.wheelSwitchAccum = 0;
      if (!enabled) {
        this.pendingWeaponSwitchStep = 0;
      }
    }
  }

  consumeWeaponSwitchStep(): -1 | 0 | 1 {
    const step = this.pendingWeaponSwitchStep;
    this.pendingWeaponSwitchStep = 0;
    return step;
  }

  private clearMouseButtonStates(): void {
    for (let b = 0; b <= 4; b++) {
      const code = `Mouse${b}`;
      this.heldInputs.delete(code);
      this.justPressedInputs.delete(code);
    }
    this.isPointerDown = false;
    this.activePointerId = null;
  }

  private blurFocusedElement(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== this.targetEl) {
      active.blur();
    }
  }

  setPointerLockAllowed(allowed: boolean): void {
    this.pointerLockAllowed = allowed;
    if (!allowed) {
      this.cursorVisibleOverride = false;
      this.pointerLockPending = false;
      this.targetEl.style.cursor = '';
      this.releasePointerLock();
      this.clearMouseButtonStates();
      this.pendingYaw = 0;
      this.pendingPitch = 0;
      this.pendingZoom = 0;
    }
  }

  isCursorVisible(): boolean {
    if (this.cursorVisibleOverride) return true;
    return document.pointerLockElement !== this.targetEl && !this.pointerLockPending;
  }

  setCursorVisible(visible: boolean): void {
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.pendingZoom = 0;
    this.clearMouseButtonStates();

    if (visible) {
      this.cursorVisibleOverride = true;
      this.pointerLockPending = false;
      this.releasePointerLock();
      this.targetEl.style.cursor = 'auto';
    } else {
      this.cursorVisibleOverride = false;
      this.targetEl.style.cursor = '';
      this.blurFocusedElement();
      this.requestPointerLockNow();
    }
  }

  recapturePointerLockIfAllowed(): void {
    if (!this.enabled || !this.pointerLockAllowed) return;
    if (document.pointerLockElement === this.targetEl && !this.cursorVisibleOverride) {
      this.targetEl.style.cursor = '';
      this.blurFocusedElement();
      return;
    }
    this.setCursorVisible(false);
  }

  toggleMouseCursorCapture(): boolean {
    if (!this.enabled || !this.pointerLockAllowed) {
      this.cursorVisibleOverride = false;
      this.pointerLockPending = false;
      this.targetEl.style.cursor = '';
      return false;
    }
    const isCaptured =
      document.pointerLockElement === this.targetEl ||
      (!this.cursorVisibleOverride && this.pointerLockPending);
    if (isCaptured) {
      this.setCursorVisible(true);
      return true;
    }
    this.setCursorVisible(false);
    return false;
  }

  resetCursorVisibleOverride(): void {
    this.cursorVisibleOverride = false;
    this.pointerLockPending = false;
    this.targetEl.style.cursor = '';
  }

  private requestPointerLockNow(): void {
    if (!this.enabled || !this.pointerLockAllowed) {
      this.pointerLockPending = false;
      return;
    }
    if (
      document.pointerLockElement === this.targetEl ||
      typeof this.targetEl.requestPointerLock !== 'function'
    ) {
      this.pointerLockPending = false;
      return;
    }
    this.pointerLockPending = true;
    try {
      const res = this.targetEl.requestPointerLock() as unknown;
      if (res && typeof (res as Promise<void>).then === 'function') {
        (res as Promise<void>).then(
          () => {
            if (document.pointerLockElement !== this.targetEl) {
              this.pointerLockPending = false;
            }
          },
          () => {
            this.pointerLockPending = false;
          },
        );
      }
    } catch {
      this.pointerLockPending = false;
    }
  }

  releasePointerLock(): void {
    this.pointerLockPending = false;
    if (document.pointerLockElement === this.targetEl && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore
      }
    }
  }

  setOptions(lookSensitivity: number, invertY: boolean): void {
    this.lookSensitivity = lookSensitivity;
    this.invertY = invertY;
  }

  setVirtualMove(x: number, y: number, sprint = false): void {
    this.virtualMoveX = clamp(x, -1, 1);
    this.virtualMoveY = clamp(y, -1, 1);
    this.virtualJoystickSprint = sprint;
  }

  setVirtualActionHold(action: GameAction, held: boolean): void {
    if (held) {
      this.heldVirtualActions.add(action);
    } else {
      this.heldVirtualActions.delete(action);
    }
  }

  triggerVirtualAction(action: GameAction): void {
    this.justPressedVirtualActions.add(action);
  }

  isKeyHeld(code: string): boolean {
    return this.heldInputs.has(code);
  }

  consumeJustPressed(code: string): boolean {
    if (this.justPressedInputs.has(code)) {
      this.justPressedInputs.delete(code);
      return true;
    }
    return false;
  }

  isPhysicalActionHeld(action: GameAction): boolean {
    const code = this.controlSettings.getBinding(action);
    if (this.heldInputs.has(code)) return true;
    if (code === 'ShiftLeft' && this.heldInputs.has('ShiftRight')) return true;
    if (code === 'ControlLeft' && this.heldInputs.has('ControlRight')) return true;
    return false;
  }

  consumePhysicalActionJustPressed(action: GameAction): boolean {
    const code = this.controlSettings.getBinding(action);
    if (this.consumeJustPressed(code)) return true;
    if (code === 'ShiftLeft' && this.consumeJustPressed('ShiftRight')) return true;
    if (code === 'ControlLeft' && this.consumeJustPressed('ControlRight')) return true;
    return false;
  }

  consumeVirtualActionJustPressed(action: GameAction): boolean {
    if (this.justPressedVirtualActions.has(action)) {
      this.justPressedVirtualActions.delete(action);
      return true;
    }
    return false;
  }

  isActionHeld(action: GameAction): boolean {
    if (this.heldVirtualActions.has(action)) return true;
    return this.isPhysicalActionHeld(action);
  }

  hasActionIntent(action: GameAction): boolean {
    if (this.heldVirtualActions.has(action) || this.justPressedVirtualActions.has(action)) {
      return true;
    }
    const code = this.controlSettings.getBinding(action);
    if (this.heldInputs.has(code) || this.justPressedInputs.has(code)) {
      return true;
    }
    if (
      code === 'ShiftLeft' &&
      (this.heldInputs.has('ShiftRight') || this.justPressedInputs.has('ShiftRight'))
    ) {
      return true;
    }
    if (
      code === 'ControlLeft' &&
      (this.heldInputs.has('ControlRight') || this.justPressedInputs.has('ControlRight'))
    ) {
      return true;
    }
    return false;
  }

  consumeActionJustPressed(action: GameAction): boolean {
    if (this.consumeVirtualActionJustPressed(action)) return true;
    return this.consumePhysicalActionJustPressed(action);
  }

  clearJustPressed(): void {
    this.justPressedInputs.clear();
    this.justPressedVirtualActions.clear();
  }

  getMoveVector(out: InputMoveVector): InputMoveVector {
    let x = 0;
    let y = 0;

    if (this.isActionHeld('moveLeft') || this.heldInputs.has('ArrowLeft')) x -= 1;
    if (this.isActionHeld('moveRight') || this.heldInputs.has('ArrowRight')) x += 1;
    if (this.isActionHeld('moveForward') || this.heldInputs.has('ArrowUp')) y += 1;
    if (this.isActionHeld('moveBackward') || this.heldInputs.has('ArrowDown')) y -= 1;

    x += this.virtualMoveX;
    y += this.virtualMoveY;

    const lenSq = x * x + y * y;
    if (lenSq > 1) {
      const invLen = 1 / Math.sqrt(lenSq);
      x *= invLen;
      y *= invLen;
    }

    out.x = x;
    out.y = y;
    out.sprint = this.isActionHeld('sprint') || this.virtualJoystickSprint;

    return out;
  }

  consumeLookDelta(out: InputLookDelta): InputLookDelta {
    if (
      this.cursorVisibleOverride ||
      (this.pointerLockAllowed &&
        document.pointerLockElement !== this.targetEl &&
        !this.isPointerDown)
    ) {
      out.yaw = 0;
      out.pitch = 0;
      out.zoom = 0;
    } else {
      out.yaw = this.pendingYaw;
      out.pitch = this.pendingPitch;
      out.zoom = this.pendingZoom;
    }
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.pendingZoom = 0;
    return out;
  }

  dispose(): void {
    this.resetCursorVisibleOverride();
    this.releasePointerLock();
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    document.removeEventListener('pointerlockerror', this.onPointerLockErrorBound);
    this.targetEl.removeEventListener('contextmenu', this.onContextMenuBound);
    this.targetEl.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);
    window.removeEventListener('wheel', this.onWheelBound);
  }
}
