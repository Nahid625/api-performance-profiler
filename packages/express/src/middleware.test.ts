import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express, { Express } from 'express';
import { profiler } from './middleware';

async function serve(app: Express, run: (base: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

// 'finish' can land a tick after the client has read the body.
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('profiler middleware', () => {
  it('groups requests by route template, not raw path', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.get('/users/:id', (req, res) => {
      res.json({ id: req.params.id });
    });

    await serve(app, async (base) => {
      await (await fetch(`${base}/users/42`)).text();
      await (await fetch(`${base}/users/7`)).text();
    });
    await settle();

    const stats = p.stats();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ method: 'GET', route: '/users/:id', count: 2 });
  });

  it('includes the router mount path', async () => {
    const p = profiler();
    const app = express();
    const router = express.Router();
    router.get('/orders/:id', (req, res) => {
      res.send('ok');
    });
    app.use(p);
    app.use('/api', router);

    await serve(app, async (base) => {
      await (await fetch(`${base}/api/orders/9`)).text();
    });
    await settle();

    expect(p.stats()[0].route).toBe('/api/orders/:id');
  });

  it('joins nested router mount paths', async () => {
    const p = profiler();
    const app = express();
    const v1 = express.Router();
    const api = express.Router();
    v1.get('/items', (req, res) => {
      res.send('ok');
    });
    api.use('/v1', v1);
    app.use(p);
    app.use('/api', api);

    await serve(app, async (base) => {
      await (await fetch(`${base}/api/v1/items`)).text();
    });
    await settle();

    expect(p.stats()[0].route).toBe('/api/v1/items');
  });

  it('buckets unmatched requests together as failures', async () => {
    const p = profiler();
    const app = express();
    app.use(p);

    await serve(app, async (base) => {
      expect((await fetch(`${base}/wp-admin`)).status).toBe(404);
      await (await fetch(`${base}/.env`)).text();
    });
    await settle();

    const stats = p.stats();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ route: '(unmatched)', count: 2, errorCount: 2 });
  });

  it('records the status code the route actually sent', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.post('/orders', (req, res) => {
      res.status(503).send('down');
    });

    await serve(app, async (base) => {
      await (await fetch(`${base}/orders`, { method: 'POST' })).text();
    });
    await settle();

    expect(p.stats()[0]).toMatchObject({ method: 'POST', route: '/orders', errorCount: 1 });
  });

  it('attributes a thrown error to the route that threw', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.get('/boom', () => {
      throw new Error('boom');
    });

    await serve(app, async (base) => {
      expect((await fetch(`${base}/boom`)).status).toBe(500);
    });
    await settle();

    expect(p.stats()[0]).toMatchObject({ route: '/boom', errorCount: 1 });
  });

  it('keeps the mount path when a routed handler throws', async () => {
    const p = profiler();
    const app = express();
    const router = express.Router();
    router.get('/orders/:id', () => {
      throw new Error('boom');
    });
    app.use(p);
    app.use('/api', router);

    await serve(app, async (base) => {
      expect((await fetch(`${base}/api/orders/1`)).status).toBe(500);
    });
    await settle();

    expect(p.stats()[0]).toMatchObject({ route: '/api/orders/:id', errorCount: 1 });
  });

  it('measures how long the route took', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.get('/slow', async (req, res) => {
      await wait(40);
      res.send('done');
    });

    await serve(app, async (base) => {
      await (await fetch(`${base}/slow`)).text();
    });
    await settle();

    expect(p.stats()[0].averageMs).toBeGreaterThanOrEqual(35);
  });

  it('leaves the response untouched', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.get('/hello', (req, res) => {
      res.status(201).set('x-custom', 'yes').json({ hello: 'world' });
    });

    await serve(app, async (base) => {
      const res = await fetch(`${base}/hello`);
      expect(res.status).toBe(201);
      expect(res.headers.get('x-custom')).toBe('yes');
      expect(await res.json()).toEqual({ hello: 'world' });
    });
  });

  it('does not count a request the client abandoned', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.get('/hang', async (req, res) => {
      await wait(150);
      res.send('too late');
    });

    await serve(app, async (base) => {
      const controller = new AbortController();
      const request = fetch(`${base}/hang`, { signal: controller.signal }).catch(() => undefined);
      await wait(30);
      controller.abort();
      await request;
      await wait(250);
    });

    expect(p.stats()).toEqual([]);
  });
});

describe('request recording', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  async function post(base: string, path: string, body: unknown, headers = {}): Promise<number> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    await res.text();
    return res.status;
  }

  it('records a JSON body parsed by express.json()', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.use(express.json());
    app.post('/login', (req, res) => {
      res.status(200).json({ ok: true });
    });

    await serve(app, async (base) => {
      await post(base, '/login', { email: 'karim@example.com', password: 'hunter2' });
    });
    await settle();

    expect(p.recordings()).toEqual([
      expect.objectContaining({
        method: 'POST',
        route: '/login',
        url: '/login',
        body: { email: 'karim@example.com', password: 'hunter2' },
        bodyUnavailable: false,
      }),
    ]);
  });

  it('keeps the auth header and the full url with mount path and query', async () => {
    const p = profiler();
    const app = express();
    const router = express.Router();
    router.get('/orders/:id', (req, res) => {
      res.send('ok');
    });
    app.use(p);
    app.use('/api', router);

    await serve(app, async (base) => {
      await (
        await fetch(`${base}/api/orders/9?expand=items`, {
          headers: { authorization: 'Bearer abc123xyz' },
        })
      ).text();
    });
    await settle();

    expect(p.recordings()[0]).toMatchObject({
      route: '/api/orders/:id',
      url: '/api/orders/9?expand=items',
      headers: { authorization: 'Bearer abc123xyz' },
    });
  });

  it('flags a body that was sent but never parsed', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.post('/raw', (req, res) => {
      res.send('ok');
    });

    await serve(app, async (base) => {
      await post(base, '/raw', { any: 'thing' });
    });
    await settle();

    expect(p.recordings()[0]).toMatchObject({ body: undefined, bodyUnavailable: true });
  });

  it('does not flag a request that had no body', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.get('/users/:id', (req, res) => {
      res.send('ok');
    });

    await serve(app, async (base) => {
      await (await fetch(`${base}/users/42`)).text();
    });
    await settle();

    expect(p.recordings()[0]).toMatchObject({ body: undefined, bodyUnavailable: false });
  });

  it('keeps the body as the client sent it when a handler mutates it', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.use(express.json());
    app.post('/login', (req, res) => {
      delete req.body.password;
      req.body.email = req.body.email.toUpperCase();
      res.json({ ok: true });
    });

    await serve(app, async (base) => {
      await post(base, '/login', { email: 'karim@example.com', password: 'hunter2' });
    });
    await settle();

    expect(p.recordings()[0].body).toEqual({ email: 'karim@example.com', password: 'hunter2' });
  });

  it('keeps the original when validation middleware replaces req.body', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.use(express.json());
    app.use((req, res, next) => {
      req.body = { id: Number(req.body.id) };
      next();
    });
    app.post('/items', (req, res) => {
      res.json(req.body);
    });

    await serve(app, async (base) => {
      await post(base, '/items', { id: '42' });
    });
    await settle();

    expect(p.recordings()[0].body).toEqual({ id: '42' });
  });

  it('still lets the app read and write req.body normally', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.use(express.json());
    app.post('/echo', (req, res) => {
      req.body.seen = true;
      res.json(req.body);
    });

    await serve(app, async (base) => {
      const res = await fetch(`${base}/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
      });
      expect(await res.json()).toEqual({ a: 1, seen: true });
    });
  });

  it('records the body when the parser runs before the profiler', async () => {
    const p = profiler();
    const app = express();
    app.use(express.json());
    app.use(p);
    app.post('/login', (req, res) => {
      delete req.body.password;
      res.json({ ok: true });
    });

    await serve(app, async (base) => {
      await post(base, '/login', { email: 'a@b.c', password: 'hunter2' });
    });
    await settle();

    expect(p.recordings()[0].body).toEqual({ email: 'a@b.c', password: 'hunter2' });
  });

  it('does not record a failed request', async () => {
    const p = profiler();
    const app = express();
    app.use(p);
    app.use(express.json());
    app.post('/login', (req, res) => {
      res.status(401).json({ error: 'bad token' });
    });

    await serve(app, async (base) => {
      expect(await post(base, '/login', { email: 'x' })).toBe(401);
    });
    await settle();

    expect(p.stats()[0].errorCount).toBe(1);
    expect(p.recordings()).toEqual([]);
  });

  it('does not record unmatched requests', async () => {
    const p = profiler();
    const app = express();
    app.use(p);

    await serve(app, async (base) => {
      await (await fetch(`${base}/wp-admin`)).text();
    });
    await settle();

    expect(p.recordings()).toEqual([]);
  });

  it('records nothing in production but still measures', async () => {
    process.env.NODE_ENV = 'production';
    const p = profiler();
    const app = express();
    app.use(p);
    app.use(express.json());
    app.post('/login', (req, res) => {
      res.json({ ok: true });
    });

    await serve(app, async (base) => {
      await post(base, '/login', { password: 'hunter2' }, { authorization: 'Bearer secret' });
    });
    await settle();

    expect(p.isRecording).toBe(false);
    expect(p.recordings()).toEqual([]);
    expect(p.stats()[0].count).toBe(1);
  });
});

describe('load testing', () => {
  const LOAD = 'x-api-profiler-load';
  const quick = { connections: 2, duration: 1 };

  async function app(options = {}) {
    const p = profiler(options);
    const a = express();
    a.use(p);
    a.use(express.json());
    a.get('/users/:id', (req, res) => {
      res.json({ id: req.params.id });
    });
    a.post('/search', (req, res) => {
      res.json({ q: req.body?.q ?? null });
    });
    return { p, a };
  }

  it('tags requests carrying the load header as load traffic', async () => {
    const { p, a } = await app();
    await serve(a, async (base) => {
      await (await fetch(`${base}/users/1`)).text();
      await (await fetch(`${base}/users/1`, { headers: { [LOAD]: '1' } })).text();
      await (await fetch(`${base}/users/1`, { headers: { [LOAD]: '1' } })).text();
    });
    await settle();

    const modes = Object.fromEntries(p.stats().map((s) => [s.mode, s.count]));
    expect(modes).toEqual({ observed: 1, load: 2 });
  });

  it('never records load traffic', async () => {
    const { p, a } = await app();
    await serve(a, async (base) => {
      await (await fetch(`${base}/users/42`, { headers: { [LOAD]: '1' } })).text();
    });
    await settle();

    expect(p.recordings()).toEqual([]);
  });

  it('runs a load test against the app and freezes the result', async () => {
    const { p, a } = await app();
    await serve(a, async (base) => {
      await (await fetch(`${base}/users/42`)).text();
      await settle();

      const result = await p.loadTest('GET', '/users/:id', { target: base, ...quick });

      expect(result.stats?.mode).toBe('load');
      expect(result.stats?.count).toBeGreaterThan(0);
      expect(result.stats?.errorRate).toBe(0);
      expect(result.note).toBeNull();
      expect(p.loadResults()).toHaveLength(1);
      expect(p.loadResult('GET', '/users/:id')?.completedAt).toBe(result.completedAt);

      const observed = p.stats().find((s) => s.mode === 'observed');
      expect(observed?.count).toBe(1);
      expect(p.recordings()[0].url).toBe('/users/42');
    });
  });

  it('refuses a non-GET route unless allowLoadOn lists it', async () => {
    const refused = await app();
    await serve(refused.a, async (base) => {
      await (
        await fetch(`${base}/search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: 'shoes' }),
        })
      ).text();
      await settle();
      await expect(
        refused.p.loadTest('POST', '/search', { target: base, ...quick }),
      ).rejects.toThrow(/allowLoadOn/);
    });

    const allowed = await app({ allowLoadOn: ['POST /search'] });
    await serve(allowed.a, async (base) => {
      await (
        await fetch(`${base}/search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: 'shoes' }),
        })
      ).text();
      await settle();
      const result = await allowed.p.loadTest('POST', '/search', { target: base, ...quick });
      expect(result.stats?.count).toBeGreaterThan(0);
      expect(result.stats?.errorRate).toBe(0);
    });
  });

  it('refuses a route that was never recorded without sending anything', async () => {
    const { p, a } = await app();
    await serve(a, async (base) => {
      await expect(p.loadTest('GET', '/users/:id', { target: base, ...quick })).rejects.toThrow(
        /no recording yet/,
      );
    });
    expect(p.stats()).toEqual([]);
  });
});
