import { useEffect } from 'react';
import { usePingStore } from '../store/pingStore';
import { fetchRegions, startPingTest } from '../services/api';

export default function Header() {
  const { sourceRegion, mode, status, regions, setSourceRegion, setMode, setRegions, startPing, addResult, addArc, completePing, setError, reset } =
    usePingStore();

  // Load regions on mount
  useEffect(() => {
    fetchRegions()
      .then((data) => {
        setRegions(
          data.regions.map((r) => ({
            id: r.id,
            displayName: r.displayName,
            lat: r.lat,
            lng: r.lng,
            status: r.status,
          }))
        );
      })
      .catch((err) => console.error('Failed to load regions:', err));
  }, [setRegions]);

  const handlePing = async () => {
    if (status === 'testing') return;

    reset();
    startPing('pending');

    try {
      const response = await startPingTest({
        mode,
        sourceRegion: mode === 'single' ? sourceRegion : undefined,
        samples: 5,
      });

      const allRegions = usePingStore.getState().regions;
      
      // Process results — add arcs and results for each
      for (const r of response.results) {
        const srcRegion = allRegions.find((reg) => reg.id === r.source);
        const tgtRegion = allRegions.find((reg) => reg.id === r.target);
        
        if (srcRegion && tgtRegion) {
          const color = r.latency ? latencyToColor(r.latency.avg) : '#ef4444';
          addArc({
            startLat: srcRegion.lat, startLng: srcRegion.lng,
            endLat: tgtRegion.lat, endLng: tgtRegion.lng,
            color, source: r.source, target: r.target,
            latencyMs: r.latency?.avg, animating: false,
          });
        }

        if (r.latency) {
          addResult({
            source: r.source, target: r.target,
            latency: r.latency, status: r.status as 'ok' | 'timeout' | 'error',
            timestamp: r.timestamp,
          });
        }
      }

      completePing({
        regionsOk: response.summary.regionsOk,
        regionsFailed: response.summary.regionsFailed,
        fastestPair: response.summary.fastestPair ?? undefined,
        slowestPair: response.summary.slowestPair ?? undefined,
        globalAvgMs: response.summary.globalAvgMs,
      });
    } catch (err) {
      console.error('Failed to start ping:', err);
      setError();
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[var(--color-surface)] border-b border-white/10">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🌐</span>
        <h1 className="text-lg font-bold text-[var(--color-accent)]">AzureRegionPing</h1>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setMode('single')}
            className={`px-3 py-1 rounded-l-md border border-white/20 transition ${
              mode === 'single'
                ? 'bg-[var(--color-accent)] text-black font-medium'
                : 'bg-transparent text-[var(--color-text-dim)] hover:text-white'
            }`}
          >
            Single
          </button>
          <button
            onClick={() => setMode('mesh')}
            className={`px-3 py-1 rounded-r-md border border-white/20 border-l-0 transition ${
              mode === 'mesh'
                ? 'bg-[var(--color-accent)] text-black font-medium'
                : 'bg-transparent text-[var(--color-text-dim)] hover:text-white'
            }`}
          >
            Mesh
          </button>
        </div>

        {/* Source region selector (only in single mode) */}
        {mode === 'single' && (
          <select
            value={sourceRegion}
            onChange={(e) => setSourceRegion(e.target.value)}
            className="bg-[var(--color-bg)] text-[var(--color-text)] border border-white/20 rounded-md px-3 py-1.5 text-sm"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName}
              </option>
            ))}
          </select>
        )}

        {/* Ping button */}
        <button
          onClick={handlePing}
          disabled={status === 'testing'}
          className={`px-5 py-1.5 rounded-md font-semibold text-sm transition ${
            status === 'testing'
              ? 'bg-[var(--color-accent)]/50 text-black/50 cursor-not-allowed'
              : 'bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/80 hover:shadow-lg hover:shadow-[var(--color-accent)]/20'
          }`}
        >
          {status === 'testing' ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Pinging...
            </span>
          ) : (
            '🚀 Ping'
          )}
        </button>
      </div>
    </header>
  );
}

function latencyToColor(ms: number): string {
  if (ms < 50) return '#22c55e';
  if (ms < 150) return '#eab308';
  if (ms < 250) return '#f97316';
  return '#ef4444';
}
