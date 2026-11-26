import { isCapacitorNative, isElectronDesktop } from '../../config/RuntimeConfig';

export type AuthPlatformKind = 'web' | 'android-capacitor' | 'windows-electron';

export function detectAuthPlatform(): AuthPlatformKind {
  if (isCapacitorNative()) return 'android-capacitor';
  if (isElectronDesktop()) return 'windows-electron';
  return 'web';
}

export function getFirebaseAuthErrorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : '';
}
