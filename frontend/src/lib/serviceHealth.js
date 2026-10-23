const timestampValue = (value) => {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export const classifyProbe = (probe, error = "", now = Date.now(), freshnessMs = 45000) => {
  const checkedAt = timestampValue(probe?.timestamp);
  if (!probe || checkedAt === null || now - checkedAt > freshnessMs || now < checkedAt) return "unknown";
  const status = String(probe.status || "").toLowerCase();
  if (status === "recovering") return "recovering";
  if (status === "degraded") return "degraded";
  if (probe.success === true && status === "healthy") return "healthy";
  if (status === "unhealthy" || status === "down" || probe.success === false) return "unhealthy";
  return error ? "unknown" : "unknown";
};

const latestTimestamp = (items, fields = ["timestamp", "detectedAt"]) => items
  .map((item) => timestampValue(fields.map((field) => item?.[field]).find(Boolean)))
  .filter((value) => value !== null)
  .sort((a, b) => b - a)[0] || null;

export const serviceTelemetry = ({ service, probe, probeError = "", events = [], incidents = [], now = Date.now() }) => {
  const normalized = service.toLowerCase();
  const isForService = (item) => {
    const label = `${item?.service || ""} ${item?.type || ""} ${item?.incidentType || ""}`.toLowerCase();
    if (normalized === "backend") return label.includes("backend") || label.includes("crash");
    if (normalized === "mongodb") return label.includes("database") || label.includes("mongodb");
    if (normalized === "payment") return label.includes("payment");
    if (normalized === "frontend") return label.includes("frontend");
    return false;
  };
  const serviceEvents = [...events, ...incidents].filter(isForService);
  const failures = serviceEvents.filter((item) => {
    const status = String(item.status || item.outcome || "").toLowerCase();
    const type = String(item.type || item.incidentType || "").toLowerCase();
    return ["failed", "failure", "detected", "recovering"].includes(status) || /crash|disconnect|failed|failure|uncertain/.test(type);
  });
  if ((probe?.success === false || (probe?.status && probe.status !== "healthy")) && timestampValue(probe.timestamp) !== null) failures.push({ timestamp: probe.timestamp });
  const recoveries = serviceEvents.filter((item) => {
    const type = String(item.type || item.incidentType || "").toLowerCase();
    const status = String(item.status || item.outcome || "").toLowerCase();
    return ["resolved", "recovered", "success"].includes(status) || /recovered|health-verified|api-verified/.test(type);
  });
  const lastSuccessfulProbe = probe?.lastSuccessfulTimestamp || (probe?.success === true && ["healthy", "degraded"].includes(String(probe?.status).toLowerCase()) ? probe.timestamp : null);
  return {
    status: classifyProbe(probe, probeError, now),
    lastSuccessfulProbe,
    latestFailure: latestTimestamp(failures) ? new Date(latestTimestamp(failures)).toISOString() : null,
    recoveryAttempts: probe || serviceEvents.length ? failures.length : null,
    recoveryVerifiedAt: latestTimestamp(recoveries, ["recoveredAt", "resolvedAt", "timestamp"]) ? new Date(latestTimestamp(recoveries, ["recoveredAt", "resolvedAt", "timestamp"])).toISOString() : null,
    probeFreshness: classifyProbe(probe, probeError, now) === "unknown" ? "Unavailable" : "Fresh",
    telemetryAvailable: Boolean(probe || serviceEvents.length),
  };
};

export const reliabilitySummary = (incidents = []) => {
  const records = Array.isArray(incidents) ? incidents : [];
  const completed = records.filter((incident) => ["resolved", "failed"].includes(String(incident.status).toLowerCase()));
  const resolved = completed.filter((incident) => incident.status === "resolved");
  const durations = resolved.map((incident) => {
    const start = timestampValue(incident.detectedAt);
    const end = timestampValue(incident.resolvedAt);
    return start !== null && end !== null && end >= start ? end - start : null;
  }).filter((duration) => duration !== null);
  return {
    totalRecorded: records.length,
    completed: completed.length,
    recovered: resolved.length,
    successRate: completed.length ? resolved.length / completed.length : null,
    meanRecoveryMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    measuredRecoveryCount: durations.length,
  };
};
