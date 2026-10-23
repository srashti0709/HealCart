import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from "@xyflow/react";
import {
  CheckCircle2,
  CreditCard,
  Database,
  Globe,
  MonitorSmartphone,
  Server,
  ShieldAlert,
  TimerReset,
} from "lucide-react";

const statusText = {
  healthy: "Healthy",
  recovering: "Recovering",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
};

const statusClass = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  recovering: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  unhealthy: "border-red-500/30 bg-red-500/10 text-red-300",
  unknown: "border-slate-700 bg-slate-800/60 text-slate-300",
};

const formatTimestamp = (value) => {
  if (!value) return "Unknown";

  const time = new Date(value);

  if (Number.isNaN(time.getTime())) {
    return "Unknown";
  }

  return time.toLocaleString();
};

const formatFreshness = (value, cutoffMs = 30000) => {
  if (!value) return "Unknown";

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const ageMs = Date.now() - timestamp;

  if (ageMs <= cutoffMs) return "Fresh";
  if (ageMs <= cutoffMs * 4) return "Stale";
  return "Stale";
};

const getLatestEventByType = (events = [], types = []) => {
  if (!Array.isArray(events) || events.length === 0) return null;

  const matches = events.filter(
    (event) =>
      event &&
      typeof event.type === "string" &&
      types.includes(event.type)
  );

  if (!matches.length) return null;

  return matches.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];
};

const getFailureEvent = (events = []) => {
  const failureTypes = ["crash", "database-disconnected"];
  const latest = getLatestEventByType(events, failureTypes);

  return latest || null;
};

function ServiceNode({ data }) {
  const Icon = data.icon;

  return (
    <div
      className={`w-[220px] rounded-2xl border bg-[#0a1220]/95 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.45)] backdrop-blur ${
        data.selected ? "border-cyan-400/60 ring-2 ring-cyan-500/20" : "border-slate-700"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-0 !bg-cyan-300" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={`rounded-xl border p-2 ${statusClass[data.state] || statusClass.unknown}`}>
            <Icon size={16} className="shrink-0" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{data.label}</div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {data.role}
            </div>
          </div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass[data.state] || statusClass.unknown}`}>
          {statusText[data.state] || "Unknown"}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
        <span>Probe</span>
        <span className="font-medium text-slate-200">{data.probeFreshness || "Unknown"}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-0 !bg-cyan-300" />
    </div>
  );
}

export default function ServiceDependencyMap({
  health,
  paymentHealth,
  recoveryInfo,
  recoveryError,
  healthError,
  paymentHealthError,
}) {
  const events = useMemo(
    () => (Array.isArray(recoveryInfo?.events) ? recoveryInfo.events : []),
    [recoveryInfo]
  );
  const lastFailure = getFailureEvent(events);
  const lastRecovery = getLatestEventByType(events, ["recovered", "database-recovered"]);

  const serviceStates = useMemo(() => {
    const latestBackendProbe = health?.timestamp || null;
    const latestPaymentProbe = paymentHealth?.timestamp || null;
    const latestSuccessfulBackendHealth =
      health &&
      health.success === true &&
      health.status === "healthy" &&
      health.database === "connected"
        ? health.timestamp
        : null;

    const latestSuccessfulPaymentHealth =
      paymentHealth &&
      paymentHealth.success === true &&
      paymentHealth.status === "healthy"
        ? latestPaymentProbe || new Date().toISOString()
        : null;

    const backendState = (() => {
      if (health && health.success === true && health.status === "healthy" && health.database === "connected") {
        return formatFreshness(health.timestamp, 45000) === "Fresh" ? "healthy" : "unknown";
      }

      if (lastFailure && (!lastRecovery || new Date(lastFailure.timestamp) > new Date(lastRecovery.timestamp))) {
        return "recovering";
      }

      if (health && (health.status !== "healthy" || health.database !== "connected")) {
        return "unhealthy";
      }

      if (healthError || recoveryError) {
        return "unknown";
      }

      return "unknown";
    })();

    const paymentState = (() => {
      if (paymentHealth && paymentHealth.success === true && paymentHealth.status === "healthy") {
        return "healthy";
      }

      if (paymentHealthError || (paymentHealth && paymentHealth.status !== "healthy")) {
        return "unhealthy";
      }

      return "unknown";
    })();

    const mongoState = (() => {
      if (health && health.database === "connected") {
        return "healthy";
      }

      if (lastFailure && (!lastRecovery || new Date(lastFailure.timestamp) > new Date(lastRecovery.timestamp))) {
        return "recovering";
      }

      if (health && health.database === "disconnected") {
        return "unhealthy";
      }

      return "unknown";
    })();

    return {
      client: typeof navigator !== "undefined" && navigator.onLine ? "healthy" : "unknown",
      frontend: "healthy",
      backend: backendState,
      payment: paymentState,
      mongodb: mongoState,
      details: {
        client: {
          label: "Client",
          role: "User browser",
          lastSuccessfulProbe: new Date().toISOString(),
          latestFailure: null,
          recoveryAttempts: 0,
          recoveryVerifiedAt: null,
          probeFreshness: "Fresh",
          dependencies: ["Frontend"],
          containerStatus: "Browser session active",
          description: "The browser session initiating storefront traffic.",
          lastProbeTime: new Date().toISOString(),
          icon: MonitorSmartphone,
        },
        frontend: {
          label: "Frontend",
          role: "React storefront",
          lastSuccessfulProbe: new Date().toISOString(),
          latestFailure: null,
          recoveryAttempts: 0,
          recoveryVerifiedAt: null,
          probeFreshness: "Fresh",
          dependencies: ["Backend API"],
          containerStatus: "Live in browser",
          description: "The SHCom storefront serving the user experience.",
          lastProbeTime: new Date().toISOString(),
          icon: Globe,
        },
        backend: {
          label: "Backend API",
          role: "Express service · 5000",
          lastSuccessfulProbe: latestSuccessfulBackendHealth || latestBackendProbe || null,
          latestFailure: lastFailure?.timestamp || null,
          recoveryAttempts: events.filter((event) => ["crash", "database-disconnected"].includes(event.type)).length,
          recoveryVerifiedAt: latestSuccessfulBackendHealth || null,
          probeFreshness: formatFreshness(latestBackendProbe || latestSuccessfulBackendHealth, 45000),
          dependencies: ["MongoDB", "Payment Service"],
          containerStatus: recoveryInfo?.status || "unknown",
          description: "Application-level health depends on MongoDB connectivity and the API responding successfully.",
          lastProbeTime: latestBackendProbe || null,
          icon: Server,
        },
        payment: {
          label: "Payment Service",
          role: "Payment interface · 5001",
          lastSuccessfulProbe: latestSuccessfulPaymentHealth || latestPaymentProbe || null,
          latestFailure: paymentHealthError ? new Date().toISOString() : null,
          recoveryAttempts: paymentHealthError ? 1 : 0,
          recoveryVerifiedAt: latestSuccessfulPaymentHealth || null,
          probeFreshness: formatFreshness(latestPaymentProbe || latestSuccessfulPaymentHealth, 45000),
          dependencies: ["Backend API"],
          containerStatus: paymentHealth ? paymentHealth.status : "unknown",
          description: "The internal payment processor used by order submission and verification flows.",
          lastProbeTime: latestPaymentProbe || null,
          icon: CreditCard,
        },
        mongodb: {
          label: "MongoDB",
          role: "MongoDB Atlas",
          lastSuccessfulProbe: health?.database === "connected" ? health.timestamp || null : null,
          latestFailure: lastFailure && lastFailure.type === "database-disconnected" ? lastFailure.timestamp : null,
          recoveryAttempts: events.filter((event) => event.type === "database-disconnected").length,
          recoveryVerifiedAt: lastRecovery && lastRecovery.type === "database-recovered" ? lastRecovery.timestamp : null,
          probeFreshness: formatFreshness(health?.timestamp || undefined, 45000),
          dependencies: ["Backend API"],
          containerStatus: health?.database || "unknown",
          description: "The application's persistence layer. Failures surface as degraded or disconnected health in the backend API.",
          lastProbeTime: health?.timestamp || null,
          icon: Database,
        },
      },
    };
  }, [events, health, healthError, lastFailure, lastRecovery, paymentHealth, paymentHealthError, recoveryError, recoveryInfo]);

  const [selectedNodeId, setSelectedNodeId] = useState("backend");

  const nodeDetails = useMemo(() => {
    const details = {
      client: { ...serviceStates.details.client, status: serviceStates.client },
      frontend: { ...serviceStates.details.frontend, status: serviceStates.frontend },
      backend: { ...serviceStates.details.backend, status: serviceStates.backend },
      payment: { ...serviceStates.details.payment, status: serviceStates.payment },
      mongodb: { ...serviceStates.details.mongodb, status: serviceStates.mongodb },
    };

    return details;
  }, [serviceStates]);

  const selectedNode = nodeDetails[selectedNodeId] || nodeDetails.backend;

  const nodes = useMemo(
    () => [
      {
        id: "client",
        position: { x: 10, y: 150 },
        type: "serviceNode",
        data: {
          label: "Client",
          role: "User browser",
          icon: MonitorSmartphone,
          state: serviceStates.client,
          probeFreshness: nodeDetails.client.probeFreshness,
          selected: selectedNodeId === "client",
        },
      },
      {
        id: "frontend",
        position: { x: 275, y: 150 },
        type: "serviceNode",
        data: {
          label: "Frontend",
          role: "React app",
          icon: Globe,
          state: serviceStates.frontend,
          probeFreshness: nodeDetails.frontend.probeFreshness,
          selected: selectedNodeId === "frontend",
        },
      },
      {
        id: "backend",
        position: { x: 540, y: 150 },
        type: "serviceNode",
        data: {
          label: "Backend API",
          role: "Express · 5000",
          icon: Server,
          state: serviceStates.backend,
          probeFreshness: nodeDetails.backend.probeFreshness,
          selected: selectedNodeId === "backend",
        },
      },
      {
        id: "payment",
        position: { x: 810, y: 90 },
        type: "serviceNode",
        data: {
          label: "Payment Service",
          role: "Payment · 5001",
          icon: CreditCard,
          state: serviceStates.payment,
          probeFreshness: nodeDetails.payment.probeFreshness,
          selected: selectedNodeId === "payment",
        },
      },
      {
        id: "mongodb",
        position: { x: 810, y: 260 },
        type: "serviceNode",
        data: {
          label: "MongoDB",
          role: "MongoDB Atlas",
          icon: Database,
          state: serviceStates.mongodb,
          probeFreshness: nodeDetails.mongodb.probeFreshness,
          selected: selectedNodeId === "mongodb",
        },
      },
    ],
    [nodeDetails, selectedNodeId, serviceStates]
  );

  const edges = useMemo(
    () => [
      {
        id: "client-frontend",
        source: "client",
        target: "frontend",
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#67e8f9" },
        animated: true,
        style: { stroke: "#67e8f9", strokeWidth: 2 },
      },
      {
        id: "frontend-backend",
        source: "frontend",
        target: "backend",
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#67e8f9" },
        animated: true,
        style: { stroke: "#67e8f9", strokeWidth: 2 },
      },
      {
        id: "backend-mongodb",
        source: "backend",
        target: "mongodb",
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#22c55e" },
        animated: true,
        style: { stroke: "#22c55e", strokeWidth: 2 },
      },
      {
        id: "backend-payment",
        source: "backend",
        target: "payment",
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#fbbf24" },
        animated: true,
        style: { stroke: "#fbbf24", strokeWidth: 2 },
      },
    ],
    []
  );

  const dependencyStateSummary = selectedNode.dependencies?.map((name) => {
    const key = name.toLowerCase().replace(/\s+/g, "-");
    const match = {
      backend: serviceStates.backend,
      "payment-service": serviceStates.payment,
      mongodb: serviceStates.mongodb,
      frontend: serviceStates.frontend,
      client: serviceStates.client,
    }[key];

    return {
      name,
      state: match || "unknown",
    };
  }) || [];

  const hasData = !!(health || paymentHealth || recoveryInfo);

  return (
    <section id="service-map" className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-400">Architecture</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Service dependency map</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Real SHCom runtime dependencies: customer browser requests flow to the frontend, the backend checks MongoDB and payment status, and recovery events are tracked separately from application health.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          {Object.entries(statusText).map(([state, label]) => (
            <span key={state} className={`rounded-full border px-2.5 py-1 ${statusClass[state]}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_340px]">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
          {!hasData ? (
            <div className="flex h-[460px] items-center justify-center text-sm text-slate-400">
              Loading dependency data...
            </div>
          ) : (
            <div className="h-[460px] w-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                minZoom={0.5}
                maxZoom={1.5}
                nodeTypes={{ serviceNode: ServiceNode }}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#334155" gap={16} size={1} />
                <Controls showInteractive={false} className="!rounded-xl !border !border-slate-700 !bg-slate-900/80 !text-slate-200" />
              </ReactFlow>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Selected service</p>
              <h4 className="mt-2 text-xl font-semibold text-white">{selectedNode.label}</h4>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass[selectedNode.status] || statusClass.unknown}`}>
              {statusText[selectedNode.status] || "Unknown"}
            </span>
          </div>

          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldAlert size={16} className="text-cyan-400" />
                Role
              </div>
              <p className="mt-2 text-slate-200">{selectedNode.role || "Unknown"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <DetailItem label="Last successful check" value={formatTimestamp(selectedNode.lastSuccessfulProbe)} />
              <DetailItem label="Latest failure" value={formatTimestamp(selectedNode.latestFailure)} />
              <DetailItem label="Recovery attempts" value={selectedNode.recoveryAttempts ?? 0} />
              <DetailItem label="Verified recovery" value={formatTimestamp(selectedNode.recoveryVerifiedAt)} />
              <DetailItem label="Probe freshness" value={selectedNode.probeFreshness || "Unknown"} />
              <DetailItem label="Container status" value={selectedNode.containerStatus || "Unknown"} />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center gap-2 text-slate-300">
                <TimerReset size={16} className="text-cyan-400" />
                Dependency states
              </div>
              <div className="mt-3 space-y-2">
                {dependencyStateSummary.length ? dependencyStateSummary.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 text-xs text-slate-300">
                    <span>{item.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 ${statusClass[item.state] || statusClass.unknown}`}>
                      {statusText[item.state] || "Unknown"}
                    </span>
                  </div>
                )) : <p className="text-xs text-slate-500">No dependency data available.</p>}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={16} className="text-emerald-400" />
                Observed data
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {selectedNode.description || "No additional detail is available for this service."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-200">{String(value || "Unknown")}</p>
    </div>
  );
}
