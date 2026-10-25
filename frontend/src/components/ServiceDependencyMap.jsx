
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

  return (
    events
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
      )[0] || null
  );
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

  const nodeAccent = {
    healthy: "#35D07F",
    recovering: "#F5B942",
    unhealthy: "#FF5C5C",
    unknown: "#92968F",
  }[state];

  return (
    <div
      className={`group relative w-[205px] overflow-hidden rounded-2xl border bg-gradient-to-br from-[#1B2018] via-[#141813] to-[#10120F] p-3.5 shadow-[0_2px_0_#30352C,0_6px_0_#20241C,0_12px_18px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 ${
        data.selected
          ? "border-[#DEED00]/70 shadow-[0_2px_0_#737D32,0_7px_0_#292D20,0_16px_28px_rgba(0,0,0,0.38),0_0_24px_rgba(222,237,0,0.07),inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-[#414638] hover:-translate-y-0.5 hover:border-[#59614A] hover:shadow-[0_3px_0_#30352C,0_8px_0_#20241C,0_17px_25px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.07)]"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${nodeAccent}90, transparent)`,
        }}
      />

      {data.selected && (
        <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[#DEED00]/[0.06] blur-2xl" />
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-[#10120F] !bg-[#DEED00]"
      />

      <div className="relative flex items-start gap-2.5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-[0_3px_0_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.07)] ${
            statusClass[state] || statusClass.unknown
          }`}
        >
          <Icon size={18} strokeWidth={1.7} />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[12px] font-semibold tracking-tight text-[#F0F1EB]">
            {data.label}
          </p>
          <p className="mt-1 truncate text-[9px] uppercase tracking-[0.12em] text-[#92968F]">
            {data.role}
          </p>
        </div>
      </div>

      <div className="relative mt-3.5 flex items-center justify-between gap-2 border-t border-[#30352C] pt-3">
        <span className="text-[10px] text-[#92968F]">
          Service status
        </span>

        <span
          className={`rounded-md border px-2 py-1 text-[9px] font-semibold ${
            statusClass[state] || statusClass.unknown
          }`}
        >
          {statusText[state] || "Unknown"}
        </span>
      </div>

      <div className="relative mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-[#92968F]">Health probe</span>
        <span
          className={`text-[10px] font-medium ${
            data.probeFreshness === "Fresh"
              ? "text-[#35D07F]"
              : data.probeFreshness === "Offline"
                ? "text-[#FF5C5C]"
                : "text-[#92968F]"
          }`}
        >
          {data.probeFreshness || "Unknown"}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-[#10120F] !bg-[#DEED00]"
      />
    </div>
  );
}

const nodeTypes = { serviceNode: ServiceNode };

function DetailItem({ label, value, accent = false }) {
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-xl border border-[#34392D] bg-gradient-to-br from-[#191D16] to-[#10120F] p-3 shadow-[0_2px_0_#0A0C09,inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors duration-200 hover:border-[#4A5140]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#59614A]/50 to-transparent" />
      <p className="text-[9px] uppercase tracking-[0.12em] text-[#92968F]">
        {label}
      </p>
      <p
        className={`mt-2 break-words text-xs font-medium leading-5 ${
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
        return backendTimestamp
          ? formatFreshness(backendTimestamp, 45000) === "Fresh"
            ? "healthy"
            : "unknown"
          : "healthy";
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
        return paymentTimestamp
          ? formatFreshness(paymentTimestamp, 45000) === "Fresh"
            ? "healthy"
            : "unknown"
          : "healthy";
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
          "The HealCart customer-facing storefront. This browser-side status does not independently verify the frontend server.",
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
  const selectedNode = nodeDetails[selectedNodeId] || nodeDetails.backend;

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
        style: {
          stroke: "#DEED00",
          strokeWidth: 2,
          filter: "drop-shadow(0 0 4px rgba(222,237,0,0.2))",
        },
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
        style: {
          stroke: "#DEED00",
          strokeWidth: 2,
          filter: "drop-shadow(0 0 4px rgba(222,237,0,0.2))",
        },
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
        style: {
          stroke: "#35D07F",
          strokeWidth: 2,
          filter: "drop-shadow(0 0 4px rgba(53,208,127,0.2))",
        },
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
        style: {
          stroke: "#F5B942",
          strokeWidth: 2,
          filter: "drop-shadow(0 0 4px rgba(245,185,66,0.2))",
        },
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
      className="group relative min-w-0 scroll-mt-8 overflow-hidden rounded-2xl border border-[#414638] bg-[#111410] p-4 shadow-[0_3px_0_#30352C,0_9px_0_#20241C,0_20px_36px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.045)] transition-all duration-300 sm:p-6"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/60 to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#A78BFA]/[0.045] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-[#35D07F]/[0.035] blur-3xl" />

      <div className="relative mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-[#59614A] bg-[#22271B] text-[#DEED00] shadow-[0_2px_0_#10120F]">
              <Activity size={13} />
            </span>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#DEED00]">
              Architecture / Runtime
            </p>
          </div>

          <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#F0F1EB] sm:text-xl">
            Service Dependency Map
          </h3>

          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#92968F]">
            Inspect live service relationships, health probes, and recovery
            state.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(statusText).map(([state, label]) => (
            <span
              key={state}
              className={`rounded-md border px-2.5 py-1.5 text-[9px] font-medium shadow-[0_2px_0_rgba(0,0,0,0.18)] ${
                statusClass[state]
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_285px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[#34392D] bg-[#10120F] shadow-[0_3px_0_#080A07,0_9px_20px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)]">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-[#30352C] bg-gradient-to-r from-[#191D16] to-[#111410] px-3 sm:px-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#414638] bg-[#20241C] text-[#DEED00]">
                <Activity size={13} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#D4D6CE]">
                  Runtime Topology
                </p>
                <p className="mt-0.5 text-[9px] text-[#858A7D]">
                  Fixed layout · Select a service to inspect
                </p>
              </div>
            </div>

            <span className="rounded-md border border-[#414638] bg-[#20241C] px-2.5 py-1 text-[9px] font-medium tabular-nums text-[#C5C9BF]">
              05 SERVICES
            </span>
          </div>

          <div className="relative h-[410px] w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.045),transparent_65%)] sm:h-[440px]">
            <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(65,70,56,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(65,70,56,0.06)_1px,transparent_1px)] bg-[size:28px_28px]" />

            {!hasData ? (
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#414638] bg-[#191D16] text-[#92968F] shadow-[0_4px_0_#080A07,0_10px_18px_rgba(0,0,0,0.2)]">
                  <Activity size={20} />
                </div>
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
                minZoom={0.75}
                maxZoom={0.9}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                panOnDrag={false}
                panOnScroll={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                preventScrolling={false}
                className="shcom-service-flow"
              >
                <Background color="#34392D" gap={24} size={1} />
                <Controls
                  showInteractive={false}
                  className="!overflow-hidden !rounded-xl !border !border-[#414638] !bg-[#191D16] !shadow-[0_3px_0_#080A07,0_7px_12px_rgba(0,0,0,0.25)] [&>button]:!border-[#30352C] [&>button]:!bg-[#191D16] [&>button]:!fill-[#C5C9BF] [&>button:hover]:!bg-[#292D24]"
                />
              </ReactFlow>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#30352C] bg-[#141813] px-3 py-3 sm:px-4">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#858A7D]">
              Connections
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[#C8CBC1]">
              <span className="h-1.5 w-4 rounded-full bg-[#DEED00] shadow-[0_0_6px_rgba(222,237,0,0.25)]" />
              Request flow
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[#C8CBC1]">
              <span className="h-1.5 w-4 rounded-full bg-[#35D07F] shadow-[0_0_6px_rgba(53,208,127,0.25)]" />
              Database
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[#C8CBC1]">
              <span className="h-1.5 w-4 rounded-full bg-[#F5B942] shadow-[0_0_6px_rgba(245,185,66,0.25)]" />
              Payment
            </span>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#34392D] bg-gradient-to-b from-[#171B14] to-[#10120F] shadow-[0_3px_0_#080A07,0_9px_20px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] 2xl:h-[495px]">
          <div className="relative flex items-start justify-between gap-3 border-b border-[#30352C] bg-gradient-to-r from-[#20241A] to-[#141813] p-4">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#A8B65A]/50 to-transparent" />

            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#92968F]">
                Selected Service
              </p>
              <h4 className="mt-2 truncate text-base font-semibold tracking-tight text-[#F0F1EB]">
                {selectedNode.label}
              </h4>
              <p className="mt-1 text-[10px] text-[#92968F]">
                {selectedNode.role}
              </p>
            </div>

            <span
              className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-semibold shadow-[0_2px_0_rgba(0,0,0,0.15)] ${
                statusClass[selectedNode.status] || statusClass.unknown
              }`}
            >
              {statusText[selectedNode.status] || "Unknown"}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#DEED00]" />
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#A8B65A]">
                  Runtime Details
                </p>
              </div>

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
            </div>

            <div className="rounded-xl border border-[#34392D] bg-gradient-to-br from-[#191D16] to-[#10120F] p-3 shadow-[0_2px_0_#080A07,inset_0_1px_0_rgba(255,255,255,0.025)]">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#414638] bg-[#20241C] text-[#DEED00]">
                  <TimerReset size={13} />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#D4D6CE]">
                  Dependencies
                </p>
              </div>

              <div className="mt-3 space-y-3">
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
                        className={`rounded-md border px-2 py-1 text-[9px] font-medium ${
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

            <div className="rounded-xl border border-[#34392D] bg-gradient-to-br from-[#191D16] to-[#10120F] p-3 shadow-[0_2px_0_#080A07,inset_0_1px_0_rgba(255,255,255,0.025)]">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#414638] bg-[#20241C] text-[#A78BFA]">
                  <ShieldAlert size={13} />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#D4D6CE]">
                  Service Observations
                </p>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#92968F]">
                {selectedNode.description ||
                  "No additional service details are available."}
              </p>
            </div>

            {(healthError || recoveryError || paymentHealthError) && (
              <div className="rounded-xl border border-[#F5B942]/25 bg-gradient-to-br from-[#F5B942]/[0.07] to-[#141813] p-3 shadow-[0_2px_0_#080A07]">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={13} className="text-[#F5B942]" />
                  <p className="text-[10px] font-semibold text-[#F5B942]">
                    Monitoring Warning
                  </p>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[#B5B8AD]">
                  One or more monitoring requests failed. Unknown status
                  means health could not be verified; it does not confirm
                  that a service is down.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-[#30352C] bg-[#141813] px-4 py-3">
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

      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#30352C] pt-4">
        <p className="text-[9px] tracking-[0.12em] text-[#858A7D]">
          HEALCART <span className="text-[#59614A]">/</span> SERVICE TOPOLOGY
        </p>
        <p className="text-[9px] text-[#858A7D]">
          Select a node to view runtime information
        </p>
      </div>
    </section>
  );
}
