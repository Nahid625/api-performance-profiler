import type { RouteStats } from '@api-profiler/core';
import type { LoadResult, MaskedRecording } from '@api-profiler/node';

export const DEFAULT_PORT = 4780;

export interface Health {
  ok: boolean;
  version: string;
}

export interface RunRequest {
  method: string;
  route: string;
  target?: string;
  connections?: number;
  duration?: number;
}

export class ChannelUnreachable extends Error {
  constructor(readonly baseUrl: string) {
    super(
      `could not reach the profiler at ${baseUrl}.\n` +
        'Is the app running with app.use(profiler())? In development it listens on ' +
        `127.0.0.1:${DEFAULT_PORT}; pass --port if you changed it.`,
    );
  }
}

export class ChannelRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class ChannelClient {
  constructor(readonly baseUrl: string) {}

  health(): Promise<Health> {
    return this.get('/health');
  }

  stats(): Promise<RouteStats[]> {
    return this.get('/stats');
  }

  recordings(): Promise<MaskedRecording[]> {
    return this.get('/recordings');
  }

  loadResults(): Promise<LoadResult[]> {
    return this.get('/load-results');
  }

  startRun(request: RunRequest): Promise<LoadResult> {
    return this.send('/load-runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  }

  private get<T>(path: string): Promise<T> {
    return this.send<T>(path, { method: 'GET' });
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, init);
    } catch {
      throw new ChannelUnreachable(this.baseUrl);
    }
    const body = (await res.json()) as T | { error?: string };
    if (!res.ok) {
      const error = (body as { error?: string }).error ?? `HTTP ${res.status}`;
      throw new ChannelRefused(res.status, error);
    }
    return body as T;
  }
}

export function channelUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
