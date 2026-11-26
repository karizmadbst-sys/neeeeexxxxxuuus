import * as THREE from 'three';
import type { DropPhase } from './IAirplaneDropSystem';
import { clamp, damp } from '../utils/MathUtils';

const WIND_STREAK_COUNT = 72;

interface WindStreakParticle {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  speedMul: number;
  lengthMul: number;
}

/**
 * Handles 3D parachute canopy + harness risers, high-speed skydiving wind streaks
 * (`InstancedMesh`), and landing dust ring effects.
 */
export class SkydivingEffects {
  readonly root = new THREE.Group();

  private readonly chuteGroup = new THREE.Group();
  private readonly chuteMaterial: THREE.MeshStandardMaterial;
  private readonly accentPanelMat: THREE.MeshStandardMaterial;
  private readonly windMesh: THREE.InstancedMesh;
  private readonly windMat: THREE.MeshBasicMaterial;
  private readonly windParticles: WindStreakParticle[] = [];

  private readonly dustMesh: THREE.Mesh;
  private readonly dustMat: THREE.MeshBasicMaterial;
  private dustTimer = 0;

  private readonly dummy = new THREE.Object3D();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private chuteUnfurlScale = 0.05;

  constructor() {
    // 1. Multi-panel Tactical Parachute Canopy + Risers
    this.chuteGroup.visible = false;
    this.chuteGroup.rotation.order = 'YXZ';
    this.chuteGroup.position.set(0, 2.35, 0);
    this.root.add(this.chuteGroup);

    this.chuteMaterial = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#f97316',
        roughness: 0.65,
        metalness: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    this.accentPanelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.65,
        metalness: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    const cordMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.8,
      }),
    );

    // Curved 5-panel parafoil wing arch
    const panelOffsets = [-1.45, -0.74, 0, 0.74, 1.45];
    const panelGeo = this.trackGeo(new THREE.BoxGeometry(0.76, 0.14, 1.85));
    for (let i = 0; i < panelOffsets.length; i++) {
      const px = panelOffsets[i];
      const archY = 1.65 - Math.abs(px) * 0.22;
      const tiltZ = -px * 0.22;
      const panel = new THREE.Mesh(
        panelGeo,
        i % 2 === 0 ? this.chuteMaterial : this.accentPanelMat,
      );
      panel.position.set(px, archY, 0);
      panel.rotation.z = tiltZ;
      panel.castShadow = true;
      this.chuteGroup.add(panel);
    }

    // 6 suspension riser cords connecting canopy corners down to shoulder harness
    const cordGeo = this.trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 2.05, 5));
    const cordCoords: Array<[number, number, number]> = [
      [-1.3, 0.55, 0.45],
      [-1.3, 0.55, -0.45],
      [0, 0.65, 0.55],
      [0, 0.65, -0.55],
      [1.3, 0.55, 0.45],
      [1.3, 0.55, -0.45],
    ];
    for (const [cx, cz, zOff] of cordCoords) {
      const cord = new THREE.Mesh(cordGeo, cordMat);
      cord.position.set(cx * 0.55, 0.62, zOff * 0.55);
      cord.rotation.z = Math.atan2(cx * 0.9, 1.65);
      cord.rotation.x = -Math.atan2(zOff * 0.7, 1.65);
      this.chuteGroup.add(cord);
      void cz;
    }

    // 2. Instanced Wind Speed Streaks around player during freefall / chute descent
    const streakGeo = this.trackGeo(new THREE.CylinderGeometry(0.018, 0.008, 2.4, 5));
    this.windMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: '#e0f2fe',
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      }),
    );
    this.windMesh = new THREE.InstancedMesh(streakGeo, this.windMat, WIND_STREAK_COUNT);
    this.windMesh.frustumCulled = false;
    this.windMesh.castShadow = false;
    this.windMesh.receiveShadow = false;
    this.windMesh.visible = false;
    this.root.add(this.windMesh);

    for (let i = 0; i < WIND_STREAK_COUNT; i++) {
      const angle = (i / WIND_STREAK_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const radius = 2.4 + Math.random() * 10.5;
      this.windParticles.push({
        offsetX: Math.cos(angle) * radius,
        offsetY: (Math.random() - 0.5) * 26,
        offsetZ: Math.sin(angle) * radius,
        speedMul: 0.78 + Math.random() * 0.55,
        lengthMul: 0.7 + Math.random() * 1.1,
      });
    }

    // 3. Touchdown Dust Ring Burst
    const dustGeo = this.trackGeo(new THREE.RingGeometry(0.45, 1.35, 24));
    dustGeo.rotateX(-Math.PI * 0.5);
    this.dustMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: '#e2e8f0',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.dustMesh = new THREE.Mesh(dustGeo, this.dustMat);
    this.dustMesh.visible = false;
    this.root.add(this.dustMesh);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  setParachuteColors(primaryHex: string, accentHex: string): void {
    this.chuteMaterial.color.set(primaryHex);
    this.accentPanelMat.color.set(accentHex);
  }

  triggerParachuteOpen(): void {
    this.chuteUnfurlScale = 0.06;
    this.chuteGroup.visible = true;
    this.chuteGroup.scale.setScalar(0.06);
  }

  triggerLandingDust(x: number, y: number, z: number): void {
    this.chuteGroup.visible = false;
    this.dustMesh.visible = true;
    this.dustMesh.position.set(x, y + 0.12, z);
    this.dustMesh.scale.setScalar(0.5);
    this.dustMat.opacity = 0.55;
    this.dustTimer = 0.55;
  }

  setCompactMode(compact: boolean): void {
    this.windMesh.count = compact ? 40 : WIND_STREAK_COUNT;
    for (let i = 0; i < this.chuteGroup.children.length; i++) {
      this.chuteGroup.children[i].castShadow = !compact;
    }
  }

  reset(): void {
    this.chuteGroup.visible = false;
    this.chuteUnfurlScale = 0.05;
    this.windMesh.visible = false;
    this.dustMesh.visible = false;
    this.dustTimer = 0;
  }

  update(
    delta: number,
    elapsed: number,
    phase: DropPhase,
    playerPos: THREE.Vector3,
    playerYaw: number,
    bankRad: number,
    verticalSpeedMps: number,
    totalSpeedMps: number,
  ): void {
    // Update parachute canopy
    if (phase === 'parachute') {
      this.chuteGroup.visible = true;
      this.chuteUnfurlScale = damp(this.chuteUnfurlScale, 1.0, 9.5, delta);
      this.chuteGroup.scale.set(
        this.chuteUnfurlScale,
        this.chuteUnfurlScale,
        this.chuteUnfurlScale,
      );
      this.chuteGroup.position.set(playerPos.x, playerPos.y + 1.85, playerPos.z);
      this.chuteGroup.rotation.y = playerYaw;
      this.chuteGroup.rotation.z = bankRad * 0.55 + Math.sin(elapsed * 2.4) * 0.04;
      this.chuteGroup.rotation.x = 0.08 + Math.cos(elapsed * 2.1) * 0.03;
    } else {
      this.chuteGroup.visible = false;
    }

    // Update high-speed wind streaks
    const showWind = phase === 'freefall' || phase === 'parachute';
    this.windMesh.visible = showWind;
    if (showWind) {
      const intensity =
        phase === 'freefall'
          ? clamp((totalSpeedMps - 14) / 42, 0.25, 1.0)
          : clamp((totalSpeedMps - 6) / 20, 0.08, 0.3);
      this.windMat.opacity = intensity * 0.42;

      const streamSpeed = Math.max(14, Math.abs(verticalSpeedMps) * 1.15);
      const activeCount = this.windMesh.count;
      for (let i = 0; i < activeCount; i++) {
        const p = this.windParticles[i];
        p.offsetY += streamSpeed * p.speedMul * delta;
        if (p.offsetY > 14) {
          p.offsetY -= 28;
        }
        this.dummy.position.set(
          playerPos.x + p.offsetX,
          playerPos.y + p.offsetY,
          playerPos.z + p.offsetZ,
        );
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(
          1,
          p.lengthMul * (0.7 + intensity * 1.6),
          1,
        );
        this.dummy.updateMatrix();
        this.windMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.windMesh.instanceMatrix.needsUpdate = true;
    }

    // Update landing dust ring
    if (this.dustTimer > 0) {
      this.dustTimer = Math.max(0, this.dustTimer - delta);
      const t = 1 - this.dustTimer / 0.55;
      this.dustMesh.scale.setScalar(0.6 + t * 2.8);
      this.dustMat.opacity = (1 - t) * 0.5;
      if (this.dustTimer <= 0) {
        this.dustMesh.visible = false;
      }
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
