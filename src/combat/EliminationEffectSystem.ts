import * as THREE from 'three';

interface EliminationPulse {
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  active: boolean;
}

interface EliminationSpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  duration: number;
  active: boolean;
}

export class EliminationEffectSystem {
  private readonly scene: THREE.Scene;
  private readonly pulses: EliminationPulse[] = [];
  private readonly sparks: EliminationSpark[] = [];
  private readonly ringGeo: THREE.RingGeometry;
  private readonly beamGeo: THREE.CylinderGeometry;
  private readonly sparkGeo: THREE.OctahedronGeometry;
  private readonly sparkMat: THREE.MeshBasicMaterial;
  private pulseCursor = 0;
  private sparkCursor = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.ringGeo = new THREE.RingGeometry(0.32, 0.54, 24);
    this.beamGeo = new THREE.CylinderGeometry(0.14, 0.42, 4.2, 12, 1, true);
    this.sparkGeo = new THREE.OctahedronGeometry(0.08, 0);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < 6; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(this.ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);

      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(this.beamGeo, beamMat);
      beam.visible = false;
      this.scene.add(beam);

      this.pulses.push({
        ring,
        ringMat,
        beam,
        beamMat,
        age: 0,
        duration: 0.65,
        active: false,
      });
    }

    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vel: new THREE.Vector3(),
        age: 0,
        duration: 0.55,
        active: false,
      });
    }
  }

  spawnBurst(x: number, y: number, z: number, isHeadshot = false): void {
    const pulse = this.pulses[this.pulseCursor];
    this.pulseCursor = (this.pulseCursor + 1) % this.pulses.length;
    pulse.active = true;
    pulse.age = 0;
    pulse.duration = isHeadshot ? 0.78 : 0.62;
    pulse.ringMat.color.setHex(isHeadshot ? 0xef4444 : 0xf97316);
    pulse.beamMat.color.setHex(isHeadshot ? 0xfb7185 : 0xfacc15);

    pulse.ring.visible = true;
    pulse.ring.position.set(x, y + 0.06, z);
    pulse.ring.scale.setScalar(0.5);

    pulse.beam.visible = true;
    pulse.beam.position.set(x, y + 2.1, z);
    pulse.beam.scale.set(1, 0.25, 1);

    const count = isHeadshot ? 14 : 10;
    for (let i = 0; i < count; i++) {
      const spark = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
      spark.active = true;
      spark.age = 0;
      spark.duration = 0.45 + Math.random() * 0.28;
      spark.mesh.visible = true;
      spark.mesh.position.set(x, y + 1.05, z);
      spark.mesh.scale.setScalar(0.9 + Math.random() * 0.6);
      const ang = Math.random() * Math.PI * 2;
      const spd = 2.4 + Math.random() * 3.8;
      spark.vel.set(Math.cos(ang) * spd, 2.8 + Math.random() * 3.8, Math.sin(ang) * spd);
    }
  }

  update(dt: number): void {
    const safeDt = Math.min(dt, 0.1);
    for (let i = 0; i < this.pulses.length; i++) {
      const p = this.pulses[i];
      if (!p.active) continue;
      p.age += safeDt;
      if (p.age >= p.duration) {
        p.active = false;
        p.ring.visible = false;
        p.beam.visible = false;
        continue;
      }
      const t = p.age / p.duration;
      const easeOut = 1 - (1 - t) * (1 - t);
      p.ring.scale.setScalar(0.6 + easeOut * 4.2);
      p.ringMat.opacity = Math.max(0, 0.9 * (1 - t));

      p.beam.scale.set(Math.max(0.15, 1 - t * 0.7), 0.35 + easeOut * 1.15, Math.max(0.15, 1 - t * 0.7));
      p.beamMat.opacity = Math.max(0, 0.58 * (1 - t));
    }

    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!s.active) continue;
      s.age += safeDt;
      if (s.age >= s.duration) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 10.5 * safeDt;
      s.mesh.position.addScaledVector(s.vel, safeDt);
      const sc = Math.max(0.05, 1 - s.age / s.duration);
      s.mesh.scale.setScalar(sc);
    }
  }

  clearAll(): void {
    for (let i = 0; i < this.pulses.length; i++) {
      this.pulses[i].active = false;
      this.pulses[i].ring.visible = false;
      this.pulses[i].beam.visible = false;
    }
    for (let i = 0; i < this.sparks.length; i++) {
      this.sparks[i].active = false;
      this.sparks[i].mesh.visible = false;
    }
  }

  dispose(): void {
    this.clearAll();
    for (let i = 0; i < this.pulses.length; i++) {
      this.scene.remove(this.pulses[i].ring);
      this.scene.remove(this.pulses[i].beam);
      this.pulses[i].ringMat.dispose();
      this.pulses[i].beamMat.dispose();
    }
    for (let i = 0; i < this.sparks.length; i++) {
      this.scene.remove(this.sparks[i].mesh);
    }
    this.pulses.length = 0;
    this.sparks.length = 0;
    this.ringGeo.dispose();
    this.beamGeo.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
  }
}
