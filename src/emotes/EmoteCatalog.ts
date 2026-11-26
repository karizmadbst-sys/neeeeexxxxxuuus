export type EmoteStyle = 'cool' | 'victory' | 'trending' | 'funny';

export type EmoteRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export type EmoteIconKind =
  | 'floss'
  | 'takeTheL'
  | 'orangeJustice'
  | 'renegade'
  | 'griddy'
  | 'gangnamStyle'
  | 'macarena'
  | 'electroShuffle';

export interface EmoteDefinition {
  id: string;
  shopItemId: string;
  name: string;
  style: EmoteStyle;
  rarity: EmoteRarity;
  priceCredits: number;
  durationSeconds: number;
  bpm: number;
  accentHex: string;
  description: string;
  iconKind: EmoteIconKind;
  defaultOwned?: boolean;
}

export const EMOTE_WHEEL_SLOT_COUNT = 8;

export const EMOTE_CATALOG: readonly EmoteDefinition[] = [
  {
    id: 'dance-floss',
    shopItemId: 'emote-dance-floss',
    name: 'Floss Dance',
    style: 'trending',
    rarity: 'Rare',
    priceCredits: 150,
    durationSeconds: 10,
    bpm: 122,
    accentHex: '#22d3ee',
    description:
      'Iconic rapid front-and-back arm pendulum synchronized with opposing hip swings.',
    iconKind: 'floss',
  },
  {
    id: 'dance-take-the-l',
    shopItemId: 'emote-dance-take-the-l',
    name: 'Take the L',
    style: 'funny',
    rarity: 'Epic',
    priceCredits: 200,
    durationSeconds: 10,
    bpm: 112,
    accentHex: '#84cc16',
    description:
      'Signature L-hand held at the forehead paired with alternating springy hop-kicks.',
    iconKind: 'takeTheL',
  },
  {
    id: 'dance-orange-justice',
    shopItemId: 'emote-dance-orange-justice',
    name: 'Orange Justice',
    style: 'trending',
    rarity: 'Epic',
    priceCredits: 250,
    durationSeconds: 10,
    bpm: 128,
    accentHex: '#f97316',
    description:
      'High-energy wide-stance knee crouch bounces with rapid diagonal arm pumps and claps.',
    iconKind: 'orangeJustice',
  },
  {
    id: 'dance-renegade',
    shopItemId: 'emote-dance-renegade',
    name: 'Renegade Dance',
    style: 'trending',
    rarity: 'Epic',
    priceCredits: 250,
    durationSeconds: 10,
    bpm: 140,
    accentHex: '#ec4899',
    description:
      'Crisp viral choreographed isolations: chest woah lock, overhead sweep, double clap, and wrist wave.',
    iconKind: 'renegade',
  },
  {
    id: 'dance-griddy',
    shopItemId: 'emote-dance-griddy',
    name: 'Griddy Dance',
    style: 'cool',
    rarity: 'Epic',
    priceCredits: 250,
    durationSeconds: 10,
    bpm: 96,
    accentHex: '#38bdf8',
    description:
      'Rhythmic alternating heel-tap bounce with back-swing arms and signature B-glasses gesture.',
    iconKind: 'griddy',
  },
  {
    id: 'dance-gangnam-style',
    shopItemId: 'emote-dance-gangnam-style',
    name: 'Gangnam Style',
    style: 'victory',
    rarity: 'Legendary',
    priceCredits: 300,
    durationSeconds: 10,
    bpm: 132,
    accentHex: '#eab308',
    description:
      'Galloping horse-trot hop stance with crossed rein pumps and overhead lasso twirls.',
    iconKind: 'gangnamStyle',
  },
  {
    id: 'dance-macarena',
    shopItemId: 'emote-dance-macarena',
    name: 'Macarena',
    style: 'funny',
    rarity: 'Rare',
    priceCredits: 250,
    durationSeconds: 10,
    bpm: 104,
    accentHex: '#f59e0b',
    description:
      'Classic 12-beat step-by-step routine from forward palms to shoulders, head, hips, wiggle, and clap turn.',
    iconKind: 'macarena',
  },
  {
    id: 'dance-electro-shuffle',
    shopItemId: 'emote-dance-electro-shuffle',
    name: 'Electro Shuffle',
    style: 'cool',
    rarity: 'Legendary',
    priceCredits: 350,
    durationSeconds: 10,
    bpm: 126,
    accentHex: '#a855f7',
    description:
      'Fast running-man & T-step shuffle footwork synced with sleek electro arm sweeps.',
    iconKind: 'electroShuffle',
  },
] as const;

export const DEFAULT_EMOTE_WHEEL_IDS: readonly (string | null)[] = [
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

const EMOTE_BY_ID = new Map<string, EmoteDefinition>();
const EMOTE_BY_SHOP_ID = new Map<string, EmoteDefinition>();

for (const emote of EMOTE_CATALOG) {
  EMOTE_BY_ID.set(emote.id, emote);
  EMOTE_BY_SHOP_ID.set(emote.shopItemId, emote);
}

export function getEmoteById(id: string | null | undefined): EmoteDefinition | undefined {
  if (!id) return undefined;
  return EMOTE_BY_ID.get(id) ?? EMOTE_BY_SHOP_ID.get(id);
}

export function getEmoteStyleLabelKey(style: EmoteStyle): string {
  switch (style) {
    case 'cool':
      return 'shop.sub.cool';
    case 'victory':
      return 'shop.sub.victory';
    case 'trending':
      return 'shop.sub.trending';
    case 'funny':
      return 'shop.sub.funny';
  }
}
