import type { SpawnPoint } from './IMapSystem';

export interface SpawnPointSpec {
  id: string;
  x: number;
  z: number;
  yaw: number;
  zoneTag: string;
  isPrimary?: boolean;
}

export class SpawnPointManager {
  private points: SpawnPoint[] = [];
  private primaryIndex = 0;

  load(
    specs: readonly SpawnPointSpec[],
    getGroundHeightAt: (x: number, z: number) => number,
  ): void {
    this.points = specs.map((s) => ({
      id: s.id,
      x: s.x,
      y: getGroundHeightAt(s.x, s.z),
      z: s.z,
      yaw: s.yaw,
      zoneTag: s.zoneTag,
    }));

    const foundPrimary = specs.findIndex((s) => s.isPrimary);
    this.primaryIndex = foundPrimary >= 0 ? foundPrimary : 0;
  }

  getAll(): readonly SpawnPoint[] {
    return this.points;
  }

  getPrimarySpawn(): SpawnPoint {
    return (
      this.points[this.primaryIndex] ?? {
        id: 'fallback-spawn',
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        zoneTag: 'center',
      }
    );
  }

  getRandomSpawn(): SpawnPoint {
    if (this.points.length === 0) return this.getPrimarySpawn();
    const idx = Math.floor(Math.random() * this.points.length);
    return this.points[idx];
  }

  getDistributedSpawns(count: number): SpawnPoint[] {
    if (this.points.length === 0) return [];
    const result: SpawnPoint[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.points[i % this.points.length]);
    }
    return result;
  }

  clear(): void {
    this.points = [];
    this.primaryIndex = 0;
  }
}
