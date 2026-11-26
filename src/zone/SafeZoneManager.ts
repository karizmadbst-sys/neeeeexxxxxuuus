import * as THREE from 'three';
import type { Subsystem } from '../core/Types';
import type { ServerZoneState } from '../ranked/RankedTypes';
import type { IZoneSystem, SafeZoneState } from './IZoneSystem';

export class SafeZoneManager implements Subsystem, IZoneSystem {
  readonly root = new THREE.Group();

  private readonly wallMesh: THREE.Mesh;
  private readonly wallMat: THREE.ShaderMaterial;
  private readonly wallGeo: THREE.CylinderGeometry;
  private readonly perimeterMesh: THREE.Mesh;
  private readonly perimeterMat: THREE.MeshBasicMaterial;
  private readonly perimeterGeo: THREE.CylinderGeometry;

  private active = false;
  private elapsed = 0;
  private serverZone: ServerZoneState | null = null;
  private lastCenterX = Number.NaN;
  private lastCenterZ = Number.NaN;
  private lastRadius = Number.NaN;
  private lastShrinking: boolean | null = null;

  private state: SafeZoneState = {
    phaseIndex: 1,
    currentCenterX: 0,
    currentCenterZ: 0,
    currentRadius: 520,
    targetCenterX: 0,
    targetCenterZ: 0,
    targetRadius: 340,
    damagePerSecond: 3,
    isShrinking: false,
  };

  constructor() {
    this.wallGeo = new THREE.CylinderGeometry(1, 1, 420, 96, 1, true);
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uBaseColor: { value: new THREE.Color('#1d4ed8') },
        uWaveColor: { value: new THREE.Color('#38bdf8') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform vec3 uBaseColor;
        uniform vec3 uWaveColor;
        varying vec2 vUv;
        void main() {
          float angleWave = sin(vUv.x * 6.2831853 * 48.0 + vUv.y * 28.0 - uTime * 2.2);
          float riseBand = 0.5 + 0.5 * sin(vUv.y * 90.0 - uTime * 3.4);
          float grid = smoothstep(0.55, 0.98, 0.5 + 0.5 * angleWave) * 0.42 + riseBand * 0.28;
          float groundEdge = 1.0 - smoothstep(0.0, 0.28, vUv.y);
          float topFade = 1.0 - smoothstep(0.75, 1.0, vUv.y);
          vec3 col = mix(uBaseColor, uWaveColor, clamp(grid + groundEdge * 0.55, 0.0, 1.0));
          float alpha = (0.20 + groundEdge * 0.28 + grid * 0.14) * mix(0.88, 1.32, uPulse) * topFade;
          gl_FragColor = vec4(col, clamp(alpha, 0.08, 0.68));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.wallMesh = new THREE.Mesh(this.wallGeo, this.wallMat);
    this.wallMesh.position.y = 140;
    this.wallMesh.frustumCulled = false;
    this.wallMesh.renderOrder = 14;
    this.wallMesh.visible = false;

    this.perimeterGeo = new THREE.CylinderGeometry(1, 1, 14, 96, 1, true);
    this.perimeterMat = new THREE.MeshBasicMaterial({
      color: '#60a5fa',
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.perimeterMesh = new THREE.Mesh(this.perimeterGeo, this.perimeterMat);
    this.perimeterMesh.position.y = 5.5;
    this.perimeterMesh.frustumCulled = false;
    this.perimeterMesh.renderOrder = 15;
    this.perimeterMesh.visible = false;

    this.root.frustumCulled = false;
    this.root.add(this.wallMesh, this.perimeterMesh);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.root.visible = true;
    this.wallMesh.visible = active;
    this.perimeterMesh.visible = active;
    if (!active) {
      this.serverZone = null;
      this.elapsed = 0;
      this.lastCenterX = Number.NaN;
      this.lastCenterZ = Number.NaN;
      this.lastRadius = Number.NaN;
      this.lastShrinking = null;
    }
  }

  applyServerZone(zone: ServerZoneState): void {
    this.serverZone = { ...zone };
    this.state = {
      phaseIndex: zone.phase,
      currentCenterX: zone.currentCenterX,
      currentCenterZ: zone.currentCenterZ,
      currentRadius: zone.currentRadius,
      targetCenterX: zone.nextCenterX,
      targetCenterZ: zone.nextCenterZ,
      targetRadius: zone.nextRadius,
      damagePerSecond: zone.damagePerSec,
      isShrinking: zone.state === 'shrinking',
    };
  }

  getServerZone(): ServerZoneState | null {
    return this.serverZone;
  }

  getState(): SafeZoneState {
    return this.state;
  }

  isInsideSafeZone(x: number, z: number): boolean {
    if (!this.active) return true;
    const dx = x - this.state.currentCenterX;
    const dz = z - this.state.currentCenterZ;
    return dx * dx + dz * dz <= this.state.currentRadius * this.state.currentRadius;
  }

  update(deltaSeconds: number): void {
    if (!this.active) {
      this.wallMesh.visible = false;
      this.perimeterMesh.visible = false;
      return;
    }

    this.elapsed += deltaSeconds;
    this.wallMat.uniforms.uTime.value = this.elapsed;

    // Smooth local countdown between 20Hz server ticks
    if (this.serverZone && this.serverZone.timeRemainingSec > 0) {
      this.serverZone.timeRemainingSec = Math.max(
        0,
        this.serverZone.timeRemainingSec - deltaSeconds,
      );
    }

    const r = Math.max(2, this.state.currentRadius);
    this.root.visible = true;
    this.wallMesh.visible = true;
    this.perimeterMesh.visible = true;

    const cx = this.state.currentCenterX;
    const cz = this.state.currentCenterZ;
    if (
      Math.abs(cx - this.lastCenterX) > 0.001 ||
      Math.abs(cz - this.lastCenterZ) > 0.001 ||
      Math.abs(r - this.lastRadius) > 0.001
    ) {
      this.wallMesh.position.set(cx, 140, cz);
      this.wallMesh.scale.set(r, 1, r);
      this.perimeterMesh.position.set(cx, 5.5, cz);
      this.perimeterMesh.scale.set(r, 1, r);
      this.lastCenterX = cx;
      this.lastCenterZ = cz;
      this.lastRadius = r;
    }
    if (this.lastShrinking !== this.state.isShrinking) {
      this.lastShrinking = this.state.isShrinking;
    }
    if (this.state.isShrinking) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 4.5);
      this.wallMat.uniforms.uPulse.value = 0.65 + pulse * 0.35;
      this.perimeterMat.opacity = 0.5 + pulse * 0.18;
    } else {
      this.wallMat.uniforms.uPulse.value = 0.15;
      this.perimeterMat.opacity = 0.4;
    }
  }

  dispose(): void {
    this.wallGeo.dispose();
    this.wallMat.dispose();
    this.perimeterGeo.dispose();
    this.perimeterMat.dispose();
  }
}
