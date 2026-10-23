import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Zap } from "lucide-react";
import {
  combineTimelineEvents,
  getSourceLabel,
  getDescription,
} from "../lib/timelineMerge";

const outcomeStyles = {
  success: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
    label: "Successful",
  },
  failure: {
    badge: "border-red-500/30 bg-red-500/10 text-red-300",
    dot: "bg-red-400",
    label: "Failed",
  },
  in_progress: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
    label: "In progress",
  },
  unverified: {
    badge: "border-slate-700 bg-slate-800/60 text-slate-300",
    dot: "bg-slate-400",
    label: "Unverified",
  },
};

const parseOutcome = (event) => {
  if (!event || typeof event !== "object") return "unverified";

  if (event.outcome) {
    const normalized = String(event.outcome).toLowerCase();
    if (normalized === "success" || normalized === "passed" || normalized === "healthy") return "success";
    if (normalized === "failure" || normalized === "failed" || normalized === "error") return "failure";
    if (normalized === "in_progress" || normalized === "inprogress" || normalized === "running") return "in_progress";
  }

  if (event.status) {
    const status = String(event.status).toLowerCase();
    if (status === "success" || status === "passed") return "success";
    if (status === "failed" || status === "failure") return "failure";
    if (status === "in_progress" || status === "inprogress" || status === "running") return "in_progress";
  }

  if (event.success === true) return "success";
  if (event.success === false) return "failure";

  const type = String(event.type || "").toLowerCase();
  if (["recovered", "database-recovered", "health-verified", "api-verified", "product-api-verified", "ready", "restored"].some((value) => type.includes(value))) {
    return "success";
  }

  if (["crash", "database-disconnected", "backend-probe-failed", "request-failed", "failed", "error"].some((value) => type.includes(value))) {
    return "failure";
  }

  if (["start", "started", "running", "waiting", "traffic-start", "in-progress"].some((value) => type.includes(value))) {
    return "in_progress";
  }

  return "unverified";
};

const formatTimestamp = (value) => {
  if (!value) return "Unknown timestamp";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown timestamp";

  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export default function IncidentTimeline({ events = [], loading = false, error = "", stale = false, lastUpdated = null, incidents = [] }) {
  const timelineEvents = combineTimelineEvents(events, incidents);

  const hasEvents = timelineEvents.length > 0;

  return (
    <section className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Incident Timeline</h3>
          <p className="mt-1 text-sm text-slate-500">Observed recovery and verification events from the live SHCom stack.</p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {loading ? (
            <>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              <span className="text-slate-500">Updating</span>
            </>
          ) : stale ? (
            <>
              <Clock3 className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-300">Stale data</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-300">Live</span>
            </>
          )}
          <span className="text-slate-500">{lastUpdated ? `Last updated ${formatTimestamp(lastUpdated)}` : "Awaiting event feed"}</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!hasEvents ? (
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-6 text-center text-sm text-slate-400">
          {loading ? (
            <>
              <LoaderCircle className="mx-auto mb-3 h-5 w-5 animate-spin text-cyan-400" />
              <div className="font-medium text-slate-300">Waiting for the recovery monitor feed.</div>
              <div className="mt-1 text-slate-500">Events appear here as soon as the monitor observes a failure or recovery action.</div>
            </>
          ) : (
            <>
              <AlertTriangle className="mx-auto mb-3 text-slate-500" size={24} />
              <div className="font-medium text-slate-300">No incident evidence recorded yet.</div>
              <div className="mt-1 text-slate-500">New events will appear here when the recovery monitor observes a failure or recovery action.</div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {stale && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              The timeline is still showing the most recently observed events, but the recovery feed has not refreshed in the expected window.
            </div>
          )}

          <div className="relative space-y-5 before:absolute before:left-[10px] before:top-0 before:h-full before:w-px before:bg-slate-700/80">
            {timelineEvents.map((event) => {
              const outcome = parseOutcome(event);
              const style = outcomeStyles[outcome] || outcomeStyles.unverified;
              const details = event.details || event.evidence || event.errorSummary || event.error || null;

              return (
                <article key={event.id || `${event.type}-${event.timestamp || "unknown"}`} className="relative pl-8">
                  <span className={`absolute left-0 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-900 ${style.badge}`}>
                    <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  </span>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4 shadow-[0_10px_32px_rgba(15,23,42,0.25)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{(event.type || "event").replace(/[-_]+/g, " ")}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>

                      <time className="text-xs text-slate-400">{formatTimestamp(event.timestamp)}</time>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-300">{getDescription(event)}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1">
                        <Zap className="h-3 w-3 text-cyan-400" />
                        {getSourceLabel(event)}
                      </span>

                      {event.experimentId ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1">
                          <CheckCircle2 className="h-3 w-3 text-violet-400" />
                          Run {event.experimentId}
                        </span>
                      ) : null}
                    </div>

                    {details ? (
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">
                        {typeof details === "string" ? details : JSON.stringify(details)}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
