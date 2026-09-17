import { readFileSync } from 'node:fs';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { maskRecording } from './mask';
import type { Profiler } from './profiler';

export const DEFAULT_CHANNEL_PORT = 4780;
const MAX_BODY_BYTES = 64 * 1024;

// Loopback only, by construction: there is no option to bind anywhere else.
const HOST = '127.0.0.1';

export const VERSION: string = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
).version;

export interface LocalChannelOptions {
  port?: number;
}

export class LocalChannel {
  private server: Server | null = null;

  constructor(
    private readonly profiler: Profiler,
    private readonly options: LocalChannelOptions = {},
  ) {}

  get url(): string | null {
    const address = this.server?.address() as AddressInfo | null | undefined;
    return address ? `http://${HOST}:${address.port}` : null;
  }

  // Resolves null instead of throwing: a busy port must never take the host app down.
  start(): Promise<string | null> {
    const port = this.options.port ?? DEFAULT_CHANNEL_PORT;
    const server = createServer((req, res) => {
      this.handle(req, res).catch((error: Error) => send(res, 500, { error: error.message }));
    });

    return new Promise((resolve) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        const why =
          error.code === 'EADDRINUSE'
            ? `port ${port} is in use; pass channel: { port } to profiler() and --port to the CLI`
            : error.message;
        console.warn(`[api-profiler] local channel not started: ${why}`);
        resolve(null);
      });
      server.listen(port, HOST, () => {
        // The channel must never be the thing keeping the host process alive.
        server.unref();
        this.server = server;
        resolve(this.url);
      });
    });
  }

  stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (req.method === 'POST' && path === '/load-runs') {
      await this.startRun(req, res);
      return;
    }
    if (req.method === 'POST' && path === '/reset') {
      this.profiler.reset();
      send(res, 200, { ok: true });
      return;
    }
    if (req.method !== 'GET') {
      send(res, 405, { error: 'method not allowed' });
      return;
    }
    switch (path) {
      case '/health':
        send(res, 200, { ok: true, version: VERSION });
        return;
      case '/stats':
        send(res, 200, this.profiler.stats());
        return;
      case '/recordings':
        send(res, 200, this.profiler.recordings().map(maskRecording));
        return;
      case '/load-results':
        send(res, 200, this.profiler.loadResults());
        return;
      default:
        send(res, 404, { error: `no such endpoint: ${path}` });
    }
  }

  private async startRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (error) {
      send(res, 400, { error: (error as Error).message });
      return;
    }

    const { method, route, target, connections, duration } = body;
    if (typeof method !== 'string' || typeof route !== 'string') {
      send(res, 400, { error: 'method and route are required strings' });
      return;
    }
    if (!optionalNumber(connections) || !optionalNumber(duration) || !optionalString(target)) {
      send(res, 400, { error: 'connections and duration must be numbers, target a string' });
      return;
    }

    try {
      const result = await this.profiler.runLoad({ method, route, target, connections, duration });
      send(res, 200, result);
    } catch (error) {
      send(res, 409, { error: (error as Error).message });
    }
  }
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      try {
        const parsed: unknown = text ? JSON.parse(text) : {};
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('body must be a JSON object'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}
