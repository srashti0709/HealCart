/**
 * SHCom Backend Crash Coordination
 * --------------------------------
 * Coordinates the existing synthetic traffic generator with the existing
 * backend crash experiment so that a single run captures real request
 * failures while the backend is down and real successes after it recovers.
 *
 * Design rules:
 *  - The crash itself is NOT implemented here. The crash action is injected,
 *    so the one and only crash mechanism in the system stays in
 *    chaos-controller.js and is reused unchanged.
 *  - Traffic always starts first, and the crash is only triggered once at
 *    least one real request has completed, so a "before" sample is guaranteed.
 *  - The coordinated traffic run is always stopped, including when startup,
 *    the crash, or summary collection fails.
 *  - Only the traffic run created by this coordinator is ever stopped. A
 *    different active run is never touched.
 *  - Results are reported exactly as observed. Nothing is synthesised.
 */

const {
    startTrafficRun,
    stopTrafficRun,
    getTrafficStatus,
    validateTrafficConfig,
} = require("./traffic-generator");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The server-side coordinated traffic profile. Every value stays inside the
 * limits enforced by the traffic generator.
 */
const COORDINATED_TRAFFIC_PROFILE = {
    ratePerSecond: 3,
    concurrency: 2,
    durationSeconds: 120,
    requestTimeoutMs: 3000,
    endpoints: ["products-list", "health"],
};

const COORDINATION_LIMITS = {
    firstRequestTimeoutMs: 15000,
    settleAfterRecoveryMs: 3000,
    trafficStopTimeoutMs: 10000,
};

function createCorrelationId(prefix = "crash") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

/**
 * Builds the coordination plan from an optional request body.
 *
 * Returns null when no coordination was requested, which keeps the existing
 * non-coordinated crash request behaving exactly as before.
 *
 * Throws an error with a statusCode of 400 when the requested traffic
 * configuration is invalid, so an invalid request never triggers a crash.
 */
function buildCoordinationPlan(body, options = {}) {
    const requested =
        body && typeof body === "object" ? body.traffic : null;

    if (
        !requested ||
        typeof requested !== "object" ||
        requested.enabled === false
    ) {
        return null;
    }

    const profile = {
        ...COORDINATED_TRAFFIC_PROFILE,
        ...(options.profile || {}),
    };

    const pick = (value, fallback) =>
        value === undefined || value === null ? fallback : value;

    const trafficConfig = {
        ratePerSecond: pick(
            requested.ratePerSecond,
            profile.ratePerSecond
        ),
        concurrency: pick(requested.concurrency, profile.concurrency),
        durationSeconds: pick(
            requested.durationSeconds,
            profile.durationSeconds
        ),
        requestTimeoutMs: pick(
            requested.requestTimeoutMs,
            profile.requestTimeoutMs
        ),
        endpoints:
            Array.isArray(requested.endpoints) && requested.endpoints.length > 0
                ? requested.endpoints
                : profile.endpoints,
    };

    const validation = validateTrafficConfig(trafficConfig);

    if (!validation.valid) {
        const error = new Error(
            "The coordinated synthetic traffic configuration was rejected by the controller."
        );
        error.statusCode = 400;
        error.details = validation.errors;

        throw error;
    }

    return {
        correlationId: createCorrelationId("crash"),
        label: "Backend Crash Coordination",
        trafficConfig: validation.config,
        firstRequestTimeoutMs: COORDINATION_LIMITS.firstRequestTimeoutMs,
        settleAfterRecoveryMs: COORDINATION_LIMITS.settleAfterRecoveryMs,
    };
}

/**
 * Waits until the coordinated run has completed at least one real request.
 * Returns the first completed record, or null when the wait timed out or the
 * run ended without producing a request.
 */
async function waitForFirstTrafficRequest(run, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (run.records.length > 0) {
            return run.records[0];
        }

        if (run.status !== "running") {
            return null;
        }

        await sleep(100);
    }

    return null;
}

/**
 * Stops the coordinated run, but only when it is still the active run.
 * An unrelated traffic run is never stopped.
 */
function stopCoordinatedTraffic(run) {
    if (!run) {
        return { stopped: false, error: null, reason: "No coordinated run to stop." };
    }

    const status = getTrafficStatus();

    if (
        !status.running ||
        !status.active ||
        status.active.experimentId !== run.experimentId
    ) {
        return {
            stopped: false,
            error: null,
            reason: "The coordinated run was no longer the active traffic run.",
        };
    }

    try {
        stopTrafficRun("Backend crash experiment finished.");
        return { stopped: true, error: null, reason: null };
    } catch (error) {
        return { stopped: false, error: error.message, reason: null };
    }
}

async function waitForTrafficRunToFinish(run, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (run.status !== "running") {
            return true;
        }

        await sleep(50);
    }

    return false;
}

/**
 * Collects the observed result of a run. Never invents a summary.
 */
function collectTrafficResult(run) {
    if (!run) {
        return {
            available: false,
            status: null,
            summary: null,
            error: "No coordinated traffic run was created.",
            endpoints: [],
        };
    }

    try {
        const snapshot = run.snapshot();

        return {
            available: Boolean(snapshot.summary),
            status: snapshot.status,
            summary: snapshot.summary,
            error: null,
            endpoints: snapshot.endpoints,
        };
    } catch (error) {
        return {
            available: false,
            status: run.status || null,
            summary: null,
            error: error.message,
            endpoints: [],
        };
    }
}

/**
 * Runs the coordinated experiment.
 *
 * options:
 *   crashAction      - required, async () => ({ statusCode, body, experiment })
 *   onTrafficComplete- optional, called with the traffic run snapshot
 *   notifyEvent      - optional, publishes a timeline event
 *   targetBaseUrl    - optional, traffic target override (tests only)
 */
async function runCoordinatedBackendCrash(plan, options = {}) {
    const {
        crashAction,
        onTrafficComplete,
        notifyEvent,
        targetBaseUrl,
    } = options;

    if (typeof crashAction !== "function") {
        throw new Error("A crash action is required for coordinated traffic.");
    }

    const correlation = {
        scenario: "backend-crash",
        correlationId: plan.correlationId,
    };

    const state = {
        trafficRun: null,
        trafficStatus: null,
        trafficSummary: null,
        trafficSummaryError: null,
        cleanup: { stopped: false, error: null, reason: null },
    };

    let crash = null;
    let failure = null;

    try {
        try {
            state.trafficRun = startTrafficRun(plan.trafficConfig, {
                label: plan.label,
                correlation,
                onComplete: onTrafficComplete,
                targetBaseUrl,
            });
        } catch (error) {
            const startFailure = new Error(
                `Coordinated synthetic traffic could not start: ${error.message}`
            );
            startFailure.statusCode = error.statusCode || 500;
            startFailure.details = error.details || [];

            throw startFailure;
        }

        if (typeof notifyEvent === "function") {
            await notifyEvent({
                type: "traffic-started",
                message: `Synthetic traffic run ${state.trafficRun.experimentId} started to observe the backend crash (correlation ${plan.correlationId}).`,
                outcome: "in_progress",
                experimentId: state.trafficRun.experimentId,
                details: {
                    correlationId: plan.correlationId,
                    scenario: "backend-crash",
                    config: plan.trafficConfig,
                },
            });
        }

        const firstRequest = await waitForFirstTrafficRequest(
            state.trafficRun,
            plan.firstRequestTimeoutMs
        );

        if (!firstRequest) {
            const timeoutError = new Error(
                `Synthetic traffic did not complete a request within ${plan.firstRequestTimeoutMs}ms. The backend crash was not triggered.`
            );
            timeoutError.statusCode = 504;

            throw timeoutError;
        }

        crash = await crashAction();

        await sleep(plan.settleAfterRecoveryMs);
    } catch (error) {
        failure = error;
    } finally {
        if (state.trafficRun) {
            const stop = stopCoordinatedTraffic(state.trafficRun);

            state.cleanup = {
                stopped: stop.stopped,
                error: stop.error,
                reason: stop.reason,
            };

            await waitForTrafficRunToFinish(
                state.trafficRun,
                COORDINATION_LIMITS.trafficStopTimeoutMs
            );

            const collected = collectTrafficResult(state.trafficRun);

            state.trafficStatus = collected.status;
            state.trafficSummary = collected.summary;
            state.trafficSummaryError = collected.error;
        }
    }

    return {
        crash,
        failure,
        state,
        plan,
        traffic: {
            experimentId: state.trafficRun
                ? state.trafficRun.experimentId
                : null,
            status: state.trafficStatus,
            summaryAvailable: Boolean(state.trafficSummary),
            summary: state.trafficSummary,
            summaryError: state.trafficSummaryError,
            endpoints: state.trafficRun
                ? state.trafficRun.snapshot().endpoints
                : [],
            config: plan.trafficConfig,
            correlationId: plan.correlationId,
            cleanup: state.cleanup,
        },
    };
}

module.exports = {
    COORDINATED_TRAFFIC_PROFILE,
    COORDINATION_LIMITS,
    buildCoordinationPlan,
    runCoordinatedBackendCrash,
    waitForFirstTrafficRequest,
    stopCoordinatedTraffic,
    collectTrafficResult,
    createCorrelationId,
};
