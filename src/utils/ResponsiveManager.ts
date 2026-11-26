import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { isCapacitorNative } from '../config/RuntimeConfig';
import type {
  AspectBand,
  OrientationMode,
  SafeAreaInsets,
  ScreenSizeTier,
  Subsystem,
  ViewportMetrics,
} from '../core/Types';
import { clamp } from './MathUtils';

export type ViewportChangeListener = (metrics: ViewportMetrics) => void;

export async function initNativeViewportChrome(): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.hide();
  } catch {
    // Ignore on unsupported web/emulated environments
  }
}

export async function tryLockLandscapeFullscreen(requestFs = false): Promise<void> {
  if (isCapacitorNative()) {
    try {
      await StatusBar.hide();
    } catch {
      // Ignore
    }
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
    } catch {
      // Fallback to Web Screen Orientation API below
    }
  }

  if (requestFs && !document.fullscreenElement && !isCapacitorNative()) {
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (typeof docEl.requestFullscreen === 'function') {
        await docEl.requestFullscreen();
      } else if (typeof docEl.webkitRequestFullscreen === 'function') {
        docEl.webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen may be blocked outside direct user gesture or on iOS Safari
    }
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape' | 'landscape-primary' | 'landscape-secondary') => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    // Orientation lock is unsupported in some browsers/desktop environments
  }
}

export class ResponsiveManager implements Subsystem {
  private metrics: ViewportMetrics;
  private listeners = new Set<ViewportChangeListener>();
  private resizeRaf = 0;
  private safeProbeEl: HTMLDivElement | null = null;

  private readonly handleResizeBound = () => {
    this.recompute();
    if (this.resizeRaf) {
      cancelAnimationFrame(this.resizeRaf);
    }
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.recompute();
    });
  };

  constructor() {
    this.ensureSafeAreaProbe();
    this.metrics = this.measure();
    this.applyBodyAttributes(this.metrics);
    window.addEventListener('resize', this.handleResizeBound, { passive: true });
    window.addEventListener('orientationchange', this.handleResizeBound, { passive: true });
    window.visualViewport?.addEventListener('resize', this.handleResizeBound, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.handleResizeBound, { passive: true });
    screen.orientation?.addEventListener?.('change', this.handleResizeBound);
  }

  getMetrics(): ViewportMetrics {
    return this.metrics;
  }

  onChange(listener: ViewportChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recompute(): void {
    const next = this.measure();
    const prev = this.metrics;
    const changed =
      next.width !== prev.width ||
      next.height !== prev.height ||
      next.orientation !== prev.orientation ||
      next.pixelRatio !== prev.pixelRatio ||
      next.screenTier !== prev.screenTier ||
      next.aspectBand !== prev.aspectBand ||
      next.safeInsets.top !== prev.safeInsets.top ||
      next.safeInsets.right !== prev.safeInsets.right ||
      next.safeInsets.bottom !== prev.safeInsets.bottom ||
      next.safeInsets.left !== prev.safeInsets.left;

    this.metrics = next;
    this.applyBodyAttributes(next);
    if (changed) {
      for (const listener of this.listeners) {
        listener(this.metrics);
      }
    }
  }

  private ensureSafeAreaProbe(): void {
    if (this.safeProbeEl || typeof document === 'undefined' || !document.body) return;
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = [
      'position:fixed',
      'left:-9999px',
      'top:-9999px',
      'width:0',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top, 0px)',
      'padding-right:env(safe-area-inset-right, 0px)',
      'padding-bottom:env(safe-area-inset-bottom, 0px)',
      'padding-left:env(safe-area-inset-left, 0px)',
    ].join(';');
    document.body.appendChild(el);
    this.safeProbeEl = el;
  }

  private readSafeInsets(): SafeAreaInsets {
    this.ensureSafeAreaProbe();
    if (!this.safeProbeEl) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const cs = window.getComputedStyle(this.safeProbeEl);
    return {
      top: Math.max(0, Math.round(parseFloat(cs.paddingTop) || 0)),
      right: Math.max(0, Math.round(parseFloat(cs.paddingRight) || 0)),
      bottom: Math.max(0, Math.round(parseFloat(cs.paddingBottom) || 0)),
      left: Math.max(0, Math.round(parseFloat(cs.paddingLeft) || 0)),
    };
  }

  private classifyScreenTier(width: number, height: number): ScreenSizeTier {
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    if (shortEdge < 375 || longEdge < 640) return 'small';
    if (shortEdge < 410 || longEdge < 800) return 'medium';
    if (shortEdge < 480 || longEdge < 1000) return 'large';
    return 'xlarge';
  }

  private classifyAspectBand(width: number, height: number): AspectBand {
    const normalizedRatio = Math.max(width, height) / Math.max(1, Math.min(width, height));
    if (normalizedRatio < 1.65) return 'standard';
    if (normalizedRatio < 1.88) return '16:9';
    if (normalizedRatio < 2.08) return '18:9';
    if (normalizedRatio < 2.19) return '19.5:9';
    if (normalizedRatio < 2.28) return '20:9';
    return 'ultrawide';
  }

  private measure(): ViewportMetrics {
    const vv = window.visualViewport;
    const width = Math.max(1, Math.round(vv?.width ?? window.innerWidth));
    const height = Math.max(1, Math.round(vv?.height ?? window.innerHeight));
    const orientation: OrientationMode = width >= height ? 'landscape' : 'portrait';
    const safeInsets = this.readSafeInsets();
    const screenTier = this.classifyScreenTier(width, height);
    const aspectBand = this.classifyAspectBand(width, height);

    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    const hudScale =
      screenTier === 'xlarge'
        ? 1
        : Number(clamp(Math.min(shortEdge / 412, longEdge / 844), 0.74, 1.08).toFixed(3));

    return {
      width,
      height,
      aspectRatio: width / height,
      orientation,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      isCompactWidth: width < 640,
      isCompactHeight: height < 520,
      screenTier,
      aspectBand,
      hudScale,
      safeInsets,
    };
  }

  private applyBodyAttributes(metrics: ViewportMetrics): void {
    const root = document.documentElement;
    root.dataset.orientation = metrics.orientation;
    root.dataset.compactWidth = String(metrics.isCompactWidth);
    root.dataset.compactHeight = String(metrics.isCompactHeight);
    root.dataset.compactLandscape = String(
      metrics.orientation === 'landscape' && metrics.height < 500,
    );
    root.dataset.compactPortrait = String(
      metrics.orientation === 'portrait' && metrics.width < 640,
    );
    root.dataset.screenTier = metrics.screenTier;
    root.dataset.aspectBand = metrics.aspectBand;

    root.style.setProperty('--app-vw', `${metrics.width}px`);
    root.style.setProperty('--app-vh', `${metrics.height}px`);
    root.style.setProperty('--hud-scale', String(metrics.hudScale));
    root.style.setProperty('--safe-top', `${metrics.safeInsets.top}px`);
    root.style.setProperty('--safe-right', `${metrics.safeInsets.right}px`);
    root.style.setProperty('--safe-bottom', `${metrics.safeInsets.bottom}px`);
    root.style.setProperty('--safe-left', `${metrics.safeInsets.left}px`);
  }

  dispose(): void {
    if (this.resizeRaf) {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = 0;
    }
    window.removeEventListener('resize', this.handleResizeBound);
    window.removeEventListener('orientationchange', this.handleResizeBound);
    window.visualViewport?.removeEventListener('resize', this.handleResizeBound);
    window.visualViewport?.removeEventListener('scroll', this.handleResizeBound);
    screen.orientation?.removeEventListener?.('change', this.handleResizeBound);
    this.safeProbeEl?.remove();
    this.safeProbeEl = null;
    this.listeners.clear();
  }
}
