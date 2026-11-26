export interface PlayerProgressionSummary {
  level: number;
  xp: number;
  nextLevelXp: number;
  wins: number;
  matchesPlayed: number;
}

export interface IProgressionService {
  getSummary(): Promise<PlayerProgressionSummary>;
  awardMatchXp(amount: number): Promise<PlayerProgressionSummary>;
}
