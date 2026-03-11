import { motion } from 'framer-motion';
import { usePingStore } from '../store/pingStore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DetailPanelProps {
  source: string;
  target: string;
  onClose: () => void;
}

export default function DetailPanel({ source, target, onClose }: DetailPanelProps) {
  const { results, regions } = usePingStore();

  const result = results.find((r) => r.source === source && r.target === target);
  const sourceName = regions.find((r) => r.id === source)?.displayName ?? source;
  const targetName = regions.find((r) => r.id === target)?.displayName ?? target;

  if (!result || !result.latency) return null;

  const { latency } = result;

  // Build histogram data from samples
  const histogramData = latency.samples.map((ms, i) => ({
    sample: i + 1,
    latency: Math.round(ms * 100) / 100,
  }));

  const latencyColor =
    latency.avg < 50
      ? 'var(--color-fast)'
      : latency.avg < 150
        ? 'var(--color-medium)'
        : latency.avg < 250
          ? 'var(--color-slow)'
          : 'var(--color-very-slow)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-4 left-4 right-4 bg-[var(--color-surface)] border border-white/10 rounded-xl p-5 shadow-2xl backdrop-blur max-w-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">
          <span className="text-[var(--color-accent)]">{sourceName}</span>
          <span className="text-[var(--color-text-dim)] mx-2">→</span>
          <span className="text-[var(--color-accent)]">{targetName}</span>
        </h3>
        <button
          onClick={onClose}
          className="text-[var(--color-text-dim)] hover:text-white transition text-lg"
        >
          ✕
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard label="Average" value={`${latency.avg}ms`} color={latencyColor} large />
        <StatCard label="P50" value={`${latency.p50}ms`} />
        <StatCard label="P95" value={`${latency.p95}ms`} />
        <StatCard label="Min" value={`${latency.min}ms`} color="var(--color-fast)" />
        <StatCard label="Max" value={`${latency.max}ms`} color="var(--color-very-slow)" />
        <StatCard label="Jitter" value={`${latency.jitter}ms`} />
      </div>

      {/* Sample chart */}
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histogramData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="sample"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
              unit="ms"
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-bg)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelFormatter={(v) => `Sample ${v}`}
              formatter={(value: number) => [`${value}ms`, 'Latency']}
            />
            <Bar dataKey="latency" fill={latencyColor} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sample trail */}
      <div className="mt-3 flex items-center gap-1 text-xs text-[var(--color-text-dim)] font-mono">
        {latency.samples.map((s, i) => (
          <span key={i}>
            {Math.round(s)}ms
            {i < latency.samples.length - 1 && <span className="text-white/20 mx-0.5">→</span>}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function StatCard({
  label,
  value,
  color,
  large,
}: {
  label: string;
  value: string;
  color?: string;
  large?: boolean;
}) {
  return (
    <div className="bg-[var(--color-bg)] rounded-lg px-3 py-2">
      <div className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">{label}</div>
      <div
        className={`font-mono font-bold ${large ? 'text-xl' : 'text-sm'}`}
        style={{ color: color || 'var(--color-text)' }}
      >
        {value}
      </div>
    </div>
  );
}
