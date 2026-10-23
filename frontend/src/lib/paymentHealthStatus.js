/**
 * Pure helpers for deriving the payment-service health state shown on the
 * dashboard.
 *
 * Every value is derived from real health-check responses or explicit error
 * data. Recovery counts and timestamps are only reported when they come from
 * observed telemetry; otherwise the state is reported as unavailable rather
 * than invented.
 */

export const PAYMENT_HEALTH_STATE = {
  CHECKING: "Checking",
  HEALTHY: "Healthy",
  RECOVERING: "Recovering",
  UNAVAILABLE: "Unavailable",
};

/**
 * Derives the payment-service badge state.
 *
 * - Recovering while a payment-service recovery experiment is in flight.
 * - Unavailable when the last health check failed or the service could not be
 *   reached.
 * - Checking before the first check completes.
 * - Healthy when the service reports a healthy status.
 * - Unavailable for any other non-healthy answer.
 */
export const derivePaymentHealthState = ({
  paymentHealth,
  paymentHealthError,
  paymentRunning = false,
} = {}) => {
  if (paymentRunning) {
    return PAYMENT_HEALTH_STATE.RECOVERING;
  }

  // A failed health check means the service was reached (or attempted) and is
  // not healthy, so it is unavailable rather than still checking.
  if (paymentHealthError) {
    return PAYMENT_HEALTH_STATE.UNAVAILABLE;
  }

  if (!paymentHealth) {
    return PAYMENT_HEALTH_STATE.CHECKING;
  }

  if (paymentHealth.status === "healthy") {
    return PAYMENT_HEALTH_STATE.HEALTHY;
  }

  return PAYMENT_HEALTH_STATE.UNAVAILABLE;
};

/**
 * Builds the detail line shown under the Payment Service card.
 *
 * recoveryAttempts and recoveryVerifiedAt are only included when they are
 * backed by observed telemetry (a completed recovery experiment). Otherwise
 * they are reported as not tracked.
 */
export const buildPaymentHealthDetail = ({
  paymentHealth,
  paymentHealthError,
  paymentLastSuccessfulCheck,
  paymentLastFailure,
  paymentRecoveryAttempts,
  paymentRecoveryVerifiedAt,
} = {}) => {
  const lines = [];

  if (paymentHealthError) {
    lines.push(`Last check failed: ${paymentHealthError}.`);
  } else if (paymentLastSuccessfulCheck) {
    lines.push(`Last successful check: ${paymentLastSuccessfulCheck}.`);
  } else if (!paymentHealth) {
    lines.push("Waiting for first health check.");
  } else {
    lines.push(`Last successful check: ${paymentLastSuccessfulCheck || "Not recorded"}.`);
  }

  if (paymentLastFailure) {
    lines.push(`Latest observed failure: ${paymentLastFailure}.`);
  }

  if (paymentRecoveryAttempts !== undefined && paymentRecoveryAttempts !== null) {
    lines.push(
      `Recovery attempts: ${paymentRecoveryAttempts}.`
    );
  } else {
    lines.push("Recovery attempts: Not tracked by telemetry.");
  }

  if (paymentRecoveryVerifiedAt) {
    lines.push(`Latest verified recovery: ${paymentRecoveryVerifiedAt}.`);
  } else if (paymentRecoveryAttempts !== undefined && paymentRecoveryAttempts !== null) {
    lines.push("Latest verified recovery: Not recorded.");
  } else {
    lines.push("Latest verified recovery: Not tracked by telemetry.");
  }

  return lines.join(" ");
};
