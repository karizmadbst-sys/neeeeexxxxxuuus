export type RankTier =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Heroic'
  | 'Master';

export type PlatformType = 'pc' | 'android' | 'ios' | 'tablet';

export type PlayerGender = 'male' | 'female';

export type RankedMapId = 'desert' | 'forest' | 'snow';

export type MatchDropPhase = 'inactive' | 'waiting' | 'airplane' | 'freefall' | 'parachute' | 'landed';

export type MatchLifecyclePhase = 'waiting' | 'active';

export type RankedAnimationState =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'CrouchIdle'
  | 'CrouchWalk'
  | 'ProneIdle'
  | 'ProneMove'
  | 'Jump'
  | 'Fall'
  | 'Land'
  | 'SwimIdle'
  | 'SwimMove'
  | 'Skydive'
  | 'Parachute'
  | 'Shoot'
  | 'Reload'
  | 'PunchLeft'
  | 'PunchRight'
  | 'Vault'
  | 'Sit'
  | 'Zipline'
  | 'Death';

export interface RankTierSpec {
  tier: RankTier;
  minRp: number;
  colorHex: string;
  badgeTextHex: string;
  entryCostRp: number;
}

export const RANK_TIERS: readonly RankTierSpec[] = [
  { tier: 'Bronze', minRp: 0, colorHex: '#cd7f32', badgeTextHex: '#fed7aa', entryCostRp: 4 },
  { tier: 'Silver', minRp: 500, colorHex: '#cbd5e1', badgeTextHex: '#f1f5f9', entryCostRp: 8 },
  { tier: 'Gold', minRp: 1000, colorHex: '#facc15', badgeTextHex: '#fef08a', entryCostRp: 12 },
  { tier: 'Platinum', minRp: 1500, colorHex: '#38bdf8', badgeTextHex: '#bae6fd', entryCostRp: 16 },
  { tier: 'Diamond', minRp: 2100, colorHex: '#a855f7', badgeTextHex: '#e9d5ff', entryCostRp: 22 },
  { tier: 'Heroic', minRp: 2800, colorHex: '#ef4444', badgeTextHex: '#fecaca', entryCostRp: 28 },
  { tier: 'Master', minRp: 3600, colorHex: '#f97316', badgeTextHex: '#ffedd5', entryCostRp: 34 },
];

export function getRankTierSpec(rp: number): RankTierSpec {
  const safeRp = Math.max(0, Math.floor(rp));
  let chosen = RANK_TIERS[0];
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (safeRp >= RANK_TIERS[i].minRp) {
      chosen = RANK_TIERS[i];
    }
  }
  return chosen;
}

export function getRankTier(rp: number): RankTier {
  return getRankTierSpec(rp).tier;
}

export function getNextRankProgress(rp: number): {
  current: RankTierSpec;
  next: RankTierSpec | null;
  progressPct: number;
  rpToNext: number;
} {
  const safeRp = Math.max(0, Math.floor(rp));
  const current = getRankTierSpec(safeRp);
  const idx = RANK_TIERS.findIndex((t) => t.tier === current.tier);
  const next = idx >= 0 && idx < RANK_TIERS.length - 1 ? RANK_TIERS[idx + 1] : null;
  if (!next) {
    return { current, next: null, progressPct: 100, rpToNext: 0 };
  }
  const span = Math.max(1, next.minRp - current.minRp);
  const pct = Math.max(0, Math.min(100, ((safeRp - current.minRp) / span) * 100));
  return {
    current,
    next,
    progressPct: Math.round(pct),
    rpToNext: Math.max(0, next.minRp - safeRp),
  };
}

export function calculateMatchRpDelta(input: {
  currentRp: number;
  placement: number;
  totalPlayers: number;
  kills: number;
  damage: number;
  survivedSec: number;
}): { rpDelta: number; rpAfter: number } {
  const spec = getRankTierSpec(input.currentRp);
  const n = Math.max(2, input.totalPlayers);
  const place = Math.max(1, Math.min(n, input.placement));

  // Placement score scales smoothly regardless of 2-player duel or 100-player match
  const normRatio = (n - place) / Math.max(1, n - 1); // 1.0 for #1, 0.0 for last
  let placementPoints = Math.round(normRatio * 34);
  if (place === 1) {
    placementPoints += 24; // Victory / Booyah bonus
  } else if (place === 2) {
    placementPoints += 10;
  } else if (place <= 3 && n >= 4) {
    placementPoints += 6;
  }

  const killPoints = Math.min(8, Math.max(0, input.kills)) * 9;
  const damagePoints = Math.min(12, Math.floor(Math.max(0, input.damage) / 90));
  const survivalBonus = Math.min(6, Math.floor(Math.max(0, input.survivedSec) / 45));

  const rawDelta =
    placementPoints + killPoints + damagePoints + survivalBonus - spec.entryCostRp;
  const rpAfter = Math.max(0, Math.floor(input.currentRp + rawDelta));
  return {
    rpDelta: rpAfter - Math.floor(input.currentRp),
    rpAfter,
  };
}

export interface RankedCustomizationPayload {
  skinId: string;
  eyesId?: string;
  mouthId?: string;
  hairStyleId?: string;
  hairColorId?: string;
  topId?: string;
  pantsId?: string;
  shoesId?: string;
  hatId?: string;
  glassesId?: string;
  maskId?: string;
  hairId?: string;
  clothesId?: string;
  armorId: string;
  accessoryId: string;
  petId: string;
}

export interface RankedMatchHistoryEntry {
  matchId: string;
  mapId: RankedMapId;
  placement: number;
  totalPlayers: number;
  kills: number;
  damage: number;
  survivedSec: number;
  rpBefore: number;
  rpAfter: number;
  rpDelta: number;
  tierAfter: RankTier;
  timestamp: number;
}

export interface RankedVaultState {
  credits: number;
  ownedIds: string[];
  equippedOutfitId: string | null;
  equippedGliderId: string;
  equippedEmoteId: string;
  equippedGlooSkinId: string;
  equippedAvatarId: string;
  equippedBannerId: string;
  equippedWeaponSkins: Record<string, string>;
  equippedEmoteWheel: (string | null)[];
  equippedArmoryIds: Record<string, string>;
}

export interface RankedProfile {
  playerId: string;
  numericId?: string;
  name: string;
  usernameChanged?: boolean;
  isDeveloper?: boolean;
  platform: PlatformType;
  gender?: PlayerGender | null;
  rp: number;
  tier: RankTier;
  wins: number;
  kills: number;
  deaths: number;
  top3: number;
  matchesPlayed: number;
  totalDamage: number;
  bestKillsInMatch: number;
  level?: number;
  xp?: number;
  nextLevelXp?: number;
  avatarCharacterId?: string;
  equippedAvatarId?: string;
  equippedBannerId?: string;
  vault?: RankedVaultState;
  careerMatches?: number;
  careerWins?: number;
  careerKills?: number;
  careerDeaths?: number;
  careerDamage?: number;
  careerBestKills?: number;
  history: RankedMatchHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  numericId?: string;
  name: string;
  platform: PlatformType;
  gender?: PlayerGender | null;
  level?: number;
  avatarId?: string;
  bannerId?: string;
  rp: number;
  tier: RankTier;
  wins: number;
  kills: number;
  deaths: number;
  matchesPlayed: number;
}

export interface ServerOnlineStatus {
  onlinePlayers: number;
  queuedPlayers: number;
  activeLobbies: number;
  activeMatches: number;
}

export interface LobbyPlayerInfo {
  playerId: string;
  numericId?: string;
  name: string;
  rp: number;
  tier: RankTier;
  platform: PlatformType;
  gender?: PlayerGender | null;
  level?: number;
  ready: boolean;
  mapVote: RankedMapId | null;
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId?: string;
  bannerId?: string;
}

export interface LobbySnapshot {
  lobbyId: string;
  players: LobbyPlayerInfo[];
  minPlayers: number;
  maxPlayers: number;
  countdownSec: number | null;
  selectedMap: RankedMapId;
  mapVotes: Record<RankedMapId, number>;
}

export interface RemotePlayerSnapshot {
  playerId: string;
  squadId?: string | null;
  name: string;
  rp: number;
  tier: RankTier;
  platform: PlatformType;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  dropPhase: MatchDropPhase;
  animationState: RankedAnimationState;
  isCrouching: boolean;
  isSprinting: boolean;
  isGrounded: boolean;
  isAlive: boolean;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  activeWeaponId: string | null;
  armorTier: 0 | 1 | 2 | 3;
  helmetTier: 0 | 1 | 2 | 3;
  backpackTier: 0 | 1 | 2 | 3;
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId?: string;
  bannerId?: string;
  weaponSkins?: Record<string, string>;
  kills: number;
  damageReductionPct: number;
}

export interface RemotePlayerDeltaSnapshot {
  playerId: string;
  squadId?: string | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  dropPhase: MatchDropPhase;
  animationState: RankedAnimationState;
  isCrouching: boolean;
  isSprinting: boolean;
  isGrounded: boolean;
  isAlive: boolean;
  health: number;
  shield: number;
  activeWeaponId: string | null;
  armorTier: 0 | 1 | 2 | 3;
  helmetTier: 0 | 1 | 2 | 3;
  backpackTier: 0 | 1 | 2 | 3;
  kills: number;
  damageReductionPct: number;
}

export interface ServerZoneState {
  phase: number;
  totalPhases: number;
  state: 'waiting' | 'shrinking' | 'final';
  timeRemainingSec: number;
  phaseDurationSec: number;
  currentCenterX: number;
  currentCenterZ: number;
  currentRadius: number;
  nextCenterX: number;
  nextCenterZ: number;
  nextRadius: number;
  damagePerSec: number;
}

export interface KillFeedEntry {
  id: string;
  killerId: string | null;
  killerName: string;
  victimId: string;
  victimName: string;
  weaponName: string;
  isHeadshot: boolean;
  distanceM: number;
  cause: 'weapon' | 'zone' | 'disconnect';
  timestamp: number;
}

export interface DroppedLootSync {
  lootId: string;
  itemId: string;
  x: number;
  y: number;
  z: number;
  quantity: number;
  weaponAmmoInMag?: number;
  armorDurability?: number;
}

export interface RankedMatchResultPayload {
  matchId: string;
  mapId: RankedMapId;
  placement: number;
  totalPlayers: number;
  kills: number;
  damage: number;
  survivedSec: number;
  rpBefore: number;
  rpAfter: number;
  rpDelta: number;
  tierBefore: RankTier;
  tierAfter: RankTier;
  winnerId: string | null;
  winnerName: string;
  isWinner: boolean;
}

export interface RankedWeaponStatSpec {
  id: string;
  name: string;
  damage: number;
  headshotDamage: number;
  range: number;
  fireRate: number;
  pellets: number;
  criticalMultiplier: number;
  closeRange: number;
  mediumRange: number;
  mediumDamageRatio: number;
  longDamageRatio: number;
}

export const RANKED_WEAPON_STATS: Record<string, RankedWeaponStatSpec> = {
  ump: {
    id: 'ump',
    name: 'UMP',
    damage: 25,
    headshotDamage: 42,
    range: 58,
    fireRate: 640,
    pellets: 1,
    criticalMultiplier: 1.68,
    closeRange: 16,
    mediumRange: 34,
    mediumDamageRatio: 0.74,
    longDamageRatio: 0.44,
  },
  mp5: {
    id: 'mp5',
    name: 'MP5',
    damage: 21,
    headshotDamage: 36,
    range: 54,
    fireRate: 800,
    pellets: 1,
    criticalMultiplier: 1.71,
    closeRange: 14,
    mediumRange: 30,
    mediumDamageRatio: 0.72,
    longDamageRatio: 0.42,
  },
  mp40: {
    id: 'mp40',
    name: 'MP40',
    damage: 22,
    headshotDamage: 35,
    range: 46,
    fireRate: 880,
    pellets: 1,
    criticalMultiplier: 1.6,
    closeRange: 12,
    mediumRange: 25,
    mediumDamageRatio: 0.68,
    longDamageRatio: 0.38,
  },
  scar: {
    id: 'scar',
    name: 'SCAR',
    damage: 33,
    headshotDamage: 58,
    range: 95,
    fireRate: 620,
    pellets: 1,
    criticalMultiplier: 1.76,
    closeRange: 24,
    mediumRange: 54,
    mediumDamageRatio: 0.78,
    longDamageRatio: 0.55,
  },
  ak24: {
    id: 'ak24',
    name: 'AK-47',
    damage: 38,
    headshotDamage: 68,
    range: 90,
    fireRate: 560,
    pellets: 1,
    criticalMultiplier: 1.79,
    closeRange: 22,
    mediumRange: 50,
    mediumDamageRatio: 0.76,
    longDamageRatio: 0.52,
  },
  m4a1: {
    id: 'm4a1',
    name: 'M4A1',
    damage: 31,
    headshotDamage: 55,
    range: 92,
    fireRate: 720,
    pellets: 1,
    criticalMultiplier: 1.77,
    closeRange: 24,
    mediumRange: 52,
    mediumDamageRatio: 0.78,
    longDamageRatio: 0.52,
  },
  parafal: {
    id: 'parafal',
    name: 'PARAFAL',
    damage: 44,
    headshotDamage: 84,
    range: 145,
    fireRate: 450,
    pellets: 1,
    criticalMultiplier: 1.91,
    closeRange: 32,
    mediumRange: 75,
    mediumDamageRatio: 0.84,
    longDamageRatio: 0.65,
  },
  m1014: {
    id: 'm1014',
    name: 'M1014',
    damage: 14,
    headshotDamage: 21,
    range: 25,
    fireRate: 155,
    pellets: 7,
    criticalMultiplier: 1.5,
    closeRange: 7.5,
    mediumRange: 15,
    mediumDamageRatio: 0.54,
    longDamageRatio: 0.22,
  },
  m1887: {
    id: 'm1887',
    name: 'M1887',
    damage: 16,
    headshotDamage: 24,
    range: 28,
    fireRate: 85,
    pellets: 8,
    criticalMultiplier: 1.5,
    closeRange: 8,
    mediumRange: 16,
    mediumDamageRatio: 0.56,
    longDamageRatio: 0.24,
  },
  awm: {
    id: 'awm',
    name: 'AWM',
    damage: 118,
    headshotDamage: 255,
    range: 250,
    fireRate: 42,
    pellets: 1,
    criticalMultiplier: 2.16,
    closeRange: 95,
    mediumRange: 175,
    mediumDamageRatio: 0.94,
    longDamageRatio: 0.86,
  },
  kar98k: {
    id: 'kar98k',
    name: 'KAR98K',
    damage: 86,
    headshotDamage: 196,
    range: 210,
    fireRate: 48,
    pellets: 1,
    criticalMultiplier: 2.28,
    closeRange: 80,
    mediumRange: 150,
    mediumDamageRatio: 0.9,
    longDamageRatio: 0.78,
  },
  desert_eagle: {
    id: 'desert_eagle',
    name: 'Desert Eagle',
    damage: 48,
    headshotDamage: 92,
    range: 55,
    fireRate: 195,
    pellets: 1,
    criticalMultiplier: 1.92,
    closeRange: 15,
    mediumRange: 34,
    mediumDamageRatio: 0.76,
    longDamageRatio: 0.48,
  },
  glock: {
    id: 'glock',
    name: 'Glock',
    damage: 24,
    headshotDamage: 44,
    range: 42,
    fireRate: 380,
    pellets: 1,
    criticalMultiplier: 1.83,
    closeRange: 12,
    mediumRange: 26,
    mediumDamageRatio: 0.72,
    longDamageRatio: 0.44,
  },
  combat_knife: {
    id: 'combat_knife',
    name: 'Combat Knife',
    damage: 48,
    headshotDamage: 85,
    range: 2.8,
    fireRate: 145,
    pellets: 1,
    criticalMultiplier: 1.77,
    closeRange: 3.0,
    mediumRange: 4.0,
    mediumDamageRatio: 1,
    longDamageRatio: 1,
  },
  baseball_bat: {
    id: 'baseball_bat',
    name: 'Baseball Bat',
    damage: 58,
    headshotDamage: 102,
    range: 3.15,
    fireRate: 95,
    pellets: 1,
    criticalMultiplier: 1.76,
    closeRange: 3.5,
    mediumRange: 4.5,
    mediumDamageRatio: 1,
    longDamageRatio: 1,
  },
  fists: {
    id: 'fists',
    name: 'FISTS',
    damage: 24,
    headshotDamage: 38,
    range: 3.0,
    fireRate: 165,
    pellets: 1,
    criticalMultiplier: 1.58,
    closeRange: 3.0,
    mediumRange: 3.0,
    mediumDamageRatio: 1,
    longDamageRatio: 1,
  },
  famas: {
    id: 'famas',
    name: 'FAMAS',
    damage: 30,
    headshotDamage: 54,
    range: 90,
    fireRate: 820,
    pellets: 1,
    criticalMultiplier: 1.8,
    closeRange: 23,
    mediumRange: 52,
    mediumDamageRatio: 0.77,
    longDamageRatio: 0.52,
  },
  aug: {
    id: 'aug',
    name: 'AUG',
    damage: 32,
    headshotDamage: 57,
    range: 96,
    fireRate: 680,
    pellets: 1,
    criticalMultiplier: 1.78,
    closeRange: 25,
    mediumRange: 56,
    mediumDamageRatio: 0.8,
    longDamageRatio: 0.56,
  },
  groza: {
    id: 'groza',
    name: 'Groza',
    damage: 39,
    headshotDamage: 70,
    range: 94,
    fireRate: 690,
    pellets: 1,
    criticalMultiplier: 1.79,
    closeRange: 24,
    mediumRange: 53,
    mediumDamageRatio: 0.78,
    longDamageRatio: 0.54,
  },
  an94: {
    id: 'an94',
    name: 'AN94',
    damage: 36,
    headshotDamage: 65,
    range: 95,
    fireRate: 640,
    pellets: 1,
    criticalMultiplier: 1.81,
    closeRange: 24,
    mediumRange: 54,
    mediumDamageRatio: 0.78,
    longDamageRatio: 0.55,
  },
  vector: {
    id: 'vector',
    name: 'Vector',
    damage: 19,
    headshotDamage: 31,
    range: 44,
    fireRate: 1050,
    pellets: 1,
    criticalMultiplier: 1.63,
    closeRange: 12,
    mediumRange: 24,
    mediumDamageRatio: 0.68,
    longDamageRatio: 0.36,
  },
  p90: {
    id: 'p90',
    name: 'P90',
    damage: 20,
    headshotDamage: 33,
    range: 55,
    fireRate: 900,
    pellets: 1,
    criticalMultiplier: 1.65,
    closeRange: 15,
    mediumRange: 31,
    mediumDamageRatio: 0.72,
    longDamageRatio: 0.42,
  },
  thompson: {
    id: 'thompson',
    name: 'Thompson',
    damage: 26,
    headshotDamage: 43,
    range: 50,
    fireRate: 700,
    pellets: 1,
    criticalMultiplier: 1.65,
    closeRange: 14,
    mediumRange: 28,
    mediumDamageRatio: 0.7,
    longDamageRatio: 0.4,
  },
  spas12: {
    id: 'spas12',
    name: 'SPAS12',
    damage: 15,
    headshotDamage: 22,
    range: 26,
    fireRate: 135,
    pellets: 7,
    criticalMultiplier: 1.47,
    closeRange: 8,
    mediumRange: 16,
    mediumDamageRatio: 0.55,
    longDamageRatio: 0.24,
  },
  double_barrel: {
    id: 'double_barrel',
    name: 'Double Barrel',
    damage: 17,
    headshotDamage: 26,
    range: 24,
    fireRate: 95,
    pellets: 8,
    criticalMultiplier: 1.53,
    closeRange: 7.5,
    mediumRange: 15,
    mediumDamageRatio: 0.54,
    longDamageRatio: 0.22,
  },
  m24: {
    id: 'm24',
    name: 'M24',
    damage: 94,
    headshotDamage: 215,
    range: 235,
    fireRate: 45,
    pellets: 1,
    criticalMultiplier: 2.29,
    closeRange: 88,
    mediumRange: 165,
    mediumDamageRatio: 0.92,
    longDamageRatio: 0.83,
  },
  svd: {
    id: 'svd',
    name: 'SVD',
    damage: 64,
    headshotDamage: 134,
    range: 185,
    fireRate: 175,
    pellets: 1,
    criticalMultiplier: 2.09,
    closeRange: 55,
    mediumRange: 115,
    mediumDamageRatio: 0.86,
    longDamageRatio: 0.72,
  },
  vss: {
    id: 'vss',
    name: 'VSS',
    damage: 42,
    headshotDamage: 88,
    range: 140,
    fireRate: 340,
    pellets: 1,
    criticalMultiplier: 2.1,
    closeRange: 38,
    mediumRange: 82,
    mediumDamageRatio: 0.82,
    longDamageRatio: 0.62,
  },
  dragunov: {
    id: 'dragunov',
    name: 'Dragunov',
    damage: 70,
    headshotDamage: 148,
    range: 195,
    fireRate: 150,
    pellets: 1,
    criticalMultiplier: 2.11,
    closeRange: 60,
    mediumRange: 125,
    mediumDamageRatio: 0.88,
    longDamageRatio: 0.74,
  },
  usp: {
    id: 'usp',
    name: 'USP',
    damage: 27,
    headshotDamage: 50,
    range: 48,
    fireRate: 340,
    pellets: 1,
    criticalMultiplier: 1.85,
    closeRange: 13,
    mediumRange: 29,
    mediumDamageRatio: 0.74,
    longDamageRatio: 0.46,
  },
  m1917: {
    id: 'm1917',
    name: 'M1917',
    damage: 54,
    headshotDamage: 104,
    range: 60,
    fireRate: 165,
    pellets: 1,
    criticalMultiplier: 1.93,
    closeRange: 17,
    mediumRange: 36,
    mediumDamageRatio: 0.78,
    longDamageRatio: 0.5,
  },
  m249: {
    id: 'm249',
    name: 'M249',
    damage: 34,
    headshotDamage: 58,
    range: 105,
    fireRate: 760,
    pellets: 1,
    criticalMultiplier: 1.71,
    closeRange: 28,
    mediumRange: 62,
    mediumDamageRatio: 0.8,
    longDamageRatio: 0.58,
  },
  m60: {
    id: 'm60',
    name: 'M60',
    damage: 38,
    headshotDamage: 65,
    range: 110,
    fireRate: 600,
    pellets: 1,
    criticalMultiplier: 1.71,
    closeRange: 28,
    mediumRange: 64,
    mediumDamageRatio: 0.81,
    longDamageRatio: 0.6,
  },
  dp28: {
    id: 'dp28',
    name: 'DP-28',
    damage: 41,
    headshotDamage: 72,
    range: 108,
    fireRate: 540,
    pellets: 1,
    criticalMultiplier: 1.76,
    closeRange: 30,
    mediumRange: 66,
    mediumDamageRatio: 0.82,
    longDamageRatio: 0.61,
  },
};

export interface RankedConsumableEffect {
  heal: number;
  shield: number;
}

export const RANKED_CONSUMABLE_EFFECTS: Record<string, RankedConsumableEffect> = {
  med_bandage: { heal: 25, shield: 0 },
  med_kit: { heal: 80, shield: 0 },
  med_full_restore: { heal: 200, shield: 0 },
  shield_cell: { heal: 0, shield: 25 },
  shield_battery: { heal: 0, shield: 65 },
  special_adrenaline: { heal: 35, shield: 35 },
  spec_adrenaline: { heal: 35, shield: 35 },
  utility_energy_drink: { heal: 15, shield: 20 },
  util_energy_booster: { heal: 15, shield: 20 },
};

export interface ServerFlightPath {
  id: string;
  label: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  altitude: number;
  speedMps: number;
}

export const RANKED_FLIGHT_PATHS: Record<RankedMapId, readonly ServerFlightPath[]> = {
  desert: [
    {
      id: 'desert-corridor-nw-se',
      label: 'SUNSTONE -> SCORCH MILITARY',
      startX: -505,
      startZ: -495,
      endX: 505,
      endZ: 495,
      altitude: 200,
      speedMps: 36,
    },
    {
      id: 'desert-corridor-sw-ne',
      label: 'SANDSTONE -> MIRAGE RESORT',
      startX: -495,
      startZ: 495,
      endX: 495,
      endZ: -495,
      altitude: 200,
      speedMps: 36,
    },
    {
      id: 'desert-corridor-w-e',
      label: 'CANYON REFINERY -> DUSTBOWL',
      startX: -525,
      startZ: -25,
      endX: 525,
      endZ: 28,
      altitude: 202,
      speedMps: 36,
    },
  ],
  forest: [
    {
      id: 'forest-corridor-nw-se',
      label: 'EMERALD ESTATES -> IRONWOOD BASE',
      startX: -500,
      startZ: -490,
      endX: 500,
      endZ: 490,
      altitude: 198,
      speedMps: 36,
    },
    {
      id: 'forest-corridor-sw-ne',
      label: 'PINEWOOD -> OAKRIDGE METROPOLIS',
      startX: -500,
      startZ: 485,
      endX: 500,
      endZ: -485,
      altitude: 198,
      speedMps: 36,
    },
    {
      id: 'forest-corridor-s-n',
      label: 'SAWMILL DEPOT -> NORTHGATE',
      startX: -32,
      startZ: 515,
      endX: 34,
      endZ: -515,
      altitude: 200,
      speedMps: 36,
    },
  ],
  snow: [
    {
      id: 'snow-corridor-nw-se',
      label: 'FROSTHAVEN -> CRYO CITADEL',
      startX: -505,
      startZ: -495,
      endX: 505,
      endZ: 495,
      altitude: 204,
      speedMps: 36,
    },
    {
      id: 'snow-corridor-sw-ne',
      label: 'ALPINE VILLAGE -> AURORA VILLAS',
      startX: -495,
      startZ: 495,
      endX: 495,
      endZ: -495,
      altitude: 204,
      speedMps: 36,
    },
    {
      id: 'snow-corridor-e-w',
      label: 'TUNDRA REFINERY -> SNOWDRIFT',
      startX: 520,
      startZ: -28,
      endX: -520,
      endZ: 28,
      altitude: 204,
      speedMps: 36,
    },
  ],
};

// Client -> Server WebSocket messages
export interface AuthMessagePayload {
  playerId: string;
  secretToken: string;
  firebaseIdToken?: string;
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId?: string;
  bannerId?: string;
  weaponSkins?: Record<string, string>;
}

export interface QueueJoinPayload {
  preferredMap: RankedMapId | 'any';
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId?: string;
  bannerId?: string;
  weaponSkins?: Record<string, string>;
}

export interface PlayerStateUploadPayload {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  dropPhase: MatchDropPhase;
  animationState: RankedAnimationState;
  isCrouching: boolean;
  isSprinting: boolean;
  isGrounded: boolean;
  activeWeaponId: string | null;
  armorTier: 0 | 1 | 2 | 3;
  helmetTier: 0 | 1 | 2 | 3;
  backpackTier: 0 | 1 | 2 | 3;
  damageReductionPct: number;
}

export interface CombatShotPayload {
  weaponId: string;
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface CombatHitClaimPayload {
  targetId: string;
  weaponId: string;
  isHeadshot: boolean;
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface ServerGlooWall {
  id: string;
  ownerId: string;
  ownerName: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  createdAtMs: number;
  skinId?: string;
  heightScale?: number;
}

export interface GlooWallDeployPayload {
  x: number;
  y: number;
  z: number;
  yaw: number;
  skinId?: string;
  heightScale?: number;
}

export interface GlooWallDamagePayload {
  wallId: string;
  weaponId: string;
  distance: number;
}

export interface GlooWallInventoryPayload {
  glooWalls: number;
}

export interface LootCollectClaimPayload {
  lootId: string;
  itemId?: string;
}

export interface LootDropReportPayload {
  itemId: string;
  x: number;
  y: number;
  z: number;
  quantity: number;
  weaponAmmoInMag?: number;
  armorDurability?: number;
}

export interface UseConsumableReportPayload {
  itemId: string;
}

export type SquadSize = 1 | 2 | 4;

export interface SquadFriendEntry {
  playerId: string;
  numericId?: string;
  name: string;
  tier: RankTier;
  rp: number;
  level?: number;
  gender?: PlayerGender | null;
  avatarId?: string;
  characterId: string;
  customization: RankedCustomizationPayload;
  status: 'online' | 'in-squad' | 'in-match' | 'offline';
  isBotAlly?: boolean;
  invited?: boolean;
}

export type FriendRelationStatus =
  | 'none'
  | 'self'
  | 'friends'
  | 'outgoing_pending'
  | 'incoming_pending';

export interface FriendRequestEntry {
  requestId: string;
  fromPlayerId: string;
  fromNumericId: string;
  fromName: string;
  fromTier: RankTier;
  fromRp: number;
  fromLevel: number;
  fromGender: PlayerGender | null;
  fromAvatarId: string;
  createdAt: number;
}

export interface FriendLookupPlayerSummary {
  playerId: string;
  numericId: string;
  name: string;
  tier: RankTier;
  rp: number;
  level: number;
  gender: PlayerGender | null;
  avatarId: string;
  bannerId: string;
}

export interface FriendLookupResponse {
  player: FriendLookupPlayerSummary;
  relationStatus: FriendRelationStatus;
  pendingRequestId?: string;
}

export interface OutgoingFriendRequestEntry {
  requestId: string;
  toPlayerId: string;
  toNumericId: string;
  toName: string;
  toTier: RankTier;
  toRp: number;
  toLevel: number;
  toGender: PlayerGender | null;
  toAvatarId: string;
  createdAt: number;
}

export type MailboxCategory = 'system' | 'developer' | 'notification' | 'reward';

export interface MailboxMessageView {
  mailId: string;
  category: MailboxCategory;
  title: string;
  sender: string;
  content: string;
  createdAt: number;
  expiresAt: number | null;
  rewardCredits: number;
  isRead: boolean;
  isClaimed: boolean;
  claimedAt: number | null;
  isArchived: boolean;
}

export interface MailboxStateSnapshot {
  messages: MailboxMessageView[];
  unreadCount: number;
  unclaimedRewardCount: number;
}

export type SquadMemberStatus = 'ready' | 'not-ready' | 'in-match';

export interface SquadMemberInfo {
  playerId: string;
  numericId?: string;
  name: string;
  tier: RankTier;
  rp: number;
  level?: number;
  gender?: PlayerGender | null;
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId?: string;
  bannerId?: string;
  isLeader: boolean;
  ready: boolean;
  status?: SquadMemberStatus;
  isSelf?: boolean;
  isBotAlly?: boolean;
}

export interface SquadStateSnapshot {
  squadId: string | null;
  maxSize: SquadSize;
  leaderId: string;
  members: SquadMemberInfo[];
  pendingInviteIds: string[];
}

export interface SquadInviteNotification {
  inviteId: string;
  squadId: string;
  fromPlayerId: string;
  fromNumericId?: string;
  fromName: string;
  fromTier: RankTier;
  fromLevel?: number;
  fromAvatarId?: string;
  maxSize: SquadSize;
  memberCount: number;
}

export interface CloudSyncStatePayload {
  settings?: Record<string, unknown>;
  controlSettings?: {
    bindings?: Record<string, string>;
    touchLayouts?: Record<string, unknown>;
  };
  selectedCharacterId?: string;
  customization?: RankedCustomizationPayload;
  charOverrides?: Record<string, RankedCustomizationPayload>;
  checkpoints?: {
    lobbyMode?: string;
    battleRoyaleConfig?: Record<string, unknown>;
    lastArenaMapId?: string;
    updatedAt?: number;
  };
}
