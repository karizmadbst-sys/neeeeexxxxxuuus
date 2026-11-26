import { clamp } from '../utils/MathUtils';
import type { Weapon } from './Weapon';

export class ReloadSystem {
  private reloading = false;
  private elapsed = 0;
  private duration = 0;
  private weaponId: string | null = null;

  startReload(weapon: Weapon, reloadSpeedMultiplier = 1): boolean {
    if (this.reloading) return false;
    if (!weapon.needsReload()) return false;

    const speedMult = clamp(reloadSpeedMultiplier, 0.5, 3.0);
    this.reloading = true;
    this.elapsed = 0;
    this.duration = Math.max(0.35, weapon.definition.reloadTime / speedMult);
    this.weaponId = weapon.definition.id;
    return true;
  }

  cancelReload(): void {
    this.reloading = false;
    this.elapsed = 0;
    this.duration = 0;
    this.weaponId = null;
  }

  isReloading(): boolean {
    return this.reloading;
  }

  getProgress(): number {
    if (!this.reloading || this.duration <= 0) return 0;
    return clamp(this.elapsed / this.duration, 0, 1);
  }

  getRemainingSeconds(): number {
    if (!this.reloading) return 0;
    return Math.max(0, this.duration - this.elapsed);
  }

  getDurationSeconds(): number {
    return this.duration;
  }

  /**
   * Advances reload timer. Returns true on the exact frame the reload completes.
   */
  update(deltaSeconds: number, activeWeapon: Weapon | null): boolean {
    if (!this.reloading) return false;

    if (!activeWeapon || activeWeapon.definition.id !== this.weaponId) {
      this.cancelReload();
      return false;
    }

    this.elapsed += deltaSeconds;
    if (this.elapsed >= this.duration) {
      activeWeapon.applyReload();
      this.cancelReload();
      return true;
    }

    return false;
  }
}
