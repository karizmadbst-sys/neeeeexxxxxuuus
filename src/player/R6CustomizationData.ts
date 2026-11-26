export type R6SkinId =
  | 'operator_natural'
  | 'fair_sunlit'
  | 'warm_bronze'
  | 'deep_umber'
  | 'nordic_pale'
  | 'olive_tan'
  | 'warm_amber'
  | 'porcelain_rose';

export type R6EyeStyleId =
  | 'classic_r6'
  | 'determined'
  | 'anime_bright'
  | 'wink'
  | 'chill_cool'
  | 'cyber_glow'
  | 'sharp_hawk'
  | 'gentle_round'
  | 'star_spark'
  | 'squint_ace';

export type R6MouthStyleId =
  | 'classic_smile'
  | 'confident_grin'
  | 'smirk'
  | 'serious'
  | 'happy_open'
  | 'neutral'
  | 'determined_grit'
  | 'whistle_o'
  | 'feline_smirk'
  | 'warm_smile';

export type R6FaceMarkId =
  | 'none'
  | 'scar_left'
  | 'brow_slash'
  | 'freckles'
  | 'beauty_mark'
  | 'cheek_stripe'
  | 'bandage_nose'
  | 'stubble'
  | 'goatee'
  | 'cyber_circuit'
  | 'scar_cross'
  | 'whisker_paint';

export type R6HairStyleId =
  | 'swept_undercut'
  | 'fluffy_messy'
  | 'spiky_crest'
  | 'buzz_fade'
  | 'curtains_part'
  | 'high_ponytail'
  | 'asym_bob'
  | 'wavy_shoulder'
  | 'bald'
  | 'mohawk_tactical'
  | 'slick_back'
  | 'twin_buns'
  | 'side_braid'
  | 'curly_crop'
  | 'wolf_cut'
  | 'low_ponytail';

export type R6HairColorId =
  | 'espresso'
  | 'jet_black'
  | 'auburn'
  | 'blonde'
  | 'crimson'
  | 'silver_ash'
  | 'cobalt_blue'
  | 'violet_mist'
  | 'copper_flame'
  | 'platinum_ice'
  | 'emerald_neon'
  | 'rose_pink'
  | 'navy_midnight'
  | 'mahogany';

export type R6TopId =
  | 'hoodie_urban'
  | 'hoodie_cyan'
  | 'bomber_jacket'
  | 'denim_jacket'
  | 'puffer_vest'
  | 'tshirt_graphic'
  | 'shirt_varsity'
  | 'tactical_parka'
  | 'operator_sync'
  | 'hoodie_volt'
  | 'hoodie_crimson'
  | 'hoodie_emerald'
  | 'bomber_stealth'
  | 'bomber_gold'
  | 'jacket_leather'
  | 'jacket_cyber'
  | 'jacket_arctic'
  | 'puffer_cobalt'
  | 'puffer_olive'
  | 'tshirt_striker'
  | 'tshirt_sunset'
  | 'tshirt_void'
  | 'varsity_crimson'
  | 'varsity_emerald'
  | 'varsity_gold'
  | 'parka_desert'
  | 'parka_midnight'
  | 'parka_plasma';

export type R6PantsId =
  | 'cargo_charcoal'
  | 'cargo_olive'
  | 'jeans_indigo'
  | 'jeans_black'
  | 'joggers_slate'
  | 'khaki_chinos'
  | 'tactical_camo'
  | 'cargo_sand'
  | 'cargo_navy'
  | 'jeans_acid'
  | 'joggers_crimson'
  | 'joggers_onyx'
  | 'chinos_charcoal'
  | 'tactical_snow';

export type R6ShoesId =
  | 'sneakers_white'
  | 'sneakers_crimson'
  | 'hightops_cyan'
  | 'trainers_volt'
  | 'boots_combat'
  | 'boots_tan'
  | 'sneakers_gold'
  | 'sneakers_emerald'
  | 'hightops_crimson'
  | 'hightops_violet'
  | 'trainers_ice'
  | 'boots_obsidian';

export type R6HatId =
  | 'none'
  | 'baseball_cap'
  | 'backwards_cap'
  | 'beanie'
  | 'bucket_hat'
  | 'tactical_cap';

export type R6GlassesId =
  | 'none'
  | 'wayfarers'
  | 'aviators'
  | 'cyber_visor'
  | 'round_frames';

export type R6MaskId =
  | 'none'
  | 'cloth_mask'
  | 'respirator'
  | 'gaiter_scarf';

export type R6ArmorId =
  | 'none'
  | 'iron_lv1'
  | 'diamond_lv2'
  | 'nether_gold_lv3';

export type R6AccessoryId =
  | 'none'
  | 'shades'
  | 'headphones'
  | 'backpack'
  | 'crown'
  | 'cape';

export type R6PetId =
  | 'wolf'
  | 'fox'
  | 'parrot'
  | 'creeper_bot'
  | 'none';

export interface R6Customization {
  skinId: R6SkinId;
  eyesId: R6EyeStyleId;
  mouthId: R6MouthStyleId;
  faceMarkId: R6FaceMarkId;
  hairStyleId: R6HairStyleId;
  hairColorId: R6HairColorId;
  topId: R6TopId;
  pantsId: R6PantsId;
  shoesId: R6ShoesId;
  hatId: R6HatId;
  glassesId: R6GlassesId;
  maskId: R6MaskId;
  armorId: R6ArmorId;
  accessoryId: R6AccessoryId;
  petId: R6PetId;
  petEnabled: boolean;
}

/** Backward-compatible type alias used by ranked payloads & shop patches. */
export type OperatorCustomization = R6Customization;

export interface R6SkinOption {
  id: R6SkinId;
  name: string;
  skinBaseHex: string;
  skinShadeHex: string;
  swatchHex: string;
}

export interface R6EyeOption {
  id: R6EyeStyleId;
  name: string;
  eyeHex: string;
  swatchHex: string;
}

export interface R6MouthOption {
  id: R6MouthStyleId;
  name: string;
  swatchHex: string;
}

export interface R6FaceMarkOption {
  id: R6FaceMarkId;
  name: string;
  swatchHex: string;
  description: string;
}

export interface R6HairStyleOption {
  id: R6HairStyleId;
  name: string;
  swatchHex: string;
}

export interface R6HairColorOption {
  id: R6HairColorId;
  name: string;
  hairBaseHex: string;
  hairHighlightHex: string;
  swatchHex: string;
}

export type R6TopGarmentType = 'hoodie' | 'bomber' | 'jacket' | 'puffer' | 'tshirt' | 'varsity' | 'parka';
export type R6TopPatternVariant = 'standard' | 'chevron' | 'stripe' | 'crest' | 'camo' | 'grid' | 'split' | 'bolt';

export interface R6TopOption {
  id: R6TopId;
  name: string;
  garmentType: R6TopGarmentType;
  patternVariant?: R6TopPatternVariant;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  innerHex: string;
  swatchHex: string;
  description: string;
}

export type R6PantsGarmentType = 'cargo' | 'jeans' | 'joggers' | 'chinos';

export interface R6PantsOption {
  id: R6PantsId;
  name: string;
  garmentType: R6PantsGarmentType;
  baseHex: string;
  shadeHex: string;
  accentHex: string;
  swatchHex: string;
  description: string;
}

export type R6ShoeStyleType = 'sneaker' | 'hightop' | 'boot';

export interface R6ShoesOption {
  id: R6ShoesId;
  name: string;
  styleType: R6ShoeStyleType;
  upperHex: string;
  soleHex: string;
  accentHex: string;
  swatchHex: string;
  description: string;
}

export interface R6SimpleGearOption<TId extends string = string> {
  id: TId;
  name: string;
  swatchHex: string;
  accentHex: string;
  description: string;
}

export interface R6ArmorOption {
  id: R6ArmorId;
  name: string;
  tier: 0 | 1 | 2 | 3;
  metalHex: string;
  trimHex: string;
  glowHex: string;
}

export interface R6PetOption {
  id: R6PetId;
  name: string;
  swatchHex: string;
  accentHex: string;
  role: string;
  traitBadge: string;
  personality: string;
  behavior: string;
}

export const R6_SKINS: readonly R6SkinOption[] = [
  { id: 'operator_natural', name: 'Classic Peach', skinBaseHex: '#f2c9a0', skinShadeHex: '#d4a376', swatchHex: '#f2c9a0' },
  { id: 'fair_sunlit', name: 'Fair Sunlit', skinBaseHex: '#f6d5be', skinShadeHex: '#d9ad91', swatchHex: '#f6d5be' },
  { id: 'warm_bronze', name: 'Warm Bronze', skinBaseHex: '#cf9369', skinShadeHex: '#a96e46', swatchHex: '#cf9369' },
  { id: 'deep_umber', name: 'Deep Umber', skinBaseHex: '#825236', skinShadeHex: '#5e3721', swatchHex: '#825236' },
  { id: 'nordic_pale', name: 'Cool Ivory', skinBaseHex: '#f5d7cf', skinShadeHex: '#d3aaa0', swatchHex: '#f5d7cf' },
  { id: 'olive_tan', name: 'Olive Tan', skinBaseHex: '#dba882', skinShadeHex: '#b4825f', swatchHex: '#dba882' },
  { id: 'warm_amber', name: 'Warm Amber', skinBaseHex: '#b8784e', skinShadeHex: '#925835', swatchHex: '#b8784e' },
  { id: 'porcelain_rose', name: 'Porcelain Rose', skinBaseHex: '#fae0d8', skinShadeHex: '#dfb8ad', swatchHex: '#fae0d8' },
];

export const R6_EYE_STYLES: readonly R6EyeOption[] = [
  { id: 'classic_r6', name: 'Classic R6', eyeHex: '#111827', swatchHex: '#1f2937' },
  { id: 'determined', name: 'Determined Brow', eyeHex: '#1e3a5f', swatchHex: '#2563eb' },
  { id: 'anime_bright', name: 'Bright Spark', eyeHex: '#0284c7', swatchHex: '#38bdf8' },
  { id: 'wink', name: 'Playful Wink', eyeHex: '#111827', swatchHex: '#f59e0b' },
  { id: 'chill_cool', name: 'Chill Half-Lid', eyeHex: '#334155', swatchHex: '#64748b' },
  { id: 'cyber_glow', name: 'Cyber Optics', eyeHex: '#22d3ee', swatchHex: '#06b6d4' },
  { id: 'sharp_hawk', name: 'Hawk Focus', eyeHex: '#b45309', swatchHex: '#f59e0b' },
  { id: 'gentle_round', name: 'Gentle Round', eyeHex: '#0f766e', swatchHex: '#14b8a6' },
  { id: 'star_spark', name: 'Starlight Eyes', eyeHex: '#7c3aed', swatchHex: '#a855f7' },
  { id: 'squint_ace', name: 'Sniper Squint', eyeHex: '#3f3f46', swatchHex: '#71717a' },
];

export const R6_MOUTH_STYLES: readonly R6MouthOption[] = [
  { id: 'classic_smile', name: 'Classic Smile', swatchHex: '#38bdf8' },
  { id: 'confident_grin', name: 'Confident Grin', swatchHex: '#f97316' },
  { id: 'smirk', name: 'Side Smirk', swatchHex: '#a855f7' },
  { id: 'serious', name: 'Tactical Focus', swatchHex: '#64748b' },
  { id: 'happy_open', name: 'Big Cheer', swatchHex: '#10b981' },
  { id: 'neutral', name: 'Calm Neutral', swatchHex: '#94a3b8' },
  { id: 'determined_grit', name: 'Battle Grit', swatchHex: '#ef4444' },
  { id: 'whistle_o', name: 'Surprised O', swatchHex: '#ec4899' },
  { id: 'feline_smirk', name: 'Playful Smirk', swatchHex: '#f59e0b' },
  { id: 'warm_smile', name: 'Warm Smile', swatchHex: '#2dd4bf' },
];

export const R6_FACE_MARKS: readonly R6FaceMarkOption[] = [
  { id: 'none', name: 'Clean Face', swatchHex: '#64748b', description: 'Unmarked clean face expression.' },
  { id: 'scar_left', name: 'Cheek Scar', swatchHex: '#dc2626', description: 'Vertical combat scar across the left eye and cheek.' },
  { id: 'brow_slash', name: 'Brow Notch', swatchHex: '#f97316', description: 'Crisp diagonal slash notch across the left brow.' },
  { id: 'freckles', name: 'Sun Freckles', swatchHex: '#d97706', description: 'Warm scattered freckles across the nose bridge and cheeks.' },
  { id: 'beauty_mark', name: 'Under-Eye Mark', swatchHex: '#1e293b', description: 'Distinctive beauty mark below the right eye.' },
  { id: 'cheek_stripe', name: 'Tactical Eye-Black', swatchHex: '#18181b', description: 'Athletic dark war-paint stripes beneath both eyes.' },
  { id: 'bandage_nose', name: 'Nose Bandage', swatchHex: '#e2e8f0', description: 'Protective athletic tape bandage across the nose bridge.' },
  { id: 'stubble', name: 'Trimmed Stubble', swatchHex: '#475569', description: 'Subtle jawline shadow and trimmed operator stubble.' },
  { id: 'goatee', name: 'Styled Goatee', swatchHex: '#27272a', description: 'Cleanly shaped chin goatee and mustache trim.' },
  { id: 'cyber_circuit', name: 'Holo Cheek Trace', swatchHex: '#22d3ee', description: 'Luminous cyan telemetry circuit trace along the cheek.' },
  { id: 'scar_cross', name: 'Bridge Scar', swatchHex: '#e11d48', description: 'Short diagonal scar across the center nose bridge.' },
  { id: 'whisker_paint', name: 'Duelist Marks', swatchHex: '#f43f5e', description: 'Twin stylized diagonal markings painted on both cheeks.' },
];

export const R6_HAIR_STYLES: readonly R6HairStyleOption[] = [
  { id: 'swept_undercut', name: 'Messy Swept', swatchHex: '#38bdf8' },
  { id: 'fluffy_messy', name: 'Fluffy Textured', swatchHex: '#f97316' },
  { id: 'spiky_crest', name: 'Spiky Crest', swatchHex: '#ef4444' },
  { id: 'buzz_fade', name: 'Clean Fade', swatchHex: '#94a3b8' },
  { id: 'curtains_part', name: 'Middle Part', swatchHex: '#a855f7' },
  { id: 'high_ponytail', name: 'High Ponytail', swatchHex: '#ec4899' },
  { id: 'asym_bob', name: 'Sleek Bob', swatchHex: '#14b8a6' },
  { id: 'wavy_shoulder', name: 'Wavy Layered', swatchHex: '#eab308' },
  { id: 'bald', name: 'Clean Shaven', swatchHex: '#475569' },
  { id: 'mohawk_tactical', name: 'Tactical Mohawk', swatchHex: '#f43f5e' },
  { id: 'slick_back', name: 'Slick Back Pomp', swatchHex: '#6366f1' },
  { id: 'twin_buns', name: 'Twin Buns', swatchHex: '#fb7185' },
  { id: 'side_braid', name: 'Side Braid', swatchHex: '#2dd4bf' },
  { id: 'curly_crop', name: 'Curly Crop', swatchHex: '#f59e0b' },
  { id: 'wolf_cut', name: 'Layered Wolf Cut', swatchHex: '#38bdf8' },
  { id: 'low_ponytail', name: 'Low Ponytail', swatchHex: '#10b981' },
];

export const R6_HAIR_COLORS: readonly R6HairColorOption[] = [
  { id: 'espresso', name: 'Espresso', hairBaseHex: '#261b16', hairHighlightHex: '#473329', swatchHex: '#261b16' },
  { id: 'jet_black', name: 'Jet Black', hairBaseHex: '#13151a', hairHighlightHex: '#2b303c', swatchHex: '#13151a' },
  { id: 'auburn', name: 'Chestnut Brown', hairBaseHex: '#5a2d1b', hairHighlightHex: '#8b4a2f', swatchHex: '#5a2d1b' },
  { id: 'blonde', name: 'Golden Blonde', hairBaseHex: '#d4b475', hairHighlightHex: '#ecd8a6', swatchHex: '#d4b475' },
  { id: 'crimson', name: 'Crimson Dye', hairBaseHex: '#881337', hairHighlightHex: '#e11d48', swatchHex: '#be123c' },
  { id: 'silver_ash', name: 'Silver Ash', hairBaseHex: '#64748b', hairHighlightHex: '#cbd5e1', swatchHex: '#94a3b8' },
  { id: 'cobalt_blue', name: 'Cobalt Blue', hairBaseHex: '#1d4ed8', hairHighlightHex: '#60a5fa', swatchHex: '#2563eb' },
  { id: 'violet_mist', name: 'Violet Mist', hairBaseHex: '#5b21b6', hairHighlightHex: '#a78bfa', swatchHex: '#7c3aed' },
  { id: 'copper_flame', name: 'Copper Ginger', hairBaseHex: '#b45309', hairHighlightHex: '#f97316', swatchHex: '#ea580c' },
  { id: 'platinum_ice', name: 'Platinum Ice', hairBaseHex: '#cbd5e1', hairHighlightHex: '#f8fafc', swatchHex: '#e2e8f0' },
  { id: 'emerald_neon', name: 'Emerald Teal', hairBaseHex: '#047857', hairHighlightHex: '#34d399', swatchHex: '#10b981' },
  { id: 'rose_pink', name: 'Rose Quartz', hairBaseHex: '#be185d', hairHighlightHex: '#f472b6', swatchHex: '#ec4899' },
  { id: 'navy_midnight', name: 'Midnight Indigo', hairBaseHex: '#1e1b4b', hairHighlightHex: '#4f46e5', swatchHex: '#312e81' },
  { id: 'mahogany', name: 'Dark Mahogany', hairBaseHex: '#451a1a', hairHighlightHex: '#7f2d2d', swatchHex: '#5c2323' },
];

export const R6_TOPS: readonly R6TopOption[] = [
  {
    id: 'hoodie_urban',
    name: 'Streetwear Hoodie',
    garmentType: 'hoodie',
    patternVariant: 'standard',
    primaryHex: '#1f2937',
    secondaryHex: '#111827',
    accentHex: '#f97316',
    innerHex: '#e2e8f0',
    swatchHex: '#f97316',
    description: 'Relaxed oversized R6 pullover hoodie with 3D draped hood, kangaroo pocket, and contrast drawstrings.',
  },
  {
    id: 'hoodie_cyan',
    name: 'Neon Tech Hoodie',
    garmentType: 'hoodie',
    patternVariant: 'chevron',
    primaryHex: '#1e293b',
    secondaryHex: '#0f172a',
    accentHex: '#38bdf8',
    innerHex: '#bae6fd',
    swatchHex: '#38bdf8',
    description: 'Modern cyber-blue street hoodie featuring glow seam trim and sculpted back hood.',
  },
  {
    id: 'bomber_jacket',
    name: 'Flight Bomber',
    garmentType: 'bomber',
    patternVariant: 'standard',
    primaryHex: '#364133',
    secondaryHex: '#1e241c',
    accentHex: '#f59e0b',
    innerHex: '#f1f5f9',
    swatchHex: '#4d5c46',
    description: 'Cropped olive MA-1 bomber jacket layered over a crisp white crew-neck tee.',
  },
  {
    id: 'denim_jacket',
    name: 'Indigo Denim Jacket',
    garmentType: 'jacket',
    patternVariant: 'standard',
    primaryHex: '#2b4c7e',
    secondaryHex: '#1e3559',
    accentHex: '#e2e8f0',
    innerHex: '#18181b',
    swatchHex: '#3b66a8',
    description: 'Tailored R6 denim trucker jacket with collar lapels, brass buttons, and dark inner tee.',
  },
  {
    id: 'puffer_vest',
    name: 'Urban Puffer Vest',
    garmentType: 'puffer',
    patternVariant: 'standard',
    primaryHex: '#991b1b',
    secondaryHex: '#450a0a',
    accentHex: '#f8fafc',
    innerHex: '#1e293b',
    swatchHex: '#dc2626',
    description: 'Quilted crimson puffer vest worn cleanly over a slate long-sleeve streetwear shirt.',
  },
  {
    id: 'tshirt_graphic',
    name: 'Graphic Street Tee',
    garmentType: 'tshirt',
    patternVariant: 'standard',
    primaryHex: '#f1f5f9',
    secondaryHex: '#cbd5e1',
    accentHex: '#0ea5e9',
    innerHex: '#0f172a',
    swatchHex: '#e2e8f0',
    description: 'Short-sleeve R6 streetwear t-shirt with crisp chest graphic print and exposed forearms.',
  },
  {
    id: 'shirt_varsity',
    name: 'Varsity Jacket',
    garmentType: 'varsity',
    patternVariant: 'crest',
    primaryHex: '#1e1b4b',
    secondaryHex: '#e2e8f0',
    accentHex: '#f43f5e',
    innerHex: '#f8fafc',
    swatchHex: '#4f46e5',
    description: 'Two-tone collegiate varsity jacket with contrast sleeves, striped rib cuffs, and snap front.',
  },
  {
    id: 'tactical_parka',
    name: 'Alpine Windbreaker',
    garmentType: 'parka',
    patternVariant: 'split',
    primaryHex: '#cbd5e1',
    secondaryHex: '#334155',
    accentHex: '#38bdf8',
    innerHex: '#0f172a',
    swatchHex: '#94a3b8',
    description: 'Weatherproof color-block windbreaker jacket with high collar and winter trim.',
  },
  {
    id: 'operator_sync',
    name: 'Operator Signature',
    garmentType: 'jacket',
    patternVariant: 'chevron',
    primaryHex: '#24303c',
    secondaryHex: '#151c24',
    accentHex: '#38bdf8',
    innerHex: '#0f172a',
    swatchHex: '#06b6d4',
    description: 'Dynamic modern jacket synced to your selected operator palette and visor trim.',
  },
  {
    id: 'hoodie_volt',
    name: 'Volt Pulse Hoodie',
    garmentType: 'hoodie',
    patternVariant: 'bolt',
    primaryHex: '#18181b',
    secondaryHex: '#27272a',
    accentHex: '#a3e635',
    innerHex: '#ecfccb',
    swatchHex: '#a3e635',
    description: 'Matte obsidian pullover hoodie with high-contrast lime bolt trim.',
  },
  {
    id: 'hoodie_crimson',
    name: 'Crimson Strike Hoodie',
    garmentType: 'hoodie',
    patternVariant: 'stripe',
    primaryHex: '#7f1d1d',
    secondaryHex: '#450a0a',
    accentHex: '#fbbf24',
    innerHex: '#fef3c7',
    swatchHex: '#dc2626',
    description: 'Deep scarlet athletic hoodie with gold chest stripe detailing.',
  },
  {
    id: 'hoodie_emerald',
    name: 'Jade Recon Hoodie',
    garmentType: 'hoodie',
    patternVariant: 'grid',
    primaryHex: '#064e3b',
    secondaryHex: '#022c22',
    accentHex: '#2dd4bf',
    innerHex: '#ccfbf1',
    swatchHex: '#10b981',
    description: 'Forest-emerald tactical hoodie patterned with subtle recon grid lines.',
  },
  {
    id: 'bomber_stealth',
    name: 'Night Ops Bomber',
    garmentType: 'bomber',
    patternVariant: 'chevron',
    primaryHex: '#111827',
    secondaryHex: '#030712',
    accentHex: '#ef4444',
    innerHex: '#cbd5e1',
    swatchHex: '#1f2937',
    description: 'Midnight black tactical flight jacket with crimson chevron collar trim.',
  },
  {
    id: 'bomber_gold',
    name: 'Solaris Flight Jacket',
    garmentType: 'bomber',
    patternVariant: 'stripe',
    primaryHex: '#92400e',
    secondaryHex: '#451a03',
    accentHex: '#fde047',
    innerHex: '#f8fafc',
    swatchHex: '#f59e0b',
    description: 'Burnished amber aviator bomber accented with gold flight stripes.',
  },
  {
    id: 'jacket_leather',
    name: 'Outlaw Moto Jacket',
    garmentType: 'jacket',
    patternVariant: 'stripe',
    primaryHex: '#1c1917',
    secondaryHex: '#292524',
    accentHex: '#e11d48',
    innerHex: '#f4f4f5',
    swatchHex: '#292524',
    description: 'Asymmetric black biker jacket over a crisp crew tee with crimson hardware.',
  },
  {
    id: 'jacket_cyber',
    name: 'Prism Tech Coat',
    garmentType: 'jacket',
    patternVariant: 'bolt',
    primaryHex: '#312e81',
    secondaryHex: '#1e1b4b',
    accentHex: '#22d3ee',
    innerHex: '#e0e7ff',
    swatchHex: '#4f46e5',
    description: 'Deep indigo futuristic field jacket trimmed with glowing cyan conduits.',
  },
  {
    id: 'jacket_arctic',
    name: 'Glacier Field Coat',
    garmentType: 'jacket',
    patternVariant: 'grid',
    primaryHex: '#e2e8f0',
    secondaryHex: '#64748b',
    accentHex: '#0284c7',
    innerHex: '#0f172a',
    swatchHex: '#bae6fd',
    description: 'Crisp frost-white winter field jacket with ice-blue alpine piping.',
  },
  {
    id: 'puffer_cobalt',
    name: 'Cobalt Down Puffer',
    garmentType: 'puffer',
    patternVariant: 'chevron',
    primaryHex: '#1d4ed8',
    secondaryHex: '#1e3a8a',
    accentHex: '#facc15',
    innerHex: '#0f172a',
    swatchHex: '#2563eb',
    description: 'Heavy-baffled royal cobalt puffer jacket with bright gold hardware.',
  },
  {
    id: 'puffer_olive',
    name: 'Ranger Quilted Vest',
    garmentType: 'puffer',
    patternVariant: 'camo',
    primaryHex: '#3f6212',
    secondaryHex: '#1a2e05',
    accentHex: '#fb923c',
    innerHex: '#27272a',
    swatchHex: '#65a30d',
    description: 'Rugged woodland olive quilted vest layered over dark thermal sleeves.',
  },
  {
    id: 'tshirt_striker',
    name: 'Striker Jersey Tee',
    garmentType: 'tshirt',
    patternVariant: 'stripe',
    primaryHex: '#ea580c',
    secondaryHex: '#7c2d12',
    accentHex: '#f8fafc',
    innerHex: '#18181b',
    swatchHex: '#f97316',
    description: 'Vibrant sunset orange athletic tee with bold twin racing stripes.',
  },
  {
    id: 'tshirt_sunset',
    name: 'Rose Crest Tee',
    garmentType: 'tshirt',
    patternVariant: 'crest',
    primaryHex: '#be185d',
    secondaryHex: '#831843',
    accentHex: '#fde047',
    innerHex: '#fff1f2',
    swatchHex: '#ec4899',
    description: 'Tailored berry-pink short sleeve tee with golden heraldic chest crest.',
  },
  {
    id: 'tshirt_void',
    name: 'Shadow Bolt Tee',
    garmentType: 'tshirt',
    patternVariant: 'bolt',
    primaryHex: '#09090b',
    secondaryHex: '#27272a',
    accentHex: '#c084fc',
    innerHex: '#f4f4f5',
    swatchHex: '#7c3aed',
    description: 'Jet-black fitted streetwear tee stamped with a neon violet emblem.',
  },
  {
    id: 'varsity_crimson',
    name: 'Apex Scarlet Varsity',
    garmentType: 'varsity',
    patternVariant: 'stripe',
    primaryHex: '#b91c1c',
    secondaryHex: '#18181b',
    accentHex: '#f8fafc',
    innerHex: '#ffffff',
    swatchHex: '#ef4444',
    description: 'Bold scarlet and black collegiate jacket with crisp white striped ribs.',
  },
  {
    id: 'varsity_emerald',
    name: 'Emerald Club Jacket',
    garmentType: 'varsity',
    patternVariant: 'crest',
    primaryHex: '#047857',
    secondaryHex: '#f1f5f9',
    accentHex: '#facc15',
    innerHex: '#0f172a',
    swatchHex: '#059669',
    description: 'Forest emerald letterman jacket featuring ivory sleeves and gold crest.',
  },
  {
    id: 'varsity_gold',
    name: 'Royal Sovereign Varsity',
    garmentType: 'varsity',
    patternVariant: 'chevron',
    primaryHex: '#0f172a',
    secondaryHex: '#f59e0b',
    accentHex: '#38bdf8',
    innerHex: '#f8fafc',
    swatchHex: '#d97706',
    description: 'Obsidian and championship-gold varsity jacket with azure collar accents.',
  },
  {
    id: 'parka_desert',
    name: 'Dune Mirage Parka',
    garmentType: 'parka',
    patternVariant: 'camo',
    primaryHex: '#d6b48a',
    secondaryHex: '#785a3a',
    accentHex: '#f97316',
    innerHex: '#1c1917',
    swatchHex: '#d97706',
    description: 'Sandstone desert combat parka with arid camo blocking and flare trim.',
  },
  {
    id: 'parka_midnight',
    name: 'Stormfront Shell',
    garmentType: 'parka',
    patternVariant: 'grid',
    primaryHex: '#1e3a5f',
    secondaryHex: '#0f172a',
    accentHex: '#2dd4bf',
    innerHex: '#e2e8f0',
    swatchHex: '#0284c7',
    description: 'Deep marine storm parka engineered with ripstop grid weave and teal trim.',
  },
  {
    id: 'parka_plasma',
    name: 'Aether Command Coat',
    garmentType: 'parka',
    patternVariant: 'bolt',
    primaryHex: '#4c1d95',
    secondaryHex: '#1e1b4b',
    accentHex: '#f43f5e',
    innerHex: '#fdf4ff',
    swatchHex: '#8b5cf6',
    description: 'High-command ultraviolet tactical parka with rose plasma highlights.',
  },
];

export const R6_PANTS: readonly R6PantsOption[] = [
  {
    id: 'cargo_charcoal',
    name: 'Charcoal Cargos',
    garmentType: 'cargo',
    baseHex: '#1f242c',
    shadeHex: '#12161b',
    accentHex: '#475569',
    swatchHex: '#272e38',
    description: 'Relaxed R6 cargo trousers with sculpted 3D thigh utility pockets and tactical belt.',
  },
  {
    id: 'cargo_olive',
    name: 'Olive Cargo Pants',
    garmentType: 'cargo',
    baseHex: '#3f4a36',
    shadeHex: '#2a3224',
    accentHex: '#84cc16',
    swatchHex: '#4d5b42',
    description: 'Military olive streetwear cargos with side flap pockets and webbing belt.',
  },
  {
    id: 'jeans_indigo',
    name: 'Classic Blue Jeans',
    garmentType: 'jeans',
    baseHex: '#274472',
    shadeHex: '#1b3052',
    accentHex: '#d97706',
    swatchHex: '#345a96',
    description: 'Crisp indigo denim jeans with contrast gold stitching and cuffed ankles.',
  },
  {
    id: 'jeans_black',
    name: 'Washed Black Denim',
    garmentType: 'jeans',
    baseHex: '#18181b',
    shadeHex: '#09090b',
    accentHex: '#52525b',
    swatchHex: '#27272a',
    description: 'Clean slim-block black denim jeans paired with silver buckle belt.',
  },
  {
    id: 'joggers_slate',
    name: 'Tech Fleece Joggers',
    garmentType: 'joggers',
    baseHex: '#334155',
    shadeHex: '#1e293b',
    accentHex: '#38bdf8',
    swatchHex: '#475569',
    description: 'Athletic tapered fleece joggers with side stripe detail and ribbed cuffs.',
  },
  {
    id: 'khaki_chinos',
    name: 'Sandstone Chinos',
    garmentType: 'chinos',
    baseHex: '#927452',
    shadeHex: '#6b5338',
    accentHex: '#3f2e20',
    swatchHex: '#a3825e',
    description: 'Smart modern tan chino trousers suited for desert and urban loadouts.',
  },
  {
    id: 'tactical_camo',
    name: 'Woodland Camo Pants',
    garmentType: 'cargo',
    baseHex: '#3a4630',
    shadeHex: '#232a1d',
    accentHex: '#65a30d',
    swatchHex: '#4c5e3c',
    description: 'Camo-patterned R6 cargo pants with reinforced knee panels.',
  },
  {
    id: 'cargo_sand',
    name: 'Desert Storm Cargos',
    garmentType: 'cargo',
    baseHex: '#a88f6c',
    shadeHex: '#7d6749',
    accentHex: '#f97316',
    swatchHex: '#bfa37c',
    description: 'Arid sandstone utility cargos built for dune operations.',
  },
  {
    id: 'cargo_navy',
    name: 'Midnight Navy Cargos',
    garmentType: 'cargo',
    baseHex: '#1e293b',
    shadeHex: '#0f172a',
    accentHex: '#38bdf8',
    swatchHex: '#1e3a8a',
    description: 'Deep navy tactical cargo trousers with cyan pocket piping.',
  },
  {
    id: 'jeans_acid',
    name: 'Washed Sky Denim',
    garmentType: 'jeans',
    baseHex: '#4b6b94',
    shadeHex: '#344c6b',
    accentHex: '#fbbf24',
    swatchHex: '#6082b0',
    description: 'Light vintage-wash streetwear jeans with amber seam stitching.',
  },
  {
    id: 'joggers_crimson',
    name: 'Crimson Track Pants',
    garmentType: 'joggers',
    baseHex: '#27272a',
    shadeHex: '#18181b',
    accentHex: '#ef4444',
    swatchHex: '#dc2626',
    description: 'Tapered dark track joggers accented with bright red racing stripes.',
  },
  {
    id: 'joggers_onyx',
    name: 'Volt Runner Joggers',
    garmentType: 'joggers',
    baseHex: '#111827',
    shadeHex: '#030712',
    accentHex: '#a3e635',
    swatchHex: '#84cc16',
    description: 'Sleek onyx tech joggers highlighted by neon lime ankle piping.',
  },
  {
    id: 'chinos_charcoal',
    name: 'Slate Field Chinos',
    garmentType: 'chinos',
    baseHex: '#475569',
    shadeHex: '#334155',
    accentHex: '#cbd5e1',
    swatchHex: '#64748b',
    description: 'Tailored slate-gray combat chinos for crisp urban mobility.',
  },
  {
    id: 'tactical_snow',
    name: 'Arctic Recon Cargos',
    garmentType: 'cargo',
    baseHex: '#cbd5e1',
    shadeHex: '#94a3b8',
    accentHex: '#0ea5e9',
    swatchHex: '#e2e8f0',
    description: 'Frost-camo insulated cargo pants built for polar zones.',
  },
];

export const R6_SHOES: readonly R6ShoesOption[] = [
  {
    id: 'sneakers_white',
    name: 'Clean Court Kicks',
    styleType: 'sneaker',
    upperHex: '#f8fafc',
    soleHex: '#e2e8f0',
    accentHex: '#38bdf8',
    swatchHex: '#f8fafc',
    description: 'Crisp white low-top street sneakers with sculpted cupsole and cyan heel tab.',
  },
  {
    id: 'sneakers_crimson',
    name: 'Red/Black Runners',
    styleType: 'sneaker',
    upperHex: '#18181b',
    soleHex: '#f8fafc',
    accentHex: '#ef4444',
    swatchHex: '#ef4444',
    description: 'Color-blocked black and crimson street sneakers on a bright white midsole.',
  },
  {
    id: 'hightops_cyan',
    name: 'Sky High-Tops',
    styleType: 'hightop',
    upperHex: '#1e293b',
    soleHex: '#f1f5f9',
    accentHex: '#0ea5e9',
    swatchHex: '#0ea5e9',
    description: 'Iconic padded collar high-top basketball sneakers with electric blue panels.',
  },
  {
    id: 'trainers_volt',
    name: 'Volt Mesh Trainers',
    styleType: 'sneaker',
    upperHex: '#1f2937',
    soleHex: '#111827',
    accentHex: '#a3e635',
    swatchHex: '#a3e635',
    description: 'Lightweight athletic trainers accented with neon lime sole highlights.',
  },
  {
    id: 'boots_combat',
    name: 'Stealth Combat Boots',
    styleType: 'boot',
    upperHex: '#171717',
    soleHex: '#09090b',
    accentHex: '#52525b',
    swatchHex: '#262626',
    description: 'Rugged matte black tactical lace-up boots with heavy lugged outsole.',
  },
  {
    id: 'boots_tan',
    name: 'Timber Field Boots',
    styleType: 'boot',
    upperHex: '#9a6232',
    soleHex: '#3f2e20',
    accentHex: '#78350f',
    swatchHex: '#b4743c',
    description: 'Classic wheat-tan nubuck field boots with padded dark collar.',
  },
  {
    id: 'sneakers_gold',
    name: 'Solaris Court Lows',
    styleType: 'sneaker',
    upperHex: '#1c1917',
    soleHex: '#fef3c7',
    accentHex: '#f59e0b',
    swatchHex: '#f59e0b',
    description: 'Sleek onyx low-tops accented with championship-gold toe and side stripes.',
  },
  {
    id: 'sneakers_emerald',
    name: 'Jade Street Runners',
    styleType: 'sneaker',
    upperHex: '#ecfdf5',
    soleHex: '#d1fae5',
    accentHex: '#10b981',
    swatchHex: '#10b981',
    description: 'Mint-white aerodynamic runners trimmed with emerald overlays.',
  },
  {
    id: 'hightops_crimson',
    name: 'Crimson Slam Highs',
    styleType: 'hightop',
    upperHex: '#991b1b',
    soleHex: '#f8fafc',
    accentHex: '#facc15',
    swatchHex: '#dc2626',
    description: 'High-ankle scarlet court boots with gold collar piping.',
  },
  {
    id: 'hightops_violet',
    name: 'Plasma High-Tops',
    styleType: 'hightop',
    upperHex: '#312e81',
    soleHex: '#e2e8f0',
    accentHex: '#c084fc',
    swatchHex: '#8b5cf6',
    description: 'Indigo & orchid cyber high-tops engineered for urban parkour.',
  },
  {
    id: 'trainers_ice',
    name: 'Frost Aero Trainers',
    styleType: 'sneaker',
    upperHex: '#bae6fd',
    soleHex: '#f8fafc',
    accentHex: '#0284c7',
    swatchHex: '#7dd3fc',
    description: 'Glacier-blue breathable knit runners with crisp white cushioning.',
  },
  {
    id: 'boots_obsidian',
    name: 'Apex Ranger Boots',
    styleType: 'boot',
    upperHex: '#27272a',
    soleHex: '#09090b',
    accentHex: '#f97316',
    swatchHex: '#ea580c',
    description: 'Reinforced slate tactical boots with hazard-orange heel armor.',
  },
];

export const R6_HATS: readonly R6SimpleGearOption<R6HatId>[] = [
  { id: 'none', name: 'No Hat', swatchHex: '#475569', accentHex: '#64748b', description: 'Show your equipped 3D hairstyle unobstructed.' },
  { id: 'baseball_cap', name: 'Street Cap', swatchHex: '#1e293b', accentHex: '#38bdf8', description: 'Structured curved-brim baseball cap with front embroidered patch.' },
  { id: 'backwards_cap', name: 'Backwards Snapback', swatchHex: '#991b1b', accentHex: '#f8fafc', description: 'Classic backwards flat-brim snapback cap.' },
  { id: 'beanie', name: 'Ribbed Beanie', swatchHex: '#d97706', accentHex: '#fbbf24', description: 'Cozy cuffed knit beanie resting cleanly over your hairline.' },
  { id: 'bucket_hat', name: 'Bucket Hat', swatchHex: '#3f4a36', accentHex: '#84cc16', description: 'All-around angled brim streetwear bucket hat.' },
  { id: 'tactical_cap', name: 'Operator Cap', swatchHex: '#18181b', accentHex: '#f97316', description: 'Matte tactical operator cap with orange front morale patch.' },
];

export const R6_GLASSES: readonly R6SimpleGearOption<R6GlassesId>[] = [
  { id: 'none', name: 'No Glasses', swatchHex: '#475569', accentHex: '#64748b', description: 'Clear view of your custom face & eye expression.' },
  { id: 'wayfarers', name: 'Street Shades', swatchHex: '#111827', accentHex: '#38bdf8', description: 'Dark square-frame sunglasses with subtle sky reflection.' },
  { id: 'aviators', name: 'Gold Aviators', swatchHex: '#d97706', accentHex: '#fbbf24', description: 'Classic metallic aviator sunglasses.' },
  { id: 'cyber_visor', name: 'Neon Cyber Visor', swatchHex: '#06b6d4', accentHex: '#22d3ee', description: 'Wrap-around translucent glowing cyan HUD visor.' },
  { id: 'round_frames', name: 'Retro Round Frames', swatchHex: '#334155', accentHex: '#cbd5e1', description: 'Minimalist thin-rimmed round glasses with clear lenses.' },
];

export const R6_MASKS: readonly R6SimpleGearOption<R6MaskId>[] = [
  { id: 'none', name: 'No Mask', swatchHex: '#475569', accentHex: '#64748b', description: 'Full unobstructed lower face & mouth expression.' },
  { id: 'cloth_mask', name: 'Street Face Mask', swatchHex: '#18181b', accentHex: '#f97316', description: 'Contoured black cloth mask with subtle orange accent seam.' },
  { id: 'respirator', name: 'Tactical Respirator', swatchHex: '#1f2937', accentHex: '#38bdf8', description: 'Dual-filter urban tactical half-respirator.' },
  { id: 'gaiter_scarf', name: 'Neck Gaiter', swatchHex: '#7f1d1d', accentHex: '#ef4444', description: 'Pull-up crimson tactical neck gaiter covering mouth and chin.' },
];

export const R6_ARMORS: readonly R6ArmorOption[] = [
  { id: 'none', name: 'No Armor Vest', tier: 0, metalHex: '#475569', trimHex: '#334155', glowHex: '#000000' },
  { id: 'iron_lv1', name: 'Lv.1 Kevlar Vest', tier: 1, metalHex: '#64748b', trimHex: '#94a3b8', glowHex: '#38bdf8' },
  { id: 'diamond_lv2', name: 'Lv.2 Ballistic Plate', tier: 2, metalHex: '#1e3a5f', trimHex: '#38bdf8', glowHex: '#67e8f9' },
  { id: 'nether_gold_lv3', name: 'Lv.3 Heavy Exo', tier: 3, metalHex: '#1f2937', trimHex: '#f59e0b', glowHex: '#fbbf24' },
];

export const R6_ACCESSORIES: readonly R6SimpleGearOption<R6AccessoryId>[] = [
  { id: 'none', name: 'None', swatchHex: '#475569', accentHex: '#64748b', description: 'Clean streetwear silhouette with no extra backpack or headset.' },
  { id: 'backpack', name: 'Street Rucksack', swatchHex: '#334155', accentHex: '#f97316', description: 'Sleek two-strap urban backpack mounted cleanly on your back.' },
  { id: 'headphones', name: 'Studio Headphones', swatchHex: '#1e293b', accentHex: '#38bdf8', description: 'Over-ear wireless headphones resting smoothly on your head.' },
  { id: 'shades', name: 'Bonus Shades', swatchHex: '#06b6d4', accentHex: '#38bdf8', description: 'Additional polarized tactical shades accent.' },
  { id: 'crown', name: 'Holo Crown Visor', swatchHex: '#2dd4bf', accentHex: '#14b8a6', description: 'Glowing holographic brow accessory.' },
  { id: 'cape', name: 'Stealth Cape', swatchHex: '#7f1d1d', accentHex: '#ef4444', description: 'Flowing crimson shoulder cape draped cleanly behind the torso.' },
];

export const R6_PETS: readonly R6PetOption[] = [
  {
    id: 'wolf',
    name: 'K9 Shepherd',
    swatchHex: '#a16207',
    accentHex: '#f59e0b',
    role: 'Tactical Assault Hound',
    traitBadge: 'LOYAL SCOUT',
    personality: 'Alert, disciplined, and fiercely loyal — perks its ears on touchdown and celebrates eliminations.',
    behavior: 'Trots smoothly alongside your left flank across terrain, bounds during sprints, and keeps clear of your line of fire.',
  },
  {
    id: 'fox',
    name: 'Arctic K9 Unit',
    swatchHex: '#e2e8f0',
    accentHex: '#38bdf8',
    role: 'Alpine Frost Tracker',
    traitBadge: 'AGILE TRACKER',
    personality: 'Swift, curious alpine shepherd with icy blue telemetry collar and high-energy tail wags.',
    behavior: 'Glides effortlessly over slopes and ridges alongside you, staying compact and unobtrusive in tight cover.',
  },
  {
    id: 'parrot',
    name: 'Recon Drone',
    swatchHex: '#38bdf8',
    accentHex: '#0ea5e9',
    role: 'Autonomous Quad-Rotor',
    traitBadge: 'AERIAL RECON',
    personality: 'Precision-engineered micro-UAV with stabilized optical gimbal and playful mid-air barrel-roll bursts.',
    behavior: 'Hovers at shoulder altitude, banks forward cleanly into turns and sprints, and spools up rotors dynamically.',
  },
  {
    id: 'creeper_bot',
    name: 'Tactical UGV',
    swatchHex: '#4ade80',
    accentHex: '#22c55e',
    role: 'Tracked Sentry Rover',
    traitBadge: 'ARMORED ROVER',
    personality: 'Stoic twin-track ground drone with sweeping emerald optics and steady gyro-stabilized turret.',
    behavior: 'Rolls over uneven terrain with articulated suspension bounce and tracks nearby sightlines.',
  },
  {
    id: 'none',
    name: 'No Companion',
    swatchHex: '#334155',
    accentHex: '#64748b',
    role: 'Solo Deployment',
    traitBadge: 'SOLO OP',
    personality: 'Deploy completely alone for a classic minimalist operator silhouette in lobby and matches.',
    behavior: 'Deactivates companion deployment on both the helipad lobby and active battlegrounds.',
  },
];

export const DEFAULT_R6_CUSTOMIZATION: R6Customization = {
  skinId: 'operator_natural',
  eyesId: 'determined',
  mouthId: 'confident_grin',
  faceMarkId: 'none',
  hairStyleId: 'swept_undercut',
  hairColorId: 'espresso',
  topId: 'hoodie_urban',
  pantsId: 'cargo_charcoal',
  shoesId: 'sneakers_white',
  hatId: 'none',
  glassesId: 'none',
  maskId: 'none',
  armorId: 'none',
  accessoryId: 'none',
  petId: 'wolf',
  petEnabled: true,
};

const STORAGE_KEY = 'nexus-royale.r6-custom.v3';
const CHAR_OVERRIDES_STORAGE_KEY = 'nexus-royale.r6-char-overrides.v1';
const LEGACY_STORAGE_KEYS = [
  'nexus-royale.operator-custom.v2',
  'nexus-royale.minecraft-custom.v1',
];

function validOrFallback<T extends string>(
  val: unknown,
  list: ReadonlyArray<{ id: T }>,
  fallback: T,
): T {
  return typeof val === 'string' && list.some((item) => item.id === val) ? (val as T) : fallback;
}

export function normalizeR6Customization(
  raw?: Partial<R6Customization> & Record<string, unknown>,
): R6Customization {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_R6_CUSTOMIZATION };
  }

  // Graceful migration if older v1/v2 keys are encountered
  let mappedSkin = raw.skinId as string | undefined;
  if (mappedSkin === 'cyber_boy') mappedSkin = 'operator_natural';
  else if (mappedSkin === 'classic_alex') mappedSkin = 'fair_sunlit';
  else if (mappedSkin === 'steve_hero') mappedSkin = 'warm_bronze';
  else if (mappedSkin === 'shadow_ash') mappedSkin = 'deep_umber';
  else if (mappedSkin === 'frost_nova') mappedSkin = 'nordic_pale';
  else if (mappedSkin === 'emerald_scout') mappedSkin = 'olive_tan';

  let mappedTop = raw.topId as string | undefined;
  if (!mappedTop && typeof raw.clothesId === 'string') {
    if (raw.clothesId === 'fighter_sync') mappedTop = 'operator_sync';
    else if (raw.clothesId === 'arctic_parka') mappedTop = 'tactical_parka';
    else if (raw.clothesId === 'crimson_knight') mappedTop = 'puffer_vest';
    else if (raw.clothesId === 'emerald_warden') mappedTop = 'bomber_jacket';
    else if (raw.clothesId === 'solar_gold') mappedTop = 'hoodie_urban';
    else mappedTop = 'hoodie_cyan';
  }

  return {
    skinId: validOrFallback(mappedSkin, R6_SKINS, DEFAULT_R6_CUSTOMIZATION.skinId),
    eyesId: validOrFallback(raw.eyesId, R6_EYE_STYLES, DEFAULT_R6_CUSTOMIZATION.eyesId),
    mouthId: validOrFallback(raw.mouthId, R6_MOUTH_STYLES, DEFAULT_R6_CUSTOMIZATION.mouthId),
    faceMarkId: validOrFallback(raw.faceMarkId, R6_FACE_MARKS, DEFAULT_R6_CUSTOMIZATION.faceMarkId),
    hairStyleId: validOrFallback(raw.hairStyleId, R6_HAIR_STYLES, DEFAULT_R6_CUSTOMIZATION.hairStyleId),
    hairColorId: validOrFallback(raw.hairColorId, R6_HAIR_COLORS, DEFAULT_R6_CUSTOMIZATION.hairColorId),
    topId: validOrFallback(mappedTop, R6_TOPS, DEFAULT_R6_CUSTOMIZATION.topId),
    pantsId: validOrFallback(raw.pantsId, R6_PANTS, DEFAULT_R6_CUSTOMIZATION.pantsId),
    shoesId: validOrFallback(raw.shoesId, R6_SHOES, DEFAULT_R6_CUSTOMIZATION.shoesId),
    hatId: validOrFallback(raw.hatId, R6_HATS, DEFAULT_R6_CUSTOMIZATION.hatId),
    glassesId: validOrFallback(raw.glassesId, R6_GLASSES, DEFAULT_R6_CUSTOMIZATION.glassesId),
    maskId: validOrFallback(raw.maskId, R6_MASKS, DEFAULT_R6_CUSTOMIZATION.maskId),
    armorId: validOrFallback(raw.armorId, R6_ARMORS, DEFAULT_R6_CUSTOMIZATION.armorId),
    accessoryId: validOrFallback(raw.accessoryId, R6_ACCESSORIES, DEFAULT_R6_CUSTOMIZATION.accessoryId),
    petId: validOrFallback(raw.petId, R6_PETS, DEFAULT_R6_CUSTOMIZATION.petId),
    petEnabled:
      typeof raw.petEnabled === 'boolean'
        ? raw.petEnabled
        : DEFAULT_R6_CUSTOMIZATION.petEnabled,
  };
}

export function loadR6Customization(): R6Customization {
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const oldKey of LEGACY_STORAGE_KEYS) {
        const legacy = window.localStorage.getItem(oldKey);
        if (legacy) {
          raw = legacy;
          break;
        }
      }
    }
    if (!raw) return { ...DEFAULT_R6_CUSTOMIZATION };
    return normalizeR6Customization(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_R6_CUSTOMIZATION };
  }
}

export function saveR6Customization(config: R6Customization): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

function readAllCharOverrides(): Record<string, Partial<R6Customization>> {
  try {
    const raw = window.localStorage.getItem(CHAR_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Partial<R6Customization>>) : {};
  } catch {
    return {};
  }
}

function writeAllCharOverrides(map: Record<string, Partial<R6Customization>>): void {
  try {
    window.localStorage.setItem(CHAR_OVERRIDES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCharacterCustomizationOverride(
  characterId: string,
): Partial<R6Customization> | null {
  const all = readAllCharOverrides();
  return all[characterId] ?? null;
}

export function saveCharacterCustomizationOverride(
  characterId: string,
  config: R6Customization,
  presetAppearance: Partial<R6Customization>,
): void {
  const all = readAllCharOverrides();
  const diff: Partial<R6Customization> = {};
  const keys = [
    'skinId',
    'eyesId',
    'mouthId',
    'faceMarkId',
    'hairStyleId',
    'hairColorId',
    'topId',
    'pantsId',
    'shoesId',
    'hatId',
    'glassesId',
    'maskId',
  ] as const;
  for (const k of keys) {
    const baseVal = presetAppearance[k] ?? DEFAULT_R6_CUSTOMIZATION[k];
    if (config[k] !== baseVal) {
      (diff as Record<string, unknown>)[k] = config[k];
    }
  }
  if (Object.keys(diff).length === 0) {
    delete all[characterId];
  } else {
    all[characterId] = diff;
  }
  writeAllCharOverrides(all);
}

export function clearCharacterCustomizationOverride(characterId: string): void {
  const all = readAllCharOverrides();
  if (characterId in all) {
    delete all[characterId];
    writeAllCharOverrides(all);
  }
}

export function exportAllCharOverrides(): Record<string, Partial<R6Customization>> {
  return readAllCharOverrides();
}

export function applyAllCharOverrides(
  raw?: Record<string, Partial<R6Customization>> | null,
): void {
  if (!raw || typeof raw !== 'object') {
    writeAllCharOverrides({});
    return;
  }
  const clean: Record<string, Partial<R6Customization>> = {};
  for (const [charId, patch] of Object.entries(raw)) {
    if (typeof charId === 'string' && charId.trim() && patch && typeof patch === 'object') {
      clean[charId.trim().slice(0, 32)] = patch;
    }
  }
  writeAllCharOverrides(clean);
}

export function resetR6CustomizationStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(CHAR_OVERRIDES_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

export function resolveCharacterCustomization(
  characterId: string,
  presetAppearance: Partial<R6Customization>,
  globalGear: Pick<R6Customization, 'armorId' | 'accessoryId' | 'petId' | 'petEnabled'>,
): R6Customization {
  const override = loadCharacterCustomizationOverride(characterId);
  return normalizeR6Customization({
    ...DEFAULT_R6_CUSTOMIZATION,
    ...presetAppearance,
    ...(override ?? {}),
    armorId: globalGear.armorId,
    accessoryId: globalGear.accessoryId,
    petId: globalGear.petId,
    petEnabled: globalGear.petEnabled,
  });
}

export function getSkinOption(id: R6SkinId): R6SkinOption {
  return R6_SKINS.find((s) => s.id === id) ?? R6_SKINS[0];
}

export function getEyeOption(id: R6EyeStyleId): R6EyeOption {
  return R6_EYE_STYLES.find((e) => e.id === id) ?? R6_EYE_STYLES[0];
}

export function getMouthOption(id: R6MouthStyleId): R6MouthOption {
  return R6_MOUTH_STYLES.find((m) => m.id === id) ?? R6_MOUTH_STYLES[0];
}

export function getFaceMarkOption(id: R6FaceMarkId): R6FaceMarkOption {
  return R6_FACE_MARKS.find((f) => f.id === id) ?? R6_FACE_MARKS[0];
}

export function getHairStyleOption(id: R6HairStyleId): R6HairStyleOption {
  return R6_HAIR_STYLES.find((h) => h.id === id) ?? R6_HAIR_STYLES[0];
}

export function getHairColorOption(id: R6HairColorId): R6HairColorOption {
  return R6_HAIR_COLORS.find((h) => h.id === id) ?? R6_HAIR_COLORS[0];
}

export function getTopOption(id: R6TopId): R6TopOption {
  return R6_TOPS.find((t) => t.id === id) ?? R6_TOPS[0];
}

export function getPantsOption(id: R6PantsId): R6PantsOption {
  return R6_PANTS.find((p) => p.id === id) ?? R6_PANTS[0];
}

export function getShoesOption(id: R6ShoesId): R6ShoesOption {
  return R6_SHOES.find((s) => s.id === id) ?? R6_SHOES[0];
}

export function getHatOption(id: R6HatId): R6SimpleGearOption<R6HatId> {
  return R6_HATS.find((h) => h.id === id) ?? R6_HATS[0];
}

export function getGlassesOption(id: R6GlassesId): R6SimpleGearOption<R6GlassesId> {
  return R6_GLASSES.find((g) => g.id === id) ?? R6_GLASSES[0];
}

export function getMaskOption(id: R6MaskId): R6SimpleGearOption<R6MaskId> {
  return R6_MASKS.find((m) => m.id === id) ?? R6_MASKS[0];
}

export function getArmorOption(id: R6ArmorId): R6ArmorOption {
  return R6_ARMORS.find((a) => a.id === id) ?? R6_ARMORS[0];
}

export function getAccessoryOption(id: R6AccessoryId): R6SimpleGearOption<R6AccessoryId> {
  return R6_ACCESSORIES.find((a) => a.id === id) ?? R6_ACCESSORIES[0];
}

export function getPetOption(id: R6PetId): R6PetOption {
  return R6_PETS.find((p) => p.id === id) ?? R6_PETS[0];
}

export function getArmorIdFromTier(tier: 0 | 1 | 2 | 3): R6ArmorId {
  switch (tier) {
    case 1:
      return 'iron_lv1';
    case 2:
      return 'diamond_lv2';
    case 3:
      return 'nether_gold_lv3';
    default:
      return 'none';
  }
}

export function getCustomizationOptionInfo(
  category: keyof R6Customization,
  id: string,
): { title: string; subtitle: string; description: string; swatchHex: string } {
  switch (category) {
    case 'topId': {
      const item = getTopOption(id as R6TopId);
      return {
        title: item.name,
        subtitle: 'Modern R6 Top / Jacket',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'pantsId': {
      const item = getPantsOption(id as R6PantsId);
      return {
        title: item.name,
        subtitle: 'Modern R6 Bottoms',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'shoesId': {
      const item = getShoesOption(id as R6ShoesId);
      return {
        title: item.name,
        subtitle: 'R6 Footwear & Sneakers',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'hairStyleId': {
      const item = getHairStyleOption(id as R6HairStyleId);
      return {
        title: item.name,
        subtitle: '3D Hairstyle',
        description: 'Equips a sculpted 3D Roblox R6 hairstyle tailored to fit cleanly with hats and headgear.',
        swatchHex: item.swatchHex,
      };
    }
    case 'hairColorId': {
      const item = getHairColorOption(id as R6HairColorId);
      return {
        title: item.name,
        subtitle: 'Hair Color',
        description: 'Changes hair pigment and highlight sheen across your 3D hairstyle and brows.',
        swatchHex: item.swatchHex,
      };
    }
    case 'eyesId': {
      const item = getEyeOption(id as R6EyeStyleId);
      return {
        title: item.name,
        subtitle: 'Facial Eyes',
        description: 'Customizes eye shape, iris expression, and eyebrow attitude on your R6 head.',
        swatchHex: item.swatchHex,
      };
    }
    case 'mouthId': {
      const item = getMouthOption(id as R6MouthStyleId);
      return {
        title: item.name,
        subtitle: 'Facial Expression',
        description: 'Customizes the mouth expression rendered crisply on your R6 character face.',
        swatchHex: item.swatchHex,
      };
    }
    case 'faceMarkId': {
      const item = getFaceMarkOption(id as R6FaceMarkId);
      return {
        title: item.name,
        subtitle: 'Facial Feature',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'hatId': {
      const item = getHatOption(id as R6HatId);
      return {
        title: item.name,
        subtitle: '3D Headwear',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'glassesId': {
      const item = getGlassesOption(id as R6GlassesId);
      return {
        title: item.name,
        subtitle: 'Eyewear & Shades',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'maskId': {
      const item = getMaskOption(id as R6MaskId);
      return {
        title: item.name,
        subtitle: 'Face Mask',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'armorId': {
      const item = getArmorOption(id as R6ArmorId);
      return {
        title: item.name,
        subtitle: item.tier === 0 ? 'Streetwear Fit' : `Ballistic Armor · Tier ${item.tier}`,
        description:
          item.tier === 0
            ? 'Unarmored clean streetwear silhouette with zero external chest plating.'
            : `Tier-${item.tier} protective tactical vest layered cleanly over your R6 outfit.`,
        swatchHex: item.metalHex,
      };
    }
    case 'accessoryId': {
      const item = getAccessoryOption(id as R6AccessoryId);
      return {
        title: item.name,
        subtitle: 'Back & Bonus Gear',
        description: item.description,
        swatchHex: item.swatchHex,
      };
    }
    case 'skinId': {
      const item = getSkinOption(id as R6SkinId);
      return {
        title: item.name,
        subtitle: 'Skin Tone',
        description: 'Adjusts complexion tone across the R6 block head, neck, arms, and hands.',
        swatchHex: item.swatchHex,
      };
    }
    case 'petId': {
      const item = getPetOption(id as R6PetId);
      return {
        title: item.name,
        subtitle: 'Lobby Companion',
        description: 'Deploys alongside your character on the lobby helipad and battleground.',
        swatchHex: item.swatchHex,
      };
    }
    case 'petEnabled': {
      const enabled = id === 'true' || id === '1';
      return {
        title: enabled ? 'Follow In Matches: ON' : 'Follow In Matches: OFF',
        subtitle: 'Companion Toggle',
        description: 'Controls whether your equipped companion deploys beside you during live matches.',
        swatchHex: enabled ? '#22c55e' : '#64748b',
      };
    }
  }
}
