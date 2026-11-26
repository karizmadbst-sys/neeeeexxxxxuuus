import * as THREE from 'three';
import type { ZiplineRidePlan } from '../player/IPlayerController';
import { clamp } from '../utils/MathUtils';
import type { OrientedVolumeCollider } from './BuildingSystem';
import type { MapId } from './IMapSystem';

export interface ZiplineSpec {
  id: string;
  label: string;
  startX: number;
  startZ: number;
  startOffsetY: number;
  endX: number;
  endZ: number;
  endOffsetY: number;
  bidirectional: boolean;
  speedMps?: number;
  accentHex?: string;
}

export interface ZiplineInstance {
  id: string;
  label: string;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startGroundY: number;
  endGroundY: number;
  archLift: number;
  length: number;
  bidirectional: boolean;
  speedMps: number;
  trolleyGroup: THREE.Group;
  idleT: number;
  activeRiderTimer: number;
}

export interface BuiltZiplineSet {
  root: THREE.Group;
  ziplines: ZiplineInstance[];
  colliders: OrientedVolumeCollider[];
  updateAnimations: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

export const MAP_ZIPLINES: Record<MapId, readonly ZiplineSpec[]> = {
  desert: [
    {
      id: 'desert-zip-mesa-north',
      label: 'MESA OVERLOOK EXPRESS',
      startX: -140,
      startZ: -350,
      startOffsetY: 2.5,
      endX: -72,
      endZ: -210,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#38bdf8',
    },
    {
      id: 'desert-zip-sunstone-hub',
      label: 'SUNSTONE PLAZA LINE',
      startX: -190,
      startZ: -170,
      startOffsetY: 2.55,
      endX: -62,
      endZ: -86,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#f59e0b',
    },
    {
      id: 'desert-zip-mirage-ridge',
      label: 'MIRAGE CANYON CROSSING',
      startX: 112,
      startZ: -235,
      startOffsetY: 2.5,
      endX: 256,
      endZ: -145,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 17.5,
      accentHex: '#38bdf8',
    },
    {
      id: 'desert-zip-refinery-west',
      label: 'REFINERY TOWER LINE',
      startX: -290,
      startZ: -44,
      startOffsetY: 2.55,
      endX: -165,
      endZ: 64,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#f59e0b',
    },
    {
      id: 'desert-zip-scorch-command',
      label: 'SCORCH COMMAND ZIP',
      startX: 98,
      startZ: 124,
      startOffsetY: 2.5,
      endX: 225,
      endZ: 215,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#38bdf8',
    },
    {
      id: 'desert-zip-mesa-south',
      label: 'SOUTH DUNE OVERLOOK',
      startX: 145,
      startZ: 365,
      startOffsetY: 2.5,
      endX: 52,
      endZ: 235,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 17.5,
      accentHex: '#22d3ee',
    },
    {
      id: 'desert-zip-sandstone-pass',
      label: 'SANDSTONE PASS',
      startX: -245,
      startZ: 195,
      startOffsetY: 2.5,
      endX: -120,
      endZ: 295,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#f59e0b',
    },
  ],
  forest: [
    {
      id: 'forest-zip-river-west',
      label: 'WEST RIVER CROSSING',
      startX: -245,
      startZ: 95,
      startOffsetY: 2.55,
      endX: -245,
      endZ: 205,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#22d3ee',
    },
    {
      id: 'forest-zip-river-central',
      label: 'CENTRAL RIVER CABLE',
      startX: 62,
      startZ: 98,
      startOffsetY: 2.55,
      endX: 78,
      endZ: 212,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#38bdf8',
    },
    {
      id: 'forest-zip-river-east',
      label: 'IRONWOOD RIVER ZIP',
      startX: 268,
      startZ: 74,
      startOffsetY: 2.55,
      endX: 282,
      endZ: 186,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#f59e0b',
    },
    {
      id: 'forest-zip-emerald-north',
      label: 'EMERALD RIDGE LINE',
      startX: -235,
      startZ: -260,
      startOffsetY: 2.5,
      endX: -102,
      endZ: -175,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#38bdf8',
    },
    {
      id: 'forest-zip-oakridge-metro',
      label: 'OAKRIDGE SKYLINE ZIP',
      startX: 118,
      startZ: -252,
      startOffsetY: 2.55,
      endX: 262,
      endZ: -165,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#22d3ee',
    },
    {
      id: 'forest-zip-pinewood-south',
      label: 'PINEWOOD CANOPY LINE',
      startX: -230,
      startZ: 268,
      startOffsetY: 2.5,
      endX: -88,
      endZ: 340,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#38bdf8',
    },
    {
      id: 'forest-zip-sawmill-south',
      label: 'SAWMILL RIDGE ZIP',
      startX: 115,
      startZ: 270,
      startOffsetY: 2.5,
      endX: 245,
      endZ: 348,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#f59e0b',
    },
  ],
  snow: [
    {
      id: 'snow-zip-glacier-lake-ns',
      label: 'GLACIER LAKE CROSSING',
      startX: 112,
      startZ: -195,
      startOffsetY: 2.55,
      endX: 112,
      endZ: -52,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#38bdf8',
    },
    {
      id: 'snow-zip-glacier-lake-ew',
      label: 'FROZEN BASIN EXPRESS',
      startX: 38,
      startZ: -124,
      startOffsetY: 2.55,
      endX: 192,
      endZ: -124,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#22d3ee',
    },
    {
      id: 'snow-zip-frosthaven-west',
      label: 'FROSTHAVEN RIDGE LINE',
      startX: -275,
      startZ: -255,
      startOffsetY: 2.5,
      endX: -145,
      endZ: -165,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#38bdf8',
    },
    {
      id: 'snow-zip-aurora-villas',
      label: 'AURORA SUMMIT ZIP',
      startX: 240,
      startZ: -265,
      startOffsetY: 2.55,
      endX: 348,
      endZ: -135,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#f59e0b',
    },
    {
      id: 'snow-zip-cryo-citadel',
      label: 'CRYO CITADEL TRANSIT',
      startX: 120,
      startZ: 120,
      startOffsetY: 2.55,
      endX: 255,
      endZ: 225,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#38bdf8',
    },
    {
      id: 'snow-zip-alpine-village',
      label: 'ALPINE PASS CABLE',
      startX: -260,
      startZ: 185,
      startOffsetY: 2.55,
      endX: -110,
      endZ: 265,
      endOffsetY: 2.55,
      bidirectional: true,
      speedMps: 17,
      accentHex: '#22d3ee',
    },
    {
      id: 'snow-zip-tundra-refinery',
      label: 'TUNDRA RELAY LINE',
      startX: -325,
      startZ: -40,
      startOffsetY: 2.5,
      endX: -185,
      endZ: 68,
      endOffsetY: 2.5,
      bidirectional: true,
      speedMps: 16.5,
      accentHex: '#f59e0b',
    },
  ],
};

function sampleVolumeObstacleTopAt(
  x: number,
  z: number,
  colliders: readonly OrientedVolumeCollider[],
): number {
  let maxTop = -Infinity;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const dx = x - c.cx;
    const dz = z - c.cz;
    const localX = dx * c.cosY - dz * c.sinY;
    const localZ = dx * c.sinY + dz * c.cosY;
    if (Math.abs(localX) <= c.halfW + 0.9 && Math.abs(localZ) <= c.halfD + 0.9) {
      if (c.maxY > maxTop) maxTop = c.maxY;
    }
  }
  return maxTop;
}

export function buildMapZiplines(
  specs: readonly ZiplineSpec[],
  getBaseTerrainY: (x: number, z: number) => number,
  worldColliders: readonly OrientedVolumeCollider[],
): BuiltZiplineSet {
  const root = new THREE.Group();
  root.name = 'MapZiplines';

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const ziplines: ZiplineInstance[] = [];
  const colliders: OrientedVolumeCollider[] = [];

  if (specs.length === 0) {
    return {
      root,
      ziplines,
      colliders,
      updateAnimations: () => {},
      dispose: () => {},
    };
  }

  const poleMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.38,
    metalness: 0.82,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.6,
    metalness: 0.55,
  });
  const cableMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.25,
    metalness: 0.9,
  });
  const trolleyMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#d97706',
    emissiveIntensity: 0.35,
    roughness: 0.32,
    metalness: 0.72,
  });
  const glowRingMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0ea5e9',
    emissiveIntensity: 1.45,
    roughness: 0.2,
    metalness: 0.15,
  });
  ownedMats.push(poleMat, baseMat, cableMat, trolleyMat, glowRingMat);

  const unitCylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const ringGeo = new THREE.TorusGeometry(0.46, 0.055, 8, 20);
  const trolleyBarGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.44, 8);
  trolleyBarGeo.rotateZ(Math.PI / 2);
  ownedGeos.push(unitCylGeo, unitBoxGeo, ringGeo, trolleyBarGeo);

  const upAxis = new THREE.Vector3(0, 1, 0);
  const tmpDir = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  const tmpSegA = new THREE.Vector3();
  const tmpSegB = new THREE.Vector3();

  for (const spec of specs) {
    // Keep anchor pylons clear of overlapping building footprints if any
    const nudgeClearOfObstacle = (bx: number, bz: number): [number, number] => {
      if (sampleVolumeObstacleTopAt(bx, bz, worldColliders) === -Infinity) {
        return [bx, bz];
      }
      const offsets = [
        [8, 0],
        [-8, 0],
        [0, 8],
        [0, -8],
        [12, 12],
        [-12, 12],
        [12, -12],
        [-12, -12],
      ];
      for (let k = 0; k < offsets.length; k++) {
        const cx = bx + offsets[k][0];
        const cz = bz + offsets[k][1];
        if (sampleVolumeObstacleTopAt(cx, cz, worldColliders) === -Infinity) {
          return [cx, cz];
        }
      }
      return [bx, bz];
    };

    const [startX, startZ] = nudgeClearOfObstacle(spec.startX, spec.startZ);
    const [endX, endZ] = nudgeClearOfObstacle(spec.endX, spec.endZ);

    const startGround = getBaseTerrainY(startX, startZ);
    const endGround = getBaseTerrainY(endX, endZ);

    // Keep BOTH launch & landing pylons strictly at reachable ground height (2.35m..2.65m)
    const startY = startGround + clamp(spec.startOffsetY, 2.35, 2.65);
    const endY = endGround + clamp(spec.endOffsetY, 2.35, 2.65);

    // Compute smooth parabolic mid-span arch lift (4*t*(1-t)) so cable clears intermediate hills/buildings
    // WITHOUT raising the start/end pylons out of player reach!
    const samples = 28;
    let archLift = 0;
    for (let s = 2; s <= samples - 2; s++) {
      const t = s / samples;
      const sx = startX + (endX - startX) * t;
      const sz = startZ + (endZ - startZ) * t;
      const baseSy = startY + (endY - startY) * t;
      const terrainH = getBaseTerrainY(sx, sz);
      const buildingTop = sampleVolumeObstacleTopAt(sx, sz, worldColliders);
      const minCableY = Math.max(terrainH + 2.35, buildingTop + 2.35);
      const needed = minCableY - baseSy;
      if (needed > 0) {
        const archFactor = Math.max(0.28, 4 * t * (1 - t));
        const reqArch = needed / archFactor;
        if (reqArch > archLift) {
          archLift = reqArch;
        }
      }
    }
    archLift = clamp(archLift, 0, 14);

    const startPos = new THREE.Vector3(startX, startY, startZ);
    const endPos = new THREE.Vector3(endX, endY, endZ);
    const delta = tmpDir.subVectors(endPos, startPos);
    const length = delta.length();
    if (length < 4) continue;

    const cableYaw = Math.atan2(delta.x, delta.z);
    const cosY = Math.cos(cableYaw);
    const sinY = Math.sin(cableYaw);

    // Build start and end anchor pylons at easily reachable heights
    const ends: Array<{ x: number; z: number; groundY: number; topY: number }> = [
      { x: startX, z: startZ, groundY: startGround, topY: startY },
      { x: endX, z: endZ, groundY: endGround, topY: endY },
    ];
    for (let eIdx = 0; eIdx < 2; eIdx++) {
      const ex = ends[eIdx].x;
      const ez = ends[eIdx].z;
      const egY = ends[eIdx].groundY;
      const topY = ends[eIdx].topY;
      const pylonH = Math.max(2.4, topY - egY + 0.35);

      const basePlinth = new THREE.Mesh(unitBoxGeo, baseMat);
      basePlinth.position.set(ex, egY + 0.18, ez);
      basePlinth.scale.set(1.05, 0.36, 1.05);
      basePlinth.rotation.y = cableYaw;
      basePlinth.receiveShadow = true;

      const mast = new THREE.Mesh(unitCylGeo, poleMat);
      mast.position.set(ex, egY + pylonH * 0.5, ez);
      mast.scale.set(0.14, pylonH, 0.14);
      mast.castShadow = true;

      const cap = new THREE.Mesh(unitBoxGeo, poleMat);
      cap.position.set(ex, topY + 0.14, ez);
      cap.scale.set(0.48, 0.22, 0.48);
      cap.rotation.y = cableYaw;

      const glowRing = new THREE.Mesh(ringGeo, glowRingMat);
      glowRing.position.set(ex, topY - 0.36, ez);
      glowRing.rotation.x = Math.PI / 2;

      root.add(basePlinth, mast, cap, glowRing);

      colliders.push({
        cx: ex,
        cz: ez,
        halfW: 0.34,
        halfD: 0.34,
        cosY,
        sinY,
        minY: egY,
        maxY: topY + 0.35,
        steppable: false,
      });
    }

    // Tensioned steel zipline cable spanning startPos -> endPos (segmented arch if archLift > 0.05)
    const segCount = archLift > 0.05 ? 16 : 1;
    for (let seg = 0; seg < segCount; seg++) {
      const t0 = seg / segCount;
      const t1 = (seg + 1) / segCount;
      tmpSegA.lerpVectors(startPos, endPos, t0);
      tmpSegA.y += archLift * 4 * t0 * (1 - t0);
      tmpSegB.lerpVectors(startPos, endPos, t1);
      tmpSegB.y += archLift * 4 * t1 * (1 - t1);

      tmpDir.subVectors(tmpSegB, tmpSegA);
      const segLen = tmpDir.length();
      if (segLen < 0.01) continue;
      const cableMesh = new THREE.Mesh(unitCylGeo, cableMat);
      cableMesh.position.copy(tmpSegA).add(tmpSegB).multiplyScalar(0.5);
      cableMesh.scale.set(0.036, segLen + 0.03, 0.036);
      tmpQuat.setFromUnitVectors(upAxis, tmpDir.normalize());
      cableMesh.quaternion.copy(tmpQuat);
      root.add(cableMesh);
    }

    // Moving pulley + dual handlebar assembly
    const trolleyGroup = new THREE.Group();
    const housing = new THREE.Mesh(unitBoxGeo, trolleyMat);
    housing.scale.set(0.18, 0.16, 0.28);
    const stem = new THREE.Mesh(unitCylGeo, poleMat);
    stem.position.y = -0.14;
    stem.scale.set(0.03, 0.18, 0.03);
    const handlebar = new THREE.Mesh(trolleyBarGeo, trolleyMat);
    handlebar.position.y = -0.22;
    trolleyGroup.add(housing, stem, handlebar);
    const restT = 0.03;
    trolleyGroup.position.lerpVectors(startPos, endPos, restT);
    trolleyGroup.position.y += archLift * 4 * restT * (1 - restT);
    trolleyGroup.rotation.y = cableYaw;
    root.add(trolleyGroup);

    ziplines.push({
      id: spec.id,
      label: spec.label,
      startPos,
      endPos,
      startGroundY: startGround,
      endGroundY: endGround,
      archLift,
      length,
      bidirectional: spec.bidirectional,
      speedMps: spec.speedMps ?? 16.8,
      trolleyGroup,
      idleT: restT,
      activeRiderTimer: 0,
    });
  }

  return {
    root,
    ziplines,
    colliders,
    updateAnimations: (delta, elapsed) => {
      for (let i = 0; i < ziplines.length; i++) {
        const z = ziplines[i];
        if (z.activeRiderTimer > 0) {
          z.activeRiderTimer = Math.max(0, z.activeRiderTimer - delta);
        } else {
          const restT = 0.03 + Math.sin(elapsed * 1.4 + i) * 0.01;
          z.trolleyGroup.position.lerpVectors(z.startPos, z.endPos, restT);
          z.trolleyGroup.position.y += z.archLift * 4 * restT * (1 - restT);
        }
      }
    },
    dispose: () => {
      for (const g of ownedGeos) g.dispose();
      for (const m of ownedMats) m.dispose();
      ownedGeos.length = 0;
      ownedMats.length = 0;
    },
  };
}

export function findNearestZiplinePlan(
  ziplines: readonly ZiplineInstance[],
  playerPos: THREE.Vector3,
  lookDirX: number,
  lookDirZ: number,
  maxAttachRange = 4.2,
): ZiplineRidePlan | null {
  let best: ZiplineRidePlan | null = null;
  let bestDist = maxAttachRange;

  for (let i = 0; i < ziplines.length; i++) {
    const z = ziplines[i];
    const distToStart = Math.hypot(
      playerPos.x - z.startPos.x,
      playerPos.z - z.startPos.z,
    );
    const dyStartAnchor = Math.abs(playerPos.y + 1.5 - z.startPos.y);
    const dyStartGround = Math.abs(playerPos.y - z.startGroundY);

    const distToEnd = Math.hypot(
      playerPos.x - z.endPos.x,
      playerPos.z - z.endPos.z,
    );
    const dyEndAnchor = Math.abs(playerPos.y + 1.5 - z.endPos.y);
    const dyEndGround = Math.abs(playerPos.y - z.endGroundY);

    const canStartFromA =
      distToStart <= bestDist && (dyStartAnchor <= 2.6 || dyStartGround <= 2.3);
    const canStartFromB =
      z.bidirectional &&
      distToEnd <= bestDist &&
      (dyEndAnchor <= 2.6 || dyEndGround <= 2.3);

    const safeStartT = clamp(0.9 / Math.max(4, z.length), 0.015, 0.06);

    if (canStartFromA && (!canStartFromB || distToStart <= distToEnd)) {
      const dx = z.endPos.x - z.startPos.x;
      const dz = z.endPos.z - z.startPos.z;
      const dot = (dx * lookDirX + dz * lookDirZ) / Math.max(0.01, Math.hypot(dx, dz));
      if (dot > -0.65 || distToStart <= 3.0) {
        bestDist = distToStart;
        best = {
          ziplineId: z.id,
          label: z.label,
          startX: z.startPos.x,
          startY: z.startPos.y,
          startZ: z.startPos.z,
          endX: z.endPos.x,
          endY: z.endPos.y,
          endZ: z.endPos.z,
          archLift: z.archLift,
          startT: Math.max(safeStartT, clamp(distToStart / Math.max(1, z.length), 0.015, 0.07)),
          reverse: false,
          speedMps: z.speedMps,
          yaw: Math.atan2(dx, dz),
        };
      }
    } else if (canStartFromB) {
      const dx = z.startPos.x - z.endPos.x;
      const dz = z.startPos.z - z.endPos.z;
      const dot = (dx * lookDirX + dz * lookDirZ) / Math.max(0.01, Math.hypot(dx, dz));
      if (dot > -0.65 || distToEnd <= 3.0) {
        bestDist = distToEnd;
        best = {
          ziplineId: z.id,
          label: z.label,
          startX: z.endPos.x,
          startY: z.endPos.y,
          startZ: z.endPos.z,
          endX: z.startPos.x,
          endY: z.startPos.y,
          endZ: z.startPos.z,
          archLift: z.archLift,
          startT: Math.max(safeStartT, clamp(distToEnd / Math.max(1, z.length), 0.015, 0.07)),
          reverse: true,
          speedMps: z.speedMps,
          yaw: Math.atan2(dx, dz),
        };
      }
    }
  }

  return best;
}
