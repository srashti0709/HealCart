
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const PAYMENT_SERVICE_URL =
  import.meta.env.VITE_PAYMENT_SERVICE_URL || "http://localhost:5001";

export const RECOVERY_MONITOR_URL =
  import.meta.env.VITE_RECOVERY_MONITOR_URL || "http://localhost:5002";

export const CHAOS_CONTROLLER_URL =
  import.meta.env.VITE_CHAOS_CONTROLLER_URL || "http://localhost:5003";

export const API_ENDPOINTS = {
  products: `${API_BASE_URL}/api/products`,
  orders: `${API_BASE_URL}/api/orders`,
  cart: `${API_BASE_URL}/api/cart`,
  incidents: `${API_BASE_URL}/api/incidents`,
  restocks: `${API_BASE_URL}/api/restocks`,
  health: `${API_BASE_URL}/api/health`,
  paymentHealth: `${PAYMENT_SERVICE_URL}/health`,
  recovery: `${RECOVERY_MONITOR_URL}/api/recovery`,
  recoveryMonitor: `${RECOVERY_MONITOR_URL}/api/recovery`,
  recoveryEvents: `${RECOVERY_MONITOR_URL}/api/recovery/events`,
  chaos: `${CHAOS_CONTROLLER_URL}/api/chaos`,
  chaosBackendCrash: `${CHAOS_CONTROLLER_URL}/api/chaos/backend-crash`,
  traffic: `${CHAOS_CONTROLLER_URL}/api/chaos/traffic`,
  trafficEndpoints: `${CHAOS_CONTROLLER_URL}/api/chaos/traffic/endpoints`,
  trafficStart: `${CHAOS_CONTROLLER_URL}/api/chaos/traffic/start`,
  trafficStop: `${CHAOS_CONTROLLER_URL}/api/chaos/traffic/stop`,
  trafficStatus: `${CHAOS_CONTROLLER_URL}/api/chaos/traffic/status`,
  paymentTimeout: `${CHAOS_CONTROLLER_URL}/api/chaos/payment-timeout`,
  trafficRequests: `${CHAOS_CONTROLLER_URL}/api/chaos/traffic/requests`,
  paymentAttemptStatus: (attemptId) =>
    `${API_BASE_URL}/api/payments/attempts/${encodeURIComponent(attemptId)}`,
  paymentReconcile: `${CHAOS_CONTROLLER_URL}/api/chaos/payment-reconcile`,
  lastItemRacePrepare: `${API_BASE_URL}/api/experiments/last-item-race/prepare`,
  lastItemRaceStatus: (runId) =>
    `${API_BASE_URL}/api/experiments/last-item-race/${encodeURIComponent(runId)}`,
};
