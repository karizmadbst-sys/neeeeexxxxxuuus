import { GLOO_WALL_SKINS } from '../combat/GlooWallSkins.ts';
import { EMOTE_CATALOG } from '../emotes/EmoteCatalog.ts';
import type { R6Customization } from '../player/R6CustomizationData.ts';
import { WEAPON_BY_ID } from '../weapons/WeaponData.ts';
import { WEAPON_SKIN_CATALOG } from '../weapons/WeaponSkins.ts';
import {
  AVATAR_CATALOG,
  BANNER_CATALOG,
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
} from './AvatarBannerCatalog.ts';

export type ShopCategory =
  | 'featured'
  | 'outfits'
  | 'clothing'
  | 'gliders'
  | 'emotes'
  | 'dances'
  | 'gloo-walls'
  | 'weapons'
  | 'weapon-skins'
  | 'avatars'
  | 'banners'
  | 'armor'
  | 'equipment'
  | 'tools';

export type ShopBrowseTab =
  | 'all'
  | 'clothing'
  | 'gloo-walls'
  | 'weapons'
  | 'weapon-skins'
  | 'avatars'
  | 'banners'
  | 'armor'
  | 'equipment'
  | 'dances'
  | 'tools';

export type ShopWeaponSubCategory =
  | 'Rifles'
  | 'LMGs'
  | 'Snipers'
  | 'SMGs'
  | 'Shotguns'
  | 'Pistols'
  | 'Melee';

export type ShopClothingSubCategory =
  | 'Outfits'
  | 'Shirts'
  | 'Pants'
  | 'Shoes'
  | 'Hats'
  | 'Glasses'
  | 'Masks'
  | 'Accessories';

export interface ShopGliderColors {
  primaryHex: string;
  accentHex: string;
}

export interface ShopItemSpec {
  labelKey: string;
  value: string;
}

export interface ShopCatalogItem {
  id: string;
  name: string;
  category: ShopCategory;
  subCategory?: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  priceCredits: number;
  accentHex: string;
  description: string;
  defaultOwned?: boolean;
  customizationPatch?: Partial<R6Customization>;
  gliderColors?: ShopGliderColors;
  beaconHex?: string;
  weaponId?: string;
  weaponSkinId?: string;
  lootId?: string;
  emoteId?: string;
  glooSkinId?: string;
  avatarId?: string;
  bannerId?: string;
  imageUrl?: string;
  specs?: readonly ShopItemSpec[];
}

export interface ShopSnapshot {
  credits: number;
  ownedIds: readonly string[];
  equippedOutfitId: string | null;
  equippedGliderId: string;
  equippedEmoteId: string;
  equippedGlooSkinId: string;
  equippedAvatarId: string;
  equippedBannerId: string;
  equippedWeaponSkins: Record<string, string>;
  equippedEmoteWheel: readonly (string | null)[];
  equippedArmoryIds: Partial<Record<ShopCategory, string>>;
  activeGliderColors: ShopGliderColors;
  activeBeaconHex: string;
}

export interface ShopActionResult {
  ok: boolean;
  message: string;
  item?: ShopCatalogItem;
}

export interface IShopService {
  getCatalog(): readonly ShopCatalogItem[];
  getSnapshot(): ShopSnapshot;
  isOwned(itemId: string): boolean;
  isEquipped(itemId: string): boolean;
  purchase(itemId: string): ShopActionResult;
  equip(itemId: string): ShopActionResult;
  unequip(itemId: string): ShopActionResult;
}

export const DEFAULT_GLIDER_ID = 'glider-nexus-standard';
export const DEFAULT_EMOTE_ID = 'emote-amber-flare';
export const DEFAULT_GLOO_WALL_SHOP_ID = 'shop-gloo-arctic-classic';
export { DEFAULT_AVATAR_ID, DEFAULT_BANNER_ID };

export function mapShopCategoryToBrowseTab(category: ShopCategory): ShopBrowseTab {
  switch (category) {
    case 'clothing':
    case 'outfits':
    case 'featured':
      return 'clothing';
    case 'gloo-walls':
      return 'gloo-walls';
    case 'weapons':
      return 'weapons';
    case 'weapon-skins':
      return 'weapon-skins';
    case 'avatars':
      return 'avatars';
    case 'banners':
      return 'banners';
    case 'armor':
      return 'armor';
    case 'equipment':
    case 'gliders':
      return 'equipment';
    case 'dances':
      return 'dances';
    case 'tools':
    case 'emotes':
      return 'tools';
  }
}

export function isShopItemOwned(snapshot: ShopSnapshot, item: ShopCatalogItem): boolean {
  return Boolean(item.defaultOwned) || snapshot.ownedIds.includes(item.id);
}

export function isShopItemEquipped(
  snapshot: ShopSnapshot,
  customization: R6Customization,
  item: ShopCatalogItem,
): boolean {
  if (item.avatarId) {
    return snapshot.equippedAvatarId === item.avatarId;
  }
  if (item.bannerId) {
    return snapshot.equippedBannerId === item.bannerId;
  }
  if (item.weaponSkinId && item.weaponId) {
    return snapshot.equippedWeaponSkins?.[item.weaponId] === item.weaponSkinId;
  }
  if (item.emoteId) {
    return (snapshot.equippedEmoteWheel ?? []).includes(item.emoteId);
  }
  if (
    snapshot.equippedOutfitId === item.id ||
    snapshot.equippedGliderId === item.id ||
    snapshot.equippedEmoteId === item.id ||
    snapshot.equippedGlooSkinId === item.id
  ) {
    return true;
  }
  if (item.customizationPatch) {
    const entries = Object.entries(item.customizationPatch) as Array<
      [keyof R6Customization, R6Customization[keyof R6Customization]]
    >;
    if (entries.length > 0 && entries.every(([k, v]) => customization[k] === v)) {
      return true;
    }
  }
  return Object.values(snapshot.equippedArmoryIds ?? {}).includes(item.id);
}

export interface VaultWeaponStateLike {
  ownedIds?: readonly string[];
  equippedArmoryIds?: Partial<Record<ShopCategory, string>>;
  equippedWeaponSkins?: Record<string, string>;
}

export function resolveEquippedLobbyWeaponItem(
  vault?: VaultWeaponStateLike | null,
): ShopCatalogItem | null {
  const itemId = vault?.equippedArmoryIds?.weapons;
  if (!itemId) return null;
  const item = NEXUS_SHOP_CATALOG.find(
    (entry) => entry.id === itemId && entry.category === 'weapons' && Boolean(entry.weaponId),
  );
  if (!item) return null;
  const owned = Boolean(item.defaultOwned) || Boolean(vault?.ownedIds?.includes(item.id));
  return owned ? item : null;
}

export function resolveEquippedLobbyWeaponId(
  vault?: VaultWeaponStateLike | null,
): string | null {
  return resolveEquippedLobbyWeaponItem(vault)?.weaponId ?? null;
}

export function resolveEquippedLobbyWeaponSkinId(
  vault: VaultWeaponStateLike | null | undefined,
  weaponId: string | null | undefined,
): string | null {
  if (!weaponId) return null;
  const skinId = vault?.equippedWeaponSkins?.[weaponId];
  if (!skinId) return null;
  const skinItem = NEXUS_SHOP_CATALOG.find(
    (entry) => entry.weaponSkinId === skinId && entry.weaponId === weaponId,
  );
  if (!skinItem) return null;
  const owned = Boolean(skinItem.defaultOwned) || Boolean(vault?.ownedIds?.includes(skinItem.id));
  return owned ? skinId : null;
}

export const NEXUS_SHOP_CATALOG: readonly ShopCatalogItem[] = [
  // --- EXISTING FEATURED, OUTFITS, GLIDERS & BEACONS (PRESERVED VERBATIM) ---
  {
    id: 'offer-apex-drop',
    name: 'APEX ORBITAL CHASSIS',
    category: 'featured',
    subCategory: 'Outfits',
    rarity: 'Legendary',
    priceCredits: 1800,
    accentHex: '#f97316',
    description: 'High-altitude Exo-Lv.3 combat rig with solar desert armor & holo visor.',
    customizationPatch: {
      topId: 'tactical_parka',
      pantsId: 'cargo_olive',
      shoesId: 'boots_tan',
      armorId: 'nether_gold_lv3',
      accessoryId: 'crown',
    },
    specs: [
      { labelKey: 'shop.spec.armor', value: 'Exo Lv.3' },
      { labelKey: 'shop.spec.effect', value: 'Orbital Rig' },
    ],
  },
  {
    id: 'offer-shadow-vanguard',
    name: 'CRIMSON VANGUARD KIT',
    category: 'featured',
    subCategory: 'Outfits',
    rarity: 'Epic',
    priceCredits: 1400,
    accentHex: '#ef4444',
    description: 'Night-raid crimson armor ensemble with bomber jacket, respirator mask & combat cape.',
    customizationPatch: {
      topId: 'bomber_jacket',
      pantsId: 'jeans_black',
      shoesId: 'sneakers_crimson',
      maskId: 'respirator',
      armorId: 'diamond_lv2',
      accessoryId: 'cape',
    },
    specs: [
      { labelKey: 'shop.spec.armor', value: 'Ballistic Lv.2' },
      { labelKey: 'shop.spec.effect', value: 'Night Raid' },
    ],
  },
  {
    id: 'offer-cobalt-visor',
    name: 'COBALT RECON MODULE',
    category: 'outfits',
    subCategory: 'Outfits',
    rarity: 'Epic',
    priceCredits: 1200,
    accentHex: '#38bdf8',
    description: 'Spec-Ops tactical telemetry rig with Lv.2 ballistic plate, cyber visor & high-tops.',
    customizationPatch: {
      topId: 'operator_sync',
      pantsId: 'joggers_slate',
      shoesId: 'hightops_cyan',
      glassesId: 'cyber_visor',
      armorId: 'diamond_lv2',
      accessoryId: 'shades',
    },
    specs: [
      { labelKey: 'shop.spec.armor', value: 'Ballistic Lv.2' },
      { labelKey: 'shop.spec.effect', value: 'Cyber Visor' },
    ],
  },
  {
    id: 'offer-arctic-ghost',
    name: 'ARCTIC ALPINE PARKA',
    category: 'outfits',
    subCategory: 'Outfits',
    rarity: 'Rare',
    priceCredits: 900,
    accentHex: '#7dd3fc',
    description: 'Sub-zero frost parka paired with knit beanie, Lv.1 Kevlar vest and comms headset.',
    customizationPatch: {
      topId: 'tactical_parka',
      pantsId: 'cargo_charcoal',
      shoesId: 'boots_combat',
      hatId: 'beanie',
      armorId: 'iron_lv1',
      accessoryId: 'headphones',
    },
    specs: [
      { labelKey: 'shop.spec.armor', value: 'Kevlar Lv.1' },
      { labelKey: 'shop.spec.effect', value: 'Alpine Comms' },
    ],
  },
  {
    id: 'offer-woodland-ranger',
    name: 'WOODLAND RECON CAMO',
    category: 'outfits',
    subCategory: 'Outfits',
    rarity: 'Rare',
    priceCredits: 750,
    accentHex: '#84cc16',
    description: 'Forest camouflage field uniform with tactical cap & expedition pack.',
    customizationPatch: {
      topId: 'puffer_vest',
      pantsId: 'tactical_camo',
      shoesId: 'boots_tan',
      hatId: 'tactical_cap',
      armorId: 'iron_lv1',
      accessoryId: 'backpack',
    },
    specs: [
      { labelKey: 'shop.spec.armor', value: 'Kevlar Lv.1' },
      { labelKey: 'shop.spec.effect', value: 'Field Pack' },
    ],
  },
  {
    id: DEFAULT_GLIDER_ID,
    name: 'NEXUS STANDARD WING',
    category: 'gliders',
    subCategory: 'Gliders',
    rarity: 'Common',
    priceCredits: 0,
    accentHex: '#f97316',
    description: 'Standard-issue high-visibility tactical insertion parafoil.',
    defaultOwned: true,
    gliderColors: { primaryHex: '#f97316', accentHex: '#e2e8f0' },
    specs: [
      { labelKey: 'shop.spec.effect', value: 'Parafoil Drop' },
    ],
  },
  {
    id: 'offer-vector-wing',
    name: 'VECTOR STEALTH GLIDER',
    category: 'gliders',
    subCategory: 'Gliders',
    rarity: 'Rare',
    priceCredits: 800,
    accentHex: '#2dd4bf',
    description: 'Teal-and-slate stealth parafoil canopy engineered for low-profile drops.',
    gliderColors: { primaryHex: '#0f766e', accentHex: '#2dd4bf' },
    specs: [
      { labelKey: 'shop.spec.effect', value: 'Low-Profile Wing' },
    ],
  },
  {
    id: 'offer-solar-wing',
    name: 'SOLAR APEX CANOPY',
    category: 'gliders',
    subCategory: 'Gliders',
    rarity: 'Legendary',
    priceCredits: 1500,
    accentHex: '#f59e0b',
    description: 'Gold-and-obsidian orbital drop wing with reinforced ribs.',
    gliderColors: { primaryHex: '#1e293b', accentHex: '#f59e0b' },
    specs: [
      { labelKey: 'shop.spec.effect', value: 'Orbital Wing' },
    ],
  },
  {
    id: DEFAULT_EMOTE_ID,
    name: 'COMMAND PAD BEACON',
    category: 'emotes',
    subCategory: 'Beacons',
    rarity: 'Common',
    priceCredits: 0,
    accentHex: '#f59e0b',
    description: 'Standard helipad amber perimeter signal flare.',
    defaultOwned: true,
    beaconHex: '#f59e0b',
    specs: [
      { labelKey: 'shop.spec.effect', value: 'Amber Pad Signal' },
    ],
  },
  {
    id: 'offer-pulse-signal',
    name: 'VICTORY PULSE FLARE',
    category: 'emotes',
    subCategory: 'Beacons',
    rarity: 'Rare',
    priceCredits: 500,
    accentHex: '#a855f7',
    description: 'Violet holographic helipad beacon & lobby companion salute.',
    beaconHex: '#a855f7',
    specs: [
      { labelKey: 'shop.spec.effect', value: 'Violet Pulse' },
    ],
  },
  {
    id: 'offer-cobalt-flare',
    name: 'ORBITAL SKY BEACON',
    category: 'emotes',
    subCategory: 'Beacons',
    rarity: 'Epic',
    priceCredits: 650,
    accentHex: '#38bdf8',
    description: 'High-intensity cyan orbital telemetry beacon on the command pad.',
    beaconHex: '#38bdf8',
    specs: [
      { labelKey: 'shop.spec.effect', value: 'Orbital Telemetry' },
    ],
  },

  // --- WEAPONS: RIFLES ---
  {
    id: 'armory-scar',
    name: 'SCAR',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Rare',
    priceCredits: 650,
    accentHex: '#f59e0b',
    description: 'Modular assault rifle with steady mid-range precision.',
    weaponId: 'scar',
    lootId: 'weapon_scar',
    specs: [
      { labelKey: 'shop.spec.damage', value: '33 / 58' },
      { labelKey: 'shop.spec.fireRate', value: '620 RPM' },
      { labelKey: 'shop.spec.range', value: '95 m' },
      { labelKey: 'shop.spec.mag', value: '30' },
    ],
  },
  {
    id: 'armory-ak24',
    name: 'AK-47',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Epic',
    priceCredits: 850,
    accentHex: '#ef4444',
    description: 'Hard-hitting 7.62mm assault rifle built for heavy armor.',
    weaponId: 'ak24',
    lootId: 'weapon_ak24',
    specs: [
      { labelKey: 'shop.spec.damage', value: '38 / 68' },
      { labelKey: 'shop.spec.fireRate', value: '560 RPM' },
      { labelKey: 'shop.spec.range', value: '90 m' },
      { labelKey: 'shop.spec.mag', value: '30' },
    ],
  },
  {
    id: 'armory-m4a1',
    name: 'M4A1',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Rare',
    priceCredits: 700,
    accentHex: '#38bdf8',
    description: 'Versatile carbine with low recoil, high mobility, and iron sights.',
    weaponId: 'm4a1',
    lootId: 'weapon_m4a1',
    specs: [
      { labelKey: 'shop.spec.damage', value: '31 / 54' },
      { labelKey: 'shop.spec.fireRate', value: '700 RPM' },
      { labelKey: 'shop.spec.range', value: '88 m' },
      { labelKey: 'shop.spec.mag', value: '30' },
    ],
  },
  {
    id: 'armory-parafal',
    name: 'PARAFAL',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Legendary',
    priceCredits: 1350,
    accentHex: '#eab308',
    description: 'Long-range battle rifle with high critical headshot output.',
    weaponId: 'parafal',
    lootId: 'weapon_parafal',
    specs: [
      { labelKey: 'shop.spec.damage', value: '45 / 82' },
      { labelKey: 'shop.spec.fireRate', value: '470 RPM' },
      { labelKey: 'shop.spec.range', value: '115 m' },
      { labelKey: 'shop.spec.mag', value: '24' },
    ],
  },
  {
    id: 'armory-famas',
    name: 'FAMAS',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Rare',
    priceCredits: 620,
    accentHex: '#38bdf8',
    description: 'Bullpup 5.56mm assault rifle delivering rapid 820 RPM fire in tight corridors.',
    weaponId: 'famas',
    lootId: 'weapon_famas',
    specs: [
      { labelKey: 'shop.spec.damage', value: '30 / 54' },
      { labelKey: 'shop.spec.fireRate', value: '820 RPM' },
      { labelKey: 'shop.spec.range', value: '90 m' },
      { labelKey: 'shop.spec.mag', value: '25' },
    ],
  },
  {
    id: 'armory-aug',
    name: 'AUG',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Rare',
    priceCredits: 780,
    accentHex: '#84cc16',
    description: 'Bullpup rifle with integrated optic sight and ultra-stable vertical recoil.',
    weaponId: 'aug',
    lootId: 'weapon_aug',
    specs: [
      { labelKey: 'shop.spec.damage', value: '32 / 57' },
      { labelKey: 'shop.spec.fireRate', value: '680 RPM' },
      { labelKey: 'shop.spec.range', value: '96 m' },
      { labelKey: 'shop.spec.mag', value: '30' },
    ],
  },
  {
    id: 'armory-groza',
    name: 'Groza',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Epic',
    priceCredits: 1150,
    accentHex: '#f97316',
    description: 'High-impact 7.62mm bullpup carbine combining heavy stopping power and speed.',
    weaponId: 'groza',
    lootId: 'weapon_groza',
    specs: [
      { labelKey: 'shop.spec.damage', value: '39 / 70' },
      { labelKey: 'shop.spec.fireRate', value: '690 RPM' },
      { labelKey: 'shop.spec.range', value: '94 m' },
      { labelKey: 'shop.spec.mag', value: '30' },
    ],
  },
  {
    id: 'armory-an94',
    name: 'AN94',
    category: 'weapons',
    subCategory: 'Rifles',
    rarity: 'Epic',
    priceCredits: 980,
    accentHex: '#06b6d4',
    description: 'Precision-engineered assault rifle with angled magazine and crisp burst control.',
    weaponId: 'an94',
    lootId: 'weapon_an94',
    specs: [
      { labelKey: 'shop.spec.damage', value: '36 / 65' },
      { labelKey: 'shop.spec.fireRate', value: '640 RPM' },
      { labelKey: 'shop.spec.range', value: '95 m' },
      { labelKey: 'shop.spec.mag', value: '30' },
    ],
  },

  // --- WEAPONS: LMGs ---
  {
    id: 'armory-m249',
    name: 'M249',
    category: 'weapons',
    subCategory: 'LMGs',
    rarity: 'Legendary',
    priceCredits: 1550,
    accentHex: '#22c55e',
    description: 'Belt-fed 100-round squad automatic weapon for relentless sustained suppression.',
    weaponId: 'm249',
    lootId: 'weapon_m249',
    specs: [
      { labelKey: 'shop.spec.damage', value: '34 / 58' },
      { labelKey: 'shop.spec.fireRate', value: '760 RPM' },
      { labelKey: 'shop.spec.range', value: '105 m' },
      { labelKey: 'shop.spec.mag', value: '100' },
    ],
  },
  {
    id: 'armory-m60',
    name: 'M60',
    category: 'weapons',
    subCategory: 'LMGs',
    rarity: 'Epic',
    priceCredits: 1080,
    accentHex: '#84cc16',
    description: 'Heavy 7.62mm general-purpose machine gun with deep 75-round belt box.',
    weaponId: 'm60',
    lootId: 'weapon_m60',
    specs: [
      { labelKey: 'shop.spec.damage', value: '38 / 65' },
      { labelKey: 'shop.spec.fireRate', value: '600 RPM' },
      { labelKey: 'shop.spec.range', value: '110 m' },
      { labelKey: 'shop.spec.mag', value: '75' },
    ],
  },
  {
    id: 'armory-dp28',
    name: 'DP-28',
    category: 'weapons',
    subCategory: 'LMGs',
    rarity: 'Rare',
    priceCredits: 860,
    accentHex: '#d97706',
    description: 'Iconic top-pan 47-round machine gun with steady recoil and punchy 7.62mm rounds.',
    weaponId: 'dp28',
    lootId: 'weapon_dp28',
    specs: [
      { labelKey: 'shop.spec.damage', value: '41 / 72' },
      { labelKey: 'shop.spec.fireRate', value: '540 RPM' },
      { labelKey: 'shop.spec.range', value: '108 m' },
      { labelKey: 'shop.spec.mag', value: '47' },
    ],
  },

  // --- WEAPONS: SNIPERS ---
  {
    id: 'armory-awm',
    name: 'AWM',
    category: 'weapons',
    subCategory: 'Snipers',
    rarity: 'Legendary',
    priceCredits: 1600,
    accentHex: '#84cc16',
    description: 'Heavy bolt-action .338 sniper rifle with precision optical scope.',
    weaponId: 'awm',
    lootId: 'weapon_awm',
    specs: [
      { labelKey: 'shop.spec.damage', value: '105 / 210' },
      { labelKey: 'shop.spec.fireRate', value: '42 RPM' },
      { labelKey: 'shop.spec.range', value: '220 m' },
      { labelKey: 'shop.spec.mag', value: '5' },
    ],
  },
  {
    id: 'armory-kar98k',
    name: 'KAR98K',
    category: 'weapons',
    subCategory: 'Snipers',
    rarity: 'Epic',
    priceCredits: 950,
    accentHex: '#cbd5e1',
    description: 'Classic bolt-action rifle with walnut stock and crisp iron sights.',
    weaponId: 'kar98k',
    lootId: 'weapon_kar98k',
    specs: [
      { labelKey: 'shop.spec.damage', value: '88 / 176' },
      { labelKey: 'shop.spec.fireRate', value: '52 RPM' },
      { labelKey: 'shop.spec.range', value: '190 m' },
      { labelKey: 'shop.spec.mag', value: '5' },
    ],
  },
  {
    id: 'armory-m24',
    name: 'M24',
    category: 'weapons',
    subCategory: 'Snipers',
    rarity: 'Epic',
    priceCredits: 1280,
    accentHex: '#38bdf8',
    description: 'Sleek tactical bolt-action sniper rifle with crisp handling and high muzzle velocity.',
    weaponId: 'm24',
    lootId: 'weapon_m24',
    specs: [
      { labelKey: 'shop.spec.damage', value: '94 / 215' },
      { labelKey: 'shop.spec.fireRate', value: '45 RPM' },
      { labelKey: 'shop.spec.range', value: '235 m' },
      { labelKey: 'shop.spec.mag', value: '5' },
    ],
  },
  {
    id: 'armory-svd',
    name: 'SVD',
    category: 'weapons',
    subCategory: 'Snipers',
    rarity: 'Epic',
    priceCredits: 1120,
    accentHex: '#eab308',
    description: 'Semi-automatic designated marksman rifle firing rapid 7.62x54mm rounds.',
    weaponId: 'svd',
    lootId: 'weapon_svd',
    specs: [
      { labelKey: 'shop.spec.damage', value: '64 / 134' },
      { labelKey: 'shop.spec.fireRate', value: '175 RPM' },
      { labelKey: 'shop.spec.range', value: '185 m' },
      { labelKey: 'shop.spec.mag', value: '10' },
    ],
  },
  {
    id: 'armory-vss',
    name: 'VSS',
    category: 'weapons',
    subCategory: 'Snipers',
    rarity: 'Rare',
    priceCredits: 760,
    accentHex: '#a855f7',
    description: 'Integrally suppressed marksman rifle built for silent mid-to-long-range picks.',
    weaponId: 'vss',
    lootId: 'weapon_vss',
    specs: [
      { labelKey: 'shop.spec.damage', value: '42 / 88' },
      { labelKey: 'shop.spec.fireRate', value: '340 RPM' },
      { labelKey: 'shop.spec.range', value: '140 m' },
      { labelKey: 'shop.spec.mag', value: '15' },
    ],
  },
  {
    id: 'armory-dragunov',
    name: 'Dragunov',
    category: 'weapons',
    subCategory: 'Snipers',
    rarity: 'Legendary',
    priceCredits: 1480,
    accentHex: '#f59e0b',
    description: 'Modernized tactical Dragunov DMR delivering lethal semi-auto follow-up shots.',
    weaponId: 'dragunov',
    lootId: 'weapon_dragunov',
    specs: [
      { labelKey: 'shop.spec.damage', value: '70 / 148' },
      { labelKey: 'shop.spec.fireRate', value: '150 RPM' },
      { labelKey: 'shop.spec.range', value: '195 m' },
      { labelKey: 'shop.spec.mag', value: '10' },
    ],
  },

  // --- WEAPONS: SMGs ---
  {
    id: 'armory-ump',
    name: 'UMP',
    category: 'weapons',
    subCategory: 'SMGs',
    rarity: 'Common',
    priceCredits: 350,
    accentHex: '#38bdf8',
    description: 'Balanced tactical SMG with reliable close-to-mid control.',
    weaponId: 'ump',
    lootId: 'weapon_ump',
    specs: [
      { labelKey: 'shop.spec.damage', value: '25 / 42' },
      { labelKey: 'shop.spec.fireRate', value: '640 RPM' },
      { labelKey: 'shop.spec.range', value: '58 m' },
      { labelKey: 'shop.spec.mag', value: '28' },
    ],
  },
  {
    id: 'armory-mp5',
    name: 'MP5',
    category: 'weapons',
    subCategory: 'SMGs',
    rarity: 'Rare',
    priceCredits: 500,
    accentHex: '#2dd4bf',
    description: 'High-rate close-quarters SMG with low recoil.',
    weaponId: 'mp5',
    lootId: 'weapon_mp5',
    specs: [
      { labelKey: 'shop.spec.damage', value: '21 / 36' },
      { labelKey: 'shop.spec.fireRate', value: '800 RPM' },
      { labelKey: 'shop.spec.range', value: '54 m' },
      { labelKey: 'shop.spec.mag', value: '32' },
    ],
  },
  {
    id: 'armory-mp40',
    name: 'MP40',
    category: 'weapons',
    subCategory: 'SMGs',
    rarity: 'Rare',
    priceCredits: 550,
    accentHex: '#facc15',
    description: 'Rapid-fire submachine gun tuned for aggressive pushes.',
    weaponId: 'mp40',
    lootId: 'weapon_mp40',
    specs: [
      { labelKey: 'shop.spec.damage', value: '22 / 35' },
      { labelKey: 'shop.spec.fireRate', value: '880 RPM' },
      { labelKey: 'shop.spec.range', value: '46 m' },
      { labelKey: 'shop.spec.mag', value: '30' },
    ],
  },
  {
    id: 'armory-vector',
    name: 'Vector',
    category: 'weapons',
    subCategory: 'SMGs',
    rarity: 'Rare',
    priceCredits: 640,
    accentHex: '#38bdf8',
    description: 'Ultra-rapid 1050 RPM SMG with Super V recoil mitigation for close-quarters shreds.',
    weaponId: 'vector',
    lootId: 'weapon_vector',
    specs: [
      { labelKey: 'shop.spec.damage', value: '19 / 31' },
      { labelKey: 'shop.spec.fireRate', value: '1050 RPM' },
      { labelKey: 'shop.spec.range', value: '44 m' },
      { labelKey: 'shop.spec.mag', value: '25' },
    ],
  },
  {
    id: 'armory-p90',
    name: 'P90',
    category: 'weapons',
    subCategory: 'SMGs',
    rarity: 'Rare',
    priceCredits: 680,
    accentHex: '#2dd4bf',
    description: 'Compact 50-round top-fed PDW built for prolonged CQB squad engagements.',
    weaponId: 'p90',
    lootId: 'weapon_p90',
    specs: [
      { labelKey: 'shop.spec.damage', value: '20 / 33' },
      { labelKey: 'shop.spec.fireRate', value: '900 RPM' },
      { labelKey: 'shop.spec.range', value: '55 m' },
      { labelKey: 'shop.spec.mag', value: '50' },
    ],
  },
  {
    id: 'armory-thompson',
    name: 'Thompson',
    category: 'weapons',
    subCategory: 'SMGs',
    rarity: 'Common',
    priceCredits: 520,
    accentHex: '#d97706',
    description: 'Classic drum-fed .45 ACP submachine gun with 42 rounds and steady hip-fire.',
    weaponId: 'thompson',
    lootId: 'weapon_thompson',
    specs: [
      { labelKey: 'shop.spec.damage', value: '26 / 43' },
      { labelKey: 'shop.spec.fireRate', value: '700 RPM' },
      { labelKey: 'shop.spec.range', value: '50 m' },
      { labelKey: 'shop.spec.mag', value: '42' },
    ],
  },

  // --- WEAPONS: SHOTGUNS ---
  {
    id: 'armory-m1014',
    name: 'M1014',
    category: 'weapons',
    subCategory: 'Shotguns',
    rarity: 'Rare',
    priceCredits: 600,
    accentHex: '#ef4444',
    description: 'Semi-auto tactical combat shotgun with 7-round tubular magazine.',
    weaponId: 'm1014',
    lootId: 'weapon_m1014',
    specs: [
      { labelKey: 'shop.spec.damage', value: '14x7' },
      { labelKey: 'shop.spec.fireRate', value: '165 RPM' },
      { labelKey: 'shop.spec.range', value: '26 m' },
      { labelKey: 'shop.spec.mag', value: '7' },
    ],
  },
  {
    id: 'armory-m1887',
    name: 'M1887',
    category: 'weapons',
    subCategory: 'Shotguns',
    rarity: 'Epic',
    priceCredits: 800,
    accentHex: '#f97316',
    description: 'Break-action double-barrel 8-pellet shotgun devastating up close.',
    weaponId: 'm1887',
    lootId: 'weapon_m1887',
    specs: [
      { labelKey: 'shop.spec.damage', value: '18x8' },
      { labelKey: 'shop.spec.fireRate', value: '115 RPM' },
      { labelKey: 'shop.spec.range', value: '22 m' },
      { labelKey: 'shop.spec.mag', value: '2' },
    ],
  },
  {
    id: 'armory-spas12',
    name: 'SPAS12',
    category: 'weapons',
    subCategory: 'Shotguns',
    rarity: 'Rare',
    priceCredits: 660,
    accentHex: '#ef4444',
    description: 'Heavy 8-shell tactical shotgun with tight pellet grouping and reliable range.',
    weaponId: 'spas12',
    lootId: 'weapon_spas12',
    specs: [
      { labelKey: 'shop.spec.damage', value: '15x7' },
      { labelKey: 'shop.spec.fireRate', value: '135 RPM' },
      { labelKey: 'shop.spec.range', value: '26 m' },
      { labelKey: 'shop.spec.mag', value: '8' },
    ],
  },
  {
    id: 'armory-double-barrel',
    name: 'Double Barrel',
    category: 'weapons',
    subCategory: 'Shotguns',
    rarity: 'Epic',
    priceCredits: 840,
    accentHex: '#b45309',
    description: 'Side-by-side 12-gauge break-action shotgun unleashing twin devastating blasts.',
    weaponId: 'double_barrel',
    lootId: 'weapon_double_barrel',
    specs: [
      { labelKey: 'shop.spec.damage', value: '17x8' },
      { labelKey: 'shop.spec.fireRate', value: '95 RPM' },
      { labelKey: 'shop.spec.range', value: '24 m' },
      { labelKey: 'shop.spec.mag', value: '2' },
    ],
  },

  // --- WEAPONS: PISTOLS & MELEE ---
  {
    id: 'armory-desert-eagle',
    name: 'Desert Eagle',
    category: 'weapons',
    subCategory: 'Pistols',
    rarity: 'Rare',
    priceCredits: 450,
    accentHex: '#f59e0b',
    description: 'Heavy .50 AE magnum pistol packing rifle-tier stopping power.',
    weaponId: 'desert_eagle',
    lootId: 'weapon_desert_eagle',
    specs: [
      { labelKey: 'shop.spec.damage', value: '48 / 92' },
      { labelKey: 'shop.spec.fireRate', value: '210 RPM' },
      { labelKey: 'shop.spec.range', value: '62 m' },
      { labelKey: 'shop.spec.mag', value: '7' },
    ],
  },
  {
    id: 'armory-glock',
    name: 'Glock',
    category: 'weapons',
    subCategory: 'Pistols',
    rarity: 'Common',
    priceCredits: 250,
    accentHex: '#38bdf8',
    description: 'Compact 9mm tactical sidearm with 17-round magazine and fast handling.',
    weaponId: 'glock',
    lootId: 'weapon_glock',
    specs: [
      { labelKey: 'shop.spec.damage', value: '24 / 44' },
      { labelKey: 'shop.spec.fireRate', value: '420 RPM' },
      { labelKey: 'shop.spec.range', value: '48 m' },
      { labelKey: 'shop.spec.mag', value: '17' },
    ],
  },
  {
    id: 'armory-usp',
    name: 'USP',
    category: 'weapons',
    subCategory: 'Pistols',
    rarity: 'Common',
    priceCredits: 320,
    accentHex: '#94a3b8',
    description: 'Match-grade .45 tactical pistol offering tight recoil recovery and crisp precision.',
    weaponId: 'usp',
    lootId: 'weapon_usp',
    specs: [
      { labelKey: 'shop.spec.damage', value: '27 / 50' },
      { labelKey: 'shop.spec.fireRate', value: '340 RPM' },
      { labelKey: 'shop.spec.range', value: '48 m' },
      { labelKey: 'shop.spec.mag', value: '12' },
    ],
  },
  {
    id: 'armory-m1917',
    name: 'M1917',
    category: 'weapons',
    subCategory: 'Pistols',
    rarity: 'Rare',
    priceCredits: 560,
    accentHex: '#f59e0b',
    description: 'Heavy 6-shot .45 ACP revolver with swing-out cylinder and massive stopping power.',
    weaponId: 'm1917',
    lootId: 'weapon_m1917',
    specs: [
      { labelKey: 'shop.spec.damage', value: '54 / 104' },
      { labelKey: 'shop.spec.fireRate', value: '165 RPM' },
      { labelKey: 'shop.spec.range', value: '60 m' },
      { labelKey: 'shop.spec.mag', value: '6' },
    ],
  },
  {
    id: 'armory-combat-knife',
    name: 'Combat Knife',
    category: 'weapons',
    subCategory: 'Melee',
    rarity: 'Rare',
    priceCredits: 300,
    accentHex: '#e2e8f0',
    description: 'High-speed tactical fixed blade for silent close-quarters eliminations.',
    weaponId: 'combat_knife',
    lootId: 'weapon_combat_knife',
    specs: [
      { labelKey: 'shop.spec.damage', value: '55 / 95' },
      { labelKey: 'shop.spec.range', value: '2.4 m' },
    ],
  },
  {
    id: 'armory-baseball-bat',
    name: 'Baseball Bat',
    category: 'weapons',
    subCategory: 'Melee',
    rarity: 'Common',
    priceCredits: 200,
    accentHex: '#d97706',
    description: 'Heavy ash wood bat with extended reach and devastating headshots.',
    weaponId: 'baseball_bat',
    lootId: 'weapon_baseball_bat',
    specs: [
      { labelKey: 'shop.spec.damage', value: '48 / 86' },
      { labelKey: 'shop.spec.range', value: '2.8 m' },
    ],
  },

  // --- ARMOR: VESTS, HELMETS & BACKPACKS ---
  {
    id: 'armory-armor-lv1',
    name: 'Tactical Vest Lv.1',
    category: 'armor',
    subCategory: 'Vests',
    rarity: 'Common',
    priceCredits: 300,
    accentHex: '#64748b',
    description: 'Light ballistic vest (45 Armor, 14% damage mitigation).',
    lootId: 'armor_lv1',
    specs: [
      { labelKey: 'shop.spec.armor', value: '45' },
      { labelKey: 'shop.spec.mitigation', value: '14%' },
    ],
  },
  {
    id: 'armory-armor-lv2',
    name: 'Ballistic Rig Lv.2',
    category: 'armor',
    subCategory: 'Vests',
    rarity: 'Rare',
    priceCredits: 700,
    accentHex: '#38bdf8',
    description: 'Reinforced combat vest (80 Armor, 24% damage mitigation).',
    lootId: 'armor_lv2',
    specs: [
      { labelKey: 'shop.spec.armor', value: '80' },
      { labelKey: 'shop.spec.mitigation', value: '24%' },
    ],
  },
  {
    id: 'armory-armor-lv3',
    name: 'Nexus Exo-Plate Lv.3',
    category: 'armor',
    subCategory: 'Vests',
    rarity: 'Legendary',
    priceCredits: 1300,
    accentHex: '#f59e0b',
    description: 'Heavy titanium exo-armor (120 Armor, 35% damage mitigation).',
    lootId: 'armor_lv3',
    specs: [
      { labelKey: 'shop.spec.armor', value: '120' },
      { labelKey: 'shop.spec.mitigation', value: '35%' },
    ],
  },
  {
    id: 'armory-helmet-lv1',
    name: 'Tactical Helmet Lv.1',
    category: 'armor',
    subCategory: 'Helmets',
    rarity: 'Common',
    priceCredits: 280,
    accentHex: '#94a3b8',
    description: 'Light ballistic helmet (45 Durability, 12% damage mitigation).',
    lootId: 'helmet_lv1',
    specs: [
      { labelKey: 'shop.spec.armor', value: '45' },
      { labelKey: 'shop.spec.mitigation', value: '12%' },
    ],
  },
  {
    id: 'armory-helmet-lv2',
    name: 'Combat Helmet Lv.2',
    category: 'armor',
    subCategory: 'Helmets',
    rarity: 'Rare',
    priceCredits: 650,
    accentHex: '#38bdf8',
    description: 'Reinforced combat helmet (75 Durability, 22% damage mitigation).',
    lootId: 'helmet_lv2',
    specs: [
      { labelKey: 'shop.spec.armor', value: '75' },
      { labelKey: 'shop.spec.mitigation', value: '22%' },
    ],
  },
  {
    id: 'armory-helmet-lv3',
    name: 'Titan Visor Helmet Lv.3',
    category: 'armor',
    subCategory: 'Helmets',
    rarity: 'Legendary',
    priceCredits: 1250,
    accentHex: '#f59e0b',
    description: 'Armored titanium visor helm (110 Durability, 32% damage mitigation).',
    lootId: 'helmet_lv3',
    specs: [
      { labelKey: 'shop.spec.armor', value: '110' },
      { labelKey: 'shop.spec.mitigation', value: '32%' },
    ],
  },
  {
    id: 'armory-backpack-lv1',
    name: 'Scout Pack Lv.1',
    category: 'armor',
    subCategory: 'Backpacks',
    rarity: 'Common',
    priceCredits: 250,
    accentHex: '#a16207',
    description: 'Compact field backpack adding +6 tactical inventory slots.',
    lootId: 'backpack_lv1',
    specs: [
      { labelKey: 'shop.spec.slots', value: '+6' },
    ],
  },
  {
    id: 'armory-backpack-lv2',
    name: 'Tactical Rucksack Lv.2',
    category: 'armor',
    subCategory: 'Backpacks',
    rarity: 'Rare',
    priceCredits: 550,
    accentHex: '#38bdf8',
    description: 'Modular combat rucksack adding +12 inventory slots.',
    lootId: 'backpack_lv2',
    specs: [
      { labelKey: 'shop.spec.slots', value: '+12' },
    ],
  },
  {
    id: 'armory-backpack-lv3',
    name: 'Expedition Heavy Pack Lv.3',
    category: 'armor',
    subCategory: 'Backpacks',
    rarity: 'Legendary',
    priceCredits: 1100,
    accentHex: '#f59e0b',
    description: 'High-capacity exo-pack adding +18 inventory slots.',
    lootId: 'backpack_lv3',
    specs: [
      { labelKey: 'shop.spec.slots', value: '+18' },
    ],
  },

  // --- EQUIPMENT: OPTICAL SCOPES ---
  {
    id: 'armory-scope-2x',
    name: '2x Tactical Scope',
    category: 'equipment',
    subCategory: 'Scopes',
    rarity: 'Common',
    priceCredits: 320,
    accentHex: '#22c55e',
    description: 'Compact 2x optical sight for SMGs and assault rifles.',
    lootId: 'scope_2x',
    specs: [
      { labelKey: 'shop.spec.zoom', value: '2x' },
    ],
  },
  {
    id: 'armory-scope-4x',
    name: '4x ACOG Scope',
    category: 'equipment',
    subCategory: 'Scopes',
    rarity: 'Rare',
    priceCredits: 520,
    accentHex: '#38bdf8',
    description: '4x precision tactical optic unlocking medium-to-long range zoom.',
    lootId: 'scope_4x',
    specs: [
      { labelKey: 'shop.spec.zoom', value: '4x' },
    ],
  },
  {
    id: 'armory-scope-8x',
    name: '8x Sniper Scope',
    category: 'equipment',
    subCategory: 'Scopes',
    rarity: 'Legendary',
    priceCredits: 900,
    accentHex: '#f59e0b',
    description: 'Variable 4x–8x ballistic sniper scope with mil-dot rangefinder reticle.',
    lootId: 'scope_8x',
    specs: [
      { labelKey: 'shop.spec.zoom', value: '4x–8x' },
    ],
  },

  // --- TOOLS: MEDICAL, SHIELDS & FIELD UTILITY ---
  {
    id: 'armory-med-bandage',
    name: 'Field Bandage',
    category: 'tools',
    subCategory: 'Medical',
    rarity: 'Common',
    priceCredits: 120,
    accentHex: '#22c55e',
    description: 'Restores +25 Health cleanly on the move.',
    lootId: 'med_bandage',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+25 HP' },
    ],
  },
  {
    id: 'armory-med-kit',
    name: 'Combat Medkit',
    category: 'tools',
    subCategory: 'Medical',
    rarity: 'Rare',
    priceCredits: 380,
    accentHex: '#10b981',
    description: 'Full field trauma kit restoring +80 Health.',
    lootId: 'med_kit',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+80 HP' },
    ],
  },
  {
    id: 'armory-shield-cell',
    name: 'Shield Cell',
    category: 'tools',
    subCategory: 'Shields',
    rarity: 'Common',
    priceCredits: 160,
    accentHex: '#38bdf8',
    description: 'Restores +25 Energy Shield quickly in combat.',
    lootId: 'shield_cell',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+25 Shield' },
    ],
  },
  {
    id: 'armory-shield-battery',
    name: 'Shield Battery',
    category: 'tools',
    subCategory: 'Shields',
    rarity: 'Rare',
    priceCredits: 420,
    accentHex: '#0ea5e9',
    description: 'Restores +65 Energy Shield for rapid re-engagement.',
    lootId: 'shield_battery',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+65 Shield' },
    ],
  },
  {
    id: 'armory-special-adrenaline',
    name: 'Adrenaline Syringe',
    category: 'tools',
    subCategory: 'Tactical',
    rarity: 'Epic',
    priceCredits: 620,
    accentHex: '#a855f7',
    description: 'Restores +35 HP & +35 Shield and grants +20% sprint speed for 8s.',
    lootId: 'special_adrenaline',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+35 HP / +35 SH' },
    ],
  },
  {
    id: 'armory-special-recon',
    name: 'Recon Uplink Chip',
    category: 'tools',
    subCategory: 'Tactical',
    rarity: 'Epic',
    priceCredits: 680,
    accentHex: '#c084fc',
    description: 'Expands enemy minimap radar to 60m & boosts reload speed by 25% for 12s.',
    lootId: 'special_recon_chip',
    specs: [
      { labelKey: 'shop.spec.effect', value: '60m Radar · +25% Reload' },
    ],
  },
  {
    id: 'armory-utility-repair',
    name: 'Armor Repair Kit',
    category: 'tools',
    subCategory: 'Tactical',
    rarity: 'Rare',
    priceCredits: 340,
    accentHex: '#14b8a6',
    description: 'Repairs +50 durability on your currently equipped Armor Vest.',
    lootId: 'utility_repair_kit',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+50 Vest Dur.' },
    ],
  },
  {
    id: 'armory-utility-kevlar',
    name: 'Kevlar Gear Patch',
    category: 'tools',
    subCategory: 'Tactical',
    rarity: 'Rare',
    priceCredits: 460,
    accentHex: '#38bdf8',
    description: 'Restores +45 durability to both equipped Armor Vest and Helmet.',
    lootId: 'utility_kevlar_plate',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+45 Vest & Helm' },
    ],
  },
  {
    id: 'armory-utility-energy',
    name: 'Tactical Energy Drink',
    category: 'tools',
    subCategory: 'Tactical',
    rarity: 'Common',
    priceCredits: 220,
    accentHex: '#22d3ee',
    description: 'Restores +15 Health & +20 Shield with +12% sprint speed for 8s.',
    lootId: 'utility_energy_drink',
    specs: [
      { labelKey: 'shop.spec.effect', value: '+15 HP / +12% Speed' },
    ],
  },
  {
    id: 'armory-utility-supply',
    name: 'Tactical Supply Pack',
    category: 'tools',
    subCategory: 'Tactical',
    rarity: 'Rare',
    priceCredits: 480,
    accentHex: '#f59e0b',
    description: 'Grants +20 AR, +24 SMG, and +6 Shotgun ammo immediately on use.',
    lootId: 'utility_ammo_pouch',
    specs: [
      { labelKey: 'shop.spec.effect', value: 'Ammo Resupply' },
    ],
  },

  // --- EMOTES & DANCES ---
  ...EMOTE_CATALOG.map(
    (emote): ShopCatalogItem => ({
      id: emote.shopItemId,
      name: emote.name,
      category: 'dances',
      subCategory: `${emote.style[0].toUpperCase()}${emote.style.slice(1)}`,
      rarity: emote.rarity,
      priceCredits: emote.priceCredits,
      accentHex: emote.accentHex,
      description: emote.description,
      defaultOwned: emote.defaultOwned,
      emoteId: emote.id,
      specs: [
        { labelKey: 'shop.spec.style', value: `${emote.style[0].toUpperCase()}${emote.style.slice(1)}` },
        { labelKey: 'shop.spec.duration', value: `${emote.durationSeconds.toFixed(1)}s` },
      ],
    }),
  ),

  // --- GLOO WALL SKINS (STRICTLY COSMETIC: IDENTICAL 500 HP & HITBOX) ---
  ...GLOO_WALL_SKINS.map((skin): ShopCatalogItem => {
    const rarityMap: Record<typeof skin.rarity, ShopCatalogItem['rarity']> = {
      common: 'Common',
      rare: 'Rare',
      epic: 'Epic',
      legendary: 'Legendary',
      mythic: 'Legendary',
    };
    return {
      id: skin.shopId,
      name: skin.name,
      category: 'gloo-walls',
      subCategory: skin.rarity === 'mythic' ? 'Mythic' : skin.subtitle,
      rarity: rarityMap[skin.rarity],
      priceCredits: skin.price,
      accentHex: skin.accentHex,
      description: skin.description,
      defaultOwned: skin.defaultOwned,
      glooSkinId: skin.id,
      specs: [
        { labelKey: 'shop.spec.wallHp', value: '500 HP' },
        { labelKey: 'shop.spec.activeCap', value: '3 Active (∞)' },
        { labelKey: 'shop.spec.fx', value: skin.fxLabel },
      ],
    };
  }),

  // --- INDIVIDUAL CLOTHING ITEMS (SHIRTS, PANTS, SHOES, HATS, GLASSES, MASKS, ACCESSORIES) ---
  {
    id: 'cloth-top-hoodie-urban',
    name: 'URBAN STREET HOODIE',
    category: 'clothing',
    subCategory: 'Shirts',
    rarity: 'Common',
    priceCredits: 0,
    accentHex: '#94a3b8',
    description: 'Standard-issue slate tactical hoodie worn by Nexus recruits.',
    defaultOwned: true,
    customizationPatch: { topId: 'hoodie_urban' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Shirt / Top' }],
  },
  {
    id: 'cloth-top-hoodie-volt',
    name: 'VOLT NEON HOODIE',
    category: 'clothing',
    subCategory: 'Shirts',
    rarity: 'Rare',
    priceCredits: 320,
    accentHex: '#a3e635',
    description: 'Electric lime-accented tactical pullover hoodie built for street drops.',
    customizationPatch: { topId: 'hoodie_volt' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Shirt / Top' }],
  },
  {
    id: 'cloth-top-jacket-cyber',
    name: 'CYBER CIRCUIT JACKET',
    category: 'clothing',
    subCategory: 'Shirts',
    rarity: 'Epic',
    priceCredits: 460,
    accentHex: '#22d3ee',
    description: 'Armored neon-cyan collar moto jacket engineered for night raids.',
    customizationPatch: { topId: 'jacket_cyber' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Shirt / Top' }],
  },
  {
    id: 'cloth-top-varsity-crimson',
    name: 'CRIMSON VARSITY JACKET',
    category: 'clothing',
    subCategory: 'Shirts',
    rarity: 'Rare',
    priceCredits: 420,
    accentHex: '#ef4444',
    description: 'Scarlet & ivory heavyweight letterman jacket with contrast sleeves.',
    customizationPatch: { topId: 'varsity_crimson' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Shirt / Top' }],
  },
  {
    id: 'cloth-top-bomber-gold',
    name: 'APEX GOLD BOMBER',
    category: 'clothing',
    subCategory: 'Shirts',
    rarity: 'Legendary',
    priceCredits: 580,
    accentHex: '#facc15',
    description: 'Championship black & 24K gold flight bomber jacket.',
    customizationPatch: { topId: 'bomber_gold' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Shirt / Top' }],
  },
  {
    id: 'cloth-top-parka-plasma',
    name: 'PLASMA STORM PARKA',
    category: 'clothing',
    subCategory: 'Shirts',
    rarity: 'Epic',
    priceCredits: 640,
    accentHex: '#c084fc',
    description: 'Insulated high-collar expedition parka pulsing with violet plasma trim.',
    customizationPatch: { topId: 'parka_plasma' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Shirt / Top' }],
  },
  {
    id: 'cloth-top-jacket-arctic',
    name: 'ARCTIC FUR JACKET',
    category: 'clothing',
    subCategory: 'Shirts',
    rarity: 'Epic',
    priceCredits: 490,
    accentHex: '#7dd3fc',
    description: 'Glacier-trimmed winter combat jacket for sub-zero operations.',
    customizationPatch: { topId: 'jacket_arctic' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Shirt / Top' }],
  },
  {
    id: 'cloth-pants-cargo-charcoal',
    name: 'CHARCOAL CARGOS',
    category: 'clothing',
    subCategory: 'Pants',
    rarity: 'Common',
    priceCredits: 0,
    accentHex: '#64748b',
    description: 'Standard charcoal tactical utility cargos with belt rig.',
    defaultOwned: true,
    customizationPatch: { pantsId: 'cargo_charcoal' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Pants' }],
  },
  {
    id: 'cloth-pants-cargo-olive',
    name: 'OLIVE TACTICAL CARGOS',
    category: 'clothing',
    subCategory: 'Pants',
    rarity: 'Rare',
    priceCredits: 280,
    accentHex: '#84cc16',
    description: 'Military olive cargo trousers with reinforced knee webbing.',
    customizationPatch: { pantsId: 'cargo_olive' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Pants' }],
  },
  {
    id: 'cloth-pants-jeans-acid',
    name: 'SKY VINTAGE DENIM',
    category: 'clothing',
    subCategory: 'Pants',
    rarity: 'Rare',
    priceCredits: 340,
    accentHex: '#60a5fa',
    description: 'Washed sky-blue streetwear jeans with amber seam stitching.',
    customizationPatch: { pantsId: 'jeans_acid' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Pants' }],
  },
  {
    id: 'cloth-pants-joggers-crimson',
    name: 'CRIMSON TRACK JOGGERS',
    category: 'clothing',
    subCategory: 'Pants',
    rarity: 'Epic',
    priceCredits: 390,
    accentHex: '#ef4444',
    description: 'Tapered dark athletic track pants with scarlet side stripes.',
    customizationPatch: { pantsId: 'joggers_crimson' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Pants' }],
  },
  {
    id: 'cloth-pants-joggers-onyx',
    name: 'VOLT RUNNER JOGGERS',
    category: 'clothing',
    subCategory: 'Pants',
    rarity: 'Epic',
    priceCredits: 420,
    accentHex: '#a3e635',
    description: 'Sleek onyx tech-fleece joggers accented with neon volt cuffs.',
    customizationPatch: { pantsId: 'joggers_onyx' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Pants' }],
  },
  {
    id: 'cloth-pants-tactical-snow',
    name: 'ARCTIC RECON CARGOS',
    category: 'clothing',
    subCategory: 'Pants',
    rarity: 'Epic',
    priceCredits: 460,
    accentHex: '#bae6fd',
    description: 'Polar snow-camo combat trousers engineered for alpine drops.',
    customizationPatch: { pantsId: 'tactical_snow' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Pants' }],
  },
  {
    id: 'cloth-shoes-sneakers-white',
    name: 'CLEAN COURT KICKS',
    category: 'clothing',
    subCategory: 'Shoes',
    rarity: 'Common',
    priceCredits: 0,
    accentHex: '#e2e8f0',
    description: 'Standard crisp white low-top street sneakers.',
    defaultOwned: true,
    customizationPatch: { shoesId: 'sneakers_white' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Footwear' }],
  },
  {
    id: 'cloth-shoes-hightops-cyan',
    name: 'SKY HIGH-TOPS',
    category: 'clothing',
    subCategory: 'Shoes',
    rarity: 'Rare',
    priceCredits: 300,
    accentHex: '#0ea5e9',
    description: 'Padded-collar high-top street sneakers with cyan panels.',
    customizationPatch: { shoesId: 'hightops_cyan' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Footwear' }],
  },
  {
    id: 'cloth-shoes-sneakers-gold',
    name: 'SOLARIS COURT LOWS',
    category: 'clothing',
    subCategory: 'Shoes',
    rarity: 'Epic',
    priceCredits: 380,
    accentHex: '#f59e0b',
    description: 'Onyx court runners accented with championship gold trim.',
    customizationPatch: { shoesId: 'sneakers_gold' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Footwear' }],
  },
  {
    id: 'cloth-shoes-hightops-violet',
    name: 'PLASMA HIGH-TOPS',
    category: 'clothing',
    subCategory: 'Shoes',
    rarity: 'Epic',
    priceCredits: 440,
    accentHex: '#a855f7',
    description: 'Indigo & orchid cyber high-tops engineered for urban parkour.',
    customizationPatch: { shoesId: 'hightops_violet' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Footwear' }],
  },
  {
    id: 'cloth-shoes-boots-obsidian',
    name: 'APEX RANGER BOOTS',
    category: 'clothing',
    subCategory: 'Shoes',
    rarity: 'Legendary',
    priceCredits: 480,
    accentHex: '#f97316',
    description: 'Armored matte-slate tactical boots with hazard-orange heel plates.',
    customizationPatch: { shoesId: 'boots_obsidian' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Footwear' }],
  },
  {
    id: 'cloth-hat-baseball-cap',
    name: 'STREET BASEBALL CAP',
    category: 'clothing',
    subCategory: 'Hats',
    rarity: 'Rare',
    priceCredits: 240,
    accentHex: '#38bdf8',
    description: 'Structured curved-brim street cap with front Nexus patch.',
    customizationPatch: { hatId: 'baseball_cap' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Headgear' }],
  },
  {
    id: 'cloth-hat-backwards-cap',
    name: 'CRIMSON SNAPBACK',
    category: 'clothing',
    subCategory: 'Hats',
    rarity: 'Rare',
    priceCredits: 280,
    accentHex: '#ef4444',
    description: 'Backwards flat-brim crimson snapback cap.',
    customizationPatch: { hatId: 'backwards_cap' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Headgear' }],
  },
  {
    id: 'cloth-hat-beanie',
    name: 'RIBBED KNIT BEANIE',
    category: 'clothing',
    subCategory: 'Hats',
    rarity: 'Rare',
    priceCredits: 260,
    accentHex: '#fbbf24',
    description: 'Warm amber cuffed knit beanie for cold-sector missions.',
    customizationPatch: { hatId: 'beanie' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Headgear' }],
  },
  {
    id: 'cloth-hat-tactical-cap',
    name: 'OPERATOR MORALE CAP',
    category: 'clothing',
    subCategory: 'Hats',
    rarity: 'Epic',
    priceCredits: 350,
    accentHex: '#f97316',
    description: 'Matte tactical operator cap with hazard-orange emblem.',
    customizationPatch: { hatId: 'tactical_cap' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Headgear' }],
  },
  {
    id: 'cloth-glasses-wayfarers',
    name: 'STEALTH STREET SHADES',
    category: 'clothing',
    subCategory: 'Glasses',
    rarity: 'Rare',
    priceCredits: 260,
    accentHex: '#38bdf8',
    description: 'Dark square-frame sunglasses with cool sky reflection.',
    customizationPatch: { glassesId: 'wayfarers' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Eyewear' }],
  },
  {
    id: 'cloth-glasses-aviators',
    name: 'GOLD AVIATOR SHADES',
    category: 'clothing',
    subCategory: 'Glasses',
    rarity: 'Rare',
    priceCredits: 310,
    accentHex: '#fbbf24',
    description: 'Classic metallic gold-rimmed pilot sunglasses.',
    customizationPatch: { glassesId: 'aviators' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Eyewear' }],
  },
  {
    id: 'cloth-glasses-cyber-visor',
    name: 'NEON CYBER VISOR',
    category: 'clothing',
    subCategory: 'Glasses',
    rarity: 'Epic',
    priceCredits: 520,
    accentHex: '#22d3ee',
    description: 'Wrap-around translucent glowing cyan HUD visor.',
    customizationPatch: { glassesId: 'cyber_visor' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Eyewear' }],
  },
  {
    id: 'cloth-mask-cloth',
    name: 'STREET FACE MASK',
    category: 'clothing',
    subCategory: 'Masks',
    rarity: 'Rare',
    priceCredits: 290,
    accentHex: '#f97316',
    description: 'Contoured obsidian cloth mask with orange seam detail.',
    customizationPatch: { maskId: 'cloth_mask' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Face Mask' }],
  },
  {
    id: 'cloth-mask-respirator',
    name: 'TACTICAL RESPIRATOR',
    category: 'clothing',
    subCategory: 'Masks',
    rarity: 'Epic',
    priceCredits: 480,
    accentHex: '#38bdf8',
    description: 'Dual-filter ballistic half-respirator built for chemical zones.',
    customizationPatch: { maskId: 'respirator' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Face Mask' }],
  },
  {
    id: 'cloth-mask-gaiter',
    name: 'CRIMSON NECK GAITER',
    category: 'clothing',
    subCategory: 'Masks',
    rarity: 'Rare',
    priceCredits: 340,
    accentHex: '#ef4444',
    description: 'Pull-up scarlet combat gaiter covering lower face & neck.',
    customizationPatch: { maskId: 'gaiter_scarf' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Face Mask' }],
  },
  {
    id: 'cloth-acc-backpack',
    name: 'STREET RUCKSACK',
    category: 'clothing',
    subCategory: 'Accessories',
    rarity: 'Rare',
    priceCredits: 360,
    accentHex: '#f97316',
    description: 'Sleek twin-strap tactical backpack mounted cleanly on your operator.',
    customizationPatch: { accessoryId: 'backpack' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Accessory' }],
  },
  {
    id: 'cloth-acc-headphones',
    name: 'STUDIO HEADPHONES',
    category: 'clothing',
    subCategory: 'Accessories',
    rarity: 'Rare',
    priceCredits: 410,
    accentHex: '#38bdf8',
    description: 'Wireless acoustic comms headset with glowing cyan earcups.',
    customizationPatch: { accessoryId: 'headphones' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Accessory' }],
  },
  {
    id: 'cloth-acc-crown',
    name: 'HOLO CROWN VISOR',
    category: 'clothing',
    subCategory: 'Accessories',
    rarity: 'Legendary',
    priceCredits: 690,
    accentHex: '#2dd4bf',
    description: 'Holographic orbital brow crown reserved for elite squad leaders.',
    customizationPatch: { accessoryId: 'crown' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Accessory' }],
  },
  {
    id: 'cloth-acc-cape',
    name: 'STEALTH CRIMSON CAPE',
    category: 'clothing',
    subCategory: 'Accessories',
    rarity: 'Legendary',
    priceCredits: 740,
    accentHex: '#ef4444',
    description: 'Flowing scarlet shoulder cape draped behind your combat armor.',
    customizationPatch: { accessoryId: 'cape' },
    specs: [{ labelKey: 'shop.spec.effect', value: 'Accessory' }],
  },

  // --- WEAPON SKINS ---
  ...WEAPON_SKIN_CATALOG.map((skin): ShopCatalogItem => {
    const wep = WEAPON_BY_ID[skin.weaponId];
    const catLabel = wep
      ? wep.type === 'AR'
        ? 'Rifles'
        : wep.type === 'LMG'
          ? 'LMGs'
          : wep.type === 'SNIPER'
            ? 'Snipers'
            : wep.type === 'SMG'
              ? 'SMGs'
              : wep.type === 'SHOTGUN'
                ? 'Shotguns'
                : wep.type === 'PISTOL'
                  ? 'Pistols'
                  : 'Melee'
      : 'Rifles';
    return {
      id: skin.shopItemId,
      name: skin.name,
      category: 'weapon-skins',
      subCategory: catLabel,
      rarity: skin.rarity,
      priceCredits: skin.priceCredits,
      accentHex: skin.accentHex,
      description: skin.description,
      weaponId: skin.weaponId,
      weaponSkinId: skin.id,
      specs: [
        { labelKey: 'shop.spec.weapon', value: wep?.name ?? skin.weaponId.toUpperCase() },
        { labelKey: 'shop.spec.fx', value: 'Custom Finish' },
      ],
    };
  }),

  // --- PROFILE AVATARS ---
  ...AVATAR_CATALOG.map(
    (av): ShopCatalogItem => ({
      id: av.shopItemId,
      name: av.name,
      category: 'avatars',
      subCategory: 'Avatars',
      rarity: av.rarity,
      priceCredits: av.priceCredits,
      accentHex: av.accentHex,
      description: av.description,
      defaultOwned: av.defaultOwned,
      avatarId: av.id,
      imageUrl: av.imageUrl,
      specs: [{ labelKey: 'shop.spec.effect', value: 'Profile Avatar' }],
    }),
  ),

  // --- PROFILE BANNERS ---
  ...BANNER_CATALOG.map(
    (bn): ShopCatalogItem => ({
      id: bn.shopItemId,
      name: bn.name,
      category: 'banners',
      subCategory: 'Banners',
      rarity: bn.rarity,
      priceCredits: bn.priceCredits,
      accentHex: bn.accentHex,
      description: bn.description,
      defaultOwned: bn.defaultOwned,
      bannerId: bn.id,
      imageUrl: bn.imageUrl,
      specs: [{ labelKey: 'shop.spec.effect', value: 'Profile Banner' }],
    }),
  ),
] as const;
