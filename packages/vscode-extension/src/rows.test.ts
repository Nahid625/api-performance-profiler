import type { RouteStats } from '@api-profiler/core';
import type { LoadResult } from '@api-profiler/node';
import { newLiveState } from 'api-profiler';
import { buildPanel } from './rows';

const T = { fast: 200, warn: 500 };

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

function connected(stats: RouteStats[], loadResults: LoadResult[] = []) {
  return { kind: 'connected' as const, url: 'http://127.0.0.1:4780', version: '0.0.0', stats, loadResults };
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
    sent: { requestsSent: 4000, responses: 4000, non2xx: 0, errors: 0, timeouts: 0, durationSeconds: 2, connections: 5 },
    ...overrides,
  };
}

describe('buildPanel', () => {
  it('explains setup-needed and unreachable', () => {
    expect(buildPanel({ kind: 'setup-needed' }, newLiveState(), T, 0)).toMatchObject({
      kind: 'message',
      text: 'Profiler not installed in this workspace',
    });
    const p = buildPanel({ kind: 'unreachable', url: 'http://127.0.0.1:4780' }, newLiveState(), T, 0);
    expect(p).toMatchObject({ kind: 'message', text: 'App not running' });
    expect(p.kind === 'message' && p.detail).toContain('127.0.0.1:4780');
  });

  it('explains an empty window', () => {
    expect(buildPanel(connected([]), newLiveState(), T, 0)).toMatchObject({ kind: 'message', text: 'No requests yet' });
  });

  it('lists observed routes slowest first with a light, figures and age', () => {
    const p = buildPanel(
      connected([stat({ route: '/fast', averageMs: 3 }), stat({ route: '/slow', averageMs: 300, rps: 118 })]),
      newLiveState(),
      T,
      1_000_000,
    );
    expect(p.kind).toBe('sections');
    if (p.kind !== 'sections') {
      return;
    }
    expect(p.sections).toHaveLength(1);
    const rows = p.sections[0].rows;
    expect(rows.map((r) => r.label)).toEqual(['🟡 GET /slow', '🟢 GET /fast']);
    expect(rows[0].description).toBe('300.0ms · 12 req · 118 req/s · live');
    expect(rows[1].description).toContain('-- req/s');
    expect(rows[0].tooltip).toContain('Average 300.0ms');
    expect(rows[0].tooltip).toContain('observed traffic');
    expect(rows[0].inline).toBe('🟡 300.0ms · live');
    expect(rows[0].stale).toBe(false);
  });

  it('keeps a route that left the window, marked stale with its age', () => {
    const live = newLiveState();
    buildPanel(connected([stat({ averageMs: 300 })]), live, T, 1_000_000);
    const p = buildPanel(connected([]), live, T, 1_040_000);
    expect(p.kind).toBe('sections');
    if (p.kind !== 'sections') {
      return;
    }
    const [row] = p.sections[0].rows;
    expect(row.stale).toBe(true);
    expect(row.description).toContain('40s ago');
    expect(row.description).not.toContain('live');
    expect(row.inline).toBe('🟡 300.0ms · 40s ago');
  });

  it('shows load runs in their own section, never mixed with observed rows', () => {
    const p = buildPanel(connected([stat({ mode: 'load', count: 999 })], [run()]), newLiveState(), T, 1_120_000);
    expect(p.kind).toBe('sections');
    if (p.kind !== 'sections') {
      return;
    }
    expect(p.sections.map((s) => s.title)).toEqual(['Observed traffic', 'Load tests']);
    expect(p.sections[0].rows).toEqual([]);
    const [load] = p.sections[1].rows;
    expect(load.label).toBe('🟢 GET /users/:id');
    expect(load.description).toContain('load · 2 min ago');
    expect(load.tooltip).toContain('load test');
    expect(load.tooltip).toContain('5 connections × 2s');
    expect(load.inline).toBe('🟢 1.2ms · load · 2 min ago');
  });

  it('shows a run without server-side figures honestly', () => {
    const p = buildPanel(
      connected([], [run({ stats: null, note: 'the target did not report through this profiler' })]),
      newLiveState(),
      T,
      1_120_000,
    );
    if (p.kind !== 'sections') {
      throw new Error('expected sections');
    }
    const [load] = p.sections[1].rows;
    expect(load.label).toBe('⚪ GET /users/:id');
    expect(load.tooltip).toContain('did not report');
    expect(load.inline).toBe('⚪ no figures · load · 2 min ago');
    expect(load.inline).not.toMatch(/\d+ms/);
  });
});
