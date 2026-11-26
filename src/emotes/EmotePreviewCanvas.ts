import * as THREE from 'three';
import type { CharacterDefinition } from '../characters/CharacterData';
import { getR6IdleClip } from '../characters/R6AnimationClips';
import { getR6CharacterPreset } from '../characters/R6CharacterCatalog';
import { getR6EmoteClip } from '../characters/R6EmoteClips';
import { buildR6CharacterModel, type BuiltR6Character } from '../characters/R6ModelBuilder';
import {
  getArmorIdFromTier,
  getArmorOption,
  type R6Customization,
} from '../player/R6CustomizationData';
import { getEmoteById } from './EmoteCatalog';

export type EmotePreviewStateListener = (activeEmoteId: string | null, remainingSec: number) => void;

export class EmotePreviewCanvas {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private built: BuiltR6Character | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private activeAction: THREE.AnimationAction | null = null;
  private selectedEmoteId: string | null = null;
  private playingEmoteId: string | null = null;
  private previewRemainingSec = 0;
  private previewEndMs = 0;
  private lastNotifiedTenth = -1;
  private onStateChange: EmotePreviewStateListener | null = null;
  private extraMats: THREE.Material[] = [];
  private extraGeos: THREE.BufferGeometry[] = [];
  private rafHandle = 0;
  private lastTs = 0;
  private yaw = 0.28;
  private dragging = false;
  private dragPointerId = -1;
  private lastDragX = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  constructor(private readonly isSoftwareGl = false) {
    this.element = document.createElement('div');
    this.element.className = 'relative w-full h-full select-none touch-none cursor-grab active:cursor-grabbing';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'w-full h-full block';
    this.element.appendChild(this.canvas);

    this.initScene();
    this.bindPointerOrbit();
  }

  setOnStateChange(listener: EmotePreviewStateListener | null): void {
    this.onStateChange = listener;
  }

  isPreviewPlaying(): boolean {
    return this.playingEmoteId !== null && this.previewRemainingSec > 0;
  }

  getPlayingEmoteId(): string | null {
    return this.playingEmoteId;
  }

  getRemainingSeconds(): number {
    return this.previewRemainingSec;
  }

  private initScene(): void {
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
        stencil: false,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isSoftwareGl ? 1 : 2));
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.35);
      const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.25);
      keyLight.position.set(2.2, 3.2, 3.4);
      const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.98);
      fillLight.position.set(-2.6, 1.8, 1.6);
      const rimLight = new THREE.DirectionalLight(0xf97316, 0.95);
      rimLight.position.set(-1.5, 2.4, -2.8);
      scene.add(hemi, keyLight, fillLight, rimLight);

      const padGeo = new THREE.RingGeometry(0.45, 0.72, 32);
      padGeo.rotateX(-Math.PI / 2);
      const padMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.y = 0.01;
      scene.add(padMesh);
      this.extraGeos.push(padGeo);
      this.extraMats.push(padMat);

      const camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.1, 30);
      camera.position.set(0.14, 1.08, 2.95);
      camera.lookAt(0, 0.92, 0);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;

      this.syncSize();
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.syncSize());
        this.resizeObserver.observe(this.element);
      }
    } catch {
      this.renderer = null;
    }
  }

  private bindPointerOrbit(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragPointerId = e.pointerId;
      this.lastDragX = e.clientX;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      const dx = e.clientX - this.lastDragX;
      this.lastDragX = e.clientX;
      this.yaw += dx * 0.012;
      if (this.built) {
        this.built.root.rotation.y = this.yaw;
      }
    });
    const endDrag = (e: PointerEvent) => {
      if (e.pointerId === this.dragPointerId) {
        this.dragging = false;
        this.dragPointerId = -1;
      }
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  private syncSize(): void {
    if (!this.renderer || !this.camera) return;
    const w = Math.max(180, this.element.clientWidth || 320);
    const h = Math.max(135, this.element.clientHeight || 240);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setEmote(
    emoteId: string,
    character: CharacterDefinition,
    customization: R6Customization,
    autoPlay = false,
  ): void {
    if (this.disposed || !this.scene || !this.renderer) return;

    this.clearCharacter();
    this.selectedEmoteId = emoteId;
    this.playingEmoteId = null;
    this.previewRemainingSec = 0;
    this.lastNotifiedTenth = -1;

    const preset = getR6CharacterPreset(character.model.humanModelId ?? 'r6-vanguard');
    const built = buildR6CharacterModel(
      preset,
      customization,
      character.model.primaryColorHex,
      character.model.visorColorHex,
    );
    this.attachGearOverlays(character, customization, built);
    built.root.rotation.y = this.yaw;
    this.scene.add(built.root);
    this.built = built;

    const mixer = new THREE.AnimationMixer(built.root);
    this.mixer = mixer;

    const idleClip = getR6IdleClip();
    const idleAction = mixer.clipAction(idleClip);
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.reset().setEffectiveWeight(1).play();
    this.idleAction = idleAction;

    this.syncSize();
    this.startLoop();

    if (autoPlay) {
      this.playPreview(emoteId);
    }
  }

  playPreview(emoteId?: string): number {
    const targetId = emoteId ?? this.selectedEmoteId;
    if (!targetId || !this.mixer || this.disposed) return 0;

    const clip = getR6EmoteClip(targetId);
    if (!clip) return 0;

    const emoteMeta = getEmoteById(targetId);
    const duration = emoteMeta?.durationSeconds ?? clip.duration ?? 10.0;

    if (this.activeAction) {
      this.activeAction.stop();
      this.activeAction = null;
    }

    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.enabled = true;
    action.stopFading().reset().setEffectiveTimeScale(1.0).setEffectiveWeight(1.0).play();

    if (this.idleAction) {
      this.idleAction.enabled = true;
      action.crossFadeFrom(this.idleAction, 0.14, false);
    }

    this.selectedEmoteId = targetId;
    this.activeAction = action;
    this.playingEmoteId = targetId;
    this.previewRemainingSec = duration;
    this.previewEndMs = performance.now() + duration * 1000;
    this.lastNotifiedTenth = Math.ceil(duration * 10);
    this.onStateChange?.(targetId, duration);
    return duration;
  }

  stopPreview(notify = true): void {
    const wasPlaying = this.playingEmoteId !== null;
    this.playingEmoteId = null;
    this.previewRemainingSec = 0;
    this.previewEndMs = 0;
    this.lastNotifiedTenth = -1;

    if (this.activeAction && this.idleAction) {
      this.idleAction.enabled = true;
      this.idleAction.stopFading().reset().setEffectiveWeight(1.0).play();
      this.activeAction.crossFadeTo(this.idleAction, 0.22, false);
      this.activeAction = null;
    } else if (this.activeAction) {
      this.activeAction.fadeOut(0.2);
      this.activeAction = null;
    }

    if (notify && wasPlaying) {
      this.onStateChange?.(null, 0);
    }
  }

  replay(): void {
    if (this.selectedEmoteId) {
      this.playPreview(this.selectedEmoteId);
    }
  }

  private attachGearOverlays(
    character: CharacterDefinition,
    custom: R6Customization,
    built: BuiltR6Character,
  ): void {
    const chestBone = built.bones.Chest;
    const headBone = built.bones.Head;
    const leftArmBone = built.bones.LeftUpperArm;
    const rightArmBone = built.bones.RightUpperArm;

    if (custom.armorId !== 'none') {
      const tier: 1 | 2 | 3 =
        custom.armorId === 'nether_gold_lv3'
          ? 3
          : custom.armorId === 'diamond_lv2'
            ? 2
            : 1;
      const armorSpec = getArmorOption(getArmorIdFromTier(tier));
      const plateGeo = new THREE.BoxGeometry(0.46, 0.36, 0.048);
      const emblemGeo = new THREE.BoxGeometry(0.13, 0.075, 0.028);
      this.extraGeos.push(plateGeo, emblemGeo);

      const plateMat = new THREE.MeshStandardMaterial({
        color: armorSpec.metalHex,
        roughness: 0.45,
        metalness: 0.55,
      });
      const emblemMat = new THREE.MeshStandardMaterial({
        color: tier >= 2 ? armorSpec.glowHex : armorSpec.trimHex,
        emissive: tier >= 2 ? armorSpec.glowHex : '#000000',
        emissiveIntensity: tier >= 2 ? 0.85 : 0,
        roughness: 0.26,
        metalness: 0.5,
      });
      this.extraMats.push(plateMat, emblemMat);

      const frontPlate = new THREE.Mesh(plateGeo, plateMat);
      frontPlate.position.set(0, 0.06, 0.185);
      const backPlate = new THREE.Mesh(plateGeo, plateMat);
      backPlate.position.set(0, 0.06, -0.185);
      const emblem = new THREE.Mesh(emblemGeo, emblemMat);
      emblem.position.set(0, 0.12, 0.214);
      chestBone.add(frontPlate, backPlate, emblem);

      if (tier >= 2) {
        const pauldronGeo = new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
        this.extraGeos.push(pauldronGeo);
        const lp = new THREE.Mesh(pauldronGeo, plateMat);
        lp.position.set(0.032, 0.018, 0);
        lp.rotation.z = -0.32;
        leftArmBone.add(lp);

        const rp = new THREE.Mesh(pauldronGeo, plateMat);
        rp.position.set(-0.032, 0.018, 0);
        rp.rotation.z = 0.32;
        rightArmBone.add(rp);
      }
    }

    if (custom.accessoryId === 'backpack') {
      const packGeo = new THREE.CapsuleGeometry(0.145, 0.24, 8, 12);
      const pouchGeo = new THREE.BoxGeometry(0.24, 0.16, 0.07);
      this.extraGeos.push(packGeo, pouchGeo);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: '#293548',
        roughness: 0.65,
        metalness: 0.2,
      });
      const trimMat = new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#38bdf8',
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.55,
      });
      this.extraMats.push(bodyMat, trimMat);
      const body = new THREE.Mesh(packGeo, bodyMat);
      body.position.set(0, 0.26, -0.22);
      body.scale.set(1.0, 1.0, 0.72);
      const pouch = new THREE.Mesh(pouchGeo, trimMat);
      pouch.position.set(0, 0.16, -0.31);
      chestBone.add(body, pouch);
    } else if (custom.accessoryId === 'headphones') {
      const cupGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 12);
      const bandGeo = new THREE.TorusGeometry(0.228, 0.016, 8, 18, Math.PI);
      this.extraGeos.push(cupGeo, bandGeo);
      const metalMat = new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.34,
        metalness: 0.78,
      });
      this.extraMats.push(metalMat);
      const cupL = new THREE.Mesh(cupGeo, metalMat);
      cupL.rotation.z = Math.PI / 2;
      cupL.position.set(0.215, 0.16, 0);
      const cupR = new THREE.Mesh(cupGeo, metalMat);
      cupR.rotation.z = Math.PI / 2;
      cupR.position.set(-0.215, 0.16, 0);
      const band = new THREE.Mesh(bandGeo, metalMat);
      band.position.set(0, 0.16, 0);
      headBone.add(cupL, cupR, band);
    } else if (custom.accessoryId === 'crown') {
      const crownGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.075, 8);
      this.extraGeos.push(crownGeo);
      const goldMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#b45309',
        emissiveIntensity: 0.35,
        roughness: 0.24,
        metalness: 0.85,
      });
      this.extraMats.push(goldMat);
      const crown = new THREE.Mesh(crownGeo, goldMat);
      crown.position.set(0, 0.365, 0);
      headBone.add(crown);
    } else if (custom.accessoryId === 'shades') {
      const visorGeo = new THREE.CylinderGeometry(0.242, 0.242, 0.085, 16, 1, true, -0.78, 1.56);
      this.extraGeos.push(visorGeo);
      const visorMat = new THREE.MeshStandardMaterial({
        color: character.model.visorColorHex,
        emissive: character.model.visorColorHex,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.42,
        roughness: 0.12,
        metalness: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.extraMats.push(visorMat);
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.205, 0.02);
      visor.renderOrder = 2;
      headBone.add(visor);
    } else if (custom.accessoryId === 'cape') {
      const capeGeo = new THREE.BoxGeometry(0.56, 0.66, 0.03);
      this.extraGeos.push(capeGeo);
      const capeMat = new THREE.MeshStandardMaterial({
        color: '#991b1b',
        roughness: 0.78,
        metalness: 0.05,
      });
      this.extraMats.push(capeMat);
      const cape = new THREE.Mesh(capeGeo, capeMat);
      cape.position.set(0, 0.12, -0.21);
      cape.rotation.x = 0.08;
      chestBone.add(cape);
    }
  }

  private startLoop(): void {
    if (this.rafHandle || this.disposed) return;
    this.lastTs = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      const rawDt = Math.max(0.001, (now - this.lastTs) / 1000);
      this.lastTs = now;
      if (this.mixer) {
        this.mixer.update(Math.min(0.5, rawDt));
      }
      if (this.playingEmoteId) {
        this.previewRemainingSec = Math.max(0, (this.previewEndMs - now) / 1000);
        if (this.previewRemainingSec <= 0) {
          this.stopPreview(true);
        } else {
          const tenth = Math.ceil(this.previewRemainingSec * 10);
          if (tenth !== this.lastNotifiedTenth) {
            this.lastNotifiedTenth = tenth;
            this.onStateChange?.(this.playingEmoteId, this.previewRemainingSec);
          }
        }
      }
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
      this.rafHandle = window.requestAnimationFrame(tick);
    };
    this.rafHandle = window.requestAnimationFrame(tick);
  }

  private clearCharacter(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.built) {
        this.mixer.uncacheRoot(this.built.root);
      }
      this.mixer = null;
      this.idleAction = null;
      this.activeAction = null;
    }
    if (this.built && this.scene) {
      this.scene.remove(this.built.root);
      this.built.dispose();
      this.built = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.playingEmoteId = null;
    this.previewRemainingSec = 0;
    this.onStateChange = null;
    if (this.rafHandle) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.clearCharacter();
    for (const mat of this.extraMats) mat.dispose();
    for (const geo of this.extraGeos) geo.dispose();
    this.extraMats.length = 0;
    this.extraGeos.length = 0;
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}
