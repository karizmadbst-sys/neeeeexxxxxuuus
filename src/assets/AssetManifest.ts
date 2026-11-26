import { resolvePublicAssetUrl } from '../config/RuntimeConfig';
import { getWeaponGlbUrl, hasWeaponGlbFile, WEAPON_LIST } from '../weapons/WeaponData';

export interface AssetManifestEntry {
  key: string;
  type: 'texture' | 'gltf' | 'audio';
  url: string;
  preload: boolean;
}

const MAP_PREVIEW_ASSETS: readonly AssetManifestEntry[] = [
  {
    key: 'map-preview-desert',
    type: 'texture',
    url: resolvePublicAssetUrl('assets/maps/desert.jpg'),
    preload: true,
  },
  {
    key: 'map-preview-forest',
    type: 'texture',
    url: resolvePublicAssetUrl('assets/maps/forest.jpg'),
    preload: true,
  },
  {
    key: 'map-preview-snow',
    type: 'texture',
    url: resolvePublicAssetUrl('assets/maps/snow.jpg'),
    preload: true,
  },
];

const WEAPON_GLB_ASSETS: readonly AssetManifestEntry[] = WEAPON_LIST.filter((weapon) =>
  hasWeaponGlbFile(weapon.id),
).map((weapon) => ({
  key: `weapon-${weapon.id}`,
  type: 'gltf',
  url: getWeaponGlbUrl(weapon.id),
  preload: false,
}));

export const NEXUS_ASSET_MANIFEST: readonly AssetManifestEntry[] = [
  ...MAP_PREVIEW_ASSETS,
  ...WEAPON_GLB_ASSETS,
  {
    key: 'lobby-theme-music',
    type: 'audio',
    url: resolvePublicAssetUrl('audio/lobby-theme.ogg'),
    preload: true,
  },
];

export const PHASE1_ASSET_MANIFEST = NEXUS_ASSET_MANIFEST;
