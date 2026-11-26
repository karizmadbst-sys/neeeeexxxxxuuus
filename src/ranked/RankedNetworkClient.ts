import { getWebSocketUrl } from '../config/RuntimeConfig';
import type { INetworkClient, NetPacket, NetworkConnectionState } from '../multiplayer/INetworkClient';
import type {
  AuthMessagePayload,
  CombatHitClaimPayload,
  CombatShotPayload,
  GlooWallDamagePayload,
  GlooWallDeployPayload,
  LootCollectClaimPayload,
  LootDropReportPayload,
  PlayerStateUploadPayload,
  QueueJoinPayload,
  RankedCustomizationPayload,
  RankedMapId,
  SquadSize,
} from './RankedTypes';

export class RankedNetworkClient implements INetworkClient {
  private _state: NetworkConnectionState = 'disconnected';
  private ws: WebSocket | null = null;
  private seq = 1;
  private pingTimer = 0;
  private rttMs = 0;
  private readonly handlers = new Set<(packet: NetPacket) => void>();
  private readonly stateListeners = new Set<(state: NetworkConnectionState) => void>();

  get state(): NetworkConnectionState {
    return this._state;
  }

  getRttMs(): number {
    return this.rttMs;
  }

  onStateChange(cb: (state: NetworkConnectionState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private setState(next: NetworkConnectionState): void {
    if (this._state === next) return;
    this._state = next;
    for (const cb of this.stateListeners) {
      cb(next);
    }
  }

  static getDefaultEndpointUrl(): string {
    return getWebSocketUrl('/ws/ranked');
  }

  async connect(
    endpointUrl = RankedNetworkClient.getDefaultEndpointUrl(),
    _token = '',
  ): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setState('connecting');

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(endpointUrl);
      this.ws = socket;
      let settled = false;

      socket.onopen = () => {
        settled = true;
        this.setState('connected');
        this.startPingLoop();
        resolve();
      };

      socket.onmessage = (ev) => {
        try {
          const pkt = JSON.parse(String(ev.data)) as NetPacket;
          if (!pkt || typeof pkt.type !== 'string') return;
          if (pkt.type === 'pong') {
            const ct = (pkt.payload as { clientTime?: number })?.clientTime;
            if (typeof ct === 'number') {
              this.rttMs = Math.max(1, Date.now() - ct);
            }
          }
          for (const h of this.handlers) {
            h(pkt);
          }
        } catch {
          // Ignore malformed packet
        }
      };

      socket.onerror = () => {
        this.setState('error');
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed'));
        }
      };

      socket.onclose = () => {
        this.stopPingLoop();
        this.ws = null;
        if (this._state !== 'error') {
          this.setState('disconnected');
        }
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before opening'));
        }
      };
    });
  }

  disconnect(): void {
    this.stopPingLoop();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
    this.setState('disconnected');
  }

  send<TPayload>(type: string, payload: TPayload): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type,
        seq: this.seq++,
        serverTimeMs: Date.now(),
        payload,
      }),
    );
  }

  onPacket(handler: (packet: NetPacket) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Typed convenience helpers
  sendAuthHello(payload: AuthMessagePayload): void {
    this.send('auth:hello', payload);
  }

  joinQueue(payload: QueueJoinPayload): void {
    this.send('queue:join', payload);
  }

  leaveQueue(): void {
    this.send('queue:leave', {});
  }

  setLobbyReady(ready: boolean): void {
    this.send('lobby:ready', { ready });
  }

  voteLobbyMap(mapId: RankedMapId): void {
    this.send('lobby:voteMap', { mapId });
  }

  leaveLobby(): void {
    this.send('lobby:leave', {});
  }

  sendPlayerState(payload: PlayerStateUploadPayload): void {
    this.send('player:state', payload);
  }

  sendJump(): void {
    this.send('match:jump', {});
  }

  sendDeployChute(): void {
    this.send('match:deployChute', {});
  }

  sendShot(payload: CombatShotPayload): void {
    this.send('combat:shot', payload);
  }

  sendHitClaim(payload: CombatHitClaimPayload): void {
    this.send('combat:hitClaim', payload);
  }

  sendLootCollect(payload: LootCollectClaimPayload): void {
    this.send('loot:collect', payload);
  }

  sendLootDrop(payload: LootDropReportPayload): void {
    this.send('loot:drop', payload);
  }

  sendUseConsumable(itemId: string): void {
    this.send('player:useConsumable', { itemId });
  }

  sendGlooDeploy(payload: GlooWallDeployPayload): void {
    this.send('gloo:deploy', payload);
  }

  sendGlooDamage(payload: GlooWallDamagePayload): void {
    this.send('gloo:damage', payload);
  }

  sendLeaveMatch(): void {
    this.send('match:leave', {});
  }

  // Squad & Friends Lobby Helpers
  updateFirebaseToken(firebaseIdToken: string): void {
    this.send('auth:firebaseToken', { firebaseIdToken });
  }

  createParty(maxSize: 2 | 4 = 4): void {
    this.send('squad:create', { maxSize });
  }

  setSquadSize(maxSize: SquadSize): void {
    this.send('squad:setSize', { maxSize });
  }

  setSquadReady(ready: boolean): void {
    this.send('squad:setReady', { ready });
  }

  transferSquadLeader(targetPlayerId: string): void {
    this.send('squad:transferLeader', { targetPlayerId });
  }

  setSquadMatchStatus(inMatch: boolean): void {
    this.send('squad:setMatchStatus', { inMatch });
  }

  startSquadBattleRoyale(config: Record<string, unknown>): void {
    this.send('squad:startBattleRoyale', config);
  }

  inviteFriendToSquad(friendId: string): void {
    this.send('squad:invite', { friendId });
  }

  respondToSquadInvite(inviteId: string, accept: boolean): void {
    this.send('squad:inviteRespond', { inviteId, accept });
  }

  leaveSquad(): void {
    this.send('squad:leave', {});
  }

  kickSquadMember(targetPlayerId: string): void {
    this.send('squad:kick', { targetPlayerId });
  }

  updateSquadCharacter(
    characterId: string,
    customization: RankedCustomizationPayload,
    cosmetics?: {
      avatarId?: string;
      bannerId?: string;
      weaponSkins?: Record<string, string>;
    },
  ): void {
    this.send('squad:updateCharacter', {
      characterId,
      customization,
      avatarId: cosmetics?.avatarId,
      bannerId: cosmetics?.bannerId,
      weaponSkins: cosmetics?.weaponSkins,
    });
  }

  requestFriendsList(): void {
    this.send('friends:get', {});
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('ping', { clientTime: Date.now() });
      }
    }, 5000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = 0;
    }
  }

  dispose(): void {
    this.disconnect();
    this.handlers.clear();
    this.stateListeners.clear();
  }
}
