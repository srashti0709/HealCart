import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_ENDPOINTS } from "../config/api";

/**
 * Real backend availability for the storefront.
 *
 * The store is only considered available when BOTH signals succeed:
 *   - GET /api/health returns 200 with status "healthy"
 *   - GET /api/products returns a valid product list
 *
 * The recovery monitor is used as supplementary evidence only. It can tell us
 * that a restart is in progress, but it can never mark the store as
 * recovered: that decision is always made by the health and product checks.
 */

export const AVAILABILITY_STATUS = {
  CHECKING: "checking",
  HEALTHY: "healthy",
  UNAVAILABLE: "unavailable",
  RECOVERING: "recovering",
  RECONNECTED: "reconnected",
};

const HEALTH_POLL_MS = 2000;
const HEALTHY_POLL_MS = 2000;
const HEALTH_TIMEOUT_MS = 4000;
const PRODUCTS_TIMEOUT_MS = 6000;
const RECOVERY_TIMEOUT_MS = 4000;
const RECONNECTED_DWELL_MS = 7000;

const CONTAINER_DOWN_STATES = [
  "created",
  "exited",
  "dead",
  "paused",
  "removing",
  "restarting",
];

const describeError = (error) => {
  if (!error) return "The backend could not be reached.";

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return "The backend did not respond in time.";
  }

  if (!error.response) {
    return "The backend could not be reached.";
  }

  return (
    error.response.data?.message ||
    `The backend responded with HTTP ${error.response.status}.`
  );
};

const checkHealth = async (signal) => {
  try {
    const response = await axios.get(API_ENDPOINTS.health, {
      timeout: HEALTH_TIMEOUT_MS,
      signal,
    });

    const data = response.data || {};

    if (response.status !== 200) {
      return {
        healthy: false,
        message:
          data.message || `The health check returned HTTP ${response.status}.`,
      };
    }

    if (data.status !== "healthy") {
      return {
        healthy: false,
        message: data.message || "The backend reported a degraded state.",
      };
    }

    if (data.database && data.database !== "connected") {
      return {
        healthy: false,
        message: "The backend is healthy but its database connection is not.",
      };
    }

    return { healthy: true, message: "" };
  } catch (error) {
    return { healthy: false, message: describeError(error) };
  }
};

const checkCatalog = async (signal) => {
  try {
    const response = await axios.get(API_ENDPOINTS.products, {
      timeout: PRODUCTS_TIMEOUT_MS,
      signal,
    });

    const data = response.data || {};

    if (!Array.isArray(data.products)) {
      return {
        ok: false,
        products: null,
        message: "The catalog response was not valid.",
      };
    }

    return { ok: true, products: data.products, message: "" };
  } catch (error) {
    return { ok: false, products: null, message: describeError(error) };
  }
};

/**
 * Supplementary evidence from the recovery monitor. It is only consulted while
 * the backend is unhealthy, and a monitor failure never changes the outcome.
 */
const checkRecoveryEvidence = async (signal) => {
  try {
    const response = await axios.get(API_ENDPOINTS.recovery, {
      timeout: RECOVERY_TIMEOUT_MS,
      signal,
    });

    const data = response.data || {};
    const events = Array.isArray(data.events) ? data.events : [];

    const lifecycle = events
      .filter(
        (event) => event?.type === "crash" || event?.type === "recovered"
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp || 0).getTime() -
          new Date(a.timestamp || 0).getTime()
      )[0];

    return {
      available: true,
      containerStatus: data.status || "unknown",
      containerHealth: data.health || "unknown",
      restartCount:
        typeof data.restartCount === "number" ? data.restartCount : null,
      database: data.database || "unknown",
      latestLifecycleEvent: lifecycle
        ? {
            type: lifecycle.type,
            timestamp: lifecycle.timestamp || null,
            message: lifecycle.message || "",
          }
        : null,
    };
  } catch {
    return {
      available: false,
      containerStatus: "unknown",
      containerHealth: "unknown",
      restartCount: null,
      database: "unknown",
      latestLifecycleEvent: null,
    };
  }
};

const showsRecoveryInProgress = (evidence) => {
  if (!evidence?.available) return false;

  if (CONTAINER_DOWN_STATES.includes(evidence.containerStatus)) return true;

  if (
    evidence.containerHealth === "starting" ||
    evidence.containerHealth === "unhealthy"
  ) {
    return true;
  }

  return evidence.latestLifecycleEvent?.type === "crash";
};

export default function useBackendAvailability() {
  const [status, setStatus] = useState(AVAILABILITY_STATUS.CHECKING);
  const [products, setProducts] = useState([]);
  const [catalogLoadedAt, setCatalogLoadedAt] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [verifiedAt, setVerifiedAt] = useState(null);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const [checking, setChecking] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const dwellTimerRef = useRef(null);
  const abortRef = useRef(null);
  const outageRef = useRef(false);
  const statusRef = useRef(AVAILABILITY_STATUS.CHECKING);

  const updateStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /**
   * Runs one verification cycle and returns the delay before the next one.
   * A cycle is never started while another one is still running.
   */
  const performCheck = useCallback(async () => {
    if (runningRef.current) {
      return HEALTHY_POLL_MS;
    }

    runningRef.current = true;
    setChecking(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let catalog = null;
    let health;
    let evidence = null;

    try {
      health = await checkHealth(controller.signal);

      if (health.healthy) {
        catalog = await checkCatalog(controller.signal);
      }

      if (!health.healthy || !catalog?.ok) {
        evidence = await checkRecoveryEvidence(controller.signal);
      }
    } catch (checkError) {
      health = { healthy: false, message: describeError(checkError) };
      evidence = await checkRecoveryEvidence(controller.signal);
    } finally {
      runningRef.current = false;
      abortRef.current = null;

      if (mountedRef.current) {
        setChecking(false);
      }
    }

    /**
     * A cancelled request is not evidence of an outage. Cancellation happens
     * when the provider unmounts or when a manual refresh restarts the cycle,
     * so the state must not be changed in that case.
     */
    if (controller.signal.aborted || !mountedRef.current) {
      return HEALTHY_POLL_MS;
    }

    const catalogVerified = Boolean(health.healthy && catalog?.ok);

    if (catalogVerified) {
      setProducts(catalog.products);
      setCatalogLoadedAt(new Date().toISOString());
      setError("");
      setRecovery(null);
      setLastCheckedAt(new Date().toISOString());

      const wasOutage = outageRef.current;
      outageRef.current = false;

      if (wasOutage) {
        setVerifiedAt(new Date().toISOString());
        updateStatus(AVAILABILITY_STATUS.RECONNECTED);

        if (dwellTimerRef.current) {
          window.clearTimeout(dwellTimerRef.current);
        }

        dwellTimerRef.current = window.setTimeout(() => {
          dwellTimerRef.current = null;

          if (mountedRef.current) {
            updateStatus(AVAILABILITY_STATUS.HEALTHY);
          }
        }, RECONNECTED_DWELL_MS);

        return HEALTHY_POLL_MS;
      }

      /**
       * The "back online and verified" confirmation stays visible for its
       * whole dwell time, even when later cycles already succeed.
       */
      if (statusRef.current === AVAILABILITY_STATUS.RECONNECTED) {
        return HEALTHY_POLL_MS;
      }

      updateStatus(AVAILABILITY_STATUS.HEALTHY);

      return HEALTHY_POLL_MS;
    }

    outageRef.current = true;
    setError(
      health.healthy
        ? catalog?.message || "The product catalog could not be loaded."
        : health.message
    );
    setRecovery(evidence);
    setLastCheckedAt(new Date().toISOString());
    updateStatus(
      showsRecoveryInProgress(evidence)
        ? AVAILABILITY_STATUS.RECOVERING
        : AVAILABILITY_STATUS.UNAVAILABLE
    );

    return HEALTH_POLL_MS;
  }, [updateStatus]);

  useEffect(() => {
    mountedRef.current = true;

    let cancelled = false;
    let timer = null;

    const loop = async () => {
      if (cancelled) return;

      const delay = await performCheck();

      if (cancelled) return;

      timer = window.setTimeout(loop, delay);
    };

    timer = window.setTimeout(loop, 0);

    return () => {
      cancelled = true;
      mountedRef.current = false;

      if (timer) {
        window.clearTimeout(timer);
      }

      if (dwellTimerRef.current) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [performCheck, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  const isAvailable = status === AVAILABILITY_STATUS.HEALTHY;
  const isDisrupted =
    status === AVAILABILITY_STATUS.UNAVAILABLE ||
    status === AVAILABILITY_STATUS.RECOVERING;

  return {
    status,
    isAvailable,
    isDisrupted,
    products,
    catalogLoadedAt,
    lastCheckedAt,
    verifiedAt,
    error,
    recovery,
    checking,
    refresh,
  };
}
