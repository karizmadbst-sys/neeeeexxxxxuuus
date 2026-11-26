import type { ViewportMetrics } from '../core/Types';
import { clamp } from '../utils/MathUtils';
import type { ControlSlotLayout } from './ControlSettings';

export interface VirtualJoystickValue {
  x: number;
  y: number;
  sprint: boolean;
}

export class VirtualJoystick {
  readonly element: HTMLElement;
  private readonly ringEl: HTMLElement;
  private readonly knobEl: HTMLElement;

  private centerX = 0;
  private centerY = 0;
  private radiusPx = 46;
  private currentScale = 1;

  private readonly value: VirtualJoystickValue = { x: 0, y: 0, sprint: false };

  constructor() {
    this.element = document.createElement('div');
    this.element.dataset.controlId = 'joystick';
    this.element.className =
      'absolute touch-none select-none pointer-events-auto';

    this.element.innerHTML = `
      <div
        data-role="joy-ring"
        class="relative w-28 h-28 rounded-full border border-white/35 bg-slate-950/32 flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.45)] pointer-events-none"
      >
        <div class="absolute inset-2 rounded-full border border-white/15 pointer-events-none"></div>
        <span class="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 border-x-[4px] border-x-transparent border-b-[5px] border-b-white/55"></span>
        <span class="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 border-x-[4px] border-x-transparent border-t-[5px] border-t-white/55"></span>
        <span class="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 border-y-[4px] border-y-transparent border-r-[5px] border-r-white/55"></span>
        <span class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 border-y-[4px] border-y-transparent border-l-[5px] border-l-white/55"></span>
        <div
          data-role="joy-knob"
          class="w-11 h-11 rounded-full bg-white/75 border-2 border-white shadow-[0_2px_10px_rgba(0,0,0,0.6)] will-change-transform pointer-events-none"
        ></div>
      </div>
    `;

    this.ringEl = this.element.querySelector('[data-role="joy-ring"]')!;
    this.knobEl = this.element.querySelector('[data-role="joy-knob"]')!;
  }

  applyLayout(layout: ControlSlotLayout, metrics?: ViewportMetrics): void {
    const effScale = clamp(layout.scale * (metrics ? metrics.hudScale : 1), 0.5, 1.85);
    this.currentScale = effScale;
    if (metrics) {
      const half = 56 * effScale;
      const minX = metrics.safeInsets.left + half + 4;
      const maxX = Math.max(minX, metrics.width - metrics.safeInsets.right - half - 4);
      const minY = metrics.safeInsets.top + half + 4;
      const maxY = Math.max(minY, metrics.height - metrics.safeInsets.bottom - half - 4);
      const xPx = clamp((layout.xPct / 100) * metrics.width, minX, maxX);
      const yPx = clamp((layout.yPct / 100) * metrics.height, minY, maxY);
      this.element.style.left = `${xPx.toFixed(1)}px`;
      this.element.style.top = `${yPx.toFixed(1)}px`;
    } else {
      this.element.style.left = `${layout.xPct}%`;
      this.element.style.top = `${layout.yPct}%`;
    }
    this.element.style.opacity = String(layout.opacity);
    this.element.style.display = layout.visible ? 'block' : 'none';
    this.element.style.transform = `translate3d(-50%, -50%, 0) scale(${effScale.toFixed(3)})`;
  }

  beginDrag(): void {
    const rect = this.ringEl.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.radiusPx = Math.max(24, (rect.width * 0.42));
  }

  updateDrag(clientX: number, clientY: number): VirtualJoystickValue {
    const dx = clientX - this.centerX;
    const dy = clientY - this.centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, this.radiusPx);
    const angle = Math.atan2(dy, dx);

    const knobScreenX = Math.cos(angle) * clampedDist;
    const knobScreenY = Math.sin(angle) * clampedDist;

    // Divide by element CSS scale so knob stays centered under finger
    const invScale = 1 / Math.max(0.5, this.currentScale);
    this.knobEl.style.transform = `translate3d(${knobScreenX * invScale}px, ${knobScreenY * invScale}px, 0)`;

    const norm = clampedDist / this.radiusPx;
    this.value.x = clamp(Math.cos(angle) * norm, -1, 1);
    this.value.y = clamp(-Math.sin(angle) * norm, -1, 1);
    this.value.sprint = norm > 0.88;
    return this.value;
  }

  reset(): VirtualJoystickValue {
    this.knobEl.style.transform = 'translate3d(0px, 0px, 0px)';
    this.value.x = 0;
    this.value.y = 0;
    this.value.sprint = false;
    return this.value;
  }
}
