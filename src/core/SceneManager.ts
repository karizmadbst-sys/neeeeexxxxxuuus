import * as THREE from 'three';
import type { QualityPreset, Subsystem } from './Types';

export class SceneManager implements Subsystem {
  readonly scene: THREE.Scene;
  readonly keyLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly rimLight: THREE.DirectionalLight;
  private lastShadowX = Number.NaN;
  private lastShadowZ = Number.NaN;
  private rimBaseIntensity = 0.52;
  private shadowExtent = 36;

  constructor(environmentMap: THREE.Texture | null = null) {
    this.scene = new THREE.Scene();

    const horizonColor = new THREE.Color('#c4e2f3');
    this.scene.background = horizonColor;
    this.scene.fog = new THREE.FogExp2('#c4e2f3', 0.0008);
    if (environmentMap) {
      this.scene.environment = environmentMap;
    }

    // Warm directional sunlight (key light) aligned with sky dome sun vector (28, 42, 22)
    this.keyLight = new THREE.DirectionalLight(0xfff3da, 2.45);
    this.keyLight.position.set(28, 42, 22);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const d = this.shadowExtent;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 140;
    this.keyLight.shadow.bias = -0.00045;
    this.keyLight.shadow.normalBias = 0.025;
    this.keyLight.shadow.radius = 2.0;
    this.scene.add(this.keyLight);

    // Cool sky / ground bounce hemisphere fill
    this.hemiLight = new THREE.HemisphereLight(0x8ad0ff, 0x3b593c, 1.05);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // Subtle atmospheric sky backlight for crisp silhouette separation without harsh cyan tint
    this.rimLight = new THREE.DirectionalLight(0xdbeafe, 0.52);
    this.rimLight.position.set(-22, 16, -20);
    this.scene.add(this.rimLight);
  }

  setEnvironmentMap(environmentMap: THREE.Texture | null): void {
    this.scene.environment = environmentMap;
  }

  setShadowQuality(resolution: 512 | 1024 | 1536 | 2048): void {
    if (this.keyLight.shadow.mapSize.width !== resolution) {
      this.keyLight.shadow.mapSize.set(resolution, resolution);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
    }
  }

  private lastProfileKey = '';

  applyQualityProfile(
    quality: QualityPreset,
    shadowsEnabled: boolean,
    isCompactDevice: boolean,
    isLobby = false,
  ): void {
    const key = `${quality}:${shadowsEnabled ? 1 : 0}:${isCompactDevice ? 1 : 0}:${isLobby ? 'L' : 'G'}`;
    const shadowRes: 512 | 1024 | 1536 | 2048 = isLobby
      ? quality === 'low'
        ? 512
        : quality === 'medium'
          ? 1024
          : isCompactDevice
            ? 1024
            : 1536
      : quality === 'low'
        ? 512
        : quality === 'medium'
          ? isCompactDevice
            ? 1024
            : 1536
          : isCompactDevice
            ? 1536
            : 2048;
    this.setShadowQuality(shadowRes);
    this.keyLight.castShadow = shadowsEnabled;
    this.keyLight.shadow.radius = quality === 'high' ? 2.0 : quality === 'medium' ? 1.4 : 1.0;

    const extent = isLobby
      ? quality === 'low'
        ? 12
        : 16
      : quality === 'low'
        ? 26
        : isCompactDevice
          ? quality === 'medium'
            ? 32
            : 40
          : quality === 'medium'
            ? 40
            : 48;
    if (this.shadowExtent !== extent) {
      this.shadowExtent = extent;
      this.keyLight.shadow.camera.left = -extent;
      this.keyLight.shadow.camera.right = extent;
      this.keyLight.shadow.camera.top = extent;
      this.keyLight.shadow.camera.bottom = -extent;
      this.keyLight.shadow.camera.updateProjectionMatrix();
      this.lastShadowX = Number.NaN;
      this.lastShadowZ = Number.NaN;
    }
    if (this.lastProfileKey === key) return;
    this.lastProfileKey = key;
    this.rimLight.visible = isLobby ? quality === 'high' : quality !== 'low';
    this.rimBaseIntensity = quality === 'high' ? 0.56 : 0.42;
    this.rimLight.intensity = this.rimBaseIntensity;
    this.scene.environmentIntensity = quality === 'low' ? 0.65 : quality === 'medium' ? 0.85 : 0.95;
  }

  updateShadowCenter(targetX: number, targetZ: number): void {
    const texelWorld = (this.shadowExtent * 2) / Math.max(512, this.keyLight.shadow.mapSize.width);
    const snapStep = texelWorld * 4;
    const sx = Math.round(targetX / snapStep) * snapStep;
    const sz = Math.round(targetZ / snapStep) * snapStep;
    if (sx === this.lastShadowX && sz === this.lastShadowZ) return;
    this.lastShadowX = sx;
    this.lastShadowZ = sz;
    this.keyLight.target.position.set(sx, 0, sz);
    this.keyLight.position.set(sx + 28, 42, sz + 22);
    this.keyLight.target.updateMatrixWorld();
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.scene.clear();
  }
}
