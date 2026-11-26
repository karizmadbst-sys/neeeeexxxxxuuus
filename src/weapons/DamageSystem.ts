import type { AbilityModifiers } from '../characters/CharacterAbility';
import { clamp } from '../utils/MathUtils';
import type { WeaponDefinition } from './WeaponData';

export type RangeBand = 'CLOSE' | 'MEDIUM' | 'LONG';

export interface DamageCalculationInput {
  weapon: WeaponDefinition;
  distance: number;
  isHeadshot: boolean;
  attackerModifiers?: Readonly<Partial<AbilityModifiers>>;
  targetShield?: number;
  targetDamageReductionPct?: number;
  pelletsHit?: number;
}

export interface DamageCalculationResult {
  totalDamage: number;
  shieldDamage: number;
  healthDamage: number;
  falloffMultiplier: number;
  rangeBand: RangeBand;
  isHeadshot: boolean;
}

export class DamageSystem {
  static computeFalloff(
    weapon: WeaponDefinition,
    distance: number,
  ): { multiplier: number; band: RangeBand } {
    const { closeRange, mediumRange, mediumDamageRatio, longDamageRatio } = weapon.falloff;
    const maxRange = Math.max(mediumRange + 1, weapon.range);

    if (distance <= closeRange) {
      return { multiplier: 1.0, band: 'CLOSE' };
    }

    if (distance <= mediumRange) {
      const t = (distance - closeRange) / Math.max(0.001, mediumRange - closeRange);
      return {
        multiplier: 1.0 + (mediumDamageRatio - 1.0) * clamp(t, 0, 1),
        band: 'MEDIUM',
      };
    }

    if (distance <= maxRange) {
      const t = (distance - mediumRange) / Math.max(0.001, maxRange - mediumRange);
      return {
        multiplier: mediumDamageRatio + (longDamageRatio - mediumDamageRatio) * clamp(t, 0, 1),
        band: 'LONG',
      };
    }

    const overT = clamp((distance - maxRange) / Math.max(5, maxRange * 0.4), 0, 1);
    return {
      multiplier: longDamageRatio * (1 - overT * 0.5),
      band: 'LONG',
    };
  }

  static computeDamage(input: DamageCalculationInput): DamageCalculationResult {
    const { weapon, distance, isHeadshot, attackerModifiers } = input;
    const { multiplier, band } = DamageSystem.computeFalloff(weapon, distance);

    const base = isHeadshot
      ? Math.max(weapon.headshotDamage, Math.round(weapon.damage * weapon.criticalMultiplier))
      : weapon.damage;

    const pellets = Math.max(1, Math.round(input.pelletsHit ?? 1));
    let rawDamage = base * multiplier * pellets;

    // Target defensive reduction
    const reductionPct = clamp(input.targetDamageReductionPct ?? 0, 0, 75);
    rawDamage *= 1 - reductionPct / 100;

    const currentShield = Math.max(0, input.targetShield ?? 0);
    const shieldDmgMult = attackerModifiers?.shieldDamageMultiplier ?? 1.0;
    const shieldPenPct = clamp(attackerModifiers?.shieldPenetrationPct ?? 0, 0, 100);

    let shieldDamage = 0;
    let healthDamage = 0;

    if (currentShield > 0) {
      const penetratingHealth = rawDamage * (shieldPenPct / 100);
      const shieldPortion = (rawDamage - penetratingHealth) * shieldDmgMult;
      shieldDamage = Math.min(currentShield, shieldPortion);
      const overflow = Math.max(0, shieldPortion - currentShield) / Math.max(0.01, shieldDmgMult);
      healthDamage = penetratingHealth + overflow;
    } else {
      healthDamage = rawDamage;
    }

    const roundedShield = Math.max(0, Math.round(shieldDamage));
    const roundedHealth = Math.max(0, Math.round(healthDamage));

    return {
      totalDamage: Math.max(1, roundedShield + roundedHealth),
      shieldDamage: roundedShield,
      healthDamage: roundedHealth,
      falloffMultiplier: multiplier,
      rangeBand: band,
      isHeadshot,
    };
  }
}
