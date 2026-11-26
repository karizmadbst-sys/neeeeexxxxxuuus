import authBackdropUrl from '../../assets/images/nexus_auth_backdrop_1795393680202.jpg';
import type { FirebaseAuthState } from '../../firebase/FirebaseAuthService';
import { i18n } from '../../i18n/I18nManager';

export interface AuthScreenPreparedAccount {
  uid: string;
  username: string;
  playerId: string;
  numericId: string;
  isNewAccount?: boolean;
}

export interface AuthScreenViewState {
  authState: FirebaseAuthState;
  preparingAccount: boolean;
  enteringLobby: boolean;
  preparedAccount: AuthScreenPreparedAccount | null;
  errorMessage: string | null;
}

export interface UsernameAvailabilityResult {
  available: boolean;
  valid: boolean;
  cleaned?: string;
  code?: string;
  error?: string;
}

export interface AuthScreenCallbacks {
  onSignInNexusId: (identifier: string, password: string) => Promise<void>;
  onRegisterNexusId: (username: string, email: string, password: string) => Promise<void>;
  onRecoverNexusId: (identifier: string) => Promise<string>;
  onCheckNexusUsername: (username: string) => Promise<UsernameAvailabilityResult>;
  onResendNexusVerification: () => Promise<void>;
  onCheckNexusVerification: () => Promise<boolean>;
  onSignOutNexusId: () => Promise<void>;
  onLoginEnterGame: () => Promise<void>;
}

type AuthPanelMode = 'signin' | 'register' | 'recover';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const USERNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,18}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NEXUS_LOGO_SVG = `
  <svg class="w-12 h-12 sm:w-16 sm:h-16 shrink-0" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <polygon points="32,4 58,19 58,45 32,60 6,45 6,19" stroke="#f97316" stroke-width="2.5" fill="rgba(249,115,22,0.12)" />
    <polygon points="32,14 48,23 48,41 32,50 16,41 16,23" stroke="#38bdf8" stroke-width="2" />
    <circle cx="32" cy="32" r="5" fill="#f97316" />
  </svg>
`;

export class AuthScreen {
  readonly element: HTMLElement;
  private readonly contentHostEl: HTMLElement;
  private i18nUnsubscribe: (() => void) | null = null;

  private panelMode: AuthPanelMode = 'signin';
  private showPassword = false;
  private subBusy = false;

  // Draft input preservation across auth/i18n updates
  private signInIdentifier = '';
  private signInPassword = '';
  private regUsername = '';
  private regEmail = '';
  private regPassword = '';
  private regConfirmPassword = '';
  private recoverIdentifier = '';

  private localError: string | null = null;
  private localNotice: string | null = null;

  private usernameStatus: {
    state: 'idle' | 'checking' | 'available' | 'invalid';
    text: string;
  } = { state: 'idle', text: '' };
  private usernameCheckTimer = 0;
  private usernameCheckSeq = 0;

  private resendCooldownSec = 0;
  private resendCooldownTimer = 0;
  private copyConfirmed = false;
  private copyConfirmTimer = 0;

  private viewState: AuthScreenViewState = {
    authState: {
      initialized: false,
      busy: false,
      user: null,
      error: null,
    },
    preparingAccount: false,
    enteringLobby: false,
    preparedAccount: null,
    errorMessage: null,
  };

  constructor(private readonly callbacks: AuthScreenCallbacks) {
    this.element = document.createElement('div');
    this.element.className =
      'absolute inset-0 z-40 flex flex-col justify-between bg-[#070b14] pointer-events-auto overflow-hidden';
    this.element.setAttribute('data-screen', 'auth');

    this.element.innerHTML = `
      <!-- Cinematic Battle Royale Key-Art Backdrop -->
      <div
        class="absolute inset-0 pointer-events-none overflow-hidden"
        style="background: radial-gradient(circle at 72% 28%, rgba(56,189,248,0.16) 0%, rgba(249,115,22,0.08) 34%, #070b14 78%);"
        aria-hidden="true"
      >
        <img
          src="${authBackdropUrl}"
          alt=""
          referrerpolicy="no-referrer"
          decoding="async"
          class="w-full h-full object-cover object-center opacity-80 nexus-auth-backdrop-anim select-none"
        />
        <div
          class="absolute inset-0"
          style="background: linear-gradient(108deg, rgba(7,11,20,0.94) 0%, rgba(7,11,20,0.78) 46%, rgba(7,11,20,0.52) 100%);"
        ></div>
        <div
          class="absolute inset-0"
          style="background: linear-gradient(180deg, rgba(7,11,20,0.72) 0%, rgba(7,11,20,0.18) 38%, rgba(7,11,20,0.88) 100%);"
        ></div>
      </div>

      <!-- Responsive Scrollable Layout Container -->
      <div
        data-role="auth-content-host"
        class="relative z-10 w-full h-full safe-pad nexus-scroll overflow-y-auto flex flex-col justify-between"
      ></div>
    `;

    this.contentHostEl = this.element.querySelector('[data-role="auth-content-host"]')!;
    this.render();

    this.i18nUnsubscribe = i18n.subscribe(() => {
      this.render();
    });
  }

  setState(next: Partial<AuthScreenViewState>): void {
    const prevUserUid = this.viewState.authState.user?.uid ?? null;
    this.viewState = {
      ...this.viewState,
      ...next,
    };
    const nextUserUid = this.viewState.authState.user?.uid ?? null;
    if (next.errorMessage !== undefined) {
      this.localError = next.errorMessage;
    }
    if (prevUserUid && !nextUserUid) {
      this.signInPassword = '';
      this.regPassword = '';
      this.regConfirmPassword = '';
    }
    this.render();
  }

  private isBusy(): boolean {
    return (
      this.subBusy ||
      this.viewState.authState.busy ||
      this.viewState.preparingAccount ||
      this.viewState.enteringLobby
    );
  }

  private isEnterEnabled(): boolean {
    const { authState, preparingAccount, enteringLobby, preparedAccount } = this.viewState;
    return Boolean(
      authState.initialized &&
        !this.subBusy &&
        !authState.busy &&
        !preparingAccount &&
        !enteringLobby &&
        authState.user &&
        authState.user.emailVerified &&
        preparedAccount &&
        preparedAccount.uid === authState.user.uid,
    );
  }

  private updateUsernameStatusDom(): void {
    const el = this.contentHostEl.querySelector<HTMLElement>('[data-role="username-status"]');
    if (!el) return;
    if (this.usernameStatus.state === 'idle' || !this.usernameStatus.text) {
      el.className = 'text-[11px] font-medium text-slate-400 min-h-[16px]';
      el.textContent = '';
      return;
    }
    const colorCls =
      this.usernameStatus.state === 'available'
        ? 'text-emerald-300'
        : this.usernameStatus.state === 'checking'
          ? 'text-sky-300'
          : 'text-rose-300';
    el.className = `text-[11px] font-semibold min-h-[16px] ${colorCls}`;
    el.textContent = this.usernameStatus.text;
  }

  private scheduleUsernameCheck(raw: string): void {
    if (this.usernameCheckTimer) {
      clearTimeout(this.usernameCheckTimer);
      this.usernameCheckTimer = 0;
    }
    const seq = ++this.usernameCheckSeq;
    const cleaned = raw.replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      this.usernameStatus = { state: 'idle', text: '' };
      this.updateUsernameStatusDom();
      return;
    }
    if (!USERNAME_PATTERN.test(cleaned)) {
      this.usernameStatus = {
        state: 'invalid',
        text: i18n.t('auth.errUsernameInvalid'),
      };
      this.updateUsernameStatusDom();
      return;
    }

    this.usernameStatus = {
      state: 'checking',
      text: i18n.t('auth.usernameCheck.checking'),
    };
    this.updateUsernameStatusDom();

    this.usernameCheckTimer = window.setTimeout(() => {
      this.usernameCheckTimer = 0;
      void this.callbacks
        .onCheckNexusUsername(cleaned)
        .then((res) => {
          if (seq !== this.usernameCheckSeq) return;
          if (!res.valid) {
            this.usernameStatus = {
              state: 'invalid',
              text: res.error ? i18n.translateServerMessage(res.error, res.code) : i18n.t('auth.errUsernameInvalid'),
            };
          } else if (!res.available) {
            this.usernameStatus = {
              state: 'invalid',
              text: i18n.t('auth.usernameCheck.taken'),
            };
          } else {
            this.usernameStatus = {
              state: 'available',
              text: i18n.t('auth.usernameCheck.available'),
            };
          }
          this.updateUsernameStatusDom();
        })
        .catch(() => {
          if (seq !== this.usernameCheckSeq) return;
          this.usernameStatus = { state: 'idle', text: '' };
          this.updateUsernameStatusDom();
        });
    }, 350);
  }

  private startResendCooldown(seconds = 60): void {
    if (this.resendCooldownTimer) {
      clearInterval(this.resendCooldownTimer);
      this.resendCooldownTimer = 0;
    }
    this.resendCooldownSec = seconds;
    this.resendCooldownTimer = window.setInterval(() => {
      this.resendCooldownSec = Math.max(0, this.resendCooldownSec - 1);
      if (this.resendCooldownSec === 0) {
        clearInterval(this.resendCooldownTimer);
        this.resendCooldownTimer = 0;
      }
      const btn = this.contentHostEl.querySelector<HTMLButtonElement>('[data-action="verify-resend"]');
      if (btn) {
        btn.disabled = this.isBusy() || this.resendCooldownSec > 0;
        btn.textContent =
          this.resendCooldownSec > 0
            ? i18n.t('auth.verify.resendCooldown', { sec: this.resendCooldownSec })
            : i18n.t('auth.verify.resendBtn');
      }
    }, 1000);
  }

  private renderCardBodyHtml(): string {
    const { authState, preparingAccount, enteringLobby, preparedAccount, errorMessage } =
      this.viewState;
    const user = authState.user;
    const busy = this.isBusy();
    const combinedError = this.localError || errorMessage || authState.error || null;

    const errorBannerHtml = combinedError
      ? `
        <div
          role="alert"
          data-role="auth-error-box"
          class="rounded-md bg-rose-950/75 border border-rose-400/65 px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-semibold text-rose-100"
        >
          <svg class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span class="leading-snug">${escapeHtml(combinedError)}</span>
        </div>
      `
      : '';

    const noticeBannerHtml = this.localNotice
      ? `
        <div
          role="status"
          data-role="auth-notice-box"
          class="rounded-md bg-emerald-950/65 border border-emerald-400/55 px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-semibold text-emerald-100"
        >
          <svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span class="leading-snug">${escapeHtml(this.localNotice)}</span>
        </div>
      `
      : '';

    // 1. Initial boot restore or cloud hydration after verification
    if (!authState.initialized || (user?.emailVerified && preparingAccount && !preparedAccount)) {
      const msg = !authState.initialized
        ? i18n.t('auth.restoringSession')
        : i18n.t('auth.preparingProfile');
      return `
        ${errorBannerHtml}
        <div
          data-role="auth-status-loading"
          class="rounded-md bg-slate-900/90 border border-sky-400/35 px-4 py-4 flex items-center gap-3"
        >
          <span class="w-4 h-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shrink-0" aria-hidden="true"></span>
          <span class="text-xs font-semibold text-slate-200">${escapeHtml(msg)}</span>
        </div>
      `;
    }

    // 2. Signed in, pending email verification gate
    if (user && !user.emailVerified) {
      const resendDisabled = busy || this.resendCooldownSec > 0;
      const resendLabel =
        this.resendCooldownSec > 0
          ? i18n.t('auth.verify.resendCooldown', { sec: this.resendCooldownSec })
          : i18n.t('auth.verify.resendBtn');

      return `
        ${errorBannerHtml}
        ${noticeBannerHtml}
        <div
          data-role="auth-verify-gate"
          class="rounded-md bg-slate-900/90 border border-amber-400/55 p-4 flex flex-col gap-3"
        >
          <div class="flex flex-col gap-1">
            <div class="text-xs font-black tracking-[0.16em] uppercase text-amber-300">
              ${escapeHtml(i18n.t('auth.verify.title'))}
            </div>
            <p class="text-xs text-slate-200 leading-relaxed">
              ${escapeHtml(i18n.t('auth.verify.subtitle', { email: user.email || '' }))}
            </p>
          </div>

          <button
            type="button"
            data-action="verify-check"
            ${busy ? 'disabled' : ''}
            class="nexus-btn-primary w-full min-h-[48px] px-4 py-3 rounded-md font-black text-xs sm:text-sm tracking-[0.14em] uppercase flex items-center justify-center disabled:opacity-55 disabled:cursor-not-allowed"
          >
            ${escapeHtml(busy ? i18n.t('auth.verify.checking') : i18n.t('auth.verify.continueBtn'))}
          </button>

          <button
            type="button"
            data-action="verify-resend"
            ${resendDisabled ? 'disabled' : ''}
            class="nexus-btn-secondary w-full min-h-[44px] px-4 py-2.5 rounded-md font-bold text-xs tracking-[0.12em] uppercase tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ${escapeHtml(resendLabel)}
          </button>

          <button
            type="button"
            data-action="auth-sign-out"
            ${busy ? 'disabled' : ''}
            class="w-full min-h-[44px] px-3 py-2 text-xs font-bold tracking-wider uppercase text-slate-300 hover:text-rose-300 transition-colors disabled:opacity-50"
          >
            ${escapeHtml(i18n.t('auth.verify.switchAccount'))}
          </button>
        </div>
      `;
    }

    // 3. Verified & hydrated NEXUS ROYAL ID ready to enter lobby
    if (user && user.emailVerified && preparedAccount && preparedAccount.uid === user.uid) {
      const enterReady = this.isEnterEnabled();
      const initials = (preparedAccount.username || user.email || 'NX').slice(0, 1).toUpperCase();
      return `
        ${errorBannerHtml}
        ${noticeBannerHtml}
        <div
          data-role="auth-verified-box"
          class="rounded-md bg-emerald-950/50 border border-emerald-400/55 px-4 py-3.5 flex flex-col gap-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <svg class="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span class="text-[11px] font-black tracking-[0.14em] uppercase text-emerald-300 truncate">
                ${escapeHtml(i18n.t('auth.authenticatedTitle'))}
              </span>
            </div>
            <button
              type="button"
              data-action="auth-sign-out"
              ${busy ? 'disabled' : ''}
              class="min-h-[36px] px-2 text-[11px] font-extrabold tracking-wider uppercase text-slate-300 hover:text-rose-300 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >${escapeHtml(i18n.t('auth.signOut'))}</button>
          </div>

          <div class="flex items-center gap-3 min-w-0 pt-2 border-t border-emerald-500/20">
            <span class="w-11 h-11 rounded-md bg-emerald-500/20 border border-emerald-400/70 flex items-center justify-center text-base font-black text-emerald-200 shrink-0">
              ${escapeHtml(initials)}
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-base font-black text-white truncate">
                ${escapeHtml(preparedAccount.username)}
              </div>
              <div class="text-[11px] font-medium text-slate-300 truncate">
                ${escapeHtml(user.email || '')}
              </div>
            </div>
          </div>

          <div class="rounded bg-slate-950/85 border border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[10px] font-extrabold tracking-widest uppercase text-slate-400">
                ${escapeHtml(i18n.t('auth.playerIdLabel'))}
              </div>
              <div class="text-sm font-black text-sky-300 tabular-nums truncate">
                ${escapeHtml(preparedAccount.numericId)}
              </div>
              <div class="text-[10px] font-semibold text-slate-500 tabular-nums truncate">
                ${escapeHtml(i18n.t('auth.playerUniqueCode'))}: ${escapeHtml(preparedAccount.playerId)}
              </div>
            </div>
            <button
              type="button"
              data-action="auth-copy-id"
              class="nexus-btn-secondary min-h-[38px] px-3 py-1.5 rounded text-[11px] font-extrabold tracking-wider uppercase shrink-0 ${
                this.copyConfirmed ? 'border-emerald-400/70 text-emerald-300' : ''
              }"
            >
              ${escapeHtml(this.copyConfirmed ? i18n.t('profile.idCopied') : i18n.t('profile.copyId'))}
            </button>
          </div>

          <div class="text-[11px] font-semibold text-emerald-200/95">
            ${escapeHtml(i18n.t('auth.authenticatedReady'))}
          </div>
        </div>

        <button
          type="button"
          data-action="auth-login-enter"
          ${enterReady ? '' : 'disabled aria-disabled="true"'}
          class="nexus-btn-primary w-full py-3.5 px-5 rounded-md font-black text-base tracking-[0.2em] uppercase flex items-center justify-center gap-2.5 min-h-[52px] cursor-pointer shadow-[0_0_28px_rgba(249,115,22,0.35)] disabled:opacity-55 disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6,4 20,12 6,20" /></svg>
          <span>${escapeHtml(enteringLobby ? i18n.t('auth.enteringLobby') : i18n.t('auth.loginBtn'))}</span>
        </button>
      `;
    }

    // 4. Password Recovery form
    if (this.panelMode === 'recover') {
      return `
        ${errorBannerHtml}
        ${noticeBannerHtml}
        <form data-form="recover" class="flex flex-col gap-3.5" novalidate>
          <div class="flex flex-col gap-1">
            <h3 class="text-xs font-black tracking-[0.16em] uppercase text-sky-300">
              ${escapeHtml(i18n.t('auth.recover.title'))}
            </h3>
            <p class="text-xs text-slate-300 leading-relaxed">
              ${escapeHtml(i18n.t('auth.recover.subtitle'))}
            </p>
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-300">
              ${escapeHtml(i18n.t('auth.field.identifier'))}
            </span>
            <input
              type="text"
              data-field="recover-identifier"
              autocomplete="username"
              maxlength="254"
              value="${escapeHtml(this.recoverIdentifier)}"
              placeholder="${escapeHtml(i18n.t('auth.field.identifierPlaceholder'))}"
              class="w-full min-h-[44px] bg-slate-950/90 border border-slate-700 focus:border-sky-400 focus:outline-none rounded-md px-3.5 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500"
            />
          </label>

          <button
            type="submit"
            ${busy ? 'disabled' : ''}
            class="nexus-btn-primary w-full min-h-[48px] px-4 py-3 rounded-md font-black text-xs sm:text-sm tracking-[0.16em] uppercase disabled:opacity-55 disabled:cursor-not-allowed"
          >
            ${escapeHtml(busy ? i18n.t('auth.recover.sending') : i18n.t('auth.recover.sendBtn'))}
          </button>

          <button
            type="button"
            data-action="switch-mode"
            data-mode="signin"
            ${busy ? 'disabled' : ''}
            class="w-full min-h-[44px] text-xs font-bold tracking-wider uppercase text-sky-300 hover:text-sky-200 transition-colors"
          >
            ${escapeHtml(i18n.t('auth.btn.backToSignIn'))}
          </button>
        </form>
      `;
    }

    // 5. Mode switcher + Sign In / Register forms
    const isReg = this.panelMode === 'register';
    const tabsHtml = `
      <div class="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-slate-950/90 border border-slate-800">
        <button
          type="button"
          data-action="switch-mode"
          data-mode="signin"
          ${busy ? 'disabled' : ''}
          class="min-h-[44px] rounded text-xs font-black tracking-[0.14em] uppercase transition-colors ${
            !isReg
              ? 'bg-orange-500 text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }"
        >
          ${escapeHtml(i18n.t('auth.tab.signIn'))}
        </button>
        <button
          type="button"
          data-action="switch-mode"
          data-mode="register"
          ${busy ? 'disabled' : ''}
          class="min-h-[44px] rounded text-xs font-black tracking-[0.14em] uppercase transition-colors ${
            isReg
              ? 'bg-orange-500 text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }"
        >
          ${escapeHtml(i18n.t('auth.tab.register'))}
        </button>
      </div>
    `;

    if (isReg) {
      const statusCls =
        this.usernameStatus.state === 'available'
          ? 'text-emerald-300'
          : this.usernameStatus.state === 'checking'
            ? 'text-sky-300'
            : this.usernameStatus.state === 'invalid'
              ? 'text-rose-300'
              : 'text-slate-400';

      return `
        ${tabsHtml}
        ${errorBannerHtml}
        ${noticeBannerHtml}
        <form data-form="register" class="flex flex-col gap-3" novalidate>
          <div class="flex flex-col gap-1">
            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-300">
                ${escapeHtml(i18n.t('auth.field.username'))}
              </span>
              <input
                type="text"
                data-field="reg-username"
                autocomplete="nickname"
                maxlength="18"
                value="${escapeHtml(this.regUsername)}"
                placeholder="${escapeHtml(i18n.t('auth.field.usernamePlaceholder'))}"
                class="w-full min-h-[44px] bg-slate-950/90 border border-slate-700 focus:border-sky-400 focus:outline-none rounded-md px-3.5 py-2 text-sm font-semibold text-white placeholder:text-slate-500"
              />
            </label>
            <div data-role="username-status" class="text-[11px] font-semibold min-h-[16px] ${statusCls}">
              ${escapeHtml(this.usernameStatus.text)}
            </div>
          </div>

          <label class="flex flex-col gap-1">
            <span class="text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-300">
              ${escapeHtml(i18n.t('auth.field.email'))}
            </span>
            <input
              type="email"
              data-field="reg-email"
              autocomplete="email"
              maxlength="254"
              value="${escapeHtml(this.regEmail)}"
              placeholder="${escapeHtml(i18n.t('auth.field.emailPlaceholder'))}"
              class="w-full min-h-[44px] bg-slate-950/90 border border-slate-700 focus:border-sky-400 focus:outline-none rounded-md px-3.5 py-2 text-sm font-semibold text-white placeholder:text-slate-500"
            />
          </label>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-300">
                ${escapeHtml(i18n.t('auth.field.password'))}
              </span>
              <input
                type="${this.showPassword ? 'text' : 'password'}"
                data-field="reg-password"
                autocomplete="new-password"
                maxlength="128"
                value="${escapeHtml(this.regPassword)}"
                placeholder="${escapeHtml(i18n.t('auth.field.passwordPlaceholder'))}"
                class="w-full min-h-[44px] bg-slate-950/90 border border-slate-700 focus:border-sky-400 focus:outline-none rounded-md px-3.5 py-2 text-sm font-semibold text-white placeholder:text-slate-500"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-300">
                ${escapeHtml(i18n.t('auth.field.confirmPassword'))}
              </span>
              <input
                type="${this.showPassword ? 'text' : 'password'}"
                data-field="reg-confirm"
                autocomplete="new-password"
                maxlength="128"
                value="${escapeHtml(this.regConfirmPassword)}"
                placeholder="${escapeHtml(i18n.t('auth.field.confirmPlaceholder'))}"
                class="w-full min-h-[44px] bg-slate-950/90 border border-slate-700 focus:border-sky-400 focus:outline-none rounded-md px-3.5 py-2 text-sm font-semibold text-white placeholder:text-slate-500"
              />
            </label>
          </div>

          <button
            type="submit"
            ${busy ? 'disabled' : ''}
            class="nexus-btn-primary w-full min-h-[48px] px-4 py-3 rounded-md font-black text-xs sm:text-sm tracking-[0.16em] uppercase mt-1 disabled:opacity-55 disabled:cursor-not-allowed"
          >
            ${escapeHtml(busy ? i18n.t('auth.btn.registering') : i18n.t('auth.btn.register'))}
          </button>

          <button
            type="button"
            data-action="switch-mode"
            data-mode="signin"
            ${busy ? 'disabled' : ''}
            class="w-full min-h-[40px] text-xs font-semibold text-slate-300 hover:text-sky-300 transition-colors"
          >
            ${escapeHtml(i18n.t('auth.btn.haveAccount'))}
          </button>
        </form>
      `;
    }

    return `
      ${tabsHtml}
      ${errorBannerHtml}
      ${noticeBannerHtml}
      <form data-form="signin" class="flex flex-col gap-3.5" novalidate>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-300">
            ${escapeHtml(i18n.t('auth.field.identifier'))}
          </span>
          <input
            type="text"
            data-field="signin-identifier"
            autocomplete="username"
            maxlength="254"
            value="${escapeHtml(this.signInIdentifier)}"
            placeholder="${escapeHtml(i18n.t('auth.field.identifierPlaceholder'))}"
            class="w-full min-h-[44px] bg-slate-950/90 border border-slate-700 focus:border-sky-400 focus:outline-none rounded-md px-3.5 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-300">
            ${escapeHtml(i18n.t('auth.field.password'))}
          </span>
          <input
            type="${this.showPassword ? 'text' : 'password'}"
            data-field="signin-password"
            autocomplete="current-password"
            maxlength="128"
            value="${escapeHtml(this.signInPassword)}"
            placeholder="${escapeHtml(i18n.t('auth.field.passwordPlaceholder'))}"
            class="w-full min-h-[44px] bg-slate-950/90 border border-slate-700 focus:border-sky-400 focus:outline-none rounded-md px-3.5 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500"
          />
        </label>

        <button
          type="submit"
          ${busy ? 'disabled' : ''}
          class="nexus-btn-primary w-full min-h-[48px] px-4 py-3 rounded-md font-black text-xs sm:text-sm tracking-[0.16em] uppercase disabled:opacity-55 disabled:cursor-not-allowed"
        >
          ${escapeHtml(busy ? i18n.t('auth.signingIn') : i18n.t('auth.btn.signIn'))}
        </button>

        <div class="flex items-center justify-between gap-2 pt-0.5">
          <button
            type="button"
            data-action="switch-mode"
            data-mode="recover"
            ${busy ? 'disabled' : ''}
            class="min-h-[40px] text-xs font-semibold text-sky-300 hover:text-sky-200 transition-colors"
          >
            ${escapeHtml(i18n.t('auth.btn.forgotPassword'))}
          </button>
          <button
            type="button"
            data-action="switch-mode"
            data-mode="register"
            ${busy ? 'disabled' : ''}
            class="min-h-[40px] text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            ${escapeHtml(i18n.t('auth.btn.noAccount'))}
          </button>
        </div>
      </form>
    `;
  }

  private render(): void {
    const activeFieldAttr =
      (document.activeElement as HTMLElement | null)?.getAttribute?.('data-field') || null;
    const selectionStart =
      document.activeElement instanceof HTMLInputElement
        ? document.activeElement.selectionStart
        : null;

    this.contentHostEl.innerHTML = `
      <!-- Top Header Classification -->
      <header class="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 shrink-0 pb-2">
        <div class="text-[10px] sm:text-xs font-extrabold tracking-[0.24em] uppercase text-sky-300/90">
          ${escapeHtml(i18n.t('auth.badge'))}
        </div>
        <div class="text-[10px] sm:text-xs font-bold tracking-[0.18em] uppercase text-slate-400">
          ${escapeHtml(i18n.t('loading.badge'))}
        </div>
      </header>

      <!-- Main Hero & NEXUS ROYAL ID Authentication Gate -->
      <main class="w-full max-w-6xl mx-auto my-auto py-3 sm:py-6 grid grid-cols-1 lg:grid-cols-[1.05fr_460px] items-center gap-6 sm:gap-10">
        <!-- Brand Hero Block -->
        <section class="flex flex-col items-center lg:items-start text-center lg:text-left gap-3 sm:gap-4">
          <div class="flex items-center gap-3 sm:gap-4">
            ${NEXUS_LOGO_SVG}
            <div class="flex flex-col items-start text-left">
              <h1 class="text-3xl sm:text-5xl xl:text-6xl font-black tracking-[0.14em] uppercase text-white leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
                ${escapeHtml(i18n.t('menu.title'))}
              </h1>
              <span class="mt-1.5 text-[11px] sm:text-xs font-extrabold tracking-[0.24em] uppercase text-orange-400">
                ${escapeHtml(i18n.t('loading.badge'))}
              </span>
            </div>
          </div>

          <p class="max-w-lg text-sm sm:text-lg font-semibold text-slate-200/95 leading-relaxed">
            "${escapeHtml(i18n.translateTagline(0))}"
          </p>

          <div class="hidden sm:flex flex-wrap items-center justify-center lg:justify-start gap-x-3 gap-y-1 text-xs font-bold tracking-wider uppercase text-slate-300/90">
            <span>${escapeHtml(i18n.t('auth.heroFeature1'))}</span>
            <span class="text-sky-400" aria-hidden="true">&middot;</span>
            <span>${escapeHtml(i18n.t('auth.heroFeature2'))}</span>
            <span class="text-sky-400" aria-hidden="true">&middot;</span>
            <span>${escapeHtml(i18n.t('auth.heroFeature3'))}</span>
          </div>
        </section>

        <!-- Authentication Control Card -->
        <section
          aria-label="${escapeHtml(i18n.t('auth.panelTitle'))}"
          class="w-full max-w-md mx-auto lg:mx-0 nexus-panel rounded-lg border border-sky-400/35 p-5 sm:p-6 flex flex-col gap-4"
        >
          <div class="flex flex-col gap-1 border-b border-slate-800/90 pb-3.5">
            <h2 class="text-sm sm:text-base font-black tracking-[0.16em] uppercase text-white">
              ${escapeHtml(i18n.t('auth.panelTitle'))}
            </h2>
            <p class="text-xs text-slate-300 leading-relaxed">
              ${escapeHtml(i18n.t('auth.panelSubtitle'))}
            </p>
          </div>

          ${this.renderCardBodyHtml()}
        </section>
      </main>

      <!-- Bottom Spacer -->
      <footer class="w-full max-w-6xl mx-auto pt-2 flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-slate-500 shrink-0">
        <span>${escapeHtml(i18n.t('menu.title'))}</span>
        <span>${escapeHtml(i18n.translateTagline(1))}</span>
      </footer>
    `;

    this.bindEvents();

    if (activeFieldAttr) {
      const restored = this.contentHostEl.querySelector<HTMLInputElement>(
        `[data-field="${activeFieldAttr}"]`,
      );
      if (restored) {
        restored.focus();
        if (selectionStart !== null) {
          try {
            restored.setSelectionRange(selectionStart, selectionStart);
          } catch {
            // Ignore selection errors on email inputs
          }
        }
      }
    }
  }

  private bindEvents(): void {
    this.contentHostEl.querySelectorAll<HTMLButtonElement>('[data-action="switch-mode"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.isBusy()) return;
        const nextMode = btn.dataset.mode as AuthPanelMode | undefined;
        if (!nextMode || (nextMode !== 'signin' && nextMode !== 'register' && nextMode !== 'recover')) {
          return;
        }
        this.panelMode = nextMode;
        this.localError = null;
        this.localNotice = null;
        if (nextMode === 'recover' && this.signInIdentifier && !this.recoverIdentifier) {
          this.recoverIdentifier = this.signInIdentifier;
        }
        this.render();
      });
    });

    const signInIdInput = this.contentHostEl.querySelector<HTMLInputElement>('[data-field="signin-identifier"]');
    signInIdInput?.addEventListener('input', () => {
      this.signInIdentifier = signInIdInput.value;
    });

    const signInPwInput = this.contentHostEl.querySelector<HTMLInputElement>('[data-field="signin-password"]');
    signInPwInput?.addEventListener('input', () => {
      this.signInPassword = signInPwInput.value;
    });

    const regUserInput = this.contentHostEl.querySelector<HTMLInputElement>('[data-field="reg-username"]');
    regUserInput?.addEventListener('input', () => {
      this.regUsername = regUserInput.value;
      this.scheduleUsernameCheck(regUserInput.value);
    });

    const regEmailInput = this.contentHostEl.querySelector<HTMLInputElement>('[data-field="reg-email"]');
    regEmailInput?.addEventListener('input', () => {
      this.regEmail = regEmailInput.value;
    });

    const regPwInput = this.contentHostEl.querySelector<HTMLInputElement>('[data-field="reg-password"]');
    regPwInput?.addEventListener('input', () => {
      this.regPassword = regPwInput.value;
    });

    const regConfirmInput = this.contentHostEl.querySelector<HTMLInputElement>('[data-field="reg-confirm"]');
    regConfirmInput?.addEventListener('input', () => {
      this.regConfirmPassword = regConfirmInput.value;
    });

    const recoverIdInput = this.contentHostEl.querySelector<HTMLInputElement>('[data-field="recover-identifier"]');
    recoverIdInput?.addEventListener('input', () => {
      this.recoverIdentifier = recoverIdInput.value;
    });

    this.contentHostEl.querySelector<HTMLFormElement>('[data-form="signin"]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isBusy()) return;
      const identifier = (signInIdInput?.value ?? this.signInIdentifier).trim();
      const password = signInPwInput?.value ?? this.signInPassword;
      if (!identifier || !password) {
        this.localError = i18n.t('auth.errInvalidCredentials');
        this.render();
        return;
      }
      this.subBusy = true;
      this.localError = null;
      this.localNotice = null;
      this.render();
      void this.callbacks
        .onSignInNexusId(identifier, password)
        .then(() => {
          this.subBusy = false;
          this.signInPassword = '';
          this.render();
        })
        .catch((err) => {
          this.subBusy = false;
          this.localError = err instanceof Error ? err.message : i18n.t('auth.errInvalidCredentials');
          this.render();
        });
    });

    this.contentHostEl.querySelector<HTMLFormElement>('[data-form="register"]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isBusy()) return;
      const username = (regUserInput?.value ?? this.regUsername)
        .replace(/[\r\n\t<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const email = (regEmailInput?.value ?? this.regEmail).trim();
      const password = regPwInput?.value ?? this.regPassword;
      const confirm = regConfirmInput?.value ?? this.regConfirmPassword;

      if (!USERNAME_PATTERN.test(username)) {
        this.localError = i18n.t('auth.errUsernameInvalid');
        this.render();
        return;
      }
      if (!EMAIL_PATTERN.test(email)) {
        this.localError = i18n.t('auth.errEmailInvalid');
        this.render();
        return;
      }
      if (password.length < 6) {
        this.localError = i18n.t('auth.errPasswordShort');
        this.render();
        return;
      }
      if (password !== confirm) {
        this.localError = i18n.t('auth.errPasswordMismatch');
        this.render();
        return;
      }

      this.subBusy = true;
      this.localError = null;
      this.localNotice = null;
      this.render();
      void this.callbacks
        .onRegisterNexusId(username, email, password)
        .then(() => {
          this.subBusy = false;
          this.regPassword = '';
          this.regConfirmPassword = '';
          this.startResendCooldown(60);
          this.render();
        })
        .catch((err) => {
          this.subBusy = false;
          this.localError = err instanceof Error ? err.message : i18n.t('auth.errInvalidCredentials');
          this.render();
        });
    });

    this.contentHostEl.querySelector<HTMLFormElement>('[data-form="recover"]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isBusy()) return;
      const identifier = (recoverIdInput?.value ?? this.recoverIdentifier).trim();
      if (!identifier) {
        this.localError = i18n.t('auth.field.identifierPlaceholder');
        this.render();
        return;
      }
      this.subBusy = true;
      this.localError = null;
      this.localNotice = null;
      this.render();
      void this.callbacks
        .onRecoverNexusId(identifier)
        .then((msg) => {
          this.subBusy = false;
          this.localNotice = msg || i18n.t('auth.recoverSentInfo');
          this.render();
        })
        .catch((err) => {
          this.subBusy = false;
          this.localError = err instanceof Error ? err.message : i18n.t('auth.errRecoverFailed');
          this.render();
        });
    });

    this.contentHostEl.querySelector('[data-action="verify-check"]')?.addEventListener('click', () => {
      if (this.isBusy()) return;
      this.subBusy = true;
      this.localError = null;
      this.localNotice = null;
      this.render();
      void this.callbacks
        .onCheckNexusVerification()
        .then((verified) => {
          this.subBusy = false;
          if (!verified) {
            this.localError = i18n.t('auth.verify.notYetVerified');
          }
          this.render();
        })
        .catch((err) => {
          this.subBusy = false;
          this.localError = err instanceof Error ? err.message : i18n.t('auth.verify.notYetVerified');
          this.render();
        });
    });

    this.contentHostEl.querySelector('[data-action="verify-resend"]')?.addEventListener('click', () => {
      if (this.isBusy() || this.resendCooldownSec > 0) return;
      this.subBusy = true;
      this.localError = null;
      this.localNotice = null;
      this.render();
      void this.callbacks
        .onResendNexusVerification()
        .then(() => {
          this.subBusy = false;
          this.localNotice = i18n.t('auth.verify.resentOk');
          this.startResendCooldown(60);
          this.render();
        })
        .catch((err) => {
          this.subBusy = false;
          this.localError = err instanceof Error ? err.message : i18n.t('auth.errSessionExpired');
          this.render();
        });
    });

    this.contentHostEl.querySelector('[data-action="auth-sign-out"]')?.addEventListener('click', () => {
      if (this.isBusy()) return;
      this.localError = null;
      this.localNotice = null;
      this.panelMode = 'signin';
      void this.callbacks.onSignOutNexusId().catch(() => {});
    });

    this.contentHostEl.querySelector('[data-action="auth-copy-id"]')?.addEventListener('click', () => {
      const idText =
        this.viewState.preparedAccount?.numericId || this.viewState.preparedAccount?.playerId;
      if (!idText) return;
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
          // Ignore fallback copy issues
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
        this.render();
      }, 1500);
      this.render();
    });

    this.contentHostEl.querySelector('[data-action="auth-login-enter"]')?.addEventListener('click', () => {
      if (!this.isEnterEnabled()) return;
      void this.callbacks.onLoginEnterGame().catch(() => {});
    });
  }

  dispose(): void {
    if (this.usernameCheckTimer) {
      clearTimeout(this.usernameCheckTimer);
      this.usernameCheckTimer = 0;
    }
    if (this.resendCooldownTimer) {
      clearInterval(this.resendCooldownTimer);
      this.resendCooldownTimer = 0;
    }
    if (this.copyConfirmTimer) {
      clearTimeout(this.copyConfirmTimer);
      this.copyConfirmTimer = 0;
    }
    this.i18nUnsubscribe?.();
    this.i18nUnsubscribe = null;
    this.element.remove();
  }
}
