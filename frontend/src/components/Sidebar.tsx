import { motion, AnimatePresence } from 'framer-motion';
import { usePingStore, PingResult } from '../store/pingStore';

interface SidebarProps {
  onRegionClick: (source: string, target: string) => void;
}

export default function Sidebar({ onRegionClick }: SidebarProps) {
  const { results, status, summary, regions } = usePingStore();

  const getRegionName = (id: string) =>
    regions.find((r) => r.id === id)?.displayName ?? id;

  return (
    <aside className="w-80 bg-[var(--color-surface)] border-l border-white/10 flex flex-col overflow-hidden">
      {/* Title */}
      <div className="px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">
          Live Results
        </h2>
        {status === 'testing' && (
          <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-300"
              style={{ width: `${Math.min((results.length / 24) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {results.map((result, i) => (
            <ResultRow
              key={`${result.source}-${result.target}`}
              result={result}
              rank={i + 1}
              regionName={getRegionName(result.target)}
              onClick={() => onRegionClick(result.source, result.target)}
            />
          ))}
        </AnimatePresence>

        {status === 'idle' && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-dim)] text-sm px-6 text-center">
            <span className="text-4xl mb-3">🎯</span>
            <p>Select a source region and hit <strong>Ping</strong> to see latency results stream in.</p>
            <p className="mt-2 text-xs">Try <strong>Mesh</strong> mode for the full fireworks show.</p>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {summary && (
        <div className="px-4 py-3 border-t border-white/10 bg-[var(--color-bg)]/50 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-dim)]">Fastest</span>
            <span className="text-[var(--color-fast)] font-mono">
              {summary.fastestPair
                ? `${getRegionName(summary.fastestPair.target)} ${summary.fastestPair.avgMs}ms`
                : '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-dim)]">Slowest</span>
            <span className="text-[var(--color-very-slow)] font-mono">
              {summary.slowestPair
                ? `${getRegionName(summary.slowestPair.target)} ${summary.slowestPair.avgMs}ms`
                : '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-dim)]">Average</span>
            <span className="font-mono">{summary.globalAvgMs}ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-dim)]">Success</span>
            <span className="font-mono">{summary.regionsOk}/{summary.regionsOk + summary.regionsFailed}</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="flex-1 px-2 py-1 text-xs border border-white/20 rounded hover:bg-white/10 transition">
              🔗 Share
            </button>
            <button className="flex-1 px-2 py-1 text-xs border border-white/20 rounded hover:bg-white/10 transition">
              📥 CSV
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function ResultRow({
  result,
  rank,
  regionName,
  onClick,
}: {
  result: PingResult;
  rank: number;
  regionName: string;
  onClick: () => void;
}) {
  const avgMs = result.latency?.avg;
  const color =
    !avgMs || result.status !== 'ok'
      ? 'var(--color-very-slow)'
      : avgMs < 50
        ? 'var(--color-fast)'
        : avgMs < 150
          ? 'var(--color-medium)'
          : avgMs < 250
            ? 'var(--color-slow)'
            : 'var(--color-very-slow)';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer transition"
    >
      {/* Rank */}
      <span className="text-xs font-mono text-[var(--color-text-dim)] w-6 text-right">{rank}</span>

      {/* Color indicator */}
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />

      {/* Region name */}
      <span className="flex-1 text-sm truncate">{regionName}</span>

      {/* Latency */}
      <span className="font-mono text-sm font-medium" style={{ color }}>
        {result.status === 'ok' && avgMs ? `${Math.round(avgMs)}ms` : '—'}
      </span>

      {/* Status icon */}
      <span className="text-xs">
        {result.status === 'ok' ? '✓' : result.status === 'timeout' ? '⏱' : '✗'}
      </span>
    </motion.div>
  );
}
