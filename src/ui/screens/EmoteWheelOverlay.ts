import {
  EMOTE_WHEEL_SLOT_COUNT,
  getEmoteById,
  getEmoteStyleLabelKey,
  type EmoteDefinition,
} from '../../emotes/EmoteCatalog';
import { i18n } from '../../i18n/I18nManager';
import { getEmoteSvg, getEmoteWheelTriggerSvg } from '../icons/GameIcons';

export interface EmoteWheelCallbacks {
  onSelectEmote: (emoteId: string) => void;
  onOpenEmoteShop: () => void;
  onClose: () => void;
}

interface SlotButtonEntry {
  index: number;
  el: HTMLButtonElement;
  emote: EmoteDefinition | null;
  angleRad: number;
}

export class EmoteWheelOverlay {
  readonly element: HTMLElement;
  private readonly wheelEl: HTMLElement;
  private readonly ringSvgEl: SVGSVGElement;
  private readonly hubTitleEl: HTMLElement;
  private readonly hubSubEl: HTMLElement;
  private readonly shopBtnEl: HTMLButtonElement;
  private readonly closeBtnEl: HTMLButtonElement;
  private readonly slotButtons: SlotButtonEntry[] = [];

  private isOpenState = false;
  private inMatchState = false;
  private activeSlotIdx = -1;
  private centerX = 0;
  private centerY = 0;
  private radiusPx = 138;
  private slotSizePx = 80;
  private hubSizePx = 124;
  private openPointerId: number | null = null;
  private unsubI18n: (() => void) | null = null;
  private readonly hubEl: HTMLElement;

  private readonly onKeyDownBound = (e: KeyboardEvent) => {
    if (!this.isOpenState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close(true);
    } else if (e.key >= '1' && e.key <= '8') {
      const idx = Number(e.key) - 1;
      const entry = this.slotButtons[idx];
      if (this.inMatchState && (!entry || !entry.emote)) {
        return;
      }
      this.triggerSlot(idx);
    }
  };

  constructor(private readonly callbacks: EmoteWheelCallbacks) {
    this.element = document.createElement('div');
    this.element.className =
      'hidden absolute inset-0 z-30 pointer-events-auto select-none touch-none bg-slate-950/35';

    this.element.innerHTML = `
      <div data-role="wheel-stage" class="absolute" style="width: 380px; height: 380px;">
        <svg
          data-role="wheel-svg"
          viewBox="-190 -190 380 380"
          class="w-full h-full pointer-events-none"
          aria-hidden="true"
        ></svg>

        <!-- Center Hub -->
        <div
          data-role="wheel-hub"
          class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[124px] h-[124px] rounded-full bg-slate-950/95 border-2 border-slate-700/90 shadow-2xl flex flex-col items-center justify-center text-center px-2.5 gap-1"
        >
          <span class="w-5 h-5 text-orange-400 shrink-0">${getEmoteWheelTriggerSvg()}</span>
          <div data-role="hub-title" class="text-[11px] font-black tracking-wider uppercase text-white leading-tight line-clamp-2">
            ${i18n.t('emoteWheel.title')}
          </div>
          <div data-role="hub-sub" class="text-[10px] font-semibold text-sky-300 truncate max-w-full">
            ${i18n.t('emoteWheel.hint')}
          </div>
          <div class="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              data-action="wheel-shop"
              class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] font-bold uppercase tracking-wider text-amber-300 whitespace-nowrap"
            >${i18n.t('emoteWheel.shopBtn')}</button>
            <button
              type="button"
              data-action="wheel-close"
              aria-label="${i18n.t('common.close')}"
              class="w-6 h-6 rounded-full bg-slate-800 hover:bg-rose-500/30 border border-slate-600 text-xs font-black text-slate-200 flex items-center justify-center"
            >×</button>
          </div>
        </div>
      </div>
    `;

    this.wheelEl = this.element.querySelector('[data-role="wheel-stage"]')!;
    this.ringSvgEl = this.element.querySelector('[data-role="wheel-svg"]')!;
    this.hubEl = this.element.querySelector('[data-role="wheel-hub"]')!;
    this.hubTitleEl = this.element.querySelector('[data-role="hub-title"]')!;
    this.hubSubEl = this.element.querySelector('[data-role="hub-sub"]')!;
    this.shopBtnEl = this.element.querySelector('[data-action="wheel-shop"]')!;
    this.closeBtnEl = this.element.querySelector('[data-action="wheel-close"]')!;

    this.buildSvgWheelRing();
    this.buildSlotNodes();
    this.bindEvents();

    window.addEventListener('keydown', this.onKeyDownBound);
    this.unsubI18n = i18n.subscribe(() => {
      this.shopBtnEl.textContent = i18n.t('emoteWheel.shopBtn');
      this.closeBtnEl.setAttribute('aria-label', i18n.t('common.close'));
      if (this.isOpenState) {
        this.updateHubText(this.activeSlotIdx);
      }
    });
  }

  private buildSvgWheelRing(): void {
    const outerR = 178;
    const innerR = 66;
    const lines: string[] = [];
    for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
      const boundaryAngle = -Math.PI / 2 - Math.PI / 8 + i * (Math.PI / 4);
      const x1 = Math.cos(boundaryAngle) * innerR;
      const y1 = Math.sin(boundaryAngle) * innerR;
      const x2 = Math.cos(boundaryAngle) * outerR;
      const y2 = Math.sin(boundaryAngle) * outerR;
      lines.push(
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(148,163,184,0.28)" stroke-width="1.5" />`,
      );
    }

    this.ringSvgEl.innerHTML = `
      <circle cx="0" cy="0" r="${outerR}" fill="rgba(2, 6, 23, 0.78)" stroke="rgba(56, 189, 248, 0.35)" stroke-width="2" />
      <circle cx="0" cy="0" r="${outerR - 6}" fill="none" stroke="rgba(249, 115, 22, 0.22)" stroke-width="1" stroke-dasharray="6 6" />
      <circle cx="0" cy="0" r="${innerR}" fill="none" stroke="rgba(148, 163, 184, 0.35)" stroke-width="1.5" />
      ${lines.join('')}
    `;
  }

  private buildSlotNodes(): void {
    for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
      const angleRad = -Math.PI / 2 + i * (Math.PI / 4);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.wheelSlot = String(i);
      btn.className =
        'absolute -translate-x-1/2 -translate-y-1/2 w-[78px] h-[78px] sm:w-[84px] sm:h-[84px] rounded-full border-2 flex flex-col items-center justify-center gap-0.5 px-1.5 transition-transform duration-100 focus-visible:outline-2 focus-visible:outline-orange-400';

      btn.addEventListener('pointerenter', () => {
        if (!this.isOpenState) return;
        if (this.inMatchState && !this.slotButtons[i]?.emote) return;
        this.setHighlightedSlot(i);
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.inMatchState && !this.slotButtons[i]?.emote) return;
        this.triggerSlot(i);
      });

      this.wheelEl.appendChild(btn);
      this.slotButtons.push({ index: i, el: btn, emote: null, angleRad });
    }
    this.layoutSlotPositions();
  }

  private layoutSlotPositions(): void {
    const pad = this.slotSizePx + 14;
    const stageSize = this.radiusPx * 2 + pad;
    this.wheelEl.style.width = `${stageSize}px`;
    this.wheelEl.style.height = `${stageSize}px`;
    this.hubEl.style.width = `${this.hubSizePx}px`;
    this.hubEl.style.height = `${this.hubSizePx}px`;
    const cx = stageSize / 2;
    const cy = stageSize / 2;

    for (const entry of this.slotButtons) {
      const sx = cx + Math.cos(entry.angleRad) * this.radiusPx;
      const sy = cy + Math.sin(entry.angleRad) * this.radiusPx;
      entry.el.style.left = `${sx.toFixed(1)}px`;
      entry.el.style.top = `${sy.toFixed(1)}px`;
      entry.el.style.width = `${this.slotSizePx}px`;
      entry.el.style.height = `${this.slotSizePx}px`;
    }
  }

  private bindEvents(): void {
    this.shopBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.inMatchState) return;
      this.close(false);
      this.callbacks.onOpenEmoteShop();
    });

    this.closeBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close(true);
    });

    // Clicking outside the wheel closes it
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) {
        e.stopPropagation();
        this.openPointerId = null;
        this.close(true);
      } else {
        this.openPointerId = e.pointerId;
      }
    });

    // Touch/mouse directional tracking inside the wheel stage
    this.element.addEventListener('pointermove', (e) => {
      if (!this.isOpenState) return;
      if (e.pointerType === 'touch' || this.openPointerId === e.pointerId) {
        const idx = this.hitTestAngleSlot(e.clientX, e.clientY);
        const resolvedIdx =
          idx >= 0 && this.inMatchState && !this.slotButtons[idx]?.emote ? -1 : idx;
        this.setHighlightedSlot(resolvedIdx);
      }
    });

    this.element.addEventListener('pointerup', (e) => {
      if (!this.isOpenState) return;
      if (e.pointerType === 'touch' && this.openPointerId === e.pointerId) {
        const idx = this.hitTestAngleSlot(e.clientX, e.clientY);
        this.openPointerId = null;
        if (idx >= 0) {
          this.triggerSlot(idx);
        }
      } else {
        this.openPointerId = null;
      }
    });
  }

  private hitTestAngleSlot(clientX: number, clientY: number): number {
    const rect = this.wheelEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const minDist = Math.max(32, this.hubSizePx * 0.44);
    if (dist < minDist || dist > this.radiusPx + this.slotSizePx * 0.8) {
      return -1;
    }
    // Convert angle relative to top (-PI/2) clockwise in [0, 2PI)
    let angle = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / 8;
    while (angle < 0) angle += Math.PI * 2;
    while (angle >= Math.PI * 2) angle -= Math.PI * 2;
    const idx = Math.floor(angle / (Math.PI / 4)) % EMOTE_WHEEL_SLOT_COUNT;
    return idx;
  }

  private setHighlightedSlot(idx: number): void {
    if (this.activeSlotIdx === idx) return;
    this.activeSlotIdx = idx;
    this.updateSlotVisuals();
    this.updateHubText(idx);
  }

  private triggerSlot(idx: number): void {
    if (!this.isOpenState) return;
    const entry = this.slotButtons[idx];
    if (!entry) return;
    if (!entry.emote) {
      if (this.inMatchState) {
        // Empty slots inside an active match stay completely inactive
        return;
      }
      // Empty slot in lobby: bring player to Emotes shop to fill it
      this.close(false);
      this.callbacks.onOpenEmoteShop();
      return;
    }
    const emoteId = entry.emote.id;
    this.close(false);
    this.callbacks.onSelectEmote(emoteId);
  }

  open(
    centerX: number,
    centerY: number,
    wheelIds: readonly (string | null)[],
    options?: { inMatch?: boolean },
  ): void {
    this.inMatchState = Boolean(options?.inMatch);
    this.shopBtnEl.classList.toggle('hidden', this.inMatchState);
    const vv = window.visualViewport;
    const vw = Math.round(vv?.width ?? window.innerWidth ?? 1280);
    const vh = Math.round(vv?.height ?? window.innerHeight ?? 720);
    const cs = getComputedStyle(document.documentElement);
    const safeTop = parseFloat(cs.getPropertyValue('--safe-top')) || 0;
    const safeRight = parseFloat(cs.getPropertyValue('--safe-right')) || 0;
    const safeBottom = parseFloat(cs.getPropertyValue('--safe-bottom')) || 0;
    const safeLeft = parseFloat(cs.getPropertyValue('--safe-left')) || 0;

    const usableW = Math.max(240, vw - safeLeft - safeRight - 16);
    const usableH = Math.max(240, vh - safeTop - safeBottom - 16);
    const minDim = Math.min(usableW, usableH);

    this.slotSizePx = minDim < 360 ? 54 : minDim < 440 ? 64 : minDim < 560 ? 74 : 84;
    this.hubSizePx = minDim < 360 ? 86 : minDim < 440 ? 98 : minDim < 560 ? 112 : 124;
    this.radiusPx = Math.max(
      68,
      Math.min(138, Math.floor((minDim - this.slotSizePx - 14) / 2)),
    );
    this.layoutSlotPositions();

    const halfStage = this.radiusPx + (this.slotSizePx + 14) / 2;
    this.centerX = Math.max(
      safeLeft + halfStage + 4,
      Math.min(vw - safeRight - halfStage - 4, centerX),
    );
    this.centerY = Math.max(
      safeTop + halfStage + 4,
      Math.min(vh - safeBottom - halfStage - 4, centerY),
    );

    this.wheelEl.style.left = `${Math.round(this.centerX - halfStage)}px`;
    this.wheelEl.style.top = `${Math.round(this.centerY - halfStage)}px`;

    for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
      const emote = getEmoteById(wheelIds[i]) ?? null;
      this.slotButtons[i].emote = emote;
    }

    this.activeSlotIdx = -1;
    this.isOpenState = true;
    this.updateSlotVisuals();
    this.updateHubText(-1);
    this.element.classList.remove('hidden');
  }

  close(notify = false): void {
    if (!this.isOpenState) return;
    this.isOpenState = false;
    this.openPointerId = null;
    this.activeSlotIdx = -1;
    this.element.classList.add('hidden');
    if (notify) {
      this.callbacks.onClose();
    }
  }

  isOpen(): boolean {
    return this.isOpenState;
  }

  private updateSlotVisuals(): void {
    for (const entry of this.slotButtons) {
      const isActive = entry.index === this.activeSlotIdx;
      const emote = entry.emote;
      if (!emote) {
        delete entry.el.dataset.emoteId;
        if (this.inMatchState) {
          entry.el.setAttribute('aria-disabled', 'true');
          entry.el.tabIndex = -1;
          entry.el.className =
            'absolute -translate-x-1/2 -translate-y-1/2 w-[74px] h-[74px] sm:w-[82px] sm:h-[82px] rounded-full border-2 flex flex-col items-center justify-center gap-0.5 px-1.5 cursor-default opacity-50 bg-slate-950/75 border-slate-800/80 text-slate-600';
        } else {
          entry.el.removeAttribute('aria-disabled');
          entry.el.tabIndex = 0;
          entry.el.className = `absolute -translate-x-1/2 -translate-y-1/2 w-[74px] h-[74px] sm:w-[82px] sm:h-[82px] rounded-full border-2 flex flex-col items-center justify-center gap-0.5 px-1.5 transition-transform duration-100 cursor-pointer ${
            isActive
              ? 'scale-105 bg-slate-900/95 border-slate-400 text-slate-200'
              : 'bg-slate-950/85 border-slate-700/80 text-slate-500 hover:border-slate-500'
          }`;
        }
        entry.el.style.boxShadow = '';
        entry.el.innerHTML = `
          <span class="text-[10px] font-black text-slate-500 tabular-nums">${entry.index + 1}</span>
          <span class="text-[9px] font-bold uppercase tracking-wider text-slate-500">${i18n.t('emoteWheel.empty')}</span>
        `;
        continue;
      }

      entry.el.removeAttribute('aria-disabled');
      entry.el.tabIndex = 0;
      entry.el.dataset.emoteId = emote.id;
      const loc = i18n.translateShopItem(emote.shopItemId, emote.name, emote.description);
      entry.el.className = `absolute -translate-x-1/2 -translate-y-1/2 w-[78px] h-[78px] sm:w-[86px] sm:h-[86px] rounded-full border-2 flex flex-col items-center justify-center gap-0.5 px-1.5 transition-transform duration-100 cursor-pointer shadow-lg ${
        isActive
          ? 'scale-110 bg-slate-900 border-orange-400 text-white'
          : 'bg-slate-950/92 border-slate-600/90 hover:border-sky-400 text-slate-100'
      }`;
      entry.el.style.boxShadow = isActive ? `0 0 18px ${emote.accentHex}55` : '';
      entry.el.innerHTML = `
        <span class="absolute -top-1.5 px-1.5 py-0.2 rounded-full bg-slate-900 border border-slate-700 text-[9px] font-black text-slate-300 tabular-nums">${entry.index + 1}</span>
        <span class="w-6 h-6 sm:w-8 sm:h-8 shrink-0">${getEmoteSvg(emote.iconKind, emote.accentHex)}</span>
        <span class="text-[9px] sm:text-[10px] font-extrabold leading-tight truncate max-w-[90%]">${loc.name}</span>
      `;
    }
  }

  private updateHubText(slotIdx: number): void {
    const entry = slotIdx >= 0 ? this.slotButtons[slotIdx] : undefined;
    if (!entry || (this.inMatchState && !entry.emote)) {
      this.hubTitleEl.textContent = i18n.t('emoteWheel.title');
      this.hubSubEl.textContent = i18n.t('emoteWheel.hint');
      return;
    }
    if (!entry.emote) {
      this.hubTitleEl.textContent = i18n.t('emoteWheel.slotEmpty', { slot: slotIdx + 1 });
      this.hubSubEl.textContent = i18n.t('emoteWheel.tapToEquip');
      return;
    }
    const loc = i18n.translateShopItem(
      entry.emote.shopItemId,
      entry.emote.name,
      entry.emote.description,
    );
    this.hubTitleEl.textContent = loc.name;
    this.hubSubEl.textContent = i18n.t(
      getEmoteStyleLabelKey(entry.emote.style) as Parameters<typeof i18n.t>[0],
    );
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    this.unsubI18n?.();
    this.unsubI18n = null;
  }
}
