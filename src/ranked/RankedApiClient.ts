import { getApiUrl } from '../config/RuntimeConfig';
import type { DeviceProfile } from '../core/Types';
import { i18n } from '../i18n/I18nManager';
import { ApiRequestError, fetchApiJson, parseJsonResponse } from '../network/ApiResponse';
import type {
  FriendLookupResponse,
  FriendRequestEntry,
  LeaderboardEntry,
  MailboxStateSnapshot,
  OutgoingFriendRequestEntry,
  PlatformType,
  PlayerGender,
  RankedProfile,
  RankedVaultState,
  ServerOnlineStatus,
  SquadFriendEntry,
} from './RankedTypes';

const CREDENTIALS_STORAGE_KEY = 'nexus_ranked_credentials_v1';

export interface StoredRankedCredentials {
  playerId: string;
  secretToken: string;
}

export function detectRankedPlatform(profile: DeviceProfile): PlatformType {
  if (profile.isAndroid) return 'android';
  if (profile.isIOS) return 'ios';
  if (profile.isTablet) return 'tablet';
  return 'pc';
}

export class RankedApiClient {
  private credentials: StoredRankedCredentials | null = null;
  private cachedProfile: RankedProfile | null = null;
  private readonly platform: PlatformType;

  constructor(deviceProfile: DeviceProfile) {
    this.platform = detectRankedPlatform(deviceProfile);
    this.loadCredentials();
  }

  private loadCredentials(): void {
    try {
      const raw = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredRankedCredentials>;
      if (typeof parsed.playerId === 'string' && typeof parsed.secretToken === 'string') {
        this.credentials = {
          playerId: parsed.playerId,
          secretToken: parsed.secretToken,
        };
      }
    } catch {
      this.credentials = null;
    }
  }

  private saveCredentials(creds: StoredRankedCredentials): void {
    this.credentials = creds;
    try {
      localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(creds));
    } catch {
      // Ignore storage quota issues
    }
  }

  getCredentials(): StoredRankedCredentials | null {
    return this.credentials;
  }

  hasBackendSessionToken(): boolean {
    return Boolean(this.credentials?.playerId && this.credentials?.secretToken);
  }

  setAuthenticatedSession(creds: StoredRankedCredentials, profile: RankedProfile): void {
    this.saveCredentials(creds);
    this.cachedProfile = profile;
  }

  clearCredentials(): void {
    this.credentials = null;
    this.cachedProfile = null;
    try {
      localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
    } catch {
      // Ignore storage removal errors
    }
  }

  getCachedProfile(): RankedProfile | null {
    return this.cachedProfile;
  }

  getPlatform(): PlatformType {
    return this.platform;
  }

  async ensureProfile(preferredName?: string): Promise<RankedProfile> {
    if (
      (this.credentials && !this.credentials.secretToken) ||
      (this.firebaseIdToken && !this.credentials?.secretToken)
    ) {
      throw new ApiRequestError(
        'Authenticated backend session is unavailable while the server is offline.',
        {
          status: 503,
          code: 'BACKEND_UNAVAILABLE',
          isNetworkOrGatewayError: true,
        },
      );
    }

    const { res, data } = await fetchApiJson<{
      profile?: RankedProfile;
      secretToken?: string;
      error?: string;
    }>(
      getApiUrl('/api/ranked/profile'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: this.credentials?.playerId,
          secretToken: this.credentials?.secretToken,
          name: preferredName,
          platform: this.platform,
        }),
      },
      i18n.t('api.err.profileRequest', { status: 500 }),
    );
    if (!res.ok || !data.profile || !data.secretToken) {
      throw new ApiRequestError(
        data.error || i18n.t('api.err.profileRequest', { status: res.status }),
        { status: res.status },
      );
    }
    this.saveCredentials({
      playerId: data.profile.playerId,
      secretToken: data.secretToken,
    });
    this.cachedProfile = data.profile;
    return data.profile;
  }

  async checkUsername(
    username: string,
  ): Promise<{ available: boolean; valid: boolean; cleaned?: string; code?: string; error?: string }> {
    const { res, data } = await fetchApiJson<{
      available?: boolean;
      valid?: boolean;
      cleaned?: string;
      code?: string;
      error?: string;
    }>(
      getApiUrl('/api/auth/check-username'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          excludePlayerId: this.credentials?.playerId,
        }),
      },
      i18n.t('api.err.profileRequest', { status: 500 }),
    );
    if (!res.ok) {
      throw new ApiRequestError(
        data.error || i18n.t('api.err.profileRequest', { status: res.status }),
        {
          status: res.status,
          code: data.code,
          isNetworkOrGatewayError: res.status >= 500,
        },
      );
    }
    return {
      available: Boolean(data.available),
      valid: Boolean(data.valid),
      cleaned: data.cleaned,
      code: data.code,
      error: data.error,
    };
  }

  async registerInitialProfile(
    idToken: string,
    username: string,
  ): Promise<{ playerId: string; numericId: string; username: string }> {
    const { res, data } = await fetchApiJson<{
      ok?: boolean;
      playerId?: string;
      numericId?: string;
      username?: string;
      error?: string;
      code?: string;
    }>(
      getApiUrl('/api/auth/register-profile'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          platform: this.platform,
        }),
      },
      i18n.t('api.err.profileRequest', { status: 500 }),
    );
    if (!res.ok || !data.playerId || !data.numericId) {
      throw new ApiRequestError(
        data.error || i18n.t('api.err.profileRequest', { status: res.status }),
        {
          status: res.status,
          code: data.code,
          isNetworkOrGatewayError: res.status >= 500,
        },
      );
    }
    return {
      playerId: data.playerId,
      numericId: data.numericId,
      username: data.username || username.trim(),
    };
  }

  async loginWithIdentifier(identifier: string, password: string): Promise<{ email: string }> {
    const { res, data } = await fetchApiJson<{
      ok?: boolean;
      email?: string;
      error?: string;
      code?: string;
    }>(
      getApiUrl('/api/auth/login'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      },
      i18n.t('auth.errInvalidCredentials'),
    );
    if (!res.ok || !data.email) {
      throw new ApiRequestError(data.error || i18n.t('auth.errInvalidCredentials'), {
        status: res.status,
        code: data.code,
        isNetworkOrGatewayError: res.status >= 500,
      });
    }
    return { email: data.email };
  }

  async recoverPassword(identifier: string): Promise<string> {
    const { res, data } = await fetchApiJson<{
      ok?: boolean;
      message?: string;
      error?: string;
      code?: string;
    }>(
      getApiUrl('/api/auth/recover'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
        }),
      },
      i18n.t('auth.errRecoverFailed'),
    );
    if (!res.ok) {
      throw new ApiRequestError(data.error || i18n.t('auth.errRecoverFailed'), {
        status: res.status,
        code: data.code,
        isNetworkOrGatewayError: res.status >= 500,
      });
    }
    return data.message || i18n.t('auth.recoverSentInfo');
  }

  async renameProfile(newName: string): Promise<RankedProfile> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      throw new Error(i18n.t('api.err.noCredentials'));
    }
    const { res, data } = await fetchApiJson<{
      profile?: RankedProfile;
      error?: string;
      code?: string;
    }>(getApiUrl('/api/profile/update-username'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: creds.playerId,
        secretToken: creds.secretToken,
        newName,
      }),
    });
    if (!res.ok || !data.profile) {
      const serverMsg = data.error
        ? i18n.translateServerMessage(data.error, data.code)
        : i18n.t('api.err.renameFailed', { status: res.status });
      throw new Error(serverMsg);
    }
    this.cachedProfile = data.profile;
    return data.profile;
  }

  async updateProfileGender(gender: PlayerGender): Promise<RankedProfile> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      throw new Error(i18n.t('api.err.noCredentials'));
    }
    const { res, data } = await fetchApiJson<{
      profile?: RankedProfile;
      error?: string;
      code?: string;
    }>(getApiUrl('/api/profile/update-gender'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: creds.playerId,
        secretToken: creds.secretToken,
        gender,
      }),
    });
    if (!res.ok || !data.profile) {
      const serverMsg = data.error
        ? i18n.translateServerMessage(data.error, data.code)
        : i18n.t('api.err.profileRequest', { status: res.status });
      throw new Error(serverMsg);
    }
    this.cachedProfile = data.profile;
    return data.profile;
  }

  async fetchPublicProfile(idOrNumericId: string): Promise<RankedProfile | null> {
    const cleaned = idOrNumericId.trim();
    if (!cleaned || cleaned.length > 64) {
      return null;
    }
    const res = await fetch(
      getApiUrl(`/api/ranked/profile/${encodeURIComponent(cleaned)}?public=1`),
    );
    if (res.status === 404 || res.status === 400) {
      return null;
    }
    const data = await parseJsonResponse<{ profile?: RankedProfile; error?: string }>(
      res,
      i18n.t('api.err.fetchProfile', { status: res.status }),
    );
    if (!res.ok) {
      throw new Error(data.error || i18n.t('api.err.fetchProfile', { status: res.status }));
    }
    return data.profile ?? null;
  }

  async syncAccountProgression(payload: {
    level?: number;
    xp?: number;
    avatarCharacterId?: string;
    gender?: PlayerGender | null;
    brMatch?: {
      kills: number;
      damage: number;
      died: boolean;
      isWinner: boolean;
    };
  }): Promise<RankedProfile | null> {
    if (this.firebaseIdToken && !this.hasBackendSessionToken()) {
      return null;
    }
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds || !creds.secretToken) return null;
    const { res, data } = await fetchApiJson<{ profile?: RankedProfile }>(
      getApiUrl('/api/profile/sync-progression'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: creds.playerId,
          secretToken: creds.secretToken,
          ...payload,
        }),
      },
    );
    if (!res.ok) return null;
    if (data.profile) {
      this.cachedProfile = data.profile;
      return data.profile;
    }
    return null;
  }

  async syncVaultState(vault: RankedVaultState): Promise<RankedProfile | null> {
    if (this.firebaseIdToken && !this.hasBackendSessionToken()) {
      return null;
    }
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds || !creds.secretToken) return null;
    const { res, data } = await fetchApiJson<{ profile?: RankedProfile }>(
      getApiUrl('/api/profile/sync-vault'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: creds.playerId,
          secretToken: creds.secretToken,
          vault,
        }),
      },
    );
    if (!res.ok) return null;
    if (data.profile) {
      this.cachedProfile = data.profile;
      return data.profile;
    }
    return null;
  }

  async refreshProfile(): Promise<RankedProfile | null> {
    if (!this.credentials) {
      if (this.firebaseIdToken) {
        return this.cachedProfile;
      }
      return this.ensureProfile();
    }
    if (!this.credentials.secretToken && this.firebaseIdToken) {
      return this.cachedProfile;
    }
    const res = await fetch(
      getApiUrl(`/api/ranked/profile/${encodeURIComponent(this.credentials.playerId)}`),
    );
    if (res.status === 404) {
      if (this.firebaseIdToken) {
        return this.cachedProfile;
      }
      return this.ensureProfile();
    }
    const data = await parseJsonResponse<{ profile?: RankedProfile; error?: string }>(
      res,
      i18n.t('api.err.fetchProfile', { status: res.status }),
    );
    if (!res.ok || !data.profile) {
      throw new Error(data.error || i18n.t('api.err.fetchProfile', { status: res.status }));
    }
    this.cachedProfile = data.profile;
    return data.profile;
  }

  async fetchLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    const { res, data } = await fetchApiJson<{ leaderboard?: LeaderboardEntry[]; error?: string }>(
      getApiUrl(`/api/ranked/leaderboard?limit=${limit}`),
      undefined,
      i18n.t('api.err.leaderboard', { status: 500 }),
    );
    if (!res.ok || !Array.isArray(data.leaderboard)) {
      throw new Error(data.error || i18n.t('api.err.leaderboard', { status: res.status }));
    }
    return data.leaderboard;
  }

  async fetchServerStatus(): Promise<ServerOnlineStatus> {
    const { res, data } = await fetchApiJson<ServerOnlineStatus & { error?: string }>(
      getApiUrl('/api/ranked/status'),
      undefined,
      i18n.t('api.err.status', { status: 500 }),
    );
    if (!res.ok) {
      throw new Error(data.error || i18n.t('api.err.status', { status: res.status }));
    }
    return data;
  }

  async lookupPlayerForFriend(queryId: string): Promise<FriendLookupResponse> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      throw new Error(i18n.t('api.err.noCredentials'));
    }
    const { res, data } = await fetchApiJson<
      Partial<FriendLookupResponse> & {
        error?: string;
        code?: string;
      }
    >(getApiUrl('/api/friends/lookup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: creds.playerId,
        secretToken: creds.secretToken,
        queryId: queryId.trim(),
      }),
    });
    if (!res.ok || !data.player || !data.relationStatus) {
      throw new Error(data.error || i18n.t('friends.err.notFound'));
    }
    return {
      player: data.player,
      relationStatus: data.relationStatus,
      pendingRequestId: data.pendingRequestId,
    };
  }

  private firebaseIdToken: string | null = null;

  setFirebaseIdToken(token: string | null): void {
    this.firebaseIdToken = token;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.firebaseIdToken) {
      headers['Authorization'] = `Bearer ${this.firebaseIdToken}`;
    }
    return headers;
  }

  async fetchFriendsState(): Promise<{
    friends: SquadFriendEntry[];
    incomingRequests: FriendRequestEntry[];
    outgoingRequests: OutgoingFriendRequestEntry[];
    outgoingTargetIds: string[];
  }> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      return { friends: [], incomingRequests: [], outgoingRequests: [], outgoingTargetIds: [] };
    }
    try {
      const { res, data } = await fetchApiJson<{
        friends?: SquadFriendEntry[];
        incomingRequests?: FriendRequestEntry[];
        outgoingRequests?: OutgoingFriendRequestEntry[];
        outgoingTargetIds?: string[];
      }>(getApiUrl('/api/friends/state'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          playerId: creds.playerId,
          secretToken: creds.secretToken,
        }),
      });
      if (!res.ok) {
        return { friends: [], incomingRequests: [], outgoingRequests: [], outgoingTargetIds: [] };
      }
      return {
        friends: Array.isArray(data.friends) ? data.friends : [],
        incomingRequests: Array.isArray(data.incomingRequests) ? data.incomingRequests : [],
        outgoingRequests: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
        outgoingTargetIds: Array.isArray(data.outgoingTargetIds) ? data.outgoingTargetIds : [],
      };
    } catch {
      return { friends: [], incomingRequests: [], outgoingRequests: [], outgoingTargetIds: [] };
    }
  }

  async sendFriendRequest(targetId: string): Promise<{
    friends: SquadFriendEntry[];
    incomingRequests: FriendRequestEntry[];
    outgoingRequests: OutgoingFriendRequestEntry[];
    outgoingTargetIds: string[];
  }> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      throw new Error(i18n.t('api.err.noCredentials'));
    }
    const { res, data } = await fetchApiJson<{
      error?: string;
      friends?: SquadFriendEntry[];
      incomingRequests?: FriendRequestEntry[];
      outgoingRequests?: OutgoingFriendRequestEntry[];
      outgoingTargetIds?: string[];
    }>(getApiUrl('/api/friends/request'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        playerId: creds.playerId,
        secretToken: creds.secretToken,
        targetId: targetId.trim(),
      }),
    });
    if (!res.ok) {
      throw new Error(data.error || i18n.t('friends.err.sendFailed'));
    }
    return {
      friends: Array.isArray(data.friends) ? data.friends : [],
      incomingRequests: Array.isArray(data.incomingRequests) ? data.incomingRequests : [],
      outgoingRequests: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
      outgoingTargetIds: Array.isArray(data.outgoingTargetIds) ? data.outgoingTargetIds : [],
    };
  }

  async respondFriendRequest(
    requestId: string,
    accept: boolean,
  ): Promise<{
    accepted: boolean;
    friends: SquadFriendEntry[];
    incomingRequests: FriendRequestEntry[];
    outgoingRequests: OutgoingFriendRequestEntry[];
    outgoingTargetIds: string[];
  }> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      throw new Error(i18n.t('api.err.noCredentials'));
    }
    const { res, data } = await fetchApiJson<{
      accepted?: boolean;
      error?: string;
      friends?: SquadFriendEntry[];
      incomingRequests?: FriendRequestEntry[];
      outgoingRequests?: OutgoingFriendRequestEntry[];
      outgoingTargetIds?: string[];
    }>(getApiUrl('/api/friends/respond'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        playerId: creds.playerId,
        secretToken: creds.secretToken,
        requestId: requestId.trim(),
        accept,
      }),
    });
    if (!res.ok) {
      throw new Error(data.error || i18n.t('friends.err.respondFailed'));
    }
    return {
      accepted: Boolean(data.accepted),
      friends: Array.isArray(data.friends) ? data.friends : [],
      incomingRequests: Array.isArray(data.incomingRequests) ? data.incomingRequests : [],
      outgoingRequests: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
      outgoingTargetIds: Array.isArray(data.outgoingTargetIds) ? data.outgoingTargetIds : [],
    };
  }

  async cancelFriendRequest(requestId: string): Promise<{
    friends: SquadFriendEntry[];
    incomingRequests: FriendRequestEntry[];
    outgoingRequests: OutgoingFriendRequestEntry[];
    outgoingTargetIds: string[];
  }> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      throw new Error(i18n.t('api.err.noCredentials'));
    }
    const { res, data } = await fetchApiJson<{
      error?: string;
      friends?: SquadFriendEntry[];
      incomingRequests?: FriendRequestEntry[];
      outgoingRequests?: OutgoingFriendRequestEntry[];
      outgoingTargetIds?: string[];
    }>(getApiUrl('/api/friends/cancel'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        playerId: creds.playerId,
        secretToken: creds.secretToken,
        requestId: requestId.trim(),
      }),
    });
    if (!res.ok) {
      throw new Error(data.error || i18n.t('friends.err.respondFailed'));
    }
    return {
      friends: Array.isArray(data.friends) ? data.friends : [],
      incomingRequests: Array.isArray(data.incomingRequests) ? data.incomingRequests : [],
      outgoingRequests: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
      outgoingTargetIds: Array.isArray(data.outgoingTargetIds) ? data.outgoingTargetIds : [],
    };
  }

  async removeFriend(friendPlayerId: string): Promise<{
    friends: SquadFriendEntry[];
    incomingRequests: FriendRequestEntry[];
    outgoingRequests: OutgoingFriendRequestEntry[];
    outgoingTargetIds: string[];
  }> {
    if (!this.credentials) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    if (!creds) {
      throw new Error(i18n.t('api.err.noCredentials'));
    }
    const { res, data } = await fetchApiJson<{
      error?: string;
      friends?: SquadFriendEntry[];
      incomingRequests?: FriendRequestEntry[];
      outgoingRequests?: OutgoingFriendRequestEntry[];
      outgoingTargetIds?: string[];
    }>(getApiUrl('/api/friends/remove'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        playerId: creds.playerId,
        secretToken: creds.secretToken,
        friendPlayerId: friendPlayerId.trim(),
      }),
    });
    if (!res.ok) {
      throw new Error(data.error || i18n.t('friends.err.respondFailed'));
    }
    return {
      friends: Array.isArray(data.friends) ? data.friends : [],
      incomingRequests: Array.isArray(data.incomingRequests) ? data.incomingRequests : [],
      outgoingRequests: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
      outgoingTargetIds: Array.isArray(data.outgoingTargetIds) ? data.outgoingTargetIds : [],
    };
  }

  async fetchMailboxState(): Promise<MailboxStateSnapshot> {
    if (!this.credentials && !this.firebaseIdToken) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    try {
      const { res, data } = await fetchApiJson<Partial<MailboxStateSnapshot>>(
        getApiUrl('/api/mailbox/state'),
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            playerId: creds?.playerId,
            secretToken: creds?.secretToken,
          }),
        },
      );
      if (!res.ok) {
        return { messages: [], unreadCount: 0, unclaimedRewardCount: 0 };
      }
      return {
        messages: Array.isArray(data.messages) ? data.messages : [],
        unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : 0,
        unclaimedRewardCount:
          typeof data.unclaimedRewardCount === 'number' ? data.unclaimedRewardCount : 0,
      };
    } catch {
      return { messages: [], unreadCount: 0, unclaimedRewardCount: 0 };
    }
  }

  async markMailRead(mailId: string): Promise<MailboxStateSnapshot> {
    if (!this.credentials && !this.firebaseIdToken) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    const { res, data } = await fetchApiJson<Partial<MailboxStateSnapshot> & { error?: string }>(
      getApiUrl('/api/mailbox/read'),
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          playerId: creds?.playerId,
          secretToken: creds?.secretToken,
          mailId,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(data.error || 'Could not mark mail read.');
    }
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : 0,
      unclaimedRewardCount:
        typeof data.unclaimedRewardCount === 'number' ? data.unclaimedRewardCount : 0,
    };
  }

  async claimMailReward(mailId: string): Promise<{
    creditsAwarded: number;
    newBalance: number;
    mailbox: MailboxStateSnapshot;
  }> {
    if (!this.credentials && !this.firebaseIdToken) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    const { res, data } = await fetchApiJson<{
      creditsGranted?: number;
      creditsAwarded?: number;
      newBalance?: number;
      state?: MailboxStateSnapshot;
      mailbox?: MailboxStateSnapshot;
      error?: string;
    }>(getApiUrl('/api/mailbox/claim'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        playerId: creds?.playerId,
        secretToken: creds?.secretToken,
        mailId,
      }),
    });
    const nextMailbox = data.state ?? data.mailbox;
    if (!res.ok || !nextMailbox) {
      throw new Error(data.error || 'Could not claim reward.');
    }
    return {
      creditsAwarded:
        typeof data.creditsGranted === 'number'
          ? data.creditsGranted
          : typeof data.creditsAwarded === 'number'
            ? data.creditsAwarded
            : 0,
      newBalance: typeof data.newBalance === 'number' ? data.newBalance : 0,
      mailbox: nextMailbox,
    };
  }

  async archiveMail(mailId: string, archived: boolean): Promise<MailboxStateSnapshot> {
    if (!this.credentials && !this.firebaseIdToken) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    const { res, data } = await fetchApiJson<Partial<MailboxStateSnapshot> & { error?: string }>(
      getApiUrl('/api/mailbox/archive'),
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          playerId: creds?.playerId,
          secretToken: creds?.secretToken,
          mailId,
          archived,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(data.error || 'Could not update archive status.');
    }
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : 0,
      unclaimedRewardCount:
        typeof data.unclaimedRewardCount === 'number' ? data.unclaimedRewardCount : 0,
    };
  }

  async deleteMail(mailId: string): Promise<MailboxStateSnapshot> {
    if (!this.credentials && !this.firebaseIdToken) {
      await this.ensureProfile();
    }
    const creds = this.credentials;
    const { res, data } = await fetchApiJson<Partial<MailboxStateSnapshot> & { error?: string }>(
      getApiUrl('/api/mailbox/delete'),
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          playerId: creds?.playerId,
          secretToken: creds?.secretToken,
          mailId,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(data.error || 'Could not delete mail.');
    }
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : 0,
      unclaimedRewardCount:
        typeof data.unclaimedRewardCount === 'number' ? data.unclaimedRewardCount : 0,
    };
  }
}
