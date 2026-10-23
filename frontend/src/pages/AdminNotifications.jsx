
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ShoppingBag, RefreshCw } from "lucide-react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("shcomAdminToken");
      if (!token) {
        setError("Admin login required. Please sign in again.");
        setLoading(false);
        return;
      }

      const response = await axios.get(
        `${API_BASE_URL}/api/notifications`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        }
      );

      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
      setError("");
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem("shcomAdminToken");
        window.location.href = "/admin";
        return;
      }

      setError(
        error.response?.data?.message ||
          "Could not load notifications. Please check your admin login and backend."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 10000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  const markAllRead = async () => {
    try {
      const token = localStorage.getItem("shcomAdminToken");

      await axios.patch(
        `${API_BASE_URL}/api/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await loadNotifications();
    } catch {
      setError("Could not mark notifications as read.");
    }
  };

  const markRead = async (id) => {
    try {
      const token = localStorage.getItem("shcomAdminToken");

      await axios.patch(
        `${API_BASE_URL}/api/notifications/${id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await loadNotifications();
    } catch {
      setError("Could not update this notification.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
              Admin inbox
            </p>
            <h1 className="mt-2 text-3xl font-bold">Notifications</h1>
            <p className="mt-2 text-slate-500">
              Messages about purchases made in your store.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadNotifications}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          </div>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-emerald-100 p-3 text-emerald-800">
                <Bell size={22} />
              </span>
              <div>
                <p className="text-sm text-slate-500">Unread messages</p>
                <p className="text-2xl font-bold">{unreadCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-blue-100 p-3 text-blue-800">
                <ShoppingBag size={22} />
              </span>
              <div>
                <p className="text-sm text-slate-500">Purchase notifications</p>
                <p className="text-2xl font-bold">{notifications.length}</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold">All notifications</h2>
            <p className="mt-1 text-sm text-slate-500">
              New purchases appear automatically.
            </p>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-500">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="mx-auto text-slate-300" size={36} />
              <h3 className="mt-4 font-semibold">No purchase notifications yet</h3>
              <p className="mt-2 text-sm text-slate-500">
                Notifications will appear here when a purchase is successfully placed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <article
                  key={notification._id}
                  className={`flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between ${
                    notification.readAt ? "" : "bg-emerald-50/50"
                  }`}
                >
                  <div className="flex gap-3">
                    <span className="mt-1 rounded-xl bg-emerald-100 p-3 text-emerald-800">
                      <ShoppingBag size={20} />
                    </span>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          {notification.title}
                        </h3>
                        {!notification.readAt && (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                            New
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-slate-600">
                        {notification.items
                          ?.map((item) => `${item.name} × ${item.quantity}`)
                          .join(", ")}
                      </p>

                      <p className="mt-2 text-sm font-semibold">
                        Total: ₹
                        {Number(notification.totalAmount).toLocaleString("en-IN")}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Order reference: {String(notification.orderId).slice(-8).toUpperCase()}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {!notification.readAt && (
                    <button
                      type="button"
                      onClick={() => markRead(notification._id)}
                      className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
                    >
                      Mark as read
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
