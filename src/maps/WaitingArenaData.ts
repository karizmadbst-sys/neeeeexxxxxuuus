import type { MapConfig } from './MapData';
import type { SpawnPointSpec } from './SpawnPointManager';

function buildWaitingArenaSpawns(): SpawnPointSpec[] {
  const spawns: SpawnPointSpec[] = [
    { id: 'wait-sp-1', x: 0, z: 10.5, yaw: Math.PI, zoneTag: 'Orbital Plaza', isPrimary: true },
  ];
  const busAvoids = [
    { x: -13.5, z: -20.5 },
    { x: 18.5, z: -15.5 },
    { x: 24.5, z: 14.5 },
  ];
  // Ring 1 (11 inner plaza spawn pads, clear of central fountain r<=6.5)
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.25;
    const r = 12.2 + (i % 3) * 2.8;
    spawns.push({
      id: `wait-sp-${spawns.length + 1}`,
      x: Number((Math.cos(a) * r).toFixed(2)),
      z: Number((Math.sin(a) * r).toFixed(2)),
      yaw: Math.atan2(-Math.cos(a), -Math.sin(a)),
      zoneTag: 'Orbital Plaza',
    });
  }
  // Ring 2 (24 outer plaza apron pads inside r=21..29m, clear of mascot arch & buses)
  for (let i = 0; i < 24; i++) {
    let a = (i / 24) * Math.PI * 2 + 0.14;
    const r = 21.5 + (i % 4) * 2.4;
    let x = Math.cos(a) * r;
    let z = Math.sin(a) * r;
    if (Math.abs(x) < 7.2 && z < -22.5) {
      a += x >= 0 ? 0.32 : -0.32;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    for (const bus of busAvoids) {
      if (Math.hypot(x - bus.x, z - bus.z) < 4.5) {
        a += 0.18;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
    }
    spawns.push({
      id: `wait-sp-${spawns.length + 1}`,
      x: Number(x.toFixed(2)),
      z: Number(z.toFixed(2)),
      yaw: Math.atan2(-Math.cos(a), -Math.sin(a)),
      zoneTag: 'Staging Deck',
    });
  }
  return spawns;
}

/**
 * Dedicated futuristic pre-match staging compound shared by Battle Royale and Battle Royale Ranked.
 * Completely independent terrain, geometry, lighting, buildings, and spawn pads separate from
 * Desert, Forest, and Snow battle royale maps.
 */
export const WAITING_ARENA_CONFIG: MapConfig = {
  id: 'desert',
  name: 'GOLD SAUCER PLAZA',
  subtitle: 'Event Square · Pre-Match Waiting Lobby',
  biome: 'forest',
  isWaitingArena: true,
  radiusMeters: 120,
  maxPlayers: 100,
  terrainAmplitude: 0.25,
  terrainFrequency: 0.02,
  theme: {
    skyColorHex: '#120a28',
    fogDensity: 0.0011,
    keyLightColorHex: '#ffe4cc',
    keyLightIntensity: 1.85,
    hemiSkyHex: '#b794f4',
    hemiGroundHex: '#3b242c',
    groundBaseHex: '#cbb8a9',
    groundAccentHex: '#b29b8a',
    roadColorHex: '#11131d',
    roadBorderHex: '#ffe6c7',
  },
  bounds: {
    shape: 'circle',
    radius: 74.2,
    halfWidth: 74.2,
    halfDepth: 74.2,
  },
  zoneConfig: {
    initialSafeCenterX: 0,
    initialSafeCenterZ: 0,
    initialSafeRadius: 320,
    nextSafeCenterX: 0,
    nextSafeCenterZ: 0,
    nextSafeRadius: 320,
    finalSafeRadius: 320,
    phaseCount: 1,
    shrinkDurationsSec: [120],
    damagePerSecond: [0],
  },
  roads: [],
  areas: [
    { name: 'Event Square Fountain', x: 0, z: 0, kind: 'open' },
    { name: 'Gold Saucer Tower', x: 0, z: -54, kind: 'open' },
    { name: 'Wonderment Square', x: -28, z: -36, kind: 'open' },
    { name: 'Ghost Square', x: -41, z: -6, kind: 'open' },
    { name: 'Speed Square', x: 30, z: -34, kind: 'open' },
    { name: 'Battle Square', x: 42, z: -13, kind: 'open' },
    { name: 'Chocobo Square', x: 34, z: 6, kind: 'open' },
  ],
  buildings: [],
  obstacles: [],
  spawnPoints: buildWaitingArenaSpawns(),
  lootPoints: [],
  scatter: {
    rockCount: 0,
    rockColorHex: '#475569',
    pineTreeCount: 0,
    broadleafTreeCount: 0,
    snowTreeCount: 0,
    mountainCount: 0,
  },
};
