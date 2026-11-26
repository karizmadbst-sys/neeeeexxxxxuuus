export const MATCH_PLAYER_MAX_HEALTH = 200;

export interface PlayerStatsConfig {
  maxHealth?: number;
  maxShield?: number;
  movementSpeed?: number;
  sprintSpeed?: number;
  jumpForce?: number;
}

export class PlayerStats {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  movementSpeed: number;
  sprintSpeed: number;
  jumpForce: number;
  damageMitigationPct = 0;
  isAlive: boolean;
  isSprinting: boolean;

  constructor(config: PlayerStatsConfig = {}) {
    this.maxHealth = config.maxHealth ?? MATCH_PLAYER_MAX_HEALTH;
    this.health = this.maxHealth;
    this.maxShield = config.maxShield ?? 100;
    this.shield = 50;
    this.movementSpeed = config.movementSpeed ?? 5.2;
    this.sprintSpeed = config.sprintSpeed ?? 8.6;
    this.jumpForce = config.jumpForce ?? 8.4;
    this.isAlive = true;
    this.isSprinting = false;
  }

  takeDamage(amount: number): void {
    if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) return;

    const mitigation = Math.min(0.7, Math.max(0, this.damageMitigationPct / 100));
    let remaining = Math.max(0, amount * (1 - mitigation));
    if (remaining <= 0) return;

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield = Math.max(0, this.shield - absorbed);
      remaining -= absorbed;
    }

    if (remaining > 0) {
      this.health = Math.max(0, this.health - remaining);
      if (this.health <= 0) {
        this.health = 0;
        this.isAlive = false;
        this.isSprinting = false;
      }
    }
  }

  /**
   * Applies pre-computed combat damage (shield + health already adjusted for armor/mitigation
   * and shield penetration/multipliers) without double-applying mitigation.
   */
  applyDamageResult(result: {
    shieldDamage: number;
    healthDamage: number;
  }): { shieldDamage: number; healthDamage: number; totalDamage: number } {
    if (!this.isAlive) {
      return { shieldDamage: 0, healthDamage: 0, totalDamage: 0 };
    }

    const reqShield = Number.isFinite(result.shieldDamage) ? Math.max(0, result.shieldDamage) : 0;
    const reqHealth = Number.isFinite(result.healthDamage) ? Math.max(0, result.healthDamage) : 0;

    const prevShield = this.shield;
    const prevHealth = this.health;

    const shieldAbsorbed = Math.min(this.shield, reqShield);
    this.shield = Math.max(0, this.shield - shieldAbsorbed);

    const overflow = Math.max(0, reqShield - shieldAbsorbed);
    const totalHealthHit = reqHealth + overflow;
    if (totalHealthHit > 0) {
      this.health = Math.max(0, this.health - totalHealthHit);
      if (this.health <= 0) {
        this.health = 0;
        this.isAlive = false;
        this.isSprinting = false;
      }
    }

    const actualShield = Math.max(0, prevShield - this.shield);
    const actualHealth = Math.max(0, prevHealth - this.health);
    return {
      shieldDamage: Math.round(actualShield),
      healthDamage: Math.round(actualHealth),
      totalDamage: Math.round(actualShield + actualHealth),
    };
  }

  /**
   * Applies direct health damage that bypasses shield and armor mitigation (e.g., Safe Zone storm).
   */
  takeDirectHealthDamage(amount: number): number {
    if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) return 0;
    const prevHealth = this.health;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.health = 0;
      this.isAlive = false;
      this.isSprinting = false;
    }
    return prevHealth - this.health;
  }

  heal(amount: number): void {
    if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addShield(amount: number): void {
    if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) return;
    this.shield = Math.min(this.maxShield, this.shield + amount);
  }

  reset(): void {
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.isAlive = true;
    this.isSprinting = false;
  }
}
