import { resolvePublicAssetUrl } from '../../config/RuntimeConfig';
import { getAvatarById, getBannerById } from '../../shop/AvatarBannerCatalog';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function hasAvatarImage(avatarId?: string | null): boolean {
  return Boolean(getAvatarById(avatarId).imageUrl);
}

export function getAvatarPreviewHtml(
  avatarId?: string | null,
  className = 'w-full h-full',
  fit: 'cover' | 'contain' = 'cover',
): string {
  const def = getAvatarById(avatarId);
  if (def.imageUrl) {
    const src = escapeAttr(resolvePublicAssetUrl(def.imageUrl));
    const alt = escapeAttr(def.name);
    const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover object-top';
    return `<img src="${src}" alt="${alt}" referrerpolicy="no-referrer" decoding="async" draggable="false" class="${className} ${fitClass} select-none block" style="background:${def.bgHex}" />`;
  }
  return getAvatarSvg(avatarId, className);
}

export function getAvatarSvg(avatarId?: string | null, className = 'w-full h-full'): string {
  const def = getAvatarById(avatarId);
  if (def.imageUrl) {
    return getAvatarPreviewHtml(avatarId, className, 'cover');
  }
  const gradId = `av-bg-${def.id}`;
  const glowId = `av-gl-${def.id}`;
  const a = def.accentHex;
  const s = def.secondaryHex;
  const bg = def.bgHex;

  let emblem = '';
  switch (def.motif) {
    case 'visor':
      emblem = `
        <path d="M26 52 L44 30 L76 30 L94 52 L88 86 L60 96 L32 86 Z" fill="${s}" stroke="${a}" stroke-width="3"/>
        <path d="M32 52 L54 58 L54 68 L34 64 Z" fill="${a}"/>
        <path d="M88 52 L66 58 L66 68 L86 64 Z" fill="${a}"/>
        <path d="M46 36 L74 36 L70 46 L50 46 Z" fill="#0f172a" stroke="${a}" stroke-width="2"/>
        <path d="M48 78 L72 78" stroke="#f8fafc" stroke-width="3" stroke-linecap="round"/>
      `;
      break;
    case 'fox':
      emblem = `
        <path d="M24 30 L48 42 L60 38 L72 42 L96 30 L88 68 L60 94 L32 68 Z" fill="${s}" stroke="${a}" stroke-width="3"/>
        <path d="M32 36 L46 45 L37 56 Z" fill="${a}" opacity="0.85"/>
        <path d="M88 36 L74 45 L83 56 Z" fill="${a}" opacity="0.85"/>
        <polygon points="40,58 53,62 46,68" fill="#fef3c7"/>
        <polygon points="80,58 67,62 74,68" fill="#fef3c7"/>
        <polygon points="55,78 65,78 60,85" fill="#0f172a"/>
      `;
      break;
    case 'oni':
      emblem = `
        <path d="M32 22 L44 40 L76 40 L88 22 L84 50 L92 66 L76 92 L44 92 L28 66 L36 50 Z" fill="${s}" stroke="${a}" stroke-width="3"/>
        <path d="M38 56 L54 62 L44 68 Z" fill="#fef08a"/>
        <path d="M82 56 L66 62 L76 68 Z" fill="#fef08a"/>
        <path d="M42 78 L50 70 L56 80 L60 72 L64 80 L70 70 L78 78" fill="none" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round"/>
      `;
      break;
    case 'valkyrie':
      emblem = `
        <path d="M18 38 L40 48 L44 26 L60 20 L76 26 L80 48 L102 38 L90 66 L76 90 L60 98 L44 90 L30 66 Z" fill="${s}" stroke="${a}" stroke-width="3"/>
        <path d="M44 52 L60 60 L76 52 L72 72 L60 78 L48 72 Z" fill="#0f172a" stroke="${a}" stroke-width="2.5"/>
        <path d="M48 60 L57 63 L52 67 Z" fill="#e0f2fe"/>
        <path d="M72 60 L63 63 L68 67 Z" fill="#e0f2fe"/>
      `;
      break;
    case 'skull':
      emblem = `
        <path d="M34 46 C34 26 86 26 86 46 L86 68 L74 78 L72 92 L48 92 L46 78 L34 68 Z" fill="#e2e8f0" stroke="${a}" stroke-width="3"/>
        <circle cx="47" cy="56" r="8" fill="#0f172a" stroke="${a}" stroke-width="2"/>
        <circle cx="73" cy="56" r="8" fill="#0f172a" stroke="${a}" stroke-width="2"/>
        <circle cx="47" cy="56" r="3" fill="${a}"/>
        <circle cx="73" cy="56" r="3" fill="${a}"/>
        <polygon points="60,64 55,73 65,73" fill="#0f172a"/>
        <path d="M52 82 V90 M60 82 V90 M68 82 V90" stroke="#0f172a" stroke-width="3"/>
      `;
      break;
    case 'eagle':
      emblem = `
        <path d="M16 40 L44 36 L60 22 L76 36 L104 40 L88 58 L94 74 L60 96 L26 74 L32 58 Z" fill="${s}" stroke="${a}" stroke-width="3"/>
        <polygon points="60,34 72,56 60,82 48,56" fill="${a}"/>
        <polygon points="36,52 50,56 44,64" fill="#fef3c7"/>
        <polygon points="84,52 70,56 76,64" fill="#fef3c7"/>
      `;
      break;
    case 'void':
      emblem = `
        <polygon points="60,20 92,46 80,92 40,92 28,46" fill="${s}" stroke="${a}" stroke-width="3"/>
        <circle cx="60" cy="44" r="7" fill="#0f172a" stroke="${a}" stroke-width="2.5"/>
        <circle cx="60" cy="44" r="3" fill="#f5d0fe"/>
        <path d="M38 62 L54 66 L44 74 Z" fill="${a}"/>
        <path d="M82 62 L66 66 L76 74 Z" fill="${a}"/>
        <path d="M48 82 L60 76 L72 82" fill="none" stroke="#f5d0fe" stroke-width="2.5"/>
      `;
      break;
    default:
      emblem = `
        <polygon points="60,22 90,38 84,80 60,96 36,80 30,38" fill="${s}" stroke="${a}" stroke-width="3"/>
        <path d="M42 52 L60 40 L78 52 L72 72 L60 80 L48 72 Z" fill="#0f172a" stroke="${a}" stroke-width="2.5"/>
        <path d="M46 58 H74" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
      `;
      break;
  }

  return `<svg viewBox="0 0 120 120" class="${className}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="${s}" stop-opacity="0.85"/>
      </linearGradient>
      <radialGradient id="${glowId}" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="${a}" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="${a}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="120" height="120" rx="14" fill="url(#${gradId})"/>
    <circle cx="60" cy="56" r="48" fill="url(#${glowId})"/>
    <path d="M10 24 L24 10 M96 10 L110 24 M10 96 L24 110 M96 110 L110 96" stroke="${a}" stroke-width="2" opacity="0.5"/>
    ${emblem}
  </svg>`;
}

export function hasBannerImage(bannerId?: string | null): boolean {
  return Boolean(getBannerById(bannerId).imageUrl);
}

export function getBannerPreviewHtml(
  bannerId?: string | null,
  className = 'w-full h-full',
  fit: 'cover' | 'contain' = 'cover',
): string {
  const def = getBannerById(bannerId);
  if (def.imageUrl) {
    const src = escapeAttr(resolvePublicAssetUrl(def.imageUrl));
    const alt = escapeAttr(def.name);
    const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover object-center';
    return `<img src="${src}" alt="${alt}" referrerpolicy="no-referrer" decoding="async" draggable="false" class="${className} ${fitClass} select-none block" style="background:${def.bgStartHex}" />`;
  }
  return getBannerSvg(bannerId, className);
}

export function getBannerSvg(bannerId?: string | null, className = 'w-full h-full'): string {
  const def = getBannerById(bannerId);
  if (def.imageUrl) {
    return getBannerPreviewHtml(bannerId, className, 'cover');
  }
  const gradId = `bn-bg-${def.id}`;
  const accGrad = `bn-ac-${def.id}`;
  const a = def.accentHex;
  const c1 = def.bgStartHex;
  const c2 = def.bgEndHex;

  let artwork = '';
  switch (def.pattern) {
    case 'hazard':
      artwork = `
        <polygon points="280,0 325,0 265,120 220,120" fill="${a}" opacity="0.22"/>
        <polygon points="345,0 390,0 330,120 285,120" fill="${a}" opacity="0.32"/>
        <polygon points="410,0 455,0 395,120 350,120" fill="${a}" opacity="0.18"/>
        <path d="M18 96 H220" stroke="${a}" stroke-width="3" stroke-dasharray="14 8" opacity="0.65"/>
      `;
      break;
    case 'frost':
      artwork = `
        <polygon points="250,120 330,22 395,120" fill="${a}" opacity="0.18"/>
        <polygon points="335,120 415,12 480,120" fill="${a}" opacity="0.28"/>
        <polygon points="180,120 250,48 310,120" fill="#e0f2fe" opacity="0.12"/>
        <path d="M295 54 L330 22 L352 60 M390 44 L415 12 L442 52" fill="none" stroke="#e0f2fe" stroke-width="2" opacity="0.5"/>
      `;
      break;
    case 'circuit':
      artwork = `
        <path d="M200 32 H310 L335 56 H455 M240 84 H340 L365 62 H465 M270 104 H390 L412 82 H475" fill="none" stroke="${a}" stroke-width="2.5" opacity="0.55"/>
        <circle cx="310" cy="32" r="4" fill="${a}"/>
        <circle cx="365" cy="62" r="4" fill="${a}"/>
        <circle cx="412" cy="82" r="4" fill="#e0f2fe"/>
        <circle cx="240" cy="84" r="3.5" fill="${a}"/>
      `;
      break;
    case 'dragon':
      artwork = `
        <path d="M250 112 C290 66 350 40 460 18 C400 50 375 84 445 102 C380 98 320 96 250 112 Z" fill="${a}" opacity="0.34"/>
        <path d="M290 22 L385 95 M335 16 L430 88 M385 12 L465 72" stroke="#fca5a5" stroke-width="3" opacity="0.45"/>
      `;
      break;
    case 'horizon':
      artwork = `
        <circle cx="385" cy="56" r="38" fill="#090514" stroke="${a}" stroke-width="3"/>
        <ellipse cx="385" cy="60" rx="74" ry="14" fill="none" stroke="${a}" stroke-width="2" opacity="0.7" transform="rotate(-14 385 60)"/>
        <circle cx="240" cy="28" r="2" fill="#f5d0fe" opacity="0.8"/>
        <circle cx="300" cy="82" r="2" fill="#f5d0fe" opacity="0.6"/>
        <circle cx="445" cy="24" r="2.5" fill="#f5d0fe" opacity="0.8"/>
      `;
      break;
    case 'solar':
      artwork = `
        <circle cx="395" cy="60" r="34" fill="${a}" opacity="0.35"/>
        <circle cx="395" cy="60" r="20" fill="#fef3c7" opacity="0.65"/>
        <polygon points="395,60 220,0 280,0" fill="${a}" opacity="0.16"/>
        <polygon points="395,60 230,120 300,120" fill="${a}" opacity="0.16"/>
        <polygon points="395,60 480,10 480,46" fill="${a}" opacity="0.22"/>
      `;
      break;
    case 'crown':
      artwork = `
        <path d="M335 84 L345 36 L372 58 L395 26 L418 58 L445 36 L455 84 Z" fill="${a}" opacity="0.35" stroke="${a}" stroke-width="2.5"/>
        <rect x="335" y="90" width="120" height="8" rx="3" fill="${a}" opacity="0.55"/>
        <path d="M220 0 L280 120 M250 0 L310 120" stroke="${a}" stroke-width="2" opacity="0.28"/>
      `;
      break;
    default:
      artwork = `
        <path d="M280 0 L340 120 M330 0 L390 120 M380 0 L440 120" stroke="${a}" stroke-width="1.5" opacity="0.22"/>
        <polygon points="388,28 424,48 424,78 388,96 352,78 352,48" fill="none" stroke="${a}" stroke-width="2" opacity="0.45"/>
      `;
      break;
  }

  return `<svg viewBox="0 0 480 120" preserveAspectRatio="xMidYMid slice" class="${className}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="65%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c1}"/>
      </linearGradient>
      <linearGradient id="${accGrad}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${a}" stop-opacity="0.8"/>
        <stop offset="60%" stop-color="${a}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${a}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="480" height="120" fill="url(#${gradId})"/>
    ${artwork}
    <rect x="0" y="0" width="480" height="3" fill="url(#${accGrad})"/>
    <rect x="0" y="117" width="480" height="3" fill="url(#${accGrad})"/>
  </svg>`;
}
