import type * as THREE from 'three';

export type EffectType = 'muzzle-flash' | 'impact-spark' | 'zone-pulse' | 'drop-trail';

export interface IEffectsSystem {
  spawn(type: EffectType, position: THREE.Vector3, direction?: THREE.Vector3): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}
