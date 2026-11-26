import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetManager } from '../core/AssetManager';
import type { QualityPreset } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import { clamp } from '../utils/MathUtils';
import {
  BuildingSystem,
  evaluateWalkableSurfaceY,
  type AccessibleWindow,
  type BuildingOccluder,
  type BuildingSectorEntry,
  type InteractiveDoor,
  type OrientedVolumeCollider,
  type SittableSeat,
  type WalkableSurface,
} from './BuildingSystem';
import type { LootPoint } from './IMapSystem';
import type { MapConfig, ObstacleSpec } from './MapData';
import {
  buildBuildingPads,
  FOREST_RIVER_WATER_Y,
  getForestRiverCenterZ,
  getForestRiverHalfWidth,
  getForestRiverMask,
  getSnowLakeMask,
  sampleGradedTerrainY,
  SNOW_LAKE_CENTER_X,
  SNOW_LAKE_CENTER_Z,
  SNOW_LAKE_ICE_Y,
  SNOW_LAKE_RX,
  SNOW_LAKE_RZ,
} from './MapTerrain';
import { buildFuturisticWaitingArenaStructures } from './FuturisticWaitingArena';
import { createSculptedRockGeometry, type RockCollider } from './RockGeometry';
import { buildTrainingGroundStructures } from './TrainingGroundStructures';
import {
  buildMapZiplines,
  MAP_ZIPLINES,
  type ZiplineInstance,
} from './ZiplineSystem';

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  topY: number;
}

export interface RoadHeightField {
  midX: number;
  midZ: number;
  halfW: number;
  halfLen: number;
  cosY: number;
  sinY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  widthSegs: number;
  lengthSegs: number;
  heights: Float32Array;
}

export function evaluateRoadFieldY(rf: RoadHeightField, x: number, z: number): number | null {
  if (x < rf.minX || x > rf.maxX || z < rf.minZ || z > rf.maxZ) return null;
  const dx = x - rf.midX;
  const dz = z - rf.midZ;
  const localX = dx * rf.cosY - dz * rf.sinY;
  const localZ = dx * rf.sinY + dz * rf.cosY;
  if (Math.abs(localX) > rf.halfW || Math.abs(localZ) > rf.halfLen) return null;
  const u = clamp((localX + rf.halfW) / Math.max(0.01, rf.halfW * 2), 0, 1) * rf.widthSegs;
  const v = clamp((localZ + rf.halfLen) / Math.max(0.01, rf.halfLen * 2), 0, 1) * rf.lengthSegs;
  const col = Math.min(rf.widthSegs - 1, Math.floor(u));
  const row = Math.min(rf.lengthSegs - 1, Math.floor(v));
  const fu = u - col;
  const fv = v - row;
  const stride = rf.widthSegs + 1;
  const a = rf.heights[row * stride + col];
  const b = rf.heights[(row + 1) * stride + col];
  const c = rf.heights[(row + 1) * stride + (col + 1)];
  const d = rf.heights[row * stride + (col + 1)];
  if (fu + fv <= 1) {
    return a + fu * (d - a) + fv * (b - a);
  }
  return c + (1 - fu) * (b - c) + (1 - fv) * (d - c);
}

export interface MapBuildOptions {
  quality: QualityPreset;
  isCompact: boolean;
  disableScatterShadows?: boolean;
}

export interface LoadedMapScene {
  config: MapConfig;
  root: THREE.Group;
  cameraCollisionMeshes: THREE.Object3D[];
  sectorEntries: BuildingSectorEntry[];
  buildingOccluders: BuildingOccluder[];
  scatterShadowMeshes: THREE.Mesh[];
  detailScatterMeshes: THREE.Object3D[];
  obstacleShadowMeshes: THREE.Mesh[];
  volumeColliders: OrientedVolumeCollider[];
  walkableSurfaces: WalkableSurface[];
  roadFields: RoadHeightField[];
  circleColliders: CircleCollider[];
  rockColliders: RockCollider[];
  doors: InteractiveDoor[];
  windows: AccessibleWindow[];
  seats: SittableSeat[];
  ziplines: ZiplineInstance[];
  interiorLootPoints: LootPoint[];
  beaconRingOuter: THREE.Mesh;
  beaconRingInner: THREE.Mesh;
  beaconCore: THREE.Mesh;
  shopAccentMat: THREE.MeshStandardMaterial;
  getBaseTerrainY: (x: number, z: number) => number;
  getTerrainHeightAt: (x: number, z: number, currentY?: number) => number;
  updateDynamicElements?: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

const nextFrameYield = (): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, 0));

export class MapLoader {
  private readonly buildingSystem: BuildingSystem;
  private readonly roadTextureCache = new Map<string, THREE.CanvasTexture>();
  private readonly biomeTextureCache = new Map<
    string,
    { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture | null }
  >();

  constructor(private readonly assetManager: AssetManager) {
    this.buildingSystem = new BuildingSystem(assetManager);
  }

  dispose(): void {
    for (const tex of this.roadTextureCache.values()) {
      tex.dispose();
    }
    this.roadTextureCache.clear();
    for (const pair of this.biomeTextureCache.values()) {
      pair.map.dispose();
      pair.roughnessMap?.dispose();
    }
    this.biomeTextureCache.clear();
  }

  private resolveBuildOptions(
    isMobileOrOpts: boolean | MapBuildOptions,
    disableScatterShadowsArg?: boolean,
  ): { quality: QualityPreset; isCompact: boolean; disableScatterShadows: boolean } {
    if (typeof isMobileOrOpts === 'boolean') {
      const isCompact = isMobileOrOpts;
      return {
        quality: isCompact ? 'low' : 'medium',
        isCompact,
        disableScatterShadows: disableScatterShadowsArg ?? isCompact,
      };
    }
    return {
      quality: isMobileOrOpts.quality,
      isCompact: isMobileOrOpts.isCompact,
      disableScatterShadows:
        isMobileOrOpts.disableScatterShadows ??
        (isMobileOrOpts.quality !== 'high' || isMobileOrOpts.isCompact),
    };
  }

  buildMap(
    config: MapConfig,
    isMobileOrOpts: boolean | MapBuildOptions,
    disableScatterShadowsArg?: boolean,
  ): LoadedMapScene {
    const { quality, isCompact, disableScatterShadows } = this.resolveBuildOptions(
      isMobileOrOpts,
      disableScatterShadowsArg,
    );
    const root = new THREE.Group();
    const ownedGeometries: THREE.BufferGeometry[] = [];
    const ownedMaterials: THREE.Material[] = [];
    const ownedTextures: THREE.Texture[] = [];
    const ownedInstancedMeshes: THREE.InstancedMesh[] = [];
    const cameraCollisionMeshes: THREE.Object3D[] = [];
    const scatterShadowMeshes: THREE.Mesh[] = [];
    const detailScatterMeshes: THREE.Object3D[] = [];
    const obstacleShadowMeshes: THREE.Mesh[] = [];
    const volumeColliders: OrientedVolumeCollider[] = [];
    const walkableSurfaces: WalkableSurface[] = [];
    const circleColliders: CircleCollider[] = [];
    const rockColliders: RockCollider[] = [];
    const roadFields: RoadHeightField[] = [];

    // Precompute building flat pads so every doorway & foundation rests flush on terrain
    const buildingPads = buildBuildingPads(config);

    // 1. Procedural Biome Ground Texture (cached) & 4x4 Chunked Terrain Heightfield
    const skipRoughnessMaps = quality === 'low';
    const groundTexSize = quality === 'low' ? 256 : 512;
    const groundPbr = this.createBiomeTexture(config, groundTexSize, skipRoughnessMaps);

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundPbr.map,
      roughnessMap: groundPbr.roughnessMap,
      roughness: config.biome === 'snow' ? 0.68 : 0.92,
      metalness: 0.04,
    });
    ownedMaterials.push(terrainMat);

    const { getBaseTerrainY, getTerrainHeightAt } = this.buildTerrainChunks(
      config,
      buildingPads,
      quality,
      isCompact,
      terrainMat,
      root,
      ownedGeometries,
      cameraCollisionMeshes,
      walkableSurfaces,
      roadFields,
    );

    // 1b. Biome Water / Frozen Glacier Lake Features (excluded in Staging Compound & Training Ground)
    if (!config.isWaitingArena && !config.isTrainingGround && config.biome === 'forest') {
      const riverMesh = this.buildForestRiverMesh(ownedGeometries, ownedMaterials);
      root.add(riverMesh);
      this.buildForestRiverBridges(
        config,
        getBaseTerrainY,
        root,
        ownedGeometries,
        ownedMaterials,
        cameraCollisionMeshes,
        volumeColliders,
        walkableSurfaces,
      );
    } else if (!config.isWaitingArena && !config.isTrainingGround && config.biome === 'snow') {
      const lakeMesh = this.buildSnowLakeMesh(ownedGeometries, ownedMaterials);
      root.add(lakeMesh);
      cameraCollisionMeshes.push(lakeMesh);
    }

    // 2. Merged Highway & Street Road Network conforming smoothly to terrain
    this.buildMergedRoadNetwork(
      config,
      getBaseTerrainY,
      root,
      ownedGeometries,
      ownedMaterials,
      ownedTextures,
      roadFields,
      quality === 'low' || isCompact,
    );
    if (!config.isWaitingArena && !config.isTrainingGround) {
      this.buildHighwaySolarPylons(
        config,
        getBaseTerrainY,
        root,
        ownedGeometries,
        ownedMaterials,
        detailScatterMeshes,
        ownedInstancedMeshes,
      );
    }

    // 3. Central Drop Pad, Beacon Spire & Shop Crate (excluded in Waiting Lobby & Training Ground)
    const seats: SittableSeat[] = [];
    let beaconRingOuter: THREE.Mesh;
    let beaconRingInner: THREE.Mesh;
    let beaconCore: THREE.Mesh;
    let shopAccentMat: THREE.MeshStandardMaterial;

    if (config.isWaitingArena || config.isTrainingGround) {
      const dummyGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      const dummyMat = new THREE.MeshStandardMaterial({ color: '#f97316', visible: false });
      shopAccentMat = new THREE.MeshStandardMaterial({ color: '#f97316', visible: false });
      ownedGeometries.push(dummyGeo);
      ownedMaterials.push(dummyMat, shopAccentMat);
      beaconRingOuter = new THREE.Mesh(dummyGeo, dummyMat);
      beaconRingInner = new THREE.Mesh(dummyGeo, dummyMat);
      beaconCore = new THREE.Mesh(dummyGeo, dummyMat);
      beaconRingOuter.visible = false;
      beaconRingInner.visible = false;
      beaconCore.visible = false;
    } else {
      const metalRoughTex = this.assetManager.createBrushedMetalTexture();
      const padMat = new THREE.MeshStandardMaterial({
        color: '#1f2937',
        roughness: 0.55,
        metalness: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const trimMat = new THREE.MeshStandardMaterial({
        color: '#64748b',
        roughness: 0.25,
        roughnessMap: metalRoughTex,
        metalness: 0.88,
      });
      const cyanGlowMat = new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0ea5e9',
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.1,
      });
      const orangeGlowMat = new THREE.MeshStandardMaterial({
        color: '#f97316',
        emissive: '#ea580c',
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.1,
      });
      shopAccentMat = new THREE.MeshStandardMaterial({
        color: '#f97316',
        emissive: '#f97316',
        emissiveIntensity: 1.1,
        roughness: 0.25,
        metalness: 0.4,
      });
      ownedMaterials.push(padMat, trimMat, cyanGlowMat, orangeGlowMat, shopAccentMat);

      const padBaseGeo = new THREE.CylinderGeometry(5.2, 5.8, 0.24, 8);
      const padRingGeo = new THREE.TorusGeometry(5.25, 0.1, 8, 28);
      padRingGeo.rotateX(Math.PI / 2);
      ownedGeometries.push(padBaseGeo, padRingGeo);

      const padBase = new THREE.Mesh(padBaseGeo, padMat);
      padBase.position.y = 0.12;
      padBase.receiveShadow = true;
      padBase.castShadow = true;
      root.add(padBase);
      cameraCollisionMeshes.push(padBase);

      const padRing = new THREE.Mesh(padRingGeo, trimMat);
      padRing.position.y = 0.24;
      root.add(padRing);

      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(0, 0, -4.4);
      const plinthGeo = new THREE.CylinderGeometry(1.3, 1.65, 0.55, 6);
      const pylonGeo = new THREE.BoxGeometry(0.26, 3.6, 0.42);
      const outerRingGeo = new THREE.TorusGeometry(1.4, 0.055, 8, 28);
      const innerRingGeo = new THREE.TorusGeometry(0.95, 0.04, 8, 24);
      const coreGeo = new THREE.OctahedronGeometry(0.45, 0);
      ownedGeometries.push(plinthGeo, pylonGeo, outerRingGeo, innerRingGeo, coreGeo);

      const plinth = new THREE.Mesh(plinthGeo, trimMat);
      plinth.position.y = 0.275;
      plinth.castShadow = true;
      beaconGroup.add(plinth);
      cameraCollisionMeshes.push(plinth);
      circleColliders.push({ x: 0, z: -4.4, radius: 1.65, topY: 0.55 });

      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        const pylon = new THREE.Mesh(pylonGeo, padMat);
        pylon.position.set(Math.sin(a) * 1.25, 1.9, Math.cos(a) * 1.25);
        pylon.rotation.y = a;
        pylon.rotation.x = 0.14;
        beaconGroup.add(pylon);
      }

      beaconRingOuter = new THREE.Mesh(outerRingGeo, cyanGlowMat);
      beaconRingOuter.position.y = 3.15;
      beaconRingInner = new THREE.Mesh(innerRingGeo, orangeGlowMat);
      beaconRingInner.position.y = 3.15;
      beaconCore = new THREE.Mesh(coreGeo, cyanGlowMat);
      beaconCore.position.y = 3.15;
      beaconGroup.add(beaconRingOuter, beaconRingInner, beaconCore);
      root.add(beaconGroup);

      // Shop Supply Crate Prop (3.8, 2.2)
      const crateGroup = new THREE.Group();
      const crateY = getBaseTerrainY(3.8, 2.2) + 0.24;
      crateGroup.position.set(3.8, crateY, 2.2);
      crateGroup.rotation.y = -0.42;

      const crateBodyGeo = new THREE.BoxGeometry(1.45, 0.9, 1.0);
      const crateLidGeo = new THREE.BoxGeometry(1.52, 0.2, 1.08);
      const crateStripGeo = new THREE.BoxGeometry(1.18, 0.08, 1.04);
      ownedGeometries.push(crateBodyGeo, crateLidGeo, crateStripGeo);

      const crateBody = new THREE.Mesh(crateBodyGeo, padMat);
      crateBody.position.y = 0.45;
      crateBody.castShadow = true;
      crateBody.receiveShadow = true;
      const crateLid = new THREE.Mesh(crateLidGeo, trimMat);
      crateLid.position.y = 1.0;
      const crateStrip = new THREE.Mesh(crateStripGeo, shopAccentMat);
      crateStrip.position.y = 0.7;
      crateGroup.add(crateBody, crateLid, crateStrip);
      root.add(crateGroup);
      cameraCollisionMeshes.push(crateBody);
      circleColliders.push({ x: 3.8, z: 2.2, radius: 0.9, topY: crateY + 1.1 });

      this.buildPlazaBenches(
        config,
        getBaseTerrainY,
        root,
        ownedGeometries,
        ownedMaterials,
        cameraCollisionMeshes,
        volumeColliders,
        seats,
      );
    }

    // 4. Fully Explorable Multi-Floor Buildings (doors, windows, stairs, furniture, rooftops)
    const buildingResult = this.buildingSystem.buildBuildings(
      config.biome,
      config.buildings,
      getBaseTerrainY,
      disableScatterShadows,
      { compactTextures: isCompact, skipRoughnessMaps },
    );
    root.add(buildingResult.root);
    for (const m of buildingResult.structuralMeshes) {
      cameraCollisionMeshes.push(m);
    }
    for (const dm of buildingResult.doorLeafMeshes) {
      cameraCollisionMeshes.push(dm);
    }
    volumeColliders.push(...buildingResult.volumeColliders);
    walkableSurfaces.push(...buildingResult.walkableSurfaces);
    seats.push(...buildingResult.seats);

    // 5. Sectored Tactical Cover Obstacles (frustum & distance LOD culled)
    this.buildMergedObstacles(
      config.obstacles,
      getBaseTerrainY,
      root,
      ownedGeometries,
      ownedMaterials,
      cameraCollisionMeshes,
      obstacleShadowMeshes,
      buildingResult.sectorEntries,
      volumeColliders,
      walkableSurfaces,
      rockColliders,
      disableScatterShadows,
    );

    // 6. Spatially-Chunked Instanced Rocks, Cacti/Mesas, Multi-Species Trees & Mountains
    this.buildInstancedScatter(
      config,
      getBaseTerrainY,
      root,
      ownedGeometries,
      ownedMaterials,
      circleColliders,
      rockColliders,
      scatterShadowMeshes,
      detailScatterMeshes,
      buildingResult.sectorEntries,
      isCompact || quality === 'low',
      disableScatterShadows,
      ownedInstancedMeshes,
    );

    const waitingArenaBuild = config.isWaitingArena
      ? buildFuturisticWaitingArenaStructures(getBaseTerrainY)
      : null;
    if (waitingArenaBuild) {
      root.add(waitingArenaBuild.root);
      cameraCollisionMeshes.push(...waitingArenaBuild.cameraCollisionMeshes);
      volumeColliders.push(...waitingArenaBuild.volumeColliders);
      walkableSurfaces.push(...waitingArenaBuild.walkableSurfaces);
      if (waitingArenaBuild.circleColliders) {
        circleColliders.push(...waitingArenaBuild.circleColliders);
      }
    }

    const trainingGroundBuild = config.isTrainingGround
      ? buildTrainingGroundStructures(getBaseTerrainY, {
          quality,
          isCompact,
          disableScatterShadows,
        })
      : null;
    if (trainingGroundBuild) {
      root.add(trainingGroundBuild.root);
      cameraCollisionMeshes.push(...trainingGroundBuild.cameraCollisionMeshes);
      volumeColliders.push(...trainingGroundBuild.volumeColliders);
      walkableSurfaces.push(...trainingGroundBuild.walkableSurfaces);
      circleColliders.push(...trainingGroundBuild.circleColliders);
      rockColliders.push(...trainingGroundBuild.rockColliders);
      buildingResult.sectorEntries.push(...trainingGroundBuild.sectorEntries);
    }

    const ziplineSpecs =
      config.isWaitingArena || config.isTrainingGround ? [] : (MAP_ZIPLINES[config.id] ?? []);
    const ziplineBuild = buildMapZiplines(ziplineSpecs, getBaseTerrainY, volumeColliders);
    if (ziplineBuild.ziplines.length > 0) {
      root.add(ziplineBuild.root);
      volumeColliders.push(...ziplineBuild.colliders);
    }

    return {
      config,
      root,
      cameraCollisionMeshes,
      sectorEntries: buildingResult.sectorEntries,
      buildingOccluders: buildingResult.buildingOccluders,
      scatterShadowMeshes,
      detailScatterMeshes,
      obstacleShadowMeshes,
      volumeColliders,
      walkableSurfaces,
      roadFields,
      circleColliders,
      rockColliders,
      doors: buildingResult.doors,
      windows: buildingResult.windows,
      seats,
      ziplines: ziplineBuild.ziplines,
      interiorLootPoints: buildingResult.lootPoints,
      beaconRingOuter,
      beaconRingInner,
      beaconCore,
      shopAccentMat,
      getBaseTerrainY,
      getTerrainHeightAt,
      updateDynamicElements: (delta: number, elapsed: number) => {
        waitingArenaBuild?.update(delta, elapsed);
        ziplineBuild.updateAnimations(delta, elapsed);
      },
      dispose: () => {
        waitingArenaBuild?.dispose();
        trainingGroundBuild?.dispose();
        ziplineBuild.dispose();
        buildingResult.dispose();
        for (const im of ownedInstancedMeshes) im.dispose();
        ownedInstancedMeshes.length = 0;
        for (const g of ownedGeometries) g.dispose();
        ownedGeometries.length = 0;
        for (const m of ownedMaterials) m.dispose();
        ownedMaterials.length = 0;
        for (const t of ownedTextures) t.dispose();
        ownedTextures.length = 0;
        cameraCollisionMeshes.length = 0;
        scatterShadowMeshes.length = 0;
        detailScatterMeshes.length = 0;
        obstacleShadowMeshes.length = 0;
      },
    };
  }

  async buildMapProgressive(
    config: MapConfig,
    isMobileOrOpts: boolean | MapBuildOptions,
    disableScatterShadowsArg?: boolean,
    onStage?: (stageLabel: string) => void,
  ): Promise<LoadedMapScene> {
    const { quality, isCompact, disableScatterShadows } = this.resolveBuildOptions(
      isMobileOrOpts,
      disableScatterShadowsArg,
    );
    onStage?.(i18n.t('loading.stage.terrain'));
    await nextFrameYield();
    const root = new THREE.Group();
    const ownedGeometries: THREE.BufferGeometry[] = [];
    const ownedMaterials: THREE.Material[] = [];
    const ownedTextures: THREE.Texture[] = [];
    const ownedInstancedMeshes: THREE.InstancedMesh[] = [];
    const cameraCollisionMeshes: THREE.Object3D[] = [];
    const scatterShadowMeshes: THREE.Mesh[] = [];
    const detailScatterMeshes: THREE.Object3D[] = [];
    const obstacleShadowMeshes: THREE.Mesh[] = [];
    const volumeColliders: OrientedVolumeCollider[] = [];
    const walkableSurfaces: WalkableSurface[] = [];
    const circleColliders: CircleCollider[] = [];
    const rockColliders: RockCollider[] = [];
    const roadFields: RoadHeightField[] = [];

    const buildingPads = buildBuildingPads(config);

    const skipRoughnessMaps = quality === 'low';
    const groundTexSize = quality === 'low' ? 256 : 512;
    const groundPbr = this.createBiomeTexture(config, groundTexSize, skipRoughnessMaps);

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundPbr.map,
      roughnessMap: groundPbr.roughnessMap,
      roughness: config.biome === 'snow' ? 0.68 : 0.92,
      metalness: 0.04,
    });
    ownedMaterials.push(terrainMat);

    const { getBaseTerrainY, getTerrainHeightAt } = this.buildTerrainChunks(
      config,
      buildingPads,
      quality,
      isCompact,
      terrainMat,
      root,
      ownedGeometries,
      cameraCollisionMeshes,
      walkableSurfaces,
      roadFields,
    );

    if (!config.isWaitingArena && !config.isTrainingGround && config.biome === 'forest') {
      const riverMesh = this.buildForestRiverMesh(ownedGeometries, ownedMaterials);
      root.add(riverMesh);
      this.buildForestRiverBridges(
        config,
        getBaseTerrainY,
        root,
        ownedGeometries,
        ownedMaterials,
        cameraCollisionMeshes,
        volumeColliders,
        walkableSurfaces,
      );
    } else if (!config.isWaitingArena && !config.isTrainingGround && config.biome === 'snow') {
      const lakeMesh = this.buildSnowLakeMesh(ownedGeometries, ownedMaterials);
      root.add(lakeMesh);
      cameraCollisionMeshes.push(lakeMesh);
    }

    this.buildMergedRoadNetwork(
      config,
      getBaseTerrainY,
      root,
      ownedGeometries,
      ownedMaterials,
      ownedTextures,
      roadFields,
      quality === 'low' || isCompact,
    );
    if (!config.isWaitingArena && !config.isTrainingGround) {
      this.buildHighwaySolarPylons(
        config,
        getBaseTerrainY,
        root,
        ownedGeometries,
        ownedMaterials,
        detailScatterMeshes,
        ownedInstancedMeshes,
      );
    }

    const seats: SittableSeat[] = [];
    let beaconRingOuter: THREE.Mesh;
    let beaconRingInner: THREE.Mesh;
    let beaconCore: THREE.Mesh;
    let shopAccentMat: THREE.MeshStandardMaterial;

    if (config.isWaitingArena || config.isTrainingGround) {
      const dummyGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      const dummyMat = new THREE.MeshStandardMaterial({ color: '#f97316', visible: false });
      shopAccentMat = new THREE.MeshStandardMaterial({ color: '#f97316', visible: false });
      ownedGeometries.push(dummyGeo);
      ownedMaterials.push(dummyMat, shopAccentMat);
      beaconRingOuter = new THREE.Mesh(dummyGeo, dummyMat);
      beaconRingInner = new THREE.Mesh(dummyGeo, dummyMat);
      beaconCore = new THREE.Mesh(dummyGeo, dummyMat);
      beaconRingOuter.visible = false;
      beaconRingInner.visible = false;
      beaconCore.visible = false;

      onStage?.(i18n.t('loading.stage.buildings'));
      await nextFrameYield();
    } else {
      const metalRoughTex = this.assetManager.createBrushedMetalTexture();
      const padMat = new THREE.MeshStandardMaterial({
        color: '#1f2937',
        roughness: 0.55,
        metalness: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const trimMat = new THREE.MeshStandardMaterial({
        color: '#64748b',
        roughness: 0.25,
        roughnessMap: metalRoughTex,
        metalness: 0.88,
      });
      const cyanGlowMat = new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0ea5e9',
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.1,
      });
      const orangeGlowMat = new THREE.MeshStandardMaterial({
        color: '#f97316',
        emissive: '#ea580c',
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.1,
      });
      shopAccentMat = new THREE.MeshStandardMaterial({
        color: '#f97316',
        emissive: '#f97316',
        emissiveIntensity: 1.1,
        roughness: 0.25,
        metalness: 0.4,
      });
      ownedMaterials.push(padMat, trimMat, cyanGlowMat, orangeGlowMat, shopAccentMat);

      const padBaseGeo = new THREE.CylinderGeometry(5.2, 5.8, 0.24, 8);
      const padRingGeo = new THREE.TorusGeometry(5.25, 0.1, 8, 28);
      padRingGeo.rotateX(Math.PI / 2);
      ownedGeometries.push(padBaseGeo, padRingGeo);

      const padBase = new THREE.Mesh(padBaseGeo, padMat);
      padBase.position.y = 0.12;
      padBase.receiveShadow = true;
      padBase.castShadow = true;
      root.add(padBase);
      cameraCollisionMeshes.push(padBase);

      const padRing = new THREE.Mesh(padRingGeo, trimMat);
      padRing.position.y = 0.24;
      root.add(padRing);

      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(0, 0, -4.4);
      const plinthGeo = new THREE.CylinderGeometry(1.3, 1.65, 0.55, 6);
      const pylonGeo = new THREE.BoxGeometry(0.26, 3.6, 0.42);
      const outerRingGeo = new THREE.TorusGeometry(1.4, 0.055, 8, 28);
      const innerRingGeo = new THREE.TorusGeometry(0.95, 0.04, 8, 24);
      const coreGeo = new THREE.OctahedronGeometry(0.45, 0);
      ownedGeometries.push(plinthGeo, pylonGeo, outerRingGeo, innerRingGeo, coreGeo);

      const plinth = new THREE.Mesh(plinthGeo, trimMat);
      plinth.position.y = 0.275;
      plinth.castShadow = true;
      beaconGroup.add(plinth);
      cameraCollisionMeshes.push(plinth);
      circleColliders.push({ x: 0, z: -4.4, radius: 1.65, topY: 0.55 });

      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        const pylon = new THREE.Mesh(pylonGeo, padMat);
        pylon.position.set(Math.sin(a) * 1.25, 1.9, Math.cos(a) * 1.25);
        pylon.rotation.y = a;
        pylon.rotation.x = 0.14;
        beaconGroup.add(pylon);
      }

      beaconRingOuter = new THREE.Mesh(outerRingGeo, cyanGlowMat);
      beaconRingOuter.position.y = 3.15;
      beaconRingInner = new THREE.Mesh(innerRingGeo, orangeGlowMat);
      beaconRingInner.position.y = 3.15;
      beaconCore = new THREE.Mesh(coreGeo, cyanGlowMat);
      beaconCore.position.y = 3.15;
      beaconGroup.add(beaconRingOuter, beaconRingInner, beaconCore);
      root.add(beaconGroup);

      const crateGroup = new THREE.Group();
      const crateY = getBaseTerrainY(3.8, 2.2) + 0.24;
      crateGroup.position.set(3.8, crateY, 2.2);
      crateGroup.rotation.y = -0.42;

      const crateBodyGeo = new THREE.BoxGeometry(1.45, 0.9, 1.0);
      const crateLidGeo = new THREE.BoxGeometry(1.52, 0.2, 1.08);
      const crateStripGeo = new THREE.BoxGeometry(1.18, 0.08, 1.04);
      ownedGeometries.push(crateBodyGeo, crateLidGeo, crateStripGeo);

      const crateBody = new THREE.Mesh(crateBodyGeo, padMat);
      crateBody.position.y = 0.45;
      crateBody.castShadow = true;
      crateBody.receiveShadow = true;
      const crateLid = new THREE.Mesh(crateLidGeo, trimMat);
      crateLid.position.y = 1.0;
      const crateStrip = new THREE.Mesh(crateStripGeo, shopAccentMat);
      crateStrip.position.y = 0.7;
      crateGroup.add(crateBody, crateLid, crateStrip);
      root.add(crateGroup);
      cameraCollisionMeshes.push(crateBody);
      circleColliders.push({ x: 3.8, z: 2.2, radius: 0.9, topY: crateY + 1.1 });

      onStage?.(i18n.t('loading.stage.buildings'));
      await nextFrameYield();

      this.buildPlazaBenches(
        config,
        getBaseTerrainY,
        root,
        ownedGeometries,
        ownedMaterials,
        cameraCollisionMeshes,
        volumeColliders,
        seats,
      );
    }

    const buildingResult = await this.buildingSystem.buildBuildingsProgressive(
      config.biome,
      config.buildings,
      getBaseTerrainY,
      disableScatterShadows,
      { compactTextures: isCompact, skipRoughnessMaps },
    );
    root.add(buildingResult.root);
    for (const m of buildingResult.structuralMeshes) {
      cameraCollisionMeshes.push(m);
    }
    for (const dm of buildingResult.doorLeafMeshes) {
      cameraCollisionMeshes.push(dm);
    }
    volumeColliders.push(...buildingResult.volumeColliders);
    walkableSurfaces.push(...buildingResult.walkableSurfaces);
    seats.push(...buildingResult.seats);

    onStage?.(i18n.t('loading.stage.landmarks'));
    await nextFrameYield();

    this.buildMergedObstacles(
      config.obstacles,
      getBaseTerrainY,
      root,
      ownedGeometries,
      ownedMaterials,
      cameraCollisionMeshes,
      obstacleShadowMeshes,
      buildingResult.sectorEntries,
      volumeColliders,
      walkableSurfaces,
      rockColliders,
      disableScatterShadows,
    );

    await nextFrameYield();

    this.buildInstancedScatter(
      config,
      getBaseTerrainY,
      root,
      ownedGeometries,
      ownedMaterials,
      circleColliders,
      rockColliders,
      scatterShadowMeshes,
      detailScatterMeshes,
      buildingResult.sectorEntries,
      isCompact || quality === 'low',
      disableScatterShadows,
      ownedInstancedMeshes,
    );

    const waitingArenaBuild = config.isWaitingArena
      ? buildFuturisticWaitingArenaStructures(getBaseTerrainY)
      : null;
    if (waitingArenaBuild) {
      root.add(waitingArenaBuild.root);
      cameraCollisionMeshes.push(...waitingArenaBuild.cameraCollisionMeshes);
      volumeColliders.push(...waitingArenaBuild.volumeColliders);
      walkableSurfaces.push(...waitingArenaBuild.walkableSurfaces);
      if (waitingArenaBuild.circleColliders) {
        circleColliders.push(...waitingArenaBuild.circleColliders);
      }
    }

    const trainingGroundBuild = config.isTrainingGround
      ? buildTrainingGroundStructures(getBaseTerrainY, {
          quality,
          isCompact,
          disableScatterShadows,
        })
      : null;
    if (trainingGroundBuild) {
      root.add(trainingGroundBuild.root);
      cameraCollisionMeshes.push(...trainingGroundBuild.cameraCollisionMeshes);
      volumeColliders.push(...trainingGroundBuild.volumeColliders);
      walkableSurfaces.push(...trainingGroundBuild.walkableSurfaces);
      circleColliders.push(...trainingGroundBuild.circleColliders);
      rockColliders.push(...trainingGroundBuild.rockColliders);
      buildingResult.sectorEntries.push(...trainingGroundBuild.sectorEntries);
    }

    const ziplineSpecs =
      config.isWaitingArena || config.isTrainingGround ? [] : (MAP_ZIPLINES[config.id] ?? []);
    const ziplineBuild = buildMapZiplines(ziplineSpecs, getBaseTerrainY, volumeColliders);
    if (ziplineBuild.ziplines.length > 0) {
      root.add(ziplineBuild.root);
      volumeColliders.push(...ziplineBuild.colliders);
    }

    return {
      config,
      root,
      cameraCollisionMeshes,
      sectorEntries: buildingResult.sectorEntries,
      buildingOccluders: buildingResult.buildingOccluders,
      scatterShadowMeshes,
      detailScatterMeshes,
      obstacleShadowMeshes,
      volumeColliders,
      walkableSurfaces,
      roadFields,
      circleColliders,
      rockColliders,
      doors: buildingResult.doors,
      windows: buildingResult.windows,
      seats,
      ziplines: ziplineBuild.ziplines,
      interiorLootPoints: buildingResult.lootPoints,
      beaconRingOuter,
      beaconRingInner,
      beaconCore,
      shopAccentMat,
      getBaseTerrainY,
      getTerrainHeightAt,
      updateDynamicElements: (delta: number, elapsed: number) => {
        waitingArenaBuild?.update(delta, elapsed);
        ziplineBuild.updateAnimations(delta, elapsed);
      },
      dispose: () => {
        waitingArenaBuild?.dispose();
        trainingGroundBuild?.dispose();
        ziplineBuild.dispose();
        buildingResult.dispose();
        for (const im of ownedInstancedMeshes) im.dispose();
        ownedInstancedMeshes.length = 0;
        for (const g of ownedGeometries) g.dispose();
        ownedGeometries.length = 0;
        for (const m of ownedMaterials) m.dispose();
        ownedMaterials.length = 0;
        for (const t of ownedTextures) t.dispose();
        ownedTextures.length = 0;
        cameraCollisionMeshes.length = 0;
        scatterShadowMeshes.length = 0;
        detailScatterMeshes.length = 0;
        obstacleShadowMeshes.length = 0;
      },
    };
  }

  private buildTerrainChunks(
    config: MapConfig,
    buildingPads: ReturnType<typeof buildBuildingPads>,
    quality: QualityPreset,
    isCompact: boolean,
    terrainMat: THREE.MeshStandardMaterial,
    root: THREE.Group,
    ownedGeometries: THREE.BufferGeometry[],
    cameraCollisionMeshes: THREE.Object3D[],
    walkableSurfaces: WalkableSurface[],
    roadFields: RoadHeightField[],
  ): {
    getBaseTerrainY: (x: number, z: number) => number;
    getTerrainHeightAt: (x: number, z: number, currentY?: number) => number;
  } {
    const terrainSpan = config.radiusMeters * 2 + 320;
    const halfTerrainSpan = terrainSpan * 0.5;
    const rawSegments =
      quality === 'low'
        ? isCompact
          ? 88
          : 104
        : quality === 'medium'
          ? isCompact
            ? 112
            : 136
          : isCompact
            ? 136
            : 168;
    const chunkGrid = 4;
    const segPerChunk = Math.max(8, Math.round(rawSegments / chunkGrid));
    const segments = segPerChunk * chunkGrid;

    const fullGeo = new THREE.PlaneGeometry(terrainSpan, terrainSpan, segments, segments);
    fullGeo.rotateX(-Math.PI / 2);
    const fullPos = fullGeo.attributes.position as THREE.BufferAttribute;
    const terrainHeights = new Float32Array(fullPos.count);
    for (let i = 0; i < fullPos.count; i++) {
      const x = fullPos.getX(i);
      const z = fullPos.getZ(i);
      const y = sampleGradedTerrainY(config, buildingPads, x, z);
      fullPos.setY(i, y);
      terrainHeights[i] = y;
    }
    fullGeo.computeVertexNormals();
    const fullNorm = fullGeo.attributes.normal as THREE.BufferAttribute;
    const fullUv = fullGeo.attributes.uv as THREE.BufferAttribute;
    const fullStride = segments + 1;
    const chunkStride = segPerChunk + 1;

    // Build shared relative triangle indices for a single chunk once
    const chunkIndices = new Uint16Array(segPerChunk * segPerChunk * 6);
    let idxPtr = 0;
    for (let rz = 0; rz < segPerChunk; rz++) {
      for (let cx = 0; cx < segPerChunk; cx++) {
        const a = rz * chunkStride + cx;
        const b = (rz + 1) * chunkStride + cx;
        const c = (rz + 1) * chunkStride + (cx + 1);
        const d = rz * chunkStride + (cx + 1);
        chunkIndices[idxPtr++] = a;
        chunkIndices[idxPtr++] = b;
        chunkIndices[idxPtr++] = d;
        chunkIndices[idxPtr++] = b;
        chunkIndices[idxPtr++] = c;
        chunkIndices[idxPtr++] = d;
      }
    }
    const sharedIndexAttr = new THREE.BufferAttribute(chunkIndices, 1);

    for (let cz = 0; cz < chunkGrid; cz++) {
      const zOffset = cz * segPerChunk;
      for (let cx = 0; cx < chunkGrid; cx++) {
        const xOffset = cx * segPerChunk;
        const vertCount = chunkStride * chunkStride;
        const positions = new Float32Array(vertCount * 3);
        const normals = new Float32Array(vertCount * 3);
        const uvs = new Float32Array(vertCount * 2);

        let vPtr = 0;
        let uvPtr = 0;
        for (let rz = 0; rz <= segPerChunk; rz++) {
          const globalRow = (zOffset + rz) * fullStride + xOffset;
          for (let rx = 0; rx <= segPerChunk; rx++) {
            const srcIdx = globalRow + rx;
            positions[vPtr] = fullPos.getX(srcIdx);
            positions[vPtr + 1] = fullPos.getY(srcIdx);
            positions[vPtr + 2] = fullPos.getZ(srcIdx);
            normals[vPtr] = fullNorm.getX(srcIdx);
            normals[vPtr + 1] = fullNorm.getY(srcIdx);
            normals[vPtr + 2] = fullNorm.getZ(srcIdx);
            uvs[uvPtr] = fullUv.getX(srcIdx);
            uvs[uvPtr + 1] = fullUv.getY(srcIdx);
            vPtr += 3;
            uvPtr += 2;
          }
        }

        const chunkGeo = new THREE.BufferGeometry();
        chunkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        chunkGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        chunkGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        chunkGeo.setIndex(sharedIndexAttr);
        chunkGeo.computeBoundingBox();
        chunkGeo.computeBoundingSphere();

        ownedGeometries.push(chunkGeo);
        const chunkMesh = new THREE.Mesh(chunkGeo, terrainMat);
        chunkMesh.name = `terrain-chunk-${cz}-${cx}`;
        chunkMesh.receiveShadow = true;
        chunkMesh.castShadow = false;
        root.add(chunkMesh);
        cameraCollisionMeshes.push(chunkMesh);
      }
    }

    fullGeo.dispose();

    const getBaseTerrainY = (x: number, z: number): number => {
      if (Math.abs(x) >= halfTerrainSpan || Math.abs(z) >= halfTerrainSpan) {
        return sampleGradedTerrainY(config, buildingPads, x, z);
      }
      const gx = ((x + halfTerrainSpan) / terrainSpan) * segments;
      const gz = ((z + halfTerrainSpan) / terrainSpan) * segments;
      const ix = Math.min(segments - 1, Math.max(0, Math.floor(gx)));
      const iz = Math.min(segments - 1, Math.max(0, Math.floor(gz)));
      const u = gx - ix;
      const v = gz - iz;
      const ya = terrainHeights[iz * fullStride + ix];
      const yb = terrainHeights[(iz + 1) * fullStride + ix];
      const yc = terrainHeights[(iz + 1) * fullStride + (ix + 1)];
      const yd = terrainHeights[iz * fullStride + (ix + 1)];
      if (u + v <= 1) {
        return ya + u * (yd - ya) + v * (yb - ya);
      }
      return yc + (1 - u) * (yb - yc) + (1 - v) * (yd - yc);
    };

    const getTerrainHeightAt = (x: number, z: number, currentY?: number): number => {
      let h = getBaseTerrainY(x, z);
      if (!config.isWaitingArena && !config.isTrainingGround && config.biome === 'snow') {
        const lnx = (x - SNOW_LAKE_CENTER_X) / SNOW_LAKE_RX;
        const lnz = (z - SNOW_LAKE_CENTER_Z) / SNOW_LAKE_RZ;
        if (lnx * lnx + lnz * lnz <= 1.0) {
          h = Math.max(h, SNOW_LAKE_ICE_Y + 0.015);
        }
      }
      for (let i = 0; i < roadFields.length; i++) {
        const ry = evaluateRoadFieldY(roadFields[i], x, z);
        if (ry !== null && ry > h) {
          h = ry;
        }
      }
      const padRadius = config.isWaitingArena || config.isTrainingGround ? 0 : 5.25;
      if (padRadius > 0 && x * x + z * z <= padRadius * padRadius && (currentY === undefined || currentY + 0.74 >= 0.24)) {
        h = Math.max(h, 0.24);
      }
      const acceptMaxY = currentY !== undefined ? currentY + 0.74 : Number.POSITIVE_INFINITY;
      for (let i = 0; i < walkableSurfaces.length; i++) {
        const s = walkableSurfaces[i];
        const dx = x - s.cx;
        const dz = z - s.cz;
        const localX = dx * s.cosY - dz * s.sinY;
        const localZ = dx * s.sinY + dz * s.cosY;
        if (Math.abs(localX) <= s.halfW + 0.12 && Math.abs(localZ) <= s.halfD + 0.12) {
          const sy = evaluateWalkableSurfaceY(s, localZ);
          if (sy <= acceptMaxY && sy > h) {
            h = sy;
          }
        }
      }
      return h;
    };

    return { getBaseTerrainY, getTerrainHeightAt };
  }

  private buildPlazaBenches(
    config: MapConfig,
    getBaseTerrainY: (x: number, z: number) => number,
    root: THREE.Group,
    geos: THREE.BufferGeometry[],
    mats: THREE.Material[],
    cameraCollisionMeshes: THREE.Object3D[],
    volumeColliders: OrientedVolumeCollider[],
    seats: SittableSeat[],
  ): void {
    const placements: ReadonlyArray<{ x: number; z: number; yaw: number; label: string }> = [
      { x: -6.8, z: 2.6, yaw: Math.PI * 0.34, label: 'PLAZA BENCH' },
      { x: 6.8, z: -2.4, yaw: -Math.PI * 0.65, label: 'PLAZA BENCH' },
      { x: -3.2, z: -6.9, yaw: 0.24, label: 'PLAZA BENCH' },
    ];

    const plankGeo = new THREE.BoxGeometry(1.9, 0.08, 0.58);
    const backGeo = new THREE.BoxGeometry(1.9, 0.44, 0.09);
    const legGeo = new THREE.BoxGeometry(0.1, 0.42, 0.5);
    const woodMat = new THREE.MeshStandardMaterial({
      color: config.biome === 'snow' ? '#7c5338' : '#9a6232',
      roughness: 0.74,
      metalness: 0.08,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.35,
      metalness: 0.78,
    });
    geos.push(plankGeo, backGeo, legGeo);
    mats.push(woodMat, frameMat);

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const groundY = getBaseTerrainY(p.x, p.z);
      const group = new THREE.Group();
      group.position.set(p.x, groundY, p.z);
      group.rotation.y = p.yaw;

      const seatMesh = new THREE.Mesh(plankGeo, woodMat);
      seatMesh.position.set(0, 0.42, 0);
      seatMesh.castShadow = true;
      seatMesh.receiveShadow = true;

      const backMesh = new THREE.Mesh(backGeo, woodMat);
      backMesh.position.set(0, 0.68, -0.24);
      backMesh.castShadow = true;

      const leftLeg = new THREE.Mesh(legGeo, frameMat);
      leftLeg.position.set(-0.78, 0.21, 0);
      const rightLeg = new THREE.Mesh(legGeo, frameMat);
      rightLeg.position.set(0.78, 0.21, 0);

      group.add(seatMesh, backMesh, leftLeg, rightLeg);
      root.add(group);
      cameraCollisionMeshes.push(seatMesh, backMesh);

      const cosY = Math.cos(p.yaw);
      const sinY = Math.sin(p.yaw);
      volumeColliders.push({
        cx: p.x,
        cz: p.z,
        halfW: 0.95,
        halfD: 0.3,
        cosY,
        sinY,
        minY: groundY,
        maxY: groundY + 0.92,
        steppable: true,
      });

      for (const sx of [-0.44, 0.44]) {
        const seatX = p.x + sx * cosY + 0.08 * sinY;
        const seatZ = p.z - sx * sinY + 0.08 * cosY;
        const standX = p.x + sx * cosY + 0.74 * sinY;
        const standZ = p.z - sx * sinY + 0.74 * cosY;
        seats.push({
          id: `plaza-bench-${i}-${sx > 0 ? 'r' : 'l'}`,
          label: p.label,
          seatX,
          seatY: groundY + 0.46,
          seatZ,
          facingYaw: p.yaw,
          standX,
          standZ,
        });
      }
    }
  }

  private buildForestRiverMesh(
    geos: THREE.BufferGeometry[],
    mats: THREE.Material[],
  ): THREE.Mesh {
    const steps = 160;
    const minX = -500;
    const maxX = 500;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // 4 vertices across width so outer water edges tuck cleanly into the graded sloping riverbanks
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = minX + (maxX - minX) * t;
      const cz = getForestRiverCenterZ(x);
      const hw = getForestRiverHalfWidth(x);
      const innerHw = hw * 0.82;
      const outerHw = hw + 2.2;

      positions.push(x, FOREST_RIVER_WATER_Y - 0.05, cz - outerHw);
      positions.push(x, FOREST_RIVER_WATER_Y, cz - innerHw);
      positions.push(x, FOREST_RIVER_WATER_Y, cz + innerHw);
      positions.push(x, FOREST_RIVER_WATER_Y - 0.05, cz + outerHw);
      uvs.push(t * 22, 0, t * 22, 0.2, t * 22, 0.8, t * 22, 1);

      if (i < steps) {
        const base = i * 4;
        for (let strip = 0; strip < 3; strip++) {
          const a = base + strip;
          const b = base + strip + 1;
          const c = base + 4 + strip;
          const d = base + 4 + strip + 1;
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }
    }

    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    riverGeo.setIndex(indices);
    riverGeo.computeVertexNormals();

    const riverMat = new THREE.MeshStandardMaterial({
      color: '#0e7490',
      emissive: '#083344',
      emissiveIntensity: 0.22,
      roughness: 0.16,
      metalness: 0.32,
      transparent: true,
      opacity: 0.82,
    });

    geos.push(riverGeo);
    mats.push(riverMat);

    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    riverMesh.receiveShadow = true;
    return riverMesh;
  }

  private buildForestRiverBridges(
    config: MapConfig,
    getBaseTerrainY: (x: number, z: number) => number,
    root: THREE.Group,
    geos: THREE.BufferGeometry[],
    mats: THREE.Material[],
    cameraCollisionMeshes: THREE.Object3D[],
    volumeColliders: OrientedVolumeCollider[],
    walkableSurfaces: WalkableSurface[],
  ): void {
    const deckMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.72,
      metalness: 0.25,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.4,
      metalness: 0.72,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.2,
    });
    mats.push(deckMat, railMat, accentMat);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    geos.push(boxGeo);

    for (const r of config.roads) {
      if (r.width < 4) continue;
      // Only consider primarily North-South or diagonal roads spanning river band
      const minZ = Math.min(r.startZ, r.endZ);
      const maxZ = Math.max(r.startZ, r.endZ);
      if (maxZ < 90 || minZ > 180) continue;

      const midX = (r.startX + r.endX) * 0.5;
      const riverZ = getForestRiverCenterZ(midX);
      const riverHalfW = getForestRiverHalfWidth(midX);
      if (riverZ < minZ + 12 || riverZ > maxZ - 12) continue;

      // Interpolate X at riverZ
      const dzTotal = r.endZ - r.startZ;
      if (Math.abs(dzTotal) < 8) continue;
      const t = clamp((riverZ - r.startZ) / dzTotal, 0.05, 0.95);
      const bx = r.startX + (r.endX - r.startX) * t;
      const bz = getForestRiverCenterZ(bx);
      const angle = Math.atan2(r.endX - r.startX, dzTotal);
      const cosY = Math.cos(angle);
      const sinY = Math.sin(angle);
      const spanLen = riverHalfW * 2 + 12;
      const deckW = r.width + 0.8;
      const end1X = bx - sinY * spanLen * 0.5;
      const end1Z = bz - cosY * spanLen * 0.5;
      const end2X = bx + sinY * spanLen * 0.5;
      const end2Z = bz + cosY * spanLen * 0.5;
      const end1Y = getBaseTerrainY(end1X, end1Z);
      const end2Y = getBaseTerrainY(end2X, end2Z);
      const deckY = Math.max(
        FOREST_RIVER_WATER_Y + 1.05,
        getBaseTerrainY(bx, bz) + 0.14,
        end1Y + 0.06,
        end2Y + 0.06,
      );

      const bridge = new THREE.Group();
      bridge.position.set(bx, 0, bz);
      bridge.rotation.y = angle;

      const deck = new THREE.Mesh(boxGeo, deckMat);
      deck.position.set(0, deckY - 0.14, 0);
      deck.scale.set(deckW, 0.28, spanLen);
      deck.receiveShadow = true;
      deck.castShadow = true;
      bridge.add(deck);
      cameraCollisionMeshes.push(deck);

      walkableSurfaces.push({
        kind: 'slab',
        cx: bx,
        cz: bz,
        halfW: deckW * 0.5,
        halfD: spanLen * 0.5,
        cosY,
        sinY,
        startY: deckY,
        endY: deckY,
        undersideY: deckY - 0.28,
      });

      // Add stepped approach ramps whenever bank elevation differs from bridge deck
      const addApproachRamp = (endSign: -1 | 1, bankY: number): void => {
        const rise = deckY - bankY;
        if (rise <= 0.1) return;
        const rampLen = clamp(rise * 3.2, 2.2, 4.5);
        const rampSteps = 8;
        const stepRun = rampLen / rampSteps;
        const stepH = rise / rampSteps;
        const meshH = stepH + 0.14;
        for (let s = 0; s < rampSteps; s++) {
          const stepTop = bankY + ((s + 1) / rampSteps) * rise;
          // s=0 is outer ground end, s=rampSteps-1 meets bridge deck
          const distFromEdge = (rampSteps - 1 - s + 0.5) * stepRun;
          const localZ = endSign * (spanLen * 0.5 + distFromEdge);
          const stepMesh = new THREE.Mesh(boxGeo, deckMat);
          stepMesh.position.set(0, stepTop - meshH * 0.5, localZ);
          stepMesh.scale.set(deckW, meshH, stepRun + 0.06);
          stepMesh.receiveShadow = true;
          bridge.add(stepMesh);
        }
        const rampCenterLocalZ = endSign * (spanLen * 0.5 + rampLen * 0.5);
        const rampCx = bx + rampCenterLocalZ * sinY;
        const rampCz = bz + rampCenterLocalZ * cosY;
        const rampYaw = endSign === -1 ? angle : angle + Math.PI;
        walkableSurfaces.push({
          kind: 'stair',
          cx: rampCx,
          cz: rampCz,
          halfW: deckW * 0.5,
          halfD: rampLen * 0.5,
          cosY: Math.cos(rampYaw),
          sinY: Math.sin(rampYaw),
          startY: bankY,
          endY: deckY,
          undersideY: bankY - 0.25,
          stairSteps: rampSteps,
        });
      };
      addApproachRamp(-1, end1Y);
      addApproachRamp(1, end2Y);

      for (const side of [-1, 1]) {
        const railX = side * (deckW * 0.5 - 0.12);
        const rail = new THREE.Mesh(boxGeo, railMat);
        rail.position.set(railX, deckY + 0.52, 0);
        rail.scale.set(0.18, 1.04, spanLen);
        bridge.add(rail);

        const strip = new THREE.Mesh(boxGeo, accentMat);
        strip.position.set(railX, deckY + 1.0, 0);
        strip.scale.set(0.12, 0.08, spanLen * 0.86);
        bridge.add(strip);

        volumeColliders.push({
          cx: bx + railX * cosY,
          cz: bz - railX * sinY,
          halfW: 0.14,
          halfD: spanLen * 0.5,
          cosY,
          sinY,
          minY: deckY,
          maxY: deckY + 1.05,
          steppable: false,
        });
      }

      root.add(bridge);
    }
  }

  private buildHighwaySolarPylons(
    config: MapConfig,
    getBaseTerrainY: (x: number, z: number) => number,
    root: THREE.Group,
    geos: THREE.BufferGeometry[],
    mats: THREE.Material[],
    detailScatterMeshes: THREE.Object3D[],
    ownedInstancedMeshes: THREE.InstancedMesh[],
  ): void {
    const placements: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    for (const r of config.roads) {
      if (r.width < 8) continue;
      const dx = r.endX - r.startX;
      const dz = r.endZ - r.startZ;
      const len = Math.hypot(dx, dz);
      if (len < 60) continue;
      const angle = Math.atan2(dx, dz);
      const dirX = dx / len;
      const dirZ = dz / len;
      const rightX = dirZ;
      const rightZ = -dirX;
      const sideOffset = r.width * 0.5 + 1.25;
      for (let d = 35; d < len - 35; d += 58) {
        const side = ((Math.round(d) + placements.length) % 2 === 0 ? 1 : -1) * sideOffset;
        const px = r.startX + dirX * d + rightX * side;
        const pz = r.startZ + dirZ * d + rightZ * side;
        const py = getBaseTerrainY(px, pz);
        placements.push({ x: px, y: py, z: pz, yaw: angle });
      }
    }
    if (placements.length === 0) return;

    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 4.4, 6);
    const headGeo = new THREE.BoxGeometry(0.62, 0.14, 0.34);
    const poleMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.45,
      metalness: 0.78,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: config.biome === 'desert' ? '#fde68a' : '#7dd3fc',
      emissive: config.biome === 'desert' ? '#f59e0b' : '#0ea5e9',
      emissiveIntensity: 1.25,
      roughness: 0.2,
      metalness: 0.1,
    });
    geos.push(poleGeo, headGeo);
    mats.push(poleMat, glowMat);

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, placements.length);
    const heads = new THREE.InstancedMesh(headGeo, glowMat, placements.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      dummy.position.set(p.x, p.y + 2.2, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, p.y + 4.45, p.z);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    poles.computeBoundingSphere();
    heads.computeBoundingSphere();
    ownedInstancedMeshes.push(poles, heads);
    root.add(poles, heads);
    detailScatterMeshes.push(poles, heads);
  }

  private buildSnowLakeMesh(
    geos: THREE.BufferGeometry[],
    mats: THREE.Material[],
  ): THREE.Mesh {
    const lakeGeo = new THREE.CircleGeometry(1, 48);
    lakeGeo.rotateX(-Math.PI / 2);
    const lakeMat = new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.12,
      roughness: 0.16,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    geos.push(lakeGeo);
    mats.push(lakeMat);

    const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
    lakeMesh.position.set(SNOW_LAKE_CENTER_X, SNOW_LAKE_ICE_Y + 0.015, SNOW_LAKE_CENTER_Z);
    lakeMesh.scale.set(SNOW_LAKE_RX, 1, SNOW_LAKE_RZ);
    lakeMesh.receiveShadow = true;
    return lakeMesh;
  }

  private buildMergedRoadNetwork(
    config: MapConfig,
    getBaseTerrainY: (x: number, z: number) => number,
    root: THREE.Group,
    ownedGeometries: THREE.BufferGeometry[],
    ownedMaterials: THREE.Material[],
    _ownedTextures: THREE.Texture[],
    roadFields: RoadHeightField[],
    compactRoads: boolean,
  ): void {
    const roadTex = this.createRoadTexture(config.biome);
    const roadMat = new THREE.MeshStandardMaterial({
      color: config.theme.roadColorHex,
      map: roadTex,
      roughness: config.biome === 'desert' ? 0.92 : 0.82,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: config.theme.roadBorderHex,
      roughness: 0.62,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    ownedMaterials.push(roadMat, stripeMat);

    const roadGeos: THREE.BufferGeometry[] = [];
    const stripeGeos: THREE.BufferGeometry[] = [];

    for (let idx = 0; idx < config.roads.length; idx++) {
      const r = config.roads[idx];
      const dx = r.endX - r.startX;
      const dz = r.endZ - r.startZ;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;

      const angle = Math.atan2(dx, dz);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const widthSegs = 2;
      const roadSegs = Math.max(16, Math.ceil(len / (compactRoads ? 4.0 : 2.5)));
      const yOffset = 0.016 + (idx % 6) * 0.002;

      const roadGeo = new THREE.PlaneGeometry(r.width, len, widthSegs, roadSegs);
      roadGeo.rotateX(-Math.PI / 2);
      roadGeo.rotateY(angle);

      const midX = (r.startX + r.endX) * 0.5;
      const midZ = (r.startZ + r.endZ) * 0.5;
      const rAttr = roadGeo.attributes.position;
      const uvAttr = roadGeo.attributes.uv;
      const heights = new Float32Array(rAttr.count);
      const tileAlong = Math.max(2, len / 10);
      for (let i = 0; i < rAttr.count; i++) {
        const wx = rAttr.getX(i) + midX;
        const wz = rAttr.getZ(i) + midZ;
        const ry = getBaseTerrainY(wx, wz) + yOffset;
        rAttr.setXYZ(i, wx, ry, wz);
        heights[i] = ry;
        uvAttr.setY(i, uvAttr.getY(i) * tileAlong);
      }
      roadGeo.computeVertexNormals();
      roadGeos.push(roadGeo);

      const halfW = r.width * 0.5;
      const halfLen = len * 0.5;
      const extX = Math.abs(halfW * cosA) + Math.abs(halfLen * sinA) + 0.1;
      const extZ = Math.abs(halfW * sinA) + Math.abs(halfLen * cosA) + 0.1;
      roadFields.push({
        midX,
        midZ,
        halfW,
        halfLen,
        cosY: cosA,
        sinY: sinA,
        minX: midX - extX,
        maxX: midX + extX,
        minZ: midZ - extZ,
        maxZ: midZ + extZ,
        widthSegs,
        lengthSegs: roadSegs,
        heights,
      });

      // Dashed highway centerlines on primary & ring roads
      if (r.width >= 7) {
        const dirX = dx / len;
        const dirZ = dz / len;
        const dashLen = 4.2;
        const dashStep = 10.5;
        for (let d = 6; d < len - 6; d += dashStep) {
          const sx = r.startX + dirX * d;
          const sz = r.startZ + dirZ * d;
          const dashGeo = new THREE.PlaneGeometry(0.24, dashLen, 1, 1);
          dashGeo.rotateX(-Math.PI / 2);
          dashGeo.rotateY(angle);
          const sAttr = dashGeo.attributes.position;
          for (let k = 0; k < sAttr.count; k++) {
            const wx = sAttr.getX(k) + sx;
            const wz = sAttr.getZ(k) + sz;
            sAttr.setXYZ(k, wx, getBaseTerrainY(wx, wz) + yOffset + 0.005, wz);
          }
          dashGeo.computeVertexNormals();
          stripeGeos.push(dashGeo);
        }
      }
    }

    if (roadGeos.length > 0) {
      const mergedRoadGeo = mergeGeometries(roadGeos, false);
      for (const g of roadGeos) g.dispose();
      if (mergedRoadGeo) {
        ownedGeometries.push(mergedRoadGeo);
        const roadMesh = new THREE.Mesh(mergedRoadGeo, roadMat);
        roadMesh.receiveShadow = true;
        root.add(roadMesh);
      }
    }

    if (stripeGeos.length > 0) {
      const mergedStripeGeo = mergeGeometries(stripeGeos, false);
      for (const g of stripeGeos) g.dispose();
      if (mergedStripeGeo) {
        ownedGeometries.push(mergedStripeGeo);
        const stripesMesh = new THREE.Mesh(mergedStripeGeo, stripeMat);
        stripesMesh.receiveShadow = true;
        root.add(stripesMesh);
      }
    }
  }

  private buildMergedObstacles(
    obstacles: readonly ObstacleSpec[],
    getBaseTerrainY: (x: number, z: number) => number,
    root: THREE.Group,
    geos: THREE.BufferGeometry[],
    mats: THREE.Material[],
    camMeshes: THREE.Object3D[],
    obstacleShadowMeshes: THREE.Mesh[],
    sectorEntries: BuildingSectorEntry[],
    volumeColliders: OrientedVolumeCollider[],
    walkableSurfaces: WalkableSurface[],
    rockColliders: RockCollider[],
    disableShadows: boolean,
  ): void {
    if (obstacles.length === 0) return;

    const sectorBuckets = new Map<
      string,
      { bodyGeos: THREE.BufferGeometry[]; capGeos: THREE.BufferGeometry[] }
    >();
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    const setVertColor = (geo: THREE.BufferGeometry, hex: string): void => {
      color.set(hex);
      const count = geo.attributes.position.count;
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = color.r;
        arr[i * 3 + 1] = color.g;
        arr[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    };

    const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    unitBox.deleteAttribute('uv');
    const unitRock = createSculptedRockGeometry();

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const baseY = getBaseTerrainY(obs.x, obs.z);

      euler.set(0, obs.rotationY, 0);
      quat.setFromEuler(euler);

      const sectorKey = `${Math.floor(obs.x / 110)},${Math.floor(obs.z / 110)}`;
      let bucket = sectorBuckets.get(sectorKey);
      if (!bucket) {
        bucket = { bodyGeos: [], capGeos: [] };
        sectorBuckets.set(sectorKey, bucket);
      }

      const cosY = Math.cos(obs.rotationY);
      const sinY = Math.sin(obs.rotationY);

      if (obs.kind === 'boulder') {
        const rx = obs.width * 0.5;
        const rz = obs.depth * 0.5;
        pos.set(obs.x, baseY, obs.z);
        scale.set(rx, obs.height, rz);
        mat4.compose(pos, quat, scale);
        const rGeo = unitRock.clone();
        rGeo.applyMatrix4(mat4);
        setVertColor(rGeo, obs.colorHex);
        bucket.bodyGeos.push(rGeo);

        rockColliders.push({
          x: obs.x,
          z: obs.z,
          baseY,
          rx,
          rz,
          height: obs.height,
          cosY,
          sinY,
        });
        continue;
      }

      pos.set(obs.x, baseY + obs.height * 0.5, obs.z);
      scale.set(obs.width, obs.height, obs.depth);
      mat4.compose(pos, quat, scale);
      const bGeo = unitBox.clone();
      bGeo.applyMatrix4(mat4);
      setVertColor(bGeo, obs.colorHex);
      bucket.bodyGeos.push(bGeo);

      pos.set(obs.x, baseY + obs.height + 0.06, obs.z);
      scale.set(obs.width + 0.12, 0.12, obs.depth + 0.12);
      mat4.compose(pos, quat, scale);
      const cGeo = unitBox.clone();
      cGeo.applyMatrix4(mat4);
      bucket.capGeos.push(cGeo);

      const topY = baseY + obs.height + 0.12;

      volumeColliders.push({
        cx: obs.x,
        cz: obs.z,
        halfW: obs.width * 0.5,
        halfD: obs.depth * 0.5,
        cosY,
        sinY,
        minY: baseY,
        maxY: topY,
        steppable: obs.height <= 0.65,
      });

      if (
        obs.height <= 1.2 ||
        obs.kind === 'container' ||
        obs.kind === 'crate' ||
        obs.kind === 'barrier'
      ) {
        walkableSurfaces.push({
          kind: 'slab',
          cx: obs.x,
          cz: obs.z,
          halfW: obs.width * 0.5,
          halfD: obs.depth * 0.5,
          cosY,
          sinY,
          startY: topY,
          endY: topY,
          undersideY: baseY,
        });
      }
    }

    unitBox.dispose();
    unitRock.dispose();

    const bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.24,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.35,
      metalness: 0.7,
    });
    mats.push(bodyMat, capMat);

    for (const [sectorKey, bucket] of sectorBuckets.entries()) {
      if (bucket.bodyGeos.length > 0) {
        const mergedBody = mergeGeometries(bucket.bodyGeos, false);
        for (const g of bucket.bodyGeos) g.dispose();
        if (mergedBody) {
          mergedBody.computeBoundingBox();
          mergedBody.computeBoundingSphere();
          geos.push(mergedBody);
          const bodyMesh = new THREE.Mesh(mergedBody, bodyMat);
          bodyMesh.name = `obstacles-body-${sectorKey}`;
          bodyMesh.castShadow = !disableShadows;
          bodyMesh.receiveShadow = true;
          root.add(bodyMesh);
          camMeshes.push(bodyMesh);
          obstacleShadowMeshes.push(bodyMesh);
          if (mergedBody.boundingSphere) {
            const bs = mergedBody.boundingSphere;
            sectorEntries.push({
              mesh: bodyMesh,
              isDecorative: false,
              centerX: bs.center.x,
              centerY: bs.center.y,
              centerZ: bs.center.z,
              radius: bs.radius,
            });
          }
        }
      }

      if (bucket.capGeos.length > 0) {
        const mergedCap = mergeGeometries(bucket.capGeos, false);
        for (const g of bucket.capGeos) g.dispose();
        if (mergedCap) {
          mergedCap.computeBoundingBox();
          mergedCap.computeBoundingSphere();
          geos.push(mergedCap);
          const capMesh = new THREE.Mesh(mergedCap, capMat);
          capMesh.name = `obstacles-cap-${sectorKey}`;
          capMesh.receiveShadow = true;
          root.add(capMesh);
          camMeshes.push(capMesh);
          if (mergedCap.boundingSphere) {
            const bs = mergedCap.boundingSphere;
            sectorEntries.push({
              mesh: capMesh,
              isDecorative: false,
              centerX: bs.center.x,
              centerY: bs.center.y,
              centerZ: bs.center.z,
              radius: bs.radius,
            });
          }
        }
      }
    }
  }

  private buildInstancedScatter(
    config: MapConfig,
    getTerrainY: (x: number, z: number) => number,
    root: THREE.Group,
    geos: THREE.BufferGeometry[],
    mats: THREE.Material[],
    circleColliders: CircleCollider[],
    rockColliders: RockCollider[],
    scatterShadowMeshes: THREE.Mesh[],
    detailScatterMeshes: THREE.Object3D[],
    sectorEntries: BuildingSectorEntry[],
    isMobile: boolean,
    disableScatterShadows: boolean,
    ownedInstancedMeshes: THREE.InstancedMesh[],
  ): void {
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    const gridDim = config.isWaitingArena ? 1 : 3;
    const gridExtent = config.radiusMeters + 18;
    const gridSpan = Math.max(1, gridExtent * 2);

    const getChunkIdx = (x: number, z: number): number => {
      if (gridDim === 1) return 0;
      const gx = Math.min(gridDim - 1, Math.max(0, Math.floor(((x + gridExtent) / gridSpan) * gridDim)));
      const gz = Math.min(gridDim - 1, Math.max(0, Math.floor(((z + gridExtent) / gridSpan) * gridDim)));
      return gz * gridDim + gx;
    };

    const emitInstancedChunks = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      bucketMatrices: number[][],
      bucketColors: number[][] | null,
      options: {
        castShadow: boolean;
        receiveShadow: boolean;
        isDetailOnly: boolean;
      },
    ): void => {
      for (let b = 0; b < bucketMatrices.length; b++) {
        const matsArr = bucketMatrices[b];
        const count = matsArr.length / 16;
        if (count === 0) continue;
        const im = new THREE.InstancedMesh(geo, mat, count);
        for (let i = 0; i < matsArr.length; i++) {
          im.instanceMatrix.array[i] = matsArr[i];
        }
        im.instanceMatrix.needsUpdate = true;
        if (bucketColors) {
          const colsArr = bucketColors[b];
          for (let i = 0; i < count; i++) {
            tint.setRGB(colsArr[i * 3], colsArr[i * 3 + 1], colsArr[i * 3 + 2]);
            im.setColorAt(i, tint);
          }
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
        im.castShadow = options.castShadow;
        im.receiveShadow = options.receiveShadow;
        im.computeBoundingSphere();
        if (options.castShadow) {
          scatterShadowMeshes.push(im);
        }
        if (options.isDetailOnly) {
          detailScatterMeshes.push(im);
        }
        ownedInstancedMeshes.push(im);
        root.add(im);
        if (im.boundingSphere) {
          const bs = im.boundingSphere;
          sectorEntries.push({
            mesh: im,
            isDecorative: true,
            isDetailOnly: options.isDetailOnly,
            centerX: bs.center.x,
            centerY: bs.center.y,
            centerZ: bs.center.z,
            radius: bs.radius,
          });
        }
      }
    };

    const isClearSpot = (x: number, z: number, minPad = 4.2): boolean => {
      if (Math.hypot(x, z) < 13.5) return false;
      if (
        !config.isWaitingArena &&
        !config.isTrainingGround &&
        config.biome === 'forest' &&
        getForestRiverMask(x, z) > 0.15
      ) {
        return false;
      }
      if (
        !config.isWaitingArena &&
        !config.isTrainingGround &&
        config.biome === 'snow' &&
        getSnowLakeMask(x, z) > 0.15
      ) {
        return false;
      }
      if (config.isTrainingGround) {
        // Keep Container Yard, Armory Plaza, Covered Shooting Range & Watchtower completely clear of trees/rocks
        if (Math.abs(x) < 33 && Math.abs(z) < 30) return false;
        if (Math.abs(x) < 15 && z > 20 && z < 46) return false;
        if (x > -106 && x < -50 && z > -165 && z < 26) return false;
        if (Math.hypot(x + 43, z - 22) < 9.5) return false;
      }

      for (const b of config.buildings) {
        const dx = x - b.x;
        const dz = z - b.z;
        const cosB = Math.cos(b.rotationY);
        const sinB = Math.sin(b.rotationY);
        const localX = dx * cosB - dz * sinB;
        const localZ = dx * sinB + dz * cosB;
        if (
          Math.abs(localX) < b.width * 0.5 + minPad + 1.8 &&
          Math.abs(localZ) < b.depth * 0.5 + minPad + 1.8
        ) {
          return false;
        }
      }
      for (const obs of config.obstacles) {
        const dx = x - obs.x;
        const dz = z - obs.z;
        const cosO = Math.cos(obs.rotationY);
        const sinO = Math.sin(obs.rotationY);
        const localX = dx * cosO - dz * sinO;
        const localZ = dx * sinO + dz * cosO;
        if (
          Math.abs(localX) < obs.width * 0.5 + minPad + 0.8 &&
          Math.abs(localZ) < obs.depth * 0.5 + minPad + 0.8
        ) {
          return false;
        }
      }
      for (const r of config.roads) {
        const vx = r.endX - r.startX;
        const vz = r.endZ - r.startZ;
        const wx = x - r.startX;
        const wz = z - r.startZ;
        const lenSq = vx * vx + vz * vz;
        const t = lenSq > 0 ? clamp((wx * vx + wz * vz) / lenSq, 0, 1) : 0;
        const px = r.startX + vx * t;
        const pz = r.startZ + vz * t;
        if (Math.hypot(x - px, z - pz) < r.width * 0.8 + 2.6) {
          return false;
        }
      }
      return true;
    };

    const seedPos = (index: number, minR: number, maxR: number, salt: number): [number, number] => {
      const a = index * 2.39996 + salt;
      const frac = Math.sqrt(((index * 37 + salt * 13) % 1000) / 1000);
      const rad = minR + frac * (maxR - minR);
      return [Math.cos(a) * rad, Math.sin(a) * rad];
    };

    const chunkCount = gridDim * gridDim;

    // 1. Climbable Sculpted Rocks (1:1 surface collision across all maps)
    const rockCount = isMobile ? Math.round(config.scatter.rockCount * 0.62) : config.scatter.rockCount;
    if (rockCount > 0) {
      const rockGeo = createSculptedRockGeometry();
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.08,
        flatShading: true,
      });
      geos.push(rockGeo);
      mats.push(rockMat);

      const baseRockColor = new THREE.Color(config.scatter.rockColorHex);
      const bucketMats: number[][] = Array.from({ length: chunkCount }, () => []);
      const bucketCols: number[][] = Array.from({ length: chunkCount }, () => []);

      let placed = 0;
      for (let i = 0; i < rockCount * 4 && placed < rockCount; i++) {
        const [x, z] = seedPos(i, 16, config.radiusMeters + 14, 1.3);
        if (!isClearSpot(x, z, 3.0)) continue;
        const y = getTerrainY(x, z);
        const s = 0.85 + ((i * 19) % 10) * 0.14;
        const rx = s * 1.85;
        const rz = s * 1.55;
        const height = s * 0.84;
        const rotY = i * 1.1;

        dummy.position.set(x, y, z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(rx, height, rz);
        dummy.updateMatrix();

        const b = getChunkIdx(x, z);
        const matArr = bucketMats[b];
        for (let m = 0; m < 16; m++) matArr.push(dummy.matrix.elements[m]);

        const shade = 0.86 + ((i * 7) % 10) * 0.03;
        tint.copy(baseRockColor).multiplyScalar(shade);
        bucketCols[b].push(tint.r, tint.g, tint.b);

        if (Math.hypot(x, z) < config.radiusMeters) {
          rockColliders.push({
            x,
            z,
            baseY: y,
            rx,
            rz,
            height,
            cosY: Math.cos(rotY),
            sinY: Math.sin(rotY),
          });
        }
        placed++;
      }
      emitInstancedChunks(rockGeo, rockMat, bucketMats, bucketCols, {
        castShadow: !disableScatterShadows,
        receiveShadow: true,
        isDetailOnly: false,
      });
    }

    // 1b. Desert Saguaro Cacti & Scrub
    const rawCactusCount = config.scatter.cactusCount ?? 0;
    const cactusCount = isMobile ? Math.round(rawCactusCount * 0.62) : rawCactusCount;
    if (cactusCount > 0) {
      const stem = new THREE.CylinderGeometry(0.18, 0.22, 2.5, 6);
      stem.translate(0, 1.25, 0);
      const armL = new THREE.CylinderGeometry(0.12, 0.14, 0.95, 6);
      armL.rotateZ(Math.PI * 0.28);
      armL.translate(-0.36, 1.45, 0);
      const armR = new THREE.CylinderGeometry(0.12, 0.14, 0.85, 6);
      armR.rotateZ(-Math.PI * 0.28);
      armR.translate(0.34, 1.7, 0);

      const cactusGeo = mergeGeometries([stem, armL, armR], false);
      stem.dispose();
      armL.dispose();
      armR.dispose();

      if (cactusGeo) {
        const cactusMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.84,
          metalness: 0.04,
          flatShading: true,
        });
        geos.push(cactusGeo);
        mats.push(cactusMat);

        const bucketMats: number[][] = Array.from({ length: chunkCount }, () => []);
        const bucketCols: number[][] = Array.from({ length: chunkCount }, () => []);

        let placed = 0;
        for (let i = 0; i < cactusCount * 4 && placed < cactusCount; i++) {
          const [x, z] = seedPos(i, 18, config.radiusMeters - 6, 3.7);
          if (!isClearSpot(x, z, 3.2)) continue;
          const y = getTerrainY(x, z);
          const s = 0.78 + ((i * 17) % 10) * 0.085;

          dummy.position.set(x, y, z);
          dummy.rotation.set(0, i * 1.15, 0);
          dummy.scale.set(s, s * (0.95 + (i % 3) * 0.12), s);
          dummy.updateMatrix();

          const b = getChunkIdx(x, z);
          const matArr = bucketMats[b];
          for (let m = 0; m < 16; m++) matArr.push(dummy.matrix.elements[m]);

          if (i % 4 === 0) tint.set('#4d7c0f');
          else if (i % 3 === 0) tint.set('#3f6212');
          else tint.set('#65a30d');
          bucketCols[b].push(tint.r, tint.g, tint.b);

          if (Math.hypot(x, z) < config.radiusMeters) {
            circleColliders.push({ x, z, radius: 0.36 * s, topY: y + 2.6 * s });
          }
          placed++;
        }
        emitInstancedChunks(cactusGeo, cactusMat, bucketMats, bucketCols, {
          castShadow: !disableScatterShadows,
          receiveShadow: true,
          isDetailOnly: true,
        });
      }
    }

    // 1c. Desert Horizon Sandstone Mesas / Buttes
    const mesaCount = config.scatter.mesaCount ?? 0;
    if (mesaCount > 0) {
      const mesaGeo = new THREE.CylinderGeometry(14, 24, 28, 7);
      const mesaMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.05,
        flatShading: true,
      });
      geos.push(mesaGeo);
      mats.push(mesaMat);

      const mesas = new THREE.InstancedMesh(mesaGeo, mesaMat, mesaCount);
      for (let i = 0; i < mesaCount; i++) {
        const angle = (i / mesaCount) * Math.PI * 2 + (i % 3) * 0.05;
        const dist = config.radiusMeters + 26 + (i % 4) * 18;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const y = getTerrainY(x, z);
        const sx = 1.0 + (i % 4) * 0.25;
        const sy = 0.85 + (i % 3) * 0.32;

        dummy.position.set(x, y + 12 * sy, z);
        dummy.rotation.set(0, i * 0.85, 0);
        dummy.scale.set(sx, sy, sx * 0.88);
        dummy.updateMatrix();
        mesas.setMatrixAt(i, dummy.matrix);

        if (i % 3 === 0) tint.set('#9a3412');
        else if (i % 2 === 0) tint.set('#b45309');
        else tint.set('#a16207');
        mesas.setColorAt(i, tint);
      }
      mesas.instanceMatrix.needsUpdate = true;
      if (mesas.instanceColor) mesas.instanceColor.needsUpdate = true;
      mesas.computeBoundingSphere();
      ownedInstancedMeshes.push(mesas);
      root.add(mesas);
    }

    // 2. Pine / Snow Evergreen Trees
    const pineCount =
      config.scatter.pineTreeCount > 0
        ? config.scatter.pineTreeCount
        : config.scatter.snowTreeCount;
    const isSnowTrees = config.scatter.snowTreeCount > 0;
    const actualPineCount = isMobile ? Math.round(pineCount * 0.62) : pineCount;

    if (actualPineCount > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6);
      const foliageGeo = new THREE.ConeGeometry(1.6, 4.2, 7);
      const trunkMat = new THREE.MeshStandardMaterial({
        color: '#5c3a21',
        roughness: 0.92,
        metalness: 0.04,
      });
      const foliageMat = new THREE.MeshStandardMaterial({
        color: isSnowTrees ? '#1e4d40' : '#166534',
        roughness: 0.84,
        metalness: 0.05,
        flatShading: true,
      });
      geos.push(trunkGeo, foliageGeo);
      mats.push(trunkMat, foliageMat);

      let capGeo: THREE.ConeGeometry | null = null;
      let capMat: THREE.MeshStandardMaterial | null = null;
      if (isSnowTrees) {
        capGeo = new THREE.ConeGeometry(1.22, 2.1, 7);
        capMat = new THREE.MeshStandardMaterial({
          color: '#f1f5f9',
          roughness: 0.65,
          metalness: 0.05,
          flatShading: true,
        });
        geos.push(capGeo);
        mats.push(capMat);
      }

      const trunkBuckets: number[][] = Array.from({ length: chunkCount }, () => []);
      const foliageBuckets: number[][] = Array.from({ length: chunkCount }, () => []);
      const capBuckets: number[][] | null = isSnowTrees
        ? Array.from({ length: chunkCount }, () => [])
        : null;

      let placed = 0;
      for (let i = 0; i < actualPineCount * 4 && placed < actualPineCount; i++) {
        const [x, z] = seedPos(i, 16, config.radiusMeters + 8, 2.7);
        if (!isClearSpot(x, z, 3.6)) continue;
        const y = getTerrainY(x, z);
        const s = 0.9 + ((i * 13) % 10) * 0.07;
        const b = getChunkIdx(x, z);

        dummy.position.set(x, y + 1.25 * s, z);
        dummy.rotation.set(0, i * 0.7, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        const tArr = trunkBuckets[b];
        for (let m = 0; m < 16; m++) tArr.push(dummy.matrix.elements[m]);

        dummy.position.set(x, y + 3.8 * s, z);
        dummy.updateMatrix();
        const fArr = foliageBuckets[b];
        for (let m = 0; m < 16; m++) fArr.push(dummy.matrix.elements[m]);

        if (capBuckets) {
          dummy.position.set(x, y + 4.95 * s, z);
          dummy.updateMatrix();
          const cArr = capBuckets[b];
          for (let m = 0; m < 16; m++) cArr.push(dummy.matrix.elements[m]);
        }

        if (Math.hypot(x, z) < config.radiusMeters) {
          circleColliders.push({ x, z, radius: 0.45 * s, topY: y + 4.8 });
        }
        placed++;
      }

      emitInstancedChunks(trunkGeo, trunkMat, trunkBuckets, null, {
        castShadow: !disableScatterShadows,
        receiveShadow: false,
        isDetailOnly: false,
      });
      emitInstancedChunks(foliageGeo, foliageMat, foliageBuckets, null, {
        castShadow: !disableScatterShadows,
        receiveShadow: false,
        isDetailOnly: false,
      });
      if (capGeo && capMat && capBuckets) {
        emitInstancedChunks(capGeo, capMat, capBuckets, null, {
          castShadow: false,
          receiveShadow: false,
          isDetailOnly: false,
        });
      }
    }

    // 3. Broadleaf / Deciduous Forest Trees
    const broadCount = isMobile
      ? Math.round(config.scatter.broadleafTreeCount * 0.62)
      : config.scatter.broadleafTreeCount;
    if (broadCount > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 2.6, 6);
      const canopyGeo = new THREE.IcosahedronGeometry(1.7, 1);
      const trunkMat = new THREE.MeshStandardMaterial({
        color: '#6b4423',
        roughness: 0.9,
        metalness: 0.04,
      });
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.04,
        flatShading: true,
      });
      geos.push(trunkGeo, canopyGeo);
      mats.push(trunkMat, canopyMat);

      const trunkBuckets: number[][] = Array.from({ length: chunkCount }, () => []);
      const canopyBuckets: number[][] = Array.from({ length: chunkCount }, () => []);
      const canopyColors: number[][] = Array.from({ length: chunkCount }, () => []);

      let placed = 0;
      for (let i = 0; i < broadCount * 4 && placed < broadCount; i++) {
        const [x, z] = seedPos(i, 16, config.radiusMeters, 5.1);
        if (!isClearSpot(x, z, 3.8)) continue;
        const y = getTerrainY(x, z);
        const s = 0.9 + ((i * 11) % 10) * 0.06;
        const b = getChunkIdx(x, z);

        dummy.position.set(x, y + 1.3 * s, z);
        dummy.rotation.set(0, i * 0.9, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        const tArr = trunkBuckets[b];
        for (let m = 0; m < 16; m++) tArr.push(dummy.matrix.elements[m]);

        dummy.position.set(x, y + 3.4 * s, z);
        dummy.scale.set(s * 1.15, s * 0.92, s * 1.15);
        dummy.updateMatrix();
        const cArr = canopyBuckets[b];
        for (let m = 0; m < 16; m++) cArr.push(dummy.matrix.elements[m]);

        if (i % 5 === 0) tint.set('#65a30d');
        else if (i % 3 === 0) tint.set('#15803d');
        else tint.set('#22c55e');
        canopyColors[b].push(tint.r, tint.g, tint.b);

        if (Math.hypot(x, z) < config.radiusMeters) {
          circleColliders.push({ x, z, radius: 0.48 * s, topY: y + 4.8 });
        }
        placed++;
      }

      emitInstancedChunks(trunkGeo, trunkMat, trunkBuckets, null, {
        castShadow: !disableScatterShadows,
        receiveShadow: false,
        isDetailOnly: false,
      });
      emitInstancedChunks(canopyGeo, canopyMat, canopyBuckets, canopyColors, {
        castShadow: !disableScatterShadows,
        receiveShadow: false,
        isDetailOnly: false,
      });
    }

    // 4. Perimeter Alpine Mountains (Snow map grand horizon ring)
    const mtnCount = config.scatter.mountainCount;
    if (mtnCount > 0) {
      const mtnGeo = new THREE.ConeGeometry(28, 54, 6);
      const mtnCapGeo = new THREE.ConeGeometry(13.5, 25, 6);
      const mtnMat = new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.9,
        metalness: 0.08,
        flatShading: true,
      });
      const mtnCapMat = new THREE.MeshStandardMaterial({
        color: config.biome === 'snow' && !config.isTrainingGround ? '#f8fafc' : '#2e4c2a',
        roughness: config.biome === 'snow' && !config.isTrainingGround ? 0.65 : 0.9,
        metalness: 0.05,
        flatShading: true,
      });
      geos.push(mtnGeo, mtnCapGeo);
      mats.push(mtnMat, mtnCapMat);

      const mtns = new THREE.InstancedMesh(mtnGeo, mtnMat, mtnCount);
      const caps = new THREE.InstancedMesh(mtnCapGeo, mtnCapMat, mtnCount);
      for (let i = 0; i < mtnCount; i++) {
        const angle = (i / mtnCount) * Math.PI * 2 + (i % 2) * 0.06;
        const dist = config.radiusMeters + 28 + (i % 4) * 18;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const y = getTerrainY(x, z);
        const s = (0.95 + (i % 4) * 0.24) * 1.45;

        dummy.position.set(x, y + 22 * s, z);
        dummy.rotation.set(0, i * 0.9, 0);
        dummy.scale.set(s * 1.18, s, s * 1.18);
        dummy.updateMatrix();
        mtns.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, y + 37 * s, z);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
      }
      mtns.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
      mtns.computeBoundingSphere();
      caps.computeBoundingSphere();
      ownedInstancedMeshes.push(mtns, caps);
      root.add(mtns, caps);
    }
  }

  private createRoadTexture(biome: MapConfig['biome']): THREE.CanvasTexture {
    const anisotropy = this.assetManager.getMaxAnisotropy();
    const cacheKey = `${biome}|${anisotropy}`;
    const cached = this.roadTextureCache.get(cacheKey);
    if (cached) return cached;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#efefef';
    ctx.fillRect(0, 0, size, size);

    // Crisp road shoulder borders
    ctx.fillStyle = biome === 'desert' ? '#c8c8c8' : '#d8d8d8';
    ctx.fillRect(0, 0, 12, size);
    ctx.fillRect(size - 12, 0, 12, size);

    // Asphalt/earth micro aggregate
    for (let i = 0; i < 1200; i++) {
      const px = (i * 107) % size;
      const py = (i * 211) % size;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
      ctx.fillRect(px, py, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
    this.roadTextureCache.set(cacheKey, tex);
    return tex;
  }

  private createBiomeTexture(
    config: MapConfig,
    size = 512,
    skipRoughnessMap = false,
  ): {
    map: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture | null;
  } {
    const anisotropy = this.assetManager.getMaxAnisotropy();
    const repeatCount = config.isWaitingArena ? 38 : config.isTrainingGround ? 90 : 130;
    const cacheKey = `${config.isWaitingArena ? 'waiting' : config.isTrainingGround ? 'tg' : config.biome}|${config.theme.groundBaseHex}|${config.theme.groundAccentHex}|${size}|${skipRoughnessMap ? 1 : 0}|${repeatCount}|${anisotropy}`;
    const cached = this.biomeTextureCache.get(cacheKey);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const rCanvas = skipRoughnessMap ? null : document.createElement('canvas');
    if (rCanvas) {
      rCanvas.width = size;
      rCanvas.height = size;
    }
    const rCtx = rCanvas ? rCanvas.getContext('2d')! : null;

    ctx.fillStyle = config.theme.groundBaseHex;
    ctx.fillRect(0, 0, size, size);

    if (rCtx) {
      rCtx.fillStyle = config.biome === 'snow' ? '#b8b8b8' : '#dcdcdc';
      rCtx.fillRect(0, 0, size, size);
    }

    const densityScale = size < 512 ? 0.5 : 1;

    if (config.isWaitingArena) {
      // Polished warm cream terrazzo plaza pavers for Gold Saucer Waiting Lobby
      const step = size / 4;
      ctx.strokeStyle = 'rgba(138, 112, 92, 0.28)';
      ctx.lineWidth = Math.max(1, Math.round(2 * (size / 512)));
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * step);
        ctx.lineTo(size, i * step);
        ctx.stroke();
      }
      ctx.fillStyle = config.theme.groundAccentHex;
      const dots = Math.round(700 * densityScale);
      for (let i = 0; i < dots; i++) {
        const x = (i * 137) % size;
        const y = (i * 251) % size;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
      if (rCtx) {
        rCtx.fillStyle = '#787878';
        rCtx.fillRect(0, 0, size, size);
      }
    } else if (config.biome === 'desert') {
      // Wind-rippled dunes + warm sandstone grit
      for (let y = 0; y < size; y += 6) {
        const wave = Math.sin((y / size) * Math.PI * 16) * 0.5 + 0.5;
        ctx.fillStyle = wave > 0.5 ? 'rgba(255, 237, 213, 0.14)' : 'rgba(120, 53, 15, 0.12)';
        ctx.fillRect(0, y, size, 3);
        if (rCtx) {
          rCtx.fillStyle = wave > 0.5 ? 'rgb(218,218,218)' : 'rgb(236,236,236)';
          rCtx.fillRect(0, y, size, 3);
        }
      }
      ctx.fillStyle = config.theme.groundAccentHex;
      const dots = Math.round(1600 * densityScale);
      for (let i = 0; i < dots; i++) {
        const x = (i * 149) % size;
        const y = (i * 277) % size;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(x, y, 2 + (i % 3), 2);
      }
      ctx.globalAlpha = 1;
    } else if (config.biome === 'snow') {
      // Soft powder drifts & crystalline frost sheen
      const streaks = Math.round(140 * densityScale);
      for (let i = 0; i < streaks; i++) {
        const x = (i * 197) % size;
        const y = (i * 313) % size;
        const w = 18 + (i % 24);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(148,163,184,0.16)';
        ctx.fillRect(x, y, w, 5);
        if (rCtx) {
          rCtx.fillStyle = i % 2 === 0 ? 'rgb(160,160,160)' : 'rgb(195,195,195)';
          rCtx.fillRect(x, y, w, 5);
        }
      }
      const dots = Math.round(1100 * densityScale);
      for (let i = 0; i < dots; i++) {
        const x = (i * 173) % size;
        const y = (i * 293) % size;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : config.theme.groundAccentHex;
        ctx.globalAlpha = 0.2;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    } else {
      // Rich forest turf blades & earth loam patches
      ctx.fillStyle = config.theme.groundAccentHex;
      const dots1 = Math.round(1800 * densityScale);
      for (let i = 0; i < dots1; i++) {
        const x = (i * 131) % size;
        const y = (i * 239) % size;
        ctx.globalAlpha = 0.24;
        ctx.fillRect(x, y, 2 + (i % 3), 3 + (i % 4));
      }
      ctx.fillStyle = '#4d7c0f';
      const dots2 = Math.round(800 * densityScale);
      for (let i = 0; i < dots2; i++) {
        const x = (i * 181) % size;
        const y = (i * 307) % size;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(x, y, 2, 4);
      }
      ctx.globalAlpha = 1;
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeatCount, repeatCount);
    map.anisotropy = anisotropy;
    map.needsUpdate = true;

    let roughnessMap: THREE.CanvasTexture | null = null;
    if (rCanvas) {
      roughnessMap = new THREE.CanvasTexture(rCanvas);
      roughnessMap.colorSpace = THREE.NoColorSpace;
      roughnessMap.wrapS = THREE.RepeatWrapping;
      roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.repeat.set(repeatCount, repeatCount);
      roughnessMap.anisotropy = anisotropy;
      roughnessMap.needsUpdate = true;
    }

    const result = { map, roughnessMap };
    this.biomeTextureCache.set(cacheKey, result);
    return result;
  }
}
