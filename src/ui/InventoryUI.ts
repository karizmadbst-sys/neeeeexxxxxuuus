import { i18n } from '../i18n/I18nManager';
import type { InventoryEntry, InventorySnapshot } from '../inventory/IInventorySystem';
import type { AmmoType } from '../loot/ILootSystem';
import { RARITY_COLORS } from '../loot/LootData';
import { WEAPON_BY_ID, type WeaponSlotIndex } from '../weapons/WeaponData';
import {
  getAmmoSvg,
  getArmorSvg,
  getBackpackSvg,
  getEmptyWeaponSlotSvg,
  getGlooWallSvg,
  getHelmetSvg,
  getHolsterSvg,
  getHudActionSvg,
  getLootItemSvg,
  getScopeSvg,
  getTrashSvg,
  getWeaponSvg,
} from './icons/GameIcons';

export interface InventoryUICallbacks {
  onClose: () => void;
  onEquipWeaponSlot: (slotIndex: WeaponSlotIndex) => void;
  onReloadWeaponSlot: (slotIndex: WeaponSlotIndex) => void;
  onUnequipWeaponSlot: (slotIndex: WeaponSlotIndex) => void;
  onEquipHolsteredWeapon: (instanceId: string) => void;
  onToggleHolster: () => void;
  onSwapWeaponSlots: () => void;
  onDropWeaponSlot: (slotIndex: WeaponSlotIndex) => void;
  onEquipHealing: (instanceId: string) => void;
  onUnequipHealing: () => void;
  onEquipArmor: (instanceId: string) => void;
  onUnequipArmor: () => void;
  onEquipHelmet: (instanceId: string) => void;
  onUnequipHelmet: () => void;
  onEquipBackpack: (instanceId: string) => void;
  onUnequipBackpack: () => void;
  onEquipScope: (instanceId: string) => void;
  onUnequipScope: () => void;
  onEquipSpecial: (instanceId: string) => void;
  onUnequipSpecial: () => void;
  onUseItem: (instanceId: string) => void;
  onDropItem: (instanceId: string) => void;
  onDropAmmo: (ammoType: AmmoType) => void;
}

interface ActiveDragState {
  pointerId: number;
  kind: 'weapon-slot' | 'item' | 'ammo';
  invId: string;
  slotIdx: WeaponSlotIndex;
  ammoType: AmmoType;
  startX: number;
  startY: number;
  active: boolean;
  sourceEl: HTMLElement;
  ghostEl: HTMLElement | null;
}

function parseWeaponSlotIdx(raw: string | undefined): WeaponSlotIndex {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return 0;
}

export class InventoryUI {
  readonly element: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly bagCapacityEl: HTMLElement;
  private readonly trashZoneEl: HTMLElement;
  private readonly trashIconEl: HTMLElement;
  private readonly trashFlashEl: HTMLElement;
  private readonly holsterBtn: HTMLButtonElement;
  private readonly swapBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private visible = false;
  private lastRenderHash = '';
  private lastSnapshot: InventorySnapshot | null = null;
  private dragState: ActiveDragState | null = null;
  private suppressClickUntilMs = 0;
  private trashOver = false;
  private trashFlashTimer = 0;
  private unsubI18n: (() => void) | null = null;

  private readonly onPointerMoveBound = (e: PointerEvent) => {
    const drag = this.dragState;
    if (!drag || e.pointerId !== drag.pointerId) return;

    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (!drag.active) {
      if (dist <= 10) return;
      drag.active = true;
      drag.sourceEl.style.opacity = '0.35';
      const ghost = document.createElement('div');
      ghost.className =
        'fixed z-[9999] pointer-events-none w-14 h-14 flex items-center justify-center drop-shadow-[0_6px_14px_rgba(0,0,0,0.9)]';
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      ghost.style.transform = 'translate3d(-50%, -50%, 0) scale(1.15)';
      const iconNode = drag.sourceEl.querySelector('[data-tile-icon]');
      ghost.innerHTML = iconNode ? iconNode.innerHTML : '';
      document.body.appendChild(ghost);
      drag.ghostEl = ghost;
    }

    if (drag.ghostEl) {
      drag.ghostEl.style.left = `${e.clientX}px`;
      drag.ghostEl.style.top = `${e.clientY}px`;
    }

    const over = this.isPointOverTrash(e.clientX, e.clientY);
    if (over !== this.trashOver) {
      this.setTrashHovered(over);
    }
  };

  private readonly onPointerUpBound = (e: PointerEvent) => {
    const drag = this.dragState;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.dragState = null;

    if (drag.ghostEl) {
      drag.ghostEl.remove();
      drag.ghostEl = null;
    }
    drag.sourceEl.style.opacity = '';

    const wasActiveDrag = drag.active;
    const droppedOnTrash = wasActiveDrag && this.isPointOverTrash(e.clientX, e.clientY);
    this.setTrashHovered(false);

    if (wasActiveDrag) {
      this.suppressClickUntilMs = performance.now() + 260;
    }

    if (droppedOnTrash) {
      this.executeTrashDrop(drag);
    }
  };

  constructor(private readonly callbacks: InventoryUICallbacks) {
    this.element = document.createElement('div');
    this.element.style.display = 'none';
    this.element.className =
      'pointer-events-auto absolute inset-0 z-30 flex items-center justify-center safe-pad bg-slate-950/75';

    this.element.innerHTML = `
      <div class="w-full max-w-[780px] max-h-[94dvh] bg-slate-900/95 border border-slate-700/80 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div class="px-3 py-1.5 sm:px-3.5 sm:py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div class="flex items-center gap-2.5">
            <span class="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-sky-400">${getBackpackSvg(2)}</span>
            <span data-role="bag-capacity" class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs font-black tracking-wider text-amber-300 tabular-nums">0/8</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              data-inv-action="swap-weapons"
              aria-label="${i18n.t('inv.swapWeaponsAria')}"
              class="w-8 h-8 sm:w-9 sm:h-9 rounded bg-slate-800 hover:bg-slate-700 border border-sky-500/55 flex items-center justify-center text-sky-300"
            >
              <span class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">${getHudActionSvg('weaponSwitch')}</span>
            </button>

            <button
              type="button"
              data-inv-action="toggle-holster"
              aria-label="${i18n.t('inv.toggleHolsterAria')}"
              class="w-8 h-8 sm:w-9 sm:h-9 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-200"
            >
              <span class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">${getHolsterSvg()}</span>
            </button>

            <button
              type="button"
              data-inv-action="close"
              aria-label="${i18n.t('inv.closeAria')}"
              class="w-8 h-8 sm:w-9 sm:h-9 rounded bg-orange-600 hover:bg-orange-500 flex items-center justify-center text-white"
            >
              <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>
        </div>

        <div data-role="inv-body" class="p-2.5 sm:p-3 overflow-y-auto nexus-scroll flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3 text-slate-100"></div>

        <div class="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-slate-950/90 border-t border-slate-800 flex items-center justify-center shrink-0">
          <div
            data-trash-dropzone
            aria-label="${i18n.t('inv.trashAria')}"
            class="relative w-full max-w-[260px] h-10 sm:h-14 rounded-lg border-2 border-dashed border-slate-600/80 bg-slate-900/70 flex items-center justify-center transition-all duration-150 select-none"
          >
            <div data-role="trash-flash" class="hidden pointer-events-none absolute inset-0 rounded-lg border-2 border-rose-400 bg-rose-500/25"></div>
            <div data-role="trash-icon" class="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center pointer-events-none transition-transform duration-150">
              ${getTrashSvg(false)}
            </div>
          </div>
        </div>
      </div>
    `;

    this.bodyEl = this.element.querySelector('[data-role="inv-body"]')!;
    this.bagCapacityEl = this.element.querySelector('[data-role="bag-capacity"]')!;
    this.trashZoneEl = this.element.querySelector('[data-trash-dropzone]')!;
    this.trashIconEl = this.element.querySelector('[data-role="trash-icon"]')!;
    this.trashFlashEl = this.element.querySelector('[data-role="trash-flash"]')!;
    this.holsterBtn = this.element.querySelector<HTMLButtonElement>('[data-inv-action="toggle-holster"]')!;
    this.swapBtn = this.element.querySelector<HTMLButtonElement>('[data-inv-action="swap-weapons"]')!;
    this.closeBtn = this.element.querySelector<HTMLButtonElement>('[data-inv-action="close"]')!;

    this.unsubI18n = i18n.subscribe(() => {
      this.swapBtn.setAttribute('aria-label', i18n.t('inv.swapWeaponsAria'));
      this.holsterBtn.setAttribute('aria-label', i18n.t('inv.toggleHolsterAria'));
      this.closeBtn.setAttribute('aria-label', i18n.t('inv.closeAria'));
      this.trashZoneEl.setAttribute('aria-label', i18n.t('inv.trashAria'));
      this.lastRenderHash = '';
      if (this.visible && this.lastSnapshot) {
        this.render(this.lastSnapshot);
      }
    });

    this.bodyEl.addEventListener('pointerdown', (e) => {
      const tile = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-drag-kind]');
      if (!tile) return;
      // Don't start item drag if user pressed an inner micro-action button (e.g. reload icon)
      if ((e.target as HTMLElement | null)?.closest('[data-micro-action]')) return;

      const kind = tile.dataset.dragKind as ActiveDragState['kind'] | undefined;
      if (!kind) return;

      this.dragState = {
        pointerId: e.pointerId,
        kind,
        invId: tile.dataset.invId ?? '',
        slotIdx: parseWeaponSlotIdx(tile.dataset.slotIdx),
        ammoType: (tile.dataset.ammoType ?? 'AR') as AmmoType,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        sourceEl: tile,
        ghostEl: null,
      };
    });

    window.addEventListener('pointermove', this.onPointerMoveBound, { passive: true });
    window.addEventListener('pointerup', this.onPointerUpBound, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUpBound, { passive: true });

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.callbacks.onClose();
        return;
      }

      if (performance.now() < this.suppressClickUntilMs) {
        return;
      }

      // Direct clicks on Trash Bin never delete anything
      if ((e.target as HTMLElement | null)?.closest('[data-trash-dropzone]')) {
        return;
      }

      const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-inv-action]');
      if (!btn) return;
      e.stopPropagation();

      const action = btn.dataset.invAction;
      const id = btn.dataset.invId ?? '';
      const slotIdx = parseWeaponSlotIdx(btn.dataset.slotIdx);

      switch (action) {
        case 'close':
          this.callbacks.onClose();
          break;
        case 'swap-weapons':
          this.callbacks.onSwapWeaponSlots();
          break;
        case 'toggle-holster':
          this.callbacks.onToggleHolster();
          break;
        case 'equip-weapon-slot':
          this.callbacks.onEquipWeaponSlot(slotIdx);
          break;
        case 'reload-weapon-slot':
          this.callbacks.onReloadWeaponSlot(slotIdx);
          break;
        case 'equip-holstered':
          this.callbacks.onEquipHolsteredWeapon(id);
          break;
        case 'use-item':
          this.callbacks.onUseItem(id);
          break;
        case 'equip-healing':
          this.callbacks.onEquipHealing(id);
          break;
        case 'unequip-healing':
          this.callbacks.onUnequipHealing();
          break;
        case 'equip-armor':
          this.callbacks.onEquipArmor(id);
          break;
        case 'unequip-armor':
          this.callbacks.onUnequipArmor();
          break;
        case 'equip-helmet':
          this.callbacks.onEquipHelmet(id);
          break;
        case 'unequip-helmet':
          this.callbacks.onUnequipHelmet();
          break;
        case 'equip-backpack':
          this.callbacks.onEquipBackpack(id);
          break;
        case 'unequip-backpack':
          this.callbacks.onUnequipBackpack();
          break;
        case 'equip-scope':
          this.callbacks.onEquipScope(id);
          break;
        case 'unequip-scope':
          this.callbacks.onUnequipScope();
          break;
        case 'equip-special':
          this.callbacks.onEquipSpecial(id);
          break;
        case 'unequip-special':
          this.callbacks.onUnequipSpecial();
          break;
      }
    });
  }

  private isPointOverTrash(clientX: number, clientY: number): boolean {
    const rect = this.trashZoneEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const pad = 10;
    return (
      clientX >= rect.left - pad &&
      clientX <= rect.right + pad &&
      clientY >= rect.top - pad &&
      clientY <= rect.bottom + pad
    );
  }

  private setTrashHovered(hovered: boolean): void {
    this.trashOver = hovered;
    this.trashIconEl.innerHTML = getTrashSvg(hovered);
    if (hovered) {
      this.trashZoneEl.className =
        'relative w-full max-w-[260px] h-14 rounded-lg border-2 border-solid border-rose-400 bg-rose-950/75 flex items-center justify-center transition-all duration-150 select-none scale-[1.04]';
      this.trashIconEl.style.transform = 'scale(1.16)';
    } else {
      this.trashZoneEl.className =
        'relative w-full max-w-[260px] h-14 rounded-lg border-2 border-dashed border-slate-600/80 bg-slate-900/70 flex items-center justify-center transition-all duration-150 select-none';
      this.trashIconEl.style.transform = '';
    }
  }

  private flashTrashDeleted(): void {
    window.clearTimeout(this.trashFlashTimer);
    this.trashFlashEl.classList.remove('hidden');
    this.trashFlashTimer = window.setTimeout(() => {
      this.trashFlashEl.classList.add('hidden');
    }, 280);
  }

  private executeTrashDrop(drag: ActiveDragState): void {
    if (drag.kind === 'weapon-slot') {
      this.callbacks.onDropWeaponSlot(drag.slotIdx);
    } else if (drag.kind === 'item' && drag.invId) {
      this.callbacks.onDropItem(drag.invId);
    } else if (drag.kind === 'ammo') {
      this.callbacks.onDropAmmo(drag.ammoType);
    }
    this.lastRenderHash = '';
    this.flashTrashDeleted();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
    if (visible) {
      this.lastRenderHash = '';
    } else if (this.dragState) {
      this.dragState.ghostEl?.remove();
      this.dragState = null;
      this.setTrashHovered(false);
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  render(snap: InventorySnapshot): void {
    this.lastSnapshot = snap;
    if (!this.visible) return;

    const isFull = snap.bagUsed >= snap.bagCapacity;
    this.bagCapacityEl.textContent = `${snap.bagUsed}/${snap.bagCapacity}`;
    this.bagCapacityEl.className = isFull
      ? 'px-2 py-0.5 rounded bg-rose-950/90 border border-rose-500/70 text-xs font-black tracking-wider text-rose-300 tabular-nums'
      : 'px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs font-black tracking-wider text-amber-300 tabular-nums';

    const hash = JSON.stringify({
      w1: snap.weaponSlot1?.instanceId,
      w1m: snap.weaponSlot1?.weaponMagAmmo,
      w2: snap.weaponSlot2?.instanceId,
      w2m: snap.weaponSlot2?.weaponMagAmmo,
      w3: snap.weaponSlot3?.instanceId,
      w3m: snap.weaponSlot3?.weaponMagAmmo,
      w4: snap.weaponSlot4?.instanceId,
      act: snap.activeWeaponSlotIndex,
      hw: snap.holsteredWeapons.map((w) => `${w.instanceId}:${w.weaponMagAmmo ?? 0}`),
      h: snap.healingSlot ? `${snap.healingSlot.instanceId}:${snap.healingSlot.quantity}` : '',
      hr: snap.healingReserve.map((e) => `${e.instanceId}:${e.quantity}`),
      am: snap.ammo,
      ar: snap.armorSlot ? `${snap.armorSlot.instanceId}:${Math.round(snap.armorSlot.durability ?? 0)}` : '',
      arr: snap.armorReserve.map((e) => `${e.instanceId}:${Math.round(e.durability ?? 0)}`),
      hm: snap.helmetSlot ? `${snap.helmetSlot.instanceId}:${Math.round(snap.helmetSlot.durability ?? 0)}` : '',
      hmr: snap.helmetReserve.map((e) => `${e.instanceId}:${Math.round(e.durability ?? 0)}`),
      bp: snap.backpackSlot ? snap.backpackSlot.instanceId : '',
      bpr: snap.backpackReserve.map((e) => e.instanceId),
      sc: snap.scopeSlot ? snap.scopeSlot.instanceId : '',
      scr: snap.scopeReserve.map((e) => e.instanceId),
      sp: snap.specialSlot ? `${snap.specialSlot.instanceId}:${snap.specialSlot.quantity}` : '',
      spr: snap.specialReserve.map((e) => `${e.instanceId}:${e.quantity}`),
      gw: snap.glooWalls,
      gwm: snap.maxGlooWalls,
      bu: snap.bagUsed,
      bc: snap.bagCapacity,
      ult: snap.unlimitedAmmo ? 1 : 0,
    });

    if (hash === this.lastRenderHash) return;
    this.lastRenderHash = hash;

    const isUnarmed = snap.activeWeaponSlotIndex === -1;
    this.holsterBtn.className = isUnarmed
      ? 'w-9 h-9 rounded bg-orange-600/25 hover:bg-orange-600/40 border border-orange-400 flex items-center justify-center text-orange-300'
      : 'w-9 h-9 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-200';

    const gearIconsHtml = [
      this.renderProtectiveTile('helmet', snap.helmetSlot, snap.helmetReserve),
      this.renderProtectiveTile('armor', snap.armorSlot, snap.armorReserve),
      this.renderBackpackTile(snap.backpackSlot, snap.backpackReserve),
      this.renderScopeTile(snap.scopeSlot, snap.scopeReserve),
    ].join('');

    const unlimited = Boolean(snap.unlimitedAmmo);
    const ammoTilesHtml = (
      [
        ['AR', snap.ammo.AR, '#f59e0b'],
        ['SMG', snap.ammo.SMG, '#38bdf8'],
        ['SHOTGUN', snap.ammo.SHOTGUN, '#f97316'],
        ['SNIPER', snap.ammo.SNIPER, '#84cc16'],
        ['PISTOL', snap.ammo.PISTOL, '#e2e8f0'],
      ] as const
    )
      .map(([t, count, hex]) => this.renderAmmoTile(t, count, hex, unlimited))
      .join('');

    const healTilesHtml = [
      this.renderConsumableTile(snap.healingSlot, 'healing', true),
      ...snap.healingReserve.map((e) => this.renderConsumableTile(e, 'healing', false)),
    ].join('');

    const specialTilesHtml = [
      this.renderConsumableTile(snap.specialSlot, 'special', true),
      ...snap.specialReserve.map((e) => this.renderConsumableTile(e, 'special', false)),
    ].join('');

    const holsteredTilesHtml = snap.holsteredWeapons
      .map((w) => this.renderHolsteredWeaponTile(w))
      .join('');

    this.bodyEl.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${this.renderWeaponSlotTile(0, snap.weaponSlot1, snap.activeWeaponSlotIndex === 0, snap)}
        ${this.renderWeaponSlotTile(1, snap.weaponSlot2, snap.activeWeaponSlotIndex === 1, snap)}
        ${this.renderWeaponSlotTile(2, snap.weaponSlot3, snap.activeWeaponSlotIndex === 2, snap)}
        ${this.renderWeaponSlotTile(3, snap.weaponSlot4, snap.activeWeaponSlotIndex === 3, snap)}
      </div>
      ${
        holsteredTilesHtml
          ? `<div class="flex flex-wrap gap-2">${holsteredTilesHtml}</div>`
          : ''
      }

      <div class="flex flex-wrap items-start gap-2.5 pt-1 border-t border-slate-800/80">
        ${gearIconsHtml}
      </div>

      <div class="grid grid-cols-5 gap-2 pt-1 border-t border-slate-800/80">
        ${ammoTilesHtml}
      </div>

      <div class="flex flex-wrap items-start gap-2.5 pt-1 border-t border-slate-800/80">
        ${healTilesHtml}
        <div class="w-px h-14 bg-slate-800 mx-0.5"></div>
        ${specialTilesHtml}
        <div class="w-px h-14 bg-slate-800 mx-0.5"></div>
        ${this.renderGlooWallTile(snap.glooWalls, snap.maxGlooWalls)}
      </div>
    `;
  }

  private renderGlooWallTile(_count: number, maxCount: number): string {
    const label = i18n.t('inv.glooWall.label');
    return `
      <div
        role="group"
        aria-label="${label}"
        title="${label} — Unlimited (Max ${maxCount} active)"
        class="border-2 border-sky-400/80 bg-slate-900/90 shadow-[0_0_12px_rgba(56,189,248,0.22)] w-16 h-14 rounded-lg relative flex flex-col items-center justify-center p-1"
      >
        <span class="pointer-events-none absolute top-0.5 left-1 text-[9px] font-black text-sky-300 tabular-nums">[V]</span>
        <span class="pointer-events-none absolute top-0.5 right-1 text-[8px] font-black text-amber-300 tabular-nums">MAX ${maxCount}</span>
        <div data-tile-icon class="pointer-events-none w-9 h-9 flex items-center justify-center">
          ${getGlooWallSvg()}
        </div>
        <span class="pointer-events-none absolute bottom-0.5 right-1 px-1 rounded bg-slate-950/90 text-[10px] font-black tabular-nums text-sky-200">∞</span>
      </div>
    `;
  }

  private renderWeaponSlotTile(
    slotIdx: WeaponSlotIndex,
    entry: InventoryEntry | null,
    isActive: boolean,
    snap: InventorySnapshot,
  ): string {
    const slotTag =
      slotIdx === 0
        ? '1 · LARGE'
        : slotIdx === 1
          ? '2 · LARGE'
          : slotIdx === 2
            ? '3 · PISTOL'
            : '4 · MELEE';
    if (!entry) {
      return `
        <div class="h-20 rounded-lg border border-dashed border-slate-700/80 bg-slate-950/50 relative flex items-center justify-center opacity-55">
          <span class="absolute top-1 left-1.5 text-[9px] font-black tracking-wider text-slate-400 uppercase tabular-nums">${slotTag}</span>
          <div class="w-20 h-10 flex items-center justify-center">${getEmptyWeaponSlotSvg()}</div>
        </div>
      `;
    }

    const weaponDef = entry.definition.weaponId
      ? WEAPON_BY_ID[entry.definition.weaponId]
      : undefined;
    const isMelee = weaponDef?.type === 'MELEE' || (weaponDef?.magazineSize ?? 30) <= 0;
    const magSize = weaponDef?.magazineSize ?? 30;
    const magAmmo = entry.weaponMagAmmo ?? magSize;
    const ammoType: AmmoType =
      weaponDef?.type === 'SMG'
        ? 'SMG'
        : weaponDef?.type === 'SHOTGUN'
          ? 'SHOTGUN'
          : weaponDef?.type === 'SNIPER'
            ? 'SNIPER'
            : weaponDef?.type === 'PISTOL'
              ? 'PISTOL'
              : 'AR';
    const reserveCount = isMelee ? 0 : (snap.ammo[ammoType] ?? 0);
    const unlimited = Boolean(snap.unlimitedAmmo);
    const canReload = !isMelee && !unlimited && magAmmo < magSize && reserveCount > 0;
    const rarityHex = RARITY_COLORS[entry.definition.rarity];

    const weaponLabel = i18n.translateWeaponName(entry.definition.weaponId ?? entry.definition.name);

    return `
      <div
        data-drag-kind="weapon-slot"
        data-slot-idx="${slotIdx}"
        data-inv-action="${isActive ? 'toggle-holster' : 'equip-weapon-slot'}"
        role="button"
        aria-label="${weaponLabel}"
        class="touch-none cursor-grab active:cursor-grabbing h-20 rounded-lg border-2 ${
          isActive
            ? 'border-orange-400 bg-slate-900/90 shadow-[0_0_16px_rgba(249,115,22,0.28)]'
            : 'border-slate-700/80 bg-slate-950/75 hover:border-sky-400/60'
        } relative flex items-center justify-center p-2 transition-colors"
      >
        <span class="pointer-events-none absolute top-1 left-1.5 px-1 rounded bg-slate-950/90 text-[9px] font-black tracking-wider uppercase tabular-nums ${
          isActive ? 'text-orange-300' : 'text-slate-300'
        }" style="border: 1px solid ${rarityHex}">${slotTag}</span>
        ${
          canReload
            ? `<button type="button" data-micro-action data-inv-action="reload-weapon-slot" data-slot-idx="${slotIdx}" aria-label="${i18n.t('inv.reloadSlotAria', { slot: slotIdx + 1 })}" class="absolute top-1 right-1 w-6 h-6 rounded bg-amber-600/90 hover:bg-amber-500 text-white flex items-center justify-center z-10">${getHudActionSvg('reload')}</button>`
            : ''
        }
        <div data-tile-icon class="pointer-events-none w-24 h-12 flex items-center justify-center">
          ${getWeaponSvg(entry.definition.weaponId, entry.definition.accentHex)}
        </div>
        <span class="pointer-events-none absolute bottom-1 left-1.5 text-[9px] font-extrabold text-slate-200 uppercase truncate max-w-[55%]">${weaponLabel}</span>
        <span class="pointer-events-none absolute bottom-1 right-1.5 px-1.5 rounded bg-slate-950/90 text-[10px] font-black tabular-nums ${
          isMelee ? 'text-slate-200' : !unlimited && magAmmo === 0 ? 'text-rose-400' : 'text-amber-200'
        }">${isMelee ? i18n.t('hud.meleeLabel') : `${magAmmo}/${unlimited ? '∞' : reserveCount}`}</span>
      </div>
    `;
  }

  private renderHolsteredWeaponTile(entry: InventoryEntry): string {
    const rarityHex = RARITY_COLORS[entry.definition.rarity];
    const weaponDef = entry.definition.weaponId
      ? WEAPON_BY_ID[entry.definition.weaponId]
      : undefined;
    const isMelee = weaponDef?.type === 'MELEE' || (weaponDef?.magazineSize ?? 1) <= 0;
    const weaponLabel = i18n.translateWeaponName(entry.definition.weaponId ?? entry.definition.name);
    return `
      <div
        data-drag-kind="item"
        data-inv-id="${entry.instanceId}"
        data-inv-action="equip-holstered"
        role="button"
        aria-label="${weaponLabel}"
        class="touch-none cursor-grab active:cursor-grabbing w-20 h-14 rounded-lg border bg-slate-950/75 relative flex items-center justify-center p-1"
        style="border-color: ${rarityHex}"
      >
        <div data-tile-icon class="pointer-events-none w-16 h-9 flex items-center justify-center">
          ${getWeaponSvg(entry.definition.weaponId, entry.definition.accentHex)}
        </div>
        <span class="pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-black tabular-nums text-slate-200">${isMelee ? i18n.t('hud.meleeLabel') : (entry.weaponMagAmmo ?? 0)}</span>
      </div>
    `;
  }

  private renderProtectiveTile(
    kind: 'helmet' | 'armor',
    equipped: InventoryEntry | null,
    reserve: readonly InventoryEntry[],
  ): string {
    const equipAction = kind === 'helmet' ? 'equip-helmet' : 'equip-armor';
    const unequipAction = kind === 'helmet' ? 'unequip-helmet' : 'unequip-armor';

    const eqHtml = equipped
      ? (() => {
          const tier = (kind === 'helmet'
            ? (equipped.definition.helmetLevel ?? 1)
            : (equipped.definition.armorLevel ?? 1)) as 1 | 2 | 3;
          const dur = Math.round(equipped.durability ?? 0);
          const max = Math.round(equipped.maxDurability ?? 100);
          const pct = max > 0 ? Math.round((dur / max) * 100) : 0;
          const svg = kind === 'helmet' ? getHelmetSvg(tier) : getArmorSvg(tier);
          return `
            <div
              data-drag-kind="item"
              data-inv-id="${equipped.instanceId}"
              data-inv-action="${unequipAction}"
              role="button"
              aria-label="${equipped.definition.name}"
              class="touch-none cursor-grab active:cursor-grabbing w-14 h-14 rounded-lg border-2 border-sky-400/75 bg-slate-900/90 relative flex items-center justify-center p-1.5"
            >
              <span class="pointer-events-none absolute top-0.5 left-1 text-[9px] font-black text-sky-300 tabular-nums">${tier}</span>
              <div data-tile-icon class="pointer-events-none w-10 h-10 flex items-center justify-center">${svg}</div>
              <span class="pointer-events-none absolute bottom-0.5 right-1 px-1 rounded bg-slate-950/90 text-[9px] font-black text-white tabular-nums">${pct}%</span>
            </div>
          `;
        })()
      : `
        <div class="w-14 h-14 rounded-lg border border-dashed border-slate-700/80 bg-slate-950/45 flex items-center justify-center opacity-35">
          <div class="w-9 h-9 flex items-center justify-center">${kind === 'helmet' ? getHelmetSvg(0) : getArmorSvg(0)}</div>
        </div>
      `;

    const resHtml = reserve
      .map((entry) => {
        const tier = (kind === 'helmet'
          ? (entry.definition.helmetLevel ?? 1)
          : (entry.definition.armorLevel ?? 1)) as 1 | 2 | 3;
        const dur = Math.round(entry.durability ?? 0);
        const max = Math.round(entry.maxDurability ?? 100);
        const pct = max > 0 ? Math.round((dur / max) * 100) : 0;
        const svg = kind === 'helmet' ? getHelmetSvg(tier) : getArmorSvg(tier);
        return `
          <div
            data-drag-kind="item"
            data-inv-id="${entry.instanceId}"
            data-inv-action="${equipAction}"
            role="button"
            aria-label="${entry.definition.name}"
            class="touch-none cursor-grab active:cursor-grabbing w-12 h-12 rounded-lg border border-slate-700 bg-slate-950/80 relative flex items-center justify-center p-1"
          >
            <span class="pointer-events-none absolute top-0.5 left-1 text-[9px] font-black text-slate-300 tabular-nums">${tier}</span>
            <div data-tile-icon class="pointer-events-none w-8 h-8 flex items-center justify-center">${svg}</div>
            <span class="pointer-events-none absolute bottom-0.5 right-0.5 text-[8px] font-black text-slate-300 tabular-nums">${pct}%</span>
          </div>
        `;
      })
      .join('');

    return eqHtml + resHtml;
  }

  private renderBackpackTile(
    equipped: InventoryEntry | null,
    reserve: readonly InventoryEntry[],
  ): string {
    const eqHtml = equipped
      ? (() => {
          const tier = (equipped.definition.backpackLevel ?? 1) as 1 | 2 | 3;
          return `
            <div
              data-drag-kind="item"
              data-inv-id="${equipped.instanceId}"
              data-inv-action="unequip-backpack"
              role="button"
              aria-label="${equipped.definition.name}"
              class="touch-none cursor-grab active:cursor-grabbing w-14 h-14 rounded-lg border-2 border-amber-400/75 bg-slate-900/90 relative flex items-center justify-center p-1.5"
            >
              <span class="pointer-events-none absolute top-0.5 left-1 text-[9px] font-black text-amber-300 tabular-nums">${tier}</span>
              <div data-tile-icon class="pointer-events-none w-10 h-10 flex items-center justify-center">${getBackpackSvg(tier)}</div>
              <span class="pointer-events-none absolute bottom-0.5 right-1 px-1 rounded bg-slate-950/90 text-[9px] font-black text-amber-200 tabular-nums">+${equipped.definition.backpackBonusSlots ?? 0}</span>
            </div>
          `;
        })()
      : `
        <div class="w-14 h-14 rounded-lg border border-dashed border-slate-700/80 bg-slate-950/45 flex items-center justify-center opacity-35">
          <div class="w-9 h-9 flex items-center justify-center">${getBackpackSvg(0)}</div>
        </div>
      `;

    const resHtml = reserve
      .map((entry) => {
        const tier = (entry.definition.backpackLevel ?? 1) as 1 | 2 | 3;
        return `
          <div
            data-drag-kind="item"
            data-inv-id="${entry.instanceId}"
            data-inv-action="equip-backpack"
            role="button"
            aria-label="${entry.definition.name}"
            class="touch-none cursor-grab active:cursor-grabbing w-12 h-12 rounded-lg border border-slate-700 bg-slate-950/80 relative flex items-center justify-center p-1"
          >
            <div data-tile-icon class="pointer-events-none w-8 h-8 flex items-center justify-center">${getBackpackSvg(tier)}</div>
            <span class="pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-black text-amber-300 tabular-nums">+${entry.definition.backpackBonusSlots ?? 0}</span>
          </div>
        `;
      })
      .join('');

    return eqHtml + resHtml;
  }

  private renderScopeTile(
    equipped: InventoryEntry | null,
    reserve: readonly InventoryEntry[],
  ): string {
    const eqHtml = equipped
      ? (() => {
          const level = (equipped.definition.scopeLevel ?? 2) as 2 | 4 | 6 | 8;
          return `
            <div
              data-drag-kind="item"
              data-inv-id="${equipped.instanceId}"
              data-inv-action="unequip-scope"
              role="button"
              aria-label="${equipped.definition.name}"
              class="touch-none cursor-grab active:cursor-grabbing w-14 h-14 rounded-lg border-2 border-emerald-400/75 bg-slate-900/90 relative flex items-center justify-center p-1.5"
            >
              <div data-tile-icon class="pointer-events-none w-10 h-10 flex items-center justify-center">${getScopeSvg(level)}</div>
              <span class="pointer-events-none absolute bottom-0.5 right-1 px-1 rounded bg-slate-950/90 text-[9px] font-black text-emerald-300 tabular-nums">${level}x</span>
            </div>
          `;
        })()
      : `
        <div class="w-14 h-14 rounded-lg border border-dashed border-slate-700/80 bg-slate-950/45 flex items-center justify-center opacity-35">
          <div class="w-9 h-9 flex items-center justify-center">${getScopeSvg(2)}</div>
        </div>
      `;

    const resHtml = reserve
      .map((entry) => {
        const level = (entry.definition.scopeLevel ?? 2) as 2 | 4 | 6 | 8;
        return `
          <div
            data-drag-kind="item"
            data-inv-id="${entry.instanceId}"
            data-inv-action="equip-scope"
            role="button"
            aria-label="${entry.definition.name}"
            class="touch-none cursor-grab active:cursor-grabbing w-12 h-12 rounded-lg border border-slate-700 bg-slate-950/80 relative flex items-center justify-center p-1"
          >
            <div data-tile-icon class="pointer-events-none w-8 h-8 flex items-center justify-center">${getScopeSvg(level)}</div>
            <span class="pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-black text-emerald-300 tabular-nums">${level}x</span>
          </div>
        `;
      })
      .join('');

    return eqHtml + resHtml;
  }

  private renderAmmoTile(
    ammoType: AmmoType,
    count: number,
    colorHex: string,
    unlimited = false,
  ): string {
    const ammoLabel = i18n.t('inv.ammoAria', { type: i18n.translateAmmoType(ammoType) });
    const hasAmmo = unlimited || count > 0;
    return `
      <div
        ${count > 0 ? `data-drag-kind="ammo" data-ammo-type="${ammoType}"` : ''}
        aria-label="${ammoLabel}"
        class="${count > 0 ? 'touch-none cursor-grab active:cursor-grabbing' : hasAmmo ? '' : 'opacity-40'} h-14 rounded-lg border border-slate-700/80 bg-slate-950/75 relative flex items-center justify-center p-1.5"
        style="border-color: ${hasAmmo ? colorHex : 'rgba(51,65,85,0.6)'}"
      >
        <div data-tile-icon class="pointer-events-none w-10 h-10 flex items-center justify-center">
          ${getAmmoSvg(ammoType)}
        </div>
        <span class="pointer-events-none absolute bottom-0.5 right-1.5 px-1 rounded bg-slate-950/90 text-[10px] font-black tabular-nums text-white">${unlimited ? '∞' : count}</span>
      </div>
    `;
  }

  private renderConsumableTile(
    entry: InventoryEntry | null,
    slotKind: 'healing' | 'special',
    isEquipped: boolean,
  ): string {
    if (!entry) {
      const slotNum = slotKind === 'healing' ? '3' : '4';
      const fallbackSvg =
        slotKind === 'healing'
          ? getLootItemSvg({
              id: 'med_kit',
              category: 'health',
              name: 'Medkit',
              rarity: 'rare',
              description: '',
              stackable: true,
              maxStack: 3,
              spawnWeight: 0,
              accentHex: '#10b981',
              iconTag: 'MED',
            })
          : getLootItemSvg({
              id: 'special_adrenaline',
              category: 'special',
              name: 'Adrenaline',
              rarity: 'epic',
              description: '',
              stackable: true,
              maxStack: 2,
              spawnWeight: 0,
              accentHex: '#a855f7',
              iconTag: 'ADR',
            });
      return `
        <div class="w-14 h-14 rounded-lg border border-dashed border-slate-700/80 bg-slate-950/45 relative flex items-center justify-center opacity-35">
          <span class="absolute top-0.5 left-1 text-[9px] font-black text-slate-400 tabular-nums">${slotNum}</span>
          <div class="w-9 h-9 flex items-center justify-center">${fallbackSvg}</div>
        </div>
      `;
    }

    const equipAction = slotKind === 'healing' ? 'equip-healing' : 'equip-special';
    const tapAction = isEquipped ? 'use-item' : equipAction;
    const borderColor = isEquipped
      ? slotKind === 'healing'
        ? '#10b981'
        : '#a855f7'
      : RARITY_COLORS[entry.definition.rarity];

    const itemName = i18n.translateLootName(entry.definition.id, entry.definition.name);

    return `
      <div
        data-drag-kind="item"
        data-inv-id="${entry.instanceId}"
        data-inv-action="${tapAction}"
        role="button"
        aria-label="${itemName}"
        class="touch-none cursor-grab active:cursor-grabbing ${isEquipped ? 'w-14 h-14 border-2 bg-slate-900/90' : 'w-12 h-12 border bg-slate-950/80'} rounded-lg relative flex items-center justify-center p-1.5"
        style="border-color: ${borderColor}"
      >
        ${
          isEquipped
            ? `<span class="pointer-events-none absolute top-0.5 left-1 text-[9px] font-black tabular-nums ${
                slotKind === 'healing' ? 'text-emerald-300' : 'text-purple-300'
              }">${slotKind === 'healing' ? '3' : '4'}</span>`
            : `<button type="button" data-micro-action data-inv-action="use-item" data-inv-id="${entry.instanceId}" aria-label="${i18n.t('inv.useItemAria', { item: itemName })}" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black leading-none flex items-center justify-center z-10">+</button>`
        }
        <div data-tile-icon class="pointer-events-none ${isEquipped ? 'w-10 h-10' : 'w-8 h-8'} flex items-center justify-center">
          ${getLootItemSvg(entry.definition)}
        </div>
        <span class="pointer-events-none absolute bottom-0.5 right-1 px-1 rounded bg-slate-950/90 text-[10px] font-black text-white tabular-nums">${entry.quantity}</span>
      </div>
    `;
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
    window.clearTimeout(this.trashFlashTimer);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);
    this.dragState?.ghostEl?.remove();
    this.dragState = null;
  }
}
