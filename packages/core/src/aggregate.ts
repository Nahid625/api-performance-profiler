import { MetricStore } from './store';
import { MetricMode, RouteMetric } from './types';

// Fewer samples than this says nothing about capacity, so RPS stays null.
export const MIN_SAMPLES_FOR_RPS = 10;

export interface RouteStats {
  mode: MetricMode;
  method: string;
  route: string;
  count: number;
  averageMs: number;
  maxMs: number;
  errorCount: number;
  errorRate: number;
  rps: number | null;
}

export function aggregate(samples: RouteMetric[], windowSeconds: number): RouteStats | null {
  if (samples.length === 0) {
    return null;
  }

  let total = 0;
  let maxMs = 0;
  let errorCount = 0;

  for (const sample of samples) {
    total += sample.durationMs;
    maxMs = Math.max(maxMs, sample.durationMs);
    if (!sample.success) {
      errorCount++;
    }
  }

  const count = samples.length;
  const { mode, method, route } = samples[0];

  return {
    mode,
    method,
    route,
    count,
    averageMs: total / count,
    maxMs,
    errorCount,
    errorRate: errorCount / count,
    rps: count >= MIN_SAMPLES_FOR_RPS ? count / windowSeconds : null,
  };
}

export function summarize(store: MetricStore): RouteStats[] {
  const stats: RouteStats[] = [];
  for (const key of store.keys()) {
    const entry = aggregate(store.samples(key), store.windowSeconds);
    if (entry) {
      stats.push(entry);
    }
  }
  return stats;
}
