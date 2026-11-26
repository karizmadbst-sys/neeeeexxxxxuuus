export type NetworkConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface NetPacket<TPayload = unknown> {
  type: string;
  seq: number;
  serverTimeMs: number;
  payload: TPayload;
}

/**
 * Contract prepared for Cloudflare Workers + Durable Objects WebSocket transport.
 */
export interface INetworkClient {
  readonly state: NetworkConnectionState;
  connect(endpointUrl: string, token: string): Promise<void>;
  disconnect(): void;
  send<TPayload>(type: string, payload: TPayload): void;
  onPacket(handler: (packet: NetPacket) => void): () => void;
}
