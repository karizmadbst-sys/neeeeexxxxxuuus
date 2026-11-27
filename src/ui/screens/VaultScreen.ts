import type { CharacterDefinition } from '../../characters/CharacterData';
import type { CharacterPreviewRenderer } from '../../characters/CharacterPreviewRenderer';
import {
  EMOTE_WHEEL_SLOT_COUNT,
  getEmoteById,
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
  NEXUS_SHOP_CATALOG,
  type ShopActionResult,
  type ShopBrowseTab,
  type ShopCatalogItem,
  type ShopSnapshot,
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

export type VaultCategory =
  | 'characters'
  | 'clothing'
  | 'weapons'
  | 'avatars'
  | 'banners'
  | 'emotes'
  | 'gloo-walls'
  | 'gear';

type ClothingSubFilter =
  | 'all'
  | 'Outfits'
  | 'Shirts'
  | 'Pants'
  | 'Shoes'
  | 'Hats'
  | 'Glasses'
  | 'Masks'
  | 'Accessories';

type WeaponVaultSubFilter = 'all' | 'weapons' | 'weapon-skins';

export interface VaultScreenCallbacks {
  onSelectOffer: (item: ShopCatalogItem) => void;
  onEquipItem: (item: ShopCatalogItem) => ShopActionResult;
  onUnequipItem: (item: ShopCatalogItem) => ShopActionResult;
  onEquipEmoteSlot: (item: ShopCatalogItem, slotIndex: number) => ShopActionResult;
  onUnequipEmoteSlot: (slotIndex: number) => ShopActionResult;
  onPreviewEmote?: (emoteId: string) => void;
  onStopPreviewEmote?: () => void;
  onPreviewGlooWall?: (skinId: string) => void;
  onOpenShop: (tab: ShopBrowseTab) => void;
  onBack: () => void;
}

const VAULT_TABS: ReadonlyArray<{ id: VaultCategory; key: string; shopTab: ShopBrowseTab }> = [
  { id: 'characters', key: 'vault.tab.characters', shopTab: 'characters' },
  { id: 'clothing', key: 'vault.tab.clothing', shopTab: 'clothing' },
  { id: 'weapons', key: 'vault.tab.weapons', shopTab: 'weapon-skins' },
  { id: 'avatars', key: 'vault.tab.avatars', shopTab: 'avatars' },
  { id: 'banners', key: 'vault.tab.banners', shopTab: 'banners' },
  { id: 'emotes', key: 'vault.tab.emotes', shopTab: 'dances' },
  { id: 'gloo-walls', key: 'vault.tab.gloo-walls', shopTab: 'gloo-walls' },
  { id: 'gear', key: 'vault.tab.gear', shopTab: 'equipment' },
];

const CLOTHING_SUB_FILTERS: ReadonlyArray<{ id: ClothingSubFilter; key: string }> = [
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

const WEAPON_VAULT_SUB_FILTERS: ReadonlyArray<{ id: WeaponVaultSubFilter; key: string }> = [
  { id: 'all', key: 'shop.sub.allWeapons' },
  { id: 'weapons', key: 'shop.sub.weaponsOnly' },
  { id: 'weapon-skins', key: 'shop.sub.weaponSkinsOnly' },
];

function mapItemToVaultCategory(item: ShopCatalogItem): VaultCategory {
  switch (item.category) {
    case 'characters':
      return 'characters';
    case 'clothing':
    case 'outfits':
    case 'featured':
    case 'accessories':
      return 'clothing';
    case 'weapons':
    case 'weapon-skins':
      return 'weapons';
    case 'avatars':
      return 'avatars';
    case 'banners':
      return 'banners';
    case 'dances':
    case 'emotes':
      return 'emotes';
    case 'gloo-walls':
      return 'gloo-walls';
    case 'helmets':
    case 'armor':
    case 'equipment':
    case 'gliders':
    case 'tools':
      return 'gear';
  }
}

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

export class VaultScreen {
  readonly element: HTMLElement;
  private catalog: readonly ShopCatalogItem[] = NEXUS_SHOP_CATALOG;
  private activeCategory: VaultCategory = 'clothing';
  private activeClothingSub: ClothingSubFilter = 'all';
  private activeWeaponSub: WeaponVaultSubFilter = 'all';
  private selectedItemId: string | null = null;
  private shopSnapshot: ShopSnapshot;
  private activeCharacter: CharacterDefinition;
  private activeCustomization: R6Customization;
  private feedback: { ok: boolean; text: string } | null = null;

  private readonly headerTitleEl: HTMLElement;
  private readonly headerSubEl: HTMLElement;
  private readonly backBtnEl: HTMLButtonElement;
  private readonly shopShortcutBtnEl: HTMLButtonElement;
  private readonly ownedCountEl: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly subTabsEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly inspectorEl: HTMLElement;

  private readonly gridSnapshotCancels: Array<() => void> = [];
  private inspectorSnapshotCancel: (() => void) | null = null;
  private emotePreviewCanvas: EmotePreviewCanvas | null = null;
  private previewCanvasEmoteId: string | null = null;
  private previewCanvasContextKey = '';
  private glbInspectorPreview: GlbInteractivePreview | null = null;
  private glbPreviewModelKey = '';
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
    private readonly callbacks: VaultScreenCallbacks,
  ) {
    this.shopSnapshot = initialSnapshot;
    this.activeCharacter = initialCharacter;
    this.activeCustomization = { ...initialCustomization };

    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-20 flex flex-col safe-pad pointer-events-auto bg-slate-950/90 overflow-hidden';

    this.element.innerHTML = `
      <div class="w-full max-w-[1360px] mx-auto flex-1 min-h-0 flex flex-col gap-2 sm:gap-3">
        <!-- Header Bar -->
        <header class="nr-studio-header flex items-center justify-between gap-2 sm:gap-3 shrink-0 pb-1.5 sm:pb-2.5 border-b border-slate-800/90">
          <div class="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              data-action="back"
              class="nexus-btn-secondary px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-md text-xs font-bold tracking-wider uppercase min-h-[38px] sm:min-h-[42px] whitespace-nowrap shrink-0"
            >← ${i18n.t('common.back')}</button>
            <div class="min-w-0">
              <h1 data-role="vault-title" class="text-sm sm:text-xl font-black tracking-wider uppercase text-white truncate">
                ${i18n.t('vault.title')}
              </h1>
              <p data-role="vault-subtitle" class="hidden md:block text-xs text-slate-400 truncate">
                ${i18n.t('vault.subtitle')}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <div class="nexus-panel-subtle px-2.5 sm:px-3 py-1.5 rounded-md border border-sky-400/35 flex items-center gap-2 shrink-0">
              <span data-role="vault-owned-total" class="text-xs sm:text-sm font-black text-sky-300 tabular-nums whitespace-nowrap"></span>
            </div>
            <button
              type="button"
              data-action="open-shop"
              class="nexus-btn-primary px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-md text-xs font-black tracking-wider uppercase min-h-[38px] sm:min-h-[42px] whitespace-nowrap shrink-0"
            >${i18n.t('vault.openShopBtn')}</button>
          </div>
        </header>

        <!-- Category Tabs & Sub-Filters -->
        <div class="flex flex-col gap-1.5 sm:gap-2 shrink-0">
          <div class="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            <nav data-role="tabs" class="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5" aria-label="Vault Categories"></nav>
            <span data-role="item-count" class="text-[11px] sm:text-xs font-semibold text-slate-400 tabular-nums whitespace-nowrap shrink-0"></span>
          </div>
          <div data-role="sub-tabs" class="hidden flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5"></div>
        </div>

        <!-- Split Grid + Detail Inspector -->
        <div class="flex-1 min-h-0 nexus-scroll overflow-y-auto min-[540px]:overflow-hidden flex flex-col min-[540px]:flex-row gap-2.5 sm:gap-4">
          <section class="flex-1 min-w-0 min-[540px]:min-h-0 min-[540px]:nexus-scroll min-[540px]:overflow-y-auto min-[540px]:pr-1 order-2 min-[540px]:order-1">
            <div data-role="grid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-3.5 pb-4"></div>
          </section>

          <aside class="w-full min-[540px]:w-[240px] sm:w-[276px] lg:w-[350px] xl:w-[388px] shrink-0 order-1 min-[540px]:order-2 min-[540px]:min-h-0 min-[540px]:flex min-[540px]:flex-col">
            <div data-role="inspector" class="nexus-panel rounded-lg p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3.5 min-[540px]:max-h-full min-[540px]:nexus-scroll min-[540px]:overflow-y-auto"></div>
          </aside>
        </div>
      </div>
    `;

    this.headerTitleEl = this.element.querySelector('[data-role="vault-title"]')!;
    this.headerSubEl = this.element.querySelector('[data-role="vault-subtitle"]')!;
    this.backBtnEl = this.element.querySelector('[data-action="back"]')!;
    this.shopShortcutBtnEl = this.element.querySelector('[data-action="open-shop"]')!;
    this.ownedCountEl = this.element.querySelector('[data-role="vault-owned-total"]')!;
    this.tabsEl = this.element.querySelector('[data-role="tabs"]')!;
    this.subTabsEl = this.element.querySelector('[data-role="sub-tabs"]')!;
    this.countEl = this.element.querySelector('[data-role="item-count"]')!;
    this.gridEl = this.element.querySelector('[data-role="grid"]')!;
    this.inspectorEl = this.element.querySelector('[data-role="inspector"]')!;
    this.element.appendChild(this.avatarPreviewModal.element);
    this.element.appendChild(this.bannerPreviewModal.element);

    this.backBtnEl.addEventListener('click', () => {
      this.feedback = null;
      this.stopEmotePreview(true);
      this.callbacks.onBack();
    });

    this.shopShortcutBtnEl.addEventListener('click', () => {
      this.feedback = null;
      this.stopEmotePreview(true);
      const tabSpec = VAULT_TABS.find((t) => t.id === this.activeCategory);
      this.callbacks.onOpenShop(tabSpec?.shopTab ?? 'clothing');
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocale();
    });

    this.syncTotalOwnedCount();
    this.renderTabs();
  }

  private getOperatorContextKey(): string {
    const c = this.activeCustomization;
    return `${this.activeCharacter.id}|${c.skinId}|${c.hairStyleId}|${c.hairColorId}|${c.topId}|${c.pantsId}|${c.shoesId}|${c.hatId}|${c.glassesId}|${c.maskId}|${c.armorId}|${c.accessoryId}`;
  }

  setOperatorContext(character: CharacterDefinition, customization: R6Customization): void {
    this.activeCharacter = character;
    this.activeCustomization = { ...customization };
    if (this.hasOpened && this.element.style.display !== 'none') {
      this.renderInspector();
      this.renderGrid();
    }
  }

  setCatalog(items: readonly ShopCatalogItem[]): void {
    this.catalog = items.length > 0 ? items : NEXUS_SHOP_CATALOG;
    this.syncTotalOwnedCount();
    if (this.hasOpened && this.element.style.display !== 'none') {
      this.renderTabs();
      this.ensureSelectedInView();
      this.renderInspector();
      this.renderGrid();
    }
  }

  updateSnapshot(snapshot: ShopSnapshot): void {
    this.shopSnapshot = snapshot;
    this.syncTotalOwnedCount();
    if (this.hasOpened && this.element.style.display !== 'none') {
      this.renderTabs();
      this.ensureSelectedInView();
      this.renderInspector();
      this.renderGrid();
    }
  }

  openScreen(initialCategory?: VaultCategory): void {
    this.hasOpened = true;
    this.feedback = null;
    if (initialCategory) {
      this.activeCategory = initialCategory;
    }
    this.ensureSelectedInView();
    this.syncTotalOwnedCount();
    this.renderTabs();
    this.renderInspector();
    this.renderGrid();
  }

  closeScreen(): void {
    this.avatarPreviewModal.close();
    this.bannerPreviewModal.close();
    this.stopEmotePreview(true);
    this.clearEmotePreview();
    this.clearGlbInspectorPreview();
  }

  private refreshLocale(): void {
    this.headerTitleEl.textContent = i18n.t('vault.title');
    this.headerSubEl.textContent = i18n.t('vault.subtitle');
    this.backBtnEl.textContent = `← ${i18n.t('common.back')}`;
    this.shopShortcutBtnEl.textContent = i18n.t('vault.openShopBtn');
    this.feedback = null;
    this.syncTotalOwnedCount();
    this.renderTabs();
    if (this.hasOpened && this.element.style.display !== 'none') {
      this.renderInspector();
      this.renderGrid();
    }
  }

  private getOwnedItems(): ShopCatalogItem[] {
    return this.catalog.filter((item) => isShopItemOwned(this.shopSnapshot, item));
  }

  private syncTotalOwnedCount(): void {
    const ownedCount = this.getOwnedItems().length;
    this.ownedCountEl.textContent = i18n.t('vault.ownedCount', { count: ownedCount });
  }

  private getCategoryItems(category: VaultCategory): ShopCatalogItem[] {
    return this.getOwnedItems().filter((item) => mapItemToVaultCategory(item) === category);
  }

  private getFilteredItems(): ShopCatalogItem[] {
    const base = this.getCategoryItems(this.activeCategory);
    if (this.activeCategory === 'clothing' && this.activeClothingSub !== 'all') {
      return base.filter((item) => item.subCategory === this.activeClothingSub);
    }
    if (this.activeCategory === 'weapons' && this.activeWeaponSub !== 'all') {
      return base.filter((item) => item.category === this.activeWeaponSub);
    }
    return base;
  }

  private ensureSelectedInView(): void {
    const filtered = this.getFilteredItems();
    if (filtered.length === 0) {
      this.selectedItemId = null;
      return;
    }
    if (!this.selectedItemId || !filtered.some((i) => i.id === this.selectedItemId)) {
      const firstEquipped = filtered.find((i) =>
        isShopItemEquipped(this.shopSnapshot, this.activeCustomization, i),
      );
      this.selectedItemId = (firstEquipped ?? filtered[0]).id;
    }
  }

  private renderTabs(): void {
    this.tabsEl.innerHTML = '';
    for (const tab of VAULT_TABS) {
      const count = this.getCategoryItems(tab.id).length;
      const active = tab.id === this.activeCategory;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.vaultTab = tab.id;
      btn.className = `${
        active
          ? 'nexus-btn-primary'
          : 'nexus-btn-secondary text-slate-300'
      } px-3.5 py-2 rounded-md text-xs font-bold tracking-wider uppercase min-h-[42px] whitespace-nowrap shrink-0 flex items-center gap-1.5`;
      btn.innerHTML = `<span>${i18n.t(tab.key as Parameters<typeof i18n.t>[0])}</span><span class="text-[10px] font-black opacity-80 tabular-nums">(${count})</span>`;
      btn.addEventListener('click', () => {
        this.activeCategory = tab.id;
        this.feedback = null;
        if (tab.id !== 'clothing') this.activeClothingSub = 'all';
        if (tab.id !== 'weapons') this.activeWeaponSub = 'all';
        this.ensureSelectedInView();
        this.renderTabs();
        this.renderInspector();
        this.renderGrid();
      });
      this.tabsEl.appendChild(btn);
    }

    if (this.activeCategory === 'clothing') {
      this.subTabsEl.classList.remove('hidden');
      this.subTabsEl.innerHTML = '';
      for (const sub of CLOTHING_SUB_FILTERS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const active = sub.id === this.activeClothingSub;
        btn.className = `px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors min-h-[36px] border ${
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
    } else if (this.activeCategory === 'weapons') {
      this.subTabsEl.classList.remove('hidden');
      this.subTabsEl.innerHTML = '';
      for (const sub of WEAPON_VAULT_SUB_FILTERS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const active = sub.id === this.activeWeaponSub;
        btn.className = `px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors min-h-[36px] border ${
          active
            ? 'bg-orange-500/20 border-orange-400 text-orange-200'
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
    } else {
      this.subTabsEl.classList.add('hidden');
      this.subTabsEl.innerHTML = '';
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
      return emote ? getEmoteSvg(emote.iconKind, item.accentHex) : getEmoteWheelTriggerSvg();
    }
    if (item.glooSkinId) return getGlooWallSvg();
    if (item.weaponId) return getWeaponSvg(item.weaponId, item.accentHex);
    if (item.gliderColors) return getPlayDeploySvg();
    if (item.customizationPatch) return getCustomizeIconSvg();
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
    if (item.lootId?.startsWith('shield')) return getRankedShieldSvg();
    if (item.lootId?.startsWith('med')) return getHealthHudSvg();
    return getShopCrateSvg();
  }

  private handleEquipToggle(item: ShopCatalogItem): void {
    this.selectedItemId = item.id;
    const equipped = isShopItemEquipped(this.shopSnapshot, this.activeCustomization, item);
    if (equipped && isBaseDefaultItem(item)) {
      return;
    }
    const res = equipped
      ? this.callbacks.onUnequipItem(item)
      : this.callbacks.onEquipItem(item);
    this.feedback = { ok: res.ok, text: res.message };
    this.renderInspector();
    this.renderGrid();
    this.syncAvatarPreviewModal(item);
    this.syncBannerPreviewModal(item);
  }

  private buildAvatarModalState(item: ShopCatalogItem) {
    const equipped = isShopItemEquipped(this.shopSnapshot, this.activeCustomization, item);
    const baseDefault = isBaseDefaultItem(item);
    const actionLabel = equipped
      ? baseDefault
        ? i18n.t('shop.equippedCheck')
        : i18n.t('shop.unequipItem')
      : i18n.t('shop.equipItem');
    return {
      item,
      owned: true,
      equipped,
      canAfford: true,
      baseDefault,
      actionLabel,
      actionDisabled: equipped && baseDefault,
      priceDisplay: i18n.t('common.inVault'),
      feedback: this.feedback,
    };
  }

  private openAvatarPreview(item: ShopCatalogItem): void {
    if (!item.avatarId) return;
    if (this.selectedItemId !== item.id) {
      this.selectedItemId = item.id;
      this.feedback = null;
      this.renderInspector();
      this.updateGridSelection();
      this.callbacks.onSelectOffer(item);
    }
    this.avatarPreviewModal.open(this.buildAvatarModalState(item), (targetItem) => {
      this.handleEquipToggle(targetItem);
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
    if (this.selectedItemId !== item.id) {
      this.selectedItemId = item.id;
      this.feedback = null;
      this.renderInspector();
      this.updateGridSelection();
      this.callbacks.onSelectOffer(item);
    }
    this.bannerPreviewModal.open(this.buildBannerModalState(item), (targetItem) => {
      this.handleEquipToggle(targetItem);
    });
  }

  private syncBannerPreviewModal(item: ShopCatalogItem): void {
    if (!item.bannerId || !this.bannerPreviewModal.isOpen()) return;
    this.bannerPreviewModal.update(this.buildBannerModalState(item));
  }

  private startDancePreview(item: ShopCatalogItem): void {
    if (!item.emoteId) return;
    const emoteId = item.emoteId;

    if (this.selectedItemId !== item.id) {
      this.selectedItemId = item.id;
      this.feedback = null;
      this.renderInspector();
      this.updateGridSelection();
      this.callbacks.onSelectOffer(item);
    }

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
    const selectedItem = this.selectedItemId
      ? this.catalog.find((i) => i.id === this.selectedItemId)
      : undefined;
    const isSelectedPreviewing = Boolean(
      selectedItem?.emoteId && this.previewingEmoteId === selectedItem.emoteId,
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
          'w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] bg-orange-500/25 border border-orange-400 text-orange-100 hover:bg-orange-500/35 transition-colors tabular-nums';
      } else {
        toggleBtn.textContent = `▶ ${i18n.t('shop.preview')}`;
        toggleBtn.className =
          'nexus-btn-secondary w-full py-2 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-sky-400/60 text-sky-200 hover:border-sky-300';
      }
    }

    const vpOverlayBtn = this.inspectorEl.querySelector<HTMLButtonElement>('[data-action="replay-emote"]');
    if (vpOverlayBtn) {
      vpOverlayBtn.textContent = isSelectedPreviewing
        ? i18n.t('shop.stopPreview')
        : i18n.t('shop.preview');
    }

    this.gridEl.querySelectorAll<HTMLButtonElement>('[data-card-preview]').forEach((btn) => {
      const emoteId = btn.dataset.cardPreview;
      const active = Boolean(emoteId && this.previewingEmoteId === emoteId);
      btn.textContent = active ? i18n.t('shop.stopPreview') : i18n.t('shop.preview');
      btn.className = active
        ? 'px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] bg-orange-500/25 border border-orange-400 text-orange-100'
        : 'nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] border-sky-400/50 text-sky-200';
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

    const item = this.selectedItemId
      ? this.catalog.find((i) => i.id === this.selectedItemId)
      : undefined;

    if (!item) {
      this.stopEmotePreview(true);
      this.clearEmotePreview();
      this.clearGlbInspectorPreview();
      const tabSpec = VAULT_TABS.find((t) => t.id === this.activeCategory);
      this.inspectorEl.innerHTML = `
        <div class="flex flex-col items-center text-center gap-3 py-6 px-2">
          <div class="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-300">
            ${getBackpackSvg(3)}
          </div>
          <div class="text-sm font-black uppercase tracking-wider text-white">${i18n.t('vault.emptyTitle')}</div>
          <p class="text-xs text-slate-400 leading-relaxed">${i18n.t('vault.emptyDesc')}</p>
          <button
            type="button"
            data-action="empty-open-shop"
            class="nexus-btn-primary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px]"
          >${i18n.t('vault.openShopBtn')}</button>
        </div>
      `;
      this.inspectorEl.querySelector('[data-action="empty-open-shop"]')?.addEventListener('click', () => {
        this.callbacks.onOpenShop(tabSpec?.shopTab ?? 'clothing');
      });
      return;
    }

    if (this.previewingEmoteId && item.emoteId !== this.previewingEmoteId) {
      this.stopEmotePreview(true);
    }

    const loc = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
    const safeName = escapeHtml(loc.name);
    const safeDesc = escapeHtml(loc.desc);
    const safeAccentHex = sanitizeAccentHex(item.accentHex, '#38bdf8');
    const equipped = isShopItemEquipped(this.shopSnapshot, this.activeCustomization, item);
    const baseDefault = isBaseDefaultItem(item);
    const categoryLabel = i18n.translateShopCategory(item.category);
    const subLabel = item.subCategory ? i18n.translateShopSubCategory(item.subCategory) : '';
    const metaLine = escapeHtml(
      subLabel && subLabel !== categoryLabel
        ? `${i18n.translateRarity(item.rarity)} · ${categoryLabel} · ${subLabel}`
        : `${i18n.translateRarity(item.rarity)} · ${categoryLabel}`,
    );

    const isSvgCosmetic = Boolean(item.avatarId || item.bannerId);
    const isEmoteItem = Boolean(item.emoteId);
    const isGlbItem = Boolean(item.glbAsset);
    const isPreviewingThis = Boolean(item.emoteId && this.previewingEmoteId === item.emoteId);
    const wheelSlotsHtml = isEmoteItem ? this.buildWheelAssignerHtml(item) : '';

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

    const statusBadgeHtml = equipped
      ? `<span class="text-xs font-black uppercase tracking-wider text-emerald-300">${i18n.t('vault.status.equipped')}</span>`
      : `<span class="text-xs font-black uppercase tracking-wider text-sky-300">${i18n.t('vault.status.inVault')}</span>`;

    const actionDisabled = equipped && baseDefault;
    const actionLabel = equipped
      ? baseDefault
        ? i18n.t('shop.equippedCheck')
        : i18n.t('shop.unequipItem')
      : i18n.t('shop.equipItem');
    const actionClass = equipped
      ? baseDefault
        ? 'w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] bg-emerald-500/20 border border-emerald-400/70 text-emerald-200 cursor-default'
        : 'nexus-btn-secondary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-amber-400/65 text-amber-200 hover:border-amber-300'
      : 'nexus-btn-primary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px]';

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

    let viewportInnerHtml = '';
    if (isGlbItem) {
      viewportInnerHtml = `<div data-role="glb-inspector-mount" class="absolute inset-0 w-full h-full"></div>`;
    } else if (isEmoteItem) {
      viewportInnerHtml = `
        <div data-role="live-emote-mount" class="absolute inset-0 w-full h-full"></div>
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
        </div>`;
    } else if (item.avatarId) {
      viewportInnerHtml = hasAvatarImage(item.avatarId)
        ? `<div data-action="preview-avatar" class="w-full h-full cursor-pointer group relative overflow-hidden">
             ${getAvatarPreviewHtml(item.avatarId, 'w-full h-full transition-transform duration-300 group-hover:scale-[1.03]', 'cover')}
           </div>`
        : `<div data-action="preview-avatar" class="w-32 h-32 sm:w-40 sm:h-40 rounded-lg overflow-hidden border-2 shadow-xl cursor-pointer" style="border-color:${safeAccentHex}">${getAvatarSvg(item.avatarId, 'w-full h-full')}</div>`;
    } else if (item.bannerId) {
      viewportInnerHtml = hasBannerImage(item.bannerId)
        ? `<div data-action="preview-banner" class="w-full h-full cursor-pointer group relative overflow-hidden">
             ${getBannerPreviewHtml(item.bannerId, 'w-full h-full transition-transform duration-300 group-hover:scale-[1.03]', 'cover')}
           </div>`
        : `<div data-action="preview-banner" class="w-full h-full p-3 flex items-center justify-center cursor-pointer"><div class="w-full aspect-[16/6] rounded-md overflow-hidden border shadow-xl" style="border-color:${safeAccentHex}">${getBannerSvg(item.bannerId, 'w-full h-full')}</div></div>`;
    } else {
      viewportInnerHtml = `
        <div data-role="inspector-fallback" class="w-16 h-16 opacity-35 pointer-events-none flex items-center justify-center">
          ${this.getFallbackIconSvg(item)}
        </div>
        <img
          data-role="inspector-img"
          src=""
          alt="${safeName}"
          referrerpolicy="no-referrer"
          class="absolute inset-0 w-full h-full object-contain p-3 opacity-0 transition-opacity duration-200"
        />`;
    }

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
        <h2 class="text-lg font-black tracking-wide text-white leading-tight">${safeName}</h2>
        <p class="text-xs text-slate-300 leading-relaxed">${safeDesc}</p>
      </div>

      ${specsHtml}
      ${wheelSlotsHtml}

      <div class="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
        <span class="text-xs font-semibold text-slate-400">${i18n.t('vault.storedHint').split('.')[0]}</span>
        ${statusBadgeHtml}
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
                 data-role="vault-action-btn"
                 ${actionDisabled ? 'disabled' : ''}
                 class="${actionClass}"
               >${escapeHtml(actionLabel)}</button>
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
                   data-role="vault-action-btn"
                   ${actionDisabled ? 'disabled' : ''}
                   class="${actionClass}"
                 >${escapeHtml(actionLabel)}</button>
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
                     data-role="vault-action-btn"
                     ${actionDisabled ? 'disabled' : ''}
                     class="${actionClass}"
                   >${escapeHtml(actionLabel)}</button>
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
                       data-role="vault-action-btn"
                       ${actionDisabled ? 'disabled' : ''}
                       class="${actionClass}"
                     >${escapeHtml(actionLabel)}</button>
                   </div>`
                : `<button
                     type="button"
                     data-role="vault-action-btn"
                     ${actionDisabled ? 'disabled' : ''}
                     class="${actionClass}"
                   >${escapeHtml(actionLabel)}</button>`
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
      this.inspectorEl.querySelector('[data-action="replay-emote"]')?.addEventListener('click', () => {
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
        this.inspectorEl.querySelector('[data-action="preview-gloo-fx"]')?.addEventListener('click', () => {
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

    this.inspectorEl.querySelector('[data-role="vault-action-btn"]')?.addEventListener('click', () => {
      this.handleEquipToggle(item);
    });
  }

  private buildWheelAssignerHtml(item: ShopCatalogItem): string {
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
            class="w-full min-h-[42px] px-2 py-1.5 rounded border text-left flex items-center gap-1.5 transition-colors ${
              isThisItem
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100'
                : 'bg-slate-900/90 border-slate-700 hover:border-sky-400 text-slate-200 cursor-pointer'
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
            ${i18n.t('shop.emoteWheel.pickSlot')}
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

    if (items.length === 0) {
      const tabSpec = VAULT_TABS.find((t) => t.id === this.activeCategory);
      this.gridEl.innerHTML = `
        <div class="col-span-full nexus-panel-subtle border border-slate-800 rounded-lg p-6 sm:p-8 flex flex-col items-center text-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-sky-300">
            ${getShopCrateSvg()}
          </div>
          <h3 class="text-sm sm:text-base font-black uppercase tracking-wider text-white">${i18n.t('vault.emptyTitle')}</h3>
          <p class="text-xs text-slate-400 max-w-md">${i18n.t('vault.emptyDesc')}</p>
          <button
            type="button"
            data-action="grid-open-shop"
            class="nexus-btn-primary px-5 py-2.5 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px]"
          >${i18n.t('vault.openShopBtn')}</button>
        </div>
      `;
      this.gridEl.querySelector('[data-action="grid-open-shop"]')?.addEventListener('click', () => {
        this.callbacks.onOpenShop(tabSpec?.shopTab ?? 'clothing');
      });
      return;
    }

    for (const item of items) {
      const loc = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
      const safeName = escapeHtml(loc.name);
      const safeAccentHex = sanitizeAccentHex(item.accentHex, '#38bdf8');
      const isSelected = item.id === this.selectedItemId;
      const equipped = isShopItemEquipped(this.shopSnapshot, this.activeCustomization, item);
      const baseDefault = isBaseDefaultItem(item);
      const subLabel = escapeHtml(
        item.subCategory
          ? i18n.translateShopSubCategory(item.subCategory)
          : i18n.translateShopCategory(item.category),
      );

      const card = document.createElement('article');
      card.dataset.vaultItemId = item.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      card.className = `${
        isSelected
          ? 'bg-slate-900/95 border-orange-400 shadow-[0_0_0_1px_rgba(249,115,22,0.45)]'
          : equipped
            ? 'bg-slate-900/85 border-emerald-500/45 hover:border-emerald-400'
            : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
      } border rounded-lg overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400`;

      const cornerStateHtml = equipped
        ? `<span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/75 text-[10px] font-black text-emerald-200">${i18n.t('common.equipped')}</span>`
        : `<span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/60 text-[10px] font-bold text-sky-200">${i18n.t('common.inVault')}</span>`;
      const glbBadgeHtml = item.glbAsset
        ? `<span class="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/85 border border-sky-400/50 text-[9px] font-black tracking-wider text-sky-200">3D GLB</span>`
        : '';

      const actionBtnClass = equipped
        ? baseDefault
          ? 'px-3 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 cursor-default'
          : 'nexus-btn-secondary px-3 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] border-amber-400/60 text-amber-200 hover:border-amber-300'
        : 'nexus-btn-primary px-3.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px]';

      const actionBtnLabel = equipped
        ? baseDefault
          ? i18n.t('shop.equippedCheck')
          : i18n.t('shop.cardUnequip')
        : i18n.t('shop.equipItem');

      const isDancePreviewing = Boolean(item.emoteId && this.previewingEmoteId === item.emoteId);
      const previewBtnHtml = item.emoteId
        ? `<button
             type="button"
             data-card-preview="${escapeHtml(item.emoteId)}"
             class="${
               isDancePreviewing
                 ? 'px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] bg-orange-500/25 border border-orange-400 text-orange-100'
                 : 'nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] border-sky-400/50 text-sky-200'
             }"
           >${isDancePreviewing ? i18n.t('shop.stopPreview') : i18n.t('shop.preview')}</button>`
        : item.avatarId
          ? `<button
               type="button"
               data-card-avatar-preview="${escapeHtml(item.id)}"
               class="nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] border-sky-400/50 text-sky-200"
             >${i18n.t('shop.preview')}</button>`
          : item.bannerId
            ? `<button
                 type="button"
                 data-card-banner-preview="${escapeHtml(item.id)}"
                 class="nexus-btn-secondary px-2.5 py-2 rounded-md text-xs font-bold uppercase whitespace-nowrap shrink-0 min-h-[40px] border-sky-400/50 text-sky-200"
               >${i18n.t('shop.preview')}</button>`
            : '';

      const isSvgCosmetic = Boolean(item.avatarId || item.bannerId);
      const viewportBody = item.avatarId
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
          ${viewportBody}
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
            <span class="text-[11px] font-extrabold uppercase tracking-wider ${
              equipped ? 'text-emerald-300' : 'text-sky-300'
            }">${equipped ? i18n.t('vault.status.equipped') : i18n.t('common.inVault')}</span>
            <div class="flex items-center gap-1.5 shrink-0">
              ${previewBtnHtml}
              <button
                type="button"
                data-card-equip
                ${equipped && baseDefault ? 'disabled' : ''}
                class="${actionBtnClass}"
              >${escapeHtml(actionBtnLabel)}</button>
            </div>
          </div>
        </div>
      `;

      if (!isSvgCosmetic) {
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
        this.selectedItemId = item.id;
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

      card.querySelector<HTMLButtonElement>('[data-card-equip]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleEquipToggle(item);
      });

      this.gridEl.appendChild(card);
    }
  }

  private updateGridSelection(): void {
    const cards = this.gridEl.querySelectorAll<HTMLElement>('[data-vault-item-id]');
    for (const card of cards) {
      const id = card.dataset.vaultItemId;
      const selected = id === this.selectedItemId;
      const item = id ? this.catalog.find((i) => i.id === id) : undefined;
      const equipped = item
        ? isShopItemEquipped(this.shopSnapshot, this.activeCustomization, item)
        : false;
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      card.className = `${
        selected
          ? 'bg-slate-900/95 border-orange-400 shadow-[0_0_0_1px_rgba(249,115,22,0.45)]'
          : equipped
            ? 'bg-slate-900/85 border-emerald-500/45 hover:border-emerald-400'
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
    this.unsubI18n?.();
    this.unsubI18n = null;
  }
}
