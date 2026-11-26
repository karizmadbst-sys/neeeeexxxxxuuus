import { resolvePublicAssetUrl } from '../config/RuntimeConfig';
import type { MapId } from './IMapSystem';

export const MAP_PREVIEW_IMAGE_URLS: Readonly<Record<MapId, string>> = {
  desert: resolvePublicAssetUrl('assets/maps/desert.jpg'),
  forest: resolvePublicAssetUrl('assets/maps/forest.jpg'),
  snow: resolvePublicAssetUrl('assets/maps/snow.jpg'),
};

export const MAP_THEME_BADGE_COLORS: Readonly<Record<MapId, string>> = {
  desert: '#f59e0b',
  forest: '#10b981',
  snow: '#38bdf8',
};

export function getMapPreviewUrl(mapId: MapId): string {
  return MAP_PREVIEW_IMAGE_URLS[mapId] ?? MAP_PREVIEW_IMAGE_URLS.desert;
}
