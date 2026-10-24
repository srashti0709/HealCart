
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  ShoppingBag,
  RefreshCw,
  Activity,
  LogOut,
  Package,
  Check,
  Clock3,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadNotifications = useCallback(async (manualRefresh = false) => {
    if (manualRefresh) setRefreshing(true);

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

      if (manualRefresh) {
        setNotice("Notifications refreshed successfully.");
      }
    } catch (error) {
      if (
        error.response?.status === 401 ||
        error.response?.status === 403
      ) {
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();

    const interval = window.setInterval(() => {
      loadNotifications();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  const markAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;

    setMarkingAll(true);
    setError("");
    setNotice("");

    try {
      const token = localStorage.getItem("shcomAdminToken");

      if (!token) {
        setError("Admin login required. Please sign in again.");
        return;
      }

      await axios.patch(
        `${API_BASE_URL}/api/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await loadNotifications();
      setNotice("All notifications marked as read.");
    } catch {
      setError("Could not mark notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  const markRead = async (id) => {
    if (updatingId) return;

    setUpdatingId(id);
    setError("");
    setNotice("");

    try {
      const token = localStorage.getItem("shcomAdminToken");

      if (!token) {
        setError("Admin login required. Please sign in again.");
        return;
      }

      await axios.patch(
        `${API_BASE_URL}/api/notifications/${id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await loadNotifications();
      setNotice("Notification marked as read.");
    } catch {
      setError("Could not update this notification.");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (date) => {
    if (!date) return "Date unavailable";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Date unavailable";
    }

    return parsedDate.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getOrderReference = (orderId) => {
    if (!orderId) return "Unavailable";
    return String(orderId).slice(-8).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#f7f6fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-200">
              <Package size={25} />
            </span>

            <span>
              <span className="block text-xl font-bold tracking-tight text-slate-900">
                SHCom Admin
              </span>
              <span className="mt-0.5 block text-base text-slate-600">
                Product management
              </span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-base font-medium">
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
            >
              <Package size={19} />
              Products
            </Link>

            <Link
              to="/admin/notifications"
              className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-800 transition hover:bg-violet-100"
            >
              <Bell size={19} />
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-violet-700 px-1.5 text-base font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>

            <Link
              to="/admin/command-center"
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
            >
              <Activity size={19} />
              Command Center
            </Link>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("shcomAdminToken");
                window.location.reload();
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut size={19} />
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-7 px-5 py-8 sm:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-3xl border border-violet-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-violet-100/80 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-48 h-56 w-56 rounded-full bg-purple-100/70 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="flex items-start gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-800">
                <Bell size={29} />
              </span>

              <div>
                <p className="mb-2 text-base font-semibold uppercase tracking-[0.16em] text-violet-800">
                  Admin inbox
                </p>

                <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                  Notifications
                </h1>

                <p className="mt-3 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                  Keep track of customer purchases and review new orders from
                  your store.
                </p>
              </div>
            </div>

            <div className="relative flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => loadNotifications(true)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={20}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0 || markingAll || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingAll ? (
                  <RefreshCw size={20} className="animate-spin" />
                ) : (
                  <CheckCheck size={20} />
                )}
                {markingAll ? "Updating..." : "Mark all read"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="group rounded-2xl border border-violet-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-100/70">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-medium text-slate-600">
                  Unread messages
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-4xl font-bold tracking-tight text-violet-800">
                    {unreadCount}
                  </p>

                  <span
                    className={`rounded-full px-3 py-2 text-base font-semibold ${
                      unreadCount > 0
                        ? "border border-violet-200 bg-violet-50 text-violet-800"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {unreadCount > 0 ? "Needs review" : "All caught up"}
                  </span>
                </div>

                <p className="mt-2 text-base text-slate-600">
                  {unreadCount > 0
                    ? "Purchase notifications awaiting review"
                    : "No unread notifications right now"}
                </p>
              </div>

              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-800 transition group-hover:bg-violet-700 group-hover:text-white">
                <Bell size={27} />
              </span>
            </div>
          </div>

          <div className="group rounded-2xl border border-violet-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-100/70">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-medium text-slate-600">
                  Purchase notifications
                </p>

                <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
                  {notifications.length}
                </p>

                <p className="mt-2 text-base text-slate-600">
                  Total notifications received
                </p>
              </div>

              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-purple-100 text-purple-800 transition group-hover:bg-purple-700 group-hover:text-white">
                <ShoppingBag size={27} />
              </span>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-base text-red-800"
          >
            <AlertCircle size={22} className="mt-0.5 shrink-0" />
            <p className="flex-1 leading-6">{error}</p>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-base text-emerald-800"
          >
            <Check size={22} className="mt-0.5 shrink-0" />
            <p className="flex-1 leading-6">{notice}</p>

            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notification message"
              className="rounded-lg p-1 transition hover:bg-emerald-100"
            >
              <span className="text-xl">×</span>
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-violet-100 px-6 py-6 sm:flex-row sm:items-center sm:px-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                All notifications
              </h2>

              <p className="mt-2 text-base text-slate-600">
                New purchases appear automatically.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-base font-medium text-violet-800">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
              Automatic refresh every 10 seconds
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-violet-100 text-violet-800">
                <RefreshCw size={29} className="animate-spin" />
              </span>

              <p className="mt-5 text-lg font-semibold text-slate-800">
                Loading notifications
              </p>

              <p className="mt-2 text-base text-slate-600">
                Retrieving your purchase notifications...
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <span className="grid h-20 w-20 place-items-center rounded-3xl bg-violet-100 text-violet-700">
                <Inbox size={36} />
              </span>

              <h3 className="mt-5 text-xl font-bold text-slate-900">
                No purchase notifications yet
              </h3>

              <p className="mt-2 max-w-md text-base leading-7 text-slate-600">
                Notifications will appear here when a purchase is successfully
                placed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-violet-100">
              {notifications.map((notification) => {
                const isUnread = !notification.readAt;
                const isUpdating = updatingId === notification._id;

                return (
                  <article
                    key={notification._id}
                    className={`relative flex flex-col gap-5 px-6 py-6 transition-colors sm:flex-row sm:items-start sm:justify-between sm:px-8 ${
                      isUnread
                        ? "bg-violet-50/60 hover:bg-violet-50"
                        : "bg-white hover:bg-slate-50/70"
                    }`}
                  >
                    {isUnread && (
                      <span className="absolute bottom-0 left-0 top-0 w-1 rounded-r-full bg-violet-600" />
                    )}

                    <div className="flex min-w-0 items-start gap-4">
                      <span
                        className={`relative mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                          isUnread
                            ? "bg-violet-100 text-violet-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <ShoppingBag size={23} />

                        {isUnread && (
                          <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-violet-600" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-lg font-semibold leading-7 text-slate-900">
                            {notification.title || "Purchase notification"}
                          </h3>

                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-base font-semibold ${
                              isUnread
                                ? "border-violet-200 bg-violet-100 text-violet-800"
                                : "border-slate-200 bg-slate-100 text-slate-700"
                            }`}
                          >
                            {isUnread ? (
                              <>
                                <span className="h-2 w-2 rounded-full bg-violet-600" />
                                New
                              </>
                            ) : (
                              <>
                                <Check size={17} />
                                Read
                              </>
                            )}
                          </span>
                        </div>

                        {notification.items?.length > 0 && (
                          <p className="mt-2 break-words text-base leading-7 text-slate-600">
                            {notification.items
                              .map(
                                (item) =>
                                  `${item.name} × ${item.quantity}`
                              )
                              .join(", ")}
                          </p>
                        )}

                        <p className="mt-3 text-lg font-bold text-violet-800">
                          Total: ₹
                          {Number(notification.totalAmount || 0).toLocaleString(
                            "en-IN"
                          )}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-base text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <Package
                              size={18}
                              className="shrink-0 text-violet-700"
                            />
                            Order reference:{" "}
                            <span className="font-semibold text-slate-800">
                              {getOrderReference(notification.orderId)}
                            </span>
                          </span>

                          <span className="inline-flex items-center gap-2">
                            <Clock3
                              size={18}
                              className="shrink-0 text-violet-700"
                            />
                            {formatDate(notification.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => markRead(notification._id)}
                        disabled={Boolean(updatingId) || markingAll}
                        className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-violet-200 bg-white px-4 py-3 text-base font-semibold text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60 sm:self-center"
                      >
                        {isUpdating ? (
                          <RefreshCw
                            size={19}
                            className="animate-spin"
                          />
                        ) : (
                          <Check size={19} />
                        )}

                        {isUpdating ? "Updating..." : "Mark as read"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {!loading && notifications.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 bg-[#faf9fe] px-6 py-4 sm:px-8">
              <p className="text-base text-slate-600">
                Showing {notifications.length}{" "}
                {notifications.length === 1
                  ? "notification"
                  : "notifications"}
              </p>

              <p className="inline-flex items-center gap-2 text-base font-medium text-slate-700">
                <Activity size={18} className="text-violet-700" />
                {unreadCount} unread
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
