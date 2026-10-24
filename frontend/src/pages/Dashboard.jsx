
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
} from "lucide-react";

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
  const [wifiFailureMessage, setWifiFailureMessage] = useState("");
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
        setCheckoutRecoveryEvidence(JSON.parse(localStorage.getItem("shcomCheckoutRecoveryEvidence") || "null"));
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

      setIncidents(response.data.incidents || []);
      setIncidentsUpdatedAt(new Date().toLocaleTimeString());
      setIncidentsError("");
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
      color: "bg-red-500",
    },
    {
      label: "High",
      count: incidents.filter((i) => i.severity === "high").length,
      color: "bg-orange-500",
    },
    {
      label: "Medium",
      count: incidents.filter((i) => i.severity === "medium").length,
      color: "bg-amber-400",
    },
    {
      label: "Low",
      count: incidents.filter((i) => i.severity === "low").length,
      color: "bg-cyan-400",
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
    <div data-dashboard-page={page} className="min-h-screen bg-[#090d16] text-slate-100">
      <style>{`
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
        <section className="dashboard-chaos-only mx-6 mt-6 rounded-2xl border border-cyan-900 bg-[#101827] p-5 lg:mx-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white">Offline Checkout Recovery Experiment</h2>
              <p className="mt-1 text-sm text-slate-400">Arm this experiment, fill checkout details, then turn off your device internet. SHCom saves the draft locally, shows an offline screen, and offers recovery when the backend is reachable again.</p>
              <p className="mt-2 text-sm text-slate-300">Status: {offlineCheckoutFault ? "Test armed — waiting for real connectivity loss" : checkoutRecoveryEvidence?.status === "data-restored" ? "Data restored — awaiting customer checkout" : checkoutRecoveryEvidence?.status === "connection-restored" ? "Connection restored — awaiting customer choice" : checkoutRecoveryEvidence?.status === "failure-detected" ? "Failure detected" : checkoutRecoveryEvidence?.status === "checkout-completed" ? "Checkout completed" : checkoutRecoveryEvidence?.status === "draft-discarded" ? "Draft discarded" : "Ready"} · Draft: {checkoutDraftMeta ? `${checkoutDraftMeta.fields || 0} fields, ${checkoutDraftMeta.items || 0} cart lines` : "No saved draft metadata"}</p>
            </div>
            <button
              type="button"
              disabled={wifiFailureRunning}
              onClick={async () => {
                setWifiFailureRunning(true);
                setWifiFailureMessage("");
                try {
                  const response = await fetch("http://127.0.0.1:5004/inject", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ durationSeconds: 5 }),
                  });
                  const result = await response.json();
                  if (!response.ok || !result.success) {
                    throw new Error(result.message || "Could not inject the Wi-Fi failure.");
                  }
                  setWifiFailureMessage("Wi-Fi failure injected. Windows will restore the adapter automatically.");
                  localStorage.setItem("shcomCheckoutTestArmed", "on");
                  const current = (() => { try { return JSON.parse(localStorage.getItem("shcomCheckoutRecoveryEvidence") || "{}"); } catch { return {}; } })();
                  localStorage.setItem("shcomCheckoutRecoveryEvidence", JSON.stringify({
                    ...current,
                    status: "failure-injected",
                    failureInjectedAt: new Date().toISOString(),
                  }));
                  setOfflineCheckoutFault(true);
                  setCheckoutRecoveryEvidence(JSON.parse(localStorage.getItem("shcomCheckoutRecoveryEvidence") || "null"));
                } catch (error) {
                  setWifiFailureMessage(error.message || "Wi-Fi helper is unavailable. Start it as Administrator, then retry.");
                } finally {
                  setWifiFailureRunning(false);
                }
              }}
              className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {wifiFailureRunning ? "Injecting Wi-Fi Failure..." : "Inject Offline Failure "}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Open Checkout in another tab and enter test details before clicking Inject Offline Failure. The local Windows helper disables Wi-Fi for at least 5 seconds, then automatically re-enables it. This affects internet for the whole laptop; it does not stop or crash the SHCom backend.</p>
          {wifiFailureMessage && <p role="status" className="mt-3 text-sm text-cyan-300">{wifiFailureMessage}</p>}
          {(() => {
            const status = checkoutRecoveryEvidence?.status;
            const event = status === "checkout-completed"
              ? { title: "Offline recovery completed", message: "Checkout data was recovered and the order was completed.", at: checkoutRecoveryEvidence?.completedAt }
              : status === "data-restored"
                ? { title: "Checkout data restored", message: `Recovered ${checkoutRecoveryEvidence.fieldsRestored ?? 0} checkout fields and ${checkoutRecoveryEvidence.cartLinesRestored ?? 0} cart lines. Review the details before placing the order.`, at: checkoutRecoveryEvidence?.restoredAt }
                : status === "connection-restored"
                  ? { title: "Connection restored", message: "The saved checkout draft is available. Recover it or discard it on the Checkout page.", at: checkoutRecoveryEvidence?.connectionRestoredAt }
                  : status === "failure-detected" || status === "fault-triggered" || status === "failure-injected"
                    ? { title: "Offline failure detected", message: "SHCom is monitoring connectivity. Checkout progress should be saved on this device.", at: checkoutRecoveryEvidence?.failureDetectedAt || checkoutRecoveryEvidence?.failureInjectedAt }
                    : status === "draft-discarded"
                      ? { title: "Saved draft discarded", message: "The saved checkout draft was discarded. Your cart and confirmed orders are handled separately.", at: checkoutRecoveryEvidence?.discardedAt }
                      : null;
            return (
              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest offline recovery event</p>
                {event ? (
                  <>
                    <p className="mt-2 text-sm font-semibold text-slate-100">{event.title}</p>
                    <p className="mt-1 text-sm text-slate-300">{event.message}</p>
                    {event.at && <p className="mt-2 text-xs text-slate-400">Recorded at {new Date(event.at).toLocaleTimeString()}</p>}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-300">No offline recovery event has been recorded in this browser yet.</p>
                )}
                {checkoutDraftMeta?.savedAt && status !== "checkout-completed" && (
                  <p className="mt-2 text-xs text-slate-400">Last local draft save: {new Date(checkoutDraftMeta.savedAt).toLocaleTimeString()}</p>
                )}
              </div>
            );
          })()}
        </section>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-5 lg:px-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-400">
              SHCom / Operations
            </p>

            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              {page === "incidents" ? "Incidents" : page === "chaos-center" ? "Chaos Center" : "System Overview"}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {page === "incidents" ? "Incident history, diagnosis and recovery outcomes" : page === "chaos-center" ? "Run controlled failures and verify self-healing behavior" : "Live service health and recovery overview"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">
              {lastChecked
                ? `Last checked: ${lastChecked}`
                : "Waiting for first health check"}
            </span>

            <button
              onClick={refreshAllStatuses}
              disabled={checking}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
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
          <section
            id="overview"
            className="dashboard-overview-only scroll-mt-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-[#111c2c] to-[#0d1320] p-6 lg:p-8"
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                <Activity size={25} />
              </div>

              <div className="flex-1">
                <h3 className="text-xl font-semibold">
                  Welcome to SHCom Operations
                </h3>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Track service availability, investigate incidents and
                  understand how SHCom responds to failures. Service
                  status is retrieved from your running backend and
                  recovery monitor.
                </p>
              </div>
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

          <section id="service-health" className="dashboard-overview-only scroll-mt-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Service Health</h3>
              <p className="mt-1 text-sm text-slate-500">
                Live backend, database and recovery-monitor status.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {services.map(({ name, detail, icon: Icon, status }) => (
                <article
                  key={name}
                  className="rounded-2xl border border-slate-800 bg-[#0d1320] p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="rounded-lg bg-slate-800 p-2.5 text-slate-300">
                      <Icon size={19} />
                    </div>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${status === "Healthy" || status === "Connected"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : status === "Unavailable" ||
                          status === "Disconnected" ||
                          status === "Degraded"
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : "border-slate-700 text-slate-300"
                        }`}
                    >
                      {status}
                    </span>
                  </div>

                  <h4 className="mt-5 font-semibold">{name}</h4>
                  <p className="mt-1 text-xs text-slate-500">{detail}</p>

                  {name === "Recovery Monitor" && recoveryInfo && (
                    <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Container</span>
                        <span className="text-slate-300">
                          {recoveryInfo.container}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Docker status</span>
                        <span className="text-slate-300">
                          {recoveryInfo.status}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Restart count</span>
                        <span className="text-slate-300">
                          {recoveryInfo.restartCount ?? "Unknown"}
                        </span>
                      </div>
                    </div>
                  )}

                  {name === "Recovery Monitor" && recoveryError && (
                    <p className="mt-3 text-xs text-red-400">
                      {recoveryError}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>


          <section
            id="incidents"
            className="dashboard-incidents-only scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Incident Log
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Real incidents recorded by the SHCom backend.
                </p>
              </div>

              {/* Incident Filters */}
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Severity
                  </label>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  >
                    <option value="all">All Severities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  >
                    <option value="all">All Statuses</option>
                    <option value="detected">Detected</option>
                    <option value="recovering">Recovering</option>
                    <option value="resolved">Resolved</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Incident Type
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
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


              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                {incidents.length} incidents
              </span>
            </div>

            {incidentsError ? (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                {incidentsError}
              </p>
            ) : incidents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 p-8 text-center">
                <AlertTriangle className="mx-auto mb-3 text-slate-500" size={28} />
                <p className="text-slate-300">No incidents recorded.</p>
                <p className="mt-1 text-sm text-slate-500">
                  New incidents will appear here when recorded by the backend.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredIncidents.map((incident) => (
                  <article
                    key={incident._id}
                    className="rounded-xl border border-slate-800 bg-[#101827] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-white">
                          {incident.message || incident.incidentType}
                        </h4>
                        <p className="mt-1 text-sm text-slate-400">
                          {incident.service} · {incident.incidentType}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                          {incident.severity}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${incident.status === "resolved"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : incident.status === "failed"
                              ? "bg-red-500/10 text-red-300"
                              : "bg-amber-500/10 text-amber-300"
                            }`}
                        >
                          {incident.status}
                        </span>
                      </div>
                    </div>

                    {incident.recoveryAction && (
                      <p className="mt-4 text-sm text-slate-300">
                        <span className="text-slate-500">Recovery action: </span>
                        {incident.recoveryAction}
                      </p>
                    )}

                    {incident.recoveryResult && (
                      <p className="mt-2 text-sm text-slate-300">
                        <span className="text-slate-500">Result: </span>
                        {incident.recoveryResult}
                      </p>
                    )}

                    <div className="mt-5 border-t border-slate-800 pt-4">
                      <h5 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Recovery Timeline
                      </h5>

                      <div className="space-y-4">
                        {/* Stage 1: Incident detection */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <CheckCircle2 size={18} className="text-cyan-400" />
                            <div className="mt-2 h-full min-h-5 w-px bg-slate-700" />
                          </div>

                          <div className="pb-2">
                            <p className="text-sm font-medium text-slate-200">
                              Incident Detected
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
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
                              <CheckCircle2 size={18} className="text-cyan-400" />
                            ) : (
                              <Activity size={18} className="text-slate-500" />
                            )}
                            <div className="mt-2 h-full min-h-5 w-px bg-slate-700" />
                          </div>

                          <div className="pb-2">
                            <p className="text-sm font-medium text-slate-200">
                              Recovery Action
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {incident.recoveryAction || "No recovery action recorded"}
                            </p>
                          </div>
                        </div>

                        {/* Stage 3: Final outcome */}
                        <div className="flex gap-3">
                          <div>
                            {incident.status === "resolved" ? (
                              <CheckCircle2 size={18} className="text-emerald-400" />
                            ) : incident.status === "failed" ? (
                              <AlertTriangle size={18} className="text-red-400" />
                            ) : (
                              <Activity size={18} className="text-amber-400" />
                            )}
                          </div>

                          <div>
                            <p className="text-sm font-medium text-slate-200">
                              {incident.status === "resolved"
                                ? "Recovery Resolved"
                                : incident.status === "failed"
                                  ? "Recovery Failed"
                                  : incident.status === "recovering"
                                    ? "Recovery In Progress"
                                    : "Awaiting Recovery"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
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


                    <p className="mt-3 text-xs text-slate-500">
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
            className="dashboard-incidents-only scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">
                Performance Insights
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Recovery Analytics
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Calculated from real incidents recorded by SHCom.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Total Incidents</p>
                <p className="mt-3 text-3xl font-bold text-white">
                  {totalIncidents}
                </p>
              </article>

              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Resolved</p>
                <p className="mt-3 text-3xl font-bold text-emerald-400">
                  {resolvedIncidents}
                </p>
              </article>

              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Failed</p>
                <p className="mt-3 text-3xl font-bold text-red-400">
                  {failedIncidents}
                </p>
              </article>

              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Active Incidents</p>
                <p className="mt-3 text-3xl font-bold text-amber-400">
                  {activeIncidents}
                </p>
              </article>
            </div>

            {incidentsAreStale ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  These figures are the last ones loaded at{" "}
                  {incidentsUpdatedAtValue || "an earlier time"}. The backend
                  could not be reached, so the numbers may be out of date.
                </span>
              </div>
            ) : incidentsUpdatedAt ? (
              <p className="mt-4 text-xs text-slate-500">
                Last updated at {incidentsUpdatedAt}
              </p>
            ) : null}


            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Resolution Rate */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-white">Resolution Rate</h4>
                  <span className="text-xl font-bold text-cyan-400">
                    {recoverySuccessRate}%
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all"
                    style={{ width: `${recoverySuccessRate}%` }}
                  />
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Percentage of all recorded incidents currently marked resolved.
                </p>
              </div>

              {/* Incidents by Severity */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">
                  Incidents by Severity
                </h4>

                <div className="space-y-4">
                  {incidentsBySeverity.map((item) => (
                    <div key={item.label}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-slate-300">{item.label}</span>
                        <span className="text-slate-400">{item.count}</span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{
                            width: `${totalIncidents > 0
                              ? (item.count / totalIncidents) * 100
                              : 0
                              }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Incidents by Type */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">
                  Incidents by Type
                </h4>

                {incidentsByType.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No incidents recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {incidentsByType.map((item) => (
                      <div key={item.label}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span className="text-slate-300">{item.label}</span>
                          <span className="text-slate-400">{item.count}</span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-violet-400 transition-all"
                            style={{
                              width: `${totalIncidents > 0
                                ? (item.count / totalIncidents) * 100
                                : 0
                                }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recovery Action Summary */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">
                  Recovery Action Summary
                </h4>

                {recoveryActionsSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No recovery actions recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {recoveryActionsSummary.map((item) => (
                      <div key={item.action}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span className="text-slate-300">
                            {item.action}
                          </span>
                          <span className="text-slate-400">
                            {item.count}
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all"
                            style={{
                              width: `${totalIncidents > 0
                                ? (item.count / totalIncidents) * 100
                                : 0
                                }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </section>
          <section
            id="chaos-control"
            className="dashboard-chaos-only scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">
              Controlled Experiments
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              Chaos Control Center
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Trigger controlled failures and observe automatic recovery.
            </p>


            <div className="mt-5 rounded-xl border border-slate-800 bg-[#101827] p-4">
              <p className="text-sm text-slate-400">Experiment Status</p>
              <p className={`mt-2 text-sm font-semibold ${chaosRunning ? "text-amber-400" :
                chaosError ? "text-red-400" :
                  chaosResult ? "text-emerald-400" :
                    "text-slate-300"
                }`}>
                {chaosRunning ? "Recovery in progress..." :
                  chaosError ? "Experiment failed" :
                    chaosResult ? "Recovery verified" :
                      "Ready to run"}
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Backend Crash Recovery</h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Crashes the backend container and verifies its automatic restart.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runBackendCrash}
                  disabled={chaosRunning}
                  className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chaosRunning ? "Recovering..." : "Run Crash Test"}
                </button>
              </div>

              {chaosRunning && (
                <p className="mt-4 text-sm text-amber-400">
                  Crash triggered. Waiting for automatic recovery...
                </p>
              )}

              {chaosResult && (
                <p className="mt-4 text-sm text-emerald-400">{chaosResult}</p>
              )}

              {chaosError && (
                <p className="mt-4 text-sm text-red-400">{chaosError}</p>
              )}

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

              <BackendCrashTrafficResult
                response={chaosResponse}
                coordinationRequested={coordinationEnabled}
              />
            </div>

            <div className="mt-6 rounded-xl border border-amber-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Payment Chaos</h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Simulates a payment response timeout after the payment is recorded,
                    allowing SHCom to verify and reconcile the transaction.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={injectPaymentChaos}
                  disabled={chaosRunning || paymentChaosLoading}
                  className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {paymentChaosLoading ? "Activating..." : "Inject Payment Chaos"}
                </button>
              </div>

              {paymentChaosMessage && (
                <p className="mt-4 text-sm text-amber-300" role="status">
                  {paymentChaosMessage}
                </p>
              )}

              {paymentRecovery.running || paymentRecovery.status === "recovered" ? (
                <div className="mt-4 rounded-xl border border-amber-900/30 bg-amber-900/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
                    Payment Chaos Recovery
                  </p>
                  <p className="text-xs text-amber-200 mb-2">
                    {paymentRecovery.message}
                  </p>
                  <div className="space-y-1">
                    {paymentRecovery.stages.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-[10px]"
                      >
                        <span
                          className={`flex-shrink-0 w-2 h-2 rounded-full mt-1 ${
                            s.status === "recovered"
                              ? "bg-emerald-500"
                              : s.status === "error"
                                ? "bg-red-500"
                                : "bg-amber-500"
                          }`}
                        />
                        <span className="text-amber-100">
                          {new Date(s.t).toLocaleTimeString()} — {s.message}
                        </span>
                      </div>
                    ))}
                  </div>
                  {paymentRecovery.status === "recovered" && (
                    <p className="mt-2 text-xs font-semibold text-emerald-400">
                      Recovery complete — no duplicate order or payment was created.
                    </p>
                  )}
                </div>
              ) : null}
            </div>



            <div className="mt-6 rounded-xl border border-amber-800/60 bg-[#101827] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <h4 className="font-semibold text-white">Last-Item Race Condition</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Inject a controlled checkout timing fault and create a dedicated storefront product with exactly one unit. Open it in two browser sessions, add one unit to each cart, and submit both checkouts close together.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={createLastItemRace}
                  disabled={racePreparing || chaosRunning}
                  className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {racePreparing ? "Injecting..." : "Create Failure"}
                </button>
              </div>

              {raceError && (
                <p role="alert" className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
                  {raceError}
                </p>
              )}

              {raceRun && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-[#0d1320] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{raceRun.product?.name || "Last-Item Race Test"}</p>
                      <p className="mt-1 text-xs text-slate-500">Run ID: {raceRun.runId}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      raceRun.status === "recovered"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : raceRun.status === "failed"
                          ? "bg-red-500/10 text-red-300"
                          : raceRun.status === "recovering"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-cyan-500/10 text-cyan-300"
                    }`}>
                      {raceRun.status === "recovered"
                        ? "Recovery Verified"
                        : raceRun.status === "failed"
                          ? "Verification Failed"
                          : raceRun.status === "recovering"
                            ? "Conflict Detected · Verifying"
                            : "Fault Injected · Ready"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-slate-800 p-3">
                      <p className="text-xs text-slate-500">Initial stock</p>
                      <p className="mt-1 text-xl font-semibold text-white">{raceRun.initialStock ?? 1}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 p-3">
                      <p className="text-xs text-slate-500">Checkout attempts</p>
                      <p className="mt-1 text-xl font-semibold text-white">{raceRun.attemptCount ?? 0} / 2</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 p-3">
                      <p className="text-xs text-slate-500">Reservations accepted</p>
                      <p className="mt-1 text-xl font-semibold text-emerald-300">{raceRun.successfulReservations ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 p-3">
                      <p className="text-xs text-slate-500">Competing attempts rejected</p>
                      <p className="mt-1 text-xl font-semibold text-amber-300">{raceRun.rejectedAttempts ?? 0}</p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-slate-300">{raceRun.message || "Waiting for two customer checkout attempts."}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Current stock: {raceRun.product?.stock ?? "—"} · Verified final stock: {raceRun.stockAfterRecovery ?? "Not verified"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a
                      href="/user#products"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-950/40"
                    >
                      Open Storefront
                    </a>
                    {raceRun.storefrontPath && (
                      <a
                        href={raceRun.storefrontPath}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-cyan-700 px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-950/40"
                      >
                        Open Test Product
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => refreshLastItemRace(raceRun.runId)}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                    >
                      Refresh Result
                    </button>
                  </div>

                  <div className="mt-4 space-y-1 text-xs text-slate-500">
                    <p>Fault injected: {raceRun.faultInjectedAt ? new Date(raceRun.faultInjectedAt).toLocaleString() : "—"}</p>
                    <p>First checkout: {raceRun.firstAttemptAt ? new Date(raceRun.firstAttemptAt).toLocaleString() : "Waiting"}</p>
                    <p>Conflict detected: {raceRun.conflictDetectedAt ? new Date(raceRun.conflictDetectedAt).toLocaleString() : "Waiting"}</p>
                    <p>Recovery verified: {raceRun.verifiedAt ? new Date(raceRun.verifiedAt).toLocaleString() : "Not verified"}</p>
                  </div>
                  {raceRun.status === "ready" && (
                    <p className="mt-4 rounded-lg bg-amber-950/30 p-3 text-sm text-amber-200">
                      Next: open the test product in two separate browser profiles, add one unit to each cart, and submit checkout in both sessions as close together as possible.
                    </p>
                  )}
                </div>
              )}
            </div>

          </section>

          <div className="dashboard-overview-only mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-white">
                  Admin Orders
                </h4>
                <p className="mt-1 text-sm text-slate-400">
                  Read-only view of all orders placed through the Storefront.
                  Payment status reflects the durable backend record, not
                  frontend inference.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchAdminOrders}
                disabled={ordersLoading || ordersRefreshing}
                className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ordersRefreshing ? "Refreshing..." : "Refresh Orders"}
              </button>
            </div>

            {ordersLoading && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#0d1320] p-6 text-center text-slate-400">
                Loading orders...
              </div>
            )}

            {ordersError && !ordersLoading && orders.length === 0 && (
              <div className="mt-4 rounded-lg border border-red-900/30 bg-red-900/10 p-6">
                <p className="text-sm text-red-400">{ordersError}</p>
                <button
                  type="button"
                  onClick={fetchAdminOrders}
                  disabled={ordersLoading || ordersRefreshing}
                  className="mt-3 text-sm text-cyan-400 underline"
                >
                  Try again
                </button>
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length === 0 && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#0d1320] p-6 text-center text-slate-400">
                <p className="text-sm">No orders found.</p>
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                      <th className="pb-3 font-semibold text-slate-300">
                        Order ID
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Date
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Checkout ID
                      </th>
                      <th className="pb-3 font-semibold text-slate-300 text-right">
                        Amount
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Order Status
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Payment Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const paymentStatus =
                        order.paymentStatus || "unknown";
                      const orderStatus = order.orderStatus || "placed";
                      const isPaid =
                        paymentStatus === "paid" && orderStatus === "placed";
                      const isFailed =
                        paymentStatus === "failed" ||
                        orderStatus === "cancelled";

                      return (
                        <tr
                          key={order._id}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition"
                        >
                          <td className="py-3 text-xs font-mono text-slate-200 break-all">
                            {order._id}
                          </td>
                          <td className="py-3 text-xs text-slate-400">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3 text-xs font-mono text-slate-300 break-all">
                            {order.checkoutId || "—"}
                          </td>
                          <td className="py-3 text-xs text-right text-slate-200">
                            ₹{Number(order.totalAmount || 0)
                              .toFixed(2)
                              .toLocaleString("en-IN")}
                          </td>
                          <td className="py-3 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${orderStatus === "placed"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : orderStatus === "processing"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    : orderStatus === "completed"
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}
                            >
                              {orderStatus.charAt(0).toUpperCase() +
                                orderStatus.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isPaid
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : isFailed
                                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                    : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                                }`}
                            >
                              {paymentStatus.charAt(0).toUpperCase() +
                                paymentStatus.slice(1)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">
                  {orders.length} order{orders.length !== 1 ? "s" : ""} total
                </p>
              </div>
            )}
          </div>

          <div className="dashboard-chaos-only">
            <SyntheticTrafficPanel />
          </div>
          <div className="dashboard-chaos-only mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-white">
                  Experiment History
                </h4>
                <p className="mt-1 text-sm text-slate-400">
                  Recorded outcomes of completed recovery experiments.
                </p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                {experimentHistory.length} recorded
              </span>
            </div>

            {experimentStatusError && (
              <p className="mt-4 text-sm text-red-400">
                {experimentStatusError}
              </p>
            )}

            {!experimentStatusError && experimentHistory.length === 0 && (
              <p className="mt-4 rounded-lg border border-slate-800 p-4 text-sm text-slate-400">
                No experiment results recorded yet.
              </p>
            )}

            {experimentHistory.length > 0 && (
              <div className="mt-4 space-y-3">
                {experimentHistory.slice().reverse().map((experiment) => (
                  <div
                    key={experiment.id}
                    className="rounded-lg border border-slate-800 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-white">
                        {(experiment.scenario || "Unknown scenario")
                          .replaceAll("-", " ")
                          .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${experiment.status === "passed"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : experiment.status === "stopped"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                      >
                        {experiment.status || "Unknown"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      {experiment.message || "No details recorded."}
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      Completed:{" "}
                      {experiment.completedAt
                        ? new Date(experiment.completedAt).toLocaleString()
                        : "Time unavailable"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>


          <section className="dashboard-incidents-only scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-white">
                Recovery Event Timeline
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Live backend crash and MongoDB connection recovery events.
              </p>
            </div>

            {!recoveryInfo ? (
              <p className="text-sm text-slate-400">
                Waiting for recovery monitor...
              </p>
            ) : !recoveryInfo.events?.length ? (
              <p className="rounded-xl border border-slate-800 p-5 text-sm text-slate-400">
                No recovery events recorded yet. New events will appear here automatically.
              </p>
            ) : (
              <div className="space-y-3">
                {recoveryInfo.events.map((event, index) => (
                  <article
                    key={`${event.timestamp}-${event.type}-${index}`}
                    className="rounded-xl border border-slate-800 bg-[#101827] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {event.type === "crash" ||
                          event.type === "database-disconnected" ? (
                          <AlertTriangle size={18} className="text-amber-400" />
                        ) : (
                          <CheckCircle2 size={18} className="text-emerald-400" />
                        )}

                        <h4 className="text-sm font-medium text-white">
                          {event.type
                            .split("-")
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(" ")}
                        </h4>
                      </div>

                      <span className="text-xs text-slate-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      {event.message}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>




          <section
            id="recovery-metrics"
            className="dashboard-overview-only scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-400/10 p-2.5 text-violet-300">
                <Workflow size={20} />
              </div>

              <div>
                <h3 className="font-semibold">Recovery Metrics</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Current Docker recovery information.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Backend container</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryInfo?.container ?? "Waiting for data"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Total restarts</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryInfo?.restartCount ?? "Unknown"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Container health</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryInfo?.health ?? "Unknown"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Monitor connection</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryError
                    ? "Unavailable"
                    : recoveryInfo?.available
                      ? "Connected"
                      : "Waiting"}
                </p>
              </div>
            </div>
          </section>

          <footer className="border-t border-slate-800 pt-5 text-xs text-slate-500">
            SHCom · Self-Healing Commerce
          </footer>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
