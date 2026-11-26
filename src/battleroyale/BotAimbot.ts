import * as THREE from 'three';
import { clamp } from '../utils/MathUtils';
import type { HitDetection } from '../weapons/HitDetection';
import type { BotEntity } from './BotEntity';
import type { CombatantTargetInfo } from './BotBrain';

export interface AimbotSolution {
  valid: boolean;
  targetX: number;
  targetY: number;
  targetZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  aimYaw: number;
  distance: number;
  leadTimeSec: number;
}

export interface CombatMoveIntent {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  wantJump: boolean;
  wantCrouch: boolean;
}

const _eyeOrigin = new THREE.Vector3();
const _targetEye = new THREE.Vector3();
const GRAVITY = 22.0;

/**
 * Pure AI-Bot-only Aimbot & Combat Trajectory Engine.
 * Human players never invoke or reference this module.
 * All hot-path math uses pre-allocated primitives for zero per-frame GC pressure.
 */
export class BotAimbot {
  static selectBestTarget(
    bot: BotEntity,
    combatants: readonly CombatantTargetInfo[],
    combatantById: ReadonlyMap<string, CombatantTargetInfo>,
    currentTargetId: string | null,
    lastSeenMs: number,
    nowMs: number,
    hitDetection: HitDetection,
    losBudget: { remaining: number },
    outVisibleMap?: { currentVisible: boolean },
  ): CombatantTargetInfo | null {
    const activeWeap = bot.getActiveWeapon();
    const weapRange = activeWeap ? activeWeap.definition.range : 0;
    const detectRange = Math.min(Math.max(bot.profile.awarenessRadius, weapRange * 0.92, 64), 165);
    const detectRangeSq = detectRange * detectRange;

    bot.getEyePosition(_eyeOrigin);

    let bestTarget: CombatantTargetInfo | null = null;
    let bestScore = -1e9;
    let bestVisible = false;

    const currentTarget = currentTargetId ? combatantById.get(currentTargetId) ?? null : null;

    for (let i = 0; i < combatants.length; i++) {
      const c = combatants[i];
      if (c.id === bot.id || c.teamId === bot.teamId) continue;

      const dx = c.x - bot.position.x;
      const dy = c.y - bot.position.y;
      const dz = c.z - bot.position.z;
      const dSq = dx * dx + dy * dy + dz * dz;
      const isRecentAttacker =
        c.id === bot.lastAttackerId && nowMs - bot.lastHitTimeMs < 5500;

      if (dSq > detectRangeSq && !isRecentAttacker) continue;

      const isCurrent = currentTarget !== null && c.id === currentTarget.id;
      const dist = Math.sqrt(dSq);

      let hasLos = false;
      if (losBudget.remaining > 0 || c.id === 'local-player') {
        if (losBudget.remaining > 0) losBudget.remaining--;
        const headOff = c.isCrouching ? 1.15 : 1.48;
        _targetEye.set(c.x, c.y + headOff, c.z);
        hasLos = hitDetection.hasLineOfSight(_eyeOrigin, _targetEye, detectRange + 15);
      } else if (isCurrent && nowMs - lastSeenMs < 240) {
        hasLos = true;
      }

      if (!hasLos && !isRecentAttacker) continue;

      // Score favors visible targets inside active weapon range, closest threats, and recent attackers
      let score = 200 - dist * 1.1;
      if (hasLos) score += 120;
      if (weapRange > 0 && dist <= weapRange) score += 45;
      if (isRecentAttacker) score += 85;
      if (isCurrent && hasLos) score += 28; // Hysteresis prevents erratic flicker when equally matched
      if (c.id === 'local-player' && dist < 55) score += 14;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = c;
        bestVisible = hasLos;
      }
    }

    if (outVisibleMap) {
      outVisibleMap.currentVisible = bestVisible;
    }
    return bestTarget;
  }

  /**
   * Computes exact 3D intercept trajectory toward a moving/jumping/crouching enemy,
   * accounting for projectile travel time and airborne vertical velocity.
   */
  static computeLeadTrajectory(
    bot: BotEntity,
    target: CombatantTargetInfo,
    bulletSpeed: number,
    preferHeadshot: boolean,
    out: AimbotSolution,
  ): void {
    bot.getEyePosition(_eyeOrigin);

    // Track exact hitbox center (chest or head when locked cleanly) matching BotEntity/RemotePlayer/Player hitboxes
    const aimHeightOffset = preferHeadshot
      ? target.isCrouching
        ? 1.28
        : 1.54
      : target.isCrouching
        ? 0.94
        : 1.28;

    const baseTx = target.x;
    const baseTy = target.y + aimHeightOffset;
    const baseTz = target.z;

    const speed = Math.max(40, bulletSpeed);
    const dx0 = baseTx - _eyeOrigin.x;
    const dy0 = baseTy - _eyeOrigin.y;
    const dz0 = baseTz - _eyeOrigin.z;
    const dist0 = Math.hypot(dx0, dy0, dz0);

    if (dist0 < 0.05) {
      out.valid = false;
      return;
    }

    // Two-pass predictive lead time refinement for running/strafing/jumping enemies
    let leadTime = clamp(dist0 / speed, 0, 0.75);
    let predX = baseTx + target.vx * leadTime;
    let predZ = baseTz + target.vz * leadTime;
    let predY = baseTy;
    if (!target.isGrounded) {
      predY += target.vy * leadTime - 0.5 * GRAVITY * leadTime * leadTime;
    }

    const dist1 = Math.hypot(predX - _eyeOrigin.x, predY - _eyeOrigin.y, predZ - _eyeOrigin.z);
    leadTime = clamp(dist1 / speed, 0, 0.75);

    predX = baseTx + target.vx * leadTime;
    predZ = baseTz + target.vz * leadTime;
    predY = baseTy;
    if (!target.isGrounded) {
      predY += target.vy * leadTime - 0.5 * GRAVITY * leadTime * leadTime;
    }

    const fdx = predX - _eyeOrigin.x;
    const fdy = predY - _eyeOrigin.y;
    const fdz = predZ - _eyeOrigin.z;
    const fLen = Math.hypot(fdx, fdy, fdz);
    if (fLen < 0.05) {
      out.valid = false;
      return;
    }

    out.valid = true;
    out.targetX = predX;
    out.targetY = predY;
    out.targetZ = predZ;
    out.dirX = fdx / fLen;
    out.dirY = fdy / fLen;
    out.dirZ = fdz / fLen;
    out.aimYaw = Math.atan2(out.dirX, out.dirZ);
    out.distance = dist0;
    out.leadTimeSec = leadTime;
  }

  /**
   * Computes intelligent tactical movement during combat so bots never stand still:
   * - Aggressive strafe dodging (wider & faster when recently shot)
   * - Weapon-appropriate spacing (pushes with Shotgun/SMG, holds sightline with Sniper/PARAFAL)
   * - Evasive jump & crouch rhythm
   * - Pursues/flanks when enemy momentarily breaks LOS
   */
  static computeCombatMovement(
    bot: BotEntity,
    weaponType: string,
    distance: number,
    toX: number,
    toZ: number,
    hasLiveLos: boolean,
    isReloading: boolean,
    strafeSign: -1 | 1,
    wasRecentlyHit: boolean,
    crouchActive: boolean,
    wantJump: boolean,
    out: CombatMoveIntent,
  ): void {
    let idealMin = 11;
    let idealMax = 34;

    if (weaponType === 'SHOTGUN') {
      idealMin = 3.5;
      idealMax = 10.5;
    } else if (weaponType === 'SMG') {
      idealMin = 7;
      idealMax = 21;
    } else if (weaponType === 'SNIPER') {
      idealMin = 32;
      idealMax = 92;
    }

    if (bot.personality === 'rusher' || bot.personality === 'flanker') {
      idealMin *= 0.65;
      idealMax *= 0.74;
    } else if (bot.personality === 'sniper-scout') {
      idealMin *= 1.15;
      idealMax *= 1.25;
    }

    // Flankers angle diagonally rather than straight line charging
    const strafeMult =
      (wasRecentlyHit ? 1.18 : 0.92) * Math.max(0.75, bot.profile.strafeAgility);
    const perpX = -toZ * strafeSign * strafeMult;
    const perpZ = toX * strafeSign * strafeMult;

    let radial = 0;
    if (isReloading) {
      // Backpedal & strafe defensively while reloading
      radial = distance < 22 ? -0.75 : -0.3;
    } else if (!hasLiveLos) {
      // Advance/flank toward enemy's last seen position when cover blocks LOS
      radial = 0.88;
    } else if (distance > idealMax) {
      radial = 0.85;
    } else if (distance < idealMin) {
      radial = -0.68;
    } else if (bot.personality === 'rusher') {
      radial = 0.32;
    }

    const mx = toX * radial + perpX;
    const mz = toZ * radial + perpZ;
    const mLen = Math.hypot(mx, mz);

    if (mLen > 0.05) {
      out.moveX = mx / mLen;
      out.moveZ = mz / mLen;
    } else {
      out.moveX = perpX;
      out.moveZ = perpZ;
    }

    out.sprint =
      !isReloading &&
      !crouchActive &&
      ((!hasLiveLos && distance > 8) || distance > idealMax + 12);
    out.wantCrouch = isReloading ? distance > 14 : crouchActive;
    out.wantJump = wantJump;
  }
}
