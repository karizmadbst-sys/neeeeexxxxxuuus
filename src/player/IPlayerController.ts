import type * as THREE from 'three';

export type PlayerAnimationState =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'CrouchIdle'
  | 'CrouchWalk'
  | 'ProneIdle'
  | 'ProneMove'
  | 'Jump'
  | 'Fall'
  | 'Land'
  | 'Skydive'
  | 'Parachute'
  | 'SwimIdle'
  | 'SwimMove'
  | 'Shoot'
  | 'Reload'
  | 'PunchLeft'
  | 'PunchRight'
  | 'Vault'
  | 'Sit'
  | 'Zipline'
  | 'Death';

export interface ZiplineRidePlan {
  ziplineId: string;
  label: string;
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  archLift?: number;
  startT: number;
  reverse: boolean;
  speedMps: number;
  yaw: number;
}

export interface PlayerCollisionWorld {
  getGroundHeightAt(x: number, z: number, currentY?: number): number;
  getCeilingHeightAt?(x: number, z: number, currentY: number): number;
  getWaterSurfaceYAt?(x: number, z: number): number | null;
  getSafeCameraDistance?(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    right: THREE.Vector3,
    up: THREE.Vector3,
    probeCount?: number,
  ): number;
  raycastEnvironment?(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    near: number,
    far: number,
    outPoint: THREE.Vector3 | null,
    outNormal: THREE.Vector3 | null,
  ): number;
  resolveHorizontalCollision(
    position: THREE.Vector3,
    radius: number,
    bodyHeight?: number,
  ): void;
  getCameraCollisionMeshes(): readonly THREE.Object3D[];
  resolveSafeLootPosition?(
    x: number,
    z: number,
    yHint: number | undefined,
    out: THREE.Vector3,
    fallbackX?: number,
    fallbackZ?: number,
  ): boolean;
  hasLootLineOfSight?(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean;
  hasSolidLineOfSight?(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean;
  computeWindowVaultPlan?(
    playerPos: THREE.Vector3,
    dirX: number,
    dirZ: number,
    maxPerpDist?: number,
  ): {
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
  } | null;
}

export interface PlayerMovementInput {
  moveX: number;
  moveY: number; // +1 = forward, -1 = backward
  sprint: boolean;
  sprintJustPressed?: boolean;
  jump: boolean;
  crouch: boolean;
  crouchTogglePressed?: boolean;
  crouchHoldReleased?: boolean;
  prone?: boolean;
  cameraYaw: number;
  aimYaw?: number;
  isAiming?: boolean;
}

export interface PlayerStateSnapshot {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  velocity: THREE.Vector3;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  movementSpeed: number;
  sprintSpeed: number;
  jumpForce: number;
  isAlive: boolean;
  isSprinting: boolean;
  isCrouching: boolean;
  isProne?: boolean;
  isGrounded: boolean;
  isSwimming?: boolean;
  isSitting?: boolean;
  isVaulting?: boolean;
  isZiplining?: boolean;
  ziplineHandlePos?: THREE.Vector3 | null;
  vaultMode?: 'walk' | 'run' | 'jump';
  vaultProgress?: number;
  vaultSillHands?: {
    leftX: number;
    leftY: number;
    leftZ: number;
    rightX: number;
    rightY: number;
    rightZ: number;
    sillY: number;
    normalX: number;
    normalZ: number;
  } | null;
  isAiming?: boolean;
  isLobby?: boolean;
  weaponId?: string | null;
  animationState: PlayerAnimationState;
  activeAction?: 'Shoot' | 'Reload' | 'PunchLeft' | 'PunchRight' | null;
  actionSeq?: number;
  activeEmoteId?: string | null;
  emoteSeq?: number;
  airborneBankRad?: number;
  reloadProgress?: number;
  reloadStyle?: 'smg' | 'ar' | 'shotgun' | 'sniper';
  healingState?: {
    active: boolean;
    kind: 'bandage' | 'medkit' | 'shield' | 'syringe' | 'drink';
    progress: number;
  } | null;
  glooDeployState?: {
    active: boolean;
    progress: number;
    accentHex: string;
  } | null;
  glooHoldState?: {
    active: boolean;
    accentHex: string;
  } | null;
  groundHeightSampler?: (worldX: number, worldZ: number, refY: number) => number;
}

export interface IPlayerController {
  readonly id: string;
  update(deltaSeconds: number): void;
  getSnapshot(): PlayerStateSnapshot;
  dispose(): void;
}
