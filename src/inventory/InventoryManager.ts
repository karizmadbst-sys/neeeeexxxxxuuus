import type * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { AbilityModifiers } from '../characters/CharacterAbility';
import type { Subsystem } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import type { AmmoType, LootItemDefinition } from '../loot/ILootSystem';
import { getLootDefinition } from '../loot/LootData';
import type { LootManager } from '../loot/LootManager';
import type { Player } from '../player/Player';
import {
  getAllowedSlotsForWeaponGroup,
  getWeaponInventoryGroup,
  WEAPON_BY_ID,
  WEAPON_SLOT_COUNT,
  type WeaponCategory,
  type WeaponDefinition,
  type WeaponSlotIndex,
} from '../weapons/WeaponData';
import type { WeaponManager } from '../weapons/WeaponManager';
import { GLOO_WALL_CONFIG } from '../combat/GlooWallManager';
import type {
  ActiveHealingState,
  ActiveItemBuffs,
  AmmoPool,
  IInventorySystem,
  InventoryEntry,
  InventoryItem,
  InventorySnapshot,
  WeaponReplacementPrompt,
} from './IInventorySystem';
import { InventorySlot } from './InventorySlot';

export interface ActionOutcome {
  success: boolean;
  message?: string;
  weaponReplacePrompt?: WeaponReplacementPrompt;
}

const BASE_BAG_CAPACITY = 8;

function toAmmoType(cat: WeaponCategory): AmmoType {
  if (cat === 'SMG') return 'SMG';
  if (cat === 'SHOTGUN') return 'SHOTGUN';
  if (cat === 'SNIPER') return 'SNIPER';
  if (cat === 'PISTOL') return 'PISTOL';
  if (cat === 'AR' || cat === 'LMG') return 'AR';
  return 'AR';
}

export class InventoryManager implements Subsystem, IInventorySystem {
  // Free Fire style 4-slot weapon inventory:
  // [0] Large Weapon 1, [1] Large Weapon 2, [2] Small Firearm (Pistol), [3] Melee Weapon
  private readonly weaponSlots: [InventorySlot, InventorySlot, InventorySlot, InventorySlot] = [
    new InventorySlot('weapon1', 'Large Weapon 1'),
    new InventorySlot('weapon2', 'Large Weapon 2'),
    new InventorySlot('weapon3', 'Small Firearm (Pistol)'),
    new InventorySlot('weapon4', 'Melee Weapon'),
  ];
  private readonly healingSlot = new InventorySlot('healing', 'Healing Slot');
  private readonly armorSlot = new InventorySlot('armor', 'Armor Slot');
  private readonly helmetSlot = new InventorySlot('helmet', 'Helmet Slot');
  private readonly backpackSlot = new InventorySlot('backpack', 'Backpack Slot');
  private readonly scopeSlot = new InventorySlot('scope', 'Optic Scope Slot');
  private readonly specialSlot = new InventorySlot('special', 'Special Slot');

  private activeWeaponSlotIndex: number = 0;
  private lastActiveWeaponSlotIndex: WeaponSlotIndex = 0;
  private holsteredWeapons: InventoryEntry[] = [];
  private healingReserve: InventoryEntry[] = [];
  private armorReserve: InventoryEntry[] = [];
  private helmetReserve: InventoryEntry[] = [];
  private backpackReserve: InventoryEntry[] = [];
  private scopeReserve: InventoryEntry[] = [];
  private specialReserve: InventoryEntry[] = [];

  private readonly ammoPool: AmmoPool = {
    AR: 60,
    SMG: 60,
    SHOTGUN: 12,
    SNIPER: 10,
    PISTOL: 24,
  };

  private readonly activeBuffs: ActiveItemBuffs = {
    adrenalineRemainingSec: 0,
    reconRemainingSec: 0,
  };

  private boundPlayer: Player | null = null;
  private boundWeaponManager: WeaponManager | null = null;
  private boundLootManager: LootManager | null = null;
  private unlimitedAmmo = false;
  private glooWalls = GLOO_WALL_CONFIG.maxActivePerPlayer;
  private readonly maxGlooWalls = GLOO_WALL_CONFIG.maxActivePerPlayer;
  private nextInstanceSeq = 1;
  private onlineHooks: {
    onCollectLoot?: (lootId: string, itemId?: string) => void;
    onDropLoot?: (itemId: string, x: number, y: number, z: number, quantity: number, meta: { weaponAmmoInMag?: number; armorDurability?: number }) => void;
    onUseConsumable?: (itemId: string) => void;
  } | null = null;
  private onGearChangedCallback?: () => void;
  private onHealingInterruptedCallback?: (reason: string) => void;
  private onHealingCompletedCallback?: (def: LootItemDefinition) => void;

  private activeHeal: {
    def: LootItemDefinition;
    kind: 'bandage' | 'medkit' | 'shield' | 'syringe' | 'drink';
    durationSec: number;
    elapsedSec: number;
    targetHeal: number;
    appliedHeal: number;
    targetShield: number;
    appliedShield: number;
    tickAccum: number;
    lastObservedHealth: number;
    lastObservedShield: number;
  } | null = null;

  constructor(private readonly audioManager: AudioManager) {}

  setOnGearChangedCallback(cb?: () => void): void {
    this.onGearChangedCallback = cb;
  }

  setHealingCallbacks(
    onInterrupted?: (reason: string) => void,
    onCompleted?: (def: LootItemDefinition) => void,
  ): void {
    this.onHealingInterruptedCallback = onInterrupted;
    this.onHealingCompletedCallback = onCompleted;
  }

  isHealing(): boolean {
    return this.activeHeal !== null;
  }

  interruptHealing(reason?: string): boolean {
    if (!this.activeHeal) return false;
    this.activeHeal = null;
    this.boundPlayer?.setHealingVisualState(null);
    this.audioManager.playHealInterrupt();
    this.onHealingInterruptedCallback?.(reason ?? i18n.t('inv.msg.healingInterrupted'));
    return true;
  }

  private resolveHealKind(
    def: LootItemDefinition,
  ): 'bandage' | 'medkit' | 'shield' | 'syringe' | 'drink' {
    if (def.category === 'shield') return 'shield';
    if (def.specialEffect === 'adrenaline_surge') return 'syringe';
    if (def.specialEffect === 'energy_boost') return 'drink';
    if (def.id === 'med_kit') return 'medkit';
    return 'bandage';
  }

  setOnlineSyncHooks(
    hooks: {
      onCollectLoot?: (lootId: string, itemId?: string) => void;
      onDropLoot?: (itemId: string, x: number, y: number, z: number, quantity: number, meta: { weaponAmmoInMag?: number; armorDurability?: number }) => void;
      onUseConsumable?: (itemId: string) => void;
    } | null,
  ): void {
    this.onlineHooks = hooks;
  }

  getGlooWalls(): number {
    return this.glooWalls;
  }

  getMaxGlooWalls(): number {
    return this.maxGlooWalls;
  }

  setGlooWalls(count: number): void {
    const next = Math.max(0, Math.min(this.maxGlooWalls, Math.round(count)));
    if (next === this.glooWalls) return;
    this.glooWalls = next;
    this.onGearChangedCallback?.();
  }

  addGlooWalls(amount: number): number {
    const add = Math.max(0, Math.min(this.maxGlooWalls - this.glooWalls, Math.round(amount)));
    if (add > 0) {
      this.glooWalls += add;
      this.onGearChangedCallback?.();
    }
    return add;
  }

  consumeGlooWall(): boolean {
    // Gloo Walls are unlimited to deploy (max 3 active per player enforced by GlooWallManager/server)
    return true;
  }

  setUnlimitedAmmo(enabled: boolean): void {
    this.unlimitedAmmo = enabled;
    if (enabled) {
      this.topUpWeaponSlotMags();
      this.syncWeaponsToManager();
    }
  }

  isUnlimitedAmmo(): boolean {
    return this.unlimitedAmmo;
  }

  private topUpWeaponSlotMags(): void {
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      const entry = this.weaponSlots[i].getEntry();
      if (!entry?.definition.weaponId) continue;
      const weaponDef = this.resolveWeaponDef(entry.definition.weaponId);
      if (weaponDef && weaponDef.type !== 'MELEE' && weaponDef.magazineSize > 0) {
        entry.weaponMagAmmo = weaponDef.magazineSize;
      }
    }
  }

  private resolveWeaponDef(weaponId: string | undefined): WeaponDefinition | undefined {
    if (!weaponId) return undefined;
    return this.boundWeaponManager?.getWeaponDefinition(weaponId) ?? WEAPON_BY_ID[weaponId];
  }

  bindSubsystems(
    player: Player,
    weaponManager: WeaponManager,
    lootManager: LootManager,
  ): void {
    this.boundPlayer = player;
    this.boundWeaponManager = weaponManager;
    this.boundLootManager = lootManager;

    this.boundWeaponManager.setAmmoSupplyProvider({
      getAmmo: (type) => this.ammoPool[toAmmoType(type)] ?? 0,
      consumeAmmo: (type, requested) => {
        if (this.unlimitedAmmo) return Math.max(0, requested);
        const key = toAmmoType(type);
        const take = Math.min(this.ammoPool[key], Math.max(0, requested));
        this.ammoPool[key] -= take;
        return take;
      },
    });
  }

  getBagCapacity(): number {
    const bonus = this.backpackSlot.getEntry()?.definition.backpackBonusSlots ?? 0;
    return BASE_BAG_CAPACITY + bonus;
  }

  getBagUsed(): number {
    return (
      this.holsteredWeapons.length +
      this.healingReserve.length +
      this.armorReserve.length +
      this.helmetReserve.length +
      this.backpackReserve.length +
      this.scopeReserve.length +
      this.specialReserve.length
    );
  }

  getEquippedScopeLevel(): 0 | 2 | 4 | 6 | 8 {
    return this.scopeSlot.getEntry()?.definition.scopeLevel ?? 0;
  }

  private hasBagSpace(neededSlots = 1): boolean {
    return this.getBagUsed() + neededSlots <= this.getBagCapacity();
  }

  getTotalProtectionPct(): number {
    const armorEntry = this.armorSlot.getEntry();
    const helmetEntry = this.helmetSlot.getEntry();
    const armorPct =
      armorEntry && (armorEntry.durability ?? 1) > 0
        ? armorEntry.definition.armorReductionPct ?? 0
        : 0;
    const helmetPct =
      helmetEntry && (helmetEntry.durability ?? 1) > 0
        ? helmetEntry.definition.helmetReductionPct ?? 0
        : 0;
    return Math.min(55, armorPct + helmetPct);
  }

  resetStarterLoadout(starterGlooWalls = GLOO_WALL_CONFIG.maxActivePerPlayer): void {
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      this.weaponSlots[i].clear();
    }
    this.healingSlot.clear();
    this.armorSlot.clear();
    this.helmetSlot.clear();
    this.backpackSlot.clear();
    this.scopeSlot.clear();
    this.specialSlot.clear();
    this.holsteredWeapons = [];
    this.healingReserve = [];
    this.armorReserve = [];
    this.helmetReserve = [];
    this.backpackReserve = [];
    this.scopeReserve = [];
    this.specialReserve = [];

    this.ammoPool.AR = 60;
    this.ammoPool.SMG = 48;
    this.ammoPool.SHOTGUN = 10;
    this.ammoPool.SNIPER = 10;
    this.ammoPool.PISTOL = 24;

    this.glooWalls = Math.max(
      GLOO_WALL_CONFIG.maxActivePerPlayer,
      Math.min(this.maxGlooWalls, Math.round(starterGlooWalls)),
    );
    this.activeBuffs.adrenalineRemainingSec = 0;
    this.activeBuffs.reconRemainingSec = 0;
    this.activeHeal = null;
    this.boundPlayer?.setHealingVisualState(null);

    const starterRifle = getLootDefinition('weapon_scar');
    if (starterRifle) {
      const starterMag = this.unlimitedAmmo ? 30 : 24;
      this.weaponSlots[0].setEntry(this.createEntry(starterRifle, 1, { weaponMagAmmo: starterMag }));
    }
    const starterBandage = getLootDefinition('med_bandage');
    if (starterBandage) {
      this.healingSlot.setEntry(this.createEntry(starterBandage, 2));
    }

    this.activeWeaponSlotIndex = 0;
    this.lastActiveWeaponSlotIndex = 0;
    this.syncWeaponsToManager();
    this.syncGearStatsAndVisuals();
  }

  fillTrainingAmmo(): void {
    this.ammoPool.AR = Math.max(this.ammoPool.AR, 240);
    this.ammoPool.SMG = Math.max(this.ammoPool.SMG, 240);
    this.ammoPool.SHOTGUN = Math.max(this.ammoPool.SHOTGUN, 60);
    this.ammoPool.SNIPER = Math.max(this.ammoPool.SNIPER, 60);
    this.ammoPool.PISTOL = Math.max(this.ammoPool.PISTOL, 120);
    this.syncWeaponsToManager();
  }

  private createEntry(
    def: LootItemDefinition,
    quantity = 1,
    extra: Partial<InventoryEntry> = {},
  ): InventoryEntry {
    const maxDur = def.armorMaxDurability ?? def.helmetMaxDurability;
    return {
      instanceId: `inv-${this.nextInstanceSeq++}`,
      definition: def,
      quantity,
      durability: maxDur,
      maxDurability: maxDur,
      ...extra,
    };
  }

  // --- IInventorySystem Legacy Compatibility ---
  getItems(): readonly InventoryItem[] {
    const list: InventoryItem[] = [];
    for (const s of [
      this.weaponSlots[0],
      this.weaponSlots[1],
      this.weaponSlots[2],
      this.weaponSlots[3],
      this.healingSlot,
      this.armorSlot,
      this.helmetSlot,
      this.backpackSlot,
      this.scopeSlot,
      this.specialSlot,
    ]) {
      const e = s.getEntry();
      if (e) {
        list.push({ instanceId: e.instanceId, itemId: e.definition.id, quantity: e.quantity });
      }
    }
    return list;
  }

  addItem(item: InventoryItem): boolean {
    const def = getLootDefinition(item.itemId);
    if (!def) return false;
    return this.pickupDefinition(def, item.quantity).success;
  }

  removeItem(instanceId: string, quantity = 1): boolean {
    const idx = this.healingReserve.findIndex((e) => e.instanceId === instanceId);
    if (idx !== -1) {
      const entry = this.healingReserve[idx];
      entry.quantity -= quantity;
      if (entry.quantity <= 0) this.healingReserve.splice(idx, 1);
      return true;
    }
    return false;
  }

  clear(): void {
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      this.weaponSlots[i].clear();
    }
    this.healingSlot.clear();
    this.armorSlot.clear();
    this.helmetSlot.clear();
    this.backpackSlot.clear();
    this.scopeSlot.clear();
    this.specialSlot.clear();
    this.holsteredWeapons = [];
    this.healingReserve = [];
    this.armorReserve = [];
    this.helmetReserve = [];
    this.backpackReserve = [];
    this.scopeReserve = [];
    this.specialReserve = [];
    this.glooWalls = GLOO_WALL_CONFIG.maxActivePerPlayer;
    this.activeHeal = null;
    this.boundPlayer?.setHealingVisualState(null);
    this.syncGearStatsAndVisuals();
  }

  // --- World Loot Pickup (triggered via INTERACT button) ---
  pickupNearestLoot(playerPos: THREE.Vector3): ActionOutcome {
    if (!this.boundLootManager) {
      return { success: false };
    }
    const nearest = this.boundLootManager.getNearestLoot(playerPos);
    if (!nearest) {
      return { success: false, message: i18n.t('inv.msg.noNearbyLoot') };
    }

    this.captureActiveWeaponMagAmmo();

    // Free Fire style category check for world weapon pickups:
    // Max 2 Large Weapons (slots 0, 1), Max 1 Pistol (slot 2), Max 1 Melee (slot 3).
    // If all slots for that weapon's category are full, require the player to choose a weapon to replace.
    if (nearest.definition.category === 'weapon') {
      const weaponDef = this.resolveWeaponDef(nearest.definition.weaponId);
      if (!weaponDef) {
        return { success: false };
      }
      const group = getWeaponInventoryGroup(weaponDef.type);
      const allowedSlots = getAllowedSlotsForWeaponGroup(group);
      const fullMag = weaponDef.magazineSize;
      const incomingMag = this.unlimitedAmmo
        ? fullMag
        : (nearest.metadata.weaponAmmoInMag ?? fullMag);

      let emptySlot: WeaponSlotIndex | null = null;
      for (let i = 0; i < allowedSlots.length; i++) {
        const sIdx = allowedSlots[i];
        if (this.weaponSlots[sIdx].isEmpty()) {
          emptySlot = sIdx;
          break;
        }
      }

      if (emptySlot === null) {
        const candidates = allowedSlots
          .map((slotIndex) => {
            const entry = this.weaponSlots[slotIndex].getEntry();
            return entry ? { slotIndex, entry } : null;
          })
          .filter((c): c is { slotIndex: WeaponSlotIndex; entry: InventoryEntry } => c !== null);

        return {
          success: false,
          weaponReplacePrompt: {
            lootInstanceId: nearest.instanceId,
            incomingLootDef: nearest.definition,
            incomingWeaponDef: weaponDef,
            incomingMagAmmo: incomingMag,
            group,
            candidates,
            lootPosX: nearest.root.position.x,
            lootPosZ: nearest.root.position.z,
          },
        };
      }

      const entry = this.createEntry(nearest.definition, 1, { weaponMagAmmo: incomingMag });
      this.weaponSlots[emptySlot].setEntry(entry);
      this.activeWeaponSlotIndex = emptySlot;
      this.lastActiveWeaponSlotIndex = emptySlot;
      this.syncWeaponsToManager();
      this.boundLootManager.collectNode(nearest.instanceId, 'local-player');
      this.onlineHooks?.onCollectLoot?.(nearest.instanceId, nearest.definition.id);
      this.audioManager.playPickup();
      const itemName = i18n.translateLootName(nearest.definition.id, nearest.definition.name);
      return { success: true, message: i18n.t('inv.msg.equippedItem', { item: itemName }) };
    }

    const outcome = this.pickupDefinition(nearest.definition, nearest.quantity, {
      durability: nearest.metadata.armorDurability,
      weaponMagAmmo: nearest.metadata.weaponAmmoInMag,
    });

    if (outcome.success) {
      this.boundLootManager.collectNode(nearest.instanceId, 'local-player');
      this.onlineHooks?.onCollectLoot?.(nearest.instanceId, nearest.definition.id);
      this.audioManager.playPickup();
    }
    return outcome;
  }

  confirmWeaponReplacement(lootInstanceId: string, replaceSlotIndex: WeaponSlotIndex): ActionOutcome {
    if (!this.boundLootManager) {
      return { success: false };
    }
    const lootItem = this.boundLootManager.getLootItemById(lootInstanceId);
    if (!lootItem || lootItem.definition.category !== 'weapon') {
      return { success: false, message: i18n.t('inv.msg.noNearbyLoot') };
    }

    const weaponDef = this.resolveWeaponDef(lootItem.definition.weaponId);
    if (!weaponDef) {
      return { success: false };
    }

    const group = getWeaponInventoryGroup(weaponDef.type);
    const allowedSlots = getAllowedSlotsForWeaponGroup(group);
    if (!allowedSlots.includes(replaceSlotIndex)) {
      return { success: false };
    }

    this.interruptHealing(i18n.t('inv.msg.healingCanceled'));
    this.captureActiveWeaponMagAmmo();

    const fullMag = weaponDef.magazineSize;
    const incomingMag = this.unlimitedAmmo
      ? fullMag
      : (lootItem.metadata.weaponAmmoInMag ?? fullMag);
    const nextEntry = this.createEntry(lootItem.definition, 1, { weaponMagAmmo: incomingMag });

    const replaced = this.weaponSlots[replaceSlotIndex].setEntry(nextEntry);
    if (replaced) {
      this.dropEntryToWorld(replaced, 0.85);
    }

    this.boundLootManager.collectNode(lootItem.instanceId, 'local-player');
    this.onlineHooks?.onCollectLoot?.(lootItem.instanceId, lootItem.definition.id);

    this.activeWeaponSlotIndex = replaceSlotIndex;
    this.lastActiveWeaponSlotIndex = replaceSlotIndex;
    this.syncWeaponsToManager();
    this.audioManager.playPickup();

    const itemName = i18n.translateLootName(lootItem.definition.id, lootItem.definition.name);
    return { success: true, message: i18n.t('inv.msg.swappedTo', { item: itemName }) };
  }

  private pickupDefinition(
    def: LootItemDefinition,
    quantity: number,
    meta: { durability?: number; weaponMagAmmo?: number } = {},
  ): ActionOutcome {
    const itemName = i18n.translateLootName(def.id, def.name);
    switch (def.category) {
      case 'ammo': {
        const type = def.ammoType ?? 'AR';
        const amount = (def.ammoAmount ?? 20) * quantity;
        this.ammoPool[type] += amount;
        this.syncWeaponReserveOnly();
        return {
          success: true,
          message: i18n.t('inv.msg.ammoAdded', {
            amount,
            type: i18n.translateAmmoType(type),
          }),
        };
      }

      case 'utility': {
        if (def.specialEffect === 'gloo_wall' || def.id === 'gloo_wall') {
          this.glooWalls = this.maxGlooWalls;
          return {
            success: true,
            message: 'GLOO WALL UNLIMITED (MAX 3 ACTIVE)',
          };
        }
        if (def.specialEffect === 'ammo_pouch') {
          this.ammoPool.AR += 20;
          this.ammoPool.SMG += 24;
          this.ammoPool.SHOTGUN += 6;
          this.ammoPool.SNIPER += 5;
          this.ammoPool.PISTOL += 16;
          this.syncWeaponReserveOnly();
          return { success: true, message: i18n.t('inv.msg.supplyPack') };
        }
        return this.addToReserveOrEquipSpecial(def, quantity);
      }

      case 'weapon': {
        const weaponDef = this.resolveWeaponDef(def.weaponId);
        if (!weaponDef) return { success: false };
        const group = getWeaponInventoryGroup(weaponDef.type);
        const allowedSlots = getAllowedSlotsForWeaponGroup(group);
        const fullMag = weaponDef.magazineSize;
        const mag = this.unlimitedAmmo ? fullMag : (meta.weaponMagAmmo ?? fullMag);
        const entry = this.createEntry(def, 1, { weaponMagAmmo: mag });

        for (let i = 0; i < allowedSlots.length; i++) {
          const sIdx = allowedSlots[i];
          if (this.weaponSlots[sIdx].isEmpty()) {
            this.weaponSlots[sIdx].setEntry(entry);
            this.activeWeaponSlotIndex = sIdx;
            this.lastActiveWeaponSlotIndex = sIdx;
            this.syncWeaponsToManager();
            return { success: true, message: i18n.t('inv.msg.equippedItem', { item: itemName }) };
          }
        }

        // Category is full — never allow exceeding category cap
        return { success: false, message: `${group} WEAPON SLOTS FULL` };
      }

      case 'health':
      case 'shield': {
        const current = this.healingSlot.getEntry();
        if (!current) {
          this.healingSlot.setEntry(this.createEntry(def, quantity));
          return { success: true, message: i18n.t('inv.msg.equippedItem', { item: itemName }) };
        }
        if (current.definition.id === def.id && current.quantity < def.maxStack) {
          const added = this.healingSlot.addQuantity(quantity);
          const rem = quantity - added;
          if (rem > 0) {
            if (!this.tryPushStackableReserve(this.healingReserve, def, rem)) {
              return {
                success: true,
                message: i18n.t('inv.msg.qtyItemBagFull', { qty: added, item: itemName }),
              };
            }
          }
          return { success: true, message: i18n.t('inv.msg.qtyItem', { qty: quantity, item: itemName }) };
        }
        if (!this.tryPushStackableReserve(this.healingReserve, def, quantity)) {
          return { success: false, message: i18n.t('inv.msg.bagFullLargerOrDrop') };
        }
        return {
          success: true,
          message: i18n.t('inv.msg.bagPlusQtyItem', { qty: quantity, item: itemName }),
        };
      }

      case 'armor': {
        const dur = meta.durability ?? def.armorMaxDurability ?? 50;
        const entry = this.createEntry(def, 1, {
          durability: dur,
          maxDurability: def.armorMaxDurability ?? dur,
        });
        const currentArmor = this.armorSlot.getEntry();
        if (!currentArmor) {
          this.armorSlot.setEntry(entry);
          this.syncGearStatsAndVisuals();
          return { success: true, message: i18n.t('inv.msg.equippedItem', { item: itemName }) };
        }
        if ((def.armorLevel ?? 0) > (currentArmor.definition.armorLevel ?? 0)) {
          this.armorSlot.setEntry(entry);
          if (this.hasBagSpace(1)) {
            this.armorReserve.push(currentArmor);
          } else {
            this.dropEntryToWorld(currentArmor, 0.8);
          }
          this.syncGearStatsAndVisuals();
          return { success: true, message: i18n.t('inv.msg.upgradedTo', { item: itemName }) };
        }
        if (!this.hasBagSpace(1)) {
          return { success: false, message: i18n.t('inv.msg.bagFullDropArmor') };
        }
        this.armorReserve.push(entry);
        return { success: true, message: i18n.t('inv.msg.stowedItem', { item: itemName }) };
      }

      case 'helmet': {
        const dur = meta.durability ?? def.helmetMaxDurability ?? 45;
        const entry = this.createEntry(def, 1, {
          durability: dur,
          maxDurability: def.helmetMaxDurability ?? dur,
        });
        const currentHelmet = this.helmetSlot.getEntry();
        if (!currentHelmet) {
          this.helmetSlot.setEntry(entry);
          this.syncGearStatsAndVisuals();
          return { success: true, message: i18n.t('inv.msg.equippedItem', { item: itemName }) };
        }
        if ((def.helmetLevel ?? 0) > (currentHelmet.definition.helmetLevel ?? 0)) {
          this.helmetSlot.setEntry(entry);
          if (this.hasBagSpace(1)) {
            this.helmetReserve.push(currentHelmet);
          } else {
            this.dropEntryToWorld(currentHelmet, 0.8);
          }
          this.syncGearStatsAndVisuals();
          return { success: true, message: i18n.t('inv.msg.upgradedTo', { item: itemName }) };
        }
        if (!this.hasBagSpace(1)) {
          return { success: false, message: i18n.t('inv.msg.bagFullDropHelmet') };
        }
        this.helmetReserve.push(entry);
        return { success: true, message: i18n.t('inv.msg.stowedItem', { item: itemName }) };
      }

      case 'backpack': {
        const entry = this.createEntry(def, 1);
        const currentPack = this.backpackSlot.getEntry();
        if (!currentPack) {
          this.backpackSlot.setEntry(entry);
          this.syncGearStatsAndVisuals();
          return {
            success: true,
            message: i18n.t('inv.msg.equippedPackSlots', {
              item: itemName,
              slots: def.backpackBonusSlots ?? 0,
            }),
          };
        }
        if ((def.backpackLevel ?? 0) > (currentPack.definition.backpackLevel ?? 0)) {
          this.backpackSlot.setEntry(entry);
          this.dropEntryToWorld(currentPack, 0.8);
          this.syncGearStatsAndVisuals();
          return {
            success: true,
            message: i18n.t('inv.msg.upgradedPackCap', {
              item: itemName,
              cap: this.getBagCapacity(),
            }),
          };
        }
        if (!this.hasBagSpace(1)) {
          return { success: false, message: i18n.t('inv.msg.bagFullShort') };
        }
        this.backpackReserve.push(entry);
        return { success: true, message: i18n.t('inv.msg.stowedItem', { item: itemName }) };
      }

      case 'scope': {
        const entry = this.createEntry(def, 1);
        const currentScope = this.scopeSlot.getEntry();
        if (!currentScope) {
          this.scopeSlot.setEntry(entry);
          return { success: true, message: i18n.t('inv.msg.equippedItem', { item: itemName }) };
        }
        if ((def.scopeLevel ?? 0) > (currentScope.definition.scopeLevel ?? 0)) {
          this.scopeSlot.setEntry(entry);
          if (this.hasBagSpace(1)) {
            this.scopeReserve.push(currentScope);
          } else {
            this.dropEntryToWorld(currentScope, 0.8);
          }
          return { success: true, message: i18n.t('inv.msg.opticUpgraded', { item: itemName }) };
        }
        if (!this.hasBagSpace(1)) {
          return { success: false, message: i18n.t('inv.msg.bagFullDropScope') };
        }
        this.scopeReserve.push(entry);
        return { success: true, message: i18n.t('inv.msg.stowedItem', { item: itemName }) };
      }

      case 'special':
        return this.addToReserveOrEquipSpecial(def, quantity);
    }
  }

  private addToReserveOrEquipSpecial(
    def: LootItemDefinition,
    quantity: number,
  ): ActionOutcome {
    const itemName = i18n.translateLootName(def.id, def.name);
    const current = this.specialSlot.getEntry();
    if (!current) {
      this.specialSlot.setEntry(this.createEntry(def, quantity));
      return { success: true, message: i18n.t('inv.msg.equippedItem', { item: itemName }) };
    }
    if (current.definition.id === def.id && current.quantity < def.maxStack) {
      const added = this.specialSlot.addQuantity(quantity);
      const rem = quantity - added;
      if (rem > 0) {
        if (!this.tryPushStackableReserve(this.specialReserve, def, rem)) {
          return {
            success: true,
            message: i18n.t('inv.msg.qtyItemBagFull', { qty: added, item: itemName }),
          };
        }
      }
      return { success: true, message: i18n.t('inv.msg.qtyItem', { qty: quantity, item: itemName }) };
    }
    if (!this.tryPushStackableReserve(this.specialReserve, def, quantity)) {
      return { success: false, message: i18n.t('inv.msg.bagFullLargerOrDrop') };
    }
    return {
      success: true,
      message: i18n.t('inv.msg.bagPlusQtyItem', { qty: quantity, item: itemName }),
    };
  }

  private tryPushStackableReserve(
    reserve: InventoryEntry[],
    def: LootItemDefinition,
    quantity: number,
  ): boolean {
    let remaining = quantity;
    for (const entry of reserve) {
      if (entry.definition.id === def.id && entry.quantity < def.maxStack) {
        const room = def.maxStack - entry.quantity;
        const add = Math.min(room, remaining);
        entry.quantity += add;
        remaining -= add;
        if (remaining <= 0) return true;
      }
    }
    while (remaining > 0) {
      if (!this.hasBagSpace(1)) {
        return false;
      }
      const stack = Math.min(remaining, def.maxStack);
      reserve.push(this.createEntry(def, stack));
      remaining -= stack;
    }
    return true;
  }

  // --- Equip / Unequip / Swap / Holster / Reload / Use / Drop Operations ---
  private findFirstOccupiedWeaponSlot(excludeIndex?: number): WeaponSlotIndex | -1 {
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      if (i === excludeIndex) continue;
      if (!this.weaponSlots[i].isEmpty()) return i as WeaponSlotIndex;
    }
    return -1;
  }

  equipWeaponSlot(slotIndex: WeaponSlotIndex): ActionOutcome {
    this.captureActiveWeaponMagAmmo();
    const target = this.weaponSlots[slotIndex].getEntry();
    if (!target) {
      return { success: false, message: i18n.t('inv.msg.slotEmpty', { slot: slotIndex + 1 }) };
    }
    this.interruptHealing(i18n.t('inv.msg.healingCanceled'));
    if (this.activeWeaponSlotIndex === slotIndex) {
      return { success: true };
    }
    this.activeWeaponSlotIndex = slotIndex;
    this.lastActiveWeaponSlotIndex = slotIndex;
    this.boundWeaponManager?.equipSlot(slotIndex);
    this.audioManager.playClick();
    return {
      success: true,
      message: i18n.t('inv.msg.drewWeapon', {
        weapon: i18n.translateLootName(target.definition.id, target.definition.name),
      }),
    };
  }

  cycleEquippedWeapon(direction: 1 | -1): ActionOutcome {
    this.captureActiveWeaponMagAmmo();
    const occupiedSlots: WeaponSlotIndex[] = [];
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      if (!this.weaponSlots[i].isEmpty()) {
        occupiedSlots.push(i as WeaponSlotIndex);
      }
    }

    if (occupiedSlots.length === 0) {
      return { success: false };
    }

    if (this.activeWeaponSlotIndex === -1) {
      const target = direction > 0 ? occupiedSlots[0] : occupiedSlots[occupiedSlots.length - 1];
      return this.equipWeaponSlot(target);
    }

    if (occupiedSlots.length < 2) {
      return { success: false };
    }

    const curIdx = occupiedSlots.indexOf(this.activeWeaponSlotIndex as WeaponSlotIndex);
    const basePos = curIdx >= 0 ? curIdx : 0;
    const nextPos = (basePos + direction + occupiedSlots.length) % occupiedSlots.length;
    return this.equipWeaponSlot(occupiedSlots[nextPos]);
  }

  holsterActiveWeapon(): ActionOutcome {
    this.interruptHealing(i18n.t('inv.msg.healingCanceled'));
    this.captureActiveWeaponMagAmmo();
    if (this.activeWeaponSlotIndex === -1) {
      return { success: true, message: i18n.t('inv.msg.unarmedMsg') };
    }
    const prevIdx = (
      this.activeWeaponSlotIndex >= 0 && this.activeWeaponSlotIndex < WEAPON_SLOT_COUNT
        ? this.activeWeaponSlotIndex
        : 0
    ) as WeaponSlotIndex;
    this.lastActiveWeaponSlotIndex = prevIdx;
    const prevWeapon = this.weaponSlots[prevIdx].getEntry();
    this.activeWeaponSlotIndex = -1;
    this.boundWeaponManager?.equipSlot(-1);
    this.audioManager.playBack();
    return {
      success: true,
      message: prevWeapon
        ? i18n.t('inv.msg.holsteredMsg', {
            weapon: i18n.translateLootName(prevWeapon.definition.id, prevWeapon.definition.name),
          })
        : i18n.t('inv.msg.unarmedMsg'),
    };
  }

  toggleHolsterWeapons(): ActionOutcome {
    if (this.activeWeaponSlotIndex !== -1) {
      return this.holsterActiveWeapon();
    }
    return this.retrieveStoredWeaponFromBack();
  }

  retrieveStoredWeaponFromBack(): ActionOutcome {
    this.captureActiveWeaponMagAmmo();
    if (this.activeWeaponSlotIndex >= 0 && this.activeWeaponSlotIndex < WEAPON_SLOT_COUNT) {
      const cur = this.weaponSlots[this.activeWeaponSlotIndex as WeaponSlotIndex]?.getEntry();
      return {
        success: true,
        message: cur
          ? i18n.t('inv.msg.equippedItem', {
              item: i18n.translateLootName(cur.definition.id, cur.definition.name),
            })
          : i18n.t('common.ready'),
      };
    }
    const preferred = this.lastActiveWeaponSlotIndex;
    if (!this.weaponSlots[preferred].isEmpty()) {
      return this.equipWeaponSlot(preferred);
    }
    const fallback = this.findFirstOccupiedWeaponSlot();
    if (fallback !== -1) {
      return this.equipWeaponSlot(fallback);
    }
    return { success: false, message: i18n.t('inv.msg.noWeaponOnBack') };
  }

  reloadWeaponSlot(slotIndex: WeaponSlotIndex): ActionOutcome {
    if (this.unlimitedAmmo) {
      this.topUpWeaponSlotMags();
      return { success: false };
    }
    this.captureActiveWeaponMagAmmo();
    const entry = this.weaponSlots[slotIndex].getEntry();
    if (!entry || !entry.definition.weaponId) {
      return { success: false, message: i18n.t('inv.msg.slotEmpty', { slot: slotIndex + 1 }) };
    }
    const weaponDef = this.resolveWeaponDef(entry.definition.weaponId);
    if (!weaponDef) return { success: false };
    const wName = i18n.translateWeaponName(weaponDef.id);
    if (weaponDef.type === 'MELEE' || weaponDef.magazineSize <= 0) {
      return { success: false, message: i18n.t('inv.msg.meleeNoAmmo', { weapon: wName }) };
    }

    const ammoType = toAmmoType(weaponDef.type);
    const ammoLabel = i18n.translateAmmoType(ammoType);
    const currentMag = entry.weaponMagAmmo ?? 0;
    const needed = weaponDef.magazineSize - currentMag;
    if (needed <= 0) {
      return { success: false, message: i18n.t('inv.msg.magFull', { weapon: wName }) };
    }
    const available = this.ammoPool[ammoType];
    if (available <= 0) {
      return { success: false, message: i18n.t('inv.msg.noReserveType', { type: ammoLabel }) };
    }

    const loaded = Math.min(needed, available);
    this.ammoPool[ammoType] -= loaded;
    entry.weaponMagAmmo = currentMag + loaded;
    this.syncWeaponsToManager();
    this.syncWeaponReserveOnly();
    this.audioManager.playDeploy();
    return {
      success: true,
      message: i18n.t('inv.msg.reloadedWeapon', { weapon: wName, loaded, type: ammoLabel }),
    };
  }

  unequipWeaponSlot(_slotIndex: WeaponSlotIndex): ActionOutcome {
    return { success: false, message: 'DRAG WEAPON TO TRASH TO DROP' };
  }

  equipHolsteredWeapon(_instanceId: string): ActionOutcome {
    return { success: false };
  }

  swapWeaponSlots(): ActionOutcome {
    this.interruptHealing(i18n.t('inv.msg.healingCanceled'));
    this.captureActiveWeaponMagAmmo();

    if (this.activeWeaponSlotIndex === -1) {
      return this.retrieveStoredWeaponFromBack();
    }

    const occupiedSlots: WeaponSlotIndex[] = [];
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      if (!this.weaponSlots[i].isEmpty()) {
        occupiedSlots.push(i as WeaponSlotIndex);
      }
    }

    if (occupiedSlots.length === 0) {
      return { success: false, message: i18n.t('inv.msg.noWeaponSwitch') };
    }
    if (occupiedSlots.length < 2) {
      return { success: false, message: i18n.t('inv.msg.need2ndWeapon') };
    }

    const curIdx = occupiedSlots.indexOf(this.activeWeaponSlotIndex as WeaponSlotIndex);
    const nextSlot = occupiedSlots[(curIdx + 1) % occupiedSlots.length];
    this.activeWeaponSlotIndex = nextSlot;
    this.lastActiveWeaponSlotIndex = nextSlot;
    this.boundWeaponManager?.equipSlot(nextSlot);
    this.audioManager.playClick();
    return { success: true };
  }

  dropActiveWeapon(): ActionOutcome {
    if (this.activeWeaponSlotIndex < 0 || this.activeWeaponSlotIndex >= WEAPON_SLOT_COUNT) {
      return { success: false, message: i18n.t('inv.msg.unarmedDrop') };
    }
    return this.dropWeaponSlot(this.activeWeaponSlotIndex as WeaponSlotIndex);
  }

  dropWeaponSlot(slotIndex: WeaponSlotIndex): ActionOutcome {
    this.interruptHealing(i18n.t('inv.msg.healingCanceled'));
    this.captureActiveWeaponMagAmmo();
    const removed = this.weaponSlots[slotIndex].clear();
    if (!removed) return { success: false, message: i18n.t('inv.msg.noWeaponDrop') };

    this.dropEntryToWorld(removed, 0.9);
    if (this.activeWeaponSlotIndex === slotIndex) {
      const next = this.findFirstOccupiedWeaponSlot(slotIndex);
      this.activeWeaponSlotIndex = next;
      if (next !== -1) {
        this.lastActiveWeaponSlotIndex = next;
      }
    }
    this.syncWeaponsToManager();
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.droppedWeapon', {
        name: i18n.translateLootName(removed.definition.id, removed.definition.name),
      }),
    };
  }

  equipHealingItem(instanceId: string): ActionOutcome {
    const idx = this.healingReserve.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return { success: false };
    const [next] = this.healingReserve.splice(idx, 1);
    const prev = this.healingSlot.setEntry(next);
    if (prev) this.healingReserve.push(prev);
    this.audioManager.playClick();
    return {
      success: true,
      message: i18n.t('inv.msg.equippedItem', {
        item: i18n.translateLootName(next.definition.id, next.definition.name),
      }),
    };
  }

  unequipHealingSlot(): ActionOutcome {
    if (!this.hasBagSpace(1)) {
      return { success: false, message: i18n.t('inv.msg.bagFullShort') };
    }
    const prev = this.healingSlot.clear();
    if (!prev) return { success: false };
    this.healingReserve.push(prev);
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.stowedItem', {
        item: i18n.translateLootName(prev.definition.id, prev.definition.name),
      }),
    };
  }

  equipArmorItem(instanceId: string): ActionOutcome {
    const idx = this.armorReserve.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return { success: false };
    const [next] = this.armorReserve.splice(idx, 1);
    const prev = this.armorSlot.setEntry(next);
    if (prev) this.armorReserve.push(prev);
    this.syncGearStatsAndVisuals();
    this.audioManager.playPickup();
    return {
      success: true,
      message: i18n.t('inv.msg.equippedItem', {
        item: i18n.translateLootName(next.definition.id, next.definition.name),
      }),
    };
  }

  unequipArmorSlot(): ActionOutcome {
    if (!this.hasBagSpace(1)) {
      return { success: false, message: i18n.t('inv.msg.bagFullShort') };
    }
    const prev = this.armorSlot.clear();
    if (!prev) return { success: false };
    this.armorReserve.push(prev);
    this.syncGearStatsAndVisuals();
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.unequippedItem', {
        item: i18n.translateLootName(prev.definition.id, prev.definition.name),
      }),
    };
  }

  equipHelmetItem(instanceId: string): ActionOutcome {
    const idx = this.helmetReserve.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return { success: false };
    const [next] = this.helmetReserve.splice(idx, 1);
    const prev = this.helmetSlot.setEntry(next);
    if (prev) this.helmetReserve.push(prev);
    this.syncGearStatsAndVisuals();
    this.audioManager.playPickup();
    return {
      success: true,
      message: i18n.t('inv.msg.equippedItem', {
        item: i18n.translateLootName(next.definition.id, next.definition.name),
      }),
    };
  }

  unequipHelmetSlot(): ActionOutcome {
    if (!this.hasBagSpace(1)) {
      return { success: false, message: i18n.t('inv.msg.bagFullShort') };
    }
    const prev = this.helmetSlot.clear();
    if (!prev) return { success: false };
    this.helmetReserve.push(prev);
    this.syncGearStatsAndVisuals();
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.unequippedItem', {
        item: i18n.translateLootName(prev.definition.id, prev.definition.name),
      }),
    };
  }

  equipBackpackItem(instanceId: string): ActionOutcome {
    const idx = this.backpackReserve.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return { success: false };
    const [next] = this.backpackReserve.splice(idx, 1);
    const prev = this.backpackSlot.setEntry(next);
    if (prev) {
      if (this.hasBagSpace(1)) {
        this.backpackReserve.push(prev);
      } else {
        this.dropEntryToWorld(prev, 0.8);
      }
    }
    this.syncGearStatsAndVisuals();
    this.audioManager.playPickup();
    return {
      success: true,
      message: i18n.t('inv.msg.equippedItem', {
        item: i18n.translateLootName(next.definition.id, next.definition.name),
      }),
    };
  }

  unequipBackpackSlot(): ActionOutcome {
    const current = this.backpackSlot.getEntry();
    if (!current) return { success: false };
    // Prevent unequipping backpack if current items require the extra slots
    if (this.getBagUsed() + 1 > BASE_BAG_CAPACITY) {
      return {
        success: false,
        message: i18n.t('inv.msg.dropBeforePack', {
          count: this.getBagUsed() + 1 - BASE_BAG_CAPACITY,
        }),
      };
    }
    this.backpackSlot.clear();
    this.backpackReserve.push(current);
    this.syncGearStatsAndVisuals();
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.unequippedItem', {
        item: i18n.translateLootName(current.definition.id, current.definition.name),
      }),
    };
  }

  equipSpecialItem(instanceId: string): ActionOutcome {
    const idx = this.specialReserve.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return { success: false };
    const [next] = this.specialReserve.splice(idx, 1);
    const prev = this.specialSlot.setEntry(next);
    if (prev) this.specialReserve.push(prev);
    this.audioManager.playClick();
    return {
      success: true,
      message: i18n.t('inv.msg.equippedItem', {
        item: i18n.translateLootName(next.definition.id, next.definition.name),
      }),
    };
  }

  unequipSpecialSlot(): ActionOutcome {
    if (!this.hasBagSpace(1)) {
      return { success: false, message: i18n.t('inv.msg.bagFullShort') };
    }
    const prev = this.specialSlot.clear();
    if (!prev) return { success: false };
    this.specialReserve.push(prev);
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.stowedItem', {
        item: i18n.translateLootName(prev.definition.id, prev.definition.name),
      }),
    };
  }

  equipScopeItem(instanceId: string): ActionOutcome {
    const idx = this.scopeReserve.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return { success: false };
    const [next] = this.scopeReserve.splice(idx, 1);
    const prev = this.scopeSlot.setEntry(next);
    if (prev) this.scopeReserve.push(prev);
    this.audioManager.playClick();
    return {
      success: true,
      message: i18n.t('inv.msg.mountedItem', {
        item: i18n.translateLootName(next.definition.id, next.definition.name),
      }),
    };
  }

  unequipScopeSlot(): ActionOutcome {
    if (!this.hasBagSpace(1)) {
      return { success: false, message: i18n.t('inv.msg.bagFullShort') };
    }
    const prev = this.scopeSlot.clear();
    if (!prev) return { success: false };
    this.scopeReserve.push(prev);
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.stowedItem', {
        item: i18n.translateLootName(prev.definition.id, prev.definition.name),
      }),
    };
  }

  useEquippedHealing(): ActionOutcome {
    const entry = this.healingSlot.getEntry();
    if (!entry) return { success: false, message: i18n.t('inv.msg.healSlotEmpty') };
    return this.useItemById(entry.instanceId);
  }

  useEquippedSpecial(): ActionOutcome {
    const entry = this.specialSlot.getEntry();
    if (!entry) return { success: false, message: i18n.t('inv.msg.equipSlotEmpty') };
    return this.useItemById(entry.instanceId);
  }

  useItemById(instanceId: string): ActionOutcome {
    if (!this.boundPlayer || !this.boundPlayer.isAlive) {
      return { success: false };
    }

    const found = this.findAndConsumeTarget(instanceId);
    if (!found) return { success: false };

    const { entry, source, index } = found;
    const def = entry.definition;
    const itemName = i18n.translateLootName(def.id, def.name);
    const stats = this.boundPlayer.stats;

    if (def.useDurationSec && def.useDurationSec > 0) {
      if (this.activeHeal) {
        return { success: false, message: i18n.t('inv.msg.alreadyHealing') };
      }
      if (def.category === 'health' && stats.health >= stats.maxHealth) {
        return { success: false, message: i18n.t('inv.msg.healthAlreadyFull') };
      }
      if (def.category === 'shield' && stats.shield >= stats.maxShield) {
        return { success: false, message: i18n.t('inv.msg.shieldAlreadyFull') };
      }

      if (source === 'healingSlot') {
        this.healingSlot.consumeQuantity(1);
      } else if (source === 'specialSlot') {
        this.specialSlot.consumeQuantity(1);
      } else if (source === 'healingReserve') {
        this.decrementReserveAt(this.healingReserve, index);
      } else if (source === 'specialReserve') {
        this.decrementReserveAt(this.specialReserve, index);
      }

      this.boundWeaponManager?.cancelActiveReload();
      const kind = this.resolveHealKind(def);
      this.activeHeal = {
        def,
        kind,
        durationSec: def.useDurationSec,
        elapsedSec: 0,
        targetHeal: def.healAmount ?? 0,
        appliedHeal: 0,
        targetShield: def.shieldAmount ?? 0,
        appliedShield: 0,
        tickAccum: 0,
        lastObservedHealth: stats.health,
        lastObservedShield: stats.shield,
      };
      this.boundPlayer.setHealingVisualState({ active: true, kind, progress: 0 });
      this.onlineHooks?.onUseConsumable?.(def.id);
      this.audioManager.playHealStart(kind);
      return {
        success: true,
        message: i18n.t('inv.msg.usingTimed', {
          item: itemName,
          sec: def.useDurationSec.toFixed(1),
        }),
      };
    }

    let applied = false;
    let feedback = i18n.t('inv.msg.usedConsumable', { name: itemName });

    if (def.category === 'health') {
      if (stats.health >= stats.maxHealth) {
        return { success: false, message: i18n.t('inv.msg.healthAlreadyFull') };
      }
      stats.heal(def.healAmount ?? 25);
      applied = true;
      feedback = i18n.t('inv.msg.plusHealth', { amount: def.healAmount ?? 25 });
    } else if (def.category === 'shield') {
      if (stats.shield >= stats.maxShield) {
        return { success: false, message: i18n.t('inv.msg.shieldAlreadyFull') };
      }
      stats.addShield(def.shieldAmount ?? 25);
      applied = true;
      feedback = i18n.t('inv.msg.plusShield', { amount: def.shieldAmount ?? 25 });
    } else if (def.specialEffect === 'adrenaline_surge') {
      stats.heal(def.healAmount ?? 35);
      stats.addShield(def.shieldAmount ?? 35);
      this.activeBuffs.adrenalineRemainingSec = Math.max(
        this.activeBuffs.adrenalineRemainingSec,
        def.durationSec ?? 8,
      );
      applied = true;
      feedback = i18n.t('inv.msg.adrenalineSurge');
    } else if (def.specialEffect === 'energy_boost') {
      stats.heal(def.healAmount ?? 15);
      stats.addShield(def.shieldAmount ?? 20);
      this.activeBuffs.adrenalineRemainingSec = Math.max(
        this.activeBuffs.adrenalineRemainingSec,
        def.durationSec ?? 8,
      );
      applied = true;
      feedback = i18n.t('inv.msg.energyBoost');
    } else if (def.specialEffect === 'recon_uplink') {
      this.activeBuffs.reconRemainingSec = Math.max(
        this.activeBuffs.reconRemainingSec,
        def.durationSec ?? 12,
      );
      applied = true;
      feedback = i18n.t('inv.msg.reconOnline');
    } else if (def.specialEffect === 'armor_repair') {
      const eqArmor = this.armorSlot.getEntry();
      if (!eqArmor) return { success: false, message: i18n.t('inv.msg.noArmorEquipped') };
      const maxD = eqArmor.maxDurability ?? 100;
      if ((eqArmor.durability ?? 0) >= maxD) {
        return { success: false, message: i18n.t('inv.msg.armorAlreadyFull') };
      }
      const repairAmt = def.armorMaxDurability ?? 50;
      eqArmor.durability = Math.min(maxD, (eqArmor.durability ?? 0) + repairAmt);
      this.syncGearStatsAndVisuals();
      applied = true;
      feedback = i18n.t('inv.msg.armorRepairedAmt', { amount: repairAmt });
    } else if (def.specialEffect === 'helmet_repair') {
      const eqArmor = this.armorSlot.getEntry();
      const eqHelmet = this.helmetSlot.getEntry();
      if (!eqArmor && !eqHelmet) {
        return { success: false, message: i18n.t('inv.msg.noArmorOrHelmet') };
      }
      if (eqArmor) {
        const maxD = eqArmor.maxDurability ?? 100;
        eqArmor.durability = Math.min(maxD, (eqArmor.durability ?? 0) + (def.armorMaxDurability ?? 45));
      }
      if (eqHelmet) {
        const maxH = eqHelmet.maxDurability ?? 100;
        eqHelmet.durability = Math.min(maxH, (eqHelmet.durability ?? 0) + (def.helmetMaxDurability ?? 45));
      }
      this.syncGearStatsAndVisuals();
      applied = true;
      feedback = i18n.t('inv.msg.gearRepaired');
    } else if (def.specialEffect === 'ammo_pouch') {
      this.ammoPool.AR += 20;
      this.ammoPool.SMG += 24;
      this.ammoPool.SHOTGUN += 6;
      this.ammoPool.SNIPER += 5;
      this.ammoPool.PISTOL += 16;
      this.syncWeaponReserveOnly();
      applied = true;
      feedback = i18n.t('inv.msg.supplyPackShort');
    }

    if (!applied) return { success: false };

    if (source === 'healingSlot') {
      this.healingSlot.consumeQuantity(1);
    } else if (source === 'specialSlot') {
      this.specialSlot.consumeQuantity(1);
    } else if (source === 'healingReserve') {
      this.decrementReserveAt(this.healingReserve, index);
    } else if (source === 'specialReserve') {
      this.decrementReserveAt(this.specialReserve, index);
    }

    this.onlineHooks?.onUseConsumable?.(def.id);
    this.audioManager.playDeploy();
    return { success: true, message: feedback };
  }

  dropItemById(instanceId: string): ActionOutcome {
    const slotMatch = this.extractFromSlotsOrReserves(instanceId);
    if (!slotMatch) return { success: false };
    this.dropEntryToWorld(slotMatch, 0.85);
    this.syncGearStatsAndVisuals();
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.droppedWeapon', {
        name: i18n.translateLootName(slotMatch.definition.id, slotMatch.definition.name),
      }),
    };
  }

  dropAmmo(ammoType: AmmoType): ActionOutcome {
    const dropChunk =
      ammoType === 'SHOTGUN'
        ? 10
        : ammoType === 'SNIPER'
          ? 10
          : ammoType === 'SMG'
            ? 36
            : ammoType === 'PISTOL'
              ? 24
              : 30;
    const actual = Math.min(this.ammoPool[ammoType], dropChunk);
    const ammoLabel = i18n.translateAmmoType(ammoType);
    if (actual <= 0) return { success: false, message: i18n.t('inv.msg.noAmmoType', { type: ammoLabel }) };

    this.ammoPool[ammoType] -= actual;
    const lootId =
      ammoType === 'SHOTGUN'
        ? 'ammo_shotgun'
        : ammoType === 'SNIPER'
          ? 'ammo_sniper'
          : ammoType === 'SMG'
            ? 'ammo_smg'
            : ammoType === 'PISTOL'
              ? 'ammo_pistol'
              : 'ammo_ar';
    if (this.boundLootManager && this.boundPlayer) {
      if (this.onlineHooks?.onDropLoot) {
        this.onlineHooks.onDropLoot(
          lootId,
          this.boundPlayer.position.x + 0.7,
          this.boundPlayer.position.y,
          this.boundPlayer.position.z + 0.7,
          1,
          {},
        );
      } else {
        this.boundLootManager.spawnDroppedItem(
          lootId,
          this.boundPlayer.position.x + 0.7,
          this.boundPlayer.position.z + 0.7,
          1,
          {},
          this.boundPlayer.position.y,
          this.boundPlayer.position.x,
          this.boundPlayer.position.z,
        );
      }
    }
    this.syncWeaponReserveOnly();
    this.audioManager.playBack();
    return {
      success: true,
      message: i18n.t('inv.msg.droppedAmmo', { amount: actual, type: ammoLabel }),
    };
  }

  private extractFromSlotsOrReserves(instanceId: string): InventoryEntry | null {
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      const e = this.weaponSlots[i].getEntry();
      if (e?.instanceId === instanceId) {
        this.weaponSlots[i].clear();
        if (this.activeWeaponSlotIndex === i) {
          const next = this.findFirstOccupiedWeaponSlot(i);
          this.activeWeaponSlotIndex = next;
          if (next !== -1) {
            this.lastActiveWeaponSlotIndex = next;
          }
        }
        this.syncWeaponsToManager();
        return e;
      }
    }
    if (this.healingSlot.getEntry()?.instanceId === instanceId) {
      return this.healingSlot.clear();
    }
    if (this.armorSlot.getEntry()?.instanceId === instanceId) {
      return this.armorSlot.clear();
    }
    if (this.helmetSlot.getEntry()?.instanceId === instanceId) {
      return this.helmetSlot.clear();
    }
    if (this.backpackSlot.getEntry()?.instanceId === instanceId) {
      return this.backpackSlot.clear();
    }
    if (this.scopeSlot.getEntry()?.instanceId === instanceId) {
      return this.scopeSlot.clear();
    }
    if (this.specialSlot.getEntry()?.instanceId === instanceId) {
      return this.specialSlot.clear();
    }

    for (const arr of [
      this.holsteredWeapons,
      this.healingReserve,
      this.armorReserve,
      this.helmetReserve,
      this.backpackReserve,
      this.scopeReserve,
      this.specialReserve,
    ]) {
      const idx = arr.findIndex((e) => e.instanceId === instanceId);
      if (idx !== -1) {
        return arr.splice(idx, 1)[0];
      }
    }
    return null;
  }

  private findAndConsumeTarget(instanceId: string): {
    entry: InventoryEntry;
    source: 'healingSlot' | 'specialSlot' | 'healingReserve' | 'specialReserve';
    index: number;
  } | null {
    const hs = this.healingSlot.getEntry();
    if (hs?.instanceId === instanceId) {
      return { entry: hs, source: 'healingSlot', index: 0 };
    }
    const ss = this.specialSlot.getEntry();
    if (ss?.instanceId === instanceId) {
      return { entry: ss, source: 'specialSlot', index: 0 };
    }
    const hIdx = this.healingReserve.findIndex((e) => e.instanceId === instanceId);
    if (hIdx !== -1) {
      return { entry: this.healingReserve[hIdx], source: 'healingReserve', index: hIdx };
    }
    const sIdx = this.specialReserve.findIndex((e) => e.instanceId === instanceId);
    if (sIdx !== -1) {
      return { entry: this.specialReserve[sIdx], source: 'specialReserve', index: sIdx };
    }
    return null;
  }

  private decrementReserveAt(arr: InventoryEntry[], index: number): void {
    const e = arr[index];
    if (!e) return;
    e.quantity -= 1;
    if (e.quantity <= 0) {
      arr.splice(index, 1);
    }
  }

  private dropEntryToWorld(entry: InventoryEntry, offsetDist = 0.85): void {
    if (!this.boundLootManager || !this.boundPlayer) return;
    const angle = this.boundPlayer.rotation.y + 0.3;
    const dx = Math.sin(angle) * offsetDist;
    const dz = Math.cos(angle) * offsetDist;
    const tx = this.boundPlayer.position.x + dx;
    const ty = this.boundPlayer.position.y;
    const tz = this.boundPlayer.position.z + dz;
    const meta = {
      armorDurability: entry.durability,
      weaponAmmoInMag: entry.weaponMagAmmo,
    };
    if (this.onlineHooks?.onDropLoot) {
      this.onlineHooks.onDropLoot(entry.definition.id, tx, ty, tz, entry.quantity, meta);
    } else {
      this.boundLootManager.spawnDroppedItem(
        entry.definition.id,
        tx,
        tz,
        entry.quantity,
        meta,
        ty,
        this.boundPlayer.position.x,
        this.boundPlayer.position.z,
      );
    }
  }

  private captureActiveWeaponMagAmmo(): void {
    if (!this.boundWeaponManager) return;
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      const entry = this.weaponSlots[i].getEntry();
      const w = this.boundWeaponManager.getSlotWeapon(i);
      if (entry && w && entry.definition.weaponId === w.definition.id) {
        entry.weaponMagAmmo = w.ammoInMagazine;
      }
    }
  }

  private syncWeaponsToManager(): void {
    if (!this.boundWeaponManager) return;
    const slotSpecs = this.weaponSlots.map((slot) => {
      const entry = slot.getEntry();
      return entry?.definition.weaponId
        ? { weaponId: entry.definition.weaponId, magAmmo: entry.weaponMagAmmo }
        : null;
    });
    this.boundWeaponManager.syncInventoryWeaponSlots(
      slotSpecs,
      this.activeWeaponSlotIndex,
      [],
    );
  }

  private syncWeaponReserveOnly(): void {
    if (!this.boundWeaponManager) return;
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      const w = this.boundWeaponManager.getSlotWeapon(i);
      if (w) {
        w.reserveAmmo = this.ammoPool[toAmmoType(w.definition.type)];
      }
    }
  }

  applyCombatGearWear(damageAmount: number, isHeadshot: boolean): void {
    if (!Number.isFinite(damageAmount) || damageAmount <= 0) return;
    let changed = false;
    if (isHeadshot) {
      const eqHelmet = this.helmetSlot.getEntry();
      if (eqHelmet && (eqHelmet.durability ?? 0) > 0) {
        eqHelmet.durability = Math.max(0, (eqHelmet.durability ?? 0) - Math.ceil(damageAmount * 0.55));
        if (eqHelmet.durability <= 0) {
          changed = true;
        }
      }
    } else {
      const eqArmor = this.armorSlot.getEntry();
      if (eqArmor && (eqArmor.durability ?? 0) > 0) {
        eqArmor.durability = Math.max(0, (eqArmor.durability ?? 0) - Math.ceil(damageAmount * 0.45));
        if (eqArmor.durability <= 0) {
          changed = true;
        }
      }
    }
    if (changed) {
      this.syncGearStatsAndVisuals();
    }
  }

  private syncGearStatsAndVisuals(): void {
    if (!this.boundPlayer) return;
    this.boundPlayer.stats.damageMitigationPct = this.getTotalProtectionPct();

    const armorEntry = this.armorSlot.getEntry();
    const helmetEntry = this.helmetSlot.getEntry();
    const armorLvl = armorEntry && (armorEntry.durability ?? 1) > 0 ? armorEntry.definition.armorLevel ?? 0 : 0;
    const helmetLvl = helmetEntry && (helmetEntry.durability ?? 1) > 0 ? helmetEntry.definition.helmetLevel ?? 0 : 0;
    const packLvl = this.backpackSlot.getEntry()?.definition.backpackLevel ?? 0;

    const armorTier = (armorLvl === 1 || armorLvl === 2 || armorLvl === 3 ? armorLvl : 0) as 0 | 1 | 2 | 3;
    const helmetTier = (helmetLvl === 1 || helmetLvl === 2 || helmetLvl === 3 ? helmetLvl : 0) as 0 | 1 | 2 | 3;
    const packTier = (packLvl === 1 || packLvl === 2 || packLvl === 3 ? packLvl : 0) as 0 | 1 | 2 | 3;

    this.boundPlayer.setArenaGearVisuals(armorTier, helmetTier, packTier);
    this.onGearChangedCallback?.();
  }

  update(deltaSeconds: number): void {
    if (this.activeBuffs.adrenalineRemainingSec > 0) {
      this.activeBuffs.adrenalineRemainingSec = Math.max(
        0,
        this.activeBuffs.adrenalineRemainingSec - deltaSeconds,
      );
    }
    if (this.activeBuffs.reconRemainingSec > 0) {
      this.activeBuffs.reconRemainingSec = Math.max(
        0,
        this.activeBuffs.reconRemainingSec - deltaSeconds,
      );
    }

    if (this.activeHeal) {
      const h = this.activeHeal;
      if (!this.boundPlayer || !this.boundPlayer.isAlive) {
        this.activeHeal = null;
        this.boundPlayer?.setHealingVisualState(null);
        return;
      }

      const stats = this.boundPlayer.stats;
      // Detect any health/shield drop caused by incoming damage during healing
      if (
        h.lastObservedHealth - stats.health > 0.25 ||
        h.lastObservedShield - stats.shield > 0.25
      ) {
        this.interruptHealing(i18n.t('inv.msg.healingInterruptedDmg'));
        return;
      }

      h.elapsedSec = Math.min(h.durationSec, h.elapsedSec + Math.max(0, deltaSeconds));
      const progress = h.durationSec > 0 ? Math.min(1, h.elapsedSec / h.durationSec) : 1;

      if (h.targetHeal > 0) {
        const desiredHeal = h.targetHeal * progress;
        const deltaHeal = desiredHeal - h.appliedHeal;
        if (deltaHeal > 0) {
          stats.heal(deltaHeal);
          h.appliedHeal = desiredHeal;
        }
      }
      if (h.targetShield > 0) {
        const desiredShield = h.targetShield * progress;
        const deltaShield = desiredShield - h.appliedShield;
        if (deltaShield > 0) {
          stats.addShield(deltaShield);
          h.appliedShield = desiredShield;
        }
      }

      h.lastObservedHealth = stats.health;
      h.lastObservedShield = stats.shield;

      if (h.elapsedSec >= h.durationSec - 1e-5) {
        if (h.targetHeal > h.appliedHeal) {
          stats.heal(h.targetHeal - h.appliedHeal);
        }
        if (h.targetShield > h.appliedShield) {
          stats.addShield(h.targetShield - h.appliedShield);
        }
        if (
          h.def.specialEffect === 'adrenaline_surge' ||
          h.def.specialEffect === 'energy_boost'
        ) {
          this.activeBuffs.adrenalineRemainingSec = Math.max(
            this.activeBuffs.adrenalineRemainingSec,
            h.def.durationSec ?? 8,
          );
        }
        const completedDef = h.def;
        this.activeHeal = null;
        this.boundPlayer.setHealingVisualState(null);
        this.audioManager.playHealComplete();
        this.onHealingCompletedCallback?.(completedDef);
        return;
      }

      h.tickAccum += deltaSeconds;
      if (h.tickAccum >= 0.7) {
        h.tickAccum = 0;
        this.audioManager.playHealTick();
      }
      this.boundPlayer.setHealingVisualState({ active: true, kind: h.kind, progress });
    }
  }

  getActiveItemModifiers(): Partial<AbilityModifiers> {
    const mods: Partial<AbilityModifiers> = {};
    const gearMitigation = this.getTotalProtectionPct();
    if (gearMitigation > 0) {
      mods.damageReductionPct = gearMitigation;
    }
    if (this.activeBuffs.adrenalineRemainingSec > 0) {
      mods.moveSpeedMultiplier = 1.12;
      mods.sprintSpeedMultiplier = 1.2;
    }
    if (this.activeBuffs.reconRemainingSec > 0) {
      mods.enemyDetectionRadius = 60;
      mods.reloadSpeedMultiplier = 1.25;
    }
    return mods;
  }

  getActiveHealingSnapshot(): ActiveHealingState | null {
    const h = this.activeHeal;
    if (!h) return null;
    const progress = h.durationSec > 0 ? Math.max(0, Math.min(1, h.elapsedSec / h.durationSec)) : 1;
    return {
      active: true,
      itemId: h.def.id,
      itemName: i18n.translateLootName(h.def.id, h.def.name),
      kind: h.kind,
      durationSec: h.durationSec,
      elapsedSec: h.elapsedSec,
      remainingSec: Math.max(0, h.durationSec - h.elapsedSec),
      progress,
      totalHealAmount: h.targetHeal,
      totalShieldAmount: h.targetShield,
    };
  }

  getSnapshot(): InventorySnapshot {
    this.captureActiveWeaponMagAmmo();
    return {
      weaponSlot1: this.weaponSlots[0].getEntry(),
      weaponSlot2: this.weaponSlots[1].getEntry(),
      weaponSlot3: this.weaponSlots[2].getEntry(),
      weaponSlot4: this.weaponSlots[3].getEntry(),
      activeWeaponSlotIndex: this.activeWeaponSlotIndex,
      holsteredWeapons: this.holsteredWeapons,
      healingSlot: this.healingSlot.getEntry(),
      healingReserve: this.healingReserve,
      ammo: { ...this.ammoPool },
      armorSlot: this.armorSlot.getEntry(),
      armorReserve: this.armorReserve,
      helmetSlot: this.helmetSlot.getEntry(),
      helmetReserve: this.helmetReserve,
      backpackSlot: this.backpackSlot.getEntry(),
      backpackReserve: this.backpackReserve,
      scopeSlot: this.scopeSlot.getEntry(),
      scopeReserve: this.scopeReserve,
      specialSlot: this.specialSlot.getEntry(),
      specialReserve: this.specialReserve,
      bagUsed: this.getBagUsed(),
      bagCapacity: this.getBagCapacity(),
      totalArmorReductionPct: this.getTotalProtectionPct(),
      activeBuffs: { ...this.activeBuffs },
      activeHealing: this.getActiveHealingSnapshot(),
      unlimitedAmmo: this.unlimitedAmmo,
      glooWalls: this.glooWalls,
      maxGlooWalls: this.maxGlooWalls,
    };
  }

  dispose(): void {
    this.clear();
  }
}
