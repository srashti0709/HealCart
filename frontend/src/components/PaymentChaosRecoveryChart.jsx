
import { useMemo } from "react";
import {
    Activity,
    CheckCircle2,
    Clock3,
    CreditCard,
    ShieldCheck,
    TriangleAlert,
    XCircle,
} from "lucide-react";

const COLORS = {
    armed: "#F5B942",
    detected: "#FF5C5C",
    recovered: "#35D07F",
    error: "#FF5C5C",
    neutral: "#92968F",
};

const formatTime = (value) => {
    const timestamp = new Date(value).getTime();

    if (!Number.isFinite(timestamp)) return "--:--:--";

    return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
};

const formatDuration = (start, end) => {
    const duration = Math.max(0, end - start);

    if (duration < 1000) return `${duration} ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)} s`;

    return `${Math.floor(duration / 60000)}m ${Math.floor(
        (duration % 60000) / 1000
    )}s`;
};

function getEventPresentation(status) {
    switch (status) {
        case "armed":
            return {
                label: "Payment chaos armed",
                description: "Experiment is active and waiting for a checkout.",
                color: COLORS.armed,
                Icon: CreditCard,
            };
        case "detected":
            return {
                label: "Payment timeout detected",
                description:
                    "The payment response was uncertain. The existing transaction must be verified.",
                color: COLORS.detected,
                Icon: TriangleAlert,
            };
        case "recovered":
            return {
                label: "Existing transaction verified",
                description:
                    "The recorded recovery event confirms that the existing transaction was verified.",
                color: COLORS.recovered,
                Icon: ShieldCheck,
            };
        case "error":
            return {
                label: "Experiment activation failed",
                description: "The experiment reported an activation error.",
                color: COLORS.error,
                Icon: XCircle,
            };
        default:
            return {
                label: "Payment event",
                description: "A payment-related event was recorded.",
                color: COLORS.neutral,
                Icon: Clock3,
            };
    }
}

export default function PaymentChaosRecoveryChart({
    recovery,
    incidents = [],
}) {
    const events = useMemo(() => {
        if (!recovery?.startedAt) return [];

        const startedAt = new Date(recovery.startedAt).getTime();

        if (!Number.isFinite(startedAt)) return [];

        const result = [
            {
                id: `armed-${startedAt}`,
                timestamp: startedAt,
                status: "armed",
                detail: "Payment chaos was enabled. Waiting for a checkout event.",
            },
        ];

        for (const stage of recovery.stages || []) {
            const timestamp = new Date(stage.t).getTime();

            if (
                !Number.isFinite(timestamp) ||
                timestamp < startedAt ||
                stage.status !== "error"
            ) {
                continue;
            }

            result.push({
                id: `error-${timestamp}`,
                timestamp,
                status: "error",
                detail: stage.message || "The experiment could not be activated.",
            });
        }

        const paymentIncidents = incidents.filter((incident) => {
            const detectedAt = new Date(incident.detectedAt).getTime();

            return (
                String(incident.incidentType || "").toLowerCase() ===
                    "payment_timeout_recovery" &&
                Number.isFinite(detectedAt) &&
                detectedAt >= startedAt
            );
        });

        for (const incident of paymentIncidents) {
            const detectedAt = new Date(incident.detectedAt).getTime();

            result.push({
                id: `detected-${incident._id || detectedAt}`,
                timestamp: detectedAt,
                status: "detected",
                detail:
                    incident.description ||
                    "A payment timeout was recorded. The transaction outcome requires verification.",
            });

            if (
                incident.status === "resolved" &&
                incident.recoveryAction ===
                    "Verified the existing payment transaction" &&
                incident.resolvedAt
            ) {
                const resolvedAt = new Date(incident.resolvedAt).getTime();

                if (Number.isFinite(resolvedAt) && resolvedAt >= detectedAt) {
                    result.push({
                        id: `recovered-${incident._id || resolvedAt}`,
                        timestamp: resolvedAt,
                        status: "recovered",
                        detail:
                            "The recovery record confirms verification of the existing payment transaction.",
                    });
                }
            }
        }

        // Use the experiment's recovery stage only if no recorded incident
        // already provides the corresponding recovery event.
        if (
            recovery.status === "recovered" &&
            !result.some((event) => event.status === "recovered")
        ) {
            const recoveredStage = [...(recovery.stages || [])]
                .reverse()
                .find((stage) => stage.status === "recovered");

            const timestamp = new Date(recoveredStage?.t).getTime();

            if (Number.isFinite(timestamp) && timestamp >= startedAt) {
                result.push({
                    id: `recovered-stage-${timestamp}`,
                    timestamp,
                    status: "recovered",
                    detail:
                        recoveredStage.message ||
                        "The experiment recorded a successful recovery stage.",
                });
            }
        }

        return result.sort((a, b) => a.timestamp - b.timestamp);
    }, [recovery, incidents]);

    const timeoutEvents = events.filter(
        (event) => event.status === "detected"
    );
    const recoveryEvents = events.filter(
        (event) => event.status === "recovered"
    );
    const errorEvents = events.filter((event) => event.status === "error");

    const latestTimeout = timeoutEvents[timeoutEvents.length - 1];
    const latestRecovery = recoveryEvents[recoveryEvents.length - 1];

    const active = Boolean(recovery?.running);
    const resolved = Boolean(
        latestTimeout &&
            latestRecovery &&
            latestRecovery.timestamp >= latestTimeout.timestamp
    );

    const currentState = resolved
        ? {
              label: "Recovery verified",
              color: COLORS.recovered,
              Icon: CheckCircle2,
          }
        : latestTimeout
          ? {
                label: "Verification not yet confirmed",
                color: COLORS.detected,
                Icon: TriangleAlert,
            }
          : errorEvents.length > 0
            ? {
                  label: "Experiment error",
                  color: COLORS.error,
                  Icon: XCircle,
              }
            : active
              ? {
                    label: "Armed · Waiting",
                    color: COLORS.armed,
                    Icon: Activity,
                }
              : {
                    label: "Standby",
                    color: COLORS.neutral,
                    Icon: Clock3,
                };

    const totalRecoveryTime =
        resolved && latestTimeout && latestRecovery
            ? formatDuration(
                  latestTimeout.timestamp,
                  latestRecovery.timestamp
              )
            : null;

    return (
        <section className="mt-4 space-y-5 rounded-xl border border-[#292D24] bg-[#0D0F0D] p-4 text-[#F3F4EE] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity size={17} style={{ color: currentState.color }} />
                        <h3 className="text-sm font-semibold">
                            Payment Lifecycle
                        </h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#92968F]">
                        Recorded experiment events and payment recovery evidence
                    </p>
                </div>

                <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase"
                    style={{
                        color: currentState.color,
                        borderColor: `${currentState.color}55`,
                        backgroundColor: `${currentState.color}12`,
                    }}
                >
                    <currentState.Icon size={12} />
                    {currentState.label}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                    {
                        label: "Experiment",
                        value: recovery?.startedAt ? "Recorded" : "Not started",
                        color: recovery?.startedAt
                            ? COLORS.armed
                            : COLORS.neutral,
                    },
                    {
                        label: "Timeouts",
                        value: String(timeoutEvents.length),
                        color: timeoutEvents.length
                            ? COLORS.detected
                            : COLORS.neutral,
                    },
                    {
                        label: "Verified",
                        value: String(recoveryEvents.length),
                        color: recoveryEvents.length
                            ? COLORS.recovered
                            : COLORS.neutral,
                    },
                    {
                        label: "Recovery time",
                        value: totalRecoveryTime || "—",
                        color: totalRecoveryTime
                            ? COLORS.recovered
                            : COLORS.neutral,
                    },
                ].map((metric) => (
                    <div
                        key={metric.label}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
                    >
                        <p className="text-[10px] uppercase tracking-wide text-[#92968F]">
                            {metric.label}
                        </p>
                        <p
                            className="mt-2 break-words text-sm font-semibold"
                            style={{ color: metric.color }}
                        >
                            {metric.value}
                        </p>
                    </div>
                ))}
            </div>

            {!recovery?.startedAt ? (
                <div className="flex items-start gap-3 rounded-lg border border-white/[0.08] p-4">
                    <Clock3
                        size={18}
                        className="mt-0.5 shrink-0 text-[#92968F]"
                    />
                    <div>
                        <p className="text-xs font-medium text-[#F3F4EE]">
                            No experiment recorded
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#92968F]">
                            Inject Payment Chaos to start monitoring the
                            experiment. Normal checkout activity is not shown
                            as a chaos recovery event.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <p className="text-[10px] uppercase tracking-wider text-[#92968F]">
                                Event sequence
                            </p>
                            <p className="text-[10px] text-[#92968F]">
                                {events.length} recorded{" "}
                                {events.length === 1 ? "event" : "events"}
                            </p>
                        </div>

                        <div className="space-y-0">
                            {events.map((event, index) => {
                                const presentation = getEventPresentation(
                                    event.status
                                );
                                const Icon = presentation.Icon;
                                const isLast = index === events.length - 1;

                                return (
                                    <div
                                        key={event.id}
                                        className="flex gap-3"
                                    >
                                        <div className="flex w-7 shrink-0 flex-col items-center">
                                            <div
                                                className="flex h-7 w-7 items-center justify-center rounded-full border"
                                                style={{
                                                    color: presentation.color,
                                                    borderColor: `${presentation.color}66`,
                                                    backgroundColor: `${presentation.color}12`,
                                                }}
                                            >
                                                <Icon size={14} />
                                            </div>

                                            {!isLast && (
                                                <div className="my-1 min-h-8 w-px flex-1 bg-white/[0.12]" />
                                            )}
                                        </div>

                                        <div
                                            className={`mb-3 min-w-0 flex-1 rounded-lg border p-3 ${
                                                isLast
                                                    ? "border-white/[0.13] bg-white/[0.035]"
                                                    : "border-white/[0.07] bg-white/[0.015]"
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <p
                                                    className="text-xs font-medium"
                                                    style={{
                                                        color: presentation.color,
                                                    }}
                                                >
                                                    {presentation.label}
                                                </p>

                                                <span className="shrink-0 font-mono text-[10px] text-[#85897B]">
                                                    {formatTime(event.timestamp)}
                                                </span>
                                            </div>

                                            <p className="mt-1.5 text-xs leading-5 text-[#92968F]">
                                                {event.detail ||
                                                    presentation.description}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {!latestTimeout && !errorEvents.length && (
                        <div className="rounded-lg border border-[#F5B942]/20 bg-[#F5B942]/[0.04] p-3">
                            <p className="text-xs leading-5 text-[#F5B942]">
                                {active
                                    ? "Experiment armed. No payment timeout has been recorded yet. The lifecycle will advance when a matching incident is recorded."
                                    : "No payment timeout has been recorded for this experiment. The armed state alone does not mean a payment failed."}
                            </p>
                        </div>
                    )}

                    {latestTimeout && !resolved && (
                        <div className="rounded-lg border border-[#FF5C5C]/20 bg-[#FF5C5C]/[0.04] p-3">
                            <p className="text-xs leading-5 text-[#FF8585]">
                                A timeout incident is recorded, but a matching
                                successful verification event has not yet been
                                confirmed in the available records.
                            </p>
                        </div>
                    )}

                    {resolved && (
                        <div className="rounded-lg border border-[#35D07F]/20 bg-[#35D07F]/[0.04] p-3">
                            <p className="text-xs leading-5 text-[#35D07F]">
                                Recovery is supported by recorded timeout and
                                verification events. Time from detection to
                                verification: {totalRecoveryTime}.
                            </p>
                        </div>
                    )}
                </div>
            )}

            <p className="border-t border-white/[0.07] pt-3 text-[10px] leading-4 text-[#85897B]">
                Only recorded experiment stages and matching payment incidents
                are displayed. An armed experiment is not a payment failure,
                and recovery is not considered verified without recorded
                verification evidence.
            </p>
        </section>
    );
}
