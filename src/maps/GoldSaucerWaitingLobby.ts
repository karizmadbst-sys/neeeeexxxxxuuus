import * as THREE from 'three';
import type { OrientedVolumeCollider, WalkableSurface } from './BuildingSystem';
import type { FuturisticWaitingArenaBuild } from './FuturisticWaitingArena';
import { createGoldSaucerTextures } from './GoldSaucerSignage';
import type { CircleCollider } from './MapLoader';

interface AnimatedRefs {
  chocoboBalloon: THREE.Group;
  chocoboBaseY: number;
  terracottaBalloon: THREE.Group;
  roseGoldBalloon: THREE.Group;
  fountainWaterPool: THREE.Mesh;
  fountainSplashRing: THREE.Mesh;
  coasterCart: THREE.Group;
  coasterCurve: THREE.CatmullRomCurve3;
  ghostFigs: THREE.Group[];
  ghostBaseYs: number[];
  fountainJets: THREE.Mesh[];
}

export function buildGoldSaucerWaitingLobby(
  getBaseTerrainY: (x: number, z: number) => number,
): FuturisticWaitingArenaBuild {
  const root = new THREE.Group();
  root.name = 'GoldSaucerWaitingLobby';

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const ownedInstanced: THREE.InstancedMesh[] = [];
  const cameraCollisionMeshes: THREE.Object3D[] = [];
  const volumeColliders: OrientedVolumeCollider[] = [];
  const circleColliders: CircleCollider[] = [];
  const walkableSurfaces: WalkableSurface[] = [];

  const tex = createGoldSaucerTextures();

  // Shared Geometries
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  const sphereGeo = new THREE.SphereGeometry(1, 14, 12);
  const coneGeo = new THREE.ConeGeometry(1, 1, 12);
  ownedGeos.push(boxGeo, cylGeo, sphereGeo, coneGeo);

  // Core Architectural Materials
  const creamWhiteMat = new THREE.MeshStandardMaterial({
    color: '#efe7df',
    roughness: 0.34,
    metalness: 0.12,
  });
  const warmStoneMat = new THREE.MeshStandardMaterial({
    color: '#cbb7a7',
    roughness: 0.42,
    metalness: 0.08,
  });
  const darkObsidianMat = new THREE.MeshStandardMaterial({
    color: '#11131d',
    roughness: 0.24,
    metalness: 0.55,
  });
  const canopyPlumMat = new THREE.MeshStandardMaterial({
    color: '#3f1c2e',
    roughness: 0.52,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });
  const warmCreamGlowMat = new THREE.MeshStandardMaterial({
    color: '#fff4e0',
    emissive: '#ffd5a6',
    emissiveIntensity: 1.45,
    roughness: 0.2,
    metalness: 0.05,
  });
  const coralGlowMat = new THREE.MeshStandardMaterial({
    color: '#ffd0ba',
    emissive: '#e87f64',
    emissiveIntensity: 1.2,
    roughness: 0.25,
    metalness: 0.1,
  });
  const magentaGlowMat = new THREE.MeshStandardMaterial({
    color: '#ff94ef',
    emissive: '#ff22cc',
    emissiveIntensity: 1.85,
    roughness: 0.18,
    metalness: 0.1,
  });
  const hotPinkGlowMat = new THREE.MeshStandardMaterial({
    color: '#ff99d6',
    emissive: '#ec4899',
    emissiveIntensity: 1.5,
    roughness: 0.22,
    metalness: 0.1,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: '#f7c96e',
    emissive: '#d97706',
    emissiveIntensity: 0.55,
    roughness: 0.24,
    metalness: 0.78,
  });
  const goldLedMat = new THREE.MeshStandardMaterial({
    color: '#fef08a',
    emissive: '#f59e0b',
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.1,
  });
  const cyanNeonMat = new THREE.MeshStandardMaterial({
    color: '#bae6fd',
    emissive: '#0ea5e9',
    emissiveIntensity: 1.7,
    roughness: 0.18,
    metalness: 0.15,
  });
  const purpleNeonMat = new THREE.MeshStandardMaterial({
    color: '#d8b4fe',
    emissive: '#9333ea',
    emissiveIntensity: 1.75,
    roughness: 0.2,
    metalness: 0.1,
  });
  const slimeGreenNeonMat = new THREE.MeshStandardMaterial({
    color: '#bbf7d0',
    emissive: '#22c55e',
    emissiveIntensity: 1.65,
    roughness: 0.2,
    metalness: 0.1,
  });
  const crimsonNeonMat = new THREE.MeshStandardMaterial({
    color: '#fecaca',
    emissive: '#ef4444',
    emissiveIntensity: 1.7,
    roughness: 0.2,
    metalness: 0.1,
  });
  const waterGlowMat = new THREE.MeshStandardMaterial({
    color: '#67e8f9',
    emissive: '#06b6d4',
    emissiveIntensity: 1.15,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.86,
  });
  const waterJetMat = new THREE.MeshStandardMaterial({
    color: '#e0f2fe',
    emissive: '#7dd3fc',
    emissiveIntensity: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 0.56,
  });
  const balloonGoldMat = new THREE.MeshStandardMaterial({
    color: '#f2c672',
    emissive: '#784812',
    emissiveIntensity: 0.35,
    roughness: 0.18,
    metalness: 0.82,
  });
  const balloonPearlMat = new THREE.MeshStandardMaterial({
    color: '#fff6ee',
    emissive: '#ffe4c4',
    emissiveIntensity: 0.3,
    roughness: 0.22,
    metalness: 0.25,
  });
  const palmTrunkMat = new THREE.MeshStandardMaterial({
    color: '#5c4030',
    roughness: 0.88,
    metalness: 0.04,
  });
  const palmLeafMat = new THREE.MeshStandardMaterial({
    color: '#1e6b34',
    roughness: 0.58,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const palmDateMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    emissive: '#78350f',
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.15,
  });

  ownedMats.push(
    creamWhiteMat,
    warmStoneMat,
    darkObsidianMat,
    canopyPlumMat,
    warmCreamGlowMat,
    coralGlowMat,
    magentaGlowMat,
    hotPinkGlowMat,
    goldTrimMat,
    goldLedMat,
    cyanNeonMat,
    purpleNeonMat,
    slimeGreenNeonMat,
    crimsonNeonMat,
    waterGlowMat,
    waterJetMat,
    balloonGoldMat,
    balloonPearlMat,
    palmTrunkMat,
    palmLeafMat,
    palmDateMat,
  );

  // Helper to create texture-backed unlit/emissive sign panels
  const makeSignMat = (map: THREE.Texture, emissiveIntensity = 0.95): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: '#ffffff',
      emissiveIntensity,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    });
    ownedMats.push(m);
    return m;
  };

  // =========================================================================
  // 1. CONCENTRIC PLAZA FLOOR RINGS & LUMINOUS MEDALLION DECALS (y = 0.01..0.03)
  // =========================================================================
  const buildRingStrip = (
    innerR: number,
    outerR: number,
    y: number,
    mat: THREE.Material,
    segs = 72,
  ) => {
    const geo = new THREE.RingGeometry(innerR, outerR, segs);
    geo.rotateX(-Math.PI / 2);
    ownedGeos.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  // Base polished plaza disc + concentric dark-obsidian track bands + glowing white-gold trim
  buildRingStrip(5.8, 9.6, 0.012, warmStoneMat, 72);
  buildRingStrip(9.6, 12.8, 0.016, darkObsidianMat, 72);
  buildRingStrip(9.55, 9.78, 0.022, warmCreamGlowMat, 72);
  buildRingStrip(12.65, 12.88, 0.022, warmCreamGlowMat, 72);

  buildRingStrip(12.88, 22.0, 0.012, warmStoneMat, 80);
  buildRingStrip(22.0, 27.6, 0.016, darkObsidianMat, 84);
  buildRingStrip(21.92, 22.15, 0.022, warmCreamGlowMat, 84);
  buildRingStrip(27.45, 27.68, 0.022, warmCreamGlowMat, 84);

  buildRingStrip(27.68, 36.5, 0.012, warmStoneMat, 84);
  buildRingStrip(36.5, 42.5, 0.014, darkObsidianMat, 84);
  buildRingStrip(42.5, 76.4, 0.012, warmStoneMat, 84);

  // Circular luminous floor medallions ("Park Central", "Chocobo Square", "Ghost Square", etc.)
  const medallions: Array<{ x: number; z: number; r: number; map: THREE.Texture; rotY: number }> = [
    { x: 11.5, z: 11.8, r: 2.35, map: tex.medallionParkCentral, rotY: -0.4 },
    { x: -14.8, z: 16.5, r: 2.35, map: tex.medallionParkCentral, rotY: 0.45 },
    { x: 20.5, z: 2.5, r: 2.65, map: tex.medallionChocobo, rotY: -Math.PI * 0.42 },
    { x: -24.0, z: -2.0, r: 2.65, map: tex.medallionGhost, rotY: Math.PI * 0.48 },
    { x: 24.5, z: -15.0, r: 2.5, map: tex.medallionBattle, rotY: -Math.PI * 0.68 },
    { x: 0, z: -14.8, r: 2.8, map: tex.medallionGoldSaucer, rotY: 0 },
  ];
  const decalGeo = new THREE.CircleGeometry(1, 36);
  decalGeo.rotateX(-Math.PI / 2);
  ownedGeos.push(decalGeo);
  for (const md of medallions) {
    const mat = new THREE.MeshStandardMaterial({
      map: md.map,
      emissiveMap: md.map,
      emissive: '#ffffff',
      emissiveIntensity: 0.65,
      roughness: 0.3,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    ownedMats.push(mat);
    const decal = new THREE.Mesh(decalGeo, mat);
    decal.position.set(md.x, 0.032, md.z);
    decal.rotation.y = md.rotY;
    decal.scale.setScalar(md.r);
    root.add(decal);
  }

  // =========================================================================
  // 2. CENTRAL TIERED ILLUMINATED FOUNTAIN AT (0, 0, 0)
  // =========================================================================
  const fountainGroup = new THREE.Group();
  const stepRadii = [
    { r: 6.1, h: 0.15, y: 0.075, ledMat: hotPinkGlowMat },
    { r: 5.4, h: 0.15, y: 0.225, ledMat: warmCreamGlowMat },
    { r: 4.7, h: 0.15, y: 0.375, ledMat: goldLedMat },
  ];
  for (let i = 0; i < stepRadii.length; i++) {
    const st = stepRadii[i];
    const stepDiskGeo = new THREE.CylinderGeometry(st.r, st.r + 0.12, st.h, 48);
    const ledRingGeo = new THREE.TorusGeometry(st.r + 0.03, 0.055, 8, 56);
    ledRingGeo.rotateX(Math.PI / 2);
    ownedGeos.push(stepDiskGeo, ledRingGeo);

    const disk = new THREE.Mesh(stepDiskGeo, creamWhiteMat);
    disk.position.y = st.y;
    disk.receiveShadow = true;
    disk.castShadow = true;
    const led = new THREE.Mesh(ledRingGeo, st.ledMat);
    led.position.y = st.y + st.h * 0.42;
    fountainGroup.add(disk, led);
  }

  // Basin rim wall & illuminated turquoise water surface
  const basinWallGeo = new THREE.TorusGeometry(4.35, 0.24, 12, 48);
  basinWallGeo.rotateX(Math.PI / 2);
  const waterPoolGeo = new THREE.CircleGeometry(4.25, 48);
  waterPoolGeo.rotateX(-Math.PI / 2);
  const splashRingGeo = new THREE.TorusGeometry(2.3, 0.07, 8, 40);
  splashRingGeo.rotateX(Math.PI / 2);
  ownedGeos.push(basinWallGeo, waterPoolGeo, splashRingGeo);

  const basinWall = new THREE.Mesh(basinWallGeo, creamWhiteMat);
  basinWall.position.y = 0.56;
  basinWall.castShadow = true;
  const fountainWaterPool = new THREE.Mesh(waterPoolGeo, waterGlowMat);
  fountainWaterPool.position.y = 0.52;
  const fountainSplashRing = new THREE.Mesh(splashRingGeo, waterJetMat);
  fountainSplashRing.position.y = 0.55;
  fountainGroup.add(basinWall, fountainWaterPool, fountainSplashRing);

  // Sculpted 3-tier fountain bowls & center column
  const spireProfile = [
    new THREE.Vector2(0.0, 0.4),
    new THREE.Vector2(0.95, 0.45),
    new THREE.Vector2(0.62, 0.9),
    new THREE.Vector2(0.45, 1.45),
    new THREE.Vector2(2.15, 1.68),
    new THREE.Vector2(2.25, 1.88),
    new THREE.Vector2(0.42, 1.92),
    new THREE.Vector2(0.34, 2.55),
    new THREE.Vector2(1.38, 2.75),
    new THREE.Vector2(1.45, 2.92),
    new THREE.Vector2(0.28, 2.95),
    new THREE.Vector2(0.22, 3.55),
    new THREE.Vector2(0.82, 3.68),
    new THREE.Vector2(0.86, 3.82),
    new THREE.Vector2(0.18, 3.86),
    new THREE.Vector2(0.12, 4.35),
    new THREE.Vector2(0.0, 4.48),
  ];
  const spireGeo = new THREE.LatheGeometry(spireProfile, 32);
  ownedGeos.push(spireGeo);
  const spireMesh = new THREE.Mesh(spireGeo, creamWhiteMat);
  spireMesh.castShadow = true;
  fountainGroup.add(spireMesh);

  // Gold bowl rims on the fountain tiers
  for (const [r, y] of [
    [2.24, 1.88],
    [1.44, 2.92],
    [0.85, 3.82],
  ]) {
    const rimG = new THREE.TorusGeometry(r, 0.06, 8, 36);
    rimG.rotateX(Math.PI / 2);
    ownedGeos.push(rimG);
    const rimM = new THREE.Mesh(rimG, goldTrimMat);
    rimM.position.y = y;
    fountainGroup.add(rimM);
  }

  // Translucent arcing water jets around the fountain
  const fountainJets: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.35, 3.85, Math.sin(a) * 0.35),
      new THREE.Vector3(Math.cos(a) * 1.65, 2.95, Math.sin(a) * 1.65),
      new THREE.Vector3(Math.cos(a) * 2.95, 0.54, Math.sin(a) * 2.95),
    ]);
    const jetGeo = new THREE.TubeGeometry(curve, 14, 0.055, 6, false);
    ownedGeos.push(jetGeo);
    const jetMesh = new THREE.Mesh(jetGeo, waterJetMat);
    fountainGroup.add(jetMesh);
    fountainJets.push(jetMesh);
  }
  // Top crown water plume
  const crownJetGeo = new THREE.CylinderGeometry(0.14, 0.06, 1.25, 12);
  ownedGeos.push(crownJetGeo);
  const crownJet = new THREE.Mesh(crownJetGeo, waterJetMat);
  crownJet.position.y = 4.95;
  fountainGroup.add(crownJet);
  fountainJets.push(crownJet);

  root.add(fountainGroup);
  cameraCollisionMeshes.push(spireMesh, basinWall);

  // Walkable outer fountain step ledges (4-rect octagon coverage per step) + smooth circular basin barrier
  for (const st of stepRadii) {
    const stepTopY = st.y + st.h * 0.5;
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 4;
      walkableSurfaces.push({
        kind: 'slab',
        cx: 0,
        cz: 0,
        halfW: st.r * 0.92,
        halfD: st.r * 0.38,
        cosY: Math.cos(ang),
        sinY: Math.sin(ang),
        startY: stepTopY,
        endY: stepTopY,
        undersideY: stepTopY - st.h,
      });
    }
  }
  // Smooth circular colliders on fountain basin rim (r = 4.58m) & tiered spire (r = 2.32m)
  circleColliders.push(
    { x: 0, z: 0, radius: 4.58, topY: 1.05 },
    { x: 0, z: 0, radius: 2.32, topY: 4.6 },
  );

  // =========================================================================
  // 3. CURVED TWO-TIER WHITE MEZZANINE WALKWAYS, Y-PILLARS & GRAND STAIRS
  // =========================================================================
  const buildCurvedMezzanineSector = (
    startAng: number,
    endAng: number,
    innerR: number,
    outerR: number,
    deckY: number,
    segCount: number,
    withPillars: boolean,
    withParapet: boolean,
    skipParapetIndices?: ReadonlySet<number>,
  ) => {
    const totalAng = endAng - startAng;
    const stepAng = totalAng / segCount;
    const midR = (innerR + outerR) * 0.5;
    const depth = outerR - innerR;
    const thickness = 0.68;

    for (let i = 0; i < segCount; i++) {
      const a0 = startAng + i * stepAng;
      const a1 = a0 + stepAng;
      const aMid = (a0 + a1) * 0.5;
      // Tangent chord width slightly overlapped to eliminate cracks
      const chordW = 2 * midR * Math.sin(stepAng * 0.5) + 0.65;
      const innerChordW = 2 * innerR * Math.sin(stepAng * 0.5) + 0.45;
      const yaw = -aMid + Math.PI * 0.5;
      const cx = Math.cos(aMid) * midR;
      const cz = Math.sin(aMid) * midR;

      const segGroup = new THREE.Group();
      segGroup.position.set(cx, deckY, cz);
      segGroup.rotation.y = yaw;

      // Main white/cream curved mezzanine slab
      const slab = new THREE.Mesh(boxGeo, creamWhiteMat);
      slab.position.y = -thickness * 0.5;
      slab.scale.set(chordW, thickness, depth);
      slab.receiveShadow = true;
      slab.castShadow = true;
      segGroup.add(slab);
      cameraCollisionMeshes.push(slab);

      // Rounded bullnose inner lip & glowing soffit LED under-strip
      const lip = new THREE.Mesh(boxGeo, creamWhiteMat);
      lip.position.set(0, -thickness * 0.35, -depth * 0.5 - 0.14);
      lip.scale.set(innerChordW, thickness * 0.72, 0.36);
      segGroup.add(lip);

      const soffitLed = new THREE.Mesh(boxGeo, warmCreamGlowMat);
      soffitLed.position.set(0, -thickness + 0.04, -depth * 0.5 + 0.18);
      soffitLed.scale.set(innerChordW, 0.11, 0.18);
      segGroup.add(soffitLed);

      // Glossy dark parapet railing + glowing warm-cream top handrail along inner edge (skip at stair arrival openings)
      if (withParapet && !skipParapetIndices?.has(i)) {
        const rail = new THREE.Mesh(boxGeo, darkObsidianMat);
        rail.position.set(0, 0.52, -depth * 0.5 + 0.14);
        rail.scale.set(innerChordW, 1.04, 0.18);
        segGroup.add(rail);

        const topCap = new THREE.Mesh(boxGeo, warmCreamGlowMat);
        topCap.position.set(0, 1.06, -depth * 0.5 + 0.14);
        topCap.scale.set(innerChordW, 0.09, 0.24);
        segGroup.add(topCap);

        const railCx = Math.cos(aMid) * (innerR + 0.14);
        const railCz = Math.sin(aMid) * (innerR + 0.14);
        volumeColliders.push({
          cx: railCx,
          cz: railCz,
          halfW: innerChordW * 0.5,
          halfD: 0.14,
          cosY: Math.cos(yaw),
          sinY: Math.sin(yaw),
          minY: deckY,
          maxY: deckY + 1.15,
          steppable: false,
        });
      }

      root.add(segGroup);

      // Walkable deck surface
      walkableSurfaces.push({
        kind: 'slab',
        cx,
        cz,
        halfW: chordW * 0.5,
        halfD: depth * 0.5,
        cosY: Math.cos(yaw),
        sinY: Math.sin(yaw),
        startY: deckY,
        endY: deckY,
        undersideY: deckY - thickness,
      });

      // Sculptural angled twin curved white Y-pillars beneath every 2nd segment
      if (withPillars && i % 2 === 1) {
        const pr = innerR + 1.4;
        const px = Math.cos(aMid) * pr;
        const pz = Math.sin(aMid) * pr;
        const pillarBaseY = getBaseTerrainY(px, pz);
        const colH = deckY - thickness - pillarBaseY + 0.25;
        if (colH > 1.0) {
          const colGroup = new THREE.Group();
          colGroup.position.set(px, pillarBaseY, pz);
          colGroup.rotation.y = yaw;

          for (const side of [-1, 1]) {
            const strut = new THREE.Mesh(cylGeo, creamWhiteMat);
            strut.position.set(side * 0.55, colH * 0.5, 0.15);
            strut.rotation.z = -side * 0.18;
            strut.rotation.x = 0.08;
            strut.scale.set(0.32, colH * 1.04, 0.32);
            strut.castShadow = true;
            colGroup.add(strut);
          }
          // Warm amber up-light base collar
          const collar = new THREE.Mesh(cylGeo, goldLedMat);
          collar.position.set(0, 0.14, 0);
          collar.scale.set(0.85, 0.24, 0.85);
          colGroup.add(collar);
          root.add(colGroup);

          volumeColliders.push({
            cx: px,
            cz: pz,
            halfW: 0.72,
            halfD: 0.45,
            cosY: Math.cos(yaw),
            sinY: Math.sin(yaw),
            minY: pillarBaseY,
            maxY: deckY - thickness,
            steppable: false,
          });
        }
      }
    }
  };

  // Angles in XZ plane (note: -Z is angle -PI/2, +X is 0, +Z is +PI/2, -X is PI)
  const deg = (d: number) => (d * Math.PI) / 180;

  // Lower Mezzanine Wings (y = 5.4m, r = 36..52m) — leaving center-back open for White Mascot Arch & Gold Saucer vista
  // Left Lower Wing (Ghost Square side: ~142° to 232°, segment 2 open for lower-left stair arrival)
  buildCurvedMezzanineSector(deg(142), deg(232), 36, 52, 5.4, 8, true, true, new Set([2]));
  // Right Lower Wing (Battle/Chocobo side: ~-52° to +38°, segment 5 open for lower-right stair arrival)
  buildCurvedMezzanineSector(deg(-52), deg(38), 36, 52, 5.4, 8, true, true, new Set([5]));
  // Rear-Foreground Promenade Bridge Wings (wrapping behind camera +Z: ~50° to 130°)
  buildCurvedMezzanineSector(deg(50), deg(130), 39, 54, 5.4, 7, true, true);

  // Upper Mezzanine Tiers (y = 11.2m, r = 42..58m)
  // Upper-Left (Wonderment Square terrace: ~188° to 246°, segment 2 open for upper-left stair arrival)
  buildCurvedMezzanineSector(deg(188), deg(246), 42, 58, 11.2, 6, true, true, new Set([2]));
  // Upper-Right (Speed Square terrace: ~-66° to -8°, segment 3 open for upper-right stair arrival)
  buildCurvedMezzanineSector(deg(-66), deg(-8), 42, 58, 11.2, 6, true, true, new Set([3]));
  // Upper-Side Galleries (136°..188° and -8°..44° and 52°..128°)
  buildCurvedMezzanineSector(deg(136), deg(188), 44, 59, 11.2, 5, false, true);
  buildCurvedMezzanineSector(deg(-8), deg(44), 44, 59, 11.2, 5, false, true);
  buildCurvedMezzanineSector(deg(52), deg(128), 46, 60, 11.2, 6, false, true);

  // Illuminated Grand Staircases (with glowing gold step risers + dark balustrades + walkable stair surfaces!)
  const buildIlluminatedStaircase = (
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    width: number,
    steps = 18,
  ) => {
    const dx = endX - startX;
    const dz = endZ - startZ;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz); // local +Z points from start toward end
    const cx = (startX + endX) * 0.5;
    const cz = (startZ + endZ) * 0.5;
    const totalRise = endY - startY;

    const stairGroup = new THREE.Group();
    stairGroup.position.set(cx, startY, cz);
    stairGroup.rotation.y = yaw;

    const stepLen = len / steps;
    const stepH = totalRise / steps;
    for (let s = 0; s < steps; s++) {
      const zLocal = -len * 0.5 + (s + 0.5) * stepLen;
      const topY = (s + 1) * stepH;

      const tread = new THREE.Mesh(boxGeo, darkObsidianMat);
      tread.position.set(0, topY - (stepH + 0.2) * 0.5, zLocal);
      tread.scale.set(width, stepH + 0.2, stepLen + 0.08);
      tread.receiveShadow = true;
      tread.castShadow = true;
      stairGroup.add(tread);

      // Warm glowing LED riser strip along the step lip
      const ledStrip = new THREE.Mesh(boxGeo, warmCreamGlowMat);
      ledStrip.position.set(0, topY - 0.04, zLocal - stepLen * 0.48);
      ledStrip.scale.set(width * 0.96, 0.06, 0.06);
      stairGroup.add(ledStrip);
    }

    // Slanted dark glossy balustrades + glowing cream handrails on left & right sides
    const slopeAngle = Math.atan2(totalRise, len);
    const diagLen = Math.hypot(len, totalRise);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(boxGeo, darkObsidianMat);
      wall.position.set(side * (width * 0.5 + 0.14), totalRise * 0.5 + 0.48, 0);
      wall.rotation.x = -slopeAngle;
      wall.scale.set(0.22, 1.05, diagLen + 0.4);
      stairGroup.add(wall);

      const rail = new THREE.Mesh(boxGeo, warmCreamGlowMat);
      rail.position.set(side * (width * 0.5 + 0.14), totalRise * 0.5 + 1.02, 0);
      rail.rotation.x = -slopeAngle;
      rail.scale.set(0.28, 0.1, diagLen + 0.45);
      stairGroup.add(rail);
    }

    root.add(stairGroup);

    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Stepped side balustrade & low under-stair wedge colliders so players cannot fall off sides or clip through stairs
    const railSegs = 6;
    const segLen = len / railSegs;
    for (let k = 0; k < railSegs; k++) {
      const t0 = k / railSegs;
      const t1 = (k + 1) / railSegs;
      const tMid = (t0 + t1) * 0.5;
      const zLocal = -len * 0.5 + tMid * len;
      const segMinY = startY + t0 * totalRise;
      const segMaxY = startY + t1 * totalRise + 1.15;

      for (const side of [-1, 1]) {
        const xLocal = side * (width * 0.5 + 0.14);
        volumeColliders.push({
          cx: cx + xLocal * cosY + zLocal * sinY,
          cz: cz - xLocal * sinY + zLocal * cosY,
          halfW: 0.15,
          halfD: segLen * 0.5 + 0.06,
          cosY,
          sinY,
          minY: segMinY,
          maxY: segMaxY,
          steppable: false,
        });
      }

      if (t0 * totalRise >= 0.48 && t0 * totalRise < 1.95) {
        volumeColliders.push({
          cx: cx + zLocal * sinY,
          cz: cz + zLocal * cosY,
          halfW: width * 0.5,
          halfD: segLen * 0.5,
          cosY,
          sinY,
          minY: startY,
          maxY: Math.max(startY + 0.35, startY + t0 * totalRise - 0.12),
          steppable: false,
        });
      }
    }

    // Walkable stair surface (climbs from local -halfD [startY] to +halfD [endY], matching stairGroup.rotation.y = yaw)
    walkableSurfaces.push({
      kind: 'stair',
      cx,
      cz,
      halfW: width * 0.5,
      halfD: len * 0.5,
      cosY,
      sinY,
      startY,
      endY,
      undersideY: startY - 0.3,
      stairSteps: steps,
    });
  };

  // Left foreground grand staircase (plaza floor -> Left Lower Mezzanine segment 2)
  buildIlluminatedStaircase(-22, 0, 22, -36.2, 5.4, 6.3, 4.4, 20);
  // Left midground upper staircase (Left Lower Mezzanine -> Wonderment Terrace segment 2)
  buildIlluminatedStaircase(-38.2, 5.4, -8.82, -36.06, 11.2, -22.68, 4.0, 18);
  // Right foreground grand staircase (plaza floor -> Right Lower Mezzanine segment 5)
  buildIlluminatedStaircase(22, 0, 22, 36.2, 5.4, 6.3, 4.4, 20);
  // Right midground upper staircase (Right Lower Mezzanine -> Speed Square Terrace segment 3)
  buildIlluminatedStaircase(38.2, 5.4, -8.82, 36.06, 11.2, -22.68, 4.0, 18);

  // =========================================================================
  // 4. WHITE ROUNDED MASCOT ARCH PAVILION & GIANT "WELCOME TO THE GOLD SAUCER" TOWER
  // =========================================================================
  // 4a. White Rounded Mascot Arch Pavilion at (0, 0, -29)
  const archGroup = new THREE.Group();
  archGroup.position.set(0, 0, -29.5);

  const archCurve = new THREE.TorusGeometry(4.6, 1.35, 16, 36, Math.PI);
  ownedGeos.push(archCurve);
  const archRing = new THREE.Mesh(archCurve, creamWhiteMat);
  archRing.position.set(0, 0.2, 0);
  archRing.scale.set(1.15, 1.08, 2.2);
  archRing.castShadow = true;
  archRing.receiveShadow = true;
  archGroup.add(archRing);
  cameraCollisionMeshes.push(archRing);

  // Pointed cute mascot ears atop the white arch
  for (const sx of [-3.4, 3.4]) {
    const ear = new THREE.Mesh(coneGeo, creamWhiteMat);
    ear.position.set(sx, 5.8, 0);
    ear.rotation.z = -sx * 0.14;
    ear.scale.set(1.15, 2.1, 1.0);
    archGroup.add(ear);
  }
  // Cute dark oval eyes on arch brow
  for (const sx of [-1.85, 1.85]) {
    const eye = new THREE.Mesh(sphereGeo, darkObsidianMat);
    eye.position.set(sx, 4.55, 2.35);
    eye.scale.set(0.38, 0.54, 0.25);
    archGroup.add(eye);
  }
  // Glowing inner escalator portal arch inside the white pavilion
  const innerPortal = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.12, 8, 32, Math.PI),
    warmCreamGlowMat,
  );
  ownedGeos.push(innerPortal.geometry);
  innerPortal.position.set(0, 0.2, 0.8);
  archGroup.add(innerPortal);

  // Glowing inner escalator ramp steps inside pavilion
  for (let s = 0; s < 10; s++) {
    const step = new THREE.Mesh(boxGeo, warmCreamGlowMat);
    step.position.set(0, 0.18 + s * 0.24, 1.2 - s * 0.55);
    step.scale.set(5.4, 0.08, 0.24);
    archGroup.add(step);
  }
  // Walkable escalator step surface + portal back barrier
  walkableSurfaces.push({
    kind: 'stair',
    cx: 0,
    cz: -30.78,
    halfW: 2.7,
    halfD: 2.75,
    cosY: -1,
    sinY: 0,
    startY: 0,
    endY: 2.42,
    undersideY: -0.3,
    stairSteps: 10,
  });
  const portalBack = new THREE.Mesh(boxGeo, warmCreamGlowMat);
  portalBack.position.set(0, 2.7, -4.4);
  portalBack.scale.set(5.8, 3.6, 0.25);
  archGroup.add(portalBack);
  volumeColliders.push({
    cx: 0,
    cz: -33.9,
    halfW: 3.1,
    halfD: 0.4,
    cosY: 1,
    sinY: 0,
    minY: 0,
    maxY: 6.2,
    steppable: false,
  });

  // Colliders for white arch left/right legs
  for (const sx of [-5.2, 5.2]) {
    volumeColliders.push({
      cx: sx,
      cz: -29.5,
      halfW: 1.5,
      halfD: 2.8,
      cosY: 1,
      sinY: 0,
      minY: 0,
      maxY: 6.2,
      steppable: false,
    });
  }
  root.add(archGroup);

  // 4b. Colossal "WELCOME TO THE GOLD SAUCER" Centerpiece Tower at (-3, 0, -58)
  const goldTower = new THREE.Group();
  goldTower.position.set(-3, 0, -58);

  // Towering curved purple/pink base drum
  const towerDrum = new THREE.Mesh(cylGeo, canopyPlumMat);
  towerDrum.position.set(0, 12, 0);
  towerDrum.scale.set(16, 24, 11);
  goldTower.add(towerDrum);
  cameraCollisionMeshes.push(towerDrum);
  volumeColliders.push({
    cx: -3,
    cz: -58,
    halfW: 15.2,
    halfD: 10.6,
    cosY: 1,
    sinY: 0,
    minY: 0,
    maxY: 24,
    steppable: false,
  });

  // Colossal spiky glowing magenta-pink crystalline starburst crown (11 faceted petals)
  const petalGeo = new THREE.ConeGeometry(3.4, 15.5, 4);
  ownedGeos.push(petalGeo);
  for (let i = 0; i < 11; i++) {
    const t = (i / 10) * 2 - 1; // -1 .. +1
    const angle = t * 1.15;
    const petal = new THREE.Mesh(petalGeo, magentaGlowMat);
    petal.position.set(Math.sin(angle) * 14.5, 25.5 + Math.cos(angle) * 9.5, -2.5);
    petal.rotation.z = -angle;
    petal.scale.set(1.25, 1.0 + (1 - Math.abs(t)) * 0.55, 0.55);
    goldTower.add(petal);
  }

  // Main "WELCOME TO THE GOLD SAUCER" Marquee Panel
  const gsSignGeo = new THREE.PlaneGeometry(24, 12);
  ownedGeos.push(gsSignGeo);
  const gsSignMesh = new THREE.Mesh(gsSignGeo, makeSignMat(tex.goldSaucerSign, 1.35));
  gsSignMesh.position.set(0, 22.8, 6.2);
  goldTower.add(gsSignMesh);

  // Giant Smiling Mascot Dome below the Gold Saucer sign
  const mascotHead = new THREE.Mesh(sphereGeo, makeSignMat(tex.mascotFace, 0.9));
  mascotHead.position.set(0, 10.6, 4.8);
  mascotHead.scale.set(8.8, 7.6, 6.5);
  // Orient face texture cleanly forward (+Z)
  mascotHead.rotation.y = -Math.PI * 0.5;
  goldTower.add(mascotHead);

  for (const sx of [-5.8, 5.8]) {
    const ear = new THREE.Mesh(coneGeo, magentaGlowMat);
    ear.position.set(sx, 17.5, 5.6);
    ear.rotation.z = -sx * 0.08;
    ear.scale.set(1.9, 4.0, 1.6);
    goldTower.add(ear);
  }
  root.add(goldTower);

  // =========================================================================
  // 5. ALL 5 ICONIC DISTRICT SQUARES AROUND THE PLAZA
  // =========================================================================
  const makeBannerPlane = (
    w: number,
    h: number,
    map: THREE.Texture,
    emissiveIntensity = 1.25,
  ): THREE.Mesh => {
    const g = new THREE.PlaneGeometry(w, h);
    ownedGeos.push(g);
    return new THREE.Mesh(g, makeSignMat(map, emissiveIntensity));
  };

  // 5a. WONDERMENT SQUARE (Upper-Left, rainbow neon arch + green striped wall)
  const wonderGroup = new THREE.Group();
  wonderGroup.position.set(-28, 11.4, -36);
  wonderGroup.rotation.y = 0.56;
  const rainbowColors = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#8b5cf6'];
  for (let i = 0; i < rainbowColors.length; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: rainbowColors[i],
      emissive: rainbowColors[i],
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    ownedMats.push(mat);
    const arcG = new THREE.TorusGeometry(6.8 - i * 0.42, 0.16, 8, 36, Math.PI);
    ownedGeos.push(arcG);
    const arc = new THREE.Mesh(arcG, mat);
    arc.position.set(0, 3.6, 0);
    wonderGroup.add(arc);
  }
  const wonderSign = makeBannerPlane(13.5, 5.1, tex.wondermentSign, 1.3);
  wonderSign.position.set(0, 4.2, 0.55);
  wonderGroup.add(wonderSign);

  // Glowing green neon striped awning adjacent left of Wonderment Square
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(boxGeo, slimeGreenNeonMat);
    stripe.position.set(-10.5 - i * 1.1, 1.8 - i * 0.16, 1.2 + i * 0.4);
    stripe.rotation.z = 0.48;
    stripe.scale.set(0.18, 4.2, 0.18);
    wonderGroup.add(stripe);
  }
  root.add(wonderGroup);

  // 5b. GHOST SQUARE (Left Midground, electric purple + slime green haunted pavilion)
  const ghostGroup = new THREE.Group();
  const ghostYaw = Math.PI * 0.46;
  ghostGroup.position.set(-41, 0.2, -6);
  ghostGroup.rotation.y = ghostYaw;

  // Haunted purple back facade + crooked gothic spires
  const ghostBackdrop = new THREE.Mesh(boxGeo, darkObsidianMat);
  ghostBackdrop.position.set(0, 5.0, -2.5);
  ghostBackdrop.scale.set(17, 10, 1.2);
  ghostGroup.add(ghostBackdrop);
  cameraCollisionMeshes.push(ghostBackdrop);
  volumeColliders.push({
    cx: -41 + -2.5 * Math.sin(ghostYaw),
    cz: -6 + -2.5 * Math.cos(ghostYaw),
    halfW: 8.5,
    halfD: 0.7,
    cosY: Math.cos(ghostYaw),
    sinY: Math.sin(ghostYaw),
    minY: 0,
    maxY: 10.2,
    steppable: false,
  });

  for (const [sx, h, rz] of [
    [-5.8, 7.5, 0.14],
    [-2.4, 9.2, -0.09],
    [3.8, 8.2, 0.11],
    [6.6, 6.4, -0.15],
  ]) {
    const spire = new THREE.Mesh(coneGeo, purpleNeonMat);
    spire.position.set(sx, 7.2 + h * 0.25, -1.5);
    spire.rotation.z = rz;
    spire.scale.set(1.4, h * 0.65, 1.2);
    ghostGroup.add(spire);
  }

  // Diagonal neon purple speed/rib stripes under Ghost Square sign (matches bottom-left of photo!)
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(boxGeo, purpleNeonMat);
    rib.position.set(-4.5 + i * 1.8, 1.1, 0.4);
    rib.rotation.z = -0.35;
    rib.scale.set(0.14, 2.2, 0.14);
    ghostGroup.add(rib);
  }

  const ghostSign = makeBannerPlane(14.0, 5.2, tex.ghostSign, 1.35);
  ghostSign.position.set(0, 4.6, 0.5);
  ghostGroup.add(ghostSign);

  // 3 Floating smiling purple ghost sculptures above Ghost Square
  const ghostFigs: THREE.Group[] = [];
  const ghostBaseYs: number[] = [];
  for (const [gx, gy, gs] of [
    [-4.8, 8.2, 1.25],
    [0.2, 9.1, 0.95],
    [4.4, 7.9, 1.05],
  ]) {
    const gg = new THREE.Group();
    gg.position.set(gx, gy, 0.7);
    const body = new THREE.Mesh(sphereGeo, purpleNeonMat);
    body.scale.set(gs, gs * 1.25, gs * 0.6);
    const tail = new THREE.Mesh(coneGeo, purpleNeonMat);
    tail.position.set(0, -gs * 1.15, 0);
    tail.rotation.z = Math.PI;
    tail.scale.set(gs * 0.9, gs * 1.0, gs * 0.5);
    gg.add(body, tail);
    ghostGroup.add(gg);
    ghostFigs.push(gg);
    ghostBaseYs.push(gy);
  }
  root.add(ghostGroup);

  // 5c. SPEED SQUARE (Upper-Right, electric cyan concentric speed arches + roller coaster track)
  const speedGroup = new THREE.Group();
  speedGroup.position.set(30, 11.4, -34);
  speedGroup.rotation.y = -0.62;

  for (let i = 0; i < 4; i++) {
    const archG = new THREE.TorusGeometry(6.2 - i * 0.75, 0.14, 8, 36, Math.PI);
    ownedGeos.push(archG);
    const archM = new THREE.Mesh(archG, i % 2 === 0 ? cyanNeonMat : hotPinkGlowMat);
    archM.position.set(0, 2.0, -i * 0.9);
    speedGroup.add(archM);
  }
  const speedSign = makeBannerPlane(13.5, 5.0, tex.speedSign, 1.35);
  speedSign.position.set(0, 6.2, 0.5);
  speedGroup.add(speedSign);

  // Sweeping Roller Coaster Track rising behind Speed Square!
  const coasterCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-12, 1.5, -4),
    new THREE.Vector3(-4, 7.5, -2),
    new THREE.Vector3(2, 14.5, -5),
    new THREE.Vector3(8, 12.0, -10),
    new THREE.Vector3(14, 4.0, -6),
  ]);
  const coasterTubeGeo = new THREE.TubeGeometry(coasterCurve, 44, 0.32, 8, false);
  ownedGeos.push(coasterTubeGeo);
  const coasterTrack = new THREE.Mesh(coasterTubeGeo, cyanNeonMat);
  speedGroup.add(coasterTrack);

  // Animated coaster shuttle pod gliding along the track
  const coasterCart = new THREE.Group();
  const cartBody = new THREE.Mesh(boxGeo, warmCreamGlowMat);
  cartBody.scale.set(1.4, 0.85, 2.8);
  coasterCart.add(cartBody);
  speedGroup.add(coasterCart);
  root.add(speedGroup);

  // 5d. BATTLE SQUARE (Right Mid-Level, fiery red/orange colosseum arches)
  const battleGroup = new THREE.Group();
  battleGroup.position.set(42, 5.5, -13);
  battleGroup.rotation.y = -Math.PI * 0.42;

  for (let i = 0; i < 4; i++) {
    const archG = new THREE.TorusGeometry(5.6 - i * 0.65, 0.15, 8, 32, Math.PI);
    ownedGeos.push(archG);
    const archM = new THREE.Mesh(archG, i % 2 === 0 ? crimsonNeonMat : goldLedMat);
    archM.position.set(0, 0.8, -i * 0.7);
    battleGroup.add(archM);
  }
  const battleSign = makeBannerPlane(13.0, 4.8, tex.battleSign, 1.35);
  battleSign.position.set(0, 5.6, 0.5);
  battleGroup.add(battleSign);
  root.add(battleGroup);

  // 5e. CHOCOBO SQUARE (Right Foreground Ground-Level, vibrant hot-pink & yellow racing marquee)
  const chocoboGroup = new THREE.Group();
  const chocoboYaw = -Math.PI * 0.55;
  chocoboGroup.position.set(34, 0.2, 6);
  chocoboGroup.rotation.y = chocoboYaw;

  const chocoBackdrop = new THREE.Mesh(boxGeo, darkObsidianMat);
  chocoBackdrop.position.set(0, 3.8, -1.8);
  chocoBackdrop.scale.set(14.5, 7.6, 1.0);
  chocoboGroup.add(chocoBackdrop);
  cameraCollisionMeshes.push(chocoBackdrop);
  volumeColliders.push({
    cx: 34 + -1.8 * Math.sin(chocoboYaw),
    cz: 6 + -1.8 * Math.cos(chocoboYaw),
    halfW: 7.25,
    halfD: 0.65,
    cosY: Math.cos(chocoboYaw),
    sinY: Math.sin(chocoboYaw),
    minY: 0,
    maxY: 8.0,
    steppable: false,
  });

  // Stylized neon wing feathers flanking Chocobo Square sign
  for (const side of [-1, 1]) {
    for (let f = 0; f < 3; f++) {
      const feather = new THREE.Mesh(boxGeo, f % 2 === 0 ? goldLedMat : hotPinkGlowMat);
      feather.position.set(side * (6.2 + f * 0.65), 4.6 + f * 0.7, 0.2);
      feather.rotation.z = side * (0.45 - f * 0.16);
      feather.scale.set(2.4, 0.28, 0.18);
      chocoboGroup.add(feather);
    }
  }
  const chocoboSign = makeBannerPlane(12.2, 5.3, tex.chocoboSign, 1.35);
  chocoboSign.position.set(0, 4.0, 0.45);
  chocoboGroup.add(chocoboSign);
  root.add(chocoboGroup);

  // =========================================================================
  // 6. DIGITAL "SHOWDOWN" BILLBOARD SCREENS (WITH STRUCTURAL STANCHIONS / ARMS)
  // =========================================================================
  const screenPlacements: Array<{ x: number; y: number; z: number; yaw: number; mount: 'pylon' | 'arm' }> = [
    { x: -19, y: 7.3, z: -26, yaw: 0.52, mount: 'pylon' },
    { x: 14, y: 7.3, z: -29, yaw: -0.35, mount: 'pylon' },
    { x: 28, y: 7.3, z: -19, yaw: -0.92, mount: 'pylon' },
    { x: -30, y: 7.3, z: 12, yaw: 1.95, mount: 'arm' },
    { x: 24, y: 7.3, z: 24, yaw: -2.35, mount: 'pylon' },
  ];
  const screenMat = makeSignMat(tex.showdownScreen, 1.15);
  const screenPanelGeo = new THREE.PlaneGeometry(5.6, 3.5);
  ownedGeos.push(screenPanelGeo);
  for (const sp of screenPlacements) {
    const scr = new THREE.Group();
    scr.position.set(sp.x, sp.y, sp.z);
    scr.rotation.y = sp.yaw;

    const frame = new THREE.Mesh(boxGeo, darkObsidianMat);
    frame.scale.set(6.0, 3.9, 0.35);
    const face = new THREE.Mesh(screenPanelGeo, screenMat);
    face.position.z = 0.2;
    scr.add(frame, face);
    root.add(scr);

    if (sp.mount === 'pylon') {
      const groundY = getBaseTerrainY(sp.x, sp.z);
      const pylonH = sp.y - 1.95 - groundY;
      const pylon = new THREE.Mesh(cylGeo, darkObsidianMat);
      pylon.position.set(sp.x, groundY + pylonH * 0.5, sp.z);
      pylon.scale.set(0.28, pylonH, 0.28);
      pylon.castShadow = true;
      const plinth = new THREE.Mesh(cylGeo, goldTrimMat);
      plinth.position.set(sp.x, groundY + 0.14, sp.z);
      plinth.scale.set(0.54, 0.28, 0.54);
      root.add(pylon, plinth);
      circleColliders.push({ x: sp.x, z: sp.z, radius: 0.45, topY: sp.y });
    } else {
      // Cantilevered bracket arm anchoring screen (-30, 7.3, 12) cleanly to Left Lower Mezzanine parapet
      const arm = new THREE.Mesh(boxGeo, darkObsidianMat);
      arm.position.set(-1.6, -1.1, -2.0);
      arm.rotation.x = 0.42;
      arm.rotation.y = -0.35;
      arm.scale.set(0.32, 0.32, 5.2);
      scr.add(arm);
    }
  }

  // =========================================================================
  // 7. OVERHEAD SWEEPING CORAL-ROSE & CREAM RIBBED CANOPY ROOF + ATRIUM WALLS
  // =========================================================================
  // Sweeping overhead ceiling rings spanning from y = 26m to 44m, open toward -Z cosmic sky
  const canopyArcs: Array<{
    innerR: number;
    outerR: number;
    y: number;
    startAng: number;
    lengthAng: number;
  }> = [
    { innerR: 22, outerR: 38, y: 29.5, startAng: deg(-20), lengthAng: deg(245) },
    { innerR: 32, outerR: 52, y: 33.5, startAng: deg(-38), lengthAng: deg(275) },
    { innerR: 46, outerR: 70, y: 37.5, startAng: deg(-55), lengthAng: deg(300) },
    { innerR: 64, outerR: 92, y: 41.5, startAng: deg(0), lengthAng: deg(360) },
  ];
  for (const arc of canopyArcs) {
    const ringGeo = new THREE.RingGeometry(arc.innerR, arc.outerR, 56, 1, arc.startAng, arc.lengthAng);
    ringGeo.rotateX(Math.PI / 2);
    const lipGeo = new THREE.TorusGeometry(arc.innerR, 0.36, 8, 56, arc.lengthAng);
    lipGeo.rotateX(Math.PI / 2);
    lipGeo.rotateY(-arc.startAng);
    ownedGeos.push(ringGeo, lipGeo);

    const soffit = new THREE.Mesh(ringGeo, canopyPlumMat);
    soffit.position.y = arc.y;
    const ledRim = new THREE.Mesh(lipGeo, coralGlowMat);
    ledRim.position.y = arc.y - 0.15;
    root.add(soffit, ledRim);
  }

  // Outer 360° Atrium Rim Colonnade Wall (at r = 74m..84m so there is never an empty void)
  const outerWallGeo = new THREE.CylinderGeometry(76, 76, 36, 48, 1, true);
  ownedGeos.push(outerWallGeo);
  const outerWallMat = new THREE.MeshStandardMaterial({
    color: '#17112b',
    roughness: 0.72,
    metalness: 0.25,
    side: THREE.BackSide,
  });
  ownedMats.push(outerWallMat);
  const outerWall = new THREE.Mesh(outerWallGeo, outerWallMat);
  outerWall.position.y = 18;
  root.add(outerWall);

  // Glowing horizontal colosseum window bands along the outer wall
  for (const wy of [8.5, 16.5, 24.5]) {
    const bandGeo = new THREE.TorusGeometry(74.8, 0.22, 8, 64);
    bandGeo.rotateX(Math.PI / 2);
    ownedGeos.push(bandGeo);
    const band = new THREE.Mesh(bandGeo, wy === 16.5 ? coralGlowMat : warmCreamGlowMat);
    band.position.y = wy;
    root.add(band);
  }

  // =========================================================================
  // 8. FLOATING DECORATIVE SPHERES & GLOWING CHOCOBO CHICK BALLOON
  // =========================================================================
  const balloonMat = new THREE.MeshStandardMaterial({
    map: tex.balloonStripe,
    roughness: 0.28,
    metalness: 0.58,
  });
  ownedMats.push(balloonMat);

  // Left Upper Huge Terracotta Striped Balloon Sphere
  const terracottaBalloon = new THREE.Group();
  terracottaBalloon.position.set(-34, 29, -4);
  const terraSphere = new THREE.Mesh(sphereGeo, balloonMat);
  terraSphere.scale.setScalar(5.8);
  const terraRing = new THREE.Mesh(new THREE.TorusGeometry(5.95, 0.18, 8, 36), coralGlowMat);
  terraRing.rotation.x = Math.PI / 2;
  ownedGeos.push(terraRing.geometry);
  terracottaBalloon.add(terraSphere, terraRing);
  root.add(terracottaBalloon);

  // Right Upper Metallic Rose-Gold Ribbed Sphere
  const roseGoldBalloon = new THREE.Group();
  roseGoldBalloon.position.set(24, 24, -18);
  const roseSphere = new THREE.Mesh(sphereGeo, balloonMat);
  roseSphere.scale.setScalar(3.9);
  const roseRing = new THREE.Mesh(new THREE.TorusGeometry(4.02, 0.14, 8, 32), warmCreamGlowMat);
  roseRing.rotation.x = Math.PI / 2;
  ownedGeos.push(roseRing.geometry);
  roseGoldBalloon.add(roseSphere, roseRing);
  root.add(roseGoldBalloon);

  // Center-Upper Glowing Chocobo Chick Mascot Balloon!
  const chocoboBalloon = new THREE.Group();
  const chocoboBaseY = 22.5;
  chocoboBalloon.position.set(4.5, chocoboBaseY, -16);
  const chickGlowMat = new THREE.MeshStandardMaterial({
    color: '#fff9e6',
    emissive: '#fde68a',
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });
  ownedMats.push(chickGlowMat);

  const chickBody = new THREE.Mesh(sphereGeo, chickGlowMat);
  chickBody.scale.set(2.35, 2.25, 2.2);
  const chickBeak = new THREE.Mesh(coneGeo, goldLedMat);
  chickBeak.position.set(0, -0.15, 2.35);
  chickBeak.rotation.x = Math.PI * 0.5;
  chickBeak.scale.set(0.36, 0.65, 0.28);
  chocoboBalloon.add(chickBody, chickBeak);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(sphereGeo, darkObsidianMat);
    eye.position.set(sx * 0.72, 0.32, 2.04);
    eye.scale.set(0.18, 0.24, 0.14);
    const wing = new THREE.Mesh(boxGeo, chickGlowMat);
    wing.position.set(sx * 2.85, 0.25, 0);
    wing.rotation.z = sx * 0.28;
    wing.scale.set(1.65, 0.26, 0.9);
    chocoboBalloon.add(eye, wing);
  }
  root.add(chocoboBalloon);

  // =========================================================================
  // 9. TROPICAL PALM TREES (11 composite palms anchored firmly on plaza & upper decks)
  // =========================================================================
  const palmPlacements: Array<{ x: number; y: number; z: number; h: number; lean: number; yaw: number }> = [
    { x: -13, y: 0, z: -18, h: 11.5, lean: 0.08, yaw: 0.4 },
    { x: 9, y: 0, z: -19, h: 12.0, lean: 0.09, yaw: -0.5 },
    { x: -18, y: 0, z: 3, h: 9.8, lean: 0.07, yaw: 1.2 },
    { x: -30.5, y: 5.4, z: -23.7, h: 11.2, lean: 0.1, yaw: 0.2 },
    { x: -27.8, y: 11.2, z: -34.8, h: 12.4, lean: 0.08, yaw: 0.6 },
    { x: 27.5, y: 11.2, z: -35.0, h: 11.8, lean: 0.08, yaw: -0.7 },
    { x: 31.8, y: 5.4, z: -22.0, h: 10.6, lean: 0.07, yaw: -0.9 },
    { x: -28, y: 0, z: 24, h: 10.2, lean: 0.06, yaw: 2.1 },
    { x: 26, y: 0, z: 25, h: 10.4, lean: 0.06, yaw: -2.0 },
    { x: -7, y: 0, z: 27, h: 9.5, lean: 0.05, yaw: 3.1 },
    { x: 11, y: 0, z: 27, h: 9.8, lean: 0.05, yaw: 2.8 },
  ];

  const frondGeo = new THREE.BoxGeometry(0.46, 0.08, 4.2);
  ownedGeos.push(frondGeo);

  for (const pm of palmPlacements) {
    const baseY = pm.y > 0 ? pm.y : getBaseTerrainY(pm.x, pm.z);
    const tree = new THREE.Group();
    tree.position.set(pm.x, baseY - 0.12, pm.z);
    tree.rotation.y = pm.yaw;

    // 4-segment gently curving trunk
    const segs = 4;
    const segH = pm.h / segs;
    let curX = 0;
    let curY = 0;
    for (let s = 0; s < segs; s++) {
      const rBot = 0.42 - s * 0.055;
      const rTop = 0.36 - s * 0.055;
      const tGeo = new THREE.CylinderGeometry(rTop, rBot, segH + 0.15, 10);
      ownedGeos.push(tGeo);
      const tMesh = new THREE.Mesh(tGeo, palmTrunkMat);
      const tilt = pm.lean * (s + 0.5);
      curX += Math.sin(tilt) * segH * 0.45;
      tMesh.position.set(curX, curY + segH * 0.5, 0);
      tMesh.rotation.z = -tilt;
      tMesh.castShadow = true;
      tree.add(tMesh);
      curY += segH;
    }

    // Golden fruit/date clusters under crown
    for (let d = 0; d < 3; d++) {
      const da = (d / 3) * Math.PI * 2;
      const dateCluster = new THREE.Mesh(sphereGeo, palmDateMat);
      dateCluster.position.set(curX + Math.cos(da) * 0.48, curY - 0.55, Math.sin(da) * 0.48);
      dateCluster.scale.set(0.32, 0.55, 0.32);
      tree.add(dateCluster);
    }

    // 10 arching palm fronds
    const frondCount = 10;
    for (let f = 0; f < frondCount; f++) {
      const fa = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.15;
      const pitch = f % 2 === 0 ? 0.32 : 0.62;
      const frondGroup = new THREE.Group();
      frondGroup.position.set(curX, curY, 0);
      frondGroup.rotation.y = fa;

      const leaf1 = new THREE.Mesh(frondGeo, palmLeafMat);
      leaf1.position.set(0, 0.35, 1.9);
      leaf1.rotation.x = -pitch * 0.5;
      const leaf2 = new THREE.Mesh(frondGeo, palmLeafMat);
      leaf2.position.set(0, -0.35, 4.6);
      leaf2.rotation.x = pitch * 0.95;
      leaf2.scale.set(0.78, 1, 0.72);
      frondGroup.add(leaf1, leaf2);
      tree.add(frondGroup);
    }

    root.add(tree);
    volumeColliders.push({
      cx: pm.x,
      cz: pm.z,
      halfW: 0.45,
      halfD: 0.45,
      cosY: 1,
      sinY: 0,
      minY: baseY - 0.12,
      maxY: baseY + 3.5,
      steppable: false,
    });
  }

  // =========================================================================
  // 10. FESTIVE GOLD & PEARL BALLOON GARLANDS + PLAZA STREETLIGHTS (INSTANCED)
  // =========================================================================
  const garlandBases: Array<{ x: number; y: number; z: number; h: number }> = [
    { x: -12.5, y: 0, z: 16.5, h: 6.2 },
    { x: 14.5, y: 0, z: 16.5, h: 6.2 },
    { x: 25.0, y: 0, z: 10.5, h: 7.0 },
    { x: 24.5, y: 0, z: -1.5, h: 7.0 },
    { x: -24.5, y: 0, z: -12.0, h: 6.6 },
    { x: -16.5, y: 0, z: -22.5, h: 6.8 },
    { x: 16.5, y: 0, z: -22.5, h: 6.8 },
    { x: 0, y: 0, z: 24.5, h: 6.2 },
  ];

  const goldMatrices: THREE.Matrix4[] = [];
  const pearlMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  for (const gb of garlandBases) {
    const baseY = getBaseTerrainY(gb.x, gb.z);
    // Warm glowing lamppost column
    const post = new THREE.Mesh(cylGeo, goldTrimMat);
    post.position.set(gb.x, baseY + gb.h * 0.5, gb.z);
    post.scale.set(0.14, gb.h, 0.14);
    const lantern = new THREE.Mesh(sphereGeo, warmCreamGlowMat);
    lantern.position.set(gb.x, baseY + gb.h + 0.35, gb.z);
    lantern.scale.setScalar(0.48);
    root.add(post, lantern);
    circleColliders.push({ x: gb.x, z: gb.z, radius: 0.52, topY: baseY + gb.h });

    // Spiraling festive cluster of 28 gold & pearl balloons around each post
    for (let b = 0; b < 28; b++) {
      const t = b / 27;
      const ang = b * 1.15;
      const rad = 0.42 + Math.sin(t * Math.PI) * 0.48;
      const bx = gb.x + Math.cos(ang) * rad;
      const by = baseY + 0.65 + t * (gb.h - 0.9);
      const bz = gb.z + Math.sin(ang) * rad;
      const sz = 0.28 + (b % 3) * 0.08;
      dummy.position.set(bx, by, bz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(sz);
      dummy.updateMatrix();
      if (b % 2 === 0) {
        goldMatrices.push(dummy.matrix.clone());
      } else {
        pearlMatrices.push(dummy.matrix.clone());
      }
    }
  }

  const goldBalloons = new THREE.InstancedMesh(sphereGeo, balloonGoldMat, goldMatrices.length);
  const pearlBalloons = new THREE.InstancedMesh(sphereGeo, balloonPearlMat, pearlMatrices.length);
  goldMatrices.forEach((m, idx) => goldBalloons.setMatrixAt(idx, m));
  pearlMatrices.forEach((m, idx) => pearlBalloons.setMatrixAt(idx, m));
  goldBalloons.instanceMatrix.needsUpdate = true;
  pearlBalloons.instanceMatrix.needsUpdate = true;
  goldBalloons.computeBoundingSphere();
  pearlBalloons.computeBoundingSphere();
  ownedInstanced.push(goldBalloons, pearlBalloons);
  root.add(goldBalloons, pearlBalloons);

  // =========================================================================
  // 11. VINTAGE MUSTARD-YELLOW SIGHTSEEING BUSES ON OUTER PLAZA RING ROAD
  // =========================================================================
  const busMat = new THREE.MeshStandardMaterial({
    map: tex.busBody,
    emissiveMap: tex.busBody,
    emissive: '#ffffff',
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.22,
  });
  ownedMats.push(busMat);

  const busSpecs: Array<{ x: number; z: number; yaw: number }> = [
    { x: -13.5, z: -20.5, yaw: 0.85 },
    { x: 18.5, z: -15.5, yaw: -0.78 },
    { x: 24.5, z: 14.5, yaw: -2.15 },
  ];
  for (const bs of busSpecs) {
    const by = getBaseTerrainY(bs.x, bs.z);
    const bus = new THREE.Group();
    bus.position.set(bs.x, by, bs.z);
    bus.rotation.y = bs.yaw;

    // Main body
    const body = new THREE.Mesh(boxGeo, busMat);
    body.position.set(0, 1.38, 0);
    body.scale.set(2.15, 1.85, 5.2);
    body.castShadow = true;
    body.receiveShadow = true;
    // Rounded cream roof cap
    const roof = new THREE.Mesh(boxGeo, creamWhiteMat);
    roof.position.set(0, 2.38, 0);
    roof.scale.set(2.05, 0.34, 4.95);
    // Bumper & headlights
    const bumper = new THREE.Mesh(boxGeo, goldTrimMat);
    bumper.position.set(0, 0.48, 2.62);
    bumper.scale.set(2.1, 0.24, 0.16);
    bus.add(body, roof, bumper);
    for (const lx of [-0.68, 0.68]) {
      const hl = new THREE.Mesh(sphereGeo, warmCreamGlowMat);
      hl.position.set(lx, 0.92, 2.62);
      hl.scale.setScalar(0.18);
      bus.add(hl);
    }
    for (const wx of [-1.02, 1.02]) {
      for (const wz of [-1.55, 1.55]) {
        const wheel = new THREE.Mesh(cylGeo, darkObsidianMat);
        wheel.position.set(wx, 0.42, wz);
        wheel.rotation.z = Math.PI / 2;
        wheel.scale.set(0.42, 0.26, 0.42);
        bus.add(wheel);
      }
    }
    root.add(bus);
    cameraCollisionMeshes.push(body);
    volumeColliders.push({
      cx: bs.x,
      cz: bs.z,
      halfW: 1.15,
      halfD: 2.7,
      cosY: Math.cos(bs.yaw),
      sinY: Math.sin(bs.yaw),
      minY: by,
      maxY: by + 2.6,
      steppable: false,
    });
  }

  // =========================================================================
  // 12. LOCALIZED ATMOSPHERIC POINT LIGHTS (NO SHADOWS — FAST GPU FILL)
  // =========================================================================
  const addAccentLight = (hex: string, intensity: number, dist: number, x: number, y: number, z: number) => {
    const l = new THREE.PointLight(hex, intensity, dist, 1.5);
    l.position.set(x, y, z);
    root.add(l);
  };
  addAccentLight('#ffd9a8', 42, 34, 0, 5.5, 0); // Central fountain warm golden glow
  addAccentLight('#ff38cc', 85, 72, -3, 22, -46); // Gold Saucer magenta starburst glow
  addAccentLight('#9333ea', 55, 45, -35, 7, -6); // Ghost Square purple glow
  addAccentLight('#38bdf8', 55, 45, 28, 15, -30); // Speed Square cyan glow
  addAccentLight('#ef4444', 50, 42, 37, 9, -12); // Battle Square red-orange glow
  addAccentLight('#f472b6', 50, 40, 29, 6, 6); // Chocobo Square pink-gold glow
  addAccentLight('#fde68a', 35, 36, 0, 8, 22); // Foreground plaza warm fill

  const anim: AnimatedRefs = {
    chocoboBalloon,
    chocoboBaseY,
    terracottaBalloon,
    roseGoldBalloon,
    fountainWaterPool,
    fountainSplashRing,
    coasterCart,
    coasterCurve,
    ghostFigs,
    ghostBaseYs,
    fountainJets,
  };

  const tmpPos = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();

  return {
    root,
    cameraCollisionMeshes,
    volumeColliders,
    circleColliders,
    walkableSurfaces,
    update: (_delta, elapsed) => {
      // Gentle bobbing & swaying for floating balloons
      anim.chocoboBalloon.position.y = anim.chocoboBaseY + Math.sin(elapsed * 1.1) * 0.55;
      anim.chocoboBalloon.rotation.y = Math.sin(elapsed * 0.45) * 0.14;
      anim.terracottaBalloon.position.y = 29 + Math.sin(elapsed * 0.7 + 1.1) * 0.45;
      anim.terracottaBalloon.rotation.y = elapsed * 0.08;
      anim.roseGoldBalloon.position.y = 24 + Math.cos(elapsed * 0.85) * 0.4;
      anim.roseGoldBalloon.rotation.y = -elapsed * 0.1;

      // Fountain splash & water shimmer
      const pulse = 1 + Math.sin(elapsed * 3.8) * 0.06;
      anim.fountainSplashRing.scale.set(pulse, 1, pulse);
      for (let i = 0; i < anim.fountainJets.length; i++) {
        const j = anim.fountainJets[i];
        j.scale.y = 0.96 + Math.sin(elapsed * 6.0 + i * 0.7) * 0.05;
      }

      // Coaster shuttle gliding along Speed Square track
      const u = (elapsed * 0.11) % 1;
      anim.coasterCurve.getPointAt(u, tmpPos);
      anim.coasterCurve.getTangentAt(u, tmpTan);
      anim.coasterCart.position.copy(tmpPos);
      anim.coasterCart.lookAt(tmpPos.x + tmpTan.x, tmpPos.y + tmpTan.y, tmpPos.z + tmpTan.z);

      // Ghost Square floating ghost silhouettes
      for (let i = 0; i < anim.ghostFigs.length; i++) {
        anim.ghostFigs[i].position.y =
          anim.ghostBaseYs[i] + Math.sin(elapsed * 1.7 + i * 1.9) * 0.48;
      }
    },
    dispose: () => {
      tex.dispose();
      for (const im of ownedInstanced) im.dispose();
      ownedInstanced.length = 0;
      for (const g of ownedGeos) g.dispose();
      ownedGeos.length = 0;
      for (const m of ownedMats) m.dispose();
      ownedMats.length = 0;
    },
  };
}
