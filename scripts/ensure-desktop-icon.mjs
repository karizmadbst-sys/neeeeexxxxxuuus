import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT_DIR = process.cwd();
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const ICON_PNG_PATH = path.join(BUILD_DIR, 'icon.png');
const ICON_ICO_PATH = path.join(BUILD_DIR, 'icon.ico');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIcoBmpEntry(size, rgba) {
  // 40-byte BITMAPINFOHEADER + bottom-up BGRA pixels + 1bpp AND mask
  const header = Buffer.alloc(40);
  const pixelBytes = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskBytes = maskStride * size;

  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // height includes XOR + AND masks
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bpp
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(pixelBytes + maskBytes, 20);

  const pixels = Buffer.alloc(pixelBytes);
  const andMask = Buffer.alloc(maskBytes);

  for (let y = 0; y < size; y += 1) {
    const srcY = size - 1 - y; // bottom-up DIB order
    for (let x = 0; x < size; x += 1) {
      const srcIdx = (srcY * size + x) * 4;
      const dstIdx = (y * size + x) * 4;
      const r = rgba[srcIdx];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];
      const a = rgba[srcIdx + 3];
      pixels[dstIdx] = b;
      pixels[dstIdx + 1] = g;
      pixels[dstIdx + 2] = r;
      pixels[dstIdx + 3] = a;

      if (a < 16) {
        const byteIdx = y * maskStride + (x >> 3);
        andMask[byteIdx] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([header, pixels, andMask]);
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

function renderNexusIconRgba(size) {
  const buf = Buffer.alloc(size * size * 4);
  const half = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - half) / half; // -1..1
      const ny = (y + 0.5 - half) / half; // -1..1
      const idx = (y * size + x) * 4;

      // Rounded-square shield SDF
      const cornerRadius = 0.24;
      const bound = 0.88 - cornerRadius;
      const qx = Math.max(Math.abs(nx) - bound, 0);
      const qy = Math.max(Math.abs(ny) - bound, 0);
      const shieldDist = Math.hypot(qx, qy) - cornerRadius;

      const aa = 2.0 / size;
      if (shieldDist > aa) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      const outerAlpha = shieldDist <= -aa ? 1 : Math.max(0, Math.min(1, (-shieldDist + aa) / (2 * aa)));

      // Deep cyber obsidian gradient + subtle cyan core glow
      const radial = Math.hypot(nx, ny);
      let r = 10 + Math.max(0, 1 - radial) * 14;
      let g = 15 + Math.max(0, 1 - radial) * 26;
      let b = 28 + Math.max(0, 1 - radial) * 46;

      // Gold/amber border ring
      if (shieldDist > -0.095) {
        const t = Math.max(0, Math.min(1, (shieldDist + 0.095) / 0.04));
        const borderFactor = Math.sin(t * Math.PI * 0.5);
        r = r * (1 - borderFactor) + 245 * borderFactor;
        g = g * (1 - borderFactor) + 178 * borderFactor;
        b = b * (1 - borderFactor) + 46 * borderFactor;
      }

      // Stylized cyber "N" crest in bright cyan + gold slash highlight
      const leftBar = pointToSegmentDist(nx, ny, -0.40, 0.44, -0.40, -0.44);
      const rightBar = pointToSegmentDist(nx, ny, 0.40, 0.44, 0.40, -0.44);
      const diagBar = pointToSegmentDist(nx, ny, -0.40, -0.44, 0.40, 0.44);
      const nDist = Math.min(leftBar, rightBar, diagBar);

      if (nDist < 0.145) {
        const glow = Math.max(0, Math.min(1, (0.145 - nDist) / 0.045));
        const isDiag = diagBar <= leftBar && diagBar <= rightBar;
        const cr = isDiag ? 255 : 45;
        const cg = isDiag ? 204 : 226;
        const cb = isDiag ? 72 : 255;
        r = r * (1 - glow) + cr * glow;
        g = g * (1 - glow) + cg * glow;
        b = b * (1 - glow) + cb * glow;
      }

      buf[idx] = Math.max(0, Math.min(255, Math.round(r)));
      buf[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      buf[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      buf[idx + 3] = Math.round(outerAlpha * 255);
    }
  }

  return buf;
}

function buildIcoFile() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const entries = sizes.map((size) => {
    const rgba = renderNexusIconRgba(size);
    const data = size === 256 ? encodePng(size, size, rgba) : encodeIcoBmpEntry(size, rgba);
    return { size, data };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ICO
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let offset = 6 + entries.length * 16;
  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = entry.size === 256 ? 0 : entry.size;
    dir[1] = entry.size === 256 ? 0 : entry.size;
    dir[2] = 0; // palette count
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4); // planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(entry.data.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += entry.data.length;
    dirEntries.push(dir);
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.data)]);
}

function ensureDesktopIcons() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const png256 = encodePng(256, 256, renderNexusIconRgba(256));
  fs.writeFileSync(ICON_PNG_PATH, png256);

  const icoBuffer = buildIcoFile();
  fs.writeFileSync(ICON_ICO_PATH, icoBuffer);

  console.log(`Generated desktop icons: ${ICON_PNG_PATH} (${png256.length} bytes), ${ICON_ICO_PATH} (${icoBuffer.length} bytes)`);
}

ensureDesktopIcons();
