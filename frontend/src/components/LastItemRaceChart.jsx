import { useMemo } from "react";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Fingerprint,
    GitBranch,
    Package,
    RefreshCw,
    Route,
    ShieldCheck,
    Timer,
    TriangleAlert,
    XCircle,
} from "lucide-react";

const COLORS = {
    armed: "#F5B942",
    detected: "#FF5C5C",
    recovering: "#F5B942",
    recovered: "#35D07F",
    failed: "#FF5C5C",
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
        case "fault-injected":
            return {
                label: "Fault injected",
                description: "Race-condition fault activated on test product.",
                color: COLORS.armed,
                Icon: TriangleAlert,
            };
        case "first-checkout":
            return {
                label: "First checkout",
                description: "First customer submitted checkout for the last item.",
                color: COLORS.recovering,
                Icon: Activity,
            };
        case "conflict-detected":
            return {
                label: "Conflict detected",
                description: "Concurrent checkout conflict detected on last unit.",
                color: COLORS.detected,
                Icon: AlertTriangle,
            };
        case "recovery-verified":
            return {
                label: "Recovery verified",
                description: "Race condition resolved and final stock verified.",
                color: COLORS.recovered,
                Icon: ShieldCheck,
            };
        case "race-failed":
            return {
                label: "Race failed",
                description: "The race condition could not be resolved.",
                color: COLORS.failed,
                Icon: XCircle,
            };
        default:
            return {
                label: "Race event",
                description: "A race-condition related event was recorded.",
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
            ? COLORS.recovering
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
                    className="absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-[18px] h-px"
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

            <p className="mt-3 text-[11px] font-semibold"
                style={{ color: current || completed ? color : "#D0D2CA" }}>
                {title}
            </p>

            <p className="mt-1 max-w-[140px] text-[10px] leading-4 text-[#85897B]">
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
                {completed ? "Confirmed" : current ? "Active" : "Pending"}
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

export default function LastItemRaceChart({
    raceRun,
    showSections = false,
    onInject,
    injectRunning = false,
}) {
    const events = useMemo(() => {
        if (!raceRun) return [];

        const result = [];

        if (raceRun.faultInjectedAt) {
            result.push({
                id: `race-fault-${raceRun.faultInjectedAt}`,
                timestamp: new Date(raceRun.faultInjectedAt).getTime(),
                status: "fault-injected",
                detail:
                    "Race-condition fault injected. Test product prepared with one unit of stock.",
            });
        }

        if (raceRun.firstAttemptAt) {
            result.push({
                id: `race-first-${raceRun.firstAttemptAt}`,
                timestamp: new Date(raceRun.firstAttemptAt).getTime(),
                status: "first-checkout",
                detail:
                    "First customer submitted checkout for the last available item.",
            });
        }

        if (raceRun.conflictDetectedAt) {
            result.push({
                id: `race-conflict-${raceRun.conflictDetectedAt}`,
                timestamp: new Date(raceRun.conflictDetectedAt).getTime(),
                status: "conflict-detected",
                detail:
                    "Concurrent checkout conflict detected on the final unit.",
            });
        }

        if (raceRun.verifiedAt) {
            result.push({
                id: `race-verified-${raceRun.verifiedAt}`,
                timestamp: new Date(raceRun.verifiedAt).getTime(),
                status: "recovery-verified",
                detail:
                    "Race condition resolved. Final stock verified after recovery.",
            });
        }

        return result.sort((a, b) => a.timestamp - b.timestamp);
    }, [raceRun]);

    const hasFaultInjected = Boolean(
        raceRun?.faultInjectedAt ||
        events.some((e) => e.status === "fault-injected")
    );
    const hasFirstCheckout = Boolean(
        raceRun?.firstAttemptAt ||
        events.some((e) => e.status === "first-checkout")
    );
    const hasConflictDetected = Boolean(
        raceRun?.conflictDetectedAt ||
        events.some((e) => e.status === "conflict-detected")
    );
    const hasRecoveryVerified = Boolean(
        raceRun?.verifiedAt ||
        events.some((e) => e.status === "recovery-verified")
    );

    const pipelineStates = [
        {
            title: "Fault Injected",
            description: "Race-condition fault activated",
            state: hasFaultInjected ? "complete" : "pending",
        },
        {
            title: "First Checkout",
            description: "Customer submitted checkout",
            state: hasFirstCheckout
                ? "complete"
                : hasFaultInjected ? "current" : "pending",
        },
        {
            title: "Conflict Detected",
            description: "Concurrent checkout conflict",
            state: hasConflictDetected
                ? "complete"
                : hasFirstCheckout ? "current" : "pending",
        },
        {
            title: "Recovery Verified",
            description: "Final stock verified",
            state: hasRecoveryVerified ? "complete" : "pending",
        },
    ];

    const completedCount = pipelineStates.filter(
        (step) => step.state === "complete"
    ).length;

    const isRecovered = raceRun?.status === "recovered";
    const isFailed = raceRun?.status === "failed";
    const isRecovering = raceRun?.status === "recovering";
    const isReady = raceRun?.status === "ready";

    const initialStock = raceRun?.initialStock ?? 0;
    const attemptCount = raceRun?.attemptCount ?? 0;
    const successfulReservations = raceRun?.successfulReservations ?? 0;
    const rejectedAttempts = raceRun?.rejectedAttempts ?? 0;

    const recoveryDuration =
        hasFaultInjected && hasRecoveryVerified
            ? formatDuration(
                  new Date(
                      events.find((e) => e.status === "fault-injected")
                          ?.timestamp ||
                          raceRun.faultInjectedAt
                  ).getTime(),
                  new Date(
                      events.find((e) => e.status === "recovery-verified")
                          ?.timestamp ||
                          raceRun.verifiedAt
                  ).getTime()
              )
            : null;

    return (
        <section className="mt-4 space-y-5 rounded-xl border border-[#292D24] bg-[#141813] p-4 text-[#F3F4EE] sm:p-5">
            <div className="flex flex-col gap-4">
                <div className="max-w-3xl">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#DEED00]">
                        Fault Injection 03 · Distributed Concurrency
                    </p>
                    <h4 className="mt-2 flex items-center gap-2 text-base font-semibold tracking-tight text-[#F0F1E9]">
                        <GitBranch size={20} className="shrink-0 text-[#DEED00]" />
                        Last-Item Race Condition
                    </h4>
                    <p className="mt-3 text-xs leading-6 text-[#A0A396]">
                        Inject a controlled checkout timing fault and create a dedicated
                        storefront product with exactly one unit. Open it in two browser
                        sessions, add one unit to each cart, and submit both checkouts
                        close together.
                    </p>
                </div>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity
                            size={17}
                            style={{ color: COLORS.recovering }}
                        />
                        <h3 className="text-sm font-semibold">
                            Last-Item Race Lifecycle
                        </h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#92968F]">
                        Recorded race-condition experiment events and status
                    </p>
                </div>
                <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase"
                    style={{
                        color: isRecovered
                            ? COLORS.recovered
                            : isFailed
                              ? COLORS.failed
                              : isRecovering || isReady
                                ? COLORS.armed
                                : COLORS.neutral,
                        borderColor: `${isRecovered ? COLORS.recovered : isFailed ? COLORS.failed : isRecovering || isReady ? COLORS.armed : COLORS.neutral}55`,
                        backgroundColor: `${isRecovered ? COLORS.recovered : isFailed ? COLORS.failed : isRecovering || isReady ? COLORS.armed : COLORS.neutral}12`,
                    }}
                >
                    {isRecovered ? (
                        <CheckCircle2 size={12} />
                    ) : isFailed ? (
                        <XCircle size={12} />
                    ) : isRecovering || isReady ? (
                        <Activity size={12} />
                    ) : (
                        <Clock3 size={12} />
                    )}
                    {isRecovered
                        ? "Recovery verified"
                        : isFailed
                          ? "Race failed"
                          : isRecovering || isReady
                            ? "Fault injected · Ready"
                            : "Standby"}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricCard
                    label="Initial stock"
                    value={String(initialStock)}
                    detail="Units on test product"
                    color={COLORS.armed}
                    Icon={Package}
                />

                <MetricCard
                    label="Checkout attempts"
                    value={String(attemptCount)}
                    detail="Total checkout submissions"
                    color={COLORS.recovering}
                    Icon={Activity}
                />

                <MetricCard
                    label="Reservations accepted"
                    value={String(successfulReservations)}
                    detail="Successful item reservations"
                    color={
                        successfulReservations
                            ? COLORS.recovered
                            : COLORS.neutral
                    }
                    Icon={ShieldCheck}
                />

                <MetricCard
                    label="Competing attempts rejected"
                    value={String(rejectedAttempts)}
                    detail="Rejected concurrent checkouts"
                    color={rejectedAttempts ? COLORS.armed : COLORS.neutral}
                    Icon={TriangleAlert}
                />

                <MetricCard
                    label="Recovery duration"
                    value={recoveryDuration || "—"}
                    detail={
                        recoveryDuration
                            ? "Fault injected to verified"
                            : "Awaiting confirmation"
                    }
                    color={
                        recoveryDuration ? COLORS.recovering : COLORS.neutral
                    }
                    Icon={Timer}
                />
            </div>

            {showSections && (
                <div className="rounded-xl border border-[#292D24] bg-[#0C0F0C] p-4 sm:p-5">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="text-xs font-semibold text-[#F3F4EE]">
                                Recovery pipeline
                            </h4>
                            <p className="mt-1 text-[10px] text-[#85897B]">
                                Progress of the race-condition sequence
                            </p>
                        </div>
                        <span className="rounded border border-white/[0.08] px-2 py-1 font-mono text-[9px] text-[#92968F]">
                            {completedCount} /4 STAGES
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
            )}

            {showSections && (
                <div className="space-y-4">
                    <div className="min-w-0 rounded-xl border border-[#292D24] bg-[#0C0F0C] p-4">
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
                                No valid race events are available.
                            </p>
                        ) : (
                            <div className="space-y-0">
                                {events.map((event, index) => {
                                    const presentation =
                                        getEventPresentation(event.status);
                                    const Icon = presentation.Icon;
                                    const isLast =
                                        index === events.length - 1;
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
                                                    <span
                                                        className="shrink-0 font-mono text-[10px] text-[#85897B]"
                                                    >
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

                    <div className="min-w-0 rounded-xl border border-[#292D24] bg-[#0C0F0C] p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <Fingerprint size={15} className="text-[#92968F]" />
                            <h4 className="text-xs font-semibold">
                                Latest Race Evidence
                            </h4>
                        </div>
                        {(() => {
                            const rows = [];
                            if (raceRun?.initialStock != null) {
                                rows.push({
                                    label: "Initial stock",
                                    value: String(raceRun.initialStock),
                                    mono: false,
                                });
                            }
                            if (raceRun?.attemptCount != null) {
                                rows.push({
                                    label: "Checkout attempts",
                                    value: String(raceRun.attemptCount),
                                    mono: false,
                                });
                            }
                            if (raceRun?.successfulReservations != null) {
                                rows.push({
                                    label: "Reservations accepted",
                                    value: String(raceRun.successfulReservations),
                                    mono: false,
                                });
                            }
                            if (raceRun?.rejectedAttempts != null) {
                                rows.push({
                                    label: "Competing attempts rejected",
                                    value: String(raceRun.rejectedAttempts),
                                    mono: false,
                                });
                            }
                            if (raceRun?.faultInjectedAt) {
                                rows.push({
                                    label: "Fault injected at",
                                    value: formatDateTime(raceRun.faultInjectedAt),
                                    mono: false,
                                });
                            }
                            if (raceRun?.firstAttemptAt) {
                                rows.push({
                                    label: "First checkout at",
                                    value: formatDateTime(raceRun.firstAttemptAt),
                                    mono: false,
                                });
                            }
                            if (raceRun?.conflictDetectedAt) {
                                rows.push({
                                    label: "Conflict detected at",
                                    value: formatDateTime(raceRun.conflictDetectedAt),
                                    mono: false,
                                });
                            }
                            if (raceRun?.verifiedAt) {
                                rows.push({
                                    label: "Recovery verified at",
                                    value: formatDateTime(raceRun.verifiedAt),
                                    mono: false,
                                });
                            }
                            if (raceRun?.stockAfterRecovery != null) {
                                rows.push({
                                    label: "Final verified stock",
                                    value: String(raceRun.stockAfterRecovery),
                                    mono: false,
                                });
                            }
                            if (raceRun?.message) {
                                rows.push({
                                    label: "Run message",
                                    value: raceRun.message,
                                    mono: true,
                                });
                            }
                            return rows.map((row) => (
                                <DetailRow
                                    key={row.label}
                                    label={row.label}
                                    value={row.value}
                                    mono={row.mono}
                                />
                            ));
                        })()}
                    </div>
                </div>
            )}
            <div className="mt-auto flex flex-col gap-3 border-t border-[#292D24] pt-5">
                <button
                    type="button"
                    onClick={onInject}
                    disabled={injectRunning}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#DEED00]/30 bg-[#DEED00] px-4 py-3 text-xs font-semibold text-[#242700] shadow-[0_0_14px_rgba(222,237,0,0.08)] transition-colors hover:bg-[#EFFA38] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {injectRunning ? (
                        <RefreshCw size={17} className="animate-spin" />
                    ) : (
                        <Route size={17} />
                    )}
                    {injectRunning ? "Injecting..." : "Inject Failure"}
                </button>
            </div>
        </section>
    );
}
