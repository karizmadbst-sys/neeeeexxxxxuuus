import type { MapId } from '../maps/IMapSystem';

export type ScreenId =
  | 'loading'
  | 'auth'
  | 'login-loading'
  | 'main-menu'
  | 'map-select'
  | 'battle-royale'
  | 'ranked'
  | 'characters'
  | 'pets'
  | 'vault'
  | 'shop'
  | 'settings'
  | 'control-editor'
  | 'test-arena';

export type GamePhaseState =
  | 'booting'
  | 'loading'
  | 'menu'
  | 'test-arena'
  | 'paused';

export type LobbyGameMode = 'battle-royale' | 'ranked' | 'practice';

export type QualityPreset = 'low' | 'medium' | 'high';

export type FpsLimit = 30 | 60 | 90 | 120;

export type DeviceCategory = 'mobile' | 'tablet' | 'desktop';

export type PerformanceTier =
  | 'low-end-mobile'
  | 'mid-mobile'
  | 'high-end-mobile'
  | 'tablet'
  | 'low-end-pc'
  | 'mid-pc'
  | 'high-end-pc';

export type OrientationMode = 'portrait' | 'landscape';

export interface DeviceProfile {
  category: DeviceCategory;
  performanceTier: PerformanceTier;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  hasTouch: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isSoftwareGl: boolean;
  gpuRenderer: string;
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
  maxDevicePixelRatio: number;
  maxTextureSize: number;
  maxRefreshHz: number;
  supportedFpsOptions: readonly FpsLimit[];
  recommendedQuality: QualityPreset;
  recommendedFps: FpsLimit;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ScreenSizeTier = 'small' | 'medium' | 'large' | 'xlarge';

export type AspectBand = 'standard' | '16:9' | '18:9' | '19.5:9' | '20:9' | 'ultrawide';

export interface ViewportMetrics {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: OrientationMode;
  pixelRatio: number;
  isCompactWidth: boolean;
  isCompactHeight: boolean;
  screenTier: ScreenSizeTier;
  aspectBand: AspectBand;
  hudScale: number;
  safeInsets: SafeAreaInsets;
}

export interface GraphicsSettings {
  quality: QualityPreset;
  fpsLimit: FpsLimit;
  shadowsEnabled: boolean;
  pixelRatioCap: number;
  antialias: boolean;
  showFps: boolean;
}

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  muted: boolean;
  musicMuted: boolean;
}

export type GlooWallPlacementMode = 'auto' | 'manual';

export interface ControlSettings {
  lookSensitivity: number;
  adsSensitivity: number;
  aimStability: number;
  invertY: boolean;
  touchControlsEnabled: 'auto' | 'always' | 'off';
  aimAssistStrength: number;
  glooPlacementMode: GlooWallPlacementMode;
}

export type AppLanguage = 'en' | 'ar' | 'es';

export interface GameSettings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  selectedMapId: MapId;
  language: AppLanguage;
}

export type CameraPresetId =
  | 'menu-orbit'
  | 'characters-showcase'
  | 'pets-showcase'
  | 'shop-showcase'
  | 'arena-orbit'
  | 'arena-roam';

export interface Subsystem {
  dispose(): void;
}

export interface Updatable {
  update(deltaSeconds: number, elapsedSeconds: number): void;
}

export const NEXUS_TAGLINES: readonly string[] = [
  '100 fighters... only one survivor.',
  'Drop, gear up, and stay alive.',
  'The circle shrinks. The terrain changes.',
  'There is nowhere to hide. Fight until the end.',
  'Write your legend on the ruins of your enemies.',
] as const;
