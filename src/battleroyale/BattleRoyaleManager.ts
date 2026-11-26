import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { AssetManager } from '../core/AssetManager';
import type { QualityPreset, Subsystem } from '../core/Types';
import type { AirplaneDropSnapshot } from '../drop/IAirplaneDropSystem';
import type { LootManager } from '../loot/LootManager';
import type { LootPoint, MinimapMarker } from '../maps/IMapSystem';
import type { MapConfig } from '../maps/MapData';
import type { MapManager } from '../maps/MapManager';
import type { Player } from '../player/Player';
import type { KillFeedEntry, ServerZoneState } from '../ranked/RankedTypes';
import { clamp } from '../utils/MathUtils';
import { DamageSystem } from '../weapons/DamageSystem';
import type { HitDetection } from '../weapons/HitDetection';
import { FISTS_WEAPON_DEF } from '../weapons/MeleeSystem';
import type { SafeZoneState } from '../zone/IZoneSystem';
import {
  BOT_CALLSIGNS,
  BR_SQUAD_FILL_PRESETS,
  type BattleRoyaleEliminationPayload,
  type BattleRoyaleMatchConfig,
  type BattleRoyaleResultPayload,
  type BotDifficulty,
  type BotPersonality,
  type SquadFillMemberPreset,
} from './BattleRoyaleTypes';
import {
  BotBrain,
  type BotFireRequest,
  type BotMeleeRequest,
  type BrainUpdateContext,
  type BuildingPoiWaypoint,
  type CombatantTargetInfo,
} from './BotBrain';
import { BotEntity } from './BotEntity';

const BOT_FISTS_DEF = {
  ...FISTS_WEAPON_DEF,
  damage: 20,
  headshotDamage: 32,
};

interface TracerSlot {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
}

interface ZonePhaseSpec {
  phase: number;
  holdSec: number;
  shrinkSec: number;
  endRadius: number;
  damagePerSec: number;
}

const ZONE_PHASES: readonly ZonePhaseSpec[] = [
  { phase: 1, holdSec: 120, shrinkSec: 40, endRadius: 340, damagePerSec: 3 },
  { phase: 2, holdSec: 80, shrinkSec: 40, endRadius: 215, damagePerSec: 6 },
  { phase: 3, holdSec: 80, shrinkSec: 40, endRadius: 120, damagePerSec: 10 },
  { phase: 4, holdSec: 80, shrinkSec: 40, endRadius: 52, damagePerSec: 15 },
  { phase: 5, holdSec: 80, shrinkSec: 40, endRadius: 10, damagePerSec: 22 },
];

const MAX_BOT_TRACERS = 64;

const PERSONALITIES: readonly BotPersonality[] = [
  'rusher',
  'loot-master',
  'sniper-scout',
  'survivor',
  'flanker',
];

function nextLcg(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

export interface BattleRoyaleCallbacks {
  onKillFeed: (entry: KillFeedEntry) => void;
  onPlayerDamaged: (damage: number, attackerName: string, weaponName: string, isHeadshot: boolean) => void;
  onPlayerEliminated: (payload: BattleRoyaleEliminationPayload) => void;
  onPlayerKillConfirmed: (victimName: string, kills: number) => void;
  onCombatElimination?: (info: {
    killerId: string | null;
    killerName: string;
    victimId: string;
    victimName: string;
    weaponName: string;
    isHeadshot: boolean;
    victimX: number;
    victimY: number;
    victimZ: number;
  }) => void;
  onMatchResult: (result: BattleRoyaleResultPayload) => void;
  onZoneDamagePlayer: (dmg: number) => void;
  onAliveCountChanged?: (aliveCount: number) => void;
}

export class BattleRoyaleManager implements Subsystem {
  readonly root = new THREE.Group();

  private readonly bots: BotEntity[] = [];
  private readonly brains: BotBrain[] = [];
  private readonly botById = new Map<string, BotEntity>();
  private readonly botStepAccum: number[] = [];
  private readonly waypoints: BuildingPoiWaypoint[] = [];
  private readonly waypointById = new Map<string, BuildingPoiWaypoint>();

  private readonly tracers: TracerSlot[] = [];
  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly tracerGeo: THREE.BoxGeometry;
  private readonly tracerMat: THREE.MeshBasicMaterial;
  private readonly scratchMat = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3(1, 1, 1);
  private readonly scratchFwd = new THREE.Vector3(0, 0, 1);
  private readonly scratchDir = new THREE.Vector3();
  private readonly scratchOrigin = new THREE.Vector3();
  private readonly scratchTargetPt = new THREE.Vector3();
  private readonly airplanePosScratch = new THREE.Vector3();
  private readonly combatantsScratch: CombatantTargetInfo[] = [];
  private readonly combatantById = new Map<string, CombatantTargetInfo>();
  private readonly selfCombatantScratch: CombatantTargetInfo = {
    id: 'local-player',
    teamId: 'player-squad',
    name: 'YOU',
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    isCrouching: false,
    isGrounded: true,
  };
  private readonly botCombatantPool = new Map<string, CombatantTargetInfo>();
  private readonly losBudgetScratch = { remaining: 0 };
  private readonly botShotHitScratch = {
    hit: false,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    distance: 0,
    target: null as import('../weapons/HitDetection').DamageableTarget | null,
    isHeadshot: false,
  };
  private activePlayer: Player | null = null;
  private activeLootManager: LootManager | null = null;
  private readonly activeViewerPos = new THREE.Vector3();
  private readonly fireRequestHandler = (req: BotFireRequest): void => {
    if (!this.activePlayer || !this.activeLootManager) return;
    this.resolveBotShot(req, this.activePlayer, this.activeLootManager, this.activeViewerPos);
  };
  private readonly meleeRequestHandler = (req: BotMeleeRequest): void => {
    if (!this.activePlayer || !this.activeLootManager) return;
    this.resolveBotMelee(req, this.activePlayer, this.activeLootManager, this.activeViewerPos);
  };
  private readonly groundHeightSampler = (x: number, z: number, refY: number): number =>
    this.mapManager.getGroundHeightAt(x, z, refY);
  private brainCtxScratch: BrainUpdateContext | null = null;
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
  private syncedAlliesDropWithPlayer = false;
  private readonly safeZoneScratch: SafeZoneState = {
    phaseIndex: 1,
    currentCenterX: 0,
    currentCenterZ: 0,
    currentRadius: 520,
    targetCenterX: 0,
    targetCenterZ: 0,
    targetRadius: 340,
    damagePerSecond: 3,
    isShrinking: false,
  };
  private readonly hudZoneScratch: ServerZoneState = {
    phase: 1,
    totalPhases: ZONE_PHASES.length,
    state: 'waiting',
    timeRemainingSec: 120,
    phaseDurationSec: 120,
    currentCenterX: 0,
    currentCenterZ: 0,
    currentRadius: 520,
    nextCenterX: 0,
    nextCenterZ: 0,
    nextRadius: 340,
    damagePerSec: 3,
  };
  private qualityPreset: QualityPreset = 'medium';
  private shadowsEnabled = true;
  private maxActiveTracers = MAX_BOT_TRACERS;

  private matchActive = false;
  private matchEnded = false;
  private matchElapsedSec = 0;
  private matchSeed = 1;
  private activeMapConfig: MapConfig | null = null;
  private config: BattleRoyaleMatchConfig = {
    mapId: 'desert',
    botCount: 50,
    difficulty: 'mixed',
  };

  private localKills = 0;
  private localDamage = 0;
  private localEliminated = false;
  private localPlacement = 1;
  private localPlayerName = 'YOU';
  private eliminatedBy: string | null = null;
  private eliminatedWeapon: string | null = null;
  private playerSurvivedSec = 0;
  private lastEliminatedBot: BotEntity | null = null;

  // Dynamic local Safe Zone state
  private zonePhaseIdx = 0;
  private zoneSubState: 'waiting' | 'shrinking' | 'final' = 'waiting';
  private zoneTimerSec = 120;
  private zonePhaseDurationSec = 120;
  private currentCenterX = 0;
  private currentCenterZ = 0;
  private currentRadius = 520;
  private startCenterX = 0;
  private startCenterZ = 0;
  private startRadius = 520;
  private nextCenterX = 0;
  private nextCenterZ = 0;
  private nextRadius = 340;
  private zoneDamageAccum = 0;

  private losCursor = 0;

  constructor(
    private readonly assetManager: AssetManager,
    private readonly mapManager: MapManager,
    private readonly audioManager: AudioManager,
    private readonly hitDetection: HitDetection,
    private readonly isCompactDevice: boolean,
    private readonly callbacks: BattleRoyaleCallbacks,
  ) {
    this.tracerGeo = new THREE.BoxGeometry(0.04, 0.04, 0.85);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: '#fb923c' });
    this.tracerMesh = new THREE.InstancedMesh(this.tracerGeo, this.tracerMat, MAX_BOT_TRACERS);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    this.root.add(this.tracerMesh);

    for (let i = 0; i < MAX_BOT_TRACERS; i++) {
      this.tracers.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        maxAge: 0.45,
      });
    }
    this.setQualityPreset(isCompactDevice ? 'low' : 'medium', !isCompactDevice);
  }

  setQualityPreset(quality: QualityPreset, shadowsEnabled: boolean): void {
    this.qualityPreset = quality;
    this.shadowsEnabled = shadowsEnabled;
    this.maxActiveTracers =
      quality === 'low' ? 24 : quality === 'medium' ? 44 : MAX_BOT_TRACERS;
  }

  startMatch(
    cfg: BattleRoyaleMatchConfig,
    mapConfig: MapConfig,
    flightStartX: number,
    flightStartZ: number,
    flightEndX: number,
    flightEndZ: number,
    matchSeed: number,
    playerName = 'YOU',
    initialPhase: 'waiting' | 'airplane' = 'waiting',
  ): void {
    this.clearMatch();

    this.config = { ...cfg };
    this.activeMapConfig = mapConfig;
    this.matchSeed = matchSeed >>> 0 || 42;
    this.matchActive = true;
    this.matchEnded = false;
    this.matchElapsedSec = 0;
    this.localKills = 0;
    this.localDamage = 0;
    this.localEliminated = false;
    this.localPlacement = Math.max(1, Math.round(cfg.botCount)) + 1;
    this.localPlayerName = playerName.trim() || 'YOU';
    this.eliminatedBy = null;
    this.eliminatedWeapon = null;
    this.playerSurvivedSec = 0;
    this.lastEliminatedBot = null;
    this.zoneDamageAccum = 0;
    this.losCursor = 0;
    this.syncedAlliesDropWithPlayer = false;

    // 1. Build building/POI waypoints from real map interior + exterior loot points
    this.buildWaypoints(this.mapManager.getCombinedLootPoints());

    // 2. Initialize Safe Zone
    this.initZone(mapConfig);

    // 3. Determine squad allies (from invited lobby squadmates or auto-fill presets)
    const squadSize = cfg.squadSize ?? 1;
    const alliesToSpawn: SquadFillMemberPreset[] = [];
    const usedNames = new Set<string>([this.localPlayerName.toUpperCase()]);
    if (squadSize > 1) {
      const provided = cfg.squadAllies ?? [];
      for (let i = 0; i < provided.length && alliesToSpawn.length < squadSize - 1; i++) {
        alliesToSpawn.push(provided[i]);
        usedNames.add(provided[i].name.toUpperCase());
      }
      for (let i = 0; i < BR_SQUAD_FILL_PRESETS.length && alliesToSpawn.length < squadSize - 1; i++) {
        const preset = BR_SQUAD_FILL_PRESETS[i];
        if (!usedNames.has(preset.name.toUpperCase())) {
          alliesToSpawn.push(preset);
          usedNames.add(preset.name.toUpperCase());
        }
      }
    }

    // 4. Spawn allied squadmates + AI opponent bots along the flight corridor
    let rng = this.matchSeed;
    const totalBots = clamp(Math.round(cfg.botCount), 1, 50);
    this.localPlacement = totalBots + 1;

    const allyDifficulty: BotDifficulty =
      cfg.difficulty === 'veteran' ? 'veteran' : 'tactical';
    for (let k = 0; k < alliesToSpawn.length; k++) {
      const allyPreset = alliesToSpawn[k];
      rng = nextLcg(rng);
      const jumpAtProgress = clamp(0.42 + k * 0.03, 0.25, 0.78);
      const personality = PERSONALITIES[(k + 1) % PERSONALITIES.length];
      const dropTarget = this.pickDropTarget(
        jumpAtProgress,
        personality,
        flightStartX,
        flightStartZ,
        flightEndX,
        flightEndZ,
        rng,
      );
      const allyBot = new BotEntity(
        {
          id: `ally-${k + 1}`,
          name: allyPreset.name,
          teamId: 'player-squad',
          isAlly: true,
          difficulty: allyDifficulty,
          personality,
          seed: rng ^ ((k + 1) * 4099),
          jumpAtProgress,
          dropTargetX: dropTarget.x,
          dropTargetZ: dropTarget.z,
          characterId: allyPreset.characterId,
          customization: allyPreset.customization,
        },
        this.assetManager,
      );
      allyBot.setGroundHeightSampler(this.groundHeightSampler);

      this.bots.push(allyBot);
      this.brains.push(new BotBrain(rng ^ (k + 101)));
      this.botStepAccum.push(0);
      this.botById.set(allyBot.id, allyBot);
      this.root.add(allyBot.root);
      this.hitDetection.registerTarget(allyBot);
    }

    const shuffledNames = BOT_CALLSIGNS.filter((c) => !usedNames.has(c.toUpperCase()));
    for (let i = shuffledNames.length - 1; i > 0; i--) {
      rng = nextLcg(rng);
      const j = rng % (i + 1);
      const tmp = shuffledNames[i];
      shuffledNames[i] = shuffledNames[j];
      shuffledNames[j] = tmp;
    }

    for (let i = 0; i < totalBots; i++) {
      rng = nextLcg(rng);
      const frac = (i + 0.5) / totalBots;
      const jumpAtProgress = clamp(0.14 + frac * 0.68 + ((rng % 100) / 100 - 0.5) * 0.08, 0.12, 0.86);

      rng = nextLcg(rng);
      const difficulty = this.pickDifficulty(cfg.difficulty, rng);
      rng = nextLcg(rng);
      const personality = PERSONALITIES[rng % PERSONALITIES.length];

      // Pick POI drop target matching flight timing + personality
      const dropTarget = this.pickDropTarget(
        jumpAtProgress,
        personality,
        flightStartX,
        flightStartZ,
        flightEndX,
        flightEndZ,
        rng,
      );

      const botName = shuffledNames[i % shuffledNames.length];
      const botId = `bot-${i + 1}`;
      const bot = new BotEntity(
        {
          id: botId,
          name: botName,
          teamId: botId,
          isAlly: false,
          difficulty,
          personality,
          seed: rng ^ ((i + 1) * 7919),
          jumpAtProgress,
          dropTargetX: dropTarget.x,
          dropTargetZ: dropTarget.z,
        },
        this.assetManager,
      );
      bot.setGroundHeightSampler(this.groundHeightSampler);

      this.bots.push(bot);
      this.brains.push(new BotBrain(rng ^ (i + 17)));
      // Stagger initial accumulator so mid/far bot simulation ticks spread evenly across frames
      this.botStepAccum.push((i % 4) * 0.015);
      this.botById.set(bot.id, bot);
      this.root.add(bot.root);
      this.hitDetection.registerTarget(bot);
    }

    if (initialPhase === 'waiting') {
      const spawns = this.mapManager.spawnPointManager.getAll();
      const primary = this.mapManager.spawnPointManager.getPrimarySpawn();
      const tmpPos = this.scratchTargetPt;
      let allyIdx = 0;
      for (let i = 0; i < this.bots.length; i++) {
        let bx: number;
        let bz: number;
        let facingYaw: number;
        if (this.bots[i].isAlly) {
          const angle = allyIdx * 1.55 - 1.55;
          const rad = 2.2 + allyIdx * 0.65;
          bx = primary.x + Math.cos(angle) * rad;
          bz = primary.z + Math.sin(angle) * rad;
          facingYaw = primary.yaw;
          allyIdx++;
        } else if (spawns.length > 1) {
          const pad = spawns[(i + 1) % spawns.length];
          const ringTier = Math.floor(i / spawns.length);
          const jitterAngle = (i * 2.399963) % (Math.PI * 2);
          const offsetR = ringTier === 0 ? 0.6 : 1.9 + ringTier * 1.3;
          bx = pad.x + Math.cos(jitterAngle) * offsetR;
          bz = pad.z + Math.sin(jitterAngle) * offsetR;
          facingYaw = pad.yaw;
        } else {
          const ringAngle = (i * 2.399963) % (Math.PI * 2);
          const radius = 5.5 + (i % 8) * 3.8 + Math.floor(i / 25) * 2.5;
          bx = primary.x + Math.cos(ringAngle) * radius;
          bz = primary.z + Math.sin(ringAngle) * radius;
          facingYaw = Math.atan2(primary.x - bx, primary.z - bz);
        }
        const by = this.mapManager.getGroundHeightAt(bx, bz, 1.5);
        tmpPos.set(bx, by, bz);
        this.mapManager.resolveHorizontalCollision(tmpPos, 0.46, 1.62);
        tmpPos.y = this.mapManager.getGroundHeightAt(tmpPos.x, tmpPos.z, 1.5);
        this.bots[i].placeInWaitingArea(tmpPos.x, tmpPos.y, tmpPos.z, facingYaw);
      }
    }

    this.root.visible = true;
  }

  enterAirplaneFromWaiting(
    brLootPoints?: readonly LootPoint[],
    flightStartX?: number,
    flightStartZ?: number,
    flightEndX?: number,
    flightEndZ?: number,
  ): void {
    if (!this.matchActive) return;
    this.matchElapsedSec = 0;
    this.zoneDamageAccum = 0;
    this.syncedAlliesDropWithPlayer = false;
    if (brLootPoints && brLootPoints.length > 0) {
      this.buildWaypoints(brLootPoints);
    }
    if (this.activeMapConfig) {
      this.initZone(this.activeMapConfig);
    }
    const hasFlightCoords =
      flightStartX !== undefined &&
      flightStartZ !== undefined &&
      flightEndX !== undefined &&
      flightEndZ !== undefined;
    let rng = (this.matchSeed ^ 0x9e3779b9) >>> 0;
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (hasFlightCoords) {
        rng = nextLcg(rng);
        const dropTarget = this.pickDropTarget(
          bot.jumpAtProgress,
          bot.personality,
          flightStartX,
          flightStartZ,
          flightEndX,
          flightEndZ,
          rng,
        );
        bot.setDropTarget(dropTarget.x, dropTarget.z);
      }
      bot.enterAirplaneFromWaiting();
    }
  }

  private pickDifficulty(setting: BattleRoyaleMatchConfig['difficulty'], rng: number): BotDifficulty {
    if (setting === 'recruit') return rng % 5 === 0 ? 'tactical' : 'recruit';
    if (setting === 'tactical') {
      const r = rng % 10;
      return r < 2 ? 'recruit' : r < 8 ? 'tactical' : 'veteran';
    }
    if (setting === 'veteran') {
      const r = rng % 10;
      return r < 2 ? 'tactical' : r < 7 ? 'veteran' : 'pro';
    }
    // Mixed realistic Battle Royale lobby distribution
    const r = rng % 100;
    if (r < 28) return 'recruit';
    if (r < 68) return 'tactical';
    if (r < 90) return 'veteran';
    return 'pro';
  }

  private buildWaypoints(lootPoints: readonly LootPoint[]): void {
    this.waypoints.length = 0;
    this.waypointById.clear();
    const clusters = new Map<string, BuildingPoiWaypoint & { sumX: number; sumZ: number }>();

    for (let i = 0; i < lootPoints.length; i++) {
      const lp = lootPoints[i];
      const key = lp.groupId || lp.areaName;
      let cluster = clusters.get(key);
      if (!cluster) {
        cluster = {
          id: key,
          areaName: lp.areaName,
          x: lp.x,
          z: lp.z,
          sumX: 0,
          sumZ: 0,
          roomPoints: [],
          isInterior: Boolean(lp.buildingStyle || lp.groupId),
        };
        clusters.set(key, cluster);
      }
      cluster.sumX += lp.x;
      cluster.sumZ += lp.z;
      (cluster.roomPoints as Array<{ x: number; y: number; z: number }>).push({
        x: lp.x,
        y: lp.y,
        z: lp.z,
      });
    }

    for (const c of clusters.values()) {
      const count = Math.max(1, c.roomPoints.length);
      c.x = c.sumX / count;
      c.z = c.sumZ / count;
      this.waypoints.push(c);
      this.waypointById.set(c.id, c);
    }
  }

  private pickDropTarget(
    jumpProgress: number,
    personality: BotPersonality,
    sx: number,
    sz: number,
    ex: number,
    ez: number,
    seed: number,
  ): { x: number; z: number } {
    const planeX = sx + (ex - sx) * jumpProgress;
    const planeZ = sz + (ez - sz) * jumpProgress;

    if (this.waypoints.length === 0) {
      return {
        x: clamp(planeX + ((seed % 160) - 80), -420, 420),
        z: clamp(planeZ + (((seed >>> 8) % 160) - 80), -420, 420),
      };
    }

    let best = this.waypoints[0];
    let bestScore = -Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const distFromPlane = Math.hypot(wp.x - planeX, wp.z - planeZ);
      if (distFromPlane > 340) continue;

      const distFromCenter = Math.hypot(wp.x, wp.z);
      let s = 260 - distFromPlane * 0.55;
      if (personality === 'rusher') {
        s += Math.max(0, 180 - distFromCenter * 0.45);
      } else if (personality === 'survivor') {
        s += distFromCenter * 0.32;
      } else if (personality === 'loot-master' && wp.isInterior) {
        s += 55;
      }
      // Deterministic spread so bots don't all pile on 1 single house
      const hash = ((seed ^ (i * 2654435761)) >>> 0) % 100;
      s += hash * 1.35;

      if (s > bestScore) {
        bestScore = s;
        best = wp;
      }
    }

    const jitterX = (((seed >>> 4) % 14) - 7);
    const jitterZ = (((seed >>> 10) % 14) - 7);
    return {
      x: clamp(best.x + jitterX, -460, 460),
      z: clamp(best.z + jitterZ, -460, 460),
    };
  }

  private initZone(mapConfig: MapConfig): void {
    this.zonePhaseIdx = 0;
    this.zoneSubState = 'waiting';
    const first = ZONE_PHASES[0];
    this.zoneTimerSec = first.holdSec;
    this.zonePhaseDurationSec = first.holdSec;

    this.currentCenterX = mapConfig.zoneConfig.initialSafeCenterX;
    this.currentCenterZ = mapConfig.zoneConfig.initialSafeCenterZ;
    this.currentRadius = mapConfig.zoneConfig.initialSafeRadius;
    this.startCenterX = this.currentCenterX;
    this.startCenterZ = this.currentCenterZ;
    this.startRadius = this.currentRadius;

    let rng = nextLcg(this.matchSeed ^ 0x517cc1b7);
    const ang = (rng % 360) * (Math.PI / 180);
    rng = nextLcg(rng);
    const shift = Math.max(0, this.currentRadius - first.endRadius) * (0.25 + ((rng % 45) / 100));
    this.nextCenterX = this.currentCenterX + Math.cos(ang) * shift;
    this.nextCenterZ = this.currentCenterZ + Math.sin(ang) * shift;
    this.nextRadius = first.endRadius;
  }

  getSafeZoneState(): SafeZoneState {
    const spec = ZONE_PHASES[this.zonePhaseIdx] ?? ZONE_PHASES[ZONE_PHASES.length - 1];
    this.safeZoneScratch.phaseIndex = spec.phase;
    this.safeZoneScratch.currentCenterX = this.currentCenterX;
    this.safeZoneScratch.currentCenterZ = this.currentCenterZ;
    this.safeZoneScratch.currentRadius = this.currentRadius;
    this.safeZoneScratch.targetCenterX = this.nextCenterX;
    this.safeZoneScratch.targetCenterZ = this.nextCenterZ;
    this.safeZoneScratch.targetRadius = this.nextRadius;
    this.safeZoneScratch.damagePerSecond = spec.damagePerSec;
    this.safeZoneScratch.isShrinking = this.zoneSubState === 'shrinking';
    return this.safeZoneScratch;
  }

  getHudZoneState(): ServerZoneState {
    const spec = ZONE_PHASES[this.zonePhaseIdx] ?? ZONE_PHASES[ZONE_PHASES.length - 1];
    this.hudZoneScratch.phase = spec.phase;
    this.hudZoneScratch.totalPhases = ZONE_PHASES.length;
    this.hudZoneScratch.state = this.zoneSubState;
    this.hudZoneScratch.timeRemainingSec = this.zoneTimerSec;
    this.hudZoneScratch.phaseDurationSec = this.zonePhaseDurationSec;
    this.hudZoneScratch.currentCenterX = this.currentCenterX;
    this.hudZoneScratch.currentCenterZ = this.currentCenterZ;
    this.hudZoneScratch.currentRadius = this.currentRadius;
    this.hudZoneScratch.nextCenterX = this.nextCenterX;
    this.hudZoneScratch.nextCenterZ = this.nextCenterZ;
    this.hudZoneScratch.nextRadius = this.nextRadius;
    this.hudZoneScratch.damagePerSec = spec.damagePerSec;
    return this.hudZoneScratch;
  }

  private countAliveBots(): number {
    let alive = 0;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (b.isAlive && !b.eliminatedPermanently) alive++;
    }
    return alive;
  }

  private countAliveAllyBots(): number {
    let alive = 0;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (b.isAlly && b.isAlive && !b.eliminatedPermanently) alive++;
    }
    return alive;
  }

  private countAliveEnemyBots(): number {
    let alive = 0;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.isAlly && b.isAlive && !b.eliminatedPermanently) alive++;
    }
    return alive;
  }

  hasAliveAlly(): boolean {
    return this.countAliveAllyBots() > 0;
  }

  getAliveCount(playerAlive: boolean): number {
    const humanAlive = playerAlive && !this.localEliminated ? 1 : 0;
    return humanAlive + this.countAliveBots();
  }

  getLocalKills(): number {
    return this.localKills;
  }

  isLocalEliminated(): boolean {
    return this.localEliminated;
  }

  isMatchEnded(): boolean {
    return this.matchEnded;
  }

  recordLocalPlayerDamageHit(targetId: string, weaponName: string, totalDamage: number, isHeadshot: boolean): void {
    const bot = this.botById.get(targetId);
    if (!bot || bot.isAlly || !bot.isAlive || bot.dropPhase === 'waiting') return;
    this.localDamage += totalDamage;
    bot.registerIncomingAttacker('local-player', weaponName, isHeadshot);
  }

  applyMeleeKnockback(targetId: string, dirX: number, dirZ: number): void {
    const bot = this.botById.get(targetId);
    if (!bot || bot.isAlly || !bot.isAlive || bot.dropPhase === 'waiting') return;
    bot.applyKnockback(dirX, dirZ, 5.4, 2.5);
  }

  getFirstAliveBotPosition(out: THREE.Vector3): string | null {
    // Prioritize alive squadmates when spectating
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (b.isAlly && b.isAlive && b.dropPhase !== 'airplane') {
        out.copy(b.position);
        return b.name;
      }
    }
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (b.isAlive && b.dropPhase !== 'airplane') {
        out.copy(b.position);
        return b.name;
      }
    }
    return null;
  }

  fillAliveBotPositions(out: Array<{ x: number; y: number; z: number }>): void {
    out.length = 0;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.isAlive || b.dropPhase !== 'landed') continue;
      out.push({ x: b.position.x, y: b.position.y, z: b.position.z });
    }
  }

  getTeammateMarkers(): MinimapMarker[] {
    const markers = this.teammateMarkersScratch;
    markers.length = 0;
    let writeIdx = 0;

    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.isAlly || !b.isAlive || b.dropPhase === 'airplane' || b.dropPhase === 'waiting') continue;
      let m = this.teammateMarkerPool[writeIdx];
      if (!m) {
        m = { id: b.id, x: b.position.x, z: b.position.z, label: b.name, kind: 'teammate' };
        this.teammateMarkerPool.push(m);
      } else {
        m.id = b.id;
        m.x = b.position.x;
        m.z = b.position.z;
        m.label = b.name;
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
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.isAlly) continue;
      let entry = out[writeIdx];
      if (!entry) {
        entry = {
          id: b.id,
          name: b.name,
          health: b.health,
          maxHealth: b.maxHealth,
          shield: b.shield,
          maxShield: b.maxShield,
          isAlive: b.isAlive,
        };
        out.push(entry);
      } else {
        entry.id = b.id;
        entry.name = b.name;
        entry.health = b.health;
        entry.maxHealth = b.maxHealth;
        entry.shield = b.shield;
        entry.maxShield = b.maxShield;
        entry.isAlive = b.isAlive;
      }
      writeIdx++;
    }
    out.length = writeIdx;
    return out;
  }

  getEnemyRadarMarkers(playerPos: THREE.Vector3, reconRadius: number): MinimapMarker[] {
    const nowMs = performance.now();
    const rSq = reconRadius * reconRadius;
    const markers = this.radarMarkersScratch;
    markers.length = 0;
    let writeIdx = 0;

    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.isAlive || b.isAlly || b.dropPhase !== 'landed') continue;
      const dx = b.position.x - playerPos.x;
      const dz = b.position.z - playerPos.z;
      const dSq = dx * dx + dz * dz;
      const firingRecently = b.recentShotUntilMs > nowMs && dSq <= 115 * 115;
      const reconDetected = reconRadius > 24 && dSq <= rSq;
      if (firingRecently || reconDetected) {
        let m = this.radarMarkerPool[writeIdx];
        if (!m) {
          m = { id: b.id, x: b.position.x, z: b.position.z, label: b.name, kind: 'enemy' };
          this.radarMarkerPool.push(m);
        } else {
          m.id = b.id;
          m.x = b.position.x;
          m.z = b.position.z;
          m.label = b.name;
          m.kind = 'enemy';
        }
        markers.push(m);
        writeIdx++;
      }
    }
    return markers;
  }

  update(
    delta: number,
    elapsed: number,
    player: Player,
    lootManager: LootManager,
    dropSnap: AirplaneDropSnapshot,
    spectateTargetPos: THREE.Vector3,
    viewerForward?: THREE.Vector3,
    isScopedView = false,
  ): void {
    if (!this.matchActive) return;

    if (this.matchEnded) {
      const viewerPos = this.localEliminated ? spectateTargetPos : player.position;
      for (let i = 0; i < this.bots.length; i++) {
        if (this.bots[i].corpseRemoved) continue;
        this.bots[i].syncVisuals(
          delta,
          elapsed,
          viewerPos,
          this.isCompactDevice,
          this.qualityPreset,
          this.shadowsEnabled,
        );
      }
      this.updateTracers(delta);
      return;
    }

    if (dropSnap.phase === 'waiting') {
      const primary = this.mapManager.spawnPointManager.getPrimarySpawn();
      const viewerPos = player.position;
      const botCount = this.bots.length;
      for (let i = 0; i < botCount; i++) {
        const bot = this.bots[i];
        const distSq = bot.position.distanceToSquared(viewerPos);
        const minStepSec = distSq <= 45 * 45 ? 0 : 0.045;
        const stepDt = this.botStepAccum[i] + delta;
        if (stepDt < minStepSec) {
          this.botStepAccum[i] = stepDt;
          continue;
        }
        this.botStepAccum[i] = 0;
        const clampedStepDt = Math.min(0.11, stepDt);
        bot.stepTimers(clampedStepDt, this.audioManager, viewerPos);
        bot.stepWaitingBehavior(
          clampedStepDt,
          primary.x,
          primary.z,
          this.mapManager,
          distSq <= 48 * 48,
        );
        bot.syncVisuals(
          clampedStepDt,
          elapsed,
          viewerPos,
          this.isCompactDevice,
          this.qualityPreset,
          this.shadowsEnabled,
        );
      }
      this.updateTracers(delta);
      return;
    }

    this.matchElapsedSec += delta;
    const nowMs = performance.now();

    // 1. Advance 5-phase Safe Zone shrink
    this.updateZone(delta);

    // 2. Process any pending eliminations before next AI think pass
    this.processPendingEliminations(player, lootManager);

    // Coordinate squadmates jumping alongside the player
    if (
      !this.syncedAlliesDropWithPlayer &&
      (dropSnap.phase === 'freefall' || dropSnap.phase === 'parachute' || dropSnap.phase === 'landed')
    ) {
      this.syncedAlliesDropWithPlayer = true;
      let allyDropIdx = 0;
      for (let i = 0; i < this.bots.length; i++) {
        const b = this.bots[i];
        if (!b.isAlly || !b.isAlive) continue;
        if (b.dropPhase === 'airplane') {
          b.jumpAtProgress = clamp(dropSnap.flightProgress + 0.012 * (allyDropIdx + 1), 0.05, 0.9);
          const ang = allyDropIdx * 2.1 + 0.6;
          const offR = 14 + allyDropIdx * 4;
          b.setDropTarget(
            clamp(player.position.x + Math.cos(ang) * offR, -455, 455),
            clamp(player.position.z + Math.sin(ang) * offR, -455, 455),
          );
          allyDropIdx++;
        }
      }
    }

    // 3. Build active combatants list & O(1) map (local player + all landed alive bots) without allocations
    const combatants = this.combatantsScratch;
    combatants.length = 0;
    this.combatantById.clear();
    if (!this.localEliminated && player.stats.isAlive && dropSnap.phase === 'landed') {
      const sc = this.selfCombatantScratch;
      sc.x = player.position.x;
      sc.y = player.position.y;
      sc.z = player.position.z;
      sc.vx = player.velocity.x;
      sc.vy = player.velocity.y;
      sc.vz = player.velocity.z;
      sc.isCrouching = player.isCrouching;
      sc.isGrounded = player.movement.isGrounded;
      combatants.push(sc);
      this.combatantById.set(sc.id, sc);
    }
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.isAlive || b.dropPhase !== 'landed') continue;
      let bc = this.botCombatantPool.get(b.id);
      if (!bc) {
        bc = {
          id: b.id,
          teamId: b.teamId,
          name: b.name,
          x: b.position.x,
          y: b.position.y,
          z: b.position.z,
          vx: b.velocity.x,
          vy: b.velocity.y,
          vz: b.velocity.z,
          isCrouching: b.isCrouching,
          isGrounded: b.isGrounded,
        };
        this.botCombatantPool.set(b.id, bc);
      } else {
        bc.teamId = b.teamId;
        bc.x = b.position.x;
        bc.y = b.position.y;
        bc.z = b.position.z;
        bc.vx = b.velocity.x;
        bc.vy = b.velocity.y;
        bc.vz = b.velocity.z;
        bc.isCrouching = b.isCrouching;
        bc.isGrounded = b.isGrounded;
      }
      combatants.push(bc);
      this.combatantById.set(bc.id, bc);
    }

    // 4. Zone damage tick (once per 1.0s)
    this.zoneDamageAccum += delta;
    const applyZoneTick = this.zoneDamageAccum >= 1.0;
    if (applyZoneTick) {
      this.zoneDamageAccum -= 1.0;
      const spec = ZONE_PHASES[this.zonePhaseIdx] ?? ZONE_PHASES[ZONE_PHASES.length - 1];
      const dmg = spec.damagePerSec;

      if (!this.localEliminated && player.stats.isAlive && dropSnap.phase === 'landed') {
        const dPlayer = Math.hypot(
          player.position.x - this.currentCenterX,
          player.position.z - this.currentCenterZ,
        );
        if (dPlayer > this.currentRadius) {
          const dealt = player.stats.takeDirectHealthDamage(dmg);
          if (dealt > 0) {
            this.callbacks.onZoneDamagePlayer(Math.max(1, Math.round(dealt)));
          }
          if (!player.stats.isAlive) {
            this.eliminateLocalPlayer('SAFE ZONE', 'STORM');
          }
        }
      }

      for (let i = 0; i < this.bots.length; i++) {
        const b = this.bots[i];
        if (!b.isAlive || b.dropPhase !== 'landed') continue;
        const dBot = Math.hypot(
          b.position.x - this.currentCenterX,
          b.position.z - this.currentCenterZ,
        );
        if (dBot > this.currentRadius) {
          const killed = b.applyZoneDamage(dmg);
          if (killed) {
            this.handleBotElimination(b, lootManager);
          }
        }
      }
    }

    // 5. Step all bots with distance-tiered scheduling (airborne drop + grounded AI + physics + visuals)
    const viewerPos = this.localEliminated ? spectateTargetPos : player.position;
    this.activePlayer = player;
    this.activeLootManager = lootManager;
    this.activeViewerPos.copy(viewerPos);
    const zoneState = this.getSafeZoneState();
    this.airplanePosScratch.set(dropSnap.airplaneX, dropSnap.airplaneY, dropSnap.airplaneZ);
    const airplaneSpeed =
      Math.hypot(
        dropSnap.flightEndX - dropSnap.flightStartX,
        dropSnap.flightEndZ - dropSnap.flightStartZ,
      ) / 22;

    const losBudget = this.losBudgetScratch;
    losBudget.remaining =
      this.qualityPreset === 'low' ? 5 : this.qualityPreset === 'medium' ? 9 : 14;

    if (!this.brainCtxScratch) {
      this.brainCtxScratch = {
        delta: 0,
        nowMs,
        mapManager: this.mapManager,
        lootManager,
        hitDetection: this.hitDetection,
        zone: zoneState,
        waypoints: this.waypoints,
        waypointById: this.waypointById,
        combatants,
        combatantById: this.combatantById,
        losBudget,
        viewerX: viewerPos.x,
        viewerZ: viewerPos.z,
        onFireRequest: this.fireRequestHandler,
        onMeleeRequest: this.meleeRequestHandler,
      };
    } else {
      this.brainCtxScratch.nowMs = nowMs;
      this.brainCtxScratch.lootManager = lootManager;
      this.brainCtxScratch.zone = zoneState;
      this.brainCtxScratch.viewerX = viewerPos.x;
      this.brainCtxScratch.viewerZ = viewerPos.z;
    }

    const botCount = this.bots.length;

    for (let offset = 0; offset < botCount; offset++) {
      const idx = (this.losCursor + offset) % botCount;
      const bot = this.bots[idx];
      const inFrustum = this.mapManager.isSphereInFrustum(
        bot.position.x,
        bot.position.y + 1.0,
        bot.position.z,
        2.6,
      );
      if (!bot.isAlive) {
        if (!bot.corpseRemoved) {
          bot.syncVisuals(
            delta,
            elapsed,
            viewerPos,
            this.isCompactDevice,
            this.qualityPreset,
            this.shadowsEnabled,
            inFrustum,
          );
        }
        continue;
      }

      const distSq = bot.position.distanceToSquared(viewerPos);
      let inScopeCone = false;
      if (isScopedView && viewerForward && distSq > 92 * 92) {
        const vx = bot.position.x - viewerPos.x;
        const vy = bot.position.y + 1.0 - viewerPos.y;
        const vz = bot.position.z - viewerPos.z;
        const lenSq = vx * vx + vy * vy + vz * vz;
        if (lenSq > 1) {
          const dot = vx * viewerForward.x + vy * viewerForward.y + vz * viewerForward.z;
          inScopeCone = dot > 0 && dot * dot >= 0.8836 * lenSq;
        }
      }

      const isUrgent =
        bot.dropPhase !== 'landed' ||
        distSq <= 92 * 92 ||
        inScopeCone ||
        bot.behaviorState === 'combat' ||
        nowMs - bot.lastHitTimeMs < 3000;

      const minStepSec = isUrgent ? 0 : distSq <= 190 * 190 ? 0.048 : 0.082;
      const stepDt = this.botStepAccum[idx] + delta;

      if (stepDt < minStepSec) {
        this.botStepAccum[idx] = stepDt;
        continue;
      }

      this.botStepAccum[idx] = 0;
      const clampedStepDt = Math.min(0.11, stepDt);

      bot.stepTimers(clampedStepDt, this.audioManager, viewerPos);

      if (bot.dropPhase !== 'landed') {
        bot.stepAirbornePhysics(
          clampedStepDt,
          dropSnap.flightProgress,
          this.airplanePosScratch,
          dropSnap.airplaneHeadingRad,
          Math.max(36, airplaneSpeed),
          this.mapManager,
        );
      } else {
        this.brainCtxScratch.delta = clampedStepDt;
        this.brains[idx].update(bot, this.brainCtxScratch);
      }

      bot.syncVisuals(
        clampedStepDt,
        elapsed,
        viewerPos,
        this.isCompactDevice,
        this.qualityPreset,
        this.shadowsEnabled,
        inFrustum,
      );
    }
    this.losCursor = (this.losCursor + 3) % Math.max(1, botCount);

    // 6. Update pooled bullet tracers
    this.updateTracers(delta);

    // 7. Check Match Victory / Completion (1 survivor left!)
    this.processPendingEliminations(player, lootManager);
  }

  processPendingEliminations(player: Player, lootManager: LootManager): void {
    if (!this.matchActive) return;

    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (!bot.isAlive && !bot.eliminationProcessed) {
        this.handleBotElimination(bot, lootManager);
      }
    }

    if (!this.matchEnded) {
      if (!this.localEliminated && !player.stats.isAlive) {
        this.eliminateLocalPlayer('ELIMINATED', 'COMBAT');
      }

      const aliveEnemies = this.countAliveEnemyBots();
      const aliveAllies = this.countAliveAllyBots();
      const squadAlive = (!this.localEliminated && player.stats.isAlive) || aliveAllies > 0;

      if (aliveEnemies === 0 && squadAlive) {
        this.concludeMatch(true);
      } else if (!squadAlive && (this.bots.some((b) => b.isAlly) || aliveEnemies <= 1)) {
        this.localPlacement = aliveEnemies + 1;
        this.concludeMatch(false);
      }
    }
  }

  private resolveBotShot(
    req: BotFireRequest,
    player: Player,
    lootManager: LootManager,
    viewerPos: THREE.Vector3,
  ): void {
    const slot = req.shooter.getActiveWeapon();
    if (!slot) return;
    const def = slot.definition;

    // 1. Audio + Tracer visual
    const distListener = Math.hypot(
      req.originX - viewerPos.x,
      req.originY - viewerPos.y,
      req.originZ - viewerPos.z,
    );
    if (distListener <= 130) {
      this.audioManager.playDistantGunshot(def.sound);
    }

    const tracerMaxDist = this.qualityPreset === 'low' ? 125 : 185;
    if (distListener <= tracerMaxDist) {
      this.spawnTracer(
        req.originX,
        req.originY,
        req.originZ,
        req.dirX,
        req.dirY,
        req.dirZ,
        def.bulletSpeed,
      );
    }

    // 2. Verify geometric LOS against buildings/walls/terrain so bots NEVER shoot through solid cover
    this.scratchOrigin.set(req.originX, req.originY, req.originZ);
    const targetCenterY = req.target.y + (req.target.isCrouching ? 0.94 : 1.28);
    this.scratchTargetPt.set(req.target.x, targetCenterY, req.target.z);

    const dist = this.scratchOrigin.distanceTo(this.scratchTargetPt);
    if (dist > def.range * 1.06) return;
    if (!this.hitDetection.hasLineOfSight(this.scratchOrigin, this.scratchTargetPt, def.range)) {
      const blocker = this.hitDetection.raycastSegment(
        this.scratchOrigin,
        this.scratchTargetPt,
        this.botShotHitScratch,
      );
      if (blocker.hit && blocker.target?.id.startsWith('gloo:')) {
        const wallDmgRes = DamageSystem.computeDamage({
          weapon: def,
          distance: blocker.distance,
          isHeadshot: false,
          targetShield: 0,
          targetDamageReductionPct: 0,
          pelletsHit: 1,
        });
        blocker.target.applyHitDamage(wallDmgRes);
      }
      return;
    }

    // 3. Verify led Aimbot trajectory passes within hitbox envelope of target's intercept point
    this.scratchDir.set(req.aimX, req.aimY, req.aimZ).sub(this.scratchOrigin).normalize();
    const dot =
      this.scratchDir.x * req.dirX +
      this.scratchDir.y * req.dirY +
      this.scratchDir.z * req.dirZ;
    const missAngleRad = Math.acos(clamp(dot, -1, 1));
    const hitAngleAllowance = Math.atan2(0.65, Math.max(2, dist)) + 0.018;
    if (missAngleRad > hitAngleAllowance) {
      return;
    }

    const headHeightThreshold = req.target.y + (req.target.isCrouching ? 1.18 : 1.44);
    const isHeadshot =
      (req.isAimbotHeadshot && req.aimY >= headHeightThreshold && missAngleRad < 0.015) ||
      (missAngleRad < hitAngleAllowance * 0.22 && Math.random() < 0.32);
    const pelletsHit =
      def.pellets > 1
        ? dist <= def.falloff.closeRange
          ? Math.min(def.pellets, 7)
          : dist <= def.falloff.mediumRange
            ? Math.min(def.pellets, 5)
            : 3
        : 1;
    const isPlayerTarget = req.target.id === 'local-player';

    if (isPlayerTarget) {
      if (req.shooter.teamId === 'player-squad') return;
      if (this.localEliminated || !player.stats.isAlive) return;
      const dmgRes = DamageSystem.computeDamage({
        weapon: def,
        distance: dist,
        isHeadshot,
        targetShield: player.stats.shield,
        targetDamageReductionPct: player.stats.damageMitigationPct,
        pelletsHit,
      });
      const applied = player.stats.applyDamageResult(dmgRes);
      req.shooter.damageDealt += applied.totalDamage;
      if (applied.totalDamage > 0) {
        this.callbacks.onPlayerDamaged(
          applied.totalDamage,
          req.shooter.name,
          def.name,
          isHeadshot,
        );
      }
      if (!player.stats.isAlive) {
        req.shooter.kills++;
        this.callbacks.onKillFeed({
          id: `${Date.now()}-${Math.random()}`,
          killerId: req.shooter.id,
          killerName: req.shooter.name,
          victimId: 'local-player',
          victimName: 'YOU',
          weaponName: def.name,
          isHeadshot,
          distanceM: Math.round(dist),
          cause: 'weapon',
          timestamp: Date.now(),
        });
        this.callbacks.onCombatElimination?.({
          killerId: req.shooter.id,
          killerName: req.shooter.name,
          victimId: 'local-player',
          victimName: this.localPlayerName,
          weaponName: def.name,
          isHeadshot,
          victimX: player.position.x,
          victimY: player.position.y,
          victimZ: player.position.z,
        });
        this.eliminateLocalPlayer(req.shooter.name, def.name);
      }
      return;
    }

    // Bot vs Bot damage!
    const targetBot = this.botById.get(req.target.id);
    if (!targetBot || !targetBot.isAlive || targetBot.teamId === req.shooter.teamId) return;

    const dmgRes = DamageSystem.computeDamage({
      weapon: def,
      distance: dist,
      isHeadshot,
      targetShield: targetBot.shield,
      targetDamageReductionPct: targetBot.damageReductionPct,
      pelletsHit,
    });
    req.shooter.damageDealt += dmgRes.totalDamage;
    targetBot.registerIncomingAttacker(req.shooter.id, def.name, isHeadshot);
    targetBot.applyHitDamage(dmgRes);

    if (!targetBot.isAlive) {
      req.shooter.kills++;
      this.handleBotElimination(targetBot, lootManager);
    }
  }

  private resolveBotMelee(
    req: BotMeleeRequest,
    player: Player,
    lootManager: LootManager,
    viewerPos: THREE.Vector3,
  ): void {
    const dx = req.target.x - req.attacker.position.x;
    const dy = req.target.y - req.attacker.position.y;
    const dz = req.target.z - req.attacker.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 2.65) return;

    const distListener = req.attacker.position.distanceTo(viewerPos);
    if (distListener <= 28) {
      this.audioManager.playPunchSwing();
    }

    const isPlayerTarget = req.target.id === 'local-player';
    if (isPlayerTarget) {
      if (req.attacker.teamId === 'player-squad') return;
      if (this.localEliminated || !player.stats.isAlive) return;
      const dmgRes = DamageSystem.computeDamage({
        weapon: BOT_FISTS_DEF,
        distance: dist,
        isHeadshot: req.isHeadshot,
        targetShield: player.stats.shield,
        targetDamageReductionPct: player.stats.damageMitigationPct,
      });
      const applied = player.stats.applyDamageResult(dmgRes);
      req.attacker.damageDealt += applied.totalDamage;
      if (distListener <= 28) {
        this.audioManager.playPunchHit(req.isHeadshot);
      }
      if (applied.totalDamage > 0) {
        this.callbacks.onPlayerDamaged(
          applied.totalDamage,
          req.attacker.name,
          BOT_FISTS_DEF.name,
          req.isHeadshot,
        );
      }
      if (!player.stats.isAlive) {
        req.attacker.kills++;
        this.callbacks.onKillFeed({
          id: `${Date.now()}-${Math.random()}`,
          killerId: req.attacker.id,
          killerName: req.attacker.name,
          victimId: 'local-player',
          victimName: 'YOU',
          weaponName: BOT_FISTS_DEF.name,
          isHeadshot: req.isHeadshot,
          distanceM: Math.round(dist),
          cause: 'weapon',
          timestamp: Date.now(),
        });
        this.callbacks.onCombatElimination?.({
          killerId: req.attacker.id,
          killerName: req.attacker.name,
          victimId: 'local-player',
          victimName: this.localPlayerName,
          weaponName: BOT_FISTS_DEF.name,
          isHeadshot: req.isHeadshot,
          victimX: player.position.x,
          victimY: player.position.y,
          victimZ: player.position.z,
        });
        this.eliminateLocalPlayer(req.attacker.name, BOT_FISTS_DEF.name);
      }
      return;
    }

    const targetBot = this.botById.get(req.target.id);
    if (!targetBot || !targetBot.isAlive || targetBot.teamId === req.attacker.teamId) return;

    const dmgRes = DamageSystem.computeDamage({
      weapon: BOT_FISTS_DEF,
      distance: dist,
      isHeadshot: req.isHeadshot,
      targetShield: targetBot.shield,
      targetDamageReductionPct: targetBot.damageReductionPct,
    });
    req.attacker.damageDealt += dmgRes.totalDamage;
    if (distListener <= 28) {
      this.audioManager.playPunchHit(req.isHeadshot);
    }
    targetBot.registerIncomingAttacker(req.attacker.id, BOT_FISTS_DEF.name, req.isHeadshot);
    targetBot.applyHitDamage(dmgRes);
    targetBot.applyKnockback(req.dirX, req.dirZ, 4.2, 1.8);

    if (!targetBot.isAlive) {
      req.attacker.kills++;
      this.handleBotElimination(targetBot, lootManager);
    }
  }

  private handleBotElimination(bot: BotEntity, lootManager: LootManager): void {
    if (bot.eliminationProcessed) return;
    bot.eliminationProcessed = true;
    bot.eliminatedPermanently = true;
    this.lastEliminatedBot = bot;

    const killerId = bot.lastAttackerId;
    let killerName = 'SAFE ZONE';
    let distanceM = 0;
    if (killerId === 'local-player') {
      killerName = this.localPlayerName;
      this.localKills++;
      this.callbacks.onPlayerKillConfirmed(bot.name, this.localKills);
    } else if (killerId) {
      const killerBot = this.botById.get(killerId);
      if (killerBot) {
        killerName = killerBot.name;
        distanceM = Math.round(killerBot.position.distanceTo(bot.position));
      }
    }

    bot.dropLootOnDeath(lootManager);
    this.hitDetection.unregisterTarget(bot);

    // Report to kill feed
    const weaponName = bot.lastAttackerWeaponName || 'RIFLE';
    const isHs = bot.lastHitIsHeadshot;

    this.callbacks.onKillFeed({
      id: `${bot.id}-${Date.now()}`,
      killerId,
      killerName,
      victimId: bot.id,
      victimName: bot.name,
      weaponName,
      isHeadshot: isHs,
      distanceM,
      cause: killerId ? 'weapon' : 'zone',
      timestamp: Date.now(),
    });

    this.callbacks.onCombatElimination?.({
      killerId,
      killerName,
      victimId: bot.id,
      victimName: bot.name,
      weaponName,
      isHeadshot: isHs,
      victimX: bot.position.x,
      victimY: bot.position.y,
      victimZ: bot.position.z,
    });

    this.callbacks.onAliveCountChanged?.(this.getAliveCount(!this.localEliminated));
  }

  private eliminateLocalPlayer(killerName: string, weaponName: string): void {
    if (this.localEliminated) return;
    this.localEliminated = true;
    const aliveAllies = this.countAliveAllyBots();
    const aliveEnemies = this.countAliveEnemyBots();
    const aliveTotal = this.getAliveCount(false);
    const squadStillAlive = aliveAllies > 0;
    this.localPlacement = aliveEnemies + 1;
    this.eliminatedBy = killerName;
    this.eliminatedWeapon = weaponName;
    this.playerSurvivedSec = Math.round(this.matchElapsedSec);

    this.callbacks.onAliveCountChanged?.(aliveTotal);
    this.callbacks.onPlayerEliminated({
      mapId: this.config.mapId,
      placement: this.localPlacement,
      totalFighters: this.bots.length + 1,
      kills: this.localKills,
      damage: Math.round(this.localDamage),
      survivedSec: this.playerSurvivedSec,
      killerName,
      weaponName,
      aliveRemaining: aliveTotal,
      difficulty: this.config.difficulty,
      squadStillAlive,
    });

    if (!squadStillAlive && aliveTotal <= 1) {
      this.concludeMatch(false);
    }
  }

  private concludeMatch(squadWon: boolean): void {
    if (this.matchEnded) return;
    this.matchEnded = true;

    const totalFighters = this.bots.length + 1;
    const playerWon = squadWon;

    let winnerName = this.localPlayerName;
    let winnerKills = this.localKills;
    let winnerIsBot = false;

    if (playerWon && this.localEliminated) {
      const aliveAlly = this.bots.find((b) => b.isAlly && b.isAlive && !b.eliminatedPermanently);
      if (aliveAlly) {
        winnerName = aliveAlly.name;
        winnerKills = aliveAlly.kills + this.localKills;
        winnerIsBot = false;
      }
    } else if (!playerWon) {
      const survivingBot =
        this.bots.find((b) => !b.isAlly && b.isAlive && !b.eliminatedPermanently) ?? this.lastEliminatedBot;
      winnerName = survivingBot ? survivingBot.name : (this.eliminatedBy || 'SURVIVOR');
      winnerKills = survivingBot ? survivingBot.kills : 0;
      winnerIsBot = true;
    }

    const survivedSec = playerWon
      ? Math.round(this.matchElapsedSec)
      : this.playerSurvivedSec > 0
        ? this.playerSurvivedSec
        : Math.round(this.matchElapsedSec);

    this.callbacks.onMatchResult({
      mapId: this.config.mapId,
      placement: playerWon ? 1 : this.localPlacement,
      totalFighters,
      kills: this.localKills,
      damage: Math.round(this.localDamage),
      survivedSec,
      winnerName,
      winnerKills,
      winnerIsBot,
      playerName: this.localPlayerName,
      eliminatedBy: this.eliminatedBy,
      eliminatedWeapon: this.eliminatedWeapon,
      isWinner: playerWon,
      difficulty: this.config.difficulty,
    });
  }

  private updateZone(delta: number): void {
    if (this.zoneSubState === 'final') return;

    this.zoneTimerSec = Math.max(0, this.zoneTimerSec - delta);
    const spec = ZONE_PHASES[this.zonePhaseIdx];
    if (!spec) {
      this.zoneSubState = 'final';
      return;
    }

    if (this.zoneSubState === 'waiting') {
      if (this.zoneTimerSec <= 0) {
        this.zoneSubState = 'shrinking';
        this.zoneTimerSec = spec.shrinkSec;
        this.zonePhaseDurationSec = spec.shrinkSec;
        this.startCenterX = this.currentCenterX;
        this.startCenterZ = this.currentCenterZ;
        this.startRadius = this.currentRadius;
      }
      return;
    }

    // Shrinking phase
    const t = 1 - clamp(this.zoneTimerSec / Math.max(0.01, spec.shrinkSec), 0, 1);
    this.currentCenterX = this.startCenterX + (this.nextCenterX - this.startCenterX) * t;
    this.currentCenterZ = this.startCenterZ + (this.nextCenterZ - this.startCenterZ) * t;
    this.currentRadius = this.startRadius + (this.nextRadius - this.startRadius) * t;

    if (this.zoneTimerSec <= 0) {
      this.currentCenterX = this.nextCenterX;
      this.currentCenterZ = this.nextCenterZ;
      this.currentRadius = this.nextRadius;

      if (this.zonePhaseIdx + 1 >= ZONE_PHASES.length) {
        this.zoneSubState = 'final';
        this.zoneTimerSec = 0;
        this.zonePhaseDurationSec = 0;
        return;
      }

      this.zonePhaseIdx++;
      const nextSpec = ZONE_PHASES[this.zonePhaseIdx];
      this.zoneSubState = 'waiting';
      this.zoneTimerSec = nextSpec.holdSec;
      this.zonePhaseDurationSec = nextSpec.holdSec;

      const ang = ((this.matchSeed + this.zonePhaseIdx * 137) % 360) * (Math.PI / 180);
      const maxShift = Math.max(0, this.currentRadius - nextSpec.endRadius) * 0.45;
      this.nextCenterX = this.currentCenterX + Math.cos(ang) * maxShift;
      this.nextCenterZ = this.currentCenterZ + Math.sin(ang) * maxShift;
      this.nextRadius = nextSpec.endRadius;
    }
  }

  private spawnTracer(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    speed: number,
  ): void {
    for (let i = 0; i < this.maxActiveTracers; i++) {
      const t = this.tracers[i];
      if (!t.active) {
        t.active = true;
        t.position.set(ox, oy, oz);
        t.velocity.set(dx, dy, dz).normalize().multiplyScalar(speed);
        t.age = 0;
        t.maxAge = 0.48;
        return;
      }
    }
  }

  private updateTracers(delta: number): void {
    let count = 0;
    for (let i = 0; i < MAX_BOT_TRACERS; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;
      t.age += delta;
      if (t.age >= t.maxAge) {
        t.active = false;
        continue;
      }
      t.position.addScaledVector(t.velocity, delta);
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

  clearMatch(): void {
    this.matchActive = false;
    this.matchEnded = false;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      this.hitDetection.unregisterTarget(b);
      this.root.remove(b.root);
      b.dispose();
    }
    this.bots.length = 0;
    this.brains.length = 0;
    this.botStepAccum.length = 0;
    this.botById.clear();
    this.waypoints.length = 0;
    this.waypointById.clear();
    this.combatantsScratch.length = 0;
    this.combatantById.clear();
    this.botCombatantPool.clear();
    this.activePlayer = null;
    this.activeLootManager = null;
    this.radarMarkersScratch.length = 0;

    for (let i = 0; i < this.tracers.length; i++) {
      this.tracers[i].active = false;
    }
    this.tracerMesh.count = 0;
    this.root.visible = false;
  }

  dispose(): void {
    this.clearMatch();
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
  }
}
