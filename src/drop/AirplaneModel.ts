import * as THREE from 'three';

/**
 * Composite 12+ part procedural 3D transport dropship airplane (`THREE.Group`).
 * Oriented so local +Z is forward along the flight heading and -Z is the open rear cargo jump ramp.
 */
export class AirplaneModel {
  readonly root = new THREE.Group();
  readonly jumpBayAnchor = new THREE.Object3D();

  private readonly propellers: THREE.Object3D[] = [];
  private readonly strobeLeftMat: THREE.MeshStandardMaterial;
  private readonly strobeRightMat: THREE.MeshStandardMaterial;
  private readonly rampBeaconMat: THREE.MeshStandardMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor() {
    const hullMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.42,
        metalness: 0.62,
      }),
    );
    const bellyMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.58,
        metalness: 0.48,
      }),
    );
    const wingMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        roughness: 0.45,
        metalness: 0.58,
      }),
    );
    const accentStripeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#f97316',
        roughness: 0.35,
        metalness: 0.25,
      }),
    );
    const cockpitGlassMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: '#0f172a',
        roughness: 0.12,
        metalness: 0.25,
        clearcoat: 1.0,
        emissive: '#0ea5e9',
        emissiveIntensity: 0.28,
      }),
    );
    const engineMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.36,
        metalness: 0.78,
      }),
    );
    const propBladeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.5,
        metalness: 0.4,
      }),
    );
    const interiorDeckMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.72,
        metalness: 0.22,
        emissive: '#f59e0b',
        emissiveIntensity: 0.22,
      }),
    );
    const thrusterGlowMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#38bdf8',
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
    );

    this.strobeLeftMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#ef4444',
        emissiveIntensity: 2.2,
        roughness: 0.2,
      }),
    );
    this.strobeRightMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#22c55e',
        emissiveIntensity: 2.2,
        roughness: 0.2,
      }),
    );
    this.rampBeaconMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#f59e0b',
        emissiveIntensity: 2.0,
        roughness: 0.2,
      }),
    );

    // 1. Primary fuselage hull (cylinder rotated along Z)
    const fuselageGeo = this.trackGeo(new THREE.CylinderGeometry(1.75, 1.95, 13.5, 14));
    fuselageGeo.rotateX(Math.PI * 0.5);
    const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
    fuselage.position.set(0, 0.4, 0.5);
    fuselage.castShadow = true;
    this.root.add(fuselage);

    // 2. Belly keel armor & gear sponsons
    const bellyGeo = this.trackGeo(new THREE.BoxGeometry(2.7, 0.9, 11.4));
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.set(0, -0.95, 0.4);
    this.root.add(belly);

    // Nose cone (+Z front)
    const noseGeo = this.trackGeo(new THREE.ConeGeometry(1.75, 4.4, 14));
    noseGeo.rotateX(Math.PI * 0.5);
    const nose = new THREE.Mesh(noseGeo, hullMat);
    nose.position.set(0, 0.2, 9.45);
    nose.castShadow = true;
    this.root.add(nose);

    // 3. Cockpit brow & armored canopy glass
    const cockpitFrameGeo = this.trackGeo(new THREE.BoxGeometry(2.2, 1.05, 2.8));
    const cockpitFrame = new THREE.Mesh(cockpitFrameGeo, hullMat);
    cockpitFrame.position.set(0, 1.25, 6.4);
    cockpitFrame.rotation.x = 0.22;
    this.root.add(cockpitFrame);

    const canopyGeo = this.trackGeo(new THREE.BoxGeometry(2.05, 0.72, 2.2));
    const canopy = new THREE.Mesh(canopyGeo, cockpitGlassMat);
    canopy.position.set(0, 1.4, 6.95);
    canopy.rotation.x = 0.34;
    this.root.add(canopy);

    // Nose accent stripe
    const stripeGeo = this.trackGeo(new THREE.BoxGeometry(3.62, 0.28, 10.6));
    const stripe = new THREE.Mesh(stripeGeo, accentStripeMat);
    stripe.position.set(0, 0.55, 1.6);
    this.root.add(stripe);

    // 4. Open rear cargo bay + lowered drop ramp (-Z)
    const bayFloorGeo = this.trackGeo(new THREE.BoxGeometry(2.6, 0.22, 4.8));
    const bayFloor = new THREE.Mesh(bayFloorGeo, interiorDeckMat);
    bayFloor.position.set(0, -0.55, -6.9);
    this.root.add(bayFloor);

    const bayRoofGeo = this.trackGeo(new THREE.BoxGeometry(2.9, 0.32, 3.8));
    const bayRoof = new THREE.Mesh(bayRoofGeo, hullMat);
    bayRoof.position.set(0, 1.65, -6.5);
    bayRoof.rotation.x = -0.15;
    this.root.add(bayRoof);

    const sideWallGeo = this.trackGeo(new THREE.BoxGeometry(0.24, 2.0, 3.6));
    const leftWall = new THREE.Mesh(sideWallGeo, bellyMat);
    leftWall.position.set(-1.35, 0.45, -6.4);
    const rightWall = new THREE.Mesh(sideWallGeo, bellyMat);
    rightWall.position.set(1.35, 0.45, -6.4);
    this.root.add(leftWall, rightWall);

    // Lowered angled rear drop ramp
    const rampGeo = this.trackGeo(new THREE.BoxGeometry(2.5, 0.18, 3.2));
    const ramp = new THREE.Mesh(rampGeo, interiorDeckMat);
    ramp.position.set(0, -1.02, -9.5);
    ramp.rotation.x = 0.28;
    this.root.add(ramp);

    // Jump strobe beacon above cargo exit
    const beaconGeo = this.trackGeo(new THREE.BoxGeometry(0.45, 0.25, 0.3));
    const beacon = new THREE.Mesh(beaconGeo, this.rampBeaconMat);
    beacon.position.set(0, 1.35, -8.35);
    this.root.add(beacon);

    // Anchor where the player stands before jumping
    this.jumpBayAnchor.position.set(0, -0.45, -8.3);
    this.root.add(this.jumpBayAnchor);

    // 5. High-mounted main wings (swept)
    const wingGeo = this.trackGeo(new THREE.BoxGeometry(24.5, 0.36, 3.8));
    const mainWing = new THREE.Mesh(wingGeo, wingMat);
    mainWing.position.set(0, 1.95, 1.1);
    mainWing.castShadow = true;
    this.root.add(mainWing);

    // Wingtip winglets + navigation strobes
    const wingletGeo = this.trackGeo(new THREE.BoxGeometry(0.28, 1.35, 2.1));
    const leftWinglet = new THREE.Mesh(wingletGeo, accentStripeMat);
    leftWinglet.position.set(-12.25, 2.52, 0.75);
    leftWinglet.rotation.z = 0.2;
    const rightWinglet = new THREE.Mesh(wingletGeo, accentStripeMat);
    rightWinglet.position.set(12.25, 2.52, 0.75);
    rightWinglet.rotation.z = -0.2;
    this.root.add(leftWinglet, rightWinglet);

    const strobeGeo = this.trackGeo(new THREE.SphereGeometry(0.22, 8, 8));
    const leftStrobe = new THREE.Mesh(strobeGeo, this.strobeLeftMat);
    leftStrobe.position.set(-12.45, 3.12, 0.95);
    const rightStrobe = new THREE.Mesh(strobeGeo, this.strobeRightMat);
    rightStrobe.position.set(12.45, 3.12, 0.95);
    this.root.add(leftStrobe, rightStrobe);

    // 6. Tail vertical stabilizer & horizontal elevators
    const vTailGeo = this.trackGeo(new THREE.BoxGeometry(0.36, 4.6, 3.4));
    const vTail = new THREE.Mesh(vTailGeo, accentStripeMat);
    vTail.position.set(0, 3.85, -6.2);
    vTail.rotation.x = -0.28;
    vTail.castShadow = true;
    this.root.add(vTail);

    const hTailGeo = this.trackGeo(new THREE.BoxGeometry(9.2, 0.28, 2.2));
    const hTail = new THREE.Mesh(hTailGeo, wingMat);
    hTail.position.set(0, 2.15, -6.9);
    this.root.add(hTail);

    // 7. 4 Turboprop engine nacelles + spinning 4-blade propellers
    const nacelleOffsetsX = [-8.2, -4.4, 4.4, 8.2];
    const nacelleGeo = this.trackGeo(new THREE.CylinderGeometry(0.54, 0.48, 3.0, 10));
    nacelleGeo.rotateX(Math.PI * 0.5);
    const nozzleGeo = this.trackGeo(new THREE.CylinderGeometry(0.34, 0.42, 0.35, 10));
    nozzleGeo.rotateX(Math.PI * 0.5);
    const hubGeo = this.trackGeo(new THREE.ConeGeometry(0.28, 0.65, 8));
    hubGeo.rotateX(Math.PI * 0.5);
    const bladeGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 2.4, 0.06));

    for (const nx of nacelleOffsetsX) {
      const nacelle = new THREE.Mesh(nacelleGeo, engineMat);
      nacelle.position.set(nx, 1.55, 2.25);
      nacelle.castShadow = true;
      this.root.add(nacelle);

      const glowNozzle = new THREE.Mesh(nozzleGeo, thrusterGlowMat);
      glowNozzle.position.set(nx, 1.55, 0.68);
      this.root.add(glowNozzle);

      const propGroup = new THREE.Group();
      propGroup.position.set(nx, 1.55, 3.85);
      const hub = new THREE.Mesh(hubGeo, accentStripeMat);
      hub.position.z = 0.22;
      const bladeA = new THREE.Mesh(bladeGeo, propBladeMat);
      const bladeB = new THREE.Mesh(bladeGeo, propBladeMat);
      bladeB.rotation.z = Math.PI * 0.5;
      propGroup.add(hub, bladeA, bladeB);
      this.root.add(propGroup);
      this.propellers.push(propGroup);
    }

    // 8. Landing gear side sponson pods
    const podGeo = this.trackGeo(new THREE.BoxGeometry(0.7, 1.0, 4.5));
    const leftPod = new THREE.Mesh(podGeo, bellyMat);
    leftPod.position.set(-1.65, -0.75, -0.8);
    const rightPod = new THREE.Mesh(podGeo, bellyMat);
    rightPod.position.set(1.65, -0.75, -0.8);
    this.root.add(leftPod, rightPod);

    // Subtle aerial contrail ribbons behind outer wingtips
    const trailMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: '#e2e8f0',
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const trailGeo = this.trackGeo(new THREE.PlaneGeometry(0.28, 22));
    trailGeo.rotateX(Math.PI * 0.5);
    const leftTrail = new THREE.Mesh(trailGeo, trailMat);
    leftTrail.position.set(-12.2, 2.9, -10.4);
    const rightTrail = new THREE.Mesh(trailGeo, trailMat);
    rightTrail.position.set(12.2, 2.9, -10.4);
    this.root.add(leftTrail, rightTrail);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  update(delta: number, elapsed: number): void {
    const spin = delta * 34;
    for (let i = 0; i < this.propellers.length; i++) {
      this.propellers[i].rotation.z += i % 2 === 0 ? spin : -spin;
    }

    const pulse = Math.sin(elapsed * 8.5) > 0.2 ? 2.8 : 0.45;
    this.strobeLeftMat.emissiveIntensity = pulse;
    this.strobeRightMat.emissiveIntensity = pulse;
    this.rampBeaconMat.emissiveIntensity = 1.2 + Math.sin(elapsed * 5.5) * 0.9;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
