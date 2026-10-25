import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  API_BASE_URL,
  API_ENDPOINTS,
  CHAOS_CONTROLLER_URL,
  PAYMENT_SERVICE_URL,
  RECOVERY_MONITOR_URL,
} from "../config/api";
import ServiceDependencyMap from "../components/ServiceDependencyMap";
import IncidentTimeline from "../components/IncidentTimeline";
import SyntheticTrafficPanel from "../components/SyntheticTrafficPanel";
import LiveApiTrafficChart from "../components/LiveApiTrafficChart";
import PaymentChaosRecoveryChart from "../components/PaymentChaosRecoveryChart";
import CheckoutRecoveryChart from "../components/CheckoutRecoveryChart";
import LastItemRaceChart from "../components/LastItemRaceChart";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,

} from "recharts";
import {
  BackendCrashCoordinationControls,
  BackendCrashTrafficResult,
} from "../components/BackendCrashCoordination";
import useBackendCrash from "../hooks/useBackendCrash";
import {
  getBackendHealthStatuses,
  getIncidentsFreshness,
} from "../lib/healthStatus";
import {
  derivePaymentHealthState,
  buildPaymentHealthDetail,
} from "../lib/paymentHealthStatus";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Server,
  Workflow,
  Power,
  MonitorCheck,
  Clock3,
  TriangleAlert,
  Zap,
  HeartPulse,
  ShieldCheck,
  Check,
  GitBranch,
  Route,
  ExternalLink,
  WifiOff,
  Info,
  Package,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

function getOfflineStatusClass(status, offlineCheckoutFault) {
  if (
    status === "failure-detected" ||
    status === "failure-injected" ||
    status === "fault-triggered"
  ) {
    return "border-[var(--cc-amber)]/30 bg-[var(--cc-amber)]/10 text-cc-amber";
  }
  if (status === "connection-restored" || status === "data-restored") {
    return "border-[var(--cc-amber)]/30 bg-[var(--cc-amber)]/10 text-cc-amber";
  }
  if (status === "checkout-completed") {
    return "border-[var(--cc-green)]/30 bg-[var(--cc-green)]/10 text-cc-green";
  }
  if (status === "draft-discarded") {
    return "border-[var(--cc-red)]/30 bg-[var(--cc-red)]/10 text-cc-red";
  }
  if (offlineCheckoutFault) {
    return "border-[var(--cc-amber)]/30 bg-[var(--cc-amber)]/10 text-cc-amber";
  }
  return "border-[var(--cc-border)] bg-[var(--cc-surface)] cc-muted";
}

function getOfflineStatusText(status, offlineCheckoutFault) {
  if (
    status === "failure-detected" ||
    status === "failure-injected" ||
    status === "fault-triggered"
  ) {
    return "Offline";
  }
  if (status === "connection-restored" || status === "data-restored") {
    return "Recovering";
  }
  if (status === "checkout-completed") {
    return "Recovered";
  }
  if (status === "draft-discarded") {
    return "Failed";
  }
  if (offlineCheckoutFault) {
    return "Test armed";
  }
  return "Standby";
}

function Dashboard({ page = "overview" }) {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [lastChecked, setLastChecked] = useState(null);
  const [checking, setChecking] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [paymentHealth, setPaymentHealth] = useState(null);
  const [paymentHealthError, setPaymentHealthError] = useState("");
  const [paymentLastSuccessfulCheck, setPaymentLastSuccessfulCheck] = useState(null);
  const [paymentLastFailure, setPaymentLastFailure] = useState(null);
  const [paymentRecoveryAttempts] = useState(null);
  const [showAllRecoveryEvents, setShowAllRecoveryEvents] = useState(false);
  const [paymentRecoveryVerifiedAt] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [incidentsError, setIncidentsError] = useState("");
  const [incidentsUpdatedAt, setIncidentsUpdatedAt] = useState(null);
  const [showAllExperiments, setShowAllExperiments] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [experimentHistory, setExperimentHistory] = useState([]);
  const [experimentStatusError, setExperimentStatusError] = useState("");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [racePreparing, setRacePreparing] = useState(false);
  const [raceRun, setRaceRun] = useState(null);
  const [raceError, setRaceError] = useState("");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineStale, setTimelineStale] = useState(false);
  const [timelineLastUpdated, setTimelineLastUpdated] = useState(null);
  const experimentLockRef = useRef(false);
  const recoveryLoadedRef = useRef(false);
  const [paymentChaosLoading, setPaymentChaosLoading] = useState(false);
  const [paymentChaosMessage, setPaymentChaosMessage] = useState("");
  const [offlineCheckoutFault, setOfflineCheckoutFault] = useState(() => localStorage.getItem("shcomCheckoutTestArmed") === "on");
  const [wifiFailureRunning, setWifiFailureRunning] = useState(false);
  const [injectRecoveryClicked, setInjectRecoveryClicked] = useState(false);
  const [showRaceSections, setShowRaceSections] = useState(false);
  const [checkoutRecoveryEvidence, setCheckoutRecoveryEvidence] = useState(() => {
    try { return JSON.parse(localStorage.getItem("shcomCheckoutRecoveryEvidence") || "null"); }
    catch { return null; }
  });
  const [checkoutDraftMeta, setCheckoutDraftMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"); }
    catch { return null; }
  });
  useEffect(() => {
    const refreshCheckoutEvidence = () => {
      try {
        setCheckoutDraftMeta(JSON.parse(localStorage.getItem("shcomCheckoutDraftMeta") || "null"));
        setOfflineCheckoutFault(localStorage.getItem("shcomCheckoutTestArmed") === "on");
      } catch { /* ignore */ }
    };
    refreshCheckoutEvidence();
    const interval = setInterval(refreshCheckoutEvidence, 1000);
    window.addEventListener("storage", refreshCheckoutEvidence);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", refreshCheckoutEvidence);
    };
  }, []);
  const [paymentRecovery, setPaymentRecovery] = useState({
    running: false,
    startedAt: null,
    resolvedAt: null,
    status: "idle",
    message: "",
    stages: [],
  });
  const {
    chaosRunning,
    chaosResult,
    chaosError,
    chaosResponse,
    coordinationEnabled,
    setCoordinationEnabled,
    trafficRate,
    setTrafficRate,
    trafficConcurrency,
    setTrafficConcurrency,
    trafficLimits,
    runBackendCrash: triggerBackendCrash,
  } = useBackendCrash();
  const runBackendCrash = async () => {
    if (experimentLockRef.current) return;
    experimentLockRef.current = true;
    try {
      await triggerBackendCrash();
    } finally {
      experimentLockRef.current = false;
    }
  };
  const injectPaymentChaos = async () => {
    setPaymentChaosLoading(true);
    setPaymentChaosMessage("");
    setPaymentRecovery({
      running: true,
      startedAt: Date.now(),
      resolvedAt: null,
      status: "verifying",
      message: "Payment chaos armed. Waiting for a checkout to trigger self-heal...",
      stages: [
        { t: Date.now(), status: "armed", message: "Payment chaos armed for the next checkout." },
      ],
    });
    try {
      const response = await fetch(API_ENDPOINTS.paymentTimeout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not activate Payment Chaos.");
      }
      setPaymentChaosMessage(
        "Payment Chaos armed. The next checkout should simulate a lost payment response."
      );
      setPaymentRecovery((prev) => ({
        ...prev,
        stages: [
          ...prev.stages,
          { t: Date.now(), status: "verifying", message: "Chaos armed. Awaiting checkout payment to self-heal." },
        ],
      }));
    } catch (error) {
      setPaymentChaosMessage(error.message);
      setPaymentRecovery((prev) => ({
        ...prev,
        running: false,
        status: "idle",
        message: error.message || "Could not activate Payment Chaos.",
        stages: [
          ...prev.stages,
          { t: Date.now(), status: "error", message: error.message || "Could not activate Payment Chaos." },
        ],
      }));
    } finally {
      setPaymentChaosLoading(false);
    }
  };
  const createLastItemRace = async () => {
    if (experimentLockRef.current) return;
    experimentLockRef.current = true;
    setRacePreparing(true);
    setRaceError("");
    setShowRaceSections(true);
    try {
      const response = await axios.post(API_ENDPOINTS.lastItemRacePrepare);
      const data = response.data || {};
      if (!data.success || !data.run?.runId || !data.product?._id) {
        throw new Error(data.message || "The race-condition test was not prepared.");
      }
      setRaceRun({
        ...data.run,
        product: data.product,
        storefrontPath: data.storefrontPath,
      });
    } catch (error) {
      setRaceError(
        error.response?.data?.message ||
        error.message ||
        "Could not create the race-condition test."
      );
    } finally {
      experimentLockRef.current = false;
      setRacePreparing(false);
    }
  };
  const refreshLastItemRace = useCallback(async (runId) => {
    try {
      const response = await axios.get(API_ENDPOINTS.lastItemRaceStatus(runId));
      const data = response.data || {};
      if (!data.success || !data.run) return;
      setRaceRun((current) => current?.runId === runId
        ? {
          ...current,
          ...data.run,
          product: data.product || current.product,
          storefrontPath: current.storefrontPath || (data.product?._id ? `/user/products/${data.product._id}` : ""),
        }
        : current);
    } catch (error) {
      setRaceError(
        error.response?.data?.message ||
        error.message ||
        "Could not refresh race-condition status."
      );
    }
  }, []);
  useEffect(() => {
    if (!raceRun?.runId) return undefined;
    const refresh = () => refreshLastItemRace(raceRun.runId);
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [raceRun?.runId, refreshLastItemRace]);
  const fetchAdminOrders = async () => {
    setOrdersLoading(true);
    setOrdersError("");
    setOrdersRefreshing(true);
    try {
      const response = await axios.get(API_ENDPOINTS.orders, {
        timeout: 10000,
        validateStatus: (status) => status === 200,
      });
      const data = response.data || {};
      const fetchedOrders = Array.isArray(data) ? data : data.orders || [];
      setOrders(fetchedOrders);
      setOrdersError("");
    } catch (error) {
      setOrdersError(
        error.response?.data?.message ||
        error.message ||
        "Unable to load orders."
      );
    } finally {
      setOrdersLoading(false);
      setOrdersRefreshing(false);
    }
  };
  const checkExperimentStatus = async () => {
    try {
      const historyResponse = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/experiments/history`
      );
      if (!historyResponse.ok) {
        throw new Error("Unable to fetch experiment status.");
      }
      const historyData = await historyResponse.json();
      setExperimentHistory(
        Array.isArray(historyData.experiments)
          ? historyData.experiments
          : []
      );
      setExperimentStatusError("");
    } catch (error) {
      setExperimentStatusError(error.message);
    }
  };
  const checkBackendHealth = async () => {
    setChecking(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/health`,
        {
          timeout: 3000,
          // A degraded backend still answers with a body that describes the
          // failure, for example HTTP 503 with database "disconnected", so the
          // response is inspected instead of being discarded.
          validateStatus: () => true,
        }
      );
      const body =
        response.data && typeof response.data === "object"
          ? response.data
          : null;
      if (response.status === 200 && body?.success === true) {
        setHealth(body);
        setHealthError("");
        return;
      }
      if (body && (body.status || body.database)) {
        // The backend answered but is not fully healthy.
        setHealth(body);
        setHealthError(
          body.database === "disconnected"
            ? "Backend API is degraded: MongoDB is not connected."
            : "Backend API is degraded."
        );
        return;
      }
      setHealth(null);
      setHealthError("Backend API is unavailable.");
    } catch {
      setHealth(null);
      setHealthError("Backend API is unavailable.");
    } finally {
      setLastChecked(new Date().toLocaleTimeString());
      setChecking(false);
    }
  };
  const checkRecoveryMonitor = async () => {
    const isFirstLoad = !recoveryLoadedRef.current;
    try {
      if (isFirstLoad) {
        setTimelineLoading(true);
      }
      const response = await axios.get(`${RECOVERY_MONITOR_URL}/api/recovery`, {
        timeout: 8000,
      });
      if (response.data?.success !== true) {
        throw new Error("Recovery Monitor returned an invalid response.");
      }
      setRecoveryInfo(response.data);
      recoveryLoadedRef.current = true;
      setRecoveryError("");
      setTimelineLastUpdated(new Date().toISOString());
      setTimelineStale(false);
      setTimelineError("");
    } catch (error) {
      console.error(
        "Recovery Monitor request failed:",
        error.message
      );
      setRecoveryError(
        error.code === "ECONNABORTED"
          ? "Recovery Monitor request timed out."
          : error.message === "Network Error"
            ? "Cannot connect to Recovery Monitor on port 5002."
            : error.message || "Recovery Monitor request failed."
      );
      setTimelineError(
        error.code === "ECONNABORTED"
          ? "Recovery monitor request timed out. Timeline data may be stale."
          : "Unable to fetch the live incident timeline right now."
      );
      setTimelineStale(true);
    } finally {
      if (isFirstLoad) {
        setTimelineLoading(false);
      }
    }
  };
  async function checkIncidents() {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/incidents`,
        { timeout: 8000 }
      );
      const incidentList = response.data.incidents || [];
      setIncidents(incidentList);
      setIncidentsUpdatedAt(new Date().toLocaleTimeString());
      setIncidentsError("");

      const recoveryIncident = incidentList
        .filter((i) => i.incidentType === "offline_checkout_recovery")
        .sort(
          (a, b) =>
            new Date(b.detectedAt || b.createdAt).getTime() -
            new Date(a.detectedAt || a.createdAt).getTime()
        )[0];

      if (recoveryIncident) {
        const statusMap = {
          detected: "failure-injected",
          recovering: "data-restored",
          resolved: "checkout-completed",
          failed: "draft-discarded",
        };

        const evidenceStatus = statusMap[recoveryIncident.status] || recoveryIncident.status;

        setCheckoutRecoveryEvidence({
          status: evidenceStatus,
          failureDetectedAt:
            evidenceStatus === "failure-injected"
              ? recoveryIncident.detectedAt
              : recoveryIncident.failureDetectedAt,
          failureInjectedAt:
            evidenceStatus === "failure-injected"
              ? recoveryIncident.detectedAt
              : recoveryIncident.failureInjectedAt,
          connectionRestoredAt:
            evidenceStatus === "data-restored" ||
              evidenceStatus === "checkout-completed"
              ? recoveryIncident.detectedAt
              : recoveryIncident.connectionRestoredAt,
          restoredAt:
            evidenceStatus === "data-restored" ||
              evidenceStatus === "checkout-completed"
              ? recoveryIncident.detectedAt
              : recoveryIncident.restoredAt,
          completedAt:
            evidenceStatus === "checkout-completed"
              ? recoveryIncident.resolvedAt ||
              recoveryIncident.detectedAt
              : recoveryIncident.completedAt,
          discardedAt:
            evidenceStatus === "draft-discarded"
              ? recoveryIncident.resolvedAt ||
              recoveryIncident.detectedAt
              : recoveryIncident.discardedAt,
          message: recoveryIncident.message,
          recoveryAction: recoveryIncident.recoveryAction,
          recoveryResult: recoveryIncident.recoveryResult,
          updatedAt: recoveryIncident.updatedAt || recoveryIncident.detectedAt,
        });

        localStorage.setItem(
          "shcomCheckoutRecoveryEvidence",
          JSON.stringify({
            status: evidenceStatus,
            updatedAt: recoveryIncident.updatedAt || recoveryIncident.detectedAt,
          })
        );
      }
    } catch {
      setIncidentsError(
        "Unable to load incidents from the backend."
      );
    }
  }
  const checkPaymentHealth = async () => {
    try {
      const response = await axios.get(`${PAYMENT_SERVICE_URL}/health`, {
        timeout: 3000,
      });
      setPaymentHealth(response.data || null);
      setPaymentHealthError("");
      setPaymentLastSuccessfulCheck(new Date().toLocaleTimeString());
      setPaymentLastFailure(null);
    } catch (error) {
      setPaymentHealth(null);
      setPaymentLastFailure(
        error?.code === "ECONNABORTED"
          ? "Payment service health check timed out."
          : error?.message || "Payment service is unavailable."
      );
      setPaymentHealthError(
        error?.code === "ECONNABORTED"
          ? "Payment service health check timed out."
          : error?.message || "Payment service is unavailable."
      );
    }
  };
  const refreshAllStatuses = useCallback(async () => {
    await Promise.all([
      checkBackendHealth(),
      checkRecoveryMonitor(),
      checkPaymentHealth(),
      checkIncidents(),
    ]);
  }, []);
  useEffect(() => {
    let isRefreshing = false;
    const refresh = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        await refreshAllStatuses();
      } finally {
        isRefreshing = false;
      }
    };
    refresh();
    const intervalId = setInterval(refresh, 5000);
    return () => clearInterval(intervalId);
  }, [refreshAllStatuses]);
  useEffect(() => {
    checkExperimentStatus();
    const intervalId = setInterval(checkExperimentStatus, 5000);
    return () => clearInterval(intervalId);
  }, []);
  useEffect(() => {
    const loadOrders = async () => {
      await fetchAdminOrders();
    };
    loadOrders();
  }, []);
  useEffect(() => {
    if (!paymentRecovery.running || paymentRecovery.resolvedAt) return;
    const recovery = Array.isArray(incidents)
      ? incidents.find(
        (i) =>
          String(i.incidentType || "").toLowerCase() ===
          "payment_timeout_recovery" &&
          i.status === "resolved" &&
          String(i.recoveryAction || "") ===
          "Verified the existing payment transaction" &&
          i.detectedAt &&
          new Date(i.detectedAt) >= paymentRecovery.startedAt
      )
      : null;
    if (recovery) {
      const duration = Math.round(
        (new Date(recovery.resolvedAt || recovery.detectedAt) -
          paymentRecovery.startedAt) /
        1000
      );
      setPaymentRecovery((prev) => ({
        ...prev,
        running: false,
        resolvedAt: recovery.resolvedAt || recovery.detectedAt,
        status: "recovered",
        message: `Self-healed in ${duration}s: payment verified and order placed.`,
        stages: [
          ...prev.stages,
          {
            t: Date.now(),
            status: "recovered",
            message: `Self-healed in ${duration}s: payment verified and order placed (₹${Number(recovery?.totalAmount ?? 0).toLocaleString()}).`,
          },
        ],
      }));
    }
  }, [incidents, paymentRecovery.running, paymentRecovery.startedAt, paymentRecovery.resolvedAt]);
  const { backendStatus, databaseStatus } = getBackendHealthStatuses({
    health,
    healthError,
  });
  const paymentStatus = derivePaymentHealthState({
    paymentHealth,
    paymentHealthError,
    paymentRunning: false,
  });
  const paymentDetail = buildPaymentHealthDetail({
    paymentHealth,
    paymentHealthError,
    paymentLastSuccessfulCheck,
    paymentLastFailure,
    paymentRecoveryAttempts,
    paymentRecoveryVerifiedAt,
  });
  const recoveryStatus = recoveryError
    ? "Unavailable"
    : !recoveryInfo
      ? "Checking"
      : !recoveryInfo.success || !recoveryInfo.available
        ? "Unavailable"
        : recoveryInfo.status !== "running"
          ? "Degraded"
          : recoveryInfo.health === "healthy"
            ? "Healthy"
            : "Degraded";
  const recoveryMonitorDetail = recoveryError
    ? "Connection failed · Port 5002"
    : !recoveryInfo
      ? "Checking Docker · Port 5002"
      : recoveryInfo.available === false
        ? `Docker unavailable: ${recoveryInfo.message || "Start Docker Desktop"}`
        : `Docker: ${recoveryInfo.container}`;
  const totalIncidents = incidents.length;
  // The analytics keep their last known figures when the backend cannot be
  // reached, so they are marked as stale instead of being cleared.
  const { stale: incidentsAreStale, updatedAt: incidentsUpdatedAtValue } =
    getIncidentsFreshness({
      incidents,
      incidentsError,
      updatedAt: incidentsUpdatedAt,
    });
  const resolvedIncidents = incidents.filter(
    (incident) => incident.status === "resolved"
  ).length;
  const failedIncidents = incidents.filter(
    (incident) => incident.status === "failed"
  ).length;
  const activeIncidents = incidents.filter(
    (incident) =>
      incident.status === "detected" ||
      incident.status === "recovering"
  ).length;
  const recoverySuccessRate =
    totalIncidents > 0
      ? ((resolvedIncidents / totalIncidents) * 100).toFixed(1)
      : "0.0";
  const incidentsBySeverity = [
    {
      label: "Critical",
      count: incidents.filter((i) => i.severity === "critical").length,
      color: "var(--cc-red)",
    },
    {
      label: "High",
      count: incidents.filter((i) => i.severity === "high").length,
      color: "var(--cc-amber)",
    },
    {
      label: "Medium",
      count: incidents.filter((i) => i.severity === "medium").length,
      color: "var(--cc-amber)",
    },
    {
      label: "Low",
      count: incidents.filter((i) => i.severity === "low").length,
      color: "var(--cc-lime)",
    },
  ];
  const incidentsByType = Object.entries(
    incidents.reduce((counts, incident) => {
      const type = incident.incidentType || "unknown";
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {})
  )
    .map(([type, count]) => ({
      label: type
        .split("_")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(" "),
      count,
    }))
    .sort((a, b) => b.count - a.count);
  const paymentIncidents = incidents.filter(
    (incident) =>
      String(incident.incidentType || "").toLowerCase().includes("payment") ||
      String(incident.message || "").toLowerCase().includes("payment")
  );
  const recoveryActionsSummary = Object.entries(
    incidents.reduce((counts, incident) => {
      const action = incident.recoveryAction || "No action recorded";
      counts[action] = (counts[action] || 0) + 1;
      return counts;
    }, {})
  )
    .map(([action, count]) => ({
      action,
      count,
    }))
    .sort((a, b) => b.count - a.count);
  const filteredIncidents = incidents.filter((incident) => {
    const matchesSeverity =
      severityFilter === "all" ||
      incident.severity?.toLowerCase() === severityFilter;
    const matchesStatus =
      statusFilter === "all" ||
      incident.status?.toLowerCase() === statusFilter;
    const matchesType =
      typeFilter === "all" ||
      incident.incidentType?.toLowerCase() === typeFilter;
    return matchesSeverity && matchesStatus && matchesType;
  });
  const services = [
    {
      name: "Backend API",
      detail: "Express · Port 5000",
      icon: Server,
      status: backendStatus,
    },
    {
      name: "MongoDB Atlas",
      detail: "Database connection",
      icon: CheckCircle2,
      status: databaseStatus,
    },
    {
      name: "Payment Service",
      detail: paymentDetail,
      icon: CreditCard,
      status: paymentStatus,
    },
    {
      name: "Recovery Monitor",
      detail: recoveryMonitorDetail,
      icon: RefreshCw,
      status: recoveryStatus,
    },
  ];
  return (
    <div className="cc-bg cc-text min-h-screen" data-dashboard-page={page}>
      <main className="min-w-0 flex-1">
        {/* header */}

        <header className="relative overflow-hidden border-b border-cc-border bg-[#111410] px-5 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.035)] sm:px-7 lg:px-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/50 to-transparent" />

          <div className="pointer-events-none absolute -right-16 -top-24 h-52 w-52 rounded-full bg-[#A78BFA]/[0.07] blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-5 lg:gap-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DEED00] sm:text-xs">
                  HealCart
                </span>

                <span className="text-[#59614A]">/</span>

                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#A78BFA] sm:text-xs">
                  Operations
                </span>
              </div>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#F3F4F1] sm:text-3xl">
                {page === "incidents"
                  ? "Incidents"
                  : page === "chaos-center"
                    ? "Chaos Center"
                    : "System Overview"}
              </h2>

              <p className="mt-2 max-w-2xl text-xs leading-5 text-[#92968F] sm:text-sm">
                {page === "incidents"
                  ? "Incident history, diagnosis and recovery outcomes"
                  : page === "chaos-center"
                    ? "Run controlled failures and verify self-healing behavior"
                    : "Live service health and recovery overview"}
              </p>

              <div className="mt-4 h-[2px] w-16 rounded-full bg-gradient-to-r from-[#DEED00] via-[#35D07F] to-[#A78BFA]" />
            </div>

            <div className="flex w-full flex-col gap-3 rounded-2xl border border-[#30352C] bg-[#171A14] p-3 shadow-[0_3px_0_#20241C,0_8px_18px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] sm:w-auto sm:min-w-[230px] sm:p-4">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2 shrink-0">
                  {!checking && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#35D07F] opacity-30" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${checking ? "bg-[#A78BFA]" : "bg-[#35D07F]"
                      }`}
                  />
                </span>

                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C5C9BF]">
                  {checking ? "Checking services" : "Status monitor"}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#F3F4F1]">
                    {checking
                      ? "Refreshing health data..."
                      : "Service health check"}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-[#92968F]">
                    {lastChecked
                      ? `Last checked: ${lastChecked}`
                      : "Waiting for first health check"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={refreshAllStatuses}
                  disabled={checking}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#59614A] bg-[#252A1D] px-3.5 py-2.5 text-xs font-semibold text-[#DEED00] shadow-[0_3px_0_#141710,0_6px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7B8957] hover:bg-[#303624] hover:shadow-[0_4px_0_#141710,0_9px_15px_rgba(0,0,0,0.25)] active:translate-y-0 active:shadow-[0_1px_0_#141710] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={checking ? "animate-spin" : ""}
                  />
                  {checking ? "Checking..." : "Refresh"}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="dashboard-content space-y-10 p-8 lg:p-10">
          {/* Welcome */}

          <section
            id="overview"
            className="dashboard-overview-only group relative scroll-mt-8 overflow-hidden rounded-3xl border border-[#414638] bg-[#141711] p-6 shadow-[0_3px_0_0_#30352C,0_8px_0_0_#20241C,0_18px_36px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#59614A] hover:shadow-[0_3px_0_0_#414638,0_9px_0_0_#25291F,0_22px_40px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-8 lg:p-10"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/60 to-transparent" />

            <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#A78BFA]/[0.08] blur-3xl transition-opacity duration-300 group-hover:bg-[#A78BFA]/[0.12]" />

            <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#35D07F]/[0.05] blur-3xl" />

            <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-6">
                <div className="relative shrink-0">
                  <div className="absolute inset-0 rounded-2xl bg-[#DEED00]/10 blur-xl transition-all duration-300 group-hover:bg-[#DEED00]/20" />

                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[#697347]/60 bg-gradient-to-br from-[#303722] to-[#1B2016] text-[#DEED00] shadow-[0_4px_0_#141710,0_9px_18px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.09)] transition-transform duration-300 group-hover:-translate-y-1 sm:h-[68px] sm:w-[68px]">
                    <Activity size={25} strokeWidth={1.7} />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#DEED00]">
                      Operations Center
                    </span>

                    <span className="h-1 w-1 rounded-full bg-[#59614A]" />

                    <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#A78BFA]">
                      Self-Healing Systems
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold tracking-tight text-[#F3F4F1] sm:text-xl lg:text-2xl">
                    Welcome to HealCart Operations
                  </h3>

                  <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#A2A69B] sm:text-sm sm:leading-6">
                    Track service availability, investigate incidents, and understand how
                    HealCart responds to failures. Monitor live health information from
                    your running backend and recovery monitor in one place.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#35D07F] shadow-[0_0_8px_rgba(53,208,127,0.4)]" />
                      <span className="text-[10px] text-[#C5C9BF]">
                        Live service monitoring
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#A78BFA]" />
                      <span className="text-[10px] text-[#C5C9BF]">
                        Incident investigation
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#DEED00]" />
                      <span className="text-[10px] text-[#C5C9BF]">
                        Recovery tracking
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden shrink-0 lg:block">
                <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-[#414638]/80 bg-[#191D16]/80 shadow-[0_8px_22px_rgba(0,0,0,0.22),inset_0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="absolute inset-3 rounded-full border border-dashed border-[#59614A]/70" />
                  <div className="absolute inset-6 rounded-full border border-[#A78BFA]/25" />

                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[#59614A] bg-gradient-to-br from-[#303722] to-[#1B2016] text-[#DEED00] shadow-[0_4px_0_#141710,0_8px_16px_rgba(0,0,0,0.25)]">
                    <Activity size={23} strokeWidth={1.6} />
                  </div>

                  <span className="absolute right-5 top-5 h-2 w-2 rounded-full bg-[#35D07F] shadow-[0_0_10px_rgba(53,208,127,0.65)]" />
                  <span className="absolute bottom-5 left-5 h-2 w-2 rounded-full bg-[#A78BFA] shadow-[0_0_10px_rgba(167,139,250,0.45)]" />
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-7 h-px bg-gradient-to-r from-[#414638] via-[#414638]/60 to-transparent" />

            <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[9px] tracking-wide text-[#858A7D]">
                HEALCART <span className="text-[#59614A]">/</span> SYSTEM OBSERVABILITY
              </p>

              <span className="text-[9px] font-medium tracking-wide text-[#92968F]">
                Monitor · Investigate · Recover
              </span>
            </div>
          </section>

          {/* service health */}

          <section
            id="service-health"
            className="dashboard-overview-only scroll-mt-8"
          >
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#DEED00]" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#A8B65A]">
                  Infrastructure
                </span>
              </div>

              <h3 className="text-lg font-semibold tracking-tight text-[#F3F4F1] sm:text-xl">
                Service Health
              </h3>

              <p className="mt-1 text-[13px] leading-5 text-[#92968F]">
                Live backend, database and recovery-monitor status.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {services.map(({ name, detail, icon: Icon, status }) => {
                const isHealthy =
                  status === "Healthy" || status === "Connected";

                const isUnavailable =
                  status === "Unavailable" ||
                  status === "Disconnected" ||
                  status === "Degraded";

                return (
                  <article
                    key={name}
                    className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#414638] bg-[#141711] p-5 shadow-[0_2px_0_0_#30352C,0_6px_0_0_#20241C,0_12px_22px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-[#59614A] hover:bg-[#191D16] hover:shadow-[0_2px_0_0_#414638,0_8px_0_0_#25291F,0_17px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6"
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#A8B65A]/50 to-transparent" />

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#414638] bg-gradient-to-br from-[#292E21] to-[#1A1E15] text-[#DEED00] shadow-[0_3px_0_#10120D,0_6px_12px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.07)] transition-transform duration-300 group-hover:-translate-y-0.5">
                        <Icon size={19} strokeWidth={1.7} />
                      </div>

                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${isHealthy
                          ? "border-[#35D07F]/25 bg-[#35D07F]/[0.08] text-[#35D07F]"
                          : isUnavailable
                            ? "border-[var(--cc-red)]/30 bg-[var(--cc-red)]/10 text-cc-red"
                            : "border-[#414638] bg-[#20241C] text-[#C5C9BF]"
                          }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${isHealthy
                            ? "bg-[#35D07F]"
                            : isUnavailable
                              ? "bg-[var(--cc-red)]"
                              : "bg-[#92968F]"
                            }`}
                        />
                        {status}
                      </span>
                    </div>

                    <div className="mt-6">
                      <h4 className="text-[14px] font-semibold tracking-tight text-[#F3F4F1]">
                        {name}
                      </h4>
                    </div>

                    <div className="mt-5 flex-1 border-t border-[#30352C] pt-4">
                      <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A8B65A]">
                        Runtime Details
                      </p>

                      {name === "Recovery Monitor" && recoveryInfo ? (
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] text-[#858A7D]">
                              Container
                            </p>
                            <p className="mt-1 break-all text-[12px] font-medium leading-5 text-[#C5C9BF]">
                              {recoveryInfo.container}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] text-[#858A7D]">
                              Docker Status
                            </p>
                            <p className="mt-1 break-words text-[12px] font-medium leading-5 text-[#C5C9BF]">
                              {recoveryInfo.status}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] text-[#858A7D]">
                              Restart Count
                            </p>
                            <p className="mt-1 inline-flex rounded-md border border-[#414638] bg-[#20241C] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[#DEED00]">
                              {recoveryInfo.restartCount ?? "Unknown"}
                            </p>
                          </div>
                        </div>
                      ) : name === "Recovery Monitor" && recoveryError ? (
                        <p className="text-[11px] leading-5 text-cc-red">
                          {recoveryError}
                        </p>
                      ) : (
                        <div className="flex min-h-[124px] flex-col justify-between gap-4">
                          <div>
                            <p className="text-[10px] text-[#858A7D]">
                              Service Status
                            </p>
                            <p
                              className={`mt-1 text-[12px] font-medium ${isHealthy
                                ? "text-[#35D07F]"
                                : isUnavailable
                                  ? "text-cc-red"
                                  : "text-[#C5C9BF]"
                                }`}
                            >
                              {status}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] text-[#858A7D]">
                              Service Information
                            </p>
                            <p className="mt-1 text-[12px] leading-5 text-[#C5C9BF]">
                              {detail}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 border-t border-[#30352C] pt-3">
                      <p className="text-[9px] tracking-wide text-[#858A7D]">
                        HEALCART <span className="text-[#59614A]">/</span>{" "}
                        RUNTIME
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <div className="dashboard-overview-only">
            <ServiceDependencyMap
              health={health}
              paymentHealth={paymentHealth}
              recoveryInfo={recoveryInfo}
              recoveryError={recoveryError}
              healthError={healthError}
              paymentHealthError={paymentHealthError}
            />
          </div>




          <section
            id="recovery-analytics"
            className="dashboard-incidents-only scroll-mt-8 overflow-hidden rounded-3xl border border-cc-border bg-cc-panel p-5 sm:p-8"
          >
            <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] cc-lime">
                  Performance Insights / 01
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight cc-text">
                  Recovery Analytics
                </h3>
                <p className="mt-1 text-sm cc-muted">
                  Real incident data · Recovery performance and system resilience
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-full border border-cc-border bg-cc-panel px-4 py-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${incidentsAreStale ? "bg-[var(--cc-amber)]" : "bg-[var(--cc-green)]"
                    }`}
                />
                <span className="text-[11px] font-medium uppercase tracking-wider cc-muted">
                  {incidentsAreStale ? "Data may be stale" : "Incident metrics"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
              {[
                {
                  label: "Total incidents",
                  value: totalIncidents,
                  color: "var(--cc-lime)",
                  index: "01",
                },
                {
                  label: "Resolved",
                  value: resolvedIncidents,
                  color: "var(--cc-green)",
                  index: "02",
                },
                {
                  label: "Failed",
                  value: failedIncidents,
                  color: "var(--cc-red)",
                  index: "03",
                },
                {
                  label: "Active incidents",
                  value: activeIncidents,
                  color: "var(--cc-amber)",
                  index: "04",
                },
              ].map((item) => (
                <article
                  key={item.label}
                  className="group relative overflow-hidden rounded-2xl border border-cc-border bg-cc-panel p-5 transition-colors duration-200 hover:border-[var(--cc-border)] sm:p-6"
                >
                  <div className="mb-6 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-[0.13em] cc-muted">
                      {item.label}
                    </span>
                    <span className="font-mono text-[11px] cc-muted">
                      {item.index}
                    </span>
                  </div>
                  <div
                    className="text-4xl font-semibold tracking-tight tabular-nums sm:text-4xl"
                    style={{ color: item.color }}
                  >
                    {item.value}
                  </div>
                  <div
                    className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-30 opacity-70 transition-transform duration-300 group-hover:scale-x-100"
                    style={{ backgroundColor: item.color }}
                  />
                </article>
              ))}
            </div>

            {incidentsAreStale ? (
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--cc-amber)]/20 bg-[var(--cc-amber)]/[0.06] px-4 py-3 text-sm text-cc-amber">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  These are the last figures loaded at{" "}
                  {incidentsUpdatedAtValue || "an earlier time"}. The backend
                  could not be reached, so the numbers may be out of date.
                </span>
              </div>
            ) : incidentsUpdatedAt ? (
              <p className="mt-4 text-[11px] cc-muted">
                Last updated at {incidentsUpdatedAt}
              </p>
            ) : null}

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {/* Resolution donut chart */}

              <article className="rounded-2xl border border-cc-border bg-[var(--cc-panel)] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold cc-text">
                      Recovery Trend
                    </h4>
                    <p className="mt-1 text-[12px] cc-muted">
                      Incident activity over time
                    </p>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-cc-border px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-[#DEED00]" />
                    <span className="text-[11px] cc-muted">Resolved</span>
                    <span className="ml-2 h-2 w-2 rounded-full bg-[#A78BFA]" />
                    <span className="text-[11px] cc-muted">Other</span>
                  </div>
                </div>

                {incidents.length === 0 ? (
                  <div className="mt-6 flex h-[230px] items-center justify-center rounded-xl border border-dashed border-cc-border px-4 text-center">
                    <p className="text-sm cc-muted">
                      Recovery trends will appear when incident data is available.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 h-[230px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={incidents
                          .filter((incident) => incident.createdAt || incident.timestamp)
                          .reduce((groups, incident) => {
                            const rawDate = incident.createdAt || incident.timestamp;
                            const date = new Date(rawDate);

                            if (Number.isNaN(date.getTime())) return groups;

                            const key = date.toISOString().slice(0, 10);
                            let group = groups.find((item) => item.dateKey === key);

                            if (!group) {
                              group = {
                                dateKey: key,
                                date: date.toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                }),
                                resolved: 0,
                                other: 0,
                              };
                              groups.push(group);
                            }

                            if (incident.status === "resolved") {
                              group.resolved += 1;
                            } else {
                              group.other += 1;
                            }

                            return groups;
                          }, [])
                          .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
                          .slice(-10)}
                        margin={{ top: 10, right: 8, left: -22, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="recoveryAreaFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#DEED00" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#DEED00" stopOpacity={0.01} />
                          </linearGradient>

                          <linearGradient
                            id="incidentAreaFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#A78BFA" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>

                        <CartesianGrid
                          stroke="#292D24"
                          strokeDasharray="3 5"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#92968F", fontSize: 10 }}
                          dy={10}
                        />

                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#92968F", fontSize: 10 }}
                        />

                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#141813",
                            border: "1px solid #414638",
                            borderRadius: "10px",
                            color: "#F3F4F1",
                            fontSize: "12px",
                          }}
                          labelStyle={{
                            color: "#F3F4F1",
                            marginBottom: 6,
                          }}
                          formatter={(value, name) => [
                            value,
                            name === "resolved" ? "Resolved" : "Other incidents",
                          ]}
                        />

                        <Area
                          type="monotone"
                          dataKey="resolved"
                          name="resolved"
                          stroke="#DEED00"
                          strokeWidth={2.5}
                          fill="url(#recoveryAreaFill)"
                          activeDot={{
                            r: 4,
                            fill: "#DEED00",
                            stroke: "#141813",
                            strokeWidth: 2,
                          }}
                        />

                        <Area
                          type="monotone"
                          dataKey="other"
                          name="other"
                          stroke="#A78BFA"
                          strokeWidth={1.8}
                          fill="url(#incidentAreaFill)"
                          activeDot={{
                            r: 3,
                            fill: "#A78BFA",
                            stroke: "#141813",
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-cc-border pt-4">
                  <div>
                    <p className="text-[11px] cc-muted">Resolved incidents</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums cc-text">
                      {resolvedIncidents}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] cc-muted">Currently active</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums cc-text">
                      {activeIncidents}
                    </p>
                  </div>
                </div>
              </article>


              <article className="group relative isolate overflow-hidden rounded-2xl border border-[#414638] bg-[linear-gradient(145deg,#1C2119_0%,#111410_48%,#0C0F0B_100%)] p-5 shadow-[0_12px_0_#080A07,0_20px_40px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_0_#080A07,0_28px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/50 to-transparent" />
                <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-48 w-48 rounded-full bg-[#DEED00]/[0.045] blur-3xl transition-opacity duration-300 group-hover:opacity-150" />

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                      Incidents by Severity
                    </h4>
                    <p className="mt-1 text-[12px] text-[#92968F]">
                      Distribution by recorded severity level
                    </p>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-[#FF5C5C]/25 bg-gradient-to-b from-[#FF5C5C]/10 to-[#FF5C5C]/[0.02] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_8px_rgba(0,0,0,0.2)]">
                    <span className="h-2 w-2 rounded-full bg-[#FF5C5C] shadow-[0_0_9px_rgba(255,92,92,0.8)]" />
                    <span className="text-[11px] font-medium text-[#FFAAA0]">Critical</span>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-white/[0.04] bg-black/20 p-2 shadow-[inset_0_3px_10px_rgba(0,0,0,0.25),0_1px_0_rgba(255,255,255,0.025)] sm:p-3">
                  <div className="h-[230px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={incidentsBySeverity}
                        layout="vertical"
                        margin={{ top: 8, right: 20, bottom: 4, left: 0 }}
                        barCategoryGap="35%"
                      >
                        <defs>
                          <linearGradient id="severityCritical3d" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FFB0AA" />
                            <stop offset="20%" stopColor="#FF7777" />
                            <stop offset="100%" stopColor="#C92E3D" />
                          </linearGradient>

                          <linearGradient id="severityHigh3d" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FFC18E" />
                            <stop offset="20%" stopColor="#FF9B60" />
                            <stop offset="100%" stopColor="#D85A2C" />
                          </linearGradient>

                          <linearGradient id="severityMedium3d" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FFE49A" />
                            <stop offset="20%" stopColor="#F5C85C" />
                            <stop offset="100%" stopColor="#C18B20" />
                          </linearGradient>

                          <linearGradient id="severityLow3d" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F5FF8C" />
                            <stop offset="20%" stopColor="#DEED00" />
                            <stop offset="100%" stopColor="#8F9B00" />
                          </linearGradient>

                          <filter id="severityBarShadow" x="-10%" y="-40%" width="125%" height="200%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
                            <feOffset dy="3" result="offsetBlur" />
                            <feComponentTransfer>
                              <feFuncA type="linear" slope="0.3" />
                            </feComponentTransfer>
                            <feMerge>
                              <feMergeNode />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>

                        <CartesianGrid
                          horizontal={false}
                          stroke="#34392E"
                          strokeDasharray="3 6"
                        />

                        <XAxis
                          type="number"
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#92968F", fontSize: 10 }}
                          tickMargin={8}
                        />

                        <YAxis
                          type="category"
                          dataKey="label"
                          width={70}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#D0D3CB", fontSize: 11 }}
                        />

                        <Tooltip
                          cursor={{ fill: "#FFFFFF", opacity: 0.035 }}
                          contentStyle={{
                            background: "linear-gradient(145deg, #20251D, #111410)",
                            border: "1px solid #414638",
                            borderRadius: "12px",
                            color: "#F3F4F1",
                            fontSize: "12px",
                            boxShadow: "0 12px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
                          }}
                          labelStyle={{ color: "#F3F4F1", marginBottom: 5 }}
                          itemStyle={{ color: "#DEED00" }}
                          formatter={(value) => [value, "Incidents"]}
                        />

                        <Bar
                          dataKey="count"
                          name="Incidents"
                          radius={[0, 6, 6, 0]}
                          maxBarSize={28}
                          background={{ fill: "#252A21", radius: 6 }}
                          isAnimationActive
                          animationDuration={800}
                        >
                          {incidentsBySeverity.map((item) => (
                            <Cell
                              key={item.label}
                              fill={
                                {
                                  Critical: "url(#severityCritical3d)",
                                  High: "url(#severityHigh3d)",
                                  Medium: "url(#severityMedium3d)",
                                  Low: "url(#severityLow3d)",
                                }[item.label] || "#92968F"
                              }
                              stroke={
                                {
                                  Critical: "#FFAAA0",
                                  High: "#FFC18E",
                                  Medium: "#FFE49A",
                                  Low: "#F5FF8C",
                                }[item.label] || "none"
                              }
                              strokeOpacity={0.45}
                              strokeWidth={0.6}
                              filter="url(#severityBarShadow)"
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-4">
                  {incidentsBySeverity.map((item) => {
                    const severityColor = {
                      Critical: "#FF5C5C",
                      High: "#FF8A4C",
                      Medium: "#F5B942",
                      Low: "#DEED00",
                    }[item.label] || "#92968F";

                    return (
                      <div
                        key={item.label}
                        className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-br from-[#252A21] via-[#171B14] to-[#10130E] p-3 shadow-[0_4px_0_#090B08,0_7px_12px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-[0_5px_0_#090B08,0_10px_16px_rgba(0,0,0,0.3)]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
                            style={{ backgroundColor: severityColor, color: severityColor }}
                          />
                          <p className="text-[11px] text-[#A5AA9F]">{item.label}</p>
                        </div>

                        <p
                          className="mt-2 text-xl font-semibold tabular-nums"
                          style={{
                            color: severityColor,
                            textShadow: `0 0 14px ${severityColor}30`,
                          }}
                        >
                          {item.count}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </article>


              <article className="group relative isolate overflow-hidden rounded-2xl border border-[#414638] bg-[linear-gradient(145deg,#1C2119_0%,#111410_48%,#0C0F0B_100%)] p-5 shadow-[0_12px_0_#080A07,0_20px_40px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_0_#080A07,0_28px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/50 to-transparent" />
                <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-48 w-48 rounded-full bg-[#B49AFF]/[0.06] blur-3xl" />

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                      Incidents by Type
                    </h4>
                    <p className="mt-1 text-[12px] text-[#92968F]">
                      Which failure categories occur most often
                    </p>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-[#B49AFF]/20 bg-gradient-to-b from-[#B49AFF]/10 to-[#B49AFF]/[0.02] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_8px_rgba(0,0,0,0.2)]">
                    <Activity size={13} className="text-[#B49AFF]" />
                    <span className="text-[11px] font-medium text-[#C8B6FF]">
                      Failure Mix
                    </span>
                  </div>
                </div>

                {incidentsByType.length === 0 ? (
                  <div className="mt-6 flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-[#414638] bg-black/15 text-center shadow-[inset_0_3px_10px_rgba(0,0,0,0.2)]">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[#414638] bg-gradient-to-br from-[#252A21] to-[#111410] text-[#92968F] shadow-[0_4px_0_#080A07,0_7px_14px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.07)]">
                      <Activity size={20} />
                    </div>
                    <p className="text-sm font-medium text-[#F3F4F1]">
                      No incidents recorded yet
                    </p>
                    <p className="mt-1 max-w-[240px] text-[12px] text-[#92968F]">
                      Type distribution will appear when data is available.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="relative min-w-0 rounded-xl border border-white/[0.04] bg-black/20 p-2 shadow-[inset_0_3px_12px_rgba(0,0,0,0.32),0_1px_0_rgba(255,255,255,0.025)]">
                      <div className="relative h-[240px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <defs>
                              <linearGradient id="typeLime3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F5FF8C" />
                                <stop offset="45%" stopColor="#DEED00" />
                                <stop offset="100%" stopColor="#899500" />
                              </linearGradient>

                              <linearGradient id="typeGreen3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#9AFFC4" />
                                <stop offset="45%" stopColor="#35D07F" />
                                <stop offset="100%" stopColor="#17894E" />
                              </linearGradient>

                              <linearGradient id="typeBlue3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#B8DEFF" />
                                <stop offset="45%" stopColor="#69B7FF" />
                                <stop offset="100%" stopColor="#357EC0" />
                              </linearGradient>

                              <linearGradient id="typePurple3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#E0D5FF" />
                                <stop offset="45%" stopColor="#B49AFF" />
                                <stop offset="100%" stopColor="#7856C5" />
                              </linearGradient>

                              <linearGradient id="typeAmber3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#FFE7A6" />
                                <stop offset="45%" stopColor="#F5B942" />
                                <stop offset="100%" stopColor="#B57B18" />
                              </linearGradient>

                              <linearGradient id="typeRose3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#FFC0C7" />
                                <stop offset="45%" stopColor="#FF7E8A" />
                                <stop offset="100%" stopColor="#C34358" />
                              </linearGradient>

                              <linearGradient id="typeTeal3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#A6FFF2" />
                                <stop offset="45%" stopColor="#42D6C5" />
                                <stop offset="100%" stopColor="#198F84" />
                              </linearGradient>

                              <linearGradient id="typeGray3d" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#C9CDC4" />
                                <stop offset="45%" stopColor="#92968F" />
                                <stop offset="100%" stopColor="#555950" />
                              </linearGradient>
                            </defs>

                            <Pie
                              data={incidentsByType}
                              dataKey="count"
                              nameKey="label"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={88}
                              paddingAngle={3}
                              stroke="#111410"
                              strokeWidth={2}
                              cornerRadius={4}
                              isAnimationActive
                              animationDuration={850}
                            >
                              {incidentsByType.map((item, index) => (
                                <Cell
                                  key={item.label}
                                  fill={
                                    [
                                      "url(#typeLime3d)",
                                      "url(#typeGreen3d)",
                                      "url(#typeBlue3d)",
                                      "url(#typePurple3d)",
                                      "url(#typeAmber3d)",
                                      "url(#typeRose3d)",
                                      "url(#typeTeal3d)",
                                      "url(#typeGray3d)",
                                    ][index % 8]
                                  }
                                  strokeOpacity={0.85}
                                />
                              ))}
                            </Pie>

                            <Tooltip
                              contentStyle={{
                                background: "linear-gradient(145deg, #20251D, #111410)",
                                border: "1px solid #414638",
                                borderRadius: "12px",
                                color: "#F3F4F1",
                                fontSize: "12px",
                                boxShadow: "0 12px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
                              }}
                              itemStyle={{ color: "#DEED00" }}
                              labelStyle={{ color: "#F3F4F1", marginBottom: 5 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>

                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#92968F]">
                            Total
                          </span>
                          <span className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-[#F3F4F1] [text-shadow:0_2px_12px_rgba(222,237,0,0.12)]">
                            {totalIncidents}
                          </span>
                          <span className="mt-1 h-0.5 w-7 rounded-full bg-gradient-to-r from-transparent via-[#DEED00] to-transparent" />
                        </div>
                      </div>
                    </div>

                    <div className="max-h-[260px] min-w-0 space-y-2 overflow-y-auto pr-1">
                      {incidentsByType.map((item, index) => {
                        const typeColors = [
                          "#DEED00",
                          "#35D07F",
                          "#69B7FF",
                          "#B49AFF",
                          "#F5B942",
                          "#FF7E8A",
                          "#42D6C5",
                          "#92968F",
                        ];

                        const typeColor = typeColors[index % typeColors.length];

                        return (
                          <div
                            key={item.label}
                            className="group/legend flex items-center gap-3 rounded-lg border border-white/[0.045] bg-gradient-to-r from-white/[0.035] to-transparent px-3 py-2.5 shadow-[0_2px_0_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.035)] transition-all duration-200 hover:translate-x-0.5 hover:border-white/[0.1] hover:from-white/[0.07]"
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-[3px] shadow-[0_0_9px_currentColor]"
                              style={{
                                backgroundColor: typeColor,
                                color: typeColor,
                              }}
                            />

                            <span className="min-w-0 flex-1 break-words text-[12px] leading-4 text-[#AEB2A8] transition-colors group-hover/legend:text-[#F3F4F1]">
                              {item.label}
                            </span>

                            <span
                              className="rounded-md border border-white/[0.05] bg-black/20 px-2 py-1 text-xs font-semibold tabular-nums"
                              style={{
                                color: typeColor,
                                textShadow: `0 0 12px ${typeColor}25`,
                              }}
                            >
                              {item.count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>



              {/* Recovery actions ranked bar chart */}
              <article className="group relative overflow-hidden rounded-2xl border border-[#414638] bg-[var(--cc-panel)] p-5 shadow-[0_2px_0_0_#30352C,0_7px_0_0_#20241C,0_13px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)] transition-all duration-300 hover:-translate-y-1 hover:border-[#59614A] hover:bg-[#191D16] hover:shadow-[0_2px_0_0_#414638,0_8px_0_0_#25291F,0_18px_30px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#A8B65A]/50 to-transparent" />

                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8DAD8C]">
                      Recovery Analytics
                    </p>
                    <h4 className="text-base font-semibold tracking-tight cc-text">
                      Recovery Action Summary
                    </h4>
                    <p className="mt-1 text-[12px] cc-muted">
                      Recorded recovery actions, ranked by frequency
                    </p>
                  </div>

                  <div className="shrink-0 rounded-lg border border-cc-border bg-black/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                    <p className="text-[10px] uppercase tracking-wider cc-muted">
                      Action types
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums cc-text">
                      {recoveryActionsSummary.length}
                    </p>
                  </div>
                </div>

                {recoveryActionsSummary.length === 0 ? (
                  <div className="relative z-10 flex h-[240px] flex-col items-center justify-center text-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-cc-border bg-cc-panel cc-muted shadow-[0_3px_0_#20241C,inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <Activity size={19} strokeWidth={1.6} />
                    </div>
                    <p className="text-sm font-medium cc-text">
                      No recovery actions recorded yet
                    </p>
                    <p className="mt-1 text-[12px] cc-muted">
                      Recorded actions will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="relative z-10">
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-cc-border bg-black/[0.08] p-3 shadow-[0_3px_0_#20241C,inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors duration-200 hover:bg-black/[0.16]">
                        <p className="text-[11px] cc-muted">Total actions</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums cc-text">
                          {recoveryActionsSummary.reduce(
                            (total, item) => total + Number(item.count || 0),
                            0
                          )}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-xl border border-cc-border bg-black/[0.08] p-3 shadow-[0_3px_0_#20241C,inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors duration-200 hover:bg-black/[0.16]">
                        <p className="text-[11px] cc-muted">Most frequent</p>
                        <p
                          className="mt-1 truncate text-sm font-semibold cc-text"
                          title={
                            recoveryActionsSummary
                              .slice()
                              .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))[0]?.action || "—"
                          }
                        >
                          {recoveryActionsSummary
                            .slice()
                            .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))[0]?.action || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={recoveryActionsSummary
                            .slice()
                            .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
                            .slice(0, 6)}
                          layout="vertical"
                          margin={{ top: 6, right: 24, bottom: 4, left: 4 }}
                          barCategoryGap="24%"
                        >
                          <CartesianGrid
                            horizontal={false}
                            stroke="#292D24"
                            strokeDasharray="3 5"
                          />

                          <XAxis
                            type="number"
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#92968F", fontSize: 10 }}
                            tickMargin={9}
                          />

                          <YAxis
                            type="category"
                            dataKey="action"
                            width={150}
                            interval={0}
                            axisLine={false}
                            tickLine={false}
                            tick={({ x, y, payload }) => {
                              const words = String(payload.value || "").split(/\s+/);
                              const lines = [];
                              let currentLine = "";

                              words.forEach((word) => {
                                const candidate = currentLine
                                  ? `${currentLine} ${word}`
                                  : word;

                                if (candidate.length > 19 && currentLine) {
                                  lines.push(currentLine);
                                  currentLine = word;
                                } else {
                                  currentLine = candidate;
                                }
                              });

                              if (currentLine) lines.push(currentLine);

                              const visibleLines = lines.slice(0, 2);

                              return (
                                <text
                                  x={x - 8}
                                  y={y}
                                  fill="#C5C9BF"
                                  fontSize={10}
                                  textAnchor="end"
                                  dominantBaseline="central"
                                >
                                  {visibleLines.map((line, index) => (
                                    <tspan
                                      key={`${line}-${index}`}
                                      x={x - 8}
                                      dy={
                                        index === 0
                                          ? visibleLines.length > 1
                                            ? "-0.35em"
                                            : "0"
                                          : "1.15em"
                                      }
                                    >
                                      {line}
                                    </tspan>
                                  ))}
                                </text>
                              );
                            }}
                          />

                          <Tooltip
                            cursor={{ fill: "#FFFFFF", fillOpacity: 0.035 }}
                            contentStyle={{
                              backgroundColor: "var(--cc-panel)",
                              border: "1px solid #414638",
                              borderRadius: "10px",
                              color: "var(--cc-text)",
                              fontSize: "12px",
                              padding: "10px 12px",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                            }}
                            labelStyle={{
                              color: "var(--cc-text)",
                              fontWeight: 600,
                              marginBottom: "4px",
                            }}
                            formatter={(value) => [value, "Recorded actions"]}
                          />

                          <Bar
                            dataKey="count"
                            name="Recorded actions"
                            fill="#35D07F"
                            radius={[0, 5, 5, 0]}
                            maxBarSize={26}
                            minPointSize={2}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-cc-border pt-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#35D07F] shadow-[0_0_8px_rgba(53,208,127,0.35)]" />
                        <p className="text-[11px] cc-muted">
                          Recovery actions
                        </p>
                      </div>
                      <p className="text-right text-[11px] cc-muted">
                        Ranked by frequency
                      </p>
                    </div>

                    {recoveryActionsSummary.length > 6 && (
                      <p className="mt-3 text-[11px] cc-muted">
                        Showing the top 6 actions by frequency.
                      </p>
                    )}
                  </div>
                )}
              </article>


            </div>
          </section>

          {/* //chaos control */}
          <section
            id="chaos-control"
            className="dashboard-chaos-only scroll-mt-8 space-y-8 rounded-2xl border border-cc-border bg-[var(--cc-bg)] p-5 cc-text sm:p-8"
          >
            {/* choas heading */}

            <div className="group/chaos relative isolate overflow-hidden rounded-2xl border border-[#414638] bg-gradient-to-br from-[#1B2018] via-[#141813] to-[#0D0F0D] p-5 shadow-[0_2px_0_#414638,0_6px_0_#292D24,0_13px_0_#191D16,0_24px_38px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-300 hover:border-[#59614A] sm:p-7 lg:p-8">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/70 to-[#A78BFA]/35" />
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#A78BFA]/[0.055] blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-[#DEED00]/[0.035] blur-3xl" />

              <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-2.5 rounded-lg border border-[#59614A] bg-gradient-to-b from-[#292F20] to-[#191D15] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-[#DEED00] shadow-[0_2px_0_#080A07,0_5px_10px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.07)] sm:text-[11px]">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#DEED00]/50" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#DEED00] shadow-[0_0_8px_rgba(222,237,0,0.35)]" />
                      </span>
                      Controlled Experiments
                    </span>

                    <span
                      className={`rounded-lg border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider shadow-[0_2px_0_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] sm:text-[11px] ${chaosRunning
                        ? "border-[#F5B942]/35 bg-gradient-to-b from-[#3A3020] to-[#211C14] text-[#F5B942]"
                        : chaosError
                          ? "border-[#FF5C5C]/35 bg-gradient-to-b from-[#392020] to-[#211313] text-[#FF7777]"
                          : chaosResult
                            ? "border-[#35D07F]/30 bg-gradient-to-b from-[#1D3426] to-[#142219] text-[#52D991]"
                            : "border-[#414638] bg-gradient-to-b from-[#24291E] to-[#171A13] text-[#AEB2A7]"
                        }`}
                    >
                      {chaosRunning
                        ? "Recovery in progress"
                        : chaosError
                          ? "Experiment failed"
                          : chaosResult
                            ? "Recovery verified"
                            : "Armed / Ready"}
                    </span>
                  </div>

                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[#F0F1EB] sm:text-3xl">
                    Chaos Control Center
                  </h3>

                  <p className="mt-2 max-w-2xl text-xs leading-6 text-[#A0A498] sm:text-sm">
                    Trigger controlled failures and observe real-time automatic
                    recovery orchestration across HealCart services.
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-[#414638] bg-gradient-to-b from-[#22271C] to-[#151811] px-4 py-3 shadow-[0_2px_0_#414638,0_5px_0_#171A13,0_10px_18px_rgba(0,0,0,0.23),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#59614A]">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_10px_rgba(53,208,127,0.15)] ${chaosRunning
                      ? "animate-pulse bg-[#F5B942] shadow-[0_0_10px_rgba(245,185,66,0.3)]"
                      : chaosError
                        ? "bg-[#FF5C5C] shadow-[0_0_10px_rgba(255,92,92,0.3)]"
                        : "bg-[#35D07F] shadow-[0_0_10px_rgba(53,208,127,0.3)]"
                      }`}
                  />
                  <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-[#C5C9BF] sm:text-[10px]">
                    {chaosRunning
                      ? "Executing"
                      : chaosError
                        ? "Attention required"
                        : "Control plane ready"}
                  </span>
                </div>
              </div>

              <div className="relative z-10 mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
                {[
                  {
                    label: "Experiment state",
                    value: chaosRunning
                      ? "Running"
                      : chaosError
                        ? "Failed"
                        : chaosResult
                          ? "Verified"
                          : "Standby",
                    color: chaosRunning
                      ? "text-[#F5B942]"
                      : chaosError
                        ? "text-[#FF7777]"
                        : chaosResult
                          ? "text-[#52D991]"
                          : "text-[#DEED00]",
                    accent: chaosRunning
                      ? "#F5B942"
                      : chaosError
                        ? "#FF5C5C"
                        : chaosResult
                          ? "#35D07F"
                          : "#DEED00",
                  },
                  {
                    label: "Backend coordination",
                    value: coordinationEnabled ? "Enabled" : "Disabled",
                    color: coordinationEnabled ? "text-[#52D991]" : "text-[#92968F]",
                    accent: coordinationEnabled ? "#35D07F" : "#59614A",
                  },
                  {
                    label: "Traffic configuration",
                    value: `${trafficRate} req/s · ${trafficConcurrency} clients`,
                    color: "text-[#DEED00]",
                    accent: "#DEED00",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="group/stat relative isolate overflow-hidden rounded-xl border border-[#34392D] bg-gradient-to-br from-[#20241B] via-[#171B14] to-[#111410] p-4 shadow-[0_2px_0_#414638,0_5px_0_#25291F,0_10px_18px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.055)] transition-all duration-300 hover:-translate-y-1 hover:border-[#59614A] hover:shadow-[0_2px_0_#59614A,0_7px_0_#25291F,0_14px_22px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-5"
                  >
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${item.accent}, transparent)`,
                      }}
                    />

                    <div
                      className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-[0.045] blur-2xl transition-opacity duration-300 group-hover/stat:opacity-[0.12]"
                      style={{ backgroundColor: item.accent }}
                    />

                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: item.accent,
                            boxShadow: `0 0 8px ${item.accent}55`,
                          }}
                        />
                        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.13em] text-[#92968F] sm:text-[10px]">
                          {item.label}
                        </p>
                      </div>

                      <p
                        className={`mt-3 break-words text-base font-semibold tracking-tight sm:text-lg ${item.color}`}
                      >
                        {item.value}
                      </p>

                      <div className="mt-4 h-[2px] overflow-hidden rounded-full bg-[#30352C]">
                        <div
                          className="h-full w-1/3 rounded-full opacity-80 transition-all duration-500 group-hover/stat:w-2/3"
                          style={{
                            background: `linear-gradient(90deg, transparent, ${item.accent})`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              {/* Backend Crash */}

              <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-cc-border bg-[linear-gradient(145deg,#1D2119_0%,#151811_55%,#11140F_100%)] p-6 shadow-[0_2px_0_rgba(255,255,255,0.025)_inset,0_3px_0_#090B08,0_12px_28px_rgba(0,0,0,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-[#414638] hover:shadow-[0_2px_0_rgba(255,255,255,0.04)_inset,0_4px_0_#090B08,0_18px_36px_rgba(0,0,0,0.32)] sm:p-8">
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/50 to-transparent" />

                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#DEED00]">                      Fault Injection 01
                    </p>

                    <h4 className="mt-3 flex items-center gap-3 text-lg font-semibold tracking-tight cc-text">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--cc-red)]/20 bg-[var(--cc-red)]/[0.08] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_3px_0_rgba(0,0,0,0.2)]">
                        <Power size={20} className="cc-red" />
                      </span>
                      Backend Crash
                    </h4>
                  </div>

                  <span
                    className={`shrink-0 rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${chaosRunning
                      ? "border-[var(--cc-amber)]/30 bg-[var(--cc-amber)]/10 text-cc-amber"
                      : chaosError
                        ? "border-[var(--cc-red)]/30 bg-[var(--cc-red)]/10 cc-red"
                        : chaosResult
                          ? "border-[var(--cc-green)]/30 bg-[var(--cc-green)]/10 text-cc-green"
                          : "border-[var(--cc-border)] bg-[var(--cc-surface)] cc-muted"
                      }`}
                  >
                    {chaosRunning
                      ? "Recovering"
                      : chaosError
                        ? "Failed"
                        : chaosResult
                          ? "Verified"
                          : "Standby"}
                  </span>
                </div>

                <p className="mt-5 text-sm leading-6 cc-muted">
                  Crashes the backend container and verifies its automatic restart
                  through the supervisor engine.
                </p>

                <div className="mt-6 rounded-xl border border-cc-border bg-[#11140F] p-5 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset,0_4px_0_rgba(0,0,0,0.18)] transition-colors duration-300 group-hover:border-[#363B2F]">
                  <div className="flex items-start gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--cc-lime)]/15 bg-[var(--cc-lime)]/[0.06]">
                      <MonitorCheck size={18} className="text-cc-lime" />
                    </span>

                    <div className="min-w-0">
                      <p className="text-sm font-medium cc-text">
                        Traffic coordination
                      </p>
                      <p className="mt-1 text-[12px] leading-5 cc-muted">
                        Generate active HTTP requests during container termination.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-cc-border/70 pt-5">
                    <BackendCrashCoordinationControls
                      enabled={coordinationEnabled}
                      onToggle={setCoordinationEnabled}
                      rate={trafficRate}
                      onRateChange={setTrafficRate}
                      concurrency={trafficConcurrency}
                      onConcurrencyChange={setTrafficConcurrency}
                      limits={trafficLimits}
                      disabled={chaosRunning}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-xl border border-cc-border bg-[#191D16] p-4 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]">
                  {chaosRunning ? (
                    <RefreshCw
                      size={17}
                      className="mt-0.5 shrink-0 animate-spin text-cc-amber"
                    />
                  ) : (
                    <ShieldCheck
                      size={17}
                      className="mt-0.5 shrink-0 text-cc-green"
                    />
                  )}

                  <p className="text-[11px] leading-5 cc-muted">
                    {chaosRunning
                      ? "Crash triggered. Waiting for automatic recovery..."
                      : "Health monitoring and automatic recovery coordination."}
                  </p>
                </div>

                {chaosResult && (
                  <div className="mt-4 rounded-xl border border-[var(--cc-green)]/25 bg-[var(--cc-green)]/[0.06] p-4 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]">
                    <p className="flex items-start gap-3 text-sm leading-5 text-cc-green">
                      <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                      {chaosResult}
                    </p>
                  </div>
                )}

                {chaosError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-[var(--cc-red)]/25 bg-[var(--cc-red)]/[0.06] p-4 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]"
                  >
                    <p className="flex items-start gap-3 text-sm leading-5 cc-red">
                      <TriangleAlert size={17} className="mt-0.5 shrink-0" />
                      {chaosError}
                    </p>
                  </div>
                )}

                <div className="mt-auto flex flex-col gap-5 border-t border-cc-border pt-5">
                  <BackendCrashTrafficResult
                    response={chaosResponse}
                    coordinationRequested={coordinationEnabled}
                  />

                  <LiveApiTrafficChart />

                  <button
                    type="button"
                    onClick={runBackendCrash}
                    disabled={chaosRunning}
                    className="group/run relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-xl border border-[var(--cc-lime)]/40 bg-[linear-gradient(180deg,#E9F52A_0%,#DEED00_55%,#CBD900_100%)] px-4 py-4 text-sm font-semibold text-[#242700] shadow-[0_2px_0_#899200,0_5px_0_#272B08,0_8px_18px_rgba(0,0,0,0.22),0_1px_0_rgba(255,255,255,0.4)_inset] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_2px_0_#899200,0_6px_0_#272B08,0_12px_22px_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-[0_1px_0_#899200,0_2px_0_#272B08] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    {chaosRunning ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <Zap size={18} />
                    )}
                    {chaosRunning ? "Recovering..." : "Run Crash Test"}
                  </button>
                </div>
              </div>

              {/* Payment Chaos */}

              <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-cc-border bg-[linear-gradient(145deg,#1D2119_0%,#151811_55%,#11140F_100%)] p-6 shadow-[0_2px_0_rgba(255,255,255,0.025)_inset,0_3px_0_#090B08,0_12px_28px_rgba(0,0,0,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-[#414638] hover:shadow-[0_2px_0_rgba(255,255,255,0.04)_inset,0_4px_0_#090B08,0_18px_36px_rgba(0,0,0,0.32)] sm:p-8">
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#E8AC52]/50 to-transparent" />

                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#DEED00]">        Fault Injection 02
                    </p>

                    <h4 className="mt-3 flex items-center gap-3 text-lg font-semibold tracking-tight cc-text">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--cc-amber)]/20 bg-[var(--cc-amber)]/[0.08] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_3px_0_rgba(0,0,0,0.2)]">
                        <CreditCard size={20} className="text-cc-amber" />
                      </span>
                      Payment Chaos
                    </h4>
                  </div>

                  <span
                    className={`shrink-0 rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${paymentRecovery.status === "recovered"
                      ? "border-[var(--cc-green)]/30 bg-[var(--cc-green)]/10 text-cc-green"
                      : paymentRecovery.running
                        ? "border-[var(--cc-amber)]/30 bg-[var(--cc-amber)]/10 text-cc-amber"
                        : "border-[var(--cc-border)] bg-[var(--cc-surface)] cc-muted"
                      }`}
                  >
                    {paymentRecovery.status === "recovered"
                      ? "Reconciled"
                      : paymentRecovery.running
                        ? "Recovering"
                        : "Standby"}
                  </span>
                </div>

                <p className="mt-5 text-sm leading-6 cc-muted">
                  Simulates a payment response timeout after the payment is recorded,
                  allowing HealCart to verify and reconcile the transaction.
                </p>

                <div className="mt-6 rounded-xl border border-cc-border bg-[#11140F] p-5 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset,0_4px_0_rgba(0,0,0,0.18)] transition-colors duration-300 group-hover:border-[#363B2F]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] cc-muted">
                      Automated recovery stage trace
                    </p>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cc-amber shadow-[0_0_8px_rgba(232,172,82,0.4)]" />
                  </div>

                  {paymentRecovery.running ||
                    paymentRecovery.status === "recovered" ? (
                    <div className="mt-5 space-y-2">
                      {paymentRecovery.stages.map((s, i) => (
                        <div
                          key={i}
                          className="relative flex items-start gap-4 overflow-hidden rounded-xl border border-cc-border bg-[linear-gradient(135deg,#1C2019_0%,#171A14_100%)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset,0_3px_0_rgba(0,0,0,0.16)] transition-all duration-200 hover:border-[#414638] hover:bg-[#1D2119]"
                        >
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${s.status === "recovered"
                              ? "border-[var(--cc-green)]/20 bg-[var(--cc-green)]/[0.07]"
                              : s.status === "error"
                                ? "border-[var(--cc-red)]/20 bg-[var(--cc-red)]/[0.07]"
                                : "border-[var(--cc-amber)]/20 bg-[var(--cc-amber)]/[0.07]"
                              }`}
                          >
                            {s.status === "recovered" ? (
                              <CheckCircle2
                                size={16}
                                className="text-cc-green"
                              />
                            ) : s.status === "error" ? (
                              <TriangleAlert
                                size={16}
                                className="cc-red"
                              />
                            ) : (
                              <RefreshCw
                                size={16}
                                className="animate-spin text-cc-amber"
                              />
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] leading-5 cc-muted">
                              {s.message}
                            </p>
                            <p className="mt-2 font-mono text-[10px] cc-muted">
                              {new Date(s.t).toLocaleTimeString()}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${s.status === "recovered"
                              ? "border-[var(--cc-green)]/20 bg-[var(--cc-green)]/[0.06] text-cc-green"
                              : s.status === "error"
                                ? "border-[var(--cc-red)]/20 bg-[var(--cc-red)]/[0.06] cc-red"
                                : "border-[var(--cc-amber)]/20 bg-[var(--cc-amber)]/[0.06] text-cc-amber"
                              }`}
                          >
                            {s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 flex items-center gap-4 rounded-xl border border-cc-border bg-[linear-gradient(135deg,#1C2019_0%,#171A14_100%)] p-5 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset,0_3px_0_rgba(0,0,0,0.16)]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cc-border bg-[#11140F]">
                        <Clock3 size={18} className="cc-muted" />
                      </span>
                      <p className="text-[12px] leading-5 cc-muted">
                        No active recovery trace. Inject payment chaos to begin an
                        experiment.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <PaymentChaosRecoveryChart
                    recovery={paymentRecovery}
                    incidents={incidents}
                  />
                </div>

                {paymentChaosMessage && (
                  <p
                    role="status"
                    className="mt-4 rounded-xl border border-[var(--cc-amber)]/25 bg-[var(--cc-amber)]/[0.06] p-4 text-sm leading-5 text-cc-amber shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]"
                  >
                    {paymentChaosMessage}
                  </p>
                )}

                {paymentRecovery.status === "recovered" && (
                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--cc-green)]/25 bg-[var(--cc-green)]/[0.06] p-4 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]">
                    <ShieldCheck size={18} className="shrink-0 text-cc-green" />
                    <p className="text-sm leading-5 text-cc-green">
                      Recovery complete — no duplicate order or payment was created.
                    </p>
                  </div>
                )}

                <div className="mt-auto flex flex-col gap-5 border-t border-cc-border pt-5">
                  <button
                    type="button"
                    onClick={injectPaymentChaos}
                    disabled={chaosRunning || paymentChaosLoading}
                    className="group/run relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-xl border border-[var(--cc-lime)]/40 bg-[linear-gradient(180deg,#E9F52A_0%,#DEED00_55%,#CBD900_100%)] px-4 py-4 text-sm font-semibold text-[#242700] shadow-[0_2px_0_#899200,0_5px_0_#272B08,0_8px_18px_rgba(0,0,0,0.22),0_1px_0_rgba(255,255,255,0.4)_inset] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_2px_0_#899200,0_6px_0_#272B08,0_12px_22px_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-[0_1px_0_#899200,0_2px_0_#272B08] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    {paymentChaosLoading ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <TriangleAlert size={18} />
                    )}
                    {paymentChaosLoading ? "Activating..." : "Inject Payment Chaos"}
                  </button>
                </div>
              </div>

            </div>
            
<div className="grid grid-cols-1 items-stretch gap-8 xl:grid-cols-2">
  {/* Last-Item Race Condition */}
  <div className="min-w-0 h-full">
    <LastItemRaceChart
      raceRun={raceRun}
      showSections={showRaceSections}
      onInject={createLastItemRace}
      injectRunning={racePreparing}
    />
  </div>

  {/* Offline Checkout Recovery */}
  <div className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-cc-border bg-gradient-to-br from-[#20241B] via-[#171A14] to-[#11130F] p-6 shadow-[0_2px_0_#090A08,0_8px_0_#0D0F0B,0_16px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.055)] transition-all duration-300 hover:-translate-y-1 hover:border-[#555C35] hover:shadow-[0_3px_0_#090A08,0_10px_0_#0D0F0B,0_22px_38px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-8">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/70 to-transparent" />

    <div className="flex items-start justify-between gap-5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#DEED00]">
          Fault Injection 04 · Connectivity
        </p>

        <h4 className="mt-3 flex items-center gap-3 text-lg font-semibold tracking-tight text-[#F3F4F1]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D5E52A]/20 bg-gradient-to-br from-[#DDEB28]/15 to-[#A5B900]/[0.04] text-[#DEED00] shadow-[0_3px_0_#0A0C08,0_7px_14px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <WifiOff size={20} />
          </span>
          Offline Checkout Recovery
        </h4>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#A7ACA0]">
          HealCart saves checkout drafts locally in IndexedDB while offline and
          resumes synchronization when connectivity returns. Drafts can be
          recovered on the Checkout page without losing entered details or cart
          lines.
        </p>
      </div>

      <span
        className={`shrink-0 rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ${getOfflineStatusClass(checkoutRecoveryEvidence?.status, offlineCheckoutFault)}`}
      >
        {getOfflineStatusText(checkoutRecoveryEvidence?.status, offlineCheckoutFault)}
      </span>
    </div>

    <div className="mt-6 min-w-0 rounded-xl border border-[#30352A] bg-[#10120E]/80 p-3 shadow-[inset_0_2px_7px_rgba(0,0,0,0.28),0_1px_0_rgba(255,255,255,0.025)] sm:p-4">
      <CheckoutRecoveryChart
        evidence={checkoutRecoveryEvidence}
        draftMeta={checkoutDraftMeta}
        showSections={injectRecoveryClicked}
      />
    </div>

    <div className="mt-auto flex flex-col gap-5 border-t border-[#30352A] pt-5">
      <button
        type="button"
        disabled={wifiFailureRunning}
        onClick={async () => {
          setWifiFailureRunning(true);
          try {
            const response = await fetch("http://127.0.0.1:5004/inject", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ durationSeconds: 5 }),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
              throw new Error(
                result.message || "Could not inject the Wi-Fi failure."
              );
            }

            setInjectRecoveryClicked(true);
            localStorage.setItem("shcomCheckoutTestArmed", "on");

            const current = (() => {
              try {
                return JSON.parse(
                  localStorage.getItem("shcomCheckoutRecoveryEvidence") || "{}"
                );
              } catch {
                return {};
              }
            })();

            localStorage.setItem(
              "shcomCheckoutRecoveryEvidence",
              JSON.stringify({
                ...current,
                status: "failure-injected",
                failureInjectedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                completedAt: null,
                restoredAt: null,
                connectionRestoredAt: null,
                fieldsRestored: null,
                cartLinesRestored: null,
                discardedAt: null,
              })
            );

            setOfflineCheckoutFault(true);
            setCheckoutRecoveryEvidence(
              JSON.parse(
                localStorage.getItem("shcomCheckoutRecoveryEvidence") ||
                  "null"
              )
            );
          } catch {
          } finally {
            setWifiFailureRunning(false);
          }
        }}
        className="group/button relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-[#E6F45B]/60 bg-gradient-to-b from-[#EFFA38] via-[#DEED00] to-[#B9C900] px-4 py-4 text-sm font-bold text-[#242700] shadow-[0_3px_0_#7E8900,0_6px_0_#424900,0_10px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_4px_0_#7E8900,0_8px_0_#424900,0_14px_24px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.7)] active:translate-y-1 active:shadow-[0_1px_0_#7E8900,0_3px_0_#424900,inset_0_2px_4px_rgba(0,0,0,0.12)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent opacity-70" />

        <span className="relative flex items-center gap-3">
          {wifiFailureRunning ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <WifiOff size={18} />
          )}
          {wifiFailureRunning
            ? "Injecting Wi-Fi Failure..."
            : "Inject Offline Failure"}
        </span>
      </button>
    </div>
  </div>
</div>

          </section>


          {/* Experiments */}
          
<div className="dashboard-chaos-only relative mt-8 overflow-hidden rounded-3xl border border-cc-border bg-gradient-to-br from-[#20241B] via-[#171A14] to-[#11130F] p-6 shadow-[0_3px_0_#090A08,0_9px_0_#0D0F0B,0_18px_36px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-8">
  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/60 to-transparent" />

  <div className="flex flex-wrap items-center justify-between gap-6">
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#DEED00]">
        Recovery Records
      </p>
      <h4 className="text-lg font-semibold tracking-tight text-[#F3F4F1]">
        Experiment History
      </h4>
      <p className="mt-1 text-sm leading-5 text-[#92968F]">
        Recorded outcomes of completed recovery experiments.
      </p>
    </div>

    <span className="inline-flex items-center gap-2 rounded-xl border border-[#414638] bg-[#11130F] px-4 py-2 font-mono text-xs text-[#D8DCD1] shadow-[inset_0_2px_5px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.04)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#DEED00] shadow-[0_0_8px_rgba(222,237,0,0.45)]" />
      {experimentHistory.length} recorded
    </span>
  </div>

  {experimentStatusError && (
    <p className="mt-5 rounded-xl border border-[#F87171]/20 bg-[#F87171]/[0.06] px-4 py-3 text-sm text-cc-red">
      {experimentStatusError}
    </p>
  )}

  {!experimentStatusError && experimentHistory.length === 0 && (
    <div className="mt-6 rounded-2xl border border-dashed border-[#414638] bg-[#11130F]/70 px-5 py-10 text-center shadow-[inset_0_2px_8px_rgba(0,0,0,0.2)]">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#414638] bg-[#20241B] text-[#92968F] shadow-[0_3px_0_#090A08,0_6px_12px_rgba(0,0,0,0.2)]">
        <Activity size={20} />
      </div>
      <p className="mt-4 text-sm font-medium text-[#D8DCD1]">
        No experiment results recorded yet.
      </p>
      <p className="mt-1 text-xs text-[#92968F]">
        Completed experiment outcomes will appear here.
      </p>
    </div>
  )}

  {experimentHistory.length > 0 && (
    <>
      <div className="mt-6 space-y-4">
        {(showAllExperiments
          ? experimentHistory.slice().reverse()
          : experimentHistory.slice().reverse().slice(0, 5)
        ).map((experiment) => (
          <div
            key={experiment.id}
            className="group/item relative overflow-hidden rounded-2xl border border-[#30352A] bg-gradient-to-br from-[#22261D] to-[#171A14] p-5 shadow-[0_2px_0_#0A0C08,0_6px_0_#10120D,0_10px_20px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#505741] hover:shadow-[0_3px_0_#0A0C08,0_8px_0_#10120D,0_14px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6"
          >
            <div className="pointer-events-none absolute inset-y-4 left-0 w-[2px] rounded-r-full bg-[#DEED00]/50 opacity-60 transition-opacity group-hover/item:opacity-100" />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                {(experiment.scenario || "Unknown scenario")
                  .replaceAll("-", " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              </p>

              <span
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  experiment.status === "passed"
                    ? "border-[var(--cc-green)]/20 bg-[var(--cc-green)]/10 text-cc-green"
                    : experiment.status === "stopped"
                      ? "border-[var(--cc-amber)]/20 bg-[var(--cc-amber)]/10 text-cc-amber"
                      : "border-[var(--cc-red)]/20 bg-[var(--cc-red)]/10 text-cc-red"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    experiment.status === "passed"
                      ? "bg-cc-green"
                      : experiment.status === "stopped"
                        ? "bg-cc-amber"
                        : "bg-cc-red"
                  }`}
                />
                {experiment.status || "Unknown"}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#B0B5A9]">
              {experiment.message || "No details recorded."}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#30352A] pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#777D70]">
                Completed
              </span>
              <span className="text-[11px] text-[#A7ACA0]">
                {experiment.completedAt
                  ? new Date(experiment.completedAt).toLocaleString()
                  : "Time unavailable"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {experimentHistory.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAllExperiments((previous) => !previous)}
          className="group/button relative mt-6 inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-[#DDEB28]/50 bg-gradient-to-b from-[#EAF52E] via-[#DEED00] to-[#B9C900] px-4 py-3.5 text-sm font-bold text-[#242700] shadow-[0_3px_0_#7E8900,0_6px_0_#424900,0_10px_18px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_4px_0_#7E8900,0_8px_0_#424900,0_14px_22px_rgba(0,0,0,0.3)] active:translate-y-0.5 active:shadow-[0_1px_0_#7E8900,0_3px_0_#424900]"
        >
          {showAllExperiments
            ? "Show less"
            : `View all ${experimentHistory.length} experiments`}
          <span className="text-base transition-transform duration-200 group-hover/button:translate-y-0.5">
            {showAllExperiments ? "↑" : "↓"}
          </span>
        </button>
      )}
    </>
  )}
</div>

          {/* Recovery Event Timeline */}

          <section className="dashboard-incidents-only scroll-mt-8 relative isolate overflow-hidden rounded-3xl border border-[#414638] bg-gradient-to-br from-[#191D16] via-[#121510] to-[#0D0F0D] p-5 shadow-[0_2px_0_#414638,0_7px_0_#25291F,0_16px_0_#171A14,0_28px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-300 hover:border-[#59614A] sm:p-7 lg:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/70 to-[#A78BFA]/30" />
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#A78BFA]/[0.055] blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-[#35D07F]/[0.045] blur-3xl" />

            <div className="relative z-10 mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-[#59614A] bg-gradient-to-b from-[#303724] to-[#1B2016] text-[#DEED00] shadow-[0_2px_0_#0A0C09,0_4px_8px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <Activity size={13} strokeWidth={1.8} />
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A8B65A]">
                    System Activity
                  </p>
                </div>

                <h3 className="text-lg font-semibold tracking-tight text-[#F0F1EB] sm:text-xl">
                  Recovery Event Timeline
                </h3>

                <p className="mt-1.5 max-w-xl text-xs leading-5 text-[#92968F] sm:text-sm">
                  Live backend crash and MongoDB connection recovery events.
                </p>
              </div>

              <div className="group/total relative shrink-0 overflow-hidden rounded-xl border border-[#414638] bg-gradient-to-br from-[#24291E] to-[#151811] px-4 py-3 shadow-[0_2px_0_#414638,0_5px_0_#20241A,0_10px_18px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#69774A]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/60 to-transparent" />
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#92968F]">
                  Total events
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-[#F0F1EB]">
                    {recoveryInfo?.events?.length || 0}
                  </p>
                  <span className="text-[9px] font-medium uppercase tracking-wider text-[#A8B65A]">
                    Recorded
                  </span>
                </div>
              </div>
            </div>

            {!recoveryInfo ? (
              <div className="relative z-10 flex min-h-[180px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-[#34392D] bg-gradient-to-br from-[#191D16] to-[#10120F] p-6 text-center shadow-[0_2px_0_#30352C,0_6px_0_#171A14,inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#414638] bg-gradient-to-b from-[#252A1F] to-[#171A13] text-[#A8B65A] shadow-[0_3px_0_#080A07,0_8px_15px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.07)]">
                  <Activity size={20} strokeWidth={1.6} />
                </div>
                <p className="text-sm font-medium text-[#E5E7DF]">
                  Connecting to recovery monitor
                </p>
                <p className="mt-1 text-xs text-[#92968F]">
                  Waiting for recovery events...
                </p>
              </div>
            ) : !recoveryInfo.events?.length ? (
              <div className="relative z-10 flex min-h-[180px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#414638] bg-gradient-to-br from-[#191D16]/80 to-[#10120F] p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#414638] bg-gradient-to-b from-[#252A1F] to-[#171A13] text-[#92968F] shadow-[0_3px_0_#080A07,0_8px_15px_rgba(0,0,0,0.22)]">
                  <Activity size={20} strokeWidth={1.6} />
                </div>
                <p className="text-sm font-medium text-[#E5E7DF]">
                  No recovery events recorded
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-[#92968F]">
                  New backend and database recovery events will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="relative z-10">
                <div className="space-y-3">
                  {recoveryInfo.events
                    .slice()
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, showAllRecoveryEvents ? undefined : 5)
                    .map((event, index) => {
                      const isFailure =
                        event.type === "crash" ||
                        event.type === "database-disconnected";

                      const eventTitle = event.type
                        .split("-")
                        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(" ");

                      return (
                        <article
                          key={`${event.timestamp}-${event.type}-${index}`}
                          className="group/event relative isolate overflow-hidden rounded-2xl border border-[#34392D] bg-gradient-to-br from-[#1B2018] via-[#151912] to-[#10120F] p-4 shadow-[0_2px_0_#414638,0_5px_0_#25291F,0_10px_20px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.055)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#59614A] hover:shadow-[0_2px_0_#59614A,0_7px_0_#25291F,0_15px_25px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-5"
                        >
                          <div
                            className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${isFailure
                              ? "bg-gradient-to-b from-[#F5B942] via-[#D9A441] to-[#8D692F]"
                              : "bg-gradient-to-b from-[#70E6A2] via-[#35D07F] to-[#218B56]"
                              }`}
                          />

                          <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                          <div
                            className={`pointer-events-none absolute -right-12 -top-16 h-32 w-32 rounded-full blur-3xl ${isFailure
                              ? "bg-[#F5B942]/[0.045]"
                              : "bg-[#35D07F]/[0.045]"
                              }`}
                          />

                          <div className="relative flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-[0_2px_0_rgba(0,0,0,0.3),0_5px_10px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.07)] transition-transform duration-300 group-hover/event:-translate-y-0.5 ${isFailure
                                  ? "border-[#8D692F]/50 bg-gradient-to-b from-[#3A3020] to-[#211C14] text-[#F5B942]"
                                  : "border-[#35D07F]/25 bg-gradient-to-b from-[#1D3426] to-[#142219] text-[#52D991]"
                                  }`}
                              >
                                {isFailure ? (
                                  <AlertTriangle size={17} strokeWidth={1.8} />
                                ) : (
                                  <CheckCircle2 size={17} strokeWidth={1.8} />
                                )}
                              </div>

                              <div className="min-w-0 pt-0.5">
                                <h4 className="break-words text-sm font-semibold tracking-tight text-[#F0F1EB] sm:text-[15px]">
                                  {eventTitle}
                                </h4>
                                <p
                                  className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] ${isFailure ? "text-[#D9A441]" : "text-[#52C989]"
                                    }`}
                                >
                                  {isFailure ? "Service incident" : "Recovery event"}
                                </p>
                              </div>
                            </div>

                            <time className="shrink-0 pt-1 text-[10px] leading-4 text-[#92968F] sm:text-[11px]">
                              {new Date(event.timestamp).toLocaleString()}
                            </time>
                          </div>

                          <p className="relative mt-4 border-t border-[#34392D]/80 pt-3 text-xs leading-5 text-[#AEB2A7] sm:ml-[52px] sm:text-[13px]">
                            {event.message}
                          </p>
                        </article>
                      );
                    })}
                </div>

                {recoveryInfo.events.length > 5 && (
                  <div className="mt-5 flex flex-col items-center gap-2 border-t border-[#34392D] pt-5">
                    <p className="text-[11px] text-[#92968F]">
                      {showAllRecoveryEvents
                        ? `Showing all ${recoveryInfo.events.length} recovery events`
                        : `${recoveryInfo.events.length - 5} more events available`}
                    </p>

                    <button
                      type="button"
                      onClick={() => setShowAllRecoveryEvents((previous) => !previous)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#59614A] bg-gradient-to-b from-[#292F21] to-[#1A1F15] px-4 py-2.5 text-xs font-semibold text-[#D8E2C8] shadow-[0_2px_0_#414638,0_5px_0_#141710,0_9px_15px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7A875E] hover:from-[#343C28] hover:to-[#22291B] hover:shadow-[0_3px_0_#414638,0_7px_0_#141710,0_12px_18px_rgba(0,0,0,0.25)] active:translate-y-0 active:shadow-[0_1px_0_#141710]"
                    >
                      {showAllRecoveryEvents ? (
                        <>
                          <ChevronUp size={15} />
                          Show fewer events
                        </>
                      ) : (
                        <>
                          <ChevronDown size={15} />
                          View all events
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>


          <footer className="border-t border-cc-border pt-6 text-[11px] cc-muted">
            HealCart · Self-Healing Commerce
          </footer>
        </div>
      </main>
    </div>
  );
}
export default Dashboard;
