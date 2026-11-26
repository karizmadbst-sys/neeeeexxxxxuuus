import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import { CHARACTER_ROSTER } from '../characters/CharacterData';
import type { AssetManager } from '../core/AssetManager';
import type { QualityPreset } from '../core/Types';
import type { LootItem } from '../loot/LootItem';
import type { LootManager } from '../loot/LootManager';
import type { MapManager } from '../maps/MapManager';
import type { PlayerStateSnapshot } from '../player/IPlayerController';
import {
  normalizeR6Customization,
  R6_ACCESSORIES,
  R6_EYE_STYLES,
  R6_FACE_MARKS,
  R6_GLASSES,
  R6_HAIR_COLORS,
  R6_HAIR_STYLES,
  R6_HATS,
  R6_MASKS,
  R6_MOUTH_STYLES,
  R6_PANTS,
  R6_SHOES,
  R6_SKINS,
  R6_TOPS,
  type R6Customization,
} from '../player/R6CustomizationData';
import type { RankedCustomizationPayload } from '../ranked/RankedTypes';
import { PlayerAnimationController } from '../player/PlayerAnimationController';
import { PlayerVisuals } from '../player/PlayerVisuals';
import { clamp, damp } from '../utils/MathUtils';
import type { DamageCalculationResult } from '../weapons/DamageSystem';
import type { DamageableTarget } from '../weapons/HitDetection';
import { Weapon } from '../weapons/Weapon';
import { WEAPON_BY_ID, type WeaponCategory, type WeaponDefinition } from '../weapons/WeaponData';
import type {
  BotBehaviorState,
  BotDifficulty,
  BotDifficultyProfile,
  BotPersonality,
} from './BattleRoyaleTypes';
import { BOT_DIFFICULTY_PROFILES } from './BattleRoyaleTypes';

export interface BotWeaponSlot {
  definition: WeaponDefinition;
  ammoInMagazine: number;
  fireCooldown: number;
  boltTimer: number;
}

export interface BotSpawnSpec {
  id: string;
  name: string;
  teamId: string;
  isAlly: boolean;
  difficulty: BotDifficulty;
  personality: BotPersonality;
  seed: number;
  jumpAtProgress: number;
  dropTargetX: number;
  dropTargetZ: number;
  characterId?: string;
  customization?: RankedCustomizationPayload;
}

const GRAVITY = 22.0;
const BOT_RADIUS = 0.44;
const BOT_EYE_HEIGHT = 1.62;
const CHUTE_DESCENT_MPS = 7.4;

const WEAPON_SCORE: Readonly<Record<string, number>> = {
  awm: 94,
  m249: 92,
  parafal: 90,
  groza: 89,
  m24: 89,
  dragunov: 88,
  ak24: 86,
  an94: 86,
  m60: 86,
  aug: 85,
  scar: 84,
  svd: 84,
  m4a1: 83,
  dp28: 82,
  famas: 81,
  vss: 80,
  kar98k: 80,
  m1887: 78,
  double_barrel: 77,
  spas12: 76,
  m1014: 75,
  vector: 75,
  p90: 75,
  mp40: 74,
  thompson: 74,
  mp5: 72,
  ump: 70,
  m1917: 66,
  desert_eagle: 64,
  usp: 58,
  glock: 55,
};

function seededFloat(seed: number, salt: number): number {
  let x = (seed ^ (salt * 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function createSharedCanopyGeo(): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(1.55, 1.85, 0.42, 8, 1, false, 0, Math.PI * 2);
  geo.scale(1.25, 0.65, 0.88);
  return geo;
}

const SHARED_CANOPY_GEO = createSharedCanopyGeo();
const SHARED_CORD_GEO = new THREE.BoxGeometry(0.025, 1.85, 0.025);
const SHARED_CORD_MAT = new THREE.MeshBasicMaterial({ color: '#cbd5e1' });
const SHARED_CANOPY_MATS: Record<string, THREE.MeshStandardMaterial> = {
  ally: new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.62, metalness: 0.1 }),
  pro: new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.62, metalness: 0.1 }),
  veteran: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.62, metalness: 0.1 }),
  default: new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.62, metalness: 0.1 }),
};
const SHARED_HEAD_GEO = new THREE.BoxGeometry(0.56, 0.50, 0.56);
const SHARED_BODY_GEO = new THREE.BoxGeometry(0.76, 1.34, 0.50);
const SHARED_HITBOX_MAT = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
  side: THREE.DoubleSide,
});
const CHUTE_CORD_OFFSETS: readonly (readonly [number, number, number])[] = [
  [-0.85, 2.38, 0.32],
  [0.85, 2.38, 0.32],
  [-0.85, 2.38, -0.32],
  [0.85, 2.38, -0.32],
];

export class BotEntity implements DamageableTarget {
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
  readonly isAlly: boolean;
  readonly difficulty: BotDifficulty;
  readonly profile: BotDifficultyProfile;
  readonly personality: BotPersonality;
  readonly root = new THREE.Group();
  readonly headMesh: THREE.Mesh;
  readonly bodyMesh: THREE.Mesh;
  readonly visuals: PlayerVisuals;
  readonly animController = new PlayerAnimationController();

  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly rotation = new THREE.Euler(0, 0, 0, 'YXZ');

  private readonly chuteGroup = new THREE.Group();

  private nameplateCanvas: HTMLCanvasElement | null = null;
  private nameplateCtx: CanvasRenderingContext2D | null = null;
  private nameplateTexture: THREE.CanvasTexture | null = null;
  private nameplateSprite: THREE.Sprite | null = null;
  private nameplateMat: THREE.SpriteMaterial | null = null;
  private lastPlateHash = -1;
  private lastShadowCast = false;
  private disposed = false;
  private readonly modelScale: number;

  private equippedWeaponModel: Weapon | null = null;
  private equippedWeaponModelId: string | null = null;

  health = 100;
  maxHealth = 100;
  shield = 50;
  maxShield = 100;
  isAlive = true;
  eliminatedPermanently = false;
  deathElapsedSec = 0;
  corpseRemoved = false;

  armorLevel: 0 | 1 | 2 | 3 = 0;
  armorDurability = 0;
  armorMaxDurability = 0;
  armorReductionPct = 0;

  helmetLevel: 0 | 1 | 2 | 3 = 0;
  helmetDurability = 0;
  helmetMaxDurability = 0;
  helmetReductionPct = 0;

  backpackLevel: 0 | 1 | 2 | 3 = 0;

  readonly weapons: [BotWeaponSlot | null, BotWeaponSlot | null] = [null, null];
  activeSlotIndex: 0 | 1 = 0;
  readonly ammoPool: Record<WeaponCategory, number> = {
    AR: 0,
    LMG: 0,
    SMG: 0,
    SHOTGUN: 0,
    SNIPER: 0,
    MELEE: 0,
    PISTOL: 0,
  };

  medkits = 0;
  bandages = 1;
  shieldCells = 1;
  shieldBatteries = 0;

  dropPhase: 'waiting' | 'airplane' | 'freefall' | 'parachute' | 'landed' = 'airplane';
  jumpAtProgress: number;
  dropTargetX: number;
  dropTargetZ: number;
  freefallElapsedSec = 0;
  private prevY = 200;

  private waitTimer = 0;
  private waitDirX = 0;
  private waitDirZ = 0;
  private waitSprint = false;
  private waitCrouch = false;
  private waitJumpCooldown = 1.6;
  private waitPunchCooldown = 2.4;
  private waitLastX = 0;
  private waitLastZ = 0;
  private waitStuckTimer = 0;
  private waitSeedState: number;

  isGrounded = false;
  isCrouching = false;
  isSprinting = false;
  airborneBankRad = 0;

  behaviorState: BotBehaviorState = 'airplane';
  reloadTimer = 0;
  healTimer = 0;
  pendingHealKind: 'medkit' | 'bandage' | 'battery' | 'cell' | null = null;
  meleeCooldown = 0;
  nextPunchHand: 'PunchLeft' | 'PunchRight' = 'PunchLeft';

  kills = 0;
  damageDealt = 0;
  lastAttackerId: string | null = null;
  lastAttackerWeaponName = 'RIFLE';
  lastHitIsHeadshot = false;
  lastHitTimeMs = 0;
  recentShotUntilMs = 0;
  eliminationProcessed = false;
  private deathLootDropped = false;

  private readonly movementSpeed = 5.2;
  private readonly sprintSpeed = 8.4;
  private readonly jumpForce = 8.4;

  private readonly stateSnap: PlayerStateSnapshot;

  constructor(spec: BotSpawnSpec, assetManager: AssetManager) {
    this.id = spec.id;
    this.name = spec.name;
    this.teamId = spec.teamId;
    this.isAlly = spec.isAlly;
    this.difficulty = spec.difficulty;
    this.profile = BOT_DIFFICULTY_PROFILES[spec.difficulty];
    this.personality = spec.personality;
    this.jumpAtProgress = spec.jumpAtProgress;
    this.dropTargetX = spec.dropTargetX;
    this.dropTargetZ = spec.dropTargetZ;
    this.waitSeedState = (spec.seed >>> 0) || 12345;

    this.visuals = new PlayerVisuals(assetManager);
    const charDef =
      (spec.characterId ? CHARACTER_ROSTER.find((c) => c.id === spec.characterId) : undefined) ??
      CHARACTER_ROSTER[Math.floor(seededFloat(spec.seed, 1) * CHARACTER_ROSTER.length)] ??
      CHARACTER_ROSTER[0];
    this.modelScale = charDef.model.scale;
    this.visuals.setHumanModelId(charDef.model.humanModelId);
    this.visuals.setAccentColors(charDef.model.primaryColorHex, charDef.model.visorColorHex);
    this.visuals.setModelScale(this.modelScale);
    if (spec.customization) {
      const normalized = normalizeR6Customization(
        spec.customization as unknown as Partial<R6Customization> & Record<string, unknown>,
      );
      this.visuals.setCustomization({ ...normalized, petEnabled: false });
    } else {
      this.visuals.setCustomization(this.buildRandomCustomization(spec.seed));
    }
    this.root.add(this.visuals.root);

    // Build lightweight 3D Parachute Canopy using shared GPU buffers
    this.buildParachuteVisual();
    this.chuteGroup.visible = false;
    this.root.add(this.chuteGroup);

    // Invisible raycast hitboxes using shared geometries & material
    this.headMesh = new THREE.Mesh(SHARED_HEAD_GEO, SHARED_HITBOX_MAT);
    this.bodyMesh = new THREE.Mesh(SHARED_BODY_GEO, SHARED_HITBOX_MAT);
    this.root.add(this.headMesh, this.bodyMesh);
    this.updateHitboxTransforms();
    this.root.updateMatrixWorld(true);

    this.stateSnap = {
      position: new THREE.Vector3(),
      rotation: this.rotation,
      velocity: this.velocity,
      health: this.health,
      maxHealth: this.maxHealth,
      shield: this.shield,
      maxShield: this.maxShield,
      movementSpeed: this.movementSpeed,
      sprintSpeed: this.sprintSpeed,
      jumpForce: this.jumpForce,
      isAlive: true,
      isSprinting: false,
      isCrouching: false,
      isGrounded: false,
      animationState: 'Skydive',
      airborneBankRad: 0,
    };
  }

  setGroundHeightSampler(
    sampler?: (worldX: number, worldZ: number, refY: number) => number,
  ): void {
    this.stateSnap.groundHeightSampler = sampler;
  }

  private updateHitboxTransforms(): void {
    const s = this.modelScale;
    if (this.isCrouching) {
      this.bodyMesh.scale.set(s, 0.84 * s, s);
      this.bodyMesh.position.set(0, 0.54 * s, 0);
      this.headMesh.scale.set(s, s, s);
      this.headMesh.position.set(0, 1.32 * s, 0);
    } else {
      this.bodyMesh.scale.set(s, s, s);
      this.bodyMesh.position.set(0, 0.72 * s, 0);
      this.headMesh.scale.set(s, s, s);
      this.headMesh.position.set(0, 1.56 * s, 0);
    }
    this.bodyMesh.rotation.y = this.rotation.y;
    this.headMesh.rotation.y = this.rotation.y;
  }

  private buildRandomCustomization(seed: number): R6Customization {
    const pick = <T>(arr: readonly T[], salt: number): T =>
      arr[Math.floor(seededFloat(seed, salt) * arr.length)] ?? arr[0];

    const skin = pick(R6_SKINS, 2);
    const eyes = pick(R6_EYE_STYLES, 3);
    const mouth = pick(R6_MOUTH_STYLES, 4);
    const hairStyle = pick(R6_HAIR_STYLES, 5);
    const hairColor = pick(R6_HAIR_COLORS, 6);
    const top = pick(R6_TOPS, 7);
    const pants = pick(R6_PANTS, 8);
    const shoes = pick(R6_SHOES, 9);
    const hat = seededFloat(seed, 10) > 0.55 ? pick(R6_HATS, 11) : R6_HATS[0];
    const glasses = seededFloat(seed, 12) > 0.65 ? pick(R6_GLASSES, 13) : R6_GLASSES[0];
    const mask = seededFloat(seed, 14) > 0.72 ? pick(R6_MASKS, 15) : R6_MASKS[0];
    const faceMark = seededFloat(seed, 18) > 0.68 ? pick(R6_FACE_MARKS, 19) : R6_FACE_MARKS[0];
    const accPool = R6_ACCESSORIES.filter((a) => a.id !== 'crown');
    const acc = accPool[Math.floor(seededFloat(seed, 16) * accPool.length)] ?? accPool[0];
    return {
      skinId: skin.id,
      eyesId: eyes.id,
      mouthId: mouth.id,
      faceMarkId: faceMark.id,
      hairStyleId: hairStyle.id,
      hairColorId: hairColor.id,
      topId: top.id,
      pantsId: pants.id,
      shoesId: shoes.id,
      hatId: hat.id,
      glassesId: glasses.id,
      maskId: mask.id,
      armorId: 'none',
      accessoryId: seededFloat(seed, 17) > 0.4 ? acc.id : 'none',
      petId: 'none',
      petEnabled: false,
    };
  }

  private buildParachuteVisual(): void {
    const canopyMat = this.isAlly
      ? SHARED_CANOPY_MATS.ally
      : (SHARED_CANOPY_MATS[this.difficulty] ?? SHARED_CANOPY_MATS.default);
    const canopy = new THREE.Mesh(SHARED_CANOPY_GEO, canopyMat);
    canopy.position.set(0, 3.35, 0);

    for (let i = 0; i < CHUTE_CORD_OFFSETS.length; i++) {
      const cx = CHUTE_CORD_OFFSETS[i][0];
      const cy = CHUTE_CORD_OFFSETS[i][1];
      const cz = CHUTE_CORD_OFFSETS[i][2];
      const cord = new THREE.Mesh(SHARED_CORD_GEO, SHARED_CORD_MAT);
      cord.position.set(cx * 0.65, cy, cz * 0.65);
      cord.rotation.z = -cx * 0.32;
      cord.rotation.x = cz * 0.25;
      this.chuteGroup.add(cord);
    }

    this.chuteGroup.add(canopy);
  }

  get damageReductionPct(): number {
    const armorMit = this.armorDurability > 0 ? this.armorReductionPct : 0;
    const helmMit = this.helmetDurability > 0 ? this.helmetReductionPct : 0;
    return clamp(armorMit + helmMit * 0.7, 0, 58);
  }

  getActiveWeapon(): BotWeaponSlot | null {
    return this.weapons[this.activeSlotIndex] ?? this.weapons[0] ?? this.weapons[1];
  }

  getEyePosition(out: THREE.Vector3): THREE.Vector3 {
    const eyeOffset = this.isCrouching ? 1.24 : BOT_EYE_HEIGHT;
    return out.set(this.position.x, this.position.y + eyeOffset, this.position.z);
  }

  applyHitDamage(result: DamageCalculationResult): void {
    if (!this.isAlive || this.eliminatedPermanently || this.dropPhase === 'waiting') return;

    this.shield = Math.max(0, this.shield - result.shieldDamage);
    this.health = Math.max(0, this.health - result.healthDamage);

    if (result.isHeadshot) {
      if (this.helmetDurability > 0) {
        this.helmetDurability = Math.max(0, this.helmetDurability - Math.ceil(result.totalDamage * 0.55));
        if (this.helmetDurability <= 0) {
          this.helmetLevel = 0;
          this.helmetReductionPct = 0;
          this.syncGearVisuals();
        }
      }
    } else if (this.armorDurability > 0) {
      this.armorDurability = Math.max(0, this.armorDurability - Math.ceil(result.totalDamage * 0.45));
      if (this.armorDurability <= 0) {
        this.armorLevel = 0;
        this.armorReductionPct = 0;
        this.syncGearVisuals();
      }
    }

    // Cancel healing if hit hard
    if (this.pendingHealKind && result.healthDamage > 6) {
      this.pendingHealKind = null;
      this.healTimer = 0;
    }

    if (this.health <= 0) {
      this.terminatePermanently();
    }

    this.redrawNameplateIfNeeded();
  }

  applyKnockback(dirX: number, dirZ: number, horizSpeed = 5.4, upSpeed = 2.5): void {
    if (!this.isAlive || this.eliminatedPermanently || this.dropPhase !== 'landed') return;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) {
      this.velocity.x += (dirX / len) * horizSpeed;
      this.velocity.z += (dirZ / len) * horizSpeed;
    }
    this.velocity.y = Math.max(this.velocity.y, upSpeed);
    this.isGrounded = false;
  }

  private terminatePermanently(): void {
    this.isAlive = false;
    this.eliminatedPermanently = true;
    this.deathElapsedSec = 0;
    this.corpseRemoved = false;
    this.health = 0;
    this.shield = 0;
    this.pendingHealKind = null;
    this.healTimer = 0;
    this.reloadTimer = 0;
    this.velocity.set(0, 0, 0);
    this.animController.setAirborneOverride(null);
    this.animController.clearAction();
    this.headMesh.visible = false;
    this.bodyMesh.visible = false;
    this.chuteGroup.visible = false;
    if (this.nameplateSprite) {
      this.nameplateSprite.visible = false;
    }
    this.lastPlateHash = -1;
    this.equippedWeaponModelId = null;
    this.equippedWeaponModel?.dispose();
    this.equippedWeaponModel = null;
    this.visuals.attachWeaponMesh(null);
    if (this.lastShadowCast) {
      this.lastShadowCast = false;
      this.visuals.setShadowCasting(false);
    }
  }

  registerIncomingAttacker(
    attackerId: string,
    weaponName: string,
    isHeadshot: boolean,
  ): void {
    if (!this.isAlive || this.eliminatedPermanently) return;
    this.lastAttackerId = attackerId;
    this.lastAttackerWeaponName = weaponName;
    this.lastHitIsHeadshot = isHeadshot;
    this.lastHitTimeMs = performance.now();
  }

  applyZoneDamage(amount: number): boolean {
    if (!this.isAlive || this.eliminatedPermanently || this.dropPhase === 'waiting' || amount <= 0) {
      return false;
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.lastAttackerId = null;
      this.lastAttackerWeaponName = 'SAFE ZONE';
      this.lastHitIsHeadshot = false;
      this.terminatePermanently();
      this.redrawNameplateIfNeeded();
      return true;
    }
    this.redrawNameplateIfNeeded();
    return false;
  }

  syncGearVisuals(): void {
    this.visuals.setArenaGearVisuals(this.armorLevel, this.helmetLevel, this.backpackLevel);
  }

  syncWeaponAttachment(): void {
    const active = this.getActiveWeapon();
    const targetId = active ? active.definition.id : null;
    if (targetId === this.equippedWeaponModelId) return;

    this.equippedWeaponModelId = targetId;
    this.equippedWeaponModel?.dispose();
    this.equippedWeaponModel = null;
    if (targetId && WEAPON_BY_ID[targetId]) {
      this.equippedWeaponModel = new Weapon(WEAPON_BY_ID[targetId]);
      this.equippedWeaponModel.setShadowCasting(this.lastShadowCast);
      this.visuals.attachWeaponMesh(this.equippedWeaponModel.mesh, true, targetId);
    } else {
      this.visuals.attachWeaponMesh(null, true, null);
    }
  }

  switchWeaponSlot(slot: 0 | 1): void {
    if (!this.weapons[slot]) return;
    if (this.activeSlotIndex === slot) return;
    this.activeSlotIndex = slot;
    this.reloadTimer = 0;
    this.syncWeaponAttachment();
  }

  selectBestWeaponForDistance(distance: number): void {
    const w0 = this.weapons[0];
    const w1 = this.weapons[1];
    if (!w0 && !w1) return;
    if (w0 && !w1) {
      this.switchWeaponSlot(0);
      return;
    }
    if (!w0 && w1) {
      this.switchWeaponSlot(1);
      return;
    }
    if (!w0 || !w1) return;

    const scoreSlot = (w: BotWeaponSlot): number => {
      const ammoTotal = w.ammoInMagazine + this.ammoPool[w.definition.type];
      if (ammoTotal <= 0) return -100;
      const t = w.definition.type;
      if (distance > 58) {
        if (t === 'SNIPER') return 110;
        if (t === 'AR') return w.definition.id === 'parafal' ? 98 : 84;
        if (t === 'LMG') return 82;
        if (t === 'SMG') return 35;
        return 5;
      }
      if (distance > 17) {
        if (t === 'AR') return 105;
        if (t === 'LMG') return 102;
        if (t === 'SMG') return 78;
        if (t === 'SNIPER') return 62;
        return 24;
      }
      if (t === 'SHOTGUN') return 108;
      if (t === 'SMG') return 96;
      if (t === 'LMG') return 90;
      if (t === 'AR') return 86;
      return 32;
    };

    const s0 = scoreSlot(w0);
    const s1 = scoreSlot(w1);
    this.switchWeaponSlot(s1 > s0 + 5 ? 1 : 0);
  }

  scoreLootDesirability(item: LootItem): number {
    const def = item.definition;
    if (def.category === 'weapon' && def.weaponId) {
      const weapDef = WEAPON_BY_ID[def.weaponId];
      if (!weapDef) return 0;
      if (!this.weapons[0] || !this.weapons[1]) {
        // Need a second weapon — especially value complementary weapon type
        const existing = this.weapons[0] ?? this.weapons[1];
        if (existing && existing.definition.id === weapDef.id) return 15;
        if (existing && existing.definition.type !== weapDef.type) return 95;
        return 80;
      }
      const newScore = WEAPON_SCORE[weapDef.id] ?? 65;
      const worstScore = Math.min(
        WEAPON_SCORE[this.weapons[0].definition.id] ?? 65,
        WEAPON_SCORE[this.weapons[1].definition.id] ?? 65,
      );
      return newScore > worstScore + 8 ? newScore - worstScore + 40 : 0;
    }

    if (def.category === 'armor' && def.armorLevel) {
      if (def.armorLevel > this.armorLevel) return 96 + def.armorLevel * 10;
      if (def.armorLevel === this.armorLevel && this.armorDurability < this.armorMaxDurability * 0.55) {
        return 62;
      }
      return 0;
    }

    if (def.category === 'helmet' && def.helmetLevel) {
      if (def.helmetLevel > this.helmetLevel) return 92 + def.helmetLevel * 10;
      if (def.helmetLevel === this.helmetLevel && this.helmetDurability < this.helmetMaxDurability * 0.55) {
        return 58;
      }
      return 0;
    }

    if (def.category === 'backpack' && def.backpackLevel) {
      return def.backpackLevel > this.backpackLevel ? 74 + def.backpackLevel * 8 : 0;
    }

    if (def.category === 'ammo' && def.ammoType) {
      const matches = (t: WeaponCategory | undefined): boolean =>
        t === def.ammoType || (def.ammoType === 'AR' && t === 'LMG');
      const usesType =
        matches(this.weapons[0]?.definition.type) ||
        matches(this.weapons[1]?.definition.type);
      const cur =
        def.ammoType === 'AR'
          ? Math.max(this.ammoPool.AR, this.ammoPool.LMG)
          : this.ammoPool[def.ammoType];
      if (usesType && cur < 90) return 75;
      if (cur < 45) return 26;
      return 0;
    }

    if (def.category === 'health') {
      if (def.id === 'med_kit' && this.medkits < 2) return this.health < 75 ? 85 : 52;
      if (def.id === 'med_bandage' && this.bandages < 5) return this.health < 80 ? 60 : 34;
      return 0;
    }

    if (def.category === 'shield') {
      if (def.id === 'shield_battery' && this.shieldBatteries < 2) return this.shield < 70 ? 82 : 50;
      if (def.id === 'shield_cell' && this.shieldCells < 4) return this.shield < 80 ? 55 : 30;
      return 0;
    }

    if (def.category === 'utility' || def.category === 'special') {
      if (def.specialEffect === 'armor_repair' && this.armorLevel > 0 && this.armorDurability < this.armorMaxDurability * 0.7) {
        return 54;
      }
      if (def.specialEffect === 'ammo_pouch') return 58;
      return 28;
    }

    return 0;
  }

  collectLootItem(item: LootItem): boolean {
    if (!this.isAlive || this.eliminatedPermanently) return false;
    const def = item.definition;
    if (def.category === 'weapon' && def.weaponId) {
      const weapDef = WEAPON_BY_ID[def.weaponId];
      if (!weapDef) return false;

      const slotData: BotWeaponSlot = {
        definition: weapDef,
        ammoInMagazine: item.metadata.weaponAmmoInMag ?? weapDef.magazineSize,
        fireCooldown: 0,
        boltTimer: 0,
      };

      if (!this.weapons[0]) {
        this.weapons[0] = slotData;
        this.activeSlotIndex = 0;
      } else if (!this.weapons[1]) {
        this.weapons[1] = slotData;
        if ((WEAPON_SCORE[weapDef.id] ?? 65) > (WEAPON_SCORE[this.weapons[0].definition.id] ?? 65)) {
          this.activeSlotIndex = 1;
        }
      } else {
        const s0 = WEAPON_SCORE[this.weapons[0].definition.id] ?? 65;
        const s1 = WEAPON_SCORE[this.weapons[1].definition.id] ?? 65;
        const replaceIdx: 0 | 1 = s0 <= s1 ? 0 : 1;
        this.weapons[replaceIdx] = slotData;
        this.activeSlotIndex = replaceIdx;
      }

      // Grant initial loose ammo alongside floor weapon pickup (same as player pickup)
      const bonusAmmo =
        weapDef.type === 'SNIPER'
          ? 12
          : weapDef.type === 'SHOTGUN'
            ? 14
            : weapDef.magazineSize;
      this.ammoPool[weapDef.type] = Math.min(260, this.ammoPool[weapDef.type] + bonusAmmo);
      this.syncWeaponAttachment();
      return true;
    }

    if (def.category === 'ammo' && def.ammoType && def.ammoAmount) {
      this.ammoPool[def.ammoType] = Math.min(300, this.ammoPool[def.ammoType] + def.ammoAmount);
      if (def.ammoType === 'AR') {
        this.ammoPool.LMG = Math.min(300, this.ammoPool.LMG + def.ammoAmount);
      }
      return true;
    }

    if (def.category === 'armor' && def.armorLevel && def.armorMaxDurability) {
      this.armorLevel = Math.min(3, Math.max(0, def.armorLevel)) as 0 | 1 | 2 | 3;
      this.armorMaxDurability = def.armorMaxDurability;
      this.armorDurability = item.metadata.armorDurability ?? def.armorMaxDurability;
      this.armorReductionPct = def.armorReductionPct ?? 14;
      this.syncGearVisuals();
      return true;
    }

    if (def.category === 'helmet' && def.helmetLevel && def.helmetMaxDurability) {
      this.helmetLevel = Math.min(3, Math.max(0, def.helmetLevel)) as 0 | 1 | 2 | 3;
      this.helmetMaxDurability = def.helmetMaxDurability;
      this.helmetDurability = def.helmetMaxDurability;
      this.helmetReductionPct = def.helmetReductionPct ?? 12;
      this.syncGearVisuals();
      return true;
    }

    if (def.category === 'backpack' && def.backpackLevel) {
      this.backpackLevel = Math.min(3, Math.max(0, def.backpackLevel)) as 0 | 1 | 2 | 3;
      this.syncGearVisuals();
      return true;
    }

    if (def.category === 'health') {
      if (def.id === 'med_kit') this.medkits = Math.min(3, this.medkits + item.quantity);
      else this.bandages = Math.min(8, this.bandages + item.quantity);
      return true;
    }

    if (def.category === 'shield') {
      if (def.id === 'shield_battery') this.shieldBatteries = Math.min(3, this.shieldBatteries + item.quantity);
      else this.shieldCells = Math.min(6, this.shieldCells + item.quantity);
      return true;
    }

    if (def.healAmount) {
      this.health = Math.min(this.maxHealth, this.health + def.healAmount);
    }
    if (def.shieldAmount) {
      this.shield = Math.min(this.maxShield, this.shield + def.shieldAmount);
    }
    if (def.specialEffect === 'armor_repair' && this.armorLevel > 0) {
      this.armorDurability = Math.min(this.armorMaxDurability, this.armorDurability + 50);
    }
    if (def.specialEffect === 'ammo_pouch') {
      this.ammoPool.AR += 20;
      this.ammoPool.LMG += 20;
      this.ammoPool.SMG += 24;
      this.ammoPool.SHOTGUN += 6;
    }
    return true;
  }

  dropLootOnDeath(lootManager: LootManager): void {
    if (this.deathLootDropped) return;
    this.deathLootDropped = true;

    const px = this.position.x;
    const pz = this.position.z;
    const py = this.position.y;

    const bestWeapon = this.weapons[0] ?? this.weapons[1];
    if (bestWeapon) {
      lootManager.spawnDroppedItem(
        `weapon_${bestWeapon.definition.id}`,
        px + 0.45,
        pz + 0.25,
        1,
        { weaponAmmoInMag: bestWeapon.definition.magazineSize },
        py,
        px,
        pz,
      );
      lootManager.spawnDroppedItem(
        bestWeapon.definition.type === 'SNIPER'
          ? 'ammo_sniper'
          : bestWeapon.definition.type === 'SHOTGUN'
            ? 'ammo_shotgun'
            : bestWeapon.definition.type === 'SMG'
              ? 'ammo_smg'
              : bestWeapon.definition.type === 'PISTOL'
                ? 'ammo_pistol'
                : 'ammo_ar',
        px - 0.4,
        pz + 0.3,
        1,
        {},
        py,
        px,
        pz,
      );
    }

    if (this.armorLevel >= 1) {
      lootManager.spawnDroppedItem(
        `armor_lv${this.armorLevel}`,
        px + 0.2,
        pz - 0.45,
        1,
        { armorDurability: Math.max(25, Math.round(this.armorDurability)) },
        py,
        px,
        pz,
      );
    }

    if (this.helmetLevel >= 1) {
      lootManager.spawnDroppedItem(
        `helmet_lv${this.helmetLevel}`,
        px - 0.35,
        pz - 0.3,
        1,
        {},
        py,
        px,
        pz,
      );
    }

    if (this.medkits > 0) {
      lootManager.spawnDroppedItem('med_kit', px + 0.35, pz + 0.45, 1, {}, py, px, pz);
    } else if (this.bandages > 0) {
      lootManager.spawnDroppedItem('med_bandage', px + 0.35, pz + 0.45, 2, {}, py, px, pz);
    }

    if (this.shieldBatteries > 0) {
      lootManager.spawnDroppedItem('shield_battery', px - 0.45, pz - 0.15, 1, {}, py, px, pz);
    } else if (this.shieldCells > 0) {
      lootManager.spawnDroppedItem('shield_cell', px - 0.45, pz - 0.15, 1, {}, py, px, pz);
    }
  }

  startHealing(): boolean {
    if (!this.isAlive || this.eliminatedPermanently) return false;
    if (this.pendingHealKind || this.healTimer > 0) return false;
    if (this.health < 62 && this.medkits > 0) {
      this.pendingHealKind = 'medkit';
      this.healTimer = 3.0;
      return true;
    }
    if (this.health < this.profile.healThresholdHp && this.bandages > 0) {
      this.pendingHealKind = 'bandage';
      this.healTimer = 1.9;
      return true;
    }
    if (this.shield < 50 && this.shieldBatteries > 0) {
      this.pendingHealKind = 'battery';
      this.healTimer = 2.6;
      return true;
    }
    if (this.shield < 78 && this.shieldCells > 0) {
      this.pendingHealKind = 'cell';
      this.healTimer = 1.65;
      return true;
    }
    return false;
  }

  stepTimers(delta: number, audioManager: AudioManager, listenerPos: THREE.Vector3): void {
    if (!this.isAlive || this.eliminatedPermanently) return;
    if (this.meleeCooldown > 0) {
      this.meleeCooldown = Math.max(0, this.meleeCooldown - delta);
    }
    for (let i = 0; i < 2; i++) {
      const w = this.weapons[i];
      if (!w) continue;
      if (w.fireCooldown > 0) w.fireCooldown = Math.max(0, w.fireCooldown - delta);
      if (w.boltTimer > 0) w.boltTimer = Math.max(0, w.boltTimer - delta);
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - delta);
      if (this.reloadTimer <= 0) {
        const active = this.getActiveWeapon();
        if (active) {
          const type = active.definition.type;
          const avail = this.ammoPool[type];
          const need = active.definition.magazineSize - active.ammoInMagazine;
          const load = Math.min(need, avail);
          active.ammoInMagazine += load;
          this.ammoPool[type] -= load;
          const dSq = this.position.distanceToSquared(listenerPos);
          if (dSq < 42 * 42) {
            audioManager.playReload('finish');
          }
        }
      }
    }

    if (this.healTimer > 0 && this.pendingHealKind) {
      this.healTimer = Math.max(0, this.healTimer - delta);
      if (this.healTimer <= 0) {
        const kind = this.pendingHealKind;
        this.pendingHealKind = null;
        if (kind === 'medkit' && this.medkits > 0) {
          this.medkits--;
          this.health = Math.min(this.maxHealth, this.health + 80);
        } else if (kind === 'bandage' && this.bandages > 0) {
          this.bandages--;
          this.health = Math.min(this.maxHealth, this.health + 25);
        } else if (kind === 'battery' && this.shieldBatteries > 0) {
          this.shieldBatteries--;
          this.shield = Math.min(this.maxShield, this.shield + 65);
        } else if (kind === 'cell' && this.shieldCells > 0) {
          this.shieldCells--;
          this.shield = Math.min(this.maxShield, this.shield + 25);
        }
        this.redrawNameplateIfNeeded();
      }
    }
  }

  beginReload(): boolean {
    if (!this.isAlive || this.eliminatedPermanently) return false;
    if (this.reloadTimer > 0) return false;
    const active = this.getActiveWeapon();
    if (!active) return false;
    const type = active.definition.type;
    if (active.ammoInMagazine >= active.definition.magazineSize) return false;
    if (this.ammoPool[type] <= 0) {
      // Bots top up emergency scavenger mag only if completely dry for too long? No: switch weapon instead!
      return false;
    }
    this.reloadTimer = active.definition.reloadTime;
    this.animController.triggerAction('Reload', this.reloadTimer);
    return true;
  }

  setDropTarget(x: number, z: number): void {
    this.dropTargetX = x;
    this.dropTargetZ = z;
  }

  placeInWaitingArea(x: number, y: number, z: number, yaw: number): void {
    this.dropPhase = 'waiting';
    this.behaviorState = 'waiting';
    this.position.set(x, y, z);
    this.prevY = y;
    this.rotation.set(0, yaw, 0, 'YXZ');
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
    this.isCrouching = false;
    this.isSprinting = false;
    this.isAlive = true;
    this.eliminatedPermanently = false;
    this.deathElapsedSec = 0;
    this.corpseRemoved = false;
    this.health = this.maxHealth;
    this.shield = 50;
    this.chuteGroup.visible = false;
    this.root.visible = true;
    this.headMesh.visible = false;
    this.bodyMesh.visible = false;
    this.animController.setAirborneOverride(null);
    this.animController.clearAction();
    this.waitTimer = 0.25;
    this.waitJumpCooldown = 1.0 + seededFloat(this.waitSeedState, 11) * 3.5;
    this.waitPunchCooldown = 1.5 + seededFloat(this.waitSeedState, 19) * 4.5;
    this.waitLastX = x;
    this.waitLastZ = z;
    this.waitStuckTimer = 0;
    this.root.position.copy(this.position);
    this.root.updateMatrixWorld(true);
  }

  enterAirplaneFromWaiting(): void {
    this.dropPhase = 'airplane';
    this.behaviorState = 'airplane';
    this.isAlive = true;
    this.eliminatedPermanently = false;
    this.deathElapsedSec = 0;
    this.corpseRemoved = false;
    this.health = this.maxHealth;
    this.shield = 50;
    this.isGrounded = false;
    this.isCrouching = false;
    this.isSprinting = false;
    this.airborneBankRad = 0;
    this.velocity.set(0, 0, 0);
    this.chuteGroup.visible = false;
    this.root.visible = false;
    this.headMesh.visible = false;
    this.bodyMesh.visible = false;
    this.animController.setAirborneOverride(null);
    this.animController.clearAction();
  }

  private nextWaitRand(): number {
    this.waitSeedState = (Math.imul(this.waitSeedState, 1664525) + 1013904223) >>> 0;
    return this.waitSeedState / 4294967296;
  }

  stepWaitingBehavior(
    delta: number,
    centerX: number,
    centerZ: number,
    mapManager: MapManager,
    useDetailedFootProbes = true,
  ): void {
    if (!this.isAlive || this.eliminatedPermanently || this.dropPhase !== 'waiting') return;

    this.waitTimer -= delta;
    this.waitJumpCooldown -= delta;
    this.waitPunchCooldown -= delta;

    if (this.waitTimer <= 0) {
      this.waitTimer = 1.1 + this.nextWaitRand() * 2.2;
      const dxC = centerX - this.position.x;
      const dzC = centerZ - this.position.z;
      const distFromCenter = Math.hypot(dxC, dzC);

      if (distFromCenter > 24) {
        const inv = 1 / distFromCenter;
        const rx = dxC * inv;
        const rz = dzC * inv;
        // Blend radial return with tangent sweep so bots curve naturally around the central fountain
        const tangentSign = (this.waitSeedState & 1) === 0 ? 1 : -1;
        const tx = -rz * tangentSign * 0.42;
        const tz = rx * tangentSign * 0.42;
        const norm = 1 / Math.hypot(rx + tx, rz + tz);
        this.waitDirX = (rx + tx) * norm;
        this.waitDirZ = (rz + tz) * norm;
        this.waitSprint = true;
        this.waitCrouch = false;
      } else if (this.nextWaitRand() < 0.22) {
        this.waitDirX = 0;
        this.waitDirZ = 0;
        this.waitSprint = false;
        this.waitCrouch = this.nextWaitRand() < 0.35;
      } else {
        const ang = this.nextWaitRand() * Math.PI * 2;
        this.waitDirX = Math.cos(ang);
        this.waitDirZ = Math.sin(ang);
        this.waitSprint = this.nextWaitRand() < 0.52;
        this.waitCrouch = false;
      }
      this.waitStuckTimer = 0;
      this.waitLastX = this.position.x;
      this.waitLastZ = this.position.z;
    } else if (this.waitDirX !== 0 || this.waitDirZ !== 0) {
      this.waitStuckTimer += delta;
      if (this.waitStuckTimer >= 0.45) {
        const movedSq =
          (this.position.x - this.waitLastX) * (this.position.x - this.waitLastX) +
          (this.position.z - this.waitLastZ) * (this.position.z - this.waitLastZ);
        this.waitStuckTimer = 0;
        this.waitLastX = this.position.x;
        this.waitLastZ = this.position.z;
        if (movedSq < 0.04) {
          // Blocked by balustrade, fountain, or vehicle — steer away cleanly instead of running in place
          const turn = ((this.waitSeedState & 1) === 0 ? 1 : -1) * 1.95;
          const c = Math.cos(turn);
          const s = Math.sin(turn);
          const nx = this.waitDirX * c - this.waitDirZ * s;
          const nz = this.waitDirX * s + this.waitDirZ * c;
          this.waitDirX = nx;
          this.waitDirZ = nz;
        }
      }
    }

    let wantJump = false;
    if (this.waitJumpCooldown <= 0) {
      this.waitJumpCooldown = 2.0 + this.nextWaitRand() * 4.5;
      wantJump = !this.waitCrouch && this.isGrounded;
    }

    if (this.waitPunchCooldown <= 0) {
      this.waitPunchCooldown = 2.6 + this.nextWaitRand() * 5.0;
      const hand = this.nextPunchHand;
      this.nextPunchHand = hand === 'PunchLeft' ? 'PunchRight' : 'PunchLeft';
      this.animController.triggerAction(hand, 0.36);
    }

    const aimYaw =
      this.waitDirX !== 0 || this.waitDirZ !== 0
        ? Math.atan2(this.waitDirX, this.waitDirZ)
        : this.rotation.y;

    this.stepGroundPhysics(
      delta,
      this.waitDirX,
      this.waitDirZ,
      this.waitSprint,
      wantJump,
      this.waitCrouch,
      aimYaw,
      mapManager,
      false,
      useDetailedFootProbes,
    );
  }

  stepAirbornePhysics(
    delta: number,
    flightProgress: number,
    airplanePos: THREE.Vector3,
    airplaneHeadingRad: number,
    airplaneSpeedMps: number,
    mapManager: MapManager,
  ): void {
    if (!this.isAlive || this.eliminatedPermanently) return;

    if (this.dropPhase === 'airplane') {
      this.position.set(airplanePos.x, airplanePos.y - 1.2, airplanePos.z);
      this.prevY = this.position.y;
      this.rotation.y = airplaneHeadingRad;
      this.root.visible = false;
      this.chuteGroup.visible = false;

      if (flightProgress >= this.jumpAtProgress) {
        this.dropPhase = 'freefall';
        this.behaviorState = 'freefall';
        this.freefallElapsedSec = 0;
        const fwdX = Math.sin(airplaneHeadingRad);
        const fwdZ = Math.cos(airplaneHeadingRad);
        this.velocity.set(fwdX * airplaneSpeedMps * 0.4, -8.5, fwdZ * airplaneSpeedMps * 0.4);
        this.animController.setAirborneOverride('Skydive');
        this.root.visible = true;
      }
      return;
    }

    this.prevY = this.position.y;
    const dx = this.dropTargetX - this.position.x;
    const dz = this.dropTargetZ - this.position.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dist > 0.5 ? dx / dist : 0;
    const dirZ = dist > 0.5 ? dz / dist : 0;

    if (this.dropPhase === 'freefall') {
      this.freefallElapsedSec += delta;
      const horizSpeed = dist > 35 ? 25.0 : 12.0;
      this.velocity.x = damp(this.velocity.x, dirX * horizSpeed, 3.0, delta);
      this.velocity.z = damp(this.velocity.z, dirZ * horizSpeed, 3.0, delta);
      this.velocity.y = clamp(this.velocity.y - 16.5 * delta, -46, -6);

      this.position.addScaledVector(this.velocity, delta);
      mapManager.resolveAirborneCollision(this.position, BOT_RADIUS);
      if (dist > 1) {
        this.rotation.y = Math.atan2(dirX, dirZ);
      }

      const groundY = mapManager.getGroundHeightAt(this.position.x, this.position.z, Math.max(this.prevY, this.position.y) + 0.85);
      const agl = Math.max(0, this.position.y - groundY);
      if (this.freefallElapsedSec >= 1.75 || agl <= 30) {
        this.dropPhase = 'parachute';
        this.behaviorState = 'parachute';
        this.chuteGroup.visible = true;
        this.animController.setAirborneOverride('Parachute');
      }
    } else if (this.dropPhase === 'parachute') {
      const glideSpeed = dist > 18 ? 24.5 : Math.max(4, dist * 1.1);
      this.velocity.x = damp(this.velocity.x, dirX * glideSpeed, 3.8, delta);
      this.velocity.z = damp(this.velocity.z, dirZ * glideSpeed, 3.8, delta);
      this.velocity.y = damp(this.velocity.y, -CHUTE_DESCENT_MPS, 4.8, delta);

      this.position.addScaledVector(this.velocity, delta);
      mapManager.resolveAirborneCollision(this.position, BOT_RADIUS);
      if (dist > 1) {
        this.rotation.y = Math.atan2(dirX, dirZ);
      }
      this.airborneBankRad = clamp((dirX * Math.cos(this.rotation.y) - dirZ * Math.sin(this.rotation.y)) * 0.28, -0.3, 0.3);

      const groundY = mapManager.getGroundHeightAt(this.position.x, this.position.z, Math.max(this.prevY, this.position.y) + 0.85);
      if (this.position.y <= groundY + 0.16) {
        const safeY = mapManager.resolveSafeLandingPosition(this.position, this.prevY, BOT_RADIUS);
        this.position.y = safeY;
        this.velocity.set(0, 0, 0);
        this.isGrounded = true;
        this.dropPhase = 'landed';
        this.behaviorState = 'loot';
        this.airborneBankRad = 0;
        this.chuteGroup.visible = false;
        this.animController.setAirborneOverride(null);
      }
    }

    this.root.position.copy(this.position);
    this.root.updateMatrix();
    this.root.matrixWorld.makeTranslation(this.position.x, this.position.y, this.position.z);
    this.chuteGroup.rotation.y = this.rotation.y;
    if (this.chuteGroup.visible) {
      this.chuteGroup.updateMatrix();
      this.chuteGroup.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.chuteGroup.matrix);
    }
    this.updateHitboxTransforms();
    this.headMesh.updateMatrix();
    this.headMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.headMesh.matrix);
    this.bodyMesh.updateMatrix();
    this.bodyMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.bodyMesh.matrix);
  }

  stepGroundPhysics(
    delta: number,
    moveDirX: number,
    moveDirZ: number,
    sprint: boolean,
    wantJump: boolean,
    wantCrouch: boolean,
    aimYawRad: number,
    mapManager: MapManager,
    instantAimLock = false,
    useDetailedFootProbes = true,
  ): void {
    if (!this.isAlive || this.eliminatedPermanently) {
      this.velocity.set(0, 0, 0);
      return;
    }

    this.isCrouching = wantCrouch;
    const len = Math.hypot(moveDirX, moveDirZ);
    const hasMove = len > 0.05;
    const nx = hasMove ? moveDirX / len : 0;
    const nz = hasMove ? moveDirZ / len : 0;

    this.isSprinting = sprint && hasMove && !wantCrouch;
    const targetSpeed = wantCrouch
      ? this.movementSpeed * 0.56
      : this.isSprinting
        ? this.sprintSpeed
        : this.movementSpeed;

    const accel = this.isGrounded ? 15 : 5;
    this.velocity.x = damp(this.velocity.x, nx * targetSpeed, accel, delta);
    this.velocity.z = damp(this.velocity.z, nz * targetSpeed, accel, delta);

    if (wantJump && this.isGrounded && !wantCrouch) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
    }

    const prevY = this.position.y;
    const wasGrounded = this.isGrounded;

    this.velocity.y -= GRAVITY * delta;
    const stepX = this.velocity.x * delta;
    const stepZ = this.velocity.z * delta;
    const moveDist = Math.hypot(stepX, stepZ);
    const substeps = moveDist > 0.28 ? Math.min(4, Math.ceil(moveDist / 0.24)) : 1;
    const invSteps = 1 / substeps;
    const effectiveHeight = !this.isGrounded ? 1.12 : this.isCrouching ? 1.1 : 1.62;
    for (let s = 0; s < substeps; s++) {
      this.position.x += stepX * invSteps;
      this.position.z += stepZ * invSteps;
      mapManager.resolveHorizontalCollision(this.position, BOT_RADIUS, effectiveHeight);
    }

    this.position.y += this.velocity.y * delta;

    const refY = Math.max(prevY, this.position.y);
    let groundY = mapManager.getGroundHeightAt(this.position.x, this.position.z, refY);
    if (useDetailedFootProbes && (wasGrounded || this.velocity.y <= 0)) {
      const footProbeRadius = 0.18;
      const maxStepLift = groundY + 0.26;
      const gxPos = mapManager.getGroundHeightAt(this.position.x + footProbeRadius, this.position.z, refY);
      if (gxPos > groundY && gxPos <= maxStepLift) groundY = gxPos;
      const gxNeg = mapManager.getGroundHeightAt(this.position.x - footProbeRadius, this.position.z, refY);
      if (gxNeg > groundY && gxNeg <= maxStepLift) groundY = gxNeg;
      const gzPos = mapManager.getGroundHeightAt(this.position.x, this.position.z + footProbeRadius, refY);
      if (gzPos > groundY && gzPos <= maxStepLift) groundY = gzPos;
      const gzNeg = mapManager.getGroundHeightAt(this.position.x, this.position.z - footProbeRadius, refY);
      if (gzNeg > groundY && gzNeg <= maxStepLift) groundY = gzNeg;
    }

    if (!wasGrounded || this.velocity.y > 0 || groundY > prevY + 0.02) {
      const ceilingY = mapManager.getCeilingHeightAt(this.position.x, this.position.z, groundY);
      if (ceilingY > groundY + 1.82 && this.position.y > ceilingY - 1.78) {
        this.position.y = ceilingY - 1.78;
        if (this.velocity.y > 0) {
          this.velocity.y = 0;
        }
      }
    }

    const heightGap = this.position.y - groundY;
    if (heightGap <= 0 || (wasGrounded && this.velocity.y <= 0 && heightGap <= 0.38)) {
      this.position.y = groundY;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
      this.isGrounded = true;
    } else if (heightGap > 0.38) {
      this.isGrounded = false;
    }
    this.prevY = this.position.y;

    // Smooth yaw turn (tight, instant-lock speed during active aimbot combat)
    let diff = aimYawRad - this.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const trackRate = instantAimLock
      ? Math.max(26, this.profile.aimTrackRate * 2.4)
      : this.profile.aimTrackRate;
    this.rotation.y += diff * (1 - Math.exp(-trackRate * delta));

    // Align root & hitboxes immediately for hit detection without heavy subtree recursion unless needed
    this.root.position.copy(this.position);
    this.root.updateMatrix();
    this.root.matrixWorld.makeTranslation(this.position.x, this.position.y, this.position.z);
    this.updateHitboxTransforms();
    this.headMesh.updateMatrix();
    this.headMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.headMesh.matrix);
    this.bodyMesh.updateMatrix();
    this.bodyMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.bodyMesh.matrix);
  }

  syncVisuals(
    delta: number,
    elapsed: number,
    viewerPos: THREE.Vector3,
    isCompactDevice: boolean,
    qualityPreset: QualityPreset = 'medium',
    shadowsEnabled = true,
    inFrustum = true,
  ): void {
    if (!this.isAlive) {
      if (this.corpseRemoved) {
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
        this.chuteGroup.visible = false;
        if (this.nameplateSprite) this.nameplateSprite.visible = false;
        return;
      }
    }

    const visibleInWorld = this.dropPhase !== 'airplane';
    const distSq = this.position.distanceToSquared(viewerPos);
    const maxRenderSq =
      qualityPreset === 'low' ? 175 * 175 : qualityPreset === 'medium' ? 260 * 260 : 360 * 360;

    this.root.visible =
      inFrustum &&
      visibleInWorld &&
      !this.corpseRemoved &&
      (distSq <= maxRenderSq || this.dropPhase !== 'landed');
    this.headMesh.visible = this.isAlive && this.dropPhase === 'landed';
    this.bodyMesh.visible = this.isAlive && this.dropPhase === 'landed';

    if (!this.root.visible) {
      // Keep off-screen/distant alive hitboxes aligned cleanly without running skeletal mixer or IK
      if (this.isAlive && this.dropPhase === 'landed') {
        this.root.position.copy(this.position);
        this.root.updateMatrix();
        this.root.matrixWorld.makeTranslation(this.position.x, this.position.y, this.position.z);
        this.updateHitboxTransforms();
        this.headMesh.updateMatrix();
        this.headMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.headMesh.matrix);
        this.bodyMesh.updateMatrix();
        this.bodyMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.bodyMesh.matrix);
      }
      return;
    }

    this.root.position.copy(this.position);
    this.root.updateMatrix();
    this.root.matrixWorld.makeTranslation(this.position.x, this.position.y, this.position.z);
    this.updateHitboxTransforms();
    this.headMesh.updateMatrix();
    this.headMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.headMesh.matrix);
    this.bodyMesh.updateMatrix();
    this.bodyMesh.matrixWorld.multiplyMatrices(this.root.matrixWorld, this.bodyMesh.matrix);

    const basePlateDist =
      qualityPreset === 'low' ? 34 : qualityPreset === 'medium' ? (isCompactDevice ? 48 : 58) : 76;
    const maxNameplateDist = this.isAlly ? Math.max(basePlateDist, 105) : basePlateDist;
    const showPlate =
      this.isAlive &&
      this.dropPhase !== 'airplane' &&
      distSq <= maxNameplateDist * maxNameplateDist;
    if (showPlate) {
      this.redrawNameplateIfNeeded();
      if (this.nameplateSprite) {
        this.nameplateSprite.visible = true;
      }
    } else if (this.nameplateSprite) {
      this.nameplateSprite.visible = false;
    }

    const maxShadowDist =
      !shadowsEnabled || qualityPreset === 'low' ? 0 : qualityPreset === 'medium' ? 42 : 66;
    const castShadow = maxShadowDist > 0 && distSq <= maxShadowDist * maxShadowDist;
    if (castShadow !== this.lastShadowCast) {
      this.lastShadowCast = castShadow;
      this.visuals.setShadowCasting(castShadow);
      this.equippedWeaponModel?.setShadowCasting(castShadow);
    }

    this.stateSnap.position.set(0, 0, 0);
    this.stateSnap.health = this.health;
    this.stateSnap.shield = this.shield;
    this.stateSnap.isAlive = this.isAlive;
    this.stateSnap.isSprinting = this.isSprinting;
    this.stateSnap.isCrouching = this.isCrouching;
    this.stateSnap.isGrounded = this.isGrounded;
    this.stateSnap.airborneBankRad = this.airborneBankRad;
    this.stateSnap.weaponId = this.equippedWeaponModelId;
    this.stateSnap.animationState = this.animController.update(delta, this.stateSnap);

    const maxAnimSq =
      qualityPreset === 'low' ? 75 * 75 : qualityPreset === 'medium' ? 115 * 115 : 155 * 155;
    const reducedDetailSq =
      qualityPreset === 'low' ? 36 * 36 : qualityPreset === 'medium' ? 58 * 58 : 85 * 85;
    const skipIk = distSq > 20 * 20;

    if (!this.isAlive || distSq < maxAnimSq || this.dropPhase !== 'landed') {
      this.visuals.sync(this.stateSnap, delta, elapsed, distSq > reducedDetailSq, skipIk);
    } else {
      this.visuals.root.position.set(0, 0, 0);
      this.visuals.root.rotation.y = this.rotation.y;
    }
  }

  private ensureNameplate(): void {
    if (this.nameplateSprite || this.disposed) return;
    this.nameplateCanvas = document.createElement('canvas');
    this.nameplateCanvas.width = 256;
    this.nameplateCanvas.height = 64;
    this.nameplateCtx = this.nameplateCanvas.getContext('2d');
    this.nameplateTexture = new THREE.CanvasTexture(this.nameplateCanvas);
    this.nameplateMat = new THREE.SpriteMaterial({
      map: this.nameplateTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.nameplateSprite = new THREE.Sprite(this.nameplateMat);
    this.nameplateSprite.position.set(0, 2.34, 0);
    this.nameplateSprite.scale.set(1.78, 0.44, 1);
    this.nameplateSprite.visible = false;
    this.root.add(this.nameplateSprite);
  }

  private redrawNameplateIfNeeded(): void {
    if (!this.nameplateSprite && !this.isAlive) return;
    const key =
      (Math.max(0, Math.round(this.health)) & 0x3ff) |
      ((Math.max(0, Math.round(this.shield)) & 0x3ff) << 10) |
      ((this.isAlive ? 1 : 0) << 20) |
      ((this.armorLevel & 3) << 21);
    if (key === this.lastPlateHash) return;
    if (!this.nameplateSprite) {
      this.ensureNameplate();
    }
    if (!this.nameplateCtx || !this.nameplateCanvas || !this.nameplateTexture) return;
    this.lastPlateHash = key;

    const ctx = this.nameplateCtx;
    const w = this.nameplateCanvas.width;
    const h = this.nameplateCanvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!this.isAlive) return;

    const accent = this.isAlly
      ? '#34d399'
      : this.difficulty === 'pro'
        ? '#f43f5e'
        : this.difficulty === 'veteran'
          ? '#f97316'
          : this.difficulty === 'tactical'
            ? '#38bdf8'
            : '#94a3b8';

    ctx.fillStyle = this.isAlly ? 'rgba(6, 24, 20, 0.86)' : 'rgba(7, 11, 20, 0.8)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(10, 6, w - 20, h - 12, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.isAlly ? '#6ee7b7' : '#f8fafc';
    ctx.fillText(this.isAlly ? `[ALLY] ${this.name}` : this.name, w / 2, 23);

    const barW = w - 44;
    const barX = 22;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.fillRect(barX, 38, barW, 8);
    const hpFrac = Math.max(0, Math.min(1, this.health / Math.max(1, this.maxHealth)));
    ctx.fillStyle = '#34d399';
    ctx.fillRect(barX, 38, barW * hpFrac, 8);

    if (this.shield > 0) {
      const shFrac = Math.max(0, Math.min(1, this.shield / Math.max(1, this.maxShield)));
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX, 48, barW * shFrac, 4);
    }

    this.nameplateTexture.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    this.equippedWeaponModel?.dispose();
    this.equippedWeaponModel = null;
    this.visuals.dispose();
    this.nameplateTexture?.dispose();
    this.nameplateTexture = null;
    this.nameplateMat?.dispose();
    this.nameplateMat = null;
    this.nameplateSprite = null;
    this.nameplateCanvas = null;
    this.nameplateCtx = null;
  }
}
