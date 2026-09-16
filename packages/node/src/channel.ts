import { readFileSync } from 'node:fs';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { maskRecording } from './mask';
import { Profiler } from './profiler';

export const DEFAULT_CHANNEL_PORT = 4780;

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
    const server = createServer((req, res) => this.handle(req, res));

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

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'GET') {
      send(res, 405, { error: 'method not allowed' });
      return;
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
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
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}
