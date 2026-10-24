
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
        <section className="dashboard-chaos-only mx-6 mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-5 lg:mx-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[#F3F4F1]">Offline Checkout Recovery Experiment</h2>
              <p className="mt-1 text-sm text-[#92968F]">Arm this experiment, fill checkout details, then turn off your device internet. SHCom saves the draft locally, shows an offline screen, and offers recovery when the backend is reachable again.</p>
              <p className="mt-2 text-sm text-[#F3F4F1]">Status: {offlineCheckoutFault ? "Test armed — waiting for real connectivity loss" : checkoutRecoveryEvidence?.status === "data-restored" ? "Data restored — awaiting customer checkout" : checkoutRecoveryEvidence?.status === "connection-restored" ? "Connection restored — awaiting customer choice" : checkoutRecoveryEvidence?.status === "failure-detected" ? "Failure detected" : checkoutRecoveryEvidence?.status === "checkout-completed" ? "Checkout completed" : checkoutRecoveryEvidence?.status === "draft-discarded" ? "Draft discarded" : "Ready"} · Draft: {checkoutDraftMeta ? `${checkoutDraftMeta.fields || 0} fields, ${checkoutDraftMeta.items || 0} cart lines` : "No saved draft metadata"}</p>
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
              className="rounded-xl bg-[#E5F500] px-4 py-3 text-sm font-semibold text-[#080908] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {wifiFailureRunning ? "Injecting Wi-Fi Failure..." : "Inject Offline Failure "}
            </button>
          </div>
          <p className="mt-3 text-xs text-[#92968F]">Open Checkout in another tab and enter test details before clicking Inject Offline Failure. The local Windows helper disables Wi-Fi for at least 5 seconds, then automatically re-enables it. This affects internet for the whole laptop; it does not stop or crash the SHCom backend.</p>
          {wifiFailureMessage && <p role="status" className="mt-3 text-sm text-[#E5F500]">{wifiFailureMessage}</p>}
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
              <div className="mt-4 rounded-lg border border-[#272A26] bg-[#171917]/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#92968F]">Latest offline recovery event</p>
                {event ? (
                  <>
                    <p className="mt-2 text-sm font-semibold text-[#F3F4F1]">{event.title}</p>
                    <p className="mt-1 text-sm text-[#F3F4F1]">{event.message}</p>
                    {event.at && <p className="mt-2 text-xs text-[#92968F]">Recorded at {new Date(event.at).toLocaleTimeString()}</p>}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-[#F3F4F1]">No offline recovery event has been recorded in this browser yet.</p>
                )}
                {checkoutDraftMeta?.savedAt && status !== "checkout-completed" && (
                  <p className="mt-2 text-xs text-[#92968F]">Last local draft save: {new Date(checkoutDraftMeta.savedAt).toLocaleTimeString()}</p>
                )}
              </div>
            );
          })()}
        </section>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#272A26] px-6 py-5 lg:px-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#E5F500]">
              SHCom / Operations
            </p>

            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              {page === "incidents" ? "Incidents" : page === "chaos-center" ? "Chaos Center" : "System Overview"}
            </h2>

            <p className="mt-1 text-sm text-[#92968F]">
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
              className="flex items-center justify-center gap-2 rounded-lg border border-[#272A26] px-3 py-2 text-xs text-[#F3F4F1] hover:bg-[#171917] disabled:opacity-50"
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
            className="dashboard-overview-only scroll-mt-6 rounded-2xl border border-[#272A26] bg-[#080908] p-6 lg:p-8"
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="rounded-xl bg-[#E5F500]/10 p-3 text-[#E5F500]">
                <Activity size={25} />
              </div>

              <div className="flex-1">
            <h3 className="text-xl font-semibold tracking-tight text-[#F3F4F1]">
              Welcome to SHCom Operations
            </h3>

            <p className="mt-2 max-w-2xl text-base leading-7 text-[#92968F]">
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
                  className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="rounded-lg bg-[#171917] p-2.5 text-[#F3F4F1]">
                      <Icon size={19} />
                    </div>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${status === "Healthy" || status === "Connected"
                        ? "border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F]"
                        : status === "Unavailable" ||
                          status === "Disconnected" ||
                          status === "Degraded"
                          ? "border-[#FF5C5C]/30 bg-[#FF5C5C]/10 text-[#FF5C5C]"
                          : "border-[#272A26] text-[#F3F4F1]"
                        }`}
                    >
                      {status}
                    </span>
                  </div>

                  <h4 className="mt-6 font-semibold text-[#F3F4F1]">{name}</h4>
                  <p className="mt-1 text-xs leading-5 text-[#92968F]">{detail}</p>

                  {name === "Recovery Monitor" && recoveryInfo && (
                    <div className="mt-5 space-y-2 border-t border-[#272A26] pt-3 text-xs">
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
                  Real incidents recorded by the SHCom backend.
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
            className="dashboard-incidents-only scroll-mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6"
          >
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-wider text-[#E5F500]">
                Performance Insights
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[#F3F4F1]">
                Recovery Analytics
              </h3>
              <p className="mt-1 text-sm text-[#92968F]">
                Calculated from real incidents recorded by SHCom.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Total Incidents
                </p>
                <p className="mt-4 text-4xl font-bold tabular-nums text-[#F3F4F1]">
                  {totalIncidents}
                </p>
              </article>

              <article className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Resolved
                </p>
                <p className="mt-4 text-4xl font-bold tabular-nums text-[#35D07F]">
                  {resolvedIncidents}
                </p>
              </article>

              <article className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Failed
                </p>
                <p className="mt-4 text-4xl font-bold tabular-nums text-[#FF5C5C]">
                  {failedIncidents}
                </p>
              </article>

              <article className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Active Incidents
                </p>
                <p className="mt-4 text-4xl font-bold tabular-nums text-[#F5B942]">
                  {activeIncidents}
                </p>
              </article>
            </div>

            {incidentsAreStale ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F5B942]/20 bg-[#F5B942]/10 px-3 py-2.5 text-xs text-[#F5B942]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  These figures are the last ones loaded at{" "}
                  {incidentsUpdatedAtValue || "an earlier time"}. The backend
                  could not be reached, so the numbers may be out of date.
                </span>
              </div>
            ) : incidentsUpdatedAt ? (
              <p className="mt-4 text-xs text-[#92968F]">
                Last updated at {incidentsUpdatedAt}
              </p>
            ) : null}


            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Resolution Rate */}
              <div className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                    Resolution Rate
                  </h4>
                  <span className="text-2xl font-bold tabular-nums text-[#E5F500]">
                    {recoverySuccessRate}%
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#272A26]">
                  <div
                    className="h-full rounded-full bg-[#E5F500] transition-all"
                    style={{ width: `${recoverySuccessRate}%` }}
                  />
                </div>

                <p className="mt-3 text-xs leading-5 text-[#92968F]">
                  Percentage of all recorded incidents currently marked resolved.
                </p>
              </div>

              {/* Incidents by Severity */}
              <div className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <h4 className="mb-5 text-base font-semibold tracking-tight text-[#F3F4F1]">
                  Incidents by Severity
                </h4>

                <div className="space-y-4">
                  {incidentsBySeverity.map((item) => (
                    <div key={item.label}>
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="text-[#F3F4F1]">{item.label}</span>
                        <span className="text-xs tabular-nums text-[#92968F]">
                          {item.count}
                        </span>
                      </div>

                      <div className="h-1.5 overflow-hidden rounded-full bg-[#272A26]">
                        <div
                          className="h-full rounded-full bg-[#E5F500] transition-all"
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
              <div className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <h4 className="mb-5 text-base font-semibold tracking-tight text-[#F3F4F1]">
                  Incidents by Type
                </h4>

                {incidentsByType.length === 0 ? (
                  <p className="text-xs text-[#92968F]">
                    No incidents recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {incidentsByType.map((item) => (
                      <div key={item.label}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span className="text-[#F3F4F1]">{item.label}</span>
                          <span className="text-[#92968F]">{item.count}</span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-[#272A26]">
                          <div
                            className="h-full rounded-full bg-[#E5F500] transition-all"
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
              <div className="rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                <h4 className="mb-5 text-base font-semibold tracking-tight text-[#F3F4F1]">
                  Recovery Action Summary
                </h4>

                {recoveryActionsSummary.length === 0 ? (
                  <p className="text-xs text-[#92968F]">
                    No recovery actions recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {recoveryActionsSummary.map((item) => (
                      <div key={item.action}>
                        <div className="mb-2 flex justify-between gap-3 text-xs">
                          <span className="text-[#F3F4F1]">
                            {item.action}
                          </span>
                          <span className="text-xs tabular-nums text-[#92968F]">
                            {item.count}
                          </span>
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-[#272A26]">
                          <div
                            className="h-full rounded-full bg-[#35D07F] transition-all"
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
            className="dashboard-chaos-only scroll-mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-[#E5F500]">
              Controlled Experiments
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[#F3F4F1]">
              Chaos Control Center
            </h3>
            <p className="mt-1 text-sm text-[#92968F]">
              Trigger controlled failures and observe automatic recovery.
            </p>


            <div className="mt-5 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#92968F]">
                Experiment Status
              </p>
              <p className={`mt-2 text-sm font-medium ${chaosRunning ? "text-[#F5B942]" :
                chaosError ? "text-[#FF5C5C]" :
                  chaosResult ? "text-[#35D07F]" :
                    "text-[#F3F4F1]"
                }`}>
                {chaosRunning ? "Recovery in progress..." :
                  chaosError ? "Experiment failed" :
                    chaosResult ? "Recovery verified" :
                      "Ready to run"}
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                    Backend Crash
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-[#92968F]">
                    Crashes the backend container and verifies its automatic restart.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runBackendCrash}
                  disabled={chaosRunning}
                  className="btn-primary px-5 py-2.5 text-xs font-medium disabled:opacity-50"
                >
                  {chaosRunning ? "Recovering..." : "Run Crash Test"}
                </button>
              </div>

              {chaosRunning && (
                <p className="mt-4 text-sm text-[#F5B942]">
                  Crash triggered. Waiting for automatic recovery...
                </p>
              )}

              {chaosResult && (
                <p className="mt-4 text-sm text-[#35D07F]">{chaosResult}</p>
              )}

              {chaosError && (
                <p className="mt-4 text-sm text-[#FF5C5C]">{chaosError}</p>
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

            <div className="mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                    Payment Chaos
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-[#92968F]">
                    Simulates a payment response timeout after the payment is recorded,
                    allowing SHCom to verify and reconcile the transaction.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={injectPaymentChaos}
                  disabled={chaosRunning || paymentChaosLoading}
                  className="btn-secondary px-5 py-2.5 text-xs font-medium disabled:opacity-50"
                >
                  {paymentChaosLoading ? "Activating..." : "Inject Payment Chaos"}
                </button>
              </div>

              {paymentChaosMessage && (
                <p className="mt-4 text-sm text-[#F5B942]" role="status">
                  {paymentChaosMessage}
                </p>
              )}

              {paymentRecovery.running || paymentRecovery.status === "recovered" ? (
                <div className="mt-4 rounded-xl border border-[#F5B942]/30 bg-[#F5B942]/10 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#F5B942] mb-1">
                    Payment Chaos Recovery
                  </p>
                  <p className="text-xs text-[#F5B942] mb-2">
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
                              ? "bg-[#35D07F]"
                              : s.status === "error"
                                ? "bg-[#FF5C5C]"
                                : "bg-[#E5F500]"
                          }`}
                        />
                        <span className="text-[#F5B942]">
                          {new Date(s.t).toLocaleTimeString()} — {s.message}
                        </span>
                      </div>
                    ))}
                  </div>
                  {paymentRecovery.status === "recovered" && (
                    <p className="mt-2 text-xs font-medium text-[#35D07F]">
                      Recovery complete — no duplicate order or payment was created.
                    </p>
                  )}
                </div>
              ) : null}
            </div>



            <div className="mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                    Last-Item Race Condition
                  </h4>
                  <p className="mt-2 text-xs leading-6 text-[#92968F]">
                    Inject a controlled checkout timing fault and create a dedicated storefront product with exactly one unit. Open it in two browser sessions, add one unit to each cart, and submit both checkouts close together.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={createLastItemRace}
                  disabled={racePreparing || chaosRunning}
                  className="btn-primary px-5 py-2.5 text-xs font-medium disabled:opacity-50"
                >
                  {racePreparing ? "Injecting..." : "Create Failure"}
                </button>
              </div>

              {raceError && (
                <p role="alert" className="mt-4 rounded-lg border border-[#FF5C5C]/30 bg-[#FF5C5C]/20 p-3 text-sm text-[#FF5C5C]">
                  {raceError}
                </p>
              )}

              {raceRun && (
                <div className="mt-4 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                        {raceRun.product?.name || "Last-Item Race Test"}
                      </p>
                      <p className="mt-1 text-xs text-[#92968F]">
                        Run ID: {raceRun.runId}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-medium ${
                      raceRun.status === "recovered"
                        ? "bg-[#35D07F]/10 text-[#35D07F]"
                        : raceRun.status === "failed"
                          ? "bg-[#FF5C5C]/10 text-[#FF5C5C]"
                          : raceRun.status === "recovering"
                            ? "bg-[#F5B942]/10 text-[#F5B942]"
                            : "bg-[#E5F500]/10 text-[#E5F500]"
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

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-[#272A26] bg-[#171917] p-4">
                      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                        Initial stock
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-[#F3F4F1]">
                        {raceRun.initialStock ?? 1}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#272A26] bg-[#171917] p-4">
                      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                        Checkout attempts
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-[#F3F4F1]">
                        {raceRun.attemptCount ?? 0} / 2
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#272A26] bg-[#171917] p-4">
                      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                        Reservations accepted
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-[#35D07F]">
                        {raceRun.successfulReservations ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#272A26] bg-[#171917] p-4">
                      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                        Competing attempts rejected
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-[#F5B942]">
                        {raceRun.rejectedAttempts ?? 0}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 text-xs leading-5 text-[#F3F4F1]">
                    {raceRun.message || "Waiting for two customer checkout attempts."}
                  </p>
                  <p className="mt-2 text-[10px] text-[#92968F]">
                    Current stock: {raceRun.product?.stock ?? "—"} · Verified final stock: {raceRun.stockAfterRecovery ?? "Not verified"}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <a
                      href="/user#products"
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary px-4 py-2.5 text-xs font-medium"
                    >
                      Open Storefront
                    </a>
                    {raceRun.storefrontPath && (
                      <a
                        href={raceRun.storefrontPath}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary px-4 py-2.5 text-xs font-medium"
                      >
                        Open Test Product
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => refreshLastItemRace(raceRun.runId)}
                      className="btn-secondary px-4 py-2.5 text-xs font-medium"
                    >
                      Refresh Result
                    </button>
                  </div>

                  <div className="mt-5 space-y-2 text-[10px] text-[#92968F]">
                    <p>Fault injected: {raceRun.faultInjectedAt ? new Date(raceRun.faultInjectedAt).toLocaleString() : "—"}</p>
                    <p>First checkout: {raceRun.firstAttemptAt ? new Date(raceRun.firstAttemptAt).toLocaleString() : "Waiting"}</p>
                    <p>Conflict detected: {raceRun.conflictDetectedAt ? new Date(raceRun.conflictDetectedAt).toLocaleString() : "Waiting"}</p>
                    <p>Recovery verified: {raceRun.verifiedAt ? new Date(raceRun.verifiedAt).toLocaleString() : "Not verified"}</p>
                  </div>
                  {raceRun.status === "ready" && (
                    <p className="mt-5 rounded-xl border border-[#F5B942]/30 bg-[#F5B942]/10 p-4 text-xs text-[#F5B942]">
                      Next: open the test product in two separate browser profiles, add one unit to each cart, and submit checkout in both sessions as close together as possible.
                    </p>
                  )}
                </div>
              )}
            </div>

          </section>

          <div className="dashboard-overview-only mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-semibold tracking-tight text-[#F3F4F1]">
                  Admin Orders
                </h4>
                <p className="mt-1 text-xs leading-5 text-[#92968F]">
                  Read-only view of all orders placed through the Storefront.
                  Payment status reflects the durable backend record, not
                  frontend inference.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchAdminOrders}
                disabled={ordersLoading || ordersRefreshing}
                className="btn-secondary px-4 py-2.5 text-xs font-medium disabled:opacity-50"
              >
                {ordersRefreshing ? "Refreshing..." : "Refresh Orders"}
              </button>
            </div>

            {ordersLoading && (
              <div className="mt-4 rounded-lg border border-[#272A26] bg-[#0D0F0D] p-6 text-center text-[#92968F]">
                Loading orders...
              </div>
            )}

            {ordersError && !ordersLoading && orders.length === 0 && (
              <div className="mt-4 rounded-lg border border-[#FF5C5C]/30 bg-[#FF5C5C]/10 p-6">
                <p className="text-sm text-[#FF5C5C]">{ordersError}</p>
                <button
                  type="button"
                  onClick={fetchAdminOrders}
                  disabled={ordersLoading || ordersRefreshing}
                  className="mt-3 text-sm text-[#E5F500] underline"
                >
                  Try again
                </button>
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length === 0 && (
              <div className="mt-4 rounded-xl border border-[#272A26] bg-[#0D0F0D] p-6 text-center text-[#92968F]">
                <p className="text-xs text-center">No orders found.</p>
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#272A26] text-xs uppercase tracking-wider text-[#92968F]">
                      <th className="pb-3 font-semibold text-[#F3F4F1]">
                        Order ID
                      </th>
                      <th className="pb-3 font-semibold text-[#F3F4F1]">
                        Date
                      </th>
                      <th className="pb-3 font-semibold text-[#F3F4F1]">
                        Checkout ID
                      </th>
                      <th className="pb-3 font-semibold text-[#F3F4F1] text-right">
                        Amount
                      </th>
                      <th className="pb-3 font-semibold text-[#F3F4F1]">
                        Order Status
                      </th>
                      <th className="pb-3 font-semibold text-[#F3F4F1]">
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
                          className="border-b border-[#272A26]/50 hover:bg-[#171917]/30 transition"
                        >
                          <td className="py-3 text-xs font-mono text-[#F3F4F1] break-all">
                            {order._id}
                          </td>
                          <td className="py-3 text-xs text-[#92968F]">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3 text-xs font-mono text-[#F3F4F1] break-all">
                            {order.checkoutId || "—"}
                          </td>
                          <td className="py-3 text-xs text-right text-[#F3F4F1]">
                            ₹{Number(order.totalAmount || 0)
                              .toFixed(2)
                              .toLocaleString("en-IN")}
                          </td>
                          <td className="py-3 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${orderStatus === "placed"
                                  ? "bg-[#35D07F]/10 text-[#35D07F] border border-[#35D07F]/30"
                                  : orderStatus === "processing"
                                    ? "bg-[#F5B942]/10 text-[#F5B942] border border-[#F5B942]/20"
                                    : orderStatus === "completed"
                                      ? "bg-[#35D07F]/10 text-[#35D07F] border border-[#35D07F]/30"
                                      : "bg-[#FF5C5C]/10 text-[#FF5C5C] border border-[#FF5C5C]/20"
                                }`}
                            >
                              {orderStatus.charAt(0).toUpperCase() +
                                orderStatus.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isPaid
                                  ? "bg-[#35D07F]/10 text-[#35D07F] border border-[#35D07F]/30"
                                  : isFailed
                                    ? "bg-[#FF5C5C]/10 text-[#FF5C5C] border border-[#FF5C5C]/20"
                                    : "bg-[#272A26]/20 text-[#92968F] border border-[#272A26]/50"
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
                <p className="mt-3 text-xs text-[#92968F]">
                  {orders.length} order{orders.length !== 1 ? "s" : ""} total
                </p>
              </div>
            )}
          </div>

          <div className="dashboard-chaos-only">
            <SyntheticTrafficPanel />
          </div>
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
              <div className="mt-4 space-y-3">
                {experimentHistory.slice().reverse().map((experiment) => (
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
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                          experiment.status === "passed"
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




          <section
            id="recovery-metrics"
            className="dashboard-overview-only scroll-mt-6 rounded-2xl border border-[#272A26] bg-[#0D0F0D] p-6"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#E5F500]/10 p-3 text-[#E5F500]">
                <Workflow size={20} />
              </div>

              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[#F3F4F1]">
                  Recovery Metrics
                </h3>
                <p className="mt-1 text-xs leading-5 text-[#92968F]">
                  Current Docker recovery information.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#272A26] bg-[#171917] p-6">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Backend container
                </p>
                <p className="mt-3 text-xl font-bold tabular-nums text-[#F3F4F1]">
                  {recoveryInfo?.container ?? "Waiting for data"}
                </p>
              </div>

              <div className="rounded-2xl border border-[#272A26] bg-[#171917] p-6">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Total restarts
                </p>
                <p className="mt-3 text-xl font-bold tabular-nums text-[#F3F4F1]">
                  {recoveryInfo?.restartCount ?? "Unknown"}
                </p>
              </div>

              <div className="rounded-2xl border border-[#272A26] bg-[#171917] p-6">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Container health
                </p>
                <p className="mt-3 text-xl font-bold tabular-nums text-[#F3F4F1]">
                  {recoveryInfo?.health ?? "Unknown"}
                </p>
              </div>

              <div className="rounded-2xl border border-[#272A26] bg-[#171917] p-6">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#92968F]">
                  Monitor connection
                </p>
                <p className="mt-3 text-xl font-bold tabular-nums text-[#F3F4F1]">
                  {recoveryError
                    ? "Unavailable"
                    : recoveryInfo?.available
                      ? "Connected"
                      : "Waiting"}
                </p>
              </div>
            </div>
          </section>

          <footer className="border-t border-[#272A26] pt-6 text-[10px] text-[#92968F]">
            SHCom · Self-Healing Commerce
          </footer>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;


