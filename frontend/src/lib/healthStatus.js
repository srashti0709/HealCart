/**
 * Dashboard health status helpers.
 *
 * The backend health endpoint answers with HTTP 503 and a body such as
 * {"success":false,"service":"backend","status":"degraded","database":"disconnected"}
 * when MongoDB is not connected. That body carries usable detail, so it is
 * kept and reported instead of being reduced to a generic failure.
 */

/**
 * Derives the backend and database status shown in the Service Health cards.
 *
 * - "Unavailable" is only used when the backend could not be reached at all.
 * - "Unknown" is only used when the information is genuinely missing.
 * - MongoDB is never reported as connected without a successful response.
 */
export function getBackendHealthStatuses({ health, healthError } = {}) {
  const hasHealth = Boolean(health);

  const backendStatus = !hasHealth
    ? healthError
      ? "Unavailable"
      : "Checking"
    : health.status === "healthy"
      ? "Healthy"
      : "Degraded";

  const databaseStatus = !hasHealth
    ? healthError
      ? "Unknown"
      : "Checking"
    : health.database === "connected"
      ? "Connected"
      : health.database === "disconnected"
        ? "Disconnected"
        : "Unknown";

  return { backendStatus, databaseStatus };
}

/**
 * Describes how fresh the incident figures behind the Recovery Analytics are.
 *
 * The figures are never cleared when the backend is unreachable, so they are
 * reported as stale together with the time of the last successful load.
 */
export function getIncidentsFreshness({
  incidents,
  incidentsError,
  updatedAt,
} = {}) {
  const count = Array.isArray(incidents) ? incidents.length : 0;
  const stale = Boolean(incidentsError) && count > 0;

  return { stale, updatedAt: updatedAt || null, hasFigures: count > 0 };
}
