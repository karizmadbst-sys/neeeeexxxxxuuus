const DEFAULT_PRODUCTION_BACKEND_URL =
  'https://ais-pre-o45j3avytqf2cxv34uusrr-658856767272.europe-west3.run.app';

export interface NexusDesktopBridge {
  isElectron: true;
  platform: string;
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
    nexusDesktop?: NexusDesktopBridge;
  }
}

function sanitizeHttpOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.Capacitor?.isNativePlatform === 'function') {
      return Boolean(window.Capacitor.isNativePlatform());
    }
  } catch {
    // Ignore global Capacitor probe errors
  }
  return window.location.protocol === 'capacitor:';
}

export function isElectronDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.nexusDesktop?.isElectron === true) return true;
  return (
    window.location.protocol === 'file:' ||
    (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron/'))
  );
}

export function isPackagedNativeApp(): boolean {
  return isCapacitorNative() || isElectronDesktop();
}

const RETIRED_BACKEND_ORIGINS = new Set([
  'https://ais-pre-6tyidv2pt6sibhftxu2mbu-884864254163.europe-west2.run.app',
  'https://ais-pre-kgjgpnjbzvdsadro4u6lnw-688318389065.europe-west3.run.app',
]);

export function getBackendHttpOrigin(): string {
  const configured = sanitizeHttpOrigin(
    typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_BACKEND_URL : undefined
  );

  if (isPackagedNativeApp()) {
    // Packaged Android APK & Windows EXE must always target the active production server, never localhost or retired origins
    if (
      configured &&
      !RETIRED_BACKEND_ORIGINS.has(configured) &&
      !configured.startsWith('http://localhost') &&
      !configured.startsWith('http://127.0.0.1') &&
      !configured.startsWith('https://localhost')
    ) {
      return configured;
    }
    return DEFAULT_PRODUCTION_BACKEND_URL;
  }

  // On web, always use same-origin relative paths so the active Express + WS host handles requests.
  return '';
}

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getBackendHttpOrigin();
  return origin ? `${origin}${normalizedPath}` : normalizedPath;
}

export function getWebSocketUrl(path = '/ws/ranked'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getBackendHttpOrigin();
  if (origin) {
    const wsOrigin = origin.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    return `${wsOrigin}${normalizedPath}`;
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${normalizedPath}`;
  }
  return `wss://${new URL(DEFAULT_PRODUCTION_BACKEND_URL).host}${normalizedPath}`;
}

export function resolvePublicAssetUrl(assetPath: string): string {
  const trimmed = assetPath.trim();
  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  const cleanRelative = trimmed.replace(/^\/+/, '');
  const base = (typeof import.meta.env !== 'undefined' ? import.meta.env.BASE_URL : undefined) || './';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${cleanRelative}`;
}
