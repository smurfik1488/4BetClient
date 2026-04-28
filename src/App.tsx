import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import * as signalR from '@microsoft/signalr';
import type {
  AdminUserDto,
  BetAnalyticsDto,
  AdminVerificationRequestDto,
  BetDto,
  BetLegDto,
  BetSelection,
  ChangePasswordRequest,
  ManageSportEventRequest,
  PlaceBetRequest,
  SportEventDto,
  UpdateProfileRequest,
  UpdateAvatarRequest,
  UserProfileDto,
  WalletBalanceDto,
  WalletTopUpRequest,
} from './types';
import { realtimeEvents } from './realtimeEvents';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ?? 'https://4betapi-d7bdaga2fbecdbf4.polandcentral-01.azurewebsites.net/api';
const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return '';
  }
})();

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

type BetSlipLeg = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  selection: BetSelection;
  odds: number;
};

function getToken(): string | null {
  return localStorage.getItem('token');
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

/** React Strict Mode runs effect cleanup while SignalR is still negotiating; ignore benign errors. */
function isIgnorableSignalRStartError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('stopped during negotiation') ||
    message.includes('connection was stopped') ||
    message.includes('connection being closed')
  );
}

function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [authView, setAuthView] = useState<'welcome' | 'form'>('welcome');
  const [authStep, setAuthStep] = useState<'credentials' | 'verifyEmail' | 'verifyAge'>('credentials');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [authErrors, setAuthErrors] = useState<Record<string, string>>({});
  const [pendingVerificationToken, setPendingVerificationToken] = useState<string | null>(null);
  const [verificationDocument, setVerificationDocument] = useState<File | null>(null);
  const [verificationPreviewUrl, setVerificationPreviewUrl] = useState<string | null>(null);
  const [isVerifyDragOver, setIsVerifyDragOver] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [isDocVerifyModalOpen, setIsDocVerifyModalOpen] = useState(false);
  const [docVerifyPrompt, setDocVerifyPrompt] = useState('Please verify your documents to continue.');
  const [welcomeEvents, setWelcomeEvents] = useState<SportEventDto[]>([]);

  const [events, setEvents] = useState<SportEventDto[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [myBets, setMyBets] = useState<BetDto[]>([]);
  const [betAnalytics, setBetAnalytics] = useState<BetAnalyticsDto | null>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState(() => toDateInputValue(new Date(Date.now() - 29 * 86400000)));
  const [historyTo, setHistoryTo] = useState(() => toDateInputValue(new Date()));
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isWalletLoading, setIsWalletLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(() => Boolean(getToken()));
  const [slipLegs, setSlipLegs] = useState<BetSlipLeg[]>([]);
  const [stake, setStake] = useState('10');
  const [betBusy, setBetBusy] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [isBetSlipOpen, setIsBetSlipOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('100');
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const setStatus = (_: string) => {};
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'sports' | 'history' | 'wallet' | 'profile' | 'esports' | 'moderator' | 'admin' | 'verificationPending'>('dashboard');
  const [selectedSportTitle, setSelectedSportTitle] = useState<string | null>(null);
  const [sportsPage, setSportsPage] = useState(1);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [betPlacementMessage, setBetPlacementMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [expandedBetId, setExpandedBetId] = useState<string | null>(null);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const contentLayoutRef = useRef<HTMLDivElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const verifyUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [eventHighlights, setEventHighlights] = useState<Record<string, 'goal' | 'event'>>({});
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [moderatorForm, setModeratorForm] = useState<ManageSportEventRequest>(() => createEmptyModeratorForm());
  const [moderatorEditEventId, setModeratorEditEventId] = useState<string | null>(null);
  const [isModeratorEditorOpen, setIsModeratorEditorOpen] = useState(false);
  const [moderatorBusy, setModeratorBusy] = useState(false);
  const [moderatorMessage, setModeratorMessage] = useState<string | null>(null);
  const [adminRequests, setAdminRequests] = useState<AdminVerificationRequestDto[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserDto[]>([]);
  const [adminDocumentPreviews, setAdminDocumentPreviews] = useState<Record<string, string>>({});
  const [adminSection, setAdminSection] = useState<'verifications' | 'roles'>('verifications');
  const [adminDocumentModal, setAdminDocumentModal] = useState<{ url: string; isImage: boolean } | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [verificationDecision, setVerificationDecision] = useState<{ status: 'Approved' | 'Rejected'; message: string; action: 'dashboard' | 'start' } | null>(null);
  const [isVerificationPendingView, setIsVerificationPendingView] = useState(false);
  const [pendingRefreshBusy, setPendingRefreshBusy] = useState(false);
  const [pendingRefreshAt, setPendingRefreshAt] = useState<string | null>(null);
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const subscribedEventsRef = useRef<Set<string>>(new Set());
  const eventsRef = useRef<SportEventDto[]>([]);
  const verificationDecisionShownRef = useRef(false);
  eventsRef.current = events;

  const scheduleMatchFlashes = useCallback((flashes: Array<{ id: string; kind: 'goal' | 'event' }>) => {
    if (flashes.length === 0) {
      return;
    }

    setEventHighlights((curr) => {
      const next = { ...curr };
      for (const item of flashes) next[item.id] = item.kind;
      return next;
    });
    setTimeout(() => {
      setEventHighlights((curr) => {
        const next = { ...curr };
        for (const item of flashes) delete next[item.id];
        return next;
      });
    }, 1800);
  }, []);

  const userProfile = useMemo(() => parseToken(token), [token]);
  const isAdmin = userProfile.role === 'Admin';
  const isModerator = userProfile.role === 'Moderator';
  const isStaffRestricted = isAdmin || isModerator;
  const displayUser = useMemo(() => {
    if (profile) {
      const fullName = `${profile.firstName} ${profile.lastName}`.trim();
      const initials = `${profile.firstName?.charAt(0) ?? ''}${profile.lastName?.charAt(0) ?? ''}`.toUpperCase() || userProfile.initials;
      return {
        fullName: fullName || userProfile.fullName,
        initials,
      };
    }

    return userProfile;
  }, [profile, userProfile]);
  const footballEvents = useMemo(
    () => prioritizeFootballEvents(events, 24),
    [events],
  );
  const liveMatchesCount = useMemo(
    () => footballEvents.filter((event) => isLiveOrInProgress(event.eventDate, event.matchStatus)).length,
    [footballEvents],
  );
  const sportCards = useMemo(() => buildSportCards(events), [events]);
  const selectedSportMatches = useMemo(() => {
    if (!selectedSportTitle) {
      return [];
    }

    return events
      .filter((event) => mapSportTitle(event.sportKey) === selectedSportTitle)
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [events, selectedSportTitle]);
  const sportsPageSize = 6;
  const sportsTotalPages = Math.max(1, Math.ceil(selectedSportMatches.length / sportsPageSize));
  const pagedSportMatches = useMemo(() => {
    const safePage = Math.min(sportsPage, sportsTotalPages);
    const start = (safePage - 1) * sportsPageSize;
    return selectedSportMatches.slice(start, start + sportsPageSize);
  }, [selectedSportMatches, sportsPage, sportsTotalPages]);

  const scrollSportsToTop = useCallback(() => {
    contentPanelRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    contentLayoutRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    if (activeScreen !== 'sports' || !selectedSportTitle) {
      return;
    }

    scrollSportsToTop();
  }, [sportsPage, selectedSportTitle, activeScreen, scrollSportsToTop]);
  const welcomeFootballEvents = useMemo(
    () => {
      return prioritizeFootballEvents(welcomeEvents, 24).slice(0, 3);
    },
    [welcomeEvents],
  );

  const loadWallet = useCallback(async () => {
    setIsWalletLoading(true);
    if (!getToken()) {
      setWalletBalance(null);
      setIsWalletLoading(false);
      return;
    }

    try {
      const res = await api.get<WalletBalanceDto>('/Wallet');
      setWalletBalance(Number(res.data.balance));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
      setWalletBalance(null);
    } finally {
      setIsWalletLoading(false);
    }
  }, []);

  const loadMyBets = useCallback(async () => {
    if (!getToken()) {
      setMyBets([]);
      return;
    }

    try {
      const res = await api.get<BetDto[]>('/bet/mine');
      const raw = ensureArray<BetDto>(res.data);
      setMyBets(raw.map(normalizeBetDto));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, []);

  const loadBetAnalytics = useCallback(async (fromDate: string, toDate: string) => {
    if (!getToken()) {
      setBetAnalytics(null);
      return;
    }

    if (!fromDate || !toDate) {
      setAnalyticsError('Select both from/to dates.');
      return;
    }

    setAnalyticsBusy(true);
    setAnalyticsError(null);
    try {
      const fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
      const toIso = new Date(`${toDate}T23:59:59`).toISOString();
      const res = await api.get<BetAnalyticsDto>(`/bet/analytics/mine?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
      setBetAnalytics(res.data);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
      setAnalyticsError('Unable to load analytics for selected date range.');
    } finally {
      setAnalyticsBusy(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!getToken()) {
      setProfile(null);
      setAvatarDataUrl(null);
      setIsProfileLoading(false);
      return;
    }

    setIsProfileLoading(true);
    try {
      const res = await api.get<UserProfileDto>('/auth/profile');
      setProfile(res.data);
      setProfileFirstName(res.data.firstName);
      setProfileLastName(res.data.lastName);
      setAvatarDataUrl(res.data.avatarDataUrl ?? null);
      setProfileError(null);
      setProfileMessage(null);
      setIsEditingProfile(false);
      setIsChangingPassword(false);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profileMessage) {
      return;
    }

    const timer = setTimeout(() => {
      setProfileMessage(null);
    }, 2200);

    return () => clearTimeout(timer);
  }, [profileMessage]);

  useEffect(() => {
    if (!moderatorMessage) {
      return;
    }

    const timer = setTimeout(() => {
      setModeratorMessage(null);
    }, 2400);

    return () => clearTimeout(timer);
  }, [moderatorMessage]);

  useEffect(() => {
    if (!adminMessage) {
      return;
    }

    const timer = setTimeout(() => {
      setAdminMessage(null);
    }, 2400);

    return () => clearTimeout(timer);
  }, [adminMessage]);

  useEffect(() => {
    if (!betPlacementMessage) {
      return;
    }

    const timer = setTimeout(() => {
      setBetPlacementMessage(null);
    }, 2600);

    return () => clearTimeout(timer);
  }, [betPlacementMessage]);

  useEffect(() => {
    return () => {
      if (verificationPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(verificationPreviewUrl);
      }
    };
  }, [verificationPreviewUrl]);

  function setVerificationFile(file: File | null) {
    setVerificationDocument(file);
    setIsVerifyDragOver(false);
    if (!file) {
      setVerificationPreviewUrl(null);
      return;
    }

    if (file.type.startsWith('image/')) {
      setVerificationPreviewUrl(URL.createObjectURL(file));
      return;
    }

    setVerificationPreviewUrl(null);
  }

  function clearVerificationFile() {
    setVerificationFile(null);
    if (verifyUploadInputRef.current) {
      verifyUploadInputRef.current.value = '';
    }
  }

  async function loadInitialData() {
    setIsEventsLoading(true);
    const eventsRes = await Promise.allSettled([
      api.get<SportEventDto[]>('/sport/active'),
    ]);

    if (eventsRes[0].status === 'fulfilled') {
      setEvents(ensureArray<SportEventDto>(eventsRes[0].value.data));
    }

    await Promise.all([loadWallet(), loadProfile(), loadMyBets()]);
    setIsEventsLoading(false);
  }

  async function refreshActiveEventsSnapshot() {
    try {
      const response = await api.get<SportEventDto[]>('/sport/active');
      setEvents(ensureArray<SportEventDto>(response.data));
    } catch {
      // Keep current UI state when transient polling request fails.
    }
  }

  async function loadAdminRequests(showBusy = true) {
    if (!isAdmin) {
      setAdminRequests([]);
      return;
    }

    if (showBusy) {
      setAdminBusy(true);
    }
    try {
      const response = await api.get<AdminVerificationRequestDto[]>('/admin/verifications/pending');
      const requests = ensureArray<AdminVerificationRequestDto>(response.data);
      setAdminRequests(requests);
      await preloadAdminDocumentPreviews(requests);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
    } finally {
      if (showBusy) {
        setAdminBusy(false);
      }
    }
  }

  async function preloadAdminDocumentPreviews(requests: AdminVerificationRequestDto[]) {
    for (const request of requests) {
      if (adminDocumentPreviews[request.id]) {
        continue;
      }
      try {
        const response = await api.get(`/admin/verifications/${request.id}/document`, { responseType: 'blob' });
        const sourceBlob = response.data as Blob;
        const normalizedBlob = normalizeDocumentBlob(sourceBlob, request.documentUrl);
        if (!normalizedBlob.type.startsWith('image/')) {
          continue;
        }
        const objectUrl = URL.createObjectURL(normalizedBlob);
        setAdminDocumentPreviews((prev) => ({ ...prev, [request.id]: objectUrl }));
      } catch {
        // Skip failed previews silently.
      }
    }
  }

  async function openAdminDocument(requestId: string) {
    try {
      const response = await api.get(`/admin/verifications/${requestId}/document`, { responseType: 'blob' });
      const request = adminRequests.find((r) => r.id === requestId);
      const sourceBlob = response.data as Blob;
      const normalizedBlob = normalizeDocumentBlob(sourceBlob, request?.documentUrl);
      const objectUrl = URL.createObjectURL(normalizedBlob);
      if (adminDocumentModal?.url) {
        URL.revokeObjectURL(adminDocumentModal.url);
      }
      setAdminDocumentModal({
        url: objectUrl,
        isImage: normalizedBlob.type.startsWith('image/'),
      });
    } catch {
      setAdminMessage('Unable to open document.');
    }
  }

  async function loadAdminUsers() {
    if (!isAdmin) {
      setAdminUsers([]);
      return;
    }

    try {
      const response = await api.get<AdminUserDto[]>('/admin/users');
      setAdminUsers(ensureArray<AdminUserDto>(response.data));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }

  async function updateUserRole(userId: string, role: 'User' | 'Moderator') {
    setAdminBusy(true);
    setAdminMessage(null);
    try {
      await api.put(`/admin/users/${userId}/role`, { role });
      setAdminMessage(`User role updated to ${role}.`);
      await Promise.all([loadAdminUsers(), loadAdminRequests()]);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
      setAdminMessage('Unable to update user role.');
    } finally {
      setAdminBusy(false);
    }
  }

  async function fetchVerificationDecision() {
    if (!token) {
      setVerificationDecision(null);
      return;
    }

    try {
      const response = await api.get<{ status: string; message: string; action: string }>('/auth/verification-status');
      const payload = response.data;
      if (payload.status === 'Approved') {
        setIsVerificationPendingView(false);
        if (isVerificationPendingView && !verificationDecisionShownRef.current) {
          verificationDecisionShownRef.current = true;
          setVerificationDecision({ status: 'Approved', message: payload.message, action: 'dashboard' });
        } else {
          setVerificationDecision(null);
        }
        return;
      }

      if (payload.status === 'Rejected') {
        setIsVerificationPendingView(false);
        if (isVerificationPendingView && !verificationDecisionShownRef.current) {
          verificationDecisionShownRef.current = true;
          setVerificationDecision({ status: 'Rejected', message: payload.message, action: 'start' });
        } else {
          setVerificationDecision(null);
        }
        return;
      }

      if (payload.status === 'Pending') {
        setVerificationDecision(null);
        setIsVerificationPendingView(true);
        verificationDecisionShownRef.current = false;
        setActiveScreen('verificationPending');
        return;
      }

      setVerificationDecision(null);
      setIsVerificationPendingView(false);
    } catch {
      // Silent fail to avoid blocking regular user flow.
    }
  }

  async function refreshPendingVerificationStatus() {
    setPendingRefreshBusy(true);
    await fetchVerificationDecision();
    setPendingRefreshAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setPendingRefreshBusy(false);
  }

  async function submitModeratorEvent() {
    setModeratorBusy(true);
    setModeratorMessage(null);
    const payload: ManageSportEventRequest = {
      ...moderatorForm,
      homeScore: moderatorForm.homeScore ?? null,
      awayScore: moderatorForm.awayScore ?? null,
      matchMinute: moderatorForm.matchMinute ?? null,
      matchStatus: moderatorForm.matchStatus?.trim() || null,
    };

    try {
      if (moderatorEditEventId) {
        await api.put(`/sport/${moderatorEditEventId}`, payload);
        setModeratorMessage('Event updated.');
      } else {
        await api.post('/sport', payload);
        setModeratorMessage('Event added.');
      }

      setModeratorForm(createEmptyModeratorForm());
      setModeratorEditEventId(null);
      setIsModeratorEditorOpen(false);
      await refreshActiveEventsSnapshot();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
      setModeratorMessage('Unable to save event. Check form data and try again.');
    } finally {
      setModeratorBusy(false);
    }
  }

  async function removeModeratorEvent(id: string) {
    setModeratorBusy(true);
    setModeratorMessage(null);
    try {
      await api.delete(`/sport/${id}`);
      setModeratorMessage('Event deleted.');
      await refreshActiveEventsSnapshot();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
      setModeratorMessage('Unable to delete event.');
    } finally {
      setModeratorBusy(false);
    }
  }

  async function syncTimerForEvent(event: SportEventDto) {
    const synced = buildSyncedModeratorPayload(event);
    setModeratorBusy(true);
    setModeratorMessage(null);
    try {
      await api.put(`/sport/${event.id}`, synced);
      setModeratorMessage('Timer synchronized.');
      await refreshActiveEventsSnapshot();
    } catch {
      setModeratorMessage('Timer sync failed.');
    } finally {
      setModeratorBusy(false);
    }
  }

  async function processVerificationRequest(requestId: string, action: 'approve' | 'reject') {
    setAdminBusy(true);
    setAdminMessage(null);
    try {
      await api.post(`/admin/verifications/${requestId}/${action}`);
      setAdminMessage(action === 'approve' ? 'Request approved.' : 'Request rejected.');
      await loadAdminRequests();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
      }
      setAdminMessage('Unable to process request.');
    } finally {
      setAdminBusy(false);
    }
  }

  async function connectRealtime(getDisposed: () => boolean, refreshWallet: () => Promise<void>) {
    const hubUrl = API_ORIGIN ? `${API_ORIGIN}/matchHub` : '/matchHub';
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    connectionRef.current = connection;

    connection.on(realtimeEvents.matchStateUpdated, (payload: SportEventDto[]) => {
      setEvents((prev) => {
        const { merged, flashes } = mergeMatchPayload(prev, payload);
        if (flashes.length > 0) {
          queueMicrotask(() => scheduleMatchFlashes(flashes));
        }
        return merged;
      });
      setStatus('Live: match updates');
    });

    connection.on(realtimeEvents.oddsUpdated, (payload: Array<{ externalId: string; homeWinOdds: number; drawOdds: number; awayWinOdds: number }>) => {
      setEvents((prev) =>
        prev.map((ev) => {
          const incoming = payload.find((p) => p.externalId === ev.externalId);
          if (!incoming) {
            return ev;
          }

          return {
            ...ev,
            homeWinOdds: incoming.homeWinOdds,
            drawOdds: incoming.drawOdds,
            awayWinOdds: incoming.awayWinOdds,
          };
        }),
      );
      setStatus('Live: odds updates');
    });

    connection.on(realtimeEvents.betAccepted, (bet: BetDto) => {
      setMyBets((prev) => {
        const normalized = normalizeBetDto(bet);
        const existingIdx = prev.findIndex((b) => b.id === normalized.id);
        if (existingIdx === -1) {
          return [normalized, ...prev];
        }

        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], ...normalized };
        return next;
      });
      setStatus('Bet accepted');
      void refreshWallet();
    });

    connection.on(realtimeEvents.betSettled, (update: { betId: string; status: string; settledPayout?: number }) => {
      setMyBets((prev) =>
        prev.map((betRow) =>
          betRow.id === update.betId ? { ...betRow, status: mapBetStatus(update.status), settledPayout: update.settledPayout } : betRow,
        ),
      );
      setStatus('Bet settled');
      void refreshWallet();
    });

    try {
      await connection.start();
      if (getDisposed()) {
        await connection.stop();
        return;
      }

      for (const ev of eventsRef.current) {
        if (!subscribedEventsRef.current.has(ev.externalId)) {
          void subscribeToEvent(connection, ev.externalId);
          subscribedEventsRef.current.add(ev.externalId);
        }
      }

      setStatus('Realtime connected');
    } catch (error) {
      if (getDisposed()) {
        return;
      }

      if (isIgnorableSignalRStartError(error)) {
        return;
      }

      setStatus('Realtime disconnected');
    }
  }

  useEffect(() => {
    if (token || authView !== 'welcome') {
      return;
    }

    void loadWelcomeEvents();
    const interval = window.setInterval(() => {
      void loadWelcomeEvents();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [token, authView]);

  useEffect(() => {
    if (!token) {
      setIsEventsLoading(true);
      setIsProfileLoading(false);
      return;
    }

    setIsProfileLoading(true);
    let disposed = false;
    void loadInitialData();
    void connectRealtime(() => disposed, loadWallet);
    return () => {
      disposed = true;
      subscribedEventsRef.current.clear();
      const connection = connectionRef.current;
      if (
        connection &&
        connection.state !== signalR.HubConnectionState.Connecting &&
        connection.state !== signalR.HubConnectionState.Disconnected
      ) {
        void connection.stop();
      }
    };
  }, [token, loadWallet]);

  useEffect(() => {
    if (!token || activeScreen !== 'wallet') {
      return;
    }

    void loadWallet();
  }, [activeScreen, token, loadWallet]);

  useEffect(() => {
    if (!token || activeScreen !== 'history') {
      return;
    }

    void loadMyBets();
    void loadBetAnalytics(historyFrom, historyTo);
    const interval = window.setInterval(() => {
      void loadMyBets();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeScreen, token, loadMyBets, loadBetAnalytics, historyFrom, historyTo]);

  useEffect(() => {
    if (!token || activeScreen !== 'profile') {
      return;
    }

    void loadProfile();
  }, [activeScreen, token, loadProfile]);

  useEffect(() => {
    if (!token || !isAdmin || activeScreen !== 'admin') {
      return;
    }
    void Promise.all([loadAdminRequests(), loadAdminUsers()]);
    const interval = window.setInterval(() => {
      void Promise.all([loadAdminRequests(false), loadAdminUsers()]);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [activeScreen, isAdmin, token]);

  useEffect(() => {
    if (!token || !isModerator || activeScreen !== 'moderator') {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshActiveEventsSnapshot();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [activeScreen, isModerator, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    if (isAdmin && activeScreen !== 'admin') {
      setActiveScreen('admin');
      return;
    }

    if (isModerator && activeScreen !== 'moderator') {
      setActiveScreen('moderator');
    }
  }, [activeScreen, isAdmin, isModerator, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void fetchVerificationDecision();
    const interval = window.setInterval(() => {
      void fetchVerificationDecision();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [token]);

  // HTTP fallback: keeps scores fresh if SignalR/WebSocket fails behind Vite proxy
  useEffect(() => {
    if (!token || activeScreen !== 'dashboard') {
      return;
    }

    const tick = () => {
      void (async () => {
        try {
          const response = await api.get<SportEventDto[]>('/sport/active');
          const payload = ensureArray<SportEventDto>(response.data);
          if (payload.length === 0) {
            return;
          }

          setEvents((prev) => {
            const { merged, flashes } = mergeMatchPayload(prev, payload);
            if (flashes.length > 0) {
              queueMicrotask(() => scheduleMatchFlashes(flashes));
            }
            return merged;
          });
        } catch {
          // ignore transient network errors
        }
      })();
    };

    tick();
    const interval = setInterval(tick, 12_000);
    return () => clearInterval(interval);
  }, [token, activeScreen, scheduleMatchFlashes]);

  useEffect(() => {
    return () => {
      if (adminDocumentModal?.url) {
        URL.revokeObjectURL(adminDocumentModal.url);
      }
    };
  }, [adminDocumentModal]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const pollInterval = window.setInterval(() => {
      void refreshActiveEventsSnapshot();
    }, 30000);

    return () => window.clearInterval(pollInterval);
  }, [token]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    const known = subscribedEventsRef.current;
    for (const ev of events) {
      if (!known.has(ev.externalId)) {
        void subscribeToEvent(connection, ev.externalId);
        known.add(ev.externalId);
      }
    }
  }, [events]);

  const stakeNumber = useMemo(() => Number(stake.replace(',', '.')), [stake]);
  const totalOdds = useMemo(
    () => (slipLegs.length === 0 ? 0 : slipLegs.reduce((acc, leg) => acc * leg.odds, 1)),
    [slipLegs],
  );
  const potentialReturn = useMemo(() => {
    if (!Number.isFinite(stakeNumber) || slipLegs.length === 0) {
      return 0;
    }

    return stakeNumber * totalOdds;
  }, [stakeNumber, totalOdds, slipLegs.length]);

  useEffect(() => {
    setSlipLegs((prev) =>
      prev.map((leg) => {
        const ev = events.find((e) => e.externalId === leg.externalId);
        if (!ev) {
          return leg;
        }

        const odds = leg.selection === 0 ? ev.homeWinOdds : leg.selection === 1 ? ev.drawOdds : ev.awayWinOdds;
        return odds === leg.odds ? leg : { ...leg, odds };
      }),
    );
  }, [events]);

  async function loadWelcomeEvents() {
    try {
      const response = await api.get<SportEventDto[]>('/sport/active');
      setWelcomeEvents(ensureArray<SportEventDto>(response.data));
    } catch {
      setWelcomeEvents([]);
    }
  }

  function isSlipSelection(ev: SportEventDto, selection: BetSelection): boolean {
    const leg = slipLegs.find((l) => l.externalId === ev.externalId);
    return leg?.selection === selection;
  }

  function toggleLeg(ev: SportEventDto, selection: BetSelection, odds: number) {
    setSlipLegs((prev) => {
      const idx = prev.findIndex((l) => l.externalId === ev.externalId);
      if (idx === -1) {
        return [...prev, { externalId: ev.externalId, homeTeam: ev.homeTeam, awayTeam: ev.awayTeam, selection, odds }];
      }

      const existing = prev[idx];
      if (existing.selection === selection) {
        return prev.filter((_, i) => i !== idx);
      }

      const copy = [...prev];
      copy[idx] = { ...existing, selection, odds };
      return copy;
    });
    setBetError(null);
  }

  function clearSlip() {
    setSlipLegs([]);
    setBetError(null);
  }

  function selectionShortLabel(selection: BetSelection, leg: BetSlipLeg): string {
    if (selection === 0) {
      return `1 ${leg.homeTeam}`;
    }

    if (selection === 1) {
      return 'X Draw';
    }

    return `2 ${leg.awayTeam}`;
  }

  async function placeBet() {
    if (!getToken() || slipLegs.length === 0) {
      return;
    }
    if (!profile?.isBdVerified) {
      setDocVerifyPrompt('To place a bet, please verify your documents first.');
      setIsDocVerifyModalOpen(true);
      return;
    }

    const stakeNum = Number(stake.replace(',', '.'));
    if (!Number.isFinite(stakeNum) || stakeNum < 1) {
      setBetError('Stake must be at least 1.');
      return;
    }

    if (walletBalance != null && stakeNum > walletBalance) {
      setBetError('Insufficient balance.');
      return;
    }

    setBetBusy(true);
    setBetError(null);
    try {
      const payload: PlaceBetRequest = {
        stake: stakeNum,
        legs: slipLegs.map((l) => ({
          eventExternalId: l.externalId,
          selection: l.selection,
          requestedOdds: l.odds,
        })),
      };
      const res = await api.post<BetDto>('/bet', payload);
      const placed = normalizeBetDto(res.data);
      setMyBets((prev) => (prev.some((b) => b.id === placed.id) ? prev : [placed, ...prev]));
      setSlipLegs([]);
      setIsBetSlipOpen(false);
      setActiveScreen('history');
      setExpandedBetId(placed.id);
      setBetPlacementMessage('Bet placed successfully.');
      await loadWallet();
    } catch (e) {
      if (isUnauthorizedError(e)) {
        localStorage.removeItem('token');
        setToken(null);
        setBetError('Session expired. Please log in again.');
        return;
      }

      const data = axios.isAxiosError(e) ? (e.response?.data as { message?: string; title?: string }) : undefined;
      const msg = data?.message ?? data?.title ?? (e instanceof Error ? e.message : 'Bet failed');
      setBetError(typeof msg === 'string' ? msg : 'Bet failed');
    } finally {
      setBetBusy(false);
    }
  }

  function openTopUpModal() {
    if (!profile?.isBdVerified) {
      setDocVerifyPrompt('To deposit funds, please verify your documents first.');
      setIsDocVerifyModalOpen(true);
      return;
    }
    setTopUpAmount('100');
    setTopUpError(null);
    setIsTopUpOpen(true);
  }

  function openWithdrawModal() {
    setWithdrawAmount('100');
    setWithdrawError(null);
    setIsWithdrawOpen(true);
  }

  async function submitTopUp() {
    const amount = Number(topUpAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpError('Enter a valid amount greater than 0.');
      return;
    }

    setTopUpBusy(true);
    try {
      const payload: WalletTopUpRequest = { amount };
      const res = await api.post<WalletBalanceDto>('/Wallet/top-up', payload);
      setWalletBalance(Number(res.data.balance));
      setTopUpError(null);
      setIsTopUpOpen(false);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
        setTopUpError('Session expired. Please log in again.');
        return;
      }

      const data = axios.isAxiosError(error) ? (error.response?.data as { message?: string; title?: string }) : undefined;
      const msg = data?.message ?? data?.title ?? (error instanceof Error ? error.message : 'Top-up failed');
      setTopUpError(typeof msg === 'string' ? msg : 'Top-up failed');
    } finally {
      setTopUpBusy(false);
    }
  }

  async function submitWithdraw() {
    const amount = Number(withdrawAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawError('Enter a valid amount greater than 0.');
      return;
    }

    setWithdrawBusy(true);
    try {
      const payload: WalletTopUpRequest = { amount };
      const res = await api.post<WalletBalanceDto>('/Wallet/withdraw', payload);
      setWalletBalance(Number(res.data.balance));
      setWithdrawError(null);
      setIsWithdrawOpen(false);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
        setWithdrawError('Session expired. Please log in again.');
        return;
      }

      const data = axios.isAxiosError(error) ? (error.response?.data as { message?: string; title?: string }) : undefined;
      const msg = data?.message ?? data?.title ?? (error instanceof Error ? error.message : 'Withdraw failed');
      setWithdrawError(typeof msg === 'string' ? msg : 'Withdraw failed');
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function saveProfile() {
    if (!profile) {
      return;
    }

    const firstName = profileFirstName.trim();
    const lastName = profileLastName.trim();
    if (!firstName || !lastName) {
      setProfileError('First name and last name are required.');
      return;
    }

    try {
      const payload: UpdateProfileRequest = { firstName, lastName };
      const res = await api.put<UserProfileDto>('/auth/profile', payload);
      setProfile(res.data);
      setProfileFirstName(res.data.firstName);
      setProfileLastName(res.data.lastName);
      setProfileMessage('Profile updated.');
      setProfileError(null);
      setIsEditingProfile(false);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
        setProfileError('Session expired. Please log in again.');
        return;
      }

      const data = axios.isAxiosError(error) ? (error.response?.data as { message?: string; title?: string }) : undefined;
      const msg = data?.message ?? data?.title ?? (error instanceof Error ? error.message : 'Profile update failed');
      setProfileError(msg);
      setProfileMessage(null);
    }
  }

  async function changePassword() {
    if (!profileCurrentPassword || !profileNewPassword) {
      setProfileError('Both current and new password are required.');
      return;
    }

    try {
      const payload: ChangePasswordRequest = {
        currentPassword: profileCurrentPassword,
        newPassword: profileNewPassword,
      };
      await api.put('/auth/change-password', payload);
      setProfileCurrentPassword('');
      setProfileNewPassword('');
      setProfileMessage('Password changed successfully.');
      setProfileError(null);
      setIsChangingPassword(false);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        setToken(null);
        setProfileError('Session expired. Please log in again.');
        return;
      }

      const data = axios.isAxiosError(error) ? (error.response?.data as { message?: string; title?: string }) : undefined;
      const msg = data?.message ?? data?.title ?? (error instanceof Error ? error.message : 'Password update failed');
      setProfileError(msg);
      setProfileMessage(null);
    }
  }

  async function onAvatarSelected(file: File | null) {
    if (!file) {
      return;
    }

    if (!profile?.email) {
      setProfileError('Profile is still loading. Please try again in a moment.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setProfileError('Please select an image file.');
      return;
    }

    const maxAvatarBytes = 2 * 1024 * 1024;
    if (file.size > maxAvatarBytes) {
      setProfileError('Image is too large. Max size is 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const data = typeof reader.result === 'string' ? reader.result : null;
      if (!data) return;

      // Always show preview; persistence can fail on storage quota.
      setAvatarDataUrl(data);

      try {
        const payload: UpdateAvatarRequest = { avatarDataUrl: data };
        const res = await api.put<UserProfileDto>('/auth/avatar', payload);
        setProfile(res.data);
        setAvatarDataUrl(res.data.avatarDataUrl ?? data);
        setProfileMessage('Avatar uploaded successfully.');
        setProfileError(null);
      } catch {
        setProfileMessage(null);
        setProfileError('Could not save avatar to server.');
      }
    };
    reader.onerror = () => {
      setProfileError('Could not read selected image.');
      setProfileMessage(null);
    };
    reader.readAsDataURL(file);
  }

  async function submitAuth() {
    const errors = validateAuthFields({
      authMode,
      email,
      password,
      firstName,
      lastName,
      birthday,
    });
    if (Object.keys(errors).length > 0) {
      setAuthErrors(errors);
      setStatus('Please fix validation errors.');
      return;
    }

    setAuthErrors({});
    try {
      if (authMode === 'login') {
        const response = await api.post<{ token?: string; Token?: string }>('/auth/login', {
          email,
          password,
        });
        const jwt = response.data.token ?? response.data.Token ?? '';
        if (!jwt) {
          throw new Error('Token is missing in response');
        }

        localStorage.setItem('token', jwt);
        setIsProfileLoading(true);
        setToken(jwt);
        setStatus('Authorized');
      } else {
        await api.post('/auth/register', {
          email,
          password,
          firstName,
          lastName,
          birthday,
        });
        setAuthStep('verifyEmail');
        setAuthView('form');
        setStatus('Verification code sent to email. Enter code to continue.');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const parsedError = parseAuthApiError(error, authMode);
        if (Object.keys(parsedError.fieldErrors).length > 0) {
          setAuthErrors((prev) => ({ ...prev, ...parsedError.fieldErrors }));
        }
        const generalMessage = parsedError.generalMessage;
        if (generalMessage) {
          setAuthErrors((prev) => ({ ...prev, general: generalMessage }));
        }
        setStatus(parsedError.generalMessage ?? `Authorization failed (${error.response?.status ?? 'network'})`);
        return;
      }

      setStatus('Authorization failed');
    }
  }

  async function submitVerificationCode() {
    const codeError = validateVerificationCode(verificationCode);
    if (codeError) {
      setAuthErrors({ verificationCode: codeError });
      setStatus('Please enter a valid verification code.');
      return;
    }

    setAuthErrors({});
    try {
      await api.post('/auth/verify-email', {
        email,
        code: verificationCode,
      });
      const loginResponse = await api.post<{ token?: string; Token?: string }>('/auth/login', {
        email,
        password,
      });
      const jwt = loginResponse.data.token ?? loginResponse.data.Token ?? '';
      if (!jwt) {
        throw new Error('Token is missing in response');
      }

      setPendingVerificationToken(jwt);
      clearVerificationFile();
      setAuthStep('verifyAge');
      setVerificationCode('');
      setStatus('Email confirmed. Upload your ID to verify age.');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage =
          (error.response?.data as { message?: string } | undefined)?.message
          ?? `Verification failed (${error.response?.status ?? 'network'})`;
        setStatus(apiMessage);
        return;
      }

      setStatus('Verification failed');
    }
  }

  async function submitAgeVerification() {
    const verificationToken = pendingVerificationToken ?? getToken();
    if (!verificationToken) {
      setStatus('Session expired. Please sign in again.');
      setAuthStep('credentials');
      setAuthMode('login');
      return;
    }

    if (!verificationDocument) {
      setStatus('Please select a document image first.');
      return;
    }

    setVerificationBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', verificationDocument);
      const res = await api.post<{ status?: string; message?: string }>(
        '/auth/verify-id',
        formData,
        {
          headers: {
            Authorization: `Bearer ${verificationToken}`,
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      const statusValue = (res.data.status ?? '').toLowerCase();
      const message = res.data.message ?? 'Verification completed.';
      if (statusValue === 'verified') {
        if (pendingVerificationToken) {
          localStorage.setItem('token', verificationToken);
          setToken(verificationToken);
        }
        setPendingVerificationToken(null);
        setIsVerificationPendingView(false);
        clearVerificationFile();
        setIsDocVerifyModalOpen(false);
        await loadProfile();
        setStatus(message);
        return;
      }

      if (statusValue === 'pending') {
        if (pendingVerificationToken) {
          localStorage.setItem('token', verificationToken);
          setToken(verificationToken);
          setPendingVerificationToken(null);
        }
        clearVerificationFile();
        setIsDocVerifyModalOpen(false);
        setIsVerificationPendingView(true);
        setActiveScreen('verificationPending');
        setStatus(message);
        return;
      }

      setStatus(message);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string } | undefined)?.message
          ?? `Age verification failed (${error.response?.status ?? 'network'})`;
        setStatus(message);
      } else {
        setStatus('Age verification failed.');
      }
    } finally {
      setVerificationBusy(false);
    }
  }

  async function skipAgeVerification() {
    const verificationToken = pendingVerificationToken ?? getToken();
    if (!verificationToken) {
      setStatus('Session expired. Please sign in again.');
      setAuthStep('credentials');
      setAuthMode('login');
      return;
    }

    setVerificationBusy(true);
    try {
      const res = await api.post<{ message?: string }>(
        '/auth/skip-document-verification',
        {},
        {
          headers: {
            Authorization: `Bearer ${verificationToken}`,
          },
        },
      );

      if (pendingVerificationToken) {
        localStorage.setItem('token', verificationToken);
        setToken(verificationToken);
      }

      setPendingVerificationToken(null);
      clearVerificationFile();
      setIsDocVerifyModalOpen(false);
      await loadProfile();
      setStatus(res.data.message ?? 'Verification skipped temporarily.');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string } | undefined)?.message
          ?? `Could not skip verification (${error.response?.status ?? 'network'})`;
        setStatus(message);
      } else {
        setStatus('Could not skip verification.');
      }
    } finally {
      setVerificationBusy(false);
    }
  }

  async function resendVerificationCode() {
    const emailError = validateEmail(email);
    if (emailError) {
      setAuthErrors({ email: emailError });
      setStatus('Enter a valid email first.');
      return;
    }

    try {
      await api.post('/auth/resend-code', { email });
      setStatus('Verification code resent.');
    } catch {
      setStatus('Could not resend code');
    }
  }

  async function backToRegistration() {
    const emailError = validateEmail(email);
    if (emailError) {
      setAuthErrors({ email: emailError });
      setStatus('Enter a valid email first.');
      return;
    }

    try {
      await api.post('/auth/cancel-registration', { email });
    } catch {
      // Ignore transport errors here: user still should be able to return to registration screen.
    }

    setVerificationCode('');
    setPassword('');
    setPendingVerificationToken(null);
    clearVerificationFile();
    setAuthStep('credentials');
    setAuthMode('register');
    setAuthView('form');
    setStatus('You returned to registration. Previous pending registration was cancelled.');
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setEvents([]);
    setMyBets([]);
    setWalletBalance(null);
    setSlipLegs([]);
    setStake('10');
    setBetError(null);
    setIsBetSlipOpen(false);
    setIsTopUpOpen(false);
    setTopUpError(null);
    setIsWithdrawOpen(false);
    setWithdrawError(null);
    setProfile(null);
    setProfileFirstName('');
    setProfileLastName('');
    setProfileCurrentPassword('');
    setProfileNewPassword('');
    setProfileMessage(null);
    setProfileError(null);
    setAvatarDataUrl(null);
    setIsProfileLoading(false);
    setIsVerificationPendingView(false);
    verificationDecisionShownRef.current = false;
    if (adminDocumentModal?.url) {
      URL.revokeObjectURL(adminDocumentModal.url);
    }
    setAdminDocumentModal(null);
    setStatus('Logged out');
  }

  function goHomeFromSidebar() {
    if (isVerificationPendingView) {
      setActiveScreen('verificationPending');
      return;
    }
    if (isAdmin) {
      setActiveScreen('admin');
    } else if (isModerator) {
      setActiveScreen('moderator');
    } else {
      setActiveScreen('dashboard');
    }
    setSelectedSportTitle(null);
    setSportsPage(1);
    contentPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderBetSlipContent() {
    return (
      <>
        {slipLegs.length === 0 ? (
          <div className="betSlipEmptyState" aria-live="polite">
            <p className="betSlipEmptyTitle">Start your bet</p>
            <p className="betSlipEmptyText">Tap any odd in Football or Sports to add it here.</p>
            <div className="betSlipEmptySteps">
              <span>1) Pick outcomes</span>
              <span>2) Enter stake</span>
            </div>
          </div>
        ) : (
          <ul className="betSlipList">
            {slipLegs.map((leg) => (
              <li key={leg.externalId} className="betSlipRow">
                <div className="betSlipLegMeta">
                  <strong>
                    {leg.homeTeam} <span className="betSlipVs">vs</span> {leg.awayTeam}
                  </strong>
                  <span className="betSlipPick">
                    {selectionShortLabel(leg.selection, leg)} @ {leg.odds.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  className="betSlipRemoveLeg"
                  aria-label="Remove selection"
                  title="Remove this selection"
                  onClick={() => setSlipLegs((p) => p.filter((l) => l.externalId !== leg.externalId))}
                >
                  −
                </button>
              </li>
            ))}
          </ul>
        )}
        {slipLegs.length > 0 && (
          <div className="betSlipFooter">
            <button
              type="button"
              className="betSlipBalanceRow"
              onClick={() => {
                setActiveScreen('wallet');
                setIsBetSlipOpen(false);
              }}
              title="Open wallet"
            >
              <span>Balance</span>
              <strong>{walletBalance == null ? '—' : `$${walletBalance.toFixed(2)}`}</strong>
            </button>
            <label className="stakeLabel">
              Stake ($)
              <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" autoComplete="off" />
            </label>
            <div className="betSlipTotals">
              <div>
                <span>Total odds</span>
                <strong>{totalOdds.toFixed(2)}</strong>
              </div>
              <div>
                <span>Potential return</span>
                <strong>${potentialReturn.toFixed(2)}</strong>
              </div>
            </div>
            {betError && <p className="betSlipError">{betError}</p>}
            <div className="betSlipActions">
              <button type="button" className="placeBetBtn" onClick={() => void placeBet()} disabled={betBusy}>
                {betBusy ? 'Placing…' : 'Place bet'}
              </button>
              <button type="button" className="betSlipClear" onClick={clearSlip} disabled={betBusy}>
                Clear
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!token) {
    return (
      <div className="shell">
        <aside className="sidebar">
          <button
            type="button"
            className="logoBtn"
            onClick={() => {
              setAuthView('welcome');
              setAuthStep('credentials');
            }}
            aria-label="4Bet home"
            data-label="Home"
          >
            <SidebarIcon name="logo" />
          </button>
          <button type="button" className="nav active" disabled title="Sign in to open the dashboard" data-label="Dashboard">
            <SidebarIcon name="dashboard" />
          </button>
          <button type="button" className="nav" disabled title="Sign in to open sports" data-label="Sports">
            <SidebarIcon name="sports" />
          </button>
          <button type="button" className="nav" disabled title="Sign in to open esports" data-label="Esports">
            <SidebarIcon name="tournaments" />
          </button>
          <button type="button" className="nav" disabled title="Sign in to open wallet" data-label="Wallet">
            <SidebarIcon name="wallet" />
          </button>
          <button type="button" className="nav" disabled title="Sign in to view bet history" data-label="History">
            <SidebarIcon name="history" />
          </button>
        </aside>
        <section className="mainZone authMainZone">
          <main className={`authPanelWrap${authView === 'welcome' ? ' authPanelWrap--welcome' : ''}`}>
            {authView === 'welcome' ? (
              <div className="welcomePanel">
                <p className="authEyebrow">4Bet</p>
                <section className="welcomeHero">
                  <div className="welcomeHeroContent">
                    <span className="welcomeLiveBadge">LIVE FOOTBALL</span>
                    <h1>Feel every match. Bet in real time.</h1>
                    <p>
                      Join 4Bet to unlock live odds, instant goal reactions, and top football markets.
                    </p>
                  </div>
                </section>
                <div className="welcomePromoGrid">
                  <article className="welcomePromoCard">
                    <span>Live Markets</span>
                    <strong>1200+ events daily</strong>
                  </article>
                  <article className="welcomePromoCard">
                    <span>Realtime Speed</span>
                    <strong>Instant odds refresh</strong>
                  </article>
                  <article className="welcomePromoCard">
                    <span>Security</span>
                    <strong>Verified accounts only</strong>
                  </article>
                </div>
                <section className="welcomeMatches">
                  <header>
                    <h3>Hot football matches</h3>
                    <small>Live preview before sign in</small>
                  </header>
                  {welcomeFootballEvents.length === 0 ? (
                    <div className="welcomeLoadingState" role="status" aria-live="polite">
                      <div className="welcomeLoadingHead">
                        <span className="loadingSpinner loadingSpinner--compact" aria-hidden="true" />
                        <p className="authHint">Match feed is loading. Create account to unlock full live board.</p>
                      </div>
                      <div className="welcomeLoadingList" aria-hidden="true">
                        <div className="welcomeLoadingRow">
                          <span className="welcomeLoadingLine welcomeLoadingLine--team" />
                          <span className="welcomeLoadingLine welcomeLoadingLine--meta" />
                          <span className="welcomeLoadingLine welcomeLoadingLine--team" />
                        </div>
                        <div className="welcomeLoadingRow">
                          <span className="welcomeLoadingLine welcomeLoadingLine--odd" />
                          <span className="welcomeLoadingLine welcomeLoadingLine--odd" />
                          <span className="welcomeLoadingLine welcomeLoadingLine--odd" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    welcomeFootballEvents.map((ev) => (
                      <article key={ev.externalId} className="welcomeMatchItem">
                        <div className="welcomeTeamsRow">
                          <div className="welcomeTeamEdge">
                            <span className="teamLogo">
                              <img
                                src={resolveTeamLogoSrc(ev.homeTeamLogoUrl, ev.homeTeam)}
                                alt={ev.homeTeam}
                                onError={(e) => {
                                  e.currentTarget.src = buildTeamFallbackLogo(ev.homeTeam);
                                }}
                              />
                            </span>
                            <strong>{ev.homeTeam}</strong>
                          </div>
                          <div className="welcomeMatchMeta">
                            <strong>VS</strong>
                            <small>{formatWelcomeMatchMeta(ev)}</small>
                          </div>
                          <div className="welcomeTeamEdge welcomeTeamEdgeRight">
                            <span className="teamLogo">
                              <img
                                src={resolveTeamLogoSrc(ev.awayTeamLogoUrl, ev.awayTeam)}
                                alt={ev.awayTeam}
                                onError={(e) => {
                                  e.currentTarget.src = buildTeamFallbackLogo(ev.awayTeam);
                                }}
                              />
                            </span>
                            <strong>{ev.awayTeam}</strong>
                          </div>
                        </div>
                        <div className="welcomeOdds" role="group" aria-label="Odds preview (sign in to bet)">
                          <button type="button" className="welcomeOddsBtn" disabled title="Sign in to place a bet">
                            {ev.homeWinOdds.toFixed(2)}
                          </button>
                          <button type="button" className="welcomeOddsBtn" disabled title="Sign in to place a bet">
                            {ev.drawOdds.toFixed(2)}
                          </button>
                          <button type="button" className="welcomeOddsBtn" disabled title="Sign in to place a bet">
                            {ev.awayWinOdds.toFixed(2)}
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </section>
                <div className="welcomeActions">
                  <button
                    type="button"
                    className="authSubmit welcomeActionBtn"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthStep('credentials');
                      setAuthView('form');
                    }}
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    className="authSecondaryBtn welcomeActionBtn"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthStep('credentials');
                      setAuthView('form');
                    }}
                  >
                    Sign in
                  </button>
                </div>
              </div>
            ) : (
              <div className="authPanel">
                <p className="authEyebrow">4Bet</p>
                {authStep === 'credentials' ? (
                <>
                  <h2>{authMode === 'login' ? 'Sign in to continue' : 'Create your account'}</h2>
                  <p className="authHint">Use your credentials to access live bets and realtime updates.</p>
                  <button
                    className="authLinkBtn"
                    onClick={() => {
                      setAuthErrors({});
                      setAuthView('welcome');
                    }}
                  >
                    ← Back to welcome
                  </button>
                  <div className="authSwitch">
                    <button className={authMode === 'login' ? 'tab active' : 'tab'} onClick={() => setAuthMode('login')}>Login</button>
                    <button className={authMode === 'register' ? 'tab active' : 'tab'} onClick={() => setAuthMode('register')}>Register</button>
                  </div>
                  {authErrors.general && <small className="fieldError">{authErrors.general}</small>}
                  <label>
                    Email
                    <input
                      className={authErrors.email ? 'inputError' : ''}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setAuthErrors((prev) => ({ ...prev, email: '', general: '' }));
                      }}
                    />
                    {authErrors.email && <small className="fieldError">{authErrors.email}</small>}
                  </label>
                  <label>
                    Password
                    <div className="passwordField">
                      <input
                        className={authErrors.password ? 'inputError' : ''}
                        type={showAuthPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setAuthErrors((prev) => ({ ...prev, password: '', general: '' }));
                        }}
                      />
                      <button
                        type="button"
                        className="passwordToggleBtn"
                        onClick={() => setShowAuthPassword((v) => !v)}
                        aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                      >
                        <EyeIcon open={showAuthPassword} />
                      </button>
                    </div>
                    {authErrors.password && <small className="fieldError">{authErrors.password}</small>}
                  </label>
                  {authMode === 'register' && (
                    <>
                      <label>
                        First name
                        <input
                          className={authErrors.firstName ? 'inputError' : ''}
                          value={firstName}
                          onChange={(e) => {
                            setFirstName(e.target.value);
                            setAuthErrors((prev) => ({ ...prev, firstName: '', general: '' }));
                          }}
                        />
                        {authErrors.firstName && <small className="fieldError">{authErrors.firstName}</small>}
                      </label>
                      <label>
                        Last name
                        <input
                          className={authErrors.lastName ? 'inputError' : ''}
                          value={lastName}
                          onChange={(e) => {
                            setLastName(e.target.value);
                            setAuthErrors((prev) => ({ ...prev, lastName: '', general: '' }));
                          }}
                        />
                        {authErrors.lastName && <small className="fieldError">{authErrors.lastName}</small>}
                      </label>
                      <label>
                        Birthday
                        <input
                          className={authErrors.birthday ? 'inputError' : ''}
                          type="date"
                          value={birthday}
                          onChange={(e) => {
                            setBirthday(e.target.value);
                            setAuthErrors((prev) => ({ ...prev, birthday: '', general: '' }));
                          }}
                        />
                        {authErrors.birthday && <small className="fieldError">{authErrors.birthday}</small>}
                      </label>
                    </>
                  )}
                  <button className="authSubmit" onClick={() => void submitAuth()}>
                    {authMode === 'login' ? 'Login' : 'Register'}
                  </button>
                </>
                ) : (
                  <>
                    {authStep === 'verifyEmail' ? (
                      <>
                        <h2>Confirm your email</h2>
                        <p className="authHint">
                          We sent a verification code to <strong>{email}</strong>.
                        </p>
                        <label>
                          Verification code
                          <input
                            className={authErrors.verificationCode ? 'inputError' : ''}
                            value={verificationCode}
                            onChange={(e) => {
                              setVerificationCode(e.target.value);
                              setAuthErrors((prev) => ({ ...prev, verificationCode: '' }));
                            }}
                          />
                          {authErrors.verificationCode && <small className="fieldError">{authErrors.verificationCode}</small>}
                        </label>
                        <button className="authSubmit" onClick={() => void submitVerificationCode()}>
                          Confirm email
                        </button>
                        <div className="authActions">
                          <button className="authSecondaryBtn" onClick={() => void resendVerificationCode()}>
                            Resend code
                          </button>
                          <button className="authSecondaryBtn authBackBtn" onClick={() => void backToRegistration()}>
                            Back to registration
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2>Verify your age</h2>
                        <p className="authHint">
                          Upload an ID document to finish registration and activate betting access.
                        </p>
                        <label>
                          ID document (photo)
                          <label
                            className={isVerifyDragOver ? 'verifyUploadCard dragOver' : 'verifyUploadCard'}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsVerifyDragOver(true);
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              setIsVerifyDragOver(false);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const dropped = e.dataTransfer.files?.[0] ?? null;
                              setVerificationFile(dropped);
                            }}
                          >
                            <input
                              ref={verifyUploadInputRef}
                              className="verifyUploadInput"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(e) => setVerificationFile(e.target.files?.[0] ?? null)}
                            />
                            {verificationPreviewUrl ? (
                              <img src={verificationPreviewUrl} alt="Selected document preview" className="verifyUploadPreview" />
                            ) : (
                              <span className="verifyUploadIcon" aria-hidden="true" />
                            )}
                            <strong>{verificationDocument ? verificationDocument.name : 'Tap or drop document here'}</strong>
                            <small>{verificationDocument ? 'File selected' : 'PNG, JPG or PDF'}</small>
                          </label>
                        </label>
                        <button className="authSubmit" onClick={() => void submitAgeVerification()} disabled={verificationBusy}>
                          {verificationBusy ? 'Verifying…' : 'Verify age'}
                        </button>
                        <div className="authActions">
                          <button className="authSecondaryBtn" onClick={() => void skipAgeVerification()} disabled={verificationBusy}>
                            Skip for now
                          </button>
                          <button className="authSecondaryBtn authBackBtn" onClick={() => void backToRegistration()} disabled={verificationBusy}>
                            Back to registration
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </main>
        </section>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="logoBtn" onClick={goHomeFromSidebar} aria-label="4Bet home" data-label="Home">
          <SidebarIcon name="logo" />
        </button>
        {!isStaffRestricted && !isVerificationPendingView && (
          <>
            <button className={activeScreen === 'dashboard' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('dashboard')} aria-label="Dashboard" data-label="Dashboard">
              <SidebarIcon name="dashboard" />
            </button>
            <button className={activeScreen === 'sports' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('sports')} aria-label="Sports" data-label="Sports">
              <SidebarIcon name="sports" />
            </button>
            <button className={activeScreen === 'esports' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('esports')} aria-label="Esports tournaments" data-label="Esports">
              <SidebarIcon name="tournaments" />
            </button>
            <button className={activeScreen === 'wallet' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('wallet')} aria-label="Wallet" data-label="Wallet">
              <SidebarIcon name="wallet" />
            </button>
            <button className={activeScreen === 'profile' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('profile')} aria-label="Profile" data-label="Profile">
              <SidebarIcon name="profile" />
            </button>
            <button className={activeScreen === 'history' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('history')} aria-label="Betting history" data-label="History">
              <SidebarIcon name="history" />
            </button>
          </>
        )}
        {isModerator && (
          <button className={activeScreen === 'moderator' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('moderator')} aria-label="Moderator panel" data-label="Moderator">
            <SidebarIcon name="moderator" />
          </button>
        )}
        {isAdmin && (
          <button className={activeScreen === 'admin' ? 'nav active' : 'nav'} onClick={() => setActiveScreen('admin')} aria-label="Admin panel" data-label="Admin">
            <SidebarIcon name="admin" />
          </button>
        )}
        {!isStaffRestricted && !isVerificationPendingView && (
          <button
            type="button"
            className={[
              'nav',
              'navBottom',
              isBetSlipOpen ? 'active' : '',
              slipLegs.length > 0 ? 'navBetSlipPending' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setIsBetSlipOpen((v) => !v)}
            title="Open bet slip"
            aria-label="Open bet slip"
            data-label="Bet slip"
          >
            <SidebarIcon name="slip" />
          </button>
        )}
      </aside>

      <section className="mainZone">
        <header className="topbar">
          {isStaffRestricted ? (
            <div className="staffTopbar">
              <div>
                <strong>{isAdmin ? 'Administrator workspace' : 'Moderator workspace'}</strong>
                <small>Real-time control panel</small>
              </div>
              <button type="button" className="logoutBtn" onClick={logout}>Log out</button>
            </div>
          ) : (
            <div className="topControls">
              <div className="balanceChip">
                <span>Available Balance</span>
                {isWalletLoading ? (
                  <strong className="balanceValuePending" aria-live="polite" aria-label="Loading balance">
                    <span className="loadingSpinner loadingSpinner--compact" aria-hidden="true" />
                  </strong>
                ) : (
                  <strong>{walletBalance == null ? '—' : `$${walletBalance.toFixed(2)}`}</strong>
                )}
              </div>
              <button className="depositBtn" onClick={openTopUpModal}>+ Deposit</button>
              <button type="button" className="userChip" onClick={() => setActiveScreen('profile')}>
                <span className="avatar" aria-busy={isProfileLoading && !profile}>
                  {isProfileLoading && !profile ? (
                    <span className="avatarPending" aria-hidden="true">
                      <span className="loadingSpinner loadingSpinner--avatar" />
                    </span>
                  ) : avatarDataUrl ? (
                    <img src={avatarDataUrl} alt="User avatar" className="avatarImg" />
                  ) : (
                    displayUser.initials
                  )}
                </span>
                <div className="userMeta">
                  <strong className={isProfileLoading && !profile ? 'userName userName--pendingLoad' : 'userName'}>
                    {isProfileLoading && !profile ? (
                      <span className="userNamePending" aria-label="Loading profile">
                        <span className="userNamePendingLine" />
                        <span className="userNamePendingLine userNamePendingLine--short" />
                      </span>
                    ) : (
                      displayUser.fullName
                    )}
                  </strong>
                  <small>{isProfileLoading && !profile ? 'Loading…' : 'Premium Member'}</small>
                </div>
              </button>
            </div>
          )}
        </header>

        <div className="contentLayout" ref={contentLayoutRef}>
          <div className="contentPanel" ref={contentPanelRef}>
            {activeScreen === 'verificationPending' && (
              <section className="placeholderCard verificationPendingCard verificationPendingCard--enhanced">
                <span className="verificationPendingBadge">Pending review</span>
                <h2>Document review in progress</h2>
                <p>Your documents are under manual verification. Admin will review them soon and you will be notified right here.</p>
                {pendingRefreshAt && <small className="verificationPendingMeta">Last checked: {pendingRefreshAt}</small>}
                <div className="adminActions verificationPendingActions">
                  <button type="button" className="authSecondaryBtn" onClick={() => void refreshPendingVerificationStatus()} disabled={pendingRefreshBusy}>
                    {pendingRefreshBusy ? 'Updating...' : 'Refresh status'}
                  </button>
                  <button type="button" className="logoutBtn dangerBtn" onClick={logout}>
                    Back to start screen
                  </button>
                </div>
              </section>
            )}

            {activeScreen === 'dashboard' && (
              <>
                {isEventsLoading && footballEvents.length === 0 && (
                  <div className="loadingStateCard" role="status" aria-live="polite">
                    <span className="loadingSpinner" aria-hidden="true" />
                    <strong>Loading live matches...</strong>
                  </div>
                )}
                <div className="statsRow">
                  <div className="statCard"><span>Active Bets</span><strong>{myBets.length}</strong></div>
                  <div className="statCard"><span>Live Matches</span><strong>{liveMatchesCount}</strong></div>
                  <div className="statCard"><span>Win Rate</span><strong>{calcWinRate(myBets)}%</strong></div>
                  <div className="statCard"><span>Total Volume</span><strong>${calcTotalVolume(myBets)}</strong></div>
                </div>
                {footballEvents.map((ev) => {
                  const isLive = isLiveOrInProgress(ev.eventDate, ev.matchStatus);
                  return isLive ? (
                    <article
                      key={ev.externalId}
                      className={`matchCard ${eventHighlights[ev.externalId] === 'goal' ? 'goalPulse' : ''} ${eventHighlights[ev.externalId] === 'event' ? 'eventPulse' : ''}`}
                    >
                      <div className="matchHeader">
                        <span className="matchHeaderStatus">
                          <i className="liveIndicator" aria-hidden="true" />
                          LIVE MATCH
                        </span>
                        <span>Football</span>
                      </div>
                      <div className="liveRow">
                        <div className="teamBlock">
                          <span className="teamLogo">
                            <img
                              src={resolveTeamLogoSrc(ev.homeTeamLogoUrl, ev.homeTeam)}
                              alt={ev.homeTeam}
                              onError={(e) => {
                                e.currentTarget.src = buildTeamFallbackLogo(ev.homeTeam);
                              }}
                            />
                          </span>
                          <strong>{ev.homeTeam}</strong>
                        </div>
                        <div className="scoreCenter">
                          <span className="scoreNumbers">{formatScore(ev.homeScore, ev.awayScore)}</span>
                          <span className="minute">{formatMatchClock(ev, clockNowMs)}</span>
                          <small className="matchPhase">{formatDashboardPhaseLabel(ev)}</small>
                        </div>
                        <div className="teamBlock">
                          <span className="teamLogo">
                            <img
                              src={resolveTeamLogoSrc(ev.awayTeamLogoUrl, ev.awayTeam)}
                              alt={ev.awayTeam}
                              onError={(e) => {
                                e.currentTarget.src = buildTeamFallbackLogo(ev.awayTeam);
                              }}
                            />
                          </span>
                          <strong>{ev.awayTeam}</strong>
                        </div>
                      </div>
                      <div className="odds">
                        <button
                          type="button"
                          className={isSlipSelection(ev, 0) ? 'selected' : ''}
                          onClick={() => toggleLeg(ev, 0, ev.homeWinOdds)}
                        >
                          {ev.homeWinOdds.toFixed(2)}
                        </button>
                        <button
                          type="button"
                          className={isSlipSelection(ev, 1) ? 'selected' : ''}
                          onClick={() => toggleLeg(ev, 1, ev.drawOdds)}
                        >
                          {ev.drawOdds.toFixed(2)}
                        </button>
                        <button
                          type="button"
                          className={isSlipSelection(ev, 2) ? 'selected' : ''}
                          onClick={() => toggleLeg(ev, 2, ev.awayWinOdds)}
                        >
                          {ev.awayWinOdds.toFixed(2)}
                        </button>
                      </div>
                    </article>
                  ) : (
                    <article key={ev.externalId} className="matchCard">
                      <div className="matchHeader">
                        <span className="matchHeaderStatus">UPCOMING</span>
                        <span>{mapSportTitle(ev.sportKey)}</span>
                      </div>
                      <div className="liveRow">
                        <div className="teamBlock">
                          <span className="teamLogo">
                            <img
                              src={resolveTeamLogoSrc(ev.homeTeamLogoUrl, ev.homeTeam)}
                              alt={ev.homeTeam}
                              onError={(e) => {
                                e.currentTarget.src = buildTeamFallbackLogo(ev.homeTeam);
                              }}
                            />
                          </span>
                          <strong>{ev.homeTeam}</strong>
                        </div>
                        <div className="sportsMatchCenter">
                          <span className="sportsMatchVs">VS</span>
                          <small>{new Date(ev.eventDate).toLocaleString()}</small>
                        </div>
                        <div className="teamBlock">
                          <span className="teamLogo">
                            <img
                              src={resolveTeamLogoSrc(ev.awayTeamLogoUrl, ev.awayTeam)}
                              alt={ev.awayTeam}
                              onError={(e) => {
                                e.currentTarget.src = buildTeamFallbackLogo(ev.awayTeam);
                              }}
                            />
                          </span>
                          <strong>{ev.awayTeam}</strong>
                        </div>
                      </div>
                      <div className="odds">
                        <button
                          type="button"
                          className={isSlipSelection(ev, 0) ? 'selected' : ''}
                          onClick={() => toggleLeg(ev, 0, ev.homeWinOdds)}
                        >
                          {ev.homeWinOdds.toFixed(2)}
                        </button>
                        <button
                          type="button"
                          className={isSlipSelection(ev, 1) ? 'selected' : ''}
                          onClick={() => toggleLeg(ev, 1, ev.drawOdds)}
                        >
                          {ev.drawOdds.toFixed(2)}
                        </button>
                        <button
                          type="button"
                          className={isSlipSelection(ev, 2) ? 'selected' : ''}
                          onClick={() => toggleLeg(ev, 2, ev.awayWinOdds)}
                        >
                          {ev.awayWinOdds.toFixed(2)}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </>
            )}

            {activeScreen === 'sports' && (
              <>
                {isEventsLoading && sportCards.length === 0 && (
                  <div className="loadingStateCard" role="status" aria-live="polite">
                    <span className="loadingSpinner" aria-hidden="true" />
                    <strong>Loading sports data...</strong>
                  </div>
                )}
                {!selectedSportTitle && (
                  <div className="gridCards">
                    {sportCards.map((sport) => (
                      <button
                        key={sport.title}
                        className="sportCard"
                        onClick={() => {
                          setSelectedSportTitle(sport.title);
                          setSportsPage(1);
                        }}
                      >
                        <h3>{sport.title}</h3>
                        <p>{sport.total} matches</p>
                        <small>{sport.live} LIVE</small>
                      </button>
                    ))}
                  </div>
                )}
                {selectedSportTitle && (
                  <section className="sportsMatchesList">
                    <header>
                      <button
                        className="sportsBackBtn"
                        onClick={() => {
                          setSelectedSportTitle(null);
                          setSportsPage(1);
                        }}
                      >
                        ← Back
                      </button>
                      <h3>{selectedSportTitle} matches</h3>
                      <small>{selectedSportMatches.length} total</small>
                    </header>
                    {isEventsLoading && selectedSportMatches.length === 0 ? (
                      <div className="loadingStateCard loadingStateCardInline" role="status" aria-live="polite">
                        <span className="loadingSpinner" aria-hidden="true" />
                        <strong>Loading matches...</strong>
                      </div>
                    ) : selectedSportMatches.length === 0 ? (
                      <p>No matches for selected sport.</p>
                    ) : (
                      pagedSportMatches.map((ev) => {
                        const isLive = isLiveOrInProgress(ev.eventDate, ev.matchStatus);
                        return isLive ? (
                          <article key={ev.externalId} className="matchCard">
                            <div className="matchHeader">
                              <span className="matchHeaderStatus">
                                <i className="liveIndicator" aria-hidden="true" />
                                LIVE MATCH
                              </span>
                              <span>{selectedSportTitle}</span>
                            </div>
                            <div className="liveRow">
                              <div className="teamBlock">
                                <span className="teamLogo">
                                  <img
                                    src={resolveTeamLogoSrc(ev.homeTeamLogoUrl, ev.homeTeam)}
                                    alt={ev.homeTeam}
                                    onError={(e) => {
                                      e.currentTarget.src = buildTeamFallbackLogo(ev.homeTeam);
                                    }}
                                  />
                                </span>
                                <strong>{ev.homeTeam}</strong>
                              </div>
                              <div className="scoreCenter">
                                <span className="scoreNumbers">{formatScore(ev.homeScore, ev.awayScore)}</span>
                                <span className="minute">{formatMatchClock(ev, clockNowMs)}</span>
                                <small className="matchPhase">{formatDashboardPhaseLabel(ev)}</small>
                              </div>
                              <div className="teamBlock">
                                <span className="teamLogo">
                                  <img
                                    src={resolveTeamLogoSrc(ev.awayTeamLogoUrl, ev.awayTeam)}
                                    alt={ev.awayTeam}
                                    onError={(e) => {
                                      e.currentTarget.src = buildTeamFallbackLogo(ev.awayTeam);
                                    }}
                                  />
                                </span>
                                <strong>{ev.awayTeam}</strong>
                              </div>
                            </div>
                            <div className="odds">
                              <button
                                type="button"
                                className={isSlipSelection(ev, 0) ? 'selected' : ''}
                                onClick={() => toggleLeg(ev, 0, ev.homeWinOdds)}
                              >
                                {ev.homeWinOdds.toFixed(2)}
                              </button>
                              <button
                                type="button"
                                className={isSlipSelection(ev, 1) ? 'selected' : ''}
                                onClick={() => toggleLeg(ev, 1, ev.drawOdds)}
                              >
                                {ev.drawOdds.toFixed(2)}
                              </button>
                              <button
                                type="button"
                                className={isSlipSelection(ev, 2) ? 'selected' : ''}
                                onClick={() => toggleLeg(ev, 2, ev.awayWinOdds)}
                              >
                                {ev.awayWinOdds.toFixed(2)}
                              </button>
                            </div>
                          </article>
                        ) : (
                          <article key={ev.externalId} className="matchCard">
                            <div className="matchHeader">
                              <span className="matchHeaderStatus">UPCOMING</span>
                              <span>{selectedSportTitle}</span>
                            </div>
                            <div className="liveRow">
                              <div className="teamBlock">
                                <span className="teamLogo">
                                  <img
                                    src={resolveTeamLogoSrc(ev.homeTeamLogoUrl, ev.homeTeam)}
                                    alt={ev.homeTeam}
                                    onError={(e) => {
                                      e.currentTarget.src = buildTeamFallbackLogo(ev.homeTeam);
                                    }}
                                  />
                                </span>
                                <strong>{ev.homeTeam}</strong>
                              </div>
                              <div className="sportsMatchCenter">
                                <span className="sportsMatchVs">VS</span>
                                <small>{new Date(ev.eventDate).toLocaleString()}</small>
                              </div>
                              <div className="teamBlock">
                                <span className="teamLogo">
                                  <img
                                    src={resolveTeamLogoSrc(ev.awayTeamLogoUrl, ev.awayTeam)}
                                    alt={ev.awayTeam}
                                    onError={(e) => {
                                      e.currentTarget.src = buildTeamFallbackLogo(ev.awayTeam);
                                    }}
                                  />
                                </span>
                                <strong>{ev.awayTeam}</strong>
                              </div>
                            </div>
                            <div className="odds">
                              <button
                                type="button"
                                className={isSlipSelection(ev, 0) ? 'selected' : ''}
                                onClick={() => toggleLeg(ev, 0, ev.homeWinOdds)}
                              >
                                {ev.homeWinOdds.toFixed(2)}
                              </button>
                              <button
                                type="button"
                                className={isSlipSelection(ev, 1) ? 'selected' : ''}
                                onClick={() => toggleLeg(ev, 1, ev.drawOdds)}
                              >
                                {ev.drawOdds.toFixed(2)}
                              </button>
                              <button
                                type="button"
                                className={isSlipSelection(ev, 2) ? 'selected' : ''}
                                onClick={() => toggleLeg(ev, 2, ev.awayWinOdds)}
                              >
                                {ev.awayWinOdds.toFixed(2)}
                              </button>
                            </div>
                          </article>
                        );
                      })
                    )}
                    {selectedSportMatches.length > sportsPageSize && (
                      <div className="sportsPagination">
                        <button
                          onClick={() => setSportsPage((p) => Math.max(1, p - 1))}
                          disabled={sportsPage <= 1}
                        >
                          Prev
                        </button>
                        <span>Page {sportsPage} / {sportsTotalPages}</span>
                        <button
                          onClick={() => setSportsPage((p) => Math.min(sportsTotalPages, p + 1))}
                          disabled={sportsPage >= sportsTotalPages}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}

            {activeScreen === 'history' && (
              <>
                <h2>Betting History</h2>
                <section className="historyAnalyticsCard">
                  <div className="historyAnalyticsHeader">
                    <h3>Analytics</h3>
                    <div className="historyFilters">
                      <label>
                        From
                        <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
                      </label>
                      <label>
                        To
                        <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
                      </label>
                      <button
                        type="button"
                        className="authSecondaryBtn historyApplyBtn"
                        onClick={() => void loadBetAnalytics(historyFrom, historyTo)}
                        disabled={analyticsBusy}
                      >
                        {analyticsBusy ? 'Loading...' : 'Apply'}
                      </button>
                    </div>
                  </div>
                  {analyticsError ? <p className="profileError">{analyticsError}</p> : null}
                  {betAnalytics && (
                    <>
                      <div className="statsRow historyAnalyticsStats">
                        <div className="statCard"><span>Total bets</span><strong>{betAnalytics.totalBets}</strong></div>
                        <div className="statCard"><span>Stake volume</span><strong>${Number(betAnalytics.totalStake).toFixed(2)}</strong></div>
                        <div className="statCard"><span>Payout</span><strong>${Number(betAnalytics.totalPayout).toFixed(2)}</strong></div>
                        <div className="statCard"><span>Net</span><strong>${Number(betAnalytics.net).toFixed(2)}</strong></div>
                        <div className="statCard"><span>Win rate</span><strong>{betAnalytics.winRatePercent.toFixed(1)}%</strong></div>
                      </div>
                      <div className="analyticsBarsWrap" role="img" aria-label="Daily bets trend chart">
                        {betAnalytics.points.length === 0 ? (
                          <p className="historyEmptyState">No analytics data in selected range.</p>
                        ) : (
                          <div className="analyticsBars">
                            {betAnalytics.points.map((point) => (
                              <div key={point.dayUtc} className="analyticsBarItem">
                                <span
                                  className="analyticsBar"
                                  style={{ height: `${Math.max(8, (point.betsCount / Math.max(...betAnalytics.points.map((p) => p.betsCount), 1)) * 110)}px` }}
                                  title={`${new Date(point.dayUtc).toLocaleDateString()}: ${point.betsCount} bets`}
                                />
                                <small>{new Date(point.dayUtc).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}</small>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
                <div className="historyList" role="list">
                  {myBets.length === 0 && (
                    <div className="historyEmptyState">You have not placed bets yet.</div>
                  )}
                  {myBets.map((bet) => {
                    const isExpanded = expandedBetId === bet.id;
                    return (
                      <article key={bet.id} className={`historyCard ${isExpanded ? 'historyCardExpanded' : ''}`} role="listitem">
                        <button
                          type="button"
                          className="historyCardHead"
                          onClick={() => setExpandedBetId((curr) => (curr === bet.id ? null : bet.id))}
                          aria-expanded={isExpanded}
                        >
                          <span className="historyCardDate">{new Date(bet.createdAt).toLocaleString()}</span>
                          <strong className={`historyCardStatus status-${mapStatusLabel(bet.status).toLowerCase()}`}>{mapStatusLabel(bet.status)}</strong>
                          <span className="historyCardStake">
                            <small>Stake</small>
                            <strong>${Number(bet.stake).toFixed(2)}</strong>
                          </span>
                          <span className="historyCardOdds">
                            <small>Odds</small>
                            <strong>x{bet.combinedOdds.toFixed(2)}</strong>
                          </span>
                          <span className="historyCardChevron" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                        </button>
                        {isExpanded && (
                          <div className="historyCardBody">
                            <div className="historyCardMetaGrid">
                              <div className="historyCardMeta">
                                <span>Potential payout</span>
                                <strong>${Number(bet.potentialPayout).toFixed(2)}</strong>
                              </div>
                              <div className="historyCardMeta">
                                <span>Settled payout</span>
                                <strong>{bet.settledPayout != null ? `$${Number(bet.settledPayout).toFixed(2)}` : '—'}</strong>
                              </div>
                            </div>
                            <div className="historyLegs">
                              {(bet.legs ?? []).map((leg) => (
                                <div key={`${bet.id}-${leg.eventExternalId}-${leg.selection}`} className="historyLegRow">
                                  <div className="historyLegText">
                                    <strong>{leg.homeTeam} vs {leg.awayTeam}</strong>
                                    <small>{formatBetLegSelection(leg)}</small>
                                  </div>
                                  <strong className="historyLegOdds">{leg.lockedOdds.toFixed(2)}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            {activeScreen === 'wallet' && (
              <>
                <div className="walletHero">
                  <span>Available Balance</span>
                  <strong>{walletBalance == null ? '—' : `$${walletBalance.toFixed(2)}`}</strong>
                  <div className="walletButtons">
                    <button className="walletActionBtn depositBtn" onClick={openTopUpModal}>+ Deposit</button>
                    <button type="button" className="walletActionBtn" onClick={openWithdrawModal}>Withdraw</button>
                  </div>
                </div>
                <div className="statsRow">
                  <div className="statCard">
                    <span>Total staked</span>
                    <strong>${myBets.reduce((a, b) => a + Number(b.stake), 0).toFixed(2)}</strong>
                  </div>
                  <div className="statCard">
                    <span>Total returned</span>
                    <strong>${myBets.reduce((a, b) => a + Number(b.settledPayout ?? 0), 0).toFixed(2)}</strong>
                  </div>
                  <div className="statCard">
                    <span>Open bets</span>
                    <strong>{myBets.filter((b) => b.status === 0).length}</strong>
                  </div>
                </div>
              </>
            )}

            {activeScreen === 'profile' && (
              <section className="profileSection">
                <h2>Profile</h2>
                <div className="profileHeaderCard">
                  <div className="profileAvatarHero">
                    <span className="profileAvatarWrap profileAvatarWrapLarge" aria-busy={isProfileLoading && !profile}>
                      {isProfileLoading && !profile ? (
                        <span className="profileAvatarPending" aria-hidden="true">
                          <span className="loadingSpinner loadingSpinner--profileHero" />
                        </span>
                      ) : avatarDataUrl ? (
                        <img src={avatarDataUrl} alt="User avatar" className="profileAvatarImg" />
                      ) : (
                        <span className="profileAvatarFallback">{displayUser.initials}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="profileUploadIconBtn"
                      title="Upload avatar"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <span className="profileCameraIcon" aria-hidden="true" />
                    </button>
                    <input
                      ref={avatarInputRef}
                      className="profileUploadInputHidden"
                      type="file"
                      accept="image/*"
                      onChange={(e) => void onAvatarSelected(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <h3 className="profileDisplayName">{profile?.firstName} {profile?.lastName}</h3>
                </div>

                <div className="profileCard">
                  <div className="profileInfoList">
                    <div className="profileInfoRow">
                      <span>Email</span>
                      <strong>{profile?.email ?? '—'}</strong>
                    </div>
                    <div className="profileInfoRow">
                      <span>First name</span>
                      <strong>{profile?.firstName ?? '—'}</strong>
                    </div>
                    <div className="profileInfoRow">
                      <span>Last name</span>
                      <strong>{profile?.lastName ?? '—'}</strong>
                    </div>
                  </div>

                  {isEditingProfile && (
                    <div className="profileGrid">
                      <label>
                        First name
                        <input value={profileFirstName} onChange={(e) => setProfileFirstName(e.target.value)} />
                      </label>
                      <label>
                        Last name
                        <input value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} />
                      </label>
                    </div>
                  )}

                  <div className="profileActions profileActionsList">
                    {!isEditingProfile ? (
                      <button type="button" className="depositBtn" onClick={() => {
                        setProfileFirstName(profile?.firstName ?? '');
                        setProfileLastName(profile?.lastName ?? '');
                        setIsEditingProfile(true);
                        setProfileError(null);
                        setProfileMessage(null);
                      }}>Edit profile</button>
                    ) : (
                      <>
                        <button type="button" className="depositBtn" onClick={() => void saveProfile()}>Save profile</button>
                        <button type="button" className="authSecondaryBtn" onClick={() => {
                          setIsEditingProfile(false);
                          setProfileFirstName(profile?.firstName ?? '');
                          setProfileLastName(profile?.lastName ?? '');
                        }}>Cancel</button>
                      </>
                    )}
                    {!isChangingPassword ? (
                      <button type="button" className="walletActionBtn" onClick={() => {
                        setIsChangingPassword(true);
                        setProfileError(null);
                        setProfileMessage(null);
                      }}>Change password</button>
                    ) : (
                      <button type="button" className="authSecondaryBtn" onClick={() => {
                        setIsChangingPassword(false);
                        setProfileCurrentPassword('');
                        setProfileNewPassword('');
                      }}>Close password window</button>
                    )}
                    <button type="button" className="logoutBtn profileLogoutBtn" onClick={logout}>Log out</button>
                  </div>
                  {profileError && !isChangingPassword && <p className="profileError">{profileError}</p>}
                </div>
              </section>
            )}

            {activeScreen === 'moderator' && isModerator && (
              <section className="adminPanel">
                <header className="adminPanelHeader">
                  <div>
                    <h2>Moderator panel</h2>
                    <p>Manage events, odds, scores, and match timer state.</p>
                  </div>
                  <div className="adminPanelHeaderActions">
                    <button
                      type="button"
                      className="authSubmit adminHeaderPrimaryBtn"
                      onClick={() => {
                        setModeratorForm(createEmptyModeratorForm());
                        setModeratorEditEventId(null);
                        setIsModeratorEditorOpen(true);
                      }}
                      disabled={moderatorBusy}
                    >
                      Add event
                    </button>
                    <button type="button" className="authSecondaryBtn" onClick={() => void refreshActiveEventsSnapshot()} disabled={moderatorBusy}>
                      Refresh list
                    </button>
                  </div>
                </header>
                <div className="adminList">
                  {events.map((event) => (
                    <article className="adminItemCard" key={event.id}>
                      <div>
                        <strong>{event.homeTeam} vs {event.awayTeam}</strong>
                        <p>{new Date(event.eventDate).toLocaleString()}</p>
                        <p>{formatMatchPhaseLabel(event.matchStatus)} {event.matchMinute != null ? `- ${event.matchMinute}'` : ''} | {formatScore(event.homeScore, event.awayScore)}</p>
                      </div>
                      <div className="adminActions">
                        <button
                          type="button"
                          className="authSecondaryBtn"
                          onClick={() => {
                            setModeratorEditEventId(event.id);
                            setModeratorForm(mapEventToModeratorForm(event));
                            setIsModeratorEditorOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="authSecondaryBtn" onClick={() => void syncTimerForEvent(event)} disabled={moderatorBusy}>
                          Sync timer
                        </button>
                        <button type="button" className="logoutBtn" onClick={() => void removeModeratorEvent(event.id)} disabled={moderatorBusy}>
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {isModeratorEditorOpen && (
                  <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={moderatorEditEventId ? 'Edit event' : 'Add event'}>
                    <div className="modalCard moderatorModalCard">
                      <div className="modalHeader">
                        <h3>{moderatorEditEventId ? 'Edit event' : 'Add event'}</h3>
                        <button
                          type="button"
                          className="modalCloseBtn"
                          onClick={() => {
                            setIsModeratorEditorOpen(false);
                            setModeratorForm(createEmptyModeratorForm());
                            setModeratorEditEventId(null);
                          }}
                          aria-label="Close event form"
                        >
                          ×
                        </button>
                      </div>
                      <p className="adminFormHint">Use tournament key format like <code>soccer_epl</code> or <code>soccer_uefa_champs_league</code>. Leave minute empty before kickoff/at halftime/fulltime.</p>
                      <div className="adminFormGrid">
                        <label className="adminField">
                          <span>Tournament</span>
                          <input
                            list="moderatorTournamentOptions"
                            value={moderatorForm.sportKey}
                            onChange={(e) => setModeratorForm((prev) => ({ ...prev, sportKey: e.target.value }))}
                            placeholder="soccer_epl"
                          />
                          <datalist id="moderatorTournamentOptions">
                            {MODERATOR_TOURNAMENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value} label={option.label} />
                            ))}
                          </datalist>
                        </label>
                        <label className="adminField">
                          <span>Home team</span>
                          <input value={moderatorForm.homeTeam} onChange={(e) => setModeratorForm((prev) => ({ ...prev, homeTeam: e.target.value }))} placeholder="Home team" />
                        </label>
                        <label className="adminField">
                          <span>Away team</span>
                          <input value={moderatorForm.awayTeam} onChange={(e) => setModeratorForm((prev) => ({ ...prev, awayTeam: e.target.value }))} placeholder="Away team" />
                        </label>
                        <label className="adminField">
                          <span>Start time</span>
                          <input type="datetime-local" value={toDateTimeLocalValue(moderatorForm.eventDate)} onChange={(e) => setModeratorForm((prev) => ({ ...prev, eventDate: fromDateTimeLocalValue(e.target.value) }))} />
                        </label>
                        <label className="adminField">
                          <span>Match phase</span>
                          <select value={moderatorForm.matchStatus ?? 'NS'} onChange={(e) => setModeratorForm((prev) => ({ ...prev, matchStatus: e.target.value }))}>
                            {MATCH_PHASE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="adminField">
                          <span>Minute</span>
                          <input type="number" min={0} value={moderatorForm.matchMinute ?? ''} onChange={(e) => setModeratorForm((prev) => ({ ...prev, matchMinute: parseNumberOrNull(e.target.value) }))} placeholder="Minute" />
                        </label>
                        <label className="adminField">
                          <span>Home score</span>
                          <input type="number" min={0} value={moderatorForm.homeScore ?? ''} onChange={(e) => setModeratorForm((prev) => ({ ...prev, homeScore: parseNumberOrNull(e.target.value) }))} placeholder="Home score" />
                        </label>
                        <label className="adminField">
                          <span>Away score</span>
                          <input type="number" min={0} value={moderatorForm.awayScore ?? ''} onChange={(e) => setModeratorForm((prev) => ({ ...prev, awayScore: parseNumberOrNull(e.target.value) }))} placeholder="Away score" />
                        </label>
                        <label className="adminField">
                          <span>Home odds</span>
                          <input type="number" min={1} step="0.01" value={moderatorForm.homeWinOdds} onChange={(e) => setModeratorForm((prev) => ({ ...prev, homeWinOdds: Number(e.target.value) || 1 }))} placeholder="1.80" />
                        </label>
                        <label className="adminField">
                          <span>Draw odds</span>
                          <input type="number" min={1} step="0.01" value={moderatorForm.drawOdds} onChange={(e) => setModeratorForm((prev) => ({ ...prev, drawOdds: Number(e.target.value) || 1 }))} placeholder="3.20" />
                        </label>
                        <label className="adminField">
                          <span>Away odds</span>
                          <input type="number" min={1} step="0.01" value={moderatorForm.awayWinOdds} onChange={(e) => setModeratorForm((prev) => ({ ...prev, awayWinOdds: Number(e.target.value) || 1 }))} placeholder="2.10" />
                        </label>
                      </div>
                      <div className="adminActions">
                        <button type="button" className="authSubmit" onClick={() => void submitModeratorEvent()} disabled={moderatorBusy}>
                          {moderatorBusy ? 'Saving…' : moderatorEditEventId ? 'Update event' : 'Add event'}
                        </button>
                        <button
                          type="button"
                          className="authSecondaryBtn"
                          onClick={() => {
                            setIsModeratorEditorOpen(false);
                            setModeratorForm(createEmptyModeratorForm());
                            setModeratorEditEventId(null);
                          }}
                          disabled={moderatorBusy}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeScreen === 'admin' && isAdmin && (
              <section className="adminPanel">
                <header className="adminPanelHeader">
                  <div>
                    <h2>Administrator workspace</h2>
                    <p>Manage verification requests and moderator roles.</p>
                  </div>
                  <button type="button" className="authSecondaryBtn" onClick={() => void Promise.all([loadAdminRequests(), loadAdminUsers()])} disabled={adminBusy}>
                    Refresh
                  </button>
                </header>
                <div className="adminSectionTabs">
                  <button
                    type="button"
                    className={adminSection === 'verifications' ? 'authSubmit adminTabBtn' : 'authSecondaryBtn adminTabBtn'}
                    onClick={() => setAdminSection('verifications')}
                  >
                    Verification requests
                  </button>
                  <button
                    type="button"
                    className={adminSection === 'roles' ? 'authSubmit adminTabBtn' : 'authSecondaryBtn adminTabBtn'}
                    onClick={() => setAdminSection('roles')}
                  >
                    Assign moderator role
                  </button>
                </div>

                {adminSection === 'roles' && (
                  <div className="adminEditorCard">
                    <h3>Assign moderator role</h3>
                    <div className="adminList">
                      {adminUsers
                        .filter((user) => user.role !== 'Admin')
                        .map((user) => (
                          <article className="adminItemCard adminItemCard--compact" key={user.id}>
                            <div>
                              <strong>{user.firstName} {user.lastName}</strong>
                              <p>{user.email}</p>
                              <p>Current role: {user.role}</p>
                            </div>
                            <div className="adminActions">
                              {user.role === 'Moderator' ? (
                                <button
                                  type="button"
                                  className="authSecondaryBtn"
                                  onClick={() => void updateUserRole(user.id, 'User')}
                                  disabled={adminBusy}
                                >
                                  Set User
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="authSubmit"
                                  onClick={() => void updateUserRole(user.id, 'Moderator')}
                                  disabled={adminBusy}
                                >
                                  Set Moderator
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                    </div>
                  </div>
                )}

                {adminSection === 'verifications' && (
                  <>
                    {adminBusy && adminRequests.length === 0 ? <div className="loadingStateCard"><span className="loadingSpinner" aria-hidden="true" /><strong>Loading requests...</strong></div> : null}
                    <div className="adminList">
                      {adminRequests.length === 0 && !adminBusy ? <div className="historyEmptyState">No pending requests.</div> : null}
                      {adminRequests.map((request) => (
                        <article className="adminItemCard adminDocCard" key={request.id}>
                          <div className="adminDocInfo">
                            <strong>{request.userFirstName ?? 'User'} {request.userLastName ?? ''}</strong>
                            <p>{request.userEmail ?? request.userId}</p>
                            <p>Requested: {new Date(request.createdAt).toLocaleString()}</p>
                          </div>
                          <div className="adminDocMediaWrap">
                            {adminDocumentPreviews[request.id] ? (
                              <img src={adminDocumentPreviews[request.id]} alt="Document preview" className="adminDocPreview" loading="lazy" />
                            ) : (
                              <p className="adminDocPreviewPlaceholder">Preview will appear when document is loaded.</p>
                            )}
                          </div>
                          <div className="adminActions adminActionsColumn">
                            <button type="button" className="authSecondaryBtn" onClick={() => void openAdminDocument(request.id)}>
                              Open document
                            </button>
                            <button type="button" className="authSubmit" onClick={() => void processVerificationRequest(request.id, 'approve')} disabled={adminBusy}>
                              Approve
                            </button>
                            <button type="button" className="logoutBtn dangerBtn" onClick={() => void processVerificationRequest(request.id, 'reject')} disabled={adminBusy}>
                              Reject
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {activeScreen === 'esports' && (
              <div className="gridCards">
                {['Counter-Strike 2', 'Dota 2', 'League of Legends', 'Valorant'].map((title) => (
                  <article key={title} className="sportCard">
                    <h3>{title}</h3>
                    <p>{Math.floor(Math.random() * 60) + 20} matches</p>
                    <small>{Math.floor(Math.random() * 15) + 1} LIVE</small>
                  </article>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>
      {isBetSlipOpen && (
        <div className="betSlipOverlay" role="presentation" onClick={() => setIsBetSlipOpen(false)}>
          <aside className="betSlipDrawer" onClick={(e) => e.stopPropagation()}>
            <div className="betSlipDrawerHeader">
              <h3 className="betSlipTitle">Bet slip {slipLegs.length > 0 ? `(${slipLegs.length})` : ''}</h3>
              <button type="button" className="betSlipCloseBtn" onClick={() => setIsBetSlipOpen(false)} aria-label="Close bet slip">
                ✕
              </button>
            </div>
            {renderBetSlipContent()}
          </aside>
        </div>
      )}
      {isTopUpOpen && (
        <div className="modalOverlay" role="presentation" onClick={() => setIsTopUpOpen(false)}>
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Top up balance" onClick={(e) => e.stopPropagation()}>
            <header className="modalHeader">
              <h3>Top up balance</h3>
              <button type="button" className="modalCloseBtn" onClick={() => setIsTopUpOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <label className="modalField">
              Amount ($)
              <input value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} inputMode="decimal" autoFocus />
            </label>
            {topUpError && <p className="modalError">{topUpError}</p>}
            <div className="modalActions">
              <button type="button" className="depositBtn" onClick={() => void submitTopUp()} disabled={topUpBusy}>
                {topUpBusy ? 'Processing…' : 'Confirm top up'}
              </button>
              <button type="button" className="authSecondaryBtn" onClick={() => setIsTopUpOpen(false)} disabled={topUpBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {isWithdrawOpen && (
        <div className="modalOverlay" role="presentation" onClick={() => setIsWithdrawOpen(false)}>
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Withdraw balance" onClick={(e) => e.stopPropagation()}>
            <header className="modalHeader">
              <h3>Withdraw balance</h3>
              <button type="button" className="modalCloseBtn" onClick={() => setIsWithdrawOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <label className="modalField">
              Amount ($)
              <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} inputMode="decimal" autoFocus />
            </label>
            {withdrawError && <p className="modalError">{withdrawError}</p>}
            <div className="modalActions">
              <button type="button" className="walletActionBtn" onClick={() => void submitWithdraw()} disabled={withdrawBusy}>
                {withdrawBusy ? 'Processing…' : 'Confirm withdraw'}
              </button>
              <button type="button" className="authSecondaryBtn" onClick={() => setIsWithdrawOpen(false)} disabled={withdrawBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {adminDocumentModal && (
        <div
          className="modalOverlay"
          role="presentation"
          onClick={() => {
            URL.revokeObjectURL(adminDocumentModal.url);
            setAdminDocumentModal(null);
          }}
        >
          <div className="modalCard adminDocumentModalCard" role="dialog" aria-modal="true" aria-label="Document preview" onClick={(e) => e.stopPropagation()}>
            <header className="modalHeader">
              <h3>Document preview</h3>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={() => {
                  URL.revokeObjectURL(adminDocumentModal.url);
                  setAdminDocumentModal(null);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            {adminDocumentModal.isImage ? (
              <img src={adminDocumentModal.url} alt="Full document preview" className="adminDocumentModalImage" />
            ) : (
              <div className="adminDocumentModalFallback">
                <p>This document is not an image preview.</p>
                <a href={adminDocumentModal.url} target="_blank" rel="noreferrer">Open file in a new tab</a>
              </div>
            )}
          </div>
        </div>
      )}
      {isChangingPassword && (
        <div
          className="modalOverlay"
          role="presentation"
          onClick={() => {
            setIsChangingPassword(false);
            setProfileCurrentPassword('');
            setProfileNewPassword('');
          }}
        >
          <div
            className="modalCard"
            role="dialog"
            aria-modal="true"
            aria-label="Change password"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modalHeader">
              <h3>Change password</h3>
              <button
                type="button"
                className="modalCloseBtn"
                onClick={() => {
                  setIsChangingPassword(false);
                  setProfileCurrentPassword('');
                  setProfileNewPassword('');
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <div className="profileGrid">
              <label>
                Current password
                <div className="passwordField">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={profileCurrentPassword}
                    onChange={(e) => setProfileCurrentPassword(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="passwordToggleBtn"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  >
                    <EyeIcon open={showCurrentPassword} />
                  </button>
                </div>
              </label>
              <label>
                New password
                <div className="passwordField">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={profileNewPassword}
                    onChange={(e) => setProfileNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="passwordToggleBtn"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  >
                    <EyeIcon open={showNewPassword} />
                  </button>
                </div>
              </label>
            </div>
            <div className="modalActions">
              <button type="button" className="depositBtn" onClick={() => void changePassword()}>
                Save new password
              </button>
              <button
                type="button"
                className="authSecondaryBtn"
                onClick={() => {
                  setIsChangingPassword(false);
                  setProfileCurrentPassword('');
                  setProfileNewPassword('');
                }}
              >
                Cancel
              </button>
            </div>
            {profileError && <p className="modalError">{profileError}</p>}
          </div>
        </div>
      )}
      {isDocVerifyModalOpen && (
        <div className="modalOverlay" role="presentation" onClick={() => setIsDocVerifyModalOpen(false)}>
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Verify documents" onClick={(e) => e.stopPropagation()}>
            <header className="modalHeader">
              <h3>Document verification required</h3>
              <button type="button" className="modalCloseBtn" onClick={() => setIsDocVerifyModalOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <p className="authHint">{docVerifyPrompt}</p>
            <label>
              ID document (photo)
              <label
                className={isVerifyDragOver ? 'verifyUploadCard dragOver' : 'verifyUploadCard'}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsVerifyDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsVerifyDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files?.[0] ?? null;
                  setVerificationFile(dropped);
                }}
              >
                <input
                  ref={verifyUploadInputRef}
                  className="verifyUploadInput"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setVerificationFile(e.target.files?.[0] ?? null)}
                />
                {verificationPreviewUrl ? (
                  <img src={verificationPreviewUrl} alt="Selected document preview" className="verifyUploadPreview" />
                ) : (
                  <span className="verifyUploadIcon" aria-hidden="true" />
                )}
                <strong>{verificationDocument ? verificationDocument.name : 'Tap or drop document here'}</strong>
                <small>{verificationDocument ? 'File selected' : 'PNG, JPG or PDF'}</small>
              </label>
            </label>
            <div className="modalActions">
              <button type="button" className="depositBtn" onClick={() => void submitAgeVerification()} disabled={verificationBusy}>
                {verificationBusy ? 'Verifying…' : 'Verify now'}
              </button>
              <button type="button" className="authSecondaryBtn" onClick={() => void skipAgeVerification()} disabled={verificationBusy}>
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}
      {verificationDecision && (
        <div className="modalOverlay" role="presentation">
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Verification status update" onClick={(e) => e.stopPropagation()}>
            <header className="modalHeader">
              <h3>Verification update</h3>
            </header>
            <p className="authHint">{verificationDecision.message}</p>
            <div className="modalActions">
              {verificationDecision.action === 'dashboard' ? (
                <button
                  type="button"
                  className="depositBtn"
                  onClick={() => {
                    setVerificationDecision(null);
                    setActiveScreen('dashboard');
                    void loadProfile();
                  }}
                >
                  Go to dashboard
                </button>
              ) : (
                <button
                  type="button"
                  className="depositBtn"
                  onClick={() => {
                    setVerificationDecision(null);
                    logout();
                  }}
                >
                  Go to start screen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {(profileMessage || moderatorMessage || adminMessage || betPlacementMessage) && (
        <div className="toastStack">
          {profileMessage && <div className="profileToast">{profileMessage}</div>}
          {moderatorMessage && <div className="profileToast moderatorToast">{moderatorMessage}</div>}
          {adminMessage && <div className="profileToast adminToast">{adminMessage}</div>}
          {betPlacementMessage && <div className="profileToast betToast">{betPlacementMessage}</div>}
        </div>
      )}
    </div>
  );
}

function mergeEvents(previous: SportEventDto[], incoming: SportEventDto[]): SportEventDto[] {
  const byId = new Map(previous.map((ev) => [ev.externalId, ev]));
  for (const item of incoming) {
    const existing = byId.get(item.externalId);
    byId.set(item.externalId, {
      ...existing,
      ...item,
      homeTeamLogoUrl: item.homeTeamLogoUrl ?? existing?.homeTeamLogoUrl ?? null,
      awayTeamLogoUrl: item.awayTeamLogoUrl ?? existing?.awayTeamLogoUrl ?? null,
    });
  }

  return Array.from(byId.values());
}

function mergeMatchPayload(
  previous: SportEventDto[],
  incoming: SportEventDto[],
): { merged: SportEventDto[]; flashes: Array<{ id: string; kind: 'goal' | 'event' }> } {
  const beforeById = new Map(previous.map((e) => [e.externalId, e]));
  const merged = mergeEvents(previous, incoming);
  const flashes: Array<{ id: string; kind: 'goal' | 'event' }> = [];

  for (const inc of incoming) {
    const old = beforeById.get(inc.externalId);
    if (!old) {
      continue;
    }

    if ((old.homeScore ?? 0) !== (inc.homeScore ?? 0) || (old.awayScore ?? 0) !== (inc.awayScore ?? 0)) {
      flashes.push({ id: inc.externalId, kind: 'goal' });
    } else if (old.matchStatus !== inc.matchStatus) {
      flashes.push({ id: inc.externalId, kind: 'event' });
    }
  }

  return { merged, flashes };
}

function mapBetStatus(value: string | number): BetDto['status'] {
  if (typeof value === 'number' && value >= 0 && value <= 3) {
    return value as BetDto['status'];
  }

  const v = String(value);
  if (v === 'Won') return 1;
  if (v === 'Lost') return 2;
  if (v === 'Refunded' || v === 'Void') return 3;
  return 0;
}

function normalizeBetDto(raw: BetDto): BetDto {
  const legs: BetLegDto[] = (raw.legs ?? []).map((l) => ({
    eventExternalId: String(l.eventExternalId),
    homeTeam: l.homeTeam,
    awayTeam: l.awayTeam,
    selection: Number(l.selection) as BetSelection,
    lockedOdds: Number(l.lockedOdds),
  }));

  const st = raw.status;
  const status: BetDto['status'] =
    typeof st === 'number' && st >= 0 && st <= 3 ? st : mapBetStatus(String(st));

  return {
    ...raw,
    id: String(raw.id),
    stake: Number(raw.stake),
    combinedOdds: Number(raw.combinedOdds),
    potentialPayout: Number(raw.potentialPayout),
    settledPayout: raw.settledPayout != null ? Number(raw.settledPayout) : raw.settledPayout,
    status,
    legs,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : String(raw.createdAt),
    settledAt: raw.settledAt != null ? String(raw.settledAt) : raw.settledAt,
  };
}

function formatBetLegSelection(leg: BetLegDto): string {
  if (leg.selection === 0) return `Pick: ${leg.homeTeam} (1)`;
  if (leg.selection === 1) return 'Pick: Draw (X)';
  return `Pick: ${leg.awayTeam} (2)`;
}

function mapStatusLabel(status: BetDto['status']): string {
  if (status === 1) return 'Won';
  if (status === 2) return 'Lost';
  if (status === 3) return 'Refunded';
  return 'Pending';
}

function calcWinRate(bets: BetDto[]): string {
  if (bets.length === 0) return '0.0';
  const won = bets.filter((b) => b.status === 1).length;
  return ((won / bets.length) * 100).toFixed(1);
}

function calcTotalVolume(bets: BetDto[]): string {
  return bets.reduce((acc, b) => acc + b.stake, 0).toFixed(2);
}

function createEmptyModeratorForm(): ManageSportEventRequest {
  return {
    homeTeam: '',
    awayTeam: '',
    eventDate: new Date().toISOString(),
    sportKey: 'soccer',
    homeWinOdds: 1.8,
    drawOdds: 3.2,
    awayWinOdds: 2.1,
    homeScore: null,
    awayScore: null,
    matchStatus: 'NS',
    matchMinute: null,
  };
}

const MODERATOR_TOURNAMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'soccer_epl', label: 'English Premier League' },
  { value: 'soccer_uefa_champs_league', label: 'UEFA Champions League' },
  { value: 'soccer_spain_la_liga', label: 'Spain La Liga' },
  { value: 'soccer_italy_serie_a', label: 'Italy Serie A' },
  { value: 'soccer_germany_bundesliga', label: 'Germany Bundesliga' },
  { value: 'soccer_france_ligue_one', label: 'France Ligue 1' },
  { value: 'basketball_nba', label: 'NBA' },
  { value: 'tennis_atp', label: 'ATP Tour' },
];

const MATCH_PHASE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'NS', label: 'Not started' },
  { value: '1H', label: 'First half' },
  { value: 'HT', label: 'Halftime' },
  { value: '2H', label: 'Second half' },
  { value: 'FT', label: 'Finished' },
];

function parseNumberOrNull(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(localValue: string): string {
  if (!localValue) {
    return new Date().toISOString();
  }
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toDateInputValue(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function mapEventToModeratorForm(event: SportEventDto): ManageSportEventRequest {
  return {
    externalId: event.externalId,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    eventDate: event.eventDate,
    sportKey: event.sportKey,
    homeWinOdds: event.homeWinOdds,
    drawOdds: event.drawOdds,
    awayWinOdds: event.awayWinOdds,
    homeScore: event.homeScore ?? null,
    awayScore: event.awayScore ?? null,
    matchStatus: event.matchStatus ?? 'NS',
    matchMinute: event.matchMinute ?? null,
  };
}

function buildSyncedModeratorPayload(event: SportEventDto): ManageSportEventRequest {
  const payload = mapEventToModeratorForm(event);
  const eventStart = new Date(event.eventDate).getTime();
  const now = Date.now();
  if (Number.isNaN(eventStart) || now < eventStart) {
    payload.matchStatus = 'NS';
    payload.matchMinute = null;
    return payload;
  }

  const elapsedMinutes = Math.max(0, Math.floor((now - eventStart) / 60000));
  if (elapsedMinutes < 45) {
    payload.matchStatus = '1H';
    payload.matchMinute = elapsedMinutes;
  } else if (elapsedMinutes < 60) {
    payload.matchStatus = 'HT';
    payload.matchMinute = 45;
  } else if (elapsedMinutes < 105) {
    payload.matchStatus = '2H';
    payload.matchMinute = Math.min(90, elapsedMinutes - 15);
  } else {
    payload.matchStatus = 'FT';
    payload.matchMinute = 90;
  }

  return payload;
}

function parseToken(token: string | null): { fullName: string; initials: string; role: string } {
  if (!token) {
    return { fullName: 'Guest User', initials: 'GU', role: 'Guest' };
  }

  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, string>;
    const firstName = decoded.given_name ?? decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ?? 'John';
    const lastName = decoded.family_name ?? decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] ?? 'Doe';
    const role = decoded.role ?? decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? 'User';
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    return { fullName: `${firstName} ${lastName}`, initials, role };
  } catch {
    return { fullName: 'John Doe', initials: 'JD', role: 'User' };
  }
}

function buildTeamFallbackLogo(name: string): string {
  const normalized = (name || 'Team').trim();
  const initials = normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'TM';

  const palette = [
    ['#1D2B52', '#26396C'],
    ['#1E3A8A', '#1D4ED8'],
    ['#14532D', '#15803D'],
    ['#5B21B6', '#7C3AED'],
    ['#7F1D1D', '#B91C1C'],
    ['#0F766E', '#0D9488'],
  ];
  const hash = Array.from(normalized.toLowerCase()).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [bgStart, bgEnd] = palette[hash % palette.length];
  const safeTitle = escapeXml(normalized);
  const safeInitials = escapeXml(initials);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${bgStart}"/>
      <stop offset="100%" stop-color="${bgEnd}"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="48" fill="url(#g)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="34" font-weight="700" fill="#FFFFFF">${safeInitials}</text>
</svg>`.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveTeamLogoSrc(logoUrl: string | null | undefined, teamName: string): string {
  const trimmed = logoUrl?.trim();
  if (trimmed) {
    if (trimmed.startsWith('/api/') && API_ORIGIN) {
      return `${API_ORIGIN}${trimmed}`;
    }
    return trimmed;
  }
  return buildTeamFallbackLogo(teamName);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isLiveMatchStatus(status: string | null | undefined): boolean {
  const normalized = normalizeMatchStatus(status);

  if (!normalized) {
    return false;
  }

  if (isFinishedMatchStatus(status)) {
    return false;
  }

  const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'INPLAY', 'PLAYING']);
  if (liveStatuses.has(normalized)) {
    return true;
  }

  return normalized.includes('LIVE') || normalized.includes('PLAY');
}

function prioritizeFootballEvents(source: SportEventDto[], upcomingHours: number): SportEventDto[] {
  const now = Date.now();
  const upcomingWindowMs = upcomingHours * 60 * 60 * 1000;
  const recentLiveFallbackMs = 4 * 60 * 60 * 1000;

  const filtered = source
    .filter((e) => e.sportKey.toLowerCase().includes('soccer'))
    .filter((e) => {
      const eventTime = new Date(e.eventDate).getTime();
      const isLive = isLiveMatchStatus(e.matchStatus);
      const isRecentPotentialLive =
        !isFinishedMatchStatus(e.matchStatus) &&
        eventTime <= now &&
        eventTime >= now - recentLiveFallbackMs;
      return isLive || isRecentPotentialLive || (eventTime >= now && eventTime <= now + upcomingWindowMs);
    });

  return filtered.sort((a, b) => {
    const aLive = isLiveMatchStatus(a.matchStatus) || isRecentPotentialLiveByTime(a.eventDate, a.matchStatus);
    const bLive = isLiveMatchStatus(b.matchStatus) || isRecentPotentialLiveByTime(b.eventDate, b.matchStatus);
    if (aLive !== bLive) {
      return aLive ? -1 : 1;
    }

    return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
  });
}

function isRecentPotentialLiveByTime(eventDate: string, status: string | null | undefined): boolean {
  if (isFinishedMatchStatus(status)) {
    return false;
  }

  const now = Date.now();
  const eventTime = new Date(eventDate).getTime();
  const recentLiveFallbackMs = 4 * 60 * 60 * 1000;
  return eventTime <= now && eventTime >= now - recentLiveFallbackMs;
}

function isLiveOrInProgress(eventDate: string, status: string | null | undefined): boolean {
  return isLiveMatchStatus(status) || isRecentPotentialLiveByTime(eventDate, status);
}

function formatMatchPhaseLabel(status: string | null | undefined): string {
  const normalized = normalizeMatchStatus(status);
  if (normalized === '1H') return '1st half';
  if (normalized === 'HT') return 'Halftime';
  if (normalized === '2H') return '2nd half';
  if (normalized === 'ET') return 'Extra time';
  if (normalized === 'P') return 'Penalties';
  if (normalized === 'FT') return 'Finished';
  if (normalized === 'NS') return 'Not started';
  return normalized || 'Live';
}

function formatDashboardPhaseLabel(event: SportEventDto): string {
  const normalized = normalizeMatchStatus(event.matchStatus);
  if (normalized === 'NS' || normalized === 'NOTSTARTED') {
    const startAt = new Date(event.eventDate);
    if (!Number.isNaN(startAt.getTime())) {
      return startAt.toLocaleString([], {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  return formatMatchPhaseLabel(event.matchStatus);
}

function normalizeDocumentBlob(blob: Blob, originalUrl: string | undefined): Blob {
  if (blob.type && blob.type !== 'application/octet-stream') {
    return blob;
  }

  const guessed = guessMimeFromUrl(originalUrl);
  if (!guessed) {
    return blob;
  }

  return new Blob([blob], { type: guessed });
}

function guessMimeFromUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  const normalized = url.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  return null;
}

function formatWelcomeMatchMeta(event: SportEventDto): string {
  if (isLiveOrInProgress(event.eventDate, event.matchStatus)) {
    return 'LIVE';
  }

  if (isFinishedMatchStatus(event.matchStatus)) {
    if (event.homeScore != null && event.awayScore != null) {
      return `FT ${event.homeScore}:${event.awayScore}`;
    }

    return 'Finished';
  }

  const eventTime = new Date(event.eventDate);
  if (Number.isNaN(eventTime.getTime())) {
    return 'Soon';
  }

  return eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMatchClock(event: SportEventDto, nowMs: number): string {
  const normalizedStatus = normalizeMatchStatus(event.matchStatus);
  if (normalizedStatus === 'HT') {
    return '';
  }
  if (normalizedStatus === 'NS') {
    const startTime = new Date(event.eventDate);
    if (!Number.isNaN(startTime.getTime())) {
      return startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return '--:--';
  }

  if (!isLiveOrInProgress(event.eventDate, event.matchStatus) || event.matchMinute == null) {
    if (normalizedStatus === '1H') {
      return '0:00';
    }
    if (normalizedStatus === '2H') {
      return '45:00';
    }
    return '--:--';
  }

  let baseMinute = Math.max(0, event.matchMinute);
  if (normalizedStatus === '1H') {
    baseMinute = Math.max(0, baseMinute);
  } else if (normalizedStatus === '2H') {
    baseMinute = Math.max(45, baseMinute);
  }
  const baseTimeMs = new Date(event.lastUpdated).getTime();
  if (Number.isNaN(baseTimeMs)) {
    return `${baseMinute}:00`;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - baseTimeMs) / 1000));
  const totalSeconds = (baseMinute * 60) + elapsedSeconds;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatScore(homeScore: number | null | undefined, awayScore: number | null | undefined): string {
  if (homeScore == null || awayScore == null) {
    return '-- : --';
  }

  return `${homeScore} : ${awayScore}`;
}

function isFinishedMatchStatus(status: string | null | undefined): boolean {
  const normalized = normalizeMatchStatus(status);

  if (!normalized) {
    return false;
  }

  const finishedStatuses = new Set([
    'FT', 'AET', 'PEN', 'CANC', 'PST', 'POSTPONED', 'FINISHED', 'ENDED', 'ABD', 'AWD', 'WO',
  ]);
  return finishedStatuses.has(normalized) || normalized.startsWith('FT');
}

function normalizeMatchStatus(status: string | null | undefined): string {
  return (status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/_/g, '');
}

function mapSportTitle(sportKey: string): string {
  const key = sportKey.toLowerCase();
  if (key.includes('soccer')) return 'Football';
  if (key.includes('basketball')) return 'Basketball';
  if (key.includes('tennis')) return 'Tennis';
  if (key.includes('hockey')) return 'Ice Hockey';
  if (key.includes('baseball')) return 'Baseball';
  if (key.includes('volleyball')) return 'Volleyball';
  if (key.includes('americanfootball') || key.includes('nfl')) return 'American Football';
  if (key.includes('cricket')) return 'Cricket';
  return 'Other';
}

function buildSportCards(source: SportEventDto[]): Array<{ title: string; total: number; live: number }> {
  if (source.length === 0) {
    return [{ title: 'Football', total: 0, live: 0 }];
  }

  const buckets = new Map<string, { total: number; live: number }>();
  for (const event of source) {
    const title = mapSportTitle(event.sportKey);
    const current = buckets.get(title) ?? { total: 0, live: 0 };
    current.total += 1;
    if (isLiveOrInProgress(event.eventDate, event.matchStatus)) {
      current.live += 1;
    }

    buckets.set(title, current);
  }

  return Array.from(buckets.entries())
    .map(([title, values]) => ({ title, total: values.total, live: values.live }))
    .sort((a, b) => b.total - a.total);
}

type SidebarIconName = 'logo' | 'dashboard' | 'sports' | 'tournaments' | 'wallet' | 'profile' | 'history' | 'moderator' | 'admin' | 'slip';

function SidebarIcon({ name }: { name: SidebarIconName }) {
  if (name === 'logo') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  if (name === 'dashboard') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5L12 5l8 6.5" />
        <path d="M6.5 10.5V19h11v-8.5" />
        <path d="M10 19v-4h4v4" />
      </svg>
    );
  }

  if (name === 'sports') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5.5h10v3.5a5 5 0 0 1-10 0V5.5z" />
        <path d="M7 7H5.5a2 2 0 0 0 2 2.2" />
        <path d="M17 7h1.5a2 2 0 0 1-2 2.2" />
        <path d="M12 14v3" />
        <path d="M9.5 20h5" />
      </svg>
    );
  }

  if (name === 'tournaments') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9.5h12a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3z" />
        <path d="M9 9.5v-1.5M15 9.5v-1.5" />
        <path d="M9 13.5h0M15 13.5h0" />
      </svg>
    );
  }

  if (name === 'wallet') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8.5h14a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5z" />
        <path d="M4.5 9.5l9-3a1 1 0 0 1 1.3.95V8.5" />
        <circle cx="16" cy="13.2" r="1" />
      </svg>
    );
  }

  if (name === 'profile') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.2" r="3.3" />
        <path d="M5.5 19c.9-3 3.4-4.8 6.5-4.8s5.6 1.8 6.5 4.8" />
      </svg>
    );
  }

  if (name === 'history') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.5v4h4" />
        <path d="M6.8 10a7 7 0 1 0 1.7-3" />
        <path d="M12 8.5v3.7l2.7 1.8" />
      </svg>
    );
  }

  if (name === 'moderator') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.8l7.2 3v5.2c0 4.2-2.6 6.9-7.2 8.4-4.6-1.5-7.2-4.2-7.2-8.4V6.8z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }

  if (name === 'admin') {
    return (
      <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="6" width="15" height="12" rx="2.5" />
        <path d="M8 10h8M8 14h5" />
        <circle cx="16.8" cy="14.2" r="1.2" />
      </svg>
    );
  }

  return (
    <svg className="navIconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="5.5" width="10" height="14" rx="2" />
      <path d="M9 9.5h6M9 12.5h6M9 15.5h4" />
      <path d="M10 4h4" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg className="eyeIconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.2 12c2.2-3.7 5.7-5.6 9.8-5.6S19.6 8.3 21.8 12c-2.2 3.7-5.7 5.6-9.8 5.6S4.4 15.7 2.2 12z" />
      <circle cx="12" cy="12" r="3.2" />
      {!open && <path d="M4 20L20 4" />}
    </svg>
  );
}

async function subscribeToEvent(connection: signalR.HubConnection, externalId: string): Promise<void> {
  if (connection.state !== signalR.HubConnectionState.Connected) {
    return;
  }

  try {
    await connection.invoke('SubscribeEvent', externalId);
  } catch {
    // Connection can temporarily switch state during auto-reconnect.
  }
}

export default App;

type ParsedAuthApiError = {
  generalMessage?: string;
  fieldErrors: Record<string, string>;
};

function parseAuthApiError(
  error: unknown,
  authMode: 'login' | 'register',
): ParsedAuthApiError {
  if (!axios.isAxiosError(error)) {
    return { fieldErrors: {}, generalMessage: 'Authorization failed.' };
  }

  const data = error.response?.data as
    | string
    | { message?: string; title?: string; errors?: Record<string, string[]> }
    | undefined;

  const message =
    (typeof data === 'string' ? data : undefined)
    ?? (typeof data === 'object' && data ? data.message ?? data.title : undefined)
    ?? `Authorization failed (${error.response?.status ?? 'network'})`;

  const fieldErrors: Record<string, string> = {};
  if (typeof data === 'object' && data?.errors) {
    const map: Record<string, 'email' | 'password' | 'firstName' | 'lastName' | 'birthday'> = {
      Email: 'email',
      Password: 'password',
      FirstName: 'firstName',
      LastName: 'lastName',
      Birthday: 'birthday',
      email: 'email',
      password: 'password',
      firstName: 'firstName',
      lastName: 'lastName',
      birthday: 'birthday',
    };

    for (const [key, value] of Object.entries(data.errors)) {
      const target = map[key];
      if (!target || !Array.isArray(value) || value.length === 0) {
        continue;
      }

      fieldErrors[target] = value[0];
    }
  }

  const lower = message.toLowerCase();
  if (authMode === 'login' && (lower.includes('invalid credentials') || lower.includes('password'))) {
    fieldErrors.password ??= 'Invalid email or password.';
  }

  if (authMode === 'register' && lower.includes('already exists')) {
    fieldErrors.email ??= 'User with this email already exists.';
  }

  if (authMode === 'login' && lower.includes('not verified')) {
    fieldErrors.email ??= 'Email is not verified. Please confirm your code.';
  }

  return { fieldErrors, generalMessage: message };
}

type AuthValidationInput = {
  authMode: 'login' | 'register';
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthday: string;
};

function validateAuthFields(input: AuthValidationInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(input.password);
  if (passwordError) errors.password = passwordError;

  if (input.authMode === 'register') {
    const firstNameError = validateName(input.firstName, 'First name');
    if (firstNameError) errors.firstName = firstNameError;

    const lastNameError = validateName(input.lastName, 'Last name');
    if (lastNameError) errors.lastName = lastNameError;

    const birthdayError = validateBirthday(input.birthday);
    if (birthdayError) errors.birthday = birthdayError;
  }

  return errors;
}

function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Email is required.';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return 'Enter a valid email.';
  return '';
}

function validatePassword(value: string): string {
  if (!value) return 'Password is required.';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  return '';
}

function validateName(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) return `${fieldName} is required.`;
  if (trimmed.length < 2) return `${fieldName} must be at least 2 characters.`;
  return '';
}

function validateBirthday(value: string): string {
  if (!value) return 'Birthday is required.';
  const selected = new Date(value);
  if (Number.isNaN(selected.getTime())) return 'Birthday is invalid.';
  const now = new Date();
  if (selected > now) return 'Birthday cannot be in the future.';
  return '';
}

function validateVerificationCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Verification code is required.';
  if (trimmed.length < 4) return 'Verification code is too short.';
  return '';
}
