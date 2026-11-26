import type * as THREE from 'three';

export type MapId = 'desert' | 'forest' | 'snow';

export type BiomeType = 'desert' | 'forest' | 'snow';

export type LootTier = 'standard' | 'medium' | 'high';

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  zoneTag: string;
}

export interface LootPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  yHint?: number;
  tier: LootTier;
  areaName: string;
  preferredWeaponId?: string;
  groupId?: string;
  buildingStyle?: string;
}

export interface ZoneConfiguration {
  initialSafeCenterX: number;
  initialSafeCenterZ: number;
  initialSafeRadius: number;
  nextSafeCenterX: number;
  nextSafeCenterZ: number;
  nextSafeRadius: number;
  finalSafeRadius: number;
  phaseCount: number;
  shrinkDurationsSec: readonly number[];
  damagePerSecond: readonly number[];
}

export interface MinimapMarker {
  id: string;
  x: number;
  z: number;
  label?: string;
  kind: 'teammate' | 'enemy' | 'loot' | 'objective';
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  biome: BiomeType;
  radiusMeters: number;
  maxPlayers: number;
  zoneConfig: ZoneConfiguration;
}

export interface IMapSystem {
  getDefinition(): MapDefinition;
  getGroundHeightAt(x: number, z: number): number;
  getRootGroup(): THREE.Group;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  dispose(): void;
}
