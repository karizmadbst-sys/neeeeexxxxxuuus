import type { AmmoType, LootItemDefinition } from '../loot/ILootSystem';
import type {
  WeaponDefinition,
  WeaponInventoryGroup,
  WeaponSlotIndex,
} from '../weapons/WeaponData';

export type LoadoutSlotType = 'primary' | 'secondary' | 'sidearm' | 'tactical' | 'armor';

export type InventorySlotKind =
  | 'weapon1'
  | 'weapon2'
  | 'weapon3'
  | 'weapon4'
  | 'healing'
  | 'ammo'
  | 'armor'
  | 'helmet'
  | 'backpack'
  | 'scope'
  | 'special';

export type AmmoPool = Record<AmmoType, number>;

export interface InventoryItem {
  instanceId: string;
  itemId: string;
  quantity: number;
  slot?: LoadoutSlotType;
}

export interface InventoryEntry {
  instanceId: string;
  definition: LootItemDefinition;
  quantity: number;
  durability?: number;
  maxDurability?: number;
  weaponMagAmmo?: number;
}

export interface ActiveItemBuffs {
  adrenalineRemainingSec: number;
  reconRemainingSec: number;
}

export interface ActiveHealingState {
  active: boolean;
  itemId: string;
  itemName: string;
  kind: 'bandage' | 'medkit' | 'shield' | 'syringe' | 'drink';
  durationSec: number;
  elapsedSec: number;
  remainingSec: number;
  progress: number;
  totalHealAmount: number;
  totalShieldAmount: number;
}

export interface WeaponReplacementCandidate {
  slotIndex: WeaponSlotIndex;
  entry: InventoryEntry;
}

export interface WeaponReplacementPrompt {
  lootInstanceId: string;
  incomingLootDef: LootItemDefinition;
  incomingWeaponDef: WeaponDefinition;
  incomingMagAmmo: number;
  group: WeaponInventoryGroup;
  candidates: readonly WeaponReplacementCandidate[];
  lootPosX: number;
  lootPosZ: number;
}

export interface InventorySnapshot {
  weaponSlot1: InventoryEntry | null; // Large Weapon 1
  weaponSlot2: InventoryEntry | null; // Large Weapon 2
  weaponSlot3: InventoryEntry | null; // Small Firearm (Pistol)
  weaponSlot4: InventoryEntry | null; // Melee Weapon
  activeWeaponSlotIndex: number; // 0, 1, 2, 3, or -1 if unarmed
  holsteredWeapons: readonly InventoryEntry[];
  healingSlot: InventoryEntry | null;
  healingReserve: readonly InventoryEntry[];
  ammo: AmmoPool;
  armorSlot: InventoryEntry | null;
  armorReserve: readonly InventoryEntry[];
  helmetSlot: InventoryEntry | null;
  helmetReserve: readonly InventoryEntry[];
  backpackSlot: InventoryEntry | null;
  backpackReserve: readonly InventoryEntry[];
  scopeSlot: InventoryEntry | null;
  scopeReserve: readonly InventoryEntry[];
  specialSlot: InventoryEntry | null;
  specialReserve: readonly InventoryEntry[];
  bagUsed: number;
  bagCapacity: number;
  totalArmorReductionPct: number;
  activeBuffs: ActiveItemBuffs;
  activeHealing: ActiveHealingState | null;
  unlimitedAmmo?: boolean;
  glooWalls: number;
  maxGlooWalls: number;
}

export interface IInventorySystem {
  getItems(): readonly InventoryItem[];
  addItem(item: InventoryItem): boolean;
  removeItem(instanceId: string, quantity?: number): boolean;
  clear(): void;
}
