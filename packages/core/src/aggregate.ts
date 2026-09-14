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

export interface RouteCounts {
  mode: MetricMode;
  method: string;
  route: string;
  count: number;
  totalMs: number;
  maxMs: number;
  errorCount: number;
}

export function emptyCounts(mode: MetricMode, method: string, route: string): RouteCounts {
  return { mode, method, route, count: 0, totalMs: 0, maxMs: 0, errorCount: 0 };
}

export function addSample(counts: RouteCounts, sample: RouteMetric): void {
  counts.count++;
  counts.totalMs += sample.durationMs;
  counts.maxMs = Math.max(counts.maxMs, sample.durationMs);
  if (!sample.success) {
    counts.errorCount++;
  }
}

// The one place the averaging, error-rate and RPS rules live.
export function statsFromCounts(counts: RouteCounts, seconds: number): RouteStats | null {
  const { mode, method, route, count, totalMs, maxMs, errorCount } = counts;
  if (count === 0) {
    return null;
  }
  return {
    mode,
    method,
    route,
    count,
    averageMs: totalMs / count,
    maxMs,
    errorCount,
    errorRate: errorCount / count,
    rps: count >= MIN_SAMPLES_FOR_RPS && seconds > 0 ? count / seconds : null,
  };
}

export function aggregate(samples: RouteMetric[], windowSeconds: number): RouteStats | null {
  if (samples.length === 0) {
    return null;
  }
  const { mode, method, route } = samples[0];
  const counts = emptyCounts(mode, method, route);
  for (const sample of samples) {
    addSample(counts, sample);
  }
  return statsFromCounts(counts, windowSeconds);
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
