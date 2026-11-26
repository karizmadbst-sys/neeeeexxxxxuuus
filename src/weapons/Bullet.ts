import * as THREE from 'three';
import type { AbilityModifiers } from '../characters/CharacterAbility';
import type { QualityPreset, Subsystem } from '../core/Types';
import { DamageSystem, type DamageCalculationResult } from './DamageSystem';
import type { HitDetection, HitSegmentResult } from './HitDetection';
import type { WeaponDefinition } from './WeaponData';

export interface BulletHitNotification {
  targetName: string;
  damageResult: DamageCalculationResult;
  distance: number;
  weaponName: string;
  targetId?: string;
  hx?: number;
  hy?: number;
  hz?: number;
}

export interface RemoteHitClaim {
  targetId: string;
  targetName: string;
  weaponId: string;
  weaponName: string;
  isHeadshot: boolean;
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  hx: number;
  hy: number;
  hz: number;
  distance: number;
  previewDamage: DamageCalculationResult;
}

interface BulletSlot {
  active: boolean;
  origin: THREE.Vector3;
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  distanceTraveled: number;
  maxDistance: number;
  weapon: WeaponDefinition | null;
  attackerModifiers?: Readonly<Partial<AbilityModifiers>>;
}

interface ShellSlot {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
  age: number;
  maxAge: number;
}

interface SparkSlot {
  active: boolean;
  position: THREE.Vector3;
  age: number;
  maxAge: number;
  isCritical: boolean;
}

const MAX_BULLETS = 96;
const MAX_SHELLS = 64;
const MAX_SPARKS = 48;

export class BulletSystem implements Subsystem {
  readonly root = new THREE.Group();

  private readonly bullets: BulletSlot[] = [];
  private readonly shells: ShellSlot[] = [];
  private readonly sparks: SparkSlot[] = [];

  private readonly bulletMesh: THREE.InstancedMesh;
  private readonly shellMesh: THREE.InstancedMesh;
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly muzzleFlashMesh: THREE.Mesh;

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private muzzleFlashTimer = 0;
  private enableShellCasings = true;
  private maxActiveShells = MAX_SHELLS;
  private maxActiveSparks = MAX_SPARKS;
  private enableMuzzleFlash = true;

  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3(1, 1, 1);
  private readonly scratchForward = new THREE.Vector3(0, 0, 1);
  private readonly scratchDir = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();
  private readonly hitOut: HitSegmentResult = {
    hit: false,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    distance: 0,
    target: null,
    isHeadshot: false,
  };

  private onHitCallback?: (notification: BulletHitNotification) => void;
  private onRemoteHitClaimCallback?: (claim: RemoteHitClaim) => boolean;

  constructor() {
    // 1. Pooled tracer bullets
    const tracerGeo = new THREE.BoxGeometry(0.036, 0.036, 0.72);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
    });
    this.bulletMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, MAX_BULLETS);
    this.bulletMesh.frustumCulled = false;
    this.bulletMesh.count = 0;

    // 2. Pooled ejected brass shell casings
    const shellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.044, 6);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.9,
    });
    this.shellMesh = new THREE.InstancedMesh(shellGeo, shellMat, MAX_SHELLS);
    this.shellMesh.frustumCulled = false;
    this.shellMesh.count = 0;

    // 3. Pooled impact sparks
    const sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;

    // 4. Muzzle flash star mesh
    const flashGeo = new THREE.OctahedronGeometry(0.16, 0);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfdba74,
    });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.visible = false;

    this.ownedGeometries.push(tracerGeo, shellGeo, sparkGeo, flashGeo);
    this.ownedMaterials.push(tracerMat, shellMat, sparkMat, flashMat);

    this.root.add(this.bulletMesh, this.shellMesh, this.sparkMesh, this.muzzleFlashMesh);

    for (let i = 0; i < MAX_BULLETS; i++) {
      this.bullets.push({
        active: false,
        origin: new THREE.Vector3(),
        position: new THREE.Vector3(),
        prevPosition: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        distanceTraveled: 0,
        maxDistance: 100,
        weapon: null,
      });
    }

    for (let i = 0; i < MAX_SHELLS; i++) {
      this.shells.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        spin: new THREE.Vector3(),
        age: 0,
        maxAge: 0.85,
      });
    }

    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparks.push({
        active: false,
        position: new THREE.Vector3(),
        age: 0,
        maxAge: 0.16,
        isCritical: false,
      });
    }
  }

  setOnHitCallback(cb: (notification: BulletHitNotification) => void): void {
    this.onHitCallback = cb;
  }

  setOnRemoteHitClaimCallback(cb?: (claim: RemoteHitClaim) => boolean): void {
    this.onRemoteHitClaimCallback = cb;
  }

  notifyHit(notification: BulletHitNotification): void {
    this.onHitCallback?.(notification);
  }

  dispatchRemoteHitClaim(claim: RemoteHitClaim): boolean {
    return this.onRemoteHitClaimCallback?.(claim) ?? false;
  }

  spawnImpactSparkPublic(point: THREE.Vector3, isCritical: boolean): void {
    this.spawnImpactSpark(point, isCritical);
  }

  setQualityPreset(quality: QualityPreset): void {
    if (quality === 'low') {
      this.enableShellCasings = false;
      this.enableMuzzleFlash = false;
      this.maxActiveShells = 0;
      this.maxActiveSparks = 16;
      this.shellMesh.visible = false;
      this.shellMesh.count = 0;
      this.muzzleFlashMesh.visible = false;
      for (let i = 0; i < MAX_SHELLS; i++) {
        this.shells[i].active = false;
      }
    } else if (quality === 'medium') {
      this.enableShellCasings = true;
      this.enableMuzzleFlash = true;
      this.maxActiveShells = 32;
      this.maxActiveSparks = 32;
      this.shellMesh.visible = true;
    } else {
      this.enableShellCasings = true;
      this.enableMuzzleFlash = true;
      this.maxActiveShells = MAX_SHELLS;
      this.maxActiveSparks = MAX_SPARKS;
      this.shellMesh.visible = true;
    }
  }

  spawnBullet(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    weapon: WeaponDefinition,
    attackerModifiers?: Readonly<Partial<AbilityModifiers>>,
  ): void {
    for (let i = 0; i < MAX_BULLETS; i++) {
      const slot = this.bullets[i];
      if (!slot.active) {
        slot.active = true;
        slot.origin.copy(origin);
        slot.position.copy(origin);
        slot.prevPosition.copy(origin);
        slot.velocity.copy(direction).normalize().multiplyScalar(weapon.bulletSpeed);
        slot.distanceTraveled = 0;
        slot.maxDistance = weapon.range * 1.15;
        slot.weapon = weapon;
        slot.attackerModifiers = attackerModifiers;
        return;
      }
    }
  }

  triggerMuzzleFlash(worldPos: THREE.Vector3, scale = 1.0): void {
    if (!this.enableMuzzleFlash) return;
    this.muzzleFlashMesh.position.copy(worldPos);
    this.muzzleFlashMesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    this.muzzleFlashMesh.scale.set(scale, scale, scale * 1.5);
    this.muzzleFlashMesh.visible = true;
    this.muzzleFlashTimer = 0.045;
  }

  spawnShellCasing(worldPos: THREE.Vector3, ejectDir: THREE.Vector3): void {
    if (!this.enableShellCasings || this.maxActiveShells <= 0) return;
    for (let i = 0; i < this.maxActiveShells; i++) {
      const s = this.shells[i];
      if (!s.active) {
        s.active = true;
        s.position.copy(worldPos);
        s.velocity
          .copy(ejectDir)
          .normalize()
          .multiplyScalar(2.4 + Math.random() * 1.1);
        s.velocity.y += 1.9 + Math.random() * 0.7;
        s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        s.spin.set(14 + Math.random() * 10, 12 + Math.random() * 10, 16);
        s.age = 0;
        s.maxAge = 0.85;
        return;
      }
    }
  }

  private spawnImpactSpark(point: THREE.Vector3, isCritical: boolean): void {
    for (let i = 0; i < this.maxActiveSparks; i++) {
      const sp = this.sparks[i];
      if (!sp.active) {
        sp.active = true;
        sp.position.copy(point);
        sp.age = 0;
        sp.maxAge = isCritical ? 0.22 : 0.14;
        sp.isCritical = isCritical;
        return;
      }
    }
  }

  spawnShatterBurst(x: number, y: number, z: number): void {
    let spawned = 0;
    for (let i = 0; i < this.maxActiveSparks && spawned < 6; i++) {
      const sp = this.sparks[i];
      if (!sp.active) {
        sp.active = true;
        sp.position.set(
          x + (Math.random() - 0.5) * 0.72,
          y + (Math.random() - 0.5) * 0.58,
          z + (Math.random() - 0.5) * 0.72,
        );
        sp.age = 0;
        sp.maxAge = 0.28 + Math.random() * 0.1;
        sp.isCritical = false;
        spawned++;
      }
    }
  }

  update(deltaSeconds: number, hitDetection: HitDetection): void {
    // Muzzle flash lifetime
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaSeconds;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashMesh.visible = false;
      }
    }

    // 1. Advance active bullets and check swept collisions
    let activeBulletCount = 0;
    for (let i = 0; i < MAX_BULLETS; i++) {
      const b = this.bullets[i];
      if (!b.active || !b.weapon) continue;

      b.prevPosition.copy(b.position);
      b.position.addScaledVector(b.velocity, deltaSeconds);
      const stepDist = b.prevPosition.distanceTo(b.position);
      b.distanceTraveled += stepDist;

      const hit = hitDetection.raycastSegment(b.prevPosition, b.position, this.hitOut);
      if (hit.hit) {
        b.active = false;
        this.spawnImpactSpark(hit.point, hit.isHeadshot);

        if (hit.target && !hit.target.isAlly) {
          const totalDist = b.origin.distanceTo(hit.point);
          const damageResult = DamageSystem.computeDamage({
            weapon: b.weapon,
            distance: totalDist,
            isHeadshot: hit.isHeadshot,
            attackerModifiers: b.attackerModifiers,
            targetShield: hit.target.shield,
            targetDamageReductionPct: hit.target.damageReductionPct,
          });
          this.scratchDir.copy(b.velocity).normalize();
          const intercepted =
            this.onRemoteHitClaimCallback?.({
              targetId: hit.target.id,
              targetName: hit.target.name,
              weaponId: b.weapon.id,
              weaponName: b.weapon.name,
              isHeadshot: hit.isHeadshot,
              ox: b.origin.x,
              oy: b.origin.y,
              oz: b.origin.z,
              dx: this.scratchDir.x,
              dy: this.scratchDir.y,
              dz: this.scratchDir.z,
              hx: hit.point.x,
              hy: hit.point.y,
              hz: hit.point.z,
              distance: totalDist,
              previewDamage: damageResult,
            }) ?? false;

          if (!intercepted) {
            hit.target.applyHitDamage(damageResult);
            this.onHitCallback?.({
              targetName: hit.target.name,
              damageResult,
              distance: totalDist,
              weaponName: b.weapon.name,
              targetId: hit.target.id,
              hx: hit.point.x,
              hy: hit.point.y,
              hz: hit.point.z,
            });
          }
        }
        continue;
      }

      if (b.distanceTraveled >= b.maxDistance) {
        b.active = false;
        continue;
      }

      this.scratchDir.copy(b.velocity).normalize();
      this.scratchQuat.setFromUnitVectors(this.scratchForward, this.scratchDir);
      this.scratchScale.set(1, 1, 1);
      this.scratchMatrix.compose(b.position, this.scratchQuat, this.scratchScale);
      this.bulletMesh.setMatrixAt(activeBulletCount, this.scratchMatrix);
      activeBulletCount++;
    }
    this.bulletMesh.count = activeBulletCount;
    if (activeBulletCount > 0) {
      this.bulletMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Advance ejected shell casings
    let activeShellCount = 0;
    for (let i = 0; i < MAX_SHELLS; i++) {
      const s = this.shells[i];
      if (!s.active) continue;
      s.age += deltaSeconds;
      if (s.age >= s.maxAge) {
        s.active = false;
        continue;
      }
      s.velocity.y -= 14 * deltaSeconds;
      s.position.addScaledVector(s.velocity, deltaSeconds);
      if (s.position.y < 0.05) {
        s.position.y = 0.05;
        s.velocity.y *= -0.35;
        s.velocity.x *= 0.6;
        s.velocity.z *= 0.6;
      }
      s.rotation.x += s.spin.x * deltaSeconds;
      s.rotation.y += s.spin.y * deltaSeconds;
      s.rotation.z += s.spin.z * deltaSeconds;
      this.scratchQuat.setFromEuler(s.rotation);
      this.scratchScale.set(1, 1, 1);
      this.scratchMatrix.compose(s.position, this.scratchQuat, this.scratchScale);
      this.shellMesh.setMatrixAt(activeShellCount, this.scratchMatrix);
      activeShellCount++;
    }
    this.shellMesh.count = activeShellCount;
    if (activeShellCount > 0) {
      this.shellMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Advance impact sparks
    let activeSparkCount = 0;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const sp = this.sparks[i];
      if (!sp.active) continue;
      sp.age += deltaSeconds;
      if (sp.age >= sp.maxAge) {
        sp.active = false;
        continue;
      }
      const fade = 1 - sp.age / sp.maxAge;
      const scaleVal = (sp.isCritical ? 1.8 : 1.0) * fade;
      this.scratchQuat.identity();
      this.scratchScale.setScalar(scaleVal);
      this.scratchMatrix.compose(sp.position, this.scratchQuat, this.scratchScale);
      this.sparkMesh.setMatrixAt(activeSparkCount, this.scratchMatrix);
      this.scratchColor.setHex(sp.isCritical ? 0xf97316 : 0xfde047);
      this.sparkMesh.setColorAt(activeSparkCount, this.scratchColor);
      activeSparkCount++;
    }
    this.sparkMesh.count = activeSparkCount;
    if (activeSparkCount > 0) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      if (this.sparkMesh.instanceColor) {
        this.sparkMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  clearAll(): void {
    for (const b of this.bullets) b.active = false;
    for (const s of this.shells) s.active = false;
    for (const sp of this.sparks) sp.active = false;
    this.bulletMesh.count = 0;
    this.shellMesh.count = 0;
    this.sparkMesh.count = 0;
    this.muzzleFlashMesh.visible = false;
    this.muzzleFlashTimer = 0;
  }

  dispose(): void {
    for (const geo of this.ownedGeometries) geo.dispose();
    this.ownedGeometries.length = 0;
    for (const mat of this.ownedMaterials) mat.dispose();
    this.ownedMaterials.length = 0;
  }
}
