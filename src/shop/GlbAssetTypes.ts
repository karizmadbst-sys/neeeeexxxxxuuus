import type { ShopCatalogItem, ShopCategory, ShopItemSpec } from './IShopSystem.ts';

export type GlbAssetKind = 'character' | 'skin' | 'cosmetic';

export type GlbEquipSlot =
  | 'character'
  | 'outfit'
  | 'backpack'
  | 'helmet'
  | 'armor'
  | 'weapon'
  | 'glider'
  | 'accessory'
  | 'gloo-wall';

export type GlbAssetStatus = 'draft' | 'published';

export type GlbRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export interface GlbTechnicalSpecs {
  fileSizeBytes: number;
  meshCount: number;
  primitiveCount: number;
  materialCount: number;
  textureCount: number;
  vertexCount: number;
  triangleCount: number;
  animationCount: number;
  boneCount: number;
  hasRig: boolean;
  hasTextures: boolean;
  hasMaterials: boolean;
  embeddedOnly: boolean;
  sha256: string;
  warnings: string[];
}

export interface GlbAssetRecord {
  id: string;
  name: string;
  description: string;
  assetType: GlbAssetKind;
  category: ShopCategory;
  subCategory: string;
  equipSlot: GlbEquipSlot;
  rarity: GlbRarity;
  priceCredits: number;
  accentHex: string;
  status: GlbAssetStatus;
  hasPreviewImage: boolean;
  previewUrl: string | null;
  modelUrl: string;
  originalFileName: string;
  scaleMultiplier: number;
  specs: GlbTechnicalSpecs;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  createdByUid: string;
}

export interface GlbCatalogItemMeta {
  assetId: string;
  assetType: GlbAssetKind;
  equipSlot: GlbEquipSlot;
  modelUrl: string;
  previewUrl: string | null;
  scaleMultiplier: number;
  status: GlbAssetStatus;
  specs: GlbTechnicalSpecs;
}

const GLB_ID_PATTERN = /^glb-[a-f0-9]{8,24}$/;

export function isGlbItemId(id: unknown): id is string {
  return typeof id === 'string' && GLB_ID_PATTERN.test(id.trim());
}

export function sanitizeAccentHex(hex: unknown, fallback = '#38bdf8'): string {
  if (typeof hex !== 'string') return fallback;
  const trimmed = hex.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

export function formatGlbFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function resolveGlbStoreClassification(
  assetType: GlbAssetKind,
  requestedSlot?: GlbEquipSlot,
): {
  assetType: GlbAssetKind;
  equipSlot: GlbEquipSlot;
  category: ShopCategory;
  subCategory: string;
} {
  if (assetType === 'character') {
    return {
      assetType: 'character',
      equipSlot: 'character',
      category: 'characters',
      subCategory: 'Characters',
    };
  }
  if (assetType === 'skin') {
    return {
      assetType: 'skin',
      equipSlot: 'outfit',
      category: 'outfits',
      subCategory: 'Outfits',
    };
  }
  switch (requestedSlot) {
    case 'helmet':
      return {
        assetType: 'cosmetic',
        equipSlot: 'helmet',
        category: 'helmets',
        subCategory: 'Helmets',
      };
    case 'armor':
      return {
        assetType: 'cosmetic',
        equipSlot: 'armor',
        category: 'armor',
        subCategory: 'Vests',
      };
    case 'weapon':
      return {
        assetType: 'cosmetic',
        equipSlot: 'weapon',
        category: 'weapons',
        subCategory: 'Rifles',
      };
    case 'glider':
      return {
        assetType: 'cosmetic',
        equipSlot: 'glider',
        category: 'gliders',
        subCategory: 'Gliders',
      };
    case 'gloo-wall':
      return {
        assetType: 'cosmetic',
        equipSlot: 'gloo-wall',
        category: 'gloo-walls',
        subCategory: 'Tactical',
      };
    case 'accessory':
      return {
        assetType: 'cosmetic',
        equipSlot: 'accessory',
        category: 'accessories',
        subCategory: 'Accessories',
      };
    case 'backpack':
    default:
      return {
        assetType: 'cosmetic',
        equipSlot: 'backpack',
        category: 'equipment',
        subCategory: 'Backpacks',
      };
  }
}

export function getGlbArmoryCategoryKey(equipSlot: GlbEquipSlot): ShopCategory | null {
  switch (equipSlot) {
    case 'character':
      return 'characters';
    case 'backpack':
      return 'equipment';
    case 'helmet':
      return 'helmets';
    case 'armor':
      return 'armor';
    case 'accessory':
      return 'accessories';
    case 'weapon':
      return 'weapons';
    case 'outfit':
    case 'glider':
    case 'gloo-wall':
      return null;
  }
}

export function glbAssetToShopCatalogItem(
  asset: GlbAssetRecord,
  apiUrlResolver?: (path: string) => string,
): ShopCatalogItem {
  const resolveUrl = apiUrlResolver ?? ((p: string) => p);
  const modelUrl = resolveUrl(asset.modelUrl);
  const previewUrl = asset.previewUrl ? resolveUrl(asset.previewUrl) : null;

  const specs: ShopItemSpec[] = [
    { labelKey: 'shop.spec.format', value: 'GLB 2.0' },
    { labelKey: 'shop.spec.triangles', value: asset.specs.triangleCount.toLocaleString() },
    {
      labelKey: 'shop.spec.rig',
      value: asset.specs.hasRig ? `${asset.specs.boneCount} Bones` : 'Static Mesh',
    },
    { labelKey: 'shop.spec.fileSize', value: formatGlbFileSize(asset.specs.fileSizeBytes) },
  ];

  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    subCategory: asset.subCategory,
    rarity: asset.rarity,
    priceCredits: asset.priceCredits,
    accentHex: asset.accentHex,
    description: asset.description,
    imageUrl: previewUrl ?? undefined,
    specs,
    glbAsset: {
      assetId: asset.id,
      assetType: asset.assetType,
      equipSlot: asset.equipSlot,
      modelUrl,
      previewUrl,
      scaleMultiplier: asset.scaleMultiplier,
      status: asset.status,
      specs: asset.specs,
    },
  };
}
