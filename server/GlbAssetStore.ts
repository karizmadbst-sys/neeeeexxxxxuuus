import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GlbAssetKind,
  GlbAssetRecord,
  GlbEquipSlot,
  GlbRarity,
} from '../src/shop/GlbAssetTypes.ts';
import {
  isGlbItemId,
  resolveGlbStoreClassification,
  sanitizeAccentHex,
} from '../src/shop/GlbAssetTypes.ts';
import type { PostgresDatabase } from './db/PostgresPool.ts';
import {
  validateGlbBuffer,
  validatePreviewImageDataUrl,
} from './GlbValidator.ts';

const VALID_RARITIES = new Set<GlbRarity>(['Common', 'Rare', 'Epic', 'Legendary']);

interface GlbDiskRecord extends GlbAssetRecord {
  previewExt?: 'png' | 'jpg' | 'webp' | null;
}

interface GlbCatalogSnapshotFile {
  version: 1;
  assets: GlbDiskRecord[];
}

export interface GlbImportInput {
  glbBase64: string;
  originalFileName?: string;
  name: string;
  description?: string;
  assetType: GlbAssetKind;
  equipSlot?: GlbEquipSlot;
  rarity?: GlbRarity;
  priceCredits?: number;
  accentHex?: string;
  scaleMultiplier?: number;
  previewImageDataUrl?: string | null;
  publishImmediately?: boolean;
  createdByUid: string;
}

export interface GlbUpdateInput {
  name?: string;
  description?: string;
  assetType?: GlbAssetKind;
  equipSlot?: GlbEquipSlot;
  rarity?: GlbRarity;
  priceCredits?: number;
  accentHex?: string;
  scaleMultiplier?: number;
  previewImageDataUrl?: string | null;
  clearPreviewImage?: boolean;
}

export type GlbStoreActionResult<T = GlbAssetRecord> =
  | { ok: true; asset: T }
  | { ok: false; status: number; code: string; error: string; existingAsset?: GlbAssetRecord };

function sanitizeText(raw: unknown, maxLen: number, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  // Remove ASCII control characters safely
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLen) || fallback;
}

function sanitizeFileName(raw: unknown): string {
  if (typeof raw !== 'string') return 'asset.glb';
  const base = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
  return base.toLowerCase().endsWith('.glb') ? base : `${base || 'asset'}.glb`;
}

function sanitizePrice(raw: unknown, fallback = 500): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(5_000_000, Math.floor(raw)));
}

function sanitizeScale(raw: unknown, fallback = 1): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.max(0.25, Math.min(3.0, Math.round(raw * 100) / 100));
}

function sanitizeRarity(raw: unknown, fallback: GlbRarity = 'Rare'): GlbRarity {
  return typeof raw === 'string' && VALID_RARITIES.has(raw as GlbRarity)
    ? (raw as GlbRarity)
    : fallback;
}

function sanitizeAssetKind(raw: unknown): GlbAssetKind {
  if (raw === 'character' || raw === 'skin' || raw === 'cosmetic') return raw;
  return 'cosmetic';
}

export class GlbAssetStore {
  private readonly catalogPath: string;
  private readonly assetsDir: string;
  private readonly pgDb: PostgresDatabase | null;
  private readonly assets = new Map<string, GlbDiskRecord>();

  constructor(options: { storeFilePath: string; pgDb?: PostgresDatabase | null }) {
    const baseDir = path.resolve(path.dirname(options.storeFilePath));
    this.catalogPath = path.resolve(baseDir, 'glb-catalog.json');
    this.assetsDir = path.resolve(baseDir, 'glb-assets');
    this.pgDb = options.pgDb ?? null;
    fs.mkdirSync(this.assetsDir, { recursive: true });
    this.loadFromDiskSync();
  }

  private resolveSafeAssetPath(fileName: string): string {
    const resolved = path.resolve(this.assetsDir, fileName);
    if (!resolved.startsWith(`${this.assetsDir}${path.sep}`)) {
      throw new Error('Unsafe GLB asset file path blocked.');
    }
    return resolved;
  }

  private toPublicRecord(rec: GlbDiskRecord): GlbAssetRecord {
    return {
      id: rec.id,
      name: rec.name,
      description: rec.description,
      assetType: rec.assetType,
      category: rec.category,
      subCategory: rec.subCategory,
      equipSlot: rec.equipSlot,
      rarity: rec.rarity,
      priceCredits: rec.priceCredits,
      accentHex: rec.accentHex,
      status: rec.status,
      hasPreviewImage: rec.hasPreviewImage,
      previewUrl: rec.hasPreviewImage
        ? `/api/store/glb/assets/${encodeURIComponent(rec.id)}/preview?v=${rec.updatedAt}`
        : null,
      modelUrl: `/api/store/glb/assets/${encodeURIComponent(rec.id)}/model?v=${rec.updatedAt}`,
      originalFileName: rec.originalFileName,
      scaleMultiplier: rec.scaleMultiplier,
      specs: { ...rec.specs, warnings: [...rec.specs.warnings] },
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      publishedAt: rec.publishedAt,
      createdByUid: rec.createdByUid,
    };
  }

  private loadFromDiskSync(): void {
    try {
      if (!fs.existsSync(this.catalogPath)) return;
      const raw = fs.readFileSync(this.catalogPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<GlbCatalogSnapshotFile>;
      if (!Array.isArray(parsed.assets)) return;
      for (const item of parsed.assets) {
        if (!item || !isGlbItemId(item.id)) continue;
        const modelPath = this.resolveSafeAssetPath(`${item.id}.glb`);
        if (!fs.existsSync(modelPath)) continue;
        this.assets.set(item.id, item);
      }
    } catch (err) {
      console.warn('[GlbAssetStore] Failed to load GLB catalog from disk:', err);
    }
  }

  async initFromPostgresIfAvailable(): Promise<void> {
    if (!this.pgDb) return;
    try {
      const res = await this.pgDb.query<Record<string, unknown>>(
        `SELECT asset_id, metadata, glb_bytes, preview_bytes, preview_ext
         FROM glb_assets
         ORDER BY created_at DESC`,
      );
      for (const row of res.rows) {
        const assetId = String(row.asset_id || '');
        if (!isGlbItemId(assetId)) continue;
        const meta = row.metadata as GlbDiskRecord | null;
        if (!meta || typeof meta !== 'object') continue;
        const glbBytes = row.glb_bytes as Buffer | null;
        if (Buffer.isBuffer(glbBytes) && glbBytes.byteLength > 0) {
          const modelPath = this.resolveSafeAssetPath(`${assetId}.glb`);
          if (!fs.existsSync(modelPath)) {
            fs.writeFileSync(modelPath, glbBytes);
          }
        }
        const previewExt =
          row.preview_ext === 'png' || row.preview_ext === 'jpg' || row.preview_ext === 'webp'
            ? row.preview_ext
            : null;
        const previewBytes = row.preview_bytes as Buffer | null;
        if (previewExt && Buffer.isBuffer(previewBytes) && previewBytes.byteLength > 0) {
          const previewPath = this.resolveSafeAssetPath(`${assetId}.${previewExt}`);
          if (!fs.existsSync(previewPath)) {
            fs.writeFileSync(previewPath, previewBytes);
          }
        }
        this.assets.set(assetId, {
          ...meta,
          id: assetId,
          previewExt,
          hasPreviewImage: Boolean(previewExt && meta.hasPreviewImage),
        });
      }
      this.writeCatalogToDiskSync();
    } catch (err) {
      console.warn('[GlbAssetStore] PostgreSQL GLB hydration skipped/failed:', err);
    }
  }

  private writeCatalogToDiskSync(): void {
    const payload: GlbCatalogSnapshotFile = {
      version: 1,
      assets: Array.from(this.assets.values()),
    };
    const tmpPath = `${this.catalogPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.catalogPath);
  }

  private async persistRecordToPostgresAsync(
    rec: GlbDiskRecord,
    glbBytes?: Buffer,
    previewBytes?: Buffer | null,
  ): Promise<void> {
    if (!this.pgDb) return;
    const modelBuf = glbBytes ?? fs.readFileSync(this.resolveSafeAssetPath(`${rec.id}.glb`));
    let prevBuf: Buffer | null = previewBytes ?? null;
    if (prevBuf === null && rec.hasPreviewImage && rec.previewExt) {
      const pPath = this.resolveSafeAssetPath(`${rec.id}.${rec.previewExt}`);
      if (fs.existsSync(pPath)) {
        prevBuf = fs.readFileSync(pPath);
      }
    }
    await this.pgDb.query(
      `INSERT INTO glb_assets (
        asset_id, sha256, status, metadata, glb_bytes, preview_bytes, preview_ext, created_at, updated_at
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
      ON CONFLICT (asset_id) DO UPDATE SET
        sha256 = EXCLUDED.sha256,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        glb_bytes = EXCLUDED.glb_bytes,
        preview_bytes = EXCLUDED.preview_bytes,
        preview_ext = EXCLUDED.preview_ext,
        updated_at = EXCLUDED.updated_at`,
      [
        rec.id,
        rec.specs.sha256,
        rec.status,
        JSON.stringify(rec),
        modelBuf,
        prevBuf,
        rec.previewExt ?? null,
        rec.createdAt,
        rec.updatedAt,
      ],
    );
  }

  listAllForDeveloper(): GlbAssetRecord[] {
    return Array.from(this.assets.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => this.toPublicRecord(r));
  }

  listPublishedForStore(): GlbAssetRecord[] {
    return Array.from(this.assets.values())
      .filter((r) => r.status === 'published')
      .sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt))
      .map((r) => this.toPublicRecord(r));
  }

  listCatalogForPlayer(input: { isDeveloper: boolean; ownedIds: ReadonlySet<string> }): GlbAssetRecord[] {
    if (input.isDeveloper) {
      return this.listAllForDeveloper();
    }
    return Array.from(this.assets.values())
      .filter((r) => r.status === 'published' || input.ownedIds.has(r.id))
      .sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt))
      .map((r) => this.toPublicRecord(r));
  }

  getAsset(id: string): GlbAssetRecord | null {
    if (!isGlbItemId(id)) return null;
    const rec = this.assets.get(id);
    return rec ? this.toPublicRecord(rec) : null;
  }

  getAllAssetIds(): string[] {
    return Array.from(this.assets.keys());
  }

  getPublishedPriceMap(): ReadonlyMap<string, number> {
    const map = new Map<string, number>();
    for (const rec of this.assets.values()) {
      if (rec.status === 'published') {
        map.set(rec.id, rec.priceCredits);
      }
    }
    return map;
  }

  canAccessAssetBinary(
    id: string,
    viewer: { isDeveloper: boolean; ownedIds: ReadonlySet<string> },
  ): boolean {
    if (!isGlbItemId(id)) return false;
    const rec = this.assets.get(id);
    if (!rec) return false;
    if (viewer.isDeveloper) return true;
    if (rec.status === 'published') return true;
    return viewer.ownedIds.has(id);
  }

  readModelBinary(id: string): Buffer | null {
    if (!isGlbItemId(id) || !this.assets.has(id)) return null;
    const modelPath = this.resolveSafeAssetPath(`${id}.glb`);
    if (!fs.existsSync(modelPath)) return null;
    return fs.readFileSync(modelPath);
  }

  readPreviewBinary(id: string): { buffer: Buffer; mimeType: string } | null {
    if (!isGlbItemId(id)) return null;
    const rec = this.assets.get(id);
    if (!rec || !rec.hasPreviewImage || !rec.previewExt) return null;
    const prevPath = this.resolveSafeAssetPath(`${id}.${rec.previewExt}`);
    if (!fs.existsSync(prevPath)) return null;
    const mimeType =
      rec.previewExt === 'png'
        ? 'image/png'
        : rec.previewExt === 'jpg'
          ? 'image/jpeg'
          : 'image/webp';
    return { buffer: fs.readFileSync(prevPath), mimeType };
  }

  async importAsset(input: GlbImportInput): Promise<GlbStoreActionResult> {
    if (typeof input.glbBase64 !== 'string' || !input.glbBase64.trim()) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_GLB_DATA',
        error: 'GLB binary data is required.',
      };
    }

    const cleanBase64 = input.glbBase64.replace(/^data:[^;]+;base64,/i, '').trim();
    const glbBuffer = Buffer.from(cleanBase64, 'base64');
    const validation = validateGlbBuffer(glbBuffer);
    if (!validation.ok) {
      return {
        ok: false,
        status: 400,
        code: validation.code,
        error: validation.error,
      };
    }

    // Duplicate detection by SHA-256
    for (const existing of this.assets.values()) {
      if (existing.specs.sha256 === validation.specs.sha256) {
        return {
          ok: false,
          status: 409,
          code: 'DUPLICATE_GLB_ASSET',
          error: `An identical GLB asset ("${existing.name}") is already imported.`,
          existingAsset: this.toPublicRecord(existing),
        };
      }
    }

    const name = sanitizeText(input.name, 64, '');
    if (name.length < 2) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ASSET_NAME',
        error: 'Asset name must be between 2 and 64 characters.',
      };
    }

    let previewBuffer: Buffer | null = null;
    let previewExt: 'png' | 'jpg' | 'webp' | null = null;
    if (typeof input.previewImageDataUrl === 'string' && input.previewImageDataUrl.trim()) {
      const previewVal = validatePreviewImageDataUrl(input.previewImageDataUrl);
      if (!previewVal.ok) {
        return {
          ok: false,
          status: 400,
          code: previewVal.code,
          error: previewVal.error,
        };
      }
      previewBuffer = previewVal.buffer;
      previewExt = previewVal.ext;
    }

    let assetId = '';
    do {
      assetId = `glb-${crypto.randomBytes(6).toString('hex')}`;
    } while (this.assets.has(assetId));

    const kind = sanitizeAssetKind(input.assetType);
    const classification = resolveGlbStoreClassification(kind, input.equipSlot);
    const now = Date.now();
    const publishNow = Boolean(input.publishImmediately);

    const modelPath = this.resolveSafeAssetPath(`${assetId}.glb`);
    fs.writeFileSync(modelPath, glbBuffer);

    if (previewBuffer && previewExt) {
      const prevPath = this.resolveSafeAssetPath(`${assetId}.${previewExt}`);
      fs.writeFileSync(prevPath, previewBuffer);
    }

    const rec: GlbDiskRecord = {
      id: assetId,
      name,
      description: sanitizeText(input.description, 360, 'Custom imported 3D asset for NEXUS ROYALE.'),
      assetType: classification.assetType,
      category: classification.category,
      subCategory: classification.subCategory,
      equipSlot: classification.equipSlot,
      rarity: sanitizeRarity(input.rarity, 'Epic'),
      priceCredits: sanitizePrice(input.priceCredits, 900),
      accentHex: sanitizeAccentHex(input.accentHex, '#38bdf8'),
      status: publishNow ? 'published' : 'draft',
      hasPreviewImage: Boolean(previewBuffer && previewExt),
      previewExt,
      previewUrl: null,
      modelUrl: `/api/store/glb/assets/${assetId}/model`,
      originalFileName: sanitizeFileName(input.originalFileName),
      scaleMultiplier: sanitizeScale(input.scaleMultiplier, 1),
      specs: validation.specs,
      createdAt: now,
      updatedAt: now,
      publishedAt: publishNow ? now : null,
      createdByUid: input.createdByUid,
    };

    this.assets.set(assetId, rec);
    this.writeCatalogToDiskSync();
    await this.persistRecordToPostgresAsync(rec, glbBuffer, previewBuffer);
    return { ok: true, asset: this.toPublicRecord(rec) };
  }

  async updateAsset(id: string, input: GlbUpdateInput): Promise<GlbStoreActionResult> {
    if (!isGlbItemId(id)) {
      return { ok: false, status: 404, code: 'ASSET_NOT_FOUND', error: 'GLB asset not found.' };
    }
    const existing = this.assets.get(id);
    if (!existing) {
      return { ok: false, status: 404, code: 'ASSET_NOT_FOUND', error: 'GLB asset not found.' };
    }

    const nextName =
      input.name !== undefined ? sanitizeText(input.name, 64, '') : existing.name;
    if (nextName.length < 2) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ASSET_NAME',
        error: 'Asset name must be between 2 and 64 characters.',
      };
    }

    const nextKind =
      input.assetType !== undefined ? sanitizeAssetKind(input.assetType) : existing.assetType;
    const nextClassification = resolveGlbStoreClassification(
      nextKind,
      input.equipSlot ?? existing.equipSlot,
    );

    let hasPreviewImage = existing.hasPreviewImage;
    let previewExt = existing.previewExt ?? null;
    let newPreviewBuf: Buffer | null | undefined;

    if (input.clearPreviewImage) {
      if (existing.previewExt) {
        const oldPath = this.resolveSafeAssetPath(`${id}.${existing.previewExt}`);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      hasPreviewImage = false;
      previewExt = null;
      newPreviewBuf = null;
    } else if (typeof input.previewImageDataUrl === 'string' && input.previewImageDataUrl.trim()) {
      const previewVal = validatePreviewImageDataUrl(input.previewImageDataUrl);
      if (!previewVal.ok) {
        return { ok: false, status: 400, code: previewVal.code, error: previewVal.error };
      }
      if (existing.previewExt && existing.previewExt !== previewVal.ext) {
        const oldPath = this.resolveSafeAssetPath(`${id}.${existing.previewExt}`);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const prevPath = this.resolveSafeAssetPath(`${id}.${previewVal.ext}`);
      fs.writeFileSync(prevPath, previewVal.buffer);
      hasPreviewImage = true;
      previewExt = previewVal.ext;
      newPreviewBuf = previewVal.buffer;
    }

    const updated: GlbDiskRecord = {
      ...existing,
      name: nextName,
      description:
        input.description !== undefined
          ? sanitizeText(input.description, 360, existing.description)
          : existing.description,
      assetType: nextClassification.assetType,
      category: nextClassification.category,
      subCategory: nextClassification.subCategory,
      equipSlot: nextClassification.equipSlot,
      rarity:
        input.rarity !== undefined ? sanitizeRarity(input.rarity, existing.rarity) : existing.rarity,
      priceCredits:
        input.priceCredits !== undefined
          ? sanitizePrice(input.priceCredits, existing.priceCredits)
          : existing.priceCredits,
      accentHex:
        input.accentHex !== undefined
          ? sanitizeAccentHex(input.accentHex, existing.accentHex)
          : existing.accentHex,
      scaleMultiplier:
        input.scaleMultiplier !== undefined
          ? sanitizeScale(input.scaleMultiplier, existing.scaleMultiplier)
          : existing.scaleMultiplier,
      hasPreviewImage,
      previewExt,
      updatedAt: Date.now(),
    };

    this.assets.set(id, updated);
    this.writeCatalogToDiskSync();
    await this.persistRecordToPostgresAsync(updated, undefined, newPreviewBuf);
    return { ok: true, asset: this.toPublicRecord(updated) };
  }

  async setPublished(id: string, published: boolean): Promise<GlbStoreActionResult> {
    if (!isGlbItemId(id)) {
      return { ok: false, status: 404, code: 'ASSET_NOT_FOUND', error: 'GLB asset not found.' };
    }
    const existing = this.assets.get(id);
    if (!existing) {
      return { ok: false, status: 404, code: 'ASSET_NOT_FOUND', error: 'GLB asset not found.' };
    }

    const now = Date.now();
    const updated: GlbDiskRecord = {
      ...existing,
      status: published ? 'published' : 'draft',
      publishedAt: published ? existing.publishedAt ?? now : null,
      updatedAt: now,
    };

    this.assets.set(id, updated);
    this.writeCatalogToDiskSync();
    await this.persistRecordToPostgresAsync(updated);
    return { ok: true, asset: this.toPublicRecord(updated) };
  }

  async deleteAsset(id: string): Promise<GlbStoreActionResult<{ id: string }>> {
    if (!isGlbItemId(id)) {
      return { ok: false, status: 404, code: 'ASSET_NOT_FOUND', error: 'GLB asset not found.' };
    }
    const existing = this.assets.get(id);
    if (!existing) {
      return { ok: false, status: 404, code: 'ASSET_NOT_FOUND', error: 'GLB asset not found.' };
    }

    this.assets.delete(id);
    const modelPath = this.resolveSafeAssetPath(`${id}.glb`);
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
    }
    if (existing.previewExt) {
      const prevPath = this.resolveSafeAssetPath(`${id}.${existing.previewExt}`);
      if (fs.existsSync(prevPath)) {
        fs.unlinkSync(prevPath);
      }
    }

    this.writeCatalogToDiskSync();
    if (this.pgDb) {
      await this.pgDb.query('DELETE FROM glb_assets WHERE asset_id = $1', [id]);
    }
    return { ok: true, asset: { id } };
  }
}
