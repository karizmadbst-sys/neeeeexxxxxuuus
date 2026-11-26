export type WeaponCategory =
  | 'SMG'
  | 'AR'
  | 'LMG'
  | 'SHOTGUN'
  | 'SNIPER'
  | 'PISTOL'
  | 'MELEE'
  | (string & {});

export type ScopeReticleStyle = 'reflex' | 'tactical' | 'marksman' | 'sniper';

export interface WeaponScopeSpec {
  defaultZoom: number;
  zoomLevels: readonly number[];
  maxSupportedScope: number;
  reticleStyle: ScopeReticleStyle;
}

export interface WeaponRecoilSpec {
  verticalKickDeg: number;
  horizontalKickDeg: number;
  adsMultiplier: number;
  recoverySpeed: number;
  visualKickback: number;
}

export interface WeaponSpreadSpec {
  hipSpreadDeg: number;
  adsSpreadDeg: number;
  moveSpreadDeg: number;
  bloomPerShotDeg: number;
  maxBloomDeg: number;
  bloomDecayPerSec: number;
}

export interface WeaponFalloffSpec {
  closeRange: number;
  mediumRange: number;
  mediumDamageRatio: number;
  longDamageRatio: number;
}

export interface WeaponSoundSpec {
  id: string;
  pitchHz: number;
  endPitchHz: number;
  punchGain: number;
  noiseHz: number;
  decaySec: number;
}

export interface WeaponModelSpec {
  placeholderId: string;
  primaryColorHex: string;
  accentColorHex: string;
  bodyLength: number;
  barrelLength: number;
  hasStock: boolean;
  magazineStyle:
    | 'curved'
    | 'straight'
    | 'tube'
    | 'break_action'
    | 'drum'
    | 'pan'
    | 'belt_box'
    | 'top_p90'
    | 'revolver'
    | 'none';
}

export interface WeaponDefinition {
  id: string;
  name: string;
  type: WeaponCategory;
  damage: number;
  headshotDamage: number;
  range: number;
  fireRate: number; // Rounds per minute (RPM)
  magazineSize: number;
  reloadTime: number; // Seconds
  recoil: WeaponRecoilSpec;
  spread: WeaponSpreadSpec;
  bulletSpeed: number; // Meters per second
  accuracy: number; // 0..100 rating
  criticalMultiplier: number;
  sound: WeaponSoundSpec;
  model: WeaponModelSpec;
  pellets: number; // 1 for standard bullets, >1 for shotguns (e.g. M1887 / M1014)
  startingReserveAmmo: number;
  automatic: boolean;
  boltAction?: boolean;
  breakAction?: boolean;
  meleeKind?: 'fists' | 'knife' | 'bat';
  aimAssistEnabled?: boolean;
  falloff: WeaponFalloffSpec;
  scope?: WeaponScopeSpec;
}

export interface IWeaponSystem {
  registerWeapon(def: WeaponDefinition): void;
  equipSlot(slotIndex: number): boolean;
  triggerFire(): boolean;
  triggerReload(): boolean;
  update(deltaSeconds: number): void;
  dispose(): void;
}
