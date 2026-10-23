const MAX_DURATION_MS = 60_000;
let experiment = null;
let lastExperiment = null;
let expiryTimer = null;

const getExperiment = (now = Date.now()) => {
  if (experiment && experiment.expiresAt <= now) stopExperiment("expired", now);
  return experiment ? { ...experiment } : (lastExperiment ? { ...lastExperiment } : { active: false });
};

const startExperiment = ({ durationMs = MAX_DURATION_MS, now = Date.now() } = {}) => {
  const current = getExperiment(now);
  if (current.active) return { ...current, alreadyActive: true };
  lastExperiment = null;
  const boundedDuration = Math.min(Math.max(Number(durationMs) || MAX_DURATION_MS, 1000), MAX_DURATION_MS);
  experiment = {
    active: true,
    scenario: "payment-response-loss",
    startedAt: new Date(now).toISOString(),
    expiresAt: now + boundedDuration,
    durationMs: boundedDuration,
    outcome: "running",
  };
  expiryTimer = setTimeout(() => stopExperiment("expired"), boundedDuration);
  expiryTimer.unref?.();
  return getExperiment(now);
};

const stopExperiment = (outcome = "stopped", now = Date.now()) => {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  if (!experiment) return lastExperiment ? { ...lastExperiment } : { active: false };
  const previous = experiment;
  experiment = null;
  lastExperiment = { ...previous, active: false, outcome, stoppedAt: new Date(now).toISOString() };
  return { ...lastExperiment };
};

module.exports = { MAX_DURATION_MS, getExperiment, startExperiment, stopExperiment };
