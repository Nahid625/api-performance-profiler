import {
  isSuccess,
  MetricMode,
  MetricStore,
  MetricStoreOptions,
  RouteStats,
  summarize,
} from '@api-profiler/core';
import { RecordedRequest, RequestRecorder, RequestSnapshot } from './recorder';

export type CapturedRequest = Omit<RequestSnapshot, 'method' | 'route'>;

export interface RequestOutcome {
  method: string;
  route: string;
  statusCode: number;
  mode?: MetricMode;
  request?: CapturedRequest;
}

export type FinishRequest = (outcome: RequestOutcome) => void;

const RECORDING_ENVIRONMENTS = new Set(['development', 'test']);

// Unset counts as local so `node server.js` just works; staging, production and anything else stay off.
export function recordingAllowed(env: string | undefined): boolean {
  const name = env?.trim().toLowerCase() ?? '';
  return name === '' || RECORDING_ENVIRONMENTS.has(name);
}

export class Profiler {
  readonly store: MetricStore;
  private readonly recorder: RequestRecorder | null;

  constructor(options: MetricStoreOptions = {}) {
    this.store = new MetricStore(options);
    this.recorder = recordingAllowed(process.env.NODE_ENV) ? new RequestRecorder() : null;
  }

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  // hrtime is monotonic, so a clock adjustment mid-request can't skew duration.
  start(): FinishRequest {
    const startedAt = process.hrtime.bigint();

    return (outcome: RequestOutcome) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const mode = outcome.mode ?? 'observed';

      this.store.record({
        method: outcome.method,
        route: outcome.route,
        // Stamped at completion, since RPS counts requests that finished.
        timestamp: Date.now(),
        durationMs,
        statusCode: outcome.statusCode,
        success: isSuccess(outcome.statusCode),
        mode,
      });

      if (this.recorder && outcome.request) {
        this.recorder.record(
          { ...outcome.request, method: outcome.method, route: outcome.route },
          outcome.statusCode,
          mode,
        );
      }
    };
  }

  stats(): RouteStats[] {
    return summarize(this.store);
  }

  recordings(): RecordedRequest[] {
    return this.recorder?.all() ?? [];
  }

  reset(): void {
    this.store.clear();
    this.recorder?.clear();
  }
}
