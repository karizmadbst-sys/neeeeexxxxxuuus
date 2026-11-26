import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import { CHARACTER_ROSTER } from '../characters/CharacterData';
import type { AssetManager } from '../core/AssetManager';
import type { QualityPreset, Subsystem } from '../core/Types';
import type { MinimapMarker } from '../maps/IMapSystem';
import type { PlayerStateSnapshot } from '../player/IPlayerController';
import {
  DEFAULT_R6_CUSTOMIZATION,
  normalizeR6Customization,
  type R6Customization,
} from '../player/R6CustomizationData';
import { PlayerVisuals } from '../player/PlayerVisuals';
import type { DamageCalculationResult } from '../weapons/DamageSystem';
import type { DamageableTarget, HitDetection } from '../weapons/HitDetection';
import { Weapon } from '../weapons/Weapon';
import { WEAPON_BY_ID } from '../weapons/WeaponData';
import {
  getRankTierSpec,
  type RemotePlayerDeltaSnapshot,
  type RemotePlayerSnapshot,
} from './RankedTypes';
import { updateRootMatrixWorld } from '../utils/TransformUtils';

interface RemoteTracerSlot {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
}

const MAX_REMOTE_TRACERS = 48;

function toCustomization(raw: RemotePlayerSnapshot['customization']): R6Customization {
  const normalized = normalizeR6Customization(
    raw as unknown as Partial<R6Customization> & Record<string, unknown>,
  );
  return {
    ...normalized,
    petEnabled: false,
  };
}

const REMOTE_HEAD_GEO = new THREE.BoxGeometry(0.56, 0.50, 0.56);
const REMOTE_BODY_GEO = new THREE.BoxGeometry(0.76, 1.34, 0.50);
const REMOTE_HITBOX_MAT = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
  side: THREE.DoubleSide,
});

class RemotePlayerEntity implements DamageableTarget {
  readonly id: string;
  readonly name: string;
  readonly root = new THREE.Group();
  readonly headMesh: THREE.Mesh;
  readonly bodyMesh: THREE.Mesh;
  readonly visuals: PlayerVisuals;

  private nameplateCanvas: HTMLCanvasElement | null = null;
  private nameplateCtx: CanvasRenderingContext2D | null = null;
  private nameplateTexture: THREE.CanvasTexture | null = null;
  private nameplateSprite: THREE.Sprite | null = null;
  private nameplateMat: THREE.SpriteMaterial | null = null;

  private attachedWeapon: Weapon | null = null;
  private attachedWeaponId: string | null = null;
  private attachedWeaponSkinId: string | null = null;
  private weaponSkins: Record<string, string> = {};

  health = 200;
  maxHealth = 200;
  shield = 50;
  maxShield = 100;
  damageReductionPct = 0;
  isAlive = true;

  targetPos = new THREE.Vector3();
  currentPos = new THREE.Vector3();
  targetYaw = 0;
  currentYaw = 0;
  dropPhase: RemotePlayerSnapshot['dropPhase'] = 'airplane';
  tier: RemotePlayerSnapshot['tier'] = 'Bronze';
  rp = 200;
  squadId: string | null = null;
  isAlly = false;
  recentShotUntilMs = 0;
  private lastPlateKey = '';
  private lastShadowCast = false;
  private disposed = false;
  deathElapsedSec = 0;
  corpseRemoved = false;
  private deathInitialized = false;
  private glooDeployElapsed = 0;
  private glooDeployDuration = 0;
  private glooDeployAccentHex = '#38bdf8';
  private readonly glooDeployStateObj = {
    active: false,
    progress: 0,
    accentHex: '#38bdf8',
  };

  private readonly stateSnap: PlayerStateSnapshot;

  constructor(initial: RemotePlayerSnapshot, assetManager: AssetManager, localSquadId: string | null = null) {
    this.id = initial.playerId;
    this.name = initial.name;
    this.tier = initial.tier;
    this.rp = initial.rp;
    this.squadId = initial.squadId ?? null;
    this.isAlly = Boolean(localSquadId && this.squadId && this.squadId === localSquadId);

    this.visuals = new PlayerVisuals(assetManager);
    const charDef =
      CHARACTER_ROSTER.find((c) => c.id === initial.characterId) ?? CHARACTER_ROSTER[0];
    this.visuals.setHumanModelId(charDef.model.humanModelId);
    this.visuals.setAccentColors(charDef.model.primaryColorHex, charDef.model.visorColorHex);
    this.visuals.setModelScale(charDef.model.scale);
    this.visuals.setCustomization(toCustomization(initial.customization));
    this.root.add(this.visuals.root);

    // Invisible raycast hitboxes using shared GPU resources
    this.headMesh = new THREE.Mesh(REMOTE_HEAD_GEO, REMOTE_HITBOX_MAT);
    this.headMesh.position.set(0, 1.56, 0);
    this.bodyMesh = new THREE.Mesh(REMOTE_BODY_GEO, REMOTE_HITBOX_MAT);
    this.bodyMesh.position.set(0, 0.72, 0);
    this.root.add(this.headMesh, this.bodyMesh);

    this.currentPos.set(initial.x, initial.y, initial.z);
    this.targetPos.copy(this.currentPos);
    this.currentYaw = initial.yaw;
    this.targetYaw = initial.yaw;

    this.stateSnap = {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, initial.yaw, 0, 'YXZ'),
      velocity: new THREE.Vector3(0, -10, 0),
      health: initial.health,
      maxHealth: initial.maxHealth,
      shield: initial.shield,
      maxShield: initial.maxShield,
      movementSpeed: 5.2,
      sprintSpeed: 8.6,
      jumpForce: 8.4,
      isAlive: initial.isAlive,
      isSprinting: initial.isSprinting,
      isCrouching: initial.isCrouching,
      isGrounded: initial.isGrounded,
      animationState: initial.animationState,
    };

    this.applyServerSnapshot(initial, true);
  }

  setGroundHeightSampler(
    sampler?: (worldX: number, worldZ: number, refY: number) => number,
  ): void {
    this.stateSnap.groundHeightSampler = sampler;
  }

  triggerGlooDeployAnimation(accentHex = '#38bdf8', durationSeconds = 0.44): void {
    if (!this.isAlive || this.disposed) return;
    this.glooDeployElapsed = 0;
    this.glooDeployDuration = Math.max(0.24, durationSeconds);
    this.glooDeployAccentHex = accentHex;
    this.glooDeployStateObj.active = true;
    this.glooDeployStateObj.progress = 0;
    this.glooDeployStateObj.accentHex = accentHex;
    this.stateSnap.glooDeployState = this.glooDeployStateObj;
  }

  applyHitDamage(_result: DamageCalculationResult): void {
    // Health & eliminations are 100% server-authoritative in Ranked mode;
    // visual updates arrive via combat:damage and match:state.
  }

  setLocalSquadId(localSquadId: string | null): void {
    const nextAlly = Boolean(localSquadId && this.squadId && this.squadId === localSquadId);
    if (nextAlly !== this.isAlly) {
      this.isAlly = nextAlly;
      this.lastPlateKey = '';
      if (this.nameplateSprite?.visible) {
        this.redrawNameplateIfNeeded();
      }
    }
  }

  applyServerSnapshot(
    s: RemotePlayerSnapshot | RemotePlayerDeltaSnapshot,
    snapImmediate = false,
    localSquadId: string | null = null,
  ): void {
    if ('tier' in s) {
      this.tier = s.tier;
      this.rp = s.rp;
      this.maxHealth = s.maxHealth;
      this.maxShield = s.maxShield;
    }
    if ('squadId' in s && s.squadId !== undefined) {
      this.squadId = s.squadId ?? null;
      this.isAlly = Boolean(localSquadId && this.squadId && this.squadId === localSquadId);
    }
    this.health = s.health;
    this.shield = s.shield;
    this.damageReductionPct = s.damageReductionPct;
    this.isAlive = s.isAlive;
    this.dropPhase = s.dropPhase;

    this.targetPos.set(s.x, s.y, s.z);
    this.targetYaw = s.yaw;
    if (snapImmediate) {
      this.currentPos.copy(this.targetPos);
      this.currentYaw = this.targetYaw;
    }

    this.stateSnap.health = s.health;
    this.stateSnap.shield = s.shield;
    this.stateSnap.isAlive = s.isAlive;
    this.stateSnap.isCrouching = s.isCrouching;
    this.stateSnap.isSprinting = s.isSprinting;
    this.stateSnap.isGrounded = s.isGrounded;
    this.stateSnap.animationState = s.animationState;
    this.stateSnap.weaponId = s.activeWeaponId;

    this.visuals.setArenaGearVisuals(s.armorTier, s.helmetTier, s.backpackTier);

    if ('weaponSkins' in s && s.weaponSkins && typeof s.weaponSkins === 'object') {
      this.weaponSkins = { ...s.weaponSkins };
    }

    const desiredSkinId = s.activeWeaponId ? (this.weaponSkins[s.activeWeaponId] ?? null) : null;
    if (s.activeWeaponId !== this.attachedWeaponId) {
      this.attachedWeaponId = s.activeWeaponId;
      this.attachedWeaponSkinId = desiredSkinId;
      this.attachedWeapon?.dispose();
      this.attachedWeapon = null;
      if (s.activeWeaponId && WEAPON_BY_ID[s.activeWeaponId]) {
        this.attachedWeapon = new Weapon(WEAPON_BY_ID[s.activeWeaponId]);
        this.attachedWeapon.applySkin(desiredSkinId);
        this.attachedWeapon.setShadowCasting(this.lastShadowCast);
        this.visuals.attachWeaponMesh(this.attachedWeapon.mesh, true, s.activeWeaponId);
      } else {
        this.visuals.attachWeaponMesh(null, true, null);
      }
    } else if (this.attachedWeapon && desiredSkinId !== this.attachedWeaponSkinId) {
      this.attachedWeaponSkinId = desiredSkinId;
      this.attachedWeapon.applySkin(desiredSkinId);
    }

    // Crouch / Sit hitbox vertical adjustment (aligned to R6 dimensions)
    const lowered = s.isCrouching || s.animationState === 'Sit';
    this.headMesh.position.y = lowered ? 1.32 : 1.56;
    this.bodyMesh.position.y = lowered ? 0.54 : 0.72;
    this.bodyMesh.scale.y = lowered ? 0.84 : 1.0;

    if (this.nameplateSprite?.visible) {
      this.redrawNameplateIfNeeded();
    }

    if (!this.isAlive) {
      this.beginDeathDecay();
    } else if (this.deathInitialized) {
      this.deathInitialized = false;
      this.deathElapsedSec = 0;
      this.corpseRemoved = false;
    }
  }

  beginDeathDecay(): void {
    this.isAlive = false;
    this.health = 0;
    this.shield = 0;
    this.stateSnap.health = 0;
    this.stateSnap.shield = 0;
    this.stateSnap.isAlive = false;
    this.stateSnap.animationState = 'Death';
    this.headMesh.visible = false;
    this.bodyMesh.visible = false;
    if (this.nameplateSprite) {
      this.nameplateSprite.visible = false;
    }
    this.lastPlateKey = '';
    if (!this.deathInitialized) {
      this.deathInitialized = true;
      this.deathElapsedSec = 0;
      this.corpseRemoved = false;
      this.attachedWeaponId = null;
      this.attachedWeapon?.dispose();
      this.attachedWeapon = null;
      this.visuals.attachWeaponMesh(null);
      if (this.lastShadowCast) {
        this.lastShadowCast = false;
        this.visuals.setShadowCasting(false);
      }
    }
  }

  private ensureNameplate(): void {
    if (this.nameplateSprite || this.disposed) return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 2.38, 0);
    sprite.scale.set(2.1, 0.52, 1);
    sprite.visible = false;
    this.root.add(sprite);

    this.nameplateCanvas = canvas;
    this.nameplateCtx = ctx;
    this.nameplateTexture = texture;
    this.nameplateMat = mat;
    this.nameplateSprite = sprite;
    this.lastPlateKey = '';
  }

  private redrawNameplateIfNeeded(): void {
    if (!this.nameplateCtx || !this.nameplateCanvas || !this.nameplateTexture) return;
    const key = `${this.isAlly ? 1 : 0}|${this.tier}|${Math.round(this.health)}|${Math.round(this.shield)}|${this.isAlive ? 1 : 0}`;
    if (key === this.lastPlateKey) return;
    this.lastPlateKey = key;

    const ctx = this.nameplateCtx;
    const w = this.nameplateCanvas.width;
    const h = this.nameplateCanvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!this.isAlive) return;

    const spec = getRankTierSpec(this.tier === 'Bronze' ? 0 : this.rp);
    const strokeHex = this.isAlly ? '#34d399' : spec.colorHex;
    const labelColor = this.isAlly ? '#6ee7b7' : spec.colorHex;

    ctx.fillStyle = this.isAlly ? 'rgba(6, 24, 20, 0.85)' : 'rgba(7, 11, 20, 0.82)';
    ctx.strokeStyle = strokeHex;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(10, 6, w - 20, h - 12, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = labelColor;
    ctx.fillText(this.isAlly ? `[ALLY] ${this.name}` : `[${this.tier.toUpperCase()}] ${this.name}`, w / 2, 24);

    // Health + Shield bar
    const barW = w - 44;
    const barX = 22;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.fillRect(barX, 40, barW, 8);
    const hpFrac = Math.max(0, Math.min(1, this.health / Math.max(1, this.maxHealth)));
    ctx.fillStyle = '#34d399';
    ctx.fillRect(barX, 40, barW * hpFrac, 8);

    if (this.shield > 0) {
      const shFrac = Math.max(0, Math.min(1, this.shield / Math.max(1, this.maxShield)));
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX, 50, barW * shFrac, 4);
    }

    this.nameplateTexture.needsUpdate = true;
  }

  update(
    delta: number,
    elapsed: number,
    viewerPos: THREE.Vector3,
    qualityPreset: QualityPreset,
    shadowsEnabled: boolean,
    inFrustum = true,
  ): void {
    const visibleInWorld = this.dropPhase !== 'airplane' && this.dropPhase !== 'inactive';
    if (!this.isAlive) {
      this.beginDeathDecay();
      if (this.corpseRemoved || !visibleInWorld) {
        this.root.visible = false;
        this.headMesh.visible = false;
        this.bodyMesh.visible = false;
        if (this.nameplateSprite) this.nameplateSprite.visible = false;
        return;
      }
      this.deathElapsedSec += delta;
      if (this.deathElapsedSec >= 8.0) {
        this.corpseRemoved = true;
        this.root.visible = false;
        this.headMesh.visible = false;
        this.bodyMesh.visible = false;
        if (this.nameplateSprite) this.nameplateSprite.visible = false;
        return;
      }
      this.root.visible = inFrustum;
      this.headMesh.visible = false;
      this.bodyMesh.visible = false;
      if (!inFrustum) {
        if (this.nameplateSprite) this.nameplateSprite.visible = false;
        return;
      }
      this.root.position.copy(this.currentPos);
      this.stateSnap.rotation.y = this.currentYaw;
      this.stateSnap.animationState = 'Death';
      this.visuals.sync(this.stateSnap, delta, elapsed, false);
      updateRootMatrixWorld(this.root);
      return;
    }

    if (!visibleInWorld) {
      this.root.visible = false;
      this.headMesh.visible = false;
      this.bodyMesh.visible = false;
      if (this.nameplateSprite) this.nameplateSprite.visible = false;
      return;
    }

    const posAlpha = 1 - Math.exp(-15 * delta);
    this.currentPos.lerp(this.targetPos, posAlpha);
    this.root.position.copy(this.currentPos);

    let diff = this.targetYaw - this.currentYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.currentYaw += diff * (1 - Math.exp(-14 * delta));
    this.stateSnap.rotation.y = this.currentYaw;

    this.root.visible = inFrustum;
    this.headMesh.visible = this.dropPhase === 'landed';
    this.bodyMesh.visible = this.dropPhase === 'landed';

    if (!inFrustum) {
      if (this.nameplateSprite) this.nameplateSprite.visible = false;
      if (this.dropPhase === 'landed') {
        this.headMesh.rotation.y = this.currentYaw;
        this.bodyMesh.rotation.y = this.currentYaw;
        this.root.updateMatrix();
        this.root.matrixWorld.makeTranslation(this.currentPos.x, this.currentPos.y, this.currentPos.z);
        this.headMesh.updateMatrix();
        this.headMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.headMesh.matrix);
        this.bodyMesh.updateMatrix();
        this.bodyMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.bodyMesh.matrix);
      }
      return;
    }

    const distSq = this.currentPos.distanceToSquared(viewerPos);
    const maxPlateDist = qualityPreset === 'low' ? 60 : 95;
    const showPlate = distSq <= maxPlateDist * maxPlateDist;
    if (showPlate) {
      this.ensureNameplate();
      this.redrawNameplateIfNeeded();
      if (this.nameplateSprite) {
        this.nameplateSprite.visible = true;
      }
    } else if (this.nameplateSprite) {
      this.nameplateSprite.visible = false;
    }

    const maxShadowDist = qualityPreset === 'high' ? 88 : 55;
    const castShadow =
      shadowsEnabled && qualityPreset !== 'low' && distSq <= maxShadowDist * maxShadowDist;
    if (castShadow !== this.lastShadowCast) {
      this.lastShadowCast = castShadow;
      this.visuals.setShadowCasting(castShadow);
      this.attachedWeapon?.setShadowCasting(castShadow);
    }

    if (this.glooDeployDuration > 0) {
      this.glooDeployElapsed += delta;
      if (this.glooDeployElapsed >= this.glooDeployDuration) {
        this.glooDeployDuration = 0;
        this.glooDeployElapsed = 0;
        this.glooDeployStateObj.active = false;
        this.stateSnap.glooDeployState = null;
      } else {
        this.glooDeployStateObj.active = true;
        this.glooDeployStateObj.progress = Math.min(1, this.glooDeployElapsed / this.glooDeployDuration);
        this.glooDeployStateObj.accentHex = this.glooDeployAccentHex;
        this.stateSnap.glooDeployState = this.glooDeployStateObj;
      }
    }

    const reducedDist = qualityPreset === 'low' ? 48 : qualityPreset === 'medium' ? 82 : 120;
    const reducedDetail = distSq > reducedDist * reducedDist;
    const skipIk = distSq > 20 * 20 && !this.stateSnap.glooDeployState?.active;
    this.visuals.sync(this.stateSnap, delta, elapsed, reducedDetail, skipIk);
    this.headMesh.rotation.y = this.currentYaw;
    this.bodyMesh.rotation.y = this.currentYaw;
    updateRootMatrixWorld(this.root);
    this.headMesh.updateMatrixWorld(false);
    this.bodyMesh.updateMatrixWorld(false);
  }

  dispose(): void {
    this.disposed = true;
    this.attachedWeapon?.dispose();
    this.attachedWeapon = null;
    this.visuals.dispose();
    this.nameplateTexture?.dispose();
    this.nameplateMat?.dispose();
    this.nameplateCanvas = null;
    this.nameplateCtx = null;
    this.nameplateTexture = null;
    this.nameplateMat = null;
    this.nameplateSprite = null;
  }
}

export class RemotePlayerManager implements Subsystem {
  readonly root = new THREE.Group();

  private readonly players = new Map<string, RemotePlayerEntity>();
  private readonly tracers: RemoteTracerSlot[] = [];
  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly tracerGeo: THREE.BoxGeometry;
  private readonly tracerMat: THREE.MeshBasicMaterial;
  private readonly scratchMat = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3(1, 1, 1);
  private readonly scratchFwd = new THREE.Vector3(0, 0, 1);
  private readonly scratchDir = new THREE.Vector3();
  private readonly seenIdsScratch = new Set<string>();
  private readonly radarMarkerPool: MinimapMarker[] = [];
  private readonly radarMarkersScratch: MinimapMarker[] = [];
  private readonly teammateMarkerPool: MinimapMarker[] = [];
  private readonly teammateMarkersScratch: MinimapMarker[] = [];
  private readonly squadHudScratch: Array<{
    id: string;
    name: string;
    health: number;
    maxHealth: number;
    shield: number;
    maxShield: number;
    isAlive: boolean;
  }> = [];

  private localPlayerId: string | null = null;
  private localSquadId: string | null = null;
  private qualityPreset: QualityPreset = 'medium';
  private shadowsEnabled = true;
  private groundHeightSampler?: (worldX: number, worldZ: number, refY: number) => number;

  constructor(
    private readonly assetManager: AssetManager,
    private readonly hitDetection: HitDetection,
    private readonly audioManager: AudioManager,
  ) {
    this.tracerGeo = new THREE.BoxGeometry(0.04, 0.04, 0.85);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: '#fb923c' });
    this.tracerMesh = new THREE.InstancedMesh(this.tracerGeo, this.tracerMat, MAX_REMOTE_TRACERS);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    this.root.add(this.tracerMesh);

    for (let i = 0; i < MAX_REMOTE_TRACERS; i++) {
      this.tracers.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        maxAge: 0.45,
      });
    }
  }

  setQualityPreset(quality: QualityPreset, shadowsEnabled: boolean): void {
    this.qualityPreset = quality;
    this.shadowsEnabled = shadowsEnabled;
  }

  setGroundHeightSampler(
    sampler?: (worldX: number, worldZ: number, refY: number) => number,
  ): void {
    this.groundHeightSampler = sampler;
    for (const p of this.players.values()) {
      p.setGroundHeightSampler(sampler);
    }
  }

  setLocalPlayerId(playerId: string | null): void {
    this.localPlayerId = playerId;
  }

  setLocalSquadId(squadId: string | null): void {
    this.localSquadId = squadId;
    for (const p of this.players.values()) {
      p.setLocalSquadId(squadId);
    }
  }

  syncPlayers(snapshots: readonly (RemotePlayerSnapshot | RemotePlayerDeltaSnapshot)[]): void {
    const seen = this.seenIdsScratch;
    seen.clear();
    for (let i = 0; i < snapshots.length; i++) {
      const s = snapshots[i];
      if (s.playerId === this.localPlayerId) continue;
      seen.add(s.playerId);

      let entity = this.players.get(s.playerId);
      if (!entity) {
        const full: RemotePlayerSnapshot =
          'name' in s
            ? s
            : {
                ...s,
                name: s.playerId,
                rp: 200,
                tier: 'Bronze',
                platform: 'pc',
                maxHealth: 200,
                maxShield: 100,
                characterId: 'vanguard',
                customization: { ...DEFAULT_R6_CUSTOMIZATION },
              };
        entity = new RemotePlayerEntity(full, this.assetManager, this.localSquadId);
        entity.setGroundHeightSampler(this.groundHeightSampler);
        this.players.set(s.playerId, entity);
        this.root.add(entity.root);
        this.hitDetection.registerTarget(entity);
      } else {
        entity.applyServerSnapshot(s, false, this.localSquadId);
      }
    }

    for (const [id, entity] of this.players.entries()) {
      if (!seen.has(id)) {
        this.hitDetection.unregisterTarget(entity);
        this.root.remove(entity.root);
        entity.dispose();
        this.players.delete(id);
      }
    }
  }

  addOrUpdateSinglePlayer(snapshot: RemotePlayerSnapshot): void {
    if (snapshot.playerId === this.localPlayerId) return;
    const existing = this.players.get(snapshot.playerId);
    if (existing) {
      existing.applyServerSnapshot(snapshot, false, this.localSquadId);
      return;
    }
    const entity = new RemotePlayerEntity(snapshot, this.assetManager, this.localSquadId);
    entity.setGroundHeightSampler(this.groundHeightSampler);
    this.players.set(snapshot.playerId, entity);
    this.root.add(entity.root);
    this.hitDetection.registerTarget(entity);
  }

  removePlayer(playerId: string): void {
    const entity = this.players.get(playerId);
    if (!entity) return;
    this.hitDetection.unregisterTarget(entity);
    this.root.remove(entity.root);
    entity.dispose();
    this.players.delete(playerId);
  }

  applyDamageUpdate(targetId: string, newHealth: number, newShield: number): void {
    const entity = this.players.get(targetId);
    if (!entity) return;
    entity.health = newHealth;
    entity.shield = newShield;
  }

  markEliminated(victimId: string): void {
    const entity = this.players.get(victimId);
    if (!entity) return;
    this.hitDetection.unregisterTarget(entity);
    entity.beginDeathDecay();
  }

  spawnRemoteShot(
    shooterId: string,
    weaponId: string,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    listenerPos: THREE.Vector3,
  ): void {
    const shooter = this.players.get(shooterId);
    if (shooter) {
      shooter.recentShotUntilMs = Date.now() + 3500;
    }

    const dist = Math.hypot(ox - listenerPos.x, oy - listenerPos.y, oz - listenerPos.z);
    if (weaponId === 'fists') {
      if (dist <= 28) {
        this.audioManager.playPunchSwing();
      }
      return;
    }

    const def = WEAPON_BY_ID[weaponId];
    const maxTracerDist = this.qualityPreset === 'low' ? 125 : 185;
    if (dist <= maxTracerDist) {
      for (let i = 0; i < MAX_REMOTE_TRACERS; i++) {
        const t = this.tracers[i];
        if (!t.active) {
          t.active = true;
          t.position.set(ox, oy, oz);
          const speed = def?.bulletSpeed ?? 180;
          t.velocity.set(dx, dy, dz).normalize().multiplyScalar(speed);
          t.age = 0;
          t.maxAge = 0.55;
          break;
        }
      }
    }

    if (def && dist <= 135) {
      this.audioManager.playDistantGunshot(def.sound);
    }
  }

  getTeammateMarkers(): MinimapMarker[] {
    const markers = this.teammateMarkersScratch;
    markers.length = 0;
    let writeIdx = 0;

    for (const p of this.players.values()) {
      if (!p.isAlly || !p.isAlive || p.dropPhase === 'airplane' || p.dropPhase === 'inactive') continue;
      let m = this.teammateMarkerPool[writeIdx];
      if (!m) {
        m = { id: p.id, x: p.currentPos.x, z: p.currentPos.z, label: p.name, kind: 'teammate' };
        this.teammateMarkerPool.push(m);
      } else {
        m.id = p.id;
        m.x = p.currentPos.x;
        m.z = p.currentPos.z;
        m.label = p.name;
        m.kind = 'teammate';
      }
      markers.push(m);
      writeIdx++;
    }
    return markers;
  }

  getSquadmateHudStatuses(): ReadonlyArray<{
    id: string;
    name: string;
    health: number;
    maxHealth: number;
    shield: number;
    maxShield: number;
    isAlive: boolean;
  }> {
    const out = this.squadHudScratch;
    let writeIdx = 0;
    for (const p of this.players.values()) {
      if (!p.isAlly) continue;
      let entry = out[writeIdx];
      if (!entry) {
        entry = {
          id: p.id,
          name: p.name,
          health: p.health,
          maxHealth: p.maxHealth,
          shield: p.shield,
          maxShield: p.maxShield,
          isAlive: p.isAlive,
        };
        out.push(entry);
      } else {
        entry.id = p.id;
        entry.name = p.name;
        entry.health = p.health;
        entry.maxHealth = p.maxHealth;
        entry.shield = p.shield;
        entry.maxShield = p.maxShield;
        entry.isAlive = p.isAlive;
      }
      writeIdx++;
    }
    out.length = writeIdx;
    return out;
  }

  hasAliveTeammate(): boolean {
    for (const p of this.players.values()) {
      if (p.isAlly && p.isAlive) return true;
    }
    return false;
  }

  getEnemyRadarMarkers(playerPos: THREE.Vector3, reconRadius: number): MinimapMarker[] {
    const now = Date.now();
    const rSq = reconRadius * reconRadius;
    const markers = this.radarMarkersScratch;
    markers.length = 0;
    let writeIdx = 0;

    for (const p of this.players.values()) {
      if (!p.isAlive || p.isAlly || p.dropPhase !== 'landed') continue;
      const dx = p.currentPos.x - playerPos.x;
      const dz = p.currentPos.z - playerPos.z;
      const dSq = dx * dx + dz * dz;
      const firingRecently = p.recentShotUntilMs > now && dSq <= 110 * 110;
      const reconDetected = reconRadius > 24 && dSq <= rSq;
      if (firingRecently || reconDetected) {
        let m = this.radarMarkerPool[writeIdx];
        if (!m) {
          m = { id: p.id, x: p.currentPos.x, z: p.currentPos.z, label: p.name, kind: 'enemy' };
          this.radarMarkerPool.push(m);
        } else {
          m.id = p.id;
          m.x = p.currentPos.x;
          m.z = p.currentPos.z;
          m.label = p.name;
          m.kind = 'enemy';
        }
        markers.push(m);
        writeIdx++;
      }
    }
    return markers;
  }

  getFirstAliveTargetPosition(out: THREE.Vector3): string | null {
    // Prioritize alive squadmates when spectating
    for (const p of this.players.values()) {
      if (p.isAlly && p.isAlive && p.dropPhase !== 'airplane') {
        out.copy(p.currentPos);
        return p.name;
      }
    }
    for (const p of this.players.values()) {
      if (p.isAlive && p.dropPhase !== 'airplane') {
        out.copy(p.currentPos);
        return p.name;
      }
    }
    return null;
  }

  getRemoteTargetIds(): Set<string> {
    return new Set(this.players.keys());
  }

  isRemoteTargetId(id: string): boolean {
    return this.players.has(id);
  }

  getPlayerName(id: string): string | null {
    return this.players.get(id)?.name ?? null;
  }

  getPlayerPosition(id: string, out: THREE.Vector3): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    out.copy(p.currentPos);
    return true;
  }

  fillActorPositions(out: Array<{ x: number; y: number; z: number }>): void {
    out.length = 0;
    for (const p of this.players.values()) {
      if (!p.isAlive || p.dropPhase !== 'landed') continue;
      out.push({ x: p.currentPos.x, y: p.currentPos.y, z: p.currentPos.z });
    }
  }

  triggerGlooDeployAnimation(playerId: string, accentHex = '#38bdf8'): void {
    const entity = this.players.get(playerId);
    if (!entity) return;
    entity.triggerGlooDeployAnimation(accentHex);
  }

  update(
    deltaSeconds: number,
    elapsedSeconds: number,
    viewerPos: THREE.Vector3,
    isSphereInFrustum?: (x: number, y: number, z: number, radius: number) => boolean,
  ): void {
    for (const p of this.players.values()) {
      const inFrustum = isSphereInFrustum
        ? isSphereInFrustum(p.currentPos.x, p.currentPos.y + 1.0, p.currentPos.z, 2.6)
        : true;
      p.update(
        deltaSeconds,
        elapsedSeconds,
        viewerPos,
        this.qualityPreset,
        this.shadowsEnabled,
        inFrustum,
      );
    }

    let count = 0;
    for (let i = 0; i < MAX_REMOTE_TRACERS; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;
      t.age += deltaSeconds;
      if (t.age >= t.maxAge) {
        t.active = false;
        continue;
      }
      t.position.addScaledVector(t.velocity, deltaSeconds);
      this.scratchDir.copy(t.velocity).normalize();
      this.scratchQuat.setFromUnitVectors(this.scratchFwd, this.scratchDir);
      this.scratchMat.compose(t.position, this.scratchQuat, this.scratchScale);
      this.tracerMesh.setMatrixAt(count, this.scratchMat);
      count++;
    }
    this.tracerMesh.count = count;
    if (count > 0) {
      this.tracerMesh.instanceMatrix.needsUpdate = true;
    }
  }

  clearAll(): void {
    for (const entity of this.players.values()) {
      this.hitDetection.unregisterTarget(entity);
      this.root.remove(entity.root);
      entity.dispose();
    }
    this.players.clear();
    for (const t of this.tracers) {
      t.active = false;
    }
    this.tracerMesh.count = 0;
  }

  dispose(): void {
    this.clearAll();
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
  }
}
