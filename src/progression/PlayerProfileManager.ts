import type { CharacterManager } from '../characters/CharacterManager';
import type { Subsystem } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import type { RankedApiClient } from '../ranked/RankedApiClient';
import {
  getRankTier,
  type PlatformType,
  type PlayerGender,
  type RankedProfile,
  type RankTier,
} from '../ranked/RankedTypes';

export interface PlayerAccountSnapshot {
  playerId: string;
  numericId: string;
  username: string;
  usernameChanged: boolean;
  isDeveloper?: boolean;
  platform: PlatformType;
  gender: PlayerGender | null;
  level: number;
  xp: number;
  nextLevelXp: number;
  avatarCharacterId: string;
  totalMatches: number;
  wins: number;
  eliminations: number;
  deaths: number;
  totalDamage: number;
  bestKillsInMatch: number;
  winRatePct: number;
  kdRatio: number;
  rp: number;
  tier: RankTier;
  rankedMatches: number;
  rankedWins: number;
  rankedKills: number;
  rankedTop3: number;
}

interface PersistedLocalAccount {
  playerId: string;
  numericId?: string;
  username: string;
  usernameChanged: boolean;
  gender?: PlayerGender | null;
  avatarCharacterId: string;
  totalMatches: number;
  wins: number;
  eliminations: number;
  deaths: number;
  totalDamage: number;
  bestKillsInMatch: number;
  rp: number;
  tier: RankTier;
  rankedMatches: number;
  rankedWins: number;
  rankedKills: number;
  rankedTop3: number;
}

const ACCOUNT_STORAGE_KEY = 'nexus_player_account_v1';

function deriveFallbackNumericId(playerId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < playerId.length; i++) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = 100000000 + ((hash >>> 0) % 900000000);
  return String(num);
}

export type ProfileChangeListener = (snapshot: PlayerAccountSnapshot) => void;

export function computeMatchXpReward(input: {
  placement: number;
  totalPlayers: number;
  kills: number;
  damage: number;
  survivedSec: number;
  isWinner: boolean;
  isRanked?: boolean;
}): number {
  const safeKills = Math.max(0, Math.floor(input.kills));
  const safeDmg = Math.max(0, Math.round(input.damage));
  const safeSurv = Math.max(0, Math.round(input.survivedSec));
  const baseParticipation = 20;
  const killXp = safeKills * (input.isRanked ? 35 : 25);
  const damageXp = Math.min(80, Math.round(safeDmg * 0.08));
  const survivalXp = Math.min(45, Math.floor(safeSurv / 15));
  const placementBonus = input.isWinner
    ? 120
    : input.placement <= 3
      ? 60
      : input.placement <= 10
        ? 30
        : 0;
  const modeBonus = input.isRanked ? 25 : 0;
  return Math.max(15, baseParticipation + killXp + damageXp + survivalXp + placementBonus + modeBonus);
}

export class PlayerProfileManager implements Subsystem {
  private state: PersistedLocalAccount;
  private isDeveloperVerified = false;
  private readonly listeners = new Set<ProfileChangeListener>();
  private readonly unsubscribeUnlock: () => void;
  private readonly unsubscribeSelect: () => void;

  constructor(
    private readonly characterManager: CharacterManager,
    private readonly rankedApi: RankedApiClient,
  ) {
    this.state = this.loadLocal();
    this.unsubscribeUnlock = this.characterManager.unlockSystem.onChange(() => {
      this.emit();
    });
    this.unsubscribeSelect = this.characterManager.onSelect((char) => {
      if (this.state.avatarCharacterId !== char.id) {
        this.state.avatarCharacterId = char.id;
        this.saveLocal();
        this.emit();
      }
    });
  }

  setDeveloperVerified(enabled: boolean): void {
    const next = Boolean(enabled);
    if (this.isDeveloperVerified === next) return;
    this.isDeveloperVerified = next;
    this.emit();
  }

  async initializeFromServer(): Promise<PlayerAccountSnapshot> {
    try {
      const profile = await this.rankedApi.ensureProfile();
      this.applyServerProfile(profile);
      const localLevel = this.characterManager.unlockSystem.getPlayerLevel();
      const localXp = this.characterManager.unlockSystem.getPlayerXp();
      const needsGenderSync = !profile.gender && (this.state.gender === 'male' || this.state.gender === 'female');
      if (
        (profile.level ?? 1) !== localLevel ||
        (profile.xp ?? 0) !== localXp ||
        (profile.avatarCharacterId ?? 'char-01') !== this.state.avatarCharacterId ||
        needsGenderSync
      ) {
        void this.rankedApi
          .syncAccountProgression({
            level: localLevel,
            xp: localXp,
            avatarCharacterId: this.state.avatarCharacterId,
            gender: needsGenderSync ? this.state.gender : undefined,
          })
          .then((updated) => {
            if (updated) {
              this.applyServerProfile(updated);
            }
          })
          .catch(() => {});
      }
    } catch {
      // Fallback gracefully to persisted local account state when offline
    }
    return this.getSnapshot();
  }

  getSnapshot(): PlayerAccountSnapshot {
    const level = this.characterManager.unlockSystem.getPlayerLevel();
    const xp = this.characterManager.unlockSystem.getPlayerXp();
    const nextLevelXp = this.characterManager.unlockSystem.getNextLevelXp();
    const totalMatches = Math.max(0, this.state.totalMatches);
    const wins = Math.max(0, this.state.wins);
    const eliminations = Math.max(0, this.state.eliminations);
    const deaths = Math.max(0, this.state.deaths);
    const winRatePct = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
    const kdRatio = deaths > 0 ? eliminations / deaths : eliminations;
    const numericId =
      this.state.numericId && /^\d{6,12}$/.test(this.state.numericId)
        ? this.state.numericId
        : deriveFallbackNumericId(this.state.playerId);

    return {
      playerId: this.state.playerId,
      numericId,
      username: this.state.username,
      usernameChanged: this.state.usernameChanged,
      isDeveloper: this.isDeveloperVerified,
      platform: this.rankedApi.getPlatform(),
      gender: this.state.gender === 'male' || this.state.gender === 'female' ? this.state.gender : null,
      level,
      xp,
      nextLevelXp,
      avatarCharacterId:
        this.state.avatarCharacterId || this.characterManager.getSelectedCharacter().id,
      totalMatches,
      wins,
      eliminations,
      deaths,
      totalDamage: Math.max(0, this.state.totalDamage),
      bestKillsInMatch: Math.max(0, this.state.bestKillsInMatch),
      winRatePct,
      kdRatio,
      rp: this.state.rp,
      tier: this.state.tier,
      rankedMatches: this.state.rankedMatches,
      rankedWins: this.state.rankedWins,
      rankedKills: this.state.rankedKills,
      rankedTop3: this.state.rankedTop3,
    };
  }

  getUsername(): string {
    return this.state.username;
  }

  canChangeUsername(): boolean {
    return true;
  }

  async setPlayerGender(gender: PlayerGender): Promise<PlayerAccountSnapshot> {
    this.state.gender = gender;
    this.saveLocal();
    this.emit();
    try {
      const updated = await this.rankedApi.updateProfileGender(gender);
      this.applyServerProfile(updated);
    } catch {
      // Offline / transient network fallback retains local gender and syncs on reconnect
    }
    return this.getSnapshot();
  }

  syncFromRankedProfile(profile: RankedProfile): void {
    this.applyServerProfile(profile);
  }

  applyCloudProfile(profile: RankedProfile): PlayerAccountSnapshot {
    this.state = {
      playerId: profile.playerId,
      numericId:
        typeof profile.numericId === 'string' && /^\d{6,12}$/.test(profile.numericId)
          ? profile.numericId
          : deriveFallbackNumericId(profile.playerId),
      username: profile.name || 'FIGHTER',
      usernameChanged: Boolean(profile.usernameChanged),
      gender: profile.gender === 'male' || profile.gender === 'female' ? profile.gender : null,
      avatarCharacterId:
        profile.avatarCharacterId || this.characterManager.getSelectedCharacter().id,
      totalMatches: Math.max(0, profile.careerMatches ?? profile.matchesPlayed ?? 0),
      wins: Math.max(0, profile.careerWins ?? profile.wins ?? 0),
      eliminations: Math.max(0, profile.careerKills ?? profile.kills ?? 0),
      deaths: Math.max(0, profile.careerDeaths ?? profile.deaths ?? 0),
      totalDamage: Math.max(0, profile.careerDamage ?? profile.totalDamage ?? 0),
      bestKillsInMatch: Math.max(0, profile.careerBestKills ?? profile.bestKillsInMatch ?? 0),
      rp: Math.max(0, profile.rp ?? 200),
      tier: profile.tier ?? getRankTier(profile.rp ?? 200),
      rankedMatches: Math.max(0, profile.matchesPlayed ?? 0),
      rankedWins: Math.max(0, profile.wins ?? 0),
      rankedKills: Math.max(0, profile.kills ?? 0),
      rankedTop3: Math.max(0, profile.top3 ?? 0),
    };

    const cloudLevel = typeof profile.level === 'number' && profile.level >= 1 ? Math.floor(profile.level) : 1;
    const cloudXp = typeof profile.xp === 'number' && profile.xp >= 0 ? Math.floor(profile.xp) : 0;
    this.characterManager.unlockSystem.applyCloudLevelXp(cloudLevel, cloudXp);

    this.saveLocal();
    this.emit();
    return this.getSnapshot();
  }

  resetToGuestAccount(): PlayerAccountSnapshot {
    try {
      localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    this.isDeveloperVerified = false;
    const selectedCharId = this.characterManager.getSelectedCharacter().id;
    this.state = {
      playerId: 'local-operator',
      numericId: deriveFallbackNumericId('local-operator'),
      username: 'FIGHTER',
      usernameChanged: false,
      gender: null,
      avatarCharacterId: selectedCharId,
      totalMatches: 0,
      wins: 0,
      eliminations: 0,
      deaths: 0,
      totalDamage: 0,
      bestKillsInMatch: 0,
      rp: 200,
      tier: 'Bronze',
      rankedMatches: 0,
      rankedWins: 0,
      rankedKills: 0,
      rankedTop3: 0,
    };
    this.characterManager.unlockSystem.setPlayerLevel(1);
    this.saveLocal();
    this.emit();
    return this.getSnapshot();
  }

  async changeUsername(rawNewName: string): Promise<{
    snapshot: PlayerAccountSnapshot;
    serverProfile: RankedProfile | null;
  }> {
    const cleaned = rawNewName.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2 || cleaned.length > 18) {
      throw new Error(i18n.t('profile.err.length'));
    }
    if (!/^[\p{L}\p{N} _.-]{2,18}$/u.test(cleaned)) {
      throw new Error('Username may only contain letters, numbers, spaces, "_", "-", or ".".');
    }
    if (cleaned.toLowerCase() === this.state.username.trim().toLowerCase()) {
      throw new Error(i18n.t('profile.err.sameName'));
    }

    const updatedServerProfile = await this.rankedApi.renameProfile(cleaned);
    this.state.playerId = updatedServerProfile.playerId;
    this.state.username = updatedServerProfile.name;
    this.state.usernameChanged = false;
    this.saveLocal();
    this.emit();

    return {
      snapshot: this.getSnapshot(),
      serverProfile: updatedServerProfile,
    };
  }

  async changeUsernameOnce(rawNewName: string): Promise<{
    snapshot: PlayerAccountSnapshot;
    serverProfile: RankedProfile | null;
  }> {
    return this.changeUsername(rawNewName);
  }

  recordBattleRoyaleMatch(input: {
    placement: number;
    totalPlayers: number;
    kills: number;
    damage: number;
    survivedSec: number;
    isWinner: boolean;
  }): { xpEarned: number; leveledUp: boolean; newLevel: number } {
    const safeKills = Math.max(0, Math.floor(input.kills));
    const safeDamage = Math.max(0, Math.round(input.damage));
    const died = !input.isWinner;

    this.state.totalMatches += 1;
    if (input.isWinner) {
      this.state.wins += 1;
    }
    this.state.eliminations += safeKills;
    if (died) {
      this.state.deaths += 1;
    }
    this.state.totalDamage += safeDamage;
    this.state.bestKillsInMatch = Math.max(this.state.bestKillsInMatch, safeKills);

    const xpEarned = computeMatchXpReward({
      ...input,
      isRanked: false,
    });
    const prog = this.characterManager.unlockSystem.grantXp(xpEarned);
    this.saveLocal();
    this.emit();

    void this.rankedApi
      .syncAccountProgression({
        level: this.characterManager.unlockSystem.getPlayerLevel(),
        xp: this.characterManager.unlockSystem.getPlayerXp(),
        avatarCharacterId: this.state.avatarCharacterId,
        brMatch: {
          kills: safeKills,
          damage: safeDamage,
          died,
          isWinner: input.isWinner,
        },
      })
      .then((prof) => {
        if (prof) {
          this.applyServerProfile(prof);
        }
      })
      .catch(() => {});

    return {
      xpEarned,
      leveledUp: prog.leveledUp,
      newLevel: prog.newLevel,
    };
  }

  recordRankedMatchXp(input: {
    placement: number;
    totalPlayers: number;
    kills: number;
    damage: number;
    survivedSec: number;
    isWinner: boolean;
  }): { xpEarned: number; leveledUp: boolean; newLevel: number } {
    const xpEarned = computeMatchXpReward({
      ...input,
      isRanked: true,
    });
    const prog = this.characterManager.unlockSystem.grantXp(xpEarned);
    this.saveLocal();
    this.emit();

    void this.rankedApi
      .syncAccountProgression({
        level: this.characterManager.unlockSystem.getPlayerLevel(),
        xp: this.characterManager.unlockSystem.getPlayerXp(),
        avatarCharacterId: this.state.avatarCharacterId,
      })
      .then((prof) => {
        if (prof) {
          this.applyServerProfile(prof);
        }
      })
      .catch(() => {});

    return {
      xpEarned,
      leveledUp: prog.leveledUp,
      newLevel: prog.newLevel,
    };
  }

  onChange(listener: ProfileChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private applyServerProfile(profile: RankedProfile): void {
    this.state.playerId = profile.playerId;
    if (typeof profile.numericId === 'string' && /^\d{6,12}$/.test(profile.numericId)) {
      this.state.numericId = profile.numericId;
    }
    if (profile.gender === 'male' || profile.gender === 'female') {
      this.state.gender = profile.gender;
    }
    this.state.username = profile.name;
    this.state.usernameChanged = Boolean(profile.usernameChanged);
    this.state.rp = profile.rp;
    this.state.tier = profile.tier ?? getRankTier(profile.rp);
    this.state.rankedMatches = profile.matchesPlayed;
    this.state.rankedWins = profile.wins;
    this.state.rankedKills = profile.kills;
    this.state.rankedTop3 = profile.top3;

    this.state.totalMatches = Math.max(
      this.state.totalMatches,
      profile.careerMatches ?? profile.matchesPlayed,
    );
    this.state.wins = Math.max(this.state.wins, profile.careerWins ?? profile.wins);
    this.state.eliminations = Math.max(
      this.state.eliminations,
      profile.careerKills ?? profile.kills,
    );
    this.state.deaths = Math.max(this.state.deaths, profile.careerDeaths ?? profile.deaths);
    this.state.totalDamage = Math.max(
      this.state.totalDamage,
      profile.careerDamage ?? profile.totalDamage,
    );
    this.state.bestKillsInMatch = Math.max(
      this.state.bestKillsInMatch,
      profile.careerBestKills ?? profile.bestKillsInMatch,
    );

    if (this.isDeveloperVerified) {
      this.characterManager.unlockSystem.applyCloudLevelXp(100, 0);
    } else {
      const serverLevel = typeof profile.level === 'number' && profile.level >= 1 ? Math.floor(profile.level) : 1;
      const serverXp = typeof profile.xp === 'number' && profile.xp >= 0 ? Math.floor(profile.xp) : 0;
      const localLevel = this.characterManager.unlockSystem.getPlayerLevel();
      const localXp = this.characterManager.unlockSystem.getPlayerXp();
      if (serverLevel > localLevel) {
        this.characterManager.unlockSystem.setPlayerLevel(serverLevel);
        if (serverXp > 0) {
          this.characterManager.unlockSystem.grantXp(serverXp);
        }
      } else if (serverLevel === localLevel && serverXp > localXp) {
        this.characterManager.unlockSystem.grantXp(serverXp - localXp);
      }
    }

    if (profile.avatarCharacterId) {
      this.state.avatarCharacterId = this.characterManager.getSelectedCharacter().id;
    }

    this.saveLocal();
    this.emit();
  }

  private loadLocal(): PersistedLocalAccount {
    const selectedCharId = this.characterManager.getSelectedCharacter().id;
    try {
      const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedLocalAccount>;
        const playerId = typeof parsed.playerId === 'string' && parsed.playerId ? parsed.playerId : 'local-operator';
        return {
          playerId,
          numericId:
            typeof parsed.numericId === 'string' && /^\d{6,12}$/.test(parsed.numericId)
              ? parsed.numericId
              : deriveFallbackNumericId(playerId),
          username:
            typeof parsed.username === 'string' && parsed.username.trim().length >= 2
              ? parsed.username.trim()
              : 'FIGHTER',
          usernameChanged: Boolean(parsed.usernameChanged),
          gender: parsed.gender === 'male' || parsed.gender === 'female' ? parsed.gender : null,
          avatarCharacterId:
            typeof parsed.avatarCharacterId === 'string' && parsed.avatarCharacterId
              ? parsed.avatarCharacterId
              : selectedCharId,
          totalMatches: typeof parsed.totalMatches === 'number' ? Math.max(0, parsed.totalMatches) : 0,
          wins: typeof parsed.wins === 'number' ? Math.max(0, parsed.wins) : 0,
          eliminations: typeof parsed.eliminations === 'number' ? Math.max(0, parsed.eliminations) : 0,
          deaths: typeof parsed.deaths === 'number' ? Math.max(0, parsed.deaths) : 0,
          totalDamage: typeof parsed.totalDamage === 'number' ? Math.max(0, parsed.totalDamage) : 0,
          bestKillsInMatch:
            typeof parsed.bestKillsInMatch === 'number' ? Math.max(0, parsed.bestKillsInMatch) : 0,
          rp: typeof parsed.rp === 'number' ? Math.max(0, parsed.rp) : 200,
          tier: parsed.tier ?? getRankTier(typeof parsed.rp === 'number' ? parsed.rp : 200),
          rankedMatches: typeof parsed.rankedMatches === 'number' ? Math.max(0, parsed.rankedMatches) : 0,
          rankedWins: typeof parsed.rankedWins === 'number' ? Math.max(0, parsed.rankedWins) : 0,
          rankedKills: typeof parsed.rankedKills === 'number' ? Math.max(0, parsed.rankedKills) : 0,
          rankedTop3: typeof parsed.rankedTop3 === 'number' ? Math.max(0, parsed.rankedTop3) : 0,
        };
      }
    } catch {
      // Ignore corrupt storage
    }

    return {
      playerId: 'local-operator',
      numericId: deriveFallbackNumericId('local-operator'),
      username: 'FIGHTER',
      usernameChanged: false,
      gender: null,
      avatarCharacterId: selectedCharId,
      totalMatches: 0,
      wins: 0,
      eliminations: 0,
      deaths: 0,
      totalDamage: 0,
      bestKillsInMatch: 0,
      rp: 200,
      tier: 'Bronze',
      rankedMatches: 0,
      rankedWins: 0,
      rankedKills: 0,
      rankedTop3: 0,
    };
  }

  private saveLocal(): void {
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage quota issues
    }
  }

  dispose(): void {
    this.unsubscribeUnlock();
    this.unsubscribeSelect();
    this.listeners.clear();
  }
}
