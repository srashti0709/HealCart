
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  API_BASE_URL,
  API_ENDPOINTS,
  CHAOS_CONTROLLER_URL,
  PAYMENT_SERVICE_URL,
  RECOVERY_MONITOR_URL,
} from "../config/api";
import ServiceDependencyMap from "../components/ServiceDependencyMap";
import IncidentTimeline from "../components/IncidentTimeline";
import SyntheticTrafficPanel from "../components/SyntheticTrafficPanel";
import {
  BackendCrashCoordinationControls,
  BackendCrashTrafficResult,
} from "../components/BackendCrashCoordination";
import useBackendCrash from "../hooks/useBackendCrash";
import {
  getBackendHealthStatuses,
  getIncidentsFreshness,
} from "../lib/healthStatus";
import {
  derivePaymentHealthState,
  buildPaymentHealthDetail,
} from "../lib/paymentHealthStatus";
import usePaymentReconcile from "../hooks/usePaymentReconcile";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Server,
  Workflow,
} from "lucide-react";

function Dashboard() {
  const [dbCheckRunning, setDbCheckRunning] = useState(false);
  const [dbCheckResult, setDbCheckResult] = useState("");
  const [dbCheckError, setDbCheckError] = useState("");
  const [dbCheckStages, setDbCheckStages] = useState([]);
  const [dbRecoveryDuration, setDbRecoveryDuration] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [lastChecked, setLastChecked] = useState(null);
  const [checking, setChecking] = useState(false);

  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [paymentHealth, setPaymentHealth] = useState(null);
  const [paymentHealthError, setPaymentHealthError] = useState("");
  const [paymentLastSuccessfulCheck, setPaymentLastSuccessfulCheck] = useState(null);
  const [paymentLastFailure, setPaymentLastFailure] = useState(null);
  const [paymentRecoveryAttempts, setPaymentRecoveryAttempts] = useState(null);
  const [paymentRecoveryVerifiedAt, setPaymentRecoveryVerifiedAt] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [incidentsError, setIncidentsError] = useState("");
  const [incidentsUpdatedAt, setIncidentsUpdatedAt] = useState(null);

  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [experimentHistory, setExperimentHistory] = useState([]);
  const [experimentStatusError, setExperimentStatusError] = useState("");
  const [paymentRunning, setPaymentRunning] = useState(false);
  const [paymentResult, setPaymentResult] = useState("");
  const [paymentError, setPaymentError] = useState("");

  const [paymentResponseLostRunning, setPaymentResponseLostRunning] = useState(false);
  const [paymentResponseLostResult, setPaymentResponseLostResult] = useState(null);
  const [paymentResponseLostError, setPaymentResponseLostError] = useState("");
  const [paymentResponseLostStages, setPaymentResponseLostStages] = useState([]);
  const [paymentResponseLostAttemptId, setPaymentResponseLostAttemptId] = useState("");
  const [paymentResponseLostOrderId, setPaymentResponseLostOrderId] = useState("");
  const [paymentResponseLostTransactionId, setPaymentResponseLostTransactionId] = useState("");
  const [paymentResponseLostBeforeOrderCount, setPaymentResponseLostBeforeOrderCount] = useState(null);
  const [paymentResponseLostBeforeStock, setPaymentResponseLostBeforeStock] = useState(null);
  const [paymentResponseLostAfterOrderCount, setPaymentResponseLostAfterOrderCount] = useState(null);
  const [paymentResponseLostAfterStock, setPaymentResponseLostAfterStock] = useState(null);
  const [paymentResponseLostRefreshing, setPaymentResponseLostRefreshing] = useState(false);

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [inventoryRunning, setInventoryRunning] = useState(false);
  const [inventoryResult, setInventoryResult] = useState(null);
  const [inventoryError, setInventoryError] = useState("");
  const [runAllRunning, setRunAllRunning] = useState(false);
  const [runAllResults, setRunAllResults] = useState([]);
  const [runAllError, setRunAllError] = useState("");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineStale, setTimelineStale] = useState(false);
  const [timelineLastUpdated, setTimelineLastUpdated] = useState(null);
  const experimentLockRef = useRef(false);
  const recoveryLoadedRef = useRef(false);
  const [paymentChaosLoading, setPaymentChaosLoading] = useState(false);
  const [paymentChaosMessage, setPaymentChaosMessage] = useState("");
  const [paymentRecovery, setPaymentRecovery] = useState({
    running: false,
    startedAt: null,
    resolvedAt: null,
    status: "idle",
    message: "",
    stages: [],
  });

  const {
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
    trafficLimits,
    runBackendCrash: triggerBackendCrash,
  } = useBackendCrash();

  const {
    reconcileRunning,
    reconcileResult,
    reconcileError,
    runReconciliation,
  } = usePaymentReconcile();

  const runBackendCrash = async () => {
    if (experimentLockRef.current) return;

    experimentLockRef.current = true;

    try {
      await triggerBackendCrash();
    } finally {
      experimentLockRef.current = false;
    }
  };

  const runDatabaseCheck = async () => {
    if (dbCheckRunning || chaosRunning) return;

    setDbCheckRunning(true);
    setDbCheckResult("");
    setDbCheckError("");
    setDbCheckStages([]);
    setDbRecoveryDuration(null);

    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/database-recovery`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Database check failed.");
      }

      setDbCheckResult(data.message);
      setDbRecoveryDuration(null);
    } catch (error) {
      setDbCheckError(error.message || "Database check failed.");
    } finally {
      setDbCheckRunning(false);
    }
  };


  const injectPaymentChaos = async () => {
    setPaymentChaosLoading(true);
    setPaymentChaosMessage("");
    setPaymentRecovery({
      running: true,
      startedAt: Date.now(),
      resolvedAt: null,
      status: "verifying",
      message: "Payment chaos armed. Waiting for a checkout to trigger self-heal...",
      stages: [
        { t: Date.now(), status: "armed", message: "Payment chaos armed for the next checkout." },
      ],
    });

    try {
      const response = await fetch(API_ENDPOINTS.paymentTimeout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not activate Payment Chaos.");
      }

      setPaymentChaosMessage(
        "Payment Chaos armed. The next checkout should simulate a lost payment response."
      );

      setPaymentRecovery((prev) => ({
        ...prev,
        stages: [
          ...prev.stages,
          { t: Date.now(), status: "verifying", message: "Chaos armed. Awaiting checkout payment to self-heal." },
        ],
      }));
    } catch (error) {
      setPaymentChaosMessage(error.message);
      setPaymentRecovery((prev) => ({
        ...prev,
        running: false,
        status: "idle",
        message: error.message || "Could not activate Payment Chaos.",
        stages: [
          ...prev.stages,
          { t: Date.now(), status: "error", message: error.message || "Could not activate Payment Chaos." },
        ],
      }));
    } finally {
      setPaymentChaosLoading(false);
    }
  };

  const runDatabaseRecovery = async () => {

    if (experimentLockRef.current) return;

    experimentLockRef.current = true;

    setDbCheckRunning(true);
    setDbCheckResult("");
    setDbCheckError("");
    setDbCheckStages([]);
    setDbRecoveryDuration(null);

    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/database-recovery`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Database recovery failed.");
      }

      setDbCheckResult(data.message || "Database recovered successfully.");
      setDbCheckStages(Array.isArray(data.stages) ? data.stages : []);
      setDbRecoveryDuration(data.durationMs ?? null);
    } catch (error) {
      setDbCheckError(error.message || "Database recovery failed.");
    } finally {
      experimentLockRef.current = false;
      setDbCheckRunning(false);
    }
  };

  const runPaymentRecovery = async () => {
    if (experimentLockRef.current) return;

    experimentLockRef.current = true;

    setPaymentRunning(true);
    setPaymentResult("");
    setPaymentError("");

    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/payment-service-recovery`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Payment recovery failed.");
      }

      setPaymentResult(data.message);
      setPaymentRecoveryAttempts((previous) => (previous === null ? 1 : previous + 1));
      setPaymentRecoveryVerifiedAt(new Date().toISOString());
      await checkExperimentStatus();
    } catch (error) {
      setPaymentError(error.message || "Payment recovery failed.");
      await checkExperimentStatus();
    } finally {
      experimentLockRef.current = false;
      setPaymentRunning(false);
    }
  };

  const captureBeforeState = async () => {
    setPaymentResponseLostError("");
    setPaymentResponseLostResult(null);
    setPaymentResponseLostStages([]);
    setPaymentResponseLostBeforeOrderCount(null);
    setPaymentResponseLostBeforeStock(null);
    setPaymentResponseLostAfterOrderCount(null);
    setPaymentResponseLostAfterStock(null);
    setPaymentResponseLostAttemptId("");
    setPaymentResponseLostOrderId("");
    setPaymentResponseLostTransactionId("");

    try {
      const ordersResponse = await fetch(`${API_BASE_URL}/api/orders`);
      const ordersData = await ordersResponse.json();

      const productsResponse = await fetch(`${API_BASE_URL}/api/products`);
      const productsData = await productsResponse.json();

      const gamingMouse = (productsData.products || []).find(
        (p) => p.name === "Wireless Gaming Mouse"
      );

      setPaymentResponseLostBeforeOrderCount(
        Array.isArray(ordersData.orders) ? ordersData.orders.length : 0
      );
      setPaymentResponseLostBeforeStock(gamingMouse ? gamingMouse.stock : null);

      setPaymentResponseLostStages([
        {
          stage: "before-state",
          status: "passed",
          timestamp: new Date().toISOString(),
          message: `Before state captured: ${ordersData.orders?.length ?? 0} orders, Gaming Mouse stock ${gamingMouse?.stock ?? "unknown"}`,
        },
      ]);
    } catch (error) {
      setPaymentResponseLostError(
        error.message || "Failed to capture before state."
      );
    }
  };

  const captureAfterState = async () => {
    try {
      const ordersResponse = await fetch(`${API_BASE_URL}/api/orders`);
      const ordersData = await ordersResponse.json();

      const productsResponse = await fetch(`${API_BASE_URL}/api/products`);
      const productsData = await productsResponse.json();

      const gamingMouse = (productsData.products || []).find(
        (p) => p.name === "Wireless Gaming Mouse"
      );

      setPaymentResponseLostAfterOrderCount(
        Array.isArray(ordersData.orders) ? ordersData.orders.length : 0
      );
      setPaymentResponseLostAfterStock(gamingMouse ? gamingMouse.stock : null);

      setPaymentResponseLostStages((previous) => [
        ...previous,
        {
          stage: "after-state",
          status: "passed",
          timestamp: new Date().toISOString(),
          message: `After state captured: ${ordersData.orders?.length ?? 0} orders, Gaming Mouse stock ${gamingMouse?.stock ?? "unknown"}`,
        },
      ]);

      // Read-only correlation: find the latest uncertain/paid order and read
      // its attempt status to populate the attempt, order and transaction IDs.
      // This never creates an order, never starts a payment and never changes
      // stock or the ledger.
      await refreshAttemptStatus();
    } catch (error) {
      setPaymentResponseLostError(
        error.message || "Failed to capture after state."
      );
    }
  };

  const refreshAttemptStatus = async () => {
    setPaymentResponseLostError("");
    setPaymentResponseLostRefreshing(true);

    try {
      const ordersResponse = await fetch(`${API_BASE_URL}/api/orders`);
      const ordersData = await ordersResponse.json();

      if (!Array.isArray(ordersData.orders) || ordersData.orders.length === 0) {
        setPaymentResponseLostError("No orders found to correlate.");
        return;
      }

      // The attempt id equals the order id, so the order id doubles as the
      // attempt id for the payment attempt lookup.
      const latestUncertain = ordersData.orders.find(
        (o) =>
          o.paymentStatus === "unknown" ||
          o.paymentStatus === "paid" ||
          o.paymentStatus === "pending"
      );

      if (!latestUncertain) {
        setPaymentResponseLostError(
          "No uncertain or paid payment attempt found to correlate."
        );
        return;
      }

      const attemptId = String(latestUncertain._id);
      const checkoutId = String(latestUncertain.checkoutId || "");

      setPaymentResponseLostOrderId(attemptId);
      setPaymentResponseLostAttemptId(attemptId);

      if (!checkoutId) {
        setPaymentResponseLostError(
          "The latest order has no checkout id, so the attempt status cannot be read."
        );
        return;
      }

      const attemptResponse = await fetch(
        API_ENDPOINTS.paymentAttemptStatus(attemptId),
        {
          headers: { "x-checkout-id": checkoutId },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!attemptResponse.ok) {
        setPaymentResponseLostError(
          `Attempt status returned HTTP ${attemptResponse.status}.`
        );
        return;
      }

      const attemptData = await attemptResponse.json();

      if (!attemptData || !attemptData.success) {
        setPaymentResponseLostError(
          attemptData?.message || "Failed to read attempt status."
        );
        return;
      }

      const attempt = attemptData.attempt || {};
      if (attempt.transactionId) {
        setPaymentResponseLostTransactionId(attempt.transactionId);
      }

      const order = attemptData.order || {};

      const details = [];
      details.push(
        `Attempt ${attemptId} status: ${attempt.status || "unknown"}.`
      );
      if (order.paymentStatus) {
        details.push(`Order payment status: ${order.paymentStatus}.`);
      }
      if (attempt.transactionId) {
        details.push(`Transaction ID: ${attempt.transactionId}.`);
      }

      const passed =
        attempt.status === "paid" ||
        attemptData.status === "paid" ||
        order.paymentStatus === "paid";

      setPaymentResponseLostResult({
        passed,
        message:
          details.length > 0
            ? details.join(" ")
            : "Attempt status read successfully.",
        details,
      });
    } catch (error) {
      setPaymentResponseLostError(
        error.message || "Failed to refresh attempt status."
      );
    } finally {
      setPaymentResponseLostRefreshing(false);
    }
  };

  const runPaymentResponseLost = async () => {
    if (experimentLockRef.current) return;

    experimentLockRef.current = true;

    setPaymentResponseLostRunning(true);
    setPaymentResponseLostResult(null);
    setPaymentResponseLostError("");
    setPaymentResponseLostStages([]);

    try {
      setPaymentResponseLostStages((previous) => [
        ...previous,
        {
          stage: "prepare",
          status: "pending",
          timestamp: new Date().toISOString(),
          message: "Ensure SIMULATE_PAYMENT_TIMEOUT=true is set in payment-service/.env and the payment-service container is restarted.",
        },
      ]);

      setPaymentResponseLostStages((previous) => [
        ...previous,
        {
          stage: "checkout",
          status: "pending",
          timestamp: new Date().toISOString(),
          message: "Create a checkout through the normal checkout flow. The payment response will be lost (simulated timeout), but the transaction is durably recorded.",
        },
      ]);

      setPaymentResponseLostStages((previous) => [
        ...previous,
        {
          stage: "reconcile",
          status: "pending",
          timestamp: new Date().toISOString(),
          message: "Run reconciliation to resolve the uncertain attempt from the durable ledger.",
        },
      ]);

      setPaymentResponseLostStages((previous) => [
        ...previous,
        {
          stage: "verify",
          status: "pending",
          timestamp: new Date().toISOString(),
          message: "Verify the same transaction was recovered — not charged again — and stock was deducted exactly once.",
        },
      ]);

      // Capture before state automatically at the start of the experiment.
      await captureBeforeState();

      setPaymentResponseLostStages((previous) =>
        previous.map((s) =>
          s.stage === "prepare"
            ? { ...s, status: "passed", message: s.message + " (user action required)" }
            : s
        )
      );

      setPaymentResponseLostStages((previous) =>
        previous.map((s) =>
          s.stage === "checkout"
            ? {
              ...s,
              status: "pending",
              message:
                s.message +
                " Enter the Attempt ID and Order ID below after creating the checkout.",
            }
            : s
        )
      );

      await checkExperimentStatus();
    } catch (error) {
      setPaymentResponseLostError(error.message || "Experiment setup failed.");
    } finally {
      experimentLockRef.current = false;
      setPaymentResponseLostRunning(false);
    }
  };
  const runInventoryAudit = async () => {
    if (experimentLockRef.current) return;

    experimentLockRef.current = true;

    setInventoryRunning(true);
    setInventoryResult(null);
    setInventoryError("");

    try {
      const response = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/inventory-integrity`,
        { method: "POST" }
      );

      const data = await response.json();

      setInventoryResult(data);

      if (
        !response.ok ||
        !data.success ||
        data.recovered !== true
      ) {
        throw new Error(data.message || "Inventory audit found issues or failed.");
      }

      setInventoryError("");
      await checkExperimentStatus();
    } catch (error) {
      setInventoryError(error.message || "Inventory audit failed.");
      await checkExperimentStatus();
    } finally {
      experimentLockRef.current = false;
      setInventoryRunning(false);
    }
  };

  const fetchAdminOrders = async () => {
    setOrdersLoading(true);
    setOrdersError("");
    setOrdersRefreshing(true);

    try {
      const response = await axios.get(API_ENDPOINTS.orders, {
        timeout: 10000,
        validateStatus: (status) => status === 200,
      });

      const data = response.data || {};
      const fetchedOrders = Array.isArray(data) ? data : data.orders || [];

      setOrders(fetchedOrders);
      setOrdersError("");
    } catch (error) {
      setOrdersError(
        error.response?.data?.message ||
        error.message ||
        "Unable to load orders."
      );
    } finally {
      setOrdersLoading(false);
      setOrdersRefreshing(false);
    }
  };

  const runAllScenarios = async () => {
    if (experimentLockRef.current) return;

    experimentLockRef.current = true;

    const scenarios = [
      {
        id: "backend-crash",
        name: "Backend Crash Recovery",
        url: "/api/chaos/backend-crash",
      },
      {
        id: "database-recovery",
        name: "Database Connection Recovery",
        url: "/api/chaos/database-recovery",
      },
      {
        id: "payment-service-recovery",
        name: "Payment Service Recovery",
        url: "/api/chaos/payment-service-recovery",
      },
      {
        id: "inventory-integrity",
        name: "Inventory Integrity Audit",
        url: "/api/chaos/inventory-integrity",
      },
    ];

    setRunAllRunning(true);
    setRunAllResults([]);
    setRunAllError("");

    try {
      for (const scenario of scenarios) {
        let result;

        try {
          const response = await fetch(
            `${CHAOS_CONTROLLER_URL}${scenario.url}`,
            { method: "POST" }
          );

          const data = await response.json();
          const passed =
            response.ok &&
            data.success === true &&
            data.recovered !== false;
          result = {
            id: scenario.id,
            name: scenario.name,
            status: passed ? "passed" : "failed",
            message:
              data.message ||
              (passed ? "Scenario passed." : "Scenario failed."),
            durationMs: data.durationMs ?? null,
          };
        } catch (error) {
          result = {
            id: scenario.id,
            name: scenario.name,
            status: "failed",
            message: error.message || "Request failed.",
            durationMs: null,
          };
        }

        setRunAllResults((previous) => [...previous, result]);

        try {
          await checkExperimentStatus();
        } catch {
          // The scenario result is retained even if history refresh fails.
        }
      }
    } catch (error) {
      setRunAllError(error.message || "The scenario sequence failed.");
    } finally {
      experimentLockRef.current = false;
      setRunAllRunning(false);
    }
  };



  const checkExperimentStatus = async () => {
    try {
      const historyResponse = await fetch(
        `${CHAOS_CONTROLLER_URL}/api/chaos/experiments/history`
      );

      if (!historyResponse.ok) {
        throw new Error("Unable to fetch experiment status.");
      }

      const historyData = await historyResponse.json();

      setExperimentHistory(
        Array.isArray(historyData.experiments)
          ? historyData.experiments
          : []
      );

      setExperimentStatusError("");
    } catch (error) {
      setExperimentStatusError(error.message);
    }
  };




  const checkBackendHealth = async () => {
    setChecking(true);

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/health`,
        {
          timeout: 3000,
          // A degraded backend still answers with a body that describes the
          // failure, for example HTTP 503 with database "disconnected", so the
          // response is inspected instead of being discarded.
          validateStatus: () => true,
        }
      );

      const body =
        response.data && typeof response.data === "object"
          ? response.data
          : null;

      if (response.status === 200 && body?.success === true) {
        setHealth(body);
        setHealthError("");
        return;
      }

      if (body && (body.status || body.database)) {
        // The backend answered but is not fully healthy.
        setHealth(body);
        setHealthError(
          body.database === "disconnected"
            ? "Backend API is degraded: MongoDB is not connected."
            : "Backend API is degraded."
        );
        return;
      }

      setHealth(null);
      setHealthError("Backend API is unavailable.");
    } catch {
      setHealth(null);
      setHealthError("Backend API is unavailable.");
    } finally {
      setLastChecked(new Date().toLocaleTimeString());
      setChecking(false);
    }
  };


  const checkRecoveryMonitor = async () => {
    const isFirstLoad = !recoveryLoadedRef.current;

    try {
      if (isFirstLoad) {
        setTimelineLoading(true);
      }

      const response = await axios.get(`${RECOVERY_MONITOR_URL}/api/recovery`, {
        timeout: 8000,
      });

      if (response.data?.success !== true) {
        throw new Error("Recovery Monitor returned an invalid response.");
      }

      setRecoveryInfo(response.data);
      recoveryLoadedRef.current = true;
      setRecoveryError("");
      setTimelineLastUpdated(new Date().toISOString());
      setTimelineStale(false);
      setTimelineError("");
    } catch (error) {
      console.error(
        "Recovery Monitor request failed:",
        error.message
      );

      setRecoveryError(
        error.code === "ECONNABORTED"
          ? "Recovery Monitor request timed out."
          : error.message === "Network Error"
            ? "Cannot connect to Recovery Monitor on port 5002."
            : error.message || "Recovery Monitor request failed."
      );
      setTimelineError(
        error.code === "ECONNABORTED"
          ? "Recovery monitor request timed out. Timeline data may be stale."
          : "Unable to fetch the live incident timeline right now."
      );
      setTimelineStale(true);
    } finally {
      if (isFirstLoad) {
        setTimelineLoading(false);
      }
    }
  };

  async function checkIncidents() {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/incidents`,
        { timeout: 8000 }
      );

      setIncidents(response.data.incidents || []);
      setIncidentsUpdatedAt(new Date().toLocaleTimeString());
      setIncidentsError("");
    } catch {
      setIncidentsError(
        "Unable to load incidents from the backend."
      );
    }
  }

  const checkPaymentHealth = async () => {
    try {
      const response = await axios.get(`${PAYMENT_SERVICE_URL}/health`, {
        timeout: 3000,
      });
      setPaymentHealth(response.data || null);
      setPaymentHealthError("");
      setPaymentLastSuccessfulCheck(new Date().toLocaleTimeString());
      setPaymentLastFailure(null);
    } catch (error) {
      setPaymentHealth(null);
      setPaymentLastFailure(
        error?.code === "ECONNABORTED"
          ? "Payment service health check timed out."
          : error?.message || "Payment service is unavailable."
      );
      setPaymentHealthError(
        error?.code === "ECONNABORTED"
          ? "Payment service health check timed out."
          : error?.message || "Payment service is unavailable."
      );
    }
  };

  const refreshAllStatuses = useCallback(async () => {
    await Promise.all([
      checkBackendHealth(),
      checkRecoveryMonitor(),
      checkPaymentHealth(),
      checkIncidents(),
    ]);
  }, []);

  useEffect(() => {
    let isRefreshing = false;

    const refresh = async () => {
      if (isRefreshing) return;

      isRefreshing = true;

      try {
        await refreshAllStatuses();
      } finally {
        isRefreshing = false;
      }
    };

    refresh();

    const intervalId = setInterval(refresh, 5000);

    return () => clearInterval(intervalId);
  }, [refreshAllStatuses]);

  useEffect(() => {
    checkExperimentStatus();

    const intervalId = setInterval(checkExperimentStatus, 5000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const loadOrders = async () => {
      await fetchAdminOrders();
    };
    loadOrders();
  }, []);

  useEffect(() => {
    if (!paymentRecovery.running || paymentRecovery.resolvedAt) return;

    const recovery = Array.isArray(incidents)
      ? incidents.find(
          (i) =>
            String(i.incidentType || "").toLowerCase() ===
              "payment_timeout_recovery" &&
            i.status === "resolved" &&
            String(i.recoveryAction || "") ===
              "Verified the existing payment transaction" &&
            i.detectedAt &&
            new Date(i.detectedAt) >= paymentRecovery.startedAt
        )
      : null;

    if (recovery) {
      const duration = Math.round(
        (new Date(recovery.resolvedAt || recovery.detectedAt) -
          paymentRecovery.startedAt) /
          1000
      );
      setPaymentRecovery((prev) => ({
        ...prev,
        running: false,
        resolvedAt: recovery.resolvedAt || recovery.detectedAt,
        status: "recovered",
        message: `Self-healed in ${duration}s: payment verified and order placed.`,
        stages: [
          ...prev.stages,
          {
            t: Date.now(),
            status: "recovered",
            message: `Self-healed in ${duration}s: payment verified and order placed (₹${Number(recovery?.totalAmount ?? 0).toLocaleString()}).`,
          },
        ],
      }));
    }
  }, [incidents, paymentRecovery.running, paymentRecovery.startedAt, paymentRecovery.resolvedAt]);


  const { backendStatus, databaseStatus } = getBackendHealthStatuses({
    health,
    healthError,
  });

  const paymentStatus = derivePaymentHealthState({
    paymentHealth,
    paymentHealthError,
    paymentRunning,
  });

  const paymentDetail = buildPaymentHealthDetail({
    paymentHealth,
    paymentHealthError,
    paymentLastSuccessfulCheck,
    paymentLastFailure,
    paymentRecoveryAttempts,
    paymentRecoveryVerifiedAt,
  });

  const recoveryStatus = recoveryError
    ? "Unavailable"
    : !recoveryInfo
      ? "Checking"
      : !recoveryInfo.success || !recoveryInfo.available
        ? "Unavailable"
        : recoveryInfo.status !== "running"
          ? "Degraded"
          : recoveryInfo.health === "healthy"
            ? "Healthy"
            : "Degraded";

  const recoveryMonitorDetail = recoveryError
    ? "Connection failed · Port 5002"
    : !recoveryInfo
      ? "Checking Docker · Port 5002"
      : recoveryInfo.available === false
        ? `Docker unavailable: ${recoveryInfo.message || "Start Docker Desktop"}`
        : `Docker: ${recoveryInfo.container}`;

  const totalIncidents = incidents.length;

  // The analytics keep their last known figures when the backend cannot be
  // reached, so they are marked as stale instead of being cleared.
  const { stale: incidentsAreStale, updatedAt: incidentsUpdatedAtValue } =
    getIncidentsFreshness({
      incidents,
      incidentsError,
      updatedAt: incidentsUpdatedAt,
    });

  const resolvedIncidents = incidents.filter(
    (incident) => incident.status === "resolved"
  ).length;

  const failedIncidents = incidents.filter(
    (incident) => incident.status === "failed"
  ).length;

  const activeIncidents = incidents.filter(
    (incident) =>
      incident.status === "detected" ||
      incident.status === "recovering"
  ).length;

  const recoverySuccessRate =
    totalIncidents > 0
      ? ((resolvedIncidents / totalIncidents) * 100).toFixed(1)
      : "0.0";

  const incidentsBySeverity = [
    {
      label: "Critical",
      count: incidents.filter((i) => i.severity === "critical").length,
      color: "bg-red-500",
    },
    {
      label: "High",
      count: incidents.filter((i) => i.severity === "high").length,
      color: "bg-orange-500",
    },
    {
      label: "Medium",
      count: incidents.filter((i) => i.severity === "medium").length,
      color: "bg-amber-400",
    },
    {
      label: "Low",
      count: incidents.filter((i) => i.severity === "low").length,
      color: "bg-cyan-400",
    },
  ];

  const incidentsByType = Object.entries(
    incidents.reduce((counts, incident) => {
      const type = incident.incidentType || "unknown";

      counts[type] = (counts[type] || 0) + 1;

      return counts;
    }, {})
  )
    .map(([type, count]) => ({
      label: type
        .split("_")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(" "),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const paymentIncidents = incidents.filter(
    (incident) =>
      String(incident.incidentType || "").toLowerCase().includes("payment") ||
      String(incident.message || "").toLowerCase().includes("payment")
  );

  const recoveryActionsSummary = Object.entries(
    incidents.reduce((counts, incident) => {
      const action = incident.recoveryAction || "No action recorded";

      counts[action] = (counts[action] || 0) + 1;

      return counts;
    }, {})
  )
    .map(([action, count]) => ({
      action,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const filteredIncidents = incidents.filter((incident) => {
    const matchesSeverity =
      severityFilter === "all" ||
      incident.severity?.toLowerCase() === severityFilter;

    const matchesStatus =
      statusFilter === "all" ||
      incident.status?.toLowerCase() === statusFilter;

    const matchesType =
      typeFilter === "all" ||
      incident.incidentType?.toLowerCase() === typeFilter;

    return matchesSeverity && matchesStatus && matchesType;
  });





  const services = [
    {
      name: "Backend API",
      detail: "Express · Port 5000",
      icon: Server,
      status: backendStatus,
    },
    {
      name: "MongoDB Atlas",
      detail: "Database connection",
      icon: CheckCircle2,
      status: databaseStatus,
    },
    {
      name: "Payment Service",
      detail: paymentDetail,
      icon: CreditCard,
      status: paymentStatus,
    },
    {
      name: "Recovery Monitor",
      detail: recoveryMonitorDetail,
      icon: RefreshCw,
      status: recoveryStatus,
    },
  ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <main className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-5 lg:px-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-400">
              SHCom / Operations
            </p>

            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              System Overview
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Self-healing infrastructure monitoring
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">
              {lastChecked
                ? `Last checked: ${lastChecked}`
                : "Waiting for first health check"}
            </span>

            <button
              onClick={refreshAllStatuses}
              disabled={checking}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={checking ? "animate-spin" : ""}
              />
              {checking ? "Checking..." : "Refresh status"}
            </button>
          </div>
        </header>

        <div className="space-y-8 p-6 lg:p-10">
          <section
            id="overview"
            className="scroll-mt-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-[#111c2c] to-[#0d1320] p-6 lg:p-8"
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                <Activity size={25} />
              </div>

              <div className="flex-1">
                <h3 className="text-xl font-semibold">
                  Welcome to SHCom Operations
                </h3>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Track service availability, investigate incidents and
                  understand how SHCom responds to failures. Service
                  status is retrieved from your running backend and
                  recovery monitor.
                </p>
              </div>
            </div>
          </section>

          <ServiceDependencyMap
            health={health}
            paymentHealth={paymentHealth}
            recoveryInfo={recoveryInfo}
            recoveryError={recoveryError}
            healthError={healthError}
            paymentHealthError={paymentHealthError}
          />

          <IncidentTimeline
            events={Array.isArray(recoveryInfo?.events) ? recoveryInfo.events : []}
            incidents={paymentIncidents}
            loading={timelineLoading}
            error={timelineError}
            stale={timelineStale}
            lastUpdated={timelineLastUpdated}
          />

          <section id="service-health" className="scroll-mt-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Service Health</h3>
              <p className="mt-1 text-sm text-slate-500">
                Live backend, database and recovery-monitor status.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {services.map(({ name, detail, icon: Icon, status }) => (
                <article
                  key={name}
                  className="rounded-2xl border border-slate-800 bg-[#0d1320] p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="rounded-lg bg-slate-800 p-2.5 text-slate-300">
                      <Icon size={19} />
                    </div>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${status === "Healthy" || status === "Connected"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : status === "Unavailable" ||
                          status === "Disconnected" ||
                          status === "Degraded"
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : "border-slate-700 text-slate-300"
                        }`}
                    >
                      {status}
                    </span>
                  </div>

                  <h4 className="mt-5 font-semibold">{name}</h4>
                  <p className="mt-1 text-xs text-slate-500">{detail}</p>

                  {name === "Recovery Monitor" && recoveryInfo && (
                    <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Container</span>
                        <span className="text-slate-300">
                          {recoveryInfo.container}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Docker status</span>
                        <span className="text-slate-300">
                          {recoveryInfo.status}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Restart count</span>
                        <span className="text-slate-300">
                          {recoveryInfo.restartCount ?? "Unknown"}
                        </span>
                      </div>
                    </div>
                  )}

                  {name === "Recovery Monitor" && recoveryError && (
                    <p className="mt-3 text-xs text-red-400">
                      {recoveryError}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>


          <section
            id="incidents"
            className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Incident Log
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Real incidents recorded by the SHCom backend.
                </p>
              </div>

              {/* Incident Filters */}
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Severity
                  </label>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  >
                    <option value="all">All Severities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  >
                    <option value="all">All Statuses</option>
                    <option value="detected">Detected</option>
                    <option value="recovering">Recovering</option>
                    <option value="resolved">Resolved</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Incident Type
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#101827] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  >
                    <option value="all">All Incident Types</option>
                    {[...new Set(
                      incidents
                        .map((incident) => incident.incidentType?.toLowerCase())
                        .filter(Boolean)
                    )].map((type) => (
                      <option key={type} value={type}>
                        {type
                          .split("_")
                          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                          .join(" ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>


              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                {incidents.length} incidents
              </span>
            </div>

            {incidentsError ? (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                {incidentsError}
              </p>
            ) : incidents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 p-8 text-center">
                <AlertTriangle className="mx-auto mb-3 text-slate-500" size={28} />
                <p className="text-slate-300">No incidents recorded.</p>
                <p className="mt-1 text-sm text-slate-500">
                  New incidents will appear here when recorded by the backend.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredIncidents.map((incident) => (
                  <article
                    key={incident._id}
                    className="rounded-xl border border-slate-800 bg-[#101827] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-white">
                          {incident.message || incident.incidentType}
                        </h4>
                        <p className="mt-1 text-sm text-slate-400">
                          {incident.service} · {incident.incidentType}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                          {incident.severity}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${incident.status === "resolved"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : incident.status === "failed"
                              ? "bg-red-500/10 text-red-300"
                              : "bg-amber-500/10 text-amber-300"
                            }`}
                        >
                          {incident.status}
                        </span>
                      </div>
                    </div>

                    {incident.recoveryAction && (
                      <p className="mt-4 text-sm text-slate-300">
                        <span className="text-slate-500">Recovery action: </span>
                        {incident.recoveryAction}
                      </p>
                    )}

                    {incident.recoveryResult && (
                      <p className="mt-2 text-sm text-slate-300">
                        <span className="text-slate-500">Result: </span>
                        {incident.recoveryResult}
                      </p>
                    )}

                    <div className="mt-5 border-t border-slate-800 pt-4">
                      <h5 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Recovery Timeline
                      </h5>

                      <div className="space-y-4">
                        {/* Stage 1: Incident detection */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <CheckCircle2 size={18} className="text-cyan-400" />
                            <div className="mt-2 h-full min-h-5 w-px bg-slate-700" />
                          </div>

                          <div className="pb-2">
                            <p className="text-sm font-medium text-slate-200">
                              Incident Detected
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {incident.detectedAt
                                ? new Date(incident.detectedAt).toLocaleString()
                                : "Detection time unavailable"}
                            </p>
                          </div>
                        </div>

                        {/* Stage 2: Recovery action */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            {incident.recoveryAction ? (
                              <CheckCircle2 size={18} className="text-cyan-400" />
                            ) : (
                              <Activity size={18} className="text-slate-500" />
                            )}
                            <div className="mt-2 h-full min-h-5 w-px bg-slate-700" />
                          </div>

                          <div className="pb-2">
                            <p className="text-sm font-medium text-slate-200">
                              Recovery Action
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {incident.recoveryAction || "No recovery action recorded"}
                            </p>
                          </div>
                        </div>

                        {/* Stage 3: Final outcome */}
                        <div className="flex gap-3">
                          <div>
                            {incident.status === "resolved" ? (
                              <CheckCircle2 size={18} className="text-emerald-400" />
                            ) : incident.status === "failed" ? (
                              <AlertTriangle size={18} className="text-red-400" />
                            ) : (
                              <Activity size={18} className="text-amber-400" />
                            )}
                          </div>

                          <div>
                            <p className="text-sm font-medium text-slate-200">
                              {incident.status === "resolved"
                                ? "Recovery Resolved"
                                : incident.status === "failed"
                                  ? "Recovery Failed"
                                  : incident.status === "recovering"
                                    ? "Recovery In Progress"
                                    : "Awaiting Recovery"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {incident.resolvedAt
                                ? new Date(incident.resolvedAt).toLocaleString()
                                : incident.status === "resolved"
                                  ? "Resolution time unavailable"
                                  : "No resolution time recorded"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>


                    <p className="mt-3 text-xs text-slate-500">
                      Detected:{" "}
                      {incident.detectedAt
                        ? new Date(incident.detectedAt).toLocaleString()
                        : "Timestamp unavailable"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            id="recovery-analytics"
            className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">
                Performance Insights
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Recovery Analytics
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Calculated from real incidents recorded by SHCom.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Total Incidents</p>
                <p className="mt-3 text-3xl font-bold text-white">
                  {totalIncidents}
                </p>
              </article>

              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Resolved</p>
                <p className="mt-3 text-3xl font-bold text-emerald-400">
                  {resolvedIncidents}
                </p>
              </article>

              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Failed</p>
                <p className="mt-3 text-3xl font-bold text-red-400">
                  {failedIncidents}
                </p>
              </article>

              <article className="rounded-xl border border-slate-800 bg-[#101827] p-4">
                <p className="text-sm text-slate-400">Active Incidents</p>
                <p className="mt-3 text-3xl font-bold text-amber-400">
                  {activeIncidents}
                </p>
              </article>
            </div>

            {incidentsAreStale ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  These figures are the last ones loaded at{" "}
                  {incidentsUpdatedAtValue || "an earlier time"}. The backend
                  could not be reached, so the numbers may be out of date.
                </span>
              </div>
            ) : incidentsUpdatedAt ? (
              <p className="mt-4 text-xs text-slate-500">
                Last updated at {incidentsUpdatedAt}
              </p>
            ) : null}


            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Resolution Rate */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-white">Resolution Rate</h4>
                  <span className="text-xl font-bold text-cyan-400">
                    {recoverySuccessRate}%
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all"
                    style={{ width: `${recoverySuccessRate}%` }}
                  />
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Percentage of all recorded incidents currently marked resolved.
                </p>
              </div>

              {/* Incidents by Severity */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">
                  Incidents by Severity
                </h4>

                <div className="space-y-4">
                  {incidentsBySeverity.map((item) => (
                    <div key={item.label}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-slate-300">{item.label}</span>
                        <span className="text-slate-400">{item.count}</span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{
                            width: `${totalIncidents > 0
                              ? (item.count / totalIncidents) * 100
                              : 0
                              }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Incidents by Type */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">
                  Incidents by Type
                </h4>

                {incidentsByType.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No incidents recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {incidentsByType.map((item) => (
                      <div key={item.label}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span className="text-slate-300">{item.label}</span>
                          <span className="text-slate-400">{item.count}</span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-violet-400 transition-all"
                            style={{
                              width: `${totalIncidents > 0
                                ? (item.count / totalIncidents) * 100
                                : 0
                                }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recovery Action Summary */}
              <div className="rounded-xl border border-slate-800 bg-[#101827] p-5">
                <h4 className="mb-5 font-semibold text-white">
                  Recovery Action Summary
                </h4>

                {recoveryActionsSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No recovery actions recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {recoveryActionsSummary.map((item) => (
                      <div key={item.action}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span className="text-slate-300">
                            {item.action}
                          </span>
                          <span className="text-slate-400">
                            {item.count}
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all"
                            style={{
                              width: `${totalIncidents > 0
                                ? (item.count / totalIncidents) * 100
                                : 0
                                }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </section>
          <section
            id="chaos-control"
            className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">
              Controlled Experiments
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              Chaos Control Center
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Trigger controlled failures and observe automatic recovery.
            </p>

            <div className="mt-5 rounded-xl border border-cyan-800/60 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Run All Scenarios</h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Runs all four scenarios sequentially and records each result.
                  </p>
                  <p className="mt-2 text-xs text-amber-400">
                    Warning: this sequence deliberately restarts the backend and payment service.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Run all four scenarios? The backend and payment service will be deliberately interrupted during testing. Do not run during checkout."
                      )
                    ) {
                      runAllScenarios();
                    }
                  }}
                  disabled={
                    runAllRunning ||
                    chaosRunning ||
                    dbCheckRunning ||
                    paymentRunning ||
                    inventoryRunning ||
                    reconcileRunning ||
                    paymentResponseLostRunning
                  }
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runAllRunning ? "Running Scenarios..." : "Run All Scenarios"}
                </button>
              </div>

              {runAllRunning && (
                <p className="mt-4 text-sm text-amber-400">
                  Experiment sequence in progress. Keep this dashboard open.
                </p>
              )}

              {runAllError && (
                <p className="mt-4 text-sm text-red-400">{runAllError}</p>
              )}

              {runAllResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-sm font-medium text-slate-200">Scenario Results</h5>
                    <span className="text-xs text-slate-400">
                      {runAllResults.filter((item) => item.status === "passed").length} of 4 passed
                    </span>
                  </div>

                  {runAllResults.map((result, index) => (
                    <div
                      key={result.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-800 bg-[#0d1320] p-3"
                    >
                      <div className="flex items-start gap-3">
                        {result.status === "passed" ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-400" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-slate-200">
                            {index + 1}. {result.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">{result.message}</p>
                          {result.durationMs !== null && (
                            <p className="mt-1 text-xs text-slate-500">
                              Duration: {(result.durationMs / 1000).toFixed(2)}s
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2 py-1 text-xs ${result.status === "passed"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-red-500/10 text-red-300"
                          }`}
                      >
                        {result.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-[#101827] p-4">
              <p className="text-sm text-slate-400">Experiment Status</p>
              <p className={`mt-2 text-sm font-semibold ${chaosRunning ? "text-amber-400" :
                chaosError ? "text-red-400" :
                  chaosResult ? "text-emerald-400" :
                    "text-slate-300"
                }`}>
                {chaosRunning ? "Recovery in progress..." :
                  chaosError ? "Experiment failed" :
                    chaosResult ? "Recovery verified" :
                      "Ready to run"}
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Backend Crash Recovery</h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Crashes the backend container and verifies its automatic restart.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runBackendCrash}
                  disabled={
                    runAllRunning ||
                    chaosRunning ||
                    dbCheckRunning ||
                    paymentRunning ||
                    inventoryRunning
                  }
                  className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chaosRunning ? "Recovering..." : "Run Crash Test"}
                </button>
              </div>

              {chaosRunning && (
                <p className="mt-4 text-sm text-amber-400">
                  Crash triggered. Waiting for automatic recovery...
                </p>
              )}

              {chaosResult && (
                <p className="mt-4 text-sm text-emerald-400">{chaosResult}</p>
              )}

              {chaosError && (
                <p className="mt-4 text-sm text-red-400">{chaosError}</p>
              )}

              <BackendCrashCoordinationControls
                enabled={coordinationEnabled}
                onToggle={setCoordinationEnabled}
                rate={trafficRate}
                onRateChange={setTrafficRate}
                concurrency={trafficConcurrency}
                onConcurrencyChange={setTrafficConcurrency}
                limits={trafficLimits}
                disabled={chaosRunning}
              />

              <BackendCrashTrafficResult
                response={chaosResponse}
                coordinationRequested={coordinationEnabled}
              />
            </div>

            <div className="mt-6 rounded-xl border border-amber-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Payment Chaos</h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Simulates a payment response timeout after the payment is recorded,
                    allowing SHCom to verify and reconcile the transaction.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={injectPaymentChaos}
                  disabled={
                    runAllRunning ||
                    chaosRunning ||
                    dbCheckRunning ||
                    paymentRunning ||
                    inventoryRunning ||
                    paymentChaosLoading
                  }
                  className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {paymentChaosLoading ? "Activating..." : "Inject Payment Chaos"}
                </button>
              </div>

              {paymentChaosMessage && (
                <p className="mt-4 text-sm text-amber-300" role="status">
                  {paymentChaosMessage}
                </p>
              )}

              {paymentRecovery.running || paymentRecovery.status === "recovered" ? (
                <div className="mt-4 rounded-xl border border-amber-900/30 bg-amber-900/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
                    Payment Chaos Recovery
                  </p>
                  <p className="text-xs text-amber-200 mb-2">
                    {paymentRecovery.message}
                  </p>
                  <div className="space-y-1">
                    {paymentRecovery.stages.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-[10px]"
                      >
                        <span
                          className={`flex-shrink-0 w-2 h-2 rounded-full mt-1 ${
                            s.status === "recovered"
                              ? "bg-emerald-500"
                              : s.status === "error"
                                ? "bg-red-500"
                                : "bg-amber-500"
                          }`}
                        />
                        <span className="text-amber-100">
                          {new Date(s.t).toLocaleTimeString()} — {s.message}
                        </span>
                      </div>
                    ))}
                  </div>
                  {paymentRecovery.status === "recovered" && (
                    <p className="mt-2 text-xs font-semibold text-emerald-400">
                      Recovery complete — no duplicate order or payment was created.
                    </p>
                  )}
                </div>
              ) : null}
            </div>


            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">
                    Database Connection Recovery
                  </h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Simulates a safe MongoDB outage and verifies automatic reconnection with a real database read.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={runDatabaseCheck}
                    disabled={
                      runAllRunning ||
                      dbCheckRunning ||
                      chaosRunning ||
                      paymentRunning ||
                      inventoryRunning
                    }
                    className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {dbCheckRunning ? "Checking..." : "Check Database"}
                  </button>
                  <button
                    type="button"
                    onClick={runDatabaseRecovery}
                    disabled={
                      runAllRunning ||
                      dbCheckRunning ||
                      chaosRunning ||
                      paymentRunning ||
                      inventoryRunning
                    }
                    className="rounded-lg border border-emerald-700 px-4 py-2 text-sm text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {dbCheckRunning ? "Recovering..." : "Run Recovery Test"}
                  </button>
                </div>
              </div>

              {dbCheckResult && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-emerald-400">{dbCheckResult}</p>
                  {dbRecoveryDuration !== null && (
                    <p className="text-xs text-slate-400">
                      Recovery duration: {(dbRecoveryDuration / 1000).toFixed(2)}s
                    </p>
                  )}
                </div>
              )}

              {dbCheckStages.length > 0 && (
                <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                  <p className="text-xs uppercase tracking-wider text-slate-400">
                    Recovery stages
                  </p>
                  {dbCheckStages.map((stage, index) => (
                    <div
                      key={`${stage.stage}-${index}`}
                      className="flex items-start justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-200">{stage.stage}</p>
                        <p className="text-slate-400">{stage.message}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 ${stage.status === "passed" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                        {stage.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {dbCheckError && (
                <p className="mt-4 text-sm text-red-400">
                  {dbCheckError}
                </p>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Payment Service Recovery</h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Crashes the payment service and verifies its automatic restart and health.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "This test briefly interrupts the payment service. Do not run it during checkout. Continue?"
                      )
                    ) {
                      runPaymentRecovery();
                    }
                  }}
                  disabled={paymentRunning || inventoryRunning || chaosRunning || dbCheckRunning}
                  className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {paymentRunning ? "Recovering..." : "Run Payment Recovery"}
                </button>
              </div>

              {paymentRunning && (
                <p className="mt-4 text-sm text-amber-400">
                  Payment service test running. Waiting for restart and health verification...
                </p>
              )}

              {paymentResult && (
                <p className="mt-4 text-sm text-emerald-400">{paymentResult}</p>
              )}

              {paymentError && (
                <p className="mt-4 text-sm text-red-400">{paymentError}</p>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">
                    Payment Reconciliation
                  </h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Asks the backend to examine existing payment attempts whose
                    outcome is still uncertain. It verifies durable transactions
                    and finalizes matching orders at most once. It does not
                    submit a checkout, start a payment, or create a new order.
                    HTTP success alone is not proof a payment was captured;
                    the resolved counts show what was actually confirmed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runReconciliation}
                  disabled={
                    reconcileRunning ||
                    runAllRunning ||
                    chaosRunning ||
                    dbCheckRunning ||
                    paymentRunning ||
                    inventoryRunning
                  }
                  className="rounded-lg border border-violet-700 px-4 py-2 text-sm text-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reconcileRunning
                    ? "Reconciling..."
                    : "Request Payment Reconciliation"}
                </button>
              </div>

              {reconcileRunning && (
                <p className="mt-4 text-sm text-amber-400">
                  Examining existing payment attempts. This does not start a new payment.
                </p>
              )}

              {reconcileResult && (
                <div className="mt-4 rounded-lg border p-3 text-sm">
                  <div className="mb-2 flex items-center gap-2">
                    {reconcileResult.outcome === "success" ? (
                      <span className="rounded-full border px-2 py-0.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                        Resolved
                      </span>
                    ) : reconcileResult.outcome === "unresolved" ? (
                      <span className="rounded-full border px-2 py-0.5 border-amber-500/30 bg-amber-500/10 text-amber-400">
                        Unresolved
                      </span>
                    ) : (
                      <span className="rounded-full border px-2 py-0.5 border-red-500/30 bg-red-500/10 text-red-400">
                        Error
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-slate-300">{reconcileResult.message}</p>
                  {reconcileResult.examined > 0 && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-4 text-xs">
                      <div>
                        <p className="text-slate-500">Examined</p>
                        <p className="text-slate-300">{reconcileResult.examined}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Paid</p>
                        <p className="text-emerald-400">{reconcileResult.resolvedPaid}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Failed</p>
                        <p className="text-red-400">{reconcileResult.resolvedFailed}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Unresolved</p>
                        <p className="text-amber-400">{reconcileResult.unresolved}</p>
                      </div>
                    </div>
                  )}
                  {reconcileResult.note && (
                    <p className="mt-2 text-xs text-slate-500">
                      {reconcileResult.note}
                    </p>
                  )}
                </div>
              )}

              {reconcileError && (
                <p className="mt-4 text-sm text-red-400">{reconcileError}</p>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">
                    Payment Response Lost Recovery
                  </h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Verifies that a payment which succeeds and is durably
                    recorded, but whose response is lost to the client, is
                    recovered through the durable ledger without duplicate
                    payment, order, or stock deduction.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runPaymentResponseLost}
                  disabled={
                    paymentResponseLostRunning ||
                    runAllRunning ||
                    chaosRunning ||
                    dbCheckRunning ||
                    paymentRunning ||
                    inventoryRunning
                  }
                  className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {paymentResponseLostRunning
                    ? "Running..."
                    : "Start Payment Response Lost Test"}
                </button>
              </div>

              {paymentResponseLostRunning && (
                <p className="mt-4 text-sm text-amber-400">
                  Experiment in progress. Complete the manual steps shown below.
                </p>
              )}

              {paymentResponseLostStages.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-wider text-slate-400">
                    Progress Stages
                  </p>
                  {paymentResponseLostStages.map((stage, index) => (
                    <div
                      key={`${stage.stage}-${index}`}
                      className="flex items-start justify-between gap-3 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-200">
                          {stage.stage.charAt(0).toUpperCase() + stage.stage.slice(1).replaceAll("-", " ")}
                        </p>
                        <p className="text-slate-400">{stage.message}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 ${stage.status === "passed" ? "bg-emerald-500/10 text-emerald-300" : stage.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}
                      >
                        {stage.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {paymentResponseLostError && (
                <p className="mt-4 text-sm text-red-400">
                  {paymentResponseLostError}
                </p>
              )}

              <div className="mt-6 space-y-3">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Payment Attempt ID
                    </label>
                    <input
                      type="text"
                      value={paymentResponseLostAttemptId}
                      onChange={(e) => setPaymentResponseLostAttemptId(e.target.value)}
                      placeholder="Attempt ID from checkout"
                      className="w-48 rounded-xl border border-slate-700 bg-[#0d1320] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Order ID
                    </label>
                    <input
                      type="text"
                      value={paymentResponseLostOrderId}
                      onChange={(e) => setPaymentResponseLostOrderId(e.target.value)}
                      placeholder="Order ID from checkout"
                      className="w-48 rounded-xl border border-slate-700 bg-[#0d1320] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Transaction ID
                    </label>
                    <input
                      type="text"
                      value={paymentResponseLostTransactionId}
                      onChange={(e) => setPaymentResponseLostTransactionId(e.target.value)}
                      placeholder="Transaction ID (after recovery)"
                      className="w-48 rounded-xl border border-slate-700 bg-[#0d1320] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                    <p className="text-slate-500">Orders Before</p>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                      {paymentResponseLostBeforeOrderCount ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                    <p className="text-slate-500">Orders After</p>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                      {paymentResponseLostAfterOrderCount ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                    <p className="text-slate-500">Gaming Mouse Stock Before</p>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                      {paymentResponseLostBeforeStock ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                    <p className="text-slate-500">Gaming Mouse Stock After</p>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                      {paymentResponseLostAfterStock ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={captureBeforeState}
                    disabled={
                      paymentResponseLostRunning ||
                      paymentResponseLostBeforeOrderCount !== null
                    }
                    className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Capture Before State
                  </button>
                  <button
                    type="button"
                    onClick={captureAfterState}
                    disabled={
                      paymentResponseLostRunning ||
                      paymentResponseLostAfterOrderCount !== null
                    }
                    className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Capture After State
                  </button>
                  <button
                    type="button"
                    onClick={refreshAttemptStatus}
                    disabled={
                      paymentResponseLostRunning ||
                      paymentResponseLostRefreshing
                    }
                    className="rounded-lg border border-violet-700 px-3 py-2 text-sm text-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {paymentResponseLostRefreshing
                      ? "Refreshing..."
                      : "Refresh Attempt Status"}
                  </button>
                </div>
              </div>

              {paymentResponseLostResult && (
                <div className="mt-4 rounded-lg border p-3 text-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 ${paymentResponseLostResult.passed
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                        }`}
                    >
                      {paymentResponseLostResult.passed ? "Recovery Verified" : "Recovery Failed"}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-300">
                    {paymentResponseLostResult.message}
                  </p>
                  {paymentResponseLostResult.details && (
                    <ul className="mt-2 text-xs text-slate-400 space-y-1 list-disc list-inside">
                      {paymentResponseLostResult.details.map(
                        (detail, i) => (
                          <li key={i}>{detail}</li>
                        )
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">Inventory Integrity Audit</h4>
                  <p className="mt-1 text-sm text-slate-400">
                    Performs a read-only audit of product stock and prices for invalid values.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runInventoryAudit}
                  disabled={runAllRunning || paymentRunning || inventoryRunning || chaosRunning || dbCheckRunning || paymentResponseLostRunning}
                  className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inventoryRunning ? "Auditing..." : "Run Inventory Audit"}
                </button>
              </div>

              {inventoryRunning && (
                <p className="mt-4 text-sm text-amber-400">
                  Checking product inventory integrity...
                </p>
              )}

              {inventoryResult && (
                <div className="mt-4 rounded-lg border border-slate-800 bg-[#0d1320] p-3">
                  <p className={`text-sm font-medium ${inventoryResult.success && inventoryResult.recovered
                    ? "text-emerald-400"
                    : "text-red-400"
                    }`}>
                    {inventoryResult.message || "Inventory audit completed."}
                  </p>

                  {inventoryResult.recovery && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-500">Products checked</p>
                        <p className="mt-1 text-lg font-semibold text-white">
                          {inventoryResult.recovery.productsChecked ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Issues detected</p>
                        <p className="mt-1 text-lg font-semibold text-white">
                          {inventoryResult.recovery.issueCount ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Mode</p>
                        <p className="mt-1 text-sm font-semibold text-cyan-300">
                          Read-only
                        </p>
                      </div>
                    </div>
                  )}

                  {inventoryResult.recovery?.issues?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {inventoryResult.recovery.issues.map((issue, index) => (
                        <p key={index} className="text-sm text-amber-300">
                          {typeof issue === "string" ? issue : JSON.stringify(issue)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {inventoryError && (
                <p className="mt-4 text-sm text-red-400">{inventoryError}</p>
              )}
            </div>



          </section>

          <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-white">
                  Admin Orders
                </h4>
                <p className="mt-1 text-sm text-slate-400">
                  Read-only view of all orders placed through the Storefront.
                  Payment status reflects the durable backend record, not
                  frontend inference.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchAdminOrders}
                disabled={ordersLoading || ordersRefreshing}
                className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ordersRefreshing ? "Refreshing..." : "Refresh Orders"}
              </button>
            </div>

            {ordersLoading && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#0d1320] p-6 text-center text-slate-400">
                Loading orders...
              </div>
            )}

            {ordersError && !ordersLoading && orders.length === 0 && (
              <div className="mt-4 rounded-lg border border-red-900/30 bg-red-900/10 p-6">
                <p className="text-sm text-red-400">{ordersError}</p>
                <button
                  type="button"
                  onClick={fetchAdminOrders}
                  disabled={ordersLoading || ordersRefreshing}
                  className="mt-3 text-sm text-cyan-400 underline"
                >
                  Try again
                </button>
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length === 0 && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#0d1320] p-6 text-center text-slate-400">
                <p className="text-sm">No orders found.</p>
              </div>
            )}

            {!ordersLoading && !ordersError && orders.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                      <th className="pb-3 font-semibold text-slate-300">
                        Order ID
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Date
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Checkout ID
                      </th>
                      <th className="pb-3 font-semibold text-slate-300 text-right">
                        Amount
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Order Status
                      </th>
                      <th className="pb-3 font-semibold text-slate-300">
                        Payment Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const paymentStatus =
                        order.paymentStatus || "unknown";
                      const orderStatus = order.orderStatus || "placed";
                      const isPaid =
                        paymentStatus === "paid" && orderStatus === "placed";
                      const isFailed =
                        paymentStatus === "failed" ||
                        orderStatus === "cancelled";

                      return (
                        <tr
                          key={order._id}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition"
                        >
                          <td className="py-3 text-xs font-mono text-slate-200 break-all">
                            {order._id}
                          </td>
                          <td className="py-3 text-xs text-slate-400">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3 text-xs font-mono text-slate-300 break-all">
                            {order.checkoutId || "—"}
                          </td>
                          <td className="py-3 text-xs text-right text-slate-200">
                            ₹{Number(order.totalAmount || 0)
                              .toFixed(2)
                              .toLocaleString("en-IN")}
                          </td>
                          <td className="py-3 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${orderStatus === "placed"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : orderStatus === "processing"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    : orderStatus === "completed"
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}
                            >
                              {orderStatus.charAt(0).toUpperCase() +
                                orderStatus.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isPaid
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : isFailed
                                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                    : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                                }`}
                            >
                              {paymentStatus.charAt(0).toUpperCase() +
                                paymentStatus.slice(1)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">
                  {orders.length} order{orders.length !== 1 ? "s" : ""} total
                </p>
              </div>
            )}
          </div>

          <SyntheticTrafficPanel />
          <div className="mt-6 rounded-xl border border-slate-800 bg-[#101827] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-white">
                  Experiment History
                </h4>
                <p className="mt-1 text-sm text-slate-400">
                  Recorded outcomes of completed recovery experiments.
                </p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                {experimentHistory.length} recorded
              </span>
            </div>

            {experimentStatusError && (
              <p className="mt-4 text-sm text-red-400">
                {experimentStatusError}
              </p>
            )}

            {!experimentStatusError && experimentHistory.length === 0 && (
              <p className="mt-4 rounded-lg border border-slate-800 p-4 text-sm text-slate-400">
                No experiment results recorded yet.
              </p>
            )}

            {experimentHistory.length > 0 && (
              <div className="mt-4 space-y-3">
                {experimentHistory.slice().reverse().map((experiment) => (
                  <div
                    key={experiment.id}
                    className="rounded-lg border border-slate-800 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-white">
                        {(experiment.scenario || "Unknown scenario")
                          .replaceAll("-", " ")
                          .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${experiment.status === "passed"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : experiment.status === "stopped"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                      >
                        {experiment.status || "Unknown"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      {experiment.message || "No details recorded."}
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      Completed:{" "}
                      {experiment.completedAt
                        ? new Date(experiment.completedAt).toLocaleString()
                        : "Time unavailable"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>


          <section className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-white">
                Recovery Event Timeline
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Live backend crash and MongoDB connection recovery events.
              </p>
            </div>

            {!recoveryInfo ? (
              <p className="text-sm text-slate-400">
                Waiting for recovery monitor...
              </p>
            ) : !recoveryInfo.events?.length ? (
              <p className="rounded-xl border border-slate-800 p-5 text-sm text-slate-400">
                No recovery events recorded yet. New events will appear here automatically.
              </p>
            ) : (
              <div className="space-y-3">
                {recoveryInfo.events.map((event, index) => (
                  <article
                    key={`${event.timestamp}-${event.type}-${index}`}
                    className="rounded-xl border border-slate-800 bg-[#101827] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {event.type === "crash" ||
                          event.type === "database-disconnected" ? (
                          <AlertTriangle size={18} className="text-amber-400" />
                        ) : (
                          <CheckCircle2 size={18} className="text-emerald-400" />
                        )}

                        <h4 className="text-sm font-medium text-white">
                          {event.type
                            .split("-")
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(" ")}
                        </h4>
                      </div>

                      <span className="text-xs text-slate-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      {event.message}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>




          <section
            id="recovery-metrics"
            className="scroll-mt-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-400/10 p-2.5 text-violet-300">
                <Workflow size={20} />
              </div>

              <div>
                <h3 className="font-semibold">Recovery Metrics</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Current Docker recovery information.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Backend container</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryInfo?.container ?? "Waiting for data"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Total restarts</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryInfo?.restartCount ?? "Unknown"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Container health</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryInfo?.health ?? "Unknown"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 p-4">
                <p className="text-sm text-slate-500">Monitor connection</p>
                <p className="mt-2 text-lg font-semibold">
                  {recoveryError
                    ? "Unavailable"
                    : recoveryInfo?.available
                      ? "Connected"
                      : "Waiting"}
                </p>
              </div>
            </div>
          </section>

          <footer className="border-t border-slate-800 pt-5 text-xs text-slate-500">
            SHCom · Self-Healing Commerce
          </footer>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
