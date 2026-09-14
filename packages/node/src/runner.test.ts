import { once } from 'node:events';
import { createServer, IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RecordedRequest } from './recorder';
import {
  DEFAULT_CONNECTIONS,
  DEFAULT_DURATION_SECONDS,
  LOAD_HEADER,
  LoadRunner,
} from './runner';

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

async function serve(status = 200): Promise<{ base: string; seen: Seen[]; server: Server }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      res.writeHead(status, { 'content-type': 'text/plain' });
      res.end('ok');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, seen, server };
}

function stop(server: Server): void {
  server.closeAllConnections();
  server.close();
}

function recording(overrides: Partial<RecordedRequest> = {}): RecordedRequest {
  return {
    method: 'GET',
    route: '/users/:id',
    url: '/users/42?expand=orders',
    headers: { authorization: 'Bearer abc123xyz', 'x-tenant': 'acme' },
    body: undefined,
    bodyUnavailable: false,
    recordedAt: 0,
    ...overrides,
  };
}

const quick = { connections: 2, duration: 1 };

describe('LoadRunner', () => {
  it('ships with the spec defaults', () => {
    expect(DEFAULT_CONNECTIONS).toBe(10);
    expect(DEFAULT_DURATION_SECONDS).toBe(5);
  });

  it('replays the recording exactly, plus the load header', async () => {
    const { base, seen, server } = await serve();
    try {
      await new LoadRunner().run({ target: base, recording: recording(), ...quick });
    } finally {
      stop(server);
    }

    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      expect(request.method).toBe('GET');
      expect(request.url).toBe('/users/42?expand=orders');
      expect(request.headers.authorization).toBe('Bearer abc123xyz');
      expect(request.headers['x-tenant']).toBe('acme');
      expect(request.headers[LOAD_HEADER]).toBe('1');
    }
  });

  it('sends a parsed JSON body back as JSON', async () => {
    const { base, seen, server } = await serve(201);
    try {
      await new LoadRunner().run({
        target: base,
        recording: recording({
          method: 'POST',
          route: '/login',
          url: '/login',
          headers: { 'content-type': 'application/json' },
          body: { email: 'karim@example.com', password: 'hunter2' },
        }),
        ...quick,
      });
    } finally {
      stop(server);
    }

    expect(seen[0].method).toBe('POST');
    expect(seen[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen[0].body)).toEqual({ email: 'karim@example.com', password: 'hunter2' });
  });

  it('sends a text body as it was recorded', async () => {
    const { base, seen, server } = await serve();
    try {
      await new LoadRunner().run({
        target: base,
        recording: recording({
          method: 'POST',
          route: '/notes',
          url: '/notes',
          headers: { 'content-type': 'text/plain' },
          body: 'plain text note',
        }),
        ...quick,
      });
    } finally {
      stop(server);
    }

    expect(seen[0].body).toBe('plain text note');
  });

  it('reports counts that match what the server saw', async () => {
    const { base, seen, server } = await serve();
    let summary;
    try {
      summary = await new LoadRunner().run({ target: base, recording: recording(), ...quick });
    } finally {
      stop(server);
    }

    expect(summary.connections).toBe(2);
    expect(summary.responses).toBeGreaterThan(0);
    expect(summary.responses).toBeLessThanOrEqual(summary.requestsSent);
    expect(seen.length).toBeGreaterThanOrEqual(summary.responses);
    expect(seen.length).toBeLessThanOrEqual(summary.requestsSent);
    expect(summary.non2xx).toBe(0);
    expect(summary.errors).toBe(0);
    expect(summary.timeouts).toBe(0);
  });

  it('counts failing responses as non-2xx, not errors', async () => {
    const { base, server } = await serve(503);
    let summary;
    try {
      summary = await new LoadRunner().run({ target: base, recording: recording(), ...quick });
    } finally {
      stop(server);
    }

    expect(summary.non2xx).toBe(summary.responses);
    expect(summary.errors).toBe(0);
  });

  it('runs for roughly the requested duration', async () => {
    const { base, server } = await serve();
    const startedAt = Date.now();
    try {
      const summary = await new LoadRunner().run({ target: base, recording: recording(), ...quick });
      expect(summary.durationSeconds).toBeGreaterThanOrEqual(1);
      expect(summary.durationSeconds).toBeLessThan(3);
    } finally {
      stop(server);
    }
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1000);
  });

  it('fails fast when nothing is listening on the target', async () => {
    const { base, server } = await serve();
    stop(server);
    await once(server, 'close');

    const startedAt = Date.now();
    await expect(
      new LoadRunner().run({ target: base, recording: recording(), ...quick }),
    ).rejects.toThrow(/cannot reach/);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('refuses a method it cannot replay before contacting the server', async () => {
    const { base, seen, server } = await serve();
    try {
      await expect(
        new LoadRunner().run({
          target: base,
          recording: recording({ method: 'BREW' }),
          ...quick,
        }),
      ).rejects.toThrow(/unsupported method/);
    } finally {
      stop(server);
    }
    expect(seen).toEqual([]);
  });
});
