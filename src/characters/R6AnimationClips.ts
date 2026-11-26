import * as THREE from 'three';
import type { PlayerAnimationState } from '../player/IPlayerController';

export type R6BoneName =
  | 'Hips'
  | 'Spine'
  | 'Chest'
  | 'Neck'
  | 'Head'
  | 'LeftShoulder'
  | 'LeftUpperArm'
  | 'LeftForearm'
  | 'LeftHand'
  | 'RightShoulder'
  | 'RightUpperArm'
  | 'RightForearm'
  | 'RightHand'
  | 'LeftThigh'
  | 'LeftShin'
  | 'LeftFoot'
  | 'RightThigh'
  | 'RightShin'
  | 'RightFoot';

export type R6RigBones = Record<R6BoneName, THREE.Bone>;

export interface R6SkeletonBuild {
  skeleton: THREE.Skeleton;
  bones: R6RigBones;
  boneList: THREE.Bone[];
  hipsRestY: number;
}

export const R6_HIPS_REST_Y = 0.68;

/**
 * Builds the canonical Roblox R6 skeleton at 1.75m world height, feet flush at y = 0, facing +Z.
 * Anatomical sides follow Three.js right-handed +Z forward:
 *   -X = Anatomical RIGHT (trigger hand / RightShoulder..RightHand / RightThigh..RightFoot)
 *   +X = Anatomical LEFT  (support hand / LeftShoulder..LeftHand   / LeftThigh..LeftFoot)
 */
export function createR6Skeleton(widthScale = 1.0): R6SkeletonBuild {
  const ws = widthScale;

  const makeBone = (name: R6BoneName, x: number, y: number, z: number): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    return b;
  };

  const hipsRestY = R6_HIPS_REST_Y;
  const Hips = makeBone('Hips', 0, hipsRestY, 0);
  const Spine = makeBone('Spine', 0, 0.16, 0);
  const Chest = makeBone('Chest', 0, 0.24, 0);
  const Neck = makeBone('Neck', 0, 0.26, 0);
  const Head = makeBone('Head', 0, 0.04, 0);

  // Anatomical LEFT (+X)
  const LeftShoulder = makeBone('LeftShoulder', 0.165 * ws, 0.24, 0);
  const LeftUpperArm = makeBone('LeftUpperArm', 0.30 * ws, -0.02, 0);
  const LeftForearm = makeBone('LeftForearm', 0, -0.34, 0);
  const LeftHand = makeBone('LeftHand', 0, -0.28, 0);

  // Anatomical RIGHT (-X)
  const RightShoulder = makeBone('RightShoulder', -0.165 * ws, 0.24, 0);
  const RightUpperArm = makeBone('RightUpperArm', -0.30 * ws, -0.02, 0);
  const RightForearm = makeBone('RightForearm', 0, -0.34, 0);
  const RightHand = makeBone('RightHand', 0, -0.28, 0);

  // Anatomical LEFT leg (+X) & RIGHT leg (-X)
  const LeftThigh = makeBone('LeftThigh', 0.172 * ws, 0, 0);
  const LeftShin = makeBone('LeftShin', 0, -0.34, 0);
  const LeftFoot = makeBone('LeftFoot', 0, -0.22, 0);

  const RightThigh = makeBone('RightThigh', -0.172 * ws, 0, 0);
  const RightShin = makeBone('RightShin', 0, -0.34, 0);
  const RightFoot = makeBone('RightFoot', 0, -0.22, 0);

  Hips.add(Spine, LeftThigh, RightThigh);
  Spine.add(Chest);
  Chest.add(Neck, LeftShoulder, RightShoulder);
  Neck.add(Head);

  LeftShoulder.add(LeftUpperArm);
  LeftUpperArm.add(LeftForearm);
  LeftForearm.add(LeftHand);

  RightShoulder.add(RightUpperArm);
  RightUpperArm.add(RightForearm);
  RightForearm.add(RightHand);

  LeftThigh.add(LeftShin);
  LeftShin.add(LeftFoot);

  RightThigh.add(RightShin);
  RightShin.add(RightFoot);

  const boneList: THREE.Bone[] = [
    Hips,
    Spine,
    Chest,
    Neck,
    Head,
    LeftShoulder,
    LeftUpperArm,
    LeftForearm,
    LeftHand,
    RightShoulder,
    RightUpperArm,
    RightForearm,
    RightHand,
    LeftThigh,
    LeftShin,
    LeftFoot,
    RightThigh,
    RightShin,
    RightFoot,
  ];

  const bones: R6RigBones = {
    Hips,
    Spine,
    Chest,
    Neck,
    Head,
    LeftShoulder,
    LeftUpperArm,
    LeftForearm,
    LeftHand,
    RightShoulder,
    RightUpperArm,
    RightForearm,
    RightHand,
    LeftThigh,
    LeftShin,
    LeftFoot,
    RightThigh,
    RightShin,
    RightFoot,
  };

  Hips.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);

  return { skeleton, bones, boneList, hipsRestY };
}

type EulerPose = Partial<Record<R6BoneName, [number, number, number]>>;

interface KeyframeSpec {
  time: number;
  hipsPosOffset?: [number, number, number];
  pose: EulerPose;
}

const TEMP_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const TEMP_QUAT = new THREE.Quaternion();

function buildClip(
  name: string,
  duration: number,
  frames: KeyframeSpec[],
  hipsRestY = R6_HIPS_REST_Y,
): THREE.AnimationClip {
  const usedBones = new Set<R6BoneName>();
  let hasHipsPos = false;
  for (const f of frames) {
    if (f.hipsPosOffset) hasHipsPos = true;
    for (const key of Object.keys(f.pose) as R6BoneName[]) {
      usedBones.add(key);
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const times = frames.map((f) => f.time);

  if (hasHipsPos) {
    const values: number[] = [];
    for (const f of frames) {
      const off = f.hipsPosOffset ?? [0, 0, 0];
      values.push(off[0], hipsRestY + off[1], off[2]);
    }
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, values));
  }

  for (const boneName of usedBones) {
    const values: number[] = [];
    for (const f of frames) {
      const rot = f.pose[boneName] ?? [0, 0, 0];
      TEMP_EULER.set(rot[0], rot[1], rot[2], 'YXZ');
      TEMP_QUAT.setFromEuler(TEMP_EULER);
      values.push(TEMP_QUAT.x, TEMP_QUAT.y, TEMP_QUAT.z, TEMP_QUAT.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
  }

  return new THREE.AnimationClip(name, duration, tracks);
}

let CACHED_R6_IDLE_CLIP: THREE.AnimationClip | null = null;
let CACHED_R6_CLIPS: Record<PlayerAnimationState, THREE.AnimationClip> | null = null;

/**
 * Builds and caches ONLY the Idle animation clip for fast Lobby & preview thumbnail startup.
 */
export function getR6IdleClip(): THREE.AnimationClip {
  if (CACHED_R6_IDLE_CLIP) return CACHED_R6_IDLE_CLIP;

  // 1. IDLE: Clean confident Roblox R6 breathing & subtle look-around stance
  CACHED_R6_IDLE_CLIP = buildClip('Idle', 3.2, [
    {
      time: 0,
      hipsPosOffset: [0, -0.002, 0],
      pose: {
        Hips: [0.005, 0, 0],
        Spine: [0.012, 0.006, 0],
        Chest: [0.015, 0.008, 0],
        Neck: [-0.01, -0.006, 0],
        Head: [-0.01, -0.015, 0],
        LeftUpperArm: [0.03, 0, 0.095],
        LeftForearm: [-0.14, 0, -0.02],
        RightUpperArm: [0.03, 0, -0.095],
        RightForearm: [-0.14, 0, 0.02],
        LeftThigh: [-0.02, -0.02, 0.018],
        LeftShin: [0.04, 0, 0],
        LeftFoot: [-0.02, 0, 0],
        RightThigh: [-0.02, 0.02, -0.018],
        RightShin: [0.04, 0, 0],
        RightFoot: [-0.02, 0, 0],
      },
    },
    {
      time: 1.6,
      hipsPosOffset: [0, -0.006, 0],
      pose: {
        Hips: [0.008, 0, 0],
        Spine: [0.022, -0.008, 0],
        Chest: [0.025, -0.01, 0],
        Neck: [-0.012, 0.008, 0],
        Head: [0.005, 0.025, 0],
        LeftUpperArm: [0.05, 0, 0.115],
        LeftForearm: [-0.18, 0, -0.02],
        RightUpperArm: [0.05, 0, -0.115],
        RightForearm: [-0.18, 0, 0.02],
        LeftThigh: [-0.025, -0.02, 0.018],
        LeftShin: [0.05, 0, 0],
        LeftFoot: [-0.025, 0, 0],
        RightThigh: [-0.025, 0.02, -0.018],
        RightShin: [0.05, 0, 0],
        RightFoot: [-0.025, 0, 0],
      },
    },
    {
      time: 3.2,
      hipsPosOffset: [0, -0.002, 0],
      pose: {
        Hips: [0.005, 0, 0],
        Spine: [0.012, 0.006, 0],
        Chest: [0.015, 0.008, 0],
        Neck: [-0.01, -0.006, 0],
        Head: [-0.01, -0.015, 0],
        LeftUpperArm: [0.03, 0, 0.095],
        LeftForearm: [-0.14, 0, -0.02],
        RightUpperArm: [0.03, 0, -0.095],
        RightForearm: [-0.14, 0, 0.02],
        LeftThigh: [-0.02, -0.02, 0.018],
        LeftShin: [0.04, 0, 0],
        LeftFoot: [-0.02, 0, 0],
        RightThigh: [-0.02, 0.02, -0.018],
        RightShin: [0.04, 0, 0],
        RightFoot: [-0.02, 0, 0],
      },
    },
  ]);

  return CACHED_R6_IDLE_CLIP;
}

/**
 * Right-hand rule verification (Character faces +Z, +Y Up, Left=+X, Right=-X):
 *   Arm / Leg hanging along -Y:
 *     -X rotation swings limb FORWARD (+Z); +X swings BACKWARD (-Z)
 *     Shin +X bends knee BACKWARD
 *     Left (+X)  +Z abducts OUTWARD (+X);  Right (-X) -Z abducts OUTWARD (-X)
 *   Spine / Chest / Head rising along +Y:
 *     +X leans FORWARD (+Z); -X leans BACKWARD (-Z)
 *     +Y turns toward LEFT (+X); -Y turns toward RIGHT (-X)
 */
export function getR6AnimationClips(): Record<PlayerAnimationState, THREE.AnimationClip> {
  if (CACHED_R6_CLIPS) return CACHED_R6_CLIPS;

  const Idle = getR6IdleClip();

  // 2. WALK: Crisp Roblox R6 opposite-arm/leg swing with slight natural knee flexion
  const Walk = buildClip('Walk', 0.88, [
    {
      time: 0.0,
      hipsPosOffset: [0.008, -0.035, 0],
      pose: {
        Hips: [0.02, -0.07, 0.015],
        Spine: [0.035, 0.045, -0.012],
        Chest: [0.035, 0.025, 0],
        Neck: [-0.025, 0, 0],
        Head: [-0.035, 0, 0],
        LeftUpperArm: [0.42, 0, 0.09],
        LeftForearm: [-0.14, 0, 0],
        RightUpperArm: [-0.42, 0, -0.09],
        RightForearm: [-0.22, 0, 0],
        LeftThigh: [-0.52, 0, 0.01],
        LeftShin: [0.12, 0, 0],
        LeftFoot: [0.12, 0, 0],
        RightThigh: [0.42, 0, -0.01],
        RightShin: [0.34, 0, 0],
        RightFoot: [-0.2, 0, 0],
      },
    },
    {
      time: 0.22,
      hipsPosOffset: [0.004, 0.004, 0],
      pose: {
        Hips: [0.015, 0, 0],
        Spine: [0.025, 0, 0],
        Chest: [0.025, 0, 0],
        Neck: [-0.02, 0, 0],
        Head: [-0.025, 0, 0],
        LeftUpperArm: [0.02, 0, 0.09],
        LeftForearm: [-0.12, 0, 0],
        RightUpperArm: [0.02, 0, -0.09],
        RightForearm: [-0.12, 0, 0],
        LeftThigh: [-0.04, 0, 0.01],
        LeftShin: [0.08, 0, 0],
        LeftFoot: [-0.04, 0, 0],
        RightThigh: [-0.24, 0, -0.01],
        RightShin: [0.78, 0, 0],
        RightFoot: [-0.16, 0, 0],
      },
    },
    {
      time: 0.44,
      hipsPosOffset: [-0.008, -0.035, 0],
      pose: {
        Hips: [0.02, 0.07, -0.015],
        Spine: [0.035, -0.045, 0.012],
        Chest: [0.035, -0.025, 0],
        Neck: [-0.025, 0, 0],
        Head: [-0.035, 0, 0],
        LeftUpperArm: [-0.42, 0, 0.09],
        LeftForearm: [-0.22, 0, 0],
        RightUpperArm: [0.42, 0, -0.09],
        RightForearm: [-0.14, 0, 0],
        LeftThigh: [0.42, 0, 0.01],
        LeftShin: [0.34, 0, 0],
        LeftFoot: [-0.2, 0, 0],
        RightThigh: [-0.52, 0, -0.01],
        RightShin: [0.12, 0, 0],
        RightFoot: [0.12, 0, 0],
      },
    },
    {
      time: 0.66,
      hipsPosOffset: [-0.004, 0.004, 0],
      pose: {
        Hips: [0.015, 0, 0],
        Spine: [0.025, 0, 0],
        Chest: [0.025, 0, 0],
        Neck: [-0.02, 0, 0],
        Head: [-0.025, 0, 0],
        LeftUpperArm: [0.02, 0, 0.09],
        LeftForearm: [-0.12, 0, 0],
        RightUpperArm: [0.02, 0, -0.09],
        RightForearm: [-0.12, 0, 0],
        LeftThigh: [-0.24, 0, 0.01],
        LeftShin: [0.78, 0, 0],
        LeftFoot: [-0.16, 0, 0],
        RightThigh: [-0.04, 0, -0.01],
        RightShin: [0.08, 0, 0],
        RightFoot: [-0.04, 0, 0],
      },
    },
    {
      time: 0.88,
      hipsPosOffset: [0.008, -0.035, 0],
      pose: {
        Hips: [0.02, -0.07, 0.015],
        Spine: [0.035, 0.045, -0.012],
        Chest: [0.035, 0.025, 0],
        Neck: [-0.025, 0, 0],
        Head: [-0.035, 0, 0],
        LeftUpperArm: [0.42, 0, 0.09],
        LeftForearm: [-0.14, 0, 0],
        RightUpperArm: [-0.42, 0, -0.09],
        RightForearm: [-0.22, 0, 0],
        LeftThigh: [-0.52, 0, 0.01],
        LeftShin: [0.12, 0, 0],
        LeftFoot: [0.12, 0, 0],
        RightThigh: [0.42, 0, -0.01],
        RightShin: [0.34, 0, 0],
        RightFoot: [-0.2, 0, 0],
      },
    },
  ]);

  // 3. RUN: Energetic R6 sprint lean, pumped arms, lively stride bounce (head level & steady forward)
  const Run = buildClip('Run', 0.56, [
    {
      time: 0.0,
      hipsPosOffset: [0.01, -0.055, 0],
      pose: {
        Hips: [0.08, -0.1, 0.018],
        Spine: [0.09, 0.055, -0.014],
        Chest: [0.08, 0.045, -0.004],
        Neck: [-0.08, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [0.76, 0, 0.12],
        LeftForearm: [-0.88, 0, 0],
        RightUpperArm: [-0.8, 0, -0.12],
        RightForearm: [-1.04, 0, 0],
        LeftThigh: [-0.84, 0, 0.01],
        LeftShin: [0.28, 0, 0],
        LeftFoot: [0.18, 0, 0],
        RightThigh: [0.68, 0, -0.01],
        RightShin: [0.74, 0, 0],
        RightFoot: [-0.3, 0, 0],
      },
    },
    {
      time: 0.14,
      hipsPosOffset: [0.005, 0.014, 0],
      pose: {
        Hips: [0.075, 0, 0],
        Spine: [0.09, 0, 0],
        Chest: [0.08, 0, 0],
        Neck: [-0.08, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [0.04, 0, 0.12],
        LeftForearm: [-0.96, 0, 0],
        RightUpperArm: [0.04, 0, -0.12],
        RightForearm: [-0.96, 0, 0],
        LeftThigh: [-0.08, 0, 0.01],
        LeftShin: [0.18, 0, 0],
        LeftFoot: [-0.1, 0, 0],
        RightThigh: [-0.36, 0, -0.01],
        RightShin: [1.32, 0, 0],
        RightFoot: [-0.22, 0, 0],
      },
    },
    {
      time: 0.28,
      hipsPosOffset: [-0.01, -0.055, 0],
      pose: {
        Hips: [0.08, 0.1, -0.018],
        Spine: [0.09, -0.055, 0.014],
        Chest: [0.08, -0.045, 0.004],
        Neck: [-0.08, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [-0.8, 0, 0.12],
        LeftForearm: [-1.04, 0, 0],
        RightUpperArm: [0.76, 0, -0.12],
        RightForearm: [-0.88, 0, 0],
        LeftThigh: [0.68, 0, 0.01],
        LeftShin: [0.74, 0, 0],
        LeftFoot: [-0.3, 0, 0],
        RightThigh: [-0.84, 0, -0.01],
        RightShin: [0.28, 0, 0],
        RightFoot: [0.18, 0, 0],
      },
    },
    {
      time: 0.42,
      hipsPosOffset: [-0.005, 0.014, 0],
      pose: {
        Hips: [0.075, 0, 0],
        Spine: [0.09, 0, 0],
        Chest: [0.08, 0, 0],
        Neck: [-0.08, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [0.04, 0, 0.12],
        LeftForearm: [-0.96, 0, 0],
        RightUpperArm: [0.04, 0, -0.12],
        RightForearm: [-0.96, 0, 0],
        LeftThigh: [-0.36, 0, 0.01],
        LeftShin: [1.32, 0, 0],
        LeftFoot: [-0.22, 0, 0],
        RightThigh: [-0.08, 0, -0.01],
        RightShin: [0.18, 0, 0],
        RightFoot: [-0.1, 0, 0],
      },
    },
    {
      time: 0.56,
      hipsPosOffset: [0.01, -0.055, 0],
      pose: {
        Hips: [0.08, -0.1, 0.018],
        Spine: [0.09, 0.055, -0.014],
        Chest: [0.08, 0.045, -0.004],
        Neck: [-0.08, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [0.76, 0, 0.12],
        LeftForearm: [-0.88, 0, 0],
        RightUpperArm: [-0.8, 0, -0.12],
        RightForearm: [-1.04, 0, 0],
        LeftThigh: [-0.84, 0, 0.01],
        LeftShin: [0.28, 0, 0],
        LeftFoot: [0.18, 0, 0],
        RightThigh: [0.68, 0, -0.01],
        RightShin: [0.74, 0, 0],
        RightFoot: [-0.3, 0, 0],
      },
    },
  ]);

  // 4. JUMP: Iconic R6 raised arm upward launch with tucked knee and neutral upright head
  const Jump = buildClip('Jump', 0.65, [
    {
      time: 0,
      hipsPosOffset: [0, 0.03, 0],
      pose: {
        Hips: [0.03, 0, 0],
        Spine: [0.04, 0, 0],
        Chest: [0.02, 0, 0],
        Neck: [-0.03, 0, 0],
        Head: [-0.05, 0, 0],
        LeftUpperArm: [-1.25, 0, 0.28],
        LeftForearm: [-0.35, 0, 0],
        RightUpperArm: [-1.15, 0, -0.28],
        RightForearm: [-0.38, 0, 0],
        LeftThigh: [-0.66, 0, 0.04],
        LeftShin: [0.88, 0, 0],
        LeftFoot: [-0.15, 0, 0],
        RightThigh: [0.18, 0, -0.04],
        RightShin: [0.42, 0, 0],
        RightFoot: [-0.24, 0, 0],
      },
    },
    {
      time: 0.32,
      hipsPosOffset: [0, 0.06, 0],
      pose: {
        Hips: [0.02, 0, 0],
        Spine: [0.05, 0, 0],
        Chest: [0.01, 0, 0],
        Neck: [-0.03, 0, 0],
        Head: [-0.05, 0, 0],
        LeftUpperArm: [-1.75, 0, 0.34],
        LeftForearm: [-0.26, 0, 0],
        RightUpperArm: [-1.65, 0, -0.34],
        RightForearm: [-0.28, 0, 0],
        LeftThigh: [-0.58, 0, 0.05],
        LeftShin: [0.8, 0, 0],
        LeftFoot: [-0.14, 0, 0],
        RightThigh: [-0.08, 0, -0.05],
        RightShin: [0.54, 0, 0],
        RightFoot: [-0.22, 0, 0],
      },
    },
    {
      time: 0.65,
      hipsPosOffset: [0, 0.045, 0],
      pose: {
        Hips: [0.03, 0, 0],
        Spine: [0.05, 0, 0],
        Chest: [0.01, 0, 0],
        Neck: [-0.03, 0, 0],
        Head: [-0.05, 0, 0],
        LeftUpperArm: [-1.6, 0, 0.38],
        LeftForearm: [-0.28, 0, 0],
        RightUpperArm: [-1.52, 0, -0.38],
        RightForearm: [-0.3, 0, 0],
        LeftThigh: [-0.48, 0, 0.05],
        LeftShin: [0.68, 0, 0],
        LeftFoot: [-0.14, 0, 0],
        RightThigh: [-0.2, 0, -0.05],
        RightShin: [0.58, 0, 0],
        RightFoot: [-0.2, 0, 0],
      },
    },
  ]);

  // 5. FALL: Free-falling arms up/outward balance pose with explicit Hips stabilization
  const Fall = buildClip('Fall', 0.8, [
    {
      time: 0,
      hipsPosOffset: [0, 0.02, 0],
      pose: {
        Hips: [0.04, 0, 0],
        Spine: [0.07, 0, 0],
        Chest: [0.05, 0, 0],
        Neck: [-0.05, 0, 0],
        Head: [-0.09, 0, 0],
        LeftUpperArm: [-1.15, 0, 0.56],
        LeftForearm: [-0.32, 0, 0],
        RightUpperArm: [-1.1, 0, -0.56],
        RightForearm: [-0.32, 0, 0],
        LeftThigh: [-0.32, 0, 0.06],
        LeftShin: [0.56, 0, 0],
        LeftFoot: [-0.18, 0, 0],
        RightThigh: [0.16, 0, -0.06],
        RightShin: [0.42, 0, 0],
        RightFoot: [-0.16, 0, 0],
      },
    },
    {
      time: 0.4,
      hipsPosOffset: [0, 0.032, 0],
      pose: {
        Hips: [0.05, 0, 0],
        Spine: [0.08, 0, 0],
        Chest: [0.06, 0, 0],
        Neck: [-0.06, 0, 0],
        Head: [-0.1, 0, 0],
        LeftUpperArm: [-1.3, 0, 0.64],
        LeftForearm: [-0.28, 0, 0],
        RightUpperArm: [-1.25, 0, -0.64],
        RightForearm: [-0.28, 0, 0],
        LeftThigh: [-0.24, 0, 0.07],
        LeftShin: [0.64, 0, 0],
        LeftFoot: [-0.2, 0, 0],
        RightThigh: [0.22, 0, -0.07],
        RightShin: [0.48, 0, 0],
        RightFoot: [-0.18, 0, 0],
      },
    },
    {
      time: 0.8,
      hipsPosOffset: [0, 0.02, 0],
      pose: {
        Hips: [0.04, 0, 0],
        Spine: [0.07, 0, 0],
        Chest: [0.05, 0, 0],
        Neck: [-0.05, 0, 0],
        Head: [-0.09, 0, 0],
        LeftUpperArm: [-1.15, 0, 0.56],
        LeftForearm: [-0.32, 0, 0],
        RightUpperArm: [-1.1, 0, -0.56],
        RightForearm: [-0.32, 0, 0],
        LeftThigh: [-0.32, 0, 0.06],
        LeftShin: [0.56, 0, 0],
        LeftFoot: [-0.18, 0, 0],
        RightThigh: [0.16, 0, -0.06],
        RightShin: [0.42, 0, 0],
        RightFoot: [-0.16, 0, 0],
      },
    },
  ]);

  // 6. LAND: Crisp athletic knee-cushion landing compression (plays once & blends cleanly)
  const Land = buildClip('Land', 0.28, [
    {
      time: 0.0,
      hipsPosOffset: [0, -0.04, 0],
      pose: {
        Hips: [0.04, 0, 0],
        Spine: [0.08, 0, 0],
        Chest: [0.06, 0, 0],
        Neck: [-0.05, 0, 0],
        Head: [-0.1, 0, 0],
        LeftUpperArm: [-0.5, 0, 0.34],
        LeftForearm: [-0.3, 0, 0],
        RightUpperArm: [-0.5, 0, -0.34],
        RightForearm: [-0.3, 0, 0],
        LeftThigh: [-0.35, 0, 0.04],
        LeftShin: [0.65, 0, 0],
        LeftFoot: [-0.3, 0, 0],
        RightThigh: [-0.35, 0, -0.04],
        RightShin: [0.65, 0, 0],
        RightFoot: [-0.3, 0, 0],
      },
    },
    {
      time: 0.1,
      hipsPosOffset: [0, -0.11, 0],
      pose: {
        Hips: [0.07, 0, 0],
        Spine: [0.12, 0, 0],
        Chest: [0.1, 0, 0],
        Neck: [-0.09, 0, 0],
        Head: [-0.16, 0, 0],
        LeftUpperArm: [0.22, 0, 0.36],
        LeftForearm: [-0.55, 0, 0],
        RightUpperArm: [0.22, 0, -0.36],
        RightForearm: [-0.55, 0, 0],
        LeftThigh: [-0.64, 0, 0.04],
        LeftShin: [1.22, 0, 0],
        LeftFoot: [-0.58, 0, 0],
        RightThigh: [-0.64, 0, -0.04],
        RightShin: [1.22, 0, 0],
        RightFoot: [-0.58, 0, 0],
      },
    },
    {
      time: 0.28,
      hipsPosOffset: [0, -0.01, 0],
      pose: {
        Hips: [0.01, 0, 0],
        Spine: [0.02, 0, 0],
        Chest: [0.02, 0, 0],
        Neck: [-0.02, 0, 0],
        Head: [-0.02, 0, 0],
        LeftUpperArm: [0.04, 0, 0.12],
        LeftForearm: [-0.16, 0, 0],
        RightUpperArm: [0.04, 0, -0.12],
        RightForearm: [-0.16, 0, 0],
        LeftThigh: [-0.06, 0, 0.02],
        LeftShin: [0.12, 0, 0],
        LeftFoot: [-0.06, 0, 0],
        RightThigh: [-0.06, 0, -0.02],
        RightShin: [0.12, 0, 0],
        RightFoot: [-0.06, 0, 0],
      },
    },
  ]);

  // 7. CROUCH IDLE: Lowered R6 tactical crouch with soles planted at y = 0
  const CrouchIdle = buildClip('CrouchIdle', 2.8, [
    {
      time: 0,
      hipsPosOffset: [0, -0.19, -0.04],
      pose: {
        Hips: [0.06, 0.1, 0],
        Spine: [0.12, -0.05, 0],
        Chest: [0.12, -0.05, 0],
        Neck: [-0.14, 0, 0],
        Head: [-0.16, 0, 0],
        LeftUpperArm: [-0.12, 0, 0.18],
        LeftForearm: [-0.95, 0, -0.08],
        RightUpperArm: [-0.12, 0, -0.18],
        RightForearm: [-0.95, 0, 0.08],
        LeftThigh: [-0.78, -0.04, 0.1],
        LeftShin: [1.46, 0, 0],
        LeftFoot: [-0.74, 0, 0],
        RightThigh: [-1.02, 0.04, -0.1],
        RightShin: [1.42, 0, 0],
        RightFoot: [-0.46, 0, 0],
      },
    },
    {
      time: 1.4,
      hipsPosOffset: [0, -0.198, -0.04],
      pose: {
        Hips: [0.065, 0.09, 0],
        Spine: [0.13, -0.045, 0],
        Chest: [0.13, -0.045, 0],
        Neck: [-0.15, 0, 0],
        Head: [-0.17, -0.015, 0],
        LeftUpperArm: [-0.1, 0, 0.19],
        LeftForearm: [-0.98, 0, -0.08],
        RightUpperArm: [-0.1, 0, -0.19],
        RightForearm: [-0.98, 0, 0.08],
        LeftThigh: [-0.8, -0.04, 0.1],
        LeftShin: [1.5, 0, 0],
        LeftFoot: [-0.76, 0, 0],
        RightThigh: [-1.04, 0.04, -0.1],
        RightShin: [1.46, 0, 0],
        RightFoot: [-0.48, 0, 0],
      },
    },
    {
      time: 2.8,
      hipsPosOffset: [0, -0.19, -0.04],
      pose: {
        Hips: [0.06, 0.1, 0],
        Spine: [0.12, -0.05, 0],
        Chest: [0.12, -0.05, 0],
        Neck: [-0.14, 0, 0],
        Head: [-0.16, 0, 0],
        LeftUpperArm: [-0.12, 0, 0.18],
        LeftForearm: [-0.95, 0, -0.08],
        RightUpperArm: [-0.12, 0, -0.18],
        RightForearm: [-0.95, 0, 0.08],
        LeftThigh: [-0.78, -0.04, 0.1],
        LeftShin: [1.46, 0, 0],
        LeftFoot: [-0.74, 0, 0],
        RightThigh: [-1.02, 0.04, -0.1],
        RightShin: [1.42, 0, 0],
        RightFoot: [-0.46, 0, 0],
      },
    },
  ]);

  // 8. CROUCH WALK: Low stealth walk cycle keeping feet clear of ground
  const CrouchWalk = buildClip('CrouchWalk', 0.92, [
    {
      time: 0.0,
      hipsPosOffset: [0.01, -0.195, -0.04],
      pose: {
        Hips: [0.08, -0.06, 0.015],
        Spine: [0.12, 0.04, -0.01],
        Chest: [0.12, 0.04, 0],
        Neck: [-0.15, -0.01, 0],
        Head: [-0.17, -0.01, 0],
        LeftUpperArm: [0.04, 0, 0.18],
        LeftForearm: [-1.0, 0, -0.08],
        RightUpperArm: [-0.22, 0, -0.18],
        RightForearm: [-1.04, 0, 0.08],
        LeftThigh: [-1.12, 0, 0.1],
        LeftShin: [1.22, 0, 0],
        LeftFoot: [-0.18, 0, 0],
        RightThigh: [-0.7, 0, -0.1],
        RightShin: [1.46, 0, 0],
        RightFoot: [-0.76, 0, 0],
      },
    },
    {
      time: 0.23,
      hipsPosOffset: [0.008, -0.175, -0.04],
      pose: {
        Hips: [0.07, 0, 0],
        Spine: [0.11, 0, 0],
        Chest: [0.11, 0, 0],
        Neck: [-0.14, 0, 0],
        Head: [-0.16, 0, 0],
        LeftUpperArm: [-0.1, 0, 0.18],
        LeftForearm: [-0.96, 0, -0.08],
        RightUpperArm: [-0.1, 0, -0.18],
        RightForearm: [-0.96, 0, 0.08],
        LeftThigh: [-0.88, 0, 0.1],
        LeftShin: [1.44, 0, 0],
        LeftFoot: [-0.62, 0, 0],
        RightThigh: [-1.1, 0, -0.1],
        RightShin: [1.62, 0, 0],
        RightFoot: [-0.45, 0, 0],
      },
    },
    {
      time: 0.46,
      hipsPosOffset: [-0.01, -0.195, -0.04],
      pose: {
        Hips: [0.08, 0.06, -0.015],
        Spine: [0.12, -0.04, 0.01],
        Chest: [0.12, -0.04, 0],
        Neck: [-0.15, 0.01, 0],
        Head: [-0.17, 0.01, 0],
        LeftUpperArm: [-0.22, 0, 0.18],
        LeftForearm: [-1.04, 0, -0.08],
        RightUpperArm: [0.04, 0, -0.18],
        RightForearm: [-1.0, 0, 0.08],
        LeftThigh: [-0.7, 0, 0.1],
        LeftShin: [1.46, 0, 0],
        LeftFoot: [-0.76, 0, 0],
        RightThigh: [-1.12, 0, -0.1],
        RightShin: [1.22, 0, 0],
        RightFoot: [-0.18, 0, 0],
      },
    },
    {
      time: 0.69,
      hipsPosOffset: [-0.008, -0.175, -0.04],
      pose: {
        Hips: [0.07, 0, 0],
        Spine: [0.11, 0, 0],
        Chest: [0.11, 0, 0],
        Neck: [-0.14, 0, 0],
        Head: [-0.16, 0, 0],
        LeftUpperArm: [-0.1, 0, 0.18],
        LeftForearm: [-0.96, 0, -0.08],
        RightUpperArm: [-0.1, 0, -0.18],
        RightForearm: [-0.96, 0, 0.08],
        LeftThigh: [-1.1, 0, 0.1],
        LeftShin: [1.62, 0, 0],
        LeftFoot: [-0.45, 0, 0],
        RightThigh: [-0.88, 0, -0.1],
        RightShin: [1.44, 0, 0],
        RightFoot: [-0.62, 0, 0],
      },
    },
    {
      time: 0.92,
      hipsPosOffset: [0.01, -0.195, -0.04],
      pose: {
        Hips: [0.08, -0.06, 0.015],
        Spine: [0.12, 0.04, -0.01],
        Chest: [0.12, 0.04, 0],
        Neck: [-0.15, -0.01, 0],
        Head: [-0.17, -0.01, 0],
        LeftUpperArm: [0.04, 0, 0.18],
        LeftForearm: [-1.0, 0, -0.08],
        RightUpperArm: [-0.22, 0, -0.18],
        RightForearm: [-1.04, 0, 0.08],
        LeftThigh: [-1.12, 0, 0.1],
        LeftShin: [1.22, 0, 0],
        LeftFoot: [-0.18, 0, 0],
        RightThigh: [-0.7, 0, -0.1],
        RightShin: [1.46, 0, 0],
        RightFoot: [-0.76, 0, 0],
      },
    },
  ]);

  // 9. PRONE IDLE & MOVE (hips at ~0.27 above ground, head/neck naturally aligned along sagittal plane with zero off-axis roll)
  const ProneIdle = buildClip('ProneIdle', 2.4, [
    {
      time: 0,
      hipsPosOffset: [0, -0.41, 0],
      pose: {
        Hips: [1.44, 0, 0],
        Spine: [-0.1, 0, 0],
        Chest: [-0.18, 0, 0],
        Neck: [-0.42, 0, 0],
        Head: [-0.56, 0, 0],
        LeftUpperArm: [-2.18, 0.14, 0.28],
        LeftForearm: [-1.12, 0, -0.14],
        RightUpperArm: [-2.18, -0.14, -0.28],
        RightForearm: [-1.12, 0, 0.14],
        LeftThigh: [0.02, 0, 0.08],
        LeftShin: [0.12, 0, 0],
        LeftFoot: [0.55, 0, 0],
        RightThigh: [0.02, 0, -0.08],
        RightShin: [0.12, 0, 0],
        RightFoot: [0.55, 0, 0],
      },
    },
    {
      time: 1.2,
      hipsPosOffset: [0, -0.405, 0],
      pose: {
        Hips: [1.44, 0, 0],
        Spine: [-0.11, 0, 0],
        Chest: [-0.2, 0, 0],
        Neck: [-0.41, 0, 0],
        Head: [-0.54, 0, 0],
        LeftUpperArm: [-2.22, 0.14, 0.29],
        LeftForearm: [-1.14, 0, -0.14],
        RightUpperArm: [-2.22, -0.14, -0.29],
        RightForearm: [-1.14, 0, 0.14],
        LeftThigh: [0.03, 0, 0.08],
        LeftShin: [0.14, 0, 0],
        LeftFoot: [0.55, 0, 0],
        RightThigh: [0.03, 0, -0.08],
        RightShin: [0.14, 0, 0],
        RightFoot: [0.55, 0, 0],
      },
    },
    {
      time: 2.4,
      hipsPosOffset: [0, -0.41, 0],
      pose: {
        Hips: [1.44, 0, 0],
        Spine: [-0.1, 0, 0],
        Chest: [-0.18, 0, 0],
        Neck: [-0.42, 0, 0],
        Head: [-0.56, 0, 0],
        LeftUpperArm: [-2.18, 0.14, 0.28],
        LeftForearm: [-1.12, 0, -0.14],
        RightUpperArm: [-2.18, -0.14, -0.28],
        RightForearm: [-1.12, 0, 0.14],
        LeftThigh: [0.02, 0, 0.08],
        LeftShin: [0.12, 0, 0],
        LeftFoot: [0.55, 0, 0],
        RightThigh: [0.02, 0, -0.08],
        RightShin: [0.12, 0, 0],
        RightFoot: [0.55, 0, 0],
      },
    },
  ]);

  const ProneMove = buildClip('ProneMove', 0.96, [
    {
      time: 0,
      hipsPosOffset: [0, -0.38, 0],
      pose: {
        Hips: [1.44, 0, 0],
        Spine: [-0.1, 0, 0],
        Chest: [-0.18, 0, 0],
        Neck: [-0.42, 0, 0],
        Head: [-0.56, 0, 0],
        LeftUpperArm: [-2.44, 0.12, 0.28],
        LeftForearm: [-0.92, 0, -0.12],
        RightUpperArm: [-2.14, -0.14, -0.3],
        RightForearm: [-1.14, 0, 0.14],
        LeftThigh: [0.04, 0, 0.12],
        LeftShin: [0.16, 0, 0],
        LeftFoot: [0.52, 0, 0],
        RightThigh: [-0.26, 0, -0.22],
        RightShin: [0.68, 0, 0],
        RightFoot: [0.22, 0, 0],
      },
    },
    {
      time: 0.48,
      hipsPosOffset: [0, -0.38, 0],
      pose: {
        Hips: [1.44, 0, 0],
        Spine: [-0.11, 0, 0],
        Chest: [-0.19, 0, 0],
        Neck: [-0.41, 0, 0],
        Head: [-0.55, 0, 0],
        LeftUpperArm: [-2.14, 0.14, 0.3],
        LeftForearm: [-1.14, 0, -0.14],
        RightUpperArm: [-2.44, -0.12, -0.28],
        RightForearm: [-0.92, 0, 0.12],
        LeftThigh: [-0.26, 0, 0.22],
        LeftShin: [0.68, 0, 0],
        LeftFoot: [0.22, 0, 0],
        RightThigh: [0.04, 0, -0.12],
        RightShin: [0.16, 0, 0],
        RightFoot: [0.52, 0, 0],
      },
    },
    {
      time: 0.96,
      hipsPosOffset: [0, -0.38, 0],
      pose: {
        Hips: [1.44, 0, 0],
        Spine: [-0.1, 0, 0],
        Chest: [-0.18, 0, 0],
        Neck: [-0.42, 0, 0],
        Head: [-0.56, 0, 0],
        LeftUpperArm: [-2.44, 0.12, 0.28],
        LeftForearm: [-0.92, 0, -0.12],
        RightUpperArm: [-2.14, -0.14, -0.3],
        RightForearm: [-1.14, 0, 0.14],
        LeftThigh: [0.04, 0, 0.12],
        LeftShin: [0.16, 0, 0],
        LeftFoot: [0.52, 0, 0],
        RightThigh: [-0.26, 0, -0.22],
        RightShin: [0.68, 0, 0],
        RightFoot: [0.22, 0, 0],
      },
    },
  ]);

  // 10. SKYDIVE & PARACHUTE
  const Skydive = buildClip('Skydive', 0.9, [
    {
      time: 0,
      hipsPosOffset: [0, 0.08, 0],
      pose: {
        Hips: [1.18, 0, 0],
        Spine: [-0.14, 0, 0],
        Chest: [-0.16, 0, 0],
        Neck: [-0.24, 0, 0],
        Head: [-0.7, 0, 0],
        LeftUpperArm: [-0.42, 0, 1.05],
        LeftForearm: [-0.28, 0, 0.16],
        RightUpperArm: [-0.42, 0, -1.05],
        RightForearm: [-0.28, 0, -0.16],
        LeftThigh: [0.22, 0, 0.14],
        LeftShin: [0.42, 0, 0],
        RightThigh: [0.16, 0, -0.14],
        RightShin: [0.36, 0, 0],
      },
    },
    {
      time: 0.45,
      hipsPosOffset: [0, 0.1, 0],
      pose: {
        Hips: [1.22, 0, 0.04],
        Spine: [-0.16, 0, 0],
        Chest: [-0.18, 0, 0],
        Neck: [-0.26, 0, 0],
        Head: [-0.74, 0, 0],
        LeftUpperArm: [-0.34, 0, 1.15],
        LeftForearm: [-0.24, 0, 0.12],
        RightUpperArm: [-0.48, 0, -0.98],
        RightForearm: [-0.34, 0, -0.18],
        LeftThigh: [0.14, 0, 0.16],
        LeftShin: [0.48, 0, 0],
        RightThigh: [0.26, 0, -0.16],
        RightShin: [0.32, 0, 0],
      },
    },
    {
      time: 0.9,
      hipsPosOffset: [0, 0.08, 0],
      pose: {
        Hips: [1.18, 0, 0],
        Spine: [-0.14, 0, 0],
        Chest: [-0.16, 0, 0],
        Neck: [-0.24, 0, 0],
        Head: [-0.7, 0, 0],
        LeftUpperArm: [-0.42, 0, 1.05],
        LeftForearm: [-0.28, 0, 0.16],
        RightUpperArm: [-0.42, 0, -1.05],
        RightForearm: [-0.28, 0, -0.16],
        LeftThigh: [0.22, 0, 0.14],
        LeftShin: [0.42, 0, 0],
        RightThigh: [0.16, 0, -0.14],
        RightShin: [0.36, 0, 0],
      },
    },
  ]);

  const Parachute = buildClip('Parachute', 1.4, [
    {
      time: 0,
      hipsPosOffset: [0, 0, 0],
      pose: {
        Hips: [0.08, 0, 0],
        Spine: [0.04, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [-2.25, 0, 0.24],
        LeftForearm: [-0.35, 0, 0],
        RightUpperArm: [-2.25, 0, -0.24],
        RightForearm: [-0.35, 0, 0],
        LeftThigh: [-0.18, 0, 0.06],
        LeftShin: [0.34, 0, 0],
        RightThigh: [0.1, 0, -0.06],
        RightShin: [0.26, 0, 0],
      },
    },
    {
      time: 0.7,
      hipsPosOffset: [0, 0.02, 0],
      pose: {
        Hips: [0.1, 0, 0.03],
        Spine: [0.04, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.1, 0.05, 0],
        LeftUpperArm: [-2.2, 0, 0.26],
        LeftForearm: [-0.38, 0, 0],
        RightUpperArm: [-2.2, 0, -0.26],
        RightForearm: [-0.38, 0, 0],
        LeftThigh: [-0.1, 0, 0.05],
        LeftShin: [0.28, 0, 0],
        RightThigh: [0.18, 0, -0.05],
        RightShin: [0.36, 0, 0],
      },
    },
    {
      time: 1.4,
      hipsPosOffset: [0, 0, 0],
      pose: {
        Hips: [0.08, 0, 0],
        Spine: [0.04, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [-2.25, 0, 0.24],
        LeftForearm: [-0.35, 0, 0],
        RightUpperArm: [-2.25, 0, -0.24],
        RightForearm: [-0.35, 0, 0],
        LeftThigh: [-0.18, 0, 0.06],
        LeftShin: [0.34, 0, 0],
        RightThigh: [0.1, 0, -0.06],
        RightShin: [0.26, 0, 0],
      },
    },
  ]);

  // 11. OVERLAYS (Upper-body-only so legs keep walking/running/crouching cleanly!)
  const Shoot = buildClip('Shoot', 0.36, [
    {
      time: 0,
      pose: {
        Spine: [0.04, -0.08, 0],
        Chest: [0.04, -0.1, 0],
        Head: [-0.03, 0.02, 0],
        LeftShoulder: [0, -0.16, 0],
        LeftUpperArm: [-1.02, -0.34, 0.08],
        LeftForearm: [-0.58, 0, -0.12],
        RightShoulder: [0, 0.1, 0],
        RightUpperArm: [-1.22, 0.16, -0.08],
        RightForearm: [-0.38, 0, 0.08],
      },
    },
    {
      time: 0.09,
      pose: {
        Spine: [0.0, -0.08, 0],
        Chest: [-0.01, -0.1, 0],
        Head: [-0.055, 0.02, 0],
        LeftShoulder: [0, -0.16, 0],
        LeftUpperArm: [-1.14, -0.34, 0.08],
        LeftForearm: [-0.6, 0, -0.12],
        RightShoulder: [0, 0.1, 0],
        RightUpperArm: [-1.34, 0.16, -0.08],
        RightForearm: [-0.4, 0, 0.08],
      },
    },
    {
      time: 0.36,
      pose: {
        Spine: [0.04, -0.08, 0],
        Chest: [0.04, -0.1, 0],
        Head: [-0.03, 0.02, 0],
        LeftShoulder: [0, -0.16, 0],
        LeftUpperArm: [-1.02, -0.34, 0.08],
        LeftForearm: [-0.58, 0, -0.12],
        RightShoulder: [0, 0.1, 0],
        RightUpperArm: [-1.22, 0.16, -0.08],
        RightForearm: [-0.38, 0, 0.08],
      },
    },
  ]);

  const Reload = buildClip('Reload', 1.6, [
    {
      time: 0,
      pose: {
        Spine: [0.06, -0.06, 0],
        Chest: [0.06, -0.05, 0],
        Head: [0.1, 0.04, 0],
        LeftUpperArm: [-0.85, -0.3, 0.08],
        LeftForearm: [-0.7, 0, 0],
        RightUpperArm: [-0.88, 0.14, -0.08],
        RightForearm: [-0.5, 0, 0],
      },
    },
    {
      time: 0.48,
      pose: {
        Spine: [0.08, 0.05, 0],
        Chest: [0.08, 0.07, 0],
        Head: [0.16, 0.08, 0],
        LeftUpperArm: [-0.36, -0.14, 0.2],
        LeftForearm: [-0.92, 0, -0.1],
        RightUpperArm: [-0.82, 0.18, -0.08],
        RightForearm: [-0.58, 0, 0],
      },
    },
    {
      time: 1.05,
      pose: {
        Spine: [0.06, -0.05, 0],
        Chest: [0.06, -0.05, 0],
        Head: [0.1, 0.02, 0],
        LeftUpperArm: [-0.92, -0.34, 0.06],
        LeftForearm: [-0.8, 0, 0],
        RightUpperArm: [-0.9, 0.16, -0.08],
        RightForearm: [-0.52, 0, 0],
      },
    },
    {
      time: 1.6,
      pose: {
        Spine: [0.06, -0.06, 0],
        Chest: [0.06, -0.05, 0],
        Head: [0.1, 0.04, 0],
        LeftUpperArm: [-0.85, -0.3, 0.08],
        LeftForearm: [-0.7, 0, 0],
        RightUpperArm: [-0.88, 0.14, -0.08],
        RightForearm: [-0.5, 0, 0],
      },
    },
  ]);

  // PunchLeft: Left Arm (+X) punches forward (+Z); torso rotates RIGHT (-Y)
  const PunchLeft = buildClip('PunchLeft', 0.34, [
    {
      time: 0,
      pose: {
        Spine: [0.05, -0.16, 0],
        Chest: [0.05, -0.2, 0],
        Head: [0, 0.22, 0],
        LeftUpperArm: [-0.4, 0, 0.2],
        LeftForearm: [-1.25, 0, 0],
        RightUpperArm: [-0.95, 0.2, -0.16],
        RightForearm: [-1.35, 0, 0],
      },
    },
    {
      time: 0.14,
      pose: {
        Spine: [0.14, 0.22, 0],
        Chest: [0.12, 0.32, 0],
        Head: [-0.08, -0.38, 0],
        LeftShoulder: [0, -0.22, 0],
        LeftUpperArm: [-1.52, -0.1, 0.04],
        LeftForearm: [-0.1, 0, 0],
        RightUpperArm: [-0.9, 0.18, -0.16],
        RightForearm: [-1.45, 0, 0],
      },
    },
    {
      time: 0.34,
      pose: {
        Spine: [0.05, 0, 0],
        Chest: [0.04, 0, 0],
        Head: [0, 0, 0],
        LeftUpperArm: [-0.75, -0.1, 0.14],
        LeftForearm: [-1.2, 0, 0],
        RightUpperArm: [-0.82, 0.1, -0.14],
        RightForearm: [-1.2, 0, 0],
      },
    },
  ]);

  // PunchRight: Right Arm (-X) punches forward (+Z); torso rotates LEFT (+Y)
  const PunchRight = buildClip('PunchRight', 0.34, [
    {
      time: 0,
      pose: {
        Spine: [0.05, 0.16, 0],
        Chest: [0.05, 0.2, 0],
        Head: [0, -0.22, 0],
        RightUpperArm: [-0.4, 0, -0.2],
        RightForearm: [-1.25, 0, 0],
        LeftUpperArm: [-0.95, -0.2, 0.16],
        LeftForearm: [-1.35, 0, 0],
      },
    },
    {
      time: 0.14,
      pose: {
        Spine: [0.14, -0.22, 0],
        Chest: [0.12, -0.32, 0],
        Head: [-0.08, 0.38, 0],
        RightShoulder: [0, 0.22, 0],
        RightUpperArm: [-1.52, 0.1, -0.04],
        RightForearm: [-0.1, 0, 0],
        LeftUpperArm: [-0.9, -0.18, 0.16],
        LeftForearm: [-1.45, 0, 0],
      },
    },
    {
      time: 0.34,
      pose: {
        Spine: [0.05, 0, 0],
        Chest: [0.04, 0, 0],
        Head: [0, 0, 0],
        RightUpperArm: [-0.75, 0.1, -0.14],
        RightForearm: [-1.2, 0, 0],
        LeftUpperArm: [-0.82, -0.1, 0.14],
        LeftForearm: [-1.2, 0, 0],
      },
    },
  ]);

  // 12. VAULT, SIT, ZIPLINE, SWIM, DEATH
  const Vault = buildClip('Vault', 0.52, [
    {
      time: 0,
      hipsPosOffset: [0, 0.04, 0],
      pose: {
        Hips: [0.18, 0, 0],
        Spine: [0.24, 0, 0],
        Chest: [0.18, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.26, 0, 0],
        LeftUpperArm: [-1.18, 0, 0.18],
        LeftForearm: [-0.28, 0, 0],
        RightUpperArm: [-1.18, 0, -0.18],
        RightForearm: [-0.28, 0, 0],
        LeftThigh: [-0.84, 0, 0.08],
        LeftShin: [1.34, 0, 0],
        LeftFoot: [-0.28, 0, 0],
        RightThigh: [-0.52, 0, -0.08],
        RightShin: [1.1, 0, 0],
        RightFoot: [-0.22, 0, 0],
      },
    },
    {
      time: 0.26,
      hipsPosOffset: [0, 0.14, 0],
      pose: {
        Hips: [0.34, 0, 0],
        Spine: [0.22, 0, 0],
        Chest: [0.16, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.34, 0, 0],
        LeftUpperArm: [-0.62, 0, 0.26],
        LeftForearm: [-0.75, 0, 0],
        RightUpperArm: [-0.62, 0, -0.26],
        RightForearm: [-0.75, 0, 0],
        LeftThigh: [-1.42, 0, 0.12],
        LeftShin: [1.85, 0, 0],
        LeftFoot: [-0.32, 0, 0],
        RightThigh: [-1.22, 0, -0.12],
        RightShin: [1.74, 0, 0],
        RightFoot: [-0.28, 0, 0],
      },
    },
    {
      time: 0.52,
      hipsPosOffset: [0, -0.06, 0],
      pose: {
        Hips: [0.06, 0, 0],
        Spine: [0.08, 0, 0],
        Chest: [0.05, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.08, 0, 0],
        LeftUpperArm: [0.08, 0, 0.15],
        LeftForearm: [-0.4, 0, 0],
        RightUpperArm: [0.08, 0, -0.15],
        RightForearm: [-0.4, 0, 0],
        LeftThigh: [-0.22, 0, 0.04],
        LeftShin: [0.32, 0, 0],
        LeftFoot: [-0.1, 0, 0],
        RightThigh: [-0.22, 0, -0.04],
        RightShin: [0.32, 0, 0],
        RightFoot: [-0.1, 0, 0],
      },
    },
  ]);

  const Sit = buildClip('Sit', 2.4, [
    {
      time: 0,
      hipsPosOffset: [0, -0.34, 0],
      pose: {
        Hips: [-0.08, 0, 0],
        Spine: [-0.04, 0, 0],
        Chest: [0.02, 0, 0],
        Neck: [0, 0, 0],
        Head: [0.04, 0, 0],
        LeftUpperArm: [-0.36, -0.18, 0.24],
        LeftForearm: [-0.9, 0, 0],
        RightUpperArm: [-0.36, 0.18, -0.24],
        RightForearm: [-0.9, 0, 0],
        LeftThigh: [-1.45, 0, 0.08],
        LeftShin: [1.45, 0, 0],
        LeftFoot: [-0.04, 0, 0],
        RightThigh: [-1.45, 0, -0.08],
        RightShin: [1.45, 0, 0],
        RightFoot: [-0.04, 0, 0],
      },
    },
    {
      time: 1.2,
      hipsPosOffset: [0, -0.34, 0],
      pose: {
        Hips: [-0.08, 0, 0],
        Spine: [-0.03, 0, 0],
        Chest: [0.03, 0, 0],
        Neck: [0, 0, 0],
        Head: [0.05, 0.04, 0],
        LeftUpperArm: [-0.38, -0.18, 0.25],
        LeftForearm: [-0.92, 0, 0],
        RightUpperArm: [-0.38, 0.18, -0.25],
        RightForearm: [-0.92, 0, 0],
        LeftThigh: [-1.45, 0, 0.08],
        LeftShin: [1.45, 0, 0],
        LeftFoot: [-0.04, 0, 0],
        RightThigh: [-1.45, 0, -0.08],
        RightShin: [1.45, 0, 0],
        RightFoot: [-0.04, 0, 0],
      },
    },
    {
      time: 2.4,
      hipsPosOffset: [0, -0.34, 0],
      pose: {
        Hips: [-0.08, 0, 0],
        Spine: [-0.04, 0, 0],
        Chest: [0.02, 0, 0],
        Neck: [0, 0, 0],
        Head: [0.04, 0, 0],
        LeftUpperArm: [-0.36, -0.18, 0.24],
        LeftForearm: [-0.9, 0, 0],
        RightUpperArm: [-0.36, 0.18, -0.24],
        RightForearm: [-0.9, 0, 0],
        LeftThigh: [-1.45, 0, 0.08],
        LeftShin: [1.45, 0, 0],
        LeftFoot: [-0.04, 0, 0],
        RightThigh: [-1.45, 0, -0.08],
        RightShin: [1.45, 0, 0],
        RightFoot: [-0.04, 0, 0],
      },
    },
  ]);

  const Zipline = buildClip('Zipline', 0.9, [
    {
      time: 0,
      hipsPosOffset: [0, 0.02, 0],
      pose: {
        Hips: [0.08, 0, 0],
        Spine: [0.04, 0, 0],
        Chest: [0.04, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [-2.65, 0, 0.14],
        LeftForearm: [-0.22, 0, 0],
        RightUpperArm: [-2.65, 0, -0.14],
        RightForearm: [-0.22, 0, 0],
        LeftThigh: [-0.36, 0, 0.06],
        LeftShin: [0.68, 0, 0],
        LeftFoot: [-0.14, 0, 0],
        RightThigh: [-0.14, 0, -0.06],
        RightShin: [0.44, 0, 0],
        RightFoot: [-0.18, 0, 0],
      },
    },
    {
      time: 0.45,
      hipsPosOffset: [0, 0.03, 0],
      pose: {
        Hips: [0.1, 0, 0.02],
        Spine: [0.05, 0, 0],
        Chest: [0.04, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.14, 0, 0],
        LeftUpperArm: [-2.68, 0, 0.14],
        LeftForearm: [-0.24, 0, 0],
        RightUpperArm: [-2.68, 0, -0.14],
        RightForearm: [-0.24, 0, 0],
        LeftThigh: [-0.42, 0, 0.06],
        LeftShin: [0.76, 0, 0],
        LeftFoot: [-0.16, 0, 0],
        RightThigh: [-0.2, 0, -0.06],
        RightShin: [0.52, 0, 0],
        RightFoot: [-0.16, 0, 0],
      },
    },
    {
      time: 0.9,
      hipsPosOffset: [0, 0.02, 0],
      pose: {
        Hips: [0.08, 0, 0],
        Spine: [0.04, 0, 0],
        Chest: [0.04, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.12, 0, 0],
        LeftUpperArm: [-2.65, 0, 0.14],
        LeftForearm: [-0.22, 0, 0],
        RightUpperArm: [-2.65, 0, -0.14],
        RightForearm: [-0.22, 0, 0],
        LeftThigh: [-0.36, 0, 0.06],
        LeftShin: [0.68, 0, 0],
        LeftFoot: [-0.14, 0, 0],
        RightThigh: [-0.14, 0, -0.06],
        RightShin: [0.44, 0, 0],
        RightFoot: [-0.18, 0, 0],
      },
    },
  ]);

  const SwimIdle = buildClip('SwimIdle', 1.6, [
    {
      time: 0,
      hipsPosOffset: [0, -0.05, 0],
      pose: {
        Hips: [0.15, 0, 0],
        Spine: [0.08, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.18, 0, 0],
        LeftUpperArm: [-0.45, 0, 0.72],
        LeftForearm: [-0.55, 0, 0],
        RightUpperArm: [-0.45, 0, -0.72],
        RightForearm: [-0.55, 0, 0],
        LeftThigh: [-0.35, 0, 0.08],
        LeftShin: [0.65, 0, 0],
        RightThigh: [0.22, 0, -0.08],
        RightShin: [0.45, 0, 0],
      },
    },
    {
      time: 0.8,
      hipsPosOffset: [0, 0.02, 0],
      pose: {
        Hips: [0.18, 0, 0],
        Spine: [0.1, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.2, 0, 0],
        LeftUpperArm: [-0.65, 0, 0.45],
        LeftForearm: [-0.4, 0, 0],
        RightUpperArm: [-0.65, 0, -0.45],
        RightForearm: [-0.4, 0, 0],
        LeftThigh: [0.22, 0, 0.08],
        LeftShin: [0.45, 0, 0],
        RightThigh: [-0.35, 0, -0.08],
        RightShin: [0.65, 0, 0],
      },
    },
    {
      time: 1.6,
      hipsPosOffset: [0, -0.05, 0],
      pose: {
        Hips: [0.15, 0, 0],
        Spine: [0.08, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.18, 0, 0],
        LeftUpperArm: [-0.45, 0, 0.72],
        LeftForearm: [-0.55, 0, 0],
        RightUpperArm: [-0.45, 0, -0.72],
        RightForearm: [-0.55, 0, 0],
        LeftThigh: [-0.35, 0, 0.08],
        LeftShin: [0.65, 0, 0],
        RightThigh: [0.22, 0, -0.08],
        RightShin: [0.45, 0, 0],
      },
    },
  ]);

  const SwimMove = buildClip('SwimMove', 1.0, [
    {
      time: 0,
      hipsPosOffset: [0, -0.1, 0],
      pose: {
        Hips: [1.1, 0, 0.12],
        Spine: [-0.1, 0.14, 0],
        Chest: [-0.12, 0.16, 0],
        Neck: [-0.32, 0, 0],
        Head: [-0.85, -0.22, 0],
        LeftUpperArm: [-2.1, 0, 0.4],
        LeftForearm: [-0.35, 0, 0],
        RightUpperArm: [0.35, 0, -0.35],
        RightForearm: [-0.45, 0, 0],
        LeftThigh: [-0.25, 0, 0.06],
        LeftShin: [0.45, 0, 0],
        RightThigh: [0.3, 0, -0.06],
        RightShin: [0.3, 0, 0],
      },
    },
    {
      time: 0.5,
      hipsPosOffset: [0, -0.1, 0],
      pose: {
        Hips: [1.1, 0, -0.12],
        Spine: [-0.1, -0.14, 0],
        Chest: [-0.12, -0.16, 0],
        Neck: [-0.32, 0, 0],
        Head: [-0.85, 0.22, 0],
        LeftUpperArm: [0.35, 0, 0.35],
        LeftForearm: [-0.45, 0, 0],
        RightUpperArm: [-2.1, 0, -0.4],
        RightForearm: [-0.35, 0, 0],
        LeftThigh: [0.3, 0, 0.06],
        LeftShin: [0.3, 0, 0],
        RightThigh: [-0.25, 0, -0.06],
        RightShin: [0.45, 0, 0],
      },
    },
    {
      time: 1.0,
      hipsPosOffset: [0, -0.1, 0],
      pose: {
        Hips: [1.1, 0, 0.12],
        Spine: [-0.1, 0.14, 0],
        Chest: [-0.12, 0.16, 0],
        Neck: [-0.32, 0, 0],
        Head: [-0.85, -0.22, 0],
        LeftUpperArm: [-2.1, 0, 0.4],
        LeftForearm: [-0.35, 0, 0],
        RightUpperArm: [0.35, 0, -0.35],
        RightForearm: [-0.45, 0, 0],
        LeftThigh: [-0.25, 0, 0.06],
        LeftShin: [0.45, 0, 0],
        RightThigh: [0.3, 0, -0.06],
        RightShin: [0.3, 0, 0],
      },
    },
  ]);

  const Death = buildClip('Death', 1.05, [
    {
      time: 0,
      hipsPosOffset: [0, 0, 0],
      pose: {
        Hips: [0, 0, 0],
        Spine: [-0.08, 0, 0],
        Chest: [-0.08, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.18, 0, 0],
        LeftThigh: [-0.15, 0, 0.05],
        LeftShin: [0.36, 0, 0],
        RightThigh: [-0.1, 0, -0.05],
        RightShin: [0.28, 0, 0],
      },
    },
    {
      time: 0.42,
      hipsPosOffset: [0, -0.32, -0.14],
      pose: {
        Hips: [-0.75, 0.06, 0.1],
        Spine: [-0.24, 0, 0],
        Chest: [-0.2, 0, 0],
        Neck: [0, 0, 0],
        Head: [-0.35, -0.15, 0],
        LeftUpperArm: [-0.45, 0, 0.55],
        RightUpperArm: [-0.4, 0, -0.5],
        LeftThigh: [-0.22, 0, 0.12],
        LeftShin: [0.5, 0, 0],
        RightThigh: [0.1, 0, -0.12],
        RightShin: [0.34, 0, 0],
      },
    },
    {
      time: 1.05,
      hipsPosOffset: [0, -0.37, -0.26],
      pose: {
        Hips: [-1.48, 0.08, 0.05],
        Spine: [0.06, 0, 0],
        Chest: [0.06, 0, 0],
        Neck: [0, 0, 0],
        Head: [0.14, -0.16, 0],
        LeftUpperArm: [0.35, 0, 0.72],
        LeftForearm: [-0.45, 0, 0],
        RightUpperArm: [0.32, 0, -0.68],
        RightForearm: [-0.48, 0, 0],
        LeftThigh: [-0.14, 0, 0.14],
        LeftShin: [0.22, 0, 0],
        RightThigh: [0.06, 0, -0.12],
        RightShin: [0.16, 0, 0],
      },
    },
  ]);

  CACHED_R6_CLIPS = {
    Idle,
    Walk,
    Run,
    Jump,
    Fall,
    Land,
    CrouchIdle,
    CrouchWalk,
    ProneIdle,
    ProneMove,
    Shoot,
    Reload,
    PunchLeft,
    PunchRight,
    Vault,
    Sit,
    Zipline,
    Skydive,
    Parachute,
    Death,
    SwimIdle,
    SwimMove,
  };

  return CACHED_R6_CLIPS;
}
