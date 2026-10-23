/**
 * Shared cart synchronisation helpers.
 *
 * The persisted cart in localStorage stays the single source of truth for
 * every view (storefront, product details, cart, checkout). These helpers
 * only add a change notification so a mounted view such as the storefront
 * navigation badge can refresh itself immediately instead of waiting for a
 * page reload.
 */

export const CART_STORAGE_KEY = "shcomCart";

export const CART_CHANGED_EVENT = "shcom-cart-changed";

/**
 * Reads the persisted cart. Always returns an array.
 */
export function readCart() {
  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Returns the raw stored string so callers can skip redundant writes.
 */
export function readCartRaw() {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Persists the cart and notifies every listener.
 *
 * Pass `notify: false` when the write comes from a view that already holds
 * the authoritative state and must not trigger another synchronisation.
 */
export function writeCart(cart, { notify = true } = {}) {
  const safeCart = Array.isArray(cart) ? cart : [];

  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(safeCart));
  } catch {
    // storage unavailable; the in-memory state is still correct
  }

  if (notify) {
    notifyCartChanged();
  }

  return safeCart;
}

/**
 * Announces that the persisted cart changed.
 */
export function notifyCartChanged() {
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}

/**
 * Empties the persisted cart and notifies every listener.
 */
export function clearCart() {
  try {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // storage unavailable; nothing to clear
  }

  notifyCartChanged();
}

/**
 * Subscribes to cart changes. Returns the unsubscribe function.
 *
 * Both the in-page change event and the native storage event are used: the
 * first covers the current document, the second covers other tabs that share
 * the same origin.
 */
export function subscribeToCartChanges(listener) {
  const handleStorage = (event) => {
    if (event.key !== null && event.key !== CART_STORAGE_KEY) return;

    listener();
  };

  window.addEventListener(CART_CHANGED_EVENT, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * True when two carts hold the same items and quantities.
 */
export function isSameCart(first, second) {
  return JSON.stringify(first || []) === JSON.stringify(second || []);
}
