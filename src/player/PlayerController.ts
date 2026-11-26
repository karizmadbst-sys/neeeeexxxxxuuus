import type { GameAction } from '../input/ControlSettings';
import type { InputLookDelta, InputManager, InputMoveVector } from '../input/InputManager';
import type {
  IPlayerController,
  PlayerMovementInput,
  PlayerStateSnapshot,
} from './IPlayerController';
import type { Player } from './Player';
import type { PlayerCamera } from './PlayerCamera';

export type ArenaActionFeedbackCallback = (action: GameAction) => void;

const DISCRETE_ACTIONS: readonly GameAction[] = [
  'reload',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'useMedkit',
  'useSpecial',
  'weaponSwitch',
  'holster',
  'pickup',
  'drop',
  'ability',
  'glooWall',
  'inventory',
  'minimap',
];

export class PlayerController implements IPlayerController {
  readonly id: string;

  private readonly moveVec: InputMoveVector = { x: 0, y: 0, sprint: false };
  private readonly lookDelta: InputLookDelta = { yaw: 0, pitch: 0, zoom: 0 };
  private readonly movementInput: PlayerMovementInput = {
    moveX: 0,
    moveY: 0,
    sprint: false,
    sprintJustPressed: false,
    jump: false,
    crouch: false,
    crouchTogglePressed: false,
    crouchHoldReleased: false,
    prone: false,
    cameraYaw: 0,
  };

  private aiming = false;
  private canScope = true;
  private scopeZoomCycleDelta = 0;
  private scopeZoomWheelAccum = 0;
  private scopeZoomCooldownTimer = 0;
  private fireHeld = false;
  private fireJustPressed = false;
  private aimAssistSlowdownScale = 1.0;
  private recentLookTimer = 0;
  private activeLookTimer = 0;
  private combatAimHoldTimer = 0;
  private crouchKeyWasHeld = false;
  private crouchKeyHoldDuration = 0;
  private onActionFeedback?: ArenaActionFeedbackCallback;

  constructor(
    private readonly player: Player,
    private readonly playerCamera: PlayerCamera,
    private readonly inputManager: InputManager,
    id = 'local-player',
  ) {
    this.id = id;
  }

  setActionFeedbackCallback(cb: ArenaActionFeedbackCallback): void {
    this.onActionFeedback = cb;
  }

  setCanScope(allowed: boolean): void {
    this.canScope = allowed;
    if (!allowed) {
      this.aiming = false;
    }
  }

  forceExitScope(): void {
    this.aiming = false;
  }

  isAiming(): boolean {
    return this.aiming;
  }

  consumeScopeZoomCycleDelta(): number {
    const d = this.scopeZoomCycleDelta;
    this.scopeZoomCycleDelta = 0;
    return d;
  }

  isFireHeld(): boolean {
    return this.fireHeld;
  }

  consumeFireJustPressed(): boolean {
    const val = this.fireJustPressed;
    this.fireJustPressed = false;
    return val;
  }

  setAimAssistSlowdown(scale: number): void {
    this.aimAssistSlowdownScale = Math.max(0.2, Math.min(1.0, scale));
  }

  isRecentlyLooking(): boolean {
    return this.recentLookTimer > 0;
  }

  isActivelyLooking(): boolean {
    return this.activeLookTimer > 0;
  }

  update(deltaSeconds: number): void {
    if (this.player.isEmoting()) {
      this.aiming = false;
      this.scopeZoomCycleDelta = 0;
      this.fireHeld = false;
      this.fireJustPressed = false;
      if (this.recentLookTimer > 0) {
        this.recentLookTimer = Math.max(0, this.recentLookTimer - deltaSeconds);
      }
      if (this.activeLookTimer > 0) {
        this.activeLookTimer = Math.max(0, this.activeLookTimer - deltaSeconds);
      }
      if (this.combatAimHoldTimer > 0) {
        this.combatAimHoldTimer = Math.max(0, this.combatAimHoldTimer - deltaSeconds);
      }

      // Allow camera look & zoom while dancing, but lock movement and combat actions
      this.inputManager.consumeLookDelta(this.lookDelta);
      if (
        Math.abs(this.lookDelta.yaw) > 0.00001 ||
        Math.abs(this.lookDelta.pitch) > 0.00001
      ) {
        this.recentLookTimer = 0.35;
        this.playerCamera.addLookDelta(this.lookDelta.yaw, this.lookDelta.pitch);
      }
      if (Math.abs(this.lookDelta.zoom) > 0.0001) {
        this.playerCamera.addZoomDelta(this.lookDelta.zoom);
      }

      this.inputManager.consumeActionJustPressed('aim');
      this.inputManager.consumeActionJustPressed('jump');
      this.inputManager.consumePhysicalActionJustPressed('sprint');
      this.inputManager.consumeVirtualActionJustPressed('sprint');
      this.inputManager.consumeVirtualActionJustPressed('crouch');
      this.inputManager.consumePhysicalActionJustPressed('crouch');
      this.inputManager.consumeActionJustPressed('prone');
      this.inputManager.consumeActionJustPressed('fire');
      for (let i = 0; i < DISCRETE_ACTIONS.length; i++) {
        this.inputManager.consumeActionJustPressed(DISCRETE_ACTIONS[i]);
      }

      this.movementInput.moveX = 0;
      this.movementInput.moveY = 0;
      this.movementInput.sprint = false;
      this.movementInput.sprintJustPressed = false;
      this.movementInput.jump = false;
      this.movementInput.crouch = false;
      this.movementInput.crouchTogglePressed = false;
      this.movementInput.crouchHoldReleased = false;
      this.movementInput.prone = false;
      this.movementInput.isAiming = false;
      this.movementInput.cameraYaw = this.playerCamera.getYaw();
      this.movementInput.aimYaw = undefined;

      this.player.updateLogic(deltaSeconds, this.movementInput);
      return;
    }

    // 1. Toggle Scope on press (works identically on PC RMB and Mobile SCOPE button)
    if (this.inputManager.consumeActionJustPressed('aim')) {
      if (!this.aiming) {
        if (this.canScope && this.player.isAlive) {
          this.aiming = true;
          this.onActionFeedback?.('aim');
        } else {
          this.aiming = false;
        }
      } else {
        this.aiming = false;
        this.onActionFeedback?.('aim');
      }
    }

    if (!this.canScope || !this.player.isAlive) {
      this.aiming = false;
    }

    if (this.recentLookTimer > 0) {
      this.recentLookTimer = Math.max(0, this.recentLookTimer - deltaSeconds);
    }
    if (this.activeLookTimer > 0) {
      this.activeLookTimer = Math.max(0, this.activeLookTimer - deltaSeconds);
    }
    if (this.combatAimHoldTimer > 0) {
      this.combatAimHoldTimer = Math.max(0, this.combatAimHoldTimer - deltaSeconds);
    }

    // 2. Read look & zoom deltas with optical magnification + aim-assist friction scaling
    this.inputManager.consumeLookDelta(this.lookDelta);
    if (
      Math.abs(this.lookDelta.yaw) > 0.00001 ||
      Math.abs(this.lookDelta.pitch) > 0.00001
    ) {
      this.recentLookTimer = 0.35;
      if (Math.abs(this.lookDelta.yaw) + Math.abs(this.lookDelta.pitch) > 0.0005) {
        this.activeLookTimer = 0.06;
      }
      const aimSensScale = this.playerCamera.getAimSensitivityScale(this.aiming);
      const totalScale = aimSensScale * this.aimAssistSlowdownScale;
      this.playerCamera.addLookDelta(
        this.lookDelta.yaw * totalScale,
        this.lookDelta.pitch * totalScale,
        this.aiming,
      );
    }
    if (this.scopeZoomCooldownTimer > 0) {
      this.scopeZoomCooldownTimer = Math.max(0, this.scopeZoomCooldownTimer - deltaSeconds);
    }
    this.scopeZoomCycleDelta = 0;
    if (Math.abs(this.lookDelta.zoom) > 0.0001) {
      if (this.aiming) {
        if (
          (this.lookDelta.zoom < 0 && this.scopeZoomWheelAccum > 0) ||
          (this.lookDelta.zoom > 0 && this.scopeZoomWheelAccum < 0)
        ) {
          this.scopeZoomWheelAccum = 0;
        }
        this.scopeZoomWheelAccum += this.lookDelta.zoom;
        if (Math.abs(this.scopeZoomWheelAccum) >= 0.25 && this.scopeZoomCooldownTimer <= 0) {
          this.scopeZoomCycleDelta = this.scopeZoomWheelAccum < 0 ? 1 : -1;
          this.scopeZoomWheelAccum = 0;
          this.scopeZoomCooldownTimer = 0.12;
        }
      } else {
        this.scopeZoomWheelAccum = 0;
        this.playerCamera.addZoomDelta(this.lookDelta.zoom);
      }
    } else if (!this.aiming) {
      this.scopeZoomWheelAccum = 0;
    }

    // 3. Read movement + sprint + jump + crouch + prone inputs via ControlSettings bindings
    this.inputManager.getMoveVector(this.moveVec);
    const jumpPressed = this.inputManager.consumeActionJustPressed('jump');

    // Explicit sprint button/key tap (virtual joystick edge tilt does NOT count as explicit sprint stand-up)
    const sprintButtonPressed =
      this.inputManager.consumePhysicalActionJustPressed('sprint') ||
      this.inputManager.consumeVirtualActionJustPressed('sprint');

    // Crouch: Virtual HUD toggle button taps OR PC hybrid tap-toggle / hold-to-crouch (>= 0.28s hold releases to stand)
    const virtualCrouchPressed = this.inputManager.consumeVirtualActionJustPressed('crouch');
    const physicalCrouchPressed = this.inputManager.consumePhysicalActionJustPressed('crouch');
    const physicalCrouchHeld = this.inputManager.isPhysicalActionHeld('crouch');

    let crouchTogglePressed = virtualCrouchPressed;
    let crouchHoldReleased = false;
    if (physicalCrouchHeld) {
      if (!this.crouchKeyWasHeld || physicalCrouchPressed) {
        crouchTogglePressed = true;
        this.crouchKeyHoldDuration = 0;
      } else {
        this.crouchKeyHoldDuration += deltaSeconds;
      }
      this.crouchKeyWasHeld = true;
    } else if (this.crouchKeyWasHeld) {
      if (this.crouchKeyHoldDuration >= 0.28) {
        crouchHoldReleased = true;
      }
      this.crouchKeyWasHeld = false;
      this.crouchKeyHoldDuration = 0;
    }

    const crouchHeld = this.inputManager.isActionHeld('crouch');
    const pronePressed = this.inputManager.consumeActionJustPressed('prone');
    if (pronePressed) {
      this.onActionFeedback?.('prone');
    }

    this.fireHeld = this.inputManager.isActionHeld('fire');
    this.fireJustPressed = this.inputManager.consumeActionJustPressed('fire');
    if (this.fireHeld || this.fireJustPressed) {
      this.combatAimHoldTimer = 0.38;
    }

    this.movementInput.moveX = this.moveVec.x;
    this.movementInput.moveY = this.moveVec.y;
    this.movementInput.sprint = this.aiming ? false : this.moveVec.sprint;
    this.movementInput.sprintJustPressed = !this.aiming && sprintButtonPressed;
    this.movementInput.jump = jumpPressed;
    this.movementInput.crouch = crouchHeld;
    this.movementInput.crouchTogglePressed = crouchTogglePressed;
    this.movementInput.crouchHoldReleased = crouchHoldReleased;
    this.movementInput.prone = pronePressed;
    this.movementInput.isAiming = this.aiming;
    this.movementInput.cameraYaw = this.playerCamera.getYaw();
    this.movementInput.aimYaw =
      this.aiming || this.fireHeld || this.fireJustPressed || this.combatAimHoldTimer > 0
        ? this.playerCamera.getYaw()
        : undefined;

    // 4. Emit discrete tactical action triggers for subsystems (weapons, abilities, HUD)
    for (let i = 0; i < DISCRETE_ACTIONS.length; i++) {
      const act = DISCRETE_ACTIONS[i];
      if (this.inputManager.consumeActionJustPressed(act)) {
        this.onActionFeedback?.(act);
      }
    }

    // 5. Advance Player logic (movement, stats, animation state)
    this.player.updateLogic(deltaSeconds, this.movementInput);
  }

  updateAirborneInputs(outMoveVec: InputMoveVector): { jumpPressed: boolean } {
    this.aiming = false;
    this.scopeZoomCycleDelta = 0;
    this.fireHeld = false;
    this.fireJustPressed = false;
    this.aimAssistSlowdownScale = 1.0;
    this.recentLookTimer = 0;
    this.activeLookTimer = 0;
    this.combatAimHoldTimer = 0;

    this.inputManager.consumeLookDelta(this.lookDelta);
    if (
      Math.abs(this.lookDelta.yaw) > 0.00001 ||
      Math.abs(this.lookDelta.pitch) > 0.00001
    ) {
      this.playerCamera.addLookDelta(this.lookDelta.yaw, this.lookDelta.pitch);
    }
    if (Math.abs(this.lookDelta.zoom) > 0.0001) {
      this.playerCamera.addZoomDelta(this.lookDelta.zoom);
    }

    this.inputManager.getMoveVector(outMoveVec);
    const jumpPressed = this.inputManager.consumeActionJustPressed('jump');

    if (this.inputManager.consumeActionJustPressed('minimap')) {
      this.onActionFeedback?.('minimap');
    }

    return { jumpPressed };
  }

  getSnapshot(): PlayerStateSnapshot {
    return this.player.getSnapshot();
  }

  dispose(): void {
    this.onActionFeedback = undefined;
  }
}
