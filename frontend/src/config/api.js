
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const API_ENDPOINTS = {
  products: `${API_BASE_URL}/api/products`,
  orders: `${API_BASE_URL}/api/orders`,
  cart: `${API_BASE_URL}/api/cart`,
  incidents: `${API_BASE_URL}/api/incidents`,
  restocks: `${API_BASE_URL}/api/restocks`,
};
