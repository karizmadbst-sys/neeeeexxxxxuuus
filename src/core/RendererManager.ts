import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { DeviceProfile, GraphicsSettings, QualityPreset, Subsystem } from './Types';

export class RendererManager implements Subsystem {
  readonly renderer: THREE.WebGLRenderer;
  environmentMap: THREE.Texture | null = null;
  readonly isSoftwareGl: boolean;
  private readonly isCompactDevice: boolean;
  private readonly mountEl: HTMLElement;
  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
  };

  constructor(
    mountEl: HTMLElement,
    deviceProfile: DeviceProfile,
    graphics: GraphicsSettings,
  ) {
    this.mountEl = mountEl;
    this.isSoftwareGl = deviceProfile.isSoftwareGl;
    this.isCompactDevice =
      deviceProfile.isMobile || deviceProfile.isAndroid || deviceProfile.isTablet;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isSoftwareGl && graphics.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.applyGraphicsSettings(graphics);
    this.resize(mountEl.clientWidth || window.innerWidth, mountEl.clientHeight || window.innerHeight);

    mountEl.innerHTML = '';
    mountEl.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
  }

  initEnvironmentMap(): THREE.Texture {
    if (this.environmentMap) {
      return this.environmentMap;
    }
    // Procedural studio environment map for crisp PBR metals & visors
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.environmentMap = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();
    return this.environmentMap;
  }

  getMaxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  getRecommendedAnisotropy(quality: QualityPreset): number {
    const hwMax = Math.max(1, this.getMaxAnisotropy());
    if (this.isSoftwareGl || quality === 'low') return 1;
    if (quality === 'medium') return Math.min(this.isCompactDevice ? 2 : 4, hwMax);
    return Math.min(this.isCompactDevice ? 4 : 8, hwMax);
  }

  private lastAppliedRatio = -1;
  private lastAppliedShadows: boolean | null = null;
  private lastAppliedShadowType: THREE.ShadowMapType | null = null;
  private shadowUpdateInterval = 1;
  private shadowFrameCounter = 0;

  setShadowCadence(intervalFrames: 1 | 2): void {
    this.shadowUpdateInterval = intervalFrames;
    this.renderer.shadowMap.autoUpdate = intervalFrames <= 1;
    if (intervalFrames <= 1) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  invalidateShadowMap(): void {
    this.shadowFrameCounter = 0;
    this.renderer.shadowMap.needsUpdate = true;
  }

  applyGraphicsSettings(graphics: GraphicsSettings, scene?: THREE.Scene): void {
    const targetRatio = this.isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio || 1, graphics.pixelRatioCap);
    const targetShadows = !this.isSoftwareGl && graphics.shadowsEnabled;
    const targetShadowType: THREE.ShadowMapType =
      graphics.quality === 'low'
        ? THREE.BasicShadowMap
        : graphics.quality === 'medium' && this.isCompactDevice
          ? THREE.PCFShadowMap
          : THREE.PCFSoftShadowMap;

    if (Math.abs(targetRatio - this.lastAppliedRatio) > 0.001) {
      this.lastAppliedRatio = targetRatio;
      this.renderer.setPixelRatio(targetRatio);
    }

    if (targetShadowType !== this.lastAppliedShadowType) {
      const hadType = this.lastAppliedShadowType !== null;
      this.lastAppliedShadowType = targetShadowType;
      this.renderer.shadowMap.type = targetShadowType;
      this.renderer.shadowMap.needsUpdate = true;
      if (hadType && scene) {
        scene.traverse((obj) => {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            for (let i = 0; i < mat.length; i++) mat[i].needsUpdate = true;
          } else if (mat) {
            mat.needsUpdate = true;
          }
        });
      }
    }

    if (targetShadows !== this.lastAppliedShadows) {
      this.lastAppliedShadows = targetShadows;
      this.renderer.shadowMap.enabled = targetShadows;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  }

  precompile(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.compile(scene, camera);
  }

  async precompileAsync(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    const maybeAsync = this.renderer as THREE.WebGLRenderer & {
      compileAsync?: (s: THREE.Scene, c: THREE.Camera) => Promise<THREE.Scene>;
    };
    try {
      if (typeof maybeAsync.compileAsync === 'function') {
        await maybeAsync.compileAsync(scene, camera);
      } else {
        this.renderer.compile(scene, camera);
      }
    } catch {
      this.renderer.compile(scene, camera);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.shadowUpdateInterval > 1 && this.renderer.shadowMap.enabled) {
      if (this.shadowFrameCounter === 0) {
        this.renderer.shadowMap.needsUpdate = true;
      }
      this.shadowFrameCounter = (this.shadowFrameCounter + 1) % this.shadowUpdateInterval;
    }
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.environmentMap?.dispose();
    this.environmentMap = null;
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
