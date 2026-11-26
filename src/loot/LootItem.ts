import * as THREE from 'three';
import { WEAPON_BY_ID } from '../weapons/WeaponData';
import { instantiateWeaponRig } from '../weapons/WeaponModelBuilder';
import type { LootItemDefinition } from './ILootSystem';
import { RARITY_COLORS } from './LootData';

export interface LootItemMetadata {
  weaponAmmoInMag?: number;
  armorDurability?: number;
}

export class LootItem {
  readonly instanceId: string;
  readonly definition: LootItemDefinition;
  readonly quantity: number;
  readonly metadata: LootItemMetadata;
  readonly root = new THREE.Group();

  collected = false;

  private static readonly sharedRingMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private static readonly sharedMainMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private static readonly sharedGlowMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private static sharedDarkMaterial: THREE.MeshStandardMaterial | null = null;
  private static readonly sharedGeometries = new Map<string, THREE.BufferGeometry>();
  private static readonly scratchBox = new THREE.Box3();
  private static readonly scratchCenter = new THREE.Vector3();

  private static getSharedGeo(
    key: string,
    factory: () => THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    let geo = LootItem.sharedGeometries.get(key);
    if (!geo) {
      geo = factory();
      LootItem.sharedGeometries.set(key, geo);
    }
    return geo;
  }

  private static getRingMaterial(rarityHex: string): THREE.MeshBasicMaterial {
    let mat = LootItem.sharedRingMaterials.get(rarityHex);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: rarityHex,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      });
      LootItem.sharedRingMaterials.set(rarityHex, mat);
    }
    return mat;
  }

  private static getMainMaterial(accentHex: string): THREE.MeshStandardMaterial {
    let mat = LootItem.sharedMainMaterials.get(accentHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: accentHex,
        roughness: 0.38,
        metalness: 0.52,
      });
      LootItem.sharedMainMaterials.set(accentHex, mat);
    }
    return mat;
  }

  private static getGlowMaterial(rarityHex: string): THREE.MeshStandardMaterial {
    let mat = LootItem.sharedGlowMaterials.get(rarityHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: rarityHex,
        emissive: rarityHex,
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.2,
      });
      LootItem.sharedGlowMaterials.set(rarityHex, mat);
    }
    return mat;
  }

  private static getDarkMaterial(): THREE.MeshStandardMaterial {
    if (!LootItem.sharedDarkMaterial) {
      LootItem.sharedDarkMaterial = new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.5,
        metalness: 0.65,
      });
    }
    return LootItem.sharedDarkMaterial;
  }

  private readonly visualGroup = new THREE.Group();
  private readonly ringMesh: THREE.Mesh;
  private readonly phaseOffset: number;

  constructor(
    instanceId: string,
    definition: LootItemDefinition,
    x: number,
    groundY: number,
    z: number,
    quantity = 1,
    metadata: LootItemMetadata = {},
  ) {
    this.instanceId = instanceId;
    this.definition = definition;
    this.quantity = quantity;
    this.metadata = { ...metadata };
    this.phaseOffset = (x * 0.73 + z * 0.41) % (Math.PI * 2);

    this.root.position.set(x, groundY, z);

    const rarityHex = RARITY_COLORS[definition.rarity];

    const ringGeo = LootItem.getSharedGeo('ring', () => {
      const g = new THREE.RingGeometry(0.42, 0.56, 16);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    const ringMat = LootItem.getRingMaterial(rarityHex);
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.y = 0.04;

    const mainMat = LootItem.getMainMaterial(definition.accentHex);
    const darkMat = LootItem.getDarkMaterial();
    const glowMat = LootItem.getGlowMaterial(rarityHex);

    this.buildCategoryMesh(mainMat, darkMat, glowMat);

    this.visualGroup.position.y = 0.42;
    this.root.add(this.ringMesh, this.visualGroup);
  }

  private buildCategoryMesh(
    mainMat: THREE.MeshStandardMaterial,
    darkMat: THREE.MeshStandardMaterial,
    glowMat: THREE.MeshStandardMaterial,
  ): void {
    switch (this.definition.category) {
      case 'weapon': {
        const weaponDef = this.definition.weaponId
          ? WEAPON_BY_ID[this.definition.weaponId]
          : undefined;
        if (weaponDef) {
          const rig = instantiateWeaponRig(weaponDef);
          rig.root.rotation.y = Math.PI / 2;
          rig.root.rotation.z = 0.08;
          const scale =
            weaponDef.type === 'PISTOL'
              ? 1.35
              : weaponDef.type === 'MELEE'
                ? 1.2
                : 0.96;
          rig.root.scale.setScalar(scale);
          rig.root.updateMatrixWorld(true);
          LootItem.scratchBox.setFromObject(rig.root);
          if (!LootItem.scratchBox.isEmpty()) {
            LootItem.scratchBox.getCenter(LootItem.scratchCenter);
            rig.root.position.sub(LootItem.scratchCenter);
          }
          this.visualGroup.add(rig.root);
          break;
        }
        const bodyGeo = LootItem.getSharedGeo('weapon_body', () => new THREE.BoxGeometry(0.14, 0.14, 0.58));
        const body = new THREE.Mesh(bodyGeo, darkMat);
        this.visualGroup.add(body);
        break;
      }
      case 'ammo': {
        const boxGeo = LootItem.getSharedGeo('ammo_box', () => new THREE.BoxGeometry(0.36, 0.24, 0.26));
        const bandGeo = LootItem.getSharedGeo('ammo_band', () => new THREE.BoxGeometry(0.38, 0.06, 0.28));
        const box = new THREE.Mesh(boxGeo, darkMat);
        const band = new THREE.Mesh(bandGeo, mainMat);
        band.position.y = 0.04;
        this.visualGroup.add(box, band);
        break;
      }
      case 'armor': {
        const chestGeo = LootItem.getSharedGeo('armor_chest', () => new THREE.BoxGeometry(0.42, 0.46, 0.18));
        const plateGeo = LootItem.getSharedGeo('armor_plate', () => new THREE.BoxGeometry(0.28, 0.26, 0.22));
        const chest = new THREE.Mesh(chestGeo, darkMat);
        const plate = new THREE.Mesh(plateGeo, glowMat);
        this.visualGroup.add(chest, plate);
        break;
      }
      case 'helmet': {
        const domeGeo = LootItem.getSharedGeo('helmet_dome', () => new THREE.CylinderGeometry(0.2, 0.23, 0.24, 10));
        const brimGeo = LootItem.getSharedGeo('helmet_brim', () => new THREE.BoxGeometry(0.42, 0.06, 0.44));
        const visorGeo = LootItem.getSharedGeo('helmet_visor', () => new THREE.BoxGeometry(0.28, 0.08, 0.08));
        const dome = new THREE.Mesh(domeGeo, mainMat);
        dome.position.y = 0.05;
        const brim = new THREE.Mesh(brimGeo, darkMat);
        brim.position.y = -0.05;
        const visor = new THREE.Mesh(visorGeo, glowMat);
        visor.position.set(0, -0.01, 0.22);
        this.visualGroup.add(dome, brim, visor);
        break;
      }
      case 'backpack': {
        const packGeo = LootItem.getSharedGeo('pack_body', () => new THREE.BoxGeometry(0.36, 0.44, 0.22));
        const flapGeo = LootItem.getSharedGeo('pack_flap', () => new THREE.BoxGeometry(0.38, 0.11, 0.24));
        const pouchGeo = LootItem.getSharedGeo('pack_pouch', () => new THREE.BoxGeometry(0.24, 0.18, 0.08));
        const buckleGeo = LootItem.getSharedGeo('pack_buckle', () => new THREE.BoxGeometry(0.08, 0.07, 0.26));
        const pack = new THREE.Mesh(packGeo, mainMat);
        const flap = new THREE.Mesh(flapGeo, darkMat);
        flap.position.y = 0.18;
        const pouch = new THREE.Mesh(pouchGeo, darkMat);
        pouch.position.set(0, -0.09, 0.12);
        const buckle = new THREE.Mesh(buckleGeo, glowMat);
        buckle.position.set(0, 0.06, 0.02);
        this.visualGroup.add(pack, flap, pouch, buckle);
        break;
      }
      case 'scope': {
        const tubeGeo = LootItem.getSharedGeo('scope_tube', () => {
          const g = new THREE.CylinderGeometry(0.09, 0.1, 0.46, 12);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const bellGeo = LootItem.getSharedGeo('scope_bell', () => {
          const g = new THREE.CylinderGeometry(0.135, 0.1, 0.14, 12);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const lensGeo = LootItem.getSharedGeo('scope_lens', () => {
          const g = new THREE.CylinderGeometry(0.115, 0.115, 0.03, 12);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const tube = new THREE.Mesh(tubeGeo, darkMat);
        const bell = new THREE.Mesh(bellGeo, mainMat);
        bell.position.z = 0.24;
        const lens = new THREE.Mesh(lensGeo, glowMat);
        lens.position.z = 0.31;
        this.visualGroup.add(tube, bell, lens);
        break;
      }
      case 'shield': {
        const cylGeo = LootItem.getSharedGeo('shield_cyl', () => new THREE.CylinderGeometry(0.14, 0.14, 0.38, 10));
        const capGeo = LootItem.getSharedGeo('shield_cap', () => new THREE.CylinderGeometry(0.16, 0.16, 0.07, 10));
        const cyl = new THREE.Mesh(cylGeo, glowMat);
        const topCap = new THREE.Mesh(capGeo, darkMat);
        topCap.position.y = 0.18;
        const botCap = new THREE.Mesh(capGeo, darkMat);
        botCap.position.y = -0.18;
        this.visualGroup.add(cyl, topCap, botCap);
        break;
      }
      case 'health': {
        const caseGeo = LootItem.getSharedGeo('med_case', () => new THREE.BoxGeometry(0.38, 0.26, 0.24));
        const crossHGeo = LootItem.getSharedGeo('med_cross_h', () => new THREE.BoxGeometry(0.18, 0.06, 0.26));
        const crossVGeo = LootItem.getSharedGeo('med_cross_v', () => new THREE.BoxGeometry(0.06, 0.18, 0.26));
        const medCase = new THREE.Mesh(caseGeo, darkMat);
        const cH = new THREE.Mesh(crossHGeo, glowMat);
        const cV = new THREE.Mesh(crossVGeo, glowMat);
        this.visualGroup.add(medCase, cH, cV);
        break;
      }
      case 'special': {
        const gemGeo = LootItem.getSharedGeo('spec_gem', () => new THREE.OctahedronGeometry(0.22, 0));
        const haloGeo = LootItem.getSharedGeo('spec_halo', () => new THREE.TorusGeometry(0.26, 0.025, 6, 16));
        const gem = new THREE.Mesh(gemGeo, glowMat);
        const halo = new THREE.Mesh(haloGeo, mainMat);
        halo.rotation.x = Math.PI / 3;
        this.visualGroup.add(gem, halo);
        break;
      }
      case 'utility':
      default: {
        if (this.definition.id === 'gloo_wall') {
          const centerGeo = LootItem.getSharedGeo(
            'gloo_pickup_center',
            () => new THREE.BoxGeometry(0.28, 0.36, 0.08),
          );
          const wingGeo = LootItem.getSharedGeo(
            'gloo_pickup_wing',
            () => new THREE.BoxGeometry(0.18, 0.34, 0.08),
          );
          const center = new THREE.Mesh(centerGeo, glowMat);
          const leftWing = new THREE.Mesh(wingGeo, mainMat);
          leftWing.position.set(-0.2, 0, -0.05);
          leftWing.rotation.y = 0.36;
          const rightWing = new THREE.Mesh(wingGeo, mainMat);
          rightWing.position.set(0.2, 0, -0.05);
          rightWing.rotation.y = -0.36;
          this.visualGroup.add(center, leftWing, rightWing);
          break;
        }
        const crateGeo = LootItem.getSharedGeo('util_crate', () => new THREE.BoxGeometry(0.36, 0.3, 0.36));
        const lidGeo = LootItem.getSharedGeo('util_lid', () => new THREE.BoxGeometry(0.4, 0.07, 0.4));
        const crate = new THREE.Mesh(crateGeo, darkMat);
        const lid = new THREE.Mesh(lidGeo, glowMat);
        lid.position.y = 0.15;
        this.visualGroup.add(crate, lid);
        break;
      }
    }
  }

  distanceToSq(pos: THREE.Vector3): number {
    const dx = this.root.position.x - pos.x;
    const dz = this.root.position.z - pos.z;
    const dy = this.root.position.y - pos.y;
    return dx * dx + dz * dz + dy * dy * 0.35;
  }

  update(elapsedSeconds: number): void {
    if (this.collected) return;
    const t = elapsedSeconds + this.phaseOffset;
    this.visualGroup.rotation.y = t * 1.4;
    this.visualGroup.position.y = 0.42 + Math.sin(t * 2.6) * 0.07;
    this.ringMesh.rotation.z = -t * 0.7;
  }

  dispose(): void {
    // Geometries & materials are shared statically across all LootItem instances.
  }
}
