import * as THREE from 'three';
import type { OrientedVolumeCollider, WalkableSurface } from './BuildingSystem';
import { buildGoldSaucerWaitingLobby } from './GoldSaucerWaitingLobby';
import type { CircleCollider } from './MapLoader';

export interface FuturisticWaitingArenaBuild {
  root: THREE.Group;
  cameraCollisionMeshes: THREE.Object3D[];
  volumeColliders: OrientedVolumeCollider[];
  walkableSurfaces: WalkableSurface[];
  circleColliders?: CircleCollider[];
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

/**
 * Builds the dedicated Gold Saucer Central Plaza waiting lobby environment.
 */
export function buildFuturisticWaitingArenaStructures(
  getBaseTerrainY: (x: number, z: number) => number,
): FuturisticWaitingArenaBuild {
  return buildGoldSaucerWaitingLobby(getBaseTerrainY);
}
