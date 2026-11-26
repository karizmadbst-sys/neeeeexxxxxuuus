import * as THREE from 'three';
import type { Subsystem, ViewportMetrics } from '../core/Types';
import { clamp, damp, SCRATCH_VEC3_A, SCRATCH_VEC3_B } from '../utils/MathUtils';
import type { PlayerCollisionWorld } from './IPlayerController';

export class PlayerCamera implements Subsystem {
  readonly camera: THREE.PerspectiveCamera;

  private yaw = 0.0;
  private pitch = 0.19;
  private desiredDistance = 3.65;
  private currentDistance = 3.65;

  private targetYaw = 0.0;
  private targetPitch = 0.19;
  private targetDistance = 3.65;

  private sensitivity = 1.0;
  private adsSensitivity = 1.0;
  private aimStability = 0.5;
  private invertY = false;
  private prevDeltaYaw = 0;
  private prevDeltaPitch = 0;

  private readonly pivotPos = new THREE.Vector3(0, 1.46, 0);
  private readonly aimPivotPos = new THREE.Vector3(0, 1.46, 0);
  private readonly desiredPos = new THREE.Vector3(0, 2.2, 3.65);
  private readonly currentPos = new THREE.Vector3(0, 2.2, 3.65);
  private readonly raycaster = new THREE.Raycaster();
  private currentShoulderOffset = 0.48;
  private baseShoulderOffset = 0.48;

  private readonly baseFov = 58;
  private responsiveBaseFov = 58;
  private currentFov = 58;

  private scopeBlend = 0;
  private targetScopeZoom = 2.0;
  private waitingPitchClamped = false;

  private recoilYaw = 0;
  private recoilPitch = 0;
  private recoilHoldTimer = 0;
  private aimAssistLockActive = false;

  private readonly lookTargetPos = new THREE.Vector3();

  constructor(metrics: ViewportMetrics) {
    this.responsiveBaseFov = this.computeResponsiveFov(metrics);
    this.baseShoulderOffset = this.computeShoulderOffset(metrics);
    this.currentShoulderOffset = this.baseShoulderOffset;
    this.currentFov = this.responsiveBaseFov;
    this.camera = new THREE.PerspectiveCamera(
      this.responsiveBaseFov,
      metrics.aspectRatio,
      0.08,
      2000,
    );
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.pivotPos);
  }

  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }

  getTargetYaw(): number {
    return this.targetYaw;
  }

  getTargetPitch(): number {
    return this.targetPitch;
  }

  setScopeTargetZoom(zoom: number): void {
    this.targetScopeZoom = clamp(zoom, 1.25, 10.0);
  }

  setFarClip(far: number): void {
    const nextFar = clamp(far, 500, 2200);
    if (Math.abs(this.camera.far - nextFar) > 1) {
      this.camera.far = nextFar;
      this.camera.updateProjectionMatrix();
    }
  }

  getScopeBlend(): number {
    return this.scopeBlend;
  }

  private readonly probeOrigin = new THREE.Vector3();
  private readonly probeForward = new THREE.Vector3();
  private readonly probeRight = new THREE.Vector3();
  private readonly probeUp = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  shouldHidePlayerMesh(): boolean {
    return this.scopeBlend > 0.52 || this.currentDistance * (1 - this.scopeBlend) < 0.58;
  }

  isFirstPersonScoped(): boolean {
    return this.scopeBlend > 0.45;
  }

  /**
   * Scales look sensitivity proportionally to current optical magnification (FOV tangent ratio)
   * and blends in the user's independent ADS Sensitivity setting when aiming or scoped.
   */
  getAimSensitivityScale(isAiming = false): number {
    const baseTan = Math.tan(THREE.MathUtils.degToRad(this.responsiveBaseFov * 0.5));
    const currTan = Math.tan(THREE.MathUtils.degToRad(this.currentFov * 0.5));
    const ratio = clamp(currTan / Math.max(0.01, baseTan), 0.08, 1.0);
    const opticalScale = clamp(Math.pow(ratio, 0.84), 0.14, 1.0);
    const adsBlend = isAiming ? Math.max(0.7, this.scopeBlend) : this.scopeBlend;
    const userAdsScale = 1.0 + (this.adsSensitivity - 1.0) * adsBlend;
    return opticalScale * userAdsScale;
  }

  getCurrentZoomFactor(): number {
    const baseTan = Math.tan(THREE.MathUtils.degToRad(this.responsiveBaseFov * 0.5));
    const currTan = Math.tan(THREE.MathUtils.degToRad(this.currentFov * 0.5));
    return clamp(baseTan / Math.max(0.005, currTan), 1.0, 12.0);
  }

  private static readonly MIN_PITCH = -1.46;
  private static readonly MAX_PITCH = 1.46;

  private getMinPitch(): number {
    return PlayerCamera.MIN_PITCH;
  }

  private getMaxPitch(): number {
    return PlayerCamera.MAX_PITCH;
  }

  setAimAssistLockActive(active: boolean): void {
    this.aimAssistLockActive = active;
  }

  resetRecoil(): void {
    this.recoilYaw = 0;
    this.recoilPitch = 0;
    this.recoilHoldTimer = 0;
  }

  setWaitingPitchClamp(enabled: boolean): void {
    this.waitingPitchClamped = enabled;
    if (enabled) {
      this.scopeBlend = 0;
      this.resetRecoil();
      const minPitch = this.getMinPitch();
      const maxPitch = this.getMaxPitch();
      this.targetPitch = clamp(this.targetPitch, minPitch, maxPitch);
      this.pitch = clamp(this.pitch, minPitch, maxPitch);
    }
  }

  resetScope(): void {
    this.scopeBlend = 0;
    const minPitch = this.getMinPitch();
    const maxPitch = this.getMaxPitch();
    this.targetPitch = clamp(this.targetPitch, minPitch, maxPitch);
    this.pitch = clamp(this.pitch, minPitch, maxPitch);
    this.currentFov = this.responsiveBaseFov;
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }

  setAirborneAngles(yaw: number, pitch = 0.45): void {
    this.resetRecoil();
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.pitch = clamp(pitch, this.getMinPitch(), this.getMaxPitch());
    this.targetPitch = this.pitch;
    this.scopeBlend = 0;
  }

  setOptions(
    sensitivity: number,
    invertY: boolean,
    adsSensitivity = 1.0,
    aimStability = 0.5,
  ): void {
    this.sensitivity = clamp(sensitivity, 0.2, 3.0);
    this.adsSensitivity = clamp(adsSensitivity, 0.2, 3.0);
    this.aimStability = clamp(aimStability, 0, 1);
    this.invertY = invertY;
  }

  addLookDelta(deltaYaw: number, deltaPitch: number, isAiming = false): void {
    let effYaw = deltaYaw;
    let effPitch = deltaPitch;

    if (this.aimStability > 0.01) {
      const stab = this.aimStability;
      const threshold = isAiming || this.scopeBlend > 0.2 ? 0.0045 : 0.0025;
      // Attenuate tiny high-frequency opposite-direction micro-tremors while keeping deliberate turns 1:1
      if (
        this.prevDeltaYaw !== 0 &&
        Math.sign(effYaw) !== Math.sign(this.prevDeltaYaw) &&
        Math.abs(effYaw) < threshold
      ) {
        effYaw *= 1 - 0.38 * stab;
      }
      if (
        this.prevDeltaPitch !== 0 &&
        Math.sign(effPitch) !== Math.sign(this.prevDeltaPitch) &&
        Math.abs(effPitch) < threshold
      ) {
        effPitch *= 1 - 0.42 * stab;
      }
    }

    this.prevDeltaYaw = deltaYaw;
    this.prevDeltaPitch = deltaPitch;

    this.targetYaw -= effYaw * this.sensitivity;
    const pitchSign = this.invertY ? -1 : 1;
    let remainingPitchDelta = effPitch * this.sensitivity * pitchSign;
    if (remainingPitchDelta > 0 && this.recoilPitch < 0) {
      const absorb = Math.min(-this.recoilPitch, remainingPitchDelta);
      this.recoilPitch += absorb;
      remainingPitchDelta -= absorb;
    }
    this.targetPitch = clamp(
      this.targetPitch + remainingPitchDelta,
      this.getMinPitch(),
      this.getMaxPitch(),
    );
  }

  addRecoilKick(deltaYaw: number, deltaPitch: number): void {
    const zoom = this.getCurrentZoomFactor();
    const zoomScale = clamp(1 / Math.sqrt(zoom), 0.32, 1.0);
    const lockScale = this.aimAssistLockActive ? 0.14 : 0.48;
    const kickScale = lockScale * zoomScale;

    const maxPitchUpRad = (this.aimAssistLockActive ? 0.0085 : 0.052) * zoomScale;
    const maxYawRad = (this.aimAssistLockActive ? 0.005 : 0.024) * zoomScale;

    this.recoilYaw = clamp(this.recoilYaw + deltaYaw * kickScale, -maxYawRad, maxYawRad);
    this.recoilPitch = clamp(
      this.recoilPitch + deltaPitch * kickScale,
      -maxPitchUpRad,
      0.015,
    );
    this.recoilHoldTimer = this.aimAssistLockActive ? 0.04 : 0.095;
  }

  applyAimAssistDelta(deltaYaw: number, deltaPitch: number): void {
    this.targetYaw += deltaYaw;
    this.targetPitch = clamp(
      this.targetPitch + deltaPitch,
      this.getMinPitch(),
      this.getMaxPitch(),
    );
  }

  getAimRay(outOrigin: THREE.Vector3, outDirection: THREE.Vector3): void {
    outOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(outDirection);
  }

  addZoomDelta(deltaDistance: number): void {
    this.targetDistance = clamp(this.targetDistance + deltaDistance, 2.4, 7.2);
  }

  snapToPlayer(playerPos: THREE.Vector3): void {
    this.scopeBlend = 0;
    this.resetRecoil();
    this.pivotPos.set(playerPos.x, playerPos.y + 1.46, playerPos.z);
    this.yaw = this.targetYaw;
    this.pitch = clamp(this.targetPitch, this.getMinPitch(), this.getMaxPitch());
    this.targetPitch = this.pitch;
    this.desiredDistance = this.targetDistance;
    this.currentDistance = this.targetDistance;
    this.currentShoulderOffset = this.baseShoulderOffset;

    this.probeRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.aimPivotPos.copy(this.pivotPos).addScaledVector(this.probeRight, this.currentShoulderOffset);

    const horiz = Math.cos(this.pitch) * this.currentDistance;
    const vert = Math.sin(this.pitch) * this.currentDistance;
    this.currentPos.set(
      this.aimPivotPos.x + Math.sin(this.yaw) * horiz,
      this.aimPivotPos.y + vert,
      this.aimPivotPos.z + Math.cos(this.yaw) * horiz,
    );
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.aimPivotPos);
  }

  updateViewport(metrics: ViewportMetrics): void {
    this.camera.aspect = metrics.aspectRatio;
    this.responsiveBaseFov = this.computeResponsiveFov(metrics);
    this.baseShoulderOffset = this.computeShoulderOffset(metrics);
    if (this.scopeBlend < 0.05) {
      this.currentFov = this.responsiveBaseFov;
      this.camera.fov = this.currentFov;
    }
    this.camera.updateProjectionMatrix();
  }

  updateAirborne(
    delta: number,
    elapsed: number,
    targetPos: THREE.Vector3,
    phase: 'airplane' | 'freefall' | 'parachute',
    totalSpeedMps: number,
    world: PlayerCollisionWorld,
  ): void {
    this.scopeBlend = 0;

    const rotLambda = 12;
    this.yaw = damp(this.yaw, this.targetYaw, rotLambda, delta);
    this.pitch = damp(this.pitch, this.targetPitch, rotLambda, delta);

    const targetDist =
      phase === 'airplane'
        ? 22.0
        : phase === 'freefall'
          ? 7.8 + clamp((totalSpeedMps - 24) * 0.06, 0, 2.2)
          : 9.2;
    this.currentDistance = damp(this.currentDistance, targetDist, 5.5, delta);

    const targetFovBoost =
      phase === 'airplane'
        ? 7
        : phase === 'freefall'
          ? clamp((totalSpeedMps - 18) * 0.48, 4, 19)
          : 4;
    const desiredFov = this.responsiveBaseFov + targetFovBoost;
    this.currentFov = damp(this.currentFov, desiredFov, 5.5, delta);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.04) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    const pivotOffsetY = phase === 'airplane' ? 1.8 : 1.1;
    const followRate = phase === 'airplane' ? 10 : 16;
    this.pivotPos.x = damp(this.pivotPos.x, targetPos.x, followRate, delta);
    this.pivotPos.y = damp(this.pivotPos.y, targetPos.y + pivotOffsetY, followRate, delta);
    this.pivotPos.z = damp(this.pivotPos.z, targetPos.z, followRate, delta);

    const cosPitch = Math.cos(this.pitch);
    const forwardX = -Math.sin(this.yaw) * cosPitch;
    const forwardY = -Math.sin(this.pitch);
    const forwardZ = -Math.cos(this.yaw) * cosPitch;

    let camDist = this.currentDistance;
    let finalX = this.pivotPos.x - forwardX * camDist;
    let finalZ = this.pivotPos.z - forwardZ * camDist;
    let finalY = this.pivotPos.y - forwardY * camDist;
    const minGround = world.getGroundHeightAt(finalX, finalZ, targetPos.y + 0.5) + 0.55;
    if (finalY < minGround && forwardY > 0.02) {
      const tRay = clamp((this.pivotPos.y - minGround) / forwardY, 0.45, camDist);
      camDist = tRay;
      finalX = this.pivotPos.x - forwardX * camDist;
      finalZ = this.pivotPos.z - forwardZ * camDist;
      finalY = this.pivotPos.y - forwardY * camDist;
    }
    const minGroundClamped = world.getGroundHeightAt(finalX, finalZ, targetPos.y + 0.5) + 0.55;
    finalY = Math.max(minGroundClamped, finalY);

    // Subtle high-speed wind buffet shake during nose-dive
    if (phase === 'freefall' && totalSpeedMps > 32) {
      const buffet = clamp((totalSpeedMps - 32) / 26, 0, 1) * 0.085;
      finalY += Math.sin(elapsed * 37) * buffet;
    }

    this.currentPos.set(finalX, finalY, finalZ);
    this.camera.position.copy(this.currentPos);
    this.lookTargetPos.set(
      this.pivotPos.x + forwardX * 24,
      this.pivotPos.y + forwardY * 24,
      this.pivotPos.z + forwardZ * 24,
    );
    this.camera.lookAt(this.lookTargetPos);
  }

  update(
    delta: number,
    playerPos: THREE.Vector3,
    isSprinting: boolean,
    world: PlayerCollisionWorld,
    isCrouching = false,
    isAiming = false,
    isSitting = false,
    isProne = false,
  ): void {
    const effectiveAiming = isAiming && !this.waitingPitchClamped;
    const minPitch = this.getMinPitch();
    const maxPitch = this.getMaxPitch();
    this.targetPitch = clamp(this.targetPitch, minPitch, maxPitch);

    const scopeRate = effectiveAiming ? 12 : 15;
    this.scopeBlend = damp(this.scopeBlend, effectiveAiming ? 1 : 0, scopeRate, delta);
    if (!isAiming && this.scopeBlend < 0.002) {
      this.scopeBlend = 0;
    } else if (isAiming && this.scopeBlend > 0.998) {
      this.scopeBlend = 1;
    }

    const followLambda = isAiming ? 30 - this.aimStability * 6 : 16;
    const rotLambda = isAiming
      ? 38 - this.aimStability * 23 // 0% -> 38 (raw), 50% -> 26.5, 100% -> 15 (steady)
      : 30 - this.aimStability * 17; // 0% -> 30 (raw), 50% -> 21.5, 100% -> 13 (steady)

    if (this.recoilHoldTimer > 0) {
      this.recoilHoldTimer = Math.max(0, this.recoilHoldTimer - delta);
    }
    const recoilRecoverLambda = this.aimAssistLockActive
      ? 18
      : this.recoilHoldTimer > 0
        ? 5.5
        : 14;
    this.recoilYaw = damp(this.recoilYaw, 0, recoilRecoverLambda, delta);
    this.recoilPitch = damp(this.recoilPitch, 0, recoilRecoverLambda, delta);
    if (Math.abs(this.recoilYaw) < 0.00005) this.recoilYaw = 0;
    if (Math.abs(this.recoilPitch) < 0.00005) this.recoilPitch = 0;

    const desiredYaw = this.targetYaw + this.recoilYaw;
    const desiredPitch = clamp(this.targetPitch + this.recoilPitch, minPitch, maxPitch);
    this.yaw = damp(this.yaw, desiredYaw, rotLambda, delta);
    this.pitch = damp(this.pitch, desiredPitch, rotLambda, delta);

    const sprintOffset = !isAiming && isSprinting ? 0.35 : 0;
    this.desiredDistance = damp(
      this.desiredDistance,
      clamp(this.targetDistance + sprintOffset, 2.4, 7.6),
      10,
      delta,
    );

    // Optical focal-length FOV: tan(fov/2) = tan(baseFov/2) / zoomFactor
    const baseHalfRad = THREE.MathUtils.degToRad(this.responsiveBaseFov * 0.5);
    const scopedFovDeg = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(baseHalfRad) / this.targetScopeZoom),
    );
    const desiredFov = isAiming
      ? scopedFovDeg
      : this.responsiveBaseFov + (isSprinting ? 3.2 : 0);

    this.currentFov = damp(this.currentFov, desiredFov, isAiming ? 12 : 14, delta);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.008) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // Smoothly follow player eye/head pivot (lowered when prone, crouching, or seated)
    const eyeHeight = isProne
      ? 0.52
      : isSitting
        ? 1.2
        : isCrouching
          ? isAiming
            ? 1.04
            : 1.09
          : isAiming
            ? 1.44
            : 1.46;
    this.pivotPos.x = damp(this.pivotPos.x, playerPos.x, followLambda, delta);
    this.pivotPos.y = damp(this.pivotPos.y, playerPos.y + eyeHeight, followLambda, delta);
    this.pivotPos.z = damp(this.pivotPos.z, playerPos.z, followLambda, delta);

    // Over-the-right-shoulder offset in 3rd-person so center crosshair is cleanly separated from character body,
    // smoothly converging to 0 when entering first-person scope.
    this.probeRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const desiredShoulder = this.baseShoulderOffset * (1 - this.scopeBlend);
    let safeShoulder = desiredShoulder;
    if (desiredShoulder > 0.01) {
      this.probeForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const shoulderProbeDist = desiredShoulder + 0.28;
      let safeRightDist = shoulderProbeDist;
      if (world.getSafeCameraDistance) {
        safeRightDist = world.getSafeCameraDistance(
          this.pivotPos,
          this.probeRight,
          shoulderProbeDist,
          this.probeForward,
          this.worldUp,
          1,
        );
      } else {
        const meshes = world.getCameraCollisionMeshes() as THREE.Object3D[];
        this.raycaster.near = 0.05;
        this.raycaster.far = shoulderProbeDist;
        this.raycaster.set(this.pivotPos, this.probeRight);
        const hits = this.raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          safeRightDist = clamp(hits[0].distance - 0.28, 0.18, shoulderProbeDist);
        }
      }
      if (safeRightDist < shoulderProbeDist - 0.02) {
        safeShoulder = safeRightDist <= 0.22 ? 0 : clamp(safeRightDist - 0.12, 0, desiredShoulder);
      }
    }
    if (safeShoulder < this.currentShoulderOffset) {
      this.currentShoulderOffset = damp(this.currentShoulderOffset, safeShoulder, 28, delta);
    } else {
      this.currentShoulderOffset = damp(this.currentShoulderOffset, safeShoulder, 12, delta);
    }

    this.aimPivotPos
      .copy(this.pivotPos)
      .addScaledVector(this.probeRight, this.currentShoulderOffset);

    const horiz = Math.cos(this.pitch) * this.desiredDistance;
    const vert = Math.sin(this.pitch) * this.desiredDistance;

    this.desiredPos.set(
      this.aimPivotPos.x + Math.sin(this.yaw) * horiz,
      this.aimPivotPos.y + vert,
      this.aimPivotPos.z + Math.cos(this.yaw) * horiz,
    );

    // Multi-probe camera raycast from shoulder aim pivot to desired camera position to prevent wall/ceiling clipping
    SCRATCH_VEC3_A.copy(this.desiredPos).sub(this.aimPivotPos);
    const desiredLen = SCRATCH_VEC3_A.length();
    let safeDistance = this.desiredDistance;

    if (desiredLen > 0.001) {
      SCRATCH_VEC3_B.copy(SCRATCH_VEC3_A).divideScalar(desiredLen);
      this.probeUp.crossVectors(this.probeRight, SCRATCH_VEC3_B).normalize();

      if (world.getSafeCameraDistance) {
        safeDistance = world.getSafeCameraDistance(
          this.aimPivotPos,
          SCRATCH_VEC3_B,
          desiredLen,
          this.probeRight,
          this.probeUp,
        );
      } else {
        const meshes = world.getCameraCollisionMeshes() as THREE.Object3D[];
        this.raycaster.near = 0.08;
        this.raycaster.far = desiredLen;

        const offsets = [
          [0, 0],
          [0.18, 0],
          [-0.18, 0],
          [0, 0.16],
          [0, -0.14],
        ];

        for (let p = 0; p < offsets.length; p++) {
          const [ox, oy] = offsets[p];
          this.probeOrigin
            .copy(this.aimPivotPos)
            .addScaledVector(this.probeRight, ox)
            .addScaledVector(this.probeUp, oy);
          this.raycaster.set(this.probeOrigin, SCRATCH_VEC3_B);
          const hits = this.raycaster.intersectObjects(meshes, false);
          if (hits.length > 0) {
            const hitSafe = clamp(hits[0].distance - 0.28, 0.18, this.desiredDistance);
            if (hitSafe < safeDistance) {
              safeDistance = hitSafe;
            }
          }
        }
      }
    }

    // Snap inward immediately when blocked by a wall or ceiling; ease outward smoothly when clear
    if (safeDistance < this.currentDistance) {
      this.currentDistance = safeDistance;
    } else {
      this.currentDistance = damp(this.currentDistance, safeDistance, 8, delta);
    }

    // Blend camera distance cleanly from 3rd-person orbit to first-person optical scope eye anchor
    const effectiveDistance = this.currentDistance * (1 - this.scopeBlend) + 0.02 * this.scopeBlend;

    const forwardX = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const forwardY = -Math.sin(this.pitch);
    const forwardZ = -Math.cos(this.yaw) * Math.cos(this.pitch);

    let clampedDistance = effectiveDistance;
    let finalX = this.aimPivotPos.x - forwardX * clampedDistance;
    let finalZ = this.aimPivotPos.z - forwardZ * clampedDistance;
    let finalY = this.aimPivotPos.y - forwardY * clampedDistance;

    if (clampedDistance > 0.25) {
      const minTerrainY = world.getGroundHeightAt(finalX, finalZ, playerPos.y + 0.4) + 0.28;
      if (finalY < minTerrainY && forwardY > 0.02) {
        clampedDistance = clamp((this.aimPivotPos.y - minTerrainY) / forwardY, 0.22, clampedDistance);
        finalX = this.aimPivotPos.x - forwardX * clampedDistance;
        finalZ = this.aimPivotPos.z - forwardZ * clampedDistance;
        finalY = this.aimPivotPos.y - forwardY * clampedDistance;
      }
      const safeMinTerrainY = world.getGroundHeightAt(finalX, finalZ, playerPos.y + 0.4) + 0.28;
      finalY = Math.max(safeMinTerrainY, finalY);

      if (world.getCeilingHeightAt) {
        const ceilingY = world.getCeilingHeightAt(finalX, finalZ, playerPos.y);
        if (ceilingY < Number.POSITIVE_INFINITY && playerPos.y < ceilingY) {
          const maxCeilingY = ceilingY - 0.24;
          if (finalY > maxCeilingY && forwardY < -0.02) {
            clampedDistance = clamp((this.aimPivotPos.y - maxCeilingY) / forwardY, 0.22, clampedDistance);
            finalX = this.aimPivotPos.x - forwardX * clampedDistance;
            finalZ = this.aimPivotPos.z - forwardZ * clampedDistance;
            finalY = this.aimPivotPos.y - forwardY * clampedDistance;
          }
          finalY = Math.min(finalY, maxCeilingY);
        }
      }
    }

    this.currentPos.set(finalX, finalY, finalZ);
    this.camera.position.copy(this.currentPos);

    // Singularity-free look target forward from shoulder aim pivot (exact match for 3rd-person & 1st-person)
    this.lookTargetPos.set(
      this.aimPivotPos.x + forwardX * 24,
      this.aimPivotPos.y + forwardY * 24,
      this.aimPivotPos.z + forwardZ * 24,
    );
    this.camera.lookAt(this.lookTargetPos);
  }

  private computeShoulderOffset(metrics: ViewportMetrics): number {
    if (metrics.orientation === 'portrait') {
      return 0.36;
    }
    return clamp(0.46 + (metrics.aspectRatio - 1.78) * 0.08, 0.42, 0.56);
  }

  private computeResponsiveFov(metrics: ViewportMetrics): number {
    if (metrics.orientation === 'portrait') {
      return clamp(this.baseFov + (1 - metrics.aspectRatio) * 24, 58, 76);
    }
    if (metrics.aspectRatio < 1.65) {
      return clamp(this.baseFov + (1.65 - metrics.aspectRatio) * 14, 58, 66);
    }
    if (metrics.aspectRatio > 1.9) {
      return clamp(this.baseFov - (metrics.aspectRatio - 1.9) * 3.8, 52.5, 58);
    }
    return this.baseFov;
  }

  dispose(): void {
    // No DOM listeners directly attached
  }
}
