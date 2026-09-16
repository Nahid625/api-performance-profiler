import { CapturedRequest, channelAllowed, Profiler, recordingAllowed } from './profiler';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Profiler', () => {
  it('records what the caller reports', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'POST', route: '/orders', statusCode: 201 });

    const [stats] = profiler.stats();
    expect(stats).toMatchObject({ method: 'POST', route: '/orders', count: 1 });
  });

  it('derives success from the status code', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'GET', route: '/users', statusCode: 200 });
    profiler.start()({ method: 'GET', route: '/users', statusCode: 500 });

    const [stats] = profiler.stats();
    expect(stats.errorCount).toBe(1);
    expect(stats.errorRate).toBe(0.5);
  });

  it('treats traffic as observed unless told otherwise', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'GET', route: '/users', statusCode: 200 });

    expect(profiler.stats()[0].mode).toBe('observed');
  });

  it('keeps load traffic in its own bucket', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'GET', route: '/users', statusCode: 200 });
    profiler.start()({ method: 'GET', route: '/users', statusCode: 200, mode: 'load' });

    const modes = profiler.stats().map((s) => s.mode).sort();
    expect(modes).toEqual(['load', 'observed']);
  });

  it('measures elapsed time between start and finish', async () => {
    const profiler = new Profiler();
    const done = profiler.start();
    await wait(25);
    done({ method: 'GET', route: '/slow', statusCode: 200 });

    const [stats] = profiler.stats();
    expect(stats.averageMs).toBeGreaterThanOrEqual(20);
    expect(stats.averageMs).toBeLessThan(500);
  });

  it('times each request separately when they overlap', async () => {
    const profiler = new Profiler();
    const slow = profiler.start();
    await wait(30);
    const fast = profiler.start();
    fast({ method: 'GET', route: '/fast', statusCode: 200 });
    slow({ method: 'GET', route: '/slow', statusCode: 200 });

    const byRoute = Object.fromEntries(profiler.stats().map((s) => [s.route, s.averageMs]));
    expect(byRoute['/fast']).toBeLessThan(byRoute['/slow']);
  });

  it('reports nothing before any request completes', () => {
    expect(new Profiler().stats()).toEqual([]);
  });

  it('drops everything on reset', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'GET', route: '/users', statusCode: 200 });
    profiler.reset();

    expect(profiler.stats()).toEqual([]);
  });

  it('passes store options through', () => {
    expect(new Profiler({ windowMs: 30_000 }).store.windowSeconds).toBe(30);
  });
});

function captured(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    url: '/users/42',
    origin: 'http://127.0.0.1:3000',
    headers: { authorization: 'Bearer abc123xyz' },
    body: undefined,
    bodyUnavailable: false,
    ...overrides,
  };
}

describe('Profiler recording', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('records the request alongside its metric', () => {
    const profiler = new Profiler();
    profiler.start()({
      method: 'GET',
      route: '/users/:id',
      statusCode: 200,
      request: captured(),
    });

    expect(profiler.stats()).toHaveLength(1);
    expect(profiler.recordings()).toEqual([
      expect.objectContaining({
        method: 'GET',
        route: '/users/:id',
        url: '/users/42',
        headers: { authorization: 'Bearer abc123xyz' },
      }),
    ]);
  });

  it('still records the metric when no request was captured', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'GET', route: '/users/:id', statusCode: 200 });

    expect(profiler.stats()).toHaveLength(1);
    expect(profiler.recordings()).toEqual([]);
  });

  it('takes method and route from the outcome, never from the captured request', () => {
    const profiler = new Profiler();
    const sneaky = { ...captured(), method: 'DELETE', route: '/admin' } as CapturedRequest;
    profiler.start()({ method: 'GET', route: '/users/:id', statusCode: 200, request: sneaky });

    expect(profiler.recordings()[0]).toMatchObject({ method: 'GET', route: '/users/:id' });
  });

  it('counts a failed request but does not record it', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'GET', route: '/users/:id', statusCode: 401, request: captured() });

    expect(profiler.stats()[0].errorCount).toBe(1);
    expect(profiler.recordings()).toEqual([]);
  });

  it('does not record load traffic', () => {
    const profiler = new Profiler();
    profiler.start()({
      method: 'GET',
      route: '/users/:id',
      statusCode: 200,
      mode: 'load',
      request: captured(),
    });

    expect(profiler.recordings()).toEqual([]);
  });

  it('clears recordings on reset', () => {
    const profiler = new Profiler();
    profiler.start()({ method: 'GET', route: '/users/:id', statusCode: 200, request: captured() });
    profiler.reset();

    expect(profiler.recordings()).toEqual([]);
  });

  describe('environment', () => {
    it.each([undefined, '', 'development', 'test', ' Development '])(
      'records when NODE_ENV is %p',
      (env) => {
        expect(recordingAllowed(env)).toBe(true);
      },
    );

    it.each(['production', 'PRODUCTION', 'staging', 'prod', 'dev', 'local'])(
      'does not record when NODE_ENV is %p',
      (env) => {
        expect(recordingAllowed(env)).toBe(false);
      },
    );

    it('records when NODE_ENV is not set at all', () => {
      delete process.env.NODE_ENV;
      expect(new Profiler().isRecording).toBe(true);
    });

    it('never captures anything in production, but still measures', () => {
      process.env.NODE_ENV = 'production';
      const profiler = new Profiler();
      profiler.start()({
        method: 'GET',
        route: '/users/:id',
        statusCode: 200,
        request: captured(),
      });

      expect(profiler.isRecording).toBe(false);
      expect(profiler.recordings()).toEqual([]);
      expect(profiler.stats()[0].count).toBe(1);
    });
  });
});

describe('Profiler channel', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it.each([undefined, '', 'development'])('opens by default when NODE_ENV is %p', (env) => {
    expect(channelAllowed(env)).toBe(true);
  });

  it.each(['test', 'production', 'staging'])('stays closed by default when NODE_ENV is %p', (env) => {
    expect(channelAllowed(env)).toBe(false);
  });

  it('opens a loopback channel in development', async () => {
    delete process.env.NODE_ENV;
    const profiler = new Profiler({ channel: { port: 0 } });
    try {
      const url = await profiler.ready;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(profiler.channelUrl).toBe(url);
      expect((await (await fetch(`${url}/health`)).json()).ok).toBe(true);
    } finally {
      await profiler.close();
    }
  });

  it('does not open one under test unless asked', async () => {
    process.env.NODE_ENV = 'test';
    const profiler = new Profiler();
    expect(await profiler.ready).toBeNull();
    expect(profiler.channelUrl).toBeNull();
  });

  it('opens one under test when asked explicitly', async () => {
    process.env.NODE_ENV = 'test';
    const profiler = new Profiler({ channel: { port: 0 } });
    try {
      expect(await profiler.ready).not.toBeNull();
    } finally {
      await profiler.close();
    }
  });

  it('never opens one in production, even when asked', async () => {
    process.env.NODE_ENV = 'production';
    const profiler = new Profiler({ channel: { port: 0 } });
    expect(await profiler.ready).toBeNull();
  });

  it('can be switched off', async () => {
    delete process.env.NODE_ENV;
    const profiler = new Profiler({ channel: false });
    expect(await profiler.ready).toBeNull();
  });

  it('closes cleanly', async () => {
    const profiler = new Profiler({ channel: { port: 0 } });
    const url = await profiler.ready;
    await profiler.close();
    expect(profiler.channelUrl).toBeNull();
    await expect(fetch(`${url}/health`)).rejects.toThrow();
  });

  it('uses allowLoadOn given at construction', async () => {
    const profiler = new Profiler({ allowLoadOn: ['POST /search'] });
    profiler.start()({
      method: 'POST',
      route: '/search',
      statusCode: 200,
      request: captured({ url: '/search', origin: 'http://127.0.0.1:1' }),
    });
    await expect(profiler.runLoad({ method: 'POST', route: '/search' })).rejects.toThrow(/cannot reach/);
  });

  it('falls back to the recording origin as the run target', async () => {
    const profiler = new Profiler();
    profiler.start()({
      method: 'GET',
      route: '/users/:id',
      statusCode: 200,
      request: captured({ origin: 'http://127.0.0.1:1' }),
    });
    await expect(profiler.runLoad({ method: 'GET', route: '/users/:id' })).rejects.toThrow(
      /cannot reach http:\/\/127\.0\.0\.1:1/,
    );
  });
});
