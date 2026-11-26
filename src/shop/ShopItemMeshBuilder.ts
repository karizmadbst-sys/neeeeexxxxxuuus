import * as THREE from 'three';
import { buildGlooWallVisualRig, getGlooWallSkinById } from '../combat/GlooWallSkins';
import { WEAPON_BY_ID } from '../weapons/WeaponData';
import {
  applyWeaponSkinToGroup,
  clearWeaponSkinFromGroup,
  instantiateWeaponRig,
} from '../weapons/WeaponModelBuilder';
import { getWeaponSkinById } from '../weapons/WeaponSkins';
import type { ShopCatalogItem } from './IShopSystem';

export interface BuiltShopPreviewModel {
  root: THREE.Group;
  preferredPitch: number;
  preferredYaw: number;
  dispose: () => void;
}

function makeMat(
  mats: THREE.Material[],
  params: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  mats.push(m);
  return m;
}

function makeGeo<T extends THREE.BufferGeometry>(
  geos: THREE.BufferGeometry[],
  geo: T,
): T {
  geos.push(geo);
  return geo;
}

export function buildShopItemPreviewModel(item: ShopCatalogItem): BuiltShopPreviewModel {
  const root = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  let preferredPitch = 0.28;
  let preferredYaw = 0.56;
  let extraDispose: (() => void) | null = null;

  if (item.glooSkinId) {
    const skin = getGlooWallSkinById(item.glooSkinId);
    const rig = buildGlooWallVisualRig(skin, {
      forShopPreview: true,
      includeCracks: false,
      includeFrostRing: true,
    });
    // Center vertically and along the curved depth so the studio camera frames the full semi-circular barrier cleanly
    rig.root.position.set(0, -1.0, 0.36);
    root.add(rig.root);
    extraDispose = rig.dispose;
    preferredPitch = 0.2;
    preferredYaw = 0.36;
  } else if (item.weaponId) {
    const def = WEAPON_BY_ID[item.weaponId];
    if (def) {
      const rig = instantiateWeaponRig(def);
      if (item.weaponSkinId) {
        const skin = getWeaponSkinById(item.weaponSkinId);
        if (skin) {
          applyWeaponSkinToGroup(rig.root, skin);
          extraDispose = () => clearWeaponSkinFromGroup(rig.root);
        }
      }
      rig.root.rotation.y = Math.PI / 2;
      root.add(rig.root);
      preferredPitch = 0.16;
      preferredYaw = def.type === 'MELEE' ? 0.42 : 0.34;
    }
  } else if (item.gliderColors) {
    buildGliderMesh(root, geos, mats, item.gliderColors.primaryHex, item.gliderColors.accentHex);
    preferredPitch = 0.36;
    preferredYaw = 0.48;
  } else if (item.beaconHex) {
    buildBeaconMesh(root, geos, mats, item.beaconHex);
    preferredPitch = 0.32;
    preferredYaw = 0.52;
  } else {
    switch (item.lootId) {
      case 'armor_lv1':
      case 'armor_lv2':
      case 'armor_lv3': {
        const tier = item.lootId === 'armor_lv3' ? 3 : item.lootId === 'armor_lv2' ? 2 : 1;
        buildArmorVestMesh(root, geos, mats, tier, item.accentHex);
        preferredPitch = 0.22;
        preferredYaw = 0.45;
        break;
      }
      case 'helmet_lv1':
      case 'helmet_lv2':
      case 'helmet_lv3': {
        const tier = item.lootId === 'helmet_lv3' ? 3 : item.lootId === 'helmet_lv2' ? 2 : 1;
        buildHelmetMesh(root, geos, mats, tier, item.accentHex);
        preferredPitch = 0.24;
        preferredYaw = -0.58;
        break;
      }
      case 'backpack_lv1':
      case 'backpack_lv2':
      case 'backpack_lv3': {
        const tier = item.lootId === 'backpack_lv3' ? 3 : item.lootId === 'backpack_lv2' ? 2 : 1;
        buildBackpackMesh(root, geos, mats, tier, item.accentHex);
        preferredPitch = 0.25;
        preferredYaw = 0.55;
        break;
      }
      case 'scope_2x':
      case 'scope_4x':
      case 'scope_8x': {
        const zoom = item.lootId === 'scope_8x' ? 8 : item.lootId === 'scope_4x' ? 4 : 2;
        buildScopeMesh(root, geos, mats, zoom, item.accentHex);
        preferredPitch = 0.22;
        preferredYaw = 0.62;
        break;
      }
      case 'med_bandage':
        buildBandageMesh(root, geos, mats, item.accentHex);
        break;
      case 'med_kit':
        buildMedkitMesh(root, geos, mats, item.accentHex);
        break;
      case 'shield_cell':
        buildShieldCellMesh(root, geos, mats, item.accentHex);
        break;
      case 'shield_battery':
        buildShieldBatteryMesh(root, geos, mats, item.accentHex);
        break;
      case 'special_adrenaline':
        buildAdrenalineMesh(root, geos, mats, item.accentHex);
        preferredPitch = 0.34;
        preferredYaw = 0.58;
        break;
      case 'special_recon_chip':
        buildReconChipMesh(root, geos, mats, item.accentHex);
        preferredPitch = 0.42;
        preferredYaw = 0.55;
        break;
      case 'utility_repair_kit':
        buildRepairKitMesh(root, geos, mats, item.accentHex);
        break;
      case 'utility_kevlar_plate':
        buildKevlarPlateMesh(root, geos, mats, item.accentHex);
        break;
      case 'utility_energy_drink':
        buildEnergyCanMesh(root, geos, mats, item.accentHex);
        break;
      case 'utility_ammo_pouch':
        buildSupplyPackMesh(root, geos, mats, item.accentHex);
        break;
      default: {
        const fallback = new THREE.Mesh(
          makeGeo(geos, new THREE.OctahedronGeometry(0.42, 1)),
          makeMat(mats, { color: item.accentHex, roughness: 0.3, metalness: 0.7 }),
        );
        root.add(fallback);
        break;
      }
    }
  }

  return {
    root,
    preferredPitch,
    preferredYaw,
    dispose: () => {
      extraDispose?.();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

function buildGliderMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  primaryHex: string,
  accentHex: string,
): void {
  const mainMat = makeMat(mats, { color: primaryHex, roughness: 0.48, metalness: 0.14 });
  const trimMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.18,
    roughness: 0.35,
    metalness: 0.35,
  });
  const cordMat = makeMat(mats, { color: '#94a3b8', roughness: 0.4, metalness: 0.75 });
  const packMat = makeMat(mats, { color: '#0f172a', roughness: 0.6, metalness: 0.3 });

  const cellGeo = makeGeo(geos, new THREE.BoxGeometry(0.24, 0.08, 0.76));
  const ribGeo = makeGeo(geos, new THREE.BoxGeometry(0.035, 0.105, 0.78));

  const cellCount = 7;
  for (let i = 0; i < cellCount; i++) {
    const t = i - (cellCount - 1) / 2;
    const x = t * 0.22;
    const archY = 0.48 - t * t * 0.036;
    const roll = -t * 0.14;

    const cell = new THREE.Mesh(cellGeo, i === 0 || i === cellCount - 1 || i === 3 ? trimMat : mainMat);
    cell.position.set(x, archY, 0);
    cell.rotation.z = roll;
    root.add(cell);

    if (i < cellCount - 1) {
      const rib = new THREE.Mesh(ribGeo, trimMat);
      rib.position.set(x + 0.11, archY - 0.01, 0);
      rib.rotation.z = roll - 0.07;
      root.add(rib);
    }
  }

  const lineGeo = makeGeo(geos, new THREE.CylinderGeometry(0.008, 0.008, 0.88, 6));
  const anchorPoints = [-0.62, -0.32, 0.32, 0.62];
  for (const ax of anchorPoints) {
    for (const az of [-0.22, 0.22]) {
      const line = new THREE.Mesh(lineGeo, cordMat);
      line.position.set(ax * 0.52, 0.02, az * 0.5);
      line.rotation.z = ax * 0.55;
      line.rotation.x = -az * 0.48;
      root.add(line);
    }
  }

  const harness = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.24, 0.28, 0.16)), packMat);
  harness.position.set(0, -0.38, 0);
  const buckle = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.14, 0.08, 0.18)), trimMat);
  buckle.position.set(0, -0.34, 0);
  root.add(harness, buckle);
}

function buildBeaconMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  beaconHex: string,
): void {
  const metalMat = makeMat(mats, { color: '#1e293b', roughness: 0.32, metalness: 0.85 });
  const slateMat = makeMat(mats, { color: '#334155', roughness: 0.45, metalness: 0.65 });
  const glowMat = makeMat(mats, {
    color: beaconHex,
    emissive: beaconHex,
    emissiveIntensity: 1.25,
    roughness: 0.18,
    metalness: 0.2,
  });
  const beamMat = makeMat(mats, {
    color: beaconHex,
    emissive: beaconHex,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
    metalness: 0,
  });

  const base = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.46, 0.54, 0.12, 6)), metalMat);
  base.position.y = -0.36;
  const collar = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.28, 0.36, 0.14, 6)), slateMat);
  collar.position.y = -0.24;
  const core = new THREE.Mesh(makeGeo(geos, new THREE.OctahedronGeometry(0.16, 0)), glowMat);
  core.position.y = -0.02;
  const ring1 = new THREE.Mesh(makeGeo(geos, new THREE.TorusGeometry(0.32, 0.024, 10, 28)), glowMat);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = -0.14;
  const ring2 = new THREE.Mesh(makeGeo(geos, new THREE.TorusGeometry(0.24, 0.018, 10, 24)), glowMat);
  ring2.rotation.x = Math.PI / 2.4;
  ring2.rotation.y = 0.4;
  ring2.position.y = 0.06;
  const beam = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.08, 0.22, 0.72, 16, 1, true)), beamMat);
  beam.position.y = 0.2;

  root.add(base, collar, core, ring1, ring2, beam);
}

function buildArmorVestMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  tier: 1 | 2 | 3,
  accentHex: string,
): void {
  const fabricHex = tier === 3 ? '#1e293b' : tier === 2 ? '#1e3a5f' : '#334155';
  const metalHex = tier === 3 ? '#d97706' : tier === 2 ? '#0284c7' : '#64748b';

  const fabricMat = makeMat(mats, { color: fabricHex, roughness: 0.72, metalness: 0.15 });
  const plateMat = makeMat(mats, { color: metalHex, roughness: 0.3, metalness: 0.82 });
  const darkMat = makeMat(mats, { color: '#0f172a', roughness: 0.55, metalness: 0.45 });
  const glowMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: tier >= 2 ? 0.85 : 0.25,
    roughness: 0.25,
    metalness: 0.4,
  });

  const torso = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.62, 0.72, 0.34)), fabricMat);
  const frontPlate = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.48, 0.52, 0.08)), plateMat);
  frontPlate.position.set(0, 0.04, 0.18);
  const backPlate = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.48, 0.52, 0.07)), plateMat);
  backPlate.position.set(0, 0.04, -0.18);

  const strapGeo = makeGeo(geos, new THREE.BoxGeometry(0.13, 0.12, 0.38));
  const leftStrap = new THREE.Mesh(strapGeo, darkMat);
  leftStrap.position.set(-0.21, 0.38, 0);
  const rightStrap = new THREE.Mesh(strapGeo, darkMat);
  rightStrap.position.set(0.21, 0.38, 0);

  root.add(torso, frontPlate, backPlate, leftStrap, rightStrap);

  // MOLLE pouches across lower front
  const pouchGeo = makeGeo(geos, new THREE.BoxGeometry(0.12, 0.15, 0.07));
  for (const px of [-0.14, 0, 0.14]) {
    const pouch = new THREE.Mesh(pouchGeo, darkMat);
    pouch.position.set(px, -0.16, 0.23);
    root.add(pouch);
  }

  // Tier emblem
  const emblem = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.16, 0.09, 0.04)), glowMat);
  emblem.position.set(0, 0.16, 0.23);
  root.add(emblem);

  if (tier >= 2) {
    const collar = new THREE.Mesh(makeGeo(geos, new THREE.TorusGeometry(0.2, 0.04, 8, 16, Math.PI)), plateMat);
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI;
    collar.position.set(0, 0.36, -0.02);
    root.add(collar);
  }

  if (tier === 3) {
    const pauldronGeo = makeGeo(geos, new THREE.SphereGeometry(0.18, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55));
    const lp = new THREE.Mesh(pauldronGeo, plateMat);
    lp.position.set(-0.37, 0.28, 0);
    lp.rotation.z = 0.55;
    const rp = new THREE.Mesh(pauldronGeo, plateMat);
    rp.position.set(0.37, 0.28, 0);
    rp.rotation.z = -0.55;
    root.add(lp, rp);
  }
}

function buildHelmetMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  tier: 1 | 2 | 3,
  accentHex: string,
): void {
  const shellHex = tier === 3 ? '#1e293b' : tier === 2 ? '#1e3a5f' : '#475569';
  const trimHex = tier === 3 ? '#f59e0b' : tier === 2 ? '#38bdf8' : '#94a3b8';

  const shellMat = makeMat(mats, { color: shellHex, roughness: tier === 3 ? 0.32 : 0.56, metalness: tier === 3 ? 0.78 : 0.4 });
  const trimMat = makeMat(mats, { color: trimHex, roughness: 0.3, metalness: 0.75 });
  const darkMat = makeMat(mats, { color: '#0f172a', roughness: 0.6, metalness: 0.35 });
  const visorMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: tier === 3 ? 0.9 : 0.45,
    roughness: 0.12,
    metalness: 0.4,
  });

  const dome = new THREE.Mesh(
    makeGeo(geos, new THREE.SphereGeometry(0.38, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    shellMat,
  );
  dome.position.y = -0.02;
  const rim = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.385, 0.4, 0.08, 18)), trimMat);
  rim.position.y = -0.06;

  // Chin strap loop
  const strap = new THREE.Mesh(makeGeo(geos, new THREE.TorusGeometry(0.28, 0.022, 8, 18, Math.PI)), darkMat);
  strap.rotation.z = Math.PI;
  strap.position.set(0, -0.08, 0.04);

  root.add(dome, rim, strap);

  if (tier >= 2) {
    // Side ARC rails & NVG shroud
    const railGeo = makeGeo(geos, new THREE.BoxGeometry(0.05, 0.07, 0.32));
    const leftRail = new THREE.Mesh(railGeo, trimMat);
    leftRail.position.set(-0.37, 0.01, 0.02);
    const rightRail = new THREE.Mesh(railGeo, trimMat);
    rightRail.position.set(0.37, 0.01, 0.02);
    const shroud = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.14, 0.12, 0.07)), trimMat);
    shroud.position.set(0, 0.16, 0.36);
    root.add(leftRail, rightRail, shroud);
  }

  if (tier === 3) {
    const visor = new THREE.Mesh(
      makeGeo(geos, new THREE.CylinderGeometry(0.39, 0.37, 0.16, 18, 1, true, -0.85, 1.7)),
      visorMat,
    );
    visor.position.set(0, -0.06, 0.03);
    const mandible = new THREE.Mesh(
      makeGeo(geos, new THREE.CylinderGeometry(0.36, 0.31, 0.14, 16, 1, true, -0.75, 1.5)),
      shellMat,
    );
    mandible.position.set(0, -0.2, 0.05);
    root.add(visor, mandible);
  } else {
    const goggles = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.36, 0.11, 0.1)), visorMat);
    goggles.position.set(0, 0.02, 0.34);
    root.add(goggles);
  }
}

function buildBackpackMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  tier: 1 | 2 | 3,
  accentHex: string,
): void {
  const bodyHex = tier === 3 ? '#1e293b' : tier === 2 ? '#1e3a5f' : '#78350f';
  const bodyMat = makeMat(mats, { color: bodyHex, roughness: 0.68, metalness: 0.14 });
  const darkMat = makeMat(mats, { color: '#0f172a', roughness: 0.55, metalness: 0.4 });
  const accentMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: tier >= 2 ? 0.55 : 0.15,
    roughness: 0.3,
    metalness: 0.65,
  });

  const mainW = tier === 3 ? 0.58 : tier === 2 ? 0.5 : 0.42;
  const mainH = tier === 3 ? 0.72 : tier === 2 ? 0.64 : 0.54;
  const mainD = tier === 3 ? 0.32 : tier === 2 ? 0.28 : 0.22;

  const pack = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(mainW, mainH, mainD)), bodyMat);
  const flap = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(mainW + 0.04, 0.16, mainD + 0.04)), darkMat);
  flap.position.y = mainH * 0.36;
  const frontPouch = new THREE.Mesh(
    makeGeo(geos, new THREE.BoxGeometry(mainW * 0.72, mainH * 0.38, 0.11)),
    darkMat,
  );
  frontPouch.position.set(0, -mainH * 0.16, mainD * 0.54);
  const buckle = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.12, 0.09, 0.06)), accentMat);
  buckle.position.set(0, mainH * 0.14, mainD * 0.54);

  root.add(pack, flap, frontPouch, buckle);

  if (tier >= 2) {
    const sidePouchGeo = makeGeo(geos, new THREE.CylinderGeometry(0.09, 0.09, mainH * 0.45, 10));
    const lp = new THREE.Mesh(sidePouchGeo, bodyMat);
    lp.position.set(-(mainW * 0.56), -0.05, 0);
    const rp = new THREE.Mesh(sidePouchGeo, bodyMat);
    rp.position.set(mainW * 0.56, -0.05, 0);
    root.add(lp, rp);
  }

  if (tier === 3) {
    const roll = new THREE.Mesh(
      makeGeo(geos, new THREE.CylinderGeometry(0.11, 0.11, mainW + 0.08, 12)),
      accentMat,
    );
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, mainH * 0.55, 0);
    root.add(roll);
  }
}

function buildScopeMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  zoom: 2 | 4 | 8,
  accentHex: string,
): void {
  const bodyMat = makeMat(mats, { color: '#1e293b', roughness: 0.32, metalness: 0.85 });
  const ringMat = makeMat(mats, { color: '#334155', roughness: 0.38, metalness: 0.75 });
  const lensMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.75,
    roughness: 0.08,
    metalness: 0.35,
  });

  const tubeLen = zoom === 8 ? 0.92 : zoom === 4 ? 0.62 : 0.42;
  const bellRadius = zoom === 8 ? 0.18 : zoom === 4 ? 0.15 : 0.13;

  const tubeGeo = makeGeo(geos, new THREE.CylinderGeometry(0.095, 0.095, tubeLen, 16));
  tubeGeo.rotateZ(Math.PI / 2);
  const tube = new THREE.Mesh(tubeGeo, bodyMat);

  const frontBellGeo = makeGeo(geos, new THREE.CylinderGeometry(bellRadius, 0.1, 0.2, 16));
  frontBellGeo.rotateZ(Math.PI / 2);
  const frontBell = new THREE.Mesh(frontBellGeo, bodyMat);
  frontBell.position.x = tubeLen * 0.5 + 0.08;

  const rearBellGeo = makeGeo(geos, new THREE.CylinderGeometry(0.1, 0.125, 0.16, 16));
  rearBellGeo.rotateZ(Math.PI / 2);
  const rearBell = new THREE.Mesh(rearBellGeo, bodyMat);
  rearBell.position.x = -(tubeLen * 0.5 + 0.06);

  const lensGeo = makeGeo(geos, new THREE.CylinderGeometry(bellRadius * 0.82, bellRadius * 0.82, 0.03, 16));
  lensGeo.rotateZ(Math.PI / 2);
  const frontLens = new THREE.Mesh(lensGeo, lensMat);
  frontLens.position.x = tubeLen * 0.5 + 0.18;

  const mountBase = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(tubeLen * 0.52, 0.07, 0.14)), ringMat);
  mountBase.position.y = -0.14;

  const turretTop = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.055, 0.055, 0.09, 12)), lensMat);
  turretTop.position.set(0, 0.13, 0);

  const turretSide = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.048, 0.048, 0.08, 12)), ringMat);
  turretSide.rotation.x = Math.PI / 2;
  turretSide.position.set(0, 0, 0.12);

  root.add(tube, frontBell, rearBell, frontLens, mountBase, turretTop, turretSide);
}

function buildBandageMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const wrapMat = makeMat(mats, { color: '#e2e8f0', roughness: 0.78, metalness: 0.04 });
  const coreMat = makeMat(mats, { color: '#94a3b8', roughness: 0.6, metalness: 0.15 });
  const bandMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.3,
    roughness: 0.35,
    metalness: 0.2,
  });

  const rollGeo = makeGeo(geos, new THREE.CylinderGeometry(0.19, 0.19, 0.36, 16));
  const roll1 = new THREE.Mesh(rollGeo, wrapMat);
  roll1.position.set(-0.18, 0, 0.05);
  roll1.rotation.z = 0.2;

  const roll2 = new THREE.Mesh(rollGeo, wrapMat);
  roll2.position.set(0.18, -0.04, -0.06);
  roll2.rotation.x = Math.PI / 2;
  roll2.rotation.z = -0.3;

  const stripe = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16)), bandMat);
  stripe.position.copy(roll1.position);
  stripe.rotation.copy(roll1.rotation);

  const core = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.07, 0.07, 0.38, 12)), coreMat);
  core.position.copy(roll1.position);
  core.rotation.copy(roll1.rotation);

  root.add(roll1, roll2, stripe, core);
}

function buildMedkitMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const caseMat = makeMat(mats, { color: '#f1f5f9', roughness: 0.42, metalness: 0.18 });
  const darkMat = makeMat(mats, { color: '#1e293b', roughness: 0.5, metalness: 0.45 });
  const crossMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.2,
  });

  const box = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.68, 0.48, 0.24)), caseMat);
  const rim = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.71, 0.08, 0.26)), darkMat);
  const handle = new THREE.Mesh(makeGeo(geos, new THREE.TorusGeometry(0.11, 0.028, 8, 16, Math.PI)), darkMat);
  handle.position.set(0, 0.25, 0);

  const crossH = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.28, 0.09, 0.04)), crossMat);
  crossH.position.set(0, 0, 0.125);
  const crossV = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.09, 0.28, 0.04)), crossMat);
  crossV.position.set(0, 0, 0.125);

  root.add(box, rim, handle, crossH, crossV);
}

function buildShieldCellMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const metalMat = makeMat(mats, { color: '#1e293b', roughness: 0.28, metalness: 0.88 });
  const coreMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.15,
    roughness: 0.14,
    metalness: 0.25,
  });

  const core = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.19, 0.19, 0.54, 8)), coreMat);
  const topCap = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8)), metalMat);
  topCap.position.y = 0.28;
  const botCap = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8)), metalMat);
  botCap.position.y = -0.28;
  const midRing = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.215, 0.215, 0.06, 8)), metalMat);

  root.add(core, topCap, botCap, midRing);
}

function buildShieldBatteryMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const frameMat = makeMat(mats, { color: '#0f172a', roughness: 0.34, metalness: 0.85 });
  const coreMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.25,
    roughness: 0.12,
    metalness: 0.2,
  });
  const finMat = makeMat(mats, { color: '#334155', roughness: 0.4, metalness: 0.78 });

  const chassis = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.54, 0.64, 0.28)), frameMat);
  const tubeGeo = makeGeo(geos, new THREE.CylinderGeometry(0.095, 0.095, 0.48, 12));
  const leftTube = new THREE.Mesh(tubeGeo, coreMat);
  leftTube.position.set(-0.12, 0, 0.09);
  const rightTube = new THREE.Mesh(tubeGeo, coreMat);
  rightTube.position.set(0.12, 0, 0.09);

  const capTop = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.58, 0.11, 0.32)), finMat);
  capTop.position.y = 0.3;
  const capBot = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.58, 0.11, 0.32)), finMat);
  capBot.position.y = -0.3;

  root.add(chassis, leftTube, rightTube, capTop, capBot);
}

function buildAdrenalineMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const metalMat = makeMat(mats, { color: '#94a3b8', roughness: 0.24, metalness: 0.92 });
  const serumMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.1,
    roughness: 0.12,
    metalness: 0.15,
  });
  const gripMat = makeMat(mats, { color: '#1e293b', roughness: 0.55, metalness: 0.4 });

  const group = new THREE.Group();
  group.rotation.z = -Math.PI / 5;

  const barrel = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.09, 0.09, 0.54, 14)), serumMat);
  const collar = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.115, 0.115, 0.1, 14)), gripMat);
  collar.position.y = -0.24;
  const flange = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.28, 0.04, 0.16)), metalMat);
  flange.position.y = -0.29;
  const plunger = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.032, 0.032, 0.22, 10)), metalMat);
  plunger.position.y = -0.4;
  const tip = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.035, 0.06, 0.12, 10)), metalMat);
  tip.position.y = 0.31;
  const needle = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.01, 0.014, 0.24, 8)), metalMat);
  needle.position.y = 0.47;

  group.add(barrel, collar, flange, plunger, tip, needle);
  root.add(group);
}

function buildReconChipMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const pcbMat = makeMat(mats, { color: '#0f172a', roughness: 0.42, metalness: 0.55 });
  const goldMat = makeMat(mats, { color: '#eab308', roughness: 0.24, metalness: 0.92 });
  const glowMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.0,
    roughness: 0.2,
    metalness: 0.3,
  });

  const board = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.62, 0.08, 0.48)), pcbMat);
  const core = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.24, 0.11, 0.24)), glowMat);
  core.position.y = 0.03;

  const pinGeo = makeGeo(geos, new THREE.BoxGeometry(0.05, 0.04, 0.09));
  for (let i = -2; i <= 2; i++) {
    const p = new THREE.Mesh(pinGeo, goldMat);
    p.position.set(i * 0.1, -0.02, 0.26);
    root.add(p);
  }

  const antenna = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.02, 0.028, 0.42, 8)), goldMat);
  antenna.position.set(0.22, 0.22, -0.16);
  const tip = new THREE.Mesh(makeGeo(geos, new THREE.SphereGeometry(0.055, 10, 8)), glowMat);
  tip.position.set(0.22, 0.44, -0.16);

  root.add(board, core, antenna, tip);
}

function buildRepairKitMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const steelMat = makeMat(mats, { color: '#334155', roughness: 0.35, metalness: 0.82 });
  const trimMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.45,
  });
  const handleMat = makeMat(mats, { color: '#0f172a', roughness: 0.6, metalness: 0.3 });

  const box = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.66, 0.38, 0.38)), steelMat);
  const band = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.68, 0.09, 0.4)), trimMat);
  band.position.y = 0.06;
  const handle = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.28, 0.07, 0.08)), handleMat);
  handle.position.y = 0.23;

  const wrench = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.34, 0.05, 0.08)), trimMat);
  wrench.position.set(0, 0.06, 0.21);
  wrench.rotation.z = 0.25;

  root.add(box, band, handle, wrench);
}

function buildKevlarPlateMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const kevlarMat = makeMat(mats, { color: '#1e293b', roughness: 0.52, metalness: 0.55 });
  const trimMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.6,
  });

  const plate = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.36, 0.4, 0.09, 6)), kevlarMat);
  plate.rotation.x = Math.PI / 2;
  const inlay = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.22, 0.25, 0.11, 6)), trimMat);
  inlay.rotation.x = Math.PI / 2;

  root.add(plate, inlay);
}

function buildEnergyCanMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const metalMat = makeMat(mats, { color: '#cbd5e1', roughness: 0.22, metalness: 0.92 });
  const bodyMat = makeMat(mats, { color: '#0f172a', roughness: 0.3, metalness: 0.72 });
  const stripeMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.85,
    roughness: 0.22,
    metalness: 0.4,
  });

  const can = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.18, 0.18, 0.56, 18)), bodyMat);
  const topRim = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.15, 0.18, 0.06, 18)), metalMat);
  topRim.position.y = 0.3;
  const botRim = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.18, 0.15, 0.05, 18)), metalMat);
  botRim.position.y = -0.3;
  const stripe = new THREE.Mesh(makeGeo(geos, new THREE.CylinderGeometry(0.186, 0.186, 0.18, 18)), stripeMat);
  stripe.position.y = 0.05;

  root.add(can, topRim, botRim, stripe);
}

function buildSupplyPackMesh(
  root: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  accentHex: string,
): void {
  const oliveMat = makeMat(mats, { color: '#3f6212', roughness: 0.65, metalness: 0.22 });
  const brassMat = makeMat(mats, { color: '#eab308', roughness: 0.24, metalness: 0.9 });
  const bandMat = makeMat(mats, {
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.38,
    roughness: 0.35,
    metalness: 0.4,
  });

  const crate = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.64, 0.44, 0.38)), oliveMat);
  const band = new THREE.Mesh(makeGeo(geos, new THREE.BoxGeometry(0.66, 0.1, 0.4)), bandMat);
  band.position.y = 0.08;

  const roundGeo = makeGeo(geos, new THREE.CylinderGeometry(0.032, 0.032, 0.22, 8));
  for (let i = -2; i <= 2; i++) {
    const bullet = new THREE.Mesh(roundGeo, brassMat);
    bullet.position.set(i * 0.09, -0.08, 0.21);
    root.add(bullet);
  }

  root.add(crate, band);
}
