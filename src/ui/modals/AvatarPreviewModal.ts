import { i18n } from '../../i18n/I18nManager';
import type { ShopCatalogItem } from '../../shop/IShopSystem';
import { getAvatarPreviewHtml, getAvatarSvg } from '../icons/AvatarBannerSvg';

export interface AvatarPreviewModalState {
  item: ShopCatalogItem;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  baseDefault: boolean;
  actionLabel: string;
  actionDisabled: boolean;
  priceDisplay: string;
  feedback?: { ok: boolean; text: string } | null;
}

export class AvatarPreviewModal {
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

  open(state: AvatarPreviewModalState, onAction: (item: ShopCatalogItem) => void): void {
    this.currentItem = state.item;
    this.onActionClick = onAction;
    this.render(state);
    this.element.classList.remove('hidden');
  }

  update(state: AvatarPreviewModalState): void {
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

  private render(state: AvatarPreviewModalState): void {
    const { item } = state;
    if (!item.avatarId) return;

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
      <div class="nexus-panel rounded-lg border border-slate-700 w-[min(760px,96vw)] max-h-[92dvh] overflow-y-auto nexus-scroll shadow-2xl flex flex-col">
        <div class="px-4 py-3 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-2 h-5 rounded-sm shrink-0" style="background:${item.accentHex}"></span>
            <div class="min-w-0">
              <div class="text-[10px] font-extrabold tracking-[0.16em] uppercase text-sky-300 truncate">
                ${this.escapeHtml(i18n.t('shop.avatarPreview.inspectTitle'))} · ${this.escapeHtml(rarityLabel)}
              </div>
              <h2 class="text-sm sm:text-base font-black tracking-wider uppercase text-white truncate">
                ${this.escapeHtml(loc.name)}
              </h2>
            </div>
          </div>
          <button
            type="button"
            data-action="close-avatar-preview"
            class="nexus-btn-secondary px-3 py-1.5 rounded text-xs font-black tracking-wider uppercase min-h-[36px] shrink-0"
          >${this.escapeHtml(i18n.t('common.close'))}</button>
        </div>

        <div class="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 sm:gap-5 items-stretch">
          <!-- Full Uncropped Artwork Showcase -->
          <div
            class="relative rounded-lg overflow-hidden border-2 bg-slate-950 flex items-center justify-center min-h-[260px] sm:min-h-[340px] shadow-inner"
            style="border-color:${item.accentHex}; background: radial-gradient(circle at 50% 45%, ${item.accentHex}24 0%, rgba(15, 23, 42, 0.96) 72%, #020617 100%);"
          >
            ${getAvatarPreviewHtml(item.avatarId, 'w-full h-full max-h-[390px]', 'contain')}
          </div>

          <!-- Context Previews & Purchase / Equip Controls -->
          <div class="flex flex-col justify-between gap-3.5 min-w-0">
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400">${this.escapeHtml(i18n.t('shop.price'))}</span>
                ${statusBadge}
              </div>

              <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(loc.desc)}</p>

              <!-- Live Lobby & Gameplay HUD Previews -->
              <div class="bg-slate-900/90 border border-slate-800 rounded-md p-3 flex flex-col gap-2.5">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    ${this.escapeHtml(i18n.t('shop.avatarPreview.lobbyBadge'))}
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="w-11 h-11 rounded-md overflow-hidden border-2 shadow shrink-0" style="border-color:${item.accentHex}">
                      ${getAvatarSvg(item.avatarId, 'w-full h-full')}
                    </span>
                    <span class="w-9 h-9 rounded-full overflow-hidden border-2 shadow shrink-0" style="border-color:${item.accentHex}">
                      ${getAvatarSvg(item.avatarId, 'w-full h-full')}
                    </span>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    ${this.escapeHtml(i18n.t('shop.avatarPreview.hudBadge'))}
                  </span>
                  <div class="w-full rounded-sm bg-slate-950/90 border border-white/20 px-2 py-1.5 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-sm overflow-hidden border shrink-0" style="border-color:${item.accentHex}">
                      ${getAvatarSvg(item.avatarId, 'w-full h-full')}
                    </span>
                    <div class="flex-1 min-w-0 flex flex-col gap-1">
                      <div class="flex items-center justify-between text-[10px] font-black text-white leading-none">
                        <span class="truncate">${this.escapeHtml(loc.name)}</span>
                        <span class="tabular-nums text-emerald-300">200 / 200</span>
                      </div>
                      <div class="w-full h-1.5 rounded-[2px] bg-slate-900 border border-white/15 overflow-hidden">
                        <div class="h-full bg-white" style="width: 100%"></div>
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
                data-action="avatar-preview-cta"
                ${state.actionDisabled ? 'disabled' : ''}
                class="${actionBtnClass}"
              >${this.escapeHtml(state.actionLabel)}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.element
      .querySelector('[data-action="close-avatar-preview"]')
      ?.addEventListener('click', () => this.close());

    this.element
      .querySelector('[data-action="avatar-preview-cta"]')
      ?.addEventListener('click', () => {
        if (this.currentItem && this.onActionClick) {
          this.onActionClick(this.currentItem);
        }
      });
  }
}
