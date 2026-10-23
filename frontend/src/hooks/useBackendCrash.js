import { useCallback, useEffect, useRef, useState } from "react";
import { API_ENDPOINTS } from "../config/api";

/**
 * Backend crash request with optional synthetic traffic coordination.
 *
 * The crash request itself is unchanged. When coordination is enabled the
 * controller receives a traffic payload and runs the real traffic around the
 * crash. When it is disabled the original request is sent unchanged.
 */

const DEFAULT_LIMITS = {
  ratePerSecond: { min: 1, max: 20, default: 3 },
  concurrency: { min: 1, max: 8, default: 2 },
};

export default function useBackendCrash() {
  const runningRef = useRef(false);

  const [coordinationEnabled, setCoordinationEnabled] = useState(true);
  const [trafficRate, setTrafficRateValue] = useState(
    DEFAULT_LIMITS.ratePerSecond.default
  );
  const [trafficConcurrency, setTrafficConcurrencyValue] = useState(
    DEFAULT_LIMITS.concurrency.default
  );
  const [limits, setLimits] = useState(DEFAULT_LIMITS);

  const [chaosRunning, setChaosRunning] = useState(false);
  const [chaosResult, setChaosResult] = useState("");
  const [chaosError, setChaosError] = useState("");
  const [chaosResponse, setChaosResponse] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.trafficEndpoints);
        const data = await response.json();

        if (cancelled || !data?.limits) return;

        setLimits({
          ratePerSecond: {
            ...DEFAULT_LIMITS.ratePerSecond,
            ...(data.limits.ratePerSecond || {}),
          },
          concurrency: {
            ...DEFAULT_LIMITS.concurrency,
            ...(data.limits.concurrency || {}),
          },
        });
      } catch {
        // The controller stays the authority for the real limits. The built in
        // defaults are used until it answers.
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const setTrafficRate = useCallback((value) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) return;

    setTrafficRateValue(parsed);
  }, []);

  const setTrafficConcurrency = useCallback((value) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) return;

    setTrafficConcurrencyValue(parsed);
  }, []);

  const runBackendCrash = useCallback(async () => {
    if (runningRef.current) return;

    runningRef.current = true;

    setChaosRunning(true);
    setChaosResult("");
    setChaosError("");
    setChaosResponse(null);

    try {
      const options = { method: "POST" };

      if (coordinationEnabled) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({
          traffic: {
            enabled: true,
            ratePerSecond: trafficRate,
            concurrency: trafficConcurrency,
          },
        });
      }

      const response = await fetch(
        API_ENDPOINTS.chaosBackendCrash,
        options
      );

      const data = await response.json().catch(() => ({}));

      setChaosResponse({ status: response.status, body: data });

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Recovery test failed.");
      }

      setChaosResult(data.message || "Backend recovered successfully.");
    } catch (error) {
      setChaosError(error.message || "Could not run the recovery test.");
    } finally {
      runningRef.current = false;
      setChaosRunning(false);
    }
  }, [coordinationEnabled, trafficConcurrency, trafficRate]);

  return {
    chaosRunning,
    chaosResult,
    chaosError,
    chaosResponse,
    coordinationEnabled,
    setCoordinationEnabled,
    trafficRate,
    setTrafficRate,
    trafficConcurrency,
    setTrafficConcurrency,
    trafficLimits: limits,
    runBackendCrash,
  };
}
