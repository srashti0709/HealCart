
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  ShoppingBag,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Zap,
  Headphones,
  Keyboard,
  Mouse,
  Cable,
  Monitor,
  PackageCheck,
  LockKeyhole,
  HeartHandshake,
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
      setCart((current) =>
        isSameCart(current, next) ? current : next
      );
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

const collections = [
  {
    name: "Keyboards",
    description: "Mechanical precision for every keystroke.",
    icon: Keyboard,
    color: "bg-violet-100",
  },
  {
    name: "Mice",
    description: "Lightweight control and accuracy.",
    icon: Mouse,
    color: "bg-indigo-100",
  },
  {
    name: "Headphones",
    description: "Immersive sound, without distractions.",
    icon: Headphones,
    color: "bg-purple-100",
  },
  {
    name: "Monitors",
    description: "Beautiful visuals for your workspace.",
    icon: Monitor,
    color: "bg-fuchsia-100",
  },
  {
    name: "Accessories",
    description: "The finishing touches for your setup.",
    icon: Cable,
    color: "bg-blue-100",
  },
];

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
        response?.status === 200 &&
        response?.data?.status === "healthy";

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

    const intervalId = window.setInterval(checkPaymentService, 15000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(intervalId);
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
    ? cart.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      )
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

  const serviceTone = backendChecking
    ? "border-slate-200 bg-slate-100 text-slate-700"
    : backendDown || (!paymentOk && paymentKnown)
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  const ServiceIcon = backendChecking
    ? AlertCircle
    : backendDown || (!paymentOk && paymentKnown)
      ? AlertCircle
      : ShieldCheck;

  return (
    <div className="lavender-commerce min-h-screen overflow-x-hidden bg-[#fdfaff] text-[#211a3b] antialiased">
      <div className="sticky top-0 z-40">
        <header className="border-b border-violet-100 bg-white/95 shadow-[0_4px_24px_-8px_rgba(69,48,120,0.12)] backdrop-blur-xl">
          <div className="mx-auto flex min-h-20 max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-12">
            <Link
              to="/user"
              className="group flex shrink-0 items-center gap-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200 transition-transform duration-200 group-hover:-translate-y-0.5">
                <ShoppingBag size={27} strokeWidth={2.2} />
              </div>

              <div className="min-w-0">
                <h1 className="font-bold tracking-tight text-[#211a3b] sm:text-xl">
                  TechNest
                </h1>
                <p className="hidden text-base text-slate-600 sm:block">
                  Premium electronics &amp; everyday tech
                </p>
              </div>
            </Link>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <div
                role="status"
                className={`hidden items-center gap-2 rounded-full border px-3 py-2 text-base font-semibold lg:flex ${serviceTone}`}
              >
                <ServiceIcon size={18} />
                <span>
                  {backendHealthy && paymentOk
                    ? "All systems operational"
                    : statusLabel}
                </span>
              </div>

              <Link
                to="/user/orders"
                className="hidden rounded-lg px-2 py-3 text-base font-medium text-slate-600 transition hover:bg-violet-50 hover:text-violet-800 md:inline-flex"
              >
                Order history
              </Link>

              <Link
                to="/user/cart"
                aria-label={`Open shopping cart with ${cartCount} items`}
                className="relative flex h-12 w-12 items-center justify-center rounded-xl text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
              >
                <ShoppingBag size={25} strokeWidth={1.9} />

                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-600 px-1.5 text-base font-bold text-white shadow-sm ring-2 ring-white">
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

      <main>{children}</main>

      <section className="relative isolate overflow-hidden border-y border-violet-100 bg-gradient-to-br from-[#f5efff] via-[#fbf8ff] to-[#f0edff] px-4 py-12 sm:px-6 lg:px-12">
        <div className="pointer-events-none absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full bg-violet-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 -z-10 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />

        <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-12 lg:items-center">
          <div className="flex flex-col gap-5 lg:col-span-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-4 py-2 text-base font-semibold text-violet-800 shadow-sm">
              <Zap size={18} />
              Built for reliable shopping
            </div>

            <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-[#211a3b] sm:text-4xl">
              Your next favorite piece of tech starts here.
            </h2>

            <p className="max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
              Discover electronics for your workspace, everyday life,
              and everything in between, with a shopping experience
              designed around reliability.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/user#products"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700"
              >
                Explore products
                <ArrowRight size={19} />
              </Link>

              <Link
                to="/user/cart"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-6 py-3 text-base font-semibold text-violet-800 transition hover:bg-violet-50"
              >
                <ShoppingBag size={19} />
                View your cart
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2 text-base text-slate-700">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-violet-700" />
                Reliable service monitoring
              </div>

              <div className="flex items-center gap-2">
                <PackageCheck size={20} className="text-violet-700" />
                Inventory-aware shopping
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-6">
            {collections.map((collection) => {
              const Icon = collection.icon;

              return (
                <a
                  key={collection.name}
                  href="/user#products"
                  className="group flex items-start gap-4 rounded-2xl border border-white bg-white/85 p-5 shadow-[0_8px_30px_-16px_rgba(69,48,120,0.24)] transition duration-200 hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg"
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-violet-800 transition group-hover:bg-violet-600 group-hover:text-white ${collection.color}`}
                  >
                    <Icon size={24} />
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-[#211a3b] sm:text-lg">
                      {collection.name}
                    </h3>

                    <p className="mt-1 text-base leading-6 text-slate-600">
                      {collection.description}
                    </p>

                    <span className="mt-3 inline-flex items-center gap-1 text-base font-semibold text-violet-700">
                      Explore
                      <ArrowRight
                        size={17}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-violet-100 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-12">
          <div className="grid gap-8 border-b border-violet-100 pb-8 md:grid-cols-3 md:items-start">
            <div>
              <Link
                to="/user"
                className="inline-flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200">
                  <ShoppingBag size={23} />
                </div>

                <span className="text-xl font-bold tracking-tight text-[#211a3b]">
                  SHCom
                </span>
              </Link>

              <p className="mt-3 max-w-md text-base leading-7 text-slate-600">
                Self-Healing Commerce — an electronics shopping
                experience with service monitoring and automatic
                recovery capabilities.
              </p>
            </div>

            <div>
              <h3 className="text-base font-bold text-[#211a3b]">
                Quick links
              </h3>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                <Link
                  to="/user"
                  className="text-base text-slate-600 transition hover:text-violet-700"
                >
                  Products
                </Link>

                <Link
                  to="/user/cart"
                  className="text-base text-slate-600 transition hover:text-violet-700"
                >
                  Shopping cart
                </Link>

                <Link
                  to="/user/orders"
                  className="text-base text-slate-600 transition hover:text-violet-700"
                >
                  Order history
                </Link>
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-[#211a3b]">
                <HeartHandshake size={20} className="text-violet-700" />
                Shopping with confidence
              </h3>

              <p className="mt-3 text-base leading-7 text-slate-600">
                Service availability is monitored in the background
                to help keep your shopping experience reliable.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  backendHealthy && paymentOk
                    ? "bg-emerald-50 text-emerald-700"
                    : backendChecking
                      ? "bg-slate-100 text-slate-700"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {backendHealthy && paymentOk ? (
                  <ShieldCheck size={23} />
                ) : backendChecking ? (
                  <LockKeyhole size={23} />
                ) : (
                  <AlertCircle size={23} />
                )}
              </span>

              <div>
                <p className="text-base font-semibold text-[#211a3b]">
                  {footerLabel}
                </p>

                <p className="mt-1 text-base text-slate-600">
                  {lastCheckedAt
                    ? `Last backend check: ${new Date(
                        lastCheckedAt
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Waiting for backend health verification"}
                </p>

                {paymentCheckedAt && !paymentOk && paymentKnown && (
                  <p className="mt-1 text-base text-amber-800">
                    Payment service checked at {paymentCheckedAt}
                  </p>
                )}
              </div>
            </div>

            <p className="text-base text-slate-600">
              © {new Date().getFullYear()} SHCom. All rights reserved.
            </p>
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
