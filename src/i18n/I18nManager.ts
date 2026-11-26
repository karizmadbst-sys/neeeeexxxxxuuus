import type { AppLanguage, PerformanceTier } from '../core/Types';
import type { AbilityCategory } from '../characters/CharacterAbility';
import type { ControlSlotId, GameAction, HudActionSlotId } from '../input/ControlSettings';
import type { LootCategory, LootRarity } from '../loot/ILootSystem';
import type { R6Customization, R6PetId } from '../player/R6CustomizationData';
import type { ShopCategory } from '../shop/IShopSystem';
import type { WeaponCategory } from '../weapons/IWeaponSystem';
import { TRANSLATIONS, type TranslationKey } from './translations';

export type LanguageChangeListener = (lang: AppLanguage, isRtl: boolean) => void;

export interface LanguageOption {
  id: AppLanguage;
  label: string;
  nativeLabel: string;
  dir: 'ltr' | 'rtl';
}

type LangPair = { ar: string; es: string };
type MapTextPair = { en: string; ar: string; es: string };

const WEAPON_TRANSLATIONS: Record<string, { ar: string; es: string }> = {
  ump: { ar: 'UMP رشاش', es: 'UMP' },
  mp5: { ar: 'MP5 رشاش', es: 'MP5' },
  mp40: { ar: 'MP40 رشاش', es: 'MP40' },
  scar: { ar: 'SCAR بندقية', es: 'SCAR' },
  ak24: { ar: 'AK-47 كلاشينكوف', es: 'AK-47' },
  parafal: { ar: 'PARAFAL بندقية', es: 'PARAFAL' },
  m4a1: { ar: 'M4A1 بندقية', es: 'M4A1' },
  m1014: { ar: 'M1014 شوتغن', es: 'M1014' },
  m1887: { ar: 'M1887 شوتغن', es: 'M1887' },
  awm: { ar: 'AWM قناص', es: 'AWM' },
  kar98k: { ar: 'KAR98K قناص', es: 'KAR98K' },
  desert_eagle: { ar: 'ديزرت إيجل', es: 'Desert Eagle' },
  glock: { ar: 'جلوك 9مم', es: 'Glock' },
  combat_knife: { ar: 'سكين قتالي', es: 'Cuchillo de Combate' },
  baseball_bat: { ar: 'مضرب بيسبول', es: 'Bate de Béisbol' },
  famas: { ar: 'FAMAS بندقية', es: 'FAMAS' },
  aug: { ar: 'AUG بندقية', es: 'AUG' },
  groza: { ar: 'Groza بندقية', es: 'Groza' },
  an94: { ar: 'AN94 بندقية', es: 'AN94' },
  vector: { ar: 'Vector رشاش', es: 'Vector' },
  p90: { ar: 'P90 رشاش', es: 'P90' },
  thompson: { ar: 'Thompson رشاش', es: 'Thompson' },
  spas12: { ar: 'SPAS12 شوتغن', es: 'SPAS12' },
  double_barrel: { ar: 'شوتغن ثنائي', es: 'Doble Cañón' },
  m24: { ar: 'M24 قناص', es: 'M24' },
  svd: { ar: 'SVD قناص', es: 'SVD' },
  vss: { ar: 'VSS قناص كاتم', es: 'VSS' },
  dragunov: { ar: 'دراجونوف قناص', es: 'Dragunov' },
  usp: { ar: 'USP مسدس', es: 'USP' },
  m1917: { ar: 'M1917 مسدس', es: 'M1917' },
  m249: { ar: 'M249 رشاش ثقيل', es: 'M249' },
  m60: { ar: 'M60 رشاش ثقيل', es: 'M60' },
  dp28: { ar: 'DP-28 رشاش ثقيل', es: 'DP-28' },
  fists: { ar: 'قبضات', es: 'Puños' },
};

const LOOT_TRANSLATIONS: Record<
  string,
  { name: LangPair; desc: LangPair }
> = {
  weapon_ump: {
    name: { ar: 'UMP رشاش', es: 'UMP' },
    desc: {
      ar: 'رشاش تكتيكي متوازن بتحكم موثوق في المسافات القريبة والمتوسطة.',
      es: 'Subfusil táctico equilibrado con control fiable a corta y media distancia.',
    },
  },
  weapon_mp5: {
    name: { ar: 'MP5 رشاش', es: 'MP5' },
    desc: {
      ar: 'رشاش قتال قريب بمعدل إطلاق عالٍ وارتداد منخفض.',
      es: 'Subfusil de corto alcance con alta cadencia y bajo retroceso.',
    },
  },
  weapon_mp40: {
    name: { ar: 'MP40 رشاش', es: 'MP40' },
    desc: {
      ar: 'رشاش سريع الإطلاق مصمم للاقتحامات الهجومية.',
      es: 'Subfusil de fuego rápido calibrado para asaltos agresivos.',
    },
  },
  weapon_scar: {
    name: { ar: 'SCAR بندقية', es: 'SCAR' },
    desc: {
      ar: 'بندقية هجومية معيارية بدقة ثابتة للمدى المتوسط.',
      es: 'Rifle de asalto modular con precisión estable a media distancia.',
    },
  },
  weapon_ak24: {
    name: { ar: 'AK-47 كلاشينكوف', es: 'AK-47' },
    desc: {
      ar: 'بندقية هجومية قوية عيار 7.62 مم لاختراق الدروع الثقيلة.',
      es: 'Contundente rifle 7.62 mm diseñado contra armadura pesada.',
    },
  },
  weapon_m4a1: {
    name: { ar: 'M4A1 بندقية', es: 'M4A1' },
    desc: {
      ar: 'كاربين متعدد المهام بارتداد منخفض وحركة سريعة.',
      es: 'Carabina versátil de bajo retroceso, gran movilidad y miras limpias.',
    },
  },
  weapon_parafal: {
    name: { ar: 'PARAFAL بندقية', es: 'PARAFAL' },
    desc: {
      ar: 'بندقية قتال بعيدة المدى بإصابات رأسية حاسمة.',
      es: 'Rifle de combate de largo alcance con alto daño crítico a la cabeza.',
    },
  },
  weapon_m1014: {
    name: { ar: 'M1014 شوتغن', es: 'M1014' },
    desc: {
      ar: 'بندقية رش قتالية نصف أوتوماتيكية بمخزن 7 طلقات.',
      es: 'Escopeta táctica semiautomática con cargador tubular de 7 cartuchos.',
    },
  },
  weapon_m1887: {
    name: { ar: 'M1887 شوتغن', es: 'M1887' },
    desc: {
      ar: 'شوتغن ثنائي الماسورة بـ 8 شظايا فتاكة عن قرب.',
      es: 'Escopeta de dos cañones con 8 perdigones devastadores de cerca.',
    },
  },
  weapon_awm: {
    name: { ar: 'AWM قناص', es: 'AWM' },
    desc: {
      ar: 'بندقية قنص ثقيلة عيار .338 مزودة بمنظار بصري دقيق.',
      es: 'Rifle de francotirador pesado .338 de cerrojo con mira óptica de precisión.',
    },
  },
  weapon_kar98k: {
    name: { ar: 'KAR98K قناص', es: 'KAR98K' },
    desc: {
      ar: 'بندقية قنص كلاسيكية بآلية ترباس ودقة تصويب عالية.',
      es: 'Rifle clásico de cerrojo con culata de nogal y puntería nítida.',
    },
  },
  weapon_desert_eagle: {
    name: { ar: 'ديزرت إيجل', es: 'Desert Eagle' },
    desc: {
      ar: 'مسدس ماغنوم ثقيل عيار .50 بقوة إيقاف تقارب البنادق.',
      es: 'Pistola magnum pesada .50 AE con potencia de parada de rifle.',
    },
  },
  weapon_glock: {
    name: { ar: 'جلوك 9مم', es: 'Glock' },
    desc: {
      ar: 'مسدس تكتيكي مدمج عيار 9 مم بمخزن 17 طلقة ومناولة سريعة.',
      es: 'Pistola táctica compacta de 9 mm con cargador de 17 balas.',
    },
  },
  weapon_combat_knife: {
    name: { ar: 'سكين قتالي', es: 'Cuchillo de Combate' },
    desc: {
      ar: 'نصل قتالي سريع للإقصاءات الصامتة في القتال المتلاحم.',
      es: 'Hoja táctica de alta velocidad para eliminaciones sigilosas de cerca.',
    },
  },
  weapon_baseball_bat: {
    name: { ar: 'مضرب بيسبول', es: 'Bate de Béisbol' },
    desc: {
      ar: 'مضرب خشبي ثقيل بمدى ممتد وضربات رأسية مدمرة.',
      es: 'Bate de fresno pesado con mayor alcance y golpes críticos a la cabeza.',
    },
  },
  weapon_famas: {
    name: { ar: 'FAMAS بندقية', es: 'FAMAS' },
    desc: {
      ar: 'بندقية هجومية سريعة الإطلاق بتصميم Bullpup عيار 5.56 مم للقتال المتقارب.',
      es: 'Rifle de asalto bullpup 5.56 mm de alta cadencia ideal para combates rápidos.',
    },
  },
  weapon_aug: {
    name: { ar: 'AUG بندقية', es: 'AUG' },
    desc: {
      ar: 'بندقية تكتيكية بمنظار مدمج وارتداد عمودي فائق الاستقرار.',
      es: 'Rifle táctico bullpup con mira integrada y retroceso vertical muy estable.',
    },
  },
  weapon_groza: {
    name: { ar: 'Groza بندقية', es: 'Groza' },
    desc: {
      ar: 'بندقية هجومية مدمجة عيار 7.62 مم تجمع بين القوة العالية والسرعة.',
      es: 'Carabina bullpup 7.62 mm que combina gran potencia y velocidad de tiro.',
    },
  },
  weapon_an94: {
    name: { ar: 'AN94 بندقية', es: 'AN94' },
    desc: {
      ar: 'بندقية هجومية حديثة بمخزن مائل ودقة عالية في الرشقات المتتالية.',
      es: 'Rifle de asalto moderno de cargador inclinado con excelente control de ráfaga.',
    },
  },
  weapon_vector: {
    name: { ar: 'Vector رشاش', es: 'Vector' },
    desc: {
      ar: 'رشاش خفيف فائق السرعة 1050 طلقة/دقيقة بآلية امتصاص الارتداد للقتال القريب.',
      es: 'Subfusil ultrarrápido de 1050 RPM con mitigación de retroceso para corta distancia.',
    },
  },
  weapon_p90: {
    name: { ar: 'P90 رشاش', es: 'P90' },
    desc: {
      ar: 'سلاح دفاع شخصي مدمج بمخزن علوي سعة 50 طلقة للاشتباكات الطويلة.',
      es: 'Subfusil compacto con cargador superior de 50 balas para combates prolongados.',
    },
  },
  weapon_thompson: {
    name: { ar: 'Thompson رشاش', es: 'Thompson' },
    desc: {
      ar: 'رشاش كلاسيكي بمخزن أسطواني 42 طلقة وثبات ممتاز في الإطلاق السريع.',
      es: 'Subfusil clásico con tambor de 42 balas .45 ACP y gran disparo desde la cadera.',
    },
  },
  weapon_spas12: {
    name: { ar: 'SPAS12 شوتغن', es: 'SPAS12' },
    desc: {
      ar: 'بندقية رش تكتيكية بـ 8 خراطيش وتجمع شظايا محكم بمدى موثوق.',
      es: 'Escopeta táctica de 8 cartuchos con agrupación cerrada y alcance fiable.',
    },
  },
  weapon_double_barrel: {
    name: { ar: 'شوتغن ثنائي', es: 'Doble Cañón' },
    desc: {
      ar: 'شوتغن كلاسيكي بماسورتين متجاورتين يطلق طلقتين مدمرتين عن قرب.',
      es: 'Escopeta clásica de cañones paralelos capaz de dos disparos devastadores.',
    },
  },
  weapon_m24: {
    name: { ar: 'M24 قناص', es: 'M24' },
    desc: {
      ar: 'بندقية قنص تكتيكية بآلية ترباس وسرعة مقذوف عالية للمسافات البعيدة.',
      es: 'Rifle de francotirador táctico de cerrojo con gran velocidad de salida.',
    },
  },
  weapon_svd: {
    name: { ar: 'SVD قناص', es: 'SVD' },
    desc: {
      ar: 'بندقية قنص نصف أوتوماتيكية تطلق ذخيرة 7.62 مم بسرعة واستقرار.',
      es: 'Rifle de tirador designado semiautomático con cadencia ágil y precisión.',
    },
  },
  weapon_vss: {
    name: { ar: 'VSS قناص كاتم', es: 'VSS' },
    desc: {
      ar: 'بندقية قنص مدمجة بكاتم صوت متكامل لإصابات صامتة بعيدة المدى.',
      es: 'Rifle de tirador con silenciador integrado para bajas sigilosas a distancia.',
    },
  },
  weapon_dragunov: {
    name: { ar: 'دراجونوف قناص', es: 'Dragunov' },
    desc: {
      ar: 'بندقية دراجونوف المحدثة بإصابات نصف أوتوماتيكية قاتلة وبمنظار دقيق.',
      es: 'Dragunov táctico modernizado con letales disparos semiautomáticos de seguimiento.',
    },
  },
  weapon_usp: {
    name: { ar: 'USP مسدس', es: 'USP' },
    desc: {
      ar: 'مسدس تكتيكي عيار .45 باستعادة ارتداد سريعة ودقة تصويب عالية.',
      es: 'Pistola táctica .45 con rápida recuperación del retroceso y puntería nítida.',
    },
  },
  weapon_m1917: {
    name: { ar: 'M1917 مسدس', es: 'M1917' },
    desc: {
      ar: 'مسدس ريفولفر ثقيل بـ 6 طلقات وأسطوانة جانبية وقوة إيقاف عالية.',
      es: 'Revólver pesado de 6 disparos .45 ACP con tambor basculante y gran potencia.',
    },
  },
  weapon_m249: {
    name: { ar: 'M249 رشاش ثقيل', es: 'M249' },
    desc: {
      ar: 'رشاش ثقيل بشريط ذخيرة سعة 100 طلقة لقمع ناري متواصل دون توقف.',
      es: 'Ametralladora ligera de 100 balas alimentada por cinta para fuego de supresión.',
    },
  },
  weapon_m60: {
    name: { ar: 'M60 رشاش ثقيل', es: 'M60' },
    desc: {
      ar: 'رشاش ثقيل عيار 7.62 مم بصندوق ذخيرة 75 طلقة وقوة اختراق عالية.',
      es: 'Ametralladora pesada 7.62 mm con caja de 75 balas y gran poder de penetración.',
    },
  },
  weapon_dp28: {
    name: { ar: 'DP-28 رشاش ثقيل', es: 'DP-28' },
    desc: {
      ar: 'رشاش كلاسيكي بمخزن قرصي علوي 47 طلقة وارتداد ثابت ومستقر.',
      es: 'Icónica ametralladora con cargador de disco superior de 47 balas y retroceso estable.',
    },
  },
  ammo_ar: {
    name: { ar: 'ذخيرة بندقية (30)', es: 'Munición Rifle (30)' },
    desc: {
      ar: '30 طلقة عيار 5.56/7.62 مم لبنادق الهجوم والرشاشات الثقيلة.',
      es: '30 balas de 5.56/7.62 mm para rifles de asalto y ametralladoras ligeras.',
    },
  },
  ammo_smg: {
    name: { ar: 'ذخيرة رشاش (36)', es: 'Munición Subfusil (36)' },
    desc: {
      ar: '36 طلقة عالية السرعة عيار 9 مم للرشاشات الخفيفة.',
      es: '36 balas de alta velocidad 9 mm para subfusiles.',
    },
  },
  ammo_shotgun: {
    name: { ar: 'خرطوش 12G (10)', es: 'Cartuchos 12G (10)' },
    desc: {
      ar: '10 خراطيش ثقيلة لبنادق الرش M1014 وM1887.',
      es: '10 cartuchos pesados de posta para escopetas.',
    },
  },
  ammo_sniper: {
    name: { ar: 'ذخيرة قناص .338 (10)', es: 'Magnum .338 (10)' },
    desc: {
      ar: '10 طلقات خارقة للدروع عيار .338 لبنادق القنص.',
      es: '10 balas perforantes .338 de precisión para francotiradores.',
    },
  },
  ammo_pistol: {
    name: { ar: 'ذخيرة مسدس (24)', es: 'Munición Pistola (24)' },
    desc: {
      ar: '24 طلقة ثقيلة لمسدسات ديزرت إيجل وجلوك.',
      es: '24 balas de arma corta para Desert Eagle y Glock.',
    },
  },
  armor_lv1: {
    name: { ar: 'سترة تكتيكية مستوى 1', es: 'Chaleco Táctico Nv.1' },
    desc: {
      ar: 'سترة باليستية خفيفة (45 درع، تخفيف ضرر 14%).',
      es: 'Chaleco balístico ligero (45 Armadura, 14% mitigación).',
    },
  },
  armor_lv2: {
    name: { ar: 'سترة باليستية مستوى 2', es: 'Chaleco Balístico Nv.2' },
    desc: {
      ar: 'سترة قتالية معززة (80 درع، تخفيف ضرر 24%).',
      es: 'Chaleco de combate reforzado (80 Armadura, 24% mitigación).',
    },
  },
  armor_lv3: {
    name: { ar: 'درع إكسو تيتانيوم مستوى 3', es: 'Armadura Exo Nv.3' },
    desc: {
      ar: 'درع تيتانيوم ثقيل (120 درع، تخفيف ضرر 35%).',
      es: 'Exoarmadura pesada de titanio (120 Armadura, 35% mitigación).',
    },
  },
  helmet_lv1: {
    name: { ar: 'خوذة تكتيكية مستوى 1', es: 'Casco Táctico Nv.1' },
    desc: {
      ar: 'خوذة باليستية خفيفة (45 متانة، تخفيف ضرر 12%).',
      es: 'Casco balístico ligero (45 Durabilidad, 12% mitigación).',
    },
  },
  helmet_lv2: {
    name: { ar: 'خوذة قتالية مستوى 2', es: 'Casco de Combate Nv.2' },
    desc: {
      ar: 'خوذة قتالية معززة (75 متانة، تخفيف ضرر 22%).',
      es: 'Casco de combate reforzado (75 Durabilidad, 22% mitigación).',
    },
  },
  helmet_lv3: {
    name: { ar: 'خوذة تيتان مستوى 3', es: 'Casco Visor Titán Nv.3' },
    desc: {
      ar: 'خوذة تيتانيوم بواقي مدرع (110 متانة، تخفيف ضرر 32%).',
      es: 'Casco blindado con visor de titanio (110 Durabilidad, 32% mitigación).',
    },
  },
  backpack_lv1: {
    name: { ar: 'حقيبة استطلاع مستوى 1', es: 'Mochila Explorador Nv.1' },
    desc: {
      ar: 'حقيبة ميدانية مدمجة تضيف +6 فتحات تخزين.',
      es: 'Mochila compacta de campo que añade +6 espacios.',
    },
  },
  backpack_lv2: {
    name: { ar: 'حقيبة تكتيكية مستوى 2', es: 'Mochila Táctica Nv.2' },
    desc: {
      ar: 'حقيبة قتالية معيارية تضيف +12 فتحة تخزين.',
      es: 'Mochila modular de combate que añade +12 espacios.',
    },
  },
  backpack_lv3: {
    name: { ar: 'حقيبة استكشاف ثقيلة مستوى 3', es: 'Mochila Pesada Nv.3' },
    desc: {
      ar: 'حقيبة إكسو عالية السعة تضيف +18 فتحة تخزين.',
      es: 'Mochila exo de gran capacidad que añade +18 espacios.',
    },
  },
  scope_2x: {
    name: { ar: 'منظار تكتيكي 2x', es: 'Mira Táctica 2x' },
    desc: {
      ar: 'منظار بصري مدمج 2x للرشاشات وبنادق الهجوم.',
      es: 'Mira óptica compacta 2x para subfusiles y rifles de asalto.',
    },
  },
  scope_4x: {
    name: { ar: 'منظار ACOG 4x', es: 'Mira ACOG 4x' },
    desc: {
      ar: 'منظار تكتيكي دقيق 4x للمدى المتوسط والبعيد.',
      es: 'Óptica táctica de precisión 4x para medio y largo alcance.',
    },
  },
  scope_8x: {
    name: { ar: 'منظار قنص 8x', es: 'Mira Francotirador 8x' },
    desc: {
      ar: 'منظار قنص متغير 4x–8x مع شبكة قياس المسافات.',
      es: 'Mira variable 4x–8x con retícula telemétrica mil-dot.',
    },
  },
  shield_cell: {
    name: { ar: 'خلية درع', es: 'Célula de Escudo' },
    desc: {
      ar: 'تستعيد +25 من درع الطاقة بسرعة أثناء القتال.',
      es: 'Restaura +25 de Escudo de energía rápidamente en combate.',
    },
  },
  shield_battery: {
    name: { ar: 'بطارية درع', es: 'Batería de Escudo' },
    desc: {
      ar: 'تستعيد +65 من درع الطاقة لإعادة الاشتباك فوراً.',
      es: 'Restaura +65 de Escudo de energía para volver al combate.',
    },
  },
  med_bandage: {
    name: { ar: 'ضمادة ميدانية', es: 'Vendaje de Campo' },
    desc: {
      ar: 'تستعيد +25 من الصحة بسلاسة أثناء الحركة.',
      es: 'Restaura +25 de Salud limpiamente en movimiento.',
    },
  },
  med_kit: {
    name: { ar: 'حقيبة إسعاف قتالية', es: 'Botiquín de Combate' },
    desc: {
      ar: 'حقيبة علاج متكاملة تستعيد +80 من الصحة.',
      es: 'Equipo médico completo que restaura +80 de Salud.',
    },
  },
  special_adrenaline: {
    name: { ar: 'حقنة أدرينالين', es: 'Jeringa de Adrenalina' },
    desc: {
      ar: 'تستعيد +35 صحة و+35 درع وتمنح +20% سرعة ركض لمدة 8 ثوانٍ.',
      es: 'Restaura +35 Salud y +35 Escudo y otorga +20% velocidad durante 8 s.',
    },
  },
  special_recon_chip: {
    name: { ar: 'رقاقة استطلاع', es: 'Chip de Reconocimiento' },
    desc: {
      ar: 'توسع رادار الأعداء إلى 60م وتسرع التلقيم بنسبة 25% لمدة 12 ثانية.',
      es: 'Amplía el radar enemigo a 60 m y acelera la recarga un 25% por 12 s.',
    },
  },
  utility_repair_kit: {
    name: { ar: 'طقم إصلاح الدرع', es: 'Kit de Reparación' },
    desc: {
      ar: 'يصلح +50 متانة في سترة الدرع المجهزة حالياً.',
      es: 'Repara +50 de durabilidad en tu chaleco equipado.',
    },
  },
  utility_kevlar_plate: {
    name: { ar: 'لوح كيفلار مزدوج', es: 'Parche de Kevlar' },
    desc: {
      ar: 'يستعيد +45 متانة لكل من السترة والخوذة المجهزتين.',
      es: 'Restaura +45 de durabilidad tanto al chaleco como al casco.',
    },
  },
  utility_energy_drink: {
    name: { ar: 'مشروب طاقة تكتيكي', es: 'Bebida Energética' },
    desc: {
      ar: 'يستعيد +15 صحة و+20 درع مع +12% سرعة ركض لمدة 8 ثوانٍ.',
      es: 'Restaura +15 Salud y +20 Escudo con +12% velocidad durante 8 s.',
    },
  },
  utility_ammo_pouch: {
    name: { ar: 'حزمة إمداد تكتيكية', es: 'Paquete de Suministros' },
    desc: {
      ar: 'تمنح فوراً +20 ذخيرة بندقية، +24 رشاش و+6 شوتغن عند الاستخدام.',
      es: 'Otorga al instante +20 Rifle, +24 Subfusil y +6 Escopeta al usar.',
    },
  },
  gloo_wall: {
    name: { ar: 'جدار جلو', es: 'Pared Gloo' },
    desc: {
      ar: 'ينشر حاجزاً جليدياً فورياً يصد الرصاص بمتانة 500 نقطة.',
      es: 'Despliega una barrera de hielo instantánea que bloquea balas (500 PV).',
    },
  },
};

const ABILITY_TRANSLATIONS: Record<string, { name: LangPair; desc: LangPair }> = {
  passive_iron_frame: {
    name: { ar: 'تدريع مقوى', es: 'Blindaje Reforzado' },
    desc: {
      ar: 'يزيد أقصى صحة بمقدار +15 ويقلل الضرر المستلم بنسبة 5%.',
      es: 'Aumenta la salud máxima en +15 y reduce el daño recibido un 5%.',
    },
  },
  passive_lightweight_rig: {
    name: { ar: 'خطوة هوائية', es: 'Zancada Ligera' },
    desc: {
      ar: 'يزيد سرعة الحركة الأساسية بنسبة 8% عبر كافة التضاريس.',
      es: 'Aumenta la velocidad base de movimiento un 8% en todo terreno.',
    },
  },
  passive_shield_breaker: {
    name: { ar: 'مشتت القوس', es: 'Disruptor de Escudos' },
    desc: {
      ar: 'يلحق ضرراً أعلى بنسبة 18% ضد دروع الأعداء.',
      es: 'Inflige un 18% más de daño contra los escudos enemigos.',
    },
  },
  passive_armor_pierce: {
    name: { ar: 'ذخيرة التنغستن', es: 'Balas de Tungsteno' },
    desc: {
      ar: '12% من ضرر الأسلحة يخترق الدروع مباشرة.',
      es: 'El 12% del daño del arma penetra directamente los escudos.',
    },
  },
  passive_sleight_of_hand: {
    name: { ar: 'تلقيم خاطف', es: 'Cargador Rápido' },
    desc: {
      ar: 'يحسّن سرعة إعادة تلقيم الأسلحة بنسبة 20%.',
      es: 'Mejora la velocidad de recarga de armas en un 20%.',
    },
  },
  passive_stabilizer: {
    name: { ar: 'مثبت جيروسكوبي', es: 'Estabilizador Giroscópico' },
    desc: {
      ar: 'يرفع دقة إطلاق النار بنسبة 16% ويقلل الانتشار.',
      es: 'Aumenta la precisión de disparo un 16% y reduce la dispersión.',
    },
  },
  passive_nano_mend: {
    name: { ar: 'ترميم نانوي', es: 'Nanocuración' },
    desc: {
      ar: 'يجدد 2.5 نقطة صحة تلقائياً في الثانية.',
      es: 'Regenera pasivamente 2.5 de salud por segundo.',
    },
  },
  passive_threat_sense: {
    name: { ar: 'حاسة حرارية', es: 'Sensor Térmico' },
    desc: {
      ar: 'يكشف حركة الأعداء القريبين ضمن نطاق 18 متراً.',
      es: 'Detecta movimientos hostiles cercanos en un radio de 18 metros.',
    },
  },
  passive_kinetic_absorb: {
    name: { ar: 'نسيج تفاعلي', es: 'Tejido Reactivo' },
    desc: {
      ar: 'يقلل كافة أضرار القتال المستلمة بنسبة 10%.',
      es: 'Reduce todo el daño de combate recibido en un 10%.',
    },
  },
  passive_frost_trail: {
    name: { ar: 'باعث جليدي', es: 'Emisor Criogénico' },
    desc: {
      ar: 'الأعداء ضمن مسافة 6م يعانون من إبطاء حركة بنسبة 10%.',
      es: 'Los enemigos a menos de 6 m sufren un 10% de ralentización.',
    },
  },
  active_overdrive: {
    name: { ar: 'دفع حركي فائق', es: 'Sobrecarga Cinética' },
    desc: {
      ar: 'يرفع سرعة المشي والركض بنسبة 35% طوال مدة المهارة.',
      es: 'Aumenta la velocidad de movimiento y esprint un 35% mientras dura.',
    },
  },
  active_aegis_dome: {
    name: { ar: 'حاجز إيجيس', es: 'Barrera Aegis' },
    desc: {
      ar: 'يستعيد 35 درعاً فوراً ويمنح تقليل ضرر بنسبة 35%.',
      es: 'Restaura 35 de escudo al instante y otorga 35% de mitigación.',
    },
  },
  active_pulse_scan: {
    name: { ar: 'نبضة سونار نيكسوس', es: 'Pulso Sonar Nexus' },
    desc: {
      ar: 'يكشف الأعداء ضمن 45م ويرفع الدقة بنسبة 25%.',
      es: 'Revela enemigos a 45 m y aumenta la precisión un 25%.',
    },
  },
  active_cryo_nova: {
    name: { ar: 'موجة صقيع صادمة', es: 'Onda Criogénica' },
    desc: {
      ar: 'يبطئ الأعداء ضمن 16م بنسبة 40% ويرفع سرعتك 15%.',
      es: 'Ralentiza un 40% a enemigos en 16 m y aumenta tu velocidad un 15%.',
    },
  },
  active_shield_siphon: {
    name: { ar: 'شحن كهرومغناطيسي', es: 'Sobrecarga EMP' },
    desc: {
      ar: 'يرفع الضرر ضد الدروع 55% مع اختراق درع بنسبة 25%.',
      es: 'Aumenta el daño a escudos un 55% con 25% de penetración.',
    },
  },
  active_med_surge: {
    name: { ar: 'اندفاع حيوي علاجي', es: 'Impulso Bio-Regen' },
    desc: {
      ar: 'يستعيد 20 صحة فوراً ويجدد 10 صحة/ث أثناء التفعيل.',
      es: 'Restaura 20 de salud al instante y regenera 10 PS/s activo.',
    },
  },
  active_gunfighter: {
    name: { ar: 'تركيز القناص', es: 'Enfoque Letal' },
    desc: {
      ar: 'يسرع التلقيم بنسبة 45% ويرفع دقة السلاح بنسبة 35%.',
      es: 'Acelera la recarga un 45% y mejora la precisión un 35%.',
    },
  },
  active_juggernaut: {
    name: { ar: 'درع العملاق', es: 'Coraza Titán' },
    desc: {
      ar: 'يمنح +40 صحة مؤقتة، +25 درع وتقليل ضرر بنسبة 30%.',
      es: 'Otorga +40 salud temporal, +25 escudo y 30% reducción de daño.',
    },
  },
  active_phase_pierce: {
    name: { ar: 'ثاقب الفراغ', es: 'Perforador del Vacío' },
    desc: {
      ar: 'يمنح 45% اختراق دروع مع دفعة سرعة +20%.',
      es: 'Otorga 45% de penetración de escudo y +20% de velocidad.',
    },
  },
  active_fortress_regen: {
    name: { ar: 'مصفوفة الحصن', es: 'Matriz Bastión' },
    desc: {
      ar: 'يجدد 12 درع/ث ويقلل الضرر المستلم بنسبة 25%.',
      es: 'Regenera 12 de escudo/s y reduce el daño recibido un 25%.',
    },
  },
};

const CHARACTER_ROLE_TRANSLATIONS: Record<string, LangPair> = {
  'Assault Leader': { ar: 'قائد الاقتحام', es: 'Líder de Asalto' },
  'Stealth Recon': { ar: 'استطلاع خفي', es: 'Reconocimiento Sigiloso' },
  'Heavy Breacher': { ar: 'مقتحم ثقيل', es: 'Asaltante Pesado' },
  'Arctic Marksman': { ar: 'قناص القطب', es: 'Tirador Ártico' },
  'Orbital Striker': { ar: 'ضارب مداري', es: 'Atacante Orbital' },
  'Combat Medic': { ar: 'مسعف قتالي', es: 'Médico de Combate' },
  'Covert Assassin': { ar: 'قاتل متخفٍ', es: 'Asesina Encubierta' },
  'Desert Ranger': { ar: 'حارس الصحراء', es: 'Exploradora del Desierto' },
  'Tactical Striker': { ar: 'مهاجم تكتيكي', es: 'Atacante Táctico' },
  'Field Operator': { ar: 'مشغل ميداني', es: 'Operador de Campo' },
};

const CORE_CHARACTER_TRANSLATIONS: Record<string, { name: LangPair; desc: LangPair }> = {
  'char-01': {
    name: { ar: 'فانغارد (ماركوس)', es: 'VANGUARD (MARCUS)' },
    desc: {
      ar: 'قائد فرقة مخضرم متخصص في الهجوم الأمامي المتوازن والمناورات السريعة.',
      es: 'Comandante táctico veterano experto en asaltos frontales y maniobras rápidas.',
    },
  },
  'char-02': {
    name: { ar: 'أبيكس (كينجي)', es: 'APEX (KENJI)' },
    desc: {
      ar: 'عميل سري للمسافات القريبة مزود بنظارات باليستية ومستشعرات تهديد.',
      es: 'Operativo encubierto equipado con gafas balísticas y sensores de amenaza.',
    },
  },
  'char-03': {
    name: { ar: 'تايتن (داريوس)', es: 'TITAN (DARIUS)' },
    desc: {
      ar: 'مقتحم مدرع ثقيل يرتدي أكتاف حماية وصفائح سيراميك عالية التحمل.',
      es: 'Asaltante pesado con hombreras blindadas y placas cerámicas reforzadas.',
    },
  },
  'char-04': {
    name: { ar: 'وينتر (لوكاس)', es: 'WINTER (LUKAS)' },
    desc: {
      ar: 'قناص قطبي للمدى البعيد مزود بعدسة تحديد مدى ومعطف للطقس البارد.',
      es: 'Francotirador ártico con monóculo telemétrico y parka de frío extremo.',
    },
  },
  'char-05': {
    name: { ar: 'فالكيري (إيلينا)', es: 'VALKYRIE (ELENA)' },
    desc: {
      ar: 'مختصة هجوم عالية الحركة مصممة للالتفاف السريع وإعادة التلقيم الخاطف.',
      es: 'Especialista de alta movilidad diseñada para flanqueos y recarga rápida.',
    },
  },
  'char-06': {
    name: { ar: 'نوفا (أمارا)', es: 'NOVA (AMARA)' },
    desc: {
      ar: 'مسعفة ميدانية بقناع فرز هولوغرافي وعتاد استشفاء حيوي سريع.',
      es: 'Médica de primera línea con visor holográfico y equipo bio-regenerativo.',
    },
  },
  'char-07': {
    name: { ar: 'سكارليت (لين)', es: 'SCARLET (LIN)' },
    desc: {
      ar: 'متسللة صامتة ترتدي معطفاً تكتيكياً وقناع تنفس نصفي للعمليات السرية.',
      es: 'Infiltradora silenciosa con gabardina táctica y máscara respiratoria.',
    },
  },
  'char-08': {
    name: { ar: 'سييرا (مايا)', es: 'SIERRA (MAYA)' },
    desc: {
      ar: 'كشافة عواصف رملية بنظارات تكتيكية وقدرة تحمل عالية في الصحراء.',
      es: 'Exploradora de tormentas de arena con gafas tácticas y gran resistencia.',
    },
  },
  'char-09': {
    name: { ar: 'سبارك', es: 'SPARK' },
    desc: {
      ar: 'متخصص في حرب القوس الكهربائي لتدمير دروع طاقة الأعداء.',
      es: 'Especialista en guerra eléctrica centrado en destruir escudos enemigos.',
    },
  },
  'char-10': {
    name: { ar: 'بيرسر', es: 'PIERCER' },
    desc: {
      ar: 'مناوش مضاد للدروع يستخدم طلقات اختراق عالية الكثافة.',
      es: 'Hostigador antiaéreo y antiblindaje con munición de alta penetración.',
    },
  },
  'char-11': {
    name: { ar: 'سترايكر-9', es: 'STRIKER-9' },
    desc: {
      ar: 'مقتحم هجومي عن قرب يجمع بين الركض الخاطف والتلقيم السريع.',
      es: 'Atacante agresivo que combina carreras explosivas con recargas rápidas.',
    },
  },
  'char-12': {
    name: { ar: 'أيرونكلاد', es: 'IRONCLAD' },
    desc: {
      ar: 'هيكل حصار مدرع مصمم للصمود وسط نيران عدة فرق.',
      es: 'Armadura de asedio diseñada para resistir fuego cruzado de múltiples escuadrones.',
    },
  },
  'char-13': {
    name: { ar: 'لينكس', es: 'LYNX' },
    desc: {
      ar: 'متتبع رشيق قادر على كشف الكمائن المخفية داخل الأنقاض الحضرية.',
      es: 'Rastreador ágil capaz de detectar emboscadas ocultas en ruinas urbanas.',
    },
  },
  'char-14': {
    name: { ar: 'تيمبست', es: 'TEMPEST' },
    desc: {
      ar: 'مشتت عواصف يدمج نبضات EMP مع التجميد التكتيكي.',
      es: 'Disruptor tormentoso que combina pulsos EMP con ralentización criogénica.',
    },
  },
  'char-15': {
    name: { ar: 'واردن', es: 'WARDEN' },
    desc: {
      ar: 'حامل درع تكتيكي يعطي الأولوية للتجديد الدفاعي تحت الضغط.',
      es: 'Portador de escudo táctico centrado en la regeneración defensiva bajo presión.',
    },
  },
  'char-16': {
    name: { ar: 'ديدشوت', es: 'DEADSHOT' },
    desc: {
      ar: 'قناص بعيد المدى بمناظير محسنة وطلقات خارقة للدروع.',
      es: 'Tirador de precisión de largo alcance con ópticas mejoradas y balas perforantes.',
    },
  },
  'char-17': {
    name: { ar: 'فانغارد-X', es: 'VANGUARD-X' },
    desc: {
      ar: 'جندي صدمة متكيف يجمع بين الدروع المجددة وثبات التصويب.',
      es: 'Soldado de choque adaptable que une armadura regenerativa con puntería estable.',
    },
  },
  'char-18': {
    name: { ar: 'غلاسير', es: 'GLACIER' },
    desc: {
      ar: 'مدافع جليدي ثقيل يعاقب المهاجمين المندفعين.',
      es: 'Defensor criogénico pesado que castiga los ataques agresivos.',
    },
  },
  'char-19': {
    name: { ar: 'نوماد', es: 'NOMAD' },
    desc: {
      ar: 'كشاف مكتفٍ ذاتياً مصمم للبقاء الفردي لفترات طويلة.',
      es: 'Explorador autosuficiente diseñado para la supervivencia prolongada en solitario.',
    },
  },
  'char-20': {
    name: { ar: 'فايبر', es: 'VIPER' },
    desc: {
      ar: 'مناور سريع بطلقات ممزقة للدروع وتلقيم فائق السرعة.',
      es: 'Flanqueador veloz con munición destructoras de escudos y recarga rápida.',
    },
  },
  'char-21': {
    name: { ar: 'إيجيس-7', es: 'AEGIS-7' },
    desc: {
      ar: 'حارس مداري ينشر مصفوفات دروع سريعة عند الاصطدام.',
      es: 'Guardián orbital que despliega matrices de escudo rápidas al impacto.',
    },
  },
  'char-22': {
    name: { ar: 'سكورش', es: 'SCORCH' },
    desc: {
      ar: 'مختص هجوم حراري يكتسح المواقع المحصنة.',
      es: 'Especialista de asalto térmico que supera posiciones fortificadas.',
    },
  },
  'char-23': {
    name: { ar: 'فانتوم', es: 'PHANTOM' },
    desc: {
      ar: 'متسلل فائق السرعة يختفي عبر الأجنحة مع وعي سونار.',
      es: 'Infiltrador veloz que desaparece por los flancos con radar sonar.',
    },
  },
  'char-24': {
    name: { ar: 'تايتن-MK2', es: 'TITAN-MK2' },
    desc: {
      ar: 'الجيل الثاني من هيكل العملاق لمعارك الدوائر الأخيرة.',
      es: 'Chasis coloso de segunda generación para los círculos finales.',
    },
  },
  'char-25': {
    name: { ar: 'فالكون', es: 'FALCON' },
    desc: {
      ar: 'مخضرم استطلاع جوي بثبات سلاح لا مثيل له في المدى المتوسط.',
      es: 'Veterano de reconocimiento aéreo con estabilidad incomparable.',
    },
  },
  'char-26': {
    name: { ar: 'بالس', es: 'PULSE' },
    desc: {
      ar: 'مختص كهرومغناطيسي يحطم التشكيلات ذات الدروع الثقيلة.',
      es: 'Especialista electromagnético que pulveriza equipamiento con escudos.',
    },
  },
  'char-27': {
    name: { ar: 'ريميدي', es: 'REMEDY' },
    desc: {
      ar: 'مسعف قتالي يدعم الهجمات الفردية والفرق بالتجديد السريع.',
      es: 'Médico de combate que sostiene asaltos con regeneración rápida.',
    },
  },
  'char-28': {
    name: { ar: 'زيرو-بوينت', es: 'ZERO-POINT' },
    desc: {
      ar: 'وحدة احتواء دون الصفر تبطئ مناورات الأعداء في الحلقات الضيقة.',
      es: 'Unidad criogénica bajo cero que frena maniobras rivales en cierres.',
    },
  },
  'char-29': {
    name: { ar: 'غنسلينغر', es: 'GUNSLINGER' },
    desc: {
      ar: 'مبارز سريع السحب يجمع بين التلقيم الخاطف والدقة الفتاكة.',
      es: 'Duelista rápido que combina recargas veloces con precisión letal.',
    },
  },
  'char-30': {
    name: { ar: 'ريزور', es: 'RAZOR' },
    desc: {
      ar: 'مخترق عالي السرعة متخصص في تحطيم الدروع المحصنة.',
      es: 'Penetrador de alta velocidad experto en romper armaduras fortificadas.',
    },
  },
  'char-31': {
    name: { ar: 'فالكيري-MK2', es: 'VALKYRIE-MK2' },
    desc: {
      ar: 'قائدة إنزال نخبة تجمع بين التموضع السريع والدرع التفاعلي.',
      es: 'Comandante de élite que une reposicionamiento rápido y blindaje reactivo.',
    },
  },
  'char-32': {
    name: { ar: 'كولوسوس', es: 'COLOSSUS' },
    desc: {
      ar: 'هيكل مدرع ثقيل مصمم للثبات في مناطق نهاية المباراة.',
      es: 'Acorazado pesado construido para dominar las zonas finales.',
    },
  },
  'char-33': {
    name: { ar: 'سبكترال', es: 'SPECTRAL' },
    desc: {
      ar: 'صياد تكتيكي يتعقب الأعداء عبر الدخان والسواتر.',
      es: 'Cazador táctico que rastrea enemigos a través del humo y cobertura.',
    },
  },
  'char-34': {
    name: { ar: 'أوفرلورد', es: 'OVERLORD' },
    desc: {
      ar: 'قائد طاقة ثقيل يجدد صفائح الحاجز في منتصف القتال.',
      es: 'Comandante energético que regenera placas de barrera en combate.',
    },
  },
  'char-35': {
    name: { ar: 'بليزارد', es: 'BLIZZARD' },
    desc: {
      ar: 'طليعة عاصفة ثلجية تشل حركة تناوب فرق الأعداء.',
      es: 'Vanguardia de ventisca que bloquea las rotaciones rivales.',
    },
  },
  'char-36': {
    name: { ar: 'إكليبس', es: 'ECLIPSE' },
    desc: {
      ar: 'قناص ظل ينفذ كمائن نظيفة تخترق الدروع.',
      es: 'Tirador sombrío que ejecuta emboscadas perforantes limpias.',
    },
  },
  'char-37': {
    name: { ar: 'أيون', es: 'ION' },
    desc: {
      ar: 'وحدة مكثف عالية الطاقة تذيب الدروع الدفاعية للخصوم.',
      es: 'Unidad condensadora de alto voltaje que funde escudos enemigos.',
    },
  },
  'char-38': {
    name: { ar: 'فينيكس', es: 'PHOENIX' },
    desc: {
      ar: 'ناجٍ مرن ينهض من أعنف الاشتباكات عبر التجديد النانوي.',
      es: 'Superviviente tenaz que resurge de tiroteos intensos con nanocuración.',
    },
  },
  'char-39': {
    name: { ar: 'كاليبر', es: 'CALIBRE' },
    desc: {
      ar: 'نابغة مقذوفات يتفوق في دقة الإطلاق السريع المستمر.',
      es: 'Prodigio balístico sobresaliente en precisión de fuego rápido sostenido.',
    },
  },
  'char-40': {
    name: { ar: 'سنتينل-Z', es: 'SENTINEL-Z' },
    desc: {
      ar: 'حامي خط أمامي صلب يشع نبضات حواجز دفاعية.',
      es: 'Protector frontal endurecido que irradia pulsos de barrera defensiva.',
    },
  },
  'char-41': {
    name: { ar: 'هايبيريون', es: 'HYPERION' },
    desc: {
      ar: 'مقاتل تجريبي بنواة حركية لإيقاع لا يرحم في النهاية.',
      es: 'As de núcleo cinético experimental para un ritmo implacable.',
    },
  },
  'char-42': {
    name: { ar: 'نيميسيس', es: 'NEMESIS' },
    desc: {
      ar: 'صياد دروع من النخبة مصمم لتمزيق الناجين المحصنين.',
      es: 'Cazador de blindajes diseñado para destrozar supervivientes fortificados.',
    },
  },
  'char-43': {
    name: { ar: 'كرونو-9', es: 'CHRONO-9' },
    desc: {
      ar: 'مختص جليدي حركي يتحكم في وتيرة الاشتباكات القريبة.',
      es: 'Especialista criocinético que controla el ritmo del combate cercano.',
    },
  },
  'char-44': {
    name: { ar: 'أطلس', es: 'ATLAS' },
    desc: {
      ar: 'عملاق مداري ضخم يحمل بنية دروع معززة.',
      es: 'Titán orbital colosal con arquitectura de escudo reforzada.',
    },
  },
  'char-45': {
    name: { ar: 'أوراكل', es: 'ORACLE' },
    desc: {
      ar: 'وحدة استطلاع شاملة تقفل على الأهداف عبر المحيط بالكامل.',
      es: 'Unidad de reconocimiento omnisciente que fija objetivos en el perímetro.',
    },
  },
  'char-46': {
    name: { ar: 'سولاريس', es: 'SOLARIS' },
    desc: {
      ar: 'حصن بنواة شمسية يجدد طاقة الدرع بسرعة مذهلة.',
      es: 'Bastión de núcleo solar que regenera energía de escudo a gran velocidad.',
    },
  },
  'char-47': {
    name: { ar: 'فورتيكس', es: 'VORTEX' },
    desc: {
      ar: 'مبارز عالي الدقة يهيمن على اشتباكات منتصف الدائرة.',
      es: 'Duelista de alta precisión que domina los tiroteos de media distancia.',
    },
  },
  'char-48': {
    name: { ar: 'أوبسيديان', es: 'OBSIDIAN' },
    desc: {
      ar: 'منفذ شبح تجريبي يجمع بين نبضات EMP ونسج تخفيف الضرر.',
      es: 'Ejecutor sigiloso prototipo que combina pulsos EMP y tejido reactivo.',
    },
  },
  'char-49': {
    name: { ar: 'سيراف', es: 'SERAPH' },
    desc: {
      ar: 'مقاتل ذروة بالتجديد الحيوي مصمم للبقاء في الحلقة الأخيرة.',
      es: 'Combatiente ápice biorregenerativo diseñado para el anillo final.',
    },
  },
  'char-50': {
    name: { ar: 'نيكسوس برايم', es: 'NEXUS PRIME' },
    desc: {
      ar: 'الناجي المداري الأسمى — قمة اختبارات قتال نيكسوس.',
      es: 'El superviviente orbital definitivo: la cima de las pruebas Nexus.',
    },
  },
};

const CUSTOMIZATION_TRANSLATIONS: Record<
  keyof R6Customization,
  Record<string, { title: LangPair; desc: LangPair }>
> = {
  skinId: {
    operator_natural: {
      title: { ar: 'بشرة كلاسيكية طبيعية', es: 'Durazno Clásico' },
      desc: {
        ar: 'يضبط لون البشرة والتظليل السطحي لشخصية R6 ثلاثية الأبعاد.',
        es: 'Ajusta el tono de piel y sombreado de tu personaje R6 3D.',
      },
    },
    fair_sunlit: {
      title: { ar: 'بشرة فاتحة مشرقة', es: 'Tez Clara Soleada' },
      desc: {
        ar: 'بشرة فاتحة دافئة بتفاصيل تظليل طبيعية لشخصية R6.',
        es: 'Tez clara cálida con sombreado natural.',
      },
    },
    warm_bronze: {
      title: { ar: 'برونزي دافئ', es: 'Bronce Cálido' },
      desc: {
        ar: 'بشرة برونزية دافئة متناسقة مع الملابس العصرية.',
        es: 'Tez bronce cálida adaptada a cualquier estilo urbano.',
      },
    },
    deep_umber: {
      title: { ar: 'أسمر داكن', es: 'Ébano Profundo' },
      desc: {
        ar: 'بشرة داكنة عميقة بتباين عالٍ وتظليل متقن.',
        es: 'Tez oscura profunda con sombreado de alto contraste.',
      },
    },
    nordic_pale: {
      title: { ar: 'أبيض بارد', es: 'Marfil Frío' },
      desc: {
        ar: 'بشرة فاتحة باردة مثالية لإطلالات الشتاء والعمليات.',
        es: 'Tez clara fría ideal para atuendos alpinos.',
      },
    },
    olive_tan: {
      title: { ar: 'زيتوني برونزي', es: 'Oliva Bronceado' },
      desc: {
        ar: 'بشرة زيتونية متوسطة بنظرة عصرية متوازنة.',
        es: 'Tez oliva bronceada con acabado moderno.',
      },
    },
  },
  eyesId: {
    classic_r6: {
      title: { ar: 'عيون R6 الكلاسيكية', es: 'Ojos R6 Clásicos' },
      desc: { ar: 'عيون روبلوكس R6 كلاسيكية نظيفة وبراقة.', es: 'Ojos ovalados R6 clásicos con brillo limpio.' },
    },
    determined: {
      title: { ar: 'نظرة حازمة', es: 'Mirada Decidida' },
      desc: { ar: 'عيون تكتيكية حازمة مع حواجب مرسومة.', es: 'Ojos decididos con cejas marcadas.' },
    },
    anime_bright: {
      title: { ar: 'بريق مشرق', es: 'Brillo Vivo' },
      desc: { ar: 'عيون عصرية لامعة بتفاصيل قزحية واضحة.', es: 'Ojos expresivos luminosos con reflejo.' },
    },
    wink: {
      title: { ar: 'غمزة مرحة', es: 'Guiño Juguetón' },
      desc: { ar: 'غمزة خفيفة وعصرية لشخصيتك.', es: 'Guiño simpático y expresivo.' },
    },
    chill_cool: {
      title: { ar: 'نظرة هادئة', es: 'Mirada Relajada' },
      desc: { ar: 'تعبير هادئ بنصف جفن وأسلوب عصري.', es: 'Expresión relajada y segura.' },
    },
    cyber_glow: {
      title: { ar: 'عيون سايبر مضيئة', es: 'Óptica Cyber Neón' },
      desc: { ar: 'عيون سيبرانية مضيئة متوهجة.', es: 'Óptica cibernética con brillo neón.' },
    },
  },
  mouthId: {
    classic_smile: {
      title: { ar: 'ابتسامة كلاسيكية', es: 'Sonrisa Clásica' },
      desc: { ar: 'ابتسامة R6 بسيطة وودودة.', es: 'Sonrisa R6 clásica y amigable.' },
    },
    confident_grin: {
      title: { ar: 'ابتسامة واثقة', es: 'Sonrisa Confiada' },
      desc: { ar: 'ابتسامة عريضة مفعمة بالثقة.', es: 'Sonrisa amplia llena de confianza.' },
    },
    smirk: {
      title: { ar: 'ابتسامة جانبية', es: 'Media Sonrisa' },
      desc: { ar: 'ابتسامة جانبية جريئة وعصرية.', es: 'Sonrisa ladeada con estilo urbano.' },
    },
    serious: {
      title: { ar: 'تركيز تكتيكي', es: 'Enfoque Táctico' },
      desc: { ar: 'تعبير فم جاد ومستعد للقتال.', es: 'Expresión seria enfocada al combate.' },
    },
    happy_open: {
      title: { ar: 'بهجة كبيرة', es: 'Alegría Abierta' },
      desc: { ar: 'ضحكة مفتوحة ومليئة بالحيوية.', es: 'Risa abierta llena de energía.' },
    },
    neutral: {
      title: { ar: 'تعبير هادئ', es: 'Calma Neutral' },
      desc: { ar: 'تعبير محايد وهادئ.', es: 'Expresión serena y neutral.' },
    },
  },
  faceMarkId: {},
  hairStyleId: {
    swept_undercut: {
      title: { ar: 'شعر مائل عصري', es: 'Corte Ladeado' },
      desc: { ar: 'تسريحة شعر عصرية مائلة ثلاثية الأبعاد.', es: 'Peinado moderno ladeado 3D.' },
    },
    fluffy_messy: {
      title: { ar: 'شعر كثيف فوضوي', es: 'Texturizado Despeinado' },
      desc: { ar: 'خصلات كثيفة ومرتفعة بأسلوب الشارع الحديث.', es: 'Volumen urbano texturizado 3D.' },
    },
    spiky_crest: {
      title: { ar: 'أشواك علوية', es: 'Cresta en Puntas' },
      desc: { ar: 'تسريحة جريئة بخصلات شائكة.', es: 'Peinado en puntas con actitud.' },
    },
    buzz_fade: {
      title: { ar: 'تدرج قصير نظيف', es: 'Degradado Corto' },
      desc: { ar: 'قصة قصيرة متدرجة ومرتبة.', es: 'Corte limpio y moderno.' },
    },
    curtains_part: {
      title: { ar: 'فرق وسطي', es: 'Raya al Medio' },
      desc: { ar: 'خصلات متوسطة منقسمة على الجانبين.', es: 'Flequillo partido al medio.' },
    },
    high_ponytail: {
      title: { ar: 'ذيل حصان مرتفع', es: 'Coleta Alta' },
      desc: { ar: 'ذيل حصان مشدود ثلاثي الأبعاد.', es: 'Coleta alta deportiva 3D.' },
    },
    asym_bob: {
      title: { ar: 'قصة بوب أنيقة', es: 'Bob Estilizado' },
      desc: { ar: 'تسريحة بوب ملساء ومتوازنة.', es: 'Corte bob elegante y moderno.' },
    },
    wavy_shoulder: {
      title: { ar: 'متموج متوسط', es: 'Ondulado Capas' },
      desc: { ar: 'شعر متموج طويل بطبقات ثلاثية الأبعاد.', es: 'Melena ondulada por capas 3D.' },
    },
    bald: {
      title: { ar: 'حلاقة كاملة', es: 'Cabeza Rapada' },
      desc: { ar: 'مظهر نظيف بدون شعر.', es: 'Estilo limpio sin cabello.' },
    },
  },
  hairColorId: {
    espresso: {
      title: { ar: 'بني إسبريسو', es: 'Espresso Oscuro' },
      desc: { ar: 'لون شعر بني داكن طبيعي.', es: 'Tono castaño oscuro natural.' },
    },
    jet_black: {
      title: { ar: 'أسود فاحم', es: 'Negro Azabache' },
      desc: { ar: 'شعر أسود حالك بلمسة عصرية.', es: 'Negro intenso con reflejos grafito.' },
    },
    auburn: {
      title: { ar: 'كستنائي دافئ', es: 'Castaño Cobrizo' },
      desc: { ar: 'درجة كستنائية دافئة وغنية.', es: 'Tono castaño cálido cobrizo.' },
    },
    blonde: {
      title: { ar: 'أشقر ذهبي', es: 'Rubio Dorado' },
      desc: { ar: 'أشقر ذهبي مشرق بتفاصيل متناسقة.', es: 'Rubio dorado luminoso.' },
    },
    crimson: {
      title: { ar: 'صبغة قرمزية', es: 'Tinte Carmesí' },
      desc: { ar: 'لون أحمر قرمزي جريء.', es: 'Tinte carmesí llamativo.' },
    },
    silver_ash: {
      title: { ar: 'فضي رمادي', es: 'Ceniza Plateada' },
      desc: { ar: 'درجة فضية رمادية أنيقة.', es: 'Gris plateado moderno.' },
    },
    cobalt_blue: {
      title: { ar: 'أزرق كوبالت', es: 'Azul Cobalto' },
      desc: { ar: 'أزرق نابض بالحياة بأسلوب الشارع.', es: 'Azul eléctrico urbano.' },
    },
    violet_mist: {
      title: { ar: 'بنفسجي ضبابي', es: 'Violeta Neón' },
      desc: { ar: 'لون بنفسجي عصري لامع.', es: 'Tono violeta moderno.' },
    },
  },
  topId: {
    hoodie_urban: {
      title: { ar: 'هودي الشارع العصري', es: 'Sudadera Urbana' },
      desc: {
        ar: 'هودي R6 واسع بقبعة خلفية ثلاثية الأبعاد وجيب أمامي وأربطة برتقالية.',
        es: 'Sudadera R6 holgada con capucha 3D, bolsillo frontal y cordones.',
      },
    },
    hoodie_cyan: {
      title: { ar: 'هودي سايبر سماوي', es: 'Sudadera Tech Cian' },
      desc: {
        ar: 'هودي أزرق تقني حديث بتفاصيل متوهجة.',
        es: 'Sudadera urbana azul eléctrico con acabados modernos.',
      },
    },
    bomber_jacket: {
      title: { ar: 'جاكيت بومبر زيتوني', es: 'Chaqueta Bomber' },
      desc: {
        ar: 'جاكيت طيران زيتوني مع قميص داخلي أبيض عصري.',
        es: 'Chaqueta bomber oliva sobre camiseta blanca limpia.',
      },
    },
    denim_jacket: {
      title: { ar: 'جاكيت جينز نيلي', es: 'Chaqueta Vaquera' },
      desc: {
        ar: 'جاكيت دينيم أنيق بياقة وأزرار معدنية.',
        es: 'Chaqueta vaquera con solapas y botones metálicos.',
      },
    },
    puffer_vest: {
      title: { ar: 'سترة بافر قرمزية', es: 'Chaleco Acolchado' },
      desc: {
        ar: 'سترة منفوخة مبطنة فوق قميص بأكمام طويلة.',
        es: 'Chaleco acolchado urbano sobre manga larga.',
      },
    },
    tshirt_graphic: {
      title: { ar: 'تيشيرت جرافيك عصري', es: 'Camiseta Gráfica' },
      desc: {
        ar: 'تيشيرت بأكمام قصيرة ورسومات صدر أنيقة.',
        es: 'Camiseta urbana de manga corta con gráfico frontal.',
      },
    },
    shirt_varsity: {
      title: { ar: 'جاكيت فارسيتي جامعي', es: 'Chaqueta Varsity' },
      desc: {
        ar: 'جاكيت رياضي بلونين مع أكمام متباينة.',
        es: 'Chaqueta universitaria bicolor con mangas en contraste.',
      },
    },
    tactical_parka: {
      title: { ar: 'معطف واقٍ من الرياح', es: 'Cortavientos Alpino' },
      desc: {
        ar: 'جاكيت شتوي مقاوم للرياح بألوان متداخلة.',
        es: 'Cortavientos bicolor con cuello alto moderno.',
      },
    },
    operator_sync: {
      title: { ar: 'السترة المتزامنة', es: 'Chaqueta Insignia' },
      desc: {
        ar: 'جاكيت حديث يتزامن لونه مع لوحة المقاتل المجهز.',
        es: 'Chaqueta moderna sincronizada con el color de tu operador.',
      },
    },
  },
  pantsId: {
    cargo_charcoal: {
      title: { ar: 'بنطال كارجو فحمي', es: 'Pantalón Cargo Carbón' },
      desc: { ar: 'بنطال كارجو بجيوب جانبية ثلاثية الأبعاد وحزام.', es: 'Cargo R6 con bolsillos laterales 3D.' },
    },
    cargo_olive: {
      title: { ar: 'بنطال كارجو زيتوني', es: 'Cargo Verde Oliva' },
      desc: { ar: 'بنطال كارجو عسكري بجيوب فخذ بارزة.', es: 'Pantalón cargo oliva con bolsillos tácticos.' },
    },
    jeans_indigo: {
      title: { ar: 'جينز أزرق كلاسيكي', es: 'Vaqueros Índigo' },
      desc: { ar: 'بنطال جينز نيلي بخياطة ذهبية بارزة.', es: 'Jeans azul clásico con costuras doradas.' },
    },
    jeans_black: {
      title: { ar: 'جينز أسود باهت', es: 'Vaqueros Negros' },
      desc: { ar: 'جينز أسود عصري بمقاس R6 متقن.', es: 'Jeans negro limpio de corte R6.' },
    },
    joggers_slate: {
      title: { ar: 'بنطال رياضي جوجر', es: 'Joggers Deportivos' },
      desc: { ar: 'بنطال رياضي مريح بخط جانبي عصري.', es: 'Joggers deportivos con banda lateral.' },
    },
    khaki_chinos: {
      title: { ar: 'بنطال تشينو رملي', es: 'Chinos Arena' },
      desc: { ar: 'بنطال تشينو كاكي أنيق وعصري.', es: 'Pantalón chino moderno color arena.' },
    },
    tactical_camo: {
      title: { ar: 'بنطال مموه للغابات', es: 'Cargo Camuflaje' },
      desc: { ar: 'بنطال كارجو بنقشة تمويه وركب معززة.', es: 'Pantalón cargo camuflado con rodilleras.' },
    },
  },
  shoesId: {
    sneakers_white: {
      title: { ar: 'حذاء رياضي أبيض', es: 'Zapatillas Blancas' },
      desc: { ar: 'حذاء سنيكرز أبيض عصري بنعل سميك ولمسة زرقاء.', es: 'Zapatillas urbanas blancas limpias.' },
    },
    sneakers_crimson: {
      title: { ar: 'سنيكرز أسود وأحمر', es: 'Deportivas Carmesí' },
      desc: { ar: 'حذاء رياضي أسود وقرمزي بنعل أبيض.', es: 'Zapatillas negro y rojo con suela blanca.' },
    },
    hightops_cyan: {
      title: { ar: 'حذاء هاي توب أزرق', es: 'Botines Altos Cian' },
      desc: { ar: 'سنيكرز برقبة عالية ولمسات سماوية.', es: 'Zapatillas high-top con collar acolchado.' },
    },
    trainers_volt: {
      title: { ar: 'حذاء رياضي نيون', es: 'Tenis Neón Volt' },
      desc: { ar: 'حذاء جري خفيف بلمسات ليمونية نيون.', es: 'Tenis ligeros con detalles neón.' },
    },
    boots_combat: {
      title: { ar: 'حذاء قتالي أسود', es: 'Botas Tácticas' },
      desc: { ar: 'أحذية قتالية سوداء متينة بنعل مضلع.', es: 'Botas tácticas negras con suela robusta.' },
    },
    boots_tan: {
      title: { ar: 'أحذية ميدانية جملي', es: 'Botas Timber Arena' },
      desc: { ar: 'أحذية نوبوك بلون القمح الكلاسيكي.', es: 'Botas clásicas color trigo con cuello oscuro.' },
    },
  },
  hatId: {
    none: {
      title: { ar: 'بدون قبعة', es: 'Sin Sombrero' },
      desc: { ar: 'إظهار تسريحة الشعر ثلاثية الأبعاد كاملة.', es: 'Muestra tu peinado 3D sin cubrir.' },
    },
    baseball_cap: {
      title: { ar: 'كاب الشارع', es: 'Gorra Urbana' },
      desc: { ar: 'كاب بيسبول أمامي بشعار مطرز.', es: 'Gorra curva clásica con parche frontal.' },
    },
    backwards_cap: {
      title: { ar: 'كاب مقلوب', es: 'Gorra Hacia Atrás' },
      desc: { ar: 'كاب مسطح مقلوب بأسلوب الشارع.', es: 'Gorra snapback colocada hacia atrás.' },
    },
    beanie: {
      title: { ar: 'قبعة شتوية محبوكة', es: 'Gorro de Punto' },
      desc: { ar: 'قبعة شتوية دافئة فوق الشعر.', es: 'Gorro beanie moderno de punto.' },
    },
    bucket_hat: {
      title: { ar: 'قبعة باكت', es: 'Gorro Pescador' },
      desc: { ar: 'قبعة دلو عصرية بحافة مائلة.', es: 'Sombrero bucket urbano.' },
    },
    tactical_cap: {
      title: { ar: 'كاب المهام التكتيكي', es: 'Gorra Táctica' },
      desc: { ar: 'كاب تكتيكي داكن برقعة أمامية.', es: 'Gorra táctica mate con parche.' },
    },
  },
  glassesId: {
    none: {
      title: { ar: 'بدون نظارات', es: 'Sin Gafas' },
      desc: { ar: 'رؤية واضحة للوجه وتعبير العينين.', es: 'Muestra tus ojos sin filtros.' },
    },
    wayfarers: {
      title: { ar: 'نظارات شمسية عصرية', es: 'Gafas Wayfarer' },
      desc: { ar: 'نظارات شمسية مربعة داكنة.', es: 'Gafas de sol cuadradas oscuras.' },
    },
    aviators: {
      title: { ar: 'نظارات أفييتور ذهبية', es: 'Aviador Doradas' },
      desc: { ar: 'نظارات طيارين بإطار معدني ذهبي.', es: 'Gafas aviador metálicas doradas.' },
    },
    cyber_visor: {
      title: { ar: 'قناع سايبر مضيء', es: 'Visor Cyber Neón' },
      desc: { ar: 'نظارة واقع افتراضي سماوية متوهجة.', es: 'Visor HUD translúcido brillante.' },
    },
    round_frames: {
      title: { ar: 'نظارات دائرية كلاسيكية', es: 'Gafas Redondas' },
      desc: { ar: 'إطار دائري رفيع بعدسات شفافة.', es: 'Montura redonda retro transparente.' },
    },
  },
  maskId: {
    none: {
      title: { ar: 'بدون قناع', es: 'Sin Máscara' },
      desc: { ar: 'إظهار الفم وتعبير الوجه كاملاً.', es: 'Muestra la boca y expresión completas.' },
    },
    cloth_mask: {
      title: { ar: 'كمامة قماشية عصرية', es: 'Mascarilla Urbana' },
      desc: { ar: 'قناع وجه أسود بخط برتقالي.', es: 'Mascarilla negra urbana con detalle naranja.' },
    },
    respirator: {
      title: { ar: 'قناع تنفس تكتيكي', es: 'Respirador Táctico' },
      desc: { ar: 'قناع بمرشحين مزدوجين للقتال.', es: 'Semimáscara con doble filtro.' },
    },
    gaiter_scarf: {
      title: { ar: 'وشاح رقبة قرمزي', es: 'Braga Cuello Roja' },
      desc: { ar: 'غطاء عنق وفم قرمزي.', es: 'Braga táctica carmesí.' },
    },
  },
  armorId: {
    none: {
      title: { ar: 'بدون درع خارجي', es: 'Sin Chaleco' },
      desc: {
        ar: 'مظهر ملابس الشارع النقي بدون صفائح درع.',
        es: 'Silueta urbana limpia sin placas externas.',
      },
    },
    iron_lv1: {
      title: { ar: 'سترة كيفلار مستوى 1', es: 'Chaleco Kevlar Nv.1' },
      desc: {
        ar: 'حامل صفائح كيفلار مستوى 1 أمامي وخلفي للحماية الخفيفة.',
        es: 'Portaplacas Kevlar Nivel 1 con insertos frontales y traseros.',
      },
    },
    diamond_lv2: {
      title: { ar: 'صفيحة باليستية مستوى 2', es: 'Placa Balística Nv.2' },
      desc: {
        ar: 'درع مركب مستوى 2 مع أكتاف تكتيكية وشعار سماوي.',
        es: 'Placa compuesta Nivel 2 con hombreras tácticas y emblema celeste.',
      },
    },
    nether_gold_lv3: {
      title: { ar: 'درع إكسو ثقيل مستوى 3', es: 'Exo Blindaje Nv.3' },
      desc: {
        ar: 'هيكل مدرع ثقيل مستوى 3 مع أكتاف معززة وتدريع ذهبي.',
        es: 'Chasis pesado Nivel 3 con hombreras reforzadas y núcleo ámbar.',
      },
    },
  },
  accessoryId: {
    none: {
      title: { ar: 'بدون إضافات', es: 'Sin Accesorios' },
      desc: {
        ar: 'إعداد قياسي بدون حقيبة ظهر أو سماعات.',
        es: 'Configuración base sin mochila ni auriculares.',
      },
    },
    shades: {
      title: { ar: 'نظارات إضافية', es: 'Gafas Tácticas' },
      desc: {
        ar: 'نظارات تكتيكية مستقطبة إضافية.',
        es: 'Gafas balísticas polarizadas adicionales.',
      },
    },
    headphones: {
      title: { ar: 'سماعات استوديو لاسلكية', es: 'Auriculares Estudio' },
      desc: {
        ar: 'سماعات رأس لاسلكية فوق الأذن.',
        es: 'Auriculares inalámbricos modernos sobre las orejas.',
      },
    },
    backpack: {
      title: { ar: 'حقيبة ظهر عصرية', es: 'Mochila Urbana' },
      desc: {
        ar: 'حقيبة ظهر بحزامين مثبتة بإحكام.',
        es: 'Mochila urbana de dos correas en la espalda.',
      },
    },
    crown: {
      title: { ar: 'منظار هولوغرافي', es: 'Visor Holográfico' },
      desc: {
        ar: 'واقي تهديف هولوغرافي فوق الحاجب.',
        es: 'Visor holográfico avanzado sobre la frente.',
      },
    },
    cape: {
      title: { ar: 'عباءة تخفٍ قرمزية', es: 'Capa Sigilo' },
      desc: {
        ar: 'عباءة كتف قرمزية متدلية خلف الظهر.',
        es: 'Capa carmesí sobre los hombros.',
      },
    },
  },
  petId: {
    wolf: {
      title: { ar: 'الراعي K9', es: 'Pastor K9' },
      desc: {
        ar: 'كلب هجوم تكتيكي مخلص ينتشر معك في الردهة والقتال.',
        es: 'Perro táctico leal que se despliega contigo en sala y combate.',
      },
    },
    fox: {
      title: { ar: 'وحدة K9 القطبية', es: 'Unidad K9 Ártica' },
      desc: {
        ar: 'متتبع جليدي رشيق بطوق قياس أزرق متألق.',
        es: 'Rastreador ártico ágil con collar de telemetría azul.',
      },
    },
    parrot: {
      title: { ar: 'طائرة استطلاع UAV', es: 'Dron de Reconocimiento' },
      desc: {
        ar: 'درون رباعي المراوح يحوم بمحاذاة كتفك بدقة عالية.',
        es: 'Cuadricóptero autónomo que vuela junto a tu hombro.',
      },
    },
    creeper_bot: {
      title: { ar: 'مركبة حراسة UGV', es: 'UGV Táctico' },
      desc: {
        ar: 'روبوت حراسة مجنزر يتنقل بثبات عبر التضاريس الوعرة.',
        es: 'Vehículo terrestre blindado con orugas y torre estabilizada.',
      },
    },
    none: {
      title: { ar: 'بدون مرافق', es: 'Sin Compañero' },
      desc: {
        ar: 'الانتشار بمفردك لمظهر مقاتل كلاسيكي نقي.',
        es: 'Despliégate en solitario con una silueta clásica.',
      },
    },
  },
  petEnabled: {
    true: {
      title: { ar: 'المرافقة في المباريات: تشغيل', es: 'Seguir en Partidas: SÍ' },
      desc: {
        ar: 'يتحكم في ظهور المرافق المجهز بجانبك أثناء المباريات الحية.',
        es: 'Controla si tu compañero equipado te acompaña en combate.',
      },
    },
    false: {
      title: { ar: 'المرافقة في المباريات: إيقاف', es: 'Seguir en Partidas: NO' },
      desc: {
        ar: 'يتحكم في ظهور المرافق المجهز بجانبك أثناء المباريات الحية.',
        es: 'Controla si tu compañero equipado te acompaña en combate.',
      },
    },
  },
};

const PET_DETAIL_TRANSLATIONS: Record<
  R6PetId,
  {
    name: LangPair;
    role: LangPair;
    traitBadge: LangPair;
    personality: LangPair;
    behavior: LangPair;
  }
> = {
  wolf: {
    name: { ar: 'الراعي K9', es: 'Pastor K9' },
    role: { ar: 'كلب هجوم تكتيكي', es: 'Sabueso Táctico de Asalto' },
    traitBadge: { ar: 'كشاف مخلص', es: 'EXPLORADOR LEAL' },
    personality: {
      ar: 'يقظ، منضبط ومخلص للغاية — يرفع أذنيه عند الهبوط ويحتفل بالإقصاءات.',
      es: 'Alerta, disciplinado y leal: yergue las orejas al aterrizar y celebra bajas.',
    },
    behavior: {
      ar: 'يهرول بسلاسة بجانب جانبك الأيسر عبر التضاريس ويبتعد تماماً عن خط إطلاق النار.',
      es: 'Trota junto a tu flanco izquierdo, salta al esprintar y evita la línea de tiro.',
    },
  },
  fox: {
    name: { ar: 'وحدة K9 القطبية', es: 'Unidad K9 Ártica' },
    role: { ar: 'متتبع الصقيع الجبلي', es: 'Rastreador Alpino' },
    traitBadge: { ar: 'متتبع رشيق', es: 'RASTREADOR ÁGIL' },
    personality: {
      ar: 'سريع وفضولي مع طوق قياس أزرق جليدي وحركة ذيل مليئة بالحيوية.',
      es: 'Veloz y curioso, con collar telemétrico azul hielo y gran energía.',
    },
    behavior: {
      ar: 'ينساب برشاقة فوق المنحدرات والتلال مع بقاء حجمه مدمجاً داخل السواتر الضيقة.',
      es: 'Se desliza por laderas junto a ti manteniendo perfil bajo en coberturas.',
    },
  },
  parrot: {
    name: { ar: 'درون استطلاع', es: 'Dron de Reconocimiento' },
    role: { ar: 'رباعي مراوح مستقل', es: 'Cuadricóptero Autónomo' },
    traitBadge: { ar: 'استطلاع جوي', es: 'RECON AÉREO' },
    personality: {
      ar: 'طائرة دقيقة بمحور بصري مستقر تقوم بحركات دوران بهلوانية مرحة في الهواء.',
      es: 'Micro-UAV preciso con estabilizador óptico y giros acrobáticos.',
    },
    behavior: {
      ar: 'يحوم بارتفاع الكتف ويميل بسلاسة مع المنعطفات والركض السريع.',
      es: 'Planea a altura del hombro y se inclina al girar o esprintar.',
    },
  },
  creeper_bot: {
    name: { ar: 'مركبة UGV تكتيكية', es: 'UGV Táctico' },
    role: { ar: 'مركبة حراسة مجنزرة', es: 'Rover Centinela con Orugas' },
    traitBadge: { ar: 'مدرعة استطلاع', es: 'ROVER BLINDADO' },
    personality: {
      ar: 'درون أرضي صلب بمجسات زمردية وبصريات مسح واستقرار جيروسكوبي.',
      es: 'Dron terrestre robusto con ópticas esmeralda y torreta giroscópica.',
    },
    behavior: {
      ar: 'يتدحرج فوق التضاريس الوعرة بنظام تعليق مرن ويراقب خطوط الرؤية القريبة.',
      es: 'Rueda sobre terreno irregular con suspensión articulada y vigila el perímetro.',
    },
  },
  none: {
    name: { ar: 'بدون مرافق', es: 'Sin Compañero' },
    role: { ar: 'انتشار فردي', es: 'Despliegue en Solitario' },
    traitBadge: { ar: 'عمل فردي', es: 'OP. SOLITARIO' },
    personality: {
      ar: 'انطلق بمفردك تماماً لمظهر مقاتل بسيط في الردهة والمباريات.',
      es: 'Despliégate completamente solo para un perfil minimalista clásico.',
    },
    behavior: {
      ar: 'يلغي نشر المرافق في كل من مهبط الردهة وساحات القتال الحية.',
      es: 'Desactiva el acompañamiento en el helipuerto y en partidas en vivo.',
    },
  },
};

const SHOP_TRANSLATIONS: Record<string, { name: LangPair; desc: LangPair }> = {
  'offer-apex-drop': {
    name: { ar: 'هيكل أبيكس المداري', es: 'CHASIS ORBITAL APEX' },
    desc: {
      ar: 'تجهيز قتالي إكسو مستوى 3 للارتفاعات العالية مع درع صحراوي ومنظار هولوغرافي.',
      es: 'Armadura de combate Exo-Nv.3 de gran altitud con uniforme solar y visor.',
    },
  },
  'offer-shadow-vanguard': {
    name: { ar: 'طقم فانغارد القرمزي', es: 'KIT VANGUARD CARMESÍ' },
    desc: {
      ar: 'طقم درع قرمزي للغارات الليلية مع سماعة اتصالات وقناع تكتيكي.',
      es: 'Conjunto carmesí de incursión nocturna con auriculares balísticos y máscara.',
    },
  },
  'offer-cobalt-visor': {
    name: { ar: 'وحدة كوبالت الاستطلاعية', es: 'MÓDULO RECON COBALTO' },
    desc: {
      ar: 'تجهيز قياس تكتيكي للعمليات الخاصة مع درع مستوى 2 ونظارات باليستية.',
      es: 'Equipo de telemetría Spec-Ops con placa balística Nv.2 y gafas.',
    },
  },
  'offer-arctic-ghost': {
    name: { ar: 'معطف القطب الجليدي', es: 'PARKA ALPINA ÁRTICA' },
    desc: {
      ar: 'معطف جليدي دون الصفر مقترن بسترة كيفلار مستوى 1 وسماعة اتصالات.',
      es: 'Parka ártica bajo cero con chaleco Kevlar Nv.1 y auriculares tácticos.',
    },
  },
  'offer-woodland-ranger': {
    name: { ar: 'تمويه حارس الغابات', es: 'CAMUFLAJE FORESTAL' },
    desc: {
      ar: 'زي ميداني مموه للغابات مع حقيبة استكشاف تكتيكية.',
      es: 'Uniforme de campo de camuflaje boscoso con mochila táctica.',
    },
  },
  'glider-nexus-standard': {
    name: { ar: 'جناح نيكسوس القياسي', es: 'ALA ESTÁNDAR NEXUS' },
    desc: {
      ar: 'مظلة هبوط تكتيكية قياسية عالية الوضوح للانتشار الجوي.',
      es: 'Paracaídas táctico estándar de alta visibilidad para inserción aérea.',
    },
  },
  'offer-vector-wing': {
    name: { ar: 'مظلة فيكتور الشبحية', es: 'PLANEADOR SIGILO VECTOR' },
    desc: {
      ar: 'مظلة شبحية باللون الفيروزي والرمادي مصممة للإنزال السري.',
      es: 'Canopia sigilosa verde azulado diseñada para descensos discretos.',
    },
  },
  'offer-solar-wing': {
    name: { ar: 'مظلة القمة الشمسية', es: 'CANOPIA SOLAR APEX' },
    desc: {
      ar: 'جناح إنزال مداري باللون الذهبي والأوبسيديان بأضلاع معززة.',
      es: 'Ala de caída orbital oro y obsidiana con costillas reforzadas.',
    },
  },
  'emote-amber-flare': {
    name: { ar: 'منارة منصة القيادة', es: 'BALIZA DE MANDO' },
    desc: {
      ar: 'شعلة إشارة كهرمانية قياسية لمحيط منصة الهبوط.',
      es: 'Bengala estándar ámbar para el perímetro del helipuerto.',
    },
  },
  'offer-pulse-signal': {
    name: { ar: 'شعلة نبضة النصر', es: 'BENGALA PULSO VICTORIA' },
    desc: {
      ar: 'منارة هولوغرافية بنفسجية وتحية خاصة للمرافق في الردهة.',
      es: 'Baliza holográfica violeta y saludo especial del compañero en sala.',
    },
  },
  'offer-cobalt-flare': {
    name: { ar: 'منارة السماء المدارية', es: 'BALIZA CIELO ORBITAL' },
    desc: {
      ar: 'منارة قياس مدارية سماوية عالية الكثافة على منصة القيادة.',
      es: 'Baliza orbital cian de alta intensidad sobre la plataforma de mando.',
    },
  },
  'emote-dance-floss': {
    name: { ar: 'Floss Dance · فلوس دانس', es: 'Floss Dance' },
    desc: {
      ar: 'حركة ذراعين سريعة متبادلة أمام وخلف الجذع مع تمايل إيقاعي للورك.',
      es: 'Oscilación rápida de brazos delante y detrás del torso al ritmo de la cadera.',
    },
  },
  'emote-dance-take-the-l': {
    name: { ar: 'Take the L · تيك ذا إل', es: 'Take the L' },
    desc: {
      ar: 'رفع علامة L على الجبهة مع قفزات وركلات متناوبة للأمام.',
      es: 'Señal L en la frente acompañada de saltos y patadas alternas hacia adelante.',
    },
  },
  'emote-dance-orange-justice': {
    name: { ar: 'Orange Justice · أورنج جاستس', es: 'Orange Justice' },
    desc: {
      ar: 'ثني ركبتين عميق وضخ سريع للصدر مع تقاطع وتلويح قطري للذراعين.',
      es: 'Sentadilla rítmica profunda con bombeo de torso y cortes diagonales alternos de brazos.',
    },
  },
  'emote-dance-renegade': {
    name: { ar: 'Renegade Dance · رينيجيد دانس', es: 'Renegade Dance' },
    desc: {
      ar: 'سلسلة تيك توك السريعة: حركة الـ Woah، تمرير فوق الرأس، تصفيق مزدوج وعزل المعصمين.',
      es: 'Secuencia rápida viral: bloqueo Woah, giro sobre la cabeza, doble palmada y ondas de muñeca.',
    },
  },
  'emote-dance-griddy': {
    name: { ar: 'Griddy Dance · جريدي دانس', es: 'Griddy Dance' },
    desc: {
      ar: 'تبديل ضربات الكعب للأمام مع تأرجح حاد للذراعين للخلف وحركة نظارة B عند العينين.',
      es: 'Toques de talón alternos con balanceo de brazos atrás y gesto de gafas B frente a los ojos.',
    },
  },
  'emote-dance-gangnam-style': {
    name: { ar: 'Gangnam Style · غانغنام ستايل', es: 'Gangnam Style' },
    desc: {
      ar: 'قفزة ركوب الخيل المتبادلة بالمعصمين المتقاطعين يليها تدوير اللاسو فوق الرأس.',
      es: 'Galope rítmico con muñecas cruzadas en las riendas seguido de giro de lazo sobre la cabeza.',
    },
  },
  'emote-dance-macarena': {
    name: { ar: 'Macarena · ماكارينا', es: 'Macarena' },
    desc: {
      ar: 'الرقصة الكلاسيكية الكاملة: مد الذراعين، قلب الكفين، الكتفين، الرأس، الوركين وهز الخصر.',
      es: 'Coreografía clásica completa: brazos al frente, palmas arriba, hombros, cabeza, caderas y giro.',
    },
  },
  'emote-dance-electro-shuffle': {
    name: { ar: 'Electro Shuffle · إلكترو شافل', es: 'Electro Shuffle' },
    desc: {
      ar: 'خطوات شافل سريعة مع دوران القدم T-Step وتقاطع الكاحلين وتموجات ذراع إلكترونية.',
      es: 'Pasos veloces estilo Running-Man, giros en T, cruce de tobillos y barridos electro.',
    },
  },
};

const MAP_NAME_TRANSLATIONS: Record<string, MapTextPair> = {
  desert: { en: 'DESERT', ar: 'الصحراء الكبرى', es: 'DESIERTO' },
  forest: { en: 'FOREST', ar: 'غابة الزمرد', es: 'BOSQUE' },
  snow: { en: 'SNOW', ar: 'القمة المتجمدة', es: 'NIEVE' },
  waiting_arena: {
    en: 'ORBITAL STAGING ARENA',
    ar: 'ساحة الانتظار المدارية',
    es: 'ARENA DE ESPERA ORBITAL',
  },
  training_ground: {
    en: 'TRAINING GROUND',
    ar: 'ساحة التدريب',
    es: 'CAMPO DE ENTRENAMIENTO',
  },
};

const MAP_SUBTITLE_TRANSLATIONS: Record<string, MapTextPair> = {
  desert: {
    en: 'Sunstone Metropolis, Red Mesa Canyons & Scorch Command (1.1 km)',
    ar: 'مدينة صانستون، أودية ميسا الحمراء وقيادة سكورش (1.1 كم)',
    es: 'Metrópoli Sunstone, Cañones Mesa Roja y Comando Scorch (1.1 km)',
  },
  forest: {
    en: 'Oakridge Metropolis, Emerald River Valley & Ironwood Base (1.1 km)',
    ar: 'مدينة أوكريدج، وادي نهر الزمرد وقاعدة أيرون وود (1.1 كم)',
    es: 'Metrópoli Oakridge, Valle Río Esmeralda y Base Ironwood (1.1 km)',
  },
  snow: {
    en: 'Frosthaven Metropolis, Frozen Glacier Lake & Cryo Citadel (1.1 km)',
    ar: 'مدينة فروست هافن، البحيرة الجليدية المتجمدة وقلعة كرايو (1.1 كم)',
    es: 'Metrópoli Frosthaven, Lago Glaciar Helado y Ciudadela Crio (1.1 km)',
  },
  waiting_arena: {
    en: 'Futuristic Pre-Match Orbital Complex · Combat Readiness Deck',
    ar: 'مجمع مداري مستقبلي قبل المباراة · سطح الجاهزية القتالية',
    es: 'Complejo Orbital Previo a Partida · Cubierta de Preparación',
  },
  training_ground: {
    en: 'Container Yard, Armory Plaza, Covered Shooting Ranges & Combat Town',
    ar: 'ساحة الحاويات، منصة الترسانة، ميادين الرماية المغطاة وبلدة القتال',
    es: 'Patio de Contenedores, Plaza Armería, Galerías de Tiro y Pueblo de Combate',
  },
};

const AREA_NAME_TRANSLATIONS: Record<string, LangPair> = {
  // Desert (19)
  'CENTRAL BAZAAR': { ar: 'البازار المركزي', es: 'BAZAR CENTRAL' },
  'SUNSTONE METROPOLIS': { ar: 'مدينة صانستون', es: 'METRÓPOLI SUNSTONE' },
  'MIRAGE RESORT': { ar: 'منتجع السراب', es: 'RESORT ESPEJISMO' },
  'SCORCH MILITARY': { ar: 'قاعدة سكورش العسكرية', es: 'BASE MILITAR SCORCH' },
  'SANDSTONE VILLAGE': { ar: 'قرية الحجر الرملي', es: 'ALDEA ARENISCA' },
  'OASIS FREIGHT YARD': { ar: 'ساحة شحن الواحة', es: 'PATIO DE CARGA OASIS' },
  'SCORPION RIDGE': { ar: 'حافة العقرب', es: 'CRESTA ESCORPIÓN' },
  'CANYON REFINERY': { ar: 'مصفاة الوادي', es: 'REFINERÍA DEL CAÑÓN' },
  'DUSTBOWL HAMLET': { ar: 'بلدة الغبار', es: 'ALDEA POLVAREDA' },
  'NOMAD OASIS CAMP': { ar: 'مخيم واحة البدو', es: 'CAMPAMENTO OASIS' },
  'SUNKEN RUINS': { ar: 'الأنقاض الغارقة', es: 'RUINAS HUNDIDAS' },
  'RED MESA OVERLOOK': { ar: 'مطل ميسا الأحمر', es: 'MIRADOR MESA ROJA' },
  'DUNEVIEW VILLAGE': { ar: 'قرية إطلالة الكثبان', es: 'VILLA DUNAS' },
  'PALMWOOD COURT': { ar: 'حي النخيل', es: 'PATIO PALMAR' },
  'COPPERLINE DISTRICT': { ar: 'حي خط النحاس', es: 'DISTRITO COBRE' },
  'TUMBLEWEED HAMLET': { ar: 'قرية الأعشاب', es: 'ALDEA RODADORA' },
  'WADI RUIN HOMES': { ar: 'بيوت أطلال الوادي', es: 'CASAS DEL UADI' },
  'SOLSTICE ESTATES': { ar: 'ضاحية الانقلاب الشمسي', es: 'RESIDENCIAS SOLSTICIO' },
  'HELIOS GARDENS': { ar: 'حدائق هيليوس', es: 'JARDINES HELIOS' },
  'CANYONGATE VILLAGE': { ar: 'قرية بوابة الوادي', es: 'ALDEA PUERTA DEL CAÑÓN' },
  'SUNCREST TERRACE': { ar: 'شرفة قمة الشمس', es: 'TERRAZA SOLCRESTA' },
  'WESTERN CANYON WAY': { ar: 'طريق الوادي الغربي', es: 'CAMINO CAÑÓN OESTE' },
  'EASTERN DUNE WAY': { ar: 'طريق الكثبان الشرقي', es: 'CAMINO DUNAS ESTE' },
  'SOUTH DUNES SUBURB': { ar: 'ضاحية الكثبان الجنوبية', es: 'SUBURBIO DUNAS SUR' },
  'NORTHERN FRONTIER': { ar: 'الحدود الشمالية', es: 'FRONTERA NORTE' },
  'EAST DESERT HIGHWAY': { ar: 'طريق الصحراء الشرقي', es: 'AUTOPISTA DESIERTO ESTE' },
  'WEST DESERT HIGHWAY': { ar: 'طريق الصحراء الغربي', es: 'AUTOPISTA DESIERTO OESTE' },
  'NORTH DESERT HIGHWAY': { ar: 'طريق الصحراء الشمالي', es: 'AUTOPISTA DESIERTO NORTE' },
  'SOUTH DESERT HIGHWAY': { ar: 'طريق الصحراء الجنوبي', es: 'AUTOPISTA DESIERTO SUR' },
  'SUNSTONE APPROACH': { ar: 'مدخل صانستون', es: 'ACCESO SUNSTONE' },
  'MIRAGE APPROACH': { ar: 'مدخل السراب', es: 'ACCESO ESPEJISMO' },
  'SCORCH APPROACH': { ar: 'مدخل سكورش', es: 'ACCESO SCORCH' },
  'SANDSTONE APPROACH': { ar: 'مدخل الحجر الرملي', es: 'ACCESO ARENISCA' },
  'NORTH SUNSTONE RIM': { ar: 'حافة صانستون الشمالية', es: 'BORDE SUNSTONE NORTE' },
  'NORTH MIRAGE RIM': { ar: 'حافة السراب الشمالية', es: 'BORDE ESPEJISMO NORTE' },
  'NORTH CROSSROADS': { ar: 'التقاطع الشمالي', es: 'CRUCE NORTE' },
  'SOUTH CROSSROADS': { ar: 'التقاطع الجنوبي', es: 'CRUCE SUR' },
  'SOUTH SCORCH RIM': { ar: 'حافة سكورش الجنوبية', es: 'BORDE SCORCH SUR' },
  'SOUTH SANDSTONE RIM': { ar: 'حافة الحجر الرملي الجنوبية', es: 'BORDE ARENISCA SUR' },
  'WEST CANYON SECTOR': { ar: 'قطاع الوادي الغربي', es: 'SECTOR CAÑÓN OESTE' },
  'EAST HAMLET APPROACH': { ar: 'مدخل القرية الشرقي', es: 'ACCESO ALDEA ESTE' },
  'WEST CANYON RIM': { ar: 'حافة الوادي الغربية', es: 'BORDE CAÑÓN OESTE' },
  'SOUTH OASIS ROAD': { ar: 'طريق الواحة الجنوبي', es: 'CAMINO OASIS SUR' },

  // Forest (38)
  'TIMBERLINE CROSSING': { ar: 'معبر خط الأخشاب', es: 'CRUCE MADERERO' },
  'OAKRIDGE METROPOLIS': { ar: 'مدينة أوكريدج', es: 'METRÓPOLI OAKRIDGE' },
  'EMERALD ESTATES': { ar: 'ضاحية الزمرد', es: 'ESTANCIAS ESMERALDA' },
  'IRONWOOD MILITARY': { ar: 'قاعدة أيرون وود العسكرية', es: 'BASE MILITAR IRONWOOD' },
  'PINEWOOD VILLAGE': { ar: 'قرية الصنوبر', es: 'ALDEA PINO' },
  'SAWMILL DEPOT': { ar: 'مستودع المنشرة', es: 'ASERRADERO' },
  'NORTHGATE BRIDGEHEAD': { ar: 'رأس جسر البوابة الشمالية', es: 'PUENTE NORTE' },
  'WHISPERING WOODS': { ar: 'غابات الهمس', es: 'BOSQUES SUSURRANTES' },
  'FERNWOOD HAMLET': { ar: 'قرية السرخس', es: 'ALDEA HELECHO' },
  'OLD SANATORIUM': { ar: 'المصحة القديمة', es: 'ANTIGUO SANATORIO' },
  'RIVERBEND DEPOT': { ar: 'مستودع منعطف النهر', es: 'DEPÓSITO RIBERA' },
  'EMERALD RIVER VALLEY': { ar: 'وادي نهر الزمرد', es: 'VALLE RÍO ESMERALDA' },
  'MOSSBROOK VILLAGE': { ar: 'قرية جدول الطحالب', es: 'ALDEA MUSGO' },
  'CEDAR CREST': { ar: 'قمة الأرز', es: 'CRESTA DE CEDRO' },
  'BIRCHWOOD HOLLOW': { ar: 'وادي البتولا', es: 'HONDONADA ABEDUL' },
  'SILVERLEAF DOWNS': { ar: 'تلال الورق الفضي', es: 'COLINAS HOJA PLATA' },
  'ALDER RIDGE': { ar: 'سلسلة النغت', es: 'CRESTA ALISO' },
  'RIVERBANK CROSSING': { ar: 'معبر ضفة النهر', es: 'CRUCE DEL RÍO' },
  'WILLOWCREEK VILLAGE': { ar: 'قرية جدول الصفصاف', es: 'ALDEA ARROYO SAUCE' },
  'PINEHILL CROSSING': { ar: 'معبر تل الصنوبر', es: 'CRUCE COLINA PINO' },
  'ASHWOOD AVENUE': { ar: 'جادة خشب الدردار', es: 'AVENIDA FRESNO' },
  'WESTWOOD LANE': { ar: 'ممر الغابة الغربية', es: 'PASAJE BOSQUE OESTE' },
  'EASTWOOD TRAIL': { ar: 'درب الغابة الشرقية', es: 'SENDERO BOSQUE ESTE' },
  'SOUTHGATE COMMONS': { ar: 'سهول البوابة الجنوبية', es: 'PRADERA PUERTA SUR' },
  'NORTHWOOD TERRACE': { ar: 'شرفة الغابة الشمالية', es: 'TERRAZA BOSQUE NORTE' },
  'EAST VALLEY PARKWAY': { ar: 'متنزه الوادي الشرقي', es: 'BULEVAR VALLE ESTE' },
  'WEST VALLEY PARKWAY': { ar: 'متنزه الوادي الغربي', es: 'BULEVAR VALLE OESTE' },
  'NORTH TIMBER HIGHWAY': { ar: 'طريق الأخشاب الشمالي', es: 'AUTOPISTA MADERA NORTE' },
  'EMERALD APPROACH': { ar: 'مدخل الزمرد', es: 'ACCESO ESMERALDA' },
  'OAKRIDGE APPROACH': { ar: 'مدخل أوكريدج', es: 'ACCESO OAKRIDGE' },
  'SOUTH SAWMILL ROAD': { ar: 'طريق المنشرة الجنوبي', es: 'CAMINO ASERRADERO SUR' },
  'NORTH EMERALD RIM': { ar: 'حافة الزمرد الشمالية', es: 'BORDE ESMERALDA NORTE' },
  'NORTH OAKRIDGE RIM': { ar: 'حافة أوكريدج الشمالية', es: 'BORDE OAKRIDGE NORTE' },
  'SOUTH IRONWOOD RIM': { ar: 'حافة أيرون وود الجنوبية', es: 'BORDE IRONWOOD SUR' },
  'SOUTH PINEWOOD RIM': { ar: 'حافة الصنوبر الجنوبية', es: 'BORDE PINO SUR' },
  'WEST FOREST PARKWAY': { ar: 'طريق الغابة الغربي', es: 'BULEVAR BOSQUE OESTE' },
  'EAST FOREST PARKWAY': { ar: 'طريق الغابة الشرقي', es: 'BULEVAR BOSQUE ESTE' },
  'WEST PINEWOOD ROAD': { ar: 'طريق الصنوبر الغربي', es: 'CAMINO PINO OESTE' },
  'EAST RIVER BANK': { ar: 'ضفة النهر الشرقية', es: 'RIBERA ESTE' },
  'WEST VALLEY RIDGE': { ar: 'حافة الوادي الغربية', es: 'CRESTA VALLE OESTE' },
  'NORTHGATE RIM': { ar: 'حافة البوابة الشمالية', es: 'BORDE PUERTA NORTE' },

  // Snow (36)
  'GLACIER PLAZA': { ar: 'ساحة الجليد', es: 'PLAZA GLACIAR' },
  'FROSTHAVEN METROPOLIS': { ar: 'مدينة فروست هافن', es: 'METRÓPOLI FROSTHAVEN' },
  'AURORA VILLAS': { ar: 'فلل الشفق القطبي', es: 'VILLAS AURORA' },
  'CRYO CITADEL': { ar: 'قلعة كرايو', es: 'CIUDADELA CRIO' },
  'ALPINE VILLAGE': { ar: 'القرية الألبية', es: 'ALDEA ALPINA' },
  'POLAR HANGAR YARD': { ar: 'ساحة الحظائر القطبية', es: 'HANGARES POLARES' },
  'FROSTLAKE OBSERVATORY': { ar: 'مرصد بحيرة الصقيع', es: 'OBSERVATORIO HELADO' },
  'TUNDRA REFINERY': { ar: 'مصفاة التندرا', es: 'REFINERÍA TUNDRA' },
  'SNOWDRIFT HAMLET': { ar: 'قرية انجراف الثلج', es: 'ALDEA VENTISCA' },
  'ABANDONED RADAR': { ar: 'الرادار المهجور', es: 'RADAR ABANDONADO' },
  'ICEBREAKER DOCKS': { ar: 'أرصفة كاسحة الجليد', es: 'MUELLES ROMPEHIELOS' },
  'FROZEN GLACIER LAKE': { ar: 'بحيرة النهر الجليدي', es: 'LAGO GLACIAR HELADO' },
  'FROSTPINE TERRACE': { ar: 'شرفة صنوبر الصقيع', es: 'TERRAZA PINO HELADO' },
  'WINTERBROOK': { ar: 'جدول الشتاء', es: 'ARROYO INVERNAL' },
  'BOREAL SQUARE': { ar: 'الساحة الشمالية', es: 'PLAZA BOREAL' },
  'GLACIERVIEW HOMES': { ar: 'منازل مطل الجليد', es: 'CASAS DEL GLACIAR' },
  'POLARIS ESTATES': { ar: 'ضاحية بولاريس', es: 'ESTANCIAS POLARIS' },
  'PERMAFROST ROW': { ar: 'صف الصقيع الدائم', es: 'PASAJE PERMAFROST' },
  'GLACIERCREST VILLAGE': { ar: 'قرية قمة الجليد', es: 'ALDEA CRESTA GLACIAR' },
  'FROSTVALE BOULEVARD': { ar: 'جادة وادي الصقيع', es: 'BULEVAR VALLE HELADO' },
  'SNOWRIDGE AVENUE': { ar: 'شارع حافة الثلج', es: 'AVENIDA CRESTA NIEVE' },
  'TUNDRA TERRACE': { ar: 'شرفة التندرا', es: 'TERRAZA TUNDRA' },
  'SOUTH GLACIER WAY': { ar: 'طريق الجليد الجنوبي', es: 'CAMINO GLACIAR SUR' },
  'NORTHERN AURORA': { ar: 'الشفق الشمالي', es: 'AURORA NORTE' },
  'EAST POLAR PARKWAY': { ar: 'الطريق القطبي الشرقي', es: 'BULEVAR POLAR ESTE' },
  'WEST POLAR PARKWAY': { ar: 'الطريق القطبي الغربي', es: 'BULEVAR POLAR OESTE' },
  'NORTH POLAR HIGHWAY': { ar: 'الطريق القطبي الشمالي', es: 'AUTOPISTA POLAR NORTE' },
  'SOUTH POLAR HIGHWAY': { ar: 'الطريق القطبي الجنوبي', es: 'AUTOPISTA POLAR SUR' },
  'FROSTHAVEN APPROACH': { ar: 'مدخل فروست هافن', es: 'ACCESO FROSTHAVEN' },
  'CRYO APPROACH': { ar: 'مدخل كرايو', es: 'ACCESO CRIO' },
  'ALPINE APPROACH': { ar: 'مدخل القرية الألبية', es: 'ACCESO ALPINO' },
  'NORTH FROSTHAVEN RIM': { ar: 'حافة فروست هافن الشمالية', es: 'BORDE FROSTHAVEN NORTE' },
  'NORTH AURORA RIM': { ar: 'حافة الشفق الشمالية', es: 'BORDE AURORA NORTE' },
  'SOUTH CRYO RIM': { ar: 'حافة كرايو الجنوبية', es: 'BORDE CRIO SUR' },
  'SOUTH ALPINE RIM': { ar: 'حافة الألب الجنوبية', es: 'BORDE ALPINO SUR' },
  'WEST POLAR RIM': { ar: 'الحافة القطبية الغربية', es: 'BORDE POLAR OESTE' },

  // Waiting Arena (5)
  'Orbital Holo-Plaza': { ar: 'الساحة المدارية الضوئية', es: 'Holo-Plaza Orbital' },
  'North Drop-Ship Hangar': { ar: 'حظيرة الإنزال الشمالية', es: 'Hangar Norte de Naves' },
  'East Cyber-Tech Lab': { ar: 'المختبر السيبراني الشرقي', es: 'Laboratorio Ciber Este' },
  'West Vanguard Barracks': { ar: 'ثكنة الطليعة الغربية', es: 'Cuartel Vanguardia Oeste' },
  'South Telemetry Outpost': { ar: 'موقع القياس الجنوبي', es: 'Puesto Telemétrico Sur' },

  // Training Ground (7)
  'CONTAINER YARD': { ar: 'ساحة الحاويات', es: 'PATIO DE CONTENEDORES' },
  'ARMORY PLAZA': { ar: 'ساحة الترسانة', es: 'PLAZA ARMERÍA' },
  'SHOOTING RANGE': { ar: 'ميدان الرماية', es: 'GALERÍA DE TIRO' },
  'COMBAT TOWN': { ar: 'بلدة القتال', es: 'PUEBLO DE COMBATE' },
  'LOGISTICS DEPOT': { ar: 'مستودع الإمداد', es: 'DEPÓSITO LOGÍSTICO' },
  'SNIPER RIDGE': { ar: 'تلة القنص', es: 'CRESTA DE FRANCOTIRADOR' },
  'PINE WOODS SOUTH': { ar: 'غابة الصنوبر الجنوبية', es: 'PINAR SUR' },
};

const ZIPLINE_TRANSLATIONS: Record<string, LangPair> = {
  'MESA OVERLOOK EXPRESS': { ar: 'خط إطلالة ميسا السريع', es: 'EXPRESO MIRADOR MESA' },
  'SUNSTONE PLAZA LINE': { ar: 'خط ساحة صانستون', es: 'LÍNEA PLAZA SUNSTONE' },
  'MIRAGE CANYON CROSSING': { ar: 'معبر وادي السراب', es: 'CRUCE CAÑÓN ESPEJISMO' },
  'REFINERY TOWER LINE': { ar: 'خط برج المصفاة', es: 'LÍNEA TORRE REFINERÍA' },
  'SCORCH COMMAND ZIP': { ar: 'انزلاق قيادة سكورش', es: 'TIROLINA COMANDO SCORCH' },
  'SOUTH DUNE OVERLOOK': { ar: 'مطل الكثبان الجنوبي', es: 'MIRADOR DUNAS SUR' },
  'SANDSTONE PASS': { ar: 'ممر الحجر الرملي', es: 'PASO ARENISCA' },
  'WEST RIVER CROSSING': { ar: 'معبر النهر الغربي', es: 'CRUCE RÍO OESTE' },
  'CENTRAL RIVER CABLE': { ar: 'كابل النهر المركزي', es: 'CABLE RÍO CENTRAL' },
  'IRONWOOD RIVER ZIP': { ar: 'خط نهر أيرون وود', es: 'TIROLINA RÍO IRONWOOD' },
  'EMERALD RIDGE LINE': { ar: 'خط حافة الزمرد', es: 'LÍNEA CRESTA ESMERALDA' },
  'OAKRIDGE SKYLINE ZIP': { ar: 'انزلاق سماء أوكريدج', es: 'TIROLINA CIELO OAKRIDGE' },
  'PINEWOOD CANOPY LINE': { ar: 'خط قمم الصنوبر', es: 'LÍNEA COPAS DE PINO' },
  'SAWMILL RIDGE ZIP': { ar: 'خط تلة المنشرة', es: 'TIROLINA ASERRADERO' },
  'GLACIER LAKE CROSSING': { ar: 'معبر البحيرة الجليدية', es: 'CRUCE LAGO GLACIAR' },
  'FROZEN BASIN EXPRESS': { ar: 'خط الحوض المتجمد السريع', es: 'EXPRESO CUENCA HELADA' },
  'FROSTHAVEN RIDGE LINE': { ar: 'خط حافة فروست هافن', es: 'LÍNEA CRESTA FROSTHAVEN' },
  'AURORA SUMMIT ZIP': { ar: 'انزلاق قمة الشفق', es: 'TIROLINA CIMA AURORA' },
  'CRYO CITADEL TRANSIT': { ar: 'عبور قلعة كرايو', es: 'TRÁNSITO CIUDADELA CRIO' },
  'ALPINE PASS CABLE': { ar: 'كابل الممر الألبي', es: 'CABLE PASO ALPINO' },
  'TUNDRA RELAY LINE': { ar: 'خط تتابع التندرا', es: 'LÍNEA RELEVO TUNDRA' },
};

const FLIGHT_TRANSLATIONS: Record<string, LangPair> = {
  'desert-corridor-nw-se': {
    ar: 'صانستون ← قاعدة سكورش',
    es: 'SUNSTONE → BASE SCORCH',
  },
  'SUNSTONE → SCORCH MILITARY': {
    ar: 'صانستون ← قاعدة سكورش',
    es: 'SUNSTONE → BASE SCORCH',
  },
  'desert-corridor-sw-ne': {
    ar: 'الحجر الرملي ← منتجع السراب',
    es: 'ALDEA ARENISCA → RESORT ESPEJISMO',
  },
  'SANDSTONE → MIRAGE RESORT': {
    ar: 'الحجر الرملي ← منتجع السراب',
    es: 'ALDEA ARENISCA → RESORT ESPEJISMO',
  },
  'desert-corridor-w-e': {
    ar: 'مصفاة الوادي ← بلدة الغبار',
    es: 'REFINERÍA CAÑÓN → ALDEA POLVAREDA',
  },
  'CANYON REFINERY → DUSTBOWL': {
    ar: 'مصفاة الوادي ← بلدة الغبار',
    es: 'REFINERÍA CAÑÓN → ALDEA POLVAREDA',
  },
  'forest-corridor-nw-se': {
    ar: 'ضاحية الزمرد ← قاعدة أيرون وود',
    es: 'ESTANCIAS ESMERALDA → IRONWOOD',
  },
  'EMERALD ESTATES → IRONWOOD BASE': {
    ar: 'ضاحية الزمرد ← قاعدة أيرون وود',
    es: 'ESTANCIAS ESMERALDA → IRONWOOD',
  },
  'forest-corridor-sw-ne': {
    ar: 'قرية الصنوبر ← مدينة أوكريدج',
    es: 'ALDEA PINO → METRÓPOLI OAKRIDGE',
  },
  'PINEWOOD → OAKRIDGE METROPOLIS': {
    ar: 'قرية الصنوبر ← مدينة أوكريدج',
    es: 'ALDEA PINO → METRÓPOLI OAKRIDGE',
  },
  'forest-corridor-s-n': {
    ar: 'مستودع المنشرة ← البوابة الشمالية',
    es: 'ASERRADERO → PUENTE NORTE',
  },
  'SAWMILL DEPOT → NORTHGATE': {
    ar: 'مستودع المنشرة ← البوابة الشمالية',
    es: 'ASERRADERO → PUENTE NORTE',
  },
  'snow-corridor-nw-se': {
    ar: 'فروست هافن ← قلعة كرايو',
    es: 'FROSTHAVEN → CIUDADELA CRIO',
  },
  'FROSTHAVEN → CRYO CITADEL': {
    ar: 'فروست هافن ← قلعة كرايو',
    es: 'FROSTHAVEN → CIUDADELA CRIO',
  },
  'snow-corridor-sw-ne': {
    ar: 'القرية الألبية ← فلل الشفق',
    es: 'ALDEA ALPINA → VILLAS AURORA',
  },
  'ALPINE VILLAGE → AURORA VILLAS': {
    ar: 'القرية الألبية ← فلل الشفق',
    es: 'ALDEA ALPINA → VILLAS AURORA',
  },
  'snow-corridor-e-w': {
    ar: 'مصفاة التندرا ← انجراف الثلج',
    es: 'REFINERÍA TUNDRA → VENTISCA',
  },
  'TUNDRA REFINERY → SNOWDRIFT': {
    ar: 'مصفاة التندرا ← انجراف الثلج',
    es: 'REFINERÍA TUNDRA → VENTISCA',
  },
};

const DOOR_TRANSLATIONS: Record<string, LangPair> = {
  'VILLA GRAND ENTRY': { ar: 'مدخل الفيلا الرئيسي', es: 'ENTRADA PRINCIPAL VILLA' },
  'PATIO TERRACE DOOR': { ar: 'باب شرفة الفناء', es: 'PUERTA TERRAZA PATIO' },
  'PORTICO SIDE DOOR': { ar: 'الباب الجانبي للرواق', es: 'PUERTA LATERAL PÓRTICO' },
  'STUDY DOOR': { ar: 'باب غرفة المكتب', es: 'PUERTA ESTUDIO' },
  'BALCONY DOOR': { ar: 'باب الشرفة', es: 'PUERTA BALCÓN' },
  'REAR BALCONY': { ar: 'الشرفة الخلفية', es: 'BALCÓN TRASERO' },
  'MASTER SUITE': { ar: 'الجناح الرئيسي', es: 'SUITE PRINCIPAL' },
  'GUEST SUITE': { ar: 'جناح الضيوف', es: 'SUITE INVITADOS' },
  'APARTMENT LOBBY': { ar: 'بهو المبنى السكني', es: 'VESTÍBULO EDIFICIO' },
  'COURTYARD EXIT': { ar: 'مخرج الساحة', es: 'SALIDA AL PATIO' },
  'SERVICE ENTRY': { ar: 'مدخل الخدمة', es: 'ENTRADA DE SERVICIO' },
  'FRONT DOOR': { ar: 'الباب الأمامي', es: 'PUERTA PRINCIPAL' },
  'BACK PATIO DOOR': { ar: 'باب الفناء الخلفي', es: 'PUERTA PATIO TRASERO' },
  'SIDE ENTRY': { ar: 'المدخل الجانبي', es: 'ENTRADA LATERAL' },
  'MASTER BEDROOM': { ar: 'غرفة النوم الرئيسية', es: 'DORMITORIO PRINCIPAL' },
  'GUEST BEDROOM': { ar: 'غرفة الضيوف', es: 'DORMITORIO INVITADOS' },
  'BLAST GATE': { ar: 'بوابة التحصين', es: 'COMPUERTA BLINDADA' },
  'MOTOR BAY DOOR': { ar: 'باب مرآب المركبات', es: 'PUERTA GARAJE' },
  'AIRLOCK DOOR': { ar: 'باب الضغط المحكم', es: 'PUERTA ESCLUSA' },
  'COMMS DOOR': { ar: 'باب الاتصالات', es: 'PUERTA COMUNICACIONES' },
  'ARMORY DOOR': { ar: 'باب مستودع السلاح', es: 'PUERTA ARMERÍA' },
  'WATCH DECK': { ar: 'سطح المراقبة', es: 'PLATAFORMA VIGILANCIA' },
  'BARRACKS DOOR': { ar: 'باب الثكنة', es: 'PUERTA BARRACÓN' },
  'CARGO BAY DOOR': { ar: 'باب عنبر الشحن', es: 'PUERTA ZONA CARGA' },
  'LOADING DOOR': { ar: 'باب التحميل', es: 'PUERTA CARGAMENTO' },
  'PERSONNEL DOOR': { ar: 'باب الأفراد', es: 'PUERTA PERSONAL' },
  'OFFICE DOOR': { ar: 'باب المكتب', es: 'PUERTA OFICINA' },
  'TOOL LOCKUP': { ar: 'مخزن الأدوات', es: 'ALMACÉN HERRAMIENTAS' },
  'CREAKING DOOR': { ar: 'باب خشبي قديم', es: 'PUERTA CHIRRIANTE' },
  'BROKEN DOOR': { ar: 'باب محطم', es: 'PUERTA ROTA' },
  'LAB ATRIUM GATE': { ar: 'بوابة بهو المختبر', es: 'PORTÓN ATRIO LAB.' },
  'REAR BIO-AIRLOCK': { ar: 'غرفة الضغط الخلفية', es: 'ESCLUSA BIO TRASERA' },
  'CARGO AIRLOCK': { ar: 'بوابة ضغط الشحن', es: 'ESCLUSA DE CARGA' },
  'SERVER VAULT': { ar: 'قبو الخوادم', es: 'BÓVEDA SERVIDORES' },
  'OBS DECK DOOR': { ar: 'باب سطح المراقبة', es: 'PUERTA OBSERVATORIO' },
  'CRYOLAB DOOR': { ar: 'باب المختبر المبرد', es: 'PUERTA CRIOLAB' },
  'COMPLEX LOBBY': { ar: 'بهو المجمع', es: 'VESTÍBULO COMPLEJO' },
  'PLAZA EXIT': { ar: 'مخرج الساحة', es: 'SALIDA PLAZA' },
  'EAST ACCESS': { ar: 'المدخل الشرقي', es: 'ACCESO ESTE' },
  'OUTPOST GATE': { ar: 'بوابة النقطة الأمامية', es: 'PORTÓN AVANZADA' },
  'REAR BREACH': { ar: 'الثغرة الخلفية', es: 'BRECHA TRASERA' },
  'HOME DOOR': { ar: 'باب المنزل', es: 'PUERTA DE CASA' },
  'BEDROOM DOOR': { ar: 'باب غرفة النوم', es: 'PUERTA DORMITORIO' },
};

const SEAT_TRANSLATIONS: Record<string, LangPair> = {
  'PLAZA BENCH': { ar: 'مقعد الساحة', es: 'BANCO DE PLAZA' },
  SOFA: { ar: 'أريكة', es: 'SOFÁ' },
  CHAIR: { ar: 'كرسي', es: 'SILLA' },
  BENCH: { ar: 'مقعد', es: 'BANCO' },
  'DESK CHAIR': { ar: 'كرسي مكتب', es: 'SILLA DE ESCRITORIO' },
  'DINING CHAIR': { ar: 'كرسي طعام', es: 'SILLA DE COMEDOR' },
  'BALCONY BENCH': { ar: 'مقعد الشرفة', es: 'BANCO DE BALCÓN' },
  'LOBBY BENCH': { ar: 'مقعد البهو', es: 'BANCO DE VESTÍBULO' },
  'TECH BENCH': { ar: 'مقعد تقني', es: 'BANCO TÉCNICO' },
  'SKYLINE BENCH': { ar: 'مقعد الإطلالة', es: 'BANCO PANORÁMICO' },
  'ROOF BENCH': { ar: 'مقعد السطح', es: 'BANCO DE AZOTEA' },
};

export class I18nManager {
  private language: AppLanguage = 'en';
  private readonly listeners = new Set<LanguageChangeListener>();

  getLanguage(): AppLanguage {
    return this.language;
  }

  isRtl(): boolean {
    return this.language === 'ar';
  }

  getLanguageOptions(): readonly LanguageOption[] {
    return [
      { id: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
      { id: 'ar', label: 'العربية', nativeLabel: 'العربية', dir: 'rtl' },
      { id: 'es', label: 'Español', nativeLabel: 'Español', dir: 'ltr' },
    ];
  }

  setLanguage(lang: AppLanguage): void {
    const valid: AppLanguage = lang === 'ar' || lang === 'es' ? lang : 'en';
    const changed = this.language !== valid;
    this.language = valid;
    const rtl = valid === 'ar';

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = valid;
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    }

    if (changed) {
      for (const listener of this.listeners) {
        listener(valid, rtl);
      }
    }
  }

  subscribe(listener: LanguageChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  t(key: TranslationKey, params?: Record<string, string | number>): string {
    const dict = TRANSLATIONS[this.language] ?? TRANSLATIONS.en;
    let text = dict[key] ?? TRANSLATIONS.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }

  // --- Weapons & Loot ---
  translateWeaponName(idOrName: string): string {
    const rawKey = idOrName.toLowerCase();
    const key = rawKey.startsWith('weapon_') ? rawKey.slice(7) : rawKey;
    if (key === 'unarmed') return this.t('hud.unarmedLabel');
    if (key === 'empty') return this.t('inv.emptySlot');
    if (this.language === 'en') {
      if (key === 'fists') return 'FISTS';
      return idOrName;
    }
    const entry = WEAPON_TRANSLATIONS[key];
    if (entry) return entry[this.language];
    for (const [wId, pair] of Object.entries(WEAPON_TRANSLATIONS)) {
      if (wId === key) return pair[this.language];
    }
    if (key === 'storm') return this.language === 'ar' ? 'العاصفة' : 'TORMENTA';
    if (key === 'combat') return this.language === 'ar' ? 'اشتباك' : 'COMBATE';
    if (key === 'safe zone') return this.language === 'ar' ? 'المنطقة الآمنة' : 'ZONA SEGURA';
    if (key === 'ak-47') return WEAPON_TRANSLATIONS.ak24[this.language];
    if (key === 'desert eagle') return WEAPON_TRANSLATIONS.desert_eagle[this.language];
    if (key === 'combat knife') return WEAPON_TRANSLATIONS.combat_knife[this.language];
    if (key === 'baseball bat') return WEAPON_TRANSLATIONS.baseball_bat[this.language];
    if (key === 'double barrel') return WEAPON_TRANSLATIONS.double_barrel[this.language];
    if (key === 'dp-28') return WEAPON_TRANSLATIONS.dp28[this.language];
    return idOrName;
  }

  translateWeaponCategory(cat: WeaponCategory): string {
    return this.t(`weaponCat.${cat}` as TranslationKey);
  }

  translateLootName(id: string, fallbackName?: string): string {
    if (this.language === 'en') return fallbackName ?? id;
    const entry = LOOT_TRANSLATIONS[id];
    if (entry) return entry.name[this.language];
    return fallbackName ?? id;
  }

  translateLootDesc(id: string, fallbackDesc?: string): string {
    if (this.language === 'en') return fallbackDesc ?? '';
    const entry = LOOT_TRANSLATIONS[id];
    if (entry) return entry.desc[this.language];
    return fallbackDesc ?? '';
  }

  translateLootCategory(category: LootCategory): string {
    return this.t(`lootCat.${category}` as TranslationKey);
  }

  translateAmmoType(ammoType: string): string {
    if (this.language === 'en') return ammoType;
    if (ammoType === 'SMG' || ammoType === 'AR' || ammoType === 'LMG' || ammoType === 'SHOTGUN' || ammoType === 'SNIPER' || ammoType === 'PISTOL') {
      return this.t(`weaponCat.${ammoType}` as TranslationKey);
    }
    return ammoType;
  }

  translateRarity(rarity: LootRarity | string): string {
    const key = `rarity.${rarity.toLowerCase()}` as TranslationKey;
    return this.t(key);
  }

  // --- Characters & Abilities ---
  translateCharacterName(id: string, fallbackName: string): string {
    if (this.language === 'en') return fallbackName;
    const entry = CORE_CHARACTER_TRANSLATIONS[id];
    if (entry) return entry.name[this.language];
    return fallbackName;
  }

  translateCharacterRole(role: string): string {
    if (this.language === 'en') return role;
    const entry = CHARACTER_ROLE_TRANSLATIONS[role];
    if (entry) return entry[this.language];
    return role;
  }

  translateCharacterDesc(id: string, fallbackDesc: string): string {
    if (this.language === 'en') return fallbackDesc;
    const entry = CORE_CHARACTER_TRANSLATIONS[id];
    if (entry) return entry.desc[this.language];
    return fallbackDesc;
  }

  translateAbilityName(id: string, fallbackName: string): string {
    if (this.language === 'en') return fallbackName;
    const entry = ABILITY_TRANSLATIONS[id];
    if (entry) return entry.name[this.language];
    return fallbackName;
  }

  translateAbilityDesc(id: string, fallbackDesc: string): string {
    if (this.language === 'en') return fallbackDesc;
    const entry = ABILITY_TRANSLATIONS[id];
    if (entry) return entry.desc[this.language];
    return fallbackDesc;
  }

  translateAbilityCategory(cat: AbilityCategory): string {
    return this.t(`abilityCat.${cat}` as TranslationKey);
  }

  // --- Customization & Pets ---
  translateCustomizationOption(
    category: keyof R6Customization,
    id: string,
    fallbackTitle: string,
  ): string {
    if (this.language === 'en') return fallbackTitle;
    const entry = CUSTOMIZATION_TRANSLATIONS[category]?.[id];
    if (entry) return entry.title[this.language];
    return fallbackTitle;
  }

  translateCustomizationSubtitle(category: keyof R6Customization, fallbackSub: string): string {
    if (this.language === 'en') return fallbackSub;
    switch (category) {
      case 'skinId':
        return this.language === 'ar' ? 'لون البشرة' : 'Tono de Piel';
      case 'eyesId':
        return this.language === 'ar' ? 'عيون الوجه' : 'Ojos del Rostro';
      case 'mouthId':
        return this.language === 'ar' ? 'تعبير الفم' : 'Expresión Facial';
      case 'faceMarkId':
        return this.language === 'ar' ? 'ملامح وتفاصيل الوجه' : 'Rasgos Faciales';
      case 'hairStyleId':
        return this.language === 'ar' ? 'تسريحة الشعر 3D' : 'Peinado 3D';
      case 'hairColorId':
        return this.language === 'ar' ? 'لون الشعر' : 'Color de Cabello';
      case 'topId':
        return this.language === 'ar' ? 'سترات وقمصان R6' : 'Prenda Superior R6';
      case 'pantsId':
        return this.language === 'ar' ? 'بناطيل R6 العصرية' : 'Pantalones R6';
      case 'shoesId':
        return this.language === 'ar' ? 'أحذية رياضية وبوت' : 'Calzado Moderno';
      case 'hatId':
        return this.language === 'ar' ? 'قبعات ثلاثية الأبعاد' : 'Sombreros 3D';
      case 'glassesId':
        return this.language === 'ar' ? 'نظارات وإطارات' : 'Gafas y Visores';
      case 'maskId':
        return this.language === 'ar' ? 'أقنعة الوجه' : 'Máscaras';
      case 'armorId':
        return this.language === 'ar' ? 'الدرع الباليستي' : 'Blindaje Balístico';
      case 'accessoryId':
        return this.language === 'ar' ? 'معدات الرأس والظهر' : 'Accesorio y Equipo';
      case 'petId':
        return this.language === 'ar' ? 'وحدة المرافقة' : 'Unidad Compañera';
      case 'petEnabled':
        return this.language === 'ar' ? 'تفعيل المرافق بالمباراة' : 'Interruptor de Compañero';
    }
  }

  translateCustomizationDesc(
    category: keyof R6Customization,
    id: string,
    fallbackDesc: string,
  ): string {
    if (this.language === 'en') return fallbackDesc;
    const entry = CUSTOMIZATION_TRANSLATIONS[category]?.[id];
    if (entry) return entry.desc[this.language];
    return fallbackDesc;
  }

  translatePet(petId: R6PetId): {
    name: string;
    role: string;
    traitBadge: string;
    personality: string;
    behavior: string;
  } {
    const entry = PET_DETAIL_TRANSLATIONS[petId] ?? PET_DETAIL_TRANSLATIONS.wolf;
    if (this.language === 'en') {
      const enDefaults: Record<R6PetId, { name: string; role: string; traitBadge: string; personality: string; behavior: string }> = {
        wolf: {
          name: 'K9 Shepherd',
          role: 'Tactical Assault Hound',
          traitBadge: 'LOYAL SCOUT',
          personality: 'Alert, disciplined, and fiercely loyal — perks its ears on touchdown and celebrates eliminations.',
          behavior: 'Trots smoothly alongside your left flank across terrain, bounds during sprints, and keeps clear of your line of fire.',
        },
        fox: {
          name: 'Arctic K9 Unit',
          role: 'Alpine Frost Tracker',
          traitBadge: 'AGILE TRACKER',
          personality: 'Swift, curious alpine shepherd with icy blue telemetry collar and high-energy tail wags.',
          behavior: 'Glides effortlessly over slopes and ridges alongside you, staying compact and unobtrusive in tight cover.',
        },
        parrot: {
          name: 'Recon Drone',
          role: 'Autonomous Quad-Rotor',
          traitBadge: 'AERIAL RECON',
          personality: 'Precision-engineered micro-UAV with stabilized optical gimbal and playful mid-air barrel-roll bursts.',
          behavior: 'Hovers at shoulder altitude, banks forward cleanly into turns and sprints, and spools up rotors dynamically.',
        },
        creeper_bot: {
          name: 'Tactical UGV',
          role: 'Tracked Sentry Rover',
          traitBadge: 'ARMORED ROVER',
          personality: 'Stoic twin-track ground drone with sweeping emerald optics and steady gyro-stabilized turret.',
          behavior: 'Rolls over uneven terrain with articulated suspension bounce and tracks nearby sightlines.',
        },
        none: {
          name: 'No Companion',
          role: 'Solo Deployment',
          traitBadge: 'SOLO OP',
          personality: 'Deploy completely alone for a classic minimalist operator silhouette in lobby and matches.',
          behavior: 'Deactivates companion deployment on both the helipad lobby and active battlegrounds.',
        },
      };
      return enDefaults[petId];
    }
    return {
      name: entry.name[this.language],
      role: entry.role[this.language],
      traitBadge: entry.traitBadge[this.language],
      personality: entry.personality[this.language],
      behavior: entry.behavior[this.language],
    };
  }

  // --- Shop ---
  translateShopItem(
    id: string,
    fallbackName: string,
    fallbackDesc: string,
    lootId?: string,
  ): { name: string; desc: string } {
    if (this.language === 'en') return { name: fallbackName, desc: fallbackDesc };
    const entry = SHOP_TRANSLATIONS[id] ?? (lootId ? LOOT_TRANSLATIONS[lootId] : undefined);
    if (!entry) return { name: fallbackName, desc: fallbackDesc };
    return {
      name: entry.name[this.language],
      desc: entry.desc[this.language],
    };
  }

  translateShopCategory(cat: ShopCategory): string {
    return this.t(`shop.tab.${cat}` as TranslationKey);
  }

  translateShopSubCategory(sub: string): string {
    const map: Record<string, TranslationKey> = {
      Rifles: 'shop.sub.rifles',
      LMGs: 'shop.sub.lmgs',
      Snipers: 'shop.sub.snipers',
      SMGs: 'shop.sub.smgs',
      Shotguns: 'shop.sub.shotguns',
      Pistols: 'shop.sub.pistols',
      Melee: 'shop.sub.melee',
      Vests: 'shop.tab.armor',
      Helmets: 'lootCat.helmet',
      Backpacks: 'lootCat.backpack',
      Scopes: 'lootCat.scope',
      Gliders: 'shop.tab.gliders',
      Outfits: 'shop.tab.outfits',
      Shirts: 'shop.sub.shirts',
      Pants: 'shop.sub.pants',
      Shoes: 'shop.sub.shoes',
      Hats: 'shop.sub.hats',
      Glasses: 'shop.sub.glasses',
      Masks: 'shop.sub.masks',
      Accessories: 'shop.sub.accessories',
      Avatars: 'shop.tab.avatars',
      Banners: 'shop.tab.banners',
      'Weapon Skins': 'shop.tab.weapon-skins',
      Beacons: 'shop.tab.emotes',
      Medical: 'lootCat.health',
      Shields: 'common.shield',
      Tactical: 'lootCat.utility',
      Cool: 'shop.sub.cool',
      Victory: 'shop.sub.victory',
      Trending: 'shop.sub.trending',
      Funny: 'shop.sub.funny',
    };
    const key = map[sub];
    return key ? this.t(key) : sub;
  }

  // --- Maps, Areas, Doors, Seats, Ziplines, Flights ---
  translateMapName(idOrName: string): string {
    const key = idOrName.toLowerCase();
    const direct = MAP_NAME_TRANSLATIONS[key];
    if (direct) return direct[this.language];
    for (const pair of Object.values(MAP_NAME_TRANSLATIONS)) {
      if (pair.en.toLowerCase() === key) return pair[this.language];
    }
    return idOrName;
  }

  translateMapSubtitle(id: string, fallback: string): string {
    const entry = MAP_SUBTITLE_TRANSLATIONS[id.toLowerCase()];
    if (entry) return entry[this.language];
    return fallback;
  }

  translateAreaName(name: string): string {
    if (this.language === 'en') return name;
    const exact = AREA_NAME_TRANSLATIONS[name] ?? AREA_NAME_TRANSLATIONS[name.toUpperCase()];
    if (exact) return exact[this.language];
    return name;
  }

  translateDoorLabel(label: string): string {
    if (this.language === 'en') return label;
    const direct = DOOR_TRANSLATIONS[label];
    if (direct) return direct[this.language];

    // Parameterized dynamic floor / unit labels
    const floorMatch = /^FLOOR (\d+) BALCONY$/i.exec(label);
    if (floorMatch) {
      return this.language === 'ar'
        ? `شرفة الطابق ${floorMatch[1]}`
        : `BALCÓN PISO ${floorMatch[1]}`;
    }
    const unitMatch = /^UNIT ([0-9]+[AB])$/i.exec(label);
    if (unitMatch) {
      return this.language === 'ar'
        ? `الوحدة ${unitMatch[1]}`
        : `UNIDAD ${unitMatch[1]}`;
    }
    const suiteMatch = /^SUITE (\d+) TERRACE$/i.exec(label);
    if (suiteMatch) {
      return this.language === 'ar'
        ? `شرفة الجناح ${suiteMatch[1]}`
        : `TERRAZA SUITE ${suiteMatch[1]}`;
    }
    const resMatch = /^RESIDENCE ([0-9]+[AB])$/i.exec(label);
    if (resMatch) {
      return this.language === 'ar'
        ? `الشقة ${resMatch[1]}`
        : `RESIDENCIA ${resMatch[1]}`;
    }
    return label;
  }

  translateSeatLabel(label: string): string {
    if (this.language === 'en') return label;
    const entry = SEAT_TRANSLATIONS[label];
    if (entry) return entry[this.language];
    return label;
  }

  translateZiplineLabel(label: string): string {
    if (this.language === 'en') return label;
    const entry = ZIPLINE_TRANSLATIONS[label];
    if (entry) return entry[this.language];
    return label;
  }

  translateFlightLabel(id: string, fallback: string): string {
    if (this.language === 'en') return fallback;
    const entry = FLIGHT_TRANSLATIONS[id];
    if (entry) return entry[this.language];
    return fallback;
  }

  // --- Ranked, Platform, Performance, Controls ---
  translateRankTier(tier: string): string {
    const key = `tier.${tier}` as TranslationKey;
    return this.t(key);
  }

  translatePlatform(platform: string): string {
    const key = `platform.${platform.toLowerCase()}` as TranslationKey;
    return this.t(key);
  }

  translatePerformanceTier(tier: PerformanceTier | string): string {
    switch (tier) {
      case 'low':
        return this.t('settings.graphics.low');
      case 'high':
        return this.t('settings.graphics.high');
      case 'medium':
        return this.t('settings.graphics.medium');
      case 'low-end-mobile':
      case 'mid-mobile':
      case 'high-end-mobile':
      case 'tablet':
      case 'low-end-pc':
      case 'mid-pc':
      case 'high-end-pc':
        return this.t(`tierPerf.${tier}` as TranslationKey);
      default:
        return tier;
    }
  }

  translateDeviceCategory(category: 'pc' | 'mobile' | 'tablet' | 'desktop'): string {
    const mapped = category === 'desktop' ? 'pc' : category;
    return this.t(`menu.device.${mapped}` as TranslationKey);
  }

  translateQualityPreset(quality: 'low' | 'medium' | 'high'): string {
    return this.t(`quality.${quality}` as TranslationKey);
  }

  translateTagline(index: number): string {
    const safeIdx = ((index % 5) + 5) % 5;
    return this.t(`tagline.${safeIdx}` as TranslationKey);
  }

  translateKeyActionLabel(action: GameAction): string {
    return this.t(`action.${action}` as TranslationKey);
  }

  translateHudSlotLabel(slotId: ControlSlotId): string {
    return this.t(`slot.${slotId}` as TranslationKey);
  }

  translateTouchActionCaption(id: HudActionSlotId, unarmedFire = false): string {
    if (id === 'fire' && unarmedFire) {
      return this.t('touch.caption.punch');
    }
    return this.t(`touch.caption.${id}` as TranslationKey);
  }

  translateBindingCode(code: string): string {
    if (code === 'Mouse0') return this.t('key.Mouse0');
    if (code === 'Mouse1') return this.t('key.Mouse1');
    if (code === 'Mouse2') return this.t('key.Mouse2');
    if (code === 'Space') return this.t('key.Space');
    if (code === 'Tab') return this.t('key.Tab');
    if (code === 'ShiftLeft' || code === 'ShiftRight') return this.t('key.Shift');
    if (code === 'ControlLeft' || code === 'ControlRight') return this.t('key.Ctrl');
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code.toUpperCase();
  }

  translateCardinal(dir: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'): string {
    return this.t(`hud.compass.${dir}` as TranslationKey);
  }

  translateDifficulty(diff: 'recruit' | 'tactical' | 'veteran' | 'elite' | 'mixed'): string {
    return this.t(`br.diff.${diff}` as TranslationKey);
  }

  translateBotDifficultyLabel(diff: 'recruit' | 'tactical' | 'veteran' | 'elite' | 'mixed'): string {
    return this.translateDifficulty(diff);
  }

  translateRangeBand(range: number): string {
    return this.t('common.metersShort', { m: Math.round(range) });
  }

  translateScopeReticle(style: string): string {
    if (this.language === 'en') return style.toUpperCase();
    const map: Record<string, LangPair> = {
      tactical: { ar: 'تكتيكي', es: 'TÁCTICA' },
      reflex: { ar: 'نقطة حمراء', es: 'RÉFLEX' },
      marksman: { ar: 'قناص خفيف', es: 'TIRADOR' },
      sniper: { ar: 'شبكة قنص', es: 'FRANCOTIRADOR' },
    };
    const entry = map[style.toLowerCase()];
    return entry ? entry[this.language] : style.toUpperCase();
  }

  translateOpticLabel(zoom: number): string {
    return this.t('hud.opticLabel', { zoom });
  }

  translateLoadingStage(rawLabel: string): string {
    const low = rawLabel.toLowerCase();
    if (low.includes('initializing core engine') || low.includes('initializing game systems')) {
      return this.t('loading.stage.core');
    }
    if (low.startsWith('calibrating ') && low.includes('profile')) {
      const tierRaw = rawLabel.slice('Calibrating '.length, rawLabel.length - ' profile...'.length).trim();
      return this.t('loading.stage.calibrating', {
        tier: this.translatePerformanceTier(tierRaw),
      });
    }
    if (low.includes('procedural pbr')) return this.t('loading.stage.pbr');
    if (low.includes('3d operators')) return this.t('loading.stage.operators');
    if (low.includes('weapon models')) return this.t('loading.stage.weapons');
    if (low.includes('military base lobby')) return this.t('loading.stage.buildingMaps');
    if (low.includes('compiling webgl shaders')) return this.t('loading.stage.shaders');
    if (low.startsWith('loading asset:')) {
      return this.t('loading.stage.asset', { name: rawLabel.slice('Loading asset:'.length).trim() });
    }
    if (low.includes('deploying tactical operator')) return this.t('loading.stage.player');
    if (low.includes('calibrating spatial audio')) return this.t('loading.stage.audio');
    if (low.includes('generating terrain')) return this.t('loading.stage.terrain');
    if (low.includes('constructing building')) return this.t('loading.stage.buildings');
    if (low.includes('placing cover')) return this.t('loading.stage.landmarks');
    if (low.includes('ready')) return this.t('loading.stage.ready');
    return rawLabel;
  }

  translateServerMessage(msg: string, code?: string): string {
    const low = msg.toLowerCase();
    if (code === 'NAME_TAKEN' || code === 'USERNAME_TAKEN' || low.includes('already taken')) {
      return this.t('api.err.nameTaken');
    }
    if (code === 'INVALID_NAME' || msg.includes('between 2 and 18') || msg.includes('2 to 18')) {
      return this.t('api.err.nameLength');
    }
    if (code === 'INVALID_TOKEN' || low.includes('invalid credential')) {
      return this.t('api.err.invalidToken');
    }
    if (low.includes('all party members must be ready')) {
      return this.t('toast.mustBeReady');
    }
    if (low.includes('only the party leader') || low.includes('only the squad leader')) {
      return this.t('toast.onlyLeaderCanStart');
    }
    if (low.includes('squad is already full')) {
      if (this.language === 'ar') return 'المجموعة مكتملة بالفعل (الحد 4 لاعبين)';
      if (this.language === 'es') return 'El grupo ya está lleno (máx. 4 jugadores)';
      return 'Party is already full (max 4 players)';
    }
    if (low.includes('friend is currently offline')) {
      if (this.language === 'ar') return 'الصديق غير متصل حالياً';
      if (this.language === 'es') return 'El amigo está desconectado';
      return 'Friend is currently offline';
    }
    if (low.includes('player is currently in a match') || low.includes('squadmate is currently in another match')) {
      if (this.language === 'ar') return 'أحد اللاعبين في مباراة حالياً';
      if (this.language === 'es') return 'Un jugador está en una partida actualmente';
      return 'Player is currently in a match';
    }
    if (low.includes('player is already in your party')) {
      if (this.language === 'ar') return 'اللاعب موجود بالفعل في مجموعتك';
      if (this.language === 'es') return 'El jugador ya está en tu grupo';
      return 'Player is already in your party';
    }
    if (low.includes('invitation already sent')) {
      if (this.language === 'ar') return 'تم إرسال الدعوة مسبقاً لهذا الصديق';
      if (this.language === 'es') return 'Ya se envió una invitación a este amigo';
      return 'Invitation already sent to this friend';
    }
    return msg;
  }

  translateCombatActor(name: string): string {
    if (this.language === 'en') return name;
    const upper = name.trim().toUpperCase();
    if (upper === 'SAFE ZONE') return this.language === 'ar' ? 'المنطقة الآمنة' : 'ZONA SEGURA';
    if (upper === 'ELIMINATED') return this.language === 'ar' ? 'الخصم' : 'COMBATE';
    if (upper === 'STORM') return this.language === 'ar' ? 'العاصفة' : 'TORMENTA';
    return name;
  }
}

export const i18n = new I18nManager();
