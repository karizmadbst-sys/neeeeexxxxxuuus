import { DEFAULT_GLOO_SKIN_ID } from '../combat/GlooWallSkins';
import {
  DEFAULT_EMOTE_WHEEL_IDS,
  EMOTE_WHEEL_SLOT_COUNT,
  getEmoteById,
} from '../emotes/EmoteCatalog';
import type { Subsystem } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import {
  DEFAULT_R6_CUSTOMIZATION,
  type R6Customization,
} from '../player/R6CustomizationData';
import type { RankedVaultState } from '../ranked/RankedTypes';
import { isValidWeaponSkinId } from '../weapons/WeaponSkins';
import {
  AVATAR_CATALOG,
  BANNER_CATALOG,
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
  isValidAvatarId,
  isValidBannerId,
} from './AvatarBannerCatalog';
import {
  DEFAULT_EMOTE_ID,
  DEFAULT_GLIDER_ID,
  DEFAULT_GLOO_WALL_SHOP_ID,
  NEXUS_SHOP_CATALOG,
  resolveEquippedLobbyWeaponItem,
  type IShopService,
  type ShopActionResult,
  type ShopCatalogItem,
  type ShopCategory,
  type ShopGliderColors,
  type ShopSnapshot,
} from './IShopSystem';

interface PersistedShopState {
  credits: number;
  ownedIds: string[];
  equippedOutfitId: string | null;
  equippedGliderId: string;
  equippedEmoteId: string;
  equippedGlooSkinId: string;
  equippedAvatarId: string;
  equippedBannerId: string;
  equippedWeaponSkins: Record<string, string>;
  equippedEmoteWheel: (string | null)[];
  equippedArmoryIds: Partial<Record<ShopCategory, string>>;
}

const SHOP_STORAGE_KEY = 'nexus_shop_wallet_v1';
const STARTER_CREDITS = 2000;

export type ShopChangeListener = (snapshot: ShopSnapshot) => void;

export function computeMatchCreditsReward(input: {
  placement: number;
  kills: number;
  damage: number;
  isWinner: boolean;
  isRanked?: boolean;
}): number {
  const safeKills = Math.max(0, Math.floor(input.kills));
  const safeDmg = Math.max(0, Math.round(input.damage));
  const baseCredits = 45;
  const killCredits = safeKills * (input.isRanked ? 35 : 25);
  const dmgCredits = Math.min(80, Math.floor(safeDmg * 0.1));
  const placementCredits = input.isWinner
    ? 250
    : input.placement <= 3
      ? 120
      : input.placement <= 10
        ? 60
        : 0;
  const modeBonus = input.isRanked ? 40 : 0;
  return baseCredits + killCredits + dmgCredits + placementCredits + modeBonus;
}

export class ShopManager implements IShopService, Subsystem {
  private state: PersistedShopState;
  private loadedFromStorage = false;
  private developerMode = false;
  private currentCustomization: R6Customization = { ...DEFAULT_R6_CUSTOMIZATION };
  private readonly listeners = new Set<ShopChangeListener>();
  private readonly catalogById = new Map<string, ShopCatalogItem>();

  constructor() {
    for (const item of NEXUS_SHOP_CATALOG) {
      this.catalogById.set(item.id, item);
    }
    this.state = this.load();
  }

  setDeveloperMode(enabled: boolean): void {
    this.developerMode = Boolean(enabled);
  }

  isDeveloperMode(): boolean {
    return this.developerMode;
  }

  getCatalog(): readonly ShopCatalogItem[] {
    return NEXUS_SHOP_CATALOG;
  }

  getItemById(id: string): ShopCatalogItem | undefined {
    return this.catalogById.get(id);
  }

  setCurrentCustomization(custom: R6Customization): void {
    this.currentCustomization = { ...custom };
  }

  getCurrentCustomization(): R6Customization {
    return { ...this.currentCustomization };
  }

  isOwned(itemId: string): boolean {
    const item = this.catalogById.get(itemId);
    if (item?.defaultOwned) return true;
    return this.state.ownedIds.includes(itemId);
  }

  isEquipped(itemId: string): boolean {
    const item = this.catalogById.get(itemId);
    if (!item) return false;

    if (item.avatarId) {
      return this.state.equippedAvatarId === item.avatarId;
    }
    if (item.bannerId) {
      return this.state.equippedBannerId === item.bannerId;
    }
    if (item.weaponSkinId && item.weaponId) {
      return this.state.equippedWeaponSkins[item.weaponId] === item.weaponSkinId;
    }
    if (item.emoteId) {
      return this.state.equippedEmoteWheel.includes(item.emoteId);
    }
    if (
      this.state.equippedOutfitId === itemId ||
      this.state.equippedGliderId === itemId ||
      this.state.equippedEmoteId === itemId ||
      this.state.equippedGlooSkinId === itemId
    ) {
      return true;
    }
    if (item.customizationPatch) {
      const entries = Object.entries(item.customizationPatch) as Array<
        [keyof R6Customization, R6Customization[keyof R6Customization]]
      >;
      if (
        entries.length > 0 &&
        entries.every(([k, v]) => this.currentCustomization[k] === v)
      ) {
        return true;
      }
    }
    return Object.values(this.state.equippedArmoryIds).includes(itemId);
  }

  getEquippedEmoteWheel(): readonly (string | null)[] {
    return this.state.equippedEmoteWheel.map((emoteId) => {
      if (!emoteId) return null;
      const emote = getEmoteById(emoteId);
      if (!emote || !this.isOwned(emote.shopItemId)) return null;
      return emote.id;
    });
  }

  getCredits(): number {
    return this.state.credits;
  }

  getEquippedAvatarId(): string {
    return this.state.equippedAvatarId;
  }

  getEquippedBannerId(): string {
    return this.state.equippedBannerId;
  }

  getEquippedWeaponSkins(): Record<string, string> {
    return { ...this.state.equippedWeaponSkins };
  }

  getEquippedLobbyWeaponItem(): ShopCatalogItem | null {
    return resolveEquippedLobbyWeaponItem(this.state);
  }

  getEquippedLobbyWeaponId(): string | null {
    return this.getEquippedLobbyWeaponItem()?.weaponId ?? null;
  }

  getActiveGliderColors(): ShopGliderColors {
    const glider = this.catalogById.get(this.state.equippedGliderId);
    return glider?.gliderColors ?? { primaryHex: '#f97316', accentHex: '#e2e8f0' };
  }

  getActiveBeaconHex(): string {
    const emote = this.catalogById.get(this.state.equippedEmoteId);
    return emote?.beaconHex ?? '#f59e0b';
  }

  getEquippedGlooSkinId(): string {
    const item = this.catalogById.get(this.state.equippedGlooSkinId);
    return item?.glooSkinId ?? DEFAULT_GLOO_SKIN_ID;
  }

  getSnapshot(): ShopSnapshot {
    return {
      credits: this.state.credits,
      ownedIds: [...this.state.ownedIds],
      equippedOutfitId: this.state.equippedOutfitId,
      equippedGliderId: this.state.equippedGliderId,
      equippedEmoteId: this.state.equippedEmoteId,
      equippedGlooSkinId: this.state.equippedGlooSkinId,
      equippedAvatarId: this.state.equippedAvatarId,
      equippedBannerId: this.state.equippedBannerId,
      equippedWeaponSkins: { ...this.state.equippedWeaponSkins },
      equippedEmoteWheel: [...this.state.equippedEmoteWheel],
      equippedArmoryIds: { ...this.state.equippedArmoryIds },
      activeGliderColors: this.getActiveGliderColors(),
      activeBeaconHex: this.getActiveBeaconHex(),
    };
  }

  exportVaultState(): RankedVaultState {
    return {
      credits: this.state.credits,
      ownedIds: Array.from(new Set(this.state.ownedIds)),
      equippedOutfitId: this.state.equippedOutfitId,
      equippedGliderId: this.state.equippedGliderId,
      equippedEmoteId: this.state.equippedEmoteId,
      equippedGlooSkinId: this.state.equippedGlooSkinId,
      equippedAvatarId: this.state.equippedAvatarId,
      equippedBannerId: this.state.equippedBannerId,
      equippedWeaponSkins: { ...this.state.equippedWeaponSkins },
      equippedEmoteWheel: [...this.state.equippedEmoteWheel],
      equippedArmoryIds: { ...this.state.equippedArmoryIds },
    };
  }

  mergeServerVaultState(serverVault?: RankedVaultState | null): void {
    if (!serverVault || typeof serverVault !== 'object') return;
    let changed = false;

    const mergedOwned = new Set<string>(this.state.ownedIds);
    for (const def of NEXUS_SHOP_CATALOG) {
      if (def.defaultOwned) mergedOwned.add(def.id);
    }
    if (Array.isArray(serverVault.ownedIds)) {
      for (const id of serverVault.ownedIds) {
        if (typeof id === 'string' && this.catalogById.has(id) && !mergedOwned.has(id)) {
          mergedOwned.add(id);
          changed = true;
        }
      }
    }
    const nextOwned = Array.from(mergedOwned);
    if (nextOwned.length !== this.state.ownedIds.length) {
      this.state.ownedIds = nextOwned;
      changed = true;
    }

    if (!this.loadedFromStorage) {
      if (typeof serverVault.credits === 'number' && Number.isFinite(serverVault.credits) && serverVault.credits >= 0) {
        this.state.credits = Math.floor(serverVault.credits);
      }
      if (isValidAvatarId(serverVault.equippedAvatarId)) {
        const av = AVATAR_CATALOG.find((a) => a.id === serverVault.equippedAvatarId);
        if (av && (av.defaultOwned || mergedOwned.has(av.shopItemId))) {
          this.state.equippedAvatarId = av.id;
        }
      }
      if (isValidBannerId(serverVault.equippedBannerId)) {
        const bn = BANNER_CATALOG.find((b) => b.id === serverVault.equippedBannerId);
        if (bn && (bn.defaultOwned || mergedOwned.has(bn.shopItemId))) {
          this.state.equippedBannerId = bn.id;
        }
      }
      if (typeof serverVault.equippedGlooSkinId === 'string' && mergedOwned.has(serverVault.equippedGlooSkinId)) {
        this.state.equippedGlooSkinId = serverVault.equippedGlooSkinId;
      }
      if (typeof serverVault.equippedGliderId === 'string' && mergedOwned.has(serverVault.equippedGliderId)) {
        this.state.equippedGliderId = serverVault.equippedGliderId;
      }
      if (typeof serverVault.equippedEmoteId === 'string' && mergedOwned.has(serverVault.equippedEmoteId)) {
        this.state.equippedEmoteId = serverVault.equippedEmoteId;
      }
      if (serverVault.equippedOutfitId === null || (typeof serverVault.equippedOutfitId === 'string' && mergedOwned.has(serverVault.equippedOutfitId))) {
        this.state.equippedOutfitId = serverVault.equippedOutfitId;
      }
      if (serverVault.equippedWeaponSkins && typeof serverVault.equippedWeaponSkins === 'object') {
        const nextSkins: Record<string, string> = {};
        for (const [wId, skinId] of Object.entries(serverVault.equippedWeaponSkins)) {
          if (typeof skinId === 'string' && isValidWeaponSkinId(skinId)) {
            const matchItem = NEXUS_SHOP_CATALOG.find((i) => i.weaponSkinId === skinId && i.weaponId === wId);
            if (matchItem && mergedOwned.has(matchItem.id)) {
              nextSkins[wId] = skinId;
            }
          }
        }
        this.state.equippedWeaponSkins = nextSkins;
      }
      if (Array.isArray(serverVault.equippedEmoteWheel)) {
        const wheel: (string | null)[] = new Array(EMOTE_WHEEL_SLOT_COUNT).fill(null);
        const seen = new Set<string>();
        for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
          const rawId = serverVault.equippedEmoteWheel[i];
          const emote = typeof rawId === 'string' ? getEmoteById(rawId) : undefined;
          if (emote && mergedOwned.has(emote.shopItemId) && !seen.has(emote.id)) {
            wheel[i] = emote.id;
            seen.add(emote.id);
          }
        }
        this.state.equippedEmoteWheel = wheel;
      }
      if (serverVault.equippedArmoryIds && typeof serverVault.equippedArmoryIds === 'object') {
        const nextArmory: Partial<Record<ShopCategory, string>> = {};
        for (const [cat, id] of Object.entries(serverVault.equippedArmoryIds)) {
          if (typeof id === 'string') {
            const catItem = this.catalogById.get(id);
            if (catItem && catItem.category === cat && (catItem.defaultOwned || mergedOwned.has(id))) {
              nextArmory[cat as ShopCategory] = id;
            }
          }
        }
        this.state.equippedArmoryIds = nextArmory;
      }
      changed = true;
    }

    if (changed) {
      this.save();
      this.emit();
    }
  }

  applyCloudVaultState(cloudVault?: RankedVaultState | null): void {
    if (!cloudVault || typeof cloudVault !== 'object') return;
    const defaultOwned = NEXUS_SHOP_CATALOG.filter((i) => i.defaultOwned).map((i) => i.id);
    const ownedSet = new Set<string>(defaultOwned);
    if (Array.isArray(cloudVault.ownedIds)) {
      for (const id of cloudVault.ownedIds) {
        if (typeof id === 'string' && this.catalogById.has(id)) {
          ownedSet.add(id);
        }
      }
    }

    let equippedAvatarId = DEFAULT_AVATAR_ID;
    if (isValidAvatarId(cloudVault.equippedAvatarId)) {
      const av = AVATAR_CATALOG.find((a) => a.id === cloudVault.equippedAvatarId);
      if (av && (av.defaultOwned || ownedSet.has(av.shopItemId))) {
        equippedAvatarId = av.id;
      }
    }

    let equippedBannerId = DEFAULT_BANNER_ID;
    if (isValidBannerId(cloudVault.equippedBannerId)) {
      const bn = BANNER_CATALOG.find((b) => b.id === cloudVault.equippedBannerId);
      if (bn && (bn.defaultOwned || ownedSet.has(bn.shopItemId))) {
        equippedBannerId = bn.id;
      }
    }

    const equippedWeaponSkins: Record<string, string> = {};
    if (cloudVault.equippedWeaponSkins && typeof cloudVault.equippedWeaponSkins === 'object') {
      for (const [wId, skinId] of Object.entries(cloudVault.equippedWeaponSkins)) {
        if (typeof skinId === 'string' && isValidWeaponSkinId(skinId)) {
          const matchItem = NEXUS_SHOP_CATALOG.find((i) => i.weaponSkinId === skinId && i.weaponId === wId);
          if (matchItem && ownedSet.has(matchItem.id)) {
            equippedWeaponSkins[wId] = skinId;
          }
        }
      }
    }

    const wheel: (string | null)[] = new Array(EMOTE_WHEEL_SLOT_COUNT).fill(null);
    if (Array.isArray(cloudVault.equippedEmoteWheel)) {
      const seen = new Set<string>();
      for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
        const rawId = cloudVault.equippedEmoteWheel[i];
        const emote = typeof rawId === 'string' ? getEmoteById(rawId) : undefined;
        if (emote && ownedSet.has(emote.shopItemId) && !seen.has(emote.id)) {
          wheel[i] = emote.id;
          seen.add(emote.id);
        }
      }
    }

    const equippedArmoryIds: Partial<Record<ShopCategory, string>> = {};
    if (cloudVault.equippedArmoryIds && typeof cloudVault.equippedArmoryIds === 'object') {
      for (const [cat, id] of Object.entries(cloudVault.equippedArmoryIds)) {
        if (typeof id === 'string') {
          const catItem = this.catalogById.get(id);
          if (catItem && catItem.category === cat && (catItem.defaultOwned || ownedSet.has(id))) {
            equippedArmoryIds[cat as ShopCategory] = id;
          }
        }
      }
    }

    this.state = {
      credits:
        typeof cloudVault.credits === 'number' && Number.isFinite(cloudVault.credits) && cloudVault.credits >= 0
          ? Math.floor(cloudVault.credits)
          : STARTER_CREDITS,
      ownedIds: Array.from(ownedSet),
      equippedOutfitId:
        typeof cloudVault.equippedOutfitId === 'string' && ownedSet.has(cloudVault.equippedOutfitId)
          ? cloudVault.equippedOutfitId
          : null,
      equippedGliderId:
        typeof cloudVault.equippedGliderId === 'string' && ownedSet.has(cloudVault.equippedGliderId)
          ? cloudVault.equippedGliderId
          : DEFAULT_GLIDER_ID,
      equippedEmoteId:
        typeof cloudVault.equippedEmoteId === 'string' && ownedSet.has(cloudVault.equippedEmoteId)
          ? cloudVault.equippedEmoteId
          : DEFAULT_EMOTE_ID,
      equippedGlooSkinId:
        typeof cloudVault.equippedGlooSkinId === 'string' && ownedSet.has(cloudVault.equippedGlooSkinId)
          ? cloudVault.equippedGlooSkinId
          : DEFAULT_GLOO_WALL_SHOP_ID,
      equippedAvatarId,
      equippedBannerId,
      equippedWeaponSkins,
      equippedEmoteWheel: wheel,
      equippedArmoryIds,
    };
    this.save();
    this.emit();
  }

  applyAuthoritativeCredits(newBalance: number): void {
    const clean =
      typeof newBalance === 'number' && Number.isFinite(newBalance) && newBalance >= 0
        ? Math.floor(newBalance)
        : this.state.credits;
    this.state.credits = this.developerMode ? 1_000_000 : clean;
    this.save();
    this.emit();
  }

  resetToGuestDefaultVault(): void {
    try {
      localStorage.removeItem(SHOP_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    this.developerMode = false;
    this.loadedFromStorage = false;
    const defaultOwned = NEXUS_SHOP_CATALOG.filter((i) => i.defaultOwned).map((i) => i.id);
    this.state = {
      credits: STARTER_CREDITS,
      ownedIds: defaultOwned,
      equippedOutfitId: null,
      equippedGliderId: DEFAULT_GLIDER_ID,
      equippedEmoteId: DEFAULT_EMOTE_ID,
      equippedGlooSkinId: DEFAULT_GLOO_WALL_SHOP_ID,
      equippedAvatarId: DEFAULT_AVATAR_ID,
      equippedBannerId: DEFAULT_BANNER_ID,
      equippedWeaponSkins: {},
      equippedEmoteWheel: [...DEFAULT_EMOTE_WHEEL_IDS],
      equippedArmoryIds: {},
    };
    this.emit();
  }

  /**
   * Purchases an item and stores it in the player's Vault WITHOUT auto-equipping it.
   * Blocks duplicate purchases so credits cannot be charged twice and no duplicate IDs are stored.
   */
  purchase(itemId: string): ShopActionResult {
    const item = this.catalogById.get(itemId);
    if (!item) {
      return { ok: false, message: i18n.t('shop.msg.unavailable') };
    }
    const localized = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
    if (this.isOwned(itemId)) {
      return {
        ok: false,
        message: i18n.t('shop.msg.alreadyOwned', { name: localized.name }),
        item,
      };
    }
    if (this.state.credits < item.priceCredits) {
      const shortage = item.priceCredits - this.state.credits;
      return {
        ok: false,
        message: i18n.t('shop.msg.needMore', {
          shortage: shortage.toLocaleString(),
          name: localized.name,
        }),
        item,
      };
    }

    this.state.credits -= item.priceCredits;
    if (!this.state.ownedIds.includes(item.id)) {
      this.state.ownedIds.push(item.id);
    }
    this.save();
    this.emit();
    return {
      ok: true,
      message: i18n.t('shop.msg.purchasedToVault', {
        name: localized.name,
        price: item.priceCredits.toLocaleString(),
      }),
      item,
    };
  }

  equip(itemId: string): ShopActionResult {
    const item = this.catalogById.get(itemId);
    if (!item) {
      return { ok: false, message: i18n.t('shop.msg.unknown') };
    }
    const localized = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
    if (!this.isOwned(itemId)) {
      return {
        ok: false,
        message: i18n.t('shop.msg.purchaseFirst', { name: localized.name }),
        item,
      };
    }
    this.applyEquip(item);
    this.save();
    this.emit();
    return {
      ok: true,
      message: i18n.t('shop.msg.equipped', { name: localized.name }),
      item,
    };
  }

  unequip(itemId: string): ShopActionResult {
    const item = this.catalogById.get(itemId);
    if (!item) {
      return { ok: false, message: i18n.t('shop.msg.unknown') };
    }
    const localized = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
    if (!this.isOwned(itemId)) {
      return {
        ok: false,
        message: i18n.t('shop.msg.purchaseFirst', { name: localized.name }),
        item,
      };
    }

    if (item.avatarId) {
      if (this.state.equippedAvatarId === item.avatarId) {
        this.state.equippedAvatarId = DEFAULT_AVATAR_ID;
      }
    } else if (item.bannerId) {
      if (this.state.equippedBannerId === item.bannerId) {
        this.state.equippedBannerId = DEFAULT_BANNER_ID;
      }
    } else if (item.weaponSkinId && item.weaponId) {
      if (this.state.equippedWeaponSkins[item.weaponId] === item.weaponSkinId) {
        delete this.state.equippedWeaponSkins[item.weaponId];
      }
    } else if (item.emoteId) {
      for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
        if (this.state.equippedEmoteWheel[i] === item.emoteId) {
          this.state.equippedEmoteWheel[i] = null;
        }
      }
    } else if (item.glooSkinId || item.category === 'gloo-walls') {
      this.state.equippedGlooSkinId = DEFAULT_GLOO_WALL_SHOP_ID;
    } else if (item.category === 'gliders') {
      this.state.equippedGliderId = DEFAULT_GLIDER_ID;
    } else if (item.category === 'emotes') {
      this.state.equippedEmoteId = DEFAULT_EMOTE_ID;
    } else if (
      item.category === 'featured' ||
      item.category === 'outfits' ||
      item.category === 'clothing'
    ) {
      if (this.state.equippedOutfitId === item.id) {
        this.state.equippedOutfitId = null;
      }
      if (item.customizationPatch) {
        const nextCustom = { ...this.currentCustomization };
        if (item.customizationPatch.topId) nextCustom.topId = DEFAULT_R6_CUSTOMIZATION.topId;
        if (item.customizationPatch.pantsId) nextCustom.pantsId = DEFAULT_R6_CUSTOMIZATION.pantsId;
        if (item.customizationPatch.shoesId) nextCustom.shoesId = DEFAULT_R6_CUSTOMIZATION.shoesId;
        if (item.customizationPatch.hatId) nextCustom.hatId = 'none';
        if (item.customizationPatch.glassesId) nextCustom.glassesId = 'none';
        if (item.customizationPatch.maskId) nextCustom.maskId = 'none';
        if (item.customizationPatch.armorId) nextCustom.armorId = DEFAULT_R6_CUSTOMIZATION.armorId;
        if (item.customizationPatch.accessoryId) nextCustom.accessoryId = 'none';
        this.currentCustomization = nextCustom;
      }
    } else if (this.state.equippedArmoryIds[item.category] === item.id) {
      delete this.state.equippedArmoryIds[item.category];
    }

    this.save();
    this.emit();
    return {
      ok: true,
      message: i18n.t('shop.msg.unequipped', { name: localized.name }),
      item,
    };
  }

  equipAvatar(avatarId: string): ShopActionResult {
    const item = NEXUS_SHOP_CATALOG.find((i) => i.avatarId === avatarId);
    if (!item) {
      return { ok: false, message: i18n.t('shop.msg.unknown') };
    }
    return this.equip(item.id);
  }

  equipBanner(bannerId: string): ShopActionResult {
    const item = NEXUS_SHOP_CATALOG.find((i) => i.bannerId === bannerId);
    if (!item) {
      return { ok: false, message: i18n.t('shop.msg.unknown') };
    }
    return this.equip(item.id);
  }

  equipEmoteToSlot(itemOrEmoteId: string, slotIndex: number): ShopActionResult {
    if (slotIndex < 0 || slotIndex >= EMOTE_WHEEL_SLOT_COUNT) {
      return { ok: false, message: i18n.t('shop.msg.unknown') };
    }
    const emote = getEmoteById(itemOrEmoteId);
    const item = emote ? this.catalogById.get(emote.shopItemId) : this.catalogById.get(itemOrEmoteId);
    if (!emote || !item) {
      return { ok: false, message: i18n.t('shop.msg.unknown') };
    }
    const localized = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
    if (!this.isOwned(item.id)) {
      return {
        ok: false,
        message: i18n.t('shop.msg.purchaseFirst', { name: localized.name }),
        item,
      };
    }

    for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
      if (this.state.equippedEmoteWheel[i] === emote.id) {
        this.state.equippedEmoteWheel[i] = null;
      }
    }
    this.state.equippedEmoteWheel[slotIndex] = emote.id;
    this.save();
    this.emit();
    return {
      ok: true,
      message: i18n.t('shop.emoteWheel.assigned', {
        name: localized.name,
        slot: slotIndex + 1,
      }),
      item,
    };
  }

  unequipEmoteSlot(slotIndex: number): ShopActionResult {
    if (slotIndex < 0 || slotIndex >= EMOTE_WHEEL_SLOT_COUNT) {
      return { ok: false, message: i18n.t('shop.msg.unknown') };
    }
    this.state.equippedEmoteWheel[slotIndex] = null;
    this.save();
    this.emit();
    return {
      ok: true,
      message: i18n.t('shop.emoteWheel.clearedSlot', { slot: slotIndex + 1 }),
    };
  }

  grantMatchCredits(input: {
    placement: number;
    kills: number;
    damage: number;
    isWinner: boolean;
    isRanked?: boolean;
  }): { creditsEarned: number; newBalance: number } {
    if (this.developerMode) {
      this.state.credits = 1_000_000;
      this.save();
      this.emit();
      return {
        creditsEarned: 0,
        newBalance: this.state.credits,
      };
    }
    const creditsEarned = computeMatchCreditsReward(input);
    this.state.credits += creditsEarned;
    this.save();
    this.emit();
    return {
      creditsEarned,
      newBalance: this.state.credits,
    };
  }

  onChange(listener: ShopChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private applyEquip(item: ShopCatalogItem): void {
    if (item.avatarId) {
      this.state.equippedAvatarId = item.avatarId;
      return;
    }
    if (item.bannerId) {
      this.state.equippedBannerId = item.bannerId;
      return;
    }
    if (item.weaponSkinId && item.weaponId) {
      this.state.equippedWeaponSkins[item.weaponId] = item.weaponSkinId;
      return;
    }
    if (item.emoteId) {
      if (!this.state.equippedEmoteWheel.includes(item.emoteId)) {
        const emptyIdx = this.state.equippedEmoteWheel.indexOf(null);
        const targetIdx = emptyIdx >= 0 ? emptyIdx : 0;
        this.state.equippedEmoteWheel[targetIdx] = item.emoteId;
      }
      return;
    }
    if (item.glooSkinId || item.category === 'gloo-walls') {
      this.state.equippedGlooSkinId = item.id;
    } else if (item.category === 'gliders') {
      this.state.equippedGliderId = item.id;
    } else if (item.category === 'emotes') {
      this.state.equippedEmoteId = item.id;
    } else if (item.category === 'featured' || item.category === 'outfits') {
      this.state.equippedOutfitId = item.id;
      if (item.customizationPatch) {
        this.currentCustomization = { ...this.currentCustomization, ...item.customizationPatch };
      }
    } else if (item.category === 'clothing') {
      this.state.equippedOutfitId = null;
      if (item.customizationPatch) {
        this.currentCustomization = { ...this.currentCustomization, ...item.customizationPatch };
      }
    } else {
      this.state.equippedArmoryIds[item.category] = item.id;
    }
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private load(): PersistedShopState {
    const defaultOwned = NEXUS_SHOP_CATALOG.filter((i) => i.defaultOwned).map((i) => i.id);
    try {
      const raw = localStorage.getItem(SHOP_STORAGE_KEY);
      if (raw) {
        this.loadedFromStorage = true;
        const parsed = JSON.parse(raw) as Partial<PersistedShopState>;
        const ownedSet = new Set<string>(defaultOwned);
        if (Array.isArray(parsed.ownedIds)) {
          for (const id of parsed.ownedIds) {
            if (typeof id === 'string' && this.catalogById.has(id)) {
              ownedSet.add(id);
            }
          }
        }
        const equippedArmoryIds: Partial<Record<ShopCategory, string>> = {};
        if (parsed.equippedArmoryIds && typeof parsed.equippedArmoryIds === 'object') {
          for (const [cat, id] of Object.entries(parsed.equippedArmoryIds)) {
            if (typeof id === 'string') {
              const catItem = this.catalogById.get(id);
              if (catItem && catItem.category === cat && (catItem.defaultOwned || ownedSet.has(id))) {
                equippedArmoryIds[cat as ShopCategory] = id;
              }
            }
          }
        }
        const equippedWeaponSkins: Record<string, string> = {};
        if (parsed.equippedWeaponSkins && typeof parsed.equippedWeaponSkins === 'object') {
          for (const [wId, skinId] of Object.entries(parsed.equippedWeaponSkins)) {
            if (typeof skinId === 'string' && isValidWeaponSkinId(skinId)) {
              const skinItem = NEXUS_SHOP_CATALOG.find(
                (i) => i.weaponSkinId === skinId && i.weaponId === wId,
              );
              if (skinItem && ownedSet.has(skinItem.id)) {
                equippedWeaponSkins[wId] = skinId;
              }
            }
          }
        }
        const normalizedWheel: (string | null)[] = new Array(EMOTE_WHEEL_SLOT_COUNT).fill(null);
        if (Array.isArray(parsed.equippedEmoteWheel)) {
          const seen = new Set<string>();
          for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
            const rawId = parsed.equippedEmoteWheel[i];
            const emote = typeof rawId === 'string' ? getEmoteById(rawId) : undefined;
            if (emote && ownedSet.has(emote.shopItemId) && !seen.has(emote.id)) {
              normalizedWheel[i] = emote.id;
              seen.add(emote.id);
            }
          }
        } else {
          for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
            normalizedWheel[i] = DEFAULT_EMOTE_WHEEL_IDS[i] ?? null;
          }
        }

        let equippedAvatarId = DEFAULT_AVATAR_ID;
        if (isValidAvatarId(parsed.equippedAvatarId)) {
          const av = AVATAR_CATALOG.find((a) => a.id === parsed.equippedAvatarId);
          if (av && (av.defaultOwned || ownedSet.has(av.shopItemId))) {
            equippedAvatarId = av.id;
          }
        }

        let equippedBannerId = DEFAULT_BANNER_ID;
        if (isValidBannerId(parsed.equippedBannerId)) {
          const bn = BANNER_CATALOG.find((b) => b.id === parsed.equippedBannerId);
          if (bn && (bn.defaultOwned || ownedSet.has(bn.shopItemId))) {
            equippedBannerId = bn.id;
          }
        }

        return {
          credits:
            typeof parsed.credits === 'number' && Number.isFinite(parsed.credits) && parsed.credits >= 0
              ? Math.floor(parsed.credits)
              : STARTER_CREDITS,
          ownedIds: Array.from(ownedSet),
          equippedOutfitId:
            typeof parsed.equippedOutfitId === 'string' && ownedSet.has(parsed.equippedOutfitId)
              ? parsed.equippedOutfitId
              : null,
          equippedGliderId:
            typeof parsed.equippedGliderId === 'string' && ownedSet.has(parsed.equippedGliderId)
              ? parsed.equippedGliderId
              : DEFAULT_GLIDER_ID,
          equippedEmoteId:
            typeof parsed.equippedEmoteId === 'string' && ownedSet.has(parsed.equippedEmoteId)
              ? parsed.equippedEmoteId
              : DEFAULT_EMOTE_ID,
          equippedGlooSkinId:
            typeof parsed.equippedGlooSkinId === 'string' && ownedSet.has(parsed.equippedGlooSkinId)
              ? parsed.equippedGlooSkinId
              : DEFAULT_GLOO_WALL_SHOP_ID,
          equippedAvatarId,
          equippedBannerId,
          equippedWeaponSkins,
          equippedEmoteWheel: normalizedWheel,
          equippedArmoryIds,
        };
      }
    } catch {
      // Ignore corrupt storage
    }

    return {
      credits: STARTER_CREDITS,
      ownedIds: defaultOwned,
      equippedOutfitId: null,
      equippedGliderId: DEFAULT_GLIDER_ID,
      equippedEmoteId: DEFAULT_EMOTE_ID,
      equippedGlooSkinId: DEFAULT_GLOO_WALL_SHOP_ID,
      equippedAvatarId: DEFAULT_AVATAR_ID,
      equippedBannerId: DEFAULT_BANNER_ID,
      equippedWeaponSkins: {},
      equippedEmoteWheel: [...DEFAULT_EMOTE_WHEEL_IDS],
      equippedArmoryIds: {},
    };
  }

  private save(): void {
    try {
      this.loadedFromStorage = true;
      localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore quota errors
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
