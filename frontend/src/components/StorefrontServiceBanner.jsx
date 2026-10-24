
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  LoaderCircle,
  ServerCrash,
  ArrowUpRight,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { AVAILABILITY_STATUS } from "../hooks/useBackendAvailability";

const formatTime = (value) => {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
};

export default function StorefrontServiceBanner({
  status,
  recovery,
  verifiedAt,
  lastCheckedAt,
}) {
  if (
    status !== AVAILABILITY_STATUS.UNAVAILABLE &&
    status !== AVAILABILITY_STATUS.RECOVERING &&
    status !== AVAILABILITY_STATUS.RECONNECTED
  ) {
    return null;
  }

  if (status === AVAILABILITY_STATUS.RECONNECTED) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-b border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-violet-50"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-8">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-200 bg-white text-emerald-700 shadow-sm">
            <CheckCircle2 size={25} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-bold text-emerald-900 sm:text-lg">
                Back online and verified
              </p>

              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1.5 text-base font-semibold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Service restored
              </span>
            </div>

            <p className="mt-1 text-base leading-7 text-emerald-900/90">
              The backend health check and the product catalog both responded
              successfully, so the store is serving normally again.
              {verifiedAt ? ` Verified at ${formatTime(verifiedAt)}.` : ""}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center gap-2 text-base font-semibold text-emerald-800">
            <ShieldCheck size={20} />
            Verified
          </span>
        </div>
      </div>
    );
  }

  const isRecovering = status === AVAILABILITY_STATUS.RECOVERING;

  const evidence = recovery?.available
    ? {
        container: recovery.containerStatus,
        health: recovery.containerHealth,
        restarts: recovery.restartCount,
      }
    : null;

  return (
    <div
      role="alert"
      aria-live={isRecovering ? "polite" : "assertive"}
      className={`border-b ${
        isRecovering
          ? "border-amber-200 bg-amber-50"
          : "border-red-200 bg-red-50"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border bg-white shadow-sm ${
              isRecovering
                ? "border-amber-200 text-amber-700"
                : "border-red-200 text-red-700"
            }`}
          >
            {isRecovering ? (
              <LoaderCircle size={25} className="animate-spin" />
            ) : (
              <ServerCrash size={25} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={`text-base font-bold sm:text-lg ${
                  isRecovering ? "text-amber-950" : "text-red-950"
                }`}
              >
                {isRecovering
                  ? "Restoring service"
                  : "The store backend is unavailable"}
              </p>

              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-base font-semibold ${
                  isRecovering
                    ? "border-amber-200 bg-amber-100 text-amber-900"
                    : "border-red-200 bg-red-100 text-red-900"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isRecovering
                      ? "animate-pulse bg-amber-600"
                      : "bg-red-600"
                  }`}
                />
                {isRecovering ? "Recovery in progress" : "Service disruption"}
              </span>
            </div>

            <p
              className={`mt-2 max-w-3xl text-base leading-7 ${
                isRecovering ? "text-amber-900" : "text-red-900"
              }`}
            >
              {isRecovering
                ? "The backend is restarting after a failure. We re-check the health endpoint and the catalog automatically, so there is nothing you need to do."
                : "Products already loaded are kept on screen, but stock checks, cart updates and checkout may be temporarily unavailable while service is restored."}
            </p>

            {evidence ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-xl border border-violet-100 bg-white/90 px-3 py-2 text-base text-slate-700">
                  <Activity size={19} className="text-violet-700" />
                  Container:{" "}
                  <span className="font-semibold">
                    {evidence.container ?? "Unknown"}
                  </span>
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl border border-violet-100 bg-white/90 px-3 py-2 text-base text-slate-700">
                  <ShieldCheck size={19} className="text-violet-700" />
                  Health:{" "}
                  <span className="font-semibold">
                    {evidence.health ?? "Unknown"}
                  </span>
                </span>

                {typeof evidence.restarts === "number" && (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-violet-100 bg-white/90 px-3 py-2 text-base text-slate-700">
                    <LoaderCircle size={19} className="text-violet-700" />
                    Restarts:{" "}
                    <span className="font-semibold">
                      {evidence.restarts}
                    </span>
                  </span>
                )}
              </div>
            ) : null}

            {lastCheckedAt ? (
              <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-base text-slate-600">
                <Clock3 size={18} />
                Last checked at {formatTime(lastCheckedAt)}
              </p>
            ) : null}
          </div>
        </div>

        <Link
          to="/admin"
          className={`inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border bg-white px-5 py-3 text-base font-semibold shadow-sm transition focus:outline-none focus:ring-4 ${
            isRecovering
              ? "border-amber-300 text-amber-900 hover:bg-amber-100 focus:ring-amber-100"
              : "border-red-300 text-red-900 hover:bg-red-100 focus:ring-red-100"
          }`}
        >
          View dashboard
          <ArrowUpRight size={20} />
        </Link>
      </div>
    </div>
  );
}