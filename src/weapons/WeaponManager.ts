import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { AbilityModifiers } from '../characters/CharacterAbility';
import type { QualityPreset, Subsystem } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import type { LootPoint, MinimapMarker } from '../maps/IMapSystem';
import { TRAINING_GROUND_TARGETS } from '../maps/TrainingGroundData';
import type { PlayerCollisionWorld } from '../player/IPlayerController';
import type { Player } from '../player/Player';
import { BulletSystem, type BulletHitNotification } from './Bullet';
import type { DamageCalculationResult } from './DamageSystem';
import { HitDetection, type DamageableTarget } from './HitDetection';
import type { IWeaponSystem } from './IWeaponSystem';
import { Weapon } from './Weapon';
import { WEAPON_LIST, type WeaponCategory, type WeaponDefinition } from './WeaponData';
import { WeaponController } from './WeaponController';
import { WeaponPickup } from './WeaponPickup';

export interface AmmoSupplyProvider {
  getAmmo: (type: WeaponCategory) => number;
  consumeAmmo: (type: WeaponCategory, requested: number) => number;
}

export interface InventoryWeaponSlotSpec {
  weaponId: string;
  magAmmo?: number;
}

export interface WeaponHudSnapshot {
  activeSlotIndex: number;
  weaponId: string | null;
  weaponName: string;
  weaponType: WeaponCategory | 'NONE';
  ammoInMagazine: number;
  magazineSize: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadProgress: number;
  isBoltCycling: boolean;
  boltCycleProgress: number;
  spreadDeg: number;
  slots: Array<{ slot: number; name: string; active: boolean }>;
  nearbyPickupPrompt: string | null;
  lastHit: BulletHitNotification | null;
  hitmarkerActive: boolean;
  hitmarkerHeadshot: boolean;
  punchCooldownRatio: number;
  isFiring?: boolean;
  unlimitedAmmo?: boolean;
}

interface TargetDummyOptions {
  maxHealth?: number;
  maxShield?: number;
  damageReductionPct?: number;
  armorTier?: 0 | 2 | 3;
}

class CombatTargetDummy implements DamageableTarget {
  readonly root = new THREE.Group();
  readonly headMesh: THREE.Mesh;
  readonly bodyMesh: THREE.Mesh;
  readonly id: string;
  readonly name: string;
  readonly damageReductionPct: number;

  health = 100;
  maxHealth = 100;
  shield = 50;
  maxShield = 50;
  isAlive = true;

  private respawnTimer = 0;
  private hitFlashTimer = 0;
  private baseY: number;
  private readonly baseX: number;
  private readonly patrolAmp: number;
  private readonly patrolSpeed: number;
  private readonly patrolPhase: number;
  private patrolElapsed = 0;
  private lastRotY = Number.NaN;
  private lastPosX = Number.NaN;
  private lastPosY = Number.NaN;
  private readonly baseBodyEmissiveHex: number;
  private readonly armorTrimMesh: THREE.Mesh | null = null;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly headMat: THREE.MeshStandardMaterial;
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly onEliminated?: (dummy: CombatTargetDummy, isHeadshot: boolean) => void;

  constructor(
    id: string,
    name: string,
    x: number,
    groundY: number,
    z: number,
    patrolAmp = 0,
    patrolSpeed = 1.4,
    patrolPhase = 0,
    onEliminated?: (dummy: CombatTargetDummy, isHeadshot: boolean) => void,
    options?: TargetDummyOptions,
  ) {
    this.id = id;
    this.name = name;
    this.baseX = x;
    this.baseY = groundY;
    this.patrolAmp = patrolAmp;
    this.patrolSpeed = patrolSpeed;
    this.patrolPhase = patrolPhase;
    this.onEliminated = onEliminated;
    this.maxHealth = options?.maxHealth ?? 100;
    this.health = this.maxHealth;
    this.maxShield = options?.maxShield ?? 50;
    this.shield = this.maxShield;
    this.damageReductionPct = options?.damageReductionPct ?? 0;
    const armorTier = options?.armorTier;
    this.baseBodyEmissiveHex =
      armorTier === 3 ? 0xd97706 : armorTier === 0 ? 0x475569 : 0x0284c7;
    this.root.position.set(x, groundY, z);

    const plinthGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.14, 12);
    const bodyGeo = new THREE.BoxGeometry(0.68, 1.05, 0.38);
    const headGeo = new THREE.SphereGeometry(0.24, 12, 10);

    const plinthMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.4,
      metalness: 0.7,
    });
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: armorTier === 0 ? '#475569' : '#1e293b',
      emissive: this.baseBodyEmissiveHex,
      emissiveIntensity: armorTier === 0 ? 0.15 : 0.38,
      roughness: 0.45,
      metalness: 0.45,
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: '#f97316',
      emissive: '#ea580c',
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.2,
    });

    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = 0.07;

    this.bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.bodyMesh.position.y = 0.78;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;

    this.headMesh = new THREE.Mesh(headGeo, this.headMat);
    this.headMesh.position.y = 1.56;
    this.headMesh.castShadow = true;

    this.ownedGeometries.push(plinthGeo, bodyGeo, headGeo);
    this.ownedMaterials.push(plinthMat, this.bodyMat, this.headMat);
    this.root.add(plinth, this.bodyMesh, this.headMesh);

    if (armorTier === 2 || armorTier === 3) {
      const trimGeo = new THREE.BoxGeometry(0.72, 0.46, 0.42);
      const trimMat = new THREE.MeshStandardMaterial({
        color: armorTier === 3 ? '#f59e0b' : '#38bdf8',
        emissive: armorTier === 3 ? '#b45309' : '#0369a1',
        emissiveIntensity: 0.45,
        roughness: 0.35,
        metalness: 0.6,
      });
      this.armorTrimMesh = new THREE.Mesh(trimGeo, trimMat);
      this.armorTrimMesh.position.y = 0.92;
      this.ownedGeometries.push(trimGeo);
      this.ownedMaterials.push(trimMat);
      this.root.add(this.armorTrimMesh);
    }
  }

  setGroundY(y: number): void {
    this.baseY = y;
    this.root.position.y = y;
  }

  applyHitDamage(result: DamageCalculationResult): void {
    if (!this.isAlive) return;
    this.shield = Math.max(0, this.shield - result.shieldDamage);
    this.health = Math.max(0, this.health - result.healthDamage);
    this.hitFlashTimer = 0.11;

    this.bodyMat.emissive.setHex(result.isHeadshot ? 0xef4444 : 0xffffff);
    this.bodyMat.emissiveIntensity = 1.4;
    this.headMat.emissive.setHex(result.isHeadshot ? 0xfef08a : 0xffffff);
    this.headMat.emissiveIntensity = 1.8;

    if (this.health <= 0) {
      this.isAlive = false;
      this.respawnTimer = 2.6;
      this.bodyMesh.visible = false;
      this.headMesh.visible = false;
      if (this.armorTrimMesh) this.armorTrimMesh.visible = false;
      this.onEliminated?.(this, result.isHeadshot);
    }
  }

  update(
    deltaSeconds: number,
    playerPos: THREE.Vector3,
    groundHeightSampler?: (x: number, z: number) => number,
  ): void {
    if (!this.isAlive) {
      this.respawnTimer -= deltaSeconds;
      if (this.respawnTimer <= 0) {
        this.isAlive = true;
        this.health = this.maxHealth;
        this.shield = this.maxShield;
        this.bodyMesh.visible = true;
        this.headMesh.visible = true;
        if (this.armorTrimMesh) this.armorTrimMesh.visible = true;
      }
      return;
    }

    if (this.patrolAmp > 0) {
      this.patrolElapsed += deltaSeconds;
      const nx =
        this.baseX +
        Math.sin(this.patrolElapsed * this.patrolSpeed + this.patrolPhase) * this.patrolAmp;
      this.root.position.x = nx;
      if (groundHeightSampler) {
        this.baseY = groundHeightSampler(nx, this.root.position.z);
      }
    }

    // Face player horizontally for intuitive target feedback
    this.root.position.y = this.baseY;
    const nextYaw = Math.atan2(
      playerPos.x - this.root.position.x,
      playerPos.z - this.root.position.z,
    );
    this.root.rotation.y = nextYaw;

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= deltaSeconds;
      if (this.hitFlashTimer <= 0) {
        this.bodyMat.emissive.setHex(this.baseBodyEmissiveHex);
        this.bodyMat.emissiveIntensity = 0.35;
        this.headMat.emissive.setHex(0xea580c);
        this.headMat.emissiveIntensity = 0.85;
      }
    }

    const posChanged =
      this.root.position.x !== this.lastPosX || this.root.position.y !== this.lastPosY;
    const rotChanged = Math.abs(nextYaw - this.lastRotY) > 0.002;
    if (posChanged || rotChanged) {
      this.lastPosX = this.root.position.x;
      this.lastPosY = this.root.position.y;
      this.lastRotY = nextYaw;
      this.root.updateMatrixWorld(true);
    }
  }

  dispose(): void {
    for (const g of this.ownedGeometries) g.dispose();
    this.ownedGeometries.length = 0;
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedMaterials.length = 0;
  }
}

export class WeaponManager implements Subsystem, IWeaponSystem {
  readonly root = new THREE.Group();
  readonly bulletSystem = new BulletSystem();
  readonly hitDetection = new HitDetection();
  readonly controller: WeaponController;

  private readonly registry = new Map<string, WeaponDefinition>();
  private readonly slots: Array<Weapon | null> = [null, null, null, null];
  private readonly backHolsterModels: Weapon[] = [];
  private holsteredSpecs: readonly InventoryWeaponSlotSpec[] = [];
  private lastBackHolsterModelsKey = '';
  private equippedWeaponSkins: Record<string, string> = {};
  private readonly pickups: WeaponPickup[] = [];
  private readonly targetDummies: CombatTargetDummy[] = [];
  private targetProfile: 'arena' | 'training-ground' = 'arena';

  private activeSlotIndex = 0;
  private weaponSwitchTimer = 0;
  private boundPlayer: Player | null = null;
  private ammoSupplyProvider: AmmoSupplyProvider | null = null;
  private unlimitedAmmo = false;
  private lobbyModeActive = false;
  private lobbyWeaponId: string | null = null;
  private lobbyDisplayWeapon: Weapon | null = null;
  private lastHit: BulletHitNotification | null = null;
  private hitmarkerTimer = 0;
  private hitmarkerHeadshot = false;
  private fireFlashTimer = 0;
  private lastSpreadDeg = 1.5;
  private lastPromptWeaponId: string | null = null;
  private lastPromptLocale = '';
  private lastPromptText: string | null = null;
  private readonly hudSlotsScratch: Array<{ slot: number; name: string; active: boolean }> = [
    { slot: 1, name: 'EMPTY', active: true },
    { slot: 2, name: 'EMPTY', active: false },
    { slot: 3, name: 'EMPTY', active: false },
    { slot: 4, name: 'EMPTY', active: false },
  ];
  private readonly hudSnapshotScratch: WeaponHudSnapshot = {
    activeSlotIndex: 0,
    weaponId: null,
    weaponName: 'UNARMED',
    weaponType: 'NONE',
    ammoInMagazine: 0,
    magazineSize: 0,
    reserveAmmo: 0,
    isReloading: false,
    reloadProgress: 0,
    isBoltCycling: false,
    boltCycleProgress: 1,
    spreadDeg: 1.5,
    slots: this.hudSlotsScratch,
    nearbyPickupPrompt: null,
    lastHit: null,
    hitmarkerActive: false,
    hitmarkerHeadshot: false,
    punchCooldownRatio: 0,
    isFiring: false,
    unlimitedAmmo: false,
  };

  private currentModifiers: Readonly<Partial<AbilityModifiers>> = {};
  private currentAimOrigin = new THREE.Vector3();
  private currentAimDir = new THREE.Vector3(0, 0, -1);
  private currentIsAiming = false;
  private currentIsFirstPersonScoped = false;
  private currentTriggerHeld = false;
  private currentTriggerJustPressed = false;
  private onRecoilKickCb?: (yawRad: number, pitchRad: number) => void;
  private onLocalHitConfirmedCb?: (notif: BulletHitNotification) => void;
  private onDummyEliminatedCb?: (
    dummyName: string,
    weaponName: string,
    isHeadshot: boolean,
    x: number,
    y: number,
    z: number,
  ) => void;
  private lastDummyHitWeaponName = 'FISTS';
  private readonly groundSamplerBound: (gx: number, gz: number) => number;

  constructor(
    private readonly collisionWorld: PlayerCollisionWorld,
    private readonly audioManager: AudioManager,
  ) {
    this.groundSamplerBound = (gx: number, gz: number) =>
      this.collisionWorld.getGroundHeightAt(gx, gz);
    this.controller = new WeaponController(
      this.bulletSystem,
      this.hitDetection,
      this.audioManager,
    );

    for (const def of WEAPON_LIST) {
      this.registry.set(def.id, def);
    }

    this.root.add(this.bulletSystem.root);
    this.hitDetection.setEnvironmentMeshes(this.collisionWorld.getCameraCollisionMeshes());
    if (this.collisionWorld.hasSolidLineOfSight) {
      this.hitDetection.setFastLosChecker((ax, ay, az, bx, by, bz) =>
        this.collisionWorld.hasSolidLineOfSight!(ax, ay, az, bx, by, bz),
      );
    }
    if (this.collisionWorld.raycastEnvironment) {
      this.hitDetection.setFastEnvironmentRaycaster((orig, dir, near, far, outPt, outNrm) =>
        this.collisionWorld.raycastEnvironment!(orig, dir, near, far, outPt, outNrm),
      );
    }

    this.bulletSystem.setOnHitCallback((notif) => {
      if (notif.targetId?.startsWith('gloo:')) {
        return;
      }
      this.lastHit = notif;
      this.lastDummyHitWeaponName = notif.weaponName;
      this.hitmarkerTimer = 0.18;
      this.hitmarkerHeadshot = notif.damageResult.isHeadshot;
      this.audioManager.playHitmarker(notif.damageResult.isHeadshot);
      this.onLocalHitConfirmedCb?.(notif);
    });
  }

  setOnLocalHitConfirmedCallback(cb?: (notif: BulletHitNotification) => void): void {
    this.onLocalHitConfirmedCb = cb;
  }

  setOnDummyEliminatedCallback(
    cb?: (
      dummyName: string,
      weaponName: string,
      isHeadshot: boolean,
      x: number,
      y: number,
      z: number,
    ) => void,
  ): void {
    this.onDummyEliminatedCb = cb;
  }

  setOnMeleeTargetHitCallback(cb?: (targetId: string, dirX: number, dirZ: number) => void): void {
    this.controller.meleeSystem.setOnMeleeTargetHitCallback(cb);
  }

  setQualityPreset(quality: QualityPreset): void {
    this.bulletSystem.setQualityPreset(quality);
  }

  syncEnvironmentMeshes(): void {
    this.hitDetection.setEnvironmentMeshes(this.collisionWorld.getCameraCollisionMeshes());
    for (const d of this.targetDummies) {
      d.setGroundY(this.collisionWorld.getGroundHeightAt(d.root.position.x, d.root.position.z));
    }
  }

  setPracticeTargetsVisible(
    visible: boolean,
    profile: 'arena' | 'training-ground' = 'arena',
  ): void {
    if (visible && (this.targetDummies.length === 0 || this.targetProfile !== profile)) {
      for (const old of this.targetDummies) {
        this.hitDetection.unregisterTarget(old);
        old.root.removeFromParent();
        old.dispose();
      }
      this.targetDummies.length = 0;
      this.targetProfile = profile;
      if (profile === 'training-ground') {
        this.spawnTrainingGroundTargets();
      } else {
        this.spawnArenaTargets();
      }
      this.syncEnvironmentMeshes();
    }
    for (const d of this.targetDummies) {
      d.root.visible = visible;
      if (visible) {
        this.hitDetection.registerTarget(d);
      } else {
        this.hitDetection.unregisterTarget(d);
      }
    }
  }

  recordAuthoritativeHit(params: {
    targetName: string;
    weaponName: string;
    totalDamage: number;
    shieldDamage: number;
    healthDamage: number;
    isHeadshot: boolean;
    distance: number;
  }): void {
    this.lastHit = {
      targetName: params.targetName,
      weaponName: params.weaponName,
      distance: params.distance,
      damageResult: {
        totalDamage: params.totalDamage,
        shieldDamage: params.shieldDamage,
        healthDamage: params.healthDamage,
        falloffMultiplier: 1,
        rangeBand: params.distance <= 20 ? 'CLOSE' : params.distance <= 55 ? 'MEDIUM' : 'LONG',
        isHeadshot: params.isHeadshot,
      },
    };
    this.hitmarkerTimer = 0.22;
    this.hitmarkerHeadshot = params.isHeadshot;
    this.audioManager.playHitmarker(params.isHeadshot);
  }

  /**
   * Allows registering additional weapons dynamically without modifying WeaponController.
   */
  registerWeapon(def: WeaponDefinition): void {
    this.registry.set(def.id, def);
  }

  getRegisteredWeapons(): WeaponDefinition[] {
    return Array.from(this.registry.values());
  }

  getWeaponDefinition(id: string): WeaponDefinition | undefined {
    return this.registry.get(id);
  }

  setUnlimitedAmmo(enabled: boolean): void {
    this.unlimitedAmmo = enabled;
    this.controller.setUnlimitedAmmo(enabled);
    if (enabled) {
      this.cancelActiveReload();
      this.topUpSlotMagazines();
    }
  }

  isUnlimitedAmmo(): boolean {
    return this.unlimitedAmmo;
  }

  private topUpSlotMagazines(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const w = this.slots[i];
      if (w && w.definition.type !== 'MELEE' && w.definition.magazineSize > 0) {
        w.ammoInMagazine = w.definition.magazineSize;
      }
    }
  }

  setAmmoSupplyProvider(provider: AmmoSupplyProvider): void {
    this.ammoSupplyProvider = provider;
    const active = this.getActiveWeapon();
    if (active) {
      active.reserveAmmo = provider.getAmmo(active.definition.type);
    }
  }

  getSlotWeapon(slotIndex: number): Weapon | null {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return null;
    return this.slots[slotIndex];
  }

  setEquippedWeaponSkins(skins: Record<string, string>): void {
    this.equippedWeaponSkins = { ...skins };
    for (let i = 0; i < this.slots.length; i++) {
      const w = this.slots[i];
      if (w) {
        w.applySkin(this.equippedWeaponSkins[w.definition.id] ?? null);
      }
    }
    for (let i = 0; i < this.backHolsterModels.length; i++) {
      const hw = this.backHolsterModels[i];
      hw.applySkin(this.equippedWeaponSkins[hw.definition.id] ?? null);
    }
    if (this.lobbyDisplayWeapon) {
      this.lobbyDisplayWeapon.applySkin(
        this.equippedWeaponSkins[this.lobbyDisplayWeapon.definition.id] ?? null,
      );
    }
  }

  cancelActiveReload(): void {
    this.controller.cancelReload(this.getActiveWeapon());
    this.controller.cancelPendingBoltAction();
    if (this.boundPlayer) {
      this.boundPlayer.animationController.clearReloadAction();
      this.boundPlayer.setReloadVisualState(0);
    }
  }

  syncInventoryWeaponSlots(
    slotSpecs: readonly (InventoryWeaponSlotSpec | null)[],
    activeSlotIndex: number,
    holsteredSpecs: readonly InventoryWeaponSlotSpec[] = [],
  ): void {
    if (this.lobbyModeActive) {
      return;
    }
    const prevActive = this.getActiveWeapon();
    const prevSlotWeapons: Array<Weapon | null> = this.slots.slice();
    this.cancelActiveReload();

    // Pool all live Weapon objects (active slots + back holster) so weapons moving between
    // hands and back keep the exact same THREE.Object3D identity through the switch animation.
    const availablePool: Weapon[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const w = this.slots[i];
      if (w) availablePool.push(w);
      this.slots[i] = null;
    }
    for (let i = 0; i < this.backHolsterModels.length; i++) {
      availablePool.push(this.backHolsterModels[i]);
    }
    this.backHolsterModels.length = 0;

    const takeWeaponForSpec = (
      spec: InventoryWeaponSlotSpec,
      preferred: Weapon | null,
    ): Weapon | null => {
      if (preferred && preferred.definition.id === spec.weaponId) {
        const pIdx = availablePool.indexOf(preferred);
        if (pIdx !== -1) {
          availablePool.splice(pIdx, 1);
          if (spec.magAmmo !== undefined) {
            preferred.ammoInMagazine = spec.magAmmo;
          }
          if (this.ammoSupplyProvider) {
            preferred.reserveAmmo = this.ammoSupplyProvider.getAmmo(preferred.definition.type);
          }
          return preferred;
        }
      }

      let foundIdx = availablePool.findIndex(
        (w) =>
          w.definition.id === spec.weaponId &&
          (spec.magAmmo === undefined || w.ammoInMagazine === spec.magAmmo),
      );
      if (foundIdx === -1) {
        foundIdx = availablePool.findIndex((w) => w.definition.id === spec.weaponId);
      }
      if (foundIdx !== -1) {
        const [reused] = availablePool.splice(foundIdx, 1);
        if (spec.magAmmo !== undefined) {
          reused.ammoInMagazine = spec.magAmmo;
        }
        if (this.ammoSupplyProvider) {
          reused.reserveAmmo = this.ammoSupplyProvider.getAmmo(reused.definition.type);
        }
        return reused;
      }

      const def = this.registry.get(spec.weaponId);
      if (!def) return null;
      const reserve = this.ammoSupplyProvider
        ? this.ammoSupplyProvider.getAmmo(def.type)
        : def.startingReserveAmmo;
      const w = new Weapon(def, spec.magAmmo, reserve);
      w.applySkin(this.equippedWeaponSkins[def.id] ?? null);
      return w;
    };

    for (let i = 0; i < this.slots.length; i++) {
      const spec = slotSpecs[i] ?? null;
      const w = spec ? takeWeaponForSpec(spec, prevSlotWeapons[i] ?? null) : null;
      if (w && this.unlimitedAmmo && w.definition.type !== 'MELEE' && w.definition.magazineSize > 0) {
        w.ammoInMagazine = w.definition.magazineSize;
      }
      this.slots[i] = w;
    }

    this.holsteredSpecs = holsteredSpecs;
    for (let i = 0; i < holsteredSpecs.length; i++) {
      const hw = takeWeaponForSpec(holsteredSpecs[i], null);
      if (hw) this.backHolsterModels.push(hw);
    }
    this.lastBackHolsterModelsKey = holsteredSpecs.map((s) => s.weaponId).join('|');

    this.activeSlotIndex =
      activeSlotIndex >= 0 && activeSlotIndex < this.slots.length ? activeSlotIndex : -1;
    const nextActive = this.getActiveWeapon();
    if (prevActive !== nextActive) {
      if (nextActive) {
        this.boundPlayer?.animationController.clearPunchAction();
      }
      this.weaponSwitchTimer = prevActive && nextActive ? 0.26 : 0.2;
    }
    this.syncPlayerWeaponAttachment(true);

    // Dispose only weapons that were actually removed from the player's loadout
    for (let i = 0; i < availablePool.length; i++) {
      availablePool[i].mesh.removeFromParent();
      availablePool[i].dispose();
    }
  }

  bindPlayer(player: Player): void {
    this.boundPlayer = player;
    this.resetArenaLoadout();
  }

  isLobbyModeActive(): boolean {
    return this.lobbyModeActive;
  }

  getLobbyWeaponId(): string | null {
    return this.lobbyWeaponId;
  }

  enterLobbyMode(lobbyWeaponId: string | null): void {
    this.lobbyModeActive = true;
    this.clearMatchLoadoutState();
    this.applyLobbyWeaponVisual(lobbyWeaponId, false);
  }

  syncLobbyWeapon(lobbyWeaponId: string | null, animate = true): void {
    const normalizedId = lobbyWeaponId && this.registry.has(lobbyWeaponId) ? lobbyWeaponId : null;
    this.lobbyWeaponId = normalizedId;
    if (this.lobbyModeActive) {
      this.applyLobbyWeaponVisual(normalizedId, animate);
    }
  }

  exitLobbyMode(): void {
    if (!this.lobbyModeActive && !this.lobbyDisplayWeapon) return;
    this.lobbyModeActive = false;
    this.lobbyWeaponId = null;
    if (this.lobbyDisplayWeapon) {
      if (this.boundPlayer) {
        this.boundPlayer.getSnapshot().weaponId = null;
        this.boundPlayer.visuals.transitionLoadout(null, [], false, null);
      }
      this.lobbyDisplayWeapon.mesh.removeFromParent();
      this.lobbyDisplayWeapon.dispose();
      this.lobbyDisplayWeapon = null;
    }
  }

  private clearMatchLoadoutState(): void {
    this.bulletSystem.clearAll();
    this.cancelActiveReload();
    this.controller.recoilSystem.reset();
    this.controller.meleeSystem.reset();
    this.weaponSwitchTimer = 0;
    this.lastHit = null;
    this.hitmarkerTimer = 0;
    this.fireFlashTimer = 0;

    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]) {
        this.slots[i]!.mesh.removeFromParent();
        this.slots[i]!.dispose();
        this.slots[i] = null;
      }
    }
    this.disposeBackHolsterModels();
    this.holsteredSpecs = [];
    this.activeSlotIndex = -1;
    this.clearPickups();
  }

  private applyLobbyWeaponVisual(weaponId: string | null, animate: boolean): void {
    const normalizedId = weaponId && this.registry.has(weaponId) ? weaponId : null;
    this.lobbyWeaponId = normalizedId;
    if (!this.lobbyDisplayWeapon || this.lobbyDisplayWeapon.definition.id !== normalizedId) {
      if (this.lobbyDisplayWeapon) {
        this.lobbyDisplayWeapon.mesh.removeFromParent();
        this.lobbyDisplayWeapon.dispose();
        this.lobbyDisplayWeapon = null;
      }
      if (normalizedId) {
        this.lobbyDisplayWeapon = this.createWeaponInstance(normalizedId);
      }
    } else if (normalizedId && this.lobbyDisplayWeapon) {
      this.lobbyDisplayWeapon.applySkin(this.equippedWeaponSkins[normalizedId] ?? null);
    }

    if (!this.boundPlayer) return;
    const displayMesh = this.lobbyDisplayWeapon ? this.lobbyDisplayWeapon.mesh : null;
    const displayId = this.lobbyDisplayWeapon ? this.lobbyDisplayWeapon.definition.id : null;
    this.boundPlayer.getSnapshot().weaponId = displayId;
    this.boundPlayer.visuals.transitionLoadout(displayMesh, [], animate, displayId);
  }

  resetArenaLoadout(_lootPoints?: readonly LootPoint[]): void {
    this.exitLobbyMode();
    this.clearMatchLoadoutState();

    // Equip default Weapon Slot 1 until InventoryManager syncs full loadout
    this.slots[0] = this.createWeaponInstance('scar');
    this.slots[1] = null;
    this.slots[2] = null;
    this.slots[3] = null;
    if (this.unlimitedAmmo) {
      this.topUpSlotMagazines();
    }

    this.activeSlotIndex = 0;
    this.syncPlayerWeaponAttachment(false);
  }

  private createWeaponInstance(weaponId: string): Weapon | null {
    const def = this.registry.get(weaponId);
    if (!def) return null;
    const w = new Weapon(def);
    w.applySkin(this.equippedWeaponSkins[def.id] ?? null);
    return w;
  }

  private spawnArenaTargets(): void {
    const specs = [
      { id: 'target-close', name: 'DRONE-CLOSE (9M)', x: 0, z: -9.5, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
      { id: 'target-mid-l', name: 'DRONE-MID (18M)', x: -8.5, z: -16.5, patrolAmp: 2.2, patrolSpeed: 1.35, patrolPhase: 0.4 },
      { id: 'target-mid-r', name: 'DRONE-MID (21M)', x: 9.5, z: -18.5, patrolAmp: 2.4, patrolSpeed: 1.25, patrolPhase: 2.1 },
      { id: 'target-long', name: 'DRONE-LONG (34M)', x: 0.5, z: -32.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
      { id: 'target-east-road', name: 'DRONE-EAST (55M)', x: 55.0, z: -2.2, patrolAmp: 2.6, patrolSpeed: 1.15, patrolPhase: 1.0 },
      { id: 'target-west-road', name: 'DRONE-WEST (55M)', x: -55.0, z: 2.2, patrolAmp: 2.6, patrolSpeed: 1.15, patrolPhase: 3.1 },
      { id: 'target-sniper-85', name: 'DRONE-SNIPER (85M)', x: 18.0, z: -83.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
      { id: 'target-sniper-130', name: 'DRONE-SNIPER (130M)', x: -24.0, z: -128.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
      { id: 'target-sector-ne', name: 'DRONE-NE (318M)', x: 225.0, z: -225.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
      { id: 'target-sector-nw', name: 'DRONE-NW (318M)', x: -225.0, z: -225.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
      { id: 'target-sector-se', name: 'DRONE-SE (318M)', x: 225.0, z: 225.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
      { id: 'target-sector-sw', name: 'DRONE-SW (318M)', x: -225.0, z: 225.0, patrolAmp: 0, patrolSpeed: 0, patrolPhase: 0 },
    ];
    for (const s of specs) {
      const y = this.collisionWorld.getGroundHeightAt(s.x, s.z);
      const dummy = new CombatTargetDummy(
        s.id,
        s.name,
        s.x,
        y,
        s.z,
        s.patrolAmp,
        s.patrolSpeed,
        s.patrolPhase,
        (d, isHeadshot) => {
          this.onDummyEliminatedCb?.(
            d.name,
            this.lastDummyHitWeaponName,
            isHeadshot,
            d.root.position.x,
            d.root.position.y,
            d.root.position.z,
          );
        },
      );
      this.targetDummies.push(dummy);
      this.root.add(dummy.root);
      this.hitDetection.registerTarget(dummy);
    }
  }

  private spawnTrainingGroundTargets(): void {
    for (const s of TRAINING_GROUND_TARGETS) {
      const y = this.collisionWorld.getGroundHeightAt(s.x, s.z);
      const dummy = new CombatTargetDummy(
        s.id,
        s.name,
        s.x,
        y,
        s.z,
        s.patrolAmp,
        s.patrolSpeed,
        s.patrolPhase,
        (d, isHeadshot) => {
          this.onDummyEliminatedCb?.(
            d.name,
            this.lastDummyHitWeaponName,
            isHeadshot,
            d.root.position.x,
            d.root.position.y,
            d.root.position.z,
          );
        },
        {
          maxHealth: s.maxHealth,
          maxShield: s.maxShield,
          damageReductionPct: s.damageReductionPct,
          armorTier: s.armorTier,
        },
      );
      this.targetDummies.push(dummy);
      this.root.add(dummy.root);
      this.hitDetection.registerTarget(dummy);
    }
  }

  private readonly radarMarkerPool: MinimapMarker[] = [];
  private readonly radarMarkersScratch: MinimapMarker[] = [];
  private readonly onRecoilKickDispatch = (yaw: number, pitch: number): void => {
    this.onRecoilKickCb?.(yaw, pitch);
  };

  getEnemyRadarMarkers(playerPos: THREE.Vector3, detectionRadius: number): MinimapMarker[] {
    const markers = this.radarMarkersScratch;
    markers.length = 0;
    if (detectionRadius <= 0) return markers;
    const rSq = detectionRadius * detectionRadius;
    let writeIdx = 0;
    for (let i = 0; i < this.targetDummies.length; i++) {
      const d = this.targetDummies[i];
      if (!d.isAlive) continue;
      const dx = d.root.position.x - playerPos.x;
      const dz = d.root.position.z - playerPos.z;
      if (dx * dx + dz * dz <= rSq) {
        let m = this.radarMarkerPool[writeIdx];
        if (!m) {
          m = { id: d.id, x: d.root.position.x, z: d.root.position.z, label: d.name, kind: 'enemy' };
          this.radarMarkerPool.push(m);
        } else {
          m.id = d.id;
          m.x = d.root.position.x;
          m.z = d.root.position.z;
          m.label = d.name;
          m.kind = 'enemy';
        }
        markers.push(m);
        writeIdx++;
      }
    }
    return markers;
  }

  private spawnPickup(
    weaponId: string,
    x: number,
    z: number,
    magAmmo?: number,
    reserveAmmo?: number,
  ): void {
    const def = this.registry.get(weaponId);
    if (!def) return;
    const y = this.collisionWorld.getGroundHeightAt(x, z);
    const pickup = new WeaponPickup(def, x, y, z, magAmmo, reserveAmmo);
    this.pickups.push(pickup);
    this.root.add(pickup.root);
  }

  private clearPickups(): void {
    for (const p of this.pickups) {
      this.root.remove(p.root);
      p.dispose();
    }
    this.pickups.length = 0;
  }

  getActiveWeapon(): Weapon | null {
    if (this.activeSlotIndex < 0 || this.activeSlotIndex >= this.slots.length) return null;
    return this.slots[this.activeSlotIndex];
  }

  equipSlot(slotIndex: number): boolean {
    if (this.lobbyModeActive) return false;
    const prevActive = this.getActiveWeapon();
    if (slotIndex === -1) {
      if (this.activeSlotIndex === -1) return true;
      this.cancelActiveReload();
      this.activeSlotIndex = -1;
      if (prevActive) {
        this.weaponSwitchTimer = 0.2;
      }
      this.syncPlayerWeaponAttachment(true);
      return true;
    }
    if (slotIndex < 0 || slotIndex >= this.slots.length) return false;
    if (slotIndex === this.activeSlotIndex) return true;
    this.cancelActiveReload();
    this.activeSlotIndex = slotIndex;
    const nextActive = this.getActiveWeapon();
    if (nextActive) {
      this.boundPlayer?.animationController.clearPunchAction();
    }
    if (prevActive !== nextActive) {
      this.weaponSwitchTimer = prevActive && nextActive ? 0.26 : 0.2;
    }
    this.syncPlayerWeaponAttachment(true);
    this.audioManager.playClick();
    return true;
  }

  cycleNextSlot(): void {
    if (this.lobbyModeActive) return;
    for (let offset = 1; offset <= this.slots.length; offset++) {
      const idx = (this.activeSlotIndex + offset) % this.slots.length;
      if (this.slots[idx] !== null) {
        this.equipSlot(idx);
        return;
      }
    }
  }

  tryPickupNearby(): string | null {
    if (this.lobbyModeActive || !this.boundPlayer) return null;
    const nearest = this.findNearestPickup(this.boundPlayer.position);
    if (!nearest) return null;

    // Prefer empty slot first; if full, swap active slot (or slot 0 if unarmed)
    let targetSlot = this.slots.findIndex((s) => s === null);
    if (targetSlot === -1) {
      targetSlot = this.activeSlotIndex === 1 ? 1 : 0;
    }

    const replaced = this.slots[targetSlot];
    if (replaced) {
      this.spawnPickup(
        replaced.definition.id,
        this.boundPlayer.position.x + 0.6,
        this.boundPlayer.position.z + 0.6,
        replaced.ammoInMagazine,
        replaced.reserveAmmo,
      );
      replaced.dispose();
    }

    const picked = new Weapon(
      nearest.weaponDef,
      nearest.ammoInMagazine,
      nearest.reserveAmmo,
    );
    picked.applySkin(this.equippedWeaponSkins[nearest.weaponDef.id] ?? null);
    if (this.unlimitedAmmo && picked.definition.type !== 'MELEE' && picked.definition.magazineSize > 0) {
      picked.ammoInMagazine = picked.definition.magazineSize;
    }
    this.cancelActiveReload();
    this.slots[targetSlot] = picked;
    this.activeSlotIndex = targetSlot;

    nearest.collected = true;
    this.root.remove(nearest.root);
    nearest.dispose();
    const idx = this.pickups.indexOf(nearest);
    if (idx !== -1) this.pickups.splice(idx, 1);

    this.syncPlayerWeaponAttachment();
    this.audioManager.playPickup();
    return picked.definition.name;
  }

  tryDropActive(): string | null {
    if (this.lobbyModeActive || !this.boundPlayer) return null;
    const current = this.slots[this.activeSlotIndex];
    if (!current) return null;

    const droppedName = current.definition.name;
    this.cancelActiveReload();
    this.spawnPickup(
      current.definition.id,
      this.boundPlayer.position.x,
      this.boundPlayer.position.z + 0.75,
      current.ammoInMagazine,
      current.reserveAmmo,
    );
    this.slots[this.activeSlotIndex] = null;
    current.dispose();

    this.syncPlayerWeaponAttachment();
    this.audioManager.playBack();
    return droppedName;
  }

  private findNearestPickup(playerPos: THREE.Vector3): WeaponPickup | null {
    let best: WeaponPickup | null = null;
    let bestDistSq = 2.6 * 2.6;
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      if (p.collected) continue;
      const dSq = p.distanceToSq(playerPos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = p;
      }
    }
    return best;
  }

  private disposeBackHolsterModels(): void {
    for (let i = 0; i < this.backHolsterModels.length; i++) {
      this.backHolsterModels[i].dispose();
    }
    this.backHolsterModels.length = 0;
    this.lastBackHolsterModelsKey = '';
  }

  private syncPlayerWeaponAttachment(animate = true): void {
    if (!this.boundPlayer) return;
    if (this.lobbyModeActive) {
      this.applyLobbyWeaponVisual(this.lobbyWeaponId, animate);
      return;
    }
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i]?.resetReloadVisuals();
    }
    const weapon = this.getActiveWeapon();

    // Rebuild cached visual models for bag-holstered extra weapons when changed
    const holsteredKey = this.holsteredSpecs.map((s) => s.weaponId).join('|');
    if (holsteredKey !== this.lastBackHolsterModelsKey) {
      this.disposeBackHolsterModels();
      this.lastBackHolsterModelsKey = holsteredKey;
      for (let i = 0; i < this.holsteredSpecs.length; i++) {
        const w = this.createWeaponInstance(this.holsteredSpecs[i].weaponId);
        if (w) this.backHolsterModels.push(w);
      }
    }

    const backMeshes: THREE.Object3D[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const slotWeapon = this.slots[i];
      if (slotWeapon && i !== this.activeSlotIndex && backMeshes.length < 3) {
        backMeshes.push(slotWeapon.mesh);
      }
    }
    for (let i = 0; i < this.backHolsterModels.length && backMeshes.length < 3; i++) {
      backMeshes.push(this.backHolsterModels[i].mesh);
    }

    const activeWeaponId = weapon ? weapon.definition.id : null;
    this.boundPlayer.getSnapshot().weaponId = activeWeaponId;
    this.boundPlayer.visuals.transitionLoadout(weapon ? weapon.mesh : null, backMeshes, animate, activeWeaponId);
  }

  isSwitchingWeapon(): boolean {
    return this.weaponSwitchTimer > 0.04;
  }

  isReloading(): boolean {
    return this.controller.reloadSystem.isReloading();
  }

  measureRangefinderDistance(maxRange = 260): number | null {
    return this.hitDetection.measureAimDistance(this.currentAimOrigin, this.currentAimDir, maxRange);
  }

  isEnemyInCrosshair(
    aimOrigin: THREE.Vector3,
    aimDir: THREE.Vector3,
    playerPos: THREE.Vector3,
    eyeHeight: number,
    isFirstPersonScoped: boolean,
  ): boolean {
    const dx = playerPos.x - aimOrigin.x;
    const dy = playerPos.y + eyeHeight - aimOrigin.y;
    const dz = playerPos.z - aimOrigin.z;
    const playerPlaneDist = Math.max(0, dx * aimDir.x + dy * aimDir.y + dz * aimDir.z);
    const nearDist = isFirstPersonScoped ? 0.15 : Math.max(0.25, playerPlaneDist + 0.08);

    const active = this.getActiveWeapon();
    const reachDist =
      active && active.definition.type !== 'MELEE'
        ? active.definition.range * 1.12
        : active
          ? Math.max(3.6, active.definition.range + 0.5)
          : 3.4;

    return this.hitDetection.hasEnemyInCrosshair(
      aimOrigin,
      aimDir,
      nearDist + reachDist,
      nearDist,
    );
  }

  setFrameCombatInput(params: {
    aimOrigin: THREE.Vector3;
    aimDir: THREE.Vector3;
    isAiming: boolean;
    isFirstPersonScoped?: boolean;
    triggerHeld: boolean;
    triggerJustPressed: boolean;
    modifiers: Readonly<Partial<AbilityModifiers>>;
    onRecoilKick: (yawRad: number, pitchRad: number) => void;
  }): void {
    this.currentAimOrigin.copy(params.aimOrigin);
    this.currentAimDir.copy(params.aimDir);
    this.currentIsAiming = params.isAiming;
    this.currentIsFirstPersonScoped = params.isFirstPersonScoped ?? false;
    this.currentTriggerHeld = params.triggerHeld;
    this.currentTriggerJustPressed = params.triggerJustPressed;
    this.currentModifiers = params.modifiers;
    this.onRecoilKickCb = params.onRecoilKick;
  }

  triggerFire(): boolean {
    if (!this.boundPlayer || this.isSwitchingWeapon()) return false;
    const fired = this.controller.tryFire({
      weapon: this.getActiveWeapon(),
      player: this.boundPlayer,
      aimRayOrigin: this.currentAimOrigin,
      aimRayDir: this.currentAimDir,
      isAiming: this.currentIsAiming,
      isFirstPersonScoped: this.currentIsFirstPersonScoped,
      triggerHeld: this.currentTriggerHeld,
      triggerJustPressed: this.currentTriggerJustPressed,
      modifiers: this.currentModifiers,
      onRecoilKick: this.onRecoilKickDispatch,
    });
    if (fired) {
      this.fireFlashTimer = 0.095;
    }
    return fired;
  }

  triggerReload(): boolean {
    if (!this.boundPlayer || this.isSwitchingWeapon()) return false;
    return this.controller.tryReload(
      this.getActiveWeapon(),
      this.boundPlayer,
      this.currentModifiers,
    );
  }

  update(deltaSeconds: number, elapsedSeconds = 0): void {
    if (this.weaponSwitchTimer > 0) {
      this.weaponSwitchTimer = Math.max(0, this.weaponSwitchTimer - deltaSeconds);
    }
    const active = this.getActiveWeapon();
    if (active) {
      if (this.unlimitedAmmo && active.definition.type !== 'MELEE' && active.definition.magazineSize > 0) {
        active.ammoInMagazine = active.definition.magazineSize;
      }
      if (this.ammoSupplyProvider) {
        active.reserveAmmo = this.ammoSupplyProvider.getAmmo(active.definition.type);
      }
    }

    const prevMag = active ? active.ammoInMagazine : 0;
    this.controller.update(deltaSeconds, active);

    if (this.boundPlayer) {
      if (this.controller.reloadSystem.isReloading() && active) {
        const wType = active.definition.type;
        const reloadStyle =
          wType === 'SHOTGUN'
            ? 'shotgun'
            : wType === 'SNIPER'
              ? 'sniper'
              : wType === 'SMG' || wType === 'PISTOL'
                ? 'smg'
                : 'ar';
        this.boundPlayer.setReloadVisualState(
          this.controller.reloadSystem.getProgress(),
          reloadStyle,
        );
      } else {
        this.boundPlayer.setReloadVisualState(0);
      }
    }

    if (!this.unlimitedAmmo && active && this.ammoSupplyProvider && active.ammoInMagazine > prevMag) {
      this.ammoSupplyProvider.consumeAmmo(
        active.definition.type,
        active.ammoInMagazine - prevMag,
      );
      active.reserveAmmo = this.ammoSupplyProvider.getAmmo(active.definition.type);
    }

    if (this.boundPlayer && (this.currentTriggerHeld || this.currentTriggerJustPressed)) {
      this.triggerFire();
    }

    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - deltaSeconds);
    }
    if (this.fireFlashTimer > 0) {
      this.fireFlashTimer = Math.max(0, this.fireFlashTimer - deltaSeconds);
    }

    if (this.boundPlayer) {
      const speedSq =
        this.boundPlayer.velocity.x * this.boundPlayer.velocity.x +
        this.boundPlayer.velocity.z * this.boundPlayer.velocity.z;
      this.lastSpreadDeg = this.controller.getSpreadPreviewDeg(
        active,
        this.currentIsAiming,
        speedSq > 0.25,
        this.currentModifiers,
      );

      for (let i = 0; i < this.targetDummies.length; i++) {
        const d = this.targetDummies[i];
        if (!d.root.visible) continue;
        d.update(
          deltaSeconds,
          this.boundPlayer.position,
          this.groundSamplerBound,
        );
      }
    }

    for (let i = 0; i < this.pickups.length; i++) {
      this.pickups[i].update(elapsedSeconds);
    }

    this.bulletSystem.update(deltaSeconds, this.hitDetection);
  }

  getHudSnapshot(): WeaponHudSnapshot {
    const active = this.getActiveWeapon();
    const nearest = this.boundPlayer ? this.findNearestPickup(this.boundPlayer.position) : null;

    while (this.hudSlotsScratch.length < this.slots.length) {
      this.hudSlotsScratch.push({
        slot: this.hudSlotsScratch.length + 1,
        name: 'EMPTY',
        active: false,
      });
    }
    this.hudSlotsScratch.length = this.slots.length;
    for (let i = 0; i < this.slots.length; i++) {
      const w = this.slots[i];
      const entry = this.hudSlotsScratch[i];
      entry.slot = i + 1;
      entry.name = w ? w.definition.name : 'EMPTY';
      entry.active = i === this.activeSlotIndex;
    }

    let prompt: string | null = null;
    if (nearest) {
      const loc = i18n.getLanguage();
      if (nearest.weaponDef.id !== this.lastPromptWeaponId || loc !== this.lastPromptLocale) {
        this.lastPromptWeaponId = nearest.weaponDef.id;
        this.lastPromptLocale = loc;
        this.lastPromptText = i18n.t('interact.pickup.weaponPrompt', {
          weapon: i18n.translateWeaponName(nearest.weaponDef.id),
          cat: i18n.translateWeaponCategory(nearest.weaponDef.type),
        });
      }
      prompt = this.lastPromptText;
    }

    const snap = this.hudSnapshotScratch;
    snap.activeSlotIndex = this.activeSlotIndex;
    snap.weaponId = active ? active.definition.id : null;
    snap.weaponName = active ? active.definition.name : 'UNARMED';
    snap.weaponType = active ? active.definition.type : 'NONE';
    snap.ammoInMagazine = active ? active.ammoInMagazine : 0;
    snap.magazineSize = active ? active.definition.magazineSize : 0;
    snap.reserveAmmo = active ? active.reserveAmmo : 0;
    snap.isReloading = this.controller.reloadSystem.isReloading();
    snap.reloadProgress = this.controller.reloadSystem.getProgress();
    snap.isBoltCycling = active ? active.isBoltCycling() : false;
    snap.boltCycleProgress = active ? active.getBoltCycleProgress() : 1;
    snap.spreadDeg = this.lastSpreadDeg;
    snap.nearbyPickupPrompt = prompt;
    snap.lastHit = this.lastHit;
    snap.hitmarkerActive = this.hitmarkerTimer > 0;
    snap.hitmarkerHeadshot = this.hitmarkerHeadshot;
    snap.punchCooldownRatio = this.controller.meleeSystem.getCooldownRatio();
    snap.isFiring = this.fireFlashTimer > 0;
    snap.unlimitedAmmo = this.unlimitedAmmo;
    return snap;
  }

  dispose(): void {
    if (this.lobbyDisplayWeapon) {
      this.lobbyDisplayWeapon.mesh.removeFromParent();
      this.lobbyDisplayWeapon.dispose();
      this.lobbyDisplayWeapon = null;
    }
    this.lobbyWeaponId = null;
    this.lobbyModeActive = false;
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i]?.dispose();
      this.slots[i] = null;
    }
    this.disposeBackHolsterModels();
    this.clearPickups();
    for (const d of this.targetDummies) {
      d.dispose();
    }
    this.targetDummies.length = 0;
    this.hitDetection.clearTargets();
    this.bulletSystem.dispose();
  }
}
