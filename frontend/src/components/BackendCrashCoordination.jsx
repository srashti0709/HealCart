
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Activity,
  Wifi,
} from "lucide-react";

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
  completed: "bg-[var(--cc-green)]/10 cc-green border-[var(--cc-green)]/20",
  stopped: "bg-[var(--cc-amber)]/10 cc-amber border-[var(--cc-amber)]/20",
  failed: "bg-[var(--cc-red)]/10 cc-red border-[var(--cc-red)]/20",
  running: "bg-[var(--cc-lime)]/10 cc-lime border-[var(--cc-lime)]/20",
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
    <div className="group relative mt-4 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 shadow-[0_14px_32px_rgba(0,0,0,0.20),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-all duration-300 hover:border-white/[0.13] hover:bg-white/[0.045] sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 0% 0%, rgba(222,237,0,0.065), transparent 58%)",
        }}
      />

      <label className="relative flex cursor-pointer items-start gap-4">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--cc-lime)] disabled:cursor-not-allowed"
        />

        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-[-0.02em] cc-text sm:text-base">
            Coordinate with Synthetic Traffic
          </span>

          <span className="mt-2 block text-[13px] leading-[1.8] cc-muted sm:text-sm">
            Sends real read-only traffic before, during and after the crash so
            the outage is captured as observed request failures. The controller
            enforces every limit again before the crash is triggered.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="relative mt-5 grid gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors hover:border-white/[0.11]">
            <label
              htmlFor="crash-traffic-rate"
              className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] font-medium cc-muted"
            >
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold cc-text">
                <Activity
                  size={16}
                  className="cc-lime"
                  strokeWidth={1.8}
                />
                Request rate
              </span>

              <span className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-[11px] cc-muted">
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
              className="w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 text-[14px] font-medium cc-text outline-none transition-all duration-200 placeholder:cc-muted focus:border-[var(--cc-lime)]/50 focus:bg-white/[0.055] focus:ring-2 focus:ring-[var(--cc-lime)]/10 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors hover:border-white/[0.11]">
            <label
              htmlFor="crash-traffic-concurrency"
              className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] font-medium cc-muted"
            >
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold cc-text">
                <Wifi
                  size={16}
                  className="cc-lime"
                  strokeWidth={1.8}
                />
                Concurrency
              </span>

              <span className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-[11px] cc-muted">
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
              className="w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 text-[14px] font-medium cc-text outline-none transition-all duration-200 placeholder:cc-muted focus:border-[var(--cc-lime)]/50 focus:bg-white/[0.055] focus:ring-2 focus:ring-[var(--cc-lime)]/10 disabled:cursor-not-allowed disabled:opacity-50"
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

export function BackendCrashTrafficResult({
  response,
  coordinationRequested,
}) {
  if (!response) return null;

  const body = response.body || {};
  const traffic = body.traffic;

  if (!traffic) {
    return (
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 text-[13px] leading-[1.8] shadow-[0_12px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl cc-muted sm:p-6 sm:text-sm">
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
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 shadow-[0_16px_36px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.065)] backdrop-blur-xl sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 8% 0%, rgba(222,237,0,0.065), transparent 70%)",
        }}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-3 text-[15px] font-semibold tracking-[-0.025em] cc-text sm:text-base">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cc-lime)]/20 bg-[var(--cc-lime)]/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
            <Gauge size={19} className="cc-lime" strokeWidth={1.8} />
          </span>
          Synthetic Traffic Result
        </p>

        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${
            statusStyles[traffic.status] ||
            "border-white/[0.08] bg-white/[0.04] cc-muted"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              traffic.status === "completed"
                ? "bg-emerald-400"
                : traffic.status === "stopped"
                  ? "bg-amber-400"
                  : traffic.status === "failed"
                    ? "bg-red-400"
                    : traffic.status === "running"
                      ? "bg-[var(--cc-lime)]"
                      : "bg-current"
            }`}
          />
          {traffic.status || "Unknown"}
        </span>
      </div>

      <div className="relative mt-5 grid gap-x-5 gap-y-4 border-t border-white/[0.07] pt-5 text-[12px] sm:grid-cols-2 sm:text-[13px]">
        <p className="min-w-0 cc-muted">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.13em] text-secondary/75">
            Traffic experiment
          </span>
          <span className="block break-all font-mono text-[11px] cc-text">
            {traffic.experimentId || "Not available"}
          </span>
        </p>

        <p className="min-w-0 cc-muted">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.13em] text-secondary/75">
            Correlation ID
          </span>
          <span className="block break-all font-mono text-[11px] cc-text">
            {traffic.correlationId || "Not available"}
          </span>
        </p>

        <p className="cc-muted">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.13em] text-secondary/75">
            Cleanup
          </span>
          <span
            className={`font-medium ${
              cleanup.stopped ? "cc-green" : "cc-amber"
            }`}
          >
            {cleanup.stopped
              ? "Coordinated run stopped"
              : cleanup.error
                ? `Not stopped: ${cleanup.error}`
                : "Not stopped"}
          </span>
        </p>

        <p className="cc-muted">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.13em] text-secondary/75">
            Request source
          </span>
          <span className="font-mono text-[12px] cc-text">synthetic</span>
        </p>
      </div>

      {summary ? (
        <>
          <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.08] bg-black/[0.12] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-white/[0.025]">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                Total requests
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em] cc-text">
                {formatNumber(summary.totalRequests)}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-400/[0.13] bg-emerald-400/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/25">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                Successful
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em] cc-green">
                {formatNumber(summary.successfulRequests)}
              </p>
            </div>

            <div className="rounded-xl border border-red-400/[0.13] bg-red-400/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-all duration-200 hover:-translate-y-0.5 hover:border-red-400/25">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                Failed
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-red-400">
                {formatNumber(summary.failedRequests)}
              </p>
            </div>
          </div>

          <div className="relative mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4 transition-all duration-200 hover:border-white/[0.12]">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                Timeouts
              </p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em] cc-amber">
                {formatNumber(summary.timeoutRequests)}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4 transition-all duration-200 hover:border-white/[0.12]">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                Network errors
              </p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em] cc-amber">
                {formatNumber(summary.networkErrorRequests)}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4 transition-all duration-200 hover:border-white/[0.12]">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                HTTP errors
              </p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em] cc-amber">
                {formatNumber(summary.httpErrorRequests)}
              </p>
            </div>
          </div>

          <div className="relative mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--cc-lime)]/[0.13] bg-[var(--cc-lime)]/[0.025] p-4 transition-all duration-200 hover:border-[var(--cc-lime)]/25">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                Average latency
              </p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em] cc-lime">
                {formatLatency(latency?.averageMs)}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4 transition-all duration-200 hover:border-white/[0.12]">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                p95 latency
              </p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em] cc-text">
                {formatLatency(latency?.p95Ms)}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4 transition-all duration-200 hover:border-white/[0.12]">
              <p className="text-[11px] font-medium tracking-wide cc-muted">
                Latency samples
              </p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em] cc-text">
                {formatNumber(latency?.samples)}
              </p>
            </div>
          </div>

          {Object.keys(summary.statusDistribution || {}).length > 0 && (
            <p className="relative mt-4 rounded-xl border border-white/[0.07] bg-black/[0.10] p-4 text-[12px] leading-[1.8] cc-muted sm:text-[13px]">
              <span className="font-semibold cc-text">HTTP outcomes:</span>{" "}
              {Object.entries(summary.statusDistribution)
                .map(([status, count]) => `${status} × ${count}`)
                .join(", ")}
            </p>
          )}
        </>
      ) : (
        <p className="relative mt-5 rounded-xl border border-amber-500/20 bg-[var(--cc-amber)]/[0.07] p-4 text-[13px] leading-[1.8] cc-amber">
          The traffic summary is unavailable
          {traffic.summaryError ? `: ${traffic.summaryError}` : "."}
        </p>
      )}

      {body.experimentFailed === false && (
        <p className="relative mt-4 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-[var(--cc-amber)]/[0.07] p-4 text-[13px] leading-[1.8] cc-amber">
          <AlertTriangle
            size={17}
            className="mt-0.5 shrink-0"
            strokeWidth={1.8}
          />
          <span>
            The crash experiment did not run, so no crash was triggered.
          </span>
        </p>
      )}

      {body.success === false && body.experimentFailed !== false && (
        <p className="relative mt-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-[var(--cc-red)]/[0.07] p-4 text-[13px] leading-[1.8] cc-red">
          <AlertTriangle
            size={17}
            className="mt-0.5 shrink-0"
            strokeWidth={1.8}
          />
          <span>
            The crash experiment failed: {body.message || "Unknown failure."}
          </span>
        </p>
      )}

      {body.success === true && (
        <p className="relative mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-[var(--cc-green)]/[0.07] p-4 text-[13px] leading-[1.8] cc-green">
          <CheckCircle2
            size={17}
            className="mt-0.5 shrink-0"
            strokeWidth={1.8}
          />
          <span>
            The backend crash was recovered and the traffic result above was
            observed during the same run.
          </span>
        </p>
      )}
    </div>
  );
}
