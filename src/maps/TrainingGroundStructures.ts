import * as THREE from 'three';
import type { QualityPreset } from '../core/Types';
import type {
  BuildingSectorEntry,
  OrientedVolumeCollider,
  WalkableSurface,
} from './BuildingSystem';
import type { CircleCollider } from './MapLoader';
import { createSculptedRockGeometry, type RockCollider } from './RockGeometry';

export interface TrainingGroundStructuresBuild {
  root: THREE.Group;
  cameraCollisionMeshes: THREE.Object3D[];
  volumeColliders: OrientedVolumeCollider[];
  walkableSurfaces: WalkableSurface[];
  circleColliders: CircleCollider[];
  rockColliders: RockCollider[];
  sectorEntries: BuildingSectorEntry[];
  dispose: () => void;
}

export interface TrainingGroundBuildOptions {
  quality: QualityPreset;
  isCompact: boolean;
  disableScatterShadows: boolean;
}

interface ContainerSpec {
  id: string;
  x: number;
  z: number;
  tier: 0 | 1; // 0 = ground, 1 = stacked 2nd story
  rotY: number;
  colorHex: string;
  roofHex?: string;
  openThrough?: boolean;
}

const CONTAINER_LEN = 6.0;
const CONTAINER_W = 2.55;
const CONTAINER_H = 2.55;
const YARD_PAD_TOP_Y = 0.06;
const RANGE_PAD_TOP_Y = 0.05;

function createCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function createConcreteTileTexture(size: number): THREE.CanvasTexture | null {
  const canvas = createCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c4b8a6';
  ctx.fillRect(0, 0, size, size);

  // Warm weathered mottling
  for (let i = 0; i < 420; i++) {
    const px = (i * 157) % size;
    const py = (i * 263) % size;
    const rad = 6 + (i % 14);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(138, 124, 106, 0.12)' : 'rgba(226, 218, 204, 0.14)';
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grid tiles (2x2 per repeat)
  const half = size / 2;
  ctx.strokeStyle = 'rgba(68, 59, 49, 0.56)';
  ctx.lineWidth = Math.max(2, Math.round(size / 160));
  for (let i = 0; i <= 2; i++) {
    const p = i * half;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Subtle highlight bevel along grout edges
  ctx.strokeStyle = 'rgba(245, 240, 230, 0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const p = i * half + 2;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Hairline concrete cracks
  ctx.strokeStyle = 'rgba(72, 64, 54, 0.34)';
  ctx.lineWidth = 1.2;
  const crackSeeds = [
    [0.14, 0.18, 0.32, 0.36, 0.39, 0.44],
    [0.62, 0.58, 0.78, 0.72, 0.85, 0.67],
    [0.18, 0.74, 0.33, 0.82, 0.41, 0.91],
  ];
  for (const [x0, y0, x1, y1, x2, y2] of crackSeeds) {
    ctx.beginPath();
    ctx.moveTo(x0 * size, y0 * size);
    ctx.lineTo(x1 * size, y1 * size);
    ctx.lineTo(x2 * size, y2 * size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 12.5);
  tex.needsUpdate = true;
  return tex;
}

function createCorrugatedTextures(size: number): {
  map: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
} {
  const cMap = createCanvas(size, size);
  const cBump = createCanvas(size, size);
  if (!cMap || !cBump) return { map: null, bumpMap: null };

  const ctx = cMap.getContext('2d')!;
  const bCtx = cBump.getContext('2d')!;

  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const ribs = 28;
  const ribW = size / ribs;
  for (let i = 0; i < ribs; i++) {
    const x = i * ribW;
    // Left bevel highlight, center ridge, right groove shadow
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x, 0, ribW * 0.35, size);
    ctx.fillStyle = 'rgba(15,23,42,0.22)';
    ctx.fillRect(x + ribW * 0.6, 0, ribW * 0.35, size);

    bCtx.fillStyle = '#d4d4d4';
    bCtx.fillRect(x, 0, ribW * 0.45, size);
    bCtx.fillStyle = '#2d2d2d';
    bCtx.fillRect(x + ribW * 0.5, 0, ribW * 0.45, size);
  }

  // Top & bottom structural rail bands
  const railH = Math.max(8, Math.round(size * 0.08));
  ctx.fillStyle = 'rgba(15,23,42,0.24)';
  ctx.fillRect(0, 0, size, railH);
  ctx.fillRect(0, size - railH, size, railH);
  bCtx.fillStyle = '#e0e0e0';
  bCtx.fillRect(0, 0, size, railH);
  bCtx.fillRect(0, size - railH, size, railH);

  // Subtle rust scratches like reference screenshot
  ctx.fillStyle = 'rgba(110, 48, 18, 0.55)';
  const scratches = [
    [0.14, 0.25, 0.014, 0.28],
    [0.37, 0.52, 0.012, 0.24],
    [0.71, 0.31, 0.016, 0.32],
    [0.83, 0.62, 0.014, 0.18],
  ];
  for (const [sx, sy, sw, sh] of scratches) {
    ctx.fillRect(sx * size, sy * size, Math.max(2, sw * size), sh * size);
  }

  // Cargo stencil markings
  ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
  ctx.font = `bold ${Math.max(10, Math.round(size * 0.055))}px monospace`;
  ctx.fillText('NXU-48291', size * 0.08, size * 0.22);
  ctx.fillText('22G1', size * 0.74, size * 0.22);

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function createContainerDoorTexture(size: number): {
  map: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
} {
  const cMap = createCanvas(size, size);
  const cBump = createCanvas(size, size);
  if (!cMap || !cBump) return { map: null, bumpMap: null };

  const ctx = cMap.getContext('2d')!;
  const bCtx = cBump.getContext('2d')!;

  // Base painted steel door panel
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#8a8a8a';
  bCtx.fillRect(0, 0, size, size);

  // Outer perimeter steel frame
  const frame = Math.max(8, Math.round(size * 0.065));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.fillRect(0, 0, size, frame);
  ctx.fillRect(0, size - frame, size, frame);
  ctx.fillRect(0, 0, frame, size);
  ctx.fillRect(size - frame, 0, frame, size);

  bCtx.fillStyle = '#dcdcdc';
  bCtx.fillRect(0, 0, size, frame);
  bCtx.fillRect(0, size - frame, size, frame);
  bCtx.fillRect(0, 0, frame, size);
  bCtx.fillRect(size - frame, 0, frame, size);

  // Recessed corrugated door panels (left & right door leaves)
  const pad = frame + Math.round(size * 0.04);
  const halfGap = Math.max(3, Math.round(size * 0.015));
  const leafW = size * 0.5 - pad - halfGap;
  const leafH = size - pad * 2;
  for (const lx of [pad, size * 0.5 + halfGap]) {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.lineWidth = Math.max(2, Math.round(size * 0.014));
    ctx.strokeRect(lx, pad, leafW, leafH);
    // Horizontal ribs inside door leaf
    for (let r = 1; r <= 5; r++) {
      const ry = pad + (leafH * r) / 6;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      ctx.fillRect(lx + 4, ry, leafW - 8, Math.max(2, size * 0.014));
      bCtx.fillStyle = '#525252';
      bCtx.fillRect(lx + 4, ry, leafW - 8, Math.max(2, size * 0.014));
    }
  }

  // Center door seam
  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.fillRect(size * 0.5 - 2, frame, 4, size - frame * 2);

  // 4 Vertical galvanized locking rods + cam latch handles
  const rodXs = [0.22, 0.39, 0.61, 0.78];
  const rodW = Math.max(4, Math.round(size * 0.024));
  for (const rxFrac of rodXs) {
    const rx = Math.round(size * rxFrac - rodW * 0.5);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(rx, frame * 0.8, rodW, size - frame * 1.6);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.48)';
    ctx.fillRect(rx, frame * 0.8, Math.max(1, Math.round(rodW * 0.35)), size - frame * 1.6);
    bCtx.fillStyle = '#ebebeb';
    bCtx.fillRect(rx, frame * 0.8, rodW, size - frame * 1.6);

    // Latch handle bracket near lower third
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(rx - rodW * 0.4, size * 0.64, rodW * 1.8, Math.max(6, size * 0.04));
  }

  // Yellow hazard/weight decal + white stencil code matching reference screenshot
  ctx.fillStyle = '#eab308';
  ctx.fillRect(size * 0.66, size * 0.22, size * 0.09, size * 0.07);
  ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
  ctx.font = `bold ${Math.max(9, Math.round(size * 0.048))}px monospace`;
  ctx.fillText('NXU-22', size * 0.14, size * 0.24);
  ctx.fillText('MAX 30T', size * 0.57, size * 0.82);

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function createSpawnPadTexture(size = 256): THREE.CanvasTexture | null {
  const canvas = createCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.fillRect(10, 10, size - 20, size - 20);

  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, size - 48, size - 48);

  // Forward direction chevron pointing -Z (toward Armory & Container Yard)
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, 42);
  ctx.lineTo(size * 0.72, 82);
  ctx.lineTo(size * 0.6, 82);
  ctx.lineTo(size * 0.5, 64);
  ctx.lineTo(size * 0.4, 82);
  ctx.lineTo(size * 0.28, 82);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(size * 0.14)}px sans-serif`;
  ctx.fillText('SPAWN', size * 0.5, size * 0.52);

  ctx.fillStyle = '#fbbf24';
  ctx.font = `700 ${Math.round(size * 0.08)}px monospace`;
  ctx.fillText('TRAINING ZONE', size * 0.5, size * 0.72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createChainLinkTexture(size = 128): THREE.CanvasTexture | null {
  const canvas = createCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1.5, size / 48);
  const step = size / 4;

  for (let offset = -size; offset <= size * 2; offset += step) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createSignTexture(
  title: string,
  subtitle: string,
  accentHex: string,
): THREE.CanvasTexture | null {
  const canvas = createCanvas(512, 192);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 192);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 176);

  ctx.fillStyle = accentHex;
  ctx.fillRect(16, 16, 480, 26);

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText(title, 256, 98);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(subtitle, 256, 150);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBullseyeTexture(size = 128): THREE.CanvasTexture | null {
  const canvas = createCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d')!;
  const half = size * 0.5;

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, size);

  const rings: Array<[number, string]> = [
    [0.44, '#0f172a'],
    [0.33, '#f8fafc'],
    [0.22, '#0ea5e9'],
    [0.11, '#ef4444'],
  ];
  for (const [rRatio, col] of rings) {
    ctx.beginPath();
    ctx.arc(half, half, size * rRatio, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildTrainingGroundStructures(
  getBaseTerrainY: (x: number, z: number) => number,
  options: TrainingGroundBuildOptions,
): TrainingGroundStructuresBuild {
  const root = new THREE.Group();
  root.name = 'training-ground-structures';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const instancedMeshes: THREE.InstancedMesh[] = [];
  const cameraCollisionMeshes: THREE.Object3D[] = [];
  const volumeColliders: OrientedVolumeCollider[] = [];
  const walkableSurfaces: WalkableSurface[] = [];
  const circleColliders: CircleCollider[] = [];
  const rockColliders: RockCollider[] = [];
  const sectorEntries: BuildingSectorEntry[] = [];

  const shadows = !options.disableScatterShadows && options.quality !== 'low';
  const texSize = options.quality === 'low' || options.isCompact ? 256 : 512;
  const corrTexSize = options.quality === 'low' || options.isCompact ? 128 : 256;

  const trackSector = (
    obj: THREE.Object3D,
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    isDecorative = false,
    isDetailOnly = false,
  ): void => {
    sectorEntries.push({
      mesh: obj,
      isDecorative,
      isDetailOnly,
      centerX: cx,
      centerY: cy,
      centerZ: cz,
      radius,
    });
  };

  // Shared PBR Textures & Materials
  const concreteTex = createConcreteTileTexture(texSize);
  if (concreteTex) texs.push(concreteTex);
  const { map: corrMap, bumpMap: corrBump } = createCorrugatedTextures(corrTexSize);
  if (corrMap) texs.push(corrMap);
  if (corrBump) texs.push(corrBump);
  const { map: doorMap, bumpMap: doorBump } = createContainerDoorTexture(corrTexSize);
  if (doorMap) texs.push(doorMap);
  if (doorBump) texs.push(doorBump);
  const chainTex = createChainLinkTexture(128);
  if (chainTex) texs.push(chainTex);
  const bullseyeTex = createBullseyeTexture(128);
  if (bullseyeTex) texs.push(bullseyeTex);
  const spawnPadTex = createSpawnPadTexture(256);
  if (spawnPadTex) texs.push(spawnPadTex);

  const concretePadMat = new THREE.MeshStandardMaterial({
    color: concreteTex ? 0xffffff : '#bfb29e',
    map: concreteTex,
    roughness: 0.88,
    metalness: 0.04,
  });
  const concreteSlabMat = new THREE.MeshStandardMaterial({
    color: '#9ca3af',
    roughness: 0.85,
    metalness: 0.08,
  });
  const roofMetalMat = new THREE.MeshStandardMaterial({
    color: '#c7bea8',
    map: corrMap,
    bumpMap: corrBump,
    bumpScale: 0.04,
    roughness: 0.62,
    metalness: 0.35,
  });
  const steelFrameMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    roughness: 0.42,
    metalness: 0.72,
  });
  const galvPostMat = new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.36,
    metalness: 0.78,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: '#9a683a',
    roughness: 0.82,
    metalness: 0.05,
  });
  const benchTopMat = new THREE.MeshStandardMaterial({
    color: '#78502e',
    roughness: 0.74,
    metalness: 0.08,
  });
  const lampHeadMat = new THREE.MeshStandardMaterial({
    color: '#2563eb',
    roughness: 0.32,
    metalness: 0.5,
  });
  const lampLensMat = new THREE.MeshStandardMaterial({
    color: '#e0f2fe',
    emissive: '#bae6fd',
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  const fenceMat = new THREE.MeshStandardMaterial({
    color: '#d1d5db',
    map: chainTex,
    alphaMap: chainTex,
    alphaTest: 0.35,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.45,
    metalness: 0.65,
  });
  const safetyOrangeMat = new THREE.MeshStandardMaterial({
    color: '#ea580c',
    roughness: 0.65,
    metalness: 0.12,
  });
  const sandbagMat = new THREE.MeshStandardMaterial({
    color: '#8c7a5b',
    roughness: 0.92,
    metalness: 0.02,
  });
  mats.push(
    concretePadMat,
    concreteSlabMat,
    roofMetalMat,
    steelFrameMat,
    galvPostMat,
    woodMat,
    benchTopMat,
    lampHeadMat,
    lampLensMat,
    fenceMat,
    safetyOrangeMat,
    sandbagMat,
  );

  // =========================================================================
  // 1. HERO CONTAINER YARD (56m x 50m Concrete Courtyard + Fence + Lamps)
  // =========================================================================
  const yardGroup = new THREE.Group();
  yardGroup.name = 'tg-container-yard';
  root.add(yardGroup);

  const yardPadGeo = new THREE.BoxGeometry(56.4, 0.16, 50.4);
  geos.push(yardPadGeo);
  const yardPadMesh = new THREE.Mesh(yardPadGeo, concretePadMat);
  yardPadMesh.position.set(0, YARD_PAD_TOP_Y - 0.08, 0);
  yardPadMesh.receiveShadow = true;
  yardGroup.add(yardPadMesh);
  cameraCollisionMeshes.push(yardPadMesh);
  walkableSurfaces.push({
    kind: 'slab',
    cx: 0,
    cz: 0,
    halfW: 28.2,
    halfD: 25.2,
    cosY: 1,
    sinY: 0,
    startY: YARD_PAD_TOP_Y,
    endY: YARD_PAD_TOP_Y,
    undersideY: YARD_PAD_TOP_Y - 0.16,
  });

  // Chain-link Perimeter Fence with 4 wide 7m Gates (N, S, E, W)
  const fenceH = 2.35;
  const fencePostGeo = new THREE.CylinderGeometry(0.055, 0.065, fenceH + 0.12, 8);
  const fenceRailGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 6);
  geos.push(fencePostGeo, fenceRailGeo);

  const fenceSegments: Array<{ x1: number; z1: number; x2: number; z2: number }> = [
    // North fence (gap -3.5 .. +3.5)
    { x1: -28.2, z1: -25.2, x2: -3.5, z2: -25.2 },
    { x1: 3.5, z1: -25.2, x2: 28.2, z2: -25.2 },
    // South fence (gap -3.5 .. +3.5)
    { x1: -28.2, z1: 25.2, x2: -3.5, z2: 25.2 },
    { x1: 3.5, z1: 25.2, x2: 28.2, z2: 25.2 },
    // West fence (gap -3.5 .. +3.5)
    { x1: -28.2, z1: -25.2, x2: -28.2, z2: -3.5 },
    { x1: -28.2, z1: 3.5, x2: -28.2, z2: 25.2 },
    // East fence (gap -3.5 .. +3.5)
    { x1: 28.2, z1: -25.2, x2: 28.2, z2: -3.5 },
    { x1: 28.2, z1: 3.5, x2: 28.2, z2: 25.2 },
  ];

  const postPositions: Array<[number, number]> = [];
  const dummy = new THREE.Object3D();

  for (const seg of fenceSegments) {
    const dx = seg.x2 - seg.x1;
    const dz = seg.z2 - seg.z1;
    const len = Math.hypot(dx, dz);
    const midX = (seg.x1 + seg.x2) * 0.5;
    const midZ = (seg.z1 + seg.z2) * 0.5;
    const rotY = Math.atan2(dx, dz) - Math.PI * 0.5;

    // Cloned panel texture repeat matched to panel width
    const panelGeo = new THREE.PlaneGeometry(len, fenceH - 0.14);
    const uvAttr = panelGeo.attributes.uv as THREE.BufferAttribute;
    const repeatX = Math.max(1, len / 1.4);
    for (let u = 0; u < uvAttr.count; u++) {
      uvAttr.setX(u, uvAttr.getX(u) * repeatX);
      uvAttr.setY(u, uvAttr.getY(u) * 1.6);
    }
    geos.push(panelGeo);

    const panel = new THREE.Mesh(panelGeo, fenceMat);
    panel.position.set(midX, YARD_PAD_TOP_Y + fenceH * 0.5, midZ);
    panel.rotation.y = rotY;
    yardGroup.add(panel);

    // Top horizontal rail
    const rail = new THREE.Mesh(fenceRailGeo, galvPostMat);
    rail.scale.set(1, len, 1);
    rail.position.set(midX, YARD_PAD_TOP_Y + fenceH - 0.06, midZ);
    rail.rotation.z = Math.PI * 0.5;
    rail.rotation.y = rotY;
    yardGroup.add(rail);

    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    volumeColliders.push({
      cx: midX,
      cz: midZ,
      halfW: len * 0.5,
      halfD: 0.12,
      cosY,
      sinY,
      minY: 0,
      maxY: YARD_PAD_TOP_Y + fenceH,
      steppable: false,
    });

    const postCount = Math.max(2, Math.round(len / 3.5) + 1);
    for (let p = 0; p < postCount; p++) {
      const t = p / (postCount - 1);
      postPositions.push([seg.x1 + dx * t, seg.z1 + dz * t]);
    }
  }

  const postsIM = new THREE.InstancedMesh(fencePostGeo, galvPostMat, postPositions.length);
  for (let i = 0; i < postPositions.length; i++) {
    const [px, pz] = postPositions[i];
    dummy.position.set(px, YARD_PAD_TOP_Y + (fenceH + 0.12) * 0.5, pz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postsIM.setMatrixAt(i, dummy.matrix);
  }
  postsIM.instanceMatrix.needsUpdate = true;
  postsIM.computeBoundingSphere();
  instancedMeshes.push(postsIM);
  yardGroup.add(postsIM);

  // Curved Streetlamps around Container Yard (matching screenshot blue-head streetlamps)
  const lampSpecs: Array<{ x: number; z: number; yaw: number }> = [
    { x: -26.8, z: -23.6, yaw: Math.PI * 0.25 },
    { x: -11.5, z: -24.0, yaw: 0 },
    { x: 11.5, z: -24.0, yaw: 0 },
    { x: 26.8, z: -23.6, yaw: -Math.PI * 0.25 },
    { x: -26.8, z: -10.5, yaw: Math.PI * 0.5 },
    { x: 26.8, z: -10.5, yaw: -Math.PI * 0.5 },
    { x: -26.8, z: 11.5, yaw: Math.PI * 0.5 },
    { x: 26.8, z: 11.5, yaw: -Math.PI * 0.5 },
    { x: -12.0, z: 24.0, yaw: Math.PI },
    { x: 12.0, z: 24.0, yaw: Math.PI },
  ];

  const lampPoleGeo = new THREE.CylinderGeometry(0.075, 0.11, 5.4, 8);
  const lampArmGeo = new THREE.BoxGeometry(0.1, 0.1, 1.55);
  const lampHeadGeo = new THREE.SphereGeometry(0.32, 10, 8);
  lampHeadGeo.scale(0.85, 0.45, 1.55);
  const lampLensGeo = new THREE.BoxGeometry(0.3, 0.06, 0.55);
  geos.push(lampPoleGeo, lampArmGeo, lampHeadGeo, lampLensGeo);

  for (const ls of lampSpecs) {
    const lg = new THREE.Group();
    lg.position.set(ls.x, YARD_PAD_TOP_Y, ls.z);
    lg.rotation.y = ls.yaw;

    const pole = new THREE.Mesh(lampPoleGeo, galvPostMat);
    pole.position.y = 2.7;
    pole.castShadow = shadows;

    const arm = new THREE.Mesh(lampArmGeo, galvPostMat);
    arm.position.set(0, 5.45, 0.68);
    arm.rotation.x = -0.22;

    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.set(0, 5.62, 1.4);

    const lens = new THREE.Mesh(lampLensGeo, lampLensMat);
    lens.position.set(0, 5.48, 1.42);

    lg.add(pole, arm, head, lens);
    yardGroup.add(lg);
    circleColliders.push({ x: ls.x, z: ls.z, radius: 0.2, topY: YARD_PAD_TOP_Y + 5.5 });
  }

  // =========================================================================
  // 2. CORRUGATED 2-STORY SHIPPING CONTAINERS (Matching Reference Layout)
  // =========================================================================
  const containerSpecs: ContainerSpec[] = [
    // NW Corner 2-Story Cluster (N-S)
    { id: 'c-nw-b1', x: -20.8, z: -14.5, tier: 0, rotY: 0, colorHex: '#1e3a8a' },
    { id: 'c-nw-b2', x: -18.0, z: -14.5, tier: 0, rotY: 0, colorHex: '#0e7490' },
    { id: 'c-nw-t1', x: -20.8, z: -14.5, tier: 1, rotY: 0, colorHex: '#0f766e', roofHex: '#c8c2ce' },
    { id: 'c-nw-t2', x: -18.0, z: -14.5, tier: 1, rotY: 0, colorHex: '#25757a', roofHex: '#cfc6b4' },

    // North-East-Center Cluster (E-W, leaves North Gate x=0 sightline clean)
    { id: 'c-nc-b1', x: 8.5, z: -18.8, tier: 0, rotY: Math.PI * 0.5, colorHex: '#0e7490' },
    { id: 'c-nc-b2', x: 8.5, z: -16.0, tier: 0, rotY: Math.PI * 0.5, colorHex: '#9a5332' },
    { id: 'c-nc-t1', x: 8.5, z: -18.8, tier: 1, rotY: Math.PI * 0.5, colorHex: '#3a7a80', roofHex: '#cfc6b4' },
    { id: 'c-nc-t2', x: 8.5, z: -16.0, tier: 1, rotY: Math.PI * 0.5, colorHex: '#3b759c', roofHex: '#c7c2be' },

    // NE Corner Cluster (E-W, 2-wide cobalt blue + dark forest green matching reference top-right)
    { id: 'c-ne-b1', x: 20.5, z: -18.8, tier: 0, rotY: Math.PI * 0.5, colorHex: '#15803d' },
    { id: 'c-ne-b2', x: 20.5, z: -16.0, tier: 0, rotY: Math.PI * 0.5, colorHex: '#0e7490' },
    { id: 'c-ne-t1', x: 20.5, z: -18.8, tier: 1, rotY: Math.PI * 0.5, colorHex: '#1e6b52', roofHex: '#2b7a62' },
    { id: 'c-ne-t2', x: 20.5, z: -16.0, tier: 1, rotY: Math.PI * 0.5, colorHex: '#0284c7', roofHex: '#0e8ec9' },

    // Mid-West Open Walk-Through Bay Cluster (E-W, walk straight through x: -15.5..-9.5)
    { id: 'c-mw-b1', x: -12.5, z: -1.4, tier: 0, rotY: Math.PI * 0.5, colorHex: '#0e7490', openThrough: true },
    { id: 'c-mw-b2', x: -12.5, z: -4.2, tier: 0, rotY: Math.PI * 0.5, colorHex: '#0f766e' },
    { id: 'c-mw-t1', x: -12.5, z: -1.4, tier: 1, rotY: Math.PI * 0.5, colorHex: '#26767a', roofHex: '#d2c8b4' },
    { id: 'c-mw-t2', x: -12.5, z: -4.2, tier: 1, rotY: Math.PI * 0.5, colorHex: '#227574', roofHex: '#d2c8b4' },

    // Center Signature Orange & Purple Cluster (E-W)
    { id: 'c-ct-b1', x: 0.2, z: 5.0, tier: 0, rotY: Math.PI * 0.5, colorHex: '#0f766e' },
    { id: 'c-ct-b2', x: 0.2, z: 7.8, tier: 0, rotY: Math.PI * 0.5, colorHex: '#3b6e75' },
    { id: 'c-ct-t1', x: 0.2, z: 5.0, tier: 1, rotY: Math.PI * 0.5, colorHex: '#b86f44', roofHex: '#c4784a' },
    { id: 'c-ct-t2', x: 0.2, z: 7.8, tier: 1, rotY: Math.PI * 0.5, colorHex: '#6d4ab8', roofHex: '#7a56c4' },

    // East-Center Royal Blue & Purple Cluster (N-S)
    { id: 'c-ec-b1', x: 12.2, z: 3.5, tier: 0, rotY: 0, colorHex: '#0f766e' },
    { id: 'c-ec-b2', x: 15.0, z: 3.5, tier: 0, rotY: 0, colorHex: '#1e40af' },
    { id: 'c-ec-t1', x: 12.2, z: 3.5, tier: 1, rotY: 0, colorHex: '#0284c7', roofHex: '#0e8ec9' },
    { id: 'c-ec-t2', x: 15.0, z: 3.5, tier: 1, rotY: 0, colorHex: '#8b3f82', roofHex: '#9b4a91' },

    // SW Corner 2-Wide Foreground Cluster (N-S, matching reference bottom-left)
    { id: 'c-sw-b1', x: -21.2, z: 10.0, tier: 0, rotY: 0, colorHex: '#1d4ed8' },
    { id: 'c-sw-b2', x: -18.4, z: 10.0, tier: 0, rotY: 0, colorHex: '#3b5978' },
    { id: 'c-sw-t1', x: -21.2, z: 10.0, tier: 1, rotY: 0, colorHex: '#a86938', roofHex: '#cfc6b4' },
    { id: 'c-sw-t2', x: -18.4, z: 10.0, tier: 1, rotY: 0, colorHex: '#4a7093', roofHex: '#cfc6b4' },

    // SE Corner Open Walk-Through Cluster (N-S, matching reference bottom-right)
    { id: 'c-se-b1', x: 18.2, z: 14.5, tier: 0, rotY: 0, colorHex: '#0284c7', openThrough: true },
    { id: 'c-se-b2', x: 21.0, z: 14.5, tier: 0, rotY: 0, colorHex: '#0f766e' },
    { id: 'c-se-t1', x: 18.2, z: 14.5, tier: 1, rotY: 0, colorHex: '#c27838', roofHex: '#c87e3e' },
    { id: 'c-se-t2', x: 21.0, z: 14.5, tier: 1, rotY: 0, colorHex: '#6b7c8a', roofHex: '#8d9ca8' },
  ];

  // Cache per-color container side/roof/door materials
  const containerMatCache = new Map<string, THREE.MeshStandardMaterial>();
  const getContainerMat = (hex: string): THREE.MeshStandardMaterial => {
    let m = containerMatCache.get(hex);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: hex,
        map: corrMap,
        bumpMap: corrBump,
        bumpScale: 0.08,
        roughness: 0.56,
        metalness: 0.42,
      });
      containerMatCache.set(hex, m);
      mats.push(m);
    }
    return m;
  };
  const containerDoorMatCache = new Map<string, THREE.MeshStandardMaterial>();
  const getContainerDoorMat = (hex: string): THREE.MeshStandardMaterial => {
    let m = containerDoorMatCache.get(hex);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: hex,
        map: doorMap ?? corrMap,
        bumpMap: doorBump ?? corrBump,
        bumpScale: 0.07,
        roughness: 0.54,
        metalness: 0.44,
      });
      containerDoorMatCache.set(hex, m);
      mats.push(m);
    }
    return m;
  };

  // Shared unit container geometries (local X = width 2.55, local Z = length 6.0)
  const closedBodyGeo = new THREE.BoxGeometry(CONTAINER_W, CONTAINER_H - 0.08, CONTAINER_LEN);
  const roofPlateGeo = new THREE.BoxGeometry(CONTAINER_W + 0.06, 0.1, CONTAINER_LEN + 0.06);
  const openSideWallGeo = new THREE.BoxGeometry(0.14, CONTAINER_H - 0.12, CONTAINER_LEN);
  const openWoodFloorGeo = new THREE.BoxGeometry(CONTAINER_W - 0.24, 0.08, CONTAINER_LEN);
  const openRoofGeo = new THREE.BoxGeometry(CONTAINER_W + 0.04, 0.14, CONTAINER_LEN + 0.04);
  const cornerPostGeo = new THREE.BoxGeometry(0.16, CONTAINER_H, 0.16);
  geos.push(
    closedBodyGeo,
    roofPlateGeo,
    openSideWallGeo,
    openWoodFloorGeo,
    openRoofGeo,
    cornerPostGeo,
  );

  for (const c of containerSpecs) {
    const baseY = YARD_PAD_TOP_Y + c.tier * CONTAINER_H;
    const topY = baseY + CONTAINER_H;
    const cosY = Math.cos(c.rotY);
    const sinY = Math.sin(c.rotY);
    const bodyMat = getContainerMat(c.colorHex);
    const doorMat = getContainerDoorMat(c.colorHex);
    const rMat = c.roofHex ? getContainerMat(c.roofHex) : roofMetalMat;
    const closedFaceMats = [bodyMat, bodyMat, rMat, bodyMat, doorMat, doorMat];

    const cg = new THREE.Group();
    cg.position.set(c.x, baseY, c.z);
    cg.rotation.y = c.rotY;

    if (c.openThrough) {
      const sideOffset = CONTAINER_W * 0.5 - 0.07;
      const wallL = new THREE.Mesh(openSideWallGeo, bodyMat);
      wallL.position.set(-sideOffset, CONTAINER_H * 0.5, 0);
      wallL.castShadow = shadows;
      wallL.receiveShadow = true;

      const wallR = new THREE.Mesh(openSideWallGeo, bodyMat);
      wallR.position.set(sideOffset, CONTAINER_H * 0.5, 0);
      wallR.castShadow = shadows;
      wallR.receiveShadow = true;

      const woodFloor = new THREE.Mesh(openWoodFloorGeo, woodMat);
      woodFloor.position.set(0, 0.04, 0);
      woodFloor.receiveShadow = true;

      const roof = new THREE.Mesh(openRoofGeo, rMat);
      roof.position.set(0, CONTAINER_H - 0.06, 0);
      roof.castShadow = shadows;
      roof.receiveShadow = true;

      cg.add(wallL, wallR, woodFloor, roof);
      cameraCollisionMeshes.push(wallL, wallR, roof);

      // Left & right side-wall colliders leaving interior clear to walk through
      for (const sx of [-sideOffset, sideOffset]) {
        volumeColliders.push({
          cx: c.x + sx * cosY,
          cz: c.z - sx * sinY,
          halfW: 0.1,
          halfD: CONTAINER_LEN * 0.5,
          cosY,
          sinY,
          minY: baseY,
          maxY: topY,
          steppable: false,
        });
      }

      // Walkable interior plank floor + walkable roof slab
      walkableSurfaces.push({
        kind: 'slab',
        cx: c.x,
        cz: c.z,
        halfW: CONTAINER_W * 0.5 - 0.16,
        halfD: CONTAINER_LEN * 0.5,
        cosY,
        sinY,
        startY: baseY + 0.08,
        endY: baseY + 0.08,
        undersideY: baseY,
      });
      walkableSurfaces.push({
        kind: 'slab',
        cx: c.x,
        cz: c.z,
        halfW: CONTAINER_W * 0.5,
        halfD: CONTAINER_LEN * 0.5,
        cosY,
        sinY,
        startY: topY,
        endY: topY,
        undersideY: topY - 0.16,
      });
    } else {
      const body = new THREE.Mesh(closedBodyGeo, closedFaceMats);
      body.position.set(0, (CONTAINER_H - 0.08) * 0.5, 0);
      body.castShadow = shadows;
      body.receiveShadow = true;

      const roof = new THREE.Mesh(roofPlateGeo, rMat);
      roof.position.set(0, CONTAINER_H - 0.04, 0);
      roof.castShadow = shadows;
      roof.receiveShadow = true;

      cg.add(body, roof);
      cameraCollisionMeshes.push(body, roof);

      // Corner structural pillars
      for (const sx of [-CONTAINER_W * 0.5 + 0.08, CONTAINER_W * 0.5 - 0.08]) {
        for (const sz of [-CONTAINER_LEN * 0.5 + 0.08, CONTAINER_LEN * 0.5 - 0.08]) {
          const post = new THREE.Mesh(cornerPostGeo, steelFrameMat);
          post.position.set(sx, CONTAINER_H * 0.5, sz);
          cg.add(post);
        }
      }

      volumeColliders.push({
        cx: c.x,
        cz: c.z,
        halfW: CONTAINER_W * 0.5,
        halfD: CONTAINER_LEN * 0.5,
        cosY,
        sinY,
        minY: baseY,
        maxY: topY - 0.04,
        steppable: false,
      });

      walkableSurfaces.push({
        kind: 'slab',
        cx: c.x,
        cz: c.z,
        halfW: CONTAINER_W * 0.5,
        halfD: CONTAINER_LEN * 0.5,
        cosY,
        sinY,
        startY: topY,
        endY: topY,
        undersideY: topY - 0.16,
      });
    }

    yardGroup.add(cg);
    trackSector(cg, c.x, baseY + CONTAINER_H * 0.5, c.z, 4.2, false, false);
  }

  // Draping Green Ivy Vines on upper container corners (signature screenshot detail!)
  const vineSpots: Array<{ x: number; y: number; z: number; rotY: number }> = [
    { x: 2.9, y: YARD_PAD_TOP_Y + 4.9, z: 4.1, rotY: 0.3 },
    { x: -18.2, y: YARD_PAD_TOP_Y + 4.8, z: -11.6, rotY: 0 },
    { x: -10.0, y: YARD_PAD_TOP_Y + 4.8, z: -4.2, rotY: 1.5 },
    { x: 11.4, y: YARD_PAD_TOP_Y + 4.8, z: -18.8, rotY: 0.7 },
    { x: 15.0, y: YARD_PAD_TOP_Y + 4.9, z: 6.4, rotY: 0.2 },
    { x: 18.2, y: YARD_PAD_TOP_Y + 4.8, z: 11.7, rotY: 0.5 },
  ];
  const leafGeo = new THREE.DodecahedronGeometry(0.32, 0);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.04,
    flatShading: true,
  });
  geos.push(leafGeo);
  mats.push(leafMat);

  const leavesPerVine = 16;
  const vineIM = new THREE.InstancedMesh(leafGeo, leafMat, vineSpots.length * leavesPerVine);
  const vineColor = new THREE.Color();
  let vIdx = 0;
  for (let s = 0; s < vineSpots.length; s++) {
    const vs = vineSpots[s];
    for (let k = 0; k < leavesPerVine; k++) {
      const dropT = k / leavesPerVine;
      const ox = Math.sin(k * 1.9 + vs.rotY) * (0.28 + dropT * 0.32);
      const oy = -dropT * 2.55;
      const oz = Math.cos(k * 2.3 + vs.rotY) * (0.26 + (1 - dropT) * 0.22);
      const sc = 0.72 + ((k * 7) % 5) * 0.14;
      dummy.position.set(vs.x + ox, vs.y + oy, vs.z + oz);
      dummy.rotation.set(k * 0.5, k * 1.1, k * 0.3);
      dummy.scale.set(sc * 1.15, sc * 0.85, sc);
      dummy.updateMatrix();
      vineIM.setMatrixAt(vIdx, dummy.matrix);
      vineColor.set(k % 3 === 0 ? '#4d7c0f' : k % 2 === 0 ? '#16a34a' : '#22c55e');
      vineIM.setColorAt(vIdx, vineColor);
      vIdx++;
    }
  }
  vineIM.instanceMatrix.needsUpdate = true;
  if (vineIM.instanceColor) vineIM.instanceColor.needsUpdate = true;
  vineIM.computeBoundingSphere();
  instancedMeshes.push(vineIM);
  yardGroup.add(vineIM);
  trackSector(vineIM, 0, 3.2, 0, 28, true, true);

  // Wooden Barrels (clusters around containers & inside open walk-through bay)
  const barrelSpecs: Array<{ x: number; y: number; z: number }> = [
    // Inside West Open Bay
    { x: -10.8, y: YARD_PAD_TOP_Y + 0.08, z: -0.7 },
    { x: -11.4, y: YARD_PAD_TOP_Y + 0.08, z: -1.9 },
    // Just outside West Open Bay
    { x: -15.9, y: YARD_PAD_TOP_Y, z: -3.2 },
    // Foreground Orange/Purple Container Corner (cluster of 3 like screenshot)
    { x: -3.2, y: YARD_PAD_TOP_Y, z: 8.8 },
    { x: -3.9, y: YARD_PAD_TOP_Y, z: 8.2 },
    { x: -3.4, y: YARD_PAD_TOP_Y, z: 7.5 },
    // North Cluster
    { x: 5.1, y: YARD_PAD_TOP_Y, z: -15.6 },
    { x: 5.7, y: YARD_PAD_TOP_Y, z: -16.2 },
    // SE Open Bay Corner
    { x: 16.5, y: YARD_PAD_TOP_Y, z: 12.1 },
    { x: 16.4, y: YARD_PAD_TOP_Y, z: 13.0 },
  ];

  const barrelBodyGeo = new THREE.CylinderGeometry(0.36, 0.34, 0.94, 10);
  const barrelRingGeo = new THREE.CylinderGeometry(0.385, 0.385, 0.08, 10);
  geos.push(barrelBodyGeo, barrelRingGeo);

  const barrelIM = new THREE.InstancedMesh(barrelBodyGeo, woodMat, barrelSpecs.length);
  const barrelRingIM = new THREE.InstancedMesh(barrelRingGeo, steelFrameMat, barrelSpecs.length * 2);
  barrelIM.castShadow = shadows;
  barrelIM.receiveShadow = true;

  for (let i = 0; i < barrelSpecs.length; i++) {
    const b = barrelSpecs[i];
    dummy.position.set(b.x, b.y + 0.47, b.z);
    dummy.rotation.set(0, i * 0.8, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    barrelIM.setMatrixAt(i, dummy.matrix);

    dummy.position.set(b.x, b.y + 0.24, b.z);
    dummy.updateMatrix();
    barrelRingIM.setMatrixAt(i * 2, dummy.matrix);

    dummy.position.set(b.x, b.y + 0.72, b.z);
    dummy.updateMatrix();
    barrelRingIM.setMatrixAt(i * 2 + 1, dummy.matrix);

    circleColliders.push({ x: b.x, z: b.z, radius: 0.4, topY: b.y + 0.95 });
  }
  barrelIM.instanceMatrix.needsUpdate = true;
  barrelRingIM.instanceMatrix.needsUpdate = true;
  barrelIM.computeBoundingSphere();
  barrelRingIM.computeBoundingSphere();
  instancedMeshes.push(barrelIM, barrelRingIM);
  yardGroup.add(barrelIM, barrelRingIM);
  trackSector(barrelIM, 0, 0.6, 0, 26, true, false);
  trackSector(barrelRingIM, 0, 0.6, 0, 26, true, true);

  // Stacked Orange & Wood Pallets (including climbable stair stacks onto 1st-tier roofs!)
  const palletStacks: Array<{
    x: number;
    z: number;
    layers: number;
    rotY: number;
    climbStep?: boolean;
  }> = [
    // Climbable steps onto Mid-West Cluster (x: -12.5, z: -4.2, ends at x=-9.5)
    { x: -8.5, z: -4.2, layers: 4, rotY: 0 },
    { x: -7.1, z: -4.2, layers: 2, rotY: 0 },
    // Climbable steps onto East-Center Cluster (x: 12.2..15.0, z: 3.5, south end z=+6.5)
    { x: 15.0, z: 7.4, layers: 4, rotY: Math.PI * 0.5 },
    { x: 15.0, z: 8.9, layers: 2, rotY: Math.PI * 0.5 },
    // Decorative stacks like right side of screenshot
    { x: 17.8, z: 2.0, layers: 4, rotY: 0.15 },
    { x: 22.8, z: -1.5, layers: 5, rotY: -0.35 },
    { x: -16.8, z: -19.2, layers: 4, rotY: 0.25 },
  ];

  const palletWoodGeo = new THREE.BoxGeometry(1.35, 0.16, 1.35);
  const palletTrimGeo = new THREE.BoxGeometry(1.38, 0.08, 1.38);
  geos.push(palletWoodGeo, palletTrimGeo);

  let totalPalletLayers = 0;
  for (const ps of palletStacks) totalPalletLayers += ps.layers;
  const palletWoodIM = new THREE.InstancedMesh(palletWoodGeo, woodMat, totalPalletLayers);
  const palletTrimIM = new THREE.InstancedMesh(palletTrimGeo, safetyOrangeMat, totalPalletLayers);
  palletWoodIM.castShadow = shadows;
  palletWoodIM.receiveShadow = true;

  let pLayerPtr = 0;
  for (const ps of palletStacks) {
    const stackH = ps.layers * 0.28;
    const cosY = Math.cos(ps.rotY);
    const sinY = Math.sin(ps.rotY);
    for (let l = 0; l < ps.layers; l++) {
      const py = YARD_PAD_TOP_Y + l * 0.28 + 0.08;
      dummy.position.set(ps.x, py, ps.z);
      dummy.rotation.set(0, ps.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      palletWoodIM.setMatrixAt(pLayerPtr, dummy.matrix);

      dummy.position.set(ps.x, py + 0.06, ps.z);
      dummy.updateMatrix();
      palletTrimIM.setMatrixAt(pLayerPtr, dummy.matrix);
      pLayerPtr++;
    }

    const topY = YARD_PAD_TOP_Y + stackH;
    volumeColliders.push({
      cx: ps.x,
      cz: ps.z,
      halfW: 0.68,
      halfD: 0.68,
      cosY,
      sinY,
      minY: YARD_PAD_TOP_Y,
      maxY: topY,
      steppable: ps.layers <= 2,
    });
    walkableSurfaces.push({
      kind: 'slab',
      cx: ps.x,
      cz: ps.z,
      halfW: 0.72,
      halfD: 0.72,
      cosY,
      sinY,
      startY: topY,
      endY: topY,
      undersideY: YARD_PAD_TOP_Y,
    });
  }
  palletWoodIM.instanceMatrix.needsUpdate = true;
  palletTrimIM.instanceMatrix.needsUpdate = true;
  palletWoodIM.computeBoundingSphere();
  palletTrimIM.computeBoundingSphere();
  instancedMeshes.push(palletWoodIM, palletTrimIM);
  yardGroup.add(palletWoodIM, palletTrimIM);
  trackSector(palletWoodIM, 0, 0.7, 0, 26, true, false);
  trackSector(palletTrimIM, 0, 0.7, 0, 26, true, true);

  // =========================================================================
  // 3. ARMORY WELCOME BENCH & SOUTH GATE ARCHWAY (At Player Spawn z: 30..38)
  // =========================================================================
  const armoryGroup = new THREE.Group();
  armoryGroup.name = 'tg-armory-plaza';
  root.add(armoryGroup);

  // Armory concrete pad beneath spawn & benches
  const armoryPadGeo = new THREE.BoxGeometry(20.0, 0.16, 17.0);
  geos.push(armoryPadGeo);
  const armoryPadMesh = new THREE.Mesh(armoryPadGeo, concretePadMat);
  armoryPadMesh.position.set(0, -0.02, 33.0);
  armoryPadMesh.receiveShadow = true;
  armoryGroup.add(armoryPadMesh);
  walkableSurfaces.push({
    kind: 'slab',
    cx: 0,
    cz: 33.0,
    halfW: 10.0,
    halfD: 8.5,
    cosY: 1,
    sinY: 0,
    startY: 0.06,
    endY: 0.06,
    undersideY: -0.1,
  });

  // Painted Player Spawn Marker Pad at (0, 38.5)
  if (spawnPadTex) {
    const spawnPadMat = new THREE.MeshBasicMaterial({
      map: spawnPadTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    mats.push(spawnPadMat);
    const spawnMarkerGeo = new THREE.PlaneGeometry(4.2, 4.2);
    geos.push(spawnMarkerGeo);
    const spawnMarker = new THREE.Mesh(spawnMarkerGeo, spawnPadMat);
    spawnMarker.rotation.x = -Math.PI / 2;
    spawnMarker.position.set(0, 0.068, 38.5);
    armoryGroup.add(spawnMarker);
  }

  // Two weapon display benches (top at y = 0.78 so TRAINING_GROUND_WEAPON_RACKS rest cleanly on top!)
  const benchTableGeo = new THREE.BoxGeometry(14.8, 0.12, 0.9);
  const benchLegGeo = new THREE.BoxGeometry(0.14, 0.68, 0.74);
  geos.push(benchTableGeo, benchLegGeo);

  for (const bz of [30.8, 32.6]) {
    const tableTop = new THREE.Mesh(benchTableGeo, benchTopMat);
    tableTop.position.set(0, 0.72, bz);
    tableTop.castShadow = shadows;
    tableTop.receiveShadow = true;
    armoryGroup.add(tableTop);
    cameraCollisionMeshes.push(tableTop);

    for (const lx of [-6.8, -2.2, 2.2, 6.8]) {
      const leg = new THREE.Mesh(benchLegGeo, steelFrameMat);
      leg.position.set(lx, 0.34, bz);
      leg.castShadow = shadows;
      armoryGroup.add(leg);
    }

    // Height <= 0.78 ensures MapManager.hasLootLineOfSight never blocks picking items from the bench!
    volumeColliders.push({
      cx: 0,
      cz: bz,
      halfW: 7.4,
      halfD: 0.44,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 0.76,
      steppable: false,
    });
    walkableSurfaces.push({
      kind: 'slab',
      cx: 0,
      cz: bz,
      halfW: 7.45,
      halfD: 0.48,
      cosY: 1,
      sinY: 0,
      startY: 0.78,
      endY: 0.78,
      undersideY: 0.66,
    });
  }

  // Overhead South Gate Banner Archway
  const archPostGeo = new THREE.BoxGeometry(0.28, 3.8, 0.28);
  const archBeamGeo = new THREE.BoxGeometry(8.6, 1.35, 0.24);
  geos.push(archPostGeo, archBeamGeo);
  for (const ax of [-4.0, 4.0]) {
    const ap = new THREE.Mesh(archPostGeo, steelFrameMat);
    ap.position.set(ax, 1.9, 27.0);
    ap.castShadow = shadows;
    armoryGroup.add(ap);
    volumeColliders.push({
      cx: ax,
      cz: 27.0,
      halfW: 0.16,
      halfD: 0.16,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 3.8,
      steppable: false,
    });
  }
  const armorySignTex = createSignTexture('TRAINING GROUND', 'ARMORY · CONTAINER YARD', '#f97316');
  if (armorySignTex) texs.push(armorySignTex);
  const armorySignMat = new THREE.MeshStandardMaterial({
    color: armorySignTex ? 0xffffff : '#1e293b',
    map: armorySignTex,
    roughness: 0.45,
    metalness: 0.25,
  });
  mats.push(armorySignMat);
  const archBeam = new THREE.Mesh(archBeamGeo, armorySignMat);
  archBeam.position.set(0, 3.65, 27.0);
  armoryGroup.add(archBeam);
  trackSector(armoryGroup, 0, 1.6, 32, 16, false, false);

  // =========================================================================
  // 4. COVERED SHOOTING RANGE & SNIPER WATCHTOWER (x: -102..-54, z: -158..+19)
  // =========================================================================
  const rangeGroup = new THREE.Group();
  rangeGroup.name = 'tg-shooting-range';
  root.add(rangeGroup);

  const rangePadGeo = new THREE.BoxGeometry(48.0, 0.14, 177.0);
  geos.push(rangePadGeo);
  const rangePadMesh = new THREE.Mesh(rangePadGeo, concretePadMat);
  rangePadMesh.position.set(-78.0, RANGE_PAD_TOP_Y - 0.07, -69.5);
  rangePadMesh.receiveShadow = true;
  rangeGroup.add(rangePadMesh);
  cameraCollisionMeshes.push(rangePadMesh);
  walkableSurfaces.push({
    kind: 'slab',
    cx: -78.0,
    cz: -69.5,
    halfW: 24.0,
    halfD: 88.5,
    cosY: 1,
    sinY: 0,
    startY: RANGE_PAD_TOP_Y,
    endY: RANGE_PAD_TOP_Y,
    undersideY: RANGE_PAD_TOP_Y - 0.14,
  });

  // Overhead Firing Bay Shelter Roof (x: -99..-57, z: +9.8..+17.0)
  const canopyRoofGeo = new THREE.BoxGeometry(42.0, 0.16, 7.6);
  const canopyPostGeo = new THREE.BoxGeometry(0.22, 3.4, 0.22);
  const stallDividerGeo = new THREE.BoxGeometry(0.12, 1.6, 3.0);
  const rangeTableGeo = new THREE.BoxGeometry(37.5, 0.12, 0.9);
  const rangeTableLegGeo = new THREE.BoxGeometry(0.14, 0.68, 0.72);
  geos.push(canopyRoofGeo, canopyPostGeo, stallDividerGeo, rangeTableGeo, rangeTableLegGeo);

  const canopyRoof = new THREE.Mesh(canopyRoofGeo, roofMetalMat);
  canopyRoof.position.set(-78.0, 3.45, 13.4);
  canopyRoof.castShadow = shadows;
  canopyRoof.receiveShadow = true;
  rangeGroup.add(canopyRoof);
  cameraCollisionMeshes.push(canopyRoof);

  // Roof support pillars
  const bayDividersX = [-98.2, -91.4, -84.6, -77.8, -71.0, -64.2, -57.4];
  for (const px of bayDividersX) {
    for (const pz of [10.0, 16.8]) {
      const post = new THREE.Mesh(canopyPostGeo, steelFrameMat);
      post.position.set(px, 1.7, pz);
      post.castShadow = shadows;
      rangeGroup.add(post);
      volumeColliders.push({
        cx: px,
        cz: pz,
        halfW: 0.13,
        halfD: 0.13,
        cosY: 1,
        sinY: 0,
        minY: 0,
        maxY: 3.45,
        steppable: false,
      });
    }
    // Stall lane dividers at firing line
    const div = new THREE.Mesh(stallDividerGeo, safetyOrangeMat);
    div.position.set(px, 0.85, 11.4);
    rangeGroup.add(div);
    volumeColliders.push({
      cx: px,
      cz: 11.4,
      halfW: 0.08,
      halfD: 1.45,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 1.65,
      steppable: false,
    });
  }

  // Front weapon rack tables (z = 11.8) + middle ammo tables (z = 13.8) + rear optics/meds tables (z = 15.2)
  for (const rz of [11.8, 13.8, 15.2]) {
    const tbl = new THREE.Mesh(rangeTableGeo, benchTopMat);
    tbl.position.set(-78.0, 0.72, rz);
    tbl.receiveShadow = true;
    rangeGroup.add(tbl);
    cameraCollisionMeshes.push(tbl);

    for (const lx of [-95.5, -87.0, -78.0, -69.0, -60.5]) {
      const leg = new THREE.Mesh(rangeTableLegGeo, steelFrameMat);
      leg.position.set(lx, 0.34, rz);
      rangeGroup.add(leg);
    }

    volumeColliders.push({
      cx: -78.0,
      cz: rz,
      halfW: 18.75,
      halfD: 0.44,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 0.76,
      steppable: false,
    });
    walkableSurfaces.push({
      kind: 'slab',
      cx: -78.0,
      cz: rz,
      halfW: 18.8,
      halfD: 0.48,
      cosY: 1,
      sinY: 0,
      startY: 0.78,
      endY: 0.78,
      undersideY: 0.66,
    });
  }

  // Shooting Range overhead sign
  const rangeSignTex = createSignTexture('SHOOTING RANGE', '15M · 30M · 50M · 75M · 100M · 150M', '#38bdf8');
  if (rangeSignTex) texs.push(rangeSignTex);
  const rangeSignMat = new THREE.MeshStandardMaterial({
    color: rangeSignTex ? 0xffffff : '#1e293b',
    map: rangeSignTex,
    roughness: 0.45,
    metalness: 0.25,
  });
  mats.push(rangeSignMat);
  const rangeSignGeo = new THREE.BoxGeometry(9.2, 1.3, 0.2);
  geos.push(rangeSignGeo);
  const rangeSign = new THREE.Mesh(rangeSignGeo, rangeSignMat);
  rangeSign.position.set(-78.0, 4.1, 17.0);
  rangeGroup.add(rangeSign);

  // Downrange Yardage Signposts + Static Bullseye Target Boards
  const yardageMarks = [
    { dist: '15M', z: -5 },
    { dist: '30M', z: -20 },
    { dist: '50M', z: -40 },
    { dist: '75M', z: -65 },
    { dist: '100M', z: -90 },
    { dist: '150M', z: -140 },
  ];
  const markerPostGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.9, 6);
  const markerPlateGeo = new THREE.BoxGeometry(1.75, 0.75, 0.08);
  const bullBoardGeo = new THREE.BoxGeometry(1.2, 1.2, 0.1);
  const bullPostGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6);
  const bullseyeMat = new THREE.MeshStandardMaterial({
    color: bullseyeTex ? 0xffffff : '#f8fafc',
    map: bullseyeTex,
    roughness: 0.55,
    metalness: 0.15,
  });
  geos.push(markerPostGeo, markerPlateGeo, bullBoardGeo, bullPostGeo);
  mats.push(bullseyeMat);

  for (let i = 0; i < yardageMarks.length; i++) {
    const ym = yardageMarks[i];
    const yTex = createSignTexture(ym.dist, 'RANGE LANE', '#38bdf8');
    if (yTex) texs.push(yTex);
    const yMat = new THREE.MeshStandardMaterial({
      color: yTex ? 0xffffff : '#0f172a',
      map: yTex,
      roughness: 0.5,
    });
    mats.push(yMat);

    const post = new THREE.Mesh(markerPostGeo, steelFrameMat);
    post.position.set(-100.8, 0.95, ym.z);
    const plate = new THREE.Mesh(markerPlateGeo, yMat);
    plate.position.set(-100.8, 1.85, ym.z);
    plate.rotation.y = Math.PI * 0.35;
    rangeGroup.add(post, plate);

    // Physical bullseye backboard near right lane edge
    const bPost = new THREE.Mesh(bullPostGeo, steelFrameMat);
    bPost.position.set(-57.5, 0.8, ym.z);
    const bBoard = new THREE.Mesh(bullBoardGeo, bullseyeMat);
    bBoard.position.set(-57.5, 1.75, ym.z);
    bBoard.castShadow = shadows;
    rangeGroup.add(bPost, bBoard);
    cameraCollisionMeshes.push(bBoard);
    volumeColliders.push({
      cx: -57.5,
      cz: ym.z,
      halfW: 0.62,
      halfD: 0.1,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 2.35,
      steppable: false,
    });
  }

  // Far North Backstop Berm at z = -159
  const bermGeo = new THREE.BoxGeometry(50.0, 4.5, 4.0);
  geos.push(bermGeo);
  const bermMesh = new THREE.Mesh(bermGeo, sandbagMat);
  bermMesh.position.set(-78.0, 2.25, -160.0);
  bermMesh.receiveShadow = true;
  rangeGroup.add(bermMesh);
  cameraCollisionMeshes.push(bermMesh);
  volumeColliders.push({
    cx: -78.0,
    cz: -160.0,
    halfW: 25.0,
    halfD: 2.0,
    cosY: 1,
    sinY: 0,
    minY: 0,
    maxY: 4.5,
    steppable: false,
  });
  trackSector(rangeGroup, -78.0, 1.5, -69.5, 95, false, false);

  // =========================================================================
  // 5. CLIMBABLE 2-STORY SNIPER WATCHTOWER at (-43, +22)
  // =========================================================================
  const towerX = -43.0;
  const towerZ = 22.0;
  const towerY = getBaseTerrainY(towerX, towerZ);
  const towerH = 4.2;
  const towerGroup = new THREE.Group();
  towerGroup.position.set(towerX, towerY, towerZ);
  root.add(towerGroup);

  const tDeckGeo = new THREE.BoxGeometry(5.0, 0.24, 5.0);
  const tPillarGeo = new THREE.BoxGeometry(0.28, towerH + 1.0, 0.28);
  const tRailGeo = new THREE.BoxGeometry(5.0, 0.95, 0.14);
  const tRoofGeo = new THREE.BoxGeometry(5.4, 0.16, 5.4);
  const tStairStepGeo = new THREE.BoxGeometry(1.5, 0.16, 0.42);
  geos.push(tDeckGeo, tPillarGeo, tRailGeo, tRoofGeo, tStairStepGeo);

  const tDeck = new THREE.Mesh(tDeckGeo, concreteSlabMat);
  tDeck.position.set(0, towerH - 0.12, 0);
  tDeck.castShadow = shadows;
  tDeck.receiveShadow = true;
  towerGroup.add(tDeck);
  cameraCollisionMeshes.push(tDeck);

  const tRoof = new THREE.Mesh(tRoofGeo, roofMetalMat);
  tRoof.position.set(0, towerH + 2.7, 0);
  tRoof.castShadow = shadows;
  towerGroup.add(tRoof);

  for (const px of [-2.25, 2.25]) {
    for (const pz of [-2.25, 2.25]) {
      const pil = new THREE.Mesh(tPillarGeo, steelFrameMat);
      pil.position.set(px, (towerH + 1.0) * 0.5, pz);
      pil.castShadow = shadows;
      towerGroup.add(pil);
      volumeColliders.push({
        cx: towerX + px,
        cz: towerZ + pz,
        halfW: 0.16,
        halfD: 0.16,
        cosY: 1,
        sinY: 0,
        minY: towerY,
        maxY: towerY + towerH + 2.7,
        steppable: false,
      });
    }
  }

  // Top deck waist guardrails (leave West entrance gap open for stair landing)
  const railNorth = new THREE.Mesh(tRailGeo, steelFrameMat);
  railNorth.position.set(0, towerH + 0.48, -2.42);
  const railSouth = new THREE.Mesh(tRailGeo, steelFrameMat);
  railSouth.position.set(0, towerH + 0.48, 2.42);
  const railEast = new THREE.Mesh(tRailGeo, steelFrameMat);
  railEast.position.set(2.42, towerH + 0.48, 0);
  railEast.rotation.y = Math.PI * 0.5;
  towerGroup.add(railNorth, railSouth, railEast);
  cameraCollisionMeshes.push(railNorth, railSouth, railEast);

  volumeColliders.push(
    { cx: towerX, cz: towerZ - 2.42, halfW: 2.5, halfD: 0.1, cosY: 1, sinY: 0, minY: towerY + towerH, maxY: towerY + towerH + 1.0, steppable: false },
    { cx: towerX, cz: towerZ + 2.42, halfW: 2.5, halfD: 0.1, cosY: 1, sinY: 0, minY: towerY + towerH, maxY: towerY + towerH + 1.0, steppable: false },
    { cx: towerX + 2.42, cz: towerZ, halfW: 0.1, halfD: 2.5, cosY: 1, sinY: 0, minY: towerY + towerH, maxY: towerY + towerH + 1.0, steppable: false },
  );

  walkableSurfaces.push({
    kind: 'slab',
    cx: towerX,
    cz: towerZ,
    halfW: 2.5,
    halfD: 2.5,
    cosY: 1,
    sinY: 0,
    startY: towerY + towerH,
    endY: towerY + towerH,
    undersideY: towerY + towerH - 0.24,
  });

  // External Staircase ascending from South (+Z) up to West Deck Entrance
  const stairSteps = 12;
  const stairRun = 4.6;
  const stairCenterX = towerX - 3.35;
  const stairCenterZ = towerZ;
  for (let s = 0; s < stairSteps; s++) {
    const t = (s + 0.5) / stairSteps;
    const stepY = (t) * towerH;
    const stepLocalZ = (t - 0.5) * stairRun;
    const stepMesh = new THREE.Mesh(tStairStepGeo, woodMat);
    stepMesh.position.set(-3.35, stepY - 0.08, stepLocalZ);
    stepMesh.castShadow = shadows;
    towerGroup.add(stepMesh);
    cameraCollisionMeshes.push(stepMesh);
  }
  walkableSurfaces.push({
    kind: 'stair',
    cx: stairCenterX,
    cz: stairCenterZ,
    halfW: 0.85,
    halfD: stairRun * 0.5,
    cosY: 1,
    sinY: 0,
    startY: towerY,
    endY: towerY + towerH,
    undersideY: towerY - 0.5,
    stairSteps,
  });
  // Connecting landing bridge from stair top (x=-3.35, z=+2.3) onto deck
  const landingGeo = new THREE.BoxGeometry(2.1, 0.2, 2.2);
  geos.push(landingGeo);
  const landing = new THREE.Mesh(landingGeo, steelFrameMat);
  landing.position.set(-2.9, towerH - 0.1, 1.4);
  towerGroup.add(landing);
  walkableSurfaces.push({
    kind: 'slab',
    cx: towerX - 2.9,
    cz: towerZ + 1.4,
    halfW: 1.05,
    halfD: 1.1,
    cosY: 1,
    sinY: 0,
    startY: towerY + towerH,
    endY: towerY + towerH,
    undersideY: towerY + towerH - 0.2,
  });
  trackSector(towerGroup, towerX, towerY + 3.0, towerZ, 8.5, false, false);

  // =========================================================================
  // 6. NORTH SNIPER RIDGE OVERLOOK PLATFORM at (16, -215)
  // =========================================================================
  const ridgeX = 16.0;
  const ridgeZ = -215.0;
  const ridgeY = getBaseTerrainY(ridgeX, ridgeZ);
  const ridgeGroup = new THREE.Group();
  ridgeGroup.position.set(ridgeX, ridgeY, ridgeZ);
  root.add(ridgeGroup);

  const ridgePadGeo = new THREE.BoxGeometry(11.0, 0.4, 8.5);
  const ridgeSandbagGeo = new THREE.BoxGeometry(3.4, 1.05, 0.85);
  geos.push(ridgePadGeo, ridgeSandbagGeo);

  const ridgePad = new THREE.Mesh(ridgePadGeo, concreteSlabMat);
  ridgePad.position.set(0, 0.1, 0);
  ridgePad.receiveShadow = true;
  ridgeGroup.add(ridgePad);
  walkableSurfaces.push({
    kind: 'slab',
    cx: ridgeX,
    cz: ridgeZ,
    halfW: 5.5,
    halfD: 4.25,
    cosY: 1,
    sinY: 0,
    startY: ridgeY + 0.3,
    endY: ridgeY + 0.3,
    undersideY: ridgeY - 0.1,
  });

  for (const bx of [-3.0, 3.0]) {
    const sb = new THREE.Mesh(ridgeSandbagGeo, sandbagMat);
    sb.position.set(bx, 0.72, 3.6);
    sb.castShadow = shadows;
    ridgeGroup.add(sb);
    cameraCollisionMeshes.push(sb);
    volumeColliders.push({
      cx: ridgeX + bx,
      cz: ridgeZ + 3.6,
      halfW: 1.7,
      halfD: 0.44,
      cosY: 1,
      sinY: 0,
      minY: ridgeY,
      maxY: ridgeY + 1.25,
      steppable: false,
    });
  }
  trackSector(ridgeGroup, ridgeX, ridgeY + 0.8, ridgeZ, 8.0, false, false);

  // =========================================================================
  // 7. NATURAL BOUNDARY PERIMETER BOLLARDS (Foot of Enclosing Mountains r = 320m)
  // =========================================================================
  const markerCount = 64;
  const boundPostGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.35, 6);
  geos.push(boundPostGeo);
  const boundIM = new THREE.InstancedMesh(boundPostGeo, safetyOrangeMat, markerCount);
  for (let i = 0; i < markerCount; i++) {
    const ang = (i / markerCount) * Math.PI * 2;
    const r = 320;
    const bx = Math.cos(ang) * r;
    const bz = Math.sin(ang) * r;
    const by = getBaseTerrainY(bx, bz);
    dummy.position.set(bx, by + 0.65, bz);
    dummy.rotation.set(0, -ang, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    boundIM.setMatrixAt(i, dummy.matrix);
    circleColliders.push({ x: bx, z: bz, radius: 0.25, topY: by + 1.35 });
  }
  boundIM.instanceMatrix.needsUpdate = true;
  boundIM.computeBoundingSphere();
  instancedMeshes.push(boundIM);
  root.add(boundIM);

  // =========================================================================
  // 8. CONTAINER YARD SURROUNDING PINE TREE RING & NE DARK ROCK OUTCROP
  //    (Reproduces exact outer fence framing from the uploaded reference)
  // =========================================================================
  const yardRingCoords: Array<[number, number, number]> = [
    // North edge behind fence (leave North Gate x in [-6, +6] clear)
    [-30, -31, 1.1], [-22, -31, 1.0], [-14, -30, 1.15], [-8, -32, 0.95],
    [8, -31, 1.05], [15, -30, 1.18], [23, -31, 1.08], [30, -31, 1.12],
    // West edge behind fence (leave West Gate z in [-6, +6] clear)
    [-33, -24, 1.06], [-34, -15, 1.15], [-33, -8, 0.98], [-34, 9, 1.05], [-33, 18, 1.12], [-32, 26, 0.96],
    // East edge behind fence (leave East Gate z in [-6, +6] clear)
    [33, -15, 1.08], [34, -8, 1.0], [33, 10, 1.05], [34, 19, 1.14], [32, 27, 0.95],
  ];
  const pineTrunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6);
  const pineConeLowerGeo = new THREE.ConeGeometry(2.15, 3.8, 7);
  const pineConeUpperGeo = new THREE.ConeGeometry(1.55, 3.2, 7);
  const pineTrunkMat = new THREE.MeshStandardMaterial({ color: '#5c3d28', roughness: 0.9 });
  const pineLeafMat = new THREE.MeshStandardMaterial({ color: '#3b7a2a', roughness: 0.85, flatShading: true });
  geos.push(pineTrunkGeo, pineConeLowerGeo, pineConeUpperGeo);
  mats.push(pineTrunkMat, pineLeafMat);

  const ringTrunkIM = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, yardRingCoords.length);
  const ringCone1IM = new THREE.InstancedMesh(pineConeLowerGeo, pineLeafMat, yardRingCoords.length);
  const ringCone2IM = new THREE.InstancedMesh(pineConeUpperGeo, pineLeafMat, yardRingCoords.length);
  ringCone1IM.castShadow = shadows;
  ringCone2IM.castShadow = shadows;
  for (let i = 0; i < yardRingCoords.length; i++) {
    const [tx, tz, sc] = yardRingCoords[i];
    const ty = getBaseTerrainY(tx, tz);
    dummy.position.set(tx, ty + 1.1 * sc, tz);
    dummy.rotation.set(0, i * 0.9, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    ringTrunkIM.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, ty + 3.4 * sc, tz);
    dummy.updateMatrix();
    ringCone1IM.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, ty + 5.2 * sc, tz);
    dummy.updateMatrix();
    ringCone2IM.setMatrixAt(i, dummy.matrix);

    circleColliders.push({ x: tx, z: tz, radius: 0.45 * sc, topY: ty + 6.5 * sc });
  }
  ringTrunkIM.instanceMatrix.needsUpdate = true;
  ringCone1IM.instanceMatrix.needsUpdate = true;
  ringCone2IM.instanceMatrix.needsUpdate = true;
  instancedMeshes.push(ringTrunkIM, ringCone1IM, ringCone2IM);
  root.add(ringTrunkIM, ringCone1IM, ringCone2IM);

  // Dark Angular Slate Boulder just outside NE fence (visible top-right of reference image)
  const rockGeo = createSculptedRockGeometry();
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#3f4652',
    roughness: 0.9,
    metalness: 0.08,
    flatShading: true,
  });
  geos.push(rockGeo);
  mats.push(rockMat);
  const neRockBaseY = getBaseTerrainY(30.8, -21.5);
  const neRockRotY = 0.7;
  const neRock = new THREE.Mesh(rockGeo, rockMat);
  neRock.position.set(30.8, neRockBaseY, -21.5);
  neRock.scale.set(2.4, 2.35, 2.75);
  neRock.rotation.set(0, neRockRotY, 0);
  neRock.castShadow = shadows;
  neRock.receiveShadow = true;
  root.add(neRock);
  cameraCollisionMeshes.push(neRock);
  rockColliders.push({
    x: 30.8,
    z: -21.5,
    baseY: neRockBaseY,
    rx: 2.4,
    rz: 2.75,
    height: 2.35,
    cosY: Math.cos(neRockRotY),
    sinY: Math.sin(neRockRotY),
  });

  // =========================================================================
  // 9. DAMAGE TESTING ZONE (East of Armory Plaza, x: +34..+62, z: +6..+54)
  // =========================================================================
  const dmgGroup = new THREE.Group();
  dmgGroup.name = 'tg-damage-testing-zone';
  root.add(dmgGroup);

  const dmgPadGeo = new THREE.BoxGeometry(28.0, 0.16, 48.0);
  geos.push(dmgPadGeo);
  const dmgPadMesh = new THREE.Mesh(dmgPadGeo, concretePadMat);
  dmgPadMesh.position.set(48.0, 0.05 - 0.08, 30.0);
  dmgPadMesh.receiveShadow = true;
  dmgGroup.add(dmgPadMesh);
  cameraCollisionMeshes.push(dmgPadMesh);
  walkableSurfaces.push({
    kind: 'slab',
    cx: 48.0,
    cz: 30.0,
    halfW: 14.0,
    halfD: 24.0,
    cosY: 1,
    sinY: 0,
    startY: 0.05,
    endY: 0.05,
    undersideY: -0.11,
  });

  // Damage Test Weapon & Optics Bench (top at y = 0.78)
  const dmgTableGeo = new THREE.BoxGeometry(20.0, 0.12, 0.9);
  const dmgPostGeo = new THREE.BoxGeometry(0.14, 0.68, 0.72);
  geos.push(dmgTableGeo, dmgPostGeo);
  for (const bz of [46.2, 47.8]) {
    const tbl = new THREE.Mesh(dmgTableGeo, benchTopMat);
    tbl.position.set(48.0, 0.72, bz);
    tbl.castShadow = shadows;
    tbl.receiveShadow = true;
    dmgGroup.add(tbl);
    cameraCollisionMeshes.push(tbl);

    for (const lx of [39.0, 45.0, 51.0, 57.0]) {
      const leg = new THREE.Mesh(dmgPostGeo, steelFrameMat);
      leg.position.set(lx, 0.34, bz);
      dmgGroup.add(leg);
    }
    volumeColliders.push({
      cx: 48.0,
      cz: bz,
      halfW: 10.0,
      halfD: 0.44,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 0.76,
      steppable: false,
    });
    walkableSurfaces.push({
      kind: 'slab',
      cx: 48.0,
      cz: bz,
      halfW: 10.05,
      halfD: 0.48,
      cosY: 1,
      sinY: 0,
      startY: 0.78,
      endY: 0.78,
      undersideY: 0.66,
    });
  }

  // Overhead Damage Testing Zone Sign + Arch Posts
  const dmgArchGeo = new THREE.BoxGeometry(10.4, 1.3, 0.22);
  geos.push(dmgArchGeo);
  const dmgSignTex = createSignTexture('DAMAGE TESTING ZONE', 'LV.0 · LV.2 · LV.3 ARMOR · DPS', '#22c55e');
  if (dmgSignTex) texs.push(dmgSignTex);
  const dmgSignMat = new THREE.MeshStandardMaterial({
    color: dmgSignTex ? 0xffffff : '#1e293b',
    map: dmgSignTex,
    roughness: 0.45,
    metalness: 0.25,
  });
  mats.push(dmgSignMat);
  for (const px of [42.6, 53.4]) {
    const p = new THREE.Mesh(archPostGeo, steelFrameMat);
    p.position.set(px, 1.9, 44.0);
    p.castShadow = shadows;
    dmgGroup.add(p);
    volumeColliders.push({
      cx: px,
      cz: 44.0,
      halfW: 0.16,
      halfD: 0.16,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 3.8,
      steppable: false,
    });
  }
  const dmgSign = new THREE.Mesh(dmgArchGeo, dmgSignMat);
  dmgSign.position.set(48.0, 3.65, 44.0);
  dmgGroup.add(dmgSign);

  // Painted range strips (10M / 20M / 30M from firing line z = 43) + Backstop Berm at z = 7.5
  const laneStripGeo = new THREE.BoxGeometry(25.0, 0.02, 0.22);
  const dmgBermGeo = new THREE.BoxGeometry(28.0, 3.2, 2.6);
  geos.push(laneStripGeo, dmgBermGeo);
  for (const lz of [33.0, 23.0, 13.0]) {
    const strip = new THREE.Mesh(laneStripGeo, safetyOrangeMat);
    strip.position.set(48.0, 0.06, lz);
    dmgGroup.add(strip);
  }
  const dmgBerm = new THREE.Mesh(dmgBermGeo, sandbagMat);
  dmgBerm.position.set(48.0, 1.6, 7.5);
  dmgBerm.castShadow = shadows;
  dmgBerm.receiveShadow = true;
  dmgGroup.add(dmgBerm);
  cameraCollisionMeshes.push(dmgBerm);
  volumeColliders.push({
    cx: 48.0,
    cz: 7.5,
    halfW: 14.0,
    halfD: 1.3,
    cosY: 1,
    sinY: 0,
    minY: 0,
    maxY: 3.2,
    steppable: false,
  });
  trackSector(dmgGroup, 48.0, 1.5, 30.0, 28, false, false);

  // =========================================================================
  // 10. OBSTACLE COURSE & MOVEMENT TRAINING AREA (x: -72..-30, z: +39..+83)
  // =========================================================================
  const obsGroup = new THREE.Group();
  obsGroup.name = 'tg-obstacle-course';
  root.add(obsGroup);

  const obsPadGeo = new THREE.BoxGeometry(42.0, 0.16, 44.0);
  geos.push(obsPadGeo);
  const obsPad = new THREE.Mesh(obsPadGeo, concretePadMat);
  obsPad.position.set(-51.0, 0.05 - 0.08, 61.0);
  obsPad.receiveShadow = true;
  obsGroup.add(obsPad);
  cameraCollisionMeshes.push(obsPad);
  walkableSurfaces.push({
    kind: 'slab',
    cx: -51.0,
    cz: 61.0,
    halfW: 21.0,
    halfD: 22.0,
    cosY: 1,
    sinY: 0,
    startY: 0.05,
    endY: 0.05,
    undersideY: -0.11,
  });

  // Course Entry Sign Arch at (-51, 39.8)
  const obsArchGeo = new THREE.BoxGeometry(10.2, 1.3, 0.22);
  geos.push(obsArchGeo);
  const obsSignTex = createSignTexture('OBSTACLE COURSE', 'VAULT · CROUCH · SLALOM · PARKOUR', '#38bdf8');
  if (obsSignTex) texs.push(obsSignTex);
  const obsSignMat = new THREE.MeshStandardMaterial({
    color: obsSignTex ? 0xffffff : '#1e293b',
    map: obsSignTex,
    roughness: 0.45,
    metalness: 0.25,
  });
  mats.push(obsSignMat);
  for (const px of [-56.2, -45.8]) {
    const p = new THREE.Mesh(archPostGeo, steelFrameMat);
    p.position.set(px, 1.9, 39.8);
    p.castShadow = shadows;
    obsGroup.add(p);
    volumeColliders.push({
      cx: px,
      cz: 39.8,
      halfW: 0.16,
      halfD: 0.16,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 3.8,
      steppable: false,
    });
  }
  const obsSign = new THREE.Mesh(obsArchGeo, obsSignMat);
  obsSign.position.set(-51.0, 3.65, 39.8);
  obsGroup.add(obsSign);

  // Lane 1 (x = -65): 4 Graduated Jump / Vault Hurdles (z = 47, 54, 61, 68)
  const hurdleHeights = [0.72, 0.82, 0.92, 1.02];
  for (let i = 0; i < hurdleHeights.length; i++) {
    const h = hurdleHeights[i];
    const hz = 47 + i * 7;
    const hGeo = new THREE.BoxGeometry(3.8, h, 0.36);
    geos.push(hGeo);
    const bar = new THREE.Mesh(hGeo, i % 2 === 0 ? safetyOrangeMat : steelFrameMat);
    bar.position.set(-65.0, 0.05 + h * 0.5, hz);
    bar.castShadow = shadows;
    bar.receiveShadow = true;
    obsGroup.add(bar);
    cameraCollisionMeshes.push(bar);
    volumeColliders.push({
      cx: -65.0,
      cz: hz,
      halfW: 1.9,
      halfD: 0.18,
      cosY: 1,
      sinY: 0,
      minY: 0.05,
      maxY: 0.05 + h,
      steppable: false,
    });
    walkableSurfaces.push({
      kind: 'slab',
      cx: -65.0,
      cz: hz,
      halfW: 1.9,
      halfD: 0.2,
      cosY: 1,
      sinY: 0,
      startY: 0.05 + h,
      endY: 0.05 + h,
      undersideY: 0.05,
    });
  }

  // Lane 2 (x = -56): 3 Crouch / Prone Slide-Under Arches (1.22m clearance underneath, walkable top beam)
  const archTopGeo = new THREE.BoxGeometry(4.0, 0.45, 1.4);
  const archSideGeo = new THREE.BoxGeometry(0.32, 1.65, 1.4);
  geos.push(archTopGeo, archSideGeo);
  for (let i = 0; i < 3; i++) {
    const az = 48 + i * 9;
    const topBeam = new THREE.Mesh(archTopGeo, steelFrameMat);
    topBeam.position.set(-56.0, 1.5, az);
    topBeam.castShadow = shadows;
    obsGroup.add(topBeam);
    cameraCollisionMeshes.push(topBeam);

    for (const sx of [-1.84, 1.84]) {
      const sidePost = new THREE.Mesh(archSideGeo, safetyOrangeMat);
      sidePost.position.set(-56.0 + sx, 0.875, az);
      sidePost.castShadow = shadows;
      obsGroup.add(sidePost);
      volumeColliders.push({
        cx: -56.0 + sx,
        cz: az,
        halfW: 0.16,
        halfD: 0.7,
        cosY: 1,
        sinY: 0,
        minY: 0.05,
        maxY: 1.72,
        steppable: false,
      });
    }
    // Overhead beam collider with minY = 1.27m so crouching/proning passes cleanly underneath!
    volumeColliders.push({
      cx: -56.0,
      cz: az,
      halfW: 2.0,
      halfD: 0.7,
      cosY: 1,
      sinY: 0,
      minY: 1.27,
      maxY: 1.72,
      steppable: false,
    });
    walkableSurfaces.push({
      kind: 'slab',
      cx: -56.0,
      cz: az,
      halfW: 2.0,
      halfD: 0.7,
      cosY: 1,
      sinY: 0,
      startY: 1.72,
      endY: 1.72,
      undersideY: 1.27,
    });
  }

  // Lane 3 (x = -46): Zig-Zag Peek & Cover Slalom Barriers (for sprint/strafe/peek drills)
  const slalomGeo = new THREE.BoxGeometry(3.2, 1.45, 0.52);
  geos.push(slalomGeo);
  for (let i = 0; i < 5; i++) {
    const sz = 46 + i * 6.5;
    const sx = -46.0 + (i % 2 === 0 ? -1.4 : 1.4);
    const yaw = i % 2 === 0 ? 0.25 : -0.25;
    const wall = new THREE.Mesh(slalomGeo, concreteSlabMat);
    wall.position.set(sx, 0.775, sz);
    wall.rotation.y = yaw;
    wall.castShadow = shadows;
    wall.receiveShadow = true;
    obsGroup.add(wall);
    cameraCollisionMeshes.push(wall);
    volumeColliders.push({
      cx: sx,
      cz: sz,
      halfW: 1.6,
      halfD: 0.26,
      cosY: Math.cos(yaw),
      sinY: Math.sin(yaw),
      minY: 0.05,
      maxY: 1.5,
      steppable: false,
    });
  }

  // Lane 4 (x = -36): Stepped Parkour Jump Blocks + Elevated Catwalk + Descent Ramp
  const parkourBlocks: Array<{ z: number; h: number; d: number }> = [
    { z: 46.0, h: 0.65, d: 2.6 },
    { z: 50.0, h: 1.3, d: 2.6 },
    { z: 54.0, h: 1.95, d: 2.6 },
    { z: 58.2, h: 2.6, d: 2.8 },
    { z: 62.8, h: 3.25, d: 3.4 },
  ];
  for (let i = 0; i < parkourBlocks.length; i++) {
    const pb = parkourBlocks[i];
    const pGeo = new THREE.BoxGeometry(3.2, pb.h, pb.d);
    geos.push(pGeo);
    const block = new THREE.Mesh(pGeo, i % 2 === 0 ? woodMat : concreteSlabMat);
    block.position.set(-36.0, 0.05 + pb.h * 0.5, pb.z);
    block.castShadow = shadows;
    block.receiveShadow = true;
    obsGroup.add(block);
    cameraCollisionMeshes.push(block);
    volumeColliders.push({
      cx: -36.0,
      cz: pb.z,
      halfW: 1.6,
      halfD: pb.d * 0.5,
      cosY: 1,
      sinY: 0,
      minY: 0.05,
      maxY: 0.05 + pb.h - 0.04,
      steppable: i === 0,
    });
    walkableSurfaces.push({
      kind: 'slab',
      cx: -36.0,
      cz: pb.z,
      halfW: 1.6,
      halfD: pb.d * 0.5,
      cosY: 1,
      sinY: 0,
      startY: 0.05 + pb.h,
      endY: 0.05 + pb.h,
      undersideY: 0.05,
    });
  }

  // Elevated Catwalk Bridge (z: 64.5..73.5 at y = 3.30) + Ramp down (z: 73.5..80.5)
  const catwalkGeo = new THREE.BoxGeometry(2.8, 0.24, 9.0);
  const rampGeo = new THREE.BoxGeometry(2.8, 0.2, 7.6);
  geos.push(catwalkGeo, rampGeo);
  const catwalk = new THREE.Mesh(catwalkGeo, steelFrameMat);
  catwalk.position.set(-36.0, 3.18, 69.0);
  catwalk.castShadow = shadows;
  catwalk.receiveShadow = true;
  obsGroup.add(catwalk);
  cameraCollisionMeshes.push(catwalk);
  walkableSurfaces.push({
    kind: 'slab',
    cx: -36.0,
    cz: 69.0,
    halfW: 1.4,
    halfD: 4.5,
    cosY: 1,
    sinY: 0,
    startY: 3.3,
    endY: 3.3,
    undersideY: 3.06,
  });

  const rampSlope = Math.atan2(3.25, 7.0);
  const rampMesh = new THREE.Mesh(rampGeo, woodMat);
  rampMesh.position.set(-36.0, 1.65, 77.0);
  rampMesh.rotation.x = rampSlope;
  rampMesh.castShadow = shadows;
  rampMesh.receiveShadow = true;
  obsGroup.add(rampMesh);
  cameraCollisionMeshes.push(rampMesh);
  walkableSurfaces.push({
    kind: 'stair',
    cx: -36.0,
    cz: 77.0,
    halfW: 1.4,
    halfD: 3.5,
    cosY: 1,
    sinY: 0,
    startY: 3.3,
    endY: 0.05,
    undersideY: -0.2,
  });
  trackSector(obsGroup, -51.0, 1.5, 61.0, 30, false, false);

  // =========================================================================
  // 11. OPEN COMBAT SKIRMISH PLAZA PAD (x: +36..+66, z: -50..-10)
  // =========================================================================
  const skirmishPadGeo = new THREE.BoxGeometry(30.0, 0.14, 40.0);
  geos.push(skirmishPadGeo);
  const skirmishPad = new THREE.Mesh(skirmishPadGeo, concretePadMat);
  skirmishPad.position.set(51.0, 0.04 - 0.07, -30.0);
  skirmishPad.receiveShadow = true;
  root.add(skirmishPad);
  walkableSurfaces.push({
    kind: 'slab',
    cx: 51.0,
    cz: -30.0,
    halfW: 15.0,
    halfD: 20.0,
    cosY: 1,
    sinY: 0,
    startY: 0.04,
    endY: 0.04,
    undersideY: -0.1,
  });

  return {
    root,
    cameraCollisionMeshes,
    volumeColliders,
    walkableSurfaces,
    circleColliders,
    rockColliders,
    sectorEntries,
    dispose: () => {
      for (const im of instancedMeshes) im.dispose();
      instancedMeshes.length = 0;
      for (const g of geos) g.dispose();
      geos.length = 0;
      for (const m of mats) m.dispose();
      mats.length = 0;
      for (const t of texs) t.dispose();
      texs.length = 0;
    },
  };
}
