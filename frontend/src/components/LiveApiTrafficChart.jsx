
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    ServerCrash,
    ShieldCheck,
} from "lucide-react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { API_BASE_URL } from "../config/api";

const POLL_INTERVAL = 1500;
const FAILURE_THRESHOLD = 2;
const MIN_RECOVERY_MS = 4000;
const REQUIRED_SUCCESS_CHECKS = 2;
const MAX_POINTS = 60;

const STATES = {
    CRASH: "crash",
    RECOVERING: "recovering",
    RECOVERED: "recovered",
};

const STATE_CONFIG = {
    [STATES.CRASH]: {
        label: "Backend Crash",
        description: "The backend is not responding to health checks.",
        color: "#ef4444",
        level: 0,
        icon: ServerCrash,
    },
    [STATES.RECOVERING]: {
        label: "Recovering",
        description: "The backend is responding. Recovery is being verified.",
        color: "#f59e0b",
        level: 1,
        icon: Activity,
    },
    [STATES.RECOVERED]: {
        label: "Recovered",
        description: "Backend, database, and storefront checks have passed.",
        color: "#22c55e",
        level: 2,
        icon: ShieldCheck,
    },
};

const BASE_URL = API_BASE_URL.replace(/\/+$/, "");
const HEALTH_URL = `${BASE_URL}/api/health`;
const PRODUCTS_URL = `${BASE_URL}/api/products`;

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function createInitialPoints() {
    const now = Date.now();

    return Array.from({ length: 20 }, (_, index) => ({
        timestamp: now - (19 - index) * 1000,
        time: formatTime(now - (19 - index) * 1000),
        level: 2,
        state: STATES.RECOVERED,
        label: STATE_CONFIG[STATES.RECOVERED].label,
    }));
}

function SectionHeading({ eyebrow, title, description, icon: Icon }) {
    return (
        <div className="flex min-w-0 items-start gap-3">
            {Icon && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#DEED00]/20 bg-[#DEED00]/[0.07] text-[#DEED00] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
                    <Icon size={17} />
                </div>
            )}

            <div className="min-w-0">
                {eyebrow && (
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#DEED00]/80">
                        {eyebrow}
                    </p>
                )}

                <h3 className="mt-1 text-sm font-semibold tracking-tight text-[#F0F1E9] sm:text-base">
                    {title}
                </h3>

                {description && (
                    <p className="mt-1 text-xs leading-5 text-[#92968F] sm:text-sm">
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
}

function StateCard({ state, subtitle, active }) {
    const item = STATE_CONFIG[state];
    const Icon = item.icon;

    return (
        <div
            className={`group/state relative min-w-0 overflow-hidden rounded-xl border p-3 transition-all duration-300 sm:p-4 ${
                active
                    ? "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_5px_14px_rgba(0,0,0,0.14)]"
                    : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.13] hover:bg-white/[0.025]"
            }`}
            style={
                active
                    ? {
                          borderColor: `${item.color}75`,
                          background: `linear-gradient(145deg, ${item.color}15, rgba(255,255,255,0.015))`,
                      }
                    : undefined
            }
        >
            {active && (
                <div
                    className="absolute inset-x-3 top-0 h-px"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${item.color}, transparent)`,
                    }}
                />
            )}

            <div className="flex items-center justify-between gap-2">
                <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg border"
                    style={{
                        color: item.color,
                        borderColor: `${item.color}35`,
                        backgroundColor: `${item.color}12`,
                    }}
                >
                    <Icon size={16} />
                </div>

                <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                        backgroundColor: active ? item.color : "#53564E",
                        boxShadow: active
                            ? `0 0 10px ${item.color}70`
                            : "none",
                    }}
                />
            </div>

            <p
                className="mt-3 break-words text-xs font-semibold sm:text-sm"
                style={{
                    color: active ? item.color : "#D0D2CA",
                }}
            >
                {item.label}
            </p>

            <p className="mt-1 text-[11px] leading-4 text-[#85897B] sm:text-xs">
                {subtitle}
            </p>

            <div className="mt-3 border-t border-white/[0.06] pt-2">
                <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{
                        color: active ? item.color : "#73776C",
                    }}
                >
                    {active ? "Current state" : "Standby"}
                </span>
            </div>
        </div>
    );
}

export default function LiveApiTrafficChart() {
    const [currentState, setCurrentState] = useState(STATES.RECOVERED);
    const [timeline, setTimeline] = useState([]);
    const [chartData, setChartData] = useState(createInitialPoints);
    const [lastChecked, setLastChecked] = useState(null);

    const mountedRef = useRef(false);
    const inFlightRef = useRef(false);
    const currentStateRef = useRef(STATES.RECOVERED);
    const failureCountRef = useRef(0);
    const recoveryStartedAtRef = useRef(null);
    const successfulChecksRef = useRef(0);
    const lastStateChangeRef = useRef(null);

    const recordState = useCallback((nextState) => {
        if (currentStateRef.current === nextState) return;

        currentStateRef.current = nextState;
        setCurrentState(nextState);

        const timestamp = Date.now();
        lastStateChangeRef.current = timestamp;

        setTimeline((previous) =>
            [
                ...previous,
                {
                    timestamp,
                    time: formatTime(timestamp),
                    state: nextState,
                    label: STATE_CONFIG[nextState].label,
                },
            ].slice(-MAX_POINTS)
        );
    }, []);

    const beginRecovery = useCallback(() => {
        if (currentStateRef.current !== STATES.RECOVERING) {
            recoveryStartedAtRef.current = Date.now();
            successfulChecksRef.current = 0;
        }

        recordState(STATES.RECOVERING);
    }, [recordState]);

    const checkServices = useCallback(async () => {
        if (inFlightRef.current || !mountedRef.current) return;

        inFlightRef.current = true;

        try {
            const response = await axios.get(HEALTH_URL, {
                timeout: 2500,
            });

            if (!mountedRef.current) return;

            failureCountRef.current = 0;

            const health = response.data;
            const backendHealthy =
                health?.success === true &&
                health?.status === "healthy";

            const databaseConnected = health?.database === "connected";

            if (!backendHealthy || !databaseConnected) {
                successfulChecksRef.current = 0;
                beginRecovery();
                return;
            }

            if (currentStateRef.current === STATES.CRASH) {
                beginRecovery();
            }

            try {
                await axios.get(PRODUCTS_URL, { timeout: 2500 });

                if (!mountedRef.current) return;

                if (currentStateRef.current === STATES.RECOVERED) return;

                if (recoveryStartedAtRef.current === null) {
                    recoveryStartedAtRef.current = Date.now();
                }

                successfulChecksRef.current += 1;

                const elapsed =
                    Date.now() - recoveryStartedAtRef.current;

                if (
                    elapsed >= MIN_RECOVERY_MS &&
                    successfulChecksRef.current >= REQUIRED_SUCCESS_CHECKS
                ) {
                    recordState(STATES.RECOVERED);
                    recoveryStartedAtRef.current = null;
                    successfulChecksRef.current = 0;
                } else {
                    recordState(STATES.RECOVERING);
                }
            } catch {
                if (!mountedRef.current) return;

                successfulChecksRef.current = 0;
                beginRecovery();
            }
        } catch {
            if (!mountedRef.current) return;

            failureCountRef.current += 1;

            if (failureCountRef.current >= FAILURE_THRESHOLD) {
                recoveryStartedAtRef.current = null;
                successfulChecksRef.current = 0;
                recordState(STATES.CRASH);
            }
        } finally {
            inFlightRef.current = false;

            if (mountedRef.current) {
                setLastChecked(Date.now());
            }
        }
    }, [beginRecovery, recordState]);

    useEffect(() => {
        mountedRef.current = true;

        const checkInterval = window.setInterval(
            checkServices,
            POLL_INTERVAL
        );

        const animationInterval = window.setInterval(() => {
            if (!mountedRef.current) return;

            const now = Date.now();
            const state = currentStateRef.current;
            const level = STATE_CONFIG[state].level;

            setChartData((previous) => {
                const next = [
                    ...previous,
                    {
                        timestamp: now,
                        time: formatTime(now),
                        level,
                        state,
                        label: STATE_CONFIG[state].label,
                    },
                ];

                return next.slice(-MAX_POINTS);
            });
        }, 500);

        checkServices();

        return () => {
            mountedRef.current = false;
            window.clearInterval(checkInterval);
            window.clearInterval(animationInterval);
        };
    }, [checkServices]);

    const config = STATE_CONFIG[currentState];
    const StatusIcon = config.icon;
    const chartColor = config.color;

    return (
        <section className="group/traffic relative w-full space-y-5 overflow-hidden rounded-2xl border border-[#30352A] bg-[linear-gradient(145deg,#1D2119_0%,#151811_52%,#10130F_100%)] p-4 text-[#F3F4EE] shadow-[0_2px_0_rgba(255,255,255,0.025)_inset,0_3px_0_#090B08,0_14px_32px_rgba(0,0,0,0.24)] transition-colors duration-300 hover:border-[#414638] sm:space-y-6 sm:p-5 lg:p-6">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#DEED00]/50 to-transparent" />

            <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#DEED00]/[0.035] blur-3xl" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#DEED00]">
                        <Activity size={15} />
                        Self-Healing Monitor
                        <span className="h-1 w-1 rounded-full bg-[#DEED00]/60" />
                        Live Diagnostics
                    </div>

                    <h2 className="text-xl font-semibold tracking-tight text-[#F0F1E9] sm:text-2xl">
                        Backend Recovery Timeline
                    </h2>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#92968F]">
                        Live service health, failure detection, and recovery verification.
                    </p>
                </div>

                <div
                    className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
                    style={{
                        color: chartColor,
                        borderColor: `${chartColor}55`,
                        backgroundColor: `${chartColor}10`,
                    }}
                >
                    <span className="relative flex h-2 w-2">
                        <span
                            className="absolute inline-flex h-full w-full rounded-full opacity-40"
                            style={{ backgroundColor: chartColor }}
                        />
                        <span
                            className="relative inline-flex h-2 w-2 rounded-full"
                            style={{ backgroundColor: chartColor }}
                        />
                    </span>

                    <StatusIcon size={15} />

                    <span className="text-xs font-semibold">
                        {config.label}
                    </span>
                </div>
            </div>

            <div
                className="relative overflow-hidden rounded-xl border p-4 sm:p-5"
                style={{
                    borderColor: `${chartColor}45`,
                    background: `linear-gradient(120deg, ${chartColor}0F, rgba(12,15,12,0.7))`,
                    boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset",
                }}
            >
                <div
                    className="absolute bottom-0 left-0 top-0 w-[2px]"
                    style={{ backgroundColor: chartColor }}
                />

                <div className="flex items-start gap-3 sm:gap-4">
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                        style={{
                            color: chartColor,
                            borderColor: `${chartColor}40`,
                            backgroundColor: `${chartColor}15`,
                        }}
                    >
                        <StatusIcon size={20} />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3
                                className="text-base font-semibold sm:text-lg"
                                style={{ color: chartColor }}
                            >
                                {config.label}
                            </h3>

                            <span
                                className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                                style={{
                                    color: chartColor,
                                    borderColor: `${chartColor}35`,
                                    backgroundColor: `${chartColor}0A`,
                                }}
                            >
                                {currentState === STATES.RECOVERED
                                    ? "Stable"
                                    : currentState === STATES.RECOVERING
                                      ? "Verifying"
                                      : "Unavailable"}
                            </span>
                        </div>

                        <p className="mt-1.5 text-sm leading-6 text-[#A0A396]">
                            {config.description}
                        </p>

                        {lastChecked && (
                            <p className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-xs text-[#85897B]">
                                <Clock3 size={13} />
                                Last checked: {formatTime(lastChecked)}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    {
                        state: STATES.CRASH,
                        subtitle: "Backend unavailable",
                    },
                    {
                        state: STATES.RECOVERING,
                        subtitle: "Verifying services",
                    },
                    {
                        state: STATES.RECOVERED,
                        subtitle: "Health checks passed",
                    },
                ].map(({ state, subtitle }) => (
                    <StateCard
                        key={state}
                        state={state}
                        subtitle={subtitle}
                        active={currentState === state}
                    />
                ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-[#30352A] bg-[#0C0F0C]/80 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]">
                <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <SectionHeading
                        eyebrow="Real-time telemetry"
                        title="Live Recovery Curve"
                        description="Service state recorded continuously over time."
                        icon={Activity}
                    />

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
                        {[
                            [STATES.CRASH, "Crash"],
                            [STATES.RECOVERING, "Recovering"],
                            [STATES.RECOVERED, "Recovered"],
                        ].map(([state, label]) => (
                            <span
                                key={state}
                                className="flex items-center gap-1.5 text-[11px] text-[#A0A396]"
                            >
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                        backgroundColor:
                                            STATE_CONFIG[state].color,
                                        boxShadow:
                                            currentState === state
                                                ? `0 0 8px ${STATE_CONFIG[state].color}70`
                                                : "none",
                                    }}
                                />
                                {label}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="px-2 pb-3 pt-4 sm:px-4">
                    <div className="h-56 w-full sm:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={chartData}
                                margin={{
                                    top: 12,
                                    right: 14,
                                    left: 0,
                                    bottom: 4,
                                }}
                            >
                                <CartesianGrid
                                    stroke="rgba(255,255,255,0.07)"
                                    vertical={false}
                                />

                                <XAxis
                                    dataKey="time"
                                    tick={{
                                        fill: "#85897B",
                                        fontSize: 10,
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={24}
                                />

                                <YAxis
                                    domain={[-0.15, 2.15]}
                                    ticks={[0, 1, 2]}
                                    tickFormatter={(value) => {
                                        if (value === 0) return "Crash";
                                        if (value === 1) return "Recovering";
                                        return "Recovered";
                                    }}
                                    tick={{
                                        fill: "#85897B",
                                        fontSize: 10,
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={76}
                                />

                                <Tooltip
                                    contentStyle={{
                                        background: "#171A14",
                                        border: "1px solid #414638",
                                        borderRadius: 10,
                                        color: "#F3F4EE",
                                        fontSize: 12,
                                        boxShadow:
                                            "0 8px 24px rgba(0,0,0,0.25)",
                                    }}
                                    labelStyle={{ color: "#A0A396" }}
                                    formatter={(value, _, item) => [
                                        item?.payload?.label ??
                                            STATE_CONFIG[currentState].label,
                                        "State",
                                    ]}
                                    labelFormatter={(label) => `Time: ${label}`}
                                />

                                <ReferenceLine
                                    y={2}
                                    stroke="rgba(222,237,0,0.13)"
                                    strokeDasharray="4 4"
                                />

                                <Line
                                    type="monotone"
                                    dataKey="level"
                                    name="Recovery state"
                                    stroke={chartColor}
                                    strokeWidth={2.5}
                                    dot={false}
                                    activeDot={{
                                        r: 5,
                                        fill: chartColor,
                                        stroke: "#10130F",
                                        strokeWidth: 2,
                                    }}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[#73776C]">
                            Monitoring window
                        </span>

                        <span className="font-mono text-[11px] text-[#A0A396]">
                            {chartData.length} / {MAX_POINTS} samples
                        </span>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#30352A] bg-[#0C0F0C]/80 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:px-5">
                    <SectionHeading
                        eyebrow="Audit trail"
                        title="Recent State Changes"
                        description="Recorded transitions between service states."
                        icon={Clock3}
                    />

                    <span className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#92968F]">
                        Latest first
                    </span>
                </div>

                <div className="p-3 sm:p-4">
                    {timeline.length === 0 ? (
                        <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/[0.10] px-4 py-5">
                            <Clock3
                                size={17}
                                className="shrink-0 text-[#73776C]"
                            />

                            <p className="text-sm text-[#92968F]">
                                No state changes recorded yet.
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                            {[...timeline].reverse().map((event) => {
                                const eventConfig = STATE_CONFIG[event.state];
                                const EventIcon = eventConfig.icon;

                                return (
                                    <div
                                        key={event.timestamp}
                                        className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-3 transition-colors duration-200 hover:border-white/[0.12] hover:bg-white/[0.03] sm:px-4"
                                    >
                                        <div
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                                            style={{
                                                color: eventConfig.color,
                                                borderColor: `${eventConfig.color}30`,
                                                backgroundColor: `${eventConfig.color}0D`,
                                            }}
                                        >
                                            <EventIcon size={15} />
                                        </div>

                                        <span
                                            className="min-w-0 flex-1 break-words text-xs font-medium sm:text-sm"
                                            style={{
                                                color: eventConfig.color,
                                            }}
                                        >
                                            {event.label}
                                        </span>

                                        <span className="shrink-0 font-mono text-[10px] text-[#85897B] sm:text-xs">
                                            {event.time}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#30352A] pt-4">
                <div className="flex items-center gap-2 text-xs text-[#85897B]">
                    <ShieldCheck size={14} className="text-[#DEED00]/80" />
                    <span>Backend · Database · Storefront</span>
                </div>

                <span className="font-mono text-[10px] uppercase tracking-wider text-[#73776C]">
                    Auto-refresh · 1.5s
                </span>
            </div>
        </section>
    );
}
