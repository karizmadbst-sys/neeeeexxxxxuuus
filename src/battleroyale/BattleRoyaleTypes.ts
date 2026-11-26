import type { MapId } from '../maps/IMapSystem';
import type { RankedCustomizationPayload, SquadSize } from '../ranked/RankedTypes';

export type BotDifficulty = 'recruit' | 'tactical' | 'veteran' | 'pro';

export type LobbyDifficultySetting = 'recruit' | 'tactical' | 'veteran' | 'mixed';

export type BotPersonality =
  | 'rusher'
  | 'loot-master'
  | 'sniper-scout'
  | 'survivor'
  | 'flanker';

export type BotBehaviorState =
  | 'waiting'
  | 'airplane'
  | 'freefall'
  | 'parachute'
  | 'loot'
  | 'explore-building'
  | 'combat'
  | 'take-cover'
  | 'heal'
  | 'rotate-zone';

export interface BotDifficultyProfile {
  difficulty: BotDifficulty;
  label: string;
  reactionSec: number;
  aimJitterDeg: number;
  aimTrackRate: number;
  burstLengthMin: number;
  burstLengthMax: number;
  burstPauseSec: number;
  crouchInFightChance: number;
  jumpInFightChance: number;
  strafeAgility: number;
  awarenessRadius: number;
  healThresholdHp: number;
}

export const BOT_DIFFICULTY_PROFILES: Record<BotDifficulty, BotDifficultyProfile> = {
  recruit: {
    difficulty: 'recruit',
    label: 'RECRUIT',
    reactionSec: 0.48,
    aimJitterDeg: 4.8,
    aimTrackRate: 4.6,
    burstLengthMin: 0.25,
    burstLengthMax: 0.48,
    burstPauseSec: 0.55,
    crouchInFightChance: 0.14,
    jumpInFightChance: 0.08,
    strafeAgility: 0.65,
    awarenessRadius: 68,
    healThresholdHp: 52,
  },
  tactical: {
    difficulty: 'tactical',
    label: 'TACTICAL',
    reactionSec: 0.28,
    aimJitterDeg: 2.7,
    aimTrackRate: 7.4,
    burstLengthMin: 0.34,
    burstLengthMax: 0.68,
    burstPauseSec: 0.32,
    crouchInFightChance: 0.32,
    jumpInFightChance: 0.16,
    strafeAgility: 0.9,
    awarenessRadius: 88,
    healThresholdHp: 64,
  },
  veteran: {
    difficulty: 'veteran',
    label: 'VETERAN',
    reactionSec: 0.18,
    aimJitterDeg: 1.65,
    aimTrackRate: 10.5,
    burstLengthMin: 0.42,
    burstLengthMax: 0.82,
    burstPauseSec: 0.2,
    crouchInFightChance: 0.46,
    jumpInFightChance: 0.24,
    strafeAgility: 1.12,
    awarenessRadius: 112,
    healThresholdHp: 72,
  },
  pro: {
    difficulty: 'pro',
    label: 'ACE',
    reactionSec: 0.12,
    aimJitterDeg: 1.05,
    aimTrackRate: 13.5,
    burstLengthMin: 0.48,
    burstLengthMax: 0.9,
    burstPauseSec: 0.15,
    crouchInFightChance: 0.55,
    jumpInFightChance: 0.3,
    strafeAgility: 1.25,
    awarenessRadius: 128,
    healThresholdHp: 78,
  },
};

export interface SquadFillMemberPreset {
  playerId: string;
  name: string;
  characterId: string;
  customization: RankedCustomizationPayload;
}

export const BR_SQUAD_FILL_PRESETS: readonly SquadFillMemberPreset[] = [
  {
    playerId: 'friend_marcus',
    name: 'MARCUS_V',
    characterId: 'char-01',
    customization: {
      skinId: 'operator_natural',
      eyesId: 'determined',
      mouthId: 'confident_grin',
      hairStyleId: 'swept_undercut',
      hairColorId: 'espresso',
      topId: 'bomber_jacket',
      pantsId: 'cargo_olive',
      shoesId: 'boots_combat',
      hatId: 'tactical_cap',
      glassesId: 'aviators',
      maskId: 'none',
      armorId: 'iron_lv1',
      accessoryId: 'none',
      petId: 'none',
    },
  },
  {
    playerId: 'friend_elena',
    name: 'ELENA_K',
    characterId: 'char-02',
    customization: {
      skinId: 'fair_sunlit',
      eyesId: 'anime_bright',
      mouthId: 'smirk',
      hairStyleId: 'high_ponytail',
      hairColorId: 'crimson',
      topId: 'hoodie_cyan',
      pantsId: 'joggers_slate',
      shoesId: 'hightops_cyan',
      hatId: 'none',
      glassesId: 'cyber_visor',
      maskId: 'none',
      armorId: 'diamond_lv2',
      accessoryId: 'none',
      petId: 'none',
    },
  },
  {
    playerId: 'friend_kenji',
    name: 'KENJI_RX',
    characterId: 'char-03',
    customization: {
      skinId: 'nordic_pale',
      eyesId: 'cyber_glow',
      mouthId: 'serious',
      hairStyleId: 'spiky_crest',
      hairColorId: 'jet_black',
      topId: 'shirt_varsity',
      pantsId: 'jeans_black',
      shoesId: 'sneakers_crimson',
      hatId: 'none',
      glassesId: 'none',
      maskId: 'cloth_mask',
      armorId: 'none',
      accessoryId: 'headphones',
      petId: 'none',
    },
  },
  {
    playerId: 'friend_amara',
    name: 'AMARA_99',
    characterId: 'char-04',
    customization: {
      skinId: 'deep_umber',
      eyesId: 'determined',
      mouthId: 'classic_smile',
      hairStyleId: 'asym_bob',
      hairColorId: 'auburn',
      topId: 'puffer_vest',
      pantsId: 'cargo_charcoal',
      shoesId: 'sneakers_white',
      hatId: 'none',
      glassesId: 'wayfarers',
      maskId: 'none',
      armorId: 'none',
      accessoryId: 'none',
      petId: 'none',
    },
  },
];

export interface BattleRoyaleMatchConfig {
  mapId: MapId;
  botCount: number;
  difficulty: LobbyDifficultySetting;
  squadSize?: SquadSize;
  squadAllies?: SquadFillMemberPreset[];
}

export interface BattleRoyaleEliminationPayload {
  mapId: MapId;
  placement: number;
  totalFighters: number;
  kills: number;
  damage: number;
  survivedSec: number;
  killerName: string;
  weaponName: string;
  aliveRemaining: number;
  difficulty: LobbyDifficultySetting;
  squadStillAlive?: boolean;
}

export interface BattleRoyaleResultPayload {
  mapId: MapId;
  placement: number;
  totalFighters: number;
  kills: number;
  damage: number;
  survivedSec: number;
  winnerName: string;
  winnerKills: number;
  winnerIsBot: boolean;
  playerName: string;
  eliminatedBy: string | null;
  eliminatedWeapon: string | null;
  isWinner: boolean;
  difficulty: LobbyDifficultySetting;
}

export const BOT_CALLSIGNS: readonly string[] = [
  'KESTREL-9',
  'VIPER-X',
  'NOMAD-7',
  'SHADOWFOX',
  'STRIKER-4',
  'IRONCLAD',
  'FALCON-2',
  'GHOSTLINE',
  'REAPER-08',
  'COBRA-11',
  'LYNX-PRO',
  'BLITZ-3',
  'WOLFHOUND',
  'APEX-ZERO',
  'TALON-6',
  'MIRAGE-V',
  'RAVEN-19',
  'SCORCH-5',
  'VALKYRIE',
  'PHOENIX-1',
  'ORION-77',
  'TEMPEST',
  'CYCLONE-8',
  'SENTINEL',
  'RANGER-22',
  'FROSTBITE',
  'VANGUARD',
  'HAWK-EYE',
  'SPECTRA',
  'HUNTER-14',
  'JACKAL-5',
  'WARDEN-3',
  'ONYX-99',
  'PANTHER-4',
  'BANSHEE',
  'CROSSHAIR',
  'DELTA-SIX',
  'SPARTAN-7',
  'OUTLAW-12',
  'HORIZON',
  'AEGIS-02',
  'SABER-15',
  'ZEPHYR-6',
  'DYNAMO',
  'GRIFFIN-8',
  'TITAN-44',
  'DRIFTER',
  'ECLIPSE',
  'STALKER-9',
  'PHANTOM-3',
  'CYCLOPS-7',
  'HAVOC-10',
  'KODIAK',
  'APEX-ALPHA',
  'VORTEX-21',
  'SPECTRE-X',
];
