import * as THREE from 'three';
import type { SittableSeat } from '../maps/BuildingSystem';
import { clamp, SCRATCH_VEC3_A } from '../utils/MathUtils';
import type { PlayerCollisionWorld, PlayerMovementInput, ZiplineRidePlan } from './IPlayerController';
import type { PlayerStats } from './PlayerStats';

const GRAVITY = -22.0;
const GROUND_ACCEL = 16.0;
const AIR_ACCEL = 6.5;
const GROUND_FRICTION = 14.0;
const PLAYER_RADIUS = 0.44;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER_TIME = 0.12;
const VAULT_DURATION_WALK = 0.50;
const VAULT_DURATION_RUN = 0.38;
const VAULT_DURATION_JUMP = 0.34;
const ZIPLINE_PLAYER_HANG_OFFSET = 1.68;

export class PlayerMovement {
  readonly position = new THREE.Vector3(0, 0.24, 0);
  readonly rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  readonly velocity = new THREE.Vector3(0, 0, 0);
  readonly ziplineHandlePos = new THREE.Vector3();

  isGrounded = true;
  isSwimming = false;
  isCrouching = false;
  isProne = false;
  isSitting = false;
  isVaulting = false;
  isZiplining = false;
  activeSeat: SittableSeat | null = null;
  private prevCrouchInput = false;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private targetYaw = 0;
  private sitGraceTimer = 0;
  private sustainedMoveTimer = 0;

  private vaultElapsed = 0;
  private vaultDuration = VAULT_DURATION_RUN;
  vaultMode: 'walk' | 'run' | 'jump' = 'run';
  vaultProgress = 0;
  vaultSillHands: {
    leftX: number;
    leftY: number;
    leftZ: number;
    rightX: number;
    rightY: number;
    rightZ: number;
    sillY: number;
    normalX: number;
    normalZ: number;
  } | null = null;
  private vaultStartX = 0;
  private vaultStartY = 0;
  private vaultStartZ = 0;
  private vaultCtrlY = 0;
  private vaultEndX = 0;
  private vaultEndY = 0;
  private vaultEndZ = 0;
  private vaultYaw = 0;
  private vaultExitSpeed = 3.2;

  private activeZiplinePlan: ZiplineRidePlan | null = null;
  private ziplineProgress = 0;
  private ziplineLength = 1;
  private ziplineGraceTimer = 0;

  private onVaultCallback?: (wasBroken: boolean) => void;
  private onStandCallback?: () => void;
  private onZiplineCallback?: (
    active: boolean,
    ziplineId?: string,
    progress?: number,
    reverse?: boolean,
    speedMps?: number,
  ) => void;

  constructor(
    private readonly stats: PlayerStats,
    private readonly world: PlayerCollisionWorld,
  ) {
    this.resetToSpawn(0, 0);
  }

  setActionCallbacks(
    onVault?: (wasBroken: boolean) => void,
    onStand?: () => void,
    onZipline?: (
      active: boolean,
      ziplineId?: string,
      progress?: number,
      reverse?: boolean,
      speedMps?: number,
    ) => void,
  ): void {
    this.onVaultCallback = onVault;
    this.onStandCallback = onStand;
    this.onZiplineCallback = onZipline;
  }

  clearMovementModes(): void {
    this.isSitting = false;
    this.activeSeat = null;
    this.isVaulting = false;
    if (this.isZiplining) {
      this.isZiplining = false;
      this.activeZiplinePlan = null;
      this.onZiplineCallback?.(false);
    }
    this.isProne = false;
    this.sitGraceTimer = 0;
    this.sustainedMoveTimer = 0;
    this.vaultElapsed = 0;
    this.vaultProgress = 0;
    this.vaultSillHands = null;
  }

  resetToSpawn(x: number, z: number): void {
    const groundY = this.world.getGroundHeightAt(x, z);
    this.position.set(x, groundY, z);
    this.velocity.set(0, 0, 0);
    this.rotation.set(0, 0, 0, 'YXZ');
    this.targetYaw = 0;
    this.isGrounded = true;
    this.isSwimming = false;
    this.isCrouching = false;
    this.isProne = false;
    this.prevCrouchInput = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.clearMovementModes();
  }

  trySit(seat: SittableSeat): boolean {
    if (!this.stats.isAlive || this.isVaulting) return false;
    this.isSitting = true;
    this.activeSeat = seat;
    this.isCrouching = false;
    this.isProne = false;
    this.stats.isSprinting = false;
    this.sitGraceTimer = 0.25;
    this.sustainedMoveTimer = 0;
    this.velocity.set(0, 0, 0);
    this.position.set(seat.seatX, seat.seatY - 0.45, seat.seatZ);
    this.targetYaw = seat.facingYaw;
    this.isGrounded = true;
    return true;
  }

  standUp(withJump = false): boolean {
    if (!this.isSitting) return false;
    const seat = this.activeSeat;
    this.isSitting = false;
    this.activeSeat = null;
    this.sitGraceTimer = 0;
    this.sustainedMoveTimer = 0;

    if (seat) {
      const baseFloorY = seat.seatY - 0.45;
      const sinY = Math.sin(seat.facingYaw);
      const cosY = Math.cos(seat.facingYaw);
      const candidates: Array<[number, number]> = [
        [seat.standX, seat.standZ],
        [seat.seatX + cosY * 0.72, seat.seatZ - sinY * 0.72],
        [seat.seatX - cosY * 0.72, seat.seatZ + sinY * 0.72],
        [seat.seatX - sinY * 0.72, seat.seatZ - cosY * 0.72],
        [seat.seatX, seat.seatZ],
      ];

      let chosenX = seat.seatX;
      let chosenZ = seat.seatZ;
      let chosenY = baseFloorY;

      for (const [cx, cz] of candidates) {
        const gY = this.world.getGroundHeightAt(cx, cz, baseFloorY + 0.65);
        if (Math.abs(gY - baseFloorY) <= 0.65) {
          chosenX = cx;
          chosenZ = cz;
          chosenY = gY;
          break;
        }
      }

      this.position.set(chosenX, chosenY, chosenZ);
      this.world.resolveHorizontalCollision(this.position, PLAYER_RADIUS, 1.62);
      this.position.y = this.world.getGroundHeightAt(
        this.position.x,
        this.position.z,
        chosenY + 0.65,
      );
    }

    if (withJump && this.stats.isAlive) {
      this.velocity.y = this.stats.jumpForce;
      this.isGrounded = false;
    } else {
      this.velocity.y = 0;
      this.isGrounded = true;
    }
    this.onStandCallback?.();
    return true;
  }

  tryStartZipline(plan: ZiplineRidePlan): boolean {
    if (!this.stats.isAlive || this.isVaulting || this.isSitting || this.isZiplining) {
      return false;
    }
    const dx = plan.endX - plan.startX;
    const dy = plan.endY - plan.startY;
    const dz = plan.endZ - plan.startZ;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1.5) return false;

    this.isZiplining = true;
    this.activeZiplinePlan = plan;
    this.ziplineLength = len;
    this.ziplineProgress = clamp(plan.startT, 0, 0.96);
    this.ziplineGraceTimer = 0.25;
    this.isCrouching = false;
    this.isProne = false;
    this.isGrounded = false;
    this.stats.isSprinting = false;
    this.targetYaw = plan.yaw;

    const arch = plan.archLift ?? 0;
    const t0 = this.ziplineProgress;
    const hx = plan.startX + dx * t0;
    const hy = plan.startY + dy * t0 + arch * 4 * t0 * (1 - t0);
    const hz = plan.startZ + dz * t0;
    this.ziplineHandlePos.set(hx, hy, hz);
    const safeAttachGround = this.world.getGroundHeightAt(hx, hz, hy);
    this.position.set(hx, Math.max(safeAttachGround, hy - ZIPLINE_PLAYER_HANG_OFFSET), hz);
    this.velocity.set((dx / len) * plan.speedMps, (dy / len) * plan.speedMps, (dz / len) * plan.speedMps);
    this.onZiplineCallback?.(true, plan.ziplineId, this.ziplineProgress, plan.reverse, plan.speedMps);
    return true;
  }

  detachZipline(withJump = false): boolean {
    if (!this.isZiplining) return false;
    const plan = this.activeZiplinePlan;
    this.isZiplining = false;
    this.activeZiplinePlan = null;
    this.ziplineGraceTimer = 0;
    this.rotation.x = 0;

    if (plan) {
      const fwdX = Math.sin(plan.yaw);
      const fwdZ = Math.cos(plan.yaw);
      const exitSpeed = withJump ? 4.8 : 2.8;
      this.velocity.set(fwdX * exitSpeed, withJump ? this.stats.jumpForce * 0.7 : 0, fwdZ * exitSpeed);
    } else {
      this.velocity.set(0, withJump ? this.stats.jumpForce * 0.7 : 0, 0);
    }

    this.world.resolveHorizontalCollision(this.position, PLAYER_RADIUS, 1.5);
    const groundY = this.world.getGroundHeightAt(this.position.x, this.position.z, this.position.y + 1.0);
    if (this.position.y < groundY) {
      this.position.y = groundY;
    }
    if (this.position.y <= groundY + 0.45 && !withJump) {
      this.position.y = groundY;
      this.isGrounded = true;
      this.velocity.y = 0;
    } else {
      this.isGrounded = false;
    }
    this.onZiplineCallback?.(false, plan?.ziplineId, this.ziplineProgress, plan?.reverse, plan?.speedMps);
    return true;
  }

  tryVaultNearestWindow(dirX?: number, dirZ?: number, maxPerpDist = 1.65): boolean {
    if (!this.stats.isAlive || this.isVaulting || this.isSitting || this.isZiplining) return false;
    if (!this.world.computeWindowVaultPlan) return false;

    const dx = dirX ?? Math.sin(this.rotation.y);
    const dz = dirZ ?? Math.cos(this.rotation.y);
    const plan = this.world.computeWindowVaultPlan(this.position, dx, dz, maxPerpDist);
    if (!plan) return false;

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.isGrounded) {
      this.vaultMode = 'jump';
      this.vaultDuration = VAULT_DURATION_JUMP;
    } else if (this.stats.isSprinting || horizSpeed > this.stats.movementSpeed * 1.05) {
      this.vaultMode = 'run';
      this.vaultDuration = VAULT_DURATION_RUN;
    } else {
      this.vaultMode = 'walk';
      this.vaultDuration = VAULT_DURATION_WALK;
    }

    this.isVaulting = true;
    this.vaultElapsed = 0;
    this.vaultProgress = 0;
    this.vaultStartX = plan.startX;
    this.vaultStartY = plan.startY;
    this.vaultStartZ = plan.startZ;
    this.vaultCtrlY = 2 * plan.apexY - 0.5 * (plan.startY + plan.endY);
    this.vaultEndX = plan.endX;
    this.vaultEndY = plan.endY;
    this.vaultEndZ = plan.endZ;
    this.vaultYaw = plan.vaultYaw;
    this.targetYaw = plan.vaultYaw;
    this.vaultSillHands = {
      leftX: plan.handLeftX,
      leftY: plan.handLeftY,
      leftZ: plan.handLeftZ,
      rightX: plan.handRightX,
      rightY: plan.handRightY,
      rightZ: plan.handRightZ,
      sillY: plan.sillY,
      normalX: plan.wallNormalX,
      normalZ: plan.wallNormalZ,
    };
    this.vaultExitSpeed = clamp(
      Math.max(horizSpeed * 0.78, this.vaultMode === 'walk' ? 2.6 : 4.2),
      2.6,
      this.stats.sprintSpeed * 0.92,
    );
    this.isCrouching = false;
    this.isProne = false;
    this.isGrounded = false;
    this.stats.isSprinting = false;
    this.velocity.set(
      (plan.endX - plan.startX) / this.vaultDuration,
      0,
      (plan.endZ - plan.startZ) / this.vaultDuration,
    );
    this.onVaultCallback?.(plan.wasBroken);
    return true;
  }

  update(delta: number, input: PlayerMovementInput): void {
    if (!this.stats.isAlive) {
      if (this.isSitting || this.isVaulting || this.isZiplining) {
        this.clearMovementModes();
      }
      this.stats.isSprinting = false;
      this.isCrouching = false;
      this.isProne = false;
      this.prevCrouchInput = false;
      this.velocity.x *= Math.exp(-GROUND_FRICTION * delta);
      this.velocity.z *= Math.exp(-GROUND_FRICTION * delta);
      this.applyVerticalPhysics(delta);
      return;
    }

    if (this.isZiplining && this.activeZiplinePlan) {
      const plan = this.activeZiplinePlan;
      this.ziplineGraceTimer = Math.max(0, this.ziplineGraceTimer - delta);
      if (
        this.ziplineGraceTimer <= 0 &&
        (input.jump || input.crouchTogglePressed || input.crouch)
      ) {
        this.detachZipline(input.jump);
        return;
      }

      const endStopT = clamp(1 - 0.9 / Math.max(4, this.ziplineLength), 0.94, 0.985);
      const stepT = (plan.speedMps * delta) / this.ziplineLength;
      this.ziplineProgress = Math.min(endStopT, this.ziplineProgress + stepT);
      const t = this.ziplineProgress;
      const arch = plan.archLift ?? 0;
      const hx = plan.startX + (plan.endX - plan.startX) * t;
      const hy = plan.startY + (plan.endY - plan.startY) * t + arch * 4 * t * (1 - t);
      const hz = plan.startZ + (plan.endZ - plan.startZ) * t;
      this.ziplineHandlePos.set(hx, hy, hz);
      const rideGround = this.world.getGroundHeightAt(hx, hz, hy);
      this.position.set(hx, Math.max(rideGround, hy - ZIPLINE_PLAYER_HANG_OFFSET), hz);

      const invLen = 1 / this.ziplineLength;
      const archSlope = arch * 4 * (1 - 2 * t) * invLen;
      this.velocity.set(
        (plan.endX - plan.startX) * invLen * plan.speedMps,
        ((plan.endY - plan.startY) * invLen + archSlope) * plan.speedMps,
        (plan.endZ - plan.startZ) * invLen * plan.speedMps,
      );

      let yawDiff = plan.yaw - this.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.rotation.y += yawDiff * (1 - Math.exp(-16 * delta));
      this.rotation.x = 0.04;
      this.onZiplineCallback?.(true, plan.ziplineId, this.ziplineProgress, plan.reverse, plan.speedMps);

      if (this.ziplineProgress >= endStopT) {
        this.detachZipline(false);
      }
      return;
    }

    if (this.isVaulting) {
      this.vaultElapsed += delta;
      const t = clamp(this.vaultElapsed / this.vaultDuration, 0, 1);
      this.vaultProgress = t;
      // Slight speed-ramp during push-off and smooth landing settle
      const smooth = t * t * (3 - 2 * t);
      const omt = 1 - t;
      this.position.x = this.vaultStartX + (this.vaultEndX - this.vaultStartX) * smooth;
      this.position.z = this.vaultStartZ + (this.vaultEndZ - this.vaultStartZ) * smooth;
      this.position.y =
        omt * omt * this.vaultStartY +
        2 * omt * t * this.vaultCtrlY +
        t * t * this.vaultEndY;

      let yawDiff = this.vaultYaw - this.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.rotation.y += yawDiff * (1 - Math.exp(-20 * delta));
      this.rotation.x = 0.09 * Math.sin(t * Math.PI);

      if (t >= 1) {
        this.position.set(this.vaultEndX, this.vaultEndY, this.vaultEndZ);
        this.world.resolveHorizontalCollision(this.position, PLAYER_RADIUS, 1.62);
        const landedY = this.world.getGroundHeightAt(
          this.position.x,
          this.position.z,
          this.vaultEndY + 0.65,
        );
        const heightGap = this.position.y - landedY;
        if (heightGap <= 0.45) {
          this.position.y = landedY;
          this.isGrounded = true;
          this.velocity.y = 0;
        } else {
          this.isGrounded = false;
          this.velocity.y = -1.6;
        }
        // Preserve natural forward exit momentum so character keeps moving smoothly after vault!
        this.velocity.x = Math.sin(this.vaultYaw) * this.vaultExitSpeed;
        this.velocity.z = Math.cos(this.vaultYaw) * this.vaultExitSpeed;
        this.isVaulting = false;
        this.vaultElapsed = 0;
        this.vaultProgress = 0;
        this.vaultSillHands = null;
        this.rotation.x = 0;
      }
      return;
    }

    if (this.isSitting && this.activeSeat) {
      const seat = this.activeSeat;
      this.sitGraceTimer = Math.max(0, this.sitGraceTimer - delta);
      const seatPosAlpha = 1 - Math.exp(-18 * delta);
      this.position.x += (seat.seatX - this.position.x) * seatPosAlpha;
      this.position.y += (seat.seatY - 0.45 - this.position.y) * seatPosAlpha;
      this.position.z += (seat.seatZ - this.position.z) * seatPosAlpha;

      this.targetYaw = seat.facingYaw;
      let yawDiff = this.targetYaw - this.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.rotation.y += yawDiff * (1 - Math.exp(-16 * delta));
      this.rotation.x = 0;

      this.velocity.set(0, 0, 0);
      this.isGrounded = true;
      this.stats.isSprinting = false;
      this.isCrouching = false;

      if (input.jump) {
        this.standUp(true);
        return;
      }
      if ((input.crouchTogglePressed || input.crouch) && this.sitGraceTimer <= 0) {
        this.standUp(false);
        return;
      }
      if (Math.hypot(input.moveX, input.moveY) > 0.35 && this.sitGraceTimer <= 0) {
        this.sustainedMoveTimer += delta;
        if (this.sustainedMoveTimer >= 0.16) {
          this.standUp(false);
        }
      } else {
        this.sustainedMoveTimer = 0;
      }
      return;
    }

    if (input.jump) {
      this.jumpBufferTimer = JUMP_BUFFER_TIME;
    } else if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - delta);
    }

    if (this.isGrounded) {
      this.coyoteTimer = COYOTE_TIME;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - delta);
    }

    const forwardX = -Math.sin(input.cameraYaw);
    const forwardZ = -Math.cos(input.cameraYaw);
    const rightX = Math.cos(input.cameraYaw);
    const rightZ = -Math.sin(input.cameraYaw);

    SCRATCH_VEC3_A.set(
      forwardX * input.moveY + rightX * input.moveX,
      0,
      forwardZ * input.moveY + rightZ * input.moveX,
    );

    const hasMoveInput = SCRATCH_VEC3_A.lengthSq() > 0.0025;
    if (hasMoveInput) {
      SCRATCH_VEC3_A.normalize();
    }

    // Window vault on jump press near window OR when jumping/airborne moving directly into a window
    const lookOrMoveX = hasMoveInput ? SCRATCH_VEC3_A.x : forwardX;
    const lookOrMoveZ = hasMoveInput ? SCRATCH_VEC3_A.z : forwardZ;
    if (
      (input.jump || (!this.isGrounded && hasMoveInput && this.velocity.y > -3.5)) &&
      this.tryVaultNearestWindow(lookOrMoveX, lookOrMoveZ, this.isGrounded ? 1.55 : 1.35)
    ) {
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      return;
    }

    const usesToggleProtocol =
      input.crouchTogglePressed !== undefined || input.crouchHoldReleased !== undefined;
    const legacyCrouchJustPressed = input.crouch && !this.prevCrouchInput;
    const crouchJustPressed = usesToggleProtocol
      ? Boolean(input.crouchTogglePressed)
      : legacyCrouchJustPressed;
    this.prevCrouchInput = input.crouch;

    if (input.prone && this.isGrounded) {
      this.isProne = !this.isProne;
      if (this.isProne) {
        this.isCrouching = false;
      } else if (!this.canStandHere()) {
        this.isCrouching = true;
      }
    }

    let enteredCrouchFromProne = false;
    if (crouchJustPressed && this.isProne) {
      this.isProne = false;
      this.isCrouching = true;
      enteredCrouchFromProne = true;
    }

    const explicitSprintWake = Boolean(input.sprintJustPressed) && hasMoveInput && !input.isAiming;
    if ((input.jump || (explicitSprintWake && this.canStandHere()) || (!usesToggleProtocol && input.sprint && hasMoveInput)) && this.isProne) {
      this.isProne = false;
    }
    if (!this.isGrounded) {
      this.isProne = false;
      this.isCrouching = false;
    }

    if (usesToggleProtocol) {
      if (this.isGrounded && !this.isProne) {
        if (crouchJustPressed && !enteredCrouchFromProne) {
          if (this.isCrouching) {
            if (this.canStandHere()) {
              this.isCrouching = false;
            }
          } else {
            this.isCrouching = true;
          }
        } else if (input.crouchHoldReleased && this.isCrouching) {
          if (this.canStandHere()) {
            this.isCrouching = false;
          }
        }
        if (explicitSprintWake && this.isCrouching && this.canStandHere()) {
          this.isCrouching = false;
        }
      } else {
        this.isCrouching = false;
      }
    } else {
      // Legacy fallback for callers providing raw boolean input.crouch
      this.isCrouching = !this.isProne && input.crouch && this.isGrounded;
    }

    const canSprint =
      !input.isAiming &&
      input.sprint &&
      !this.isCrouching &&
      !this.isProne &&
      hasMoveInput &&
      input.moveY >= -0.25;
    this.stats.isSprinting = canSprint;

    const targetSpeed = this.isSwimming
      ? this.stats.movementSpeed * 0.72
      : canSprint
        ? this.stats.sprintSpeed
        : input.isAiming
          ? this.stats.movementSpeed * (this.isProne ? 0.34 : this.isCrouching ? 0.48 : 0.72)
          : this.isProne
            ? this.stats.movementSpeed * 0.38
            : this.isCrouching
              ? this.stats.movementSpeed * 0.56
              : this.stats.movementSpeed;

    const wishVx = hasMoveInput ? SCRATCH_VEC3_A.x * targetSpeed : 0;
    const wishVz = hasMoveInput ? SCRATCH_VEC3_A.z * targetSpeed : 0;

    const rate = hasMoveInput
      ? this.isGrounded
        ? GROUND_ACCEL
        : AIR_ACCEL
      : this.isGrounded
        ? GROUND_FRICTION
        : 2.0;

    const alpha = 1 - Math.exp(-rate * delta);
    this.velocity.x += (wishVx - this.velocity.x) * alpha;
    this.velocity.z += (wishVz - this.velocity.z) * alpha;

    if (Math.abs(this.velocity.x) < 0.01 && !hasMoveInput) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 0.01 && !hasMoveInput) this.velocity.z = 0;

    if (this.jumpBufferTimer > 0 && (this.coyoteTimer > 0 || this.isSwimming)) {
      this.velocity.y = this.isSwimming ? this.stats.jumpForce * 0.76 : this.stats.jumpForce;
      this.isGrounded = false;
      this.isSwimming = false;
      this.isCrouching = false;
      this.isProne = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }

    const effectiveBodyHeight = !this.isGrounded
      ? 1.12
      : this.isProne
        ? 0.65
        : this.isCrouching
          ? 1.1
          : 1.62;
    const stepX = this.velocity.x * delta;
    const stepZ = this.velocity.z * delta;
    const moveDist = Math.hypot(stepX, stepZ);
    const substeps = moveDist > 0.28 ? Math.min(4, Math.ceil(moveDist / 0.24)) : 1;
    const invSteps = 1 / substeps;
    for (let s = 0; s < substeps; s++) {
      this.position.x += stepX * invSteps;
      this.position.z += stepZ * invSteps;
      this.world.resolveHorizontalCollision(
        this.position,
        PLAYER_RADIUS,
        effectiveBodyHeight,
      );
    }

    this.applyVerticalPhysics(delta);

    const horizSpeedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
    if (input.aimYaw !== undefined) {
      this.targetYaw = input.aimYaw + Math.PI;
    } else if (hasMoveInput && horizSpeedSq > 0.15) {
      this.targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
    }

    let yawDiff = this.targetYaw - this.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const turnRate = input.aimYaw !== undefined ? 22 : 13;
    this.rotation.y += yawDiff * (1 - Math.exp(-turnRate * delta));
    this.rotation.x = clamp(this.velocity.y * 0.012, -0.08, 0.08);
  }

  private applyVerticalPhysics(delta: number): void {
    const prevY = this.position.y;
    this.velocity.y += GRAVITY * delta;
    this.position.y += this.velocity.y * delta;

    const wasGrounded = this.isGrounded;
    const refY = Math.max(prevY, this.position.y);
    let groundY = this.world.getGroundHeightAt(this.position.x, this.position.z, refY);
    if (wasGrounded || this.velocity.y <= 0) {
      const footProbeRadius = 0.18;
      const maxStepLift = groundY + 0.26;
      const gxPos = this.world.getGroundHeightAt(this.position.x + footProbeRadius, this.position.z, refY);
      if (gxPos > groundY && gxPos <= maxStepLift) groundY = gxPos;
      const gxNeg = this.world.getGroundHeightAt(this.position.x - footProbeRadius, this.position.z, refY);
      if (gxNeg > groundY && gxNeg <= maxStepLift) groundY = gxNeg;
      const gzPos = this.world.getGroundHeightAt(this.position.x, this.position.z + footProbeRadius, refY);
      if (gzPos > groundY && gzPos <= maxStepLift) groundY = gzPos;
      const gzNeg = this.world.getGroundHeightAt(this.position.x, this.position.z - footProbeRadius, refY);
      if (gzNeg > groundY && gzNeg <= maxStepLift) groundY = gzNeg;
    }

    if (!wasGrounded || this.velocity.y > 0 || groundY > prevY + 0.02) {
      const ceilingY = this.world.getCeilingHeightAt
        ? this.world.getCeilingHeightAt(this.position.x, this.position.z, groundY)
        : Number.POSITIVE_INFINITY;
      if (ceilingY > groundY + 1.82) {
        const maxHeadFloorY = ceilingY - 1.78;
        if (this.position.y > maxHeadFloorY) {
          this.position.y = maxHeadFloorY;
          if (this.velocity.y > 0) {
            this.velocity.y = 0;
          }
        }
      }
    }

    const waterY = this.world.getWaterSurfaceYAt?.(this.position.x, this.position.z) ?? null;
    if (waterY !== null && groundY <= waterY - 0.52) {
      const swimFloatY = Math.max(groundY, waterY - 1.18);
      if (this.position.y <= swimFloatY + 0.16 && this.velocity.y <= 3.2) {
        this.isSwimming = true;
        this.isGrounded = true;
        this.isCrouching = false;
        this.isProne = false;
        const floatAlpha = 1 - Math.exp(-8 * delta);
        this.position.y += (swimFloatY - this.position.y) * floatAlpha;
        this.velocity.y = 0;
        return;
      }
    }
    this.isSwimming = false;

    const heightGap = this.position.y - groundY;
    if (heightGap <= 0 || (wasGrounded && this.velocity.y <= 0 && heightGap <= 0.38)) {
      this.position.y = groundY;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
      this.isGrounded = true;
    } else if (heightGap > 0.38) {
      this.isGrounded = false;
    }
  }

  private canStandHere(): boolean {
    if (!this.world.getCeilingHeightAt) return true;
    const ceilingY = this.world.getCeilingHeightAt(this.position.x, this.position.z, this.position.y);
    if (!Number.isFinite(ceilingY)) return true;
    return ceilingY - this.position.y >= 1.72;
  }
}
