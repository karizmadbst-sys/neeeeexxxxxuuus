import * as THREE from 'three';
import { updateRootMatrixWorld, updateWorldMatrixChain } from '../utils/TransformUtils';

// Preallocated module-level scratch math objects for zero-GC mobile/PC IK evaluation
const V_SHOULDER = new THREE.Vector3();
const V_TARGET = new THREE.Vector3();
const V_TO_TARGET = new THREE.Vector3();
const V_DIR = new THREE.Vector3();
const V_POLE_WORLD = new THREE.Vector3();
const V_BEND_NORMAL = new THREE.Vector3();
const V_UPPER_TARGET_DIR = new THREE.Vector3();
const V_ELBOW = new THREE.Vector3();
const V_FORE_TARGET_DIR = new THREE.Vector3();
const V_PARENT_DIR = new THREE.Vector3();
const V_FORE_LOCAL_TARGET = new THREE.Vector3();
const V_REST_AXIS_Y_NEG = new THREE.Vector3(0, -1, 0);
const V_X = new THREE.Vector3();
const V_Y = new THREE.Vector3();
const V_Z = new THREE.Vector3();
const V_CLAV_TGT_LOCAL = new THREE.Vector3();

const Q_PARENT_WORLD = new THREE.Quaternion();
const Q_PARENT_INV = new THREE.Quaternion();
const Q_DELTA = new THREE.Quaternion();
const Q_LOCAL_SOLVED = new THREE.Quaternion();
const Q_UPPER_WORLD = new THREE.Quaternion();
const Q_UPPER_WORLD_INV = new THREE.Quaternion();
const Q_FORE_WORLD = new THREE.Quaternion();
const Q_FORE_WORLD_INV = new THREE.Quaternion();
const Q_HAND_DESIRED_LOCAL = new THREE.Quaternion();
const Q_CUR_LOCAL = new THREE.Quaternion();
const Q_IDENTITY = new THREE.Quaternion();
const M_BASIS = new THREE.Matrix4();

export interface TwoBoneArmBones {
  shoulder?: THREE.Bone | null;
  shoulderRestQuat?: THREE.Quaternion | null;
  upperArm: THREE.Bone;
  forearm: THREE.Bone;
  hand: THREE.Bone;
}

export interface SolveArmIKParams {
  bones: TwoBoneArmBones;
  /** World-space position where the hand's wrist/palm target should sit. */
  targetWristWorldPos: THREE.Vector3;
  /** Optional world-space orientation for the hand bone. */
  targetHandWorldQuat?: THREE.Quaternion | null;
  /** World-space pole vector biasing elbow outward/downward anatomically. */
  elbowPoleWorldDir: THREE.Vector3;
  /** 0..1 blend weight over the animated clip pose. */
  weight: number;
  /** Clavicle protraction assist 0..0.35 so shoulder pulls slightly toward target. */
  clavicleAssist?: number;
}

/**
 * Analytical 2-bone analytical law-of-cosines IK solver for Humanoid arms.
 * Bone rest convention in HumanoidSkeletonClips:
 *   Forearm.position = (0, -L1, 0), Hand.position = (0, -L2, 0).
 * Zero allocations per frame.
 */
export function solveTwoBoneArmIK(params: SolveArmIKParams): void {
  const { bones, targetWristWorldPos, targetHandWorldQuat, elbowPoleWorldDir, weight } = params;
  if (weight <= 0.001) return;

  const w = weight >= 0.999 ? 1 : weight;
  const { shoulder, upperArm, forearm, hand } = bones;

  // Dynamic bone segment lengths (automatically honors def.heightScale & rigPivot scale)
  const parentObj = upperArm.parent;
  if (!parentObj) return;
  updateWorldMatrixChain(null, hand);

  upperArm.getWorldPosition(V_SHOULDER);
  forearm.getWorldPosition(V_ELBOW);
  hand.getWorldPosition(V_TARGET);

  const l1 = V_SHOULDER.distanceTo(V_ELBOW);
  const l2 = V_ELBOW.distanceTo(V_TARGET);
  if (l1 < 0.02 || l2 < 0.02) return;

  // Optional gentle clavicle protraction so left/right shoulder tracks cross-body rifle grips naturally
  const clavAssist = params.clavicleAssist ?? 0.22;
  if (shoulder && clavAssist > 0.001 && shoulder.parent) {
    updateWorldMatrixChain(null, shoulder);
    shoulder.parent.getWorldQuaternion(Q_PARENT_WORLD);
    Q_PARENT_INV.copy(Q_PARENT_WORLD).invert();
    shoulder.getWorldPosition(V_X);
    V_Y.copy(targetWristWorldPos).sub(V_X);
    const len = V_Y.length();
    if (len > 0.05) {
      V_Y.multiplyScalar(1 / len);
      V_CLAV_TGT_LOCAL.copy(V_Y).applyQuaternion(Q_PARENT_INV);
      // Slight pitch/yaw protraction toward target (max ~0.24 rad)
      const isLeft = upperArm.position.x < 0;
      const forwardBias = THREE.MathUtils.clamp(V_CLAV_TGT_LOCAL.z * clavAssist, -0.18, 0.24);
      const liftBias = THREE.MathUtils.clamp(V_CLAV_TGT_LOCAL.y * clavAssist * 0.6, -0.1, 0.16);
      Q_CUR_LOCAL.copy(bones.shoulderRestQuat ?? Q_IDENTITY);
      Q_DELTA.setFromAxisAngle(V_Z.set(0, 1, 0), isLeft ? forwardBias : -forwardBias);
      Q_LOCAL_SOLVED.copy(Q_CUR_LOCAL).multiply(Q_DELTA);
      Q_DELTA.setFromAxisAngle(V_Z.set(0, 0, 1), isLeft ? -liftBias : liftBias);
      Q_LOCAL_SOLVED.multiply(Q_DELTA);
      if (w < 1) {
        shoulder.quaternion.slerpQuaternions(Q_CUR_LOCAL, Q_LOCAL_SOLVED, w);
      } else {
        shoulder.quaternion.copy(Q_LOCAL_SOLVED);
      }
      updateWorldMatrixChain(shoulder.parent, upperArm);
    }
  }

  // Re-read world shoulder & parent frame after optional clavicle assist
  updateWorldMatrixChain(parentObj.parent, upperArm);
  upperArm.getWorldPosition(V_SHOULDER);
  parentObj.getWorldQuaternion(Q_PARENT_WORLD);
  Q_PARENT_INV.copy(Q_PARENT_WORLD).invert();

  V_TO_TARGET.copy(targetWristWorldPos).sub(V_SHOULDER);
  const rawDist = V_TO_TARGET.length();
  if (rawDist < 0.0001) return;

  const minReach = Math.max(0.06, Math.abs(l1 - l2) + 0.025);
  const maxReach = (l1 + l2) * 0.988;
  const dist = THREE.MathUtils.clamp(rawDist, minReach, maxReach);

  V_DIR.copy(V_TO_TARGET).multiplyScalar(1 / rawDist);

  // Build orthonormal bend plane using elbow pole direction
  V_POLE_WORLD.copy(elbowPoleWorldDir);
  if (V_POLE_WORLD.lengthSq() < 0.0001) {
    V_POLE_WORLD.set(0, -1, -0.4);
  }
  V_POLE_WORLD.normalize();

  // Project pole orthogonal to target ray
  const poleProj = V_POLE_WORLD.dot(V_DIR);
  V_BEND_NORMAL.copy(V_POLE_WORLD).addScaledVector(V_DIR, -poleProj);
  if (V_BEND_NORMAL.lengthSq() < 0.0001) {
    V_BEND_NORMAL.set(0, -1, 0);
    const p2 = V_BEND_NORMAL.dot(V_DIR);
    V_BEND_NORMAL.addScaledVector(V_DIR, -p2);
    if (V_BEND_NORMAL.lengthSq() < 0.0001) {
      V_BEND_NORMAL.set(1, 0, 0);
    }
  }
  V_BEND_NORMAL.normalize();

  // Law of cosines for upper-arm angle from shoulder->target line toward pole
  const cosAlpha = THREE.MathUtils.clamp(
    (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist),
    -0.999,
    0.999,
  );
  const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

  V_UPPER_TARGET_DIR.copy(V_DIR)
    .multiplyScalar(cosAlpha)
    .addScaledVector(V_BEND_NORMAL, sinAlpha)
    .normalize();

  // Exact world elbow position & forearm direction
  V_ELBOW.copy(V_SHOULDER).addScaledVector(V_UPPER_TARGET_DIR, l1);
  V_FORE_TARGET_DIR.copy(V_SHOULDER)
    .addScaledVector(V_DIR, dist)
    .sub(V_ELBOW);
  const foreLen = V_FORE_TARGET_DIR.length();
  if (foreLen > 0.0001) {
    V_FORE_TARGET_DIR.multiplyScalar(1 / foreLen);
  } else {
    V_FORE_TARGET_DIR.copy(V_DIR);
  }

  // Twist-controlled upper-arm orientation:
  // Bone -Y = V_UPPER_TARGET_DIR, hinge +X = elbow bend axis (V_UPPER_TARGET_DIR x V_FORE_TARGET_DIR)
  // Wait: rotating forearm by -angle around +X swings (0,-1,0) forward toward (+Z).
  // Let's compute hinge axis cleanly: cross(V_UPPER_TARGET_DIR, V_FORE_TARGET_DIR) = +X_upper (or -X_upper).
  V_Y.copy(V_UPPER_TARGET_DIR).negate(); // +Y axis of upperArm
  V_X.crossVectors(V_FORE_TARGET_DIR, V_UPPER_TARGET_DIR);
  if (V_X.lengthSq() < 0.00001) {
    // Nearly straight arm fallback: derive X from cross(V_DIR, V_BEND_NORMAL)
    V_X.crossVectors(V_DIR, V_BEND_NORMAL);
  }
  if (V_X.lengthSq() < 0.00001) {
    V_X.set(1, 0, 0).addScaledVector(V_Y, -V_Y.x);
    if (V_X.lengthSq() < 0.00001) V_X.set(0, 0, 1);
  }
  V_X.normalize();
  V_Z.crossVectors(V_X, V_Y);
  if (V_Z.lengthSq() < 0.00001) {
    V_Z.set(0, 0, 1);
  } else {
    V_Z.normalize();
  }
  V_X.crossVectors(V_Y, V_Z).normalize();
  M_BASIS.makeBasis(V_X, V_Y, V_Z);
  Q_UPPER_WORLD.setFromRotationMatrix(M_BASIS);

  Q_LOCAL_SOLVED.copy(Q_PARENT_INV).multiply(Q_UPPER_WORLD);
  if (w < 1) {
    Q_CUR_LOCAL.copy(upperArm.quaternion);
    upperArm.quaternion.slerpQuaternions(Q_CUR_LOCAL, Q_LOCAL_SOLVED, w);
  } else {
    upperArm.quaternion.copy(Q_LOCAL_SOLVED);
  }
  updateRootMatrixWorld(upperArm);

  // Solve forearm local rotation cleanly relative to actual upperArm world matrix
  upperArm.getWorldQuaternion(Q_UPPER_WORLD);
  Q_UPPER_WORLD_INV.copy(Q_UPPER_WORLD).invert();
  V_FORE_LOCAL_TARGET.copy(V_FORE_TARGET_DIR).applyQuaternion(Q_UPPER_WORLD_INV);
  if (V_FORE_LOCAL_TARGET.lengthSq() < 1e-6) {
    V_FORE_LOCAL_TARGET.copy(V_REST_AXIS_Y_NEG);
  } else {
    V_FORE_LOCAL_TARGET.normalize();
  }

  // Also keep hand +Z/thumb twist comfortable by building forearm basis from upperArm twist
  V_Y.copy(V_FORE_LOCAL_TARGET).negate();
  // Forearm local X stays aligned with upperArm's X hinge axis unless forearm isn't coplanar
  V_PARENT_DIR.set(1, 0, 0);
  const xProj = V_PARENT_DIR.dot(V_Y);
  V_X.copy(V_PARENT_DIR).addScaledVector(V_Y, -xProj);
  if (V_X.lengthSq() < 0.0001) {
    V_X.set(0, 0, 1).addScaledVector(V_Y, -V_Y.z);
  }
  if (V_X.lengthSq() < 0.0001) {
    V_X.set(1, 0, 0);
  } else {
    V_X.normalize();
  }
  V_Z.crossVectors(V_X, V_Y);
  if (V_Z.lengthSq() < 0.00001) {
    Q_LOCAL_SOLVED.setFromUnitVectors(V_REST_AXIS_Y_NEG, V_FORE_LOCAL_TARGET);
  } else {
    V_Z.normalize();
    V_X.crossVectors(V_Y, V_Z).normalize();
    M_BASIS.makeBasis(V_X, V_Y, V_Z);
    Q_LOCAL_SOLVED.setFromRotationMatrix(M_BASIS);

    // Ensure -Y axis actually matches V_FORE_LOCAL_TARGET
    V_CLAV_TGT_LOCAL.copy(V_REST_AXIS_Y_NEG).applyQuaternion(Q_LOCAL_SOLVED);
    if (V_CLAV_TGT_LOCAL.dot(V_FORE_LOCAL_TARGET) < 0.999) {
      Q_DELTA.setFromUnitVectors(V_REST_AXIS_Y_NEG, V_FORE_LOCAL_TARGET);
      Q_LOCAL_SOLVED.copy(Q_DELTA);
    }
  }

  if (w < 1) {
    Q_CUR_LOCAL.copy(forearm.quaternion);
    forearm.quaternion.slerpQuaternions(Q_CUR_LOCAL, Q_LOCAL_SOLVED, w);
  } else {
    forearm.quaternion.copy(Q_LOCAL_SOLVED);
  }
  updateRootMatrixWorld(forearm);

  // Optionally orient Hand to match weapon grip orientation
  if (targetHandWorldQuat) {
    forearm.getWorldQuaternion(Q_FORE_WORLD);
    Q_FORE_WORLD_INV.copy(Q_FORE_WORLD).invert();
    Q_HAND_DESIRED_LOCAL.copy(Q_FORE_WORLD_INV).multiply(targetHandWorldQuat);
    if (w < 1) {
      Q_CUR_LOCAL.copy(hand.quaternion);
      hand.quaternion.slerpQuaternions(Q_CUR_LOCAL, Q_HAND_DESIRED_LOCAL, w);
    } else {
      hand.quaternion.copy(Q_HAND_DESIRED_LOCAL);
    }
    updateRootMatrixWorld(hand);
  }
}

/**
 * Helper to compute the wrist target position in world space given a desired world palm position,
 * desired hand world quaternion, and palm offset in hand-bone local space.
 */
export function computeWristPosFromPalmTarget(
  palmWorldPos: THREE.Vector3,
  handWorldQuat: THREE.Quaternion,
  palmLocalOffset: THREE.Vector3,
  outWristWorldPos: THREE.Vector3,
  rigScale = 1.0,
): THREE.Vector3 {
  V_X.copy(palmLocalOffset).multiplyScalar(rigScale).applyQuaternion(handWorldQuat);
  outWristWorldPos.copy(palmWorldPos).sub(V_X);
  return outWristWorldPos;
}
