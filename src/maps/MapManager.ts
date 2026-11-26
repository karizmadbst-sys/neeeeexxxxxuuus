import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { SceneManager } from '../core/SceneManager';
import type { DeviceProfile, QualityPreset, Subsystem } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import type { PlayerCollisionWorld, ZiplineRidePlan } from '../player/IPlayerController';
import { clamp, damp } from '../utils/MathUtils';
import {
  evaluateWalkableSurfaceY,
  type AccessibleWindow,
  type InteractiveDoor,
  type SittableSeat,
} from './BuildingSystem';
import type { LootPoint, MapId, MinimapMarker } from './IMapSystem';
import { LootPointManager } from './LootPointManager';
import { MapBounds } from './MapBounds';
import { MAP_CONFIGS, type MapConfig } from './MapData';
import { evaluateRoadFieldY, MapLoader, type CircleCollider, type LoadedMapScene } from './MapLoader';
import {
  FOREST_RIVER_WATER_Y,
  getForestRiverMask,
  SNOW_LAKE_CENTER_X,
  SNOW_LAKE_CENTER_Z,
  SNOW_LAKE_ICE_Y,
  SNOW_LAKE_RX,
  SNOW_LAKE_RZ,
} from './MapTerrain';
import { SkyAndWeatherSystem } from './SkyAndWeatherSystem';
import { SpawnPointManager } from './SpawnPointManager';
import { TRAINING_GROUND_CONFIG } from './TrainingGroundData';
import { WAITING_ARENA_CONFIG } from './WaitingArenaData';
import {
  evaluateRockSurfaceY,
  intersectRockRay,
  resolveRockHorizontalCollision,
} from './RockGeometry';
import { findNearestZiplinePlan } from './ZiplineSystem';

export interface FlightMinimapOverlay {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  planeX: number;
  planeZ: number;
  planeHeadingRad: number;
  showPlane: boolean;
}

export interface MinimapSnapshot {
  config: MapConfig;
  playerX: number;
  playerZ: number;
  playerDirectionRad: number;
  safeCenterX: number;
  safeCenterZ: number;
  safeRadius: number;
  nextSafeCenterX: number;
  nextSafeCenterZ: number;
  nextSafeRadius: number;
  inDangerZone: boolean;
  teammateMarkers: readonly MinimapMarker[];
  enemyMarkers: readonly MinimapMarker[];
  flightOverlay?: FlightMinimapOverlay;
  hideZoneOverlay?: boolean;
}

export interface DoorPromptSnapshot {
  doorId: string;
  label: string;
  isOpen: boolean;
  desktopPrompt: string;
  mobilePrompt: string;
}

export interface WorldInteractPrompt {
  id: string;
  kind: 'door' | 'seat' | 'stand' | 'window' | 'zipline';
  desktopPrompt: string;
  mobilePrompt: string;
}

export interface WindowVaultPlan {
  window: AccessibleWindow;
  wasBroken: boolean;
  startX: number;
  startY: number;
  startZ: number;
  apexY: number;
  endX: number;
  endY: number;
  endZ: number;
  vaultYaw: number;
  sillX: number;
  sillY: number;
  sillZ: number;
  handLeftX: number;
  handLeftY: number;
  handLeftZ: number;
  handRightX: number;
  handRightY: number;
  handRightZ: number;
  wallNormalX: number;
  wallNormalZ: number;
}

const CELL_SIZE = 16;
const GRID_OFFSET = 512;
const GRID_STRIDE = 1024;
const CAMERA_PROBE_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.18, 0],
  [-0.18, 0],
  [0, 0.16],
  [0, -0.14],
];

export class MapManager implements Subsystem, PlayerCollisionWorld {
  readonly root = new THREE.Group();
  readonly spawnPointManager = new SpawnPointManager();
  readonly lootPointManager = new LootPointManager();

  private readonly loader: MapLoader;
  private readonly skyWeather = new SkyAndWeatherSystem();
  private activeMap: LoadedMapScene | null = null;
  private bounds: MapBounds;
  private qualityPreset: QualityPreset = 'medium';
  private shadowsEnabled = true;
  private airborneFogScale = 1.0;

  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();
  private readonly scratchSphere = new THREE.Sphere();

  private teammateMarkers: MinimapMarker[] = [];
  private enemyMarkers: MinimapMarker[] = [];

  // 16m x 16m spatial hash grids for O(1) collision & multi-floor surface lookup
  private readonly boxGrid = new Map<number, number[]>();
  private readonly surfaceGrid = new Map<number, number[]>();
  private readonly circleGrid = new Map<number, number[]>();
  private readonly rockGrid = new Map<number, number[]>();
  private readonly roadGrid = new Map<number, number[]>();
  private readonly doorGrid = new Map<number, number[]>();
  private readonly windowGrid = new Map<number, number[]>();
  private readonly seatGrid = new Map<number, number[]>();
  private boxStamp = new Int32Array(0);
  private surfaceStamp = new Int32Array(0);
  private circleStamp = new Int32Array(0);
  private rockStamp = new Int32Array(0);
  private doorStamp = new Int32Array(0);
  private windowStamp = new Int32Array(0);
  private seatStamp = new Int32Array(0);
  private queryStampCounter = 1;
  private readonly camBoxCandidates: number[] = [];
  private readonly camSlabCandidates: number[] = [];
  private readonly camCircleCandidates: number[] = [];
  private readonly camRockCandidates: number[] = [];
  private readonly camDoorCandidates: number[] = [];
  private readonly animatingDoors = new Set<InteractiveDoor>();
  private visibleDoors = new Set<InteractiveDoor>();
  private nextVisibleDoors = new Set<InteractiveDoor>();
  private lastAppliedFogDensity = -1;
  private readonly shatteredWindows = new Set<string>();
  private combinedLootPointsCache: LootPoint[] = [];
  private dynamicCollisionResolver?: (
    position: THREE.Vector3,
    radius: number,
    bodyHeight: number,
  ) => void;
  private readonly scratchPlacementVec = new THREE.Vector3();
  private readonly minimapSnapshotScratch: MinimapSnapshot = {
    config: MAP_CONFIGS.desert,
    playerX: 0,
    playerZ: 0,
    playerDirectionRad: 0,
    safeCenterX: 0,
    safeCenterZ: 0,
    safeRadius: 0,
    nextSafeCenterX: 0,
    nextSafeCenterZ: 0,
    nextSafeRadius: 0,
    inDangerZone: false,
    teammateMarkers: [],
    enemyMarkers: [],
    flightOverlay: undefined,
    hideZoneOverlay: false,
  };

  constructor(
    assetManager: AssetManager,
    private readonly sceneManager: SceneManager,
    private readonly deviceProfile: DeviceProfile,
    initialMapId: MapId | null = 'desert',
  ) {
    this.loader = new MapLoader(assetManager);
    this.root.add(this.skyWeather.root);
    const initialCfg = MAP_CONFIGS[initialMapId ?? 'desert'];
    this.bounds = new MapBounds(initialCfg.bounds);
    if (initialMapId) {
      this.loadMap(initialMapId);
    }
  }

  private isCompactPlatform(): boolean {
    return (
      this.deviceProfile.isMobile ||
      this.deviceProfile.isAndroid ||
      this.deviceProfile.isTablet ||
      this.deviceProfile.performanceTier === 'low-end-pc'
    );
  }

  private getMapBuildOptions() {
    const isCompact = this.isCompactPlatform();
    const disableScatterShadows =
      !this.shadowsEnabled || this.qualityPreset !== 'high' || isCompact;
    return {
      quality: this.qualityPreset,
      isCompact,
      disableScatterShadows,
    };
  }

  private commitLoadedMap(loaded: LoadedMapScene): MapConfig {
    const config = loaded.config;
    this.activeMap = loaded;
    this.bounds = new MapBounds(config.bounds);
    this.rebuildSpatialIndex(loaded);
    this.visibleDoors.clear();
    this.nextVisibleDoors.clear();
    this.lastAppliedFogDensity = -1;
    for (let i = 0; i < loaded.doors.length; i++) {
      loaded.doors[i].pivotGroup.visible = false;
    }

    this.root.add(loaded.root);
    this.spawnPointManager.load(config.spawnPoints, (x, z) => this.getGroundHeightAt(x, z));
    this.lootPointManager.load(config.lootPoints, (x, z) => this.getGroundHeightAt(x, z));
    this.combinedLootPointsCache = config.isWaitingArena
      ? []
      : [
          ...this.lootPointManager.getAll(),
          ...loaded.interiorLootPoints,
        ];
    this.applyBiomeEnvironment(config);
    this.skyWeather.resetWeatherCycle();
    this.applyScatterAndObstacleQuality();

    return config;
  }

  loadMap(mapId: MapId): MapConfig {
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }

    const config = MAP_CONFIGS[mapId];
    const loaded = this.loader.buildMap(config, this.getMapBuildOptions());
    return this.commitLoadedMap(loaded);
  }

  loadWaitingArena(): MapConfig {
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }

    const loaded = this.loader.buildMap(WAITING_ARENA_CONFIG, this.getMapBuildOptions());
    return this.commitLoadedMap(loaded);
  }

  async loadWaitingArenaProgressive(
    onStage?: (stageLabel: string) => void,
  ): Promise<MapConfig> {
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }

    const loaded = await this.loader.buildMapProgressive(
      WAITING_ARENA_CONFIG,
      this.getMapBuildOptions(),
      undefined,
      onStage,
    );
    return this.commitLoadedMap(loaded);
  }

  loadTrainingGround(): MapConfig {
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }

    const loaded = this.loader.buildMap(TRAINING_GROUND_CONFIG, this.getMapBuildOptions());
    return this.commitLoadedMap(loaded);
  }

  async loadTrainingGroundProgressive(
    onStage?: (stageLabel: string) => void,
  ): Promise<MapConfig> {
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }

    const loaded = await this.loader.buildMapProgressive(
      TRAINING_GROUND_CONFIG,
      this.getMapBuildOptions(),
      undefined,
      onStage,
    );
    return this.commitLoadedMap(loaded);
  }

  async loadMapProgressive(
    mapId: MapId,
    onStage?: (stageLabel: string) => void,
  ): Promise<MapConfig> {
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }

    const config = MAP_CONFIGS[mapId];
    const loaded = await this.loader.buildMapProgressive(
      config,
      this.getMapBuildOptions(),
      undefined,
      onStage,
    );
    return this.commitLoadedMap(loaded);
  }

  hasActiveMap(): boolean {
    return this.activeMap !== null;
  }

  unloadMap(): void {
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }
    this.boxGrid.clear();
    this.surfaceGrid.clear();
    this.circleGrid.clear();
    this.roadGrid.clear();
    this.doorGrid.clear();
    this.windowGrid.clear();
    this.seatGrid.clear();
    this.animatingDoors.clear();
    this.visibleDoors.clear();
    this.nextVisibleDoors.clear();
    this.lastAppliedFogDensity = -1;
    this.shatteredWindows.clear();
    this.combinedLootPointsCache = [];
    this.teammateMarkers = [];
    this.enemyMarkers = [];
  }

  setQualityPreset(quality: QualityPreset, shadowsEnabled: boolean): void {
    this.qualityPreset = quality;
    this.shadowsEnabled = shadowsEnabled;
    if (this.activeMap) {
      this.applyBiomeEnvironment(this.activeMap.config);
      this.applyScatterAndObstacleQuality();
    }
  }

  private applyScatterAndObstacleQuality(): void {
    if (!this.activeMap) return;
    const isCompact =
      this.deviceProfile.isMobile ||
      this.deviceProfile.isAndroid ||
      this.deviceProfile.isTablet ||
      this.deviceProfile.performanceTier === 'low-end-pc';
    const allowScatterShadows = this.shadowsEnabled && this.qualityPreset === 'high' && !isCompact;
    const allowObstacleShadows = this.shadowsEnabled && this.qualityPreset !== 'low';
    const showDetailScatter = this.qualityPreset !== 'low';

    const scatterShadows = this.activeMap.scatterShadowMeshes;
    for (let i = 0; i < scatterShadows.length; i++) {
      scatterShadows[i].castShadow = allowScatterShadows;
    }

    const obstacleShadows = this.activeMap.obstacleShadowMeshes;
    for (let i = 0; i < obstacleShadows.length; i++) {
      obstacleShadows[i].castShadow = allowObstacleShadows;
    }

    const detailMeshes = this.activeMap.detailScatterMeshes;
    for (let i = 0; i < detailMeshes.length; i++) {
      detailMeshes[i].visible = showDetailScatter;
    }
  }

  updateFrustum(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
  }

  isSphereInFrustum(x: number, y: number, z: number, radius: number): boolean {
    this.scratchSphere.center.set(x, y, z);
    this.scratchSphere.radius = radius;
    return this.frustum.intersectsSphere(this.scratchSphere);
  }

  updateVisibilityAndLOD(camera: THREE.Camera, focusX: number, focusZ: number): void {
    this.skyWeather.syncCamera(camera);
    if (!this.activeMap) return;
    const entries = this.activeMap.sectorEntries;
    if (entries.length === 0) return;

    this.updateFrustum(camera);

    const isCompact = this.isCompactPlatform();
    const maxStructDist =
      this.qualityPreset === 'low'
        ? isCompact
          ? 195
          : 275
        : this.qualityPreset === 'medium'
          ? isCompact
            ? 310
            : 440
          : isCompact
            ? 480
            : 700;
    const maxDecoDist =
      this.qualityPreset === 'low'
        ? isCompact
          ? 58
          : 90
        : this.qualityPreset === 'medium'
          ? isCompact
            ? 110
            : 165
          : isCompact
            ? 175
            : 260;
    const maxShadowDist =
      this.qualityPreset === 'high' ? (isCompact ? 62 : 88) : isCompact ? 40 : 58;
    const allowShadows = this.shadowsEnabled && this.qualityPreset !== 'low';

    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const occluders = this.activeMap.buildingOccluders;
    const canOcclude = occluders.length > 0 && camY < 28;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.isDetailOnly && this.qualityPreset === 'low') {
        if (entry.mesh.visible) {
          entry.mesh.visible = false;
        }
        continue;
      }
      const dx = entry.centerX - focusX;
      const dz = entry.centerZ - focusZ;
      const distSq = dx * dx + dz * dz;
      const maxRange = (entry.isDecorative ? maxDecoDist : maxStructDist) + entry.radius;

      if (distSq > maxRange * maxRange) {
        if (entry.mesh.visible) {
          entry.mesh.visible = false;
        }
        continue;
      }

      this.scratchSphere.center.set(entry.centerX, entry.centerY, entry.centerZ);
      this.scratchSphere.radius = entry.radius + 6;
      let visible = this.frustum.intersectsSphere(this.scratchSphere);

      // Lightweight 2D horizon occlusion culling for decorative sectors behind large buildings
      if (visible && entry.isDecorative && canOcclude) {
        const vx = entry.centerX - camX;
        const vz = entry.centerZ - camZ;
        const sectorDistSq = vx * vx + vz * vz;
        if (sectorDistSq > 26 * 26) {
          const sectorDist = Math.sqrt(sectorDistSq);
          const dirX = vx / sectorDist;
          const dirZ = vz / sectorDist;
          const entryTopY = entry.centerY + Math.min(8, entry.radius * 0.25);
          for (let j = 0; j < occluders.length; j++) {
            const occ = occluders[j];
            const ox = occ.cx - camX;
            const oz = occ.cz - camZ;
            if (ox * ox + oz * oz >= sectorDistSq) continue;
            const proj = ox * dirX + oz * dirZ;
            if (proj <= 2.5 || proj >= sectorDist - 8) continue;
            if (occ.topY < entryTopY && camY >= occ.topY) continue;
            const cross = Math.abs(ox * dirZ - oz * dirX);
            if (cross + Math.min(22, entry.radius * 0.35) < occ.radius) {
              visible = false;
              break;
            }
          }
        }
      }

      if (entry.mesh.visible !== visible) {
        entry.mesh.visible = visible;
      }

      if (!entry.isDecorative && visible) {
        const shouldCast =
          allowShadows && distSq <= (maxShadowDist + entry.radius) * (maxShadowDist + entry.radius);
        if (entry.mesh.castShadow !== shouldCast) {
          entry.mesh.castShadow = shouldCast;
        }
      }
    }

    const doors = this.activeMap.doors;
    if (doors.length > 0) {
      const maxDoorDist =
        this.qualityPreset === 'low'
          ? isCompact
            ? 65
            : 90
          : this.qualityPreset === 'medium'
            ? isCompact
              ? 95
              : 130
            : isCompact
              ? 125
              : 165;
      const maxDoorDistSq = maxDoorDist * maxDoorDist;
      const nextVis = this.nextVisibleDoors;
      nextVis.clear();

      const minGx = Math.floor((focusX - maxDoorDist) / CELL_SIZE);
      const maxGx = Math.floor((focusX + maxDoorDist) / CELL_SIZE);
      const minGz = Math.floor((focusZ - maxDoorDist) / CELL_SIZE);
      const maxGz = Math.floor((focusZ + maxDoorDist) / CELL_SIZE);
      const stamp = ++this.queryStampCounter;

      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gz = minGz; gz <= maxGz; gz++) {
          const list = this.doorGrid.get(this.cellKey(gx, gz));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const idx = list[i];
            if (this.doorStamp[idx] === stamp) continue;
            this.doorStamp[idx] = stamp;

            const d = doors[idx];
            const dx = d.centerX - focusX;
            const dz = d.centerZ - focusZ;
            if (
              dx * dx + dz * dz <= maxDoorDistSq &&
              this.isSphereInFrustum(d.centerX, (d.minY + d.maxY) * 0.5, d.centerZ, 1.8)
            ) {
              nextVis.add(d);
              if (!d.pivotGroup.visible) {
                d.pivotGroup.visible = true;
              }
            }
          }
        }
      }

      if (this.animatingDoors.size > 0) {
        for (const d of this.animatingDoors) {
          nextVis.add(d);
          if (!d.pivotGroup.visible) {
            d.pivotGroup.visible = true;
          }
        }
      }

      for (const prevDoor of this.visibleDoors) {
        if (!nextVis.has(prevDoor) && prevDoor.pivotGroup.visible) {
          prevDoor.pivotGroup.visible = false;
        }
      }

      const prevSet = this.visibleDoors;
      this.visibleDoors = nextVis;
      this.nextVisibleDoors = prevSet;
      this.nextVisibleDoors.clear();
    }
  }

  private cellKey(gx: number, gz: number): number {
    return (gx + GRID_OFFSET) * GRID_STRIDE + (gz + GRID_OFFSET);
  }

  private insertBoxToGrid(
    grid: Map<number, number[]>,
    idx: number,
    cx: number,
    cz: number,
    halfW: number,
    halfD: number,
    cosY: number,
    sinY: number,
  ): void {
    const extX = Math.abs(halfW * cosY) + Math.abs(halfD * sinY) + 1.0;
    const extZ = Math.abs(halfW * sinY) + Math.abs(halfD * cosY) + 1.0;
    const minGx = Math.floor((cx - extX) / CELL_SIZE);
    const maxGx = Math.floor((cx + extX) / CELL_SIZE);
    const minGz = Math.floor((cz - extZ) / CELL_SIZE);
    const maxGz = Math.floor((cz + extZ) / CELL_SIZE);
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const key = this.cellKey(gx, gz);
        let arr = grid.get(key);
        if (!arr) {
          arr = [];
          grid.set(key, arr);
        }
        arr.push(idx);
      }
    }
  }

  private rebuildSpatialIndex(loaded: LoadedMapScene): void {
    this.boxGrid.clear();
    this.surfaceGrid.clear();
    this.circleGrid.clear();
    this.rockGrid.clear();
    this.roadGrid.clear();
    this.doorGrid.clear();
    this.windowGrid.clear();
    this.seatGrid.clear();
    this.animatingDoors.clear();
    this.shatteredWindows.clear();

    const boxes = loaded.volumeColliders;
    this.boxStamp = new Int32Array(boxes.length);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      this.insertBoxToGrid(this.boxGrid, i, b.cx, b.cz, b.halfW, b.halfD, b.cosY, b.sinY);
    }

    const surfaces = loaded.walkableSurfaces;
    this.surfaceStamp = new Int32Array(surfaces.length);
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      this.insertBoxToGrid(this.surfaceGrid, i, s.cx, s.cz, s.halfW, s.halfD, s.cosY, s.sinY);
    }

    const circles = loaded.circleColliders;
    this.circleStamp = new Int32Array(circles.length);
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      this.insertBoxToGrid(this.circleGrid, i, c.x, c.z, c.radius, c.radius, 1, 0);
    }

    const rocks = loaded.rockColliders;
    this.rockStamp = new Int32Array(rocks.length);
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      this.insertBoxToGrid(
        this.rockGrid,
        i,
        r.x,
        r.z,
        r.rx * 1.22,
        r.rz * 1.22,
        r.cosY,
        r.sinY,
      );
    }

    const roads = loaded.roadFields;
    for (let i = 0; i < roads.length; i++) {
      const rf = roads[i];
      const minGx = Math.floor((rf.minX - 1.0) / CELL_SIZE);
      const maxGx = Math.floor((rf.maxX + 1.0) / CELL_SIZE);
      const minGz = Math.floor((rf.minZ - 1.0) / CELL_SIZE);
      const maxGz = Math.floor((rf.maxZ + 1.0) / CELL_SIZE);
      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gz = minGz; gz <= maxGz; gz++) {
          const key = this.cellKey(gx, gz);
          let arr = this.roadGrid.get(key);
          if (!arr) {
            arr = [];
            this.roadGrid.set(key, arr);
          }
          arr.push(i);
        }
      }
    }

    const doors = loaded.doors;
    this.doorStamp = new Int32Array(doors.length);
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      this.insertBoxToGrid(this.doorGrid, i, d.centerX, d.centerZ, d.halfW, d.halfD + 0.6, d.cosY, d.sinY);
    }

    const windows = loaded.windows;
    this.windowStamp = new Int32Array(windows.length);
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      this.insertBoxToGrid(this.windowGrid, i, w.cx, w.cz, w.halfSpan + 0.8, w.halfThick + 1.4, w.tangentX, -w.tangentZ);
    }

    const seats = loaded.seats;
    this.seatStamp = new Int32Array(seats.length);
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      this.insertBoxToGrid(this.seatGrid, i, s.seatX, s.seatZ, 0.8, 0.8, 1, 0);
    }
  }

  reapplyBiomeEnvironment(): void {
    if (this.activeMap) {
      this.applyBiomeEnvironment(this.activeMap.config);
    }
  }

  private getQualityFogMultiplier(): number {
    return this.qualityPreset === 'low' ? 1.28 : this.qualityPreset === 'medium' ? 1.0 : 0.9;
  }

  setAirborneFogScale(scale: number): void {
    this.airborneFogScale = scale;
    if (!this.activeMap) return;
    const fog = this.sceneManager.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.density =
        this.activeMap.config.theme.fogDensity *
        this.getQualityFogMultiplier() *
        this.airborneFogScale *
        this.skyWeather.getFogDensityMultiplier();
    }
  }

  private applyBiomeEnvironment(config: MapConfig): void {
    const t = config.theme;
    const fogDensity =
      t.fogDensity *
      this.getQualityFogMultiplier() *
      this.airborneFogScale *
      this.skyWeather.getFogDensityMultiplier();
    if (this.sceneManager.scene.background instanceof THREE.Color) {
      this.sceneManager.scene.background.set(t.skyColorHex);
    } else {
      this.sceneManager.scene.background = new THREE.Color(t.skyColorHex);
    }
    if (this.sceneManager.scene.fog instanceof THREE.FogExp2) {
      this.sceneManager.scene.fog.color.set(t.skyColorHex);
      this.sceneManager.scene.fog.density = fogDensity;
    } else {
      this.sceneManager.scene.fog = new THREE.FogExp2(t.skyColorHex, fogDensity);
    }
    this.sceneManager.keyLight.color.set(t.keyLightColorHex);
    this.sceneManager.keyLight.intensity = t.keyLightIntensity;
    this.sceneManager.hemiLight.color.set(t.hemiSkyHex);
    this.sceneManager.hemiLight.groundColor.set(t.hemiGroundHex);
    this.sceneManager.hemiLight.intensity = config.isWaitingArena ? 1.0 : 1.08;

    const rimHex = config.isWaitingArena
      ? '#f5b8e8'
      : config.biome === 'desert'
        ? '#fde6ba'
        : config.biome === 'forest'
          ? '#bae6fd'
          : '#dbeafe';
    this.sceneManager.rimLight.color.set(rimHex);
    this.sceneManager.rimLight.visible = this.qualityPreset !== 'low';
    this.sceneManager.rimLight.intensity = this.qualityPreset === 'high' ? 0.56 : 0.42;

    const isCompact =
      this.deviceProfile.isMobile ||
      this.deviceProfile.isAndroid ||
      this.deviceProfile.isTablet ||
      this.deviceProfile.performanceTier === 'low-end-pc';
    const dpr = this.deviceProfile.isSoftwareGl
      ? 1
      : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    this.skyWeather.configure(
      config.biome,
      this.qualityPreset,
      isCompact,
      dpr,
      Boolean(config.isWaitingArena),
    );
  }

  getActiveConfig(): MapConfig {
    return this.activeMap ? this.activeMap.config : MAP_CONFIGS.desert;
  }

  getCombinedLootPoints(): readonly LootPoint[] {
    if (this.combinedLootPointsCache.length > 0) {
      return this.combinedLootPointsCache;
    }
    return this.lootPointManager.getAll();
  }

  getGroundHeightAt(x: number, z: number, currentY?: number): number {
    if (!this.activeMap) return 0;

    let h = this.activeMap.getBaseTerrainY(x, z);

    if (
      !this.activeMap.config.isWaitingArena &&
      !this.activeMap.config.isTrainingGround &&
      this.activeMap.config.biome === 'snow'
    ) {
      const lnx = (x - SNOW_LAKE_CENTER_X) / SNOW_LAKE_RX;
      const lnz = (z - SNOW_LAKE_CENTER_Z) / SNOW_LAKE_RZ;
      if (lnx * lnx + lnz * lnz <= 1.0) {
        h = Math.max(h, SNOW_LAKE_ICE_Y + 0.015);
      }
    }

    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    const key = this.cellKey(gx, gz);

    const roadList = this.roadGrid.get(key);
    if (roadList) {
      const roads = this.activeMap.roadFields;
      for (let i = 0; i < roadList.length; i++) {
        const ry = evaluateRoadFieldY(roads[roadList[i]], x, z);
        if (ry !== null && ry > h) {
          h = ry;
        }
      }
    }

    const padRadius =
      this.activeMap.config.isWaitingArena || this.activeMap.config.isTrainingGround ? 0 : 5.25;
    if (padRadius > 0 && x * x + z * z <= padRadius * padRadius && (currentY === undefined || currentY + 0.74 >= 0.24)) {
      h = Math.max(h, 0.24);
    }

    const acceptMaxY = currentY !== undefined ? currentY + 0.74 : Number.POSITIVE_INFINITY;

    const rockList = this.rockGrid.get(key);
    if (rockList) {
      const rocks = this.activeMap.rockColliders;
      for (let i = 0; i < rockList.length; i++) {
        const ry = evaluateRockSurfaceY(rocks[rockList[i]], x, z);
        if (ry !== null && ry <= acceptMaxY && ry > h) {
          h = ry;
        }
      }
    }

    const list = this.surfaceGrid.get(key);
    if (!list) return h;

    const surfaces = this.activeMap.walkableSurfaces;

    for (let i = 0; i < list.length; i++) {
      const s = surfaces[list[i]];
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
  }

  getWaterSurfaceYAt(x: number, z: number): number | null {
    if (!this.activeMap) return null;
    if (this.activeMap.config.isWaitingArena || this.activeMap.config.isTrainingGround) return null;
    if (this.activeMap.config.biome === 'forest') {
      const riverMask = getForestRiverMask(x, z);
      if (riverMask > 0.25) {
        return FOREST_RIVER_WATER_Y;
      }
    }
    return null;
  }

  getCeilingHeightAt(x: number, z: number, currentY: number): number {
    if (!this.activeMap) return Number.POSITIVE_INFINITY;

    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    const list = this.surfaceGrid.get(this.cellKey(gx, gz));
    if (!list) return Number.POSITIVE_INFINITY;

    const surfaces = this.activeMap.walkableSurfaces;
    let ceiling = Number.POSITIVE_INFINITY;

    for (let i = 0; i < list.length; i++) {
      const s = surfaces[list[i]];
      if (s.kind !== 'slab') continue;
      const dx = x - s.cx;
      const dz = z - s.cz;
      const localX = dx * s.cosY - dz * s.sinY;
      const localZ = dx * s.sinY + dz * s.cosY;
      if (Math.abs(localX) <= s.halfW && Math.abs(localZ) <= s.halfD) {
        if (s.undersideY >= currentY + 1.45 && s.undersideY < ceiling) {
          ceiling = s.undersideY;
        }
      }
    }

    return ceiling;
  }

  setDynamicCollisionResolver(
    resolver?: (position: THREE.Vector3, radius: number, bodyHeight: number) => void,
  ): void {
    this.dynamicCollisionResolver = resolver;
  }

  resolveHorizontalCollision(
    position: THREE.Vector3,
    radius: number,
    bodyHeight = 1.62,
  ): void {
    this.bounds.clampPosition(position, radius);
    if (!this.activeMap) return;

    const boxes = this.activeMap.volumeColliders;
    const circles = this.activeMap.circleColliders;
    const rocks = this.activeMap.rockColliders;
    const doors = this.activeMap.doors;
    const effectiveHeight = clamp(bodyHeight, 0.9, 1.7);

    // Two-pass solver prevents corner-snagging or clipping into adjacent walls/furniture
    for (let pass = 0; pass < 2; pass++) {
      const stamp = ++this.queryStampCounter;
      const minGx = Math.floor((position.x - radius - 0.5) / CELL_SIZE);
      const maxGx = Math.floor((position.x + radius + 0.5) / CELL_SIZE);
      const minGz = Math.floor((position.z - radius - 0.5) / CELL_SIZE);
      const maxGz = Math.floor((position.z + radius + 0.5) / CELL_SIZE);

      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gz = minGz; gz <= maxGz; gz++) {
          const key = this.cellKey(gx, gz);
          const boxList = this.boxGrid.get(key);
          if (boxList) {
            for (let i = 0; i < boxList.length; i++) {
              const idx = boxList[i];
              if (this.boxStamp[idx] === stamp) continue;
              this.boxStamp[idx] = stamp;

              const b = boxes[idx];
              const feetCutoff = position.y + (b.steppable ? 0.50 : 0.28);
              const headCutoff = position.y + effectiveHeight;
              if (b.maxY <= feetCutoff || b.minY >= headCutoff) continue;

              this.resolveOrientedBox(
                position,
                radius,
                b.cx,
                b.cz,
                b.halfW,
                b.halfD,
                b.cosY,
                b.sinY,
              );
            }
          }

          const circleList = this.circleGrid.get(key);
          if (circleList) {
            for (let i = 0; i < circleList.length; i++) {
              const idx = circleList[i];
              if (this.circleStamp[idx] === stamp) continue;
              this.circleStamp[idx] = stamp;

              const c = circles[idx];
              if (position.y >= c.topY - 0.1) continue;
              this.resolveCircle(position, radius, c);
            }
          }

          const rockList = this.rockGrid.get(key);
          if (rockList) {
            for (let i = 0; i < rockList.length; i++) {
              const idx = rockList[i];
              if (this.rockStamp[idx] === stamp) continue;
              this.rockStamp[idx] = stamp;
              resolveRockHorizontalCollision(rocks[idx], position, radius);
            }
          }

          const doorList = this.doorGrid.get(key);
          if (doorList) {
            for (let i = 0; i < doorList.length; i++) {
              const idx = doorList[i];
              if (this.doorStamp[idx] === stamp) continue;
              this.doorStamp[idx] = stamp;

              const d = doors[idx];
              if (d.isOpen) continue;
              if (d.maxY <= position.y + 0.2 || d.minY >= position.y + 1.62) continue;
              this.resolveOrientedBox(
                position,
                radius,
                d.centerX,
                d.centerZ,
                d.halfW,
                d.halfD,
                d.cosY,
                d.sinY,
              );
            }
          }
        }
      }
    }

    this.dynamicCollisionResolver?.(position, radius, effectiveHeight);
    this.bounds.clampPosition(position, radius);
  }

  hasPlacementObstacleAt(x: number, y: number, z: number, radius = 0.48): boolean {
    this.scratchPlacementVec.set(x, y, z);
    if (this.bounds.clampPosition(this.scratchPlacementVec, radius + 0.35)) {
      return true;
    }
    if (!this.activeMap) return false;

    const boxes = this.activeMap.volumeColliders;
    const circles = this.activeMap.circleColliders;
    const rocks = this.activeMap.rockColliders;
    const doors = this.activeMap.doors;
    const stamp = ++this.queryStampCounter;
    const minGx = Math.floor((x - radius - 0.5) / CELL_SIZE);
    const maxGx = Math.floor((x + radius + 0.5) / CELL_SIZE);
    const minGz = Math.floor((z - radius - 0.5) / CELL_SIZE);
    const maxGz = Math.floor((z + radius + 0.5) / CELL_SIZE);
    const minY = y + 0.25;
    const maxY = y + 2.15;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const key = this.cellKey(gx, gz);
        const boxList = this.boxGrid.get(key);
        if (boxList) {
          for (let i = 0; i < boxList.length; i++) {
            const idx = boxList[i];
            if (this.boxStamp[idx] === stamp) continue;
            this.boxStamp[idx] = stamp;

            const b = boxes[idx];
            if (b.maxY <= minY || b.minY >= maxY) continue;
            const dx = x - b.cx;
            const dz = z - b.cz;
            const lx = dx * b.cosY - dz * b.sinY;
            const lz = dx * b.sinY + dz * b.cosY;
            if (Math.abs(lx) < b.halfW + radius && Math.abs(lz) < b.halfD + radius) {
              return true;
            }
          }
        }

        const circleList = this.circleGrid.get(key);
        if (circleList) {
          for (let i = 0; i < circleList.length; i++) {
            const idx = circleList[i];
            if (this.circleStamp[idx] === stamp) continue;
            this.circleStamp[idx] = stamp;

            const c = circles[idx];
            if (c.topY <= minY) continue;
            const dx = x - c.x;
            const dz = z - c.z;
            const minR = c.radius + radius;
            if (dx * dx + dz * dz < minR * minR) {
              return true;
            }
          }
        }

        const rockList = this.rockGrid.get(key);
        if (rockList) {
          for (let i = 0; i < rockList.length; i++) {
            const idx = rockList[i];
            if (this.rockStamp[idx] === stamp) continue;
            this.rockStamp[idx] = stamp;

            const rockSurf = evaluateRockSurfaceY(rocks[idx], x, z);
            if (rockSurf !== null && rockSurf > minY + 0.45) {
              return true;
            }
          }
        }

        const doorList = this.doorGrid.get(key);
        if (doorList) {
          for (let i = 0; i < doorList.length; i++) {
            const idx = doorList[i];
            if (this.doorStamp[idx] === stamp) continue;
            this.doorStamp[idx] = stamp;

            const d = doors[idx];
            if (d.isOpen) continue;
            if (d.maxY <= minY || d.minY >= maxY) continue;
            const dx = x - d.centerX;
            const dz = z - d.centerZ;
            const lx = dx * d.cosY - dz * d.sinY;
            const lz = dx * d.sinY + dz * d.cosY;
            if (Math.abs(lx) < d.halfW + radius && Math.abs(lz) < d.halfD + radius) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  isInsideBounds(x: number, z: number, margin = 0): boolean {
    return this.bounds.isInside(x, z, margin);
  }

  clampToBounds(position: THREE.Vector3, margin = 1.5): boolean {
    return this.bounds.clampPosition(position, margin);
  }

  resolveAirborneCollision(position: THREE.Vector3, radius = 0.48): void {
    this.bounds.clampPosition(position, 1.5);
    this.resolveHorizontalCollision(position, radius);
    this.bounds.clampPosition(position, 1.5);
  }

  resolveSafeLandingPosition(
    position: THREE.Vector3,
    prevY: number,
    radius = 0.48,
  ): number {
    this.bounds.clampPosition(position, 1.6);

    const queryY = Math.max(prevY, position.y) + 0.85;
    const baseY = this.activeMap ? this.activeMap.getBaseTerrainY(position.x, position.z) : 0;
    const surfaceY = this.getGroundHeightAt(position.x, position.z, queryY);
    position.y = Math.max(surfaceY, baseY);

    // Push cleanly out of any walls, boulders, tree trunks, pillars, containers, or closed doors
    for (let pass = 0; pass < 4; pass++) {
      this.resolveHorizontalCollision(position, radius);
    }

    const finalBaseY = this.activeMap
      ? this.activeMap.getBaseTerrainY(position.x, position.z)
      : 0;
    const finalSurfaceY = this.getGroundHeightAt(position.x, position.z, position.y + 0.74);
    position.y = Math.max(finalSurfaceY, finalBaseY);

    this.resolveHorizontalCollision(position, radius);
    this.bounds.clampPosition(position, 1.6);
    return position.y;
  }

  private resolveOrientedBox(
    position: THREE.Vector3,
    radius: number,
    cx: number,
    cz: number,
    halfW: number,
    halfD: number,
    cosY: number,
    sinY: number,
  ): void {
    const dx = position.x - cx;
    const dz = position.z - cz;
    const localX = dx * cosY - dz * sinY;
    const localZ = dx * sinY + dz * cosY;

    const clampedX = clamp(localX, -halfW, halfW);
    const clampedZ = clamp(localZ, -halfD, halfD);

    const diffX = localX - clampedX;
    const diffZ = localZ - clampedZ;
    const distSq = diffX * diffX + diffZ * diffZ;

    if (distSq < radius * radius) {
      let pushLocalX = 0;
      let pushLocalZ = 0;

      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        pushLocalX = (diffX / dist) * overlap;
        pushLocalZ = (diffZ / dist) * overlap;
      } else {
        const penX = halfW - Math.abs(localX) + radius;
        const penZ = halfD - Math.abs(localZ) + radius;
        if (penX < penZ) {
          pushLocalX = localX >= 0 ? penX : -penX;
        } else {
          pushLocalZ = localZ >= 0 ? penZ : -penZ;
        }
      }

      position.x += pushLocalX * cosY + pushLocalZ * sinY;
      position.z += -pushLocalX * sinY + pushLocalZ * cosY;
    }
  }

  private resolveCircle(position: THREE.Vector3, radius: number, c: CircleCollider): void {
    const dx = position.x - c.x;
    const dz = position.z - c.z;
    const minDist = c.radius + radius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = (minDist - dist) / dist;
        position.x += dx * push;
        position.z += dz * push;
      } else {
        position.x += minDist;
      }
    }
  }

  findNearestDoor(playerPos: THREE.Vector3, maxRange = 2.65): InteractiveDoor | null {
    if (!this.activeMap) return null;
    const doors = this.activeMap.doors;
    let best: InteractiveDoor | null = null;
    let bestDistSq = maxRange * maxRange;

    const stamp = ++this.queryStampCounter;
    const minGx = Math.floor((playerPos.x - maxRange) / CELL_SIZE);
    const maxGx = Math.floor((playerPos.x + maxRange) / CELL_SIZE);
    const minGz = Math.floor((playerPos.z - maxRange) / CELL_SIZE);
    const maxGz = Math.floor((playerPos.z + maxRange) / CELL_SIZE);

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const list = this.doorGrid.get(this.cellKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const idx = list[i];
          if (this.doorStamp[idx] === stamp) continue;
          this.doorStamp[idx] = stamp;

          const d = doors[idx];
          if (Math.abs(playerPos.y - d.minY) > 1.8) continue;
          const dx = d.centerX - playerPos.x;
          const dz = d.centerZ - playerPos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            best = d;
          }
        }
      }
    }

    return best;
  }

  getDoorPromptSnapshot(
    playerPos: THREE.Vector3,
    pickupKeyCode: string,
  ): DoorPromptSnapshot | null {
    const door = this.findNearestDoor(playerPos);
    if (!door) return null;
    const keyLabel = i18n.translateBindingCode(pickupKeyCode);
    const doorName = i18n.translateDoorLabel(door.label);
    const actionText = i18n.t(
      door.isOpen ? 'interact.door.close' : 'interact.door.open',
      { door: doorName },
    );
    return {
      doorId: door.id,
      label: doorName,
      isOpen: door.isOpen,
      desktopPrompt: i18n.t('interact.promptDesktop', {
        key: keyLabel,
        action: actionText,
      }),
      mobilePrompt: actionText,
    };
  }

  tryToggleNearestDoor(playerPos: THREE.Vector3): InteractiveDoor | null {
    const door = this.findNearestDoor(playerPos);
    if (!door) return null;
    door.isOpen = !door.isOpen;
    this.animatingDoors.add(door);
    if (!door.isOpen) {
      // Nudge player cleanly clear of the door leaf plane if closing while standing in the threshold
      this.resolveOrientedBox(
        playerPos,
        0.48,
        door.centerX,
        door.centerZ,
        door.halfW,
        door.halfD,
        door.cosY,
        door.sinY,
      );
      this.resolveHorizontalCollision(playerPos, 0.44);
    }
    return door;
  }

  findNearestSeat(playerPos: THREE.Vector3, maxRange = 2.05): SittableSeat | null {
    if (!this.activeMap) return null;
    const seats = this.activeMap.seats;
    if (seats.length === 0) return null;
    let best: SittableSeat | null = null;
    let bestDistSq = maxRange * maxRange;

    const stamp = ++this.queryStampCounter;
    const minGx = Math.floor((playerPos.x - maxRange) / CELL_SIZE);
    const maxGx = Math.floor((playerPos.x + maxRange) / CELL_SIZE);
    const minGz = Math.floor((playerPos.z - maxRange) / CELL_SIZE);
    const maxGz = Math.floor((playerPos.z + maxRange) / CELL_SIZE);

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const list = this.seatGrid.get(this.cellKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const idx = list[i];
          if (this.seatStamp[idx] === stamp) continue;
          this.seatStamp[idx] = stamp;

          const seat = seats[idx];
          if (Math.abs(playerPos.y - (seat.seatY - 0.45)) > 1.35) continue;
          const dx = seat.seatX - playerPos.x;
          const dz = seat.seatZ - playerPos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            best = seat;
          }
        }
      }
    }

    return best;
  }

  findNearestWindow(
    playerPos: THREE.Vector3,
    dirX?: number,
    dirZ?: number,
    maxPerpDist = 1.65,
  ): AccessibleWindow | null {
    if (!this.activeMap) return null;
    const windows = this.activeMap.windows;
    if (windows.length === 0) return null;
    let best: AccessibleWindow | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const stamp = ++this.queryStampCounter;
    const searchR = maxPerpDist + 2.2;
    const minGx = Math.floor((playerPos.x - searchR) / CELL_SIZE);
    const maxGx = Math.floor((playerPos.x + searchR) / CELL_SIZE);
    const minGz = Math.floor((playerPos.z - searchR) / CELL_SIZE);
    const maxGz = Math.floor((playerPos.z + searchR) / CELL_SIZE);

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const list = this.windowGrid.get(this.cellKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const idx = list[i];
          if (this.windowStamp[idx] === stamp) continue;
          this.windowStamp[idx] = stamp;

          const win = windows[idx];
          if (playerPos.y < win.floorY - 0.65 || playerPos.y > win.lintelBottomY - 0.65) {
            continue;
          }
          const rx = playerPos.x - win.cx;
          const rz = playerPos.z - win.cz;
          const along = rx * win.tangentX + rz * win.tangentZ;
          const across = rx * win.normalX + rz * win.normalZ;
          if (Math.abs(along) > win.halfSpan - 0.25) continue;
          const perpDist = Math.abs(across);
          if (perpDist > maxPerpDist) continue;

          // If a movement/look vector is supplied, require heading toward the window pane
          if (dirX !== undefined && dirZ !== undefined) {
            const sideSign = across >= 0 ? 1 : -1;
            const towardDot = (dirX * win.normalX + dirZ * win.normalZ) * -sideSign;
            if (towardDot < 0.28) continue;
          }

          const score = perpDist + Math.abs(along) * 0.25;
          if (score < bestScore) {
            bestScore = score;
            best = win;
          }
        }
      }
    }

    return best;
  }

  computeWindowVaultPlan(
    playerPos: THREE.Vector3,
    dirX: number,
    dirZ: number,
    maxPerpDist = 1.65,
  ): WindowVaultPlan | null {
    const win = this.findNearestWindow(playerPos, dirX, dirZ, maxPerpDist);
    if (!win || !this.activeMap) return null;

    const rx = playerPos.x - win.cx;
    const rz = playerPos.z - win.cz;
    const baseAlong = clamp(
      rx * win.tangentX + rz * win.tangentZ,
      -(win.halfSpan - 0.42),
      win.halfSpan - 0.42,
    );
    const across = rx * win.normalX + rz * win.normalZ;
    const startSide = across >= 0 ? 1 : -1;
    const targetSide = -startSide;

    const candidates: readonly (readonly [number, number])[] = [
      [0, win.halfThick + 0.78],
      [0, win.halfThick + 1.28],
      [0.44, win.halfThick + 0.88],
      [-0.44, win.halfThick + 0.88],
    ];

    let chosenPos: THREE.Vector3 | null = null;
    let chosenGroundY = win.floorY;
    let chosenAlong = baseAlong;

    for (let i = 0; i < candidates.length; i++) {
      const candAlong = clamp(
        baseAlong + candidates[i][0],
        -(win.halfSpan - 0.36),
        win.halfSpan - 0.36,
      );
      const exitOffset = candidates[i][1];
      const candX = win.cx + candAlong * win.tangentX + win.normalX * targetSide * exitOffset;
      const candZ = win.cz + candAlong * win.tangentZ + win.normalZ * targetSide * exitOffset;
      const groundY = this.getGroundHeightAt(candX, candZ, Math.max(playerPos.y, win.floorY) + 0.85);
      if (groundY < win.floorY - 4.4) continue;

      const probePos = new THREE.Vector3(candX, groundY, candZ);
      this.resolveHorizontalCollision(probePos, 0.42, 1.35);
      const finalGroundY = this.getGroundHeightAt(probePos.x, probePos.z, groundY + 0.6);
      if (finalGroundY < win.floorY - 4.4) continue;

      const endAcross =
        (probePos.x - win.cx) * win.normalX + (probePos.z - win.cz) * win.normalZ;
      if (endAcross * targetSide >= win.halfThick + 0.36) {
        chosenPos = probePos;
        chosenGroundY = finalGroundY;
        chosenAlong = candAlong;
        break;
      }
    }

    if (!chosenPos) {
      return null;
    }

    const vx = win.normalX * targetSide;
    const vz = win.normalZ * targetSide;
    const vaultYaw = Math.atan2(vx, vz);

    const sillX = win.cx + chosenAlong * win.tangentX;
    const sillY = win.sillTopY;
    const sillZ = win.cz + chosenAlong * win.tangentZ;

    // Right/left vectors perpendicular to forward (vx, 0, vz): left = (+vz, -vx), right = (-vz, +vx)
    const handHalfSpan = Math.min(0.28, Math.max(0.18, win.halfSpan * 0.38));
    const handLeftX = sillX + vz * handHalfSpan - vx * 0.04;
    const handLeftY = sillY + 0.02;
    const handLeftZ = sillZ - vx * handHalfSpan - vz * 0.04;
    const handRightX = sillX - vz * handHalfSpan - vx * 0.04;
    const handRightY = sillY + 0.02;
    const handRightZ = sillZ + vx * handHalfSpan - vz * 0.04;

    const wasBroken = win.broken || this.shatteredWindows.has(win.id);
    win.broken = true;
    this.shatteredWindows.add(win.id);
    if (win.glassMesh) {
      win.glassMesh.visible = false;
    }

    return {
      window: win,
      wasBroken,
      startX: playerPos.x,
      startY: playerPos.y,
      startZ: playerPos.z,
      apexY: Math.max(win.sillTopY + 0.36, playerPos.y + 0.58),
      endX: chosenPos.x,
      endY: chosenGroundY,
      endZ: chosenPos.z,
      vaultYaw,
      sillX,
      sillY,
      sillZ,
      handLeftX,
      handLeftY,
      handLeftZ,
      handRightX,
      handRightY,
      handRightZ,
      wallNormalX: vx,
      wallNormalZ: vz,
    };
  }

  getNearestZiplinePlan(
    playerPos: THREE.Vector3,
    lookDirX: number,
    lookDirZ: number,
    maxAttachRange = 3.4,
  ): ZiplineRidePlan | null {
    if (!this.activeMap || this.activeMap.ziplines.length === 0) return null;
    return findNearestZiplinePlan(
      this.activeMap.ziplines,
      playerPos,
      lookDirX,
      lookDirZ,
      maxAttachRange,
    );
  }

  notifyZiplineProgress(ziplineId: string, progress: number, reverse: boolean): void {
    if (!this.activeMap) return;
    const list = this.activeMap.ziplines;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.id === ziplineId) {
        const lineT = clamp(reverse ? 1 - progress : progress, 0, 1);
        z.trolleyGroup.position.lerpVectors(z.startPos, z.endPos, lineT);
        z.trolleyGroup.position.y += z.archLift * 4 * lineT * (1 - lineT);
        z.activeRiderTimer = 0.25;
        return;
      }
    }
  }

  getWorldInteractPrompt(
    playerPos: THREE.Vector3,
    pickupKeyCode: string,
    isSitting: boolean,
    lookDirX: number,
    lookDirZ: number,
    isZiplining = false,
  ): WorldInteractPrompt | null {
    const keyLabel = i18n.translateBindingCode(pickupKeyCode);
    if (isZiplining) {
      const action = i18n.t('interact.ziplineFinish');
      const spaceKey = i18n.translateBindingCode('Space');
      return {
        id: 'zipline-detach',
        kind: 'zipline',
        desktopPrompt: `[${spaceKey}] / [C] ${action}`,
        mobilePrompt: action,
      };
    }

    if (isSitting) {
      const action = i18n.t('interact.stand');
      return {
        id: 'stand-up',
        kind: 'stand',
        desktopPrompt: i18n.t('interact.promptDesktop', {
          key: keyLabel,
          action,
        }),
        mobilePrompt: action,
      };
    }

    const door = this.findNearestDoor(playerPos);
    if (door) {
      const doorName = i18n.translateDoorLabel(door.label);
      const action = i18n.t(
        door.isOpen ? 'interact.door.close' : 'interact.door.open',
        { door: doorName },
      );
      return {
        id: door.id,
        kind: 'door',
        desktopPrompt: i18n.t('interact.promptDesktop', {
          key: keyLabel,
          action,
        }),
        mobilePrompt: action,
      };
    }

    const seat = this.findNearestSeat(playerPos);
    if (seat) {
      const seatName = i18n.translateSeatLabel(seat.label);
      const action = i18n.t('interact.seat', { seat: seatName });
      return {
        id: seat.id,
        kind: 'seat',
        desktopPrompt: i18n.t('interact.promptDesktop', {
          key: keyLabel,
          action,
        }),
        mobilePrompt: action,
      };
    }

    const ziplinePlan = this.getNearestZiplinePlan(playerPos, lookDirX, lookDirZ);
    if (ziplinePlan) {
      const zipName = i18n.translateZiplineLabel(ziplinePlan.label);
      const action = i18n.t('interact.zipline', { name: zipName });
      return {
        id: ziplinePlan.ziplineId,
        kind: 'zipline',
        desktopPrompt: i18n.t('interact.promptDesktop', {
          key: keyLabel,
          action,
        }),
        mobilePrompt: action,
      };
    }

    const win = this.findNearestWindow(playerPos, lookDirX, lookDirZ, 1.65);
    if (win) {
      const action = i18n.t('interact.windowVault');
      const spaceKey = i18n.translateBindingCode('Space');
      return {
        id: win.id,
        kind: 'window',
        desktopPrompt: `[${keyLabel}] / [${spaceKey}] ${action}`,
        mobilePrompt: action,
      };
    }

    return null;
  }

  private isLootSpotClear(
    px: number,
    pz: number,
    yHint: number | undefined,
    margin = 0.44,
  ): { valid: boolean; py: number } {
    if (!this.activeMap) return { valid: true, py: 0 };

    if (!this.bounds.isInside(px, pz, 1.6)) {
      return { valid: false, py: 0 };
    }

    const queryY = yHint !== undefined ? yHint + 0.65 : undefined;
    const py = this.getGroundHeightAt(px, pz, queryY);

    // Ensure building/roof loot never falls into stairwells, off balconies, or under floors
    if (yHint !== undefined && Math.abs(py - yHint) > 0.48) {
      return { valid: false, py };
    }

    const boxes = this.activeMap.volumeColliders;
    const circles = this.activeMap.circleColliders;
    const doors = this.activeMap.doors;
    const stamp = ++this.queryStampCounter;

    const minGx = Math.floor((px - margin - 0.8) / CELL_SIZE);
    const maxGx = Math.floor((px + margin + 0.8) / CELL_SIZE);
    const minGz = Math.floor((pz - margin - 0.8) / CELL_SIZE);
    const maxGz = Math.floor((pz + margin + 0.8) / CELL_SIZE);

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const key = this.cellKey(gx, gz);

        const boxList = this.boxGrid.get(key);
        if (boxList) {
          for (let i = 0; i < boxList.length; i++) {
            const idx = boxList[i];
            if (this.boxStamp[idx] === stamp) continue;
            this.boxStamp[idx] = stamp;

            const b = boxes[idx];
            if (b.maxY <= py + 0.08 || b.minY >= py + 1.05) continue;

            const dx = px - b.cx;
            const dz = pz - b.cz;
            const localX = dx * b.cosY - dz * b.sinY;
            const localZ = dx * b.sinY + dz * b.cosY;
            if (Math.abs(localX) < b.halfW + margin && Math.abs(localZ) < b.halfD + margin) {
              return { valid: false, py };
            }
          }
        }

        const circleList = this.circleGrid.get(key);
        if (circleList) {
          for (let i = 0; i < circleList.length; i++) {
            const idx = circleList[i];
            if (this.circleStamp[idx] === stamp) continue;
            this.circleStamp[idx] = stamp;

            const c = circles[idx];
            if (c.topY <= py + 0.08) continue;
            const dx = px - c.x;
            const dz = pz - c.z;
            const minR = c.radius + margin;
            if (dx * dx + dz * dz < minR * minR) {
              return { valid: false, py };
            }
          }
        }

        const doorList = this.doorGrid.get(key);
        if (doorList) {
          for (let i = 0; i < doorList.length; i++) {
            const idx = doorList[i];
            if (this.doorStamp[idx] === stamp) continue;
            this.doorStamp[idx] = stamp;

            const d = doors[idx];
            if (d.maxY <= py + 0.1 || d.minY >= py + 1.05) continue;
            const dx = px - d.centerX;
            const dz = pz - d.centerZ;
            const localX = dx * d.cosY - dz * d.sinY;
            const localZ = dx * d.sinY + dz * d.cosY;
            if (Math.abs(localX) < d.halfW + 0.22 && Math.abs(localZ) < d.halfD + 0.55) {
              return { valid: false, py };
            }
          }
        }
      }
    }

    return { valid: true, py };
  }

  resolveSafeLootPosition(
    x: number,
    z: number,
    yHint: number | undefined,
    out: THREE.Vector3,
    fallbackX?: number,
    fallbackZ?: number,
  ): boolean {
    if (!this.activeMap) {
      out.set(x, 0, z);
      return true;
    }

    const first = this.isLootSpotClear(x, z, yHint, 0.44);
    if (first.valid) {
      out.set(x, first.py, z);
      return true;
    }

    const anchorX = fallbackX ?? x;
    const anchorZ = fallbackZ ?? z;

    if (fallbackX !== undefined && fallbackZ !== undefined) {
      const fb = this.isLootSpotClear(anchorX, anchorZ, yHint, 0.42);
      if (fb.valid) {
        out.set(anchorX, fb.py, anchorZ);
        return true;
      }
    }

    const radii = [0.55, 0.95, 1.38, 1.85];
    for (let rIdx = 0; rIdx < radii.length; rIdx++) {
      const r = radii[rIdx];
      for (let aIdx = 0; aIdx < 8; aIdx++) {
        const ang = (aIdx * Math.PI) / 4;
        const cx = anchorX + Math.cos(ang) * r;
        const cz = anchorZ + Math.sin(ang) * r;
        const check = this.isLootSpotClear(cx, cz, yHint, 0.4);
        if (check.valid) {
          out.set(cx, check.py, cz);
          return true;
        }
      }
    }

    // Last-resort push away from colliders while preserving intended floor elevation
    out.set(anchorX, yHint ?? this.getGroundHeightAt(anchorX, anchorZ), anchorZ);
    this.resolveHorizontalCollision(out, 0.46);
    const finalY = this.getGroundHeightAt(
      out.x,
      out.z,
      yHint !== undefined ? yHint + 0.65 : undefined,
    );
    out.y = finalY;
    if (yHint !== undefined && Math.abs(finalY - yHint) > 0.55) {
      return false;
    }
    return true;
  }

  hasLootLineOfSight(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean {
    if (!this.activeMap) return true;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len <= 0.4) return true;

    const invLen = 1 / len;
    const ndx = dx * invLen;
    const ndy = dy * invLen;
    const ndz = dz * invLen;

    const minGx = Math.floor(Math.min(ax, bx) / CELL_SIZE);
    const maxGx = Math.floor(Math.max(ax, bx) / CELL_SIZE);
    const minGz = Math.floor(Math.min(az, bz) / CELL_SIZE);
    const maxGz = Math.floor(Math.max(az, bz) / CELL_SIZE);

    const stamp = ++this.queryStampCounter;
    const boxes = this.activeMap.volumeColliders;
    const doors = this.activeMap.doors;
    const maxT = len - 0.08;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const key = this.cellKey(gx, gz);
        const boxList = this.boxGrid.get(key);
        if (boxList) {
          for (let i = 0; i < boxList.length; i++) {
            const idx = boxList[i];
            if (this.boxStamp[idx] === stamp) continue;
            this.boxStamp[idx] = stamp;

            const b = boxes[idx];
            // Ignore low furniture/steppable cover so loot next to beds/tables stays reachable
            if (b.maxY - b.minY <= 1.05 || b.steppable) continue;
            const hitT = this.intersectOrientedBoxRay(
              ax,
              ay,
              az,
              ndx,
              ndy,
              ndz,
              b.cx,
              b.cz,
              b.halfW,
              b.halfD,
              b.cosY,
              b.sinY,
              b.minY,
              b.maxY,
              maxT,
            );
            if (hitT !== null) return false;
          }
        }

        const doorList = this.doorGrid.get(key);
        if (doorList) {
          for (let i = 0; i < doorList.length; i++) {
            const idx = doorList[i];
            if (this.doorStamp[idx] === stamp) continue;
            this.doorStamp[idx] = stamp;

            const d = doors[idx];
            if (d.isOpen) continue;
            const hitT = this.intersectOrientedBoxRay(
              ax,
              ay,
              az,
              ndx,
              ndy,
              ndz,
              d.centerX,
              d.centerZ,
              d.halfW,
              d.halfD,
              d.cosY,
              d.sinY,
              d.minY,
              d.maxY,
              maxT,
            );
            if (hitT !== null) return false;
          }
        }
      }
    }

    return true;
  }

  hasSolidLineOfSight(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean {
    if (!this.activeMap) return true;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len <= 0.45) return true;

    const invLen = 1 / len;
    const ndx = dx * invLen;
    const ndy = dy * invLen;
    const ndz = dz * invLen;

    const minGx = Math.floor(Math.min(ax, bx) / CELL_SIZE);
    const maxGx = Math.floor(Math.max(ax, bx) / CELL_SIZE);
    const minGz = Math.floor(Math.min(az, bz) / CELL_SIZE);
    const maxGz = Math.floor(Math.max(az, bz) / CELL_SIZE);

    const stamp = ++this.queryStampCounter;
    const boxes = this.activeMap.volumeColliders;
    const surfaces = this.activeMap.walkableSurfaces;
    const circles = this.activeMap.circleColliders;
    const rocks = this.activeMap.rockColliders;
    const doors = this.activeMap.doors;
    const maxT = len - 0.12;
    const horizSq = ndx * ndx + ndz * ndz;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const key = this.cellKey(gx, gz);
        const boxList = this.boxGrid.get(key);
        if (boxList) {
          for (let i = 0; i < boxList.length; i++) {
            const idx = boxList[i];
            if (this.boxStamp[idx] === stamp) continue;
            this.boxStamp[idx] = stamp;

            const b = boxes[idx];
            const hitT = this.intersectOrientedBoxRay(
              ax,
              ay,
              az,
              ndx,
              ndy,
              ndz,
              b.cx,
              b.cz,
              b.halfW,
              b.halfD,
              b.cosY,
              b.sinY,
              b.minY,
              b.maxY,
              maxT,
            );
            if (hitT !== null) return false;
          }
        }

        const surfList = this.surfaceGrid.get(key);
        if (surfList) {
          for (let i = 0; i < surfList.length; i++) {
            const idx = surfList[i];
            if (this.surfaceStamp[idx] === stamp) continue;
            this.surfaceStamp[idx] = stamp;
            const s = surfaces[idx];
            if (s.kind !== 'slab') continue;
            const hitT = this.intersectOrientedBoxRay(
              ax,
              ay,
              az,
              ndx,
              ndy,
              ndz,
              s.cx,
              s.cz,
              s.halfW,
              s.halfD,
              s.cosY,
              s.sinY,
              s.undersideY,
              s.startY,
              maxT,
            );
            if (hitT !== null) return false;
          }
        }

        const rockList = this.rockGrid.get(key);
        if (rockList) {
          for (let i = 0; i < rockList.length; i++) {
            const idx = rockList[i];
            if (this.rockStamp[idx] === stamp) continue;
            this.rockStamp[idx] = stamp;
            if (intersectRockRay(rocks[idx], ax, ay, az, ndx, ndy, ndz, 0.08, maxT) !== null) {
              return false;
            }
          }
        }

        const doorList = this.doorGrid.get(key);
        if (doorList) {
          for (let i = 0; i < doorList.length; i++) {
            const idx = doorList[i];
            if (this.doorStamp[idx] === stamp) continue;
            this.doorStamp[idx] = stamp;

            const d = doors[idx];
            if (d.isOpen) continue;
            const hitT = this.intersectOrientedBoxRay(
              ax,
              ay,
              az,
              ndx,
              ndy,
              ndz,
              d.centerX,
              d.centerZ,
              d.halfW,
              d.halfD,
              d.cosY,
              d.sinY,
              d.minY,
              d.maxY,
              maxT,
            );
            if (hitT !== null) return false;
          }
        }

        if (horizSq > 1e-6) {
          const circleList = this.circleGrid.get(key);
          if (circleList) {
            for (let i = 0; i < circleList.length; i++) {
              const idx = circleList[i];
              if (this.circleStamp[idx] === stamp) continue;
              this.circleStamp[idx] = stamp;

              const c = circles[idx];
              const rx = ax - c.x;
              const rz = az - c.z;
              const bDot = rx * ndx + rz * ndz;
              const cc = rx * rx + rz * rz - c.radius * c.radius;
              const disc = bDot * bDot - horizSq * cc;
              if (disc < 0) continue;
              const hitT = (-bDot - Math.sqrt(disc)) / horizSq;
              if (hitT >= 0.1 && hitT <= maxT) {
                const hitY = ay + ndy * hitT;
                if (hitY <= c.topY) return false;
              }
            }
          }
        }
      }
    }

    const steps = Math.min(48, Math.max(4, Math.ceil(len / 3)));
    for (let s = 1; s < steps; s++) {
      const t = (s / steps) * len;
      const sx = ax + ndx * t;
      const sy = ay + ndy * t;
      const sz = az + ndz * t;
      if (sy < this.activeMap.getBaseTerrainY(sx, sz) + 0.08) {
        return false;
      }
    }

    return true;
  }

  getSafeCameraDistance(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    right: THREE.Vector3,
    up: THREE.Vector3,
    probeCount?: number,
  ): number {
    if (!this.activeMap || maxDistance <= 0.18) return maxDistance;

    const endX = origin.x + direction.x * maxDistance;
    const endZ = origin.z + direction.z * maxDistance;
    const minX = Math.min(origin.x, endX) - 0.55;
    const maxX = Math.max(origin.x, endX) + 0.55;
    const minZ = Math.min(origin.z, endZ) - 0.55;
    const maxZ = Math.max(origin.z, endZ) + 0.55;

    const minGx = Math.floor(minX / CELL_SIZE);
    const maxGx = Math.floor(maxX / CELL_SIZE);
    const minGz = Math.floor(minZ / CELL_SIZE);
    const maxGz = Math.floor(maxZ / CELL_SIZE);

    const stamp = ++this.queryStampCounter;
    const boxes = this.activeMap.volumeColliders;
    const surfaces = this.activeMap.walkableSurfaces;
    const circles = this.activeMap.circleColliders;
    const rocks = this.activeMap.rockColliders;
    const doors = this.activeMap.doors;

    const boxCand = this.camBoxCandidates;
    const slabCand = this.camSlabCandidates;
    const circleCand = this.camCircleCandidates;
    const rockCand = this.camRockCandidates;
    const doorCand = this.camDoorCandidates;
    boxCand.length = 0;
    slabCand.length = 0;
    circleCand.length = 0;
    rockCand.length = 0;
    doorCand.length = 0;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const key = this.cellKey(gx, gz);
        const boxList = this.boxGrid.get(key);
        if (boxList) {
          for (let i = 0; i < boxList.length; i++) {
            const idx = boxList[i];
            if (this.boxStamp[idx] !== stamp) {
              this.boxStamp[idx] = stamp;
              boxCand.push(idx);
            }
          }
        }
        const surfList = this.surfaceGrid.get(key);
        if (surfList) {
          for (let i = 0; i < surfList.length; i++) {
            const idx = surfList[i];
            if (this.surfaceStamp[idx] !== stamp && surfaces[idx].kind === 'slab') {
              this.surfaceStamp[idx] = stamp;
              slabCand.push(idx);
            }
          }
        }
        const circleList = this.circleGrid.get(key);
        if (circleList) {
          for (let i = 0; i < circleList.length; i++) {
            const idx = circleList[i];
            if (this.circleStamp[idx] !== stamp) {
              this.circleStamp[idx] = stamp;
              circleCand.push(idx);
            }
          }
        }
        const rockList = this.rockGrid.get(key);
        if (rockList) {
          for (let i = 0; i < rockList.length; i++) {
            const idx = rockList[i];
            if (this.rockStamp[idx] !== stamp) {
              this.rockStamp[idx] = stamp;
              rockCand.push(idx);
            }
          }
        }
        const doorList = this.doorGrid.get(key);
        if (doorList) {
          for (let i = 0; i < doorList.length; i++) {
            const idx = doorList[i];
            if (this.doorStamp[idx] !== stamp && !doors[idx].isOpen) {
              this.doorStamp[idx] = stamp;
              doorCand.push(idx);
            }
          }
        }
      }
    }

    let safeDistance = maxDistance;
    const defaultProbes = this.qualityPreset === 'high' ? CAMERA_PROBE_OFFSETS.length : 3;
    const activeProbes = Math.min(
      CAMERA_PROBE_OFFSETS.length,
      Math.max(1, probeCount ?? defaultProbes),
    );
    const hasGeometryCands =
      boxCand.length > 0 ||
      slabCand.length > 0 ||
      doorCand.length > 0 ||
      circleCand.length > 0 ||
      rockCand.length > 0;

    if (hasGeometryCands) {
      const horizSq = direction.x * direction.x + direction.z * direction.z;
      for (let p = 0; p < activeProbes; p++) {
        const ox = CAMERA_PROBE_OFFSETS[p][0];
        const oy = CAMERA_PROBE_OFFSETS[p][1];
        const px = origin.x + right.x * ox + up.x * oy;
        const py = origin.y + right.y * ox + up.y * oy;
        const pz = origin.z + right.z * ox + up.z * oy;

        for (let i = 0; i < boxCand.length; i++) {
          const b = boxes[boxCand[i]];
          const hitT = this.intersectOrientedBoxRay(
            px,
            py,
            pz,
            direction.x,
            direction.y,
            direction.z,
            b.cx,
            b.cz,
            b.halfW,
            b.halfD,
            b.cosY,
            b.sinY,
            b.minY,
            b.maxY,
            safeDistance + 0.28,
          );
          if (hitT !== null) {
            const candSafe = clamp(hitT - 0.26, 0.18, maxDistance);
            if (candSafe < safeDistance) safeDistance = candSafe;
          }
        }

        for (let i = 0; i < slabCand.length; i++) {
          const s = surfaces[slabCand[i]];
          const hitT = this.intersectOrientedBoxRay(
            px,
            py,
            pz,
            direction.x,
            direction.y,
            direction.z,
            s.cx,
            s.cz,
            s.halfW,
            s.halfD,
            s.cosY,
            s.sinY,
            s.undersideY,
            s.startY,
            safeDistance + 0.28,
          );
          if (hitT !== null) {
            const candSafe = clamp(hitT - 0.26, 0.18, maxDistance);
            if (candSafe < safeDistance) safeDistance = candSafe;
          }
        }

        for (let i = 0; i < doorCand.length; i++) {
          const d = doors[doorCand[i]];
          const hitT = this.intersectOrientedBoxRay(
            px,
            py,
            pz,
            direction.x,
            direction.y,
            direction.z,
            d.centerX,
            d.centerZ,
            d.halfW,
            d.halfD,
            d.cosY,
            d.sinY,
            d.minY,
            d.maxY,
            safeDistance + 0.28,
          );
          if (hitT !== null) {
            const candSafe = clamp(hitT - 0.26, 0.18, maxDistance);
            if (candSafe < safeDistance) safeDistance = candSafe;
          }
        }

        for (let i = 0; i < rockCand.length; i++) {
          const hitT = intersectRockRay(
            rocks[rockCand[i]],
            px,
            py,
            pz,
            direction.x,
            direction.y,
            direction.z,
            0.05,
            safeDistance + 0.28,
          );
          if (hitT !== null) {
            const candSafe = clamp(hitT - 0.26, 0.18, maxDistance);
            if (candSafe < safeDistance) safeDistance = candSafe;
          }
        }

        if (horizSq > 1e-6) {
          for (let i = 0; i < circleCand.length; i++) {
            const c = circles[circleCand[i]];
            const rx = px - c.x;
            const rz = pz - c.z;
            const bDot = rx * direction.x + rz * direction.z;
            const cc = rx * rx + rz * rz - c.radius * c.radius;
            const disc = bDot * bDot - horizSq * cc;
            if (disc < 0) continue;
            const sqrtD = Math.sqrt(disc);
            let hitT = (-bDot - sqrtD) / horizSq;
            if (hitT < 0.06) {
              const exitT = (-bDot + sqrtD) / horizSq;
              if (exitT > 0.06 && py + direction.y * 0.06 <= c.topY) {
                hitT = 0.06;
              } else {
                continue;
              }
            }
            if (hitT <= safeDistance + 0.28 && py + direction.y * hitT <= c.topY) {
              const candSafe = clamp(hitT - 0.26, 0.18, maxDistance);
              if (candSafe < safeDistance) safeDistance = candSafe;
            }
          }
        }
      }
    }

    // Also clamp against base terrain height hills along the center ray
    const terrainStep = 0.45;
    for (let t = terrainStep; t <= safeDistance; t += terrainStep) {
      const tx = origin.x + direction.x * t;
      const ty = origin.y + direction.y * t;
      const tz = origin.z + direction.z * t;
      const floorY = this.activeMap.getBaseTerrainY(tx, tz) + 0.24;
      if (ty < floorY) {
        safeDistance = clamp(t - 0.28, 0.18, safeDistance);
        break;
      }
    }

    return safeDistance;
  }

  private rayHitNx = 0;
  private rayHitNy = 1;
  private rayHitNz = 0;

  /**
   * High-speed analytical raycast using 2D spatial grid DDA + procedural terrain raymarch
   * instead of brute-force 25,000-triangle terrain CPU mesh intersection.
   */
  raycastEnvironment(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    near: number,
    far: number,
    outPoint: THREE.Vector3 | null,
    outNormal: THREE.Vector3 | null,
  ): number {
    const activeMap = this.activeMap;
    if (!activeMap || far <= near) return Number.POSITIVE_INFINITY;

    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;

    const minT = Math.max(0.02, near);
    let bestT = far + 1;
    let found = false;
    let bestNx = 0;
    let bestNy = 1;
    let bestNz = 0;

    const boxes = activeMap.volumeColliders;
    const surfaces = activeMap.walkableSurfaces;
    const circles = activeMap.circleColliders;
    const rocks = activeMap.rockColliders;
    const doors = activeMap.doors;
    const rockHitNormal = { nx: 0, ny: 1, nz: 0 };

    const stamp = ++this.queryStampCounter;
    const horizSq = dx * dx + dz * dz;

    // 2D Amanatides-Woo grid DDA across 16m spatial cells with early exit
    let tCurr = minT;
    const startX = ox + dx * tCurr;
    const startZ = oz + dz * tCurr;
    let gx = Math.floor(startX / CELL_SIZE);
    let gz = Math.floor(startZ / CELL_SIZE);

    const stepX = dx > 1e-6 ? 1 : dx < -1e-6 ? -1 : 0;
    const stepZ = dz > 1e-6 ? 1 : dz < -1e-6 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? CELL_SIZE / Math.abs(dx) : Number.POSITIVE_INFINITY;
    const tDeltaZ = stepZ !== 0 ? CELL_SIZE / Math.abs(dz) : Number.POSITIVE_INFINITY;
    let tMaxX =
      stepX !== 0 ? tCurr + ((gx + (stepX > 0 ? 1 : 0)) * CELL_SIZE - startX) / dx : Number.POSITIVE_INFINITY;
    let tMaxZ =
      stepZ !== 0 ? tCurr + ((gz + (stepZ > 0 ? 1 : 0)) * CELL_SIZE - startZ) / dz : Number.POSITIVE_INFINITY;

    for (let iter = 0; iter < 96 && tCurr <= Math.min(far, bestT); iter++) {
      const key = this.cellKey(gx, gz);
      const searchMax = Math.min(far, bestT);

      const boxList = this.boxGrid.get(key);
      if (boxList) {
        for (let i = 0; i < boxList.length; i++) {
          const idx = boxList[i];
          if (this.boxStamp[idx] === stamp) continue;
          this.boxStamp[idx] = stamp;
          const b = boxes[idx];
          const hitT = this.intersectOrientedBoxRayWithNormal(
            ox, oy, oz, dx, dy, dz,
            b.cx, b.cz, b.halfW, b.halfD, b.cosY, b.sinY,
            b.minY, b.maxY, minT, searchMax,
          );
          if (hitT !== null && hitT < bestT) {
            bestT = hitT;
            found = true;
            bestNx = this.rayHitNx;
            bestNy = this.rayHitNy;
            bestNz = this.rayHitNz;
          }
        }
      }

      const surfList = this.surfaceGrid.get(key);
      if (surfList) {
        for (let i = 0; i < surfList.length; i++) {
          const idx = surfList[i];
          if (this.surfaceStamp[idx] === stamp) continue;
          this.surfaceStamp[idx] = stamp;
          const s = surfaces[idx];
          const topY = s.kind === 'slab' ? s.startY : Math.max(s.startY, s.endY);
          const hitT = this.intersectOrientedBoxRayWithNormal(
            ox, oy, oz, dx, dy, dz,
            s.cx, s.cz, s.halfW, s.halfD, s.cosY, s.sinY,
            s.undersideY, topY, minT, searchMax,
          );
          if (hitT !== null && hitT < bestT) {
            bestT = hitT;
            found = true;
            bestNx = this.rayHitNx;
            bestNy = this.rayHitNy;
            bestNz = this.rayHitNz;
          }
        }
      }

      const doorList = this.doorGrid.get(key);
      if (doorList) {
        for (let i = 0; i < doorList.length; i++) {
          const idx = doorList[i];
          if (this.doorStamp[idx] === stamp) continue;
          this.doorStamp[idx] = stamp;
          const d = doors[idx];
          if (d.isOpen) continue;
          const hitT = this.intersectOrientedBoxRayWithNormal(
            ox, oy, oz, dx, dy, dz,
            d.centerX, d.centerZ, d.halfW, d.halfD, d.cosY, d.sinY,
            d.minY, d.maxY, minT, searchMax,
          );
          if (hitT !== null && hitT < bestT) {
            bestT = hitT;
            found = true;
            bestNx = this.rayHitNx;
            bestNy = this.rayHitNy;
            bestNz = this.rayHitNz;
          }
        }
      }

      const rockList = this.rockGrid.get(key);
      if (rockList) {
        for (let i = 0; i < rockList.length; i++) {
          const idx = rockList[i];
          if (this.rockStamp[idx] === stamp) continue;
          this.rockStamp[idx] = stamp;
          const hitT = intersectRockRay(
            rocks[idx],
            ox,
            oy,
            oz,
            dx,
            dy,
            dz,
            minT,
            Math.min(searchMax, bestT),
            outNormal ? rockHitNormal : undefined,
          );
          if (hitT !== null && hitT < bestT) {
            bestT = hitT;
            found = true;
            if (outNormal) {
              bestNx = rockHitNormal.nx;
              bestNy = rockHitNormal.ny;
              bestNz = rockHitNormal.nz;
            }
          }
        }
      }

      if (horizSq > 1e-6) {
        const circleList = this.circleGrid.get(key);
        if (circleList) {
          for (let i = 0; i < circleList.length; i++) {
            const idx = circleList[i];
            if (this.circleStamp[idx] === stamp) continue;
            this.circleStamp[idx] = stamp;
            const c = circles[idx];
            const rx = ox - c.x;
            const rz = oz - c.z;
            const bDot = rx * dx + rz * dz;
            const cc = rx * rx + rz * rz - c.radius * c.radius;
            const disc = bDot * bDot - horizSq * cc;
            if (disc < 0) continue;
            const sqrtD = Math.sqrt(disc);
            const hitT = (-bDot - sqrtD) / horizSq;
            if (hitT >= minT && hitT < Math.min(searchMax, bestT)) {
              const hitY = oy + dy * hitT;
              if (hitY <= c.topY && hitY >= c.topY - 12) {
                bestT = hitT;
                found = true;
                const invR = 1 / Math.max(0.01, c.radius);
                bestNx = (ox + dx * hitT - c.x) * invR;
                bestNy = 0;
                bestNz = (oz + dz * hitT - c.z) * invR;
              }
            }
          }
        }
      }

      const nextT = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      if ((found && bestT <= nextT) || nextT > far) {
        break;
      }
      if (tMaxX < tMaxZ) {
        tCurr = tMaxX;
        tMaxX += tDeltaX;
        gx += stepX;
      } else {
        tCurr = tMaxZ;
        tMaxZ += tDeltaZ;
        gz += stepZ;
      }
    }

    // Check central spawn pad disc at y=0.24
    if (dy < -1e-4) {
      const padT = (0.24 - oy) / dy;
      if (padT >= minT && padT < Math.min(far, bestT)) {
        const px = ox + dx * padT;
        const pz = oz + dz * padT;
        const padRadius =
          activeMap.config.isWaitingArena || activeMap.config.isTrainingGround ? 0 : 5.8;
        if (padRadius > 0 && px * px + pz * pz <= padRadius * padRadius) {
          bestT = padT;
          found = true;
          bestNx = 0;
          bestNy = 1;
          bestNz = 0;
        }
      }
    }

    // Raymarch exact procedural terrain from minT to min(far, bestT)
    const terrainLimit = found ? Math.min(far, bestT) : far;
    if (terrainLimit > minT) {
      let prevT = minT;
      let prevBelow =
        oy + dy * prevT <= activeMap.getBaseTerrainY(ox + dx * prevT, oz + dz * prevT) + 0.02;

      if (prevBelow && near <= 0.1) {
        bestT = prevT;
        found = true;
        bestNx = 0;
        bestNy = 1;
        bestNz = 0;
      } else {
        let t = minT;
        while (t < terrainLimit) {
          const step = t < 48 ? 2.2 : t < 140 ? 4.5 : 7.5;
          const nextT = Math.min(terrainLimit, t + step);
          const sx = ox + dx * nextT;
          const sy = oy + dy * nextT;
          const sz = oz + dz * nextT;
          const groundY = activeMap.getBaseTerrainY(sx, sz);

          if (sy <= groundY + 0.02) {
            // 5-step binary refinement gives <0.05m intersection accuracy
            let lo = prevT;
            let hi = nextT;
            for (let b = 0; b < 5; b++) {
              const mid = (lo + hi) * 0.5;
              const mx = ox + dx * mid;
              const my = oy + dy * mid;
              const mz = oz + dz * mid;
              if (my <= activeMap.getBaseTerrainY(mx, mz) + 0.01) {
                hi = mid;
              } else {
                lo = mid;
              }
            }
            if (hi < bestT) {
              bestT = hi;
              found = true;
              if (outNormal) {
                const hx = ox + dx * hi;
                const hz = oz + dz * hi;
                const eps = 0.4;
                const hL = activeMap.getBaseTerrainY(hx - eps, hz);
                const hR = activeMap.getBaseTerrainY(hx + eps, hz);
                const hD = activeMap.getBaseTerrainY(hx, hz - eps);
                const hU = activeMap.getBaseTerrainY(hx, hz + eps);
                const nx = hL - hR;
                const ny = 2 * eps;
                const nz = hD - hU;
                const nLen = Math.hypot(nx, ny, nz) || 1;
                bestNx = nx / nLen;
                bestNy = ny / nLen;
                bestNz = nz / nLen;
              }
            }
            break;
          }

          prevT = nextT;
          t = nextT;
        }
      }
    }

    if (!found || bestT > far) {
      return Number.POSITIVE_INFINITY;
    }

    if (outPoint) {
      outPoint.set(ox + dx * bestT, oy + dy * bestT, oz + dz * bestT);
    }
    if (outNormal) {
      outNormal.set(bestNx, bestNy, bestNz).normalize();
    }
    return bestT;
  }

  private intersectOrientedBoxRayWithNormal(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    cx: number,
    cz: number,
    halfW: number,
    halfD: number,
    cosY: number,
    sinY: number,
    minY: number,
    maxY: number,
    minT: number,
    maxT: number,
  ): number | null {
    const relX = ox - cx;
    const relZ = oz - cz;
    const lox = relX * cosY - relZ * sinY;
    const loz = relX * sinY + relZ * cosY;
    const ldx = dx * cosY - dz * sinY;
    const ldz = dx * sinY + dz * cosY;

    let tMin = minT;
    let tMax = maxT;
    let hitAxis = -1;
    let hitSign = 1;

    if (Math.abs(ldx) < 1e-6) {
      if (lox < -halfW || lox > halfW) return null;
    } else {
      const inv = 1 / ldx;
      let t1 = (-halfW - lox) * inv;
      let t2 = (halfW - lox) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = 0;
        hitSign = s;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    if (Math.abs(dy) < 1e-6) {
      if (oy < minY || oy > maxY) return null;
    } else {
      const inv = 1 / dy;
      let t1 = (minY - oy) * inv;
      let t2 = (maxY - oy) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = 1;
        hitSign = s;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    if (Math.abs(ldz) < 1e-6) {
      if (loz < -halfD || loz > halfD) return null;
    } else {
      const inv = 1 / ldz;
      let t1 = (-halfD - loz) * inv;
      let t2 = (halfD - loz) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = 2;
        hitSign = s;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    if (tMin > tMax || tMin < minT || tMin > maxT) return null;

    if (hitAxis === 0) {
      this.rayHitNx = hitSign * cosY;
      this.rayHitNy = 0;
      this.rayHitNz = -hitSign * sinY;
    } else if (hitAxis === 1) {
      this.rayHitNx = 0;
      this.rayHitNy = hitSign;
      this.rayHitNz = 0;
    } else if (hitAxis === 2) {
      this.rayHitNx = hitSign * sinY;
      this.rayHitNy = 0;
      this.rayHitNz = hitSign * cosY;
    } else {
      this.rayHitNx = -dx;
      this.rayHitNy = -dy;
      this.rayHitNz = -dz;
    }

    return tMin;
  }

  private intersectOrientedBoxRay(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    cx: number,
    cz: number,
    halfW: number,
    halfD: number,
    cosY: number,
    sinY: number,
    minY: number,
    maxY: number,
    maxT: number,
  ): number | null {
    const relX = ox - cx;
    const relZ = oz - cz;
    const lox = relX * cosY - relZ * sinY;
    const loz = relX * sinY + relZ * cosY;
    const ldx = dx * cosY - dz * sinY;
    const ldz = dx * sinY + dz * cosY;

    let tMin = 0.06;
    let tMax = maxT;

    if (Math.abs(ldx) < 1e-6) {
      if (lox < -halfW || lox > halfW) return null;
    } else {
      const inv = 1 / ldx;
      let t1 = (-halfW - lox) * inv;
      let t2 = (halfW - lox) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    if (Math.abs(dy) < 1e-6) {
      if (oy < minY || oy > maxY) return null;
    } else {
      const inv = 1 / dy;
      let t1 = (minY - oy) * inv;
      let t2 = (maxY - oy) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    if (Math.abs(ldz) < 1e-6) {
      if (loz < -halfD || loz > halfD) return null;
    } else {
      const inv = 1 / ldz;
      let t1 = (-halfD - loz) * inv;
      let t2 = (halfD - loz) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    return tMin <= tMax && tMin >= 0.06 && tMin <= maxT ? tMin : null;
  }

  getCameraCollisionMeshes(): readonly THREE.Object3D[] {
    return this.activeMap ? this.activeMap.cameraCollisionMeshes : [];
  }

  setShopAccent(hex: string): void {
    if (!this.activeMap) return;
    this.activeMap.shopAccentMat.color.set(hex);
    this.activeMap.shopAccentMat.emissive.set(hex);
  }

  private rankedZoneOverride: {
    safeCenterX: number;
    safeCenterZ: number;
    safeRadius: number;
    nextSafeCenterX: number;
    nextSafeCenterZ: number;
    nextSafeRadius: number;
  } | null = null;

  setRankedZoneState(
    zone: {
      currentCenterX: number;
      currentCenterZ: number;
      currentRadius: number;
      nextCenterX: number;
      nextCenterZ: number;
      nextRadius: number;
    } | null,
  ): void {
    if (!zone) {
      this.rankedZoneOverride = null;
      return;
    }
    this.rankedZoneOverride = {
      safeCenterX: zone.currentCenterX,
      safeCenterZ: zone.currentCenterZ,
      safeRadius: zone.currentRadius,
      nextSafeCenterX: zone.nextCenterX,
      nextSafeCenterZ: zone.nextCenterZ,
      nextSafeRadius: zone.nextRadius,
    };
  }

  setTeammateMarkers(markers: MinimapMarker[]): void {
    this.teammateMarkers = markers;
  }

  setEnemyMarkers(markers: MinimapMarker[]): void {
    this.enemyMarkers = markers;
  }

  getActiveSafeZoneCenter(out: { x: number; z: number }): void {
    const config = this.getActiveConfig();
    const z = config.zoneConfig;
    out.x = this.rankedZoneOverride?.safeCenterX ?? z.initialSafeCenterX;
    out.z = this.rankedZoneOverride?.safeCenterZ ?? z.initialSafeCenterZ;
  }

  getMinimapSnapshot(
    playerX: number,
    playerZ: number,
    playerDirectionRad: number,
    flightOverlay?: FlightMinimapOverlay,
  ): MinimapSnapshot {
    const config = this.getActiveConfig();
    const z = config.zoneConfig;
    const safeCenterX = this.rankedZoneOverride?.safeCenterX ?? z.initialSafeCenterX;
    const safeCenterZ = this.rankedZoneOverride?.safeCenterZ ?? z.initialSafeCenterZ;
    const safeRadius = this.rankedZoneOverride?.safeRadius ?? z.initialSafeRadius;
    const nextSafeCenterX = this.rankedZoneOverride?.nextSafeCenterX ?? z.nextSafeCenterX;
    const nextSafeCenterZ = this.rankedZoneOverride?.nextSafeCenterZ ?? z.nextSafeCenterZ;
    const nextSafeRadius = this.rankedZoneOverride?.nextSafeRadius ?? z.nextSafeRadius;

    const distFromSafe = Math.hypot(playerX - safeCenterX, playerZ - safeCenterZ);

    const out = this.minimapSnapshotScratch;
    out.config = config;
    out.playerX = playerX;
    out.playerZ = playerZ;
    out.playerDirectionRad = playerDirectionRad;
    out.safeCenterX = safeCenterX;
    out.safeCenterZ = safeCenterZ;
    out.safeRadius = safeRadius;
    out.nextSafeCenterX = nextSafeCenterX;
    out.nextSafeCenterZ = nextSafeCenterZ;
    out.nextSafeRadius = nextSafeRadius;
    out.inDangerZone =
      config.isWaitingArena || config.isTrainingGround ? false : distFromSafe > safeRadius;
    out.teammateMarkers = this.teammateMarkers;
    out.enemyMarkers = this.enemyMarkers;
    out.flightOverlay = flightOverlay;
    out.hideZoneOverlay = Boolean(config.isWaitingArena || config.isTrainingGround);
    return out;
  }

  update(deltaSeconds: number, elapsedSeconds: number): void {
    this.skyWeather.update(deltaSeconds, elapsedSeconds);
    if (!this.activeMap) return;
    const fog = this.sceneManager.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      const nextDensity =
        this.activeMap.config.theme.fogDensity *
        this.getQualityFogMultiplier() *
        this.airborneFogScale *
        this.skyWeather.getFogDensityMultiplier();
      if (Math.abs(nextDensity - this.lastAppliedFogDensity) > 1e-7) {
        this.lastAppliedFogDensity = nextDensity;
        fog.density = nextDensity;
      }
    }
    this.activeMap.beaconRingOuter.rotation.y += deltaSeconds * 0.7;
    this.activeMap.beaconRingOuter.rotation.x = Math.sin(elapsedSeconds * 0.8) * 0.25;
    this.activeMap.beaconRingInner.rotation.z -= deltaSeconds * 1.1;
    this.activeMap.beaconRingInner.rotation.y -= deltaSeconds * 0.45;
    this.activeMap.beaconCore.rotation.y += deltaSeconds * 1.4;
    this.activeMap.beaconCore.position.y = 3.15 + Math.sin(elapsedSeconds * 2.2) * 0.14;

    this.activeMap.updateDynamicElements?.(deltaSeconds, elapsedSeconds);

    if (this.animatingDoors.size > 0) {
      for (const d of this.animatingDoors) {
        const targetAngle = d.isOpen ? Math.PI * 0.52 : 0;
        if (Math.abs(d.currentAngle - targetAngle) > 0.002) {
          d.currentAngle = damp(d.currentAngle, targetAngle, 14, deltaSeconds);
          d.pivotGroup.rotation.y = d.baseYaw + d.currentAngle * d.swingSign;
        } else {
          d.currentAngle = targetAngle;
          d.pivotGroup.rotation.y = d.baseYaw + targetAngle * d.swingSign;
          this.animatingDoors.delete(d);
        }
      }
    }
  }

  dispose(): void {
    this.skyWeather.dispose();
    if (this.activeMap) {
      this.root.remove(this.activeMap.root);
      this.activeMap.dispose();
      this.activeMap = null;
    }
    this.loader.dispose();
    this.boxGrid.clear();
    this.surfaceGrid.clear();
    this.circleGrid.clear();
    this.roadGrid.clear();
    this.doorGrid.clear();
    this.windowGrid.clear();
    this.seatGrid.clear();
    this.animatingDoors.clear();
    this.visibleDoors.clear();
    this.nextVisibleDoors.clear();
    this.lastAppliedFogDensity = -1;
    this.shatteredWindows.clear();
    this.combinedLootPointsCache = [];
    this.teammateMarkers = [];
    this.enemyMarkers = [];
  }
}
