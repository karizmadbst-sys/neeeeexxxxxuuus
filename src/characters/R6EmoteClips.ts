import * as THREE from 'three';
import { R6_HIPS_REST_Y, type R6BoneName } from './R6AnimationClips';

type EulerPose = Partial<Record<R6BoneName, [number, number, number]>>;

interface EmoteKeyframe {
  time: number;
  hipsPosOffset?: [number, number, number];
  pose: EulerPose;
}

const TEMP_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const TEMP_QUAT = new THREE.Quaternion();

const ALL_EMOTE_BONES: readonly R6BoneName[] = [
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftUpperArm',
  'LeftForearm',
  'LeftHand',
  'RightShoulder',
  'RightUpperArm',
  'RightForearm',
  'RightHand',
  'LeftThigh',
  'LeftShin',
  'LeftFoot',
  'RightThigh',
  'RightShin',
  'RightFoot',
];

export const NEUTRAL_POSE: EulerPose = {
  Hips: [0.005, 0, 0],
  Spine: [0.012, 0, 0],
  Chest: [0.015, 0, 0],
  Neck: [-0.01, 0, 0],
  Head: [-0.01, 0, 0],
  LeftShoulder: [0, 0, 0],
  LeftUpperArm: [0.03, 0, 0.095],
  LeftForearm: [-0.14, 0, -0.02],
  LeftHand: [0, 0, 0],
  RightShoulder: [0, 0, 0],
  RightUpperArm: [0.03, 0, -0.095],
  RightForearm: [-0.14, 0, 0.02],
  RightHand: [0, 0, 0],
  LeftThigh: [-0.02, -0.02, 0.018],
  LeftShin: [0.04, 0, 0],
  LeftFoot: [-0.02, 0, 0],
  RightThigh: [-0.02, 0.02, -0.018],
  RightShin: [0.04, 0, 0],
  RightFoot: [-0.02, 0, 0],
};

function clampPoseLimits(bone: R6BoneName, rot: [number, number, number]): [number, number, number] {
  // Keep Shin knee bend >= 0.02 so knees never hyper-extend backward
  if (bone === 'LeftShin' || bone === 'RightShin') {
    return [Math.max(0.02, Math.min(2.25, rot[0])), rot[1], rot[2]];
  }
  return rot;
}

function buildEmoteClip(
  name: string,
  duration: number,
  frames: EmoteKeyframe[],
): THREE.AnimationClip {
  // Guarantee exact start & end neutral keyframes at t=0 and t=duration for smooth Idle crossfade
  const sorted = [...frames].sort((a, b) => a.time - b.time);
  if (sorted.length === 0 || sorted[0].time > 0.001) {
    sorted.unshift({ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  } else {
    sorted[0] = { time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } };
  }
  const last = sorted[sorted.length - 1];
  if (last.time < duration - 0.001) {
    sorted.push({ time: duration, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  } else {
    sorted[sorted.length - 1] = {
      time: duration,
      hipsPosOffset: [0, 0, 0],
      pose: { ...NEUTRAL_POSE },
    };
  }

  const usedBones = new Set<R6BoneName>(ALL_EMOTE_BONES);
  const tracks: THREE.KeyframeTrack[] = [];
  const times = sorted.map((f) => f.time);

  // Always include Hips.position track so pelvis height / lateral groove resets cleanly
  const posValues: number[] = [];
  for (const f of sorted) {
    const off = f.hipsPosOffset ?? [0, 0, 0];
    posValues.push(off[0], R6_HIPS_REST_Y + off[1], off[2]);
  }
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, posValues));

  for (const boneName of usedBones) {
    const values: number[] = [];
    let prevQx = 0;
    let prevQy = 0;
    let prevQz = 0;
    let prevQw = 1;
    let hasPrev = false;

    for (const f of sorted) {
      const raw = f.pose[boneName] ?? NEUTRAL_POSE[boneName] ?? [0, 0, 0];
      const rot = clampPoseLimits(boneName, raw);
      TEMP_EULER.set(rot[0], rot[1], rot[2], 'YXZ');
      TEMP_QUAT.setFromEuler(TEMP_EULER);

      // Keep quaternion hemisphere continuous across consecutive keyframes so slerp never flips
      if (hasPrev) {
        const dot =
          prevQx * TEMP_QUAT.x +
          prevQy * TEMP_QUAT.y +
          prevQz * TEMP_QUAT.z +
          prevQw * TEMP_QUAT.w;
        if (dot < 0) {
          TEMP_QUAT.x = -TEMP_QUAT.x;
          TEMP_QUAT.y = -TEMP_QUAT.y;
          TEMP_QUAT.z = -TEMP_QUAT.z;
          TEMP_QUAT.w = -TEMP_QUAT.w;
        }
      }
      prevQx = TEMP_QUAT.x;
      prevQy = TEMP_QUAT.y;
      prevQz = TEMP_QUAT.z;
      prevQw = TEMP_QUAT.w;
      hasPrev = true;

      values.push(TEMP_QUAT.x, TEMP_QUAT.y, TEMP_QUAT.z, TEMP_QUAT.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
  }

  return new THREE.AnimationClip(name, duration, tracks);
}

const EMOTE_CLIP_CACHE = new Map<string, THREE.AnimationClip>();

export function getR6EmoteThumbnailTime(emoteId: string): number {
  switch (emoteId) {
    case 'dance-floss':
      return 0.74;
    case 'dance-take-the-l':
      return 0.56;
    case 'dance-orange-justice':
      return 0.52;
    case 'dance-renegade':
      return 0.85;
    case 'dance-griddy':
      return 0.94;
    case 'dance-gangnam-style':
      return 3.45;
    case 'dance-macarena':
      return 2.65;
    case 'dance-electro-shuffle':
      return 0.72;
    default:
      return 1.0;
  }
}

export function getR6EmoteClip(emoteId: string): THREE.AnimationClip | null {
  const cached = EMOTE_CLIP_CACHE.get(emoteId);
  if (cached) return cached;

  const clip = createEmoteClipById(emoteId);
  if (clip) {
    EMOTE_CLIP_CACHE.set(emoteId, clip);
  }
  return clip;
}

// =============================================================================
// 1. FLOSS DANCE (122 BPM, 10.0s)
// Iconic alternating front/behind straight-arm pendulum with counter-hip thrusts
// =============================================================================
function createFlossFrames(): EmoteKeyframe[] {
  const beat = 60 / 122; // ~0.4918s
  const half = beat * 0.5; // ~0.2459s
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const flossCenter: EulerPose = {
    Hips: [0.04, 0, 0],
    Spine: [0.06, 0, 0],
    Chest: [0.06, 0, 0],
    Head: [-0.03, 0, 0],
    LeftUpperArm: [-0.18, 0, 0.35],
    LeftForearm: [-0.08, 0, 0],
    RightUpperArm: [-0.18, 0, -0.35],
    RightForearm: [-0.08, 0, 0],
    LeftThigh: [-0.22, 0, 0.14],
    LeftShin: [0.42, 0, 0],
    LeftFoot: [-0.2, 0, 0],
    RightThigh: [-0.22, 0, -0.14],
    RightShin: [0.42, 0, 0],
    RightFoot: [-0.2, 0, 0],
  };

  // Sequence of alternating poses across each swing:
  // Pattern: Left-Front/Right-Back -> Right-Back -> Right-Front/Left-Back -> Left-Front -> repeat
  const steps: Array<{ hipX: number; hipY: number; hipZ: number; pose: EulerPose }> = [
    // Step 0: Hips thrust RIGHT (-X), Both arms swing LEFT (+X) with Right IN FRONT, Left BEHIND
    {
      hipX: -0.1,
      hipY: -0.055,
      hipZ: 0.14,
      pose: {
        Hips: [0.05, 0.12, 0.14],
        Spine: [0.07, -0.06, -0.08],
        Chest: [0.08, -0.08, -0.08],
        Head: [-0.04, -0.04, 0.03],
        LeftUpperArm: [0.46, 0.18, 0.52],
        LeftForearm: [-0.12, 0, 0],
        LeftHand: [0, 0, -0.1],
        RightUpperArm: [-0.62, -0.32, 0.45],
        RightForearm: [-0.16, 0, 0],
        RightHand: [0, 0, 0.12],
        LeftThigh: [-0.28, 0, 0.2],
        LeftShin: [0.54, 0, 0],
        LeftFoot: [-0.26, 0, 0],
        RightThigh: [-0.18, 0, -0.06],
        RightShin: [0.36, 0, 0],
        RightFoot: [-0.18, 0, 0],
      },
    },
    // Step 1: Pass through center bounce
    {
      hipX: 0,
      hipY: -0.02,
      hipZ: 0,
      pose: {
        ...flossCenter,
        LeftUpperArm: [-0.42, 0.25, 0.12],
        RightUpperArm: [0.38, -0.25, -0.12],
      },
    },
    // Step 2: Hips thrust LEFT (+X), Both arms swing RIGHT (-X) with Left IN FRONT, Right BEHIND
    {
      hipX: 0.1,
      hipY: -0.055,
      hipZ: -0.14,
      pose: {
        Hips: [0.05, -0.12, -0.14],
        Spine: [0.07, 0.06, 0.08],
        Chest: [0.08, 0.08, 0.08],
        Head: [-0.04, 0.04, -0.03],
        LeftUpperArm: [-0.62, 0.32, -0.45],
        LeftForearm: [-0.16, 0, 0],
        LeftHand: [0, 0, -0.12],
        RightUpperArm: [0.46, -0.18, -0.52],
        RightForearm: [-0.12, 0, 0],
        RightHand: [0, 0, 0.1],
        LeftThigh: [-0.18, 0, 0.06],
        LeftShin: [0.36, 0, 0],
        LeftFoot: [-0.18, 0, 0],
        RightThigh: [-0.28, 0, -0.2],
        RightShin: [0.54, 0, 0],
        RightFoot: [-0.26, 0, 0],
      },
    },
    // Step 3: Hips thrust RIGHT (-X), Both arms swing LEFT (+X) with Right BEHIND, Left IN FRONT
    {
      hipX: -0.1,
      hipY: -0.055,
      hipZ: 0.14,
      pose: {
        Hips: [0.05, 0.12, 0.14],
        Spine: [0.07, -0.06, -0.08],
        Chest: [0.08, -0.08, -0.08],
        Head: [-0.04, -0.04, 0.03],
        LeftUpperArm: [-0.6, -0.28, 0.42],
        LeftForearm: [-0.15, 0, 0],
        RightUpperArm: [0.48, 0.22, 0.48],
        RightForearm: [-0.12, 0, 0],
        LeftThigh: [-0.28, 0, 0.2],
        LeftShin: [0.54, 0, 0],
        LeftFoot: [-0.26, 0, 0],
        RightThigh: [-0.18, 0, -0.06],
        RightShin: [0.36, 0, 0],
        RightFoot: [-0.18, 0, 0],
      },
    },
    // Step 4: Center pass-through
    {
      hipX: 0,
      hipY: -0.02,
      hipZ: 0,
      pose: {
        ...flossCenter,
        LeftUpperArm: [0.38, 0.25, 0.12],
        RightUpperArm: [-0.42, -0.25, -0.12],
      },
    },
    // Step 5: Hips thrust LEFT (+X), Both arms swing RIGHT (-X) with Right IN FRONT, Left BEHIND
    {
      hipX: 0.1,
      hipY: -0.055,
      hipZ: -0.14,
      pose: {
        Hips: [0.05, -0.12, -0.14],
        Spine: [0.07, 0.06, 0.08],
        Chest: [0.08, 0.08, 0.08],
        Head: [-0.04, 0.04, -0.03],
        LeftUpperArm: [0.48, -0.22, -0.48],
        LeftForearm: [-0.12, 0, 0],
        RightUpperArm: [-0.6, 0.28, -0.42],
        RightForearm: [-0.15, 0, 0],
        LeftThigh: [-0.18, 0, 0.06],
        LeftShin: [0.36, 0, 0],
        LeftFoot: [-0.18, 0, 0],
        RightThigh: [-0.28, 0, -0.2],
        RightShin: [0.54, 0, 0],
        RightFoot: [-0.26, 0, 0],
      },
    },
  ];

  let t = 0.28;
  let i = 0;
  while (t <= 9.52) {
    const s = steps[i % steps.length];
    frames.push({
      time: Number(t.toFixed(3)),
      hipsPosOffset: [s.hipX, s.hipY, 0],
      pose: s.pose,
    });
    t += half;
    i++;
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

// =============================================================================
// 2. TAKE THE L (112 BPM, 10.0s)
// Right hand holding "L" at forehead, left hand on hip, alternating forward hop-kicks
// =============================================================================
function createTakeTheLFrames(): EmoteKeyframe[] {
  const beat = 60 / 112; // ~0.5357s
  const half = beat * 0.5; // ~0.2679s
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const upperL: EulerPose = {
    RightShoulder: [0, 0, -0.08],
    RightUpperArm: [-2.12, 0.22, -0.32],
    RightForearm: [-1.72, 0, 0.18],
    RightHand: [-0.08, 0.12, -0.15],
    LeftShoulder: [0, 0, 0.06],
    LeftUpperArm: [0.22, 0.1, 0.72],
    LeftForearm: [-1.52, 0, -0.42],
    LeftHand: [0, 0, 0.18],
  };

  let t = 0.28;
  let step = 0;
  while (t <= 9.52) {
    const phase = step % 4;
    if (phase === 0) {
      // Hop & Kick RIGHT leg out forward
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [0.03, 0.085, 0],
        pose: {
          ...upperL,
          Hips: [-0.06, -0.14, -0.08],
          Spine: [-0.06, 0.08, 0.05],
          Chest: [-0.08, 0.08, 0.06],
          Head: [-0.06, 0.12, -0.12],
          LeftThigh: [-0.14, 0, 0.05],
          LeftShin: [0.22, 0, 0],
          LeftFoot: [-0.08, 0, 0],
          RightThigh: [-0.88, -0.18, -0.24],
          RightShin: [0.16, 0, 0],
          RightFoot: [-0.28, 0, 0],
        },
      });
    } else if (phase === 1 || phase === 3) {
      // Land on center bounce
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [0, -0.055, 0],
        pose: {
          ...upperL,
          Hips: [0.02, 0, 0],
          Spine: [-0.04, 0, 0],
          Chest: [-0.05, 0, 0],
          Head: [0.02, 0, phase === 1 ? -0.05 : 0.05],
          LeftThigh: [-0.26, 0, 0.08],
          LeftShin: [0.48, 0, 0],
          LeftFoot: [-0.22, 0, 0],
          RightThigh: [-0.26, 0, -0.08],
          RightShin: [0.48, 0, 0],
          RightFoot: [-0.22, 0, 0],
        },
      });
    } else {
      // Hop & Kick LEFT leg out forward
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [-0.03, 0.085, 0],
        pose: {
          ...upperL,
          Hips: [-0.06, 0.14, 0.08],
          Spine: [-0.06, -0.08, -0.05],
          Chest: [-0.08, -0.08, -0.06],
          Head: [-0.06, -0.12, 0.12],
          LeftThigh: [-0.88, 0.18, 0.24],
          LeftShin: [0.16, 0, 0],
          LeftFoot: [-0.28, 0, 0],
          RightThigh: [-0.14, 0, -0.05],
          RightShin: [0.22, 0, 0],
          RightFoot: [-0.08, 0, 0],
        },
      });
    }
    t += half;
    step++;
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

// =============================================================================
// 3. ORANGE JUSTICE (128 BPM, 10.0s)
// Low knee bounce, chest hunch pumps, opposite diagonal arm slashes & chest clap
// =============================================================================
function createOrangeJusticeFrames(): EmoteKeyframe[] {
  const half = 60 / 128 / 2; // ~0.2344s
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const lowLegs: EulerPose = {
    LeftThigh: [-0.52, -0.08, 0.22],
    LeftShin: [0.96, 0, 0],
    LeftFoot: [-0.44, 0, 0],
    RightThigh: [-0.52, 0.08, -0.22],
    RightShin: [0.96, 0, 0],
    RightFoot: [-0.44, 0, 0],
  };

  const highLegs: EulerPose = {
    LeftThigh: [-0.28, -0.06, 0.18],
    LeftShin: [0.54, 0, 0],
    LeftFoot: [-0.26, 0, 0],
    RightThigh: [-0.28, 0.06, -0.18],
    RightShin: [0.54, 0, 0],
    RightFoot: [-0.26, 0, 0],
  };

  let t = 0.26;
  let step = 0;
  while (t <= 9.52) {
    const phase = step % 4;
    if (phase === 0) {
      // Diagonal Slash A: Left arm high-left, Right arm low-right, deep crouch pump
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [-0.04, -0.15, 0],
        pose: {
          ...lowLegs,
          Hips: [0.06, -0.14, 0.06],
          Spine: [0.18, 0.12, -0.06],
          Chest: [0.22, 0.15, -0.08],
          Head: [0.08, -0.1, 0.06],
          LeftUpperArm: [-1.42, 0.12, 1.12],
          LeftForearm: [-0.32, 0, 0],
          RightUpperArm: [0.28, -0.18, -0.78],
          RightForearm: [-0.42, 0, 0],
        },
      });
    } else if (phase === 1 || phase === 3) {
      // Snap together for center clap + torso snap upright
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [0, -0.075, 0.02],
        pose: {
          ...highLegs,
          Hips: [0.02, 0, 0],
          Spine: [-0.04, 0, 0],
          Chest: [-0.04, 0, 0],
          Head: [-0.05, 0, 0],
          LeftUpperArm: [-0.95, 0.48, -0.15],
          LeftForearm: [-1.35, 0, 0],
          RightUpperArm: [-0.95, -0.48, 0.15],
          RightForearm: [-1.35, 0, 0],
        },
      });
    } else {
      // Diagonal Slash B: Right arm high-right, Left arm low-left, deep crouch pump
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [0.04, -0.15, 0],
        pose: {
          ...lowLegs,
          Hips: [0.06, 0.14, -0.06],
          Spine: [0.18, -0.12, 0.06],
          Chest: [0.22, -0.15, 0.08],
          Head: [0.08, 0.1, -0.06],
          LeftUpperArm: [0.28, 0.18, 0.78],
          LeftForearm: [-0.42, 0, 0],
          RightUpperArm: [-1.42, -0.12, -1.12],
          RightForearm: [-0.32, 0, 0],
        },
      });
    }
    t += half;
    step++;
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

// =============================================================================
// 4. RENEGADE DANCE (140 BPM, 10.0s)
// Fast TikTok hit sequence: Woah lock -> Overhead sweep -> Double clap -> Wrist wave -> Shoulder pops
// =============================================================================
function createRenegadeFrames(): EmoteKeyframe[] {
  const beat = 60 / 140; // ~0.4286s
  const half = beat * 0.5; // ~0.2143s
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const bounceLegs = (leanSide: number, squat = true): EulerPose => ({
    LeftThigh: [squat ? -0.34 : -0.16, 0, 0.1 + leanSide * 0.04],
    LeftShin: [squat ? 0.64 : 0.3, 0, 0],
    LeftFoot: [squat ? -0.3 : -0.14, 0, 0],
    RightThigh: [squat ? -0.34 : -0.16, 0, -0.1 + leanSide * 0.04],
    RightShin: [squat ? 0.64 : 0.3, 0, 0],
    RightFoot: [squat ? -0.3 : -0.14, 0, 0],
  });

  // Two full high-energy Renegade cycles spanning ~4.65s each
  const cycleOffsets = [0.25, 4.9];
  for (const base of cycleOffsets) {
    // 1. Elbows back prep -> Woah hit forward-down
    frames.push({
      time: Number((base + 0 * half).toFixed(3)),
      hipsPosOffset: [0, -0.03, 0],
      pose: {
        ...bounceLegs(0, false),
        Hips: [0.02, 0.1, 0],
        Spine: [-0.04, 0, 0],
        Chest: [-0.05, 0, 0],
        LeftUpperArm: [0.35, 0, 0.65],
        LeftForearm: [-1.45, 0, 0],
        RightUpperArm: [0.35, 0, -0.65],
        RightForearm: [-1.45, 0, 0],
      },
    });
    frames.push({
      time: Number((base + 1.5 * half).toFixed(3)),
      hipsPosOffset: [0, -0.09, 0.03],
      pose: {
        ...bounceLegs(0, true),
        Hips: [0.06, -0.12, 0],
        Spine: [0.14, 0.08, 0],
        Chest: [0.16, 0.1, 0],
        Head: [0.06, -0.08, -0.06],
        LeftUpperArm: [-0.72, 0.24, 0.38],
        LeftForearm: [-1.62, 0, -0.25],
        RightUpperArm: [-0.72, -0.24, -0.38],
        RightForearm: [-1.62, 0, 0.25],
      },
    });

    // 2. Overhead elbow sweep (right over head, left out)
    frames.push({
      time: Number((base + 3.2 * half).toFixed(3)),
      hipsPosOffset: [0.05, -0.04, 0],
      pose: {
        ...bounceLegs(1, false),
        Hips: [0.03, -0.18, -0.06],
        Spine: [0.06, 0.12, 0.06],
        Chest: [0.08, 0.18, 0.08],
        Head: [-0.06, -0.18, 0.08],
        LeftUpperArm: [-0.45, 0, 0.85],
        LeftForearm: [-1.35, 0, 0],
        RightUpperArm: [-2.42, -0.22, -0.45],
        RightForearm: [-1.68, 0, 0.25],
      },
    });

    // 3. Double clap (open -> clap 1 -> open -> clap 2)
    frames.push({
      time: Number((base + 5.0 * half).toFixed(3)),
      hipsPosOffset: [-0.03, -0.07, 0],
      pose: {
        ...bounceLegs(-1, true),
        Hips: [0.04, 0.14, 0.04],
        Spine: [0.08, -0.1, 0],
        Chest: [0.1, -0.12, 0],
        Head: [-0.04, 0.1, -0.04],
        LeftUpperArm: [-0.95, 0.55, -0.18],
        LeftForearm: [-1.45, 0, 0],
        RightUpperArm: [-0.95, -0.55, 0.18],
        RightForearm: [-1.45, 0, 0],
      },
    });
    frames.push({
      time: Number((base + 6.0 * half).toFixed(3)),
      hipsPosOffset: [0, -0.03, 0],
      pose: {
        ...bounceLegs(0, false),
        LeftUpperArm: [-0.85, 0.1, 0.65],
        LeftForearm: [-1.15, 0, 0],
        RightUpperArm: [-0.85, -0.1, -0.65],
        RightForearm: [-1.15, 0, 0],
      },
    });
    frames.push({
      time: Number((base + 7.0 * half).toFixed(3)),
      hipsPosOffset: [0.03, -0.07, 0],
      pose: {
        ...bounceLegs(1, true),
        Hips: [0.04, -0.14, -0.04],
        LeftUpperArm: [-0.95, 0.55, -0.18],
        LeftForearm: [-1.45, 0, 0],
        RightUpperArm: [-0.95, -0.55, 0.18],
        RightForearm: [-1.45, 0, 0],
      },
    });

    // 4. Arm wave across (Left elbow high -> wrist wave -> Right hand isolation)
    frames.push({
      time: Number((base + 9.0 * half).toFixed(3)),
      hipsPosOffset: [-0.05, -0.04, 0],
      pose: {
        ...bounceLegs(-1, false),
        Hips: [0.02, 0.22, 0.05],
        Spine: [0.05, -0.12, -0.05],
        Chest: [0.06, -0.16, -0.06],
        Head: [-0.04, 0.06, 0.06],
        LeftUpperArm: [-1.52, -0.2, 1.32],
        LeftForearm: [-0.35, 0, 0],
        RightUpperArm: [-1.35, 0.35, -0.65],
        RightForearm: [-1.2, 0, 0],
      },
    });
    frames.push({
      time: Number((base + 11.2 * half).toFixed(3)),
      hipsPosOffset: [0.05, -0.05, 0],
      pose: {
        ...bounceLegs(1, true),
        Hips: [0.02, -0.22, -0.05],
        Spine: [0.05, 0.12, 0.05],
        Chest: [0.06, 0.16, 0.06],
        Head: [-0.04, -0.06, -0.06],
        LeftUpperArm: [-1.35, -0.35, 0.65],
        LeftForearm: [-1.2, 0, 0],
        RightUpperArm: [-1.52, 0.2, -1.32],
        RightForearm: [-0.35, 0, 0],
      },
    });

    // 5. Crisp cross-arm X-pop & shoulder isolation hit
    frames.push({
      time: Number((base + 13.5 * half).toFixed(3)),
      hipsPosOffset: [0, -0.08, 0],
      pose: {
        ...bounceLegs(0, true),
        Hips: [0.05, 0, 0],
        Spine: [0.1, 0.18, 0],
        Chest: [0.12, 0.22, 0],
        Head: [-0.08, -0.22, 0.06],
        LeftUpperArm: [-0.85, 0.72, -0.22],
        LeftForearm: [-1.45, 0, 0],
        RightUpperArm: [-0.85, -0.72, 0.22],
        RightForearm: [-1.45, 0, 0],
      },
    });
    frames.push({
      time: Number((base + 16.0 * half).toFixed(3)),
      hipsPosOffset: [0, -0.04, 0],
      pose: {
        ...bounceLegs(0, false),
        Hips: [0.02, 0, 0],
        Spine: [-0.04, -0.18, 0],
        Chest: [-0.05, -0.22, 0],
        Head: [-0.06, 0.22, -0.06],
        LeftUpperArm: [-0.55, 0, 0.92],
        LeftForearm: [-1.55, 0, 0],
        RightUpperArm: [-1.62, -0.15, -0.68],
        RightForearm: [-1.25, 0, 0],
      },
    });
    frames.push({
      time: Number((base + 19.0 * half).toFixed(3)),
      hipsPosOffset: [0, -0.06, 0],
      pose: {
        ...bounceLegs(0, true),
        Hips: [0.04, 0.12, 0],
        Spine: [0.08, -0.08, 0],
        Chest: [0.1, -0.1, 0],
        Head: [0.04, 0.1, 0.05],
        LeftUpperArm: [-1.18, 0.2, 0.45],
        LeftForearm: [-1.62, 0, -0.25],
        RightUpperArm: [-1.18, -0.2, -0.45],
        RightForearm: [-1.62, 0, 0.25],
      },
    });
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

// =============================================================================
// 5. GRIDDY DANCE (96 BPM, 10.0s)
// Crouched trot with alternating heel-taps, sharp backward arm swings -> B-glasses at eyes
// =============================================================================
function createGriddyFrames(): EmoteKeyframe[] {
  const half = 60 / 96 / 2; // 0.3125s
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const armsSwingBack: EulerPose = {
    LeftUpperArm: [0.82, 0, 0.24],
    LeftForearm: [-0.32, 0, 0],
    LeftHand: [0, 0, 0],
    RightUpperArm: [0.82, 0, -0.24],
    RightForearm: [-0.32, 0, 0],
    RightHand: [0, 0, 0],
  };

  // B-glasses (hands curved up beside eyes)
  const armsBGlasses: EulerPose = {
    LeftUpperArm: [-1.42, -0.35, 0.36],
    LeftForearm: [-1.85, 0, -0.42],
    LeftHand: [0.15, 0, 0.25],
    RightUpperArm: [-1.42, 0.35, -0.36],
    RightForearm: [-1.85, 0, 0.42],
    RightHand: [0.15, 0, -0.25],
  };

  let t = 0.28;
  let step = 0;
  while (t <= 9.52) {
    const phase = step % 4;
    if (phase === 0) {
      // Right heel tap forward + sharp back arm swing
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [0.03, -0.09, 0.02],
        pose: {
          ...armsSwingBack,
          Hips: [0.08, -0.08, 0.03],
          Spine: [0.18, 0.06, 0],
          Chest: [0.18, 0.06, 0],
          Head: [-0.08, 0, 0],
          LeftThigh: [-0.46, 0, 0.08],
          LeftShin: [0.88, 0, 0],
          LeftFoot: [-0.42, 0, 0],
          RightThigh: [-0.68, 0, -0.08],
          RightShin: [0.22, 0, 0],
          RightFoot: [-0.52, 0, 0],
        },
      });
    } else if (phase === 1) {
      // Left heel tap forward + B-glasses brought up to eyes + cool nod
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [-0.03, -0.07, 0.02],
        pose: {
          ...armsBGlasses,
          Hips: [0.06, 0.08, -0.03],
          Spine: [0.14, -0.06, 0],
          Chest: [0.14, -0.06, 0],
          Head: [0.1, 0, 0.05],
          LeftThigh: [-0.68, 0, 0.08],
          LeftShin: [0.22, 0, 0],
          LeftFoot: [-0.52, 0, 0],
          RightThigh: [-0.46, 0, -0.08],
          RightShin: [0.88, 0, 0],
          RightFoot: [-0.42, 0, 0],
        },
      });
    } else if (phase === 2) {
      // Right heel tap forward + hold B-glasses with swagger tilt
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [0.03, -0.1, 0.02],
        pose: {
          ...armsBGlasses,
          Hips: [0.08, -0.08, 0.03],
          Spine: [0.16, 0.06, 0],
          Chest: [0.16, 0.06, 0],
          Head: [-0.04, 0, -0.06],
          LeftThigh: [-0.46, 0, 0.08],
          LeftShin: [0.88, 0, 0],
          LeftFoot: [-0.42, 0, 0],
          RightThigh: [-0.68, 0, -0.08],
          RightShin: [0.22, 0, 0],
          RightFoot: [-0.52, 0, 0],
        },
      });
    } else {
      // Left heel tap forward + snap both arms back again
      frames.push({
        time: Number(t.toFixed(3)),
        hipsPosOffset: [-0.03, -0.06, 0.02],
        pose: {
          ...armsSwingBack,
          Hips: [0.05, 0.08, -0.03],
          Spine: [0.15, -0.06, 0],
          Chest: [0.15, -0.06, 0],
          Head: [-0.06, 0, 0],
          LeftThigh: [-0.68, 0, 0.08],
          LeftShin: [0.22, 0, 0],
          LeftFoot: [-0.52, 0, 0],
          RightThigh: [-0.46, 0, -0.08],
          RightShin: [0.88, 0, 0],
          RightFoot: [-0.42, 0, 0],
        },
      });
    }
    t += half;
    step++;
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

// =============================================================================
// 6. GANGNAM STYLE (132 BPM, 10.0s)
// Phrase A: Crossed-wrist horse-rein galloping; Phrase B: Overhead lasso spin
// =============================================================================
function createGangnamFrames(): EmoteKeyframe[] {
  const half = 60 / 132 / 2; // ~0.2273s
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const horseReins = (up: boolean): EulerPose => ({
    LeftUpperArm: [up ? -0.98 : -0.78, -0.52, 0.22],
    LeftForearm: [up ? -1.32 : -1.08, 0, -0.12],
    RightUpperArm: [up ? -0.98 : -0.78, 0.52, -0.22],
    RightForearm: [up ? -1.32 : -1.08, 0, 0.12],
  });

  const lassoArms = (spinStep: number): EulerPose => {
    const angle = (spinStep % 4) * (Math.PI * 0.5);
    const sx = Math.cos(angle) * 0.26;
    const sz = Math.sin(angle) * 0.26;
    return {
      // Left arm tucked across waist
      LeftUpperArm: [-0.48, -0.45, 0.35],
      LeftForearm: [-1.25, 0, 0],
      // Right arm raised high spinning lasso circle overhead
      RightUpperArm: [-2.72 + sx * 0.4, 0, -0.28 + sz * 0.5],
      RightForearm: [-0.52 + sx * 0.85, 0, sz * 0.95],
      RightHand: [sx * 0.35, 0, sz * 0.35],
    };
  };

  let t = 0.26;
  let step = 0;
  while (t <= 9.52) {
    // Alternate every 11 steps (~2.5s): Reins -> Lasso -> Reins -> Lasso
    const block = Math.floor(step / 10) % 2;
    const isLasso = block === 1;
    const gallop = step % 4; // L-L-R-L hop rhythm
    const legLiftLeft = gallop === 1 || gallop === 3;
    const legLiftRight = gallop === 2;
    const hopUp = step % 2 === 1;

    const legPose: EulerPose = legLiftLeft
      ? {
          LeftThigh: [-0.72, 0.12, 0.34],
          LeftShin: [0.95, 0, 0],
          LeftFoot: [-0.15, 0, 0],
          RightThigh: [-0.36, -0.06, -0.28],
          RightShin: [0.58, 0, 0],
          RightFoot: [-0.22, 0, 0],
        }
      : legLiftRight
        ? {
            LeftThigh: [-0.36, 0.06, 0.28],
            LeftShin: [0.58, 0, 0],
            LeftFoot: [-0.22, 0, 0],
            RightThigh: [-0.72, -0.12, -0.34],
            RightShin: [0.95, 0, 0],
            RightFoot: [-0.15, 0, 0],
          }
        : {
            LeftThigh: [-0.44, 0.08, 0.32],
            LeftShin: [0.72, 0, 0],
            LeftFoot: [-0.28, 0, 0],
            RightThigh: [-0.44, -0.08, -0.32],
            RightShin: [0.72, 0, 0],
            RightFoot: [-0.28, 0, 0],
          };

    frames.push({
      time: Number(t.toFixed(3)),
      hipsPosOffset: [
        legLiftLeft ? -0.04 : legLiftRight ? 0.04 : 0,
        hopUp ? 0.05 : -0.1,
        0,
      ],
      pose: {
        ...legPose,
        ...(isLasso ? lassoArms(step) : horseReins(hopUp)),
        Hips: [0.05, legLiftLeft ? 0.08 : legLiftRight ? -0.08 : 0, 0],
        Spine: [-0.04, 0, 0],
        Chest: [-0.05, 0, 0],
        Head: [hopUp ? -0.08 : 0.04, 0, legLiftLeft ? -0.04 : 0.04],
      },
    });

    t += half;
    step++;
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

// =============================================================================
// 7. MACARENA (104 BPM, 10.0s)
// Two complete 12-beat Macarena cycles:
// R fwd, L fwd, R flip, L flip, R->L shoulder, L->R shoulder, R head, L head,
// R->L hip, L->R hip, hands on hips + 3-beat wiggle, hop clap
// =============================================================================
function createMacarenaFrames(): EmoteKeyframe[] {
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const calmLegs = (hipZ = 0, squat = 0.12): EulerPose => ({
    Hips: [0.02, 0, hipZ],
    LeftThigh: [-squat, 0, 0.06],
    LeftShin: [squat * 1.9, 0, 0],
    LeftFoot: [-squat * 0.9, 0, 0],
    RightThigh: [-squat, 0, -0.06],
    RightShin: [squat * 1.9, 0, 0],
    RightFoot: [-squat * 0.9, 0, 0],
  });

  // Run two complete 12-pose sequences: Cycle 1 (0.35s -> 4.75s), Cycle 2 (5.05s -> 9.50s)
  const cycles = [0.35, 5.05];
  const stepDur = 0.355;

  for (const start of cycles) {
    // 1. Right arm straight forward (palm down)
    frames.push({
      time: Number((start + 0 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.02, 0],
      pose: {
        ...calmLegs(0.03),
        RightUpperArm: [-1.45, 0, -0.05],
        RightForearm: [-0.06, 0, 0],
        LeftUpperArm: [0.04, 0, 0.1],
        LeftForearm: [-0.14, 0, 0],
      },
    });
    // 2. Left arm straight forward too
    frames.push({
      time: Number((start + 1 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.02, 0],
      pose: {
        ...calmLegs(-0.03),
        RightUpperArm: [-1.45, 0, -0.05],
        RightForearm: [-0.06, 0, 0],
        LeftUpperArm: [-1.45, 0, 0.05],
        LeftForearm: [-0.06, 0, 0],
      },
    });
    // 3. Flip Right palm up
    frames.push({
      time: Number((start + 2 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.02, 0],
      pose: {
        ...calmLegs(0.03),
        RightUpperArm: [-1.45, -0.35, -0.08],
        RightForearm: [-0.15, 0.55, 0],
        RightHand: [0, 0.5, 0],
        LeftUpperArm: [-1.45, 0, 0.05],
        LeftForearm: [-0.06, 0, 0],
      },
    });
    // 4. Flip Left palm up
    frames.push({
      time: Number((start + 3 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.02, 0],
      pose: {
        ...calmLegs(-0.03),
        RightUpperArm: [-1.45, -0.35, -0.08],
        RightForearm: [-0.15, 0.55, 0],
        RightHand: [0, 0.5, 0],
        LeftUpperArm: [-1.45, 0.35, 0.08],
        LeftForearm: [-0.15, -0.55, 0],
        LeftHand: [0, -0.5, 0],
      },
    });
    // 5. Right hand crosses to Left shoulder
    frames.push({
      time: Number((start + 4 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.03, 0],
      pose: {
        ...calmLegs(0.04),
        Chest: [0.02, 0.08, 0],
        RightUpperArm: [-1.05, 0.78, 0.35],
        RightForearm: [-1.52, 0, 0],
        LeftUpperArm: [-1.42, 0.25, 0.08],
        LeftForearm: [-0.15, -0.35, 0],
      },
    });
    // 6. Left hand crosses to Right shoulder
    frames.push({
      time: Number((start + 5 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.03, 0],
      pose: {
        ...calmLegs(-0.04),
        Chest: [0.02, -0.06, 0],
        RightUpperArm: [-1.05, 0.78, 0.35],
        RightForearm: [-1.52, 0, 0],
        LeftUpperArm: [-1.05, -0.78, -0.35],
        LeftForearm: [-1.52, 0, 0],
      },
    });
    // 7. Right hand behind head
    frames.push({
      time: Number((start + 6 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.02, 0],
      pose: {
        ...calmLegs(0.04),
        RightUpperArm: [-2.35, -0.25, -0.55],
        RightForearm: [-1.92, 0, 0.25],
        LeftUpperArm: [-1.05, -0.78, -0.35],
        LeftForearm: [-1.52, 0, 0],
      },
    });
    // 8. Left hand behind head
    frames.push({
      time: Number((start + 7 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.02, 0],
      pose: {
        ...calmLegs(-0.04),
        Head: [-0.04, 0, 0],
        RightUpperArm: [-2.35, -0.25, -0.55],
        RightForearm: [-1.92, 0, 0.25],
        LeftUpperArm: [-2.35, 0.25, 0.55],
        LeftForearm: [-1.92, 0, -0.25],
      },
    });
    // 9. Right hand to Left hip
    frames.push({
      time: Number((start + 8 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.03, 0],
      pose: {
        ...calmLegs(0.05),
        RightUpperArm: [-0.38, 0.68, 0.28],
        RightForearm: [-1.08, 0, 0],
        LeftUpperArm: [-2.35, 0.25, 0.55],
        LeftForearm: [-1.92, 0, -0.25],
      },
    });
    // 10. Left hand to Right hip
    frames.push({
      time: Number((start + 9 * stepDur).toFixed(3)),
      hipsPosOffset: [0, -0.03, 0],
      pose: {
        ...calmLegs(-0.05),
        RightUpperArm: [-0.38, 0.68, 0.28],
        RightForearm: [-1.08, 0, 0],
        LeftUpperArm: [-0.38, -0.68, -0.28],
        LeftForearm: [-1.08, 0, 0],
      },
    });
    // 11. Hands on hips + Macarena hip wiggle L -> R -> L
    const hipArms: EulerPose = {
      RightUpperArm: [0.18, 0, -0.68],
      RightForearm: [-1.45, 0, 0.42],
      LeftUpperArm: [0.18, 0, 0.68],
      LeftForearm: [-1.45, 0, -0.42],
    };
    frames.push({
      time: Number((start + 10 * stepDur).toFixed(3)),
      hipsPosOffset: [0.08, -0.05, 0],
      pose: {
        ...calmLegs(-0.14, 0.22),
        ...hipArms,
        Spine: [0.04, 0, 0.08],
        Head: [0, 0, -0.06],
      },
    });
    frames.push({
      time: Number((start + 10.7 * stepDur).toFixed(3)),
      hipsPosOffset: [-0.08, -0.05, 0],
      pose: {
        ...calmLegs(0.14, 0.22),
        ...hipArms,
        Spine: [0.04, 0, -0.08],
        Head: [0, 0, 0.06],
      },
    });
    // 12. Hop clap + playful turn
    frames.push({
      time: Number((start + 11.8 * stepDur).toFixed(3)),
      hipsPosOffset: [0, 0.09, 0],
      pose: {
        Hips: [0.02, start < 3 ? 0.36 : -0.36, 0],
        Spine: [-0.04, 0, 0],
        Chest: [-0.05, 0, 0],
        Head: [-0.08, 0, 0],
        LeftUpperArm: [-1.02, 0.48, -0.12],
        LeftForearm: [-1.35, 0, 0],
        RightUpperArm: [-1.02, -0.48, 0.12],
        RightForearm: [-1.35, 0, 0],
        LeftThigh: [-0.24, 0, 0.1],
        LeftShin: [0.46, 0, 0],
        LeftFoot: [-0.22, 0, 0],
        RightThigh: [-0.24, 0, -0.1],
        RightShin: [0.46, 0, 0],
        RightFoot: [-0.22, 0, 0],
      },
    });
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

// =============================================================================
// 8. ELECTRO SHUFFLE (126 BPM, 10.0s)
// Crisp running-man knee drives, T-step heel twists, ankle cross & electro arm sweeps
// =============================================================================
function createElectroShuffleFrames(): EmoteKeyframe[] {
  const half = 60 / 126 / 2; // ~0.2381s
  const frames: EmoteKeyframe[] = [{ time: 0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } }];

  const stepPoses: Array<{ yOff: number; xOff: number; pose: EulerPose }> = [
    // 0: Running-Man Left knee up high + Right arm sweeps across, Left arm sweeps wide
    {
      yOff: 0.04,
      xOff: -0.03,
      pose: {
        Hips: [0.03, -0.2, 0.04],
        Spine: [0.05, 0.14, -0.04],
        Chest: [0.06, 0.18, -0.05],
        Head: [-0.04, -0.14, 0.04],
        LeftUpperArm: [-0.95, 0, 1.18],
        LeftForearm: [-1.18, 0, 0],
        RightUpperArm: [-0.88, 0.65, 0.15],
        RightForearm: [-1.35, 0, 0],
        LeftThigh: [-0.98, 0, 0.12],
        LeftShin: [1.18, 0, 0],
        LeftFoot: [-0.12, 0, 0],
        RightThigh: [0.34, 0, -0.08],
        RightShin: [0.22, 0, 0],
        RightFoot: [-0.26, 0, 0],
      },
    },
    // 1: Snap Down T-Step Center (wide heel twist & arms X)
    {
      yOff: -0.075,
      xOff: 0,
      pose: {
        Hips: [0.04, 0.22, 0],
        Spine: [0.06, -0.14, 0],
        Chest: [0.08, -0.16, 0],
        Head: [0.04, 0.1, 0],
        LeftUpperArm: [-0.72, 0.55, -0.12],
        LeftForearm: [-1.25, 0, 0],
        RightUpperArm: [-0.72, -0.55, 0.12],
        RightForearm: [-1.25, 0, 0],
        LeftThigh: [-0.32, 0.28, 0.24],
        LeftShin: [0.56, 0, 0],
        LeftFoot: [-0.24, 0.3, 0],
        RightThigh: [-0.32, -0.28, -0.24],
        RightShin: [0.56, 0, 0],
        RightFoot: [-0.24, -0.3, 0],
      },
    },
    // 2: Running-Man Right knee up high + Left arm sweeps across, Right arm sweeps wide
    {
      yOff: 0.04,
      xOff: 0.03,
      pose: {
        Hips: [0.03, 0.2, -0.04],
        Spine: [0.05, -0.14, 0.04],
        Chest: [0.06, -0.18, 0.05],
        Head: [-0.04, 0.14, -0.04],
        LeftUpperArm: [-0.88, -0.65, -0.15],
        LeftForearm: [-1.35, 0, 0],
        RightUpperArm: [-0.95, 0, -1.18],
        RightForearm: [-1.18, 0, 0],
        LeftThigh: [0.34, 0, 0.08],
        LeftShin: [0.22, 0, 0],
        LeftFoot: [-0.26, 0, 0],
        RightThigh: [-0.98, 0, -0.12],
        RightShin: [1.18, 0, 0],
        RightFoot: [-0.12, 0, 0],
      },
    },
    // 3: Criss-Cross Ankle Slide (arms open geometric V)
    {
      yOff: -0.06,
      xOff: 0,
      pose: {
        Hips: [0.04, 0, 0],
        Spine: [0.06, 0, 0],
        Chest: [0.08, 0, 0],
        Head: [-0.06, 0, 0],
        LeftUpperArm: [-1.25, 0, 1.32],
        LeftForearm: [-0.85, 0, 0],
        RightUpperArm: [-1.25, 0, -1.32],
        RightForearm: [-0.85, 0, 0],
        LeftThigh: [-0.3, -0.24, -0.16],
        LeftShin: [0.46, 0, 0],
        LeftFoot: [-0.16, 0, 0],
        RightThigh: [-0.3, 0.24, 0.16],
        RightShin: [0.46, 0, 0],
        RightFoot: [-0.16, 0, 0],
      },
    },
    // 4: Electro Slide Right + Left heel flare
    {
      yOff: -0.04,
      xOff: 0.07,
      pose: {
        Hips: [0.04, -0.28, -0.06],
        Spine: [0.06, 0.18, 0.05],
        Chest: [0.08, 0.22, 0.06],
        Head: [-0.04, -0.22, 0.05],
        LeftUpperArm: [-0.62, 0.25, 0.85],
        LeftForearm: [-1.42, 0, 0],
        RightUpperArm: [-1.45, 0, -0.92],
        RightForearm: [-0.72, 0, 0],
        LeftThigh: [-0.26, 0, 0.36],
        LeftShin: [0.32, 0, 0],
        LeftFoot: [-0.32, 0, 0],
        RightThigh: [-0.38, 0, -0.14],
        RightShin: [0.68, 0, 0],
        RightFoot: [-0.3, 0, 0],
      },
    },
    // 5: Electro Slide Left + Right heel flare
    {
      yOff: -0.04,
      xOff: -0.07,
      pose: {
        Hips: [0.04, 0.28, 0.06],
        Spine: [0.06, -0.18, -0.05],
        Chest: [0.08, -0.22, -0.06],
        Head: [-0.04, 0.22, -0.05],
        LeftUpperArm: [-1.45, 0, 0.92],
        LeftForearm: [-0.72, 0, 0],
        RightUpperArm: [-0.62, -0.25, -0.85],
        RightForearm: [-1.42, 0, 0],
        LeftThigh: [-0.38, 0, 0.14],
        LeftShin: [0.68, 0, 0],
        LeftFoot: [-0.3, 0, 0],
        RightThigh: [-0.26, 0, -0.36],
        RightShin: [0.32, 0, 0],
        RightFoot: [-0.32, 0, 0],
      },
    },
  ];

  let t = 0.26;
  let step = 0;
  while (t <= 9.52) {
    const s = stepPoses[step % stepPoses.length];
    frames.push({
      time: Number(t.toFixed(3)),
      hipsPosOffset: [s.xOff, s.yOff, 0],
      pose: s.pose,
    });
    t += half;
    step++;
  }

  frames.push({ time: 10.0, hipsPosOffset: [0, 0, 0], pose: { ...NEUTRAL_POSE } });
  return frames;
}

function createEmoteClipById(emoteId: string): THREE.AnimationClip | null {
  switch (emoteId) {
    case 'dance-floss':
      return buildEmoteClip(emoteId, 10.0, createFlossFrames());
    case 'dance-take-the-l':
      return buildEmoteClip(emoteId, 10.0, createTakeTheLFrames());
    case 'dance-orange-justice':
      return buildEmoteClip(emoteId, 10.0, createOrangeJusticeFrames());
    case 'dance-renegade':
      return buildEmoteClip(emoteId, 10.0, createRenegadeFrames());
    case 'dance-griddy':
      return buildEmoteClip(emoteId, 10.0, createGriddyFrames());
    case 'dance-gangnam-style':
      return buildEmoteClip(emoteId, 10.0, createGangnamFrames());
    case 'dance-macarena':
      return buildEmoteClip(emoteId, 10.0, createMacarenaFrames());
    case 'dance-electro-shuffle':
      return buildEmoteClip(emoteId, 10.0, createElectroShuffleFrames());
    default:
      return null;
  }
}
