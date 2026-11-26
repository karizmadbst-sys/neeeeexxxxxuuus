import { clamp } from '../utils/MathUtils';
import type { MapConfig, RoadSegmentSpec } from './MapData';

export interface BuildingPad {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  maxExtent: number;
  cosY: number;
  sinY: number;
  targetY: number;
}

export const FOREST_RIVER_WATER_Y = -1.25;
export const SNOW_LAKE_CENTER_X = 112;
export const SNOW_LAKE_CENTER_Z = -124;
export const SNOW_LAKE_RX = 56;
export const SNOW_LAKE_RZ = 46;
export const SNOW_LAKE_ICE_Y = -0.35;

export function getForestRiverCenterZ(x: number): number {
  return 132 + Math.sin(x * 0.009) * 34;
}

export function getForestRiverHalfWidth(x: number): number {
  return 10.5 + Math.cos(x * 0.014) * 2.2;
}

/**
 * Returns 0..1 indicating how strongly (x, z) lies inside the Forest river channel.
 * Maintains a continuous submerged riverbed across the entire valley (bridges span cleanly above).
 */
export function getForestRiverMask(
  x: number,
  z: number,
  _roads?: readonly RoadSegmentSpec[],
): number {
  if (Math.abs(x) > 505) return 0;
  const rz = getForestRiverCenterZ(x);
  const hw = getForestRiverHalfWidth(x);
  const dist = Math.abs(z - rz);
  if (dist >= hw + 5.5) return 0;

  let mask = 1 - clamp((dist - hw * 0.35) / (hw * 0.65 + 5.5), 0, 1);
  mask = mask * mask * (3 - 2 * mask);
  return mask;
}

/**
 * Returns 0..1 mask for the Snow map's Frozen Glacier Lake in the NE mid-basin.
 */
export function getSnowLakeMask(x: number, z: number): number {
  const nx = (x - SNOW_LAKE_CENTER_X) / SNOW_LAKE_RX;
  const nz = (z - SNOW_LAKE_CENTER_Z) / SNOW_LAKE_RZ;
  const r = Math.hypot(nx, nz);
  if (r >= 1.24) return 0;
  const t = clamp((r - 0.78) / 0.46, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Computes natural rolling biome terrain elevation before flat building-pad grading.
 */
export function computeRawTerrainY(config: MapConfig, x: number, z: number): number {
  const dist = Math.hypot(x, z);
  if (config.isWaitingArena) {
    if (dist <= 84) return 0;
    const edgeRamp = clamp((dist - 84) / 18, 0, 1);
    const subtleWave = Math.sin(x * 0.045) * Math.cos(z * 0.045) * 0.35;
    const coastalDrop = clamp((dist - 102) / 28, 0, 1);
    return edgeRamp * subtleWave - coastalDrop * 2.4;
  }

  if (config.isTrainingGround) {
    // 1. Flat zone masks for Hero Container Yard, Armory Spawn, and Shooting Range Lanes
    const yardOverX = Math.max(0, Math.abs(x) - 34);
    const yardOverZ = Math.max(0, Math.abs(z) - 31);
    const yardBlend = clamp(Math.hypot(yardOverX, yardOverZ) / 16, 0, 1);

    const spawnOverX = Math.max(0, Math.abs(x) - 18);
    const spawnOverZ = Math.max(0, Math.abs(z - 38) - 14);
    const spawnBlend = clamp(Math.hypot(spawnOverX, spawnOverZ) / 12, 0, 1);

    // Shooting Range flat corridor: x in [-114, -40], z in [-160, +28]
    const rangeOverX = Math.max(0, Math.abs(x + 77) - 37);
    const rangeOverZ = Math.max(0, Math.abs(z + 66) - 94);
    const rangeBlend = clamp(Math.hypot(rangeOverX, rangeOverZ) / 14, 0, 1);

    // Damage Testing Zone flat pad: x in [+32, +65], z in [+4, +58]
    const dmgOverX = Math.max(0, Math.abs(x - 48.5) - 16.5);
    const dmgOverZ = Math.max(0, Math.abs(z - 31) - 27);
    const dmgBlend = clamp(Math.hypot(dmgOverX, dmgOverZ) / 12, 0, 1);

    // Obstacle Course & Movement Training flat pad: x in [-75, -27], z in [+37, +86]
    const obsOverX = Math.max(0, Math.abs(x + 51) - 24);
    const obsOverZ = Math.max(0, Math.abs(z - 61.5) - 24.5);
    const obsBlend = clamp(Math.hypot(obsOverX, obsOverZ) / 12, 0, 1);

    // Open Combat Skirmish Plaza flat pad: x in [+34, +68], z in [-54, -8]
    const skOverX = Math.max(0, Math.abs(x - 51) - 17);
    const skOverZ = Math.max(0, Math.abs(z + 31) - 23);
    const skBlend = clamp(Math.hypot(skOverX, skOverZ) / 12, 0, 1);

    const flatBlend = Math.min(yardBlend, spawnBlend, rangeBlend, dmgBlend, obsBlend, skBlend);
    const smoothFlat = flatBlend * flatBlend * (3 - 2 * flatBlend);

    // 2. Rolling green meadow hills
    const hillWaves =
      Math.sin(x * 0.015 + 0.4) * Math.cos(z * 0.014 - 0.3) * 2.4 +
      Math.sin((x + z) * 0.022) * 1.15;

    // Prominent North Sniper Overlook Hill around (16, -215)
    const sniperDist = Math.hypot((x - 16) / 48, (z + 215) / 38);
    const sniperHill =
      sniperDist < 1.35 ? Math.pow(1 - clamp((sniperDist - 0.28) / 1.07, 0, 1), 1.6) * 10.5 : 0;

    // Gentle SW & SE forested hills
    const swDist = Math.hypot((x + 175) / 55, (z - 175) / 50);
    const swHill =
      swDist < 1.25 ? (1 - clamp((swDist - 0.3) / 0.95, 0, 1)) * 6.8 : 0;

    const seDist = Math.hypot((x - 190) / 56, (z - 165) / 50);
    const seHill =
      seDist < 1.25 ? (1 - clamp((seDist - 0.3) / 0.95, 0, 1)) * 6.2 : 0;

    // 3. Natural 360-degree enclosing mountain basin wall starting at r = 296m
    const rimT = clamp((dist - 296) / 120, 0, 1.35);
    const ridgeNoise =
      1.0 +
      0.22 * Math.sin(Math.atan2(z, x) * 9 + dist * 0.03) +
      0.14 * Math.cos(Math.atan2(z, x) * 15 - dist * 0.02);
    const mountainWall = rimT > 0 ? Math.pow(rimT, 1.55) * 44 * ridgeNoise : 0;

    return smoothFlat * (hillWaves + sniperHill + swHill + seHill) + mountainWall;
  }

  if (dist <= 11.5) return 0;

  const centerBlend = clamp((dist - 11.5) / 26, 0, 1);
  const f = config.terrainFrequency;
  const amp = config.terrainAmplitude;

  const primaryWave =
    Math.sin(x * f) * Math.cos(z * f) * amp +
    Math.sin((x - z) * f * 0.68) * (amp * 0.52) +
    Math.cos((x * 0.45 + z * 0.88) * f * 1.35) * (amp * 0.28);

  let biomeDetail = 0;

  if (config.biome === 'desert') {
    // Asymmetric rolling sand dunes + two elevated flat-topped mesa overlooks in open zones
    const dune = Math.sin(x * 0.032 + Math.sin(z * 0.015) * 1.4) * 1.15;
    const mesa1 = Math.hypot((x + 140) / 52, (z + 390) / 42);
    const mesa2 = Math.hypot((x - 145) / 48, (z - 405) / 40);
    const lift1 = mesa1 < 1.25 ? (1 - clamp((mesa1 - 0.55) / 0.7, 0, 1)) * 6.5 : 0;
    const lift2 = mesa2 < 1.25 ? (1 - clamp((mesa2 - 0.55) / 0.7, 0, 1)) * 5.8 : 0;
    biomeDetail = dune + Math.max(lift1, lift2);
  } else if (config.biome === 'forest') {
    // Gentle wooded hills (riverbank grading & carving applied smoothly below)
    const ridge = Math.sin(x * 0.0085 + 0.8) * Math.cos(z * 0.0095 - 0.4) * 2.1;
    biomeDetail = ridge;
  } else {
    // Snow alpine valleys + flat frozen lake basin
    const ridge = Math.cos(x * 0.009 - 0.5) * Math.sin(z * 0.0095 + 0.6) * 2.2;
    biomeDetail = ridge;
  }

  const rimRise = Math.max(0, dist - (config.radiusMeters - 12)) * 0.16;
  let y = centerBlend * (primaryWave + biomeDetail + rimRise);

  if (config.biome === 'forest') {
    if (Math.abs(x) <= 520) {
      const rz = getForestRiverCenterZ(x);
      const hw = getForestRiverHalfWidth(x);
      const riverDist = Math.abs(z - rz);

      // Grade surrounding riverbanks naturally above water surface so the water never floats
      if (riverDist < hw + 34) {
        const bankT = clamp((riverDist - (hw + 2.5)) / 31.5, 0, 1);
        const bankSupport = 1 - bankT * bankT * (3 - 2 * bankT);
        const minBankY = FOREST_RIVER_WATER_Y + 0.78;
        if (y < minBankY) {
          y += (minBankY - y) * bankSupport;
        }
      }

      // Smoothly carve the submerged channel bed so water meets the sloping banks naturally
      const riverMask = getForestRiverMask(x, z);
      if (riverMask > 0.001) {
        const riverBedY = FOREST_RIVER_WATER_Y - 1.35;
        y = y * (1 - riverMask) + riverBedY * riverMask;
      }
    }
  } else if (config.biome === 'snow') {
    const nx = (x - SNOW_LAKE_CENTER_X) / SNOW_LAKE_RX;
    const nz = (z - SNOW_LAKE_CENTER_Z) / SNOW_LAKE_RZ;
    const r = Math.hypot(nx, nz);
    // Ensure snowy shoreline collar around the frozen lake sits naturally above ice level
    if (r < 1.68) {
      const collarT = clamp((r - 1.02) / 0.66, 0, 1);
      const collarWeight = 1 - collarT * collarT * (3 - 2 * collarT);
      const minShoreY = SNOW_LAKE_ICE_Y + 0.58;
      if (y < minShoreY) {
        y += (minShoreY - y) * collarWeight;
      }
    }
    const lakeMask = getSnowLakeMask(x, z);
    if (lakeMask > 0.001) {
      y = y * (1 - lakeMask) + SNOW_LAKE_ICE_Y * lakeMask;
    }
  }

  return y;
}

export function buildBuildingPads(config: MapConfig): BuildingPad[] {
  return config.buildings.map((b) => {
    const halfW = b.width * 0.5;
    const halfD = b.depth * 0.5;
    return {
      x: b.x,
      z: b.z,
      halfW,
      halfD,
      maxExtent: halfW + halfD + 5.5,
      cosY: Math.cos(b.rotationY),
      sinY: Math.sin(b.rotationY),
      targetY: computeRawTerrainY(config, b.x, b.z),
    };
  });
}

export function sampleGradedTerrainY(
  config: MapConfig,
  pads: readonly BuildingPad[],
  x: number,
  z: number,
): number {
  const raw = computeRawTerrainY(config, x, z);
  let finalY = raw;

  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.abs(dx) > p.maxExtent || Math.abs(dz) > p.maxExtent) continue;

    const localX = Math.abs(dx * p.cosY - dz * p.sinY);
    const localZ = Math.abs(dx * p.sinY + dz * p.cosY);
    const overX = Math.max(0, localX - (p.halfW + 1.9));
    const overZ = Math.max(0, localZ - (p.halfD + 2.5));
    const edgeDist = Math.hypot(overX, overZ);
    if (edgeDist < 3.0) {
      const t = clamp(edgeDist / 3.0, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      finalY = p.targetY * (1 - smooth) + finalY * smooth;
    }
  }

  return finalY;
}
