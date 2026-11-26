import type { Subsystem } from '../core/Types';
import type { Player } from '../player/Player';
import { AbilityManager } from './AbilityManager';
import { CHARACTER_ROSTER, type CharacterDefinition } from './CharacterData';
import { CharacterUnlockSystem } from './CharacterUnlockSystem';

export type CharacterSelectListener = (character: CharacterDefinition) => void;

export class CharacterManager implements Subsystem {
  readonly unlockSystem = new CharacterUnlockSystem();
  readonly abilityManager = new AbilityManager();

  private selectedCharacter: CharacterDefinition;
  private boundPlayer: Player | null = null;
  private listeners = new Set<CharacterSelectListener>();

  constructor() {
    const savedId = this.unlockSystem.getSelectedCharacterId();
    const candidate = this.getCharacterById(savedId) ?? CHARACTER_ROSTER[0];
    this.selectedCharacter = this.unlockSystem.isCharacterUnlocked(candidate)
      ? candidate
      : CHARACTER_ROSTER[0];
  }

  getAllCharacters(): readonly CharacterDefinition[] {
    return CHARACTER_ROSTER;
  }

  getCharacterById(id: string): CharacterDefinition | undefined {
    return CHARACTER_ROSTER.find((c) => c.id === id);
  }

  getSelectedCharacter(): CharacterDefinition {
    return this.selectedCharacter;
  }

  isUnlocked(character: CharacterDefinition): boolean {
    return this.unlockSystem.isCharacterUnlocked(character);
  }

  bindPlayer(player: Player): void {
    this.boundPlayer = player;
    this.applySelectedToPlayer();
  }

  selectCharacter(id: string): boolean {
    const target = this.getCharacterById(id);
    if (!target) return false;
    if (!this.isUnlocked(target)) return false;

    this.selectedCharacter = target;
    this.unlockSystem.setSelectedCharacterId(target.id);
    this.applySelectedToPlayer();

    for (const listener of this.listeners) {
      listener(target);
    }
    return true;
  }

  applySelectedToPlayer(): void {
    if (!this.boundPlayer) return;
    const char = this.selectedCharacter;
    this.abilityManager.equipCharacter(char, this.boundPlayer.stats);
    this.boundPlayer.setModelSpec(char.model);
  }

  triggerActiveAbility(): boolean {
    if (!this.boundPlayer) return false;
    return this.abilityManager.triggerActiveAbility(this.boundPlayer.stats);
  }

  update(deltaSeconds: number): void {
    if (!this.boundPlayer) return;
    this.abilityManager.update(deltaSeconds, this.boundPlayer.stats);
  }

  resetForArena(): void {
    if (!this.boundPlayer) return;
    this.abilityManager.resetCooldowns(this.boundPlayer.stats);
  }

  onSelect(listener: CharacterSelectListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.abilityManager.dispose();
    this.unlockSystem.dispose();
    this.boundPlayer = null;
  }
}
