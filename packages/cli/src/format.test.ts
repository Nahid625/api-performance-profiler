import type { RouteStats } from '@api-profiler/core';
import type { LoadResult, MaskedRecording } from '@api-profiler/node';
import { age, formatLoadResults, formatRoutes, formatStats, ms, percent, renderTable, rps } from './format';

function stat(overrides: Partial<RouteStats> = {}): RouteStats {
  return {
    mode: 'observed',
    method: 'GET',
    route: '/users/:id',
    count: 12,
    averageMs: 4.25,
    maxMs: 9.1,
    errorCount: 0,
    errorRate: 0,
    rps: null,
    ...overrides,
  };
}

function recording(overrides: Partial<MaskedRecording> = {}): MaskedRecording {
  return {
    method: 'GET',
    route: '/users/:id',
    url: '/users/42',
    origin: 'http://127.0.0.1:3000',
    headers: { authorization: 'Bearer ••••••' },
    body: { kind: 'none' },
    recordedAt: 1_000_000,
    ...overrides,
  };
}

describe('formatting helpers', () => {
  it('formats durations, rates and throughput', () => {
    expect(ms(84.26)).toBe('84.3ms');
    expect(ms(1820)).toBe('1.82s');
    expect(percent(0)).toBe('0%');
    expect(percent(0.002)).toBe('0.2%');
    expect(percent(0.5)).toBe('50%');
    expect(rps(null)).toBe('--');
    expect(rps(2.4)).toBe('2.4');
    expect(rps(3553.4)).toBe('3553');
  });

  it('describes age in seconds, minutes and hours', () => {
    const now = 10_000_000;
    expect(age(now - 3_000, now)).toBe('3s ago');
    expect(age(now - 150_000, now)).toBe('2 min ago');
    expect(age(now - 7_200_000, now)).toBe('2 h ago');
    expect(age(now + 5_000, now)).toBe('0s ago');
  });

  it('aligns columns, counting emoji as two cells', () => {
    const table = renderTable(['a', 'b'], [['🟢', 'x'], ['long', 'y']]);
    const lines = table.split('\n');
    expect(lines[2]).toBe('🟢    x');
    expect(lines[3]).toBe('long  y');
  });
});

describe('formatStats', () => {
  it('explains an empty window', () => {
    expect(formatStats([])).toContain('No requests in the last window');
  });

  it('lists observed before load and slowest first within a mode', () => {
    const out = formatStats([
      stat({ mode: 'load', route: '/l', averageMs: 1 }),
      stat({ route: '/fast', averageMs: 2 }),
      stat({ route: '/slow', averageMs: 300, rps: 118 }),
    ]);
    const routes = out.split('\n').slice(2).map((l) => l.split(/\s{2,}/)[1]);
    expect(routes).toEqual(['GET /slow', 'GET /fast', 'GET /l']);
    expect(out).toContain('300.0ms');
    expect(out).toContain('118');
    expect(out).toContain('--');
  });
});

describe('formatRoutes', () => {
  it('shows recordings masked and unrecorded routes with a reason', () => {
    const now = 1_030_000;
    const out = formatRoutes(
      [recording()],
      [stat(), stat({ route: '/error', count: 4, errorCount: 4, errorRate: 1 }), stat({ route: '(unmatched)' })],
      now,
    );
    expect(out).toContain('GET /users/:id');
    expect(out).toContain('recorded');
    expect(out).toContain('Bearer ••••••');
    expect(out).toContain('30s ago');
    expect(out).toContain('GET /error');
    expect(out).toContain('no successful response yet (4 failed)');
    expect(out).not.toContain('(unmatched)');
  });

  it('explains when nothing has been seen', () => {
    expect(formatRoutes([], [])).toContain('No routes seen yet');
  });
});

describe('formatLoadResults', () => {
  const sent = { requestsSent: 100, responses: 100, non2xx: 0, errors: 0, timeouts: 0, durationSeconds: 2, connections: 5 };

  it('shows a run with figures', () => {
    const result: LoadResult = {
      method: 'GET',
      route: '/users/:id',
      target: 'http://127.0.0.1:3000',
      connections: 5,
      durationSeconds: 2,
      completedAt: 1_000_000,
      stats: stat({ mode: 'load', count: 100, averageMs: 0.9, maxMs: 4, rps: 50 }),
      note: null,
      sent,
    };
    const out = formatLoadResults([result], 1_002_000);
    expect(out).toContain('GET /users/:id');
    expect(out).toContain('100');
    expect(out).toContain('2s ago · 5 conn × 2s');
  });

  it('shows why figures are missing instead of inventing them', () => {
    const result: LoadResult = {
      method: 'GET',
      route: '/x',
      target: 'http://127.0.0.1:3000',
      connections: 5,
      durationSeconds: 2,
      completedAt: 1_000_000,
      stats: null,
      note: 'the target did not report through this profiler',
      sent,
    };
    const out = formatLoadResults([result], 1_000_000);
    expect(out).toContain('did not report');
    expect(out).toContain('—');
  });

  it('explains when nothing has run', () => {
    expect(formatLoadResults([])).toContain('No load test has been run yet');
  });
});
