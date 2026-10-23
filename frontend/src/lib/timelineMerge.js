/**
 * Pure helpers for merging recovery-monitor events with backend incidents into
 * a single deduplicated timeline feed. No secrets or stack traces are
 * included; only incident metadata already stored by the backend.
 */

const getSourceLabel = (event) => {
  if (!event) return "Unknown source";

  const source =
    event.source ||
    event.evidenceSource ||
    event.origin ||
    event.runSource ||
    "Unknown source";
  if (typeof source === "string") {
    return source
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return "Unknown source";
};

const getDescription = (event) =>
  event?.description || event?.message || "No description available.";

/**
 * Maps a backend incident record into a timeline event shape so payment and
 * reconciliation incidents can be rendered alongside recovery-monitor events.
 */
export const incidentToTimelineEvent = (incident) => {
  if (!incident || typeof incident !== "object") return null;

  let outcome = "unverified";

  if (incident.status) {
    const status = String(incident.status).toLowerCase();
    if (status === "resolved") outcome = "success";
    else if (status === "failed") outcome = "failure";
    else if (status === "detected" || status === "recovering") {
      outcome = "in_progress";
    }
  }

  const details = [];
  if (incident.recoveryAction) {
    details.push(`Recovery action: ${incident.recoveryAction}`);
  }
  if (incident.recoveryResult) {
    details.push(`Result: ${incident.recoveryResult}`);
  }
  if (incident.severity) {
    details.push(`Severity: ${incident.severity}`);
  }

  return {
    id:
      incident.id ||
      incident._id ||
      `incident-${incident.incidentType}-${incident.detectedAt}`,
    type: incident.incidentType || "incident",
    description: incident.message || "No description available.",
    message: incident.message,
    timestamp: incident.detectedAt || null,
    source: incident.service || "Backend",
    outcome,
    details: details.length > 0 ? details.join(" | ") : null,
    isIncident: true,
  };
};

/**
 * Merges recovery-monitor events with backend incidents into a single
 * deduplicated timeline feed ordered newest first.
 *
 * Dedupes by type + timestamp so the same observed event is not shown twice
 * when reported by more than one source.
 */
export const combineTimelineEvents = (events = [], incidents = []) => {
  const normalized = [];

  for (const event of events) {
    if (event && typeof event === "object") {
      normalized.push({ ...event, isIncident: false });
    }
  }

  for (const incident of incidents) {
    const converted = incidentToTimelineEvent(incident);
    if (converted) {
      normalized.push(converted);
    }
  }

  const unique = new Map();
  for (const event of normalized) {
    const key = `${String(event.type || "")}|${String(event.timestamp || "")}`;
    if (!unique.has(key)) {
      unique.set(key, event);
    }
  }

  return Array.from(unique.values()).sort(
    (a, b) =>
      new Date(b.timestamp || 0).getTime() -
      new Date(a.timestamp || 0).getTime()
  );
};

export { getSourceLabel, getDescription };
