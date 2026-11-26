import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { WeaponDefinition } from './WeaponData';

export interface WeaponRigNodes {
  root: THREE.Group;
  muzzleAnchor: THREE.Object3D;
  ejectionAnchor: THREE.Object3D;
  magazineNode: THREE.Object3D | null;
  magazineRestPos: THREE.Vector3;
  magazineRestRot: THREE.Euler;
  boltHandleNode: THREE.Object3D | null;
  boltRestPos: THREE.Vector3;
  slideNode: THREE.Object3D | null;
  slideRestZ: number;
  breakActionPivot: THREE.Object3D | null;
  shellLeftNode: THREE.Object3D | null;
  shellRightNode: THREE.Object3D | null;
}

const PRELOADED_WEAPON_TEMPLATES = new Map<string, THREE.Group>();

export function registerWeaponGlbTemplate(weaponId: string, scene: THREE.Group): void {
  PRELOADED_WEAPON_TEMPLATES.set(weaponId, scene);
}

export function hasWeaponGlbTemplate(weaponId: string): boolean {
  return PRELOADED_WEAPON_TEMPLATES.has(weaponId);
}

interface WeaponPbrLibrary {
  gunmetal: THREE.MeshStandardMaterial;
  bluedSteel: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  polymerBlack: THREE.MeshStandardMaterial;
  polymerFde: THREE.MeshStandardMaterial;
  oliveChassis: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
  ashWood: THREE.MeshStandardMaterial;
  bakelite: THREE.MeshStandardMaterial;
  rubberGrip: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  shellHull: THREE.MeshStandardMaterial;
  opticGlass: THREE.MeshStandardMaterial;
  sightDot: THREE.MeshStandardMaterial;
}

let SHARED_PBR: WeaponPbrLibrary | null = null;

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function makeWeaponDataTex(
  size: number,
  srgb: boolean,
  fill: (u: number, v: number, x: number, y: number) => [number, number, number, number],
): THREE.DataTexture {
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = 1 - y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const [r, g, b, a] = fill(u, v, x, y);
      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(buf, size, size, THREE.RGBAFormat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function getWeaponPbrLibrary(): WeaponPbrLibrary {
  if (SHARED_PBR) return SHARED_PBR;

  const gunmetalMap = makeWeaponDataTex(128, true, (_u, v, x, y) => {
    const n = (hash2(x, y) - 0.5) * 14 + Math.sin(v * 64) * 4;
    const base = Math.max(24, Math.min(82, Math.round(46 + n)));
    return [base, base + 2, base + 6, 255];
  });

  const gunmetalRough = makeWeaponDataTex(128, false, (_u, v, x, y) => {
    const streak = Math.sin(v * 90) * 12 + (hash2(x, y) - 0.5) * 28;
    const r = Math.max(55, Math.min(185, Math.round(108 + streak)));
    return [r, r, r, 255];
  });

  const chromeMap = makeWeaponDataTex(128, true, (_u, v, x, y) => {
    const brush = Math.sin(v * 110) * 8 + (hash2(x, y) - 0.5) * 10;
    const c = Math.max(175, Math.min(240, Math.round(210 + brush)));
    return [c, c + 2, Math.min(255, c + 5), 255];
  });

  const walnutMap = makeWeaponDataTex(128, true, (u, v, x, y) => {
    const ring = Math.sin(u * 26 + Math.sin(v * 9) * 2.4 + hash2(x, y) * 0.25);
    const fine = (hash2(x * 0.7, y * 1.4) - 0.5) * 16;
    const t = ring * 0.5 + 0.5;
    const r = Math.max(45, Math.min(165, Math.round(78 + t * 52 + fine)));
    const g = Math.max(22, Math.min(95, Math.round(38 + t * 28 + fine * 0.6)));
    const b = Math.max(10, Math.min(55, Math.round(18 + t * 14 + fine * 0.35)));
    return [r, g, b, 255];
  });

  const ashWoodMap = makeWeaponDataTex(128, true, (u, v, x, y) => {
    const ring = Math.sin(u * 22 + Math.sin(v * 7) * 1.8) * 0.5 + 0.5;
    const grain = (hash2(x, y) - 0.5) * 14;
    const r = Math.max(150, Math.min(240, Math.round(192 + ring * 30 + grain)));
    const g = Math.max(110, Math.min(200, Math.round(146 + ring * 26 + grain * 0.8)));
    const b = Math.max(60, Math.min(135, Math.round(88 + ring * 20 + grain * 0.5)));
    return [r, g, b, 255];
  });

  const polymerMap = makeWeaponDataTex(128, true, (_u, _v, x, y) => {
    const stipple = ((x + y) % 3 === 0 ? 7 : -4) + (hash2(x, y) - 0.5) * 12;
    const c = Math.max(20, Math.min(62, Math.round(36 + stipple)));
    return [c, c + 1, c + 3, 255];
  });

  const fdeMap = makeWeaponDataTex(128, true, (_u, _v, x, y) => {
    const stipple = (hash2(x, y) - 0.5) * 12;
    return [
      Math.max(145, Math.min(210, Math.round(184 + stipple))),
      Math.max(115, Math.min(175, Math.round(150 + stipple * 0.8))),
      Math.max(75, Math.min(130, Math.round(102 + stipple * 0.6))),
      255,
    ];
  });

  const rubberMap = makeWeaponDataTex(64, true, (_u, _v, x, y) => {
    const diamond = ((x + y) % 4 < 2 && (x - y + 64) % 4 < 2) ? 10 : -8;
    const c = Math.max(14, Math.min(48, 24 + diamond));
    return [c, c, c + 2, 255];
  });

  SHARED_PBR = {
    gunmetal: new THREE.MeshStandardMaterial({
      map: gunmetalMap,
      roughnessMap: gunmetalRough,
      roughness: 0.36,
      metalness: 0.84,
    }),
    bluedSteel: new THREE.MeshStandardMaterial({
      color: '#1b2431',
      roughnessMap: gunmetalRough,
      roughness: 0.28,
      metalness: 0.88,
    }),
    chrome: new THREE.MeshStandardMaterial({
      map: chromeMap,
      roughnessMap: gunmetalRough,
      roughness: 0.22,
      metalness: 0.94,
    }),
    polymerBlack: new THREE.MeshStandardMaterial({
      map: polymerMap,
      roughness: 0.72,
      metalness: 0.14,
    }),
    polymerFde: new THREE.MeshStandardMaterial({
      map: fdeMap,
      roughness: 0.68,
      metalness: 0.12,
    }),
    oliveChassis: new THREE.MeshStandardMaterial({
      color: '#4b5a2c',
      map: polymerMap,
      roughness: 0.64,
      metalness: 0.18,
    }),
    walnut: new THREE.MeshStandardMaterial({
      map: walnutMap,
      roughness: 0.56,
      metalness: 0.06,
    }),
    ashWood: new THREE.MeshStandardMaterial({
      map: ashWoodMap,
      roughness: 0.42,
      metalness: 0.04,
    }),
    bakelite: new THREE.MeshStandardMaterial({
      color: '#9a3412',
      roughness: 0.46,
      metalness: 0.08,
    }),
    rubberGrip: new THREE.MeshStandardMaterial({
      map: rubberMap,
      roughness: 0.86,
      metalness: 0.05,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: '#eab308',
      roughness: 0.24,
      metalness: 0.92,
    }),
    shellHull: new THREE.MeshStandardMaterial({
      color: '#b91c1c',
      roughness: 0.5,
      metalness: 0.12,
    }),
    opticGlass: new THREE.MeshStandardMaterial({
      color: '#0284c7',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.55,
      roughness: 0.08,
      metalness: 0.25,
    }),
    sightDot: new THREE.MeshStandardMaterial({
      color: '#4ade80',
      emissive: '#22c55e',
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.1,
    }),
  };
  return SHARED_PBR;
}

const GEO_CACHE = new Map<string, THREE.BufferGeometry>();

function cachedGeo<T extends THREE.BufferGeometry>(key: string, build: () => T): T {
  const existing = GEO_CACHE.get(key);
  if (existing) return existing as T;
  const g = build();
  GEO_CACHE.set(key, g);
  return g;
}

function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `box:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`;
  return cachedGeo(key, () => new THREE.BoxGeometry(w, h, d));
}

function cylZGeo(rt: number, rb: number, len: number, seg = 10): THREE.CylinderGeometry {
  const key = `cylZ:${rt.toFixed(4)}:${rb.toFixed(4)}:${len.toFixed(4)}:${seg}`;
  return cachedGeo(key, () => {
    const g = new THREE.CylinderGeometry(rt, rb, len, seg);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

function cylYGeo(rt: number, rb: number, len: number, seg = 10): THREE.CylinderGeometry {
  const key = `cylY:${rt.toFixed(4)}:${rb.toFixed(4)}:${len.toFixed(4)}:${seg}`;
  return cachedGeo(key, () => new THREE.CylinderGeometry(rt, rb, len, seg));
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx !== 0 || ry !== 0 || rz !== 0) {
    m.rotation.set(rx, ry, rz);
  }
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addCylZ(
  parent: THREE.Object3D,
  rt: number,
  rb: number,
  len: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  seg = 10,
): THREE.Mesh {
  const m = new THREE.Mesh(cylZGeo(rt, rb, len, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addCylY(
  parent: THREE.Object3D,
  rt: number,
  rb: number,
  len: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  seg = 10,
  rx = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(cylYGeo(rt, rb, len, seg), mat);
  m.position.set(x, y, z);
  if (rx !== 0 || rz !== 0) {
    m.rotation.set(rx, 0, rz);
  }
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addTriggerAssembly(
  parent: THREE.Object3D,
  mat: THREE.Material,
  y = -0.016,
  z = 0.042,
): void {
  addBox(parent, 0.01, 0.032, 0.008, mat, 0, y + 0.004, z + 0.002, 0.25, 0, 0);
  addBox(parent, 0.016, 0.007, 0.052, mat, 0, y - 0.018, z, 0, 0, 0);
  addBox(parent, 0.016, 0.024, 0.008, mat, 0, y - 0.008, z + 0.025, 0.2, 0, 0);
}

function addPicatinnyRail(
  parent: THREE.Object3D,
  mat: THREE.Material,
  width: number,
  length: number,
  y: number,
  z: number,
): void {
  addBox(parent, width, 0.012, length, mat, 0, y, z);
  const teeth = Math.max(4, Math.min(10, Math.round(length / 0.032)));
  const step = length / teeth;
  const startZ = z - length * 0.5 + step * 0.5;
  for (let i = 0; i < teeth; i++) {
    addBox(parent, width * 1.12, 0.006, step * 0.45, mat, 0, y + 0.007, startZ + i * step);
  }
}

function addOpticalScope(
  parent: THREE.Object3D,
  pbr: WeaponPbrLibrary,
  style: 'tactical' | 'reflex' | 'marksman' | 'sniper',
  y: number,
  z: number,
): void {
  const scopeGroup = new THREE.Group();
  scopeGroup.position.set(0, y, z);

  // Dual mounting rings
  addBox(scopeGroup, 0.028, 0.026, 0.022, pbr.bluedSteel, 0, -0.02, -0.045);
  addBox(scopeGroup, 0.028, 0.026, 0.022, pbr.bluedSteel, 0, -0.02, 0.045);

  if (style === 'reflex') {
    addBox(scopeGroup, 0.036, 0.014, 0.075, pbr.bluedSteel, 0, -0.012, 0);
    addBox(scopeGroup, 0.038, 0.034, 0.048, pbr.gunmetal, 0, 0.012, 0.008);
    addBox(scopeGroup, 0.026, 0.024, 0.006, pbr.opticGlass, 0, 0.012, 0.032);
    addBox(scopeGroup, 0.005, 0.005, 0.005, pbr.sightDot, 0, 0.012, 0.014);
    parent.add(scopeGroup);
    return;
  }

  const len = style === 'sniper' ? 0.27 : style === 'marksman' ? 0.21 : 0.165;
  const frontR = style === 'sniper' ? 0.031 : 0.025;
  const bodyR = style === 'sniper' ? 0.019 : 0.017;

  addCylZ(scopeGroup, bodyR, bodyR, len, pbr.bluedSteel, 0, 0.005, 0, 12);
  addCylZ(scopeGroup, frontR, bodyR, 0.068, pbr.bluedSteel, 0, 0.005, len * 0.5 + 0.024, 12);
  addCylZ(scopeGroup, bodyR * 1.15, bodyR * 1.28, 0.052, pbr.bluedSteel, 0, 0.005, -len * 0.5 - 0.018, 12);
  // Adjustment turrets
  addCylY(scopeGroup, 0.011, 0.011, 0.022, pbr.gunmetal, 0, 0.027, 0.004, 8);
  addBox(scopeGroup, 0.02, 0.016, 0.016, pbr.gunmetal, 0.022, 0.005, 0.004);
  // Lenses
  addCylZ(scopeGroup, frontR * 0.82, frontR * 0.82, 0.008, pbr.opticGlass, 0, 0.005, len * 0.5 + 0.056, 12);
  addCylZ(scopeGroup, bodyR * 0.95, bodyR * 0.95, 0.008, pbr.opticGlass, 0, 0.005, -len * 0.5 - 0.044, 12);

  parent.add(scopeGroup);
}

function addCurvedMagazine(
  parent: THREE.Object3D,
  mat: THREE.Material,
  width: number,
  depth: number,
  segLen: number,
  curveRad: number,
): void {
  // Two-segment curved banana profile
  addBox(parent, width, segLen, depth, mat, 0, -segLen * 0.45, 0.006, 0.14, 0, 0);
  addBox(
    parent,
    width * 0.98,
    segLen * 0.9,
    depth * 0.96,
    mat,
    0,
    -segLen * 1.25,
    0.024 + curveRad * 0.08,
    0.34,
    0,
    0,
  );
  addBox(parent, width * 1.08, 0.012, depth * 1.08, mat, 0, -segLen * 1.68, 0.044 + curveRad * 0.11, 0.34, 0, 0);
}

function addIronSights(
  parent: THREE.Object3D,
  mat: THREE.Material,
  dotMat: THREE.Material,
  y: number,
  rearZ: number,
  frontZ: number,
): void {
  addBox(parent, 0.024, 0.018, 0.018, mat, 0, y, rearZ);
  addBox(parent, 0.006, 0.012, 0.006, dotMat, -0.007, y + 0.007, rearZ);
  addBox(parent, 0.006, 0.012, 0.006, dotMat, 0.007, y + 0.007, rearZ);
  addBox(parent, 0.012, 0.022, 0.014, mat, 0, y + 0.002, frontZ);
  addBox(parent, 0.005, 0.008, 0.006, dotMat, 0, y + 0.012, frontZ);
}

function createBoltHandlePivot(
  mat: THREE.Material,
  knobMat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = 'BoltHandleNode';
  pivot.position.set(x, y, z);
  const stem = new THREE.Mesh(cylYGeo(0.0065, 0.0065, 0.048, 8), mat);
  stem.rotation.z = Math.PI / 2;
  stem.position.set(0.024, -0.002, 0);
  const knob = new THREE.Mesh(
    cachedGeo('bolt-knob', () => new THREE.SphereGeometry(0.0135, 10, 8)),
    knobMat,
  );
  knob.position.set(0.05, -0.012, 0);
  pivot.add(stem, knob);
  return pivot;
}

export function buildProceduralWeaponGroup(def: WeaponDefinition): THREE.Group {
  const pbr = getWeaponPbrLibrary();
  const root = new THREE.Group();
  root.name = `weapon_${def.id}`;

  const muzzle = new THREE.Object3D();
  muzzle.name = 'MuzzleAnchor';

  const eject = new THREE.Object3D();
  eject.name = 'EjectionAnchor';

  switch (def.id) {
    case 'scar': {
      // Monolithic FDE tactical rifle, adjustable boot stock, picatinny rails, curved mag, ACOG 2x scope
      addBox(root, 0.056, 0.068, 0.44, pbr.polymerFde, 0, 0.044, 0.16);
      addBox(root, 0.05, 0.052, 0.25, pbr.polymerFde, 0, -0.008, 0.11);
      addBox(root, 0.042, 0.088, 0.046, pbr.rubberGrip, 0, -0.072, -0.005, -0.26, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.022, 0.046);
      addPicatinnyRail(root, pbr.gunmetal, 0.032, 0.39, 0.082, 0.18);
      addBox(root, 0.062, 0.024, 0.17, pbr.gunmetal, 0, 0.042, 0.29); // side rails
      addCylZ(root, 0.014, 0.016, 0.34, pbr.bluedSteel, 0, 0.042, 0.51, 10);
      addBox(root, 0.024, 0.034, 0.036, pbr.gunmetal, 0, 0.056, 0.43); // gas block
      addCylZ(root, 0.018, 0.015, 0.055, pbr.gunmetal, 0, 0.042, 0.695, 10); // flash hider
      // SCAR signature adjustable boot stock
      addBox(root, 0.048, 0.056, 0.08, pbr.polymerFde, 0, 0.034, -0.09);
      addBox(root, 0.044, 0.064, 0.14, pbr.polymerFde, 0, 0.024, -0.18, 0.06, 0, 0);
      addBox(root, 0.048, 0.108, 0.038, pbr.rubberGrip, 0, 0.002, -0.255);
      addBox(root, 0.046, 0.02, 0.11, pbr.polymerBlack, 0, 0.064, -0.16); // cheek riser

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.028, 0.165);
      addCurvedMagazine(mag, pbr.polymerFde, 0.034, 0.068, 0.082, 0.14);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, 0.029, 0.052, 0.16);
      root.add(bolt);
      addOpticalScope(root, pbr, 'tactical', 0.106, 0.11);

      muzzle.position.set(0, 0.042, 0.728);
      eject.position.set(0.038, 0.048, 0.14);
      break;
    }

    case 'ak24': {
      // Classic AK-47: dark stamped receiver, walnut handguard & angled buttstock, curved steel mag, reflex scope
      addBox(root, 0.05, 0.066, 0.28, pbr.bluedSteel, 0, 0.034, 0.09);
      addBox(root, 0.044, 0.028, 0.25, pbr.gunmetal, 0, 0.07, 0.085); // ribbed dust cover
      addBox(root, 0.036, 0.09, 0.042, pbr.walnut, 0, -0.068, -0.01, -0.32, 0, 0);
      addTriggerAssembly(root, pbr.bluedSteel, -0.018, 0.038);
      // Walnut handguard + upper gas tube
      addBox(root, 0.046, 0.048, 0.19, pbr.walnut, 0, 0.022, 0.315);
      addCylZ(root, 0.015, 0.015, 0.185, pbr.walnut, 0, 0.058, 0.315, 10);
      addCylZ(root, 0.013, 0.014, 0.33, pbr.bluedSteel, 0, 0.034, 0.52, 10);
      addBox(root, 0.018, 0.042, 0.028, pbr.gunmetal, 0, 0.055, 0.65); // front sight post
      addCylZ(root, 0.017, 0.014, 0.042, pbr.gunmetal, 0, 0.034, 0.695, 8); // slant brake
      // Iconic angled walnut stock
      addBox(root, 0.04, 0.068, 0.23, pbr.walnut, 0, 0.008, -0.16, 0.17, 0, 0);
      addBox(root, 0.042, 0.096, 0.022, pbr.gunmetal, 0, -0.012, -0.27, 0.17, 0, 0);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.012, 0.155);
      addCurvedMagazine(mag, pbr.gunmetal, 0.034, 0.066, 0.094, 0.35);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.chrome, 0.026, 0.045, 0.13);
      root.add(bolt);
      addPicatinnyRail(root, pbr.gunmetal, 0.028, 0.16, 0.088, 0.08);
      addOpticalScope(root, pbr, 'reflex', 0.108, 0.08);

      muzzle.position.set(0, 0.034, 0.72);
      eject.position.set(0.036, 0.048, 0.12);
      break;
    }

    case 'parafal': {
      // Heavy 7.62 battle rifle: elongated matte receiver, vented forearm, folding stock, straight mag, marksman optic
      addBox(root, 0.052, 0.072, 0.34, pbr.bluedSteel, 0, 0.038, 0.11);
      addBox(root, 0.046, 0.056, 0.26, pbr.polymerBlack, 0, 0.032, 0.39);
      addBox(root, 0.038, 0.092, 0.044, pbr.rubberGrip, 0, -0.072, -0.01, -0.26, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.044);
      addPicatinnyRail(root, pbr.gunmetal, 0.032, 0.32, 0.08, 0.13);
      addCylZ(root, 0.013, 0.015, 0.42, pbr.bluedSteel, 0, 0.042, 0.62, 10);
      addCylZ(root, 0.019, 0.016, 0.065, pbr.gunmetal, 0, 0.042, 0.84, 10);
      // Folding tubular battle stock
      addCylZ(root, 0.01, 0.01, 0.22, pbr.gunmetal, 0, 0.044, -0.17, 8);
      addCylZ(root, 0.009, 0.009, 0.21, pbr.gunmetal, 0, -0.01, -0.17, 8);
      addBox(root, 0.038, 0.105, 0.032, pbr.rubberGrip, 0, 0.012, -0.28);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.025, 0.165);
      addBox(mag, 0.032, 0.165, 0.074, pbr.gunmetal, 0, -0.072, 0, 0.06, 0, 0);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, 0.028, 0.05, 0.14);
      root.add(bolt);
      addOpticalScope(root, pbr, 'marksman', 0.106, 0.11);

      muzzle.position.set(0, 0.042, 0.878);
      eject.position.set(0.036, 0.048, 0.13);
      break;
    }

    case 'm4a1': {
      // Classic tactical M4A1 carbine (NO optic scope — front A-frame post & rear tactical sight + quad rail)
      addBox(root, 0.05, 0.072, 0.26, pbr.bluedSteel, 0, 0.038, 0.08);
      addBox(root, 0.04, 0.09, 0.044, pbr.rubberGrip, 0, -0.07, -0.01, -0.28, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.042);
      // Quad-rail RIS handguard + angled foregrip
      addBox(root, 0.054, 0.056, 0.21, pbr.gunmetal, 0, 0.036, 0.305);
      addPicatinnyRail(root, pbr.gunmetal, 0.032, 0.42, 0.079, 0.19);
      addBox(root, 0.028, 0.064, 0.03, pbr.polymerBlack, 0, -0.022, 0.31, 0.18, 0, 0); // vertical grip
      addCylZ(root, 0.012, 0.014, 0.30, pbr.bluedSteel, 0, 0.038, 0.52, 10);
      addCylZ(root, 0.016, 0.014, 0.045, pbr.gunmetal, 0, 0.038, 0.685, 8);
      // Triangle A-frame front sight + rear flip iron sight
      addBox(root, 0.018, 0.046, 0.038, pbr.bluedSteel, 0, 0.068, 0.43);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.092, -0.01, 0.43);
      // Buffer tube & SOPMOD adjustable crane stock
      addCylZ(root, 0.017, 0.017, 0.20, pbr.gunmetal, 0, 0.036, -0.14, 10);
      addBox(root, 0.05, 0.086, 0.15, pbr.polymerBlack, 0, 0.018, -0.21);
      addBox(root, 0.052, 0.105, 0.028, pbr.rubberGrip, 0, 0.008, -0.285);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.024, 0.145);
      addCurvedMagazine(mag, pbr.gunmetal, 0.032, 0.064, 0.08, 0.16);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.gunmetal, pbr.polymerBlack, 0.026, 0.054, -0.015);
      root.add(bolt);

      muzzle.position.set(0, 0.038, 0.715);
      eject.position.set(0.034, 0.044, 0.11);
      break;
    }

    case 'awm': {
      // Heavy OD-green AWM .338 bolt-action sniper: thumbhole chassis, fluted bull barrel, bipod, muzzle brake, 4x optic
      addBox(root, 0.056, 0.072, 0.46, pbr.oliveChassis, 0, 0.032, 0.17);
      addBox(root, 0.044, 0.042, 0.28, pbr.bluedSteel, 0, 0.072, 0.14); // action receiver
      addBox(root, 0.04, 0.09, 0.044, pbr.oliveChassis, 0, -0.068, -0.01, -0.24, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.042);
      // Thumbhole stock & adjustable cheek rest
      addBox(root, 0.048, 0.054, 0.24, pbr.oliveChassis, 0, 0.026, -0.17);
      addBox(root, 0.04, 0.026, 0.2, pbr.oliveChassis, 0, -0.056, -0.15, -0.08, 0, 0);
      addBox(root, 0.048, 0.105, 0.036, pbr.rubberGrip, 0, -0.005, -0.29);
      addBox(root, 0.044, 0.024, 0.12, pbr.polymerBlack, 0, 0.066, -0.16);
      // Heavy free-float barrel + rectangular tank brake + folded bipod
      addCylZ(root, 0.016, 0.019, 0.56, pbr.bluedSteel, 0, 0.058, 0.62, 12);
      addBox(root, 0.046, 0.04, 0.078, pbr.gunmetal, 0, 0.058, 0.92);
      addCylZ(root, 0.01, 0.01, 0.19, pbr.gunmetal, -0.036, -0.008, 0.44, 8);
      addCylZ(root, 0.01, 0.01, 0.19, pbr.gunmetal, 0.036, -0.008, 0.44, 8);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.02, 0.165);
      addBox(mag, 0.034, 0.125, 0.086, pbr.gunmetal, 0, -0.05, 0, 0.04, 0, 0);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.gunmetal, 0.026, 0.072, 0.075);
      root.add(bolt);
      addPicatinnyRail(root, pbr.gunmetal, 0.03, 0.2, 0.096, 0.13);
      addOpticalScope(root, pbr, 'sniper', 0.124, 0.13);

      muzzle.position.set(0, 0.058, 0.965);
      eject.position.set(0.038, 0.074, 0.14);
      break;
    }

    case 'kar98k': {
      // Classic WWII Mauser bolt-action walnut rifle — IRON SIGHTS ONLY (NO optic scope!)
      addBox(root, 0.046, 0.066, 0.54, pbr.walnut, 0, 0.018, 0.21);
      addBox(root, 0.04, 0.052, 0.24, pbr.walnut, 0, 0.006, 0.55); // slimmer forend
      addCylZ(root, 0.016, 0.018, 0.24, pbr.bluedSteel, 0, 0.054, 0.11, 10); // receiver ring
      addCylZ(root, 0.013, 0.015, 0.56, pbr.bluedSteel, 0, 0.054, 0.55, 10); // long barrel
      addBox(root, 0.048, 0.058, 0.022, pbr.gunmetal, 0, 0.022, 0.48); // barrel band
      addBox(root, 0.042, 0.048, 0.018, pbr.gunmetal, 0, 0.018, 0.65); // front band
      // Semi-grip sculpted walnut stock
      addBox(root, 0.04, 0.076, 0.06, pbr.walnut, 0, -0.036, -0.035, -0.58, 0, 0);
      addBox(root, 0.042, 0.078, 0.24, pbr.walnut, 0, -0.024, -0.17, 0.18, 0, 0);
      addBox(root, 0.044, 0.105, 0.022, pbr.gunmetal, 0, -0.046, -0.29, 0.18, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.038);
      // Tangent rear & hooded front iron sights (NO scope)
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.076, 0.24, 0.79);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.015, 0.13);
      addBox(mag, 0.03, 0.068, 0.078, pbr.gunmetal, 0, -0.02, 0); // internal floorplate/clip block
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.chrome, 0.022, 0.054, 0.055);
      root.add(bolt);

      muzzle.position.set(0, 0.054, 0.84);
      eject.position.set(0.032, 0.06, 0.12);
      break;
    }

    case 'mp40': {
      // Classic stamped metal tubular SMG, Bakelite lower, underfolded wire stock, long vertical stick mag
      addCylZ(root, 0.022, 0.022, 0.36, pbr.gunmetal, 0, 0.046, 0.14, 12);
      addBox(root, 0.042, 0.044, 0.22, pbr.walnut, 0, 0.012, 0.09); // bakelite lower
      addBox(root, 0.036, 0.088, 0.04, pbr.rubberGrip, 0, -0.066, -0.01, -0.3, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.016, 0.042);
      addCylZ(root, 0.011, 0.012, 0.24, pbr.bluedSteel, 0, 0.046, 0.42, 10);
      addBox(root, 0.016, 0.028, 0.022, pbr.bluedSteel, 0, 0.046, 0.51); // front hood
      // Folded wire underfolder struts
      addCylZ(root, 0.006, 0.006, 0.23, pbr.gunmetal, -0.022, -0.016, 0.12, 6);
      addCylZ(root, 0.006, 0.006, 0.23, pbr.gunmetal, 0.022, -0.016, 0.12, 6);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.072, -0.01, 0.5);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, 0.01, 0.25);
      addBox(mag, 0.032, 0.055, 0.048, pbr.gunmetal, 0, -0.02, 0); // magwell
      addBox(mag, 0.026, 0.22, 0.038, pbr.bluedSteel, 0, -0.13, 0);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.gunmetal, pbr.gunmetal, -0.024, 0.052, 0.05);
      root.add(bolt);

      muzzle.position.set(0, 0.046, 0.55);
      eject.position.set(0.03, 0.05, 0.12);
      break;
    }

    case 'ump': {
      // Modern compact boxy tactical polymer SMG with straight .45 stick mag & skeleton stock
      addBox(root, 0.054, 0.088, 0.34, pbr.polymerBlack, 0, 0.036, 0.13);
      addBox(root, 0.038, 0.088, 0.044, pbr.rubberGrip, 0, -0.068, -0.01, -0.25, 0, 0);
      addTriggerAssembly(root, pbr.polymerBlack, -0.018, 0.042);
      addPicatinnyRail(root, pbr.gunmetal, 0.032, 0.28, 0.085, 0.14);
      addBox(root, 0.026, 0.052, 0.028, pbr.rubberGrip, 0, -0.026, 0.26, 0.14, 0, 0); // foregrip
      addCylZ(root, 0.014, 0.016, 0.17, pbr.bluedSteel, 0, 0.042, 0.36, 10);
      // Skeleton folding stock
      addBox(root, 0.028, 0.022, 0.19, pbr.polymerBlack, 0, 0.052, -0.14);
      addBox(root, 0.024, 0.018, 0.17, pbr.polymerBlack, 0, -0.005, -0.14, -0.26, 0, 0);
      addBox(root, 0.04, 0.098, 0.028, pbr.rubberGrip, 0, 0.016, -0.235);
      addIronSights(root, pbr.gunmetal, pbr.sightDot, 0.098, 0.01, 0.26);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.02, 0.155);
      addBox(mag, 0.03, 0.21, 0.044, pbr.polymerBlack, 0, -0.095, 0, 0.08, 0, 0);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.gunmetal, pbr.polymerBlack, -0.028, 0.064, 0.23);
      root.add(bolt);

      muzzle.position.set(0, 0.042, 0.455);
      eject.position.set(0.036, 0.048, 0.11);
      break;
    }

    case 'mp5': {
      // Roller-delayed MP5: upper cocking tube, ribbed forearm, curved 9mm mag, telescoping A3 stock, drum sight
      addBox(root, 0.046, 0.068, 0.3, pbr.bluedSteel, 0, 0.03, 0.11);
      addCylZ(root, 0.016, 0.016, 0.24, pbr.gunmetal, 0, 0.064, 0.24, 10); // cocking tube
      addBox(root, 0.05, 0.048, 0.16, pbr.polymerBlack, 0, 0.022, 0.29); // ribbed forearm
      addBox(root, 0.038, 0.088, 0.042, pbr.rubberGrip, 0, -0.068, -0.01, -0.28, 0, 0);
      addTriggerAssembly(root, pbr.bluedSteel, -0.018, 0.04);
      addCylZ(root, 0.012, 0.013, 0.2, pbr.bluedSteel, 0, 0.036, 0.42, 10); // tri-lug barrel
      addCylY(root, 0.012, 0.012, 0.02, pbr.bluedSteel, 0, 0.075, 0.02, 8); // drum rear sight
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.075, 0.02, 0.36);
      // Retractable wire rails & buttplate
      addCylZ(root, 0.007, 0.007, 0.18, pbr.gunmetal, -0.022, 0.034, -0.11, 6);
      addCylZ(root, 0.007, 0.007, 0.18, pbr.gunmetal, 0.022, 0.034, -0.11, 6);
      addBox(root, 0.044, 0.095, 0.026, pbr.rubberGrip, 0, 0.014, -0.21);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.018, 0.165);
      addCurvedMagazine(mag, pbr.bluedSteel, 0.026, 0.042, 0.095, 0.3);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.polymerBlack, pbr.polymerBlack, -0.022, 0.064, 0.31);
      root.add(bolt);

      muzzle.position.set(0, 0.036, 0.53);
      eject.position.set(0.034, 0.04, 0.1);
      break;
    }

    case 'm1014': {
      // Tactical Benelli M1014 combat shotgun: ribbed barrel, full underbarrel mag tube, ghost-ring sight, pistol grip stock
      addBox(root, 0.054, 0.076, 0.28, pbr.bluedSteel, 0, 0.032, 0.11);
      addBox(root, 0.042, 0.09, 0.044, pbr.rubberGrip, 0, -0.066, -0.01, -0.24, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.042);
      addPicatinnyRail(root, pbr.gunmetal, 0.03, 0.18, 0.075, 0.11);
      // Polymer forend + barrel + underbarrel tube
      addBox(root, 0.052, 0.046, 0.24, pbr.polymerBlack, 0, 0.016, 0.37);
      addCylZ(root, 0.017, 0.018, 0.44, pbr.bluedSteel, 0, 0.052, 0.46, 10); // barrel
      addCylZ(root, 0.015, 0.015, 0.41, pbr.gunmetal, 0, 0.014, 0.44, 10); // shell tube
      // Collapsible pistol-grip tactical stock
      addCylZ(root, 0.017, 0.017, 0.2, pbr.gunmetal, 0, 0.026, -0.14, 10);
      addBox(root, 0.046, 0.092, 0.13, pbr.polymerBlack, 0, 0.008, -0.22);
      addBox(root, 0.048, 0.106, 0.028, pbr.rubberGrip, 0, 0.002, -0.285);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.084, 0.03, 0.65);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.002, 0.14);
      addCylZ(mag, 0.013, 0.013, 0.06, pbr.brass, 0, 0, 0, 8); // loading gate shell carrier
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.gunmetal, 0.028, 0.042, 0.13);
      root.add(bolt);

      muzzle.position.set(0, 0.052, 0.69);
      eject.position.set(0.038, 0.046, 0.13);
      break;
    }

    case 'm1887': {
      // True Double-Barrel Break-Action Shotgun (Side-by-side twin barrels + walnut stock + BreakActionPivot + twin chambered shells!)
      addBox(root, 0.058, 0.068, 0.16, pbr.gunmetal, 0, 0.022, 0.06); // sculpted break receiver
      addBox(root, 0.042, 0.054, 0.06, pbr.walnut, 0, -0.02, -0.02, -0.45, 0, 0);
      addBox(root, 0.042, 0.072, 0.24, pbr.walnut, 0, -0.022, -0.15, 0.2, 0, 0);
      addBox(root, 0.044, 0.104, 0.024, pbr.rubberGrip, 0, -0.046, -0.27, 0.2, 0, 0);
      addTriggerAssembly(root, pbr.bluedSteel, -0.022, 0.032);
      addBox(root, 0.012, 0.014, 0.048, pbr.chrome, 0, 0.062, 0.02); // top opening lever

      // Hinge pivot at receiver front
      const breakPivot = new THREE.Group();
      breakPivot.name = 'BreakActionPivot';
      breakPivot.position.set(0, 0.022, 0.14);
      // Twin side-by-side barrels + mid rib + walnut forend
      addCylZ(breakPivot, 0.016, 0.017, 0.52, pbr.bluedSteel, -0.018, 0.018, 0.26, 10);
      addCylZ(breakPivot, 0.016, 0.017, 0.52, pbr.bluedSteel, 0.018, 0.018, 0.26, 10);
      addBox(breakPivot, 0.012, 0.014, 0.51, pbr.bluedSteel, 0, 0.032, 0.26); // top sighting rib
      addBox(breakPivot, 0.054, 0.036, 0.22, pbr.walnut, 0, -0.008, 0.14); // forend
      addBox(breakPivot, 0.007, 0.009, 0.009, pbr.brass, 0, 0.042, 0.505); // brass bead sight

      // Twin removable 12-gauge shells seated at breech
      const shellL = new THREE.Group();
      shellL.name = 'ShellLeft';
      shellL.position.set(-0.018, 0.018, 0.02);
      addCylZ(shellL, 0.013, 0.013, 0.052, pbr.shellHull, 0, 0, 0.018, 8);
      addCylZ(shellL, 0.0145, 0.0145, 0.015, pbr.brass, 0, 0, -0.012, 8);

      const shellR = new THREE.Group();
      shellR.name = 'ShellRight';
      shellR.position.set(0.018, 0.018, 0.02);
      addCylZ(shellR, 0.013, 0.013, 0.052, pbr.shellHull, 0, 0, 0.018, 8);
      addCylZ(shellR, 0.0145, 0.0145, 0.015, pbr.brass, 0, 0, -0.012, 8);

      breakPivot.add(shellL, shellR);
      root.add(breakPivot);

      muzzle.position.set(0, 0.04, 0.675);
      eject.position.set(0, 0.055, 0.13);
      break;
    }

    case 'desert_eagle': {
      // Heavy brushed-chrome .50 AE magnum pistol: fixed triangular barrel shroud, reciprocating slide, rubber grip
      addBox(root, 0.038, 0.03, 0.25, pbr.chrome, 0, 0.012, 0.095); // lower frame
      addBox(root, 0.04, 0.092, 0.048, pbr.rubberGrip, 0, -0.056, -0.008, -0.24, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.014, 0.046);
      // Heavy triangular fixed forward barrel shroud
      addBox(root, 0.036, 0.042, 0.11, pbr.chrome, 0, 0.042, 0.185);
      addCylZ(root, 0.013, 0.013, 0.04, pbr.bluedSteel, 0, 0.046, 0.245, 10);

      // Reciprocating rear slide
      const slide = new THREE.Group();
      slide.name = 'SlideNode';
      addBox(slide, 0.038, 0.044, 0.175, pbr.chrome, 0, 0.044, 0.055);
      addIronSights(slide, pbr.bluedSteel, pbr.sightDot, 0.068, -0.02, 0.22);
      root.add(slide);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.062, -0.008);
      addBox(mag, 0.028, 0.095, 0.038, pbr.gunmetal, 0, 0, 0, -0.24, 0, 0);
      addBox(mag, 0.038, 0.014, 0.046, pbr.chrome, 0, -0.052, -0.012, -0.24, 0, 0);
      root.add(mag);

      muzzle.position.set(0, 0.046, 0.268);
      eject.position.set(0.026, 0.052, 0.08);
      break;
    }

    case 'glock': {
      // Compact modern polymer 9mm pistol: matte polymer frame, rail dustcover, boxy steel reciprocating slide
      addBox(root, 0.032, 0.026, 0.185, pbr.polymerBlack, 0, 0.01, 0.068);
      addBox(root, 0.034, 0.084, 0.042, pbr.rubberGrip, 0, -0.05, -0.008, -0.26, 0, 0);
      addTriggerAssembly(root, pbr.polymerBlack, -0.012, 0.042);

      const slide = new THREE.Group();
      slide.name = 'SlideNode';
      addBox(slide, 0.031, 0.036, 0.195, pbr.bluedSteel, 0, 0.036, 0.068);
      addCylZ(slide, 0.009, 0.009, 0.02, pbr.chrome, 0, 0.036, 0.168, 8);
      addIronSights(slide, pbr.gunmetal, pbr.sightDot, 0.057, -0.018, 0.155);
      root.add(slide);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.054, -0.008);
      addBox(mag, 0.024, 0.088, 0.034, pbr.gunmetal, 0, 0, 0, -0.26, 0, 0);
      addBox(mag, 0.032, 0.012, 0.04, pbr.polymerBlack, 0, -0.046, -0.012, -0.26, 0, 0);
      root.add(mag);

      muzzle.position.set(0, 0.036, 0.182);
      eject.position.set(0.024, 0.044, 0.075);
      break;
    }

    case 'combat_knife': {
      // Tactical clip-point / tanto combat knife aligned cleanly along grip -> +Y/+Z slash arc
      const knifeGroup = new THREE.Group();
      knifeGroup.position.set(0, -0.025, 0.015);
      knifeGroup.rotation.x = 0.42;

      // Grooved rubberized handle + steel skull-crusher pommel + crossguard
      addCylY(knifeGroup, 0.019, 0.017, 0.135, pbr.rubberGrip, 0, 0, 0, 10);
      addCylY(knifeGroup, 0.021, 0.018, 0.024, pbr.gunmetal, 0, -0.075, 0, 10);
      addBox(knifeGroup, 0.026, 0.016, 0.068, pbr.gunmetal, 0, 0.074, 0.006);

      // Tapered bevel titanium/steel blade
      addBox(knifeGroup, 0.007, 0.17, 0.036, pbr.chrome, 0, 0.168, 0.008);
      addBox(knifeGroup, 0.005, 0.07, 0.026, pbr.chrome, 0, 0.275, 0.003, -0.18, 0, 0); // clip point tip
      addBox(knifeGroup, 0.008, 0.13, 0.009, pbr.gunmetal, 0, 0.165, -0.01); // dark spine fuller
      root.add(knifeGroup);

      muzzle.position.set(0, 0.16, 0.24);
      eject.position.set(0, 0.08, 0.12);
      break;
    }

    case 'baseball_bat': {
      // Lathe-turned ash wood bat with rubberized black grip tape & pommel knob
      const batGroup = new THREE.Group();
      batGroup.position.set(0, -0.02, 0.02);
      batGroup.rotation.x = 0.56;

      const profile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.024, 0.0),
        new THREE.Vector2(0.024, 0.016),
        new THREE.Vector2(0.015, 0.028),
        new THREE.Vector2(0.0155, 0.24),
        new THREE.Vector2(0.021, 0.44),
        new THREE.Vector2(0.034, 0.64),
        new THREE.Vector2(0.035, 0.77),
        new THREE.Vector2(0.028, 0.805),
        new THREE.Vector2(0.0, 0.815),
      ];
      const latheGeo = cachedGeo('bat-lathe', () => new THREE.LatheGeometry(profile, 14));
      const woodBody = new THREE.Mesh(latheGeo, pbr.ashWood);
      woodBody.position.y = -0.11;
      woodBody.castShadow = true;

      // Dark grip tape wrap covering handle section
      addCylY(batGroup, 0.0168, 0.0162, 0.21, pbr.rubberGrip, 0, 0.02, 0, 12);
      addCylY(batGroup, 0.0355, 0.0355, 0.016, pbr.gunmetal, 0, 0.58, 0, 12); // pro barrel ring accent
      batGroup.add(woodBody);
      root.add(batGroup);

      muzzle.position.set(0, 0.48, 0.42);
      eject.position.set(0, 0.18, 0.15);
      break;
    }

    case 'famas': {
      // French bullpup FAMAS F1: tall carrying handle shroud, rear bullpup mag, folded bipod legs
      addBox(root, 0.052, 0.072, 0.46, pbr.polymerBlack, 0, 0.032, 0.04);
      addBox(root, 0.046, 0.095, 0.044, pbr.rubberGrip, 0, -0.068, 0.02, -0.24, 0, 0);
      addTriggerAssembly(root, pbr.polymerBlack, -0.02, 0.07);
      // Iconic long top carrying handle arch
      addBox(root, 0.038, 0.018, 0.34, pbr.polymerBlack, 0, 0.105, 0.06);
      addBox(root, 0.036, 0.036, 0.045, pbr.polymerBlack, 0, 0.082, -0.08);
      addBox(root, 0.036, 0.036, 0.045, pbr.polymerBlack, 0, 0.082, 0.21);
      addPicatinnyRail(root, pbr.gunmetal, 0.028, 0.22, 0.118, 0.06);
      addIronSights(root, pbr.gunmetal, pbr.sightDot, 0.128, -0.07, 0.2);
      // Bullpup buttplate & barrel + folded side bipod legs
      addBox(root, 0.052, 0.11, 0.036, pbr.rubberGrip, 0, 0.015, -0.205);
      addCylZ(root, 0.013, 0.015, 0.32, pbr.bluedSteel, 0, 0.042, 0.42, 10);
      addCylZ(root, 0.017, 0.014, 0.048, pbr.gunmetal, 0, 0.042, 0.59, 8);
      addCylZ(root, 0.008, 0.008, 0.22, pbr.gunmetal, -0.032, 0.04, 0.36, 6);
      addCylZ(root, 0.008, 0.008, 0.22, pbr.gunmetal, 0.032, 0.04, 0.36, 6);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.02, -0.095);
      addBox(mag, 0.03, 0.16, 0.064, pbr.gunmetal, 0, -0.072, 0, 0.08, 0, 0);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, 0, 0.084, 0.06);
      root.add(bolt);

      muzzle.position.set(0, 0.042, 0.625);
      eject.position.set(0.034, 0.044, -0.09);
      break;
    }

    case 'aug': {
      // Steyr AUG olive bullpup chassis: integral 2x tactical optic, vertical foregrip, curved rear bullpup mag
      addBox(root, 0.054, 0.078, 0.44, pbr.oliveChassis, 0, 0.03, 0.03);
      addBox(root, 0.046, 0.115, 0.04, pbr.rubberGrip, 0, 0.016, -0.205);
      addBox(root, 0.042, 0.09, 0.044, pbr.oliveChassis, 0, -0.065, 0.035, -0.24, 0, 0);
      addTriggerAssembly(root, pbr.oliveChassis, -0.018, 0.085);
      // Folding vertical foregrip
      addBox(root, 0.028, 0.072, 0.03, pbr.polymerBlack, 0, -0.035, 0.25, 0.12, 0, 0);
      // Sleek barrel + tulip flash hider
      addCylZ(root, 0.014, 0.016, 0.34, pbr.bluedSteel, 0, 0.044, 0.41, 10);
      addCylZ(root, 0.018, 0.015, 0.052, pbr.gunmetal, 0, 0.044, 0.59, 8);
      addPicatinnyRail(root, pbr.gunmetal, 0.03, 0.2, 0.076, 0.12);
      addOpticalScope(root, pbr, 'tactical', 0.104, 0.12);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.02, -0.105);
      addCurvedMagazine(mag, pbr.bakelite, 0.03, 0.064, 0.078, 0.15);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.polymerBlack, pbr.polymerBlack, -0.03, 0.055, 0.16);
      root.add(bolt);

      muzzle.position.set(0, 0.044, 0.625);
      eject.position.set(0.034, 0.044, -0.1);
      break;
    }

    case 'groza': {
      // OTs-14 Groza: compact Russian bullpup, carry handle rail + reflex optic, bakelite grip, suppressed barrel shroud
      addBox(root, 0.052, 0.072, 0.38, pbr.bluedSteel, 0, 0.032, 0.04);
      addBox(root, 0.042, 0.09, 0.042, pbr.bakelite, 0, -0.065, 0.17, -0.26, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.018, 0.21);
      addBox(root, 0.048, 0.108, 0.034, pbr.rubberGrip, 0, 0.016, -0.165);
      // Carry handle & reflex sight
      addBox(root, 0.032, 0.016, 0.24, pbr.gunmetal, 0, 0.098, 0.08);
      addBox(root, 0.03, 0.03, 0.035, pbr.gunmetal, 0, 0.078, -0.02);
      addBox(root, 0.03, 0.03, 0.035, pbr.gunmetal, 0, 0.078, 0.18);
      addOpticalScope(root, pbr, 'reflex', 0.124, 0.08);
      // Integrated tactical suppressor shroud
      addCylZ(root, 0.022, 0.022, 0.26, pbr.polymerBlack, 0, 0.038, 0.36, 12);
      addCylZ(root, 0.014, 0.015, 0.04, pbr.gunmetal, 0, 0.038, 0.5, 10);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.018, -0.02);
      addCurvedMagazine(mag, pbr.bakelite, 0.034, 0.066, 0.09, 0.32);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.chrome, 0.028, 0.046, 0.08);
      root.add(bolt);

      muzzle.position.set(0, 0.038, 0.525);
      eject.position.set(0.034, 0.044, -0.02);
      break;
    }

    case 'an94': {
      // AN-94 Abakan: sleek dark polymer AK-descendant with canted magwell, ribbed dustcover, heavy muzzle brake
      addBox(root, 0.05, 0.068, 0.34, pbr.polymerBlack, 0, 0.036, 0.12);
      addBox(root, 0.044, 0.026, 0.26, pbr.gunmetal, 0, 0.072, 0.1);
      addBox(root, 0.038, 0.09, 0.042, pbr.rubberGrip, 0, -0.068, -0.01, -0.3, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.018, 0.042);
      addBox(root, 0.046, 0.052, 0.22, pbr.polymerBlack, 0, 0.032, 0.37);
      addCylZ(root, 0.013, 0.015, 0.32, pbr.bluedSteel, 0, 0.04, 0.54, 10);
      addBox(root, 0.022, 0.026, 0.058, pbr.gunmetal, 0, 0.04, 0.71); // dual-chamber brake
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.092, 0.02, 0.55);
      // Side-folding polymer stock
      addBox(root, 0.042, 0.068, 0.22, pbr.polymerBlack, 0, 0.018, -0.16, 0.1, 0, 0);
      addBox(root, 0.044, 0.1, 0.026, pbr.rubberGrip, 0, 0.002, -0.275);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0.006, -0.016, 0.165);
      mag.rotation.z = -0.1; // signature slight cant
      addCurvedMagazine(mag, pbr.polymerBlack, 0.032, 0.064, 0.088, 0.24);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, 0.027, 0.048, 0.14);
      root.add(bolt);

      muzzle.position.set(0, 0.04, 0.745);
      eject.position.set(0.036, 0.048, 0.12);
      break;
    }

    case 'vector': {
      // KRISS Vector: deep V-system Super-V lower housing, long angled front stick mag, folding skeleton stock
      addBox(root, 0.052, 0.062, 0.32, pbr.polymerBlack, 0, 0.042, 0.14);
      addBox(root, 0.048, 0.088, 0.14, pbr.gunmetal, 0, -0.028, 0.19); // V-recoil housing
      addBox(root, 0.038, 0.088, 0.042, pbr.rubberGrip, 0, -0.062, -0.005, -0.28, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.014, 0.046);
      addPicatinnyRail(root, pbr.gunmetal, 0.032, 0.28, 0.078, 0.15);
      addIronSights(root, pbr.gunmetal, pbr.sightDot, 0.092, 0.02, 0.28);
      addCylZ(root, 0.015, 0.016, 0.15, pbr.bluedSteel, 0, 0.034, 0.36, 10);
      // Lightweight folding stock
      addBox(root, 0.026, 0.018, 0.19, pbr.polymerBlack, 0, 0.048, -0.11);
      addBox(root, 0.036, 0.095, 0.026, pbr.rubberGrip, 0, 0.012, -0.21);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.06, 0.175);
      addBox(mag, 0.028, 0.21, 0.04, pbr.gunmetal, 0, -0.09, 0, -0.22, 0, 0);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, -0.028, 0.048, 0.22);
      root.add(bolt);

      muzzle.position.set(0, 0.034, 0.44);
      eject.position.set(0.034, 0.044, 0.14);
      break;
    }

    case 'p90': {
      // FN P90: futuristic bullpup thumbhole body, top-mounted horizontal 50-rd translucent/smoke mag, elevated rail
      addBox(root, 0.052, 0.082, 0.43, pbr.polymerBlack, 0, 0.018, 0.05);
      addBox(root, 0.044, 0.052, 0.12, pbr.polymerBlack, 0, -0.048, 0.09, -0.22, 0, 0);
      addBox(root, 0.042, 0.054, 0.14, pbr.polymerBlack, 0, -0.048, 0.22, 0.22, 0, 0); // front grip bridge
      addTriggerAssembly(root, pbr.polymerBlack, -0.02, 0.11);
      addBox(root, 0.048, 0.11, 0.03, pbr.rubberGrip, 0, 0.012, -0.17);
      // Elevated optical bridge + stubby flash hider
      addBox(root, 0.034, 0.042, 0.13, pbr.gunmetal, 0, 0.084, 0.2);
      addPicatinnyRail(root, pbr.gunmetal, 0.028, 0.12, 0.108, 0.2);
      addIronSights(root, pbr.gunmetal, pbr.sightDot, 0.12, 0.15, 0.25);
      addCylZ(root, 0.014, 0.015, 0.12, pbr.bluedSteel, 0, 0.034, 0.31, 10);

      // Horizontal top-feeding P90 magazine!
      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, 0.066, 0.04);
      addBox(mag, 0.042, 0.026, 0.26, pbr.gunmetal, 0, 0, 0);
      addBox(mag, 0.036, 0.014, 0.22, pbr.brass, 0, -0.002, 0); // visible brass 5.7mm rounds
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.gunmetal, pbr.polymerBlack, -0.028, 0.058, 0.23);
      root.add(bolt);

      muzzle.position.set(0, 0.034, 0.38);
      eject.position.set(0, -0.032, -0.04);
      break;
    }

    case 'thompson': {
      // M1928 Thompson SMG: walnut stock & horizontal forend, finned barrel + compensator, iconic drum mag!
      addBox(root, 0.052, 0.068, 0.3, pbr.bluedSteel, 0, 0.038, 0.1);
      addBox(root, 0.038, 0.09, 0.044, pbr.walnut, 0, -0.068, -0.005, -0.28, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.018, 0.042);
      // Walnut horizontal handguard + sculpted buttstock
      addBox(root, 0.044, 0.042, 0.18, pbr.walnut, 0, 0.008, 0.31);
      addBox(root, 0.042, 0.076, 0.24, pbr.walnut, 0, 0.0, -0.16, 0.2, 0, 0);
      addBox(root, 0.044, 0.106, 0.022, pbr.gunmetal, 0, -0.022, -0.28, 0.2, 0, 0);
      // Finned barrel & Cutts compensator
      addCylZ(root, 0.014, 0.016, 0.28, pbr.bluedSteel, 0, 0.042, 0.38, 10);
      addCylZ(root, 0.019, 0.019, 0.065, pbr.gunmetal, 0, 0.042, 0.33, 10);
      addCylZ(root, 0.017, 0.015, 0.05, pbr.bluedSteel, 0, 0.042, 0.54, 8);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.078, -0.01, 0.52);

      // Signature underside drum magazine
      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.058, 0.155);
      addCylZ(mag, 0.088, 0.088, 0.046, pbr.bluedSteel, 0, 0, 0, 16);
      addCylZ(mag, 0.032, 0.032, 0.052, pbr.gunmetal, 0, 0, 0, 12);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.chrome, 0, 0.078, 0.1);
      root.add(bolt);

      muzzle.position.set(0, 0.042, 0.57);
      eject.position.set(0.034, 0.046, 0.11);
      break;
    }

    case 'spas12': {
      // Franchi SPAS-12 combat shotgun: ventilated perforated heatshield, heavy folding hook stock, pump forend
      addBox(root, 0.056, 0.078, 0.3, pbr.bluedSteel, 0, 0.034, 0.12);
      addBox(root, 0.042, 0.09, 0.044, pbr.rubberGrip, 0, -0.066, -0.01, -0.24, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.042);
      // Ventilated barrel shroud + heavy ribbed pump + full underbarrel shell tube
      addBox(root, 0.048, 0.034, 0.34, pbr.gunmetal, 0, 0.058, 0.41);
      addBox(root, 0.054, 0.048, 0.22, pbr.polymerBlack, 0, 0.014, 0.38);
      addCylZ(root, 0.016, 0.017, 0.46, pbr.bluedSteel, 0, 0.052, 0.48, 10);
      addCylZ(root, 0.015, 0.015, 0.43, pbr.gunmetal, 0, 0.014, 0.46, 10);
      // Iconic folded top metal frame stock + rear butt hook
      addBox(root, 0.046, 0.016, 0.34, pbr.gunmetal, 0, 0.086, 0.16);
      addBox(root, 0.046, 0.09, 0.028, pbr.gunmetal, 0, 0.035, -0.16, -0.22, 0, 0);
      addBox(root, 0.048, 0.098, 0.026, pbr.rubberGrip, 0, 0.012, -0.26);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.096, 0.02, 0.66);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.002, 0.15);
      addCylZ(mag, 0.013, 0.013, 0.06, pbr.shellHull, 0, 0, 0, 8);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.gunmetal, 0.028, 0.044, 0.14);
      root.add(bolt);

      muzzle.position.set(0, 0.052, 0.72);
      eject.position.set(0.038, 0.048, 0.14);
      break;
    }

    case 'double_barrel': {
      // Compact Coach Double-Barrel Sawed-Off Shotgun: over/side twin dark barrels, walnut stock, BreakActionPivot + twin shells
      addBox(root, 0.058, 0.066, 0.15, pbr.bluedSteel, 0, 0.022, 0.06);
      addBox(root, 0.04, 0.068, 0.17, pbr.walnut, 0, -0.028, -0.1, 0.32, 0, 0); // compact pistol-grip coach butt
      addTriggerAssembly(root, pbr.gunmetal, -0.022, 0.032);
      addBox(root, 0.012, 0.014, 0.046, pbr.chrome, 0, 0.06, 0.02);

      const breakPivot = new THREE.Group();
      breakPivot.name = 'BreakActionPivot';
      breakPivot.position.set(0, 0.022, 0.135);
      addCylZ(breakPivot, 0.0165, 0.0175, 0.42, pbr.gunmetal, -0.018, 0.018, 0.21, 10);
      addCylZ(breakPivot, 0.0165, 0.0175, 0.42, pbr.gunmetal, 0.018, 0.018, 0.21, 10);
      addBox(breakPivot, 0.012, 0.014, 0.41, pbr.gunmetal, 0, 0.032, 0.21);
      addBox(breakPivot, 0.054, 0.034, 0.19, pbr.walnut, 0, -0.008, 0.12);
      addBox(breakPivot, 0.007, 0.009, 0.009, pbr.brass, 0, 0.042, 0.405);

      const shellL = new THREE.Group();
      shellL.name = 'ShellLeft';
      shellL.position.set(-0.018, 0.018, 0.02);
      addCylZ(shellL, 0.013, 0.013, 0.052, pbr.shellHull, 0, 0, 0.018, 8);
      addCylZ(shellL, 0.0145, 0.0145, 0.015, pbr.brass, 0, 0, -0.012, 8);

      const shellR = new THREE.Group();
      shellR.name = 'ShellRight';
      shellR.position.set(0.018, 0.018, 0.02);
      addCylZ(shellR, 0.013, 0.013, 0.052, pbr.shellHull, 0, 0, 0.018, 8);
      addCylZ(shellR, 0.0145, 0.0145, 0.015, pbr.brass, 0, 0, -0.012, 8);

      breakPivot.add(shellL, shellR);
      root.add(breakPivot);

      muzzle.position.set(0, 0.04, 0.565);
      eject.position.set(0, 0.055, 0.125);
      break;
    }

    case 'm24': {
      // M24 Sniper Weapon System: matte graphite synthetic stock, fluted steel barrel, bipod, bolt-action + 8x scope
      addBox(root, 0.052, 0.068, 0.44, pbr.polymerBlack, 0, 0.028, 0.16);
      addBox(root, 0.044, 0.04, 0.27, pbr.bluedSteel, 0, 0.068, 0.13);
      addBox(root, 0.042, 0.086, 0.046, pbr.polymerBlack, 0, -0.044, -0.025, -0.46, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.042);
      addBox(root, 0.046, 0.072, 0.25, pbr.polymerBlack, 0, 0.018, -0.16);
      addBox(root, 0.048, 0.104, 0.03, pbr.rubberGrip, 0, 0.008, -0.29);
      addBox(root, 0.04, 0.022, 0.12, pbr.gunmetal, 0, 0.058, -0.15);
      // Heavy free-float barrel + folded bipod
      addCylZ(root, 0.015, 0.018, 0.56, pbr.bluedSteel, 0, 0.056, 0.61, 12);
      addCylZ(root, 0.018, 0.016, 0.055, pbr.gunmetal, 0, 0.056, 0.905, 10);
      addCylZ(root, 0.01, 0.01, 0.18, pbr.gunmetal, -0.034, -0.006, 0.42, 8);
      addCylZ(root, 0.01, 0.01, 0.18, pbr.gunmetal, 0.034, -0.006, 0.42, 8);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.018, 0.16);
      addBox(mag, 0.032, 0.115, 0.082, pbr.gunmetal, 0, -0.045, 0, 0.04, 0, 0);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, 0.025, 0.068, 0.07);
      root.add(bolt);
      addPicatinnyRail(root, pbr.gunmetal, 0.028, 0.2, 0.092, 0.12);
      addOpticalScope(root, pbr, 'sniper', 0.12, 0.12);

      muzzle.position.set(0, 0.056, 0.94);
      eject.position.set(0.036, 0.07, 0.13);
      break;
    }

    case 'svd': {
      // Classic Dragunov SVD: stamped steel receiver, vented walnut handguard, skeleton walnut thumbhole stock, PSO optic
      addBox(root, 0.048, 0.064, 0.34, pbr.bluedSteel, 0, 0.034, 0.11);
      addBox(root, 0.042, 0.054, 0.24, pbr.walnut, 0, 0.03, 0.39);
      addBox(root, 0.038, 0.086, 0.042, pbr.walnut, 0, -0.06, -0.01, -0.28, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.018, 0.04);
      // Skeletonized walnut buttstock
      addBox(root, 0.038, 0.024, 0.22, pbr.walnut, 0, 0.034, -0.16);
      addBox(root, 0.038, 0.022, 0.2, pbr.walnut, 0, -0.048, -0.15, -0.1, 0, 0);
      addBox(root, 0.04, 0.104, 0.032, pbr.walnut, 0, -0.004, -0.27);
      addBox(root, 0.038, 0.022, 0.11, pbr.rubberGrip, 0, 0.056, -0.16);
      // Long barrel + slotted SVD flash hider
      addCylZ(root, 0.012, 0.014, 0.44, pbr.bluedSteel, 0, 0.042, 0.68, 10);
      addCylZ(root, 0.016, 0.014, 0.068, pbr.gunmetal, 0, 0.042, 0.92, 8);
      addBox(root, 0.018, 0.036, 0.024, pbr.bluedSteel, 0, 0.062, 0.87); // front sight

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.02, 0.165);
      addCurvedMagazine(mag, pbr.gunmetal, 0.032, 0.07, 0.065, 0.15);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.gunmetal, 0.025, 0.046, 0.13);
      root.add(bolt);
      addOpticalScope(root, pbr, 'marksman', 0.104, 0.1);

      muzzle.position.set(0, 0.042, 0.96);
      eject.position.set(0.034, 0.048, 0.12);
      break;
    }

    case 'vss': {
      // VSS Vintorez: wide matte integral suppressor barrel, compact walnut skeleton stock, elevated marksman optic
      addBox(root, 0.048, 0.062, 0.24, pbr.bluedSteel, 0, 0.034, 0.08);
      addBox(root, 0.042, 0.048, 0.15, pbr.polymerBlack, 0, 0.016, 0.24);
      addBox(root, 0.036, 0.084, 0.04, pbr.walnut, 0, -0.056, -0.008, -0.28, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.018, 0.04);
      // Compact VSS walnut skeleton stock
      addBox(root, 0.038, 0.022, 0.2, pbr.walnut, 0, 0.028, -0.15);
      addBox(root, 0.038, 0.02, 0.18, pbr.walnut, 0, -0.045, -0.14, -0.1, 0, 0);
      addBox(root, 0.04, 0.098, 0.028, pbr.rubberGrip, 0, -0.006, -0.25);
      // Massive integral suppressor
      addCylZ(root, 0.024, 0.024, 0.42, pbr.polymerBlack, 0, 0.044, 0.41, 14);
      addCylZ(root, 0.022, 0.022, 0.025, pbr.gunmetal, 0, 0.044, 0.63, 12);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.016, 0.14);
      addCurvedMagazine(mag, pbr.polymerBlack, 0.03, 0.06, 0.072, 0.16);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.gunmetal, 0.025, 0.044, 0.1);
      root.add(bolt);
      addOpticalScope(root, pbr, 'marksman', 0.104, 0.08);

      muzzle.position.set(0, 0.044, 0.65);
      eject.position.set(0.034, 0.048, 0.09);
      break;
    }

    case 'dragunov': {
      // SVDS Modern Tactical Dragunov: obsidian polymer chassis, folding frame stock, long rail & marksman optic
      addBox(root, 0.05, 0.068, 0.36, pbr.polymerBlack, 0, 0.036, 0.12);
      addBox(root, 0.044, 0.056, 0.25, pbr.gunmetal, 0, 0.032, 0.4);
      addBox(root, 0.038, 0.088, 0.042, pbr.rubberGrip, 0, -0.066, -0.01, -0.26, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.018, 0.042);
      addPicatinnyRail(root, pbr.gunmetal, 0.03, 0.32, 0.076, 0.14);
      // Folding tubular frame stock with cheek pad
      addCylZ(root, 0.01, 0.01, 0.22, pbr.gunmetal, 0, 0.046, -0.16, 8);
      addCylZ(root, 0.009, 0.009, 0.21, pbr.gunmetal, 0, -0.012, -0.16, 8);
      addBox(root, 0.042, 0.022, 0.12, pbr.polymerBlack, 0, 0.062, -0.15);
      addBox(root, 0.04, 0.105, 0.03, pbr.rubberGrip, 0, 0.014, -0.27);
      // Long heavy barrel + muzzle brake
      addCylZ(root, 0.013, 0.015, 0.46, pbr.bluedSteel, 0, 0.042, 0.69, 10);
      addCylZ(root, 0.018, 0.015, 0.07, pbr.gunmetal, 0, 0.042, 0.94, 10);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.02, 0.17);
      addCurvedMagazine(mag, pbr.polymerBlack, 0.032, 0.07, 0.07, 0.14);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, 0.026, 0.048, 0.14);
      root.add(bolt);
      addOpticalScope(root, pbr, 'marksman', 0.106, 0.11);

      muzzle.position.set(0, 0.042, 0.98);
      eject.position.set(0.034, 0.048, 0.13);
      break;
    }

    case 'usp': {
      // HK USP Tactical: angular polymer frame, dark flat-top slide, threaded suppressor-ready barrel
      addBox(root, 0.033, 0.028, 0.195, pbr.polymerBlack, 0, 0.01, 0.072);
      addBox(root, 0.035, 0.086, 0.043, pbr.rubberGrip, 0, -0.052, -0.008, -0.26, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.013, 0.044);

      const slide = new THREE.Group();
      slide.name = 'SlideNode';
      addBox(slide, 0.032, 0.038, 0.205, pbr.gunmetal, 0, 0.038, 0.07);
      addCylZ(slide, 0.011, 0.011, 0.038, pbr.bluedSteel, 0, 0.038, 0.186, 10);
      addIronSights(slide, pbr.bluedSteel, pbr.sightDot, 0.06, -0.02, 0.16);
      root.add(slide);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.056, -0.008);
      addBox(mag, 0.025, 0.09, 0.035, pbr.gunmetal, 0, 0, 0, -0.26, 0, 0);
      addBox(mag, 0.033, 0.012, 0.041, pbr.polymerBlack, 0, -0.047, -0.012, -0.26, 0, 0);
      root.add(mag);

      muzzle.position.set(0, 0.038, 0.21);
      eject.position.set(0.025, 0.046, 0.075);
      break;
    }

    case 'm1917': {
      // M1917 .45 Revolver: brushed steel frame, fluted barrel + top rib, walnut grip, rotating 6-shot cylinder
      addBox(root, 0.032, 0.048, 0.13, pbr.chrome, 0, 0.024, 0.065);
      addBox(root, 0.036, 0.088, 0.044, pbr.walnut, 0, -0.046, -0.016, -0.36, 0, 0);
      addTriggerAssembly(root, pbr.bluedSteel, -0.014, 0.04);
      // Heavy revolver barrel + top rib + underlug ejector shroud
      addCylZ(root, 0.014, 0.015, 0.16, pbr.chrome, 0, 0.042, 0.2, 10);
      addBox(root, 0.014, 0.012, 0.15, pbr.chrome, 0, 0.055, 0.195);
      addCylZ(root, 0.008, 0.008, 0.12, pbr.gunmetal, 0, 0.024, 0.18, 8);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.066, 0.01, 0.265);

      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, 0.032, 0.072);
      addCylZ(mag, 0.024, 0.024, 0.052, pbr.gunmetal, 0, 0, 0, 12);
      addCylZ(mag, 0.01, 0.01, 0.054, pbr.brass, -0.011, 0.008, 0, 6);
      addCylZ(mag, 0.01, 0.01, 0.054, pbr.brass, 0.011, 0.008, 0, 6);
      addCylZ(mag, 0.01, 0.01, 0.054, pbr.brass, -0.011, -0.008, 0, 6);
      addCylZ(mag, 0.01, 0.01, 0.054, pbr.brass, 0.011, -0.008, 0, 6);
      root.add(mag);

      muzzle.position.set(0, 0.042, 0.29);
      eject.position.set(-0.028, 0.034, 0.072);
      break;
    }

    case 'm249': {
      // M249 SAW LMG: heavy box receiver + feed tray cover, perforated shroud, bipod, carrying handle, 100-rd belt box
      addBox(root, 0.066, 0.086, 0.38, pbr.gunmetal, 0, 0.038, 0.14);
      addBox(root, 0.058, 0.024, 0.2, pbr.bluedSteel, 0, 0.088, 0.13); // feed tray top cover
      addBox(root, 0.042, 0.092, 0.046, pbr.rubberGrip, 0, -0.068, -0.01, -0.24, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.045);
      // Perforated forend + heavy barrel + gas tube + folded bipod + carry handle
      addBox(root, 0.064, 0.062, 0.24, pbr.polymerBlack, 0, 0.028, 0.42);
      addCylZ(root, 0.016, 0.018, 0.44, pbr.bluedSteel, 0, 0.052, 0.54, 10);
      addCylZ(root, 0.02, 0.016, 0.058, pbr.gunmetal, 0, 0.052, 0.77, 10);
      addBox(root, 0.016, 0.045, 0.08, pbr.gunmetal, 0.025, 0.095, 0.36, 0, 0, -0.35);
      addCylZ(root, 0.011, 0.011, 0.22, pbr.gunmetal, -0.04, -0.012, 0.48, 8);
      addCylZ(root, 0.011, 0.011, 0.22, pbr.gunmetal, 0.04, -0.012, 0.48, 8);
      addPicatinnyRail(root, pbr.gunmetal, 0.034, 0.18, 0.104, 0.12);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.116, 0.04, 0.72);
      // Tubular SAW buttstock
      addBox(root, 0.052, 0.072, 0.24, pbr.polymerBlack, 0, 0.028, -0.17);
      addBox(root, 0.054, 0.112, 0.032, pbr.rubberGrip, 0, 0.012, -0.295);

      // 100-rd belt box + brass ammo belt feed
      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, -0.052, 0.17);
      addBox(mag, 0.096, 0.115, 0.125, pbr.oliveChassis, 0, -0.02, 0);
      addBox(mag, 0.018, 0.07, 0.082, pbr.brass, -0.042, 0.05, 0, 0, 0, -0.2);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.polymerBlack, 0.034, 0.052, 0.16);
      root.add(bolt);

      muzzle.position.set(0, 0.052, 0.81);
      eject.position.set(0.044, 0.052, 0.14);
      break;
    }

    case 'm60': {
      // M60 General-Purpose Machine Gun: heavy rectangular receiver, vented forearm, front bipod, side ammo pouch
      addBox(root, 0.068, 0.088, 0.42, pbr.bluedSteel, 0, 0.038, 0.14);
      addBox(root, 0.042, 0.092, 0.046, pbr.rubberGrip, 0, -0.068, -0.01, -0.22, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.02, 0.045);
      addBox(root, 0.066, 0.064, 0.24, pbr.polymerBlack, 0, 0.032, 0.43);
      addCylZ(root, 0.017, 0.019, 0.46, pbr.bluedSteel, 0, 0.054, 0.56, 10);
      addCylZ(root, 0.022, 0.017, 0.06, pbr.gunmetal, 0, 0.054, 0.8, 10);
      addCylZ(root, 0.012, 0.012, 0.24, pbr.gunmetal, -0.042, -0.01, 0.58, 8);
      addCylZ(root, 0.012, 0.012, 0.24, pbr.gunmetal, 0.042, -0.01, 0.58, 8);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.098, 0.03, 0.72);
      // Heavy inline buttstock
      addBox(root, 0.056, 0.088, 0.24, pbr.polymerBlack, 0, 0.024, -0.18);
      addBox(root, 0.058, 0.115, 0.03, pbr.rubberGrip, 0, 0.014, -0.305);

      // Left-hanging 75-rd belt pouch + brass belt
      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(-0.065, -0.03, 0.18);
      addBox(mag, 0.072, 0.11, 0.12, pbr.oliveChassis, 0, -0.025, 0);
      addBox(mag, 0.046, 0.024, 0.084, pbr.brass, 0.026, 0.048, 0, 0, 0, 0.4);
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.gunmetal, 0.035, 0.054, 0.16);
      root.add(bolt);

      muzzle.position.set(0, 0.054, 0.84);
      eject.position.set(0.046, 0.052, 0.15);
      break;
    }

    case 'dp28': {
      // DP-28 Soviet LMG: slender cylindrical barrel shroud, conical flash hider, walnut rifle butt, signature TOP PAN DRUM!
      addBox(root, 0.054, 0.062, 0.34, pbr.bluedSteel, 0, 0.032, 0.12);
      addBox(root, 0.04, 0.074, 0.06, pbr.walnut, 0, -0.036, -0.03, -0.52, 0, 0);
      addBox(root, 0.044, 0.078, 0.24, pbr.walnut, 0, -0.024, -0.17, 0.18, 0, 0);
      addBox(root, 0.046, 0.106, 0.024, pbr.gunmetal, 0, -0.046, -0.29, 0.18, 0, 0);
      addTriggerAssembly(root, pbr.gunmetal, -0.018, 0.038);
      // Ventilated barrel jacket + conical flash hider + front bipod legs
      addCylZ(root, 0.022, 0.024, 0.4, pbr.gunmetal, 0, 0.038, 0.44, 12);
      addCylZ(root, 0.013, 0.014, 0.24, pbr.bluedSteel, 0, 0.038, 0.68, 10);
      addCylZ(root, 0.022, 0.014, 0.055, pbr.bluedSteel, 0, 0.038, 0.82, 10); // conical hider
      addCylZ(root, 0.009, 0.009, 0.22, pbr.gunmetal, -0.034, -0.008, 0.5, 8);
      addCylZ(root, 0.009, 0.009, 0.22, pbr.gunmetal, 0.034, -0.008, 0.5, 8);
      addIronSights(root, pbr.bluedSteel, pbr.sightDot, 0.072, -0.02, 0.64);

      // Iconic top-mounted flat 47-round pan drum magazine ("Dinner Plate")
      const mag = new THREE.Group();
      mag.name = 'MagazineNode';
      mag.position.set(0, 0.088, 0.15);
      addCylY(mag, 0.135, 0.135, 0.036, pbr.bluedSteel, 0, 0, 0, 20);
      addCylY(mag, 0.042, 0.042, 0.046, pbr.gunmetal, 0, 0.005, 0, 12);
      addBox(mag, 0.018, 0.014, 0.11, pbr.brass, 0, 0.02, 0.055); // pan carry strap/latch
      root.add(mag);

      const bolt = createBoltHandlePivot(pbr.chrome, pbr.gunmetal, 0.028, 0.042, 0.11);
      root.add(bolt);

      muzzle.position.set(0, 0.038, 0.855);
      eject.position.set(0, -0.018, 0.14);
      break;
    }

    default: {
      addBox(root, 0.05, 0.07, 0.36, pbr.gunmetal, 0, 0.03, 0.12);
      addCylZ(root, 0.015, 0.016, 0.25, pbr.bluedSteel, 0, 0.04, 0.42, 10);
      addBox(root, 0.038, 0.088, 0.042, pbr.rubberGrip, 0, -0.068, -0.01, -0.25, 0, 0);
      muzzle.position.set(0, 0.04, 0.56);
      eject.position.set(0.036, 0.045, 0.12);
      break;
    }
  }

  root.add(muzzle, eject);
  return root;
}

function collectRigNodes(root: THREE.Group): WeaponRigNodes {
  let muzzleAnchor = root.getObjectByName('MuzzleAnchor');
  if (!muzzleAnchor) {
    muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.name = 'MuzzleAnchor';
    muzzleAnchor.position.set(0, 0.04, 0.55);
    root.add(muzzleAnchor);
  }

  let ejectionAnchor = root.getObjectByName('EjectionAnchor');
  if (!ejectionAnchor) {
    ejectionAnchor = new THREE.Object3D();
    ejectionAnchor.name = 'EjectionAnchor';
    ejectionAnchor.position.set(0.04, 0.05, 0.12);
    root.add(ejectionAnchor);
  }

  const magazineNode = root.getObjectByName('MagazineNode') ?? null;
  const boltHandleNode = root.getObjectByName('BoltHandleNode') ?? null;
  const slideNode = root.getObjectByName('SlideNode') ?? null;
  const breakActionPivot = root.getObjectByName('BreakActionPivot') ?? null;
  const shellLeftNode = root.getObjectByName('ShellLeft') ?? null;
  const shellRightNode = root.getObjectByName('ShellRight') ?? null;

  return {
    root,
    muzzleAnchor,
    ejectionAnchor,
    magazineNode,
    magazineRestPos: magazineNode ? magazineNode.position.clone() : new THREE.Vector3(),
    magazineRestRot: magazineNode ? magazineNode.rotation.clone() : new THREE.Euler(),
    boltHandleNode,
    boltRestPos: boltHandleNode ? boltHandleNode.position.clone() : new THREE.Vector3(),
    slideNode,
    slideRestZ: slideNode ? slideNode.position.z : 0,
    breakActionPivot,
    shellLeftNode,
    shellRightNode,
  };
}

export function instantiateWeaponRig(def: WeaponDefinition): WeaponRigNodes {
  const preloaded = PRELOADED_WEAPON_TEMPLATES.get(def.id);
  const root = preloaded
    ? (preloaded.clone(true) as THREE.Group)
    : buildProceduralWeaponGroup(def);
  root.name = `weapon_${def.id}`;
  root.userData.weaponId = def.id;
  return collectRigNodes(root);
}

export interface WeaponSkinStyleInput {
  id: string;
  primaryHex: string;
  accentHex: string;
  emissiveHex?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

export function clearWeaponSkinFromGroup(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const baseMat = mesh.userData.__baseMaterial as THREE.Material | THREE.Material[] | undefined;
    if (baseMat !== undefined) {
      const prevSkinMat = mesh.userData.__skinMaterial as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(prevSkinMat)) {
        for (const m of prevSkinMat) m.dispose();
      } else if (prevSkinMat) {
        prevSkinMat.dispose();
      }
      mesh.material = baseMat;
      delete mesh.userData.__skinMaterial;
    }
  });
  delete root.userData.appliedSkinId;
}

export function applyWeaponSkinToGroup(
  root: THREE.Object3D,
  skin: WeaponSkinStyleInput | null | undefined,
): void {
  if (!skin) {
    clearWeaponSkinFromGroup(root);
    return;
  }
  if (root.userData.appliedSkinId === skin.id) return;
  clearWeaponSkinFromGroup(root);

  const primaryCol = new THREE.Color(skin.primaryHex);
  const accentCol = new THREE.Color(skin.accentHex);
  const emissiveCol = new THREE.Color(skin.emissiveHex ?? skin.accentHex);
  const emissiveStrength = skin.emissiveIntensity ?? 0.22;

  let meshIndex = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.__baseMaterial === undefined) {
      mesh.userData.__baseMaterial = mesh.material;
    }

    const pbr = SHARED_PBR;
    const baseMat = mesh.userData.__baseMaterial as THREE.Material | THREE.Material[];
    if (Array.isArray(baseMat)) {
      const cloned = baseMat.map((m) => {
        const c = m.clone();
        if (c instanceof THREE.MeshStandardMaterial) {
          c.color.copy(primaryCol);
          c.emissive.copy(emissiveCol);
          c.emissiveIntensity = emissiveStrength * 0.4;
          if (skin.metalness !== undefined) c.metalness = skin.metalness;
          if (skin.roughness !== undefined) c.roughness = skin.roughness;
        }
        return c;
      });
      mesh.userData.__skinMaterial = cloned;
      mesh.material = cloned;
      meshIndex++;
      return;
    }

    // Preserve optics glass and glowing sight dots
    if (pbr && (baseMat === pbr.opticGlass || baseMat === pbr.sightDot)) {
      meshIndex++;
      return;
    }

    if (!(baseMat instanceof THREE.MeshStandardMaterial)) {
      meshIndex++;
      return;
    }

    const mat = baseMat.clone();
    const isGripOrRubber = pbr && (baseMat === pbr.rubberGrip || baseMat === pbr.shellHull);
    const isAccentPart =
      (pbr &&
        (baseMat === pbr.chrome ||
          baseMat === pbr.brass ||
          baseMat === pbr.polymerFde ||
          baseMat === pbr.oliveChassis ||
          baseMat === pbr.walnut ||
          baseMat === pbr.ashWood)) ||
      meshIndex % 4 === 1;

    if (isGripOrRubber) {
      mat.color.copy(primaryCol).multiplyScalar(0.45);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    } else if (isAccentPart) {
      mat.color.copy(accentCol);
      mat.emissive.copy(emissiveCol);
      mat.emissiveIntensity = emissiveStrength;
      if (skin.metalness !== undefined) mat.metalness = Math.max(0.45, skin.metalness);
      if (skin.roughness !== undefined) mat.roughness = Math.min(0.42, skin.roughness);
    } else {
      mat.color.copy(primaryCol);
      mat.emissive.copy(emissiveCol);
      mat.emissiveIntensity = emissiveStrength * 0.35;
      if (skin.metalness !== undefined) mat.metalness = skin.metalness;
      if (skin.roughness !== undefined) mat.roughness = skin.roughness;
    }

    mesh.userData.__skinMaterial = mat;
    mesh.material = mat;
    meshIndex++;
  });

  root.userData.appliedSkinId = skin.id;
}

export async function exportWeaponGlbBuffer(def: WeaponDefinition): Promise<ArrayBuffer> {
  const scene = new THREE.Scene();
  const group = buildProceduralWeaponGroup(def);
  scene.add(group);
  scene.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(scene, { binary: true });
  if (glb instanceof ArrayBuffer) {
    return glb;
  }
  return new TextEncoder().encode(JSON.stringify(glb)).buffer;
}
