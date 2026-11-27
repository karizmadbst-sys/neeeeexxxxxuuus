import { CHARACTER_ROSTER, type CharacterDefinition } from '../../characters/CharacterData';
import type { CharacterPreviewRenderer } from '../../characters/CharacterPreviewRenderer';
import { ProfileCharacterStage } from '../../characters/ProfileCharacterStage';
import { getR6CharacterPreset } from '../../characters/R6CharacterCatalog';
import { i18n } from '../../i18n/I18nManager';
import type { PlayerAccountSnapshot } from '../../progression/PlayerProfileManager';
import { normalizeR6Customization, type R6Customization } from '../../player/R6CustomizationData';
import {
  getRankTierSpec,
  type PlatformType,
  type PlayerGender,
  type RankedProfile,
  type RankTier,
} from '../../ranked/RankedTypes';
import {
  DEFAULT_AVATAR_ID,
  DEFAULT_BANNER_ID,
} from '../../shop/AvatarBannerCatalog';
import {
  NEXUS_SHOP_CATALOG,
  resolveEquippedLobbyWeaponId,
  resolveEquippedLobbyWeaponSkinId,
  type ShopActionResult,
  type ShopBrowseTab,
  type ShopSnapshot,
} from '../../shop/IShopSystem';
import { getAvatarSvg, getBannerSvg } from '../icons/AvatarBannerSvg';
import { getGenderIconSvg, getSettingsCogSvg } from '../icons/GameIcons';

export interface ProfileModalCallbacks {
  onRenameOnce: (newName: string) => Promise<void>;
  onUpdateGender: (gender: PlayerGender) => Promise<void> | void;
  onLookupPlayer: (idOrNumericId: string) => Promise<RankedProfile | null>;
  onEquipAvatar: (avatarId: string) => ShopActionResult;
  onEquipBanner: (bannerId: string) => ShopActionResult;
  onOpenShopTab: (tab: ShopBrowseTab) => void;
  onOpenCharacters: () => void;
  onOpenGlbImport?: () => void;
  onSignOut?: () => Promise<void> | void;
  onClose: () => void;
}

interface RenderableProfileView {
  isOwn: boolean;
  isDeveloper: boolean;
  playerId: string;
  numericId: string;
  username: string;
  usernameChanged: boolean;
  platform: PlatformType;
  gender: PlayerGender | null;
  level: number;
  xp: number;
  nextLevelXp: number;
  avatarId: string;
  bannerId: string;
  rp: number;
  tier: RankTier;
  totalMatches: number;
  wins: number;
  eliminations: number;
  deaths: number;
  totalDamage: number;
  bestKillsInMatch: number;
  winRatePct: number;
  kdRatio: number;
  rankedTop3: number;
}

export class ProfileModal {
  readonly element: HTMLElement;

  private isOpen = false;
  private renameMode: 'view' | 'editing' = 'view';
  private pendingNewName = '';
  private renameBusy = false;
  private signingOut = false;
  private genderPopupOpen = false;
  private genderBusy = false;
  private copyConfirmed = false;
  private copyConfirmTimer = 0;

  private remoteProfile: RankedProfile | null = null;
  private lookupQuery = '';
  private lookupLoading = false;
  private lookupError: string | null = null;

  private feedbackMessage: { type: 'error' | 'success'; text: string } | null = null;
  private i18nUnsubscribe: (() => void) | null = null;

  private snapshot: PlayerAccountSnapshot;
  private isDeveloperVerified = false;
  private equippedCharacter: CharacterDefinition;
  private customization: R6Customization;
  private shopSnapshot: ShopSnapshot;

  private readonly layoutWrapperEl: HTMLElement;
  readonly characterStage: ProfileCharacterStage;
  private readonly cardContainerEl: HTMLElement;

  constructor(
    initialSnapshot: PlayerAccountSnapshot,
    initialCharacter: CharacterDefinition,
    initialCustomization: R6Customization,
    initialShopSnapshot: ShopSnapshot,
    _previewRenderer: CharacterPreviewRenderer,
    private readonly callbacks: ProfileModalCallbacks,
    options?: { isSoftwareGl?: boolean },
  ) {
    this.snapshot = initialSnapshot;
    this.equippedCharacter = initialCharacter;
    this.customization = this.cloneNormalized(initialCustomization);
    this.shopSnapshot = initialShopSnapshot;

    this.element = document.createElement('div');
    this.element.className =
      'hidden fixed inset-0 z-50 flex items-center justify-center safe-pad bg-slate-950/85 pointer-events-auto';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-label', i18n.t('menu.profile.view'));

    this.layoutWrapperEl = document.createElement('div');
    this.layoutWrapperEl.setAttribute('data-profile-role', 'layout-wrapper');
    this.layoutWrapperEl.className =
      'relative w-full max-w-6xl h-full max-h-[94dvh] flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5 pointer-events-none';
    this.element.appendChild(this.layoutWrapperEl);

    this.characterStage = new ProfileCharacterStage(Boolean(options?.isSoftwareGl));
    this.layoutWrapperEl.appendChild(this.characterStage.element);

    this.cardContainerEl = document.createElement('div');
    this.cardContainerEl.className =
      'nexus-panel relative w-full flex-1 min-h-0 sm:min-w-0 max-w-3xl max-h-[calc(94dvh-11.5rem)] sm:max-h-[94dvh] rounded-lg flex flex-col overflow-hidden border border-sky-400/35 pointer-events-auto';
    this.layoutWrapperEl.appendChild(this.cardContainerEl);

    this.element.addEventListener('click', (e) => {
      if (
        (e.target === this.element || e.target === this.layoutWrapperEl) &&
        !this.renameBusy
      ) {
        if (this.genderPopupOpen) {
          this.genderPopupOpen = false;
          this.render();
          return;
        }
        this.close();
      }
    });

    this.i18nUnsubscribe = i18n.subscribe(() => {
      this.element.setAttribute('aria-label', i18n.t('menu.profile.view'));
      if (this.isOpen) {
        this.render();
      }
    });
  }

  open(): void {
    this.isOpen = true;
    this.remoteProfile = null;
    this.lookupQuery = '';
    this.lookupLoading = false;
    this.lookupError = null;
    this.renameMode = 'view';
    this.pendingNewName = '';
    this.genderPopupOpen = false;
    this.feedbackMessage = null;
    this.element.classList.remove('hidden');
    this.syncCharacterStage(true);
    this.render();
  }

  openRemoteProfile(profile: RankedProfile): void {
    this.isOpen = true;
    this.remoteProfile = profile;
    this.lookupLoading = false;
    this.lookupError = null;
    this.renameMode = 'view';
    this.pendingNewName = '';
    this.genderPopupOpen = false;
    this.feedbackMessage = null;
    this.element.classList.remove('hidden');
    this.syncCharacterStage(true);
    this.render();
  }

  async openPlayerLookup(idOrNumericId: string): Promise<void> {
    const cleaned = idOrNumericId.trim();
    this.isOpen = true;
    this.renameMode = 'view';
    this.pendingNewName = '';
    this.genderPopupOpen = false;
    this.feedbackMessage = null;
    this.lookupQuery = cleaned;
    this.lookupError = null;

    if (!cleaned) {
      this.lookupLoading = false;
      this.remoteProfile = null;
      this.element.classList.remove('hidden');
      this.syncCharacterStage(true);
      this.render();
      return;
    }

    if (cleaned === this.snapshot.playerId || cleaned === this.snapshot.numericId) {
      this.open();
      return;
    }

    this.lookupLoading = true;
    this.element.classList.remove('hidden');
    this.syncCharacterStage(true);
    this.render();

    try {
      const found = await this.callbacks.onLookupPlayer(cleaned);
      if (!this.isOpen) return;
      this.lookupLoading = false;
      if (!found) {
        this.lookupError = i18n.t('profile.lookup.notFound');
      } else {
        this.remoteProfile = found;
        this.lookupError = null;
      }
      this.syncCharacterStage(false);
      this.render();
    } catch {
      if (!this.isOpen) return;
      this.lookupLoading = false;
      this.lookupError = i18n.t('profile.lookup.notFound');
      this.syncCharacterStage(false);
      this.render();
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.remoteProfile = null;
    this.lookupLoading = false;
    this.lookupError = null;
    this.renameMode = 'view';
    this.pendingNewName = '';
    this.genderPopupOpen = false;
    this.characterStage.setActive(false);
    this.element.classList.add('hidden');
    this.callbacks.onClose();
  }

  isModalOpen(): boolean {
    return this.isOpen;
  }

  updateData(
    snapshot: PlayerAccountSnapshot,
    equippedCharacter: CharacterDefinition,
    customization: R6Customization,
  ): void {
    this.snapshot = snapshot;
    this.equippedCharacter = equippedCharacter;
    this.customization = this.cloneNormalized(customization);
    if (!this.remoteProfile || this.remoteProfile.playerId === this.snapshot.playerId) {
      this.syncCharacterStage(false);
      if (this.isOpen) {
        this.render();
      }
    }
  }

  setShopSnapshot(snapshot: ShopSnapshot): void {
    this.shopSnapshot = snapshot;
    if (!this.remoteProfile || this.remoteProfile.playerId === this.snapshot.playerId) {
      this.syncCharacterStage(false);
      if (this.isOpen) {
        this.render();
      }
    }
  }

  setDeveloperAccess(isVerifiedDeveloper: boolean): void {
    const next = Boolean(isVerifiedDeveloper);
    if (this.isDeveloperVerified === next) return;
    this.isDeveloperVerified = next;
    if (this.isOpen && !this.remoteProfile) {
      this.render();
    }
  }

  private cloneNormalized(
    raw: Partial<R6Customization>,
  ): R6Customization {
    return normalizeR6Customization({
      ...raw,
    } as Partial<R6Customization> & Record<string, unknown>);
  }

  private resolveDisplayedAppearance(): {
    character: CharacterDefinition;
    customization: R6Customization;
    weaponId: string | null;
    weaponSkinId: string | null;
  } {
    if (this.remoteProfile && this.remoteProfile.playerId !== this.snapshot.playerId) {
      const remoteChar =
        CHARACTER_ROSTER.find((c) => c.id === this.remoteProfile?.avatarCharacterId) ??
        CHARACTER_ROSTER[0];
      const basePreset = getR6CharacterPreset(remoteChar.model.humanModelId).appearance;
      let resolvedCustom = this.cloneNormalized(basePreset);
      const remoteVault = this.remoteProfile.vault;
      const remoteOutfitId = remoteVault?.equippedOutfitId;
      if (remoteOutfitId) {
        const outfitItem = NEXUS_SHOP_CATALOG.find((item) => item.id === remoteOutfitId);
        if (outfitItem?.customizationPatch) {
          resolvedCustom = this.cloneNormalized({
            ...resolvedCustom,
            ...outfitItem.customizationPatch,
          });
        }
      }
      const remoteWeaponId = resolveEquippedLobbyWeaponId(remoteVault);
      const remoteWeaponSkinId = resolveEquippedLobbyWeaponSkinId(
        remoteVault,
        remoteWeaponId,
      );
      return {
        character: remoteChar,
        customization: resolvedCustom,
        weaponId: remoteWeaponId,
        weaponSkinId: remoteWeaponSkinId,
      };
    }

    const ownWeaponId = resolveEquippedLobbyWeaponId(this.shopSnapshot);
    const ownWeaponSkinId = resolveEquippedLobbyWeaponSkinId(
      this.shopSnapshot,
      ownWeaponId,
    );
    return {
      character: this.equippedCharacter,
      customization: this.cloneNormalized(this.customization),
      weaponId: ownWeaponId,
      weaponSkinId: ownWeaponSkinId,
    };
  }

  private syncCharacterStage(activateLoop: boolean): void {
    const { character, customization, weaponId, weaponSkinId } =
      this.resolveDisplayedAppearance();
    this.characterStage.setAppearance(character, customization, {
      weaponId,
      weaponSkinId,
    });
    if (activateLoop) {
      this.characterStage.setActive(true);
    }
  }

  setAccountEmail(_email: string | null): void {
    // Email metadata block removed from ProfileModal
  }

  private buildViewData(): RenderableProfileView {
    if (this.remoteProfile) {
      const r = this.remoteProfile;
      const level = typeof r.level === 'number' && r.level >= 1 ? Math.floor(r.level) : 1;
      const xp = typeof r.xp === 'number' && r.xp >= 0 ? Math.floor(r.xp) : 0;
      const nextLevelXp =
        typeof r.nextLevelXp === 'number' && r.nextLevelXp > 0
          ? Math.floor(r.nextLevelXp)
          : 100 + (level - 1) * 35;
      const totalMatches = Math.max(0, r.careerMatches ?? r.matchesPlayed ?? 0);
      const wins = Math.max(0, r.careerWins ?? r.wins ?? 0);
      const eliminations = Math.max(0, r.careerKills ?? r.kills ?? 0);
      const deaths = Math.max(0, r.careerDeaths ?? r.deaths ?? 0);
      const totalDamage = Math.max(0, r.careerDamage ?? r.totalDamage ?? 0);
      const bestKillsInMatch = Math.max(0, r.careerBestKills ?? r.bestKillsInMatch ?? 0);
      const winRatePct = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
      const kdRatio = deaths > 0 ? eliminations / deaths : eliminations;

      return {
        isOwn: r.playerId === this.snapshot.playerId,
        isDeveloper: false,
        playerId: r.playerId,
        numericId: r.numericId || r.playerId,
        username: r.name,
        usernameChanged: Boolean(r.usernameChanged),
        platform: r.platform ?? 'pc',
        gender: r.gender === 'male' || r.gender === 'female' ? r.gender : null,
        level,
        xp,
        nextLevelXp,
        avatarId: r.equippedAvatarId || r.vault?.equippedAvatarId || DEFAULT_AVATAR_ID,
        bannerId: r.equippedBannerId || r.vault?.equippedBannerId || DEFAULT_BANNER_ID,
        rp: Math.max(0, r.rp ?? 200),
        tier: r.tier,
        totalMatches,
        wins,
        eliminations,
        deaths,
        totalDamage,
        bestKillsInMatch,
        winRatePct,
        kdRatio,
        rankedTop3: Math.max(0, r.top3 ?? 0),
      };
    }

    const s = this.snapshot;
    return {
      isOwn: true,
      isDeveloper: Boolean(s.isDeveloper),
      playerId: s.playerId,
      numericId: s.numericId,
      username: s.username,
      usernameChanged: s.usernameChanged,
      platform: s.platform,
      gender: s.gender,
      level: s.level,
      xp: s.xp,
      nextLevelXp: s.nextLevelXp,
      avatarId: this.shopSnapshot.equippedAvatarId || DEFAULT_AVATAR_ID,
      bannerId: this.shopSnapshot.equippedBannerId || DEFAULT_BANNER_ID,
      rp: s.rp,
      tier: s.tier,
      totalMatches: s.totalMatches,
      wins: s.wins,
      eliminations: s.eliminations,
      deaths: s.deaths,
      totalDamage: s.totalDamage,
      bestKillsInMatch: s.bestKillsInMatch,
      winRatePct: s.winRatePct,
      kdRatio: s.kdRatio,
      rankedTop3: s.rankedTop3,
    };
  }

  private renderGenderIconHtml(gender: PlayerGender | null): string {
    if (gender === 'male') {
      return `
        <span
          data-profile-role="gender-badge"
          title="${this.escapeHtml(i18n.t('profile.gender.male'))}"
          aria-label="${this.escapeHtml(i18n.t('profile.gender.male'))}"
          class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-500/20 border border-sky-400/75 text-sky-400 shrink-0"
        >
          <span class="w-3.5 h-3.5">${getGenderIconSvg('male')}</span>
        </span>
      `;
    }
    if (gender === 'female') {
      return `
        <span
          data-profile-role="gender-badge"
          title="${this.escapeHtml(i18n.t('profile.gender.female'))}"
          aria-label="${this.escapeHtml(i18n.t('profile.gender.female'))}"
          class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-pink-500/20 border border-pink-400/75 text-pink-400 shrink-0"
        >
          <span class="w-3.5 h-3.5">${getGenderIconSvg('female')}</span>
        </span>
      `;
    }
    return '';
  }

  private renderGenderPopupHtml(currentGender: PlayerGender | null): string {
    if (!this.genderPopupOpen) return '';
    const isMale = currentGender === 'male';
    const isFemale = currentGender === 'female';

    return `
      <div
        data-profile-role="gender-popup-backdrop"
        class="fixed sm:absolute inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-4"
      >
        <div
          data-profile-role="gender-popup"
          role="dialog"
          aria-modal="true"
          aria-label="${this.escapeHtml(i18n.t('profile.gender.settingsAria'))}"
          class="w-full max-w-[272px] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-4 flex flex-col gap-3"
        >
          <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <span class="text-xs font-black tracking-[0.16em] uppercase text-white">
              ${this.escapeHtml(i18n.t('profile.gender.settingsTitle'))}
            </span>
            <button
              type="button"
              data-profile-action="close-gender-popup"
              aria-label="${this.escapeHtml(i18n.t('common.close'))}"
              class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm font-black"
            >&times;</button>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-profile-action="select-gender"
              data-gender-value="male"
              ${this.genderBusy ? 'disabled' : ''}
              aria-pressed="${isMale ? 'true' : 'false'}"
              class="relative min-h-[88px] rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-colors ${
                isMale
                  ? 'bg-sky-500/20 border-2 border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.28)]'
                  : 'bg-slate-950/90 border border-slate-700 hover:border-sky-400/65'
              }"
            >
              <span class="w-2.5 h-2.5 rounded-full absolute top-2 right-2 ${
                isMale ? 'bg-sky-400 ring-2 ring-sky-300/60' : 'bg-slate-700'
              }"></span>
              <span class="w-8 h-8 text-sky-400">${getGenderIconSvg('male')}</span>
              <span class="text-xs font-extrabold tracking-wider uppercase ${
                isMale ? 'text-sky-300' : 'text-slate-200'
              }">${this.escapeHtml(i18n.t('profile.gender.male'))}</span>
            </button>

            <button
              type="button"
              data-profile-action="select-gender"
              data-gender-value="female"
              ${this.genderBusy ? 'disabled' : ''}
              aria-pressed="${isFemale ? 'true' : 'false'}"
              class="relative min-h-[88px] rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-colors ${
                isFemale
                  ? 'bg-pink-500/20 border-2 border-pink-400 shadow-[0_0_16px_rgba(244,114,182,0.28)]'
                  : 'bg-slate-950/90 border border-slate-700 hover:border-pink-400/65'
              }"
            >
              <span class="w-2.5 h-2.5 rounded-full absolute top-2 right-2 ${
                isFemale ? 'bg-pink-400 ring-2 ring-pink-300/60' : 'bg-slate-700'
              }"></span>
              <span class="w-8 h-8 text-pink-400">${getGenderIconSvg('female')}</span>
              <span class="text-xs font-extrabold tracking-wider uppercase ${
                isFemale ? 'text-pink-300' : 'text-slate-200'
              }">${this.escapeHtml(i18n.t('profile.gender.female'))}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderRenameSectionHtml(v: RenderableProfileView): string {
    if (!v.isOwn || this.remoteProfile) return '';

    if (this.renameMode === 'view') {
      return `
        <div class="bg-slate-900/90 border border-sky-500/30 rounded-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-extrabold tracking-wider uppercase text-sky-300">
              ${i18n.t('profile.oneTimeAvailable')}
            </div>
            <p class="text-[11px] text-slate-300 mt-0.5 leading-snug">
              ${i18n.t('profile.rename.hint')}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-profile-action="start-rename"
              class="nexus-btn-secondary px-3.5 py-2.5 rounded text-xs font-extrabold tracking-wider uppercase border-sky-400/50 text-sky-200 min-h-[44px] whitespace-nowrap"
            >
              ${i18n.t('profile.editUsernameBtn')}
            </button>
            ${
              this.callbacks.onSignOut
                ? `<button
                    type="button"
                    data-profile-action="sign-out"
                    ${this.signingOut ? 'disabled' : ''}
                    class="px-3.5 py-2.5 rounded border border-rose-500/50 bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 text-xs font-extrabold tracking-wider uppercase min-h-[44px] whitespace-nowrap disabled:opacity-55"
                  >${this.signingOut ? i18n.t('auth.signingOut') : i18n.t('auth.signOut')}</button>`
                : ''
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="bg-slate-900/95 border border-sky-400/50 rounded-md p-3.5 flex flex-col gap-3">
        <div>
          <div class="text-xs font-extrabold tracking-wider uppercase text-sky-300">
            ${i18n.t('profile.enterNewUsername')}
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">
            ${i18n.t('profile.rename.hintLong')}
          </p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            data-profile-role="rename-input"
            maxlength="18"
            value="${this.escapeHtml(this.pendingNewName)}"
            placeholder="${this.escapeHtml(i18n.t('profile.rename.placeholder'))}"
            ${this.renameBusy ? 'disabled' : ''}
            class="flex-1 bg-slate-950 border border-slate-700 focus:border-sky-400 rounded px-3 py-2.5 text-sm font-bold text-white outline-none min-h-[44px]"
          />
          <div class="flex gap-2 shrink-0">
            <button
              type="button"
              data-profile-action="save-rename"
              ${this.renameBusy ? 'disabled' : ''}
              class="nexus-btn-primary px-4 py-2.5 rounded text-xs font-extrabold tracking-wider uppercase min-h-[44px] whitespace-nowrap disabled:opacity-55"
            >${this.renameBusy ? i18n.t('profile.savingUsername') : i18n.t('profile.continueBtn')}</button>
            <button
              type="button"
              data-profile-action="cancel-rename"
              ${this.renameBusy ? 'disabled' : ''}
              class="nexus-btn-secondary px-3.5 py-2.5 rounded text-xs font-bold tracking-wider uppercase min-h-[44px] whitespace-nowrap disabled:opacity-55"
            >${i18n.t('common.cancel')}</button>
          </div>
        </div>
      </div>
    `;
  }


  private render(): void {
    const v = this.buildViewData();
    const tierSpec = getRankTierSpec(v.rp);
    const xpPct = Math.max(0, Math.min(100, Math.round((v.xp / Math.max(1, v.nextLevelXp)) * 100)));
    const xpRemaining = Math.max(0, v.nextLevelXp - v.xp);

    const tierName = i18n.translateRankTier(v.tier);
    const platformLabel = i18n.translatePlatform(v.platform);

    const feedbackHtml = this.feedbackMessage
      ? `<div class="px-3 py-2 rounded border text-xs font-semibold ${
          this.feedbackMessage.type === 'error'
            ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
            : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
        }">${this.escapeHtml(this.feedbackMessage.text)}</div>`
      : '';

    const lookupErrorHtml = this.lookupError
      ? `<div class="px-3 py-2 rounded border text-xs font-semibold bg-rose-500/15 border-rose-500/45 text-rose-200">${this.escapeHtml(this.lookupError)}</div>`
      : '';

    const settingsBtnHtml =
      v.isOwn && !this.remoteProfile
        ? `
          <button
            type="button"
            data-profile-action="open-gender-settings"
            title="${this.escapeHtml(i18n.t('profile.gender.settingsAria'))}"
            aria-label="${this.escapeHtml(i18n.t('profile.gender.settingsAria'))}"
            class="inline-flex items-center justify-center w-9 h-9 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-sky-400 text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <span class="w-4 h-4">${getSettingsCogSvg()}</span>
          </button>
        `
        : '';

    const ownCharacterLineHtml =
      v.isOwn && !this.remoteProfile
        ? `<span class="text-[11px] font-semibold text-slate-300 truncate">${i18n.t('profile.equippedLine', {
            name: this.escapeHtml(i18n.translateCharacterName(this.equippedCharacter.id, this.equippedCharacter.name)),
            role: this.escapeHtml(i18n.translateCharacterRole(this.equippedCharacter.role)),
          })}</span>`
        : '';

    this.cardContainerEl.innerHTML = `
      <!-- Top Title Bar + Player Lookup -->
      <div class="px-4 py-3 border-b border-slate-800 bg-slate-950/90 flex flex-col gap-2.5 shrink-0">
        <div class="flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-2 h-5 rounded-sm bg-orange-500 shrink-0"></span>
            <div class="min-w-0">
              <h2 class="text-sm sm:text-base font-black tracking-[0.14em] uppercase text-white leading-none truncate">
                ${this.escapeHtml(this.remoteProfile ? i18n.t('profile.lookup.viewingPlayer') : i18n.t('profile.modalTitle'))}
              </h2>
              <div class="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mt-0.5 tabular-nums truncate">
                ${this.escapeHtml(i18n.t('profile.numericIdLabel', { id: v.numericId }))} · ${this.escapeHtml(platformLabel.toUpperCase())}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            ${
              this.remoteProfile
                ? `<button
                    type="button"
                    data-profile-action="back-to-mine"
                    class="nexus-btn-secondary px-3 py-2 rounded text-xs font-extrabold tracking-wider uppercase border-sky-400/50 text-sky-200 min-h-[44px] whitespace-nowrap"
                  >← ${this.escapeHtml(i18n.t('profile.lookup.backToMine'))}</button>`
                : ''
            }
            <button
              type="button"
              data-profile-action="close"
              ${this.renameBusy ? 'disabled' : ''}
              class="nexus-btn-secondary px-3.5 py-2 rounded text-xs font-extrabold tracking-wider uppercase min-h-[44px]"
            >${i18n.t('common.close')}</button>
          </div>
        </div>

        <!-- Numerical ID Search Bar -->
        <div class="flex items-center gap-2">
          <input
            type="text"
            data-profile-role="lookup-input"
            maxlength="32"
            value="${this.escapeHtml(this.lookupQuery)}"
            placeholder="${this.escapeHtml(i18n.t('profile.lookup.placeholder'))}"
            class="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-sky-400 rounded px-3 py-2 text-xs font-bold text-white placeholder:text-slate-500 outline-none min-h-[40px] tabular-nums"
          />
          <button
            type="button"
            data-profile-action="lookup-submit"
            ${this.lookupLoading ? 'disabled' : ''}
            class="nexus-btn-secondary px-3.5 py-2 rounded text-xs font-extrabold tracking-wider uppercase border-sky-400/45 text-sky-200 min-h-[40px] whitespace-nowrap shrink-0"
          >${this.escapeHtml(this.lookupLoading ? i18n.t('profile.lookup.searching') : i18n.t('profile.lookup.btn'))}</button>
        </div>
      </div>

      <!-- Scrollable Profile Body -->
      <div class="nexus-scroll overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
        ${feedbackHtml}
        ${lookupErrorHtml}

        <!-- Free Fire-Inspired Hero Profile Banner + Circular Avatar + Level + XP -->
        <section class="relative overflow-hidden bg-slate-900/95 border border-slate-700/85 rounded-lg flex flex-col">
          <!-- Wide Customizable Banner Showcase -->
          <div class="relative h-28 sm:h-36 w-full overflow-hidden border-b border-slate-800/90">
            <div class="absolute inset-0" aria-hidden="true">
              ${getBannerSvg(v.bannerId, 'w-full h-full object-cover')}
            </div>
            <div
              class="absolute inset-0 pointer-events-none"
              style="background: linear-gradient(180deg, rgba(2,6,23,0.12) 0%, rgba(2,6,23,0.45) 65%, rgba(2,6,23,0.92) 100%);"
              aria-hidden="true"
            ></div>

            <!-- Top-right Level + Rank Badges inside Banner -->
            <div class="absolute top-2.5 right-3 z-10 flex items-center gap-2">
              <span
                class="px-2.5 py-1 rounded border text-[11px] font-black tracking-widest uppercase shadow-md tabular-nums bg-slate-950/85"
                style="color:${tierSpec.colorHex}; border-color:${tierSpec.colorHex};"
              >${this.escapeHtml(i18n.t('menu.tierRpLine', { tier: tierName, rp: v.rp }))}</span>
              <span class="px-2.5 py-1 rounded bg-orange-500/25 border border-orange-400/80 text-[11px] font-black tracking-widest uppercase text-orange-200 tabular-nums shadow-md">
                ${this.escapeHtml(i18n.t('menu.lvlShort', { level: v.level }))}
              </span>
            </div>
          </div>

          <!-- Profile Identity Bar Overlapping Banner Bottom -->
          <div class="relative px-3.5 sm:px-5 pb-4 pt-2 flex flex-col gap-3">
            <div class="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 -mt-12 sm:-mt-14">
              <!-- Large Circular Framed Avatar -->
              <div class="relative shrink-0 self-start">
                <div
                  data-profile-role="cosmetic-avatar"
                  class="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-slate-950 border-[3px] shadow-xl"
                  style="border-color:${tierSpec.colorHex}; box-shadow: 0 0 20px ${tierSpec.colorHex}44;"
                >
                  ${getAvatarSvg(v.avatarId, 'w-full h-full')}
                </div>
                <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-slate-950 border border-orange-400 text-[10px] font-black tracking-wider uppercase text-orange-300 tabular-nums whitespace-nowrap shadow">
                  ${this.escapeHtml(i18n.t('menu.lvlShort', { level: v.level }))}
                </span>
              </div>

              <!-- Player Username + Gender Icon + Gear Settings + Numeric ID + Copy -->
              <div class="flex-1 min-w-0 flex flex-col gap-1.5 pt-1 sm:pt-3">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div class="flex items-center gap-2 min-w-0 flex-wrap">
                    <h3 class="text-xl sm:text-2xl font-black tracking-wide text-white truncate max-w-[230px] sm:max-w-[320px]">
                      ${this.escapeHtml(v.username)}
                    </h3>
                    ${
                      v.isDeveloper && this.isDeveloperVerified && v.isOwn && !this.remoteProfile
                        ? `<span
                            data-profile-role="developer-badge"
                            class="inline-flex items-center px-2 py-0.5 rounded border border-amber-400/80 bg-amber-500/20 text-amber-200 text-[10px] font-black tracking-widest uppercase shrink-0"
                          >CREATOR · DEV</span>
                          <button
                            type="button"
                            data-profile-action="open-glb-import"
                            class="inline-flex items-center px-2.5 py-0.5 rounded border border-amber-300/85 bg-amber-500/25 hover:bg-amber-500/40 text-amber-100 text-[10px] font-black tracking-widest uppercase shrink-0 min-h-[26px] transition-colors"
                          >${this.escapeHtml(i18n.t('shop.tab.glb-import'))}</button>`
                        : ''
                    }
                    ${this.renderGenderIconHtml(v.gender)}
                    ${settingsBtnHtml}
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/90 border border-slate-800 text-[11px] font-extrabold text-sky-300 tabular-nums">
                    <span>${this.escapeHtml(i18n.t('profile.numericIdLabel', { id: v.numericId }))}</span>
                  </div>
                  <button
                    type="button"
                    data-profile-action="copy-id"
                    class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-extrabold tracking-wider uppercase ${
                      this.copyConfirmed ? 'text-emerald-300 border-emerald-500/60' : 'text-slate-200'
                    } min-h-[30px]"
                  >${this.escapeHtml(this.copyConfirmed ? i18n.t('profile.idCopied') : i18n.t('profile.copyId'))}</button>
                  ${ownCharacterLineHtml}
                </div>
              </div>
            </div>

            <!-- XP Progress Bar -->
            <div class="flex flex-col gap-1.5 pt-1">
              <div class="flex items-center justify-between text-[11px] font-bold tabular-nums">
                <span class="text-sky-300 uppercase tracking-wider">${i18n.t('profile.xpProgress')}</span>
                <span class="text-slate-200">${i18n.t('menu.xpFraction', { xp: v.xp, next: v.nextLevelXp })} <span class="text-slate-400">${i18n.t('profile.xpRemaining', { rem: xpRemaining, next: v.level + 1 })}</span></span>
              </div>
              <div class="w-full h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-[width] duration-300"
                  style="width: ${xpPct}%; background: linear-gradient(90deg, #38bdf8 0%, #f97316 100%);"
                ></div>
              </div>
            </div>
          </div>
        </section>

        <!-- NEXUS ROYAL ID Account & Username Management (Own Profile) -->
        ${this.renderRenameSectionHtml(v)}

        <!-- Career Combat Statistics (100% Real Data) -->
        <section class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-xs font-black tracking-[0.16em] uppercase text-slate-300">
              ${i18n.t('profile.combatStatsTitle')}
            </h4>
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              ${i18n.t('profile.stats.liveRecord')}
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div class="bg-slate-900/85 border border-slate-800 rounded-md p-3">
              <div class="text-[10px] font-extrabold tracking-wider uppercase text-slate-400">${i18n.t('profile.stat.totalMatches')}</div>
              <div class="text-2xl font-black text-white tabular-nums mt-1">${v.totalMatches}</div>
            </div>
            <div class="bg-slate-900/85 border border-slate-800 rounded-md p-3">
              <div class="text-[10px] font-extrabold tracking-wider uppercase text-slate-400">${i18n.t('common.wins')}</div>
              <div class="text-2xl font-black text-amber-300 tabular-nums mt-1">${v.wins}</div>
            </div>
            <div class="bg-slate-900/85 border border-slate-800 rounded-md p-3">
              <div class="text-[10px] font-extrabold tracking-wider uppercase text-slate-400">${i18n.t('profile.stat.eliminations')}</div>
              <div class="text-2xl font-black text-orange-400 tabular-nums mt-1">${v.eliminations}</div>
            </div>
            <div class="bg-slate-900/85 border border-slate-800 rounded-md p-3">
              <div class="text-[10px] font-extrabold tracking-wider uppercase text-slate-400">${i18n.t('ranked.stats.winRate')}</div>
              <div class="text-2xl font-black text-emerald-400 tabular-nums mt-1">${v.winRatePct.toFixed(1)}%</div>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div class="bg-slate-950/80 border border-slate-800/80 rounded p-2.5 flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold uppercase text-slate-400">${i18n.t('ranked.kdLabel')}</span>
              <span class="text-sm font-black text-sky-300 tabular-nums">${v.kdRatio.toFixed(2)}</span>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded p-2.5 flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold uppercase text-slate-400">${i18n.t('profile.stat.totalDmg')}</span>
              <span class="text-sm font-black text-slate-100 tabular-nums">${v.totalDamage}</span>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded p-2.5 flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold uppercase text-slate-400">${i18n.t('profile.stat.bestKills')}</span>
              <span class="text-sm font-black text-orange-300 tabular-nums">${v.bestKillsInMatch}</span>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded p-2.5 flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold uppercase text-slate-400">${i18n.t('profile.stat.rankedTop3')}</span>
              <span class="text-sm font-black text-amber-200 tabular-nums">${v.rankedTop3}</span>
            </div>
          </div>

          ${
            v.totalMatches === 0
              ? `<div class="bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-[11px] text-slate-400">
                  ${i18n.t('profile.noMatchesYet')}
                </div>`
              : ''
          }
        </section>
      </div>

      ${this.renderGenderPopupHtml(v.gender)}
    `;

    this.bindEvents(v);
  }

  private bindEvents(v: RenderableProfileView): void {
    this.cardContainerEl.querySelector('[data-profile-action="close"]')?.addEventListener('click', () => {
      if (!this.renameBusy) this.close();
    });

    this.cardContainerEl.querySelector('[data-profile-action="back-to-mine"]')?.addEventListener('click', () => {
      this.open();
    });

    const lookupInput = this.cardContainerEl.querySelector<HTMLInputElement>('[data-profile-role="lookup-input"]');
    lookupInput?.addEventListener('input', () => {
      this.lookupQuery = lookupInput.value;
    });
    lookupInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = lookupInput.value.trim();
        if (!val) {
          this.lookupError = i18n.t('profile.lookup.invalidId');
          this.render();
          return;
        }
        void this.openPlayerLookup(val);
      }
    });

    this.cardContainerEl.querySelector('[data-profile-action="lookup-submit"]')?.addEventListener('click', () => {
      const val = (lookupInput?.value ?? this.lookupQuery).trim();
      if (!val) {
        this.lookupError = i18n.t('profile.lookup.invalidId');
        this.render();
        return;
      }
      void this.openPlayerLookup(val);
    });

    this.cardContainerEl.querySelector('[data-profile-action="copy-id"]')?.addEventListener('click', () => {
      const idText = v.numericId;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        void navigator.clipboard.writeText(idText).catch(() => {});
      } else {
        const tmp = document.createElement('input');
        tmp.value = idText;
        document.body.appendChild(tmp);
        tmp.select();
        try {
          document.execCommand('copy');
        } catch {
          // Ignore fallback failure
        }
        document.body.removeChild(tmp);
      }
      this.copyConfirmed = true;
      if (this.copyConfirmTimer) {
        clearTimeout(this.copyConfirmTimer);
      }
      this.copyConfirmTimer = window.setTimeout(() => {
        this.copyConfirmed = false;
        this.copyConfirmTimer = 0;
        if (this.isOpen) {
          this.render();
        }
      }, 1600);
      this.render();
    });

    this.cardContainerEl
      .querySelector('[data-profile-action="open-gender-settings"]')
      ?.addEventListener('click', () => {
        this.genderPopupOpen = true;
        this.render();
      });

    this.cardContainerEl
      .querySelector('[data-profile-role="gender-popup-backdrop"]')
      ?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          this.genderPopupOpen = false;
          this.render();
        }
      });

    this.cardContainerEl
      .querySelector('[data-profile-action="close-gender-popup"]')
      ?.addEventListener('click', () => {
        this.genderPopupOpen = false;
        this.render();
      });

    this.cardContainerEl
      .querySelectorAll<HTMLButtonElement>('[data-profile-action="select-gender"]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          if (this.genderBusy) return;
          const val = btn.dataset.genderValue;
          if (val !== 'male' && val !== 'female') return;
          this.genderBusy = true;
          this.genderPopupOpen = false;
          void Promise.resolve(this.callbacks.onUpdateGender(val)).finally(() => {
            this.genderBusy = false;
            if (this.isOpen) {
              this.render();
            }
          });
        });
      });

    this.cardContainerEl
      .querySelector('[data-profile-action="start-rename"]')
      ?.addEventListener('click', () => {
        this.renameMode = 'editing';
        this.pendingNewName = v.username;
        this.feedbackMessage = null;
        this.render();
        const inputEl = this.cardContainerEl.querySelector<HTMLInputElement>(
          '[data-profile-role="rename-input"]',
        );
        inputEl?.focus();
        inputEl?.select();
      });

    this.cardContainerEl
      .querySelector('[data-profile-action="open-glb-import"]')
      ?.addEventListener('click', () => {
        if (!this.isDeveloperVerified || !this.snapshot.isDeveloper || this.remoteProfile) return;
        this.close();
        this.callbacks.onOpenGlbImport?.();
      });

    this.cardContainerEl
      .querySelector('[data-profile-action="sign-out"]')
      ?.addEventListener('click', () => {
        if (this.signingOut || !this.callbacks.onSignOut) return;
        this.signingOut = true;
        this.render();
        void Promise.resolve(this.callbacks.onSignOut()).finally(() => {
          this.signingOut = false;
          this.close();
        });
      });

    this.cardContainerEl
      .querySelector('[data-profile-action="cancel-rename"]')
      ?.addEventListener('click', () => {
        if (this.renameBusy) return;
        this.renameMode = 'view';
        this.pendingNewName = '';
        this.feedbackMessage = null;
        this.render();
      });

    const submitRename = () => {
      if (this.renameBusy) return;
      const input = this.cardContainerEl.querySelector<HTMLInputElement>(
        '[data-profile-role="rename-input"]',
      );
      const val = (input?.value ?? '')
        .replace(/[\r\n\t<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (val.length < 2 || val.length > 18 || !/^[\p{L}\p{N} _.-]{2,18}$/u.test(val)) {
        this.pendingNewName = val;
        this.feedbackMessage = {
          type: 'error',
          text: i18n.t('profile.err.length'),
        };
        this.render();
        return;
      }
      if (val.toLowerCase() === this.snapshot.username.trim().toLowerCase()) {
        this.pendingNewName = val;
        this.feedbackMessage = {
          type: 'error',
          text: i18n.t('profile.err.sameName'),
        };
        this.render();
        return;
      }

      this.pendingNewName = val;
      this.renameBusy = true;
      this.feedbackMessage = null;
      this.render();
      void this.callbacks
        .onRenameOnce(val)
        .then(() => {
          this.renameBusy = false;
          this.renameMode = 'view';
          this.pendingNewName = '';
          this.feedbackMessage = {
            type: 'success',
            text: i18n.t('profile.renameSuccessMsg'),
          };
          this.render();
        })
        .catch((err) => {
          this.renameBusy = false;
          this.feedbackMessage = {
            type: 'error',
            text:
              err instanceof Error
                ? i18n.translateServerMessage(err.message)
                : i18n.t('profile.renameCouldNotUpdate'),
          };
          this.render();
        });
    };

    this.cardContainerEl
      .querySelector('[data-profile-action="save-rename"]')
      ?.addEventListener('click', submitRename);

    this.cardContainerEl
      .querySelector<HTMLInputElement>('[data-profile-role="rename-input"]')
      ?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitRename();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (!this.renameBusy) {
            this.renameMode = 'view';
            this.pendingNewName = '';
            this.feedbackMessage = null;
            this.render();
          }
        }
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
    if (this.copyConfirmTimer) {
      clearTimeout(this.copyConfirmTimer);
      this.copyConfirmTimer = 0;
    }
    this.characterStage.dispose();
    this.i18nUnsubscribe?.();
    this.i18nUnsubscribe = null;
  }
}
