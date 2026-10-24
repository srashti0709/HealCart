
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
  Activity,
  CheckCircle2,
  CreditCard,
  Database,
  Globe,
  MonitorSmartphone,
  Server,
  ShieldAlert,
  TimerReset,
} from "lucide-react";

const COLORS = {
  background: "#0D0F0D",
  surface: "#141813",
  border: "#292D24",
  accent: "#DEED00",
  muted: "#92968F",
  healthy: "#35D07F",
  recovering: "#F5B942",
  unhealthy: "#FF5C5C",
};

const statusText = {
  healthy: "Healthy",
  recovering: "Recovering",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
};

const statusClass = {
  healthy: "border-[#35D07F]/30 bg-[#35D07F]/10 text-[#35D07F]",
  recovering: "border-[#F5B942]/30 bg-[#F5B942]/10 text-[#F5B942]",
  unhealthy: "border-[#FF5C5C]/30 bg-[#FF5C5C]/10 text-[#FF5C5C]",
  unknown: "border-[#292D24] bg-[#1A1D18] text-[#92968F]",
};

const formatTimestamp = (value) => {
  if (!value) return "No recorded time";

  const time = new Date(value);

  if (Number.isNaN(time.getTime())) return "No recorded time";

  return time.toLocaleString();
};

const formatFreshness = (value, cutoffMs = 30000) => {
  if (!value) return "Unknown";

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "Unknown";

  const ageMs = Date.now() - timestamp;

  if (ageMs < 0 || ageMs <= cutoffMs) return "Fresh";
  if (ageMs <= cutoffMs * 4) return "Stale";

  return "Stale";
};

const getLatestEventByType = (events = [], types = []) => {
  if (!Array.isArray(events)) return null;

  return events
    .filter(
      (event) =>
        event &&
        typeof event.type === "string" &&
        types.includes(event.type) &&
        Number.isFinite(new Date(event.timestamp).getTime())
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    )[0] || null;
};

const getFailureEvent = (events = []) =>
  getLatestEventByType(events, ["crash", "database-disconnected"]);

const isAfter = (first, second) => {
  if (!first) return false;
  if (!second) return true;

  return new Date(first).getTime() > new Date(second).getTime();
};

function ServiceNode({ data }) {
  const Icon = data.icon || Activity;
  const state = data.state || "unknown";

  return (
    <div
      className={`w-[205px] rounded-xl border bg-[#141813] p-3 transition-colors duration-200 ${
        data.selected
          ? "border-[#DEED00]/70 shadow-[0_0_0_1px_rgba(222,237,0,0.12),0_12px_35px_rgba(0,0,0,0.25)]"
          : "border-[#292D24] hover:border-[#414638]"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-[#DEED00]"
      />

      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
            statusClass[state] || statusClass.unknown
          }`}
        >
          <Icon size={17} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[#F0F1EB]">
            {data.label}
          </p>
          <p className="mt-1 truncate text-[9px] uppercase tracking-[0.13em] text-[#92968F]">
            {data.role}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#292D24] pt-2.5">
        <span className="text-[10px] text-[#92968F]">Service status</span>
        <span
          className={`rounded-md border px-2 py-1 text-[9px] font-semibold ${
            statusClass[state] || statusClass.unknown
          }`}
        >
          {statusText[state] || "Unknown"}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-[#92968F]">Health probe</span>
        <span
          className={`text-[10px] font-medium ${
            data.probeFreshness === "Fresh"
              ? "text-[#35D07F]"
              : "text-[#92968F]"
          }`}
        >
          {data.probeFreshness || "Unknown"}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-[#DEED00]"
      />
    </div>
  );
}

const nodeTypes = { serviceNode: ServiceNode };

function DetailItem({ label, value, accent = false }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#292D24] bg-[#10120F] p-3">
      <p className="text-[9px] uppercase tracking-[0.13em] text-[#92968F]">
        {label}
      </p>
      <p
        className={`mt-2 break-words text-xs font-medium ${
          accent ? "text-[#DEED00]" : "text-[#E5E7DF]"
        }`}
      >
        {value ?? "Unknown"}
      </p>
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
  const [selectedNodeId, setSelectedNodeId] = useState("backend");

  const events = useMemo(
    () =>
      Array.isArray(recoveryInfo?.events)
        ? recoveryInfo.events
        : [],
    [recoveryInfo]
  );

  const lastFailure = useMemo(
    () => getFailureEvent(events),
    [events]
  );

  const lastRecovery = useMemo(
    () =>
      getLatestEventByType(events, [
        "recovered",
        "database-recovered",
      ]),
    [events]
  );

  const serviceStates = useMemo(() => {
    const backendTimestamp = health?.timestamp || null;
    const paymentTimestamp = paymentHealth?.timestamp || null;

    const backendHealthy =
      health?.success === true &&
      health?.status === "healthy" &&
      health?.database === "connected";

    const paymentHealthy =
      paymentHealth?.success === true &&
      paymentHealth?.status === "healthy";

    const backendState = (() => {
      if (backendHealthy) {
        return formatFreshness(backendTimestamp, 45000) === "Fresh"
          ? "healthy"
          : "unknown";
      }

      if (
        lastFailure &&
        isAfter(lastFailure.timestamp, lastRecovery?.timestamp)
      ) {
        return "recovering";
      }

      if (
        health &&
        (health.status !== "healthy" ||
          health.database !== "connected")
      ) {
        return "unhealthy";
      }

      return "unknown";
    })();

    const paymentState = (() => {
      if (paymentHealthy) {
        return formatFreshness(paymentTimestamp, 45000) === "Fresh"
          ? "healthy"
          : "unknown";
      }

      if (
        paymentHealthError ||
        (paymentHealth &&
          paymentHealth.status !== "healthy")
      ) {
        return "unhealthy";
      }

      return "unknown";
    })();

    const mongoState = (() => {
      if (health?.database === "connected") {
        return backendState === "healthy" ? "healthy" : "unknown";
      }

      if (
        lastFailure &&
        isAfter(lastFailure.timestamp, lastRecovery?.timestamp)
      ) {
        return "recovering";
      }

      if (health?.database === "disconnected") {
        return "unhealthy";
      }

      return "unknown";
    })();

    const browserOnline =
      typeof navigator !== "undefined" && navigator.onLine;

    const details = {
      client: {
        label: "Client",
        role: "User browser",
        lastSuccessfulProbe: null,
        latestFailure: browserOnline ? null : new Date().toISOString(),
        recoveryAttempts: 0,
        recoveryVerifiedAt: null,
        probeFreshness: browserOnline ? "Online" : "Offline",
        dependencies: ["Frontend"],
        containerStatus: browserOnline
          ? "Browser online"
          : "Browser offline",
        description:
          "The browser session initiating customer storefront traffic.",
        icon: MonitorSmartphone,
      },
      frontend: {
        label: "Frontend",
        role: "React storefront",
        lastSuccessfulProbe: null,
        latestFailure: null,
        recoveryAttempts: 0,
        recoveryVerifiedAt: null,
        probeFreshness: "Browser session",
        dependencies: ["Backend API"],
        containerStatus: "Running in browser",
        description:
          "The SHCom customer-facing storefront. This browser-side status does not independently verify the frontend server.",
        icon: Globe,
      },
      backend: {
        label: "Backend API",
        role: "Express service · 5000",
        lastSuccessfulProbe: backendHealthy
          ? backendTimestamp
          : null,
        latestFailure: lastFailure?.timestamp || null,
        recoveryAttempts: events.filter((event) =>
          ["crash", "database-disconnected"].includes(event.type)
        ).length,
        recoveryVerifiedAt: backendHealthy
          ? backendTimestamp
          : null,
        probeFreshness: formatFreshness(backendTimestamp, 45000),
        dependencies: ["MongoDB", "Payment Service"],
        containerStatus: recoveryInfo?.status || "Unknown",
        description:
          "Application-level health depends on a recent successful backend probe and a connected MongoDB database.",
        icon: Server,
      },
      payment: {
        label: "Payment Service",
        role: "Payment interface · 5001",
        lastSuccessfulProbe: paymentHealthy
          ? paymentTimestamp
          : null,
        latestFailure: paymentHealthError
          ? new Date().toISOString()
          : null,
        recoveryAttempts: paymentHealthError ? 1 : 0,
        recoveryVerifiedAt: paymentHealthy
          ? paymentTimestamp
          : null,
        probeFreshness: formatFreshness(paymentTimestamp, 45000),
        dependencies: ["Backend API"],
        containerStatus: paymentHealth?.status || "Unknown",
        description:
          "The payment service used by order submission and payment verification.",
        icon: CreditCard,
      },
      mongodb: {
        label: "MongoDB",
        role: "MongoDB Atlas",
        lastSuccessfulProbe:
          health?.database === "connected" && backendState === "healthy"
            ? backendTimestamp
            : null,
        latestFailure:
          lastFailure?.type === "database-disconnected"
            ? lastFailure.timestamp
            : null,
        recoveryAttempts: events.filter(
          (event) => event.type === "database-disconnected"
        ).length,
        recoveryVerifiedAt:
          lastRecovery?.type === "database-recovered"
            ? lastRecovery.timestamp
            : null,
        probeFreshness: formatFreshness(backendTimestamp, 45000),
        dependencies: ["Backend API"],
        containerStatus: health?.database || "Unknown",
        description:
          "MongoDB Atlas stores application data. Its connection state is observed through the backend health response.",
        icon: Database,
      },
    };

    return {
      client: browserOnline ? "healthy" : "unhealthy",
      frontend: "healthy",
      backend: backendState,
      payment: paymentState,
      mongodb: mongoState,
      details,
    };
  }, [
    events,
    health,
    lastFailure,
    lastRecovery,
    paymentHealth,
    paymentHealthError,
    recoveryInfo,
  ]);

  const nodeDetails = useMemo(() => {
    const details = {};

    for (const id of [
      "client",
      "frontend",
      "backend",
      "payment",
      "mongodb",
    ]) {
      details[id] = {
        ...serviceStates.details[id],
        status: serviceStates[id],
      };
    }

    return details;
  }, [serviceStates]);

  const selectedNode =
    nodeDetails[selectedNodeId] || nodeDetails.backend;

  const nodes = useMemo(
    () => [
      {
        id: "client",
        type: "serviceNode",
        position: { x: 20, y: 145 },
        data: {
          label: "Client",
          role: "Browser",
          icon: MonitorSmartphone,
          state: serviceStates.client,
          probeFreshness: nodeDetails.client.probeFreshness,
          selected: selectedNodeId === "client",
        },
      },
      {
        id: "frontend",
        type: "serviceNode",
        position: { x: 275, y: 145 },
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
        type: "serviceNode",
        position: { x: 530, y: 145 },
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
        type: "serviceNode",
        position: { x: 800, y: 55 },
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
        type: "serviceNode",
        position: { x: 800, y: 245 },
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
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#DEED00",
        width: 14,
        height: 14,
      },
      style: { stroke: "#DEED00", strokeWidth: 1.5 },
    },
    {
      id: "frontend-backend",
      source: "frontend",
      target: "backend",
      type: "smoothstep",
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#DEED00",
        width: 14,
        height: 14,
      },
      style: { stroke: "#DEED00", strokeWidth: 1.5 },
    },
    {
      id: "backend-mongodb",
      source: "backend",
      target: "mongodb",
      type: "smoothstep",
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#35D07F",
        width: 14,
        height: 14,
      },
      style: { stroke: "#35D07F", strokeWidth: 1.5 },
    },
    {
      id: "backend-payment",
      source: "backend",
      target: "payment",
      type: "smoothstep",
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#F5B942",
        width: 14,
        height: 14,
      },
      style: { stroke: "#F5B942", strokeWidth: 1.5 },
    },
  ],
  []
);


  const dependencyStateSummary =
    selectedNode.dependencies?.map((name) => {
      const key = name.toLowerCase().replace(/\s+/g, "-");

      const states = {
        backend: serviceStates.backend,
        "backend-api": serviceStates.backend,
        "payment-service": serviceStates.payment,
        mongodb: serviceStates.mongodb,
        frontend: serviceStates.frontend,
        client: serviceStates.client,
      };

      return { name, state: states[key] || "unknown" };
    }) || [];

  const hasData = Boolean(health || paymentHealth || recoveryInfo);

  return (
    <section
      id="service-map"
      className="min-w-0 overflow-hidden rounded-xl border border-[#292D24] bg-[#0D0F0D] p-4 sm:p-5"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#DEED00]" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#DEED00]">
              Architecture
            </p>
          </div>

          <h3 className="mt-2 text-lg font-semibold tracking-tight text-[#F0F1EB] sm:text-xl">
            Service dependency map
          </h3>

          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#92968F]">
            Live service relationships, health probes, and recovery state.
            Select a node to inspect its details.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(statusText).map(([state, label]) => (
            <span
              key={state}
              className={`rounded-md border px-2 py-1 text-[9px] font-medium ${
                statusClass[state]
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_285px]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#292D24] bg-[#10120F]">
          <div className="flex h-10 items-center justify-between border-b border-[#292D24] px-3 sm:px-4">
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-[#DEED00]" />
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#D4D6CE]">
                Runtime topology
              </span>
            </div>
            <span className="text-[9px] text-[#92968F]">
              05 services
            </span>
          </div>

          <div className="relative h-[410px] w-full sm:h-[440px]">
            {!hasData ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <Activity size={22} className="text-[#92968F]" />
                <p className="text-xs text-[#92968F]">
                  Waiting for service health data…
                </p>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.12, maxZoom: 0.9 }}
                minZoom={0.35}
                maxZoom={1.15}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                className="shcom-service-flow"
              >
                <Background
                  color="#292D24"
                  gap={22}
                  size={1}
                />
                <Controls
                  showInteractive={false}
                  className="!overflow-hidden !rounded-lg !border !border-[#292D24] !bg-[#141813] [&>button]:!border-[#292D24] [&>button]:!bg-[#141813] [&>button]:!fill-[#92968F] [&>button:hover]:!bg-[#292D24]"
                />
              </ReactFlow>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#292D24] px-3 py-2.5 sm:px-4">
            <span className="text-[9px] uppercase tracking-[0.12em] text-[#92968F]">
              Connections
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[#C8CBC1]">
              <span className="h-1.5 w-4 rounded-full bg-[#DEED00]" />
              Request flow
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[#C8CBC1]">
              <span className="h-1.5 w-4 rounded-full bg-[#35D07F]" />
              Database
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[#C8CBC1]">
              <span className="h-1.5 w-4 rounded-full bg-[#F5B942]" />
              Payment
            </span>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#292D24] bg-[#10120F] 2xl:h-[495px]">
          <div className="flex items-start justify-between gap-3 border-b border-[#292D24] p-4">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.17em] text-[#92968F]">
                Selected service
              </p>
              <h4 className="mt-2 truncate text-base font-semibold text-[#F0F1EB]">
                {selectedNode.label}
              </h4>
              <p className="mt-1 text-[10px] text-[#92968F]">
                {selectedNode.role}
              </p>
            </div>

            <span
              className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-semibold ${
                statusClass[selectedNode.status] || statusClass.unknown
              }`}
            >
              {statusText[selectedNode.status] || "Unknown"}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2">
              <DetailItem
                label="Last successful check"
                value={formatTimestamp(selectedNode.lastSuccessfulProbe)}
              />
              <DetailItem
                label="Latest failure"
                value={formatTimestamp(selectedNode.latestFailure)}
              />
              <DetailItem
                label="Recovery attempts"
                value={selectedNode.recoveryAttempts ?? 0}
                accent
              />
              <DetailItem
                label="Verified recovery"
                value={formatTimestamp(selectedNode.recoveryVerifiedAt)}
              />
              <DetailItem
                label="Probe freshness"
                value={selectedNode.probeFreshness || "Unknown"}
              />
              <DetailItem
                label="Observed status"
                value={selectedNode.containerStatus || "Unknown"}
              />
            </div>

            <div className="rounded-lg border border-[#292D24] bg-[#141813] p-3">
              <div className="flex items-center gap-2">
                <TimerReset size={14} className="text-[#DEED00]" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#D4D6CE]">
                  Dependencies
                </p>
              </div>

              <div className="mt-3 space-y-2.5">
                {dependencyStateSummary.length ? (
                  dependencyStateSummary.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-xs text-[#C8CBC1]">
                        {item.name}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[9px] font-medium ${
                          statusClass[item.state] || statusClass.unknown
                        }`}
                      >
                        {statusText[item.state] || "Unknown"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#92968F]">
                    No dependency data available.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[#292D24] bg-[#141813] p-3">
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-[#DEED00]" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#D4D6CE]">
                  Service observations
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#92968F]">
                {selectedNode.description ||
                  "No additional service details are available."}
              </p>
            </div>

            {(healthError || recoveryError || paymentHealthError) && (
              <div className="rounded-lg border border-[#F5B942]/25 bg-[#F5B942]/5 p-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={13} className="text-[#F5B942]" />
                  <p className="text-[10px] font-semibold text-[#F5B942]">
                    Monitoring warning
                  </p>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-[#92968F]">
                  One or more monitoring requests failed. Unknown status
                  means health could not be verified; it does not confirm
                  that a service is down.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-[#292D24] px-4 py-3">
            <CheckCircle2
              size={13}
              className={
                selectedNode.status === "healthy"
                  ? "text-[#35D07F]"
                  : "text-[#92968F]"
              }
            />
            <span className="text-[10px] text-[#92968F]">
              Status is based on available monitoring data
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}
