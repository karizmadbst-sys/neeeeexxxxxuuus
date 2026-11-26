export interface SafeZoneState {
  phaseIndex: number;
  currentCenterX: number;
  currentCenterZ: number;
  currentRadius: number;
  targetCenterX: number;
  targetCenterZ: number;
  targetRadius: number;
  damagePerSecond: number;
  isShrinking: boolean;
}

export interface IZoneSystem {
  getState(): SafeZoneState;
  update(deltaSeconds: number): void;
  isInsideSafeZone(x: number, z: number): boolean;
  dispose(): void;
}
