import { useMemo } from "react";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Timer,
} from "lucide-react";

/**
 * The project implements these failure/recovery scenarios. The list reflects the
 * real chaos experiments (chaos-controller) and the last-item race experiment
 * route; per-scenario times and status are sourced from real records, never
 * fabricated.
 */
const SCENARIOS = [
  {
    id: "backend-crash",
    name: "Backend Crash",
    before:
      "Backend container stops; the API becomes unreachable and requests fail until Docker restarts the container.",
    after:
      "Docker auto-restarts the backend container. Recovery is verified only when the container is running and /api/health reports healthy with the database connected.",
    measure:
      "Container crash to verified-health completion (recovery-monitor event timestamps).",
  },
  {
    id: "database-recovery",
    name: "Database Connection Recovery",
    before:
      "MongoDB connection drops; database-backed reads and operations fail until the driver reconnects.",
    after:
      "Mongoose auto-reconnects. verifyDatabaseRecovery confirms a real database-backed read succeeds after reconnect.",
    measure:
      "MongoDB disconnect to verified restore (recovery-monitor event timestamps).",
  },
  {
    id: "payment-service-recovery",
    name: "Payment Service Recovery",
    before:
      "Payment service container is killed; payment requests and checkouts fail until the service restarts.",
    after:
      "Docker restarts the payment service. Recovery is verified when the container is running and /health reports healthy.",
    measure:
      "Crash triggered to verified payment-service health (recovery.durationMs).",
  },
  {
    id: "inventory-integrity",
    name: "Inventory Integrity Audit",
    before:
      "Invalid stock or price values go undetected; there is no automated integrity verification.",
    after:
      "Read-only inventory audit scans all products and reports invalid stock/prices without modifying data.",
    measure: "Audit start to completion (recovery.durationMs).",
  },
  {
    id: "last-item-race",
    name: "Last-Item Race Condition",
    before:
      "Two concurrent checkouts can both reserve the final item, causing oversale and inconsistent stock/order state.",
    after:
      "Conditional atomic stock reservation accepts one checkout and rejects the competitor; stock and order consistency is verified.",
    measure:
      "Race run status from recorded last-item-race incidents (fault injected to verified requires a tracked race run).",
  },
];

const STATUS_PRESENTATION = {
  recovered: {
    label: "Recovered",
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "text-red-300",
    bg: "bg-red-500/10",
    Icon: AlertTriangle,
  },
  running: {
    label: "In progress",
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    Icon: Activity,
  },
  unavailable: {
    label: "Unavailable",
    color: "text-[#C5C9BF]",
    bg: "bg-[#292D24]",
    Icon: Clock3,
  },
};

const safeTime = (value) => {
  if (value == null) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

const formatMs = (ms) => {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};

const afterMsFor = (scenarioId, experiment) => {
  if (!experiment) return null;
  const recovery = experiment.recovery || {};

  if (
    scenarioId === "database-recovery" ||
    scenarioId === "payment-service-recovery" ||
    scenarioId === "inventory-integrity"
  ) {
    const ms = recovery.durationMs;
    return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
  }

  if (scenarioId === "backend-crash") {
    const started = safeTime(recovery.startedAt);
    const completed = safeTime(experiment.completedAt);
    if (Number.isFinite(started) && Number.isFinite(completed)) {
      const duration = completed - started;
      return duration > 0 ? duration : null;
    }
    return null;
  }

  return null;
};

const statusFor = (experiment) => {
  if (!experiment) return "unavailable";
  switch (experiment.status) {
    case "passed":
      return "recovered";
    case "failed":
      return "failed";
    case "running":
    case "stopped":
      return "running";
    default:
      return "unavailable";
  }
};

// Recovery-monitor event pairs give real measured recovery durations:
//   backend-crash:    crash -> recovered
//   database-recovery: database-disconnected -> database-recovered
const recoveryDurationFromEvents = (scenarioId, events = []) => {
  if (!Array.isArray(events) || events.length === 0) return null;

  const failureType =
    scenarioId === "backend-crash"
      ? "crash"
      : scenarioId === "database-recovery"
        ? "database-disconnected"
        : null;

  const recoveryType =
    scenarioId === "backend-crash"
      ? "recovered"
      : scenarioId === "database-recovery"
        ? "database-recovered"
        : null;

  if (!failureType || !recoveryType) return null;

  const failures = events
    .map((e) => ({ ...e, t: safeTime(e.timestamp) }))
    .filter((e) => String(e.type || "").toLowerCase() === failureType && Number.isFinite(e.t));

  const recoveries = events
    .map((e) => ({ ...e, t: safeTime(e.timestamp) }))
    .filter((e) => String(e.type || "").toLowerCase() === recoveryType && Number.isFinite(e.t));

  if (failures.length === 0) return null;

  const latestFailure = failures.reduce((a, b) => (b.t > a.t ? b : a));
  const recoveryAfterFailure = recoveries.filter((r) => r.t >= latestFailure.t);

  if (recoveryAfterFailure.length === 0) return null;

  const latestRecovery = recoveryAfterFailure.reduce((a, b) => (b.t > a.t ? b : a));
  const duration = latestRecovery.t - latestFailure.t;
  return duration > 0 ? duration : null;
};

// Recovery-monitor event status for a scenario:
// recovered if a recovery event exists after the latest failure;
// running if a failure exists without a following recovery;
// unavailable if no events at all.
const recoveryStatusFromEvents = (scenarioId, events = []) => {
  if (!Array.isArray(events) || events.length === 0) return "unavailable";

  const failureType =
    scenarioId === "backend-crash"
      ? "crash"
      : scenarioId === "database-recovery"
        ? "database-disconnected"
        : null;

  const recoveryType =
    scenarioId === "backend-crash"
      ? "recovered"
      : scenarioId === "database-recovery"
        ? "database-recovered"
        : null;

  if (!failureType || !recoveryType) return "unavailable";

  const failures = events
    .map((e) => ({ ...e, t: safeTime(e.timestamp) }))
    .filter((e) => String(e.type || "").toLowerCase() === failureType && Number.isFinite(e.t));

  const recoveries = events
    .map((e) => ({ ...e, t: safeTime(e.timestamp) }))
    .filter((e) => String(e.type || "").toLowerCase() === recoveryType && Number.isFinite(e.t));

  if (failures.length === 0) return "unavailable";

  const latestFailure = failures.reduce((a, b) => (b.t > a.t ? b : a));
  const recoveryAfterFailure = recoveries.filter((r) => r.t >= latestFailure.t);

  return recoveryAfterFailure.length > 0 ? "recovered" : "running";
};

// Race-condition runs are stored per-run (RaceConditionRun) and are not part of
// the chaos experiment history. Their status is observable through recorded
// incidents (incidentType === "last_item_race_condition").
const raceStatusFromIncidents = (incidents = []) => {
  const raceIncidents = incidents.filter(
    (i) => String(i.incidentType || "").toLowerCase() === "last_item_race_condition"
  );

  if (raceIncidents.length === 0) return { status: "unavailable" };

  const latest = raceIncidents.reduce((a, b) => {
    const atA = safeTime(a.detectedAt);
    const atB = safeTime(b.detectedAt);
    return atB > atA ? b : a;
  });

  switch (String(latest.status || "").toLowerCase()) {
    case "resolved":
      return { status: "recovered", incident: latest };
    case "failed":
      return { status: "failed", incident: latest };
    case "detected":
    case "recovering":
      return { status: "running", incident: latest };
    default:
      return { status: "unavailable", incident: latest };
  }
};

export default function RecoveryTimeTable({
  experimentHistory = [],
  incidents = [],
  recoveryEvents = [],
}) {
  const latestByScenario = useMemo(() => {
    const map = {};
    for (const experiment of experimentHistory) {
      const id = experiment.scenario;
      if (!id) continue;
      const current = map[id];
      if (
        !current ||
        safeTime(experiment.completedAt) > safeTime(current.completedAt)
      ) {
        map[id] = experiment;
      }
    }
    return map;
  }, [experimentHistory]);

  const race = raceStatusFromIncidents(incidents);

  const rows = useMemo(() => {
    return SCENARIOS.map((scenario) => {
      // The last-item race has no experiment-history entry; derive its status
      // from recorded incidents instead.
      if (scenario.id === "last-item-race") {
        return {
          ...scenario,
          experiment: null,
          afterMs: null,
          beforeMs: null,
          status: race.status,
          presentation: STATUS_PRESENTATION[race.status],
          raceIncident: race.incident,
        };
      }

      const experiment = latestByScenario[scenario.id];

      // Prefer real measured recovery duration from recovery-monitor events.
      const eventDuration = recoveryDurationFromEvents(scenario.id, recoveryEvents);
      const eventStatus = recoveryStatusFromEvents(scenario.id, recoveryEvents);

      // After-recovery time is reported only when recovery actually succeeded.
      const afterMs =
        eventDuration != null ? eventDuration : afterMsFor(scenario.id, experiment);
      const status =
        eventStatus !== "unavailable" ? eventStatus : statusFor(experiment);
      const beforeMs = null; // No baseline instrumentation exists in the project.
      const presentation = STATUS_PRESENTATION[status];

      return {
        ...scenario,
        experiment,
        afterMs,
        beforeMs,
        status,
        presentation,
      };
    });
  }, [latestByScenario, race.status, race.incident, recoveryEvents]);

  const hasAnyRecord = rows.some(
    (row) => row.experiment || row.raceIncident || row.afterMs != null
  );

  return (
    <section id="section-recovery-time" className="scroll-mt-6 rounded-2xl border border-[#292D24] bg-gradient-to-br from-[#1C2018] to-[#12150F] p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} className="text-[#DEED00]" />
          <p className="text-xs font-medium uppercase tracking-wider text-[#DEED00]">
            Recovery Insights
          </p>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-[#F3F4F1]">
          Recovery Time — Before vs After
        </h3>
        <p className="mt-1 text-sm text-[#858B7D]">
          Compares how each supported failure scenario behaves before and after
          self-healing, using real experiment and recovery-monitor timestamps.
          Times are measured from failure injection/detection to verified
          restoration of service.
        </p>
      </div>

      <div className="rounded-xl border border-[#30352A] bg-[#11130F]/60 p-4 sm:p-5">
        <p className="text-xs text-[#A7ACA0]">
          <span className="font-semibold text-[#C5C9BF]">Measurement basis:</span>{" "}
          {rows.map((row) => row.measure).join(" · ")}
        </p>
        <p className="mt-1 text-xs text-[#A7ACA0]">
          <span className="font-semibold text-[#C5C9BF]">Baseline:</span>{" "}
          this project does not collect pre-self-healing (before) recovery times,
          so the baseline is shown as "Not measured". No baseline times are
          fabricated. Once baseline instrumentation exists, improvement is
          {`((beforeMs - afterMs) / beforeMs) * 100`}.
        </p>
        <p className="mt-1 text-xs text-[#A7ACA0]">
          <span className="font-semibold text-[#C5C9BF]">Last-Item Race:</span>{" "}
          Race runs are tracked per-run (not in chaos experiment history). The
          status below reflects recorded last-item-race incidents; a recovery
          time requires a tracked race run.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto border border-[#30352A] rounded-xl bg-[#0B0D09]/40 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset]">
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#292D24]">
              {[
                "Failure Scenario",
                "Before Self-Healing",
                "Before Recovery Time",
                "After Self-Healing",
                "After Recovery Time",
                "Status",
              ].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[#A7ACA0] bg-[#11130F]/50 border-b border-[#292D24]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const afterLabel = row.afterMs
                ? formatMs(row.afterMs)
                : row.status === "running"
                  ? "In progress"
                  : "Not measured";
              return (
                <tr
                  key={row.id}
                  className="border-b border-[#292D24] hover:bg-[#141711]/60 transition-colors last:border-b-0"
                >
                  <td className="px-4 py-4 text-sm font-medium text-[#F3F4F1]">
                    <div className="flex items-center gap-2">
                      {row.id === "last-item-race" ? (
                        <ShieldCheck size={15} className="text-[#DEED00]" />
                      ) : (
                        <Timer size={15} className="text-[#A7ACA0]" />
                      )}
                      <span>{row.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#858B7D]">
                      {row.id}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#C5C9BF]">
                    {row.before}
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-[#A7ACA0]">
                    Not measured
                  </td>
                  <td className="px-4 py-4 text-sm text-[#C5C9BF]">
                    {row.after}
                  </td>
                  <td className="px-4 py-4 text-sm font-mono">
                    <span
                      className={`text-sm ${
                        row.afterMs != null
                          ? "text-emerald-400"
                          : row.status === "running"
                            ? "text-amber-400"
                            : "text-[#858B7D]"
                      }`}
                    >
                      {afterLabel}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.presentation.bg} ${row.presentation.color}`}
                    >
                      <row.presentation.Icon size={11} className="mr-1" />
                      {row.presentation.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasAnyRecord && (
        <div className="mt-5 rounded-xl border border-[#292D24] bg-[#11130F]/60 p-5">
          <Activity size={18} className="mx-auto mb-3 text-[#858B7D]" />
          <p className="text-sm text-[#C5C9BF] text-center">
            No experiment records available yet. Run a scenario from the Chaos
            Control Center to populate recovery times.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-[#858B7D]">
        Status reflects the latest recorded experiment for each scenario (the
        last-item race reflects recorded last-item-race incidents; backend-crash
        and database-recovery reflect recovery-monitor events). Recovery time
        updates automatically as new experiments complete.
      </p>

      {/* Temporary demo / sample data to preview the table across all statuses */}
      <div className="mt-8 rounded-xl border border-[#414638]/50 bg-[#11130F]/60 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Activity size={15} className="text-[#F5B942]" />
          <p className="text-xs font-medium uppercase tracking-wider text-[#F5B942]">
            Temporary demo data
          </p>
        </div>
        <p className="mb-3 text-xs text-[#858B7D]">
          Sample rows showing the table across all possible statuses. This is
          temporary demo data only — not real experiment results.
        </p>
        <div className="overflow-x-auto border border-[#30352A] rounded-xl bg-[#0B0D09]/40 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset]">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#292D24]">
                {[
                  "Failure Scenario",
                  "Before Self-Healing",
                  "Before Recovery Time",
                  "After Self-Healing",
                  "After Recovery Time",
                  "Status",
                ].map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[#A7ACA0] bg-[#11130F]/50 border-b border-[#292D24]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_ROWS.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#292D24] hover:bg-[#141711]/60 transition-colors last:border-b-0"
                >
                  <td className="px-4 py-4 text-sm font-medium text-[#F3F4F1]">
                    <div className="flex items-center gap-2">
                      <Timer size={15} className="text-[#A7ACA0]" />
                      <span>{row.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#858B7D]">{row.id}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#C5C9BF]">{row.before}</td>
                  <td className="px-4 py-4 text-sm font-mono text-[#A7ACA0]">
                    Not measured
                  </td>
                  <td className="px-4 py-4 text-sm text-[#C5C9BF]">{row.after}</td>
                  <td className="px-4 py-4 text-sm font-mono">
                    <span
                      className={`text-sm ${row.afterLabelColor}`}
                    >
                      {row.afterLabel}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.statusBg} ${row.statusColor}`}
                    >
                      <row.StatusIcon size={11} className="mr-1" />
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const DEMO_ROWS = [
  {
    id: "backend-crash",
    name: "Backend Crash",
    before:
      "Backend container stops; the API becomes unreachable and requests fail until Docker restarts the container.",
    after:
      "Docker auto-restarts the backend container. Recovery is verified only when the container is running and /api/health reports healthy with the database connected.",
    afterLabel: "12.5 s",
    afterLabelColor: "text-emerald-400",
    statusLabel: "Recovered",
    statusBg: "bg-emerald-500/10",
    statusColor: "text-emerald-300",
    StatusIcon: CheckCircle2,
  },
  {
    id: "database-recovery",
    name: "Database Connection Recovery",
    before:
      "MongoDB connection drops; database-backed reads and operations fail until the driver reconnects.",
    after:
      "Mongoose auto-reconnects. verifyDatabaseRecovery confirms a real database-backed read succeeds after reconnect.",
    afterLabel: "8.3 s",
    afterLabelColor: "text-emerald-400",
    statusLabel: "Recovered",
    statusBg: "bg-emerald-500/10",
    statusColor: "text-emerald-300",
    StatusIcon: CheckCircle2,
  },
  {
    id: "payment-service-recovery",
    name: "Payment Service Recovery",
    before:
      "Payment service container is killed; payment requests and checkouts fail until the service restarts.",
    after:
      "Docker restarts the payment service. Recovery is verified when the container is running and /health reports healthy.",
    afterLabel: "In progress",
    afterLabelColor: "text-amber-400",
    statusLabel: "In progress",
    statusBg: "bg-amber-500/10",
    statusColor: "text-amber-300",
    StatusIcon: Activity,
  },
  {
    id: "inventory-integrity",
    name: "Inventory Integrity Audit",
    before:
      "Invalid stock or price values go undetected; there is no automated integrity verification.",
    after:
      "Read-only inventory audit scans all products and reports invalid stock/prices without modifying data.",
    afterLabel: "Not measured",
    afterLabelColor: "text-[#858B7D]",
    statusLabel: "Unavailable",
    statusBg: "bg-[#292D24]",
    statusColor: "text-[#C5C9BF]",
    StatusIcon: Clock3,
  },
  {
    id: "last-item-race",
    name: "Last-Item Race Condition",
    before:
      "Two concurrent checkouts can both reserve the final item, causing oversale and inconsistent stock/order state.",
    after:
      "Conditional atomic stock reservation accepts one checkout and rejects the competitor; stock and order consistency is verified.",
    afterLabel: "Failed",
    afterLabelColor: "text-red-400",
    statusLabel: "Failed",
    statusBg: "bg-red-500/10",
    statusColor: "text-red-300",
    StatusIcon: AlertTriangle,
  },
];
