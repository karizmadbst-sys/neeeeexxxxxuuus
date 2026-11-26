import { clamp } from '../utils/MathUtils';
import type { WeaponDefinition } from './WeaponData';

export interface RecoilKickOutput {
  yawRad: number;
  pitchRad: number;
}

const DEG_TO_RAD = Math.PI / 180;

export class RecoilSystem {
  private bloomDeg = 0;
  private accumVerticalDeg = 0;
  private shotIndex = 0;

  applyShot(
    weapon: WeaponDefinition,
    isAiming: boolean,
    outKick: RecoilKickOutput,
  ): void {
    const adsScale = isAiming ? weapon.recoil.adsMultiplier : 1.0;

    // Slight alternating horizontal kick pattern for realistic weapon handling
    const sideSign = (this.shotIndex % 2 === 0 ? 1 : -1) * (0.45 + Math.random() * 0.55);
    this.shotIndex += 1;

    const vertDeg = weapon.recoil.verticalKickDeg * adsScale * (0.9 + Math.random() * 0.22);
    const horizDeg = weapon.recoil.horizontalKickDeg * adsScale * sideSign;

    this.accumVerticalDeg = clamp(this.accumVerticalDeg + vertDeg, 0, 14);
    this.bloomDeg = clamp(
      this.bloomDeg + weapon.spread.bloomPerShotDeg * (isAiming ? 0.72 : 1.0),
      0,
      weapon.spread.maxBloomDeg,
    );

    outKick.pitchRad = -vertDeg * DEG_TO_RAD;
    outKick.yawRad = horizDeg * DEG_TO_RAD;
  }

  getBloomDeg(): number {
    return this.bloomDeg;
  }

  getRecoilClimbDeg(): number {
    return this.accumVerticalDeg;
  }

  update(deltaSeconds: number, weapon: WeaponDefinition | null): void {
    const decayRate = weapon ? weapon.spread.bloomDecayPerSec : 8.0;
    const recoverySpeed = weapon ? weapon.recoil.recoverySpeed : 10.0;

    if (this.bloomDeg > 0) {
      this.bloomDeg = Math.max(0, this.bloomDeg - decayRate * deltaSeconds);
    }
    if (this.accumVerticalDeg > 0) {
      this.accumVerticalDeg *= Math.exp(-recoverySpeed * 0.5 * deltaSeconds);
      if (this.accumVerticalDeg < 0.01) {
        this.accumVerticalDeg = 0;
      }
    }
  }

  reset(): void {
    this.bloomDeg = 0;
    this.accumVerticalDeg = 0;
    this.shotIndex = 0;
  }
}
