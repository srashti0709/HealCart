import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  RefreshCw,
  ShoppingBag,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  CircleAlert,
  ReceiptText,
  ChevronRight,
  RotateCw,
} from "lucide-react";
import { API_ENDPOINTS } from "../config/api";

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrders = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axios.get(API_ENDPOINTS.orders);
      const data = response.data;

      setOrders(Array.isArray(data) ? data : data.orders || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load orders. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchOrders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const formatDate = (date) => {
    if (!date) return "Date unavailable";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Date unavailable";
    }

    return parsedDate.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const formatStatus = (status) =>
    status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";

  const getStatusStyle = (status) => {
    const normalized = String(status || "").toLowerCase();

    if (
      ["paid", "completed", "delivered", "success", "successful"].includes(
        normalized
      )
    ) {
      return {
        wrapper: "border-emerald-200 bg-emerald-50 text-emerald-800",
        icon: "text-emerald-600",
        Icon: CheckCircle2,
      };
    }

    if (
      ["pending", "processing", "initiated", "created", "in transit"].includes(
        normalized
      )
    ) {
      return {
        wrapper: "border-amber-200 bg-amber-50 text-amber-800",
        icon: "text-amber-600",
        Icon: Clock3,
      };
    }

    if (
      ["failed", "cancelled", "canceled", "rejected", "refunded"].includes(
        normalized
      )
    ) {
      return {
        wrapper: "border-rose-200 bg-rose-50 text-rose-800",
        icon: "text-rose-600",
        Icon: CircleAlert,
      };
    }

    return {
      wrapper: "border-violet-200 bg-violet-50 text-violet-800",
      icon: "text-violet-600",
      Icon: Package,
    };
  };

  const getItemPrice = (item) =>
    Number(item.price ?? item.product?.price ?? 0);

  const getOrderTotal = (order) => {
    if (order.totalAmount !== undefined && order.totalAmount !== null) {
      return Number(order.totalAmount) || 0;
    }

    return (order.items || []).reduce(
      (total, item) =>
        total + getItemPrice(item) * (Number(item.quantity) || 0),
      0
    );
  };

  const formatCurrency = (amount) =>
    `₹${Number(amount || 0).toLocaleString("en-IN")}`;

  const getProductImage = (item) =>
    item.image || item.product?.image || "";

  return (
    <main className="lavender-commerce relative min-h-screen overflow-hidden bg-[#fdf8ff] px-4 py-8 text-[#1d1737] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#e4dfff]/70 via-[#f1ebff]/50 to-transparent blur-3xl" />

      <div className="pointer-events-none absolute right-0 top-[520px] h-72 w-72 rounded-full bg-[#6851ff]/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/"
            className="group inline-flex min-h-11 items-center gap-3 rounded-xl text-base font-semibold text-[#474555] transition-colors hover:text-[#5441db]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#e6deff] transition-colors group-hover:bg-[#e4dfff]">
              <ArrowLeft size={20} />
            </span>
            Continue shopping
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-[#e6deff] bg-white/80 px-4 py-2 text-base font-medium text-[#474555] shadow-sm sm:inline-flex">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Your order records
          </div>
        </div>

        <section className="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-base font-bold uppercase tracking-wider text-[#5441db]">
              <span>Your purchases</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#c6c0ff]" />
              <span className="font-semibold normal-case tracking-normal text-[#787586]">
                SHCom Store
              </span>
            </div>

            <h1 className="font-headline-lg text-4xl font-bold tracking-tight text-[#1d1737] sm:text-5xl">
              Order History
            </h1>

            <p className="mt-4 max-w-xl text-base leading-7 text-[#625e75] sm:text-lg">
              All your purchases, together in one place. Review your order
              details, payment status, and total amount.
            </p>

            {!loading && !error && orders.length > 0 && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#e4dfff] bg-white px-4 py-2 text-base font-semibold text-[#5441db] shadow-sm">
                <ShoppingBag size={19} />
                {orders.length} {orders.length === 1 ? "order" : "orders"}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-xl border border-[#e6deff] bg-white px-5 py-3 text-base font-bold text-[#393153] shadow-sm transition-all hover:border-[#c6c0ff] hover:bg-[#f7f1ff] hover:text-[#5441db] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={20}
              className={loading ? "animate-spin" : ""}
            />
            {loading ? "Refreshing..." : "Refresh orders"}
          </button>
        </section>

        {loading ? (
          <div className="overflow-hidden rounded-3xl border border-[#e6deff] bg-white shadow-sm">
            <div className="border-b border-[#ece4ff] bg-[#f7f1ff] p-6 sm:p-8">
              <div className="h-6 w-44 animate-pulse rounded-lg bg-[#e6deff]" />
              <div className="mt-4 h-5 w-64 max-w-full animate-pulse rounded-lg bg-[#e6deff]" />
            </div>

            <div className="space-y-6 p-6 sm:p-8">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-4"
                >
                  <div className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-[#f1ebff]" />

                  <div className="flex-1 space-y-3">
                    <div className="h-5 w-2/3 animate-pulse rounded-lg bg-[#e6deff]" />
                    <div className="h-5 w-1/3 animate-pulse rounded-lg bg-[#f1ebff]" />
                  </div>

                  <div className="hidden h-6 w-24 animate-pulse rounded-lg bg-[#e6deff] sm:block" />
                </div>
              ))}
            </div>

            <div className="border-t border-[#ece4ff] bg-[#f7f1ff]/70 p-6">
              <p className="text-base font-medium text-[#625e75]">
                Loading your order records...
              </p>
            </div>
          </div>
        ) : error ? (
          <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-9">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <CircleAlert size={28} />
              </div>

              <div className="flex-1">
                <h2 className="text-xl font-bold text-[#1d1737]">
                  We couldn't load your orders
                </h2>

                <p className="mt-2 text-base leading-7 text-[#625e75]">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={fetchOrders}
                  className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#5441db] px-5 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#3d23c5]"
                >
                  <RotateCw size={19} />
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : orders.length === 0 ? (
          <section className="rounded-3xl border border-[#e6deff] bg-white px-6 py-14 text-center shadow-sm sm:px-12 sm:py-20">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#f1ebff] text-[#5441db]">
              <Package size={38} />
            </div>

            <p className="mt-6 text-base font-bold uppercase tracking-wider text-[#5441db]">
              Your purchases
            </p>

            <h2 className="mt-3 text-2xl font-bold text-[#1d1737] sm:text-3xl">
              No orders yet
            </h2>

            <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-[#625e75]">
              Your purchases will appear here after you place an order. Explore
              the store and find something you love.
            </p>

            <Link
              to="/"
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#5441db] px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#3d23c5]"
            >
              <ShoppingBag size={20} />
              Explore products
              <ChevronRight size={20} />
            </Link>
          </section>
        ) : (
          <div className="space-y-7">
            {orders.map((order) => {
              const paymentStyle = getStatusStyle(order.paymentStatus);
              const orderStyle = getStatusStyle(order.orderStatus);
              const PaymentIcon = paymentStyle.Icon;
              const OrderIcon = orderStyle.Icon;
              const items = order.items || [];

              return (
                <article
                  key={order._id}
                  className="overflow-hidden rounded-3xl border border-[#e6deff] bg-white shadow-[0_8px_30px_rgba(61,35,197,0.06)] transition-shadow duration-300 hover:shadow-[0_14px_38px_rgba(61,35,197,0.11)]"
                >
                  <div className="flex flex-col justify-between gap-5 border-b border-[#e6deff] bg-gradient-to-r from-[#f7f1ff] via-white to-[#fdf8ff] p-5 sm:p-7 lg:flex-row lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-[#787586]">
                        <ReceiptText size={19} className="text-[#5441db]" />
                        Order reference
                      </div>

                      <p className="mt-2 break-all font-mono text-base font-bold text-[#1d1737] sm:text-lg">
                        {order._id}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-base text-[#625e75]">
                        <CalendarDays size={19} className="shrink-0 text-[#787586]" />
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 lg:max-w-[50%] lg:justify-end">
                      <span
                        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-base font-bold ${paymentStyle.wrapper}`}
                      >
                        <PaymentIcon size={19} className={paymentStyle.icon} />
                        Payment: {formatStatus(order.paymentStatus)}
                      </span>

                      <span
                        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-base font-bold ${orderStyle.wrapper}`}
                      >
                        <OrderIcon size={19} className={orderStyle.icon} />
                        Order: {formatStatus(order.orderStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 sm:p-7">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ebff] text-[#5441db]">
                        <Package size={21} />
                      </div>

                      <div>
                        <h2 className="text-xl font-bold text-[#1d1737]">
                          Order items
                        </h2>
                        <p className="mt-1 text-base text-[#787586]">
                          {items.length} {items.length === 1 ? "item" : "items"} in this order
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-[#ece4ff]">
                      {items.map((item, index) => {
                        const quantity = Number(item.quantity) || 0;
                        const price = getItemPrice(item);
                        const image = getProductImage(item);

                        return (
                          <div
                            key={item._id || `${order._id}-${index}`}
                            className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-start gap-4">
                              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#e6deff] bg-[#f7f1ff] p-2 sm:h-24 sm:w-24">
                                {image ? (
                                  <img
                                    src={image}
                                    alt={item.name || item.product?.name || "Ordered product"}
                                    className="h-full w-full rounded-xl object-contain"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <ShoppingBag
                                    size={34}
                                    className="text-[#a49bd6]"
                                  />
                                )}
                              </div>

                              <div className="min-w-0 flex-1 pt-1">
                                <h3 className="break-words text-lg font-bold leading-7 text-[#1d1737]">
                                  {item.name || item.product?.name || "Product"}
                                </h3>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#f1ebff] px-3 py-2 text-base font-semibold text-[#474555]">
                                    <Package size={17} className="text-[#5441db]" />
                                    Quantity: {quantity}
                                  </span>

                                  <span className="inline-flex min-h-9 items-center rounded-lg bg-[#faf8ff] px-3 py-2 text-base font-medium text-[#625e75]">
                                    {formatCurrency(price)} each
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[#f1ebff] pt-3 sm:min-w-36 sm:flex-col sm:items-end sm:justify-center sm:border-0 sm:pt-0">
                              <span className="text-base font-medium text-[#787586] sm:text-right">
                                Item subtotal
                              </span>

                              <span className="text-xl font-bold text-[#1d1737]">
                                {formatCurrency(price * quantity)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-[#e6deff] bg-[#f7f1ff]/70 p-5 sm:p-7">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#5441db] shadow-sm ring-1 ring-[#e6deff]">
                          <CreditCard size={22} />
                        </div>

                        <div>
                          <p className="text-base font-semibold text-[#625e75]">
                            Payment summary
                          </p>
                          <p className="mt-1 text-base leading-6 text-[#787586]">
                            Total amount recorded for this order
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-6 rounded-2xl border border-[#e4dfff] bg-white px-5 py-4 shadow-sm sm:min-w-64 sm:flex-col sm:items-stretch sm:gap-2">
                        <span className="text-base font-semibold text-[#625e75]">
                          Total amount
                        </span>

                        <span className="text-2xl font-bold tracking-tight text-[#5441db] sm:text-3xl">
                          {formatCurrency(getOrderTotal(order))}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-[#e6deff] bg-white/80 px-5 py-4 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ebff] text-[#5441db]">
              <RefreshCw size={19} />
            </div>

            <p className="text-base leading-6 text-[#625e75]">
              Need the latest order details? Use Refresh orders to fetch them again.
            </p>
          </div>

          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-base font-bold text-[#5441db] transition-colors hover:bg-[#f1ebff]"
          >
            Back to store
            <ChevronRight size={19} />
          </Link>
        </div>
      </div>
    </main>
  );
};

export default OrderHistory;