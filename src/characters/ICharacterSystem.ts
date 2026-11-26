export type CharacterArchetype = 'Vanguard' | 'Recon' | 'Support' | 'Breacher';

export interface CharacterPreviewProfile {
  id: string;
  codename: string;
  archetype: CharacterArchetype;
  primaryColorHex: string;
  visorColorHex: string;
  summary: string;
  status: 'Foundation Preview';
}

export interface ICharacterRegistry {
  listAvailable(): readonly CharacterPreviewProfile[];
  getSelectedId(): string;
  selectCharacter(id: string): void;
}

export const PHASE1_CHARACTER_PREVIEWS: readonly CharacterPreviewProfile[] = [
  {
    id: 'unit-01',
    codename: 'SPECTRE-01',
    archetype: 'Vanguard',
    primaryColorHex: '#38bdf8',
    visorColorHex: '#f97316',
    summary: 'Balanced tactical chassis designed for rapid drop insertion.',
    status: 'Foundation Preview',
  },
  {
    id: 'unit-02',
    codename: 'VULCAN-04',
    archetype: 'Breacher',
    primaryColorHex: '#f97316',
    visorColorHex: '#fbbf24',
    summary: 'Reinforced exo-plating built for close-quarters perimeter pushes.',
    status: 'Foundation Preview',
  },
  {
    id: 'unit-03',
    codename: 'WRAITH-07',
    archetype: 'Recon',
    primaryColorHex: '#2dd4bf',
    visorColorHex: '#38bdf8',
    summary: 'Lightweight composite frame tuned for terrain traversal.',
    status: 'Foundation Preview',
  },
] as const;
