import type { CharacterDefinition } from '../../characters/CharacterData';
import type { CharacterPreviewRenderer } from '../../characters/CharacterPreviewRenderer';
import {
  EMOTE_WHEEL_SLOT_COUNT,
  getEmoteById,
  type EmoteStyle,
} from '../../emotes/EmoteCatalog';
import { EmotePreviewCanvas } from '../../emotes/EmotePreviewCanvas';
import { i18n } from '../../i18n/I18nManager';
import { DEFAULT_R6_CUSTOMIZATION, type R6Customization } from '../../player/R6CustomizationData';
import { sanitizeAccentHex } from '../../shop/GlbAssetTypes';
import { glbStoreClient } from '../../shop/GlbStoreClient';
import {
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
  DEFAULT_EMOTE_ID,
  DEFAULT_GLIDER_ID,
  DEFAULT_GLOO_WALL_SHOP_ID,
  isShopItemEquipped,
  isShopItemOwned,
  mapShopCategoryToBrowseTab,
  NEXUS_SHOP_CATALOG,
  type ShopActionResult,
  type ShopBrowseTab,
  type ShopCatalogItem,
  type ShopClothingSubCategory,
  type ShopSnapshot,
  type ShopWeaponSubCategory,
} from '../../shop/IShopSystem';
import { GlbInteractivePreview } from '../components/GlbInteractivePreview';
import {
  getAvatarSvg,
  getBannerSvg,
  hasAvatarImage,
  hasBannerImage,
  getAvatarPreviewHtml,
  getBannerPreviewHtml,
} from '../icons/AvatarBannerSvg';
import { AvatarPreviewModal } from '../modals/AvatarPreviewModal';
import { BannerPreviewModal } from '../modals/BannerPreviewModal';
import { GlbImportPanel } from './GlbImportPanel';
import {
  getArmorSvg,
  getBackpackSvg,
  getCustomizeIconSvg,
  getEmoteSvg,
  getEmoteWheelTriggerSvg,
  getGlooWallSvg,
  getHealthHudSvg,
  getHelmetSvg,
  getPlayDeploySvg,
  getRankedShieldSvg,
  getScopeSvg,
  getShopCrateSvg,
  getWeaponSvg,
} from '../icons/GameIcons';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ShopScreenCallbacks {
  onSelectOffer: (item: ShopCatalogItem) => void;
  onPurchaseItem: (item: ShopCatalogItem) => ShopActionResult | Promise<ShopActionResult>;
  onEquipItem: (item: ShopCatalogItem) => ShopActionResult;
  onUnequipItem: (item: ShopCatalogItem) => ShopActionResult;
  onEquipEmoteSlot: (item: ShopCatalogItem, slotIndex: number) => ShopActionResult;
  onUnequipEmoteSlot: (slotIndex: number) => ShopActionResult;
  onPreviewEmote?: (emoteId: string) => void;
  onStopPreviewEmote?: () => void;
  onPreviewGlooWall?: (skinId: string) => void;
  onRefreshGlbCatalog?: () => Promise<void>;
  onOpenVault?: () => void;
  onBack: () => void;
}

const WEAPON_SUB_FILTERS: ReadonlyArray<{ id: 'all' | ShopWeaponSubCategory; key: string }> = [
  { id: 'all', key: 'shop.sub.all' },
  { id: 'Rifles', key: 'shop.sub.rifles' },
  { id: 'LMGs', key: 'shop.sub.lmgs' },
  { id: 'Snipers', key: 'shop.sub.snipers' },
  { id: 'SMGs', key: 'shop.sub.smgs' },
  { id: 'Shotguns', key: 'shop.sub.shotguns' },
  { id: 'Pistols', key: 'shop.sub.pistols' },
  { id: 'Melee', key: 'shop.sub.melee' },
];

const CLOTHING_SUB_FILTERS: ReadonlyArray<{ id: 'all' | ShopClothingSubCategory; key: string }> = [
  { id: 'all', key: 'shop.sub.allClothing' },
  { id: 'Outfits', key: 'shop.tab.outfits' },
  { id: 'Shirts', key: 'shop.sub.shirts' },
  { id: 'Pants', key: 'shop.sub.pants' },
  { id: 'Shoes', key: 'shop.sub.shoes' },
  { id: 'Hats', key: 'shop.sub.hats' },
  { id: 'Glasses', key: 'shop.sub.glasses' },
  { id: 'Masks', key: 'shop.sub.masks' },
  { id: 'Accessories', key: 'shop.sub.accessories' },
];

const EMOTE_SUB_FILTERS: ReadonlyArray<{ id: 'all' | EmoteStyle; key: string }> = [
  { id: 'all', key: 'shop.sub.allEmotes' },
  { id: 'cool', key: 'shop.sub.cool' },
  { id: 'victory', key: 'shop.sub.victory' },
  { id: 'trending', key: 'shop.sub.trending' },
  { id: 'funny', key: 'shop.sub.funny' },
];

function isBaseDefaultItem(item: ShopCatalogItem): boolean {
  if (item.avatarId === DEFAULT_AVATAR_ID) return true;
  if (item.bannerId === DEFAULT_BANNER_ID) return true;
  if (
    item.id === DEFAULT_GLIDER_ID ||
    item.id === DEFAULT_EMOTE_ID ||
    item.id === DEFAULT_GLOO_WALL_SHOP_ID
  ) {
    return true;
  }
  if (item.category === 'clothing' && item.customizationPatch) {
    const p = item.customizationPatch;
    if (
      p.topId === DEFAULT_R6_CUSTOMIZATION.topId ||
      p.pantsId === DEFAULT_R6_CUSTOMIZATION.pantsId ||
      p.shoesId === DEFAULT_R6_CUSTOMIZATION.shoesId
    ) {
      return true;
    }
  }
  return false;
}

export class ShopScreen {
  readonly element: HTMLElement;
  private catalog: readonly ShopCatalogItem[] = NEXUS_SHOP_CATALOG;
  private isDeveloperVerified = false;
  private purchaseInFlight = false;
  private activeTab: ShopBrowseTab = 'clothing';
  private activeClothingSub: 'all' | ShopClothingSubCategory = 'all';
  private activeWeaponSub: 'all' | ShopWeaponSubCategory = 'all';
  private activeEmoteSub: 'all' | EmoteStyle = 'all';
  private selectedOfferId = NEXUS_SHOP_CATALOG[0].id;
  private shopSnapshot: ShopSnapshot;
  private activeCharacter: CharacterDefinition;
  private activeCustomization: R6Customization;
  private feedback: { ok: boolean; text: string } | null = null;

  private readonly headerTitleEl: HTMLElement;
  private readonly headerSubEl: HTMLElement;
  private readonly balanceLabelEl: HTMLElement;
  private readonly backBtnEl: HTMLButtonElement;
  private readonly glbImportHeaderBtnEl: HTMLButtonElement | null;
  private readonly vaultBtnEl: HTMLButtonElement | null;
  private readonly creditsEl: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly subTabsEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly storefrontSplitEl: HTMLElement;
  private readonly glbImportHostEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly inspectorEl: HTMLElement;

  private readonly gridSnapshotCancels: Array<() => void> = [];
  private inspectorSnapshotCancel: (() => void) | null = null;
  private emotePreviewCanvas: EmotePreviewCanvas | null = null;
  private previewCanvasEmoteId: string | null = null;
  private previewCanvasContextKey = '';
  private glbInspectorPreview: GlbInteractivePreview | null = null;
  private glbPreviewModelKey = '';
  private glbImportPanel: GlbImportPanel | null = null;
  private previewingEmoteId: string | null = null;
  private previewRemainingSec = 0;
  private unsubI18n: (() => void) | null = null;
  private hasOpened = false;
  private readonly avatarPreviewModal = new AvatarPreviewModal();
  private readonly bannerPreviewModal = new BannerPreviewModal();

  constructor(
    initialSnapshot: ShopSnapshot,
    initialCharacter: CharacterDefinition,
    initialCustomization: R6Customization,
    private readonly previewRenderer: CharacterPreviewRenderer,
    private readonly callbacks: ShopScreenCallbacks,
  ) {
    this.shopSnapshot = initialSnapshot;
    this.activeCharacter = initialCharacter;
    this.activeCustomization = { ...initialCustomization };

    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-20 flex flex-col safe-pad pointer-events-auto bg-slate-950/88 overflow-hidden';

    this.element.innerHTML = `
      <div class="w-full max-w-[1360px] mx-auto flex-1 min-h-0 flex flex-col gap-2 sm:gap-3">
        <!-- Top Header Bar -->
        <header class="nr-studio-header flex items-center justify-between gap-2 sm:gap-3 shrink-0 pb-1.5 sm:pb-2.5 border-b border-slate-800/90">
          <div class="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              data-action="back"
              class="nexus-btn-secondary px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-md text-xs font-bold tracking-wider uppercase min-h-[34px] sm:min-h-[40px] whitespace-nowrap shrink-0"
            >← ${i18n.t('common.back')}</button>
            <div class="min-w-0">
              <h1 data-role="shop-title" class="text-sm sm:text-xl font-black tracking-wider uppercase text-white truncate">
                ${i18n.t('shop.title')}
              </h1>
              <p data-role="shop-subtitle" class="hidden md:block text-xs text-slate-400 truncate">
                ${i18n.t('shop.subtitle')}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-action="open-glb-import"
              class="hidden nexus-btn-secondary px-3 py-1.5 sm:py-2 rounded-md text-xs font-black tracking-wider uppercase border-amber-400/75 bg-amber-500/15 text-amber-200 hover:border-amber-300 min-h-[34px] sm:min-h-[40px] whitespace-nowrap shrink-0"
            >${i18n.t('shop.tab.glb-import')}</button>
            <button
              type="button"
              data-action="open-vault"
              class="${this.callbacks.onOpenVault ? '' : 'hidden '}nexus-btn-secondary px-3 py-1.5 sm:py-2 rounded-md text-xs font-black tracking-wider uppercase border-sky-400/50 text-sky-200 min-h-[34px] sm:min-h-[40px] whitespace-nowrap shrink-0"
            >${i18n.t('vault.goToVault')}</button>
            <div class="nexus-panel-subtle px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-md border border-amber-400/40 flex items-center gap-2 sm:gap-3 shrink-0">
              <span data-role="shop-balance-label" class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                ${i18n.t('shop.balance')}
              </span>
              <span data-role="credits" class="text-xs sm:text-base font-black text-amber-300 tabular-nums whitespace-nowrap"></span>
            </div>
          </div>
        </header>

        <!-- Category Navigation & Count -->
        <div class="flex flex-col gap-1.5 sm:gap-2 shrink-0">
          <div class="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            <nav data-role="tabs" class="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5" aria-label="Shop Categories"></nav>
            <span data-role="item-count" class="text-[11px] sm:text-xs font-semibold text-slate-400 tabular-nums whitespace-nowrap shrink-0"></span>
          </div>
          <div data-role="sub-tabs" class="hidden flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5"></div>
        </div>

        <!-- Main Responsive Storefront Split: Grid + Detail Inspector -->
        <div data-role="storefront-split" class="flex-1 min-h-0 nexus-scroll overflow-y-auto min-[540px]:overflow-hidden flex flex-col min-[540px]:flex-row gap-2.5 sm:gap-4">
          <!-- Product Grid -->
          <section class="flex-1 min-w-0 min-[540px]:min-h-0 min-[540px]:nexus-scroll min-[540px]:overflow-y-auto min-[540px]:pr-1 order-2 min-[540px]:order-1">
            <div data-role="grid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-3.5 pb-4"></div>
          </section>

          <!-- Contiguous Detail & Purchase Inspector -->
          <aside class="w-full min-[540px]:w-[228px] sm:w-[270px] lg:w-[350px] xl:w-[388px] shrink-0 order-1 min-[540px]:order-2 min-[540px]:min-h-0 min-[540px]:flex min-[540px]:flex-col">
            <div data-role="inspector" class="nexus-panel rounded-lg p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3.5 min-[540px]:max-h-full min-[540px]:nexus-scroll min-[540px]:overflow-y-auto"></div>
          </aside>
        </div>

        <!-- Developer-Only GLB Import & Management Workspace -->
        <div data-role="glb-import-host" class="hidden flex-1 min-h-0 nexus-scroll overflow-y-auto lg:overflow-hidden"></div>
      </div>
    `;

    this.headerTitleEl = this.element.querySelector('[data-role="shop-title"]')!;
    this.headerSubEl = this.element.querySelector('[data-role="shop-subtitle"]')!;
    this.balanceLabelEl = this.element.querySelector('[data-role="shop-balance-label"]')!;
    this.backBtnEl = this.element.querySelector('[data-action="back"]')!;
    this.glbImportHeaderBtnEl = this.element.querySelector('[data-action="open-glb-import"]');
    this.vaultBtnEl = this.element.querySelector('[data-action="open-vault"]');
    this.creditsEl = this.element.querySelector('[data-role="credits"]')!;
    this.tabsEl = this.element.querySelector('[data-role="tabs"]')!;
    this.subTabsEl = this.element.querySelector('[data-role="sub-tabs"]')!;
    this.countEl = this.element.querySelector('[data-role="item-count"]')!;
    this.storefrontSplitEl = this.element.querySelector('[data-role="storefront-split"]')!;
    this.glbImportHostEl = this.element.querySelector('[data-role="glb-import-host"]')!;
    this.gridEl = this.element.querySelector('[data-role="grid"]')!;
    this.inspectorEl = this.element.querySelector('[data-role="inspector"]')!;
    this.element.appendChild(this.avatarPreviewModal.element);
    this.element.appendChild(this.bannerPreviewModal.element);

    this.backBtnEl.addEventListener('click', () => {
      this.feedback = null;
      this.stopEmotePreview(true);
      this.callbacks.onBack();
    });

    this.glbImportHeaderBtnEl?.addEventListener('click', () => {
      if (!this.isDeveloperVerified) return;
      this.feedback = null;
      this.stopEmotePreview(true);
      this.activeTab = 'glb-import';
      this.ensureSelectedInView();
      this.renderTabs();
      this.syncTabWorkspace();
    });

    this.vaultBtnEl?.addEventListener('click', () => {
      this.feedback = null;
      this.stopEmotePreview(true);
      this.callbacks.onOpenVault?.();
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocale();
    });

    this.syncWalletText();
    this.renderTabs();
  }

  private getOperatorContextKey(): string {
    const c = this.activeCustomization;
    return `${this.activeCharacter.id}|${c.skinId}|${c.hairStyleId}|${c.hairColorId}|${c.topId}|${c.pantsId}|${c.armorId}|${c.accessoryId}`;
  }

  setOperatorContext(character: CharacterDefinition, customization: R6Customization): void {
    this.activeCharacter = character;
    this.activeCustomization = { ...customization };
    if (this.hasOpened) {
      this.renderInspector();
      this.renderGrid();
    }
  }

  setCatalog(items: readonly ShopCatalogItem[]): void {
    this.catalog = items.length > 0 ? items : NEXUS_SHOP_CATALOG;
    this.ensureSelectedInView();
    if (this.hasOpened && this.element.style.display !== 'none' && this.activeTab !== 'glb-import') {
      this.renderInspector();
      this.renderGrid();
    }
  }

  private syncDeveloperHeaderButton(): void {
    if (!this.glbImportHeaderBtnEl) return;
    this.glbImportHeaderBtnEl.classList.toggle('hidden', !this.isDeveloperVerified);
    const active = this.isDeveloperVerified && this.activeTab === 'glb-import';
    this.glbImportHeaderBtnEl.classList.toggle('border-amber-300', active);
    this.glbImportHeaderBtnEl.classList.toggle('bg-amber-500/30', active);
    this.glbImportHeaderBtnEl.classList.toggle('text-white', active);
    this.glbImportHeaderBtnEl.classList.toggle('border-amber-400/75', !active);
    this.glbImportHeaderBtnEl.classList.toggle('bg-amber-500/15', !active);
    this.glbImportHeaderBtnEl.classList.toggle('text-amber-200', !active);
  }

  setDeveloperAccess(isVerifiedDeveloper: boolean): void {
    const next = Boolean(isVerifiedDeveloper);
    this.isDeveloperVerified = next;
    if (!next) {
      if (this.activeTab === 'glb-import') {
        this.activeTab = 'clothing';
      }
      this.glbImportPanel?.dispose();
      this.glbImportPanel = null;
      this.glbImportHostEl.innerHTML = '';
    }
    this.syncDeveloperHeaderButton();
    this.renderTabs();
    if (this.hasOpened && this.element.style.display !== 'none') {
      this.syncTabWorkspace();
    }
  }

  openScreen(initialTab?: ShopBrowseTab): void {
    this.hasOpened = true;
    if (initialTab && initialTab !== 'all') {
      if (initialTab === 'glb-import' && !this.isDeveloperVerified) {
        this.activeTab = 'clothing';
      } else {
        this.activeTab = initialTab;
      }
      if (this.activeTab !== 'clothing') this.activeClothingSub = 'all';
      if (this.activeTab !== 'weapons') this.activeWeaponSub = 'all';
      if (this.activeTab !== 'dances') this.activeEmoteSub = 'all';
    }
    this.ensureSelectedInView();
    this.renderTabs();
    this.syncTabWorkspace();
  }

  closeScreen(): void {
    this.avatarPreviewModal.close();
    this.bannerPreviewModal.close();
    this.stopEmotePreview(true);
    this.clearEmotePreview();
    this.clearGlbInspectorPreview();
  }

  refreshIfOpened(): void {
    if (!this.hasOpened || this.element.style.display === 'none') {
      return;
    }
    this.syncTabWorkspace();
  }

  private syncTabWorkspace(): void {
    this.syncDeveloperHeaderButton();
    if (this.activeTab === 'glb-import' && this.isDeveloperVerified) {
      this.storefrontSplitEl.classList.add('hidden');
      this.glbImportHostEl.classList.remove('hidden');
      this.countEl.textContent = 'DEV STUDIO';
      if (!this.glbImportPanel) {
        this.glbImportPanel = new GlbImportPanel({
          onCatalogChanged: async () => {
            await this.callbacks.onRefreshGlbCatalog?.();
          },
        });
        this.glbImportHostEl.innerHTML = '';
        this.glbImportHostEl.appendChild(this.glbImportPanel.element);
      }
      void this.glbImportPanel.open();
      return;
    }

    this.glbImportHostEl.classList.add('hidden');
    this.storefrontSplitEl.classList.remove('hidden');
    this.renderInspector();
    this.renderGrid();
  }

  private refreshLocale(): void {
    this.headerTitleEl.textContent = i18n.t('shop.title');
    this.headerSubEl.textContent = i18n.t('shop.subtitle');
    this.balanceLabelEl.textContent = i18n.t('shop.balance');
    this.backBtnEl.textContent = `← ${i18n.t('common.back')}`;
    if (this.glbImportHeaderBtnEl) {
      this.glbImportHeaderBtnEl.textContent = i18n.t('shop.tab.glb-import');
    }
    if (this.vaultBtnEl) {
      this.vaultBtnEl.textContent = i18n.t('vault.goToVault');
    }
    this.feedback = null;
    this.syncWalletText();
    this.renderTabs();
    if (this.hasOpened) {
      this.renderInspector();
      this.renderGrid();
    }
  }

  updateSnapshot(snapshot: ShopSnapshot): void {
    this.shopSnapshot = snapshot;
    this.syncWalletText();
    if (this.hasOpened) {
      this.renderInspector();
      this.renderGrid();
    }
  }

  private isOwned(item: ShopCatalogItem): boolean {
    return isShopItemOwned(this.shopSnapshot, item);
  }

  private isEquipped(item: ShopCatalogItem): boolean {
    return isShopItemEquipped(this.shopSnapshot, this.activeCustomization, item);
  }

  private syncWalletText(): void {
    this.creditsEl.textContent = i18n.t('common.creditsShort', {
      amount: this.shopSnapshot.credits.toLocaleString(),
    });
  }

  private getFilteredItems(): readonly ShopCatalogItem[] {
    if (this.activeTab === 'all' || this.activeTab === 'glb-import') {
      return this.catalog;
    }
    const base = this.catalog.filter(
      (item) => mapShopCategoryToBrowseTab(item.category) === this.activeTab,
    );
    if (this.activeTab === 'clothing' && this.activeClothingSub !== 'all') {
      return base.filter((item) => item.subCategory === this.activeClothingSub);
    }
    if (this.activeTab === 'weapons' && this.activeWeaponSub !== 'all') {
      return base.filter((item) => item.subCategory === this.activeWeaponSub);
    }
    if (this.activeTab === 'dances' && this.activeEmoteSub !== 'all') {
      return base.filter((item) => getEmoteById(item.emoteId)?.style === this.activeEmoteSub);
    }
    return base;
  }

  private renderTabs(): void {
    const tabs: Array<{ id: ShopBrowseTab; label: string; devOnly?: boolean }> = [
      { id: 'characters', label: i18n.t('shop.tab.characters') },
      { id: 'clothing', label: i18n.t('shop.tab.clothing') },
      { id: 'weapon-skins', label: i18n.t('shop.tab.weapon-skins') },
      { id: 'avatars', label: i18n.t('shop.tab.avatars') },
      { id: 'banners', label: i18n.t('shop.tab.banners') },
      { id: 'dances', label: i18n.t('shop.tab.dances') },
      { id: 'gloo-walls', label: i18n.t('shop.tab.gloo-walls') },
      { id: 'weapons', label: i18n.t('shop.tab.weapons') },
      { id: 'armor', label: i18n.t('shop.tab.armor') },
      { id: 'equipment', label: i18n.t('shop.tab.equipment') },
      { id: 'tools', label: i18n.t('shop.tab.tools') },
    ];
    if (this.isDeveloperVerified) {
      tabs.unshift({ id: 'glb-import', label: i18n.t('shop.tab.glb-import'), devOnly: true });
    }
    this.syncDeveloperHeaderButton();

    this.tabsEl.innerHTML = '';
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = tab.id === this.activeTab;
      btn.className = `${
        active
          ? 'nexus-btn-primary'
          : tab.devOnly
            ? 'nexus-btn-secondary border-amber-400/55 text-amber-200'
            : 'nexus-btn-secondary text-slate-300'
      } px-3.5 py-2 rounded-md text-xs font-bold tracking-wider uppercase min-h-[40px] whitespace-nowrap shrink-0`;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        if (tab.id === 'glb-import' && !this.isDeveloperVerified) return;
        this.activeTab = tab.id;
        if (tab.id !== 'clothing') {
          this.activeClothingSub = 'all';
        }
        if (tab.id !== 'weapons') {
          this.activeWeaponSub = 'all';
        }
        if (tab.id !== 'dances') {
          this.activeEmoteSub = 'all';
        }
        this.ensureSelectedInView();
        this.renderTabs();
        this.syncTabWorkspace();
      });
      this.tabsEl.appendChild(btn);
    }

    if (this.activeTab === 'clothing') {
      this.subTabsEl.classList.remove('hidden');
      this.subTabsEl.innerHTML = '';
      for (const sub of CLOTHING_SUB_FILTERS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const active = sub.id === this.activeClothingSub;
        btn.className = `px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors min-h-[34px] border ${
          active
            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
            : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
        }`;
        btn.textContent = i18n.t(sub.key as Parameters<typeof i18n.t>[0]);
        btn.addEventListener('click', () => {
          this.activeClothingSub = sub.id;
          this.ensureSelectedInView();
          this.renderTabs();
          this.renderInspector();
          this.renderGrid();
        });
        this.subTabsEl.appendChild(btn);
      }
    } else if (this.activeTab === 'weapons') {
      this.subTabsEl.classList.remove('hidden');
      this.subTabsEl.innerHTML = '';
      for (const sub of WEAPON_SUB_FILTERS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const active = sub.id === this.activeWeaponSub;
        btn.className = `px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors min-h-[34px] border ${
          active
            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
            : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
        }`;
        btn.textContent = i18n.t(sub.key as Parameters<typeof i18n.t>[0]);
        btn.addEventListener('click', () => {
          this.activeWeaponSub = sub.id;
          this.ensureSelectedInView();
          this.renderTabs();
          this.renderInspector();
          this.renderGrid();
        });
        this.subTabsEl.appendChild(btn);
      }
    } else if (this.activeTab === 'dances') {
      this.subTabsEl.classList.remove('hidden');
      this.subTabsEl.innerHTML = '';
      for (const sub of EMOTE_SUB_FILTERS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const active = sub.id === this.activeEmoteSub;
        btn.className = `px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors min-h-[34px] border ${
          active
            ? 'bg-orange-500/20 border-orange-400 text-orange-200'
            : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
        }`;
        btn.textContent = i18n.t(sub.key as Parameters<typeof i18n.t>[0]);
        btn.addEventListener('click', () => {
          this.activeEmoteSub = sub.id;
          this.ensureSelectedInView();
          this.renderTabs();
          this.renderInspector();
          this.renderGrid();
        });
        this.subTabsEl.appendChild(btn);
      }
    } else {
      this.subTabsEl.classList.add('hidden');
      this.subTabsEl.innerHTML = '';
    }
  }

  private ensureSelectedInView(): void {
    const filtered = this.getFilteredItems();
    if (filtered.length > 0 && !filtered.some((i) => i.id === this.selectedOfferId)) {
      this.selectedOfferId = filtered[0].id;
    }
  }

  private getFallbackIconSvg(item: ShopCatalogItem): string {
    if (item.avatarId) {
      return getAvatarSvg(item.avatarId, 'w-full h-full');
    }
    if (item.bannerId) {
      return getBannerSvg(item.bannerId, 'w-full h-full');
    }
    if (item.emoteId) {
      const emote = getEmoteById(item.emoteId);
      return emote
        ? getEmoteSvg(emote.iconKind, item.accentHex)
        : getEmoteWheelTriggerSvg();
    }
    if (item.glooSkinId) {
      return getGlooWallSvg();
    }
    if (item.weaponId) {
      return getWeaponSvg(item.weaponId, item.accentHex);
    }
    if (item.gliderColors) {
      return getPlayDeploySvg();
    }
    if (item.customizationPatch) {
      return getCustomizeIconSvg();
    }
    if (item.lootId?.startsWith('armor')) {
      const tier = item.lootId.endsWith('lv3') ? 3 : item.lootId.endsWith('lv2') ? 2 : 1;
      return getArmorSvg(tier);
    }
    if (item.lootId?.startsWith('helmet')) {
      const tier = item.lootId.endsWith('lv3') ? 3 : item.lootId.endsWith('lv2') ? 2 : 1;
      return getHelmetSvg(tier);
    }
    if (item.lootId?.startsWith('backpack')) {
      const tier = item.lootId.endsWith('lv3') ? 3 : item.lootId.endsWith('lv2') ? 2 : 1;
      return getBackpackSvg(tier);
    }
    if (item.lootId?.startsWith('scope')) {
      const zoom = item.lootId.includes('8x') ? 8 : item.lootId.includes('4x') ? 4 : 2;
      return getScopeSvg(zoom);
    }
    if (item.lootId?.startsWith('shield')) {
      return getRankedShieldSvg();
    }
    if (item.lootId?.startsWith('med')) {
      return getHealthHudSvg();
    }
    return getShopCrateSvg();
  }

  private getActionButtonState(item: ShopCatalogItem): {
    label: string;
    cardLabel: string;
    disabled: boolean;
    canAfford: boolean;
    owned: boolean;
    equipped: boolean;
    baseDefault: boolean;
  } {
    const owned = this.isOwned(item);
    const equipped = this.isEquipped(item);
    const baseDefault = isBaseDefaultItem(item);
    const canAfford = this.shopSnapshot.credits >= item.priceCredits;

    if (equipped) {
      return {
        label: baseDefault ? i18n.t('shop.equippedCheck') : i18n.t('shop.unequipItem'),
        cardLabel: baseDefault ? i18n.t('shop.equippedCheck') : i18n.t('shop.cardUnequip'),
        disabled: baseDefault,
        canAfford: true,
        owned: true,
        equipped: true,
        baseDefault,
      };
    }
    if (owned) {
      return {
        label: i18n.t('shop.equipItem'),
        cardLabel: i18n.t('shop.equipItem'),
        disabled: false,
        canAfford: true,
        owned: true,
        equipped: false,
        baseDefault,
      };
    }
    return {
      label:
        item.priceCredits === 0
          ? i18n.t('shop.free')
          : i18n.t('shop.purchaseBtn', { price: item.priceCredits.toLocaleString() }),
      cardLabel: i18n.t('shop.cardBuy'),
      disabled: false,
      canAfford,
      owned: false,
      equipped: false,
      baseDefault,
    };
  }

  private async handlePurchaseOrEquip(item: ShopCatalogItem): Promise<void> {
    this.selectedOfferId = item.id;
    const owned = this.isOwned(item);
    const equipped = this.isEquipped(item);
    let result: ShopActionResult;
    if (!owned) {
      if (this.purchaseInFlight) return;
      this.purchaseInFlight = true;
      this.renderInspector();
      try {
        result = await this.callbacks.onPurchaseItem(item);
      } finally {
        this.purchaseInFlight = false;
      }
    } else if (equipped) {
      if (isBaseDefaultItem(item)) return;
      result = this.callbacks.onUnequipItem(item);
    } else {
      result = this.callbacks.onEquipItem(item);
    }
    this.feedback = { ok: result.ok, text: result.message };
    this.renderInspector();
    this.renderGrid();
    this.syncAvatarPreviewModal(item);
    this.syncBannerPreviewModal(item);
  }

  private buildAvatarModalState(item: ShopCatalogItem) {
    const state = this.getActionButtonState(item);
    const priceDisplay =
      item.priceCredits === 0
        ? i18n.t('shop.free')
        : i18n.t('common.creditsShort', { amount: item.priceCredits.toLocaleString() });
    return {
      item,
      owned: state.owned,
      equipped: state.equipped,
      canAfford: state.canAfford,
      baseDefault: state.baseDefault,
      actionLabel: state.label,
      actionDisabled: state.disabled,
      priceDisplay,
      feedback: this.feedback,
    };
  }

  private openAvatarPreview(item: ShopCatalogItem): void {
    if (!item.avatarId) return;
    if (this.selectedOfferId !== item.id) {
      this.selectedOfferId = item.id;
      this.feedback = null;
      this.renderInspector();
      this.updateGridSelection();
      this.callbacks.onSelectOffer(item);
    }
    this.avatarPreviewModal.open(this.buildAvatarModalState(item), (targetItem) => {
      void this.handlePurchaseOrEquip(targetItem);
    });
  }

  private syncAvatarPreviewModal(item: ShopCatalogItem): void {
    if (!item.avatarId || !this.avatarPreviewModal.isOpen()) return;
    this.avatarPreviewModal.update(this.buildAvatarModalState(item));
  }

  private buildBannerModalState(item: ShopCatalogItem) {
    return {
      ...this.buildAvatarModalState(item),
      equippedAvatarId: this.shopSnapshot.equippedAvatarId || DEFAULT_AVATAR_ID,
    };
  }

  private openBannerPreview(item: ShopCatalogItem): void {
    if (!item.bannerId) return;
    if (this.selectedOfferId !== item.id) {
      this.selectedOfferId = item.id;
      this.feedback = null;
      this.renderInspector();
      this.updateGridSelection();
      this.callbacks.onSelectOffer(item);
    }
    this.bannerPreviewModal.open(this.buildBannerModalState(item), (targetItem) => {
      void this.handlePurchaseOrEquip(targetItem);
    });
  }

  private syncBannerPreviewModal(item: ShopCatalogItem): void {
    if (!item.bannerId || !this.bannerPreviewModal.isOpen()) return;
    this.bannerPreviewModal.update(this.buildBannerModalState(item));
  }

  private startDancePreview(item: ShopCatalogItem): void {
    if (!item.emoteId) return;
    const emoteId = item.emoteId;

    // Ensure item is selected in the inspector first
    if (this.selectedOfferId !== item.id) {
      this.selectedOfferId = item.id;
      this.feedback = null;
      this.renderInspector();
      this.updateGridSelection();
      this.callbacks.onSelectOffer(item);
    }

    // Never allow two previews/music tracks to play at the same time
    this.callbacks.onStopPreviewEmote?.();

    if (!this.emotePreviewCanvas) {
      const mount = this.inspectorEl.querySelector<HTMLElement>('[data-role="live-emote-mount"]');
      if (mount) {
        const preview = this.createPreviewCanvas(emoteId, false);
        mount.appendChild(preview.element);
      }
    }

    const dur = this.emotePreviewCanvas?.playPreview(emoteId) ?? 10;
    this.previewingEmoteId = emoteId;
    this.previewRemainingSec = dur || 10;
    this.callbacks.onPreviewEmote?.(emoteId);
    this.syncPreviewUiState();
  }

  private stopEmotePreview(notifyAudio = true): void {
    const hadPreview = this.previewingEmoteId !== null;
    this.previewingEmoteId = null;
    this.previewRemainingSec = 0;
    this.emotePreviewCanvas?.stopPreview(false);
    if (notifyAudio && hadPreview) {
      this.callbacks.onStopPreviewEmote?.();
    }
    this.syncPreviewUiState();
  }

  private toggleDancePreview(item: ShopCatalogItem): void {
    if (!item.emoteId) return;
    if (this.previewingEmoteId === item.emoteId) {
      this.stopEmotePreview(true);
    } else {
      this.startDancePreview(item);
    }
  }

  private createPreviewCanvas(emoteId: string, autoPlay: boolean): EmotePreviewCanvas {
    this.clearEmotePreview();
    const preview = new EmotePreviewCanvas(false);
    preview.setOnStateChange((activeId, remaining) => {
      if (activeId === null) {
        const wasPlaying = this.previewingEmoteId !== null;
        this.previewingEmoteId = null;
        this.previewRemainingSec = 0;
        if (wasPlaying) {
          this.callbacks.onStopPreviewEmote?.();
        }
      } else {
        this.previewingEmoteId = activeId;
        this.previewRemainingSec = remaining;
      }
      this.syncPreviewUiState();
    });
    preview.setEmote(emoteId, this.activeCharacter, this.activeCustomization, autoPlay);
    this.emotePreviewCanvas = preview;
    this.previewCanvasEmoteId = emoteId;
    this.previewCanvasContextKey = this.getOperatorContextKey();
    return preview;
  }

  private syncPreviewUiState(): void {
    const selectedItem =
      this.catalog.find((i) => i.id === this.selectedOfferId) ?? this.catalog[0];
    const isSelectedPreviewing = Boolean(
      selectedItem.emoteId && this.previewingEmoteId === selectedItem.emoteId,
    );

    const badgeEl = this.inspectorEl.querySelector<HTMLElement>('[data-role="preview-status-badge"]');
    if (badgeEl) {
      if (isSelectedPreviewing) {
        badgeEl.textContent = i18n.t('shop.previewingSec', {
          sec: this.previewRemainingSec.toFixed(1),
        });
        badgeEl.className =
          'px-2 py-0.5 rounded bg-orange-500/25 border border-orange-400/70 text-[10px] font-black text-orange-200 tabular-nums';
      } else {
        badgeEl.textContent = i18n.t('shop.emoteWheel.livePreview');
        badgeEl.className =
          'px-2 py-0.5 rounded bg-slate-950/85 border border-slate-700/80 text-[10px] font-bold text-slate-300';
      }
    }

    const toggleBtn = this.inspectorEl.querySelector<HTMLButtonElement>('[data-action="toggle-preview-emote"]');
    if (toggleBtn) {
      if (isSelectedPreviewing) {
        toggleBtn.textContent = `${i18n.t('shop.stopPreview')} · ${this.previewRemainingSec.toFixed(1)}s`;
        toggleBtn.className =
          'w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[40px] bg-orange-500/25 border border-orange-400 text-orange-100 hover:bg-orange-500/35 transition-colors tabular-nums';
      } else {
        toggleBtn.textContent = `▶ ${i18n.t('shop.preview')}`;
        toggleBtn.className =
          'nexus-btn-secondary w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[40px] border-sky-400/60 text-sky-200 hover:border-sky-300';
      }
    }

    const vpOverlayBtn = this.inspectorEl.querySelector<HTMLButtonElement>('[data-action="replay-emote"]');
    if (vpOverlayBtn) {
      vpOverlayBtn.textContent = isSelectedPreviewing
        ? i18n.t('shop.stopPreview')
        : i18n.t('shop.preview');
    }

    // Update grid card Preview buttons in place
    this.gridEl.querySelectorAll<HTMLButtonElement>('[data-card-preview]').forEach((btn) => {
      const emoteId = btn.dataset.cardPreview;
      const active = Boolean(emoteId && this.previewingEmoteId === emoteId);
      btn.textContent = active ? i18n.t('shop.stopPreview') : i18n.t('shop.preview');
      btn.className = active
        ? 'px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] bg-orange-500/25 border border-orange-400 text-orange-100'
        : 'nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] border-sky-400/50 text-sky-200';
    });
  }

  private clearEmotePreview(): void {
    if (this.emotePreviewCanvas) {
      this.emotePreviewCanvas.dispose();
      this.emotePreviewCanvas = null;
    }
    this.previewCanvasEmoteId = null;
    this.previewCanvasContextKey = '';
  }

  private clearGlbInspectorPreview(): void {
    if (this.glbInspectorPreview) {
      this.glbInspectorPreview.dispose();
      this.glbInspectorPreview = null;
    }
    this.glbPreviewModelKey = '';
  }

  private renderInspector(): void {
    this.inspectorSnapshotCancel?.();
    this.inspectorSnapshotCancel = null;

    const item =
      this.catalog.find((i) => i.id === this.selectedOfferId) ?? this.catalog[0];
    if (!item) return;

    // If user moved to a different item than the active preview, stop active dance music/preview
    if (this.previewingEmoteId && item.emoteId !== this.previewingEmoteId) {
      this.stopEmotePreview(true);
    }

    const loc = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
    const safeName = escapeHtml(loc.name);
    const safeDesc = escapeHtml(loc.desc);
    const safeAccentHex = sanitizeAccentHex(item.accentHex, '#38bdf8');
    const state = this.getActionButtonState(item);
    const categoryLabel = i18n.translateShopCategory(item.category);
    const subLabel = item.subCategory ? i18n.translateShopSubCategory(item.subCategory) : '';
    const metaLine = escapeHtml(
      subLabel && subLabel !== categoryLabel
        ? `${i18n.translateRarity(item.rarity)} · ${categoryLabel} · ${subLabel}`
        : `${i18n.translateRarity(item.rarity)} · ${categoryLabel}`,
    );

    const priceDisplay =
      item.priceCredits === 0
        ? i18n.t('shop.free')
        : i18n.t('common.creditsShort', { amount: item.priceCredits.toLocaleString() });

    const ctaDisabled = state.disabled || (!state.owned && this.purchaseInFlight);
    const ctaLabel = !state.owned && this.purchaseInFlight ? '...' : state.label;
    const ctaClass = state.equipped
      ? state.baseDefault
        ? 'w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] bg-emerald-500/20 border border-emerald-400/70 text-emerald-200 cursor-default'
        : 'nexus-btn-secondary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-amber-400/65 text-amber-200 hover:border-amber-300'
      : state.owned || state.canAfford
        ? 'nexus-btn-primary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px]'
        : 'nexus-btn-secondary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-rose-400/50 text-rose-200';

    const statusText = state.equipped
      ? `<span class="text-xs font-bold text-emerald-300">${i18n.t('common.equipped')}</span>`
      : state.owned
        ? `<span class="text-xs font-bold text-sky-300">${i18n.t('common.inVault')}</span>`
        : `<span class="text-base font-black text-amber-300 tabular-nums">${priceDisplay}</span>`;

    const specsHtml =
      item.specs && item.specs.length > 0
        ? `<div class="grid grid-cols-2 gap-2 pt-1">
            ${item.specs
              .map((spec) => {
                const displayValue =
                  item.emoteId && spec.labelKey === 'shop.spec.style'
                    ? i18n.translateShopSubCategory(spec.value)
                    : spec.value;
                return `
              <div class="bg-slate-900/90 border border-slate-800 rounded-md px-2.5 py-2 flex flex-col gap-0.5">
                <span class="text-[11px] text-slate-400 truncate">${escapeHtml(i18n.t(spec.labelKey as Parameters<typeof i18n.t>[0]))}</span>
                <span class="text-xs font-bold text-white tabular-nums truncate">${escapeHtml(displayValue)}</span>
              </div>`;
              })
              .join('')}
          </div>`
        : '';

    const feedbackHtml = this.feedback
      ? `<div class="rounded-md px-3 py-2 text-xs font-semibold border ${
          this.feedback.ok
            ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
            : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
        }">${escapeHtml(this.feedback.text)}</div>`
      : '';

    const isSvgCosmetic = Boolean(item.avatarId || item.bannerId);
    const isEmoteItem = Boolean(item.emoteId);
    const isGlbItem = Boolean(item.glbAsset);
    const isPreviewingThis = Boolean(item.emoteId && this.previewingEmoteId === item.emoteId);
    const wheelSlotsHtml = isEmoteItem ? this.buildWheelAssignerHtml(item, state.owned) : '';

    // Detach existing live canvas temporarily so innerHTML replacement doesn't destroy its WebGL element if we can reuse it
    const canReuseCanvas =
      isEmoteItem &&
      this.emotePreviewCanvas &&
      this.previewCanvasEmoteId === item.emoteId &&
      this.previewCanvasContextKey === this.getOperatorContextKey();
    if (canReuseCanvas && this.emotePreviewCanvas?.element.parentElement) {
      this.emotePreviewCanvas.element.remove();
    } else {
      this.clearEmotePreview();
    }

    const nextGlbKey = item.glbAsset
      ? `${item.glbAsset.assetId}|${item.glbAsset.modelUrl}|${item.glbAsset.equipSlot}|${item.glbAsset.scaleMultiplier}`
      : '';
    const canReuseGlb = Boolean(
      isGlbItem && this.glbInspectorPreview && this.glbPreviewModelKey === nextGlbKey,
    );
    if (canReuseGlb && this.glbInspectorPreview?.element.parentElement) {
      this.glbInspectorPreview.element.remove();
    } else if (!isGlbItem || !canReuseGlb) {
      this.clearGlbInspectorPreview();
    }

    const viewportInnerHtml = isGlbItem
      ? `<div data-role="glb-inspector-mount" class="absolute inset-0 w-full h-full"></div>`
      : isEmoteItem
      ? `<div data-role="live-emote-mount" class="absolute inset-0 w-full h-full"></div>
         <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 pointer-events-none">
           <span data-role="preview-status-badge" class="${
             isPreviewingThis
               ? 'px-2 py-0.5 rounded bg-orange-500/25 border border-orange-400/70 text-[10px] font-black text-orange-200 tabular-nums'
               : 'px-2 py-0.5 rounded bg-slate-950/85 border border-slate-700/80 text-[10px] font-bold text-slate-300'
           }">${
             isPreviewingThis
               ? i18n.t('shop.previewingSec', { sec: this.previewRemainingSec.toFixed(1) })
               : i18n.t('shop.emoteWheel.livePreview')
           }</span>
           <button
             type="button"
             data-action="replay-emote"
             class="pointer-events-auto px-2.5 py-1 rounded bg-slate-900/90 hover:bg-slate-800 border border-sky-400/50 text-[10px] font-extrabold uppercase tracking-wider text-sky-200"
           >${isPreviewingThis ? i18n.t('shop.stopPreview') : i18n.t('shop.preview')}</button>
         </div>`
      : item.avatarId
        ? hasAvatarImage(item.avatarId)
          ? `<div data-action="preview-avatar" class="w-full h-full cursor-pointer group relative overflow-hidden">
               ${getAvatarPreviewHtml(item.avatarId, 'w-full h-full transition-transform duration-300 group-hover:scale-[1.03]', 'cover')}
             </div>`
          : `<div data-action="preview-avatar" class="w-32 h-32 sm:w-40 sm:h-40 rounded-lg overflow-hidden border-2 shadow-xl cursor-pointer" style="border-color:${safeAccentHex}">${getAvatarSvg(item.avatarId, 'w-full h-full')}</div>`
        : item.bannerId
          ? hasBannerImage(item.bannerId)
            ? `<div data-action="preview-banner" class="w-full h-full cursor-pointer group relative overflow-hidden">
                 ${getBannerPreviewHtml(item.bannerId, 'w-full h-full transition-transform duration-300 group-hover:scale-[1.03]', 'cover')}
               </div>`
            : `<div data-action="preview-banner" class="w-full h-full p-3 flex items-center justify-center cursor-pointer"><div class="w-full aspect-[16/6] rounded-md overflow-hidden border shadow-xl" style="border-color:${safeAccentHex}">${getBannerSvg(item.bannerId, 'w-full h-full')}</div></div>`
          : `<div data-role="inspector-fallback" class="w-16 h-16 opacity-35 pointer-events-none flex items-center justify-center">
               ${this.getFallbackIconSvg(item)}
             </div>
             <img
               data-role="inspector-img"
               src=""
               alt="${safeName}"
               referrerpolicy="no-referrer"
               class="absolute inset-0 w-full h-full object-contain p-3 opacity-0 transition-opacity duration-200"
             />`;

    this.inspectorEl.innerHTML = `
      <div
        data-role="inspector-viewport"
        class="relative w-full aspect-[4/3] rounded-md overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center shrink-0"
        style="background: radial-gradient(circle at 50% 45%, ${safeAccentHex}24 0%, rgba(15, 23, 42, 0.96) 68%, #020617 100%);"
      >
        ${viewportInnerHtml}
      </div>

      <div class="flex flex-col gap-1.5 min-w-0">
        <div class="text-xs font-semibold text-sky-300 truncate">${metaLine}</div>
        <div class="flex items-start justify-between gap-2">
          <h2 class="text-lg font-black tracking-wide text-white leading-tight">${safeName}</h2>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">${safeDesc}</p>
      </div>

      ${specsHtml}
      ${wheelSlotsHtml}

      <div class="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
        <span class="text-xs font-semibold text-slate-400">${i18n.t('shop.price')}</span>
        ${statusText}
      </div>

      ${feedbackHtml}

      ${
        isEmoteItem
          ? `<div class="grid grid-cols-2 gap-2">
               <button
                 type="button"
                 data-action="toggle-preview-emote"
                 class="${
                   isPreviewingThis
                     ? 'w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] bg-orange-500/25 border border-orange-400 text-orange-100 hover:bg-orange-500/35 transition-colors tabular-nums'
                     : 'nexus-btn-secondary w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-sky-400/60 text-sky-200 hover:border-sky-300'
                 }"
               >${
                 isPreviewingThis
                   ? `${i18n.t('shop.stopPreview')} · ${this.previewRemainingSec.toFixed(1)}s`
                   : `▶ ${i18n.t('shop.preview')}`
               }</button>
               <button
                 type="button"
                 data-role="shop-action-btn"
                 ${ctaDisabled ? 'disabled' : ''}
                 class="${ctaClass}"
               >${escapeHtml(ctaLabel)}</button>
             </div>`
          : item.glooSkinId
            ? `<div class="grid grid-cols-2 gap-2">
                 <button
                   type="button"
                   data-action="preview-gloo-fx"
                   class="nexus-btn-secondary w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-sky-400/60 text-sky-200 hover:border-sky-300"
                 >❄ ${i18n.t('shop.previewFx')}</button>
                 <button
                   type="button"
                   data-role="shop-action-btn"
                   ${ctaDisabled ? 'disabled' : ''}
                   class="${ctaClass}"
                 >${escapeHtml(ctaLabel)}</button>
               </div>`
            : item.avatarId
              ? `<div class="grid grid-cols-2 gap-2">
                   <button
                     type="button"
                     data-action="preview-avatar-btn"
                     class="nexus-btn-secondary w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-sky-400/60 text-sky-200 hover:border-sky-300"
                   >${i18n.t('shop.preview')}</button>
                   <button
                     type="button"
                     data-role="shop-action-btn"
                     ${ctaDisabled ? 'disabled' : ''}
                     class="${ctaClass}"
                   >${escapeHtml(ctaLabel)}</button>
                 </div>`
              : item.bannerId
                ? `<div class="grid grid-cols-2 gap-2">
                     <button
                       type="button"
                       data-action="preview-banner-btn"
                       class="nexus-btn-secondary w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-sky-400/60 text-sky-200 hover:border-sky-300"
                     >${i18n.t('shop.preview')}</button>
                     <button
                       type="button"
                       data-role="shop-action-btn"
                       ${ctaDisabled ? 'disabled' : ''}
                       class="${ctaClass}"
                     >${escapeHtml(ctaLabel)}</button>
                   </div>`
                : `<button
                     type="button"
                     data-role="shop-action-btn"
                     ${ctaDisabled ? 'disabled' : ''}
                     class="${ctaClass}"
                   >${escapeHtml(ctaLabel)}</button>`
      }
    `;

    if (isGlbItem && item.glbAsset) {
      const mount = this.inspectorEl.querySelector<HTMLElement>('[data-role="glb-inspector-mount"]');
      if (mount) {
        if (canReuseGlb && this.glbInspectorPreview) {
          mount.appendChild(this.glbInspectorPreview.element);
        } else {
          const preview = new GlbInteractivePreview({ heightClass: 'h-full' });
          preview.element.classList.remove('border', 'border-slate-800');
          mount.appendChild(preview.element);
          this.glbInspectorPreview = preview;
          this.glbPreviewModelKey = nextGlbKey;
          void preview.loadFromUrl(
            item.glbAsset.modelUrl,
            item.glbAsset.equipSlot,
            item.glbAsset.scaleMultiplier,
          );
        }
      }
    } else if (isEmoteItem && item.emoteId) {
      const mount = this.inspectorEl.querySelector<HTMLElement>('[data-role="live-emote-mount"]');
      if (mount) {
        if (canReuseCanvas && this.emotePreviewCanvas) {
          mount.appendChild(this.emotePreviewCanvas.element);
        } else {
          const preview = this.createPreviewCanvas(item.emoteId, false);
          mount.appendChild(preview.element);
        }
      }
      this.inspectorEl
        .querySelector('[data-action="replay-emote"]')
        ?.addEventListener('click', () => {
          this.toggleDancePreview(item);
        });
      this.inspectorEl
        .querySelector('[data-action="toggle-preview-emote"]')
        ?.addEventListener('click', () => {
          this.toggleDancePreview(item);
        });

      this.inspectorEl.querySelectorAll<HTMLButtonElement>('[data-wheel-assign]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const slotIdx = Number(btn.dataset.wheelAssign);
          const result = this.callbacks.onEquipEmoteSlot(item, slotIdx);
          this.feedback = { ok: result.ok, text: result.message };
          this.renderInspector();
          this.renderGrid();
        });
      });

      this.inspectorEl.querySelectorAll<HTMLButtonElement>('[data-wheel-clear]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slotIdx = Number(btn.dataset.wheelClear);
          const result = this.callbacks.onUnequipEmoteSlot(slotIdx);
          this.feedback = { ok: result.ok, text: result.message };
          this.renderInspector();
          this.renderGrid();
        });
      });
    } else if (!isSvgCosmetic) {
      const imgEl = this.inspectorEl.querySelector<HTMLImageElement>('[data-role="inspector-img"]');
      const fallbackEl = this.inspectorEl.querySelector<HTMLElement>('[data-role="inspector-fallback"]');
      if (imgEl) {
        this.inspectorSnapshotCancel = this.previewRenderer.requestShopItemSnapshot(
          item,
          this.activeCharacter,
          this.activeCustomization,
          (dataUrl) => {
            imgEl.src = dataUrl;
            imgEl.classList.remove('opacity-0');
            if (fallbackEl) {
              fallbackEl.classList.remove('opacity-35');
              fallbackEl.classList.add('opacity-0', 'hidden');
            }
          },
          true,
        );
      }

      if (item.glooSkinId) {
        const glooSkinId = item.glooSkinId;
        this.inspectorEl
          .querySelector('[data-action="preview-gloo-fx"]')
          ?.addEventListener('click', () => {
            this.callbacks.onPreviewGlooWall?.(glooSkinId);
            const viewport = this.inspectorEl.querySelector<HTMLElement>('[data-role="inspector-viewport"]');
            if (viewport && imgEl) {
              viewport.style.boxShadow = `inset 0 0 42px ${safeAccentHex}88, 0 0 24px ${safeAccentHex}55`;
              imgEl.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)';
              imgEl.style.transform = 'scale(0.86, 0.25) translateY(24%)';
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  imgEl.style.transform = 'scale(1.04, 1.04) translateY(0)';
                  window.setTimeout(() => {
                    imgEl.style.transform = 'scale(1, 1) translateY(0)';
                    viewport.style.boxShadow = '';
                  }, 320);
                });
              });
            }
          });
      }
    }

    if (item.avatarId) {
      this.inspectorEl
        .querySelector('[data-action="preview-avatar"]')
        ?.addEventListener('click', () => this.openAvatarPreview(item));
      this.inspectorEl
        .querySelector('[data-action="preview-avatar-btn"]')
        ?.addEventListener('click', () => this.openAvatarPreview(item));
    }

    if (item.bannerId) {
      this.inspectorEl
        .querySelector('[data-action="preview-banner"]')
        ?.addEventListener('click', () => this.openBannerPreview(item));
      this.inspectorEl
        .querySelector('[data-action="preview-banner-btn"]')
        ?.addEventListener('click', () => this.openBannerPreview(item));
    }

    this.inspectorEl.querySelector('[data-role="shop-action-btn"]')?.addEventListener('click', () => {
      void this.handlePurchaseOrEquip(item);
    });
  }

  private buildWheelAssignerHtml(item: ShopCatalogItem, isOwned: boolean): string {
    const wheel = this.shopSnapshot.equippedEmoteWheel ?? [];
    const slotButtons: string[] = [];
    for (let i = 0; i < EMOTE_WHEEL_SLOT_COUNT; i++) {
      const slotEmoteId = wheel[i] ?? null;
      const slotEmote = getEmoteById(slotEmoteId);
      const isThisItem = Boolean(slotEmote && slotEmote.id === item.emoteId);
      const slotName = slotEmote
        ? i18n.translateShopItem(slotEmote.shopItemId, slotEmote.name, slotEmote.description).name
        : i18n.t('emoteWheel.empty');

      slotButtons.push(`
        <div class="relative">
          <button
            type="button"
            data-wheel-assign="${i}"
            ${!isOwned ? 'disabled' : ''}
            class="w-full min-h-[42px] px-2 py-1.5 rounded border text-left flex items-center gap-1.5 transition-colors ${
              isThisItem
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100'
                : isOwned
                  ? 'bg-slate-900/90 border-slate-700 hover:border-sky-400 text-slate-200 cursor-pointer'
                  : 'bg-slate-900/60 border-slate-800 text-slate-500 cursor-not-allowed'
            }"
          >
            <span class="w-4 h-4 rounded bg-slate-950 border border-slate-700 text-[9px] font-black flex items-center justify-center shrink-0 tabular-nums">${i + 1}</span>
            <span class="w-4 h-4 shrink-0 flex items-center justify-center">${
              slotEmote ? getEmoteSvg(slotEmote.iconKind, slotEmote.accentHex) : '—'
            }</span>
            <span class="text-[10px] font-bold truncate flex-1">${slotName}</span>
          </button>
          ${
            slotEmote
              ? `<button
                   type="button"
                   data-wheel-clear="${i}"
                   aria-label="${i18n.t('common.remove')}"
                   title="${i18n.t('shop.emoteWheel.clearBtn')}"
                   class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 border border-slate-600 hover:border-rose-400 text-[10px] font-black text-slate-300 hover:text-rose-200 flex items-center justify-center"
                 >×</button>`
              : ''
          }
        </div>
      `);
    }

    return `
      <div class="pt-1 flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-extrabold uppercase tracking-wider text-orange-300">
            ${i18n.t('shop.emoteWheel.heading')}
          </span>
          <span class="text-[10px] text-slate-400">
            ${isOwned ? i18n.t('shop.emoteWheel.pickSlot') : i18n.t('shop.emoteWheel.buyToAssign')}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          ${slotButtons.join('')}
        </div>
      </div>
    `;
  }

  private clearGridSnapshotCancels(): void {
    for (const cancel of this.gridSnapshotCancels) {
      cancel();
    }
    this.gridSnapshotCancels.length = 0;
  }

  private renderGrid(): void {
    this.clearGridSnapshotCancels();
    this.gridEl.innerHTML = '';

    const items = this.getFilteredItems();
    this.countEl.textContent = i18n.t('shop.itemsCount', { count: items.length });

    for (const item of items) {
      const loc = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
      const safeName = escapeHtml(loc.name);
      const safeAccentHex = sanitizeAccentHex(item.accentHex, '#38bdf8');
      const isSelected = item.id === this.selectedOfferId;
      const state = this.getActionButtonState(item);
      const subLabel = escapeHtml(
        item.subCategory
          ? i18n.translateShopSubCategory(item.subCategory)
          : i18n.translateShopCategory(item.category),
      );

      const priceText =
        item.priceCredits === 0
          ? i18n.t('shop.free')
          : i18n.t('common.creditsShort', { amount: item.priceCredits.toLocaleString() });

      const card = document.createElement('article');
      card.dataset.offerId = item.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      card.className = `${
        isSelected
          ? 'bg-slate-900/95 border-orange-400 shadow-[0_0_0_1px_rgba(249,115,22,0.45)]'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
      } border rounded-lg overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400`;

      const cornerStateHtml = state.equipped
        ? `<span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/60 text-[10px] font-bold text-emerald-200">${i18n.t('common.equipped')}</span>`
        : state.owned
          ? `<span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/60 text-[10px] font-bold text-sky-200">${i18n.t('common.inVault')}</span>`
          : '';
      const glbBadgeHtml = item.glbAsset
        ? `<span class="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/85 border border-sky-400/50 text-[9px] font-black tracking-wider text-sky-200">3D GLB</span>`
        : '';

      const buyBtnClass = state.equipped
        ? state.baseDefault
          ? 'px-3 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 cursor-default'
          : 'nexus-btn-secondary px-3 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] border-amber-400/60 text-amber-200 hover:border-amber-300'
        : state.owned || state.canAfford
          ? 'nexus-btn-primary px-3.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px]'
          : 'nexus-btn-secondary px-3 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] border-rose-400/50 text-rose-200';

      const isDancePreviewing = Boolean(item.emoteId && this.previewingEmoteId === item.emoteId);
      const previewBtnHtml = item.emoteId
        ? `<button
             type="button"
             data-card-preview="${escapeHtml(item.emoteId)}"
             class="${
               isDancePreviewing
                 ? 'px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] bg-orange-500/25 border border-orange-400 text-orange-100'
                 : 'nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] border-sky-400/50 text-sky-200'
             }"
           >${isDancePreviewing ? i18n.t('shop.stopPreview') : i18n.t('shop.preview')}</button>`
        : item.avatarId
          ? `<button
               type="button"
               data-card-avatar-preview="${escapeHtml(item.id)}"
               class="nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] border-sky-400/50 text-sky-200"
             >${i18n.t('shop.preview')}</button>`
          : item.bannerId
            ? `<button
                 type="button"
                 data-card-banner-preview="${escapeHtml(item.id)}"
                 class="nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[38px] border-sky-400/50 text-sky-200"
               >${i18n.t('shop.preview')}</button>`
            : '';

      const isCardSvgCosmetic = Boolean(item.avatarId || item.bannerId);
      const cardViewportBody = item.avatarId
        ? hasAvatarImage(item.avatarId)
          ? getAvatarPreviewHtml(item.avatarId, 'w-full h-full transition-transform duration-300', 'cover')
          : `<div class="w-20 h-20 rounded-md overflow-hidden border shadow-md" style="border-color:${safeAccentHex}">${getAvatarSvg(item.avatarId, 'w-full h-full')}</div>`
        : item.bannerId
          ? hasBannerImage(item.bannerId)
            ? getBannerPreviewHtml(item.bannerId, 'w-full h-full transition-transform duration-300', 'cover')
            : `<div class="w-full h-full p-2.5 flex items-center justify-center"><div class="w-full aspect-[16/6] rounded overflow-hidden border shadow-md" style="border-color:${safeAccentHex}">${getBannerSvg(item.bannerId, 'w-full h-full')}</div></div>`
          : `<div data-card-fallback class="w-12 h-12 opacity-35 pointer-events-none flex items-center justify-center">
               ${this.getFallbackIconSvg(item)}
             </div>
             <img
               data-card-img
               src=""
               alt="${safeName}"
               referrerpolicy="no-referrer"
               class="absolute inset-0 w-full h-full object-contain p-2.5 opacity-0 transition-opacity duration-200"
             />`;

      card.innerHTML = `
        <div
          class="relative w-full aspect-[4/3] overflow-hidden border-b border-slate-800/90 flex items-center justify-center"
          style="background: radial-gradient(circle at 50% 48%, ${safeAccentHex}20 0%, rgba(15, 23, 42, 0.94) 70%, #020617 100%);"
        >
          ${cardViewportBody}
          ${glbBadgeHtml}
          ${cornerStateHtml}
        </div>

        <div class="p-3.5 flex flex-col justify-between gap-3 flex-1">
          <div class="flex flex-col gap-1 min-w-0">
            <div class="text-xs font-medium text-slate-400 truncate">
              ${escapeHtml(i18n.translateRarity(item.rarity))} · ${subLabel}
            </div>
            <h3 class="text-sm font-extrabold tracking-wide text-white truncate">${safeName}</h3>
          </div>

          <div class="pt-2.5 border-t border-slate-800/90 flex items-center justify-between gap-2">
            <span class="text-sm font-black text-amber-300 tabular-nums whitespace-nowrap">${escapeHtml(priceText)}</span>
            <div class="flex items-center gap-1.5 shrink-0">
              ${previewBtnHtml}
              <button
                type="button"
                data-card-buy
                ${state.disabled ? 'disabled' : ''}
                class="${buyBtnClass}"
              >${escapeHtml(state.cardLabel)}</button>
            </div>
          </div>
        </div>
      `;

      if (!isCardSvgCosmetic) {
        const imgEl = card.querySelector<HTMLImageElement>('[data-card-img]');
        const fallbackEl = card.querySelector<HTMLElement>('[data-card-fallback]');
        if (imgEl && item.glbAsset) {
          if (item.imageUrl) {
            let cancelled = false;
            this.gridSnapshotCancels.push(() => {
              cancelled = true;
            });
            void glbStoreClient.resolvePreviewObjectUrl(item.imageUrl).then((objUrl) => {
              if (cancelled || !objUrl) return;
              imgEl.src = objUrl;
              imgEl.classList.remove('opacity-0');
              if (fallbackEl) {
                fallbackEl.classList.remove('opacity-35');
                fallbackEl.classList.add('opacity-0', 'hidden');
              }
            });
          }
        } else if (imgEl) {
          const cancel = this.previewRenderer.requestShopItemSnapshot(
            item,
            this.activeCharacter,
            this.activeCustomization,
            (dataUrl) => {
              imgEl.src = dataUrl;
              imgEl.classList.remove('opacity-0');
              if (fallbackEl) {
                fallbackEl.classList.remove('opacity-35');
                fallbackEl.classList.add('opacity-0', 'hidden');
              }
            },
            isSelected,
          );
          this.gridSnapshotCancels.push(cancel);
        }
      }

      const selectCard = () => {
        this.selectedOfferId = item.id;
        this.feedback = null;
        this.renderInspector();
        this.updateGridSelection();
        this.callbacks.onSelectOffer(item);
      };

      card.addEventListener('click', selectCard);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCard();
        }
      });

      card.querySelector<HTMLButtonElement>('[data-card-preview]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDancePreview(item);
      });

      card.querySelector<HTMLButtonElement>('[data-card-avatar-preview]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAvatarPreview(item);
      });

      card.querySelector<HTMLButtonElement>('[data-card-banner-preview]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openBannerPreview(item);
      });

      card.querySelector<HTMLButtonElement>('[data-card-buy]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.handlePurchaseOrEquip(item);
      });

      this.gridEl.appendChild(card);
    }
  }

  private updateGridSelection(): void {
    const cards = this.gridEl.querySelectorAll<HTMLElement>('[data-offer-id]');
    for (const card of cards) {
      const selected = card.dataset.offerId === this.selectedOfferId;
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      card.className = `${
        selected
          ? 'bg-slate-900/95 border-orange-400 shadow-[0_0_0_1px_rgba(249,115,22,0.45)]'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
      } border rounded-lg overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400`;
    }
  }

  dispose(): void {
    this.avatarPreviewModal.dispose();
    this.bannerPreviewModal.dispose();
    this.stopEmotePreview(true);
    this.clearGridSnapshotCancels();
    this.inspectorSnapshotCancel?.();
    this.inspectorSnapshotCancel = null;
    this.clearEmotePreview();
    this.clearGlbInspectorPreview();
    this.glbImportPanel?.dispose();
    this.glbImportPanel = null;
    this.unsubI18n?.();
    this.unsubI18n = null;
  }
}
