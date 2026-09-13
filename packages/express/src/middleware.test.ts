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
