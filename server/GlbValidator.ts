import crypto from 'node:crypto';
import type { GlbTechnicalSpecs } from '../src/shop/GlbAssetTypes.ts';

export const MAX_GLB_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_PREVIEW_IMAGE_BYTES = 768 * 1024; // 768 KB
export const MAX_GLB_VERTICES = 250_000;
export const MAX_GLB_TRIANGLES = 350_000;

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION_2 = 2;
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const UNSUPPORTED_REQUIRED_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
]);

export type GlbValidationResult =
  | { ok: true; specs: GlbTechnicalSpecs }
  | { ok: false; code: string; error: string };

export type PreviewImageValidationResult =
  | { ok: true; buffer: Buffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' }
  | { ok: false; code: string; error: string };

interface GltfJsonRoot {
  asset?: { version?: unknown; generator?: unknown };
  extensionsRequired?: unknown;
  extensionsUsed?: unknown;
  buffers?: Array<{ byteLength?: unknown; uri?: unknown }>;
  bufferViews?: Array<{ buffer?: unknown; byteOffset?: unknown; byteLength?: unknown }>;
  accessors?: Array<{ count?: unknown; type?: unknown; componentType?: unknown; bufferView?: unknown }>;
  meshes?: Array<{
    name?: unknown;
    primitives?: Array<{
      attributes?: Record<string, unknown>;
      indices?: unknown;
      mode?: unknown;
      material?: unknown;
    }>;
  }>;
  materials?: Array<Record<string, unknown>>;
  textures?: Array<Record<string, unknown>>;
  images?: Array<{ uri?: unknown; bufferView?: unknown; mimeType?: unknown }>;
  animations?: Array<Record<string, unknown>>;
  skins?: Array<{ joints?: unknown }>;
}

function isSafeEmbeddedImageDataUri(uri: string): boolean {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(uri.trim());
  if (!match) return false;
  return match[2].length > 0;
}

export function validateGlbBuffer(buffer: Buffer): GlbValidationResult {
  if (!Buffer.isBuffer(buffer)) {
    return { ok: false, code: 'INVALID_GLB_BUFFER', error: 'Invalid binary payload.' };
  }
  if (buffer.byteLength < 20) {
    return { ok: false, code: 'GLB_TOO_SMALL', error: 'File is too small to be a valid GLB binary.' };
  }
  if (buffer.byteLength > MAX_GLB_FILE_BYTES) {
    return {
      ok: false,
      code: 'GLB_TOO_LARGE',
      error: `GLB file exceeds maximum allowed size (${Math.round(MAX_GLB_FILE_BYTES / (1024 * 1024))} MB).`,
    };
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    return {
      ok: false,
      code: 'INVALID_GLB_MAGIC',
      error: 'Invalid GLB header magic. Only binary glTF (.glb) files are supported.',
    };
  }

  const version = buffer.readUInt32LE(4);
  if (version !== GLB_VERSION_2) {
    return {
      ok: false,
      code: 'UNSUPPORTED_GLB_VERSION',
      error: `Unsupported glTF version ${version}. Only glTF 2.0 GLB files are supported.`,
    };
  }

  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.byteLength) {
    return {
      ok: false,
      code: 'CORRUPT_GLB_LENGTH',
      error: 'GLB header length does not match actual file byte length.',
    };
  }

  // Chunk 0 must be JSON
  let offset = 12;
  if (offset + 8 > buffer.byteLength) {
    return { ok: false, code: 'MISSING_JSON_CHUNK', error: 'Missing GLB JSON chunk header.' };
  }
  const jsonChunkLength = buffer.readUInt32LE(offset);
  const jsonChunkType = buffer.readUInt32LE(offset + 4);
  offset += 8;

  if (jsonChunkType !== CHUNK_TYPE_JSON) {
    return { ok: false, code: 'INVALID_JSON_CHUNK', error: 'First GLB chunk must be JSON.' };
  }
  if (jsonChunkLength === 0 || offset + jsonChunkLength > buffer.byteLength) {
    return { ok: false, code: 'CORRUPT_JSON_CHUNK', error: 'GLB JSON chunk is out of bounds.' };
  }

  let gltf: GltfJsonRoot;
  try {
    const jsonText = buffer.toString('utf8', offset, offset + jsonChunkLength).replace(/\0+$/, '');
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, code: 'INVALID_GLTF_JSON', error: 'GLB JSON root must be an object.' };
    }
    gltf = parsed as GltfJsonRoot;
  } catch {
    return { ok: false, code: 'INVALID_GLTF_JSON', error: 'GLB JSON metadata could not be parsed.' };
  }
  offset += jsonChunkLength;

  // Optional Chunk 1: BIN
  let binChunkLength = 0;
  let chunkCount = 1;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) {
      return { ok: false, code: 'CORRUPT_CHUNK_HEADER', error: 'Truncated GLB chunk header.' };
    }
    const chunkLen = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + chunkLen > buffer.byteLength) {
      return { ok: false, code: 'CORRUPT_CHUNK_LENGTH', error: 'GLB chunk exceeds file bounds.' };
    }
    if (chunkType === CHUNK_TYPE_BIN) {
      if (chunkCount > 1) {
        return { ok: false, code: 'DUPLICATE_BIN_CHUNK', error: 'GLB contains multiple BIN chunks.' };
      }
      binChunkLength = chunkLen;
    } else {
      return { ok: false, code: 'UNSUPPORTED_CHUNK_TYPE', error: 'GLB contains an unsupported chunk type.' };
    }
    chunkCount++;
    offset += chunkLen;
  }

  const assetVersion = typeof gltf.asset?.version === 'string' ? gltf.asset.version.trim() : '';
  if (!assetVersion.startsWith('2')) {
    return {
      ok: false,
      code: 'UNSUPPORTED_GLTF_ASSET_VERSION',
      error: `Unsupported glTF asset version "${assetVersion || 'unknown'}".`,
    };
  }

  // Validate extensionsRequired
  if (Array.isArray(gltf.extensionsRequired)) {
    for (const ext of gltf.extensionsRequired) {
      if (typeof ext === 'string' && UNSUPPORTED_REQUIRED_EXTENSIONS.has(ext)) {
        return {
          ok: false,
          code: 'UNSUPPORTED_REQUIRED_EXTENSION',
          error: `Required extension "${ext}" is not supported. Please export an uncompressed standard GLB.`,
        };
      }
    }
  }

  // Enforce self-contained embedded buffers (block external URIs / path traversal)
  let embeddedOnly = true;
  if (Array.isArray(gltf.buffers)) {
    for (let i = 0; i < gltf.buffers.length; i++) {
      const b = gltf.buffers[i];
      if (!b || typeof b !== 'object') {
        return { ok: false, code: 'INVALID_GLTF_BUFFER', error: 'Invalid buffer entry in GLB.' };
      }
      if (typeof b.uri === 'string' && b.uri.trim()) {
        return {
          ok: false,
          code: 'EXTERNAL_BUFFER_URI_FORBIDDEN',
          error: 'External buffer URIs are not permitted. Pack all geometry inside the GLB binary chunk.',
        };
      }
      if (typeof b.byteLength === 'number' && binChunkLength > 0 && b.byteLength > binChunkLength) {
        return {
          ok: false,
          code: 'CORRUPT_BUFFER_LENGTH',
          error: 'GLB buffer length exceeds embedded BIN chunk size.',
        };
      }
    }
  }

  // Validate images (only safe embedded bufferView or safe base64 PNG/JPEG/WEBP)
  const images = Array.isArray(gltf.images) ? gltf.images : [];
  const bufferViews = Array.isArray(gltf.bufferViews) ? gltf.bufferViews : [];
  for (const img of images) {
    if (!img || typeof img !== 'object') {
      return { ok: false, code: 'INVALID_IMAGE_ENTRY', error: 'Invalid image entry in GLB.' };
    }
    if (typeof img.uri === 'string' && img.uri.trim()) {
      if (!isSafeEmbeddedImageDataUri(img.uri)) {
        embeddedOnly = false;
        return {
          ok: false,
          code: 'EXTERNAL_TEXTURE_URI_FORBIDDEN',
          error: 'External or unsupported texture URIs are blocked. Embed PNG, JPEG, or WebP textures inside the GLB.',
        };
      }
    } else if (typeof img.bufferView === 'number') {
      if (img.bufferView < 0 || img.bufferView >= bufferViews.length) {
        return { ok: false, code: 'INVALID_TEXTURE_BUFFERVIEW', error: 'GLB image references an invalid bufferView.' };
      }
      if (typeof img.mimeType === 'string' && !ALLOWED_IMAGE_MIME_TYPES.has(img.mimeType.toLowerCase())) {
        return {
          ok: false,
          code: 'UNSUPPORTED_TEXTURE_FORMAT',
          error: `Unsupported texture MIME type "${img.mimeType}". Use PNG, JPEG, or WebP.`,
        };
      }
    } else {
      return {
        ok: false,
        code: 'MISSING_TEXTURE_SOURCE',
        error: 'GLB image entry is missing an embedded bufferView.',
      };
    }
  }

  // Validate meshes & compute vertex/triangle counts
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];
  if (meshes.length === 0) {
    return {
      ok: false,
      code: 'NO_MESHES_FOUND',
      error: 'GLB contains no 3D meshes.',
    };
  }

  let primitiveCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;

  for (const mesh of meshes) {
    const prims = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
    for (const prim of prims) {
      if (!prim || !prim.attributes || typeof prim.attributes.POSITION !== 'number') {
        continue;
      }
      primitiveCount++;
      const posAccessor = accessors[prim.attributes.POSITION];
      const posCount = typeof posAccessor?.count === 'number' && posAccessor.count > 0 ? Math.floor(posAccessor.count) : 0;
      vertexCount += posCount;

      const mode = typeof prim.mode === 'number' ? prim.mode : 4; // 4 = TRIANGLES
      let indexCount = posCount;
      if (typeof prim.indices === 'number' && accessors[prim.indices]) {
        const idxCount = accessors[prim.indices].count;
        if (typeof idxCount === 'number' && idxCount > 0) {
          indexCount = Math.floor(idxCount);
        }
      }
      if (mode === 4) {
        triangleCount += Math.floor(indexCount / 3);
      } else if (mode === 5 || mode === 6) {
        triangleCount += Math.max(0, indexCount - 2);
      }
    }
  }

  if (primitiveCount === 0 || vertexCount === 0) {
    return {
      ok: false,
      code: 'NO_GEOMETRY_FOUND',
      error: 'GLB meshes contain no valid vertex geometry.',
    };
  }

  if (vertexCount > MAX_GLB_VERTICES || triangleCount > MAX_GLB_TRIANGLES) {
    return {
      ok: false,
      code: 'GEOMETRY_BUDGET_EXCEEDED',
      error: `Model complexity (${triangleCount.toLocaleString()} triangles / ${vertexCount.toLocaleString()} vertices) exceeds real-time game limits.`,
    };
  }

  const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
  const textures = Array.isArray(gltf.textures) ? gltf.textures : [];
  const animations = Array.isArray(gltf.animations) ? gltf.animations : [];
  const skins = Array.isArray(gltf.skins) ? gltf.skins : [];
  const jointIndices = new Set<number>();
  for (const skin of skins) {
    if (Array.isArray(skin?.joints)) {
      for (const j of skin.joints) {
        if (typeof j === 'number') jointIndices.add(j);
      }
    }
  }

  const warnings: string[] = [];
  if (materials.length === 0) {
    warnings.push('No explicit PBR materials defined; default material will be used.');
  }
  if (textures.length === 0 && images.length === 0) {
    warnings.push('No embedded textures detected (solid material shading only).');
  }
  if (triangleCount > 60_000) {
    warnings.push(`High polygon count (${triangleCount.toLocaleString()} triangles); consider optimizing for mobile FPS.`);
  }
  if (textures.length > 12) {
    warnings.push(`Many textures (${textures.length}); may increase GPU memory usage.`);
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    ok: true,
    specs: {
      fileSizeBytes: buffer.byteLength,
      meshCount: meshes.length,
      primitiveCount,
      materialCount: materials.length,
      textureCount: Math.max(textures.length, images.length),
      vertexCount,
      triangleCount,
      animationCount: animations.length,
      boneCount: jointIndices.size,
      hasRig: jointIndices.size > 0,
      hasTextures: textures.length > 0 || images.length > 0,
      hasMaterials: materials.length > 0,
      embeddedOnly,
      sha256,
      warnings,
    },
  };
}

export function validatePreviewImageDataUrl(dataUrl: string): PreviewImageValidationResult {
  if (typeof dataUrl !== 'string') {
    return { ok: false, code: 'INVALID_PREVIEW_IMAGE', error: 'Preview image must be a string.' };
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PREVIEW_FORMAT',
      error: 'Preview image must be a base64 PNG, JPEG, or WebP data URL.',
    };
  }
  const subtype = match[1].toLowerCase() as 'png' | 'jpeg' | 'webp';
  const buf = Buffer.from(match[2], 'base64');
  if (buf.byteLength < 16 || buf.byteLength > MAX_PREVIEW_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'PREVIEW_IMAGE_SIZE_INVALID',
      error: `Preview image must be under ${Math.round(MAX_PREVIEW_IMAGE_BYTES / 1024)} KB.`,
    };
  }

  // Verify magic bytes
  if (subtype === 'png') {
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
      return { ok: false, code: 'CORRUPT_PNG_PREVIEW', error: 'Preview PNG header is invalid.' };
    }
    return { ok: true, buffer: buf, mimeType: 'image/png', ext: 'png' };
  }
  if (subtype === 'jpeg') {
    if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
      return { ok: false, code: 'CORRUPT_JPEG_PREVIEW', error: 'Preview JPEG header is invalid.' };
    }
    return { ok: true, buffer: buf, mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return { ok: false, code: 'CORRUPT_WEBP_PREVIEW', error: 'Preview WebP header is invalid.' };
  }
  return { ok: true, buffer: buf, mimeType: 'image/webp', ext: 'webp' };
}
