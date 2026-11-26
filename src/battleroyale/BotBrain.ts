import * as THREE from 'three';
import type { LootItem } from '../loot/LootItem';
import type { LootManager } from '../loot/LootManager';
import type { MapManager } from '../maps/MapManager';
import type { HitDetection } from '../weapons/HitDetection';
import type { SafeZoneState } from '../zone/IZoneSystem';
import {
  BotAimbot,
  type AimbotSolution,
  type CombatMoveIntent,
} from './BotAimbot';
import type { BotEntity } from './BotEntity';

export interface BuildingPoiWaypoint {
  id: string;
  areaName: string;
  x: number;
  z: number;
  roomPoints: ReadonlyArray<{ x: number; y: number; z: number }>;
  isInterior: boolean;
}

export interface CombatantTargetInfo {
  id: string;
  teamId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  isCrouching: boolean;
  isGrounded: boolean;
}

export interface BotFireRequest {
  shooter: BotEntity;
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  aimX: number;
  aimY: number;
  aimZ: number;
  leadTimeSec: number;
  isAimbotHeadshot: boolean;
  target: CombatantTargetInfo;
}

export interface BotMeleeRequest {
  attacker: BotEntity;
  target: CombatantTargetInfo;
  dirX: number;
  dirZ: number;
  isHeadshot: boolean;
}

export interface BrainUpdateContext {
  delta: number;
  nowMs: number;
  mapManager: MapManager;
  lootManager: LootManager;
  hitDetection: HitDetection;
  zone: SafeZoneState;
  waypoints: readonly BuildingPoiWaypoint[];
  waypointById: ReadonlyMap<string, BuildingPoiWaypoint>;
  combatants: readonly CombatantTargetInfo[];
  combatantById: ReadonlyMap<string, CombatantTargetInfo>;
  losBudget: { remaining: number };
  viewerX?: number;
  viewerZ?: number;
  onFireRequest: (req: BotFireRequest) => void;
  onMeleeRequest?: (req: BotMeleeRequest) => void;
}

const _scratchLoot: LootItem[] = [];
const _eyeA = new THREE.Vector3();
const _eyeB = new THREE.Vector3();

export class BotBrain {
  private decisionCooldown = 0;
  private doorCooldown = 0;
  private lootSearchWaypoint: { x: number; z: number; y?: number } | null = null;
  private activeBuildingId: string | null = null;
  private roomExploreIndex = 0;
  private visitedBuildingIds = new Set<string>();

  private targetLootId: string | null = null;
  private targetEnemyId: string | null = null;
  private targetLastSeenX = 0;
  private targetLastSeenZ = 0;
  private targetLastSeenMs = 0;
  private reactionDelayTimer = 0;

  private strafeSign: -1 | 1 = 1;
  private strafeFlipTimer = 1.1;
  private burstTimer = 0;
  private burstPauseTimer = 0;
  private crouchHoldTimer = 0;
  private jumpCooldown = 0;

  private coverRetreatTimer = 0;
  private coverDirX = 0;
  private coverDirZ = 0;

  // Stuck detection & smooth obstacle detour
  private stuckCheckTimer = 0;
  private lastCheckX = 0;
  private lastCheckZ = 0;
  private detourTimer = 0;
  private detourAngleOffset = 0;
  private lootCollectAccum = 0;

  // AI-only Aimbot state (zero allocations)
  private lockedTargetVisible = false;
  private lastTargetLosMs = 0;
  private outOfLosSinceMs = 0;
  private readonly visOut = { currentVisible: false };
  private readonly aimSolution: AimbotSolution = {
    valid: false,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    dirX: 0,
    dirY: 0,
    dirZ: 1,
    aimYaw: 0,
    distance: 0,
    leadTimeSec: 0,
  };
  private readonly combatMove: CombatMoveIntent = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    wantJump: false,
    wantCrouch: false,
  };

  private randSeed: number;

  constructor(seed: number) {
    this.randSeed = seed >>> 0 || 1337;
    this.decisionCooldown = this.nextRand() * 0.25;
    this.strafeSign = this.nextRand() > 0.5 ? 1 : -1;
  }

  private nextRand(): number {
    this.randSeed = (Math.imul(this.randSeed, 1664525) + 1013904223) >>> 0;
    return this.randSeed / 4294967296;
  }

  update(bot: BotEntity, ctx: BrainUpdateContext): void {
    if (!bot.isAlive || bot.dropPhase !== 'landed') return;

    const dt = ctx.delta;
    this.decisionCooldown = Math.max(0, this.decisionCooldown - dt);
    this.doorCooldown = Math.max(0, this.doorCooldown - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.crouchHoldTimer = Math.max(0, this.crouchHoldTimer - dt);
    this.detourTimer = Math.max(0, this.detourTimer - dt);
    this.coverRetreatTimer = Math.max(0, this.coverRetreatTimer - dt);

    this.strafeFlipTimer -= dt;
    if (this.strafeFlipTimer <= 0) {
      this.strafeSign = this.nextRand() > 0.5 ? 1 : -1;
      this.strafeFlipTimer = 0.75 + this.nextRand() * 1.15;
    }

    // Periodically think: update threat perception, loot targets, cover/heal, zone rotation
    if (this.decisionCooldown <= 0) {
      this.decisionCooldown = 0.22 + this.nextRand() * 0.14;
      this.think(bot, ctx);
    }

    // Immediate target lock/switch if attacked
    if (
      bot.lastAttackerId &&
      ctx.nowMs - bot.lastHitTimeMs < 550 &&
      bot.lastAttackerId !== this.targetEnemyId
    ) {
      const attacker = ctx.combatantById.get(bot.lastAttackerId);
      if (attacker) {
        this.targetEnemyId = attacker.id;
        this.targetLastSeenX = attacker.x;
        this.targetLastSeenZ = attacker.z;
        this.targetLastSeenMs = ctx.nowMs;
        this.reactionDelayTimer = Math.min(this.reactionDelayTimer, bot.profile.reactionSec * 0.4);
        this.lastTargetLosMs = 0;
      }
    }

    // Open closed doors when approaching building thresholds
    if (this.doorCooldown <= 0) {
      const door = ctx.mapManager.findNearestDoor(bot.position, 2.35);
      if (door && !door.isOpen) {
        ctx.mapManager.tryToggleNearestDoor(bot.position);
        this.doorCooldown = 1.4;
      } else {
        this.doorCooldown = 0.25;
      }
    }

    // Collect desired nearby loot within reach (throttled when not actively looting)
    this.lootCollectAccum += dt;
    if (bot.behaviorState === 'loot' || this.lootCollectAccum >= 0.22) {
      this.lootCollectAccum = 0;
      this.tryCollectNearbyLoot(bot, ctx.lootManager);
    }

    // Execute smooth per-frame steering & Aimbot combat action
    let moveX = 0;
    let moveZ = 0;
    let sprint = false;
    let wantJump = false;
    let wantCrouch = this.crouchHoldTimer > 0;
    let aimYaw = bot.rotation.y;
    let combatAimLocked = false;

    if (bot.behaviorState === 'heal' || bot.pendingHealKind) {
      // Strafe/crouch behind cover while channeling medkit/shield
      wantCrouch = true;
      if (this.coverRetreatTimer > 0) {
        moveX = this.coverDirX;
        moveZ = this.coverDirZ;
      }
      if (this.targetEnemyId) {
        aimYaw = Math.atan2(
          this.targetLastSeenX - bot.position.x,
          this.targetLastSeenZ - bot.position.z,
        );
      }
    } else if (bot.behaviorState === 'take-cover') {
      moveX = this.coverDirX;
      moveZ = this.coverDirZ;
      sprint = true;
      if (this.targetEnemyId) {
        aimYaw = Math.atan2(
          this.targetLastSeenX - bot.position.x,
          this.targetLastSeenZ - bot.position.z,
        );
      } else if (Math.hypot(moveX, moveZ) > 0.1) {
        aimYaw = Math.atan2(moveX, moveZ);
      }
    } else if (bot.behaviorState === 'combat' && this.targetEnemyId) {
      let liveTarget = ctx.combatantById.get(this.targetEnemyId) ?? null;
      if (!liveTarget) {
        // Locked target died or disappeared — immediately re-scan and switch targets
        this.targetEnemyId = null;
        this.lockedTargetVisible = false;
        this.think(bot, ctx);
        liveTarget = this.targetEnemyId ? ctx.combatantById.get(this.targetEnemyId) ?? null : null;
      }

      if (liveTarget) {
        this.targetLastSeenX = liveTarget.x;
        this.targetLastSeenZ = liveTarget.z;

        const dx = liveTarget.x - bot.position.x;
        const dz = liveTarget.z - bot.position.z;
        const dist = Math.max(0.1, Math.hypot(dx, dz));
        const toX = dx / dist;
        const toZ = dz / dist;

        bot.selectBestWeaponForDistance(dist);
        const activeWeapon = bot.getActiveWeapon();

        // Check periodic live LOS for current locked enemy (fast Grid-DDA, ~9Hz per active combat bot)
        if (ctx.nowMs - this.lastTargetLosMs >= 110) {
          this.lastTargetLosMs = ctx.nowMs;
          bot.getEyePosition(_eyeA);
          _eyeB.set(liveTarget.x, liveTarget.y + (liveTarget.isCrouching ? 1.15 : 1.48), liveTarget.z);
          const vis = ctx.hitDetection.hasLineOfSight(
            _eyeA,
            _eyeB,
            Math.max(bot.profile.awarenessRadius, activeWeapon?.definition.range ?? 80) + 15,
          );
          this.lockedTargetVisible = vis;
          if (vis) {
            this.targetLastSeenMs = ctx.nowMs;
            this.outOfLosSinceMs = 0;
          } else if (this.outOfLosSinceMs === 0) {
            this.outOfLosSinceMs = ctx.nowMs;
          }
        }

        // Switch target promptly if current enemy stays hidden behind cover > 1.0s
        if (!this.lockedTargetVisible && this.outOfLosSinceMs > 0 && ctx.nowMs - this.outOfLosSinceMs > 1000) {
          this.decisionCooldown = 0;
        }

        const preferHeadshot =
          activeWeapon?.definition.type === 'SNIPER' ||
          dist < 38 ||
          bot.difficulty === 'pro' ||
          bot.difficulty === 'veteran';

        BotAimbot.computeLeadTrajectory(
          bot,
          liveTarget,
          activeWeapon?.definition.bulletSpeed ?? 210,
          preferHeadshot,
          this.aimSolution,
        );

        aimYaw = this.aimSolution.valid ? this.aimSolution.aimYaw : Math.atan2(toX, toZ);
        combatAimLocked = true;

        const wasRecentlyHit = ctx.nowMs - bot.lastHitTimeMs < 950;
        if (!wantCrouch && this.nextRand() < bot.profile.crouchInFightChance * dt * 2.0) {
          this.crouchHoldTimer = 0.55 + this.nextRand() * 0.65;
          wantCrouch = true;
        }
        let tryJump = false;
        if (
          this.jumpCooldown <= 0 &&
          bot.isGrounded &&
          dist < 36 &&
          this.nextRand() <
            (wasRecentlyHit ? bot.profile.jumpInFightChance * 3.2 : bot.profile.jumpInFightChance * 1.8) *
              dt
        ) {
          tryJump = true;
          this.jumpCooldown = 2.1 + this.nextRand() * 1.2;
        }

        BotAimbot.computeCombatMovement(
          bot,
          activeWeapon?.definition.type ?? 'AR',
          dist,
          toX,
          toZ,
          this.lockedTargetVisible,
          bot.reloadTimer > 0,
          this.strafeSign,
          wasRecentlyHit,
          wantCrouch,
          tryJump,
          this.combatMove,
        );
        moveX = this.combatMove.moveX;
        moveZ = this.combatMove.moveZ;
        sprint = this.combatMove.sprint;
        wantCrouch = this.combatMove.wantCrouch;
        wantJump = this.combatMove.wantJump;

        // Automatic weapon reload, ammo-dry switching, and close-quarters bare-hand punch fallback
        let tryMeleeFallback = !activeWeapon;
        if (activeWeapon) {
          if (activeWeapon.ammoInMagazine <= 0) {
            if (bot.ammoPool[activeWeapon.definition.type] > 0) {
              bot.beginReload();
            } else {
              const altSlot: 0 | 1 = bot.activeSlotIndex === 0 ? 1 : 0;
              const alt = bot.weapons[altSlot];
              if (alt && (alt.ammoInMagazine > 0 || bot.ammoPool[alt.definition.type] > 0)) {
                bot.switchWeaponSlot(altSlot);
                if (alt.ammoInMagazine <= 0) {
                  bot.beginReload();
                }
              } else {
                tryMeleeFallback = true;
              }
            }
          } else if (
            !this.lockedTargetVisible &&
            activeWeapon.ammoInMagazine < Math.ceil(activeWeapon.definition.magazineSize * 0.35) &&
            bot.ammoPool[activeWeapon.definition.type] > 0 &&
            bot.reloadTimer <= 0
          ) {
            bot.beginReload();
          } else if (bot.reloadTimer <= 0 && this.lockedTargetVisible && this.aimSolution.valid) {
            this.reactionDelayTimer = Math.max(0, this.reactionDelayTimer - dt);
            if (this.reactionDelayTimer <= 0) {
              this.stepAimbotFire(
                bot,
                liveTarget,
                activeWeapon.definition.range,
                preferHeadshot,
                ctx,
              );
            }
          }
        }

        if (tryMeleeFallback) {
          if (dist <= 6.5) {
            moveX = toX;
            moveZ = toZ;
            sprint = dist > 2.2;
            wantCrouch = false;
            aimYaw = Math.atan2(toX, toZ);
            if (dist <= 2.25 && bot.meleeCooldown <= 0) {
              bot.getEyePosition(_eyeA);
              _eyeB.set(liveTarget.x, liveTarget.y + (liveTarget.isCrouching ? 1.15 : 1.48), liveTarget.z);
              if (ctx.hitDetection.hasLineOfSight(_eyeA, _eyeB, 2.6)) {
                bot.meleeCooldown = 0.5;
                bot.animController.triggerAction(bot.nextPunchHand, 0.3);
                bot.nextPunchHand = bot.nextPunchHand === 'PunchLeft' ? 'PunchRight' : 'PunchLeft';
                ctx.onMeleeRequest?.({
                  attacker: bot,
                  target: liveTarget,
                  dirX: toX,
                  dirZ: toZ,
                  isHeadshot: this.nextRand() < 0.22,
                });
              }
            }
          } else {
            // Out of all ammo and enemy is far: break fight to seek weapons/ammo
            this.targetEnemyId = null;
            bot.behaviorState = 'loot';
          }
        }
      }
    } else {
      // Navigation: rotate-zone, loot, or explore-building
      const dest = this.getCurrentDestination(bot, ctx);
      if (dest) {
        const dx = dest.x - bot.position.x;
        const dz = dest.z - bot.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.7) {
          let dirX = dx / dist;
          let dirZ = dz / dist;

          if (this.detourTimer > 0) {
            const cosA = Math.cos(this.detourAngleOffset);
            const sinA = Math.sin(this.detourAngleOffset);
            const rx = dirX * cosA - dirZ * sinA;
            const rz = dirX * sinA + dirZ * cosA;
            dirX = rx;
            dirZ = rz;
          }

          moveX = dirX;
          moveZ = dirZ;
          sprint =
            bot.behaviorState === 'rotate-zone' ||
            dist > 14 ||
            bot.personality === 'rusher';
          aimYaw = Math.atan2(dirX, dirZ);

          // Reload weapon cleanly while rotating or moving between buildings
          const aw = bot.getActiveWeapon();
          if (
            aw &&
            aw.ammoInMagazine < Math.ceil(aw.definition.magazineSize * 0.45) &&
            bot.ammoPool[aw.definition.type] > 0 &&
            bot.reloadTimer <= 0
          ) {
            bot.beginReload();
          }
        } else {
          this.onReachedWaypoint(bot, ctx);
        }
      }
    }

    // Stuck recovery & obstacle vaulting
    if (moveX * moveX + moveZ * moveZ > 0.0225) {
      this.stuckCheckTimer += dt;
      if (this.stuckCheckTimer >= 0.48) {
        const moved = Math.hypot(
          bot.position.x - this.lastCheckX,
          bot.position.z - this.lastCheckZ,
        );
        this.lastCheckX = bot.position.x;
        this.lastCheckZ = bot.position.z;
        this.stuckCheckTimer = 0;

        if (moved < 0.32) {
          if (this.jumpCooldown <= 0 && bot.isGrounded) {
            wantJump = true;
            this.jumpCooldown = 1.3;
          }
          this.detourTimer = 0.95;
          this.detourAngleOffset =
            (this.nextRand() > 0.5 ? 1 : -1) * (0.85 + this.nextRand() * 0.65);
        }
      }
    } else {
      this.stuckCheckTimer = 0;
      this.lastCheckX = bot.position.x;
      this.lastCheckZ = bot.position.z;
    }

    let useDetailedFootProbes = true;
    if (ctx.viewerX !== undefined && ctx.viewerZ !== undefined) {
      const vx = bot.position.x - ctx.viewerX;
      const vz = bot.position.z - ctx.viewerZ;
      useDetailedFootProbes = vx * vx + vz * vz <= 48 * 48;
    }

    bot.stepGroundPhysics(
      dt,
      moveX,
      moveZ,
      sprint,
      wantJump,
      wantCrouch,
      aimYaw,
      ctx.mapManager,
      combatAimLocked,
      useDetailedFootProbes,
    );
  }

  private think(bot: BotEntity, ctx: BrainUpdateContext): void {
    const zone = ctx.zone;
    const distToSafeCenter = Math.hypot(
      bot.position.x - zone.currentCenterX,
      bot.position.z - zone.currentCenterZ,
    );
    const outsideSafe = distToSafeCenter > Math.max(12, zone.currentRadius - 10);
    const nearEdge = distToSafeCenter > Math.max(18, zone.currentRadius - 24);

    // 1. Evaluate & lock onto best valid enemy via AI Aimbot (player + other bots)
    const bestTarget = BotAimbot.selectBestTarget(
      bot,
      ctx.combatants,
      ctx.combatantById,
      this.targetEnemyId,
      this.targetLastSeenMs,
      ctx.nowMs,
      ctx.hitDetection,
      ctx.losBudget,
      this.visOut,
    );

    const hasWeaponWithAmmo = Boolean(
      (bot.weapons[0] &&
        (bot.weapons[0].ammoInMagazine > 0 || bot.ammoPool[bot.weapons[0].definition.type] > 0)) ||
        (bot.weapons[1] &&
          (bot.weapons[1].ammoInMagazine > 0 || bot.ammoPool[bot.weapons[1].definition.type] > 0)),
    );

    if (bestTarget) {
      if (this.targetEnemyId !== bestTarget.id) {
        this.targetEnemyId = bestTarget.id;
        this.reactionDelayTimer = bot.profile.reactionSec * 0.45;
        this.lastTargetLosMs = ctx.nowMs;
        this.outOfLosSinceMs = 0;
      }
      this.lockedTargetVisible = this.visOut.currentVisible;
      this.targetLastSeenX = bestTarget.x;
      this.targetLastSeenZ = bestTarget.z;
      if (this.visOut.currentVisible) {
        this.targetLastSeenMs = ctx.nowMs;
      }
    } else if (ctx.nowMs - this.targetLastSeenMs > 3400) {
      this.targetEnemyId = null;
      this.lockedTargetVisible = false;
    }

    // 2. Survival & Healing check when injured
    const hasHeals =
      bot.medkits > 0 || bot.bandages > 0 || bot.shieldBatteries > 0 || bot.shieldCells > 0;
    const isInjured =
      bot.health < bot.profile.healThresholdHp || (bot.health < 82 && bot.shield < 18);

    if (
      bot.pendingHealKind ||
      (isInjured && hasHeals && !outsideSafe && (!bestTarget || bot.health < 44))
    ) {
      if (!bot.pendingHealKind) {
        // Pick a brief perpendicular/backwards cover retreat direction away from threat
        if (this.targetEnemyId) {
          const ax = bot.position.x - this.targetLastSeenX;
          const az = bot.position.z - this.targetLastSeenZ;
          const al = Math.max(0.1, Math.hypot(ax, az));
          const side = this.strafeSign * 0.65;
          const rx = ax / al + (-az / al) * side;
          const rz = az / al + (ax / al) * side;
          const rl = Math.max(0.1, Math.hypot(rx, rz));
          this.coverDirX = rx / rl;
          this.coverDirZ = rz / rl;
          this.coverRetreatTimer = 1.1;
        }
        bot.startHealing();
      }
      bot.behaviorState = 'heal';
      return;
    }

    // If unarmed & threatened: engage with bare-hand rush if close, otherwise flee to seek loot
    if (!hasWeaponWithAmmo && bestTarget) {
      const distToThreat = Math.hypot(
        bestTarget.x - bot.position.x,
        bestTarget.z - bot.position.z,
      );
      if (distToThreat <= 5.5) {
        bot.behaviorState = 'combat';
        return;
      }
      const ax = bot.position.x - bestTarget.x;
      const az = bot.position.z - bestTarget.z;
      const al = Math.max(0.1, Math.hypot(ax, az));
      this.coverDirX = ax / al;
      this.coverDirZ = az / al;
      this.coverRetreatTimer = 1.4;
      bot.behaviorState = 'take-cover';
      return;
    }

    // 3. Storm priority: rotate inside safe zone unless currently locked in a close fight
    if (outsideSafe && (!bestTarget || distToSafeCenter > zone.currentRadius + 18)) {
      bot.behaviorState = 'rotate-zone';
      this.targetLootId = null;
      return;
    }

    // 4. Active Combat engagement
    if (this.targetEnemyId && hasWeaponWithAmmo) {
      bot.behaviorState = 'combat';
      return;
    }

    if (nearEdge && zone.isShrinking) {
      bot.behaviorState = 'rotate-zone';
      return;
    }

    // 5. Loot & Building Exploration
    const scanRadius = bot.personality === 'loot-master' || !hasWeaponWithAmmo ? 34 : 24;
    ctx.lootManager.getLootItemsInRadius(bot.position.x, bot.position.z, scanRadius, _scratchLoot);

    let bestLoot: LootItem | null = null;
    let bestLootScore = 0;
    for (let i = 0; i < _scratchLoot.length; i++) {
      const item = _scratchLoot[i];
      if (Math.abs(item.root.position.y - bot.position.y) > 4.2) continue;
      const desirability = bot.scoreLootDesirability(item);
      if (desirability <= 0) continue;

      const d = Math.hypot(
        item.root.position.x - bot.position.x,
        item.root.position.z - bot.position.z,
      );
      const s = desirability - d * 1.15;
      if (s > bestLootScore) {
        bestLootScore = s;
        bestLoot = item;
      }
    }

    if (bestLoot) {
      this.targetLootId = bestLoot.instanceId;
      this.lootSearchWaypoint = {
        x: bestLoot.root.position.x,
        y: bestLoot.root.position.y,
        z: bestLoot.root.position.z,
      };
      bot.behaviorState = 'loot';
      return;
    }

    this.targetLootId = null;
    this.ensureBuildingWaypoint(bot, ctx);
    bot.behaviorState = 'explore-building';
  }

  private getCurrentDestination(
    bot: BotEntity,
    ctx: BrainUpdateContext,
  ): { x: number; z: number } | null {
    if (bot.behaviorState === 'rotate-zone') {
      const tx = ctx.zone.targetRadius > 5 ? ctx.zone.targetCenterX : ctx.zone.currentCenterX;
      const tz = ctx.zone.targetRadius > 5 ? ctx.zone.targetCenterZ : ctx.zone.currentCenterZ;
      return { x: tx, z: tz };
    }

    if (this.lootSearchWaypoint) {
      return this.lootSearchWaypoint;
    }

    this.ensureBuildingWaypoint(bot, ctx);
    return this.lootSearchWaypoint;
  }

  private ensureBuildingWaypoint(bot: BotEntity, ctx: BrainUpdateContext): void {
    if (this.lootSearchWaypoint) return;

    const waypoints = ctx.waypoints;
    if (waypoints.length === 0) {
      const ang = this.nextRand() * Math.PI * 2;
      const rad = 25 + this.nextRand() * Math.max(30, ctx.zone.currentRadius * 0.65);
      this.lootSearchWaypoint = {
        x: ctx.zone.currentCenterX + Math.cos(ang) * rad,
        z: ctx.zone.currentCenterZ + Math.sin(ang) * rad,
      };
      return;
    }

    // Pick a building/POI cluster inside or near the safe zone that hasn't been visited yet
    let bestWp: BuildingPoiWaypoint | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (this.visitedBuildingIds.has(wp.id)) continue;
      const distFromSafe = Math.hypot(
        wp.x - ctx.zone.currentCenterX,
        wp.z - ctx.zone.currentCenterZ,
      );
      if (distFromSafe > Math.max(30, ctx.zone.currentRadius * 0.92)) continue;

      const dist = Math.hypot(wp.x - bot.position.x, wp.z - bot.position.z);
      let s = 180 - dist * 0.45 + (wp.isInterior ? 26 : 0) + this.nextRand() * 48;
      if (bot.personality === 'loot-master' && wp.isInterior) s += 30;
      if (s > bestScore) {
        bestScore = s;
        bestWp = wp;
      }
    }

    if (!bestWp) {
      this.visitedBuildingIds.clear();
      bestWp = waypoints[Math.floor(this.nextRand() * waypoints.length)];
    }

    this.activeBuildingId = bestWp.id;
    this.roomExploreIndex = 0;
    const pt = bestWp.roomPoints[0] ?? bestWp;
    this.lootSearchWaypoint = { x: pt.x, z: pt.z };
  }

  private onReachedWaypoint(bot: BotEntity, ctx: BrainUpdateContext): void {
    if (this.targetLootId) {
      this.targetLootId = null;
      this.lootSearchWaypoint = null;
      return;
    }

    if (this.activeBuildingId) {
      const wp = ctx.waypointById.get(this.activeBuildingId);
      if (wp && this.roomExploreIndex + 1 < wp.roomPoints.length && this.roomExploreIndex < 3) {
        this.roomExploreIndex++;
        const nextRoom = wp.roomPoints[this.roomExploreIndex];
        this.lootSearchWaypoint = { x: nextRoom.x, z: nextRoom.z, y: nextRoom.y };
        return;
      }
      this.visitedBuildingIds.add(this.activeBuildingId);
      this.activeBuildingId = null;
    }

    this.lootSearchWaypoint = null;
    if (bot.behaviorState === 'explore-building') {
      this.ensureBuildingWaypoint(bot, ctx);
    }
  }

  private tryCollectNearbyLoot(bot: BotEntity, lootManager: LootManager): void {
    lootManager.getLootItemsInRadius(bot.position.x, bot.position.z, 2.75, _scratchLoot);
    for (let i = 0; i < _scratchLoot.length; i++) {
      const item = _scratchLoot[i];
      if (Math.abs(item.root.position.y - bot.position.y) > 1.75) continue;
      if (bot.scoreLootDesirability(item) > 0) {
        if (bot.collectLootItem(item)) {
          lootManager.collectNode(item.instanceId, bot.id);
          if (item.instanceId === this.targetLootId) {
            this.targetLootId = null;
            this.lootSearchWaypoint = null;
          }
          break;
        }
      }
    }
  }

  private stepAimbotFire(
    bot: BotEntity,
    target: CombatantTargetInfo,
    weaponRange: number,
    isHeadshotTarget: boolean,
    ctx: BrainUpdateContext,
  ): void {
    const slot = bot.getActiveWeapon();
    if (!slot || slot.ammoInMagazine <= 0) return;

    const sol = this.aimSolution;
    if (!sol.valid || sol.distance > weaponRange * 1.04 || sol.distance < 0.25) return;

    const dt = ctx.delta;
    if (this.burstPauseTimer > 0) {
      this.burstPauseTimer = Math.max(0, this.burstPauseTimer - dt);
      return;
    }

    // Continuous fire inside 48m or single-shot/bolt weapons; crisp controlled bursts at extreme range
    if (sol.distance > 48 && slot.definition.automatic) {
      if (this.burstTimer <= 0) {
        this.burstTimer =
          bot.profile.burstLengthMin +
          this.nextRand() * (bot.profile.burstLengthMax - bot.profile.burstLengthMin);
      }
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstPauseTimer = bot.profile.burstPauseSec * 0.55;
      }
    }

    if (slot.fireCooldown > 0) return;

    // Consume round and trigger cooldown
    slot.ammoInMagazine--;
    slot.fireCooldown = 60 / Math.max(1, slot.definition.fireRate);
    if (slot.definition.boltAction) {
      slot.fireCooldown = Math.max(slot.fireCooldown, 1.35);
    }
    bot.recentShotUntilMs = ctx.nowMs + 3400;
    bot.animController.triggerAction('Shoot', 0.14);

    // Immediately trigger reload when last round in magazine is fired
    if (slot.ammoInMagazine <= 0 && bot.ammoPool[slot.definition.type] > 0) {
      bot.beginReload();
    }

    bot.getEyePosition(_eyeA);

    // Apply realistic difficulty + weapon + movement spread cone using aimJitterDeg
    const horizSpeed = Math.hypot(bot.velocity.x, bot.velocity.z);
    const totalSpreadDeg = Math.min(
      9.5,
      bot.profile.aimJitterDeg +
        slot.definition.spread.adsSpreadDeg +
        (horizSpeed > 0.5 ? slot.definition.spread.moveSpreadDeg * 0.45 : 0),
    );
    const maxSpreadRad = totalSpreadDeg * (Math.PI / 180);
    const angle = this.nextRand() * Math.PI * 2;
    const radial = Math.sqrt(this.nextRand()) * Math.tan(maxSpreadRad);

    let rx = -sol.dirZ;
    let rz = sol.dirX;
    const rLen = Math.hypot(rx, rz);
    if (rLen < 0.0001) {
      rx = 1;
      rz = 0;
    } else {
      rx /= rLen;
      rz /= rLen;
    }
    // right = (rx, 0, rz), up = right x dir
    const ux = -rz * sol.dirY;
    const uy = rz * sol.dirX - rx * sol.dirZ;
    const uz = rx * sol.dirY;

    const ox = Math.cos(angle) * radial;
    const oy = Math.sin(angle) * radial;
    let fdx = sol.dirX + rx * ox + ux * oy;
    let fdy = sol.dirY + uy * oy;
    let fdz = sol.dirZ + rz * ox + uz * oy;
    const fLen = Math.max(0.0001, Math.hypot(fdx, fdy, fdz));
    fdx /= fLen;
    fdy /= fLen;
    fdz /= fLen;

    ctx.onFireRequest({
      shooter: bot,
      originX: _eyeA.x,
      originY: _eyeA.y,
      originZ: _eyeA.z,
      dirX: fdx,
      dirY: fdy,
      dirZ: fdz,
      aimX: sol.targetX,
      aimY: sol.targetY,
      aimZ: sol.targetZ,
      leadTimeSec: sol.leadTimeSec,
      isAimbotHeadshot: isHeadshotTarget,
      target,
    });
  }
}
