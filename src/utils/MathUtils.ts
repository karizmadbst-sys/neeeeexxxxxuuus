import * as THREE from 'three';

/**
 * Pre-allocated scratch math objects to prevent GC pressure in the 60fps loop.
 */
export const SCRATCH_VEC3_A = new THREE.Vector3();
export const SCRATCH_VEC3_B = new THREE.Vector3();
export const SCRATCH_VEC3_C = new THREE.Vector3();
export const SCRATCH_QUAT_A = new THREE.Quaternion();
export const SCRATCH_MAT4_A = new THREE.Matrix4();
export const SCRATCH_COLOR_A = new THREE.Color();

export function damp(current: number, target: number, lambda: number, delta: number): number {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
