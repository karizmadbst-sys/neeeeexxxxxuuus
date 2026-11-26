import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { AbilityModifiers } from '../characters/CharacterAbility';
import type { Player } from '../player/Player';
import type { BulletSystem } from './Bullet';
import { DamageSystem } from './DamageSystem';
import type { DamageableTarget, HitDetection, HitSegmentResult } from './HitDetection';
import type { WeaponDefinition } from './IWeaponSystem';

export const FISTS_WEAPON_DEF: WeaponDefinition = {
  id: 'fists',
  name: 'FISTS',
  type: 'MELEE',
  damage: 24,
  headshotDamage: 38,
  range: 2.55,
  fireRate: 165,
  magazineSize: 0,
  reloadTime: 0,
  recoil: {
    verticalKickDeg: 0,
    horizontalKickDeg: 0,
    adsMultiplier: 1,
    recoverySpeed: 12,
    visualKickback: 0,
  },
  spread: {
    hipSpreadDeg: 0,
    adsSpreadDeg: 0,
    moveSpreadDeg: 0,
    bloomPerShotDeg: 0,
    maxBloomDeg: 0,
    bloomDecayPerSec: 10,
  },
  bulletSpeed: 60,
  accuracy: 100,
  criticalMultiplier: 1.58,
  sound: {
    id: 'sfx_fists',
    pitchHz: 140,
    endPitchHz: 60,
    punchGain: 0.16,
    noiseHz: 900,
    decaySec: 0.08,
  },
  model: {
    placeholderId: 'fists',
    primaryColorHex: '#94a3b8',
    accentColorHex: '#f97316',
    bodyLength: 0.2,
    barrelLength: 0.1,
    hasStock: false,
    magazineStyle: 'straight',
  },
  pellets: 1,
  startingReserveAmmo: 0,
  automatic: true,
  aimAssistEnabled: false,
  falloff: {
    closeRange: 3.0,
    mediumRange: 4.0,
    mediumDamageRatio: 1.0,
    longDamageRatio: 1.0,
  },
};

const PUNCH_COOLDOWN_SEC = 0.36;
const PUNCH_ANIM_SEC = 0.30;
const MELEE_RANGE = 2.55;

export class MeleeSystem {
  private cooldown = 0;
  private nextHand: 'PunchLeft' | 'PunchRight' = 'PunchLeft';

  private readonly playerCenter = new THREE.Vector3();
  private readonly rayStart = new THREE.Vector3();
  private readonly rayEnd = new THREE.Vector3();
  private readonly tempVec = new THREE.Vector3();
  private readonly targetBodyPos = new THREE.Vector3();
  private readonly targetHeadPos = new THREE.Vector3();
  private readonly impactPoint = new THREE.Vector3();
  private readonly hitOut: HitSegmentResult = {
    hit: false,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    distance: 0,
    target: null,
    isHeadshot: false,
  };

  private onMeleeTargetHitCallback?: (targetId: string, dirX: number, dirZ: number) => void;

  constructor(
    private readonly bulletSystem: BulletSystem,
    private readonly hitDetection: HitDetection,
    private readonly audioManager: AudioManager,
  ) {}

  setOnMeleeTargetHitCallback(cb?: (targetId: string, dirX: number, dirZ: number) => void): void {
    this.onMeleeTargetHitCallback = cb;
  }

  reset(): void {
    this.cooldown = 0;
    this.nextHand = 'PunchLeft';
  }

  update(deltaSeconds: number): void {
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - deltaSeconds);
    }
  }

  getCooldownRatio(): number {
    return PUNCH_COOLDOWN_SEC > 0 ? this.cooldown / PUNCH_COOLDOWN_SEC : 0;
  }

  tryPunch(params: {
    player: Player;
    aimRayOrigin: THREE.Vector3;
    aimRayDir: THREE.Vector3;
    triggerHeld: boolean;
    triggerJustPressed: boolean;
    modifiers: Readonly<Partial<AbilityModifiers>>;
    onShotFired?: (shot: {
      weaponId: string;
      ox: number;
      oy: number;
      oz: number;
      dx: number;
      dy: number;
      dz: number;
    }) => void;
  }): boolean {
    return this.tryMeleeAttack({
      ...params,
      weapon: FISTS_WEAPON_DEF,
    });
  }

  tryMeleeAttack(params: {
    weapon?: WeaponDefinition;
    player: Player;
    aimRayOrigin: THREE.Vector3;
    aimRayDir: THREE.Vector3;
    triggerHeld: boolean;
    triggerJustPressed: boolean;
    modifiers: Readonly<Partial<AbilityModifiers>>;
    onSwingStarted?: (durationSec: number) => void;
    onShotFired?: (shot: {
      weaponId: string;
      ox: number;
      oy: number;
      oz: number;
      dx: number;
      dy: number;
      dz: number;
    }) => void;
  }): boolean {
    const weaponDef = params.weapon ?? FISTS_WEAPON_DEF;
    const meleeKind = weaponDef.meleeKind ?? 'fists';
    const meleeRange = Math.max(MELEE_RANGE, weaponDef.range || MELEE_RANGE);
    const swingCooldown =
      meleeKind === 'fists'
        ? PUNCH_COOLDOWN_SEC
        : Math.max(0.28, 60 / Math.max(30, weaponDef.fireRate));
    const swingAnimSec = meleeKind === 'bat' ? 0.38 : PUNCH_ANIM_SEC;

    const { player, aimRayOrigin, aimRayDir, modifiers } = params;
    if (!player.isAlive || player.movement.isSitting || player.movement.isVaulting) {
      return false;
    }
    if (!params.triggerJustPressed && !params.triggerHeld) {
      return false;
    }
    if (this.cooldown > 0) {
      return false;
    }

    this.cooldown = swingCooldown;
    const anim =
      meleeKind === 'fists'
        ? this.nextHand
        : 'PunchRight';
    if (meleeKind === 'fists') {
      this.nextHand = anim === 'PunchLeft' ? 'PunchRight' : 'PunchLeft';
    }

    player.triggerActionAnimation(anim, swingAnimSec);
    params.onSwingStarted?.(swingAnimSec);
    this.audioManager.playMeleeSwing(meleeKind);

    const chestHeight = player.isProne ? 0.42 : player.isCrouching ? 1.02 : 1.38;
    this.playerCenter.set(player.position.x, player.position.y + chestHeight, player.position.z);
    params.onShotFired?.({
      weaponId: weaponDef.id,
      ox: this.playerCenter.x,
      oy: this.playerCenter.y,
      oz: this.playerCenter.z,
      dx: aimRayDir.x,
      dy: aimRayDir.y,
      dz: aimRayDir.z,
    });

    // 1. Primary center-ray check from slightly behind player chest plane forward to melee reach
    this.tempVec.copy(this.playerCenter).sub(aimRayOrigin);
    const playerPlaneDist = Math.max(0, this.tempVec.dot(aimRayDir));
    const rayStartDist = Math.max(0.1, playerPlaneDist - 0.14);
    this.rayStart.copy(aimRayOrigin).addScaledVector(aimRayDir, rayStartDist);
    this.rayEnd.copy(aimRayOrigin).addScaledVector(aimRayDir, playerPlaneDist + meleeRange + 0.18);

    const rayHit = this.hitDetection.raycastSegment(this.rayStart, this.rayEnd, this.hitOut);
    let matchedTarget: DamageableTarget | null = null;
    let isHeadshot = false;
    let hitDist = meleeRange;

    if (rayHit.hit && rayHit.target && !rayHit.target.isAlly) {
      matchedTarget = rayHit.target;
      isHeadshot = rayHit.isHeadshot;
      this.impactPoint.copy(rayHit.point);
      hitDist = Math.max(0.4, this.playerCenter.distanceTo(this.impactPoint));
    } else {
      // 2. Close-quarters melee cone sweep (blocks hits behind solid walls via LOS check)
      const targets = this.hitDetection.getTargets();
      let bestScore = Number.POSITIVE_INFINITY;
      const aimHorizX = aimRayDir.x;
      const aimHorizZ = aimRayDir.z;
      const aimHorizLen = Math.hypot(aimHorizX, aimHorizZ);
      const normHorizX = aimHorizLen > 0.001 ? aimHorizX / aimHorizLen : Math.sin(player.rotation.y);
      const normHorizZ = aimHorizLen > 0.001 ? aimHorizZ / aimHorizLen : Math.cos(player.rotation.y);

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.isAlive || t.isAlly || !t.bodyMesh.visible) continue;

        t.bodyMesh.updateWorldMatrix(true, false);
        t.headMesh.updateWorldMatrix(true, false);
        t.bodyMesh.getWorldPosition(this.targetBodyPos);
        t.headMesh.getWorldPosition(this.targetHeadPos);

        // Closest vertical height on target torso/head relative to player strike center
        const dx = this.targetBodyPos.x - this.playerCenter.x;
        const dz = this.targetBodyPos.z - this.playerCenter.z;
        const minY = Math.min(this.targetBodyPos.y, this.targetHeadPos.y) - 0.35;
        const maxY = Math.max(this.targetBodyPos.y, this.targetHeadPos.y) + 0.18;
        const closestY = Math.max(minY, Math.min(maxY, this.playerCenter.y));
        const dy = closestY - this.playerCenter.y;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > meleeRange || dist < 0.05) continue;

        const horizDist = Math.hypot(dx, dz);
        let dot = 1;
        if (horizDist > 0.15) {
          dot = (dx / horizDist) * normHorizX + (dz / horizDist) * normHorizZ;
        }
        if (dot < 0.64) continue;

        if (!this.hitDetection.hasLineOfSight(this.playerCenter, this.targetBodyPos, meleeRange + 0.25)) {
          continue;
        }

        const score = dist * (1.25 - dot * 0.35);
        if (score < bestScore) {
          bestScore = score;
          matchedTarget = t;
          hitDist = dist;

          // Headshot if camera aim ray points close to target head height/position
          this.tempVec.copy(this.targetHeadPos).sub(aimRayOrigin);
          const proj = Math.max(0, this.tempVec.dot(aimRayDir));
          const perpSq =
            this.targetHeadPos.distanceToSquared(
              this.rayEnd.copy(aimRayOrigin).addScaledVector(aimRayDir, proj),
            );
          isHeadshot = aimRayDir.y > -0.18 && perpSq <= 0.42 * 0.42;
          this.impactPoint.copy(isHeadshot ? this.targetHeadPos : this.targetBodyPos);
        }
      }
    }

    if (!matchedTarget) {
      // Wall / object strike feedback if the center ray hit world geometry within reach
      if (rayHit.hit && !rayHit.target) {
        this.bulletSystem.spawnImpactSparkPublic(rayHit.point, false);
      }
      return true;
    }

    const damageResult = DamageSystem.computeDamage({
      weapon: weaponDef,
      distance: hitDist,
      isHeadshot,
      attackerModifiers: modifiers,
      targetShield: matchedTarget.shield,
      targetDamageReductionPct: matchedTarget.damageReductionPct,
    });

    this.audioManager.playMeleeHit(meleeKind, isHeadshot);
    this.bulletSystem.spawnImpactSparkPublic(this.impactPoint, isHeadshot);

    const intercepted = this.bulletSystem.dispatchRemoteHitClaim({
      targetId: matchedTarget.id,
      targetName: matchedTarget.name,
      weaponId: weaponDef.id,
      weaponName: weaponDef.name,
      isHeadshot,
      ox: this.playerCenter.x,
      oy: this.playerCenter.y,
      oz: this.playerCenter.z,
      dx: aimRayDir.x,
      dy: aimRayDir.y,
      dz: aimRayDir.z,
      hx: this.impactPoint.x,
      hy: this.impactPoint.y,
      hz: this.impactPoint.z,
      distance: hitDist,
      previewDamage: damageResult,
    });

    if (!intercepted) {
      matchedTarget.applyHitDamage(damageResult);
      this.bulletSystem.notifyHit({
        targetName: matchedTarget.name,
        damageResult,
        distance: hitDist,
        weaponName: weaponDef.name,
        targetId: matchedTarget.id,
        hx: this.impactPoint.x,
        hy: this.impactPoint.y,
        hz: this.impactPoint.z,
      });
    }

    this.onMeleeTargetHitCallback?.(matchedTarget.id, aimRayDir.x, aimRayDir.z);
    return true;
  }
}
