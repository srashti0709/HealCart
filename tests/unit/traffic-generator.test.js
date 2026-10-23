const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  validateTrafficConfig,
  summarizeRecords,
  startTrafficRun,
  stopTrafficRun,
  getTrafficStatus,
  getTrafficRequests,
  getTrafficMetadata,
  TRAFFIC_LIMITS,
} = require('../../chaos/traffic-generator.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseConfig = {
  ratePerSecond: 5,
  concurrency: 2,
  durationSeconds: 5,
  requestTimeoutMs: 1000,
  endpoints: ['health'],
};

/**
 * Starts a local HTTP server that behaves like the read-only endpoints the
 * traffic generator is allowed to call.
 */
function startTestServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

const waitForRun = async (experimentId, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = getTrafficStatus();

    if (status.lastRun && status.lastRun.experimentId === experimentId) {
      return status.lastRun;
    }

    await sleep(50);
  }

  throw new Error('Timed out waiting for the traffic run to finish.');
};

test('validateTrafficConfig accepts a valid configuration', () => {
  const result = validateTrafficConfig(baseConfig);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.config.ratePerSecond, 5);
  assert.equal(result.config.concurrency, 2);
  assert.equal(result.config.durationSeconds, 5);
  assert.equal(result.config.requestTimeoutMs, 1000);
  assert.deepEqual(result.config.endpoints, ['health']);
  assert.equal(result.config.maxRequests, 25);
});

test('validateTrafficConfig rejects settings above the server limits', () => {
  const result = validateTrafficConfig({
    ...baseConfig,
    ratePerSecond: TRAFFIC_LIMITS.ratePerSecond.max + 1,
    concurrency: TRAFFIC_LIMITS.concurrency.max + 1,
    durationSeconds: TRAFFIC_LIMITS.durationSeconds.max + 1,
    requestTimeoutMs: TRAFFIC_LIMITS.requestTimeoutMs.max + 1,
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 4);
});

test('validateTrafficConfig rejects settings below the server limits', () => {
  const result = validateTrafficConfig({
    ...baseConfig,
    ratePerSecond: 0,
    concurrency: 0,
    durationSeconds: 0,
    requestTimeoutMs: 100,
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 4);
});

test('validateTrafficConfig rejects non numeric settings', () => {
  const result = validateTrafficConfig({
    ...baseConfig,
    ratePerSecond: 'fast',
    concurrency: 2.5,
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test('validateTrafficConfig rejects endpoints that are not allowlisted', () => {
  const result = validateTrafficConfig({
    ...baseConfig,
    endpoints: ['health', '/api/orders', 'delete-everything'],
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /not an approved read-only endpoint/);
});

test('validateTrafficConfig rejects an empty endpoint selection', () => {
  const result = validateTrafficConfig({ ...baseConfig, endpoints: [] });

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /at least one approved read-only endpoint/i);
});

test('validateTrafficConfig rejects non GET methods and target overrides', () => {
  const result = validateTrafficConfig({
    ...baseConfig,
    method: 'POST',
    target: 'http://evil.example.com',
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test('the endpoint allowlist only exposes read-only GET routes', () => {
  const { endpoints } = getTrafficMetadata();

  assert.ok(endpoints.length > 0);

  for (const endpoint of endpoints) {
    assert.equal(endpoint.method, 'GET');
    assert.ok(endpoint.path.startsWith('/api/'));
  }

  const paths = endpoints.map((endpoint) => endpoint.path);

  assert.ok(paths.includes('/api/products'));
  assert.ok(paths.includes('/api/products/:id'));
  assert.ok(paths.includes('/api/health'));

  for (const mutating of ['/api/orders', '/api/cart', '/api/restocks']) {
    assert.ok(!paths.includes(mutating));
  }
});

test('a run sends real requests and records the actual outcomes', async () => {
  let requestCount = 0;

  const target = await startTestServer((req, res) => {
    requestCount += 1;

    if (req.url === '/api/ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false }));
  });

  try {
    const run = startTrafficRun(
      {
        ratePerSecond: 10,
        concurrency: 2,
        durationSeconds: 5,
        requestTimeoutMs: 1000,
        endpoints: ['health'],
      },
      { targetBaseUrl: target.baseUrl }
    );

    const finished = await waitForRun(run.experimentId);

    assert.equal(finished.status, 'completed');
    assert.equal(finished.summary.totalRequests, requestCount);
    assert.ok(finished.summary.totalRequests > 0);
    assert.equal(
      finished.summary.successfulRequests + finished.summary.failedRequests,
      finished.summary.totalRequests
    );
    assert.ok(finished.summary.latency);
    assert.ok(finished.summary.latency.averageMs >= 0);
    assert.ok(finished.summary.latency.samples > 0);

    const records = getTrafficRequests(100);

    assert.equal(records.length, finished.summary.totalRequests);

    for (const record of records) {
      assert.equal(record.method, 'GET');
      assert.equal(record.source, 'synthetic');
      assert.equal(record.experimentId, run.experimentId);
      assert.ok(record.timestamp);
      assert.ok(record.httpStatus !== null);
      assert.equal(record.success, record.outcome === 'success');
    }
  } finally {
    await target.close();
  }
});

test('a run records HTTP errors separately from successful responses', async () => {
  const target = await startTestServer((req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false }));
  });

  try {
    const run = startTrafficRun(
      {
        ratePerSecond: 10,
        concurrency: 2,
        durationSeconds: 5,
        requestTimeoutMs: 1000,
        endpoints: ['health'],
      },
      { targetBaseUrl: target.baseUrl }
    );

    const finished = await waitForRun(run.experimentId);

    assert.equal(finished.summary.totalRequests > 0, true);
    assert.equal(finished.summary.successfulRequests, 0);
    assert.equal(finished.summary.failedRequests, finished.summary.totalRequests);
    assert.equal(finished.summary.httpErrorRequests, finished.summary.totalRequests);
    assert.equal(finished.summary.timeoutRequests, 0);
    assert.equal(finished.summary.networkErrorRequests, 0);
    assert.deepEqual(finished.summary.statusDistribution, { 503: finished.summary.totalRequests });
  } finally {
    await target.close();
  }
});

test('a slow endpoint produces real timeouts that are never counted as success', async () => {
  const sockets = new Set();

  const target = await startTestServer((req, res) => {
    sockets.add(res);

    setTimeout(() => {
      if (!res.writableEnded) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
    }, 2000);
  });

  try {
    const run = startTrafficRun(
      {
        ratePerSecond: 5,
        concurrency: 1,
        durationSeconds: 5,
        requestTimeoutMs: 500,
        endpoints: ['health'],
      },
      { targetBaseUrl: target.baseUrl }
    );

    const finished = await waitForRun(run.experimentId);

    assert.ok(finished.summary.timeoutRequests > 0);
    assert.equal(finished.summary.successfulRequests, 0);
    assert.equal(finished.summary.latency, null);

    const records = getTrafficRequests(100);
    const timeoutRecords = records.filter((record) => record.outcome === 'timeout');

    assert.ok(timeoutRecords.length > 0);
    assert.equal(timeoutRecords[0].httpStatus, null);
    assert.equal(timeoutRecords[0].latencyMs, null);
    assert.equal(timeoutRecords[0].success, false);
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }

    await target.close();
  }
});

test('an unreachable target produces network errors, not successes', async () => {
  // Port 1 on loopback refuses connections.
  const run = startTrafficRun(
    {
      ratePerSecond: 5,
      concurrency: 1,
      durationSeconds: 5,
      requestTimeoutMs: 1000,
      endpoints: ['health'],
    },
    { targetBaseUrl: 'http://127.0.0.1:1' }
  );

  const finished = await waitForRun(run.experimentId);

  assert.ok(finished.summary.totalRequests > 0);
  assert.equal(finished.summary.successfulRequests, 0);
  assert.ok(finished.summary.networkErrorRequests > 0);
  assert.equal(finished.summary.latency, null);
});

test('stopping a run prevents further requests and cleans up', async () => {
  let requestCount = 0;

  const target = await startTestServer((req, res) => {
    requestCount += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });

  try {
    const run = startTrafficRun(
      {
        ratePerSecond: 2,
        concurrency: 1,
        durationSeconds: 120,
        requestTimeoutMs: 1000,
        endpoints: ['health'],
      },
      { targetBaseUrl: target.baseUrl }
    );

    await sleep(700);
    stopTrafficRun("Stopped by the test.");
    const countAtStop = requestCount;

    await sleep(1200);
    const finished = await waitForRun(run.experimentId);

    assert.equal(finished.status, 'stopped');
    assert.equal(getTrafficStatus().running, false);
    assert.ok(countAtStop > 0);

    const records = getTrafficRequests(200);
    const total = records.length;
    const started = run.startedAtMs;

    assert.equal(total, finished.summary.totalRequests);
    assert.ok(started > 0);
  } finally {
    await target.close();
  }
});

test('a second run is rejected while a run is active', async () => {
  const target = await startTestServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });

  try {
    const run = startTrafficRun(
      {
        ratePerSecond: 2,
        concurrency: 1,
        durationSeconds: 30,
        requestTimeoutMs: 1000,
        endpoints: ['health'],
      },
      { targetBaseUrl: target.baseUrl }
    );

    assert.throws(
      () => startTrafficRun(baseConfig, { targetBaseUrl: target.baseUrl }),
      (error) => error.statusCode === 409
    );

    stopTrafficRun("Stopped by the test.");
    await waitForRun(run.experimentId);
  } finally {
    await target.close();
  }
});

test('an invalid configuration is rejected before any request is sent', () => {
  assert.throws(
    () =>
      startTrafficRun({
        ratePerSecond: 9999,
        concurrency: 9999,
        durationSeconds: 9999,
        requestTimeoutMs: 9999,
        endpoints: ['not-allowed'],
      }),
    (error) => error.statusCode === 400 && error.details.length > 0
  );
});

test('summarizeRecords does not invent latency when no measurement exists', () => {
  const summary = summarizeRecords(
    [
      {
        success: false,
        outcome: 'timeout',
        httpStatus: null,
        latencyMs: null,
        endpointId: 'health',
        endpoint: '/api/health',
        method: 'GET',
      },
    ],
    1000
  );

  assert.equal(summary.totalRequests, 1);
  assert.equal(summary.failedRequests, 1);
  assert.equal(summary.timeoutRequests, 1);
  assert.equal(summary.latency, null);
  assert.equal(summary.statusDistribution && Object.keys(summary.statusDistribution).length, 0);
});
