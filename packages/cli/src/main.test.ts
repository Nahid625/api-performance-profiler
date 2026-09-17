import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Profiler } from '@api-profiler/node';
import { main } from './main';

const DIM = `${String.fromCharCode(27)}[2m`;
const ESC = `${String.fromCharCode(27)}[`;

interface Captured {
  io: { out: (t: string) => void; err: (t: string) => void };
  stdout: () => string;
  stderr: () => string;
}

function capture(): Captured {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (t) => out.push(t), err: (t) => err.push(t) },
    stdout: () => out.join('\n'),
    stderr: () => err.join('\n'),
  };
}

async function liveProfiler(): Promise<{ profiler: Profiler; port: string }> {
  const profiler = new Profiler({ channel: { port: 0 } });
  const url = await profiler.ready;
  if (!url) {
    throw new Error('channel did not start');
  }
  profiler.start()({
    method: 'GET',
    route: '/users/:id',
    statusCode: 200,
    request: {
      url: '/users/42',
      origin: url,
      headers: { authorization: 'Bearer abc123xyz' },
      body: undefined,
      bodyUnavailable: false,
    },
  });
  profiler.start()({ method: 'GET', route: '/error', statusCode: 500 });
  return { profiler, port: new URL(url).port };
}

async function appWithChannel(): Promise<{ profiler: Profiler; port: string; close: () => void }> {
  const profiler = new Profiler({ channel: { port: 0 } });
  const url = await profiler.ready;
  if (!url) {
    throw new Error('channel did not start');
  }
  const server = createServer((req, res) => {
    const done = profiler.start();
    res.on('finish', () =>
      done({
        method: req.method ?? 'GET',
        route: '/users/:id',
        statusCode: 200,
        mode: req.headers['x-api-profiler-load'] === '1' ? 'load' : 'observed',
        request: {
          url: req.url ?? '/',
          origin: `http://${req.headers.host ?? ''}`,
          headers: req.headers,
          body: undefined,
          bodyUnavailable: false,
        },
      }),
    );
    res.end('ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port: appPort } = server.address() as AddressInfo;
  await (await fetch(`http://127.0.0.1:${appPort}/users/42`)).text();
  await new Promise((r) => setTimeout(r, 30));
  return {
    profiler,
    port: new URL(url).port,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

describe('api-profiler CLI', () => {
  it('prints help and version', async () => {
    const help = capture();
    expect(await main(['--help'], help.io, '1.2.3')).toBe(0);
    expect(help.stdout()).toContain('api-profiler routes');

    const version = capture();
    expect(await main(['--version'], version.io, '1.2.3')).toBe(0);
    expect(version.stdout()).toBe('1.2.3');
  });

  it('rejects bad input with usage and exit code 2', async () => {
    const unknown = capture();
    expect(await main(['dance'], unknown.io, '0')).toBe(2);
    expect(unknown.stderr()).toContain('unknown command "dance"');

    const flag = capture();
    expect(await main(['stats', '--port', 'x'], flag.io, '0')).toBe(2);
    expect(flag.stderr()).toContain('--port must be a positive number');
  });

  it('explains what to do when no app is reachable', async () => {
    const c = capture();
    expect(await main(['stats', '--port', '1'], c.io, '0')).toBe(1);
    expect(c.stderr()).toContain('could not reach the profiler at http://127.0.0.1:1');
    expect(c.stderr()).toContain('app.use(profiler())');
  });

  it('shows stats from a running app', async () => {
    const { profiler, port } = await liveProfiler();
    try {
      const c = capture();
      expect(await main(['stats', '--port', port], c.io, '0')).toBe(0);
      expect(c.stdout()).toContain('GET /users/:id');
      expect(c.stdout()).toContain('GET /error');
      expect(c.stdout()).toContain('100%');

      const j = capture();
      expect(await main(['stats', '--port', port, '--json'], j.io, '0')).toBe(0);
      expect(JSON.parse(j.stdout())).toEqual(profiler.stats());
    } finally {
      await profiler.close();
    }
  });

  it('shows routes with masked recordings and never the token', async () => {
    const { profiler, port } = await liveProfiler();
    try {
      const c = capture();
      expect(await main(['routes', '--port', port], c.io, '0')).toBe(0);
      expect(c.stdout()).toContain('GET /users/:id');
      expect(c.stdout()).toContain('Bearer ••••••');
      expect(c.stdout()).toContain('GET /error');
      expect(c.stdout()).toContain('not recorded');
      expect(c.stdout()).not.toContain('abc123xyz');

      const j = capture();
      expect(await main(['routes', '--port', port, '--json'], j.io, '0')).toBe(0);
      expect(j.stdout()).not.toContain('abc123xyz');
      expect(JSON.parse(j.stdout()).recordings).toHaveLength(1);
    } finally {
      await profiler.close();
    }
  });

  it('shows load results', async () => {
    const { profiler, port } = await liveProfiler();
    try {
      const c = capture();
      expect(await main(['load-results', '--port', port], c.io, '0')).toBe(0);
      expect(c.stdout()).toContain('No load test has been run yet');
    } finally {
      await profiler.close();
    }
  });
});

describe('when the channel answers with an error', () => {
  it('prints the error and exits 1 instead of pretending', async () => {
    const server = createServer((req, res) => {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'GET /users/:id has no recording yet' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = String((server.address() as AddressInfo).port);
    try {
      const c = capture();
      expect(await main(['stats', '--port', port], c.io, '0')).toBe(1);
      expect(c.stderr()).toBe('GET /users/:id has no recording yet');
      expect(c.stdout()).toBe('');
    } finally {
      server.close();
    }
  });
});

describe('run and live', () => {
  it('runs a load test from the terminal and reports it', async () => {
    const { profiler, port, close } = await appWithChannel();
    try {
      const c = capture();
      const argv = ['run', 'get', '/users/:id', '--port', port, '--connections', '2', '--duration', '1'];
      expect(await main(argv, c.io, '0')).toBe(0);
      expect(c.stdout()).toContain('GET /users/:id');
      expect(c.stdout()).toMatch(/Sent \d+, got \d+ responses, 0 non-2xx, 0 errors/);
      expect(profiler.loadResults()).toHaveLength(1);

      const j = capture();
      expect(await main([...argv, '--json'], j.io, '0')).toBe(0);
      expect(JSON.parse(j.stdout()).stats.mode).toBe('load');
    } finally {
      close();
      await profiler.close();
    }
  });

  it('relays the refusal reason and exits 1', async () => {
    const { profiler, port, close } = await appWithChannel();
    try {
      const c = capture();
      expect(await main(['run', 'GET', '/never', '--port', port], c.io, '0')).toBe(1);
      expect(c.stderr()).toContain('no recording yet');
      expect(profiler.loadResults()).toEqual([]);
    } finally {
      close();
      await profiler.close();
    }
  });

  it('needs a method and a route', async () => {
    const c = capture();
    expect(await main(['run', 'GET'], c.io, '0')).toBe(2);
    expect(c.stderr()).toContain('run needs a method and a route');
  });

  it('prints one live frame when not attached to a terminal', async () => {
    const { profiler, port, close } = await appWithChannel();
    try {
      const c = capture();
      expect(await main(['--port', port], c.io, '0')).toBe(0);
      expect(c.stdout()).toContain(`api-profiler · app http://127.0.0.1:${port}`);
      expect(c.stdout()).toContain('Observed traffic');
      expect(c.stdout()).toContain('🟢');
      expect(c.stdout()).toContain('GET /users/:id');
      expect(c.stdout()).toContain('live');
      expect(c.stdout()).not.toContain(ESC);

      const j = capture();
      expect(await main(['--port', port, '--once', '--json'], j.io, '0')).toBe(0);
      expect(JSON.parse(j.stdout()).stats).toHaveLength(1);
    } finally {
      close();
      await profiler.close();
    }
  });

  it('refreshes on a terminal until interrupted', async () => {
    const { profiler, port, close } = await appWithChannel();
    try {
      const frames: string[] = [];
      let interrupt: (() => void) | undefined;
      const io = {
        out: (t: string) => frames.push(t),
        err: () => undefined,
        clear: () => frames.push('<clear>'),
        isTty: true,
        onInterrupt: (h: () => void) => {
          interrupt = h;
        },
      };
      const exit = main(['--port', port], io, '0');
      await new Promise((r) => setTimeout(r, 1300));
      interrupt?.();
      expect(await exit).toBe(0);
      expect(frames.filter((f) => f === '<clear>').length).toBeGreaterThanOrEqual(2);
      expect(frames.some((f) => f.includes('Ctrl-C to stop'))).toBe(true);
      expect(frames.some((f) => f.includes(DIM) || f.includes('live'))).toBe(true);
    } finally {
      close();
      await profiler.close();
    }
  });

  it('stops live mode with exit 1 if the app goes away', async () => {
    const { profiler, port, close } = await appWithChannel();
    const errors: string[] = [];
    const io = {
      out: () => undefined,
      err: (t: string) => errors.push(t),
      isTty: true,
      onInterrupt: () => undefined,
    };
    const exit = main(['--port', port], io, '0');
    await new Promise((r) => setTimeout(r, 300));
    close();
    await profiler.close();
    expect(await exit).toBe(1);
    expect(errors.join('\n')).toContain('could not reach');
  });
});

describe('clear', () => {
  it('asks the app to forget everything', async () => {
    const { profiler, port } = await liveProfiler();
    try {
      const c = capture();
      expect(await main(['clear', '--port', port], c.io, '0')).toBe(0);
      expect(c.stdout()).toBe('Cleared.');
      expect(profiler.stats()).toEqual([]);
      expect(profiler.recordings()).toEqual([]);
    } finally {
      await profiler.close();
    }
  });
});
