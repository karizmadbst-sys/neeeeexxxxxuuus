import type * as THREE from 'three';
import { i18n } from '../i18n/I18nManager';
import type { LootCategory, LootRarity } from './ILootSystem';
import type { LootItem } from './LootItem';

export interface PickupPromptSnapshot {
  instanceId: string;
  itemName: string;
  category: LootCategory;
  rarity: LootRarity;
  quantity: number;
  iconTag: string;
  accentHex: string;
  desktopPrompt: string;
  mobilePrompt: string;
}

export class PickupSystem {
  readonly pickupRadius: number;

  constructor(pickupRadius = 3.15) {
    this.pickupRadius = pickupRadius;
  }

  findNearest(
    playerPos: THREE.Vector3,
    items: readonly LootItem[],
    hasLineOfSight?: (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
    ) => boolean,
  ): LootItem | null {
    let best: LootItem | null = null;
    let bestDistSq = this.pickupRadius * this.pickupRadius;
    const eyeY = playerPos.y + 0.95;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.collected) continue;
      if (Math.abs(item.root.position.y - playerPos.y) > 1.65) continue;
      const dSq = item.distanceToSq(playerPos);
      if (dSq >= bestDistSq) continue;
      if (
        hasLineOfSight &&
        !hasLineOfSight(
          playerPos.x,
          eyeY,
          playerPos.z,
          item.root.position.x,
          item.root.position.y + 0.35,
          item.root.position.z,
        )
      ) {
        continue;
      }
      bestDistSq = dSq;
      best = item;
    }

    return best;
  }

  buildPrompt(
    nearest: LootItem | null,
    pickupKeyCode: string,
  ): PickupPromptSnapshot | null {
    if (!nearest) return null;
    const keyLabel = i18n.translateBindingCode(pickupKeyCode);
    const localizedName = i18n.translateLootName(
      nearest.definition.id,
      nearest.definition.name,
    );
    const qtySuffix = nearest.quantity > 1 ? ` ×${nearest.quantity}` : '';
    const displayName = `${localizedName}${qtySuffix}`;

    return {
      instanceId: nearest.instanceId,
      itemName: displayName,
      category: nearest.definition.category,
      rarity: nearest.definition.rarity,
      quantity: nearest.quantity,
      iconTag: nearest.definition.iconTag,
      accentHex: nearest.definition.accentHex,
      desktopPrompt: i18n.t('interact.pickup.desktop', {
        key: keyLabel,
        item: displayName,
      }),
      mobilePrompt: i18n.t('interact.pickup.mobile', {
        item: displayName,
      }),
    };
  }
}
