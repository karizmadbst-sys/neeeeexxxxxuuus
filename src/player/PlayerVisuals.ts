import * as THREE from 'three';
import {
  buildFittedHelmetAssembly,
  measureHeadFitProfile,
} from '../characters/HelmetFittingSystem';
import { getR6AnimationClips, getR6IdleClip } from '../characters/R6AnimationClips';
import { getR6CharacterPreset } from '../characters/R6CharacterCatalog';
import { getR6EmoteClip } from '../characters/R6EmoteClips';
import {
  buildR6CharacterModel,
  type BuiltR6Character,
} from '../characters/R6ModelBuilder';
import type { AssetManager } from '../core/AssetManager';
import type { Subsystem } from '../core/Types';
import { clamp, damp } from '../utils/MathUtils';
import { updateWorldMatrixChain } from '../utils/TransformUtils';
import {
  computeWeaponSocketTransform,
  getWeaponBackMountProfile,
  getWeaponGripProfile,
  LEFT_HAND_PALM_LOCAL,
  RIGHT_HAND_PALM_LOCAL,
  WEAPON_SOCKET_BASE_ROT_X,
  type WeaponStanceKind,
} from '../weapons/WeaponGripProfiles';
import { computeWristPosFromPalmTarget, solveTwoBoneArmIK } from './ArmIKSolver';
import type { PlayerAnimationState, PlayerStateSnapshot } from './IPlayerController';
import { solveGroundedLegIK } from './LegIKSolver';
import {
  DEFAULT_R6_CUSTOMIZATION,
  getArmorIdFromTier,
  getArmorOption,
  loadR6Customization,
  type R6ArmorId,
  type R6Customization,
} from './R6CustomizationData';

let SHARED_SHADOW_GEO: THREE.PlaneGeometry | null = null;
let SHARED_CONTACT_SHADOW_MAT: THREE.MeshBasicMaterial | null = null;

function getSharedShadowGeo(): THREE.PlaneGeometry {
  if (!SHARED_SHADOW_GEO) {
    SHARED_SHADOW_GEO = new THREE.PlaneGeometry(1.15, 1.15);
    SHARED_SHADOW_GEO.rotateX(-Math.PI / 2);
  }
  return SHARED_SHADOW_GEO;
}

const SHARED_BACKPACK_MATS = new Map<
  1 | 2 | 3,
  { bodyMat: THREE.MeshStandardMaterial; trimMat: THREE.MeshStandardMaterial }
>();
const SHARED_VEST_MATS = new Map<
  1 | 2 | 3,
  { plateMat: THREE.MeshStandardMaterial; trimMat: THREE.MeshStandardMaterial; glowMat: THREE.MeshStandardMaterial }
>();

function getSharedBackpackMats(tier: 1 | 2 | 3) {
  let entry = SHARED_BACKPACK_MATS.get(tier);
  if (!entry) {
    const bodyColor = tier === 1 ? '#5c4b37' : tier === 2 ? '#293548' : '#1b1d22';
    const trimColor = tier === 1 ? '#b45309' : tier === 2 ? '#38bdf8' : '#f59e0b';
    entry = {
      bodyMat: new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.68,
        metalness: 0.18,
      }),
      trimMat: new THREE.MeshStandardMaterial({
        color: trimColor,
        emissive: trimColor,
        emissiveIntensity: tier >= 2 ? 0.35 : 0.08,
        roughness: 0.35,
        metalness: 0.55,
      }),
    };
    SHARED_BACKPACK_MATS.set(tier, entry);
  }
  return entry;
}

function getSharedVestMats(tier: 1 | 2 | 3) {
  let entry = SHARED_VEST_MATS.get(tier);
  if (!entry) {
    const spec = getArmorOption(getArmorIdFromTier(tier));
    entry = {
      plateMat: new THREE.MeshStandardMaterial({
        color: spec.metalHex,
        roughness: 0.45,
        metalness: 0.55,
      }),
      trimMat: new THREE.MeshStandardMaterial({
        color: spec.trimHex,
        roughness: 0.34,
        metalness: 0.72,
      }),
      glowMat: new THREE.MeshStandardMaterial({
        color: spec.glowHex,
        emissive: spec.glowHex,
        emissiveIntensity: 0.85,
        roughness: 0.22,
        metalness: 0.25,
      }),
    };
    SHARED_VEST_MATS.set(tier, entry);
  }
  return entry;
}

let SHARED_GEAR_GEOS: {
  shadesVisor: THREE.CylinderGeometry;
  packMain: THREE.CapsuleGeometry;
  packPouch: THREE.BoxGeometry;
  packRoll: THREE.CylinderGeometry;
  vestPlate: THREE.BoxGeometry;
  vestEmblem: THREE.BoxGeometry;
  vestPauldron: THREE.SphereGeometry;
  headphoneCup: THREE.CylinderGeometry;
  headphoneBand: THREE.TorusGeometry;
  capeGeo: THREE.BoxGeometry;
  crownBandGeo: THREE.CylinderGeometry;
  strapGeo: THREE.BoxGeometry;
  claspGeo: THREE.BoxGeometry;
  railGeo: THREE.BoxGeometry;
  strapMat: THREE.MeshStandardMaterial;
  metalMat: THREE.MeshStandardMaterial;
  goldMat: THREE.MeshStandardMaterial;
  capeMat: THREE.MeshStandardMaterial;
} | null = null;

function getSharedGearGeos() {
  if (!SHARED_GEAR_GEOS) {
    SHARED_GEAR_GEOS = {
      shadesVisor: new THREE.CylinderGeometry(0.242, 0.242, 0.085, 16, 1, true, -0.78, 1.56),
      packMain: new THREE.CapsuleGeometry(0.145, 0.24, 8, 12),
      packPouch: new THREE.BoxGeometry(0.24, 0.16, 0.07),
      packRoll: new THREE.CylinderGeometry(0.055, 0.055, 0.30, 10),
      vestPlate: new THREE.BoxGeometry(0.46, 0.36, 0.048),
      vestEmblem: new THREE.BoxGeometry(0.13, 0.075, 0.028),
      vestPauldron: new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      headphoneCup: new THREE.CylinderGeometry(0.068, 0.068, 0.045, 12),
      headphoneBand: new THREE.TorusGeometry(0.228, 0.016, 8, 18, Math.PI),
      capeGeo: new THREE.BoxGeometry(0.56, 0.66, 0.03),
      crownBandGeo: new THREE.CylinderGeometry(0.225, 0.225, 0.075, 8),
      strapGeo: new THREE.BoxGeometry(0.045, 0.54, 0.018),
      claspGeo: new THREE.BoxGeometry(0.07, 0.075, 0.045),
      railGeo: new THREE.BoxGeometry(0.05, 0.28, 0.032),
      strapMat: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.72,
        metalness: 0.22,
      }),
      metalMat: new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.34,
        metalness: 0.78,
      }),
      goldMat: new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#b45309',
        emissiveIntensity: 0.35,
        roughness: 0.24,
        metalness: 0.85,
      }),
      capeMat: new THREE.MeshStandardMaterial({
        color: '#991b1b',
        roughness: 0.78,
        metalness: 0.05,
      }),
    };
  }
  return SHARED_GEAR_GEOS;
}

let SHARED_HEALING_ASSETS: {
  mkBodyGeo: THREE.BoxGeometry;
  mkCrossHGeo: THREE.BoxGeometry;
  mkCrossVGeo: THREE.BoxGeometry;
  bandageGeo: THREE.CylinderGeometry;
  shieldGeo: THREE.CylinderGeometry;
  syringeGeo: THREE.CylinderGeometry;
  drinkGeo: THREE.CylinderGeometry;
  mkBodyMat: THREE.MeshStandardMaterial;
  mkCrossMat: THREE.MeshStandardMaterial;
  bandageMat: THREE.MeshStandardMaterial;
  shieldMat: THREE.MeshStandardMaterial;
  syringeMat: THREE.MeshStandardMaterial;
  drinkMat: THREE.MeshStandardMaterial;
} | null = null;

function getSharedHealingAssets() {
  if (!SHARED_HEALING_ASSETS) {
    SHARED_HEALING_ASSETS = {
      mkBodyGeo: new THREE.BoxGeometry(0.14, 0.09, 0.12),
      mkCrossHGeo: new THREE.BoxGeometry(0.065, 0.018, 0.022),
      mkCrossVGeo: new THREE.BoxGeometry(0.022, 0.018, 0.065),
      bandageGeo: new THREE.CylinderGeometry(0.036, 0.036, 0.085, 12),
      shieldGeo: new THREE.CylinderGeometry(0.042, 0.042, 0.125, 12),
      syringeGeo: new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10),
      drinkGeo: new THREE.CylinderGeometry(0.032, 0.03, 0.115, 12),
      mkBodyMat: new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.42, metalness: 0.12 }),
      mkCrossMat: new THREE.MeshStandardMaterial({ color: '#10b981', emissive: '#10b981', emissiveIntensity: 0.65 }),
      bandageMat: new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.75 }),
      shieldMat: new THREE.MeshStandardMaterial({
        color: '#0ea5e9',
        emissive: '#38bdf8',
        emissiveIntensity: 0.95,
        roughness: 0.22,
        metalness: 0.45,
      }),
      syringeMat: new THREE.MeshStandardMaterial({
        color: '#34d399',
        emissive: '#10b981',
        emissiveIntensity: 0.85,
        roughness: 0.25,
      }),
      drinkMat: new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 0.7,
        roughness: 0.25,
        metalness: 0.5,
      }),
    };
  }
  return SHARED_HEALING_ASSETS;
}

const SHARED_VISOR_MATS = new Map<string, THREE.MeshStandardMaterial>();
function getSharedVisorMat(hex: string): THREE.MeshStandardMaterial {
  let mat = SHARED_VISOR_MATS.get(hex);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: 0.36,
      roughness: 0.12,
      metalness: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    SHARED_VISOR_MATS.set(hex, mat);
  }
  return mat;
}

export class PlayerVisuals implements Subsystem {
  readonly root = new THREE.Group();

  private readonly rigPivot = new THREE.Group();
  private readonly contactShadowMesh: THREE.Mesh;

  private readonly weaponSocket = new THREE.Group();
  private readonly backHolsterGroup = new THREE.Group();
  private readonly headArmorGroup = new THREE.Group();
  private readonly headAccessoryGroup = new THREE.Group();
  private readonly torsoArmorGroup = new THREE.Group();
  private readonly leftArmArmorGroup = new THREE.Group();
  private readonly rightArmArmorGroup = new THREE.Group();
  private readonly backAccessoryGroup = new THREE.Group();

  private readonly holsteredMeshes: THREE.Object3D[] = [];
  private readonly shadowCastMeshes: THREE.Mesh[] = [];
  private readonly overlayShadowMeshes: THREE.Mesh[] = [];
  private readonly overlayDetailMeshes: THREE.Object3D[] = [];
  private microDetailVisible = true;

  private humanModelId = 'r6-vanguard';
  private modelGroup: THREE.Group | null = null;
  private builtR6: BuiltR6Character | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<PlayerAnimationState, THREE.AnimationAction>();
  private readonly emoteActions = new Map<string, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;
  private activeAnimState: PlayerAnimationState | null = null;
  private activeEmoteAction: THREE.AnimationAction | null = null;
  private activeEmoteId: string | null = null;
  private activeEmoteSeq = 0;
  private fullClipsBound = false;

  private hipsBone: THREE.Bone | null = null;
  private spineBone: THREE.Bone | null = null;
  private chestBone: THREE.Bone | null = null;
  private neckBone: THREE.Bone | null = null;
  private headBone: THREE.Bone | null = null;
  private leftThighBone: THREE.Bone | null = null;
  private leftShinBone: THREE.Bone | null = null;
  private leftFootBone: THREE.Bone | null = null;
  private rightThighBone: THREE.Bone | null = null;
  private rightShinBone: THREE.Bone | null = null;
  private rightFootBone: THREE.Bone | null = null;
  // Semantic anatomical arm chains (trigger = -X anatomical right, support = +X anatomical left)
  private triggerShoulderBone: THREE.Bone | null = null;
  private triggerUpperArmBone: THREE.Bone | null = null;
  private triggerForearmBone: THREE.Bone | null = null;
  private triggerHandBone: THREE.Bone | null = null;
  private supportShoulderBone: THREE.Bone | null = null;
  private supportUpperArmBone: THREE.Bone | null = null;
  private supportForearmBone: THREE.Bone | null = null;
  private supportHandBone: THREE.Bone | null = null;
  private readonly triggerShoulderRestQuat = new THREE.Quaternion();
  private readonly supportShoulderRestQuat = new THREE.Quaternion();
  private readonly neckRestQuat = new THREE.Quaternion();

  private shadowCastingEnabled = true;
  private customization: R6Customization;
  private fighterPrimaryHex = '#38bdf8';
  private fighterVisorHex = '#f97316';
  private arenaArmorTierOverride: 0 | 1 | 2 | 3 | null = null;
  private arenaHelmetTierOverride: 0 | 1 | 2 | 3 | null = null;
  private arenaBackpackTierOverride: 0 | 1 | 2 | 3 | null = null;
  private modelScale = 1.0;

  private weaponEquipped = false;
  private equippedWeaponId: string | null = null;
  private pendingTargetWeaponId: string | null = null;
  private attachedWeaponInstance: THREE.Object3D | null = null;
  private switchAnimTimer = 0;
  private switchAnimDuration = 0.24;
  private switchStage: 0 | 1 | 2 | 3 = 0;
  private pendingTargetHandMesh: THREE.Object3D | null = null;
  private readonly pendingTargetBackMeshes: THREE.Object3D[] = [];
  private readonly switchIntermediateBackMeshes: THREE.Object3D[] = [];

  private previewYaw = 0;
  private targetPreviewYaw = 0;
  private autoSpin = false;
  private lodAccumDelta = 0;
  private lodFrameCounter = 0;

  // Smoothed weapon stance & IK state (zero-allocation per frame)
  private hasInitializedStance = false;
  private readonly smoothedStancePos = new THREE.Vector3(-0.15, -0.025, 0.15);
  private readonly smoothedStanceRot = new THREE.Vector3(0.22, 0.56, -0.12);
  private smoothedTorsoYaw = 0;
  private smoothedTorsoPitch = 0;
  private smoothedArmedWeight = 0;
  private smoothedLeftIkWeight = 0;
  private smoothedWalkTimeScale = 1;
  private smoothedRunTimeScale = 1;
  private smoothedCrouchWalkTimeScale = 1;
  private smoothedProneTimeScale = 1;
  private smoothedIdleWeight = 1;
  private smoothedWalkWeight = 0;
  private smoothedRunWeight = 0;
  private smoothedCrouchIdleWeight = 0;
  private smoothedCrouchWalkWeight = 0;
  private crouchClipWeight = 0;
  private groundLocoMasterWeight = 1;
  private outgoingNonLocoAction: THREE.AnimationAction | null = null;
  private outgoingNonLocoWeight = 0;
  private smoothedCrouchAmount = 0;
  private smoothedLegIkWeight = 1;
  private activeOverlayAction: THREE.AnimationAction | null = null;
  private activeOverlayState: 'Shoot' | 'Reload' | 'PunchLeft' | 'PunchRight' | null = null;
  private readonly headStabUpperQuat = new THREE.Quaternion();
  private readonly headStabFullQuat = new THREE.Quaternion();
  private readonly headStabEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private lastActionSeq = 0;
  private wasShootAction = false;
  private shootRecoilSpring = 0;
  private shootExtendTimer = 0;
  private shootExtendBlend = 0;
  private recoilAlternator = 1;
  private smoothedHealWeight = 0;
  private healingPropGroup: THREE.Group | null = null;
  private healingPropParts: Partial<
    Record<'bandage' | 'medkit' | 'shield' | 'syringe' | 'drink', THREE.Object3D>
  > = {};
  private glooPropGroup: THREE.Group | null = null;
  private glooCoreMat: THREE.MeshStandardMaterial | null = null;
  private glooRingMat: THREE.MeshBasicMaterial | null = null;
  private glooHoldBlend = 0;
  private wasGlooHeld = false;
  private glooEquipTimer = 0;
  private glooEquipDuration = 0.2;
  private glooUnequipTimer = 0;
  private glooUnequipDuration = 0.18;
  private glooLastAccentHex = '#38bdf8';
  private readonly weaponSocketBasePos = new THREE.Vector3(0, -0.052, 0.072);
  private readonly weaponSocketBaseEuler = new THREE.Euler(WEAPON_SOCKET_BASE_ROT_X, 0, -0.06, 'YXZ');

  // Preallocated IK scratch vectors/quaternions/matrices
  private readonly ikChestPos = new THREE.Vector3();
  private readonly ikRigQuat = new THREE.Quaternion();
  private readonly ikStanceEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly ikStanceQuat = new THREE.Quaternion();
  private readonly ikDesiredWeaponQuat = new THREE.Quaternion();
  private readonly ikSocketQuatInv = new THREE.Quaternion();
  private readonly ikRightHandQuat = new THREE.Quaternion();
  private readonly ikRightPalmPos = new THREE.Vector3();
  private readonly ikRightWristPos = new THREE.Vector3();
  private readonly ikRightPoleDir = new THREE.Vector3();
  private readonly ikLeftPalmPos = new THREE.Vector3();
  private readonly ikLeftWristPos = new THREE.Vector3();
  private readonly ikLeftPoleDir = new THREE.Vector3();
  private readonly ikLeftHandQuat = new THREE.Quaternion();
  private readonly ikWeapRight = new THREE.Vector3();
  private readonly ikWeapUp = new THREE.Vector3();
  private readonly ikWeapFwd = new THREE.Vector3();
  private readonly ikHandX = new THREE.Vector3();
  private readonly ikHandY = new THREE.Vector3();
  private readonly ikHandZ = new THREE.Vector3();
  private readonly ikBasisMat = new THREE.Matrix4();
  private readonly ikTempVec = new THREE.Vector3();
  private readonly ikTempVec2 = new THREE.Vector3();
  private readonly ikTempQuat = new THREE.Quaternion();
  private readonly ikTempEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(assetManager: AssetManager) {
    this.customization = loadR6Customization();

    if (!SHARED_CONTACT_SHADOW_MAT) {
      const shadowTex = assetManager.createRadialShadowTexture();
      SHARED_CONTACT_SHADOW_MAT = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
    }

    this.contactShadowMesh = new THREE.Mesh(getSharedShadowGeo(), SHARED_CONTACT_SHADOW_MAT);
    this.contactShadowMesh.position.y = 0.015;
    this.root.add(this.contactShadowMesh);
    this.root.add(this.rigPivot);

    this.weaponSocket.position.set(0.0, -0.045, 0.048);
    this.weaponSocket.rotation.set(1.45, 0, 0);

    this.rebuildModel();
  }

  setHumanModelId(modelId: string): void {
    const resolved = getR6CharacterPreset(modelId).id;
    if (this.humanModelId === resolved && this.modelGroup) {
      return;
    }
    this.humanModelId = resolved;
    this.rebuildModel();
  }

  getHumanModelId(): string {
    return this.humanModelId;
  }

  setShadowCasting(enabled: boolean): void {
    if (this.shadowCastingEnabled === enabled) return;
    this.shadowCastingEnabled = enabled;
    for (let i = 0; i < this.shadowCastMeshes.length; i++) {
      this.shadowCastMeshes[i].castShadow = enabled;
    }
    for (let i = 0; i < this.overlayShadowMeshes.length; i++) {
      this.overlayShadowMeshes[i].castShadow = enabled;
    }
  }

  private setMicroDetailVisible(visible: boolean): void {
    if (this.microDetailVisible === visible) return;
    this.microDetailVisible = visible;
    for (let i = 0; i < this.overlayDetailMeshes.length; i++) {
      this.overlayDetailMeshes[i].visible = visible;
    }
  }

  getCustomization(): R6Customization {
    return { ...this.customization };
  }

  setCustomization(custom: R6Customization): void {
    this.customization = { ...custom };
    this.applyCustomizationMaterialsAndGear();
  }

  setArenaArmorTier(tier: 0 | 1 | 2 | 3 | null): void {
    this.setArenaGearVisuals(
      tier,
      tier === null ? null : this.arenaHelmetTierOverride,
      tier === null ? null : this.arenaBackpackTierOverride,
    );
  }

  setArenaGearVisuals(
    armorTier: 0 | 1 | 2 | 3 | null,
    helmetTier: 0 | 1 | 2 | 3 | null,
    backpackTier: 0 | 1 | 2 | 3 | null,
  ): void {
    if (
      this.arenaArmorTierOverride === armorTier &&
      this.arenaHelmetTierOverride === helmetTier &&
      this.arenaBackpackTierOverride === backpackTier
    ) {
      return;
    }
    const wasWearingHelmet =
      this.arenaHelmetTierOverride === 1 ||
      this.arenaHelmetTierOverride === 2 ||
      this.arenaHelmetTierOverride === 3;
    const isNowWearingHelmet =
      helmetTier === 1 || helmetTier === 2 || helmetTier === 3;

    this.arenaArmorTierOverride = armorTier;
    this.arenaHelmetTierOverride = helmetTier;
    this.arenaBackpackTierOverride = backpackTier;

    if (wasWearingHelmet !== isNowWearingHelmet) {
      this.applyCustomizationMaterialsAndGear();
    } else {
      this.rebuildTacticalGearOverlays();
    }
  }

  setAccentColors(primaryHex: string, visorHex: string): void {
    if (this.fighterPrimaryHex === primaryHex && this.fighterVisorHex === visorHex) {
      return;
    }
    this.fighterPrimaryHex = primaryHex;
    this.fighterVisorHex = visorHex;
    this.applyCustomizationMaterialsAndGear();
  }

  setModelScale(scale: number): void {
    const safeScale = Number.isFinite(scale) ? Math.max(0.25, scale) : 1.0;
    this.modelScale = safeScale;
    this.rigPivot.scale.setScalar(safeScale);
  }

  setPreviewYaw(yaw: number): void {
    this.targetPreviewYaw = yaw;
  }

  addPreviewYawDelta(deltaYaw: number): void {
    this.targetPreviewYaw += deltaYaw;
  }

  resetPreviewYaw(): void {
    this.targetPreviewYaw = 0;
    this.autoSpin = false;
  }

  setAutoSpin(enabled: boolean): void {
    this.autoSpin = enabled;
  }

  isAutoSpinEnabled(): boolean {
    return this.autoSpin;
  }

  private resolveWeaponId(mesh: THREE.Object3D | null, explicitId?: string | null): string | null {
    if (explicitId) return explicitId;
    if (!mesh) return null;
    if (typeof mesh.userData?.weaponId === 'string' && mesh.userData.weaponId) {
      return mesh.userData.weaponId;
    }
    if (mesh.name.startsWith('weapon_')) return mesh.name.slice('weapon_'.length);
    for (let i = 0; i < mesh.children.length; i++) {
      const child = mesh.children[i];
      if (typeof child.userData?.weaponId === 'string' && child.userData.weaponId) {
        return child.userData.weaponId;
      }
      if (child.name.startsWith('weapon_')) return child.name.slice('weapon_'.length);
    }
    return this.equippedWeaponId;
  }

  private applyWeaponSocketForId(weaponId: string | null): void {
    const prevId = this.equippedWeaponId;
    this.equippedWeaponId = weaponId;
    const profile = getWeaponGripProfile(weaponId);
    computeWeaponSocketTransform(profile, this.weaponSocketBasePos, this.weaponSocketBaseEuler);
    this.weaponSocket.position.copy(this.weaponSocketBasePos);
    this.weaponSocket.rotation.copy(this.weaponSocketBaseEuler);
    if (prevId !== weaponId) {
      this.hasInitializedStance = false;
    }
  }

  setEquippedWeaponId(weaponId: string | null): void {
    this.applyWeaponSocketForId(weaponId);
  }

  getEquippedWeaponId(): string | null {
    return this.equippedWeaponId;
  }

  attachWeaponMesh(
    mesh: THREE.Object3D | null,
    animateSwitch = true,
    weaponId?: string | null,
  ): void {
    this.switchStage = 0;
    this.pendingTargetHandMesh = mesh;
    this.pendingTargetBackMeshes.length = 0;
    const resolvedId = this.resolveWeaponId(mesh, weaponId);
    this.pendingTargetWeaponId = resolvedId;
    const prevMesh = this.attachedWeaponInstance;
    const prevEquipped = this.weaponEquipped;
    const nextEquipped = mesh !== null;

    if (prevMesh !== mesh || prevEquipped !== nextEquipped) {
      if (animateSwitch && (prevEquipped || nextEquipped)) {
        this.switchAnimDuration = 0.18;
        this.switchAnimTimer = this.switchAnimDuration;
      }
      this.attachedWeaponInstance = mesh;
      this.weaponEquipped = nextEquipped;
    }

    this.applyWeaponSocketForId(resolvedId);
    this.weaponSocket.clear();
    if (mesh) {
      mesh.removeFromParent();
      mesh.scale.setScalar(1);
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      this.weaponSocket.add(mesh);
      if (!animateSwitch) {
        this.hasInitializedStance = false;
      }
    }
  }

  transitionLoadout(
    targetHandMesh: THREE.Object3D | null,
    targetBackMeshes: readonly THREE.Object3D[],
    animate = true,
    targetWeaponId?: string | null,
  ): void {
    const dedupedBack: THREE.Object3D[] = [];
    for (let i = 0; i < targetBackMeshes.length && dedupedBack.length < 4; i++) {
      const m = targetBackMeshes[i];
      if (m !== targetHandMesh && !dedupedBack.includes(m)) {
        dedupedBack.push(m);
      }
    }

    // If currently in Stage 1 (outgoing stow hasn't reached back yet) and animating, seamlessly retarget
    if (this.switchStage === 1 && animate) {
      const curHand = this.attachedWeaponInstance;
      // Fast-cancel back to the weapon still in hand (e.g., rapid scroll A -> B -> A)
      if (curHand !== null && targetHandMesh === curHand) {
        const elapsedProgress = clamp(
          1 - this.switchAnimTimer / Math.max(0.01, this.switchAnimDuration),
          0,
          1,
        );
        this.pendingTargetHandMesh = curHand;
        this.pendingTargetWeaponId = this.resolveWeaponId(curHand, targetWeaponId);
        this.pendingTargetBackMeshes.length = 0;
        for (let i = 0; i < dedupedBack.length; i++) {
          this.pendingTargetBackMeshes.push(dedupedBack[i]);
        }
        this.setBackHolsteredWeaponsInternal(this.pendingTargetBackMeshes);
        this.switchAnimDuration = 0.14;
        this.switchAnimTimer = Math.max(0.02, 0.14 * elapsedProgress);
        this.switchStage = 2;
        return;
      }

      this.pendingTargetHandMesh = targetHandMesh;
      this.pendingTargetWeaponId = this.resolveWeaponId(targetHandMesh, targetWeaponId);
      this.pendingTargetBackMeshes.length = 0;
      for (let i = 0; i < dedupedBack.length; i++) {
        this.pendingTargetBackMeshes.push(dedupedBack[i]);
      }

      // Ensure incoming weapon and remaining stowed weapons stay mounted on the back while curHand finishes stowing
      this.switchIntermediateBackMeshes.length = 0;
      for (let i = 0; i < this.pendingTargetBackMeshes.length; i++) {
        const m = this.pendingTargetBackMeshes[i];
        if (m !== curHand && m !== targetHandMesh) {
          this.switchIntermediateBackMeshes.push(m);
        }
      }
      if (targetHandMesh && targetHandMesh !== curHand) {
        this.switchIntermediateBackMeshes.push(targetHandMesh);
      }
      this.setBackHolsteredWeaponsInternal(this.switchIntermediateBackMeshes);
      return;
    }

    if (this.switchStage !== 0) {
      this.commitLoadoutMeshes(
        this.pendingTargetHandMesh,
        this.pendingTargetBackMeshes,
        this.pendingTargetWeaponId,
      );
      this.switchStage = 0;
    }

    this.pendingTargetHandMesh = targetHandMesh;
    this.pendingTargetWeaponId = this.resolveWeaponId(targetHandMesh, targetWeaponId);
    this.pendingTargetBackMeshes.length = 0;
    for (let i = 0; i < dedupedBack.length; i++) {
      this.pendingTargetBackMeshes.push(dedupedBack[i]);
    }

    const prevHand = this.attachedWeaponInstance;
    if (!animate || prevHand === targetHandMesh) {
      this.switchAnimTimer = 0;
      this.switchStage = 0;
      this.commitLoadoutMeshes(
        targetHandMesh,
        this.pendingTargetBackMeshes,
        this.pendingTargetWeaponId,
      );
      if (!animate) {
        this.hasInitializedStance = false;
      }
      return;
    }

    // Case A: Stowing current weapon onto back -> going unarmed
    if (prevHand !== null && targetHandMesh === null) {
      const prevStowedToBack = this.pendingTargetBackMeshes.includes(prevHand);
      if (!prevStowedToBack) {
        this.switchAnimTimer = 0;
        this.switchStage = 0;
        this.commitLoadoutMeshes(null, this.pendingTargetBackMeshes, null);
        return;
      }
      this.switchIntermediateBackMeshes.length = 0;
      for (let i = 0; i < this.pendingTargetBackMeshes.length; i++) {
        const m = this.pendingTargetBackMeshes[i];
        if (m !== prevHand) this.switchIntermediateBackMeshes.push(m);
      }
      this.setBackHolsteredWeaponsInternal(this.switchIntermediateBackMeshes);
      this.switchAnimDuration = 0.14;
      this.switchAnimTimer = this.switchAnimDuration;
      this.switchStage = 1;
      return;
    }

    // Case B: Drawing weapon from back -> empty hands become armed
    if (prevHand === null && targetHandMesh !== null) {
      const wasOnBack = this.holsteredMeshes.includes(targetHandMesh);
      if (wasOnBack) {
        this.switchAnimDuration = 0.11;
        this.switchAnimTimer = this.switchAnimDuration;
        this.switchStage = 1;
        return;
      }
      this.commitLoadoutMeshes(
        targetHandMesh,
        this.pendingTargetBackMeshes,
        this.pendingTargetWeaponId,
      );
      this.switchAnimDuration = 0.16;
      this.switchAnimTimer = this.switchAnimDuration;
      this.switchStage = 2;
      return;
    }

    // Case C: Full weapon-to-weapon swap (outgoing goes to back, incoming comes from back to hands)
    if (prevHand !== null && targetHandMesh !== null) {
      const prevStowedToBack = this.pendingTargetBackMeshes.includes(prevHand);
      if (!prevStowedToBack) {
        this.commitLoadoutMeshes(
          targetHandMesh,
          this.pendingTargetBackMeshes,
          this.pendingTargetWeaponId,
        );
        this.switchAnimDuration = 0.16;
        this.switchAnimTimer = this.switchAnimDuration;
        this.switchStage = 2;
        return;
      }
      this.switchIntermediateBackMeshes.length = 0;
      for (let i = 0; i < this.pendingTargetBackMeshes.length; i++) {
        const m = this.pendingTargetBackMeshes[i];
        if (m !== prevHand && m !== targetHandMesh) {
          this.switchIntermediateBackMeshes.push(m);
        }
      }
      this.switchIntermediateBackMeshes.push(targetHandMesh);
      this.setBackHolsteredWeaponsInternal(this.switchIntermediateBackMeshes);
      this.switchAnimDuration = 0.14;
      this.switchAnimTimer = this.switchAnimDuration;
      this.switchStage = 1;
    }
  }

  private commitLoadoutMeshes(
    handMesh: THREE.Object3D | null,
    backMeshes: readonly THREE.Object3D[],
    weaponId?: string | null,
  ): void {
    // Guarantee zero duplicate / overlapping meshes between hand socket and back holster
    const cleanBack: THREE.Object3D[] = [];
    for (let i = 0; i < backMeshes.length && cleanBack.length < 4; i++) {
      const m = backMeshes[i];
      if (m !== handMesh && !cleanBack.includes(m)) {
        cleanBack.push(m);
      }
    }
    this.weaponSocket.clear();
    if (handMesh) {
      handMesh.removeFromParent();
    }
    this.setBackHolsteredWeaponsInternal(cleanBack);
    this.attachedWeaponInstance = handMesh;
    this.weaponEquipped = handMesh !== null;
    this.applyWeaponSocketForId(this.resolveWeaponId(handMesh, weaponId));
    if (handMesh) {
      handMesh.scale.setScalar(1);
      handMesh.position.set(0, 0, 0);
      handMesh.rotation.set(0, 0, 0);
      this.weaponSocket.add(handMesh);
    }
  }

  private setBackHolsteredWeaponsInternal(meshes: readonly THREE.Object3D[]): void {
    this.holsteredMeshes.length = 0;
    for (let i = 0; i < meshes.length && this.holsteredMeshes.length < 4; i++) {
      const m = meshes[i];
      if (!this.holsteredMeshes.includes(m)) {
        this.holsteredMeshes.push(m);
      }
    }
    this.rebuildBackHolster();
  }

  isWeaponEquipped(): boolean {
    return this.weaponEquipped;
  }

  getBackHolsteredCount(): number {
    return this.holsteredMeshes.length;
  }

  setBackHolsteredWeapons(meshes: readonly THREE.Object3D[]): void {
    this.switchStage = 0;
    this.pendingTargetBackMeshes.length = 0;
    this.setBackHolsteredWeaponsInternal(meshes);
  }

  private getBackSurfaceZ(): number {
    const bpTier = this.arenaBackpackTierOverride;
    if (bpTier === 1 || bpTier === 2 || bpTier === 3) {
      return -0.28 - bpTier * 0.03;
    }
    if (this.customization.accessoryId === 'backpack') {
      return -0.28;
    }
    if (
      this.customization.topId === 'hoodie_urban' ||
      this.customization.topId === 'hoodie_cyan'
    ) {
      return -0.22;
    }
    return -0.185;
  }

  private rebuildBackHolster(): void {
    this.backHolsterGroup.clear();
    if (this.holsteredMeshes.length === 0) return;

    const { strapGeo, claspGeo, railGeo, strapMat, metalMat } = getSharedGearGeos();
    const baseZ = this.getBackSurfaceZ();

    const harnessStrap = new THREE.Mesh(strapGeo, strapMat);
    harnessStrap.position.set(0, 0.05, baseZ + 0.018);
    harnessStrap.rotation.z = 0.68;
    harnessStrap.castShadow = this.shadowCastingEnabled;
    this.backHolsterGroup.add(harnessStrap);

    for (let i = 0; i < this.holsteredMeshes.length; i++) {
      const weaponMesh = this.holsteredMeshes[i];
      weaponMesh.removeFromParent();
      const wId = this.resolveWeaponId(weaponMesh);
      const backMount = getWeaponBackMountProfile(wId);

      const mount = new THREE.Group();
      const sideSign = i % 2 === 0 ? 1 : -1;
      const slotDepthOffset = i * -0.044;
      const slotYOffset = i === 0 ? 0.065 : i === 1 ? 0.018 : i === 2 ? -0.025 : -0.065;
      const slotXOffset = i === 0 ? 0.022 : i === 1 ? -0.022 : i === 2 ? 0.036 : -0.036;

      mount.position.set(slotXOffset, slotYOffset, baseZ + slotDepthOffset);
      mount.rotation.z = sideSign * 0.86;

      const rail = new THREE.Mesh(railGeo, metalMat);
      rail.position.set(0, 0, 0.014);
      const clasp = new THREE.Mesh(claspGeo, strapMat);
      clasp.position.set(0, 0.02, -0.006);
      mount.add(rail, clasp);

      const weaponHolder = new THREE.Group();
      weaponHolder.position.set(
        backMount.pos[0] * sideSign,
        backMount.pos[1],
        backMount.pos[2],
      );
      weaponHolder.rotation.set(
        backMount.rot[0],
        backMount.rot[1] * sideSign,
        backMount.rot[2] * sideSign,
        'YXZ',
      );
      weaponMesh.position.set(0, 0, 0);
      weaponMesh.rotation.set(0, 0, 0);
      weaponMesh.scale.setScalar(backMount.scale);
      weaponHolder.add(weaponMesh);

      mount.add(weaponHolder);
      this.backHolsterGroup.add(mount);
    }
  }

  private getEffectiveArmorId(): R6ArmorId {
    if (this.arenaArmorTierOverride !== null) {
      return getArmorIdFromTier(this.arenaArmorTierOverride);
    }
    return this.customization.armorId ?? DEFAULT_R6_CUSTOMIZATION.armorId;
  }

  private rebuildModel(): void {
    // Preserve attached weapons across model swaps
    const savedHandWeapon = this.attachedWeaponInstance;
    const savedBackWeapons = [...this.holsteredMeshes];
    this.weaponSocket.removeFromParent();
    this.glooPropGroup?.removeFromParent();
    this.backHolsterGroup.removeFromParent();
    this.headArmorGroup.removeFromParent();
    this.headAccessoryGroup.removeFromParent();
    this.torsoArmorGroup.removeFromParent();
    this.leftArmArmorGroup.removeFromParent();
    this.rightArmArmorGroup.removeFromParent();
    this.backAccessoryGroup.removeFromParent();

    this.disposeCurrentRig();

    const preset = getR6CharacterPreset(this.humanModelId);
    const built = buildR6CharacterModel(
      preset,
      this.customization,
      this.fighterPrimaryHex,
      this.fighterVisorHex,
    );
    this.builtR6 = built;
    const scene = built.root;

    this.modelGroup = scene;
    this.rigPivot.scale.setScalar(this.modelScale);
    this.rigPivot.add(scene);

    const bones: Partial<Record<string, THREE.Bone>> = {};
    this.shadowCastMeshes.length = 0;

    scene.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        const b = obj as THREE.Bone;
        bones[b.name] = b;
      }

      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = this.shadowCastingEnabled;
        m.receiveShadow = true;
        this.shadowCastMeshes.push(m);
      }
    });

    const foundHips = bones.Hips ?? null;
    const foundSpine = bones.Spine ?? null;
    const foundChest = bones.Chest ?? null;
    const foundNeck = bones.Neck ?? null;
    const foundHead = bones.Head ?? null;
    const foundLeftThigh = bones.LeftThigh ?? null;
    const foundLeftShin = bones.LeftShin ?? null;
    const foundLeftFoot = bones.LeftFoot ?? null;
    const foundRightThigh = bones.RightThigh ?? null;
    const foundRightShin = bones.RightShin ?? null;
    const foundRightFoot = bones.RightFoot ?? null;
    const foundLeftShoulder = bones.LeftShoulder ?? null;
    const foundLeftUpperArm = bones.LeftUpperArm ?? null;
    const foundLeftForearm = bones.LeftForearm ?? null;
    const foundLeftHand = bones.LeftHand ?? null;
    const foundRightShoulder = bones.RightShoulder ?? null;
    const foundRightUpperArm = bones.RightUpperArm ?? null;
    const foundRightForearm = bones.RightForearm ?? null;
    const foundRightHand = bones.RightHand ?? null;

    this.hipsBone = foundHips;
    this.spineBone = foundSpine;
    this.chestBone = foundChest;
    this.neckBone = foundNeck;
    this.headBone = foundHead;
    this.leftThighBone = foundLeftThigh;
    this.leftShinBone = foundLeftShin;
    this.leftFootBone = foundLeftFoot;
    this.rightThighBone = foundRightThigh;
    this.rightShinBone = foundRightShin;
    this.rightFootBone = foundRightFoot;

    // Verify true anatomical side by local X sign when facing +Z:
    // -X is anatomical RIGHT (trigger hand); +X is anatomical LEFT (support hand).
    const leftNamedIsNegativeX = foundLeftShoulder ? foundLeftShoulder.position.x < 0 : true;
    if (leftNamedIsNegativeX) {
      this.triggerShoulderBone = foundLeftShoulder;
      this.triggerUpperArmBone = foundLeftUpperArm;
      this.triggerForearmBone = foundLeftForearm;
      this.triggerHandBone = foundLeftHand;
      this.supportShoulderBone = foundRightShoulder;
      this.supportUpperArmBone = foundRightUpperArm;
      this.supportForearmBone = foundRightForearm;
      this.supportHandBone = foundRightHand;
    } else {
      this.triggerShoulderBone = foundRightShoulder;
      this.triggerUpperArmBone = foundRightUpperArm;
      this.triggerForearmBone = foundRightForearm;
      this.triggerHandBone = foundRightHand;
      this.supportShoulderBone = foundLeftShoulder;
      this.supportUpperArmBone = foundLeftUpperArm;
      this.supportForearmBone = foundLeftForearm;
      this.supportHandBone = foundLeftHand;
    }

    if (this.triggerShoulderBone) {
      this.triggerShoulderRestQuat.copy(this.triggerShoulderBone.quaternion);
    } else {
      this.triggerShoulderRestQuat.identity();
    }
    if (this.supportShoulderBone) {
      this.supportShoulderRestQuat.copy(this.supportShoulderBone.quaternion);
    } else {
      this.supportShoulderRestQuat.identity();
    }
    if (foundNeck) {
      this.neckRestQuat.copy(foundNeck.quaternion);
    } else {
      this.neckRestQuat.identity();
    }
    this.hasInitializedStance = false;

    // Attach weapon socket & healing prop mount directly to anatomical right trigger hand
    if (this.triggerHandBone) {
      this.triggerHandBone.add(this.weaponSocket);
      if (this.healingPropGroup) {
        this.triggerHandBone.add(this.healingPropGroup);
      }
      if (this.glooPropGroup) {
        this.triggerHandBone.add(this.glooPropGroup);
      }
    } else {
      scene.add(this.weaponSocket);
    }
    if (foundChest) {
      foundChest.add(this.torsoArmorGroup);
      foundChest.add(this.backAccessoryGroup);
      foundChest.add(this.backHolsterGroup);
    } else {
      scene.add(this.torsoArmorGroup, this.backAccessoryGroup, this.backHolsterGroup);
    }
    if (foundHead) {
      foundHead.add(this.headArmorGroup);
      foundHead.add(this.headAccessoryGroup);
    } else {
      scene.add(this.headArmorGroup, this.headAccessoryGroup);
    }
    if (foundLeftUpperArm) {
      foundLeftUpperArm.add(this.leftArmArmorGroup);
    }
    if (foundRightUpperArm) {
      foundRightUpperArm.add(this.rightArmArmorGroup);
    }

    // Bind R6 Idle clip immediately; combat/locomotion clips bind lazily on first arena/movement transition
    const idleClip = getR6IdleClip();
    this.mixer = new THREE.AnimationMixer(scene);
    this.actions.clear();
    this.activeAction = null;
    this.activeAnimState = null;
    this.fullClipsBound = false;

    const idleAction = this.bindSingleAnimationClip(idleClip);
    if (idleAction) {
      idleAction.reset().play();
      this.activeAction = idleAction;
      this.activeAnimState = 'Idle';
      this.mixer.update(0.016);
    }

    this.applyCustomizationMaterialsAndGear();

    // Restore attached weapons if any
    if (savedHandWeapon) {
      this.weaponSocket.clear();
      this.weaponSocket.add(savedHandWeapon);
      this.attachedWeaponInstance = savedHandWeapon;
      this.weaponEquipped = true;
      this.applyWeaponSocketForId(this.resolveWeaponId(savedHandWeapon, this.equippedWeaponId));
    }
    if (savedBackWeapons.length > 0) {
      this.setBackHolsteredWeaponsInternal(savedBackWeapons);
    }
  }

  private applyCustomizationMaterialsAndGear(): void {
    const preset = getR6CharacterPreset(this.humanModelId);
    const wearingHelmet =
      this.arenaHelmetTierOverride === 1 ||
      this.arenaHelmetTierOverride === 2 ||
      this.arenaHelmetTierOverride === 3;
    this.builtR6?.updateAppearance(
      preset,
      this.customization,
      this.fighterPrimaryHex,
      this.fighterVisorHex,
      { wearingHelmet },
    );
    this.rebuildTacticalGearOverlays();
  }

  private rebuildTacticalGearOverlays(): void {
    this.headArmorGroup.clear();
    this.headAccessoryGroup.clear();
    this.torsoArmorGroup.clear();
    this.leftArmArmorGroup.clear();
    this.rightArmArmorGroup.clear();
    this.backAccessoryGroup.clear();
    this.overlayShadowMeshes.length = 0;
    this.overlayDetailMeshes.length = 0;

    const geos = getSharedGearGeos();
    const effectiveArmorId = this.getEffectiveArmorId();

    // 1. Tactical Vest Overlays calibrated for R6 Chest (0.62w x 0.33d)
    if (effectiveArmorId !== 'none') {
      const tier: 1 | 2 | 3 =
        effectiveArmorId === 'nether_gold_lv3'
          ? 3
          : effectiveArmorId === 'diamond_lv2'
            ? 2
            : 1;
      const mats = getSharedVestMats(tier);

      const frontPlate = new THREE.Mesh(geos.vestPlate, mats.plateMat);
      frontPlate.position.set(0, 0.06, 0.185);
      frontPlate.castShadow = this.shadowCastingEnabled;
      const backPlate = new THREE.Mesh(geos.vestPlate, mats.plateMat);
      backPlate.position.set(0, 0.06, -0.185);
      backPlate.castShadow = this.shadowCastingEnabled;
      const emblem = new THREE.Mesh(geos.vestEmblem, tier >= 2 ? mats.glowMat : mats.trimMat);
      emblem.position.set(0, 0.12, 0.214);
      emblem.visible = this.microDetailVisible;
      this.overlayShadowMeshes.push(frontPlate, backPlate);
      this.overlayDetailMeshes.push(emblem);
      this.torsoArmorGroup.add(frontPlate, backPlate, emblem);

      if (tier >= 2) {
        // LeftUpperArm is +X, RightUpperArm is -X
        const lPauldron = new THREE.Mesh(geos.vestPauldron, mats.plateMat);
        lPauldron.position.set(0.032, 0.018, 0);
        lPauldron.rotation.z = -0.32;
        const rPauldron = new THREE.Mesh(geos.vestPauldron, mats.plateMat);
        rPauldron.position.set(-0.032, 0.018, 0);
        rPauldron.rotation.z = 0.32;
        this.leftArmArmorGroup.add(lPauldron);
        this.rightArmArmorGroup.add(rPauldron);
      }
    }

    // 2. Adaptive Ballistic Helmet Overlay (automatically measures head shape, eyes & glasses clearance)
    const helmetTier = this.arenaHelmetTierOverride;
    const hasHelmet = helmetTier === 1 || helmetTier === 2 || helmetTier === 3;
    if (hasHelmet) {
      const headProfile = this.builtR6
        ? this.builtR6.getHeadFitProfile()
        : this.headBone
          ? measureHeadFitProfile(this.headBone)
          : null;
      if (headProfile) {
        const builtHelmet = buildFittedHelmetAssembly(
          headProfile,
          helmetTier,
          this.shadowCastingEnabled,
          this.microDetailVisible,
        );
        for (let i = 0; i < builtHelmet.shadowMeshes.length; i++) {
          this.overlayShadowMeshes.push(builtHelmet.shadowMeshes[i]);
        }
        for (let i = 0; i < builtHelmet.detailMeshes.length; i++) {
          this.overlayDetailMeshes.push(builtHelmet.detailMeshes[i]);
        }
        this.headArmorGroup.add(builtHelmet.group);
      }
    }

    // 3. Tactical Backpack & Cape Overlays calibrated for R6 Chest
    const bpTier = this.arenaBackpackTierOverride;
    if (bpTier === 1 || bpTier === 2 || bpTier === 3) {
      const bm = getSharedBackpackMats(bpTier);
      const s = 0.88 + bpTier * 0.1;
      const packZ = -0.245 - bpTier * 0.022;
      const body = new THREE.Mesh(geos.packMain, bm.bodyMat);
      body.position.set(0, 0.04, packZ);
      body.scale.set(s * 1.12, s, s * 0.72);
      body.castShadow = this.shadowCastingEnabled;
      this.overlayShadowMeshes.push(body);

      const pouch = new THREE.Mesh(geos.packPouch, bm.trimMat);
      pouch.position.set(0, -0.05, packZ - 0.08 * s);
      pouch.scale.setScalar(s);
      pouch.visible = this.microDetailVisible;

      const roll = new THREE.Mesh(geos.packRoll, bm.trimMat);
      roll.position.set(0, 0.20 * s, packZ);
      roll.rotation.z = Math.PI / 2;
      roll.scale.setScalar(s);
      roll.visible = this.microDetailVisible;

      this.overlayDetailMeshes.push(pouch, roll);
      this.backAccessoryGroup.add(body, pouch, roll);
    } else if (this.customization.accessoryId === 'backpack') {
      const bm = getSharedBackpackMats(2);
      const body = new THREE.Mesh(geos.packMain, bm.bodyMat);
      body.position.set(0, 0.04, -0.255);
      body.scale.set(1.12, 0.96, 0.7);
      body.castShadow = this.shadowCastingEnabled;
      this.overlayShadowMeshes.push(body);
      const pouch = new THREE.Mesh(geos.packPouch, bm.trimMat);
      pouch.position.set(0, -0.05, -0.33);
      pouch.visible = this.microDetailVisible;
      this.overlayDetailMeshes.push(pouch);
      this.backAccessoryGroup.add(body, pouch);
    } else if (this.customization.accessoryId === 'cape') {
      const cape = new THREE.Mesh(geos.capeGeo, geos.capeMat);
      cape.position.set(0, -0.18, -0.195);
      cape.rotation.x = 0.12;
      cape.castShadow = this.shadowCastingEnabled;
      this.overlayShadowMeshes.push(cape);
      this.backAccessoryGroup.add(cape);
    }

    // 4. Optional Custom Accessory Overlay (Visor / Headset / Shades / Crown)
    // Suppress crown/headphones when wearing an arena ballistic helmet, and suppress redundant shades when helmet >= 2 has a visor
    const helmetHasVisor = helmetTier === 2 || helmetTier === 3;
    if (
      this.customization.accessoryId === 'shades' &&
      this.customization.glassesId === 'none' &&
      !helmetHasVisor
    ) {
      const visor = new THREE.Mesh(
        geos.shadesVisor,
        getSharedVisorMat(this.fighterVisorHex),
      );
      visor.position.set(0, 0.20, 0.015);
      visor.scale.set(0.92, 0.85, 0.96);
      visor.renderOrder = 2;
      this.headAccessoryGroup.add(visor);
    } else if (this.customization.accessoryId === 'crown' && !hasHelmet) {
      const crown = new THREE.Mesh(geos.crownBandGeo, geos.goldMat);
      crown.position.set(0, 0.405, 0);
      crown.castShadow = this.shadowCastingEnabled;
      this.overlayShadowMeshes.push(crown);
      this.headAccessoryGroup.add(crown);
    } else if (this.customization.accessoryId === 'headphones' && !hasHelmet) {
      const cupL = new THREE.Mesh(geos.headphoneCup, geos.metalMat);
      cupL.position.set(0.215, 0.19, 0);
      cupL.rotation.z = Math.PI / 2;
      const cupR = new THREE.Mesh(geos.headphoneCup, geos.metalMat);
      cupR.position.set(-0.215, 0.19, 0);
      cupR.rotation.z = Math.PI / 2;
      const band = new THREE.Mesh(geos.headphoneBand, geos.strapMat);
      band.position.set(0, 0.20, 0);
      this.headAccessoryGroup.add(cupL, cupR, band);
    }

    this.rebuildBackHolster();
  }

  private resolveBaseLocomotionState(snapshot: PlayerStateSnapshot): PlayerAnimationState {
    const s = snapshot.animationState;
    if (s !== 'Shoot' && s !== 'Reload' && s !== 'PunchLeft' && s !== 'PunchRight') {
      return s;
    }
    if (!snapshot.isAlive) return 'Death';
    if (!snapshot.isGrounded) {
      return snapshot.velocity.y > 0.4 ? 'Jump' : 'Fall';
    }
    if (snapshot.isProne) {
      const sp = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
      return sp > 0.18 ? 'ProneMove' : 'ProneIdle';
    }
    const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
    if (snapshot.isCrouching) {
      return horizSpeed > 0.18 ? 'CrouchWalk' : 'CrouchIdle';
    }
    if (horizSpeed > 0.25) {
      return snapshot.isSprinting && !snapshot.isAiming && horizSpeed > snapshot.movementSpeed * 0.96
        ? 'Run'
        : 'Walk';
    }
    return 'Idle';
  }

  private resolveActiveOverlay(
    snapshot: PlayerStateSnapshot,
  ): 'Shoot' | 'Reload' | 'PunchLeft' | 'PunchRight' | null {
    if (snapshot.healingState?.active || !snapshot.isAlive) return null;
    if (snapshot.activeAction) return snapshot.activeAction;
    const s = snapshot.animationState;
    if (s === 'Shoot' || s === 'Reload' || s === 'PunchLeft' || s === 'PunchRight') {
      return s;
    }
    return null;
  }

  private bindSingleAnimationClip(clip: THREE.AnimationClip): THREE.AnimationAction | null {
    if (!this.mixer) return null;
    const stateName = clip.name as PlayerAnimationState;
    const existing = this.actions.get(stateName);
    if (existing) return existing;
    const action = this.mixer.clipAction(clip);
    if (
      stateName === 'Death' ||
      stateName === 'Vault' ||
      stateName === 'Jump' ||
      stateName === 'Land'
    ) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else if (stateName === 'PunchLeft' || stateName === 'PunchRight') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
    }
    this.actions.set(stateName, action);
    return action;
  }

  ensureAllAnimationClipsBound(): void {
    if (this.fullClipsBound || !this.mixer) return;
    this.fullClipsBound = true;
    const clips = Object.values(getR6AnimationClips());
    for (let i = 0; i < clips.length; i++) {
      this.bindSingleAnimationClip(clips[i]);
    }
  }

  private updateLocomotionAndOverlayMixer(
    snapshot: PlayerStateSnapshot,
    delta: number,
  ): PlayerAnimationState {
    const baseState = this.resolveBaseLocomotionState(snapshot);
    const overlay = this.resolveActiveOverlay(snapshot);
    const idleAction = this.actions.get('Idle');
    if (!this.fullClipsBound) {
      if (!snapshot.isLobby || baseState !== 'Idle' || overlay !== null || Boolean(snapshot.activeEmoteId)) {
        this.ensureAllAnimationClipsBound();
      } else if (idleAction) {
        idleAction.enabled = true;
        idleAction.stopFading();
        idleAction.setEffectiveTimeScale(1.0);
        idleAction.setEffectiveWeight(1.0);
        if (!idleAction.isRunning()) idleAction.play();
        this.activeAction = idleAction;
        this.activeAnimState = 'Idle';
        return 'Idle';
      }
    }

    const walkAction = this.actions.get('Walk');
    const runAction = this.actions.get('Run');
    const crouchIdleAction = this.actions.get('CrouchIdle');
    const crouchWalkAction = this.actions.get('CrouchWalk');

    if (snapshot.activeEmoteId && snapshot.isAlive && baseState !== 'Death') {
      let emoteAction = this.emoteActions.get(snapshot.activeEmoteId) ?? null;
      if (!emoteAction && this.mixer) {
        const clip = getR6EmoteClip(snapshot.activeEmoteId);
        if (clip) {
          emoteAction = this.mixer.clipAction(clip);
          emoteAction.setLoop(THREE.LoopOnce, 1);
          emoteAction.clampWhenFinished = true;
          this.emoteActions.set(snapshot.activeEmoteId, emoteAction);
        }
      }
      if (emoteAction) {
        if (this.activeOverlayAction) {
          this.activeOverlayAction.fadeOut(0.08);
          this.activeOverlayAction = null;
          this.activeOverlayState = null;
        }
        const seq = snapshot.emoteSeq ?? 0;
        if (this.activeEmoteId !== snapshot.activeEmoteId || this.activeEmoteSeq !== seq) {
          const prevAction = this.activeEmoteAction ?? this.activeAction ?? idleAction ?? null;
          if (walkAction && walkAction !== prevAction) walkAction.stopFading().setEffectiveWeight(0);
          if (runAction && runAction !== prevAction) runAction.stopFading().setEffectiveWeight(0);
          if (crouchIdleAction && crouchIdleAction !== prevAction) {
            crouchIdleAction.stopFading().setEffectiveWeight(0);
          }
          if (crouchWalkAction && crouchWalkAction !== prevAction) {
            crouchWalkAction.stopFading().setEffectiveWeight(0);
          }
          if (idleAction && idleAction !== prevAction) {
            idleAction.stopFading().setEffectiveWeight(0);
          }
          this.smoothedIdleWeight = 0;
          this.smoothedWalkWeight = 0;
          this.smoothedRunWeight = 0;
          this.smoothedCrouchIdleWeight = 0;
          this.smoothedCrouchWalkWeight = 0;
          this.crouchClipWeight = 0;

          emoteAction.enabled = true;
          emoteAction.stopFading().reset().setEffectiveTimeScale(1.0).setEffectiveWeight(1.0).play();
          if (prevAction && prevAction !== emoteAction) {
            emoteAction.crossFadeFrom(prevAction, 0.16, false);
          }
          this.activeEmoteAction = emoteAction;
          this.activeEmoteId = snapshot.activeEmoteId;
          this.activeEmoteSeq = seq;
          this.activeAction = emoteAction;
          this.activeAnimState = 'Idle';
        }
        return 'Idle';
      }
    } else if (this.activeEmoteAction) {
      const fadingEmote = this.activeEmoteAction;
      this.activeEmoteAction = null;
      this.activeEmoteId = null;
      fadingEmote.fadeOut(0.2);
      if (idleAction) {
        idleAction.enabled = true;
        idleAction.stopFading().reset().setEffectiveTimeScale(1.0).setEffectiveWeight(0.05).play();
        this.smoothedIdleWeight = 0.05;
        this.smoothedWalkWeight = 0;
        this.smoothedRunWeight = 0;
        this.smoothedCrouchIdleWeight = 0;
        this.smoothedCrouchWalkWeight = 0;
        this.crouchClipWeight = 0;
        this.activeAction = idleAction;
        this.activeAnimState = 'Idle';
        return 'Idle';
      }
    }

    const isGroundLoco =
      baseState === 'Idle' ||
      baseState === 'Walk' ||
      baseState === 'Run' ||
      baseState === 'CrouchIdle' ||
      baseState === 'CrouchWalk';

    if (baseState === 'SwimIdle' || baseState === 'SwimMove') {
      // Fade out any lingering ground weights and play swimming loop smoothly
      const fadeSec = 0.16;
      if (this.outgoingNonLocoAction) {
        this.outgoingNonLocoAction.fadeOut(fadeSec);
        this.outgoingNonLocoAction = null;
        this.outgoingNonLocoWeight = 0;
      }
      if (idleAction && idleAction !== this.activeAction && idleAction.getEffectiveWeight() > 0.001) {
        idleAction.fadeOut(fadeSec);
      }
      if (walkAction && walkAction !== this.activeAction && walkAction.getEffectiveWeight() > 0.001) {
        walkAction.fadeOut(fadeSec);
      }
      if (runAction && runAction !== this.activeAction && runAction.getEffectiveWeight() > 0.001) {
        runAction.fadeOut(fadeSec);
      }
      if (
        crouchIdleAction &&
        crouchIdleAction !== this.activeAction &&
        crouchIdleAction.getEffectiveWeight() > 0.001
      ) {
        crouchIdleAction.fadeOut(fadeSec);
      }
      if (
        crouchWalkAction &&
        crouchWalkAction !== this.activeAction &&
        crouchWalkAction.getEffectiveWeight() > 0.001
      ) {
        crouchWalkAction.fadeOut(fadeSec);
      }
      this.smoothedIdleWeight = 0;
      this.smoothedWalkWeight = 0;
      this.smoothedRunWeight = 0;
      this.smoothedCrouchIdleWeight = 0;
      this.smoothedCrouchWalkWeight = 0;
      this.crouchClipWeight = 0;
      this.groundLocoMasterWeight = 1;

      this.playAnimState(baseState, fadeSec);
      if (this.activeAction) {
        const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
        this.activeAction.setEffectiveTimeScale(
          baseState === 'SwimMove' ? clamp(horizSpeed / 3.4, 0.75, 1.35) : 1.0,
        );
      }
    } else if (
      isGroundLoco &&
      idleAction &&
      walkAction &&
      runAction &&
      crouchIdleAction &&
      crouchWalkAction
    ) {
      const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
      const walkNominal = Math.max(1, snapshot.movementSpeed);
      const runNominal = Math.max(walkNominal + 0.5, snapshot.sprintSpeed);
      const crouchNominal = Math.max(0.8, walkNominal * 0.56);

      let targetIdleW = 0;
      let targetWalkW = 0;
      let targetRunW = 0;
      let targetCrouchIdleW = 0;
      let targetCrouchWalkW = 0;

      if (baseState === 'CrouchIdle') {
        targetCrouchIdleW = 1;
      } else if (baseState === 'CrouchWalk') {
        if (horizSpeed <= 0.14) {
          // Remote player snapshot may lack velocity vector while broadcasting CrouchWalk state
          targetCrouchWalkW = 1;
        } else {
          const crouchRamp = clamp((horizSpeed - 0.14) / (crouchNominal * 0.42), 0.35, 1);
          targetCrouchWalkW = crouchRamp;
          targetCrouchIdleW = 1 - crouchRamp;
        }
      } else if (baseState === 'Idle' || horizSpeed <= 0.18) {
        targetIdleW = 1;
      } else if (baseState === 'Walk') {
        const ramp = clamp((horizSpeed - 0.18) / (walkNominal * 0.36), 0.25, 1);
        targetWalkW = ramp;
        targetIdleW = 1 - ramp;
      } else {
        const runRamp = clamp(
          (horizSpeed - walkNominal * 0.85) / Math.max(0.5, runNominal - walkNominal * 0.85),
          0.35,
          1,
        );
        targetRunW = runRamp;
        targetWalkW = 1 - runRamp;
      }

      // If switching from non-locomotion state (Jump/Fall/Land/Vault/Prone), smoothly transfer weight without popping
      if (
        this.activeAction &&
        this.activeAnimState !== 'Idle' &&
        this.activeAnimState !== 'Walk' &&
        this.activeAnimState !== 'Run' &&
        this.activeAnimState !== 'CrouchIdle' &&
        this.activeAnimState !== 'CrouchWalk'
      ) {
        if (this.outgoingNonLocoAction && this.outgoingNonLocoAction !== this.activeAction) {
          this.outgoingNonLocoAction.stopFading().setEffectiveWeight(0);
        }
        this.outgoingNonLocoAction = this.activeAction;
        this.outgoingNonLocoWeight = clamp(this.activeAction.getEffectiveWeight(), 0.05, 1.0);
        this.outgoingNonLocoAction.stopFading();
        this.smoothedIdleWeight = targetIdleW;
        this.smoothedWalkWeight = targetWalkW;
        this.smoothedRunWeight = targetRunW;
        this.smoothedCrouchIdleWeight = targetCrouchIdleW;
        this.smoothedCrouchWalkWeight = targetCrouchWalkW;
      }

      if (this.outgoingNonLocoAction && this.outgoingNonLocoWeight > 0.002) {
        this.outgoingNonLocoWeight = damp(this.outgoingNonLocoWeight, 0, 18, delta);
        if (this.outgoingNonLocoWeight <= 0.004) {
          this.outgoingNonLocoAction.stopFading().setEffectiveWeight(0);
          this.outgoingNonLocoAction = null;
          this.outgoingNonLocoWeight = 0;
          this.groundLocoMasterWeight = 1;
        } else {
          this.outgoingNonLocoAction.enabled = true;
          this.outgoingNonLocoAction.setEffectiveWeight(this.outgoingNonLocoWeight);
          this.groundLocoMasterWeight = 1 - this.outgoingNonLocoWeight;
        }
      } else {
        this.groundLocoMasterWeight = 1;
      }

      const rate =
        baseState === 'Idle' || baseState === 'CrouchIdle' ? 12 : 14;
      this.smoothedIdleWeight = damp(this.smoothedIdleWeight, targetIdleW, rate, delta);
      this.smoothedWalkWeight = damp(this.smoothedWalkWeight, targetWalkW, rate, delta);
      this.smoothedRunWeight = damp(this.smoothedRunWeight, targetRunW, rate, delta);
      this.smoothedCrouchIdleWeight = damp(
        this.smoothedCrouchIdleWeight,
        targetCrouchIdleW,
        rate,
        delta,
      );
      this.smoothedCrouchWalkWeight = damp(
        this.smoothedCrouchWalkWeight,
        targetCrouchWalkW,
        rate,
        delta,
      );

      const sumW =
        this.smoothedIdleWeight +
        this.smoothedWalkWeight +
        this.smoothedRunWeight +
        this.smoothedCrouchIdleWeight +
        this.smoothedCrouchWalkWeight;
      const invSum = sumW > 1e-4 ? 1 / sumW : 1;
      const masterW = this.groundLocoMasterWeight;
      const wIdle = this.smoothedIdleWeight * invSum * masterW;
      const wWalk = this.smoothedWalkWeight * invSum * masterW;
      const wRun = this.smoothedRunWeight * invSum * masterW;
      const wCrouchIdle = this.smoothedCrouchIdleWeight * invSum * masterW;
      const wCrouchWalk = this.smoothedCrouchWalkWeight * invSum * masterW;
      this.crouchClipWeight = (this.smoothedCrouchIdleWeight + this.smoothedCrouchWalkWeight) * invSum;

      idleAction.enabled = true;
      walkAction.enabled = true;
      runAction.enabled = true;
      crouchIdleAction.enabled = true;
      crouchWalkAction.enabled = true;
      idleAction.stopFading();
      walkAction.stopFading();
      runAction.stopFading();
      crouchIdleAction.stopFading();
      crouchWalkAction.stopFading();
      if (!idleAction.isRunning()) idleAction.play();
      if (!walkAction.isRunning()) walkAction.play();
      if (!runAction.isRunning()) runAction.play();
      if (!crouchIdleAction.isRunning()) crouchIdleAction.play();
      if (!crouchWalkAction.isRunning()) crouchWalkAction.play();

      // Lock normalized stride phase across Walk (0.88s), Run (0.56s), and CrouchWalk (0.92s) so legs never scissor
      const movingCount =
        (wWalk > 0.01 ? 1 : 0) + (wRun > 0.01 ? 1 : 0) + (wCrouchWalk > 0.01 ? 1 : 0);
      if (movingCount >= 2) {
        let masterPhase = 0;
        if (wRun >= wWalk && wRun >= wCrouchWalk) {
          masterPhase = (runAction.time % 0.56) / 0.56;
        } else if (wCrouchWalk >= wWalk && wCrouchWalk >= wRun) {
          masterPhase = (crouchWalkAction.time % 0.92) / 0.92;
        } else {
          masterPhase = (walkAction.time % 0.88) / 0.88;
        }
        if (masterPhase < 0) masterPhase += 1;
        if (wWalk > 0.01 && !(wWalk >= wRun && wWalk >= wCrouchWalk)) {
          walkAction.time = masterPhase * 0.88;
        }
        if (wRun > 0.01 && !(wRun >= wWalk && wRun >= wCrouchWalk)) {
          runAction.time = masterPhase * 0.56;
        }
        if (wCrouchWalk > 0.01 && !(wCrouchWalk >= wWalk && wCrouchWalk >= wRun)) {
          crouchWalkAction.time = masterPhase * 0.92;
        }
      }

      // Speed-matched playback rate so shoe ground travel matches horizontal velocity (zero skating)
      const targetWalkScale = clamp(
        horizSpeed / Math.max(1.8, walkNominal * Math.max(0.45, wWalk + 0.2)),
        0.52,
        1.32,
      );
      const targetRunScale = clamp(horizSpeed / Math.max(1, runNominal), 0.72, 1.35);
      const targetCrouchWalkScale =
        horizSpeed <= 0.14
          ? 1.0
          : clamp(
              horizSpeed / Math.max(1.1, crouchNominal * Math.max(0.45, wCrouchWalk + 0.2)),
              0.55,
              1.35,
            );
      this.smoothedWalkTimeScale = damp(this.smoothedWalkTimeScale, targetWalkScale, 14, delta);
      this.smoothedRunTimeScale = damp(this.smoothedRunTimeScale, targetRunScale, 14, delta);
      this.smoothedCrouchWalkTimeScale = damp(
        this.smoothedCrouchWalkTimeScale,
        targetCrouchWalkScale,
        14,
        delta,
      );

      idleAction.setEffectiveTimeScale(1.0);
      walkAction.setEffectiveTimeScale(this.smoothedWalkTimeScale);
      runAction.setEffectiveTimeScale(this.smoothedRunTimeScale);
      crouchIdleAction.setEffectiveTimeScale(1.0);
      crouchWalkAction.setEffectiveTimeScale(this.smoothedCrouchWalkTimeScale);

      idleAction.setEffectiveWeight(wIdle);
      walkAction.setEffectiveWeight(wWalk);
      runAction.setEffectiveWeight(wRun);
      crouchIdleAction.setEffectiveWeight(wCrouchIdle);
      crouchWalkAction.setEffectiveWeight(wCrouchWalk);

      let domAction = idleAction;
      let domW = wIdle;
      if (wWalk > domW) {
        domW = wWalk;
        domAction = walkAction;
      }
      if (wRun > domW) {
        domW = wRun;
        domAction = runAction;
      }
      if (wCrouchIdle > domW) {
        domW = wCrouchIdle;
        domAction = crouchIdleAction;
      }
      if (wCrouchWalk > domW) {
        domAction = crouchWalkAction;
      }
      this.activeAction = domAction;
      this.activeAnimState = baseState;
    } else {
      // Non-locomotion state (Jump, Fall, Land, ProneIdle, ProneMove, Skydive, Parachute, Vault, Sit, Death)
      const fadeSec =
        baseState === 'ProneIdle' || baseState === 'ProneMove'
          ? 0.2
          : baseState === 'Land'
            ? 0.08
            : baseState === 'Jump'
              ? 0.09
              : 0.14;

      if (this.activeAnimState !== baseState) {
        const nextAction = this.actions.get(baseState) ?? null;
        if (this.outgoingNonLocoAction && this.outgoingNonLocoAction !== nextAction) {
          if (this.outgoingNonLocoAction.getEffectiveWeight() > 0.001) {
            this.outgoingNonLocoAction.fadeOut(fadeSec);
          } else {
            this.outgoingNonLocoAction.stopFading().setEffectiveWeight(0);
          }
          this.outgoingNonLocoAction = null;
          this.outgoingNonLocoWeight = 0;
        }
        // Fade out all active ground locomotion weights cleanly from their current blended values (no snap)
        const locoList = [idleAction, walkAction, runAction, crouchIdleAction, crouchWalkAction];
        for (let i = 0; i < locoList.length; i++) {
          const act = locoList[i];
          if (act && act !== nextAction) {
            if (act.getEffectiveWeight() > 0.001) {
              act.fadeOut(fadeSec);
            } else {
              act.stopFading().setEffectiveWeight(0);
            }
          }
        }
        this.smoothedIdleWeight = 0;
        this.smoothedWalkWeight = 0;
        this.smoothedRunWeight = 0;
        this.smoothedCrouchIdleWeight = 0;
        this.smoothedCrouchWalkWeight = 0;
        this.crouchClipWeight = 0;
        this.groundLocoMasterWeight = 1;

        this.playAnimState(baseState, fadeSec);
      }

      if (this.activeAction) {
        const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
        if (this.activeAnimState === 'ProneMove') {
          const targetScale = clamp(
            horizSpeed / Math.max(0.8, snapshot.movementSpeed * 0.38),
            0.55,
            1.35,
          );
          this.smoothedProneTimeScale = damp(this.smoothedProneTimeScale, targetScale, 12, delta);
          this.activeAction.setEffectiveTimeScale(this.smoothedProneTimeScale);
        } else if (this.activeAnimState === 'Vault') {
          const modeScale =
            snapshot.vaultMode === 'jump'
              ? 0.52 / 0.34
              : snapshot.vaultMode === 'walk'
                ? 0.52 / 0.50
                : 0.52 / 0.38;
          this.activeAction.setEffectiveTimeScale(modeScale);
        } else {
          this.activeAction.setEffectiveTimeScale(1.0);
        }
      }
    }

    // Layer upper-body-only action overlays (Shoot / Reload / PunchLeft / PunchRight) cleanly without freezing legs
    const allowOverlay =
      overlay !== null &&
      baseState !== 'Death' &&
      baseState !== 'Skydive' &&
      baseState !== 'Parachute' &&
      baseState !== 'SwimIdle' &&
      baseState !== 'SwimMove' &&
      baseState !== 'Vault' &&
      baseState !== 'Zipline' &&
      baseState !== 'Sit';

    if (allowOverlay && overlay) {
      const nextOverlay = this.actions.get(overlay) ?? null;
      if (nextOverlay) {
        if (this.activeOverlayAction && this.activeOverlayAction !== nextOverlay) {
          this.activeOverlayAction.fadeOut(0.08);
        }
        if (this.activeOverlayState !== overlay) {
          nextOverlay.enabled = true;
          nextOverlay.stopFading().reset().play();
          nextOverlay.fadeIn(0.06);
          this.activeOverlayAction = nextOverlay;
          this.activeOverlayState = overlay;
        } else {
          nextOverlay.enabled = true;
          nextOverlay.stopFading();
          if (!nextOverlay.isRunning()) nextOverlay.play();
        }
        // Higher relative weight affects ONLY upper-body tracks in Shoot/Reload/Punch clips; legs remain 100% locomotion!
        const overlayInfluence =
          overlay === 'PunchLeft' || overlay === 'PunchRight'
            ? 3.8
            : overlay === 'Reload'
              ? 2.2
              : 0.75;
        nextOverlay.setEffectiveWeight(overlayInfluence);
      }
    } else if (this.activeOverlayAction) {
      this.activeOverlayAction.fadeOut(0.08);
      this.activeOverlayAction = null;
      this.activeOverlayState = null;
    }

    return baseState;
  }

  private playAnimState(state: PlayerAnimationState, fadeSec: number): void {
    if (this.activeAnimState === state && this.activeAction) return;
    const nextAction = this.actions.get(state) ?? this.actions.get('Idle');
    if (!nextAction) return;

    const prevAction = this.activeAction;
    if (
      prevAction &&
      prevAction !== nextAction &&
      prevAction !== this.actions.get('Idle') &&
      prevAction !== this.actions.get('Walk') &&
      prevAction !== this.actions.get('Run') &&
      prevAction !== this.actions.get('CrouchIdle') &&
      prevAction !== this.actions.get('CrouchWalk')
    ) {
      if (prevAction.getEffectiveWeight() > 0.001) {
        prevAction.fadeOut(fadeSec);
      } else {
        prevAction.stopFading().setEffectiveWeight(0);
      }
    }

    nextAction.enabled = true;
    nextAction.stopFading().setEffectiveWeight(1.0);
    if (
      state === 'Death' ||
      state === 'Vault' ||
      state === 'Jump' ||
      state === 'Land' ||
      state === 'PunchLeft' ||
      state === 'PunchRight'
    ) {
      nextAction.reset();
    }
    nextAction.play();
    if (prevAction && prevAction !== nextAction) {
      nextAction.fadeIn(fadeSec);
    }
    this.activeAction = nextAction;
    this.activeAnimState = state;
  }

  private resolveStanceKind(
    snapshot: PlayerStateSnapshot,
    baseState: PlayerAnimationState,
  ): WeaponStanceKind {
    if (snapshot.isLobby && baseState === 'Idle') {
      return 'lobby';
    }
    const isShooting =
      snapshot.activeAction === 'Shoot' || snapshot.animationState === 'Shoot';
    if (
      snapshot.isProne &&
      snapshot.isGrounded &&
      baseState !== 'Skydive' &&
      baseState !== 'Parachute' &&
      baseState !== 'Sit' &&
      baseState !== 'Vault' &&
      baseState !== 'Zipline' &&
      baseState !== 'Death'
    ) {
      return snapshot.isAiming || isShooting ? 'prone_aim' : 'prone';
    }
    if (!snapshot.isGrounded || baseState === 'Jump' || baseState === 'Fall') {
      return 'jump';
    }
    if (
      snapshot.isCrouching &&
      baseState !== 'Skydive' &&
      baseState !== 'Parachute' &&
      baseState !== 'Sit' &&
      baseState !== 'Vault' &&
      baseState !== 'Zipline' &&
      baseState !== 'Death'
    ) {
      return snapshot.isAiming || isShooting ? 'crouch_aim' : 'crouch';
    }
    if (snapshot.isAiming || isShooting) {
      return 'aim';
    }
    if (baseState === 'Run') {
      return 'run';
    }
    if (baseState === 'Walk') {
      return 'walk';
    }
    return 'idle';
  }

  private computeReloadLeftIkWeight(snapshot: PlayerStateSnapshot): number {
    const isReloading =
      snapshot.animationState === 'Reload' || snapshot.activeAction === 'Reload';
    if (!isReloading) return 1;
    const p = clamp(snapshot.reloadProgress ?? 0, 0, 1);
    if (p <= 0.02 || p >= 0.96) return 1;
    if (p < 0.16) return 1 - (p - 0.02) / 0.14;
    if (p < 0.72) return 0.1;
    return 0.1 + ((p - 0.72) / 0.24) * 0.9;
  }

  private ensureHealingProps(): void {
    if (this.healingPropGroup) return;
    const h = getSharedHealingAssets();
    const root = new THREE.Group();
    root.name = 'HealingProps';
    root.visible = false;

    const medkit = new THREE.Group();
    const mkBody = new THREE.Mesh(h.mkBodyGeo, h.mkBodyMat);
    const mkCrossH = new THREE.Mesh(h.mkCrossHGeo, h.mkCrossMat);
    mkCrossH.position.set(0, 0.048, 0);
    const mkCrossV = new THREE.Mesh(h.mkCrossVGeo, h.mkCrossMat);
    mkCrossV.position.set(0, 0.048, 0);
    medkit.add(mkBody, mkCrossH, mkCrossV);

    const bandage = new THREE.Mesh(h.bandageGeo, h.bandageMat);
    bandage.rotation.z = Math.PI / 2;

    const shield = new THREE.Mesh(h.shieldGeo, h.shieldMat);
    const syringe = new THREE.Mesh(h.syringeGeo, h.syringeMat);
    const drink = new THREE.Mesh(h.drinkGeo, h.drinkMat);

    root.add(medkit, bandage, shield, syringe, drink);
    root.position.set(0.01, -0.06, 0.05);
    this.healingPropParts = { medkit, bandage, shield, syringe, drink };
    this.healingPropGroup = root;
    if (this.triggerHandBone) {
      this.triggerHandBone.add(root);
    }
  }

  private applyHealingPoseAndArmIK(
    healing: NonNullable<PlayerStateSnapshot['healingState']>,
    delta: number,
    elapsed: number,
  ): void {
    if (
      !this.chestBone ||
      !this.spineBone ||
      !this.triggerUpperArmBone ||
      !this.triggerForearmBone ||
      !this.triggerHandBone ||
      !this.supportUpperArmBone ||
      !this.supportForearmBone ||
      !this.supportHandBone
    ) {
      return;
    }

    this.ensureHealingProps();
    if (this.healingPropGroup) {
      this.healingPropGroup.visible = true;
      for (const key of ['bandage', 'medkit', 'shield', 'syringe', 'drink'] as const) {
        const part = this.healingPropParts[key];
        if (part) part.visible = key === healing.kind;
      }
    }

    const w = this.smoothedHealWeight;
    const phase = elapsed * 5.4;

    // Gentle forward head & chest focus toward torso/forearm while keeping legs walking/standing
    this.ikTempEuler.set(0.08 * w, 0, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.spineBone.quaternion.multiply(this.ikTempQuat);

    this.ikTempEuler.set(0.11 * w, 0, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.chestBone.quaternion.multiply(this.ikTempQuat);

    if (this.headBone) {
      const headPitch = healing.kind === 'drink' ? -0.14 : 0.18;
      this.ikTempEuler.set(headPitch * w, 0, 0, 'YXZ');
      this.ikTempQuat.setFromEuler(this.ikTempEuler);
      this.headBone.quaternion.multiply(this.ikTempQuat);
    }

    updateWorldMatrixChain(null, this.chestBone);
    this.chestBone.getWorldPosition(this.ikChestPos);
    this.rigPivot.getWorldQuaternion(this.ikRigQuat);
    const totalScale = this.modelScale * (this.modelGroup ? this.modelGroup.scale.y : 1);

    // Left support hand position (braces forearm/chest) & Right hand applying item
    let lx = 0.04;
    let ly = -0.07;
    let lz = 0.24;
    let rx = -0.02;
    let ry = -0.05;
    let rz = 0.25;

    if (healing.kind === 'bandage') {
      // Hold left forearm steady, right hand wraps rhythmically around wrist/forearm
      lx = 0.06;
      ly = -0.09;
      lz = 0.25;
      rx = 0.04 + Math.cos(phase) * 0.065;
      ry = -0.08 + Math.sin(phase) * 0.055;
      rz = 0.26 + Math.sin(phase * 0.5) * 0.025;
    } else if (healing.kind === 'medkit') {
      // Both hands hold/apply tactical medkit pouch against sternum
      const press = Math.sin(phase * 0.75) * 0.024;
      lx = 0.06;
      ly = -0.09;
      lz = 0.23 + press;
      rx = -0.05;
      ry = -0.08;
      rz = 0.24 + press;
    } else if (healing.kind === 'shield') {
      // Hold glowing shield battery in front of chest armor with twist pulse
      const twist = Math.sin(phase * 0.85) * 0.032;
      lx = 0.05;
      ly = -0.06;
      lz = 0.25;
      rx = -0.04 + twist;
      ry = -0.05;
      rz = 0.26;
    } else if (healing.kind === 'syringe') {
      // Left arm raised slightly, right hand injects into left bicep/shoulder
      const jab = Math.sin(phase * 0.7) * 0.028;
      lx = 0.14;
      ly = -0.04;
      lz = 0.21;
      rx = 0.07 - jab;
      ry = 0.01 + Math.abs(jab) * 0.6;
      rz = 0.22;
    } else if (healing.kind === 'drink') {
      // Raise stamina canister toward visor/mouth with slight head tilt
      const sip = Math.sin(phase * 0.65) * 0.022;
      lx = 0.14;
      ly = -0.18;
      lz = 0.16;
      rx = -0.04;
      ry = 0.14 + sip;
      rz = 0.23;
    }

    // Solve Right Hand (holding healing item)
    this.ikTempVec.set(rx * totalScale, ry * totalScale, rz * totalScale).applyQuaternion(this.ikRigQuat);
    this.ikRightWristPos.copy(this.ikChestPos).add(this.ikTempVec);
    this.ikRightPoleDir.set(-0.68, -0.58, -0.45).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(0.35, 0.45, -0.25, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikRightHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.triggerShoulderBone,
        shoulderRestQuat: this.triggerShoulderRestQuat,
        upperArm: this.triggerUpperArmBone,
        forearm: this.triggerForearmBone,
        hand: this.triggerHandBone,
      },
      targetWristWorldPos: this.ikRightWristPos,
      targetHandWorldQuat: this.ikRightHandQuat,
      elbowPoleWorldDir: this.ikRightPoleDir,
      weight: w,
      clavicleAssist: 0.18,
    });

    // Solve Left Support Hand
    this.ikTempVec.set(lx * totalScale, ly * totalScale, lz * totalScale).applyQuaternion(this.ikRigQuat);
    this.ikLeftWristPos.copy(this.ikChestPos).add(this.ikTempVec);
    this.ikLeftPoleDir.set(0.68, -0.58, -0.45).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(0.32, -0.42, 0.25, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikLeftHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.supportShoulderBone,
        shoulderRestQuat: this.supportShoulderRestQuat,
        upperArm: this.supportUpperArmBone,
        forearm: this.supportForearmBone,
        hand: this.supportHandBone,
      },
      targetWristWorldPos: this.ikLeftWristPos,
      targetHandWorldQuat: this.ikLeftHandQuat,
      elbowPoleWorldDir: this.ikLeftPoleDir,
      weight: w * (healing.kind === 'drink' ? 0.45 : 1.0),
      clavicleAssist: 0.18,
    });

    void delta;
  }

  private ensureGlooDeployProp(): void {
    if (this.glooPropGroup) {
      if (this.triggerHandBone && this.glooPropGroup.parent !== this.triggerHandBone) {
        this.triggerHandBone.add(this.glooPropGroup);
      }
      return;
    }
    const root = new THREE.Group();
    root.visible = false;

    const coreGeo = new THREE.OctahedronGeometry(0.068, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.25,
      roughness: 0.16,
      metalness: 0.2,
      transparent: true,
      opacity: 0.94,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);

    const ringGeo = new THREE.TorusGeometry(0.088, 0.014, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI * 0.35;

    root.add(coreMesh, ringMesh);
    root.position.set(0.01, -0.06, 0.06);
    this.glooCoreMat = coreMat;
    this.glooRingMat = ringMat;
    this.glooPropGroup = root;
    if (this.triggerHandBone) {
      this.triggerHandBone.add(root);
    }
  }

  private resetGlooHoldVisualState(): void {
    this.glooHoldBlend = 0;
    this.wasGlooHeld = false;
    this.glooEquipTimer = 0;
    this.glooUnequipTimer = 0;
    if (this.glooPropGroup) {
      this.glooPropGroup.visible = false;
    }
  }

  private applyGlooHoldArmIK(
    snapshot: PlayerStateSnapshot,
    elapsed: number,
    baseState: PlayerAnimationState,
    isGlooHeld: boolean,
  ): void {
    if (
      !this.chestBone ||
      !this.spineBone ||
      !this.triggerUpperArmBone ||
      !this.triggerForearmBone ||
      !this.triggerHandBone ||
      !this.supportUpperArmBone ||
      !this.supportForearmBone ||
      !this.supportHandBone
    ) {
      return;
    }

    this.ensureGlooDeployProp();
    const isProne = Boolean(snapshot.isProne);
    const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);

    // Subtle locomotion sway while carrying the Gloo Wall item in hand
    let bobX = 0;
    let bobY = 0;
    let bobZ = 0;
    if (baseState === 'Run' || (!snapshot.isCrouching && !isProne && horizSpeed > snapshot.movementSpeed * 0.92)) {
      bobX = Math.sin(elapsed * 5.6) * 0.014;
      bobY = Math.cos(elapsed * 11.2) * 0.014;
      bobZ = Math.sin(elapsed * 5.6) * 0.01;
    } else if (baseState === 'Walk' || baseState === 'CrouchWalk' || horizSpeed > 0.25) {
      bobX = Math.sin(elapsed * 4.2) * 0.008;
      bobY = Math.cos(elapsed * 8.4) * 0.008;
    } else {
      bobY = Math.sin(elapsed * 2.2) * 0.006;
    }

    const holdRx = -0.19 + bobX;
    const holdRy = (isProne ? 0.06 : -0.02) + bobY;
    const holdRz = 0.28 + bobZ;
    const stowRx = -0.25;
    const stowRy = isProne ? -0.08 : -0.24;
    const stowRz = 0.06;

    let rx = holdRx;
    let ry = holdRy;
    let rz = holdRz;
    let handPitch = -0.32;
    let handYaw = 0.28;
    let handRoll = -0.15;
    let torsoYaw = isProne ? 0 : -0.14;
    let torsoPitch = isProne ? 0 : 0.04;
    let armWeight = 1;
    let propScale = 1 + Math.sin(elapsed * 4.2) * 0.04;

    if (isGlooHeld) {
      if (this.glooEquipTimer > 0) {
        const t = clamp(1 - this.glooEquipTimer / Math.max(0.01, this.glooEquipDuration), 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        rx = stowRx + (holdRx - stowRx) * ease;
        ry = stowRy + (holdRy - stowRy) * ease;
        rz = stowRz + (holdRz - stowRz) * ease;
        handPitch = 0.12 + (-0.32 - 0.12) * ease;
        handYaw = 0.28 * ease;
        handRoll = -0.15 * ease;
        torsoYaw *= ease;
        torsoPitch *= ease;
        armWeight = clamp(0.28 + 0.72 * ease, 0, 1);
        propScale *= clamp((t - 0.08) / 0.52, 0, 1);
      }
    } else {
      const t =
        this.glooUnequipTimer > 0
          ? clamp(1 - this.glooUnequipTimer / Math.max(0.01, this.glooUnequipDuration), 0, 1)
          : 1 - clamp(this.glooHoldBlend, 0, 1);
      const ease = t * t * (3 - 2 * t);
      rx = holdRx + (stowRx - holdRx) * ease;
      ry = holdRy + (stowRy - holdRy) * ease;
      rz = holdRz + (stowRz - holdRz) * ease;
      handPitch = -0.32 * (1 - ease);
      handYaw = 0.28 * (1 - ease);
      handRoll = -0.15 * (1 - ease);
      torsoYaw *= 1 - ease;
      torsoPitch *= 1 - ease;
      armWeight = clamp(Math.max(this.glooHoldBlend, 1 - ease), 0, 1);
      propScale *= clamp(1 - t * 1.45, 0, 1);
    }

    if (this.glooPropGroup && this.glooCoreMat && this.glooRingMat) {
      if (propScale > 0.03) {
        this.glooPropGroup.visible = true;
        this.glooPropGroup.scale.setScalar(propScale);
        this.glooPropGroup.rotation.y = elapsed * 2.4;
        this.glooPropGroup.rotation.z = Math.sin(elapsed * 1.7) * 0.22;
        this.glooCoreMat.color.set(this.glooLastAccentHex);
        this.glooCoreMat.emissive.set(this.glooLastAccentHex);
        this.glooRingMat.color.set(this.glooLastAccentHex);
      } else {
        this.glooPropGroup.visible = false;
      }
    }

    if (armWeight <= 0.01) return;

    this.ikTempEuler.set(torsoPitch * 0.45, torsoYaw * 0.45, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.spineBone.quaternion.multiply(this.ikTempQuat);

    this.ikTempEuler.set(torsoPitch * 0.55, torsoYaw * 0.55, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.chestBone.quaternion.multiply(this.ikTempQuat);

    updateWorldMatrixChain(null, this.chestBone);
    this.chestBone.getWorldPosition(this.ikChestPos);
    if (isProne) {
      this.ikTempEuler.set(0, this.rigPivot.rotation.y, 0, 'YXZ');
      this.ikRigQuat.setFromEuler(this.ikTempEuler);
    } else {
      this.rigPivot.getWorldQuaternion(this.ikRigQuat);
    }
    const totalScale = this.modelScale * (this.modelGroup ? this.modelGroup.scale.y : 1);

    // Trigger (right) hand holding the Gloo Wall orb ready in front
    this.ikTempVec.set(rx * totalScale, ry * totalScale, rz * totalScale).applyQuaternion(this.ikRigQuat);
    this.ikRightWristPos.copy(this.ikChestPos).add(this.ikTempVec);
    if (isProne) {
      const minY = this.root.position.y + 0.26 * totalScale;
      if (this.ikRightWristPos.y < minY) this.ikRightWristPos.y = minY;
    }
    this.ikRightPoleDir.set(-0.74, -0.46, -0.48).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(handPitch, handYaw, handRoll, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikRightHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.triggerShoulderBone,
        shoulderRestQuat: this.triggerShoulderRestQuat,
        upperArm: this.triggerUpperArmBone,
        forearm: this.triggerForearmBone,
        hand: this.triggerHandBone,
      },
      targetWristWorldPos: this.ikRightWristPos,
      targetHandWorldQuat: this.ikRightHandQuat,
      elbowPoleWorldDir: this.ikRightPoleDir,
      weight: armWeight,
      clavicleAssist: 0.24,
    });

    // Support (left) arm balanced in tactical guard pose
    const lx = 0.17 - bobX * 0.6;
    const ly = (isProne ? -0.01 : -0.09) - bobY * 0.5;
    const lz = 0.21 - bobZ * 0.4;
    this.ikTempVec.set(lx * totalScale, ly * totalScale, lz * totalScale).applyQuaternion(this.ikRigQuat);
    this.ikLeftWristPos.copy(this.ikChestPos).add(this.ikTempVec);
    if (isProne) {
      const minY = this.root.position.y + 0.24 * totalScale;
      if (this.ikLeftWristPos.y < minY) this.ikLeftWristPos.y = minY;
    }
    this.ikLeftPoleDir.set(0.74, -0.52, -0.42).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(0.28, -0.36, 0.22, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikLeftHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.supportShoulderBone,
        shoulderRestQuat: this.supportShoulderRestQuat,
        upperArm: this.supportUpperArmBone,
        forearm: this.supportForearmBone,
        hand: this.supportHandBone,
      },
      targetWristWorldPos: this.ikLeftWristPos,
      targetHandWorldQuat: this.ikLeftHandQuat,
      elbowPoleWorldDir: this.ikLeftPoleDir,
      weight: armWeight * 0.84,
      clavicleAssist: 0.18,
    });
  }

  private applyGlooDeployArmIK(
    glooDeploy: NonNullable<PlayerStateSnapshot['glooDeployState']>,
    elapsed: number,
    isGlooHeld: boolean,
    snapshot: PlayerStateSnapshot,
  ): void {
    if (
      !this.chestBone ||
      !this.spineBone ||
      !this.triggerUpperArmBone ||
      !this.triggerForearmBone ||
      !this.triggerHandBone ||
      !this.supportUpperArmBone ||
      !this.supportForearmBone ||
      !this.supportHandBone
    ) {
      return;
    }

    this.ensureGlooDeployProp();
    const p = clamp(glooDeploy.progress, 0, 1);
    const isProne = Boolean(snapshot.isProne);

    // 3-phase Free Fire style deployment gesture:
    // - Auto mode (!isGlooHeld): quick draw -> throw -> return to weapon stance
    // - Manual held mode (isGlooHeld): wind-up from hold pose -> throw -> recover directly back into ready hold pose with next wall
    let rx = -0.14;
    let ry = 0.04;
    let rz = 0.22;
    let handPitch = -0.25;
    let handYaw = 0.2;
    let torsoYaw = 0;
    let torsoPitch = 0;
    let armWeight = 1;
    let propScale = 1;

    if (isGlooHeld) {
      const holdRy = isProne ? 0.06 : -0.02;
      if (p < 0.22) {
        const k = p / 0.22;
        const ease = 1 - (1 - k) * (1 - k);
        rx = -0.19 - 0.07 * ease;
        ry = holdRy + (0.11 - holdRy) * ease;
        rz = 0.28 - 0.16 * ease;
        handPitch = -0.32 - 0.14 * ease;
        handYaw = 0.28 + 0.1 * ease;
        torsoYaw = -0.14 - 0.1 * ease;
        torsoPitch = 0.04 + 0.02 * ease;
        armWeight = 1;
        propScale = 1 + 0.08 * ease;
      } else if (p < 0.56) {
        const k = (p - 0.22) / 0.34;
        const snap = 1 - Math.pow(1 - k, 3);
        rx = -0.26 + 0.24 * snap;
        ry = 0.11 - 0.14 * snap;
        rz = 0.12 + 0.44 * snap;
        handPitch = -0.46 + 0.94 * snap;
        handYaw = 0.38 - 0.48 * snap;
        torsoYaw = -0.24 + 0.44 * snap;
        torsoPitch = 0.06 + 0.1 * snap;
        armWeight = 1;
        propScale = k < 0.36 ? 1.08 - k * 2.4 : 0;
      } else {
        const k = (p - 0.56) / 0.44;
        const smooth = k * k * (3 - 2 * k);
        rx = -0.02 + (-0.19 - -0.02) * smooth;
        ry = -0.03 + (holdRy - -0.03) * smooth;
        rz = 0.56 + (0.28 - 0.56) * smooth;
        handPitch = 0.48 + (-0.32 - 0.48) * smooth;
        handYaw = -0.1 + (0.28 - -0.1) * smooth;
        torsoYaw = 0.2 + (-0.14 - 0.2) * smooth;
        torsoPitch = 0.16 + (0.04 - 0.16) * smooth;
        armWeight = 1;
        // Materialize the next Gloo Core cleanly back in hand as the arm returns to hold pose
        propScale = k > 0.34 ? clamp((k - 0.34) / 0.44, 0, 1) : 0;
      }
    } else if (p < 0.28) {
      const k = p / 0.28;
      const ease = 1 - (1 - k) * (1 - k);
      rx = -0.18 - 0.08 * ease;
      ry = -0.02 + 0.14 * ease;
      rz = 0.18 - 0.06 * ease;
      handPitch = -0.45 * ease;
      handYaw = 0.35 * ease;
      torsoYaw = -0.2 * ease;
      torsoPitch = 0.05 * ease;
      armWeight = 0.35 + 0.65 * ease;
      propScale = 0.45 + 0.65 * ease;
    } else if (p < 0.62) {
      const k = (p - 0.28) / 0.34;
      const snap = 1 - Math.pow(1 - k, 3);
      rx = -0.26 + 0.24 * snap;
      ry = 0.12 - 0.14 * snap;
      rz = 0.12 + 0.44 * snap;
      handPitch = -0.45 + 0.95 * snap;
      handYaw = 0.35 - 0.45 * snap;
      torsoYaw = -0.2 + 0.42 * snap;
      torsoPitch = 0.05 + 0.11 * snap;
      armWeight = 1;
      // Core vanishes right as it leaves the palm mid-thrust
      propScale = k < 0.42 ? 1.1 - k * 1.6 : 0;
    } else {
      const k = (p - 0.62) / 0.38;
      const smooth = k * k * (3 - 2 * k);
      rx = -0.02 - 0.1 * smooth;
      ry = -0.02 - 0.06 * smooth;
      rz = 0.56 - 0.24 * smooth;
      handPitch = 0.5 * (1 - smooth);
      handYaw = -0.1 * (1 - smooth);
      torsoYaw = 0.22 * (1 - smooth);
      torsoPitch = 0.16 * (1 - smooth);
      armWeight = 1 - smooth;
      propScale = 0;
    }

    if (isProne) {
      torsoYaw = 0;
      torsoPitch = 0;
    }

    if (this.glooPropGroup && this.glooCoreMat && this.glooRingMat) {
      if (propScale > 0.02) {
        this.glooPropGroup.visible = true;
        this.glooPropGroup.scale.setScalar(propScale);
        this.glooPropGroup.rotation.y = elapsed * 8.5;
        this.glooPropGroup.rotation.z = elapsed * 5.2;
        this.glooCoreMat.color.set(glooDeploy.accentHex);
        this.glooCoreMat.emissive.set(glooDeploy.accentHex);
        this.glooRingMat.color.set(glooDeploy.accentHex);
      } else {
        this.glooPropGroup.visible = false;
      }
    }

    // Subtle dynamic torso lean & shoulder follow-through without interrupting leg locomotion
    this.ikTempEuler.set(torsoPitch * 0.45, torsoYaw * 0.45, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.spineBone.quaternion.multiply(this.ikTempQuat);

    this.ikTempEuler.set(torsoPitch * 0.55, torsoYaw * 0.55, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.chestBone.quaternion.multiply(this.ikTempQuat);

    updateWorldMatrixChain(null, this.chestBone);
    this.chestBone.getWorldPosition(this.ikChestPos);
    if (isProne) {
      this.ikTempEuler.set(0, this.rigPivot.rotation.y, 0, 'YXZ');
      this.ikRigQuat.setFromEuler(this.ikTempEuler);
    } else {
      this.rigPivot.getWorldQuaternion(this.ikRigQuat);
    }
    const totalScale = this.modelScale * (this.modelGroup ? this.modelGroup.scale.y : 1);

    // Right deploying hand thrusting forward
    this.ikTempVec.set(rx * totalScale, ry * totalScale, rz * totalScale).applyQuaternion(this.ikRigQuat);
    this.ikRightWristPos.copy(this.ikChestPos).add(this.ikTempVec);
    if (isProne) {
      const minY = this.root.position.y + 0.26 * totalScale;
      if (this.ikRightWristPos.y < minY) this.ikRightWristPos.y = minY;
    }
    this.ikRightPoleDir.set(-0.72, -0.45, -0.52).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(handPitch, handYaw, -0.18, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikRightHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.triggerShoulderBone,
        shoulderRestQuat: this.triggerShoulderRestQuat,
        upperArm: this.triggerUpperArmBone,
        forearm: this.triggerForearmBone,
        hand: this.triggerHandBone,
      },
      targetWristWorldPos: this.ikRightWristPos,
      targetHandWorldQuat: this.ikRightHandQuat,
      elbowPoleWorldDir: this.ikRightPoleDir,
      weight: armWeight,
      clavicleAssist: 0.28,
    });

    // Left arm counter-balance tucked near sternum/hip
    const lx = 0.2 + torsoYaw * 0.14;
    const ly = (isProne ? -0.02 : -0.12) - torsoPitch * 0.08;
    const lz = 0.16 - torsoYaw * 0.16;
    this.ikTempVec.set(lx * totalScale, ly * totalScale, lz * totalScale).applyQuaternion(this.ikRigQuat);
    this.ikLeftWristPos.copy(this.ikChestPos).add(this.ikTempVec);
    if (isProne) {
      const minY = this.root.position.y + 0.24 * totalScale;
      if (this.ikLeftWristPos.y < minY) this.ikLeftWristPos.y = minY;
    }
    this.ikLeftPoleDir.set(0.75, -0.52, -0.42).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(0.28, -0.35, 0.22, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikLeftHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.supportShoulderBone,
        shoulderRestQuat: this.supportShoulderRestQuat,
        upperArm: this.supportUpperArmBone,
        forearm: this.supportForearmBone,
        hand: this.supportHandBone,
      },
      targetWristWorldPos: this.ikLeftWristPos,
      targetHandWorldQuat: this.ikLeftHandQuat,
      elbowPoleWorldDir: this.ikLeftPoleDir,
      weight: armWeight * 0.82,
      clavicleAssist: 0.18,
    });
  }

  private applyTwoHandedWeaponIK(
    snapshot: PlayerStateSnapshot,
    delta: number,
    elapsed: number,
    weaponId: string | null,
    baseState: PlayerAnimationState,
  ): void {
    if (
      !this.chestBone ||
      !this.spineBone ||
      !this.triggerUpperArmBone ||
      !this.triggerForearmBone ||
      !this.triggerHandBone ||
      !this.supportUpperArmBone ||
      !this.supportForearmBone ||
      !this.supportHandBone
    ) {
      return;
    }

    if (snapshot.activeEmoteId && snapshot.isAlive && baseState !== 'Death') {
      this.weaponSocket.visible = false;
      if (this.healingPropGroup) {
        this.healingPropGroup.visible = false;
      }
      this.resetGlooHoldVisualState();
      this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 22, delta);
      return;
    }

    const isHealing = Boolean(snapshot.healingState?.active) && snapshot.isAlive;
    this.smoothedHealWeight = damp(this.smoothedHealWeight, isHealing ? 1 : 0, 16, delta);

    if (isHealing && snapshot.healingState) {
      this.weaponSocket.visible = false;
      this.resetGlooHoldVisualState();
      this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 18, delta);
      this.applyHealingPoseAndArmIK(snapshot.healingState, delta, elapsed);
      return;
    }

    if (baseState === 'Zipline' && snapshot.isAlive) {
      this.weaponSocket.visible = false;
      this.resetGlooHoldVisualState();
      this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 20, delta);
      this.applyZiplineHandlebarIK(snapshot);
      return;
    }

    if (baseState === 'Vault' && snapshot.isAlive) {
      this.resetGlooHoldVisualState();
      const vp = clamp(snapshot.vaultProgress ?? 0.35, 0, 1);
      // Plant hands physically on the window sill while legs clear the frame, then restore weapon on landing
      if (snapshot.vaultSillHands && vp >= 0.04 && vp <= 0.78) {
        this.weaponSocket.visible = false;
        this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 22, delta);
        this.applyVaultSillArmIK(snapshot.vaultSillHands, vp);
        return;
      }
      this.weaponSocket.visible = true;
      this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 18, delta);
      return;
    }

    if (baseState === 'SwimIdle' || baseState === 'SwimMove') {
      this.weaponSocket.visible = false;
      this.resetGlooHoldVisualState();
      this.shootExtendTimer = 0;
      this.shootExtendBlend = 0;
      this.shootRecoilSpring = 0;
      this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 18, delta);
      return;
    }

    if (!snapshot.isAlive || baseState === 'Death') {
      this.resetGlooHoldVisualState();
    }

    const isGlooHeld = Boolean(snapshot.glooHoldState?.active) && snapshot.isAlive && baseState !== 'Death';
    if (snapshot.glooHoldState?.accentHex) {
      this.glooLastAccentHex = snapshot.glooHoldState.accentHex;
    }
    if (isGlooHeld && !this.wasGlooHeld) {
      this.glooEquipDuration = 0.2;
      this.glooEquipTimer = this.glooEquipDuration;
      this.glooUnequipTimer = 0;
    } else if (!isGlooHeld && this.wasGlooHeld) {
      this.glooUnequipDuration = 0.18;
      this.glooUnequipTimer = this.glooUnequipDuration;
      this.glooEquipTimer = 0;
    }
    this.wasGlooHeld = isGlooHeld;

    if (this.glooEquipTimer > 0) {
      this.glooEquipTimer = Math.max(0, this.glooEquipTimer - delta);
    }
    if (this.glooUnequipTimer > 0) {
      this.glooUnequipTimer = Math.max(0, this.glooUnequipTimer - delta);
    }
    this.glooHoldBlend = damp(this.glooHoldBlend, isGlooHeld ? 1 : 0, isGlooHeld ? 22 : 20, delta);
    if (!isGlooHeld && this.glooHoldBlend < 0.015 && this.glooUnequipTimer <= 0) {
      this.glooHoldBlend = 0;
    }

    if (snapshot.glooDeployState?.active && snapshot.isAlive && baseState !== 'Death') {
      if (isGlooHeld) {
        this.glooHoldBlend = 1;
        this.glooEquipTimer = 0;
      }
      this.weaponSocket.visible = !isGlooHeld && snapshot.glooDeployState.progress > 0.74;
      if (this.healingPropGroup) {
        this.healingPropGroup.visible = false;
      }
      this.shootExtendTimer = 0;
      this.shootExtendBlend = 0;
      this.shootRecoilSpring = 0;
      this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 24, delta);
      this.applyGlooDeployArmIK(snapshot.glooDeployState, elapsed, isGlooHeld, snapshot);
      return;
    }

    const unequipSwappingToWeapon = !isGlooHeld && this.switchStage !== 0 && this.glooHoldBlend < 0.45;
    if ((isGlooHeld || this.glooHoldBlend > 0.02 || this.glooUnequipTimer > 0) && !unequipSwappingToWeapon) {
      this.weaponSocket.visible = !isGlooHeld && this.glooHoldBlend < 0.28;
      if (this.healingPropGroup) {
        this.healingPropGroup.visible = false;
      }
      this.shootExtendTimer = 0;
      this.shootExtendBlend = 0;
      this.shootRecoilSpring = 0;
      this.smoothedArmedWeight = damp(this.smoothedArmedWeight, 0, 22, delta);
      this.applyGlooHoldArmIK(snapshot, elapsed, baseState, isGlooHeld);
      return;
    }

    this.weaponSocket.visible = true;
    if (this.healingPropGroup) {
      this.healingPropGroup.visible = false;
    }
    if (this.glooPropGroup) {
      this.glooPropGroup.visible = false;
    }

    const activeOverlay = this.resolveActiveOverlay(snapshot);
    const hasEquippedMesh =
      this.weaponEquipped && this.attachedWeaponInstance !== null;
    const isUnarmedSwitchReach =
      !hasEquippedMesh && this.switchStage !== 0 && this.switchAnimTimer > 0;
    const ikEligible =
      (hasEquippedMesh || isUnarmedSwitchReach) &&
      snapshot.isAlive &&
      baseState !== 'Death' &&
      baseState !== 'Skydive' &&
      baseState !== 'Parachute' &&
      baseState !== 'Sit' &&
      baseState !== 'Vault' &&
      baseState !== 'Zipline' &&
      activeOverlay !== 'PunchLeft' &&
      activeOverlay !== 'PunchRight';

    const targetArmedWeight = ikEligible ? 1 : 0;
    this.smoothedArmedWeight = damp(this.smoothedArmedWeight, targetArmedWeight, 20, delta);
    if (!isUnarmedSwitchReach && this.smoothedArmedWeight <= 0.01) {
      this.smoothedArmedWeight = 0;
      this.shootExtendTimer = 0;
      this.shootExtendBlend = 0;
      this.shootRecoilSpring = 0;
      return;
    }

    // Compute smooth cubic ease [0..1] representing right arm reaching back toward shoulder holster
    let switchReachBlend = 0;
    if (this.switchStage === 1 || this.switchStage === 2) {
      const p = clamp(1 - this.switchAnimTimer / Math.max(0.01, this.switchAnimDuration), 0, 1);
      const eased = p * p * (3 - 2 * p);
      switchReachBlend = this.switchStage === 1 ? eased : 1 - eased;
    }

    const profile = getWeaponGripProfile(weaponId);
    const stance = this.resolveStanceKind(snapshot, baseState);
    const isProneStance = stance === 'prone' || stance === 'prone_aim';
    const isCrouchStance = stance === 'crouch' || stance === 'crouch_aim';
    const anchor = profile.stances[stance];

    if (!this.hasInitializedStance) {
      this.smoothedStancePos.set(anchor.pos[0], anchor.pos[1], anchor.pos[2]);
      this.smoothedStanceRot.set(anchor.rot[0], anchor.rot[1], anchor.rot[2]);
      this.smoothedTorsoYaw = anchor.torsoYaw;
      this.smoothedTorsoPitch = anchor.torsoPitch;
      this.hasInitializedStance = true;
    } else {
      const rate =
        stance === 'aim' || stance === 'crouch_aim' || stance === 'prone_aim' ? 16 : 11;
      this.smoothedStancePos.x = damp(this.smoothedStancePos.x, anchor.pos[0], rate, delta);
      this.smoothedStancePos.y = damp(this.smoothedStancePos.y, anchor.pos[1], rate, delta);
      this.smoothedStancePos.z = damp(this.smoothedStancePos.z, anchor.pos[2], rate, delta);
      this.smoothedStanceRot.x = damp(this.smoothedStanceRot.x, anchor.rot[0], rate, delta);
      this.smoothedStanceRot.y = damp(this.smoothedStanceRot.y, anchor.rot[1], rate, delta);
      this.smoothedStanceRot.z = damp(this.smoothedStanceRot.z, anchor.rot[2], rate, delta);
      this.smoothedTorsoYaw = damp(this.smoothedTorsoYaw, anchor.torsoYaw, rate, delta);
      this.smoothedTorsoPitch = damp(this.smoothedTorsoPitch, anchor.torsoPitch, rate, delta);
    }

    // Track crisp weapon firing extension & per-shot recoil impulse synchronized to every shot
    const isReloadingNow = activeOverlay === 'Reload';
    const isShooting = activeOverlay === 'Shoot';
    const seq = snapshot.actionSeq;
    let shotFiredThisFrame = false;

    if (isShooting) {
      if (seq !== undefined && seq !== this.lastActionSeq) {
        this.lastActionSeq = seq;
        shotFiredThisFrame = true;
      } else if (seq === undefined && !this.wasShootAction) {
        shotFiredThisFrame = true;
      }
    } else if (seq !== undefined && seq !== this.lastActionSeq) {
      this.lastActionSeq = seq;
      if (snapshot.activeAction === 'Shoot' || snapshot.animationState === 'Shoot') {
        shotFiredThisFrame = true;
      }
    }
    this.wasShootAction = isShooting;

    if (shotFiredThisFrame && !isReloadingNow && this.switchStage === 0) {
      this.recoilAlternator = -this.recoilAlternator;
      this.shootExtendTimer = 0.24;
      // Preserve crisp per-shot snap-kick even during rapid full-auto fire
      this.shootRecoilSpring = clamp(this.shootRecoilSpring * 0.34 + 0.88, 0.88, 1.25);
    }

    if (isShooting && !isReloadingNow && this.switchStage === 0) {
      this.shootExtendTimer = Math.max(this.shootExtendTimer, 0.14);
    } else if (isReloadingNow || !snapshot.isAlive || this.switchStage !== 0) {
      this.shootExtendTimer = 0;
    }

    if (this.shootExtendTimer > 0) {
      this.shootExtendTimer = Math.max(0, this.shootExtendTimer - delta);
    }

    const wantShootExtend =
      !isReloadingNow && this.switchStage === 0 && (isShooting || this.shootExtendTimer > 0);
    this.shootExtendBlend = damp(
      this.shootExtendBlend,
      wantShootExtend ? 1 : 0,
      wantShootExtend ? 24 : 9,
      delta,
    );
    this.shootRecoilSpring = damp(this.shootRecoilSpring, 0, 23, delta);

    const recoil = this.shootRecoilSpring;
    const shootExt = this.shootExtendBlend * (1 - switchReachBlend);
    const holdStyle = profile.holdStyle;

    // Weapon-class calibrated forward extension + recoil kick response
    let extForwardZ = 0.052;
    let extInwardX = 0.012;
    let extLiftY = 0.01;
    let kickBackZ = 0.048;
    let kickUpY = 0.012;
    let kickPitch = 0.115;
    let kickRoll = 0.022;
    let torsoKick = 0.048;

    if (holdStyle === 'pistol') {
      extForwardZ = 0.062;
      extInwardX = 0.014;
      extLiftY = 0.012;
      kickBackZ = 0.044;
      kickUpY = 0.016;
      kickPitch = 0.145;
      kickRoll = 0.022;
      torsoKick = 0.036;
    } else if (holdStyle === 'shotgun' || holdStyle === 'sniper') {
      extForwardZ = 0.046;
      extInwardX = 0.01;
      extLiftY = 0.008;
      kickBackZ = 0.062;
      kickUpY = 0.014;
      kickPitch = 0.155;
      kickRoll = 0.028;
      torsoKick = 0.064;
    } else if (holdStyle === 'smg') {
      extForwardZ = 0.058;
      extInwardX = 0.012;
      extLiftY = 0.01;
      kickBackZ = 0.038;
      kickUpY = 0.01;
      kickPitch = 0.095;
      kickRoll = 0.018;
      torsoKick = 0.038;
    }

    const armedW = isUnarmedSwitchReach
      ? switchReachBlend
      : this.smoothedArmedWeight;
    const rawLeftTargetW =
      hasEquippedMesh && profile.twoHanded ? this.computeReloadLeftIkWeight(snapshot) : 0;
    const leftSwitchScale = clamp(1 - switchReachBlend * 1.45, 0, 1);
    const leftTargetW = rawLeftTargetW * leftSwitchScale;
    this.smoothedLeftIkWeight = damp(this.smoothedLeftIkWeight, leftTargetW, 18, delta);

    // 1. Additive tactical upper-torso blading + forward firing lean + recoil absorption
    // Skip local-Y torso blading while prone (when Hips are horizontal, local Y rolls torso/head off-axis)
    const torsoYaw = isProneStance ? 0 : this.smoothedTorsoYaw * armedW;
    const torsoExtendLean = isProneStance ? 0 : shootExt * 0.03;
    const torsoPitch = (isProneStance ? -recoil * 0.028 : this.smoothedTorsoPitch + torsoExtendLean - recoil * torsoKick) * armedW;

    this.ikTempEuler.set(torsoPitch * 0.45, torsoYaw * 0.45, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.spineBone.quaternion.multiply(this.ikTempQuat);

    this.ikTempEuler.set(torsoPitch * 0.55, torsoYaw * 0.55, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.chestBone.quaternion.multiply(this.ikTempQuat);

    // Counter-rotate neck & head so operator always looks straight downrange without roll/twist
    const lobbyLook = stance === 'lobby' ? Math.sin(elapsed * 0.72) * 0.055 : 0;
    if (this.neckBone) {
      this.ikTempEuler.set(-torsoPitch * 0.35, -torsoYaw * 0.35 + lobbyLook * 0.35, 0, 'YXZ');
      this.ikTempQuat.setFromEuler(this.ikTempEuler);
      this.neckBone.quaternion.multiply(this.ikTempQuat);
    }
    if (this.headBone) {
      this.ikTempEuler.set(-torsoPitch * 0.65, -torsoYaw * 0.65 + lobbyLook * 0.65, 0, 'YXZ');
      this.ikTempQuat.setFromEuler(this.ikTempEuler);
      this.headBone.quaternion.multiply(this.ikTempQuat);
    }

    // Update world matrices linearly to chest before solving IK
    updateWorldMatrixChain(null, this.chestBone);
    this.chestBone.getWorldPosition(this.ikChestPos);
    if (isProneStance) {
      // Keep weapon orientation aligned to horizon aim-yaw when prone so barrel points forward, never into ground
      this.ikTempEuler.set(0, this.rigPivot.rotation.y, 0, 'YXZ');
      this.ikRigQuat.setFromEuler(this.ikTempEuler);
    } else {
      this.rigPivot.getWorldQuaternion(this.ikRigQuat);
    }

    const totalScale = this.modelScale * (this.modelGroup ? this.modelGroup.scale.y : 1);

    // 2. Natural breathing / stride motion + forward firing extension + per-shot recoil kick
    let bobX = extInwardX * shootExt;
    let bobY = extLiftY * shootExt;
    let bobZ = extForwardZ * shootExt - recoil * kickBackZ;
    let bobPitch = -recoil * kickPitch;
    let bobYaw = 0;
    let bobRoll = recoil * kickRoll * this.recoilAlternator;
    const horizSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
    if (stance === 'lobby') {
      bobY += Math.sin(elapsed * 1.85) * 0.009;
      bobYaw += Math.sin(elapsed * 0.92) * 0.016;
      bobRoll += Math.cos(elapsed * 0.92) * 0.012;
    } else if (stance === 'idle') {
      bobY += Math.sin(elapsed * 2.1) * 0.005;
    } else if (stance === 'crouch') {
      if (baseState === 'CrouchWalk' || horizSpeed > 0.22) {
        const crouchAct = this.actions.get('CrouchWalk');
        const cTime = crouchAct ? crouchAct.time : elapsed;
        const phase = (cTime / 0.92) * Math.PI * 2;
        bobY += Math.cos(phase * 2) * 0.006;
        bobX += Math.sin(phase) * 0.006;
        bobYaw += Math.sin(phase) * 0.011;
      } else {
        bobY += Math.sin(elapsed * 2.1) * 0.004;
      }
    } else if (stance === 'prone') {
      if (horizSpeed > 0.16 && baseState === 'ProneMove') {
        const pTime = this.activeAction ? this.activeAction.time : elapsed;
        const phase = (pTime / 0.96) * Math.PI * 2;
        bobX += Math.sin(phase) * 0.01;
        bobY += Math.abs(Math.sin(phase)) * 0.008;
        bobRoll += Math.sin(phase) * 0.025;
      } else {
        bobY += Math.sin(elapsed * 1.8) * 0.003;
      }
    } else if (stance === 'walk') {
      const walkAct = this.actions.get('Walk');
      const wTime = walkAct ? walkAct.time : elapsed;
      const phase = (wTime / 0.88) * Math.PI * 2;
      bobY += Math.cos(phase * 2) * 0.009;
      bobX += Math.sin(phase) * 0.009;
      bobYaw += Math.sin(phase) * 0.016;
    } else if (stance === 'run') {
      const runAct = this.actions.get('Run');
      const rTime = runAct ? runAct.time : elapsed;
      const phase = (rTime / 0.56) * Math.PI * 2;
      bobY += Math.cos(phase * 2) * 0.014;
      bobX += Math.sin(phase) * 0.018;
      bobYaw += Math.sin(phase) * 0.028;
      bobRoll += Math.cos(phase) * 0.022;
    } else if (stance === 'aim' || stance === 'crouch_aim' || stance === 'prone_aim') {
      if (horizSpeed > 0.35 || baseState === 'CrouchWalk') {
        // Gentle aim-walk stabilization sway while legs walk/crouch-walk underneath
        const isCrouchWalk = baseState === 'CrouchWalk' || stance === 'crouch_aim';
        const gaitAct = this.actions.get(isCrouchWalk ? 'CrouchWalk' : 'Walk');
        const gaitDur = isCrouchWalk ? 0.92 : 0.88;
        const gTime = gaitAct ? gaitAct.time : elapsed;
        const phase = (gTime / gaitDur) * Math.PI * 2;
        bobY += Math.cos(phase * 2) * (isCrouchWalk ? 0.0028 : 0.004);
        bobX += Math.sin(phase) * (isCrouchWalk ? 0.0028 : 0.004);
      } else {
        bobY += Math.sin(elapsed * 2.0) * 0.0016;
      }
    }

    // Desired Weapon World Quaternion & Right-Trigger-Palm World Position
    // Blend smoothly toward over-shoulder back sling trajectory during Stage 1/2 weapon switching
    const drawRotX = this.smoothedStanceRot.x + bobPitch + (-1.08 - this.smoothedStanceRot.x) * switchReachBlend;
    const drawRotY = this.smoothedStanceRot.y + bobYaw + (0.28 - this.smoothedStanceRot.y) * switchReachBlend;
    const drawRotZ = this.smoothedStanceRot.z + bobRoll + (-0.36 - this.smoothedStanceRot.z) * switchReachBlend;

    this.ikStanceEuler.set(drawRotX, drawRotY, drawRotZ, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikStanceEuler);
    this.ikDesiredWeaponQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);

    const basePalmX = this.smoothedStancePos.x + bobX;
    const basePalmY = this.smoothedStancePos.y + bobY + recoil * kickUpY;
    const basePalmZ = this.smoothedStancePos.z + bobZ;
    const holsterReachX = -0.095;
    const holsterReachY = 0.255;
    const holsterReachZ = -0.175;

    this.ikTempVec.set(
      (basePalmX + (holsterReachX - basePalmX) * switchReachBlend) * totalScale,
      (basePalmY + (holsterReachY - basePalmY) * switchReachBlend) * totalScale,
      (basePalmZ + (holsterReachZ - basePalmZ) * switchReachBlend) * totalScale,
    );
    this.ikTempVec.applyQuaternion(this.ikRigQuat);
    this.ikRightPalmPos.copy(this.ikChestPos).add(this.ikTempVec);
    if (isProneStance) {
      // Guarantee weapon grip/barrel never dips below terrain floor when prone
      const minProneGripY = this.root.position.y + 0.28 * totalScale;
      if (this.ikRightPalmPos.y < minProneGripY) {
        this.ikRightPalmPos.y = minProneGripY;
      }
    }

    // Convert desired weapon orientation -> TriggerHand (-X chain) world orientation
    this.ikSocketQuatInv.copy(this.weaponSocket.quaternion).invert();
    this.ikRightHandQuat.copy(this.ikDesiredWeaponQuat).multiply(this.ikSocketQuatInv);

    computeWristPosFromPalmTarget(
      this.ikRightPalmPos,
      this.ikRightHandQuat,
      RIGHT_HAND_PALM_LOCAL,
      this.ikRightWristPos,
      totalScale,
    );

    // 3. Solve Anatomical RIGHT Arm 2-Bone IK (-X chain, dominant trigger hand)
    if (isProneStance) {
      this.ikRightPoleDir.set(-0.88, -0.45, 0.16).applyQuaternion(this.ikRigQuat);
    } else if (isCrouchStance) {
      this.ikRightPoleDir.set(-0.86, -0.36, -0.36).applyQuaternion(this.ikRigQuat);
    } else {
      this.ikRightPoleDir.set(-0.84, -0.42, -0.35).applyQuaternion(this.ikRigQuat);
    }
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.triggerShoulderBone,
        shoulderRestQuat: this.triggerShoulderRestQuat,
        upperArm: this.triggerUpperArmBone,
        forearm: this.triggerForearmBone,
        hand: this.triggerHandBone,
      },
      targetWristWorldPos: this.ikRightWristPos,
      targetHandWorldQuat: this.ikRightHandQuat,
      elbowPoleWorldDir: this.ikRightPoleDir,
      weight: armedW,
      clavicleAssist: 0.16,
    });

    // Update trigger arm + weaponSocket + weapon world matrix linearly so Support Hand reads live weapon grip point
    const weaponMesh = this.attachedWeaponInstance;
    updateWorldMatrixChain(
      this.triggerShoulderBone?.parent ?? this.chestBone,
      weaponMesh ?? this.weaponSocket,
    );
    if (!weaponMesh || this.smoothedLeftIkWeight <= 0.01) return;

    // 4. Read exact Left-Support-Hand grip target from weapon's live matrixWorld
    const [lgx, lgy, lgz] = profile.leftGripLocal;
    const [ox, oy, oz] = profile.leftSurfaceOffset;
    this.ikLeftPalmPos.set(lgx + ox, lgy + oy, lgz + oz).applyMatrix4(weaponMesh.matrixWorld);

    // Extract weapon's live world basis axes (+X anatomical left when aiming +Z, +Y up, +Z forward)
    weaponMesh.matrixWorld.extractBasis(this.ikWeapRight, this.ikWeapUp, this.ikWeapFwd);
    this.ikWeapRight.normalize();
    this.ikWeapUp.normalize();
    this.ikWeapFwd.normalize();

    // Build anatomical LEFT support hand (+X chain) world orientation matching grip style
    // On +X hand: -X = inner palm normal, +X = back of hand, +Z = thumb, -Y = fingers wrapping direction
    if (profile.leftGripStyle === 'vertical_foregrip') {
      // Back of hand (+X) faces anatomical left (+ikWeapRight) & slightly down; thumb (+Z) points up & forward
      this.ikHandX
        .copy(this.ikWeapRight)
        .multiplyScalar(0.94)
        .addScaledVector(this.ikWeapUp, -0.32)
        .normalize();
      this.ikHandZ
        .copy(this.ikWeapUp)
        .multiplyScalar(0.75)
        .addScaledVector(this.ikWeapFwd, 0.65)
        .normalize();
    } else if (profile.leftGripStyle === 'pistol_cup') {
      // Inner palm (-X) presses against +X side of grip; fingers (-Y) wrap forward around frontstrap
      this.ikHandX
        .copy(this.ikWeapRight)
        .multiplyScalar(0.95)
        .addScaledVector(this.ikWeapUp, -0.25)
        .normalize();
      this.ikHandZ
        .copy(this.ikWeapFwd)
        .multiplyScalar(0.55)
        .addScaledVector(this.ikWeapUp, 0.83)
        .normalize();
    } else if (profile.leftGripStyle === 'handle') {
      // Baseball bat axis in weapon local space is roughly (0, 0.847, 0.531)
      this.ikTempVec2
        .copy(this.ikWeapUp)
        .multiplyScalar(0.847)
        .addScaledVector(this.ikWeapFwd, 0.531)
        .normalize();
      this.ikHandX
        .copy(this.ikWeapRight)
        .multiplyScalar(0.88)
        .addScaledVector(this.ikWeapFwd, 0.35)
        .normalize();
      this.ikHandZ.copy(this.ikTempVec2);
    } else {
      // 'underbarrel': left palm (-HandX) cradles underside of handguard from below & +X left side,
      // so back of hand (+HandX) points down (-ikWeapUp) & left (+ikWeapRight); fingers (-HandY) curl around toward -X
      this.ikHandX
        .copy(this.ikWeapRight)
        .multiplyScalar(0.32)
        .addScaledVector(this.ikWeapUp, -0.94)
        .normalize();
      this.ikHandZ
        .copy(this.ikWeapFwd)
        .multiplyScalar(0.9)
        .addScaledVector(this.ikWeapUp, 0.42)
        .addScaledVector(this.ikWeapRight, 0.12)
        .normalize();
    }

    // Orthonormalize right-handed basis (X, Y, Z)
    const projXZ = this.ikHandZ.dot(this.ikHandX);
    this.ikHandZ.addScaledVector(this.ikHandX, -projXZ).normalize();
    this.ikHandY.crossVectors(this.ikHandZ, this.ikHandX).normalize();
    this.ikHandX.crossVectors(this.ikHandY, this.ikHandZ).normalize();
    this.ikBasisMat.makeBasis(this.ikHandX, this.ikHandY, this.ikHandZ);
    this.ikLeftHandQuat.setFromRotationMatrix(this.ikBasisMat);

    computeWristPosFromPalmTarget(
      this.ikLeftPalmPos,
      this.ikLeftHandQuat,
      LEFT_HAND_PALM_LOCAL,
      this.ikLeftWristPos,
      totalScale,
    );

    // 5. Solve Anatomical LEFT Arm 2-Bone IK (+X chain, support hand)
    if (isProneStance) {
      this.ikLeftPoleDir.set(0.78, -0.58, 0.22).applyQuaternion(this.ikRigQuat);
    } else if (isCrouchStance) {
      this.ikLeftPoleDir.set(0.64, -0.50, -0.56).applyQuaternion(this.ikRigQuat);
    } else {
      this.ikLeftPoleDir.set(0.56, -0.64, -0.52).applyQuaternion(this.ikRigQuat);
    }
    solveTwoBoneArmIK({
      bones: {
        shoulder: this.supportShoulderBone,
        shoulderRestQuat: this.supportShoulderRestQuat,
        upperArm: this.supportUpperArmBone,
        forearm: this.supportForearmBone,
        hand: this.supportHandBone,
      },
      targetWristWorldPos: this.ikLeftWristPos,
      targetHandWorldQuat: this.ikLeftHandQuat,
      elbowPoleWorldDir: this.ikLeftPoleDir,
      weight: armedW * this.smoothedLeftIkWeight,
      clavicleAssist: 0.28,
    });
  }

  private applyVaultSillArmIK(
    sill: NonNullable<PlayerStateSnapshot['vaultSillHands']>,
    progress: number,
  ): void {
    if (
      !this.triggerUpperArmBone ||
      !this.triggerForearmBone ||
      !this.triggerHandBone ||
      !this.supportUpperArmBone ||
      !this.supportForearmBone ||
      !this.supportHandBone
    ) {
      return;
    }

    // Smooth plant-and-pushoff envelope across [0.04..0.78]
    const w =
      progress < 0.16
        ? clamp((progress - 0.04) / 0.12, 0, 1)
        : progress > 0.62
          ? clamp((0.78 - progress) / 0.16, 0, 1)
          : 1;
    if (w <= 0.01) return;

    updateWorldMatrixChain(null, this.rigPivot);
    this.rigPivot.getWorldQuaternion(this.ikRigQuat);

    // Right hand onto right side of window frame sill
    this.ikRightWristPos.set(sill.rightX, sill.rightY + 0.04, sill.rightZ);
    this.ikRightPoleDir.set(-0.62, 0.35, -0.7).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(-0.35, 0, 0, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikRightHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);

    solveTwoBoneArmIK({
      bones: {
        shoulder: this.triggerShoulderBone,
        shoulderRestQuat: this.triggerShoulderRestQuat,
        upperArm: this.triggerUpperArmBone,
        forearm: this.triggerForearmBone,
        hand: this.triggerHandBone,
      },
      targetWristWorldPos: this.ikRightWristPos,
      targetHandWorldQuat: this.ikRightHandQuat,
      elbowPoleWorldDir: this.ikRightPoleDir,
      weight: w,
      clavicleAssist: 0.24,
    });

    // Left hand onto left side of window frame sill
    this.ikLeftWristPos.set(sill.leftX, sill.leftY + 0.04, sill.leftZ);
    this.ikLeftPoleDir.set(0.62, 0.35, -0.7).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(-0.35, 0, 0, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikLeftHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);

    solveTwoBoneArmIK({
      bones: {
        shoulder: this.supportShoulderBone,
        shoulderRestQuat: this.supportShoulderRestQuat,
        upperArm: this.supportUpperArmBone,
        forearm: this.supportForearmBone,
        hand: this.supportHandBone,
      },
      targetWristWorldPos: this.ikLeftWristPos,
      targetHandWorldQuat: this.ikLeftHandQuat,
      elbowPoleWorldDir: this.ikLeftPoleDir,
      weight: w,
      clavicleAssist: 0.24,
    });
  }

  private applyZiplineHandlebarIK(snapshot: PlayerStateSnapshot): void {
    if (
      !this.chestBone ||
      !this.triggerUpperArmBone ||
      !this.triggerForearmBone ||
      !this.triggerHandBone ||
      !this.supportUpperArmBone ||
      !this.supportForearmBone ||
      !this.supportHandBone
    ) {
      return;
    }

    updateWorldMatrixChain(null, this.chestBone);
    this.rigPivot.getWorldQuaternion(this.ikRigQuat);
    this.chestBone.getWorldPosition(this.ikChestPos);

    if (snapshot.ziplineHandlePos) {
      this.ikTempVec2.copy(snapshot.ziplineHandlePos);
      this.ikTempVec2.y -= 0.16;
    } else {
      this.ikTempVec.set(0, 0.64, 0.12).applyQuaternion(this.ikRigQuat);
      this.ikTempVec2.copy(this.ikChestPos).add(this.ikTempVec);
    }

    // Right hand grips right side of overhead pulley handlebar
    this.ikTempVec.set(-0.14, 0, 0.02).applyQuaternion(this.ikRigQuat);
    this.ikRightWristPos.copy(this.ikTempVec2).add(this.ikTempVec);
    this.ikRightPoleDir.set(-0.55, -0.25, 0.78).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(-1.35, 0, -0.15, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikRightHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);

    solveTwoBoneArmIK({
      bones: {
        shoulder: this.triggerShoulderBone,
        shoulderRestQuat: this.triggerShoulderRestQuat,
        upperArm: this.triggerUpperArmBone,
        forearm: this.triggerForearmBone,
        hand: this.triggerHandBone,
      },
      targetWristWorldPos: this.ikRightWristPos,
      targetHandWorldQuat: this.ikRightHandQuat,
      elbowPoleWorldDir: this.ikRightPoleDir,
      weight: 1.0,
      clavicleAssist: 0.35,
    });

    // Left hand grips left side of overhead pulley handlebar
    this.ikTempVec.set(0.14, 0, 0.02).applyQuaternion(this.ikRigQuat);
    this.ikLeftWristPos.copy(this.ikTempVec2).add(this.ikTempVec);
    this.ikLeftPoleDir.set(0.55, -0.25, 0.78).applyQuaternion(this.ikRigQuat);
    this.ikTempEuler.set(-1.35, 0, 0.15, 'YXZ');
    this.ikStanceQuat.setFromEuler(this.ikTempEuler);
    this.ikLeftHandQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);

    solveTwoBoneArmIK({
      bones: {
        shoulder: this.supportShoulderBone,
        shoulderRestQuat: this.supportShoulderRestQuat,
        upperArm: this.supportUpperArmBone,
        forearm: this.supportForearmBone,
        hand: this.supportHandBone,
      },
      targetWristWorldPos: this.ikLeftWristPos,
      targetHandWorldQuat: this.ikLeftHandQuat,
      elbowPoleWorldDir: this.ikLeftPoleDir,
      weight: 1.0,
      clavicleAssist: 0.35,
    });
  }

  /**
   * Diagnostic measurement of live bone-to-grip attachment error (used by automated weapon verification).
   */
  getWeaponGripDiagnostics(): {
    weaponId: string | null;
    twoHanded: boolean;
    rightPalmToGripDist: number;
    leftPalmToGripDist: number;
    leftElbowDeg: number;
    rightElbowDeg: number;
    triggerHandLocalX: number;
    supportHandLocalX: number;
    hasNaN: boolean;
  } {
    this.root.updateMatrixWorld(true);
    const profile = getWeaponGripProfile(this.equippedWeaponId);
    const totalScale = this.modelScale * (this.modelGroup ? this.modelGroup.scale.y : 1);

    let rightDist = 0;
    let leftDist = 0;
    let leftElbowDeg = 180;
    let rightElbowDeg = 180;
    let triggerHandLocalX = 0;
    let supportHandLocalX = 0;
    let hasNaN = false;

    const checkVec = (v: THREE.Vector3) => {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
        hasNaN = true;
      }
    };

    if (this.attachedWeaponInstance && this.triggerHandBone) {
      const rPalm = RIGHT_HAND_PALM_LOCAL.clone()
        .multiplyScalar(totalScale)
        .applyMatrix4(this.triggerHandBone.matrixWorld);
      const rGrip = new THREE.Vector3(...profile.rightGripLocal).applyMatrix4(
        this.attachedWeaponInstance.matrixWorld,
      );
      checkVec(rPalm);
      checkVec(rGrip);
      rightDist = rPalm.distanceTo(rGrip);
      const localTrig = this.rigPivot.worldToLocal(rPalm.clone());
      triggerHandLocalX = localTrig.x;
    }

    if (this.attachedWeaponInstance && this.supportHandBone && profile.twoHanded) {
      const lPalm = LEFT_HAND_PALM_LOCAL.clone()
        .multiplyScalar(totalScale)
        .applyMatrix4(this.supportHandBone.matrixWorld);
      const [lgx, lgy, lgz] = profile.leftGripLocal;
      const [ox, oy, oz] = profile.leftSurfaceOffset;
      const lGrip = new THREE.Vector3(lgx + ox, lgy + oy, lgz + oz).applyMatrix4(
        this.attachedWeaponInstance.matrixWorld,
      );
      checkVec(lPalm);
      checkVec(lGrip);
      leftDist = lPalm.distanceTo(lGrip);
      const localSup = this.rigPivot.worldToLocal(lPalm.clone());
      supportHandLocalX = localSup.x;
    }

    const computeElbowDeg = (
      ua: THREE.Bone | null,
      fa: THREE.Bone | null,
      hd: THREE.Bone | null,
    ): number => {
      if (!ua || !fa || !hd) return 180;
      const pU = ua.getWorldPosition(new THREE.Vector3());
      const pF = fa.getWorldPosition(new THREE.Vector3());
      const pH = hd.getWorldPosition(new THREE.Vector3());
      checkVec(pU);
      checkVec(pF);
      checkVec(pH);
      const v1 = pU.sub(pF).normalize();
      const v2 = pH.sub(pF).normalize();
      return THREE.MathUtils.radToDeg(Math.acos(clamp(v1.dot(v2), -1, 1)));
    };

    leftElbowDeg = computeElbowDeg(
      this.supportUpperArmBone,
      this.supportForearmBone,
      this.supportHandBone,
    );
    rightElbowDeg = computeElbowDeg(
      this.triggerUpperArmBone,
      this.triggerForearmBone,
      this.triggerHandBone,
    );

    return {
      weaponId: this.equippedWeaponId,
      twoHanded: profile.twoHanded,
      rightPalmToGripDist: rightDist,
      leftPalmToGripDist: leftDist,
      leftElbowDeg,
      rightElbowDeg,
      triggerHandLocalX,
      supportHandLocalX,
      hasNaN,
    };
  }

  sync(
    snapshot: PlayerStateSnapshot,
    delta: number,
    elapsed: number,
    reducedDetail = false,
    skipIk = false,
  ): void {
    this.setMicroDetailVisible(!reducedDetail && !skipIk);
    this.root.position.copy(snapshot.position);
    if (snapshot.weaponId !== undefined && snapshot.weaponId !== this.equippedWeaponId) {
      this.applyWeaponSocketForId(snapshot.weaponId);
    }

    if (this.autoSpin) {
      this.targetPreviewYaw += delta * 1.15;
    }
    if (this.previewYaw !== this.targetPreviewYaw) {
      this.previewYaw = damp(this.previewYaw, this.targetPreviewYaw, 10, delta);
      if (Math.abs(this.previewYaw - this.targetPreviewYaw) < 0.0002) {
        this.previewYaw = this.targetPreviewYaw;
      }
    }
    this.rigPivot.rotation.y = snapshot.rotation.y + this.previewYaw;

    // Advance weapon switch animation stages cleanly
    if (this.switchAnimTimer > 0) {
      this.switchAnimTimer = Math.max(0, this.switchAnimTimer - delta);
      if (this.switchAnimTimer <= 0) {
        if (this.switchStage === 1) {
          this.commitLoadoutMeshes(
            this.pendingTargetHandMesh,
            this.pendingTargetBackMeshes,
            this.pendingTargetWeaponId,
          );
          this.switchAnimDuration = this.pendingTargetHandMesh ? 0.16 : 0.12;
          this.switchAnimTimer = this.switchAnimDuration;
          this.switchStage = 2;
        } else {
          this.switchStage = 0;
          this.weaponSocket.rotation.copy(this.weaponSocketBaseEuler);
        }
      }
    }

    const baseState = this.updateLocomotionAndOverlayMixer(snapshot, delta);

    let poseUpdatedThisFrame = true;
    if (this.mixer) {
      if (reducedDetail) {
        this.lodAccumDelta += delta;
        this.lodFrameCounter = (this.lodFrameCounter + 1) % 3;
        if (this.lodFrameCounter === 0) {
          this.mixer.update(this.lodAccumDelta);
          this.lodAccumDelta = 0;
        } else {
          poseUpdatedThisFrame = false;
        }
      } else {
        if (this.lodAccumDelta > 0) {
          this.mixer.update(delta + this.lodAccumDelta);
          this.lodAccumDelta = 0;
        } else {
          this.mixer.update(delta);
        }
      }
    }

    // Keep rigPivot grounded (crouch pelvis lowering is solved anatomically via Hips + Leg IK)
    const isProne =
      Boolean(snapshot.isProne) &&
      snapshot.isAlive &&
      baseState !== 'Skydive' &&
      baseState !== 'Parachute' &&
      baseState !== 'Sit' &&
      baseState !== 'Vault' &&
      baseState !== 'Zipline' &&
      baseState !== 'Death';

    if (baseState === 'Death') {
      this.rigPivot.rotation.x = 0;
      this.rigPivot.rotation.z = 0;
      this.rigPivot.position.y = 0;
    } else {
      this.rigPivot.rotation.x = damp(this.rigPivot.rotation.x, 0, 14, delta);
      this.rigPivot.rotation.z = snapshot.airborneBankRad ?? 0;
      const targetRigY = baseState === 'Skydive' ? 0.45 : 0;
      this.rigPivot.position.y = damp(this.rigPivot.position.y, targetRigY, 14, delta);
    }

    // Solve anatomical Leg IK + ground/slope/stair contact BEFORE upper-body & arm IK so spine/chest move naturally with pelvis
    const isEmoting = Boolean(snapshot.activeEmoteId) && snapshot.isAlive && baseState !== 'Death';
    const crouchEligible = Boolean(snapshot.isCrouching) && !isProne && snapshot.isGrounded && !isEmoting;
    this.smoothedCrouchAmount = damp(this.smoothedCrouchAmount, crouchEligible ? 1 : 0, 14, delta);
    const legIkEligible =
      snapshot.isAlive &&
      snapshot.isGrounded &&
      !snapshot.isSwimming &&
      !isProne &&
      !isEmoting &&
      baseState !== 'Death' &&
      baseState !== 'Skydive' &&
      baseState !== 'Parachute' &&
      baseState !== 'SwimIdle' &&
      baseState !== 'SwimMove' &&
      baseState !== 'Sit' &&
      baseState !== 'Vault' &&
      baseState !== 'Zipline' &&
      baseState !== 'Jump' &&
      baseState !== 'Fall';
    this.smoothedLegIkWeight = isEmoting
      ? 0
      : damp(this.smoothedLegIkWeight, legIkEligible ? 1 : 0, 18, delta);

    if (
      !skipIk &&
      poseUpdatedThisFrame &&
      this.smoothedLegIkWeight > 0.01 &&
      this.hipsBone &&
      this.leftThighBone &&
      this.leftShinBone &&
      this.leftFootBone &&
      this.rightThighBone &&
      this.rightShinBone &&
      this.rightFootBone
    ) {
      this.root.getWorldPosition(this.ikTempVec);
      this.rigPivot.getWorldQuaternion(this.ikRigQuat);
      solveGroundedLegIK({
        bones: {
          hips: this.hipsBone,
          leftThigh: this.leftThighBone,
          leftShin: this.leftShinBone,
          leftFoot: this.leftFootBone,
          rightThigh: this.rightThighBone,
          rightShin: this.rightShinBone,
          rightFoot: this.rightFootBone,
        },
        rootWorldPos: this.ikTempVec,
        rigWorldQuat: this.ikRigQuat,
        crouchAmount: this.smoothedCrouchAmount,
        crouchClipWeight: this.crouchClipWeight,
        weight: this.smoothedLegIkWeight,
        groundSampler: snapshot.isLobby ? undefined : snapshot.groundHeightSampler,
      });
    }

    // Run 2-bone IK + weapon stance / healing / switch trajectory alignment on freshly evaluated mixer frames
    if (!skipIk && poseUpdatedThisFrame) {
      this.applyTwoHandedWeaponIK(snapshot, delta, elapsed, this.equippedWeaponId, baseState);
      this.stabilizeHeadAlignment(snapshot, baseState, elapsed, isProne, isEmoting);
    }

    // Contact shadow grounding
    this.contactShadowMesh.visible =
      baseState !== 'Skydive' && baseState !== 'Death';
    if (this.contactShadowMesh.visible) {
      const sScale = (baseState === 'Parachute' ? 0.55 : 1.0) * this.modelScale;
      this.contactShadowMesh.scale.setScalar(sScale);
    }
  }

  /**
   * Ensures the head stays naturally aligned forward without twisting, rolling, or spinning
   * during running, jumping, landing, and idle (both armed and unarmed).
   */
  private stabilizeHeadAlignment(
    snapshot: PlayerStateSnapshot,
    baseState: PlayerAnimationState,
    elapsed: number,
    isProne: boolean,
    isEmoting: boolean,
  ): void {
    if (
      !this.hipsBone ||
      !this.spineBone ||
      !this.chestBone ||
      !this.headBone ||
      !snapshot.isAlive ||
      isEmoting ||
      Boolean(snapshot.healingState?.active) ||
      baseState === 'Death' ||
      baseState === 'Skydive' ||
      baseState === 'Parachute' ||
      baseState === 'SwimIdle' ||
      baseState === 'SwimMove' ||
      baseState === 'Vault' ||
      baseState === 'Zipline' ||
      baseState === 'Sit'
    ) {
      return;
    }

    if (isProne) {
      // Keep neck and head cleanly aligned in the body's forward sagittal plane while lying prone
      if (this.neckBone) {
        this.headStabEuler.setFromQuaternion(this.neckBone.quaternion, 'XYZ');
        this.headStabEuler.x = clamp(this.headStabEuler.x, -0.58, -0.2);
        this.headStabEuler.y = 0;
        this.headStabEuler.z = 0;
        this.neckBone.quaternion.setFromEuler(this.headStabEuler);
      }

      this.headStabUpperQuat
        .copy(this.hipsBone.quaternion)
        .multiply(this.spineBone.quaternion)
        .multiply(this.chestBone.quaternion);
      if (this.neckBone) {
        this.headStabUpperQuat.multiply(this.neckBone.quaternion);
      }
      this.headStabFullQuat.copy(this.headStabUpperQuat).multiply(this.headBone.quaternion);
      this.headStabEuler.setFromQuaternion(this.headStabFullQuat, 'YXZ');

      // Keep head facing forward with natural slight lift toward horizon and zero sideways roll/twist
      this.headStabEuler.x = clamp(this.headStabEuler.x, -0.1, 0.3);
      this.headStabEuler.y = 0;
      this.headStabEuler.z = 0;

      this.headStabFullQuat.setFromEuler(this.headStabEuler);
      this.headBone.quaternion.copy(this.headStabUpperQuat).invert().multiply(this.headStabFullQuat);
      return;
    }

    this.headStabUpperQuat
      .copy(this.hipsBone.quaternion)
      .multiply(this.spineBone.quaternion)
      .multiply(this.chestBone.quaternion);
    if (this.neckBone) {
      this.headStabUpperQuat.multiply(this.neckBone.quaternion);
    }
    this.headStabFullQuat.copy(this.headStabUpperQuat).multiply(this.headBone.quaternion);
    this.headStabEuler.setFromQuaternion(this.headStabFullQuat, 'YXZ');

    const lobbyLook = snapshot.isLobby && baseState === 'Idle' ? Math.sin(elapsed * 0.72) * 0.055 : 0;
    const isMovingOrAir =
      baseState === 'Walk' ||
      baseState === 'Run' ||
      baseState === 'Jump' ||
      baseState === 'Fall' ||
      baseState === 'Land' ||
      baseState === 'CrouchWalk';

    this.headStabEuler.x = clamp(this.headStabEuler.x, -0.22, 0.22);
    this.headStabEuler.y = isMovingOrAir ? 0 : clamp(this.headStabEuler.y, -0.08 + lobbyLook, 0.08 + lobbyLook);
    this.headStabEuler.z = 0;

    this.headStabFullQuat.setFromEuler(this.headStabEuler);
    this.headBone.quaternion.copy(this.headStabUpperQuat).invert().multiply(this.headStabFullQuat);
  }

  private disposeCurrentRig(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    this.actions.clear();
    this.emoteActions.clear();
    this.activeAction = null;
    this.activeAnimState = null;
    this.outgoingNonLocoAction = null;
    this.outgoingNonLocoWeight = 0;
    this.groundLocoMasterWeight = 1;
    this.activeEmoteAction = null;
    this.activeEmoteId = null;
    this.activeEmoteSeq = 0;
    this.activeOverlayAction = null;
    this.activeOverlayState = null;
    this.hipsBone = null;
    this.spineBone = null;
    this.chestBone = null;
    this.neckBone = null;
    this.headBone = null;
    this.leftThighBone = null;
    this.leftShinBone = null;
    this.leftFootBone = null;
    this.rightThighBone = null;
    this.rightShinBone = null;
    this.rightFootBone = null;

    this.shadowCastMeshes.length = 0;
    if (this.modelGroup) {
      this.rigPivot.remove(this.modelGroup);
      this.modelGroup = null;
    }
    this.builtR6?.dispose();
    this.builtR6 = null;
  }

  dispose(): void {
    this.disposeCurrentRig();
    this.overlayShadowMeshes.length = 0;
    this.overlayDetailMeshes.length = 0;
    this.weaponSocket.clear();
    if (this.healingPropGroup) {
      this.healingPropGroup.removeFromParent();
      this.healingPropGroup = null;
      this.healingPropParts = {};
    }
    if (this.glooPropGroup) {
      this.glooPropGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
      this.glooPropGroup.removeFromParent();
      this.glooPropGroup = null;
    }
    this.glooCoreMat?.dispose();
    this.glooCoreMat = null;
    this.glooRingMat?.dispose();
    this.glooRingMat = null;
    this.backHolsterGroup.clear();
    this.headArmorGroup.clear();
    this.headAccessoryGroup.clear();
    this.torsoArmorGroup.clear();
    this.leftArmArmorGroup.clear();
    this.rightArmArmorGroup.clear();
    this.backAccessoryGroup.clear();
  }
}
