import type { PlayerAnimationState, PlayerStateSnapshot } from './IPlayerController';

export type PlayerActionAnimation = 'Shoot' | 'Reload' | 'PunchLeft' | 'PunchRight';

export class PlayerAnimationController {
  private currentState: PlayerAnimationState = 'Idle';
  private actionState: PlayerActionAnimation | null = null;
  private airborneState: 'Skydive' | 'Parachute' | null = null;
  private actionTimer = 0;
  private actionSeq = 0;
  private wasGrounded = true;
  private landTimer = 0;

  getState(): PlayerAnimationState {
    return this.currentState;
  }

  getActiveAction(): PlayerActionAnimation | null {
    return this.actionState;
  }

  getActionSeq(): number {
    return this.actionSeq;
  }

  setAirborneOverride(state: 'Skydive' | 'Parachute' | null): void {
    this.airborneState = state;
    if (state) {
      this.currentState = state;
    }
  }

  triggerAction(action: PlayerActionAnimation, durationSeconds: number): void {
    this.actionState = action;
    this.actionTimer = Math.max(0.05, durationSeconds);
    this.actionSeq += 1;
  }

  clearAction(): void {
    this.actionState = null;
    this.airborneState = null;
    this.actionTimer = 0;
    this.landTimer = 0;
    this.wasGrounded = true;
  }

  clearReloadAction(): void {
    if (this.actionState === 'Reload') {
      this.actionState = null;
      this.actionTimer = 0;
    }
  }

  clearPunchAction(): void {
    if (this.actionState === 'PunchLeft' || this.actionState === 'PunchRight') {
      this.actionState = null;
      this.actionTimer = 0;
    }
  }

  update(delta: number, snapshot: PlayerStateSnapshot): PlayerAnimationState {
    if (!snapshot.isAlive) {
      this.clearAction();
      this.currentState = 'Death';
      return this.currentState;
    }

    if (this.airborneState) {
      this.currentState = this.airborneState;
      return this.currentState;
    }

    if (snapshot.isZiplining) {
      this.actionState = null;
      this.actionTimer = 0;
      this.currentState = 'Zipline';
      return this.currentState;
    }

    if (snapshot.isVaulting) {
      this.actionState = null;
      this.actionTimer = 0;
      this.currentState = 'Vault';
      return this.currentState;
    }

    if (snapshot.isSitting) {
      this.actionState = null;
      this.actionTimer = 0;
      this.currentState = 'Sit';
      return this.currentState;
    }

    if (this.actionState) {
      this.actionTimer -= delta;
      if (this.actionTimer <= 0) {
        this.actionState = null;
        this.actionTimer = 0;
      }
    }

    if (snapshot.isSwimming) {
      this.landTimer = 0;
      this.wasGrounded = true;
      const swimSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
      this.currentState = swimSpeed > 0.25 ? 'SwimMove' : 'SwimIdle';
      return this.currentState;
    }

    if (snapshot.isGrounded && snapshot.isProne) {
      this.landTimer = 0;
      this.wasGrounded = true;
      const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
      const enterProneMove = this.currentState === 'ProneMove' ? 0.12 : 0.22;
      this.currentState = horizSpeed > enterProneMove ? 'ProneMove' : 'ProneIdle';
      return this.currentState;
    }

    if (!snapshot.isGrounded) {
      this.wasGrounded = false;
      this.landTimer = 0;
      this.currentState = snapshot.velocity.y > 0.4 ? 'Jump' : 'Fall';
      return this.currentState;
    }

    if (!this.wasGrounded && snapshot.isGrounded) {
      this.landTimer = 0.22;
    }
    this.wasGrounded = true;

    const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
    if (snapshot.isCrouching) {
      this.landTimer = 0;
      const enterCrouchWalkSpeed = this.currentState === 'CrouchWalk' ? 0.14 : 0.24;
      this.currentState = horizSpeed > enterCrouchWalkSpeed ? 'CrouchWalk' : 'CrouchIdle';
      return this.currentState;
    }

    const enterWalkSpeed = this.currentState === 'Idle' ? 0.36 : 0.22;
    if (horizSpeed > enterWalkSpeed) {
      this.landTimer = 0;
      const runThreshold =
        this.currentState === 'Run'
          ? snapshot.movementSpeed * 0.96
          : snapshot.movementSpeed * 1.06;
      this.currentState =
        snapshot.isSprinting && !snapshot.isAiming && horizSpeed > runThreshold
          ? 'Run'
          : 'Walk';
    } else if (this.landTimer > 0) {
      this.landTimer = Math.max(0, this.landTimer - delta);
      this.currentState = 'Land';
    } else {
      this.currentState = 'Idle';
    }

    return this.currentState;
  }
}
