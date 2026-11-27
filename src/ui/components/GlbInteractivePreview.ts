import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GlbEquipSlot } from '../../shop/GlbAssetTypes';
import { glbModelCache, normalizeGlbRootGroup } from '../../shop/GlbModelCache';

export class GlbInteractivePreview {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.05, 60);
  private readonly turntable = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;

  private activeModelDispose: (() => void) | null = null;
  private rafId = 0;
  private lastTime = 0;
  private yaw = 0.42;
  private pitch = 0.14;
  private zoomFactor = 1.0;
  private autoSpin = true;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private modelRadius = 1.0;
  private modelCenterY = 0.5;
  private resizeObserver: ResizeObserver | null = null;
  private loadSeq = 0;
  private disposed = false;

  private readonly statusEl: HTMLElement;
  private readonly spinBtn: HTMLButtonElement;

  constructor(options?: { heightClass?: string }) {
    this.element = document.createElement('div');
    this.element.className = `relative w-full ${options?.heightClass ?? 'aspect-[4/3]'} rounded-md overflow-hidden bg-slate-950 border border-slate-800 select-none`;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'w-full h-full block cursor-grab active:cursor-grabbing';
    this.element.appendChild(this.canvas);

    this.statusEl = document.createElement('div');
    this.statusEl.className =
      'absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-950/85 border border-slate-700/80 text-[10px] font-bold text-sky-300 pointer-events-none';
    this.statusEl.textContent = '3D GLB VIEWPORT';
    this.element.appendChild(this.statusEl);

    this.spinBtn = document.createElement('button');
    this.spinBtn.type = 'button';
    this.spinBtn.className =
      'absolute bottom-2 right-2 px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-200';
    this.spinBtn.textContent = 'Auto Spin: ON';
    this.spinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.autoSpin = !this.autoSpin;
      this.spinBtn.textContent = this.autoSpin ? 'Auto Spin: ON' : 'Auto Spin: OFF';
    });
    this.element.appendChild(this.spinBtn);

    const hint = document.createElement('span');
    hint.className =
      'absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/75 text-[10px] text-slate-400 pointer-events-none';
    hint.textContent = 'Drag to rotate · Scroll to zoom';
    this.element.appendChild(hint);

    this.setupScene();
    this.bindInput();
  }

  private setupScene(): void {
    this.scene.add(this.turntable);

    const hemi = new THREE.HemisphereLight('#e0f2fe', '#0f172a', 1.25);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#ffffff', 1.85);
    key.position.set(2.8, 4.2, 3.2);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#38bdf8', 0.95);
    rim.position.set(-3.0, 2.2, -2.5);
    this.scene.add(rim);

    const floorGeo = new THREE.CircleGeometry(1.4, 32);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({
      color: '#0f172a',
      transparent: true,
      opacity: 0.45,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.002;
    this.scene.add(floor);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
    } catch {
      this.renderer = null;
      this.statusEl.textContent = 'WebGL unavailable';
    }

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stopLoop();
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(this.element);
    }
    this.syncSize();
    this.startLoop();
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.yaw += dx * 0.012;
      this.pitch = Math.max(-0.55, Math.min(0.85, this.pitch + dy * 0.008));
    });
    const stopDrag = () => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', stopDrag);
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomFactor = Math.max(0.55, Math.min(2.1, this.zoomFactor + (e.deltaY > 0 ? 0.08 : -0.08)));
      },
      { passive: false },
    );
  }

  private syncSize(): void {
    if (!this.renderer) return;
    const w = Math.max(180, this.element.clientWidth || 320);
    const h = Math.max(135, this.element.clientHeight || 240);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private clearActiveModel(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.activeModelDispose?.();
    this.activeModelDispose = null;
    this.turntable.clear();
  }

  setLocalScene(
    sceneRoot: THREE.Object3D,
    animations: readonly THREE.AnimationClip[],
    equipSlot: GlbEquipSlot,
    scaleMultiplier = 1,
  ): void {
    if (this.disposed) return;
    this.loadSeq++;
    this.clearActiveModel();

    const cloned = SkeletonUtils.clone(sceneRoot);
    const { wrapper, boundsSize } = normalizeGlbRootGroup(cloned, equipSlot, scaleMultiplier);
    this.turntable.add(wrapper);
    this.activeModelDispose = () => {
      wrapper.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose();
        }
      });
    };

    this.frameObject(wrapper, boundsSize, animations);
    this.statusEl.textContent = '3D PREVIEW READY';
  }

  async loadFromUrl(
    modelUrl: string,
    equipSlot: GlbEquipSlot,
    scaleMultiplier = 1,
  ): Promise<void> {
    if (this.disposed) return;
    const seq = ++this.loadSeq;
    this.statusEl.textContent = 'LOADING GLB...';
    try {
      const instance = await glbModelCache.instantiateModel(modelUrl, equipSlot, scaleMultiplier);
      if (this.disposed || seq !== this.loadSeq) {
        instance.dispose();
        return;
      }
      this.clearActiveModel();
      this.turntable.add(instance.root);
      this.activeModelDispose = instance.dispose;
      this.frameObject(instance.root, instance.boundsSize, instance.animations);
      this.statusEl.textContent = '3D GLB PREVIEW';
    } catch {
      if (this.disposed || seq !== this.loadSeq) return;
      this.statusEl.textContent = 'GLB PREVIEW UNAVAILABLE';
    }
  }

  private frameObject(
    root: THREE.Object3D,
    boundsSize: THREE.Vector3,
    animations: readonly THREE.AnimationClip[],
  ): void {
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    this.modelCenterY = center.y;
    this.modelRadius = Math.max(boundsSize.length() * 0.5, 0.25);
    this.yaw = 0.42;
    this.pitch = 0.16;
    this.zoomFactor = 1.0;

    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(root);
      const idleClip =
        animations.find((c) => /idle/i.test(c.name)) ?? animations[0];
      if (idleClip) {
        this.mixer.clipAction(idleClip).reset().play();
      }
    }
    this.renderSingleFrame(0);
  }

  captureThumbnailDataUrl(width = 384, height = 288): string | null {
    if (!this.renderer) return null;
    this.syncSize();
    this.renderSingleFrame(0);
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#070d1c';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(this.canvas, 0, 0, width, height);
    return offscreen.toDataURL('image/png');
  }

  private renderSingleFrame(delta: number): void {
    if (!this.renderer) return;
    if (this.mixer && delta > 0) {
      this.mixer.update(delta);
    }
    if (this.autoSpin && !this.dragging) {
      this.yaw += delta * 0.65;
    }
    this.turntable.rotation.y = this.yaw;

    const dist = (this.modelRadius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.12 * this.zoomFactor;
    const cy = this.modelCenterY;
    this.camera.position.set(
      0,
      cy + Math.sin(this.pitch) * dist * 0.72,
      Math.cos(this.pitch) * dist,
    );
    this.camera.lookAt(0, cy, 0);
    this.renderer.render(this.scene, this.camera);
  }

  private startLoop(): void {
    if (this.rafId) return;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.renderSingleFrame(dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.clearActiveModel();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
