import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GlbTechnicalSpecs } from './GlbAssetTypes';

export const CLIENT_MAX_GLB_BYTES = 15 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UNSUPPORTED_EXTS = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression']);

export type ClientGlbValidationResult =
  | {
      ok: true;
      gltf: GLTF;
      specs: GlbTechnicalSpecs;
      boundsSize: THREE.Vector3;
    }
  | {
      ok: false;
      error: string;
    };

function countSceneStats(root: THREE.Object3D): {
  meshCount: number;
  primitiveCount: number;
  vertexCount: number;
  triangleCount: number;
  boneCount: number;
  materialSet: Set<THREE.Material>;
  textureSet: Set<THREE.Texture>;
} {
  let meshCount = 0;
  let primitiveCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let boneCount = 0;
  const materialSet = new Set<THREE.Material>();
  const textureSet = new Set<THREE.Texture>();

  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      boneCount++;
    }
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      meshCount++;
      primitiveCount++;
      const geo = mesh.geometry;
      if (geo) {
        const pos = geo.getAttribute('position');
        if (pos) {
          vertexCount += pos.count;
          if (geo.index) {
            triangleCount += Math.floor(geo.index.count / 3);
          } else {
            triangleCount += Math.floor(pos.count / 3);
          }
        }
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        materialSet.add(m);
        const std = m as THREE.MeshStandardMaterial;
        for (const tex of [
          std.map,
          std.normalMap,
          std.roughnessMap,
          std.metalnessMap,
          std.emissiveMap,
          std.aoMap,
        ]) {
          if (tex) textureSet.add(tex);
        }
      }
    }
  });

  return {
    meshCount,
    primitiveCount,
    vertexCount,
    triangleCount,
    boneCount,
    materialSet,
    textureSet,
  };
}

export async function validateAndParseGlbArrayBuffer(
  buffer: ArrayBuffer,
): Promise<ClientGlbValidationResult> {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) {
    return { ok: false, error: 'Selected file is too small to be a valid GLB file.' };
  }
  if (buffer.byteLength > CLIENT_MAX_GLB_BYTES) {
    return {
      ok: false,
      error: `GLB exceeds ${Math.round(CLIENT_MAX_GLB_BYTES / (1024 * 1024))} MB upload limit.`,
    };
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    return { ok: false, error: 'Invalid file format. Only binary glTF 2.0 (.glb) files are supported.' };
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    return { ok: false, error: `Unsupported GLB version ${version}. Export as glTF 2.0 (.glb).` };
  }
  const declaredLen = view.getUint32(8, true);
  if (declaredLen !== buffer.byteLength) {
    return { ok: false, error: 'GLB header length does not match file size.' };
  }

  const jsonLen = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== CHUNK_JSON || jsonLen === 0 || 20 + jsonLen > buffer.byteLength) {
    return { ok: false, error: 'GLB JSON metadata chunk is missing or corrupted.' };
  }

  let gltfJson: {
    extensionsRequired?: unknown;
    buffers?: Array<{ uri?: unknown }>;
    images?: Array<{ uri?: unknown; mimeType?: unknown }>;
    skins?: Array<{ joints?: unknown }>;
  };
  try {
    const jsonBytes = new Uint8Array(buffer, 20, jsonLen);
    const jsonStr = new TextDecoder('utf-8').decode(jsonBytes).replace(/\0+$/, '');
    gltfJson = JSON.parse(jsonStr);
  } catch {
    return { ok: false, error: 'GLB JSON header could not be parsed.' };
  }

  if (Array.isArray(gltfJson.extensionsRequired)) {
    for (const ext of gltfJson.extensionsRequired) {
      if (typeof ext === 'string' && UNSUPPORTED_EXTS.has(ext)) {
        return {
          ok: false,
          error: `Required extension "${ext}" is not supported. Export an uncompressed standard GLB.`,
        };
      }
    }
  }

  if (Array.isArray(gltfJson.buffers)) {
    for (const b of gltfJson.buffers) {
      if (typeof b?.uri === 'string' && b.uri.trim()) {
        return {
          ok: false,
          error: 'External buffer URIs are not allowed. Pack all binary buffers inside the GLB.',
        };
      }
    }
  }

  if (Array.isArray(gltfJson.images)) {
    for (const img of gltfJson.images) {
      if (typeof img?.uri === 'string' && img.uri.trim()) {
        if (!/^data:image\/(png|jpeg|webp);base64,/i.test(img.uri.trim())) {
          return {
            ok: false,
            error: 'External or unsupported texture URIs are blocked. Embed PNG, JPEG, or WebP textures.',
          };
        }
      } else if (typeof img?.mimeType === 'string' && !ALLOWED_IMAGE_MIMES.has(img.mimeType.toLowerCase())) {
        return {
          ok: false,
          error: `Unsupported texture MIME type "${img.mimeType}". Use PNG, JPEG, or WebP.`,
        };
      }
    }
  }

  let gltf: GLTF;
  try {
    const loader = new GLTFLoader();
    gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to parse 3D scene from GLB.';
    return { ok: false, error: `Three.js GLTF load failed: ${msg}` };
  }

  const stats = countSceneStats(gltf.scene);
  if (stats.meshCount === 0 || stats.vertexCount === 0) {
    return { ok: false, error: 'GLB scene contains no renderable 3D meshes.' };
  }

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const boundsSize = new THREE.Vector3();
  box.getSize(boundsSize);

  const skinBones = new Set<number>();
  for (const skin of gltfJson.skins ?? []) {
    if (!Array.isArray(skin?.joints)) continue;
    for (const j of skin.joints) {
      if (typeof j === 'number') skinBones.add(j);
    }
  }
  const boneCount = Math.max(stats.boneCount, skinBones.size);

  const warnings: string[] = [];
  if (stats.materialSet.size === 0) {
    warnings.push('No explicit PBR materials found; fallback shading will apply.');
  }
  if (stats.textureSet.size === 0) {
    warnings.push('No embedded textures detected (solid material shading only).');
  }
  if (stats.triangleCount > 60_000) {
    warnings.push(`High triangle count (${stats.triangleCount.toLocaleString()}); may impact mobile FPS.`);
  }

  return {
    ok: true,
    gltf,
    boundsSize,
    specs: {
      fileSizeBytes: buffer.byteLength,
      meshCount: stats.meshCount,
      primitiveCount: stats.primitiveCount,
      materialCount: stats.materialSet.size,
      textureCount: stats.textureSet.size,
      vertexCount: stats.vertexCount,
      triangleCount: stats.triangleCount,
      animationCount: gltf.animations.length,
      boneCount,
      hasRig: boneCount > 0,
      hasTextures: stats.textureSet.size > 0,
      hasMaterials: stats.materialSet.size > 0,
      embeddedOnly: true,
      sha256: '',
      warnings,
    },
  };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}
