import type { CharacterDefinition, CharacterRarity } from '../../characters/CharacterData';
import type { CharacterManager } from '../../characters/CharacterManager';
import type { CharacterPreviewRenderer } from '../../characters/CharacterPreviewRenderer';
import { getR6CharacterPreset } from '../../characters/R6CharacterCatalog';
import { downloadR6CharacterGlb } from '../../characters/R6ModelBuilder';
import {
  clearCharacterCustomizationOverride,
  DEFAULT_R6_CUSTOMIZATION,
  getCustomizationOptionInfo,
  R6_ACCESSORIES,
  R6_ARMORS,
  R6_EYE_STYLES,
  R6_FACE_MARKS,
  R6_GLASSES,
  R6_HAIR_COLORS,
  R6_HAIR_STYLES,
  R6_HATS,
  R6_MASKS,
  R6_MOUTH_STYLES,
  R6_PANTS,
  R6_SHOES,
  R6_SKINS,
  R6_TOPS,
  resolveCharacterCustomization,
  saveCharacterCustomizationOverride,
  type R6Customization,
} from '../../player/R6CustomizationData';
import {
  getAutoSpinSvg,
  getCustomizeIconSvg,
  getExportGlbSvg,
  getGenderIconSvg,
  getOperatorIconSvg,
  getPetCompanionSvg,
  getRotateSvg,
} from '../icons/GameIcons';
import { i18n } from '../../i18n/I18nManager';
import type { TranslationKey } from '../../i18n/translations';

export interface CharacterSelectionUICallbacks {
  onPreviewCharacter: (character: CharacterDefinition) => void;
  onConfirmSelect: (character: CharacterDefinition) => void;
  onPreviewCustomization: (custom: R6Customization) => void;
  onUpdateCustomization: (custom: R6Customization, targetCharacterId?: string) => void;
  onOpenPets: () => void;
  onRotatePreview: (deltaYaw: number) => void;
  onSetPreviewYaw: (yaw: number) => void;
  onResetPreview: () => void;
  onToggleAutoSpin: () => boolean;
  onBack: () => void;
}

type RosterFilter = 'core8' | 'male' | 'female' | 'all' | 'unlocked';
type DetailTab = 'fighter' | 'customize';
type SkinCategory =
  | 'topId'
  | 'pantsId'
  | 'shoesId'
  | 'hairStyleId'
  | 'hairColorId'
  | 'eyesId'
  | 'mouthId'
  | 'faceMarkId'
  | 'hatId'
  | 'glassesId'
  | 'maskId'
  | 'skinId'
  | 'armorId'
  | 'accessoryId';
type MobilePane = 'roster' | 'detail';

const RARITY_COLORS: Record<CharacterRarity, string> = {
  Common: 'text-slate-300 border-slate-500/50 bg-slate-800/70',
  Uncommon: 'text-emerald-300 border-emerald-500/50 bg-emerald-950/60',
  Rare: 'text-sky-300 border-sky-400/50 bg-sky-950/60',
  Epic: 'text-purple-300 border-purple-400/50 bg-purple-950/60',
  Legendary: 'text-amber-300 border-amber-400/60 bg-amber-950/60',
  Mythic: 'text-orange-300 border-orange-400/70 bg-orange-950/70',
};

const SKIN_CATEGORIES: ReadonlyArray<{ id: SkinCategory; labelKey: TranslationKey }> = [
  { id: 'topId', labelKey: 'chars.cat.tops' },
  { id: 'pantsId', labelKey: 'chars.cat.pants' },
  { id: 'shoesId', labelKey: 'chars.cat.shoes' },
  { id: 'hairStyleId', labelKey: 'chars.cat.hairStyle' },
  { id: 'hairColorId', labelKey: 'chars.cat.hairColor' },
  { id: 'eyesId', labelKey: 'chars.cat.eyes' },
  { id: 'mouthId', labelKey: 'chars.cat.mouth' },
  { id: 'faceMarkId', labelKey: 'chars.cat.faceMark' },
  { id: 'hatId', labelKey: 'chars.cat.hat' },
  { id: 'glassesId', labelKey: 'chars.cat.glasses' },
  { id: 'maskId', labelKey: 'chars.cat.mask' },
  { id: 'skinId', labelKey: 'chars.cat.skin' },
  { id: 'armorId', labelKey: 'chars.cat.armor' },
  { id: 'accessoryId', labelKey: 'chars.cat.gear' },
];

export class CharacterSelectionUI {
  readonly element: HTMLElement;

  private inspectedCharacter: CharacterDefinition;
  private filter: RosterFilter = 'core8';
  private activeTab: DetailTab = 'fighter';
  private activeSkinCategory: SkinCategory = 'topId';
  private mobilePane: MobilePane = 'roster';
  private searchQuery = '';
  private equippedCustomization: R6Customization;
  private previewCustomization: R6Customization;
  private autoSpinActive = false;

  private readonly levelBadgeEl: HTMLElement;
  private readonly unlockedCountEl: HTMLElement;
  private readonly rosterPanelEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly filterBtnsContainer: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly autoSpinBtn: HTMLButtonElement;
  private readonly mobileTabRosterBtn: HTMLButtonElement;
  private readonly mobileTabDetailBtn: HTMLButtonElement;
  private readonly mobileTabSkinsBtn: HTMLButtonElement;

  private readonly snapshotCancels: Array<() => void> = [];
  private readonly skinSnapshotCancels: Array<() => void> = [];
  private readonly unsubscribeUnlock: () => void;
  private readonly unsubscribeSelect: () => void;
  private i18nUnsubscribe: (() => void) | null = null;
  private hasOpened = false;
  private dirtyWhileHidden = false;

  constructor(
    private readonly characterManager: CharacterManager,
    initialCustomization: R6Customization,
    private readonly previewRenderer: CharacterPreviewRenderer,
    private readonly callbacks: CharacterSelectionUICallbacks,
  ) {
    this.inspectedCharacter = this.characterManager.getSelectedCharacter();
    this.equippedCustomization = resolveCharacterCustomization(
      this.inspectedCharacter.id,
      getR6CharacterPreset(this.inspectedCharacter.model.humanModelId).appearance,
      initialCustomization,
    );
    this.previewCustomization = { ...this.equippedCustomization };

    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-20 flex flex-col justify-between safe-pad pointer-events-none';

    this.element.innerHTML = `
      <header class="nr-studio-header flex flex-wrap items-center justify-between gap-2 w-full">
        <div class="pointer-events-auto nexus-panel px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-md flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div>
            <div data-i18n="studio-title" class="text-[11px] sm:text-xs font-black uppercase tracking-[0.18em] text-sky-400">${i18n.t('chars.studioTitle')}</div>
            <div data-role="unlocked-count" class="text-[10px] sm:text-[11px] text-slate-300 tabular-nums"></div>
          </div>
          <span class="hidden sm:inline text-slate-700">|</span>
          <div data-role="level-badge" class="text-[11px] sm:text-xs font-extrabold tracking-wider text-orange-400 tabular-nums"></div>
        </div>

        <div class="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            data-action="open-pets"
            class="nexus-btn-secondary px-2.5 sm:px-3 py-1.5 sm:py-2.5 rounded-md text-[11px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 border-amber-400/45 text-amber-200 min-h-[36px] sm:min-h-[44px]"
          >
            <span class="w-4 h-4 shrink-0">${getPetCompanionSvg()}</span>
            <span data-i18n="pets-btn">${i18n.t('chars.petsBtn')}</span>
          </button>
          <button
            type="button"
            data-action="back"
            class="nexus-btn-secondary px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-md text-[11px] sm:text-xs font-bold tracking-widest uppercase min-h-[36px] sm:min-h-[44px]"
          >
            ← ${i18n.t('chars.backToLobby')}
          </button>
        </div>
      </header>

      <!-- Main Studio Area: Leaves center open on landscape >=720px & upper viewport open on compact screens -->
      <div class="w-full flex-1 min-h-0 flex flex-col justify-end min-[720px]:flex-row min-[720px]:items-end min-[720px]:justify-between gap-1.5 sm:gap-2.5 pt-1 sm:pt-2">
        <!-- Mobile Pane Switcher (Shown only on <720px widths) -->
        <div class="pointer-events-auto min-[720px]:hidden flex items-center gap-1.5 nexus-panel p-1 rounded-md shrink-0">
          <button
            type="button"
            data-mobile-pane="roster"
            class="flex-1 py-1.5 px-2 rounded text-[10px] font-extrabold tracking-wider uppercase min-h-[34px]"
          >${i18n.t('chars.mobTab.chars')}</button>
          <button
            type="button"
            data-mobile-pane="fighter"
            class="flex-1 py-1.5 px-2 rounded text-[10px] font-extrabold tracking-wider uppercase min-h-[34px]"
          >${i18n.t('chars.mobTab.info')}</button>
          <button
            type="button"
            data-mobile-pane="customize"
            class="flex-1 py-1.5 px-2 rounded text-[10px] font-extrabold tracking-wider uppercase min-h-[34px]"
          >${i18n.t('chars.mobTab.skins')}</button>
        </div>

        <!-- Left Roster Panel (3D Visual Character Cards) -->
        <section
          data-role="roster-panel"
          class="pointer-events-auto nexus-panel w-full min-[720px]:w-[228px] lg:w-[320px] xl:w-[374px] max-h-[54dvh] min-[720px]:max-h-[calc(100dvh-4.25rem)] lg:max-h-[76dvh] rounded-md flex flex-col overflow-hidden shrink-0"
        >
          <div class="p-2 sm:p-2.5 border-b border-slate-800 flex flex-col gap-1.5 sm:gap-2 shrink-0">
            <div class="flex items-center gap-2">
              <input
                type="search"
                data-role="search"
                placeholder="${this.escapeHtml(i18n.t('chars.searchPlaceholder'))}"
                class="flex-1 bg-slate-950/90 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 min-h-[34px]"
              />
            </div>
            <div data-role="filters" class="flex flex-wrap gap-1"></div>
          </div>
          <div data-role="grid" class="nexus-scroll overflow-y-auto p-1.5 sm:p-2 grid grid-cols-4 min-[720px]:grid-cols-2 lg:grid-cols-3 gap-1.5"></div>
        </section>

        <!-- Center Bottom 3D Rotation, Angle Presets & GLB Export Bar -->
        <div class="pointer-events-auto self-center flex flex-wrap items-center justify-center gap-1 nexus-panel px-1.5 py-1 rounded-md border border-sky-500/40 shrink min-[720px]:flex-1 min-[720px]:min-w-0 max-w-full order-first min-[720px]:order-none">
          <button
            type="button"
            data-preview="rot-left"
            class="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-black text-sky-300 flex items-center gap-1 min-h-[38px]"
            title="${i18n.t('menu.title.rotateLeft')}"
          >
            <span class="w-3.5 h-3.5">${getRotateSvg('left')}</span>
            <span data-i18n="rot-left" class="hidden sm:inline">${i18n.t('chars.rot.left')}</span>
          </button>
          <button
            type="button"
            data-preview-angle="0"
            class="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-extrabold tracking-wider uppercase text-slate-200 min-h-[38px]"
            title="${i18n.t('chars.rot.front')}"
          >${i18n.t('chars.rot.front')}</button>
          <button
            type="button"
            data-preview-angle="0.62"
            class="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-extrabold tracking-wider uppercase text-slate-200 min-h-[38px]"
            title="${i18n.t('chars.rot.threeQuarter')}"
          >${i18n.t('chars.rot.threeQuarter')}</button>
          <button
            type="button"
            data-preview-angle="3.14159"
            class="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-extrabold tracking-wider uppercase text-slate-200 min-h-[38px]"
            title="${i18n.t('chars.rot.back')}"
          >${i18n.t('chars.rot.back')}</button>
          <button
            type="button"
            data-preview="auto-spin"
            class="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-extrabold tracking-wider uppercase text-slate-300 flex items-center gap-1 min-h-[38px]"
          >
            <span class="w-3.5 h-3.5">${getAutoSpinSvg()}</span>
            <span data-i18n="rot-spin">${i18n.t('chars.rot.spin')}</span>
          </button>
          <button
            type="button"
            data-preview="reset"
            class="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold tracking-wider uppercase text-slate-300 min-h-[38px]"
          >${i18n.t('chars.rot.reset')}</button>
          <button
            type="button"
            data-preview="rot-right"
            class="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-black text-sky-300 flex items-center gap-1 min-h-[38px]"
            title="${i18n.t('menu.title.rotateRight')}"
          >
            <span data-i18n="rot-right" class="hidden sm:inline">${i18n.t('chars.rot.right')}</span>
            <span class="w-3.5 h-3.5">${getRotateSvg('right')}</span>
          </button>
          <button
            type="button"
            data-preview="export-glb"
            class="px-2.5 py-1.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/50 text-[10px] font-extrabold tracking-wider uppercase text-emerald-200 flex items-center gap-1 whitespace-nowrap min-h-[38px]"
            title="${i18n.t('chars.exportGlbTitle')}"
          >
            <span class="w-3.5 h-3.5">${getExportGlbSvg()}</span>
            <span data-i18n="export-glb">${i18n.t('chars.glbBadge')}</span>
          </button>
        </div>

        <!-- Right Inspected Character & 3D Skins Studio Card -->
        <aside
          data-role="detail"
          class="pointer-events-auto nexus-panel w-full min-[720px]:w-[238px] lg:w-[350px] xl:w-[404px] max-h-[54dvh] min-[720px]:max-h-[calc(100dvh-4.25rem)] lg:max-h-[78dvh] rounded-md p-2.5 sm:p-3 flex flex-col gap-2 shrink-0 overflow-hidden"
        ></aside>
      </div>
    `;

    this.levelBadgeEl = this.element.querySelector('[data-role="level-badge"]')!;
    this.unlockedCountEl = this.element.querySelector('[data-role="unlocked-count"]')!;
    this.rosterPanelEl = this.element.querySelector('[data-role="roster-panel"]')!;
    this.gridEl = this.element.querySelector('[data-role="grid"]')!;
    this.detailEl = this.element.querySelector('[data-role="detail"]')!;
    this.filterBtnsContainer = this.element.querySelector('[data-role="filters"]')!;
    this.searchInput = this.element.querySelector('[data-role="search"]')!;
    this.autoSpinBtn = this.element.querySelector('[data-preview="auto-spin"]')!;
    this.mobileTabRosterBtn = this.element.querySelector('[data-mobile-pane="roster"]')!;
    this.mobileTabDetailBtn = this.element.querySelector('[data-mobile-pane="fighter"]')!;
    this.mobileTabSkinsBtn = this.element.querySelector('[data-mobile-pane="customize"]')!;

    this.element.querySelector('[data-action="open-pets"]')?.addEventListener('click', () => {
      this.revertUnsavedPreviews();
      this.autoSpinActive = false;
      this.syncAutoSpinButton();
      this.callbacks.onOpenPets();
    });

    this.element.querySelector('[data-action="back"]')!.addEventListener('click', () => {
      this.revertUnsavedPreviews();
      this.autoSpinActive = false;
      this.syncAutoSpinButton();
      this.callbacks.onResetPreview();
      this.callbacks.onBack();
    });

    this.element.querySelector('[data-preview="rot-left"]')!.addEventListener('click', () => {
      this.callbacks.onRotatePreview(-Math.PI / 4);
    });
    this.element.querySelector('[data-preview="rot-right"]')!.addEventListener('click', () => {
      this.callbacks.onRotatePreview(Math.PI / 4);
    });
    this.element.querySelectorAll<HTMLButtonElement>('[data-preview-angle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const yaw = Number(btn.dataset.previewAngle ?? '0');
        this.autoSpinActive = false;
        this.syncAutoSpinButton();
        this.callbacks.onSetPreviewYaw(yaw);
      });
    });
    this.element.querySelector('[data-preview="reset"]')!.addEventListener('click', () => {
      this.autoSpinActive = false;
      this.syncAutoSpinButton();
      this.callbacks.onResetPreview();
    });
    this.autoSpinBtn.addEventListener('click', () => {
      this.autoSpinActive = this.callbacks.onToggleAutoSpin();
      this.syncAutoSpinButton();
    });
    this.element.querySelector('[data-preview="export-glb"]')?.addEventListener('click', () => {
      void downloadR6CharacterGlb(
        this.inspectedCharacter.model.humanModelId,
        this.previewCustomization,
      );
    });

    this.mobileTabRosterBtn.addEventListener('click', () => {
      this.mobilePane = 'roster';
      this.syncMobilePaneVisibility();
    });
    this.mobileTabDetailBtn.addEventListener('click', () => {
      this.mobilePane = 'detail';
      this.activeTab = 'fighter';
      this.syncMobilePaneVisibility();
      this.renderDetail();
    });
    this.mobileTabSkinsBtn.addEventListener('click', () => {
      this.mobilePane = 'detail';
      this.activeTab = 'customize';
      this.syncMobilePaneVisibility();
      this.renderDetail();
    });

    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase();
      this.renderGrid();
    });

    this.unsubscribeUnlock = this.characterManager.unlockSystem.onChange(() => {
      this.refreshAll();
    });
    this.unsubscribeSelect = this.characterManager.onSelect(() => {
      this.refreshAll();
    });

    this.syncMobilePaneVisibility();

    this.i18nUnsubscribe = i18n.subscribe(() => {
      this.refreshLocale();
    });
  }

  refreshLocale(): void {
    const setText = (sel: string, txt: string) => {
      const el = this.element.querySelector<HTMLElement>(sel);
      if (el) el.textContent = txt;
    };
    setText('[data-i18n="studio-title"]', i18n.t('chars.studioTitle'));
    setText('[data-i18n="pets-btn"]', i18n.t('chars.petsBtn'));
    setText('[data-action="back"]', `← ${i18n.t('chars.backToLobby')}`);
    this.mobileTabRosterBtn.textContent = i18n.t('chars.mobTab.chars');
    this.mobileTabDetailBtn.textContent = i18n.t('chars.mobTab.info');
    this.mobileTabSkinsBtn.textContent = i18n.t('chars.mobTab.skins');
    this.searchInput.placeholder = i18n.t('chars.searchPlaceholder');
    setText('[data-i18n="rot-left"]', i18n.t('chars.rot.left'));
    setText('[data-preview-angle="0"]', i18n.t('chars.rot.front'));
    setText('[data-preview-angle="0.62"]', i18n.t('chars.rot.threeQuarter'));
    setText('[data-preview-angle="3.14159"]', i18n.t('chars.rot.back'));
    setText('[data-i18n="rot-spin"]', i18n.t('chars.rot.spin'));
    setText('[data-preview="reset"]', i18n.t('chars.rot.reset'));
    setText('[data-i18n="rot-right"]', i18n.t('chars.rot.right'));
    setText('[data-i18n="export-glb"]', i18n.t('chars.glbBadge'));
    this.element.querySelector('[data-preview="export-glb"]')?.setAttribute('title', i18n.t('chars.exportGlbTitle'));
    this.refreshAll();
  }

  private getResolvedCustomizationFor(char: CharacterDefinition): R6Customization {
    const presetApp = getR6CharacterPreset(char.model.humanModelId).appearance;
    return resolveCharacterCustomization(char.id, presetApp, this.equippedCustomization);
  }

  openStudio(initialTab: DetailTab = 'fighter'): void {
    this.hasOpened = true;
    this.inspectedCharacter = this.characterManager.getSelectedCharacter();
    this.equippedCustomization = this.getResolvedCustomizationFor(this.inspectedCharacter);
    this.previewCustomization = { ...this.equippedCustomization };
    this.activeTab = initialTab;
    this.mobilePane = initialTab === 'customize' ? 'detail' : 'roster';
    this.callbacks.onPreviewCharacter(this.inspectedCharacter);
    this.callbacks.onPreviewCustomization(this.previewCustomization);
    this.syncMobilePaneVisibility();
    if (this.element.style.display === 'none') {
      this.dirtyWhileHidden = true;
    } else {
      this.dirtyWhileHidden = false;
      this.refreshAll(true);
    }
  }

  ensureOpened(): void {
    if (!this.hasOpened) {
      this.openStudio('fighter');
    }
    if (this.dirtyWhileHidden || !this.gridEl.hasChildNodes()) {
      this.dirtyWhileHidden = false;
      this.refreshAll(true);
    }
  }

  setTab(tab: DetailTab): void {
    this.activeTab = tab;
    if (tab === 'customize') {
      this.mobilePane = 'detail';
      this.syncMobilePaneVisibility();
    }
    this.renderDetail();
  }

  setCustomization(custom: R6Customization): void {
    const selectedId = this.characterManager.getSelectedCharacter().id;
    if (this.inspectedCharacter.id === selectedId) {
      this.equippedCustomization = { ...custom };
      this.previewCustomization = { ...custom };
    } else {
      this.equippedCustomization = {
        ...this.equippedCustomization,
        armorId: custom.armorId,
        accessoryId: custom.accessoryId,
        petId: custom.petId,
        petEnabled: custom.petEnabled,
      };
      this.previewCustomization = {
        ...this.previewCustomization,
        armorId: custom.armorId,
        accessoryId: custom.accessoryId,
        petId: custom.petId,
        petEnabled: custom.petEnabled,
      };
    }
    if (!this.hasOpened || this.element.style.display === 'none') {
      this.dirtyWhileHidden = true;
      return;
    }
    this.renderGrid();
    if (this.activeTab === 'customize') {
      this.renderDetail();
    }
  }

  revertUnsavedPreviews(): void {
    const equippedChar = this.characterManager.getSelectedCharacter();
    this.inspectedCharacter = equippedChar;
    this.equippedCustomization = this.getResolvedCustomizationFor(equippedChar);
    this.previewCustomization = { ...this.equippedCustomization };
    this.callbacks.onPreviewCharacter(equippedChar);
    this.callbacks.onPreviewCustomization({ ...this.equippedCustomization });
  }

  refreshAll(force = false): void {
    if (!force && (!this.hasOpened || this.element.style.display === 'none')) {
      this.dirtyWhileHidden = true;
      return;
    }
    this.dirtyWhileHidden = false;
    this.renderHeaderStats();
    this.renderFilters();
    this.renderGrid();
    this.renderDetail();
  }

  private syncMobilePaneVisibility(): void {
    const showRosterOnMobile = this.mobilePane === 'roster';
    this.rosterPanelEl.classList.toggle('hidden', !showRosterOnMobile);
    this.rosterPanelEl.classList.add('min-[720px]:flex');

    this.detailEl.classList.toggle('hidden', showRosterOnMobile);
    this.detailEl.classList.add('min-[720px]:flex');

    const activeCls =
      'flex-1 py-1.5 px-2 rounded text-[10px] font-extrabold tracking-wider uppercase min-h-[34px] bg-orange-500/25 border border-orange-400 text-orange-200';
    const inactiveCls =
      'flex-1 py-1.5 px-2 rounded text-[10px] font-bold tracking-wider uppercase min-h-[34px] bg-slate-900/90 border border-slate-700 text-slate-300';

    this.mobileTabRosterBtn.className = this.mobilePane === 'roster' ? activeCls : inactiveCls;
    this.mobileTabDetailBtn.className =
      this.mobilePane === 'detail' && this.activeTab === 'fighter' ? activeCls : inactiveCls;
    this.mobileTabSkinsBtn.className =
      this.mobilePane === 'detail' && this.activeTab === 'customize' ? activeCls : inactiveCls;
  }

  private syncAutoSpinButton(): void {
    this.autoSpinBtn.className = this.autoSpinActive
      ? 'px-2.5 py-1.5 rounded bg-sky-500/30 border border-sky-400 text-[11px] font-extrabold tracking-wider uppercase text-sky-200 flex items-center gap-1 min-h-[38px]'
      : 'px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-extrabold tracking-wider uppercase text-slate-300 flex items-center gap-1 min-h-[38px]';
  }

  private renderHeaderStats(): void {
    const level = this.characterManager.unlockSystem.getPlayerLevel();
    const all = this.characterManager.getAllCharacters();
    const unlockedCount = this.characterManager.unlockSystem.getUnlockedCharacters(all).length;

    this.levelBadgeEl.textContent = i18n.t('menu.lvlShort', { level });
    this.unlockedCountEl.textContent = i18n.t('chars.studioSub', {
      unlocked: unlockedCount,
      total: all.length,
    });
  }

  private renderFilters(): void {
    const opts: Array<{ id: RosterFilter; label: string }> = [
      { id: 'core8', label: i18n.t('chars.filter.core8') },
      { id: 'male', label: i18n.t('chars.gender.male') },
      { id: 'female', label: i18n.t('chars.gender.female') },
      { id: 'unlocked', label: i18n.t('common.unlocked') },
    ];

    this.filterBtnsContainer.innerHTML = '';
    for (const opt of opts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = opt.id === this.filter;
      btn.className = `${
        active ? 'nexus-btn-primary' : 'nexus-btn-secondary'
      } flex-1 py-1.5 px-1.5 rounded text-[10px] font-bold tracking-wider uppercase whitespace-nowrap min-h-[34px]`;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        this.filter = opt.id;
        this.renderFilters();
        this.renderGrid();
      });
      this.filterBtnsContainer.appendChild(btn);
    }
  }

  private clearRosterSnapshotCancels(): void {
    for (const cancel of this.snapshotCancels) {
      cancel();
    }
    this.snapshotCancels.length = 0;
  }

  private clearSkinSnapshotCancels(): void {
    for (const cancel of this.skinSnapshotCancels) {
      cancel();
    }
    this.skinSnapshotCancels.length = 0;
  }

  private renderGrid(): void {
    this.clearRosterSnapshotCancels();

    const all = this.characterManager.getAllCharacters();
    const equippedId = this.characterManager.getSelectedCharacter().id;

    const filtered = all.filter((char, index) => {
      const unlocked = this.characterManager.isUnlocked(char);
      if (this.filter === 'core8' && index >= 8) return false;
      if (this.filter === 'male' && char.gender !== 'male') return false;
      if (this.filter === 'female' && char.gender !== 'female') return false;
      if (this.filter === 'unlocked' && !unlocked) return false;
      if (this.searchQuery) {
        const lName = i18n.translateCharacterName(char.id, char.name).toLowerCase();
        const lRole = i18n.translateCharacterRole(char.role).toLowerCase();
        const lRarity = i18n.translateRarity(char.rarity).toLowerCase();
        if (
          !char.name.toLowerCase().includes(this.searchQuery) &&
          !char.role.toLowerCase().includes(this.searchQuery) &&
          !char.rarity.toLowerCase().includes(this.searchQuery) &&
          !lName.includes(this.searchQuery) &&
          !lRole.includes(this.searchQuery) &&
          !lRarity.includes(this.searchQuery)
        ) {
          return false;
        }
      }
      return true;
    });

    this.gridEl.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'col-span-full py-6 text-center text-xs text-slate-400';
      empty.textContent = i18n.t('chars.filterNoMatch');
      this.gridEl.appendChild(empty);
      return;
    }

    for (const char of filtered) {
      const unlocked = this.characterManager.isUnlocked(char);
      const isInspected = char.id === this.inspectedCharacter.id;
      const isEquipped = char.id === equippedId;
      const charName = i18n.translateCharacterName(char.id, char.name);
      const charRarity = i18n.translateRarity(char.rarity);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `rounded-md text-left border transition-all flex flex-col overflow-hidden ${
        isInspected
          ? 'bg-slate-800/95 border-orange-400 ring-1 ring-orange-400/50'
          : unlocked
            ? 'bg-slate-900/85 border-slate-700 hover:border-sky-400/70'
            : 'bg-slate-950/90 border-slate-800/90 opacity-85 hover:border-slate-600'
      }`;

      const cardCustom: R6Customization = isInspected
        ? this.previewCustomization
        : this.getResolvedCustomizationFor(char);

      card.innerHTML = `
        <div class="relative w-full aspect-square bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
          <div data-char-fallback class="w-7 h-7 opacity-25 pointer-events-none flex items-center justify-center text-sky-300">
            ${getOperatorIconSvg()}
          </div>
          <img
            data-char-thumb="${char.id}"
            src=""
            alt="${this.escapeHtml(charName)}"
            class="absolute inset-0 w-full h-full object-contain opacity-0 transition-opacity duration-200"
          />
          <span class="absolute top-1 left-1 px-1 py-0.5 rounded border text-[8px] font-extrabold uppercase ${RARITY_COLORS[char.rarity]}">
            ${this.escapeHtml(charRarity.slice(0, 6))}
          </span>
          <span class="absolute top-1 right-1 w-3.5 h-3.5 rounded bg-slate-950/80 border border-slate-700/70 flex items-center justify-center ${
            char.gender === 'female' ? 'text-rose-300' : 'text-sky-300'
          }">
            ${getGenderIconSvg(char.gender)}
          </span>
          ${
            !unlocked
              ? `<span class="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-slate-950/90 border border-amber-500/50 text-[8px] font-black text-amber-300 tabular-nums">
                  ${i18n.t('hud.levelShort', { level: char.unlockLevel })}
                </span>`
              : isEquipped
                ? `<span class="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-emerald-950/90 border border-emerald-400/70 text-[8px] font-black text-emerald-300">
                    ${i18n.t('common.equipped')}
                  </span>`
                : isInspected
                  ? `<span class="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-orange-950/90 border border-orange-400/70 text-[8px] font-black text-orange-300">
                      ${i18n.t('chars.selected')}
                    </span>`
                  : ''
          }
        </div>

        <div class="px-1.5 py-1 flex items-center justify-between gap-1">
          <span class="text-[10px] font-black tracking-wide text-white truncate">${this.escapeHtml(charName)}</span>
          <span class="w-2 h-2 rounded-sm border border-white/25 shrink-0" style="background-color: ${char.model.primaryColorHex};"></span>
        </div>
      `;

      const thumbImg = card.querySelector<HTMLImageElement>(`[data-char-thumb="${char.id}"]`);
      const fallbackEl = card.querySelector<HTMLElement>('[data-char-fallback]');
      if (thumbImg) {
        const cancel = this.previewRenderer.requestCharacterSnapshot(
          char,
          cardCustom,
          'full',
          (dataUrl) => {
            thumbImg.src = dataUrl;
            thumbImg.classList.remove('opacity-0');
            if (fallbackEl) {
              fallbackEl.classList.add('hidden');
            }
          },
        );
        this.snapshotCancels.push(cancel);
      }

      card.addEventListener('click', () => {
        // Always preview on card click so players can inspect before equipping!
        this.inspectedCharacter = char;
        this.equippedCustomization = this.getResolvedCustomizationFor(char);
        this.previewCustomization = { ...this.equippedCustomization };
        this.callbacks.onPreviewCharacter(char);
        this.callbacks.onPreviewCustomization({ ...this.previewCustomization });
        this.renderGrid();
        this.renderDetail();
      });

      this.gridEl.appendChild(card);
    }
  }

  private hasCustomizationChanges(): boolean {
    const a = this.equippedCustomization;
    const b = this.previewCustomization;
    return (
      a.skinId !== b.skinId ||
      a.eyesId !== b.eyesId ||
      a.mouthId !== b.mouthId ||
      a.faceMarkId !== b.faceMarkId ||
      a.hairStyleId !== b.hairStyleId ||
      a.hairColorId !== b.hairColorId ||
      a.topId !== b.topId ||
      a.pantsId !== b.pantsId ||
      a.shoesId !== b.shoesId ||
      a.hatId !== b.hatId ||
      a.glassesId !== b.glassesId ||
      a.maskId !== b.maskId ||
      a.armorId !== b.armorId ||
      a.accessoryId !== b.accessoryId ||
      a.petId !== b.petId
    );
  }

  private renderDetail(): void {
    this.clearSkinSnapshotCancels();

    const c = this.inspectedCharacter;
    const unlocked = this.characterManager.isUnlocked(c);
    const isEquippedChar = this.characterManager.getSelectedCharacter().id === c.id;
    const charName = i18n.translateCharacterName(c.id, c.name);
    const charRole = i18n.translateCharacterRole(c.role);
    const charDesc = i18n.translateCharacterDesc(c.id, c.description);
    const charRarity = i18n.translateRarity(c.rarity);

    const tabsHtml = `
      <div class="flex gap-1.5 bg-slate-950/90 p-1 rounded border border-slate-800 shrink-0">
        <button
          type="button"
          data-tab="fighter"
          class="${
            this.activeTab === 'fighter'
              ? 'bg-sky-500/25 border-sky-400 text-sky-200'
              : 'border-transparent text-slate-400 hover:text-white'
          } flex-1 py-2 px-2 rounded border text-[11px] font-extrabold tracking-wider uppercase min-h-[38px]"
        >${i18n.t('chars.detailTab.info')}</button>
        <button
          type="button"
          data-tab="customize"
          class="${
            this.activeTab === 'customize'
              ? 'bg-orange-500/25 border-orange-400 text-orange-200'
              : 'border-transparent text-slate-400 hover:text-white'
          } flex-1 py-2 px-2 rounded border text-[11px] font-extrabold tracking-wider uppercase min-h-[38px]"
        >${i18n.t('chars.detailTab.skins')}</button>
      </div>
    `;

    if (this.activeTab === 'fighter') {
      const activeDef = this.characterManager.abilityManager.getAbility(c.ability);
      const passiveDef = this.characterManager.abilityManager.getAbility(c.passiveAbility);
      const activeName = i18n.translateAbilityName(c.ability, activeDef?.name ?? c.ability);
      const activeDesc = i18n.translateAbilityDesc(c.ability, activeDef?.description ?? '');
      const passiveName = i18n.translateAbilityName(c.passiveAbility, passiveDef?.name ?? c.passiveAbility);
      const passiveDesc = i18n.translateAbilityDesc(c.passiveAbility, passiveDef?.description ?? '');

      const hpPct = Math.min(100, Math.round((c.maxHealth / 150) * 100));
      const shieldPct = Math.min(100, Math.round((c.shield / 100) * 100));
      const spdPct = Math.min(100, Math.round((c.movementSpeed / 6.5) * 100));

      this.detailEl.innerHTML = `
        ${tabsHtml}
        <div class="nexus-scroll overflow-y-auto flex-1 flex flex-col gap-2.5 pr-0.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="w-4 h-4 shrink-0 ${c.gender === 'female' ? 'text-rose-300' : 'text-sky-300'}">${getGenderIconSvg(c.gender)}</span>
                <h2 class="text-lg font-black tracking-wider text-white truncate">${this.escapeHtml(charName)}</h2>
                <span class="px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase ${RARITY_COLORS[c.rarity]}">${this.escapeHtml(charRarity)}</span>
              </div>
              <div class="text-[11px] font-semibold uppercase tracking-widest mt-0.5 ${
                isEquippedChar
                  ? 'text-emerald-400'
                  : unlocked
                    ? 'text-sky-400'
                    : 'text-amber-400'
              } tabular-nums">
                ${this.escapeHtml(charRole)} · ${
                  isEquippedChar
                    ? i18n.t('chars.selectedFighter')
                    : unlocked
                      ? i18n.t('chars.previewReadyEquip')
                      : i18n.t('chars.lockedReachLvl', { level: c.unlockLevel })
                }
              </div>
            </div>
            <span class="w-5 h-5 rounded border border-white/30 shrink-0" style="background-color: ${c.model.primaryColorHex};"></span>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(charDesc)}</p>

          <div class="bg-slate-950/75 p-2.5 rounded border border-slate-800 flex flex-col gap-2 tabular-nums">
            <div>
              <div class="flex justify-between text-[10px] font-bold uppercase">
                <span class="text-slate-400">${i18n.t('chars.maxHealthLabel')}</span>
                <span class="text-emerald-400">${c.maxHealth} ${i18n.t('common.hp')}</span>
              </div>
              <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-emerald-400" style="width:${hpPct}%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-[10px] font-bold uppercase">
                <span class="text-slate-400">${i18n.t('chars.baseShieldLabel')}</span>
                <span class="text-sky-400">${c.shield}</span>
              </div>
              <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-sky-400" style="width:${shieldPct}%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-[10px] font-bold uppercase">
                <span class="text-slate-400">${i18n.t('chars.stats.agility')}</span>
                <span class="text-orange-400">${i18n.t('common.mpsShort', { v: c.movementSpeed.toFixed(2) })}</span>
              </div>
              <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-orange-400" style="width:${spdPct}%"></div>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2 text-xs">
            <div class="bg-slate-900/80 border border-slate-800 rounded p-2.5">
              <div class="flex items-center justify-between gap-2 mb-0.5">
                <span class="font-bold text-orange-400 uppercase tracking-wider">${i18n.t('chars.activePrefix', { name: this.escapeHtml(activeName) })}</span>
                <span class="text-[10px] text-slate-400 tabular-nums">${i18n.t('chars.durCdShort', { dur: c.abilityDuration, cd: c.abilityCooldown })}</span>
              </div>
              <p class="text-[11px] text-slate-300 leading-snug">${this.escapeHtml(activeDesc)}</p>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 rounded p-2.5">
              <div class="font-bold text-sky-400 uppercase tracking-wider mb-0.5">${i18n.t('chars.passivePrefix', { name: this.escapeHtml(passiveName) })}</div>
              <p class="text-[11px] text-slate-300 leading-snug">${this.escapeHtml(passiveDesc)}</p>
            </div>
          </div>
        </div>

        <div class="flex gap-2 shrink-0">
          <button
            type="button"
            data-action="open-skins-tab"
            class="nexus-btn-secondary px-3 py-2.5 rounded text-xs font-extrabold tracking-wider uppercase min-h-[44px] whitespace-nowrap"
          >${i18n.t('chars.skinsBtn')}</button>
          <button
            type="button"
            data-action="select-character"
            ${!unlocked || isEquippedChar ? 'disabled' : ''}
            class="${
              isEquippedChar
                ? 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 cursor-default'
                : unlocked
                  ? 'nexus-btn-primary'
                  : 'bg-slate-900 border border-slate-700 text-slate-500 cursor-not-allowed'
            } flex-1 py-2.5 px-4 rounded text-xs font-extrabold tracking-[0.16em] uppercase min-h-[44px]"
          >
            ${
              isEquippedChar
                ? i18n.t('chars.equippedCharBtn')
                : unlocked
                  ? i18n.t('chars.equipCharBtn')
                  : i18n.t('chars.lockedReachLvl', { level: c.unlockLevel })
            }
          </button>
        </div>
      `;
    } else {
      const catTabsHtml = SKIN_CATEGORIES.map(
        (cat) => `
          <button
            type="button"
            data-skin-cat="${cat.id}"
            class="px-2.5 py-1.5 rounded text-[10px] font-extrabold tracking-wider uppercase border whitespace-nowrap shrink-0 min-h-[34px] ${
              this.activeSkinCategory === cat.id
                ? 'bg-orange-500/20 border-orange-400 text-orange-200'
                : 'bg-slate-900/85 border-slate-700 text-slate-300 hover:border-sky-400/50'
            }"
          >${i18n.t(cat.labelKey)}</button>
        `,
      ).join('');

      const activeCategoryItems = this.getSkinCategoryItems(this.activeSkinCategory);
      const selectedPreviewId = String(this.previewCustomization[this.activeSkinCategory]);
      const equippedSkinId = String(this.equippedCustomization[this.activeSkinCategory]);
      const selectedInfo = getCustomizationOptionInfo(this.activeSkinCategory, selectedPreviewId);
      const selTitle = i18n.translateCustomizationOption(this.activeSkinCategory, selectedPreviewId, selectedInfo.title);
      const selSubtitle = i18n.translateCustomizationSubtitle(this.activeSkinCategory, selectedInfo.subtitle);
      const selDesc = i18n.translateCustomizationDesc(this.activeSkinCategory, selectedPreviewId, selectedInfo.description);
      const isCategoryModified = selectedPreviewId !== equippedSkinId;
      const anyModified = this.hasCustomizationChanges();

      const cardsHtml = activeCategoryItems
        .map((item) => {
          const isPreviewed = selectedPreviewId === item.id;
          const isEquippedItem = equippedSkinId === item.id;
          const itemLabel = i18n.translateCustomizationOption(this.activeSkinCategory, item.id, item.name);
          return `
            <button
              type="button"
              data-custom-key="${this.activeSkinCategory}"
              data-custom-val="${item.id}"
              class="rounded-md border text-left overflow-hidden flex flex-col transition-all ${
                isPreviewed
                  ? 'bg-slate-800/95 border-orange-400 ring-1 ring-orange-400/50'
                  : 'bg-slate-900/85 border-slate-700 hover:border-sky-400/70'
              }"
            >
              <div class="relative w-full aspect-square bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
                <div data-skin-fallback="${this.activeSkinCategory}:${item.id}" class="w-6 h-6 opacity-25 pointer-events-none flex items-center justify-center text-orange-300">
                  ${getCustomizeIconSvg()}
                </div>
                <img
                  data-skin-thumb="${this.activeSkinCategory}:${item.id}"
                  src=""
                  alt="${this.escapeHtml(itemLabel)}"
                  class="absolute inset-0 w-full h-full object-contain opacity-0 transition-opacity duration-200"
                />
                <span
                  class="absolute top-1 right-1 w-2.5 h-2.5 rounded-sm border border-white/40"
                  style="background-color: ${item.swatchHex};"
                ></span>
                ${
                  isEquippedItem
                    ? `<span class="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-emerald-950/90 border border-emerald-400/70 text-[8px] font-black text-emerald-300 uppercase">${i18n.t('common.equipped')}</span>`
                    : isPreviewed
                      ? `<span class="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-orange-950/90 border border-orange-400/70 text-[8px] font-black text-orange-300 uppercase">${i18n.t('chars.selected')}</span>`
                      : ''
                }
              </div>
              <div class="px-1.5 py-1">
                <div class="text-[10px] font-extrabold text-white truncate">${this.escapeHtml(itemLabel)}</div>
              </div>
            </button>
          `;
        })
        .join('');

      this.detailEl.innerHTML = `
        ${tabsHtml}

        <!-- Skin Category Selector -->
        <div class="flex gap-1 overflow-x-auto pb-1 nexus-scroll shrink-0">${catTabsHtml}</div>

        <!-- Visual 3D Skin & Outfit Cards -->
        <div class="nexus-scroll overflow-y-auto flex-1 flex flex-col gap-2.5 pr-0.5">
          <div class="grid grid-cols-3 gap-1.5">
            ${cardsHtml}
          </div>

          <!-- Selected Skin Information Card -->
          <div class="bg-slate-950/85 border border-slate-800 rounded p-2.5 flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-3.5 h-3.5 rounded-sm border border-white/30 shrink-0" style="background-color:${selectedInfo.swatchHex};"></span>
                <span class="text-xs font-black text-white uppercase truncate">${this.escapeHtml(selTitle)}</span>
              </div>
              <span class="text-[10px] font-extrabold uppercase ${
                isCategoryModified ? 'text-orange-300' : 'text-emerald-300'
              } shrink-0">
                ${isCategoryModified ? i18n.t('chars.previewing') : i18n.t('common.equipped')}
              </span>
            </div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-sky-400">${this.escapeHtml(selSubtitle)}</div>
            <p class="text-[11px] text-slate-300 leading-snug">${this.escapeHtml(selDesc)}</p>
          </div>
        </div>

        <!-- Functional Select / Equip / Revert Skin Controls -->
        <div class="flex gap-1.5 shrink-0">
          ${
            anyModified
              ? `<button
                  type="button"
                  data-custom-action="revert"
                  class="nexus-btn-secondary px-3 py-2.5 rounded text-[11px] font-extrabold tracking-wider uppercase min-h-[44px]"
                >${i18n.t('chars.revert')}</button>`
              : `<button
                  type="button"
                  data-custom-action="default"
                  class="nexus-btn-secondary px-3 py-2.5 rounded text-[11px] font-extrabold tracking-wider uppercase min-h-[44px]"
                >${i18n.t('chars.defaultTag')}</button>`
          }
          <button
            type="button"
            data-custom-action="equip-skin"
            ${!anyModified ? 'disabled' : ''}
            class="${
              anyModified
                ? 'nexus-btn-primary'
                : 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 cursor-default'
            } flex-1 py-2.5 px-3 rounded text-xs font-black tracking-[0.14em] uppercase min-h-[44px]"
          >
            ${anyModified ? i18n.t('chars.equipSkinSave') : i18n.t('chars.skinEquipped')}
          </button>
        </div>
      `;

      // Queue 3D model renders for every visible R6 skin/gear card on the inspected character
      const isHeadCategory =
        this.activeSkinCategory === 'eyesId' ||
        this.activeSkinCategory === 'mouthId' ||
        this.activeSkinCategory === 'faceMarkId' ||
        this.activeSkinCategory === 'hairStyleId' ||
        this.activeSkinCategory === 'hairColorId' ||
        this.activeSkinCategory === 'hatId' ||
        this.activeSkinCategory === 'glassesId' ||
        this.activeSkinCategory === 'maskId';
      for (const item of activeCategoryItems) {
        const img = this.detailEl.querySelector<HTMLImageElement>(
          `[data-skin-thumb="${this.activeSkinCategory}:${item.id}"]`,
        );
        const fallback = this.detailEl.querySelector<HTMLElement>(
          `[data-skin-fallback="${this.activeSkinCategory}:${item.id}"]`,
        );
        if (!img) continue;
        const cardCustom: R6Customization = {
          ...this.previewCustomization,
          [this.activeSkinCategory]: item.id,
        };
        const isHeadAccessory =
          this.activeSkinCategory === 'accessoryId' &&
          (item.id === 'headphones' || item.id === 'crown' || item.id === 'shades');
        const useAvatarMode = isHeadCategory || isHeadAccessory;
        const yawOffset =
          this.activeSkinCategory === 'accessoryId' &&
          (item.id === 'backpack' || item.id === 'cape')
            ? 2.45
            : useAvatarMode
              ? 0.16
              : 0.28;
        const cancel = this.previewRenderer.requestCharacterSnapshot(
          c,
          cardCustom,
          useAvatarMode ? 'avatar' : 'full',
          (dataUrl) => {
            img.src = dataUrl;
            img.classList.remove('opacity-0');
            if (fallback) {
              fallback.classList.add('hidden');
            }
          },
          yawOffset,
        );
        this.skinSnapshotCancels.push(cancel);
      }
    }

    // Bind detail tabs
    this.detailEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab as DetailTab;
        this.syncMobilePaneVisibility();
        this.renderDetail();
      });
    });

    this.detailEl.querySelector('[data-action="open-skins-tab"]')?.addEventListener('click', () => {
      this.activeTab = 'customize';
      this.syncMobilePaneVisibility();
      this.renderDetail();
    });

    // Bind Equip Character button
    const selectBtn = this.detailEl.querySelector<HTMLButtonElement>('[data-action="select-character"]');
    selectBtn?.addEventListener('click', () => {
      if (unlocked && !isEquippedChar) {
        this.callbacks.onConfirmSelect(c);
      }
    });

    // Bind Skin Category tabs
    this.detailEl.querySelectorAll<HTMLButtonElement>('[data-skin-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeSkinCategory = btn.dataset.skinCat as SkinCategory;
        this.renderDetail();
      });
    });

    // Bind Skin card preview selection (updates 3D preview without overwriting equipped until EQUIP SKIN is clicked!)
    this.detailEl.querySelectorAll<HTMLButtonElement>('[data-custom-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.customKey as keyof R6Customization;
        const val = btn.dataset.customVal!;
        this.previewCustomization = { ...this.previewCustomization, [key]: val };
        this.callbacks.onPreviewCustomization({ ...this.previewCustomization });
        if (key === 'accessoryId' && (val === 'backpack' || val === 'cape')) {
          this.callbacks.onSetPreviewYaw(2.6);
        } else if (
          key === 'eyesId' ||
          key === 'mouthId' ||
          key === 'faceMarkId' ||
          key === 'hairStyleId' ||
          key === 'hairColorId' ||
          key === 'hatId' ||
          key === 'glassesId' ||
          key === 'maskId' ||
          (key === 'accessoryId' && (val === 'shades' || val === 'crown' || val === 'headphones'))
        ) {
          this.callbacks.onSetPreviewYaw(0.16);
        }
        this.renderDetail();
      });
    });

    // Bind Equip Skin button
    this.detailEl.querySelector('[data-custom-action="equip-skin"]')?.addEventListener('click', () => {
      if (!this.hasCustomizationChanges()) return;
      const presetApp = getR6CharacterPreset(c.model.humanModelId).appearance;
      this.equippedCustomization = { ...this.previewCustomization };
      saveCharacterCustomizationOverride(c.id, this.equippedCustomization, presetApp);
      this.callbacks.onUpdateCustomization({ ...this.equippedCustomization }, c.id);
      this.renderGrid();
      this.renderDetail();
    });

    // Bind Revert button
    this.detailEl.querySelector('[data-custom-action="revert"]')?.addEventListener('click', () => {
      this.previewCustomization = { ...this.equippedCustomization };
      this.callbacks.onPreviewCustomization({ ...this.previewCustomization });
      this.renderDetail();
    });

    // Bind Default button (resets to inspected operator's signature R6 preset look)
    this.detailEl.querySelector('[data-custom-action="default"]')?.addEventListener('click', () => {
      const presetApp = getR6CharacterPreset(c.model.humanModelId).appearance;
      clearCharacterCustomizationOverride(c.id);
      this.previewCustomization = {
        ...DEFAULT_R6_CUSTOMIZATION,
        ...presetApp,
        armorId: this.equippedCustomization.armorId,
        accessoryId: this.equippedCustomization.accessoryId,
        petId: this.equippedCustomization.petId,
        petEnabled: this.equippedCustomization.petEnabled,
      };
      this.equippedCustomization = { ...this.previewCustomization };
      this.callbacks.onUpdateCustomization({ ...this.equippedCustomization }, c.id);
      this.renderGrid();
      this.renderDetail();
    });
  }

  private getSkinCategoryItems(
    cat: SkinCategory,
  ): ReadonlyArray<{ id: string; name: string; swatchHex: string }> {
    switch (cat) {
      case 'topId':
        return R6_TOPS;
      case 'pantsId':
        return R6_PANTS;
      case 'shoesId':
        return R6_SHOES;
      case 'hairStyleId':
        return R6_HAIR_STYLES;
      case 'hairColorId':
        return R6_HAIR_COLORS;
      case 'eyesId':
        return R6_EYE_STYLES;
      case 'mouthId':
        return R6_MOUTH_STYLES;
      case 'faceMarkId':
        return R6_FACE_MARKS;
      case 'hatId':
        return R6_HATS;
      case 'glassesId':
        return R6_GLASSES;
      case 'maskId':
        return R6_MASKS;
      case 'armorId':
        return R6_ARMORS.map((a) => ({
          id: a.id,
          name: a.name,
          swatchHex: a.metalHex,
        }));
      case 'accessoryId':
        return R6_ACCESSORIES;
      case 'skinId':
        return R6_SKINS;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  dispose(): void {
    this.i18nUnsubscribe?.();
    this.i18nUnsubscribe = null;
    this.clearRosterSnapshotCancels();
    this.clearSkinSnapshotCancels();
    this.unsubscribeUnlock();
    this.unsubscribeSelect();
  }
}
