import { NEXUS_SHOP_CATALOG } from '../src/shop/IShopSystem.ts';

export const DEVELOPER_PROJECT_ID = 'gen-lang-client-0539248410';
export const DEVELOPER_FIREBASE_UID = '17BS5pEDO4Wuwx92xfXjzZxc0mu1';
export const DEVELOPER_PLAYER_ID = 'p_c5d657582b0fdf56';
export const DEVELOPER_NUMERIC_ID = '467761110';
export const DEVELOPER_USERNAME = 'karizma';
export const DEVELOPER_LEVEL = 100;
export const DEVELOPER_XP = 0;
export const DEVELOPER_CREDITS = 1_000_000;

let cachedAllShopItemIds: string[] | null = null;
let cachedCatalogPriceMap: Map<string, { priceCredits: number; defaultOwned: boolean }> | null =
  null;

export function getAllDeveloperOwnedItemIds(): string[] {
  if (!cachedAllShopItemIds) {
    cachedAllShopItemIds = Array.from(new Set(NEXUS_SHOP_CATALOG.map((item) => item.id)));
  }
  return [...cachedAllShopItemIds];
}

export function getCatalogItemPriceMap(): ReadonlyMap<
  string,
  { priceCredits: number; defaultOwned: boolean }
> {
  if (!cachedCatalogPriceMap) {
    cachedCatalogPriceMap = new Map();
    for (const item of NEXUS_SHOP_CATALOG) {
      cachedCatalogPriceMap.set(item.id, {
        priceCredits: Math.max(0, Math.floor(item.priceCredits)),
        defaultOwned: Boolean(item.defaultOwned),
      });
    }
  }
  return cachedCatalogPriceMap;
}

export function isAuthorizedDeveloperAccount(input: {
  firebaseUid?: unknown;
  projectId?: unknown;
  aud?: unknown;
  emailVerified?: unknown;
}): boolean {
  if (typeof input.firebaseUid !== 'string' || input.firebaseUid.trim() !== DEVELOPER_FIREBASE_UID) {
    return false;
  }
  if (typeof input.projectId !== 'string' || input.projectId.trim() !== DEVELOPER_PROJECT_ID) {
    return false;
  }
  if (input.aud !== undefined) {
    if (typeof input.aud !== 'string' || input.aud.trim() !== DEVELOPER_PROJECT_ID) {
      return false;
    }
  }
  if (input.emailVerified !== undefined && input.emailVerified !== true) {
    return false;
  }
  return true;
}

export function isDeveloperPlayerIdentity(input: {
  firebaseUid?: unknown;
  playerId?: unknown;
  numericId?: unknown;
}): boolean {
  if (typeof input.firebaseUid !== 'string' || input.firebaseUid.trim() !== DEVELOPER_FIREBASE_UID) {
    return false;
  }
  if (input.playerId !== undefined && input.playerId !== DEVELOPER_PLAYER_ID) {
    return false;
  }
  if (input.numericId !== undefined && input.numericId !== DEVELOPER_NUMERIC_ID) {
    return false;
  }
  return true;
}
