import type * as THREE from 'three';
import { clamp } from '../utils/MathUtils';

export interface MapBoundsConfig {
  shape: 'circle' | 'box';
  radius: number;
  halfWidth: number;
  halfDepth: number;
}

export class MapBounds {
  readonly shape: 'circle' | 'box';
  readonly radius: number;
  readonly halfWidth: number;
  readonly halfDepth: number;

  constructor(config: MapBoundsConfig) {
    this.shape = config.shape;
    this.radius = config.radius;
    this.halfWidth = config.halfWidth;
    this.halfDepth = config.halfDepth;
  }

  isInside(x: number, z: number, margin = 0): boolean {
    if (this.shape === 'circle') {
      const r = Math.max(1, this.radius - margin);
      return x * x + z * z <= r * r;
    }
    const hw = Math.max(1, this.halfWidth - margin);
    const hd = Math.max(1, this.halfDepth - margin);
    return Math.abs(x) <= hw && Math.abs(z) <= hd;
  }

  clampPosition(position: THREE.Vector3, entityRadius: number): boolean {
    if (this.shape === 'circle') {
      const maxR = Math.max(1, this.radius - entityRadius);
      const distSq = position.x * position.x + position.z * position.z;
      if (distSq > maxR * maxR && distSq > 0.0001) {
        const invDist = maxR / Math.sqrt(distSq);
        position.x *= invDist;
        position.z *= invDist;
        return true;
      }
      return false;
    }

    const hw = Math.max(1, this.halfWidth - entityRadius);
    const hd = Math.max(1, this.halfDepth - entityRadius);
    const clampedX = clamp(position.x, -hw, hw);
    const clampedZ = clamp(position.z, -hd, hd);
    const hit = clampedX !== position.x || clampedZ !== position.z;
    position.x = clampedX;
    position.z = clampedZ;
    return hit;
  }

  getDistanceToBoundary(x: number, z: number): number {
    if (this.shape === 'circle') {
      return Math.max(0, this.radius - Math.hypot(x, z));
    }
    return Math.max(0, Math.min(this.halfWidth - Math.abs(x), this.halfDepth - Math.abs(z)));
  }
}
