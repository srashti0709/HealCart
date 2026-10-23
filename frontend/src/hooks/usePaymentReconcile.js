import { useCallback, useRef, useState } from "react";
import { API_ENDPOINTS } from "../config/api";
import {
  deriveReconciliationOutcome,
} from "../lib/reconciliationOutcome";

/**
 * Administrative payment reconciliation request.
 *
 * The request is proxied through the chaos controller, which holds the
 * administrative token server-side (CHAOS_TEST_TOKEN). The frontend never
 * receives, stores or displays the token.
 *
 * Reconciliation only examines existing payment attempts. It never submits a
 * checkout, never starts a payment and never creates a second order. HTTP
 * success alone is not treated as proof that a payment was captured; the
 * outcome is derived from the resolved counts returned by the service.
 */

export default function usePaymentReconcile() {
  const runningRef = useRef(false);

  const [reconcileRunning, setReconcileRunning] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [reconcileError, setReconcileError] = useState("");

  const runReconciliation = useCallback(async () => {
    if (runningRef.current) return;

    runningRef.current = true;

    setReconcileRunning(true);
    setReconcileResult(null);
    setReconcileError("");

    try {
      const response = await fetch(API_ENDPOINTS.paymentReconcile, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const payload = await response.json().catch(() => ({}));
      const outcome = deriveReconciliationOutcome(payload);

      setReconcileResult({
        ...outcome,
        ok: response.ok,
        status: response.status,
      });

      if (!response.ok) {
        throw new Error(outcome.message || payload.message || "Payment reconciliation failed.");
      }
    } catch (error) {
      setReconcileError(error.message || "Payment reconciliation could not be completed.");
    } finally {
      runningRef.current = false;
      setReconcileRunning(false);
    }
  }, []);

  return {
    reconcileRunning,
    reconcileResult,
    reconcileError,
    runReconciliation,
  };
}
