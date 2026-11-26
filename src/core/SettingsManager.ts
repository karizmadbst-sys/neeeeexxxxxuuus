import type { MapId } from '../maps/IMapSystem';
import type {
  AppLanguage,
  DeviceProfile,
  FpsLimit,
  GameSettings,
  GlooWallPlacementMode,
  QualityPreset,
  Subsystem,
} from './Types';

const STORAGE_KEY = 'nexus_royale_settings_v1';
const VALID_MAP_IDS: readonly MapId[] = ['desert', 'forest', 'snow'];
const VALID_LANGUAGES: readonly AppLanguage[] = ['en', 'ar', 'es'];

function isValidMapId(value: unknown): value is MapId {
  return typeof value === 'string' && (VALID_MAP_IDS as readonly string[]).includes(value);
}

function isValidLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (VALID_LANGUAGES as readonly string[]).includes(value);
}

export type SettingsListener = (settings: GameSettings) => void;

export class SettingsManager implements Subsystem {
  private settings: GameSettings;
  private listeners = new Set<SettingsListener>();
  private requestedSavedFps: number | null = null;

  constructor(private readonly deviceProfile: DeviceProfile) {
    this.settings = this.loadOrCreateDefaults();
  }

  getSettings(): GameSettings {
    return this.settings;
  }

  onChange(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clampFpsLimit(requested: unknown): FpsLimit {
    const supported = this.deviceProfile.supportedFpsOptions;
    const numeric = typeof requested === 'number' ? requested : Number(requested);
    if (!Number.isFinite(numeric)) {
      return this.deviceProfile.recommendedFps;
    }
    let best: FpsLimit = supported[0] ?? 30;
    for (let i = 0; i < supported.length; i++) {
      const opt = supported[i];
      if (opt === numeric) return opt;
      if (opt < numeric) best = opt;
    }
    return best;
  }

  reconcileWithDeviceCapabilities(): void {
    const targetFps = this.requestedSavedFps ?? this.settings.graphics.fpsLimit;
    this.requestedSavedFps = null;
    const clampedFps = this.clampFpsLimit(targetFps);
    if (clampedFps !== this.settings.graphics.fpsLimit) {
      this.update({ graphics: { fpsLimit: clampedFps } });
    } else {
      for (const listener of this.listeners) {
        listener(this.settings);
      }
    }
  }

  applyQualityPreset(preset: QualityPreset): void {
    const presetConfig = this.buildGraphicsForPreset(preset);
    this.update({
      graphics: {
        ...this.settings.graphics,
        ...presetConfig,
      },
    });
  }

  update(partial: {
    graphics?: Partial<GameSettings['graphics']>;
    audio?: Partial<GameSettings['audio']>;
    controls?: Partial<GameSettings['controls']>;
    selectedMapId?: MapId;
    language?: AppLanguage;
  }): void {
    const mergedGraphics = { ...this.settings.graphics, ...partial.graphics };
    mergedGraphics.fpsLimit = this.clampFpsLimit(mergedGraphics.fpsLimit);
    mergedGraphics.pixelRatioCap = Math.max(0.75, Math.min(2.0, mergedGraphics.pixelRatioCap));

    const mergedAudio = { ...this.settings.audio, ...partial.audio };
    mergedAudio.masterVolume = Math.max(0, Math.min(1, Number.isFinite(mergedAudio.masterVolume) ? mergedAudio.masterVolume : 0.65));
    mergedAudio.musicVolume = Math.max(0, Math.min(1, Number.isFinite(mergedAudio.musicVolume) ? mergedAudio.musicVolume : 0.65));
    mergedAudio.muted = Boolean(mergedAudio.muted);
    mergedAudio.musicMuted = Boolean(mergedAudio.musicMuted);

    const defaults = this.createDefaults();
    const rawControls = { ...this.settings.controls, ...partial.controls };
    const mergedControls = this.sanitizeControls(rawControls, defaults.controls);

    this.settings = {
      graphics: mergedGraphics,
      audio: mergedAudio,
      controls: mergedControls,
      selectedMapId: isValidMapId(partial.selectedMapId)
        ? partial.selectedMapId
        : this.settings.selectedMapId,
      language: isValidLanguage(partial.language)
        ? partial.language
        : this.settings.language,
    };
    this.persist();
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }

  resetAimSensitivityDefaults(): void {
    const defaultControls = this.createDefaults().controls;
    this.update({
      controls: {
        lookSensitivity: defaultControls.lookSensitivity,
        adsSensitivity: defaultControls.adsSensitivity,
        aimStability: defaultControls.aimStability,
      },
    });
  }

  resetToDefaults(): void {
    const preservedLanguage = this.settings.language;
    this.settings = {
      ...this.createDefaults(),
      language: preservedLanguage,
    };
    this.persist();
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }

  exportCloudSettings(): Record<string, unknown> {
    return {
      graphics: { ...this.settings.graphics },
      audio: { ...this.settings.audio },
      controls: { ...this.settings.controls },
      selectedMapId: this.settings.selectedMapId,
      language: this.settings.language,
    };
  }

  applyCloudSettings(raw?: Record<string, unknown> | null): void {
    if (!raw || typeof raw !== 'object') return;
    const defaults = this.createDefaults();
    const rawGraphics =
      raw.graphics && typeof raw.graphics === 'object'
        ? (raw.graphics as Partial<GameSettings['graphics']>)
        : undefined;
    const rawAudio =
      raw.audio && typeof raw.audio === 'object'
        ? (raw.audio as Partial<GameSettings['audio']>)
        : undefined;
    const rawControls =
      raw.controls && typeof raw.controls === 'object'
        ? (raw.controls as Partial<GameSettings['controls']>)
        : undefined;

    const mergedGraphics = { ...this.settings.graphics, ...(rawGraphics || {}) };
    mergedGraphics.fpsLimit = this.clampFpsLimit(mergedGraphics.fpsLimit);
    mergedGraphics.pixelRatioCap =
      typeof mergedGraphics.pixelRatioCap === 'number' && Number.isFinite(mergedGraphics.pixelRatioCap)
        ? Math.max(0.75, Math.min(2.0, mergedGraphics.pixelRatioCap))
        : defaults.graphics.pixelRatioCap;

    const mergedAudio = { ...this.settings.audio, ...(rawAudio || {}) };
    mergedAudio.masterVolume =
      typeof mergedAudio.masterVolume === 'number' && Number.isFinite(mergedAudio.masterVolume)
        ? Math.max(0, Math.min(1, mergedAudio.masterVolume))
        : defaults.audio.masterVolume;
    mergedAudio.musicVolume =
      typeof mergedAudio.musicVolume === 'number' && Number.isFinite(mergedAudio.musicVolume)
        ? Math.max(0, Math.min(1, mergedAudio.musicVolume))
        : defaults.audio.musicVolume;
    mergedAudio.muted = Boolean(mergedAudio.muted);
    mergedAudio.musicMuted = Boolean(mergedAudio.musicMuted);

    const mergedControls = this.sanitizeControls(
      { ...this.settings.controls, ...(rawControls || {}) },
      defaults.controls,
    );

    this.settings = {
      graphics: mergedGraphics,
      audio: mergedAudio,
      controls: mergedControls,
      selectedMapId: isValidMapId(raw.selectedMapId) ? raw.selectedMapId : this.settings.selectedMapId,
      language: isValidLanguage(raw.language) ? raw.language : this.settings.language,
    };
    this.persist();
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }

  private buildGraphicsForPreset(preset: QualityPreset): GameSettings['graphics'] {
    const isSoftware = this.deviceProfile.isSoftwareGl;
    const tier = this.deviceProfile.performanceTier;
    const isMobileOrTablet =
      this.deviceProfile.isMobile || this.deviceProfile.isAndroid || this.deviceProfile.isTablet;
    const currentFps = this.clampFpsLimit(
      this.settings?.graphics.fpsLimit ?? this.deviceProfile.recommendedFps,
    );
    const showFps = this.settings?.graphics.showFps ?? true;

    switch (preset) {
      case 'low':
        return {
          quality: 'low',
          fpsLimit: currentFps,
          shadowsEnabled: false,
          pixelRatioCap: isSoftware ? 0.75 : tier === 'low-end-mobile' ? 0.75 : isMobileOrTablet ? 0.85 : 1.0,
          antialias: false,
          showFps,
        };
      case 'medium':
        return {
          quality: 'medium',
          fpsLimit: currentFps,
          shadowsEnabled: !isSoftware && tier !== 'low-end-mobile',
          pixelRatioCap: isSoftware ? 0.85 : isMobileOrTablet ? 1.0 : 1.5,
          antialias: !isSoftware,
          showFps,
        };
      case 'high':
        return {
          quality: 'high',
          fpsLimit: currentFps,
          shadowsEnabled: !isSoftware,
          pixelRatioCap: isSoftware
            ? 1.0
            : tier === 'high-end-mobile'
              ? 1.5
              : isMobileOrTablet
                ? 1.25
                : 2.0,
          antialias: !isSoftware,
          showFps,
        };
    }
  }

  private createDefaults(): GameSettings {
    const quality = this.deviceProfile.recommendedQuality;
    const isSoftware = this.deviceProfile.isSoftwareGl;
    const tier = this.deviceProfile.performanceTier;
    const isMobileOrTablet =
      this.deviceProfile.isMobile || this.deviceProfile.isAndroid || this.deviceProfile.isTablet;
    const defaultFps = this.clampFpsLimit(this.deviceProfile.recommendedFps);

    return {
      graphics: {
        quality,
        fpsLimit: defaultFps,
        shadowsEnabled: !isSoftware && quality !== 'low' && tier !== 'low-end-mobile',
        pixelRatioCap: isSoftware
          ? 0.85
          : quality === 'high'
            ? tier === 'high-end-mobile'
              ? 1.5
              : isMobileOrTablet
                ? 1.25
                : 2.0
            : quality === 'medium'
              ? isMobileOrTablet
                ? 1.0
                : 1.5
              : tier === 'low-end-mobile'
                ? 0.75
                : isMobileOrTablet
                  ? 0.85
                  : 1.0,
        antialias: !isSoftware && quality !== 'low',
        showFps: true,
      },
      audio: {
        masterVolume: 0.65,
        musicVolume: 0.65,
        muted: false,
        musicMuted: false,
      },
      controls: {
        lookSensitivity: this.deviceProfile.isMobile || this.deviceProfile.isTablet ? 1.15 : 1.0,
        adsSensitivity: 1.0,
        aimStability: 0.5,
        invertY: false,
        touchControlsEnabled: 'auto',
        aimAssistStrength: this.deviceProfile.isMobile || this.deviceProfile.isTablet ? 0.65 : 0.45,
        glooPlacementMode: 'auto',
      },
      selectedMapId: 'desert',
      language: 'en',
    };
  }

  private sanitizeControls(
    raw: GameSettings['controls'],
    defaults: GameSettings['controls'],
  ): GameSettings['controls'] {
    const lookSensitivity =
      typeof raw.lookSensitivity === 'number' && Number.isFinite(raw.lookSensitivity)
        ? Math.max(0.3, Math.min(2.5, raw.lookSensitivity))
        : defaults.lookSensitivity;
    const adsSensitivity =
      typeof raw.adsSensitivity === 'number' && Number.isFinite(raw.adsSensitivity)
        ? Math.max(0.3, Math.min(2.5, raw.adsSensitivity))
        : defaults.adsSensitivity;
    const aimStability =
      typeof raw.aimStability === 'number' && Number.isFinite(raw.aimStability)
        ? Math.max(0, Math.min(1, raw.aimStability))
        : defaults.aimStability;
    const aimAssistStrength =
      typeof raw.aimAssistStrength === 'number' && Number.isFinite(raw.aimAssistStrength)
        ? Math.max(0, Math.min(1, raw.aimAssistStrength))
        : defaults.aimAssistStrength;
    const touchControlsEnabled =
      raw.touchControlsEnabled === 'auto' ||
      raw.touchControlsEnabled === 'always' ||
      raw.touchControlsEnabled === 'off'
        ? raw.touchControlsEnabled
        : defaults.touchControlsEnabled;

    const glooPlacementMode: GlooWallPlacementMode =
      raw.glooPlacementMode === 'manual' || raw.glooPlacementMode === 'auto'
        ? raw.glooPlacementMode
        : defaults.glooPlacementMode;

    return {
      lookSensitivity,
      adsSensitivity,
      aimStability,
      invertY: Boolean(raw.invertY),
      touchControlsEnabled,
      aimAssistStrength,
      glooPlacementMode,
    };
  }

  private loadOrCreateDefaults(): GameSettings {
    const defaults = this.createDefaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      const mergedControls = this.sanitizeControls(
        { ...defaults.controls, ...(parsed.controls || {}) },
        defaults.controls,
      );
      const mergedGraphics = { ...defaults.graphics, ...(parsed.graphics || {}) };
      if (typeof mergedGraphics.fpsLimit === 'number' && Number.isFinite(mergedGraphics.fpsLimit)) {
        this.requestedSavedFps = mergedGraphics.fpsLimit;
      }
      mergedGraphics.fpsLimit = this.clampFpsLimit(mergedGraphics.fpsLimit);
      if (typeof mergedGraphics.pixelRatioCap !== 'number' || Number.isNaN(mergedGraphics.pixelRatioCap)) {
        mergedGraphics.pixelRatioCap = defaults.graphics.pixelRatioCap;
      } else {
        mergedGraphics.pixelRatioCap = Math.max(0.75, Math.min(2.0, mergedGraphics.pixelRatioCap));
      }
      const mergedAudio = { ...defaults.audio, ...(parsed.audio || {}) };
      if (typeof mergedAudio.masterVolume !== 'number' || Number.isNaN(mergedAudio.masterVolume)) {
        mergedAudio.masterVolume = defaults.audio.masterVolume;
      } else {
        mergedAudio.masterVolume = Math.max(0, Math.min(1, mergedAudio.masterVolume));
      }
      if (typeof mergedAudio.musicVolume !== 'number' || Number.isNaN(mergedAudio.musicVolume)) {
        mergedAudio.musicVolume = defaults.audio.musicVolume;
      } else {
        mergedAudio.musicVolume = Math.max(0, Math.min(1, mergedAudio.musicVolume));
      }
      mergedAudio.muted = Boolean(mergedAudio.muted);
      mergedAudio.musicMuted = Boolean(mergedAudio.musicMuted);

      return {
        graphics: mergedGraphics,
        audio: mergedAudio,
        controls: mergedControls,
        selectedMapId: isValidMapId(parsed.selectedMapId)
          ? parsed.selectedMapId
          : defaults.selectedMapId,
        language: isValidLanguage(parsed.language)
          ? parsed.language
          : defaults.language,
      };
    } catch {
      return defaults;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage quota errors in restricted webviews
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
