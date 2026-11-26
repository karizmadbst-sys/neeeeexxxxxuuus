import * as THREE from 'three';
import type { Subsystem } from './Types';

export interface LoadingProgress {
  progress: number; // 0 to 1
  label: string;
  completedTasks: number;
  totalTasks: number;
}

export type LoadingProgressListener = (state: LoadingProgress) => void;

export interface BootstrapTask {
  id: string;
  label: string;
  weight?: number;
  run: () => Promise<void> | void;
}

export class LoadingManager implements Subsystem {
  readonly threeManager: THREE.LoadingManager;
  private listeners = new Set<LoadingProgressListener>();
  private currentProgress = 0;
  private currentLabel = 'Initializing core engine...';
  private disposed = false;

  constructor() {
    this.threeManager = new THREE.LoadingManager();
    this.threeManager.onError = (url) => {
      console.warn(`[LoadingManager] Asset failed to load: ${url}`);
    };
  }

  onProgress(listener: LoadingProgressListener): () => void {
    this.listeners.add(listener);
    listener({
      progress: this.currentProgress,
      label: this.currentLabel,
      completedTasks: 0,
      totalTasks: 1,
    });
    return () => this.listeners.delete(listener);
  }

  async runPipeline(tasks: BootstrapTask[]): Promise<void> {
    if (tasks.length === 0) {
      this.emitProgress(1, 'Ready', 1, 1);
      return;
    }

    const totalWeight = tasks.reduce((sum, t) => sum + (t.weight ?? 1), 0);
    let completedWeight = 0;

    // Yield once before task 0 so the LoadingScreen paints cleanly before heavy work starts
    this.emitProgress(0, tasks[0].label, 0, tasks.length);
    await this.yieldFrame();
    let lastYieldMs = performance.now();

    for (let i = 0; i < tasks.length; i++) {
      if (this.disposed) return;
      const task = tasks[i];
      const weight = task.weight ?? 1;
      this.emitProgress(completedWeight / totalWeight, task.label, i, tasks.length);

      if (i > 0 && performance.now() - lastYieldMs >= 14) {
        await this.yieldFrame();
        lastYieldMs = performance.now();
      }

      const taskStart = performance.now();
      await task.run();
      if (performance.now() - taskStart >= 14) {
        lastYieldMs = performance.now() - 16;
      }

      completedWeight += weight;
      this.emitProgress(
        Math.min(1, completedWeight / totalWeight),
        task.label,
        i + 1,
        tasks.length,
      );
    }

    this.emitProgress(1, 'Deployment ready', tasks.length, tasks.length);
  }

  private emitProgress(
    progress: number,
    label: string,
    completedTasks: number,
    totalTasks: number,
  ): void {
    this.currentProgress = progress;
    this.currentLabel = label;
    const snapshot: LoadingProgress = {
      progress,
      label,
      completedTasks,
      totalTasks,
    };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private yieldFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
