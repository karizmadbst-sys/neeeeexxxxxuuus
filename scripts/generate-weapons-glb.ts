import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { WEAPON_LIST } from '../src/weapons/WeaponData';
import { exportWeaponGlbBuffer } from '../src/weapons/WeaponModelBuilder';

// Pure-Node CRC32 + PNG encoder for DataTexture -> GLTF embedded PNG images
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return chunk;
}

function encodeRgbaToPng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const rowSize = 1 + width * 4;
  const raw = new Uint8Array(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter None
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = pngChunk('IHDR', ihdr);
  const idatChunk = pngChunk('IDAT', new Uint8Array(compressed));
  const iendChunk = pngChunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let offset = 0;
  out.set(sig, offset);
  offset += sig.length;
  out.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  out.set(idatChunk, offset);
  offset += idatChunk.length;
  out.set(iendChunk, offset);
  return out;
}

function installNodeGlbDomShims(): void {
  class NodeImageData {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
    constructor(data: Uint8ClampedArray | number, width?: number, height?: number) {
      if (typeof data === 'number') {
        this.width = data;
        this.height = width ?? 1;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = data;
        this.width = width ?? 1;
        this.height = height ?? Math.max(1, Math.floor(data.length / (4 * this.width)));
      }
    }
  }

  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;

    readAsArrayBuffer(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf;
          this.onloadend?.();
        })
        .catch((err) => {
          this.onerror?.(err);
        });
    }

    readAsDataURL(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((buf) => {
          const b64 = Buffer.from(buf).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
          this.onloadend?.();
        })
        .catch((err) => {
          this.onerror?.(err);
        });
    }
  }

  class NodeCanvas {
    private _width = 1;
    private _height = 1;
    pixels = new Uint8ClampedArray(4);
    private readonly ctx = {
      fillStyle: '#000000',
      clearRect: () => {
        this.pixels.fill(0);
      },
      fillRect: () => {},
      drawImage: (img: unknown) => {
        const src = img as { data?: ArrayLike<number>; pixels?: Uint8ClampedArray } | null;
        const arr = src?.data ?? src?.pixels;
        if (arr && arr.length === this.pixels.length) {
          this.pixels.set(arr);
        }
      },
      createImageData: (w: number, h: number) => new NodeImageData(w, h),
      putImageData: (imgData: NodeImageData) => {
        this._width = imgData.width;
        this._height = imgData.height;
        this.pixels = new Uint8ClampedArray(imgData.data);
      },
      getImageData: (_x: number, _y: number, w: number, h: number) =>
        new NodeImageData(new Uint8ClampedArray(this.pixels), w, h),
    };

    get width(): number {
      return this._width;
    }
    set width(w: number) {
      this._width = Math.max(1, w);
      this.pixels = new Uint8ClampedArray(this._width * this._height * 4);
    }
    get height(): number {
      return this._height;
    }
    set height(h: number) {
      this._height = Math.max(1, h);
      this.pixels = new Uint8ClampedArray(this._width * this._height * 4);
    }
    getContext() {
      return this.ctx;
    }
    toBlob(callback: (blob: Blob | null) => void, mimeType = 'image/png'): void {
      const png = encodeRgbaToPng(this._width, this._height, this.pixels);
      callback(new Blob([png], { type: mimeType }));
    }
  }

  const g = globalThis as Record<string, unknown>;
  if (!g.ImageData) {
    g.ImageData = NodeImageData;
  }
  if (!g.FileReader) {
    g.FileReader = NodeFileReader;
  }
  if (!g.HTMLCanvasElement) {
    g.HTMLCanvasElement = NodeCanvas;
  }
  if (!g.document) {
    g.document = {
      createElementNS: (_ns: string, tag: string) =>
        tag === 'canvas' ? new NodeCanvas() : {},
      createElement: (tag: string) => (tag === 'canvas' ? new NodeCanvas() : {}),
    };
  }
}

async function main(): Promise<void> {
  installNodeGlbDomShims();
  const outDir = path.resolve(process.cwd(), 'public/models/weapons');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Generating ${WEAPON_LIST.length} realistic 3D weapon GLB models...`);
  for (const weaponDef of WEAPON_LIST) {
    const glbBuffer = await exportWeaponGlbBuffer(weaponDef);
    const outPath = path.join(outDir, `${weaponDef.id}.glb`);
    const bytes = new Uint8Array(glbBuffer);
    fs.writeFileSync(outPath, bytes);
    const magic = new TextDecoder().decode(bytes.subarray(0, 4));
    if (magic !== 'glTF') {
      throw new Error(`Invalid GLB magic header for ${weaponDef.id}: ${magic}`);
    }
    console.log(
      `  ✓ ${weaponDef.id}.glb (${weaponDef.type}, ${(bytes.byteLength / 1024).toFixed(1)} KB)`,
    );
  }
  console.log(`Done generating all ${WEAPON_LIST.length} weapon GLBs.`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
