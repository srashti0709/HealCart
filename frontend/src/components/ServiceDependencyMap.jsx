import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Database,
  Monitor,
  RefreshCw,
  Server,
  Workflow,
} from "lucide-react";
import { API_ENDPOINTS } from "../config/api";

const initialChecks = {
  backend: { status: "Checking", lastSuccessAt: null, latestFailure: null, payload: null },
  payment: { status: "Checking", lastSuccessAt: null, latestFailure: null, payload: null },
  recovery: { status: "Checking", lastSuccessAt: null, latestFailure: null, payload: null },
};

const statusStyles = {
  Healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Connected: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Online: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Degraded: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Checking: "border-slate-700 bg-slate-800/60 text-slate-300",
  Unavailable: "border-red-500/30 bg-red-500/10 text-red-300",
  Disconnected: "border-red-500/30 bg-red-500/10 text-red-300",
};

function formatTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function ServiceNode({ service, selected, onSelect }) {
  const Icon = service.icon;
  const style = statusStyles[service.status] || statusStyles.Checking;

  return (
    <button
      type="button"
      onClick={() => onSelect(service.id)}
      aria-pressed={selected}
      className={`w-full rounded-xl border p-4 text-left transition hover:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${selected ? "border-cyan-400 bg-cyan-400/10" : "border-slate-700 bg-[#101827]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg bg-slate-800 p-2.5 text-slate-200">
          <Icon size={19} />
        </span>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${style}`}>
          {service.status}
        </span>
      </div>
      <p className="mt-3 font-semibold text-white">{service.name}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{service.description}</p>
    </button>
  );
}

function ServiceDependencyMap({ incidents = [], experimentHistory = [], recoveryInfo }) {
  const [checks, setChecks] = useState(initialChecks);
  const [selectedService, setSelectedService] = useState("backend");
  const [lastRefresh, setLastRefresh] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const probe = async (key, url, label) => {
      try {
        const response = await axios.get(url, { timeout: 3000 });
        const payload = response.data;
        const isHealthy =
          key === "backend"
            ? payload?.success === true && payload?.status === "healthy"
            : key === "payment"
              ? payload?.success === true && payload?.status === "healthy"
              : payload?.success === true;

        if (!cancelled) {
          setChecks((previous) => ({
            ...previous,
            [key]: {
              status: isHealthy ? "Healthy" : "Degraded",
              lastSuccessAt: isHealthy ? new Date().toISOString() : previous[key].lastSuccessAt,
              latestFailure: isHealthy
                ? previous[key].latestFailure
                : `${label} returned a non-healthy response.`,
              payload,
            },
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setChecks((previous) => ({
            ...previous,
            [key]: {
              ...previous[key],
              status: "Unavailable",
              latestFailure: error.response
                ? `${label} returned HTTP ${error.response.status}.`
                : error.code === "ECONNABORTED"
                  ? `${label} health check timed out.`
                  : `Could not connect to ${label}.`,
            },
          }));
        }
      }
    };

    const refresh = async () => {
      await Promise.all([
        probe("backend", API_ENDPOINTS.health, "Backend API"),
        probe("payment", API_ENDPOINTS.paymentHealth, "Payment Service"),
        probe("recovery", API_ENDPOINTS.recovery, "Recovery Monitor"),
      ]);
      if (!cancelled) setLastRefresh(new Date().toISOString());
    };

    refresh();
    const interval = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const services = useMemo(() => {
    const backend = checks.backend;
    const payment = checks.payment;
    const recovery = checks.recovery;
    const databaseConnected = backend.payload?.database === "connected";
    const databaseStatus = backend.status === "Unavailable"
      ? "Unavailable"
      : backend.status === "Checking"
        ? "Checking"
        : databaseConnected
          ? "Connected"
          : "Disconnected";

    return [
      {
        id: "client",
        name: "Frontend Client",
        description: "SHCom dashboard currently rendered in this browser.",
        status: "Online",
        icon: Monitor,
        lastSuccessAt: "Current page session",
        latestFailure: "Not independently probed",
        attempts: "Not tracked",
        recoveredAt: null,
      },
      {
        id: "backend",
        name: "Backend API",
        description: "Express health endpoint · port 5000",
        status: backend.status,
        icon: Server,
        lastSuccessAt: formatTime(backend.lastSuccessAt),
        latestFailure: backend.latestFailure || "No failure recorded by the current probe.",
        attempts: recoveryInfo?.restartCount == null ? "Not available" : `${recoveryInfo.restartCount} Docker restart(s)`,
        recoveredAt: formatTime(
          recoveryInfo?.events?.find((event) =>
            ["recovered", "backend-recovered"].includes(event.type)
          )?.timestamp
        ),
      },
      {
        id: "database",
        name: "MongoDB Atlas",
        description: "Database state reported by the backend health endpoint.",
        status: databaseStatus,
        icon: Database,
        lastSuccessAt: databaseConnected ? formatTime(backend.lastSuccessAt) : "No current successful database probe",
        latestFailure: backend.payload?.database === "disconnected"
          ? "Backend reports the database as disconnected."
          : backend.latestFailure || "No database failure reported by the latest health response.",
        attempts: recoveryInfo?.events
          ? `${recoveryInfo.events.filter((event) => event.type === "database-disconnected").length} recorded disconnect event(s)`
          : "Not available",
        recoveredAt: formatTime(
          recoveryInfo?.events?.find((event) => event.type === "database-recovered")?.timestamp
        ),
      },
      {
        id: "payment",
        name: "Payment Service",
        description: "Independent payment-service health endpoint · port 5001",
        status: payment.status,
        icon: CreditCard,
        lastSuccessAt: formatTime(payment.lastSuccessAt),
        latestFailure: payment.latestFailure || "No failure recorded by the current probe.",
        attempts: `${experimentHistory.filter((item) => String(item.scenario || "").includes("payment") && item.status === "passed").length} successful recorded payment recovery experiment(s)`,
        recoveredAt: formatTime(
          experimentHistory.find((item) =>
            String(item.scenario || "").includes("payment") && item.status === "passed"
          )?.completedAt
        ),
      },
      {
        id: "recovery",
        name: "Recovery Monitor",
        description: "Docker and recovery-event monitoring endpoint · port 5002",
        status: recovery.status,
        icon: Workflow,
        lastSuccessAt: formatTime(recovery.lastSuccessAt),
        latestFailure: recovery.latestFailure || "No failure recorded by the current probe.",
        attempts: recoveryInfo?.restartCount == null ? "Not available" : `${recoveryInfo.restartCount} backend container restart(s) reported`,
        recoveredAt: formatTime(
          recoveryInfo?.events?.find((event) =>
            ["recovered", "database-recovered"].includes(event.type)
          )?.timestamp
        ),
      },
    ];
  }, [checks, recoveryInfo, experimentHistory]);

  const selected = services.find((service) => service.id === selectedService) || services[1];
  const recentIncident = incidents.find((incident) => {
    const text = `${incident.type || ""} ${incident.title || ""} ${incident.message || ""}`.toLowerCase();
    if (selected.id === "database") return text.includes("database") || text.includes("mongo");
    if (selected.id === "payment") return text.includes("payment");
    if (selected.id === "backend") return text.includes("backend") || text.includes("server");
    return false;
  });

  const node = (id) => services.find((service) => service.id === id);

  return (
    <section id="dependency-map" className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Workflow size={20} />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Phase 1.2</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">Service Dependency Map</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Live health probes show how the client, API, database, payment service and recovery monitor relate.
            Select a node to inspect its latest observed state and recovery evidence.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={13} />
            Auto-refresh every 5 seconds
          </span>
          <p className="mt-1">Last probe cycle: {formatTime(lastRefresh)}</p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_auto_1.15fr_auto_1fr] xl:items-center">
        <ServiceNode service={node("client")} selected={selectedService === "client"} onSelect={setSelectedService} />
        <div className="flex items-center justify-center gap-2 text-slate-500 xl:flex-col">
          <ArrowDown className="hidden xl:block" size={20} />
          <ArrowRight className="xl:hidden" size={20} />
          <span className="text-[10px] uppercase tracking-wider">HTTP</span>
        </div>
        <ServiceNode service={node("backend")} selected={selectedService === "backend"} onSelect={setSelectedService} />
        <div className="flex items-center justify-center gap-2 text-slate-500 xl:flex-col">
          <ArrowDown className="hidden xl:block" size={20} />
          <ArrowRight className="xl:hidden" size={20} />
          <span className="text-[10px] uppercase tracking-wider">Depends on</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <ServiceNode service={node("database")} selected={selectedService === "database"} onSelect={setSelectedService} />
          <ServiceNode service={node("payment")} selected={selectedService === "payment"} onSelect={setSelectedService} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-700 bg-[#101827]/70 p-3 text-xs text-slate-400">
        <Activity size={15} className="text-violet-300" />
        <span>Recovery Monitor</span>
        <ArrowRight size={14} />
        <span>Observes Docker backend state and recovery events</span>
        <span className={`ml-auto rounded-full border px-2 py-1 ${statusStyles[node("recovery").status] || statusStyles.Checking}`}>
          {node("recovery").status}
        </span>
        <button
          type="button"
          onClick={() => setSelectedService("recovery")}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-cyan-400"
        >
          View details
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-[#101827] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Selected service</p>
            <h4 className="mt-1 text-base font-semibold text-white">{selected.name}</h4>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs ${statusStyles[selected.status] || statusStyles.Checking}`}>
            {selected.status}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Last successful health check</p>
            <p className="mt-1 text-sm text-slate-200">{selected.lastSuccessAt}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Latest failure</p>
            <p className="mt-1 text-sm text-slate-200">
              {recentIncident?.message || selected.latestFailure || "Not available"}
            </p>
            {recentIncident?.timestamp && (
              <p className="mt-1 text-xs text-slate-500">{formatTime(recentIncident.timestamp)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500">Recovery attempts / evidence</p>
            <p className="mt-1 text-sm text-slate-200">{selected.attempts}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Latest verified recovery</p>
            <p className="mt-1 text-sm text-slate-200">{selected.recoveredAt}</p>
          </div>
        </div>

        {selected.id === "database" && checks.backend.payload?.database !== "connected" && (
          <p className="mt-4 flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Database status is inferred from the backend health response; the map does not connect directly to MongoDB Atlas.
          </p>
        )}
        {selected.id === "payment" && checks.payment.status === "Unavailable" && (
          <p className="mt-4 flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Payment recovery evidence is based on recorded experiments. A health probe alone does not prove an automatic recovery occurred.
          </p>
        )}
        {selected.id === "recovery" && (
          <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            Container restart counts and event timestamps come from the recovery monitor response when available.
          </p>
        )}
      </div>
    </section>
  );
}

export default ServiceDependencyMap;
