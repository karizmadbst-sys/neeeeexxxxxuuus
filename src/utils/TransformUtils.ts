import * as THREE from 'three';

const CHAIN_SCRATCH: THREE.Object3D[] = new Array(24);

/**
 * Updates local matrix and world matrix for a single object relative to its parent's
 * already-fresh `matrixWorld`, avoiding any recursive traversal of sibling/child subtrees.
 */
export function updateRootMatrixWorld(obj: THREE.Object3D | null): void {
  if (!obj) return;
  obj.updateMatrix();
  if (obj.parent) {
    obj.matrixWorld.multiplyMatrices(obj.parent.matrixWorld, obj.matrix);
  } else {
    obj.matrixWorld.copy(obj.matrix);
  }
}

/**
 * Updates `matrix` and `matrixWorld` linearly along the ancestor chain from
 * `stopAncestorExclusive` (exclusive) down to `target` (inclusive).
 * Zero heap allocations per call.
 */
export function updateWorldMatrixChain(
  stopAncestorExclusive: THREE.Object3D | null,
  target: THREE.Object3D | null,
): void {
  if (!target) return;

  let count = 0;
  let curr: THREE.Object3D | null = target;
  while (curr !== null && curr !== stopAncestorExclusive) {
    CHAIN_SCRATCH[count++] = curr;
    curr = curr.parent;
    if (count >= CHAIN_SCRATCH.length) break;
  }

  for (let i = count - 1; i >= 0; i--) {
    const node = CHAIN_SCRATCH[i];
    node.updateMatrix();
    if (node.parent) {
      node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
    } else {
      node.matrixWorld.copy(node.matrix);
    }
    CHAIN_SCRATCH[i] = undefined as unknown as THREE.Object3D;
  }
}
