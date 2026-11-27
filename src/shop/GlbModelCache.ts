import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GlbEquipSlot } from './GlbAssetTypes';
import { glbStoreClient } from './GlbStoreClient';

export interface InstantiatedGlbModel {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
  boundsSize: THREE.Vector3;
  hasSkeleton: boolean;
  dispose: () => void;
}

interface CachedGltfEntry {
  gltf: GLTF;
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
  hasSkeleton: boolean;
}

function targetHeightForSlot(slot: GlbEquipSlot): number {
  switch (slot) {
    case 'character':
    case 'outfit':
      return 1.78;
    case 'backpack':
      return 0.44;
    case 'helmet':
      return 0.34;
    case 'armor':
      return 0.48;
    case 'accessory':
      return 0.34;
    case 'weapon':
      return 0.32;
    case 'glider':
      return 0.85;
    case 'gloo-wall':
      return 1.65;
  }
}

export function normalizeGlbRootGroup(
  sceneRoot: THREE.Object3D,
  equipSlot: GlbEquipSlot,
  scaleMultiplier = 1,
): {
  wrapper: THREE.Group;
  boundsSize: THREE.Vector3;
  hasSkeleton: boolean;
} {
  sceneRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sceneRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  let hasSkeleton = false;
  sceneRoot.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      hasSkeleton = true;
    }
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const isCharacterBody = equipSlot === 'character' || equipSlot === 'outfit';
  const refDim = isCharacterBody ? Math.max(size.y, 0.001) : maxDim;
  const targetDim = targetHeightForSlot(equipSlot) * Math.max(0.25, Math.min(3, scaleMultiplier));
  const scale = targetDim / refDim;

  const wrapper = new THREE.Group();
  sceneRoot.scale.multiplyScalar(scale);

  if (isCharacterBody) {
    // Center X and Z at origin, ground feet at y = 0
    sceneRoot.position.set(
      -center.x * scale,
      -box.min.y * scale,
      -center.z * scale,
    );
  } else {
    // Center all 3 axes at origin for socket attachments and studio preview
    sceneRoot.position.set(
      -center.x * scale,
      -center.y * scale,
      -center.z * scale,
    );
  }
  wrapper.add(sceneRoot);
  wrapper.updateMatrixWorld(true);

  const normalizedBox = new THREE.Box3().setFromObject(wrapper);
  const boundsSize = new THREE.Vector3();
  normalizedBox.getSize(boundsSize);

  return { wrapper, boundsSize, hasSkeleton };
}

class GlbModelCache {
  private readonly cache = new Map<string, CachedGltfEntry>();
  private readonly inflight = new Map<string, Promise<CachedGltfEntry>>();
  private readonly loader = new GLTFLoader();

  async loadTemplate(modelUrl: string): Promise<CachedGltfEntry> {
    const existing = this.cache.get(modelUrl);
    if (existing) return existing;

    const pending = this.inflight.get(modelUrl);
    if (pending) return pending;

    const promise = (async (): Promise<CachedGltfEntry> => {
      const buffer = await glbStoreClient.fetchProtectedBinary(modelUrl);
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        this.loader.parse(buffer, '', resolve, reject);
      });
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      let hasSkeleton = false;
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh || (obj as THREE.Bone).isBone) {
          hasSkeleton = true;
        }
      });

      const entry: CachedGltfEntry = {
        gltf,
        size,
        center,
        minY: box.min.y,
        hasSkeleton,
      };
      this.cache.set(modelUrl, entry);
      return entry;
    })().finally(() => {
      this.inflight.delete(modelUrl);
    });

    this.inflight.set(modelUrl, promise);
    return promise;
  }

  async instantiateModel(
    modelUrl: string,
    equipSlot: GlbEquipSlot,
    scaleMultiplier = 1,
  ): Promise<InstantiatedGlbModel> {
    const template = await this.loadTemplate(modelUrl);
    const cloned = SkeletonUtils.clone(template.gltf.scene);
    const { wrapper, boundsSize, hasSkeleton } = normalizeGlbRootGroup(
      cloned,
      equipSlot,
      scaleMultiplier,
    );
    const animations = template.gltf.animations.map((clip) => clip.clone());

    return {
      root: wrapper,
      animations,
      boundsSize,
      hasSkeleton: hasSkeleton || template.hasSkeleton,
      dispose: () => {
        wrapper.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) {
              mat?.dispose();
            }
          }
        });
      },
    };
  }

  evict(modelUrl?: string): void {
    if (!modelUrl) {
      this.cache.clear();
      return;
    }
    this.cache.delete(modelUrl);
  }
}

export const glbModelCache = new GlbModelCache();
