export type AbilityKind = 'active' | 'passive';

export type AbilityCategory =
  | 'mobility'
  | 'defense'
  | 'offense'
  | 'recon'
  | 'support'
  | 'weaponry';

export interface AbilityModifiers {
  bonusMaxHealth?: number;
  moveSpeedMultiplier?: number;
  sprintSpeedMultiplier?: number;
  shieldPenetrationPct?: number;
  shieldDamageMultiplier?: number;
  damageReductionPct?: number;
  reloadSpeedMultiplier?: number;
  accuracyBonusPct?: number;
  healthRegenPerSec?: number;
  shieldRegenPerSec?: number;
  enemyDetectionRadius?: number;
  enemySlowPct?: number;
  enemySlowRadius?: number;
  instantShieldRestore?: number;
  instantHealthRestore?: number;
}

export interface AbilityDefinition {
  id: string;
  name: string;
  kind: AbilityKind;
  category: AbilityCategory;
  description: string;
  modifiers: AbilityModifiers;
}

export const ABILITY_REGISTRY: Record<string, AbilityDefinition> = {
  // --- PASSIVE ABILITIES ---
  passive_iron_frame: {
    id: 'passive_iron_frame',
    name: 'Reinforced Plating',
    kind: 'passive',
    category: 'defense',
    description: 'Increases maximum health by +15 and reduces incoming damage by 5%.',
    modifiers: { bonusMaxHealth: 15, damageReductionPct: 5 },
  },
  passive_lightweight_rig: {
    id: 'passive_lightweight_rig',
    name: 'Aero Stride',
    kind: 'passive',
    category: 'mobility',
    description: 'Increases base movement speed by 8% across all terrain.',
    modifiers: { moveSpeedMultiplier: 1.08 },
  },
  passive_shield_breaker: {
    id: 'passive_shield_breaker',
    name: 'Arc Disruptor',
    kind: 'passive',
    category: 'offense',
    description: 'Deals 18% increased damage against enemy shields.',
    modifiers: { shieldDamageMultiplier: 1.18 },
  },
  passive_armor_pierce: {
    id: 'passive_armor_pierce',
    name: 'Tungsten Rounds',
    kind: 'passive',
    category: 'offense',
    description: '12% of weapon damage penetrates directly through shields.',
    modifiers: { shieldPenetrationPct: 12 },
  },
  passive_sleight_of_hand: {
    id: 'passive_sleight_of_hand',
    name: 'Rapid Mag',
    kind: 'passive',
    category: 'weaponry',
    description: 'Improves weapon reload speed by 20%.',
    modifiers: { reloadSpeedMultiplier: 1.2 },
  },
  passive_stabilizer: {
    id: 'passive_stabilizer',
    name: 'Gyro Stabilizer',
    kind: 'passive',
    category: 'weaponry',
    description: 'Increases firing accuracy by 16% and reduces spread.',
    modifiers: { accuracyBonusPct: 16 },
  },
  passive_nano_mend: {
    id: 'passive_nano_mend',
    name: 'Nano Mend',
    kind: 'passive',
    category: 'support',
    description: 'Passively regenerates 2.5 health per second.',
    modifiers: { healthRegenPerSec: 2.5 },
  },
  passive_threat_sense: {
    id: 'passive_threat_sense',
    name: 'Thermal Sense',
    kind: 'passive',
    category: 'recon',
    description: 'Detects nearby hostile movement within 18 meters.',
    modifiers: { enemyDetectionRadius: 18 },
  },
  passive_kinetic_absorb: {
    id: 'passive_kinetic_absorb',
    name: 'Reactive Weave',
    kind: 'passive',
    category: 'defense',
    description: 'Reduces all incoming combat damage by 10%.',
    modifiers: { damageReductionPct: 10 },
  },
  passive_frost_trail: {
    id: 'passive_frost_trail',
    name: 'Cryo Emitter',
    kind: 'passive',
    category: 'support',
    description: 'Close-range enemies within 6m suffer a 10% movement slow.',
    modifiers: { enemySlowPct: 10, enemySlowRadius: 6 },
  },

  // --- ACTIVE ABILITIES ---
  active_overdrive: {
    id: 'active_overdrive',
    name: 'Kinetic Overdrive',
    kind: 'active',
    category: 'mobility',
    description: 'Surges movement and sprint speed by 35% for the duration.',
    modifiers: { moveSpeedMultiplier: 1.35, sprintSpeedMultiplier: 1.35 },
  },
  active_aegis_dome: {
    id: 'active_aegis_dome',
    name: 'Aegis Barrier',
    kind: 'active',
    category: 'defense',
    description: 'Restores 35 shield immediately and grants 35% damage reduction.',
    modifiers: { instantShieldRestore: 35, damageReductionPct: 35 },
  },
  active_pulse_scan: {
    id: 'active_pulse_scan',
    name: 'Nexus Sonar Pulse',
    kind: 'active',
    category: 'recon',
    description: 'Reveals enemies within 45m and boosts accuracy by 25%.',
    modifiers: { enemyDetectionRadius: 45, accuracyBonusPct: 25 },
  },
  active_cryo_nova: {
    id: 'active_cryo_nova',
    name: 'Cryo Shockwave',
    kind: 'active',
    category: 'support',
    description: 'Slows enemies within 16m by 40% while boosting speed by 15%.',
    modifiers: { enemySlowPct: 40, enemySlowRadius: 16, moveSpeedMultiplier: 1.15 },
  },
  active_shield_siphon: {
    id: 'active_shield_siphon',
    name: 'EMP Overcharge',
    kind: 'active',
    category: 'offense',
    description: 'Increases damage vs shields by 55% with 25% shield penetration.',
    modifiers: { shieldDamageMultiplier: 1.55, shieldPenetrationPct: 25 },
  },
  active_med_surge: {
    id: 'active_med_surge',
    name: 'Bio-Regen Surge',
    kind: 'active',
    category: 'support',
    description: 'Restores 20 HP instantly and regenerates 10 HP/s while active.',
    modifiers: { instantHealthRestore: 20, healthRegenPerSec: 10 },
  },
  active_gunfighter: {
    id: 'active_gunfighter',
    name: 'Deadeye Focus',
    kind: 'active',
    category: 'weaponry',
    description: 'Boosts reload speed by 45% and weapon accuracy by 35%.',
    modifiers: { reloadSpeedMultiplier: 1.45, accuracyBonusPct: 35 },
  },
  active_juggernaut: {
    id: 'active_juggernaut',
    name: 'Titan Shell',
    kind: 'active',
    category: 'defense',
    description: 'Grants +40 temporary max health, +25 shield, and 30% damage reduction.',
    modifiers: { bonusMaxHealth: 40, instantShieldRestore: 25, damageReductionPct: 30 },
  },
  active_phase_pierce: {
    id: 'active_phase_pierce',
    name: 'Void Piercer',
    kind: 'active',
    category: 'offense',
    description: 'Grants 45% shield penetration and +20% speed burst.',
    modifiers: { shieldPenetrationPct: 45, moveSpeedMultiplier: 1.2 },
  },
  active_fortress_regen: {
    id: 'active_fortress_regen',
    name: 'Bastion Matrix',
    kind: 'active',
    category: 'defense',
    description: 'Regenerates 12 shield/s and reduces incoming damage by 25%.',
    modifiers: { shieldRegenPerSec: 12, damageReductionPct: 25 },
  },
};
