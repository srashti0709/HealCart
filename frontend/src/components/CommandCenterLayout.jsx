import { Link } from "react-router-dom";
import AdminNotificationBell from "./AdminNotificationBell";
import {
  LayoutDashboard,
  Server,
  AlertTriangle,
  Activity,
  Workflow,
  ArrowLeft,
  ShieldCheck,
  Gauge,
} from "lucide-react";

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "#overview" },
  { label: "Service Health", icon: Server, href: "#service-health" },
  { label: "Incidents", icon: AlertTriangle, href: "#incidents" },
  { label: "Recovery Analytics", icon: Activity, href: "#recovery-analytics" },
  { label: "Recovery Metrics", icon: Workflow, href: "#recovery-metrics" },
  { label: "Chaos Control Center", icon: Workflow, href: "#chaos-control" },
  { label: "Synthetic Traffic", icon: Gauge, href: "#synthetic-traffic" },
];

export default function CommandCenterLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 md:flex">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-800 bg-[#0d1320] md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 border-b border-slate-800 p-6">
          <div className="rounded-xl bg-cyan-400/10 p-2.5 text-cyan-400">
            <ShieldCheck size={27} />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-wide">SHCom</h1>
            <p className="mt-1 text-xs text-slate-400">
              Self-Healing Commerce
            </p>
          </div>
        </div>

        <div className="p-4">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Monitoring
          </p>

          <nav className="space-y-1">
            {navigation.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  const target = document.getElementById(href.replace("#", ""));
                  target?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <Icon size={18} />
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-auto hidden p-4 md:block">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity size={16} className="text-cyan-400" />
              Resilience Platform
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Monitor failures, recovery actions and service availability.
            </p>
          </div>

          <Link
            to="/"
            className="mt-4 flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft size={17} />
            Back to Storefront
          </Link>
        </div>

        <div className="p-4 md:hidden">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft size={17} />
            Back to Storefront
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
