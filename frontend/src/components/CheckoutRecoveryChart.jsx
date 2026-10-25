import { useMemo } from "react";
import {
    Activity,
    CheckCircle2,
    Clock3,
    Fingerprint,
    ShieldCheck,
    Timer,
    TriangleAlert,
    Wifi,
    WifiOff,
    XCircle,
} from "lucide-react";

const COLORS = {
    standby: "#85897B",
    offline: "#F5B942",
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
        case "failure-detected":
        case "failure-injected":
        case "fault-triggered":
            return {
                label: "Connection lost",
                description: "Connectivity interruption detected.",
                color: COLORS.offline,
                Icon: WifiOff,
            };
        case "saved":
        case "data-restored":
            return {
                label: "Draft saved locally",
                description: "Checkout draft persisted in IndexedDB.",
                color: COLORS.recovering,
                Icon: Activity,
            };
        case "connection-restored":
            return {
                label: "Connection restored",
                description: "Network connectivity is back online.",
                color: COLORS.recovering,
                Icon: Wifi,
            };
        case "checkout-completed":
            return {
                label: "Order verified",
                description: "Checkout completed after recovery.",
                color: COLORS.recovered,
                Icon: ShieldCheck,
            };
        case "draft-discarded":
            return {
                label: "Recovery failed",
                description: "The saved checkout draft was discarded.",
                color: COLORS.failed,
                Icon: XCircle,
            };
        default:
            return {
                label: "Recovery event",
                description: "A recovery-related event was recorded.",
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
                className={`max-w-[65%] break-words text-right text-[11px] text-[#E1E3DA] ${mono ? "font-mono" : ""
                    }`}
            >
                {value || "Not recorded"}
            </span>
        </div>
    );
}

export default function CheckoutRecoveryChart({
    evidence,
    draftMeta = null,
    showSections = false,
}) {
    const events = useMemo(() => {
        if (!evidence) return [];

        const result = [];

        if (evidence.failureDetectedAt || evidence.failureInjectedAt) {
            const ts = evidence.failureDetectedAt || evidence.failureInjectedAt;
            result.push({
                id: `offline-detect-${ts}`,
                timestamp: new Date(ts).getTime(),
                status: "failure-detected",
                detail:
                    "Connectivity interruption detected. Checkout draft saved locally.",
            });
        }

        if (evidence.savedAt || evidence.restoredAt) {
            const ts = evidence.savedAt || evidence.restoredAt;
            const hasRestore = Boolean(evidence.restoredAt);
            result.push({
                id: `offline-save-${ts}`,
                timestamp: new Date(ts).getTime(),
                status: hasRestore ? "data-restored" : "saved",
                detail: hasRestore
                    ? "Checkout draft restored from local IndexedDB storage."
                    : "Checkout draft saved locally for recovery.",
            });
        }

        if (evidence.connectionRestoredAt) {
            result.push({
                id: `offline-restore-${evidence.connectionRestoredAt}`,
                timestamp: new Date(evidence.connectionRestoredAt).getTime(),
                status: "connection-restored",
                detail:
                    "Network connectivity restored. Synchronization can resume.",
            });
        }

        if (evidence.completedAt) {
            result.push({
                id: `offline-complete-${evidence.completedAt}`,
                timestamp: new Date(evidence.completedAt).getTime(),
                status: "checkout-completed",
                detail:
                    "Checkout completed successfully after recovery.",
            });
        }

        if (evidence.discardedAt) {
            result.push({
                id: `offline-discard-${evidence.discardedAt}`,
                timestamp: new Date(evidence.discardedAt).getTime(),
                status: "draft-discarded",
                detail: "The saved checkout draft was discarded.",
            });
        }

        return result.sort((a, b) => a.timestamp - b.timestamp);
    }, [evidence]);

    const status = evidence?.status || null;

    const isOffline =
        status === "failure-detected" ||
        status === "failure-injected" ||
        status === "fault-triggered";
    const isRecovering =
        status === "connection-restored" || status === "data-restored";
    const isRecovered =
        evidence?.completedAt != null ||
        status === "checkout-completed" ||
        events.some((e) => e.status === "checkout-completed");
    const isFailed = status === "draft-discarded";

    // Latest event determines the most recent stage
    const latestEvent = events[events.length - 1];
    const latestEventStatus = latestEvent?.status || null;

    const hasFailureDetected = Boolean(
        status === "failure-detected" ||
        status === "failure-injected" ||
        status === "fault-triggered" ||
        status === "data-restored" ||
        status === "checkout-completed" ||
        events.some((e) => e.status === "failure-detected")
    );
    const hasDataRestored =
        status === "data-restored" ||
        status === "checkout-completed" ||
        events.some((e) => e.status === "data-restored");

    const pipelineStates = [
        {
            title: "Connection Correct",
            description: "Checkout running online",
            state: hasFailureDetected || isRecovered || isRecovering || isFailed ? "complete" : "current",
        },
        {
            title: "Connection Interrupted",
            description: "Connectivity interruption detected",
            state: hasFailureDetected ? "complete" : "pending",
        },
        {
            title: "Data Recovered",
            description: "Checkout draft recovered from IndexedDB",
            state: hasDataRestored ? "complete" : hasFailureDetected ? "current" : "pending",
        },
        {
            title: "Order Placed",
            description: "Checkout completed after recovery",
            state: isRecovered ? "complete" : hasDataRestored ? "current" : "pending",
        },
    ];

    const completedCount = pipelineStates.filter(
        (step) => step.state === "complete"
    ).length;

    const successfullyRecovered = isRecovered ? 1 : 0;
    const pendingOrFailed =
        isOffline || isRecovering || isFailed ? 1 : 0;

    const failureEvent = events.find(
        (e) => e.status === "failure-detected"
    ) || events[0];
    const lastEvent = events[events.length - 1];
    const latestTimestamp =
        lastEvent?.timestamp ||
        (evidence?.updatedAt ? new Date(evidence.updatedAt).getTime() : null);
    const firstTimestamp = failureEvent?.timestamp || null;

    const recoveryDuration =
        firstTimestamp && latestTimestamp
            ? formatDuration(firstTimestamp, latestTimestamp)
            : null;

    return (
        <section className="mt-4 space-y-5 rounded-xl border border-[#292D24] bg-[#0D0F0D] p-4 text-[#F3F4EE] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity
                            size={17}
                            style={{ color: COLORS.recovering }}
                        />
                        <h3 className="text-sm font-semibold">
                            Offline Recovery Lifecycle
                        </h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#92968F]">
                        Recorded offline checkout recovery events and status
                    </p>
                </div>
                <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase"
                    style={{
                        color: isRecovered
                            ? COLORS.recovered
                            : isFailed
                                ? COLORS.failed
                                : isOffline || isRecovering
                                    ? COLORS.offline
                                    : COLORS.neutral,
                        borderColor: `${isRecovered ? COLORS.recovered : isFailed ? COLORS.failed : isOffline || isRecovering ? COLORS.offline : COLORS.neutral}55`,
                        backgroundColor: `${isRecovered ? COLORS.recovered : isFailed ? COLORS.failed : isOffline || isRecovering ? COLORS.offline : COLORS.neutral}12`,
                    }}
                >
                    {isRecovered ? (
                        <CheckCircle2 size={12} />
                    ) : isFailed ? (
                        <XCircle size={12} />
                    ) : isOffline || isRecovering ? (
                        <Activity size={12} />
                    ) : (
                        <Clock3 size={12} />
                    )}
                    {isRecovered
                        ? "Recovery verified"
                        : isFailed
                            ? "Recovery failed"
                            : isOffline || isRecovering
                                ? "Offline · Recovering"
                                : "Standby"}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricCard
                    label="Successfully recovered"
                    value={String(successfullyRecovered)}
                    detail="Completed checkouts after recovery"
                    color={
                        successfullyRecovered
                            ? COLORS.recovered
                            : COLORS.neutral
                    }
                    Icon={ShieldCheck}
                />

                <MetricCard
                    label="Pending / failed recoveries"
                    value={String(pendingOrFailed)}
                    detail="Not yet resolved or discarded"
                    color={
                        pendingOrFailed ? COLORS.offline : COLORS.neutral
                    }
                    Icon={TriangleAlert}
                />
                {recoveryDuration && (
                    <MetricCard
                        label="Recovery duration"
                        value={recoveryDuration}
                        detail="First event to latest"
                        color={COLORS.recovering}
                        Icon={Timer}
                    />
                )}
            </div>

            {showSections && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-4 sm:p-5">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="text-xs font-semibold text-[#F3F4EE]">
                                Recovery pipeline
                            </h4>
                            <p className="mt-1 text-[10px] text-[#85897B]">
                                Progress of the offline recovery sequence
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
                    <div className="min-w-0 rounded-xl border border-white/[0.08] p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h4 className="text-xs font-semibold text-[#F3F4EE]">
                                    Event Sequence
                                </h4>
                                <p className="mt-1 text-[10px] text-[#85897B]">
                                    Chronological recovery history
                                </p>
                            </div>
                            <span className="rounded border border-white/[0.08] px-2 py-1 text-[10px] text-[#92968F]">
                                {events.length} recorded
                            </span>
                        </div>
                        {events.length === 0 ? (
                            <p className="text-xs text-[#92968F]">
                                No valid recovery events are available.
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
                                        <div key={event.id} className="flex gap-3">
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
                                                className={`mb-3 min-w-0 flex-1 rounded-lg border p-3 ${isLast
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

                    <div className="min-w-0 rounded-xl border border-white/[0.08] p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <Fingerprint size={15} className="text-[#92968F]" />
                            <h4 className="text-xs font-semibold">
                                Latest Recovery Evidence
                            </h4>
                        </div>
                        <DetailRow
                            label="Current status"
                            value={
                                latestEventStatus
                                    ? latestEventStatus.charAt(0).toUpperCase() + latestEventStatus.slice(1)
                                    : status
                                        ? status.charAt(0).toUpperCase() + status.slice(1)
                                        : "Standby"
                            }
                        />
                        {(() => {
                            const rows = [];
                            if (draftMeta?.fields != null) {
                                rows.push({
                                    label: "Draft fields",
                                    value: String(draftMeta.fields),
                                    mono: false,
                                });
                            }
                            if (draftMeta?.items != null) {
                                rows.push({
                                    label: "Cart lines",
                                    value: String(draftMeta.items),
                                    mono: false,
                                });
                            }
                            if (draftMeta?.savedAt) {
                                rows.push({
                                    label: "Draft saved at",
                                    value: formatDateTime(draftMeta.savedAt),
                                    mono: false,
                                });
                            }
                            if (evidence.failureDetectedAt || evidence.failureInjectedAt) {
                                rows.push({
                                    label: "Failure detected at",
                                    value: formatDateTime(
                                        evidence.failureDetectedAt || evidence.failureInjectedAt
                                    ),
                                    mono: false,
                                });
                            }
                            if (evidence.connectionRestoredAt) {
                                rows.push({
                                    label: "Connection restored at",
                                    value: formatDateTime(evidence.connectionRestoredAt),
                                    mono: false,
                                });
                            }
                            if (evidence.restoredAt) {
                                rows.push({
                                    label: "Data restored at",
                                    value: formatDateTime(evidence.restoredAt),
                                    mono: false,
                                });
                            }
                            if (evidence.completedAt) {
                                rows.push({
                                    label: "Checkout completed at",
                                    value: formatDateTime(evidence.completedAt),
                                    mono: false,
                                });
                            }
                            if (evidence.fieldsRestored != null) {
                                rows.push({
                                    label: "Fields restored",
                                    value: String(evidence.fieldsRestored),
                                    mono: false,
                                });
                            }
                            if (evidence.cartLinesRestored != null) {
                                rows.push({
                                    label: "Cart lines restored",
                                    value: String(evidence.cartLinesRestored),
                                    mono: false,
                                });
                            }
                            if (evidence.discardedAt) {
                                rows.push({
                                    label: "Draft discarded at",
                                    value: formatDateTime(evidence.discardedAt),
                                    mono: false,
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
        </section>
    );
} 