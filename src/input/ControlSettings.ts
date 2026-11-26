import type { OrientationMode, Subsystem } from '../core/Types';
import { clamp } from '../utils/MathUtils';

export type GameAction =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'useMedkit'
  | 'useSpecial'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'prone'
  | 'pickup'
  | 'drop'
  | 'ability'
  | 'glooWall'
  | 'weaponSwitch'
  | 'holster'
  | 'inventory'
  | 'minimap';

export type HudActionSlotId =
  | 'fire'
  | 'aim'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'prone'
  | 'reload'
  | 'weaponSwitch'
  | 'holster'
  | 'pickup'
  | 'drop'
  | 'ability'
  | 'glooWall'
  | 'inventory'
  | 'minimap';

export type HudStatusSlotId =
  | 'health'
  | 'armor'
  | 'helmet'
  | 'ammo'
  | 'weapon1'
  | 'weapon2'
  | 'medkit'
  | 'special';

export type ControlSlotId = 'joystick' | HudActionSlotId | HudStatusSlotId;

export const ALL_CONTROL_SLOT_IDS: readonly ControlSlotId[] = [
  'joystick',
  'fire',
  'aim',
  'jump',
  'sprint',
  'crouch',
  'prone',
  'reload',
  'weaponSwitch',
  'holster',
  'pickup',
  'drop',
  'ability',
  'glooWall',
  'inventory',
  'minimap',
  'health',
  'armor',
  'helmet',
  'ammo',
  'weapon1',
  'weapon2',
  'medkit',
  'special',
];

export const CONTROL_SLOT_LABELS: Record<ControlSlotId, string> = {
  joystick: 'Move Joystick',
  fire: 'Fire / Punch',
  aim: 'Scope / Aim',
  jump: 'Jump / Vault',
  sprint: 'Sprint',
  crouch: 'Crouch',
  prone: 'Prone',
  reload: 'Reload',
  weaponSwitch: 'Switch Weapon',
  holster: 'Holster / Unarm',
  pickup: 'Pickup / Interact',
  drop: 'Drop Weapon',
  ability: 'Tactical Ability',
  glooWall: 'Gloo Wall',
  inventory: 'Backpack',
  minimap: 'Minimap',
  health: 'Health',
  armor: 'Vest Armor',
  helmet: 'Helmet',
  ammo: 'Ammo Counter',
  weapon1: 'Weapon Slot 1',
  weapon2: 'Weapon Slot 2',
  medkit: 'Medkit Slot',
  special: 'Special Slot',
};

export interface ControlSlotLayout {
  id: ControlSlotId;
  xPct: number; // 0..100 from left
  yPct: number; // 0..100 from top
  scale: number; // 0.6..1.65
  opacity: number; // 0.25..1.0
  visible: boolean;
}

export type OrientationControlLayout = Record<ControlSlotId, ControlSlotLayout>;
export type KeyBindingsMap = Record<GameAction, string>;

export interface ControlSettingsData {
  keyBindings: KeyBindingsMap;
  layouts: Record<OrientationMode, OrientationControlLayout>;
}

const LEGACY_STORAGE_KEY_V1 = 'nexus_royale_controls_v1';
const LEGACY_STORAGE_KEY_V2 = 'nexus_royale_controls_v2';
const STORAGE_KEY = 'nexus_royale_controls_v3';

export const DEFAULT_KEY_BINDINGS: KeyBindingsMap = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  fire: 'Mouse0',
  aim: 'Mouse2',
  reload: 'KeyR',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
  slot4: 'Digit4',
  useMedkit: 'Digit5',
  useSpecial: 'Digit6',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  prone: 'KeyZ',
  pickup: 'KeyE',
  inventory: 'Tab',
  drop: 'KeyG',
  ability: 'KeyQ',
  glooWall: 'KeyV',
  weaponSwitch: 'KeyX',
  holster: 'KeyH',
  minimap: 'KeyM',
};

export const KEY_BINDING_LABELS: Record<GameAction, string> = {
  moveForward: 'Move Forward',
  moveBackward: 'Move Backward',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  fire: 'Fire / Punch',
  aim: 'Scope / Aim',
  reload: 'Reload',
  slot1: 'Large Weapon 1',
  slot2: 'Large Weapon 2',
  slot3: 'Pistol Slot',
  slot4: 'Melee Slot',
  useMedkit: 'Use Medkit',
  useSpecial: 'Use Special Item',
  jump: 'Jump',
  sprint: 'Sprint',
  crouch: 'Crouch',
  prone: 'Prone',
  pickup: 'Interact / Loot',
  inventory: 'Inventory / Backpack',
  drop: 'Drop Item',
  ability: 'Tactical Ability',
  glooWall: 'Deploy Gloo Wall',
  weaponSwitch: 'Switch Weapon',
  holster: 'Holster on Back / Unarm',
  minimap: 'Minimap',
};

export function createDefaultLandscapeLayout(): OrientationControlLayout {
  return {
    // Left thumb & utility cluster (clear of Top-Left Minimap & Bottom-Center HUD Bar)
    joystick: { id: 'joystick', xPct: 16.5, yPct: 76, scale: 0.92, opacity: 0.9, visible: true },
    sprint: { id: 'sprint', xPct: 16, yPct: 47, scale: 0.88, opacity: 0.9, visible: true },
    minimap: { id: 'minimap', xPct: 25.5, yPct: 47, scale: 0.84, opacity: 0.88, visible: true },
    inventory: { id: 'inventory', xPct: 5.5, yPct: 47, scale: 0.86, opacity: 0.9, visible: true },
    medkit: { id: 'medkit', xPct: 5.5, yPct: 62, scale: 0.82, opacity: 0.9, visible: true },
    special: { id: 'special', xPct: 5.5, yPct: 77, scale: 0.82, opacity: 0.9, visible: true },
    drop: { id: 'drop', xPct: 27.5, yPct: 87, scale: 0.82, opacity: 0.88, visible: true },

    // Center interact/loot button comfortably above Bottom HUD Bar
    pickup: { id: 'pickup', xPct: 50, yPct: 67, scale: 0.9, opacity: 0.92, visible: true },

    // Right combat & stance cluster (clear of Top-Right Weapon Card)
    fire: { id: 'fire', xPct: 82.5, yPct: 69, scale: 1.12, opacity: 0.94, visible: true },
    aim: { id: 'aim', xPct: 93, yPct: 50, scale: 0.86, opacity: 0.9, visible: true },
    jump: { id: 'jump', xPct: 93, yPct: 67, scale: 0.88, opacity: 0.9, visible: true },
    crouch: { id: 'crouch', xPct: 93, yPct: 84, scale: 0.86, opacity: 0.9, visible: true },
    prone: { id: 'prone', xPct: 82.5, yPct: 89, scale: 0.86, opacity: 0.9, visible: true },
    ability: { id: 'ability', xPct: 72, yPct: 56, scale: 0.86, opacity: 0.9, visible: true },
    glooWall: { id: 'glooWall', xPct: 63, yPct: 54, scale: 0.9, opacity: 0.92, visible: true },
    reload: { id: 'reload', xPct: 72, yPct: 72, scale: 0.86, opacity: 0.9, visible: true },
    weaponSwitch: {
      id: 'weaponSwitch',
      xPct: 72,
      yPct: 88,
      scale: 0.84,
      opacity: 0.9,
      visible: true,
    },
    holster: { id: 'holster', xPct: 63, yPct: 69, scale: 0.82, opacity: 0.88, visible: true },

    // Redundant ring widgets (already shown cleanly in Top-Right Weapon Card & Bottom Bar)
    health: { id: 'health', xPct: 42, yPct: 89, scale: 0.9, opacity: 0.9, visible: false },
    armor: { id: 'armor', xPct: 49, yPct: 89, scale: 0.9, opacity: 0.9, visible: false },
    helmet: { id: 'helmet', xPct: 56, yPct: 89, scale: 0.9, opacity: 0.9, visible: false },
    weapon1: { id: 'weapon1', xPct: 82, yPct: 26, scale: 0.9, opacity: 0.9, visible: false },
    weapon2: { id: 'weapon2', xPct: 90, yPct: 26, scale: 0.9, opacity: 0.9, visible: false },
    ammo: { id: 'ammo', xPct: 88, yPct: 16, scale: 0.9, opacity: 0.9, visible: false },
  };
}

export function createDefaultPortraitLayout(): OrientationControlLayout {
  return {
    // Left utility & movement cluster (clear of Top-Left Minimap & Bottom Bar)
    minimap: { id: 'minimap', xPct: 8.5, yPct: 40, scale: 0.82, opacity: 0.88, visible: true },
    inventory: { id: 'inventory', xPct: 8.5, yPct: 47, scale: 0.84, opacity: 0.9, visible: true },
    medkit: { id: 'medkit', xPct: 8.5, yPct: 55, scale: 0.8, opacity: 0.9, visible: true },
    special: { id: 'special', xPct: 8.5, yPct: 63, scale: 0.8, opacity: 0.9, visible: true },
    sprint: { id: 'sprint', xPct: 22, yPct: 58, scale: 0.84, opacity: 0.9, visible: true },
    joystick: { id: 'joystick', xPct: 20, yPct: 76, scale: 0.86, opacity: 0.9, visible: true },
    drop: { id: 'drop', xPct: 20, yPct: 86, scale: 0.8, opacity: 0.88, visible: true },

    // Center interact button
    pickup: { id: 'pickup', xPct: 50, yPct: 55, scale: 0.86, opacity: 0.92, visible: true },

    // Right combat & stance cluster (clear of Top-Right Weapon Card & Bottom Bar)
    aim: { id: 'aim', xPct: 91, yPct: 51, scale: 0.84, opacity: 0.9, visible: true },
    jump: { id: 'jump', xPct: 91, yPct: 60, scale: 0.84, opacity: 0.9, visible: true },
    fire: { id: 'fire', xPct: 82, yPct: 70, scale: 1.06, opacity: 0.94, visible: true },
    crouch: { id: 'crouch', xPct: 91, yPct: 80, scale: 0.82, opacity: 0.9, visible: true },
    prone: { id: 'prone', xPct: 78, yPct: 86, scale: 0.82, opacity: 0.9, visible: true },
    ability: { id: 'ability', xPct: 65, yPct: 60, scale: 0.82, opacity: 0.9, visible: true },
    glooWall: { id: 'glooWall', xPct: 65, yPct: 51, scale: 0.84, opacity: 0.92, visible: true },
    reload: { id: 'reload', xPct: 65, yPct: 69, scale: 0.82, opacity: 0.9, visible: true },
    weaponSwitch: {
      id: 'weaponSwitch',
      xPct: 62,
      yPct: 86,
      scale: 0.82,
      opacity: 0.9,
      visible: true,
    },
    holster: { id: 'holster', xPct: 48, yPct: 76, scale: 0.8, opacity: 0.88, visible: true },

    // Redundant ring widgets
    health: { id: 'health', xPct: 16, yPct: 54, scale: 0.84, opacity: 0.9, visible: false },
    armor: { id: 'armor', xPct: 28, yPct: 54, scale: 0.84, opacity: 0.9, visible: false },
    helmet: { id: 'helmet', xPct: 40, yPct: 54, scale: 0.84, opacity: 0.9, visible: false },
    weapon1: { id: 'weapon1', xPct: 35, yPct: 65, scale: 0.84, opacity: 0.9, visible: false },
    weapon2: { id: 'weapon2', xPct: 57, yPct: 65, scale: 0.84, opacity: 0.9, visible: false },
    ammo: { id: 'ammo', xPct: 50, yPct: 76, scale: 0.84, opacity: 0.9, visible: false },
  };
}

function mergeOrientationLayout(
  defaults: OrientationControlLayout,
  raw: Partial<OrientationControlLayout> | undefined,
): OrientationControlLayout {
  const merged = { ...defaults };
  for (const id of ALL_CONTROL_SLOT_IDS) {
    const candidate = raw?.[id];
    const base = defaults[id];
    if (candidate && typeof candidate === 'object') {
      merged[id] = {
        id,
        xPct: typeof candidate.xPct === 'number' && Number.isFinite(candidate.xPct)
          ? clamp(candidate.xPct, 4, 96)
          : base.xPct,
        yPct: typeof candidate.yPct === 'number' && Number.isFinite(candidate.yPct)
          ? clamp(candidate.yPct, 5, 95)
          : base.yPct,
        scale: typeof candidate.scale === 'number' && Number.isFinite(candidate.scale)
          ? clamp(candidate.scale, 0.6, 1.65)
          : base.scale,
        opacity: typeof candidate.opacity === 'number' && Number.isFinite(candidate.opacity)
          ? clamp(candidate.opacity, 0.25, 1.0)
          : base.opacity,
        visible: typeof candidate.visible === 'boolean' ? candidate.visible : base.visible,
      };
    } else {
      merged[id] = { ...base };
    }
  }
  return merged;
}

export function cloneOrientationLayout(
  layout: OrientationControlLayout,
): OrientationControlLayout {
  const out = {} as OrientationControlLayout;
  for (const id of ALL_CONTROL_SLOT_IDS) {
    out[id] = { ...layout[id] };
  }
  return out;
}

import { i18n } from '../i18n/I18nManager';

export function getControlSlotLabel(id: ControlSlotId): string {
  return i18n.translateHudSlotLabel(id);
}

export function getKeyBindingLabel(action: GameAction): string {
  return i18n.translateKeyActionLabel(action);
}

export function formatBindingCode(code: string): string {
  return i18n.translateBindingCode(code);
}

export type ControlSettingsListener = (data: ControlSettingsData) => void;

export class ControlSettings implements Subsystem {
  private data: ControlSettingsData;
  private listeners = new Set<ControlSettingsListener>();

  constructor() {
    this.data = this.load();
  }

  getData(): ControlSettingsData {
    return this.data;
  }

  getKeyBindings(): KeyBindingsMap {
    return this.data.keyBindings;
  }

  getBinding(action: GameAction): string {
    return this.data.keyBindings[action];
  }

  getLayout(orientation: OrientationMode): OrientationControlLayout {
    return this.data.layouts[orientation];
  }

  cloneLayouts(): Record<OrientationMode, OrientationControlLayout> {
    return {
      landscape: cloneOrientationLayout(this.data.layouts.landscape),
      portrait: cloneOrientationLayout(this.data.layouts.portrait),
    };
  }

  restoreLayoutsSnapshot(
    layouts: Record<OrientationMode, OrientationControlLayout>,
    persist: boolean,
  ): void {
    this.data = {
      ...this.data,
      layouts: {
        landscape: cloneOrientationLayout(layouts.landscape),
        portrait: cloneOrientationLayout(layouts.portrait),
      },
    };
    if (persist) {
      this.save();
    }
    this.emit();
  }

  onChange(listener: ControlSettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setKeyBinding(action: GameAction, code: string): void {
    this.data = {
      ...this.data,
      keyBindings: {
        ...this.data.keyBindings,
        [action]: code,
      },
    };
    this.save();
    this.emit();
  }

  resetKeyBindings(): void {
    this.data = {
      ...this.data,
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
    };
    this.save();
    this.emit();
  }

  updateSlot(
    orientation: OrientationMode,
    slotId: ControlSlotId,
    patch: Partial<ControlSlotLayout>,
  ): void {
    const currentLayout = this.data.layouts[orientation];
    this.data = {
      ...this.data,
      layouts: {
        ...this.data.layouts,
        [orientation]: {
          ...currentLayout,
          [slotId]: {
            ...currentLayout[slotId],
            ...patch,
          },
        },
      },
    };
  }

  commitLayout(): void {
    this.save();
    this.emit();
  }

  resetLayout(orientation: OrientationMode): void {
    const fresh =
      orientation === 'portrait'
        ? createDefaultPortraitLayout()
        : createDefaultLandscapeLayout();
    this.data = {
      ...this.data,
      layouts: {
        ...this.data.layouts,
        [orientation]: fresh,
      },
    };
    this.save();
    this.emit();
  }

  exportCloudControls(): {
    bindings: Record<string, string>;
    touchLayouts: Record<string, unknown>;
  } {
    return {
      bindings: { ...this.data.keyBindings },
      touchLayouts: {
        landscape: cloneOrientationLayout(this.data.layouts.landscape),
        portrait: cloneOrientationLayout(this.data.layouts.portrait),
      },
    };
  }

  applyCloudControls(raw?: {
    bindings?: Record<string, string>;
    touchLayouts?: Record<string, unknown>;
  } | null): void {
    if (!raw || typeof raw !== 'object') return;
    const nextBindings: KeyBindingsMap = { ...DEFAULT_KEY_BINDINGS };
    if (raw.bindings && typeof raw.bindings === 'object') {
      for (const action of Object.keys(DEFAULT_KEY_BINDINGS) as GameAction[]) {
        const val = raw.bindings[action];
        if (typeof val === 'string' && val.trim().length > 0 && val.trim().length <= 32) {
          nextBindings[action] = val.trim();
        }
      }
    }
    const touchRaw =
      raw.touchLayouts && typeof raw.touchLayouts === 'object'
        ? (raw.touchLayouts as {
            landscape?: Partial<OrientationControlLayout>;
            portrait?: Partial<OrientationControlLayout>;
          })
        : undefined;
    this.data = {
      keyBindings: nextBindings,
      layouts: {
        landscape: mergeOrientationLayout(createDefaultLandscapeLayout(), touchRaw?.landscape),
        portrait: mergeOrientationLayout(createDefaultPortraitLayout(), touchRaw?.portrait),
      },
    };
    this.save();
    this.emit();
  }

  resetAllToDefaults(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage removal errors
    }
    this.data = {
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
      layouts: {
        landscape: createDefaultLandscapeLayout(),
        portrait: createDefaultPortraitLayout(),
      },
    };
    this.emit();
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota restrictions
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }

  private load(): ControlSettingsData {
    const defaults: ControlSettingsData = {
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
      layouts: {
        landscape: createDefaultLandscapeLayout(),
        portrait: createDefaultPortraitLayout(),
      },
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacyRaw =
          localStorage.getItem(LEGACY_STORAGE_KEY_V2) ??
          localStorage.getItem(LEGACY_STORAGE_KEY_V1);
        if (legacyRaw) {
          const legacyParsed = JSON.parse(legacyRaw) as Partial<ControlSettingsData>;
          if (legacyParsed.keyBindings) {
            return {
              ...defaults,
              keyBindings: {
                ...defaults.keyBindings,
                ...legacyParsed.keyBindings,
              },
            };
          }
        }
        return defaults;
      }
      const parsed = JSON.parse(raw) as Partial<ControlSettingsData>;
      return {
        keyBindings: {
          ...defaults.keyBindings,
          ...(parsed.keyBindings || {}),
        },
        layouts: {
          landscape: mergeOrientationLayout(
            defaults.layouts.landscape,
            parsed.layouts?.landscape,
          ),
          portrait: mergeOrientationLayout(
            defaults.layouts.portrait,
            parsed.layouts?.portrait,
          ),
        },
      };
    } catch {
      return defaults;
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
