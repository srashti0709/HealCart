import { useMemo } from "react";
import {
    Activity,
    CheckCircle2,
    Clock3,
    CreditCard,
    Fingerprint,
    ShieldCheck,
    Timer,
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
    if (!value) return "--:--:--";

    const timestamp = new Date(value).getTime();

    if (!Number.isFinite(timestamp)) return "--:--:--";

    return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
};

const formatDateTime = (value) => {
    if (!value) return "Not recorded";

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) return "Not recorded";

    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
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

function PipelineStep({ title, description, state, last }) {
    const completed = state === "complete";
    const current = state === "current";

    const color = completed
        ? COLORS.recovered
        : current
          ? COLORS.detected
          : COLORS.neutral;

    const Icon = completed
        ? CheckCircle2
        : current
          ? TriangleAlert
          : Clock3;

    return (
        <div className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {!last && (
                <div
                    className="absolute left-[calc(50%+19px)] right-[calc(-50%+19px)] top-[18px] h-px"
                    style={{
                        backgroundColor: completed
                            ? `${COLORS.recovered}70`
                            : "rgba(255,255,255,0.12)",
                    }}
                />
            )}

            <div
                className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border"
                style={{
                    color,
                    borderColor: `${color}66`,
                    backgroundColor: `${color}12`,
                }}
            >
                <Icon size={16} />
            </div>

            <p
                className="mt-3 text-[11px] font-semibold"
                style={{ color: current || completed ? color : "#D0D2CA" }}
            >
                {title}
            </p>

            <p className="mt-1 max-w-[130px] text-[10px] leading-4 text-[#85897B]">
                {description}
            </p>

            <span
                className="mt-2 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                style={{
                    color,
                    borderColor: `${color}35`,
                    backgroundColor: `${color}0D`,
                }}
            >
                {completed ? "Confirmed" : current ? "Detected" : "Pending"}
            </span>
        </div>
    );
}

function MetricCard({ label, value, detail, color, Icon }) {
    return (
        <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 sm:p-3.5">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wide text-[#92968F]">
                    {label}
                </p>
                <Icon size={14} style={{ color }} />
            </div>

            <p
                className="mt-2 break-words text-lg font-semibold tracking-tight"
                style={{ color }}
            >
                {value}
            </p>

            <p className="mt-1 text-[10px] leading-4 text-[#85897B]">
                {detail}
            </p>
        </div>
    );
}

function DetailRow({ label, value, mono = false }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] py-2.5 last:border-b-0">
            <span className="text-[11px] text-[#92968F]">{label}</span>
            <span
                className={`max-w-[65%] break-words text-right text-[11px] text-[#E1E3DA] ${
                    mono ? "font-mono" : ""
                }`}
            >
                {value || "Not recorded"}
            </span>
        </div>
    );
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
                incident,
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
                        incident,
                        detail:
                            "The recovery record confirms verification of the existing payment transaction.",
                    });
                }
            }
        }

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
    const latestIncident = latestTimeout?.incident || null;

    const active = Boolean(recovery?.running);
    const hasExperiment = Boolean(recovery?.startedAt);

    const resolved = Boolean(
        latestTimeout &&
            latestRecovery &&
            latestRecovery.timestamp >= latestTimeout.timestamp
    );

    const totalRecoveryTime =
        resolved && latestTimeout && latestRecovery
            ? formatDuration(
                  latestTimeout.timestamp,
                  latestRecovery.timestamp
              )
            : null;

    const pipelineStates = [
        {
            title: "Experiment armed",
            description: "Chaos monitoring enabled",
            state: hasExperiment ? "complete" : "pending",
        },
        {
            title: "Timeout detected",
            description: "Matching incident recorded",
            state: latestTimeout ? "complete" : active ? "current" : "pending",
        },
        {
            title: "Transaction verified",
            description: "Recovery evidence recorded",
            state: resolved ? "complete" : latestTimeout ? "current" : "pending",
        },
    ];

    return (
        <section className="mt-4 space-y-5 rounded-xl border border-[#292D24] bg-[#0D0F0D] p-4 text-[#F3F4EE] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity
                            size={17}
                            style={{ color: resolved ? COLORS.recovered : latestTimeout ? COLORS.detected : active ? COLORS.armed : COLORS.neutral }}
                        />
                        <h3 className="text-sm font-semibold">
                            Payment Lifecycle
                        </h3>
                    </div>

                    <p className="mt-1 text-xs leading-5 text-[#92968F]">
                        Recorded experiment events and payment recovery status
                    </p>
                </div>

                <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase"
                    style={{
                        color: resolved
                            ? COLORS.recovered
                            : latestTimeout
                              ? COLORS.detected
                              : errorEvents.length
                                ? COLORS.error
                                : active
                                  ? COLORS.armed
                                  : COLORS.neutral,
                        borderColor: `${resolved ? COLORS.recovered : latestTimeout ? COLORS.detected : errorEvents.length ? COLORS.error : active ? COLORS.armed : COLORS.neutral}55`,
                        backgroundColor: `${resolved ? COLORS.recovered : latestTimeout ? COLORS.detected : errorEvents.length ? COLORS.error : active ? COLORS.armed : COLORS.neutral}12`,
                    }}
                >
                    {resolved ? (
                        <CheckCircle2 size={12} />
                    ) : latestTimeout ? (
                        <TriangleAlert size={12} />
                    ) : errorEvents.length ? (
                        <XCircle size={12} />
                    ) : active ? (
                        <Activity size={12} />
                    ) : (
                        <Clock3 size={12} />
                    )}
                    {resolved
                        ? "Recovery verified"
                        : latestTimeout
                          ? "Verification not yet confirmed"
                          : errorEvents.length
                            ? "Experiment error"
                            : active
                              ? "Armed · Waiting"
                              : "Standby"}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricCard
                    label="Experiment"
                    value={hasExperiment ? "Recorded" : "Not started"}
                    detail={
                        hasExperiment
                            ? formatDateTime(recovery.startedAt)
                            : "Awaiting activation"
                    }
                    color={hasExperiment ? COLORS.armed : COLORS.neutral}
                    Icon={CreditCard}
                />

                <MetricCard
                    label="Timeouts"
                    value={String(timeoutEvents.length)}
                    detail="Matching incidents"
                    color={
                        timeoutEvents.length
                            ? COLORS.detected
                            : COLORS.neutral
                    }
                    Icon={TriangleAlert}
                />

                <MetricCard
                    label="Verified"
                    value={String(recoveryEvents.length)}
                    detail="Recorded recoveries"
                    color={
                        recoveryEvents.length
                            ? COLORS.recovered
                            : COLORS.neutral
                    }
                    Icon={ShieldCheck}
                />

                <MetricCard
                    label="Recovery time"
                    value={totalRecoveryTime || "—"}
                    detail={
                        resolved
                            ? "Detection to verification"
                            : "Awaiting confirmation"
                    }
                    color={
                        totalRecoveryTime
                            ? COLORS.recovered
                            : COLORS.neutral
                    }
                    Icon={Timer}
                />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-4 sm:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h4 className="text-xs font-semibold text-[#F3F4EE]">
                            Recovery pipeline
                        </h4>
                        <p className="mt-1 text-[10px] text-[#85897B]">
                            Progress of the payment experiment
                        </p>
                    </div>

                    <span className="rounded border border-white/[0.08] px-2 py-1 font-mono text-[9px] text-[#92968F]">
                        {
                            pipelineStates.filter(
                                (step) => step.state === "complete"
                            ).length
                        }
                        /3 STAGES
                    </span>
                </div>

                <div className="flex gap-1">
                    {pipelineStates.map((step, index) => (
                        <PipelineStep
                            key={step.title}
                            title={step.title}
                            description={step.description}
                            state={step.state}
                            last={index === pipelineStates.length - 1}
                        />
                    ))}
                </div>
            </div>

            {!hasExperiment ? (
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
                    <div className="min-w-0 rounded-xl border border-white/[0.08] p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h4 className="text-xs font-semibold text-[#F3F4EE]">
                                    Event Sequence
                                </h4>
                                <p className="mt-1 text-[10px] text-[#85897B]">
                                    Chronological experiment history
                                </p>
                            </div>

                            <span className="rounded border border-white/[0.08] px-2 py-1 text-[10px] text-[#92968F]">
                                {events.length} recorded
                            </span>
                        </div>

                        {events.length === 0 ? (
                            <p className="text-xs text-[#92968F]">
                                No valid experiment events are available.
                            </p>
                        ) : (
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
                                                        {formatTime(
                                                            event.timestamp
                                                        )}
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
                        )}
                    </div>

                    <div className="min-w-0 rounded-xl border border-white/[0.08] p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <Fingerprint
                                size={15}
                                className="text-[#92968F]"
                            />
                            <h4 className="text-xs font-semibold">
                                Latest Incident Evidence
                            </h4>
                        </div>

                        {latestIncident ? (
                            <>
                                <DetailRow
                                    label="Incident ID"
                                    value={latestIncident._id}
                                    mono
                                />

                                <DetailRow
                                    label="Incident type"
                                    value={latestIncident.incidentType}
                                />

                                <DetailRow
                                    label="Status"
                                    value={latestIncident.status}
                                />

                                <DetailRow
                                    label="Detected at"
                                    value={formatDateTime(
                                        latestIncident.detectedAt
                                    )}
                                />

                                <DetailRow
                                    label="Resolved at"
                                    value={
                                        latestIncident.resolvedAt
                                            ? formatDateTime(
                                                  latestIncident.resolvedAt
                                              )
                                            : "Not resolved"
                                    }
                                />

                                <DetailRow
                                    label="Recovery action"
                                    value={latestIncident.recoveryAction}
                                />
                            </>
                        ) : (
                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
                                <p className="text-xs text-[#D0D2CA]">
                                    No matching payment incident
                                </p>
                                <p className="mt-1 text-[11px] leading-5 text-[#85897B]">
                                    No qualifying payment timeout incident has
                                    been found after the experiment started.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
