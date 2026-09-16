import type { RouteStats } from '@api-profiler/core';
import type { LoadResult } from '@api-profiler/node';
import { ANSI, light, newLiveState, renderLive } from './live';

const T = { fast: 200, warn: 500 };
const DIM = `${String.fromCharCode(27)}[2m`;

function stat(overrides: Partial<RouteStats> = {}): RouteStats {
  return {
    mode: 'observed',
    method: 'GET',
    route: '/users/:id',
    count: 12,
    averageMs: 4,
    maxMs: 9,
    errorCount: 0,
    errorRate: 0,
    rps: null,
    ...overrides,
  };
}

function run(overrides: Partial<LoadResult> = {}): LoadResult {
  return {
    method: 'GET',
    route: '/users/:id',
    target: 'http://127.0.0.1:3000',
    connections: 5,
    durationSeconds: 2,
    completedAt: 1_000_000,
    stats: stat({ mode: 'load', count: 4000, averageMs: 1.2, maxMs: 30, rps: 2000 }),
    note: null,
    sent: {
      requestsSent: 4000,
      responses: 4000,
      non2xx: 0,
      errors: 0,
      timeouts: 0,
      durationSeconds: 2,
      connections: 5,
    },
    ...overrides,
  };
}

describe('light', () => {
  it('colours by the configured thresholds', () => {
    expect(light(84, T)).toBe('🟢');
    expect(light(199.9, T)).toBe('🟢');
    expect(light(200, T)).toBe('🟡');
    expect(light(499, T)).toBe('🟡');
    expect(light(500, T)).toBe('🔴');
    expect(light(84, { fast: 50, warn: 100 })).toBe('🟡');
  });
});

describe('renderLive', () => {
  it('marks routes in the window as live', () => {
    const out = renderLive(newLiveState(), [stat()], [], T, 1_000_000);
    expect(out).toContain('🟢');
    expect(out).toContain('GET /users/:id');
    expect(out).toContain('live');
    expect(out).not.toContain('Load tests');
  });

  it('keeps a route after it leaves the window, dimmed and aged', () => {
    const state = newLiveState();
    renderLive(state, [stat({ averageMs: 300 })], [], T, 1_000_000, ANSI);
    const later = renderLive(state, [], [], T, 1_040_000, ANSI);

    expect(later).toContain('GET /users/:id');
    expect(later).toContain('40s ago');
    expect(later).toContain('300.0ms');
    expect(later).toContain(DIM);
    expect(later).not.toContain('live');
  });

  it('refreshes a remembered route when it comes back', () => {
    const state = newLiveState();
    renderLive(state, [stat({ averageMs: 300 })], [], T, 1_000_000);
    const back = renderLive(state, [stat({ averageMs: 5 })], [], T, 1_030_000);
    expect(back).toContain('5.0ms');
    expect(back).not.toContain('300.0ms');
    expect(back).toContain('live');
  });

  it('shows load runs separately with their age', () => {
    const out = renderLive(newLiveState(), [stat()], [run()], T, 1_120_000);
    expect(out).toContain('Load tests');
    expect(out).toContain('load · 2 min ago');
    expect(out).toContain('4000');
    expect(out).toContain('2000');
  });

  it('never mixes a load-mode window row into observed traffic', () => {
    const out = renderLive(newLiveState(), [stat({ mode: 'load', count: 999 })], [], T, 1_000_000);
    expect(out).toContain('No requests yet');
    expect(out).not.toContain('999');
  });

  it('shows a run without server-side figures honestly', () => {
    const out = renderLive(
      newLiveState(),
      [],
      [run({ stats: null, note: 'the target did not report through this profiler' })],
      T,
      1_000_000,
    );
    expect(out).toContain('⚪');
    expect(out).toContain('did not report');
  });

  it('explains an empty state', () => {
    expect(renderLive(newLiveState(), [], [], T, 0)).toContain('No requests yet');
  });
});
