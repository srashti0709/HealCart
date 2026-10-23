
const http = require("http");
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const {
    startTrafficRun,
    stopTrafficRun,
    getTrafficStatus,
    getTrafficRequests,
    getTrafficMetadata,
} = require("./traffic-generator");

const {
    buildCoordinationPlan,
    runCoordinatedBackendCrash,
} = require("./crash-coordination");

const backendEnvPath = path.join(__dirname, "..", "backend", ".env");

if (!process.env.CHAOS_TEST_TOKEN && fs.existsSync(backendEnvPath)) {
    const tokenLine = fs
        .readFileSync(backendEnvPath, "utf8")
        .split(/\r?\n/)
        .find((line) => line.startsWith("CHAOS_TEST_TOKEN="));

    if (tokenLine) {
        process.env.CHAOS_TEST_TOKEN = tokenLine
            .slice("CHAOS_TEST_TOKEN=".length)
            .trim();
    }
}

const PORT = Number(process.env.CHAOS_CONTROLLER_PORT || 5003);
const FRONTEND_ORIGIN = "http://localhost:5173";
const BACKEND_CONTAINER = "shcom-backend";
const RECOVERY_MONITOR_URL =
    process.env.RECOVERY_MONITOR_URL || "http://127.0.0.1:5002";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EXPERIMENT_HISTORY_PATH =
    process.env.CHAOS_EXPERIMENT_HISTORY_PATH ||
    path.join(__dirname, "experiment-history.json");

let activeExperiment = null;
let reconcileInFlight = false;

function loadExperimentHistory() {
    try {
        if (!fs.existsSync(EXPERIMENT_HISTORY_PATH)) {
            return [];
        }

        const history = JSON.parse(
            fs.readFileSync(EXPERIMENT_HISTORY_PATH, "utf8")
        );

        return Array.isArray(history) ? history : [];
    } catch (error) {
        console.error(
            "[Chaos Controller] Could not load experiment history:",
            error.message
        );

        return [];
    }
}

function saveExperimentHistory(history) {
    const temporaryPath = `${EXPERIMENT_HISTORY_PATH}.tmp`;
    const limitedHistory = history.slice(-100);

    fs.writeFileSync(
        temporaryPath,
        JSON.stringify(limitedHistory, null, 2),
        "utf8"
    );

    fs.renameSync(temporaryPath, EXPERIMENT_HISTORY_PATH);
}

function recordExperiment(experiment) {
    const history = loadExperimentHistory();

    history.push({
        id: `exp-${Date.now()}`,
        ...experiment,
        completedAt: new Date().toISOString(),
    });

    saveExperimentHistory(history);
}

/**
 * Reads a JSON request body with a hard size limit so a malformed or
 * oversized client request can never exhaust the controller.
 */
function readJsonBody(req, maxBytes = 16 * 1024) {
    return new Promise((resolve, reject) => {
        let raw = "";
        let size = 0;
        let settled = false;

        const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        req.on("data", (chunk) => {
            size += chunk.length;

            if (size > maxBytes) {
                fail(new Error("Request body is too large."));
                req.destroy();
                return;
            }

            raw += chunk.toString("utf8");
        });

        req.on("end", () => {
            if (settled) return;
            settled = true;

            if (!raw.trim()) {
                resolve({});
                return;
            }

            try {
                const parsed = JSON.parse(raw);

                resolve(parsed && typeof parsed === "object" ? parsed : {});
            } catch {
                fail(new Error("Request body must be valid JSON."));
            }
        });

        req.on("error", fail);
    });
}

/**
 * Publishes an event to the recovery monitor so synthetic traffic runs also
 * appear on the shared incident timeline.
 */
async function publishRecoveryEvent({
    type,
    message,
    outcome,
    experimentId,
    details,
}) {
    try {
        const response = await fetch(
            `${RECOVERY_MONITOR_URL}/api/recovery/events`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type,
                    message,
                    outcome,
                    experimentId,
                    details,
                }),
                signal: AbortSignal.timeout(5000),
            }
        );

        if (!response.ok) {
            console.error(
                "[Chaos Controller] Recovery monitor rejected the traffic event:",
                response.status
            );
        }
    } catch (error) {
        console.error(
            "[Chaos Controller] Could not publish the traffic event:",
            error.message
        );
    }
}

function describeTrafficOutcome(snapshot) {
    const summary = snapshot.summary || {};

    if (snapshot.status === "stopped") {
        const reason = String(snapshot.stopReason || "Stopped by operator.")
            .replace(/\.$/, "");

        return `Synthetic traffic run ${snapshot.experimentId} ended (${reason}) after ${(snapshot.elapsedMs / 1000).toFixed(1)}s. ${summary.totalRequests || 0} requests recorded, ${summary.successfulRequests || 0} successful.`;
    }

    if (snapshot.status === "failed") {
        return `Synthetic traffic run ${snapshot.experimentId} failed: ${snapshot.error || "unknown error"}.`;
    }

    const latency =
        summary.latency && typeof summary.latency.averageMs === "number"
            ? `${summary.latency.averageMs} ms average latency`
            : "no latency measurements";

    return `Synthetic traffic run ${snapshot.experimentId} completed with ${summary.totalRequests || 0} requests, ${summary.successfulRequests || 0} successful, ${summary.failedRequests || 0} failed and ${latency}.`;
}

function handleTrafficRunComplete(snapshot) {
    const summary = snapshot.summary || {};
    const passed = snapshot.status === "completed";
    const stopped = snapshot.status === "stopped";

    try {
        recordExperiment({
            scenario: "synthetic-traffic",
            status: passed ? "passed" : stopped ? "stopped" : "failed",
            message: describeTrafficOutcome(snapshot),
            recovery: {
                experimentId: snapshot.experimentId,
                runStatus: snapshot.status,
                label: snapshot.label || null,
                correlation: snapshot.correlation || null,
                config: snapshot.config,
                summary,
            },
        });
    } catch (error) {
        console.error(
            "[Chaos Controller] Failed to save the traffic experiment:",
            error.message
        );
    }

    const outcome =
        snapshot.status === "completed"
            ? "success"
            : snapshot.status === "failed"
              ? "failure"
              : "unverified";

    return publishRecoveryEvent({
        type:
            snapshot.status === "completed"
                ? "traffic-completed"
                : snapshot.status === "failed"
                  ? "traffic-failed"
                  : "traffic-stopped",
        message: describeTrafficOutcome(snapshot),
        outcome,
        experimentId: snapshot.experimentId,
        details: {
            experimentId: snapshot.experimentId,
            runStatus: snapshot.status,
            config: snapshot.config,
            totalRequests: summary.totalRequests || 0,
            successfulRequests: summary.successfulRequests || 0,
            failedRequests: summary.failedRequests || 0,
            timeoutRequests: summary.timeoutRequests || 0,
            networkErrorRequests: summary.networkErrorRequests || 0,
            averageLatencyMs: summary.latency
                ? summary.latency.averageMs
                : null,
        },
    });
}

function getContainerState() {
    const output = execFileSync(
        "docker",
        [
            "inspect",
            "--format",
            '{{json .State}}',
            BACKEND_CONTAINER,
        ],
        { encoding: "utf8", timeout: 10000 }
    );

    const state = JSON.parse(output);

    const restartCount = Number(
        execFileSync(
            "docker",
            [
                "inspect",
                "--format",
                "{{.RestartCount}}",
                BACKEND_CONTAINER,
            ],
            { encoding: "utf8", timeout: 10000 }
        ).trim()
    );

    return { ...state, RestartCount: restartCount };
}

function getPaymentContainerState() {
    const output = execFileSync(
        "docker",
        [
            "inspect",
            "--format",
            '{{json .State}}',
            "shcom-payment-service",
        ],
        { encoding: "utf8", timeout: 10000 }
    );

    const state = JSON.parse(output);

    const restartCount = Number(
        execFileSync(
            "docker",
            [
                "inspect",
                "--format",
                "{{.RestartCount}}",
                "shcom-payment-service",
            ],
            { encoding: "utf8", timeout: 10000 }
        ).trim()
    );

    return { ...state, RestartCount: restartCount };
}

async function getPaymentHealth() {
    try {
        const response = await fetch(
            "http://127.0.0.1:5001/health",
            { signal: AbortSignal.timeout(3000) }
        );

        const health = await response.json();

        return {
            healthy:
                response.ok &&
                health.success === true &&
                health.service === "payment-service" &&
                health.status === "healthy",
            health,
        };
    } catch (error) {
        return {
            healthy: false,
            health: { message: error.message },
        };
    }
}


async function waitForRestart(previousRestartCount, previousStartedAt = null) {
    const deadline = Date.now() + 45000;
    let lastStatus = "";

    console.log(
        `[Chaos Controller] Waiting for recovery. Previous restart count: ${previousRestartCount}`
    );

    while (Date.now() < deadline) {
        try {
            const state = getContainerState();

            const currentStatus =
                `Container=${state.Status}, RestartCount=${state.RestartCount}`;

            if (currentStatus !== lastStatus) {
                console.log(`[Chaos Controller] ${currentStatus}`);
                lastStatus = currentStatus;
            }

            const healthResponse = await fetch(
                "http://127.0.0.1:5000/api/health",
                { signal: AbortSignal.timeout(3000) }
            );

            let health = null;

            if (healthResponse.ok) {
                health = await healthResponse.json();

                console.log(
                    `[Chaos Controller] Health check: status=${health.status}, database=${health.database}`
                );
            } else {
                console.log(
                    `[Chaos Controller] Health endpoint returned HTTP ${healthResponse.status}.`
                );
            }

            const startedAtChanged =
                previousStartedAt &&
                typeof state.StartedAt === "string" &&
                state.StartedAt !== previousStartedAt;

            const restartVerified =
                state.Status === "running" &&
                (
                    (
                        Number.isFinite(state.RestartCount) &&
                        state.RestartCount > previousRestartCount
                    ) ||
                    startedAtChanged
                );

            const backendHealthy =
                health &&
                health.success === true &&
                health.status === "healthy" &&
                health.database === "connected";

            if (restartVerified && backendHealthy) {
                console.log(
                    "[Chaos Controller] Recovery verified successfully: container restarted and backend/database are healthy."
                );

                return {
                    recovered: true,
                    restartCount: state.RestartCount,
                    startedAt: state.StartedAt,
                    status: state.Status,
                    database: health.database,
                };
            }

            if (restartVerified) {
                console.log(
                    "[Chaos Controller] Container restarted, but backend health is not yet healthy."
                );
            }
        } catch (error) {
            console.log(
                `[Chaos Controller] Recovery check: ${error.message}`
            );
        }

        await sleep(1000);
    }

    console.error(
        `[Chaos Controller] Recovery timeout. Previous restart count: ${previousRestartCount}`
    );

    return { recovered: false };
}

async function getBackendHealth() {
    try {
        const response = await fetch(
            "http://127.0.0.1:5000/api/health",
            { signal: AbortSignal.timeout(5000) }
        );

        const health = await response.json();

        return {
            ok: response.ok && health.success === true,
            response,
            health,
        };
    } catch (error) {
        return {
            ok: false,
            response: null,
            health: { message: error.message },
        };
    }
}

async function verifyDatabaseRecovery() {
    const startedAt = Date.now();
    const stages = [];
    const deadline = startedAt + 45000;

    while (Date.now() < deadline) {
        const { ok, response, health } = await getBackendHealth();

        if (ok && health.status === "healthy" && health.database === "connected") {
            try {
                const databaseProbe = await fetch(
                    "http://127.0.0.1:5000/api/chaos/db-check",
                    { signal: AbortSignal.timeout(5000) }
                );

                const databasePayload = await databaseProbe.json();

                if (
                    databaseProbe.ok &&
                    databasePayload.success === true &&
                    databasePayload.database === "connected"
                ) {
                    stages.push({
                        stage: "verified",
                        status: "passed",
                        timestamp: new Date().toISOString(),
                        message: "Database probe succeeded after reconnect.",
                    });

                    return {
                        recovered: true,
                        durationMs: Date.now() - startedAt,
                        stages,
                        database: databasePayload.database,
                        status: databasePayload.status,
                    };
                }
            } catch (error) {
                console.log(
                    `[Chaos Controller] Database probe retry: ${error.message}`
                );
            }
        }

        if (!ok || health.database !== "connected") {
            stages.push({
                stage: "waiting",
                status: "pending",
                timestamp: new Date().toISOString(),
                message: health.message || "Waiting for database reconnect.",
            });
        }

        await sleep(1000);
    }

    return {
        recovered: false,
        durationMs: Date.now() - startedAt,
        stages,
        database: "disconnected",
        status: "degraded",
    };
}

/**
 * The one and only backend crash mechanism.
 *
 * It performs the same steps as before: it crashes the controlled backend
 * process and then verifies the automatic restart and health. It only returns
 * a result instead of writing it to the HTTP response, so the same mechanism
 * can be reused by the coordinated traffic flow.
 */
async function runBackendCrashScenario() {
    const before = getContainerState();

    if (before.Status !== "running") {
        return {
            statusCode: 409,
            body: {
                success: false,
                scenario: "backend-crash",
                message: "Backend container must be running before this test.",
            },
            experiment: {
                scenario: "backend-crash",
                status: "failed",
                message: "Backend container must be running before this test.",
            },
        };
    }

    const previousRestartCount = before.RestartCount;
    const previousStartedAt = before.StartedAt;
    const token = process.env.CHAOS_TEST_TOKEN;

    if (!token) {
        throw new Error("CHAOS_TEST_TOKEN is not configured.");
    }

    console.log(
        "[Chaos Controller] Triggering backend process crash via controlled app endpoint."
    );

    const crashResponse = await fetch(
        "http://127.0.0.1:5000/api/chaos/crash",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-chaos-token": token,
            },
        }
    );

    const crashBody = await crashResponse.json().catch(() => ({}));

    if (!crashResponse.ok || !crashBody.success) {
        throw new Error(
            crashBody.message || "Failed to trigger the controlled backend crash."
        );
    }

    console.log(
        "[Chaos Controller] Backend process crash endpoint accepted. Waiting for Docker restart."
    );

    const recovery = await waitForRestart(previousRestartCount, previousStartedAt);

    console.log(
        `[Chaos Controller] Recovery result: ${JSON.stringify(recovery)}`
    );

    if (!recovery.recovered) {
        return {
            statusCode: 500,
            body: {
                success: false,
                scenario: "backend-crash",
                message:
                    "Restart was not verified within the recovery timeout. Check Docker status and logs.",
            },
            experiment: {
                scenario: "backend-crash",
                status: "failed",
                message: "Restart was not verified within the recovery timeout.",
                recovery,
            },
        };
    }

    return {
        statusCode: 200,
        body: {
            success: true,
            scenario: "backend-crash",
            message:
                "Backend container restarted successfully and health checks passed.",
            ...recovery,
        },
        experiment: {
            scenario: "backend-crash",
            status: "passed",
            message:
                "Backend container restarted successfully and health checks passed.",
            recovery,
        },
    };
}

/**
 * Runs the backend crash scenario and converts a thrown error into the same
 * failed experiment result the controller has always recorded.
 */
async function executeBackendCrashExperiment() {
    try {
        return await runBackendCrashScenario();
    } catch (error) {
        console.error(
            "[Chaos Controller] Backend crash scenario failed:",
            error.message
        );

        return {
            statusCode: 500,
            body: {
                success: false,
                message: error.message,
            },
            experiment: {
                scenario: "backend-crash",
                status: "failed",
                message: error.message,
            },
        };
    }
}

function recordExperimentSafely(experiment) {
    try {
        recordExperiment(experiment);
    } catch (historyError) {
        console.error(
            "[Chaos Controller] Failed to save experiment result:",
            historyError.message
        );
    }
}

const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    if (req.headers.origin !== FRONTEND_ORIGIN) {
        res.writeHead(403);
        return res.end(JSON.stringify({
            success: false,
            message: "Local frontend origin required.",
        }));
    }

    if (
        req.method === "GET" &&
        req.url === "/api/chaos/database-recovery"
    ) {
        try {
            const healthState = await getBackendHealth();

            if (
                healthState.ok &&
                healthState.health.success === true &&
                healthState.health.database === "connected"
            ) {
                res.writeHead(200);
                return res.end(JSON.stringify({
                    success: true,
                    scenario: "database-recovery",
                    message: "Backend is healthy and MongoDB is connected.",
                    database: healthState.health.database,
                    status: healthState.health.status,
                    timestamp: new Date().toISOString(),
                }));
            }

            res.writeHead(503);
            return res.end(JSON.stringify({
                success: false,
                scenario: "database-recovery",
                message: "MongoDB is not currently connected.",
                database: healthState.health.database || "unknown",
                timestamp: new Date().toISOString(),
            }));
        } catch (error) {
            res.writeHead(502);
            return res.end(JSON.stringify({
                success: false,
                scenario: "database-recovery",
                message: error.message,
            }));
        }
    }

    if (
        req.method === "POST" &&
        req.url === "/api/chaos/database-recovery"
    ) {
        if (activeExperiment) {
            res.writeHead(409);
            return res.end(JSON.stringify({
                success: false,
                message: "Another experiment is already running.",
                active: activeExperiment,
            }));
        }

        activeExperiment = {
            scenario: "database-recovery",
            status: "running",
            startedAt: new Date().toISOString(),
        };

        const startedAt = Date.now();
        const stages = [{
            stage: "started",
            status: "pending",
            timestamp: new Date().toISOString(),
            message: "Database recovery experiment started.",
        }];

        try {
            const token = process.env.CHAOS_TEST_TOKEN;
            if (!token) {
                throw new Error("CHAOS_TEST_TOKEN is not configured.");
            }

            const trigger = await fetch(
                "http://127.0.0.1:5000/api/chaos/db-failure",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-chaos-token": token,
                    },
                }
            );

            const triggerBody = await trigger.json();

            if (!trigger.ok || !triggerBody.success) {
                throw new Error(triggerBody.message || "Failed to simulate database failure.");
            }

            stages.push({
                stage: "disconnect-simulated",
                status: "passed",
                timestamp: new Date().toISOString(),
                message: triggerBody.message,
            });

            const recovery = await verifyDatabaseRecovery();

            if (!recovery.recovered) {
                recordExperiment({
                    scenario: "database-recovery",
                    status: "failed",
                    message: "Database recovery did not complete within the recovery timeout.",
                    recovery,
                    stages,
                });

                res.writeHead(500);
                return res.end(JSON.stringify({
                    success: false,
                    scenario: "database-recovery",
                    message: "Database recovery did not complete within the recovery timeout.",
                    durationMs: Date.now() - startedAt,
                    stages,
                }));
            }

            const finalResult = {
                success: true,
                scenario: "database-recovery",
                message: "Database recovered successfully and a database-backed read succeeded.",
                recovered: true,
                database: recovery.database,
                status: recovery.status,
                durationMs: recovery.durationMs,
                stages: [...stages, ...recovery.stages],
                timestamp: new Date().toISOString(),
            };

            recordExperiment({
                scenario: "database-recovery",
                status: "passed",
                message: finalResult.message,
                recovery: finalResult,
                stages: finalResult.stages,
            });

            res.writeHead(200);
            return res.end(JSON.stringify(finalResult));
        } catch (error) {
            const failure = {
                success: false,
                scenario: "database-recovery",
                message: error.message,
                durationMs: Date.now() - startedAt,
                stages,
            };

            recordExperiment({
                scenario: "database-recovery",
                status: "failed",
                message: error.message,
                stages,
                recovery: failure,
            });

            res.writeHead(500);
            return res.end(JSON.stringify(failure));
        } finally {
            activeExperiment = null;
        }
    }

    if (req.method === "GET" && req.url === "/api/chaos/health") {
        res.writeHead(200);
        return res.end(JSON.stringify({
            success: true,
            service: "chaos-controller",
            status: "healthy",
        }));
    }

    if (
        req.method === "GET" &&
        req.url === "/api/chaos/diagnostics"
    ) {
        try {
            const container = getContainerState();

            let backendHealth;

            try {
                const response = await fetch(
                    "http://127.0.0.1:5000/api/health",
                    { signal: AbortSignal.timeout(3000) }
                );

                backendHealth = {
                    reachable: true,
                    httpStatus: response.status,
                    ...(await response.json()),
                };
            } catch (error) {
                backendHealth = {
                    reachable: false,
                    error: error.message,
                };
            }

            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                controller: "healthy",
                docker: {
                    status: container.Status,
                    restartCount: container.RestartCount,
                    health: container.Health?.Status || "not-reported",
                },
                backend: backendHealth,
                checkedAt: new Date().toISOString(),
            }));
        } catch (error) {
            res.writeHead(500);
            return res.end(JSON.stringify({
                success: false,
                message: error.message,
            }));
        }
    }

    if (
        req.method === "GET" &&
        req.url === "/api/chaos/experiments/history"
    ) {
        return res.end(JSON.stringify({
            success: true,
            experiments: loadExperimentHistory(),
        }));
    }

    if (
        req.method === "GET" &&
        req.url === "/api/chaos/experiments/active"
    ) {
        return res.end(JSON.stringify({
            success: true,
            active: activeExperiment,
        }));
    }

    if (
        req.method === "POST" &&
        req.url === "/api/chaos/inventory-integrity"
    ) {
        if (activeExperiment) {
            res.writeHead(409);
            return res.end(JSON.stringify({
                success: false,
                message: "Another experiment is already running.",
                active: activeExperiment,
            }));
        }

        activeExperiment = {
            scenario: "inventory-integrity",
            status: "running",
            startedAt: new Date().toISOString(),
        };

        const startedAt = Date.now();

        try {
            const response = await fetch(
                "http://127.0.0.1:5000/api/chaos/inventory-audit",
                { signal: AbortSignal.timeout(10000) }
            );

            const audit = await response.json();

            const passed =
                response.ok &&
                audit.success === true &&
                audit.status === "healthy" &&
                audit.issueCount === 0;

            const result = {
                success: passed,
                scenario: "inventory-integrity",
                message: passed
                    ? "Inventory integrity audit passed. No issues were detected."
                    : audit.success
                        ? `Inventory audit detected ${audit.issueCount} issue(s).`
                        : audit.message || "Inventory audit failed.",
                recovered: passed,
                readOnly: true,
                productsChecked: audit.productsChecked ?? 0,
                issueCount: audit.issueCount ?? null,
                issues: audit.issues ?? [],
                durationMs: Date.now() - startedAt,
                timestamp: new Date().toISOString(),
            };

            recordExperiment({
                scenario: "inventory-integrity",
                status: passed ? "passed" : "failed",
                message: result.message,
                recovery: result,
            });

            res.writeHead(passed ? 200 : 500);
            return res.end(JSON.stringify(result));
        } catch (error) {
            const result = {
                success: false,
                scenario: "inventory-integrity",
                message: error.message,
                readOnly: true,
                durationMs: Date.now() - startedAt,
                timestamp: new Date().toISOString(),
            };

            recordExperiment({
                scenario: "inventory-integrity",
                status: "failed",
                message: error.message,
                recovery: result,
            });

            res.writeHead(500);
            return res.end(JSON.stringify(result));
        } finally {
            activeExperiment = null;
        }
    }


    if (req.method === "POST" && req.url === "/api/chaos/payment-service-recovery") {
        if (activeExperiment) {
            res.writeHead(409);
            return res.end(JSON.stringify({
                success: false,
                message: "Another experiment is already running.",
                active: activeExperiment,
            }));
        }

        activeExperiment = {
            scenario: "payment-service-recovery",
            status: "running",
            startedAt: new Date().toISOString(),
        };

        let resultRecorded = false;

        try {
            const before = getPaymentContainerState();

            if (before.Status !== "running") {
                recordExperiment({
                    scenario: "payment-service-recovery",
                    status: "failed",
                    message: "Payment service must be running before this test.",
                });
                resultRecorded = true;

                res.writeHead(409);
                return res.end(JSON.stringify({
                    success: false,
                    message: "Payment service must be running before this test.",
                }));
            }

            const initialHealth = await getPaymentHealth();

            if (!initialHealth.healthy) {
                recordExperiment({
                    scenario: "payment-service-recovery",
                    status: "failed",
                    message: "Payment service must pass its initial health check.",
                });
                resultRecorded = true;

                res.writeHead(409);
                return res.end(JSON.stringify({
                    success: false,
                    message: "Payment service is not healthy before the test. No crash was triggered.",
                }));
            }

            const previousRestartCount = before.RestartCount;
            const previousStartedAt = before.StartedAt;
            const experimentStarted = Date.now();

            console.log("[Chaos Controller] Triggering payment service crash.");

            const crashProcess = spawn(
                "docker",
                [
                    "exec",
                    "shcom-payment-service",
                    "sh",
                    "-c",
                    'kill -9 "$(pidof node)"',
                ],
                {
                    stdio: "ignore",
                    windowsHide: true,
                }
            );

            crashProcess.on("error", (error) => {
                console.error(
                    "[Chaos Controller] Docker crash command error:",
                    error.message
                );
            });

            let recovery = {
                recovered: false,
                restartCount: previousRestartCount,
                status: "unknown",
                durationMs: null,
            };

            const deadline = Date.now() + 45000;

            while (Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 1500));

                try {
                    const current = getPaymentContainerState();
                    const healthCheck = await getPaymentHealth();

                    const restarted =
                        current.RestartCount > previousRestartCount ||
                        current.StartedAt !== previousStartedAt;

                    recovery = {
                        recovered:
                            current.Status === "running" &&
                            restarted &&
                            healthCheck.healthy,
                        restartCount: current.RestartCount,
                        startedAt: current.StartedAt,
                        status: current.Status,
                        health: healthCheck.health,
                        durationMs: Date.now() - experimentStarted,
                    };

                    if (recovery.recovered) {
                        break;
                    }
                } catch (error) {
                    recovery.lastError = error.message;
                }
            }

            if (!recovery.recovered) {
                recordExperiment({
                    scenario: "payment-service-recovery",
                    status: "failed",
                    message: "Payment service recovery was not verified within 45 seconds.",
                    recovery,
                });
                resultRecorded = true;

                res.writeHead(500);
                return res.end(JSON.stringify({
                    success: false,
                    scenario: "payment-service-recovery",
                    message: "Recovery was not verified within 45 seconds. Check Docker status and logs.",
                    recovery,
                }));
            }

            recordExperiment({
                scenario: "payment-service-recovery",
                status: "passed",
                message: "Payment service restarted and passed its health check.",
                recovery,
            });
            resultRecorded = true;

            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                scenario: "payment-service-recovery",
                message: "Payment service restarted and passed its health check.",
                ...recovery,
            }));
        } catch (error) {
            if (!resultRecorded) {
                try {
                    recordExperiment({
                        scenario: "payment-service-recovery",
                        status: "failed",
                        message: error.message,
                    });
                } catch (historyError) {
                    console.error(
                        "[Chaos Controller] Failed to save experiment result:",
                        historyError.message
                    );
                }
            }

            res.writeHead(500);
            return res.end(JSON.stringify({
                success: false,
                scenario: "payment-service-recovery",
                message: error.message,
            }));
        } finally {
            activeExperiment = null;
        }
    }

    if (req.method === "POST" && req.url === "/api/chaos/payment-reconcile") {
        if (reconcileInFlight) {
            res.writeHead(409);
            return res.end(JSON.stringify({
                success: false,
                message: "A reconciliation request is already in progress.",
            }));
        }

        if (!process.env.CHAOS_TEST_TOKEN) {
            res.writeHead(503);
            return res.end(JSON.stringify({
                success: false,
                message: "Administrative operations are not configured on this server.",
            }));
        }

        let body = {};
        try {
            body = await readJsonBody(req);
        } catch (error) {
            res.writeHead(400);
            return res.end(JSON.stringify({
                success: false,
                message: error.message,
            }));
        }

        reconcileInFlight = true;

        try {
            const limit = Math.min(
                Math.max(Number(body?.limit) || 25, 1),
                100
            );

            const response = await fetch(
                "http://127.0.0.1:5000/api/payments/reconcile",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-chaos-token": process.env.CHAOS_TEST_TOKEN,
                    },
                    body: JSON.stringify({ limit }),
                    signal: AbortSignal.timeout(30000),
                }
            );

            const payload = await response.json().catch(() => ({}));

            res.writeHead(response.status, {
                "Content-Type": "application/json",
            });
            return res.end(JSON.stringify({
                success: response.ok && payload.success !== false,
                ...payload,
            }));
        } catch (error) {
            res.writeHead(502);
            return res.end(JSON.stringify({
                success: false,
                message: error.message || "Payment reconciliation could not be completed.",
            }));
        } finally {
            reconcileInFlight = false;
        }
    }


    if (req.method === "POST" && req.url === "/api/chaos/backend-crash") {
        if (activeExperiment) {
            res.writeHead(409);
            return res.end(JSON.stringify({
                success: false,
                message: "Another experiment is already running.",
                active: activeExperiment,
            }));
        }

        let body = {};

        try {
            body = await readJsonBody(req);
        } catch (error) {
            res.writeHead(400);
            return res.end(JSON.stringify({
                success: false,
                message: error.message,
            }));
        }

        let coordinationPlan = null;

        try {
            coordinationPlan = buildCoordinationPlan(body);
        } catch (error) {
            res.writeHead(error.statusCode || 400);
            return res.end(JSON.stringify({
                success: false,
                message: error.message,
                errors: error.details || [],
            }));
        }

        activeExperiment = {
            id: coordinationPlan ? coordinationPlan.correlationId : null,
            scenario: "backend-crash",
            status: "running",
            startedAt: new Date().toISOString(),
        };

        try {
            if (!coordinationPlan) {
                const result = await executeBackendCrashExperiment();

                recordExperimentSafely(result.experiment);

                res.writeHead(result.statusCode);
                return res.end(JSON.stringify(result.body));
            }

            const coordination = await runCoordinatedBackendCrash(
                coordinationPlan,
                {
                    crashAction: executeBackendCrashExperiment,
                    onTrafficComplete: handleTrafficRunComplete,
                    notifyEvent: publishRecoveryEvent,
                }
            );

            const traffic = coordination.traffic;

            if (coordination.failure) {
                res.writeHead(coordination.failure.statusCode || 500);
                return res.end(JSON.stringify({
                    success: false,
                    scenario: "backend-crash",
                    message: coordination.failure.message,
                    experimentFailed: false,
                    correlationId: coordinationPlan.correlationId,
                    errors: coordination.failure.details || [],
                    traffic,
                }));
            }

            const crash = coordination.crash;

            recordExperimentSafely({
                ...crash.experiment,
                correlationId: coordinationPlan.correlationId,
                traffic,
            });

            res.writeHead(crash.statusCode);
            return res.end(JSON.stringify({
                ...crash.body,
                correlationId: coordinationPlan.correlationId,
                traffic,
            }));
        } finally {
            activeExperiment = null;
        }
    }

    if (
        req.method === "GET" &&
        req.url === "/api/chaos/traffic/endpoints"
    ) {
        res.writeHead(200);
        return res.end(JSON.stringify({
            success: true,
            ...getTrafficMetadata(),
        }));
    }

    if (
        req.method === "GET" &&
        req.url === "/api/chaos/traffic/status"
    ) {
        res.writeHead(200);
        return res.end(JSON.stringify({
            success: true,
            ...getTrafficStatus(),
            limits: getTrafficMetadata().limits,
            target: getTrafficMetadata().target,
        }));
    }

    if (
        req.method === "GET" &&
        req.url.startsWith("/api/chaos/traffic/requests")
    ) {
        const query = new URL(req.url, "http://localhost").searchParams;
        const limit = query.get("limit");

        res.writeHead(200);
        return res.end(JSON.stringify({
            success: true,
            requests: getTrafficRequests(limit ? Number(limit) : 100),
        }));
    }

    if (
        req.method === "POST" &&
        req.url === "/api/chaos/traffic/start"
    ) {
        try {
            const body = await readJsonBody(req);
            const run = startTrafficRun(body, {
                onComplete: handleTrafficRunComplete,
            });

            console.log(
                `[Chaos Controller] Synthetic traffic run ${run.experimentId} started (${run.config.ratePerSecond}/s, concurrency ${run.config.concurrency}, ${run.config.durationSeconds}s).`
            );

            res.writeHead(202);
            return res.end(JSON.stringify({
                success: true,
                experimentId: run.experimentId,
                message: "Synthetic traffic run started.",
                run: run.snapshot(),
            }));
        } catch (error) {
            const statusCode = error.statusCode || 500;

            res.writeHead(statusCode);
            return res.end(JSON.stringify({
                success: false,
                message: error.message,
                errors: error.details || [],
            }));
        }
    }

    if (
        req.method === "POST" &&
        req.url === "/api/chaos/traffic/stop"
    ) {
        try {
            const run = stopTrafficRun("Stopped by operator.");
            const experimentId = run.experimentId;

            console.log(
                `[Chaos Controller] Synthetic traffic run ${experimentId} stop requested.`
            );

            res.writeHead(202);
            return res.end(JSON.stringify({
                success: true,
                experimentId,
                message: "Stop requested. In-flight requests are being aborted.",
                run: run.snapshot(),
            }));
        } catch (error) {
            const statusCode = error.statusCode || 500;

            res.writeHead(statusCode);
            return res.end(JSON.stringify({
                success: false,
                message: error.message,
                errors: error.details || [],
            }));
        }
    }

    res.writeHead(404);
    res.end(JSON.stringify({
        success: false,
        message: "Unknown endpoint.",
    }));
});

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(
            `[Chaos Controller] Port ${PORT} is already in use on 127.0.0.1. Stop the stale Node process before restarting the chaos controller.`
        );
        process.exit(1);
    }

    console.error("[Chaos Controller] Server failed to start:", error.message);
    process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`SHCom Chaos Controller: http://localhost:${PORT}`);
});
