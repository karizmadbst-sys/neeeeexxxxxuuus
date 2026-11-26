import * as THREE from 'three';

export const DEFAULT_GLOO_SKIN_ID = 'gloo-arctic-classic';

export type GlooWallRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type GlooWallSilhouetteStyle =
  | 'classic_ice'
  | 'armored_fortress'
  | 'jagged_spikes'
  | 'prism_crown'
  | 'mecha_frame'
  | 'dragon_crest'
  | 'monolith_spires'
  | 'holo_grid';

export type GlooWallTexturePattern =
  | 'crystal'
  | 'obsidian'
  | 'hex'
  | 'magma'
  | 'mecha'
  | 'sakura'
  | 'hazard'
  | 'pharaoh'
  | 'cyber'
  | 'nebula'
  | 'scales'
  | 'inferno';

export type GlooWallAmbientFxStyle =
  | 'frost_shimmer'
  | 'ember_pulse'
  | 'holo_scan'
  | 'arcane_glow'
  | 'toxic_surge'
  | 'solar_gleam';

export interface GlooPanelSpec {
  readonly px: number;
  readonly pz: number;
  readonly ang: number;
  readonly cosP: number;
  readonly sinP: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly halfD: number;
}

export const GLOO_WALL_ARC_RADIUS = 2.5;
export const GLOO_WALL_ARC_HALF_ANGLE = (65 * Math.PI) / 180; // 130° semi-circular wrap-around

function makeArcPanelSpec(
  degAngle: number,
  width: number,
  height: number,
  depth: number,
): GlooPanelSpec {
  const ang = (degAngle * Math.PI) / 180;
  const sinP = Math.sin(ang);
  const cosP = Math.cos(ang);
  return {
    px: GLOO_WALL_ARC_RADIUS * sinP,
    pz: GLOO_WALL_ARC_RADIUS * (cosP - 1),
    ang,
    cosP,
    sinP,
    width,
    height,
    depth,
    halfW: width * 0.5,
    halfH: height * 0.5,
    halfD: depth * 0.5 + 0.01,
  };
}

/**
 * Shared Free Fire-style semi-circular curved 5-panel Gloo Wall hitbox layout.
 * Radius = 2.50m centered near the deploying player, spanning ±65° (~4.8m wide, ~1.5m deep curve),
 * with a realistic ~2.06m arched height proportional to the ~1.72m character.
 * Identical across EVERY skin so gameplay protection, height, width, and collision
 * remain 100% consistent regardless of equipped cosmetic.
 */
export const GLOO_WALL_PANEL_SPECS: readonly GlooPanelSpec[] = [
  makeArcPanelSpec(0, 1.18, 2.06, 0.32),
  makeArcPanelSpec(-26, 1.18, 2.02, 0.32),
  makeArcPanelSpec(26, 1.18, 2.02, 0.32),
  makeArcPanelSpec(-52, 1.18, 1.92, 0.32),
  makeArcPanelSpec(52, 1.18, 1.92, 0.32),
];

export interface GlooWallSkinDefinition {
  readonly id: string;
  readonly shopId: string;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
  readonly rarity: GlooWallRarity;
  readonly price: number;
  readonly defaultOwned?: boolean;
  readonly featured?: boolean;
  readonly badge?: string;
  readonly silhouette: GlooWallSilhouetteStyle;
  readonly pattern: GlooWallTexturePattern;
  readonly fxStyle: GlooWallAmbientFxStyle;
  readonly fxLabel: string;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly accentHex: string;
  readonly emissiveHex: string;
  readonly trimHex: string;
  readonly shardHex: string;
  readonly frostRingHex: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly opacity: number;
  readonly baseEmissiveIntensity: number;
  readonly imageUrl?: string;
}

export const GLOO_WALL_SKINS: readonly GlooWallSkinDefinition[] = [
  {
    id: DEFAULT_GLOO_SKIN_ID,
    shopId: 'shop-gloo-arctic-classic',
    name: 'Arctic Cryo Barrier',
    subtitle: 'Standard Issue Glacial Wall',
    description:
      'Classic pressurized glacial shield with translucent faceted ice armor and crisp cryo-frost aura.',
    rarity: 'common',
    price: 0,
    defaultOwned: true,
    silhouette: 'classic_ice',
    pattern: 'crystal',
    fxStyle: 'frost_shimmer',
    fxLabel: 'Cryo Shimmer',
    primaryHex: '#bae6fd',
    secondaryHex: '#0284c7',
    accentHex: '#38bdf8',
    emissiveHex: '#0ea5e9',
    trimHex: '#e0f2fe',
    shardHex: '#7dd3fc',
    frostRingHex: '#38bdf8',
    roughness: 0.2,
    metalness: 0.12,
    opacity: 0.91,
    baseEmissiveIntensity: 0.28,
  },
  {
    id: 'gloo-obsidian-bastion',
    shopId: 'shop-gloo-obsidian-bastion',
    name: 'Obsidian Bastion',
    subtitle: 'Tactical Riot Bulwark',
    description:
      'Reinforced matte-carbon fortress barrier with chamfered ballistic ribs and amber tactical caution stripes.',
    rarity: 'common',
    price: 350,
    silhouette: 'armored_fortress',
    pattern: 'obsidian',
    fxStyle: 'solar_gleam',
    fxLabel: 'Tactical Pulse',
    primaryHex: '#334155',
    secondaryHex: '#0f172a',
    accentHex: '#f59e0b',
    emissiveHex: '#d97706',
    trimHex: '#fbbf24',
    shardHex: '#94a3b8',
    frostRingHex: '#f59e0b',
    roughness: 0.44,
    metalness: 0.58,
    opacity: 0.98,
    baseEmissiveIntensity: 0.22,
  },
  {
    id: 'gloo-emerald-aegis',
    shopId: 'shop-gloo-emerald-aegis',
    name: 'Bio-Emerald Aegis',
    subtitle: 'Honeycomb Kinetic Shield',
    description:
      'Hex-lattice emerald polymer barrier engineered with pulsing bioluminescent energy cells.',
    rarity: 'rare',
    price: 550,
    silhouette: 'holo_grid',
    pattern: 'hex',
    fxStyle: 'holo_scan',
    fxLabel: 'Hex Energy Scan',
    primaryHex: '#34d399',
    secondaryHex: '#065f46',
    accentHex: '#10b981',
    emissiveHex: '#059669',
    trimHex: '#a7f3d0',
    shardHex: '#6ee7b7',
    frostRingHex: '#10b981',
    roughness: 0.24,
    metalness: 0.28,
    opacity: 0.9,
    baseEmissiveIntensity: 0.34,
  },
  {
    id: 'gloo-crimson-magma',
    shopId: 'shop-gloo-crimson-magma',
    name: 'Crimson Magma Wall',
    subtitle: 'Volcanic Basalt Core',
    description:
      'Jagged obsidian crust split by molten lava veins that flare intensely upon deployment.',
    rarity: 'rare',
    price: 650,
    featured: true,
    badge: 'HOT',
    silhouette: 'jagged_spikes',
    pattern: 'magma',
    fxStyle: 'ember_pulse',
    fxLabel: 'Molten Ember',
    primaryHex: '#7f1d1d',
    secondaryHex: '#1c1917',
    accentHex: '#f97316',
    emissiveHex: '#ea580c',
    trimHex: '#fb923c',
    shardHex: '#f97316',
    frostRingHex: '#ea580c',
    roughness: 0.48,
    metalness: 0.22,
    opacity: 0.97,
    baseEmissiveIntensity: 0.42,
  },
  {
    id: 'gloo-cobalt-mecha',
    shopId: 'shop-gloo-cobalt-mecha',
    name: 'Cobalt Mecha Shield',
    subtitle: 'Exo-Frame Heavy Barricade',
    description:
      'Articulated aerospace alloy barricade framed by cobalt hydraulic struts and cyan servo accents.',
    rarity: 'rare',
    price: 700,
    silhouette: 'mecha_frame',
    pattern: 'mecha',
    fxStyle: 'holo_scan',
    fxLabel: 'Servo Telemetry',
    primaryHex: '#3b82f6',
    secondaryHex: '#1e3a8a',
    accentHex: '#22d3ee',
    emissiveHex: '#0284c7',
    trimHex: '#67e8f9',
    shardHex: '#60a5fa',
    frostRingHex: '#22d3ee',
    roughness: 0.28,
    metalness: 0.72,
    opacity: 0.96,
    baseEmissiveIntensity: 0.3,
  },
  {
    id: 'gloo-sakura-prism',
    shopId: 'shop-gloo-sakura-prism',
    name: 'Sakura Prism Wall',
    subtitle: 'Blossom Crystal Facet',
    description:
      'Rose-quartz crystalline barrier adorned with sculpted petal crests and shimmering blossom light.',
    rarity: 'epic',
    price: 850,
    featured: true,
    badge: 'POPULAR',
    silhouette: 'prism_crown',
    pattern: 'sakura',
    fxStyle: 'frost_shimmer',
    fxLabel: 'Blossom Prism',
    primaryHex: '#fbcfe8',
    secondaryHex: '#be185d',
    accentHex: '#f472b6',
    emissiveHex: '#ec4899',
    trimHex: '#fce7f3',
    shardHex: '#f9a8d4',
    frostRingHex: '#f472b6',
    roughness: 0.18,
    metalness: 0.16,
    opacity: 0.9,
    baseEmissiveIntensity: 0.34,
  },
  {
    id: 'gloo-venom-acid',
    shopId: 'shop-gloo-venom-acid',
    name: 'Venom Acid Barricade',
    subtitle: 'Bio-Hazard Containment',
    description:
      'Spiked containment barrier pulsing with radioactive lime-acid veins and industrial hazard chevrons.',
    rarity: 'epic',
    price: 900,
    silhouette: 'jagged_spikes',
    pattern: 'hazard',
    fxStyle: 'toxic_surge',
    fxLabel: 'Toxic Surge',
    primaryHex: '#4d7c0f',
    secondaryHex: '#1a2e05',
    accentHex: '#a3e635',
    emissiveHex: '#84cc16',
    trimHex: '#bef264',
    shardHex: '#a3e635',
    frostRingHex: '#84cc16',
    roughness: 0.32,
    metalness: 0.26,
    opacity: 0.94,
    baseEmissiveIntensity: 0.38,
  },
  {
    id: 'gloo-solar-pharaoh',
    shopId: 'shop-gloo-solar-pharaoh',
    name: 'Solar Pharaoh Aegis',
    subtitle: 'Gilded Sun Monolith',
    description:
      'Royal sandstone and burnished gold monolith inscribed with luminous sun-disc hieroglyphs.',
    rarity: 'epic',
    price: 1050,
    silhouette: 'monolith_spires',
    pattern: 'pharaoh',
    fxStyle: 'solar_gleam',
    fxLabel: 'Solar Radiance',
    primaryHex: '#eab308',
    secondaryHex: '#713f12',
    accentHex: '#fde047',
    emissiveHex: '#ca8a04',
    trimHex: '#fef08a',
    shardHex: '#facc15',
    frostRingHex: '#facc15',
    roughness: 0.26,
    metalness: 0.78,
    opacity: 0.97,
    baseEmissiveIntensity: 0.32,
  },
  {
    id: 'gloo-cyber-neon',
    shopId: 'shop-gloo-cyber-neon',
    name: 'Cyber Neon Matrix',
    subtitle: 'Synthwave Hard-Light',
    description:
      'Holographic neon-magenta and electric-cyan hard-light wall framed by futuristic projector pylons.',
    rarity: 'legendary',
    price: 1100,
    featured: true,
    badge: 'CYBER',
    silhouette: 'holo_grid',
    pattern: 'cyber',
    fxStyle: 'holo_scan',
    fxLabel: 'Hard-Light Matrix',
    primaryHex: '#6366f1',
    secondaryHex: '#1e1b4b',
    accentHex: '#f0abfc',
    emissiveHex: '#d946ef',
    trimHex: '#22d3ee',
    shardHex: '#e879f9',
    frostRingHex: '#d946ef',
    roughness: 0.16,
    metalness: 0.45,
    opacity: 0.88,
    baseEmissiveIntensity: 0.46,
  },
  {
    id: 'gloo-void-nebula',
    shopId: 'shop-gloo-void-nebula',
    name: 'Void Nebula Rift',
    subtitle: 'Astral Singularity Wall',
    description:
      'Deep-space rift barrier suspended between obsidian monolith spires with starfield crystal shimmer.',
    rarity: 'legendary',
    price: 1350,
    silhouette: 'monolith_spires',
    pattern: 'nebula',
    fxStyle: 'arcane_glow',
    fxLabel: 'Astral Rift',
    primaryHex: '#7c3aed',
    secondaryHex: '#0f0728',
    accentHex: '#c4b5fd',
    emissiveHex: '#8b5cf6',
    trimHex: '#ddd6fe',
    shardHex: '#a78bfa',
    frostRingHex: '#8b5cf6',
    roughness: 0.2,
    metalness: 0.34,
    opacity: 0.92,
    baseEmissiveIntensity: 0.44,
  },
  {
    id: 'gloo-frost-dragon',
    shopId: 'shop-gloo-frost-dragon',
    name: 'Frost Dragon Scale',
    subtitle: 'Elder Wyrm Cryo Crest',
    description:
      'Sculpted glacier dragon scales crowned with twin frost horns and piercing arctic sapphire brilliance.',
    rarity: 'legendary',
    price: 1500,
    featured: true,
    badge: 'LEGENDARY',
    silhouette: 'dragon_crest',
    pattern: 'scales',
    fxStyle: 'frost_shimmer',
    fxLabel: 'Wyrm Frost Aura',
    primaryHex: '#67e8f9',
    secondaryHex: '#0c4a6e',
    accentHex: '#e0f2fe',
    emissiveHex: '#06b6d4',
    trimHex: '#cffafe',
    shardHex: '#22d3ee',
    frostRingHex: '#06b6d4',
    roughness: 0.17,
    metalness: 0.32,
    opacity: 0.91,
    baseEmissiveIntensity: 0.42,
  },
  {
    id: 'gloo-infernal-sovereign',
    shopId: 'shop-gloo-infernal-sovereign',
    name: 'Infernal Sovereign',
    subtitle: 'Mythic Hellfire Crown',
    description:
      'Forged dark-gold obsidian monolith crowned with horned infernal spires and blazing sovereign runes.',
    rarity: 'mythic',
    price: 1750,
    featured: true,
    badge: 'MYTHIC',
    silhouette: 'dragon_crest',
    pattern: 'inferno',
    fxStyle: 'ember_pulse',
    fxLabel: 'Sovereign Hellfire',
    primaryHex: '#b91c1c',
    secondaryHex: '#181014',
    accentHex: '#fbbf24',
    emissiveHex: '#ef4444',
    trimHex: '#fde047',
    shardHex: '#f87171',
    frostRingHex: '#ef4444',
    roughness: 0.26,
    metalness: 0.64,
    opacity: 0.96,
    baseEmissiveIntensity: 0.5,
  },
  // --- 20 CUSTOM ART SNOW SKINS (EXACT UPLOAD ORDER 01..20) ---
  ...[
    {
      num: '01',
      name: 'SpongeBob Mood Snow',
      subtitle: 'Custom Art Snow #01',
      description: 'Wrapped 3D snow barrier featuring dual-mood SpongeBob illustration across all exterior surfaces.',
      rarity: 'epic' as const,
      price: 500,
      accentHex: '#facc15',
      primaryHex: '#fef08a',
      secondaryHex: '#0284c7',
      imageUrl: './assets/aistudio/923704680_1960398352011440_3683722086022814271_n_93dfbdaa.jpg',
    },
    {
      num: '02',
      name: 'Heart-Eyes Rose Snow',
      subtitle: 'Custom Art Snow #02',
      description: 'Wrapped 3D snow barrier showcasing a blushing heart-eyed character offering a red rose.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#fb7185',
      primaryHex: '#fff1f2',
      secondaryHex: '#fda4af',
      imageUrl: './assets/aistudio/923704677_1460965398875924_5730263265572276972_n_08fd443e.jpg',
    },
    {
      num: '03',
      name: 'Blossom Bouquet Snow',
      subtitle: 'Custom Art Snow #03',
      description: 'Wrapped 3D snow barrier featuring a shy character holding a bright pastel flower bouquet.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#f472b6',
      primaryHex: '#ffffff',
      secondaryHex: '#fbcfe8',
      imageUrl: './assets/aistudio/920472664_1468453344612817_7654759707855153719_n_d1c2c28f.jpg',
    },
    {
      num: '04',
      name: 'Crimson Bouquet Snow',
      subtitle: 'Custom Art Snow #04',
      description: 'Wrapped 3D snow barrier displaying a wide-eyed character holding a bouquet of red roses.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#ef4444',
      primaryHex: '#ffffff',
      secondaryHex: '#fca5a5',
      imageUrl: './assets/aistudio/920950383_1107023618811273_5586628259209884243_n_db9df8af.jpg',
    },
    {
      num: '05',
      name: 'Slipper Dodge Snow',
      subtitle: 'Custom Art Snow #05',
      description: 'Wrapped 3D snow barrier illustrating a frantic dodge from a flying blue flip-flop.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#3b82f6',
      primaryHex: '#f8fafc',
      secondaryHex: '#60a5fa',
      imageUrl: './assets/aistudio/920862397_1298811862422529_1122637155246563589_n_b070e5c1.jpg',
    },
    {
      num: '06',
      name: 'Flork Chase Bat Snow',
      subtitle: 'Custom Art Snow #06',
      description: 'Wrapped 3D snow barrier featuring a Flork bat-chase comic across the curved surface.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#94a3b8',
      primaryHex: '#ffffff',
      secondaryHex: '#cbd5e1',
      imageUrl: './assets/aistudio/926207749_1679033927262570_3024875575601066420_n_eae10348.jpg',
    },
    {
      num: '07',
      name: 'Dramatic Slap Snow',
      subtitle: 'Custom Art Snow #07',
      description: 'Wrapped 3D snow barrier emblazoned with a classic dramatic slap meme illustration.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#94a3b8',
      primaryHex: '#ffffff',
      secondaryHex: '#cbd5e1',
      imageUrl: './assets/aistudio/922743987_963924366551604_4946711150487727040_n_de3a1bc7.jpg',
    },
    {
      num: '08',
      name: 'Knockout Flop Snow',
      subtitle: 'Custom Art Snow #08',
      description: 'Wrapped 3D snow barrier showcasing a dramatic floor-faint Flork illustration.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#f43f5e',
      primaryHex: '#ffffff',
      secondaryHex: '#fda4af',
      imageUrl: './assets/aistudio/921124578_1460204379647724_7386976212031492006_n_5c8e1677.jpg',
    },
    {
      num: '09',
      name: 'Blue Rose Grin Snow',
      subtitle: 'Custom Art Snow #09',
      description: 'Wrapped 3D snow barrier featuring a suave blue smiley biting a red rose.',
      rarity: 'epic' as const,
      price: 600,
      accentHex: '#38bdf8',
      primaryHex: '#22c55e',
      secondaryHex: '#0284c7',
      imageUrl: './assets/aistudio/920638099_5591725571053590_7172781687598891189_n_87b55e72.jpg',
    },
    {
      num: '10',
      name: 'Pink Rose Grin Snow',
      subtitle: 'Custom Art Snow #10',
      description: 'Wrapped 3D snow barrier featuring a playful pink smiley biting a red rose.',
      rarity: 'epic' as const,
      price: 600,
      accentHex: '#f472b6',
      primaryHex: '#22c55e',
      secondaryHex: '#db2777',
      imageUrl: './assets/aistudio/920819479_1507854831405453_6925840786124896623_n_75681c24.jpg',
    },
    {
      num: '11',
      name: 'Ghost Yell Duo Snow',
      subtitle: 'Custom Art Snow #11',
      description: 'Wrapped 3D snow barrier showing the yelling ghost & shy Flork duo wrap-around.',
      rarity: 'rare' as const,
      price: 450,
      accentHex: '#cbd5e1',
      primaryHex: '#ffffff',
      secondaryHex: '#94a3b8',
      imageUrl: './assets/aistudio/921124578_1710744357327825_6697752097865980791_n_7f2379f3.jpg',
    },
    {
      num: '12',
      name: 'Polite Smile Cat Snow',
      subtitle: 'Custom Art Snow #12',
      description: 'Wrapped 3D snow barrier featuring the polite smiling white-and-black cat.',
      rarity: 'epic' as const,
      price: 650,
      accentHex: '#e2e8f0',
      primaryHex: '#f8fafc',
      secondaryHex: '#64748b',
      imageUrl: './assets/aistudio/919235582_2261060071424329_5065734412637947970_n_96bbb034.jpg',
    },
    {
      num: '13',
      name: 'Wide-Eyed Grin Cat Snow',
      subtitle: 'Custom Art Snow #13',
      description: 'Wrapped 3D snow barrier showcasing a wide-eyed grinning ginger-and-white cat.',
      rarity: 'epic' as const,
      price: 650,
      accentHex: '#fb923c',
      primaryHex: '#fed7aa',
      secondaryHex: '#ea580c',
      imageUrl: './assets/aistudio/918163168_918134751291980_7712925679243719037_n_ed6cd6a3.jpg',
    },
    {
      num: '14',
      name: 'Banana Lick Cat Snow',
      subtitle: 'Custom Art Snow #14',
      description: 'Wrapped 3D snow barrier displaying a cat enthusiastically licking a banana.',
      rarity: 'epic' as const,
      price: 650,
      accentHex: '#facc15',
      primaryHex: '#fef08a',
      secondaryHex: '#ca8a04',
      imageUrl: './assets/aistudio/921407828_2214567145850862_1204615926952018352_n_9e68dd3c.jpg',
    },
    {
      num: '15',
      name: 'Judgy Stare Cat Snow',
      subtitle: 'Custom Art Snow #15',
      description: 'Wrapped 3D snow barrier locked with a deadpan grumpy tabby cat stare.',
      rarity: 'epic' as const,
      price: 650,
      accentHex: '#94a3b8',
      primaryHex: '#cbd5e1',
      secondaryHex: '#475569',
      imageUrl: './assets/aistudio/917537252_1154441623831215_375364550177111997_n_f992842a.jpg',
    },
    {
      num: '16',
      name: 'Shocked Gasp Cat Snow',
      subtitle: 'Custom Art Snow #16',
      description: 'Wrapped 3D snow barrier featuring an astonished open-mouth silver tabby cat.',
      rarity: 'epic' as const,
      price: 650,
      accentHex: '#cbd5e1',
      primaryHex: '#e2e8f0',
      secondaryHex: '#64748b',
      imageUrl: './assets/aistudio/924338142_1652874143238998_7043949976264323447_n_c03ba003.jpg',
    },
    {
      num: '17',
      name: 'Rose Kitten Snow',
      subtitle: 'Custom Art Snow #17',
      description: 'Wrapped 3D snow barrier showcasing a cute tabby kitten offering a fresh red rose.',
      rarity: 'legendary' as const,
      price: 800,
      accentHex: '#f43f5e',
      primaryHex: '#ffe4e6',
      secondaryHex: '#be123c',
      imageUrl: './assets/aistudio/919502569_1825516955266405_499462022332306144_n_ef37e4d1.jpg',
    },
    {
      num: '18',
      name: 'People Nowadays Snow',
      subtitle: 'Custom Art Snow #18',
      description: 'Wrapped 3D snow barrier sporting the classic "People Nowadays" comic strip.',
      rarity: 'rare' as const,
      price: 500,
      accentHex: '#a3a3a3',
      primaryHex: '#ffffff',
      secondaryHex: '#737373',
      imageUrl: './assets/aistudio/916886091_2738173396711921_196995532272249455_n_3f671f83.jpg',
    },
    {
      num: '19',
      name: 'Shut Up Pinch Snow',
      subtitle: 'Custom Art Snow #19',
      description: 'Wrapped 3D snow barrier featuring the comedic "shut up" mouth-pinch meme.',
      rarity: 'rare' as const,
      price: 500,
      accentHex: '#f472b6',
      primaryHex: '#ffffff',
      secondaryHex: '#db2777',
      imageUrl: './assets/aistudio/924193566_828342357040867_9192907161455492481_n_87565edb.jpg',
    },
    {
      num: '20',
      name: 'Side-Eye Cat Snow',
      subtitle: 'Custom Art Snow #20',
      description: 'Wrapped 3D snow barrier displaying a fluffy cat giving an iconic suspicious side-eye.',
      rarity: 'legendary' as const,
      price: 850,
      accentHex: '#e2e8f0',
      primaryHex: '#f1f5f9',
      secondaryHex: '#64748b',
      imageUrl: './assets/aistudio/928194235_1674001524173536_6873914276390131824_n_29dfc3dd.jpg',
    },
  ].map(
    (entry): GlooWallSkinDefinition => ({
      id: `gloo-snow-${entry.num}`,
      shopId: `shop-gloo-snow-${entry.num}`,
      name: entry.name,
      subtitle: entry.subtitle,
      description: entry.description,
      rarity: entry.rarity,
      price: entry.price,
      silhouette: 'classic_ice',
      pattern: 'crystal',
      fxStyle: 'frost_shimmer',
      fxLabel: 'Custom 3D Wrap',
      primaryHex: entry.primaryHex,
      secondaryHex: entry.secondaryHex,
      accentHex: entry.accentHex,
      emissiveHex: entry.accentHex,
      trimHex: entry.accentHex,
      shardHex: entry.accentHex,
      frostRingHex: entry.accentHex,
      roughness: 0.46,
      metalness: 0.05,
      opacity: 1,
      baseEmissiveIntensity: 0.14,
      imageUrl: entry.imageUrl,
    }),
  ),
];

const SKIN_BY_ID = new Map<string, GlooWallSkinDefinition>();
const SKIN_BY_SHOP_ID = new Map<string, GlooWallSkinDefinition>();
for (const skin of GLOO_WALL_SKINS) {
  SKIN_BY_ID.set(skin.id, skin);
  SKIN_BY_SHOP_ID.set(skin.shopId, skin);
}

export function isValidGlooSkinId(id: unknown): id is string {
  return typeof id === 'string' && SKIN_BY_ID.has(id);
}

export function getGlooWallSkinById(id?: string | null): GlooWallSkinDefinition {
  if (id && SKIN_BY_ID.has(id)) {
    return SKIN_BY_ID.get(id)!;
  }
  return SKIN_BY_ID.get(DEFAULT_GLOO_SKIN_ID)!;
}

export function getGlooWallSkinByShopId(shopId?: string | null): GlooWallSkinDefinition | null {
  if (!shopId) return null;
  return SKIN_BY_SHOP_ID.get(shopId) ?? null;
}

interface CachedSkinTextures {
  diffuse: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  loaded: boolean;
  loadPromise?: Promise<void>;
}

const skinTextureCache = new Map<string, CachedSkinTextures>();
let sharedCrackTexture: THREE.CanvasTexture | null = null;
let sharedFrostRingTexture: THREE.CanvasTexture | null = null;

const PHOTO_TEX_WIDTH = 1536;
const PHOTO_TEX_HEIGHT = 560;

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function buildDiffuseTexture(skin: GlooWallSkinDefinition): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(256);
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, skin.primaryHex);
    grad.addColorStop(0.55, skin.primaryHex);
    grad.addColorStop(1, skin.secondaryHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    switch (skin.pattern) {
      case 'crystal': {
        for (let i = 0; i < 64; i++) {
          const x = (i * 53) % 256;
          const y = (i * 97) % 256;
          const w = 18 + (i % 4) * 14;
          const h = 24 + (i % 5) * 18;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(12,74,110,0.22)';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y + h * 0.42);
          ctx.lineTo(x + w * 0.32, y + h);
          ctx.closePath();
          ctx.fill();
        }
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = 'rgba(240, 249, 255, 0.16)';
          ctx.fillRect(i * 22 + 4, 0, 3, 256);
        }
        break;
      }

      case 'obsidian': {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        for (let y = 24; y < 256; y += 44) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(256, y);
          ctx.stroke();
        }
        ctx.fillStyle = skin.accentHex;
        for (let x = -32; x < 288; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 214);
          ctx.lineTo(x + 14, 214);
          ctx.lineTo(x + 26, 238);
          ctx.lineTo(x + 12, 238);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(226,232,240,0.45)';
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 4; c++) {
            ctx.beginPath();
            ctx.arc(24 + c * 68, 22 + r * 36, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }

      case 'hex': {
        ctx.strokeStyle = skin.trimHex;
        ctx.globalAlpha = 0.46;
        ctx.lineWidth = 2.2;
        const r = 18;
        const dx = r * 1.5;
        const dy = r * Math.sqrt(3);
        for (let row = -1; row < 12; row++) {
          for (let col = -1; col < 12; col++) {
            const cx = col * dx;
            const cy = row * dy + (col % 2 === 0 ? 0 : dy * 0.5);
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2;
              const px = cx + Math.cos(a) * r;
              const py = cy + Math.sin(a) * r;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'magma':
      case 'inferno': {
        ctx.fillStyle = 'rgba(15, 10, 12, 0.58)';
        for (let i = 0; i < 36; i++) {
          const x = (i * 67) % 256;
          const y = (i * 83) % 256;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 36, y + 12);
          ctx.lineTo(x + 28, y + 44);
          ctx.lineTo(x - 10, y + 34);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = skin.accentHex;
        ctx.lineWidth = 3.2;
        for (let i = 0; i < 10; i++) {
          let x = (i * 29) % 256;
          let y = 0;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let s = 0; s < 8; s++) {
            x += ((s + i) % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 4);
            y += 32;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        if (skin.pattern === 'inferno') {
          ctx.strokeStyle = skin.trimHex;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(128, 36);
          ctx.lineTo(176, 118);
          ctx.lineTo(128, 206);
          ctx.lineTo(80, 118);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(128, 64);
          ctx.lineTo(154, 118);
          ctx.lineTo(128, 174);
          ctx.lineTo(102, 118);
          ctx.closePath();
          ctx.stroke();
        }
        break;
      }

      case 'mecha': {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.fillRect(0, 112, 256, 32);
        ctx.strokeStyle = skin.trimHex;
        ctx.lineWidth = 3;
        ctx.strokeRect(14, 14, 228, 228);
        ctx.strokeRect(32, 42, 192, 62);
        ctx.strokeRect(32, 152, 192, 72);
        ctx.fillStyle = skin.accentHex;
        ctx.fillRect(52, 122, 152, 10);
        break;
      }

      case 'sakura': {
        for (let i = 0; i < 40; i++) {
          const x = (i * 61) % 256;
          const y = (i * 43) % 256;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(219,39,119,0.2)';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 28, y + 14);
          ctx.lineTo(x + 10, y + 36);
          ctx.closePath();
          ctx.fill();
        }
        for (let p = 0; p < 16; p++) {
          const cx = (p * 53 + 22) % 230 + 12;
          const cy = (p * 79 + 18) % 220 + 16;
          ctx.fillStyle = 'rgba(255, 241, 248, 0.85)';
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + p;
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 5, 3, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'hazard': {
        ctx.fillStyle = 'rgba(10, 20, 4, 0.45)';
        for (let x = -128; x < 384; x += 34) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + 16, 0);
          ctx.lineTo(x + 144, 256);
          ctx.lineTo(x + 128, 256);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = skin.accentHex;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(128, 128, 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(128, 128, 18, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'pharaoh': {
        ctx.fillStyle = 'rgba(69, 26, 3, 0.32)';
        for (let y = 0; y < 256; y += 32) {
          ctx.fillRect(0, y, 256, 6);
        }
        ctx.strokeStyle = skin.trimHex;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(128, 108, 44, 0, Math.PI * 2);
        ctx.stroke();
        for (let r = 0; r < 12; r++) {
          const a = (r / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(128 + Math.cos(a) * 50, 108 + Math.sin(a) * 50);
          ctx.lineTo(128 + Math.cos(a) * 74, 108 + Math.sin(a) * 74);
          ctx.stroke();
        }
        ctx.strokeRect(18, 18, 220, 220);
        break;
      }

      case 'cyber': {
        ctx.strokeStyle = skin.trimHex;
        ctx.lineWidth = 2;
        for (let i = 0; i <= 256; i += 24) {
          ctx.globalAlpha = 0.42;
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 256);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(256, i);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = skin.accentHex;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(24, 196);
        ctx.lineTo(86, 134);
        ctx.lineTo(148, 134);
        ctx.lineTo(212, 64);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }

      case 'nebula': {
        const neb1 = ctx.createRadialGradient(90, 96, 8, 90, 96, 110);
        neb1.addColorStop(0, 'rgba(232, 121, 249, 0.72)');
        neb1.addColorStop(0.55, 'rgba(124, 58, 237, 0.35)');
        neb1.addColorStop(1, 'rgba(15, 7, 40, 0)');
        ctx.fillStyle = neb1;
        ctx.fillRect(0, 0, 256, 256);

        const neb2 = ctx.createRadialGradient(184, 178, 6, 184, 178, 96);
        neb2.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
        neb2.addColorStop(1, 'rgba(15, 7, 40, 0)');
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, 256, 256);

        ctx.fillStyle = '#ffffff';
        for (let s = 0; s < 70; s++) {
          const sx = (s * 73 + 17) % 256;
          const sy = (s * 41 + 29) % 256;
          const sr = s % 5 === 0 ? 2.1 : 1.1;
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'scales': {
        ctx.strokeStyle = skin.trimHex;
        ctx.lineWidth = 2.4;
        for (let row = 0; row < 12; row++) {
          for (let col = -1; col < 10; col++) {
            const cx = col * 32 + (row % 2 === 0 ? 0 : 16);
            const cy = row * 24;
            ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(224,242,254,0.22)' : 'rgba(8,47,73,0.28)';
            ctx.beginPath();
            ctx.arc(cx, cy, 18, 0, Math.PI);
            ctx.fill();
            ctx.stroke();
          }
        }
        break;
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildRoughnessTexture(skin: GlooWallSkinDefinition): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(128);
  if (ctx) {
    const base = Math.round(Math.max(25, Math.min(220, skin.roughness * 255)));
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 84; i++) {
      const delta = ((i * 23) % 70) - 35;
      const v = Math.max(18, Math.min(240, base + delta));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect((i * 31) % 128, (i * 47) % 128, 10 + (i % 12), 14 + (i % 16));
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function paintPhotoCompositeToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const iw = Math.max(1, img.naturalWidth || img.width);
  const ih = Math.max(1, img.naturalHeight || img.height);
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Fit full height while strictly preserving natural aspect ratio (no horizontal squash)
  const drawH = h;
  const drawW = Math.min(w, Math.round(h * (iw / ih)));
  const x0 = Math.round((w - drawW) * 0.5);
  const x1 = x0 + drawW;

  // Build soft edge-extension wings so left/right sides match border tone & gradients seamlessly
  const stripW = Math.max(4, Math.min(iw, Math.round(iw * 0.14)));

  if (x0 > 0) {
    const leftWing = document.createElement('canvas');
    leftWing.width = 6;
    leftWing.height = 36;
    const lCtx = leftWing.getContext('2d');
    if (lCtx) {
      // Sample left edge horizontally mirrored so edge matches center pixel-for-pixel at x0
      lCtx.save();
      lCtx.translate(leftWing.width, 0);
      lCtx.scale(-1, 1);
      lCtx.drawImage(img, 0, 0, stripW, ih, 0, 0, leftWing.width, leftWing.height);
      lCtx.restore();
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(leftWing, 0, 0, x0 + 14, h);
      ctx.restore();
    }
  }

  if (x1 < w) {
    const rightWing = document.createElement('canvas');
    rightWing.width = 6;
    rightWing.height = 36;
    const rCtx = rightWing.getContext('2d');
    if (rCtx) {
      rCtx.save();
      rCtx.translate(rightWing.width, 0);
      rCtx.scale(-1, 1);
      rCtx.drawImage(img, iw - stripW, 0, stripW, ih, 0, 0, rightWing.width, rightWing.height);
      rCtx.restore();
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(rightWing, x1 - 14, 0, w - x1 + 14, h);
      ctx.restore();
    }
  }

  // Draw the full-resolution crisp image centered at exact natural aspect ratio
  // Feather outer 8px on left/right edges so photo blends seamlessly into the curved wings
  if (x0 > 0 && drawW > 24) {
    const feather = Math.min(10, Math.floor(drawW * 0.03));
    const centerBuf = document.createElement('canvas');
    centerBuf.width = drawW;
    centerBuf.height = drawH;
    const cCtx = centerBuf.getContext('2d');
    if (cCtx) {
      cCtx.imageSmoothingEnabled = true;
      cCtx.imageSmoothingQuality = 'high';
      cCtx.drawImage(img, 0, 0, drawW, drawH);

      cCtx.globalCompositeOperation = 'destination-in';
      const alphaGrad = cCtx.createLinearGradient(0, 0, drawW, 0);
      const tL = feather / drawW;
      const tR = 1 - feather / drawW;
      alphaGrad.addColorStop(0, 'rgba(0,0,0,0)');
      alphaGrad.addColorStop(tL, 'rgba(0,0,0,1)');
      alphaGrad.addColorStop(tR, 'rgba(0,0,0,1)');
      alphaGrad.addColorStop(1, 'rgba(0,0,0,0)');
      cCtx.fillStyle = alphaGrad;
      cCtx.fillRect(0, 0, drawW, drawH);

      ctx.drawImage(centerBuf, x0, 0);
    } else {
      ctx.drawImage(img, x0, 0, drawW, drawH);
    }
  } else {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x0, 0, drawW, drawH);
    ctx.restore();
  }
}

function buildPhotoTextureStub(skin: GlooWallSkinDefinition): CachedSkinTextures {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_TEX_WIDTH;
  canvas.height = PHOTO_TEX_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, PHOTO_TEX_HEIGHT);
    grad.addColorStop(0, skin.primaryHex);
    grad.addColorStop(1, skin.secondaryHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, PHOTO_TEX_WIDTH, PHOTO_TEX_HEIGHT);
  }

  const diffuse = new THREE.CanvasTexture(canvas);
  diffuse.colorSpace = THREE.SRGBColorSpace;
  diffuse.wrapS = THREE.ClampToEdgeWrapping;
  diffuse.wrapT = THREE.ClampToEdgeWrapping;
  diffuse.generateMipmaps = true;
  diffuse.minFilter = THREE.LinearMipmapLinearFilter;
  diffuse.magFilter = THREE.LinearFilter;
  diffuse.anisotropy = 8;

  const { canvas: rCanvas, ctx: rCtx } = createCanvas(8);
  if (rCtx) {
    const v = Math.round(Math.max(40, Math.min(220, skin.roughness * 255)));
    rCtx.fillStyle = `rgb(${v},${v},${v})`;
    rCtx.fillRect(0, 0, 8, 8);
  }
  const roughness = new THREE.CanvasTexture(rCanvas);
  roughness.wrapS = THREE.ClampToEdgeWrapping;
  roughness.wrapT = THREE.ClampToEdgeWrapping;

  const entry: CachedSkinTextures = {
    diffuse,
    roughness,
    loaded: false,
  };

  if (skin.imageUrl && typeof Image !== 'undefined') {
    const url = skin.imageUrl;
    entry.loadPromise = new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        paintPhotoCompositeToCanvas(canvas, img);
        diffuse.needsUpdate = true;
        entry.loaded = true;
        resolve();
      };
      img.onerror = () => {
        entry.loaded = true;
        resolve();
      };
      img.src = url;
    });
  } else {
    entry.loaded = true;
  }

  return entry;
}

export function getGlooSkinTextures(skin: GlooWallSkinDefinition): CachedSkinTextures {
  const existing = skinTextureCache.get(skin.id);
  if (existing) return existing;
  if (skin.imageUrl) {
    const created = buildPhotoTextureStub(skin);
    skinTextureCache.set(skin.id, created);
    return created;
  }
  const created: CachedSkinTextures = {
    diffuse: buildDiffuseTexture(skin),
    roughness: buildRoughnessTexture(skin),
    loaded: true,
  };
  skinTextureCache.set(skin.id, created);
  return created;
}

export function isGlooSkinTextureReady(skin: GlooWallSkinDefinition): boolean {
  if (!skin.imageUrl) return true;
  const existing = skinTextureCache.get(skin.id);
  return Boolean(existing?.loaded);
}

export function ensureGlooSkinTextureLoaded(skin: GlooWallSkinDefinition): Promise<void> {
  if (!skin.imageUrl) return Promise.resolve();
  const entry = getGlooSkinTextures(skin);
  if (entry.loaded) return Promise.resolve();
  return entry.loadPromise ?? Promise.resolve();
}

export function getSharedGlooCrackTexture(): THREE.CanvasTexture {
  if (sharedCrackTexture) return sharedCrackTexture;
  const { canvas, ctx } = createCanvas(256);
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(240, 249, 255, 0.94)';
    ctx.lineWidth = 2.6;
    const centers = [
      [72, 88],
      [178, 132],
      [124, 186],
    ];
    for (const [cx, cy] of centers) {
      for (let b = 0; b < 7; b++) {
        const ang = (b / 7) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        let px = cx;
        let py = cy;
        for (let step = 1; step <= 4; step++) {
          const len = 12 + ((b * 7 + step * 11) % 14);
          const jitter = (step % 2 === 0 ? 1 : -1) * 0.28;
          px += Math.cos(ang + jitter) * len;
          py += Math.sin(ang + jitter) * len;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
  }
  sharedCrackTexture = new THREE.CanvasTexture(canvas);
  return sharedCrackTexture;
}

export function getSharedGlooFrostRingTexture(): THREE.CanvasTexture {
  if (sharedFrostRingTexture) return sharedFrostRingTexture;
  const { canvas, ctx } = createCanvas(128);
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
    g.addColorStop(0.55, 'rgba(255, 255, 255, 0.34)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  sharedFrostRingTexture = new THREE.CanvasTexture(canvas);
  return sharedFrostRingTexture;
}

interface SharedRigGeometries {
  curvedMainShell: THREE.BufferGeometry;
  curvedMainShellPhoto: THREE.BufferGeometry;
  curvedCrackShell: THREE.BufferGeometry;
  curvedBaseSkirt: THREE.BufferGeometry;
  curvedBaseSkirtPhoto: THREE.BufferGeometry;
  curvedTopTrim: THREE.BufferGeometry;
  curvedTopTrimPhoto: THREE.BufferGeometry;
  curvedMidRib: THREE.BufferGeometry;
  sidePillar: THREE.BoxGeometry;
  sidePillarPhotoLeft: THREE.BufferGeometry;
  sidePillarPhotoRight: THREE.BufferGeometry;
  crystalSpikeLarge: THREE.ConeGeometry;
  crystalSpikeSmall: THREE.ConeGeometry;
  photoSpikeGeos: THREE.BufferGeometry[];
  prismOcta: THREE.OctahedronGeometry;
  hornGeo: THREE.ConeGeometry;
  emblemDiamond: THREE.OctahedronGeometry;
  mechaStrut: THREE.BoxGeometry;
  monolithObelisk: THREE.CylinderGeometry;
  holoFin: THREE.BoxGeometry;
  frostRingPlane: THREE.PlaneGeometry;
}

let sharedRigGeos: SharedRigGeometries | null = null;

function arcPointAt(
  theta: number,
  radiusOffset = 0,
): { x: number; z: number } {
  const r = GLOO_WALL_ARC_RADIUS + radiusOffset;
  return {
    x: r * Math.sin(theta),
    z: r * Math.cos(theta) - GLOO_WALL_ARC_RADIUS,
  };
}

function arcTopYAt(theta: number, centerHeight = 2.06, archDrop = 0.22): number {
  const t = theta / GLOO_WALL_ARC_HALF_ANGLE;
  return centerHeight - archDrop * t * t;
}

interface CurvedArcShellOptions {
  segments?: number;
  halfAngle?: number;
  thickness: number;
  yBottomFn: (theta: number) => number;
  yTopFn: (theta: number) => number;
  uRepeat?: number;
  singleWrap?: boolean;
  vRangeFn?: (theta: number) => [number, number];
  topVRange?: [number, number];
  botVRange?: [number, number];
}

/**
 * Builds a watertight, bottom-grounded semi-circular curved shell BufferGeometry
 * with separate vertex strips for front, back, top, bottom, and end caps so
 * the curved surfaces shade smoothly while rims/edges remain crisp.
 */
function buildCurvedArcShellGeometry(opts: CurvedArcShellOptions): THREE.BufferGeometry {
  const segments = opts.segments ?? 24;
  const halfAngle = opts.halfAngle ?? GLOO_WALL_ARC_HALF_ANGLE;
  const halfThick = opts.thickness * 0.5;
  const uRepeat = opts.uRepeat ?? 3;
  const singleWrap = opts.singleWrap ?? false;
  const topVRange = opts.topVRange ?? [0, 1];
  const botVRange = opts.botVRange ?? [0, 1];

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pushVertex = (x: number, y: number, z: number, u: number, v: number): number => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(u, v);
    return idx;
  };

  const pushQuad = (a: number, b: number, c: number, d: number): void => {
    indices.push(a, b, c, a, c, d);
  };

  const outBot: number[] = [];
  const outTop: number[] = [];
  const inBot: number[] = [];
  const inTop: number[] = [];
  const topOut: number[] = [];
  const topIn: number[] = [];
  const botOut: number[] = [];
  const botIn: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const frac = i / segments;
    const theta = -halfAngle + frac * (halfAngle * 2);
    const pOut = arcPointAt(theta, halfThick);
    const pIn = arcPointAt(theta, -halfThick);
    const y0 = opts.yBottomFn(theta);
    const y1 = opts.yTopFn(theta);
    const u = frac * uRepeat;
    const uBack = singleWrap ? (1 - frac) * uRepeat : u;
    const [vBot, vTop] = opts.vRangeFn ? opts.vRangeFn(theta) : [0, 1];

    outBot.push(pushVertex(pOut.x, y0, pOut.z, u, vBot));
    outTop.push(pushVertex(pOut.x, y1, pOut.z, u, vTop));

    inBot.push(pushVertex(pIn.x, y0, pIn.z, uBack, vBot));
    inTop.push(pushVertex(pIn.x, y1, pIn.z, uBack, vTop));

    topOut.push(pushVertex(pOut.x, y1, pOut.z, u, topVRange[0]));
    topIn.push(pushVertex(pIn.x, y1, pIn.z, u, topVRange[1]));

    botOut.push(pushVertex(pOut.x, y0, pOut.z, u, botVRange[0]));
    botIn.push(pushVertex(pIn.x, y0, pIn.z, u, botVRange[1]));
  }

  for (let i = 0; i < segments; i++) {
    // Front (+Z outward)
    pushQuad(outBot[i], outBot[i + 1], outTop[i + 1], outTop[i]);
    // Back (-Z player-facing)
    pushQuad(inBot[i + 1], inBot[i], inTop[i], inTop[i + 1]);
    // Top (+Y)
    pushQuad(topOut[i], topOut[i + 1], topIn[i + 1], topIn[i]);
    // Bottom (-Y)
    pushQuad(botOut[i + 1], botOut[i], botIn[i], botIn[i + 1]);
  }

  // Left end cap (theta = -halfAngle)
  {
    const pOut = arcPointAt(-halfAngle, halfThick);
    const pIn = arcPointAt(-halfAngle, -halfThick);
    const y0 = opts.yBottomFn(-halfAngle);
    const y1 = opts.yTopFn(-halfAngle);
    const [vBot, vTop] = opts.vRangeFn ? opts.vRangeFn(-halfAngle) : [0, 1];
    const u0 = singleWrap ? 0.005 : 0;
    const u1 = singleWrap ? 0.055 : 1;
    const lb0 = pushVertex(pIn.x, y0, pIn.z, u0, vBot);
    const lb1 = pushVertex(pOut.x, y0, pOut.z, u1, vBot);
    const lt1 = pushVertex(pOut.x, y1, pOut.z, u1, vTop);
    const lt0 = pushVertex(pIn.x, y1, pIn.z, u0, vTop);
    pushQuad(lb0, lb1, lt1, lt0);
  }

  // Right end cap (theta = +halfAngle)
  {
    const pOut = arcPointAt(halfAngle, halfThick);
    const pIn = arcPointAt(halfAngle, -halfThick);
    const y0 = opts.yBottomFn(halfAngle);
    const y1 = opts.yTopFn(halfAngle);
    const [vBot, vTop] = opts.vRangeFn ? opts.vRangeFn(halfAngle) : [0, 1];
    const u0 = singleWrap ? 0.945 : 0;
    const u1 = singleWrap ? 0.995 : 1;
    const rb0 = pushVertex(pOut.x, y0, pOut.z, u0, vBot);
    const rb1 = pushVertex(pIn.x, y0, pIn.z, u1, vBot);
    const rt1 = pushVertex(pIn.x, y1, pIn.z, u1, vTop);
    const rt0 = pushVertex(pOut.x, y1, pOut.z, u0, vTop);
    pushQuad(rb0, rb1, rt1, rt0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function buildArcProjectedPillarGeo(baseBox: THREE.BoxGeometry, deg: number): THREE.BufferGeometry {
  const geo = baseBox.clone();
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const theta0 = (deg * Math.PI) / 180;
  const p = arcPointAt(theta0);
  const h = arcTopYAt(theta0, 2.06, 0.22);
  const py = h * 0.49;
  const cosT = Math.cos(theta0);
  const sinT = Math.sin(theta0);
  const halfAngle = GLOO_WALL_ARC_HALF_ANGLE;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const lz = pos.getZ(i);
    const nz = norm.getZ(i);
    const ny = norm.getY(i);

    const wx = p.x + lx * cosT + lz * sinT;
    const wy = py + ly;
    const wz = p.z - lx * sinT + lz * cosT;

    const thetaV = Math.atan2(wx, wz + GLOO_WALL_ARC_RADIUS);
    const frac = Math.max(0, Math.min(1, (thetaV + halfAngle) / (2 * halfAngle)));
    const topY = arcTopYAt(thetaV, 2.06, 0.22);
    const v = Math.max(0.01, Math.min(0.99, wy / topY));

    let u = frac;
    let outV = v;
    if (nz < -0.5) {
      u = 1 - frac;
    } else if (ny > 0.5) {
      outV = 0.97;
    } else if (ny < -0.5) {
      outV = 0.03;
    }
    uv.setXY(i, u, outV);
  }
  uv.needsUpdate = true;
  return geo;
}

function buildArcProjectedSpikeGeo(
  baseCone: THREE.ConeGeometry,
  deg: number,
  spikeHeight: number,
): THREE.BufferGeometry {
  const geo = baseCone.clone();
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const theta0 = (deg * Math.PI) / 180;
  const halfAngle = GLOO_WALL_ARC_HALF_ANGLE;
  const centerU = Math.max(0.04, Math.min(0.96, (theta0 + halfAngle) / (2 * halfAngle)));
  const halfH = spikeHeight * 0.5;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const u = Math.max(0.01, Math.min(0.99, centerU + lx * 0.06));
    const tY = (ly + halfH) / Math.max(0.01, spikeHeight);
    const v = 0.92 + Math.max(0, Math.min(1, tY)) * 0.07;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geo;
}

function getSharedRigGeometries(): SharedRigGeometries {
  if (sharedRigGeos) return sharedRigGeos;
  // Exact bottom-grounded semi-circular Free Fire barrier (y = 0.000 at floor, 2.06m center arch)
  const curvedMainShell = buildCurvedArcShellGeometry({
    segments: 24,
    thickness: 0.32,
    yBottomFn: () => 0,
    yTopFn: (theta) => arcTopYAt(theta, 2.06, 0.22),
    uRepeat: 3,
  });
  const curvedMainShellPhoto = buildCurvedArcShellGeometry({
    segments: 24,
    thickness: 0.32,
    yBottomFn: () => 0,
    yTopFn: (theta) => arcTopYAt(theta, 2.06, 0.22),
    uRepeat: 1,
    singleWrap: true,
    topVRange: [0.94, 0.99],
    botVRange: [0.01, 0.06],
  });
  const curvedCrackShell = buildCurvedArcShellGeometry({
    segments: 24,
    thickness: 0.344,
    yBottomFn: () => 0.002,
    yTopFn: (theta) => arcTopYAt(theta, 2.066, 0.22),
    uRepeat: 3,
  });
  const curvedBaseSkirt = buildCurvedArcShellGeometry({
    segments: 24,
    thickness: 0.39,
    yBottomFn: () => 0,
    yTopFn: () => 0.11,
    uRepeat: 3,
  });
  const curvedBaseSkirtPhoto = buildCurvedArcShellGeometry({
    segments: 24,
    thickness: 0.39,
    yBottomFn: () => 0,
    yTopFn: () => 0.11,
    uRepeat: 1,
    singleWrap: true,
    vRangeFn: (theta) => [0, 0.11 / arcTopYAt(theta, 2.06, 0.22)],
    topVRange: [0.04, 0.06],
    botVRange: [0.005, 0.02],
  });
  const curvedTopTrim = buildCurvedArcShellGeometry({
    segments: 24,
    thickness: 0.36,
    yBottomFn: (theta) => arcTopYAt(theta, 2.06, 0.22) - 0.04,
    yTopFn: (theta) => arcTopYAt(theta, 2.06, 0.22) + 0.05,
    uRepeat: 3,
  });
  const curvedTopTrimPhoto = buildCurvedArcShellGeometry({
    segments: 24,
    thickness: 0.36,
    yBottomFn: (theta) => arcTopYAt(theta, 2.06, 0.22) - 0.04,
    yTopFn: (theta) => arcTopYAt(theta, 2.06, 0.22) + 0.05,
    uRepeat: 1,
    singleWrap: true,
    vRangeFn: (theta) => {
      const topY = arcTopYAt(theta, 2.06, 0.22);
      return [Math.max(0.9, (topY - 0.04) / topY), 0.995];
    },
    topVRange: [0.96, 0.995],
    botVRange: [0.94, 0.97],
  });
  const curvedMidRib = buildCurvedArcShellGeometry({
    segments: 20,
    thickness: 0.37,
    yBottomFn: () => -0.055,
    yTopFn: () => 0.055,
    uRepeat: 3,
  });

  const sidePillar = new THREE.BoxGeometry(0.14, 1.96, 0.38);
  const crystalSpikeLarge = new THREE.ConeGeometry(0.22, 0.46, 5);
  const crystalSpikeSmall = new THREE.ConeGeometry(0.15, 0.34, 5);

  const photoSpikeGeos = [
    buildArcProjectedSpikeGeo(crystalSpikeLarge, 0, 0.46),
    buildArcProjectedSpikeGeo(crystalSpikeSmall, -20, 0.34),
    buildArcProjectedSpikeGeo(crystalSpikeSmall, 20, 0.34),
    buildArcProjectedSpikeGeo(crystalSpikeSmall, -45, 0.34),
    buildArcProjectedSpikeGeo(crystalSpikeSmall, 45, 0.34),
  ];

  sharedRigGeos = {
    curvedMainShell,
    curvedMainShellPhoto,
    curvedCrackShell,
    curvedBaseSkirt,
    curvedBaseSkirtPhoto,
    curvedTopTrim,
    curvedTopTrimPhoto,
    curvedMidRib,
    sidePillar,
    sidePillarPhotoLeft: buildArcProjectedPillarGeo(sidePillar, -24),
    sidePillarPhotoRight: buildArcProjectedPillarGeo(sidePillar, 24),
    crystalSpikeLarge,
    crystalSpikeSmall,
    photoSpikeGeos,
    prismOcta: new THREE.OctahedronGeometry(0.21, 0),
    hornGeo: new THREE.ConeGeometry(0.16, 0.56, 5),
    emblemDiamond: new THREE.OctahedronGeometry(0.29, 0),
    mechaStrut: new THREE.BoxGeometry(0.12, 1.94, 0.4),
    monolithObelisk: new THREE.CylinderGeometry(0.07, 0.18, 2.18, 6),
    holoFin: new THREE.BoxGeometry(0.07, 1.98, 0.42),
    frostRingPlane: new THREE.PlaneGeometry(5.9, 3.2),
  };
  return sharedRigGeos;
}

export interface GlooWallVisualRig {
  root: THREE.Group;
  wallRoot: THREE.Group;
  frostRing: THREE.Mesh;
  frostRingMat: THREE.MeshBasicMaterial;
  mainMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshBasicMaterial;
  crackMat: THREE.MeshBasicMaterial | null;
  animatedDecor: THREE.Object3D[];
  dispose: () => void;
}

export interface BuildGlooWallRigOptions {
  includeCracks?: boolean;
  includeFrostRing?: boolean;
  forShopPreview?: boolean;
}

/**
 * Builds an upright, bottom-grounded (y = 0) semi-circular 3D Gloo Wall rig styled according to `skin`.
 * Shared between live gameplay (`GlooWallManager`) and the 3D shop preview studio
 * (`ShopItemMeshBuilder`) so preview cards match in-game appearance 1:1.
 */
export function buildGlooWallVisualRig(
  skin: GlooWallSkinDefinition,
  options: BuildGlooWallRigOptions = {},
): GlooWallVisualRig {
  const includeCracks = options.includeCracks ?? !options.forShopPreview;
  const includeFrostRing = options.includeFrostRing ?? true;
  const geos = getSharedRigGeometries();
  const textures = getGlooSkinTextures(skin);

  const root = new THREE.Group();
  const wallRoot = new THREE.Group();
  root.add(wallRoot);

  const isPhotoSkin = Boolean(skin.imageUrl);
  const mainMat = isPhotoSkin
    ? new THREE.MeshStandardMaterial({
        map: textures.diffuse,
        emissiveMap: textures.diffuse,
        color: 0xffffff,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: skin.baseEmissiveIntensity,
        roughness: skin.roughness,
        metalness: skin.metalness,
        transparent: false,
        opacity: 1,
      })
    : new THREE.MeshStandardMaterial({
        map: textures.diffuse,
        roughnessMap: textures.roughness,
        color: 0xffffff,
        emissive: new THREE.Color(skin.emissiveHex),
        emissiveIntensity: skin.baseEmissiveIntensity,
        roughness: skin.roughness,
        metalness: skin.metalness,
        transparent: skin.opacity < 0.99,
        opacity: skin.opacity,
      });

  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.secondaryHex).lerp(new THREE.Color(skin.accentHex), 0.45),
    emissive: new THREE.Color(skin.accentHex),
    emissiveIntensity: 0.42,
    roughness: Math.max(0.14, skin.roughness - 0.06),
    metalness: Math.min(0.88, skin.metalness + 0.2),
  });

  const rimMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(skin.trimHex),
    transparent: true,
    opacity: 0.84,
  });

  const crackMat = includeCracks
    ? new THREE.MeshBasicMaterial({
        map: getSharedGlooCrackTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    : null;

  const animatedDecor: THREE.Object3D[] = [];

  const mainMesh = new THREE.Mesh(
    isPhotoSkin ? geos.curvedMainShellPhoto : geos.curvedMainShell,
    mainMat,
  );
  mainMesh.castShadow = !options.forShopPreview;
  mainMesh.receiveShadow = true;
  wallRoot.add(mainMesh);

  if (crackMat) {
    const crackMesh = new THREE.Mesh(geos.curvedCrackShell, crackMat);
    wallRoot.add(crackMesh);
  }

  const baseSkirt = new THREE.Mesh(
    isPhotoSkin ? geos.curvedBaseSkirtPhoto : geos.curvedBaseSkirt,
    isPhotoSkin ? mainMat : accentMat,
  );
  wallRoot.add(baseSkirt);

  const topTrim = new THREE.Mesh(
    isPhotoSkin ? geos.curvedTopTrimPhoto : geos.curvedTopTrim,
    isPhotoSkin ? mainMat : rimMat,
  );
  wallRoot.add(topTrim);

  // Subtle curved reinforcing ribs along the inner/outer seams like Free Fire's armored ice shield
  for (const deg of [-24, 24]) {
    const theta = (deg * Math.PI) / 180;
    const p = arcPointAt(theta);
    const h = arcTopYAt(theta, 2.06, 0.22);
    const pillarGeo = isPhotoSkin
      ? deg < 0
        ? geos.sidePillarPhotoLeft
        : geos.sidePillarPhotoRight
      : geos.sidePillar;
    const seamPillar = new THREE.Mesh(pillarGeo, isPhotoSkin ? mainMat : accentMat);
    seamPillar.position.set(p.x, h * 0.49, p.z);
    seamPillar.rotation.y = theta;
    wallRoot.add(seamPillar);
  }

  switch (skin.silhouette) {
    case 'classic_ice': {
      const spikeAngles: Array<[number, number, boolean]> = [
        [0, 0, true],
        [-20, 0.14, false],
        [20, -0.14, false],
        [-45, 0.22, false],
        [45, -0.22, false],
      ];
      for (let sIdx = 0; sIdx < spikeAngles.length; sIdx++) {
        const [deg, rz, large] = spikeAngles[sIdx];
        const theta = (deg * Math.PI) / 180;
        const p = arcPointAt(theta);
        const topY = arcTopYAt(theta, 2.06, 0.22);
        const spikeGeo = isPhotoSkin
          ? geos.photoSpikeGeos[sIdx]
          : large
            ? geos.crystalSpikeLarge
            : geos.crystalSpikeSmall;
        const spike = new THREE.Mesh(spikeGeo, isPhotoSkin ? mainMat : accentMat);
        spike.position.set(p.x, topY + (large ? 0.2 : 0.15), p.z);
        spike.rotation.set(0, theta, rz);
        wallRoot.add(spike);
      }
      break;
    }

    case 'armored_fortress': {
      for (const ry of [0.58, 1.18, 1.72]) {
        const rib = new THREE.Mesh(geos.curvedMidRib, accentMat);
        rib.position.y = ry;
        wallRoot.add(rib);
      }
      for (const deg of [-58, 58]) {
        const theta = (deg * Math.PI) / 180;
        const p = arcPointAt(theta);
        const buttress = new THREE.Mesh(geos.sidePillar, accentMat);
        buttress.position.set(p.x, 0.94, p.z);
        buttress.rotation.y = theta;
        wallRoot.add(buttress);
      }
      break;
    }

    case 'jagged_spikes': {
      const spikes: Array<[number, number, number, boolean]> = [
        [0, 0, 0, true],
        [-22, 0.12, 0.2, true],
        [22, 0.12, -0.2, true],
        [-46, 0.14, 0.28, false],
        [46, 0.14, -0.28, false],
      ];
      for (const [deg, rx, rz, large] of spikes) {
        const theta = (deg * Math.PI) / 180;
        const p = arcPointAt(theta);
        const topY = arcTopYAt(theta, 2.06, 0.22);
        const sp = new THREE.Mesh(
          large ? geos.crystalSpikeLarge : geos.crystalSpikeSmall,
          accentMat,
        );
        sp.position.set(p.x, topY + (large ? 0.22 : 0.16), p.z);
        sp.rotation.set(rx, theta, rz);
        wallRoot.add(sp);
      }
      for (const sign of [-1, 1]) {
        const theta = sign * ((63 * Math.PI) / 180);
        const p = arcPointAt(theta, 0.08);
        const sideSp = new THREE.Mesh(geos.crystalSpikeSmall, accentMat);
        sideSp.position.set(p.x, 1.44, p.z);
        sideSp.rotation.set(0, theta, -sign * 0.9);
        wallRoot.add(sideSp);
      }
      const coreGem = new THREE.Mesh(geos.emblemDiamond, rimMat);
      coreGem.position.set(0, 1.14, 0.18);
      coreGem.scale.set(0.75, 1.1, 0.32);
      wallRoot.add(coreGem);
      animatedDecor.push(coreGem);
      break;
    }

    case 'prism_crown': {
      const jewelAngles: Array<[number, number]> = [
        [0, 1.12],
        [-24, 0.78],
        [24, 0.78],
        [-50, 0.68],
        [50, 0.68],
      ];
      for (const [deg, sc] of jewelAngles) {
        const theta = (deg * Math.PI) / 180;
        const p = arcPointAt(theta);
        const topY = arcTopYAt(theta, 2.06, 0.22);
        const prism = new THREE.Mesh(geos.prismOcta, rimMat);
        prism.position.set(p.x, topY + 0.22, p.z);
        prism.scale.set(sc * 0.75, sc * 1.2, sc * 0.75);
        wallRoot.add(prism);
        animatedDecor.push(prism);
      }
      const centerCrest = new THREE.Mesh(geos.emblemDiamond, rimMat);
      centerCrest.position.set(0, 1.1, 0.18);
      centerCrest.scale.set(0.9, 1.08, 0.28);
      wallRoot.add(centerCrest);
      break;
    }

    case 'mecha_frame': {
      for (const deg of [-58, -24, 24, 58]) {
        const theta = (deg * Math.PI) / 180;
        const p = arcPointAt(theta);
        const strut = new THREE.Mesh(geos.mechaStrut, accentMat);
        strut.position.set(p.x, 0.97, p.z);
        strut.rotation.y = theta;
        wallRoot.add(strut);
      }
      const visorBar = new THREE.Mesh(geos.curvedMidRib, rimMat);
      visorBar.position.y = 1.28;
      visorBar.scale.set(1, 1.35, 1);
      wallRoot.add(visorBar);
      break;
    }

    case 'dragon_crest': {
      for (const sign of [-1, 1]) {
        const outerTheta = sign * ((28 * Math.PI) / 180);
        const pOuter = arcPointAt(outerTheta);
        const outerHorn = new THREE.Mesh(geos.hornGeo, accentMat);
        outerHorn.position.set(pOuter.x, arcTopYAt(outerTheta, 2.06, 0.22) + 0.22, pOuter.z);
        outerHorn.rotation.set(-0.18, outerTheta, -sign * 0.42);
        wallRoot.add(outerHorn);

        const innerTheta = sign * ((12 * Math.PI) / 180);
        const pInner = arcPointAt(innerTheta);
        const innerHorn = new THREE.Mesh(geos.crystalSpikeSmall, rimMat);
        innerHorn.position.set(pInner.x, arcTopYAt(innerTheta, 2.06, 0.22) + 0.16, pInner.z);
        innerHorn.rotation.set(0.08, innerTheta, -sign * 0.2);
        wallRoot.add(innerHorn);

        const wingTheta = sign * ((56 * Math.PI) / 180);
        const pWing = arcPointAt(wingTheta);
        const wingFin = new THREE.Mesh(geos.crystalSpikeSmall, accentMat);
        wingFin.position.set(pWing.x, arcTopYAt(wingTheta, 2.06, 0.22) + 0.12, pWing.z);
        wingFin.rotation.set(0, wingTheta, -sign * 0.5);
        wallRoot.add(wingFin);
      }
      const dragonCrest = new THREE.Mesh(geos.emblemDiamond, rimMat);
      dragonCrest.position.set(0, 1.18, 0.19);
      dragonCrest.scale.set(0.95, 1.28, 0.34);
      wallRoot.add(dragonCrest);
      animatedDecor.push(dragonCrest);
      break;
    }

    case 'monolith_spires': {
      for (const deg of [-58, 58]) {
        const theta = (deg * Math.PI) / 180;
        const p = arcPointAt(theta);
        const obelisk = new THREE.Mesh(geos.monolithObelisk, accentMat);
        obelisk.position.set(p.x, 1.09, p.z);
        wallRoot.add(obelisk);
      }
      const crownOrb = new THREE.Mesh(geos.emblemDiamond, rimMat);
      crownOrb.position.set(0, 2.34, 0.02);
      crownOrb.scale.set(0.85, 1.12, 0.85);
      wallRoot.add(crownOrb);
      animatedDecor.push(crownOrb);
      break;
    }

    case 'holo_grid': {
      for (const deg of [-58, 0, 58]) {
        const theta = (deg * Math.PI) / 180;
        const p = arcPointAt(theta);
        const fin = new THREE.Mesh(geos.holoFin, rimMat);
        fin.position.set(p.x, 0.98, p.z);
        fin.rotation.y = theta;
        wallRoot.add(fin);
      }
      const scanBar = new THREE.Mesh(geos.curvedMidRib, rimMat);
      scanBar.position.y = 1.02;
      scanBar.scale.set(1, 0.72, 1);
      wallRoot.add(scanBar);
      animatedDecor.push(scanBar);
      break;
    }
  }

  const frostRingMat = new THREE.MeshBasicMaterial({
    map: getSharedGlooFrostRingTexture(),
    color: new THREE.Color(skin.frostRingHex),
    transparent: true,
    opacity: includeFrostRing ? 0.85 : 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const frostRing = new THREE.Mesh(geos.frostRingPlane, frostRingMat);
  frostRing.rotation.x = -Math.PI / 2;
  frostRing.position.set(0, 0.015, -0.58);
  frostRing.visible = includeFrostRing;
  root.add(frostRing);

  return {
    root,
    wallRoot,
    frostRing,
    frostRingMat,
    mainMat,
    accentMat,
    rimMat,
    crackMat,
    animatedDecor,
    dispose: () => {
      mainMat.dispose();
      accentMat.dispose();
      rimMat.dispose();
      crackMat?.dispose();
      frostRingMat.dispose();
    },
  };
}
