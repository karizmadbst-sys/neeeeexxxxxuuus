import type { NetworkConnectionState } from '../../multiplayer/INetworkClient';
import { i18n } from '../../i18n/I18nManager';
import {
  getNextRankProgress,
  getRankTierSpec,
  type LeaderboardEntry,
  type LobbySnapshot,
  type RankedMapId,
  type RankedProfile,
  type ServerOnlineStatus,
} from '../../ranked/RankedTypes';

import { getGenderIconSvg } from '../icons/GameIcons';

export interface RankedScreenCallbacks {
  onBack: () => void;
  onRename: (newName: string) => Promise<void>;
  onFindMatch: (preferredMap: RankedMapId | 'any') => void;
  onCancelQueue: () => void;
  onToggleReady: (ready: boolean) => void;
  onVoteMap: (mapId: RankedMapId) => void;
  onLeaveLobby: () => void;
  onRefreshLeaderboard: () => Promise<void>;
  onRefreshProfile: () => Promise<void>;
  onInspectPlayer?: (idOrNumericId: string) => void;
}

type RankedTab = 'play' | 'leaderboard' | 'history';

export class RankedScreen {
  readonly element: HTMLElement;

  private preferredMap: RankedMapId | 'any' = 'any';
  private queueState: 'idle' | 'queuing' | 'lobby' = 'idle';
  private localReady = false;

  private profile: RankedProfile | null = null;
  private leaderboard: LeaderboardEntry[] = [];
  private queueInfo = { waitSec: 0, rpTolerance: 250, queuedPlayers: 0 };
  private lobbySnap: LobbySnapshot | null = null;
  private renderedPlayMode: 'idle' | 'queuing' | 'lobby' | null = null;
  private lastLobbyKey = '';
  private lastConnState: NetworkConnectionState = 'disconnected';
  private lastRttMs = 0;
  private lastServerStatus: ServerOnlineStatus = {
    onlinePlayers: 0,
    queuedPlayers: 0,
    activeLobbies: 0,
    activeMatches: 0,
  };
  private pendingConfirmName: string | null = null;
  private i18nUnsubscribe: (() => void) | null = null;

  private readonly connBadgeEl: HTMLElement;
  private readonly serverStatsEl: HTMLElement;
  private readonly nameInputEl: HTMLInputElement;
  private readonly saveNameBtn: HTMLButtonElement;
  private readonly tierBadgeEl: HTMLElement;
  private readonly rpTextEl: HTMLElement;
  private readonly nextTierEl: HTMLElement;
  private readonly rpBarEl: HTMLElement;
  private readonly platformBadgeEl: HTMLElement;
  private readonly quickStatsEl: HTMLElement;
  private readonly tabButtons: HTMLButtonElement[] = [];
  private readonly tabPanels = new Map<RankedTab, HTMLElement>();
  private readonly playPanelEl: HTMLElement;
  private readonly leaderboardBodyEl: HTMLElement;
  private readonly statsGridEl: HTMLElement;
  private readonly historyBodyEl: HTMLElement;
  private readonly bannerEl: HTMLElement;

  constructor(private readonly callbacks: RankedScreenCallbacks) {
    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-30 flex flex-col safe-pad pointer-events-auto bg-slate-950/92 overflow-hidden';

    this.element.innerHTML = `
      <header class="nr-studio-header flex flex-wrap items-center justify-between gap-2 pb-2 sm:pb-3 border-b border-slate-800/80 shrink-0">
        <div class="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <button
            type="button"
            data-action="back"
            class="nexus-btn-secondary px-3 py-1.5 sm:py-2 rounded text-xs font-extrabold tracking-wider uppercase min-h-[34px] sm:min-h-[38px]"
          >← ${i18n.t('common.back')}</button>
          <div>
            <h2 data-i18n="header-title" class="text-sm sm:text-xl font-black tracking-[0.14em] text-white leading-none">
              ${i18n.t('menu.mode.rankedMain')}
            </h2>
            <p data-i18n="header-sub" class="text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-slate-400 mt-0.5">
              ${i18n.t('ranked.headerSub')}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div data-role="server-stats" class="nexus-panel-subtle px-2 sm:px-2.5 py-1 sm:py-1.5 rounded text-[10px] font-bold tracking-wider text-slate-300 uppercase tabular-nums">
            ${i18n.t('ranked.serverLiveLine', { online: 0, queue: 0, matches: 0 })}
          </div>
          <div data-role="conn-badge" class="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded text-[10px] font-extrabold tracking-wider uppercase border border-slate-700 bg-slate-900 text-slate-400">
            ${i18n.t('ranked.status.disconnected')}
          </div>
        </div>
      </header>

      <div data-role="banner" class="hidden mt-1.5 px-3 py-1 rounded text-xs font-bold tracking-wider uppercase border border-amber-400/50 bg-amber-500/15 text-amber-200 shrink-0"></div>

      <div class="flex-1 min-h-0 mt-2 sm:mt-3 grid grid-cols-1 min-[680px]:grid-cols-12 gap-2.5 sm:gap-3 overflow-y-auto min-[680px]:overflow-hidden nexus-scroll pb-1">
        <!-- Left: Player Rank Card -->
        <aside class="min-[680px]:col-span-5 lg:col-span-4 nexus-panel rounded p-2.5 sm:p-3.5 flex flex-col gap-2.5 sm:gap-3 shrink-0 min-[680px]:overflow-y-auto nexus-scroll">
          <div class="flex items-center justify-between gap-2">
            <span data-i18n="profile-card" class="text-[10px] font-extrabold tracking-widest uppercase text-sky-400">${i18n.t('ranked.profileCard')}</span>
            <div class="flex items-center gap-1.5">
              <span data-role="numeric-id-badge" class="hidden px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold text-sky-300 tabular-nums"></span>
              <span data-role="platform-badge" class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-extrabold uppercase text-slate-200">${i18n.translatePlatform('pc')}</span>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5">
              <input
                type="text"
                data-role="name-input"
                maxlength="18"
                placeholder="${this.escapeHtml(i18n.t('ranked.callsignLabel'))}"
                class="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-sky-400 rounded px-2.5 py-1.5 sm:py-2 text-xs font-bold tracking-wider text-white uppercase outline-none disabled:opacity-60"
              />
              <button
                type="button"
                data-action="save-name"
                class="nexus-btn-secondary px-2.5 sm:px-3 py-1.5 sm:py-2 rounded text-[11px] font-extrabold tracking-wider uppercase shrink-0 disabled:opacity-50"
              >${i18n.t('ranked.saveBtn')}</button>
            </div>
            <div data-role="name-lock-note" class="text-[10px] text-slate-400">
              ${i18n.t('ranked.renameOnceNote')}
            </div>
          </div>

          <div class="bg-slate-900/90 border border-slate-800 rounded p-2.5 sm:p-3 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <div data-role="tier-badge" class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border text-[11px] sm:text-xs font-black tracking-widest uppercase">
                  ${i18n.translateRankTier('Bronze')}
                </div>
                <span data-role="rp-text" class="text-base sm:text-lg font-black text-white tabular-nums">200 RP</span>
              </div>
              <span data-role="next-tier" class="text-[10px] font-bold tracking-wider text-slate-400 uppercase tabular-nums">
                ${i18n.t('ranked.toTierShort', { rp: 300, tier: i18n.translateRankTier('Silver').toUpperCase() })}
              </span>
            </div>
            <div class="w-full h-2 bg-slate-800 rounded overflow-hidden">
              <div data-role="rp-bar" class="h-full bg-orange-400 transition-[width] duration-200" style="width: 40%"></div>
            </div>
          </div>

          <div data-role="quick-stats" class="grid grid-cols-2 gap-2 text-center"></div>

          <div class="bg-slate-900/60 border border-slate-800/80 rounded p-2 sm:p-2.5 text-[10px] sm:text-[11px] text-slate-300 leading-relaxed">
            <div data-i18n="tiers-card" class="font-extrabold text-orange-300 uppercase tracking-wider text-[10px] mb-1">${i18n.t('ranked.tiersCard')}</div>
            <span data-i18n="tier-legend">${i18n.t('ranked.tierLegend')}</span>
          </div>
        </aside>

        <!-- Right: Tabs (Queue/Lobby, Leaderboard, Stats & History) -->
        <section class="min-[680px]:col-span-7 lg:col-span-8 nexus-panel rounded p-2.5 sm:p-3.5 flex flex-col min-h-[240px] min-[680px]:min-h-0">
          <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800 shrink-0 flex-wrap">
            <div class="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              <button type="button" data-tab="play" class="px-2.5 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-extrabold tracking-wider uppercase border">${i18n.t('ranked.tab.matchmaking')}</button>
              <button type="button" data-tab="leaderboard" class="px-2.5 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-extrabold tracking-wider uppercase border">${i18n.t('ranked.tab.leaderboard')}</button>
              <button type="button" data-tab="history" class="px-2.5 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-extrabold tracking-wider uppercase border">${i18n.t('ranked.tab.history')}</button>
            </div>
            <button
              type="button"
              data-action="refresh"
              class="nexus-btn-secondary px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider uppercase"
            >${i18n.t('ranked.refresh')}</button>
          </div>

          <div data-panel="play" class="flex-1 min-h-0 overflow-y-auto nexus-scroll pt-2.5 sm:pt-3 flex flex-col gap-2.5 sm:gap-3"></div>

          <div data-panel="leaderboard" class="hidden flex-1 min-h-0 overflow-y-auto nexus-scroll pt-2.5 sm:pt-3 flex flex-col gap-2.5">
            <div class="flex items-center gap-2 shrink-0">
              <input
                type="text"
                data-role="lb-lookup-input"
                maxlength="32"
                placeholder="${this.escapeHtml(i18n.t('profile.lookup.placeholder'))}"
                class="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-sky-400 rounded px-3 py-2 text-xs font-bold text-white placeholder:text-slate-500 outline-none min-h-[38px] tabular-nums"
              />
              <button
                type="button"
                data-action="lb-lookup-btn"
                class="nexus-btn-secondary px-3 py-2 rounded text-[11px] font-extrabold tracking-wider uppercase border-sky-400/50 text-sky-200 min-h-[38px] shrink-0"
              >${this.escapeHtml(i18n.t('profile.lookup.btn'))}</button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-800 text-[10px] font-extrabold tracking-widest uppercase text-slate-400">
                    <th data-i18n="col-rank" class="py-2 pr-2">${i18n.t('ranked.col.rank')}</th>
                    <th data-i18n="col-player" class="py-2 pr-2">${i18n.t('ranked.col.player')}</th>
                    <th data-i18n="col-tier" class="py-2 pr-2">${i18n.t('ranked.col.tier')}</th>
                    <th data-i18n="col-rp" class="py-2 pr-2">${i18n.t('ranked.col.rp')}</th>
                    <th data-i18n="col-wins" class="py-2 pr-2">${i18n.t('ranked.col.wins')}</th>
                    <th data-i18n="col-kills" class="py-2 pr-2">${i18n.t('ranked.col.kills')}</th>
                    <th data-i18n="col-kd" class="py-2 pr-2">${i18n.t('ranked.col.kd')}</th>
                    <th data-i18n="col-platform" class="py-2">${i18n.t('ranked.col.platform')}</th>
                  </tr>
                </thead>
                <tbody data-role="leaderboard-body"></tbody>
              </table>
            </div>
          </div>

          <div data-panel="history" class="hidden flex-1 min-h-0 overflow-y-auto nexus-scroll pt-2.5 sm:pt-3 flex flex-col gap-3">
            <div data-role="stats-grid" class="grid grid-cols-2 sm:grid-cols-4 gap-2"></div>
            <div data-i18n="history-title" class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('ranked.historyTitle')}</div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-800 text-[10px] font-extrabold tracking-widest uppercase text-slate-400">
                    <th data-i18n="h-map" class="py-2 pr-2">${i18n.t('ranked.col.map')}</th>
                    <th data-i18n="h-place" class="py-2 pr-2">${i18n.t('ranked.col.place')}</th>
                    <th data-i18n="h-kills" class="py-2 pr-2">${i18n.t('ranked.col.kills')}</th>
                    <th data-i18n="h-dmg" class="py-2 pr-2">${i18n.t('ranked.col.dmg')}</th>
                    <th data-i18n="h-rpdelta" class="py-2 pr-2">${i18n.t('ranked.col.rpDelta')}</th>
                    <th data-i18n="h-tier" class="py-2">${i18n.t('ranked.col.tier')}</th>
                  </tr>
                </thead>
                <tbody data-role="history-body"></tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    `;

    this.connBadgeEl = this.element.querySelector('[data-role="conn-badge"]')!;
    this.serverStatsEl = this.element.querySelector('[data-role="server-stats"]')!;
    this.nameInputEl = this.element.querySelector('[data-role="name-input"]')!;
    this.saveNameBtn = this.element.querySelector('[data-action="save-name"]')!;
    this.tierBadgeEl = this.element.querySelector('[data-role="tier-badge"]')!;
    this.rpTextEl = this.element.querySelector('[data-role="rp-text"]')!;
    this.nextTierEl = this.element.querySelector('[data-role="next-tier"]')!;
    this.rpBarEl = this.element.querySelector('[data-role="rp-bar"]')!;
    this.platformBadgeEl = this.element.querySelector('[data-role="platform-badge"]')!;
    this.quickStatsEl = this.element.querySelector('[data-role="quick-stats"]')!;
    this.playPanelEl = this.element.querySelector('[data-panel="play"]')!;
    this.leaderboardBodyEl = this.element.querySelector('[data-role="leaderboard-body"]')!;
    this.statsGridEl = this.element.querySelector('[data-role="stats-grid"]')!;
    this.historyBodyEl = this.element.querySelector('[data-role="history-body"]')!;
    this.bannerEl = this.element.querySelector('[data-role="banner"]')!;

    this.element.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      this.tabButtons.push(btn);
      btn.addEventListener('click', () => {
        const t = btn.dataset.tab as RankedTab;
        this.setTab(t);
      });
    });

    (['play', 'leaderboard', 'history'] as RankedTab[]).forEach((t) => {
      const p = this.element.querySelector<HTMLElement>(`[data-panel="${t}"]`)!;
      this.tabPanels.set(t, p);
    });

    this.element.querySelector('[data-action="back"]')!.addEventListener('click', () => {
      this.callbacks.onBack();
    });

    this.saveNameBtn.addEventListener('click', () => {
      const val = this.nameInputEl.value.trim();
      if (val.length < 2) {
        this.setStatusBanner(i18n.t('ranked.errMinChars'));
        return;
      }
      if (this.profile && val.toLowerCase() === this.profile.name.trim().toLowerCase()) {
        this.setStatusBanner(i18n.t('ranked.errSameName'));
        return;
      }
      if (this.pendingConfirmName !== val) {
        this.pendingConfirmName = val;
        this.saveNameBtn.textContent = i18n.t('ranked.confirmBtn');
        this.setStatusBanner(i18n.t('ranked.renameConfirmPrompt', { name: val }));
        return;
      }
      this.pendingConfirmName = null;
      this.saveNameBtn.textContent = i18n.t('ranked.saveBtn');
      void this.callbacks.onRename(val);
    });

    this.nameInputEl.addEventListener('input', () => {
      this.pendingConfirmName = null;
      this.saveNameBtn.textContent = i18n.t('ranked.saveBtn');
    });

    this.element.querySelector('[data-action="refresh"]')!.addEventListener('click', () => {
      void this.callbacks.onRefreshLeaderboard();
      void this.callbacks.onRefreshProfile();
    });

    const lbLookupInput = this.element.querySelector<HTMLInputElement>('[data-role="lb-lookup-input"]');
    const triggerLbLookup = () => {
      const val = lbLookupInput?.value.trim() ?? '';
      if (val) {
        this.callbacks.onInspectPlayer?.(val);
      }
    };
    this.element.querySelector('[data-action="lb-lookup-btn"]')?.addEventListener('click', triggerLbLookup);
    lbLookupInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerLbLookup();
      }
    });

    this.setTab('play');
    this.renderPlayPanel();

    this.i18nUnsubscribe = i18n.subscribe(() => {
      this.refreshLocale();
    });
  }

  refreshLocale(): void {
    const setText = (sel: string, txt: string) => {
      const el = this.element.querySelector<HTMLElement>(sel);
      if (el) el.textContent = txt;
    };
    setText('[data-action="back"]', `← ${i18n.t('common.back')}`);
    setText('[data-i18n="header-title"]', i18n.t('menu.mode.rankedMain'));
    setText('[data-i18n="header-sub"]', i18n.t('ranked.headerSub'));
    setText('[data-i18n="profile-card"]', i18n.t('ranked.profileCard'));
    this.nameInputEl.placeholder = i18n.t('ranked.callsignLabel');
    setText('[data-i18n="tiers-card"]', i18n.t('ranked.tiersCard'));
    setText('[data-i18n="tier-legend"]', i18n.t('ranked.tierLegend'));
    setText('[data-tab="play"]', i18n.t('ranked.tab.matchmaking'));
    setText('[data-tab="leaderboard"]', i18n.t('ranked.tab.leaderboard'));
    setText('[data-tab="history"]', i18n.t('ranked.tab.history'));
    setText('[data-action="refresh"]', i18n.t('ranked.refresh'));
    const lbInput = this.element.querySelector<HTMLInputElement>('[data-role="lb-lookup-input"]');
    if (lbInput) lbInput.placeholder = i18n.t('profile.lookup.placeholder');
    setText('[data-action="lb-lookup-btn"]', i18n.t('profile.lookup.btn'));
    setText('[data-i18n="col-rank"]', i18n.t('ranked.col.rank'));
    setText('[data-i18n="col-player"]', i18n.t('ranked.col.player'));
    setText('[data-i18n="col-tier"]', i18n.t('ranked.col.tier'));
    setText('[data-i18n="col-rp"]', i18n.t('ranked.col.rp'));
    setText('[data-i18n="col-wins"]', i18n.t('ranked.col.wins'));
    setText('[data-i18n="col-kills"]', i18n.t('ranked.col.kills'));
    setText('[data-i18n="col-kd"]', i18n.t('ranked.col.kd'));
    setText('[data-i18n="col-platform"]', i18n.t('ranked.col.platform'));
    setText('[data-i18n="history-title"]', i18n.t('ranked.historyTitle'));
    setText('[data-i18n="h-map"]', i18n.t('ranked.col.map'));
    setText('[data-i18n="h-place"]', i18n.t('ranked.col.place'));
    setText('[data-i18n="h-kills"]', i18n.t('ranked.col.kills'));
    setText('[data-i18n="h-dmg"]', i18n.t('ranked.col.dmg'));
    setText('[data-i18n="h-rpdelta"]', i18n.t('ranked.col.rpDelta'));
    setText('[data-i18n="h-tier"]', i18n.t('ranked.col.tier'));

    this.setConnectionState(this.lastConnState, this.lastRttMs);
    this.setServerStatus(this.lastServerStatus);
    if (this.profile) {
      this.setProfile(this.profile);
    }
    this.renderedPlayMode = null;
    this.lastLobbyKey = '';
    this.renderPlayPanel();
    this.renderLeaderboard();
  }

  setTab(tab: RankedTab): void {
    for (const btn of this.tabButtons) {
      const active = btn.dataset.tab === tab;
      btn.className = active
        ? 'px-3 py-1.5 rounded text-xs font-extrabold tracking-wider uppercase border border-orange-400 bg-orange-500/20 text-orange-300'
        : 'px-3 py-1.5 rounded text-xs font-bold tracking-wider uppercase border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-sky-400/60';
    }
    for (const [id, el] of this.tabPanels.entries()) {
      el.classList.toggle('hidden', id !== tab);
    }
    if (tab === 'leaderboard') {
      void this.callbacks.onRefreshLeaderboard();
    } else if (tab === 'history') {
      void this.callbacks.onRefreshProfile();
    }
  }

  setStatusBanner(message: string): void {
    if (!message) {
      this.bannerEl.classList.add('hidden');
      this.bannerEl.textContent = '';
    } else {
      this.bannerEl.textContent = message;
      this.bannerEl.classList.remove('hidden');
    }
  }

  setConnectionState(state: NetworkConnectionState, rttMs = 0): void {
    const prevState = this.lastConnState;
    this.lastConnState = state;
    this.lastRttMs = rttMs;
    if (state === 'connected') {
      this.connBadgeEl.textContent =
        rttMs > 0 ? i18n.t('ranked.connOnlineRtt', { rtt: rttMs }) : i18n.t('ranked.online').toUpperCase();
      this.connBadgeEl.className =
        'px-2.5 py-1.5 rounded text-[10px] font-extrabold tracking-wider uppercase border border-emerald-500/50 bg-emerald-500/15 text-emerald-300';
    } else if (state === 'connecting' || state === 'reconnecting') {
      this.connBadgeEl.textContent = i18n.t('ranked.connConnecting');
      this.connBadgeEl.className =
        'px-2.5 py-1.5 rounded text-[10px] font-extrabold tracking-wider uppercase border border-amber-500/50 bg-amber-500/15 text-amber-300';
    } else {
      this.connBadgeEl.textContent =
        state === 'error' ? i18n.t('ranked.connError') : i18n.t('ranked.connOffline');
      this.connBadgeEl.className =
        'px-2.5 py-1.5 rounded text-[10px] font-extrabold tracking-wider uppercase border border-rose-500/50 bg-rose-500/15 text-rose-300';
    }
    if (prevState !== state && this.queueState === 'idle') {
      this.renderPlayPanel();
    }
  }

  setServerStatus(status: ServerOnlineStatus): void {
    this.lastServerStatus = status;
    this.serverStatsEl.textContent = i18n.t('ranked.serverLiveLine', {
      online: status.onlinePlayers,
      queue: status.queuedPlayers,
      matches: status.activeMatches,
    });
  }

  setProfile(profile: RankedProfile): void {
    this.profile = profile;
    if (document.activeElement !== this.nameInputEl) {
      this.nameInputEl.value = profile.name;
    }
    this.nameInputEl.disabled = false;
    this.saveNameBtn.disabled = false;
    this.saveNameBtn.textContent = this.pendingConfirmName
      ? i18n.t('ranked.confirmBtn')
      : i18n.t('ranked.saveBtn');
    const lockNoteEl = this.element.querySelector<HTMLElement>('[data-role="name-lock-note"]');
    if (lockNoteEl) {
      lockNoteEl.textContent = i18n.t('ranked.renameOnceNote');
      lockNoteEl.className = 'text-[10px] text-slate-400';
    }
    this.platformBadgeEl.textContent = i18n.translatePlatform(profile.platform).toUpperCase();
    const numBadgeEl = this.element.querySelector<HTMLElement>('[data-role="numeric-id-badge"]');
    if (numBadgeEl) {
      if (profile.numericId) {
        numBadgeEl.textContent = i18n.t('profile.numericIdLabel', { id: profile.numericId });
        numBadgeEl.classList.remove('hidden');
      } else {
        numBadgeEl.classList.add('hidden');
      }
    }

    const prog = getNextRankProgress(profile.rp);
    this.tierBadgeEl.textContent = i18n.translateRankTier(prog.current.tier).toUpperCase();
    this.tierBadgeEl.style.color = prog.current.colorHex;
    this.tierBadgeEl.style.borderColor = prog.current.colorHex;
    this.tierBadgeEl.style.backgroundColor = 'rgba(15, 23, 42, 0.9)';

    this.rpTextEl.textContent = `${profile.rp} RP`;
    this.nextTierEl.textContent = prog.next
      ? i18n.t('ranked.toTierShort', {
          rp: prog.rpToNext,
          tier: i18n.translateRankTier(prog.next.tier).toUpperCase(),
        })
      : i18n.t('ranked.maxTierLabel');
    this.rpBarEl.style.width = `${prog.progressPct}%`;
    this.rpBarEl.style.backgroundColor = prog.current.colorHex;

    const kd =
      profile.deaths > 0
        ? (profile.kills / profile.deaths).toFixed(2)
        : profile.kills.toFixed(2);
    this.quickStatsEl.innerHTML = `
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('common.wins')}</div>
        <div class="text-base font-black text-amber-300 tabular-nums">${profile.wins}</div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.col.kills')}</div>
        <div class="text-base font-black text-orange-300 tabular-nums">${profile.kills}</div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.kdLabel')}</div>
        <div class="text-base font-black text-sky-300 tabular-nums">${kd}</div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('common.matches')}</div>
        <div class="text-base font-black text-slate-100 tabular-nums">${profile.matchesPlayed}</div>
      </div>
    `;

    this.renderStatsAndHistory();
  }

  setQueueState(
    state: 'idle' | 'queuing' | 'lobby',
    info?: { waitSec: number; rpTolerance: number; queuedPlayers: number },
    lobby?: LobbySnapshot | null,
  ): void {
    this.queueState = state;
    if (info) this.queueInfo = info;
    if (lobby !== undefined) {
      this.lobbySnap = lobby;
      if (lobby && this.profile) {
        const me = lobby.players.find((p) => p.playerId === this.profile!.playerId);
        this.localReady = me?.ready ?? false;
      }
    }
    if (state === 'idle') {
      this.lobbySnap = null;
      this.localReady = false;
    }
    this.renderPlayPanel();
  }

  setLeaderboard(entries: LeaderboardEntry[]): void {
    this.leaderboard = entries;
    this.renderLeaderboard();
  }

  private renderPlayPanel(): void {
    if (this.queueState === 'idle') {
      this.renderedPlayMode = 'idle';
      this.lastLobbyKey = '';
      const mapChoices: Array<{ id: RankedMapId | 'any'; label: string }> = [
        { id: 'any', label: i18n.t('ranked.anyMap') },
        { id: 'desert', label: i18n.translateMapName('desert') },
        { id: 'forest', label: i18n.translateMapName('forest') },
        { id: 'snow', label: i18n.translateMapName('snow') },
      ];
      const mapBtns = mapChoices
        .map((c) => {
          const active = this.preferredMap === c.id;
          return `<button type="button" data-pref-map="${c.id}" class="flex-1 py-2 px-2 rounded text-xs font-extrabold uppercase tracking-wider border ${
            active
              ? 'border-orange-400 bg-orange-500/20 text-orange-300'
              : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-sky-400/50'
          }">${c.label}</button>`;
        })
        .join('');

      const isOnlineConnected = this.lastConnState === 'connected';
      const offlineNoticeHtml = isOnlineConnected
        ? ''
        : `<div class="bg-rose-500/10 border border-rose-500/40 rounded px-3 py-2 text-xs font-bold text-rose-200">${this.escapeHtml(i18n.t('ranked.wsUnavailable'))}</div>`;

      this.playPanelEl.innerHTML = `
        <div class="bg-slate-900/75 border border-slate-800 rounded p-3 flex flex-col gap-2">
          <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('ranked.prefMapVote')}</div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${mapBtns}</div>
        </div>

        ${offlineNoticeHtml}

        <button
          type="button"
          data-action="find-match"
          ${isOnlineConnected ? '' : 'disabled'}
          class="nexus-btn-primary w-full py-4 px-5 rounded text-base font-black tracking-[0.18em] uppercase flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>${i18n.t('ranked.findMatchCta')}</span>
          <span class="text-xs font-bold tracking-widest opacity-90">${
            isOnlineConnected ? `${i18n.t('ranked.realPvpBadge')} →` : i18n.t('ranked.connOffline')
          }</span>
        </button>

        <div class="bg-slate-900/60 border border-sky-500/25 rounded p-3 text-xs text-slate-300 flex flex-col gap-1.5">
          <div class="font-extrabold text-sky-300 uppercase tracking-wider text-[11px]">${i18n.t('ranked.rulesTitle')}</div>
          <p>• ${i18n.t('ranked.rule1Exact')}</p>
          <p>• ${i18n.t('ranked.rule2Exact')}</p>
          <p>• ${i18n.t('ranked.rule3Exact')}</p>
          <p>• ${i18n.t('ranked.rule4Exact')}</p>
        </div>
      `;

      this.playPanelEl.querySelectorAll<HTMLButtonElement>('[data-pref-map]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.preferredMap = btn.dataset.prefMap as RankedMapId | 'any';
          this.renderPlayPanel();
        });
      });

      this.playPanelEl.querySelector('[data-action="find-match"]')?.addEventListener('click', () => {
        if (this.lastConnState !== 'connected') {
          this.setStatusBanner(i18n.t('ranked.wsUnavailable'));
          return;
        }
        this.callbacks.onFindMatch(this.preferredMap);
      });
      return;
    }

    if (this.queueState === 'queuing') {
      const tolText =
        this.queueInfo.rpTolerance >= 9000
          ? i18n.t('ranked.allSkillTiers')
          : `±${this.queueInfo.rpTolerance} RP`;
      const waitText = i18n.t('common.secondsShort', { s: this.queueInfo.waitSec });
      const countText = i18n.t('ranked.humanCount', {
        count: Math.max(1, this.queueInfo.queuedPlayers),
      });

      if (this.renderedPlayMode === 'queuing') {
        const waitEl = this.playPanelEl.querySelector('[data-role="queue-wait"]');
        const tolEl = this.playPanelEl.querySelector('[data-role="queue-tol"]');
        const countEl = this.playPanelEl.querySelector('[data-role="queue-count"]');
        if (waitEl && tolEl && countEl) {
          waitEl.textContent = waitText;
          tolEl.textContent = tolText;
          countEl.textContent = countText;
          return;
        }
      }

      this.renderedPlayMode = 'queuing';
      this.lastLobbyKey = '';
      this.playPanelEl.innerHTML = `
        <div class="bg-slate-900/85 border border-orange-500/40 rounded p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-black tracking-widest uppercase text-orange-300">${i18n.t('ranked.searchingTitle')}</span>
            <span data-role="queue-wait" class="text-xs font-extrabold tabular-nums text-sky-300">${waitText}</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div class="bg-slate-950/80 border border-slate-800 rounded p-2">
              <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.skillRange')}</div>
              <div data-role="queue-tol" class="font-extrabold text-white tabular-nums">${tolText}</div>
            </div>
            <div class="bg-slate-950/80 border border-slate-800 rounded p-2">
              <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.playersInQueue')}</div>
              <div data-role="queue-count" class="font-extrabold text-emerald-300 tabular-nums">${countText}</div>
            </div>
            <div class="bg-slate-950/80 border border-slate-800 rounded p-2">
              <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.minToStart')}</div>
              <div class="font-extrabold text-slate-200 tabular-nums">${i18n.t('ranked.minToStartVal')}</div>
            </div>
          </div>
          <p class="text-[11px] text-slate-300">
            ${i18n.t('ranked.waitingAnotherPlayer')}
          </p>
          <button
            type="button"
            data-action="cancel-queue"
            class="nexus-btn-secondary w-full py-2.5 rounded text-xs font-extrabold tracking-widest uppercase text-rose-300 border-rose-500/40"
          >${i18n.t('ranked.cancelMatchmaking')}</button>
        </div>
      `;
      this.playPanelEl.querySelector('[data-action="cancel-queue"]')?.addEventListener('click', () => {
        this.callbacks.onCancelQueue();
      });
      return;
    }

    // Pre-match Lobby State
    const lobby = this.lobbySnap;
    if (!lobby) return;
    const countdownLabel =
      lobby.countdownSec !== null
        ? i18n.t('ranked.matchLaunchIn', { sec: lobby.countdownSec })
        : i18n.t('ranked.waitingForPlayersCount', {
            cur: lobby.players.length,
            min: lobby.minPlayers,
          });
    const countLabel = i18n.t('ranked.fightersRatio', {
      cur: lobby.players.length,
      max: lobby.maxPlayers,
    });
    const lobbyStructKey = `${lobby.lobbyId}|${lobby.selectedMap}|${lobby.mapVotes.desert ?? 0}:${lobby.mapVotes.forest ?? 0}:${lobby.mapVotes.snow ?? 0}|${this.localReady ? 1 : 0}|${lobby.players.map((p) => `${p.playerId}:${p.ready ? 1 : 0}:${p.rp}:${p.tier}`).join(',')}`;

    if (this.renderedPlayMode === 'lobby' && lobbyStructKey === this.lastLobbyKey) {
      const countdownEl = this.playPanelEl.querySelector('[data-role="lobby-countdown"]');
      const countEl = this.playPanelEl.querySelector('[data-role="lobby-count"]');
      if (countdownEl && countEl) {
        countdownEl.textContent = countdownLabel;
        countEl.textContent = countLabel;
        return;
      }
    }

    this.renderedPlayMode = 'lobby';
    this.lastLobbyKey = lobbyStructKey;

    const mapVoteButtons = (['desert', 'forest', 'snow'] as RankedMapId[])
      .map((m) => {
        const count = lobby.mapVotes[m] ?? 0;
        const selected = lobby.selectedMap === m;
        return `<button type="button" data-vote-map="${m}" class="flex-1 py-2 px-2 rounded text-xs font-extrabold uppercase border ${
          selected
            ? 'border-sky-400 bg-sky-500/20 text-sky-200'
            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-400/50'
        }">${i18n.translateMapName(m)} (${count})</button>`;
      })
      .join('');

    const playerRows = lobby.players
      .map((p) => {
        const spec = getRankTierSpec(p.rp);
        const isMe = p.playerId === this.profile?.playerId;
        const pTier = i18n.translateRankTier(p.tier);
        const pPlatform = i18n.translatePlatform(p.platform);
        const genderIcon =
          p.gender === 'male'
            ? `<span class="w-3.5 h-3.5 text-sky-400 shrink-0">${getGenderIconSvg('male')}</span>`
            : p.gender === 'female'
              ? `<span class="w-3.5 h-3.5 text-pink-400 shrink-0">${getGenderIconSvg('female')}</span>`
              : '';
        return `
          <div
            data-inspect-lobby-player="${this.escapeHtml(p.playerId)}"
            class="flex items-center justify-between gap-2 px-3 py-2 rounded border cursor-pointer hover:border-sky-400/60 transition-colors ${
              isMe ? 'border-orange-400/50 bg-orange-500/10' : 'border-slate-800 bg-slate-900/75'
            }"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-black uppercase border" style="color:${spec.colorHex}; border-color:${spec.colorHex}">${pTier}</span>
              <span class="text-xs font-extrabold text-white truncate">${this.escapeHtml(p.name)}${isMe ? ` ${i18n.t('ranked.youTag')}` : ''}</span>
              ${genderIcon}
              <span class="text-[10px] font-bold text-slate-400 uppercase">[${pPlatform}]</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs font-bold text-slate-300 tabular-nums">${p.rp} RP</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                p.ready
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }">${p.ready ? i18n.t('ranked.lobbyStatusReady') : i18n.t('ranked.lobbyStatusWait')}</span>
            </div>
          </div>
        `;
      })
      .join('');

    this.playPanelEl.innerHTML = `
      <div class="bg-slate-900/85 border border-sky-500/35 rounded p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-[10px] font-extrabold tracking-widest uppercase text-sky-400">${i18n.t('ranked.preMatchLobby')}</div>
          <div data-role="lobby-countdown" class="text-sm font-black tracking-wider text-white uppercase">${countdownLabel}</div>
        </div>
        <div data-role="lobby-count" class="text-xs font-extrabold text-slate-300 tabular-nums">
          ${countLabel}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('ranked.voteMapActive', { map: i18n.translateMapName(lobby.selectedMap) })}</div>
        <div class="flex gap-2">${mapVoteButtons}</div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">${i18n.t('ranked.playersInLobby')}</div>
        <div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto">${playerRows}</div>
      </div>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          data-action="toggle-ready"
          class="flex-1 py-3 px-4 rounded text-xs font-black tracking-[0.16em] uppercase ${
            this.localReady
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400'
              : 'nexus-btn-primary'
          }"
        >${this.localReady ? i18n.t('ranked.readyBtnToggle') : i18n.t('ranked.readyUp')}</button>
        <button
          type="button"
          data-action="leave-lobby"
          class="nexus-btn-secondary px-4 py-3 rounded text-xs font-extrabold tracking-wider uppercase text-rose-300 border-rose-500/40"
        >${i18n.t('ranked.leaveLobby')}</button>
      </div>
    `;

    this.playPanelEl.querySelectorAll<HTMLButtonElement>('[data-vote-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onVoteMap(btn.dataset.voteMap as RankedMapId);
      });
    });
    this.playPanelEl.querySelectorAll<HTMLElement>('[data-inspect-lobby-player]').forEach((row) => {
      row.addEventListener('click', () => {
        const pid = row.dataset.inspectLobbyPlayer;
        if (pid) {
          this.callbacks.onInspectPlayer?.(pid);
        }
      });
    });
    this.playPanelEl.querySelector('[data-action="toggle-ready"]')?.addEventListener('click', () => {
      this.callbacks.onToggleReady(!this.localReady);
    });
    this.playPanelEl.querySelector('[data-action="leave-lobby"]')?.addEventListener('click', () => {
      this.callbacks.onLeaveLobby();
    });
  }

  private renderLeaderboard(): void {
    if (this.leaderboard.length === 0) {
      this.leaderboardBodyEl.innerHTML = `
        <tr><td colspan="8" class="py-6 text-center text-slate-400 font-semibold">${i18n.t('ranked.noLeaderboard')}</td></tr>
      `;
      return;
    }

    this.leaderboardBodyEl.innerHTML = this.leaderboard
      .map((entry) => {
        const spec = getRankTierSpec(entry.rp);
        const kd =
          entry.deaths > 0
            ? (entry.kills / entry.deaths).toFixed(2)
            : entry.kills.toFixed(2);
        const isMe = entry.playerId === this.profile?.playerId;
        const genderIcon =
          entry.gender === 'male'
            ? `<span class="w-3.5 h-3.5 text-sky-400 shrink-0">${getGenderIconSvg('male')}</span>`
            : entry.gender === 'female'
              ? `<span class="w-3.5 h-3.5 text-pink-400 shrink-0">${getGenderIconSvg('female')}</span>`
              : '';
        const idSub = entry.numericId
          ? `<div class="text-[9px] font-semibold text-slate-400 tabular-nums">ID: ${this.escapeHtml(entry.numericId)}${typeof entry.level === 'number' ? ` · LV.${entry.level}` : ''}</div>`
          : '';
        return `
          <tr
            data-inspect-player="${this.escapeHtml(entry.playerId)}"
            class="border-b border-slate-800/70 cursor-pointer hover:bg-sky-500/10 transition-colors ${isMe ? 'bg-orange-500/10' : ''}"
          >
            <td class="py-2 pr-2 font-black tabular-nums text-amber-300">#${entry.rank}</td>
            <td class="py-2 pr-2">
              <div class="flex items-center gap-1.5 font-extrabold text-white">
                <span>${this.escapeHtml(entry.name)}${isMe ? ` ${i18n.t('ranked.youTag')}` : ''}</span>
                ${genderIcon}
              </div>
              ${idSub}
            </td>
            <td class="py-2 pr-2 font-black uppercase" style="color:${spec.colorHex}">${i18n.translateRankTier(entry.tier)}</td>
            <td class="py-2 pr-2 font-bold tabular-nums text-white">${entry.rp}</td>
            <td class="py-2 pr-2 tabular-nums text-emerald-300">${entry.wins}</td>
            <td class="py-2 pr-2 tabular-nums text-orange-300">${entry.kills}</td>
            <td class="py-2 pr-2 tabular-nums text-sky-300">${kd}</td>
            <td class="py-2 uppercase text-[10px] font-bold text-slate-400">${i18n.translatePlatform(entry.platform)}</td>
          </tr>
        `;
      })
      .join('');

    this.leaderboardBodyEl.querySelectorAll<HTMLElement>('[data-inspect-player]').forEach((row) => {
      row.addEventListener('click', () => {
        const pid = row.dataset.inspectPlayer;
        if (pid) {
          this.callbacks.onInspectPlayer?.(pid);
        }
      });
    });
  }

  private renderStatsAndHistory(): void {
    const p = this.profile;
    if (!p) return;

    const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
    const winRate =
      p.matchesPlayed > 0 ? `${Math.round((p.wins / p.matchesPlayed) * 100)}%` : '0%';

    this.statsGridEl.innerHTML = `
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.stats.winRate')}</div>
        <div class="text-sm font-black text-amber-300 tabular-nums">${winRate}</div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.stats.top3')}</div>
        <div class="text-sm font-black text-emerald-300 tabular-nums">${p.top3}</div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.stats.totalDamage')}</div>
        <div class="text-sm font-black text-sky-300 tabular-nums">${p.totalDamage}</div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded p-2.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase">${i18n.t('ranked.stats.bestKillsKd')}</div>
        <div class="text-sm font-black text-orange-300 tabular-nums">${p.bestKillsInMatch} · ${kd}</div>
      </div>
    `;

    if (p.history.length === 0) {
      this.historyBodyEl.innerHTML = `
        <tr><td colspan="6" class="py-6 text-center text-slate-400 font-semibold">${i18n.t('ranked.noHistory')}</td></tr>
      `;
      return;
    }

    this.historyBodyEl.innerHTML = p.history
      .map((h) => {
        const deltaStr = h.rpDelta >= 0 ? `+${h.rpDelta}` : `${h.rpDelta}`;
        const deltaColor = h.rpDelta >= 0 ? 'text-emerald-300' : 'text-rose-400';
        const spec = getRankTierSpec(h.rpAfter);
        return `
          <tr class="border-b border-slate-800/70">
            <td class="py-2 pr-2 font-bold uppercase text-slate-200">${i18n.translateMapName(h.mapId)}</td>
            <td class="py-2 pr-2 font-black tabular-nums ${h.placement === 1 ? 'text-amber-300' : 'text-white'}">#${h.placement}/${h.totalPlayers}</td>
            <td class="py-2 pr-2 tabular-nums text-orange-300">${h.kills}</td>
            <td class="py-2 pr-2 tabular-nums text-sky-300">${h.damage}</td>
            <td class="py-2 pr-2 font-black tabular-nums ${deltaColor}">${deltaStr} RP</td>
            <td class="py-2 font-extrabold uppercase" style="color:${spec.colorHex}">${i18n.translateRankTier(h.tierAfter)}</td>
          </tr>
        `;
      })
      .join('');
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
  }
}
