import * as THREE from 'three';
import { clamp } from '../utils/MathUtils';

export interface RockCollider {
  x: number;
  z: number;
  baseY: number;
  rx: number;
  rz: number;
  height: number;
  cosY: number;
  sinY: number;
}

const CROWN_U = 0.48;
const SHOULDER_FRAC = 0.86;
const SKIRT_U = 1.18;
const SKIRT_DEPTH = 0.42;

/**
 * Trig-free angular lobe modulation in unit-circle direction (cx, cz).
 * Produces an organic multi-faceted boulder silhouette in [0.81, 1.19].
 */
export function rockLobeScale(cx: number, cz: number): number {
  const cos2 = cx * cx - cz * cz;
  const sin2 = 2 * cx * cz;
  const cos3 = cx * (4 * cx * cx - 3);
  return 1.0 + 0.08 * cos2 + 0.05 * sin2 + 0.06 * cos3;
}

/**
 * Normalized height fraction [-SKIRT_DEPTH..1] at normalized radial coordinate u in [0..SKIRT_U].
 * Crown (u <= 0.48) forms a broad walkable plateau (0.86..1.0);
 * Flank (0.48 < u <= 1.0) forms a continuous climbable slope down to 0;
 * Skirt (1.0 < u <= 1.18) flares gently down to -SKIRT_DEPTH so sloped terrain edges stay walkable.
 */
export function rockHeightFrac(u: number): number {
  if (u <= 0) return 1.0;
  if (u >= SKIRT_U) return -SKIRT_DEPTH;
  if (u <= CROWN_U) {
    const t = u / CROWN_U;
    return 1.0 - (1.0 - SHOULDER_FRAC) * t * t;
  }
  if (u <= 1.0) {
    const s = (u - CROWN_U) / (1.0 - CROWN_U);
    return SHOULDER_FRAC * (1.0 - s);
  }
  const sk = (u - 1.0) / (SKIRT_U - 1.0);
  return -SKIRT_DEPTH * sk;
}

/**
 * Inverse of rockHeightFrac for u in [CROWN_U..SKIRT_U] given frac in [-SKIRT_DEPTH..SHOULDER_FRAC].
 */
export function rockInverseFlankU(frac: number): number {
  if (frac <= -SKIRT_DEPTH) return SKIRT_U;
  if (frac >= SHOULDER_FRAC) return CROWN_U;
  if (frac >= 0) {
    const s = 1.0 - frac / SHOULDER_FRAC;
    return CROWN_U + (1.0 - CROWN_U) * s;
  }
  const sk = -frac / SKIRT_DEPTH;
  return 1.0 + (SKIRT_U - 1.0) * sk;
}

/**
 * Builds a unit rock geometry (flared skirt at y=-0.42, base rim at y=0, apex at y=1, radius ~1*lobe)
 * whose surface matches evaluateRockSurfaceY 1:1 when scaled by (rx, height, rz).
 */
export function createSculptedRockGeometry(radialSegs = 24): THREE.BufferGeometry {
  const ringsU = [0.18, 0.34, CROWN_U, 0.62, 0.76, 0.89, 1.0];
  const positions: number[] = [];

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ): void => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  const ringPoints = (u: number, yOverride?: number): Array<[number, number, number]> => {
    const y = yOverride ?? rockHeightFrac(u);
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < radialSegs; i++) {
      const ang = (i / radialSegs) * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const r = u * rockLobeScale(ca, sa);
      pts.push([ca * r, y, sa * r]);
    }
    return pts;
  };

  const apexY = 1.0;
  const innerRing = ringPoints(ringsU[0]);
  for (let i = 0; i < radialSegs; i++) {
    const p1 = innerRing[i];
    const p2 = innerRing[(i + 1) % radialSegs];
    // Counter-clockwise from above -> outward +Y normal
    pushTri(0, apexY, 0, p2[0], p2[1], p2[2], p1[0], p1[1], p1[2]);
  }

  let prevRing = innerRing;
  for (let r = 1; r < ringsU.length; r++) {
    const nextRing = ringPoints(ringsU[r]);
    for (let i = 0; i < radialSegs; i++) {
      const j = (i + 1) % radialSegs;
      const a = prevRing[i];
      const b = prevRing[j];
      const c = nextRing[j];
      const d = nextRing[i];
      pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      pushTri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    }
    prevRing = nextRing;
  }

  // Flared buried skirt matching evaluateRockSurfaceY in [1.0..SKIRT_U] so sloped terrain edges are seamless and walkable
  const skirtRing = ringPoints(SKIRT_U, -SKIRT_DEPTH);
  for (let i = 0; i < radialSegs; i++) {
    const j = (i + 1) % radialSegs;
    const a = prevRing[i];
    const b = prevRing[j];
    const c = skirtRing[j];
    const d = skirtRing[i];
    pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    pushTri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Exact rock surface world Y at (worldX, worldZ), or null if outside rock + flared skirt footprint.
 */
export function evaluateRockSurfaceY(
  rock: RockCollider,
  worldX: number,
  worldZ: number,
): number | null {
  const dx = worldX - rock.x;
  const dz = worldZ - rock.z;
  const localX = dx * rock.cosY - dz * rock.sinY;
  const localZ = dx * rock.sinY + dz * rock.cosY;
  const nx = localX / rock.rx;
  const nz = localZ / rock.rz;
  const rNormSq = nx * nx + nz * nz;
  if (rNormSq > 2.02) return null; // (SKIRT_U * 1.19)^2 outer lobe bound

  if (rNormSq < 1e-8) {
    return rock.baseY + rock.height;
  }
  const rNorm = Math.sqrt(rNormSq);
  const invR = 1 / rNorm;
  const lobe = rockLobeScale(nx * invR, nz * invR);
  const u = rNorm / lobe;
  if (u >= SKIRT_U) return null;

  return rock.baseY + rock.height * rockHeightFrac(u);
}

/**
 * Resolves horizontal collision ONLY against sheer un-climbable rock faces taller than step-up height.
 * Walkable rock flanks and crowns allow players and bots to step/climb naturally on top of rocks
 * without getting blocked, stuck, or pushed away.
 */
export function resolveRockHorizontalCollision(
  rock: RockCollider,
  position: THREE.Vector3,
  radius: number,
): void {
  // Player/bot step-up clearance (~0.74m matches MapManager ground snap)
  const stepCutoffY = position.y + 0.74;
  const shoulderY = rock.baseY + rock.height * SHOULDER_FRAC;
  if (stepCutoffY >= shoulderY) {
    return;
  }

  const dx = position.x - rock.x;
  const dz = position.z - rock.z;
  const localX = dx * rock.cosY - dz * rock.sinY;
  const localZ = dx * rock.sinY + dz * rock.cosY;

  const nx = localX / rock.rx;
  const nz = localZ / rock.rz;
  const rNormSq = nx * nx + nz * nz;

  const frac = clamp((stepCutoffY - rock.baseY) / Math.max(0.05, rock.height), -SKIRT_DEPTH, SHOULDER_FRAC);
  const uWall = rockInverseFlankU(frac);

  const minR = Math.max(0.25, Math.min(rock.rx, rock.rz));
  if (rNormSq > (uWall * 1.2 + radius / minR) ** 2) {
    return;
  }

  let dirNx = 1;
  let dirNz = 0;
  let rNorm = 0;
  if (rNormSq > 1e-8) {
    rNorm = Math.sqrt(rNormSq);
    dirNx = nx / rNorm;
    dirNz = nz / rNorm;
  }

  const lobe = rockLobeScale(dirNx, dirNz);
  const uAtPlayer = rNorm / Math.max(0.2, lobe);

  // Measure local flank slope along this radial azimuth
  const edgeLx = dirNx * lobe * rock.rx;
  const edgeLz = dirNz * lobe * rock.rz;
  const flankHorizRun = (1.0 - CROWN_U) * Math.hypot(edgeLx, edgeLz);
  const flankRise = rock.height * SHOULDER_FRAC;
  const localSlope = flankRise / Math.max(0.15, flankHorizRun);

  // If the rock flank is climbable and player's feet aren't trapped beneath a tall overhang,
  // allow smooth walking/climbing onto and across the rock without pushing away.
  if (localSlope <= 1.95) {
    const surfAtPlayer = uAtPlayer < SKIRT_U ? rock.baseY + rock.height * rockHeightFrac(uAtPlayer) : null;
    if (surfAtPlayer === null || surfAtPlayer <= stepCutoffY) {
      return;
    }
  }

  // Only reached for genuinely sheer rock faces (localSlope > 1.95) or if somehow beneath a tall rock surface
  const wallLx = dirNx * uWall * lobe * rock.rx;
  const wallLz = dirNz * uWall * lobe * rock.rz;
  const distNow = Math.hypot(localX, localZ);
  const wallDist = Math.hypot(wallLx, wallLz);
  const minAllowed = wallDist + radius * 0.55;

  if (distNow < minAllowed) {
    const overlap = minAllowed - distNow;
    // Push along outward ellipse normal (not radial center line) so tangential strafing along rocks slides smoothly
    const gLx = dirNx / Math.max(0.2, rock.rx);
    const gLz = dirNz / Math.max(0.2, rock.rz);
    const gLen = Math.hypot(gLx, gLz) || 1;
    const ux = gLx / gLen;
    const uz = gLz / gLen;
    const pushLocalX = ux * overlap;
    const pushLocalZ = uz * overlap;

    // Inverse rotate local -> world: worldX = cx + lx*cosY + lz*sinY, worldZ = cz - lx*sinY + lz*cosY
    position.x += pushLocalX * rock.cosY + pushLocalZ * rock.sinY;
    position.z += -pushLocalX * rock.sinY + pushLocalZ * rock.cosY;
  }
}

/**
 * Ray-vs-rock intersection returning hit t in [minT, maxT] and outward normal, or null.
 */
export function intersectRockRay(
  rock: RockCollider,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minT: number,
  maxT: number,
  outNormal?: { nx: number; ny: number; nz: number },
): number | null {
  const maxR = Math.max(rock.rx, rock.rz) * 1.42 + 0.05;
  const minY = rock.baseY - rock.height * SKIRT_DEPTH - 0.05;
  const maxY = rock.baseY + rock.height + 0.05;

  // Quick ray vs bounding sphere/slab reject
  const relX = ox - rock.x;
  const relZ = oz - rock.z;
  const horizSq = dx * dx + dz * dz;

  let tEnter = minT;
  let tExit = maxT;

  if (Math.abs(dy) < 1e-6) {
    if (oy < minY || oy > maxY) return null;
  } else {
    let ty1 = (minY - oy) / dy;
    let ty2 = (maxY - oy) / dy;
    if (ty1 > ty2) {
      const tmp = ty1;
      ty1 = ty2;
      ty2 = tmp;
    }
    tEnter = Math.max(tEnter, ty1);
    tExit = Math.min(tExit, ty2);
    if (tEnter > tExit) return null;
  }

  if (horizSq > 1e-8) {
    const bDot = relX * dx + relZ * dz;
    const c = relX * relX + relZ * relZ - maxR * maxR;
    const disc = bDot * bDot - horizSq * c;
    if (disc < 0) return null;
    const sqrtD = Math.sqrt(disc);
    const tc1 = (-bDot - sqrtD) / horizSq;
    const tc2 = (-bDot + sqrtD) / horizSq;
    tEnter = Math.max(tEnter, tc1);
    tExit = Math.min(tExit, tc2);
    if (tEnter > tExit) return null;
  } else if (relX * relX + relZ * relZ > maxR * maxR) {
    return null;
  }

  const span = tExit - tEnter;
  if (span <= 0) return null;

  const steps = Math.min(14, Math.max(6, Math.ceil(span / 0.25)));
  let prevT = tEnter;
  const surfAt = (t: number): number | null =>
    evaluateRockSurfaceY(rock, ox + dx * t, oz + dz * t);

  const firstSurf = surfAt(prevT);
  if (firstSurf !== null && oy + dy * prevT <= firstSurf + 0.02) {
    if (outNormal) {
      outNormal.nx = 0;
      outNormal.ny = 1;
      outNormal.nz = 0;
    }
    return prevT;
  }

  for (let i = 1; i <= steps; i++) {
    const curT = tEnter + (span * i) / steps;
    const sx = ox + dx * curT;
    const sy = oy + dy * curT;
    const sz = oz + dz * curT;
    const surf = evaluateRockSurfaceY(rock, sx, sz);
    if (surf !== null && sy <= surf + 0.02) {
      let lo = prevT;
      let hi = curT;
      for (let b = 0; b < 5; b++) {
        const mid = (lo + hi) * 0.5;
        const mSurf = evaluateRockSurfaceY(rock, ox + dx * mid, oz + dz * mid);
        if (mSurf !== null && oy + dy * mid <= mSurf + 0.01) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      if (outNormal) {
        const hx = ox + dx * hi;
        const hz = oz + dz * hi;
        const eps = 0.14;
        const base = rock.baseY;
        const hL = evaluateRockSurfaceY(rock, hx - eps, hz) ?? base;
        const hR = evaluateRockSurfaceY(rock, hx + eps, hz) ?? base;
        const hD = evaluateRockSurfaceY(rock, hx, hz - eps) ?? base;
        const hU = evaluateRockSurfaceY(rock, hx, hz + eps) ?? base;
        const gnx = hL - hR;
        const gny = 2 * eps;
        const gnz = hD - hU;
        const nLen = Math.hypot(gnx, gny, gnz) || 1;
        outNormal.nx = gnx / nLen;
        outNormal.ny = gny / nLen;
        outNormal.nz = gnz / nLen;
      }
      return hi;
    }
    prevT = curT;
  }

  return null;
}
