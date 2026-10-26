
import { Link, NavLink } from "react-router-dom";
import AdminNotificationBell from "./AdminNotificationBell";
import {
  LayoutDashboard,
  AlertTriangle,
  Activity,
  Workflow,
  ArrowLeft,
  ShieldCheck,
  ChevronRight,
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
      <aside className="cc-sidebar relative flex w-full shrink-0 flex-col overflow-hidden border-b border-border cc-border p-4 sm:p-5 md:sticky md:top-0 md:h-screen md:w-80 md:border-b-0 md:border-r md:p-5 lg:w-[21rem]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at 12% 0%, rgba(222,237,0,0.10), transparent 68%)",
          }}
        />

        <div className="relative flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_12px_30px_rgba(0,0,0,0.18)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--cc-lime)]/20 bg-[linear-gradient(145deg,rgba(222,237,0,0.18),rgba(222,237,0,0.045))] text-[var(--cc-lime)] shadow-[0_5px_16px_rgba(222,237,0,0.08),inset_0_1px_0_rgba(255,255,255,0.12)]">
            <ShieldCheck size={27} strokeWidth={1.8} />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-[1.65rem] font-bold leading-none tracking-[-0.045em] text-primary">
              HealCart
            </h1>
            <p className="mt-2 text-[11px] font-medium tracking-[0.13em] text-secondary">
              SELF-HEALING COMMERCE
            </p>
          </div>

          <div className="hidden sm:block md:hidden">
            <AdminNotificationBell />
          </div>
        </div>

        <div className="relative mt-8 px-1 sm:mt-9">
          <div className="mb-3 flex items-center px-3">
            <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/80">
              Command Center
            </p>
          </div>

          <nav
            aria-label="Command Center navigation"
            className="space-y-2"
          >
            {navigation.map(({ label, icon: Icon, href }) => (
              <NavLink
                key={label}
                to={href}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3.5 overflow-hidden rounded-2xl border px-4 py-[1.05rem] text-[14px] font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-lime)]/60 ${
                    isActive
                      ? "border-[var(--cc-lime)]/25 bg-[linear-gradient(135deg,rgba(222,237,0,0.13),rgba(222,237,0,0.045))] text-[var(--cc-lime)] shadow-[0_8px_20px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.07)]"
                      : "border-transparent text-secondary hover:-translate-y-0.5 hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-primary hover:shadow-[0_8px_18px_rgba(0,0,0,0.16)]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-[var(--cc-lime)] shadow-[0_0_12px_rgba(222,237,0,0.55)]" />
                    )}

                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                        isActive
                          ? "bg-[var(--cc-lime)]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                          : "bg-white/[0.035] text-secondary group-hover:bg-white/[0.07] group-hover:text-primary"
                      }`}
                    >
                      <Icon size={19} strokeWidth={1.8} />
                    </span>

                    <span className="flex-1">{label}</span>

                    <ChevronRight
                      size={16}
                      className={`transition-all duration-200 ${
                        isActive
                          ? "translate-x-0 text-[var(--cc-lime)] opacity-100"
                          : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="relative mt-8 flex flex-col gap-3 md:mt-auto md:pt-6">
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.055] p-5 shadow-[0_16px_38px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.075] hover:shadow-[0_20px_42px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-80"
              style={{
                background:
                  "radial-gradient(ellipse at 0% 0%, rgba(222,237,0,0.09), transparent 65%), linear-gradient(145deg, rgba(255,255,255,0.025), transparent 70%)",
              }}
            />

            <div className="relative flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--cc-lime)]/20 bg-[var(--cc-lime)]/[0.09] text-[var(--cc-lime)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Activity size={21} strokeWidth={1.8} />
              </div>

              <div className="min-w-0">
                <p className="text-[15px] font-semibold tracking-[-0.015em] text-primary">
                  Resilience Platform
                </p>

                <p className="mt-1.5 flex items-center gap-2 text-[12px] font-medium text-secondary">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                  Recovery monitoring enabled
                </p>
              </div>
            </div>

            <p className="relative mt-4 border-t border-white/[0.09] pt-3 text-[13px] leading-[1.8] text-secondary">
              Monitor failures, recovery actions and service availability from one place.
            </p>
          </div>

          <Link
            to="/"
            className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3.5 text-[13px] font-medium text-secondary transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.055] hover:text-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] transition-colors group-hover:bg-white/[0.08]">
              <ArrowLeft size={17} />
            </span>
            <span>Back to Storefront</span>
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
