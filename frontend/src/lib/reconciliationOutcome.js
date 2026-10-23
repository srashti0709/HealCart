/**
 * Pure helper for deriving a customer-safe reconciliation outcome from the
 * actual `POST /api/payments/reconcile` response.
 *
 * HTTP success alone is never interpreted as proof that a payment was
 * captured. The outcome is derived from the resolved counts returned by the
 * reconciliation service, which only counts attempts it could prove were paid
 * or failed.
 */

export const RECONCILIATION_OUTCOME = {
  SUCCESS: "success",
  UNRESOLVED: "unresolved",
  ERROR: "error",
};

/**
 * Derives a reconciliation outcome from the controller response.
 *
 * Returns { outcome, message, examined, resolvedPaid, resolvedFailed,
 * unresolved, note } where `note` explains what the result means without
 * overstating it.
 */
export const deriveReconciliationOutcome = (response = {}) => {
  const success = Boolean(response.success);
  const examined = Number(response.examined || 0);
  const resolvedPaid = Number(response.resolvedPaid || 0);
  const resolvedFailed = Number(response.resolvedFailed || 0);
  const unresolved = Number(response.unresolved || 0);

  if (!success) {
    return {
      outcome: RECONCILIATION_OUTCOME.ERROR,
      message: response.message || "Payment reconciliation could not be completed.",
      examined,
      resolvedPaid: 0,
      resolvedFailed: 0,
      unresolved: 0,
      note: "The reconciliation request did not succeed. No attempts were modified by this call.",
    };
  }

  if (examined === 0) {
    return {
      outcome: RECONCILIATION_OUTCOME.UNRESOLVED,
      message: response.message || "No payment attempt needed reconciliation.",
      examined: 0,
      resolvedPaid: 0,
      resolvedFailed: 0,
      unresolved: 0,
      note: "There were no pending or unknown payment attempts to reconcile.",
    };
  }

  const baseMessage = response.message || `Examined ${examined} payment attempt(s).`;

  if (resolvedPaid > 0) {
    return {
      outcome: RECONCILIATION_OUTCOME.SUCCESS,
      message: baseMessage,
      examined,
      resolvedPaid,
      resolvedFailed,
      unresolved,
      note:
        "Durable payment transactions were verified as paid; matching orders were finalized and stock was deducted. HTTP success reflects the reconciliation run, not an individual payment capture.",
    };
  }

  if (resolvedFailed > 0) {
    return {
      outcome: RECONCILIATION_OUTCOME.SUCCESS,
      message: baseMessage,
      examined,
      resolvedPaid: 0,
      resolvedFailed,
      unresolved,
      note:
        "Failed payments were confirmed; affected orders were cancelled and no stock was deducted. HTTP success reflects the reconciliation run, not an individual payment capture.",
    };
  }

  // HTTP success but nothing was resolved: attempts remain uncertain.
  return {
    outcome: RECONCILIATION_OUTCOME.UNRESOLVED,
    message: baseMessage,
    examined,
    resolvedPaid: 0,
    resolvedFailed: 0,
    unresolved,
    note:
      "No conclusive transaction was found, so attempts remain unresolved rather than being falsely marked paid or failed.",
  };
};
