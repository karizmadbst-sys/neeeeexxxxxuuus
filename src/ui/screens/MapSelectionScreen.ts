import type { LobbyGameMode } from '../../core/Types';
import { i18n } from '../../i18n/I18nManager';
import type { MapId } from '../../maps/IMapSystem';
import { MAP_LIST } from '../../maps/MapData';
import { getMapPreviewUrl } from '../../maps/MapPreviewAssets';

export interface MapSelectionCallbacks {
  onSelectMap: (mapId: MapId) => void;
  onBack: () => void;
}

export class MapSelectionScreen {
  readonly element: HTMLElement;

  private selectedMapId: MapId;
  private currentMode: LobbyGameMode = 'battle-royale';
  private readonly cards = new Map<MapId, HTMLElement>();
  private readonly actionBtns = new Map<MapId, HTMLButtonElement>();
  private readonly statusBadges = new Map<MapId, HTMLElement>();
  private readonly specLines = new Map<MapId, HTMLElement>();
  private readonly mapTitleEls = new Map<MapId, HTMLElement>();
  private readonly mapSubtitleEls = new Map<MapId, HTMLElement>();
  private readonly mapKmEls = new Map<MapId, HTMLElement>();
  private readonly activeNameEl: HTMLElement;
  private readonly activeBadgeLabelEl: HTMLElement;
  private readonly modeTitleEl: HTMLElement;
  private readonly headerTitleEl: HTMLElement;
  private readonly backBtnEl: HTMLButtonElement;
  private readonly footerEl: HTMLElement;
  private unsubI18n: (() => void) | null = null;

  constructor(
    initialMapId: MapId,
    private readonly callbacks: MapSelectionCallbacks,
  ) {
    this.selectedMapId = initialMapId;
    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-20 flex flex-col justify-between safe-pad pointer-events-none bg-slate-950/75';

    const cardsHtml = MAP_LIST.map((m) => {
      const previewUrl = getMapPreviewUrl(m.id);
      const radiusKm = ((m.radiusMeters * 2) / 1000).toFixed(1);
      const mapTitle = i18n.translateMapName(m.id);
      return `
        <article
          data-map-card="${m.id}"
          role="button"
          tabindex="0"
          class="group nexus-panel rounded-lg overflow-hidden flex flex-col cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-orange-400"
        >
          <div class="relative aspect-video w-full bg-slate-900 overflow-hidden shrink-0">
            <img
              src="${previewUrl}"
              alt="${mapTitle} combat map environment preview"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none"></div>
            <div class="absolute bottom-2 sm:bottom-3 left-2.5 sm:left-3.5 right-2.5 sm:right-3.5 flex items-end justify-between gap-2 pointer-events-none">
              <div>
                <div
                  data-role="map-status"
                  data-map-id="${m.id}"
                  class="text-[9px] sm:text-[10px] font-extrabold tracking-[0.18em] uppercase text-sky-300"
                >${i18n.t('mapSelect.available')}</div>
                <h2 data-role="map-title" data-map-id="${m.id}" class="text-base sm:text-xl lg:text-2xl font-black tracking-[0.14em] uppercase text-white leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  ${mapTitle}
                </h2>
              </div>
              <span data-role="map-km" data-map-id="${m.id}" class="text-[10px] sm:text-[11px] font-bold tabular-nums tracking-wider text-slate-200">
                ${i18n.t('mapSelect.kmBadge', { km: radiusKm })}
              </span>
            </div>
          </div>

          <div class="p-2.5 sm:p-4 flex-1 flex flex-col justify-between gap-2 sm:gap-3">
            <div class="flex flex-col gap-1">
              <p data-role="map-subtitle" data-map-id="${m.id}" class="text-[11px] sm:text-xs text-slate-300 leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none">
                ${i18n.translateMapSubtitle(m.id, m.subtitle)}
              </p>
              <div data-role="map-spec" data-map-id="${m.id}" class="text-[10px] sm:text-[11px] font-semibold tracking-wider text-slate-400 tabular-nums">
                ${i18n.t('mapSelect.metaBots', { count: m.buildings.length })}
              </div>
            </div>

            <button
              type="button"
              data-select-map="${m.id}"
              class="w-full py-1.5 sm:py-2.5 px-3 sm:px-4 rounded font-extrabold text-[11px] sm:text-xs tracking-[0.16em] uppercase min-h-[34px] sm:min-h-[42px] whitespace-nowrap transition-colors"
            >
              ${i18n.t('mapSelect.headerTitle')}
            </button>
          </div>
        </article>
      `;
    }).join('');

    this.element.innerHTML = `
      <header class="nr-studio-header pointer-events-auto w-full max-w-[1160px] mx-auto flex items-center justify-between gap-3 pb-1.5 sm:pb-2 shrink-0">
        <button
          type="button"
          data-action="back"
          class="nexus-btn-secondary px-3 sm:px-3.5 py-1.5 sm:py-2 rounded text-xs font-bold tracking-wider uppercase min-h-[34px] sm:min-h-[40px] whitespace-nowrap shrink-0"
        >← ${i18n.t('mapSelect.lobbyBack')}</button>

        <div class="text-center min-w-0">
          <div data-role="map-mode-title" class="text-[9px] sm:text-[10px] font-bold tracking-[0.2em] uppercase text-orange-400">${i18n.t('mapSelect.subBots')}</div>
          <h1 data-role="map-header-title" class="text-sm sm:text-2xl font-black tracking-[0.14em] uppercase text-white truncate">
            ${i18n.t('mapSelect.headerTitle')}
          </h1>
        </div>

        <div class="nexus-panel-subtle px-2.5 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-300 whitespace-nowrap shrink-0 hidden sm:flex items-center gap-2">
          <span data-role="active-badge-label" class="text-slate-400">${i18n.t('mapSelect.activeBadge')}:</span>
          <span data-role="active-map-name" class="text-orange-400 font-black">${i18n.translateMapName(initialMapId)}</span>
        </div>
      </header>

      <main class="pointer-events-auto flex-1 min-h-0 w-full max-w-[1160px] mx-auto overflow-y-auto nexus-scroll py-1 sm:py-2">
        <div class="min-h-full flex items-center">
          <div class="w-full grid grid-cols-1 min-[540px]:grid-cols-3 gap-2.5 sm:gap-4">
            ${cardsHtml}
          </div>
        </div>
      </main>

      <footer data-role="map-footer" class="w-full max-w-[1160px] mx-auto pt-1 sm:pt-2 text-center text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase text-slate-300 shrink-0 truncate">
        ${i18n.t('mapSelect.confirmFooter')}
      </footer>
    `;

    this.activeNameEl = this.element.querySelector('[data-role="active-map-name"]')!;
    this.activeBadgeLabelEl = this.element.querySelector('[data-role="active-badge-label"]')!;
    this.modeTitleEl = this.element.querySelector('[data-role="map-mode-title"]')!;
    this.headerTitleEl = this.element.querySelector('[data-role="map-header-title"]')!;
    this.backBtnEl = this.element.querySelector('[data-action="back"]')!;
    this.footerEl = this.element.querySelector('[data-role="map-footer"]')!;

    this.backBtnEl.addEventListener('click', () => {
      this.callbacks.onBack();
    });

    this.element.querySelectorAll<HTMLElement>('[data-map-card]').forEach((card) => {
      const id = card.dataset.mapCard as MapId;
      this.cards.set(id, card);
      card.addEventListener('click', () => {
        this.callbacks.onSelectMap(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.callbacks.onSelectMap(id);
        }
      });
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-select-map]').forEach((btn) => {
      const id = btn.dataset.selectMap as MapId;
      this.actionBtns.set(id, btn);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onSelectMap(id);
      });
    });

    this.element.querySelectorAll<HTMLElement>('[data-role="map-status"]').forEach((el) => {
      this.statusBadges.set(el.dataset.mapId as MapId, el);
    });

    this.element.querySelectorAll<HTMLElement>('[data-role="map-spec"]').forEach((el) => {
      this.specLines.set(el.dataset.mapId as MapId, el);
    });

    this.element.querySelectorAll<HTMLElement>('[data-role="map-title"]').forEach((el) => {
      this.mapTitleEls.set(el.dataset.mapId as MapId, el);
    });

    this.element.querySelectorAll<HTMLElement>('[data-role="map-subtitle"]').forEach((el) => {
      this.mapSubtitleEls.set(el.dataset.mapId as MapId, el);
    });

    this.element.querySelectorAll<HTMLElement>('[data-role="map-km"]').forEach((el) => {
      this.mapKmEls.set(el.dataset.mapId as MapId, el);
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocale();
    });

    this.setSelectedMap(initialMapId);
    this.setMode('battle-royale');
  }

  private refreshLocale(): void {
    this.backBtnEl.textContent = `← ${i18n.t('mapSelect.lobbyBack')}`;
    this.headerTitleEl.textContent = i18n.t('mapSelect.headerTitle');
    this.activeBadgeLabelEl.textContent = `${i18n.t('mapSelect.activeBadge')}:`;
    this.footerEl.textContent = i18n.t('mapSelect.confirmFooter');

    for (const m of MAP_LIST) {
      const radiusKm = ((m.radiusMeters * 2) / 1000).toFixed(1);
      const titleEl = this.mapTitleEls.get(m.id);
      if (titleEl) titleEl.textContent = i18n.translateMapName(m.id);
      const subEl = this.mapSubtitleEls.get(m.id);
      if (subEl) subEl.textContent = i18n.translateMapSubtitle(m.id, m.subtitle);
      const kmEl = this.mapKmEls.get(m.id);
      if (kmEl) kmEl.textContent = i18n.t('mapSelect.kmBadge', { km: radiusKm });
    }

    this.setMode(this.currentMode);
    this.setSelectedMap(this.selectedMapId);
  }

  setMode(mode: LobbyGameMode): void {
    this.currentMode = mode;
    if (mode === 'ranked') {
      this.modeTitleEl.textContent = i18n.t('mapSelect.subRanked');
      this.modeTitleEl.className = 'text-[10px] font-bold tracking-[0.2em] uppercase text-amber-300';
    } else if (mode === 'practice') {
      this.modeTitleEl.textContent = i18n.t('mapSelect.subPractice');
      this.modeTitleEl.className = 'text-[10px] font-bold tracking-[0.2em] uppercase text-emerald-300';
    } else {
      this.modeTitleEl.textContent = i18n.t('mapSelect.subBots');
      this.modeTitleEl.className = 'text-[10px] font-bold tracking-[0.2em] uppercase text-sky-300';
    }
    for (const m of MAP_LIST) {
      const specEl = this.specLines.get(m.id);
      if (specEl) {
        specEl.textContent =
          mode === 'ranked'
            ? i18n.t('mapSelect.metaReal', { count: m.buildings.length })
            : mode === 'practice'
              ? i18n.t('mapSelect.metaPractice', { count: m.buildings.length })
              : i18n.t('mapSelect.metaBots', { count: m.buildings.length });
      }
    }
  }

  setSelectedMap(mapId: MapId): void {
    this.selectedMapId = mapId;
    this.activeNameEl.textContent = i18n.translateMapName(mapId);

    for (const m of MAP_LIST) {
      const isSelected = m.id === this.selectedMapId;
      const card = this.cards.get(m.id);
      const btn = this.actionBtns.get(m.id);
      const status = this.statusBadges.get(m.id);

      if (card) {
        card.className = isSelected
          ? 'group nexus-panel rounded-lg overflow-hidden flex flex-col cursor-pointer transition-transform duration-150 border-2 border-orange-400 shadow-[0_0_28px_rgba(249,115,22,0.36)] focus-visible:outline-2 focus-visible:outline-orange-400'
          : 'group nexus-panel rounded-lg overflow-hidden flex flex-col cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 border border-slate-700/80 hover:border-sky-400/70 focus-visible:outline-2 focus-visible:outline-orange-400';
      }

      if (status) {
        status.textContent = isSelected
          ? i18n.t('mapSelect.selectedMap')
          : i18n.t('mapSelect.available');
        status.className = isSelected
          ? 'text-[10px] font-extrabold tracking-[0.18em] uppercase text-orange-400'
          : 'text-[10px] font-extrabold tracking-[0.18em] uppercase text-sky-300';
      }

      if (btn) {
        btn.textContent = isSelected
          ? i18n.t('mapSelect.selectedCheck')
          : i18n.t('mapSelect.headerTitle');
        btn.className = isSelected
          ? 'nexus-btn-primary w-full py-2.5 px-4 rounded font-extrabold text-xs tracking-[0.16em] uppercase min-h-[42px] whitespace-nowrap'
          : 'nexus-btn-secondary w-full py-2.5 px-4 rounded font-extrabold text-xs tracking-[0.16em] uppercase min-h-[42px] whitespace-nowrap';
      }
    }
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
  }
}
