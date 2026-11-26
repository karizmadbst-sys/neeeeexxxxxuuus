import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LoadingManager } from './LoadingManager';
import type { Subsystem } from './Types';
import { registerWeaponGlbTemplate } from '../weapons/WeaponModelBuilder';

export class AssetManager implements Subsystem {
  private textures = new Map<string, THREE.Texture>();
  private materials = new Map<string, THREE.Material>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private models = new Map<string, THREE.Group>();
  private weaponGlbs = new Set<string>();

  private readonly textureLoader: THREE.TextureLoader;
  private readonly gltfLoader: GLTFLoader;
  private maxAnisotropy = 1;
  private disposed = false;

  constructor(loadingManager: LoadingManager) {
    THREE.Cache.enabled = true;
    this.textureLoader = new THREE.TextureLoader(loadingManager.threeManager);
    this.gltfLoader = new GLTFLoader(loadingManager.threeManager);
  }

  setMaxAnisotropy(max: number): void {
    this.maxAnisotropy = Math.max(1, max);
    for (const tex of this.textures.values()) {
      tex.anisotropy = this.maxAnisotropy;
      tex.needsUpdate = true;
    }
  }

  registerGeometry<T extends THREE.BufferGeometry>(key: string, geometry: T): T {
    this.geometries.set(key, geometry);
    return geometry;
  }

  getGeometry(key: string): THREE.BufferGeometry | undefined {
    return this.geometries.get(key);
  }

  registerMaterial<T extends THREE.Material>(key: string, material: T): T {
    this.materials.set(key, material);
    return material;
  }

  getMaterial(key: string): THREE.Material | undefined {
    return this.materials.get(key);
  }

  getTexture(key: string): THREE.Texture | undefined {
    return this.textures.get(key);
  }

  /**
   * Generates a crisp procedural CanvasTexture (zero external 404s) with sRGB & anisotropy setup.
   */
  createProceduralGridTexture(key = 'tactical-grid'): THREE.CanvasTexture {
    const existing = this.textures.get(key);
    if (existing instanceof THREE.CanvasTexture) {
      return existing;
    }

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base dark slate asphalt/composite ground
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, size, size);

    // Subtle micro-grain noise
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let i = 0; i < 650; i++) {
      const x = (i * 73) % size;
      const y = (i * 137) % size;
      ctx.fillRect(x, y, 2, 2);
    }

    // Secondary sub-grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.11)';
    ctx.lineWidth = 1;
    const subStep = size / 8;
    for (let i = 0; i <= 8; i++) {
      const pos = i * subStep;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Major tactical tile border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, size - 3, size - 3);

    // Corner crosshairs
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
    ctx.lineWidth = 2;
    const mark = 16;
    ctx.beginPath();
    ctx.moveTo(0, mark);
    ctx.lineTo(0, 0);
    ctx.lineTo(mark, 0);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(24, 24);
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;

    this.textures.set(key, texture);
    return texture;
  }

  createRadialShadowTexture(key = 'contact-shadow'): THREE.CanvasTexture {
    const existing = this.textures.get(key);
    if (existing instanceof THREE.CanvasTexture) {
      return existing;
    }

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      4,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    this.textures.set(key, texture);
    return texture;
  }

  getMaxAnisotropy(): number {
    return this.maxAnisotropy;
  }

  /**
   * Generates crisp cached procedural color-detail + roughness maps for realistic buildings & props.
   */
  createPbrDetailTextures(
    kind: 'masonry' | 'wood' | 'metal' | 'fabric',
    compactSize = false,
  ): {
    map: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  } {
    const size = compactSize ? 256 : 512;
    const colorKey = `pbr-detail-map-${kind}-${size}`;
    const roughKey = `pbr-detail-rough-${kind}-${size}`;
    const existingColor = this.textures.get(colorKey);
    const existingRough = this.textures.get(roughKey);
    if (
      existingColor instanceof THREE.CanvasTexture &&
      existingRough instanceof THREE.CanvasTexture
    ) {
      return { map: existingColor, roughnessMap: existingRough };
    }

    const cCanvas = document.createElement('canvas');
    cCanvas.width = size;
    cCanvas.height = size;
    const cCtx = cCanvas.getContext('2d')!;

    const rCanvas = document.createElement('canvas');
    rCanvas.width = size;
    rCanvas.height = size;
    const rCtx = rCanvas.getContext('2d')!;

    if (kind === 'masonry') {
      cCtx.fillStyle = '#ececec';
      cCtx.fillRect(0, 0, size, size);
      rCtx.fillStyle = '#d4d4d4';
      rCtx.fillRect(0, 0, size, size);

      const rows = 8;
      const cols = 4;
      const rowH = size / rows;
      const colW = size / cols;
      for (let r = 0; r < rows; r++) {
        const offsetX = (r % 2) * (colW * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * colW + offsetX;
          const y = r * rowH;
          const v = 224 + (((r * 17 + (c + 2) * 31) % 7) - 3) * 4;
          cCtx.fillStyle = `rgb(${v},${v},${v})`;
          cCtx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
          const rv = 195 + (((r * 13 + (c + 2) * 19) % 5) - 2) * 8;
          rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
          rCtx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
        }
      }
      // Subtle plaster/concrete micro-aggregate
      for (let i = 0; i < 1600; i++) {
        const px = (i * 193) % size;
        const py = (i * 317) % size;
        cCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
        cCtx.fillRect(px, py, 2, 2);
        rCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(120,120,120,0.12)';
        rCtx.fillRect(px, py, 2, 2);
      }
    } else if (kind === 'wood') {
      cCtx.fillStyle = '#eaeaea';
      cCtx.fillRect(0, 0, size, size);
      rCtx.fillStyle = '#bebebe';
      rCtx.fillRect(0, 0, size, size);

      const planks = 6;
      const pH = size / planks;
      for (let p = 0; p < planks; p++) {
        const y0 = p * pH;
        const base = 226 + (p % 3) * 6;
        cCtx.fillStyle = `rgb(${base},${base},${base})`;
        cCtx.fillRect(0, y0 + 2, size, pH - 3);
        cCtx.fillStyle = 'rgba(0,0,0,0.16)';
        cCtx.fillRect(0, y0, size, 2);
        rCtx.fillStyle = 'rgb(215,215,215)';
        rCtx.fillRect(0, y0, size, 2);
        // Wood grain streaks
        for (let g = 0; g < 10; g++) {
          const gy = y0 + 5 + ((g * 7 + p * 3) % Math.max(8, Math.floor(pH - 8)));
          cCtx.fillStyle = g % 2 === 0 ? 'rgba(0,0,0,0.055)' : 'rgba(255,255,255,0.05)';
          cCtx.fillRect(0, gy, size, 1.5);
        }
      }
    } else if (kind === 'metal') {
      cCtx.fillStyle = '#e8e8e8';
      cCtx.fillRect(0, 0, size, size);
      rCtx.fillStyle = '#888888';
      rCtx.fillRect(0, 0, size, size);

      const panelStep = size / 4;
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const v = 228 + ((px + py * 2) % 3) * 7;
          cCtx.fillStyle = `rgb(${v},${v},${v})`;
          cCtx.fillRect(px * panelStep + 2, py * panelStep + 2, panelStep - 4, panelStep - 4);
          const rv = 95 + ((px * 3 + py) % 4) * 14;
          rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
          rCtx.fillRect(px * panelStep + 2, py * panelStep + 2, panelStep - 4, panelStep - 4);
        }
      }
      // Subtle industrial corrugation / brushed lines
      for (let y = 0; y < size; y += 8) {
        cCtx.fillStyle = y % 16 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
        cCtx.fillRect(0, y, size, 2);
      }
    } else {
      cCtx.fillStyle = '#efefef';
      cCtx.fillRect(0, 0, size, size);
      rCtx.fillStyle = '#e5e5e5';
      rCtx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y += 4) {
        cCtx.fillStyle = 'rgba(0,0,0,0.055)';
        cCtx.fillRect(0, y, size, 1);
      }
      for (let x = 0; x < size; x += 4) {
        cCtx.fillStyle = 'rgba(255,255,255,0.055)';
        cCtx.fillRect(x, 0, 1, size);
      }
    }

    const mapTex = new THREE.CanvasTexture(cCanvas);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.wrapS = THREE.RepeatWrapping;
    mapTex.wrapT = THREE.RepeatWrapping;
    mapTex.anisotropy = this.maxAnisotropy;
    mapTex.needsUpdate = true;

    const roughTex = new THREE.CanvasTexture(rCanvas);
    roughTex.colorSpace = THREE.NoColorSpace;
    roughTex.wrapS = THREE.RepeatWrapping;
    roughTex.wrapT = THREE.RepeatWrapping;
    roughTex.anisotropy = this.maxAnisotropy;
    roughTex.needsUpdate = true;

    this.textures.set(colorKey, mapTex);
    this.textures.set(roughKey, roughTex);
    return { map: mapTex, roughnessMap: roughTex };
  }

  createBrushedMetalTexture(key = 'brushed-metal'): THREE.CanvasTexture {
    const existing = this.textures.get(key);
    if (existing instanceof THREE.CanvasTexture) {
      return existing;
    }

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      const shade = 110 + Math.floor(Math.sin(y * 0.7) * 18 + (y % 5) * 4);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(0, y, size, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;

    this.textures.set(key, texture);
    return texture;
  }

  /**
   * Ready for future GLB models in later phases without changing engine APIs.
   */
  async loadModel(key: string, url: string): Promise<THREE.Group> {
    const cached = this.models.get(key);
    if (cached) {
      return cached.clone(true);
    }

    const gltf = await this.gltfLoader.loadAsync(url);
    this.models.set(key, gltf.scene);
    return gltf.scene.clone(true);
  }

  private async loadGltfWithRetry(url: string, maxAttempts = 2) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.disposed) {
        throw new Error('AssetManager disposed');
      }
      try {
        return await this.gltfLoader.loadAsync(url);
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts && !this.disposed) {
          await new Promise<void>((resolve) => setTimeout(resolve, 180 * attempt));
        }
      }
    }
    throw lastError;
  }

  async preloadWeaponGlb(id: string, url: string): Promise<void> {
    if (this.weaponGlbs.has(id) || this.disposed) return;
    try {
      const gltf = await this.loadGltfWithRetry(url, 2);
      if (this.disposed) return;
      registerWeaponGlbTemplate(id, gltf.scene);
      this.weaponGlbs.add(id);
    } catch {
      // Fallback to procedural geometry in WeaponModelBuilder if fetch unavailable
    }
  }

  async preloadWeaponGlbsBatched(
    entries: ReadonlyArray<{ id: string; url: string }>,
    concurrency = 3,
    onEachDone?: () => void,
  ): Promise<void> {
    let cursor = 0;
    const worker = async () => {
      while (cursor < entries.length) {
        const idx = cursor++;
        const item = entries[idx];
        await this.preloadWeaponGlb(item.id, item.url);
        onEachDone?.();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    };
    const count = Math.max(1, Math.min(concurrency, entries.length));
    await Promise.all(Array.from({ length: count }, () => worker()));
  }

  hasWeaponGlb(id: string): boolean {
    return this.weaponGlbs.has(id);
  }

  async loadTexture(key: string, url: string, srgb = true): Promise<THREE.Texture> {
    const cached = this.textures.get(key);
    if (cached) return cached;

    const texture = await this.textureLoader.loadAsync(url);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;
    this.textures.set(key, texture);
    return texture;
  }

  dispose(): void {
    this.disposed = true;
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();

    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();

    for (const geometry of this.geometries.values()) {
      geometry.dispose();
    }
    this.geometries.clear();

    this.models.clear();
    this.weaponGlbs.clear();
    THREE.Cache.clear();
  }
}
