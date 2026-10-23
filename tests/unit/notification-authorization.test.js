const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("../../backend/node_modules/jsonwebtoken");

process.env.JWT_SECRET = "notification-route-test-secret";
const express = require("../../backend/node_modules/express");
const notificationRoutes = require("../../backend/src/routes/notificationRoutes");
const paymentRoutes = require("../../backend/src/routes/paymentRoutes");
const experimentRoutes = require("../../backend/src/routes/experimentRoutes");
const { requireServiceToken } = require("../../backend/src/middleware/serviceToken");
const { record } = require("../../backend/src/controllers/internalNotificationController");
const Notification = require("../../backend/src/models/Notification");
const { publishAdminNotification } = require("../../chaos/notification-client");

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("notification APIs reject anonymous and customer requests", async (t) => {
  const app = express();
  app.use("/api/admin/notifications", notificationRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const url = `http://127.0.0.1:${server.address().port}/api/admin/notifications`;
  const anonymous = await fetch(url);
  assert.equal(anonymous.status, 401);

  const customerToken = jwt.sign(
    { userId: "customer-1", email: "customer@example.test", role: "customer" },
    process.env.JWT_SECRET
  );
  const customer = await fetch(`${url}/read-all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert.equal(customer.status, 403);
});

test("payment chaos controls and admin attempt listing reject customers", async (t) => {
  const app = express();
  app.use("/api/payments", paymentRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/payments/admin/response-loss/start`;
  assert.equal((await fetch(url, { method: "POST" })).status, 401);
  const customerToken = jwt.sign(
    { userId: "customer-1", email: "customer@example.test", role: "customer" },
    process.env.JWT_SECRET
  );
  const customer = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ durationMs: 5000 }),
  });
  assert.equal(customer.status, 403);
  const reconcile = await fetch(`http://127.0.0.1:${server.address().port}/api/payments/reconcile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(reconcile.status, 403);
});

test("experiment orchestration rejects anonymous and customer mutation requests", async (t) => {
  const app = express();
  app.use("/api/admin/experiments", experimentRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/admin/experiments/run/backend-crash`;
  assert.equal((await fetch(url, { method: "POST" })).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/admin/experiments/history`)).status, 401);
  const token = jwt.sign({ userId: "customer-1", role: "customer" }, process.env.JWT_SECRET);
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 403);
  const customerHistory = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/experiments/history`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(customerHistory.status, 403);
});

test("internal event intake requires the configured service token", () => {
  const previous = process.env.CHAOS_TEST_TOKEN;
  process.env.CHAOS_TEST_TOKEN = "trusted-service-token";
  try {
    const res = createResponse();
    let nextCalled = false;
    requireServiceToken(
      { get: () => "wrong-token" },
      res,
      () => { nextCalled = true; }
    );
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);

    const allowed = createResponse();
    requireServiceToken(
      { get: () => "trusted-service-token" },
      allowed,
      () => { nextCalled = true; }
    );
    assert.equal(nextCalled, true);
  } finally {
    if (previous === undefined) delete process.env.CHAOS_TEST_TOKEN;
    else process.env.CHAOS_TEST_TOKEN = previous;
  }
});

test("internal event intake rejects unverified payment-like outcomes", async () => {
  const res = createResponse();
  await record(
    {
      body: {
        type: "chaos_outcome",
        eventId: "exp-1",
        scenario: "payment-recovery",
        status: "paid",
        message: "Payment recovery",
      },
    },
    res
  );
  assert.equal(res.statusCode, 400);
});

test("notification model stores a unique sparse source event key", () => {
  assert.ok(Notification.schema.path("eventKey"));
  assert.ok(
    Notification.schema.indexes().some(
      ([keys, options]) =>
        keys.eventKey === 1 && options.unique === true && options.sparse === true
    )
  );
});

test("chaos publisher sends persisted outcomes to the backend event API", async () => {
  let request;
  const sent = await publishAdminNotification(
    {
      type: "chaos_outcome",
      eventId: "exp-1",
      scenario: "backend-crash",
      status: "passed",
      message: "Backend recovered and passed health checks.",
    },
    {
      backendUrl: "http://backend.test/",
      token: "service-token",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, status: 201 };
      },
    }
  );

  assert.equal(sent, true);
  assert.equal(request.url, "http://backend.test/api/internal/notifications");
  assert.equal(request.options.headers["x-chaos-token"], "service-token");
  assert.equal(JSON.parse(request.options.body).eventId, "exp-1");
});

test("chaos publisher retries a transient backend failure", async () => {
  let calls = 0;
  const sent = await publishAdminNotification(
    {
      type: "service_recovered",
      eventId: "evt-recovered-1",
      service: "backend",
      status: "recovered",
      message: "Health checks passed.",
    },
    {
      token: "service-token",
      fetchImpl: async () => {
        calls += 1;
        return { ok: calls > 1, status: calls > 1 ? 201 : 503 };
      },
    }
  );

  assert.equal(sent, true);
  assert.equal(calls, 2);
});
