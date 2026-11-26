import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { DeviceProfile, Subsystem } from '../core/Types';
import type { PlayerCollisionWorld } from '../player/IPlayerController';
import { clamp } from '../utils/MathUtils';

interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  topY: number;
}

export class TestEnvironment implements Subsystem, PlayerCollisionWorld {
  readonly root = new THREE.Group();

  private readonly beaconRingOuter: THREE.Mesh;
  private readonly beaconRingInner: THREE.Mesh;
  private readonly beaconCore: THREE.Mesh;

  private readonly shopCrateGroup = new THREE.Group();
  private readonly shopAccentMat: THREE.MeshStandardMaterial;

  private readonly ambientMotes: THREE.Points;
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private readonly cameraCollisionMeshes: THREE.Object3D[] = [];
  private readonly boxColliders: BoxCollider[] = [];
  private readonly circleColliders: CircleCollider[] = [];

  private readonly arenaRadiusLimit = 23.5;
  private readonly terrainSpan = 200;
  private readonly terrainSegments = 64;
  private readonly terrainHeights: Float32Array;

  constructor(
    private readonly assetManager: AssetManager,
    deviceProfile: DeviceProfile,
  ) {
    const gridTex = this.assetManager.createProceduralGridTexture();
    const metalRoughTex = this.assetManager.createBrushedMetalTexture();
    const shadowTex = this.assetManager.createRadialShadowTexture();

    // 1. Extended Ground Terrain (exact vertex grid shared with ground height sampling)
    const groundGeo = new THREE.PlaneGeometry(
      this.terrainSpan,
      this.terrainSpan,
      this.terrainSegments,
      this.terrainSegments,
    );
    groundGeo.rotateX(-Math.PI / 2);
    const posAttr = groundGeo.attributes.position;
    this.terrainHeights = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const y = this.sampleAnalyticTerrainY(x, z);
      posAttr.setY(i, y);
      this.terrainHeights[i] = y;
    }
    groundGeo.computeVertexNormals();
    this.ownedGeometries.push(groundGeo);

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      map: gridTex,
      roughness: 0.88,
      metalness: 0.12,
    });
    this.ownedMaterials.push(groundMat);

    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = true;
    this.root.add(groundMesh);
    this.cameraCollisionMeshes.push(groundMesh);

    // 2. Central Drop Platform
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.55,
      metalness: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.25,
      roughnessMap: metalRoughTex,
      metalness: 0.88,
    });
    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.1,
    });
    const orangeGlowMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.1,
    });
    const darkArmorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.68,
      metalness: 0.3,
    });
    const contactMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.ownedMaterials.push(
      padMat,
      trimMat,
      cyanGlowMat,
      orangeGlowMat,
      darkArmorMat,
      contactMat,
    );

    const padBaseGeo = new THREE.CylinderGeometry(5.2, 5.8, 0.24, 8);
    const padRingGeo = new THREE.TorusGeometry(5.25, 0.1, 10, 32);
    padRingGeo.rotateX(Math.PI / 2);
    this.ownedGeometries.push(padBaseGeo, padRingGeo);

    const padBase = new THREE.Mesh(padBaseGeo, padMat);
    padBase.position.y = 0.12;
    padBase.receiveShadow = true;
    padBase.castShadow = true;
    this.root.add(padBase);
    this.cameraCollisionMeshes.push(padBase);

    const padRing = new THREE.Mesh(padRingGeo, trimMat);
    padRing.position.y = 0.24;
    this.root.add(padRing);

    // 3. Composite Nexus Spire / Holographic Beacon (at z = -4.4)
    const beaconGroup = new THREE.Group();
    beaconGroup.position.set(0, 0, -4.4);

    const plinthGeo = new THREE.CylinderGeometry(1.4, 1.8, 0.55, 6);
    const pylonGeo = new THREE.BoxGeometry(0.28, 3.8, 0.45);
    const outerRingGeo = new THREE.TorusGeometry(1.5, 0.06, 10, 36);
    const innerRingGeo = new THREE.TorusGeometry(1.05, 0.045, 10, 32);
    const coreGeo = new THREE.OctahedronGeometry(0.48, 0);
    this.ownedGeometries.push(plinthGeo, pylonGeo, outerRingGeo, innerRingGeo, coreGeo);

    const plinth = new THREE.Mesh(plinthGeo, trimMat);
    plinth.position.y = 0.275;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    beaconGroup.add(plinth);
    this.cameraCollisionMeshes.push(plinth);

    this.circleColliders.push({
      x: 0,
      z: -4.4,
      radius: 1.75,
      topY: 0.55,
    });

    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const pylon = new THREE.Mesh(pylonGeo, padMat);
      pylon.position.set(Math.sin(angle) * 1.35, 2.0, Math.cos(angle) * 1.35);
      pylon.rotation.y = angle;
      pylon.rotation.x = 0.14;
      pylon.castShadow = true;
      beaconGroup.add(pylon);
      this.cameraCollisionMeshes.push(pylon);
    }

    this.beaconRingOuter = new THREE.Mesh(outerRingGeo, cyanGlowMat);
    this.beaconRingOuter.position.y = 3.25;
    beaconGroup.add(this.beaconRingOuter);

    this.beaconRingInner = new THREE.Mesh(innerRingGeo, orangeGlowMat);
    this.beaconRingInner.position.y = 3.25;
    beaconGroup.add(this.beaconRingInner);

    this.beaconCore = new THREE.Mesh(coreGeo, cyanGlowMat);
    this.beaconCore.position.y = 3.25;
    beaconGroup.add(this.beaconCore);

    this.root.add(beaconGroup);

    // 4. Composite Supply Crate / Drop Pod Prop (Shop Showcase & Collision Obstacle)
    this.shopAccentMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xf97316,
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.4,
    });
    this.ownedMaterials.push(this.shopAccentMat);

    const shadowPlaneGeo = new THREE.PlaneGeometry(1.6, 1.6);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const crateBodyGeo = new THREE.BoxGeometry(1.5, 0.92, 1.05);
    const crateLidGeo = new THREE.BoxGeometry(1.58, 0.22, 1.12);
    const crateLatchGeo = new THREE.BoxGeometry(0.24, 0.36, 1.16);
    const crateStripGeo = new THREE.BoxGeometry(1.2, 0.08, 1.09);
    this.ownedGeometries.push(
      shadowPlaneGeo,
      crateBodyGeo,
      crateLidGeo,
      crateLatchGeo,
      crateStripGeo,
    );

    const crateShadow = new THREE.Mesh(shadowPlaneGeo, contactMat);
    crateShadow.scale.set(1.35, 1, 1.05);
    crateShadow.position.y = 0.02;
    this.shopCrateGroup.add(crateShadow);

    const crateBody = new THREE.Mesh(crateBodyGeo, darkArmorMat);
    crateBody.position.y = 0.46;
    crateBody.castShadow = true;
    crateBody.receiveShadow = true;
    this.shopCrateGroup.add(crateBody);
    this.cameraCollisionMeshes.push(crateBody);

    const crateLid = new THREE.Mesh(crateLidGeo, trimMat);
    crateLid.position.y = 1.02;
    crateLid.castShadow = true;
    this.shopCrateGroup.add(crateLid);

    const latchL = new THREE.Mesh(crateLatchGeo, trimMat);
    latchL.position.set(-0.46, 0.72, 0);
    this.shopCrateGroup.add(latchL);

    const latchR = new THREE.Mesh(crateLatchGeo, trimMat);
    latchR.position.set(0.46, 0.72, 0);
    this.shopCrateGroup.add(latchR);

    const crateStrip = new THREE.Mesh(crateStripGeo, this.shopAccentMat);
    crateStrip.position.y = 0.72;
    this.shopCrateGroup.add(crateStrip);

    const crateY = this.getGroundHeightAt(3.8, 2.2);
    this.shopCrateGroup.position.set(3.8, crateY, 2.2);
    this.shopCrateGroup.rotation.y = -0.42;
    this.root.add(this.shopCrateGroup);

    this.circleColliders.push({
      x: 3.8,
      z: 2.2,
      radius: 0.92,
      topY: crateY + 1.15,
    });

    // 5. Tactical Cover Walls / Obstacles for Collision & Camera Occlusion Testing
    this.buildCoverObstacle(-7.5, 4.5, 3.6, 2.6, 1.0, padMat, trimMat);
    this.buildCoverObstacle(8.2, -5.8, 3.2, 2.2, 1.1, padMat, trimMat);
    this.buildCoverObstacle(-6.5, -9.0, 2.4, 1.1, 2.4, padMat, trimMat);

    // 6. Instanced Natural Perimeter Rock Outcrops (42 instances)
    const rockCount = 42;
    const rockGeo = new THREE.DodecahedronGeometry(1.8, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.08,
      flatShading: true,
    });
    this.ownedGeometries.push(rockGeo);
    this.ownedMaterials.push(rockMat);

    const rockInstances = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockInstances.castShadow = true;
    rockInstances.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < rockCount; i++) {
      const angle = (i / rockCount) * Math.PI * 2 + ((i % 3) - 1) * 0.06;
      const radius = 25 + (i % 5) * 4.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const groundY = this.baseTerrainHeightAt(x, z);

      const scaleBase = 1.15 + ((i * 17) % 10) * 0.14;
      dummy.position.set(x, groundY + scaleBase * 0.45, z);
      dummy.rotation.set(i * 0.4, i * 1.1, i * 0.25);
      dummy.scale.set(scaleBase * 1.2, scaleBase * 0.85, scaleBase);
      dummy.updateMatrix();
      rockInstances.setMatrixAt(i, dummy.matrix);

      const shade = 0.16 + ((i * 7) % 10) * 0.015;
      color.setRGB(shade * 0.9, shade * 1.05, shade * 1.25);
      rockInstances.setColorAt(i, color);
    }
    rockInstances.instanceMatrix.needsUpdate = true;
    if (rockInstances.instanceColor) {
      rockInstances.instanceColor.needsUpdate = true;
    }
    rockInstances.computeBoundingSphere();
    this.root.add(rockInstances);

    // 7. Lightweight Atmospheric Dust Motes
    const moteCount = deviceProfile.isMobile ? 75 : 160;
    const motePositions = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      const angle = (i / moteCount) * Math.PI * 2 * 5;
      const rad = 2 + (i % 24);
      motePositions[i * 3] = Math.cos(angle) * rad;
      motePositions[i * 3 + 1] = 0.6 + ((i * 13) % 80) * 0.1;
      motePositions[i * 3 + 2] = Math.sin(angle) * rad;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    const moteMat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.09,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    });
    this.ownedGeometries.push(moteGeo);
    this.ownedMaterials.push(moteMat);

    this.ambientMotes = new THREE.Points(moteGeo, moteMat);
    this.root.add(this.ambientMotes);
  }

  private buildCoverObstacle(
    x: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    bodyMat: THREE.Material,
    trimMat: THREE.Material,
  ): void {
    const baseY = this.baseTerrainHeightAt(x, z);
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    const capGeo = new THREE.BoxGeometry(width + 0.14, 0.14, depth + 0.14);
    this.ownedGeometries.push(bodyGeo, capGeo);

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(x, baseY + height / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;

    const cap = new THREE.Mesh(capGeo, trimMat);
    cap.position.set(x, baseY + height + 0.07, z);
    cap.castShadow = true;
    cap.receiveShadow = true;

    this.root.add(body, cap);
    this.cameraCollisionMeshes.push(body, cap);

    this.boxColliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      topY: baseY + height + 0.14,
    });
  }

  private sampleAnalyticTerrainY(x: number, z: number): number {
    const dist = Math.hypot(x, z);
    if (dist <= 9) return 0;
    const blend = clamp((dist - 9) / 22, 0, 1);
    const wave =
      Math.sin(x * 0.08) * Math.cos(z * 0.08) * 1.4 +
      Math.sin((x + z) * 0.045) * 0.9;
    return blend * (wave + Math.max(0, dist - 26) * 0.07);
  }

  private baseTerrainHeightAt(x: number, z: number): number {
    const halfSpan = this.terrainSpan * 0.5;
    if (Math.abs(x) >= halfSpan || Math.abs(z) >= halfSpan) {
      return this.sampleAnalyticTerrainY(x, z);
    }
    const segs = this.terrainSegments;
    const gx = ((x + halfSpan) / this.terrainSpan) * segs;
    const gz = ((z + halfSpan) / this.terrainSpan) * segs;
    const ix = Math.min(segs - 1, Math.max(0, Math.floor(gx)));
    const iz = Math.min(segs - 1, Math.max(0, Math.floor(gz)));
    const u = gx - ix;
    const v = gz - iz;
    const stride = segs + 1;
    const ya = this.terrainHeights[iz * stride + ix];
    const yb = this.terrainHeights[(iz + 1) * stride + ix];
    const yc = this.terrainHeights[(iz + 1) * stride + (ix + 1)];
    const yd = this.terrainHeights[iz * stride + (ix + 1)];
    if (u + v <= 1) {
      return ya + u * (yd - ya) + v * (yb - ya);
    }
    return yc + (1 - u) * (yb - yc) + (1 - v) * (yd - yc);
  }

  getGroundHeightAt(x: number, z: number): number {
    let h = this.baseTerrainHeightAt(x, z);

    // Central raised platform surface
    const dist = Math.hypot(x, z);
    if (dist <= 5.25) {
      h = Math.max(h, 0.24);
    }

    // Allow standing on top of jumpable boxes if within footprint
    for (let i = 0; i < this.boxColliders.length; i++) {
      const box = this.boxColliders[i];
      if (x >= box.minX - 0.15 && x <= box.maxX + 0.15 && z >= box.minZ - 0.15 && z <= box.maxZ + 0.15) {
        if (box.topY <= 1.25) {
          h = Math.max(h, box.topY);
        }
      }
    }

    return h;
  }

  resolveHorizontalCollision(position: THREE.Vector3, radius: number, _bodyHeight = 1.62): void {
    // 1. Arena perimeter boundary
    const distSq = position.x * position.x + position.z * position.z;
    if (distSq > this.arenaRadiusLimit * this.arenaRadiusLimit) {
      const dist = Math.sqrt(distSq);
      const scale = this.arenaRadiusLimit / dist;
      position.x *= scale;
      position.z *= scale;
    }

    // 2. Circle colliders (Beacon plinth, Supply Crate)
    for (let i = 0; i < this.circleColliders.length; i++) {
      const c = this.circleColliders[i];
      if (position.y >= c.topY - 0.05) continue;

      const dx = position.x - c.x;
      const dz = position.z - c.z;
      const minDist = c.radius + radius;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDist * minDist && dSq > 0.00001) {
        const d = Math.sqrt(dSq);
        const push = minDist - d;
        position.x += (dx / d) * push;
        position.z += (dz / d) * push;
      }
    }

    // 3. Box colliders (Tactical cover obstacles)
    for (let i = 0; i < this.boxColliders.length; i++) {
      const box = this.boxColliders[i];
      if (position.y >= box.topY - 0.05) continue;

      const closestX = clamp(position.x, box.minX, box.maxX);
      const closestZ = clamp(position.z, box.minZ, box.maxZ);
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const dSq = dx * dx + dz * dz;

      if (dSq < radius * radius) {
        if (dSq > 0.00001) {
          const d = Math.sqrt(dSq);
          const push = radius - d;
          position.x += (dx / d) * push;
          position.z += (dz / d) * push;
        } else {
          // Inside AABB fallback: push out along nearest edge
          const penLeft = Math.abs(position.x - box.minX);
          const penRight = Math.abs(box.maxX - position.x);
          const penTop = Math.abs(position.z - box.minZ);
          const penBottom = Math.abs(box.maxZ - position.z);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) position.x = box.minX - radius;
          else if (minPen === penRight) position.x = box.maxX + radius;
          else if (minPen === penTop) position.z = box.minZ - radius;
          else position.z = box.maxZ + radius;
        }
      }
    }
  }

  getCameraCollisionMeshes(): readonly THREE.Object3D[] {
    return this.cameraCollisionMeshes;
  }

  setShopAccent(accentHex: string): void {
    this.shopAccentMat.color.set(accentHex);
    this.shopAccentMat.emissive.set(accentHex);
  }

  update(_delta: number, elapsed: number): void {
    this.beaconRingOuter.rotation.y = elapsed * 0.65;
    this.beaconRingOuter.rotation.x = Math.sin(elapsed * 0.5) * 0.28;
    this.beaconRingInner.rotation.y = -elapsed * 1.1;
    this.beaconRingInner.rotation.z = Math.cos(elapsed * 0.7) * 0.35;
    this.beaconCore.rotation.y = elapsed * 1.4;
    this.beaconCore.position.y = 3.25 + Math.sin(elapsed * 2.2) * 0.14;
    this.ambientMotes.rotation.y = elapsed * 0.025;
  }

  dispose(): void {
    for (const geo of this.ownedGeometries) {
      geo.dispose();
    }
    this.ownedGeometries.length = 0;

    for (const mat of this.ownedMaterials) {
      mat.dispose();
    }
    this.ownedMaterials.length = 0;
    this.cameraCollisionMeshes.length = 0;
  }
}
