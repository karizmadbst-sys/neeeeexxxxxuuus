import type { User as FirebaseUser } from 'firebase/auth';
import { isBackendReachabilityError } from '../../network/ApiResponse';

export interface SignInNexusAccountDeps {
  loginWithIdentifier: (identifier: string, password: string) => Promise<{ email: string }>;
  signInWithEmail: (email: string, password: string) => Promise<FirebaseUser>;
  onVerifiedUser: (user: FirebaseUser) => Promise<void>;
}

export const USERNAME_LOOKUP_UNAVAILABLE_ERROR =
  'Unable to reach the authentication server to look up your username. Please sign in using your registered email address.';

export async function signInNexusAccount(
  identifier: string,
  password: string,
  deps: SignInNexusAccountDeps,
): Promise<FirebaseUser> {
  const cleanIdentifier = identifier.trim();
  let email = cleanIdentifier;

  if (!cleanIdentifier.includes('@')) {
    try {
      const resolved = await deps.loginWithIdentifier(cleanIdentifier, password);
      email = resolved.email;
    } catch (err) {
      if (isBackendReachabilityError(err)) {
        throw new Error(USERNAME_LOOKUP_UNAVAILABLE_ERROR);
      }
      throw err;
    }
  }

  const user = await deps.signInWithEmail(email, password);
  if (user.emailVerified) {
    await deps.onVerifiedUser(user);
  }
  return user;
}

export interface ConnectRankedPresenceNonBlockingDeps {
  ensureLobbyPresenceConnected: () => Promise<boolean>;
  onConnected: () => void;
  onDisconnected: () => void;
  markLobbyReady: () => void;
  isStillActive?: () => boolean;
}

export async function connectRankedPresenceNonBlocking(
  deps: ConnectRankedPresenceNonBlockingDeps,
): Promise<boolean> {
  let onlineConnected = false;
  try {
    onlineConnected = await deps.ensureLobbyPresenceConnected();
  } catch {
    onlineConnected = false;
  }

  if (deps.isStillActive && !deps.isStillActive()) {
    return false;
  }

  if (onlineConnected) {
    deps.onConnected();
  } else {
    deps.onDisconnected();
  }
  deps.markLobbyReady();
  return onlineConnected;
}
