import * as THREE from 'three';

interface DamageNumberSlot {
  el: HTMLDivElement;
  valueEl: HTMLSpanElement;
  badgeEl: HTMLSpanElement;
  active: boolean;
  worldPos: THREE.Vector3;
  age: number;
  duration: number;
  isHeadshot: boolean;
  vxPx: number;
  driftWorldY: number;
}

const POOL_SIZE = 28;

export class DamageNumberSystem {
  private readonly root: HTMLDivElement;
  private readonly slots: DamageNumberSlot[] = [];
  private readonly projVec = new THREE.Vector3();
  private cursor = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fixed inset-0 pointer-events-none overflow-hidden select-none z-[18]';
    container.appendChild(this.root);

    for (let i = 0; i < POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.className =
        'absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 font-black tracking-tight will-change-transform opacity-0';
      el.style.display = 'none';

      const badgeEl = document.createElement('span');
      badgeEl.className =
        'inline-flex items-center justify-center text-[11px] font-black leading-none px-1 py-0.5 rounded bg-red-600/90 text-amber-200 shadow-sm';
      badgeEl.textContent = 'HS';
      badgeEl.style.display = 'none';

      const valueEl = document.createElement('span');
      valueEl.className = 'leading-none tabular-nums';

      el.appendChild(badgeEl);
      el.appendChild(valueEl);
      this.root.appendChild(el);

      this.slots.push({
        el,
        valueEl,
        badgeEl,
        active: false,
        worldPos: new THREE.Vector3(),
        age: 0,
        duration: 0.85,
        isHeadshot: false,
        vxPx: 0,
        driftWorldY: 0.9,
      });
    }
  }

  spawn(x: number, y: number, z: number, damage: number, isHeadshot: boolean): void {
    const amount = Math.max(1, Math.round(damage));
    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      slot = this.slots[this.cursor];
      this.cursor = (this.cursor + 1) % POOL_SIZE;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = isHeadshot ? 0.98 : 0.82;
    slot.isHeadshot = isHeadshot;
    slot.vxPx = (Math.random() - 0.5) * 28;
    slot.driftWorldY = isHeadshot ? 1.15 : 0.88;

    const jitterX = (Math.random() - 0.5) * 0.24;
    const jitterZ = (Math.random() - 0.5) * 0.24;
    slot.worldPos.set(x + jitterX, y + (isHeadshot ? 0.28 : 0.14), z + jitterZ);

    slot.valueEl.textContent = String(amount);

    if (isHeadshot) {
      slot.badgeEl.style.display = 'inline-flex';
      slot.valueEl.style.color = '#ff3b30';
      slot.valueEl.style.fontSize = '24px';
      slot.valueEl.style.textShadow =
        '0 2px 0 #450a0a, 0 0 12px rgba(251, 146, 60, 0.95), 0 0 2px #000';
    } else {
      slot.badgeEl.style.display = 'none';
      slot.valueEl.style.color = amount >= 45 ? '#fde047' : '#ffffff';
      slot.valueEl.style.fontSize = amount >= 45 ? '20px' : '18px';
      slot.valueEl.style.textShadow =
        '0 2px 0 rgba(0, 0, 0, 0.9), 0 0 6px rgba(15, 23, 42, 0.85)';
    }

    slot.el.style.display = 'flex';
    slot.el.style.opacity = '1';
  }

  update(dt: number, camera: THREE.Camera, viewportWidth: number, viewportHeight: number): void {
    const safeDt = Math.min(dt, 0.1);
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.active) continue;

      slot.age += safeDt;
      if (slot.age >= slot.duration) {
        slot.active = false;
        slot.el.style.display = 'none';
        slot.el.style.opacity = '0';
        continue;
      }

      const t = slot.age / slot.duration;
      // Smooth deceleration upward drift in world space
      const stepWorldY = slot.driftWorldY * (1 - t * 0.65) * safeDt;
      slot.worldPos.y += stepWorldY;

      this.projVec.copy(slot.worldPos).project(camera);
      if (this.projVec.z > 1 || this.projVec.z < -1) {
        slot.el.style.opacity = '0';
        continue;
      }

      const sx = (this.projVec.x * 0.5 + 0.5) * viewportWidth + slot.vxPx * t;
      const sy = (-this.projVec.y * 0.5 + 0.5) * viewportHeight - t * 24;

      // Crisp pop-in then gentle settle
      let scale = 1.0;
      if (t < 0.14) {
        const popT = t / 0.14;
        scale = (slot.isHeadshot ? 1.48 : 1.28) - 0.32 * popT;
      } else if (t > 0.65) {
        scale = 1.0 - 0.14 * ((t - 0.65) / 0.35);
      }

      const opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);

      slot.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      slot.el.style.opacity = opacity.toFixed(3);
    }
  }

  clear(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.active = false;
      slot.el.style.display = 'none';
      slot.el.style.opacity = '0';
    }
  }

  dispose(): void {
    this.clear();
    this.root.remove();
  }
}
