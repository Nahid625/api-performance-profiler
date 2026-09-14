import { addSample, aggregate, emptyCounts, MIN_SAMPLES_FOR_RPS, statsFromCounts, summarize } from './aggregate';
import { MetricStore } from './store';
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

function samples(count: number, overrides: Partial<RouteMetric> = {}): RouteMetric[] {
  return Array.from({ length: count }, () => metric(overrides));
}

describe('aggregate', () => {
  it('returns nothing when there are no samples', () => {
    expect(aggregate([], 5)).toBeNull();
  });

  it('averages duration across samples', () => {
    const stats = aggregate(
      [metric({ durationMs: 10 }), metric({ durationMs: 20 }), metric({ durationMs: 60 })],
      5,
    );
    expect(stats?.count).toBe(3);
    expect(stats?.averageMs).toBe(30);
  });

  it('keeps fractional precision instead of rounding', () => {
    const stats = aggregate([metric({ durationMs: 10 }), metric({ durationMs: 11 })], 5);
    expect(stats?.averageMs).toBe(10.5);
  });

  it('reports the slowest sample', () => {
    const stats = aggregate(
      [metric({ durationMs: 10 }), metric({ durationMs: 812 }), metric({ durationMs: 40 })],
      5,
    );
    expect(stats?.maxMs).toBe(812);
  });

  it('counts failures and turns them into a rate', () => {
    const stats = aggregate(
      [
        metric({ success: true }),
        metric({ success: false, statusCode: 500 }),
        metric({ success: false, statusCode: 503 }),
        metric({ success: true }),
      ],
      5,
    );
    expect(stats?.errorCount).toBe(2);
    expect(stats?.errorRate).toBe(0.5);
  });

  it('carries mode, method and route through', () => {
    const stats = aggregate([metric({ mode: 'load', method: 'POST', route: '/orders' })], 5);
    expect(stats).toMatchObject({ mode: 'load', method: 'POST', route: '/orders' });
  });

  describe('rps', () => {
    it('stays null below the minimum sample count', () => {
      const stats = aggregate(samples(MIN_SAMPLES_FOR_RPS - 1), 5);
      expect(stats?.rps).toBeNull();
    });

    it('is reported once the minimum is reached', () => {
      const stats = aggregate(samples(MIN_SAMPLES_FOR_RPS), 5);
      expect(stats?.rps).toBe(2);
    });

    it('divides by the window length', () => {
      expect(aggregate(samples(60), 60)?.rps).toBe(1);
      expect(aggregate(samples(60), 5)?.rps).toBe(12);
    });
  });
});

describe('summarize', () => {
  it('returns one entry per route and mode', () => {
    const store = new MetricStore();
    store.record(metric({ route: '/users' }));
    store.record(metric({ route: '/orders' }));
    store.record(metric({ route: '/users', mode: 'load' }));

    const stats = summarize(store);
    expect(stats).toHaveLength(3);
    expect(stats.map((s) => `${s.mode} ${s.route}`).sort()).toEqual([
      'load /users',
      'observed /orders',
      'observed /users',
    ]);
  });

  it('skips routes whose samples have all expired', () => {
    const store = new MetricStore({ windowMs: 1000 });
    store.record(metric({ timestamp: Date.now() - 5000 }));

    expect(summarize(store)).toEqual([]);
  });

  it('returns nothing for an empty store', () => {
    expect(summarize(new MetricStore())).toEqual([]);
  });
});

describe('statsFromCounts', () => {
  const base = { mode: 'load' as const, method: 'GET', route: '/users/:id' };

  it('returns nothing when nothing was counted', () => {
    expect(statsFromCounts({ ...base, count: 0, totalMs: 0, maxMs: 0, errorCount: 0 }, 5)).toBeNull();
  });

  it('derives average, error rate and rps from the counts', () => {
    const stats = statsFromCounts(
      { ...base, count: 20, totalMs: 500, maxMs: 90, errorCount: 5 },
      4,
    );
    expect(stats).toEqual({
      ...base,
      count: 20,
      averageMs: 25,
      maxMs: 90,
      errorCount: 5,
      errorRate: 0.25,
      rps: 5,
    });
  });

  it('applies the same minimum-sample rule as aggregate', () => {
    const thin = { ...base, count: MIN_SAMPLES_FOR_RPS - 1, totalMs: 9, maxMs: 1, errorCount: 0 };
    expect(statsFromCounts(thin, 5)?.rps).toBeNull();
  });

  it('never divides by a zero-length period', () => {
    const counts = { ...base, count: 50, totalMs: 50, maxMs: 1, errorCount: 0 };
    expect(statsFromCounts(counts, 0)?.rps).toBeNull();
  });

  it('matches what aggregate computes for the same samples', () => {
    const list = [10, 20, 60].map((durationMs, i) =>
      metric({ durationMs, statusCode: i === 2 ? 500 : 200, success: i !== 2, mode: 'load' }),
    );
    const counts = emptyCounts('load', 'GET', '/users');
    list.forEach((s) => addSample(counts, s));
    expect(statsFromCounts(counts, 5)).toEqual(aggregate(list, 5));
  });
});
