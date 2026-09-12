import { MetricStore, metricKey } from './store';
import { RouteMetric } from './types';

function metric(overrides: Partial<RouteMetric> = {}): RouteMetric {
  return {
    method: 'GET',
    route: '/users',
    timestamp: Date.now(),
    durationMs: 10,
    statusCode: 200,
    success: true,
    mode: 'observed',
    ...overrides,
  };
}

describe('metricKey', () => {
  it('separates the same route recorded in different modes', () => {
    const observed = metricKey(metric({ mode: 'observed' }));
    const load = metricKey(metric({ mode: 'load' }));
    expect(observed).not.toBe(load);
  });

  it('separates the same path under different methods', () => {
    expect(metricKey(metric({ method: 'GET' }))).not.toBe(metricKey(metric({ method: 'POST' })));
  });
});

describe('MetricStore', () => {
  it('keeps samples recorded inside the window', () => {
    const store = new MetricStore();
    store.record(metric({ durationMs: 12 }));
    store.record(metric({ durationMs: 34 }));

    const samples = store.samples('observed GET /users');
    expect(samples).toHaveLength(2);
    expect(samples.map((s) => s.durationMs)).toEqual([12, 34]);
  });

  it('drops samples older than the window', () => {
    const store = new MetricStore({ windowMs: 5000 });
    store.record(metric({ timestamp: Date.now() - 9000, durationMs: 99 }));
    store.record(metric({ durationMs: 12 }));

    const samples = store.samples('observed GET /users');
    expect(samples).toHaveLength(1);
    expect(samples[0].durationMs).toBe(12);
  });

  it('forgets a route entirely once every sample has expired', () => {
    const store = new MetricStore({ windowMs: 1000 });
    store.record(metric({ timestamp: Date.now() - 5000 }));

    expect(store.samples('observed GET /users')).toEqual([]);
    expect(store.keys()).toEqual([]);
  });

  it('honours a custom window length', () => {
    const store = new MetricStore({ windowMs: 60_000 });
    store.record(metric({ timestamp: Date.now() - 30_000 }));

    expect(store.samples('observed GET /users')).toHaveLength(1);
    expect(store.windowSeconds).toBe(60);
  });

  it('defaults to a five second window', () => {
    expect(new MetricStore().windowSeconds).toBe(5);
  });

  it('tracks each route and mode in its own bucket', () => {
    const store = new MetricStore();
    store.record(metric({ route: '/users' }));
    store.record(metric({ route: '/orders' }));
    store.record(metric({ route: '/users', mode: 'load' }));

    expect(store.keys().sort()).toEqual([
      'load GET /users',
      'observed GET /orders',
      'observed GET /users',
    ]);
  });

  it('returns a copy so callers cannot mutate stored samples', () => {
    const store = new MetricStore();
    store.record(metric());

    store.samples('observed GET /users').push(metric());

    expect(store.samples('observed GET /users')).toHaveLength(1);
  });

  it('returns nothing for a route that was never recorded', () => {
    expect(new MetricStore().samples('observed GET /nope')).toEqual([]);
  });

  it('drops everything on clear', () => {
    const store = new MetricStore();
    store.record(metric());
    store.clear();

    expect(store.keys()).toEqual([]);
  });
});
