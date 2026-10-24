
import { useEffect, useState } from "react";
import axios from "axios";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Radio,
    ServerCrash,
    ShieldCheck,
} from "lucide-react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    API_BASE_URL,
    API_ENDPOINTS,
    CHAOS_CONTROLLER_URL,
} from "../config/api";

const WINDOW_SECONDS = 30;
const POLL_INTERVAL = 1000;

const secondOf = (time) => Math.floor(time / 1000) * 1000;

function emptyTimeline() {
    const now = secondOf(Date.now());

    return Array.from({ length: WINDOW_SECONDS }, (_, index) => {
        const timestamp =
            now - (WINDOW_SECONDS - 1 - index) * 1000;

        return {
            timestamp,
            time: new Date(timestamp).toLocaleTimeString([], {
                minute: "2-digit",
                second: "2-digit",
            }),
            attempted: 0,
            successful: 0,
            failed: 0,
            backendReceived: 0,
        };
    });
}

function readRecords(response) {
    const data = response?.data;

    if (Array.isArray(data?.requests)) return data.requests;
    if (Array.isArray(data?.records)) return data.records;
    if (Array.isArray(data)) return data;

    return [];
}

function readTimestamp(record) {
    const value =
        record?.timestamp ??
        record?.startedAt ??
        record?.createdAt;

    if (typeof value === "number") {
        return value < 1e12 ? value * 1000 : value;
    }

    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
}

function Metric({ label, value, detail, icon: Icon, color }) {
    return (
        <div className="rounded-xl border border-[#292D24] bg-[#141813] p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-[#92968F]">
                    {label}
                </span>
                <Icon size={17} style={{ color }} />
            </div>
            <div className="mt-3 text-2xl font-semibold text-[#F3F4EE]">
                {value}
            </div>
            <p className="mt-1 text-xs text-[#92968F]">{detail}</p>
        </div>
    );
}

export default function LiveApiTrafficChart() {
    const [points, setPoints] = useState(emptyTimeline);
    const [backendOnline, setBackendOnline] = useState(null);
    const [controllerOnline, setControllerOnline] = useState(null);
    const [trafficRunActive, setTrafficRunActive] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [hasTrafficData, setHasTrafficData] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let timer;

        async function refresh() {
            const [metricsResult, requestsResult, statusResult] =
                await Promise.allSettled([
                    axios.get(`${API_BASE_URL}/api/metrics/traffic`, {
                        timeout: 1800,
                    }),
                    axios.get(API_ENDPOINTS.trafficRequests, {
                        timeout: 4000,
                        params: { limit: 200 },
                    }),
                    axios.get(API_ENDPOINTS.trafficStatus, {
                        timeout: 4000,
                    }),
                ]);

            if (cancelled) return;

            const backendAvailable = metricsResult.status === "fulfilled";
            const controllerAvailable = requestsResult.status === "fulfilled";

            setBackendOnline(backendAvailable);
            setControllerOnline(controllerAvailable);

            if (statusResult.status === "fulfilled") {
                const status = statusResult.value.data;
                setTrafficRunActive(status.running === true);
            }

            const records = controllerAvailable
                ? readRecords(requestsResult.value)
                : [];

            const now = Date.now();
            const currentSecond = secondOf(now);
            const oldestSecond =
                currentSecond - (WINDOW_SECONDS - 1) * 1000;

            const buckets = new Map();

            for (let i = 0; i < WINDOW_SECONDS; i += 1) {
                const timestamp = oldestSecond + i * 1000;

                buckets.set(timestamp, {
                    timestamp,
                    time: new Date(timestamp).toLocaleTimeString([], {
                        minute: "2-digit",
                        second: "2-digit",
                    }),
                    attempted: 0,
                    successful: 0,
                    failed: 0,
                    backendReceived: 0,
                });
            }

            // Count each synthetic request by its recorded start time.
            // Do not depend on the backend being alive to count attempts.
            for (const record of records) {
                const timestamp = readTimestamp(record);

                if (
                    timestamp === null ||
                    timestamp < oldestSecond ||
                    timestamp > now
                ) {
                    continue;
                }

                if (record.outcome === "aborted") continue;

                const bucket = buckets.get(secondOf(timestamp));
                if (!bucket) continue;

                bucket.attempted += 1;

                if (
                    record.success === true ||
                    record.outcome === "success"
                ) {
                    bucket.successful += 1;
                } else {
                    bucket.failed += 1;
                }
            }

            // Actual requests that reached the Express backend.
            // This series can fall to zero during a backend crash.
            if (backendAvailable) {
                const backendPoints =
                    metricsResult.value.data?.points ?? [];

                for (const item of backendPoints) {
                    const parsed = Date.parse(item.timestamp);
                    if (Number.isNaN(parsed)) continue;

                    const bucket = buckets.get(secondOf(parsed));
                    if (bucket) {
                        bucket.backendReceived =
                            Number(item.requests) || 0;
                    }
                }
            }

            const nextPoints = Array.from(buckets.values());

            setPoints(nextPoints);
            setHasTrafficData(records.length > 0);
            setUpdatedAt(new Date());
            timer = setTimeout(refresh, POLL_INTERVAL);
        }

        refresh();

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, []);

    const totals = points.reduce(
        (result, point) => ({
            attempted: result.attempted + point.attempted,
            successful: result.successful + point.successful,
            failed: result.failed + point.failed,
            backendReceived:
                result.backendReceived + point.backendReceived,
        }),
        {
            attempted: 0,
            successful: 0,
            failed: 0,
            backendReceived: 0,
        }
    );

    const peak = Math.max(
        0,
        ...points.map((point) => point.attempted)
    );

    const incidentDetected =
        totals.failed > 0 || backendOnline === false;

    const incidentStatus = incidentDetected
        ? backendOnline === false
            ? "BACKEND UNAVAILABLE"
            : "REQUEST FAILURES DETECTED"
        : trafficRunActive
            ? "TRAFFIC RUNNING"
            : hasTrafficData
                ? "TRAFFIC RECORDED"
                : "WAITING FOR TRAFFIC";

    const incidentColor = incidentDetected
        ? "#FF5C5C"
        : trafficRunActive
            ? "#F5B942"
            : "#35D07F";

    const explanation = incidentDetected
        ? "SHCom is detecting failed requests or an unavailable backend. Watch the failed-request line and confirm recovery using the service health indicators."
        : trafficRunActive
            ? "Synthetic requests are being sent to the backend. A failure will appear here when the controller records an unsuccessful request."
            : hasTrafficData
                ? "Previous synthetic traffic is available. Start a traffic run to observe live request counts."
                : "No synthetic request records are available yet. Start a synthetic traffic run from the Chaos Center.";

    const formatTime = (value) =>
        new Date(value).toLocaleTimeString([], {
            minute: "2-digit",
            second: "2-digit",
        });

    return (
        <section className="space-y-4 rounded-2xl border border-[#292D24] bg-[#0D0F0D] p-5 text-[#F3F4EE]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity size={20} className="text-[#DEED00]" />
                        <h2 className="text-lg font-semibold">
                            Storefront Traffic & Recovery
                        </h2>
                    </div>
                    <p className="mt-1 text-sm text-[#92968F]">
                        Live request outcomes · rolling 30-second window
                    </p>
                </div>

                <div
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                    style={{
                        color: incidentColor,
                        borderColor: `${incidentColor}55`,
                        backgroundColor: `${incidentColor}10`,
                    }}
                >
                    <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: incidentColor }}
                    />
                    {incidentStatus}
                </div>
            </div>

            <div
                className="flex items-start gap-3 rounded-xl border p-4"
                style={{
                    borderColor: `${incidentColor}55`,
                    backgroundColor: `${incidentColor}0D`,
                }}
            >
                {incidentDetected ? (
                    <ServerCrash
                        size={21}
                        style={{ color: incidentColor }}
                    />
                ) : trafficRunActive ? (
                    <Radio
                        size={21}
                        style={{ color: incidentColor }}
                    />
                ) : (
                    <ShieldCheck
                        size={21}
                        style={{ color: incidentColor }}
                    />
                )}

                <div>
                    <p className="text-sm font-semibold">
                        What is happening?
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#C0C4B9]">
                        {explanation}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                    label="Requests attempted"
                    value={totals.attempted}
                    detail="Synthetic requests in 30 seconds"
                    icon={Radio}
                    color="#DEED00"
                />
                <Metric
                    label="Successful requests"
                    value={totals.successful}
                    detail="Completed successfully"
                    icon={CheckCircle2}
                    color="#35D07F"
                />
                <Metric
                    label="Failed requests"
                    value={totals.failed}
                    detail="Unsuccessful synthetic requests"
                    icon={AlertTriangle}
                    color="#FF5C5C"
                />
                <Metric
                    label="Backend received"
                    value={totals.backendReceived}
                    detail="Requests reaching Express"
                    icon={Activity}
                    color="#A78BFA"
                />
            </div>

            <div className="rounded-xl border border-[#292D24] bg-[#11140F] p-3 sm:p-4">
                <div className="mb-4">
                    <h3 className="text-sm font-semibold">
                        Every request tells the story
                    </h3>
                    <p className="mt-1 text-xs text-[#92968F]">
                        Vertical axis: number of API requests per second.
                        Horizontal axis: time.
                    </p>
                </div>

                <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <span className="flex items-center gap-2">
                        <span className="h-0.5 w-4 bg-[#DEED00]" />
                        Attempted
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="h-0.5 w-4 bg-[#35D07F]" />
                        Successful
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="h-0.5 w-4 bg-[#FF5C5C]" />
                        Failed
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="h-0.5 w-4 bg-[#A78BFA]" />
                        Reached backend
                    </span>
                </div>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={points}
                            margin={{
                                top: 8,
                                right: 12,
                                left: -12,
                                bottom: 4,
                            }}
                        >
                            <CartesianGrid
                                stroke="#292D24"
                                strokeDasharray="3 4"
                                vertical={false}
                            />

                            <XAxis
                                dataKey="timestamp"
                                type="number"
                                scale="time"
                                domain={["dataMin", "dataMax"]}
                                tickFormatter={formatTime}
                                tick={{ fill: "#92968F", fontSize: 10 }}
                                axisLine={{ stroke: "#292D24" }}
                                tickLine={false}
                                minTickGap={24}
                            />

                            <YAxis
                                allowDecimals={false}
                                domain={[0, (max) => Math.max(5, max)]}
                                tick={{ fill: "#92968F", fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                width={36}
                            />

                            <Tooltip
                                labelFormatter={(value) =>
                                    `Time: ${formatTime(value)}`
                                }
                                formatter={(value, name) => [
                                    value,
                                    {
                                        attempted: "Requests attempted",
                                        successful: "Successful requests",
                                        failed: "Failed requests",
                                        backendReceived: "Reached backend",
                                    }[name] ?? name,
                                ]}
                                contentStyle={{
                                    backgroundColor: "#141813",
                                    border: "1px solid #292D24",
                                    borderRadius: "10px",
                                    color: "#F3F4EE",
                                    fontSize: "12px",
                                }}
                            />

                            <Line
                                type="monotone"
                                dataKey="attempted"
                                name="attempted"
                                stroke="#DEED00"
                                strokeWidth={2.5}
                                dot={false}
                                isAnimationActive={false}
                            />

                            <Line
                                type="monotone"
                                dataKey="successful"
                                name="successful"
                                stroke="#35D07F"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />

                            <Line
                                type="monotone"
                                dataKey="failed"
                                name="failed"
                                stroke="#FF5C5C"
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                            />

                            <Line
                                type="monotone"
                                dataKey="backendReceived"
                                name="backendReceived"
                                stroke="#A78BFA"
                                strokeWidth={2}
                                strokeDasharray="5 4"
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-[#292D24] pt-3 text-xs text-[#92968F]">
                    <span>
                        {updatedAt
                            ? `Last updated ${updatedAt.toLocaleTimeString()}`
                            : "Connecting to traffic sources…"}
                    </span>
                    <span>
                        {controllerOnline === false
                            ? "Traffic controller disconnected"
                            : controllerOnline === true
                                ? "Traffic controller connected"
                                : "Checking controller"}
                    </span>
                </div>

                {controllerOnline === false && (
                    <p className="mt-3 text-sm text-[#FF5C5C]">
                        The controller is unreachable. Failed requests cannot be
                        displayed until the controller endpoint is available.
                    </p>
                )}
            </div>
        </section>
    );
}
