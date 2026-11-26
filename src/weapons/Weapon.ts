import * as THREE from 'three';
import type { WeaponDefinition } from './WeaponData';
import {
  applyWeaponSkinToGroup,
  clearWeaponSkinFromGroup,
  instantiateWeaponRig,
  type WeaponRigNodes,
} from './WeaponModelBuilder';
import { getWeaponSkinById } from './WeaponSkins';

export class Weapon {
  readonly definition: WeaponDefinition;
  readonly mesh = new THREE.Group();
  readonly muzzleAnchor: THREE.Object3D;
  readonly ejectionAnchor: THREE.Object3D;

  ammoInMagazine: number;
  reserveAmmo: number;
  fireCooldown = 0;
  visualKickbackZ = 0;

  private readonly rig: WeaponRigNodes;
  private boltCycleTimer = 0;
  private boltCycleDuration = 0;
  private slideBlowback = 0;
  private meleeSwingTimer = 0;
  private meleeSwingDuration = 0.28;
  private reloadActive = false;
  private shadowEnabled = true;
  private appliedSkinId: string | null = null;

  constructor(definition: WeaponDefinition, initialMag?: number, initialReserve?: number) {
    this.definition = definition;
    this.ammoInMagazine = initialMag ?? definition.magazineSize;
    this.reserveAmmo = initialReserve ?? definition.startingReserveAmmo;

    this.rig = instantiateWeaponRig(definition);
    this.muzzleAnchor = this.rig.muzzleAnchor;
    this.ejectionAnchor = this.rig.ejectionAnchor;
    this.mesh.name = `weapon_${definition.id}`;
    this.mesh.userData.weaponId = definition.id;
    this.mesh.add(this.rig.root);
    this.applyShadowCasting(this.shadowEnabled);
  }

  private applyShadowCasting(enabled: boolean): void {
    this.rig.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = enabled;
      }
    });
  }

  setShadowCasting(enabled: boolean): void {
    if (this.shadowEnabled === enabled) return;
    this.shadowEnabled = enabled;
    this.applyShadowCasting(enabled);
  }

  applySkin(skinId?: string | null): void {
    const normalized = skinId && skinId.trim() ? skinId : null;
    if (normalized === this.appliedSkinId) return;
    this.appliedSkinId = normalized;
    const skin = normalized ? getWeaponSkinById(normalized) : undefined;
    applyWeaponSkinToGroup(this.rig.root, skin ?? null);
  }

  getAppliedSkinId(): string | null {
    return this.appliedSkinId;
  }

  getFireInterval(): number {
    return 60 / Math.max(1, this.definition.fireRate);
  }

  canFire(unlimited = false): boolean {
    if (this.definition.type === 'MELEE' || this.definition.magazineSize <= 0 || unlimited) {
      return this.fireCooldown <= 0;
    }
    return this.fireCooldown <= 0 && this.ammoInMagazine > 0;
  }

  isMagazineEmpty(unlimited = false): boolean {
    if (unlimited || this.definition.type === 'MELEE' || this.definition.magazineSize <= 0) {
      return false;
    }
    return this.ammoInMagazine <= 0;
  }

  needsReload(unlimited = false): boolean {
    if (unlimited || this.definition.type === 'MELEE' || this.definition.magazineSize <= 0) {
      return false;
    }
    return this.ammoInMagazine < this.definition.magazineSize && this.reserveAmmo > 0;
  }

  isBoltCycling(): boolean {
    return this.boltCycleTimer > 0 && this.boltCycleDuration > 0;
  }

  getBoltCycleProgress(): number {
    if (!this.isBoltCycling()) return 1;
    return 1 - Math.max(0, this.boltCycleTimer / this.boltCycleDuration);
  }

  startBoltCycle(durationSeconds: number): void {
    this.boltCycleDuration = Math.max(0.25, durationSeconds);
    this.boltCycleTimer = this.boltCycleDuration;
  }

  cancelBoltCycle(): void {
    this.boltCycleTimer = 0;
    this.boltCycleDuration = 0;
    if (this.rig.boltHandleNode) {
      this.rig.boltHandleNode.rotation.z = 0;
      this.rig.boltHandleNode.position.copy(this.rig.boltRestPos);
    }
  }

  triggerMeleeSwing(durationSeconds = 0.28): void {
    this.meleeSwingDuration = Math.max(0.16, durationSeconds);
    this.meleeSwingTimer = this.meleeSwingDuration;
    this.fireCooldown = this.getFireInterval();
  }

  consumeRound(unlimited = false): boolean {
    if (this.definition.type === 'MELEE' || this.definition.magazineSize <= 0) {
      return false;
    }
    if (unlimited) {
      this.ammoInMagazine = this.definition.magazineSize;
    } else {
      if (this.ammoInMagazine <= 0) return false;
      this.ammoInMagazine -= 1;
    }
    this.fireCooldown = this.getFireInterval();
    this.visualKickbackZ = this.definition.recoil.visualKickback;
    if (this.rig.slideNode) {
      this.slideBlowback = 1;
    }
    return true;
  }

  applyReload(): number {
    if (this.definition.type === 'MELEE' || this.definition.magazineSize <= 0) return 0;
    const needed = this.definition.magazineSize - this.ammoInMagazine;
    if (needed <= 0 || this.reserveAmmo <= 0) return 0;
    const loaded = Math.min(needed, this.reserveAmmo);
    this.ammoInMagazine += loaded;
    this.reserveAmmo -= loaded;
    return loaded;
  }

  setReloadVisualProgress(progress: number | null): void {
    if (progress === null) {
      this.resetReloadVisuals();
      return;
    }
    if (this.definition.type === 'MELEE' || this.definition.magazineSize <= 0) {
      return;
    }

    const p = Math.max(0, Math.min(1, progress));
    this.reloadActive = true;

    const tiltEnv = p < 0.14 ? p / 0.14 : p > 0.86 ? (1 - p) / 0.14 : 1;
    const magStyle = this.definition.model.magazineStyle;

    // 1. M1887 Double-Barrel Break-Action shotgun: hinges barrel down, swaps twin shells, snaps shut
    if (magStyle === 'break_action') {
      this.mesh.rotation.z = -0.34 * tiltEnv;
      this.mesh.rotation.x = 0.16 * tiltEnv;
      this.mesh.position.y = 0.03 * tiltEnv;
      this.mesh.position.z = 0;

      if (this.rig.breakActionPivot) {
        const openAngle =
          p < 0.18
            ? (p / 0.18) * 0.68
            : p < 0.78
              ? 0.68
              : p < 0.92
                ? ((0.92 - p) / 0.14) * 0.68
                : 0;
        this.rig.breakActionPivot.rotation.x = openAngle;
      }

      const setShells = (visible: boolean, pullBack: number) => {
        if (this.rig.shellLeftNode) {
          this.rig.shellLeftNode.visible = visible;
          this.rig.shellLeftNode.position.z = -0.028 - pullBack;
        }
        if (this.rig.shellRightNode) {
          this.rig.shellRightNode.visible = visible;
          this.rig.shellRightNode.position.z = -0.028 - pullBack;
        }
      };

      if (p < 0.2) {
        setShells(true, 0);
      } else if (p < 0.36) {
        // Spent shells eject backward out of breech
        const t = (p - 0.2) / 0.16;
        setShells(true, t * 0.09);
      } else if (p < 0.48) {
        setShells(false, 0.09);
      } else if (p < 0.72) {
        // Twin fresh red 12G shells slide into chambers
        const t = 1 - (p - 0.48) / 0.24;
        setShells(true, t * 0.095);
      } else {
        setShells(true, 0);
      }
      return;
    }

    // 2. Tubular shotgun (M1014): tilt, pump/bolt feed stroke, rack
    if (magStyle === 'tube') {
      this.mesh.rotation.z = -0.38 * tiltEnv;
      this.mesh.rotation.x = 0.2 * tiltEnv;
      this.mesh.position.y = 0.03 * tiltEnv;
      if (this.rig.boltHandleNode) {
        const rack =
          p >= 0.78 && p <= 0.96 ? Math.sin(((p - 0.78) / 0.18) * Math.PI) : 0;
        this.rig.boltHandleNode.position.z = this.rig.boltRestPos.z - rack * 0.068;
      }
      if (this.rig.magazineNode) {
        this.rig.magazineNode.visible = true;
        if (p >= 0.22 && p <= 0.78) {
          const cycle = Math.sin(((p - 0.22) / 0.56) * Math.PI * 2);
          this.rig.magazineNode.position.z =
            this.rig.magazineRestPos.z - Math.max(0, cycle) * 0.045;
        } else {
          this.rig.magazineNode.position.copy(this.rig.magazineRestPos);
        }
      }
      if (p > 0.78) {
        const rack = Math.sin(((p - 0.78) / 0.22) * Math.PI);
        this.mesh.position.z = -rack * 0.045;
      } else {
        this.mesh.position.z = 0;
      }
      return;
    }

    // 3. Top-mounted pan drum (DP-28): lifts off top receiver & tilts upward before latching back
    if (magStyle === 'pan') {
      this.mesh.rotation.z = -0.34 * tiltEnv;
      this.mesh.rotation.x = 0.14 * tiltEnv;
      this.mesh.position.y = 0.024 * tiltEnv;

      const mag = this.rig.magazineNode;
      if (mag) {
        const ry = this.rig.magazineRestPos.y;
        const rz = this.rig.magazineRestPos.z;
        if (p < 0.08) {
          mag.visible = true;
          mag.position.copy(this.rig.magazineRestPos);
          mag.rotation.copy(this.rig.magazineRestRot);
        } else if (p < 0.36) {
          const t = (p - 0.08) / 0.28;
          mag.visible = true;
          mag.position.y = ry + t * 0.14;
          mag.position.z = rz - t * 0.04;
          mag.rotation.z = this.rig.magazineRestRot.z + t * 0.48;
        } else if (p < 0.52) {
          mag.visible = false;
        } else if (p < 0.78) {
          const t = 1 - (p - 0.52) / 0.26;
          mag.visible = true;
          mag.position.y = ry + t * 0.14;
          mag.position.z = rz - t * 0.03;
          mag.rotation.z = this.rig.magazineRestRot.z + t * 0.35;
        } else {
          mag.visible = true;
          mag.position.copy(this.rig.magazineRestPos);
          mag.rotation.copy(this.rig.magazineRestRot);
        }
      }

      if (p >= 0.8 && p <= 0.96) {
        const rack = Math.sin(((p - 0.8) / 0.16) * Math.PI);
        this.mesh.position.z = -rack * 0.038;
        if (this.rig.boltHandleNode) {
          this.rig.boltHandleNode.rotation.z = rack * 0.7;
          this.rig.boltHandleNode.position.z = this.rig.boltRestPos.z - rack * 0.075;
        }
      } else {
        this.mesh.position.z = 0;
        if (this.rig.boltHandleNode && !this.isBoltCycling()) {
          this.rig.boltHandleNode.rotation.z = 0;
          this.rig.boltHandleNode.position.copy(this.rig.boltRestPos);
        }
      }
      return;
    }

    // 4. Top-feeding P90 magazine: lifts upward and slides forward off upper shroud
    if (magStyle === 'top_p90') {
      this.mesh.rotation.z = -0.32 * tiltEnv;
      this.mesh.rotation.x = 0.14 * tiltEnv;
      this.mesh.position.y = 0.022 * tiltEnv;

      const mag = this.rig.magazineNode;
      if (mag) {
        const ry = this.rig.magazineRestPos.y;
        const rz = this.rig.magazineRestPos.z;
        if (p < 0.08) {
          mag.visible = true;
          mag.position.copy(this.rig.magazineRestPos);
          mag.rotation.copy(this.rig.magazineRestRot);
        } else if (p < 0.34) {
          const t = (p - 0.08) / 0.26;
          mag.visible = true;
          mag.position.y = ry + t * 0.08;
          mag.position.z = rz + t * 0.14;
          mag.rotation.x = this.rig.magazineRestRot.x - t * 0.22;
        } else if (p < 0.5) {
          mag.visible = false;
        } else if (p < 0.76) {
          const t = 1 - (p - 0.5) / 0.26;
          mag.visible = true;
          mag.position.y = ry + t * 0.075;
          mag.position.z = rz + t * 0.13;
          mag.rotation.x = this.rig.magazineRestRot.x - t * 0.18;
        } else {
          mag.visible = true;
          mag.position.copy(this.rig.magazineRestPos);
          mag.rotation.copy(this.rig.magazineRestRot);
        }
      }

      if (p >= 0.78 && p <= 0.96) {
        const rack = Math.sin(((p - 0.78) / 0.18) * Math.PI);
        this.mesh.position.z = -rack * 0.032;
        if (this.rig.boltHandleNode) {
          this.rig.boltHandleNode.position.z = this.rig.boltRestPos.z - rack * 0.06;
        }
      } else {
        this.mesh.position.z = 0;
        if (this.rig.boltHandleNode && !this.isBoltCycling()) {
          this.rig.boltHandleNode.rotation.z = 0;
          this.rig.boltHandleNode.position.copy(this.rig.boltRestPos);
        }
      }
      return;
    }

    // 5. Revolver swing-out cylinder (M1917): tilts pistol, swings cylinder left, ejects & seats
    if (magStyle === 'revolver') {
      this.mesh.rotation.z = -0.45 * tiltEnv;
      this.mesh.rotation.x = 0.22 * tiltEnv;
      this.mesh.position.y = 0.03 * tiltEnv;
      this.mesh.position.z = 0;

      const cyl = this.rig.magazineNode;
      if (cyl) {
        const swingOut =
          p < 0.16
            ? p / 0.16
            : p < 0.8
              ? 1
              : p < 0.94
                ? (0.94 - p) / 0.14
                : 0;
        cyl.visible = true;
        cyl.position.x = this.rig.magazineRestPos.x - swingOut * 0.038;
        cyl.position.y = this.rig.magazineRestPos.y - swingOut * 0.008;
        cyl.position.z = this.rig.magazineRestPos.z;
        cyl.rotation.z = this.rig.magazineRestRot.z + p * Math.PI * 2;
      }
      return;
    }

    // 6. Detachable box / curved / drum / belt_box magazine cycle (AR, SMG, Sniper, Pistol, LMG)
    this.mesh.rotation.z = (magStyle === 'belt_box' ? -0.26 : -0.3) * tiltEnv;
    this.mesh.rotation.x = 0.15 * tiltEnv;
    this.mesh.position.y = 0.025 * tiltEnv;

    const mag = this.rig.magazineNode;
    if (mag) {
      const rx = this.rig.magazineRestRot.x;
      const ry = this.rig.magazineRestPos.y;
      const rz = this.rig.magazineRestPos.z;
      const dropDepth =
        magStyle === 'belt_box' || magStyle === 'drum'
          ? 0.28
          : this.definition.type === 'PISTOL'
            ? 0.16
            : 0.24;

      if (p < 0.08) {
        mag.visible = true;
        mag.position.copy(this.rig.magazineRestPos);
        mag.rotation.copy(this.rig.magazineRestRot);
      } else if (p < 0.34) {
        const t = (p - 0.08) / 0.26;
        mag.visible = true;
        mag.position.y = ry - t * dropDepth;
        mag.position.z = rz + (magStyle === 'curved' ? t * 0.04 : 0);
        mag.rotation.x = rx + t * 0.25;
      } else if (p < 0.52) {
        mag.visible = false;
      } else if (p < 0.76) {
        const t = 1 - (p - 0.52) / 0.24;
        mag.visible = true;
        mag.position.y = ry - t * dropDepth;
        mag.position.z = rz + (magStyle === 'curved' ? t * 0.03 : 0);
        mag.rotation.x = rx + t * 0.18;
      } else {
        mag.visible = true;
        mag.position.copy(this.rig.magazineRestPos);
        mag.rotation.copy(this.rig.magazineRestRot);
      }
    }

    // Chamber / slide / charging-handle rack at end of reload
    if (p >= 0.78 && p <= 0.96) {
      const rack = Math.sin(((p - 0.78) / 0.18) * Math.PI);
      this.mesh.position.z = -rack * 0.036;
      if (this.rig.boltHandleNode) {
        this.rig.boltHandleNode.rotation.z = rack * 0.75;
        this.rig.boltHandleNode.position.z = this.rig.boltRestPos.z - rack * 0.075;
      }
      if (this.rig.slideNode) {
        this.rig.slideNode.position.z = this.rig.slideRestZ - rack * 0.042;
      }
    } else {
      this.mesh.position.z = 0;
      if (this.rig.boltHandleNode && !this.isBoltCycling()) {
        this.rig.boltHandleNode.rotation.z = 0;
        this.rig.boltHandleNode.position.copy(this.rig.boltRestPos);
      }
      if (this.rig.slideNode) {
        this.rig.slideNode.position.z = this.rig.slideRestZ;
      }
    }
  }

  resetReloadVisuals(): void {
    this.reloadActive = false;
    this.mesh.position.set(0, 0, this.visualKickbackZ > 0.0001 ? -this.visualKickbackZ : 0);
    this.mesh.rotation.set(0, 0, 0);

    if (this.rig.magazineNode) {
      this.rig.magazineNode.visible = true;
      this.rig.magazineNode.position.copy(this.rig.magazineRestPos);
      this.rig.magazineNode.rotation.copy(this.rig.magazineRestRot);
    }
    if (this.rig.boltHandleNode && !this.isBoltCycling()) {
      this.rig.boltHandleNode.rotation.z = 0;
      this.rig.boltHandleNode.position.copy(this.rig.boltRestPos);
    }
    if (this.rig.slideNode) {
      this.rig.slideNode.position.z = this.rig.slideRestZ;
    }
    if (this.rig.breakActionPivot) {
      this.rig.breakActionPivot.rotation.x = 0;
    }
    if (this.rig.shellLeftNode) {
      this.rig.shellLeftNode.visible = true;
      this.rig.shellLeftNode.position.z = -0.028;
    }
    if (this.rig.shellRightNode) {
      this.rig.shellRightNode.visible = true;
      this.rig.shellRightNode.position.z = -0.028;
    }
  }

  update(deltaSeconds: number): void {
    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    }

    if (this.boltCycleTimer > 0) {
      this.boltCycleTimer = Math.max(0, this.boltCycleTimer - deltaSeconds);
      if (this.rig.boltHandleNode && this.boltCycleDuration > 0) {
        const p = 1 - this.boltCycleTimer / this.boltCycleDuration;
        const lift = p < 0.22 ? p / 0.22 : p > 0.78 ? (1 - p) / 0.22 : 1;
        const pull = p < 0.2 || p > 0.8 ? 0 : Math.sin(((p - 0.2) / 0.6) * Math.PI);
        this.rig.boltHandleNode.rotation.z = lift * 0.95;
        this.rig.boltHandleNode.position.z = this.rig.boltRestPos.z - pull * 0.085;
      }
      if (this.boltCycleTimer <= 0) {
        this.cancelBoltCycle();
      }
    }

    if (this.slideBlowback > 0.001 && this.rig.slideNode && !this.reloadActive) {
      this.slideBlowback *= Math.exp(-26 * deltaSeconds);
      this.rig.slideNode.position.z = this.rig.slideRestZ - this.slideBlowback * 0.042;
      if (this.slideBlowback <= 0.005) {
        this.slideBlowback = 0;
        this.rig.slideNode.position.z = this.rig.slideRestZ;
      }
    }

    if (this.meleeSwingTimer > 0) {
      this.meleeSwingTimer = Math.max(0, this.meleeSwingTimer - deltaSeconds);
      const p = 1 - this.meleeSwingTimer / this.meleeSwingDuration;
      const slash = Math.sin(p * Math.PI);
      const isBat = this.definition.meleeKind === 'bat';
      this.mesh.rotation.x = slash * (isBat ? 1.15 : 0.85);
      this.mesh.rotation.z = slash * (isBat ? 0.55 : -0.45);
      this.mesh.position.z = slash * 0.14;
      this.mesh.position.y = -slash * 0.04;
      if (this.meleeSwingTimer <= 0) {
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.position.set(0, 0, 0);
      }
      return;
    }

    if (!this.reloadActive) {
      if (this.mesh.position.y !== 0) this.mesh.position.y = 0;
      if (this.mesh.rotation.x !== 0) this.mesh.rotation.x = 0;
      if (this.mesh.rotation.z !== 0) this.mesh.rotation.z = 0;

      if (this.visualKickbackZ > 0.0001) {
        this.visualKickbackZ *= Math.exp(-16 * deltaSeconds);
        this.mesh.position.z = -this.visualKickbackZ;
      } else if (this.mesh.position.z !== 0) {
        this.visualKickbackZ = 0;
        this.mesh.position.z = 0;
      }
    }
  }

  dispose(): void {
    clearWeaponSkinFromGroup(this.rig.root);
    // Detach rig hierarchy cleanly (GLTF templates & procedural shared assets remain cached).
    this.mesh.clear();
  }
}
