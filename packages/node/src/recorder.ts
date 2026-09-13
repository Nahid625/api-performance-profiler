import { MetricMode, UNMATCHED_ROUTE } from '@api-profiler/core';

export const MAX_RECORDED_BODY_BYTES = 64 * 1024;

const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
]);

export interface RequestSnapshot {
  method: string;
  route: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  bodyUnavailable: boolean;
}

export interface RecordedRequest {
  method: string;
  route: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  bodyUnavailable: boolean;
  recordedAt: number;
}

export class RequestRecorder {
  private readonly recordings = new Map<string, RecordedRequest>();

  record(snapshot: RequestSnapshot, statusCode: number, mode: MetricMode): void {
    // Strictly 2xx: replaying a redirect would time the redirect, not the route.
    if (mode !== 'observed' || statusCode < 200 || statusCode >= 300) {
      return;
    }
    if (snapshot.route === UNMATCHED_ROUTE) {
      return;
    }

    const size = bodySize(snapshot);
    if (size === null || size > MAX_RECORDED_BODY_BYTES) {
      return;
    }

    let body: unknown;
    try {
      body = structuredClone(snapshot.body);
    } catch {
      return;
    }

    this.recordings.set(keyOf(snapshot.method, snapshot.route), {
      method: snapshot.method,
      route: snapshot.route,
      url: snapshot.url,
      headers: replayableHeaders(snapshot.headers),
      body,
      bodyUnavailable: snapshot.bodyUnavailable,
      recordedAt: Date.now(),
    });
  }

  get(method: string, route: string): RecordedRequest | undefined {
    const recording = this.recordings.get(keyOf(method, route));
    return recording ? structuredClone(recording) : undefined;
  }

  all(): RecordedRequest[] {
    return [...this.recordings.values()].map((recording) => structuredClone(recording));
  }

  clear(): void {
    this.recordings.clear();
  }
}

function keyOf(method: string, route: string): string {
  return `${method} ${route}`;
}

// null means the size couldn't be determined, so the request is not kept.
function bodySize(snapshot: RequestSnapshot): number | null {
  const declared = snapshot.headers['content-length'];
  if (typeof declared === 'string' && declared.trim() !== '') {
    const bytes = Number(declared);
    return Number.isFinite(bytes) ? bytes : null;
  }
  if (snapshot.body === undefined) {
    return 0;
  }
  try {
    return Buffer.byteLength(JSON.stringify(snapshot.body) ?? '');
  } catch {
    return null;
  }
}

function replayableHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (value === undefined || HOP_BY_HOP_HEADERS.has(key)) {
      continue;
    }
    kept[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return kept;
}
