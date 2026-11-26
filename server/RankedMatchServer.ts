import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  RANKED_CONSUMABLE_EFFECTS,
  RANKED_FLIGHT_PATHS,
  RANKED_WEAPON_STATS,
  type AuthMessagePayload,
  type CombatHitClaimPayload,
  type CombatShotPayload,
  type DroppedLootSync,
  type FriendRequestEntry,
  type GlooWallDamagePayload,
  type GlooWallDeployPayload,
  type KillFeedEntry,
  type LobbyPlayerInfo,
  type LobbySnapshot,
  type LootCollectClaimPayload,
  type LootDropReportPayload,
  type MatchDropPhase,
  type MatchLifecyclePhase,
  type OutgoingFriendRequestEntry,
  type PlayerStateUploadPayload,
  type QueueJoinPayload,
  type RankedAnimationState,
  type RankedCustomizationPayload,
  type RankedMapId,
  type RankedMatchResultPayload,
  type RankedProfile,
  type RankedWeaponStatSpec,
  type RemotePlayerDeltaSnapshot,
  type RemotePlayerSnapshot,
  type ServerGlooWall,
  type ServerOnlineStatus,
  type ServerZoneState,
  type SquadFriendEntry,
  type SquadInviteNotification,
  type SquadMemberInfo,
  type SquadMemberStatus,
  type SquadSize,
  type SquadStateSnapshot,
  type UseConsumableReportPayload,
} from '../src/ranked/RankedTypes.ts';
import {
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
  isValidAvatarId,
  isValidBannerId,
} from '../src/shop/AvatarBannerCatalog.ts';
import { isValidWeaponSkinId } from '../src/weapons/WeaponSkins.ts';
import type { RankedStore } from './RankedStore.ts';

export interface RankedMatchServerOptions {
  firebaseProjectId?: string;
  firestoreDatabaseId?: string;
  verifyFirebaseToken?: (token: string) => Promise<{ uid: string } | null>;
}

interface NetEnvelope {
  type: string;
  seq: number;
  serverTimeMs: number;
  payload: unknown;
}

interface ClientSession {
  ws: WebSocket;
  isAliveSocket: boolean;
  playerId: string | null;
  profile: RankedProfile | null;
  firebaseUid: string | null;
  firebaseIdToken: string | null;
  firebaseTokenVerifyPromise: Promise<void> | null;
  inExternalMatch: boolean;
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId: string;
  bannerId: string;
  weaponSkins: Record<string, string>;
  queuePreferredMap: RankedMapId | 'any';
  queuedAtMs: number;
  lobbyId: string | null;
  matchId: string | null;
  squadId: string | null;
}

interface ServerSquadMember {
  playerId: string;
  name: string;
  tier: RankedProfile['tier'];
  rp: number;
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId?: string;
  bannerId?: string;
  isLeader: boolean;
  ready: boolean;
  status: SquadMemberStatus;
  isBotAlly: boolean;
  session: ClientSession | null;
}

interface ServerSquadRoom {
  id: string;
  maxSize: SquadSize;
  leaderId: string;
  members: Map<string, ServerSquadMember>;
  pendingInviteIds: Set<string>;
  createdAtMs: number;
}

interface ServerSquadInvite {
  inviteId: string;
  squadId: string;
  fromPlayerId: string;
  fromName: string;
  fromTier: RankedProfile['tier'];
  targetPlayerId: string;
  maxSize: SquadSize;
  createdAtMs: number;
}

interface LobbyParticipant {
  session: ClientSession;
  ready: boolean;
  mapVote: RankedMapId | null;
}

interface LobbyRoom {
  id: string;
  participants: Map<string, LobbyParticipant>;
  countdownSec: number | null;
  createdAtMs: number;
}

interface ZonePhaseConfig {
  waitSec: number;
  shrinkSec: number;
  targetRadius: number;
  damagePerSec: number;
}

const ZONE_PHASES: readonly ZonePhaseConfig[] = [
  { waitSec: 120, shrinkSec: 40, targetRadius: 340, damagePerSec: 2 },
  { waitSec: 80, shrinkSec: 40, targetRadius: 215, damagePerSec: 5 },
  { waitSec: 80, shrinkSec: 40, targetRadius: 120, damagePerSec: 10 },
  { waitSec: 80, shrinkSec: 40, targetRadius: 52, damagePerSec: 16 },
  { waitSec: 80, shrinkSec: 40, targetRadius: 12, damagePerSec: 24 },
];

interface MatchPlayerState {
  playerId: string;
  squadId: string | null;
  session: ClientSession | null;
  name: string;
  rp: number;
  tier: RankedProfile['tier'];
  platform: RankedProfile['platform'];
  characterId: string;
  customization: RankedCustomizationPayload;
  avatarId: string;
  bannerId: string;
  weaponSkins: Record<string, string>;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  dropPhase: MatchDropPhase;
  animationState: RankedAnimationState;
  isCrouching: boolean;
  isSprinting: boolean;
  isGrounded: boolean;
  isAlive: boolean;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  activeWeaponId: string | null;
  armorTier: 0 | 1 | 2 | 3;
  helmetTier: 0 | 1 | 2 | 3;
  backpackTier: 0 | 1 | 2 | 3;
  damageReductionPct: number;
  kills: number;
  damageDealt: number;
  joinedAtMs: number;
  eliminatedAtMs: number | null;
  placement: number | null;
  recordedOutcome: boolean;
  lastStateMs: number;
  lastShotMs: number;
  lastHitWindowMs: number;
  hitsInWindow: number;
  lastConsumableMs: number;
  glooWallsCount: number;
  lastGlooDeployMs: number;
  disconnectedAtMs: number | null;
}

interface MatchRoom {
  id: string;
  mapId: RankedMapId;
  matchSeed: number;
  matchPhase: MatchLifecyclePhase;
  waitingDurationSec: number;
  waitingRemainingSec: number;
  waitingEndsAtMs: number;
  flightIdx: number;
  flightDurationSec: number;
  flightProgress: number;
  startedAtMs: number;
  finished: boolean;
  players: Map<string, MatchPlayerState>;
  totalPlayers: number;
  collectedLootIds: Set<string>;
  droppedLoot: Map<string, DroppedLootSync>;
  glooWalls: Map<string, ServerGlooWall>;
  nextDropSeq: number;
  nextKillSeq: number;
  nextGlooSeq: number;
  zone: ServerZoneState;
  zoneStartCenterX: number;
  zoneStartCenterZ: number;
  zoneStartRadius: number;
  zoneTargetCenterX: number;
  zoneTargetCenterZ: number;
  zoneFinalCenterX: number;
  zoneFinalCenterZ: number;
  stormTickAccumSec: number;
}

const DEFAULT_CUSTOMIZATION: RankedCustomizationPayload = {
  skinId: 'operator_natural',
  eyesId: 'determined',
  mouthId: 'confident_grin',
  hairStyleId: 'swept_undercut',
  hairColorId: 'espresso',
  topId: 'hoodie_urban',
  pantsId: 'cargo_charcoal',
  shoesId: 'sneakers_white',
  hatId: 'none',
  glassesId: 'none',
  maskId: 'none',
  armorId: 'none',
  accessoryId: 'none',
  petId: 'none',
};

function sanitizeId(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > 48) return fallback;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : fallback;
}

function sanitizeCustomization(raw?: Partial<RankedCustomizationPayload>): RankedCustomizationPayload {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CUSTOMIZATION };
  }
  return {
    skinId: sanitizeId(raw.skinId, DEFAULT_CUSTOMIZATION.skinId),
    eyesId: sanitizeId(raw.eyesId, DEFAULT_CUSTOMIZATION.eyesId ?? 'determined'),
    mouthId: sanitizeId(raw.mouthId, DEFAULT_CUSTOMIZATION.mouthId ?? 'confident_grin'),
    hairStyleId: sanitizeId(raw.hairStyleId ?? raw.hairId, DEFAULT_CUSTOMIZATION.hairStyleId ?? 'swept_undercut'),
    hairColorId: sanitizeId(raw.hairColorId, DEFAULT_CUSTOMIZATION.hairColorId ?? 'espresso'),
    topId: sanitizeId(raw.topId ?? raw.clothesId, DEFAULT_CUSTOMIZATION.topId ?? 'hoodie_urban'),
    pantsId: sanitizeId(raw.pantsId, DEFAULT_CUSTOMIZATION.pantsId ?? 'cargo_charcoal'),
    shoesId: sanitizeId(raw.shoesId, DEFAULT_CUSTOMIZATION.shoesId ?? 'sneakers_white'),
    hatId: sanitizeId(raw.hatId, DEFAULT_CUSTOMIZATION.hatId ?? 'none'),
    glassesId: sanitizeId(raw.glassesId, DEFAULT_CUSTOMIZATION.glassesId ?? 'none'),
    maskId: sanitizeId(raw.maskId, DEFAULT_CUSTOMIZATION.maskId ?? 'none'),
    armorId: sanitizeId(raw.armorId, DEFAULT_CUSTOMIZATION.armorId),
    accessoryId: sanitizeId(raw.accessoryId, DEFAULT_CUSTOMIZATION.accessoryId),
    petId: sanitizeId(raw.petId, DEFAULT_CUSTOMIZATION.petId),
  };
}

const MAX_PLAYERS_PER_MATCH = 100;
const MIN_PLAYERS_PER_MATCH = 2;
const WAITING_ARENA_DURATION_SEC = 30;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sanitizeWeaponSkins(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [wId, skinId] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof wId === 'string' &&
      wId.trim() &&
      typeof skinId === 'string' &&
      isValidWeaponSkinId(skinId)
    ) {
      out[wId.trim().slice(0, 32)] = skinId;
    }
  }
  return out;
}

function pointToRayDistance(
  px: number,
  py: number,
  pz: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): { dist: number; along: number } {
  const len = Math.hypot(dx, dy, dz) || 1;
  const ndx = dx / len;
  const ndy = dy / len;
  const ndz = dz / len;
  const vx = px - ox;
  const vy = py - oy;
  const vz = pz - oz;
  const along = Math.max(0, vx * ndx + vy * ndy + vz * ndz);
  const cx = ox + ndx * along - px;
  const cy = oy + ndy * along - py;
  const cz = oz + ndz * along - pz;
  return { dist: Math.hypot(cx, cy, cz), along };
}

const GLOO_WALL_MAX_HP = 500;
const GLOO_WALL_MAX_ACTIVE_PER_PLAYER = 3;
const GLOO_ARC_RADIUS = 2.5;
const makeServerGlooPanel = (
  degAngle: number,
  width: number,
  height: number,
  depth: number,
) => {
  const ang = (degAngle * Math.PI) / 180;
  return {
    px: GLOO_ARC_RADIUS * Math.sin(ang),
    pz: GLOO_ARC_RADIUS * (Math.cos(ang) - 1),
    ang,
    halfW: width * 0.5,
    halfH: height * 0.5,
    halfD: depth * 0.5 + 0.01,
  };
};
const GLOO_PANELS: ReadonlyArray<{ px: number; pz: number; ang: number; halfW: number; halfH: number; halfD: number }> = [
  makeServerGlooPanel(0, 1.18, 2.06, 0.32),
  makeServerGlooPanel(-26, 1.18, 2.02, 0.32),
  makeServerGlooPanel(26, 1.18, 2.02, 0.32),
  makeServerGlooPanel(-52, 1.18, 1.92, 0.32),
  makeServerGlooPanel(52, 1.18, 1.92, 0.32),
];

function extractServerGlooSeq(wallId: string): number {
  const idx = wallId.lastIndexOf('_');
  if (idx < 0) return 0;
  const n = Number(wallId.slice(idx + 1));
  return Number.isFinite(n) ? n : 0;
}

function segmentIntersectsGlooWall(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  wall: ServerGlooWall,
): boolean {
  const heightScale =
    typeof wall.heightScale === 'number' && Number.isFinite(wall.heightScale)
      ? Math.max(0.72, Math.min(1, wall.heightScale))
      : 1;
  const cosY = Math.cos(wall.yaw);
  const sinY = Math.sin(wall.yaw);
  const dax = ax - wall.x;
  const daz = az - wall.z;
  const dbx = bx - wall.x;
  const dbz = bz - wall.z;

  const lax = dax * cosY - daz * sinY;
  const lay = ay - wall.y;
  const laz = dax * sinY + daz * cosY;

  const lbx = dbx * cosY - dbz * sinY;
  const lby = by - wall.y;
  const lbz = dbx * sinY + dbz * cosY;

  for (const panel of GLOO_PANELS) {
    const halfH = panel.halfH * heightScale;
    const cosP = Math.cos(panel.ang);
    const sinP = Math.sin(panel.ang);
    const pax = lax - panel.px;
    const paz = laz - panel.pz;
    const pbx = lbx - panel.px;
    const pbz = lbz - panel.pz;

    const uax = pax * cosP - paz * sinP;
    const uay = lay - halfH;
    const uaz = pax * sinP + paz * cosP;

    const ubx = pbx * cosP - pbz * sinP;
    const uby = lby - halfH;
    const ubz = pbx * sinP + pbz * cosP;

    const dx = ubx - uax;
    const dy = uby - uay;
    const dz = ubz - uaz;

    let tMin = 0;
    let tMax = 1;

    const axes: Array<[number, number, number]> = [
      [uax, dx, panel.halfW],
      [uay, dy, halfH],
      [uaz, dz, panel.halfD],
    ];
    let hit = true;
    for (const [o, d, half] of axes) {
      if (Math.abs(d) < 1e-6) {
        if (o < -half || o > half) {
          hit = false;
          break;
        }
      } else {
        const inv = 1 / d;
        let t1 = (-half - o) * inv;
        let t2 = (half - o) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) {
          hit = false;
          break;
        }
      }
    }
    if (hit && tMax >= 0 && tMin <= 1) {
      return true;
    }
  }
  return false;
}

function computeServerDamage(
  weapon: RankedWeaponStatSpec,
  distance: number,
  isHeadshot: boolean,
  targetShield: number,
  targetDamageReductionPct: number,
): { totalDamage: number; shieldDamage: number; healthDamage: number } {
  const { closeRange, mediumRange, mediumDamageRatio, longDamageRatio } = weapon;
  const maxRange = Math.max(mediumRange + 1, weapon.range);

  let multiplier = 1.0;
  if (distance <= closeRange) {
    multiplier = 1.0;
  } else if (distance <= mediumRange) {
    const t = (distance - closeRange) / Math.max(0.001, mediumRange - closeRange);
    multiplier = 1.0 + (mediumDamageRatio - 1.0) * clamp(t, 0, 1);
  } else if (distance <= maxRange) {
    const t = (distance - mediumRange) / Math.max(0.001, maxRange - mediumRange);
    multiplier = mediumDamageRatio + (longDamageRatio - mediumDamageRatio) * clamp(t, 0, 1);
  } else {
    const overT = clamp((distance - maxRange) / Math.max(5, maxRange * 0.4), 0, 1);
    multiplier = longDamageRatio * (1 - overT * 0.5);
  }

  const base = isHeadshot
    ? Math.max(weapon.headshotDamage, Math.round(weapon.damage * weapon.criticalMultiplier))
    : weapon.damage;
  const reductionPct = clamp(targetDamageReductionPct, 0, 60);
  const rawDamage = base * multiplier * (1 - reductionPct / 100);

  let shieldDamage = 0;
  let healthDamage = 0;
  if (targetShield > 0) {
    shieldDamage = Math.min(targetShield, rawDamage);
    healthDamage = Math.max(0, rawDamage - targetShield);
  } else {
    healthDamage = rawDamage;
  }

  const roundedShield = Math.round(shieldDamage);
  const roundedHealth = Math.round(healthDamage);
  return {
    totalDamage: Math.max(1, roundedShield + roundedHealth),
    shieldDamage: roundedShield,
    healthDamage: roundedHealth,
  };
}

export class RankedMatchServer {
  private readonly wss: WebSocketServer;
  private readonly store: RankedStore;
  private readonly firebaseProjectId?: string;
  private readonly firestoreDatabaseId: string;
  private readonly verifyFirebaseToken?: (token: string) => Promise<{ uid: string } | null>;
  private readonly sessions = new Set<ClientSession>();
  private readonly queue: ClientSession[] = [];
  private readonly lobbies = new Map<string, LobbyRoom>();
  private readonly matches = new Map<string, MatchRoom>();
  private readonly squads = new Map<string, ServerSquadRoom>();
  private readonly squadInvites = new Map<string, ServerSquadInvite>();
  private readonly allyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>();
  private serverSeq = 1;
  private matchmakingTimer: ReturnType<typeof setInterval>;
  private matchTickTimer: ReturnType<typeof setInterval>;
  private heartbeatTimer: ReturnType<typeof setInterval>;
  private lastTickMs = Date.now();

  constructor(store: RankedStore, options?: RankedMatchServerOptions) {
    this.store = store;
    this.firebaseProjectId = options?.firebaseProjectId;
    this.firestoreDatabaseId = options?.firestoreDatabaseId ?? '(default)';
    this.verifyFirebaseToken = options?.verifyFirebaseToken;
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.matchmakingTimer = setInterval(() => this.tickMatchmakingAndLobbies(), 1000);
    this.matchTickTimer = setInterval(() => this.tickMatches(), 50);
    this.heartbeatTimer = setInterval(() => this.tickHeartbeat(), 15000);
  }

  handleUpgrade(request: IncomingMessage, socket: unknown, head: Buffer): void {
    this.wss.handleUpgrade(
      request,
      socket as import('node:stream').Duplex,
      head,
      (ws) => {
        this.wss.emit('connection', ws, request);
      },
    );
  }

  getOnlineStatus(): ServerOnlineStatus {
    return {
      onlinePlayers: this.sessions.size,
      queuedPlayers: this.queue.length,
      activeLobbies: this.lobbies.size,
      activeMatches: this.matches.size,
    };
  }

  private send(ws: WebSocket, type: string, payload: unknown): void {
    if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 512 * 1024) return;
    const envelope: NetEnvelope = {
      type,
      seq: this.serverSeq++,
      serverTimeMs: Date.now(),
      payload,
    };
    ws.send(JSON.stringify(envelope));
  }

  private sendToSession(session: ClientSession | null, type: string, payload: unknown): void {
    if (!session) return;
    this.send(session.ws, type, payload);
  }

  private broadcastToRoom(room: MatchRoom, type: string, payload: unknown, excludePlayerId?: string): void {
    const envelope: NetEnvelope = {
      type,
      seq: this.serverSeq++,
      serverTimeMs: Date.now(),
      payload,
    };
    const encoded = JSON.stringify(envelope);
    for (const mp of room.players.values()) {
      if (excludePlayerId && mp.playerId === excludePlayerId) continue;
      const ws = mp.session?.ws;
      if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 262144) {
        ws.send(encoded);
      }
    }
  }

  private handleConnection(ws: WebSocket): void {
    const session: ClientSession = {
      ws,
      isAliveSocket: true,
      playerId: null,
      profile: null,
      firebaseUid: null,
      firebaseIdToken: null,
      firebaseTokenVerifyPromise: null,
      inExternalMatch: false,
      characterId: 'vanguard',
      customization: { ...DEFAULT_CUSTOMIZATION },
      avatarId: DEFAULT_AVATAR_ID,
      bannerId: DEFAULT_BANNER_ID,
      weaponSkins: {},
      queuePreferredMap: 'any',
      queuedAtMs: 0,
      lobbyId: null,
      matchId: null,
      squadId: null,
    };
    this.sessions.add(session);

    ws.on('pong', () => {
      session.isAliveSocket = true;
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as Partial<NetEnvelope>;
        if (!parsed || typeof parsed.type !== 'string') return;
        this.handleMessage(session, parsed.type, parsed.payload);
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(session);
    });

    ws.on('error', () => {
      this.handleDisconnect(session);
    });

    this.send(ws, 'server:status', this.getOnlineStatus());
  }

  private attachFirebaseTokenToSession(session: ClientSession, token: string): void {
    const trimmed = token.trim();
    if (!trimmed || trimmed.length > 8192 || !session.playerId) return;
    const boundUid = this.store.getFirebaseUidByPlayerId(session.playerId);
    if (!this.verifyFirebaseToken) {
      session.firebaseUid = boundUid;
      session.firebaseIdToken = trimmed;
      session.firebaseTokenVerifyPromise = null;
      return;
    }
    const verifyPromise = this.verifyFirebaseToken(trimmed)
      .then((decoded) => {
        if (!decoded || !session.playerId) return;
        const latestBoundUid = this.store.getFirebaseUidByPlayerId(session.playerId);
        if (latestBoundUid && decoded.uid !== latestBoundUid) {
          return;
        }
        session.firebaseUid = decoded.uid;
        session.firebaseIdToken = trimmed;
      })
      .catch(() => {
        // Ignore transient verification error
      });
    session.firebaseTokenVerifyPromise = verifyPromise;
  }

  private handleMessage(session: ClientSession, type: string, rawPayload: unknown): void {
    switch (type) {
      case 'ping':
        this.sendToSession(session, 'pong', {
          clientTime: (rawPayload as { clientTime?: number })?.clientTime ?? Date.now(),
        });
        return;

      case 'auth:hello': {
        const p = rawPayload as AuthMessagePayload;
        if (!p || typeof p.playerId !== 'string' || typeof p.secretToken !== 'string') {
          this.sendToSession(session, 'auth:error', { message: 'Missing credentials' });
          return;
        }
        const verified = this.store.verifyCredentials(p.playerId, p.secretToken);
        if (!verified) {
          this.sendToSession(session, 'auth:error', { message: 'Invalid credentials' });
          return;
        }
        // Kick stale socket if same player reconnects
        for (const other of this.sessions) {
          if (other !== session && other.playerId === verified.playerId) {
            this.removeFromQueue(other);
            this.removeFromLobby(other);
            this.removeFromSquad(other, true);
            other.playerId = null;
            other.ws.close();
          }
        }
        session.playerId = verified.playerId;
        session.profile = verified;
        session.firebaseUid = this.store.getFirebaseUidByPlayerId(verified.playerId);
        session.firebaseIdToken = null;
        session.firebaseTokenVerifyPromise = null;
        if (typeof p.firebaseIdToken === 'string' && p.firebaseIdToken.trim()) {
          this.attachFirebaseTokenToSession(session, p.firebaseIdToken);
        }
        if (typeof p.characterId === 'string') session.characterId = p.characterId;
        if (p.customization) session.customization = sanitizeCustomization(p.customization);
        if (isValidAvatarId(p.avatarId)) session.avatarId = p.avatarId;
        else if (verified.vault && isValidAvatarId(verified.vault.equippedAvatarId)) {
          session.avatarId = verified.vault.equippedAvatarId;
        }
        if (isValidBannerId(p.bannerId)) session.bannerId = p.bannerId;
        else if (verified.vault && isValidBannerId(verified.vault.equippedBannerId)) {
          session.bannerId = verified.vault.equippedBannerId;
        }
        if (p.weaponSkins) session.weaponSkins = sanitizeWeaponSkins(p.weaponSkins);
        else if (verified.vault?.equippedWeaponSkins) {
          session.weaponSkins = sanitizeWeaponSkins(verified.vault.equippedWeaponSkins);
        }

        // Check if player has an active match they can rejoin after temporary drop
        for (const room of this.matches.values()) {
          const mp = room.players.get(verified.playerId);
          if (mp && mp.isAlive && !room.finished) {
            mp.session = session;
            mp.disconnectedAtMs = null;
            session.matchId = room.id;
            this.sendToSession(session, 'auth:ok', { profile: verified });
            this.sendToSession(session, 'match:start', this.buildMatchStartPayload(room, verified.playerId));
            return;
          }
        }

        this.sendToSession(session, 'auth:ok', { profile: verified });
        this.sendSquadStateToSession(session);
        this.sendFriendRequestsToSession(session);
        this.broadcastFriendsToAllLobbySessions();
        this.broadcastStatus();
        return;
      }

      default:
        break;
    }

    if (!session.playerId || !session.profile) {
      this.sendToSession(session, 'server:error', { message: 'Authenticate first' });
      return;
    }
    // Refresh latest profile snapshot (e.g. after rename)
    session.profile = this.store.getProfile(session.playerId) ?? session.profile;

    switch (type) {
      case 'auth:firebaseToken': {
        const token = (rawPayload as { firebaseIdToken?: unknown })?.firebaseIdToken;
        if (typeof token === 'string' && token.trim()) {
          this.attachFirebaseTokenToSession(session, token);
        }
        break;
      }

      case 'queue:join': {
        if (session.matchId || session.lobbyId || session.inExternalMatch) return;
        const p = rawPayload as QueueJoinPayload;
        if (p?.characterId) session.characterId = p.characterId;
        if (p?.customization) session.customization = sanitizeCustomization(p.customization);
        if (isValidAvatarId(p?.avatarId)) session.avatarId = p.avatarId;
        if (isValidBannerId(p?.bannerId)) session.bannerId = p.bannerId;
        if (p?.weaponSkins) session.weaponSkins = sanitizeWeaponSkins(p.weaponSkins);
        const preferredMap: RankedMapId | 'any' =
          p?.preferredMap === 'desert' || p?.preferredMap === 'forest' || p?.preferredMap === 'snow'
            ? p.preferredMap
            : 'any';
        session.queuePreferredMap = preferredMap;

        const squad = session.squadId ? this.squads.get(session.squadId) : undefined;
        if (squad) {
          const humanMembers = Array.from(squad.members.values()).filter(
            (m) => !m.isBotAlly && m.session && m.session.playerId && m.session.profile,
          );
          if (squad.leaderId !== session.playerId) {
            this.sendToSession(session, 'server:error', {
              message: 'Only the squad leader can start Ranked matchmaking',
            });
            return;
          }
          if (
            humanMembers.some((m) =>
              Boolean(
                m.status === 'in-match' ||
                  m.session?.matchId ||
                  m.session?.lobbyId ||
                  m.session?.inExternalMatch,
              ),
            )
          ) {
            this.sendToSession(session, 'server:error', {
              message: 'A squadmate is currently in another match',
            });
            return;
          }
          if (humanMembers.some((m) => m.status !== 'ready')) {
            this.sendToSession(session, 'server:error', {
              message: 'All party members must be READY before starting matchmaking',
            });
            return;
          }
          const now = Date.now();
          for (const m of humanMembers) {
            const ms = m.session!;
            ms.queuePreferredMap = preferredMap;
            if (!this.queue.includes(ms)) {
              ms.queuedAtMs = now;
              this.queue.push(ms);
            }
            this.sendQueueUpdate(ms);
          }
        } else {
          if (!this.queue.includes(session)) {
            session.queuedAtMs = Date.now();
            this.queue.push(session);
          }
          this.sendQueueUpdate(session);
        }
        this.runMatchmakingPass();
        this.broadcastStatus();
        break;
      }

      case 'queue:leave': {
        const squad = session.squadId ? this.squads.get(session.squadId) : undefined;
        if (squad) {
          this.clearSquadFromQueue(squad);
        } else {
          this.removeFromQueue(session);
          this.sendToSession(session, 'queue:left', {});
        }
        this.broadcastStatus();
        break;
      }

      case 'lobby:ready': {
        const lobby = session.lobbyId ? this.lobbies.get(session.lobbyId) : undefined;
        if (!lobby) return;
        const part = lobby.participants.get(session.playerId);
        if (!part) return;
        const nextReady = Boolean((rawPayload as { ready?: boolean })?.ready);
        part.ready = nextReady;
        this.evaluateLobbyCountdown(lobby);
        this.broadcastLobbySnapshot(lobby);
        break;
      }

      case 'lobby:voteMap': {
        const lobby = session.lobbyId ? this.lobbies.get(session.lobbyId) : undefined;
        if (!lobby) return;
        const part = lobby.participants.get(session.playerId);
        if (!part) return;
        const m = (rawPayload as { mapId?: RankedMapId })?.mapId;
        if (m === 'desert' || m === 'forest' || m === 'snow') {
          part.mapVote = m;
          this.broadcastLobbySnapshot(lobby);
        }
        break;
      }

      case 'lobby:leave': {
        this.removeFromLobby(session);
        this.sendToSession(session, 'lobby:left', {});
        this.broadcastStatus();
        break;
      }

      case 'player:state': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished) return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive) return;
        this.applyPlayerState(room, mp, rawPayload as PlayerStateUploadPayload);
        break;
      }

      case 'match:jump': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished) return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive || mp.dropPhase !== 'airplane') return;
        mp.dropPhase = 'freefall';
        break;
      }

      case 'match:deployChute': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished) return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive) return;
        if (mp.dropPhase === 'freefall') {
          mp.dropPhase = 'parachute';
        }
        break;
      }

      case 'combat:shot': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished) return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive || (mp.dropPhase !== 'landed' && mp.dropPhase !== 'waiting')) return;
        const p = rawPayload as CombatShotPayload;
        const spec = RANKED_WEAPON_STATS[p?.weaponId];
        if (!spec) return;
        const now = Date.now();
        const minIntervalMs = (60000 / spec.fireRate) * 0.6;
        if (now - mp.lastShotMs < minIntervalMs) return;
        mp.lastShotMs = now;
        if (spec.id !== 'fists') {
          mp.activeWeaponId = spec.id;
        }

        this.broadcastToRoom(
          room,
          'combat:remoteShot',
          {
            shooterId: mp.playerId,
            weaponId: spec.id,
            ox: p.ox,
            oy: p.oy,
            oz: p.oz,
            dx: p.dx,
            dy: p.dy,
            dz: p.dz,
          },
          mp.playerId,
        );
        break;
      }

      case 'combat:hitClaim': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished || room.matchPhase !== 'active') return;
        const attacker = room.players.get(session.playerId);
        if (!attacker || !attacker.isAlive || attacker.dropPhase !== 'landed') return;
        const p = rawPayload as CombatHitClaimPayload;
        if (!p || typeof p.targetId !== 'string' || p.targetId === attacker.playerId) return;
        const victim = room.players.get(p.targetId);
        if (!victim || !victim.isAlive || victim.dropPhase !== 'landed') return;
        if (this.getTeamKey(attacker) === this.getTeamKey(victim)) return;
        const spec = RANKED_WEAPON_STATS[p.weaponId];
        if (!spec) return;

        const now = Date.now();
        const fireIntervalMs = (60000 / spec.fireRate) * 0.55;
        if (now - attacker.lastHitWindowMs > fireIntervalMs) {
          attacker.lastHitWindowMs = now;
          attacker.hitsInWindow = 0;
        }
        attacker.hitsInWindow += 1;
        if (attacker.hitsInWindow > spec.pellets) {
          return;
        }

        const distance = Math.hypot(
          attacker.x - victim.x,
          attacker.y - victim.y,
          attacker.z - victim.z,
        );
        const isMeleeWeapon =
          spec.id === 'fists' || spec.id === 'combat_knife' || spec.id === 'baseball_bat';
        const maxAllowedDist = isMeleeWeapon
          ? Math.max(3.8, spec.range * 1.25)
          : spec.range * 1.2;
        if (distance > maxAllowedDist) return;

        // Verify the claimed shot origin is near the attacker and ray passes near victim hitbox
        const originDist = Math.hypot(
          p.ox - attacker.x,
          p.oy - (attacker.y + 1.4),
          p.oz - attacker.z,
        );
        if (originDist > 4.2) return;

        const { dist: rayMissDist } = pointToRayDistance(
          victim.x,
          victim.y + 0.95,
          victim.z,
          p.ox,
          p.oy,
          p.oz,
          p.dx,
          p.dy,
          p.dz,
        );
        if (rayMissDist > 2.6) return;

        // Server-authoritative Gloo Wall bullet blocking check
        for (const wall of room.glooWalls.values()) {
          if (
            wall.hp > 0 &&
            segmentIntersectsGlooWall(
              p.ox,
              p.oy,
              p.oz,
              victim.x,
              victim.y + 0.95,
              victim.z,
              wall,
            )
          ) {
            return;
          }
        }

        const dmg = computeServerDamage(
          spec,
          distance,
          Boolean(p.isHeadshot),
          victim.shield,
          victim.damageReductionPct,
        );

        victim.shield = Math.max(0, victim.shield - dmg.shieldDamage);
        victim.health = Math.max(0, victim.health - dmg.healthDamage);
        attacker.damageDealt += dmg.totalDamage;

        this.broadcastToRoom(room, 'combat:damage', {
          attackerId: attacker.playerId,
          targetId: victim.playerId,
          weaponId: spec.id,
          weaponName: spec.name,
          isHeadshot: Boolean(p.isHeadshot),
          totalDamage: dmg.totalDamage,
          shieldDamage: dmg.shieldDamage,
          healthDamage: dmg.healthDamage,
          distanceM: Math.round(distance),
          targetHealth: victim.health,
          targetShield: victim.shield,
          hx: Number.isFinite(p.hx) ? p.hx : victim.x,
          hy: Number.isFinite(p.hy) ? p.hy : victim.y + (p.isHeadshot ? 1.55 : 1.05),
          hz: Number.isFinite(p.hz) ? p.hz : victim.z,
        });

        if (victim.health <= 0) {
          this.eliminatePlayer(
            room,
            victim,
            attacker,
            spec.name,
            Boolean(p.isHeadshot),
            Math.round(distance),
            'weapon',
          );
        }
        break;
      }

      case 'gloo:deploy': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished || room.matchPhase !== 'active') return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive || mp.dropPhase !== 'landed') return;
        const now = Date.now();

        const p = rawPayload as GlooWallDeployPayload;
        if (
          !p ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          !Number.isFinite(p.z) ||
          !Number.isFinite(p.yaw)
        ) {
          return;
        }

        const wx = clamp(p.x, -540, 540);
        const wy = clamp(p.y, -40, 120);
        const wz = clamp(p.z, -540, 540);
        const deployDist = Math.hypot(wx - mp.x, wz - mp.z);
        if (deployDist < 1.15 || deployDist > 6.5) return;

        // Collect active walls owned by this player sorted oldest-first.
        // If this player already has >= 3 active walls, the oldest wall(s) will be destroyed first.
        const ownedWalls: ServerGlooWall[] = [];
        for (const existing of room.glooWalls.values()) {
          if (existing.ownerId === mp.playerId) {
            ownedWalls.push(existing);
          }
        }
        ownedWalls.sort(
          (a, b) =>
            a.createdAtMs - b.createdAtMs ||
            extractServerGlooSeq(a.id) - extractServerGlooSeq(b.id),
        );
        const evictCount = Math.max(0, ownedWalls.length - (GLOO_WALL_MAX_ACTIVE_PER_PLAYER - 1));
        const toEvict = evictCount > 0 ? ownedWalls.slice(0, evictCount) : [];
        const evictedIds = new Set(toEvict.map((w) => w.id));

        // Allow nearby/adjacent Gloo Walls freely; block ONLY direct physical clipping inside an existing wall's core
        for (const existing of room.glooWalls.values()) {
          if (evictedIds.has(existing.id)) continue;
          const existingHeight = 2.06 * (existing.heightScale ?? 1);
          if (wy >= existing.y + existingHeight - 0.1 || wy + 1.5 <= existing.y + 0.1) continue;
          const dx = wx - existing.x;
          const dz = wz - existing.z;
          if (dx * dx + dz * dz < 0.42 * 0.42) {
            return;
          }
          const cosE = Math.cos(existing.yaw);
          const sinE = Math.sin(existing.yaw);
          const lx = dx * cosE - dz * sinE;
          const lz = dx * sinE + dz * cosE;
          if (Math.abs(lx) <= 2.85 && lz <= 0.6 && lz >= -2.0) {
            for (const panel of GLOO_PANELS) {
              const cosP = Math.cos(panel.ang);
              const sinP = Math.sin(panel.ang);
              const px = lx - panel.px;
              const pz = lz - panel.pz;
              const ux = px * cosP - pz * sinP;
              const uz = px * sinP + pz * cosP;
              if (Math.abs(ux) < panel.halfW - 0.08 && Math.abs(uz) < panel.halfD + 0.12) {
                return;
              }
            }
          }
        }
        for (const other of room.players.values()) {
          if (!other.isAlive || other.dropPhase !== 'landed') continue;
          if (Math.hypot(other.x - wx, other.z - wz) < 0.82 && Math.abs(other.y - wy) < 1.95) {
            return;
          }
        }

        // Automatically destroy the oldest wall(s) placed by this player before creating the new wall
        for (const oldWall of toEvict) {
          room.glooWalls.delete(oldWall.id);
          this.broadcastToRoom(room, 'gloo:destroyed', {
            wallId: oldWall.id,
            x: oldWall.x,
            y: oldWall.y,
            z: oldWall.z,
          });
        }

        mp.lastGlooDeployMs = now;
        const normalizedYaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw));
        const safeSkinId =
          typeof p.skinId === 'string' && /^[a-z0-9-]{3,40}$/i.test(p.skinId)
            ? p.skinId
            : 'gloo-arctic-classic';
        const safeHeightScale =
          typeof p.heightScale === 'number' && Number.isFinite(p.heightScale)
            ? Math.round(clamp(p.heightScale, 0.72, 1) * 100) / 100
            : 1;

        const wall: ServerGlooWall = {
          id: `gloo_${room.id}_${room.nextGlooSeq++}`,
          ownerId: mp.playerId,
          ownerName: mp.name,
          x: Math.round(wx * 100) / 100,
          y: Math.round(wy * 100) / 100,
          z: Math.round(wz * 100) / 100,
          yaw: Math.round(normalizedYaw * 1000) / 1000,
          hp: GLOO_WALL_MAX_HP,
          maxHp: GLOO_WALL_MAX_HP,
          createdAtMs: now,
          skinId: safeSkinId,
          heightScale: safeHeightScale,
        };
        room.glooWalls.set(wall.id, wall);

        this.broadcastToRoom(room, 'gloo:spawned', { wall });
        break;
      }

      case 'gloo:damage': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished || room.matchPhase !== 'active') return;
        const attacker = room.players.get(session.playerId);
        if (!attacker || !attacker.isAlive || attacker.dropPhase !== 'landed') return;
        const p = rawPayload as GlooWallDamagePayload;
        if (!p || typeof p.wallId !== 'string') return;
        const wall = room.glooWalls.get(p.wallId);
        if (!wall || wall.hp <= 0) return;
        const spec = RANKED_WEAPON_STATS[p.weaponId];
        if (!spec) return;

        const dist = Math.hypot(attacker.x - wall.x, attacker.z - wall.z);
        if (dist > spec.range * 1.25) return;

        const wallDamage = Math.max(12, Math.round(spec.damage));
        wall.hp = Math.max(0, wall.hp - wallDamage);
        if (wall.hp <= 0) {
          room.glooWalls.delete(wall.id);
          this.broadcastToRoom(room, 'gloo:destroyed', {
            wallId: wall.id,
            x: wall.x,
            y: wall.y,
            z: wall.z,
            attackerId: attacker.playerId,
          });
        } else {
          this.broadcastToRoom(room, 'gloo:updated', {
            wallId: wall.id,
            hp: wall.hp,
            maxHp: wall.maxHp,
            attackerId: attacker.playerId,
          });
        }
        break;
      }

      case 'loot:collect': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished || room.matchPhase !== 'active') return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive) return;
        const p = rawPayload as LootCollectClaimPayload;
        if (!p || typeof p.lootId !== 'string') return;
        if (room.collectedLootIds.has(p.lootId)) {
          this.sendToSession(session, 'loot:rejected', { lootId: p.lootId });
          return;
        }
        const droppedEntry = room.droppedLoot.get(p.lootId);
        const resolvedItemId = droppedEntry?.itemId ?? p.itemId;
        room.collectedLootIds.add(p.lootId);
        room.droppedLoot.delete(p.lootId);

        if (resolvedItemId === 'gloo_wall') {
          this.sendToSession(session, 'gloo:inventory', { glooWalls: GLOO_WALL_MAX_ACTIVE_PER_PLAYER });
        }

        this.broadcastToRoom(room, 'loot:collected', {
          lootId: p.lootId,
          collectorId: mp.playerId,
        });
        break;
      }

      case 'loot:drop': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished || room.matchPhase !== 'active') return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive) return;
        const p = rawPayload as LootDropReportPayload;
        if (!p || typeof p.itemId !== 'string') return;
        const lootId = `drop_${room.nextDropSeq++}`;
        const dropItem: DroppedLootSync = {
          lootId,
          itemId: p.itemId,
          x: clamp(Number(p.x) || mp.x, -540, 540),
          y: Number(p.y) || mp.y,
          z: clamp(Number(p.z) || mp.z, -540, 540),
          quantity: Math.max(1, Math.min(99, Math.round(p.quantity || 1))),
          weaponAmmoInMag: p.weaponAmmoInMag,
          armorDurability: p.armorDurability,
        };
        room.droppedLoot.set(lootId, dropItem);
        this.broadcastToRoom(room, 'loot:dropped', dropItem);
        break;
      }

      case 'player:useConsumable': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        if (!room || room.finished || room.matchPhase !== 'active') return;
        const mp = room.players.get(session.playerId);
        if (!mp || !mp.isAlive) return;
        const p = rawPayload as UseConsumableReportPayload;
        const eff = RANKED_CONSUMABLE_EFFECTS[p?.itemId];
        if (!eff) return;
        const now = Date.now();
        if (now - mp.lastConsumableMs < 400) return;
        mp.lastConsumableMs = now;
        if (eff.heal > 0) {
          mp.health = Math.min(mp.maxHealth, mp.health + eff.heal);
        }
        if (eff.shield > 0) {
          mp.shield = Math.min(mp.maxShield, mp.shield + eff.shield);
        }
        this.sendToSession(session, 'player:vitals', {
          health: mp.health,
          shield: mp.shield,
        });
        break;
      }

      case 'match:leave': {
        const room = session.matchId ? this.matches.get(session.matchId) : undefined;
        session.matchId = null;
        if (room && session.playerId) {
          this.handlePlayerExitRoom(room, session.playerId);
        }
        this.setSessionMatchStatus(session, false);
        this.broadcastFriendsToAllLobbySessions();
        break;
      }

      case 'friends:get': {
        this.sendFriendsListToSession(session);
        this.sendFriendRequestsToSession(session);
        this.sendSquadStateToSession(session);
        break;
      }

      case 'squad:create': {
        const requested = (rawPayload as { maxSize?: number })?.maxSize;
        const maxSize: SquadSize = requested === 2 ? 2 : 4;
        this.handleSquadCreate(session, maxSize);
        break;
      }

      case 'squad:setSize': {
        const requested = (rawPayload as { maxSize?: number })?.maxSize;
        const maxSize: SquadSize = requested === 2 ? 2 : requested === 4 ? 4 : 1;
        this.handleSquadSetSize(session, maxSize);
        break;
      }

      case 'squad:setReady': {
        const ready = Boolean((rawPayload as { ready?: unknown })?.ready);
        this.handleSquadSetReady(session, ready);
        break;
      }

      case 'squad:transferLeader': {
        const targetId = (rawPayload as { targetPlayerId?: unknown })?.targetPlayerId;
        if (typeof targetId === 'string' && targetId.trim()) {
          this.handleSquadTransferLeader(session, targetId.trim());
        }
        break;
      }

      case 'squad:setMatchStatus': {
        const inMatch = Boolean((rawPayload as { inMatch?: unknown })?.inMatch);
        this.setSessionMatchStatus(session, inMatch);
        break;
      }

      case 'squad:startBattleRoyale': {
        this.handleSquadStartBattleRoyale(session, rawPayload);
        break;
      }

      case 'squad:invite': {
        const friendId = (rawPayload as { friendId?: unknown })?.friendId;
        if (typeof friendId === 'string' && friendId.trim()) {
          void this.handleSquadInvite(session, friendId.trim()).catch(() => {
            this.sendToSession(session, 'server:error', { message: 'Failed to send party invitation' });
          });
        }
        break;
      }

      case 'squad:inviteRespond': {
        const p = rawPayload as { inviteId?: unknown; accept?: unknown };
        if (typeof p?.inviteId === 'string') {
          this.handleSquadInviteRespond(session, p.inviteId, Boolean(p.accept));
        }
        break;
      }

      case 'squad:leave': {
        this.removeFromSquad(session, false);
        this.sendSquadStateToSession(session);
        this.broadcastFriendsToAllLobbySessions();
        break;
      }

      case 'squad:kick': {
        const targetId = (rawPayload as { targetPlayerId?: unknown })?.targetPlayerId;
        if (typeof targetId === 'string') {
          this.handleSquadKick(session, targetId);
        }
        break;
      }

      case 'squad:updateCharacter': {
        const p = rawPayload as {
          characterId?: unknown;
          customization?: Partial<RankedCustomizationPayload>;
          avatarId?: unknown;
          bannerId?: unknown;
          weaponSkins?: unknown;
        };
        if (typeof p?.characterId === 'string' && p.characterId.trim()) {
          session.characterId = p.characterId.trim();
        }
        if (p?.customization) {
          session.customization = sanitizeCustomization(p.customization);
        }
        if (isValidAvatarId(p?.avatarId)) {
          session.avatarId = p.avatarId;
        }
        if (isValidBannerId(p?.bannerId)) {
          session.bannerId = p.bannerId;
        }
        if (p?.weaponSkins !== undefined) {
          session.weaponSkins = sanitizeWeaponSkins(p.weaponSkins);
        }
        if (session.squadId && session.playerId) {
          const squad = this.squads.get(session.squadId);
          const member = squad?.members.get(session.playerId);
          if (squad && member) {
            member.characterId = session.characterId;
            member.customization = { ...session.customization };
            member.avatarId = session.avatarId;
            member.bannerId = session.bannerId;
            this.broadcastSquadState(squad);
          }
        }
        this.broadcastFriendsToAllLobbySessions();
        break;
      }
    }
  }

  private handleDisconnect(session: ClientSession): void {
    this.sessions.delete(session);
    this.removeFromQueue(session);
    this.removeFromLobby(session);
    this.removeFromSquad(session, true);

    if (session.matchId && session.playerId) {
      const room = this.matches.get(session.matchId);
      if (room) {
        if (room.matchPhase === 'waiting') {
          this.handlePlayerExitRoom(room, session.playerId);
        } else {
          const mp = room.players.get(session.playerId);
          if (mp) {
            mp.session = null;
            mp.disconnectedAtMs = Date.now();
          }
        }
      }
    }
    this.broadcastFriendsToAllLobbySessions();
    this.broadcastStatus();
  }

  private handlePlayerExitRoom(room: MatchRoom, playerId: string): void {
    const mp = room.players.get(playerId);
    if (!mp) return;
    if (mp.session) {
      this.setSessionMatchStatus(mp.session, false);
    }
    if (room.matchPhase === 'waiting') {
      if (mp.session) {
        mp.session.matchId = null;
      }
      room.players.delete(playerId);
      room.totalPlayers = room.players.size;
      if (room.players.size === 0) {
        room.finished = true;
        this.matches.delete(room.id);
      } else {
        this.broadcastToRoom(room, 'match:playerLeft', {
          playerId,
          totalPlayers: room.totalPlayers,
        });
      }
      this.broadcastStatus();
      return;
    }

    mp.session = null;
    if (mp.isAlive && !room.finished) {
      this.eliminatePlayer(room, mp, null, 'FORFEIT', false, 0, 'disconnect');
    }
    if (!mp.recordedOutcome && !room.finished) {
      const fallbackPlace = Math.max(2, this.countAliveTeams(room) + 1);
      this.finalizeMemberOutcome(room, mp, fallbackPlace, false, null, 'IN PROGRESS', Date.now(), false);
    }
  }

  private removeFromQueue(session: ClientSession): void {
    const idx = this.queue.indexOf(session);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
  }

  private clearSquadFromQueue(squad: ServerSquadRoom): void {
    for (const m of squad.members.values()) {
      if (m.session && this.queue.includes(m.session)) {
        this.removeFromQueue(m.session);
        this.sendToSession(m.session, 'queue:left', {});
      }
    }
  }

  private removeFromLobby(session: ClientSession): void {
    if (!session.lobbyId || !session.playerId) return;
    const lobby = this.lobbies.get(session.lobbyId);
    session.lobbyId = null;
    if (!lobby) return;
    lobby.participants.delete(session.playerId);
    if (lobby.participants.size === 0) {
      this.lobbies.delete(lobby.id);
      return;
    }
    if (lobby.participants.size < MIN_PLAYERS_PER_MATCH) {
      lobby.countdownSec = null;
    }
    this.broadcastLobbySnapshot(lobby);
  }

  private tickHeartbeat(): void {
    for (const s of this.sessions) {
      if (!s.isAliveSocket) {
        s.ws.terminate();
        continue;
      }
      s.isAliveSocket = false;
      s.ws.ping();
    }
  }

  private broadcastStatus(): void {
    const encoded = JSON.stringify({
      type: 'server:status',
      seq: this.serverSeq++,
      serverTimeMs: Date.now(),
      payload: this.getOnlineStatus(),
    });
    for (const s of this.sessions) {
      if (s.ws.readyState === WebSocket.OPEN && s.ws.bufferedAmount < 262144) {
        s.ws.send(encoded);
      }
    }
  }

  private tickMatchmakingAndLobbies(): void {
    this.runMatchmakingPass();

    for (const s of this.queue) {
      this.sendQueueUpdate(s);
    }

    for (const lobby of Array.from(this.lobbies.values())) {
      if (lobby.participants.size < MIN_PLAYERS_PER_MATCH) {
        lobby.countdownSec = null;
        continue;
      }
      if (lobby.countdownSec === null) {
        lobby.countdownSec = 15;
      } else {
        lobby.countdownSec -= 1;
      }

      if (lobby.countdownSec <= 0) {
        this.launchMatchFromLobby(lobby);
      } else {
        this.broadcastLobbySnapshot(lobby);
      }
    }
  }

  private sendQueueUpdate(session: ClientSession): void {
    if (!session.profile) return;
    const waitSec = Math.max(0, Math.floor((Date.now() - session.queuedAtMs) / 1000));
    const tolerance = waitSec >= 25 ? 9999 : 250 + Math.floor(waitSec / 5) * 150;
    this.sendToSession(session, 'queue:update', {
      waitSec,
      rpTolerance: tolerance,
      queuedPlayers: this.queue.length,
      onlinePlayers: this.sessions.size,
      preferredMap: session.queuePreferredMap,
    });
  }

  private mapsCompatible(a: RankedMapId | 'any', b: RankedMapId | 'any'): boolean {
    return a === 'any' || b === 'any' || a === b;
  }

  private resolveConcreteMapForGroup(sessions: readonly ClientSession[]): RankedMapId {
    for (const s of sessions) {
      if (s.queuePreferredMap !== 'any') {
        return s.queuePreferredMap;
      }
    }
    return (['desert', 'forest', 'snow'] as RankedMapId[])[crypto.randomInt(0, 3)];
  }

  private getRoomAverageRp(room: MatchRoom): number {
    let sum = 0;
    let count = 0;
    for (const p of room.players.values()) {
      sum += p.rp;
      count++;
    }
    return count > 0 ? sum / count : 200;
  }

  private createStagingSpawn(index: number): { x: number; y: number; z: number; yaw: number } {
    const angle = (index * 2.399963) % (Math.PI * 2);
    const radius = 8.5 + (index % 9) * 5.8;
    const x = Math.round(Math.cos(angle) * radius * 100) / 100;
    const z = Math.round(Math.sin(angle) * radius * 100) / 100;
    return { x, y: 0.1, z, yaw: Math.atan2(-x, -z) };
  }

  private runMatchmakingPass(): void {
    if (this.queue.length === 0) return;

    const now = Date.now();

    // Group live queued sessions by squad so human teammates always enter the same match together
    const buildQueuedUnits = (): Array<{
      sessions: ClientSession[];
      avgRp: number;
      preferredMap: RankedMapId | 'any';
      queuedAtMs: number;
    }> => {
      const grouped = new Map<string, ClientSession[]>();
      for (const s of this.queue) {
        if (!s.profile || !s.playerId) continue;
        const key = s.squadId ?? s.playerId;
        let list = grouped.get(key);
        if (!list) {
          list = [];
          grouped.set(key, list);
        }
        list.push(s);
      }
      const units: Array<{
        sessions: ClientSession[];
        avgRp: number;
        preferredMap: RankedMapId | 'any';
        queuedAtMs: number;
      }> = [];
      for (const list of grouped.values()) {
        let rpSum = 0;
        let oldestMs = now;
        let preferredMap: RankedMapId | 'any' = 'any';
        for (const s of list) {
          rpSum += s.profile?.rp ?? 0;
          if (s.queuedAtMs < oldestMs) oldestMs = s.queuedAtMs;
          if (preferredMap === 'any' && s.queuePreferredMap !== 'any') {
            preferredMap = s.queuePreferredMap;
          }
        }
        units.push({
          sessions: list,
          avgRp: rpSum / Math.max(1, list.length),
          preferredMap,
          queuedAtMs: oldestMs,
        });
      }
      return units;
    };

    // 1. First try joining an existing open pre-match waiting arena with enough space for the full squad unit
    for (const unit of buildQueuedUnits()) {
      const waitSec = (now - unit.queuedAtMs) / 1000;
      const tolerance = waitSec >= 20 ? 9999 : 300 + Math.floor(waitSec / 5) * 150;

      let matchedRoom: MatchRoom | null = null;
      for (const room of this.matches.values()) {
        if (room.finished || room.matchPhase !== 'waiting') continue;
        if (room.waitingRemainingSec <= 2.5) continue;
        if (room.players.size + unit.sessions.length > MAX_PLAYERS_PER_MATCH) continue;
        if (!this.mapsCompatible(unit.preferredMap, room.mapId)) continue;
        const avgRp = this.getRoomAverageRp(room);
        if (Math.abs(avgRp - unit.avgRp) <= tolerance) {
          matchedRoom = room;
          break;
        }
      }

      if (matchedRoom) {
        for (const s of unit.sessions) {
          this.removeFromQueue(s);
          this.addSessionToWaitingMatch(s, matchedRoom);
        }
      }
    }

    // 2. Sort remaining queued units by avg RP and form waiting arenas with >= 2 opposing teams
    const remainingUnits = buildQueuedUnits().sort((a, b) => a.avgRp - b.avgRp);
    const consumed = new Set<number>();

    for (let idx = 0; idx < remainingUnits.length; idx++) {
      if (consumed.has(idx)) continue;
      const anchor = remainingUnits[idx];
      const anchorWait = (now - anchor.queuedAtMs) / 1000;
      const anchorTol = anchorWait >= 20 ? 9999 : 250 + Math.floor(anchorWait / 5) * 150;

      let chosenMap: RankedMapId | 'any' = anchor.preferredMap;
      const groupIndices: number[] = [idx];
      const groupSessions: ClientSession[] = [...anchor.sessions];

      for (let j = idx + 1; j < remainingUnits.length; j++) {
        if (consumed.has(j)) continue;
        const cand = remainingUnits[j];
        if (groupSessions.length + cand.sessions.length > MAX_PLAYERS_PER_MATCH) continue;
        if (!this.mapsCompatible(chosenMap, cand.preferredMap)) continue;
        const candWait = (now - cand.queuedAtMs) / 1000;
        const candTol = candWait >= 20 ? 9999 : 250 + Math.floor(candWait / 5) * 150;
        const maxTol = Math.max(anchorTol, candTol);
        if (Math.abs(cand.avgRp - anchor.avgRp) <= maxTol) {
          if (chosenMap === 'any' && cand.preferredMap !== 'any') {
            chosenMap = cand.preferredMap;
          }
          groupIndices.push(j);
          for (const cs of cand.sessions) {
            groupSessions.push(cs);
          }
        }
      }

      if (groupIndices.length >= 2 && groupSessions.length >= MIN_PLAYERS_PER_MATCH) {
        for (const gi of groupIndices) {
          consumed.add(gi);
        }
        for (const member of groupSessions) {
          this.removeFromQueue(member);
        }
        const mapId = this.resolveConcreteMapForGroup(groupSessions);
        this.createWaitingMatchRoom(mapId, groupSessions);
      }
    }
  }

  private evaluateLobbyCountdown(lobby: LobbyRoom): void {
    if (lobby.participants.size < MIN_PLAYERS_PER_MATCH) {
      lobby.countdownSec = null;
      return;
    }
    let allReady = true;
    for (const p of lobby.participants.values()) {
      if (!p.ready) {
        allReady = false;
        break;
      }
    }
    if (allReady && (lobby.countdownSec === null || lobby.countdownSec > 3)) {
      lobby.countdownSec = 3;
    }
  }

  private resolveLobbyMap(lobby: LobbyRoom): {
    selectedMap: RankedMapId;
    votes: Record<RankedMapId, number>;
  } {
    const votes: Record<RankedMapId, number> = { desert: 0, forest: 0, snow: 0 };
    for (const p of lobby.participants.values()) {
      if (p.mapVote) {
        votes[p.mapVote] += 1;
      }
    }
    const maxVotes = Math.max(votes.desert, votes.forest, votes.snow);
    let selectedMap: RankedMapId = 'desert';
    if (maxVotes > 0) {
      const leaders = (['desert', 'forest', 'snow'] as RankedMapId[]).filter(
        (m) => votes[m] === maxVotes,
      );
      selectedMap = leaders[0];
    }
    return { selectedMap, votes };
  }

  private buildLobbySnapshot(lobby: LobbyRoom): LobbySnapshot {
    const { selectedMap, votes } = this.resolveLobbyMap(lobby);
    const players: LobbyPlayerInfo[] = [];
    for (const p of lobby.participants.values()) {
      const prof = p.session.profile;
      if (!prof) continue;
      players.push({
        playerId: prof.playerId,
        numericId: prof.numericId,
        name: prof.name,
        rp: prof.rp,
        tier: prof.tier,
        platform: prof.platform,
        gender: prof.gender ?? null,
        level: prof.level ?? 1,
        ready: p.ready,
        mapVote: p.mapVote,
        characterId: p.session.characterId,
        customization: p.session.customization,
        avatarId: p.session.avatarId,
        bannerId: p.session.bannerId,
      });
    }
    return {
      lobbyId: lobby.id,
      players,
      minPlayers: MIN_PLAYERS_PER_MATCH,
      maxPlayers: MAX_PLAYERS_PER_MATCH,
      countdownSec: lobby.countdownSec,
      selectedMap,
      mapVotes: votes,
    };
  }

  private broadcastLobbySnapshot(lobby: LobbyRoom): void {
    const encoded = JSON.stringify({
      type: 'lobby:state',
      seq: this.serverSeq++,
      serverTimeMs: Date.now(),
      payload: this.buildLobbySnapshot(lobby),
    });
    for (const p of lobby.participants.values()) {
      const ws = p.session.ws;
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 262144) {
        ws.send(encoded);
      }
    }
  }

  private createWaitingMatchRoom(mapId: RankedMapId, sessions: readonly ClientSession[]): void {
    const matchSeed = crypto.randomInt(1, 0x7fffffff);
    const paths = RANKED_FLIGHT_PATHS[mapId];
    const flightIdx = Math.abs(matchSeed) % paths.length;
    const flight = paths[flightIdx];
    const flightDist = Math.max(
      10,
      Math.hypot(flight.endX - flight.startX, flight.endZ - flight.startZ),
    );
    const flightDurationSec = flightDist / Math.max(10, flight.speedMps);

    const finalAngle = ((matchSeed % 360) * Math.PI) / 180;
    const finalDist = 55 + ((matchSeed >> 4) % 95);
    const finalX = Math.cos(finalAngle) * finalDist;
    const finalZ = Math.sin(finalAngle) * finalDist;
    const phase0 = ZONE_PHASES[0];

    const matchId = `m_${crypto.randomBytes(6).toString('hex')}`;
    const players = new Map<string, MatchPlayerState>();
    const now = Date.now();

    let spawnIndex = 0;
    for (const s of sessions) {
      const prof = s.profile;
      if (!prof) continue;
      s.lobbyId = null;
      s.matchId = matchId;
      this.setSessionMatchStatus(s, true);
      const st = this.createStagingSpawn(spawnIndex++);
      players.set(prof.playerId, {
        playerId: prof.playerId,
        squadId: s.squadId ?? null,
        session: s,
        name: prof.name,
        rp: prof.rp,
        tier: prof.tier,
        platform: prof.platform,
        characterId: s.characterId,
        customization: { ...s.customization },
        avatarId: s.avatarId,
        bannerId: s.bannerId,
        weaponSkins: { ...s.weaponSkins },
        x: st.x,
        y: st.y,
        z: st.z,
        yaw: st.yaw,
        pitch: 0,
        dropPhase: 'waiting',
        animationState: 'Idle',
        isCrouching: false,
        isSprinting: false,
        isGrounded: true,
        isAlive: true,
        health: 200,
        maxHealth: 200,
        shield: 50,
        maxShield: 100,
        activeWeaponId: 'scar',
        armorTier: 0,
        helmetTier: 0,
        backpackTier: 0,
        damageReductionPct: 0,
        kills: 0,
        damageDealt: 0,
        joinedAtMs: now,
        eliminatedAtMs: null,
        placement: null,
        recordedOutcome: false,
        lastStateMs: now,
        lastShotMs: 0,
        lastHitWindowMs: 0,
        hitsInWindow: 0,
        lastConsumableMs: 0,
        glooWallsCount: GLOO_WALL_MAX_ACTIVE_PER_PLAYER,
        lastGlooDeployMs: 0,
        disconnectedAtMs: null,
      });
    }

    const room: MatchRoom = {
      id: matchId,
      mapId,
      matchSeed,
      matchPhase: 'waiting',
      waitingDurationSec: WAITING_ARENA_DURATION_SEC,
      waitingRemainingSec: WAITING_ARENA_DURATION_SEC,
      waitingEndsAtMs: now + WAITING_ARENA_DURATION_SEC * 1000,
      flightIdx,
      flightDurationSec,
      flightProgress: 0,
      startedAtMs: now,
      finished: false,
      players,
      totalPlayers: players.size,
      collectedLootIds: new Set(),
      droppedLoot: new Map(),
      glooWalls: new Map(),
      nextDropSeq: 1,
      nextKillSeq: 1,
      nextGlooSeq: 1,
      zone: {
        phase: 1,
        totalPhases: ZONE_PHASES.length,
        state: 'waiting',
        timeRemainingSec: phase0.waitSec,
        phaseDurationSec: phase0.waitSec,
        currentCenterX: 0,
        currentCenterZ: 0,
        currentRadius: 520,
        nextCenterX: finalX * 0.35,
        nextCenterZ: finalZ * 0.35,
        nextRadius: phase0.targetRadius,
        damagePerSec: phase0.damagePerSec,
      },
      zoneStartCenterX: 0,
      zoneStartCenterZ: 0,
      zoneStartRadius: 520,
      zoneTargetCenterX: finalX * 0.35,
      zoneTargetCenterZ: finalZ * 0.35,
      zoneFinalCenterX: finalX,
      zoneFinalCenterZ: finalZ,
      stormTickAccumSec: 0,
    };

    this.matches.set(matchId, room);
    for (const mp of room.players.values()) {
      this.sendToSession(
        mp.session,
        'match:start',
        this.buildMatchStartPayload(room, mp.playerId),
      );
    }
    this.broadcastStatus();
  }

  private addSessionToWaitingMatch(s: ClientSession, room: MatchRoom): void {
    const prof = s.profile;
    if (!prof) return;
    const now = Date.now();
    s.lobbyId = null;
    s.matchId = room.id;
    this.setSessionMatchStatus(s, true);
    const st = this.createStagingSpawn(room.players.size);
    const mp: MatchPlayerState = {
      playerId: prof.playerId,
      squadId: s.squadId ?? null,
      session: s,
      name: prof.name,
      rp: prof.rp,
      tier: prof.tier,
      platform: prof.platform,
      characterId: s.characterId,
      customization: { ...s.customization },
      avatarId: s.avatarId,
      bannerId: s.bannerId,
      weaponSkins: { ...s.weaponSkins },
      x: st.x,
      y: st.y,
      z: st.z,
      yaw: st.yaw,
      pitch: 0,
      dropPhase: 'waiting',
      animationState: 'Idle',
      isCrouching: false,
      isSprinting: false,
      isGrounded: true,
      isAlive: true,
      health: 200,
      maxHealth: 200,
      shield: 50,
      maxShield: 100,
      activeWeaponId: 'scar',
      armorTier: 0,
      helmetTier: 0,
      backpackTier: 0,
      damageReductionPct: 0,
      kills: 0,
      damageDealt: 0,
      joinedAtMs: now,
      eliminatedAtMs: null,
      placement: null,
      recordedOutcome: false,
      lastStateMs: now,
      lastShotMs: 0,
      lastHitWindowMs: 0,
      hitsInWindow: 0,
      lastConsumableMs: 0,
      glooWallsCount: GLOO_WALL_MAX_ACTIVE_PER_PLAYER,
      lastGlooDeployMs: 0,
      disconnectedAtMs: null,
    };
    room.players.set(prof.playerId, mp);
    room.totalPlayers = room.players.size;

    const fullSnap = this.serializeRoomPlayers(room).find((p) => p.playerId === prof.playerId);
    this.sendToSession(s, 'match:start', this.buildMatchStartPayload(room, prof.playerId));
    if (fullSnap) {
      this.broadcastToRoom(
        room,
        'match:playerJoined',
        { player: fullSnap, totalPlayers: room.totalPlayers },
        prof.playerId,
      );
    }
    this.broadcastStatus();
  }

  private launchMatchFromLobby(lobby: LobbyRoom): void {
    this.lobbies.delete(lobby.id);
    const { selectedMap, votes } = this.resolveLobbyMap(lobby);
    const mapId: RankedMapId =
      votes.desert + votes.forest + votes.snow > 0
        ? selectedMap
        : (['desert', 'forest', 'snow'] as RankedMapId[])[
            crypto.randomInt(0, 3)
          ];
    const sessions = Array.from(lobby.participants.values()).map((p) => p.session);
    this.createWaitingMatchRoom(mapId, sessions);
  }

  private buildMatchStartPayload(room: MatchRoom, selfPlayerId: string) {
    return {
      matchId: room.id,
      selfPlayerId,
      selfSquadId: room.players.get(selfPlayerId)?.squadId ?? null,
      mapId: room.mapId,
      matchSeed: room.matchSeed,
      matchPhase: room.matchPhase,
      waitingRemainingSec: Math.max(0, Math.round(room.waitingRemainingSec * 100) / 100),
      waitingDurationSec: room.waitingDurationSec,
      flightIdx: room.flightIdx,
      flightProgress: room.flightProgress,
      totalPlayers: room.totalPlayers,
      players: this.serializeRoomPlayers(room),
      zone: { ...room.zone },
      collectedLootIds: Array.from(room.collectedLootIds),
      droppedLoot: Array.from(room.droppedLoot.values()),
      glooWalls: Array.from(room.glooWalls.values()),
      selfGlooWalls: room.players.get(selfPlayerId)?.glooWallsCount ?? 2,
    };
  }

  private serializeRoomDynamicPlayers(room: MatchRoom): RemotePlayerDeltaSnapshot[] {
    const list: RemotePlayerDeltaSnapshot[] = [];
    for (const p of room.players.values()) {
      list.push({
        playerId: p.playerId,
        squadId: p.squadId,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        yaw: Math.round(p.yaw * 1000) / 1000,
        pitch: Math.round(p.pitch * 1000) / 1000,
        dropPhase: p.dropPhase,
        animationState: p.animationState,
        isCrouching: p.isCrouching,
        isSprinting: p.isSprinting,
        isGrounded: p.isGrounded,
        isAlive: p.isAlive,
        health: p.health,
        shield: p.shield,
        activeWeaponId: p.activeWeaponId,
        armorTier: p.armorTier,
        helmetTier: p.helmetTier,
        backpackTier: p.backpackTier,
        kills: p.kills,
        damageReductionPct: p.damageReductionPct,
      });
    }
    return list;
  }

  private buildQuantizedZone(z: ServerZoneState): ServerZoneState {
    return {
      phase: z.phase,
      totalPhases: z.totalPhases,
      state: z.state,
      timeRemainingSec: Math.round(z.timeRemainingSec * 100) / 100,
      phaseDurationSec: z.phaseDurationSec,
      currentCenterX: Math.round(z.currentCenterX * 100) / 100,
      currentCenterZ: Math.round(z.currentCenterZ * 100) / 100,
      currentRadius: Math.round(z.currentRadius * 100) / 100,
      nextCenterX: Math.round(z.nextCenterX * 100) / 100,
      nextCenterZ: Math.round(z.nextCenterZ * 100) / 100,
      nextRadius: z.nextRadius,
      damagePerSec: z.damagePerSec,
    };
  }

  private serializeRoomPlayers(room: MatchRoom): RemotePlayerSnapshot[] {
    const list: RemotePlayerSnapshot[] = [];
    for (const p of room.players.values()) {
      list.push({
        playerId: p.playerId,
        squadId: p.squadId,
        name: p.name,
        rp: p.rp,
        tier: p.tier,
        platform: p.platform,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        yaw: Math.round(p.yaw * 1000) / 1000,
        pitch: Math.round(p.pitch * 1000) / 1000,
        dropPhase: p.dropPhase,
        animationState: p.animationState,
        isCrouching: p.isCrouching,
        isSprinting: p.isSprinting,
        isGrounded: p.isGrounded,
        isAlive: p.isAlive,
        health: p.health,
        maxHealth: p.maxHealth,
        shield: p.shield,
        maxShield: p.maxShield,
        activeWeaponId: p.activeWeaponId,
        armorTier: p.armorTier,
        helmetTier: p.helmetTier,
        backpackTier: p.backpackTier,
        characterId: p.characterId,
        customization: p.customization,
        avatarId: p.avatarId,
        bannerId: p.bannerId,
        weaponSkins: p.weaponSkins,
        kills: p.kills,
        damageReductionPct: p.damageReductionPct,
      });
    }
    return list;
  }

  private applyPlayerState(
    room: MatchRoom,
    mp: MatchPlayerState,
    p: PlayerStateUploadPayload,
  ): void {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return;
    }

    const now = Date.now();
    const dt = clamp((now - mp.lastStateMs) / 1000, 0.025, 0.65);
    mp.lastStateMs = now;

    const maxRange = room.matchPhase === 'waiting' ? 112 : 546;
    const nextX = clamp(p.x, -maxRange, maxRange);
    const nextZ = clamp(p.z, -maxRange, maxRange);
    const nextY = clamp(p.y, -10, 320);

    // Anti-cheat horizontal velocity validation after initial landing
    const prevPhase = mp.dropPhase;
    const nextPhase = p.dropPhase;
    if (prevPhase === 'landed' && nextPhase === 'landed') {
      const horizDist = Math.hypot(nextX - mp.x, nextZ - mp.z);
      const maxAllowed = 15.5 * dt + 4.5;
      if (horizDist <= maxAllowed) {
        mp.x = nextX;
        mp.z = nextZ;
      } else {
        const ratio = maxAllowed / horizDist;
        mp.x += (nextX - mp.x) * ratio;
        mp.z += (nextZ - mp.z) * ratio;
      }
      mp.y = nextY;
    } else {
      mp.x = nextX;
      mp.y = nextY;
      mp.z = nextZ;
    }

    // Track phase progression cleanly without allowing stale waiting uploads after airplane takeoff
    if (room.matchPhase === 'waiting') {
      mp.dropPhase = 'waiting';
    } else if (
      nextPhase === 'freefall' ||
      nextPhase === 'parachute' ||
      nextPhase === 'landed'
    ) {
      mp.dropPhase = nextPhase;
    }

    mp.yaw = Number.isFinite(p.yaw) ? p.yaw : mp.yaw;
    mp.pitch = Number.isFinite(p.pitch) ? p.pitch : mp.pitch;
    mp.animationState = p.animationState ?? mp.animationState;
    mp.isCrouching = Boolean(p.isCrouching);
    mp.isSprinting = Boolean(p.isSprinting);
    mp.isGrounded = Boolean(p.isGrounded);
    mp.activeWeaponId =
      p.activeWeaponId && RANKED_WEAPON_STATS[p.activeWeaponId]
        ? p.activeWeaponId
        : null;
    mp.armorTier = p.armorTier === 1 || p.armorTier === 2 || p.armorTier === 3 ? p.armorTier : 0;
    mp.helmetTier = p.helmetTier === 1 || p.helmetTier === 2 || p.helmetTier === 3 ? p.helmetTier : 0;
    mp.backpackTier =
      p.backpackTier === 1 || p.backpackTier === 2 || p.backpackTier === 3 ? p.backpackTier : 0;
    mp.damageReductionPct = clamp(Number(p.damageReductionPct) || 0, 0, 55);
  }

  private tickMatches(): void {
    const now = Date.now();
    const dt = clamp((now - this.lastTickMs) / 1000, 0.01, 0.25);
    this.lastTickMs = now;

    for (const room of Array.from(this.matches.values())) {
      if (room.finished) continue;

      if (room.matchPhase === 'waiting') {
        room.waitingRemainingSec = Math.max(0, (room.waitingEndsAtMs - now) / 1000);
        if (room.waitingRemainingSec <= 0) {
          if (room.players.size >= MIN_PLAYERS_PER_MATCH && this.countAliveTeams(room) >= 2) {
            this.transitionRoomToAirplane(room, now);
          } else {
            this.requeueStrandedWaitingRoom(room, now);
            continue;
          }
        } else {
          this.broadcastToRoom(room, 'match:state', {
            matchPhase: room.matchPhase,
            waitingRemainingSec: Math.round(room.waitingRemainingSec * 100) / 100,
            flightProgress: 0,
            aliveCount: room.players.size,
            totalPlayers: room.totalPlayers,
            zone: this.buildQuantizedZone(room.zone),
            players: this.serializeRoomDynamicPlayers(room),
          });
          continue;
        }
      }

      // 1. Advance airplane progress
      if (room.flightProgress < 1.12) {
        room.flightProgress += dt / room.flightDurationSec;
        if (room.flightProgress >= 0.94) {
          for (const mp of room.players.values()) {
            if (mp.isAlive && mp.dropPhase === 'airplane') {
              mp.dropPhase = 'freefall';
            }
          }
        }
      }

      // 2. Advance shrinking Safe Zone
      this.advanceZone(room, dt);

      // 3. Storm damage outside safe zone (1Hz tick)
      room.stormTickAccumSec += dt;
      if (room.stormTickAccumSec >= 1.0) {
        room.stormTickAccumSec -= 1.0;
        for (const mp of room.players.values()) {
          if (!mp.isAlive || mp.dropPhase !== 'landed') continue;
          const distFromCenter = Math.hypot(
            mp.x - room.zone.currentCenterX,
            mp.z - room.zone.currentCenterZ,
          );
          if (distFromCenter > room.zone.currentRadius) {
            const dps = room.zone.damagePerSec;
            mp.health = Math.max(0, mp.health - dps);
            if (mp.session) {
              this.sendToSession(mp.session, 'player:vitals', {
                health: mp.health,
                shield: mp.shield,
                zoneDamage: dps,
              });
            }
            if (mp.health <= 0) {
              this.eliminatePlayer(room, mp, null, 'SAFE ZONE', false, 0, 'zone');
            }
          }
        }
      }

      // 4. Prune disconnected players past 15s grace & abandoned/expired rooms
      let connectedCount = 0;
      for (const mp of room.players.values()) {
        if (mp.session) {
          connectedCount++;
        }
        if (
          mp.isAlive &&
          mp.disconnectedAtMs !== null &&
          now - mp.disconnectedAtMs > 15000
        ) {
          this.eliminatePlayer(room, mp, null, 'DISCONNECT', false, 0, 'disconnect');
        }
      }

      if (!room.finished && ((connectedCount === 0 && now - room.startedAtMs > 25000) || now - room.startedAtMs > 1800000)) {
        this.finishMatch(room);
        continue;
      }

      // 5. Broadcast authoritative world state snapshot once per room with backpressure guard
      if (!room.finished) {
        const aliveCount = this.countAlivePlayers(room);
        this.broadcastToRoom(room, 'match:state', {
          matchPhase: room.matchPhase,
          waitingRemainingSec: 0,
          flightProgress: Math.round(room.flightProgress * 10000) / 10000,
          aliveCount,
          totalPlayers: room.totalPlayers,
          zone: this.buildQuantizedZone(room.zone),
          players: this.serializeRoomDynamicPlayers(room),
        });
      }
    }
  }

  private transitionRoomToAirplane(room: MatchRoom, now: number): void {
    room.matchPhase = 'active';
    room.waitingRemainingSec = 0;
    room.startedAtMs = now;
    room.flightProgress = 0.08;
    room.totalPlayers = room.players.size;

    const flight = RANKED_FLIGHT_PATHS[room.mapId][room.flightIdx];
    const planeYaw = Math.atan2(flight.endX - flight.startX, flight.endZ - flight.startZ);

    room.glooWalls.clear();

    for (const mp of room.players.values()) {
      mp.x = flight.startX;
      mp.y = flight.altitude;
      mp.z = flight.startZ;
      mp.yaw = planeYaw;
      mp.pitch = 0;
      mp.dropPhase = 'airplane';
      mp.animationState = 'Idle';
      mp.isCrouching = false;
      mp.isSprinting = false;
      mp.isGrounded = false;
      mp.isAlive = true;
      mp.health = 200;
      mp.maxHealth = 200;
      mp.shield = 50;
      mp.kills = 0;
      mp.damageDealt = 0;
      mp.glooWallsCount = GLOO_WALL_MAX_ACTIVE_PER_PLAYER;
      mp.lastGlooDeployMs = 0;
      mp.joinedAtMs = now;
      mp.lastStateMs = now;
    }

    this.broadcastToRoom(room, 'match:dropStart', {
      matchId: room.id,
      mapId: room.mapId,
      matchSeed: room.matchSeed,
      flightIdx: room.flightIdx,
      flightProgress: room.flightProgress,
      totalPlayers: room.totalPlayers,
      players: this.serializeRoomPlayers(room),
    });
  }

  private requeueStrandedWaitingRoom(room: MatchRoom, now: number): void {
    room.finished = true;
    this.matches.delete(room.id);
    for (const mp of room.players.values()) {
      const s = mp.session;
      if (!s) continue;
      s.matchId = null;
      if (!this.queue.includes(s)) {
        s.queuedAtMs = now;
        this.queue.push(s);
      }
      this.sendToSession(s, 'match:requeued', {
        reason: 'Not enough players remained in waiting arena',
      });
      this.sendQueueUpdate(s);
    }
    this.broadcastStatus();
  }

  private advanceZone(room: MatchRoom, dt: number): void {
    const z = room.zone;
    if (z.state === 'final' && z.timeRemainingSec <= 0) {
      return;
    }

    z.timeRemainingSec = Math.max(0, z.timeRemainingSec - dt);
    const phaseCfg = ZONE_PHASES[Math.min(ZONE_PHASES.length - 1, z.phase - 1)];

    if (z.state === 'waiting') {
      if (z.timeRemainingSec <= 0) {
        z.state = 'shrinking';
        z.phaseDurationSec = phaseCfg.shrinkSec;
        z.timeRemainingSec = phaseCfg.shrinkSec;
        room.zoneStartCenterX = z.currentCenterX;
        room.zoneStartCenterZ = z.currentCenterZ;
        room.zoneStartRadius = z.currentRadius;
      }
      return;
    }

    if (z.state === 'shrinking') {
      const progress = clamp(1 - z.timeRemainingSec / Math.max(0.1, z.phaseDurationSec), 0, 1);
      z.currentCenterX =
        room.zoneStartCenterX + (room.zoneTargetCenterX - room.zoneStartCenterX) * progress;
      z.currentCenterZ =
        room.zoneStartCenterZ + (room.zoneTargetCenterZ - room.zoneStartCenterZ) * progress;
      z.currentRadius =
        room.zoneStartRadius + (phaseCfg.targetRadius - room.zoneStartRadius) * progress;

      if (z.timeRemainingSec <= 0) {
        if (z.phase >= ZONE_PHASES.length) {
          z.state = 'final';
          z.timeRemainingSec = 0;
        } else {
          z.phase += 1;
          const nextCfg = ZONE_PHASES[z.phase - 1];
          const blend = Math.min(1, z.phase / ZONE_PHASES.length);
          room.zoneTargetCenterX = room.zoneFinalCenterX * blend;
          room.zoneTargetCenterZ = room.zoneFinalCenterZ * blend;
          z.nextCenterX = room.zoneTargetCenterX;
          z.nextCenterZ = room.zoneTargetCenterZ;
          z.nextRadius = nextCfg.targetRadius;
          z.damagePerSec = nextCfg.damagePerSec;
          z.state = 'waiting';
          z.phaseDurationSec = nextCfg.waitSec;
          z.timeRemainingSec = nextCfg.waitSec;
        }
      }
    }
  }

  private getTeamKey(mp: Pick<MatchPlayerState, 'squadId' | 'playerId'>): string {
    return mp.squadId ?? mp.playerId;
  }

  private countAlivePlayers(room: MatchRoom): number {
    let alive = 0;
    for (const p of room.players.values()) {
      if (p.isAlive) alive++;
    }
    return alive;
  }

  private countAliveTeams(room: MatchRoom): number {
    const aliveTeams = new Set<string>();
    for (const p of room.players.values()) {
      if (p.isAlive) {
        aliveTeams.add(this.getTeamKey(p));
      }
    }
    return aliveTeams.size;
  }

  private hasAliveTeammate(room: MatchRoom, player: MatchPlayerState): boolean {
    const teamKey = this.getTeamKey(player);
    for (const p of room.players.values()) {
      if (p.isAlive && p.playerId !== player.playerId && this.getTeamKey(p) === teamKey) {
        return true;
      }
    }
    return false;
  }

  private finalizeMemberOutcome(
    room: MatchRoom,
    member: MatchPlayerState,
    placement: number,
    isWinner: boolean,
    winnerId: string | null,
    winnerName: string,
    now: number,
    sendResult = true,
  ): void {
    if (member.recordedOutcome) return;
    member.recordedOutcome = true;
    member.placement = placement;

    const endMs = member.eliminatedAtMs ?? now;
    const survivedSec = Math.max(1, (endMs - member.joinedAtMs) / 1000);
    void this.store
      .recordMatchOutcomeAsync({
        playerId: member.playerId,
        matchId: room.id,
        mapId: room.mapId,
        placement,
        totalPlayers: room.totalPlayers,
        kills: member.kills,
        damage: member.damageDealt,
        survivedSec,
        died: !isWinner,
      })
      .then((saved) => {
        if (sendResult && member.session && saved) {
          member.session.profile = saved.profile;
          const resPayload: RankedMatchResultPayload = {
            matchId: room.id,
            mapId: room.mapId,
            placement,
            totalPlayers: room.totalPlayers,
            kills: member.kills,
            damage: Math.round(member.damageDealt),
            survivedSec: Math.round(survivedSec),
            rpBefore: saved.rpBefore,
            rpAfter: saved.rpAfter,
            rpDelta: saved.rpDelta,
            tierBefore: saved.tierBefore,
            tierAfter: saved.tierAfter,
            winnerId,
            winnerName,
            isWinner,
          };
          this.sendToSession(member.session, 'match:result', resPayload);
        }
      })
      .catch((err) => {
        console.error(
          `[RankedMatchServer] Failed to commit match outcome (${room.id}/${member.playerId}):`,
          err instanceof Error ? err.message : String(err),
        );
      });
  }

  private eliminatePlayer(
    room: MatchRoom,
    victim: MatchPlayerState,
    killer: MatchPlayerState | null,
    weaponName: string,
    isHeadshot: boolean,
    distanceM: number,
    cause: 'weapon' | 'zone' | 'disconnect',
  ): void {
    if (!victim.isAlive || room.finished) return;

    const now = Date.now();
    victim.isAlive = false;
    victim.health = 0;
    victim.shield = 0;
    victim.animationState = 'Death';
    victim.eliminatedAtMs = now;

    if (killer && killer.playerId !== victim.playerId) {
      killer.kills += 1;
    }

    // Spawn death loot crate on the ground for surviving combatants
    if (victim.dropPhase === 'landed') {
      const crateItems: Array<{ itemId: string; ox: number; oz: number }> = [
        {
          itemId: victim.activeWeaponId ? `weapon_${victim.activeWeaponId}` : 'weapon_scar',
          ox: -0.45,
          oz: 0.25,
        },
        { itemId: 'med_kit', ox: 0.45, oz: -0.2 },
        { itemId: 'shield_battery', ox: 0.1, oz: 0.55 },
      ];
      for (const c of crateItems) {
        const lootId = `drop_${room.nextDropSeq++}`;
        const dropItem: DroppedLootSync = {
          lootId,
          itemId: c.itemId,
          x: clamp(victim.x + c.ox, -540, 540),
          y: victim.y,
          z: clamp(victim.z + c.oz, -540, 540),
          quantity: 1,
        };
        room.droppedLoot.set(lootId, dropItem);
        this.broadcastToRoom(room, 'loot:dropped', dropItem);
      }
    }

    const killEntry: KillFeedEntry = {
      id: `kf_${room.nextKillSeq++}`,
      killerId: killer?.playerId ?? null,
      killerName: killer ? killer.name : weaponName,
      victimId: victim.playerId,
      victimName: victim.name,
      weaponName,
      isHeadshot,
      distanceM,
      cause,
      timestamp: now,
    };

    const aliveAfter = this.countAlivePlayers(room);
    const aliveTeamsAfter = this.countAliveTeams(room);
    const teammateStillAlive = this.hasAliveTeammate(room, victim);
    const teamPlacement = teammateStillAlive ? null : aliveTeamsAfter + 1;
    victim.placement = teamPlacement;

    this.broadcastToRoom(room, 'match:elimination', {
      kill: killEntry,
      victimId: victim.playerId,
      killerId: killer?.playerId ?? null,
      killerKills: killer?.kills ?? 0,
      aliveCount: aliveAfter,
      placement: teamPlacement,
    });

    if (!teammateStillAlive) {
      const victimTeamKey = this.getTeamKey(victim);
      const aliveWinner = aliveTeamsAfter <= 1 ? this.findFirstAlive(room) : null;
      for (const member of room.players.values()) {
        if (this.getTeamKey(member) === victimTeamKey) {
          this.finalizeMemberOutcome(
            room,
            member,
            aliveTeamsAfter + 1,
            false,
            aliveWinner?.playerId ?? null,
            aliveWinner?.name ?? 'IN PROGRESS',
            now,
          );
        }
      }
    }

    if (aliveTeamsAfter <= 1) {
      this.finishMatch(room);
    }
  }

  private findFirstAlive(room: MatchRoom): MatchPlayerState | null {
    for (const p of room.players.values()) {
      if (p.isAlive) return p;
    }
    return null;
  }

  private finishMatch(room: MatchRoom): void {
    if (room.finished) return;
    room.finished = true;

    const now = Date.now();
    const winner = this.findFirstAlive(room);
    const winnerTeamKey = winner ? this.getTeamKey(winner) : null;

    if (winner && winnerTeamKey) {
      for (const member of room.players.values()) {
        if (this.getTeamKey(member) === winnerTeamKey && !member.recordedOutcome) {
          this.finalizeMemberOutcome(
            room,
            member,
            1,
            true,
            winner.playerId,
            winner.name,
            now,
          );
        }
      }
    }

    // Safety sweep for any unrecorded remaining players (e.g. server timeout/abandon)
    for (const member of room.players.values()) {
      if (!member.recordedOutcome) {
        this.finalizeMemberOutcome(
          room,
          member,
          member.isAlive ? 2 : 3,
          false,
          winner?.playerId ?? null,
          winner?.name ?? 'DRAW',
          now,
        );
      }
    }

    for (const p of room.players.values()) {
      if (p.session) {
        this.sendToSession(p.session, 'match:finished', {
          matchId: room.id,
          winnerId: winner?.playerId ?? null,
          winnerName: winner?.name ?? 'DRAW',
        });
        p.session.matchId = null;
        this.setSessionMatchStatus(p.session, false);
      }
    }
    this.broadcastFriendsToAllLobbySessions();

    const timer = setTimeout(() => {
      this.cleanupTimers.delete(timer);
      this.matches.delete(room.id);
      this.broadcastStatus();
    }, 3000);
    this.cleanupTimers.add(timer);
  }

  // ---- Squad & Friends System ----

  private ensureSessionSquad(session: ClientSession, defaultMaxSize: SquadSize = 4): ServerSquadRoom | null {
    if (!session.playerId || !session.profile) return null;
    if (session.squadId) {
      const existing = this.squads.get(session.squadId);
      if (existing) return existing;
      session.squadId = null;
    }
    const squadId = `sq_${crypto.randomBytes(6).toString('hex')}`;
    const members = new Map<string, ServerSquadMember>();
    const initialStatus: SquadMemberStatus =
      session.matchId || session.inExternalMatch ? 'in-match' : 'not-ready';
    members.set(session.playerId, {
      playerId: session.playerId,
      name: session.profile.name,
      tier: session.profile.tier,
      rp: session.profile.rp,
      characterId: session.characterId,
      customization: { ...session.customization },
      avatarId: session.avatarId,
      bannerId: session.bannerId,
      isLeader: true,
      ready: false,
      status: initialStatus,
      isBotAlly: false,
      session,
    });
    const squad: ServerSquadRoom = {
      id: squadId,
      maxSize: defaultMaxSize,
      leaderId: session.playerId,
      members,
      pendingInviteIds: new Set(),
      createdAtMs: Date.now(),
    };
    this.squads.set(squadId, squad);
    session.squadId = squadId;
    return squad;
  }

  private clearSquadAllyTimers(squadId: string): void {
    const prefix = `${squadId}:`;
    for (const [key, timer] of this.allyTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.allyTimers.delete(key);
      }
    }
  }

  private setSessionMatchStatus(session: ClientSession, inMatch: boolean): void {
    session.inExternalMatch = inMatch;
    if (!session.playerId || !session.squadId) {
      this.broadcastFriendsToAllLobbySessions();
      return;
    }
    const squad = this.squads.get(session.squadId);
    const member = squad?.members.get(session.playerId);
    if (squad && member) {
      if (inMatch) {
        member.status = 'in-match';
        member.ready = false;
      } else if (member.status === 'in-match') {
        member.status = 'not-ready';
        member.ready = false;
      }
      this.broadcastSquadState(squad);
    }
    this.broadcastFriendsToAllLobbySessions();
  }

  private buildSquadSnapshot(squad: ServerSquadRoom, forPlayerId?: string): SquadStateSnapshot {
    const members: SquadMemberInfo[] = [];
    for (const m of squad.members.values()) {
      const liveProf = m.session?.profile;
      const effectiveStatus: SquadMemberStatus =
        m.session && (m.session.matchId || m.session.inExternalMatch)
          ? 'in-match'
          : m.status;
      members.push({
        playerId: m.playerId,
        numericId: liveProf?.numericId,
        name: liveProf?.name ?? m.name,
        tier: liveProf?.tier ?? m.tier,
        rp: liveProf?.rp ?? m.rp,
        level: liveProf?.level,
        gender: liveProf?.gender ?? null,
        characterId: m.characterId,
        customization: { ...m.customization },
        avatarId: m.session?.avatarId ?? m.avatarId,
        bannerId: m.session?.bannerId ?? m.bannerId,
        isLeader: m.isLeader,
        ready: effectiveStatus === 'ready',
        status: effectiveStatus,
        isSelf: forPlayerId ? m.playerId === forPlayerId : undefined,
        isBotAlly: m.isBotAlly,
      });
    }
    return {
      squadId: squad.id,
      maxSize: squad.maxSize,
      leaderId: squad.leaderId,
      members,
      pendingInviteIds: Array.from(squad.pendingInviteIds),
    };
  }

  private buildSoloSquadSnapshot(session: ClientSession): SquadStateSnapshot {
    if (!session.playerId || !session.profile) {
      return {
        squadId: null,
        maxSize: 1,
        leaderId: '',
        members: [],
        pendingInviteIds: [],
      };
    }
    const inMatch = Boolean(session.matchId || session.inExternalMatch);
    return {
      squadId: null,
      maxSize: 1,
      leaderId: session.playerId,
      members: [
        {
          playerId: session.playerId,
          numericId: session.profile.numericId,
          name: session.profile.name,
          tier: session.profile.tier,
          rp: session.profile.rp,
          level: session.profile.level,
          gender: session.profile.gender ?? null,
          characterId: session.characterId,
          customization: { ...session.customization },
          avatarId: session.avatarId,
          bannerId: session.bannerId,
          isLeader: true,
          ready: !inMatch,
          status: inMatch ? 'in-match' : 'ready',
          isSelf: true,
          isBotAlly: false,
        },
      ],
      pendingInviteIds: [],
    };
  }

  syncSessionFromStore(playerId: string): void {
    const updated = this.store.getProfile(playerId);
    if (!updated) return;
    for (const s of this.sessions) {
      if (s.playerId !== playerId) continue;
      s.profile = updated;
      if (updated.vault) {
        if (isValidAvatarId(updated.vault.equippedAvatarId)) {
          s.avatarId = updated.vault.equippedAvatarId;
        }
        if (isValidBannerId(updated.vault.equippedBannerId)) {
          s.bannerId = updated.vault.equippedBannerId;
        }
      }
      if (s.squadId) {
        const squad = this.squads.get(s.squadId);
        const member = squad?.members.get(playerId);
        if (squad && member) {
          member.name = updated.name;
          member.tier = updated.tier;
          member.rp = updated.rp;
          member.avatarId = s.avatarId;
          member.bannerId = s.bannerId;
          this.broadcastSquadState(squad);
        }
      }
      this.broadcastFriendsToAllLobbySessions();
    }
  }

  private sendSquadStateToSession(session: ClientSession): void {
    if (!session.playerId) return;
    const squad = session.squadId ? this.squads.get(session.squadId) : undefined;
    const snapshot = squad
      ? this.buildSquadSnapshot(squad, session.playerId)
      : this.buildSoloSquadSnapshot(session);
    this.sendToSession(session, 'squad:state', snapshot);
  }

  private broadcastSquadState(squad: ServerSquadRoom): void {
    for (const m of squad.members.values()) {
      if (m.session) {
        this.sendToSession(
          m.session,
          'squad:state',
          this.buildSquadSnapshot(squad, m.playerId),
        );
      }
    }
  }

  private buildFriendsListForSession(session: ClientSession): SquadFriendEntry[] {
    if (!session.playerId) return [];
    const friendIds = this.store.getFriendIds(session.playerId);
    if (friendIds.length === 0) return [];

    const currentSquad = session.squadId ? this.squads.get(session.squadId) : undefined;
    const pendingSet = currentSquad?.pendingInviteIds ?? new Set<string>();
    const activeByPlayerId = new Map<string, ClientSession>();
    for (const other of this.sessions) {
      if (other !== session && other.playerId && other.profile) {
        activeByPlayerId.set(other.playerId, other);
      }
    }

    const list: SquadFriendEntry[] = [];
    for (const friendId of friendIds) {
      const other = activeByPlayerId.get(friendId);
      if (other && other.profile) {
        const inSameSquad = Boolean(currentSquad?.members.has(friendId));
        let status: SquadFriendEntry['status'] = 'online';
        if (inSameSquad) {
          status = 'in-squad';
        } else if (other.matchId || other.inExternalMatch) {
          status = 'in-match';
        } else if (other.squadId) {
          const otherSq = this.squads.get(other.squadId);
          if (otherSq && otherSq.members.size > 1) {
            status = 'in-squad';
          }
        }

        list.push({
          playerId: friendId,
          numericId: other.profile.numericId,
          name: other.profile.name,
          tier: other.profile.tier,
          rp: other.profile.rp,
          level: other.profile.level,
          gender: other.profile.gender ?? null,
          avatarId: other.avatarId,
          characterId: other.characterId,
          customization: { ...other.customization },
          status,
          isBotAlly: false,
          invited: pendingSet.has(friendId),
        });
      } else {
        const prof = this.store.getProfile(friendId, true);
        if (!prof) continue;
        list.push({
          playerId: prof.playerId,
          numericId: prof.numericId,
          name: prof.name,
          tier: prof.tier,
          rp: prof.rp,
          level: prof.level,
          gender: prof.gender ?? null,
          avatarId: prof.equippedAvatarId ?? DEFAULT_AVATAR_ID,
          characterId: prof.avatarCharacterId ?? 'char-01',
          customization: { ...DEFAULT_CUSTOMIZATION },
          status: 'offline',
          isBotAlly: false,
          invited: false,
        });
      }
    }

    list.sort((a, b) => {
      const aOnline = a.status === 'offline' ? 1 : 0;
      const bOnline = b.status === 'offline' ? 1 : 0;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.name.localeCompare(b.name);
    });

    return list;
  }

  private sendFriendsListToSession(session: ClientSession): void {
    if (!session.playerId) return;
    this.sendToSession(session, 'friends:list', {
      friends: this.buildFriendsListForSession(session),
    });
  }

  private sendFriendRequestsToSession(session: ClientSession): void {
    if (!session.playerId) return;
    this.sendToSession(session, 'friends:requests', {
      requests: this.store.getIncomingFriendRequests(session.playerId),
      outgoingTargetIds: this.store.getOutgoingFriendRequestTargetIds(session.playerId),
      outgoingRequests: this.store.getOutgoingFriendRequests(session.playerId),
    });
  }

  private broadcastFriendsToAllLobbySessions(): void {
    for (const s of this.sessions) {
      if (s.playerId && s.profile && !s.matchId) {
        this.sendFriendsListToSession(s);
      }
    }
  }

  getFriendsSnapshotForPlayer(playerId: string): {
    friends: SquadFriendEntry[];
    incomingRequests: FriendRequestEntry[];
    outgoingTargetIds: string[];
    outgoingRequests: OutgoingFriendRequestEntry[];
  } {
    let sessionForPlayer: ClientSession | null = null;
    for (const s of this.sessions) {
      if (s.playerId === playerId && s.profile) {
        sessionForPlayer = s;
        break;
      }
    }
    const friends = sessionForPlayer
      ? this.buildFriendsListForSession(sessionForPlayer)
      : this.buildFriendsListForPlayerId(playerId);
    return {
      friends,
      incomingRequests: this.store.getIncomingFriendRequests(playerId),
      outgoingTargetIds: this.store.getOutgoingFriendRequestTargetIds(playerId),
      outgoingRequests: this.store.getOutgoingFriendRequests(playerId),
    };
  }

  private buildFriendsListForPlayerId(playerId: string): SquadFriendEntry[] {
    const friendIds = this.store.getFriendIds(playerId);
    if (friendIds.length === 0) return [];
    const activeByPlayerId = new Map<string, ClientSession>();
    for (const other of this.sessions) {
      if (other.playerId && other.playerId !== playerId && other.profile) {
        activeByPlayerId.set(other.playerId, other);
      }
    }
    const list: SquadFriendEntry[] = [];
    for (const friendId of friendIds) {
      const other = activeByPlayerId.get(friendId);
      if (other && other.profile) {
        let status: SquadFriendEntry['status'] = 'online';
        if (other.matchId) {
          status = 'in-match';
        } else if (other.squadId) {
          const otherSq = this.squads.get(other.squadId);
          if (otherSq && otherSq.members.size > 1) {
            status = 'in-squad';
          }
        }
        list.push({
          playerId: friendId,
          numericId: other.profile.numericId,
          name: other.profile.name,
          tier: other.profile.tier,
          rp: other.profile.rp,
          level: other.profile.level,
          gender: other.profile.gender ?? null,
          avatarId: other.avatarId,
          characterId: other.characterId,
          customization: { ...other.customization },
          status,
          isBotAlly: false,
          invited: false,
        });
      } else {
        const prof = this.store.getProfile(friendId, true);
        if (!prof) continue;
        list.push({
          playerId: prof.playerId,
          numericId: prof.numericId,
          name: prof.name,
          tier: prof.tier,
          rp: prof.rp,
          level: prof.level,
          gender: prof.gender ?? null,
          avatarId: prof.equippedAvatarId ?? DEFAULT_AVATAR_ID,
          characterId: prof.avatarCharacterId ?? 'char-01',
          customization: { ...DEFAULT_CUSTOMIZATION },
          status: 'offline',
          isBotAlly: false,
          invited: false,
        });
      }
    }
    list.sort((a, b) => {
      const aOnline = a.status === 'offline' ? 1 : 0;
      const bOnline = b.status === 'offline' ? 1 : 0;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  pushFriendsSyncToPlayer(playerId: string): void {
    for (const s of this.sessions) {
      if (s.playerId === playerId && s.profile) {
        this.sendFriendsListToSession(s);
        this.sendFriendRequestsToSession(s);
      }
    }
  }

  notifyFriendRequestReceived(toPlayerId: string, request: FriendRequestEntry): void {
    for (const s of this.sessions) {
      if (s.playerId === toPlayerId && s.profile) {
        this.sendToSession(s, 'friends:requestReceived', { request });
        this.sendFriendRequestsToSession(s);
      }
    }
  }

  notifyFriendRequestResponded(
    fromPlayerId: string,
    payload: { requestId: string; accepted: boolean; byPlayerId: string; byName: string },
  ): void {
    for (const s of this.sessions) {
      if (s.playerId === fromPlayerId && s.profile) {
        this.sendToSession(s, 'friends:requestResponded', payload);
        this.sendFriendsListToSession(s);
        this.sendFriendRequestsToSession(s);
      }
    }
  }

  notifyMailboxUpdated(targetPlayerIds: string[] | 'all'): void {
    const targetSet = targetPlayerIds === 'all' ? null : new Set(targetPlayerIds);
    for (const s of this.sessions) {
      if (!s.playerId || !s.profile) continue;
      if (targetSet && !targetSet.has(s.playerId)) continue;
      this.sendToSession(s, 'mailbox:updated', {
        mailbox: this.store.buildMailboxSnapshotForPlayer(s.playerId, true),
      });
    }
  }

  private async checkFirestoreFriendship(session: ClientSession, friendPlayerId: string): Promise<boolean> {
    if (!this.firebaseProjectId) return false;
    if (session.firebaseTokenVerifyPromise) {
      await session.firebaseTokenVerifyPromise;
    }
    const callerUid =
      session.firebaseUid ??
      (session.playerId ? this.store.getFirebaseUidByPlayerId(session.playerId) : null);
    const friendUid = this.store.getFirebaseUidByPlayerId(friendPlayerId);
    if (!callerUid || !friendUid || !session.firebaseIdToken) {
      return false;
    }
    const pairId = callerUid < friendUid ? `${callerUid}_${friendUid}` : `${friendUid}_${callerUid}`;
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.firebaseProjectId)}/databases/${encodeURIComponent(this.firestoreDatabaseId)}/documents/friendships/${encodeURIComponent(pairId)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.firebaseIdToken}`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private handleSquadCreate(session: ClientSession, maxSize: SquadSize = 4): void {
    if (!session.playerId || !session.profile) return;
    if (session.matchId || session.inExternalMatch) {
      this.sendToSession(session, 'server:error', {
        message: 'Cannot create a party while in a match',
      });
      return;
    }
    const cappedSize: SquadSize = maxSize === 2 ? 2 : 4;
    if (session.squadId) {
      this.removeFromSquad(session, false);
    }
    const squad = this.ensureSessionSquad(session, cappedSize);
    if (!squad) return;
    squad.maxSize = cappedSize;
    this.broadcastSquadState(squad);
    this.broadcastFriendsToAllLobbySessions();
  }

  private handleSquadSetSize(session: ClientSession, maxSize: SquadSize): void {
    if (!session.playerId || !session.profile) return;

    if (maxSize === 1) {
      if (session.squadId) {
        this.removeFromSquad(session, false);
      }
      this.sendSquadStateToSession(session);
      this.broadcastFriendsToAllLobbySessions();
      return;
    }

    const current = session.squadId ? this.squads.get(session.squadId) : undefined;
    if (current) {
      if (current.leaderId !== session.playerId) {
        this.sendToSession(session, 'server:error', {
          message: 'Only the party leader can change party size',
        });
        return;
      }
      if (current.members.size > maxSize) {
        this.sendToSession(session, 'server:error', {
          message: 'Remove members before shrinking party size',
        });
        this.sendSquadStateToSession(session);
        return;
      }
      current.maxSize = maxSize;
      this.broadcastSquadState(current);
      this.broadcastFriendsToAllLobbySessions();
      return;
    }

    const squad = this.ensureSessionSquad(session, maxSize);
    if (!squad) return;
    squad.maxSize = maxSize;
    this.broadcastSquadState(squad);
    this.broadcastFriendsToAllLobbySessions();
  }

  private handleSquadSetReady(session: ClientSession, ready: boolean): void {
    if (!session.playerId || !session.profile) return;
    if (session.matchId || session.inExternalMatch) {
      this.sendToSession(session, 'server:error', {
        message: 'Cannot change ready status while in a match',
      });
      return;
    }
    const squad = session.squadId ? this.squads.get(session.squadId) : undefined;
    if (!squad) {
      this.sendSquadStateToSession(session);
      return;
    }
    const member = squad.members.get(session.playerId);
    if (!member) return;
    member.ready = ready;
    member.status = ready ? 'ready' : 'not-ready';
    if (!ready) {
      this.clearSquadFromQueue(squad);
    }
    this.broadcastSquadState(squad);
  }

  private handleSquadTransferLeader(session: ClientSession, targetPlayerId: string): void {
    if (!session.playerId || !session.profile || !session.squadId) return;
    const squad = this.squads.get(session.squadId);
    if (!squad) return;
    if (squad.leaderId !== session.playerId) {
      this.sendToSession(session, 'server:error', {
        message: 'Only the party leader can transfer leadership',
      });
      return;
    }
    if (targetPlayerId === session.playerId) return;
    const targetMember = squad.members.get(targetPlayerId);
    if (!targetMember || targetMember.isBotAlly || !targetMember.session) {
      this.sendToSession(session, 'server:error', {
        message: 'Selected member is not available in the party',
      });
      return;
    }
    squad.leaderId = targetMember.playerId;
    for (const m of squad.members.values()) {
      m.isLeader = m.playerId === targetMember.playerId;
    }
    this.clearSquadFromQueue(squad);
    this.broadcastSquadState(squad);
    for (const m of squad.members.values()) {
      if (m.session) {
        this.sendToSession(m.session, 'squad:leaderTransferred', {
          newLeaderId: targetMember.playerId,
          newLeaderName: targetMember.name,
          previousLeaderName: session.profile.name,
          reason: 'transferred',
        });
      }
    }
    this.broadcastFriendsToAllLobbySessions();
  }

  private handleSquadStartBattleRoyale(session: ClientSession, config: unknown): void {
    if (!session.playerId || !session.profile || !session.squadId) return;
    const squad = this.squads.get(session.squadId);
    if (!squad) return;
    if (squad.leaderId !== session.playerId) {
      this.sendToSession(session, 'server:error', {
        message: 'Only the party leader can start matchmaking',
      });
      return;
    }
    const humanMembers = Array.from(squad.members.values()).filter(
      (m) => !m.isBotAlly && m.session && m.session.playerId && m.session.profile,
    );
    if (
      humanMembers.some((m) =>
        Boolean(
          m.status === 'in-match' ||
            m.session?.matchId ||
            m.session?.lobbyId ||
            m.session?.inExternalMatch,
        ),
      )
    ) {
      this.sendToSession(session, 'server:error', {
        message: 'A squadmate is currently in another match',
      });
      return;
    }
    if (humanMembers.some((m) => m.status !== 'ready')) {
      this.sendToSession(session, 'server:error', {
        message: 'All party members must be READY before starting matchmaking',
      });
      return;
    }

    for (const m of humanMembers) {
      if (m.session) {
        m.session.inExternalMatch = true;
      }
      m.status = 'in-match';
      m.ready = false;
    }
    this.broadcastSquadState(squad);
    this.broadcastFriendsToAllLobbySessions();

    for (const m of humanMembers) {
      if (m.session) {
        this.sendToSession(m.session, 'squad:brMatchLaunch', {
          leaderId: squad.leaderId,
          config: config && typeof config === 'object' ? config : {},
        });
      }
    }
  }

  private async handleSquadInvite(session: ClientSession, friendId: string): Promise<void> {
    if (!session.playerId || !session.profile) return;
    if (friendId === session.playerId) return;

    const existingSquad = session.squadId ? this.squads.get(session.squadId) : undefined;
    if (existingSquad && existingSquad.leaderId !== session.playerId) {
      this.sendToSession(session, 'server:error', {
        message: 'Only the party leader can invite friends',
      });
      return;
    }

    const isFriend =
      this.store.areFriends(session.playerId, friendId) ||
      (await this.checkFirestoreFriendship(session, friendId));
    if (!isFriend) {
      this.sendToSession(session, 'server:error', {
        message: 'You can only invite friends to your squad',
      });
      this.sendFriendsListToSession(session);
      return;
    }

    let squad = session.squadId ? this.squads.get(session.squadId) : undefined;
    if (!squad) {
      squad = this.ensureSessionSquad(session, 4) ?? undefined;
    }
    if (!squad) return;

    if (squad.leaderId !== session.playerId) {
      this.sendToSession(session, 'server:error', {
        message: 'Only the party leader can invite friends',
      });
      return;
    }

    if (squad.maxSize === 1) {
      squad.maxSize = 4;
    }
    if (squad.members.size >= squad.maxSize || squad.members.size >= 4) {
      this.sendToSession(session, 'server:error', { message: 'Squad is already full' });
      this.sendSquadStateToSession(session);
      return;
    }
    if (squad.members.has(friendId)) {
      this.sendToSession(session, 'server:error', { message: 'Player is already in your party' });
      return;
    }
    if (squad.pendingInviteIds.has(friendId)) {
      this.sendToSession(session, 'server:error', { message: 'Invitation already sent to this friend' });
      return;
    }

    // Check if target is a live authenticated player
    let targetSession: ClientSession | null = null;
    for (const s of this.sessions) {
      if (s.playerId === friendId) {
        targetSession = s;
        break;
      }
    }

    if (targetSession && targetSession.profile) {
      if (targetSession.matchId || targetSession.lobbyId || targetSession.inExternalMatch) {
        this.sendToSession(session, 'server:error', { message: 'Player is currently in a match' });
        return;
      }
      squad.pendingInviteIds.add(friendId);
      const inviteId = `inv_${crypto.randomBytes(6).toString('hex')}`;
      const invite: ServerSquadInvite = {
        inviteId,
        squadId: squad.id,
        fromPlayerId: session.playerId,
        fromName: session.profile.name,
        fromTier: session.profile.tier,
        targetPlayerId: friendId,
        maxSize: squad.maxSize,
        createdAtMs: Date.now(),
      };
      this.squadInvites.set(inviteId, invite);

      const notif: SquadInviteNotification = {
        inviteId,
        squadId: squad.id,
        fromPlayerId: session.playerId,
        fromNumericId: session.profile.numericId,
        fromName: session.profile.name,
        fromTier: session.profile.tier,
        fromLevel: session.profile.level,
        fromAvatarId: session.avatarId,
        maxSize: squad.maxSize,
        memberCount: squad.members.size,
      };
      this.sendToSession(targetSession, 'squad:inviteReceived', notif);
      this.broadcastSquadState(squad);
      this.sendFriendsListToSession(session);
      return;
    }

    this.sendToSession(session, 'server:error', { message: 'Friend is currently offline' });
    this.sendFriendsListToSession(session);
  }

  private handleSquadInviteRespond(session: ClientSession, inviteId: string, accept: boolean): void {
    if (!session.playerId || !session.profile) return;
    const invite = this.squadInvites.get(inviteId);
    if (!invite || invite.targetPlayerId !== session.playerId) return;
    this.squadInvites.delete(inviteId);

    const squad = this.squads.get(invite.squadId);
    if (!squad) {
      if (accept) {
        this.sendToSession(session, 'server:error', { message: 'Squad is no longer active' });
      }
      return;
    }

    squad.pendingInviteIds.delete(session.playerId);

    if (!accept) {
      const leaderMember = squad.members.get(squad.leaderId);
      if (leaderMember?.session) {
        this.sendToSession(leaderMember.session, 'squad:inviteDeclined', {
          playerId: session.playerId,
          name: session.profile.name,
        });
      }
      this.broadcastSquadState(squad);
      this.broadcastFriendsToAllLobbySessions();
      return;
    }

    if (session.matchId || session.inExternalMatch) {
      this.sendToSession(session, 'server:error', { message: 'Cannot join a party while in a match' });
      return;
    }

    if (squad.members.size >= squad.maxSize || squad.members.size >= 4) {
      this.sendToSession(session, 'server:error', { message: 'Squad is already full' });
      this.broadcastSquadState(squad);
      return;
    }

    if (session.squadId && session.squadId !== squad.id) {
      this.removeFromSquad(session, false);
    }

    session.squadId = squad.id;
    squad.members.set(session.playerId, {
      playerId: session.playerId,
      name: session.profile.name,
      tier: session.profile.tier,
      rp: session.profile.rp,
      characterId: session.characterId,
      customization: { ...session.customization },
      avatarId: session.avatarId,
      bannerId: session.bannerId,
      isLeader: false,
      ready: false,
      status: 'not-ready',
      isBotAlly: false,
      session,
    });

    this.clearSquadFromQueue(squad);
    this.broadcastSquadState(squad);
    this.broadcastFriendsToAllLobbySessions();
  }

  private handleSquadKick(session: ClientSession, targetPlayerId: string): void {
    if (!session.playerId || !session.profile || !session.squadId) return;
    const squad = this.squads.get(session.squadId);
    if (!squad || squad.leaderId !== session.playerId) return;
    if (targetPlayerId === session.playerId) return;

    const targetMember = squad.members.get(targetPlayerId);
    if (!targetMember) return;

    this.clearSquadFromQueue(squad);
    squad.members.delete(targetPlayerId);
    if (targetMember.session) {
      targetMember.session.squadId = null;
      this.sendToSession(targetMember.session, 'squad:kicked', {
        byPlayerId: session.playerId,
        byName: session.profile.name,
      });
      this.sendSquadStateToSession(targetMember.session);
    }

    this.broadcastSquadState(squad);
    this.broadcastFriendsToAllLobbySessions();
  }

  private removeFromSquad(session: ClientSession, fromDisconnect = false): void {
    if (!session.playerId) return;

    // Clean any pending invites targeting this player
    for (const [invId, inv] of this.squadInvites.entries()) {
      if (inv.targetPlayerId === session.playerId) {
        this.squadInvites.delete(invId);
        const targetSq = this.squads.get(inv.squadId);
        targetSq?.pendingInviteIds.delete(session.playerId);
      }
    }

    if (!session.squadId) return;
    const squad = this.squads.get(session.squadId);
    if (squad) {
      this.clearSquadFromQueue(squad);
    }
    session.squadId = null;
    if (!squad) return;

    const wasLeader = squad.leaderId === session.playerId;
    const previousLeaderName = squad.members.get(session.playerId)?.name ?? session.profile?.name ?? 'Leader';
    squad.members.delete(session.playerId);

    // Check if any live human sessions remain in the squad
    let nextLiveLeader: ServerSquadMember | null = null;
    for (const m of squad.members.values()) {
      if (!m.isBotAlly && m.session) {
        nextLiveLeader = m;
        break;
      }
    }

    if (!nextLiveLeader) {
      // No human members remain — dissolve squad and clear its invites & ally timers
      this.clearSquadAllyTimers(squad.id);
      for (const [invId, inv] of this.squadInvites.entries()) {
        if (inv.squadId === squad.id) {
          this.squadInvites.delete(invId);
        }
      }
      this.squads.delete(squad.id);
      return;
    }

    if (wasLeader) {
      squad.leaderId = nextLiveLeader.playerId;
      for (const m of squad.members.values()) {
        m.isLeader = m.playerId === nextLiveLeader.playerId;
      }
    }

    this.broadcastSquadState(squad);
    if (wasLeader) {
      for (const m of squad.members.values()) {
        if (m.session) {
          this.sendToSession(m.session, 'squad:leaderTransferred', {
            newLeaderId: nextLiveLeader.playerId,
            newLeaderName: nextLiveLeader.name,
            previousLeaderName,
            reason: fromDisconnect ? 'disconnected' : 'left',
          });
        }
      }
    }
  }

  dispose(): void {
    clearInterval(this.matchmakingTimer);
    clearInterval(this.matchTickTimer);
    clearInterval(this.heartbeatTimer);
    for (const t of this.allyTimers.values()) {
      clearTimeout(t);
    }
    this.allyTimers.clear();
    for (const t of this.cleanupTimers) {
      clearTimeout(t);
    }
    this.cleanupTimers.clear();
    this.wss.close();
  }
}
