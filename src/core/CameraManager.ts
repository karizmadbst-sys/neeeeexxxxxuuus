import * as THREE from 'three';
import { clamp, damp } from '../utils/MathUtils';
import type { CameraPresetId, Subsystem, ViewportMetrics } from './Types';

export class CameraManager implements Subsystem {
  readonly camera: THREE.PerspectiveCamera;

  private preset: CameraPresetId = 'menu-orbit';
  private baseFov = 54;

  // Orbital / look state
  private menuYawBase = 0.04;
  private yaw = 0.04;
  private pitch = 0.16;
  private distance = 4.35;
  private targetYaw = 0.04;
  private targetPitch = 0.16;
  private targetDistance = 4.35;

  private readonly currentPos = new THREE.Vector3(0.17, 1.97, 4.29);
  private readonly currentLook = new THREE.Vector3(0.0, 1.28, 0.0);
  private readonly targetPos = new THREE.Vector3(0.17, 1.97, 4.29);
  private readonly targetLook = new THREE.Vector3(0.0, 1.28, 0.0);

  private readonly followTarget = new THREE.Vector3(0, 0, 0);
  private shakeTrauma = 0;
  private lobbySquadCount = 1;

  constructor(metrics: ViewportMetrics) {
    this.camera = new THREE.PerspectiveCamera(
      this.computeResponsiveFov(metrics),
      metrics.aspectRatio,
      0.1,
      1400,
    );
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  getPreset(): CameraPresetId {
    return this.preset;
  }

  private getMenuOrbitDistance(): number {
    const portraitPad = this.camera.aspect < 0.85 && this.lobbySquadCount >= 2 ? 0.75 : 0;
    if (this.lobbySquadCount <= 1) return 4.35;
    if (this.lobbySquadCount === 2) return 4.85 + portraitPad;
    if (this.lobbySquadCount === 3) return 5.45 + portraitPad;
    return 6.05 + portraitPad;
  }

  setLobbySquadCount(count: number, snap = false): void {
    const clamped = Math.max(1, Math.min(4, Math.round(count)));
    this.lobbySquadCount = clamped;
    if (this.preset === 'menu-orbit') {
      this.targetDistance = this.getMenuOrbitDistance();
      if (snap) {
        this.distance = this.targetDistance;
      }
    }
  }

  setPreset(preset: CameraPresetId, snap = false): void {
    this.preset = preset;
    switch (preset) {
      case 'menu-orbit':
        this.menuYawBase = 0.04;
        this.targetYaw = 0.04;
        this.targetDistance = this.getMenuOrbitDistance();
        this.targetPitch = 0.16;
        break;
      case 'characters-showcase':
        this.targetYaw = 0.18;
        this.targetPitch = 0.07;
        this.targetDistance = 3.65;
        break;
      case 'pets-showcase':
        this.targetYaw = 0.24;
        this.targetPitch = 0.09;
        this.targetDistance = 3.2;
        break;
      case 'shop-showcase':
        this.targetYaw = -0.38;
        this.targetPitch = 0.14;
        this.targetDistance = 6.2;
        break;
      case 'arena-orbit':
        this.targetDistance = 15.0;
        this.targetPitch = 0.34;
        break;
      case 'arena-roam':
        this.targetDistance = 7.2;
        this.targetPitch = 0.28;
        break;
    }

    if (snap) {
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
      this.distance = this.targetDistance;
      this.shakeTrauma = 0;
      this.updateTargetLook(0);

      const horizDist = Math.cos(this.pitch) * this.distance;
      const vertDist = Math.sin(this.pitch) * this.distance;
      this.targetPos.set(
        this.targetLook.x + Math.sin(this.yaw) * horizDist,
        Math.max(0.55, this.targetLook.y + vertDist),
        this.targetLook.z + Math.cos(this.yaw) * horizDist,
      );
      this.currentPos.copy(this.targetPos);
      this.currentLook.copy(this.targetLook);
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
    }
  }

  private updateTargetLook(elapsed: number): void {
    if (this.preset === 'menu-orbit') {
      // Heroic staging centered on the operator; slightly lower look target in portrait lifts operator above the bottom dock
      this.targetYaw = this.menuYawBase + Math.sin(elapsed * 0.25) * 0.02;
      const lookY = this.camera.aspect < 0.85 ? 0.96 : 1.28;
      this.targetLook.set(0.0, lookY, 0.0);
    } else if (this.preset === 'characters-showcase') {
      // Slightly lower look target lifts the full 3D operator clearly above the bottom studio toolbar
      this.targetLook.set(0.0, 0.68, 0.0);
    } else if (this.preset === 'pets-showcase') {
      this.targetLook.set(-0.52, 0.42, 0.16);
    } else if (this.preset === 'shop-showcase') {
      this.targetLook.set(3.6, 1.15, -5.8);
    } else if (this.preset === 'arena-orbit') {
      this.targetLook.set(0, 1.2, 0);
    } else if (this.preset === 'arena-roam') {
      this.targetLook.set(
        this.followTarget.x,
        this.followTarget.y + 1.45,
        this.followTarget.z,
      );
    }
  }

  setFollowTarget(x: number, y: number, z: number): void {
    this.followTarget.set(x, y, z);
  }

  addLookDelta(deltaYaw: number, deltaPitch: number): void {
    if (this.preset === 'menu-orbit') {
      // Keep lobby camera aligned with the static reference floor; horizontal drag rotates the character
      this.targetPitch = clamp(this.targetPitch + deltaPitch * 0.5, 0.06, 0.24);
      return;
    }
    this.targetYaw -= deltaYaw;
    this.targetPitch = clamp(this.targetPitch + deltaPitch, -0.14, 1.18);
  }

  addZoomDelta(deltaDistance: number): void {
    if (this.preset === 'menu-orbit') {
      const maxMenuDist = Math.max(5.0, this.getMenuOrbitDistance() + 0.85);
      this.targetDistance = clamp(this.targetDistance + deltaDistance, 3.4, maxMenuDist);
      return;
    }
    const minDist = this.preset === 'arena-roam' ? 4.2 : 2.3;
    const maxDist = this.preset === 'arena-roam' ? 14 : 28;
    this.targetDistance = clamp(this.targetDistance + deltaDistance, minDist, maxDist);
  }

  addShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1);
  }

  getYaw(): number {
    return this.yaw;
  }

  setFarClip(far: number): void {
    const nextFar = clamp(far, 500, 2200);
    if (Math.abs(this.camera.far - nextFar) > 1) {
      this.camera.far = nextFar;
      this.camera.updateProjectionMatrix();
    }
  }

  updateViewport(metrics: ViewportMetrics): void {
    this.camera.aspect = metrics.aspectRatio;
    this.camera.fov = this.computeResponsiveFov(metrics);
    if (this.preset === 'menu-orbit') {
      this.targetDistance = this.getMenuOrbitDistance();
    }
    this.camera.updateProjectionMatrix();
  }

  update(delta: number, elapsed: number): void {
    this.updateTargetLook(elapsed);

    const lambda = 9;
    this.yaw = damp(this.yaw, this.targetYaw, lambda, delta);
    this.pitch = damp(this.pitch, this.targetPitch, lambda, delta);
    this.distance = damp(this.distance, this.targetDistance, lambda, delta);

    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance;

    this.targetPos.set(
      this.targetLook.x + Math.sin(this.yaw) * horizDist,
      Math.max(0.55, this.targetLook.y + vertDist),
      this.targetLook.z + Math.cos(this.yaw) * horizDist,
    );

    this.currentPos.x = damp(this.currentPos.x, this.targetPos.x, lambda, delta);
    this.currentPos.y = damp(this.currentPos.y, this.targetPos.y, lambda, delta);
    this.currentPos.z = damp(this.currentPos.z, this.targetPos.z, lambda, delta);

    this.currentLook.x = damp(this.currentLook.x, this.targetLook.x, lambda, delta);
    this.currentLook.y = damp(this.currentLook.y, this.targetLook.y, lambda, delta);
    this.currentLook.z = damp(this.currentLook.z, this.targetLook.z, lambda, delta);

    this.camera.position.copy(this.currentPos);

    if (this.shakeTrauma > 0.001) {
      const shake = this.shakeTrauma * this.shakeTrauma * 0.25;
      this.camera.position.x += Math.sin(elapsed * 43) * shake;
      this.camera.position.y += Math.cos(elapsed * 37) * shake;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - delta * 2.2);
    }

    this.camera.lookAt(this.currentLook);
  }

  private computeResponsiveFov(metrics: ViewportMetrics): number {
    if (metrics.orientation === 'portrait') {
      return clamp(this.baseFov + (1 - metrics.aspectRatio) * 26, 54, 74);
    }
    if (metrics.aspectRatio < 1.65) {
      return clamp(this.baseFov + (1.65 - metrics.aspectRatio) * 14, 54, 62);
    }
    if (metrics.aspectRatio > 1.85) {
      return clamp(this.baseFov - (metrics.aspectRatio - 1.85) * 4.2, 48.5, 54);
    }
    return this.baseFov;
  }

  dispose(): void {
    // No DOM listeners held directly
  }
}
