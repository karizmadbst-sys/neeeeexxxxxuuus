import type { LootPointSpec } from './LootPointManager';
import type { MapConfig, ObstacleSpec } from './MapData';
import type { SpawnPointSpec } from './SpawnPointManager';

export interface TrainingWeaponRackItem {
  itemId: string;
  x: number;
  z: number;
  count?: number;
}

export interface TrainingTargetSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  patrolAmp: number;
  patrolSpeed: number;
  patrolPhase: number;
  maxHealth?: number;
  maxShield?: number;
  damageReductionPct?: number;
  armorTier?: 0 | 2 | 3;
}

/**
 * Organized weapon testing tables, attachments, armor & ammo stations
 * positioned at the Armory Welcome Bench (near Spawn), Damage Testing Zone, and along the 6 Covered Shooting Bays.
 */
export const TRAINING_GROUND_WEAPON_RACKS: readonly TrainingWeaponRackItem[] = [
  // Armory Welcome Table right in front of South Spawn (x: -7..+7, z: +30.8..32.6)
  { itemId: 'weapon_m4a1', x: -6.0, z: 30.8 },
  { itemId: 'weapon_scar', x: -4.2, z: 30.8 },
  { itemId: 'weapon_ak24', x: -2.4, z: 30.8 },
  { itemId: 'weapon_awm', x: 2.4, z: 30.8 },
  { itemId: 'weapon_mp5', x: 4.2, z: 30.8 },
  { itemId: 'weapon_m1887', x: 6.0, z: 30.8 },
  { itemId: 'armor_lv3', x: -5.2, z: 32.6 },
  { itemId: 'helmet_lv3', x: -3.2, z: 32.6 },
  { itemId: 'backpack_lv3', x: -1.2, z: 32.6 },
  { itemId: 'scope_4x', x: 1.4, z: 32.6 },
  { itemId: 'scope_8x', x: 3.4, z: 32.6 },
  { itemId: 'special_adrenaline', x: 5.4, z: 32.6 },

  // Damage Testing Zone Weapon Bench (East of Armory Plaza, x: +39..+57, z: +46.2 & +47.8)
  { itemId: 'weapon_scar', x: 40.0, z: 46.2 },
  { itemId: 'weapon_ak24', x: 42.2, z: 46.2 },
  { itemId: 'weapon_parafal', x: 44.4, z: 46.2 },
  { itemId: 'weapon_mp40', x: 46.6, z: 46.2 },
  { itemId: 'weapon_m1887', x: 48.8, z: 46.2 },
  { itemId: 'weapon_awm', x: 51.0, z: 46.2 },
  { itemId: 'weapon_kar98k', x: 53.2, z: 46.2 },
  { itemId: 'weapon_desert_eagle', x: 55.4, z: 46.2 },
  { itemId: 'scope_2x', x: 39.0, z: 47.8 },
  { itemId: 'scope_4x', x: 40.8, z: 47.8 },
  { itemId: 'scope_8x', x: 42.6, z: 47.8 },
  { itemId: 'weapon_groza', x: 46.5, z: 47.8 },
  { itemId: 'weapon_vector', x: 48.4, z: 47.8 },
  { itemId: 'weapon_spas12', x: 50.3, z: 47.8 },
  { itemId: 'weapon_m249', x: 52.2, z: 47.8 },
  { itemId: 'weapon_m24', x: 54.1, z: 47.8 },
  { itemId: 'weapon_dragunov', x: 56.0, z: 47.8 },
  { itemId: 'weapon_m1917', x: 57.5, z: 47.8 },

  // Covered Shooting Range Firing Bays (x: -96.5..-59.5, z: +11.8 / +13.8 / +15.2)
  // Front Table (z = +11.8, cleanly inside each bay avoiding dividers at -91.4, -84.6, -77.8, -71.0, -64.2)
  // Bay 1: Rifles
  { itemId: 'weapon_m4a1', x: -96.2, z: 11.8 },
  { itemId: 'weapon_scar', x: -94.4, z: 11.8 },
  { itemId: 'weapon_famas', x: -92.6, z: 11.8 },
  // Bay 2: Heavy Rifles
  { itemId: 'weapon_ak24', x: -90.0, z: 11.8 },
  { itemId: 'weapon_parafal', x: -88.2, z: 11.8 },
  { itemId: 'weapon_groza', x: -86.4, z: 11.8 },
  // Bay 3: SMGs
  { itemId: 'weapon_ump', x: -83.2, z: 11.8 },
  { itemId: 'weapon_mp5', x: -81.4, z: 11.8 },
  { itemId: 'weapon_mp40', x: -79.6, z: 11.8 },
  // Bay 4: Shotguns
  { itemId: 'weapon_m1014', x: -76.4, z: 11.8 },
  { itemId: 'weapon_m1887', x: -74.6, z: 11.8 },
  { itemId: 'weapon_spas12', x: -72.8, z: 11.8 },
  // Bay 5: Sidearms
  { itemId: 'weapon_desert_eagle', x: -69.6, z: 11.8 },
  { itemId: 'weapon_glock', x: -67.8, z: 11.8 },
  { itemId: 'weapon_usp', x: -66.0, z: 11.8 },
  // Bay 6: Precision Snipers
  { itemId: 'weapon_awm', x: -62.8, z: 11.8 },
  { itemId: 'weapon_kar98k', x: -61.0, z: 11.8 },
  { itemId: 'weapon_m24', x: -59.6, z: 11.8 },

  // Middle Table (z = +13.8): Expanded Arsenal (AR, LMG, SMG, Shotgun, Revolver, DMRs) & Ammo Crates
  { itemId: 'weapon_aug', x: -95.8, z: 13.8 },
  { itemId: 'weapon_an94', x: -94.0, z: 13.8 },
  { itemId: 'ammo_ar', x: -92.0, z: 13.8, count: 3 },
  { itemId: 'weapon_m249', x: -89.8, z: 13.8 },
  { itemId: 'weapon_m60', x: -87.8, z: 13.8 },
  { itemId: 'weapon_dp28', x: -85.8, z: 13.8 },
  { itemId: 'weapon_vector', x: -83.8, z: 13.8 },
  { itemId: 'weapon_p90', x: -81.8, z: 13.8 },
  { itemId: 'weapon_thompson', x: -79.8, z: 13.8 },
  { itemId: 'ammo_smg', x: -77.8, z: 13.8, count: 3 },
  { itemId: 'weapon_double_barrel', x: -75.5, z: 13.8 },
  { itemId: 'ammo_shotgun', x: -73.5, z: 13.8, count: 3 },
  { itemId: 'weapon_m1917', x: -71.2, z: 13.8 },
  { itemId: 'ammo_pistol', x: -69.2, z: 13.8, count: 3 },
  { itemId: 'weapon_svd', x: -66.8, z: 13.8 },
  { itemId: 'weapon_vss', x: -64.8, z: 13.8 },
  { itemId: 'weapon_dragunov', x: -62.8, z: 13.8 },
  { itemId: 'ammo_sniper', x: -60.6, z: 13.8, count: 3 },

  // Rear Table (z = +15.2): Optics, Melee, Healing & Utility
  { itemId: 'scope_2x', x: -75.5, z: 15.2 },
  { itemId: 'scope_4x', x: -70.0, z: 15.2 },
  { itemId: 'scope_8x', x: -61.8, z: 15.2 },
  { itemId: 'weapon_combat_knife', x: -84.8, z: 15.2 },
  { itemId: 'weapon_baseball_bat', x: -82.2, z: 15.2 },
  { itemId: 'med_kit', x: -89.8, z: 15.2 },
  { itemId: 'shield_battery', x: -87.4, z: 15.2 },
];

/**
 * Multi-zone tactical targets: graduated shooting range lanes, calibrated damage testing dummies,
 * Container Yard CQB alleys, Open Combat Skirmish Plaza, MOUT Combat Town, and long-range valley targets.
 */
export const TRAINING_GROUND_TARGETS: readonly TrainingTargetSpec[] = [
  // Shooting Range Downrange Targets (measured from Firing Line z = +10)
  { id: 'tg-range-15m', name: 'RANGE 15M (STATIC)', x: -92.0, z: -5.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
  { id: 'tg-range-30m-l', name: 'RANGE 30M (MOVING)', x: -84.0, z: -20.0, patrolAmp: 2.2, patrolSpeed: 1.25, patrolPhase: 0.3 },
  { id: 'tg-range-30m-r', name: 'RANGE 30M (STATIC)', x: -72.0, z: -20.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
  { id: 'tg-range-50m-l', name: 'RANGE 50M (MOVING)', x: -80.0, z: -40.0, patrolAmp: 2.6, patrolSpeed: 1.45, patrolPhase: 1.7 },
  { id: 'tg-range-50m-r', name: 'RANGE 50M (STATIC)', x: -64.0, z: -40.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
  { id: 'tg-range-75m', name: 'RANGE 75M (MOVING)', x: -75.0, z: -65.0, patrolAmp: 3.1, patrolSpeed: 1.15, patrolPhase: 2.6 },
  { id: 'tg-range-100m', name: 'RANGE 100M (SNIPER)', x: -86.0, z: -90.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
  { id: 'tg-range-100m-mv', name: 'RANGE 100M (PATROL)', x: -64.0, z: -90.0, patrolAmp: 2.8, patrolSpeed: 1.0, patrolPhase: 0.9 },
  { id: 'tg-range-150m', name: 'RANGE 150M (LONG)', x: -76.0, z: -140.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },

  // Calibrated Damage Testing Zone Dummies (East of Armory Plaza, x: 40..56, z: 13..33)
  {
    id: 'tg-dmg-lv0',
    name: 'DMG TEST LV.0 (UNARMORED)',
    x: 40.0,
    z: 33.0,
    patrolAmp: 0,
    patrolSpeed: 0,
    patrolPhase: 0,
    maxHealth: 100,
    maxShield: 0,
    damageReductionPct: 0,
    armorTier: 0,
  },
  {
    id: 'tg-dmg-lv2',
    name: 'DMG TEST LV.2 (ARMORED)',
    x: 48.0,
    z: 28.0,
    patrolAmp: 0,
    patrolSpeed: 0,
    patrolPhase: 0,
    maxHealth: 100,
    maxShield: 100,
    damageReductionPct: 25,
    armorTier: 2,
  },
  {
    id: 'tg-dmg-lv3',
    name: 'DMG TEST LV.3 (HEAVY)',
    x: 56.0,
    z: 22.0,
    patrolAmp: 0,
    patrolSpeed: 0,
    patrolPhase: 0,
    maxHealth: 150,
    maxShield: 150,
    damageReductionPct: 40,
    armorTier: 3,
  },
  {
    id: 'tg-dmg-strafe',
    name: 'DMG TEST (STRAFE)',
    x: 48.0,
    z: 13.0,
    patrolAmp: 4.5,
    patrolSpeed: 1.55,
    patrolPhase: 0.6,
    maxHealth: 100,
    maxShield: 75,
    damageReductionPct: 15,
    armorTier: 2,
  },

  // Hero Container Yard CQB Alley Targets (strictly in open walkable lanes)
  { id: 'tg-yard-nw', name: 'CQB YARD NW', x: -12.5, z: -18.5, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
  { id: 'tg-yard-center', name: 'CQB CENTER LANE', x: 0.0, z: -10.5, patrolAmp: 2.2, patrolSpeed: 1.3, patrolPhase: 0.5 },
  { id: 'tg-yard-east', name: 'CQB EAST ALLEY', x: 22.5, z: -6.5, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
  { id: 'tg-yard-south', name: 'CQB SOUTH GATE', x: -15.5, z: 17.5, patrolAmp: 1.8, patrolSpeed: 1.2, patrolPhase: 2.0 },

  // Open Combat Skirmish Plaza (North-East of Container Yard, x: 38..66, z: -50..-12)
  { id: 'tg-skirmish-1', name: 'SKIRMISH FLANK W', x: 42.0, z: -22.0, patrolAmp: 2.4, patrolSpeed: 1.3, patrolPhase: 0.4 },
  { id: 'tg-skirmish-2', name: 'SKIRMISH CENTER', x: 52.0, z: -34.0, patrolAmp: 3.0, patrolSpeed: 1.4, patrolPhase: 1.8 },
  { id: 'tg-skirmish-3', name: 'SKIRMISH FLANK E', x: 62.0, z: -20.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },

  // Combat Practice MOUT Town & Warehouses (East Sector)
  { id: 'tg-town-plaza', name: 'TOWN BREACH 1', x: 96.0, z: -16.0, patrolAmp: 2.5, patrolSpeed: 1.35, patrolPhase: 1.1 },
  { id: 'tg-town-alley', name: 'TOWN ALLEY', x: 122.0, z: 14.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
  { id: 'tg-town-wh', name: 'WAREHOUSE YARD', x: 118.0, z: -54.0, patrolAmp: 2.4, patrolSpeed: 1.2, patrolPhase: 3.0 },
  { id: 'tg-town-south', name: 'VILLAGE SQUARE', x: 102.0, z: 62.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },

  // NW Military Depot & South Forest Skirmish
  { id: 'tg-nw-depot', name: 'DEPOT GUARD', x: -126.0, z: -92.0, patrolAmp: 2.2, patrolSpeed: 1.15, patrolPhase: 0.7 },
  { id: 'tg-north-valley', name: 'RIDGE VALLEY', x: 16.0, z: -162.0, patrolAmp: 2.8, patrolSpeed: 1.05, patrolPhase: 1.9 },
  { id: 'tg-south-woods-w', name: 'PINE WOODS W', x: -68.0, z: 122.0, patrolAmp: 2.0, patrolSpeed: 1.1, patrolPhase: 2.4 },
  { id: 'tg-south-woods-e', name: 'PINE WOODS E', x: 78.0, z: 126.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
];

const TRAINING_OBSTACLES: readonly ObstacleSpec[] = [
  // Open Combat Skirmish Plaza (x: 38..66, z: -50..-12) tactical gunfight cover
  { id: 'tg-obs-sk1', x: 44, z: -16, width: 3.4, height: 1.25, depth: 0.9, rotationY: 0.15, colorHex: '#64748b', kind: 'barrier' },
  { id: 'tg-obs-sk2', x: 58, z: -18, width: 3.4, height: 1.25, depth: 0.9, rotationY: -0.2, colorHex: '#64748b', kind: 'barrier' },
  { id: 'tg-obs-sk3', x: 48, z: -28, width: 2.4, height: 1.35, depth: 2.0, rotationY: 0.3, colorHex: '#92400e', kind: 'crate' },
  { id: 'tg-obs-sk4', x: 56, z: -40, width: 5.8, height: 2.5, depth: 2.4, rotationY: 0.12, colorHex: '#0e7490', kind: 'container' },
  { id: 'tg-obs-sk5', x: 40, z: -38, width: 5.8, height: 2.5, depth: 2.4, rotationY: Math.PI * 0.48, colorHex: '#c2410c', kind: 'container' },

  // Combat Practice MOUT Town street cover & roadside cargo
  { id: 'tg-obs-t1', x: 76, z: -8, width: 3.4, height: 1.25, depth: 0.9, rotationY: 0.2, colorHex: '#64748b', kind: 'barrier' },
  { id: 'tg-obs-t2', x: 112, z: -34, width: 5.8, height: 2.5, depth: 2.4, rotationY: Math.PI * 0.5, colorHex: '#0e7490', kind: 'container' },
  { id: 'tg-obs-t3', x: 132, z: 12, width: 2.4, height: 1.35, depth: 1.8, rotationY: 0.35, colorHex: '#92400e', kind: 'crate' },
  { id: 'tg-obs-t4', x: 104, z: 48, width: 3.6, height: 1.25, depth: 0.9, rotationY: 0, colorHex: '#475569', kind: 'barrier' },
  { id: 'tg-obs-t5', x: 146, z: 38, width: 5.8, height: 2.5, depth: 2.4, rotationY: 0, colorHex: '#c2410c', kind: 'container' },
  // NW Military Depot cover containers & crates
  { id: 'tg-obs-nw1', x: -124, z: -116, width: 5.8, height: 2.5, depth: 2.4, rotationY: 0, colorHex: '#1d4ed8', kind: 'container' },
  { id: 'tg-obs-nw2', x: -124, z: -76, width: 5.8, height: 2.5, depth: 2.4, rotationY: 0.12, colorHex: '#15803d', kind: 'container' },
  { id: 'tg-obs-nw3', x: -132, z: -96, width: 2.4, height: 1.35, depth: 2.2, rotationY: 0.4, colorHex: '#78350f', kind: 'crate' },
  // North Sniper Valley tactical barriers
  { id: 'tg-obs-n1', x: -18, z: -136, width: 3.8, height: 1.25, depth: 0.9, rotationY: 0.15, colorHex: '#475569', kind: 'barrier' },
  { id: 'tg-obs-n2', x: 22, z: -144, width: 3.8, height: 1.25, depth: 0.9, rotationY: -0.2, colorHex: '#475569', kind: 'barrier' },
  { id: 'tg-obs-n3', x: 16, z: -190, width: 2.6, height: 1.4, depth: 2.0, rotationY: 0.5, colorHex: '#92400e', kind: 'crate' },
  // South Forest clearing cover
  { id: 'tg-obs-s1', x: -54, z: 112, width: 3.4, height: 1.25, depth: 0.9, rotationY: -0.25, colorHex: '#64748b', kind: 'barrier' },
  { id: 'tg-obs-s2', x: 66, z: 114, width: 2.5, height: 1.4, depth: 1.9, rotationY: 0.2, colorHex: '#78350f', kind: 'crate' },
  { id: 'tg-obs-s3', x: -16, z: 132, width: 5.6, height: 2.45, depth: 2.4, rotationY: 0.4, colorHex: '#6d28d9', kind: 'container' },
];

function buildTrainingGroundSpawns(): SpawnPointSpec[] {
  return [
    { id: 'tg-spawn-main', x: 0, z: 38.5, yaw: Math.PI, zoneTag: 'Armory Spawn', isPrimary: true },
    { id: 'tg-spawn-range', x: -78, z: 22.0, yaw: Math.PI, zoneTag: 'Shooting Range' },
    { id: 'tg-spawn-dmg', x: 48, z: 50.5, yaw: Math.PI, zoneTag: 'Damage Test Zone' },
    { id: 'tg-spawn-obstacle', x: -51, z: 42.0, yaw: 0, zoneTag: 'Obstacle Course' },
    { id: 'tg-spawn-town', x: 108, z: 0.0, yaw: Math.PI * 0.5, zoneTag: 'Combat Town' },
    { id: 'tg-spawn-ridge', x: 16, z: -206, yaw: 0, zoneTag: 'Sniper Ridge' },
  ];
}

function buildTrainingGroundLootPoints(): LootPointSpec[] {
  return [
    { id: 'tg-loot-1', x: 2, z: 29, tier: 'high', areaName: 'Armory Plaza' },
    { id: 'tg-loot-2', x: -78, z: 16, tier: 'high', areaName: 'Shooting Range' },
    { id: 'tg-loot-3', x: 0, z: 0, tier: 'medium', areaName: 'Container Yard' },
    { id: 'tg-loot-4', x: 48, z: 44, tier: 'high', areaName: 'Damage Testing Zone' },
    { id: 'tg-loot-5', x: 52, z: -22, tier: 'medium', areaName: 'Skirmish Plaza' },
    { id: 'tg-loot-6', x: 96, z: -38, tier: 'high', areaName: 'Combat Town' },
    { id: 'tg-loot-7', x: 146, z: -36, tier: 'high', areaName: 'Combat Town' },
    { id: 'tg-loot-8', x: 96, z: 50, tier: 'medium', areaName: 'Combat Town' },
    { id: 'tg-loot-9', x: -136, z: -110, tier: 'high', areaName: 'Logistics Depot' },
    { id: 'tg-loot-10', x: 16, z: -214, tier: 'high', areaName: 'Sniper Ridge' },
    { id: 'tg-loot-11', x: -96, z: 132, tier: 'medium', areaName: 'Pine Forest South' },
    { id: 'tg-loot-12', x: 108, z: 134, tier: 'medium', areaName: 'Pine Forest South' },
  ];
}

export const TRAINING_GROUND_CONFIG: MapConfig = {
  id: 'forest',
  name: 'TRAINING GROUND',
  subtitle: 'Container Yard, Shooting Ranges, Damage Test, Obstacle Course & Combat Town',
  biome: 'forest',
  isTrainingGround: true,
  radiusMeters: 340,
  maxPlayers: 32,
  terrainAmplitude: 2.6,
  terrainFrequency: 0.015,
  theme: {
    skyColorHex: '#7cc4fa',
    fogDensity: 0.00058,
    keyLightColorHex: '#fff4d6',
    keyLightIntensity: 2.55,
    hemiSkyHex: '#87cefa',
    hemiGroundHex: '#3f6e24',
    groundBaseHex: '#59982f',
    groundAccentHex: '#427722',
    roadColorHex: '#6c5a46',
    roadBorderHex: '#a38f75',
  },
  bounds: {
    shape: 'circle',
    radius: 330,
    halfWidth: 330,
    halfDepth: 330,
  },
  zoneConfig: {
    initialSafeCenterX: 0,
    initialSafeCenterZ: 0,
    initialSafeRadius: 500,
    nextSafeCenterX: 0,
    nextSafeCenterZ: 0,
    nextSafeRadius: 500,
    finalSafeRadius: 500,
    phaseCount: 1,
    shrinkDurationsSec: [120],
    damagePerSecond: [0],
  },
  roads: [
    // Main South Approach from South Loop to Armory Spawn & South Gate
    { id: 'tg-rd-south', startX: 0, startZ: 26, endX: 0, endZ: 196, width: 7.0 },
    // North Avenue from North Gate toward Sniper Ridge Overlook
    { id: 'tg-rd-north', startX: 0, startZ: -26, endX: 0, endZ: -196, width: 6.4 },
    // East Avenue from East Gate straight into Combat Town & Warehouses
    { id: 'tg-rd-east', startX: 29, startZ: 0, endX: 205, endZ: 0, width: 6.8 },
    // Armory-to-Shooting Range West Connector (runs safely south of Firing Bays at z=+34)
    { id: 'tg-rd-west-armory', startX: 0, startZ: 34, endX: -195, endZ: 34, width: 6.2 },
    // Armory-to-Damage Testing Zone East Connector
    { id: 'tg-rd-dmg-spur', startX: 10, startZ: 38, endX: 35, endZ: 46, width: 5.0 },
    // Short West Gate Courtyard Spur (from West Gate at -29,0 to Watchtower at -43,0)
    { id: 'tg-rd-west-spur', startX: -29, startZ: 0, endX: -43, endZ: 0, width: 5.0 },
    // Outer Perimeter Loop Road
    { id: 'tg-ring-n', startX: -195, startZ: -195, endX: 205, endZ: -195, width: 5.8 },
    { id: 'tg-ring-s', startX: -195, startZ: 195, endX: 205, endZ: 195, width: 5.8 },
    { id: 'tg-ring-e', startX: 205, startZ: -195, endX: 205, endZ: 195, width: 5.8 },
    { id: 'tg-ring-w', startX: -195, startZ: -195, endX: -195, endZ: 195, width: 5.8 },
    // Secondary Village & Depot Access Streets
    { id: 'tg-town-cross', startX: 118, startZ: -86, endX: 118, endZ: 92, width: 5.0 },
    { id: 'tg-nw-spur', startX: -195, startZ: -96, endX: -128, endZ: -96, width: 5.2 },
    { id: 'tg-ridge-spur', startX: 0, startZ: -195, endX: 18, endZ: -228, width: 4.8 },
  ],
  areas: [
    { name: 'CONTAINER YARD', x: 0, z: 0, kind: 'loot' },
    { name: 'ARMORY SPAWN', x: 0, z: 38, kind: 'open' },
    { name: 'DAMAGE TEST ZONE', x: 48, z: 30, kind: 'loot' },
    { name: 'OBSTACLE COURSE', x: -51, z: 61, kind: 'open' },
    { name: 'SHOOTING RANGE', x: -78, z: -26, kind: 'loot' },
    { name: 'SKIRMISH PLAZA', x: 52, z: -30, kind: 'open' },
    { name: 'COMBAT TOWN', x: 122, z: 8, kind: 'residential' },
    { name: 'LOGISTICS DEPOT', x: -148, z: -96, kind: 'loot' },
    { name: 'SNIPER RIDGE', x: 16, z: -215, kind: 'open' },
    { name: 'PINE WOODS SOUTH', x: 0, z: 155, kind: 'village' },
  ],
  buildings: [
    // East Combat Practice Town & Warehouses
    {
      id: 'tg-wh-1',
      name: 'North Cargo Warehouse',
      areaName: 'Combat Town',
      x: 92,
      z: -56,
      width: 25.6,
      height: 8.0,
      depth: 20.0,
      rotationY: 0,
      style: 'warehouse',
      wallColorHex: '#94a3b8',
      roofColorHex: '#475569',
      accentColorHex: '#0ea5e9',
      placeholderModelKey: 'tg-wh-1',
    },
    {
      id: 'tg-wh-2',
      name: 'East Logistics Hangar',
      areaName: 'Combat Town',
      x: 152,
      z: -56,
      width: 25.6,
      height: 8.0,
      depth: 20.0,
      rotationY: -Math.PI * 0.5,
      style: 'warehouse',
      wallColorHex: '#8d99ae',
      roofColorHex: '#334155',
      accentColorHex: '#f59e0b',
      placeholderModelKey: 'tg-wh-2',
    },
    {
      id: 'tg-mout-apt',
      name: 'MOUT 3-Floor Breach Block',
      areaName: 'Combat Town',
      x: 92,
      z: 30,
      width: 23.6,
      height: 11.8,
      depth: 18.9,
      rotationY: Math.PI,
      style: 'apartment_block',
      floors: 3,
      wallColorHex: '#cbd5e1',
      roofColorHex: '#475569',
      accentColorHex: '#f97316',
      placeholderModelKey: 'tg-mout-apt',
    },
    {
      id: 'tg-mil-hq',
      name: 'Garrison Command HQ',
      areaName: 'Combat Town',
      x: 154,
      z: -19,
      width: 24.8,
      height: 8.0,
      depth: 20.0,
      rotationY: -Math.PI * 0.5,
      style: 'military_base',
      floors: 2,
      wallColorHex: '#78716c',
      roofColorHex: '#3f3f46',
      accentColorHex: '#f59e0b',
      placeholderModelKey: 'tg-mil-hq',
    },
    {
      id: 'tg-house-1',
      name: 'West Village House',
      areaName: 'Combat Town',
      x: 78,
      z: 72,
      width: 21.9,
      height: 8.0,
      depth: 18.1,
      rotationY: Math.PI,
      style: 'village_home',
      wallColorHex: '#e7d7c1',
      roofColorHex: '#9a3412',
      accentColorHex: '#22c55e',
      placeholderModelKey: 'tg-house-1',
    },
    {
      id: 'tg-house-2',
      name: 'Courtyard Residence',
      areaName: 'Combat Town',
      x: 138,
      z: 68,
      width: 23.3,
      height: 8.0,
      depth: 19.0,
      rotationY: Math.PI,
      style: 'huge_house',
      wallColorHex: '#f1e3d3',
      roofColorHex: '#7c2d12',
      accentColorHex: '#38bdf8',
      placeholderModelKey: 'tg-house-2',
    },
    {
      id: 'tg-house-3',
      name: 'East Corner House',
      areaName: 'Combat Town',
      x: 174,
      z: 34,
      width: 21.9,
      height: 8.0,
      depth: 18.1,
      rotationY: -Math.PI * 0.5,
      style: 'village_home',
      wallColorHex: '#dcd0c0',
      roofColorHex: '#854d0e',
      accentColorHex: '#f59e0b',
      placeholderModelKey: 'tg-house-3',
    },
    {
      id: 'tg-house-4',
      name: 'Tactical Breach House',
      areaName: 'Combat Town',
      x: 141,
      z: 25,
      width: 21.5,
      height: 8.0,
      depth: 17.7,
      rotationY: 0,
      style: 'abandoned_building',
      wallColorHex: '#b8a99a',
      roofColorHex: '#57534e',
      accentColorHex: '#f97316',
      placeholderModelKey: 'tg-house-4',
    },

    // NW Military Logistics Depot
    {
      id: 'tg-nw-wh',
      name: 'NW Munitions Warehouse',
      areaName: 'Logistics Depot',
      x: -152,
      z: -120,
      width: 25.9,
      height: 8.0,
      depth: 20.2,
      rotationY: Math.PI * 0.5,
      style: 'warehouse',
      wallColorHex: '#848b94',
      roofColorHex: '#334155',
      accentColorHex: '#38bdf8',
      placeholderModelKey: 'tg-nw-wh',
    },
    {
      id: 'tg-nw-mil',
      name: 'NW Armory Bunker',
      areaName: 'Logistics Depot',
      x: -152,
      z: -68,
      width: 24.1,
      height: 8.0,
      depth: 19.2,
      rotationY: Math.PI * 0.5,
      style: 'military_base',
      floors: 2,
      wallColorHex: '#6b7280',
      roofColorHex: '#374151',
      accentColorHex: '#f59e0b',
      placeholderModelKey: 'tg-nw-mil',
    },
    {
      id: 'tg-nw-house',
      name: 'Depot Watch House',
      areaName: 'Logistics Depot',
      x: -152,
      z: -166,
      width: 21.9,
      height: 8.0,
      depth: 18.1,
      rotationY: 0,
      style: 'village_home',
      wallColorHex: '#d6ccb8',
      roofColorHex: '#7f1d1d',
      accentColorHex: '#fbbf24',
      placeholderModelKey: 'tg-nw-house',
    },

    // South Pine Forest Houses & Storage Warehouse
    {
      id: 'tg-s-cabin-w',
      name: 'Pinewood Ranger House',
      areaName: 'Pine Woods South',
      x: -96,
      z: 145,
      width: 22.5,
      height: 8.0,
      depth: 18.6,
      rotationY: Math.PI,
      style: 'village_home',
      wallColorHex: '#c8b6a0',
      roofColorHex: '#7c2d12',
      accentColorHex: '#22c55e',
      placeholderModelKey: 'tg-s-cabin-w',
    },
    {
      id: 'tg-s-wh',
      name: 'South Timber Warehouse',
      areaName: 'Pine Woods South',
      x: 34,
      z: 148,
      width: 24.3,
      height: 8.0,
      depth: 18.9,
      rotationY: Math.PI,
      style: 'warehouse',
      wallColorHex: '#8d867c',
      roofColorHex: '#3f3f46',
      accentColorHex: '#f97316',
      placeholderModelKey: 'tg-s-wh',
    },
    {
      id: 'tg-s-cabin-e',
      name: 'Timberline Forest Lodge',
      areaName: 'Pine Woods South',
      x: 110,
      z: 148,
      width: 23.3,
      height: 8.0,
      depth: 19.3,
      rotationY: Math.PI,
      style: 'huge_house',
      wallColorHex: '#d9c6b0',
      roofColorHex: '#9a3412',
      accentColorHex: '#38bdf8',
      placeholderModelKey: 'tg-s-cabin-e',
    },

    // North Sniper Overlook Outpost
    {
      id: 'tg-n-outpost',
      name: 'Ridge Overwatch Base',
      areaName: 'Sniper Ridge',
      x: 46,
      z: -224,
      width: 22.4,
      height: 8.0,
      depth: 18.0,
      rotationY: 0,
      style: 'military_base',
      floors: 2,
      wallColorHex: '#78716c',
      roofColorHex: '#334155',
      accentColorHex: '#f59e0b',
      placeholderModelKey: 'tg-n-outpost',
    },
  ],
  obstacles: TRAINING_OBSTACLES,
  spawnPoints: buildTrainingGroundSpawns(),
  lootPoints: buildTrainingGroundLootPoints(),
  scatter: {
    rockCount: 150,
    rockColorHex: '#4b5563',
    pineTreeCount: 380,
    broadleafTreeCount: 140,
    snowTreeCount: 0,
    mountainCount: 44,
  },
};
