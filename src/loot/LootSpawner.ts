import type { LootPoint, LootTier } from '../maps/IMapSystem';
import type { LootCategory, LootItemDefinition, LootRarity } from './ILootSystem';
import { getAllLootDefinitions, getLootDefinition } from './LootData';
import { LootItem, type LootItemMetadata } from './LootItem';

export interface LootSpawnRequest {
  definition: LootItemDefinition;
  x: number;
  z: number;
  yHint?: number;
  fallbackX?: number;
  fallbackZ?: number;
  quantity: number;
  metadata?: LootItemMetadata;
}

const RARITY_TIER_MULTIPLIER: Record<LootTier, Record<LootRarity, number>> = {
  standard: { common: 1.35, uncommon: 1.15, rare: 0.78, epic: 0.45, legendary: 0.22 },
  medium: { common: 0.95, uncommon: 1.18, rare: 1.25, epic: 0.95, legendary: 0.6 },
  high: { common: 0.55, uncommon: 0.9, rare: 1.35, epic: 1.65, legendary: 1.95 },
};

const CATEGORY_TIER_WEIGHTS: Record<LootTier, Record<LootCategory, number>> = {
  standard: {
    weapon: 20,
    ammo: 22,
    armor: 10,
    helmet: 10,
    backpack: 7,
    scope: 6,
    shield: 8,
    health: 10,
    special: 2,
    utility: 5,
  },
  medium: {
    weapon: 21,
    ammo: 16,
    armor: 11,
    helmet: 11,
    backpack: 8,
    scope: 8,
    shield: 8,
    health: 8,
    special: 3,
    utility: 6,
  },
  high: {
    weapon: 22,
    ammo: 12,
    armor: 12,
    helmet: 12,
    backpack: 9,
    scope: 10,
    shield: 8,
    health: 5,
    special: 3,
    utility: 7,
  },
};

export class LootSpawner {
  private nextInstanceCounter = 1;

  resetCounter(start = 1): void {
    this.nextInstanceCounter = start;
  }

  /**
   * Generates randomized spawn locations & items per match so every Battle Royale round
   * places weapons, ammo, armor, helmets, backpacks, medkits, and equipment in different spots.
   */
  rollRandomizedLootForPoints(
    lootPoints: readonly LootPoint[],
    spawnCenter: { x: number; z: number },
    seed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0),
  ): LootSpawnRequest[] {
    this.nextInstanceCounter = 1;
    let state = (seed ^ 0x9e3779b9) >>> 0;
    if (state === 0) state = 0x6d2b79f5;
    const rand = (): number => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };

    const shuffle = <T>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    };

    const requests: LootSpawnRequest[] = [];

    // 1. Randomized starter cluster near spawn pad (different items & radial positions each match)
    const starterCategories: LootCategory[] = [
      'weapon',
      'ammo',
      'armor',
      'helmet',
      'backpack',
      'scope',
      'health',
      'shield',
      'utility',
    ];
    shuffle(starterCategories);
    const starterAngleBase = rand() * Math.PI * 2;
    const starterCount = 6 + Math.floor(rand() * 2); // 6-7 starter items around drop pad
    for (let i = 0; i < starterCount; i++) {
      const cat = starterCategories[i % starterCategories.length];
      const def = this.pickWeightedItem(cat, rand() < 0.35 ? 'medium' : 'standard', rand);
      if (!def) continue;
      const angle = starterAngleBase + (i / starterCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const dist = 3.0 + rand() * 1.65;
      requests.push({
        definition: def,
        x: spawnCenter.x + Math.cos(angle) * dist,
        z: spawnCenter.z + Math.sin(angle) * dist,
        fallbackX: spawnCenter.x,
        fallbackZ: spawnCenter.z,
        quantity: 1,
      });
    }

    // 2. Partition all map LootPoints into building groups vs exterior areas
    const buildingGroups = new Map<string, LootPoint[]>();
    const exteriorPoints: LootPoint[] = [];

    for (let i = 0; i < lootPoints.length; i++) {
      const lp = lootPoints[i];
      if (lp.buildingStyle && lp.groupId) {
        let arr = buildingGroups.get(lp.groupId);
        if (!arr) {
          arr = [];
          buildingGroups.set(lp.groupId, arr);
        }
        arr.push(lp);
      } else {
        exteriorPoints.push(lp);
      }
    }

    // 3. For each building, randomly sample candidate interior sockets this match
    //    and guarantee accessible weapons, ammo, armor, helmets, backpacks, and medkits.
    const isDenseBuildingMap = buildingGroups.size > 95;
    buildingGroups.forEach((sockets) => {
      const shuffled = shuffle([...sockets]);
      const style = shuffled[0]?.buildingStyle ?? 'village_home';
      const minSpawns = isDenseBuildingMap
        ? (style === 'village_home' ? 3 : 4)
        : (style === 'village_home' ? 5 : 6);
      const ratio = isDenseBuildingMap
        ? 0.42 + rand() * 0.16
        : 0.65 + rand() * 0.22;
      const activeCount = Math.min(
        shuffled.length,
        Math.max(minSpawns, Math.round(shuffled.length * ratio)),
      );

      // Core 6 battle-royale survival categories guaranteed inside buildings
      const coreCats: LootCategory[] = shuffle([
        'weapon',
        'ammo',
        'armor',
        'helmet',
        'backpack',
        'health',
      ]);
      const guaranteedCats: LootCategory[] = [...coreCats];
      if (!isDenseBuildingMap) {
        if (style === 'military_base' || style === 'warehouse') {
          guaranteedCats.push(rand() < 0.5 ? 'armor' : 'helmet', 'scope', 'utility');
        } else if (style === 'luxury_villa' || style === 'apartment_block') {
          guaranteedCats.push('shield', 'scope', 'utility');
        }
      }

      for (let i = 0; i < activeCount; i++) {
        const lp = shuffled[i];
        const category =
          i < guaranteedCats.length
            ? guaranteedCats[i]
            : this.pickStyleAwareCategory(style, lp.tier, rand);

        let def: LootItemDefinition | null = null;
        if (category === 'weapon' && lp.preferredWeaponId && rand() < 0.35) {
          def = getLootDefinition(`weapon_${lp.preferredWeaponId}`) ?? null;
        }
        if (!def) {
          def = this.pickWeightedItem(category, lp.tier, rand);
        }

        if (def) {
          // Small safe interior jitter (always validated against colliders & floor elevation)
          const jitterAngle = rand() * Math.PI * 2;
          const jitterDist = rand() * 0.22;
          const spawnX = lp.x + Math.cos(jitterAngle) * jitterDist;
          const spawnZ = lp.z + Math.sin(jitterAngle) * jitterDist;

          requests.push({
            definition: def,
            x: spawnX,
            z: spawnZ,
            yHint: lp.yHint,
            fallbackX: lp.x,
            fallbackZ: lp.z,
            quantity: 1,
          });

          // Weapons have a chance to spawn matching ammunition beside them
          const ammoChance = isDenseBuildingMap ? 0.55 : 0.7;
          if (def.category === 'weapon' && rand() < ammoChance) {
            const ammoDef = this.pickMatchingAmmoForWeapon(def.weaponId);
            if (ammoDef) {
              const aAngle = rand() * Math.PI * 2;
              requests.push({
                definition: ammoDef,
                x: spawnX + Math.cos(aAngle) * 0.56,
                z: spawnZ + Math.sin(aAngle) * 0.56,
                yHint: lp.yHint,
                fallbackX: lp.x,
                fallbackZ: lp.z,
                quantity: 1,
              });
            }
          }
        }
      }
    });

    // 4. Exterior tactical compound/roadside sockets: randomly pick ~68% each match with safe fallback
    const shuffledExt = shuffle([...exteriorPoints]);
    const extCount = Math.min(
      shuffledExt.length,
      Math.max(4, Math.round(shuffledExt.length * (0.62 + rand() * 0.22))),
    );
    for (let i = 0; i < extCount; i++) {
      const lp = shuffledExt[i];
      const category = this.pickWeightedCategory(lp.tier, rand);
      let def: LootItemDefinition | null = null;
      if (
        category === 'weapon' &&
        lp.preferredWeaponId &&
        rand() < (lp.preferredWeaponId === 'awm' ? 0.55 : 0.34)
      ) {
        def = getLootDefinition(`weapon_${lp.preferredWeaponId}`) ?? null;
      }
      if (!def) {
        def = this.pickWeightedItem(category, lp.tier, rand);
      }
      if (!def) continue;

      const angle = rand() * Math.PI * 2;
      const dist = 0.2 + rand() * 0.6;
      const sx = lp.x + Math.cos(angle) * dist;
      const sz = lp.z + Math.sin(angle) * dist;
      requests.push({
        definition: def,
        x: sx,
        z: sz,
        yHint: lp.yHint,
        fallbackX: lp.x,
        fallbackZ: lp.z,
        quantity: 1,
      });

      if (def.category === 'weapon' && rand() < 0.6) {
        const ammoDef = this.pickMatchingAmmoForWeapon(def.weaponId);
        if (ammoDef) {
          requests.push({
            definition: ammoDef,
            x: sx + 0.6,
            z: sz - 0.5,
            yHint: lp.yHint,
            fallbackX: lp.x,
            fallbackZ: lp.z,
            quantity: 1,
          });
        }
      }
    }

    return requests;
  }

  createLootItem(
    definition: LootItemDefinition,
    x: number,
    groundY: number,
    z: number,
    quantity = 1,
    metadata: LootItemMetadata = {},
  ): LootItem {
    const id = `loot_${this.nextInstanceCounter++}`;
    return new LootItem(id, definition, x, groundY, z, quantity, metadata);
  }

  private pickMatchingAmmoForWeapon(weaponId?: string): LootItemDefinition | null {
    if (
      weaponId === 'm1887' ||
      weaponId === 'm1014' ||
      weaponId === 'spas12' ||
      weaponId === 'double_barrel'
    ) {
      return getLootDefinition('ammo_shotgun') ?? null;
    }
    if (
      weaponId === 'awm' ||
      weaponId === 'kar98k' ||
      weaponId === 'm24' ||
      weaponId === 'svd' ||
      weaponId === 'vss' ||
      weaponId === 'dragunov'
    ) {
      return getLootDefinition('ammo_sniper') ?? null;
    }
    if (
      weaponId === 'desert_eagle' ||
      weaponId === 'glock' ||
      weaponId === 'usp' ||
      weaponId === 'm1917'
    ) {
      return getLootDefinition('ammo_pistol') ?? null;
    }
    if (
      weaponId === 'ump' ||
      weaponId === 'mp5' ||
      weaponId === 'mp40' ||
      weaponId === 'vector' ||
      weaponId === 'p90' ||
      weaponId === 'thompson'
    ) {
      return getLootDefinition('ammo_smg') ?? null;
    }
    if (weaponId === 'combat_knife' || weaponId === 'baseball_bat') {
      return null;
    }
    return getLootDefinition('ammo_ar') ?? null;
  }

  private pickStyleAwareCategory(
    buildingStyle: string,
    tier: LootTier,
    rand: () => number,
  ): LootCategory {
    const base = { ...CATEGORY_TIER_WEIGHTS[tier] };
    if (buildingStyle === 'military_base') {
      base.weapon += 8;
      base.armor += 6;
      base.helmet += 6;
      base.scope += 5;
      base.backpack += 3;
      base.special += 3;
    } else if (buildingStyle === 'warehouse') {
      base.ammo += 6;
      base.backpack += 5;
      base.utility += 4;
      base.armor += 3;
    } else if (buildingStyle === 'luxury_villa') {
      base.helmet += 4;
      base.armor += 4;
      base.scope += 4;
      base.shield += 4;
      base.special += 3;
    } else {
      // houses, apartments, village homes, abandoned buildings
      base.health += 4;
      base.backpack += 4;
      base.helmet += 3;
    }

    const entries = Object.entries(base) as Array<[LootCategory, number]>;
    let total = 0;
    for (let i = 0; i < entries.length; i++) total += entries[i][1];
    let roll = rand() * total;
    for (let i = 0; i < entries.length; i++) {
      roll -= entries[i][1];
      if (roll <= 0) return entries[i][0];
    }
    return 'weapon';
  }

  private pickWeightedCategory(tier: LootTier, rand: () => number): LootCategory {
    const weights = CATEGORY_TIER_WEIGHTS[tier];
    const entries = Object.entries(weights) as Array<[LootCategory, number]>;
    let total = 0;
    for (let i = 0; i < entries.length; i++) {
      total += entries[i][1];
    }

    let roll = rand() * total;
    for (let i = 0; i < entries.length; i++) {
      roll -= entries[i][1];
      if (roll <= 0) return entries[i][0];
    }
    return 'weapon';
  }

  private pickWeightedItem(
    category: LootCategory,
    tier: LootTier,
    rand: () => number,
  ): LootItemDefinition | null {
    const all = getAllLootDefinitions().filter((d) => d.category === category);
    if (all.length === 0) return null;

    const tierMult = RARITY_TIER_MULTIPLIER[tier];
    let total = 0;
    const weights: number[] = [];

    for (let i = 0; i < all.length; i++) {
      const w = Math.max(0.1, all[i].spawnWeight * tierMult[all[i].rarity]);
      weights.push(w);
      total += w;
    }

    let roll = rand() * total;
    for (let i = 0; i < all.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return all[i];
    }
    return all[0];
  }
}
