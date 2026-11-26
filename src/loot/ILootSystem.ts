export type LootRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type LootCategory =
  | 'weapon'
  | 'ammo'
  | 'armor'
  | 'helmet'
  | 'backpack'
  | 'scope'
  | 'shield'
  | 'health'
  | 'special'
  | 'utility';

export type AmmoType = 'AR' | 'SMG' | 'SHOTGUN' | 'SNIPER' | 'PISTOL';

export type SpecialItemEffect =
  | 'adrenaline_surge'
  | 'recon_uplink'
  | 'armor_repair'
  | 'helmet_repair'
  | 'ammo_pouch'
  | 'energy_boost'
  | 'gloo_wall';

export interface LootItemDefinition {
  id: string;
  name: string;
  category: LootCategory;
  rarity: LootRarity;
  description: string;
  stackable: boolean;
  maxStack: number;
  spawnWeight: number;
  accentHex: string;
  iconTag: string;
  weaponId?: string;
  ammoType?: AmmoType;
  ammoAmount?: number;
  armorLevel?: number;
  armorMaxDurability?: number;
  armorReductionPct?: number;
  helmetLevel?: number;
  helmetMaxDurability?: number;
  helmetReductionPct?: number;
  backpackLevel?: number;
  backpackBonusSlots?: number;
  scopeLevel?: 2 | 4 | 6 | 8;
  healAmount?: number;
  shieldAmount?: number;
  durationSec?: number;
  useDurationSec?: number;
  specialEffect?: SpecialItemEffect;
}

export interface LootSpawnNode {
  id: string;
  x: number;
  y: number;
  z: number;
  rarity: LootRarity;
  itemId: string;
}

export interface ILootSystem {
  spawnInitialLoot(seed: number): void;
  collectNode(nodeId: string, collectorId: string): boolean;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  dispose(): void;
}
