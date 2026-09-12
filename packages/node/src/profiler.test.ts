import { Profiler } from './profiler';

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
