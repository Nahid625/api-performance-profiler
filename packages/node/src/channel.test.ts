import { networkInterfaces } from 'node:os';
import { DEFAULT_CHANNEL_PORT, LocalChannel, VERSION } from './channel';
import { Profiler } from './profiler';

async function started(profiler = new Profiler()): Promise<{ channel: LocalChannel; url: string }> {
  const channel = new LocalChannel(profiler, { port: 0 });
  const url = await channel.start();
  if (!url) {
    throw new Error('channel did not start');
  }
  return { channel, url };
}

function recordOne(profiler: Profiler): void {
  profiler.start()({
    method: 'GET',
    route: '/users/:id',
    statusCode: 200,
    request: {
      url: '/users/42',
      headers: { authorization: 'Bearer abc123xyz', cookie: 'sid=9f8e7' },
      body: undefined,
      bodyUnavailable: false,
    },
  });
}

describe('LocalChannel', () => {
  it('defaults to port 4780', () => {
    expect(DEFAULT_CHANNEL_PORT).toBe(4780);
  });

  it('answers /health with the package version', async () => {
    const { channel, url } = await started();
    try {
      const res = await fetch(`${url}/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ ok: true, version: VERSION });
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      await channel.stop();
    }
  });

  it('serves the profiler stats with their mode', async () => {
    const profiler = new Profiler();
    recordOne(profiler);
    profiler.start()({ method: 'GET', route: '/users/:id', statusCode: 200, mode: 'load' });
    const { channel, url } = await started(profiler);
    try {
      const stats = await (await fetch(`${url}/stats`)).json();
      expect(stats).toEqual(profiler.stats());
      expect(stats.map((s: { mode: string }) => s.mode).sort()).toEqual(['load', 'observed']);
    } finally {
      await channel.stop();
    }
  });

  it('only ever serves masked recordings', async () => {
    const profiler = new Profiler();
    recordOne(profiler);
    const { channel, url } = await started(profiler);
    try {
      const res = await fetch(`${url}/recordings`);
      const text = await res.text();
      expect(text).not.toContain('abc123xyz');
      expect(text).not.toContain('9f8e7');
      expect(text).toContain('Bearer ••••••');
      const [recording] = JSON.parse(text);
      expect(recording).toMatchObject({ method: 'GET', route: '/users/:id', url: '/users/42' });
      expect(recording.body).toEqual({ kind: 'none' });
    } finally {
      await channel.stop();
    }
  });

  it('serves load results, empty before any run', async () => {
    const { channel, url } = await started();
    try {
      expect(await (await fetch(`${url}/load-results`)).json()).toEqual([]);
    } finally {
      await channel.stop();
    }
  });

  it('rejects unknown paths and non-GET methods', async () => {
    const { channel, url } = await started();
    try {
      const missing = await fetch(`${url}/nope`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: 'no such endpoint: /nope' });

      const post = await fetch(`${url}/stats`, { method: 'POST' });
      expect(post.status).toBe(405);
    } finally {
      await channel.stop();
    }
  });

  it('binds to 127.0.0.1 only', async () => {
    const { channel, url } = await started();
    try {
      expect(url.startsWith('http://127.0.0.1:')).toBe(true);
      const port = new URL(url).port;
      const lan = Object.values(networkInterfaces())
        .flat()
        .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
      if (lan) {
        await expect(fetch(`http://${lan}:${port}/health`)).rejects.toThrow();
      }
    } finally {
      await channel.stop();
    }
  });

  it('reports a busy port with a warning instead of throwing', async () => {
    const first = await started();
    const port = Number(new URL(first.url).port);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const second = new LocalChannel(new Profiler(), { port });
      expect(await second.start()).toBeNull();
      expect(second.url).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(`port ${port} is in use`);
    } finally {
      warn.mockRestore();
      await first.channel.stop();
    }
  });

  it('stops listening on stop()', async () => {
    const { channel, url } = await started();
    await channel.stop();

    expect(channel.url).toBeNull();
    await expect(fetch(`${url}/health`)).rejects.toThrow();
    await expect(channel.stop()).resolves.toBeUndefined();
  });
});
