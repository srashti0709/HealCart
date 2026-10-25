import { AlertTriangle, CheckCircle2, Gauge, Activity, Wifi } from "lucide-react";

/**
 * Shared Backend Crash coordination controls and result for the Command
 * Center. The request itself lives in the useBackendCrash hook.
 */

const formatNumber = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : "Not available";

const formatLatency = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} ms`
    : "Not available";

const statusStyles = {
  completed: "bg-[var(--cc-green)]/10 cc-green",
  stopped: "bg-[var(--cc-amber)]/10 cc-amber",
  failed: "bg-[var(--cc-red)]/10 cc-red",
  running: "bg-[var(--cc-lime)]/10 cc-lime",
};

export function BackendCrashCoordinationControls({
  enabled,
  onToggle,
  rate,
  onRateChange,
  concurrency,
  onConcurrencyChange,
  limits,
  disabled,
}) {
  return (
    <div className="mt-4 rounded-lg border border-cc-border bg-cc-panel p-5">
      <label className="flex cursor-pointer items-start gap-4">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-cyan-400"
        />
        <span>
          <span className="block text-base cc-text">
            Coordinate with Synthetic Traffic
          </span>
          <span className="mt-1 block text-sm cc-muted">
            Sends real read-only traffic before, during and after the crash so
            the outage is captured as observed request failures. The controller
            enforces every limit again before the crash is triggered.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="crash-traffic-rate"
              className="mb-1 flex items-center justify-between text-sm cc-muted"
            >
              <span className="inline-flex items-center gap-2">
                <Activity size={14} />
                Request rate
              </span>
              <span className="cc-muted">
                {limits.ratePerSecond.min}-{limits.ratePerSecond.max} req/s
              </span>
            </label>
            <input
              id="crash-traffic-rate"
              type="number"
              min={limits.ratePerSecond.min}
              max={limits.ratePerSecond.max}
              value={rate}
              disabled={disabled}
              onChange={(event) => onRateChange(event.target.value)}
              className="w-full rounded-lg border border-cc-border bg-cc-panel px-4 py-2.5 text-base cc-text outline-none focus:border-[var(--cc-lime)] disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="crash-traffic-concurrency"
              className="mb-1 flex items-center justify-between text-sm cc-muted"
            >
              <span className="inline-flex items-center gap-2">
                <Wifi size={14} />
                Concurrency
              </span>
              <span className="cc-muted">
                {limits.concurrency.min}-{limits.concurrency.max} workers
              </span>
            </label>
            <input
              id="crash-traffic-concurrency"
              type="number"
              min={limits.concurrency.min}
              max={limits.concurrency.max}
              value={concurrency}
              disabled={disabled}
              onChange={(event) => onConcurrencyChange(event.target.value)}
              className="w-full rounded-lg border border-cc-border bg-cc-panel px-4 py-2.5 text-base cc-text outline-none focus:border-[var(--cc-lime)] disabled:opacity-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renders the traffic result exactly as the controller reported it.
 * Missing values are shown as "Not available" instead of a zero.
 */
export function BackendCrashTrafficResult({ response, coordinationRequested }) {
  if (!response) return null;

  const body = response.body || {};
  const traffic = body.traffic;

  if (!traffic) {
    return (
      <div className="mt-4 rounded-lg border border-cc-border bg-cc-panel p-5 text-base cc-muted">
        {coordinationRequested
          ? `The controller did not return a traffic result for this run.${
              body.message ? ` ${body.message}` : ""
            }`
          : "Traffic coordination was not requested for this run, so no traffic result was recorded."}
      </div>
    );
  }

  const summary = traffic.summaryAvailable ? traffic.summary : null;
  const latency = summary?.latency || null;
  const cleanup = traffic.cleanup || {};

  return (
    <div className="mt-4 rounded-lg border border-cc-border bg-cc-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-base font-semibold cc-text">
          <Gauge size={16} className="cc-lime" />
          Synthetic Traffic Result
        </p>

        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${
            statusStyles[traffic.status] || "bg-[var(--cc-surface)] cc-muted"
          }`}
        >
          {traffic.status || "Unknown"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <p className="cc-muted">
          Traffic experiment:{" "}
          <span className="font-mono cc-muted">
            {traffic.experimentId || "Not available"}
          </span>
        </p>
        <p className="cc-muted">
          Correlation ID:{" "}
          <span className="font-mono cc-muted">
            {traffic.correlationId || "Not available"}
          </span>
        </p>
        <p className="cc-muted">
          Cleanup:{" "}
          <span
            className={
              cleanup.stopped ? "cc-green" : "cc-amber"
            }
          >
            {cleanup.stopped
              ? "Coordinated run stopped"
              : cleanup.error
                ? `Not stopped: ${cleanup.error}`
                : "Not stopped"}
          </span>
        </p>
        <p className="cc-muted">
          Request source: <span className="cc-muted">synthetic</span>
        </p>
      </div>

      {summary ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">Total requests</p>
              <p className="mt-1 text-base font-semibold cc-text">
                {formatNumber(summary.totalRequests)}
              </p>
            </div>
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">Successful</p>
              <p className="mt-1 text-base font-semibold cc-green">
                {formatNumber(summary.successfulRequests)}
              </p>
            </div>
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">Failed</p>
              <p className="mt-1 text-base font-semibold text-red-400">
                {formatNumber(summary.failedRequests)}
              </p>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">Timeouts</p>
              <p className="mt-1 text-base font-semibold cc-amber">
                {formatNumber(summary.timeoutRequests)}
              </p>
            </div>
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">Network errors</p>
              <p className="mt-1 text-base font-semibold cc-amber">
                {formatNumber(summary.networkErrorRequests)}
              </p>
            </div>
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">HTTP errors</p>
              <p className="mt-1 text-base font-semibold cc-amber">
                {formatNumber(summary.httpErrorRequests)}
              </p>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">Average latency</p>
              <p className="mt-1 text-base font-semibold cc-lime">
                {formatLatency(latency?.averageMs)}
              </p>
            </div>
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">p95 latency</p>
              <p className="mt-1 text-base font-semibold cc-text">
                {formatLatency(latency?.p95Ms)}
              </p>
            </div>
            <div className="rounded border border-cc-border p-2">
              <p className="text-[12px] cc-muted">Latency samples</p>
              <p className="mt-1 text-base font-semibold cc-text">
                {formatNumber(latency?.samples)}
              </p>
            </div>
          </div>

          {Object.keys(summary.statusDistribution || {}).length > 0 && (
            <p className="mt-3 text-sm cc-muted">
              HTTP outcomes:{" "}
              {Object.entries(summary.statusDistribution)
                .map(([status, count]) => `${status} Ã— ${count}`)
                .join(", ")}
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded border border-amber-500/20 bg-[var(--cc-amber)]/10 p-4 text-sm cc-amber">
          The traffic summary is unavailable
          {traffic.summaryError ? `: ${traffic.summaryError}` : "."}
        </p>
      )}

      {body.experimentFailed === false && (
        <p className="mt-3 flex items-start gap-2 rounded border border-amber-500/20 bg-[var(--cc-amber)]/10 p-4 text-sm cc-amber">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          The crash experiment did not run, so no crash was triggered.
        </p>
      )}

      {body.success === false && body.experimentFailed !== false && (
        <p className="mt-3 flex items-start gap-2 rounded border border-red-500/20 bg-[var(--cc-red)]/10 p-4 text-sm cc-red">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          The crash experiment failed: {body.message || "Unknown failure."}
        </p>
      )}

      {body.success === true && (
        <p className="mt-3 flex items-start gap-2 rounded border border-emerald-500/20 bg-[var(--cc-green)]/10 p-4 text-sm cc-green">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          The backend crash was recovered and the traffic result above was
          observed during the same run.
        </p>
      )}
    </div>
  );
}
