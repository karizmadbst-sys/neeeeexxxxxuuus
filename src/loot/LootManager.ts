import * as THREE from 'three';
import type { QualityPreset, Subsystem } from '../core/Types';
import type { LootPoint } from '../maps/IMapSystem';
import type { PlayerCollisionWorld } from '../player/IPlayerController';
import type { ILootSystem } from './ILootSystem';
import { getLootDefinition } from './LootData';
import { LootItem, type LootItemMetadata } from './LootItem';
import { LootSpawner } from './LootSpawner';
import { PickupSystem, type PickupPromptSnapshot } from './PickupSystem';

const LOOT_CELL_SIZE = 16;
const LOOT_GRID_OFFSET = 512;
const LOOT_GRID_STRIDE = 1024;

export class LootManager implements Subsystem, ILootSystem {
  readonly root = new THREE.Group();
  readonly spawner = new LootSpawner();
  readonly pickupSystem = new PickupSystem(3.15);

  private readonly items: LootItem[] = [];
  private readonly itemById = new Map<string, LootItem>();
  private readonly visibleItems: LootItem[] = [];
  private readonly lootGrid = new Map<number, LootItem[]>();
  private readonly nearbyCandidates: LootItem[] = [];
  private readonly scratchPos = new THREE.Vector3();
  private nearestLoot: LootItem | null = null;
  private readonly losCheckerBound?: (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ) => boolean;

  private lastCullX = Number.NaN;
  private lastCullZ = Number.NaN;
  private cullRefreshAccum = 0;
  private animAccum = 0;
  private visibilityDirty = true;
  private animateRangeSq = 42 * 42;
  private visibleRangeSq = 100 * 100;

  constructor(
    private readonly world: PlayerCollisionWorld,
    private readonly compactMode = false,
  ) {
    this.losCheckerBound = this.world.hasLootLineOfSight
      ? (ax: number, ay: number, az: number, bx: number, by: number, bz: number) =>
          this.world.hasLootLineOfSight!(ax, ay, az, bx, by, bz)
      : undefined;
    this.setQualityPreset(compactMode ? 'low' : 'medium');
  }

  setQualityPreset(quality: QualityPreset): void {
    if (quality === 'low') {
      this.animateRangeSq = 18 * 18;
      this.visibleRangeSq = 40 * 40;
    } else if (quality === 'medium') {
      const anim = this.compactMode ? 24 : 32;
      const vis = this.compactMode ? 58 : 78;
      this.animateRangeSq = anim * anim;
      this.visibleRangeSq = vis * vis;
    } else {
      const anim = this.compactMode ? 32 : 44;
      const vis = this.compactMode ? 80 : 102;
      this.animateRangeSq = anim * anim;
      this.visibleRangeSq = vis * vis;
    }
    this.visibilityDirty = true;
  }

  private cellKey(gx: number, gz: number): number {
    return (gx + LOOT_GRID_OFFSET) * LOOT_GRID_STRIDE + (gz + LOOT_GRID_OFFSET);
  }

  private insertItemToGrid(item: LootItem): void {
    const gx = Math.floor(item.root.position.x / LOOT_CELL_SIZE);
    const gz = Math.floor(item.root.position.z / LOOT_CELL_SIZE);
    const key = this.cellKey(gx, gz);
    let arr = this.lootGrid.get(key);
    if (!arr) {
      arr = [];
      this.lootGrid.set(key, arr);
    }
    arr.push(item);
  }

  private removeItemFromGrid(item: LootItem): void {
    const gx = Math.floor(item.root.position.x / LOOT_CELL_SIZE);
    const gz = Math.floor(item.root.position.z / LOOT_CELL_SIZE);
    const arr = this.lootGrid.get(this.cellKey(gx, gz));
    if (!arr) return;
    const idx = arr.indexOf(item);
    if (idx !== -1) {
      arr[idx] = arr[arr.length - 1];
      arr.pop();
    }
  }

  spawnInitialLoot(
    seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
  ): void {
    this.spawnForMapPoints([], { x: 0, z: 0 }, seed);
  }

  spawnForMapPoints(
    lootPoints: readonly LootPoint[],
    spawnCenter: { x: number; z: number },
    seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
  ): void {
    this.clearAll();
    const requests = this.spawner.rollRandomizedLootForPoints(lootPoints, spawnCenter, seed);
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      let sx = req.x;
      let sz = req.z;
      let sy: number;

      if (this.world.resolveSafeLootPosition) {
        const ok = this.world.resolveSafeLootPosition(
          req.x,
          req.z,
          req.yHint,
          this.scratchPos,
          req.fallbackX,
          req.fallbackZ,
        );
        if (!ok) continue;
        sx = this.scratchPos.x;
        sy = this.scratchPos.y;
        sz = this.scratchPos.z;
      } else {
        sy = this.world.getGroundHeightAt(
          req.x,
          req.z,
          req.yHint !== undefined ? req.yHint + 0.6 : undefined,
        );
      }

      const item = this.spawner.createLootItem(
        req.definition,
        sx,
        sy,
        sz,
        req.quantity,
        req.metadata,
      );
      this.items.push(item);
      this.itemById.set(item.instanceId, item);
      this.insertItemToGrid(item);
      this.root.add(item.root);
    }
    this.visibilityDirty = true;
  }

  spawnDroppedItem(
    lootItemId: string,
    x: number,
    z: number,
    quantity = 1,
    metadata: LootItemMetadata = {},
    currentY?: number,
    fallbackX?: number,
    fallbackZ?: number,
  ): LootItem | null {
    const def = getLootDefinition(lootItemId);
    if (!def) return null;

    let sx = x;
    let sz = z;
    let sy: number;
    if (this.world.resolveSafeLootPosition) {
      this.world.resolveSafeLootPosition(
        x,
        z,
        currentY,
        this.scratchPos,
        fallbackX ?? x,
        fallbackZ ?? z,
      );
      sx = this.scratchPos.x;
      sy = this.scratchPos.y;
      sz = this.scratchPos.z;
    } else {
      sy = this.world.getGroundHeightAt(
        x,
        z,
        currentY !== undefined ? currentY + 0.5 : undefined,
      );
    }

    const item = this.spawner.createLootItem(def, sx, sy, sz, quantity, metadata);
    this.items.push(item);
    this.itemById.set(item.instanceId, item);
    this.insertItemToGrid(item);
    this.root.add(item.root);
    this.visibilityDirty = true;
    return item;
  }

  spawnSyncedDroppedItem(
    forcedId: string,
    lootItemId: string,
    x: number,
    y: number,
    z: number,
    quantity = 1,
    metadata: LootItemMetadata = {},
  ): LootItem | null {
    if (this.itemById.has(forcedId)) return null;
    const def = getLootDefinition(lootItemId);
    if (!def) return null;

    const groundY = Number.isFinite(y)
      ? y
      : this.world.getGroundHeightAt(x, z);
    const item = new LootItem(forcedId, def, x, groundY, z, quantity, metadata);
    this.items.push(item);
    this.itemById.set(item.instanceId, item);
    this.insertItemToGrid(item);
    this.root.add(item.root);
    this.visibilityDirty = true;
    return item;
  }

  collectNode(nodeId: string, _collectorId: string): boolean {
    const item = this.itemById.get(nodeId);
    if (!item || item.collected) return false;
    item.collected = true;
    this.itemById.delete(nodeId);
    this.root.remove(item.root);
    this.removeItemFromGrid(item);
    item.dispose();

    const idx = this.items.indexOf(item);
    if (idx !== -1) {
      this.items[idx] = this.items[this.items.length - 1];
      this.items.pop();
    }
    const visIdx = this.visibleItems.indexOf(item);
    if (visIdx !== -1) {
      this.visibleItems[visIdx] = this.visibleItems[this.visibleItems.length - 1];
      this.visibleItems.pop();
    }
    if (this.nearestLoot?.instanceId === nodeId) {
      this.nearestLoot = null;
    }
    return true;
  }

  getLootItemById(nodeId: string): LootItem | null {
    const item = this.itemById.get(nodeId);
    if (!item || item.collected) return null;
    return item;
  }

  getNearestLoot(playerPos: THREE.Vector3): LootItem | null {
    const r = this.pickupSystem.pickupRadius + 0.5;
    const minGx = Math.floor((playerPos.x - r) / LOOT_CELL_SIZE);
    const maxGx = Math.floor((playerPos.x + r) / LOOT_CELL_SIZE);
    const minGz = Math.floor((playerPos.z - r) / LOOT_CELL_SIZE);
    const maxGz = Math.floor((playerPos.z + r) / LOOT_CELL_SIZE);

    const cand = this.nearbyCandidates;
    cand.length = 0;
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const list = this.lootGrid.get(this.cellKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          cand.push(list[i]);
        }
      }
    }

    this.nearestLoot = this.pickupSystem.findNearest(playerPos, cand, this.losCheckerBound);
    return this.nearestLoot;
  }

  getPromptSnapshot(
    playerPos: THREE.Vector3,
    pickupKeyCode: string,
  ): PickupPromptSnapshot | null {
    const nearest = this.getNearestLoot(playerPos);
    return this.pickupSystem.buildPrompt(nearest, pickupKeyCode);
  }

  getLootItemsInRadius(x: number, z: number, radius: number, out: LootItem[]): LootItem[] {
    out.length = 0;
    const minGx = Math.floor((x - radius) / LOOT_CELL_SIZE);
    const maxGx = Math.floor((x + radius) / LOOT_CELL_SIZE);
    const minGz = Math.floor((z - radius) / LOOT_CELL_SIZE);
    const maxGz = Math.floor((z + radius) / LOOT_CELL_SIZE);
    const rSq = radius * radius;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const list = this.lootGrid.get(this.cellKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          if (item.collected) continue;
          const dx = item.root.position.x - x;
          const dz = item.root.position.z - z;
          if (dx * dx + dz * dz <= rSq) {
            out.push(item);
          }
        }
      }
    }
    return out;
  }

  getActiveLootCount(): number {
    return this.items.length;
  }

  update(deltaSeconds: number, elapsedSeconds: number, playerPos?: THREE.Vector3): void {
    if (this.items.length === 0) return;

    const animateRangeSq = this.animateRangeSq;
    const visibleRangeSq = this.visibleRangeSq;

    if (!playerPos) {
      if (this.visibilityDirty) {
        for (let i = 0; i < this.items.length; i++) {
          this.items[i].root.visible = true;
        }
        this.visibilityDirty = false;
      }
      return;
    }

    this.cullRefreshAccum += deltaSeconds;
    const movedFar =
      Number.isNaN(this.lastCullX) ||
      (playerPos.x - this.lastCullX) * (playerPos.x - this.lastCullX) +
        (playerPos.z - this.lastCullZ) * (playerPos.z - this.lastCullZ) >=
        10.0;

    if (this.visibilityDirty || movedFar || this.cullRefreshAccum >= 0.16) {
      this.lastCullX = playerPos.x;
      this.lastCullZ = playerPos.z;
      this.cullRefreshAccum = 0;
      this.visibilityDirty = false;
      this.visibleItems.length = 0;

      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        const dx = item.root.position.x - playerPos.x;
        const dz = item.root.position.z - playerPos.z;
        const distSq = dx * dx + dz * dz;
        const visible = distSq <= visibleRangeSq;
        item.root.visible = visible;
        if (visible) {
          this.visibleItems.push(item);
        }
      }
    }

    this.animAccum += deltaSeconds;
    if (this.animAccum < 0.033) return;
    this.animAccum = 0;

    for (let i = 0; i < this.visibleItems.length; i++) {
      const item = this.visibleItems[i];
      const dx = item.root.position.x - playerPos.x;
      const dz = item.root.position.z - playerPos.z;
      if (dx * dx + dz * dz <= animateRangeSq) {
        item.update(elapsedSeconds);
      }
    }
  }

  clearAll(): void {
    for (let i = 0; i < this.items.length; i++) {
      this.root.remove(this.items[i].root);
      this.items[i].dispose();
    }
    this.items.length = 0;
    this.itemById.clear();
    this.visibleItems.length = 0;
    this.lootGrid.clear();
    this.nearbyCandidates.length = 0;
    this.nearestLoot = null;
    this.lastCullX = Number.NaN;
    this.lastCullZ = Number.NaN;
    this.visibilityDirty = true;
  }

  dispose(): void {
    this.clearAll();
  }
}
