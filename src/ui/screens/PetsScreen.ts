import type { CharacterPreviewRenderer } from '../../characters/CharacterPreviewRenderer';
import { i18n } from '../../i18n/I18nManager';
import {
  getPetOption,
  R6_PETS,
  type R6Customization,
  type R6PetId,
} from '../../player/R6CustomizationData';
import { getPetCompanionSvg, getRotateSvg } from '../icons/GameIcons';

export interface PetsScreenCallbacks {
  onPreviewPet: (petId: R6PetId) => void;
  onEquipPet: (petId: R6PetId, petEnabled: boolean) => void;
  onToggleFollow: (petEnabled: boolean) => void;
  onTriggerReaction: () => void;
  onRotatePreview: (deltaYaw: number) => void;
  onSetPreviewYaw: (yaw: number) => void;
  onBack: () => void;
}

type MobilePane = 'grid' | 'detail';

export class PetsScreen {
  readonly element: HTMLElement;

  private equippedPetId: R6PetId;
  private previewPetId: R6PetId;
  private petEnabled: boolean;
  private mobilePane: MobilePane = 'grid';

  private readonly gridEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly rosterPanelEl: HTMLElement;
  private readonly followToggleBtn: HTMLButtonElement;
  private readonly followStateBadgeEl: HTMLElement;
  private readonly equippedBadgeEl: HTMLElement;
  private readonly mobileTabGridBtn: HTMLButtonElement;
  private readonly mobileTabDetailBtn: HTMLButtonElement;
  private readonly bayTitleEl: HTMLElement;
  private readonly backBtnEl: HTMLButtonElement;
  private readonly selectCompanionTitleEl: HTMLElement;
  private readonly unitsCountEl: HTMLElement;
  private readonly followMatchesTitleEl: HTMLElement;
  private readonly followSubDescEl: HTMLElement;
  private readonly rotLeftLabelEl: HTMLElement;
  private readonly rotLeftBtnEl: HTMLButtonElement;
  private readonly rotFrontBtnEl: HTMLButtonElement;
  private readonly rotThreeQuarterBtnEl: HTMLButtonElement;
  private readonly reactionBtnEl: HTMLButtonElement;
  private readonly rotRightLabelEl: HTMLElement;
  private readonly rotRightBtnEl: HTMLButtonElement;

  private readonly snapshotCancels: Array<() => void> = [];
  private unsubI18n: (() => void) | null = null;
  private hasOpened = false;
  private dirtyWhileHidden = false;

  constructor(
    initialCustomization: R6Customization,
    private readonly previewRenderer: CharacterPreviewRenderer,
    private readonly callbacks: PetsScreenCallbacks,
  ) {
    this.equippedPetId = initialCustomization.petId;
    this.previewPetId = initialCustomization.petId;
    this.petEnabled = initialCustomization.petEnabled;

    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-20 flex flex-col justify-between safe-pad pointer-events-none';

    this.element.innerHTML = `
      <header class="nr-studio-header flex flex-wrap items-center justify-between gap-2 w-full">
        <div class="pointer-events-auto nexus-panel px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-md flex items-center gap-2">
          <span class="w-5 h-5 text-amber-300 shrink-0">${getPetCompanionSvg()}</span>
          <div>
            <div data-role="bay-title" class="text-[11px] sm:text-xs font-black uppercase tracking-[0.18em] text-amber-300">${i18n.t('pets.bayTitle')}</div>
            <div data-role="equipped-pet-badge" class="text-[10px] sm:text-[11px] text-slate-300 tabular-nums"></div>
          </div>
        </div>

        <button
          type="button"
          data-action="back"
          class="pointer-events-auto nexus-btn-secondary px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-md text-[11px] sm:text-xs font-bold tracking-widest uppercase min-h-[36px] sm:min-h-[44px]"
        >
          ← ${i18n.t('pets.backToLobby')}
        </button>
      </header>

      <div class="w-full flex-1 min-h-0 flex flex-col justify-end min-[720px]:flex-row min-[720px]:items-end min-[720px]:justify-between gap-1.5 sm:gap-2.5 pt-1 sm:pt-2">
        <!-- Mobile Pane Switcher -->
        <div class="pointer-events-auto min-[720px]:hidden flex items-center gap-1.5 nexus-panel p-1 rounded-md shrink-0">
          <button
            type="button"
            data-mobile-pane="grid"
            class="flex-1 py-1.5 px-2 rounded text-[10px] font-extrabold tracking-wider uppercase min-h-[34px]"
          >${i18n.t('pets.petUnitsHeader')}</button>
          <button
            type="button"
            data-mobile-pane="detail"
            class="flex-1 py-1.5 px-2 rounded text-[10px] font-extrabold tracking-wider uppercase min-h-[34px]"
          >${i18n.t('pets.infoEquipTab')}</button>
        </div>

        <!-- Left Visual Pet Grid + Gameplay Follow Toggle -->
        <section
          data-role="pet-grid-panel"
          class="pointer-events-auto nexus-panel w-full min-[720px]:w-[228px] lg:w-[320px] xl:w-[376px] max-h-[54dvh] min-[720px]:max-h-[calc(100dvh-4.25rem)] lg:max-h-[76dvh] rounded-md flex flex-col overflow-hidden shrink-0"
        >
          <div class="px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <span data-role="select-companion-title" class="text-[10px] font-black uppercase tracking-[0.16em] text-sky-400">${i18n.t('pets.selectCompanion')}</span>
            <span data-role="units-count" class="text-[10px] text-slate-400">${i18n.t('pets.unitsCount', { count: R6_PETS.length })}</span>
          </div>

          <div
            data-role="pet-grid"
            class="nexus-scroll overflow-y-auto p-2 grid grid-cols-4 min-[720px]:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2"
          ></div>

          <div class="p-2 sm:p-2.5 border-t border-slate-800 bg-slate-950/75 flex items-center justify-between gap-2 shrink-0">
            <div class="min-w-0">
              <div data-role="follow-matches-title" class="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-white">${i18n.t('pets.followMatches')}</div>
              <div data-role="follow-sub-desc" class="text-[9px] sm:text-[10px] text-slate-400 truncate">${i18n.t('pets.followSubDesc')}</div>
            </div>
            <button
              type="button"
              data-action="toggle-follow"
              class="px-3 py-1 rounded border text-[10px] sm:text-[11px] font-black tracking-wider uppercase min-h-[32px] sm:min-h-[36px] shrink-0 transition-colors"
            >
              <span data-role="follow-state-badge">${i18n.t('common.on')}</span>
            </button>
          </div>
        </section>

        <!-- Center Bottom 3D Inspection & Reaction Bar -->
        <div class="pointer-events-auto self-center flex flex-wrap items-center justify-center gap-1 nexus-panel px-1.5 py-1 rounded-md border border-amber-400/40 shrink min-[720px]:flex-1 min-[720px]:min-w-0 max-w-full order-first min-[720px]:order-none">
          <button
            type="button"
            data-preview="rot-left"
            class="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-black text-sky-300 flex items-center gap-1 min-h-[38px]"
            title="${i18n.t('menu.operator.rotateLeft')}"
          >
            <span class="w-3.5 h-3.5">${getRotateSvg('left')}</span>
            <span data-role="rot-left-label" class="hidden sm:inline">${i18n.t('chars.rot.left')}</span>
          </button>
          <button
            type="button"
            data-preview-angle="0"
            class="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-extrabold tracking-wider uppercase text-slate-200 min-h-[38px]"
          >${i18n.t('chars.rot.front')}</button>
          <button
            type="button"
            data-preview-angle="0.55"
            class="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-extrabold tracking-wider uppercase text-slate-200 min-h-[38px]"
          >${i18n.t('chars.rot.threeQuarter')}</button>
          <button
            type="button"
            data-action="pet-reaction"
            class="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/60 text-[10px] font-black tracking-wider uppercase text-amber-200 min-h-[38px]"
          >${i18n.t('pets.playReaction')}</button>
          <button
            type="button"
            data-preview="rot-right"
            class="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-black text-sky-300 flex items-center gap-1 min-h-[38px]"
            title="${i18n.t('menu.operator.rotateRight')}"
          >
            <span data-role="rot-right-label" class="hidden sm:inline">${i18n.t('chars.rot.right')}</span>
            <span class="w-3.5 h-3.5">${getRotateSvg('right')}</span>
          </button>
        </div>

        <!-- Right Inspected Pet Details & Equip Card -->
        <aside
          data-role="pet-detail"
          class="pointer-events-auto nexus-panel w-full min-[720px]:w-[238px] lg:w-[340px] xl:w-[392px] max-h-[54dvh] min-[720px]:max-h-[calc(100dvh-4.25rem)] lg:max-h-[76dvh] rounded-md p-2.5 sm:p-3 flex flex-col gap-2 shrink-0 overflow-hidden"
        ></aside>
      </div>
    `;

    this.gridEl = this.element.querySelector('[data-role="pet-grid"]')!;
    this.detailEl = this.element.querySelector('[data-role="pet-detail"]')!;
    this.rosterPanelEl = this.element.querySelector('[data-role="pet-grid-panel"]')!;
    this.followToggleBtn = this.element.querySelector('[data-action="toggle-follow"]')!;
    this.followStateBadgeEl = this.element.querySelector('[data-role="follow-state-badge"]')!;
    this.equippedBadgeEl = this.element.querySelector('[data-role="equipped-pet-badge"]')!;
    this.mobileTabGridBtn = this.element.querySelector('[data-mobile-pane="grid"]')!;
    this.mobileTabDetailBtn = this.element.querySelector('[data-mobile-pane="detail"]')!;
    this.bayTitleEl = this.element.querySelector('[data-role="bay-title"]')!;
    this.backBtnEl = this.element.querySelector('[data-action="back"]')!;
    this.selectCompanionTitleEl = this.element.querySelector('[data-role="select-companion-title"]')!;
    this.unitsCountEl = this.element.querySelector('[data-role="units-count"]')!;
    this.followMatchesTitleEl = this.element.querySelector('[data-role="follow-matches-title"]')!;
    this.followSubDescEl = this.element.querySelector('[data-role="follow-sub-desc"]')!;
    this.rotLeftBtnEl = this.element.querySelector('[data-preview="rot-left"]')!;
    this.rotLeftLabelEl = this.element.querySelector('[data-role="rot-left-label"]')!;
    this.rotFrontBtnEl = this.element.querySelector('[data-preview-angle="0"]')!;
    this.rotThreeQuarterBtnEl = this.element.querySelector('[data-preview-angle="0.55"]')!;
    this.reactionBtnEl = this.element.querySelector('[data-action="pet-reaction"]')!;
    this.rotRightBtnEl = this.element.querySelector('[data-preview="rot-right"]')!;
    this.rotRightLabelEl = this.element.querySelector('[data-role="rot-right-label"]')!;

    this.backBtnEl.addEventListener('click', () => {
      this.revertUnsavedPreview();
      this.callbacks.onBack();
    });

    this.followToggleBtn.addEventListener('click', () => {
      this.petEnabled = !this.petEnabled;
      this.syncFollowButton();
      this.refreshEquippedHeaderBadge();
      this.renderDetail();
      this.callbacks.onToggleFollow(this.petEnabled);
    });

    this.reactionBtnEl.addEventListener('click', () => {
      this.callbacks.onTriggerReaction();
    });

    this.rotLeftBtnEl.addEventListener('click', () => {
      this.callbacks.onRotatePreview(-Math.PI / 4);
    });
    this.rotRightBtnEl.addEventListener('click', () => {
      this.callbacks.onRotatePreview(Math.PI / 4);
    });
    this.element.querySelectorAll<HTMLButtonElement>('[data-preview-angle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const yaw = Number(btn.dataset.previewAngle ?? '0');
        this.callbacks.onSetPreviewYaw(yaw);
      });
    });

    this.mobileTabGridBtn.addEventListener('click', () => {
      this.mobilePane = 'grid';
      this.syncMobilePaneVisibility();
    });
    this.mobileTabDetailBtn.addEventListener('click', () => {
      this.mobilePane = 'detail';
      this.syncMobilePaneVisibility();
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocale();
    });

    this.syncMobilePaneVisibility();
  }

  private refreshLocale(): void {
    this.bayTitleEl.textContent = i18n.t('pets.bayTitle');
    this.backBtnEl.textContent = `← ${i18n.t('pets.backToLobby')}`;
    this.mobileTabGridBtn.textContent = i18n.t('pets.petUnitsHeader');
    this.mobileTabDetailBtn.textContent = i18n.t('pets.infoEquipTab');
    this.selectCompanionTitleEl.textContent = i18n.t('pets.selectCompanion');
    this.unitsCountEl.textContent = i18n.t('pets.unitsCount', { count: R6_PETS.length });
    this.followMatchesTitleEl.textContent = i18n.t('pets.followMatches');
    this.followSubDescEl.textContent = i18n.t('pets.followSubDesc');
    this.rotLeftBtnEl.title = i18n.t('menu.operator.rotateLeft');
    this.rotLeftLabelEl.textContent = i18n.t('chars.rot.left');
    this.rotFrontBtnEl.textContent = i18n.t('chars.rot.front');
    this.rotThreeQuarterBtnEl.textContent = i18n.t('chars.rot.threeQuarter');
    this.reactionBtnEl.textContent = i18n.t('pets.playReaction');
    this.rotRightBtnEl.title = i18n.t('menu.operator.rotateRight');
    this.rotRightLabelEl.textContent = i18n.t('chars.rot.right');
    this.refreshAll();
  }

  openScreen(customization: R6Customization): void {
    this.hasOpened = true;
    this.equippedPetId = customization.petId;
    this.previewPetId = customization.petId;
    this.petEnabled = customization.petEnabled;
    this.mobilePane = 'grid';
    this.syncMobilePaneVisibility();
    this.callbacks.onPreviewPet(this.previewPetId);
    if (this.element.style.display === 'none') {
      this.dirtyWhileHidden = true;
    } else {
      this.dirtyWhileHidden = false;
      this.refreshAll(true);
    }
  }

  ensureOpened(customization: R6Customization): void {
    if (!this.hasOpened) {
      this.openScreen(customization);
    }
    if (this.dirtyWhileHidden || !this.gridEl.hasChildNodes()) {
      this.dirtyWhileHidden = false;
      this.refreshAll(true);
    }
  }

  setCustomization(customization: R6Customization): void {
    this.equippedPetId = customization.petId;
    this.previewPetId = customization.petId;
    this.petEnabled = customization.petEnabled;
    this.refreshAll();
  }

  revertUnsavedPreview(): void {
    if (this.previewPetId !== this.equippedPetId) {
      this.previewPetId = this.equippedPetId;
      this.callbacks.onPreviewPet(this.equippedPetId);
    }
  }

  private refreshEquippedHeaderBadge(): void {
    const eq = getPetOption(this.equippedPetId);
    const petInfo = i18n.translatePet(eq.id);
    this.equippedBadgeEl.textContent =
      eq.id === 'none'
        ? i18n.t('pets.activeSolo')
        : i18n.t('pets.equippedStatus', {
            name: petInfo.name.toUpperCase(),
            state: this.petEnabled ? i18n.t('common.on') : i18n.t('common.off'),
          });
  }

  refreshAll(force = false): void {
    if (!force && (!this.hasOpened || this.element.style.display === 'none')) {
      this.dirtyWhileHidden = true;
      return;
    }
    this.dirtyWhileHidden = false;
    this.refreshEquippedHeaderBadge();
    this.syncFollowButton();
    this.renderGrid();
    this.renderDetail();
  }

  private syncMobilePaneVisibility(): void {
    const showGrid = this.mobilePane === 'grid';
    this.rosterPanelEl.classList.toggle('hidden', !showGrid);
    this.rosterPanelEl.classList.add('min-[720px]:flex');
    this.detailEl.classList.toggle('hidden', showGrid);
    this.detailEl.classList.add('min-[720px]:flex');

    const activeCls =
      'flex-1 py-1.5 px-2 rounded text-[10px] font-extrabold tracking-wider uppercase min-h-[34px] bg-amber-500/25 border border-amber-400 text-amber-200';
    const inactiveCls =
      'flex-1 py-1.5 px-2 rounded text-[10px] font-bold tracking-wider uppercase min-h-[34px] bg-slate-900/90 border border-slate-700 text-slate-300';

    this.mobileTabGridBtn.className = showGrid ? activeCls : inactiveCls;
    this.mobileTabDetailBtn.className = !showGrid ? activeCls : inactiveCls;
  }

  private syncFollowButton(): void {
    this.followStateBadgeEl.textContent = this.petEnabled ? i18n.t('common.on') : i18n.t('common.off');
    this.followToggleBtn.className = this.petEnabled
      ? 'px-3.5 py-1.5 rounded border border-emerald-400/80 bg-emerald-500/20 text-emerald-200 text-[11px] font-black tracking-wider uppercase min-h-[36px] shrink-0 transition-colors'
      : 'px-3.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-300 text-[11px] font-black tracking-wider uppercase min-h-[36px] shrink-0 transition-colors';
  }

  private clearSnapshots(): void {
    for (const cancel of this.snapshotCancels) {
      cancel();
    }
    this.snapshotCancels.length = 0;
  }

  private renderGrid(): void {
    this.clearSnapshots();
    this.gridEl.innerHTML = '';

    for (const pet of R6_PETS) {
      const petLoc = i18n.translatePet(pet.id);
      const isPreview = pet.id === this.previewPetId;
      const isEquipped = pet.id === this.equippedPetId;

      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.petCard = pet.id;
      card.className = `rounded-md border text-left overflow-hidden flex flex-col transition-all ${
        isPreview
          ? 'bg-slate-800/95 border-orange-400 ring-1 ring-orange-400/60'
          : 'bg-slate-900/85 border-slate-700 hover:border-sky-400/70'
      }`;

      card.innerHTML = `
        <div class="relative w-full aspect-square bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
          <div data-pet-fallback="${pet.id}" class="w-7 h-7 opacity-25 pointer-events-none flex items-center justify-center text-amber-300">
            ${getPetCompanionSvg()}
          </div>
          <img
            data-pet-thumb="${pet.id}"
            src=""
            alt="${this.escapeHtml(petLoc.name)} 3D companion thumbnail"
            class="absolute inset-0 w-full h-full object-contain p-1 opacity-0 transition-opacity duration-200"
          />
          <span
            class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-sm border border-white/40"
            style="background-color: ${pet.swatchHex};"
          ></span>
          ${
            isEquipped
              ? `<span class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-400/70 text-[8px] font-black text-emerald-300 uppercase">${i18n.t('common.equipped')}</span>`
              : isPreview
                ? `<span class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-orange-950/90 border border-orange-400/70 text-[8px] font-black text-orange-300 uppercase">${i18n.t('chars.selected')}</span>`
                : ''
          }
        </div>
        <div class="p-1.5 flex flex-col gap-0.5">
          <div class="text-[11px] font-black text-white truncate">${this.escapeHtml(petLoc.name)}</div>
          <div class="text-[9px] text-slate-400 truncate">${this.escapeHtml(petLoc.traitBadge)}</div>
        </div>
      `;

      const thumbImg = card.querySelector<HTMLImageElement>(`[data-pet-thumb="${pet.id}"]`);
      const fallbackEl = card.querySelector<HTMLElement>(`[data-pet-fallback="${pet.id}"]`);
      if (thumbImg) {
        const cancel = this.previewRenderer.requestPetSnapshot(pet.id, (dataUrl) => {
          thumbImg.src = dataUrl;
          thumbImg.classList.remove('opacity-0');
          if (fallbackEl) {
            fallbackEl.classList.add('hidden');
          }
        });
        this.snapshotCancels.push(cancel);
      }

      card.addEventListener('click', () => {
        this.previewPetId = pet.id;
        this.callbacks.onPreviewPet(pet.id);
        this.callbacks.onTriggerReaction();
        this.renderGrid();
        this.renderDetail();
      });

      this.gridEl.appendChild(card);
    }
  }

  private renderDetail(): void {
    const pet = getPetOption(this.previewPetId);
    const petLoc = i18n.translatePet(pet.id);
    const isEquipped = pet.id === this.equippedPetId;

    this.detailEl.innerHTML = `
      <div class="nexus-scroll overflow-y-auto flex-1 flex flex-col gap-2.5 pr-0.5">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-lg font-black tracking-wider text-white uppercase truncate">${this.escapeHtml(petLoc.name)}</h2>
              <span class="px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-500/15 text-[9px] font-extrabold uppercase text-amber-200">${this.escapeHtml(petLoc.traitBadge)}</span>
            </div>
            <div class="text-[11px] font-bold uppercase tracking-widest mt-0.5 ${
              isEquipped ? 'text-emerald-400' : 'text-orange-300'
            }">
              ${this.escapeHtml(petLoc.role)} · ${isEquipped ? i18n.t('chars.selectedFighter') : i18n.t('chars.previewing')}
            </div>
          </div>
          <span class="w-5 h-5 rounded border border-white/30 shrink-0" style="background-color: ${pet.swatchHex};"></span>
        </div>

        <div class="bg-slate-950/80 border border-slate-800 rounded p-2.5 flex flex-col gap-1.5">
          <div class="text-[10px] font-extrabold tracking-widest uppercase text-sky-400">${i18n.t('pets.personalityHeading')}</div>
          <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(petLoc.personality)}</p>
        </div>

        <div class="bg-slate-950/80 border border-slate-800 rounded p-2.5 flex flex-col gap-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-extrabold tracking-widest uppercase text-orange-400">${i18n.t('pets.behaviorHeading')}</span>
            <span class="text-[10px] font-black uppercase ${
              pet.id === 'none'
                ? 'text-slate-400'
                : this.petEnabled
                  ? 'text-emerald-300'
                  : 'text-amber-300'
            }">
              ${pet.id === 'none' ? i18n.t('pets.soloModeBadge') : this.petEnabled ? i18n.t('pets.followActiveBadge') : i18n.t('pets.lobbyOnlyBadge')}
            </span>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(petLoc.behavior)}</p>
        </div>
      </div>

      <div class="flex gap-2 shrink-0">
        ${
          !isEquipped
            ? `<button
                type="button"
                data-action="revert-pet"
                class="nexus-btn-secondary px-3 py-2.5 rounded text-xs font-extrabold tracking-wider uppercase min-h-[44px]"
              >${i18n.t('pets.revertBtn')}</button>`
            : `<button
                type="button"
                data-action="detail-react"
                class="nexus-btn-secondary px-3 py-2.5 rounded text-xs font-extrabold tracking-wider uppercase min-h-[44px]"
              >${i18n.t('pets.reactBtn')}</button>`
        }
        <button
          type="button"
          data-action="equip-pet"
          ${isEquipped ? 'disabled' : ''}
          class="${
            isEquipped
              ? 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 cursor-default'
              : 'nexus-btn-primary'
          } flex-1 py-2.5 px-4 rounded text-xs font-black tracking-[0.16em] uppercase min-h-[44px]"
        >
          ${isEquipped ? i18n.t('pets.equippedBtn') : i18n.t('pets.equipBtn')}
        </button>
      </div>
    `;

    this.detailEl.querySelector('[data-action="revert-pet"]')?.addEventListener('click', () => {
      this.previewPetId = this.equippedPetId;
      this.callbacks.onPreviewPet(this.previewPetId);
      this.renderGrid();
      this.renderDetail();
    });

    this.detailEl.querySelector('[data-action="detail-react"]')?.addEventListener('click', () => {
      this.callbacks.onTriggerReaction();
    });

    this.detailEl.querySelector('[data-action="equip-pet"]')?.addEventListener('click', () => {
      if (this.previewPetId === this.equippedPetId) return;
      this.equippedPetId = this.previewPetId;
      this.callbacks.onEquipPet(this.equippedPetId, this.petEnabled);
      this.callbacks.onTriggerReaction();
      this.refreshAll();
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.clearSnapshots();
  }
}
