import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { ArrowLeft, Package, RefreshCw } from "lucide-react";
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

    return new Date(date).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const formatStatus = (status) =>
    status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";

  return (
    <main className="lavender-commerce min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} />
          Continue shopping
        </Link>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
              Your purchases
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Order History
            </h1>
            <p className="mt-2 text-slate-500">
              Review your orders and payment status.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Loading orders...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">{error}</p>
            <button
              onClick={fetchOrders}
              className="mt-3 font-semibold text-red-700 underline"
            >
              Try again
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
            <Package size={42} className="mx-auto text-slate-400" />
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              No orders yet
            </h2>
            <p className="mt-2 text-slate-500">
              Your completed purchases will appear here.
            </p>
            <Link
              to="/"
              className="mt-5 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700"
            >
              Explore products
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => (
              <section
                key={order._id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-wrap justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Order ID
                    </p>
                    <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-800">
                      {order._id}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap content-start gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Payment: {formatStatus(order.paymentStatus)}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                      Order: {formatStatus(order.orderStatus)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 py-4">
                  {(order.items || []).map((item, index) => (
                    <div
                      key={item._id || `${order._id}-${index}`}
                      className="flex items-start justify-between gap-4"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {item.name || item.product?.name || "Product"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Quantity: {item.quantity}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-slate-800">
                        ₹
                        {(
                          (item.price || item.product?.price || 0) *
                          item.quantity
                        ).toLocaleString("en-IN")}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="font-semibold text-slate-600">
                    Total amount
                  </span>
                  <span className="text-xl font-bold text-slate-900">
                    ₹{Number(order.totalAmount || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default OrderHistory;