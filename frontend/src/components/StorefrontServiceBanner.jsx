import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  LoaderCircle,
  ServerCrash,
} from "lucide-react";
import { AVAILABILITY_STATUS } from "../hooks/useBackendAvailability";

/**
 * Storefront service status banner.
 *
 * It only renders for real service disruption. The healthy state stays in the
 * existing "Store operating" pill in the navigation bar so a normal visit
 * keeps the calm storefront look.
 */

const formatTime = (value) => {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
        className="border-b border-emerald-200 bg-emerald-50"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-3.5 sm:flex-row sm:items-center">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={18} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              Back online and verified
            </p>
            <p className="mt-0.5 text-sm text-emerald-800/90">
              The backend health check and the product catalog both responded
              successfully, so the store is serving normally again.
              {verifiedAt ? ` Verified at ${formatTime(verifiedAt)}.` : ""}
            </p>
          </div>
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
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-3.5 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isRecovering
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {isRecovering ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <ServerCrash size={18} />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    isRecovering ? "text-amber-900" : "text-red-900"
                  }`}
                >
                  {isRecovering
                    ? "Restoring service"
                    : "The store backend is unavailable"}
                </p>

                <p
                  className={`mt-0.5 text-sm ${
                    isRecovering ? "text-amber-800/90" : "text-red-800/90"
                  }`}
                >
                  {isRecovering
                    ? "The backend is restarting after a failure. We re-check the health endpoint and the catalog automatically, so there is nothing you need to do."
                    : "Products already loaded are kept on screen, but stock checks, cart updates and checkout may be temporarily unavailable while service is restored."}
                </p>

                {evidence ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Activity size={12} />
                      Container {evidence.container}
                    </span>
                    <span>Health {evidence.health}</span>
                    {typeof evidence.restarts === "number" ? (
                      <span>Restarts {evidence.restarts}</span>
                    ) : null}
                  </p>
                ) : null}

                {lastCheckedAt ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Last checked at {formatTime(lastCheckedAt)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

        <Link
          to="/dashboard"
          className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            isRecovering
              ? "border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
              : "border border-red-300 bg-white text-red-800 hover:bg-red-100"
          }`}
        >
          View dashboard
        </Link>
      </div>
    </div>
  );
}
