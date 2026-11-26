import * as THREE from 'three';
import type { Subsystem } from '../core/Types';
import type { WeaponCategory, WeaponDefinition } from './WeaponData';
import { instantiateWeaponRig } from './WeaponModelBuilder';

const CATEGORY_COLOR: Record<string, string> = {
  SMG: '#38bdf8',
  AR: '#f97316',
  LMG: '#fb7185',
  SHOTGUN: '#ef4444',
  SNIPER: '#84cc16',
  PISTOL: '#e2e8f0',
  MELEE: '#facc15',
};

export class WeaponPickup implements Subsystem {
  readonly root = new THREE.Group();
  readonly weaponDef: WeaponDefinition;
  readonly position = new THREE.Vector3();

  ammoInMagazine: number;
  reserveAmmo: number;
  collected = false;

  private readonly floatingModel = new THREE.Group();
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private static readonly scratchBox = new THREE.Box3();
  private static readonly scratchCenter = new THREE.Vector3();

  constructor(
    weaponDef: WeaponDefinition,
    x: number,
    groundY: number,
    z: number,
    ammoInMagazine?: number,
    reserveAmmo?: number,
  ) {
    this.weaponDef = weaponDef;
    this.ammoInMagazine = ammoInMagazine ?? weaponDef.magazineSize;
    this.reserveAmmo = reserveAmmo ?? weaponDef.startingReserveAmmo;
    this.position.set(x, groundY, z);
    this.root.position.copy(this.position);
    this.buildVisual(weaponDef.type);
  }

  private buildVisual(category: WeaponCategory): void {
    const colorHex = CATEGORY_COLOR[category] ?? '#38bdf8';

    const ringGeo = new THREE.TorusGeometry(0.55, 0.04, 8, 24);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.35,
      roughness: 0.25,
      metalness: 0.3,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.05;

    const rig = instantiateWeaponRig(this.weaponDef);
    WeaponPickup.scratchBox.setFromObject(rig.root);
    WeaponPickup.scratchBox.getCenter(WeaponPickup.scratchCenter);
    rig.root.position.sub(WeaponPickup.scratchCenter);
    rig.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
      }
    });

    const pickupScale =
      category === 'PISTOL' ? 1.45 : category === 'MELEE' ? 1.25 : 1.05;
    this.floatingModel.add(rig.root);
    this.floatingModel.scale.setScalar(pickupScale);
    this.floatingModel.position.y = 0.56;
    this.floatingModel.rotation.z = 0.14;

    this.ownedGeometries.push(ringGeo);
    this.ownedMaterials.push(ringMat);
    this.root.add(ring, this.floatingModel);
  }

  update(elapsedSeconds: number): void {
    if (this.collected) return;
    this.floatingModel.rotation.y = elapsedSeconds * 1.65;
    this.floatingModel.position.y = 0.56 + Math.sin(elapsedSeconds * 3.0) * 0.08;
  }

  distanceToSq(point: THREE.Vector3): number {
    const dx = this.position.x - point.x;
    const dz = this.position.z - point.z;
    return dx * dx + dz * dz;
  }

  dispose(): void {
    for (const geo of this.ownedGeometries) geo.dispose();
    this.ownedGeometries.length = 0;
    for (const mat of this.ownedMaterials) mat.dispose();
    this.ownedMaterials.length = 0;
    this.floatingModel.clear();
  }
}
