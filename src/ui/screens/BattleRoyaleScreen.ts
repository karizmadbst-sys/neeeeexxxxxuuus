import type { BattleRoyaleMatchConfig, LobbyDifficultySetting } from '../../battleroyale/BattleRoyaleTypes';
import { i18n } from '../../i18n/I18nManager';
import type { TranslationKey } from '../../i18n/translations';
import type { MapId } from '../../maps/IMapSystem';
import { MAP_LIST } from '../../maps/MapData';

export interface BattleRoyaleScreenCallbacks {
  onLaunchMatch: (config: BattleRoyaleMatchConfig) => void;
  onSelectMap: (mapId: MapId) => void;
  onConfigChange?: (config: BattleRoyaleMatchConfig) => void;
  onBack: () => void;
}

const DIFFICULTY_IDS: readonly LobbyDifficultySetting[] = [
  'recruit',
  'tactical',
  'veteran',
  'mixed',
];

const BOT_COUNTS: readonly number[] = [12, 24, 36, 50];

export class BattleRoyaleScreen {
  readonly element: HTMLElement;

  private selectedMapId: MapId;
  private selectedDifficulty: LobbyDifficultySetting = 'mixed';
  private selectedBotCount = 50;

  private readonly mapBtns: HTMLButtonElement[] = [];
  private readonly diffBtns: HTMLButtonElement[] = [];
  private readonly countBtns: HTMLButtonElement[] = [];
  private readonly diffSummaryEl: HTMLElement;
  private readonly totalFightersEl: HTMLElement;
  private readonly backBtnEl: HTMLButtonElement;
  private readonly badgeEl: HTMLElement;
  private readonly heroSubEl: HTMLElement;
  private readonly heroTitleEl: HTMLElement;
  private readonly fightersLabelEl: HTMLElement;
  private readonly mapTitleEl: HTMLElement;
  private readonly skillTitleEl: HTMLElement;
  private readonly lobbySizeTitleEl: HTMLElement;
  private readonly sumAirdropLabelEl: HTMLElement;
  private readonly sumAirdropValEl: HTMLElement;
  private readonly sumTacticsLabelEl: HTMLElement;
  private readonly sumTacticsValEl: HTMLElement;
  private readonly sumVictoryLabelEl: HTMLElement;
  private readonly sumVictoryValEl: HTMLElement;
  private readonly dropCtaLabelEl: HTMLElement;
  private readonly deployBtnLabelEl: HTMLElement;
  private readonly footerEl: HTMLElement;
  private unsubI18n: (() => void) | null = null;

  constructor(
    initialMapId: MapId,
    private readonly callbacks: BattleRoyaleScreenCallbacks,
  ) {
    this.selectedMapId = initialMapId;
    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-20 flex flex-col justify-between safe-pad pointer-events-none';

    const mapHtml = MAP_LIST.map(
      (m) => `
        <button
          type="button"
          data-br-map="${m.id}"
          class="flex-1 py-2 px-2.5 rounded text-xs font-extrabold tracking-wider uppercase border transition-colors min-h-[40px]"
        >${i18n.translateMapName(m.id)}</button>
      `,
    ).join('');

    const diffHtml = DIFFICULTY_IDS.map(
      (id) => `
        <button
          type="button"
          data-br-diff="${id}"
          class="flex-1 py-2 px-2 rounded text-[11px] font-extrabold tracking-wider uppercase border transition-colors min-h-[40px]"
        >${i18n.translateDifficulty(id)}</button>
      `,
    ).join('');

    const countHtml = BOT_COUNTS.map(
      (c) => `
        <button
          type="button"
          data-br-count="${c}"
          class="flex-1 py-2 px-2 rounded text-xs font-black tabular-nums tracking-wider uppercase border transition-colors min-h-[40px]"
        >${i18n.t('br.botsCountOption', { count: c })}</button>
      `,
    ).join('');

    this.element.innerHTML = `
      <header class="nr-studio-header flex items-center justify-between gap-3 w-full shrink-0 pb-1">
        <button
          type="button"
          data-action="back"
          class="pointer-events-auto nexus-btn-secondary px-3 sm:px-3.5 py-1.5 sm:py-2 rounded text-xs font-bold tracking-wider uppercase min-h-[34px] sm:min-h-[40px]"
        >← ${i18n.t('common.back')}</button>

        <div data-role="br-badge" class="pointer-events-auto nexus-panel-subtle px-2.5 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-extrabold tracking-widest uppercase text-sky-300">
          ${i18n.t('br.badge')}
        </div>
      </header>

      <main class="w-full flex-1 min-h-0 overflow-y-auto nexus-scroll py-1 pointer-events-auto">
        <div class="min-h-full flex items-center justify-center">
          <div class="nexus-panel w-full max-w-[520px] sm:max-w-[460px] rounded p-3 sm:p-5 flex flex-col gap-2.5 sm:gap-4">
            <div class="border-b border-slate-800 pb-2 sm:pb-3 flex items-center justify-between gap-2">
              <div>
                <div data-role="br-hero-sub" class="text-[9px] sm:text-[10px] font-bold tracking-[0.2em] uppercase text-orange-400">${i18n.t('br.heroSub')}</div>
                <h2 data-role="br-hero-title" class="text-lg sm:text-2xl font-black tracking-[0.12em] uppercase text-white mt-0.5">${i18n.t('menu.mode.br')}</h2>
              </div>
              <div class="text-right">
                <div data-role="br-fighters-label" class="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-slate-400">${i18n.t('br.fighters')}</div>
                <div data-role="br-total" class="text-base sm:text-lg font-black tabular-nums text-emerald-300">51</div>
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <div data-role="br-map-title" class="text-[10px] font-bold tracking-widest uppercase text-slate-400">${i18n.t('br.mapTitle')}</div>
              <div class="flex gap-1.5">${mapHtml}</div>
            </div>

            <div class="flex flex-col gap-1">
              <div data-role="br-skill-title" class="text-[10px] font-bold tracking-widest uppercase text-slate-400">${i18n.t('br.aiSkillTitle')}</div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">${diffHtml}</div>
              <p data-role="br-diff-summary" class="text-[11px] text-slate-300 leading-snug"></p>
            </div>

            <div class="flex flex-col gap-1">
              <div data-role="br-size-title" class="text-[10px] font-bold tracking-widest uppercase text-slate-400">${i18n.t('br.lobbySize')}</div>
              <div class="grid grid-cols-4 gap-1.5">${countHtml}</div>
            </div>

            <div class="nexus-panel-subtle rounded p-2 sm:p-2.5 text-[10px] sm:text-[11px] text-slate-300 grid grid-cols-3 gap-2 text-center">
              <div>
                <div data-role="br-sum-airdrop" class="text-[9px] font-bold text-slate-400 uppercase">${i18n.t('br.sum.airdrop')}</div>
                <div data-role="br-sum-airdrop-val" class="font-bold text-white mt-0.5">${i18n.t('br.sum.airdropVal')}</div>
              </div>
              <div>
                <div data-role="br-sum-tactics" class="text-[9px] font-bold text-slate-400 uppercase">${i18n.t('br.sum.aiTactics')}</div>
                <div data-role="br-sum-tactics-val" class="font-bold text-sky-300 mt-0.5">${i18n.t('br.sum.aiTacticsVal')}</div>
              </div>
              <div>
                <div data-role="br-sum-victory" class="text-[9px] font-bold text-slate-400 uppercase">${i18n.t('br.sum.victory')}</div>
                <div data-role="br-sum-victory-val" class="font-bold text-orange-300 mt-0.5">${i18n.t('br.sum.victoryVal')}</div>
              </div>
            </div>

            <button
              type="button"
              data-action="launch"
              class="nexus-btn-primary w-full py-2.5 sm:py-3.5 px-4 sm:px-5 rounded font-black text-xs sm:text-sm tracking-[0.18em] uppercase flex items-center justify-between min-h-[42px] sm:min-h-[48px]"
            >
              <span data-role="br-drop-cta">${i18n.t('br.dropCta')}</span>
              <span data-role="br-deploy-btn">${i18n.t('br.deployBtn')} →</span>
            </button>
          </div>
        </div>
      </main>

      <footer data-role="br-footer" class="text-center text-[9px] sm:text-[10px] font-semibold tracking-widest uppercase text-slate-400 shrink-0 pt-1 truncate">
        ${i18n.t('br.footerRule')}
      </footer>
    `;

    this.diffSummaryEl = this.element.querySelector('[data-role="br-diff-summary"]')!;
    this.totalFightersEl = this.element.querySelector('[data-role="br-total"]')!;
    this.backBtnEl = this.element.querySelector('[data-action="back"]')!;
    this.badgeEl = this.element.querySelector('[data-role="br-badge"]')!;
    this.heroSubEl = this.element.querySelector('[data-role="br-hero-sub"]')!;
    this.heroTitleEl = this.element.querySelector('[data-role="br-hero-title"]')!;
    this.fightersLabelEl = this.element.querySelector('[data-role="br-fighters-label"]')!;
    this.mapTitleEl = this.element.querySelector('[data-role="br-map-title"]')!;
    this.skillTitleEl = this.element.querySelector('[data-role="br-skill-title"]')!;
    this.lobbySizeTitleEl = this.element.querySelector('[data-role="br-size-title"]')!;
    this.sumAirdropLabelEl = this.element.querySelector('[data-role="br-sum-airdrop"]')!;
    this.sumAirdropValEl = this.element.querySelector('[data-role="br-sum-airdrop-val"]')!;
    this.sumTacticsLabelEl = this.element.querySelector('[data-role="br-sum-tactics"]')!;
    this.sumTacticsValEl = this.element.querySelector('[data-role="br-sum-tactics-val"]')!;
    this.sumVictoryLabelEl = this.element.querySelector('[data-role="br-sum-victory"]')!;
    this.sumVictoryValEl = this.element.querySelector('[data-role="br-sum-victory-val"]')!;
    this.dropCtaLabelEl = this.element.querySelector('[data-role="br-drop-cta"]')!;
    this.deployBtnLabelEl = this.element.querySelector('[data-role="br-deploy-btn"]')!;
    this.footerEl = this.element.querySelector('[data-role="br-footer"]')!;

    this.backBtnEl.addEventListener('click', () => {
      this.callbacks.onBack();
    });
    this.element.querySelector('[data-action="launch"]')?.addEventListener('click', () => {
      this.callbacks.onLaunchMatch(this.getConfig());
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-br-map]').forEach((btn) => {
      this.mapBtns.push(btn);
      btn.addEventListener('click', () => {
        const id = btn.dataset.brMap as MapId;
        this.setSelectedMap(id);
        this.callbacks.onSelectMap(id);
        this.callbacks.onConfigChange?.(this.getConfig());
      });
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-br-diff]').forEach((btn) => {
      this.diffBtns.push(btn);
      btn.addEventListener('click', () => {
        this.setSelectedDifficulty(btn.dataset.brDiff as LobbyDifficultySetting);
        this.callbacks.onConfigChange?.(this.getConfig());
      });
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-br-count]').forEach((btn) => {
      this.countBtns.push(btn);
      btn.addEventListener('click', () => {
        this.setSelectedBotCount(Number(btn.dataset.brCount) || 50);
        this.callbacks.onConfigChange?.(this.getConfig());
      });
    });

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocale();
    });

    this.setSelectedMap(initialMapId);
    this.setSelectedDifficulty(this.selectedDifficulty);
    this.setSelectedBotCount(this.selectedBotCount);
  }

  private refreshLocale(): void {
    this.backBtnEl.textContent = `← ${i18n.t('common.back')}`;
    this.badgeEl.textContent = i18n.t('br.badge');
    this.heroSubEl.textContent = i18n.t('br.heroSub');
    this.heroTitleEl.textContent = i18n.t('menu.mode.br');
    this.fightersLabelEl.textContent = i18n.t('br.fighters');
    this.mapTitleEl.textContent = i18n.t('br.mapTitle');
    this.skillTitleEl.textContent = i18n.t('br.aiSkillTitle');
    this.lobbySizeTitleEl.textContent = i18n.t('br.lobbySize');
    this.sumAirdropLabelEl.textContent = i18n.t('br.sum.airdrop');
    this.sumAirdropValEl.textContent = i18n.t('br.sum.airdropVal');
    this.sumTacticsLabelEl.textContent = i18n.t('br.sum.aiTactics');
    this.sumTacticsValEl.textContent = i18n.t('br.sum.aiTacticsVal');
    this.sumVictoryLabelEl.textContent = i18n.t('br.sum.victory');
    this.sumVictoryValEl.textContent = i18n.t('br.sum.victoryVal');
    this.dropCtaLabelEl.textContent = i18n.t('br.dropCta');
    this.deployBtnLabelEl.textContent = `${i18n.t('br.deployBtn')} →`;
    this.footerEl.textContent = i18n.t('br.footerRule');

    for (const btn of this.mapBtns) {
      btn.textContent = i18n.translateMapName(btn.dataset.brMap ?? '');
    }
    for (const btn of this.diffBtns) {
      const diff = btn.dataset.brDiff as LobbyDifficultySetting;
      btn.textContent = i18n.translateDifficulty(diff);
    }
    for (const btn of this.countBtns) {
      const count = Number(btn.dataset.brCount) || 50;
      btn.textContent = i18n.t('br.botsCountOption', { count });
    }
    this.diffSummaryEl.textContent = i18n.t(
      `br.diff.${this.selectedDifficulty}Desc` as TranslationKey,
    );
  }

  getConfig(): BattleRoyaleMatchConfig {
    return {
      mapId: this.selectedMapId,
      botCount: this.selectedBotCount,
      difficulty: this.selectedDifficulty,
    };
  }

  setSelectedMap(mapId: MapId): void {
    this.selectedMapId = mapId;
    for (const btn of this.mapBtns) {
      const active = btn.dataset.brMap === mapId;
      btn.className = active
        ? 'flex-1 py-2 px-2.5 rounded text-xs font-extrabold tracking-wider uppercase border border-orange-400 bg-orange-500/20 text-orange-300 transition-colors min-h-[40px]'
        : 'flex-1 py-2 px-2.5 rounded text-xs font-bold tracking-wider uppercase border border-slate-700 bg-slate-900/75 text-slate-300 hover:border-sky-400/60 transition-colors min-h-[40px]';
    }
  }

  private setSelectedDifficulty(diff: LobbyDifficultySetting): void {
    this.selectedDifficulty = diff;
    for (const btn of this.diffBtns) {
      const active = btn.dataset.brDiff === diff;
      btn.className = active
        ? 'flex-1 py-2 px-2 rounded text-[11px] font-extrabold tracking-wider uppercase border border-sky-400 bg-sky-500/20 text-sky-200 transition-colors min-h-[40px]'
        : 'flex-1 py-2 px-2 rounded text-[11px] font-bold tracking-wider uppercase border border-slate-700 bg-slate-900/75 text-slate-300 hover:border-sky-400/50 transition-colors min-h-[40px]';
    }
    this.diffSummaryEl.textContent = i18n.t(`br.diff.${diff}Desc` as TranslationKey);
  }

  private setSelectedBotCount(count: number): void {
    this.selectedBotCount = count;
    for (const btn of this.countBtns) {
      const active = Number(btn.dataset.brCount) === count;
      btn.className = active
        ? 'flex-1 py-2 px-2 rounded text-xs font-black tabular-nums tracking-wider uppercase border border-emerald-400 bg-emerald-500/20 text-emerald-200 transition-colors min-h-[40px]'
        : 'flex-1 py-2 px-2 rounded text-xs font-bold tabular-nums tracking-wider uppercase border border-slate-700 bg-slate-900/75 text-slate-300 hover:border-emerald-400/50 transition-colors min-h-[40px]';
    }
    this.totalFightersEl.textContent = String(count + 1);
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
  }
}
