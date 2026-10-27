
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
  ArrowUpRight,
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
      const token = localStorage.getItem("healcartAdminToken");

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
        localStorage.removeItem("healcartAdminToken");
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
      const token = localStorage.getItem("healcartAdminToken");

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
      const token = localStorage.getItem("healcartAdminToken");

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
      <header className="sticky top-0 z-30 border-b border-violet-100/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link to="/admin" className="flex shrink-0 items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-md shadow-violet-200/70">
              <Package size={23} />
            </span>

            <span>
              <span className="block text-lg font-bold tracking-tight text-slate-950">
                HealCart
              </span>
              <span className="block text-xs font-medium text-slate-500">
                Administration
              </span>
            </span>
          </Link>

          <nav className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:gap-2">
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-violet-50 hover:text-violet-800 sm:px-4"
            >
              <Package size={17} />
              Products
            </Link>

            <Link
              to="/admin/notifications"
              aria-current="page"
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-800 shadow-sm sm:px-4"
            >
              <Bell size={17} />
              Notifications
              {unreadCount > 0 && (
                <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-violet-700 px-1.5 text-xs font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>

            <Link
              to="/admin/command-center"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-violet-50 hover:text-violet-800 sm:px-4"
            >
              <Activity size={17} />
              <span className="hidden md:inline">Command Center</span>
              <span className="md:hidden">Center</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("healcartAdminToken");
                window.location.reload();
              }}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:ml-0 sm:px-4"
            >
              <LogOut size={17} />
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
        <section className="relative isolate overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-violet-100/80 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-1/3 -z-10 h-56 w-56 rounded-full bg-purple-100/70 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:p-9">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700 sm:h-14 sm:w-14">
                <Bell size={25} />
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">
                    Admin workspace
                  </span>
                  <span className="h-1 w-1 rounded-full bg-violet-300" />
                  <span className="text-xs font-medium text-slate-500">
                    Store activity
                  </span>
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-[42px]">
                  Notifications
                </h1>

                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  Stay up to date with customer purchases and keep track of
                  incoming orders from your store.
                </p>

                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Automatic updates enabled
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 lg:shrink-0">
              <button
                type="button"
                onClick={() => loadNotifications(true)}
                disabled={refreshing}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={17}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0 || markingAll || loading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-200/70 transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingAll ? (
                  <RefreshCw size={17} className="animate-spin" />
                ) : (
                  <CheckCheck size={17} />
                )}
                {markingAll ? "Updating..." : "Mark all as read"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500">
                  Unread notifications
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-4xl font-bold tracking-tight text-slate-950 tabular-nums">
                    {unreadCount}
                  </p>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      unreadCount > 0
                        ? "border-violet-200 bg-violet-50 text-violet-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {unreadCount > 0 ? (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                        Needs attention
                      </>
                    ) : (
                      <>
                        <Check size={13} />
                        All caught up
                      </>
                    )}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-500">
                  {unreadCount > 0
                    ? "Purchases waiting for your review"
                    : "You have no unread notifications"}
                </p>
              </div>

              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                <Bell size={23} />
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500">
                  Total notifications
                </p>

                <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950 tabular-nums">
                  {notifications.length}
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  All purchase notifications received
                </p>
              </div>

              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-purple-50 text-purple-700">
                <ShoppingBag size={23} />
              </span>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800"
          >
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <p className="flex-1 leading-6">{error}</p>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800"
          >
            <Check size={19} className="mt-0.5 shrink-0" />
            <p className="flex-1 leading-6">{notice}</p>

            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notification message"
              className="rounded-lg p-1 transition hover:bg-emerald-100"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-[24px] border border-violet-100 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-7 sm:py-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                  All notifications
                </h2>
                {!loading && notifications.length > 0 && (
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {notifications.length}
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-sm text-slate-500">
                Review purchase activity and notification status.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              <RefreshCw size={14} className="text-violet-600" />
              Refreshes every 10 seconds
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center px-5 py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                <RefreshCw size={25} className="animate-spin" />
              </span>

              <p className="mt-4 text-base font-semibold text-slate-800">
                Loading notifications
              </p>

              <p className="mt-1.5 text-sm text-slate-500">
                Retrieving your latest purchase activity...
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-20 text-center">
              <span className="grid h-[72px] w-[72px] place-items-center rounded-3xl border border-violet-100 bg-violet-50 text-violet-600">
                <Inbox size={32} strokeWidth={1.7} />
              </span>

              <h3 className="mt-5 text-lg font-bold text-slate-900">
                No purchase notifications yet
              </h3>

              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                When a purchase is successfully placed, its notification will
                appear here automatically.
              </p>

              <Link
                to="/admin"
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-800 transition hover:bg-violet-50"
              >
                View products
                <ArrowUpRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => {
                const isUnread = !notification.readAt;
                const isUpdating = updatingId === notification._id;

                return (
                  <article
                    key={notification._id}
                    className={`relative px-4 py-5 transition-colors sm:px-6 sm:py-6 lg:px-7 ${
                      isUnread
                        ? "bg-violet-50/40 hover:bg-violet-50/80"
                        : "bg-white hover:bg-slate-50/70"
                    }`}
                  >
                    {isUnread && (
                      <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-violet-600" />
                    )}

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
                        <span
                          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12 ${
                            isUnread
                              ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <ShoppingBag size={21} />

                          {isUnread && (
                            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-violet-600" />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words text-base font-semibold leading-6 text-slate-900 sm:text-[17px]">
                              {notification.title || "Purchase notification"}
                            </h3>

                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                isUnread
                                  ? "border-violet-200 bg-violet-100 text-violet-800"
                                  : "border-slate-200 bg-white text-slate-500"
                              }`}
                            >
                              {isUnread ? (
                                <>
                                  <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                                  Unread
                                </>
                              ) : (
                                <>
                                  <Check size={13} />
                                  Read
                                </>
                              )}
                            </span>
                          </div>

                          {notification.items?.length > 0 && (
                            <p className="mt-2 break-words text-sm leading-6 text-slate-600">
                              {notification.items
                                .map(
                                  (item) =>
                                    `${item.name} × ${item.quantity}`
                                )
                                .join(", ")}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span className="text-xs font-medium text-slate-500">
                              Order total
                            </span>
                            <span className="text-lg font-bold tracking-tight text-violet-800">
                              ₹
                              {Number(
                                notification.totalAmount || 0
                              ).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-col gap-2.5 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <Package
                                size={15}
                                className="shrink-0 text-violet-600"
                              />
                              <span>Order</span>
                              <span className="break-all font-semibold text-slate-700">
                                #{getOrderReference(notification.orderId)}
                              </span>
                            </span>

                            <span className="inline-flex items-center gap-2">
                              <Clock3
                                size={15}
                                className="shrink-0 text-violet-600"
                              />
                              <span>{formatDate(notification.createdAt)}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => markRead(notification._id)}
                          disabled={Boolean(updatingId) || markingAll}
                          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-violet-200 bg-white px-3.5 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60 sm:self-center"
                        >
                          {isUpdating ? (
                            <RefreshCw
                              size={16}
                              className="animate-spin"
                            />
                          ) : (
                            <Check size={16} />
                          )}

                          {isUpdating ? "Updating..." : "Mark as read"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && notifications.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-[#fbfaff] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-xs font-medium text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {notifications.length}
                </span>{" "}
                {notifications.length === 1
                  ? "notification"
                  : "notifications"}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-violet-600" />
                  {unreadCount} unread
                </span>

                <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Check size={14} className="text-emerald-600" />
                  {notifications.length - unreadCount} read
                </span>
              </div>
            </div>
          )}
        </section>

        <footer className="flex flex-col items-start justify-between gap-2 px-1 pb-2 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span>HealCart Admin · Notification Center</span>
          <span className="inline-flex items-center gap-1.5">
            <Activity size={14} className="text-violet-600" />
            Live notification polling enabled
          </span>
        </footer>
      </main>
    </div>
  );
}
