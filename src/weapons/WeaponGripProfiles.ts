import * as THREE from 'three';

export type WeaponHoldStyle =
  | 'rifle'
  | 'lmg'
  | 'sniper'
  | 'smg'
  | 'shotgun'
  | 'pistol'
  | 'knife'
  | 'bat';

export type LeftGripStyle = 'underbarrel' | 'vertical_foregrip' | 'pistol_cup' | 'handle' | 'none';

export type WeaponStanceKind =
  | 'lobby'
  | 'idle'
  | 'walk'
  | 'run'
  | 'aim'
  | 'crouch'
  | 'crouch_aim'
  | 'jump'
  | 'prone'
  | 'prone_aim';

export interface WeaponStanceAnchor {
  /** Desired weapon grip-root position relative to Chest pivot in Aim-Yaw aligned space (meters). */
  pos: readonly [number, number, number];
  /** Desired weapon Euler (YXZ, radians) relative to Aim-Yaw aligned forward (+Z). */
  rot: readonly [number, number, number];
  /** Additional upper-torso Y blading (rad, split across Spine + Chest; Head counter-rotates). */
  torsoYaw: number;
  /** Subtle extra chest forward lean (rad). */
  torsoPitch: number;
}

export interface BackMountProfile {
  /** Base offset relative to back holster mount (x multiplied by slot sideSign). */
  pos: readonly [number, number, number];
  /** Euler angles (x, y * sideSign, z * sideSign) aligning weapon cleanly along diagonal back sling. */
  rot: readonly [number, number, number];
  scale: number;
}

export interface WeaponGripProfile {
  weaponId: string;
  holdStyle: WeaponHoldStyle;
  twoHanded: boolean;
  leftGripStyle: LeftGripStyle;
  /** Right (trigger) hand palm contact point in Weapon.mesh local space. */
  rightGripLocal: readonly [number, number, number];
  /** Left (support) hand palm contact point in Weapon.mesh local space. */
  leftGripLocal: readonly [number, number, number];
  /** Right hand wrist roll bias (rad) around barrel axis for ergonomic pistol grip wrist posture. */
  rightWristRoll: number;
  /** Left hand grip radius offset perpendicular to barrel (so glove fingers wrap cleanly around rail, not inside barrel). */
  leftSurfaceOffset: readonly [number, number, number];
  /** Back holster placement profile when weapon is stowed on character's back. */
  backMount?: BackMountProfile;
  /** Stance targets by combat/lobby state. */
  stances: Record<WeaponStanceKind, WeaponStanceAnchor>;
}

export const BACK_MOUNT_BY_HOLD_STYLE: Record<WeaponHoldStyle, BackMountProfile> = {
  rifle: {
    pos: [0.05, -0.02, -0.018],
    rot: [0.16, -Math.PI / 2, 0],
    scale: 0.86,
  },
  lmg: {
    pos: [0.038, -0.03, -0.022],
    rot: [0.16, -Math.PI / 2, 0],
    scale: 0.84,
  },
  sniper: {
    pos: [0.03, -0.035, -0.022],
    rot: [0.16, -Math.PI / 2, 0],
    scale: 0.82,
  },
  smg: {
    pos: [0.055, -0.012, -0.016],
    rot: [0.16, -Math.PI / 2, 0],
    scale: 0.88,
  },
  shotgun: {
    pos: [0.045, -0.02, -0.018],
    rot: [0.16, -Math.PI / 2, 0],
    scale: 0.86,
  },
  pistol: {
    pos: [0.085, 0.01, -0.014],
    rot: [0.12, -Math.PI / 2, 0],
    scale: 0.94,
  },
  knife: {
    pos: [-0.04, -0.015, -0.014],
    rot: [-0.36, 0, Math.PI / 2],
    scale: 0.95,
  },
  bat: {
    pos: [0.14, -0.055, -0.02],
    rot: [-0.52, 0, Math.PI / 2],
    scale: 0.82,
  },
};

const DEFAULT_RIFLE_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.21, -0.02, 0.29],
    rot: [0.18, 0.78, -0.1],
    torsoYaw: -0.22,
    torsoPitch: 0.02,
  },
  idle: {
    pos: [-0.21, -0.01, 0.29],
    rot: [0.12, 0.68, -0.08],
    torsoYaw: -0.28,
    torsoPitch: 0.04,
  },
  walk: {
    pos: [-0.21, -0.014, 0.295],
    rot: [0.14, 0.72, -0.09],
    torsoYaw: -0.26,
    torsoPitch: 0.05,
  },
  run: {
    pos: [-0.215, 0.005, 0.315],
    rot: [0.12, 0.92, -0.22],
    torsoYaw: -0.2,
    torsoPitch: 0.08,
  },
  aim: {
    pos: [-0.19, 0.052, 0.285],
    rot: [-0.015, 0.22, -0.03],
    torsoYaw: -0.38,
    torsoPitch: 0.05,
  },
  crouch: {
    pos: [-0.205, 0.002, 0.295],
    rot: [0.06, 0.56, -0.06],
    torsoYaw: -0.3,
    torsoPitch: 0.02,
  },
  crouch_aim: {
    pos: [-0.188, 0.054, 0.29],
    rot: [-0.015, 0.2, -0.025],
    torsoYaw: -0.36,
    torsoPitch: 0.02,
  },
  jump: {
    pos: [-0.215, 0.008, 0.29],
    rot: [0.12, 0.72, -0.12],
    torsoYaw: -0.24,
    torsoPitch: 0.04,
  },
  prone: {
    pos: [-0.19, 0.036, 0.33],
    rot: [-0.02, 0.28, -0.04],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.18, 0.054, 0.335],
    rot: [-0.018, 0.16, -0.02],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const LMG_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.22, -0.032, 0.285],
    rot: [0.16, 0.82, -0.1],
    torsoYaw: -0.24,
    torsoPitch: 0.03,
  },
  idle: {
    pos: [-0.215, -0.022, 0.285],
    rot: [0.11, 0.72, -0.08],
    torsoYaw: -0.3,
    torsoPitch: 0.05,
  },
  walk: {
    pos: [-0.215, -0.025, 0.29],
    rot: [0.13, 0.76, -0.09],
    torsoYaw: -0.28,
    torsoPitch: 0.06,
  },
  run: {
    pos: [-0.22, -0.008, 0.31],
    rot: [0.12, 0.96, -0.22],
    torsoYaw: -0.22,
    torsoPitch: 0.09,
  },
  aim: {
    pos: [-0.195, 0.046, 0.28],
    rot: [-0.015, 0.22, -0.025],
    torsoYaw: -0.4,
    torsoPitch: 0.06,
  },
  crouch: {
    pos: [-0.21, -0.008, 0.29],
    rot: [0.06, 0.58, -0.06],
    torsoYaw: -0.32,
    torsoPitch: 0.03,
  },
  crouch_aim: {
    pos: [-0.192, 0.048, 0.285],
    rot: [-0.015, 0.2, -0.025],
    torsoYaw: -0.38,
    torsoPitch: 0.03,
  },
  jump: {
    pos: [-0.22, -0.002, 0.288],
    rot: [0.12, 0.75, -0.12],
    torsoYaw: -0.26,
    torsoPitch: 0.05,
  },
  prone: {
    pos: [-0.195, 0.03, 0.33],
    rot: [-0.02, 0.28, -0.03],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.184, 0.048, 0.335],
    rot: [-0.018, 0.16, -0.02],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const SNIPER_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.215, -0.022, 0.285],
    rot: [0.2, 0.8, -0.12],
    torsoYaw: -0.24,
    torsoPitch: 0.02,
  },
  idle: {
    pos: [-0.21, -0.01, 0.285],
    rot: [0.12, 0.7, -0.08],
    torsoYaw: -0.3,
    torsoPitch: 0.03,
  },
  walk: {
    pos: [-0.21, -0.014, 0.29],
    rot: [0.14, 0.74, -0.1],
    torsoYaw: -0.28,
    torsoPitch: 0.04,
  },
  run: {
    pos: [-0.215, 0.002, 0.31],
    rot: [0.14, 0.94, -0.24],
    torsoYaw: -0.22,
    torsoPitch: 0.08,
  },
  aim: {
    pos: [-0.19, 0.056, 0.282],
    rot: [-0.015, 0.2, -0.02],
    torsoYaw: -0.4,
    torsoPitch: 0.05,
  },
  crouch: {
    pos: [-0.205, 0.002, 0.29],
    rot: [0.05, 0.56, -0.05],
    torsoYaw: -0.32,
    torsoPitch: 0.02,
  },
  crouch_aim: {
    pos: [-0.188, 0.058, 0.288],
    rot: [-0.015, 0.18, -0.02],
    torsoYaw: -0.38,
    torsoPitch: 0.02,
  },
  jump: {
    pos: [-0.215, 0.008, 0.29],
    rot: [0.12, 0.74, -0.12],
    torsoYaw: -0.26,
    torsoPitch: 0.04,
  },
  prone: {
    pos: [-0.19, 0.038, 0.33],
    rot: [-0.02, 0.26, -0.03],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.18, 0.058, 0.335],
    rot: [-0.018, 0.14, -0.02],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const SMG_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.2, -0.018, 0.295],
    rot: [0.16, 0.72, -0.1],
    torsoYaw: -0.22,
    torsoPitch: 0.02,
  },
  idle: {
    pos: [-0.2, -0.008, 0.298],
    rot: [0.1, 0.62, -0.07],
    torsoYaw: -0.28,
    torsoPitch: 0.04,
  },
  walk: {
    pos: [-0.2, -0.012, 0.302],
    rot: [0.12, 0.66, -0.08],
    torsoYaw: -0.26,
    torsoPitch: 0.05,
  },
  run: {
    pos: [-0.205, 0.006, 0.318],
    rot: [0.1, 0.88, -0.2],
    torsoYaw: -0.2,
    torsoPitch: 0.08,
  },
  aim: {
    pos: [-0.185, 0.052, 0.292],
    rot: [-0.01, 0.2, -0.03],
    torsoYaw: -0.36,
    torsoPitch: 0.05,
  },
  crouch: {
    pos: [-0.198, 0.004, 0.3],
    rot: [0.05, 0.52, -0.06],
    torsoYaw: -0.3,
    torsoPitch: 0.02,
  },
  crouch_aim: {
    pos: [-0.184, 0.054, 0.298],
    rot: [-0.01, 0.18, -0.025],
    torsoYaw: -0.34,
    torsoPitch: 0.02,
  },
  jump: {
    pos: [-0.205, 0.01, 0.3],
    rot: [0.1, 0.68, -0.1],
    torsoYaw: -0.24,
    torsoPitch: 0.04,
  },
  prone: {
    pos: [-0.188, 0.036, 0.335],
    rot: [-0.018, 0.24, -0.03],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.178, 0.054, 0.34],
    rot: [-0.015, 0.14, -0.02],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const SHOTGUN_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.21, -0.022, 0.29],
    rot: [0.18, 0.76, -0.1],
    torsoYaw: -0.22,
    torsoPitch: 0.02,
  },
  idle: {
    pos: [-0.21, -0.01, 0.29],
    rot: [0.11, 0.66, -0.08],
    torsoYaw: -0.28,
    torsoPitch: 0.04,
  },
  walk: {
    pos: [-0.21, -0.014, 0.295],
    rot: [0.13, 0.7, -0.09],
    torsoYaw: -0.26,
    torsoPitch: 0.05,
  },
  run: {
    pos: [-0.215, 0.005, 0.315],
    rot: [0.12, 0.9, -0.22],
    torsoYaw: -0.2,
    torsoPitch: 0.08,
  },
  aim: {
    pos: [-0.188, 0.05, 0.285],
    rot: [-0.01, 0.2, -0.025],
    torsoYaw: -0.38,
    torsoPitch: 0.05,
  },
  crouch: {
    pos: [-0.205, 0.002, 0.295],
    rot: [0.06, 0.54, -0.06],
    torsoYaw: -0.3,
    torsoPitch: 0.02,
  },
  crouch_aim: {
    pos: [-0.186, 0.052, 0.29],
    rot: [-0.01, 0.18, -0.025],
    torsoYaw: -0.36,
    torsoPitch: 0.02,
  },
  jump: {
    pos: [-0.212, 0.008, 0.292],
    rot: [0.1, 0.7, -0.1],
    torsoYaw: -0.24,
    torsoPitch: 0.04,
  },
  prone: {
    pos: [-0.19, 0.036, 0.33],
    rot: [-0.02, 0.26, -0.04],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.18, 0.052, 0.335],
    rot: [-0.018, 0.14, -0.02],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const PISTOL_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.12, -0.04, 0.27],
    rot: [0.24, 0.22, -0.04],
    torsoYaw: -0.14,
    torsoPitch: 0.02,
  },
  idle: {
    pos: [-0.095, 0.01, 0.33],
    rot: [0.06, 0.14, -0.02],
    torsoYaw: -0.18,
    torsoPitch: 0.03,
  },
  walk: {
    pos: [-0.105, 0.0, 0.32],
    rot: [0.08, 0.18, -0.04],
    torsoYaw: -0.16,
    torsoPitch: 0.04,
  },
  run: {
    pos: [-0.11, 0.02, 0.27],
    rot: [0.28, 0.45, -0.12],
    torsoYaw: -0.15,
    torsoPitch: 0.07,
  },
  aim: {
    pos: [-0.075, 0.068, 0.37],
    rot: [-0.01, 0.08, 0.0],
    torsoYaw: -0.22,
    torsoPitch: 0.04,
  },
  crouch: {
    pos: [-0.09, 0.018, 0.34],
    rot: [0.02, 0.12, -0.02],
    torsoYaw: -0.18,
    torsoPitch: 0.02,
  },
  crouch_aim: {
    pos: [-0.075, 0.068, 0.37],
    rot: [-0.01, 0.07, 0.0],
    torsoYaw: -0.2,
    torsoPitch: 0.02,
  },
  jump: {
    pos: [-0.105, 0.02, 0.31],
    rot: [0.12, 0.22, -0.06],
    torsoYaw: -0.16,
    torsoPitch: 0.04,
  },
  prone: {
    pos: [-0.088, 0.042, 0.33],
    rot: [-0.015, 0.08, 0.0],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.075, 0.062, 0.35],
    rot: [-0.012, 0.05, 0.0],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const BAT_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.135, -0.05, 0.21],
    rot: [-0.62, 0.42, -0.28],
    torsoYaw: -0.22,
    torsoPitch: 0.02,
  },
  idle: {
    pos: [-0.13, -0.04, 0.22],
    rot: [-0.55, 0.38, -0.25],
    torsoYaw: -0.26,
    torsoPitch: 0.03,
  },
  walk: {
    pos: [-0.135, -0.045, 0.22],
    rot: [-0.5, 0.42, -0.28],
    torsoYaw: -0.22,
    torsoPitch: 0.05,
  },
  run: {
    pos: [-0.14, -0.025, 0.2],
    rot: [-0.42, 0.68, -0.36],
    torsoYaw: -0.2,
    torsoPitch: 0.08,
  },
  aim: {
    pos: [-0.12, 0.01, 0.23],
    rot: [-0.72, 0.28, -0.18],
    torsoYaw: -0.3,
    torsoPitch: 0.05,
  },
  crouch: {
    pos: [-0.125, -0.024, 0.225],
    rot: [-0.52, 0.34, -0.22],
    torsoYaw: -0.26,
    torsoPitch: 0.02,
  },
  crouch_aim: {
    pos: [-0.118, 0.016, 0.235],
    rot: [-0.7, 0.26, -0.18],
    torsoYaw: -0.28,
    torsoPitch: 0.02,
  },
  jump: {
    pos: [-0.14, -0.015, 0.21],
    rot: [-0.58, 0.44, -0.28],
    torsoYaw: -0.22,
    torsoPitch: 0.04,
  },
  prone: {
    pos: [-0.13, 0.02, 0.24],
    rot: [-0.45, 0.3, -0.18],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.12, 0.035, 0.25],
    rot: [-0.55, 0.22, -0.14],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const KNIFE_STANCES: Record<WeaponStanceKind, WeaponStanceAnchor> = {
  lobby: {
    pos: [-0.22, -0.1, 0.16],
    rot: [0.18, 0.15, 0.18],
    torsoYaw: -0.16,
    torsoPitch: 0.02,
  },
  idle: {
    pos: [-0.22, -0.06, 0.22],
    rot: [0.08, 0.12, 0.15],
    torsoYaw: -0.2,
    torsoPitch: 0.03,
  },
  walk: {
    pos: [-0.225, -0.07, 0.21],
    rot: [0.12, 0.14, 0.16],
    torsoYaw: -0.15,
    torsoPitch: 0.04,
  },
  run: {
    pos: [-0.23, -0.05, 0.18],
    rot: [0.32, 0.18, 0.2],
    torsoYaw: -0.12,
    torsoPitch: 0.08,
  },
  aim: {
    pos: [-0.19, 0.01, 0.26],
    rot: [-0.08, 0.1, 0.12],
    torsoYaw: -0.24,
    torsoPitch: 0.05,
  },
  crouch: {
    pos: [-0.21, -0.03, 0.23],
    rot: [0.04, 0.12, 0.14],
    torsoYaw: -0.2,
    torsoPitch: 0.02,
  },
  crouch_aim: {
    pos: [-0.188, 0.015, 0.265],
    rot: [-0.08, 0.1, 0.12],
    torsoYaw: -0.22,
    torsoPitch: 0.02,
  },
  jump: {
    pos: [-0.23, -0.03, 0.21],
    rot: [0.14, 0.16, 0.18],
    torsoYaw: -0.18,
    torsoPitch: 0.04,
  },
  prone: {
    pos: [-0.2, 0.02, 0.26],
    rot: [0.02, 0.12, 0.1],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
  prone_aim: {
    pos: [-0.18, 0.04, 0.28],
    rot: [-0.04, 0.08, 0.08],
    torsoYaw: 0.0,
    torsoPitch: 0.0,
  },
};

const PROFILES: Record<string, WeaponGripProfile> = {
  scar: {
    weaponId: 'scar',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.058, -0.004],
    leftGripLocal: [0, 0.024, 0.265],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  ak24: {
    weaponId: 'ak24',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.056, -0.008],
    leftGripLocal: [0, 0.014, 0.265],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  parafal: {
    weaponId: 'parafal',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.058, -0.008],
    leftGripLocal: [0, 0.02, 0.275],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  m4a1: {
    weaponId: 'm4a1',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'vertical_foregrip',
    rightGripLocal: [0, -0.056, -0.008],
    leftGripLocal: [0, -0.026, 0.285],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.016, -0.004, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  awm: {
    weaponId: 'awm',
    holdStyle: 'sniper',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.056, -0.008],
    leftGripLocal: [0, 0.014, 0.265],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SNIPER_STANCES,
  },
  kar98k: {
    weaponId: 'kar98k',
    holdStyle: 'sniper',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.034, -0.032],
    leftGripLocal: [0, 0.006, 0.255],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.018, -0.018, 0],
    stances: SNIPER_STANCES,
  },
  m1014: {
    weaponId: 'm1014',
    holdStyle: 'shotgun',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.054, -0.008],
    leftGripLocal: [0, 0.008, 0.275],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SHOTGUN_STANCES,
  },
  m1887: {
    weaponId: 'm1887',
    holdStyle: 'shotgun',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.026, -0.02],
    leftGripLocal: [0, 0.008, 0.255],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SHOTGUN_STANCES,
  },
  ump: {
    weaponId: 'ump',
    holdStyle: 'smg',
    twoHanded: true,
    leftGripStyle: 'vertical_foregrip',
    rightGripLocal: [0, -0.055, -0.008],
    leftGripLocal: [0, -0.026, 0.256],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.016, -0.004, 0],
    stances: SMG_STANCES,
  },
  mp5: {
    weaponId: 'mp5',
    holdStyle: 'smg',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.055, -0.008],
    leftGripLocal: [0, 0.014, 0.27],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.018, -0.018, 0],
    stances: SMG_STANCES,
  },
  mp40: {
    weaponId: 'mp40',
    holdStyle: 'smg',
    twoHanded: true,
    leftGripStyle: 'vertical_foregrip',
    rightGripLocal: [0, -0.054, -0.008],
    leftGripLocal: [0, -0.022, 0.245],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.016, -0.006, 0],
    stances: SMG_STANCES,
  },
  desert_eagle: {
    weaponId: 'desert_eagle',
    holdStyle: 'pistol',
    twoHanded: true,
    leftGripStyle: 'pistol_cup',
    rightGripLocal: [0, -0.048, -0.008],
    leftGripLocal: [0, -0.052, 0.004],
    rightWristRoll: -0.04,
    leftSurfaceOffset: [0.02, -0.004, 0.006],
    stances: PISTOL_STANCES,
  },
  glock: {
    weaponId: 'glock',
    holdStyle: 'pistol',
    twoHanded: true,
    leftGripStyle: 'pistol_cup',
    rightGripLocal: [0, -0.044, -0.008],
    leftGripLocal: [0, -0.048, 0.004],
    rightWristRoll: -0.04,
    leftSurfaceOffset: [0.018, -0.004, 0.006],
    stances: PISTOL_STANCES,
  },
  combat_knife: {
    weaponId: 'combat_knife',
    holdStyle: 'knife',
    twoHanded: false,
    leftGripStyle: 'none',
    rightGripLocal: [0, -0.025, 0.015],
    leftGripLocal: [0, 0, 0],
    rightWristRoll: 0.08,
    leftSurfaceOffset: [0, 0, 0],
    stances: KNIFE_STANCES,
  },
  baseball_bat: {
    weaponId: 'baseball_bat',
    holdStyle: 'bat',
    twoHanded: true,
    leftGripStyle: 'handle',
    rightGripLocal: [0, -0.01, 0.025],
    leftGripLocal: [0, 0.068, 0.075],
    rightWristRoll: 0.1,
    leftSurfaceOffset: [0.015, 0.006, -0.008],
    stances: BAT_STANCES,
  },
  famas: {
    weaponId: 'famas',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.054, 0.018],
    leftGripLocal: [0, 0.016, 0.24],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  aug: {
    weaponId: 'aug',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'vertical_foregrip',
    rightGripLocal: [0, -0.054, 0.032],
    leftGripLocal: [0, -0.034, 0.248],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.016, -0.004, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  groza: {
    weaponId: 'groza',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.054, 0.158],
    leftGripLocal: [0, 0.014, 0.34],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  an94: {
    weaponId: 'an94',
    holdStyle: 'rifle',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.056, -0.008],
    leftGripLocal: [0, 0.016, 0.285],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: DEFAULT_RIFLE_STANCES,
  },
  vector: {
    weaponId: 'vector',
    holdStyle: 'smg',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.052, -0.006],
    leftGripLocal: [0, -0.018, 0.215],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.018, -0.016, 0],
    stances: SMG_STANCES,
  },
  p90: {
    weaponId: 'p90',
    holdStyle: 'smg',
    twoHanded: true,
    leftGripStyle: 'handle',
    rightGripLocal: [0, -0.046, 0.088],
    leftGripLocal: [0, -0.044, 0.215],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.016, -0.008, 0],
    stances: SMG_STANCES,
  },
  thompson: {
    weaponId: 'thompson',
    holdStyle: 'smg',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.056, -0.006],
    leftGripLocal: [0, 0.008, 0.295],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.018, -0.018, 0],
    stances: SMG_STANCES,
  },
  spas12: {
    weaponId: 'spas12',
    holdStyle: 'shotgun',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.054, -0.008],
    leftGripLocal: [0, 0.008, 0.29],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SHOTGUN_STANCES,
  },
  double_barrel: {
    weaponId: 'double_barrel',
    holdStyle: 'shotgun',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.026, -0.02],
    leftGripLocal: [0, 0.008, 0.24],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SHOTGUN_STANCES,
  },
  m24: {
    weaponId: 'm24',
    holdStyle: 'sniper',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.044, -0.022],
    leftGripLocal: [0, 0.012, 0.27],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SNIPER_STANCES,
  },
  svd: {
    weaponId: 'svd',
    holdStyle: 'sniper',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.052, -0.01],
    leftGripLocal: [0, 0.018, 0.29],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SNIPER_STANCES,
  },
  vss: {
    weaponId: 'vss',
    holdStyle: 'sniper',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.048, -0.008],
    leftGripLocal: [0, 0.018, 0.25],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SNIPER_STANCES,
  },
  dragunov: {
    weaponId: 'dragunov',
    holdStyle: 'sniper',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.054, -0.01],
    leftGripLocal: [0, 0.02, 0.3],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: SNIPER_STANCES,
  },
  usp: {
    weaponId: 'usp',
    holdStyle: 'pistol',
    twoHanded: true,
    leftGripStyle: 'pistol_cup',
    rightGripLocal: [0, -0.046, -0.008],
    leftGripLocal: [0, -0.05, 0.004],
    rightWristRoll: -0.04,
    leftSurfaceOffset: [0.018, -0.004, 0.006],
    stances: PISTOL_STANCES,
  },
  m1917: {
    weaponId: 'm1917',
    holdStyle: 'pistol',
    twoHanded: true,
    leftGripStyle: 'pistol_cup',
    rightGripLocal: [0, -0.044, -0.014],
    leftGripLocal: [0, -0.048, -0.002],
    rightWristRoll: -0.04,
    leftSurfaceOffset: [0.018, -0.004, 0.006],
    stances: PISTOL_STANCES,
  },
  m249: {
    weaponId: 'm249',
    holdStyle: 'lmg',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.058, -0.01],
    leftGripLocal: [0, 0.016, 0.34],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.022, -0.02, 0],
    stances: LMG_STANCES,
  },
  m60: {
    weaponId: 'm60',
    holdStyle: 'lmg',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.058, -0.01],
    leftGripLocal: [0, 0.018, 0.35],
    rightWristRoll: -0.06,
    leftSurfaceOffset: [0.022, -0.02, 0],
    stances: LMG_STANCES,
  },
  dp28: {
    weaponId: 'dp28',
    holdStyle: 'lmg',
    twoHanded: true,
    leftGripStyle: 'underbarrel',
    rightGripLocal: [0, -0.034, -0.028],
    leftGripLocal: [0, 0.022, 0.35],
    rightWristRoll: -0.05,
    leftSurfaceOffset: [0.02, -0.018, 0],
    stances: LMG_STANCES,
  },
};

const FALLBACK_PROFILE: WeaponGripProfile = {
  ...PROFILES.scar,
  weaponId: 'default',
};

export function getWeaponGripProfile(weaponId: string | null | undefined): WeaponGripProfile {
  if (!weaponId) return FALLBACK_PROFILE;
  return PROFILES[weaponId] ?? FALLBACK_PROFILE;
}

export function getWeaponBackMountProfile(weaponId: string | null | undefined): BackMountProfile {
  const profile = getWeaponGripProfile(weaponId);
  return profile.backMount ?? BACK_MOUNT_BY_HOLD_STYLE[profile.holdStyle];
}

/** Anatomical RIGHT trigger glove palm grip center in triggerHandBone (-X chain) local coordinates, calibrated for R6 block hands. */
export const RIGHT_HAND_PALM_LOCAL = new THREE.Vector3(0.045, -0.072, 0.025);

/** Anatomical LEFT support glove palm grip center in supportHandBone (+X chain) local coordinates, calibrated for R6 block hands. */
export const LEFT_HAND_PALM_LOCAL = new THREE.Vector3(-0.045, -0.072, 0.025);

/** Base rotation of weaponSocket relative to trigger hand so weapon +Z aims out along Hand -Y and +Y toward Hand +Z. */
export const WEAPON_SOCKET_BASE_ROT_X = 1.48;

/**
 * Computes exact weaponSocket local position & Euler on the anatomical right trigger hand
 * so the weapon's rightGripLocal sits right at the right glove palm center.
 */
export function computeWeaponSocketTransform(
  profile: WeaponGripProfile,
  outPos: THREE.Vector3,
  outEuler: THREE.Euler,
): void {
  const [gx, gy, gz] = profile.rightGripLocal;
  const rx = WEAPON_SOCKET_BASE_ROT_X;
  const c = Math.cos(rx);
  const s = Math.sin(rx);
  const rgy = gy * c - gz * s;
  const rgz = gy * s + gz * c;
  outPos.set(
    RIGHT_HAND_PALM_LOCAL.x - gx,
    RIGHT_HAND_PALM_LOCAL.y - rgy,
    RIGHT_HAND_PALM_LOCAL.z - rgz,
  );
  outEuler.set(rx, 0, profile.rightWristRoll, 'YXZ');
}
