const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shcom-coordination-'));

process.env.TRAFFIC_HISTORY_PATH = path.join(
    tempDir,
    'traffic-history.json'
);

const {
    buildCoordinationPlan,
    runCoordinatedBackendCrash,
    COORDINATED_TRAFFIC_PROFILE,
} = require('../../chaos/crash-coordination.js');

const {
    getTrafficStatus,
    startTrafficRun,
    stopTrafficRun,
} = require('../../chaos/traffic-generator.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForNoActiveRun = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (!getTrafficStatus().running) {
            return true;
        }

        await sleep(50);
    }

    return false;
};

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function startTestServer(handler) {
    return new Promise((resolve) => {
        const sockets = new Set();
        const server = http.createServer(handler);

        server.on('connection', (socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
        });

        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();

            resolve({
                baseUrl: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((done) => {
                        for (const socket of sockets) {
                            socket.destroy();
                        }

                        server.closeAllConnections?.();
                        server.close(() => done());
                    }),
            });
        });
    });
}

const okServer = () =>
    startTestServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    });

const planFor = (overrides = {}) => {
    const plan = buildCoordinationPlan({
        traffic: {
            enabled: true,
            ratePerSecond: 5,
            concurrency: 2,
            durationSeconds: 30,
            requestTimeoutMs: 1000,
            endpoints: ['health'],
            ...overrides,
        },
    });

    plan.firstRequestTimeoutMs = 8000;
    plan.settleAfterRecoveryMs = 200;

    return plan;
};

test('no coordination plan is produced when traffic is not requested', () => {
    assert.equal(buildCoordinationPlan({}), null);
    assert.equal(buildCoordinationPlan(undefined), null);
    assert.equal(buildCoordinationPlan({ traffic: null }), null);
    assert.equal(buildCoordinationPlan({ traffic: { enabled: false } }), null);
});

test('a coordination plan uses the server-side profile when nothing is overridden', () => {
    const plan = buildCoordinationPlan({ traffic: { enabled: true } });

    assert.ok(plan);
    assert.equal(
        plan.trafficConfig.ratePerSecond,
        COORDINATED_TRAFFIC_PROFILE.ratePerSecond
    );
    assert.equal(
        plan.trafficConfig.durationSeconds,
        COORDINATED_TRAFFIC_PROFILE.durationSeconds
    );
    assert.equal(
        plan.trafficConfig.requestTimeoutMs,
        COORDINATED_TRAFFIC_PROFILE.requestTimeoutMs
    );
    assert.deepEqual(
        plan.trafficConfig.endpoints,
        COORDINATED_TRAFFIC_PROFILE.endpoints
    );
    assert.ok(plan.correlationId);
});

test('an invalid coordinated configuration is rejected before anything runs', () => {
    assert.throws(
        () =>
            buildCoordinationPlan({
                traffic: { enabled: true, endpoints: ['/api/orders'] },
            }),
        (error) => error.statusCode === 400 && error.details.length > 0
    );

    assert.throws(
        () =>
            buildCoordinationPlan({
                traffic: { enabled: true, ratePerSecond: 5000 },
            }),
        (error) => error.statusCode === 400
    );

    assert.throws(
        () =>
            buildCoordinationPlan({
                traffic: { enabled: true, concurrency: 0 },
            }),
        (error) => error.statusCode === 400
    );
});

test('coordinated traffic starts first and the crash runs after a real request completed', async () => {
    const target = await okServer();

    try {
        let crashCalled = false;
        let totalAtCrashTime = null;

        const plan = planFor();
        const outcome = await runCoordinatedBackendCrash(plan, {
            targetBaseUrl: target.baseUrl,
            crashAction: async () => {
                crashCalled = true;
                totalAtCrashTime =
                    getTrafficStatus().active.summary.totalRequests;

                return {
                    statusCode: 200,
                    body: { success: true, scenario: 'backend-crash' },
                    experiment: {
                        scenario: 'backend-crash',
                        status: 'passed',
                        message: 'ok',
                    },
                };
            },
        });

        assert.equal(crashCalled, true);
        assert.ok(
            totalAtCrashTime >= 1,
            'the crash must only run after at least one real request completed'
        );
        assert.equal(outcome.failure, null);
        assert.equal(outcome.traffic.correlationId, plan.correlationId);
        assert.equal(outcome.traffic.summaryAvailable, true);
        assert.ok(outcome.traffic.summary.totalRequests >= 1);
        assert.equal(
            outcome.traffic.summary.successfulRequests +
                outcome.traffic.summary.failedRequests,
            outcome.traffic.summary.totalRequests
        );
        assert.equal(outcome.traffic.cleanup.stopped, true);
        assert.equal(getTrafficStatus().running, false);
    } finally {
        await target.close();
    }
});

test('a traffic start failure prevents the crash from being triggered', async () => {
    const target = await okServer();

    try {
        // Occupy the single traffic slot with an unrelated run.
        const blocker = startTrafficRun(
            {
                ratePerSecond: 2,
                concurrency: 1,
                durationSeconds: 30,
                requestTimeoutMs: 1000,
                endpoints: ['health'],
            },
            { targetBaseUrl: target.baseUrl }
        );

        let crashCalled = false;

        const plan = planFor();
        const outcome = await runCoordinatedBackendCrash(plan, {
            targetBaseUrl: target.baseUrl,
            crashAction: async () => {
                crashCalled = true;
                return {
                    statusCode: 200,
                    body: { success: true },
                    experiment: { scenario: 'backend-crash', status: 'passed' },
                };
            },
        });

        assert.equal(crashCalled, false, 'the crash must not run without traffic');
        assert.ok(outcome.failure);
        assert.match(outcome.failure.message, /could not start/i);
        assert.equal(outcome.traffic.summaryAvailable, false);

        // The unrelated blocker run must still be running and untouched.
        const status = getTrafficStatus();
        assert.equal(status.running, true);
        assert.equal(status.active.experimentId, blocker.experimentId);

        stopTrafficRun('Test cleanup.');
        assert.equal(await waitForNoActiveRun(), true);
    } finally {
        await target.close();
    }
});

test('the crash is not triggered when no traffic request completes in time', async () => {
    const target = await startTestServer(() => {
        // Never responds, so no request can complete.
    });

    try {
        let crashCalled = false;

        const plan = planFor({
            requestTimeoutMs: 10000,
            concurrency: 1,
        });

        plan.firstRequestTimeoutMs = 700;

        const outcome = await runCoordinatedBackendCrash(plan, {
            targetBaseUrl: target.baseUrl,
            crashAction: async () => {
                crashCalled = true;
                return {
                    statusCode: 200,
                    body: { success: true },
                    experiment: { scenario: 'backend-crash', status: 'passed' },
                };
            },
        });

        assert.equal(crashCalled, false);
        assert.ok(outcome.failure);
        assert.match(outcome.failure.message, /did not complete a request/i);
        assert.equal(outcome.failure.statusCode, 504);

        // The timed out run must be cleaned up.
        assert.equal(getTrafficStatus().running, false);
        assert.equal(outcome.traffic.cleanup.stopped, true);
    } finally {
        await target.close();
    }
});

test('the coordinated traffic run is stopped when the crash action fails', async () => {
    const target = await okServer();

    try {
        const plan = planFor();
        const outcome = await runCoordinatedBackendCrash(plan, {
            targetBaseUrl: target.baseUrl,
            crashAction: async () => {
                throw new Error('crash action exploded');
            },
        });

        assert.ok(outcome.failure);
        assert.match(outcome.failure.message, /crash action exploded/);
        assert.equal(outcome.crash, null);
        assert.equal(outcome.traffic.cleanup.stopped, true);
        assert.equal(outcome.traffic.cleanup.error, null);
        assert.equal(getTrafficStatus().running, false);
        assert.equal(outcome.traffic.summaryAvailable, true);
    } finally {
        await target.close();
    }
});

test('the coordination reports an observed summary that matches the recorded requests', async () => {
    const target = await okServer();

    try {
        const plan = planFor();
        const outcome = await runCoordinatedBackendCrash(plan, {
            targetBaseUrl: target.baseUrl,
            crashAction: async () => ({
                statusCode: 200,
                body: { success: true },
                experiment: { scenario: 'backend-crash', status: 'passed' },
            }),
        });

        const summary = outcome.traffic.summary;

        assert.ok(summary.totalRequests > 0);
        assert.equal(
            summary.successfulRequests + summary.failedRequests,
            summary.totalRequests
        );
        assert.equal(summary.failedRequests, 0);
        assert.deepEqual(summary.statusDistribution, {
            200: summary.totalRequests,
        });
        assert.equal(summary.latency.samples, summary.totalRequests);
        assert.ok(summary.latency.averageMs >= 0);
    } finally {
        await target.close();
    }
});

const getFreePort = () =>
    new Promise((resolve) => {
        const server = net.createServer();

        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();

            server.close(() => resolve(port));
        });
    });

const waitForPort = async (port, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const reachable = await new Promise((resolve) => {
            const socket = net.connect(port, '127.0.0.1');

            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.once('error', () => {
                socket.destroy();
                resolve(false);
            });
        });

        if (reachable) {
            return true;
        }

        await sleep(200);
    }

    return false;
};

test('the non-coordinated crash endpoint keeps its existing behaviour', async () => {
    const port = await getFreePort();
    const historyPath = path.join(tempDir, 'experiment-history.json');

    // An invalid token means the controlled crash is rejected by the backend,
    // so the real container is never crashed during this test.
    const child = spawn(process.execPath, ['chaos/chaos-controller.js'], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            CHAOS_CONTROLLER_PORT: String(port),
            CHAOS_TEST_TOKEN: 'invalid-token-for-coordination-test',
            CHAOS_EXPERIMENT_HISTORY_PATH: historyPath,
        },
        stdio: 'ignore',
    });

    try {
        const ready = await waitForPort(port);
        assert.equal(ready, true, 'the chaos controller should start');

        const response = await fetch(
            `http://127.0.0.1:${port}/api/chaos/backend-crash`,
            {
                method: 'POST',
                headers: { origin: 'http://localhost:5173' },
            }
        );

        const body = await response.json();

        assert.equal(response.status, 500);
        assert.equal(body.success, false);
        assert.ok(body.message);

        // The legacy response shape is unchanged: no traffic block, no
        // correlation id and no coordinated fields.
        assert.equal(body.traffic, undefined);
        assert.equal(body.correlationId, undefined);
        assert.equal(body.experimentFailed, undefined);

        // The failed attempt is still recorded in the experiment history.
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        const entry = history.find((item) => item.scenario === 'backend-crash');

        assert.ok(entry);
        assert.equal(entry.status, 'failed');
        assert.equal(entry.correlationId, undefined);
    } finally {
        child.kill();
    }
});

test('an invalid coordinated configuration is rejected by the http endpoint before any crash', async () => {
    const port = await getFreePort();
    const historyPath = path.join(tempDir, 'experiment-history-http.json');

    const child = spawn(process.execPath, ['chaos/chaos-controller.js'], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            CHAOS_CONTROLLER_PORT: String(port),
            CHAOS_TEST_TOKEN: 'invalid-token-for-coordination-test',
            CHAOS_EXPERIMENT_HISTORY_PATH: historyPath,
        },
        stdio: 'ignore',
    });

    try {
        const ready = await waitForPort(port);
        assert.equal(ready, true, 'the chaos controller should start');

        const response = await fetch(
            `http://127.0.0.1:${port}/api/chaos/backend-crash`,
            {
                method: 'POST',
                headers: {
                    origin: 'http://localhost:5173',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    traffic: { enabled: true, endpoints: ['/api/orders'] },
                }),
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.ok(Array.isArray(body.errors));
        assert.ok(body.errors.length > 0);

        // Nothing was recorded, so no crash experiment was started.
        const history = fs.existsSync(historyPath)
            ? JSON.parse(fs.readFileSync(historyPath, 'utf8'))
            : [];

        assert.equal(
            history.filter((item) => item.scenario === 'backend-crash').length,
            0
        );
    } finally {
        child.kill();
    }
});
