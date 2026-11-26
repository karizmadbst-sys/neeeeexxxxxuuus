import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { AbilityModifiers } from '../characters/CharacterAbility';
import type { Player } from '../player/Player';
import { clamp } from '../utils/MathUtils';
import type { BulletSystem } from './Bullet';
import type { HitDetection } from './HitDetection';
import { MeleeSystem } from './MeleeSystem';
import { RecoilSystem, type RecoilKickOutput } from './RecoilSystem';
import { ReloadSystem } from './ReloadSystem';
import type { Weapon } from './Weapon';

const DEG_TO_RAD = Math.PI / 180;

export class WeaponController {
  readonly reloadSystem = new ReloadSystem();
  readonly recoilSystem = new RecoilSystem();
  readonly meleeSystem: MeleeSystem;

  private emptyClickCooldown = 0;
  private unlimitedAmmo = false;
  private reloadFinishedSoundPending = false;
  private reloadMidStagePlayed = false;
  private pendingBoltSoundTimer = -1;
  private pendingBoltEjectTimer = -1;
  private pendingBoltWeapon: Weapon | null = null;

  private readonly aimTargetPoint = new THREE.Vector3();
  private readonly playerCenter = new THREE.Vector3();
  private readonly tempVec = new THREE.Vector3();
  private readonly muzzleWorldPos = new THREE.Vector3();
  private readonly ejectWorldPos = new THREE.Vector3();
  private readonly ejectWorldDir = new THREE.Vector3();
  private readonly pendingEjectDir = new THREE.Vector3(1, 0.4, 0);
  private readonly baseShotDir = new THREE.Vector3();
  private readonly pelletDir = new THREE.Vector3();
  private readonly rightAxis = new THREE.Vector3();
  private readonly upAxis = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly recoilOut: RecoilKickOutput = { yawRad: 0, pitchRad: 0 };

  private readonly scopeShotOrigin = new THREE.Vector3();

  private onShotFiredCallback?: (shot: {
    weaponId: string;
    ox: number;
    oy: number;
    oz: number;
    dx: number;
    dy: number;
    dz: number;
  }) => void;

  constructor(
    private readonly bulletSystem: BulletSystem,
    private readonly hitDetection: HitDetection,
    private readonly audioManager: AudioManager,
  ) {
    this.meleeSystem = new MeleeSystem(bulletSystem, hitDetection, audioManager);
  }

  setUnlimitedAmmo(enabled: boolean): void {
    this.unlimitedAmmo = enabled;
    if (enabled && this.reloadSystem.isReloading()) {
      this.reloadSystem.cancelReload();
      this.reloadFinishedSoundPending = false;
      this.reloadMidStagePlayed = false;
    }
  }

  isUnlimitedAmmo(): boolean {
    return this.unlimitedAmmo;
  }

  setOnShotFiredCallback(
    cb?: (shot: {
      weaponId: string;
      ox: number;
      oy: number;
      oz: number;
      dx: number;
      dy: number;
      dz: number;
    }) => void,
  ): void {
    this.onShotFiredCallback = cb;
  }

  tryFire(params: {
    weapon: Weapon | null;
    player: Player;
    aimRayOrigin: THREE.Vector3;
    aimRayDir: THREE.Vector3;
    isAiming: boolean;
    isFirstPersonScoped?: boolean;
    triggerHeld: boolean;
    triggerJustPressed: boolean;
    modifiers: Readonly<Partial<AbilityModifiers>>;
    onRecoilKick: (yawRad: number, pitchRad: number) => void;
  }): boolean {
    const {
      weapon,
      player,
      aimRayOrigin,
      aimRayDir,
      isAiming,
      isFirstPersonScoped = false,
      modifiers,
    } = params;
    if (!player.isAlive) return false;
    if (!weapon) {
      return this.meleeSystem.tryPunch({
        player,
        aimRayOrigin,
        aimRayDir,
        triggerHeld: params.triggerHeld,
        triggerJustPressed: params.triggerJustPressed,
        modifiers,
        onShotFired: this.onShotFiredCallback,
      });
    }

    if (weapon.definition.type === 'MELEE') {
      if (this.reloadSystem.isReloading()) {
        this.cancelReload(weapon);
      }
      return this.meleeSystem.tryMeleeAttack({
        weapon: weapon.definition,
        player,
        aimRayOrigin,
        aimRayDir,
        triggerHeld: params.triggerHeld,
        triggerJustPressed: params.triggerJustPressed,
        modifiers,
        onSwingStarted: (dur) => weapon.triggerMeleeSwing(dur),
        onShotFired: this.onShotFiredCallback,
      });
    }

    const wantFire = weapon.definition.automatic
      ? params.triggerHeld
      : params.triggerJustPressed;

    if (!wantFire) return false;

    // Strictly disallow firing while reloading even if rounds remain in the magazine
    if (this.reloadSystem.isReloading()) {
      return false;
    }

    if (weapon.isMagazineEmpty(this.unlimitedAmmo)) {
      if (this.emptyClickCooldown <= 0 && (params.triggerJustPressed || params.triggerHeld)) {
        this.audioManager.playEmptyMag();
        this.emptyClickCooldown = 0.28;
        if (weapon.needsReload(this.unlimitedAmmo)) {
          this.tryReload(weapon, player, modifiers);
        }
      }
      return false;
    }

    if (!weapon.canFire(this.unlimitedAmmo) || weapon.isBoltCycling()) {
      return false;
    }

    // Consume 1 round / shell (skipped in unlimited training mode)
    weapon.consumeRound(this.unlimitedAmmo);

    // Prevent camera-boom geometry behind the player character from intercepting the aim ray
    this.playerCenter.set(player.position.x, player.position.y + 1.42, player.position.z);
    this.tempVec.copy(this.playerCenter).sub(aimRayOrigin);
    const playerPlaneDist = Math.max(0, this.tempVec.dot(aimRayDir));
    const safeNearDist = isFirstPersonScoped ? 0.15 : Math.max(0.25, playerPlaneDist + 0.24);

    // Resolve exact world target point along camera center ray
    this.hitDetection.resolveAimTargetPoint(
      aimRayOrigin,
      aimRayDir,
      weapon.definition.range,
      this.aimTargetPoint,
      safeNearDist,
    );

    const targetRayDist = Math.max(
      0.25,
      this.tempVec.copy(this.aimTargetPoint).sub(aimRayOrigin).dot(aimRayDir),
    );

    weapon.mesh.updateWorldMatrix(true, true);
    weapon.muzzleAnchor.getWorldPosition(this.muzzleWorldPos);
    weapon.ejectionAnchor.getWorldPosition(this.ejectWorldPos);

    if (isFirstPersonScoped) {
      // Spawn straight along the scope optic axis strictly behind aimTargetPoint
      const scopeDist = Math.min(0.32, Math.max(0.05, targetRayDist - 0.12));
      this.scopeShotOrigin.copy(aimRayOrigin).addScaledVector(aimRayDir, scopeDist);
    } else {
      // Ensure shots always originate ahead of camera/player backplane AND strictly behind aimTargetPoint
      this.tempVec.copy(this.muzzleWorldPos).sub(aimRayOrigin);
      const muzzleAlongRay = this.tempVec.dot(aimRayDir);
      const targetDistFromMuzzle = this.aimTargetPoint.distanceTo(this.muzzleWorldPos);
      if (
        muzzleAlongRay < playerPlaneDist - 0.15 ||
        muzzleAlongRay >= targetRayDist - 0.12 ||
        targetDistFromMuzzle < 2.2
      ) {
        const clampedSpawnDist = Math.min(
          playerPlaneDist + 0.24,
          Math.max(0.18, targetRayDist - 0.15),
        );
        this.scopeShotOrigin.copy(aimRayOrigin).addScaledVector(aimRayDir, clampedSpawnDist);
      } else {
        this.scopeShotOrigin.copy(this.muzzleWorldPos);
      }
    }

    this.baseShotDir.copy(this.aimTargetPoint).sub(this.scopeShotOrigin);
    if (this.baseShotDir.lengthSq() < 0.0001) {
      this.baseShotDir.copy(aimRayDir).normalize();
    } else {
      this.baseShotDir.normalize();
    }

    // Orthonormal basis for bullet spread cone
    this.rightAxis.crossVectors(this.baseShotDir, this.worldUp);
    if (this.rightAxis.lengthSq() < 0.0001) {
      this.rightAxis.set(1, 0, 0);
    } else {
      this.rightAxis.normalize();
    }
    this.upAxis.crossVectors(this.rightAxis, this.baseShotDir).normalize();

    // Compute dynamic spread angle (factoring ADS, movement, bloom, accuracy, and character abilities)
    const speedSq = player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z;
    const isMoving = speedSq > 0.25;
    const accFactor = clamp(1 - (weapon.definition.accuracy - 60) * 0.004, 0.65, 1.15);
    const abilityAccScale = 1 - clamp((modifiers.accuracyBonusPct ?? 0) / 100, 0, 0.55);
    const moveSpreadFactor = isAiming ? 0.35 : 1.0;

    const spreadDeg =
      ((isAiming ? weapon.definition.spread.adsSpreadDeg : weapon.definition.spread.hipSpreadDeg) +
        (isMoving ? weapon.definition.spread.moveSpreadDeg * moveSpreadFactor : 0) +
        this.recoilSystem.getBloomDeg()) *
      accFactor *
      abilityAccScale;

    const maxSpreadRad = spreadDeg * DEG_TO_RAD;
    const pellets = Math.max(1, weapon.definition.pellets);

    for (let p = 0; p < pellets; p++) {
      // Uniform cone disk sampling
      const angle = Math.random() * Math.PI * 2;
      const radial = Math.sqrt(Math.random()) * Math.tan(maxSpreadRad);
      this.pelletDir
        .copy(this.baseShotDir)
        .addScaledVector(this.rightAxis, Math.cos(angle) * radial)
        .addScaledVector(this.upAxis, Math.sin(angle) * radial)
        .normalize();

      this.bulletSystem.spawnBullet(
        this.scopeShotOrigin,
        this.pelletDir,
        weapon.definition,
        modifiers,
      );
    }

    // Muzzle flash, shell ejection, shooting sound, recoil, bolt-action cycling, and shoot animation
    if (!isFirstPersonScoped) {
      const flashScale =
        weapon.definition.type === 'SHOTGUN'
          ? 1.5
          : weapon.definition.type === 'SNIPER'
            ? 1.35
            : 1.0;
      this.bulletSystem.triggerMuzzleFlash(this.muzzleWorldPos, flashScale);
    }

    this.ejectWorldDir.copy(this.rightAxis).addScaledVector(this.upAxis, 0.4).normalize();
    if (weapon.definition.boltAction) {
      weapon.startBoltCycle(weapon.getFireInterval() * 0.88);
      this.pendingBoltWeapon = weapon;
      this.pendingBoltSoundTimer = 0.14;
      this.pendingBoltEjectTimer =
        this.unlimitedAmmo || weapon.ammoInMagazine > 0 ? 0.36 : -1;
      this.pendingEjectDir.copy(this.ejectWorldDir);
    } else {
      this.bulletSystem.spawnShellCasing(this.ejectWorldPos, this.ejectWorldDir);
    }

    this.audioManager.playGunshot(weapon.definition.sound);

    this.onShotFiredCallback?.({
      weaponId: weapon.definition.id,
      ox: this.scopeShotOrigin.x,
      oy: this.scopeShotOrigin.y,
      oz: this.scopeShotOrigin.z,
      dx: this.baseShotDir.x,
      dy: this.baseShotDir.y,
      dz: this.baseShotDir.z,
    });

    this.recoilSystem.applyShot(weapon.definition, isAiming, this.recoilOut);
    params.onRecoilKick(this.recoilOut.yawRad, this.recoilOut.pitchRad);

    const shootHoldSec = weapon.definition.boltAction
      ? 0.48
      : clamp(weapon.getFireInterval() * 1.15, 0.12, 0.28);
    player.triggerActionAnimation('Shoot', shootHoldSec);

    return true;
  }

  cancelPendingBoltAction(): void {
    this.pendingBoltSoundTimer = -1;
    this.pendingBoltEjectTimer = -1;
    this.pendingBoltWeapon?.cancelBoltCycle();
    this.pendingBoltWeapon = null;
  }

  cancelReload(activeWeapon: Weapon | null): void {
    this.reloadSystem.cancelReload();
    this.reloadFinishedSoundPending = false;
    this.reloadMidStagePlayed = false;
    activeWeapon?.resetReloadVisuals();
  }

  tryReload(
    weapon: Weapon | null,
    player: Player,
    modifiers: Readonly<Partial<AbilityModifiers>>,
  ): boolean {
    if (
      this.unlimitedAmmo ||
      !weapon ||
      !player.isAlive ||
      weapon.definition.type === 'MELEE' ||
      weapon.definition.magazineSize <= 0
    ) {
      return false;
    }
    const speedMult = modifiers.reloadSpeedMultiplier ?? 1.0;
    const started = this.reloadSystem.startReload(weapon, speedMult);
    if (!started) return false;

    this.cancelPendingBoltAction();
    this.reloadFinishedSoundPending = true;
    this.reloadMidStagePlayed = false;
    this.audioManager.playReloadStage(
      weapon.definition.model.magazineStyle === 'break_action' ? 'break_open' : 'mag_out',
    );
    player.triggerActionAnimation('Reload', this.reloadSystem.getDurationSeconds());
    return true;
  }

  getSpreadPreviewDeg(
    weapon: Weapon | null,
    isAiming: boolean,
    isMoving: boolean,
    modifiers: Readonly<Partial<AbilityModifiers>>,
  ): number {
    if (!weapon) return 1.5;
    const abilityAccScale = 1 - clamp((modifiers.accuracyBonusPct ?? 0) / 100, 0, 0.55);
    return (
      ((isAiming ? weapon.definition.spread.adsSpreadDeg : weapon.definition.spread.hipSpreadDeg) +
        (isMoving ? weapon.definition.spread.moveSpreadDeg : 0) +
        this.recoilSystem.getBloomDeg()) *
      abilityAccScale
    );
  }

  update(deltaSeconds: number, activeWeapon: Weapon | null): void {
    this.meleeSystem.update(deltaSeconds);
    if (this.emptyClickCooldown > 0) {
      this.emptyClickCooldown = Math.max(0, this.emptyClickCooldown - deltaSeconds);
    }

    if (this.pendingBoltSoundTimer >= 0) {
      this.pendingBoltSoundTimer -= deltaSeconds;
      if (this.pendingBoltSoundTimer <= 0) {
        this.pendingBoltSoundTimer = -1;
        if (this.pendingBoltWeapon && this.pendingBoltWeapon === activeWeapon) {
          this.audioManager.playBoltAction();
        }
      }
    }

    if (this.pendingBoltEjectTimer >= 0) {
      this.pendingBoltEjectTimer -= deltaSeconds;
      if (this.pendingBoltEjectTimer <= 0) {
        this.pendingBoltEjectTimer = -1;
        if (this.pendingBoltWeapon && this.pendingBoltWeapon === activeWeapon) {
          this.pendingBoltWeapon.mesh.updateWorldMatrix(true, true);
          this.pendingBoltWeapon.ejectionAnchor.getWorldPosition(this.ejectWorldPos);
          this.bulletSystem.spawnShellCasing(this.ejectWorldPos, this.pendingEjectDir);
        }
      }
    }

    if (activeWeapon) {
      activeWeapon.update(deltaSeconds);
    }

    if (this.reloadSystem.isReloading() && activeWeapon) {
      const progress = this.reloadSystem.getProgress();
      activeWeapon.setReloadVisualProgress(progress);
      if (!this.reloadMidStagePlayed && progress >= 0.54) {
        this.reloadMidStagePlayed = true;
        const magStyle = activeWeapon.definition.model.magazineStyle;
        this.audioManager.playReloadStage(
          magStyle === 'tube' || magStyle === 'break_action' ? 'shell_in' : 'mag_in',
        );
      }
    }

    const prevMagStyle = activeWeapon?.definition.model.magazineStyle;
    const completed = this.reloadSystem.update(deltaSeconds, activeWeapon);
    if (completed) {
      activeWeapon?.resetReloadVisuals();
      this.reloadMidStagePlayed = false;
      if (this.reloadFinishedSoundPending) {
        this.reloadFinishedSoundPending = false;
        this.audioManager.playReloadStage(
          prevMagStyle === 'break_action' ? 'break_close' : 'rack',
        );
      }
    }

    this.recoilSystem.update(deltaSeconds, activeWeapon ? activeWeapon.definition : null);
  }
}
