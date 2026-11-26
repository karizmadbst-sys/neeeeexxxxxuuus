import type { LootPoint, LootTier } from './IMapSystem';

export interface LootPointSpec {
  id: string;
  x: number;
  z: number;
  yHint?: number;
  tier: LootTier;
  areaName: string;
  preferredWeaponId?: string;
  groupId?: string;
  buildingStyle?: string;
}

export class LootPointManager {
  private points: LootPoint[] = [];

  load(
    specs: readonly LootPointSpec[],
    getGroundHeightAt: (x: number, z: number, currentY?: number) => number,
  ): void {
    this.points = specs.map((s) => ({
      id: s.id,
      x: s.x,
      y: getGroundHeightAt(s.x, s.z, s.yHint !== undefined ? s.yHint + 0.6 : undefined),
      z: s.z,
      yHint: s.yHint,
      tier: s.tier,
      areaName: s.areaName,
      preferredWeaponId: s.preferredWeaponId,
      groupId: s.groupId,
      buildingStyle: s.buildingStyle,
    }));
  }

  getAll(): readonly LootPoint[] {
    return this.points;
  }

  getByTier(tier: LootTier): LootPoint[] {
    return this.points.filter((p) => p.tier === tier);
  }

  getByArea(areaName: string): LootPoint[] {
    return this.points.filter((p) => p.areaName === areaName);
  }

  clear(): void {
    this.points = [];
  }
}
