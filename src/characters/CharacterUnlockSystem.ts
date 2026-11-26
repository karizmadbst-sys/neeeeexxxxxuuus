import type { Subsystem } from '../core/Types';
import type { CharacterDefinition } from './CharacterData';

export interface ProgressionPersistence {
  level: number;
  xp: number;
  selectedCharacterId: string;
}

const STORAGE_KEY = 'nexus_royale_progression_v1';

export type UnlockChangeListener = () => void;

export class CharacterUnlockSystem implements Subsystem {
  private level = 1;
  private xp = 0;
  private selectedCharacterId = 'char-01';
  private developerUnlocked = false;
  private listeners = new Set<UnlockChangeListener>();

  constructor() {
    this.load();
  }

  hasDeveloperAccess(): boolean {
    return this.developerUnlocked;
  }

  setDeveloperAccess(enabled: boolean): void {
    const next = Boolean(enabled);
    if (this.developerUnlocked === next) return;
    this.developerUnlocked = next;
    this.emit();
  }

  getPlayerLevel(): number {
    return this.level;
  }

  getPlayerXp(): number {
    return this.xp;
  }

  getNextLevelXp(): number {
    return 100 + (this.level - 1) * 35;
  }

  getSelectedCharacterId(): string {
    return this.selectedCharacterId;
  }

  setSelectedCharacterId(id: string): void {
    this.selectedCharacterId = id;
    this.save();
    this.emit();
  }

  isCharacterUnlocked(character: CharacterDefinition): boolean {
    return this.developerUnlocked || this.level >= character.unlockLevel;
  }

  getUnlockedCharacters(allCharacters: readonly CharacterDefinition[]): CharacterDefinition[] {
    return allCharacters.filter((c) => this.isCharacterUnlocked(c));
  }

  grantXp(amount: number): { leveledUp: boolean; newLevel: number } {
    if (this.developerUnlocked) {
      this.level = 100;
      this.xp = 0;
      this.save();
      this.emit();
      return { leveledUp: false, newLevel: this.level };
    }
    if (amount <= 0) return { leveledUp: false, newLevel: this.level };
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.getNextLevelXp() && this.level < 300) {
      this.xp -= this.getNextLevelXp();
      this.level++;
      leveledUp = true;
    }
    this.save();
    this.emit();
    return { leveledUp, newLevel: this.level };
  }

  setPlayerLevel(level: number): void {
    this.level = Math.max(1, Math.min(300, Math.floor(level)));
    this.xp = 0;
    this.save();
    this.emit();
  }

  applyCloudLevelXp(level: number, xp: number): void {
    this.level = Math.max(1, Math.min(300, Math.floor(level)));
    this.xp = Math.max(0, Math.floor(xp));
    this.save();
    this.emit();
  }

  applyCloudSelection(characterId?: string | null): void {
    if (typeof characterId === 'string' && characterId.trim()) {
      this.selectedCharacterId = characterId.trim();
      this.save();
      this.emit();
    }
  }

  resetToDefaults(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    this.developerUnlocked = false;
    this.level = 1;
    this.xp = 0;
    this.selectedCharacterId = 'char-01';
    this.emit();
  }

  onChange(listener: UnlockChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ProgressionPersistence>;
      if (typeof parsed.level === 'number' && parsed.level >= 1) {
        this.level = Math.floor(parsed.level);
      }
      if (typeof parsed.xp === 'number' && parsed.xp >= 0) {
        this.xp = Math.floor(parsed.xp);
      }
      if (typeof parsed.selectedCharacterId === 'string') {
        this.selectedCharacterId = parsed.selectedCharacterId;
      }
    } catch {
      // Ignore invalid storage
    }
  }

  private save(): void {
    try {
      const payload: ProgressionPersistence = {
        level: this.level,
        xp: this.xp,
        selectedCharacterId: this.selectedCharacterId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
