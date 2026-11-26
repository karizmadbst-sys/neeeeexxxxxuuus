import * as THREE from 'three';
import { clamp } from '../utils/MathUtils';
import type { DamageableTarget, HitDetection } from './HitDetection';
import type { Weapon } from './Weapon';

export interface AimAssistFrameInput {
  deltaSeconds: number;
  strength: number; // 0..1 from settings
  weapon: Weapon | null;
  playerPos: THREE.Vector3;
  cameraPos: THREE.Vector3;
  cameraDir: THREE.Vector3;
  currentYaw: number;
  currentPitch: number;
  targetYaw: number;
  targetPitch: number;
  currentZoomFactor?: number;
  isAiming: boolean;
  isFireHeld: boolean;
  isMoving: boolean;
  isRecentlyLooking: boolean;
  isActivelyLooking?: boolean;
  hitDetection: HitDetection;
}

export interface AimAssistOutput {
  deltaYaw: number;
  deltaPitch: number;
  slowdownScale: number;
  activeTarget: DamageableTarget | null;
  hasTargetLock: boolean;
}

const DEG_TO_RAD = Math.PI / 180;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Free Fire-style torso-locking Aim Assist for both scoped and hip-fire across all eligible
 * firearms (AWM & melee strictly excluded).
 *
 * - Smoothly settles onto the enemy's torso center upon aiming or shooting and maintains stable
 *   body/torso lock throughout continuous fire (scoped or hip-fire) without skyward recoil drift.
 * - Captures a fixed world torso anchor per engagement / manual re-aim rather than chasing
 *   enemy lateral movement across the screen.
 * - Respects strict line-of-sight blocking (walls, terrain, rocks, buildings, doors, Gloo Walls).
 */
export class AimAssistSystem {
  private readonly scratchTargetCenter = new THREE.Vector3();
  private readonly scratchToTarget = new THREE.Vector3();
  private readonly anchorWorldPos = new THREE.Vector3();

  private lockedTargetId: string | null = null;
  private hasActiveAnchor = false;
  private recentFireTimer = 0;
  private acquisitionBlend = 0;
  private wasAiming = false;
  private wasFireHeld = false;
  private wasActivelyLookingWhileEngaged = false;

  private readonly output: AimAssistOutput = {
    deltaYaw: 0,
    deltaPitch: 0,
    slowdownScale: 1.0,
    activeTarget: null,
    hasTargetLock: false,
  };

  static isWeaponEligible(weapon: Weapon | null): boolean {
    if (!weapon) return false;
    const def = weapon.definition;
    if (def.aimAssistEnabled === false) return false;
    if (def.id === 'awm' || def.type === 'MELEE' || def.magazineSize <= 0) return false;
    return true;
  }

  reset(): void {
    this.lockedTargetId = null;
    this.hasActiveAnchor = false;
    this.recentFireTimer = 0;
    this.acquisitionBlend = 0;
    this.wasAiming = false;
    this.wasFireHeld = false;
    this.wasActivelyLookingWhileEngaged = false;
    this.output.deltaYaw = 0;
    this.output.deltaPitch = 0;
    this.output.slowdownScale = 1.0;
    this.output.activeTarget = null;
    this.output.hasTargetLock = false;
  }

  evaluate(input: AimAssistFrameInput): AimAssistOutput {
    this.output.deltaYaw = 0;
    this.output.deltaPitch = 0;
    this.output.slowdownScale = 1.0;
    this.output.activeTarget = null;
    this.output.hasTargetLock = false;

    const aimJustStarted = input.isAiming && !this.wasAiming;
    const fireJustStarted = input.isFireHeld && !this.wasFireHeld;
    this.wasAiming = input.isAiming;
    this.wasFireHeld = input.isFireHeld;

    if (fireJustStarted) {
      this.recentFireTimer = 0.24;
    } else if (this.recentFireTimer > 0) {
      this.recentFireTimer = Math.max(0, this.recentFireTimer - Math.max(0, input.deltaSeconds));
    }

    const strength = clamp(input.strength, 0, 1);
    if (strength <= 0.005 || input.deltaSeconds <= 0) {
      this.lockedTargetId = null;
      this.hasActiveAnchor = false;
      this.recentFireTimer = 0;
      this.acquisitionBlend = 0;
      this.wasActivelyLookingWhileEngaged = false;
      return this.output;
    }

    // Strict AWM / melee exclusion
    if (!AimAssistSystem.isWeaponEligible(input.weapon) || !input.weapon) {
      this.lockedTargetId = null;
      this.hasActiveAnchor = false;
      this.recentFireTimer = 0;
      this.acquisitionBlend = 0;
      this.wasActivelyLookingWhileEngaged = false;
      return this.output;
    }

    const targets = input.hitDetection.getTargets();
    if (targets.length === 0) {
      this.lockedTargetId = null;
      this.hasActiveAnchor = false;
      this.acquisitionBlend = 0;
      this.wasActivelyLookingWhileEngaged = false;
      return this.output;
    }

    const zoom = clamp(input.currentZoomFactor ?? 1.0, 1.0, 10.0);
    const coneZoomScale = 1 / Math.sqrt(zoom);
    const rateZoomScale = 1 / Math.pow(zoom, 0.7);

    const def = input.weapon.definition;
    const wType = def.type;
    let maxRange = Math.min(def.range * 1.05, 92);
    let maxConeDeg = (input.isAiming ? 6.8 : 7.8) * coneZoomScale;
    let frictionConeDeg = (input.isAiming ? 5.0 : 5.8) * coneZoomScale;
    let maxRateDeg = (input.isAiming ? 56 : 48) * rateZoomScale;
    let maxSlowdownReduction = input.isAiming || input.isFireHeld ? 0.8 : 0.54;

    if (wType === 'SNIPER') {
      // Smooth assist for Kar98k, M24, SVD, VSS, Dragunov (AWM strictly excluded above)
      maxRange = Math.min(def.range * 1.05, 130);
      maxConeDeg = (input.isAiming ? 5.6 : 6.4) * coneZoomScale;
      frictionConeDeg = (input.isAiming ? 4.3 : 4.8) * coneZoomScale;
      maxRateDeg = (input.isAiming ? 42 : 34) * rateZoomScale;
      maxSlowdownReduction = input.isAiming || input.isFireHeld ? 0.72 : 0.46;
    } else if (wType === 'SHOTGUN') {
      maxRange = Math.min(def.range * 1.1, 36);
      maxConeDeg = (input.isAiming ? 7.2 : 8.8) * coneZoomScale;
      frictionConeDeg = (input.isAiming ? 5.4 : 6.5) * coneZoomScale;
      maxRateDeg = (input.isAiming ? 58 : 50) * rateZoomScale;
    } else if (wType === 'SMG' || wType === 'PISTOL') {
      maxRange = Math.min(def.range * 1.05, 68);
      maxConeDeg = (input.isAiming ? 7.0 : 8.2) * coneZoomScale;
      frictionConeDeg = (input.isAiming ? 5.2 : 6.0) * coneZoomScale;
      maxRateDeg = (input.isAiming ? 58 : 50) * rateZoomScale;
    } else if (wType === 'LMG') {
      maxRange = Math.min(def.range * 1.05, 96);
      maxConeDeg = (input.isAiming ? 6.5 : 7.6) * coneZoomScale;
      frictionConeDeg = (input.isAiming ? 4.8 : 5.5) * coneZoomScale;
      maxRateDeg = (input.isAiming ? 50 : 44) * rateZoomScale;
    }

    maxConeDeg = Math.max(1.85, maxConeDeg);
    frictionConeDeg = Math.max(1.35, frictionConeDeg);

    const maxRangeSq = maxRange * maxRange;
    const minRangeSq = 1.2 * 1.2;
    const maxConeCos = Math.cos(maxConeDeg * DEG_TO_RAD);

    let bestTarget: DamageableTarget | null = null;
    let bestDot = maxConeCos;
    let bestTargetX = 0;
    let bestTargetY = 0;
    let bestTargetZ = 0;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (!target.isAlive || target.isAlly || !target.bodyMesh.visible) continue;

      // Target upper-center torso/chest (never head)
      target.bodyMesh.getWorldPosition(this.scratchTargetCenter);
      const torsoLift = 0.14 * clamp(target.bodyMesh.scale.y, 0.7, 1.3);
      this.scratchTargetCenter.y += torsoLift;

      this.scratchToTarget.copy(this.scratchTargetCenter).sub(input.cameraPos);
      const distSq = this.scratchToTarget.lengthSq();
      if (distSq < minRangeSq || distSq > maxRangeSq) continue;

      // Verify target is in front of the player character (supports close-quarters indoor fights)
      const dxP = this.scratchTargetCenter.x - input.playerPos.x;
      const dyP = this.scratchTargetCenter.y - (input.playerPos.y + 1.4);
      const dzP = this.scratchTargetCenter.z - input.playerPos.z;
      if (dxP * input.cameraDir.x + dyP * input.cameraDir.y + dzP * input.cameraDir.z < 0.35) {
        continue;
      }

      const invDist = 1 / Math.sqrt(distSq);
      const nx = this.scratchToTarget.x * invDist;
      const ny = this.scratchToTarget.y * invDist;
      const nz = this.scratchToTarget.z * invDist;

      const dot = nx * input.cameraDir.x + ny * input.cameraDir.y + nz * input.cameraDir.z;
      if (dot <= bestDot) continue;

      const dist = distSq * invDist;
      // Strict line-of-sight check: never assist through walls, terrain, rocks, buildings, doors, or Gloo Walls
      if (!input.hitDetection.hasLineOfSight(input.cameraPos, this.scratchTargetCenter, dist)) {
        continue;
      }

      bestTarget = target;
      bestDot = dot;
      bestTargetX = this.scratchTargetCenter.x;
      bestTargetY = this.scratchTargetCenter.y;
      bestTargetZ = this.scratchTargetCenter.z;
    }

    if (!bestTarget) {
      this.lockedTargetId = null;
      this.hasActiveAnchor = false;
      this.wasActivelyLookingWhileEngaged = false;
      this.acquisitionBlend = Math.max(0, this.acquisitionBlend - input.deltaSeconds * 6);
      return this.output;
    }

    this.output.activeTarget = bestTarget;
    const angleDeg = Math.acos(clamp(bestDot, -1, 1)) / DEG_TO_RAD;

    const engaged = input.isAiming || input.isFireHeld || this.recentFireTimer > 0;
    const isNewTarget = this.lockedTargetId !== bestTarget.id;

    if (!engaged) {
      // Passive hover: smooth reticle friction only, never pull camera
      if (isNewTarget) {
        this.lockedTargetId = bestTarget.id;
        this.acquisitionBlend = 0.25;
      } else {
        this.acquisitionBlend = Math.min(1, this.acquisitionBlend + input.deltaSeconds * 9);
      }
      this.hasActiveAnchor = false;
      this.wasActivelyLookingWhileEngaged = false;
    } else if (isNewTarget || aimJustStarted || fireJustStarted || !this.hasActiveAnchor) {
      // Snapshot enemy torso world position ONCE upon aiming/firing or acquiring a new unobstructed target.
      // Never continuously update this anchor to chase/track the enemy's subsequent movement.
      this.lockedTargetId = bestTarget.id;
      this.anchorWorldPos.set(bestTargetX, bestTargetY, bestTargetZ);
      this.hasActiveAnchor = true;
      this.wasActivelyLookingWhileEngaged = false;
      this.acquisitionBlend = isNewTarget ? 0.42 : Math.max(this.acquisitionBlend, 0.62);
    } else {
      this.acquisitionBlend = Math.min(1, this.acquisitionBlend + input.deltaSeconds * 12);
    }

    const acquireEase = smoothstep(0, 1, this.acquisitionBlend);

    // 1. Sticky reticle friction over unobstructed enemy (consistent across scoped & hip-fire)
    if (angleDeg < frictionConeDeg) {
      const frictionWeight = 1 - smoothstep(0.15, frictionConeDeg, angleDeg);
      this.output.slowdownScale = clamp(
        1 - maxSlowdownReduction * strength * frictionWeight * acquireEase,
        0.2,
        1.0,
      );
    }

    if (!engaged) {
      return this.output;
    }

    // Respect deliberate manual mouse/touch drags without fighting the player
    const activelyLooking = Boolean(input.isActivelyLooking);
    if (activelyLooking) {
      this.wasActivelyLookingWhileEngaged = true;
      this.output.hasTargetLock = angleDeg <= frictionConeDeg * 0.95;
      return this.output;
    }

    // If the player just finished a manual re-aim onto the enemy's torso, re-seat the static anchor once
    // (unless they deliberately dragged upward above the torso toward the head).
    if (this.wasActivelyLookingWhileEngaged) {
      this.wasActivelyLookingWhileEngaged = false;
      const distLive = Math.max(
        0.2,
        Math.hypot(
          bestTargetX - input.cameraPos.x,
          bestTargetY - input.cameraPos.y,
          bestTargetZ - input.cameraPos.z,
        ),
      );
      const liveTorsoPitch = -Math.asin(
        clamp((bestTargetY - input.cameraPos.y) / distLive, -0.94, 0.94),
      );
      if (angleDeg <= maxConeDeg * 0.68 && input.targetPitch >= liveTorsoPitch - 0.022) {
        this.anchorWorldPos.set(bestTargetX, bestTargetY, bestTargetZ);
        this.hasActiveAnchor = true;
      } else if (input.targetPitch < liveTorsoPitch - 0.022) {
        // Player intentionally dragged upward (e.g. headshot drag) — don't yank them back down
        this.hasActiveAnchor = false;
        this.output.hasTargetLock = angleDeg <= frictionConeDeg * 0.85;
        return this.output;
      }
    }

    if (!this.hasActiveAnchor) {
      return this.output;
    }

    this.scratchToTarget.copy(this.anchorWorldPos).sub(input.cameraPos);
    const anchorDist = this.scratchToTarget.length();
    if (anchorDist <= 0.15) {
      this.hasActiveAnchor = false;
      return this.output;
    }

    // Re-verify line-of-sight to the captured anchor so cover or Gloo Walls immediately stop assist
    if (!input.hitDetection.hasLineOfSight(input.cameraPos, this.anchorWorldPos, anchorDist)) {
      this.hasActiveAnchor = false;
      return this.output;
    }

    const ax = this.scratchToTarget.x / anchorDist;
    const ay = this.scratchToTarget.y / anchorDist;
    const az = this.scratchToTarget.z / anchorDist;

    const anchorDot = clamp(
      ax * input.cameraDir.x + ay * input.cameraDir.y + az * input.cameraDir.z,
      -1,
      1,
    );
    const anchorAngleDeg = Math.acos(anchorDot) / DEG_TO_RAD;

    // Abort lock if the anchor falls outside the assist cone (never snap across screen)
    if (anchorAngleDeg > maxConeDeg * 1.18) {
      this.hasActiveAnchor = false;
      return this.output;
    }

    // Keep recoil stabilized & torso lock active throughout continuous aiming/firing
    this.output.hasTargetLock = true;

    const desiredYaw = Math.atan2(-ax, -az);
    const desiredPitch = -Math.asin(clamp(ay, -0.94, 0.94));

    let yawDiff = desiredYaw - input.targetYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const pitchDiff = desiredPitch - input.targetPitch;

    const errorMag = Math.hypot(yawDiff, pitchDiff);
    if (errorMag <= 0.00025) {
      return this.output;
    }

    const outerFade = 1 - smoothstep(maxConeDeg * 0.68, maxConeDeg * 1.18, anchorAngleDeg);
    const effectiveStrength = 0.48 + 0.52 * strength;
    const smoothFrac = 1 - Math.exp(-15.5 * effectiveStrength * input.deltaSeconds);
    const maxStepRad =
      maxRateDeg * effectiveStrength * acquireEase * outerFade * DEG_TO_RAD * input.deltaSeconds;
    const ratio = clamp(Math.min(smoothFrac, maxStepRad / errorMag), 0, 1);

    this.output.deltaYaw = yawDiff * ratio;
    this.output.deltaPitch = pitchDiff * ratio;
    return this.output;
  }
}
