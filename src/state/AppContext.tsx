import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AdObservation,
  AnalyticsSummary,
  AppSettings,
  BatchRecord,
  CreateBatchResponse,
  LinkRecord,
  LoginResponse,
  Overview,
  PolicyDocument,
  SessionEvent,
  SessionOptions,
  SessionRecord,
  VerifiedMetric,
  WorkerRecord,
} from "../../shared/types";
import { ApiError, api, apiDownload, getToken, setToken, websocketUrl } from "../lib/api";

export type RouteName =
  | "overview"
  | "links"
  | "sessions"
  | "activity"
  | "ads"
  | "infrastructure"
  | "analytics"
  | "settings";

interface HealthInfo {
  status: string;
  version: string;
  uptimeSeconds: number;
  demoMode: boolean;
  authRequired: boolean;
  database: "postgres" | "file";
  browser: { configured: boolean; executable: string | null; headless: boolean };
  features: { workerRegistration: boolean; verifiedAnalyticsImport: boolean; aiProvider: boolean };
}

interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "error" | "warn";
}

interface AnalyticsPayload extends AnalyticsSummary {
  verified: VerifiedMetric[];
}

interface AppContextValue {
  authState: "booting" | "login" | "ready" | "offline";
  bootError: string | null;
  health: HealthInfo | null;
  overview: Overview | null;
  links: LinkRecord[];
  sessions: SessionRecord[];
  workers: WorkerRecord[];
  ads: AdObservation[];
  analytics: AnalyticsPayload | null;
  activity: SessionEvent[];
  settings: AppSettings | null;
  policy: PolicyDocument | null;
  live: boolean;
  loading: boolean;
  route: RouteName;
  toasts: Toast[];
  detailSessionId: string | null;
  sessionEvents: Record<string, SessionEvent[]>;
  notify: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  navigate: (route: RouteName) => void;
  boot: () => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => void;
  refreshAll: () => Promise<void>;
  refreshLinks: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  refreshWorkers: () => Promise<void>;
  refreshAds: () => Promise<void>;
  refreshAnalytics: (days?: number) => Promise<void>;
  refreshOverview: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  submitUrls: (input: string) => Promise<void>;
  importCsv: (csv: string, filename: string) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
  inspectLink: (id: string) => Promise<void>;
  launchBatch: (linkId: string, count: number, options: SessionOptions, start: boolean) => Promise<void>;
  sessionAction: (id: string, action: "start" | "pause" | "resume" | "stop") => Promise<void>;
  bulkAction: (action: "start" | "pause" | "resume" | "stop", ids?: string[]) => Promise<void>;
  openSession: (id: string | null) => Promise<void>;
  loadSessionEvents: (id: string) => Promise<void>;
  saveAiSettings: (payload: Record<string, unknown>) => Promise<void>;
  exportCsv: (type: "sessions" | "links" | "ads" | "verified") => Promise<void>;
  analyticsDays: number;
  setAnalyticsDays: (days: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [next, ...items];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

function upsertSession(items: SessionRecord[], next: SessionRecord): SessionRecord[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [next, ...items];
  const copy = [...items];
  copy[index] = { ...copy[index], ...next };
  return copy;
}

function readRoute(): RouteName {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const allowed: RouteName[] = ["overview", "links", "sessions", "activity", "ads", "infrastructure", "analytics", "settings"];
  return (allowed.includes(raw as RouteName) ? raw : "overview") as RouteName;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AppContextValue["authState"]>("booting");
  const [bootError, setBootError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [ads, setAds] = useState<AdObservation[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [activity, setActivity] = useState<SessionEvent[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [policy, setPolicy] = useState<PolicyDocument | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteName>(readRoute);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<Record<string, SessionEvent[]>>({});
  const [analyticsDays, setAnalyticsDays] = useState(14);
  const analyticsDaysRef = useRef(14);
  const toastTimers = useRef(new Map<string, number>());
  const overviewTimer = useRef<number | null>(null);
  const analyticsTimer = useRef<number | null>(null);

  analyticsDaysRef.current = analyticsDays;

  const notify = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-4), { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimers.current.delete(id);
    }, 4800);
    toastTimers.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.history.replaceState(null, "", "#/overview");
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((next: RouteName) => {
    setRoute(next);
    if (window.location.hash !== `#/${next}`) window.location.hash = `#/${next}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        setAuthState("login");
        return;
      }
      notify(error instanceof Error ? error.message : String(error), "error");
    },
    [notify],
  );

  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/api/overview"));
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const refreshLinks = useCallback(async () => {
    try {
      const response = await api<{ items: LinkRecord[] }>("/api/links?limit=500");
      setLinks(response.items);
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const refreshSessions = useCallback(async () => {
    try {
      const response = await api<{ items: SessionRecord[] }>("/api/sessions?limit=500");
      setSessions(response.items);
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const refreshWorkers = useCallback(async () => {
    try {
      const response = await api<{ items: WorkerRecord[] }>("/api/workers");
      setWorkers(response.items);
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const refreshAds = useCallback(async () => {
    try {
      const response = await api<{ items: AdObservation[] }>("/api/ads?limit=500");
      setAds(response.items);
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const refreshAnalytics = useCallback(
    async (days?: number) => {
      try {
        const range = days ?? analyticsDaysRef.current;
        setAnalytics(await api<AnalyticsPayload>(`/api/analytics?days=${range}`));
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  const refreshActivity = useCallback(async () => {
    try {
      const response = await api<{ items: SessionEvent[] }>("/api/activity?limit=250");
      setActivity(response.items);
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewResponse, linksResponse, sessionsResponse, workersResponse, adsResponse, analyticsResponse, activityResponse, settingsResponse, policyResponse] =
        await Promise.all([
          api<Overview>("/api/overview"),
          api<{ items: LinkRecord[] }>("/api/links?limit=500"),
          api<{ items: SessionRecord[] }>("/api/sessions?limit=500"),
          api<{ items: WorkerRecord[] }>("/api/workers"),
          api<{ items: AdObservation[] }>("/api/ads?limit=500"),
          api<AnalyticsPayload>(`/api/analytics?days=${analyticsDaysRef.current}`),
          api<{ items: SessionEvent[] }>("/api/activity?limit=250"),
          api<AppSettings>("/api/settings"),
          api<PolicyDocument>("/api/policy"),
        ]);
      setOverview(overviewResponse);
      setLinks(linksResponse.items);
      setSessions(sessionsResponse.items);
      setWorkers(workersResponse.items);
      setAds(adsResponse.items);
      setAnalytics(analyticsResponse);
      setActivity(activityResponse.items);
      setSettings(settingsResponse);
      setPolicy(policyResponse);
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const boot = useCallback(async () => {
    setBootError(null);
    try {
      const info = await api<HealthInfo>("/api/health");
      setHealth(info);
      if (info.authRequired && !getToken()) {
        setAuthState("login");
        setLoading(false);
        return;
      }
      await refreshAll();
      setAuthState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthState("login");
        setLoading(false);
        return;
      }
      setAuthState("offline");
      setBootError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }, [refreshAll]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const login = useCallback(
    async (password: string) => {
      const response = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setToken(response.token);
      setAuthState("ready");
      await refreshAll();
      notify("Workspace unlocked", "success");
    },
    [notify, refreshAll],
  );

  const logout = useCallback(() => {
    setToken(null);
    setAuthState("login");
    setSessions([]);
    setLinks([]);
    setOverview(null);
    setAnalytics(null);
  }, []);

  const scheduleOverview = useCallback(() => {
    if (overviewTimer.current) window.clearTimeout(overviewTimer.current);
    overviewTimer.current = window.setTimeout(() => void refreshOverview(), 700);
  }, [refreshOverview]);

  const scheduleAnalytics = useCallback(() => {
    if (analyticsTimer.current) window.clearTimeout(analyticsTimer.current);
    analyticsTimer.current = window.setTimeout(() => void refreshAnalytics(), 900);
  }, [refreshAnalytics]);

  useEffect(() => {
    if (authState !== "ready") return;
    let closed = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(websocketUrl());
      socket.onopen = () => {
        attempt = 0;
        setLive(true);
      };
      socket.onclose = () => {
        setLive(false);
        if (closed) return;
        attempt += 1;
        retryTimer = window.setTimeout(connect, Math.min(12_000, 800 * 2 ** Math.min(attempt, 4)));
      };
      socket.onerror = () => setLive(false);
      socket.onmessage = (message) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(message.data as string) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = payload.type as string;
        if (type === "session.updated") {
          const session = payload.session as SessionRecord;
          setSessions((current) => upsertSession(current, session));
        } else if (type === "session.preview") {
          const sessionId = payload.sessionId as string;
          const dataUrl = payload.dataUrl as string;
          setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, previewDataUrl: dataUrl } : session)));
        } else if (type === "session.event") {
          const event = payload.event as SessionEvent;
          setActivity((current) => {
            if (current.some((item) => item.id === event.id)) return current;
            return [event, ...current].slice(0, 400);
          });
          setSessionEvents((current) => {
            if (!current[event.sessionId]) return current;
            if (current[event.sessionId].some((item) => item.id === event.id)) return current;
            return { ...current, [event.sessionId]: [event, ...current[event.sessionId]].slice(0, 500) };
          });
        } else if (type === "link.updated") {
          setLinks((current) => {
            const updated = upsertById(current, payload.link as LinkRecord);
            return updated.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          });
        } else if (type === "worker.updated") {
          setWorkers((current) => upsertById(current, payload.worker as WorkerRecord));
        } else if (type === "ads.updated") {
          setAds((current) => {
            const ad = payload.ad as AdObservation;
            if (current.some((item) => item.id === ad.id)) return current;
            return [ad, ...current].slice(0, 500);
          });
          scheduleOverview();
          scheduleAnalytics();
        } else if (type === "overview.updated") {
          scheduleOverview();
        } else if (type === "analytics.updated") {
          scheduleAnalytics();
        }
      };
    };

    connect();
    const ping = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
    }, 20_000);
    return () => {
      closed = true;
      setLive(false);
      if (retryTimer) window.clearTimeout(retryTimer);
      window.clearInterval(ping);
      socket?.close();
    };
  }, [authState, scheduleAnalytics, scheduleOverview]);

  useEffect(() => {
    if (authState !== "ready") return;
    const interval = window.setInterval(() => {
      if (!live) {
        void refreshSessions();
        void refreshOverview();
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [authState, live, refreshOverview, refreshSessions]);

  const submitUrls = useCallback(
    async (input: string) => {
      const urls = input
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (urls.length === 0) {
        notify("Paste at least one URL", "warn");
        return;
      }
      try {
        const response = await api<{ links: LinkRecord[]; accepted: number }>("/api/links", {
          method: "POST",
          body: JSON.stringify({ urls, source: "dashboard" }),
        });
        setLinks((current) => {
          const merged = [...response.links, ...current];
          const seen = new Set<string>();
          return merged.filter((link) => {
            if (seen.has(link.id)) return false;
            seen.add(link.id);
            return true;
          });
        });
        notify(`Inspecting ${response.accepted} link${response.accepted === 1 ? "" : "s"}`, "success");
        navigate("links");
        window.setTimeout(() => void refreshLinks(), 3500);
        window.setTimeout(() => void refreshLinks(), 9000);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, navigate, notify, refreshLinks],
  );

  const importCsv = useCallback(
    async (csv: string, filename: string) => {
      try {
        const response = await api<{ links: LinkRecord[]; accepted: number }>("/api/links/import", {
          method: "POST",
          body: JSON.stringify({ kind: "csv", csv, filename }),
        });
        setLinks((current) => [...response.links, ...current]);
        notify(`Imported ${response.accepted} URL${response.accepted === 1 ? "" : "s"} from CSV`, "success");
        navigate("links");
        window.setTimeout(() => void refreshLinks(), 3500);
        window.setTimeout(() => void refreshLinks(), 9000);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, navigate, notify, refreshLinks],
  );

  const deleteLink = useCallback(
    async (id: string) => {
      try {
        await api(`/api/links/${id}`, { method: "DELETE" });
        setLinks((current) => current.filter((link) => link.id !== id));
        notify("Link removed", "success");
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, notify],
  );

  const inspectLink = useCallback(
    async (id: string) => {
      try {
        const response = await api<{ link: LinkRecord }>(`/api/links/${id}/inspect`, { method: "POST" });
        setLinks((current) => upsertById(current, response.link));
        notify("Redirect inspection complete", "success");
        void refreshOverview();
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, notify, refreshOverview],
  );

  const launchBatch = useCallback(
    async (linkId: string, count: number, options: SessionOptions, start: boolean) => {
      try {
        const response = await api<CreateBatchResponse>("/api/batches", {
          method: "POST",
          body: JSON.stringify({ linkId, count, options }),
        });
        setSessions((current) => {
          let next = current;
          for (const session of response.sessions) next = upsertSession(next, session);
          return next;
        });
        navigate("sessions");
        if (start) {
          await api<{ started: number }>("/api/sessions/start-all", {
            method: "POST",
            body: JSON.stringify({ ids: response.sessions.map((session) => session.id) }),
          });
          notify(`${count} session${count === 1 ? "" : "s"} queued and starting`, "success");
        } else {
          notify(`${count} session${count === 1 ? "" : "s"} created in the queue`, "success");
        }
        window.setTimeout(() => {
          void refreshSessions();
          void refreshOverview();
          void refreshWorkers();
        }, 1200);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, navigate, notify, refreshOverview, refreshSessions, refreshWorkers],
  );

  const sessionAction = useCallback(
    async (id: string, action: "start" | "pause" | "resume" | "stop") => {
      try {
        const response = await api<{ session: SessionRecord }>(`/api/sessions/${id}/${action}`, { method: "POST" });
        setSessions((current) => upsertSession(current, response.session));
        notify(`Session ${action} requested`, "success");
        scheduleOverview();
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, notify, scheduleOverview],
  );

  const bulkAction = useCallback(
    async (action: "start" | "pause" | "resume" | "stop", ids?: string[]) => {
      try {
        const result = await api<{ started?: number; affected?: number }>(`/api/sessions/${action}-all`, {
          method: "POST",
          body: JSON.stringify({ ids: ids ?? [] }),
        });
        notify(`${action === "start" ? "Start" : action === "stop" ? "Stop" : action === "pause" ? "Pause" : "Resume"} requested for ${result.started ?? result.affected ?? 0} session(s)`, "success");
        void refreshSessions();
        scheduleOverview();
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, notify, refreshSessions, scheduleOverview],
  );

  const loadSessionEvents = useCallback(
    async (id: string) => {
      try {
        const response = await api<{ items: SessionEvent[] }>(`/api/sessions/${id}/events?limit=500`);
        setSessionEvents((current) => ({ ...current, [id]: response.items }));
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  const openSession = useCallback(
    async (id: string | null) => {
      setDetailSessionId(id);
      if (id) await loadSessionEvents(id);
    },
    [loadSessionEvents],
  );

  const saveAiSettings = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        const next = await api<AppSettings>("/api/settings/ai", { method: "PUT", body: JSON.stringify(payload) });
        setSettings(next);
        notify("AI agent configuration saved", "success");
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, notify],
  );

  const exportCsv = useCallback(
    async (type: "sessions" | "links" | "ads" | "verified") => {
      try {
        await apiDownload(`/api/analytics/export?type=${type}`, `linkpilot-${type}-${new Date().toISOString().slice(0, 10)}.csv`);
        notify(`Exported ${type} CSV`, "success");
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, notify],
  );

  useEffect(
    () => () => {
      for (const timer of toastTimers.current.values()) window.clearTimeout(timer);
      if (overviewTimer.current) window.clearTimeout(overviewTimer.current);
      if (analyticsTimer.current) window.clearTimeout(analyticsTimer.current);
    },
    [],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      authState,
      bootError,
      health,
      overview,
      links,
      sessions,
      workers,
      ads,
      analytics,
      activity,
      settings,
      policy,
      live,
      loading,
      route,
      toasts,
      detailSessionId,
      sessionEvents,
      notify,
      dismissToast,
      navigate,
      boot,
      login,
      logout,
      refreshAll,
      refreshLinks,
      refreshSessions,
      refreshWorkers,
      refreshAds,
      refreshAnalytics,
      refreshOverview,
      refreshActivity,
      submitUrls,
      importCsv,
      deleteLink,
      inspectLink,
      launchBatch,
      sessionAction,
      bulkAction,
      openSession,
      loadSessionEvents,
      saveAiSettings,
      exportCsv,
      analyticsDays,
      setAnalyticsDays,
    }),
    [
      authState,
      bootError,
      health,
      overview,
      links,
      sessions,
      workers,
      ads,
      analytics,
      activity,
      settings,
      policy,
      live,
      loading,
      route,
      toasts,
      detailSessionId,
      sessionEvents,
      notify,
      dismissToast,
      navigate,
      boot,
      login,
      logout,
      refreshAll,
      refreshLinks,
      refreshSessions,
      refreshWorkers,
      refreshAds,
      refreshAnalytics,
      refreshOverview,
      refreshActivity,
      submitUrls,
      importCsv,
      deleteLink,
      inspectLink,
      launchBatch,
      sessionAction,
      bulkAction,
      openSession,
      loadSessionEvents,
      saveAiSettings,
      exportCsv,
      analyticsDays,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
