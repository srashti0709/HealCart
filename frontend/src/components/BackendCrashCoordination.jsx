import { AlertTriangle, CheckCircle2, Gauge, Activity, Wifi } from "lucide-react";



/**
 * Shared Backend Crash coordination controls and result for the Command Center.
 * The request itself lives in the useBackendCrash hook.
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

  completed: "bg-emerald-500/10 text-emerald-300",

  stopped: "bg-amber-500/10 text-amber-300",

  failed: "bg-red-500/10 text-red-300",

  running: "bg-lime-300/10 text-lime-200",

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

    <div className="mt-4 rounded-xl border border-white/10 bg-[#11110f] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition-colors hover:border-white/15">

      <label className="flex cursor-pointer items-start gap-3">

        <input

          type="checkbox"

          checked={enabled}

          disabled={disabled}

          onChange={(event) => onToggle(event.target.checked)}

          className="mt-0.5 h-4 w-4 accent-lime-300"

        />

        <span>

          <span className="block text-sm text-zinc-200">

            Coordinate with Synthetic Traffic

          </span>

          <span className="mt-1 block text-xs text-zinc-500">

            Sends real read-only traffic before, during and after the crash so

            the outage is captured as observed request failures. The controller

            enforces every limit again before the crash is triggered.

          </span>

        </span>

      </label>



      {enabled && (

        <div className="mt-4 grid gap-3 sm:grid-cols-2">

          <div>

            <label

              htmlFor="crash-traffic-rate"

              className="mb-1 flex items-center justify-between text-xs text-zinc-400"

            >

              <span className="inline-flex items-center gap-2">

                <Activity size={13} />

                Request rate

              </span>

              <span className="text-zinc-500">

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

              className="w-full rounded-lg border border-white/10 bg-[#171715] px-3 py-2 text-sm text-[#f4f1e8] outline-none transition-colors placeholder:text-zinc-600 focus:border-lime-300 focus:ring-1 focus:ring-lime-300/20 disabled:opacity-50"

            />

          </div>



          <div>

            <label

              htmlFor="crash-traffic-concurrency"

              className="mb-1 flex items-center justify-between text-xs text-zinc-400"

            >

              <span className="inline-flex items-center gap-2">

                <Wifi size={13} />

                Concurrency

              </span>

              <span className="text-zinc-500">

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

              className="w-full rounded-lg border border-white/10 bg-[#171715] px-3 py-2 text-sm text-[#f4f1e8] outline-none transition-colors placeholder:text-zinc-600 focus:border-lime-300 focus:ring-1 focus:ring-lime-300/20 disabled:opacity-50"

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

      <div className="mt-4 rounded-lg border border-white/10 bg-[#11110f] p-4 text-sm text-zinc-500">

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

    <div className="mt-4 rounded-xl border border-white/10 bg-[#11110f] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition-colors hover:border-white/15">

      <div className="flex flex-wrap items-center justify-between gap-2">

        <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#f4f1e8]">

          <Gauge size={15} className="text-lime-300" />

          Synthetic Traffic Result

        </p>



        <span

          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${

            statusStyles[traffic.status] || "bg-white/10 text-zinc-300"

          }`}

        >

          {traffic.status || "Unknown"}

        </span>

      </div>



      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">

        <p className="text-zinc-500">

          Traffic experiment:{" "}

          <span className="font-mono text-zinc-300">

            {traffic.experimentId || "Not available"}

          </span>

        </p>

        <p className="text-zinc-500">

          Correlation ID:{" "}

          <span className="font-mono text-zinc-300">

            {traffic.correlationId || "Not available"}

          </span>

        </p>

        <p className="text-zinc-500">

          Cleanup:{" "}

          <span

            className={

              cleanup.stopped ? "text-emerald-300" : "text-amber-300"

            }

          >

            {cleanup.stopped

              ? "Coordinated run stopped"

              : cleanup.error

                ? `Not stopped: ${cleanup.error}`

                : "Not stopped"}

          </span>

        </p>

        <p className="text-zinc-500">

          Request source: <span className="text-zinc-300">synthetic</span>

        </p>

      </div>



      {summary ? (

        <>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">Total requests</p>

              <p className="mt-1 text-sm font-semibold text-[#f4f1e8]">

                {formatNumber(summary.totalRequests)}

              </p>

            </div>

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">Successful</p>

              <p className="mt-1 text-sm font-semibold text-emerald-400">

                {formatNumber(summary.successfulRequests)}

              </p>

            </div>

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">Failed</p>

              <p className="mt-1 text-sm font-semibold text-red-400">

                {formatNumber(summary.failedRequests)}

              </p>

            </div>

          </div>



          <div className="mt-2 grid gap-2 sm:grid-cols-3">

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">Timeouts</p>

              <p className="mt-1 text-sm font-semibold text-amber-300">

                {formatNumber(summary.timeoutRequests)}

              </p>

            </div>

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">Network errors</p>

              <p className="mt-1 text-sm font-semibold text-amber-300">

                {formatNumber(summary.networkErrorRequests)}

              </p>

            </div>

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">HTTP errors</p>

              <p className="mt-1 text-sm font-semibold text-amber-300">

                {formatNumber(summary.httpErrorRequests)}

              </p>

            </div>

          </div>



          <div className="mt-2 grid gap-2 sm:grid-cols-3">

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">Average latency</p>

              <p className="mt-1 text-sm font-semibold text-lime-200">

                {formatLatency(latency?.averageMs)}

              </p>

            </div>

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">p95 latency</p>

              <p className="mt-1 text-sm font-semibold text-zinc-200">

                {formatLatency(latency?.p95Ms)}

              </p>

            </div>

            <div className="rounded border border-white/10 p-2">

              <p className="text-[11px] text-zinc-500">Latency samples</p>

              <p className="mt-1 text-sm font-semibold text-zinc-200">

                {formatNumber(latency?.samples)}

              </p>

            </div>

          </div>



          {Object.keys(summary.statusDistribution || {}).length > 0 && (

            <p className="mt-3 text-xs text-zinc-500">

              HTTP outcomes:{" "}

              {Object.entries(summary.statusDistribution)

                .map(([status, count]) => `${status} × ${count}`)

                .join(", ")}

            </p>

          )}

        </>

      ) : (

        <p className="mt-3 rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">

          The traffic summary is unavailable

          {traffic.summaryError ? `: ${traffic.summaryError}` : "."}

        </p>

      )}



      {body.experimentFailed === false && (

        <p className="mt-3 flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">

          <AlertTriangle size={14} className="mt-0.5 shrink-0" />

          The crash experiment did not run, so no crash was triggered.

        </p>

      )}



      {body.success === false && body.experimentFailed !== false && (

        <p className="mt-3 flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">

          <AlertTriangle size={14} className="mt-0.5 shrink-0" />

          The crash experiment failed: {body.message || "Unknown failure."}

        </p>

      )}



      {body.success === true && (

        <p className="mt-3 flex items-start gap-2 rounded border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">

          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />

          The backend crash was recovered and the traffic result above was

          observed during the same run.

        </p>

      )}

    </div>

  );

}
