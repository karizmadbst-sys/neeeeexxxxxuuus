import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { BiomeType, LootPoint, LootTier } from './IMapSystem';
import type { BuildingSpec } from './MapData';

export type BuildingMaterialBucket =
  | 'masonry'
  | 'wood'
  | 'metal'
  | 'fabric'
  | 'glowCyan'
  | 'glowAmber'
  | 'glass';

export interface OrientedVolumeCollider {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  cosY: number;
  sinY: number;
  minY: number;
  maxY: number;
  steppable: boolean;
}

export interface WalkableSurface {
  kind: 'slab' | 'stair';
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  cosY: number;
  sinY: number;
  /** Slab surface Y (for 'slab'), or start Y at local -halfD (for 'stair'). */
  startY: number;
  /** Slab surface Y (for 'slab'), or end Y at local +halfD (for 'stair'). */
  endY: number;
  /** Min Y of the slab underside (used for indoor ceiling head-clearance). */
  undersideY: number;
  /** Optional discrete step count for staircases so physics matches exact step tread tops. */
  stairSteps?: number;
}

export function evaluateWalkableSurfaceY(s: WalkableSurface, localZ: number): number {
  if (s.kind !== 'stair') return s.startY;
  const span = Math.max(0.01, s.halfD * 2);
  const t = Math.max(0, Math.min(1, (localZ + s.halfD) / span));
  if (s.stairSteps && s.stairSteps > 0) {
    const stepIdx = Math.min(s.stairSteps - 1, Math.floor(t * s.stairSteps));
    return s.startY + ((stepIdx + 1) / s.stairSteps) * (s.endY - s.startY);
  }
  return s.startY + t * (s.endY - s.startY);
}

export interface InteractiveDoor {
  id: string;
  label: string;
  pivotGroup: THREE.Group;
  leafMesh: THREE.Mesh;
  centerX: number;
  centerZ: number;
  halfW: number;
  halfD: number;
  cosY: number;
  sinY: number;
  minY: number;
  maxY: number;
  baseYaw: number;
  swingSign: number;
  isOpen: boolean;
  currentAngle: number;
}

export interface BuildingSectorEntry {
  mesh: THREE.Object3D;
  isDecorative: boolean;
  isDetailOnly?: boolean;
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
}

export interface AccessibleWindow {
  id: string;
  cx: number;
  cz: number;
  floorY: number;
  sillTopY: number;
  lintelBottomY: number;
  halfSpan: number;
  halfThick: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  broken: boolean;
  glassMesh?: THREE.Mesh;
}

export interface SittableSeat {
  id: string;
  label: string;
  seatX: number;
  seatY: number;
  seatZ: number;
  facingYaw: number;
  standX: number;
  standZ: number;
}

export interface BuildingOccluder {
  cx: number;
  cz: number;
  radius: number;
  topY: number;
}

export interface BuildingBuildOptions {
  compactTextures?: boolean;
  skipRoughnessMaps?: boolean;
}

export interface BuildingBuildResult {
  root: THREE.Group;
  structuralMeshes: THREE.Mesh[];
  decorativeMeshes: THREE.Mesh[];
  sectorEntries: BuildingSectorEntry[];
  buildingOccluders: BuildingOccluder[];
  doorLeafMeshes: THREE.Mesh[];
  volumeColliders: OrientedVolumeCollider[];
  walkableSurfaces: WalkableSurface[];
  doors: InteractiveDoor[];
  windows: AccessibleWindow[];
  seats: SittableSeat[];
  lootPoints: LootPoint[];
  dispose: () => void;
}

interface Palette {
  wallOuter: string;
  wallInner: string;
  floor: string;
  upperFloor: string;
  roof: string;
  trim: string;
  wood: string;
  woodDark: string;
  metal: string;
  fabricA: string;
  fabricB: string;
  fabricC: string;
}

const FLOOR_HEIGHT = 3.9;
const SLAB_THICK = 0.22;
const WALL_THICK = 0.24;
const PART_THICK = 0.18;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_POS = UNIT_BOX.attributes.position.array as Float32Array;
const UNIT_NORM = UNIT_BOX.attributes.normal.array as Float32Array;
const UNIT_UV = UNIT_BOX.attributes.uv.array as Float32Array;
const UNIT_INDEX = UNIT_BOX.index!.array;
const UNIT_VERT_COUNT = 24;
const UNIT_INDEX_COUNT = 36;

const SCRATCH_COLOR = new THREE.Color();
const COLOR_RGB_CACHE = new Map<string, [number, number, number]>();

function getCachedRgb(hex: string): [number, number, number] {
  let rgb = COLOR_RGB_CACHE.get(hex);
  if (!rgb) {
    SCRATCH_COLOR.set(hex);
    rgb = [SCRATCH_COLOR.r, SCRATCH_COLOR.g, SCRATCH_COLOR.b];
    COLOR_RGB_CACHE.set(hex, rgb);
  }
  return rgb;
}

class BoxGeometryAccumulator {
  private vertCap: number;
  private vertCount = 0;
  private indexCount = 0;
  private positions: Float32Array;
  private normals: Float32Array;
  private uvs: Float32Array;
  private colors: Float32Array;
  private indices: Uint32Array;

  constructor(initialBoxes = 64) {
    this.vertCap = initialBoxes * UNIT_VERT_COUNT;
    const maxIdx = initialBoxes * UNIT_INDEX_COUNT;
    this.positions = new Float32Array(this.vertCap * 3);
    this.normals = new Float32Array(this.vertCap * 3);
    this.uvs = new Float32Array(this.vertCap * 2);
    this.colors = new Float32Array(this.vertCap * 3);
    this.indices = new Uint32Array(maxIdx);
  }

  get hasGeometry(): boolean {
    return this.vertCount > 0;
  }

  private ensureCapacity(): void {
    if (this.vertCount + UNIT_VERT_COUNT <= this.vertCap) return;
    const nextVertCap = this.vertCap * 2;
    const nextPos = new Float32Array(nextVertCap * 3);
    nextPos.set(this.positions);
    this.positions = nextPos;

    const nextNorm = new Float32Array(nextVertCap * 3);
    nextNorm.set(this.normals);
    this.normals = nextNorm;

    const nextUv = new Float32Array(nextVertCap * 2);
    nextUv.set(this.uvs);
    this.uvs = nextUv;

    const nextCol = new Float32Array(nextVertCap * 3);
    nextCol.set(this.colors);
    this.colors = nextCol;

    const nextIdxCap = (nextVertCap / UNIT_VERT_COUNT) * UNIT_INDEX_COUNT;
    const nextIdx = new Uint32Array(nextIdxCap);
    nextIdx.set(this.indices);
    this.indices = nextIdx;

    this.vertCap = nextVertCap;
  }

  appendBox(
    wx: number,
    wy: number,
    wz: number,
    w: number,
    h: number,
    d: number,
    cosY: number,
    sinY: number,
    r: number,
    g: number,
    b: number,
    includeColor: boolean,
  ): void {
    this.ensureCapacity();

    const baseVert = this.vertCount;
    const pos = this.positions;
    const norm = this.normals;
    const uv = this.uvs;
    const col = this.colors;

    for (let i = 0; i < UNIT_VERT_COUNT; i++) {
      const i3 = i * 3;
      const i2 = i * 2;
      const v3 = (baseVert + i) * 3;
      const v2 = (baseVert + i) * 2;

      const sx = UNIT_POS[i3] * w;
      const sy = UNIT_POS[i3 + 1] * h;
      const sz = UNIT_POS[i3 + 2] * d;

      pos[v3] = wx + sx * cosY + sz * sinY;
      pos[v3 + 1] = wy + sy;
      pos[v3 + 2] = wz - sx * sinY + sz * cosY;

      const unx = UNIT_NORM[i3];
      const uny = UNIT_NORM[i3 + 1];
      const unz = UNIT_NORM[i3 + 2];

      norm[v3] = unx * cosY + unz * sinY;
      norm[v3 + 1] = uny;
      norm[v3 + 2] = -unx * sinY + unz * cosY;

      uv[v2] = UNIT_UV[i2];
      uv[v2 + 1] = UNIT_UV[i2 + 1];

      if (includeColor) {
        col[v3] = r;
        col[v3 + 1] = g;
        col[v3 + 2] = b;
      }
    }

    const baseIdx = this.indexCount;
    const indices = this.indices;
    for (let i = 0; i < UNIT_INDEX_COUNT; i++) {
      indices[baseIdx + i] = baseVert + UNIT_INDEX[i];
    }

    this.vertCount += UNIT_VERT_COUNT;
    this.indexCount += UNIT_INDEX_COUNT;
  }

  toBufferGeometry(includeColor: boolean): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions.subarray(0, this.vertCount * 3).slice(), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.normals.subarray(0, this.vertCount * 3).slice(), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs.subarray(0, this.vertCount * 2).slice(), 2));
    if (includeColor) {
      geo.setAttribute('color', new THREE.BufferAttribute(this.colors.subarray(0, this.vertCount * 3).slice(), 3));
    }
    const idxSlice = this.indices.subarray(0, this.indexCount);
    const indexTyped =
      this.vertCount <= 65535 ? new Uint16Array(idxSlice) : idxSlice.slice();
    geo.setIndex(new THREE.BufferAttribute(indexTyped, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

const STRUCTURAL_BUCKETS = new Set<BuildingMaterialBucket>(['masonry', 'wood', 'metal']);
const VERTEX_COLOR_BUCKETS = new Set<BuildingMaterialBucket>(['masonry', 'wood', 'metal', 'fabric']);
const SECTOR_SIZE = 110;

interface BuildingBuildContext {
  biome: BiomeType;
  getBaseTerrainY: (x: number, z: number) => number;
  disableDoorShadows: boolean;
  compactTextures: boolean;
  skipRoughnessMaps: boolean;
  root: THREE.Group;
  sectorBuckets: Map<string, Record<BuildingMaterialBucket, BoxGeometryAccumulator>>;
  sectorGlassGroups: Map<string, { group: THREE.Group; bounds: THREE.Box3 }>;
  volumeColliders: OrientedVolumeCollider[];
  walkableSurfaces: WalkableSurface[];
  doors: InteractiveDoor[];
  windows: AccessibleWindow[];
  seats: SittableSeat[];
  lootPoints: LootPoint[];
  buildingOccluders: BuildingOccluder[];
  doorLeafMeshes: THREE.Mesh[];
  ownedGeometries: THREE.BufferGeometry[];
  ownedMaterials: THREE.Material[];
  doorPanelGeo: THREE.BoxGeometry;
  doorHandleGeo: THREE.BoxGeometry;
  doorMat: THREE.MeshStandardMaterial;
  doorSteelMat: THREE.MeshStandardMaterial;
  doorHandleMat: THREE.MeshStandardMaterial;
  breakableGlassMat: THREE.MeshStandardMaterial;
  bucketMaterials: Record<BuildingMaterialBucket, THREE.MeshStandardMaterial>;
  lootCounter: number;
  doorCounter: number;
  windowCounter: number;
  seatCounter: number;
}

export class BuildingSystem {
  constructor(private readonly assetManager?: AssetManager) {}

  buildBuildings(
    biome: BiomeType,
    buildings: readonly BuildingSpec[],
    getBaseTerrainY: (x: number, z: number) => number,
    disableDoorShadows = false,
    options?: BuildingBuildOptions,
  ): BuildingBuildResult {
    const ctx = this.createBuildContext(biome, getBaseTerrainY, disableDoorShadows, options);
    for (let i = 0; i < buildings.length; i++) {
      this.appendBuilding(ctx, buildings[i]);
    }
    return this.finalizeBuildings(ctx);
  }

  async buildBuildingsProgressive(
    biome: BiomeType,
    buildings: readonly BuildingSpec[],
    getBaseTerrainY: (x: number, z: number) => number,
    disableDoorShadows = false,
    options?: BuildingBuildOptions,
  ): Promise<BuildingBuildResult> {
    const ctx = this.createBuildContext(biome, getBaseTerrainY, disableDoorShadows, options);
    const batchSize = 6;
    for (let i = 0; i < buildings.length; i++) {
      this.appendBuilding(ctx, buildings[i]);
      if ((i + 1) % batchSize === 0 && i + 1 < buildings.length) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    return this.finalizeBuildings(ctx);
  }

  private createBuildContext(
    biome: BiomeType,
    getBaseTerrainY: (x: number, z: number) => number,
    disableDoorShadows: boolean,
    options?: BuildingBuildOptions,
  ): BuildingBuildContext {
    const compactTextures = Boolean(options?.compactTextures);
    const skipRoughnessMaps = Boolean(options?.skipRoughnessMaps);
    const root = new THREE.Group();
    const sectorBuckets = new Map<string, Record<BuildingMaterialBucket, BoxGeometryAccumulator>>();
    const ownedGeometries: THREE.BufferGeometry[] = [];
    const ownedMaterials: THREE.Material[] = [];

    const woodTex = this.assetManager?.createPbrDetailTextures('wood', compactTextures);
    const metalTex = this.assetManager?.createPbrDetailTextures('metal', compactTextures);
    const masonryTex = this.assetManager?.createPbrDetailTextures('masonry', compactTextures);
    const fabricTex = this.assetManager?.createPbrDetailTextures('fabric', compactTextures);

    const doorPanelGeo = new THREE.BoxGeometry(1, 1, 1);
    const doorHandleGeo = new THREE.BoxGeometry(0.14, 0.08, 0.24);
    const doorMat = new THREE.MeshStandardMaterial({
      color: biome === 'desert' ? '#92400e' : biome === 'snow' ? '#475569' : '#78350f',
      map: woodTex?.map ?? null,
      roughnessMap: skipRoughnessMaps ? null : (woodTex?.roughnessMap ?? null),
      roughness: 0.62,
      metalness: 0.18,
    });
    const doorSteelMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      map: metalTex?.map ?? null,
      roughnessMap: skipRoughnessMaps ? null : (metalTex?.roughnessMap ?? null),
      roughness: 0.38,
      metalness: 0.72,
    });
    const doorHandleMat = new THREE.MeshStandardMaterial({
      color: '#fbbf24',
      roughness: 0.28,
      metalness: 0.82,
    });
    const breakableGlassMat = new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      roughness: 0.12,
      metalness: 0.18,
      transparent: true,
      opacity: 0.34,
    });

    const bucketMaterials: Record<BuildingMaterialBucket, THREE.MeshStandardMaterial> = {
      masonry: new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: masonryTex?.map ?? null,
        roughnessMap: skipRoughnessMaps ? null : (masonryTex?.roughnessMap ?? null),
        roughness: 0.86,
        metalness: 0.07,
      }),
      wood: new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: woodTex?.map ?? null,
        roughnessMap: skipRoughnessMaps ? null : (woodTex?.roughnessMap ?? null),
        roughness: 0.74,
        metalness: 0.06,
      }),
      metal: new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: metalTex?.map ?? null,
        roughnessMap: skipRoughnessMaps ? null : (metalTex?.roughnessMap ?? null),
        roughness: 0.34,
        metalness: 0.78,
      }),
      fabric: new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: fabricTex?.map ?? null,
        roughnessMap: skipRoughnessMaps ? null : (fabricTex?.roughnessMap ?? null),
        roughness: 0.92,
        metalness: 0.02,
      }),
      glowCyan: new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 1.15,
        roughness: 0.25,
        metalness: 0.15,
      }),
      glowAmber: new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        emissive: '#d97706',
        emissiveIntensity: 1.1,
        roughness: 0.25,
        metalness: 0.15,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: '#bae6fd',
        roughness: 0.12,
        metalness: 0.18,
        transparent: true,
        opacity: 0.32,
      }),
    };

    ownedGeometries.push(doorPanelGeo, doorHandleGeo);
    ownedMaterials.push(
      doorMat,
      doorSteelMat,
      doorHandleMat,
      breakableGlassMat,
      ...Object.values(bucketMaterials),
    );

    return {
      biome,
      getBaseTerrainY,
      disableDoorShadows,
      compactTextures,
      skipRoughnessMaps,
      root,
      sectorBuckets,
      sectorGlassGroups: new Map(),
      volumeColliders: [],
      walkableSurfaces: [],
      doors: [],
      windows: [],
      seats: [],
      lootPoints: [],
      buildingOccluders: [],
      doorLeafMeshes: [],
      ownedGeometries,
      ownedMaterials,
      doorPanelGeo,
      doorHandleGeo,
      doorMat,
      doorSteelMat,
      doorHandleMat,
      breakableGlassMat,
      bucketMaterials,
      lootCounter: 1,
      doorCounter: 1,
      windowCounter: 1,
      seatCounter: 1,
    };
  }

  private getOrCreateSectorBuckets(
    sectorBuckets: Map<string, Record<BuildingMaterialBucket, BoxGeometryAccumulator>>,
    cx: number,
    cz: number,
  ): Record<BuildingMaterialBucket, BoxGeometryAccumulator> {
    const sx = Math.floor(cx / SECTOR_SIZE);
    const sz = Math.floor(cz / SECTOR_SIZE);
    const key = `${sx},${sz}`;
    let rec = sectorBuckets.get(key);
    if (!rec) {
      rec = {
        masonry: new BoxGeometryAccumulator(256),
        wood: new BoxGeometryAccumulator(128),
        metal: new BoxGeometryAccumulator(64),
        fabric: new BoxGeometryAccumulator(64),
        glowCyan: new BoxGeometryAccumulator(16),
        glowAmber: new BoxGeometryAccumulator(16),
        glass: new BoxGeometryAccumulator(32),
      };
      sectorBuckets.set(key, rec);
    }
    return rec;
  }

  private appendBuilding(ctx: BuildingBuildContext, b: BuildingSpec): void {
    const {
      biome,
      getBaseTerrainY,
      disableDoorShadows,
      root,
      volumeColliders,
      walkableSurfaces,
      doors,
      windows,
      seats,
      lootPoints,
      doorLeafMeshes,
      doorPanelGeo,
      doorHandleGeo,
      doorMat,
      doorSteelMat,
      doorHandleMat,
      breakableGlassMat,
    } = ctx;

    const sectorKey = `${Math.floor(b.x / SECTOR_SIZE)},${Math.floor(b.z / SECTOR_SIZE)}`;
    const bucketGeos = this.getOrCreateSectorBuckets(ctx.sectorBuckets, b.x, b.z);
    const getOrCreateGlassGroup = () => {
      let entry = ctx.sectorGlassGroups.get(sectorKey);
      if (!entry) {
        entry = { group: new THREE.Group(), bounds: new THREE.Box3() };
        ctx.sectorGlassGroups.set(sectorKey, entry);
      }
      return entry;
    };
    const baseY = getBaseTerrainY(b.x, b.z);
    const approxFloors = Math.max(
      1,
      b.floors ?? (b.style === 'apartment_block' ? 3 : b.style === 'luxury_villa' ? 2 : 1),
    );
    ctx.buildingOccluders.push({
      cx: b.x,
      cz: b.z,
      radius: Math.min(b.width, b.depth) * 0.45,
      topY: baseY + approxFloors * FLOOR_HEIGHT,
    });
    const cosB = Math.cos(b.rotationY);
    const sinB = Math.sin(b.rotationY);
    const palette = this.makePalette(biome, b);

      const toWorldXZ = (lx: number, lz: number): [number, number] => [
        b.x + lx * cosB + lz * sinB,
        b.z - lx * sinB + lz * cosB,
      ];

      const addBox = (
        bucket: BuildingMaterialBucket,
        lx: number,
        ly: number,
        lz: number,
        w: number,
        h: number,
        d: number,
        colorHex: string,
        opts: {
          collide?: boolean;
          steppable?: boolean;
          localRotY?: number;
        } = {},
      ): void => {
        if (w <= 0.01 || h <= 0.01 || d <= 0.01) return;
        const [wx, wz] = toWorldXZ(lx, lz);
        const totalYaw = b.rotationY + (opts.localRotY ?? 0);
        const cosYaw = Math.cos(totalYaw);
        const sinYaw = Math.sin(totalYaw);
        const useColor = VERTEX_COLOR_BUCKETS.has(bucket);
        const rgb = useColor ? getCachedRgb(colorHex) : null;

        bucketGeos[bucket].appendBox(
          wx,
          baseY + ly,
          wz,
          w,
          h,
          d,
          cosYaw,
          sinYaw,
          rgb ? rgb[0] : 1,
          rgb ? rgb[1] : 1,
          rgb ? rgb[2] : 1,
          useColor,
        );

        if (opts.collide) {
          volumeColliders.push({
            cx: wx,
            cz: wz,
            halfW: w * 0.5,
            halfD: d * 0.5,
            cosY: cosYaw,
            sinY: sinYaw,
            minY: baseY + ly - h * 0.5,
            maxY: baseY + ly + h * 0.5,
            steppable: opts.steppable ?? false,
          });
        }
      };

      const addWalkableRect = (
        minX: number,
        maxX: number,
        minZ: number,
        maxZ: number,
        topLocalY: number,
        thick: number,
        colorHex: string,
        bucket: BuildingMaterialBucket = 'masonry',
      ): void => {
        const w = maxX - minX;
        const d = maxZ - minZ;
        if (w <= 0.05 || d <= 0.05) return;
        const cxLocal = (minX + maxX) * 0.5;
        const czLocal = (minZ + maxZ) * 0.5;
        addBox(bucket, cxLocal, topLocalY - thick * 0.5, czLocal, w, thick, d, colorHex, {
          collide: false,
        });
        const [wx, wz] = toWorldXZ(cxLocal, czLocal);
        walkableSurfaces.push({
          kind: 'slab',
          cx: wx,
          cz: wz,
          halfW: w * 0.5,
          halfD: d * 0.5,
          cosY: cosB,
          sinY: sinB,
          startY: baseY + topLocalY,
          endY: baseY + topLocalY,
          undersideY: baseY + topLocalY - thick,
        });
      };

      const addFloorSlabWithCutout = (
        minX: number,
        maxX: number,
        minZ: number,
        maxZ: number,
        topLocalY: number,
        thick: number,
        colorHex: string,
        cutout?: {
          minX: number;
          maxX: number;
          minZ: number;
          maxZ: number;
          openSide?: 'north' | 'south';
          hugWall?: 'west' | 'east';
        },
        bucket: BuildingMaterialBucket = 'masonry',
      ): void => {
        if (!cutout) {
          addWalkableRect(minX, maxX, minZ, maxZ, topLocalY, thick, colorHex, bucket);
          return;
        }
        const cMinX = Math.max(minX, cutout.minX);
        const cMaxX = Math.min(maxX, cutout.maxX);
        const cMinZ = Math.max(minZ, cutout.minZ);
        const cMaxZ = Math.min(maxZ, cutout.maxZ);
        if (cMinX >= cMaxX || cMinZ >= cMaxZ) {
          addWalkableRect(minX, maxX, minZ, maxZ, topLocalY, thick, colorHex, bucket);
          return;
        }
        if (cMinX > minX) addWalkableRect(minX, cMinX, minZ, maxZ, topLocalY, thick, colorHex, bucket);
        if (cMaxX < maxX) addWalkableRect(cMaxX, maxX, minZ, maxZ, topLocalY, thick, colorHex, bucket);
        if (cMinZ > minZ) addWalkableRect(cMinX, cMaxX, minZ, cMinZ, topLocalY, thick, colorHex, bucket);
        if (cMaxZ < maxZ) addWalkableRect(cMinX, cMaxX, cMaxZ, maxZ, topLocalY, thick, colorHex, bucket);

        // Protective stairwell guardrails on non-arrival edges to prevent falling down stairwells
        if (cutout.openSide && cutout.hugWall) {
          const railH = 0.96;
          const railThick = 0.12;
          const overhangZ = cutout.openSide === 'north' ? cMaxZ + 0.06 : cMinZ - 0.06;
          addBox(
            'metal',
            (cMinX + cMaxX) * 0.5,
            topLocalY + railH * 0.5,
            overhangZ,
            cMaxX - cMinX + railThick,
            railH,
            railThick,
            palette.metal,
            { collide: true },
          );
          const innerX = cutout.hugWall === 'west' ? cMaxX + 0.06 : cMinX - 0.06;
          addBox(
            'metal',
            innerX,
            topLocalY + railH * 0.5,
            (cMinZ + cMaxZ) * 0.5,
            railThick,
            railH,
            cMaxZ - cMinZ,
            palette.metal,
            { collide: true },
          );
        }
      };

      const addStaircase = (
        cxLocal: number,
        czLocal: number,
        width: number,
        length: number,
        startLocalY: number,
        endLocalY: number,
        direction: 'north' | 'south' | 'east' | 'west',
        colorHex: string,
        bucket: BuildingMaterialBucket = 'wood',
      ): void => {
        let stairRotY = 0;
        if (direction === 'north') stairRotY = Math.PI;
        else if (direction === 'east') stairRotY = Math.PI * 0.5;
        else if (direction === 'west') stairRotY = -Math.PI * 0.5;

        const steps = 16;
        const stepRun = length / steps;
        const totalRise = endLocalY - startLocalY;
        const stepHeight = totalRise / steps;

        const cosS = Math.cos(stairRotY);
        const sinS = Math.sin(stairRotY);

        for (let i = 0; i < steps; i++) {
          const localZAlong = -length * 0.5 + (i + 0.5) * stepRun;
          const stepTop = startLocalY + (i + 1) * stepHeight;
          const sx = cxLocal + localZAlong * sinS;
          const sz = czLocal + localZAlong * cosS;
          addBox(
            bucket,
            sx,
            stepTop - stepHeight * 0.55,
            sz,
            width - 0.14,
            stepHeight * 1.1,
            stepRun + 0.04,
            colorHex,
            { collide: false, localRotY: stairRotY },
          );

          // Solid under-stair riser base (visual + lower-floor blocker so players never walk inside stairs)
          if (i >= 2) {
            const riserH = stepTop - 0.18 - startLocalY;
            if (riserH > 0.12) {
              addBox(
                bucket,
                sx,
                startLocalY + riserH * 0.5,
                sz,
                width - 0.24,
                riserH,
                stepRun,
                palette.wallInner,
                { collide: false, localRotY: stairRotY },
              );
              const colTop = stepTop - 0.82;
              if (i >= 4 && colTop > startLocalY + 0.25) {
                const [colWx, colWz] = toWorldXZ(sx, sz);
                const colYaw = b.rotationY + stairRotY;
                volumeColliders.push({
                  cx: colWx,
                  cz: colWz,
                  halfW: (width - 0.24) * 0.5,
                  halfD: stepRun * 0.5,
                  cosY: Math.cos(colYaw),
                  sinY: Math.sin(colYaw),
                  minY: baseY + startLocalY,
                  maxY: baseY + colTop,
                  steppable: false,
                });
              }
            }
          }
        }

        // Sloped side stringers & stepped protective handrail colliders (matching exact stair slope)
        const railSegments = 4;
        const segLen = length / railSegments;
        for (const side of [-1, 1]) {
          const sideX = side * (width * 0.5 - 0.06);
          for (let seg = 0; seg < railSegments; seg++) {
            const t = (seg + 0.5) / railSegments;
            const zAlong = -length * 0.5 + t * length;
            const segFloorY = startLocalY + t * totalRise;
            const rx = cxLocal + sideX * cosS + zAlong * sinS;
            const rz = czLocal - sideX * sinS + zAlong * cosS;
            addBox(
              'metal',
              rx,
              segFloorY + 0.52,
              rz,
              0.09,
              1.04,
              segLen + 0.04,
              palette.metal,
              { collide: true, localRotY: stairRotY },
            );
          }
        }

        const [wx, wz] = toWorldXZ(cxLocal, czLocal);
        const totalYaw = b.rotationY + stairRotY;
        walkableSurfaces.push({
          kind: 'stair',
          cx: wx,
          cz: wz,
          halfW: width * 0.5,
          halfD: length * 0.5,
          cosY: Math.cos(totalYaw),
          sinY: Math.sin(totalYaw),
          startY: baseY + startLocalY,
          endY: baseY + endLocalY,
          undersideY: baseY + startLocalY - 0.35,
          stairSteps: steps,
        });
      };

      const addDoor = (
        lx: number,
        yFloor: number,
        lz: number,
        doorW: number,
        doorH: number,
        facingZWall: boolean,
        isMetalDoor = false,
        initialOpen = false,
        label = 'DOOR',
      ): void => {
        const doorThickness = 0.12;
        const doorLocalYaw = facingZWall ? 0 : Math.PI * 0.5;
        const baseYaw = b.rotationY + doorLocalYaw;
        const [centerWx, centerWz] = toWorldXZ(lx, lz);

        const cosDoor = Math.cos(baseYaw);
        const sinDoor = Math.sin(baseYaw);
        const hingeX = centerWx - doorW * 0.5 * cosDoor;
        const hingeZ = centerWz + doorW * 0.5 * sinDoor;

        const pivotGroup = new THREE.Group();
        pivotGroup.position.set(hingeX, baseY + yFloor, hingeZ);
        const swingSign = 1;
        const openAngle = initialOpen ? Math.PI * 0.52 : 0;
        pivotGroup.rotation.y = baseYaw + openAngle * swingSign;

        const leafMesh = new THREE.Mesh(doorPanelGeo, isMetalDoor ? doorSteelMat : doorMat);
        leafMesh.scale.set(doorW - 0.08, doorH - 0.04, doorThickness);
        leafMesh.position.set(doorW * 0.5, doorH * 0.5, 0);
        leafMesh.castShadow = !disableDoorShadows;
        leafMesh.receiveShadow = true;

        const handle = new THREE.Mesh(doorHandleGeo, doorHandleMat);
        handle.position.set(doorW - 0.24, 1.05, 0);

        pivotGroup.add(leafMesh, handle);
        root.add(pivotGroup);
        doorLeafMeshes.push(leafMesh);

        doors.push({
          id: `${b.id}-door-${ctx.doorCounter++}`,
          label,
          pivotGroup,
          leafMesh,
          centerX: centerWx,
          centerZ: centerWz,
          halfW: doorW * 0.5,
          halfD: 0.14,
          cosY: cosDoor,
          sinY: sinDoor,
          minY: baseY + yFloor,
          maxY: baseY + yFloor + doorH,
          baseYaw,
          swingSign,
          isOpen: initialOpen,
          currentAngle: openAngle,
        });
      };

      const addWallX = (
        x0: number,
        x1: number,
        lz: number,
        y0: number,
        y1: number,
        thick: number,
        color: string,
        openings: Array<
          | { kind: 'door'; cx: number; w: number; h: number; addInteractiveDoor?: boolean; open?: boolean; steel?: boolean; label?: string }
          | { kind: 'window'; cx: number; w: number; sillH: number; winH: number; broken?: boolean }
        >,
      ): void => {
        const sorted = [...openings].sort((a, c) => a.cx - c.cx);
        let cursor = x0;
        const h = y1 - y0;

        for (const op of sorted) {
          const opStart = Math.max(x0, op.cx - op.w * 0.5);
          const opEnd = Math.min(x1, op.cx + op.w * 0.5);
          if (opStart > cursor + 0.04) {
            addBox('masonry', (cursor + opStart) * 0.5, y0 + h * 0.5, lz, opStart - cursor, h, thick, color, {
              collide: true,
            });
          }

          if (op.kind === 'door') {
            const lintelH = y1 - (y0 + op.h);
            if (lintelH > 0.04) {
              addBox('masonry', op.cx, y0 + op.h + lintelH * 0.5, lz, opEnd - opStart, lintelH, thick, color, {
                collide: true,
              });
            }
            addBox('wood', opStart + 0.04, y0 + op.h * 0.5, lz, 0.08, op.h, thick + 0.04, palette.trim);
            addBox('wood', opEnd - 0.04, y0 + op.h * 0.5, lz, 0.08, op.h, thick + 0.04, palette.trim);
            addBox('wood', op.cx, y0 + op.h + 0.04, lz, op.w, 0.08, thick + 0.04, palette.trim);
            if (op.addInteractiveDoor !== false) {
              addDoor(op.cx, y0, lz, op.w - 0.08, op.h - 0.04, true, op.steel, op.open ?? false, op.label);
            }
          } else {
            addBox('masonry', op.cx, y0 + op.sillH * 0.5, lz, opEnd - opStart, op.sillH, thick, color, {
              collide: true,
            });
            const topY = y0 + op.sillH + op.winH;
            const lintelH = y1 - topY;
            if (lintelH > 0.04) {
              addBox('masonry', op.cx, topY + lintelH * 0.5, lz, opEnd - opStart, lintelH, thick, color, {
                collide: true,
              });
            }
            addBox('wood', op.cx, y0 + op.sillH + 0.04, lz, op.w + 0.08, 0.08, thick + 0.08, palette.trim);
            addBox('wood', op.cx, topY - 0.03, lz, op.w + 0.08, 0.07, thick + 0.06, palette.trim);
            const isVaultable = op.sillH <= 1.35 && op.winH >= 1.0 && op.w >= 1.2;
            const [wcx, wcz] = toWorldXZ(op.cx, lz);
            let glassMesh: THREE.Mesh | undefined;
            if (!op.broken) {
              if (isVaultable) {
                glassMesh = new THREE.Mesh(UNIT_BOX, breakableGlassMat);
                const wcy = baseY + y0 + op.sillH + op.winH * 0.5;
                glassMesh.position.set(wcx, wcy, wcz);
                glassMesh.scale.set(Math.max(0.2, op.w - 0.1), Math.max(0.2, op.winH - 0.1), 0.04);
                glassMesh.rotation.y = b.rotationY;
                const glassEntry = getOrCreateGlassGroup();
                glassEntry.group.add(glassMesh);
                const pad = op.w * 0.5 + 0.5;
                glassEntry.bounds.expandByPoint(new THREE.Vector3(wcx - pad, wcy - op.winH * 0.5, wcz - pad));
                glassEntry.bounds.expandByPoint(new THREE.Vector3(wcx + pad, wcy + op.winH * 0.5, wcz + pad));
              } else {
                addBox('glass', op.cx, y0 + op.sillH + op.winH * 0.5, lz, op.w - 0.1, op.winH - 0.1, 0.04, '#bae6fd');
              }
            } else {
              addBox('wood', op.cx - 0.15, y0 + op.sillH + op.winH * 0.35, lz, op.w * 0.72, 0.18, 0.05, palette.woodDark, {
                localRotY: 0.05,
              });
            }
            if (isVaultable) {
              windows.push({
                id: `${b.id}-win-${ctx.windowCounter++}`,
                cx: wcx,
                cz: wcz,
                floorY: baseY + y0,
                sillTopY: baseY + y0 + op.sillH,
                lintelBottomY: baseY + topY,
                halfSpan: op.w * 0.5,
                halfThick: thick * 0.5,
                tangentX: cosB,
                tangentZ: -sinB,
                normalX: sinB,
                normalZ: cosB,
                broken: Boolean(op.broken),
                glassMesh,
              });
            }
          }
          cursor = Math.max(cursor, opEnd);
        }

        if (x1 > cursor + 0.04) {
          addBox('masonry', (cursor + x1) * 0.5, y0 + h * 0.5, lz, x1 - cursor, h, thick, color, {
            collide: true,
          });
        }
      };

      const addWallZ = (
        lx: number,
        z0: number,
        z1: number,
        y0: number,
        y1: number,
        thick: number,
        color: string,
        openings: Array<
          | { kind: 'door'; cz: number; w: number; h: number; addInteractiveDoor?: boolean; open?: boolean; steel?: boolean; label?: string }
          | { kind: 'window'; cz: number; w: number; sillH: number; winH: number; broken?: boolean }
        >,
      ): void => {
        const sorted = [...openings].sort((a, c) => a.cz - c.cz);
        let cursor = z0;
        const h = y1 - y0;

        for (const op of sorted) {
          const opStart = Math.max(z0, op.cz - op.w * 0.5);
          const opEnd = Math.min(z1, op.cz + op.w * 0.5);
          if (opStart > cursor + 0.04) {
            addBox('masonry', lx, y0 + h * 0.5, (cursor + opStart) * 0.5, thick, h, opStart - cursor, color, {
              collide: true,
            });
          }

          if (op.kind === 'door') {
            const lintelH = y1 - (y0 + op.h);
            if (lintelH > 0.04) {
              addBox('masonry', lx, y0 + op.h + lintelH * 0.5, op.cz, thick, lintelH, opEnd - opStart, color, {
                collide: true,
              });
            }
            addBox('wood', lx, y0 + op.h * 0.5, opStart + 0.04, thick + 0.04, op.h, 0.08, palette.trim);
            addBox('wood', lx, y0 + op.h * 0.5, opEnd - 0.04, thick + 0.04, op.h, 0.08, palette.trim);
            addBox('wood', lx, y0 + op.h + 0.04, op.cz, thick + 0.04, 0.08, op.w, palette.trim);
            if (op.addInteractiveDoor !== false) {
              addDoor(lx, y0, op.cz, op.w - 0.08, op.h - 0.04, false, op.steel, op.open ?? false, op.label);
            }
          } else {
            addBox('masonry', lx, y0 + op.sillH * 0.5, op.cz, thick, op.sillH, opEnd - opStart, color, {
              collide: true,
            });
            const topY = y0 + op.sillH + op.winH;
            const lintelH = y1 - topY;
            if (lintelH > 0.04) {
              addBox('masonry', lx, topY + lintelH * 0.5, op.cz, thick, lintelH, opEnd - opStart, color, {
                collide: true,
              });
            }
            addBox('wood', lx, y0 + op.sillH + 0.04, op.cz, thick + 0.08, 0.08, op.w + 0.08, palette.trim);
            addBox('wood', lx, topY - 0.03, op.cz, thick + 0.06, 0.07, op.w + 0.08, palette.trim);
            const isVaultable = op.sillH <= 1.35 && op.winH >= 1.0 && op.w >= 1.2;
            const [wcx, wcz] = toWorldXZ(lx, op.cz);
            let glassMesh: THREE.Mesh | undefined;
            if (!op.broken) {
              if (isVaultable) {
                glassMesh = new THREE.Mesh(UNIT_BOX, breakableGlassMat);
                const wcy = baseY + y0 + op.sillH + op.winH * 0.5;
                glassMesh.position.set(wcx, wcy, wcz);
                glassMesh.scale.set(0.04, Math.max(0.2, op.winH - 0.1), Math.max(0.2, op.w - 0.1));
                glassMesh.rotation.y = b.rotationY;
                const glassEntry = getOrCreateGlassGroup();
                glassEntry.group.add(glassMesh);
                const pad = op.w * 0.5 + 0.5;
                glassEntry.bounds.expandByPoint(new THREE.Vector3(wcx - pad, wcy - op.winH * 0.5, wcz - pad));
                glassEntry.bounds.expandByPoint(new THREE.Vector3(wcx + pad, wcy + op.winH * 0.5, wcz + pad));
              } else {
                addBox('glass', lx, y0 + op.sillH + op.winH * 0.5, op.cz, 0.04, op.winH - 0.1, op.w - 0.1, '#bae6fd');
              }
            } else {
              addBox('wood', lx, y0 + op.sillH + op.winH * 0.35, op.cz + 0.1, 0.05, 0.18, op.w * 0.72, palette.woodDark);
            }
            if (isVaultable) {
              windows.push({
                id: `${b.id}-win-${ctx.windowCounter++}`,
                cx: wcx,
                cz: wcz,
                floorY: baseY + y0,
                sillTopY: baseY + y0 + op.sillH,
                lintelBottomY: baseY + topY,
                halfSpan: op.w * 0.5,
                halfThick: thick * 0.5,
                tangentX: sinB,
                tangentZ: cosB,
                normalX: cosB,
                normalZ: -sinB,
                broken: Boolean(op.broken),
                glassMesh,
              });
            }
          }
          cursor = Math.max(cursor, opEnd);
        }

        if (z1 > cursor + 0.04) {
          addBox('masonry', lx, y0 + h * 0.5, (cursor + z1) * 0.5, thick, h, z1 - cursor, color, {
            collide: true,
          });
        }
      };

      const pushSeatSpot = (
        lx: number,
        yFloor: number,
        lz: number,
        rotY: number,
        seatHeight: number,
        standLocalX: number,
        standLocalZ: number,
        label: string,
      ): void => {
        const [sx, sz] = toWorldXZ(lx, lz);
        const [stx, stz] = toWorldXZ(standLocalX, standLocalZ);
        seats.push({
          id: `${b.id}-seat-${ctx.seatCounter++}`,
          label,
          seatX: sx,
          seatY: baseY + yFloor + seatHeight,
          seatZ: sz,
          facingYaw: b.rotationY + rotY,
          standX: stx,
          standZ: stz,
        });
      };

      const addSofa = (lx: number, yFloor: number, lz: number, rotY: number, color = palette.fabricA): void => {
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        const tx = (x: number, z: number): [number, number] => [lx + x * cosR + z * sinR, lz - x * sinR + z * cosR];
        addBox('fabric', lx, yFloor + 0.24, lz, 2.1, 0.42, 0.88, color, { collide: true, steppable: true, localRotY: rotY });
        const [bx, bz] = tx(0, -0.34);
        addBox('fabric', bx, yFloor + 0.62, bz, 2.1, 0.56, 0.2, color, { collide: true, localRotY: rotY });
        for (const s of [-0.94, 0.94]) {
          const [ax, az] = tx(s, 0);
          addBox('wood', ax, yFloor + 0.44, az, 0.2, 0.52, 0.88, palette.woodDark, { collide: false, localRotY: rotY });
        }
        for (const sx of [-0.46, 0.46]) {
          const [seatLx, seatLz] = tx(sx, 0.14);
          const [standLx, standLz] = tx(sx, 0.88);
          pushSeatSpot(seatLx, yFloor, seatLz, rotY, 0.45, standLx, standLz, 'SOFA');
        }
      };

      const addChair = (
        lx: number,
        yFloor: number,
        lz: number,
        rotY = 0,
        seatColor = palette.fabricB,
        label = 'CHAIR',
        standSideLocal: [number, number] = [0, 0.66],
      ): void => {
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        const tx = (x: number, z: number): [number, number] => [lx + x * cosR + z * sinR, lz - x * sinR + z * cosR];
        addBox('wood', lx, yFloor + 0.21, lz, 0.48, 0.42, 0.48, palette.woodDark, { collide: false, localRotY: rotY });
        addBox('fabric', lx, yFloor + 0.43, lz, 0.54, 0.08, 0.54, seatColor, { collide: true, localRotY: rotY });
        const [bx, bz] = tx(0, -0.23);
        addBox('fabric', bx, yFloor + 0.71, bz, 0.54, 0.52, 0.09, seatColor, { collide: true, localRotY: rotY });
        const [seatLx, seatLz] = tx(0, 0.05);
        const [standLx, standLz] = tx(standSideLocal[0], standSideLocal[1]);
        pushSeatSpot(seatLx, yFloor, seatLz, rotY, 0.47, standLx, standLz, label);
      };

      const addBench = (
        lx: number,
        yFloor: number,
        lz: number,
        rotY = 0,
        w = 1.85,
        label = 'BENCH',
      ): void => {
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        const tx = (x: number, z: number): [number, number] => [lx + x * cosR + z * sinR, lz - x * sinR + z * cosR];
        addBox('wood', lx, yFloor + 0.42, lz, w, 0.08, 0.58, palette.wood, { collide: true, steppable: true, localRotY: rotY });
        const [bx, bz] = tx(0, -0.24);
        addBox('wood', bx, yFloor + 0.68, bz, w, 0.46, 0.09, palette.woodDark, { collide: true, localRotY: rotY });
        for (const s of [-w * 0.42, w * 0.42]) {
          const [px, pz] = tx(s, 0);
          addBox('metal', px, yFloor + 0.2, pz, 0.1, 0.4, 0.5, palette.metal, { collide: false, localRotY: rotY });
        }
        for (const sx of [-0.42, 0.42]) {
          const [seatLx, seatLz] = tx(sx, 0.08);
          const [standLx, standLz] = tx(sx, 0.72);
          pushSeatSpot(seatLx, yFloor, seatLz, rotY, 0.46, standLx, standLz, label);
        }
      };

      const addTable = (lx: number, yFloor: number, lz: number, w = 1.6, d = 1.0, rotY = 0): void => {
        addBox('wood', lx, yFloor + 0.72, lz, w, 0.08, d, palette.wood, { collide: true, localRotY: rotY });
        addBox('metal', lx, yFloor + 0.34, lz, w * 0.72, 0.68, d * 0.62, palette.trim, { collide: true, localRotY: rotY });
      };

      const addBed = (lx: number, yFloor: number, lz: number, rotY = 0, blanketHex = palette.fabricB): void => {
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        addBox('wood', lx, yFloor + 0.2, lz, 1.35, 0.36, 2.05, palette.woodDark, { collide: true, steppable: true, localRotY: rotY });
        addBox('fabric', lx, yFloor + 0.44, lz + 0.1 * cosR, 1.24, 0.2, 1.65, blanketHex, { collide: false, localRotY: rotY });
        const px = lx - 0.74 * sinR;
        const pz = lz - 0.74 * cosR;
        addBox('fabric', px, yFloor + 0.52, pz, 1.0, 0.14, 0.38, '#f8fafc', { collide: false, localRotY: rotY });
        const hx = lx - 0.96 * sinR;
        const hz = lz - 0.96 * cosR;
        addBox('wood', hx, yFloor + 0.64, hz, 1.35, 0.75, 0.12, palette.woodDark, { collide: true, localRotY: rotY });
      };

      const addWardrobe = (lx: number, yFloor: number, lz: number, rotY = 0): void => {
        addBox('wood', lx, yFloor + 1.05, lz, 1.45, 2.1, 0.62, palette.woodDark, { collide: true, localRotY: rotY });
        addBox('metal', lx, yFloor + 1.05, lz + (Math.cos(rotY) >= 0 ? 0.32 : -0.32), 0.12, 0.42, 0.04, '#cbd5e1', {
          localRotY: rotY,
        });
      };

      const addKitchenCounter = (lx: number, yFloor: number, lz: number, w = 2.6, d = 0.72, rotY = 0): void => {
        addBox('wood', lx, yFloor + 0.45, lz, w, 0.9, d, palette.woodDark, { collide: true, localRotY: rotY });
        addBox('masonry', lx, yFloor + 0.93, lz, w + 0.08, 0.08, d + 0.08, '#e2e8f0', { collide: false, localRotY: rotY });
      };

      const addDeskSetup = (lx: number, yFloor: number, lz: number, rotY = 0, glowMonitor = true): void => {
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        addBox('wood', lx, yFloor + 0.74, lz, 1.55, 0.08, 0.74, palette.wood, { collide: true, localRotY: rotY });
        addBox('metal', lx - 0.62 * cosR, yFloor + 0.36, lz + 0.62 * sinR, 0.08, 0.72, 0.64, palette.metal, { collide: true, localRotY: rotY });
        addBox('metal', lx + 0.62 * cosR, yFloor + 0.36, lz - 0.62 * sinR, 0.08, 0.72, 0.64, palette.metal, { collide: true, localRotY: rotY });
        const mx = lx - 0.18 * sinR;
        const mz = lz - 0.18 * cosR;
        addBox('metal', mx, yFloor + 1.06, mz, 0.78, 0.44, 0.06, '#0f172a', { localRotY: rotY });
        if (glowMonitor) {
          addBox('glowCyan', mx + 0.02 * sinR, yFloor + 1.06, mz + 0.02 * cosR, 0.68, 0.36, 0.07, '#38bdf8', {
            localRotY: rotY,
          });
        }
        // Automatically tuck a sittable desk chair facing the monitor
        addChair(
          lx + 0.76 * sinR,
          yFloor,
          lz + 0.76 * cosR,
          rotY + Math.PI,
          palette.fabricC,
          'DESK CHAIR',
          [-0.68, -0.1],
        );
      };

      const addCrateStack = (lx: number, yFloor: number, lz: number, tall = false): void => {
        addBox('wood', lx, yFloor + 0.48, lz, 1.05, 0.96, 1.05, palette.wood, { collide: true });
        addBox('metal', lx + 1.15, yFloor + 0.42, lz + 0.12, 0.92, 0.84, 0.92, '#475569', { collide: true });
        if (tall) {
          addBox('wood', lx + 0.45, yFloor + 1.38, lz + 0.06, 0.88, 0.84, 0.88, palette.woodDark, { collide: true });
        }
      };

      const addServerRack = (lx: number, yFloor: number, lz: number, rotY = 0): void => {
        addBox('metal', lx, yFloor + 1.1, lz, 0.9, 2.2, 0.78, '#1e293b', { collide: true, localRotY: rotY });
        addBox('glowCyan', lx, yFloor + 1.45, lz, 0.76, 0.08, 0.82, '#38bdf8', { localRotY: rotY });
        addBox('glowAmber', lx, yFloor + 1.15, lz, 0.76, 0.08, 0.82, '#f59e0b', { localRotY: rotY });
      };

      const addRoofParapet = (minX: number, maxX: number, minZ: number, maxZ: number, roofY: number, parapetH = 1.02, gapFront = false): void => {
        const halfP = 0.12;
        if (gapFront) {
          addBox('masonry', (minX + maxX) * 0.5 - (maxX - minX) * 0.3, roofY + parapetH * 0.5, maxZ - halfP, (maxX - minX) * 0.38, parapetH, WALL_THICK, palette.roof, { collide: true });
          addBox('masonry', (minX + maxX) * 0.5 + (maxX - minX) * 0.3, roofY + parapetH * 0.5, maxZ - halfP, (maxX - minX) * 0.38, parapetH, WALL_THICK, palette.roof, { collide: true });
        } else {
          addBox('masonry', (minX + maxX) * 0.5, roofY + parapetH * 0.5, maxZ - halfP, maxX - minX, parapetH, WALL_THICK, palette.roof, { collide: true });
        }
        addBox('masonry', (minX + maxX) * 0.5, roofY + parapetH * 0.5, minZ + halfP, maxX - minX, parapetH, WALL_THICK, palette.roof, { collide: true });
        addBox('masonry', minX + halfP, roofY + parapetH * 0.5, (minZ + maxZ) * 0.5, WALL_THICK, parapetH, maxZ - minZ, palette.roof, { collide: true });
        addBox('masonry', maxX - halfP, roofY + parapetH * 0.5, (minZ + maxZ) * 0.5, WALL_THICK, parapetH, maxZ - minZ, palette.roof, { collide: true });
      };

      const addBalcony = (
        cxLocal: number,
        zEdge: number,
        dirZ: 1 | -1,
        width: number,
        depth: number,
        yFloor: number,
        railHex: string,
      ): void => {
        const czLocal = zEdge + dirZ * (depth * 0.5);
        addWalkableRect(
          cxLocal - width * 0.5,
          cxLocal + width * 0.5,
          czLocal - depth * 0.5,
          czLocal + depth * 0.5,
          yFloor,
          0.18,
          palette.floor,
        );
        const outerZ = zEdge + dirZ * (depth - 0.08);
        addBox('metal', cxLocal, yFloor + 0.52, outerZ, width, 1.04, 0.14, railHex, { collide: true });
        addBox('metal', cxLocal - width * 0.5 + 0.07, yFloor + 0.52, czLocal, 0.14, 1.04, depth, railHex, { collide: true });
        addBox('metal', cxLocal + width * 0.5 - 0.07, yFloor + 0.52, czLocal, 0.14, 1.04, depth, railHex, { collide: true });
      };

      const addInteriorLoot = (lx: number, yFloor: number, lz: number, tier: LootTier, preferredWeaponId?: string): void => {
        const [wx, wz] = toWorldXZ(lx, lz);
        lootPoints.push({
          id: `${b.id}-iloot-${ctx.lootCounter++}`,
          x: wx,
          y: baseY + yFloor,
          z: wz,
          yHint: baseY + yFloor,
          tier,
          areaName: b.name,
          preferredWeaponId,
          groupId: b.id,
          buildingStyle: b.style,
        });
      };

      // ============================================================
      // SPACIOUS MULTI-ROOM ARCHETYPE BUILDERS (100% ENTERABLE)
      // ============================================================
      const hw = b.width * 0.5;
      const hd = b.depth * 0.5;
      const f0 = 0.1;

      if (b.style === 'luxury_villa') {
        // 2-Floor Grand Estate: Grand Central Hallway + 4 Rooms per floor + Balconies + Rooftop Deck
        const f1 = f0 + FLOOR_HEIGHT;
        const roofY = f0 + FLOOR_HEIGHT * 2;
        const stairW = 2.4;
        const stairLen = 4.6;
        const s1X = -hw + 1.55;
        const s1Z = 0;
        const s2X = hw - 1.55;
        const s2Z = 0;
        const hallW = Math.max(2.65, Math.min(3.45, hw * 0.27)); // ~5.3-6.9m wide grand central gallery!
        const westWingMinX = s1X + stairW * 0.58;
        const eastWingMaxX = s2X - stairW * 0.58;
        const westRoomCx = (westWingMinX - hallW) * 0.5;
        const eastRoomCx = (hallW + hw) * 0.5;

        addBox('masonry', 0, -0.22, 0, b.width + 0.7, 0.44, b.depth + 0.7, palette.trim);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, palette.floor);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f1, SLAB_THICK, palette.upperFloor, {
          minX: s1X - stairW * 0.56,
          maxX: s1X + stairW * 0.56,
          minZ: s1Z - stairLen * 0.5 + 0.04,
          maxZ: s1Z + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, palette.roof, {
          minX: s2X - stairW * 0.56,
          maxX: s2X + stairW * 0.56,
          minZ: s2Z - stairLen * 0.5 - 0.25,
          maxZ: s2Z + stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'east',
        });

        // 1F Exterior Perimeter (3 entrances: Grand Front Door, Open Patio Rear Door, East Portico Door)
        addWallX(-hw, hw, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.58, w: 2.8, sillH: 0.9, winH: 1.75 },
          { kind: 'door', cx: 0, w: 3.0, h: 2.75, label: 'VILLA GRAND ENTRY' },
          { kind: 'window', cx: hw * 0.58, w: 2.8, sillH: 0.9, winH: 1.75 },
        ]);
        addWallX(-hw, hw, -hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.56, w: 2.6, sillH: 0.9, winH: 1.7 },
          { kind: 'door', cx: 0, w: 2.8, h: 2.65, open: true, label: 'PATIO TERRACE DOOR' },
          { kind: 'window', cx: hw * 0.56, w: 2.6, sillH: 0.9, winH: 1.7 },
        ]);
        addWallZ(-hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.45, w: 2.6, sillH: 0.9, winH: 1.65 },
          { kind: 'window', cz: hd * 0.45, w: 2.6, sillH: 0.9, winH: 1.65 },
        ]);
        addWallZ(hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.48, w: 2.4, sillH: 0.9, winH: 1.65 },
          { kind: 'door', cz: 0, w: 2.35, h: 2.6, label: 'PORTICO SIDE DOOR' },
          { kind: 'window', cz: hd * 0.48, w: 2.4, sillH: 0.9, winH: 1.65 },
        ]);

        // 1F Grand Hallway Walls + West Lounge / East Banquet & Study cross-walls
        addWallZ(-hallW, -hd + 0.2, hd - 2.9, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.52, w: 2.25, h: 2.55, addInteractiveDoor: false },
          { kind: 'door', cz: hd * 0.34, w: 2.35, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.9, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.52, w: 2.2, h: 2.55, label: 'STUDY DOOR' },
          { kind: 'door', cz: hd * 0.34, w: 2.35, h: 2.55, addInteractiveDoor: false },
        ]);
        // Cross-wall dividing East Dining & NE Private Study
        addWallX(hallW + 0.2, hw - 0.2, -1.6, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cx: eastRoomCx, w: 2.2, h: 2.55, addInteractiveDoor: false },
        ]);

        // 2F Exterior Perimeter + Balconies
        addWallX(-hw, hw, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.58, w: 2.6, sillH: 0.9, winH: 1.7 },
          { kind: 'door', cx: 0, w: 2.55, h: 2.6, label: 'BALCONY DOOR' },
          { kind: 'window', cx: hw * 0.58, w: 2.6, sillH: 0.9, winH: 1.7 },
        ]);
        addWallX(-hw, hw, -hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.6, sillH: 0.9, winH: 1.65 },
          { kind: 'door', cx: 0, w: 2.35, h: 2.6, label: 'REAR BALCONY' },
          { kind: 'window', cx: hw * 0.52, w: 2.6, sillH: 0.9, winH: 1.65 },
        ]);
        addWallZ(-hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.4, sillH: 0.9, winH: 1.65 },
          { kind: 'window', cz: hd * 0.42, w: 2.4, sillH: 0.9, winH: 1.65 },
        ]);
        addWallZ(hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.4, sillH: 0.9, winH: 1.65 },
          { kind: 'window', cz: hd * 0.42, w: 2.4, sillH: 0.9, winH: 1.65 },
        ]);

        // 2F Gallery Hallway + Master Suite & Guest Suites
        addWallZ(-hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.52, w: 2.2, h: 2.55, label: 'MASTER SUITE' },
          { kind: 'door', cz: hd * 0.36, w: 2.25, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.52, w: 2.2, h: 2.55, label: 'GUEST SUITE' },
          { kind: 'door', cz: hd * 0.36, w: 2.25, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallX(westWingMinX + 0.08, -hallW - 0.15, -1.2, f1, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cx: westRoomCx, w: 2.15, h: 2.5, addInteractiveDoor: false },
        ]);

        addBalcony(0, hd, 1, Math.min(13.5, b.width * 0.62), 2.5, f1, palette.metal);
        addBalcony(0, -hd, -1, Math.min(10.8, b.width * 0.48), 2.1, f1, palette.metal);
        addRoofParapet(-hw, hw, -hd, hd, roofY, 1.08);
        addBox('wood', -2.0, roofY + 2.5, -1.6, 6.2, 0.16, 4.8, palette.woodDark);
        addBox('metal', -4.9, roofY + 1.25, -3.8, 0.18, 2.5, 0.18, palette.metal, { collide: true });
        addBox('metal', 0.9, roofY + 1.25, -3.8, 0.18, 2.5, 0.18, palette.metal, { collide: true });
        addBox('metal', -4.9, roofY + 1.25, 0.6, 0.18, 2.5, 0.18, palette.metal, { collide: true });
        addBox('metal', 0.9, roofY + 1.25, 0.6, 0.18, 2.5, 0.18, palette.metal, { collide: true });
        addBox('glowCyan', 0, roofY + 0.6, hd - 0.16, b.width * 0.48, 0.12, 0.08, '#38bdf8');

        addStaircase(s1X, s1Z, stairW, stairLen, f0, f1, 'north', palette.wood);
        addStaircase(s2X, s2Z, stairW, stairLen, f1, roofY, 'south', palette.wood);

        // Furnished Rooms (spacious centers clear of stair landings & doorways)
        addBox('fabric', 0, f0 + 0.02, 0, 3.0, 0.03, b.depth * 0.68, palette.fabricC); // Hallway runner rug
        addSofa(westRoomCx, f0, hd * 0.52, 0, palette.fabricA);
        addTable(westRoomCx, f0, hd * 0.52 + 1.4, 1.6, 0.85, 0);
        addKitchenCounter(hw - 2.3, f0, hd - 1.05, 2.8, 0.75, 0);
        addTable(eastRoomCx, f0, 1.5, 2.1, 1.1, 0);
        addChair(eastRoomCx, f0, 2.4, Math.PI, palette.fabricB, 'DINING CHAIR', [-0.66, 0]);
        addChair(eastRoomCx, f0, 0.6, 0, palette.fabricB, 'DINING CHAIR', [0.66, 0]);
        addDeskSetup(hw - 2.0, f0, -hd + 1.25, 0, true);
        addWardrobe(westRoomCx, f0, -hd + 0.85, 0);

        addBed(westRoomCx, f1, -hd + 1.75, 0, palette.fabricB);
        addWardrobe(westRoomCx, f1, hd - 0.95, Math.PI);
        addBed((hallW + eastWingMaxX) * 0.5, f1, -hd + 1.75, 0, palette.fabricA);
        addDeskSetup((hallW + eastWingMaxX) * 0.5, f1, hd - 1.25, Math.PI, true);
        addBench(2.6, f1, hd + 0.65, 0, 1.8, 'BALCONY BENCH');
        addSofa(-2.0, roofY, -1.6, 0, palette.fabricB);
        addTable(-2.0, roofY, -0.1, 1.6, 0.85, 0);

        // 12 Interior Candidate Loot Sockets across Hallway, Wings, Balconies & Roof
        addInteriorLoot(0, f0, 1.4, 'medium', 'scar');
        addInteriorLoot(westRoomCx, f0, -hd * 0.45, 'medium');
        addInteriorLoot(westRoomCx, f0, hd * 0.28, 'standard');
        addInteriorLoot(eastRoomCx, f0, hd * 0.48, 'medium');
        addInteriorLoot(eastRoomCx, f0, -hd * 0.52, 'high', 'parafal');
        addInteriorLoot(0, f1, 0, 'medium');
        addInteriorLoot(westRoomCx, f1, -hd * 0.34, 'high', 'ak24');
        addInteriorLoot((hallW + eastWingMaxX) * 0.5, f1, -hd * 0.34, 'high');
        addInteriorLoot(0, f1, hd + 1.25, 'medium');
        addInteriorLoot(0, f1, -hd - 1.05, 'medium');
        addInteriorLoot(-2.0, roofY, 2.0, 'high', 'awm');
        addInteriorLoot(2.8, roofY, -2.6, 'high');
      } else if (b.style === 'apartment_block') {
        // 3-Floor Spacious Apartment Block: Wide Central Hallway + 2 Multi-Room Units/Floor + Dual Balconies + Roof
        const floors = Math.max(3, b.floors ?? 3);
        const f1 = f0 + FLOOR_HEIGHT;
        const f2 = f0 + FLOOR_HEIGHT * 2;
        const roofY = f0 + FLOOR_HEIGHT * floors;
        const stairW = 2.3;
        const stairLen = 4.6;
        const bayW = -hw + 1.55;
        const bayE = hw - 1.55;
        const bayZ = 0;
        const hallW = Math.max(2.55, Math.min(3.25, hw * 0.26)); // ~5.1-6.5m wide central corridor
        const westCrossStart = bayW + stairW * 0.6;
        const eastCrossEnd = bayE - stairW * 0.6;
        const westRoomCx = (westCrossStart - hallW) * 0.5;
        const eastRoomCx = (hallW + eastCrossEnd) * 0.5;

        addBox('masonry', 0, -0.22, 0, b.width + 0.7, 0.44, b.depth + 0.7, palette.trim);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, palette.floor);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f1, SLAB_THICK, palette.upperFloor, {
          minX: bayW - stairW * 0.56,
          maxX: bayW + stairW * 0.56,
          minZ: bayZ - stairLen * 0.5 + 0.04,
          maxZ: bayZ + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f2, SLAB_THICK, palette.upperFloor, {
          minX: bayE - stairW * 0.56,
          maxX: bayE + stairW * 0.56,
          minZ: bayZ - stairLen * 0.5 + 0.04,
          maxZ: bayZ + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'east',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, palette.roof, {
          minX: bayW - stairW * 0.56,
          maxX: bayW + stairW * 0.56,
          minZ: bayZ - stairLen * 0.5 - 0.25,
          maxZ: bayZ + stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'west',
        });

        for (let f = 0; f < floors; f++) {
          const fy = f0 + f * FLOOR_HEIGHT;
          const topWallY = fy + FLOOR_HEIGHT - SLAB_THICK;
          const isGround = f === 0;

          addWallX(-hw, hw, hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cx: -hw * 0.54, w: 2.5, sillH: 0.95, winH: 1.55 },
            isGround
              ? { kind: 'door', cx: 0, w: 3.0, h: 2.7, label: 'APARTMENT LOBBY' }
              : { kind: 'door', cx: 0, w: 2.45, h: 2.6, label: `FLOOR ${f + 1} BALCONY` },
            { kind: 'window', cx: hw * 0.54, w: 2.5, sillH: 0.95, winH: 1.55 },
          ]);

          addWallX(-hw, hw, -hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cx: -hw * 0.54, w: 2.5, sillH: 0.95, winH: 1.55 },
            isGround
              ? { kind: 'door', cx: 0, w: 2.6, h: 2.6, open: true, label: 'COURTYARD EXIT' }
              : { kind: 'window', cx: 0, w: 2.5, sillH: 0.95, winH: 1.55 },
            { kind: 'window', cx: hw * 0.54, w: 2.5, sillH: 0.95, winH: 1.55 },
          ]);

          addWallZ(-hw, -hd, hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cz: -hd * 0.45, w: 2.3, sillH: 0.95, winH: 1.55 },
            { kind: 'window', cz: hd * 0.45, w: 2.3, sillH: 0.95, winH: 1.55 },
          ]);
          addWallZ(hw, -hd, hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cz: -hd * 0.45, w: 2.3, sillH: 0.95, winH: 1.55 },
            isGround
              ? { kind: 'door', cz: 0, w: 2.25, h: 2.55, label: 'SERVICE ENTRY' }
              : { kind: 'window', cz: 0, w: 2.3, sillH: 0.95, winH: 1.55 },
            { kind: 'window', cz: hd * 0.45, w: 2.3, sillH: 0.95, winH: 1.55 },
          ]);

          // Wide Central Corridor Partitions + Interior Unit Rooms on ALL floors
          addWallZ(-hallW, -hd + 0.2, hd - 2.7, fy, topWallY, PART_THICK, palette.wallInner, [
            { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.5, addInteractiveDoor: !isGround, label: `UNIT ${f + 1}A` },
            { kind: 'door', cz: hd * 0.34, w: 2.25, h: 2.5, addInteractiveDoor: false },
          ]);
          addWallZ(hallW, -hd + 0.2, hd - 2.7, fy, topWallY, PART_THICK, palette.wallInner, [
            { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.5, addInteractiveDoor: !isGround, label: `UNIT ${f + 1}B` },
            { kind: 'door', cz: hd * 0.34, w: 2.25, h: 2.5, addInteractiveDoor: false },
          ]);

          // Sub-room divider inside West & East units (stops flush against stair guardrails)
          if (-hallW - westCrossStart > 2.0) {
            addWallX(westCrossStart, -hallW - 0.15, -0.5, fy, topWallY, PART_THICK, palette.wallInner, [
              { kind: 'door', cx: westRoomCx, w: 2.1, h: 2.5, addInteractiveDoor: false },
            ]);
          }
          if (eastCrossEnd - hallW > 2.0) {
            addWallX(hallW + 0.15, eastCrossEnd, -0.5, fy, topWallY, PART_THICK, palette.wallInner, [
              { kind: 'door', cx: eastRoomCx, w: 2.1, h: 2.5, addInteractiveDoor: false },
            ]);
          }

          if (f > 0) {
            addBalcony(0, hd, 1, Math.min(10.2, b.width * 0.48), 2.2, fy, palette.metal);
          }

          // Furnish units safely away from stair bays & keep central corridor completely unobstructed
          if (f === 0) {
            addSofa(eastRoomCx, fy, 2.2, 0, palette.fabricA);
            addBench(-hallW + 0.55, fy, 2.2, Math.PI * 0.5, 1.75, 'LOBBY BENCH');
            addKitchenCounter(westRoomCx, fy, hd - 1.0, 2.4, 0.72, 0);
            addDeskSetup(eastRoomCx, fy, -hd + 1.15, 0, true);
            addInteriorLoot(0, fy, -2.0, 'standard', 'mp5');
            addInteriorLoot(westRoomCx, fy, -hd * 0.52, 'medium');
            addInteriorLoot(eastRoomCx, fy, hd * 0.58, 'medium');
          } else {
            addBed(westRoomCx, fy, -hd + 1.7, 0, f === 1 ? palette.fabricA : palette.fabricB);
            addBed(eastRoomCx, fy, -hd + 1.7, 0, f === 1 ? palette.fabricB : palette.fabricA);
            addTable(eastRoomCx, fy, 2.5, 1.45, 0.8, 0);
            addChair(eastRoomCx, fy, 3.3, Math.PI, palette.fabricC, 'CHAIR', [-0.66, 0]);
            addKitchenCounter(westRoomCx, fy, hd - 1.0, 2.2, 0.7, 0);
            addInteriorLoot(0, fy, 0.4, f === 2 ? 'high' : 'medium', f === 2 ? 'scar' : 'ump');
            addInteriorLoot(westRoomCx, fy, hd * 0.42, 'medium');
            addInteriorLoot(eastRoomCx, fy, -hd * 0.42, f === 2 ? 'high' : 'medium');
            addInteriorLoot(0, fy, hd + 1.1, 'medium');
          }
        }

        addStaircase(bayW, bayZ, stairW, stairLen, f0, f1, 'north', palette.wood);
        addStaircase(bayE, bayZ, stairW, stairLen, f1, f2, 'north', palette.wood);
        addStaircase(bayW, bayZ, stairW, stairLen, f2, roofY, 'south', palette.wood);

        addRoofParapet(-hw, hw, -hd, hd, roofY, 1.08);
        addBox('metal', 2.8, roofY + 0.75, -2.2, 2.2, 1.5, 1.5, palette.metal, { collide: true });
        addBox('metal', 2.8, roofY + 0.75, 2.0, 1.9, 1.4, 1.5, '#475569', { collide: true });
        addBox('metal', -0.4, roofY + 2.1, -hd + 1.0, 0.16, 4.2, 0.16, palette.metal, { collide: true });
        addBox('glowAmber', -0.4, roofY + 4.15, -hd + 1.0, 0.24, 0.24, 0.24, '#f59e0b');
        addInteriorLoot(0.2, roofY, 0.2, 'high', 'parafal');
        addInteriorLoot(-2.8, roofY, -3.2, 'high');
        addInteriorLoot(0.2, roofY, 3.8, 'medium');
      } else if (b.style === 'huge_house') {
        // 2-Floor Large Multi-Room Suburban Home: Wide Central Foyer/Hallway + 4 Rooms/Floor + Balcony + Roof
        const f1 = f0 + FLOOR_HEIGHT;
        const roofY = f0 + FLOOR_HEIGHT * 2;
        const stairW = 2.25;
        const stairLen = 4.6;
        const s1X = -hw + 1.55;
        const s1Z = 0;
        const s2X = hw - 1.55;
        const s2Z = 0;
        const hallW = Math.max(2.35, Math.min(3.05, hw * 0.26)); // ~4.7-6.1m wide hallway!
        const westWingMinX = s1X + stairW * 0.58;
        const eastWingMaxX = s2X - stairW * 0.58;
        const westRoomCx = (westWingMinX - hallW) * 0.5;
        const eastRoomCx = (hallW + hw) * 0.5;

        addBox('masonry', 0, -0.22, 0, b.width + 0.6, 0.44, b.depth + 0.6, palette.trim);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, palette.floor);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f1, SLAB_THICK, palette.upperFloor, {
          minX: s1X - stairW * 0.56,
          maxX: s1X + stairW * 0.56,
          minZ: s1Z - stairLen * 0.5 + 0.04,
          maxZ: s1Z + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, palette.roof, {
          minX: s2X - stairW * 0.56,
          maxX: s2X + stairW * 0.56,
          minZ: s2Z - stairLen * 0.5 - 0.25,
          maxZ: s2Z + stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'east',
        });

        // 1F Exterior Walls (3 accessible entrances: Front, Back, East Side)
        addWallX(-hw, hw, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.55, w: 2.5, sillH: 0.9, winH: 1.55 },
          { kind: 'door', cx: 0, w: 2.7, h: 2.65, label: 'FRONT DOOR' },
          { kind: 'window', cx: hw * 0.55, w: 2.5, sillH: 0.9, winH: 1.55 },
        ]);
        addWallX(-hw, hw, -hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.3, sillH: 0.9, winH: 1.55 },
          { kind: 'door', cx: 0, w: 2.5, h: 2.6, open: true, label: 'BACK PATIO DOOR' },
          { kind: 'window', cx: hw * 0.52, w: 2.3, sillH: 0.9, winH: 1.55 },
        ]);
        addWallZ(-hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.55 },
          { kind: 'window', cz: hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.55 },
        ]);
        addWallZ(hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.45, w: 2.2, sillH: 0.9, winH: 1.55 },
          { kind: 'door', cz: 0, w: 2.25, h: 2.55, label: 'SIDE ENTRY' },
          { kind: 'window', cz: hd * 0.45, w: 2.2, sillH: 0.9, winH: 1.55 },
        ]);

        // 1F Central Hallway + Living Room + Dining/Kitchen + Study Room
        addWallZ(-hallW, -hd + 0.2, hd - 2.7, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.5, w: 2.15, h: 2.55, addInteractiveDoor: false },
          { kind: 'door', cz: hd * 0.34, w: 2.25, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.7, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.5, w: 2.15, h: 2.55, label: 'STUDY DOOR' },
          { kind: 'door', cz: hd * 0.34, w: 2.25, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallX(hallW + 0.15, hw - 0.2, -1.75, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cx: eastRoomCx, w: 2.15, h: 2.5, addInteractiveDoor: false },
        ]);

        // 2F Exterior Walls + Gallery Hallway + Bedrooms
        addWallX(-hw, hw, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.54, w: 2.4, sillH: 0.9, winH: 1.55 },
          { kind: 'door', cx: 0, w: 2.45, h: 2.6, label: 'BALCONY DOOR' },
          { kind: 'window', cx: hw * 0.54, w: 2.4, sillH: 0.9, winH: 1.55 },
        ]);
        addWallX(-hw, hw, -hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.48, w: 2.4, sillH: 0.9, winH: 1.55 },
          { kind: 'window', cx: hw * 0.48, w: 2.4, sillH: 0.9, winH: 1.55 },
        ]);
        addWallZ(-hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.55 },
          { kind: 'window', cz: hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.55 },
        ]);
        addWallZ(hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.55 },
          { kind: 'window', cz: hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.55 },
        ]);

        addWallZ(-hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.5, w: 2.15, h: 2.55, label: 'MASTER BEDROOM' },
          { kind: 'door', cz: hd * 0.34, w: 2.2, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.5, w: 2.15, h: 2.55, label: 'GUEST BEDROOM' },
          { kind: 'door', cz: hd * 0.34, w: 2.2, h: 2.55, addInteractiveDoor: false },
        ]);

        addBalcony(0, hd, 1, Math.min(10.5, b.width * 0.54), 2.2, f1, palette.woodDark);
        addRoofParapet(-hw, hw, -hd, hd, roofY, 1.02);
        addBox('masonry', -2.0, roofY + 0.9, -hd + 1.1, 1.3, 1.8, 1.1, palette.trim, { collide: true });

        addStaircase(s1X, s1Z, stairW, stairLen, f0, f1, 'north', palette.wood);
        addStaircase(s2X, s2Z, stairW, stairLen, f1, roofY, 'south', palette.wood);

        // Furnished Rooms
        addSofa(westRoomCx, f0, hd * 0.44, 0, palette.fabricA);
        addTable(westRoomCx, f0, hd * 0.44 + 1.35, 1.45, 0.78, 0);
        addKitchenCounter(hw - 2.0, f0, hd - 1.0, 2.5, 0.74, 0);
        addDeskSetup(hw - 1.9, f0, -hd + 1.15, 0, true);
        addBed(westRoomCx, f1, -hd + 1.7, 0, palette.fabricB);
        addWardrobe(westRoomCx, f1, hd - 0.95, Math.PI);
        addBed((hallW + eastWingMaxX) * 0.5, f1, -hd + 1.7, 0, palette.fabricA);
        addDeskSetup((hallW + eastWingMaxX) * 0.5, f1, hd - 1.2, Math.PI, true);

        addInteriorLoot(0, f0, 0.4, 'standard', 'mp40');
        addInteriorLoot(westRoomCx, f0, -hd * 0.48, 'medium');
        addInteriorLoot(eastRoomCx, f0, hd * 0.42, 'medium');
        addInteriorLoot(eastRoomCx, f0, -hd * 0.48, 'medium');
        addInteriorLoot(0, f1, -0.4, 'medium', 'ak24');
        addInteriorLoot(westRoomCx, f1, hd * 0.36, 'medium');
        addInteriorLoot((hallW + eastWingMaxX) * 0.5, f1, -hd * 0.42, 'high');
        addInteriorLoot(0, f1, hd + 1.1, 'medium');
        addInteriorLoot(-0.6, roofY, -2.2, 'high', 'scar');
        addInteriorLoot(0.4, roofY, 2.6, 'high');
      } else if (b.style === 'military_base') {
        // 2-Floor Reinforced Military Command Bunker + Wide Corridor + Armory & Comms Rooms + Helipad Roof
        const f1 = f0 + FLOOR_HEIGHT;
        const roofY = f0 + FLOOR_HEIGHT * 2;
        const stairW = 2.4;
        const stairLen = 4.6;
        const s1X = -hw + 1.6;
        const s1Z = 0;
        const s2X = hw - 1.6;
        const s2Z = 0;
        const hallW = Math.max(2.45, Math.min(3.15, hw * 0.26));
        const westWingMinX = s1X + stairW * 0.58;
        const eastWingMaxX = s2X - stairW * 0.58;
        const westRoomCx = (westWingMinX - hallW) * 0.5;
        const eastRoomCx = (hallW + hw) * 0.5;

        addBox('masonry', 0, -0.24, 0, b.width + 0.8, 0.48, b.depth + 0.8, '#334155');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.22, '#475569');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f1, SLAB_THICK, '#334155', {
          minX: s1X - stairW * 0.56,
          maxX: s1X + stairW * 0.56,
          minZ: s1Z - stairLen * 0.5 + 0.04,
          maxZ: s1Z + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, '#334155', {
          minX: s2X - stairW * 0.56,
          maxX: s2X + stairW * 0.56,
          minZ: s2Z - stairLen * 0.5 - 0.25,
          maxZ: s2Z + stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'east',
        });

        // 1F Blast Walls (3 steel entrances)
        addWallX(-hw, hw, hd, f0, f1 - SLAB_THICK, 0.3, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.55, w: 2.6, sillH: 1.15, winH: 1.1 },
          { kind: 'door', cx: 0, w: 3.0, h: 2.7, steel: true, label: 'BLAST GATE' },
          { kind: 'window', cx: hw * 0.55, w: 2.6, sillH: 1.15, winH: 1.1 },
        ]);
        addWallX(-hw, hw, -hd, f0, f1 - SLAB_THICK, 0.3, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.5, sillH: 1.15, winH: 1.1 },
          { kind: 'door', cx: 0, w: 2.85, h: 2.65, steel: true, open: true, label: 'MOTOR BAY DOOR' },
          { kind: 'window', cx: hw * 0.52, w: 2.5, sillH: 1.15, winH: 1.1 },
        ]);
        addWallZ(-hw, -hd, hd, f0, f1 - SLAB_THICK, 0.3, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.45, w: 2.4, sillH: 1.15, winH: 1.1 },
          { kind: 'window', cz: hd * 0.45, w: 2.4, sillH: 1.15, winH: 1.1 },
        ]);
        addWallZ(hw, -hd, hd, f0, f1 - SLAB_THICK, 0.3, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.48, w: 2.3, sillH: 1.15, winH: 1.1 },
          { kind: 'door', cz: 0, w: 2.3, h: 2.6, steel: true, label: 'AIRLOCK DOOR' },
          { kind: 'window', cz: hd * 0.48, w: 2.3, sillH: 1.15, winH: 1.1 },
        ]);

        // 1F Command Corridor + Ops Bay (West) + Armory & Comms Rooms (East)
        addWallZ(-hallW, -hd + 0.2, hd - 2.8, f0, f1 - SLAB_THICK, 0.2, '#475569', [
          { kind: 'door', cz: -hd * 0.45, w: 2.2, h: 2.55, steel: true, addInteractiveDoor: false },
          { kind: 'door', cz: hd * 0.35, w: 2.25, h: 2.55, steel: true, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.8, f0, f1 - SLAB_THICK, 0.2, '#475569', [
          { kind: 'door', cz: -hd * 0.5, w: 2.2, h: 2.55, steel: true, label: 'COMMS DOOR' },
          { kind: 'door', cz: hd * 0.35, w: 2.25, h: 2.55, steel: true, label: 'ARMORY DOOR' },
        ]);
        addWallX(hallW + 0.15, hw - 0.2, -1.75, f0, f1 - SLAB_THICK, 0.2, '#475569', [
          { kind: 'door', cx: eastRoomCx, w: 2.15, h: 2.5, steel: true, addInteractiveDoor: false },
        ]);

        // 2F Ops Deck + Barracks & Watchtower Balcony
        addWallX(-hw, hw, hd, f1, roofY - SLAB_THICK, 0.28, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.7, sillH: 1.05, winH: 1.25 },
          { kind: 'door', cx: 0, w: 2.55, h: 2.55, steel: true, label: 'WATCH DECK' },
          { kind: 'window', cx: hw * 0.52, w: 2.7, sillH: 1.05, winH: 1.25 },
        ]);
        addWallX(-hw, hw, -hd, f1, roofY - SLAB_THICK, 0.28, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.45, w: 2.6, sillH: 1.05, winH: 1.25 },
          { kind: 'window', cx: hw * 0.45, w: 2.6, sillH: 1.05, winH: 1.25 },
        ]);
        addWallZ(-hw, -hd, hd, f1, roofY - SLAB_THICK, 0.28, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.4, w: 2.6, sillH: 1.05, winH: 1.25 },
          { kind: 'window', cz: hd * 0.4, w: 2.6, sillH: 1.05, winH: 1.25 },
        ]);
        addWallZ(hw, -hd, hd, f1, roofY - SLAB_THICK, 0.28, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.4, w: 2.6, sillH: 1.05, winH: 1.25 },
          { kind: 'window', cz: hd * 0.4, w: 2.6, sillH: 1.05, winH: 1.25 },
        ]);

        addWallZ(-hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, 0.2, '#475569', [
          { kind: 'door', cz: -hd * 0.45, w: 2.2, h: 2.5, steel: true, label: 'BARRACKS DOOR' },
          { kind: 'door', cz: hd * 0.35, w: 2.25, h: 2.5, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, 0.2, '#475569', [
          { kind: 'door', cz: -hd * 0.45, w: 2.2, h: 2.5, steel: true, addInteractiveDoor: false },
        ]);

        addBalcony(0, hd, 1, Math.min(12.2, b.width * 0.56), 2.3, f1, '#334155');
        addRoofParapet(-hw, hw, -hd, hd, roofY, 1.15, true);

        addBox('glowAmber', 0, roofY + 0.03, 0, 4.2, 0.05, 0.38, '#f59e0b');
        addBox('glowAmber', -1.9, roofY + 0.03, 0, 0.38, 0.05, 3.8, '#f59e0b');
        addBox('glowAmber', 1.9, roofY + 0.03, 0, 0.38, 0.05, 3.8, '#f59e0b');
        addBox('metal', -3.2, roofY + 2.2, -hd + 1.2, 0.22, 4.4, 0.22, '#1e293b', { collide: true });
        addBox('glowCyan', -3.2, roofY + 4.3, -hd + 1.2, 1.4, 0.22, 0.4, '#38bdf8');

        addStaircase(s1X, s1Z, stairW, stairLen, f0, f1, 'north', '#475569', 'metal');
        addStaircase(s2X, s2Z, stairW, stairLen, f1, roofY, 'south', '#475569', 'metal');

        // Military Ops Props (central command corridor kept unobstructed)
        addTable(westRoomCx, f0, hd * 0.36, 2.2, 1.25, 0);
        addBox('glowCyan', westRoomCx, f0 + 0.82, hd * 0.36, 1.45, 0.08, 0.82, '#38bdf8');
        addServerRack(hw - 1.35, f0, -hd + 1.35, 0);
        addServerRack(hw - 1.35, f0, -hd + 2.75, 0);
        addCrateStack(eastRoomCx - 0.6, f0, hd - 2.3, true);
        addBed(westRoomCx, f1, -hd + 1.75, 0, '#3f6212');
        addDeskSetup((hallW + eastWingMaxX) * 0.5, f1, 2.0, Math.PI, true);
        addCrateStack(-2.0, roofY, 1.8, false);

        addInteriorLoot(eastRoomCx, f0, -hd * 0.52, 'high', 'scar');
        addInteriorLoot(eastRoomCx, f0, 2.2, 'high', 'm1887');
        addInteriorLoot(westRoomCx, f0, -hd * 0.52, 'medium');
        addInteriorLoot(0, f0, 1.6, 'medium');
        addInteriorLoot(0, f1, 0, 'high', 'parafal');
        addInteriorLoot(westRoomCx, f1, hd * 0.42, 'high');
        addInteriorLoot((hallW + eastWingMaxX) * 0.5, f1, -hd * 0.48, 'high');
        addInteriorLoot(0, f1, hd + 1.1, 'medium');
        addInteriorLoot(0, roofY, 0, 'high', 'ak24');
        addInteriorLoot(3.0, roofY, -3.2, 'high', 'awm');
      } else if (b.style === 'warehouse') {
        // High-Ceiling Industrial Warehouse + Office + Tool Lockup + 3.6m Wide Mezzanine + Roof
        const wallH = FLOOR_HEIGHT * 2;
        const mezzY = f0 + FLOOR_HEIGHT;
        const roofY = f0 + wallH;
        const stairW = 2.3;
        const stairLen = 4.6;
        const s1X = -hw + 1.55;
        const s1Z = 1.2;
        const s2X = hw - 1.55;
        const s2Z = 0;
        const mezzW = Math.min(3.6, Math.max(3.2, hw * 0.3));

        addBox('masonry', 0, -0.2, 0, b.width + 0.6, 0.4, b.depth + 0.6, '#334155');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, '#475569');

        // Wide U-shaped 2F Steel Catwalk Mezzanine (open stairwell landing at West stair arrival z = -1.1)
        const westLandingEndZ = s1Z - stairLen * 0.5; // -1.1
        addWalkableRect(-hw, hw, -hd, -hd + mezzW, mezzY, 0.2, '#334155', 'metal');
        addWalkableRect(-hw, -hw + mezzW, -hd + mezzW, westLandingEndZ, mezzY, 0.2, '#334155', 'metal');
        addWalkableRect(hw - mezzW, hw, -hd + mezzW, hd, mezzY, 0.2, '#334155', 'metal');
        addBox('metal', 0, mezzY + 0.52, -hd + mezzW - 0.06, b.width - mezzW * 2, 1.04, 0.12, '#f59e0b', { collide: true });
        const westRailLen = westLandingEndZ - (-hd + mezzW);
        if (westRailLen > 0.2) {
          addBox(
            'metal',
            -hw + mezzW - 0.06,
            mezzY + 0.52,
            (-hd + mezzW + westLandingEndZ) * 0.5,
            0.12,
            1.04,
            westRailLen,
            '#f59e0b',
            { collide: true },
          );
        }
        addBox('metal', hw - mezzW + 0.06, mezzY + 0.52, mezzW * 0.5, 0.12, 1.04, b.depth - mezzW, '#f59e0b', {
          collide: true,
        });

        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, palette.roof, {
          minX: s2X - stairW * 0.56,
          maxX: s2X + stairW * 0.56,
          minZ: s2Z - stairLen * 0.5 - 0.25,
          maxZ: s2Z + stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'east',
        });

        // Huge Cargo Bay Doors Front & Rear + Side Personnel Door + Clerestory Windows
        addWallX(-hw, hw, hd, f0, mezzY, WALL_THICK, palette.wallOuter, [
          { kind: 'door', cx: 0, w: 3.8, h: 3.35, steel: true, open: true, label: 'CARGO BAY DOOR' },
        ]);
        addWallX(-hw, hw, hd, mezzY, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.45, w: 3.0, sillH: 0.9, winH: 1.5 },
          { kind: 'window', cx: hw * 0.45, w: 3.0, sillH: 0.9, winH: 1.5 },
        ]);

        addWallX(-hw, hw, -hd, f0, mezzY, WALL_THICK, palette.wallOuter, [
          { kind: 'door', cx: 0, w: 3.6, h: 3.25, steel: true, label: 'LOADING DOOR' },
        ]);
        addWallX(-hw, hw, -hd, mezzY, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: 0, w: 4.4, sillH: 0.9, winH: 1.5 },
        ]);

        addWallZ(-hw, -hd, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'door', cz: hd * 0.65, w: 2.25, h: 2.6, steel: true, label: 'PERSONNEL DOOR' },
          { kind: 'window', cz: 0, w: 3.6, sillH: 4.8, winH: 1.5 },
        ]);
        addWallZ(hw, -hd, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: 0, w: 3.6, sillH: 4.8, winH: 1.5 },
        ]);

        // 1F Enclosed Foreman Office (SE) + Tool Lockup Room (NE)
        const offW = 5.4;
        const offD = 4.8;
        addWallX(hw - offW, hw - 0.2, hd - offD, f0, mezzY - 0.2, PART_THICK, palette.wallInner, [
          { kind: 'door', cx: hw - offW * 0.5, w: 2.15, h: 2.55, label: 'OFFICE DOOR' },
        ]);
        addWallZ(hw - offW, hd - offD, hd - 0.2, f0, mezzY - 0.2, PART_THICK, palette.wallInner, [
          { kind: 'window', cz: hd - offD * 0.5, w: 2.2, sillH: 0.95, winH: 1.3 },
        ]);
        addWallX(hw - offW, hw - 0.2, -hd + offD - 0.2, f0, mezzY - 0.2, PART_THICK, palette.wallInner, [
          { kind: 'door', cx: hw - offW * 0.5, w: 2.15, h: 2.55, steel: true, label: 'TOOL LOCKUP' },
        ]);
        addWallZ(hw - offW, -hd + 0.2, -hd + offD - 0.2, f0, mezzY - 0.2, PART_THICK, palette.wallInner, [
          { kind: 'window', cz: -hd + offD * 0.5, w: 2.1, sillH: 0.95, winH: 1.3 },
        ]);
        addDeskSetup(hw - 2.3, f0, hd - 1.85, Math.PI, true);
        addCrateStack(hw - 3.0, f0, -hd + 1.65, false);

        // 2F North Dispatch Room on Mezzanine (walk-through catwalk doors + overlook window)
        addWallX(-3.2, 3.2, -hd + mezzW - 0.15, mezzY, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'window', cx: 0, w: 3.2, sillH: 0.95, winH: 1.35 },
        ]);
        addWallZ(-3.2, -hd + 0.2, -hd + mezzW - 0.15, mezzY, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd + mezzW * 0.5, w: 2.1, h: 2.5, addInteractiveDoor: false },
        ]);
        addWallZ(3.2, -hd + 0.2, -hd + mezzW - 0.15, mezzY, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd + mezzW * 0.5, w: 2.1, h: 2.5, addInteractiveDoor: false },
        ]);
        addDeskSetup(-1.55, mezzY, -hd + 1.05, 0, true);

        addStaircase(s1X, s1Z, stairW, stairLen, f0, mezzY, 'north', '#64748b', 'metal');
        addStaircase(s2X, s2Z, stairW, stairLen, mezzY, roofY, 'south', '#64748b', 'metal');

        // Central Cargo Aisles (wide clear corridors around stacks)
        addCrateStack(-2.2, f0, -0.4, true);
        addCrateStack(0.8, f0, 1.6, false);
        addBox('metal', -0.5, f0 + 1.4, -3.6, 3.6, 2.8, 1.0, '#334155', { collide: true });
        addRoofParapet(-hw, hw, -hd, hd, roofY, 0.98);
        addBox('metal', -2.8, roofY + 0.65, 0, 2.8, 1.3, 2.0, '#475569', { collide: true });

        addInteriorLoot(-0.4, f0, -5.6, 'medium');
        addInteriorLoot(-3.4, f0, 1.8, 'medium', 'm1887');
        addInteriorLoot(-3.2, f0, 4.8, 'standard');
        addInteriorLoot(hw - 2.7, f0, hd - 3.3, 'high', 'ump');
        addInteriorLoot(hw - 3.2, f0, -hd + 3.1, 'high', 'ak24');
        addInteriorLoot(-4.8, mezzY, -hd + mezzW * 0.5, 'medium');
        addInteriorLoot(1.4, mezzY, -hd + mezzW * 0.55, 'high', 'scar');
        addInteriorLoot(4.8, mezzY, -hd + mezzW * 0.5, 'high');
        addInteriorLoot(-hw + mezzW * 0.5, mezzY, -3.2, 'medium');
        addInteriorLoot(-1.8, roofY, -3.0, 'high');
        addInteriorLoot(1.8, roofY, 2.4, 'high', 'scar');
      } else if (b.style === 'abandoned_building') {
        // 2-Floor Spacious Ruined Building: Wide Central Hallway + 4 Partitioned Rooms + 3 Breached Entrances + Roof
        const f1 = f0 + FLOOR_HEIGHT;
        const roofY = f0 + FLOOR_HEIGHT * 2;
        const stairW = 2.25;
        const stairLen = 4.6;
        const s1X = -hw + 1.5;
        const s1Z = 0;
        const s2X = hw - 1.5;
        const s2Z = 0;
        const hallW = Math.max(2.15, Math.min(2.75, hw * 0.25));
        const westWingMinX = s1X + stairW * 0.58;
        const eastWingMaxX = s2X - stairW * 0.58;
        const westRoomCx = (westWingMinX - hallW) * 0.5;
        const eastRoomCx = (hallW + hw) * 0.5;

        addBox('masonry', 0, -0.2, 0, b.width + 0.5, 0.4, b.depth + 0.5, '#44403c');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, '#57534e');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f1, SLAB_THICK, '#57534e', {
          minX: s1X - stairW * 0.56,
          maxX: s1X + stairW * 0.56,
          minZ: s1Z - stairLen * 0.5 + 0.04,
          maxZ: s1Z + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, '#44403c', {
          minX: s2X - stairW * 0.56,
          maxX: s2X + stairW * 0.56,
          minZ: s2Z - stairLen * 0.5 - 0.25,
          maxZ: s2Z + stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'east',
        });

        // 1F Exterior Walls (Front ajar door, wide breached rear gap, breached side gap)
        addWallX(-hw, hw, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.54, w: 2.4, sillH: 0.9, winH: 1.5, broken: true },
          { kind: 'door', cx: 0, w: 2.55, h: 2.6, open: true, label: 'CREAKING DOOR' },
          { kind: 'window', cx: hw * 0.54, w: 2.4, sillH: 0.9, winH: 1.5, broken: true },
        ]);
        addWallX(-hw, hw, -hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.3, sillH: 0.9, winH: 1.5, broken: true },
          { kind: 'door', cx: 0, w: 2.8, h: 2.75, addInteractiveDoor: false },
          { kind: 'window', cx: hw * 0.52, w: 2.3, sillH: 0.9, winH: 1.5, broken: true },
        ]);
        addWallZ(-hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.5, broken: true },
          { kind: 'window', cz: hd * 0.42, w: 2.3, sillH: 0.9, winH: 1.5, broken: true },
        ]);
        addWallZ(hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.46, w: 2.2, sillH: 0.9, winH: 1.5, broken: true },
          { kind: 'door', cz: 0, w: 2.35, h: 2.6, addInteractiveDoor: false },
          { kind: 'window', cz: hd * 0.46, w: 2.2, sillH: 0.9, winH: 1.5, broken: true },
        ]);

        // 1F Ruined Hallway & Multi-Room Partitions
        addWallZ(-hallW, -hd + 0.2, hd - 2.6, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.55, addInteractiveDoor: false },
          { kind: 'door', cz: hd * 0.35, w: 2.2, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.6, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.55, open: true, label: 'BROKEN DOOR' },
          { kind: 'door', cz: hd * 0.35, w: 2.2, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallX(hallW + 0.15, hw - 0.2, -1.7, f0, f1 - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cx: eastRoomCx, w: 2.15, h: 2.5, addInteractiveDoor: false },
        ]);

        // 2F Exterior Walls + Multi-Room Partitions
        addWallX(-hw, hw, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.5, w: 2.4, sillH: 0.9, winH: 1.5, broken: true },
          { kind: 'window', cx: hw * 0.5, w: 2.4, sillH: 0.9, winH: 1.5, broken: true },
        ]);
        addWallX(-hw, hw, -hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.42, w: 2.5, sillH: 0.9, winH: 1.5, broken: true },
          { kind: 'window', cx: hw * 0.42, w: 2.5, sillH: 0.9, winH: 1.5, broken: true },
        ]);
        addWallZ(-hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: 0, w: 2.5, sillH: 0.9, winH: 1.5, broken: true },
        ]);
        addWallZ(hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: 0, w: 2.5, sillH: 0.9, winH: 1.5, broken: true },
        ]);

        addWallZ(-hallW, -hd + 0.2, hd - 2.6, f1, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.45, w: 2.15, h: 2.5, addInteractiveDoor: false },
          { kind: 'door', cz: hd * 0.35, w: 2.2, h: 2.5, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.6, f1, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.45, w: 2.15, h: 2.5, addInteractiveDoor: false },
        ]);

        addRoofParapet(-hw, hw, -hd, hd, roofY, 0.95, true);
        addStaircase(s1X, s1Z, stairW, stairLen, f0, f1, 'north', palette.woodDark);
        addStaircase(s2X, s2Z, stairW, stairLen, f1, roofY, 'south', palette.woodDark);

        addTable(eastRoomCx, f0, hd * 0.42, 1.55, 0.88, 0);
        addChair(eastRoomCx, f0, hd * 0.42 + 0.85, Math.PI, palette.fabricC, 'CHAIR', [-0.66, 0]);
        addBox('masonry', -hallW + 0.85, f0 + 0.3, -2.0, 0.95, 0.6, 0.88, '#78716c', { collide: true, steppable: true });
        addCrateStack((hallW + eastWingMaxX) * 0.5 - 0.5, f1, -hd + 1.65, false);
        addBed(westRoomCx, f1, hd - 1.65, 0, '#57534e');
        addCrateStack(-0.8, roofY, 0.8, false);

        addInteriorLoot(0, f0, 2.4, 'medium', 'mp5');
        addInteriorLoot(westRoomCx, f0, -hd * 0.48, 'standard');
        addInteriorLoot(eastRoomCx, f0, -hd * 0.48, 'medium');
        addInteriorLoot(0, f1, -0.4, 'high', 'ak24');
        addInteriorLoot((hallW + eastWingMaxX) * 0.5, f1, hd * 0.42, 'medium');
        addInteriorLoot(westRoomCx, f1, -hd * 0.44, 'high');
        addInteriorLoot(0.8, roofY, 3.0, 'high', 'parafal');
        addInteriorLoot(0, roofY, -2.6, 'high');
      } else if (b.style === 'futuristic_lab') {
        // 2-Floor High-Tech Research & Holographic Command Facility + Rooftop Solar/Comms Deck
        const f1 = f0 + FLOOR_HEIGHT;
        const roofY = f0 + FLOOR_HEIGHT * 2;
        const stairW = 2.35;
        const stairLen = 4.6;
        const s1X = -hw + 1.55;
        const s1Z = 0;
        const s2X = hw - 1.55;
        const s2Z = 0;
        const hallW = Math.max(2.4, Math.min(3.1, hw * 0.26));
        const westWingMinX = s1X + stairW * 0.58;
        const eastWingMaxX = s2X - stairW * 0.58;
        const westRoomCx = (westWingMinX - hallW) * 0.5;
        const eastRoomCx = (hallW + hw) * 0.5;

        addBox('masonry', 0, -0.22, 0, b.width + 0.75, 0.44, b.depth + 0.75, '#0f172a');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.22, '#1e293b');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f1, SLAB_THICK, '#334155', {
          minX: s1X - stairW * 0.56,
          maxX: s1X + stairW * 0.56,
          minZ: s1Z - stairLen * 0.5 + 0.04,
          maxZ: s1Z + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, '#1e293b', {
          minX: s2X - stairW * 0.56,
          maxX: s2X + stairW * 0.56,
          minZ: s2Z - stairLen * 0.5 - 0.25,
          maxZ: s2Z + stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'east',
        });

        // 1F Exterior Composite Armor Walls + Vaultable Panoramic Lab Windows + 3 Airlock Entrances
        addWallX(-hw, hw, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.56, w: 2.8, sillH: 0.88, winH: 1.72 },
          { kind: 'door', cx: 0, w: 2.9, h: 2.7, steel: true, label: 'LAB ATRIUM GATE' },
          { kind: 'window', cx: hw * 0.56, w: 2.8, sillH: 0.88, winH: 1.72 },
        ]);
        addWallX(-hw, hw, -hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.6, sillH: 0.88, winH: 1.68 },
          { kind: 'door', cx: 0, w: 2.65, h: 2.65, steel: true, open: true, label: 'REAR BIO-AIRLOCK' },
          { kind: 'window', cx: hw * 0.52, w: 2.6, sillH: 0.88, winH: 1.68 },
        ]);
        addWallZ(-hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.45, w: 2.5, sillH: 0.88, winH: 1.65 },
          { kind: 'window', cz: hd * 0.45, w: 2.5, sillH: 0.88, winH: 1.65 },
        ]);
        addWallZ(hw, -hd, hd, f0, f1 - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.46, w: 2.4, sillH: 0.88, winH: 1.65 },
          { kind: 'door', cz: 0, w: 2.35, h: 2.6, steel: true, label: 'CARGO AIRLOCK' },
          { kind: 'window', cz: hd * 0.46, w: 2.4, sillH: 0.88, winH: 1.65 },
        ]);

        // 1F Clean Corridor + Bio-Research Wing + Mainframe Server Wing
        addWallZ(-hallW, -hd + 0.2, hd - 2.7, f0, f1 - SLAB_THICK, PART_THICK, '#334155', [
          { kind: 'door', cz: -hd * 0.48, w: 2.2, h: 2.55, steel: true, addInteractiveDoor: false },
          { kind: 'door', cz: hd * 0.35, w: 2.25, h: 2.55, steel: true, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.7, f0, f1 - SLAB_THICK, PART_THICK, '#334155', [
          { kind: 'door', cz: -hd * 0.48, w: 2.2, h: 2.55, steel: true, label: 'SERVER VAULT' },
          { kind: 'door', cz: hd * 0.35, w: 2.25, h: 2.55, steel: true, addInteractiveDoor: false },
        ]);
        addWallX(hallW + 0.15, hw - 0.2, -1.65, f0, f1 - SLAB_THICK, PART_THICK, '#334155', [
          { kind: 'door', cx: eastRoomCx, w: 2.15, h: 2.5, addInteractiveDoor: false },
        ]);

        // 2F Observation Labs + Command Gallery
        addWallX(-hw, hw, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.54, w: 2.6, sillH: 0.88, winH: 1.7 },
          { kind: 'door', cx: 0, w: 2.55, h: 2.6, steel: true, label: 'OBS DECK DOOR' },
          { kind: 'window', cx: hw * 0.54, w: 2.6, sillH: 0.88, winH: 1.7 },
        ]);
        addWallX(-hw, hw, -hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.48, w: 2.5, sillH: 0.88, winH: 1.65 },
          { kind: 'window', cx: hw * 0.48, w: 2.5, sillH: 0.88, winH: 1.65 },
        ]);
        addWallZ(-hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.4, sillH: 0.88, winH: 1.65 },
          { kind: 'window', cz: hd * 0.42, w: 2.4, sillH: 0.88, winH: 1.65 },
        ]);
        addWallZ(hw, -hd, hd, f1, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.4, sillH: 0.88, winH: 1.65 },
          { kind: 'window', cz: hd * 0.42, w: 2.4, sillH: 0.88, winH: 1.65 },
        ]);
        addWallZ(-hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, PART_THICK, '#334155', [
          { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.55, steel: true, label: 'CRYOLAB DOOR' },
          { kind: 'door', cz: hd * 0.35, w: 2.2, h: 2.55, addInteractiveDoor: false },
        ]);
        addWallZ(hallW, -hd + 0.2, hd - 2.7, f1, roofY - SLAB_THICK, PART_THICK, '#334155', [
          { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.55, steel: true, addInteractiveDoor: false },
        ]);

        addBalcony(0, hd, 1, Math.min(12.2, b.width * 0.56), 2.4, f1, '#0284c7');
        addRoofParapet(-hw, hw, -hd, hd, roofY, 1.06, true);

        // Subtle Futuristic Sci-Fi Trims, Solar Collector Array & Comms Mast
        addBox('glowCyan', 0, f1 - 0.14, hd + 0.14, b.width * 0.72, 0.1, 0.08, b.accentColorHex);
        addBox('glowCyan', 0, roofY - 0.14, hd + 0.14, b.width * 0.72, 0.1, 0.08, b.accentColorHex);
        addBox('metal', -2.8, roofY + 0.55, -hd + 2.4, 3.8, 0.14, 2.3, '#0f172a', { collide: true, localRotY: 0.08 });
        addBox('glowCyan', -2.8, roofY + 0.64, -hd + 2.4, 3.5, 0.04, 2.0, '#38bdf8');
        addBox('metal', 3.0, roofY + 2.1, -hd + 1.4, 0.22, 4.2, 0.22, '#334155', { collide: true });
        addBox('glowCyan', 3.0, roofY + 4.1, -hd + 1.4, 0.9, 0.24, 0.24, '#38bdf8');

        addStaircase(s1X, s1Z, stairW, stairLen, f0, f1, 'north', '#475569', 'metal');
        addStaircase(s2X, s2Z, stairW, stairLen, f1, roofY, 'south', '#475569', 'metal');

        // Holo-Consoles, Servers & Lab Workstations
        addServerRack(hw - 1.35, f0, -hd + 1.35, 0);
        addServerRack(hw - 1.35, f0, -hd + 2.75, 0);
        addDeskSetup(westRoomCx, f0, hd * 0.44, 0, true);
        addTable(eastRoomCx, f0, hd * 0.44, 2.1, 1.05, 0);
        addBox('glowCyan', eastRoomCx, f0 + 0.82, hd * 0.44, 1.35, 0.1, 0.7, '#38bdf8');
        addServerRack(-hallW - 1.35, f1, -hd + 1.45, 0);
        addDeskSetup((hallW + eastWingMaxX) * 0.5, f1, -hd + 1.3, 0, true);
        addBench(0, f1, hd + 1.15, 0, 2.0, 'TECH BENCH');

        addInteriorLoot(0, f0, 0.6, 'medium', 'm4a1');
        addInteriorLoot(eastRoomCx, f0, -hd * 0.5, 'high', 'parafal');
        addInteriorLoot(westRoomCx, f0, -hd * 0.48, 'high');
        addInteriorLoot(eastRoomCx, f0, hd * 0.6, 'medium');
        addInteriorLoot(0, f1, 0, 'high', 'scar');
        addInteriorLoot(westRoomCx, f1, hd * 0.42, 'high');
        addInteriorLoot((hallW + eastWingMaxX) * 0.5, f1, -hd * 0.46, 'high');
        addInteriorLoot(0, f1, hd + 1.2, 'medium');
        addInteriorLoot(0.2, roofY, 0.8, 'high', 'awm');
        addInteriorLoot(-2.8, roofY, 2.0, 'high');
      } else if (b.style === 'residential_complex') {
        // 3-Floor Modern Architectural Housing Block + Balconies + Furnished Units + Roof Terrace
        const floors = Math.max(3, b.floors ?? 3);
        const f1 = f0 + FLOOR_HEIGHT;
        const f2 = f0 + FLOOR_HEIGHT * 2;
        const roofY = f0 + FLOOR_HEIGHT * floors;
        const stairW = 2.3;
        const stairLen = 4.6;
        const bayW = -hw + 1.55;
        const bayE = hw - 1.55;
        const hallW = Math.max(2.5, Math.min(3.2, hw * 0.26));
        const westWingMinX = bayW + stairW * 0.6;
        const eastWingMaxX = bayE - stairW * 0.6;
        const westRoomCx = (westWingMinX - hallW) * 0.5;
        const eastRoomCx = (hallW + eastWingMaxX) * 0.5;

        addBox('masonry', 0, -0.22, 0, b.width + 0.7, 0.44, b.depth + 0.7, '#1e293b');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, palette.floor);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f1, SLAB_THICK, palette.upperFloor, {
          minX: bayW - stairW * 0.56,
          maxX: bayW + stairW * 0.56,
          minZ: -stairLen * 0.5 + 0.04,
          maxZ: stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f2, SLAB_THICK, palette.upperFloor, {
          minX: bayE - stairW * 0.56,
          maxX: bayE + stairW * 0.56,
          minZ: -stairLen * 0.5 + 0.04,
          maxZ: stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'east',
        });
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, palette.roof, {
          minX: bayW - stairW * 0.56,
          maxX: bayW + stairW * 0.56,
          minZ: -stairLen * 0.5 - 0.25,
          maxZ: stairLen * 0.5 - 0.04,
          openSide: 'south',
          hugWall: 'west',
        });

        for (let f = 0; f < floors; f++) {
          const fy = f0 + f * FLOOR_HEIGHT;
          const topWallY = fy + FLOOR_HEIGHT - SLAB_THICK;
          const isGround = f === 0;

          addWallX(-hw, hw, hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cx: -hw * 0.54, w: 2.5, sillH: 0.9, winH: 1.6 },
            isGround
              ? { kind: 'door', cx: 0, w: 3.0, h: 2.7, label: 'COMPLEX LOBBY' }
              : { kind: 'door', cx: 0, w: 2.45, h: 2.6, label: `SUITE ${f + 1} TERRACE` },
            { kind: 'window', cx: hw * 0.54, w: 2.5, sillH: 0.9, winH: 1.6 },
          ]);
          addWallX(-hw, hw, -hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cx: -hw * 0.54, w: 2.4, sillH: 0.9, winH: 1.6 },
            isGround
              ? { kind: 'door', cx: 0, w: 2.6, h: 2.6, open: true, label: 'PLAZA EXIT' }
              : { kind: 'window', cx: 0, w: 2.4, sillH: 0.9, winH: 1.6 },
            { kind: 'window', cx: hw * 0.54, w: 2.4, sillH: 0.9, winH: 1.6 },
          ]);
          addWallZ(-hw, -hd, hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cz: -hd * 0.45, w: 2.3, sillH: 0.9, winH: 1.6 },
            { kind: 'window', cz: hd * 0.45, w: 2.3, sillH: 0.9, winH: 1.6 },
          ]);
          addWallZ(hw, -hd, hd, fy, topWallY, WALL_THICK, palette.wallOuter, [
            { kind: 'window', cz: -hd * 0.45, w: 2.3, sillH: 0.9, winH: 1.6 },
            isGround
              ? { kind: 'door', cz: 0, w: 2.25, h: 2.55, label: 'EAST ACCESS' }
              : { kind: 'window', cz: 0, w: 2.3, sillH: 0.9, winH: 1.6 },
            { kind: 'window', cz: hd * 0.45, w: 2.3, sillH: 0.9, winH: 1.6 },
          ]);

          addWallZ(-hallW, -hd + 0.2, hd - 2.7, fy, topWallY, PART_THICK, palette.wallInner, [
            { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.55, addInteractiveDoor: !isGround, label: `RESIDENCE ${f + 1}A` },
            { kind: 'door', cz: hd * 0.35, w: 2.25, h: 2.55, addInteractiveDoor: false },
          ]);
          addWallZ(hallW, -hd + 0.2, hd - 2.7, fy, topWallY, PART_THICK, palette.wallInner, [
            { kind: 'door', cz: -hd * 0.48, w: 2.15, h: 2.55, addInteractiveDoor: !isGround, label: `RESIDENCE ${f + 1}B` },
            { kind: 'door', cz: hd * 0.35, w: 2.25, h: 2.55, addInteractiveDoor: false },
          ]);

          if (f > 0) {
            addBalcony(0, hd, 1, Math.min(10.6, b.width * 0.48), 2.3, fy, '#38bdf8');
          }

          if (f === 0) {
            addSofa(eastRoomCx, fy, 2.0, 0, palette.fabricA);
            addKitchenCounter(westRoomCx, fy, hd - 1.0, 2.4, 0.72, 0);
            addDeskSetup(eastRoomCx, fy, -hd + 1.2, 0, true);
            addInteriorLoot(0, fy, -1.8, 'standard', 'ump');
            addInteriorLoot(westRoomCx, fy, -hd * 0.5, 'medium');
          } else {
            addBed(westRoomCx, fy, -hd + 1.7, 0, f === 1 ? palette.fabricB : palette.fabricA);
            addBed(eastRoomCx, fy, -hd + 1.7, 0, f === 1 ? palette.fabricA : palette.fabricB);
            addSofa(eastRoomCx, fy, hd * 0.45, 0, palette.fabricC);
            addInteriorLoot(0, fy, 0.5, f === 2 ? 'high' : 'medium', f === 2 ? 'ak24' : 'mp5');
            addInteriorLoot(westRoomCx, fy, hd * 0.42, 'medium');
            addInteriorLoot(eastRoomCx, fy, -hd * 0.44, f === 2 ? 'high' : 'medium');
            addInteriorLoot(0, fy, hd + 1.15, 'medium');
          }
        }

        const balcW = Math.min(10.6, b.width * 0.48);
        addBox('glowCyan', 0, f1 + 0.1, hd + 2.35, balcW * 0.82, 0.08, 0.08, b.accentColorHex);
        addBox('glowAmber', 0, f2 + 0.1, hd + 2.35, balcW * 0.82, 0.08, 0.08, '#f59e0b');
        addStaircase(bayW, 0, stairW, stairLen, f0, f1, 'north', palette.wood);
        addStaircase(bayE, 0, stairW, stairLen, f1, f2, 'north', palette.wood);
        addStaircase(bayW, 0, stairW, stairLen, f2, roofY, 'south', palette.wood);
        addRoofParapet(-hw, hw, -hd, hd, roofY, 1.08);
        addBench(-1.2, roofY, -1.8, 0, 2.0, 'SKYLINE BENCH');
        addInteriorLoot(0.4, roofY, 0.4, 'high', 'scar');
        addInteriorLoot(-2.8, roofY, -3.0, 'high');
      } else if (b.style === 'cyber_outpost') {
        // 1-Floor Tactical Armored Relay Outpost + Accessible Sniper Roof Deck + Fast Perimeter Windows
        const roofY = f0 + FLOOR_HEIGHT;
        const stairW = 2.15;
        const stairLen = 4.2;
        const sX = -hw + 1.45;
        const sZ = 0;
        const partX = Math.max(1.0, hw * 0.15);
        const westWingMinX = sX + stairW * 0.58;
        const westRoomCx = (westWingMinX + partX) * 0.5;
        const eastRoomCx = (partX + hw) * 0.5;

        addBox('masonry', 0, -0.2, 0, b.width + 0.65, 0.4, b.depth + 0.65, '#1e293b');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, '#334155');
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, '#1e293b', {
          minX: sX - stairW * 0.56,
          maxX: sX + stairW * 0.56,
          minZ: sZ - stairLen * 0.5 + 0.04,
          maxZ: sZ + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });

        addWallX(-hw, hw, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.54, w: 2.3, sillH: 0.9, winH: 1.45 },
          { kind: 'door', cx: 0, w: 2.55, h: 2.6, steel: true, label: 'OUTPOST GATE' },
          { kind: 'window', cx: hw * 0.54, w: 2.3, sillH: 0.9, winH: 1.45 },
        ]);
        addWallX(-hw, hw, -hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.54, w: 2.2, sillH: 0.9, winH: 1.45 },
          { kind: 'door', cx: 0, w: 2.4, h: 2.55, steel: true, open: true, label: 'REAR BREACH' },
          { kind: 'window', cx: hw * 0.54, w: 2.2, sillH: 0.9, winH: 1.45 },
        ]);
        addWallZ(-hw, -hd, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.2, sillH: 0.9, winH: 1.45 },
          { kind: 'window', cz: hd * 0.42, w: 2.2, sillH: 0.9, winH: 1.45 },
        ]);
        addWallZ(hw, -hd, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.2, sillH: 0.9, winH: 1.45 },
          { kind: 'window', cz: hd * 0.42, w: 2.2, sillH: 0.9, winH: 1.45 },
        ]);

        // Interior Ops Divider
        addWallZ(partX, -hd + 0.2, hd - 2.4, f0, roofY - SLAB_THICK, PART_THICK, '#475569', [
          { kind: 'door', cz: 0, w: 2.2, h: 2.5, steel: true, addInteractiveDoor: false },
        ]);

        addStaircase(sX, sZ, stairW, stairLen, f0, roofY, 'north', '#475569', 'metal');
        addRoofParapet(-hw, hw, -hd, hd, roofY, 1.05, true);
        addBox('glowCyan', 0, roofY - 0.12, hd + 0.12, b.width * 0.7, 0.08, 0.06, b.accentColorHex);
        addBox('metal', hw - 1.3, roofY + 1.9, -hd + 1.1, 0.18, 3.8, 0.18, '#334155', { collide: true });
        addBox('glowAmber', hw - 1.3, roofY + 3.75, -hd + 1.1, 0.28, 0.28, 0.28, '#f59e0b');

        addServerRack(hw - 1.15, f0, -hd + 1.25, 0);
        addDeskSetup(eastRoomCx, f0, hd - 1.25, Math.PI, true);
        addCrateStack(westRoomCx - 0.5, f0, -hd + 1.5, false);
        addCrateStack(0.6, roofY, 0.8, false);

        addInteriorLoot(westRoomCx, f0, 0.6, 'medium', 'mp5');
        addInteriorLoot(eastRoomCx, f0, -hd * 0.45, 'high', 'm4a1');
        addInteriorLoot(0.2, roofY, -1.8, 'high', 'kar98k');
        addInteriorLoot(-0.6, roofY, 2.2, 'medium');
      } else {
        // 'village_home': Spacious Multi-Room House (Living Hall + Kitchen/Dining + Bedroom + 2 Entrances + Roof Terrace)
        const roofY = f0 + FLOOR_HEIGHT;
        const stairW = 2.15;
        const stairLen = 4.2;
        const sX = -hw + 1.45;
        const sZ = 0;
        const partX = Math.max(1.15, hw * 0.15); // Wide ~6.5m+ living hall on West/Center, East rooms!
        const westWingMinX = sX + stairW * 0.58;
        const westRoomCx = (westWingMinX + partX) * 0.5;
        const eastRoomCx = (partX + hw) * 0.5;

        addBox('masonry', 0, -0.2, 0, b.width + 0.55, 0.4, b.depth + 0.55, palette.trim);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, f0, 0.2, palette.floor);
        addFloorSlabWithCutout(-hw, hw, -hd, hd, roofY, SLAB_THICK, palette.roof, {
          minX: sX - stairW * 0.56,
          maxX: sX + stairW * 0.56,
          minZ: sZ - stairLen * 0.5 + 0.04,
          maxZ: sZ + stairLen * 0.5 + 0.25,
          openSide: 'north',
          hugWall: 'west',
        });

        // Front & Back Accessible Entrances + Windows on all 4 walls
        addWallX(-hw, hw, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.2, sillH: 0.9, winH: 1.45 },
          { kind: 'door', cx: -0.45, w: 2.45, h: 2.55, label: 'HOME DOOR' },
          { kind: 'window', cx: hw * 0.55, w: 2.3, sillH: 0.9, winH: 1.45 },
        ]);
        addWallX(-hw, hw, -hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cx: -hw * 0.52, w: 2.2, sillH: 0.9, winH: 1.45 },
          { kind: 'door', cx: -0.45, w: 2.3, h: 2.5, open: true, label: 'BACK PATIO DOOR' },
          { kind: 'window', cx: hw * 0.55, w: 2.3, sillH: 0.9, winH: 1.45 },
        ]);
        addWallZ(-hw, -hd, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.1, sillH: 0.9, winH: 1.45 },
          { kind: 'window', cz: hd * 0.42, w: 2.1, sillH: 0.9, winH: 1.45 },
        ]);
        addWallZ(hw, -hd, hd, f0, roofY - SLAB_THICK, WALL_THICK, palette.wallOuter, [
          { kind: 'window', cz: -hd * 0.42, w: 2.2, sillH: 0.9, winH: 1.45 },
          { kind: 'window', cz: hd * 0.42, w: 2.2, sillH: 0.9, winH: 1.45 },
        ]);

        // Interior Multi-Room Partitions (East wing divided into SE Kitchen/Dining + NE Bedroom)
        addWallZ(partX, -hd + 0.2, hd - 2.5, f0, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cz: -hd * 0.45, w: 2.15, h: 2.5, label: 'BEDROOM DOOR' },
          { kind: 'door', cz: hd * 0.35, w: 2.2, h: 2.5, addInteractiveDoor: false },
        ]);
        addWallX(partX + 0.15, hw - 0.2, -0.45, f0, roofY - SLAB_THICK, PART_THICK, palette.wallInner, [
          { kind: 'door', cx: eastRoomCx, w: 2.1, h: 2.5, addInteractiveDoor: false },
        ]);

        addStaircase(sX, sZ, stairW, stairLen, f0, roofY, 'north', palette.wood);
        addRoofParapet(-hw, hw, -hd, hd, roofY, 0.98);

        // Warm Furnished Multi-Room Cottage
        addSofa(westRoomCx, f0, hd * 0.38, 0, palette.fabricA);
        addBed(hw - 1.75, f0, -hd + 1.7, 0, palette.fabricB);
        addWardrobe(partX + 1.4, f0, -hd + 0.85, 0);
        addKitchenCounter(hw - 1.9, f0, hd - 0.95, 2.3, 0.72, 0);
        addTable(eastRoomCx, f0, 2.1, 1.45, 0.85, 0);
        addChair(eastRoomCx, f0, 2.9, Math.PI, palette.fabricB, 'CHAIR', [-0.66, 0]);
        addChair(eastRoomCx, f0, 1.3, 0, palette.fabricB, 'CHAIR', [0.66, 0]);
        addBench(-1.2, roofY, -2.0, 0, 1.85, 'ROOF BENCH');
        addCrateStack(0.8, roofY, 0.9, false);

        addInteriorLoot(westRoomCx, f0, -hd * 0.35, 'standard', 'ump');
        addInteriorLoot(westRoomCx, f0, hd * 0.56, 'standard');
        addInteriorLoot(eastRoomCx, f0, -hd * 0.44, 'medium');
        addInteriorLoot(eastRoomCx, f0, hd * 0.52, 'standard');
        addInteriorLoot(-0.2, roofY, 2.4, 'medium');
        addInteriorLoot(0.8, roofY, -2.0, 'medium', 'scar');
        addInteriorLoot(hw - 2.2, roofY, 2.1, 'medium');
      }
  }

  private finalizeBuildings(ctx: BuildingBuildContext): BuildingBuildResult {
    const {
      root,
      sectorBuckets,
      bucketMaterials,
      ownedGeometries,
      ownedMaterials,
      buildingOccluders,
      doorLeafMeshes,
      volumeColliders,
      walkableSurfaces,
      doors,
      windows,
      seats,
      lootPoints,
    } = ctx;

    const structuralMeshes: THREE.Mesh[] = [];
    const decorativeMeshes: THREE.Mesh[] = [];
    const sectorEntries: BuildingSectorEntry[] = [];

    sectorBuckets.forEach((bucketAccs, sectorKey) => {
      (Object.keys(bucketAccs) as BuildingMaterialBucket[]).forEach((bucket) => {
        const acc = bucketAccs[bucket];
        if (!acc.hasGeometry) return;
        const merged = acc.toBufferGeometry(VERTEX_COLOR_BUCKETS.has(bucket));
        ownedGeometries.push(merged);

        const mesh = new THREE.Mesh(merged, bucketMaterials[bucket]);
        mesh.name = `buildings-${sectorKey}-${bucket}`;
        const isStructural = STRUCTURAL_BUCKETS.has(bucket);
        if (isStructural) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          structuralMeshes.push(mesh);
        } else {
          mesh.castShadow = false;
          mesh.receiveShadow = bucket === 'fabric';
          decorativeMeshes.push(mesh);
        }
        const bs = merged.boundingSphere;
        sectorEntries.push({
          mesh,
          isDecorative: !isStructural,
          centerX: bs ? bs.center.x : 0,
          centerY: bs ? bs.center.y : 0,
          centerZ: bs ? bs.center.z : 0,
          radius: bs ? bs.radius : 80,
        });
        root.add(mesh);
      });
    });

    const glassSphere = new THREE.Sphere();
    ctx.sectorGlassGroups.forEach((glassEntry, sectorKey) => {
      if (glassEntry.group.children.length === 0) return;
      glassEntry.group.name = `buildings-${sectorKey}-windowGlass`;
      root.add(glassEntry.group);
      glassEntry.bounds.getBoundingSphere(glassSphere);
      sectorEntries.push({
        mesh: glassEntry.group,
        isDecorative: true,
        centerX: glassSphere.center.x,
        centerY: glassSphere.center.y,
        centerZ: glassSphere.center.z,
        radius: Math.max(12, glassSphere.radius),
      });
    });

    return {
      root,
      structuralMeshes,
      decorativeMeshes,
      sectorEntries,
      buildingOccluders,
      doorLeafMeshes,
      volumeColliders,
      walkableSurfaces,
      doors,
      windows,
      seats,
      lootPoints,
      dispose: () => {
        for (const g of ownedGeometries) g.dispose();
        ownedGeometries.length = 0;
        for (const m of ownedMaterials) m.dispose();
        ownedMaterials.length = 0;
      },
    };
  }

  private makePalette(biome: BiomeType, b: BuildingSpec): Palette {
    if (biome === 'desert') {
      return {
        wallOuter: b.wallColorHex,
        wallInner: '#e7d2b5',
        floor: '#b08968',
        upperFloor: '#a47e5c',
        roof: b.roofColorHex,
        trim: '#5c4033',
        wood: '#b47b48',
        woodDark: '#6b3e26',
        metal: '#64748b',
        fabricA: '#c2410c',
        fabricB: '#0f766e',
        fabricC: '#d97706',
      };
    }
    if (biome === 'snow') {
      return {
        wallOuter: b.wallColorHex,
        wallInner: '#e2e8f0',
        floor: '#64748b',
        upperFloor: '#475569',
        roof: b.roofColorHex,
        trim: '#1e293b',
        wood: '#9a6b44',
        woodDark: '#5b3a24',
        metal: '#94a3b8',
        fabricA: '#0284c7',
        fabricB: '#b91c1c',
        fabricC: '#334155',
      };
    }
    return {
      wallOuter: b.wallColorHex,
      wallInner: '#f1f5f9',
      floor: '#78716c',
      upperFloor: '#9a7b56',
      roof: b.roofColorHex,
      trim: '#1e293b',
      wood: '#a16227',
      woodDark: '#5c3a1a',
      metal: '#475569',
      fabricA: '#2563eb',
      fabricB: '#15803d',
      fabricC: '#b45309',
    };
  }
}
