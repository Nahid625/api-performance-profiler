import {
  addSample,
  emptyCounts,
  isSuccess,
  MetricMode,
  MetricStore,
  MetricStoreOptions,
  RouteCounts,
  RouteMetric,
  RouteStats,
  statsFromCounts,
  summarize,
} from '@api-profiler/core';
import { LocalChannel, LocalChannelOptions } from './channel';
import { checkLoadRun } from './guard';
import { RecordedRequest, RequestRecorder, RequestSnapshot } from './recorder';
import { LoadRunner, LoadRunSummary } from './runner';

export type CapturedRequest = Omit<RequestSnapshot, 'method' | 'route'>;

export interface RequestOutcome {
  method: string;
  route: string;
  statusCode: number;
  mode?: MetricMode;
  request?: CapturedRequest;
}

export type FinishRequest = (outcome: RequestOutcome) => void;

export interface ProfilerOptions extends MetricStoreOptions {
  channel?: LocalChannelOptions | false;
  allowLoadOn?: string[];
}

export interface RunLoadOptions {
  method: string;
  route: string;
  target?: string;
  connections?: number;
  duration?: number;
  allowLoadOn?: string[];
}

export interface LoadResult {
  method: string;
  route: string;
  target: string;
  connections: number;
  durationSeconds: number;
  completedAt: number;
  stats: RouteStats | null;
  note: string | null;
  sent: LoadRunSummary;
}

const NO_SERVER_SIDE_FIGURES = 'the target did not report through this profiler';

const RECORDING_ENVIRONMENTS = new Set(['development', 'test']);

// Unset counts as local so `node server.js` just works; staging, production and anything else stay off.
export function recordingAllowed(env: string | undefined): boolean {
  const name = env?.trim().toLowerCase() ?? '';
  return name === '' || RECORDING_ENVIRONMENTS.has(name);
}

// Test suites create many profilers in parallel; they must not race for a port.
export function channelAllowed(env: string | undefined): boolean {
  const name = env?.trim().toLowerCase() ?? '';
  return name === '' || name === 'development';
}

export class Profiler {
  readonly store: MetricStore;
  readonly ready: Promise<string | null>;
  private readonly recorder: RequestRecorder | null;
  private readonly runner = new LoadRunner();
  private readonly channel: LocalChannel | null;
  private readonly allowLoadOn: string[];
  private activeRun: { key: string; counts: RouteCounts } | null = null;
  private readonly loadSnapshots = new Map<string, LoadResult>();

  constructor(options: ProfilerOptions = {}) {
    const { channel, allowLoadOn, ...storeOptions } = options;
    this.store = new MetricStore(storeOptions);
    this.allowLoadOn = allowLoadOn ?? [];

    const env = process.env.NODE_ENV;
    this.recorder = recordingAllowed(env) ? new RequestRecorder() : null;

    const wanted = channel !== false && (channel !== undefined || channelAllowed(env));
    this.channel = wanted && recordingAllowed(env) ? new LocalChannel(this, channel || {}) : null;
    this.ready = this.channel ? this.channel.start() : Promise.resolve(null);
  }

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  get channelUrl(): string | null {
    return this.channel?.url ?? null;
  }

  // hrtime is monotonic, so a clock adjustment mid-request can't skew duration.
  start(): FinishRequest {
    const startedAt = process.hrtime.bigint();

    return (outcome: RequestOutcome) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const mode = outcome.mode ?? 'observed';
      const metric: RouteMetric = {
        method: outcome.method,
        route: outcome.route,
        // Stamped at completion, since RPS counts requests that finished.
        timestamp: Date.now(),
        durationMs,
        statusCode: outcome.statusCode,
        success: isSuccess(outcome.statusCode),
        mode,
      };

      this.store.record(metric);

      if (mode === 'load' && this.activeRun?.key === keyOf(outcome.method, outcome.route)) {
        addSample(this.activeRun.counts, metric);
      }

      if (this.recorder && outcome.request) {
        this.recorder.record(
          { ...outcome.request, method: outcome.method, route: outcome.route },
          outcome.statusCode,
          mode,
        );
      }
    };
  }

  async runLoad(options: RunLoadOptions): Promise<LoadResult> {
    const method = options.method.toUpperCase();
    const key = keyOf(method, options.route);
    if (this.activeRun) {
      throw new Error(`a load run is already in progress (${this.activeRun.key})`);
    }

    const recording = this.recorder?.get(method, options.route);
    // The recording remembers where it was received, so a run needs no configured target.
    const target = options.target ?? recording?.origin ?? '';
    const check = checkLoadRun({
      method,
      route: options.route,
      target,
      recording,
      allowLoadOn: options.allowLoadOn ?? this.allowLoadOn,
      env: process.env.NODE_ENV,
    });
    if (!check.ok) {
      throw new Error(check.reason);
    }
    if (!recording) {
      throw new Error(`${key} has no recording`);
    }

    // Counted separately from the rolling window so a run longer than the window is still whole.
    this.activeRun = { key, counts: emptyCounts('load', method, options.route) };
    try {
      const sent = await this.runner.run({
        target,
        recording,
        connections: options.connections,
        duration: options.duration,
      });
      const stats = statsFromCounts(this.activeRun.counts, sent.durationSeconds);
      const result: LoadResult = {
        method,
        route: options.route,
        target,
        connections: sent.connections,
        durationSeconds: sent.durationSeconds,
        completedAt: Date.now(),
        stats,
        note: stats ? null : NO_SERVER_SIDE_FIGURES,
        sent,
      };
      this.loadSnapshots.set(key, result);
      return structuredClone(result);
    } finally {
      this.activeRun = null;
    }
  }

  stats(): RouteStats[] {
    return summarize(this.store);
  }

  recordings(): RecordedRequest[] {
    return this.recorder?.all() ?? [];
  }

  loadResults(): LoadResult[] {
    return [...this.loadSnapshots.values()].map((r) => structuredClone(r));
  }

  loadResult(method: string, route: string): LoadResult | undefined {
    const result = this.loadSnapshots.get(keyOf(method.toUpperCase(), route));
    return result ? structuredClone(result) : undefined;
  }

  reset(): void {
    this.store.clear();
    this.recorder?.clear();
    this.loadSnapshots.clear();
  }

  close(): Promise<void> {
    return this.channel?.stop() ?? Promise.resolve();
  }
}

function keyOf(method: string, route: string): string {
  return `${method.toUpperCase()} ${route}`;
}
