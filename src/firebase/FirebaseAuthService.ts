import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from './firebaseApp';
import {
  detectAuthPlatform,
  getFirebaseAuthErrorCode,
  type AuthPlatformKind,
} from './auth/AuthAdapter';

export interface FirebaseAuthUserSummary {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface FirebaseAuthState {
  initialized: boolean;
  busy: boolean;
  user: FirebaseAuthUserSummary | null;
  error: string | null;
}

export type FirebaseAuthListener = (state: FirebaseAuthState, rawUser: User | null) => void;

function toUserSummary(user: User | null): FirebaseAuthUserSummary | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
    emailVerified: user.emailVerified,
  };
}

function mapFirebaseAuthErrorMessage(err: unknown): string {
  const code = getFirebaseAuthErrorCode(err);
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters with letters and numbers.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email, username, or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a minute before trying again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Authentication for this project.';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication servers. Check your connection and try again.';
    case 'auth/user-disabled':
      return 'This NEXUS ROYAL ID account has been disabled.';
    case 'auth/requires-recent-login':
      return 'Please sign in again to complete this security action.';
    case 'auth/web-storage-unsupported':
      return 'Browser storage is disabled or unsupported. Enable storage and try again.';
    default:
      return err instanceof Error ? err.message : 'Unable to complete authentication.';
  }
}

export class FirebaseAuthService {
  private state: FirebaseAuthState = {
    initialized: false,
    busy: false,
    user: null,
    error: null,
  };
  private currentUser: User | null = null;
  private readonly listeners = new Set<FirebaseAuthListener>();
  private readonly unsubAuth: Unsubscribe;
  private initialAuthResolve: ((user: User | null) => void) | null = null;
  private readonly initialAuthPromise: Promise<User | null>;

  constructor() {
    this.initialAuthPromise = new Promise<User | null>((resolve) => {
      this.initialAuthResolve = resolve;
    });

    this.unsubAuth = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        this.currentUser = user;
        this.syncAuthState();
      },
      (error) => {
        this.currentUser = null;
        this.syncAuthState(mapFirebaseAuthErrorMessage(error));
      },
    );
  }

  getActivePlatform(): AuthPlatformKind {
    return detectAuthPlatform();
  }

  private syncAuthState(explicitError?: string | null): void {
    const errorMessage = explicitError !== undefined ? explicitError : null;
    this.state = {
      initialized: true,
      busy: false,
      user: toUserSummary(this.currentUser),
      error: errorMessage,
    };

    if (this.initialAuthResolve) {
      this.initialAuthResolve(this.currentUser);
      this.initialAuthResolve = null;
    }
    this.emit();
  }

  getState(): FirebaseAuthState {
    return { ...this.state };
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isSignedIn(): boolean {
    return Boolean(this.currentUser && this.currentUser.emailVerified);
  }

  isPendingVerification(): boolean {
    return Boolean(this.currentUser && !this.currentUser.emailVerified);
  }

  waitForInitialAuth(): Promise<User | null> {
    return this.initialAuthPromise;
  }

  async getIdToken(forceRefresh = false): Promise<string | null> {
    if (!this.currentUser) return null;
    try {
      return await this.currentUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }

  async registerWithNexusId(
    username: string,
    email: string,
    password: string,
  ): Promise<User> {
    this.state = { ...this.state, busy: true, error: null };
    this.emit();
    try {
      const cleanEmail = email.trim();
      const cleanUsername = username.trim();
      const cred = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
      try {
        await updateProfile(cred.user, { displayName: cleanUsername });
      } catch {
        // Non-fatal; Firestore and RankedStore hold authoritative username
      }
      try {
        await sendEmailVerification(cred.user);
      } catch (verifyErr) {
        console.warn('Initial verification email failed:', verifyErr);
      }
      this.currentUser = cred.user;
      this.state = {
        initialized: true,
        busy: false,
        user: toUserSummary(cred.user),
        error: null,
      };
      this.emit();
      return cred.user;
    } catch (error) {
      const message = mapFirebaseAuthErrorMessage(error);
      this.state = {
        ...this.state,
        busy: false,
        error: message,
      };
      this.emit();
      throw new Error(message);
    }
  }

  async signInWithEmail(email: string, password: string): Promise<User> {
    this.state = { ...this.state, busy: true, error: null };
    this.emit();
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      if (!cred.user.emailVerified) {
        try {
          await reload(cred.user);
        } catch {
          // Ignore transient reload issues
        }
      }
      this.currentUser = firebaseAuth.currentUser || cred.user;
      this.state = {
        initialized: true,
        busy: false,
        user: toUserSummary(this.currentUser),
        error: null,
      };
      this.emit();
      return this.currentUser;
    } catch (error) {
      const message = mapFirebaseAuthErrorMessage(error);
      this.state = {
        ...this.state,
        busy: false,
        error: message,
      };
      this.emit();
      throw new Error(message);
    }
  }

  async resendVerificationEmail(): Promise<void> {
    const user = firebaseAuth.currentUser || this.currentUser;
    if (!user) {
      throw new Error('No pending NEXUS ROYAL ID session found. Please sign in first.');
    }
    this.state = { ...this.state, busy: true, error: null };
    this.emit();
    try {
      await sendEmailVerification(user);
      this.state = {
        ...this.state,
        busy: false,
        error: null,
      };
      this.emit();
    } catch (error) {
      const message = mapFirebaseAuthErrorMessage(error);
      this.state = {
        ...this.state,
        busy: false,
        error: message,
      };
      this.emit();
      throw new Error(message);
    }
  }

  async reloadVerificationStatus(): Promise<User | null> {
    const user = firebaseAuth.currentUser || this.currentUser;
    if (!user) {
      return null;
    }
    this.state = { ...this.state, busy: true, error: null };
    this.emit();
    try {
      await reload(user);
      if (user.emailVerified) {
        await user.getIdToken(true);
      }
      this.currentUser = firebaseAuth.currentUser || user;
      this.state = {
        initialized: true,
        busy: false,
        user: toUserSummary(this.currentUser),
        error: null,
      };
      this.emit();
      return this.currentUser;
    } catch (error) {
      const message = mapFirebaseAuthErrorMessage(error);
      this.state = {
        ...this.state,
        busy: false,
        error: message,
      };
      this.emit();
      throw new Error(message);
    }
  }

  async sendResetPasswordEmail(email: string): Promise<void> {
    this.state = { ...this.state, busy: true, error: null };
    this.emit();
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      this.state = {
        ...this.state,
        busy: false,
        error: null,
      };
      this.emit();
    } catch (error) {
      const message = mapFirebaseAuthErrorMessage(error);
      this.state = {
        ...this.state,
        busy: false,
        error: message,
      };
      this.emit();
      throw new Error(message);
    }
  }

  async updateDisplayUsername(username: string): Promise<void> {
    const user = firebaseAuth.currentUser || this.currentUser;
    if (!user) return;
    try {
      await updateProfile(user, { displayName: username.trim() });
      this.currentUser = firebaseAuth.currentUser || user;
      this.state = {
        ...this.state,
        user: toUserSummary(this.currentUser),
      };
      this.emit();
    } catch {
      // Non-fatal if displayName profile sync fails transiently
    }
  }

  async signOutUser(beforeSignOut?: () => Promise<void> | void): Promise<void> {
    this.state = { ...this.state, busy: true, error: null };
    this.emit();
    try {
      if (beforeSignOut) {
        await beforeSignOut();
      }
      await signOut(firebaseAuth);
      this.currentUser = null;
      this.state = {
        initialized: true,
        busy: false,
        user: null,
        error: null,
      };
      this.emit();
    } catch (error) {
      const message = mapFirebaseAuthErrorMessage(error);
      this.state = {
        ...this.state,
        busy: false,
        error: message,
      };
      this.emit();
      throw new Error(message);
    }
  }

  onChange(listener: FirebaseAuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.getState();
    for (const listener of this.listeners) {
      listener(snap, this.currentUser);
    }
  }

  dispose(): void {
    this.unsubAuth();
    this.listeners.clear();
  }
}
