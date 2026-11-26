import * as THREE from 'three';
import { CHARACTER_ROSTER } from '../characters/CharacterData';
import type { AssetManager } from '../core/AssetManager';
import type { SceneManager } from '../core/SceneManager';
import type { DeviceProfile, Subsystem, Updatable } from '../core/Types';
import type { PlayerStateSnapshot } from '../player/IPlayerController';
import { PlayerVisuals } from '../player/PlayerVisuals';
import { normalizeR6Customization, type R6Customization, type R6PetId } from '../player/R6CustomizationData';
import { getRankTierSpec, type SquadMemberInfo } from '../ranked/RankedTypes';
import { TacticalCompanion } from './TacticalCompanion';

const LOBBY_VISUAL_SCALE_MULTIPLIER = 0.88;

interface SlotPlacement {
  x: number;
  z: number;
  yaw: number;
}

const SQUAD_SLOT_LAYOUTS: Record<1 | 2 | 3 | 4, readonly SlotPlacement[]> = {
  1: [{ x: 0.0, z: 0.0, yaw: 0.0 }],
  2: [
    { x: -0.62, z: 0.04, yaw: 0.08 },
    { x: 0.62, z: 0.04, yaw: -0.08 },
  ],
  3: [
    { x: 0.0, z: 0.0, yaw: 0.0 },
    { x: -0.96, z: 0.14, yaw: 0.13 },
    { x: 0.96, z: 0.14, yaw: -0.13 },
  ],
  4: [
    { x: -0.46, z: 0.02, yaw: 0.06 },
    { x: 0.46, z: 0.02, yaw: -0.06 },
    { x: -1.34, z: 0.18, yaw: 0.16 },
    { x: 1.34, z: 0.18, yaw: -0.16 },
  ],
};

interface SquadmateVisualEntry {
  playerId: string;
  slotRoot: THREE.Group;
  visuals: PlayerVisuals;
  stateSnap: PlayerStateSnapshot;
  charKey: string;
  plateKey: string;
  plateCanvas: HTMLCanvasElement;
  plateCtx: CanvasRenderingContext2D;
  plateTexture: THREE.CanvasTexture;
  plateMat: THREE.SpriteMaterial;
  plateSprite: THREE.Sprite;
  targetX: number;
  targetZ: number;
  targetYaw: number;
  snapped: boolean;
}

/**
 * Lightweight 3D lobby staging over the exact reference image backdrop (#lobby-bg):
 * - Keeps an invisible ShadowMaterial ground disc at y = 0 so the centered 3D
 *   character and squadmates cast natural soft shadows onto the platform.
 * - Hosts the equipped TacticalCompanion and up to 3 side-by-side squadmates.
 */
export class MilitaryBaseLobby implements Subsystem, Updatable {
  readonly root = new THREE.Group();

  private readonly companion: TacticalCompanion;
  private readonly shadowGeo: THREE.BufferGeometry;
  private readonly shadowMat: THREE.ShadowMaterial;
  private readonly squadGroup = new THREE.Group();
  private readonly squadmates = new Map<string, SquadmateVisualEntry>();
  private squadStageVisible = true;
  private activeSquadCount: 1 | 2 | 3 | 4 = 1;

  constructor(
    _deviceProfile: DeviceProfile,
    private readonly assetManager: AssetManager,
  ) {
    this.shadowGeo = new THREE.CircleGeometry(3.6, 36);
    this.shadowMat = new THREE.ShadowMaterial({ opacity: 0.42 });
    const shadowCatcher = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.002;
    shadowCatcher.receiveShadow = true;
    this.root.add(shadowCatcher);

    this.root.add(this.squadGroup);

    this.companion = new TacticalCompanion('wolf');
    this.companion.root.position.set(-1.12, 0.0, 0.36);
    this.companion.root.rotation.y = 0.32;
    this.root.add(this.companion.root);
  }

  setPetKind(petId: R6PetId): void {
    this.companion.setKind(petId);
  }

  triggerCompanionReaction(): void {
    this.companion.triggerReaction();
  }

  setShopAccent(_accentHex: string): void {
    // Reference lobby background remains completely unaltered
  }

  setSquadStageVisible(visible: boolean): void {
    this.squadStageVisible = visible;
    this.squadGroup.visible = visible;
    this.updateCompanionPlacement();
  }

  setSquadMembers(
    members: readonly SquadMemberInfo[],
    localPlayerId: string | null,
    snapPositions = false,
  ): { localSlotX: number; localSlotZ: number; localSlotYaw: number; totalShown: number } {
    // Put local player first (index 0), then up to 3 teammates
    const ordered: SquadMemberInfo[] = [];
    const localMember = members.find(
      (m) => m.isSelf || (localPlayerId !== null && m.playerId === localPlayerId),
    );
    if (localMember) {
      ordered.push(localMember);
    }
    for (const m of members) {
      if (localMember && m.playerId === localMember.playerId) continue;
      if (ordered.length >= 4) break;
      ordered.push(m);
    }

    const totalShown = Math.max(1, Math.min(4, ordered.length)) as 1 | 2 | 3 | 4;
    this.activeSquadCount = totalShown;
    const layout = SQUAD_SLOT_LAYOUTS[totalShown];
    const localPlacement = layout[0];

    const teammates = ordered.slice(localMember ? 1 : 0, 4);
    const keepIds = new Set(teammates.map((t) => t.playerId));

    // Remove squadmates that left
    for (const [id, entry] of this.squadmates.entries()) {
      if (!keepIds.has(id)) {
        this.disposeEntry(entry);
        this.squadmates.delete(id);
      }
    }

    // Add or update active teammates
    teammates.forEach((member, idx) => {
      const slotIndex = Math.min(layout.length - 1, (localMember ? idx + 1 : idx));
      const placement = layout[slotIndex];
      let entry = this.squadmates.get(member.playerId);
      if (!entry) {
        entry = this.createSquadmateEntry(member, placement);
        this.squadmates.set(member.playerId, entry);
        this.squadGroup.add(entry.slotRoot);
      }
      this.syncEntryAppearance(entry, member);
      entry.targetX = placement.x;
      entry.targetZ = placement.z;
      entry.targetYaw = placement.yaw;
      if (snapPositions || !entry.snapped) {
        entry.slotRoot.position.set(placement.x, 0, placement.z);
        entry.slotRoot.rotation.y = placement.yaw;
        entry.snapped = true;
      }
    });

    this.updateCompanionPlacement();

    return {
      localSlotX: localPlacement.x,
      localSlotZ: localPlacement.z,
      localSlotYaw: localPlacement.yaw,
      totalShown,
    };
  }

  private updateCompanionPlacement(): void {
    const count = this.squadStageVisible ? this.activeSquadCount : 1;
    if (count === 1) {
      this.companion.root.position.set(-1.12, 0.0, 0.36);
      this.companion.root.rotation.y = 0.32;
    } else if (count === 2) {
      this.companion.root.position.set(-1.46, 0.0, 0.42);
      this.companion.root.rotation.y = 0.36;
    } else if (count === 3) {
      this.companion.root.position.set(-1.95, 0.0, 0.46);
      this.companion.root.rotation.y = 0.4;
    } else {
      this.companion.root.position.set(-2.22, 0.0, 0.46);
      this.companion.root.rotation.y = 0.42;
    }
  }

  private createSquadmateEntry(
    member: SquadMemberInfo,
    placement: SlotPlacement,
  ): SquadmateVisualEntry {
    const slotRoot = new THREE.Group();
    slotRoot.position.set(placement.x, 0, placement.z);
    slotRoot.rotation.y = placement.yaw;

    const visuals = new PlayerVisuals(this.assetManager);
    visuals.setAutoSpin(false);
    slotRoot.add(visuals.root);

    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 320;
    plateCanvas.height = 80;
    const plateCtx = plateCanvas.getContext('2d')!;
    const plateTexture = new THREE.CanvasTexture(plateCanvas);
    plateTexture.colorSpace = THREE.SRGBColorSpace;
    const plateMat = new THREE.SpriteMaterial({
      map: plateTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const plateSprite = new THREE.Sprite(plateMat);
    plateSprite.position.set(0, 2.02, 0);
    plateSprite.scale.set(1.36, 0.34, 1);
    slotRoot.add(plateSprite);

    const stateSnap: PlayerStateSnapshot = {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
      velocity: new THREE.Vector3(0, 0, 0),
      health: 100,
      maxHealth: 100,
      shield: 100,
      maxShield: 100,
      movementSpeed: 5.2,
      sprintSpeed: 8.6,
      jumpForce: 8.4,
      isAlive: true,
      isSprinting: false,
      isCrouching: false,
      isProne: false,
      isGrounded: true,
      isSwimming: false,
      isSitting: false,
      isVaulting: false,
      isZiplining: false,
      isAiming: false,
      isLobby: true,
      weaponId: null,
      animationState: 'Idle',
      activeAction: null,
      actionSeq: 0,
      activeEmoteId: null,
      emoteSeq: 0,
      reloadProgress: 0,
      reloadStyle: 'ar',
      healingState: null,
    };

    return {
      playerId: member.playerId,
      slotRoot,
      visuals,
      stateSnap,
      charKey: '',
      plateKey: '',
      plateCanvas,
      plateCtx,
      plateTexture,
      plateMat,
      plateSprite,
      targetX: placement.x,
      targetZ: placement.z,
      targetYaw: placement.yaw,
      snapped: true,
    };
  }

  private syncEntryAppearance(entry: SquadmateVisualEntry, member: SquadMemberInfo): void {
    const customJson = JSON.stringify(member.customization ?? {});
    const charKey = `${member.characterId}|${customJson}`;
    if (entry.charKey !== charKey) {
      entry.charKey = charKey;
      const charDef =
        CHARACTER_ROSTER.find((c) => c.id === member.characterId) ?? CHARACTER_ROSTER[0];
      entry.visuals.setHumanModelId(charDef.model.humanModelId);
      entry.visuals.setAccentColors(charDef.model.primaryColorHex, charDef.model.visorColorHex);
      entry.visuals.setModelScale(charDef.model.scale * LOBBY_VISUAL_SCALE_MULTIPLIER);
      const normalized = normalizeR6Customization(
        member.customization as unknown as Partial<R6Customization> & Record<string, unknown>,
      );
      entry.visuals.setCustomization({
        ...normalized,
        petEnabled: false,
      });
    }

    const plateKey = `${member.name}|${member.tier}|${member.isLeader ? '1' : '0'}`;
    if (entry.plateKey !== plateKey) {
      entry.plateKey = plateKey;
      this.redrawNameplate(entry, member);
    }
  }

  private redrawNameplate(entry: SquadmateVisualEntry, member: SquadMemberInfo): void {
    const ctx = entry.plateCtx;
    const w = entry.plateCanvas.width;
    const h = entry.plateCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const tierSpec = getRankTierSpec(member.rp);
    const label = member.isLeader ? `★ ${member.name}` : member.name;

    ctx.fillStyle = 'rgba(10, 16, 29, 0.84)';
    ctx.strokeStyle = member.isLeader ? '#f59e0b' : tierSpec.colorHex;
    ctx.lineWidth = 3;
    const padX = 16;
    const padY = 12;
    const boxW = w - padX * 2;
    const boxH = h - padY * 2;
    const r = 14;
    ctx.beginPath();
    ctx.moveTo(padX + r, padY);
    ctx.lineTo(padX + boxW - r, padY);
    ctx.quadraticCurveTo(padX + boxW, padY, padX + boxW, padY + r);
    ctx.lineTo(padX + boxW, padY + boxH - r);
    ctx.quadraticCurveTo(padX + boxW, padY + boxH, padX + boxW - r, padY + boxH);
    ctx.lineTo(padX + r, padY + boxH);
    ctx.quadraticCurveTo(padX, padY + boxH, padX, padY + boxH - r);
    ctx.lineTo(padX, padY + r);
    ctx.quadraticCurveTo(padX, padY, padX + r, padY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = '800 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label.slice(0, 16), w / 2, h / 2 + 1);

    entry.plateTexture.needsUpdate = true;
  }

  private disposeEntry(entry: SquadmateVisualEntry): void {
    this.squadGroup.remove(entry.slotRoot);
    entry.visuals.dispose();
    entry.plateTexture.dispose();
    entry.plateMat.dispose();
  }

  applyAtmosphere(sceneManager: SceneManager): void {
    // Transparent scene background & no fog so the reference lobby image shows crisply behind the character
    sceneManager.scene.background = null;
    sceneManager.scene.fog = null;

    sceneManager.keyLight.color.set('#fff5e6');
    sceneManager.keyLight.intensity = 2.45;
    sceneManager.hemiLight.color.set('#93c5fd');
    sceneManager.hemiLight.groundColor.set('#4c1d95');
    sceneManager.hemiLight.intensity = 1.15;
    sceneManager.rimLight.color.set('#38bdf8');
    sceneManager.rimLight.intensity = 0.72;
  }

  update(deltaSeconds: number, elapsedSeconds: number): void {
    if (!this.root.visible) return;
    this.companion.update(deltaSeconds, elapsedSeconds);

    if (this.squadStageVisible) {
      const alpha = 1 - Math.exp(-10 * Math.min(0.05, deltaSeconds));
      let idx = 0;
      for (const entry of this.squadmates.values()) {
        idx += 1;
        entry.slotRoot.position.x += (entry.targetX - entry.slotRoot.position.x) * alpha;
        entry.slotRoot.position.z += (entry.targetZ - entry.slotRoot.position.z) * alpha;
        entry.slotRoot.rotation.y += (entry.targetYaw - entry.slotRoot.rotation.y) * alpha;
        entry.visuals.sync(entry.stateSnap, deltaSeconds, elapsedSeconds + idx * 0.73);
      }
    }
  }

  dispose(): void {
    for (const entry of this.squadmates.values()) {
      this.disposeEntry(entry);
    }
    this.squadmates.clear();
    this.companion.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
  }
}
