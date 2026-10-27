
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
    <main className="min-h-screen bg-[#fdfaff] px-4 py-6 text-[#1d1737] sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-[#5441db] transition-colors hover:text-[#3d23c5]"
          >
            <ArrowLeft size={19} />
            Continue shopping
          </Link>

          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#e6deff] bg-white px-4 py-2 text-sm font-semibold text-[#5441db] transition-colors hover:bg-[#f4f0ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={17}
              className={loading ? "animate-spin" : ""}
            />
            {loading ? "Refreshing..." : "Refresh orders"}
          </button>
        </div>

        <section className="mb-8">
          <p className="mb-2 text-sm font-semibold text-[#5441db]">
            HealCart Store
          </p>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Order History
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#625e75] sm:text-base">
            View your purchases, check order and payment statuses, and review
            your order totals.
          </p>

          {!loading && !error && orders.length > 0 && (
            <p className="mt-4 text-sm font-medium text-[#625e75]">
              {orders.length} {orders.length === 1 ? "order" : "orders"} found
            </p>
          )}
        </section>

        {loading ? (
          <div className="rounded-2xl border border-[#e6deff] bg-white p-6">
            <div className="flex items-center gap-3">
              <RefreshCw
                size={22}
                className="animate-spin text-[#5441db]"
              />
              <p className="text-sm font-medium text-[#625e75]">
                Loading your orders...
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex gap-4 rounded-xl border border-[#f0ebff] p-4"
                >
                  <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-[#f1ebff]" />
                  <div className="flex-1 space-y-3 py-1">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[#e6deff]" />
                    <div className="h-4 w-1/3 animate-pulse rounded bg-[#f1ebff]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <section className="rounded-2xl border border-rose-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <CircleAlert
                size={24}
                className="mt-1 shrink-0 text-rose-600"
              />

              <div>
                <h2 className="text-lg font-bold">
                  Couldn't load your orders
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#625e75]">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={fetchOrders}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#5441db] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3d23c5]"
                >
                  <RotateCw size={17} />
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : orders.length === 0 ? (
          <section className="rounded-2xl border border-[#e6deff] bg-white px-6 py-12 text-center sm:py-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f1ebff] text-[#5441db]">
              <Package size={30} />
            </div>

            <h2 className="mt-5 text-xl font-bold sm:text-2xl">
              No orders yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#625e75]">
              Your purchases will appear here after you place an order. Explore
              the store to find something you love.
            </p>

            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5441db] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3d23c5]"
            >
              <ShoppingBag size={18} />
              Explore products
              <ChevronRight size={18} />
            </Link>
          </section>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => {
              const paymentStyle = getStatusStyle(order.paymentStatus);
              const orderStyle = getStatusStyle(order.orderStatus);
              const PaymentIcon = paymentStyle.Icon;
              const OrderIcon = orderStyle.Icon;
              const items = order.items || [];

              return (
                <article
                  key={order._id}
                  className="overflow-hidden rounded-2xl border border-[#e6deff] bg-white transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 border-b border-[#eee8ff] bg-[#f8f5ff] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#625e75]">
                        <ReceiptText size={18} className="text-[#5441db]" />
                        Order reference
                      </div>

                      <p className="mt-2 break-all font-mono text-sm font-semibold">
                        {order._id}
                      </p>

                      <div className="mt-2 flex items-center gap-2 text-sm text-[#625e75]">
                        <CalendarDays size={16} />
                        {formatDate(order.createdAt)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${paymentStyle.wrapper}`}
                      >
                        <PaymentIcon
                          size={15}
                          className={paymentStyle.icon}
                        />
                        Payment: {formatStatus(order.paymentStatus)}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${orderStyle.wrapper}`}
                      >
                        <OrderIcon size={15} className={orderStyle.icon} />
                        Order: {formatStatus(order.orderStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <Package size={19} className="text-[#5441db]" />
                      <h2 className="font-bold">Order items</h2>
                      <span className="text-sm text-[#787586]">
                        ({items.length})
                      </span>
                    </div>

                    <div className="divide-y divide-[#eee8ff]">
                      {items.map((item, index) => {
                        const quantity = Number(item.quantity) || 0;
                        const price = getItemPrice(item);
                        const image = getProductImage(item);

                        return (
                          <div
                            key={item._id || `${order._id}-${index}`}
                            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-center gap-4">
                              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#eee8ff] bg-[#f8f5ff] p-2">
                                {image ? (
                                  <img
                                    src={image}
                                    alt={
                                      item.name ||
                                      item.product?.name ||
                                      "Ordered product"
                                    }
                                    className="h-full w-full rounded-lg object-contain"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <ShoppingBag
                                    size={26}
                                    className="text-[#a49bd6]"
                                  />
                                )}
                              </div>

                              <div className="min-w-0">
                                <h3 className="break-words font-semibold">
                                  {item.name || item.product?.name || "Product"}
                                </h3>

                                <p className="mt-1 text-sm text-[#625e75]">
                                  Quantity: {quantity} × {formatCurrency(price)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                              <span className="text-sm text-[#787586]">
                                Subtotal
                              </span>
                              <span className="font-bold">
                                {formatCurrency(price * quantity)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-[#eee8ff] bg-[#faf8ff] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm text-[#625e75]">
                      <CreditCard size={18} className="text-[#5441db]" />
                      Total amount
                    </div>

                    <p className="text-2xl font-bold text-[#5441db]">
                      {formatCurrency(getOrderTotal(order))}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6deff] pt-5">
          <p className="text-sm text-[#625e75]">
            Your HealCart order details in one place.
          </p>

          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#5441db] transition-colors hover:bg-[#f1ebff]"
          >
            Back to store
            <ChevronRight size={17} />
          </Link>
        </div>
      </div>
    </main>
  );
};

export default OrderHistory;
