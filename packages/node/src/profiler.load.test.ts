import { once } from 'node:events';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Profiler } from './profiler';
import { LOAD_HEADER } from './runner';

interface Served {
  base: string;
  server: Server;
  loadRequests: () => number;
}

function routeOf(url: string): string {
  const path = url.split('?')[0];
  return /^\/users\/[^/]+$/.test(path) ? '/users/:id' : path;
}

// A minimal adapter doing what the Express middleware does: time, tag by header, capture.
async function serve(profiler: Profiler | null, status = 200): Promise<Served> {
  let loadRequests = 0;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const mode = req.headers[LOAD_HEADER] === '1' ? 'load' : 'observed';
    if (mode === 'load') {
      loadRequests++;
    }
    const done = profiler?.start();
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      res.on('finish', () => {
        done?.({
          method: req.method ?? 'GET',
          route: routeOf(req.url ?? '/'),
          statusCode: res.statusCode,
          mode,
          request: {
            url: req.url ?? '/',
            origin: `http://${req.headers.host ?? ''}`,
            headers: req.headers,
            body: raw ? JSON.parse(raw) : undefined,
            bodyUnavailable: false,
          },
        });
      });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, server, loadRequests: () => loadRequests };
}

function stop(server: Server): void {
  server.closeAllConnections();
  server.close();
}

function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(base: string, path: string, headers: Record<string, string> = {}): Promise<number> {
  const res = await fetch(base + path, { headers });
  await res.text();
  await settle();
  return res.status;
}

const quick = { connections: 2, duration: 1 };

describe('Profiler.runLoad', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('replays the recording and freezes the server-side figures for the whole run', async () => {
    const profiler = new Profiler();
    const { base, server, loadRequests } = await serve(profiler);
    try {
      await get(base, '/users/42', { authorization: 'Bearer abc' });
      const result = await profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });

      expect(result.stats).not.toBeNull();
      expect(result.stats?.mode).toBe('load');
      expect(result.stats?.count).toBe(loadRequests());
      expect(result.stats?.errorRate).toBe(0);
      expect(result.stats?.rps).toBeCloseTo(result.stats!.count / result.durationSeconds, 5);
      expect(result.note).toBeNull();
      expect(result.sent.responses).toBeGreaterThan(0);
      expect(result.connections).toBe(2);
    } finally {
      stop(server);
    }
  });

  it('leaves observed figures and the recording untouched', async () => {
    const profiler = new Profiler();
    const { base, server } = await serve(profiler);
    try {
      await get(base, '/users/42', { authorization: 'Bearer abc' });
      await profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });

      const observed = profiler.stats().find((s) => s.mode === 'observed');
      expect(observed).toMatchObject({ route: '/users/:id', count: 1 });
      expect(profiler.recordings()).toHaveLength(1);
      expect(profiler.recordings()[0].url).toBe('/users/42');
    } finally {
      stop(server);
    }
  });

  it('keeps the snapshot after the rolling window has emptied', async () => {
    const profiler = new Profiler({ windowMs: 200 });
    const { base, server } = await serve(profiler);
    try {
      await get(base, '/users/42');
      await profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });
      await settle(400);

      expect(profiler.stats().some((s) => s.mode === 'load')).toBe(false);
      expect(profiler.loadResult('GET', '/users/:id')?.stats?.count).toBeGreaterThan(0);
      expect(profiler.loadResults()).toHaveLength(1);
    } finally {
      stop(server);
    }
  });

  it('replaces the snapshot on the next run of the same route', async () => {
    const profiler = new Profiler();
    const { base, server } = await serve(profiler);
    try {
      await get(base, '/users/42');
      const first = await profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });
      const second = await profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });

      expect(second.completedAt).toBeGreaterThan(first.completedAt);
      expect(profiler.loadResults()).toHaveLength(1);
      expect(profiler.loadResult('get', '/users/:id')?.completedAt).toBe(second.completedAt);
    } finally {
      stop(server);
    }
  });

  it('refuses through the gate without sending anything', async () => {
    const profiler = new Profiler();
    const { base, server, loadRequests } = await serve(profiler);
    try {
      await expect(
        profiler.runLoad({ method: 'GET', route: '/never-hit', target: base, ...quick }),
      ).rejects.toThrow(/no recording yet/);
      expect(loadRequests()).toBe(0);
      expect(profiler.loadResults()).toEqual([]);
    } finally {
      stop(server);
    }
  });

  it('refuses a non-GET route unless it is allow-listed', async () => {
    const profiler = new Profiler();
    const { base, server, loadRequests } = await serve(profiler, 201);
    try {
      const res = await fetch(`${base}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.c' }),
      });
      await res.text();
      await settle();

      await expect(
        profiler.runLoad({ method: 'POST', route: '/login', target: base, ...quick }),
      ).rejects.toThrow(/allowLoadOn/);
      expect(loadRequests()).toBe(0);

      const result = await profiler.runLoad({
        method: 'POST',
        route: '/login',
        target: base,
        allowLoadOn: ['POST /login'],
        ...quick,
      });
      expect(result.stats?.count).toBe(loadRequests());
      expect(result.stats?.errorRate).toBe(0);
    } finally {
      stop(server);
    }
  });

  it('allows only one run at a time', async () => {
    const profiler = new Profiler();
    const { base, server } = await serve(profiler);
    try {
      await get(base, '/users/42');
      const first = profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });
      await expect(
        profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick }),
      ).rejects.toThrow(/already in progress/);
      await first;
      await expect(
        profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick }),
      ).resolves.toBeDefined();
    } finally {
      stop(server);
    }
  });

  it('reports no server-side figures when the target does not report through this profiler', async () => {
    const profiler = new Profiler();
    const { base: own, server: ownServer } = await serve(profiler);
    const { base: other, server: otherServer } = await serve(null);
    try {
      await get(own, '/users/42');
      const result = await profiler.runLoad({ method: 'GET', route: '/users/:id', target: other, ...quick });

      expect(result.stats).toBeNull();
      expect(result.note).toMatch(/did not report/);
      expect(result.sent.responses).toBeGreaterThan(0);
    } finally {
      stop(ownServer);
      stop(otherServer);
    }
  });

  it('counts failing responses from the route as errors', async () => {
    const profiler = new Profiler();
    const healthy = await serve(profiler, 200);
    let failing: Served | null = null;
    try {
      await get(healthy.base, '/users/42');
      // The recording exists; now make the route fail during the run.
      stop(healthy.server);
      failing = await serve(profiler, 503);
      const result = await profiler.runLoad({
        method: 'GET',
        route: '/users/:id',
        target: failing.base,
        ...quick,
      });
      expect(result.stats?.errorRate).toBe(1);
      expect(result.sent.non2xx).toBe(result.sent.responses);
    } finally {
      stop(healthy.server);
      if (failing) {
        stop(failing.server);
      }
    }
  });

  it('is refused in production before touching the network', async () => {
    process.env.NODE_ENV = 'production';
    const profiler = new Profiler();
    const { base, server, loadRequests } = await serve(profiler);
    try {
      await get(base, '/users/42');
      await expect(
        profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick }),
      ).rejects.toThrow(/disabled when NODE_ENV/);
      expect(loadRequests()).toBe(0);
    } finally {
      stop(server);
    }
  });

  it('hands out copies of snapshots', async () => {
    const profiler = new Profiler();
    const { base, server } = await serve(profiler);
    try {
      await get(base, '/users/42');
      const result = await profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });
      result.sent.responses = -1;
      profiler.loadResults()[0].target = 'tampered';
      profiler.loadResult('GET', '/users/:id')!.sent.non2xx = -5;

      const kept = profiler.loadResults()[0];
      expect(kept.sent.responses).toBeGreaterThan(0);
      expect(kept.target).toBe(base);
      expect(kept.sent.non2xx).toBe(0);
    } finally {
      stop(server);
    }
  });

  it('clears snapshots on reset', async () => {
    const profiler = new Profiler();
    const { base, server } = await serve(profiler);
    try {
      await get(base, '/users/42');
      await profiler.runLoad({ method: 'GET', route: '/users/:id', target: base, ...quick });
      profiler.reset();
      expect(profiler.loadResults()).toEqual([]);
    } finally {
      stop(server);
    }
  });
});
