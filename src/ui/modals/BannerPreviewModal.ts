import { i18n } from '../../i18n/I18nManager';
import type { ShopCatalogItem } from '../../shop/IShopSystem';
import { getAvatarSvg, getBannerPreviewHtml, getBannerSvg } from '../icons/AvatarBannerSvg';

export interface BannerPreviewModalState {
  item: ShopCatalogItem;
  equippedAvatarId: string;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  baseDefault: boolean;
  actionLabel: string;
  actionDisabled: boolean;
  priceDisplay: string;
  feedback?: { ok: boolean; text: string } | null;
}

export class BannerPreviewModal {
  readonly element: HTMLElement;
  private currentItem: ShopCatalogItem | null = null;
  private onActionClick: ((item: ShopCatalogItem) => void) | null = null;
  private readonly keydownHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.element = document.createElement('div');
    this.element.className =
      'hidden fixed inset-0 z-50 bg-slate-950/88 flex items-center justify-center safe-pad p-3 sm:p-5 pointer-events-auto';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !this.element.classList.contains('hidden')) {
        e.stopPropagation();
        this.close();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  open(state: BannerPreviewModalState, onAction: (item: ShopCatalogItem) => void): void {
    this.currentItem = state.item;
    this.onActionClick = onAction;
    this.render(state);
    this.element.classList.remove('hidden');
  }

  update(state: BannerPreviewModalState): void {
    if (!this.isOpen() || !this.currentItem || this.currentItem.id !== state.item.id) return;
    this.render(state);
  }

  close(): void {
    this.element.classList.add('hidden');
    this.currentItem = null;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    this.element.remove();
  }

  private escapeHtml(raw: string): string {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private render(state: BannerPreviewModalState): void {
    const { item } = state;
    if (!item.bannerId) return;

    const loc = i18n.translateShopItem(item.id, item.name, item.description, item.lootId);
    const rarityLabel = i18n.translateRarity(item.rarity);

    const statusBadge = state.equipped
      ? `<span class="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400/70 text-[11px] font-black uppercase tracking-wider text-emerald-200">${this.escapeHtml(i18n.t('common.equipped'))}</span>`
      : state.owned
        ? `<span class="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/70 text-[11px] font-black uppercase tracking-wider text-sky-200">${this.escapeHtml(i18n.t('common.inVault'))}</span>`
        : `<span class="px-2.5 py-1 rounded bg-amber-500/15 border border-amber-400/60 text-xs font-black tabular-nums text-amber-300">${this.escapeHtml(state.priceDisplay)}</span>`;

    const actionBtnClass = state.equipped
      ? state.baseDefault
        ? 'w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] bg-emerald-500/20 border border-emerald-400/70 text-emerald-200 cursor-default'
        : 'nexus-btn-secondary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-amber-400/65 text-amber-200 hover:border-amber-300'
      : state.owned || state.canAfford
        ? 'nexus-btn-primary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px]'
        : 'nexus-btn-secondary w-full py-2.5 px-4 rounded-md text-xs font-black tracking-wider uppercase min-h-[44px] border-rose-400/50 text-rose-200';

    const feedbackHtml = state.feedback
      ? `<div class="rounded-md px-3 py-2 text-xs font-semibold border ${
          state.feedback.ok
            ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
            : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
        }">${this.escapeHtml(state.feedback.text)}</div>`
      : '';

    this.element.innerHTML = `
      <div class="nexus-panel rounded-lg border border-slate-700 w-[min(860px,96vw)] max-h-[92dvh] overflow-y-auto nexus-scroll shadow-2xl flex flex-col">
        <div class="px-4 py-3 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-2 h-5 rounded-sm shrink-0" style="background:${item.accentHex}"></span>
            <div class="min-w-0">
              <div class="text-[10px] font-extrabold tracking-[0.16em] uppercase text-sky-300 truncate">
                ${this.escapeHtml(i18n.t('shop.bannerPreview.inspectTitle'))} · ${this.escapeHtml(rarityLabel)}
              </div>
              <h2 class="text-sm sm:text-base font-black tracking-wider uppercase text-white truncate">
                ${this.escapeHtml(loc.name)}
              </h2>
            </div>
          </div>
          <button
            type="button"
            data-action="close-banner-preview"
            class="nexus-btn-secondary px-3 py-1.5 rounded text-xs font-black tracking-wider uppercase min-h-[36px] shrink-0"
          >${this.escapeHtml(i18n.t('common.close'))}</button>
        </div>

        <div class="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 sm:gap-5 items-stretch">
          <!-- Full Uncropped Artwork Showcase -->
          <div
            class="relative rounded-lg overflow-hidden border-2 bg-slate-950 flex items-center justify-center min-h-[220px] sm:min-h-[300px] shadow-inner"
            style="border-color:${item.accentHex}; background: radial-gradient(circle at 50% 45%, ${item.accentHex}24 0%, rgba(15, 23, 42, 0.96) 72%, #020617 100%);"
          >
            ${getBannerPreviewHtml(item.bannerId, 'w-full h-full max-h-[380px]', 'contain')}
          </div>

          <!-- Context Previews & Purchase / Equip Controls -->
          <div class="flex flex-col justify-between gap-3.5 min-w-0">
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400">${this.escapeHtml(i18n.t('shop.price'))}</span>
                ${statusBadge}
              </div>

              <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(loc.desc)}</p>

              <!-- Live Calling Card & Lobby Badge Previews -->
              <div class="bg-slate-900/90 border border-slate-800 rounded-md p-3 flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    ${this.escapeHtml(i18n.t('shop.bannerPreview.profileHeader'))}
                  </span>
                  <div class="relative rounded-md overflow-hidden border border-slate-700 bg-slate-950">
                    <div class="relative h-20 w-full overflow-hidden">
                      ${getBannerSvg(item.bannerId, 'w-full h-full object-cover')}
                      <div
                        class="absolute inset-0 pointer-events-none"
                        style="background: linear-gradient(180deg, rgba(2,6,23,0.12) 0%, rgba(2,6,23,0.48) 65%, rgba(2,6,23,0.92) 100%);"
                      ></div>
                    </div>
                    <div class="px-3 pb-2.5 pt-1 flex items-end gap-2.5 -mt-7 relative z-10">
                      <span class="w-11 h-11 rounded-full overflow-hidden border-2 bg-slate-950 shadow-lg shrink-0" style="border-color:${item.accentHex}">
                        ${getAvatarSvg(state.equippedAvatarId, 'w-full h-full')}
                      </span>
                      <div class="min-w-0 flex-1 pb-0.5">
                        <div class="text-xs font-black tracking-wide text-white truncate">${this.escapeHtml(loc.name)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    ${this.escapeHtml(i18n.t('shop.bannerPreview.lobbyCard'))}
                  </span>
                  <div class="relative overflow-hidden rounded-md px-2.5 py-2 flex items-center gap-2.5 border border-orange-400/45 bg-slate-950">
                    <div class="absolute inset-0 opacity-55 pointer-events-none">
                      ${getBannerSvg(item.bannerId, 'w-full h-full object-cover')}
                    </div>
                    <div class="absolute inset-0 bg-slate-950/55 pointer-events-none"></div>
                    <div class="relative z-10 w-9 h-9 rounded-full bg-slate-950 border-2 border-sky-400/70 overflow-hidden shrink-0">
                      ${getAvatarSvg(state.equippedAvatarId, 'w-full h-full')}
                    </div>
                    <div class="relative z-10 min-w-0 flex-1 flex flex-col gap-1">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-[11px] font-black tracking-wider text-white truncate">${this.escapeHtml(loc.name)}</span>
                        <span class="px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-400/70 text-[9px] font-black text-orange-300 shrink-0">${this.escapeHtml(rarityLabel)}</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                        <div class="h-full rounded-full" style="width: 72%; background: linear-gradient(90deg, #38bdf8 0%, #f97316 100%);"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-2.5 pt-1">
              ${feedbackHtml}
              <button
                type="button"
                data-action="banner-preview-cta"
                ${state.actionDisabled ? 'disabled' : ''}
                class="${actionBtnClass}"
              >${this.escapeHtml(state.actionLabel)}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.element
      .querySelector('[data-action="close-banner-preview"]')
      ?.addEventListener('click', () => this.close());

    this.element
      .querySelector('[data-action="banner-preview-cta"]')
      ?.addEventListener('click', () => {
        if (this.currentItem && this.onActionClick) {
          this.onActionClick(this.currentItem);
        }
      });
  }
}
