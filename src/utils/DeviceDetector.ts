import type {
  DeviceCategory,
  DeviceProfile,
  FpsLimit,
  PerformanceTier,
  QualityPreset,
} from '../core/Types';

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

export class DeviceDetector {
  private static cachedProfile: DeviceProfile | null = null;
  private static refreshProbed = false;

  static detect(): DeviceProfile {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }

    const nav = navigator as NavigatorWithMemory;
    const ua = nav.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    const hasTouch =
      'ontouchstart' in window ||
      (nav.maxTouchPoints ?? 0) > 0 ||
      window.matchMedia('(pointer: coarse)').matches;

    const minScreenDim = Math.min(window.screen.width, window.screen.height);
    const maxScreenDim = Math.max(window.screen.width, window.screen.height);

    const isExplicitMobileUA = /Mobi|Android.*Mobile|iPhone|iPod/i.test(ua);
    const isExplicitTabletUA = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (isAndroid && !/Mobile/i.test(ua));

    let category: DeviceCategory = 'desktop';
    if (isExplicitTabletUA || (hasTouch && minScreenDim >= 600 && maxScreenDim <= 1366)) {
      category = 'tablet';
    } else if (isExplicitMobileUA || (hasTouch && minScreenDim < 600)) {
      category = 'mobile';
    }

    const isMobile = category === 'mobile';
    const isTablet = category === 'tablet';
    const isDesktop = category === 'desktop';

    const hardwareConcurrency = nav.hardwareConcurrency || 4;
    const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;

    const { isSoftwareGl, gpuRenderer, maxTextureSize } = this.probeWebGL();

    let performanceTier: PerformanceTier;
    let recommendedQuality: QualityPreset;
    let recommendedFps: FpsLimit = 60;

    if (isSoftwareGl) {
      performanceTier = isMobile ? 'low-end-mobile' : 'low-end-pc';
      recommendedQuality = 'low';
      recommendedFps = isMobile ? 30 : 60;
    } else if (isMobile) {
      const isLowEndMobile =
        hardwareConcurrency <= 4 ||
        (deviceMemoryGb !== null && deviceMemoryGb <= 3) ||
        /Mali-4|Mali-T|Adreno \(TM\) [34]|Adreno \(TM\) 5[0-3]|PowerVR|Vivante/i.test(gpuRenderer);
      const isHighEndMobileGpu =
        /Adreno.*(6[4-9]|7[0-9]{2}|8[0-9]{2})|Mali-G7[6-9]|Mali-G[67]1[05]|Mali-G720|Immortalis|Apple GPU|Apple A1[4-9]/i.test(
          gpuRenderer,
        );
      const isHighEndMobile =
        !isLowEndMobile &&
        ((hardwareConcurrency >= 8 && (deviceMemoryGb === null || deviceMemoryGb >= 6)) ||
          isHighEndMobileGpu);

      if (isLowEndMobile) {
        performanceTier = 'low-end-mobile';
        recommendedQuality = 'low';
        recommendedFps = 30;
      } else if (isHighEndMobile) {
        performanceTier = 'high-end-mobile';
        recommendedQuality = 'medium';
        recommendedFps = 60;
      } else {
        performanceTier = 'mid-mobile';
        recommendedQuality = 'medium';
        recommendedFps = 60;
      }
    } else if (isTablet) {
      performanceTier = 'tablet';
      recommendedQuality = 'medium';
      recommendedFps = 60;
    } else {
      const isHighEndGpu = /RTX|RX 6|RX 7|RX 8|Apple M[1-9]|Radeon Pro|GTX 16|GTX 10[78]|Arc A/i.test(gpuRenderer);
      const isLowEndPc =
        hardwareConcurrency <= 4 ||
        (deviceMemoryGb !== null && deviceMemoryGb <= 4) ||
        /Intel.*UHD|Intel.*HD Graphics|Mali|SwiftShader/i.test(gpuRenderer);

      if (isLowEndPc) {
        performanceTier = 'low-end-pc';
        recommendedQuality = 'low';
        recommendedFps = 60;
      } else if (isHighEndGpu && hardwareConcurrency >= 8) {
        performanceTier = 'high-end-pc';
        recommendedQuality = 'high';
        recommendedFps = 60;
      } else {
        performanceTier = 'mid-pc';
        recommendedQuality = 'medium';
        recommendedFps = 60;
      }
    }

    // Start conservatively with [30, 60] until actual display refresh rate probe confirms >60Hz support
    const supportedFpsOptions: readonly FpsLimit[] = [30, 60];

    this.cachedProfile = {
      category,
      performanceTier,
      isMobile,
      isTablet,
      isDesktop,
      hasTouch,
      isAndroid,
      isIOS,
      isSoftwareGl,
      gpuRenderer,
      hardwareConcurrency,
      deviceMemoryGb,
      maxDevicePixelRatio: isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      maxTextureSize,
      maxRefreshHz: 60,
      supportedFpsOptions,
      recommendedQuality,
      recommendedFps,
    };

    return this.cachedProfile;
  }

  /**
   * Probes actual requestAnimationFrame cadence to safely unlock 90/120 FPS modes ONLY when
   * both display refresh rate and hardware tier support higher frame pacing.
   */
  static probeSupportedRefreshRate(
    onUpdate?: (profile: DeviceProfile) => void,
  ): void {
    const profile = this.detect();
    if (this.refreshProbed) {
      onUpdate?.(profile);
      return;
    }

    // Only skip high-refresh unlock on genuinely low-end mobile GPUs
    if (profile.performanceTier === 'low-end-mobile') {
      this.refreshProbed = true;
      onUpdate?.(profile);
      return;
    }

    const deltas: number[] = [];
    let lastTs = 0;
    let warmup = 4;

    const finish = () => {
      this.refreshProbed = true;
      if (deltas.length < 10) {
        onUpdate?.(profile);
        return;
      }
      const sorted = [...deltas].sort((a, b) => a - b);
      const medianMs = sorted[Math.floor(sorted.length * 0.5)];
      const measuredHz = Math.round(1000 / Math.max(4, medianMs));

      let maxRefreshHz = 60;
      let options: readonly FpsLimit[] = [30, 60];
      if (measuredHz >= 112) {
        maxRefreshHz = 120;
        options = [30, 60, 90, 120];
      } else if (measuredHz >= 84) {
        maxRefreshHz = 90;
        options = [30, 60, 90];
      }

      const changed =
        profile.maxRefreshHz !== maxRefreshHz ||
        profile.supportedFpsOptions.length !== options.length;
      profile.maxRefreshHz = maxRefreshHz;
      profile.supportedFpsOptions = options;
      if (changed) {
        onUpdate?.(profile);
      }
    };

    const step = (ts: number) => {
      if (document.hidden) {
        lastTs = 0;
        requestAnimationFrame(step);
        return;
      }
      if (lastTs > 0) {
        const dt = ts - lastTs;
        if (warmup > 0) {
          warmup--;
        } else if (dt >= 4.0 && dt <= 35.0) {
          deltas.push(dt);
        }
      }
      lastTs = ts;
      if (deltas.length >= 24) {
        finish();
      } else {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }

  private static probeWebGL(): {
    isSoftwareGl: boolean;
    gpuRenderer: string;
    maxTextureSize: number;
  } {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
        canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
      if (!gl) {
        return { isSoftwareGl: true, gpuRenderer: 'Unavailable', maxTextureSize: 2048 };
      }

      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpuRenderer = String(gl.getParameter(param) || 'WebGL Device');
      const rawMaxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
      gl.getExtension('WEBGL_lose_context')?.loseContext();

      const isSoftwareGl =
        /SwiftShader|llvmpipe|softpipe|Microsoft Basic Render/i.test(gpuRenderer);
      return {
        isSoftwareGl,
        gpuRenderer,
        maxTextureSize: Math.max(1024, rawMaxTex),
      };
    } catch {
      return { isSoftwareGl: false, gpuRenderer: 'Probe Error', maxTextureSize: 4096 };
    }
  }
}
