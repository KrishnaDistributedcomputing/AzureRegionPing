import { InvocationContext } from '@azure/functions';

export interface LatencyStats {
  min: number;
  avg: number;
  max: number;
  p50: number;
  p95: number;
  jitter: number;
  stddev: number;
  samples: number[];
}

/**
 * Measure latency to a target URL by performing HTTP HEAD requests.
 * Uses process.hrtime.bigint() for nanosecond precision.
 */
export async function measureLatency(
  targetUrl: string,
  sampleCount: number,
  context: InvocationContext
): Promise<LatencyStats> {
  const healthUrl = targetUrl.replace(/\/$/, '') + '/api/health';
  const samples: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const start = process.hrtime.bigint();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(healthUrl, {
        method: 'HEAD',
        signal: controller.signal,
        // Avoid caching to get real network latency
        headers: { 'Cache-Control': 'no-cache' },
      });
      clearTimeout(timeout);

      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000; // ns → ms
      samples.push(Math.round(durationMs * 100) / 100); // 2 decimal places
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (message.includes('abort')) {
        context.warn(`Timeout pinging ${healthUrl} (sample ${i + 1})`);
        samples.push(-1); // Mark as timeout
      } else {
        throw err; // Propagate real errors
      }
    }

    // Small delay between samples to avoid burst throttling
    if (i < sampleCount - 1) {
      await sleep(50);
    }
  }

  // Filter out timeouts for stats
  const validSamples = samples.filter((s) => s >= 0);

  if (validSamples.length === 0) {
    throw new Error(`All ${sampleCount} samples timed out`);
  }

  return computeStats(validSamples);
}

function computeStats(samples: number[]): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  const min = sorted[0];
  const max = sorted[n - 1];
  const avg = Math.round((samples.reduce((a, b) => a + b, 0) / n) * 100) / 100;
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.min(Math.floor(n * 0.95), n - 1)];

  // Jitter = average difference between consecutive samples
  let jitterSum = 0;
  for (let i = 1; i < samples.length; i++) {
    jitterSum += Math.abs(samples[i] - samples[i - 1]);
  }
  const jitter = samples.length > 1
    ? Math.round((jitterSum / (samples.length - 1)) * 100) / 100
    : 0;

  // Standard deviation
  const variance = samples.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / n;
  const stddev = Math.round(Math.sqrt(variance) * 100) / 100;

  return { min, avg, max, p50, p95, jitter, stddev, samples: sorted };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
