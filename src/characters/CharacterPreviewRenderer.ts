import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import { TacticalCompanion } from '../lobby/TacticalCompanion';
import {
  getArmorIdFromTier,
  getArmorOption,
  type R6Customization,
  type R6PetId,
} from '../player/R6CustomizationData';
import type { CharacterDefinition } from './CharacterData';
import { getR6IdleClip } from './R6AnimationClips';
import { getR6CharacterPreset } from './R6CharacterCatalog';
import { getR6EmoteClip, getR6EmoteThumbnailTime } from './R6EmoteClips';
import { buildR6CharacterModel, type BuiltR6Character } from './R6ModelBuilder';
import type { ShopCatalogItem } from '../shop/IShopSystem';
import { buildShopItemPreviewModel } from '../shop/ShopItemMeshBuilder';
import {
  ensureGlooSkinTextureLoaded,
  getGlooWallSkinById,
  isGlooSkinTextureReady,
} from '../combat/GlooWallSkins';

export type CharacterSnapshotMode = 'full' | 'avatar';

export interface CharacterSnapshotSpec {
  mode: CharacterSnapshotMode;
  humanModelId: string;
  primaryColorHex: string;
  visorColorHex: string;
  customization: R6Customization;
  yawOffset?: number;
}

type QueuedSnapshotTask =
  | {
      kind: 'character';
      key: string;
      spec: CharacterSnapshotSpec;
      listeners: Array<(dataUrl: string) => void>;
    }
  | {
      kind: 'pet';
      key: string;
      petId: R6PetId;
      listeners: Array<(dataUrl: string) => void>;
    }
  | {
      kind: 'shop-item';
      key: string;
      item: ShopCatalogItem;
      character: CharacterDefinition;
      customization: R6Customization;
      priority?: boolean;
      listeners: Array<(dataUrl: string) => void>;
    };

export class CharacterPreviewRenderer {
  private readonly cache = new Map<string, string>();
  private readonly pending = new Map<string, QueuedSnapshotTask>();
  private readonly queue: QueuedSnapshotTask[] = [];
  private rafHandle = 0;
  private idleDisposeTimer = 0;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private disposed = false;
  private paused = false;
  private pumpDelayTimer = 0;

  constructor(
    _assetManager: AssetManager,
    private readonly isSoftwareGl = false,
  ) {}

  getCacheKey(spec: CharacterSnapshotSpec): string {
    const c = spec.customization;
    const preset = getR6CharacterPreset(spec.humanModelId);
    const yaw = spec.yawOffset !== undefined ? spec.yawOffset.toFixed(2) : '0.28';
    return [
      spec.mode,
      spec.humanModelId,
      spec.primaryColorHex,
      spec.visorColorHex,
      preset.irisHex ?? '',
      c.skinId,
      c.eyesId,
      c.mouthId,
      c.faceMarkId,
      c.hairStyleId,
      c.hairColorId,
      c.topId,
      c.pantsId,
      c.shoesId,
      c.hatId,
      c.glassesId,
      c.maskId,
      c.armorId,
      c.accessoryId,
      yaw,
    ].join('|');
  }

  getCachedSnapshot(spec: CharacterSnapshotSpec): string | null {
    return this.cache.get(this.getCacheKey(spec)) ?? null;
  }

  invalidateShopItemSnapshots(itemIds?: ReadonlyArray<string>): void {
    const idSet = itemIds ? new Set(itemIds) : null;
    for (const key of Array.from(this.cache.keys())) {
      if (!key.startsWith('shop|')) continue;
      if (!idSet) {
        this.cache.delete(key);
        continue;
      }
      const itemId = key.split('|')[1];
      if (itemId && idSet.has(itemId)) {
        this.cache.delete(key);
      }
    }
  }

  requestCharacterSnapshot(
    character: CharacterDefinition,
    customization: R6Customization,
    mode: CharacterSnapshotMode,
    onReady: (dataUrl: string) => void,
    yawOffset?: number,
  ): () => void {
    const spec: CharacterSnapshotSpec = {
      mode,
      humanModelId: character.model.humanModelId ?? 'r6-vanguard',
      primaryColorHex: character.model.primaryColorHex,
      visorColorHex: character.model.visorColorHex,
      customization,
      yawOffset,
    };
    return this.requestSnapshot(spec, onReady);
  }

  requestSnapshot(
    spec: CharacterSnapshotSpec,
    onReady: (dataUrl: string) => void,
  ): () => void {
    if (this.disposed) return () => {};
    const key = this.getCacheKey(spec);
    const cached = this.cache.get(key);
    if (cached) {
      onReady(cached);
      return () => {};
    }

    let task = this.pending.get(key);
    if (task) {
      task.listeners.push(onReady);
    } else {
      task = {
        kind: 'character',
        key,
        spec: {
          ...spec,
          customization: { ...spec.customization },
        },
        listeners: [onReady],
      };
      this.pending.set(key, task);
      this.queue.push(task);
      this.schedulePump();
    }

    return () => {
      const idx = task!.listeners.indexOf(onReady);
      if (idx >= 0) {
        task!.listeners.splice(idx, 1);
      }
      if (task!.listeners.length === 0) {
        this.pending.delete(task!.key);
        const qIdx = this.queue.indexOf(task!);
        if (qIdx >= 0) {
          this.queue.splice(qIdx, 1);
        }
      }
    };
  }

  requestPetSnapshot(
    petId: R6PetId,
    onReady: (dataUrl: string) => void,
  ): () => void {
    if (this.disposed) return () => {};
    const key = `pet|${petId}`;
    const cached = this.cache.get(key);
    if (cached) {
      onReady(cached);
      return () => {};
    }

    let task = this.pending.get(key);
    if (task) {
      task.listeners.push(onReady);
    } else {
      task = {
        kind: 'pet',
        key,
        petId,
        listeners: [onReady],
      };
      this.pending.set(key, task);
      this.queue.push(task);
      this.schedulePump();
    }

    return () => {
      const idx = task!.listeners.indexOf(onReady);
      if (idx >= 0) {
        task!.listeners.splice(idx, 1);
      }
      if (task!.listeners.length === 0) {
        this.pending.delete(task!.key);
        const qIdx = this.queue.indexOf(task!);
        if (qIdx >= 0) {
          this.queue.splice(qIdx, 1);
        }
      }
    };
  }

  requestShopItemSnapshot(
    item: ShopCatalogItem,
    character: CharacterDefinition,
    baseCustomization: R6Customization,
    onReady: (dataUrl: string) => void,
    priority = false,
  ): () => void {
    if (this.disposed) return () => {};
    const mergedCustom: R6Customization = item.customizationPatch
      ? { ...baseCustomization, ...item.customizationPatch }
      : { ...baseCustomization };
    const key =
      item.customizationPatch || item.emoteId
        ? `shop|${item.id}|${character.model.humanModelId ?? 'r6-vanguard'}|${mergedCustom.skinId}|${mergedCustom.hairStyleId}|${mergedCustom.hairColorId}`
        : item.weaponSkinId
          ? `shop|${item.id}|${item.weaponSkinId}`
          : `shop|${item.id}`;
    const cached = this.cache.get(key);
    if (cached) {
      onReady(cached);
      return () => {};
    }

    let task = this.pending.get(key);
    if (task) {
      task.listeners.push(onReady);
      if (priority && task.kind === 'shop-item') {
        task.priority = true;
        const qIdx = this.queue.indexOf(task);
        if (qIdx > 0) {
          this.queue.splice(qIdx, 1);
          this.queue.unshift(task);
        }
      }
    } else {
      task = {
        kind: 'shop-item',
        key,
        item,
        character,
        customization: mergedCustom,
        priority,
        listeners: [onReady],
      };
      this.pending.set(key, task);
      if (priority) {
        this.queue.unshift(task);
      } else {
        this.queue.push(task);
      }
      this.schedulePump();
    }

    return () => {
      const idx = task!.listeners.indexOf(onReady);
      if (idx >= 0) {
        task!.listeners.splice(idx, 1);
      }
      if (task!.listeners.length === 0) {
        this.pending.delete(task!.key);
        const qIdx = this.queue.indexOf(task!);
        if (qIdx >= 0) {
          this.queue.splice(qIdx, 1);
        }
      }
    };
  }

  private clearIdleDisposeTimer(): void {
    if (this.idleDisposeTimer) {
      window.clearTimeout(this.idleDisposeTimer);
      this.idleDisposeTimer = 0;
    }
  }

  private scheduleIdleDispose(): void {
    this.clearIdleDisposeTimer();
    if (this.disposed || !this.renderer) return;
    this.idleDisposeTimer = window.setTimeout(() => {
      this.idleDisposeTimer = 0;
      if (this.queue.length === 0 && !this.disposed) {
        this.releaseGpuResources();
      }
    }, 12000);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      if (this.rafHandle) {
        window.cancelAnimationFrame(this.rafHandle);
        this.rafHandle = 0;
      }
      if (this.pumpDelayTimer) {
        window.clearTimeout(this.pumpDelayTimer);
        this.pumpDelayTimer = 0;
      }
    } else if (this.queue.length > 0 && !this.disposed) {
      this.schedulePump();
    }
  }

  releaseGpuResources(): void {
    this.clearIdleDisposeTimer();
    if (this.pumpDelayTimer) {
      window.clearTimeout(this.pumpDelayTimer);
      this.pumpDelayTimer = 0;
    }
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  private schedulePump(): void {
    this.clearIdleDisposeTimer();
    if (this.rafHandle || this.pumpDelayTimer || this.disposed || this.paused) return;
    this.rafHandle = window.requestAnimationFrame(() => {
      this.rafHandle = 0;
      this.pumpBatch();
    });
  }

  private pumpBatch(): void {
    if (this.disposed || this.paused) return;
    const isShopBurst = this.queue[0]?.kind === 'shop-item';
    const batchCount = this.isSoftwareGl ? (isShopBurst ? 6 : 4) : isShopBurst ? 8 : 5;
    let rendered = 0;
    while (rendered < batchCount && this.queue.length > 0) {
      const task = this.queue.shift()!;
      if (task.listeners.length === 0) {
        this.pending.delete(task.key);
        continue;
      }

      if (task.kind === 'shop-item' && task.item.glooSkinId) {
        const skin = getGlooWallSkinById(task.item.glooSkinId);
        if (!isGlooSkinTextureReady(skin)) {
          // Keep task in `pending` until image loads; re-enqueue upon completion without blocking other tasks
          void ensureGlooSkinTextureLoaded(skin).then(() => {
            if (this.disposed || task.listeners.length === 0) {
              this.pending.delete(task.key);
              return;
            }
            if (this.pending.get(task.key) === task && !this.queue.includes(task)) {
              if (task.priority) {
                this.queue.unshift(task);
              } else {
                this.queue.push(task);
              }
              this.schedulePump();
            }
          });
          continue;
        }
      }

      this.pending.delete(task.key);
      rendered++;

      const dataUrl =
        task.kind === 'pet'
          ? this.renderPetSnapshotNow(task.petId)
          : task.kind === 'shop-item'
            ? this.renderShopItemSnapshotNow(task.item, task.character, task.customization)
            : this.renderSnapshotNow(task.spec);
      if (dataUrl) {
        this.cache.set(task.key, dataUrl);
        for (const cb of task.listeners) {
          cb(dataUrl);
        }
      }
    }

    if (this.queue.length > 0) {
      this.pumpDelayTimer = window.setTimeout(() => {
        this.pumpDelayTimer = 0;
        this.schedulePump();
      }, this.isSoftwareGl ? 6 : 4);
    } else if (this.pending.size === 0) {
      this.scheduleIdleDispose();
    }
  }

  private ensureRenderer(): boolean {
    this.clearIdleDisposeTimer();
    if (this.renderer && this.scene && this.camera) return true;
    try {
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !this.isSoftwareGl,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        stencil: false,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();

      // Balanced 4-light studio rig avoids spinning up a second PMREMGenerator cubemap convolution at boot
      const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.32);
      const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.25);
      keyLight.position.set(2.2, 3.2, 3.4);
      const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.98);
      fillLight.position.set(-2.6, 1.8, 1.6);
      const rimLight = new THREE.DirectionalLight(0xf97316, 0.95);
      rimLight.position.set(-1.5, 2.4, -2.8);
      scene.add(hemi, keyLight, fillLight, rimLight);

      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 30);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      return true;
    } catch {
      return false;
    }
  }

  private renderSnapshotNow(spec: CharacterSnapshotSpec): string | null {
    if (!this.ensureRenderer() || !this.renderer || !this.scene || !this.camera) {
      return null;
    }

    const width = spec.mode === 'avatar' ? (this.isSoftwareGl ? 112 : 160) : (this.isSoftwareGl ? 136 : 200);
    const height = spec.mode === 'avatar' ? (this.isSoftwareGl ? 112 : 160) : (this.isSoftwareGl ? 180 : 264);
    this.renderer.setSize(width, height, false);

    const preset = getR6CharacterPreset(spec.humanModelId);
    const built = buildR6CharacterModel(
      preset,
      spec.customization,
      spec.primaryColorHex,
      spec.visorColorHex,
    );

    const extraMats: THREE.Material[] = [];
    const extraGeos: THREE.BufferGeometry[] = [];
    this.attachGearOverlays(spec, built, extraMats, extraGeos);

    const idleClip = getR6IdleClip();
    const mixer = new THREE.AnimationMixer(built.root);
    if (idleClip) {
      const act = mixer.clipAction(idleClip);
      act.reset().play();
      mixer.update(0.02);
    }

    built.root.rotation.y = spec.yawOffset ?? (spec.mode === 'avatar' ? 0.24 : 0.28);
    this.scene.add(built.root);

    this.camera.aspect = width / height;
    if (spec.mode === 'avatar') {
      this.camera.fov = 33;
      this.camera.position.set(0.08, 1.54, 1.05);
      this.camera.lookAt(0, 1.5, 0);
    } else {
      this.camera.fov = 38;
      this.camera.position.set(0.14, 1.02, 2.85);
      this.camera.lookAt(0, 0.9, 0);
    }
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    mixer.stopAllAction();
    mixer.uncacheRoot(built.root);
    this.scene.remove(built.root);
    for (const mat of extraMats) mat.dispose();
    for (const geo of extraGeos) geo.dispose();
    built.dispose();

    return dataUrl;
  }

  private renderPetSnapshotNow(petId: R6PetId): string | null {
    if (petId === 'none') {
      const canvas = document.createElement('canvas');
      canvas.width = 180;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 180, 180);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(90, 86, 36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(64, 112);
        ctx.lineTo(116, 60);
        ctx.stroke();
      }
      return canvas.toDataURL('image/png');
    }

    if (!this.ensureRenderer() || !this.renderer || !this.scene || !this.camera) {
      return null;
    }

    const size = 180;
    this.renderer.setSize(size, size, false);

    const companion = new TacticalCompanion(petId);
    companion.root.rotation.y = petId === 'parrot' ? 0.35 : 0.42;
    companion.update(0.016, 0.35);
    this.scene.add(companion.root);

    this.camera.aspect = 1;
    if (petId === 'parrot') {
      this.camera.fov = 38;
      this.camera.position.set(0.46, 1.62, 0.96);
      this.camera.lookAt(0, 1.42, 0);
    } else if (petId === 'creeper_bot') {
      this.camera.fov = 38;
      this.camera.position.set(0.56, 0.56, 0.95);
      this.camera.lookAt(0, 0.24, 0);
    } else {
      this.camera.fov = 38;
      this.camera.position.set(0.76, 0.72, 1.15);
      this.camera.lookAt(0, 0.4, 0.04);
    }
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(companion.root);
    companion.dispose();
    return dataUrl;
  }

  private renderShopItemSnapshotNow(
    item: ShopCatalogItem,
    character: CharacterDefinition,
    customization: R6Customization,
  ): string | null {
    if (!this.ensureRenderer() || !this.renderer || !this.scene || !this.camera) {
      return null;
    }

    const width = this.isSoftwareGl ? 280 : 360;
    const height = this.isSoftwareGl ? 210 : 270;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;

    if (item.customizationPatch || item.emoteId) {
      const preset = getR6CharacterPreset(character.model.humanModelId ?? 'r6-vanguard');
      const built = buildR6CharacterModel(
        preset,
        customization,
        character.model.primaryColorHex,
        character.model.visorColorHex,
      );
      const extraMats: THREE.Material[] = [];
      const extraGeos: THREE.BufferGeometry[] = [];
      this.attachGearOverlays(
        {
          mode: 'full',
          humanModelId: character.model.humanModelId ?? 'r6-vanguard',
          primaryColorHex: character.model.primaryColorHex,
          visorColorHex: character.model.visorColorHex,
          customization,
        },
        built,
        extraMats,
        extraGeos,
      );
      const clip = item.emoteId ? getR6EmoteClip(item.emoteId) : getR6IdleClip();
      const evalTime = item.emoteId ? getR6EmoteThumbnailTime(item.emoteId) : 0.02;
      const mixer = new THREE.AnimationMixer(built.root);
      if (clip) {
        const act = mixer.clipAction(clip);
        act.reset().play();
        mixer.update(evalTime);
      }
      built.root.rotation.y = item.emoteId ? 0.26 : 0.34;
      this.scene.add(built.root);

      this.camera.fov = 36;
      this.camera.position.set(0.16, 1.08, item.emoteId ? 2.95 : 2.75);
      this.camera.lookAt(0, 0.94, 0);
      this.camera.updateProjectionMatrix();

      this.renderer.render(this.scene, this.camera);
      const dataUrl = this.renderer.domElement.toDataURL('image/png');

      mixer.stopAllAction();
      mixer.uncacheRoot(built.root);
      this.scene.remove(built.root);
      for (const mat of extraMats) mat.dispose();
      for (const geo of extraGeos) geo.dispose();
      built.dispose();
      return dataUrl;
    }

    const builtItem = buildShopItemPreviewModel(item);
    builtItem.root.rotation.y = builtItem.preferredYaw;
    builtItem.root.rotation.x = builtItem.preferredPitch * 0.25;
    this.scene.add(builtItem.root);
    builtItem.root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(builtItem.root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getSize(size);
      box.getCenter(center);
    } else {
      size.set(0.6, 0.6, 0.6);
    }

    const fovDeg = 34;
    const fovRad = THREE.MathUtils.degToRad(fovDeg);
    const halfH = Math.max(0.14, size.y * 0.5);
    const halfW = Math.max(0.14, size.x * 0.5);
    const distV = halfH / Math.tan(fovRad / 2);
    const distH = halfW / (Math.tan(fovRad / 2) * this.camera.aspect);
    const depthOffset = Math.max(0.1, size.z * 0.5);
    const distance = Math.max(distV, distH) * 1.24 + depthOffset;

    this.camera.fov = fovDeg;
    this.camera.position.set(
      center.x + distance * 0.12,
      center.y + distance * builtItem.preferredPitch,
      center.z + distance,
    );
    this.camera.lookAt(center.x, center.y, center.z);
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(builtItem.root);
    builtItem.dispose();
    return dataUrl;
  }

  private attachGearOverlays(
    spec: CharacterSnapshotSpec,
    built: BuiltR6Character,
    extraMats: THREE.Material[],
    extraGeos: THREE.BufferGeometry[],
  ): void {
    const custom = spec.customization;
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
      extraGeos.push(plateGeo, emblemGeo);

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
      extraMats.push(plateMat, emblemMat);

      const frontPlate = new THREE.Mesh(plateGeo, plateMat);
      frontPlate.position.set(0, 0.06, 0.185);
      const backPlate = new THREE.Mesh(plateGeo, plateMat);
      backPlate.position.set(0, 0.06, -0.185);
      const emblem = new THREE.Mesh(emblemGeo, emblemMat);
      emblem.position.set(0, 0.12, 0.214);
      chestBone.add(frontPlate, backPlate, emblem);

      if (tier >= 2) {
        const pauldronGeo = new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
        extraGeos.push(pauldronGeo);
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
      extraGeos.push(packGeo, pouchGeo);
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
      extraMats.push(bodyMat, trimMat);
      const body = new THREE.Mesh(packGeo, bodyMat);
      body.position.set(0, 0.26, -0.22);
      body.scale.set(1.0, 1.0, 0.72);
      const pouch = new THREE.Mesh(pouchGeo, trimMat);
      pouch.position.set(0, 0.16, -0.31);
      chestBone.add(body, pouch);
    } else if (custom.accessoryId === 'headphones') {
      const cupGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 12);
      const bandGeo = new THREE.TorusGeometry(0.228, 0.016, 8, 18, Math.PI);
      extraGeos.push(cupGeo, bandGeo);
      const metalMat = new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.34,
        metalness: 0.78,
      });
      extraMats.push(metalMat);
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
      extraGeos.push(crownGeo);
      const goldMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#b45309',
        emissiveIntensity: 0.35,
        roughness: 0.24,
        metalness: 0.85,
      });
      extraMats.push(goldMat);
      const crown = new THREE.Mesh(crownGeo, goldMat);
      crown.position.set(0, 0.365, 0);
      headBone.add(crown);
    } else if (custom.accessoryId === 'shades') {
      const visorGeo = new THREE.CylinderGeometry(0.242, 0.242, 0.085, 16, 1, true, -0.78, 1.56);
      extraGeos.push(visorGeo);
      const visorMat = new THREE.MeshStandardMaterial({
        color: spec.visorColorHex,
        emissive: spec.visorColorHex,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.42,
        roughness: 0.12,
        metalness: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      extraMats.push(visorMat);
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.205, 0.02);
      visor.renderOrder = 2;
      headBone.add(visor);
    } else if (custom.accessoryId === 'cape') {
      const capeGeo = new THREE.BoxGeometry(0.56, 0.66, 0.03);
      extraGeos.push(capeGeo);
      const capeMat = new THREE.MeshStandardMaterial({
        color: '#991b1b',
        roughness: 0.78,
        metalness: 0.05,
      });
      extraMats.push(capeMat);
      const cape = new THREE.Mesh(capeGeo, capeMat);
      cape.position.set(0, 0.12, -0.21);
      cape.rotation.x = 0.08;
      chestBone.add(cape);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearIdleDisposeTimer();
    if (this.rafHandle) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.queue.length = 0;
    this.pending.clear();
    this.cache.clear();
    this.releaseGpuResources();
  }
}
