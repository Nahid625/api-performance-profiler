import { connect } from 'node:net';
import autocannon from 'autocannon';
import { RecordedRequest } from './recorder';

export const LOAD_HEADER = 'x-api-profiler-load';
export const DEFAULT_CONNECTIONS = 10;
export const DEFAULT_DURATION_SECONDS = 5;
export const REQUEST_TIMEOUT_SECONDS = 10;

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const);
type Method = typeof METHODS extends Set<infer M> ? M : never;

export interface LoadRunOptions {
  target: string;
  recording: RecordedRequest;
  connections?: number;
  duration?: number;
}

export interface LoadRunSummary {
  requestsSent: number;
  responses: number;
  non2xx: number;
  errors: number;
  timeouts: number;
  durationSeconds: number;
  connections: number;
}

// Replays a recording as-is. The safety gate (checkLoadRun) is the caller's job.
export class LoadRunner {
  async run(options: LoadRunOptions): Promise<LoadRunSummary> {
    const { recording } = options;
    const method = recording.method.toUpperCase();
    if (!isMethod(method)) {
      throw new Error(`cannot replay ${recording.method} ${recording.route}: unsupported method`);
    }

    const url = new URL(recording.url, options.target);
    await assertReachable(url);

    const result = await autocannon({
      url: url.toString(),
      method,
      headers: { ...recording.headers, [LOAD_HEADER]: '1' },
      body: serialize(recording.body),
      connections: options.connections ?? DEFAULT_CONNECTIONS,
      duration: options.duration ?? DEFAULT_DURATION_SECONDS,
      timeout: REQUEST_TIMEOUT_SECONDS,
    });

    return {
      requestsSent: result.requests.sent,
      responses: result.requests.total,
      non2xx: result.non2xx,
      errors: result.errors,
      timeouts: result.timeouts,
      durationSeconds: result.duration,
      connections: result.connections,
    };
  }
}

function isMethod(value: string): value is Method {
  return (METHODS as Set<string>).has(value);
}

function serialize(body: unknown): string | Buffer | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return body;
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  return JSON.stringify(body);
}

// autocannon counts a dead target as errors for the whole duration; fail fast instead.
function assertReachable(url: URL): Promise<void> {
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port, timeout: 2000 });
    const fail = (why: string) => {
      socket.destroy();
      reject(new Error(`cannot reach ${url.origin}: ${why}`));
    };
    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('timeout', () => fail('connection timed out'));
    socket.once('error', (error) => fail(error.message));
  });
}
