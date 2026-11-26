import * as THREE from 'three';
import type { RendererManager } from './RendererManager';
import type { FpsLimit, Subsystem } from './Types';

export type FrameTickCallback = (deltaSeconds: number, elapsedSeconds: number) => void;
export type FpsSampleCallback = (fps: number) => void;

export interface FrameTimeStats {
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  targetFps: FpsLimit;
}

const FRAME_SAMPLE_CAPACITY = 60;

export class GameLoop implements Subsystem {
  private readonly clock = new THREE.Clock();
  private running = false;
  private paused = false;
  private frameHandle = 0;
  private isTimeoutHandle = false;

  private targetFps: FpsLimit = 60;
  private lastRenderPerfMs = 0;
  private lastRafTs = 0;
  private nativeFrameMs = 16.6667;
  private fpsAccumTime = 0;
  private fpsFrameCount = 0;
  private currentFps = 60;

  private readonly frameWorkSamples = new Float32Array(FRAME_SAMPLE_CAPACITY);
  private readonly frameWorkSortScratch = new Float32Array(FRAME_SAMPLE_CAPACITY);
  private frameWorkWriteIdx = 0;
  private frameWorkCount = 0;
  private avgFrameMs = 0;
  private p95FrameMs = 0;

  private readonly onVisibilityChangeBound = () => {
    if (document.hidden) {
      this.clock.stop();
      this.lastRenderPerfMs = 0;
      this.lastRafTs = 0;
    } else if (this.running) {
      this.clock.start();
      this.clock.getDelta(); // Discard accumulated background delta
      this.lastRenderPerfMs = performance.now();
      this.lastRafTs = 0;
    }
  };

  constructor(
    _rendererManager: RendererManager,
    private readonly onTick: FrameTickCallback,
    private readonly onFpsSample?: FpsSampleCallback,
  ) {
    document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
  }

  setTargetFps(fps: FpsLimit): void {
    this.targetFps = fps;
    this.lastRenderPerfMs = 0;
    this.fpsAccumTime = 0;
    this.fpsFrameCount = 0;
  }

  getTargetFps(): FpsLimit {
    return this.targetFps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastRenderPerfMs = 0;
    this.lastRafTs = 0;
    this.clock.start();
    this.clock.getDelta();
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.cancelScheduled();
    this.clock.stop();
    this.lastRenderPerfMs = 0;
    this.lastRafTs = 0;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused && this.running) {
      this.clock.getDelta();
      this.lastRenderPerfMs = performance.now();
    }
  }

  getFps(): number {
    return this.currentFps;
  }

  getFrameTimeStats(): FrameTimeStats {
    return {
      fps: this.currentFps,
      avgFrameMs: this.avgFrameMs,
      p95FrameMs: this.p95FrameMs,
      targetFps: this.targetFps,
    };
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.isTimeoutHandle = false;
    this.frameHandle = requestAnimationFrame((ts) => this.tick(ts));
  }

  private tick(rafTimestamp: number): void {
    if (!this.running) return;
    if (document.hidden) {
      this.scheduleNext();
      return;
    }

    if (this.lastRafTs > 0) {
      const rafDelta = rafTimestamp - this.lastRafTs;
      if (rafDelta >= 4 && rafDelta <= 36) {
        this.nativeFrameMs = this.nativeFrameMs * 0.85 + rafDelta * 0.15;
      }
    }
    this.lastRafTs = rafTimestamp;

    const now = performance.now();
    const minIntervalMs = 1000 / this.targetFps;
    // Only throttle frames when targetFps is deliberately below the display's native refresh cadence
    const shouldThrottle = minIntervalMs > this.nativeFrameMs * 1.15;
    if (shouldThrottle && this.lastRenderPerfMs > 0) {
      const slackMs = Math.min(3.0, this.nativeFrameMs * 0.32);
      const elapsedMs = now - this.lastRenderPerfMs;
      if (elapsedMs < minIntervalMs - slackMs) {
        this.scheduleNext();
        return;
      }
      const nextPhase = this.lastRenderPerfMs + minIntervalMs;
      this.lastRenderPerfMs = Math.abs(now - nextPhase) > minIntervalMs ? now : nextPhase;
    } else {
      this.lastRenderPerfMs = now;
    }

    const rawDelta = this.clock.getDelta();
    const clampedDelta = Math.min(rawDelta, 0.05);
    const elapsed = this.clock.elapsedTime;

    const workStart = performance.now();
    if (!this.paused) {
      this.onTick(clampedDelta, elapsed);
    }
    const workMs = performance.now() - workStart;

    this.frameWorkSamples[this.frameWorkWriteIdx] = workMs;
    this.frameWorkWriteIdx = (this.frameWorkWriteIdx + 1) % FRAME_SAMPLE_CAPACITY;
    if (this.frameWorkCount < FRAME_SAMPLE_CAPACITY) {
      this.frameWorkCount++;
    }

    this.fpsAccumTime += rawDelta;
    this.fpsFrameCount++;
    if (this.fpsAccumTime >= 0.5) {
      this.currentFps = Math.max(1, Math.round(this.fpsFrameCount / this.fpsAccumTime));
      this.computeFrameTimeMetrics();
      this.onFpsSample?.(this.currentFps);
      this.fpsAccumTime = 0;
      this.fpsFrameCount = 0;
    }

    this.scheduleNext();
  }

  private computeFrameTimeMetrics(): void {
    const count = this.frameWorkCount;
    if (count === 0) return;
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const v = this.frameWorkSamples[i];
      sum += v;
      this.frameWorkSortScratch[i] = v;
    }
    this.avgFrameMs = sum / count;
    this.frameWorkSortScratch.subarray(0, count).sort();
    const p95Idx = Math.min(count - 1, Math.floor(count * 0.95));
    this.p95FrameMs = this.frameWorkSortScratch[p95Idx];
  }

  private cancelScheduled(): void {
    if (!this.frameHandle) return;
    if (this.isTimeoutHandle) {
      clearTimeout(this.frameHandle);
    } else {
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = 0;
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
  }
}
