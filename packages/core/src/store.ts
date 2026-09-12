import { RouteMetric } from './types';

const DEFAULT_WINDOW_MS = 5000;

export interface MetricStoreOptions {
  windowMs?: number;
}

// Mode is part of the key so observed and load-test samples can never mix.
export function metricKey(metric: RouteMetric): string {
  return `${metric.mode} ${metric.method} ${metric.route}`;
}

export class MetricStore {
  private readonly windowMs: number;
  private readonly buckets = new Map<string, RouteMetric[]>();

  constructor(options: MetricStoreOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  }

  get windowSeconds(): number {
    return this.windowMs / 1000;
  }

  record(metric: RouteMetric): void {
    const key = metricKey(metric);
    const bucket = this.buckets.get(key);
    if (!bucket) {
      this.buckets.set(key, [metric]);
      return;
    }
    bucket.push(metric);
    this.prune(key, bucket);
  }

  samples(key: string): RouteMetric[] {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return [];
    }
    this.prune(key, bucket);
    return [...bucket];
  }

  keys(): string[] {
    for (const [key, bucket] of [...this.buckets]) {
      this.prune(key, bucket);
    }
    return [...this.buckets.keys()];
  }

  clear(): void {
    this.buckets.clear();
  }

  // Samples arrive in completion order, so expired ones are always at the front.
  private prune(key: string, bucket: RouteMetric[]): void {
    const cutoff = Date.now() - this.windowMs;
    let expired = 0;
    while (expired < bucket.length && bucket[expired].timestamp <= cutoff) {
      expired++;
    }
    if (expired > 0) {
      bucket.splice(0, expired);
    }
    if (bucket.length === 0) {
      this.buckets.delete(key);
    }
  }
}
