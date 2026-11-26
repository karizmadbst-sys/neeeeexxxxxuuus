import type { OrientationMode, Subsystem, ViewportMetrics } from '../../core/Types';
import { ActionButton, MOBILE_ACTION_DEFINITIONS } from '../../input/ActionButton';
import {
  CONTROL_SLOT_LABELS,
  type ControlSettings,
  type ControlSlotId,
  type HudStatusSlotId,
  type OrientationControlLayout,
} from '../../input/ControlSettings';
import { VirtualJoystick } from '../../input/VirtualJoystick';
import { i18n } from '../../i18n/I18nManager';
import { clamp } from '../../utils/MathUtils';
import { HudSlotWidget } from '../HudSlotWidget';

export interface ControlLayoutEditorCallbacks {
  onClose: () => void;
}

const HUD_STATUS_SLOT_IDS: readonly HudStatusSlotId[] = [
  'medkit',
  'special',
];

export class ControlLayoutEditor implements Subsystem {
  readonly element: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly orientationBadgeEl: HTMLElement;
  private readonly editStatusBadgeEl: HTMLElement;
  private readonly selectedNameEl: HTMLElement;
  private readonly scaleSlider: HTMLInputElement;
  private readonly scaleLabel: HTMLElement;
  private readonly opacitySlider: HTMLInputElement;
  private readonly opacityLabel: HTMLElement;
  private readonly visibleToggle: HTMLInputElement;
  private readonly inspectorDockEl: HTMLElement;
  private readonly inspectorBodyEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly resetModalEl: HTMLElement;
  private readonly editBtnEl: HTMLButtonElement;

  private readonly joystick = new VirtualJoystick();
  private readonly buttons = new Map<Exclude<ControlSlotId, 'joystick' | HudStatusSlotId>, ActionButton>();
  private readonly statusWidgets = new Map<HudStatusSlotId, HudSlotWidget>();
  private readonly slotEls = new Map<ControlSlotId, HTMLElement>();

  private currentOrientation: OrientationMode;
  private latestMetrics: ViewportMetrics;
  private selectedId: ControlSlotId = 'joystick';
  private editMode = true;
  private dockAtBottom = true;
  private hasUnsavedChanges = false;
  private savedSnapshot: Record<OrientationMode, OrientationControlLayout>;
  private toastTimer = 0;

  private draggingId: ControlSlotId | null = null;
  private dragPointerId: number | null = null;
  private stageRect: DOMRect | null = null;
  private i18nUnsubscribe: (() => void) | null = null;

  private readonly onStagePointerDownBound = (e: PointerEvent) => {
    const controlEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-control-id]');
    if (!controlEl) return;

    const id = controlEl.dataset.controlId as ControlSlotId | undefined;
    if (!id) return;

    e.stopPropagation();
    if (!this.editMode) {
      this.showToast(i18n.t('editor.enableEditToast'), 'amber');
      return;
    }

    this.selectControl(id);
    this.draggingId = id;
    this.dragPointerId = e.pointerId;
    this.stageRect = this.stageEl.getBoundingClientRect();
    this.stageEl.setPointerCapture?.(e.pointerId);
  };

  private readonly onStagePointerMoveBound = (e: PointerEvent) => {
    if (!this.editMode || !this.draggingId || e.pointerId !== this.dragPointerId || !this.stageRect) {
      return;
    }

    const xPct = clamp(((e.clientX - this.stageRect.left) / this.stageRect.width) * 100, 4, 96);
    const yPct = clamp(((e.clientY - this.stageRect.top) / this.stageRect.height) * 100, 6, 94);

    this.controlSettings.updateSlot(this.currentOrientation, this.draggingId, {
      xPct: Math.round(xPct * 10) / 10,
      yPct: Math.round(yPct * 10) / 10,
    });
    this.markDirty();
    this.applySlotVisual(this.draggingId);
  };

  private readonly onStagePointerUpBound = (e: PointerEvent) => {
    if (e.pointerId === this.dragPointerId) {
      this.draggingId = null;
      this.dragPointerId = null;
      this.stageRect = null;
    }
  };

  constructor(
    private readonly controlSettings: ControlSettings,
    initialMetrics: ViewportMetrics,
    private readonly callbacks: ControlLayoutEditorCallbacks,
  ) {
    this.latestMetrics = initialMetrics;
    this.currentOrientation = initialMetrics.orientation;
    this.savedSnapshot = this.controlSettings.cloneLayouts();

    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-40 flex flex-col justify-between bg-[#070b14]/88 pointer-events-auto select-none';

    this.element.innerHTML = `
      <div data-role="stage" class="relative w-full h-full overflow-hidden touch-none">
        <div class="pointer-events-none absolute inset-0 border-2 border-dashed border-sky-400/20"></div>
        <div class="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px bg-sky-400/10"></div>
        <div class="pointer-events-none absolute top-1/2 left-0 right-0 h-px bg-sky-400/10"></div>
      </div>

      <header class="pointer-events-none absolute top-0 left-0 right-0 safe-pad flex flex-wrap items-center justify-between gap-1.5 z-20">
        <div class="pointer-events-auto nexus-panel px-2.5 py-1 rounded flex items-center gap-2">
          <span data-i18n="header-title" class="text-[11px] sm:text-xs font-black tracking-[0.14em] text-white uppercase">${i18n.t('editor.headerTitle')}</span>
          <span data-role="orientation" class="text-[10px] font-bold uppercase tracking-wider text-sky-400"></span>
          <span data-role="edit-status" class="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">${i18n.t('editor.state.editing')}</span>
        </div>

        <div class="pointer-events-auto flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-action="toggle-edit"
            class="nexus-btn-secondary px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase min-h-[34px] border-sky-400/60 text-sky-200"
          >
            ${i18n.t('editor.btn.editOn')}
          </button>
          <button
            type="button"
            data-action="save"
            class="nexus-btn-primary px-3 py-1 rounded text-[10px] sm:text-[11px] font-extrabold tracking-widest uppercase min-h-[34px]"
          >
            ${i18n.t('editor.btn.save')}
          </button>
          <button
            type="button"
            data-action="cancel"
            class="nexus-btn-secondary px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-bold tracking-wider uppercase min-h-[34px] text-amber-200"
          >
            ${i18n.t('editor.btn.cancel')}
          </button>
          <button
            type="button"
            data-action="reset"
            class="nexus-btn-secondary px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-bold tracking-wider uppercase min-h-[34px] text-rose-200"
          >
            ${i18n.t('editor.btn.reset')}
          </button>
          <button
            type="button"
            data-action="back"
            class="nexus-btn-secondary px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase min-h-[34px]"
          >
            ${i18n.t('editor.btn.back')}
          </button>
        </div>
      </header>

      <div data-role="toast" class="pointer-events-none hidden absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded border text-xs font-bold tracking-wider uppercase shadow-xl"></div>

      <div data-role="inspector-dock" class="pointer-events-none absolute left-1/2 -translate-x-1/2 w-[min(520px,92vw)] z-20" style="bottom: max(0.5rem, env(safe-area-inset-bottom, 0px));">
        <div class="pointer-events-auto nexus-panel px-3 py-2 rounded flex flex-col gap-1.5">
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-400 uppercase tracking-wider truncate"><span data-i18n="icon-label">${i18n.t('editor.inspector.icon')}</span>: <strong data-role="selected-name" class="text-orange-400"></strong></span>
            <div class="flex items-center gap-2 shrink-0">
              <label class="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input data-role="visible-toggle" type="checkbox" checked class="accent-emerald-400" />
                <span data-i18n="visible-label">${i18n.t('editor.inspector.visible')}</span>
              </label>
              <button
                type="button"
                data-action="flip-dock"
                class="nexus-btn-secondary px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
              >
                ${i18n.t('editor.inspector.movePanel')}
              </button>
            </div>
          </div>

          <div data-role="inspector-body" class="grid grid-cols-2 gap-2.5">
            <label class="flex flex-col gap-0.5 text-[11px]">
              <div class="flex justify-between text-slate-300">
                <span data-i18n="size-label">${i18n.t('editor.inspector.size')}</span>
                <span data-role="scale-label" class="tabular-nums text-sky-400 font-bold">1.00x</span>
              </div>
              <input data-role="scale-slider" type="range" min="60" max="165" value="100" class="w-full accent-orange-500" />
            </label>

            <label class="flex flex-col gap-0.5 text-[11px]">
              <div class="flex justify-between text-slate-300">
                <span data-i18n="opacity-label">${i18n.t('editor.inspector.opacity')}</span>
                <span data-role="opacity-label" class="tabular-nums text-sky-400 font-bold">85%</span>
              </div>
              <input data-role="opacity-slider" type="range" min="25" max="100" value="85" class="w-full accent-sky-400" />
            </label>
          </div>
        </div>
      </div>

      <div data-role="reset-confirm-modal" style="display: none" class="absolute inset-0 z-50 bg-[#050811]/82 items-center justify-center p-4">
        <div class="nexus-panel w-[min(380px,92vw)] rounded-lg p-5 flex flex-col gap-4 text-center">
          <div class="flex flex-col gap-1">
            <h3 data-i18n="reset-heading" class="text-sm font-black tracking-[0.16em] text-white uppercase">${i18n.t('editor.resetModalHeading')}</h3>
            <p data-i18n="reset-desc" class="text-xs text-slate-300">${i18n.t('editor.resetConfirm.desc')}</p>
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <button type="button" data-action="cancel-reset" class="nexus-btn-secondary py-2.5 rounded text-xs font-bold uppercase tracking-wider">
              ${i18n.t('editor.keepCurrentBtn')}
            </button>
            <button type="button" data-action="confirm-reset" class="nexus-btn-primary py-2.5 rounded text-xs font-extrabold uppercase tracking-wider">
              ${i18n.t('editor.confirmResetBtn')}
            </button>
          </div>
        </div>
      </div>
    `;

    this.stageEl = this.element.querySelector('[data-role="stage"]')!;
    this.orientationBadgeEl = this.element.querySelector('[data-role="orientation"]')!;
    this.editStatusBadgeEl = this.element.querySelector('[data-role="edit-status"]')!;
    this.selectedNameEl = this.element.querySelector('[data-role="selected-name"]')!;
    this.scaleSlider = this.element.querySelector('[data-role="scale-slider"]')!;
    this.scaleLabel = this.element.querySelector('[data-role="scale-label"]')!;
    this.opacitySlider = this.element.querySelector('[data-role="opacity-slider"]')!;
    this.opacityLabel = this.element.querySelector('[data-role="opacity-label"]')!;
    this.visibleToggle = this.element.querySelector('[data-role="visible-toggle"]')!;
    this.inspectorDockEl = this.element.querySelector('[data-role="inspector-dock"]')!;
    this.inspectorBodyEl = this.element.querySelector('[data-role="inspector-body"]')!;
    this.toastEl = this.element.querySelector('[data-role="toast"]')!;
    this.resetModalEl = this.element.querySelector('[data-role="reset-confirm-modal"]')!;
    this.editBtnEl = this.element.querySelector('[data-action="toggle-edit"]')!;

    this.stageEl.appendChild(this.joystick.element);
    this.slotEls.set('joystick', this.joystick.element);

    for (const def of MOBILE_ACTION_DEFINITIONS) {
      const btn = new ActionButton(def);
      this.buttons.set(def.id, btn);
      this.slotEls.set(def.id, btn.element);
      this.stageEl.appendChild(btn.element);
    }

    for (const statusId of HUD_STATUS_SLOT_IDS) {
      const widget = new HudSlotWidget(statusId, i18n.translateHudSlotLabel(statusId) || CONTROL_SLOT_LABELS[statusId]);
      widget.setSamplePreviewState();
      this.statusWidgets.set(statusId, widget);
      this.slotEls.set(statusId, widget.element);
      this.stageEl.appendChild(widget.element);
    }

    this.stageEl.addEventListener('pointerdown', this.onStagePointerDownBound);
    window.addEventListener('pointermove', this.onStagePointerMoveBound, { passive: true });
    window.addEventListener('pointerup', this.onStagePointerUpBound, { passive: true });
    window.addEventListener('pointercancel', this.onStagePointerUpBound, { passive: true });

    this.scaleSlider.addEventListener('input', () => {
      if (!this.editMode) return;
      const scale = Number(this.scaleSlider.value) / 100;
      this.controlSettings.updateSlot(this.currentOrientation, this.selectedId, { scale });
      this.markDirty();
      this.applySlotVisual(this.selectedId);
      this.scaleLabel.textContent = `${scale.toFixed(2)}x`;
    });

    this.opacitySlider.addEventListener('input', () => {
      if (!this.editMode) return;
      const opacity = Number(this.opacitySlider.value) / 100;
      this.controlSettings.updateSlot(this.currentOrientation, this.selectedId, { opacity });
      this.markDirty();
      this.applySlotVisual(this.selectedId);
      this.opacityLabel.textContent = `${Math.round(opacity * 100)}%`;
    });

    this.visibleToggle.addEventListener('change', () => {
      if (!this.editMode) {
        this.visibleToggle.checked =
          this.controlSettings.getLayout(this.currentOrientation)[this.selectedId]?.visible ?? true;
        return;
      }
      this.controlSettings.updateSlot(this.currentOrientation, this.selectedId, {
        visible: this.visibleToggle.checked,
      });
      this.markDirty();
      this.applySlotVisual(this.selectedId);
    });

    this.element.querySelector('[data-action="toggle-edit"]')!.addEventListener('click', () => {
      this.setEditMode(!this.editMode);
    });

    this.element.querySelector('[data-action="save"]')!.addEventListener('click', () => {
      this.controlSettings.commitLayout();
      this.savedSnapshot = this.controlSettings.cloneLayouts();
      this.hasUnsavedChanges = false;
      this.updateEditModeUI();
      this.showToast(i18n.t('editor.toast.savedMsg'), 'emerald');
    });

    this.element.querySelector('[data-action="cancel"]')!.addEventListener('click', () => {
      this.controlSettings.restoreLayoutsSnapshot(this.savedSnapshot, false);
      this.hasUnsavedChanges = false;
      this.syncAllVisuals();
      this.selectControl(this.selectedId);
      this.updateEditModeUI();
      this.showToast(i18n.t('editor.toast.discardedMsg'), 'amber');
    });

    this.element.querySelector('[data-action="reset"]')!.addEventListener('click', () => {
      this.resetModalEl.style.display = 'flex';
    });

    this.element.querySelector('[data-action="cancel-reset"]')!.addEventListener('click', () => {
      this.resetModalEl.style.display = 'none';
    });

    this.element.querySelector('[data-action="confirm-reset"]')!.addEventListener('click', () => {
      this.resetModalEl.style.display = 'none';
      this.controlSettings.resetLayout(this.currentOrientation);
      this.savedSnapshot = this.controlSettings.cloneLayouts();
      this.hasUnsavedChanges = false;
      this.syncAllVisuals();
      this.selectControl(this.selectedId);
      this.updateEditModeUI();
      this.showToast(i18n.t('editor.toast.resetMsg'), 'sky');
    });

    this.element.querySelector('[data-action="back"]')!.addEventListener('click', () => {
      if (this.hasUnsavedChanges) {
        this.controlSettings.restoreLayoutsSnapshot(this.savedSnapshot, false);
        this.hasUnsavedChanges = false;
      }
      this.resetModalEl.style.display = 'none';
      this.callbacks.onClose();
    });

    this.element.querySelector('[data-action="flip-dock"]')!.addEventListener('click', () => {
      this.dockAtBottom = !this.dockAtBottom;
      this.inspectorDockEl.style.bottom = this.dockAtBottom
        ? 'max(0.5rem, env(safe-area-inset-bottom, 0px))'
        : 'auto';
      this.inspectorDockEl.style.top = this.dockAtBottom
        ? 'auto'
        : 'max(3.5rem, calc(env(safe-area-inset-top, 0px) + 3rem))';
    });

    this.syncAllVisuals();
    this.selectControl('joystick');
    this.updateEditModeUI();

    this.i18nUnsubscribe = i18n.subscribe(() => {
      this.refreshLocale();
    });
  }

  refreshLocale(): void {
    const setText = (sel: string, txt: string) => {
      const el = this.element.querySelector<HTMLElement>(sel);
      if (el) el.textContent = txt;
    };
    setText('[data-i18n="header-title"]', i18n.t('editor.headerTitle'));
    setText('[data-action="save"]', i18n.t('editor.btn.save'));
    setText('[data-action="cancel"]', i18n.t('editor.btn.cancel'));
    setText('[data-action="reset"]', i18n.t('editor.btn.reset'));
    setText('[data-action="back"]', i18n.t('editor.btn.back'));
    setText('[data-i18n="icon-label"]', i18n.t('editor.inspector.icon'));
    setText('[data-i18n="visible-label"]', i18n.t('editor.inspector.visible'));
    setText('[data-action="flip-dock"]', i18n.t('editor.inspector.movePanel'));
    setText('[data-i18n="size-label"]', i18n.t('editor.inspector.size'));
    setText('[data-i18n="opacity-label"]', i18n.t('editor.inspector.opacity'));
    setText('[data-i18n="reset-heading"]', i18n.t('editor.resetModalHeading'));
    setText('[data-i18n="reset-desc"]', i18n.t('editor.resetConfirm.desc'));
    setText('[data-action="cancel-reset"]', i18n.t('editor.keepCurrentBtn'));
    setText('[data-action="confirm-reset"]', i18n.t('editor.confirmResetBtn'));

    for (const btn of this.buttons.values()) {
      btn.refreshLanguage(false);
    }
    for (const [statusId, widget] of this.statusWidgets.entries()) {
      widget.setTitle(i18n.translateHudSlotLabel(statusId));
      widget.refreshLocale();
    }

    this.syncAllVisuals();
    this.selectControl(this.selectedId);
    this.updateEditModeUI();
  }

  openEditor(): void {
    this.savedSnapshot = this.controlSettings.cloneLayouts();
    this.hasUnsavedChanges = false;
    this.resetModalEl.style.display = 'none';
    this.setEditMode(true);
    this.syncAllVisuals();
    this.selectControl(this.selectedId);
  }

  updateViewport(metrics: ViewportMetrics): void {
    this.latestMetrics = metrics;
    this.currentOrientation = metrics.orientation;
    this.syncAllVisuals();
    this.selectControl(this.selectedId);
  }

  syncAllVisuals(): void {
    this.orientationBadgeEl.textContent = i18n.t(
      this.currentOrientation === 'landscape'
        ? 'editor.orientation.landscape'
        : 'editor.orientation.portrait',
    );
    for (const id of this.slotEls.keys()) {
      this.applySlotVisual(id);
    }
  }

  private setEditMode(enabled: boolean): void {
    this.editMode = enabled;
    this.draggingId = null;
    this.dragPointerId = null;
    this.updateEditModeUI();
    this.syncAllVisuals();
    this.selectControl(this.selectedId);
  }

  private markDirty(): void {
    if (!this.hasUnsavedChanges) {
      this.hasUnsavedChanges = true;
      this.updateEditModeUI();
    }
  }

  private updateEditModeUI(): void {
    this.editBtnEl.textContent = this.editMode
      ? i18n.t('editor.btn.editOn')
      : i18n.t('editor.btn.editOff');
    if (this.editMode) {
      this.editStatusBadgeEl.textContent = this.hasUnsavedChanges
        ? i18n.t('editor.state.draft')
        : i18n.t('editor.state.editing');
      this.editStatusBadgeEl.className = this.hasUnsavedChanges
        ? 'text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/50'
        : 'text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40';
      this.inspectorBodyEl.style.opacity = '1';
      this.inspectorBodyEl.style.pointerEvents = 'auto';
    } else {
      this.editStatusBadgeEl.textContent = i18n.t('editor.state.locked');
      this.editStatusBadgeEl.className =
        'text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-200 border border-slate-400/40';
      this.inspectorBodyEl.style.opacity = '0.45';
      this.inspectorBodyEl.style.pointerEvents = 'none';
    }
    this.scaleSlider.disabled = !this.editMode;
    this.opacitySlider.disabled = !this.editMode;
    this.visibleToggle.disabled = !this.editMode;
  }

  private showToast(message: string, tone: 'emerald' | 'amber' | 'sky'): void {
    window.clearTimeout(this.toastTimer);
    const palette =
      tone === 'emerald'
        ? 'bg-emerald-950/95 border-emerald-400/60 text-emerald-200'
        : tone === 'amber'
          ? 'bg-amber-950/95 border-amber-400/60 text-amber-200'
          : 'bg-sky-950/95 border-sky-400/60 text-sky-200';
    this.toastEl.className = `pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded border text-xs font-bold tracking-wider uppercase shadow-xl ${palette}`;
    this.toastEl.textContent = message;
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 2200);
  }

  private applySlotVisual(id: ControlSlotId): void {
    const layout = this.controlSettings.getLayout(this.currentOrientation)[id];
    if (!layout) return;

    if (id === 'joystick') {
      this.joystick.applyLayout(layout, this.latestMetrics);
    } else if ((HUD_STATUS_SLOT_IDS as readonly string[]).includes(id)) {
      const widget = this.statusWidgets.get(id as HudStatusSlotId);
      if (widget) {
        widget.applyLayout(layout, this.latestMetrics);
        if (!layout.visible && this.editMode) {
          widget.element.style.display = 'flex';
          widget.element.style.opacity = '0.24';
        }
      }
    } else {
      const btn = this.buttons.get(id as Exclude<ControlSlotId, 'joystick' | HudStatusSlotId>);
      if (btn) {
        btn.applyLayout(layout, this.latestMetrics);
        if (!layout.visible && this.editMode) {
          btn.element.style.display = 'flex';
          btn.element.style.opacity = '0.24';
        }
      }
    }
  }

  private selectControl(id: ControlSlotId): void {
    this.selectedId = id;
    this.selectedNameEl.textContent = i18n.translateHudSlotLabel(id) || CONTROL_SLOT_LABELS[id];

    for (const [slotId, el] of this.slotEls) {
      el.style.outline = this.editMode && slotId === id ? '2px solid #f97316' : 'none';
      el.style.outlineOffset = '4px';
    }

    const slot = this.controlSettings.getLayout(this.currentOrientation)[id];
    if (slot) {
      this.scaleSlider.value = String(Math.round(slot.scale * 100));
      this.scaleLabel.textContent = `${slot.scale.toFixed(2)}x`;
      this.opacitySlider.value = String(Math.round(slot.opacity * 100));
      this.opacityLabel.textContent = `${Math.round(slot.opacity * 100)}%`;
      this.visibleToggle.checked = slot.visible;
    }
  }

  dispose(): void {
    this.i18nUnsubscribe?.();
    this.i18nUnsubscribe = null;
    window.clearTimeout(this.toastTimer);
    this.stageEl.removeEventListener('pointerdown', this.onStagePointerDownBound);
    window.removeEventListener('pointermove', this.onStagePointerMoveBound);
    window.removeEventListener('pointerup', this.onStagePointerUpBound);
    window.removeEventListener('pointercancel', this.onStagePointerUpBound);
    this.buttons.clear();
    this.statusWidgets.clear();
    this.slotEls.clear();
  }
}
