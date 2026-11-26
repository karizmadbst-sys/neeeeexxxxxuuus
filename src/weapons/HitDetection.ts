import * as THREE from 'three';
import type { DamageCalculationResult } from './DamageSystem';

export interface DamageableTarget {
  readonly id: string;
  readonly name: string;
  readonly headMesh: THREE.Object3D;
  readonly bodyMesh: THREE.Object3D;
  readonly isAlive: boolean;
  readonly shield: number;
  readonly health: number;
  readonly damageReductionPct: number;
  readonly isAlly?: boolean;
  applyHitDamage(result: DamageCalculationResult): void;
}

export interface HitSegmentResult {
  hit: boolean;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  target: DamageableTarget | null;
  isHeadshot: boolean;
}

export type FastLosChecker = (
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
) => boolean;

export type FastEnvRaycaster = (
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  near: number,
  far: number,
  outPoint: THREE.Vector3 | null,
  outNormal: THREE.Vector3 | null,
) => number;

export interface GlooWallRaycasterHooks {
  raycastSegment: (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    near: number,
    far: number,
    outPoint: THREE.Vector3 | null,
    outNormal: THREE.Vector3 | null,
  ) => { dist: number; target: DamageableTarget } | null;
  hasLineOfSight: (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ) => boolean;
}

interface EnvMeshEntry {
  mesh: THREE.Object3D;
  box: THREE.Box3;
}

interface EnvCandidate {
  entry: EnvMeshEntry;
  enterDistSq: number;
}

export class HitDetection {
  private readonly raycaster = new THREE.Raycaster();
  private readonly dir = new THREE.Vector3();
  private readonly targets: DamageableTarget[] = [];
  private readonly targetLookup = new Map<THREE.Object3D, { target: DamageableTarget; isHead: boolean }>();
  private readonly targetMeshes: THREE.Object3D[] = [];
  private readonly broadphaseMeshes: THREE.Object3D[] = [];
  private environmentMeshes: readonly THREE.Object3D[] = [];
  private readonly envEntries: EnvMeshEntry[] = [];
  private readonly candidates: EnvCandidate[] = [];
  private readonly singleHitArr: THREE.Intersection[] = [];
  private readonly targetHitArr: THREE.Intersection[] = [];
  private readonly scratchBoxHit = new THREE.Vector3();
  private readonly scratchEnvPoint = new THREE.Vector3();
  private readonly scratchEnvNormal = new THREE.Vector3();
  private readonly scratchGlooPoint = new THREE.Vector3();
  private readonly scratchGlooNormal = new THREE.Vector3();
  private readonly scratchTargetPos = new THREE.Vector3();
  private fastLosChecker?: FastLosChecker;
  private fastEnvRaycaster?: FastEnvRaycaster;
  private glooWallHooks?: GlooWallRaycasterHooks;

  setFastLosChecker(checker?: FastLosChecker): void {
    this.fastLosChecker = checker;
  }

  setFastEnvironmentRaycaster(raycaster?: FastEnvRaycaster): void {
    this.fastEnvRaycaster = raycaster;
  }

  setGlooWallHooks(hooks?: GlooWallRaycasterHooks): void {
    this.glooWallHooks = hooks;
  }

  setEnvironmentMeshes(meshes: readonly THREE.Object3D[]): void {
    this.environmentMeshes = meshes;
    this.envEntries.length = 0;
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      mesh.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromObject(mesh);
      this.envEntries.push({ mesh, box });
    }
  }

  private intersectEnvironmentClosest(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    near: number,
    far: number,
    collectDetails: boolean,
  ): number {
    if (this.fastEnvRaycaster) {
      return this.fastEnvRaycaster(
        origin,
        direction,
        near,
        far,
        collectDetails ? this.scratchEnvPoint : null,
        collectDetails ? this.scratchEnvNormal : null,
      );
    }

    if (this.envEntries.length === 0) return Number.POSITIVE_INFINITY;

    this.raycaster.set(origin, direction);
    this.raycaster.near = near;
    this.raycaster.far = far;
    const ray = this.raycaster.ray;
    const cands = this.candidates;
    cands.length = 0;
    const farSq = far * far;

    for (let i = 0; i < this.envEntries.length; i++) {
      const entry = this.envEntries[i];
      if (!entry.mesh.visible) continue;
      if (entry.box.containsPoint(origin)) {
        cands.push({ entry, enterDistSq: 0 });
      } else {
        const hitPt = ray.intersectBox(entry.box, this.scratchBoxHit);
        if (hitPt) {
          const dSq = origin.distanceToSquared(hitPt);
          if (dSq <= farSq) {
            cands.push({ entry, enterDistSq: dSq });
          }
        }
      }
    }

    if (cands.length === 0) return Number.POSITIVE_INFINITY;
    if (cands.length > 1) {
      cands.sort((a, b) => a.enterDistSq - b.enterDistSq);
    }

    let bestDist = far + 1;
    let found = false;
    const hits = this.singleHitArr;

    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (c.enterDistSq >= bestDist * bestDist) break;
      hits.length = 0;
      this.raycaster.far = Math.min(far, bestDist);
      this.raycaster.intersectObject(c.entry.mesh, false, hits);
      if (hits.length > 0 && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        found = true;
        if (collectDetails) {
          this.scratchEnvPoint.copy(hits[0].point);
          if (hits[0].face) {
            this.scratchEnvNormal
              .copy(hits[0].face.normal)
              .transformDirection(hits[0].object.matrixWorld);
          } else {
            this.scratchEnvNormal.copy(direction).negate();
          }
        }
      }
    }

    return found ? bestDist : Number.POSITIVE_INFINITY;
  }

  /**
   * Filters target meshes down to only alive targets whose silhouette cylinder lies within ~1.6m of the ray.
   * Avoids invoking Three.js Mesh.raycast() matrix inversions across 24-100 irrelevant bots per bullet.
   */
  private gatherBroadphaseTargetMeshes(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    near: number,
    far: number,
  ): number {
    const out = this.broadphaseMeshes;
    out.length = 0;
    const minProj = Math.max(-1.5, near - 1.5);
    const maxProj = far + 1.5;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t.isAlive || t.isAlly || !t.bodyMesh.visible) continue;
      t.bodyMesh.updateWorldMatrix(true, false);
      // Read world center directly from matrixWorld translation when available, fallback to getWorldPosition
      const e = t.bodyMesh.matrixWorld.elements;
      let tx = e[12];
      let ty = e[13];
      let tz = e[14];
      if (tx === 0 && ty === 0 && tz === 0) {
        t.bodyMesh.getWorldPosition(this.scratchTargetPos);
        tx = this.scratchTargetPos.x;
        ty = this.scratchTargetPos.y;
        tz = this.scratchTargetPos.z;
      }

      const rx = tx - ox;
      const ry = ty + 0.35 - oy;
      const rz = tz - oz;
      const proj = rx * dx + ry * dy + rz * dz;
      if (proj < minProj || proj > maxProj) continue;

      const px = rx - dx * proj;
      const py = ry - dy * proj;
      const pz = rz - dz * proj;
      // 1.75m generous radius easily covers both torso and head hitboxes
      if (px * px + py * py + pz * pz <= 1.75 * 1.75) {
        t.headMesh.updateWorldMatrix(true, false);
        out.push(t.headMesh, t.bodyMesh);
      }
    }
    return out.length;
  }

  getTargets(): readonly DamageableTarget[] {
    return this.targets;
  }

  registerTarget(target: DamageableTarget): void {
    if (this.targets.includes(target)) return;
    this.targets.push(target);
    this.targetLookup.set(target.headMesh, { target, isHead: true });
    this.targetLookup.set(target.bodyMesh, { target, isHead: false });
    this.targetMeshes.push(target.headMesh, target.bodyMesh);
  }

  unregisterTarget(target: DamageableTarget): void {
    const idx = this.targets.indexOf(target);
    if (idx === -1) return;
    this.targets[idx] = this.targets[this.targets.length - 1];
    this.targets.pop();
    this.targetLookup.delete(target.headMesh);
    this.targetLookup.delete(target.bodyMesh);

    const headIdx = this.targetMeshes.indexOf(target.headMesh);
    if (headIdx !== -1) {
      this.targetMeshes[headIdx] = this.targetMeshes[this.targetMeshes.length - 1];
      this.targetMeshes.pop();
    }
    const bodyIdx = this.targetMeshes.indexOf(target.bodyMesh);
    if (bodyIdx !== -1) {
      this.targetMeshes[bodyIdx] = this.targetMeshes[this.targetMeshes.length - 1];
      this.targetMeshes.pop();
    }
  }

  clearTargets(): void {
    this.targets.length = 0;
    this.targetLookup.clear();
    this.targetMeshes.length = 0;
  }

  raycastSegment(
    start: THREE.Vector3,
    end: THREE.Vector3,
    out: HitSegmentResult,
  ): HitSegmentResult {
    out.hit = false;
    out.target = null;
    out.isHeadshot = false;

    this.dir.copy(end).sub(start);
    const segLen = this.dir.length();
    if (segLen <= 0.0001) {
      return out;
    }

    this.dir.divideScalar(segLen);
    let bestDist = segLen + 1;

    // 1. Check environment geometry via fast O(1) spatial grid DDA + terrain or Box3-culled fallback
    if (this.fastEnvRaycaster || this.environmentMeshes.length > 0) {
      const envDist = this.intersectEnvironmentClosest(
        start,
        this.dir,
        0,
        segLen,
        true,
      );
      if (envDist < bestDist) {
        bestDist = envDist;
        out.hit = true;
        out.point.copy(this.scratchEnvPoint);
        out.normal.copy(this.scratchEnvNormal);
        out.distance = envDist;
      }
    }

    // 1b. Check dynamic Gloo Walls so bullets physically collide with deployed ice barriers
    if (this.glooWallHooks) {
      const gHit = this.glooWallHooks.raycastSegment(
        start,
        this.dir,
        0,
        Math.min(segLen, bestDist),
        this.scratchGlooPoint,
        this.scratchGlooNormal,
      );
      if (gHit && gHit.dist < bestDist) {
        bestDist = gHit.dist;
        out.hit = true;
        out.point.copy(this.scratchGlooPoint);
        out.normal.copy(this.scratchGlooNormal);
        out.distance = gHit.dist;
        out.target = gHit.target;
        out.isHeadshot = false;
      }
    }

    // 2. Check registered targets (head & body hitboxes) after fast sphere broadphase
    if (this.targets.length > 0) {
      const maxCheckDist = Math.min(segLen, bestDist);
      if (this.gatherBroadphaseTargetMeshes(start, this.dir, 0, maxCheckDist) > 0) {
        this.raycaster.set(start, this.dir);
        this.raycaster.near = 0;
        this.raycaster.far = maxCheckDist;
        this.targetHitArr.length = 0;
        const targetHits = this.raycaster.intersectObjects(
          this.broadphaseMeshes,
          false,
          this.targetHitArr,
        );
        for (let i = 0; i < targetHits.length; i++) {
          const h = targetHits[i];
          if (h.distance >= bestDist) break;
          const meta = this.targetLookup.get(h.object);
          if (!meta || !meta.target.isAlive || meta.target.isAlly) continue;

          bestDist = h.distance;
          out.hit = true;
          out.point.copy(h.point);
          if (h.face) {
            out.normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
          } else {
            out.normal.copy(this.dir).negate();
          }
          out.distance = h.distance;
          out.target = meta.target;
          out.isHeadshot = meta.isHead;
          break;
        }
      }
    }

    return out;
  }

  /**
   * Computes a world-space aim point from the camera center ray so shots converge exactly on the reticle.
   */
  resolveAimTargetPoint(
    rayOrigin: THREE.Vector3,
    rayDirection: THREE.Vector3,
    maxDistance: number,
    outPoint: THREE.Vector3,
    nearDistance = 1.6,
  ): void {
    let closest = maxDistance;

    if (this.fastEnvRaycaster || this.environmentMeshes.length > 0) {
      const envDist = this.intersectEnvironmentClosest(
        rayOrigin,
        rayDirection,
        nearDistance,
        maxDistance,
        false,
      );
      if (envDist < closest) {
        closest = envDist;
      }
    }

    if (this.glooWallHooks) {
      const gHit = this.glooWallHooks.raycastSegment(
        rayOrigin,
        rayDirection,
        nearDistance,
        closest,
        null,
        null,
      );
      if (gHit && gHit.dist < closest) {
        closest = gHit.dist;
      }
    }

    if (this.targets.length > 0) {
      if (this.gatherBroadphaseTargetMeshes(rayOrigin, rayDirection, nearDistance, closest) > 0) {
        this.raycaster.set(rayOrigin, rayDirection);
        this.raycaster.near = nearDistance;
        this.raycaster.far = closest;
        this.targetHitArr.length = 0;
        const targetHits = this.raycaster.intersectObjects(
          this.broadphaseMeshes,
          false,
          this.targetHitArr,
        );
        for (let i = 0; i < targetHits.length; i++) {
          const meta = this.targetLookup.get(targetHits[i].object);
          if (meta && meta.target.isAlive && !meta.target.isAlly && targetHits[i].distance < closest) {
            closest = targetHits[i].distance;
            break;
          }
        }
      }
    }

    outPoint.copy(rayOrigin).addScaledVector(rayDirection, closest);
  }

  /**
   * Returns exact distance (meters) to the closest surface or target under the center scope ray, or null if sky.
   */
  measureAimDistance(
    rayOrigin: THREE.Vector3,
    rayDirection: THREE.Vector3,
    maxDistance = 260,
  ): number | null {
    let closest = Infinity;

    if (this.fastEnvRaycaster || this.environmentMeshes.length > 0) {
      const envDist = this.intersectEnvironmentClosest(
        rayOrigin,
        rayDirection,
        0.35,
        maxDistance,
        false,
      );
      if (envDist < closest) {
        closest = envDist;
      }
    }

    if (this.glooWallHooks) {
      const gHit = this.glooWallHooks.raycastSegment(
        rayOrigin,
        rayDirection,
        0.35,
        Math.min(maxDistance, closest),
        null,
        null,
      );
      if (gHit && gHit.dist < closest) {
        closest = gHit.dist;
      }
    }

    if (this.targets.length > 0) {
      const maxT = Math.min(maxDistance, closest);
      if (this.gatherBroadphaseTargetMeshes(rayOrigin, rayDirection, 0.35, maxT) > 0) {
        this.raycaster.set(rayOrigin, rayDirection);
        this.raycaster.near = 0.35;
        this.raycaster.far = maxT;
        this.targetHitArr.length = 0;
        const targetHits = this.raycaster.intersectObjects(
          this.broadphaseMeshes,
          false,
          this.targetHitArr,
        );
        for (let i = 0; i < targetHits.length; i++) {
          const meta = this.targetLookup.get(targetHits[i].object);
          if (meta && meta.target.isAlive && targetHits[i].distance < closest) {
            closest = targetHits[i].distance;
            break;
          }
        }
      }
    }

    return Number.isFinite(closest) ? closest : null;
  }

  private gatherCrosshairBroadphaseMeshes(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    near: number,
    far: number,
  ): number {
    const out = this.broadphaseMeshes;
    out.length = 0;
    const minProj = Math.max(-1.5, near - 1.5);
    const maxProj = far + 1.5;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t.isAlive || !t.bodyMesh.visible) continue;
      t.bodyMesh.updateWorldMatrix(true, false);
      const e = t.bodyMesh.matrixWorld.elements;
      let tx = e[12];
      let ty = e[13];
      let tz = e[14];
      if (tx === 0 && ty === 0 && tz === 0) {
        t.bodyMesh.getWorldPosition(this.scratchTargetPos);
        tx = this.scratchTargetPos.x;
        ty = this.scratchTargetPos.y;
        tz = this.scratchTargetPos.z;
      }

      const rx = tx - ox;
      const ry = ty + 0.35 - oy;
      const rz = tz - oz;
      const proj = rx * dx + ry * dy + rz * dz;
      if (proj < minProj || proj > maxProj) continue;

      const px = rx - dx * proj;
      const py = ry - dy * proj;
      const pz = rz - dz * proj;
      if (px * px + py * py + pz * pz <= 1.75 * 1.75) {
        t.headMesh.updateWorldMatrix(true, false);
        out.push(t.headMesh, t.bodyMesh);
      }
    }
    return out.length;
  }

  /**
   * Instant, occlusion-accurate center-reticle enemy check.
   * Returns true ONLY when the closest unobstructed hit along the center ray is a live enemy target
   * (never turns true through walls, terrain, Gloo Walls, or friendly teammates).
   */
  hasEnemyInCrosshair(
    rayOrigin: THREE.Vector3,
    rayDirection: THREE.Vector3,
    maxDistance: number,
    nearDistance = 0.25,
  ): boolean {
    if (this.targets.length === 0 || maxDistance <= nearDistance) {
      return false;
    }

    let closest = maxDistance;

    if (this.fastEnvRaycaster || this.environmentMeshes.length > 0) {
      const envDist = this.intersectEnvironmentClosest(
        rayOrigin,
        rayDirection,
        nearDistance,
        maxDistance,
        false,
      );
      if (envDist < closest) {
        closest = envDist;
      }
    }

    if (this.glooWallHooks) {
      const gHit = this.glooWallHooks.raycastSegment(
        rayOrigin,
        rayDirection,
        nearDistance,
        closest,
        null,
        null,
      );
      if (gHit && gHit.dist < closest) {
        closest = gHit.dist;
      }
    }

    if (closest <= nearDistance) {
      return false;
    }

    if (this.gatherCrosshairBroadphaseMeshes(rayOrigin, rayDirection, nearDistance, closest) === 0) {
      return false;
    }

    this.raycaster.set(rayOrigin, rayDirection);
    this.raycaster.near = nearDistance;
    this.raycaster.far = closest;
    this.targetHitArr.length = 0;
    const targetHits = this.raycaster.intersectObjects(
      this.broadphaseMeshes,
      false,
      this.targetHitArr,
    );

    for (let i = 0; i < targetHits.length; i++) {
      const h = targetHits[i];
      if (h.distance >= closest) break;
      const meta = this.targetLookup.get(h.object);
      if (!meta || !meta.target.isAlive) continue;
      // If an ally is directly under the crosshair in front of an enemy, do not highlight red
      return !meta.target.isAlly;
    }

    return false;
  }

  hasLineOfSight(
    origin: THREE.Vector3,
    targetPoint: THREE.Vector3,
    maxDistance: number,
  ): boolean {
    if (
      this.glooWallHooks &&
      !this.glooWallHooks.hasLineOfSight(
        origin.x,
        origin.y,
        origin.z,
        targetPoint.x,
        targetPoint.y,
        targetPoint.z,
      )
    ) {
      return false;
    }
    if (this.fastLosChecker) {
      return this.fastLosChecker(
        origin.x,
        origin.y,
        origin.z,
        targetPoint.x,
        targetPoint.y,
        targetPoint.z,
      );
    }
    if (this.environmentMeshes.length === 0) return true;
    this.dir.copy(targetPoint).sub(origin);
    const dist = this.dir.length();
    if (dist <= 0.35) return true;
    this.dir.divideScalar(dist);

    const far = Math.min(maxDistance, dist - 0.18);
    if (far <= 0.25) return true;

    const hitDist = this.intersectEnvironmentClosest(origin, this.dir, 0.25, far, false);
    return !Number.isFinite(hitDist);
  }
}
