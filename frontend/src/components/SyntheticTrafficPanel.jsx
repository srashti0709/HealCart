import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_ENDPOINTS } from "../config/api";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Gauge,
  LoaderCircle,
  Play,
  RefreshCw,
  Square,
  Timer,
  Wifi,
} from "lucide-react";

const DEFAULT_LIMITS = {
  ratePerSecond: { min: 1, max: 20, default: 5 },
  concurrency: { min: 1, max: 8, default: 2 },
  durationSeconds: { min: 5, max: 120, default: 30 },
  requestTimeoutMs: { min: 500, max: 10000, default: 5000 },
  maxRequestsPerRun: 1000,
};

const FALLBACK_ENDPOINTS = [
  {
    id: "products-list",
    label: "Product catalog",
    method: "GET",
    path: "/api/products",
    description: "Reads the full product catalog from MongoDB.",
  },
  {
    id: "health",
    label: "Backend health",
    method: "GET",
    path: "/api/health",
    description: "Read-only health probe.",
  },
];

const formatNumber = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : "Not available";

const formatLatency = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} ms`
    : "Not available";

const formatTimestamp = (value) => {
  if (!value) return "Not available";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleTimeString();
};

const formatDuration = (milliseconds) => {
  if (
    typeof milliseconds !== "number" ||
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  ) {
    return "Not available";
  }

  return `${(milliseconds / 1000).toFixed(1)}s`;
};

const outcomeStyles = {
  success: "bg-emerald-500/10 cc-green",
  http_error: "bg-amber-500/10 cc-amber",
  timeout: "bg-red-500/10 cc-red",
  network_error: "bg-red-500/10 cc-red",
  aborted: "bg-[var(--cc-surface)] cc-muted",
};

const outcomeLabels = {
  success: "Success",
  http_error: "HTTP error",
  timeout: "Timeout",
  network_error: "Network error",
  aborted: "Aborted",
};

const statusBadgeStyles = {
  running: "border-cyan-500/30 bg-cyan-500/10 cc-lime",
  completed: "border-emerald-500/30 bg-emerald-500/10 cc-green",
  stopped: "border-amber-500/30 bg-amber-500/10 cc-amber",
  failed: "border-red-500/30 bg-red-500/10 cc-red",
};

export default function SyntheticTrafficPanel() {
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [availableEndpoints, setAvailableEndpoints] = useState([]);
  const [controllerError, setControllerError] = useState("");
  const [target, setTarget] = useState("");

  const [ratePerSecond, setRatePerSecond] = useState(5);
  const [concurrency, setConcurrency] = useState(2);
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(5000);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);

  const [status, setStatus] = useState(null);
  const [requests, setRequests] = useState([]);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyConfig = useCallback((nextLimits, endpoints) => {
    setLimits(nextLimits);
    setAvailableEndpoints(endpoints);

    setRatePerSecond((current) =>
      Math.min(
        Math.max(current, nextLimits.ratePerSecond.min),
        nextLimits.ratePerSecond.max
      )
    );
    setConcurrency((current) =>
      Math.min(
        Math.max(current, nextLimits.concurrency.min),
        nextLimits.concurrency.max
      )
    );
    setDurationSeconds((current) =>
      Math.min(
        Math.max(current, nextLimits.durationSeconds.min),
        nextLimits.durationSeconds.max
      )
    );
    setRequestTimeoutMs((current) =>
      Math.min(
        Math.max(current, nextLimits.requestTimeoutMs.min),
        nextLimits.requestTimeoutMs.max
      )
    );
    setSelectedEndpoints((current) => {
      const valid = current.filter((id) =>
        endpoints.some((endpoint) => endpoint.id === id)
      );

      if (valid.length > 0) {
        return valid;
      }

      return endpoints
        .slice(0, 2)
        .map((endpoint) => endpoint.id);
    });
  }, []);

  const loadMetadata = useCallback(async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.trafficEndpoints, {
        timeout: 5000,
      });

      const endpoints = Array.isArray(response.data?.endpoints)
        ? response.data.endpoints
        : FALLBACK_ENDPOINTS;

      const nextLimits = response.data?.limits
        ? { ...DEFAULT_LIMITS, ...response.data.limits }
        : DEFAULT_LIMITS;

      applyConfig(nextLimits, endpoints);

      if (response.data?.target) {
        setTarget(response.data.target);
      }

      setControllerError("");
    } catch (error) {
      applyConfig(DEFAULT_LIMITS, FALLBACK_ENDPOINTS);
      setControllerError(
        error?.code === "ECONNABORTED"
          ? "The traffic controller did not respond in time."
          : "The traffic controller is unavailable. Start it before running traffic."
      );
    }
  }, [applyConfig]);

  const loadStatus = useCallback(async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.trafficStatus, {
        timeout: 5000,
      });

      if (!mountedRef.current) return;

      setStatus(response.data);
      setControllerError("");
    } catch (error) {
      if (!mountedRef.current) return;

      setStatus(null);
      setControllerError(
        error?.code === "ECONNABORTED"
          ? "The traffic controller did not respond in time."
          : "The traffic controller is unavailable on port 5003."
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.trafficRequests, {
        timeout: 5000,
        params: { limit: 50 },
      });

      if (!mountedRef.current) return;

      setRequests(Array.isArray(response.data?.requests) ? response.data.requests : []);
    } catch {
      if (!mountedRef.current) return;

      setRequests([]);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await loadMetadata();
    };

    load();
  }, [loadMetadata]);

  useEffect(() => {
    const load = async () => {
      await loadStatus();
    };

    load();
  }, [loadStatus]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      await loadStatus();

      if (cancelled) return;

      await loadRequests();
    };

    const intervalId = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [loadStatus, loadRequests]);

  const run = status?.active || status?.lastRun || null;
  const isRunning = Boolean(status?.running);
  const summary = run?.summary || null;
  const latency = summary?.latency || null;

  const toggleEndpoint = (id) => {
    setSelectedEndpoints((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  };

  const startTraffic = async () => {
    setStarting(true);
    setActionError("");
    setActionMessage("");

    try {
      const response = await axios.post(
        API_ENDPOINTS.trafficStart,
        {
          ratePerSecond,
          concurrency,
          durationSeconds,
          requestTimeoutMs,
          endpoints: selectedEndpoints,
        },
        { timeout: 8000 }
      );

      setActionMessage(
        `Traffic run ${response.data?.experimentId || ""} started.`.trim()
      );
      setRequests([]);

      await Promise.all([loadStatus(), loadRequests()]);
    } catch (error) {
      const details = Array.isArray(error?.response?.data?.errors)
        ? error.response.data.errors.join(" ")
        : "";

      setActionError(
        [error?.response?.data?.message || error.message, details]
          .filter(Boolean)
          .join(" ")
      );
    } finally {
      setStarting(false);
    }
  };

  const stopTraffic = async () => {
    setStopping(true);
    setActionError("");
    setActionMessage("");

    try {
      const response = await axios.post(API_ENDPOINTS.trafficStop, {}, {
        timeout: 8000,
      });

      setActionMessage(
        response.data?.message || "Stop requested. Finishing in-flight requests."
      );

      await Promise.all([loadStatus(), loadRequests()]);
    } catch (error) {
      setActionError(
        error?.response?.data?.message ||
          error.message ||
          "The stop request could not be delivered."
      );
    } finally {
      setStopping(false);
    }
  };

  const statusDistribution = summary?.statusDistribution
    ? Object.entries(summary.statusDistribution).sort(
        (a, b) => Number(b[1]) - Number(a[1])
      )
    : [];

  const maxStatusCount = statusDistribution.reduce(
    (max, [, count]) => Math.max(max, count),
    0
  );

  const history = Array.isArray(status?.history) ? status.history : [];

  return (
    <section
      id="synthetic-traffic"
      className="scroll-mt-6 rounded-2xl border border-cc-border bg-cc-panel p-8"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-5">
          <div className="rounded-xl bg-cyan-400/10 p-2.5 cc-lime">
            <Gauge size={21} />
          </div>

          <div>
            <p className="text-sm font-medium uppercase tracking-wider cc-lime">
              Load Simulation
            </p>
            <h3 className="mt-1 text-2xl font-semibold cc-text">
              Synthetic Traffic
            </h3>
            <p className="mt-1 text-base cc-muted">
              Sends real, read-only GET requests to the HealCart backend and
              records the outcome of every request.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {isRunning ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 cc-lime">
              <LoaderCircle className="h-3 w-3 animate-spin" />
              Running
            </span>
          ) : run ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                statusBadgeStyles[run.status] || statusBadgeStyles.stopped
              }`}
            >
              {run.status === "completed" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : run.status === "failed" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Ban className="h-3 w-3" />
              )}
              {run.status}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cc-border bg-[var(--cc-panel)] px-2.5 py-1 cc-muted">
              Idle
            </span>
          )}

          {run?.experimentId ? (
            <span className="rounded-full border border-cc-border px-2.5 py-1 font-mono text-[12px] cc-muted">
              {run.experimentId}
            </span>
          ) : null}
        </div>
      </div>

      {controllerError ? (
        <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-base text-amber-200">
          {controllerError}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="rounded-2xl border border-cc-border bg-cc-panel p-6">
          <h4 className="font-semibold cc-text">Traffic Configuration</h4>
          <p className="mt-1 text-sm cc-muted">
            Every limit is enforced again by the controller before a run
            starts.
          </p>

          <div className="mt-5 space-y-5">
            <div>
              <label
                htmlFor="traffic-rate"
                className="mb-2 flex items-center justify-between text-base cc-muted"
              >
                <span className="inline-flex items-center gap-2">
                  <Activity size={15} />
                  Request rate
                </span>
                <span className="text-sm cc-muted">
                  {limits.ratePerSecond.min}–{limits.ratePerSecond.max} req/s
                </span>
              </label>

              <input
                id="traffic-rate"
                type="number"
                min={limits.ratePerSecond.min}
                max={limits.ratePerSecond.max}
                value={ratePerSecond}
                disabled={isRunning}
                onChange={(event) =>
                  setRatePerSecond(Number(event.target.value))
                }
                className="w-full rounded-xl border border-cc-border bg-cc-panel px-4 py-2.5 text-base cc-text outline-none focus:border-[var(--cc-lime)] disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="traffic-concurrency"
                className="mb-2 flex items-center justify-between text-base cc-muted"
              >
                <span className="inline-flex items-center gap-2">
                  <Wifi size={15} />
                  Concurrency
                </span>
                <span className="text-sm cc-muted">
                  {limits.concurrency.min}–{limits.concurrency.max} workers
                </span>
              </label>

              <input
                id="traffic-concurrency"
                type="number"
                min={limits.concurrency.min}
                max={limits.concurrency.max}
                value={concurrency}
                disabled={isRunning}
                onChange={(event) =>
                  setConcurrency(Number(event.target.value))
                }
                className="w-full rounded-xl border border-cc-border bg-cc-panel px-4 py-2.5 text-base cc-text outline-none focus:border-[var(--cc-lime)] disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="traffic-duration"
                className="mb-2 flex items-center justify-between text-base cc-muted"
              >
                <span className="inline-flex items-center gap-2">
                  <Clock3 size={15} />
                  Test duration
                </span>
                <span className="text-sm cc-muted">
                  {limits.durationSeconds.min}–{limits.durationSeconds.max}s
                </span>
              </label>

              <input
                id="traffic-duration"
                type="number"
                min={limits.durationSeconds.min}
                max={limits.durationSeconds.max}
                value={durationSeconds}
                disabled={isRunning}
                onChange={(event) =>
                  setDurationSeconds(Number(event.target.value))
                }
                className="w-full rounded-xl border border-cc-border bg-cc-panel px-4 py-2.5 text-base cc-text outline-none focus:border-[var(--cc-lime)] disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="traffic-timeout"
                className="mb-2 flex items-center justify-between text-base cc-muted"
              >
                <span className="inline-flex items-center gap-2">
                  <Timer size={15} />
                  Request timeout
                </span>
                <span className="text-sm cc-muted">
                  {limits.requestTimeoutMs.min}–{limits.requestTimeoutMs.max} ms
                </span>
              </label>

              <input
                id="traffic-timeout"
                type="number"
                step={100}
                min={limits.requestTimeoutMs.min}
                max={limits.requestTimeoutMs.max}
                value={requestTimeoutMs}
                disabled={isRunning}
                onChange={(event) =>
                  setRequestTimeoutMs(Number(event.target.value))
                }
                className="w-full rounded-xl border border-cc-border bg-cc-panel px-4 py-2.5 text-base cc-text outline-none focus:border-[var(--cc-lime)] disabled:opacity-50"
              />
            </div>

            <div>
              <p className="mb-2 text-base cc-muted">
                Approved read-only endpoints
              </p>

              {availableEndpoints.length === 0 ? (
                <p className="rounded-xl border border-cc-border p-4 text-sm cc-muted">
                  No approved endpoints are available.
                </p>
              ) : (
                <div className="space-y-3">
                  {availableEndpoints.map((endpoint) => {
                    const selected = selectedEndpoints.includes(endpoint.id);

                    return (
                      <label
                        key={endpoint.id}
                        className={`flex cursor-pointer items-start gap-5 rounded-xl border p-4 transition ${
                          selected
                            ? "border-cyan-700 bg-cyan-500/5"
                            : "border-cc-border bg-cc-panel"
                        } ${isRunning ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={isRunning}
                          onChange={() => toggleEndpoint(endpoint.id)}
                          className="mt-0.5 h-4 w-4 accent-cyan-400"
                        />

                        <span className="min-w-0">
                          <span className="block text-base cc-text">
                            {endpoint.label}
                          </span>
                          <span className="mt-0.5 block font-mono text-[12px] cc-lime">
                            {endpoint.method} {endpoint.path}
                          </span>
                          <span className="mt-1 block text-sm cc-muted">
                            {endpoint.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startTraffic}
              disabled={
                starting ||
                isRunning ||
                controllerError ||
                selectedEndpoints.length === 0
              }
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-base font-semibold cc-text transition hover:bg-[var(--cc-lime)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {starting ? "Starting..." : "Start Traffic"}
            </button>

            <button
              type="button"
              onClick={stopTraffic}
              disabled={!isRunning || stopping}
              className="inline-flex items-center gap-2 rounded-xl border border-red-700 px-4 py-2.5 text-base cc-red transition hover:bg-[var(--cc-red)]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stopping ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {stopping ? "Stopping..." : "Stop Traffic"}
            </button>
          </div>

          {actionError ? (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-base cc-red">
              {actionError}
            </p>
          ) : null}

          {actionMessage ? (
            <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-base cc-green">
              {actionMessage}
            </p>
          ) : null}

          <div className="mt-5 space-y-1 border-t border-cc-border pt-3 text-sm cc-muted">
            <p>
              Target:{" "}
              <span className="font-mono cc-muted">
                {target || "Not available"}
              </span>
            </p>
            <p>
              Maximum requests per run:{" "}
              <span className="cc-muted">
                {formatNumber(limits.maxRequestsPerRun)}
              </span>
            </p>
            <p>
              Read-only guarantee: only approved GET endpoints are ever
              requested.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-cc-border bg-cc-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <h4 className="font-semibold cc-text">Live Results</h4>

              {run?.experimentId ? (
                <span className="inline-flex items-center gap-1.5 text-sm cc-muted">
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      isRunning ? "animate-spin cc-lime" : "cc-muted"
                    }`}
                  />
                  {isRunning ? "Updating" : "Last run"}
                </span>
              ) : null}
            </div>

            {loading && !run ? (
              <div className="mt-5 flex min-h-[120px] items-center justify-center gap-5 rounded-xl border border-cc-border bg-cc-panel p-8 text-base cc-muted">
                <LoaderCircle className="h-4 w-4 animate-spin cc-lime" />
                Loading traffic controller status...
              </div>
            ) : !run ? (
              <div className="mt-5 rounded-xl border border-cc-border bg-cc-panel p-8 text-center text-base cc-muted">
                <Activity className="mx-auto mb-4 cc-muted" size={24} />
                <p className="font-medium cc-muted">
                  No traffic run recorded yet.
                </p>
                <p className="mt-1 cc-muted">
                  Configure a run and press Start Traffic to generate real
                  request records.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Total requests</p>
                    <p className="mt-2 text-3xl font-bold cc-text">
                      {formatNumber(summary?.totalRequests)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Successful</p>
                    <p className="mt-2 text-3xl font-bold cc-green">
                      {formatNumber(summary?.successfulRequests)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Failed</p>
                    <p className="mt-2 text-3xl font-bold cc-red">
                      {formatNumber(summary?.failedRequests)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Elapsed time</p>
                    <p className="mt-2 text-3xl font-bold cc-text">
                      {formatDuration(run.elapsedMs)}
                    </p>
                  </article>
                </div>

                <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">HTTP errors</p>
                    <p className="mt-2 text-2xl font-semibold cc-amber">
                      {formatNumber(summary?.httpErrorRequests)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Timeouts</p>
                    <p className="mt-2 text-2xl font-semibold cc-red">
                      {formatNumber(summary?.timeoutRequests)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Network errors</p>
                    <p className="mt-2 text-2xl font-semibold cc-red">
                      {formatNumber(summary?.networkErrorRequests)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Average latency</p>
                    <p className="mt-2 text-2xl font-semibold cc-lime">
                      {formatLatency(latency?.averageMs)}
                    </p>
                  </article>
                </div>

                <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Min latency</p>
                    <p className="mt-2 text-lg font-semibold cc-text">
                      {formatLatency(latency?.minMs)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">p95 latency</p>
                    <p className="mt-2 text-lg font-semibold cc-text">
                      {formatLatency(latency?.p95Ms)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">
                      Achieved rate
                    </p>
                    <p className="mt-2 text-lg font-semibold cc-text">
                      {formatNumber(summary?.achievedRatePerSecond)} req/s
                    </p>
                  </article>

                  <article className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm cc-muted">Latency samples</p>
                    <p className="mt-2 text-lg font-semibold cc-text">
                      {formatNumber(latency?.samples)}
                    </p>
                  </article>
                </div>

                <div className="mt-5 grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm font-semibold uppercase tracking-wider cc-muted">
                      HTTP status outcomes
                    </p>

                    {statusDistribution.length === 0 ? (
                      <p className="mt-4 text-base cc-muted">
                        No HTTP response was received yet.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {statusDistribution.map(([status, count]) => (
                          <div key={status}>
                            <div className="mb-1 flex justify-between text-sm">
                              <span className="cc-muted">
                                HTTP {status}
                              </span>
                              <span className="cc-muted">{count}</span>
                            </div>

                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--cc-surface)]">
                              <div
                                className="h-full rounded-full bg-cyan-400"
                                style={{
                                  width: `${
                                    maxStatusCount > 0
                                      ? (count / maxStatusCount) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-cc-border bg-cc-panel p-5">
                    <p className="text-sm font-semibold uppercase tracking-wider cc-muted">
                      Per endpoint
                    </p>

                    {summary?.perEndpoint?.length ? (
                      <div className="mt-4 space-y-4">
                        {summary.perEndpoint.map((entry) => (
                          <div
                            key={`${entry.endpointId}-${entry.endpoint}`}
                            className="rounded border border-cc-border p-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate font-mono cc-muted">
                                {entry.method} {entry.endpoint}
                              </span>
                              <span className="cc-muted">
                                {entry.successfulRequests}/{entry.totalRequests}
                              </span>
                            </div>

                            <p className="mt-1 text-[12px] cc-muted">
                              Average latency:{" "}
                              {formatLatency(entry.averageLatencyMs)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-base cc-muted">
                        No endpoint has been requested yet.
                      </p>
                    )}
                  </div>
                </div>

                {run.error ? (
                  <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-base cc-red">
                    {run.error}
                  </p>
                ) : null}

                {run.skippedEndpoints?.length ? (
                  <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                    Skipped endpoints:{" "}
                    {run.skippedEndpoints
                      .map((entry) => `${entry.id} (${entry.reason})`)
                      .join(" · ")}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-cc-border bg-cc-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <h4 className="font-semibold cc-text">Request Log</h4>
              <span className="rounded-full border border-cc-border px-2.5 py-1 text-sm cc-muted">
                {requests.length} shown
              </span>
            </div>

            {requests.length === 0 ? (
              <p className="mt-5 rounded-xl border border-cc-border p-5 text-base cc-muted">
                No request records yet. Every executed request is logged here
                with its actual outcome.
              </p>
            ) : (
              <div className="mt-5 max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-cc-panel cc-muted">
                    <tr>
                      <th className="px-2 py-2.5 font-medium">Time</th>
                      <th className="px-2 py-2.5 font-medium">Endpoint</th>
                      <th className="px-2 py-2.5 font-medium">Status</th>
                      <th className="px-2 py-2.5 font-medium">Latency</th>
                      <th className="px-2 py-2.5 font-medium">Outcome</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[var(--cc-border)]">
                    {requests.map((record) => (
                      <tr key={record.id} className="align-top">
                        <td className="whitespace-nowrap px-2 py-2.5 cc-muted">
                          {formatTimestamp(record.timestamp)}
                        </td>
                        <td className="px-2 py-2.5 font-mono cc-muted">
                          {record.method} {record.endpoint}
                        </td>
                        <td className="px-2 py-2.5 cc-muted">
                          {record.httpStatus ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 cc-muted">
                          {formatLatency(record.latencyMs)}
                        </td>
                        <td className="px-2 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${
                              outcomeStyles[record.outcome] ||
                              outcomeStyles.aborted
                            }`}
                            title={record.error || ""}
                          >
                            {outcomeLabels[record.outcome] || record.outcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-cc-border bg-cc-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <h4 className="font-semibold cc-text">Run History</h4>
              <span className="rounded-full border border-cc-border px-2.5 py-1 text-sm cc-muted">
                {history.length} recorded
              </span>
            </div>

            {history.length === 0 ? (
              <p className="mt-5 rounded-xl border border-cc-border p-5 text-base cc-muted">
                No completed traffic runs recorded yet.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {history.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-cc-border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[12px] cc-muted">
                        {entry.id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${
                          statusBadgeStyles[entry.status] ||
                          statusBadgeStyles.stopped
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>

                    <p className="mt-2 text-sm cc-muted">
                      {entry.summary?.totalRequests ?? 0} requests ·{" "}
                      {entry.summary?.successfulRequests ?? 0} successful ·{" "}
                      {entry.summary?.failedRequests ?? 0} failed ·{" "}
                      {formatLatency(entry.summary?.latency?.averageMs)}{" "}
                      average
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
