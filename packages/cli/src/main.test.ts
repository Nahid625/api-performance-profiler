import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Profiler } from '@api-profiler/node';
import { main } from './main';

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
    const none = capture();
    expect(await main([], none.io, '0')).toBe(2);
    expect(none.stderr()).toContain('missing command');

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
