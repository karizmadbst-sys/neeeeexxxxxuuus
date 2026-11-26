import * as THREE from 'three';
import { getArmorIdFromTier, getArmorOption } from '../player/R6CustomizationData';

export type HelmetTier = 1 | 2 | 3;

export interface CraniumBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
  centerX: number;
  centerY: number;
  centerZ: number;
}

export interface HeadFitProfile {
  cranium: CraniumBounds;
  studTopY: number;
  faceFrontZ: number;
  faceMinY: number;
  faceMaxY: number;
  eyeCenterY: number;
  eyeTopY: number;
  eyeBottomY: number;
  browTopY: number;
  /** 0 = spherical/ellipsoidal head, 1 = beveled rectangular R6 block head */
  squareness: number;
  /** Live forward-most Z of equipped glasses/eye-wear in head local space */
  glassesFrontZ: number;
  glassesMaxX: number;
  glassesTopY: number;
  hasGlasses: boolean;
  /** Compact sampled cranium/stud surface points in head-local space for exact containment solving */
  envelopePoints: Array<{ x: number; y: number; z: number }>;
}

export interface HelmetFitSolution {
  tier: HelmetTier;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotationX: number;
  squarenessBucket: number;
  /** Normalized shell unit (half-width/depth at base before scale) -> world half-extents inside head space */
  browLocalY: number;
  visorFrontZ: number;
  visorTopY: number;
  visorBottomY: number;
  visorRadiusX: number;
  visorRadiusZ: number;
  railOffsetX: number;
  railY: number;
  shroudZ: number;
  shroudY: number;
}

const CANONICAL_HEAD_W = 0.40;
const CANONICAL_HEAD_H = 0.39;
const CANONICAL_HEAD_D = 0.40;

const _tmpBox = new THREE.Box3();
const _tmpMat = new THREE.Matrix4();
const _tmpInvHeadMat = new THREE.Matrix4();
const _tmpVec = new THREE.Vector3();

function computeMeshBoundsInAncestorSpace(
  mesh: THREE.Mesh,
  ancestor: THREE.Object3D,
  outBox: THREE.Box3,
): boolean {
  const geo = mesh.geometry;
  if (!geo) return false;
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!geo.boundingBox || geo.boundingBox.isEmpty()) return false;

  _tmpInvHeadMat.copy(ancestor.matrixWorld).invert();
  _tmpMat.multiplyMatrices(_tmpInvHeadMat, mesh.matrixWorld);
  outBox.copy(geo.boundingBox).applyMatrix4(_tmpMat);
  return !outBox.isEmpty();
}

/**
 * Computes radial distance from center to a super-ellipse / rounded-box contour
 * blended smoothly from circle/ellipse (squareness=0) to beveled block (squareness=1).
 */
function sampleContourXZ(
  theta: number,
  rx: number,
  rz: number,
  squareness: number,
  out: { x: number; z: number },
): void {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // Ellipse baseline
  const ex = rx * sinT;
  const ez = rz * cosT;

  // Rounded-rectangle ray intersection with corner bevel radius ~18% of half-extent
  const cornerScale = 0.18;
  const rcX = rx * cornerScale;
  const rcZ = rz * cornerScale;
  const innerX = Math.max(1e-4, rx - rcX);
  const innerZ = Math.max(1e-4, rz - rcZ);

  // Use smooth high-power Minkowski norm blended with exact rounded-box envelope
  // p = 6.8 hugs rounded R6 corners closely while remaining C-infinity smooth for normals
  const p = 2.0 + squareness * 5.2;
  const ax = Math.abs(sinT) / Math.max(1e-4, rx);
  const az = Math.abs(cosT) / Math.max(1e-4, rz);
  const minkowskiR = Math.pow(Math.pow(ax, p) + Math.pow(az, p), -1 / p);

  let bx = minkowskiR * sinT;
  let bz = minkowskiR * cosT;

  // Ensure exact rounded-box corner clearance when squareness is high
  if (squareness > 0.35) {
    const absS = Math.abs(sinT);
    const absC = Math.abs(cosT);
    const tEdge = Math.min(
      absS > 1e-5 ? rx / absS : 1e6,
      absC > 1e-5 ? rz / absC : 1e6,
    );
    const rawX = tEdge * sinT;
    const rawZ = tEdge * cosT;
    // Clamp into rounded corner zone so corners match RoundedBoxGeometry(corner=0.036)
    const dx = Math.max(0, Math.abs(rawX) - innerX);
    const dz = Math.max(0, Math.abs(rawZ) - innerZ);
    let cornerBoxX = rawX;
    let cornerBoxZ = rawZ;
    if (dx > 0 && dz > 0) {
      const len = Math.hypot(dx / rcX, dz / rcZ) || 1;
      cornerBoxX = Math.sign(rawX) * (innerX + (dx / len));
      cornerBoxZ = Math.sign(rawZ) * (innerZ + (dz / len));
    }
    const blend = Math.min(1, (squareness - 0.35) / 0.65);
    bx = bx * (1 - blend * 0.65) + cornerBoxX * (blend * 0.65);
    bz = bz * (1 - blend * 0.65) + cornerBoxZ * (blend * 0.65);
  }

  out.x = ex * (1 - squareness) + bx * squareness;
  out.z = ez * (1 - squareness) + bz * squareness;
}

/**
 * Estimates horizontal cross-section squareness [0..1] and captures compact upper-envelope
 * vertices from the actual cranium geometry in head-local coordinates.
 */
function inspectCraniumGeometry(
  craniumMeshes: THREE.Mesh[],
  studMeshes: THREE.Mesh[],
  headBone: THREE.Object3D,
  center: THREE.Vector3,
  halfW: number,
  halfD: number,
  minY: number,
): { squareness: number; envelopePoints: Array<{ x: number; y: number; z: number }> } {
  const envelopePoints: Array<{ x: number; y: number; z: number }> = [];
  if (craniumMeshes.length === 0 || halfW <= 1e-4 || halfD <= 1e-4) {
    return { squareness: 0.9, envelopePoints };
  }

  _tmpInvHeadMat.copy(headBone.matrixWorld).invert();
  let diagMaxNorm = 0;
  let sampleCount = 0;
  const dedup = new Set<string>();

  const collectFrom = (list: THREE.Mesh[], maxSamplesPerMesh: number) => {
    for (let mIdx = 0; mIdx < list.length; mIdx++) {
      const mesh = list[mIdx];
      const posAttr = mesh.geometry?.getAttribute('position');
      if (!posAttr) continue;
      _tmpMat.multiplyMatrices(_tmpInvHeadMat, mesh.matrixWorld);
      const step = Math.max(1, Math.floor(posAttr.count / maxSamplesPerMesh));
      for (let i = 0; i < posAttr.count; i += step) {
        _tmpVec.fromBufferAttribute(posAttr, i).applyMatrix4(_tmpMat);
        const nx = Math.abs(_tmpVec.x - center.x) / halfW;
        const nz = Math.abs(_tmpVec.z - center.z) / halfD;
        if (nx > 0.35 && nz > 0.35) {
          const radialNorm = Math.hypot(nx, nz);
          if (radialNorm > diagMaxNorm) diagMaxNorm = radialNorm;
          sampleCount++;
        }
        // Keep upper-half points (enclosed by helmet) quantized to 2mm to stay tiny
        if (_tmpVec.y >= minY) {
          const key = `${Math.round(_tmpVec.x * 500)}:${Math.round(_tmpVec.y * 500)}:${Math.round(_tmpVec.z * 500)}`;
          if (!dedup.has(key)) {
            dedup.add(key);
            envelopePoints.push({ x: _tmpVec.x, y: _tmpVec.y, z: _tmpVec.z });
          }
        }
      }
    }
  };

  collectFrom(craniumMeshes, 180);
  collectFrom(studMeshes, 24);

  const squareness =
    sampleCount === 0 || diagMaxNorm <= 0
      ? 0.9
      : THREE.MathUtils.clamp((diagMaxNorm - 1.02) / (1.36 - 1.02), 0, 1);

  return { squareness, envelopePoints };
}

/**
 * Introspects a character's Head bone and cranial meshes in local Head space
 * so helmets automatically adapt to any character model, scale, or future head shape.
 */
export function measureHeadFitProfile(headBone: THREE.Object3D): HeadFitProfile {
  headBone.updateMatrixWorld(true);

  const craniumMeshes: THREE.Mesh[] = [];
  const studMeshes: THREE.Mesh[] = [];
  const fallbackMeshes: THREE.Mesh[] = [];
  let studBox: THREE.Box3 | null = null;
  let faceBox: THREE.Box3 | null = null;
  const glassesBox = new THREE.Box3();
  let hasGlasses = false;

  headBone.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const part = mesh.userData?.r6Part as string | undefined;

    if (part === 'head_cranium') {
      craniumMeshes.push(mesh);
      return;
    }
    if (part === 'head_stud') {
      studMeshes.push(mesh);
      const b = new THREE.Box3();
      if (computeMeshBoundsInAncestorSpace(mesh, headBone, b)) {
        studBox = studBox ? studBox.union(b) : b;
      }
      return;
    }
    if (part === 'head_face') {
      const b = new THREE.Box3();
      if (computeMeshBoundsInAncestorSpace(mesh, headBone, b)) {
        faceBox = faceBox ? faceBox.union(b) : b;
      }
      return;
    }
    if (part === 'glasses' && isObjectChainVisibleUntil(mesh, headBone)) {
      if (computeMeshBoundsInAncestorSpace(mesh, headBone, _tmpBox)) {
        glassesBox.union(_tmpBox);
        hasGlasses = true;
      }
      return;
    }

    // Fallback for custom/future head rigs without r6Part tags
    if (!part && !mesh.userData?.isHelmetPart && !mesh.userData?.isHairOrHat) {
      if (computeMeshBoundsInAncestorSpace(mesh, headBone, _tmpBox)) {
        const size = _tmpBox.getSize(new THREE.Vector3());
        if (size.x > 0.14 && size.y > 0.14 && size.z > 0.14) {
          fallbackMeshes.push(mesh);
        }
      }
    }
  });

  const activeCranium = craniumMeshes.length > 0 ? craniumMeshes : fallbackMeshes;
  const craniumBox = new THREE.Box3();
  for (let i = 0; i < activeCranium.length; i++) {
    if (computeMeshBoundsInAncestorSpace(activeCranium[i], headBone, _tmpBox)) {
      craniumBox.union(_tmpBox);
    }
  }

  if (craniumBox.isEmpty()) {
    craniumBox.set(
      new THREE.Vector3(-0.20, -0.02, -0.20),
      new THREE.Vector3(0.20, 0.37, 0.20),
    );
  }

  const size = craniumBox.getSize(new THREE.Vector3());
  const center = craniumBox.getCenter(new THREE.Vector3());
  const cranium: CraniumBounds = {
    minX: craniumBox.min.x,
    maxX: craniumBox.max.x,
    minY: craniumBox.min.y,
    maxY: craniumBox.max.y,
    minZ: craniumBox.min.z,
    maxZ: craniumBox.max.z,
    width: Math.max(0.18, size.x),
    height: Math.max(0.18, size.y),
    depth: Math.max(0.18, size.z),
    centerX: center.x,
    centerY: center.y,
    centerZ: center.z,
  };

  const studTopY = studBox ? Math.max(cranium.maxY, (studBox as THREE.Box3).max.y) : cranium.maxY;

  let faceMinY = cranium.minY + cranium.height * 0.064;
  let faceMaxY = cranium.maxY - cranium.height * 0.064;
  let faceFrontZ = cranium.maxZ;
  if (faceBox) {
    const fb = faceBox as THREE.Box3;
    faceMinY = fb.min.y;
    faceMaxY = fb.max.y;
    faceFrontZ = Math.max(cranium.maxZ, fb.max.z);
  }

  const faceHeight = Math.max(0.12, faceMaxY - faceMinY);
  // Matches R6TextureGenerator.ts: eyeY = 0.44 * size, largest iris ry = 22/256, brow = eyeY - 35/256
  const eyeCenterY = faceMaxY - faceHeight * 0.44;
  const eyeTopY = faceMaxY - faceHeight * 0.352;
  const eyeBottomY = faceMaxY - faceHeight * 0.532;
  const browTopY = faceMaxY - faceHeight * 0.295;

  const { squareness, envelopePoints } = inspectCraniumGeometry(
    activeCranium,
    studMeshes,
    headBone,
    center,
    cranium.width * 0.5,
    cranium.depth * 0.5,
    cranium.minY + cranium.height * 0.45,
  );

  return {
    cranium,
    studTopY,
    faceFrontZ,
    faceMinY,
    faceMaxY,
    eyeCenterY,
    eyeTopY,
    eyeBottomY,
    browTopY,
    squareness,
    glassesFrontZ: hasGlasses ? glassesBox.max.z : faceFrontZ,
    glassesMaxX: hasGlasses ? Math.max(Math.abs(glassesBox.min.x), Math.abs(glassesBox.max.x)) : cranium.width * 0.5,
    glassesTopY: hasGlasses ? glassesBox.max.y : eyeTopY,
    hasGlasses,
    envelopePoints,
  };
}

function isObjectChainVisibleUntil(obj: THREE.Object3D, stopAt: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur && cur !== stopAt) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

const INNER_RX = 0.220;
const INNER_RZ = 0.222;
const INNER_APEX_Y = 0.158;
const TAPER_START_Y = 0.105;

function sampleInnerSurfaceAt(
  theta: number,
  localY: number,
  tier: HelmetTier,
  squareness: number,
  outPt: { x: number; z: number },
): { maxR: number; rimY: number } {
  const rimY = skirtOffsetY(theta, tier);
  let radialScale = 1.0;
  if (localY > TAPER_START_Y) {
    const t = THREE.MathUtils.clamp(
      (localY - TAPER_START_Y) / Math.max(1e-4, INNER_APEX_Y - TAPER_START_Y),
      0,
      1,
    );
    radialScale = Math.pow(Math.max(0, 1 - Math.pow(t, 2.35)), 0.44);
  } else if (localY < 0) {
    radialScale = 1.0 + Math.min(0.055, -localY * 0.32);
  }
  sampleContourXZ(theta, INNER_RX * radialScale, INNER_RZ * radialScale, squareness, outPt);
  return { maxR: Math.hypot(outPt.x, outPt.z), rimY };
}

/**
 * Solves automatic helmet position, proportions, pitch tilt, and sub-component clearances
 * for any measured HeadFitProfile and HelmetTier.
 */
export function solveHelmetFit(
  profile: HeadFitProfile,
  tier: HelmetTier,
): HelmetFitSolution {
  const { cranium, studTopY, eyeTopY, eyeBottomY, browTopY, faceFrontZ } = profile;

  let sx = THREE.MathUtils.clamp(cranium.width / CANONICAL_HEAD_W, 0.55, 2.1);
  let sz = THREE.MathUtils.clamp(cranium.depth / CANONICAL_HEAD_D, 0.55, 2.1);

  // Determine exact brow bottom height: comfortably above the eyes & brows without excessive forehead gap
  const minBrowY = Math.max(eyeTopY + 0.022 * (cranium.height / CANONICAL_HEAD_H), browTopY + 0.004);
  const desiredBrowY = Math.max(minBrowY, cranium.minY + cranium.height * 0.695);

  // Inner crown clears top of skull + stud cleanly with snug ~8mm cushion (no floating!)
  const studHeightAboveCrown = Math.max(0, studTopY - cranium.maxY);
  const crownHeadroom = Math.max(0.011, studHeightAboveCrown + 0.009) * (tier === 3 ? 1.15 : 1.0);
  const desiredInnerApexY = cranium.maxY + crownHeadroom;

  const targetSpanY = Math.max(0.085, desiredInnerApexY - desiredBrowY);
  let sy = THREE.MathUtils.clamp(targetSpanY / INNER_APEX_Y, 0.55, 2.1);

  // Subtle rearward tactical tilt (~ -2.0 deg) lifts brow naturally while seating nape down over occiput
  const rotationX = tier === 3 ? -0.030 : -0.035;

  // Account for slight pitch shift at front/top so tilted brow never dips below minBrowY
  const pitchBrowLift = 0.004 * sz;
  const posX = cranium.centerX;
  const posY = desiredBrowY + pitchBrowLift;
  const posZ = cranium.centerZ - 0.006 * sz;

  const squarenessBucket = Math.round(profile.squareness * 4) / 4;

  // Exact vertex-envelope containment guard:
  // If an unusual head shape (e.g. un-beveled sharp BoxGeometry or irregular sculpted skull) has upper corners
  // outside the canonical inner shell cavity, smoothly expand sy/sx/sz so every vertex sits cleanly inside
  if (profile.envelopePoints.length > 0) {
    const cosNeg = Math.cos(-rotationX);
    const sinNeg = Math.sin(-rotationX);
    const tmpInner = { x: 0, z: 0 };
    const minSafetyClearance = 0.009;
    const baseSy = sy;

    for (let iter = 0; iter < 16; iter++) {
      let maxVerticalPush = 0;
      let maxRadialRatioX = 1;
      let maxRadialRatioZ = 1;
      let hadViolation = false;

      for (let i = 0; i < profile.envelopePoints.length; i++) {
        const p = profile.envelopePoints[i];
        const dx = p.x - posX;
        const dy = p.y - posY;
        const dz = p.z - posZ;
        const ry = dy * cosNeg - dz * sinNeg;
        const rz = dy * sinNeg + dz * cosNeg;
        const lx = dx / sx;
        const ly = ry / sy;
        const lz = rz / sz;

        const theta = Math.atan2(lx, lz);
        const rimY = skirtOffsetY(theta, tier);
        if (ly < rimY + 0.002) continue;

        if (ly > INNER_APEX_Y - 0.004) {
          hadViolation = true;
          const neededSy = sy * ((ly + 0.009) / INNER_APEX_Y);
          maxVerticalPush = Math.max(maxVerticalPush, neededSy - sy);
        }

        const { maxR } = sampleInnerSurfaceAt(theta, ly, tier, squarenessBucket, tmpInner);
        const rLocal = Math.hypot(lx, lz);
        const requiredScale = (rLocal + minSafetyClearance / Math.min(sx, sz)) / Math.max(1e-4, maxR);
        if (requiredScale > 1.001) {
          hadViolation = true;
          const wx = Math.abs(Math.sin(theta));
          const wz = Math.abs(Math.cos(theta));
          // In upper taper zone, raise crown up to +24% first, then gently widen sx/sz so helmet stays realistic
          if (ly > TAPER_START_Y * 0.90 && sy < baseSy * 1.24) {
            maxVerticalPush = Math.max(maxVerticalPush, sy * 0.075);
            if (wx > 0.15) maxRadialRatioX = Math.max(maxRadialRatioX, 1 + (requiredScale - 1) * 0.35);
            if (wz > 0.15) maxRadialRatioZ = Math.max(maxRadialRatioZ, 1 + (requiredScale - 1) * 0.35);
          } else {
            if (wx > 0.15) maxRadialRatioX = Math.max(maxRadialRatioX, requiredScale);
            if (wz > 0.15) maxRadialRatioZ = Math.max(maxRadialRatioZ, requiredScale);
          }
        }
      }

      if (!hadViolation) break;
      if (maxVerticalPush > 0) {
        sy = Math.min(2.25, sy + Math.max(0.012, maxVerticalPush * 0.72));
      }
      if (maxRadialRatioX > 1.001) {
        sx = Math.min(2.25, sx * Math.min(1.12, maxRadialRatioX));
      }
      if (maxRadialRatioZ > 1.001) {
        sz = Math.min(2.25, sz * Math.min(1.12, maxRadialRatioZ));
      }
    }
  }

  // Outer shell half-extents at temple/brow band
  const outerHalfW = (INNER_RX + 0.020) * sx;
  const outerHalfD = (INNER_RZ + 0.020) * sz;

  // Visor positioning: clears front face AND any worn glasses/cyber_visor cleanly
  const minClearFrontZ = Math.max(
    faceFrontZ + 0.028 * sz,
    posZ + outerHalfD - 0.004 * sz,
    profile.hasGlasses ? profile.glassesFrontZ + 0.014 : 0,
  );
  const visorRadiusZ = Math.max(0.232 * sz, minClearFrontZ - posZ);
  const visorRadiusX = Math.max(
    outerHalfW + 0.004 * sx,
    profile.hasGlasses ? profile.glassesMaxX + 0.012 : 0,
  );

  // Visor seals snugly beneath pitched front brow rim down to just below eye line — translucent so eyes show clearly
  const browPitchRise = outerHalfD * Math.abs(rotationX);
  const visorTopY = posY + (0.006 + browPitchRise * 0.9) * sy;
  const visorBottomY = Math.max(
    cranium.minY + cranium.height * 0.43,
    eyeBottomY - 0.002 * (cranium.height / CANONICAL_HEAD_H),
  );

  return {
    tier,
    position: new THREE.Vector3(posX, posY, posZ),
    scale: new THREE.Vector3(sx, sy, sz),
    rotationX,
    squarenessBucket,
    browLocalY: posY,
    visorFrontZ: posZ + visorRadiusZ,
    visorTopY,
    visorBottomY,
    visorRadiusX,
    visorRadiusZ,
    railOffsetX: outerHalfW + 0.004 * sx,
    railY: posY + 0.028 * sy,
    shroudZ: posZ + outerHalfD + 0.002 * sz,
    shroudY: posY + 0.056 * sy,
  };
}

// =========================================================================
// Procedural Conforming Tactical Helmet Geometry Cache (Zero-Allocation Reuse)
// =========================================================================

interface CachedHelmetGeos {
  shell: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  rail: THREE.BufferGeometry;
  shroud: THREE.BufferGeometry;
  crest: THREE.BufferGeometry | null;
  earGuard: THREE.BufferGeometry | null;
  strap: THREE.BufferGeometry;
}

const HELMET_GEO_CACHE = new Map<string, CachedHelmetGeos>();
const VISOR_GEO_CACHE = new Map<string, THREE.BufferGeometry>();

function skirtOffsetY(theta: number, tier: HelmetTier): number {
  const cosT = Math.cos(theta); // +1 = front (+Z), -1 = back (-Z)
  const absSinT = Math.abs(Math.sin(theta)); // 1 = left/right sides (±X)

  // Front brow arch: slightly arched upward over nose/brows (+0.008 at center, 0 at temples)
  const frontFactor = Math.max(0, cosT);
  const rearFactor = Math.max(0, -cosT);
  const sideFactor = Math.pow(absSinT, 1.8);

  const browLift = frontFactor * 0.006;
  const earCut = sideFactor * (tier === 3 ? -0.028 : -0.010);
  const napeDrop = rearFactor * (tier === 3 ? -0.072 : tier === 2 ? -0.062 : -0.055);

  return browLift + earCut + napeDrop;
}

/**
 * Creates a thick-walled, watertight sculpted tactical helmet dome matching
 * the target cross-section squareness and tier silhouette.
 * Authored in local space where y = 0 is the brow line and y = 0.146 is inner crown apex.
 */
function createSculptedHelmetShellGeometry(
  tier: HelmetTier,
  squareness: number,
): THREE.BufferGeometry {
  const radialSegs = 40;
  const latSegs = 12;

  const innerRx = 0.220;
  const innerRz = 0.222;
  const wallThick = tier === 3 ? 0.022 : 0.019;
  const outerRx = innerRx + wallThick;
  const outerRz = innerRz + wallThick;
  const innerApexY = 0.158;
  const outerApexY = innerApexY + wallThick + (tier === 3 ? 0.005 : 0.002);

  // Height where horizontal radius starts tapering inward toward crown apex
  // Cranium bevel starts at canonical y = 0.334 => local y = 0.334 - 0.252 = 0.082
  const taperStartY = 0.105;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pt = { x: 0, z: 0 };
  const cols = radialSegs + 1;

  // Helper to push a ring grid (surface = outer or inner)
  const pushSurfaceGrid = (
    rxBase: number,
    rzBase: number,
    apexY: number,
    flipNormals: boolean,
  ): number => {
    const baseVertex = positions.length / 3;
    for (let j = 0; j <= latSegs; j++) {
      const v = j / latSegs; // 0 = bottom rim, 1 = apex
      for (let i = 0; i <= radialSegs; i++) {
        const u = i / radialSegs;
        const theta = u * Math.PI * 2;
        const rimY = skirtOffsetY(theta, tier);

        // Smooth interpolation from rimY up to apexY
        const y = rimY + (apexY - rimY) * Math.sin(v * Math.PI * 0.5);

        // Horizontal taper factor: stays >= 1.0 below taperStartY so R6 corners never clip!
        let radialScale = 1.0;
        if (y > taperStartY) {
          const t = THREE.MathUtils.clamp((y - taperStartY) / Math.max(1e-4, apexY - taperStartY), 0, 1);
          // Super-circular crown curvature keeps upper bevel headroom clear
          radialScale = Math.pow(Math.max(0, 1 - Math.pow(t, 2.35)), 0.44);
        } else if (y < 0) {
          // Subtle outward flare at rear nape skirt
          radialScale = 1.0 + Math.min(0.055, -y * 0.32);
        }

        // Slight tactical brim flare right at front brow edge
        if (v < 0.14 && Math.cos(theta) > 0.25) {
          radialScale += (1 - v / 0.14) * Math.cos(theta) * 0.018;
        }

        sampleContourXZ(theta, rxBase * radialScale, rzBase * radialScale, squareness, pt);
        positions.push(pt.x, y, pt.z);
        uvs.push(u, v);
      }
    }

    for (let j = 0; j < latSegs; j++) {
      for (let i = 0; i < radialSegs; i++) {
        const a = baseVertex + j * cols + i;
        const b = baseVertex + j * cols + (i + 1);
        const c = baseVertex + (j + 1) * cols + i;
        const d = baseVertex + (j + 1) * cols + (i + 1);
        if (flipNormals) {
          indices.push(a, c, b, b, c, d);
        } else {
          indices.push(a, b, c, b, d, c);
        }
      }
    }
    return baseVertex;
  };

  const outerBase = pushSurfaceGrid(outerRx, outerRz, outerApexY, false);
  const innerBase = pushSurfaceGrid(innerRx, innerRz, innerApexY, true);

  // Stitch bottom rim lip cleanly between outer ring j=0 and inner ring j=0
  for (let i = 0; i < radialSegs; i++) {
    const o0 = outerBase + i;
    const o1 = outerBase + i + 1;
    const i0 = innerBase + i;
    const i1 = innerBase + i + 1;
    indices.push(o0, i0, o1, o1, i0, i1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a contoured trim band hugging the exact brow-to-nape skirt perimeter.
 */
function createContouredRimGeometry(
  tier: HelmetTier,
  squareness: number,
): THREE.BufferGeometry {
  const radialSegs = 40;
  const innerR = 0.217;
  const wallThick = tier === 3 ? 0.022 : 0.019;
  const outerR = innerR + wallThick + 0.0045;
  const bandHalfH = tier === 3 ? 0.011 : 0.009;

  const positions: number[] = [];
  const indices: number[] = [];
  const ptOut = { x: 0, z: 0 };
  const ptIn = { x: 0, z: 0 };

  // 4 vertices per angle: outer-top (0), outer-bot (1), inner-bot (2), inner-top (3)
  for (let i = 0; i <= radialSegs; i++) {
    const theta = (i / radialSegs) * Math.PI * 2;
    const baseY = skirtOffsetY(theta, tier);
    const flare = Math.cos(theta) > 0.25 ? Math.cos(theta) * 0.004 : 0;
    sampleContourXZ(theta, outerR + flare, outerR + flare + 0.002, squareness, ptOut);
    sampleContourXZ(theta, innerR, innerR + 0.002, squareness, ptIn);

    positions.push(
      ptOut.x, baseY + bandHalfH, ptOut.z,
      ptOut.x, baseY - bandHalfH * 0.85, ptOut.z,
      ptIn.x, baseY - bandHalfH * 0.85, ptIn.z,
      ptIn.x, baseY + bandHalfH, ptIn.z,
    );
  }

  for (let i = 0; i < radialSegs; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Outer wall
    indices.push(a + 0, a + 1, b + 0, b + 0, a + 1, b + 1);
    // Bottom face
    indices.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
    // Top bevel face
    indices.push(a + 3, a + 0, b + 3, b + 3, a + 0, b + 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a contoured curved ballistic visor conforming cleanly to the front head/glasses envelope.
 */
function getFittedVisorGeometry(
  visorRx: number,
  visorRz: number,
  visorH: number,
  squareness: number,
): THREE.BufferGeometry {
  const key = `${visorRx.toFixed(3)}:${visorRz.toFixed(3)}:${visorH.toFixed(3)}:${squareness.toFixed(2)}`;
  const existing = VISOR_GEO_CACHE.get(key);
  if (existing) return existing;

  const arcSegs = 24;
  const maxTheta = 0.88; // ~ +/- 50 deg wraps around front brow to temple ARC rails cleanly
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const pt = { x: 0, z: 0 };

  for (let j = 0; j <= 1; j++) {
    const v = j;
    const y = (v - 0.5) * visorH;
    // Slight ballistic inward chin tuck on bottom edge without touching nose/face
    const zScale = v === 0 ? 0.96 : 1.0;
    for (let i = 0; i <= arcSegs; i++) {
      const u = i / arcSegs;
      const theta = -maxTheta + u * maxTheta * 2;
      sampleContourXZ(theta, visorRx, visorRz * zScale, squareness * 0.72, pt);
      positions.push(pt.x, y, pt.z);
      uvs.push(u, v);
    }
  }

  const cols = arcSegs + 1;
  for (let i = 0; i < arcSegs; i++) {
    const a = i;
    const b = i + 1;
    const c = cols + i;
    const d = cols + i + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  VISOR_GEO_CACHE.set(key, geo);
  return geo;
}

function getSharedHelmetGeos(tier: HelmetTier, squarenessBucket: number): CachedHelmetGeos {
  const key = `${tier}:${squarenessBucket.toFixed(2)}`;
  let entry = HELMET_GEO_CACHE.get(key);
  if (!entry) {
    entry = {
      shell: createSculptedHelmetShellGeometry(tier, squarenessBucket),
      rim: createContouredRimGeometry(tier, squarenessBucket),
      rail: new THREE.BoxGeometry(0.018, 0.032, 0.145),
      shroud: new THREE.BoxGeometry(0.088, 0.058, 0.022),
      crest: tier === 3 ? new THREE.BoxGeometry(0.068, 0.022, 0.34) : null,
      earGuard: tier === 3 ? new THREE.BoxGeometry(0.024, 0.068, 0.135) : null,
      strap: new THREE.BoxGeometry(0.016, 0.115, 0.022),
    };
    HELMET_GEO_CACHE.set(key, entry);
  }
  return entry;
}

export interface HelmetMaterials {
  shellMat: THREE.MeshStandardMaterial;
  trimMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;
}

const SHARED_HELMET_MATS = new Map<HelmetTier, HelmetMaterials>();

export function getSharedHelmetMaterials(tier: HelmetTier): HelmetMaterials {
  let entry = SHARED_HELMET_MATS.get(tier);
  if (!entry) {
    const spec = getArmorOption(getArmorIdFromTier(tier));
    entry = {
      shellMat: new THREE.MeshStandardMaterial({
        color: tier === 1 ? '#4b5563' : tier === 2 ? '#1e3a5f' : '#18181b',
        roughness: tier === 3 ? 0.34 : 0.42,
        metalness: tier === 3 ? 0.74 : 0.62,
      }),
      trimMat: new THREE.MeshStandardMaterial({
        color: spec.trimHex,
        roughness: 0.28,
        metalness: 0.80,
      }),
      visorMat: new THREE.MeshStandardMaterial({
        color: spec.glowHex,
        emissive: spec.glowHex,
        emissiveIntensity: 0.48,
        transparent: true,
        opacity: 0.36,
        roughness: 0.10,
        metalness: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
    SHARED_HELMET_MATS.set(tier, entry);
  }
  return entry;
}

export interface BuiltHelmetResult {
  group: THREE.Group;
  fit: HelmetFitSolution;
  shadowMeshes: THREE.Mesh[];
  detailMeshes: THREE.Object3D[];
}

/**
 * Builds and mounts a complete, head-fitted ballistic helmet assembly in headBone local space.
 * Preserves Tier 1 / Tier 2 / Tier 3 silhouettes & colorways while eliminating floating & clipping.
 */
export function buildFittedHelmetAssembly(
  profile: HeadFitProfile,
  tier: HelmetTier,
  castShadow = true,
  microDetailVisible = true,
): BuiltHelmetResult {
  const fit = solveHelmetFit(profile, tier);
  const geos = getSharedHelmetGeos(tier, fit.squarenessBucket);
  const mats = getSharedHelmetMaterials(tier);

  const root = new THREE.Group();
  root.name = `FittedHelmet_T${tier}`;
  const shadowMeshes: THREE.Mesh[] = [];
  const detailMeshes: THREE.Object3D[] = [];

  // 1. Primary sculpted dome + contoured rim + side rails + shroud (anchored with fitted pos/scale/pitch)
  const shellPivot = new THREE.Group();
  shellPivot.name = 'HelmetShellPivot';
  shellPivot.position.copy(fit.position);
  shellPivot.scale.copy(fit.scale);
  shellPivot.rotation.x = fit.rotationX;
  root.add(shellPivot);

  const shellMesh = new THREE.Mesh(geos.shell, mats.shellMat);
  shellMesh.name = 'HelmetDome';
  shellMesh.castShadow = castShadow;
  shellMesh.receiveShadow = true;
  shellMesh.userData.isHelmetPart = true;
  shadowMeshes.push(shellMesh);
  shellPivot.add(shellMesh);

  const rimMesh = new THREE.Mesh(geos.rim, mats.trimMat);
  rimMesh.name = 'HelmetRim';
  rimMesh.castShadow = castShadow;
  rimMesh.userData.isHelmetPart = true;
  shellPivot.add(rimMesh);

  // Side ARC rails mounted flush along temple flanks
  const railLocalX = 0.238;
  const railLocalY = 0.032;
  const railLocalZ = -0.006;
  const railL = new THREE.Mesh(geos.rail, mats.trimMat);
  railL.name = 'HelmetRailL';
  railL.position.set(railLocalX, railLocalY, railLocalZ);
  railL.userData.isHelmetPart = true;

  const railR = new THREE.Mesh(geos.rail, mats.trimMat);
  railR.name = 'HelmetRailR';
  railR.position.set(-railLocalX, railLocalY, railLocalZ);
  railR.userData.isHelmetPart = true;
  shellPivot.add(railL, railR);

  // Side retention strap accents framing lower jaw cleanly outside head corners
  const strapL = new THREE.Mesh(geos.strap, mats.shellMat);
  strapL.position.set(0.218, -0.055, 0.035);
  strapL.rotation.z = 0.06;
  strapL.visible = microDetailVisible;
  strapL.userData.isHelmetPart = true;

  const strapR = new THREE.Mesh(geos.strap, mats.shellMat);
  strapR.position.set(-0.218, -0.055, 0.035);
  strapR.rotation.z = -0.06;
  strapR.visible = microDetailVisible;
  strapR.userData.isHelmetPart = true;

  detailMeshes.push(strapL, strapR);
  shellPivot.add(strapL, strapR);

  // Tier 2 & Tier 3 front NVG shroud mount on forehead
  if (tier >= 2) {
    const shroud = new THREE.Mesh(geos.shroud, mats.trimMat);
    shroud.name = 'HelmetNVGShroud';
    shroud.position.set(0, 0.064, 0.239);
    shroud.rotation.x = -0.22;
    shroud.userData.isHelmetPart = true;
    shellPivot.add(shroud);
  }

  // Tier 3 raised ballistic crown crest + armored ear deflector plates
  if (tier === 3 && geos.crest && geos.earGuard) {
    const crest = new THREE.Mesh(geos.crest, mats.trimMat);
    crest.name = 'HelmetCrownCrest';
    crest.position.set(0, 0.178, -0.015);
    crest.userData.isHelmetPart = true;

    const earL = new THREE.Mesh(geos.earGuard, mats.shellMat);
    earL.position.set(0.244, -0.018, -0.02);
    earL.userData.isHelmetPart = true;

    const earR = new THREE.Mesh(geos.earGuard, mats.shellMat);
    earR.position.set(-0.244, -0.018, -0.02);
    earR.userData.isHelmetPart = true;

    shellPivot.add(crest, earL, earR);
  }

  // Tier 2 & Tier 3 translucent tactical ballistic visor
  // Placed directly in head-local coords using solved eye/glasses clearance so it never covers/clips eyes or glasses
  if (tier >= 2) {
    const visorH = Math.max(0.064, fit.visorTopY - fit.visorBottomY);
    const visorCenterY = (fit.visorTopY + fit.visorBottomY) * 0.5;
    const visorGeo = getFittedVisorGeometry(
      fit.visorRadiusX,
      fit.visorRadiusZ,
      visorH,
      fit.squarenessBucket,
    );
    const visorMesh = new THREE.Mesh(visorGeo, mats.visorMat);
    visorMesh.name = 'HelmetVisor';
    visorMesh.position.set(fit.position.x, visorCenterY, fit.position.z);
    visorMesh.renderOrder = 2;
    visorMesh.userData.isHelmetPart = true;
    root.add(visorMesh);

    if (tier === 3) {
      // Sleek gold brow trim strip above the visor
      const browBarGeo = getFittedVisorGeometry(
        fit.visorRadiusX + 0.002,
        fit.visorRadiusZ + 0.002,
        0.011,
        fit.squarenessBucket,
      );
      const browBar = new THREE.Mesh(browBarGeo, mats.trimMat);
      browBar.name = 'HelmetVisorTrim';
      browBar.position.set(fit.position.x, fit.visorTopY + 0.002, fit.position.z);
      browBar.userData.isHelmetPart = true;
      root.add(browBar);
    }
  }

  return {
    group: root,
    fit,
    shadowMeshes,
    detailMeshes,
  };
}
