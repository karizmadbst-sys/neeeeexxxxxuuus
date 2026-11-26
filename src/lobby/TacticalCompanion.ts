import * as THREE from 'three';
import type { Subsystem } from '../core/Types';
import type { R6PetId } from '../player/R6CustomizationData';

/**
 * Realistic tactical companion beside the player in the Military Base Lobby:
 * - 'wolf': K9 Belgian Malinois Shepherd with tactical harness
 * - 'fox': Arctic White Shepherd K9 Unit with winter harness
 * - 'parrot': Autonomous Quad-Rotor Recon Drone with gimbal camera & spinning blades
 * - 'creeper_bot': Compact Tracked Tactical UGV Sentry with optic turret
 * - 'none': Hidden
 */
export class TacticalCompanion implements Subsystem {
  readonly root = new THREE.Group();

  private readonly unitPivot = new THREE.Group();
  private headPivot: THREE.Group | null = null;
  private tailPivot: THREE.Group | null = null;
  private legPivots: THREE.Group[] = [];
  private earPivots: THREE.Group[] = [];
  private rotors: THREE.Object3D[] = [];
  private kind: R6PetId = 'wolf';

  private targetSpeed = 0;
  private smoothedSpeed = 0;
  private isAirborne = false;
  private trotPhase = 0;
  private reactionTimer = 0;
  private readonly reactionDuration = 1.15;

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  constructor(initialKind: R6PetId = 'wolf') {
    this.root.add(this.unitPivot);
    this.setKind(initialKind);
  }

  getKind(): R6PetId {
    return this.kind;
  }

  setMotionState(speedMps: number, isAirborne = false): void {
    this.targetSpeed = Math.max(0, speedMps);
    this.isAirborne = isAirborne;
  }

  triggerReaction(): void {
    this.reactionTimer = this.reactionDuration;
  }

  setKind(kind: R6PetId): void {
    this.kind = kind;
    this.clearMeshes();
    this.unitPivot.position.set(0, 0, 0);
    this.unitPivot.rotation.set(0, 0, 0);

    if (kind === 'none') {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    if (kind === 'parrot') {
      this.buildReconDrone();
    } else if (kind === 'creeper_bot') {
      this.buildTrackedUgv();
    } else {
      this.buildTacticalK9(kind === 'fox');
    }
  }

  private addMat(mat: THREE.Material): THREE.Material {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private addGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeometries.push(geo);
    return geo;
  }

  private addPart(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildTacticalK9(isArctic: boolean): void {
    const coat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: isArctic ? '#dce3eb' : '#9c6e44',
        roughness: 0.78,
        metalness: 0.04,
      }),
    );
    const muzzleCoat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: isArctic ? '#94a3b8' : '#2c221c',
        roughness: 0.75,
        metalness: 0.05,
      }),
    );
    const harnessMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#252e38',
        roughness: 0.58,
        metalness: 0.25,
      }),
    );
    const glowMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: isArctic ? '#38bdf8' : '#f59e0b',
        emissive: isArctic ? '#38bdf8' : '#f59e0b',
        emissiveIntensity: 0.85,
        roughness: 0.25,
      }),
    );
    const eyeMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#14110f', roughness: 0.2 }),
    );

    // Muscular sculpted torso + chest + Kevlar K9 harness
    const torsoGeo = this.addGeo(new THREE.CapsuleGeometry(0.145, 0.36, 8, 14));
    this.addPart(this.unitPivot, torsoGeo, coat, 0, 0.44, -0.02, Math.PI / 2 - 0.08, 0, 0, 0.92, 1.0, 1.05);

    const chestGeo = this.addGeo(new THREE.SphereGeometry(0.155, 12, 10));
    this.addPart(this.unitPivot, chestGeo, coat, 0, 0.48, 0.14, 0, 0, 0, 0.9, 1.05, 1.1);

    const harnessGeo = this.addGeo(new THREE.CylinderGeometry(0.158, 0.152, 0.22, 14));
    this.addPart(this.unitPivot, harnessGeo, harnessMat, 0, 0.455, 0.06, Math.PI / 2, 0, 0, 0.96, 1, 1.05);

    const pouchGeo = this.addGeo(new THREE.BoxGeometry(0.05, 0.1, 0.14));
    this.addPart(this.unitPivot, pouchGeo, harnessMat, -0.15, 0.47, 0.04);
    this.addPart(this.unitPivot, pouchGeo, harnessMat, 0.15, 0.47, 0.04);

    const patchGeo = this.addGeo(new THREE.BoxGeometry(0.08, 0.02, 0.05));
    this.addPart(this.unitPivot, patchGeo, glowMat, 0, 0.605, 0.06);

    // Neck + articulated Head + Ears
    const neckGeo = this.addGeo(new THREE.CylinderGeometry(0.095, 0.12, 0.18, 12));
    this.addPart(this.unitPivot, neckGeo, coat, 0, 0.58, 0.21, 0.38);

    const head = new THREE.Group();
    head.position.set(0, 0.66, 0.28);
    this.headPivot = head;
    this.unitPivot.add(head);

    const skullGeo = this.addGeo(new THREE.SphereGeometry(0.115, 12, 10));
    this.addPart(head, skullGeo, coat, 0, 0, 0, 0, 0, 0, 0.92, 0.95, 1.1);

    const snoutGeo = this.addGeo(new THREE.CapsuleGeometry(0.048, 0.09, 6, 10));
    this.addPart(head, snoutGeo, muzzleCoat, 0, -0.028, 0.115, Math.PI / 2 + 0.08, 0, 0, 1.0, 1.0, 0.85);

    const noseGeo = this.addGeo(new THREE.SphereGeometry(0.022, 8, 8));
    this.addPart(head, noseGeo, eyeMat, 0, -0.012, 0.182);

    const earGeo = this.addGeo(new THREE.ConeGeometry(0.036, 0.115, 6));
    for (const side of [-1, 1] as const) {
      const earPivot = new THREE.Group();
      earPivot.position.set(side * 0.064, 0.09, -0.02);
      this.addPart(earPivot, earGeo, muzzleCoat, 0, 0.045, 0, 0.14, 0, -side * 0.16, 0.72, 1, 0.65);
      head.add(earPivot);
      this.earPivots.push(earPivot);
    }

    const eyeGeo = this.addGeo(new THREE.SphereGeometry(0.016, 8, 8));
    this.addPart(head, eyeGeo, eyeMat, -0.046, 0.028, 0.096);
    this.addPart(head, eyeGeo, eyeMat, 0.046, 0.028, 0.096);

    // 4 articulated Legs + Paws (order: FL, FR, RL, RR)
    const legUpperGeo = this.addGeo(new THREE.CapsuleGeometry(0.042, 0.18, 6, 8));
    const legLowerGeo = this.addGeo(new THREE.CapsuleGeometry(0.032, 0.18, 6, 8));
    const pawGeo = this.addGeo(new THREE.SphereGeometry(0.04, 8, 6));
    const legCoords: Array<[number, number]> = [
      [-0.088, 0.17],
      [0.088, 0.17],
      [-0.085, -0.19],
      [0.085, -0.19],
    ];
    for (const [lx, lz] of legCoords) {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.4, lz);
      this.addPart(legPivot, legUpperGeo, coat, 0, -0.09, 0, lz > 0 ? 0.08 : -0.12);
      this.addPart(
        legPivot,
        legLowerGeo,
        isArctic ? coat : muzzleCoat,
        0,
        -0.27,
        lz > 0 ? 0.01 : -0.02,
        0,
      );
      this.addPart(legPivot, pawGeo, muzzleCoat, 0, -0.375, 0.015, 0, 0, 0, 1.0, 0.6, 1.25);
      this.unitPivot.add(legPivot);
      this.legPivots.push(legPivot);
    }

    // Tail
    const tail = new THREE.Group();
    tail.position.set(0, 0.45, -0.27);
    this.tailPivot = tail;
    this.unitPivot.add(tail);
    const tailGeo = this.addGeo(new THREE.CapsuleGeometry(0.024, 0.24, 6, 8));
    this.addPart(tail, tailGeo, muzzleCoat, 0, -0.08, -0.08, -0.82);
  }

  private buildReconDrone(): void {
    const bodyMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.34, metalness: 0.72 }),
    );
    const trimMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.4, metalness: 0.6 }),
    );
    const lensMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#38bdf8',
        emissiveIntensity: 1.4,
        roughness: 0.15,
      }),
    );
    const rotorMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.35, metalness: 0.5 }),
    );

    // Central fuselage + optical gimbal camera
    const hullGeo = this.addGeo(new THREE.SphereGeometry(0.16, 14, 10));
    this.addPart(this.unitPivot, hullGeo, bodyMat, 0, 1.42, 0, 0, 0, 0, 1.25, 0.58, 1.55);

    const eyeGeo = this.addGeo(new THREE.SphereGeometry(0.055, 10, 10));
    this.addPart(this.unitPivot, eyeGeo, lensMat, 0, 1.38, 0.2);

    const armGeo = this.addGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8));
    const motorGeo = this.addGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 10));
    const bladeGeo = this.addGeo(new THREE.BoxGeometry(0.32, 0.008, 0.028));

    const offsets: Array<[number, number]> = [
      [-0.24, 0.24],
      [0.24, 0.24],
      [-0.24, -0.24],
      [0.24, -0.24],
    ];
    for (const [ox, oz] of offsets) {
      this.addPart(
        this.unitPivot,
        armGeo,
        trimMat,
        ox * 0.5,
        1.43,
        oz * 0.5,
        Math.PI / 2,
        0,
        Math.atan2(ox, oz),
      );
      this.addPart(this.unitPivot, motorGeo, bodyMat, ox, 1.45, oz);
      const rotor = new THREE.Group();
      rotor.position.set(ox, 1.475, oz);
      this.addPart(rotor, bladeGeo, rotorMat, 0, 0, 0);
      this.addPart(rotor, bladeGeo, rotorMat, 0, 0, 0, 0, Math.PI / 2, 0);
      this.unitPivot.add(rotor);
      this.rotors.push(rotor);
    }
  }

  private buildTrackedUgv(): void {
    const armorMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 }),
    );
    const treadMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.85, metalness: 0.15 }),
    );
    const opticMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#22c55e',
        emissiveIntensity: 1.2,
        roughness: 0.2,
      }),
    );

    const chassisGeo = this.addGeo(new THREE.BoxGeometry(0.42, 0.18, 0.52));
    this.addPart(this.unitPivot, chassisGeo, armorMat, 0, 0.18, 0);

    const trackGeo = this.addGeo(new THREE.CapsuleGeometry(0.085, 0.44, 6, 10));
    this.addPart(this.unitPivot, trackGeo, treadMat, -0.24, 0.1, 0, Math.PI / 2, 0, 0, 0.9, 1, 1);
    this.addPart(this.unitPivot, trackGeo, treadMat, 0.24, 0.1, 0, Math.PI / 2, 0, 0, 0.9, 1, 1);

    const turret = new THREE.Group();
    turret.position.set(0, 0.32, 0.04);
    this.headPivot = turret;
    this.unitPivot.add(turret);

    const mastGeo = this.addGeo(new THREE.CylinderGeometry(0.055, 0.075, 0.14, 10));
    this.addPart(turret, mastGeo, armorMat, 0, 0.02, 0);
    const camHeadGeo = this.addGeo(new THREE.BoxGeometry(0.18, 0.1, 0.15));
    this.addPart(turret, camHeadGeo, armorMat, 0, 0.12, 0.02);
    const lensGeo = this.addGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 10));
    this.addPart(turret, lensGeo, opticMat, -0.04, 0.12, 0.098, Math.PI / 2);
    this.addPart(turret, lensGeo, opticMat, 0.04, 0.12, 0.098, Math.PI / 2);
  }

  private clearMeshes(): void {
    this.unitPivot.clear();
    this.headPivot = null;
    this.tailPivot = null;
    this.legPivots.length = 0;
    this.earPivots.length = 0;
    this.rotors.length = 0;
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
  }

  update(delta: number, elapsed: number): void {
    if (!this.root.visible) return;

    const dt = Math.min(0.05, Math.max(0.0001, delta));
    const blendAlpha = 1 - Math.exp(-10 * dt);
    this.smoothedSpeed += (this.targetSpeed - this.smoothedSpeed) * blendAlpha;
    const moveFactor = Math.min(1, this.smoothedSpeed / 5.2);

    if (this.reactionTimer > 0) {
      this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    }
    const reactNorm = this.reactionTimer > 0 ? 1 - this.reactionTimer / this.reactionDuration : 0;
    const reactPulse = this.reactionTimer > 0 ? Math.sin(reactNorm * Math.PI * 2) : 0;
    const reactHop = this.reactionTimer > 0 ? Math.abs(Math.sin(reactNorm * Math.PI * 2)) : 0;

    if (this.kind === 'parrot') {
      const hoverY = Math.sin(elapsed * 2.6) * 0.07 + reactHop * 0.22;
      this.unitPivot.position.y = hoverY;
      this.unitPivot.rotation.x = moveFactor * 0.26 + reactPulse * 0.14;
      this.unitPivot.rotation.z =
        Math.sin(elapsed * 1.6) * 0.05 + (this.reactionTimer > 0 ? Math.sin(reactNorm * Math.PI * 4) * 0.22 : 0);
      this.unitPivot.rotation.y = this.reactionTimer > 0 ? reactNorm * Math.PI * 2 : 0;
      const rotorRate = 28 + moveFactor * 24 + (this.reactionTimer > 0 ? 16 : 0);
      for (const r of this.rotors) {
        r.rotation.y += dt * rotorRate;
      }
      return;
    }

    if (this.kind === 'creeper_bot') {
      const rumble = moveFactor > 0.04 ? Math.sin(elapsed * 22) * 0.012 * moveFactor : 0;
      this.unitPivot.position.y = rumble + reactHop * 0.12;
      this.unitPivot.rotation.x = moveFactor * -0.05 + reactPulse * -0.08;
      this.unitPivot.rotation.z = Math.sin(elapsed * 12) * 0.025 * moveFactor;
      if (this.headPivot) {
        const scanAmp = 0.28 * (1 - moveFactor * 0.65);
        this.headPivot.rotation.y = Math.sin(elapsed * 1.4) * scanAmp + reactPulse * 0.35;
        this.headPivot.rotation.x = Math.sin(elapsed * 2.1) * 0.06 + (this.isAirborne ? -0.12 : 0);
      }
      return;
    }

    // Quadruped K9 Shepherd / Arctic K9 gait & reaction
    const cycleRate = 3.2 + this.smoothedSpeed * 2.25;
    this.trotPhase += dt * cycleRate;

    const strideAmp = 0.56 * moveFactor;
    const isGallop = this.smoothedSpeed > 4.2 ? (this.smoothedSpeed - 4.2) / 3.0 : 0;
    const gallopFactor = Math.min(1, isGallop);

    if (this.legPivots.length === 4) {
      const pFL = Math.sin(this.trotPhase);
      const pFR = Math.sin(this.trotPhase + Math.PI * (1 - gallopFactor * 0.72));
      const pRL = Math.sin(this.trotPhase + Math.PI + gallopFactor * 0.55);
      const pRR = Math.sin(this.trotPhase + gallopFactor * 0.55);

      this.legPivots[0].rotation.x = pFL * strideAmp + reactHop * -0.35;
      this.legPivots[1].rotation.x = pFR * strideAmp + reactHop * -0.28;
      this.legPivots[2].rotation.x = pRL * strideAmp + reactHop * 0.2;
      this.legPivots[3].rotation.x = pRR * strideAmp + reactHop * 0.2;
    }

    const idleBreath = Math.sin(elapsed * 2.4) * 0.008 * (1 - moveFactor);
    const gaitBob = Math.abs(Math.sin(this.trotPhase)) * 0.042 * moveFactor;
    this.unitPivot.position.y = idleBreath + gaitBob + reactHop * 0.2;
    this.unitPivot.rotation.x =
      moveFactor * 0.05 * Math.cos(this.trotPhase) + reactHop * -0.14;
    this.unitPivot.rotation.z = Math.sin(this.trotPhase) * 0.03 * moveFactor;

    if (this.headPivot) {
      const scanAmp = 0.22 * (1 - moveFactor * 0.72);
      this.headPivot.rotation.y = Math.sin(elapsed * 1.1) * scanAmp + reactPulse * 0.24;
      this.headPivot.rotation.z = Math.sin(elapsed * 0.85) * 0.06 + reactPulse * 0.12;
      this.headPivot.rotation.x = Math.sin(elapsed * 2.2) * 0.03 - moveFactor * 0.05;
    }

    for (let i = 0; i < this.earPivots.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.earPivots[i].rotation.x = 0.08 * Math.sin(elapsed * 3.6 + i) - moveFactor * 0.14 - reactHop * 0.18;
      this.earPivots[i].rotation.z = side * 0.04 * Math.sin(elapsed * 2.7);
    }

    if (this.tailPivot) {
      const wagRate = 7.2 + moveFactor * 3.5 + (this.reactionTimer > 0 ? 8 : 0);
      const wagAmp = 0.34 - moveFactor * 0.14 + (this.reactionTimer > 0 ? 0.22 : 0);
      this.tailPivot.rotation.y = Math.sin(elapsed * wagRate) * wagAmp;
      this.tailPivot.rotation.x = moveFactor * -0.25 + reactHop * 0.24;
    }
  }

  dispose(): void {
    this.clearMeshes();
  }
}
