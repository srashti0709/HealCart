
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
        <section className="w-full space-y-5 rounded-2xl border border-white/10 bg-[#101014] p-5 text-white sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-white/45">
                        <Activity size={15} />
                        SELF-HEALING MONITOR
                    </div>

                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                        Backend Recovery Timeline
                    </h2>

                    <p className="mt-1 text-sm text-white/45">
                        Live service health and recovery monitoring
                    </p>
                </div>

                <div
                    className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium"
                    style={{
                        color: chartColor,
                        borderColor: `${chartColor}66`,
                        backgroundColor: `${chartColor}12`,
                    }}
                >
                    <StatusIcon size={17} />
                    {config.label}
                </div>
            </div>

            <div
                className="rounded-xl border p-4 sm:p-5"
                style={{
                    borderColor: `${chartColor}55`,
                    backgroundColor: `${chartColor}0D`,
                }}
            >
                <div className="flex items-start gap-3">
                    <div
                        className="rounded-lg p-2"
                        style={{
                            color: chartColor,
                            backgroundColor: `${chartColor}20`,
                        }}
                    >
                        <StatusIcon size={22} />
                    </div>

                    <div className="min-w-0 flex-1">
                        <h3
                            className="text-base font-semibold sm:text-lg"
                            style={{ color: chartColor }}
                        >
                            {config.label}
                        </h3>

                        <p className="mt-1 text-sm leading-6 text-white/60">
                            {config.description}
                        </p>

                        {lastChecked && (
                            <p className="mt-3 flex items-center gap-1.5 text-xs text-white/40">
                                <Clock3 size={13} />
                                Last checked: {formatTime(lastChecked)}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                    {
                        state: STATES.CRASH,
                        subtitle: "Backend unavailable",
                        icon: AlertTriangle,
                    },
                    {
                        state: STATES.RECOVERING,
                        subtitle: "Verifying services",
                        icon: Activity,
                    },
                    {
                        state: STATES.RECOVERED,
                        subtitle: "Health checks passed",
                        icon: CheckCircle2,
                    },
                ].map(({ state, subtitle, icon: Icon }) => {
                    const item = STATE_CONFIG[state];
                    const active = currentState === state;

                    return (
                        <div
                            key={state}
                            className="rounded-xl border p-3 transition-colors duration-300 sm:p-4"
                            style={{
                                borderColor: active
                                    ? `${item.color}85`
                                    : "rgba(255,255,255,0.08)",
                                backgroundColor: active
                                    ? `${item.color}12`
                                    : "rgba(255,255,255,0.02)",
                            }}
                        >
                            <Icon
                                size={19}
                                style={{ color: item.color }}
                            />

                            <p
                                className="mt-3 text-xs font-semibold sm:text-sm"
                                style={{
                                    color: active
                                        ? item.color
                                        : "rgba(255,255,255,0.7)",
                                }}
                            >
                                {item.label}
                            </p>

                            <p className="mt-1 text-[10px] text-white/35 sm:text-xs">
                                {subtitle}
                            </p>
                        </div>
                    );
                })}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3 sm:p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">
                            Live Recovery Curve
                        </h3>

                        <p className="mt-1 text-xs text-white/40">
                            The green curve moves continuously until a failure is detected.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                        {[
                            [STATES.CRASH, "Crash"],
                            [STATES.RECOVERING, "Recovering"],
                            [STATES.RECOVERED, "Recovered"],
                        ].map(([state, label]) => (
                            <span
                                key={state}
                                className="flex items-center gap-1.5"
                            >
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                        backgroundColor:
                                            STATE_CONFIG[state].color,
                                    }}
                                />
                                {label}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="h-56 w-full">
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
                                    fill: "#85858f",
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
                                    fill: "#85858f",
                                    fontSize: 10,
                                }}
                                axisLine={false}
                                tickLine={false}
                                width={76}
                            />

                            <Tooltip
                                contentStyle={{
                                    background: "#19191f",
                                    border: "1px solid #34343d",
                                    borderRadius: 10,
                                    color: "#fff",
                                    fontSize: 12,
                                }}
                                labelStyle={{ color: "#a1a1aa" }}
                                formatter={(value, _, item) => [
                                    item?.payload?.label ??
                                        STATE_CONFIG[currentState].label,
                                    "State",
                                ]}
                                labelFormatter={(label) => `Time: ${label}`}
                            />

                            <ReferenceLine
                                y={2}
                                stroke="rgba(34,197,94,0.15)"
                                strokeDasharray="4 4"
                            />

                            <Line
                                type="monotone"
                                dataKey="level"
                                name="Recovery state"
                                stroke={chartColor}
                                strokeWidth={3}
                                dot={false}
                                activeDot={{
                                    r: 5,
                                    fill: chartColor,
                                    stroke: "#101014",
                                    strokeWidth: 2,
                                }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                        Recent State Changes
                    </h3>

                    <span className="text-xs text-white/40">
                        Latest first
                    </span>
                </div>

                {timeline.length === 0 ? (
                    <p className="rounded-lg border border-white/[0.08] p-4 text-sm text-white/40">
                        No state changes recorded yet.
                    </p>
                ) : (
                    <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                        {[...timeline].reverse().map((event) => {
                            const eventConfig = STATE_CONFIG[event.state];
                            const EventIcon = eventConfig.icon;

                            return (
                                <div
                                    key={event.timestamp}
                                    className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
                                >
                                    <EventIcon
                                        size={17}
                                        style={{
                                            color: eventConfig.color,
                                        }}
                                    />

                                    <span
                                        className="flex-1 text-sm font-medium"
                                        style={{
                                            color: eventConfig.color,
                                        }}
                                    >
                                        {event.label}
                                    </span>

                                    <span className="text-xs text-white/40">
                                        {event.time}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
