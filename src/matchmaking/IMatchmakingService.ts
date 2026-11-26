export type QueueStatus = 'idle' | 'searching' | 'match-found' | 'cancelled';

export interface MatchTicket {
  ticketId: string;
  region: string;
  playlist: 'solo-100' | 'squad-100';
  createdAtMs: number;
}

export interface IMatchmakingService {
  getStatus(): QueueStatus;
  enqueue(playlist: MatchTicket['playlist'], region: string): Promise<MatchTicket>;
  cancel(ticketId: string): Promise<void>;
}
