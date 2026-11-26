import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { Subsystem } from '../core/Types';
import type { InputMoveVector } from '../input/InputManager';
import type { MapId } from '../maps/IMapSystem';
import type { MapConfig } from '../maps/MapData';
import type { MapManager } from '../maps/MapManager';
import type { Player } from '../player/Player';
import { clamp, damp } from '../utils/MathUtils';
import { AirplaneModel } from './AirplaneModel';
import {
  type AirplaneDropSnapshot,
  type DropPhase,
  type FlightPathSpec,
  MAP_FLIGHT_PATHS,
} from './IAirplaneDropSystem';
import { SkydivingEffects } from './SkydivingEffects';

const MANUAL_PARACHUTE_MIN_DELAY_SEC = 0.22;
const GRAVITY_ACCEL = 19.5;
const FREEFALL_DRAG_SPREAD = 0.0155; // ~35.5 m/s terminal velocity
const FREEFALL_DRAG_DIVE = 0.0068; // ~53.5 m/s headfirst terminal velocity
const CHUTE_TARGET_DESCENT_MPS = 6.5; // Smooth canopy descent (~30s glide = full 1.1 km map reach)

const _anchorWorld = new THREE.Vector3();

export class AirplaneDropManager implements Subsystem {
  readonly root = new THREE.Group();

  private readonly airplane = new AirplaneModel();
  private readonly effects = new SkydivingEffects();

  private phase: DropPhase = 'inactive';
  private activeConfig: MapConfig | null = null;
  private activeFlight: FlightPathSpec = MAP_FLIGHT_PATHS.desert[0];

  private flightProgress = 0;
  private flightDurationSec = 20;
  private airplaneHeadingRad = 0;
  private readonly airplanePos = new THREE.Vector3();

  private readonly velocity = new THREE.Vector3();
  private targetYawRad = 0;
  private bankRad = 0;
  private groundElevationMeters = 0;
  private altitudeMeters = 0;
  private airborneBankVisual = 0;
  private freefallElapsedSec = 0;
  private prevPlayerY = 200;

  private onLandedCallback?: () => void;
  private onJumpCallback?: () => void;
  private onDeployChuteCallback?: () => void;
  private onWaitingCompleteCallback?: () => void;
  private externalFlightProgress: number | null = null;
  private externalWaitingRemainingSec: number | null = null;
  private waitingDurationSec = 30;
  private waitingRemainingSec = 0;

  constructor(
    private readonly mapManager: MapManager,
    private readonly player: Player,
    private readonly audioManager: AudioManager,
    isCompactDevice = false,
  ) {
    this.airplane.root.visible = false;
    this.effects.setCompactMode(isCompactDevice);
    this.root.add(this.airplane.root);
    this.root.add(this.effects.root);
  }

  setOnLandedCallback(cb: () => void): void {
    this.onLandedCallback = cb;
  }

  setOnlineSyncCallbacks(
    callbacks: {
      onJump?: () => void;
      onDeployChute?: () => void;
    } | null,
  ): void {
    this.onJumpCallback = callbacks?.onJump;
    this.onDeployChuteCallback = callbacks?.onDeployChute;
  }

  setOnWaitingCompleteCallback(cb?: () => void): void {
    this.onWaitingCompleteCallback = cb;
  }

  setServerFlightProgress(progress: number | null): void {
    this.externalFlightProgress = progress;
  }

  setServerWaitingRemainingSec(sec: number | null): void {
    this.externalWaitingRemainingSec = sec;
    if (sec !== null && this.phase === 'waiting') {
      this.waitingRemainingSec = Math.max(0, sec);
    }
  }

  setParachuteColors(primaryHex: string, accentHex: string): void {
    this.effects.setParachuteColors(primaryHex, accentHex);
  }

  isAirborne(): boolean {
    return this.phase === 'airplane' || this.phase === 'freefall' || this.phase === 'parachute';
  }

  getPhase(): DropPhase {
    return this.phase;
  }

  getAirborneBankRad(): number {
    return this.airborneBankVisual;
  }

  startWaitingArena(
    config: MapConfig,
    matchSeed = Date.now(),
    durationSec = 30,
    forcedRouteIdx?: number,
    spawnPos?: { x: number; z: number; yaw?: number },
    destinationMapId?: MapId,
  ): void {
    this.activeConfig = config;
    const paths = MAP_FLIGHT_PATHS[destinationMapId ?? config.id];
    const routeIdx =
      forcedRouteIdx !== undefined
        ? Math.abs(forcedRouteIdx) % paths.length
        : Math.abs(matchSeed) % paths.length;
    this.activeFlight = paths[routeIdx];

    const dx = this.activeFlight.endX - this.activeFlight.startX;
    const dz = this.activeFlight.endZ - this.activeFlight.startZ;
    const distance = Math.max(10, Math.hypot(dx, dz));
    this.flightDurationSec = distance / Math.max(10, this.activeFlight.speedMps);
    this.airplaneHeadingRad = Math.atan2(dx, dz);
    this.flightProgress = 0;

    this.phase = 'waiting';
    this.waitingDurationSec = Math.max(1, durationSec);
    this.waitingRemainingSec =
      this.externalWaitingRemainingSec !== null
        ? Math.max(0, this.externalWaitingRemainingSec)
        : this.waitingDurationSec;
    this.velocity.set(0, 0, 0);
    this.bankRad = 0;
    this.airborneBankVisual = 0;
    this.freefallElapsedSec = 0;

    this.effects.reset();
    this.airplane.root.visible = false;
    this.audioManager.setAirborneAudio('inactive', 0);

    const primarySpawn = this.mapManager.spawnPointManager.getPrimarySpawn();
    const sx = spawnPos ? spawnPos.x : primarySpawn.x;
    const sz = spawnPos ? spawnPos.z : primarySpawn.z;
    const sy = this.mapManager.getGroundHeightAt(sx, sz, 12);
    const syaw = spawnPos?.yaw ?? primarySpawn.yaw;

    this.player.reset(sx, sz);
    this.player.position.set(sx, sy, sz);
    this.prevPlayerY = sy;
    this.player.rotation.set(0, syaw, 0, 'YXZ');
    this.player.velocity.set(0, 0, 0);
    this.player.movement.velocity.set(0, 0, 0);
    this.player.movement.isGrounded = true;
    this.player.setAirborneVisualState(null, 0);
    this.updateAltitudeTelemetry();
  }

  updateWaiting(delta: number): void {
    if (this.phase !== 'waiting') return;
    if (this.externalWaitingRemainingSec !== null) {
      this.waitingRemainingSec = Math.max(0, this.externalWaitingRemainingSec);
      return;
    }
    this.waitingRemainingSec = Math.max(0, this.waitingRemainingSec - delta);
    if (this.waitingRemainingSec <= 0) {
      this.onWaitingCompleteCallback?.();
    }
  }

  startMatchDrop(config: MapConfig, matchSeed = Date.now(), forcedRouteIdx?: number): void {
    this.waitingRemainingSec = 0;
    this.externalWaitingRemainingSec = null;
    this.activeConfig = config;
    const paths = MAP_FLIGHT_PATHS[config.id];
    const routeIdx =
      forcedRouteIdx !== undefined
        ? Math.abs(forcedRouteIdx) % paths.length
        : Math.abs(matchSeed) % paths.length;
    this.activeFlight = paths[routeIdx];

    const dx = this.activeFlight.endX - this.activeFlight.startX;
    const dz = this.activeFlight.endZ - this.activeFlight.startZ;
    const distance = Math.max(10, Math.hypot(dx, dz));
    this.flightDurationSec = distance / Math.max(10, this.activeFlight.speedMps);
    this.airplaneHeadingRad = Math.atan2(dx, dz);

    // Start aircraft slightly inside the map perimeter so the ground & landmarks are immediately below
    this.flightProgress = this.externalFlightProgress ?? 0.08;
    this.phase = 'airplane';
    this.velocity.set(0, 0, 0);
    this.bankRad = 0;
    this.airborneBankVisual = 0;
    this.freefallElapsedSec = 0;

    this.effects.reset();
    this.airplane.root.visible = true;
    this.syncAirplaneTransform(0);

    // Spawn player standing at the open rear cargo jump ramp inside the airplane
    this.airplane.jumpBayAnchor.getWorldPosition(_anchorWorld);
    this.player.position.copy(_anchorWorld);
    this.prevPlayerY = this.player.position.y;
    this.player.rotation.set(0, this.airplaneHeadingRad, 0, 'YXZ');
    this.player.velocity.set(0, 0, 0);
    this.player.movement.isGrounded = false;
    this.player.setAirborneVisualState(null, 0);

    this.updateAltitudeTelemetry();
    this.audioManager.setAirborneAudio('airplane', 0);
  }

  spawnGroundedAtPrimary(config: MapConfig): void {
    this.waitingRemainingSec = 0;
    this.externalWaitingRemainingSec = null;
    this.activeConfig = config;
    this.flightProgress = 1;
    this.phase = 'landed';
    this.velocity.set(0, 0, 0);
    this.bankRad = 0;
    this.airborneBankVisual = 0;
    this.freefallElapsedSec = 0;

    this.effects.reset();
    this.airplane.root.visible = false;

    const primarySpawn = this.mapManager.spawnPointManager.getPrimarySpawn();
    const sy = this.mapManager.getGroundHeightAt(primarySpawn.x, primarySpawn.z, 12);
    this.player.reset(primarySpawn.x, primarySpawn.z);
    this.player.position.set(primarySpawn.x, sy, primarySpawn.z);
    this.prevPlayerY = sy;
    this.player.rotation.set(0, primarySpawn.yaw, 0, 'YXZ');
    this.player.velocity.set(0, 0, 0);
    this.player.movement.velocity.set(0, 0, 0);
    this.player.movement.isGrounded = true;
    this.player.setAirborneVisualState(null, 0);

    this.updateAltitudeTelemetry();
    this.altitudeMeters = 0;
    this.audioManager.setAirborneAudio('landed', 0);
  }

  deactivate(): void {
    this.phase = 'inactive';
    this.waitingRemainingSec = 0;
    this.externalWaitingRemainingSec = null;
    this.airplane.root.visible = false;
    this.effects.reset();
    this.player.setAirborneVisualState(null, 0);
    this.audioManager.setAirborneAudio('inactive', 0);
  }

  triggerJump(): boolean {
    if (this.phase !== 'airplane') return false;

    this.phase = 'freefall';
    this.freefallElapsedSec = 0;
    this.airplane.jumpBayAnchor.getWorldPosition(_anchorWorld);
    this.player.position.copy(_anchorWorld);
    this.prevPlayerY = this.player.position.y;

    // Inherit partial aircraft forward momentum + clean downward drop impulse
    const fwdX = Math.sin(this.airplaneHeadingRad);
    const fwdZ = Math.cos(this.airplaneHeadingRad);
    this.velocity.set(
      fwdX * (this.activeFlight.speedMps * 0.42),
      -7.5,
      fwdZ * (this.activeFlight.speedMps * 0.42),
    );
    this.targetYawRad = this.airplaneHeadingRad;
    this.player.rotation.y = this.airplaneHeadingRad;
    this.player.velocity.copy(this.velocity);
    this.player.movement.isGrounded = false;
    this.player.setAirborneVisualState('Skydive', 0);

    this.audioManager.playAirplaneJump();
    this.audioManager.setAirborneAudio('freefall', 0.25);
    this.onJumpCallback?.();
    return true;
  }

  triggerParachuteDeploy(): boolean {
    if (this.phase !== 'freefall') return false;
    if (this.freefallElapsedSec < MANUAL_PARACHUTE_MIN_DELAY_SEC) return false;
    if (this.player.position.y <= this.groundElevationMeters + 0.14) return false;

    this.openParachute();
    return true;
  }

  private openParachute(): void {
    this.phase = 'parachute';
    this.effects.triggerParachuteOpen();
    this.player.setAirborneVisualState('Parachute', 0);
    this.audioManager.playParachuteDeploy();
    this.audioManager.setAirborneAudio('parachute', 0);
    this.onDeployChuteCallback?.();
  }

  update(
    delta: number,
    elapsed: number,
    moveVec: InputMoveVector,
    cameraYaw: number,
    cameraPitch: number,
    jumpPressed: boolean,
  ): void {
    if (this.phase === 'inactive' || this.phase === 'waiting' || this.phase === 'landed') return;

    // Airplane always keeps flying cleanly across the map even after player jumps
    if (this.externalFlightProgress !== null) {
      this.flightProgress = Math.max(this.flightProgress, this.externalFlightProgress);
    }
    if (this.flightProgress < 1.08) {
      this.flightProgress += delta / this.flightDurationSec;
      this.syncAirplaneTransform(elapsed);
      this.airplane.update(delta, elapsed);
      if (this.flightProgress >= 1.08 && this.phase !== 'airplane') {
        this.airplane.root.visible = false;
      }
    } else {
      this.airplane.root.visible = false;
    }

    if (this.phase === 'airplane') {
      this.airplane.jumpBayAnchor.getWorldPosition(_anchorWorld);
      this.player.position.copy(_anchorWorld);
      this.player.rotation.set(0, this.airplaneHeadingRad, 0, 'YXZ');
      this.player.velocity.set(0, 0, 0);
      this.player.movement.isGrounded = false;
      this.updateAltitudeTelemetry();
      this.audioManager.setAirborneAudio('airplane', 0);

      if (jumpPressed || this.flightProgress >= 0.94) {
        this.triggerJump();
      }
      return;
    }

    this.prevPlayerY = this.player.position.y;

    if (this.phase === 'freefall') {
      this.freefallElapsedSec += delta;
      this.updateFreefallPhysics(delta, moveVec, cameraYaw, cameraPitch);
      this.mapManager.resolveAirborneCollision(this.player.position, 0.48);
      this.updateAltitudeTelemetry();

      // Check touchdown before manual chute trigger so freefall without chute lands directly
      if (this.player.position.y <= this.groundElevationMeters + 0.14) {
        this.completeLanding();
        return;
      }

      const totalSpeed = this.velocity.length();
      this.audioManager.setAirborneAudio('freefall', clamp((totalSpeed - 12) / 45, 0.15, 1));

      if (jumpPressed && this.freefallElapsedSec >= MANUAL_PARACHUTE_MIN_DELAY_SEC) {
        this.openParachute();
      }
    } else if (this.phase === 'parachute') {
      this.updateParachutePhysics(delta, moveVec, cameraYaw);
      this.mapManager.resolveAirborneCollision(this.player.position, 0.48);
      this.updateAltitudeTelemetry();
      this.audioManager.setAirborneAudio('parachute', 0);
    }

    this.player.velocity.copy(this.velocity);
    this.player.setAirborneVisualState(
      this.phase === 'freefall' ? 'Skydive' : 'Parachute',
      this.airborneBankVisual,
    );

    this.effects.update(
      delta,
      elapsed,
      this.phase,
      this.player.position,
      this.player.rotation.y,
      this.airborneBankVisual,
      this.velocity.y,
      this.velocity.length(),
    );

    // Check touchdown with terrain, rooftop, or elevated walkway
    if (this.player.position.y <= this.groundElevationMeters + 0.14) {
      this.completeLanding();
    }
  }

  private syncAirplaneTransform(elapsed: number): void {
    const f = this.activeFlight;
    const t = this.flightProgress;
    this.airplanePos.set(
      f.startX + (f.endX - f.startX) * t,
      f.altitude + Math.sin(elapsed * 0.9) * 0.55,
      f.startZ + (f.endZ - f.startZ) * t,
    );
    this.airplane.root.position.copy(this.airplanePos);
    this.airplane.root.rotation.set(
      Math.sin(elapsed * 1.1) * 0.015,
      this.airplaneHeadingRad,
      Math.sin(elapsed * 0.7) * 0.03,
      'YXZ',
    );
  }

  private updateFreefallPhysics(
    delta: number,
    moveVec: InputMoveVector,
    cameraYaw: number,
    cameraPitch: number,
  ): void {
    // Camera forward in XZ plane (matches PlayerMovement convention)
    const fwdX = -Math.sin(cameraYaw);
    const fwdZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    const wishX = fwdX * moveVec.y + rightX * moveVec.x;
    const wishZ = fwdZ * moveVec.y + rightZ * moveVec.x;
    const hasSteer = wishX * wishX + wishZ * wishZ > 0.01;

    // Headfirst steep dive when pressing forward (W) or pitching camera steeply downward
    const divingSteeply = moveVec.y > 0.35 || (hasSteer && cameraPitch > 0.62);
    const targetHorizSpeed = divingSteeply ? 26.5 : hasSteer ? 18.5 : 8.5;
    const dragCoeff = divingSteeply ? FREEFALL_DRAG_DIVE : FREEFALL_DRAG_SPREAD;

    // Aerodynamic vertical fall with quadratic air resistance
    const vy = this.velocity.y;
    const dragForce = dragCoeff * vy * Math.abs(vy);
    this.velocity.y += (-GRAVITY_ACCEL + dragForce) * delta;
    this.velocity.y = clamp(this.velocity.y, -58, -4);

    // Smooth horizontal steering & inertia
    const targetVx = hasSteer ? wishX * targetHorizSpeed : this.velocity.x * 0.92;
    const targetVz = hasSteer ? wishZ * targetHorizSpeed : this.velocity.z * 0.92;
    const steerRate = hasSteer ? 3.2 : 1.4;
    this.velocity.x = damp(this.velocity.x, targetVx, steerRate, delta);
    this.velocity.z = damp(this.velocity.z, targetVz, steerRate, delta);

    this.player.position.x += this.velocity.x * delta;
    this.player.position.y += this.velocity.y * delta;
    this.player.position.z += this.velocity.z * delta;

    // Smooth aerodynamic facing & roll bank
    if (hasSteer) {
      this.targetYawRad = Math.atan2(wishX, wishZ);
    }
    this.smoothRotatePlayerYaw(delta, 5.5);
    const desiredBank = -moveVec.x * 0.42;
    this.bankRad = damp(this.bankRad, desiredBank, 6.5, delta);
    this.airborneBankVisual = this.bankRad;
  }

  private updateParachutePhysics(
    delta: number,
    moveVec: InputMoveVector,
    cameraYaw: number,
  ): void {
    const fwdX = -Math.sin(cameraYaw);
    const fwdZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    const rawX = fwdX * moveVec.y + rightX * moveVec.x;
    const rawZ = fwdZ * moveVec.y + rightZ * moveVec.x;
    const rawLenSq = rawX * rawX + rawZ * rawZ;
    const hasSteer = rawLenSq > 0.01;
    const steerMag = hasSteer ? Math.min(1, Math.sqrt(rawLenSq)) : 0;
    const wishX = hasSteer ? rawX / Math.sqrt(rawLenSq) : 0;
    const wishZ = hasSteer ? rawZ / Math.sqrt(rawLenSq) : 0;

    // Realistic canopy sink rate: fast dive-glide forward (W), gentle brake flare (S), or steady glide
    const fastGlide = moveVec.y > 0.35;
    const brakingFlare = moveVec.y < -0.35;
    const targetVy = fastGlide
      ? -10.2
      : brakingFlare
        ? -5.6
        : -CHUTE_TARGET_DESCENT_MPS;
    this.velocity.y = damp(this.velocity.y, targetVy, 5.4, delta);

    // Full 360-degree omnidirectional glide allowing travel to ANY point on the 1.1 km map
    const glideSpeed = fastGlide
      ? 34.0
      : brakingFlare
        ? 16.0
        : hasSteer
          ? 26.5 * steerMag
          : 7.5;
    const targetVx = hasSteer ? wishX * glideSpeed : fwdX * 7.5;
    const targetVz = hasSteer ? wishZ * glideSpeed : fwdZ * 7.5;

    this.velocity.x = damp(this.velocity.x, targetVx, 4.2, delta);
    this.velocity.z = damp(this.velocity.z, targetVz, 4.2, delta);

    this.player.position.x += this.velocity.x * delta;
    this.player.position.y += this.velocity.y * delta;
    this.player.position.z += this.velocity.z * delta;

    if (hasSteer) {
      this.targetYawRad = Math.atan2(wishX, wishZ);
    } else {
      this.targetYawRad = cameraYaw + Math.PI;
    }
    this.smoothRotatePlayerYaw(delta, 5.2);
    const desiredBank = -moveVec.x * 0.32;
    this.bankRad = damp(this.bankRad, desiredBank, 5.5, delta);
    this.airborneBankVisual = this.bankRad;
  }

  private smoothRotatePlayerYaw(delta: number, rate: number): void {
    let diff = this.targetYawRad - this.player.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.player.rotation.y += diff * (1 - Math.exp(-rate * delta));
  }

  private completeLanding(): void {
    const safeY = this.mapManager.resolveSafeLandingPosition(
      this.player.position,
      this.prevPlayerY,
      0.48,
    );
    this.groundElevationMeters = safeY;
    this.player.position.y = safeY;
    this.player.velocity.set(0, 0, 0);
    this.player.movement.velocity.set(0, 0, 0);
    this.player.movement.isGrounded = true;
    this.player.setAirborneVisualState(null, 0);

    this.phase = 'landed';
    this.altitudeMeters = 0;
    this.effects.triggerLandingDust(
      this.player.position.x,
      safeY,
      this.player.position.z,
    );
    this.audioManager.playLandingThud();
    this.audioManager.setAirborneAudio('landed', 0);
    this.onLandedCallback?.();
  }

  private updateAltitudeTelemetry(): void {
    const gx = this.player.position.x;
    const gz = this.player.position.z;
    // Query ground/rooftop height below current/previous position so fast frames never tunnel past roofs
    const queryY = Math.max(this.prevPlayerY, this.player.position.y) + 0.85;
    this.groundElevationMeters = this.mapManager.getGroundHeightAt(gx, gz, queryY);
    this.altitudeMeters = Math.max(0, this.player.position.y - this.groundElevationMeters);
  }

  updatePassiveEffects(delta: number, elapsed: number): void {
    // Keep dust fade & disappearing plane running briefly after landing
    if (this.phase === 'landed') {
      if (this.airplane.root.visible) {
        if (this.flightProgress < 1.1) {
          this.flightProgress += delta / this.flightDurationSec;
          this.syncAirplaneTransform(elapsed);
          this.airplane.update(delta, elapsed);
        } else {
          this.airplane.root.visible = false;
        }
      }
      this.effects.update(
        delta,
        elapsed,
        this.phase,
        this.player.position,
        this.player.rotation.y,
        0,
        0,
        0,
      );
    }
  }

  getSnapshot(): AirplaneDropSnapshot {
    const cfg = this.activeConfig ?? this.mapManager.getActiveConfig();
    const clampedProg = clamp(this.flightProgress, 0, 1);
    const remainingSec = Math.max(0, (0.94 - this.flightProgress) * this.flightDurationSec);
    return {
      phase: this.phase,
      mapId: cfg.id,
      mapName: cfg.name,
      flightLabel: this.activeFlight.label,
      altitudeMeters: this.altitudeMeters,
      groundElevationMeters: this.groundElevationMeters,
      flightProgress: clampedProg,
      verticalSpeedMps: Math.abs(this.velocity.y),
      horizontalSpeedMps: Math.hypot(this.velocity.x, this.velocity.z),
      totalSpeedMps: this.velocity.length(),
      canJump: this.phase === 'airplane',
      canDeployParachute:
        this.phase === 'freefall' &&
        this.freefallElapsedSec >= MANUAL_PARACHUTE_MIN_DELAY_SEC,
      autoDeployDelaySec: 0,
      autoDeployRemainingSec: 0,
      deployMaxAltitudeMeters: 0,
      autoDeployAltitudeMeters: 0,
      airplaneX: this.airplanePos.x,
      airplaneY: this.airplanePos.y,
      airplaneZ: this.airplanePos.z,
      flightStartX: this.activeFlight.startX,
      flightStartZ: this.activeFlight.startZ,
      flightEndX: this.activeFlight.endX,
      flightEndZ: this.activeFlight.endZ,
      airplaneHeadingRad: this.airplaneHeadingRad,
      timeRemainingInPlaneSec: remainingSec,
      waitingRemainingSec: this.waitingRemainingSec,
      waitingDurationSec: this.waitingDurationSec,
    };
  }

  dispose(): void {
    this.deactivate();
    this.airplane.dispose();
    this.effects.dispose();
  }
}
