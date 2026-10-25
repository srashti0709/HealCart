import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import SyntheticTrafficPanel from "../components/SyntheticTrafficPanel";
import {
  BackendCrashCoordinationControls,
  BackendCrashTrafficResult,
} from "../components/BackendCrashCoordination";
import useBackendCrash from "../hooks/useBackendCrash";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Server,
  Workflow,
} from "lucide-react";

const RECOVERY_MONITOR_URL = "http://localhost:5002/api/recovery";
const CHAOS_CONTROLLER_URL = "http://localhost:5003";

/**
 * Command Center — reused HealCart dashboard logic (service health, incident log,
 * recovery analytics, chaos experiments, recovery metrics). Wrapped in a
 * separate technical Command Center layout for distinct identity from the
 * customer storefront. No changes to recovery/experiment behavior.
 */
function CommandCenter() {
  const [dbCheckRunning, setDbCheckRunning] = useState(false);
  const [dbCheckResult, setDbCheckResult] = useState("");
  const [dbCheckError, setDbCheckError] = useState("");
  const [dbCheckStages, setDbCheckStages] = useState([]);
  const [dbRecoveryDuration, setDbRecoveryDuration] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [lastChecked, setLastChecked] = useState(null);
  const [checking, setChecking] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [incidentsError, setIncidentsError] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [experimentHistory, setExperimentHistory] = useState([]);
  const [experimentStatusError, setExperimentStatusError] = useState("");
  const [paymentRunning, setPaymentRunning] = useState(false);
  const [paymentResult, setPaymentResult] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [inventoryRunning, setInventoryRunning] = useState(false);
  const [inventoryResult, setInventoryResult] = useState(null);
  const [inventoryError, setInventoryError] = useState("");
  const [runAllRunning, setRunAllRunning] = useState(false);
  const [runAllResults, setRunAllResults] = useState([]);
  const [runAllError, setRunAllError] = useState("");
  const experimentLockRef = useRef(false);

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

  const runDatabaseCheck = async () => {
    if (dbCheckRunning || chaosRunning) return;
    setDbCheckRunning(true);
    setDbCheckResult("");
    setDbCheckError("");
    setDbCheckStages([]);
    setDbRecoveryDuration(null);
    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/database-recovery`
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Database check failed.");
      }
      setDbCheckResult(data.message);
      setDbRecoveryDuration(null);
    } catch (error) {
      setDbCheckError(error.message || "Database check failed.");
    } finally {
      setDbCheckRunning(false);
    }
  };

  const runDatabaseRecovery = async () => {
    if (experimentLockRef.current) return;
    experimentLockRef.current = true;
    setDbCheckRunning(true);
    setDbCheckResult("");
    setDbCheckError("");
    setDbCheckStages([]);
    setDbRecoveryDuration(null);
    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/database-recovery`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Database recovery failed.");
      }
      setDbCheckResult(data.message || "Database recovered successfully.");
      setDbCheckStages(Array.isArray(data.stages) ? data.stages : []);
      setDbRecoveryDuration(data.durationMs ?? null);
    } catch (error) {
      setDbCheckError(error.message || "Database recovery failed.");
    } finally {
      experimentLockRef.current = false;
      setDbCheckRunning(false);
    }
  };

  const runPaymentRecovery = async () => {
    if (experimentLockRef.current) return;
    experimentLockRef.current = true;
    setPaymentRunning(true);
    setPaymentResult("");
    setPaymentError("");
    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/payment-service-recovery`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Payment recovery failed.");
      }
      setPaymentResult(data.message);
      await checkExperimentStatus();
    } catch (error) {
      setPaymentError(error.message || "Payment recovery failed.");
      await checkExperimentStatus();
    } finally {
      experimentLockRef.current = false;
      setPaymentRunning(false);
    }
  };

  const runInventoryAudit = async () => {
    if (experimentLockRef.current) return;
    experimentLockRef.current = true;
    setInventoryRunning(true);
    setInventoryResult(null);
    setInventoryError("");
    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/inventory-integrity`,
        { method: "POST" }
      );
      const data = await response.json();
      setInventoryResult(data);
      if (
        !response.ok ||
        !data.success ||
        data.recovered !== true
      ) {
        throw new Error(data.message || "Inventory audit found issues or failed.");
      }
      setInventoryError("");
      await checkExperimentStatus();
    } catch (error) {
      setInventoryError(error.message || "Inventory audit failed.");
      await checkExperimentStatus();
    } finally {
      experimentLockRef.current = false;
      setInventoryRunning(false);
    }
  };

  const runAllScenarios = async () => {
    if (experimentLockRef.current) return;
    experimentLockRef.current = true;
    const scenarios = [
      { id: "backend-crash", name: "Backend Crash Recovery", url: "/api/chaos/backend-crash" },
      { id: "database-recovery", name: "Database Connection Recovery", url: "/api/chaos/database-recovery" },
      { id: "payment-service-recovery", name: "Payment Service Recovery", url: "/api/chaos/payment-service-recovery" },
      { id: "inventory-integrity", name: "Inventory Integrity Audit", url: "/api/chaos/inventory-integrity" },
    ];
    setRunAllRunning(true);
    setRunAllResults([]);
    setRunAllError("");
    try {
      for (const scenario of scenarios) {
        let result;
        try {
          const response = await fetch(
            `${CHAOS_CONTROLLER_URL}${scenario.url}`,
            { method: "POST" }
          );
          const data = await response.json();
          const passed =
            response.ok &&
            data.success === true &&
            data.recovered !== false;
          result = {
            id: scenario.id,
            name: scenario.name,
            status: passed ? "passed" : "failed",
            message:
              data.message ||
              (passed ? "Scenario passed." : "Scenario failed."),
            durationMs: data.durationMs ?? null,
          };
        } catch (error) {
          result = {
            id: scenario.id,
            name: scenario.name,
            status: "failed",
            message: error.message || "Request failed.",
            durationMs: null,
          };
        }
        setRunAllResults((previous) => [...previous, result]);
        try {
          await checkExperimentStatus();
        } catch {
          /* scenario result retained even if history refresh fails */
        }
      }
    } catch (error) {
      setRunAllError(error.message || "The scenario sequence failed.");
    } finally {
      experimentLockRef.current = false;
      setRunAllRunning(false);
    }
  };

  const checkExperimentStatus = async () => {
    try {
      const [historyResponse, activeResponse] = await Promise.all([
        fetch(`${CHAOS_CONTROLLER_URL}/api/chaos/experiments/history`),
        fetch(`${CHAOS_CONTROLLER_URL}/api/chaos/experiments/active`),
      ]);
      if (!historyResponse.ok || !activeResponse.ok) {
        throw new Error("Unable to fetch experiment status.");
      }
      const historyData = await historyResponse.json();
      await activeResponse.json();
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
      const response = await axios.get(`${API_BASE_URL}/api/health`, { timeout: 3000 });
      setHealth(response.data);
      setHealthError("");
    } catch {
      setHealth(null);
      setHealthError("Backend API is unavailable.");
    } finally {
      setLastChecked(new Date().toLocaleTimeString());
      setChecking(false);
    }
  };

  const checkRecoveryMonitor = async () => {
    try {
      const response = await axios.get(RECOVERY_MONITOR_URL, { timeout: 8000 });
      if (response.data?.success !== true) {
        throw new Error("Recovery Monitor returned an invalid response.");
      }
      setRecoveryInfo(response.data);
      setRecoveryError("");
    } catch (error) {
      console.error("Recovery Monitor request failed:", error.message);
      setRecoveryError(
        error.code === "ECONNABORTED"
          ? "Recovery Monitor request timed out."
          : error.message === "Network Error"
            ? "Cannot connect to Recovery Monitor on port 5002."
            : error.message || "Recovery Monitor request failed."
      );
    }
  };

  const checkIncidents = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/incidents`, { timeout: 8000 });
      setIncidents(response.data.incidents || []);
      setIncidentsError("");
    } catch {
      setIncidentsError("Unable to load incidents from the backend.");
    }
  };

  const refreshAllStatuses = useCallback(async () => {
    await Promise.all([checkBackendHealth(), checkRecoveryMonitor(), checkIncidents()]);
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

  const backendStatus = healthError
    ? "Unavailable"
    : !health
      ? "Checking"
      : health.status === "healthy"
        ? "Healthy"
        : "Degraded";

  const databaseStatus = healthError
    ? "Unknown"
    : !health
      ? "Checking"
      : health.database === "connected"
        ? "Connected"
        : "Disconnected";

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
  const resolvedIncidents = incidents.filter((i) => i.status === "resolved").length;
  const failedIncidents = incidents.filter((i) => i.status === "failed").length;
  const activeIncidents = incidents.filter(
    (incident) => incident.status === "detected" || incident.status === "recovering"
  ).length;
  const recoverySuccessRate =
    totalIncidents > 0
      ? ((resolvedIncidents / totalIncidents) * 100).toFixed(1)
      : "0.0";

  const incidentsBySeverity = [
    { label: "Critical", count: incidents.filter((i) => i.severity === "critical").length, color: "bg-red-500" },
    { label: "High", count: incidents.filter((i) => i.severity === "high").length, color: "bg-orange-500" },
    { label: "Medium", count: incidents.filter((i) => i.severity === "medium").length, color: "bg-amber-400" },
    { label: "Low", count: incidents.filter((i) => i.severity === "low").length, color: "bg-cyan-400" },
  ];

  const incidentsByType = Object.entries(
    incidents.reduce((counts, incident) => {
      const type = incident.incidentType || "unknown";
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {})
  )
    .map(([type, count]) => ({
      label: type.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const recoveryActionsSummary = Object.entries(
    incidents.reduce((counts, incident) => {
      const action = incident.recoveryAction || "No action recorded";
      counts[action] = (counts[action] || 0) + 1;
      return counts;
    }, {})
  )
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);

  const filteredIncidents = incidents.filter((incident) => {
    const matchesSeverity = severityFilter === "all" || incident.severity?.toLowerCase() === severityFilter;
    const matchesStatus = statusFilter === "all" || incident.status?.toLowerCase() === statusFilter;
    const matchesType = typeFilter === "all" || incident.incidentType?.toLowerCase() === typeFilter;
    return matchesSeverity && matchesStatus && matchesType;
  });

  const services = [
    { name: "Backend API", detail: "Express · Port 5000", icon: Server, status: backendStatus },
    { name: "MongoDB Atlas", detail: "Database connection", icon: CheckCircle2, status: databaseStatus },
    { name: "Payment Service", detail: "Simulated payments · Port 5001", icon: Activity, status: "Not checked" },
    { name: "Recovery Monitor", detail: recoveryMonitorDetail, icon: RefreshCw, status: recoveryStatus },
  ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-5 lg:px-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-400">HealCart / Operations</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">System Overview</h2>
            <p className="mt-1 text-sm text-slate-400">Self-healing infrastructure monitoring</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{lastChecked ? `Last checked: ${lastChecked}` : "Waiting for first health check"}</span>
            <button onClick={refreshAllStatuses} disabled={checking} className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
              {checking ? "Checking..." : "Refresh status"}
            </button>
          </div>
        </header>

        <div className="space-y-8 p-6 lg:p-10">
          <section id="section-overview" className="scroll-mt-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-[#111c2c] to-[#0d1320] p-6 lg:p-8">
            <div className="flex flex-wrap items-start gap-4">
              <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                <Activity size={25} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold">Welcome to HealCart Operations</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Track service availability, investigate incidents and understand how HealCart responds to failures.
                  Service status is retrieved from your running backend and recovery monitor.
                </p>
              </div>
            </div>
          </section>

          <section id="section-service-health" className="scroll-mt-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Service Health</h3>
              <p className="mt-1 text-sm text-slate-500">Live backend, database and recovery-monitor status.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {services.map(({ name, detail, icon: Icon, status }) => (
                <article key={name} className="rounded-2xl border border-slate-800 bg-[#0d1320] p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="rounded-lg bg-slate-800 p-2.5 text-slate-300">
                      <Icon size={19} />
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      status === "Healthy" || status === "Connected"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : status === "Unavailable" || status === "Disconnected" || status === "Degraded"
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : "border-slate-700 text-slate-300"
                    }`}>
                      {status}
                    </span>
                  </div>
                  <h4 className="mt-5 font-semibold">{name}</h4>
                  <p className="mt-1 text-xs text-slate-500">{detail}</p>
                  {name === "Recovery Monitor" && recoveryInfo && (
                    <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Container</span>
                        <span className="text-slate-300">{recoveryInfo.container}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Docker status</span>
                        <span className="text-slate-300">{recoveryInfo.status}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Restart count</span>
                        <span className="text-slate-300">{recoveryInfo.restartCount ?? "Unknown"}</span>
                      </div>
                    </div>
                  )}
                  {name === "Recovery Monitor" && recoveryError && (
                    <p className="mt-3 text-xs text-red-400">{recoveryError}</p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section id="section-incidents" className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Incident Log</h3>
                <p className="mt-1 text-sm text-slate-500">Real incidents recorded by the HealCart backend.</p>
              </div>
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-slate-400">Severity</label>
                  <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400">
                    <option value="all">All Severities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-400">Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400">
                    <option value="all">All Statuses</option>
                    <option value="detected">Detected</option>
                    <option value="recovering">Recovering</option>
                    <option value="resolved">Resolved</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-400">Incident Type</label>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400">
                    <option value="all">All Incident Types</option>
                    {[...new Set(incidents.map((incident) => incident.incidentType?.toLowerCase()).filter(Boolean))].map((type) => (
                      <option key={type} value={type}>
                        {type.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">{incidents.length} incidents</span>
            </div>

            {incidentsError ? (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{incidentsError}</p>
            ) : incidents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 p-8 text-center">
                <AlertTriangle className="mx-auto mb-3 text-slate-500" size={28} />
                <p className="text-slate-300">No incidents recorded.</p>
                <p className="mt-1 text-sm text-slate-500">New incidents will appear here when recorded by the backend.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredIncidents.map((incident) => (
                  <article key={incident._id} className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-white">{incident.message || incident.incidentType}</h4>
                        <p className="mt-1 text-sm text-slate-400">{incident.service} · {incident.incidentType}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{incident.severity}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs ${
                          incident.status === "resolved" ? "bg-emerald-500/10 text-emerald-300"
                            : incident.status === "failed" ? "bg-red-500/10 text-red-300"
                            : "bg-amber-500/10 text-amber-300"
                        }`}>{incident.status}</span>
                      </div>
                    </div>
                    {incident.recoveryAction && (
                      <p className="mt-4 text-sm text-slate-300"><span className="text-slate-500">Recovery action: </span>{incident.recoveryAction}</p>
                    )}
                    {incident.recoveryResult && (
                      <p className="mt-2 text-sm text-slate-300"><span className="text-slate-500">Result: </span>{incident.recoveryResult}</p>
                    )}
                    <div className="mt-5 border-t border-slate-800 pt-4">
                      <h5 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Recovery Timeline</h5>
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <CheckCircle2 size={18} className="text-cyan-400" />
                            <div className="mt-2 h-full min-h-5 w-px bg-slate-700" />
                          </div>
                          <div className="pb-2">
                            <p className="text-sm font-medium text-slate-200">Incident Detected</p>
                            <p className="mt-1 text-xs text-slate-500">{incident.detectedAt ? new Date(incident.detectedAt).toLocaleString() : "Detection time unavailable"}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            {incident.recoveryAction ? <CheckCircle2 size={18} className="text-cyan-400" /> : <Activity size={18} className="text-slate-500" />}
                            <div className="mt-2 h-full min-h-5 w-px bg-slate-700" />
                          </div>
                          <div className="pb-2">
                            <p className="text-sm font-medium text-slate-200">Recovery Action</p>
                            <p className="mt-1 text-xs text-slate-500">{incident.recoveryAction || "No recovery action recorded"}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div>
                            {incident.status === "resolved" ? <CheckCircle2 size={18} className="text-emerald-400" />
                              : incident.status === "failed" ? <AlertTriangle size={18} className="text-red-400" />
                              : <Activity size={18} className="text-amber-400" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-200">{
                              incident.status === "resolved" ? "Recovery Resolved"
                                : incident.status === "failed" ? "Recovery Failed"
                                : incident.status === "recovering" ? "Recovery In Progress"
                                : "Awaiting Recovery"
                            }</p>
                            <p className="mt-1 text-xs text-slate-500">{
                              incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString()
                                : incident.status === "resolved" ? "Resolution time unavailable"
                                : "No resolution time recorded"
                            }</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Detected: {incident.detectedAt ? new Date(incident.detectedAt).toLocaleString() : "Timestamp unavailable"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="section-recovery-analytics" className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">Performance Insights</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Recovery Analytics</h3>
              <p className="mt-1 text-sm text-slate-500">Calculated from real incidents recorded by HealCart.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Total Incidents</p>
                <p className="mt-3 text-3xl font-bold text-white">{totalIncidents}</p>
              </article>
              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Resolved</p>
                <p className="mt-3 text-3xl font-bold text-emerald-400">{resolvedIncidents}</p>
              </article>
              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Failed</p>
                <p className="mt-3 text-3xl font-bold text-red-400">{failedIncidents}</p>
              </article>
              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Active Incidents</p>
                <p className="mt-3 text-3xl font-bold text-amber-400">{activeIncidents}</p>
              </article>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-white">Resolution Rate</h4>
                  <span className="text-xl font-bold text-cyan-400">{recoverySuccessRate}%</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${recoverySuccessRate}%` }} />
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Percentage of all recorded incidents currently marked resolved.</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">Incidents by Severity</h4>
                <div className="space-y-4">
                  {incidentsBySeverity.map((item) => (
                    <div key={item.label}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-slate-300">{item.label}</span>
                        <span className="text-slate-400">{item.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${totalIncidents > 0 ? (item.count / totalIncidents) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">Incidents by Type</h4>
                {incidentsByType.length === 0 ? (
                  <p className="text-sm text-slate-500">No incidents recorded yet.</p>
                ) : (
                  <div className="space-y-4">
                    {incidentsByType.map((item) => (
                      <div key={item.label}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span className="text-slate-300">{item.label}</span>
                          <span className="text-slate-400">{item.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                          <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${totalIncidents > 0 ? (item.count / totalIncidents) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">Recovery Action Summary</h4>
                {recoveryActionsSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">No recovery actions recorded yet.</p>
                ) : (
                  <div className="space-y-4">
                    {recoveryActionsSummary.map((item) => (
                      <div key={item.action}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span className="text-slate-300">{item.action}</span>
                          <span className="text-slate-400">{item.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${totalIncidents > 0 ? (item.count / totalIncidents) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="section-chaos-control" className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">Controlled Experiments</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Chaos Control Center</h3>
            <p className="mt-1 text-sm text-slate-500">Trigger controlled failures and observe automatic recovery.</p>
            <div className="mt-5 rounded-xl border border-cyan-800/60 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Run All Scenarios</h4>
                  <p className="mt-1 text-sm text-slate-400">Runs all four scenarios sequentially and records each result.</p>
                  <p className="mt-2 text-xs text-amber-400">Warning: this sequence deliberately restarts the backend and payment service.</p>
                </div>
                <button type="button" onClick={() => {
                  if (window.confirm("Run all four scenarios? The backend and payment service will be deliberately interrupted during testing. Do not run during checkout.")) {
                    runAllScenarios();
                  }
                }} disabled={runAllRunning || chaosRunning || dbCheckRunning || paymentRunning || inventoryRunning} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
                  {runAllRunning ? "Running Scenarios..." : "Run All Scenarios"}
                </button>
              </div>
              {runAllRunning && <p className="mt-4 text-sm text-amber-400">Experiment sequence in progress. Keep this dashboard open.</p>}
              {runAllError && <p className="mt-4 text-sm text-red-400">{runAllError}</p>}
              {runAllResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-sm font-medium text-slate-200">Scenario Results</h5>
                    <span className="text-xs text-slate-400">{runAllResults.filter((item) => item.status === "passed").length} of 4 passed</span>
                  </div>
                  {runAllResults.map((result, index) => (
                    <div key={result.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                      <div className="flex items-start gap-3">
                        {result.status === "passed" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-red-400" />}
                        <div>
                          <p className="text-sm font-medium text-slate-200">{index + 1}. {result.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{result.message}</p>
                          {result.durationMs !== null && <p className="mt-1 text-xs text-slate-500">Duration: {(result.durationMs / 1000).toFixed(2)}s</p>}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs ${result.status === "passed" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{result.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5 rounded-xl border border-slate-800 bg-[#101827] p-4">
              <p className="text-sm text-slate-400">Experiment Status</p>
              <p className={`mt-2 text-sm font-semibold ${chaosRunning ? "text-amber-400" : chaosError ? "text-red-400" : chaosResult ? "text-emerald-400" : "text-slate-300"}`}>
                {chaosRunning ? "Recovery in progress..." : chaosError ? "Experiment failed" : chaosResult ? "Recovery verified" : "Ready to run"}
              </p>
            </div>
            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Backend Crash Recovery</h4>
                  <p className="mt-1 text-sm text-slate-400">Crashes the backend container and verifies its automatic restart.</p>
                </div>
                <button type="button" onClick={runBackendCrash} disabled={runAllRunning || chaosRunning || dbCheckRunning || paymentRunning || inventoryRunning} className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                  {chaosRunning ? "Recovering..." : "Run Crash Test"}
                </button>
              </div>
              {chaosRunning && <p className="mt-4 text-sm text-amber-400">Crash triggered. Waiting for automatic recovery...</p>}
              {chaosResult && <p className="mt-4 text-sm text-emerald-400">{chaosResult}</p>}
              {chaosError && <p className="mt-4 text-sm text-red-400">{chaosError}</p>}

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
            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Database Connection Recovery</h4>
                  <p className="mt-1 text-sm text-slate-400">Simulates a safe MongoDB outage and verifies automatic reconnection with a real database read.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={runDatabaseCheck} disabled={runAllRunning || dbCheckRunning || chaosRunning || paymentRunning || inventoryRunning} className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                    {dbCheckRunning ? "Checking..." : "Check Database"}
                  </button>
                  <button type="button" onClick={runDatabaseRecovery} disabled={runAllRunning || dbCheckRunning || chaosRunning || paymentRunning || inventoryRunning} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">
                    {dbCheckRunning ? "Recovering..." : "Run Recovery Test"}
                  </button>
                </div>
              </div>
              {dbCheckResult && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-emerald-400">{dbCheckResult}</p>
                  {dbRecoveryDuration !== null && <p className="text-xs text-slate-400">Recovery duration: {(dbRecoveryDuration / 1000).toFixed(2)}s</p>}
                </div>
              )}
              {dbCheckStages.length > 0 && (
                <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                  <p className="text-xs uppercase tracking-wider text-slate-400">Recovery stages</p>
                  {dbCheckStages.map((stage, index) => (
                    <div key={`${stage.stage}-${index}`} className="flex items-start justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs">
                      <div>
                        <p className="font-medium text-slate-200">{stage.stage}</p>
                        <p className="text-slate-400">{stage.message}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 ${stage.status === "passed" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>{stage.status}</span>
                    </div>
                  ))}
                </div>
              )}
              {dbCheckError && <p className="mt-4 text-sm text-red-400">{dbCheckError}</p>}
            </div>
            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Payment Service Recovery</h4>
                  <p className="mt-1 text-sm text-slate-400">Crashes the payment service and verifies its automatic restart and health.</p>
                </div>
                <button type="button" onClick={() => {
                  if (window.confirm("This test briefly interrupts the payment service. Do not run it during checkout. Continue?")) {
                    runPaymentRecovery();
                  }
                }} disabled={paymentRunning || inventoryRunning || chaosRunning || dbCheckRunning} className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 disabled:cursor-not-allowed disabled:opacity-50">
                  {paymentRunning ? "Recovering..." : "Run Payment Recovery"}
                </button>
              </div>
              {paymentRunning && <p className="mt-4 text-sm text-amber-400">Payment service test running. Waiting for restart and health verification...</p>}
              {paymentResult && <p className="mt-4 text-sm text-emerald-400">{paymentResult}</p>}
              {paymentError && <p className="mt-4 text-sm text-red-400">{paymentError}</p>}
            </div>
            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Inventory Integrity Audit</h4>
                  <p className="mt-1 text-sm text-slate-400">Performs a read-only audit of product stock and prices for invalid values.</p>
                </div>
                <button type="button" onClick={runInventoryAudit} disabled={runAllRunning || paymentRunning || inventoryRunning || chaosRunning || dbCheckRunning} className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                  {inventoryRunning ? "Auditing..." : "Run Inventory Audit"}
                </button>
              </div>
              {inventoryRunning && <p className="mt-4 text-sm text-amber-400">Checking product inventory integrity...</p>}
              {inventoryResult && (
                <div className="mt-4 rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                  <p className={`text-sm font-medium ${inventoryResult.success && inventoryResult.recovered ? "text-emerald-400" : "text-red-400"}`}>
                    {inventoryResult.message || "Inventory audit completed."}
                  </p>
                  {inventoryResult.recovery && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-500">Products checked</p>
                        <p className="mt-1 text-lg font-semibold text-white">{inventoryResult.recovery.productsChecked ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Issues detected</p>
                        <p className="mt-1 text-lg font-semibold text-white">{inventoryResult.recovery.issueCount ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Mode</p>
                        <p className="mt-1 text-sm font-semibold text-cyan-300">Read-only</p>
                      </div>
                    </div>
                  )}
                  {inventoryResult.recovery?.issues?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {inventoryResult.recovery.issues.map((issue, index) => (
                        <p key={index} className="text-sm text-amber-300">{typeof issue === "string" ? issue : JSON.stringify(issue)}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {inventoryError && <p className="mt-4 text-sm text-red-400">{inventoryError}</p>}
            </div>
          </section>

          <SyntheticTrafficPanel />

          <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-white">Experiment History</h4>
                <p className="mt-1 text-sm text-slate-400">Recorded outcomes of completed recovery experiments.</p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{experimentHistory.length} recorded</span>
            </div>
            {experimentStatusError && (
              <p className="mt-4 text-sm text-red-400">{experimentStatusError}</p>
            )}
            {!experimentStatusError && experimentHistory.length === 0 && (
              <p className="mt-4 rounded-lg border border-slate-800 p-4 text-sm text-slate-400">No experiment results recorded yet.</p>
            )}
            {experimentHistory.length > 0 && (
              <div className="mt-4 space-y-3">
                {experimentHistory.slice().reverse().map((experiment) => (
                  <div key={experiment.id} className="rounded-lg border border-slate-800 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-white">{(experiment.scenario || "Unknown scenario").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</p>
                      <span className={`rounded-full px-2 py-1 text-xs ${experiment.status === "passed" ? "bg-emerald-500/10 text-emerald-400" : experiment.status === "stopped" ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>{experiment.status || "Unknown"}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{experiment.message || "No details recorded."}</p>
                    <p className="mt-2 text-xs text-slate-500">Completed: {experiment.completedAt ? new Date(experiment.completedAt).toLocaleString() : "Time unavailable"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <section id="section-recovery-metrics" className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-400/10 p-2.5 text-violet-300">
                <Workflow size={20} />
              </div>
              <div>
                <h3 className="font-semibold">Recovery Metrics</h3>
                <p className="mt-1 text-sm text-slate-500">Current Docker recovery information.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Backend container</p>
                <p className="mt-2 text-lg font-semibold">{recoveryInfo?.container ?? "Waiting for data"}</p>
              </div>
              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Total restarts</p>
                <p className="mt-2 text-lg font-semibold">{recoveryInfo?.restartCount ?? "Unknown"}</p>
              </div>
              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Container health</p>
                <p className="mt-2 text-lg font-semibold">{recoveryInfo?.health ?? "Unknown"}</p>
              </div>
              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Monitor connection</p>
                <p className="mt-2 text-lg font-semibold">{recoveryError ? "Unavailable" : recoveryInfo?.available ? "Connected" : "Waiting"}</p>
              </div>
            </div>
          </section>

          <footer className="border-t border-slate-800 px-6 py-5 text-xs text-slate-500">
            HealCart · Self-Healing Commerce — Resilience Command Center
          </footer>
        </div>
    </div>
  );
}

export default CommandCenter;
