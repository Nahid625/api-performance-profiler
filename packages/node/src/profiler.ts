import {
  isSuccess,
  MetricMode,
  MetricStore,
  MetricStoreOptions,
  RouteStats,
  summarize,
} from '@api-profiler/core';

export interface RequestOutcome {
  method: string;
  route: string;
  statusCode: number;
  mode?: MetricMode;
}

export type FinishRequest = (outcome: RequestOutcome) => void;

export class Profiler {
  readonly store: MetricStore;

  constructor(options: MetricStoreOptions = {}) {
    this.store = new MetricStore(options);
  }

  // hrtime is monotonic, so a clock adjustment mid-request can't skew duration.
  start(): FinishRequest {
    const startedAt = process.hrtime.bigint();

    return (outcome: RequestOutcome) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.store.record({
        method: outcome.method,
        route: outcome.route,
        // Stamped at completion, since RPS counts requests that finished.
        timestamp: Date.now(),
        durationMs,
        statusCode: outcome.statusCode,
        success: isSuccess(outcome.statusCode),
        mode: outcome.mode ?? 'observed',
      });
    };
  }

  stats(): RouteStats[] {
    return summarize(this.store);
  }

  reset(): void {
    this.store.clear();
  }
}
