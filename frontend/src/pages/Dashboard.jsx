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
} from "lucide-react";

function getOfflineStatusClass(status, offlineCheckoutFault) {
  if (
    status === "failure-detected" ||
    status === "failure-injected" ||
    status === "fault-triggered"
  ) {
    return "border-[#F5B942]/30 bg-[#F5B942]/10 text-[#F5B942]";
  }
  if (status === "connection-restored" || status === "data-restored") {
    return "border-[#F5B942]/30 bg-[#F5B942]/10 text-[#F5B942]";
  }
  if (status === "checkout-completed") {
    return "border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F]";
  }
  if (status === "draft-discarded") {
    return "border-[#FF5C5C]/30 bg-[#FF5C5C]/10 text-[#FF5C5C]";
  }
  if (offlineCheckoutFault) {
    return "border-[#F5B942]/30 bg-[#F5B942]/10 text-[#F5B942]";
  }
  return "border-[#41452F] bg-[#202319] text-[#C8CBAA]";
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
      color: "bg-[#FF5C5C]",
    },
    {
      label: "High",
      count: incidents.filter((i) => i.severity === "high").length,
      color: "bg-orange-500",
    },
    {
      label: "Medium",
      count: incidents.filter((i) => i.severity === "medium").length,
      color: "bg-[#F5B942]",
    },
    {
      label: "Low",
      count: incidents.filter((i) => i.severity === "low").length,
      color: "bg-[#E5F500]",
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
    <div data-dashboard-page={page} className="min-h-screen bg-[#080908] text-[#F3F4F1]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        [data-dashboard-page="chaos-center"] {
          --cc-bg:#0b0f0b;--cc-surface:#101410;--cc-panel:#191d18;--cc-raised:#1c211c;
          --cc-border:#32372f;--cc-muted:#a0a493;--cc-text:#e0e4dc;--cc-lime:#deed00;
          --cc-green:#4ae08d;--cc-amber:#f5b942;background:var(--cc-bg);color:var(--cc-text);
          font-family:Inter,sans-serif;
        }
        [data-dashboard-page="chaos-center"] .dashboard-content {
          padding:1.5rem clamp(1rem,2.5vw,2.5rem) 2.5rem;
          background-image:linear-gradient(to right,rgba(71,72,50,.12) 1px,transparent 1px),linear-gradient(to bottom,rgba(71,72,50,.12) 1px,transparent 1px);
          background-size:44px 44px;
        }
        [data-dashboard-page="chaos-center"] #chaos-control {padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
        [data-dashboard-page="chaos-center"] #chaos-control>p:first-child {
          display:flex;align-items:center;gap:.55rem;color:var(--cc-lime);font:600 11px/1.4 "JetBrains Mono",monospace;letter-spacing:.16em;text-transform:uppercase
        }
        [data-dashboard-page="chaos-center"] #chaos-control>p:first-child:before {content:"◈";font-size:14px}
        [data-dashboard-page="chaos-center"] #chaos-control>h3 {margin-top:.55rem;font-size:clamp(1.65rem,2.4vw,2.15rem);line-height:1.15;letter-spacing:-.045em;font-weight:650}
        [data-dashboard-page="chaos-center"] #chaos-control>p:nth-of-type(2) {max-width:46rem;font-size:13px;line-height:1.65;color:var(--cc-muted)}
        [data-dashboard-page="chaos-center"] #chaos-control>.mt-5,
        [data-dashboard-page="chaos-center"] #chaos-control>.mt-6,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 {
          min-width:0;border:1px solid var(--cc-border);border-radius:13px;background:rgba(25,29,24,.97);box-shadow:0 16px 40px rgba(0,0,0,.16)
        }
        [data-dashboard-page="chaos-center"] #chaos-control>.mt-5 {position:relative;overflow:hidden;padding:1rem 1.25rem;background:rgba(11,15,11,.9)}
        [data-dashboard-page="chaos-center"] #chaos-control>.mt-5:before {content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,var(--cc-lime),transparent);opacity:.8}
        [data-dashboard-page="chaos-center"] #chaos-control h4,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 h4 {font-size:17px;line-height:1.45;letter-spacing:-.02em;font-weight:600;color:var(--cc-text)}
        [data-dashboard-page="chaos-center"] #chaos-control p,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 p {line-height:1.65}
        [data-dashboard-page="chaos-center"] #chaos-control .text-\[\#92968F\],
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 .text-\[\#92968F\] {color:var(--cc-muted)}
        [data-dashboard-page="chaos-center"] #chaos-control button,
        [data-dashboard-page="chaos-center"] #chaos-control a,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 button,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 a {
          border-radius:6px;transition:background-color .18s,border-color .18s,color .18s,transform .18s
        }
        [data-dashboard-page="chaos-center"] #chaos-control button:hover:not(:disabled),
        [data-dashboard-page="chaos-center"] #chaos-control a:hover,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 button:hover:not(:disabled),
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 a:hover {filter:brightness(1.12);transform:translateY(-1px)}
        [data-dashboard-page="chaos-center"] #chaos-control button:focus-visible,
        [data-dashboard-page="chaos-center"] #chaos-control a:focus-visible {outline:2px solid var(--cc-lime);outline-offset:3px}
        [data-dashboard-page="chaos-center"] #chaos-control .btn-primary {background:var(--cc-lime);color:#242700;box-shadow:0 0 16px rgba(222,237,0,.14)}
        [data-dashboard-page="chaos-center"] #chaos-control .btn-secondary,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 .btn-secondary {border:1px solid var(--cc-border);background:#20241f;color:var(--cc-text)}
        [data-dashboard-page="chaos-center"] #chaos-control .rounded-xl.border,
        [data-dashboard-page="chaos-center"] #chaos-control .rounded-2xl.border,
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 .rounded-xl.border {border-color:var(--cc-border)}
        [data-dashboard-page="chaos-center"] #chaos-control .bg-\[\#0D0F0D\],
        [data-dashboard-page="chaos-center"] #chaos-control .bg-\[\#171917\],
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 .bg-\[\#171917\] {background-color:#101410}
        [data-dashboard-page="chaos-center"] #chaos-control .text-\[\#E5F500\] {color:var(--cc-lime)}
        [data-dashboard-page="chaos-center"] #chaos-control .text-\[\#35D07F\] {color:var(--cc-green)}
        [data-dashboard-page="chaos-center"] #chaos-control .text-\[\#F5B942\] {color:var(--cc-amber)}
        [data-dashboard-page="chaos-center"] #chaos-control .font-mono,
        [data-dashboard-page="chaos-center"] #chaos-control .font-mono * {font-family:"JetBrains Mono",monospace}
        [data-dashboard-page="chaos-center"] #chaos-control .mt-6.rounded-2xl.border {padding:clamp(1rem,2vw,1.5rem)}
        [data-dashboard-page="chaos-center"] #chaos-control .grid>div.rounded-xl,
        [data-dashboard-page="chaos-center"] #chaos-control .grid>div.rounded-2xl {border-radius:8px;background:#101410}
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 {margin-top:1.5rem;padding:clamp(1rem,2vw,1.5rem)}
        [data-dashboard-page="chaos-center"] .dashboard-chaos-only.mt-6 .space-y-3>div {border-radius:8px;background:#101410}
        @media(max-width:640px) {
          [data-dashboard-page="chaos-center"] .dashboard-content {padding:1rem .75rem 2rem}
          [data-dashboard-page="chaos-center"] #chaos-control>.mt-6 {padding:1rem}
        }
        [data-dashboard-page="overview"] .dashboard-incidents-only,
        [data-dashboard-page="overview"] .dashboard-chaos-only,
        [data-dashboard-page="incidents"] .dashboard-overview-only,
        [data-dashboard-page="incidents"] .dashboard-chaos-only,
        [data-dashboard-page="chaos-center"] .dashboard-overview-only,
        [data-dashboard-page="chaos-center"] .dashboard-incidents-only {
          display: none !important;
        }
      `}</style>
      <main className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-container-high px-6 py-5 lg:px-10 bg-[rgba(11,15,11,0.8)] backdrop-blur-md sticky top-0 z-20">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary-fixed">
              HealCart / Operations
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-on-surface">
              {page === "incidents" ? "Incidents" : page === "chaos-center" ? "Chaos Center" : "System Overview"}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {page === "incidents" ? "Incident history, diagnosis and recovery outcomes" : page === "chaos-center" ? "Run controlled failures and verify self-healing behavior" : "Live service health and recovery overview"}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[#92968F]">
              {lastChecked
                ? `Last checked: ${lastChecked}`
                : "Waiting for first health check"}
            </span>
            <button
              onClick={refreshAllStatuses}
              disabled={checking}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#272A26] px-3 py-2 text-xs text-[#F3F4F1] hover:bg-[#171917] disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                size={14}
                className={checking ? "animate-spin" : ""}
              />
              {checking ? "Checking..." : "Refresh status"}
            </button>
          </div>
        </header>
        <div className="dashboard-content space-y-8 p-6 lg:p-10">
          <section id="overview" className="dashboard-overview-only scroll-mt-6 overflow-hidden rounded-[2rem] border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-6 lg:p-8 shadow-xl shadow-black/20">
            <div className="relative overflow-hidden rounded-[1.5rem] bg-surface-container-lowest/80 backdrop-blur-sm border border-surface-container-high p-6 lg:p-8 mb-8 shadow-lg shadow-black/10">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4 max-w-3xl">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary-fixed/10 text-primary-fixed shrink-0 shadow-[0_0_12px_rgba(222,237,0,0.25)]">
                    <Activity size={26} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                      Welcome to <span className="font-editorial-accent italic text-primary-fixed font-normal">HealCart</span> <span className="font-editorial-accent italic text-primary-fixed font-normal">Operations</span>
                    </h3>
                    <p className="font-body-default text-body-default text-on-surface-variant leading-relaxed">
                      Track service availability, investigate incidents, and understand how HealCart responds to failures. Service status is retrieved directly from your running backend telemetry stream and recovery monitor.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 self-start md:self-auto bg-surface-container-low/60 backdrop-blur-md px-4 py-3 rounded-xl border border-surface-container-high">
                  <div className="flex flex-col">
                    <span className="font-code-xs text-code-xs text-outline uppercase tracking-wider">Topology Health</span>
                    <span className="font-status-pill text-status-pill text-secondary flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_6px_rgba(74,224,141,0.8)]"></span>
                      ALL SYSTEMS NOMINAL
                    </span>
                  </div>
                  <div className="h-6 w-px bg-surface-container-highest mx-3"></div>
                  <div className="flex flex-col">
                    <span className="font-code-xs text-code-xs text-outline uppercase tracking-wider">Mesh Ingress</span>
                    <span className="font-code-xs text-code-xs text-primary-fixed mt-0.5 font-semibold">1,420 req/s</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section id="service-health" className="dashboard-overview-only scroll-mt-6 overflow-hidden rounded-[2rem] border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-6 lg:p-8 shadow-xl shadow-black/20">
            <div className="mb-4">
              <h3 className="text-lg font-semibold tracking-tight text-[#F3F4F1]">
                Service Health
              </h3>
              <p className="mt-1 text-xs leading-5 text-[#92968F]">
                Live backend, database and recovery-monitor status.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {services.map(({ name, detail, icon: Icon, status }) => (
                <article
                  key={name}
                  className="rounded-[1.5rem] border border-surface-container-high bg-surface-container-low/80 backdrop-blur-md p-6 shadow-lg shadow-black/20 transition-all hover:border-primary-fixed/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="rounded-lg bg-surface-container-low p-2.5 border border-surface-container-high/50 text-primary-fixed">
                      <Icon size={19} />
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${status === "Healthy" || status === "Connected"
                        ? "border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F]"
                        : status === "Unavailable" ||
                          status === "Disconnected" ||
                          status === "Degraded"
                          ? "border-[#FF5C5C]/30 bg-[#FF5C5C]/10 text-[#FF5C5C]"
                          : "border-[#272A26] text-[#F3F4F1]"}`}
                    >
                      {status}
                    </span>
                  </div>
                  <h4 className="mt-6 font-semibold text-[#F3F4F1]">{name}</h4>
                  <p className="mt-1 text-xs leading-5 text-[#92968F]">{detail}</p>
            {name === "Recovery Monitor" && recoveryInfo && (
              <div className="mt-5 space-y-2 border-t border-surface-container-high pt-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-[#92968F]">Container</span>
                  <span className="text-[#F3F4F1]">
                    {recoveryInfo.container}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[#92968F]">Docker status</span>
                  <span className="text-[#F3F4F1]">
                    {recoveryInfo.status}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[#92968F]">Restart count</span>
                  <span className="text-[#F3F4F1]">
                    {recoveryInfo.restartCount ?? "Unknown"}
                  </span>
                </div>
              </div>
            )}
            {name === "Recovery Monitor" && recoveryError && (
              <p className="mt-3 text-xs text-[#FF5C5C]">
                {recoveryError}
              </p>
            )}
          </article>
              ))}
            </div>
          </section>
          <div className="dashboard-overview-only">
            <div className="rounded-[1.5rem] border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-6 lg:p-8 shadow-lg shadow-black/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-fixed"></span>
                  <h2 className="text-lg font-semibold tracking-tight text-on-surface">Service Topology &amp; Heartbeat Mesh</h2>
                  <span className="font-code-xs text-code-xs uppercase text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">AUTO-RESOLVED</span>
                </div>
                <div className="flex items-center gap-3 text-on-surface-variant font-code-xs text-code-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>Direct Pipeline
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed"></span>Daemon Sync
                  </span>
                  <span className="text-outline">Heartbeat: 1000ms</span>
                </div>
              </div>
              <ServiceDependencyMap
                health={health}
                paymentHealth={paymentHealth}
                recoveryInfo={recoveryInfo}
                recoveryError={recoveryError}
                healthError={healthError}
                paymentHealthError={paymentHealthError}
              />
            </div>
          </div>
          <section id="recovery-metrics" className="dashboard-overview-only scroll-mt-6 overflow-hidden rounded-[2rem] border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-6 lg:p-8 shadow-xl shadow-black/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-fixed"></span>
                <h2 className="text-lg font-semibold tracking-tight text-on-surface">Recovery Metrics</h2>
              </div>
              <p className="text-xs leading-5 text-[#92968F]">
                Recovery metrics calculated from real incidents recorded by HealCart.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-4">
                <p className="text-[9px] uppercase tracking-[0.12em] text-[#92968F]">Drafts saved locally</p>
                <p className="mt-2 text-lg font-semibold text-[#F3F4F1]">{checkoutDraftMeta?.fields ?? 0}</p>
                <p className="mt-1 text-[10px] text-[#85897B]">IndexedDB checkout drafts</p>
              </div>
              <div className="rounded-lg border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-4">
                <p className="text-[9px] uppercase tracking-[0.12em] text-[#92968F]">Synchronization attempts</p>
                <p className="mt-2 text-lg font-semibold text-[#F3F4F1]">Not available</p>
                <p className="mt-1 text-[10px] text-[#85897B]">Not tracked by offline recovery</p>
              </div>
              <div className="rounded-lg border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-4">
                <p className="text-[9px] uppercase tracking-[0.12em] text-[#92968F]">Successfully recovered</p>
                <p className="mt-2 text-lg font-semibold text-[#35D07F]">{checkoutRecoveryEvidence?.status === "checkout-completed" ? 1 : 0}</p>
                <p className="mt-1 text-[10px] text-[#85897B]">Completed checkouts after recovery</p>
              </div>
              <div className="rounded-lg border border-surface-container-high bg-surface-container-low/60 backdrop-blur-md p-4">
                <p className="text-[9px] uppercase tracking-[0.12em] text-[#92968F]">Pending / failed recoveries</p>
                <p className="mt-2 text-lg font-semibold text-[#F5B942]">
                  {checkoutRecoveryEvidence?.status === "failure-detected" ||
                  checkoutRecoveryEvidence?.status === "failure-injected" ||
                  checkoutRecoveryEvidence?.status === "data-restored"
                    ? 1
                    : 0}
                </p>
                <p className="mt-1 text-[10px] text-[#85897B]">Not yet resolved or discarded</p>
              </div>
            </div>
          </section>
          <div className="dashboard-incidents-only">
            <IncidentTimeline
              events={Array.isArray(recoveryInfo?.events) ? recoveryInfo.events : []}
              incidents={paymentIncidents}
              loading={timelineLoading}
              error={timelineError}
              stale={timelineStale}
              lastUpdated={timelineLastUpdated}
            />
          </div>
          <section
            id="incidents"
            className="dashboard-incidents-only scroll-mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6"
          >
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[#F3F4F1]">
                  Incident Log
                </h3>
                <p className="mt-1 text-xs leading-5 text-[#92968F]">
                  Real incidents recorded by the HealCart backend.
                </p>
              </div>
              {/* Incident Filters */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                    Severity
                  </label>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="w-full rounded-xl border border-[#272A26] bg-[#0D0F0D] px-3 py-2.5 text-xs text-[#F3F4F1] outline-none focus:border-[#E5F500] input-field"
                  >
                    <option value="all">All Severities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-xl border border-[#272A26] bg-[#0D0F0D] px-3 py-2.5 text-xs text-[#F3F4F1] outline-none focus:border-[#E5F500] input-field"
                  >
                    <option value="all">All Statuses</option>
                    <option value="detected">Detected</option>
                    <option value="recovering">Recovering</option>
                    <option value="resolved">Resolved</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                    Incident Type
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full rounded-xl border border-[#272A26] bg-[#0D0F0D] px-3 py-2.5 text-xs text-[#F3F4F1] outline-none focus:border-[#E5F500] input-field"
                  >
                    <option value="all">All Incident Types</option>
                    {[...new Set(
                      incidents
                        .map((incident) => incident.incidentType?.toLowerCase())
                        .filter(Boolean)
                    )].map((type) => (
                      <option key={type} value={type}>
                        {type
                          .split("_")
                          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                          .join(" ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <span className="rounded-full bg-[#171917] px-3 py-1 text-sm text-[#F3F4F1]">
                {incidents.length} incidents
              </span>
            </div>
            {incidentsError ? (
              <p className="rounded-xl border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 p-4 text-sm text-[#FF5C5C]">
                {incidentsError}
              </p>
            ) : incidents.length === 0 ? (
              <div className="rounded-xl border border-[#272A26] p-8 text-center">
                <AlertTriangle className="mx-auto mb-3 text-[#92968F]" size={28} />
                <p className="text-[#F3F4F1]">No incidents recorded.</p>
                <p className="mt-1 text-sm text-[#92968F]">
                  New incidents will appear here when recorded by the backend.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredIncidents.map((incident) => (
                  <article
                    key={incident._id}
                    className="rounded-xl border border-[#272A26] bg-[#0D0F0D] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-[#F3F4F1]">
                          {incident.message || incident.incidentType}
                        </h4>
                        <p className="mt-1 text-sm text-[#92968F]">
                          {incident.service} · {incident.incidentType}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#171917] px-2.5 py-1 text-xs text-[#F3F4F1]">
                          {incident.severity}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${incident.status === "resolved"
                            ? "bg-[#35D07F]/10 text-[#35D07F]"
                            : incident.status === "failed"
                              ? "bg-[#FF5C5C]/10 text-[#FF5C5C]"
                              : "bg-[#F5B942]/10 text-[#F5B942]"
                            }`}
                        >
                          {incident.status}
                        </span>
                      </div>
                    </div>
                    {incident.recoveryAction && (
                      <p className="mt-4 text-sm text-[#F3F4F1]">
                        <span className="text-[#92968F]">Recovery action: </span>
                        {incident.recoveryAction}
                      </p>
                    )}
                    {incident.recoveryResult && (
                      <p className="mt-2 text-sm text-[#F3F4F1]">
                        <span className="text-[#92968F]">Result: </span>
                        {incident.recoveryResult}
                      </p>
                    )}
                    <div className="mt-5 border-t border-[#272A26] pt-4">
                      <h5 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#92968F]">
                        Recovery Timeline
                      </h5>
                      <div className="space-y-4">
                        {/* Stage 1: Incident detection */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <CheckCircle2 size={18} className="text-[#E5F500]" />
                            <div className="mt-2 h-full min-h-5 w-px bg-[#272A26]" />
                          </div>
                          <div className="pb-2">
                            <p className="text-sm font-medium text-[#F3F4F1]">
                              Incident Detected
                            </p>
                            <p className="mt-1 text-xs text-[#92968F]">
                              {incident.detectedAt
                                ? new Date(incident.detectedAt).toLocaleString()
                                : "Detection time unavailable"}
                            </p>
                          </div>
                        </div>
                        {/* Stage 2: Recovery action */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            {incident.recoveryAction ? (
                              <CheckCircle2 size={18} className="text-[#E5F500]" />
                            ) : (
                              <Activity size={18} className="text-[#92968F]" />
                            )}
                            <div className="mt-2 h-full min-h-5 w-px bg-[#272A26]" />
                          </div>
                          <div className="pb-2">
                            <p className="text-sm font-medium text-[#F3F4F1]">
                              Recovery Action
                            </p>
                            <p className="mt-1 text-xs text-[#92968F]">
                              {incident.recoveryAction || "No recovery action recorded"}
                            </p>
                          </div>
                        </div>
                        {/* Stage 3: Final outcome */}
                        <div className="flex gap-3">
                          <div>
                            {incident.status === "resolved" ? (
                              <CheckCircle2 size={18} className="text-[#35D07F]" />
                            ) : incident.status === "failed" ? (
                              <AlertTriangle size={18} className="text-[#FF5C5C]" />
                            ) : (
                              <Activity size={18} className="text-[#F5B942]" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#F3F4F1]">
                              {incident.status === "resolved"
                                ? "Recovery Resolved"
                                : incident.status === "failed"
                                  ? "Recovery Failed"
                                  : incident.status === "recovering"
                                    ? "Recovery In Progress"
                                    : "Awaiting Recovery"}
                            </p>
                            <p className="mt-1 text-xs text-[#92968F]">
                              {incident.resolvedAt
                                ? new Date(incident.resolvedAt).toLocaleString()
                                : incident.status === "resolved"
                                  ? "Resolution time unavailable"
                                  : "No resolution time recorded"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-[#92968F]">
                      Detected:{" "}
                      {incident.detectedAt
                        ? new Date(incident.detectedAt).toLocaleString()
                        : "Timestamp unavailable"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>


          <section
            id="recovery-analytics"
            className="dashboard-incidents-only scroll-mt-6 overflow-hidden rounded-2xl border border-[#292D24] bg-[#0D0F0D] p-4 sm:p-6"
          >
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#E5F500]">
                  Performance Insights / 01
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#F3F4F1]">
                  Recovery Analytics
                </h3>
                <p className="mt-1 text-xs text-[#92968F]">
                  Real incident data · Recovery performance and system resilience
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#292D24] bg-[#141813] px-3 py-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${incidentsAreStale ? "bg-[#F5B942]" : "bg-[#35D07F]"
                    }`}
                />
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#92968F]">
                  {incidentsAreStale ? "Data may be stale" : "Incident metrics"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Total incidents",
                  value: totalIncidents,
                  color: "#E5F500",
                  index: "01",
                },
                {
                  label: "Resolved",
                  value: resolvedIncidents,
                  color: "#35D07F",
                  index: "02",
                },
                {
                  label: "Failed",
                  value: failedIncidents,
                  color: "#FF5C5C",
                  index: "03",
                },
                {
                  label: "Active incidents",
                  value: activeIncidents,
                  color: "#F5B942",
                  index: "04",
                },
              ].map((item) => (
                <article
                  key={item.label}
                  className="group relative overflow-hidden rounded-xl border border-[#292D24] bg-[#141813] p-4 transition-colors duration-200 hover:border-[#414638] sm:p-5"
                >
                  <div className="mb-5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.13em] text-[#92968F]">
                      {item.label}
                    </span>
                    <span className="font-mono text-[10px] text-[#656B60]">
                      {item.index}
                    </span>
                  </div>
                  <div
                    className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl"
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
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#F5B942]/20 bg-[#F5B942]/[0.06] px-3 py-2.5 text-xs text-[#F5B942]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  These are the last figures loaded at{" "}
                  {incidentsUpdatedAtValue || "an earlier time"}. The backend
                  could not be reached, so the numbers may be out of date.
                </span>
              </div>
            ) : incidentsUpdatedAt ? (
              <p className="mt-3 text-[10px] text-[#92968F]">
                Last updated at {incidentsUpdatedAt}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {/* Resolution donut chart */}
              <article className="rounded-xl border border-[#292D24] bg-[#111410] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#F3F4F1]">
                      Resolution Rate
                    </h4>
                    <p className="mt-1 text-[11px] text-[#92968F]">
                      Resolved vs. remaining incidents
                    </p>
                  </div>
                  <span className="rounded-md border border-[#E5F500]/15 bg-[#E5F500]/[0.06] px-2 py-1 text-[10px] text-[#E5F500]">
                    {recoverySuccessRate}%
                  </span>
                </div>

                <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
                  <div className="relative h-[190px] w-full max-w-[240px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Resolved", value: resolvedIncidents },
                            {
                              name: "Unresolved",
                              value: Math.max(totalIncidents - resolvedIncidents, 0),
                            },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={61}
                          outerRadius={83}
                          paddingAngle={totalIncidents > 0 ? 4 : 0}
                          stroke="none"
                          cornerRadius={4}
                        >
                          <Cell fill="#DEED00" />
                          <Cell fill="#292D24" />
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#141813",
                            border: "1px solid #414638",
                            borderRadius: "10px",
                            color: "#F3F4F1",
                            fontSize: "12px",
                          }}
                          itemStyle={{ color: "#E5F500" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-semibold tabular-nums text-[#F3F4F1]">
                        {recoverySuccessRate}%
                      </span>
                      <span className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#92968F]">
                        Resolved
                      </span>
                    </div>
                  </div>

                  <div className="w-full space-y-4">
                    {[
                      {
                        label: "Resolved",
                        value: resolvedIncidents,
                        color: "#DEED00",
                      },
                      {
                        label: "Unresolved",
                        value: Math.max(totalIncidents - resolvedIncidents, 0),
                        color: "#414638",
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[#92968F]">{item.label}</p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-[#F3F4F1]">
                          {item.value}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-[#292D24] pt-3">
                      <p className="text-[10px] leading-5 text-[#92968F]">
                        Share of all recorded incidents currently marked resolved.
                      </p>
                    </div>
                  </div>
                </div>
              </article>

              {/* Severity horizontal bar chart */}
              <article className="rounded-xl border border-[#292D24] bg-[#111410] p-4 sm:p-5">
                <div>
                  <h4 className="text-sm font-semibold text-[#F3F4F1]">
                    Incidents by Severity
                  </h4>
                  <p className="mt-1 text-[11px] text-[#92968F]">
                    Distribution by recorded severity level
                  </p>
                </div>

                <div className="mt-5 h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={incidentsBySeverity}
                      layout="vertical"
                      margin={{ top: 4, right: 20, bottom: 4, left: 0 }}
                      barCategoryGap="35%"
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
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={70}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#C5C9BF", fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ fill: "#292D24", opacity: 0.35 }}
                        contentStyle={{
                          backgroundColor: "#141813",
                          border: "1px solid #414638",
                          borderRadius: "10px",
                          color: "#F3F4F1",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="count" name="Incidents" radius={[0, 5, 5, 0]}>
                        {incidentsBySeverity.map((item) => (
                          <Cell
                            key={item.label}
                            fill={
                              {
                                Critical: "#FF5C5C",
                                High: "#FF8A4C",
                                Medium: "#F5B942",
                                Low: "#DEED00",
                              }[item.label] || "#92968F"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              {/* Incident types donut chart with legend */}
              <article className="rounded-xl border border-[#292D24] bg-[#111410] p-4 sm:p-5">
                <div>
                  <h4 className="text-sm font-semibold text-[#F3F4F1]">
                    Incidents by Type
                  </h4>
                  <p className="mt-1 text-[11px] text-[#92968F]">
                    Which failure categories occur most often
                  </p>
                </div>

                {incidentsByType.length === 0 ? (
                  <div className="flex h-[230px] flex-col items-center justify-center text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#292D24] bg-[#141813] text-[#92968F]">
                      <Activity size={18} />
                    </div>
                    <p className="text-sm text-[#F3F4F1]">No incidents recorded yet</p>
                    <p className="mt-1 text-[11px] text-[#92968F]">
                      Type distribution will appear when data is available.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="relative h-[220px] min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={incidentsByType}
                            dataKey="count"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={54}
                            outerRadius={83}
                            paddingAngle={3}
                            stroke="none"
                            cornerRadius={3}
                          >
                            {incidentsByType.map((item, index) => (
                              <Cell
                                key={item.label}
                                fill={
                                  [
                                    "#DEED00",
                                    "#35D07F",
                                    "#69B7FF",
                                    "#B49AFF",
                                    "#F5B942",
                                    "#FF7E8A",
                                    "#42D6C5",
                                    "#92968F",
                                  ][index % 8]
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#141813",
                              border: "1px solid #414638",
                              borderRadius: "10px",
                              color: "#F3F4F1",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-semibold tabular-nums text-[#F3F4F1]">
                          {totalIncidents}
                        </span>
                        <span className="mt-1 text-[9px] uppercase tracking-wider text-[#92968F]">
                          Total
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[220px] space-y-3 overflow-y-auto pr-1">
                      {incidentsByType.map((item, index) => (
                        <div key={item.label} className="flex items-start gap-2.5">
                          <span
                            className="mt-1 h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: [
                                "#DEED00",
                                "#35D07F",
                                "#69B7FF",
                                "#B49AFF",
                                "#F5B942",
                                "#FF7E8A",
                                "#42D6C5",
                                "#92968F",
                              ][index % 8],
                            }}
                          />
                          <span className="min-w-0 flex-1 break-words text-[11px] leading-4 text-[#B9BDB3]">
                            {item.label}
                          </span>
                          <span className="text-xs font-medium tabular-nums text-[#F3F4F1]">
                            {item.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>


              {/* Recovery actions ranked bar chart */}
              <article className="rounded-xl border border-[#292D24] bg-[#111410] p-4 sm:p-5">
                <div>
                  <h4 className="text-sm font-semibold text-[#F3F4F1]">
                    Recovery Action Summary
                  </h4>
                  <p className="mt-1 text-[11px] text-[#92968F]">
                    Recorded recovery actions, ranked by frequency
                  </p>
                </div>

                {recoveryActionsSummary.length === 0 ? (
                  <div className="flex h-[230px] flex-col items-center justify-center text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#292D24] bg-[#141813] text-[#92968F]">
                      <Activity size={18} />
                    </div>
                    <p className="text-sm text-[#F3F4F1]">
                      No recovery actions recorded yet
                    </p>
                    <p className="mt-1 text-[11px] text-[#92968F]">
                      Recorded actions will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={recoveryActionsSummary
                          .slice()
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 6)}
                        layout="vertical"
                        margin={{ top: 6, right: 16, bottom: 6, left: 4 }}
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

                            return (
                              <text
                                x={x - 8}
                                y={y}
                                fill="#C5C9BF"
                                fontSize={10}
                                textAnchor="end"
                                dominantBaseline="central"
                              >
                                {lines.slice(0, 2).map((line, index) => (
                                  <tspan
                                    key={`${line}-${index}`}
                                    x={x - 8}
                                    dy={
                                      index === 0
                                        ? lines.length > 1
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
                          cursor={{ fill: "#292D24", opacity: 0.35 }}
                          contentStyle={{
                            backgroundColor: "#141813",
                            border: "1px solid #414638",
                            borderRadius: "10px",
                            color: "#F3F4F1",
                            fontSize: "12px",
                          }}
                          labelStyle={{ color: "#F3F4F1" }}
                        />

                        <Bar
                          dataKey="count"
                          name="Recorded actions"
                          fill="#35D07F"
                          radius={[0, 5, 5, 0]}
                          maxBarSize={24}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {recoveryActionsSummary.length > 6 && (
                  <p className="mt-1 text-[10px] text-[#656B60]">
                    Showing the top 6 actions by frequency.
                  </p>
                )}
              </article>

            </div>
          </section>

          {/* //chaos control */}
          <section
            id="chaos-control"
            className="dashboard-chaos-only scroll-mt-6 space-y-6 rounded-xl border border-[#292D24] bg-[#0B0E0B] p-4 text-[#E0E4DC] sm:p-6"
          >
            <div className="relative overflow-hidden rounded-xl border border-[#32372B] bg-[#141813] p-5 sm:p-6">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00] to-transparent" />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded border border-[#42462C] bg-[#24271B] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#DEED00]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#DEED00]" />
                      Controlled Experiments
                    </span>
                    <span
                      className={`rounded border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${chaosRunning
                        ? "border-[#F5B942]/30 bg-[#F5B942]/10 text-[#F5B942]"
                        : chaosError
                          ? "border-[#FF5C5C]/30 bg-[#FF5C5C]/10 text-[#FF7777]"
                          : chaosResult
                            ? "border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F]"
                            : "border-[#41452F] bg-[#202319] text-[#C8CBAA]"
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
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-[#F0F1E9] sm:text-2xl">
                    Chaos Control Center
                  </h3>
                  <p className="mt-2 max-w-2xl text-xs leading-6 text-[#A0A396]">
                    Trigger controlled failures and observe real-time automatic
                    recovery orchestration across HealCart services.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 rounded-lg border border-[#34382B] bg-[#0D100D] px-3 py-2">
                  <span
                    className={`h-2 w-2 rounded-full ${chaosRunning
                      ? "animate-pulse bg-[#F5B942]"
                      : chaosError
                        ? "bg-[#FF5C5C]"
                        : "bg-[#35D07F]"
                      }`}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#B8BBA8]">
                    {chaosRunning
                      ? "Executing"
                      : chaosError
                        ? "Attention required"
                        : "Control plane ready"}
                  </span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                          ? "text-[#35D07F]"
                          : "text-[#DEED00]",
                  },
                  {
                    label: "Backend coordination",
                    value: coordinationEnabled ? "Enabled" : "Disabled",
                    color: coordinationEnabled
                      ? "text-[#35D07F]"
                      : "text-[#A0A396]",
                  },
                  {
                    label: "Traffic configuration",
                    value: `${trafficRate} req/s · ${trafficConcurrency} clients`,
                    color: "text-[#DEED00]",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-[#292D24] bg-[#0D100D] p-3.5"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#85897B]">
                      {item.label}
                    </p>
                    <p className={`mt-2 text-sm font-semibold ${item.color}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {/* Backend Crash */}
              <div className="flex min-w-0 flex-col rounded-xl border border-[#292D24] bg-[#141813] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#DEED00]">
                      Fault Injection 01
                    </p>
                    <h4 className="mt-2 flex items-center gap-2 text-base font-semibold tracking-tight text-[#F0F1E9]">
                      <Power size={20} className="shrink-0 text-[#FF7777]" />
                      Backend Crash
                    </h4>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${chaosRunning
                      ? "border-[#F5B942]/30 bg-[#F5B942]/10 text-[#F5B942]"
                      : chaosError
                        ? "border-[#FF5C5C]/30 bg-[#FF5C5C]/10 text-[#FF7777]"
                        : chaosResult
                          ? "border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F]"
                          : "border-[#41452F] bg-[#202319] text-[#C8CBAA]"
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
                <p className="mt-3 text-xs leading-6 text-[#A0A396]">
                  Crashes the backend container and verifies its automatic restart
                  through the supervisor engine.
                </p>
                <div className="mt-5 rounded-lg border border-[#292D24] bg-[#0C0F0C] p-4">
                  <div className="flex items-start gap-3">
                    <MonitorCheck size={18} className="mt-0.5 shrink-0 text-[#DEED00]" />
                    <div>
                      <p className="text-xs font-medium text-[#E0E4DC]">
                        Traffic coordination
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-[#85897B]">
                        Generate active HTTP requests during container termination.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
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
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#292D24] bg-[#0C0F0C] p-3">
                  {chaosRunning ? (
                    <RefreshCw
                      size={16}
                      className="mt-0.5 shrink-0 animate-spin text-[#F5B942]"
                    />
                  ) : (
                    <ShieldCheck
                      size={16}
                      className="mt-0.5 shrink-0 text-[#35D07F]"
                    />
                  )}
                  <p className="text-[10px] leading-5 text-[#A0A396]">
                    {chaosRunning
                      ? "Crash triggered. Waiting for automatic recovery..."
                      : "Health monitoring and automatic recovery coordination."}
                  </p>
                </div>
                {chaosResult && (
                  <div className="mt-3 rounded-lg border border-[#35D07F]/20 bg-[#35D07F]/[0.06] p-3">
                    <p className="flex items-start gap-2 text-xs leading-5 text-[#35D07F]">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      {chaosResult}
                    </p>
                  </div>
                )}
                {chaosError && (
                  <div
                    role="alert"
                    className="mt-3 rounded-lg border border-[#FF5C5C]/25 bg-[#FF5C5C]/[0.06] p-3"
                  >
                    <p className="flex items-start gap-2 text-xs leading-5 text-[#FF7777]">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                      {chaosError}
                    </p>
                  </div>
                )}
                <div className="mt-auto flex flex-col gap-3 border-t border-[#292D24] pt-5">
                  <BackendCrashTrafficResult
                    response={chaosResponse}
                    coordinationRequested={coordinationEnabled}
                  />
                  <LiveApiTrafficChart />
                  <button
                    type="button"
                    onClick={runBackendCrash}
                    disabled={chaosRunning}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#DEED00]/30 bg-[#DEED00] px-4 py-3 text-xs font-semibold text-[#242700] shadow-[0_0_14px_rgba(222,237,0,0.08)] transition-colors hover:bg-[#EFFA38] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {chaosRunning ? (
                      <RefreshCw size={17} className="animate-spin" />
                    ) : (
                      <Zap size={17} />
                    )}
                    {chaosRunning ? "Recovering..." : "Run Crash Test"}
                  </button>
                </div>
              </div>
              {/* Payment Chaos */}
              <div className="flex min-w-0 flex-col rounded-xl border border-[#292D24] bg-[#141813] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5B942]">
                      Fault Injection 02
                    </p>
                    <h4 className="mt-2 flex items-center gap-2 text-base font-semibold tracking-tight text-[#F0F1E9]">
                      <CreditCard size={20} className="shrink-0 text-[#F5B942]" />
                      Payment Chaos
                    </h4>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${paymentRecovery.status === "recovered"
                      ? "border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F]"
                      : paymentRecovery.running
                        ? "border-[#F5B942]/30 bg-[#F5B942]/10 text-[#F5B942]"
                        : "border-[#41452F] bg-[#202319] text-[#C8CBAA]"
                      }`}
                  >
                    {paymentRecovery.status === "recovered"
                      ? "Reconciled"
                      : paymentRecovery.running
                        ? "Recovering"
                        : "Standby"}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-6 text-[#A0A396]">
                  Simulates a payment response timeout after the payment is recorded,
                  allowing HealCart to verify and reconcile the transaction.
                </p>
                <div className="mt-5 rounded-lg border border-[#292D24] bg-[#0C0F0C] p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#85897B]">
                    Automated recovery stage trace
                  </p>
                  {paymentRecovery.running ||
                    paymentRecovery.status === "recovered" ? (
                    <div className="mt-4 space-y-2">
                      {paymentRecovery.stages.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded-md border border-[#292D24] bg-[#141813] p-3"
                        >
                          {s.status === "recovered" ? (
                            <CheckCircle2
                              size={16}
                              className="mt-0.5 shrink-0 text-[#35D07F]"
                            />
                          ) : s.status === "error" ? (
                            <TriangleAlert
                              size={16}
                              className="mt-0.5 shrink-0 text-[#FF7777]"
                            />
                          ) : (
                            <RefreshCw
                              size={16}
                              className="mt-0.5 shrink-0 animate-spin text-[#F5B942]"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] leading-5 text-[#D7D9CE]">
                              {s.message}
                            </p>
                            <p className="mt-1 font-mono text-[9px] text-[#85897B]">
                              {new Date(s.t).toLocaleTimeString()}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 font-mono text-[9px] uppercase ${s.status === "recovered"
                              ? "text-[#35D07F]"
                              : s.status === "error"
                                ? "text-[#FF7777]"
                                : "text-[#F5B942]"
                              }`}
                          >
                            {s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-3 rounded-md border border-[#292D24] bg-[#141813] p-4">
                      <Clock3 size={18} className="shrink-0 text-[#85897B]" />
                      <p className="text-[11px] leading-5 text-[#85897B]">
                        No active recovery trace. Inject payment chaos to begin an
                        experiment.
                      </p>
                    </div>
                  )}
                </div>
                <PaymentChaosRecoveryChart
                  recovery={paymentRecovery}
                  incidents={incidents}
                />
                {paymentChaosMessage && (
                  <p
                    role="status"
                    className="mt-3 rounded-lg border border-[#F5B942]/20 bg-[#F5B942]/[0.06] p-3 text-xs leading-5 text-[#F5B942]"
                  >
                    {paymentChaosMessage}
                  </p>
                )}
                {paymentRecovery.status === "recovered" && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#35D07F]/20 bg-[#35D07F]/[0.06] p-3">
                    <ShieldCheck size={17} className="shrink-0 text-[#35D07F]" />
                    <p className="text-xs leading-5 text-[#35D07F]">
                      Recovery complete — no duplicate order or payment was created.
                    </p>
                  </div>
                )}
                <div className="mt-auto flex flex-col gap-3 border-t border-[#292D24] pt-5">
                  <button
                    type="button"
                    onClick={injectPaymentChaos}
                    disabled={chaosRunning || paymentChaosLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#DEED00]/30 bg-[#DEED00] px-4 py-3 text-xs font-semibold text-[#242700] shadow-[0_0_14px_rgba(222,237,0,0.08)] transition-colors hover:bg-[#EFFA38] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {paymentChaosLoading ? (
                      <RefreshCw size={17} className="animate-spin" />
                    ) : (
                      <TriangleAlert size={17} />
                    )}
                    {paymentChaosLoading ? "Activating..." : "Inject Payment Chaos"}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {/* Last-Item Race Condition */}
              <LastItemRaceChart
                raceRun={raceRun}
                showSections={showRaceSections}
                onInject={createLastItemRace}
                injectRunning={racePreparing}
              />
              {/* Offline Checkout Recovery */}
              <div className="flex min-w-0 flex-col rounded-xl border border-[#292D24] bg-[#141813] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#DEED00]">
                      Fault Injection 04 · Connectivity
                    </p>
                    <h4 className="mt-2 flex items-center gap-2 text-base font-semibold tracking-tight text-[#F0F1E9]">
                      <WifiOff size={20} className="shrink-0 text-[#F5B942]" />
                      Offline Checkout Recovery
                    </h4>
                    <p className="mt-3 text-xs leading-6 text-[#A0A396]">
                      HealCart saves checkout drafts locally in IndexedDB while
                      offline and resumes synchronization when connectivity
                      returns. Drafts can be recovered on the Checkout page
                      without losing entered details or cart lines.
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${getOfflineStatusClass(checkoutRecoveryEvidence?.status, offlineCheckoutFault)}`}
                  >
                    {getOfflineStatusText(checkoutRecoveryEvidence?.status, offlineCheckoutFault)}
                  </span>
                </div>
                <CheckoutRecoveryChart
                    evidence={checkoutRecoveryEvidence}
                    draftMeta={checkoutDraftMeta}
                    showSections={injectRecoveryClicked}
                />
                <div className="mt-auto flex flex-col gap-3 border-t border-[#292D24] pt-5">
                    <p className="mb-0 text-[10px] leading-5 text-[#85897B]">
                        Open Checkout in another tab and enter test details before starting
                        the experiment. This test temporarily affects internet connectivity
                        for the laptop.
                    </p>
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
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#DEED00]/30 bg-[#DEED00] px-4 py-3 text-xs font-semibold text-[#242700] shadow-[0_0_14px_rgba(222,237,0,0.08)] transition-colors hover:bg-[#EFFA38] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {wifiFailureRunning ? (
                            <RefreshCw size={17} className="animate-spin" />
                        ) : (
                            <WifiOff size={17} />
                        )}
                        {wifiFailureRunning ? "Injecting Wi-Fi Failure..." : "Inject Offline Failure"}
                    </button>
                </div>
              </div>
            </div>
          </section>
          {/* Experiments */}
          <div className="dashboard-chaos-only mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                  Experiment History
                </h4>
                <p className="mt-1 text-xs leading-5 text-[#92968F]">
                  Recorded outcomes of completed recovery experiments.
                </p>
              </div>
              <span className="rounded-full border border-[#272A26] px-3 py-1 text-xs text-[#F3F4F1]">
                {experimentHistory.length} recorded
              </span>
            </div>
            {experimentStatusError && (
              <p className="mt-4 text-xs text-[#FF5C5C]">
                {experimentStatusError}
              </p>
            )}
            {!experimentStatusError && experimentHistory.length === 0 && (
              <p className="mt-4 rounded-xl border border-[#272A26] p-4 text-xs text-[#92968F]">
                No experiment results recorded yet.
              </p>
            )}
            {experimentHistory.length > 0 && (
              <>
                <div className="mt-4 space-y-3">
                  {(showAllExperiments
                    ? experimentHistory.slice().reverse()
                    : experimentHistory.slice().reverse().slice(0, 5)
                  ).map((experiment) => (
                    <div
                      key={experiment.id}
                      className="rounded-xl border border-[#272A26] bg-[#171917] p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium tracking-tight text-[#F3F4F1]">
                          {(experiment.scenario || "Unknown scenario")
                            .replaceAll("-", " ")
                            .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${experiment.status === "passed"
                            ? "bg-[#35D07F]/10 text-[#35D07F]"
                            : experiment.status === "stopped"
                              ? "bg-[#F5B942]/10 text-[#F5B942]"
                              : "bg-[#FF5C5C]/10 text-[#FF5C5C]"
                            }`}
                        >
                          {experiment.status || "Unknown"}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-[#92968F]">
                        {experiment.message || "No details recorded."}
                      </p>
                      <p className="mt-2 text-[10px] text-[#92968F]">
                        Completed:{" "}
                        {experiment.completedAt
                          ? new Date(experiment.completedAt).toLocaleString()
                          : "Time unavailable"}
                      </p>
                    </div>
                  ))}
                </div>
                {experimentHistory.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllExperiments((previous) => !previous)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#34382B] bg-[#171917] px-4 py-3 text-xs font-semibold text-[#DEED00] transition-colors hover:border-[#DEED00]/40 hover:bg-[#20241D]"
                  >
                    {showAllExperiments
                      ? "Show less"
                      : `View all ${experimentHistory.length} experiments`}
                  </button>
                )}
              </>
            )}
          </div>
          <section className="dashboard-incidents-only scroll-mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
            <div className="mb-5">
              <h3 className="text-lg font-semibold tracking-tight text-[#F3F4F1]">
                Recovery Event Timeline
              </h3>
              <p className="mt-1 text-xs leading-5 text-[#92968F]">
                Live backend crash and MongoDB connection recovery events.
              </p>
            </div>
            {!recoveryInfo ? (
              <p className="text-xs text-[#92968F]">
                Waiting for recovery monitor...
              </p>
            ) : !recoveryInfo.events?.length ? (
              <p className="rounded-xl border border-[#272A26] p-5 text-xs text-[#92968F]">
                No recovery events recorded yet. New events will appear here automatically.
              </p>
            ) : (
              <div className="space-y-3">
                {recoveryInfo.events.map((event, index) => (
                  <article
                    key={`${event.timestamp}-${event.type}-${index}`}
                    className="rounded-xl border border-[#272A26] bg-[#171917] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {event.type === "crash" ||
                          event.type === "database-disconnected" ? (
                          <AlertTriangle size={18} className="text-[#F5B942]" />
                        ) : (
                          <CheckCircle2 size={18} className="text-[#35D07F]" />
                        )}
                        <h4 className="text-sm font-medium tracking-tight text-[#F3F4F1]">
                          {event.type
                            .split("-")
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(" ")}
                        </h4>
                      </div>
                      <span className="text-[10px] text-[#92968F]">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#92968F]">
                      {event.message}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
          <footer className="border-t border-[#272A26] pt-6 text-[10px] text-[#92968F]">
            HealCart · Self-Healing Commerce
          </footer>
        </div>
      </main>
    </div>
  );
}
export default Dashboard;
