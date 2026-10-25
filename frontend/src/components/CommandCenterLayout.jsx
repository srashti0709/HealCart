
import { Link, NavLink } from "react-router-dom";
import AdminNotificationBell from "./AdminNotificationBell";
import {
  LayoutDashboard,
  AlertTriangle,
  Activity,
  Workflow,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

const navigation = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    href: "/admin/command-center/overview",
  },
  {
    label: "Incidents",
    icon: AlertTriangle,
    href: "/admin/command-center/incidents",
  },
  {
    label: "Chaos Center",
    icon: Workflow,
    href: "/admin/command-center/chaos-center",
  },
];

export default function CommandCenterLayout({ children }) {
  return (
    <div className="cc-bg cc-text min-h-screen text-primary md:flex">
      <aside className="flex w-full shrink-0 flex-col border-b border-border cc-border p-6 md:sticky md:top-0 md:h-screen md:w-72 md:border-b-0 md:border-r cc-sidebar">
        <div className="flex items-center gap-3 border-b border-border cc-border p-6">
          <div className="rounded-2xl bg-[var(--cc-lime)]/10 p-3 text-[var(--cc-lime)]">
            <ShieldCheck size={28} />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-wide text-primary">HealCart</h1>
            <p className="mt-1 text-xs text-secondary">
              Self-Healing Commerce
            </p>
          </div>
        </div>

        <div className="p-5">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
            Command Center
          </p>

          <nav className="space-y-1">
            {navigation.map(({ label, icon: Icon, href }) => (
              <NavLink
                key={label}
                to={href}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-4 text-base transition ${
                    isActive
                      ? "bg-[var(--cc-lime)]/10 text-[var(--cc-lime)] ring-1 ring-inset ring-[var(--cc-lime)]/20"
                      : "text-secondary hover:bg-[var(--cc-raised)] hover:text-primary"
                  }`
                }
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto hidden p-5 md:block">
          <div className="rounded-2xl border border-border bg-[var(--cc-raised)] p-5">
            <div className="flex items-center gap-2 text-base font-medium">
              <Activity size={18} className="text-[var(--cc-lime)]" />
              Resilience Platform
            </div>

            <p className="mt-2 text-xs leading-5 text-secondary">
              Monitor failures, recovery actions and service availability.
            </p>
          </div>

          <Link
            to="/"
            className="mt-5 flex items-center gap-2 rounded-2xl px-4 py-4 text-base text-secondary transition hover:bg-[var(--cc-raised)] hover:text-primary"
          >
            <ArrowLeft size={18} />
            Back to Storefront
          </Link>
        </div>

        <div className="p-5 md:hidden">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-2xl px-4 py-4 text-base text-secondary transition hover:bg-[var(--cc-raised)] hover:text-primary"
          >
            <ArrowLeft size={18} />
            Back to Storefront
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
