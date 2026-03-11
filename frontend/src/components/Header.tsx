import { useEffect } from 'react';
import { usePingStore } from '../store/pingStore';
import { fetchRegions, startPingTest } from '../services/api';
import { connectSignalR } from '../services/signalr';

export default function Header() {
  const { sourceRegion, mode, status, regions, setSourceRegion, setMode, setRegions, startPing, reset } =
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

    try {
      const response = await startPingTest({
        mode,
        sourceRegion: mode === 'single' ? sourceRegion : undefined,
        samples: 5,
      });

      startPing(response.sessionId);

      // Connect SignalR for real-time results
      await connectSignalR(response.sessionId);
    } catch (err) {
      console.error('Failed to start ping:', err);
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
