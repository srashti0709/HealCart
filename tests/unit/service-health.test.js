const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyProbe, serviceTelemetry, reliabilitySummary } = require("../../frontend/src/lib/serviceHealth.js");

const now = Date.parse("2026-10-23T10:00:00.000Z");

test("service probe states require a fresh authoritative health response", () => {
  assert.equal(classifyProbe({ success: true, status: "healthy", timestamp: new Date(now).toISOString() }, "", now), "healthy");
  assert.equal(classifyProbe({ success: false, status: "degraded", timestamp: new Date(now).toISOString() }, "", now), "degraded");
  assert.equal(classifyProbe({ success: true, status: "degraded", timestamp: new Date(now).toISOString() }, "", now), "degraded");
  assert.equal(classifyProbe({ success: false, status: "unhealthy", timestamp: new Date(now).toISOString() }, "", now), "unhealthy");
  assert.equal(classifyProbe(null, "network unavailable", now), "unknown");
  assert.equal(classifyProbe({ success: true, status: "healthy", timestamp: new Date(now - 60_000).toISOString() }, "", now), "unknown");
});

test("service telemetry never invents successful checks or recovery counts", () => {
  const telemetry = serviceTelemetry({ service: "payment", probe: null, probeError: "offline", now });
  assert.equal(telemetry.status, "unknown");
  assert.equal(telemetry.lastSuccessfulProbe, null);
  assert.equal(telemetry.latestFailure, null);
  assert.equal(telemetry.recoveryAttempts, null);
  assert.equal(telemetry.probeFreshness, "Unavailable");
});

test("service telemetry retains the last successful timestamp alongside a failed probe", () => {
  const telemetry = serviceTelemetry({
    service: "backend",
    probe: {
      success: false,
      status: "unhealthy",
      timestamp: "2026-10-23T09:59:30.000Z",
      lastSuccessfulTimestamp: "2026-10-23T09:55:00.000Z",
    },
    now,
  });
  assert.equal(telemetry.status, "unhealthy");
  assert.equal(telemetry.lastSuccessfulProbe, "2026-10-23T09:55:00.000Z");
  assert.equal(telemetry.latestFailure, "2026-10-23T09:59:30.000Z");
});

test("reliability metrics use only closed incidents with valid recorded timestamps", () => {
  const summary = reliabilitySummary([
    { status: "resolved", detectedAt: "2026-10-23T09:00:00.000Z", resolvedAt: "2026-10-23T09:02:00.000Z" },
    { status: "failed", detectedAt: "2026-10-23T09:00:00.000Z", resolvedAt: "2026-10-23T09:05:00.000Z" },
    { status: "detected", detectedAt: "2026-10-23T09:00:00.000Z" },
    { status: "resolved", detectedAt: "invalid", resolvedAt: "2026-10-23T09:02:00.000Z" },
  ]);
  assert.equal(summary.totalRecorded, 4);
  assert.equal(summary.completed, 3);
  assert.equal(summary.recovered, 2);
  assert.equal(summary.successRate, 2 / 3);
  assert.equal(summary.measuredRecoveryCount, 1);
  assert.equal(summary.meanRecoveryMs, 120000);
});
