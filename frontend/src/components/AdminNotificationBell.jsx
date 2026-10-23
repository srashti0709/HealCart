
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, ChevronRight } from "lucide-react";
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
        className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:bg-slate-100"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(360px,90vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="font-bold">Notifications</h3>
              <p className="text-xs text-slate-500">
                {unreadCount} unread purchase messages
              </p>
            </div>
            <Bell size={18} className="text-slate-400" />
          </div>

          {error && (
            <p className="px-4 py-3 text-sm text-red-600">{error}</p>
          )}

          {!error && recentNotifications.length === 0 && (
            <div className="px-5 py-8 text-center">
              <Bell className="mx-auto text-slate-300" size={28} />
              <p className="mt-2 text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-xs text-slate-500">
                New purchases will appear here.
              </p>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {recentNotifications.map((notification) => (
              <button
                key={notification._id}
                type="button"
                onClick={() => markRead(notification)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                  notification.readAt ? "" : "bg-emerald-50/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      notification.readAt
                        ? "bg-slate-300"
                        : "bg-emerald-600"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {notification.title}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {notification.items
                        ?.map((item) => `${item.name} × ${item.quantity}`)
                        .join(", ")}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      ₹{Number(notification.totalAmount).toLocaleString("en-IN")}
                      {" · "}
                      {new Date(notification.createdAt).toLocaleString()}
                    </span>
                  </span>
                  {!notification.readAt && (
                    <Check size={15} className="mt-1 shrink-0 text-emerald-700" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <Link
            to="/admin/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            See all notifications
            <ChevronRight size={17} />
          </Link>
        </div>
      )}
    </div>
  );
}
