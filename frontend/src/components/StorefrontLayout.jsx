
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  ShoppingBag,
  ShieldCheck,
  AlertCircle,
  CreditCard,
} from "lucide-react";
import { API_ENDPOINTS } from "../config/api";
import StorefrontAvailabilityProvider from "./StorefrontAvailabilityProvider";
import StorefrontServiceBanner from "./StorefrontServiceBanner";
import useStorefrontAvailability from "../hooks/useStorefrontAvailability";
import { AVAILABILITY_STATUS } from "../hooks/useBackendAvailability";
import {
  isSameCart,
  readCart,
  readCartRaw,
  subscribeToCartChanges,
  writeCart,
} from "../lib/cart";

function useCart() {
  const [cart, setCart] = useState(() => readCart());

  useEffect(() => {
    const sync = () => {
      const next = readCart();
      setCart((current) => (isSameCart(current, next) ? current : next));
    };

    return subscribeToCartChanges(sync);
  }, []);

  useEffect(() => {
    const serialized = JSON.stringify(cart);

    if (readCartRaw() === serialized) return;

    writeCart(cart, { notify: false });
  }, [cart]);

  return [cart, setCart];
}

function StorefrontShell({ children }) {
  const [cart] = useCart();
  const availability = useStorefrontAvailability();
  const [paymentStatus, setPaymentStatus] = useState("Checking");
  const [paymentCheckedAt, setPaymentCheckedAt] = useState(null);

  const checkPaymentService = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.paymentHealth, {
        timeout: 3000,
      });

      const healthy =
        response?.status === 200 && response?.data?.status === "healthy";

      setPaymentStatus(healthy ? "Healthy" : "Unavailable");
    } catch {
      setPaymentStatus("Unavailable");
    }

    setPaymentCheckedAt(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      checkPaymentService();
    }, 0);

    const intervalId = setInterval(checkPaymentService, 15000);

    return () => {
      window.clearTimeout(timer);
      clearInterval(intervalId);
    };
  }, []);

  const { status, lastCheckedAt } = availability;
  const paymentOk = paymentStatus === "Healthy";
  const paymentKnown = paymentStatus !== "Checking";

  const backendChecking = status === AVAILABILITY_STATUS.CHECKING;
  const backendDown =
    status === AVAILABILITY_STATUS.UNAVAILABLE ||
    status === AVAILABILITY_STATUS.RECOVERING;

  const backendHealthy =
    status === AVAILABILITY_STATUS.HEALTHY ||
    status === AVAILABILITY_STATUS.RECONNECTED;

  const cartCount = Array.isArray(cart)
    ? cart.reduce((sum, item) => sum + (item.quantity || 0), 0)
    : 0;

  const statusLabel = backendChecking
    ? "Checking services..."
    : backendDown
      ? "Service disruption"
      : !paymentOk && paymentKnown
        ? "Payment service unavailable"
        : "Store operating";

  const footerLabel = backendChecking
    ? "Checking service status..."
    : backendDown
      ? status === AVAILABILITY_STATUS.RECOVERING
        ? "Store recovering"
        : "Store unavailable"
      : !paymentOk && paymentKnown
        ? "Checkout temporarily unavailable"
        : "Store operating";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link to="/user" className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-700 p-2 text-white">
                <ShieldCheck size={25} />
              </div>

              <div>
                <h1 className="text-xl font-bold text-slate-900">SHCom</h1>
                <p className="text-xs text-slate-500">
                  Self-Healing Commerce
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-4">
              {backendChecking ? (
                <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:flex">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                  Checking services...
                </div>
              ) : backendHealthy && paymentOk ? (
                <div className="hidden items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:flex">
                  <ShieldCheck size={14} />
                  {statusLabel}
                </div>
              ) : backendHealthy ? (
                <div className="hidden items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 sm:flex">
                  <CreditCard size={14} />
                  {statusLabel}
                </div>
              ) : (
                <div
                  role="status"
                  className="hidden items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 sm:flex"
                >
                  <AlertCircle size={14} />
                  {statusLabel}
                </div>
              )}

              <Link
                to="/user/orders"
                className="hidden text-sm font-medium text-slate-700 transition hover:text-emerald-800 sm:inline"
              >
                Order history
              </Link>

              <Link
                to="/user/cart"
                aria-label={`Open shopping cart with ${cartCount} items`}
                className="relative rounded-xl p-2 transition hover:bg-emerald-50"
              >
                <ShoppingBag size={24} />

                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-700 px-1 text-xs text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </header>

        <StorefrontServiceBanner
          status={status}
          recovery={availability.recovery}
          verifiedAt={availability.verifiedAt}
          lastCheckedAt={lastCheckedAt}
        />
      </div>

      {children}

      <footer className="mt-16 border-t border-slate-200 bg-white py-7 text-center text-sm text-slate-500">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:justify-between">
            <div>
              <p className="font-semibold text-slate-900">SHCom</p>
              <p className="mt-1">Self-Healing Commerce</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-slate-500">
              <a href="#products" className="hover:text-emerald-700">
                Products
              </a>

              <Link to="/user/cart" className="hover:text-emerald-700">
                Cart
              </Link>

              <Link to="/user/orders" className="hover:text-emerald-700">
                Order history
              </Link>
            </div>

            <div className="text-slate-500">
              {footerLabel}

              {lastCheckedAt && (
                <span className="ml-2 text-slate-400">
                  · checked{" "}
                  {new Date(lastCheckedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}

              {paymentCheckedAt && !paymentOk && paymentKnown ? (
                <span className="ml-2 text-slate-400">
                  · payment checked {paymentCheckedAt}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function StorefrontLayout({ children }) {
  return (
    <StorefrontAvailabilityProvider>
      <StorefrontShell>{children}</StorefrontShell>
    </StorefrontAvailabilityProvider>
  );
}
