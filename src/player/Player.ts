import type * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { Subsystem } from '../core/Types';
import { getEmoteById } from '../emotes/EmoteCatalog';
import type {
  PlayerAnimationState,
  PlayerCollisionWorld,
  PlayerMovementInput,
  PlayerStateSnapshot,
} from './IPlayerController';
import {
  PlayerAnimationController,
  type PlayerActionAnimation,
} from './PlayerAnimationController';
import { PlayerMovement } from './PlayerMovement';
import { PlayerStats, type PlayerStatsConfig } from './PlayerStats';
import { PlayerVisuals, type PlayerGlbLoadout } from './PlayerVisuals';

const PLAYER_VISUAL_SCALE_MULTIPLIER = 0.88;

export class Player implements Subsystem {
  // Logic layer
  readonly stats: PlayerStats;
  readonly movement: PlayerMovement;
  readonly animationController: PlayerAnimationController;

  // Visuals layer (decoupled from logic for future multiplayer replication)
  readonly visuals: PlayerVisuals;

  private readonly snapshot: PlayerStateSnapshot;
  private activeEmoteId: string | null = null;
  private emoteRemaining = 0;
  private emoteSeq = 0;
  private glooDeployElapsed = 0;
  private glooDeployDuration = 0;
  private glooDeployAccentHex = '#38bdf8';
  private readonly glooDeployStateObj: { active: boolean; progress: number; accentHex: string } = {
    active: false,
    progress: 0,
    accentHex: '#38bdf8',
  };
  private glooHeld = false;
  private glooHoldAccentHex = '#38bdf8';
  private readonly glooHoldStateObj: { active: boolean; accentHex: string } = {
    active: false,
    accentHex: '#38bdf8',
  };
  private readonly zeroedEmoteInput: PlayerMovementInput = {
    moveX: 0,
    moveY: 0,
    sprint: false,
    sprintJustPressed: false,
    jump: false,
    crouch: false,
    crouchTogglePressed: false,
    crouchHoldReleased: false,
    prone: false,
    cameraYaw: 0,
    isAiming: false,
  };

  constructor(
    assetManager: AssetManager,
    world: PlayerCollisionWorld,
    statsConfig?: PlayerStatsConfig,
  ) {
    this.stats = new PlayerStats(statsConfig);
    this.movement = new PlayerMovement(this.stats, world);
    this.animationController = new PlayerAnimationController();
    this.visuals = new PlayerVisuals(assetManager);
    this.visuals.setModelScale(PLAYER_VISUAL_SCALE_MULTIPLIER);

    this.snapshot = {
      position: this.movement.position,
      rotation: this.movement.rotation,
      velocity: this.movement.velocity,
      health: this.stats.health,
      maxHealth: this.stats.maxHealth,
      shield: this.stats.shield,
      maxShield: this.stats.maxShield,
      movementSpeed: this.stats.movementSpeed,
      sprintSpeed: this.stats.sprintSpeed,
      jumpForce: this.stats.jumpForce,
      isAlive: this.stats.isAlive,
      isSprinting: this.stats.isSprinting,
      isCrouching: this.movement.isCrouching,
      isProne: this.movement.isProne,
      isGrounded: this.movement.isGrounded,
      isSwimming: this.movement.isSwimming,
      isSitting: false,
      isVaulting: false,
      isZiplining: false,
      ziplineHandlePos: this.movement.ziplineHandlePos,
      vaultMode: 'run',
      vaultProgress: 0,
      vaultSillHands: null,
      isAiming: false,
      isLobby: false,
      weaponId: null,
      animationState: 'Idle',
      activeAction: null,
      actionSeq: 0,
      activeEmoteId: null,
      emoteSeq: 0,
      reloadProgress: 0,
      reloadStyle: 'ar',
      healingState: null,
      glooDeployState: null,
      glooHoldState: null,
      groundHeightSampler: (x, z, refY) => world.getGroundHeightAt(x, z, refY),
    };
  }

  // Required Player state properties
  get position(): THREE.Vector3 {
    return this.movement.position;
  }

  get rotation(): THREE.Euler {
    return this.movement.rotation;
  }

  get velocity(): THREE.Vector3 {
    return this.movement.velocity;
  }

  get health(): number {
    return this.stats.health;
  }

  get maxHealth(): number {
    return this.stats.maxHealth;
  }

  get shield(): number {
    return this.stats.shield;
  }

  get maxShield(): number {
    return this.stats.maxShield;
  }

  get movementSpeed(): number {
    return this.stats.movementSpeed;
  }

  get sprintSpeed(): number {
    return this.stats.sprintSpeed;
  }

  get jumpForce(): number {
    return this.stats.jumpForce;
  }

  get isAlive(): boolean {
    return this.stats.isAlive;
  }

  get isSprinting(): boolean {
    return this.stats.isSprinting;
  }

  get isCrouching(): boolean {
    return this.movement.isCrouching;
  }

  get isProne(): boolean {
    return this.movement.isProne;
  }

  get animationState(): PlayerAnimationState {
    return this.animationController.getState();
  }

  triggerActionAnimation(action: PlayerActionAnimation, durationSeconds: number): void {
    this.animationController.triggerAction(action, durationSeconds);
  }

  setReloadVisualState(
    progress: number,
    style: 'smg' | 'ar' | 'shotgun' | 'sniper' = 'ar',
  ): void {
    this.snapshot.reloadProgress = progress;
    this.snapshot.reloadStyle = style;
  }

  setIsAiming(isAiming: boolean): void {
    this.snapshot.isAiming = isAiming;
  }

  setLobbyMode(isLobby: boolean): void {
    this.snapshot.isLobby = isLobby;
  }

  setHealingVisualState(state: PlayerStateSnapshot['healingState']): void {
    this.snapshot.healingState = state ?? null;
  }

  triggerGlooDeploy(accentHex = '#38bdf8', durationSeconds = 0.44): void {
    if (!this.stats.isAlive) return;
    this.glooDeployElapsed = 0;
    this.glooDeployDuration = Math.max(0.24, durationSeconds);
    this.glooDeployAccentHex = accentHex;
    this.glooDeployStateObj.active = true;
    this.glooDeployStateObj.progress = 0;
    this.glooDeployStateObj.accentHex = accentHex;
    this.snapshot.glooDeployState = this.glooDeployStateObj;
  }

  setGlooHeld(active: boolean, accentHex = '#38bdf8'): void {
    this.glooHeld = active;
    this.glooHoldAccentHex = accentHex;
    this.syncGlooHoldSnapshot();
  }

  private syncGlooHoldSnapshot(): void {
    if (this.glooHeld && this.stats.isAlive) {
      this.glooHoldStateObj.active = true;
      this.glooHoldStateObj.accentHex = this.glooHoldAccentHex;
      this.snapshot.glooHoldState = this.glooHoldStateObj;
    } else {
      this.glooHoldStateObj.active = false;
      this.snapshot.glooHoldState = null;
    }
  }

  playEmote(emoteId: string): boolean {
    const emote = getEmoteById(emoteId);
    if (!emote || !this.stats.isAlive) {
      return false;
    }
    this.activeEmoteId = emote.id;
    this.emoteRemaining = emote.durationSeconds;
    this.emoteSeq += 1;
    this.animationController.clearAction();
    this.snapshot.isAiming = false;
    this.syncSnapshotFields();
    return true;
  }

  stopEmote(): void {
    if (this.activeEmoteId === null && this.emoteRemaining === 0) return;
    this.activeEmoteId = null;
    this.emoteRemaining = 0;
    this.syncSnapshotFields();
  }

  isEmoting(): boolean {
    return this.activeEmoteId !== null && this.emoteRemaining > 0;
  }

  getActiveEmoteId(): string | null {
    return this.activeEmoteId;
  }

  updateLogic(deltaSeconds: number, input: PlayerMovementInput): void {
    if (this.activeEmoteId) {
      if (!this.stats.isAlive) {
        this.stopEmote();
      } else {
        this.emoteRemaining = Math.max(0, this.emoteRemaining - deltaSeconds);
        if (this.emoteRemaining <= 0) {
          this.stopEmote();
        }
      }
    }

    if (this.glooDeployDuration > 0) {
      if (!this.stats.isAlive) {
        this.glooDeployDuration = 0;
        this.glooDeployElapsed = 0;
      } else {
        this.glooDeployElapsed += deltaSeconds;
        if (this.glooDeployElapsed >= this.glooDeployDuration) {
          this.glooDeployDuration = 0;
          this.glooDeployElapsed = 0;
        }
      }
    }

    if (this.activeEmoteId) {
      this.snapshot.isAiming = false;
      this.zeroedEmoteInput.cameraYaw = input.cameraYaw;
      this.movement.update(deltaSeconds, this.zeroedEmoteInput);
    } else {
      this.snapshot.isAiming = Boolean(input.isAiming);
      this.movement.update(deltaSeconds, input);
    }
    this.syncSnapshotFields();
    this.snapshot.animationState = this.activeEmoteId
      ? 'Idle'
      : this.animationController.update(deltaSeconds, this.snapshot);
  }

  setAirborneVisualState(state: 'Skydive' | 'Parachute' | null, bankRad = 0): void {
    this.animationController.setAirborneOverride(state);
    this.snapshot.airborneBankRad = state ? bankRad : 0;
    if (state) {
      this.stopEmote();
      this.snapshot.animationState = state;
    } else {
      this.snapshot.animationState = this.movement.isGrounded ? 'Idle' : 'Fall';
    }
  }

  updateVisuals(deltaSeconds: number, elapsedSeconds: number): void {
    if (this.snapshot.isLobby && this.activeEmoteId) {
      this.emoteRemaining = Math.max(0, this.emoteRemaining - deltaSeconds);
      if (this.emoteRemaining <= 0) {
        this.stopEmote();
      }
    }
    this.syncSnapshotFields();
    this.visuals.sync(this.snapshot, deltaSeconds, elapsedSeconds);
  }

  reset(x = 0, z = 0): void {
    this.stats.reset();
    this.movement.resetToSpawn(x, z);
    this.animationController.clearAction();
    this.stopEmote();
    this.snapshot.airborneBankRad = 0;
    this.snapshot.reloadProgress = 0;
    this.snapshot.healingState = null;
    this.glooDeployDuration = 0;
    this.glooDeployElapsed = 0;
    this.snapshot.glooDeployState = null;
    this.glooHeld = false;
    this.snapshot.glooHoldState = null;
    this.syncSnapshotFields();
    this.snapshot.animationState = 'Idle';
  }

  setAccentColors(primaryHex: string, visorHex: string): void {
    this.visuals.setAccentColors(primaryHex, visorHex);
  }

  setModelSpec(spec: {
    humanModelId?: string;
    primaryColorHex: string;
    visorColorHex: string;
    scale: number;
  }): void {
    if (spec.humanModelId) {
      this.visuals.setHumanModelId(spec.humanModelId);
    }
    this.visuals.setAccentColors(spec.primaryColorHex, spec.visorColorHex);
    this.visuals.setModelScale(spec.scale * PLAYER_VISUAL_SCALE_MULTIPLIER);
  }

  setCustomization(custom: Parameters<PlayerVisuals['setCustomization']>[0]): void {
    this.visuals.setCustomization(custom);
  }

  setGlbLoadout(loadout: PlayerGlbLoadout): void {
    this.visuals.setGlbLoadout(loadout);
  }

  setArenaArmorTier(tier: 0 | 1 | 2 | 3 | null): void {
    this.visuals.setArenaArmorTier(tier);
  }

  setArenaGearVisuals(
    armorTier: 0 | 1 | 2 | 3 | null,
    helmetTier: 0 | 1 | 2 | 3 | null,
    backpackTier: 0 | 1 | 2 | 3 | null,
  ): void {
    this.visuals.setArenaGearVisuals(armorTier, helmetTier, backpackTier);
  }

  setPreviewYaw(yaw: number): void {
    this.visuals.setPreviewYaw(yaw);
  }

  addPreviewYawDelta(deltaYaw: number): void {
    this.visuals.addPreviewYawDelta(deltaYaw);
  }

  resetPreviewYaw(): void {
    this.visuals.resetPreviewYaw();
  }

  setAutoSpin(enabled: boolean): void {
    this.visuals.setAutoSpin(enabled);
  }

  getSnapshot(): PlayerStateSnapshot {
    this.syncSnapshotFields();
    return this.snapshot;
  }

  private syncSnapshotFields(): void {
    this.snapshot.health = this.stats.health;
    this.snapshot.maxHealth = this.stats.maxHealth;
    this.snapshot.shield = this.stats.shield;
    this.snapshot.maxShield = this.stats.maxShield;
    this.snapshot.movementSpeed = this.stats.movementSpeed;
    this.snapshot.sprintSpeed = this.stats.sprintSpeed;
    this.snapshot.jumpForce = this.stats.jumpForce;
    this.snapshot.isAlive = this.stats.isAlive;
    this.snapshot.isSprinting = this.stats.isSprinting;
    this.snapshot.isCrouching = this.movement.isCrouching;
    this.snapshot.isProne = this.movement.isProne;
    this.snapshot.isGrounded = this.movement.isGrounded;
    this.snapshot.isSwimming = this.movement.isSwimming;
    this.snapshot.isSitting = this.movement.isSitting;
    this.snapshot.isVaulting = this.movement.isVaulting;
    this.snapshot.isZiplining = this.movement.isZiplining;
    this.snapshot.ziplineHandlePos = this.movement.isZiplining
      ? this.movement.ziplineHandlePos
      : null;
    this.snapshot.vaultMode = this.movement.vaultMode;
    this.snapshot.vaultProgress = this.movement.vaultProgress;
    this.snapshot.vaultSillHands = this.movement.vaultSillHands;
    this.snapshot.activeAction = this.animationController.getActiveAction();
    this.snapshot.actionSeq = this.animationController.getActionSeq();
    this.snapshot.activeEmoteId = this.activeEmoteId;
    this.snapshot.emoteSeq = this.emoteSeq;
    if (this.glooDeployDuration > 0 && this.stats.isAlive) {
      this.glooDeployStateObj.active = true;
      this.glooDeployStateObj.progress = Math.min(1, this.glooDeployElapsed / this.glooDeployDuration);
      this.glooDeployStateObj.accentHex = this.glooDeployAccentHex;
      this.snapshot.glooDeployState = this.glooDeployStateObj;
    } else {
      this.glooDeployStateObj.active = false;
      this.glooDeployStateObj.progress = 0;
      this.snapshot.glooDeployState = null;
    }
    this.syncGlooHoldSnapshot();
  }

  dispose(): void {
    this.visuals.dispose();
  }
}
