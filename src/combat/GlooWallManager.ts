import * as THREE from 'three';
import type { DamageCalculationResult } from '../weapons/DamageSystem';
import type { DamageableTarget } from '../weapons/HitDetection';
import type { MapManager } from '../maps/MapManager';
import type { ServerGlooWall } from '../ranked/RankedTypes';
import {
  DEFAULT_GLOO_SKIN_ID,
  GLOO_WALL_ARC_HALF_ANGLE,
  GLOO_WALL_ARC_RADIUS,
  GLOO_WALL_PANEL_SPECS,
  buildGlooWallVisualRig,
  getGlooWallSkinById,
  type GlooWallSkinDefinition,
  type GlooWallVisualRig,
} from './GlooWallSkins';

export interface GlooWallStatsConfig {
  readonly maxHp: number;
  readonly maxActivePerPlayer: number;
  readonly deployDistance: number;
  readonly minPlayerDistance: number;
}

export const GLOO_WALL_CONFIG: GlooWallStatsConfig = {
  maxHp: 500,
  maxActivePerPlayer: 3,
  deployDistance: 2.6,
  minPlayerDistance: 1.35,
};

const FULL_WALL_HEIGHT = GLOO_WALL_PANEL_SPECS[0].height;
const SPAWN_ANIM_DURATION = 0.34;
const DESTROY_ANIM_DURATION = 0.26;
const AUTO_PRIMARY_DISTANCES: readonly number[] = [2.6, 2.3, 2.0, 1.75, 1.45, 2.95, 3.3];
const AUTO_FALLBACK_YAW_OFFSETS: readonly number[] = [0.22, -0.22, 0.42, -0.42];
const AUTO_INDOOR_DISTANCES: readonly number[] = [2.3, 2.0, 1.7, 1.45, 2.6];
const AUTO_INDOOR_YAW_OFFSETS: readonly number[] = [0, 0.18, -0.18];

interface GlooIceShard {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  baseScale: number;
  age: number;
  duration: number;
  active: boolean;
}

interface GlooWallEntity {
  id: string;
  ownerId: string;
  ownerName: string;
  skin: GlooWallSkinDefinition;
  x: number;
  y: number;
  z: number;
  yaw: number;
  cosY: number;
  sinY: number;
  heightScale: number;
  hp: number;
  maxHp: number;
  createdAtMs: number;
  insertOrder: number;
  group: THREE.Group;
  rig: GlooWallVisualRig;
  hpBarGroup: THREE.Group;
  hpFillMesh: THREE.Mesh;
  hpVisibleTimer: number;
  spawnAnimAge: number;
  ambientAge: number;
  hitFlashTimer: number;
  destroying: boolean;
  destroyAnimAge: number;
  targetAdapter: DamageableTarget;
}

export interface GlooWallPlacementValidation {
  valid: boolean;
  reason?: 'blocked' | 'overlap' | 'bounds' | 'player';
  x: number;
  y: number;
  z: number;
  yaw: number;
  heightScale: number;
}

export interface GlooWallManagerCallbacks {
  onWallDamaged?: (wallId: string, hp: number, maxHp: number, pos: THREE.Vector3) => void;
  onWallDestroyed?: (wallId: string, pos: THREE.Vector3) => void;
}

export function extractGlooWallIdFromTarget(targetId: string): string | null {
  return targetId.startsWith('gloo:') ? targetId.slice(5) : null;
}

function normalizeYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0;
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

function clampHeightScale(scale?: number): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return 1;
  return Math.max(0.72, Math.min(1, scale));
}

export class GlooWallManager {
  private readonly scene: THREE.Scene;
  private readonly callbacks: GlooWallManagerCallbacks;
  private readonly walls = new Map<string, GlooWallEntity>();
  private readonly shards: GlooIceShard[] = [];
  private localSeq = 1;
  private insertSeq = 1;
  private shardCursor = 0;

  private readonly shardGeo: THREE.OctahedronGeometry;
  private readonly hpBgGeo: THREE.PlaneGeometry;
  private readonly hpFillGeo: THREE.PlaneGeometry;
  private readonly hpBgMat: THREE.MeshBasicMaterial;

  private readonly scratchPos = new THREE.Vector3();
  private readonly scratchNormal = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();

  private previewRig: GlooWallVisualRig | null = null;
  private previewSkinId: string | null = null;

  constructor(scene: THREE.Scene, callbacks: GlooWallManagerCallbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.hpBgGeo = new THREE.PlaneGeometry(1.5, 0.12);
    this.hpFillGeo = new THREE.PlaneGeometry(1.44, 0.075);
    this.hpBgMat = new THREE.MeshBasicMaterial({
      color: 0x09131d,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.shardGeo = new THREE.OctahedronGeometry(0.11, 0);

    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.52,
        roughness: 0.18,
        metalness: 0.15,
        transparent: true,
        opacity: 0.94,
      });
      const mesh = new THREE.Mesh(this.shardGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shards.push({
        mesh,
        mat,
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        baseScale: 1,
        age: 0,
        duration: 0.55,
        active: false,
      });
    }
  }

  getActiveWallCountForOwner(ownerId: string): number {
    let count = 0;
    for (const wall of this.walls.values()) {
      if (wall.destroying || wall.hp <= 0) continue;
      if (wall.ownerId === ownerId) count++;
    }
    return count;
  }

  getOldestActiveWallIdForOwner(ownerId: string): string | null {
    let oldest: GlooWallEntity | null = null;
    for (const wall of this.walls.values()) {
      if (wall.destroying || wall.hp <= 0) continue;
      if (wall.ownerId !== ownerId) continue;
      if (
        !oldest ||
        wall.createdAtMs < oldest.createdAtMs ||
        (wall.createdAtMs === oldest.createdAtMs && wall.insertOrder < oldest.insertOrder)
      ) {
        oldest = wall;
      }
    }
    return oldest ? oldest.id : null;
  }

  private enforceOwnerActiveLimit(ownerId: string, maxRemaining: number): void {
    const owned: GlooWallEntity[] = [];
    for (const wall of this.walls.values()) {
      if (wall.destroying || wall.hp <= 0) continue;
      if (wall.ownerId === ownerId) owned.push(wall);
    }
    if (owned.length <= maxRemaining) return;
    owned.sort((a, b) => a.createdAtMs - b.createdAtMs || a.insertOrder - b.insertOrder);
    const excess = owned.length - maxRemaining;
    for (let i = 0; i < excess; i++) {
      this.destroyWall(owned[i].id);
    }
  }

  /**
   * Checks ONLY direct physical clipping where the new wall's center sits inside an existing
   * wall's solid core thickness. Nearby adjacent walls, L-corners, 360 cover boxes, and close
   * stacks in the same area are freely allowed.
   */
  private isCenterClippingExistingWall(
    wx: number,
    wy: number,
    wz: number,
    ignoreWallId?: string | null,
  ): boolean {
    for (const wall of this.walls.values()) {
      if (wall.destroying || wall.hp <= 0) continue;
      if (ignoreWallId && wall.id === ignoreWallId) continue;

      const wallTop = wall.y + FULL_WALL_HEIGHT * wall.heightScale;
      if (wy >= wallTop - 0.1 || wy + 1.5 <= wall.y + 0.1) continue;

      const dx = wx - wall.x;
      const dz = wz - wall.z;
      // Reject identical stacked center position
      if (dx * dx + dz * dz < 0.42 * 0.42) {
        return true;
      }

      // Check if candidate center sits directly inside any solid panel core of the existing wall
      const lx = dx * wall.cosY - dz * wall.sinY;
      const lz = dx * wall.sinY + dz * wall.cosY;
      if (Math.abs(lx) > 2.85 || lz > 0.6 || lz < -2.0) continue;

      for (let i = 0; i < GLOO_WALL_PANEL_SPECS.length; i++) {
        const p = GLOO_WALL_PANEL_SPECS[i];
        const px = lx - p.px;
        const pz = lz - p.pz;
        const ux = px * p.cosP - pz * p.sinP;
        const uz = px * p.sinP + pz * p.cosP;
        if (Math.abs(ux) < p.halfW - 0.08 && Math.abs(uz) < p.halfD + 0.12) {
          return true;
        }
      }
    }
    return false;
  }

  private isInsideMapBounds(
    wx: number,
    wz: number,
    cosY: number,
    sinY: number,
    mapManager: MapManager,
  ): boolean {
    if (!mapManager.isInsideBounds(wx, wz, 0.28)) return false;
    for (let i = 0; i < GLOO_WALL_PANEL_SPECS.length; i++) {
      const p = GLOO_WALL_PANEL_SPECS[i];
      const px = wx + p.px * cosY + p.pz * sinY;
      const pz = wz - p.px * sinY + p.pz * cosY;
      if (!mapManager.isInsideBounds(px, pz, 0.24)) {
        return false;
      }
    }
    return true;
  }

  private isOverlappingPlayer(
    wx: number,
    wy: number,
    wz: number,
    cosY: number,
    sinY: number,
    playerPos: THREE.Vector3,
    heightScale: number,
  ): boolean {
    const wallTop = wy + FULL_WALL_HEIGHT * heightScale;
    if (playerPos.y >= wallTop - 0.08 || playerPos.y + 1.72 <= wy + 0.08) {
      return false;
    }

    const dx = playerPos.x - wx;
    const dz = playerPos.z - wz;
    if (dx * dx + dz * dz < 0.72 * 0.72) {
      return true;
    }

    const lx = dx * cosY - dz * sinY;
    const lz = dx * sinY + dz * cosY;
    const playerRadius = 0.56;
    if (Math.abs(lx) > 3.15 + playerRadius || lz > 0.75 + playerRadius || lz < -2.15 - playerRadius) {
      return false;
    }

    for (let i = 0; i < GLOO_WALL_PANEL_SPECS.length; i++) {
      const p = GLOO_WALL_PANEL_SPECS[i];
      const px = lx - p.px;
      const pz = lz - p.pz;
      const ux = px * p.cosP - pz * p.sinP;
      const uz = px * p.sinP + pz * p.cosP;
      const clampedX = Math.max(-p.halfW, Math.min(p.halfW, ux));
      const clampedZ = Math.max(-p.halfD, Math.min(p.halfD, uz));
      const diffX = ux - clampedX;
      const diffZ = uz - clampedZ;
      if (diffX * diffX + diffZ * diffZ < playerRadius * playerRadius) {
        return true;
      }
    }
    return false;
  }

  private hasArcObstacle(
    wx: number,
    wy: number,
    wz: number,
    cosY: number,
    sinY: number,
    mapManager: MapManager,
    checkOuterWings: boolean,
  ): boolean {
    if (mapManager.hasPlacementObstacleAt(wx, wy, wz, 0.26)) {
      return true;
    }
    const maxPanelCount = checkOuterWings ? GLOO_WALL_PANEL_SPECS.length : 3;
    for (let i = 1; i < maxPanelCount; i++) {
      const p = GLOO_WALL_PANEL_SPECS[i];
      const px = wx + p.px * cosY + p.pz * sinY;
      const pz = wz - p.px * sinY + p.pz * cosY;
      if (mapManager.hasPlacementObstacleAt(px, wy, pz, 0.15)) {
        return true;
      }
    }
    return false;
  }

  private evaluateSingleCandidate(
    playerPos: THREE.Vector3,
    wx: number,
    wz: number,
    yaw: number,
    mapManager: MapManager,
    otherActors: ReadonlyArray<{ x: number; y: number; z: number }>,
    ignoreWallId: string | null | undefined,
    checkOuterWings: boolean,
    out?: GlooWallPlacementValidation,
  ): GlooWallPlacementValidation {
    const result: GlooWallPlacementValidation = out ?? {
      valid: false,
      reason: 'blocked',
      x: wx,
      y: playerPos.y,
      z: wz,
      yaw,
      heightScale: 1,
    };

    const cleanYaw = normalizeYaw(yaw);
    const cosY = Math.cos(cleanYaw);
    const sinY = Math.sin(cleanYaw);

    result.x = wx;
    result.z = wz;
    result.yaw = cleanYaw;
    result.valid = false;
    result.heightScale = 1;

    const centerGroundY = mapManager.getGroundHeightAt(wx, wz, playerPos.y + 0.35);
    if (Math.abs(centerGroundY - playerPos.y) > 2.2) {
      result.y = playerPos.y;
      result.reason = 'blocked';
      return result;
    }

    // Ground flush without floating or sinking along semi-circular wings
    const leftSampleX = wx - 1.45 * cosY - 0.45 * sinY;
    const leftSampleZ = wz + 1.45 * sinY - 0.45 * cosY;
    const rightSampleX = wx + 1.45 * cosY - 0.45 * sinY;
    const rightSampleZ = wz - 1.45 * sinY - 0.45 * cosY;
    const leftY = mapManager.getGroundHeightAt(leftSampleX, leftSampleZ, centerGroundY + 0.45);
    const rightY = mapManager.getGroundHeightAt(rightSampleX, rightSampleZ, centerGroundY + 0.45);
    const innerSpan = Math.max(centerGroundY, leftY, rightY) - Math.min(centerGroundY, leftY, rightY);
    const wy =
      innerSpan < 0.08
        ? centerGroundY
        : Math.max(centerGroundY - 0.05, Math.min(centerGroundY, leftY, rightY));

    result.y = wy;

    const ceilingY = mapManager.getCeilingHeightAt(wx, wz, wy);
    const availableHeight = Number.isFinite(ceilingY) ? ceilingY - wy : Number.POSITIVE_INFINITY;
    if (availableHeight < 1.35) {
      result.reason = 'blocked';
      return result;
    }
    const heightScale = Number.isFinite(availableHeight)
      ? clampHeightScale((availableHeight - 0.04) / FULL_WALL_HEIGHT)
      : 1;
    result.heightScale = heightScale;

    if (!this.isInsideMapBounds(wx, wz, cosY, sinY, mapManager)) {
      result.reason = 'bounds';
      return result;
    }

    if (this.isOverlappingPlayer(wx, wy, wz, cosY, sinY, playerPos, heightScale)) {
      result.reason = 'player';
      return result;
    }

    if (this.hasArcObstacle(wx, wy, wz, cosY, sinY, mapManager, checkOuterWings)) {
      result.reason = 'blocked';
      return result;
    }

    const dxToWall = wx - playerPos.x;
    const dzToWall = wz - playerPos.z;
    const distToWall = Math.hypot(dxToWall, dzToWall);
    if (distToWall > 0.35) {
      const invDist = 1 / distToWall;
      const losDist = Math.max(0.35, distToWall - 0.28);
      const losEndX = playerPos.x + dxToWall * invDist * losDist;
      const losEndZ = playerPos.z + dzToWall * invDist * losDist;
      if (
        !mapManager.hasSolidLineOfSight(
          playerPos.x,
          playerPos.y + 1.05,
          playerPos.z,
          losEndX,
          wy + 1.05,
          losEndZ,
        )
      ) {
        result.reason = 'blocked';
        return result;
      }
    }

    if (this.isCenterClippingExistingWall(wx, wy, wz, ignoreWallId)) {
      result.reason = 'overlap';
      return result;
    }

    for (let a = 0; a < otherActors.length; a++) {
      const actor = otherActors[a];
      if (Math.hypot(actor.x - wx, actor.z - wz) < 0.85 && Math.abs(actor.y - wy) < 1.95) {
        result.reason = 'overlap';
        return result;
      }
    }

    result.valid = true;
    result.reason = undefined;
    return result;
  }

  evaluateManualTransform(
    playerPos: THREE.Vector3,
    targetX: number,
    targetZ: number,
    rawYaw: number,
    mapManager: MapManager,
    otherActors: ReadonlyArray<{ x: number; y: number; z: number }>,
    ignoreWallId?: string | null,
    out?: GlooWallPlacementValidation,
  ): GlooWallPlacementValidation {
    return this.evaluateSingleCandidate(
      playerPos,
      targetX,
      targetZ,
      rawYaw,
      mapManager,
      otherActors,
      ignoreWallId,
      false,
      out,
    );
  }

  computeCandidateTransform(
    playerPos: THREE.Vector3,
    rawYaw: number,
    mapManager: MapManager,
    otherActors: ReadonlyArray<{ x: number; y: number; z: number }>,
    ignoreWallId?: string | null,
  ): GlooWallPlacementValidation {
    const baseYaw = normalizeYaw(rawYaw);
    let lastFailure: GlooWallPlacementValidation = {
      valid: false,
      reason: 'blocked',
      x: playerPos.x + Math.sin(baseYaw) * GLOO_WALL_CONFIG.deployDistance,
      y: playerPos.y,
      z: playerPos.z + Math.cos(baseYaw) * GLOO_WALL_CONFIG.deployDistance,
      yaw: baseYaw,
      heightScale: 1,
    };

    // Pass 1a: Straight ahead at adaptive safe distances with full semi-circular clearance
    for (let dIdx = 0; dIdx < AUTO_PRIMARY_DISTANCES.length; dIdx++) {
      const dist = AUTO_PRIMARY_DISTANCES[dIdx];
      if (dist < GLOO_WALL_CONFIG.minPlayerDistance) continue;
      const wx = playerPos.x + Math.sin(baseYaw) * dist;
      const wz = playerPos.z + Math.cos(baseYaw) * dist;
      const res = this.evaluateSingleCandidate(
        playerPos,
        wx,
        wz,
        baseYaw,
        mapManager,
        otherActors,
        ignoreWallId,
        true,
      );
      if (res.valid) return res;
      lastFailure = res;
    }

    // Pass 1b: Slight angular adjustments in front of the player if straight ahead is obstructed or at map edge
    for (let yIdx = 0; yIdx < AUTO_FALLBACK_YAW_OFFSETS.length; yIdx++) {
      const candYaw = normalizeYaw(baseYaw + AUTO_FALLBACK_YAW_OFFSETS[yIdx]);
      const fwdX = Math.sin(candYaw);
      const fwdZ = Math.cos(candYaw);
      for (let dIdx = 0; dIdx < AUTO_INDOOR_DISTANCES.length; dIdx++) {
        const dist = AUTO_INDOOR_DISTANCES[dIdx];
        if (dist < GLOO_WALL_CONFIG.minPlayerDistance) continue;
        const wx = playerPos.x + fwdX * dist;
        const wz = playerPos.z + fwdZ * dist;
        const res = this.evaluateSingleCandidate(
          playerPos,
          wx,
          wz,
          candYaw,
          mapManager,
          otherActors,
          ignoreWallId,
          true,
        );
        if (res.valid) return res;
      }
    }

    // Pass 2: Tight indoor/doorway fallback (strictly preserves bounds, player safety, core + inner flank clearance)
    for (let yIdx = 0; yIdx < AUTO_INDOOR_YAW_OFFSETS.length; yIdx++) {
      const candYaw = normalizeYaw(baseYaw + AUTO_INDOOR_YAW_OFFSETS[yIdx]);
      const fwdX = Math.sin(candYaw);
      const fwdZ = Math.cos(candYaw);
      for (let dIdx = 0; dIdx < AUTO_INDOOR_DISTANCES.length; dIdx++) {
        const dist = AUTO_INDOOR_DISTANCES[dIdx];
        if (dist < GLOO_WALL_CONFIG.minPlayerDistance) continue;
        const wx = playerPos.x + fwdX * dist;
        const wz = playerPos.z + fwdZ * dist;
        const res = this.evaluateSingleCandidate(
          playerPos,
          wx,
          wz,
          candYaw,
          mapManager,
          otherActors,
          ignoreWallId,
          false,
        );
        if (res.valid) return res;
      }
    }

    return lastFailure;
  }

  updatePreviewGhost(
    x: number,
    y: number,
    z: number,
    yaw: number,
    heightScale: number,
    valid: boolean,
    skinId: string,
    elapsedSeconds: number,
  ): void {
    const resolvedSkinId = skinId || DEFAULT_GLOO_SKIN_ID;
    if (!this.previewRig || this.previewSkinId !== resolvedSkinId) {
      if (this.previewRig) {
        this.scene.remove(this.previewRig.root);
        this.previewRig.dispose();
        this.previewRig = null;
      }
      const skin = getGlooWallSkinById(resolvedSkinId);
      const rig = buildGlooWallVisualRig(skin, {
        includeCracks: false,
        includeFrostRing: true,
        forShopPreview: true,
      });
      rig.root.rotation.order = 'YXZ';
      rig.mainMat.transparent = true;
      rig.mainMat.depthWrite = false;
      rig.accentMat.transparent = true;
      rig.accentMat.depthWrite = false;
      rig.rimMat.transparent = true;
      rig.rimMat.depthWrite = false;
      rig.frostRingMat.transparent = true;
      rig.frostRingMat.depthWrite = false;
      rig.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
      this.scene.add(rig.root);
      this.previewRig = rig;
      this.previewSkinId = resolvedSkinId;
    }

    const rig = this.previewRig;
    const cleanHeight = clampHeightScale(heightScale);
    const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 5.2);

    rig.root.visible = true;
    rig.root.position.set(x, y, z);
    rig.root.rotation.set(0, normalizeYaw(yaw), 0);
    rig.wallRoot.scale.set(1, cleanHeight, 1);
    rig.frostRing.scale.set(1.04 + pulse * 0.04, 1.04 + pulse * 0.04, 1);

    if (valid) {
      rig.mainMat.color.setHex(0x67e8f9);
      rig.mainMat.emissive.setHex(0x06b6d4);
      rig.mainMat.emissiveIntensity = 0.45 + pulse * 0.2;
      rig.mainMat.opacity = 0.44 + pulse * 0.08;
      rig.accentMat.color.setHex(0x22d3ee);
      rig.accentMat.emissive.setHex(0x38bdf8);
      rig.accentMat.emissiveIntensity = 0.65;
      rig.accentMat.opacity = 0.56;
      rig.rimMat.color.setHex(0xa5f3fc);
      rig.rimMat.opacity = 0.85;
      rig.frostRingMat.color.setHex(0x38bdf8);
      rig.frostRingMat.opacity = 0.68 + pulse * 0.16;
    } else {
      rig.mainMat.color.setHex(0xfca5a5);
      rig.mainMat.emissive.setHex(0xdc2626);
      rig.mainMat.emissiveIntensity = 0.5 + pulse * 0.22;
      rig.mainMat.opacity = 0.4 + pulse * 0.08;
      rig.accentMat.color.setHex(0xf87171);
      rig.accentMat.emissive.setHex(0xef4444);
      rig.accentMat.emissiveIntensity = 0.7;
      rig.accentMat.opacity = 0.52;
      rig.rimMat.color.setHex(0xfecaca);
      rig.rimMat.opacity = 0.84;
      rig.frostRingMat.color.setHex(0xef4444);
      rig.frostRingMat.opacity = 0.68 + pulse * 0.16;
    }
  }

  hidePreviewGhost(): void {
    if (this.previewRig) {
      this.previewRig.root.visible = false;
    }
  }

  spawnLocal(
    x: number,
    y: number,
    z: number,
    yaw: number,
    ownerId: string,
    ownerName: string,
    skinId: string = DEFAULT_GLOO_SKIN_ID,
    heightScale = 1,
  ): string {
    const id = `local_gloo_${this.localSeq++}`;
    this.spawnOrSync({
      id,
      ownerId,
      ownerName,
      x,
      y,
      z,
      yaw: normalizeYaw(yaw),
      hp: GLOO_WALL_CONFIG.maxHp,
      maxHp: GLOO_WALL_CONFIG.maxHp,
      createdAtMs: Date.now(),
      skinId,
      heightScale: clampHeightScale(heightScale),
    });
    return id;
  }

  spawnOrSync(wallData: ServerGlooWall): void {
    const existing = this.walls.get(wallData.id);
    if (existing) {
      this.applyHpUpdate(wallData.id, wallData.hp, wallData.maxHp);
      return;
    }

    // Enforce max 3 active Gloo Walls per owner: destroy oldest owned wall(s) before creating new one.
    this.enforceOwnerActiveLimit(wallData.ownerId, GLOO_WALL_CONFIG.maxActivePerPlayer - 1);

    const skin = getGlooWallSkinById(wallData.skinId);
    const cleanYaw = normalizeYaw(wallData.yaw);
    const heightScale = clampHeightScale(wallData.heightScale);

    const rig = buildGlooWallVisualRig(skin, {
      includeCracks: true,
      includeFrostRing: true,
    });

    const group = rig.root;
    group.position.set(wallData.x, wallData.y, wallData.z);
    // Strictly upright alignment: pitch=0, roll=0, yaw only around world up (+Y)
    group.rotation.order = 'YXZ';
    group.rotation.set(0, cleanYaw, 0);

    // Start compressed flush on the floor for smooth cryo-formation rise
    rig.wallRoot.scale.set(0.74, 0.05 * heightScale, 0.74);
    rig.frostRing.scale.set(0.28, 0.28, 1);

    const hpBarGroup = new THREE.Group();
    hpBarGroup.position.set(0, (FULL_WALL_HEIGHT + 0.44) * heightScale, 0);
    hpBarGroup.visible = false;
    const hpBgMesh = new THREE.Mesh(this.hpBgGeo, this.hpBgMat);
    const hpFillMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const hpFillMesh = new THREE.Mesh(this.hpFillGeo, hpFillMat);
    hpFillMesh.position.z = 0.005;
    hpBarGroup.add(hpBgMesh, hpFillMesh);
    group.add(hpBarGroup);

    this.scene.add(group);

    const entity: GlooWallEntity = {
      id: wallData.id,
      ownerId: wallData.ownerId,
      ownerName: wallData.ownerName,
      skin,
      x: wallData.x,
      y: wallData.y,
      z: wallData.z,
      yaw: cleanYaw,
      cosY: Math.cos(cleanYaw),
      sinY: Math.sin(cleanYaw),
      heightScale,
      hp: wallData.hp,
      maxHp: Math.max(1, wallData.maxHp),
      createdAtMs: Number.isFinite(wallData.createdAtMs) ? wallData.createdAtMs : Date.now(),
      insertOrder: this.insertSeq++,
      group,
      rig,
      hpBarGroup,
      hpFillMesh,
      hpVisibleTimer: 0,
      spawnAnimAge: 0,
      ambientAge: 0,
      hitFlashTimer: 0,
      destroying: false,
      destroyAnimAge: 0,
      targetAdapter: {
        id: `gloo:${wallData.id}`,
        name: 'Gloo Wall',
        headMesh: group,
        bodyMesh: group,
        isAlive: true,
        shield: 0,
        health: wallData.hp,
        damageReductionPct: 0,
        applyHitDamage: (res: DamageCalculationResult) => {
          this.applyLocalDamage(wallData.id, Math.max(12, Math.round(res.totalDamage)));
        },
      },
    };

    this.walls.set(wallData.id, entity);
    this.syncCrackAndHpVisuals(entity);
    this.spawnFormationBurst(entity);
  }

  applyLocalDamage(wallId: string, rawDamage: number): void {
    const entity = this.walls.get(wallId);
    if (!entity || entity.destroying || entity.hp <= 0) return;

    const nextHp = Math.max(0, entity.hp - Math.max(1, Math.round(rawDamage)));
    this.applyHpUpdate(wallId, nextHp, entity.maxHp);
  }

  applyHpUpdate(wallId: string, hp: number, maxHp: number): void {
    const entity = this.walls.get(wallId);
    if (!entity || entity.destroying) return;

    const prevHp = entity.hp;
    entity.hp = Math.max(0, hp);
    entity.maxHp = Math.max(1, maxHp);
    entity.hitFlashTimer = 0.14;
    entity.hpVisibleTimer = 2.4;
    entity.hpBarGroup.visible = true;

    this.syncCrackAndHpVisuals(entity);

    if (entity.hp < prevHp) {
      this.spawnShards(
        entity.x,
        entity.y + 1.15 * entity.heightScale,
        entity.z,
        7,
        3.9,
        entity.skin.shardHex,
        entity.skin.emissiveHex,
      );
      this.scratchPos.set(entity.x, entity.y + 1.15 * entity.heightScale, entity.z);
      this.callbacks.onWallDamaged?.(entity.id, entity.hp, entity.maxHp, this.scratchPos);
    }

    if (entity.hp <= 0) {
      this.destroyWall(wallId);
    }
  }

  destroyWall(wallId: string): void {
    const entity = this.walls.get(wallId);
    if (!entity || entity.destroying) return;

    entity.hp = 0;
    entity.destroying = true;
    entity.destroyAnimAge = 0;
    entity.hpBarGroup.visible = false;
    this.spawnShards(
      entity.x,
      entity.y + 1.25 * entity.heightScale,
      entity.z,
      18,
      5.6,
      entity.skin.shardHex,
      entity.skin.emissiveHex,
    );
    this.scratchPos.set(entity.x, entity.y + 1.15 * entity.heightScale, entity.z);
    this.callbacks.onWallDestroyed?.(entity.id, this.scratchPos);
  }

  private syncCrackAndHpVisuals(entity: GlooWallEntity): void {
    const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));
    const dmgRatio = 1 - ratio;
    if (entity.rig.crackMat) {
      entity.rig.crackMat.opacity = dmgRatio > 0.04 ? Math.min(0.95, 0.25 + dmgRatio * 0.85) : 0;
    }

    entity.hpFillMesh.scale.x = Math.max(0.001, ratio);
    entity.hpFillMesh.position.x = -0.72 * (1 - ratio);
    const fillMat = entity.hpFillMesh.material as THREE.MeshBasicMaterial;
    if (ratio > 0.55) {
      fillMat.color.setHex(0x38bdf8);
    } else if (ratio > 0.25) {
      fillMat.color.setHex(0xfacc15);
    } else {
      fillMat.color.setHex(0xef4444);
    }
  }

  private spawnFormationBurst(entity: GlooWallEntity): void {
    for (let i = 0; i < 12; i++) {
      const shard = this.shards[this.shardCursor];
      this.shardCursor = (this.shardCursor + 1) % this.shards.length;
      const t = (i / 11) * 2 - 1;
      const theta = t * GLOO_WALL_ARC_HALF_ANGLE * 0.92;
      const lx = GLOO_WALL_ARC_RADIUS * Math.sin(theta);
      const lz = GLOO_WALL_ARC_RADIUS * (Math.cos(theta) - 1);
      const wx = entity.x + lx * entity.cosY + lz * entity.sinY;
      const wz = entity.z - lx * entity.sinY + lz * entity.cosY;

      shard.active = true;
      shard.age = 0;
      shard.duration = 0.36 + Math.random() * 0.22;
      shard.baseScale = 0.55 + Math.random() * 0.65;
      this.scratchColor.set(entity.skin.shardHex);
      shard.mat.color.copy(this.scratchColor);
      shard.mat.emissive.set(entity.skin.emissiveHex);
      shard.mat.opacity = 0.94;
      shard.mesh.visible = true;
      shard.mesh.position.set(wx, entity.y + 0.14 + Math.random() * 0.55, wz);
      shard.mesh.scale.setScalar(shard.baseScale);
      shard.vel.set(
        (Math.random() - 0.5) * 1.9 + entity.sinY * 0.9,
        2.5 + Math.random() * 2.8,
        (Math.random() - 0.5) * 1.9 + entity.cosY * 0.9,
      );
      shard.rotVel.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      );
    }
  }

  private spawnShards(
    x: number,
    y: number,
    z: number,
    count: number,
    speed: number,
    shardHex: string,
    emissiveHex: string,
  ): void {
    for (let i = 0; i < count; i++) {
      const shard = this.shards[this.shardCursor];
      this.shardCursor = (this.shardCursor + 1) % this.shards.length;
      shard.active = true;
      shard.age = 0;
      shard.duration = 0.42 + Math.random() * 0.26;
      shard.baseScale = 0.65 + Math.random() * 0.75;
      this.scratchColor.set(shardHex);
      shard.mat.color.copy(this.scratchColor);
      shard.mat.emissive.set(emissiveHex);
      shard.mat.opacity = 0.94;
      shard.mesh.visible = true;
      shard.mesh.position.set(
        x + (Math.random() - 0.5) * 2.2,
        y + (Math.random() - 0.5) * 1.1,
        z + (Math.random() - 0.5) * 0.8,
      );
      shard.mesh.scale.setScalar(shard.baseScale);
      shard.vel.set(
        (Math.random() - 0.5) * speed * 1.4,
        1.5 + Math.random() * speed * 0.95,
        (Math.random() - 0.5) * speed * 1.4,
      );
      shard.rotVel.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );
    }
  }

  raycastSegment(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    near: number,
    far: number,
    outPoint: THREE.Vector3 | null,
    outNormal: THREE.Vector3 | null,
  ): { dist: number; target: DamageableTarget } | null {
    let bestDist = Infinity;
    let bestTarget: DamageableTarget | null = null;
    let bestNx = 0;
    let bestNy = 0;
    let bestNz = 1;

    for (const wall of this.walls.values()) {
      if (wall.destroying || wall.hp <= 0) continue;

      const dox = origin.x - wall.x;
      const doz = origin.z - wall.z;

      const lox = dox * wall.cosY - doz * wall.sinY;
      const loy = origin.y - wall.y;
      const loz = dox * wall.sinY + doz * wall.cosY;

      const ldx = direction.x * wall.cosY - direction.z * wall.sinY;
      const ldy = direction.y;
      const ldz = direction.x * wall.sinY + direction.z * wall.cosY;

      for (let i = 0; i < GLOO_WALL_PANEL_SPECS.length; i++) {
        const p = GLOO_WALL_PANEL_SPECS[i];
        const halfH = p.halfH * wall.heightScale;
        const pox = lox - p.px;
        const poz = loz - p.pz;

        const uox = pox * p.cosP - poz * p.sinP;
        const uoy = loy - halfH;
        const uoz = pox * p.sinP + poz * p.cosP;

        const udx = ldx * p.cosP - ldz * p.sinP;
        const udy = ldy;
        const udz = ldx * p.sinP + ldz * p.cosP;

        let tMin = near;
        let tMax = Math.min(far, bestDist);
        let hitAxis = -1;
        let hitSign = 1;

        // X slab
        if (Math.abs(udx) < 1e-6) {
          if (uox < -p.halfW || uox > p.halfW) continue;
        } else {
          const inv = 1 / udx;
          let t1 = (-p.halfW - uox) * inv;
          let t2 = (p.halfW - uox) * inv;
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
          tMax = Math.min(tMax, t2);
          if (tMin > tMax) continue;
        }

        // Y slab
        if (Math.abs(udy) < 1e-6) {
          if (uoy < -halfH || uoy > halfH) continue;
        } else {
          const inv = 1 / udy;
          let t1 = (-halfH - uoy) * inv;
          let t2 = (halfH - uoy) * inv;
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
          tMax = Math.min(tMax, t2);
          if (tMin > tMax) continue;
        }

        // Z slab
        if (Math.abs(udz) < 1e-6) {
          if (uoz < -p.halfD || uoz > p.halfD) continue;
        } else {
          const inv = 1 / udz;
          let t1 = (-p.halfD - uoz) * inv;
          let t2 = (p.halfD - uoz) * inv;
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
          tMax = Math.min(tMax, t2);
          if (tMin > tMax) continue;
        }

        if (tMin >= near && tMin < bestDist) {
          bestDist = tMin;
          bestTarget = wall.targetAdapter;

          let unx = 0;
          let uny = 0;
          let unz = 0;
          if (hitAxis === 0) unx = hitSign;
          else if (hitAxis === 1) uny = hitSign;
          else unz = hitSign;

          const lnx = unx * p.cosP + unz * p.sinP;
          const lnz = -unx * p.sinP + unz * p.cosP;
          bestNx = lnx * wall.cosY + lnz * wall.sinY;
          bestNy = uny;
          bestNz = -lnx * wall.sinY + lnz * wall.cosY;
        }
      }
    }

    if (!bestTarget) return null;

    if (outPoint) {
      outPoint.copy(origin).addScaledVector(direction, bestDist);
    }
    if (outNormal) {
      outNormal.set(bestNx, bestNy, bestNz).normalize();
    }
    return { dist: bestDist, target: bestTarget };
  }

  hasLineOfSight(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const segLen = Math.hypot(dx, dy, dz);
    if (segLen < 1e-4) return true;

    this.scratchPos.set(ax, ay, az);
    this.scratchNormal.set(dx / segLen, dy / segLen, dz / segLen);
    const hit = this.raycastSegment(this.scratchPos, this.scratchNormal, 0.05, segLen, null, null);
    return hit === null;
  }

  resolveHorizontalCollision(position: THREE.Vector3, radius: number, bodyHeight: number): void {
    for (const wall of this.walls.values()) {
      if (wall.destroying || wall.hp <= 0) continue;
      const wallTop = wall.y + FULL_WALL_HEIGHT * wall.heightScale;
      if (position.y >= wallTop - 0.08 || position.y + bodyHeight <= wall.y + 0.08) continue;

      const dx = position.x - wall.x;
      const dz = position.z - wall.z;
      const lx = dx * wall.cosY - dz * wall.sinY;
      const lz = dx * wall.sinY + dz * wall.cosY;

      // Broadphase covering full wider semi-circular span (±2.42m X, +0.25m..-1.65m Z)
      if (Math.abs(lx) > 3.15 + radius || lz > 0.75 + radius || lz < -2.15 - radius) continue;

      for (let i = 0; i < GLOO_WALL_PANEL_SPECS.length; i++) {
        const p = GLOO_WALL_PANEL_SPECS[i];
        const px = lx - p.px;
        const pz = lz - p.pz;
        const ux = px * p.cosP - pz * p.sinP;
        const uz = px * p.sinP + pz * p.cosP;

        const clampedX = Math.max(-p.halfW, Math.min(p.halfW, ux));
        const clampedZ = Math.max(-p.halfD, Math.min(p.halfD, uz));
        const diffX = ux - clampedX;
        const diffZ = uz - clampedZ;
        const distSq = diffX * diffX + diffZ * diffZ;

        if (distSq < radius * radius) {
          let pushUx = 0;
          let pushUz = 0;
          if (distSq > 1e-6) {
            const d = Math.sqrt(distSq);
            const pen = radius - d;
            pushUx = (diffX / d) * pen;
            pushUz = (diffZ / d) * pen;
          } else {
            const penX = p.halfW - Math.abs(ux);
            const penZ = p.halfD - Math.abs(uz);
            if (penX < penZ) {
              pushUx = (ux >= 0 ? 1 : -1) * (penX + radius);
            } else {
              pushUz = (uz >= 0 ? 1 : -1) * (penZ + radius);
            }
          }

          const pushLx = pushUx * p.cosP + pushUz * p.sinP;
          const pushLz = -pushUx * p.sinP + pushUz * p.cosP;
          position.x += pushLx * wall.cosY + pushLz * wall.sinY;
          position.z += -pushLx * wall.sinY + pushLz * wall.cosY;
        }
      }
    }
  }

  update(dt: number, camera?: THREE.Camera): void {
    const safeDt = Math.min(dt, 0.1);
    const toDelete: string[] = [];

    for (const [id, wall] of this.walls) {
      const { rig, skin, heightScale } = wall;

      if (wall.destroying) {
        wall.destroyAnimAge += safeDt;
        const p = Math.min(1, wall.destroyAnimAge / DESTROY_ANIM_DURATION);
        const easeIn = p * p;
        rig.wallRoot.scale.set(
          1 + easeIn * 0.14,
          Math.max(0.02, (1 - easeIn * 0.98) * heightScale),
          1 + easeIn * 0.14,
        );
        rig.mainMat.transparent = true;
        rig.mainMat.opacity = Math.max(0, skin.opacity * (1 - p));
        rig.accentMat.transparent = true;
        rig.accentMat.opacity = Math.max(0, 1 - p);
        if (rig.crackMat) rig.crackMat.opacity = Math.max(0, 0.92 * (1 - p));
        rig.rimMat.opacity = Math.max(0, 0.84 * (1 - p));
        rig.frostRingMat.opacity = Math.max(0, 0.85 * (1 - p));
        if (p >= 1) {
          toDelete.push(id);
        }
        continue;
      }

      wall.ambientAge += safeDt;

      let spawnFlash = 0;
      if (wall.spawnAnimAge < SPAWN_ANIM_DURATION) {
        wall.spawnAnimAge += safeDt;
        const t = Math.min(1, wall.spawnAnimAge / SPAWN_ANIM_DURATION);
        const inv = 1 - t;
        const easeOutCubic = 1 - inv * inv * inv;
        const overshoot = Math.sin(t * Math.PI) * 0.045 * (1 - t * 0.35);
        const sy = Math.max(0.05, 0.05 + 0.95 * easeOutCubic + overshoot) * heightScale;
        const sxz = 0.74 + 0.26 * easeOutCubic + overshoot * 0.4;
        rig.wallRoot.scale.set(sxz, sy, sxz);

        const ringScale = 0.28 + 0.96 * easeOutCubic - Math.max(0, t - 0.72) * 0.85;
        rig.frostRing.scale.set(ringScale, ringScale, 1);
        rig.frostRingMat.opacity = 0.95 - t * 0.28;
        spawnFlash = (1 - t) * (1 - t) * 1.15;
      } else {
        rig.wallRoot.scale.set(1, heightScale, 1);
        rig.frostRing.scale.set(1, 1, 1);
        rig.frostRingMat.opacity = 0.56 + Math.sin(wall.ambientAge * 2.4) * 0.1;
      }

      let ambientEmissiveDelta = 0;
      switch (skin.fxStyle) {
        case 'frost_shimmer':
          ambientEmissiveDelta = Math.sin(wall.ambientAge * 3.1) * 0.08;
          break;
        case 'ember_pulse':
          ambientEmissiveDelta = (Math.sin(wall.ambientAge * 4.4) * 0.5 + 0.5) * 0.22;
          break;
        case 'holo_scan':
          ambientEmissiveDelta = Math.sin(wall.ambientAge * 5.2) * 0.14;
          rig.rimMat.opacity = 0.68 + Math.sin(wall.ambientAge * 6.0) * 0.22;
          break;
        case 'arcane_glow':
          ambientEmissiveDelta = Math.sin(wall.ambientAge * 2.6) * 0.16;
          break;
        case 'toxic_surge':
          ambientEmissiveDelta = (Math.sin(wall.ambientAge * 3.8) * 0.5 + 0.5) * 0.18;
          break;
        case 'solar_gleam':
          ambientEmissiveDelta = Math.sin(wall.ambientAge * 2.2) * 0.1;
          break;
      }

      for (let d = 0; d < rig.animatedDecor.length; d++) {
        const dec = rig.animatedDecor[d];
        if (skin.silhouette === 'prism_crown' || skin.silhouette === 'monolith_spires') {
          dec.rotation.y += safeDt * 1.35;
        } else if (skin.silhouette === 'holo_grid') {
          dec.position.y = 1.02 + Math.sin(wall.ambientAge * 2.6) * 0.56;
        } else {
          const pulse = 1 + Math.sin(wall.ambientAge * 3.8 + d) * 0.05;
          dec.scale.z = 0.32 * pulse;
        }
      }

      let hitFlash = 0;
      if (wall.hitFlashTimer > 0) {
        wall.hitFlashTimer = Math.max(0, wall.hitFlashTimer - safeDt);
        hitFlash = (wall.hitFlashTimer / 0.14) * 1.15;
      }
      rig.mainMat.emissiveIntensity = Math.max(
        0.08,
        skin.baseEmissiveIntensity + ambientEmissiveDelta + spawnFlash + hitFlash,
      );
      rig.accentMat.emissiveIntensity = 0.42 + spawnFlash * 0.9 + hitFlash * 0.6 + ambientEmissiveDelta;

      if (wall.hpVisibleTimer > 0) {
        wall.hpVisibleTimer = Math.max(0, wall.hpVisibleTimer - safeDt);
        if (wall.hpVisibleTimer <= 0) {
          wall.hpBarGroup.visible = false;
        } else if (camera) {
          wall.hpBarGroup.quaternion.copy(camera.quaternion);
        }
      }
    }

    for (const id of toDelete) {
      this.removeWallEntity(id);
    }

    for (let i = 0; i < this.shards.length; i++) {
      const shard = this.shards[i];
      if (!shard.active) continue;
      shard.age += safeDt;
      if (shard.age >= shard.duration) {
        shard.active = false;
        shard.mesh.visible = false;
        continue;
      }
      shard.vel.y -= 14.5 * safeDt;
      shard.mesh.position.addScaledVector(shard.vel, safeDt);
      shard.mesh.rotation.x += shard.rotVel.x * safeDt;
      shard.mesh.rotation.y += shard.rotVel.y * safeDt;
      shard.mesh.rotation.z += shard.rotVel.z * safeDt;
      const lifeRatio = Math.max(0.05, 1 - shard.age / shard.duration);
      shard.mesh.scale.setScalar(shard.baseScale * lifeRatio);
      shard.mat.opacity = Math.min(0.95, lifeRatio * 1.15);
    }
  }

  private removeWallEntity(wallId: string): void {
    const entity = this.walls.get(wallId);
    if (!entity) return;
    this.scene.remove(entity.group);
    entity.rig.dispose();
    (entity.hpFillMesh.material as THREE.Material).dispose();
    this.walls.delete(wallId);
  }

  getActiveWallCount(): number {
    let n = 0;
    for (const w of this.walls.values()) {
      if (!w.destroying && w.hp > 0) n++;
    }
    return n;
  }

  clearAll(): void {
    this.hidePreviewGhost();
    for (const id of Array.from(this.walls.keys())) {
      this.removeWallEntity(id);
    }
    for (let i = 0; i < this.shards.length; i++) {
      this.shards[i].active = false;
      this.shards[i].mesh.visible = false;
    }
  }

  dispose(): void {
    this.clearAll();
    if (this.previewRig) {
      this.scene.remove(this.previewRig.root);
      this.previewRig.dispose();
      this.previewRig = null;
      this.previewSkinId = null;
    }
    for (let i = 0; i < this.shards.length; i++) {
      this.scene.remove(this.shards[i].mesh);
      this.shards[i].mat.dispose();
    }
    this.shards.length = 0;

    this.shardGeo.dispose();
    this.hpBgGeo.dispose();
    this.hpFillGeo.dispose();
    this.hpBgMat.dispose();
  }
}
