import { reliabilitySummary } from "../lib/serviceHealth";

const formatDuration = (value) => {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} sec`;
  return `${(value / 60000).toFixed(1)} min`;
};

export default function ReliabilitySummary({ incidents = [], error = "" }) {
  const summary = reliabilitySummary(incidents);
  const rate = summary.successRate === null ? "Unavailable" : `${(summary.successRate * 100).toFixed(1)}%`;
  return (
    <section className="my-6 rounded-2xl border border-slate-800 bg-[#0d1320] p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Reliability summary</h3>
          <p className="mt-1 text-xs text-slate-500">Calculated from recorded backend incident timestamps only.</p>
        </div>
        {error && <span className="text-xs text-amber-300">Incident data unavailable; showing last retrieved records.</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Recorded incidents" value={error && !incidents.length ? "Unavailable" : summary.totalRecorded} />
        <Metric label="Resolved / failed" value={error && !incidents.length ? "Unavailable" : `${summary.recovered} / ${summary.completed}`} />
        <Metric label="Closed incident resolution rate" value={rate} />
        <Metric label="Mean measured recovery" value={formatDuration(summary.meanRecoveryMs)} />
        <Metric label="Measured durations" value={summary.measuredRecoveryCount} />
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-200">{value}</p></div>;
}
