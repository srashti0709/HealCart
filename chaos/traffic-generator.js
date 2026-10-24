/**
 * SHCom Synthetic Traffic Generator
 * ----------------------------------
 * Sends real, bounded HTTP GET traffic at the SHCom backend and records the
 * actual outcome of every request that was executed.
 *
 * Safety model:
 *  - Only GET requests are ever issued.
 *  - Only server-side allowlisted, read-only endpoints can be requested.
 *  - The target host is fixed server-side and can never be supplied by a client.
 *  - Rate, concurrency, duration, request timeout and total request count are
 *    validated and clamped on the server. Client validation is never trusted.
 *  - A run is always bounded by a maximum duration and a maximum request count,
 *    so closing the browser can never leave an unbounded generator running.
 *  - Stopping a run prevents new requests from starting and aborts in-flight
 *    requests where the platform allows it.
 */

const fs = require("fs");
const path = require("path");

const HISTORY_PATH =
    process.env.TRAFFIC_HISTORY_PATH ||
    path.join(__dirname, "traffic-history.json");

const TRAFFIC_LIMITS = {
    ratePerSecond: { min: 1, max: 20, default: 5 },
    concurrency: { min: 1, max: 8, default: 2 },
    durationSeconds: { min: 5, max: 120, default: 30 },
    requestTimeoutMs: { min: 500, max: 10000, default: 5000 },
    maxRequestsPerRun: 1000,
    maxStoredRequestsPerRun: 200,
    maxStoredRuns: 20,
};

const TARGET_BASE_URL = (
    process.env.TRAFFIC_TARGET_URL || "http://127.0.0.1:5000"
).replace(/\/+$/, "");

/**
 * Read-only endpoint allowlist.
 *
 * Every entry was verified against the live backend routes:
 *   GET /api/products              -> backend/src/routes/productRoutes.js
 *   GET /api/products/:id          -> backend/src/routes/productRoutes.js
 *   GET /api/health                -> backend/src/server.js
 *   GET /api/incidents             -> backend/src/routes/incidentRoutes.js
 *   GET /api/chaos/db-check        -> backend/src/server.js
 *   GET /api/chaos/inventory-audit -> backend/src/server.js
 *
 * No mutating route (POST/PUT/PATCH/DELETE) is present, and no route that
 * creates orders, triggers payments or changes inventory is present.
 */
const ALLOWED_ENDPOINTS = [
    {
        id: "products-list",
        label: "Product catalog",
        method: "GET",
        path: "/api/products",
        description: "Reads the full product catalog from MongoDB.",
    },
    {
        id: "product-detail",
        label: "Product detail",
        method: "GET",
        path: "/api/products/:id",
        description: "Reads a single product. The id is resolved from the live catalog at run start.",
    },
    {
        id: "health",
        label: "Backend health",
        method: "GET",
        path: "/api/health",
        description: "Read-only health probe. Returns HTTP 503 when the database is disconnected.",
    },
    {
        id: "incidents",
        label: "Incident log",
        method: "GET",
        path: "/api/incidents",
        description: "Read-only incident collection read.",
    },
    {
        id: "db-check",
        label: "Database check",
        method: "GET",
        path: "/api/chaos/db-check",
        description: "Read-only product count probe used to verify database connectivity.",
    },
    {
        id: "inventory-audit",
        label: "Inventory audit",
        method: "GET",
        path: "/api/chaos/inventory-audit",
        description: "Read-only audit of product stock and price values.",
    },
];

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

const round = (value) =>
    typeof value === "number" && Number.isFinite(value)
        ? Math.round(value * 100) / 100
        : null;

function toInteger(value) {
    if (typeof value === "number") {
        return Number.isInteger(value) ? value : null;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value.trim());

        return Number.isInteger(parsed) ? parsed : null;
    }

    return null;
}

function findEndpoint(id) {
    return ALLOWED_ENDPOINTS.find((endpoint) => endpoint.id === id) || null;
}

/**
 * Validates a client supplied configuration against the server-side limits.
 * Returns { valid, errors, config } and never trusts client validation.
 */
function validateTrafficConfig(input = {}) {
    const errors = [];
    const config = {};

    const source = input && typeof input === "object" ? input : {};

    const rate = toInteger(source.ratePerSecond);
    if (
        rate === null ||
        rate < TRAFFIC_LIMITS.ratePerSecond.min ||
        rate > TRAFFIC_LIMITS.ratePerSecond.max
    ) {
        errors.push(
            `ratePerSecond must be an integer between ${TRAFFIC_LIMITS.ratePerSecond.min} and ${TRAFFIC_LIMITS.ratePerSecond.max}.`
        );
    } else {
        config.ratePerSecond = rate;
    }

    const concurrency = toInteger(source.concurrency);
    if (
        concurrency === null ||
        concurrency < TRAFFIC_LIMITS.concurrency.min ||
        concurrency > TRAFFIC_LIMITS.concurrency.max
    ) {
        errors.push(
            `concurrency must be an integer between ${TRAFFIC_LIMITS.concurrency.min} and ${TRAFFIC_LIMITS.concurrency.max}.`
        );
    } else {
        config.concurrency = concurrency;
    }

    const duration = toInteger(source.durationSeconds);
    if (
        duration === null ||
        duration < TRAFFIC_LIMITS.durationSeconds.min ||
        duration > TRAFFIC_LIMITS.durationSeconds.max
    ) {
        errors.push(
            `durationSeconds must be an integer between ${TRAFFIC_LIMITS.durationSeconds.min} and ${TRAFFIC_LIMITS.durationSeconds.max}.`
        );
    } else {
        config.durationSeconds = duration;
    }

    const timeout = toInteger(source.requestTimeoutMs);
    if (
        timeout === null ||
        timeout < TRAFFIC_LIMITS.requestTimeoutMs.min ||
        timeout > TRAFFIC_LIMITS.requestTimeoutMs.max
    ) {
        errors.push(
            `requestTimeoutMs must be an integer between ${TRAFFIC_LIMITS.requestTimeoutMs.min} and ${TRAFFIC_LIMITS.requestTimeoutMs.max}.`
        );
    } else {
        config.requestTimeoutMs = timeout;
    }

    if (
        source.method !== undefined &&
        String(source.method).toUpperCase() !== "GET"
    ) {
        errors.push("Only GET requests are permitted for synthetic traffic.");
    }

    if (source.url !== undefined || source.target !== undefined) {
        errors.push(
            "The traffic target is fixed by the controller and cannot be overridden."
        );
    }

    const requested = Array.isArray(source.endpoints)
        ? source.endpoints
        : [];

    if (requested.length === 0) {
        errors.push("Select at least one approved read-only endpoint.");
    }

    const selected = [];
    const rejected = [];

    for (const entry of requested) {
        const id = typeof entry === "string" ? entry : "";

        if (!id) {
            rejected.push("An empty endpoint identifier was supplied.");
            continue;
        }

        const endpoint = findEndpoint(id);

        if (!endpoint) {
            rejected.push(
                `Endpoint "${id}" is not an approved read-only endpoint.`
            );
            continue;
        }

        if (!selected.includes(id)) {
            selected.push(id);
        }
    }

    errors.push(...rejected);

    if (selected.length === 0 && requested.length > 0) {
        errors.push("No approved endpoint remained after validation.");
    }

    config.endpoints = selected;
    config.maxRequests = Math.min(
        config.ratePerSecond && config.durationSeconds
            ? config.ratePerSecond * config.durationSeconds
            : TRAFFIC_LIMITS.maxRequestsPerRun,
        TRAFFIC_LIMITS.maxRequestsPerRun
    );

    return { valid: errors.length === 0, errors, config };
}

function percentile(sortedValues, percentileValue) {
    if (!sortedValues.length) {
        return null;
    }

    const index = Math.min(
        sortedValues.length - 1,
        Math.max(
            0,
            Math.ceil((percentileValue / 100) * sortedValues.length) - 1
        )
    );

    return sortedValues[index];
}

/**
 * Builds the metric summary from the records that were actually executed.
 * Latency statistics are only produced when real measurements exist.
 */
function summarizeRecords(records, elapsedMs) {
    const total = records.length;
    const successful = records.filter((record) => record.success).length;

    const httpErrors = records.filter(
        (record) => record.outcome === "http_error"
    ).length;
    const timeouts = records.filter(
        (record) => record.outcome === "timeout"
    ).length;
    const networkErrors = records.filter(
        (record) => record.outcome === "network_error"
    ).length;
    const aborted = records.filter(
        (record) => record.outcome === "aborted"
    ).length;

    const statusDistribution = {};
    for (const record of records) {
        if (record.httpStatus === null || record.httpStatus === undefined) {
            continue;
        }

        const key = String(record.httpStatus);
        statusDistribution[key] = (statusDistribution[key] || 0) + 1;
    }

    const latencies = records
        .map((record) => record.latencyMs)
        .filter(
            (value) =>
                typeof value === "number" && Number.isFinite(value)
        )
        .sort((a, b) => a - b);

    const latency =
        latencies.length > 0
            ? {
                  samples: latencies.length,
                  averageMs: round(
                      latencies.reduce((sum, value) => sum + value, 0) /
                          latencies.length
                  ),
                  minMs: latencies[0],
                  maxMs: latencies[latencies.length - 1],
                  p50Ms: percentile(latencies, 50),
                  p95Ms: percentile(latencies, 95),
              }
            : null;

    const perEndpointMap = new Map();

    for (const record of records) {
        const key = `${record.endpointId}|${record.endpoint}`;

        if (!perEndpointMap.has(key)) {
            perEndpointMap.set(key, {
                endpointId: record.endpointId,
                endpoint: record.endpoint,
                method: record.method,
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                latencies: [],
            });
        }

        const bucket = perEndpointMap.get(key);
        bucket.totalRequests += 1;

        if (record.success) {
            bucket.successfulRequests += 1;
        } else {
            bucket.failedRequests += 1;
        }

        if (
            typeof record.latencyMs === "number" &&
            Number.isFinite(record.latencyMs)
        ) {
            bucket.latencies.push(record.latencyMs);
        }
    }

    const perEndpoint = Array.from(perEndpointMap.values()).map((bucket) => {
        const measured = bucket.latencies;

        return {
            endpointId: bucket.endpointId,
            endpoint: bucket.endpoint,
            method: bucket.method,
            totalRequests: bucket.totalRequests,
            successfulRequests: bucket.successfulRequests,
            failedRequests: bucket.failedRequests,
            averageLatencyMs: measured.length
                ? round(
                      measured.reduce((sum, value) => sum + value, 0) /
                          measured.length
                  )
                : null,
        };
    });

    const duration = Math.max(1, elapsedMs || 0);

    return {
        totalRequests: total,
        successfulRequests: successful,
        failedRequests: total - successful,
        httpErrorRequests: httpErrors,
        timeoutRequests: timeouts,
        networkErrorRequests: networkErrors,
        abortedRequests: aborted,
        statusDistribution,
        latency,
        perEndpoint,
        elapsedMs,
        achievedRatePerSecond: round((total / duration) * 1000),
    };
}

function loadHistory() {
    try {
        if (!fs.existsSync(HISTORY_PATH)) {
            return [];
        }

        const parsed = JSON.parse(
            fs.readFileSync(HISTORY_PATH, "utf8")
        );

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error(
            "[Traffic Generator] Could not load traffic history:",
            error.message
        );

        return [];
    }
}

function saveHistory(history) {
    const temporaryPath = `${HISTORY_PATH}.tmp`;
    const limited = history.slice(-TRAFFIC_LIMITS.maxStoredRuns);

    try {
        fs.writeFileSync(
            temporaryPath,
            JSON.stringify(limited, null, 2),
            "utf8"
        );
        fs.renameSync(temporaryPath, HISTORY_PATH);
    } catch (error) {
        console.error(
            "[Traffic Generator] Could not save traffic history:",
            error.message
        );
    }
}

let experimentCounter = 0;

function createExperimentId() {
    experimentCounter += 1;

    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);

    return `traffic-${stamp}-${experimentCounter}-${random}`;
}

/**
 * Resolves a real product id from the live catalog so the product-detail
 * endpoint never requests a fabricated identifier.
 */
async function resolveProductId(timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${TARGET_BASE_URL}/api/products`, {
            method: "GET",
            headers: { accept: "application/json" },
            signal: controller.signal,
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json();
        const products = Array.isArray(payload?.products)
            ? payload.products
            : [];

        if (!products.length) {
            return null;
        }

        const id = products[0]?._id;

        return typeof id === "string" && id.length > 0 ? id : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

class TrafficRun {
    constructor({ config, targetBaseUrl, onComplete, notifyEvent, label, correlation }) {
        this.experimentId = createExperimentId();
        this.config = config;
        this.targetBaseUrl = targetBaseUrl;
        this.onComplete = onComplete;
        this.notifyEvent = notifyEvent;
        this.label = label || null;
        this.correlation = correlation || null;

        this.status = "running";
        this.stopReason = null;
        this.stopped = false;
        this.error = null;
        this.startedAtMs = Date.now();
        this.endedAtMs = null;
        this.startedAt = new Date(this.startedAtMs).toISOString();
        this.completedAt = null;

        this.records = [];
        this.sequence = 0;
        this.endpointCursor = 0;
        this.controllers = new Set();
        this.stopListeners = new Set();

        this.activeEndpoints = [];
        this.skippedEndpoints = [];
    }

    get elapsedMs() {
        return (this.endedAtMs || Date.now()) - this.startedAtMs;
    }

    registerController(controller) {
        this.controllers.add(controller);
    }

    releaseController(controller) {
        this.controllers.delete(controller);
    }

    requestStop(reason) {
        if (this.status !== "running") {
            return false;
        }

        this.stopReason = reason || "Stopped by operator.";
        this.stopped = true;

        for (const listener of this.stopListeners) {
            try {
                listener();
            } catch (error) {
                console.error(
                    "[Traffic Generator] Stop listener failed:",
                    error.message
                );
            }
        }

        for (const controller of this.controllers) {
            try {
                controller.abort();
            } catch {
                // Aborting an already settled controller is safe to ignore.
            }
        }

        return true;
    }

    async prepareEndpoints() {
        const prepared = [];

        for (const id of this.config.endpoints) {
            const definition = findEndpoint(id);

            if (!definition) {
                this.skippedEndpoints.push({
                    id,
                    reason: "Endpoint is not on the approved allowlist.",
                });
                continue;
            }

            if (definition.path.includes(":id")) {
                const productId = await resolveProductId(
                    Math.min(this.config.requestTimeoutMs, 5000)
                );

                if (!productId) {
                    this.skippedEndpoints.push({
                        id,
                        reason: "No product id could be resolved from the live catalog.",
                    });
                    continue;
                }

                prepared.push({
                    id: definition.id,
                    label: definition.label,
                    method: "GET",
                    path: definition.path.replace(":id", productId),
                });
                continue;
            }

            prepared.push({
                id: definition.id,
                label: definition.label,
                method: "GET",
                path: definition.path,
            });
        }

        this.activeEndpoints = prepared;
    }

    pickEndpoint() {
        if (!this.activeEndpoints.length) {
            return null;
        }

        const endpoint =
            this.activeEndpoints[
                this.endpointCursor % this.activeEndpoints.length
            ];

        this.endpointCursor += 1;

        return endpoint;
    }

    async executeRequest(endpoint) {
        const url = `${this.targetBaseUrl}${endpoint.path}`;
        const requestId = `req-${this.experimentId}-${String(
            ++this.sequence
        ).padStart(5, "0")}`;

        const timestamp = new Date().toISOString();
        const startedAtMs = Date.now();

        const controller = new AbortController();
        this.registerController(controller);

        let timedOut = false;
        let stoppedByUser = false;

        const onStop = () => {
            stoppedByUser = true;
            controller.abort();
        };

        this.stopListeners.add(onStop);

        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, this.config.requestTimeoutMs);

        let httpStatus = null;
        let latencyMs = null;
        let bytes = null;
        let outcome = "network_error";
        let errorMessage = null;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    accept: "application/json",
                    "x-traffic-source": "synthetic",
                    "x-experiment-id": this.experimentId,
                },
                signal: controller.signal,
                redirect: "manual",
            });

            httpStatus = response.status;
            latencyMs = Date.now() - startedAtMs;

            const body = await response.text();
            bytes = Buffer.byteLength(body);

            outcome =
                response.status >= 200 && response.status < 300
                    ? "success"
                    : "http_error";

            if (outcome === "http_error") {
                errorMessage = `HTTP ${response.status} response.`;
            }
        } catch (error) {
            if (httpStatus !== null) {
                outcome = "http_error";
                errorMessage =
                    error?.message ||
                    "The response could not be read completely.";
            } else if (timedOut) {
                outcome = "timeout";
                errorMessage = `Request timed out after ${this.config.requestTimeoutMs} ms.`;
            } else if (stoppedByUser) {
                outcome = "aborted";
                errorMessage = "Request aborted because the run was stopped.";
            } else if (error?.name === "AbortError") {
                outcome = "aborted";
                errorMessage = "Request aborted.";
            } else {
                outcome = "network_error";
                errorMessage =
                    error?.message || "The request could not reach the target.";
            }
        } finally {
            clearTimeout(timer);
            this.stopListeners.delete(onStop);
            this.releaseController(controller);
        }

        const record = {
            id: requestId,
            experimentId: this.experimentId,
            endpointId: endpoint.id,
            endpoint: endpoint.path,
            method: "GET",
            source: "synthetic",
            timestamp,
            httpStatus,
            latencyMs,
            bytes,
            success: outcome === "success",
            outcome,
            error: errorMessage,
        };

        this.records.push(record);

        return record;
    }

    async run() {
        try {
            await this.prepareEndpoints();

            if (!this.activeEndpoints.length) {
                this.status = "failed";
                this.error =
                    "No approved endpoint could be prepared for this run.";
                return;
            }

            const durationMs = this.config.durationSeconds * 1000;
            const intervalMs = 1000 / this.config.ratePerSecond;
            const maxRequests = Math.min(
                this.config.maxRequests,
                TRAFFIC_LIMITS.maxRequestsPerRun
            );

            const inFlight = new Set();
            let nextDueAt = Date.now();

            while (
                !this.stopped &&
                Date.now() - this.startedAtMs < durationMs &&
                this.records.length < maxRequests
            ) {
                const now = Date.now();

                if (now < nextDueAt) {
                    await sleep(Math.min(nextDueAt - now, 25));
                    continue;
                }

                nextDueAt = Math.max(nextDueAt + intervalMs, Date.now());

                if (inFlight.size >= this.config.concurrency) {
                    await Promise.race(inFlight);
                    continue;
                }

                const endpoint = this.pickEndpoint();

                if (!endpoint) {
                    await sleep(50);
                    continue;
                }

                const task = this.executeRequest(endpoint);
                inFlight.add(task);

                task
                    .catch((error) => {
                        console.error(
                            "[Traffic Generator] Request task failed:",
                            error.message
                        );
                    })
                    .finally(() => {
                        inFlight.delete(task);
                    });
            }

            await Promise.allSettled(Array.from(inFlight));

            if (this.stopReason) {
                this.status = "stopped";
            } else {
                this.status = "completed";
            }
        } catch (error) {
            this.status = "failed";
            this.error = error.message;

            console.error(
                "[Traffic Generator] Run failed:",
                error.message
            );
        } finally {
            this.endedAtMs = Date.now();
            this.completedAt = new Date(this.endedAtMs).toISOString();

            for (const controller of this.controllers) {
                try {
                    controller.abort();
                } catch {
                    // Nothing to clean up for an already settled controller.
                }
            }

            this.controllers.clear();
            this.stopListeners.clear();
        }
    }

    summary() {
        return summarizeRecords(this.records, this.elapsedMs);
    }

    snapshot() {
        return {
            experimentId: this.experimentId,
            status: this.status,
            label: this.label,
            correlation: this.correlation,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            elapsedMs: this.elapsedMs,
            config: this.config,
            target: this.targetBaseUrl,
            endpoints: this.activeEndpoints.map((endpoint) => ({
                id: endpoint.id,
                label: endpoint.label,
                path: endpoint.path,
            })),
            skippedEndpoints: this.skippedEndpoints,
            summary: this.summary(),
            error: this.error,
            stopReason: this.stopReason,
        };
    }
}

let activeRun = null;
let lastRun = null;

async function finalizeRun(run) {
    const snapshot = run.snapshot();

    lastRun = {
        snapshot,
        requests: run.records.slice(),
    };

    const history = loadHistory();

    history.push({
        id: snapshot.experimentId,
        scenario: "synthetic-traffic",
        status: snapshot.status,
        label: snapshot.label,
        correlation: snapshot.correlation,
        startedAt: snapshot.startedAt,
        completedAt: snapshot.completedAt,
        config: snapshot.config,
        target: snapshot.target,
        endpoints: snapshot.endpoints,
        skippedEndpoints: snapshot.skippedEndpoints,
        summary: snapshot.summary,
        error: snapshot.error,
        requests: run.records
            .slice(-TRAFFIC_LIMITS.maxStoredRequestsPerRun)
            .map((record) => ({ ...record })),
    });

    saveHistory(history);

    if (typeof run.onComplete === "function") {
        try {
            run.onComplete(snapshot);
        } catch (error) {
            console.error(
                "[Traffic Generator] Completion hook failed:",
                error.message
            );
        }
    }

    if (typeof run.notifyEvent === "function") {
        try {
            await run.notifyEvent(snapshot);
        } catch (error) {
            console.error(
                "[Traffic Generator] Timeline notification failed:",
                error.message
            );
        }
    }
}

/**
 * Starts a bounded synthetic traffic run.
 * Throws an error with a statusCode of 400 (invalid config) or 409 (a run is
 * already active).
 */
function startTrafficRun(rawConfig, options = {}) {
    const validation = validateTrafficConfig(rawConfig);

    if (!validation.valid) {
        const error = new Error(
            "The synthetic traffic configuration was rejected by the controller."
        );
        error.statusCode = 400;
        error.details = validation.errors;

        throw error;
    }

    if (activeRun) {
        const error = new Error(
            "A synthetic traffic run is already active. Stop it before starting another."
        );
        error.statusCode = 409;
        error.details = [
            `Active experiment: ${activeRun.experimentId}`,
        ];

        throw error;
    }

    const run = new TrafficRun({
        config: validation.config,
        targetBaseUrl: options.targetBaseUrl || TARGET_BASE_URL,
        onComplete: options.onComplete,
        notifyEvent: options.notifyEvent,
        label: options.label,
        correlation: options.correlation,
    });

    activeRun = run;
    lastRun = null;

    run
        .run()
        .catch((error) => {
            console.error(
                "[Traffic Generator] Unexpected run failure:",
                error.message
            );
        })
        .finally(async () => {
            if (activeRun === run) {
                activeRun = null;
            }

            await finalizeRun(run);
        });

    return run;
}

function stopTrafficRun(reason) {
    if (!activeRun) {
        const error = new Error("No synthetic traffic run is currently active.");
        error.statusCode = 409;

        throw error;
    }

    const run = activeRun;
    run.requestStop(reason || "Stopped by operator.");

    return run;
}

function getTrafficStatus() {
    const history = loadHistory();

    return {
        running: Boolean(activeRun),
        active: activeRun ? activeRun.snapshot() : null,
        lastRun: lastRun ? lastRun.snapshot : null,
        lastRunRequests: lastRun ? lastRun.requests.length : 0,
        history: history
            .map((entry) => ({
                id: entry.id,
                status: entry.status,
                startedAt: entry.startedAt,
                completedAt: entry.completedAt,
                config: entry.config,
                summary: entry.summary,
            }))
            .reverse(),
    };
}


function getTrafficRequests(limit = 100) {
    const historyRequests = loadHistory()
        .slice()
        .reverse()
        .find(
            (entry) =>
                Array.isArray(entry.requests) &&
                entry.requests.length > 0
        )?.requests || [];

    const source = activeRun
        ? activeRun.records
        : lastRun?.requests?.length
            ? lastRun.requests
            : historyRequests;

    const bounded = Math.min(
        Math.max(1, toInteger(limit) || 100),
        TRAFFIC_LIMITS.maxStoredRequestsPerRun
    );

    return source.slice(-bounded).reverse();
}


function getTrafficMetadata() {
    return {
        endpoints: ALLOWED_ENDPOINTS.map((endpoint) => ({
            id: endpoint.id,
            label: endpoint.label,
            method: endpoint.method,
            path: endpoint.path,
            description: endpoint.description,
        })),
        limits: TRAFFIC_LIMITS,
        target: TARGET_BASE_URL,
    };
}

module.exports = {
    TRAFFIC_LIMITS,
    ALLOWED_ENDPOINTS,
    validateTrafficConfig,
    summarizeRecords,
    startTrafficRun,
    stopTrafficRun,
    getTrafficStatus,
    getTrafficRequests,
    getTrafficMetadata,
    TrafficRun,
    loadHistory,
};
