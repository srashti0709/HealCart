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
};
