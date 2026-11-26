import type { Subsystem } from '../core/Types';
import { MATCH_PLAYER_MAX_HEALTH, type PlayerStats } from '../player/PlayerStats';
import {
  ABILITY_REGISTRY,
  type AbilityDefinition,
  type AbilityModifiers,
} from './CharacterAbility';
import type { CharacterDefinition } from './CharacterData';

export interface AbilityRuntimeSnapshot {
  activeAbilityName: string;
  passiveAbilityName: string;
  status: 'ready' | 'active' | 'cooldown';
  activeRemaining: number;
  activeDuration: number;
  cooldownRemaining: number;
  cooldownDuration: number;
  computedModifiers: Required<AbilityModifiers>;
}

export class AbilityManager implements Subsystem {
  private readonly registry = new Map<string, AbilityDefinition>();

  private activeCharacter: CharacterDefinition | null = null;
  private activeAbility: AbilityDefinition | null = null;
  private passiveAbility: AbilityDefinition | null = null;

  private activeRemaining = 0;
  private cooldownRemaining = 0;

  private baseMoveSpeed = 5.2;
  private baseSprintSpeed = 8.6;
  private externalModifiers: Partial<AbilityModifiers> = {};

  private readonly computedModifiers: Required<AbilityModifiers> = {
    bonusMaxHealth: 0,
    moveSpeedMultiplier: 1,
    sprintSpeedMultiplier: 1,
    shieldPenetrationPct: 0,
    shieldDamageMultiplier: 1,
    damageReductionPct: 0,
    reloadSpeedMultiplier: 1,
    accuracyBonusPct: 0,
    healthRegenPerSec: 0,
    shieldRegenPerSec: 0,
    enemyDetectionRadius: 0,
    enemySlowPct: 0,
    enemySlowRadius: 0,
    instantShieldRestore: 0,
    instantHealthRestore: 0,
  };

  constructor() {
    for (const def of Object.values(ABILITY_REGISTRY)) {
      this.registry.set(def.id, def);
    }
  }

  /**
   * Allows registering new data-driven abilities at runtime without touching PlayerController.
   */
  registerAbility(def: AbilityDefinition): void {
    this.registry.set(def.id, def);
  }

  getAbility(id: string): AbilityDefinition | undefined {
    return this.registry.get(id);
  }

  setExternalModifiers(mods: Partial<AbilityModifiers>, stats: PlayerStats): void {
    const changed =
      this.externalModifiers.bonusMaxHealth !== mods.bonusMaxHealth ||
      this.externalModifiers.moveSpeedMultiplier !== mods.moveSpeedMultiplier ||
      this.externalModifiers.sprintSpeedMultiplier !== mods.sprintSpeedMultiplier ||
      this.externalModifiers.shieldPenetrationPct !== mods.shieldPenetrationPct ||
      this.externalModifiers.shieldDamageMultiplier !== mods.shieldDamageMultiplier ||
      this.externalModifiers.damageReductionPct !== mods.damageReductionPct ||
      this.externalModifiers.reloadSpeedMultiplier !== mods.reloadSpeedMultiplier ||
      this.externalModifiers.accuracyBonusPct !== mods.accuracyBonusPct ||
      this.externalModifiers.healthRegenPerSec !== mods.healthRegenPerSec ||
      this.externalModifiers.shieldRegenPerSec !== mods.shieldRegenPerSec ||
      this.externalModifiers.enemyDetectionRadius !== mods.enemyDetectionRadius;

    if (!changed) return;
    this.externalModifiers = { ...mods };
    this.recomputeModifiers();
    this.applyStatsBaseline(stats, false);
  }

  equipCharacter(character: CharacterDefinition, stats: PlayerStats): void {
    this.activeCharacter = character;
    this.activeAbility = this.registry.get(character.ability) ?? null;
    this.passiveAbility = this.registry.get(character.passiveAbility) ?? null;
    this.activeRemaining = 0;
    this.cooldownRemaining = 0;

    this.baseMoveSpeed = character.movementSpeed;
    this.baseSprintSpeed = Number((character.movementSpeed * 1.65).toFixed(2));

    this.recomputeModifiers();
    this.applyStatsBaseline(stats, true);
  }

  resetCooldowns(stats: PlayerStats): void {
    this.activeRemaining = 0;
    this.cooldownRemaining = 0;
    this.recomputeModifiers();
    this.applyStatsBaseline(stats, true);
  }

  triggerActiveAbility(stats: PlayerStats): boolean {
    if (!this.activeCharacter || !this.activeAbility || !stats.isAlive) {
      return false;
    }
    if (this.activeRemaining > 0 || this.cooldownRemaining > 0) {
      return false;
    }

    this.activeRemaining = this.activeCharacter.abilityDuration;
    this.cooldownRemaining = 0;
    this.recomputeModifiers();
    this.applyStatsBaseline(stats, false);

    // Apply instant burst effects from data-driven active modifiers
    const mods = this.activeAbility.modifiers;
    if (mods.instantHealthRestore && mods.instantHealthRestore > 0) {
      stats.heal(mods.instantHealthRestore);
    }
    if (mods.instantShieldRestore && mods.instantShieldRestore > 0) {
      stats.addShield(mods.instantShieldRestore);
    }

    return true;
  }

  update(deltaSeconds: number, stats: PlayerStats): void {
    if (!this.activeCharacter) return;

    let modifiersDirty = false;

    if (this.activeRemaining > 0) {
      this.activeRemaining -= deltaSeconds;
      if (this.activeRemaining <= 0) {
        this.activeRemaining = 0;
        this.cooldownRemaining = this.activeCharacter.abilityCooldown;
        modifiersDirty = true;
      }
    } else if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaSeconds);
    }

    if (modifiersDirty) {
      this.recomputeModifiers();
      this.applyStatsBaseline(stats, false);
    }

    if (stats.isAlive && stats.health > 0 && deltaSeconds > 0) {
      if (this.computedModifiers.healthRegenPerSec > 0 && stats.health < stats.maxHealth) {
        stats.heal(this.computedModifiers.healthRegenPerSec * deltaSeconds);
      }
      if (this.computedModifiers.shieldRegenPerSec > 0 && stats.shield < stats.maxShield) {
        stats.addShield(this.computedModifiers.shieldRegenPerSec * deltaSeconds);
      }
    }
  }

  getComputedModifiers(): Readonly<Required<AbilityModifiers>> {
    return this.computedModifiers;
  }

  getRuntimeSnapshot(): AbilityRuntimeSnapshot {
    const status: AbilityRuntimeSnapshot['status'] =
      this.activeRemaining > 0
        ? 'active'
        : this.cooldownRemaining > 0
          ? 'cooldown'
          : 'ready';

    return {
      activeAbilityName: this.activeAbility?.name ?? 'None',
      passiveAbilityName: this.passiveAbility?.name ?? 'None',
      status,
      activeRemaining: this.activeRemaining,
      activeDuration: this.activeCharacter?.abilityDuration ?? 0,
      cooldownRemaining: this.cooldownRemaining,
      cooldownDuration: this.activeCharacter?.abilityCooldown ?? 0,
      computedModifiers: this.computedModifiers,
    };
  }

  private recomputeModifiers(): void {
    const m = this.computedModifiers;
    m.bonusMaxHealth = 0;
    m.moveSpeedMultiplier = 1;
    m.sprintSpeedMultiplier = 1;
    m.shieldPenetrationPct = 0;
    m.shieldDamageMultiplier = 1;
    m.damageReductionPct = 0;
    m.reloadSpeedMultiplier = 1;
    m.accuracyBonusPct = 0;
    m.healthRegenPerSec = 0;
    m.shieldRegenPerSec = 0;
    m.enemyDetectionRadius = 0;
    m.enemySlowPct = 0;
    m.enemySlowRadius = 0;
    m.instantShieldRestore = 0;
    m.instantHealthRestore = 0;

    if (this.passiveAbility) {
      this.accumulateModifiers(this.passiveAbility.modifiers);
    }
    if (this.activeAbility && this.activeRemaining > 0) {
      this.accumulateModifiers(this.activeAbility.modifiers);
    }
    this.accumulateModifiers(this.externalModifiers);
  }

  private accumulateModifiers(src: AbilityModifiers): void {
    const m = this.computedModifiers;
    if (src.bonusMaxHealth) m.bonusMaxHealth += src.bonusMaxHealth;
    if (src.moveSpeedMultiplier) m.moveSpeedMultiplier *= src.moveSpeedMultiplier;
    if (src.sprintSpeedMultiplier) m.sprintSpeedMultiplier *= src.sprintSpeedMultiplier;
    if (src.shieldPenetrationPct) m.shieldPenetrationPct += src.shieldPenetrationPct;
    if (src.shieldDamageMultiplier) m.shieldDamageMultiplier *= src.shieldDamageMultiplier;
    if (src.damageReductionPct) m.damageReductionPct = Math.min(75, m.damageReductionPct + src.damageReductionPct);
    if (src.reloadSpeedMultiplier) m.reloadSpeedMultiplier *= src.reloadSpeedMultiplier;
    if (src.accuracyBonusPct) m.accuracyBonusPct += src.accuracyBonusPct;
    if (src.healthRegenPerSec) m.healthRegenPerSec += src.healthRegenPerSec;
    if (src.shieldRegenPerSec) m.shieldRegenPerSec += src.shieldRegenPerSec;
    if (src.enemyDetectionRadius) m.enemyDetectionRadius = Math.max(m.enemyDetectionRadius, src.enemyDetectionRadius);
    if (src.enemySlowPct) m.enemySlowPct = Math.max(m.enemySlowPct, src.enemySlowPct);
    if (src.enemySlowRadius) m.enemySlowRadius = Math.max(m.enemySlowRadius, src.enemySlowRadius);
  }

  private applyStatsBaseline(stats: PlayerStats, resetPools: boolean): void {
    const character = this.activeCharacter;
    if (!character) return;

    const targetMaxHealth = MATCH_PLAYER_MAX_HEALTH;
    const prevMaxHealth = stats.maxHealth;
    stats.maxHealth = targetMaxHealth;
    stats.maxShield = character.shield;

    if (resetPools) {
      stats.health = targetMaxHealth;
      stats.shield = character.shield;
      stats.isAlive = true;
    } else if (stats.isAlive) {
      if (targetMaxHealth > prevMaxHealth) {
        stats.health = Math.min(targetMaxHealth, stats.health + (targetMaxHealth - prevMaxHealth));
      } else {
        stats.health = Math.min(stats.health, targetMaxHealth);
      }
    }

    stats.damageMitigationPct = Math.min(70, Math.max(0, this.computedModifiers.damageReductionPct));

    stats.movementSpeed = Number(
      (this.baseMoveSpeed * this.computedModifiers.moveSpeedMultiplier).toFixed(2),
    );
    stats.sprintSpeed = Number(
      (
        this.baseSprintSpeed *
        this.computedModifiers.moveSpeedMultiplier *
        this.computedModifiers.sprintSpeedMultiplier
      ).toFixed(2),
    );
  }

  dispose(): void {
    this.registry.clear();
  }
}
