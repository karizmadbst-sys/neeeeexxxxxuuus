import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  computeWristPosFromPalmTarget,
  solveTwoBoneArmIK,
} from '../player/ArmIKSolver';
import { updateWorldMatrixChain } from '../utils/TransformUtils';
import { Weapon } from '../weapons/Weapon';
import { WEAPON_BY_ID } from '../weapons/WeaponData';
import {
  computeWeaponSocketTransform,
  getWeaponGripProfile,
  LEFT_HAND_PALM_LOCAL,
  RIGHT_HAND_PALM_LOCAL,
} from '../weapons/WeaponGripProfiles';
import type { CharacterDefinition } from './CharacterData';
import { getR6IdleClip } from './R6AnimationClips';
import { getR6CharacterPreset } from './R6CharacterCatalog';
import { buildR6CharacterModel, type BuiltR6Character } from './R6ModelBuilder';
import {
  getArmorIdFromTier,
  getArmorOption,
  normalizeR6Customization,
  type R6Customization,
} from '../player/R6CustomizationData';

export interface ProfileCharacterWeaponOptions {
  weaponId: string | null;
  weaponSkinId?: string | null;
}

export interface ProfileCharacterSnapshot {
  character: CharacterDefinition;
  customization: R6Customization;
  weaponId: string | null;
  weaponSkinId: string | null;
}

export class ProfileCharacterStage {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  private built: BuiltR6Character | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;

  private torsoArmorGroup: THREE.Group | null = null;
  private leftArmArmorGroup: THREE.Group | null = null;
  private rightArmArmorGroup: THREE.Group | null = null;
  private headAccessoryGroup: THREE.Group | null = null;
  private backAccessoryGroup: THREE.Group | null = null;
  private readonly weaponSocket = new THREE.Group();
  private attachedWeapon: Weapon | null = null;
  private attachedWeaponId: string | null = null;
  private attachedWeaponSkinId: string | null = null;

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

  private readonly ikChestPos = new THREE.Vector3();
  private readonly ikRigQuat = new THREE.Quaternion();
  private readonly ikTempEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly ikTempQuat = new THREE.Quaternion();
  private readonly ikStanceEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly ikStanceQuat = new THREE.Quaternion();
  private readonly ikDesiredWeaponQuat = new THREE.Quaternion();
  private readonly ikTempVec = new THREE.Vector3();
  private readonly ikTempVec2 = new THREE.Vector3();
  private readonly ikRightPalmPos = new THREE.Vector3();
  private readonly ikRightWristPos = new THREE.Vector3();
  private readonly ikRightHandQuat = new THREE.Quaternion();
  private readonly ikSocketQuatInv = new THREE.Quaternion();
  private readonly ikRightPoleDir = new THREE.Vector3();
  private readonly ikLeftPalmPos = new THREE.Vector3();
  private readonly ikLeftWristPos = new THREE.Vector3();
  private readonly ikLeftHandQuat = new THREE.Quaternion();
  private readonly ikLeftPoleDir = new THREE.Vector3();
  private readonly ikWeapRight = new THREE.Vector3();
  private readonly ikWeapUp = new THREE.Vector3();
  private readonly ikWeapFwd = new THREE.Vector3();
  private readonly ikHandX = new THREE.Vector3();
  private readonly ikHandY = new THREE.Vector3();
  private readonly ikHandZ = new THREE.Vector3();
  private readonly ikBasisMat = new THREE.Matrix4();
  private readonly ikSocketPos = new THREE.Vector3();
  private readonly ikSocketEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  private baseMats: THREE.Material[] = [];
  private baseGeos: THREE.BufferGeometry[] = [];
  private gearMats: THREE.Material[] = [];
  private gearGeos: THREE.BufferGeometry[] = [];

  private currentCharacter: CharacterDefinition | null = null;
  private currentCustomization: R6Customization | null = null;
  private currentWeaponId: string | null = null;
  private currentWeaponSkinId: string | null = null;
  private currentAppearanceKey = '';
  private builtWidthScale: number | null = null;
  private currentGearKey = '';

  private active = false;
  private rafHandle = 0;
  private lastTs = 0;
  private elapsedSec = 0;
  private yaw = 0.28;
  private dragging = false;
  private dragPointerId = -1;
  private lastDragX = 0;
  private resizeObserver: ResizeObserver | null = null;
  private rendererInitFailed = false;
  private disposed = false;

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.dragPointerId = e.pointerId;
    this.lastDragX = e.clientX;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.dragPointerId) return;
    const dx = e.clientX - this.lastDragX;
    this.lastDragX = e.clientX;
    this.yaw += dx * 0.012;
    if (this.built) {
      this.built.root.rotation.y = this.yaw;
      this.applyLobbyWeaponPose(this.elapsedSec);
      this.renderSingleFrame();
    }
  };

  private readonly onPointerUpOrCancel = (e: PointerEvent): void => {
    if (e.pointerId === this.dragPointerId) {
      this.dragging = false;
      this.dragPointerId = -1;
    }
  };

  constructor(private readonly isSoftwareGl = false) {
    this.element = document.createElement('div');
    this.element.setAttribute('data-profile-role', 'character-stage');
    this.element.className =
      'relative shrink-0 w-44 h-44 sm:w-48 sm:h-[420px] md:w-64 md:h-[500px] lg:w-76 lg:h-[540px] max-h-[86dvh] select-none touch-none cursor-grab active:cursor-grabbing pointer-events-auto flex items-center justify-center';

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-profile-role', 'character-canvas');
    this.canvas.className = 'w-full h-full block';
    this.element.appendChild(this.canvas);

    this.bindPointerOrbit();
  }

  getDisplayedAppearance(): ProfileCharacterSnapshot | null {
    if (!this.currentCharacter || !this.currentCustomization) return null;
    return {
      character: this.currentCharacter,
      customization: { ...this.currentCustomization },
      weaponId: this.currentWeaponId,
      weaponSkinId: this.currentWeaponSkinId,
    };
  }

  getAttachedWeaponMesh(): THREE.Object3D | null {
    return this.attachedWeapon ? this.attachedWeapon.mesh : null;
  }

  getCurrentAppearanceKey(): string {
    return this.currentAppearanceKey;
  }

  setActive(active: boolean): void {
    if (this.disposed) return;
    this.active = active;
    if (active) {
      this.ensureSceneInitialized();
      this.applyAppearanceToRig(false);
      this.syncSize();
      this.renderSingleFrame();
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  setAppearance(
    character: CharacterDefinition,
    customization: R6Customization,
    weapon?: ProfileCharacterWeaponOptions | null,
  ): void {
    if (this.disposed) return;
    const normalized = normalizeR6Customization({
      ...customization,
    } as Partial<R6Customization> & Record<string, unknown>);
    const rawWeaponId = weapon?.weaponId ?? null;
    const normalizedWeaponId =
      rawWeaponId && WEAPON_BY_ID[rawWeaponId] ? rawWeaponId : null;
    const normalizedSkinId =
      normalizedWeaponId && weapon?.weaponSkinId?.trim()
        ? weapon.weaponSkinId.trim()
        : null;
    const nextKey = this.computeAppearanceKey(
      character,
      normalized,
      normalizedWeaponId,
      normalizedSkinId,
    );
    this.currentCharacter = character;
    this.currentCustomization = normalized;
    this.currentWeaponId = normalizedWeaponId;
    this.currentWeaponSkinId = normalizedSkinId;

    if (nextKey === this.currentAppearanceKey && this.built) {
      return;
    }
    this.currentAppearanceKey = nextKey;

    if (this.active) {
      this.ensureSceneInitialized();
      this.applyAppearanceToRig(false);
      this.renderSingleFrame();
    }
  }

  private computeAppearanceKey(
    character: CharacterDefinition,
    c: R6Customization,
    weaponId: string | null,
    weaponSkinId: string | null,
  ): string {
    return [
      character.id,
      character.model.humanModelId,
      character.model.primaryColorHex,
      character.model.visorColorHex,
      c.skinId,
      c.eyesId,
      c.mouthId,
      c.faceMarkId,
      c.hairStyleId,
      c.hairColorId,
      c.topId,
      c.pantsId,
      c.shoesId,
      c.hatId,
      c.glassesId,
      c.maskId,
      c.armorId,
      c.accessoryId,
      weaponId ?? 'unarmed',
      weaponSkinId ?? 'default',
    ].join('|');
  }

  private computeGearKey(
    character: CharacterDefinition,
    c: R6Customization,
  ): string {
    return [
      c.armorId,
      c.accessoryId,
      c.glassesId,
      character.model.visorColorHex,
    ].join('|');
  }

  private ensureSceneInitialized(): void {
    if (this.renderer || this.rendererInitFailed || this.disposed) return;
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
        stencil: false,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setPixelRatio(
        this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      );
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
      scene.environment = envTarget.texture;
      roomEnv.dispose();
      pmremGenerator.dispose();
      this.envRenderTarget = envTarget;

      const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.32);
      const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.15);
      keyLight.position.set(2.4, 3.6, 3.8);
      const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
      fillLight.position.set(-2.8, 1.8, 1.8);
      const rimLight = new THREE.DirectionalLight(0xf97316, 0.92);
      rimLight.position.set(-1.6, 2.5, -3.0);
      scene.add(hemi, keyLight, fillLight, rimLight);

      // Subtle grounded pedestal shadow & ring at y = 0 so feet never float
      const shadowGeo = new THREE.CircleGeometry(0.46, 48);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x020617,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      });
      const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
      shadowDisc.position.y = 0.002;
      scene.add(shadowDisc);

      const ringGeo = new THREE.RingGeometry(0.46, 0.515, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.004;
      scene.add(ringMesh);
      this.baseGeos.push(shadowGeo, ringGeo);
      this.baseMats.push(shadowMat, ringMat);

      const camera = new THREE.PerspectiveCamera(34, 0.55, 0.1, 30);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.canvas.addEventListener('webglcontextlost', this.onContextLost);

      this.syncSize();
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.syncSize();
          if (this.active) {
            this.renderSingleFrame();
          }
        });
        this.resizeObserver.observe(this.element);
      }
    } catch {
      this.rendererInitFailed = true;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
    }
  }

  private bindPointerOrbit(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUpOrCancel);
    this.canvas.addEventListener('pointercancel', this.onPointerUpOrCancel);
  }

  private syncSize(): void {
    if (!this.renderer || !this.camera) return;
    const w = Math.max(120, this.element.clientWidth || 260);
    const h = Math.max(140, this.element.clientHeight || 460);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // Adaptive full-body framing from y = 0 (shoes) to y ~ 2.02 (hats/crowns/hair) with weapon clearance
    const halfVRad = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const tanHalfV = Math.tan(halfVRad);
    const requiredHalfHeight = 1.12;
    const requiredHalfWidth = 0.65;
    const distV = requiredHalfHeight / tanHalfV;
    const distH = requiredHalfWidth / (tanHalfV * Math.max(0.35, aspect));
    const dist = Math.max(distV, distH);
    this.camera.position.set(0.08, 1.06, dist);
    this.camera.lookAt(0, 0.94, 0);
  }

  private applyAppearanceToRig(forceRebuild: boolean): void {
    if (
      this.disposed ||
      !this.scene ||
      !this.renderer ||
      !this.currentCharacter ||
      !this.currentCustomization
    ) {
      return;
    }

    const character = this.currentCharacter;
    const customization = this.currentCustomization;
    const preset = getR6CharacterPreset(character.model.humanModelId ?? 'r6-vanguard');
    const nextGearKey = this.computeGearKey(character, customization);

    const canUpdateInPlace =
      !forceRebuild &&
      this.built !== null &&
      this.builtWidthScale !== null &&
      Math.abs(this.builtWidthScale - preset.widthScale) < 0.0001;

    if (canUpdateInPlace && this.built) {
      this.built.updateAppearance(
        preset,
        customization,
        character.model.primaryColorHex,
        character.model.visorColorHex,
      );
      if (nextGearKey !== this.currentGearKey) {
        this.rebuildGearOverlays(character, customization);
        this.currentGearKey = nextGearKey;
      }
      this.syncWeaponAttachment();
      this.mixer?.update(0);
      this.applyLobbyWeaponPose(this.elapsedSec);
      return;
    }

    this.clearCharacter();

    const built = buildR6CharacterModel(
      preset,
      customization,
      character.model.primaryColorHex,
      character.model.visorColorHex,
    );
    built.root.rotation.y = this.yaw;

    this.torsoArmorGroup = new THREE.Group();
    this.leftArmArmorGroup = new THREE.Group();
    this.rightArmArmorGroup = new THREE.Group();
    this.headAccessoryGroup = new THREE.Group();
    this.backAccessoryGroup = new THREE.Group();

    built.bones.Chest.add(this.torsoArmorGroup, this.backAccessoryGroup);
    built.bones.LeftUpperArm.add(this.leftArmArmorGroup);
    built.bones.RightUpperArm.add(this.rightArmArmorGroup);
    built.bones.Head.add(this.headAccessoryGroup);

    const leftNamedIsNegativeX = built.bones.LeftShoulder.position.x < 0;
    if (leftNamedIsNegativeX) {
      this.triggerShoulderBone = built.bones.LeftShoulder;
      this.triggerUpperArmBone = built.bones.LeftUpperArm;
      this.triggerForearmBone = built.bones.LeftForearm;
      this.triggerHandBone = built.bones.LeftHand;
      this.supportShoulderBone = built.bones.RightShoulder;
      this.supportUpperArmBone = built.bones.RightUpperArm;
      this.supportForearmBone = built.bones.RightForearm;
      this.supportHandBone = built.bones.RightHand;
    } else {
      this.triggerShoulderBone = built.bones.RightShoulder;
      this.triggerUpperArmBone = built.bones.RightUpperArm;
      this.triggerForearmBone = built.bones.RightForearm;
      this.triggerHandBone = built.bones.RightHand;
      this.supportShoulderBone = built.bones.LeftShoulder;
      this.supportUpperArmBone = built.bones.LeftUpperArm;
      this.supportForearmBone = built.bones.LeftForearm;
      this.supportHandBone = built.bones.LeftHand;
    }
    this.triggerShoulderRestQuat.copy(this.triggerShoulderBone.quaternion);
    this.supportShoulderRestQuat.copy(this.supportShoulderBone.quaternion);
    this.triggerHandBone.add(this.weaponSocket);

    this.scene.add(built.root);
    this.built = built;
    this.builtWidthScale = preset.widthScale;

    this.rebuildGearOverlays(character, customization);
    this.currentGearKey = nextGearKey;
    this.syncWeaponAttachment();

    const mixer = new THREE.AnimationMixer(built.root);
    this.mixer = mixer;
    const idleClip = getR6IdleClip();
    const idleAction = mixer.clipAction(idleClip);
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.reset().setEffectiveWeight(1).play();
    mixer.update(0.016);
    this.idleAction = idleAction;
    this.applyLobbyWeaponPose(this.elapsedSec);
  }

  private clearWeaponAttachment(): void {
    this.weaponSocket.clear();
    if (this.attachedWeapon) {
      this.attachedWeapon.mesh.removeFromParent();
      this.attachedWeapon.dispose();
      this.attachedWeapon = null;
    }
    this.attachedWeaponId = null;
    this.attachedWeaponSkinId = null;
  }

  private syncWeaponAttachment(): void {
    const weaponId = this.currentWeaponId;
    const skinId = this.currentWeaponSkinId;
    if (!weaponId || !WEAPON_BY_ID[weaponId]) {
      this.clearWeaponAttachment();
      return;
    }
    if (
      this.attachedWeapon &&
      this.attachedWeaponId === weaponId &&
      this.attachedWeaponSkinId === skinId
    ) {
      return;
    }

    if (!this.attachedWeapon || this.attachedWeaponId !== weaponId) {
      this.clearWeaponAttachment();
      const def = WEAPON_BY_ID[weaponId];
      if (!def) return;
      const weapon = new Weapon(def);
      weapon.setShadowCasting(false);
      weapon.applySkin(skinId);
      const profile = getWeaponGripProfile(weaponId);
      computeWeaponSocketTransform(profile, this.ikSocketPos, this.ikSocketEuler);
      this.weaponSocket.position.copy(this.ikSocketPos);
      this.weaponSocket.rotation.copy(this.ikSocketEuler);
      weapon.mesh.scale.setScalar(1);
      weapon.mesh.position.set(0, 0, 0);
      weapon.mesh.rotation.set(0, 0, 0);
      this.weaponSocket.add(weapon.mesh);
      this.attachedWeapon = weapon;
      this.attachedWeaponId = weaponId;
      this.attachedWeaponSkinId = skinId;
    } else if (this.attachedWeapon) {
      this.attachedWeapon.applySkin(skinId);
      this.attachedWeaponSkinId = skinId;
    }
  }

  private applyLobbyWeaponPose(elapsed: number): void {
    if (
      !this.built ||
      !this.attachedWeapon ||
      !this.attachedWeaponId ||
      !this.triggerUpperArmBone ||
      !this.triggerForearmBone ||
      !this.triggerHandBone ||
      !this.supportUpperArmBone ||
      !this.supportForearmBone ||
      !this.supportHandBone
    ) {
      return;
    }

    const profile = getWeaponGripProfile(this.attachedWeaponId);
    const anchor = profile.stances.lobby;
    const torsoYaw = anchor.torsoYaw;
    const torsoPitch = anchor.torsoPitch;

    this.ikTempEuler.set(torsoPitch * 0.45, torsoYaw * 0.45, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.built.bones.Spine.quaternion.multiply(this.ikTempQuat);

    this.ikTempEuler.set(torsoPitch * 0.55, torsoYaw * 0.55, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.built.bones.Chest.quaternion.multiply(this.ikTempQuat);

    const lobbyLook = Math.sin(elapsed * 0.72) * 0.055;
    this.ikTempEuler.set(-torsoPitch * 0.35, -torsoYaw * 0.35 + lobbyLook * 0.35, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.built.bones.Neck.quaternion.multiply(this.ikTempQuat);

    this.ikTempEuler.set(-torsoPitch * 0.65, -torsoYaw * 0.65 + lobbyLook * 0.65, 0, 'YXZ');
    this.ikTempQuat.setFromEuler(this.ikTempEuler);
    this.built.bones.Head.quaternion.multiply(this.ikTempQuat);

    updateWorldMatrixChain(null, this.built.bones.Chest);
    this.built.bones.Chest.getWorldPosition(this.ikChestPos);
    this.built.root.getWorldQuaternion(this.ikRigQuat);

    const totalScale = this.built.root.scale.y || 1;
    const bobY = Math.sin(elapsed * 1.85) * 0.009;
    const bobYaw = Math.sin(elapsed * 0.92) * 0.016;
    const bobRoll = Math.cos(elapsed * 0.92) * 0.012;

    this.ikStanceEuler.set(
      anchor.rot[0],
      anchor.rot[1] + bobYaw,
      anchor.rot[2] + bobRoll,
      'YXZ',
    );
    this.ikStanceQuat.setFromEuler(this.ikStanceEuler);
    this.ikDesiredWeaponQuat.copy(this.ikRigQuat).multiply(this.ikStanceQuat);

    this.ikTempVec.set(
      anchor.pos[0] * totalScale,
      (anchor.pos[1] + bobY) * totalScale,
      anchor.pos[2] * totalScale,
    );
    this.ikTempVec.applyQuaternion(this.ikRigQuat);
    this.ikRightPalmPos.copy(this.ikChestPos).add(this.ikTempVec);

    this.ikSocketQuatInv.copy(this.weaponSocket.quaternion).invert();
    this.ikRightHandQuat.copy(this.ikDesiredWeaponQuat).multiply(this.ikSocketQuatInv);

    computeWristPosFromPalmTarget(
      this.ikRightPalmPos,
      this.ikRightHandQuat,
      RIGHT_HAND_PALM_LOCAL,
      this.ikRightWristPos,
      totalScale,
    );

    this.ikRightPoleDir.set(-0.84, -0.42, -0.35).applyQuaternion(this.ikRigQuat);
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
      weight: 1,
      clavicleAssist: 0.16,
    });

    const weaponMesh = this.attachedWeapon.mesh;
    updateWorldMatrixChain(
      this.triggerShoulderBone?.parent ?? this.built.bones.Chest,
      weaponMesh,
    );

    if (!profile.twoHanded) return;

    const [lgx, lgy, lgz] = profile.leftGripLocal;
    const [ox, oy, oz] = profile.leftSurfaceOffset;
    this.ikLeftPalmPos.set(lgx + ox, lgy + oy, lgz + oz).applyMatrix4(weaponMesh.matrixWorld);

    weaponMesh.matrixWorld.extractBasis(this.ikWeapRight, this.ikWeapUp, this.ikWeapFwd);
    this.ikWeapRight.normalize();
    this.ikWeapUp.normalize();
    this.ikWeapFwd.normalize();

    if (profile.leftGripStyle === 'vertical_foregrip') {
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

    this.ikLeftPoleDir.set(0.56, -0.64, -0.52).applyQuaternion(this.ikRigQuat);
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
      weight: 1,
      clavicleAssist: 0.28,
    });
  }

  private clearGearOverlays(): void {
    this.torsoArmorGroup?.clear();
    this.leftArmArmorGroup?.clear();
    this.rightArmArmorGroup?.clear();
    this.headAccessoryGroup?.clear();
    this.backAccessoryGroup?.clear();
    for (let i = 0; i < this.gearMats.length; i++) {
      this.gearMats[i].dispose();
    }
    for (let i = 0; i < this.gearGeos.length; i++) {
      this.gearGeos[i].dispose();
    }
    this.gearMats.length = 0;
    this.gearGeos.length = 0;
  }

  private rebuildGearOverlays(
    character: CharacterDefinition,
    custom: R6Customization,
  ): void {
    this.clearGearOverlays();
    if (
      !this.torsoArmorGroup ||
      !this.leftArmArmorGroup ||
      !this.rightArmArmorGroup ||
      !this.headAccessoryGroup ||
      !this.backAccessoryGroup
    ) {
      return;
    }

    if (custom.armorId !== 'none') {
      const tier: 1 | 2 | 3 =
        custom.armorId === 'nether_gold_lv3'
          ? 3
          : custom.armorId === 'diamond_lv2'
            ? 2
            : 1;
      const armorSpec = getArmorOption(getArmorIdFromTier(tier));
      const plateGeo = new THREE.BoxGeometry(0.46, 0.36, 0.048);
      const emblemGeo = new THREE.BoxGeometry(0.13, 0.075, 0.028);
      this.gearGeos.push(plateGeo, emblemGeo);

      const plateMat = new THREE.MeshStandardMaterial({
        color: armorSpec.metalHex,
        roughness: 0.45,
        metalness: 0.55,
      });
      const emblemMat = new THREE.MeshStandardMaterial({
        color: tier >= 2 ? armorSpec.glowHex : armorSpec.trimHex,
        emissive: tier >= 2 ? armorSpec.glowHex : '#000000',
        emissiveIntensity: tier >= 2 ? 0.85 : 0,
        roughness: 0.26,
        metalness: 0.5,
      });
      this.gearMats.push(plateMat, emblemMat);

      const frontPlate = new THREE.Mesh(plateGeo, plateMat);
      frontPlate.position.set(0, 0.06, 0.185);
      const backPlate = new THREE.Mesh(plateGeo, plateMat);
      backPlate.position.set(0, 0.06, -0.185);
      const emblem = new THREE.Mesh(emblemGeo, emblemMat);
      emblem.position.set(0, 0.12, 0.214);
      this.torsoArmorGroup.add(frontPlate, backPlate, emblem);

      if (tier >= 2) {
        const pauldronGeo = new THREE.SphereGeometry(
          0.115,
          10,
          8,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.52,
        );
        this.gearGeos.push(pauldronGeo);
        const lp = new THREE.Mesh(pauldronGeo, plateMat);
        lp.position.set(0.032, 0.018, 0);
        lp.rotation.z = -0.32;
        this.leftArmArmorGroup.add(lp);

        const rp = new THREE.Mesh(pauldronGeo, plateMat);
        rp.position.set(-0.032, 0.018, 0);
        rp.rotation.z = 0.32;
        this.rightArmArmorGroup.add(rp);
      }
    }

    if (custom.accessoryId === 'backpack') {
      const packGeo = new THREE.CapsuleGeometry(0.145, 0.24, 8, 12);
      const pouchGeo = new THREE.BoxGeometry(0.24, 0.16, 0.07);
      this.gearGeos.push(packGeo, pouchGeo);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: '#293548',
        roughness: 0.65,
        metalness: 0.2,
      });
      const trimMat = new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#38bdf8',
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.55,
      });
      this.gearMats.push(bodyMat, trimMat);
      const body = new THREE.Mesh(packGeo, bodyMat);
      body.position.set(0, 0.04, -0.255);
      body.scale.set(1.12, 0.96, 0.7);
      const pouch = new THREE.Mesh(pouchGeo, trimMat);
      pouch.position.set(0, -0.05, -0.33);
      this.backAccessoryGroup.add(body, pouch);
    } else if (custom.accessoryId === 'cape') {
      const capeGeo = new THREE.BoxGeometry(0.56, 0.66, 0.03);
      this.gearGeos.push(capeGeo);
      const capeMat = new THREE.MeshStandardMaterial({
        color: '#991b1b',
        roughness: 0.78,
        metalness: 0.05,
      });
      this.gearMats.push(capeMat);
      const cape = new THREE.Mesh(capeGeo, capeMat);
      cape.position.set(0, -0.18, -0.195);
      cape.rotation.x = 0.12;
      this.backAccessoryGroup.add(cape);
    } else if (custom.accessoryId === 'headphones') {
      const cupGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 12);
      const bandGeo = new THREE.TorusGeometry(0.228, 0.016, 8, 18, Math.PI);
      this.gearGeos.push(cupGeo, bandGeo);
      const metalMat = new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.34,
        metalness: 0.78,
      });
      const strapMat = new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.72,
        metalness: 0.22,
      });
      this.gearMats.push(metalMat, strapMat);
      const cupL = new THREE.Mesh(cupGeo, metalMat);
      cupL.rotation.z = Math.PI / 2;
      cupL.position.set(0.215, 0.19, 0);
      const cupR = new THREE.Mesh(cupGeo, metalMat);
      cupR.rotation.z = Math.PI / 2;
      cupR.position.set(-0.215, 0.19, 0);
      const band = new THREE.Mesh(bandGeo, strapMat);
      band.position.set(0, 0.2, 0);
      this.headAccessoryGroup.add(cupL, cupR, band);
    } else if (custom.accessoryId === 'crown') {
      const crownGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.075, 8);
      this.gearGeos.push(crownGeo);
      const goldMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#b45309',
        emissiveIntensity: 0.35,
        roughness: 0.24,
        metalness: 0.85,
      });
      this.gearMats.push(goldMat);
      const crown = new THREE.Mesh(crownGeo, goldMat);
      crown.position.set(0, 0.405, 0);
      this.headAccessoryGroup.add(crown);
    } else if (custom.accessoryId === 'shades' && custom.glassesId === 'none') {
      const visorGeo = new THREE.CylinderGeometry(
        0.242,
        0.242,
        0.085,
        16,
        1,
        true,
        -0.78,
        1.56,
      );
      this.gearGeos.push(visorGeo);
      const visorMat = new THREE.MeshStandardMaterial({
        color: character.model.visorColorHex,
        emissive: character.model.visorColorHex,
        emissiveIntensity: 0.42,
        transparent: true,
        opacity: 0.36,
        roughness: 0.12,
        metalness: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.gearMats.push(visorMat);
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.2, 0.015);
      visor.scale.set(0.92, 0.85, 0.96);
      visor.renderOrder = 2;
      this.headAccessoryGroup.add(visor);
    }
  }

  private renderSingleFrame(): void {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private readonly tick = (now: number): void => {
    if (this.disposed || !this.active) {
      this.rafHandle = 0;
      return;
    }
    const rawDt = Math.max(0.001, (now - this.lastTs) / 1000);
    const dt = Math.min(0.1, rawDt);
    this.lastTs = now;
    this.elapsedSec += dt;
    if (this.mixer) {
      this.mixer.update(dt);
    }
    this.applyLobbyWeaponPose(this.elapsedSec);
    this.renderSingleFrame();
    this.rafHandle = window.requestAnimationFrame(this.tick);
  };

  private startLoop(): void {
    if (this.rafHandle || this.disposed || !this.active || !this.renderer) return;
    this.lastTs = performance.now();
    this.rafHandle = window.requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.rafHandle) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
  }

  private clearCharacter(): void {
    this.clearGearOverlays();
    this.clearWeaponAttachment();
    this.weaponSocket.removeFromParent();
    this.triggerShoulderBone = null;
    this.triggerUpperArmBone = null;
    this.triggerForearmBone = null;
    this.triggerHandBone = null;
    this.supportShoulderBone = null;
    this.supportUpperArmBone = null;
    this.supportForearmBone = null;
    this.supportHandBone = null;
    if (this.idleAction) {
      this.idleAction.stop();
      this.idleAction = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.built) {
        this.mixer.uncacheRoot(this.built.root);
      }
      this.mixer = null;
    }
    if (this.built && this.scene) {
      this.scene.remove(this.built.root);
      this.built.dispose();
      this.built = null;
    }
    this.torsoArmorGroup = null;
    this.leftArmArmorGroup = null;
    this.rightArmArmorGroup = null;
    this.headAccessoryGroup = null;
    this.backAccessoryGroup = null;
    this.builtWidthScale = null;
    this.currentGearKey = '';
  }

  dispose(): void {
    this.disposed = true;
    this.active = false;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUpOrCancel);
    this.canvas.removeEventListener('pointercancel', this.onPointerUpOrCancel);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);

    this.clearCharacter();
    for (let i = 0; i < this.baseMats.length; i++) {
      this.baseMats[i].dispose();
    }
    for (let i = 0; i < this.baseGeos.length; i++) {
      this.baseGeos[i].dispose();
    }
    this.baseMats.length = 0;
    this.baseGeos.length = 0;

    if (this.scene) {
      this.scene.environment = null;
    }
    this.envRenderTarget?.dispose();
    this.envRenderTarget = null;

    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}
