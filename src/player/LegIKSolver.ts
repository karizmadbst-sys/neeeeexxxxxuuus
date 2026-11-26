import * as THREE from 'three';
import { updateRootMatrixWorld, updateWorldMatrixChain } from '../utils/TransformUtils';

// Preallocated scratch objects for zero-GC mobile/PC Leg IK evaluation
const V_ROOT_FWD = new THREE.Vector3();
const V_ROOT_RIGHT = new THREE.Vector3();
const V_ANIM_ANKLE_L = new THREE.Vector3();
const V_ANIM_ANKLE_R = new THREE.Vector3();
const V_FOOT_FWD = new THREE.Vector3();
const V_HIP_POS = new THREE.Vector3();
const V_KNEE_POS = new THREE.Vector3();
const V_TGT_ANKLE_L = new THREE.Vector3();
const V_TGT_ANKLE_R = new THREE.Vector3();
const V_TO_TARGET = new THREE.Vector3();
const V_DIR = new THREE.Vector3();
const V_POLE = new THREE.Vector3();
const V_BEND_NORMAL = new THREE.Vector3();
const V_THIGH_DIR = new THREE.Vector3();
const V_SHIN_DIR = new THREE.Vector3();
const V_SHIN_LOCAL_DIR = new THREE.Vector3();
const V_X = new THREE.Vector3();
const V_Y = new THREE.Vector3();
const V_Z = new THREE.Vector3();
const V_CHECK = new THREE.Vector3();
const V_REST_DOWN = new THREE.Vector3(0, -1, 0);

const Q_PARENT_WORLD = new THREE.Quaternion();
const Q_PARENT_INV = new THREE.Quaternion();
const Q_THIGH_WORLD = new THREE.Quaternion();
const Q_THIGH_INV = new THREE.Quaternion();
const Q_SHIN_WORLD = new THREE.Quaternion();
const Q_SHIN_INV = new THREE.Quaternion();
const Q_SOLVED_LOCAL = new THREE.Quaternion();
const Q_CUR_LOCAL = new THREE.Quaternion();
const Q_FOOT_WORLD = new THREE.Quaternion();
const Q_DELTA = new THREE.Quaternion();
const M_BASIS = new THREE.Matrix4();

export interface LegIKBones {
  hips: THREE.Bone;
  leftThigh: THREE.Bone;
  leftShin: THREE.Bone;
  leftFoot: THREE.Bone;
  rightThigh: THREE.Bone;
  rightShin: THREE.Bone;
  rightFoot: THREE.Bone;
}

export interface SolveGroundedLegIKParams {
  bones: LegIKBones;
  rootWorldPos: THREE.Vector3;
  rigWorldQuat: THREE.Quaternion;
  crouchAmount: number;
  crouchClipWeight?: number;
  weight: number;
  groundSampler?: (worldX: number, worldZ: number, refY: number) => number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

interface FootTargetResult {
  targetAnkleY: number;
  slopePitchRad: number;
  stanceBlend: number;
  animPitchRad: number;
  animYawDeltaRad: number;
}

function measureFootTarget(
  animAnkle: THREE.Vector3,
  footBone: THREE.Bone,
  rootWorldPos: THREE.Vector3,
  fwdWorld: THREE.Vector3,
  soleHeight: number,
  worldScale: number,
  groundSampler?: (worldX: number, worldZ: number, refY: number) => number,
): FootTargetResult {
  // Read current animated foot world orientation pitch & yaw relative to character forward
  footBone.getWorldQuaternion(Q_FOOT_WORLD);
  V_FOOT_FWD.set(0, 0, 1).applyQuaternion(Q_FOOT_WORLD);
  const animPitchRad = THREE.MathUtils.clamp(
    Math.asin(THREE.MathUtils.clamp(-V_FOOT_FWD.y, -0.85, 0.85)),
    -0.65,
    0.75,
  );
  // Subtle lateral toe splay relative to rig forward
  const fwdHorizLen = Math.hypot(V_FOOT_FWD.x, V_FOOT_FWD.z);
  let animYawDeltaRad = 0;
  if (fwdHorizLen > 0.25) {
    const fx = V_FOOT_FWD.x / fwdHorizLen;
    const fz = V_FOOT_FWD.z / fwdHorizLen;
    const crossY = fwdWorld.z * fx - fwdWorld.x * fz;
    const dotXZ = fwdWorld.x * fx + fwdWorld.z * fz;
    animYawDeltaRad = THREE.MathUtils.clamp(Math.atan2(crossY, dotXZ), -0.35, 0.35);
  }

  // Extract raw foot swing lift from animation relative to flat ground plane
  const rawLift = animAnkle.y - (rootWorldPos.y + soleHeight);
  // Anything <= 1.6cm is treated as ground contact (eliminates clip-level jitter/float in Idle/stance)
  const contactThreshold = 0.016 * worldScale;
  const fullSwingThreshold = 0.055 * worldScale;
  const swingBlend = smoothstep(contactThreshold, fullSwingThreshold, rawLift);
  const effectiveLift = rawLift > contactThreshold ? rawLift - contactThreshold * (1 - swingBlend) : 0;
  const stanceBlend = 1 - swingBlend;

  // Sample terrain under heel, ankle midpoint, & toe in world space
  let heelGroundY = rootWorldPos.y;
  let midGroundY = rootWorldPos.y;
  let toeGroundY = rootWorldPos.y;
  if (groundSampler) {
    const refY = rootWorldPos.y + 0.55 * worldScale;
    const heelProbe = 0.155 * worldScale;
    const toeProbe = 0.212 * worldScale;
    const rawHeel = groundSampler(
      animAnkle.x - fwdWorld.x * heelProbe,
      animAnkle.z - fwdWorld.z * heelProbe,
      refY,
    );
    const rawMid = groundSampler(animAnkle.x, animAnkle.z, refY);
    const rawToe = groundSampler(
      animAnkle.x + fwdWorld.x * toeProbe,
      animAnkle.z + fwdWorld.z * toeProbe,
      refY,
    );
    const minClamp = rootWorldPos.y - 0.42 * worldScale;
    const maxClamp = rootWorldPos.y + 0.36 * worldScale;
    heelGroundY = Number.isFinite(rawHeel)
      ? THREE.MathUtils.clamp(rawHeel, minClamp, maxClamp)
      : rootWorldPos.y;
    midGroundY = Number.isFinite(rawMid)
      ? THREE.MathUtils.clamp(rawMid, minClamp, maxClamp)
      : rootWorldPos.y;
    toeGroundY = Number.isFinite(rawToe)
      ? THREE.MathUtils.clamp(rawToe, minClamp, maxClamp)
      : rootWorldPos.y;
  }

  const probeSpan = 0.367 * worldScale;
  // Distinguish smooth ramps from discrete stair steps: on a smooth ramp, midGroundY sits near the heel-toe midpoint;
  // on a sharp stair edge, midGroundY snaps close to heelGroundY or toeGroundY while |heel-toe| is large.
  const avgHeelToe = 0.5 * (heelGroundY + toeGroundY);
  const heelToeDiff = Math.abs(heelGroundY - toeGroundY);
  const isDiscreteStep =
    heelToeDiff > 0.04 * worldScale &&
    Math.abs(midGroundY - avgHeelToe) > heelToeDiff * 0.22;
  // Positive slopePitchRad = toes pointing DOWN (walk downhill); Negative = toes pointing UP (uphill)
  let terrainSlopePitch = THREE.MathUtils.clamp(
    Math.atan2(heelGroundY - toeGroundY, probeSpan),
    -0.46,
    0.46,
  );
  if (isDiscreteStep) {
    terrainSlopePitch *= 0.2;
  }

  // When planted on terrain, blend out push-off pitch and conform firmly to slope;
  // when swinging, keep dynamic heel-strike / toe-off pitch.
  const blendedPitch = THREE.MathUtils.lerp(animPitchRad, terrainSlopePitch, stanceBlend * 0.88);
  const cosT = Math.cos(terrainSlopePitch);
  const sinT = Math.sin(terrainSlopePitch);

  // Compute exact minimum ankle height from terrain slope AND actual blended pose pitch
  // so pushing-off toes or heel-strike tilt never dip below the sampled ground plane.
  const heelArm = 0.160 * worldScale;
  const toeArm = 0.216 * worldScale;
  const reqAnkleFromHeel = heelGroundY + soleHeight * cosT - heelArm * sinT;
  const reqAnkleFromMid = midGroundY + soleHeight * cosT;
  const reqAnkleFromToe = toeGroundY + soleHeight * cosT + toeArm * sinT;
  const groundSupportAnkleY = Math.max(reqAnkleFromHeel, reqAnkleFromMid, reqAnkleFromToe);

  const cosB = Math.cos(blendedPitch);
  const sinB = Math.sin(blendedPitch);
  const actualPoseFloorAnkleY = Math.max(
    heelGroundY + soleHeight * cosB - heelArm * sinB,
    midGroundY + soleHeight * cosB,
    toeGroundY + soleHeight * cosB + toeArm * sinB,
  );

  return {
    targetAnkleY: Math.max(groundSupportAnkleY + effectiveLift, actualPoseFloorAnkleY),
    slopePitchRad: blendedPitch,
    stanceBlend,
    animPitchRad,
    animYawDeltaRad,
  };
}

function solveSingleLeg(
  thigh: THREE.Bone,
  shin: THREE.Bone,
  foot: THREE.Bone,
  l1: number,
  l2: number,
  targetAnkleWorld: THREE.Vector3,
  kneePoleWorld: THREE.Vector3,
  rigFwdWorld: THREE.Vector3,
  footYawDeltaRad: number,
  footPitchRad: number,
  weight: number,
): void {
  const parentObj = thigh.parent;
  if (!parentObj) return;

  updateWorldMatrixChain(null, thigh);
  parentObj.getWorldQuaternion(Q_PARENT_WORLD);
  Q_PARENT_INV.copy(Q_PARENT_WORLD).invert();

  thigh.getWorldPosition(V_HIP_POS);
  V_TO_TARGET.copy(targetAnkleWorld).sub(V_HIP_POS);
  const rawDist = V_TO_TARGET.length();
  if (rawDist < 0.001) return;

  // Keep natural micro-flexion at full extension (max 0.992 reach) & avoid collapse at deep crouch
  const minReach = Math.max(0.24 * (l1 + l2), Math.abs(l1 - l2) + 0.04);
  const maxReach = (l1 + l2) * 0.992;
  const dist = THREE.MathUtils.clamp(rawDist, minReach, maxReach);

  V_DIR.copy(V_TO_TARGET).multiplyScalar(1 / rawDist);

  // Knee pole direction (character forward + slight outward bias) orthogonalized to Hip->Ankle ray
  V_POLE.copy(kneePoleWorld).normalize();
  const proj = V_POLE.dot(V_DIR);
  V_BEND_NORMAL.copy(V_POLE).addScaledVector(V_DIR, -proj);
  if (V_BEND_NORMAL.lengthSq() < 1e-5) {
    V_BEND_NORMAL.copy(rigFwdWorld);
    const p2 = V_BEND_NORMAL.dot(V_DIR);
    V_BEND_NORMAL.addScaledVector(V_DIR, -p2);
    if (V_BEND_NORMAL.lengthSq() < 1e-5) {
      V_BEND_NORMAL.set(0, 0, 1);
    }
  }
  V_BEND_NORMAL.normalize();

  // Law of cosines for Thigh angle forward toward knee pole
  const cosAlpha = THREE.MathUtils.clamp(
    (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist),
    -0.999,
    0.999,
  );
  const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

  V_THIGH_DIR.copy(V_DIR)
    .multiplyScalar(cosAlpha)
    .addScaledVector(V_BEND_NORMAL, sinAlpha)
    .normalize();

  V_KNEE_POS.copy(V_HIP_POS).addScaledVector(V_THIGH_DIR, l1);
  V_SHIN_DIR.copy(V_HIP_POS)
    .addScaledVector(V_DIR, dist)
    .sub(V_KNEE_POS);
  const sLen = V_SHIN_DIR.length();
  if (sLen > 1e-4) {
    V_SHIN_DIR.multiplyScalar(1 / sLen);
  } else {
    V_SHIN_DIR.copy(V_DIR);
  }

  // Orthonormal Thigh world basis: -Y = V_THIGH_DIR, +X = knee hinge axis (V_THIGH_DIR x V_SHIN_DIR)
  V_Y.copy(V_THIGH_DIR).negate();
  V_X.crossVectors(V_THIGH_DIR, V_SHIN_DIR);
  if (V_X.lengthSq() < 1e-5) {
    V_X.crossVectors(V_BEND_NORMAL, V_DIR);
  }
  if (V_X.lengthSq() < 1e-5) {
    V_X.set(1, 0, 0).addScaledVector(V_Y, -V_Y.x);
    if (V_X.lengthSq() < 1e-5) V_X.set(0, 0, 1);
  }
  V_X.normalize();
  V_Z.crossVectors(V_X, V_Y);
  if (V_Z.lengthSq() < 1e-5) {
    V_Z.set(0, 0, 1);
  } else {
    V_Z.normalize();
  }
  V_X.crossVectors(V_Y, V_Z).normalize();
  M_BASIS.makeBasis(V_X, V_Y, V_Z);
  Q_THIGH_WORLD.setFromRotationMatrix(M_BASIS);

  Q_SOLVED_LOCAL.copy(Q_PARENT_INV).multiply(Q_THIGH_WORLD);
  if (weight < 0.999) {
    Q_CUR_LOCAL.copy(thigh.quaternion);
    thigh.quaternion.slerpQuaternions(Q_CUR_LOCAL, Q_SOLVED_LOCAL, weight);
  } else {
    thigh.quaternion.copy(Q_SOLVED_LOCAL);
  }
  updateRootMatrixWorld(thigh);

  // Solve Shin rotation cleanly in Thigh's local space
  thigh.getWorldQuaternion(Q_THIGH_WORLD);
  Q_THIGH_INV.copy(Q_THIGH_WORLD).invert();
  V_SHIN_LOCAL_DIR.copy(V_SHIN_DIR).applyQuaternion(Q_THIGH_INV);
  if (V_SHIN_LOCAL_DIR.lengthSq() < 1e-6) {
    V_SHIN_LOCAL_DIR.copy(V_REST_DOWN);
  } else {
    V_SHIN_LOCAL_DIR.normalize();
  }

  V_Y.copy(V_SHIN_LOCAL_DIR).negate();
  V_X.set(1, 0, 0);
  const xProj = V_X.dot(V_Y);
  V_X.addScaledVector(V_Y, -xProj);
  if (V_X.lengthSq() < 1e-4) {
    V_X.set(0, 0, 1).addScaledVector(V_Y, -V_Y.z);
  }
  if (V_X.lengthSq() < 1e-4) {
    V_X.set(1, 0, 0);
  } else {
    V_X.normalize();
  }
  V_Z.crossVectors(V_X, V_Y);
  if (V_Z.lengthSq() < 1e-5) {
    Q_SOLVED_LOCAL.setFromUnitVectors(V_REST_DOWN, V_SHIN_LOCAL_DIR);
  } else {
    V_Z.normalize();
    V_X.crossVectors(V_Y, V_Z).normalize();
    M_BASIS.makeBasis(V_X, V_Y, V_Z);
    Q_SOLVED_LOCAL.setFromRotationMatrix(M_BASIS);

    V_CHECK.copy(V_REST_DOWN).applyQuaternion(Q_SOLVED_LOCAL);
    if (V_CHECK.dot(V_SHIN_LOCAL_DIR) < 0.999) {
      Q_SOLVED_LOCAL.setFromUnitVectors(V_REST_DOWN, V_SHIN_LOCAL_DIR);
    }
  }

  if (weight < 0.999) {
    Q_CUR_LOCAL.copy(shin.quaternion);
    shin.quaternion.slerpQuaternions(Q_CUR_LOCAL, Q_SOLVED_LOCAL, weight);
  } else {
    shin.quaternion.copy(Q_SOLVED_LOCAL);
  }
  updateRootMatrixWorld(shin);

  // Solve Foot world orientation aligned with ground slope + subtle animated toe splay/pitch
  shin.getWorldQuaternion(Q_SHIN_WORLD);
  Q_SHIN_INV.copy(Q_SHIN_WORLD).invert();

  // Base horizontal character heading for foot
  V_Z.copy(rigFwdWorld).setY(0);
  if (V_Z.lengthSq() < 1e-5) V_Z.set(0, 0, 1);
  V_Z.normalize();
  V_Y.set(0, 1, 0);
  V_X.crossVectors(V_Y, V_Z).normalize();
  M_BASIS.makeBasis(V_X, V_Y, V_Z);
  Q_FOOT_WORLD.setFromRotationMatrix(M_BASIS);

  // Apply subtle toe splay yaw around world up (+Y)
  if (Math.abs(footYawDeltaRad) > 0.001) {
    Q_DELTA.setFromAxisAngle(V_Y.set(0, 1, 0), footYawDeltaRad);
    Q_FOOT_WORLD.multiply(Q_DELTA);
  }
  // Apply foot pitch around local lateral +X (+ = toes down, - = toes up)
  if (Math.abs(footPitchRad) > 0.001) {
    Q_DELTA.setFromAxisAngle(V_X.set(1, 0, 0), footPitchRad);
    Q_FOOT_WORLD.multiply(Q_DELTA);
  }

  Q_SOLVED_LOCAL.copy(Q_SHIN_INV).multiply(Q_FOOT_WORLD);
  if (weight < 0.999) {
    Q_CUR_LOCAL.copy(foot.quaternion);
    foot.quaternion.slerpQuaternions(Q_CUR_LOCAL, Q_SOLVED_LOCAL, weight);
  } else {
    foot.quaternion.copy(Q_SOLVED_LOCAL);
  }
  updateRootMatrixWorld(foot);
}

/**
 * Analytical 2-Bone Leg IK & Terrain Ground Contact Solver.
 * Prevents foot dragging, floating, ground penetration, and crouch-into-floor clipping
 * across flat ground, slopes, stairs, and uneven terrain with zero per-frame allocations.
 */
export function solveGroundedLegIK(params: SolveGroundedLegIKParams): void {
  const {
    bones,
    rootWorldPos,
    rigWorldQuat,
    crouchAmount,
    crouchClipWeight = 0,
    weight,
    groundSampler,
  } = params;
  if (weight <= 0.001) return;

  const w = weight >= 0.999 ? 1 : weight;
  const { hips, leftThigh, leftShin, leftFoot, rightThigh, rightShin, rightFoot } = bones;
  const hipsParent = hips.parent;
  if (!hipsParent) return;

  updateWorldMatrixChain(null, hipsParent);
  updateWorldMatrixChain(hipsParent, leftFoot);
  updateWorldMatrixChain(hipsParent, rightFoot);

  // Measure live segment lengths in world units (invariant to heightScale & modelScale)
  leftThigh.getWorldPosition(V_HIP_POS);
  leftShin.getWorldPosition(V_KNEE_POS);
  leftFoot.getWorldPosition(V_ANIM_ANKLE_L);
  const thighLen = V_HIP_POS.distanceTo(V_KNEE_POS);
  const shinLen = V_KNEE_POS.distanceTo(V_ANIM_ANKLE_L);
  if (thighLen < 0.05 || shinLen < 0.05) return;

  const totalLegLen = thighLen + shinLen;
  // In R6AnimationClips: thigh=0.34, shin=0.22 (0.56 total), rest ankle height above outsole=0.120
  const worldScale = totalLegLen / 0.56;
  const soleHeight = 0.120 * worldScale;

  rightFoot.getWorldPosition(V_ANIM_ANKLE_R);

  // Character forward (+Z) and right (-X in skeleton, +X in basis) projected horizontally
  V_ROOT_FWD.set(0, 0, 1).applyQuaternion(rigWorldQuat).setY(0);
  if (V_ROOT_FWD.lengthSq() < 1e-5) {
    V_ROOT_FWD.set(0, 0, 1);
  } else {
    V_ROOT_FWD.normalize();
  }
  V_ROOT_RIGHT.set(1, 0, 0).applyQuaternion(rigWorldQuat).setY(0);
  if (V_ROOT_RIGHT.lengthSq() < 1e-5) {
    V_ROOT_RIGHT.set(1, 0, 0);
  } else {
    V_ROOT_RIGHT.normalize();
  }

  // Apply only residual pelvis drop not already provided by CrouchIdle/CrouchWalk clip keyframes (never double-drop!)
  const crouchT = THREE.MathUtils.clamp(crouchAmount, 0, 1);
  const clipCrouchT = THREE.MathUtils.clamp(crouchClipWeight, 0, 1);
  const residualCrouchDrop = Math.max(0, crouchT - clipCrouchT);
  if (residualCrouchDrop > 0.001) {
    hips.position.y -= 0.19 * residualCrouchDrop * w;
    updateWorldMatrixChain(hipsParent, leftThigh);
    updateWorldMatrixChain(hips, rightThigh);
  }

  const leftInfo = measureFootTarget(
    V_ANIM_ANKLE_L,
    leftFoot,
    rootWorldPos,
    V_ROOT_FWD,
    soleHeight,
    worldScale,
    groundSampler,
  );
  const rightInfo = measureFootTarget(
    V_ANIM_ANKLE_R,
    rightFoot,
    rootWorldPos,
    V_ROOT_FWD,
    soleHeight,
    worldScale,
    groundSampler,
  );

  V_TGT_ANKLE_L.set(V_ANIM_ANKLE_L.x, leftInfo.targetAnkleY, V_ANIM_ANKLE_L.z);
  V_TGT_ANKLE_R.set(V_ANIM_ANKLE_R.x, rightInfo.targetAnkleY, V_ANIM_ANKLE_R.z);

  // Pull pelvis down when standing on slopes/stairs so downhill stance foot reaches terrain without hyperextension
  leftThigh.getWorldPosition(V_HIP_POS);
  const needReachL = V_HIP_POS.distanceTo(V_TGT_ANKLE_L);
  rightThigh.getWorldPosition(V_KNEE_POS);
  const needReachR = V_KNEE_POS.distanceTo(V_TGT_ANKLE_R);
  const maxSafeReach = totalLegLen * 0.990;
  const overReach = Math.max(0, Math.max(needReachL, needReachR) - maxSafeReach);
  if (overReach > 0.001) {
    const parentScaleY = Math.max(0.1, hipsParent.getWorldScale(V_CHECK).y);
    const localPelvisDrop = Math.min(0.28, (overReach * 1.08) / parentScaleY);
    hips.position.y -= localPelvisDrop * w;
    updateRootMatrixWorld(hips);
  }

  // Prevent pelvis / thighs from ever dropping dangerously close to ground
  if (hips.position.y < 0.36) {
    hips.position.y = 0.36;
    updateWorldMatrixChain(hipsParent, leftThigh);
    updateWorldMatrixChain(hips, rightThigh);
  }

  // Determine anatomical outward sign of each leg from its local X position; widen knees naturally in crouch
  const leftSign = leftThigh.position.x < 0 ? -1 : 1;
  const rightSign = rightThigh.position.x < 0 ? -1 : 1;
  const kneeSpread = THREE.MathUtils.lerp(0.14, 0.28, crouchT);

  // Solve Left Leg
  V_POLE.copy(V_ROOT_FWD).addScaledVector(V_ROOT_RIGHT, leftSign * kneeSpread).normalize();
  solveSingleLeg(
    leftThigh,
    leftShin,
    leftFoot,
    thighLen,
    shinLen,
    V_TGT_ANKLE_L,
    V_POLE,
    V_ROOT_FWD,
    leftInfo.animYawDeltaRad,
    leftInfo.slopePitchRad,
    w,
  );

  // Solve Right Leg
  V_POLE.copy(V_ROOT_FWD).addScaledVector(V_ROOT_RIGHT, rightSign * kneeSpread).normalize();
  solveSingleLeg(
    rightThigh,
    rightShin,
    rightFoot,
    thighLen,
    shinLen,
    V_TGT_ANKLE_R,
    V_POLE,
    V_ROOT_FWD,
    rightInfo.animYawDeltaRad,
    rightInfo.slopePitchRad,
    w,
  );
}
