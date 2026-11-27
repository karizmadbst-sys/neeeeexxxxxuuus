import { getApiUrl } from '../config/RuntimeConfig';
import { ApiRequestError, fetchApiJson } from '../network/ApiResponse';
import type { RankedProfile, RankedVaultState } from '../ranked/RankedTypes';
import type {
  GlbAssetKind,
  GlbAssetRecord,
  GlbEquipSlot,
  GlbRarity,
} from './GlbAssetTypes';

export interface GlbImportRequestPayload {
  glbBase64: string;
  originalFileName?: string;
  name: string;
  description: string;
  assetType: GlbAssetKind;
  equipSlot: GlbEquipSlot;
  rarity: GlbRarity;
  priceCredits: number;
  accentHex: string;
  scaleMultiplier: number;
  previewImageDataUrl?: string | null;
  publishImmediately?: boolean;
}

export interface GlbUpdateRequestPayload {
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

export interface ServerPurchaseOutcome {
  ok: boolean;
  credits?: number;
  vault?: RankedVaultState;
  profile?: RankedProfile;
  error?: string;
  code?: string;
}

export interface GlbClientAuthProvider {
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  getPlayerCredentials: () => { playerId: string; secretToken: string } | null;
}

class GlbStoreClient {
  private authProvider: GlbClientAuthProvider | null = null;

  setAuthProvider(provider: GlbClientAuthProvider): void {
    this.authProvider = provider;
  }

  async buildAuthHeaders(
    includeJsonContentType = true,
    forceRefresh = false,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.authProvider) {
      try {
        const token = await this.authProvider.getIdToken(forceRefresh);
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch {
        // Ignore transient token read failure
      }
      const creds = this.authProvider.getPlayerCredentials();
      if (creds?.playerId && creds?.secretToken) {
        headers['X-Nexus-Player-Id'] = creds.playerId;
        headers['X-Nexus-Player-Token'] = creds.secretToken;
      }
    }
    return headers;
  }

  private async fetchDevApiJson<T>(
    url: string,
    options: { method: string; body?: string; includeJsonContentType?: boolean },
    fallbackError: string,
  ): Promise<{ res: Response; data: T }> {
    const includeJson = options.includeJsonContentType ?? Boolean(options.body);
    let headers = await this.buildAuthHeaders(includeJson, false);
    let outcome = await fetchApiJson<T>(
      url,
      {
        method: options.method,
        headers,
        ...(options.body !== undefined ? { body: options.body } : {}),
      },
      fallbackError,
    );

    if (outcome.res.status === 401 && this.authProvider) {
      headers = await this.buildAuthHeaders(includeJson, true);
      outcome = await fetchApiJson<T>(
        url,
        {
          method: options.method,
          headers,
          ...(options.body !== undefined ? { body: options.body } : {}),
        },
        fallbackError,
      );
    }

    return outcome;
  }

  async fetchStoreCatalog(): Promise<GlbAssetRecord[]> {
    try {
      const headers = await this.buildAuthHeaders(false);
      const { res, data } = await fetchApiJson<{ ok?: boolean; assets?: GlbAssetRecord[] }>(
        getApiUrl('/api/store/glb/catalog'),
        { method: 'GET', headers },
        'Failed to load GLB store catalog.',
      );
      if (!res.ok || !Array.isArray(data.assets)) {
        return [];
      }
      return data.assets;
    } catch {
      return [];
    }
  }

  async fetchDevAssets(): Promise<GlbAssetRecord[]> {
    const { res, data } = await this.fetchDevApiJson<{
      ok?: boolean;
      assets?: GlbAssetRecord[];
      error?: string;
      code?: string;
    }>(
      getApiUrl('/api/dev/glb/assets'),
      { method: 'GET', includeJsonContentType: false },
      'Failed to load developer GLB assets.',
    );
    if (!res.ok || !Array.isArray(data.assets)) {
      throw new ApiRequestError(data.error || 'Developer authorization required.', {
        status: res.status,
        code: data.code,
      });
    }
    return data.assets;
  }

  async importAsset(payload: GlbImportRequestPayload): Promise<GlbAssetRecord> {
    const { res, data } = await this.fetchDevApiJson<{
      ok?: boolean;
      asset?: GlbAssetRecord;
      error?: string;
      code?: string;
    }>(
      getApiUrl('/api/dev/glb/import'),
      {
        method: 'POST',
        includeJsonContentType: true,
        body: JSON.stringify(payload),
      },
      'Failed to import GLB asset.',
    );
    if (!res.ok || !data.asset) {
      throw new ApiRequestError(data.error || 'GLB import rejected by server.', {
        status: res.status,
        code: data.code,
      });
    }
    return data.asset;
  }

  async updateAsset(id: string, payload: GlbUpdateRequestPayload): Promise<GlbAssetRecord> {
    const { res, data } = await this.fetchDevApiJson<{
      ok?: boolean;
      asset?: GlbAssetRecord;
      error?: string;
      code?: string;
    }>(
      getApiUrl(`/api/dev/glb/assets/${encodeURIComponent(id)}/update`),
      {
        method: 'POST',
        includeJsonContentType: true,
        body: JSON.stringify(payload),
      },
      'Failed to update GLB asset.',
    );
    if (!res.ok || !data.asset) {
      throw new ApiRequestError(data.error || 'Failed to update GLB asset.', {
        status: res.status,
        code: data.code,
      });
    }
    return data.asset;
  }

  async setPublished(id: string, published: boolean): Promise<GlbAssetRecord> {
    const { res, data } = await this.fetchDevApiJson<{
      ok?: boolean;
      asset?: GlbAssetRecord;
      error?: string;
      code?: string;
    }>(
      getApiUrl(`/api/dev/glb/assets/${encodeURIComponent(id)}/publish`),
      {
        method: 'POST',
        includeJsonContentType: true,
        body: JSON.stringify({ published }),
      },
      'Failed to change asset publish status.',
    );
    if (!res.ok || !data.asset) {
      throw new ApiRequestError(data.error || 'Failed to update publish status.', {
        status: res.status,
        code: data.code,
      });
    }
    return data.asset;
  }

  async deleteAsset(id: string): Promise<void> {
    const { res, data } = await this.fetchDevApiJson<{
      ok?: boolean;
      deletedId?: string;
      error?: string;
      code?: string;
    }>(
      getApiUrl(`/api/dev/glb/assets/${encodeURIComponent(id)}/delete`),
      {
        method: 'POST',
        includeJsonContentType: true,
        body: JSON.stringify({}),
      },
      'Failed to delete GLB asset.',
    );
    if (!res.ok) {
      throw new ApiRequestError(data.error || 'Failed to delete GLB asset.', {
        status: res.status,
        code: data.code,
      });
    }
  }

  async purchaseItem(itemId: string): Promise<ServerPurchaseOutcome> {
    const headers = await this.buildAuthHeaders(true);
    const creds = this.authProvider?.getPlayerCredentials();
    const { res, data } = await fetchApiJson<{
      ok?: boolean;
      credits?: number;
      vault?: RankedVaultState;
      profile?: RankedProfile;
      error?: string;
      code?: string;
    }>(
      getApiUrl('/api/shop/purchase'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          itemId,
          playerId: creds?.playerId,
          secretToken: creds?.secretToken,
        }),
      },
      'Purchase request failed.',
    );
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || 'Purchase was rejected by server.',
        code: data.code,
      };
    }
    return {
      ok: true,
      credits: data.credits,
      vault: data.vault,
      profile: data.profile,
    };
  }

  private readonly previewObjectUrlCache = new Map<string, string>();

  async fetchProtectedBinary(relativeOrAbsoluteUrl: string): Promise<ArrayBuffer> {
    const headers = await this.buildAuthHeaders(false);
    const url =
      relativeOrAbsoluteUrl.startsWith('http://') ||
      relativeOrAbsoluteUrl.startsWith('https://') ||
      relativeOrAbsoluteUrl.startsWith('blob:') ||
      relativeOrAbsoluteUrl.startsWith('data:')
        ? relativeOrAbsoluteUrl
        : getApiUrl(relativeOrAbsoluteUrl);
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  async resolvePreviewObjectUrl(previewUrl: string): Promise<string | null> {
    if (!previewUrl) return null;
    if (previewUrl.startsWith('data:') || previewUrl.startsWith('blob:')) {
      return previewUrl;
    }
    const cached = this.previewObjectUrlCache.get(previewUrl);
    if (cached) return cached;
    try {
      const headers = await this.buildAuthHeaders(false);
      const url =
        previewUrl.startsWith('http://') || previewUrl.startsWith('https://')
          ? previewUrl
          : getApiUrl(previewUrl);
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) return null;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const prev = this.previewObjectUrlCache.get(previewUrl);
      if (prev && prev !== objUrl) {
        URL.revokeObjectURL(prev);
      }
      this.previewObjectUrlCache.set(previewUrl, objUrl);
      return objUrl;
    } catch {
      return null;
    }
  }

  invalidatePreviewCache(previewUrl?: string | null): void {
    if (!previewUrl) return;
    const existing = this.previewObjectUrlCache.get(previewUrl);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.previewObjectUrlCache.delete(previewUrl);
    }
  }

  clearPreviewCache(): void {
    for (const url of this.previewObjectUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.previewObjectUrlCache.clear();
  }
}

export const glbStoreClient = new GlbStoreClient();
