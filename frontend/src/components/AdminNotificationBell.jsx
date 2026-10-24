
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Check,
  ChevronRight,
  ShoppingBag,
  Clock3,
  AlertCircle,
  Inbox,
} from "lucide-react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  const loadNotifications = async () => {
    try {
      const token = localStorage.getItem("shcomAdminToken");
      if (!token) return;

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
    } catch {
      setError("Notifications could not be loaded.");
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 10000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);

    return () =>
      document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const markRead = async (notification) => {
    if (notification.readAt) return;

    try {
      const token = localStorage.getItem("shcomAdminToken");

      await axios.patch(
        `${API_BASE_URL}/api/notifications/${notification._id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await loadNotifications();
    } catch {
      setError("Could not mark notification as read.");
    }
  };

  const recentNotifications = notifications.slice(0, 5);

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

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          loadNotifications();
        }}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        aria-haspopup="true"
        className={`relative rounded-xl border p-3 transition focus:outline-none focus:ring-4 focus:ring-violet-100 ${
          open
            ? "border-violet-300 bg-violet-50 text-violet-800"
            : "border-violet-100 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
        }`}
      >
        <Bell size={22} />

        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-violet-700 px-1.5 text-base font-bold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+12px)] z-50 w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-violet-100 bg-white text-slate-900 shadow-2xl shadow-violet-200/50"
        >
          <div className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-violet-50 via-white to-purple-50 px-5 py-5">
            <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-violet-100/80 blur-2xl" />

            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-800">
                  <Bell size={24} />
                </span>

                <div>
                  <h3 className="text-xl font-bold tracking-tight text-slate-950">
                    Notifications
                  </h3>

                  <p className="mt-1 text-base text-slate-600">
                    {unreadCount} unread{" "}
                    {unreadCount === 1
                      ? "purchase notification"
                      : "purchase notifications"}
                  </p>
                </div>
              </div>

              {unreadCount > 0 && (
                <span className="relative shrink-0 rounded-full border border-violet-200 bg-white px-3 py-2 text-base font-semibold text-violet-800">
                  {unreadCount > 99 ? "99+" : unreadCount} new
                </span>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 border-b border-red-100 bg-red-50 px-5 py-4 text-base leading-6 text-red-800"
            >
              <AlertCircle size={21} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {!error && recentNotifications.length === 0 && (
            <div className="flex flex-col items-center px-5 py-9 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                <Inbox size={28} />
              </span>

              <p className="mt-4 text-lg font-semibold text-slate-900">
                No notifications yet
              </p>

              <p className="mt-2 max-w-xs text-base leading-6 text-slate-600">
                New purchases will appear here when an order is successfully
                placed.
              </p>
            </div>
          )}

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {recentNotifications.map((notification) => {
              const isUnread = !notification.readAt;

              return (
                <button
                  key={notification._id}
                  type="button"
                  onClick={() => markRead(notification)}
                  aria-label={`${notification.title || "Purchase notification"}${isUnread ? ", mark as read" : ", already read"}`}
                  className={`block w-full border-b border-violet-50 px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300 ${
                    isUnread
                      ? "bg-violet-50/70 hover:bg-violet-100/70"
                      : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`relative mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                        isUnread
                          ? "bg-violet-100 text-violet-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <ShoppingBag size={21} />

                      {isUnread && (
                        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-violet-600" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="break-words text-base font-semibold leading-6 text-slate-900">
                          {notification.title || "Purchase notification"}
                        </span>

                        {isUnread ? (
                          <span className="shrink-0 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-base font-semibold text-violet-800">
                            New
                          </span>
                        ) : (
                          <Check
                            size={20}
                            className="mt-0.5 shrink-0 text-slate-500"
                          />
                        )}
                      </span>

                      {notification.items?.length > 0 && (
                        <span className="mt-2 block break-words text-base leading-6 text-slate-600">
                          {notification.items
                            .map(
                              (item) => `${item.name} × ${item.quantity}`
                            )
                            .join(", ")}
                        </span>
                      )}

                      <span className="mt-2 block text-lg font-bold text-violet-800">
                        ₹
                        {Number(
                          notification.totalAmount || 0
                        ).toLocaleString("en-IN")}
                      </span>

                      <span className="mt-2 flex items-center gap-2 text-base leading-6 text-slate-600">
                        <Clock3
                          size={17}
                          className="shrink-0 text-violet-700"
                        />
                        {formatDate(notification.createdAt)}
                      </span>

                      {isUnread && (
                        <span className="mt-3 inline-flex items-center gap-2 text-base font-semibold text-violet-800">
                          <Check size={18} />
                          Mark as read
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <Link
            to="/admin/notifications"
            onClick={() => setOpen(false)}
            className="group flex items-center justify-between gap-3 border-t border-violet-100 bg-[#faf9fe] px-5 py-4 text-base font-semibold text-violet-800 transition hover:bg-violet-100"
          >
            <span>See all notifications</span>

            <ChevronRight
              size={21}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>
      )}
    </div>
  );
}
