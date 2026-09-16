import type { RouteStats } from '@api-profiler/core';
import type { LoadResult } from '@api-profiler/node';
import { age, ms, percent, renderTable, rps } from './format';

export interface Thresholds {
  fast: number;
  warn: number;
}

export interface Remembered {
  stats: RouteStats;
  lastSeenAt: number;
}

export interface LiveState {
  // Observed rows keep their last figures after the window empties, shown dimmed with an age.
  remembered: Map<string, Remembered>;
}

export interface Style {
  dim(text: string): string;
}

const ESC = String.fromCharCode(27);

export const PLAIN: Style = { dim: (t) => t };
export const ANSI: Style = { dim: (t) => `${ESC}[2m${t}${ESC}[22m` };

export function newLiveState(): LiveState {
  return { remembered: new Map() };
}

export function light(averageMs: number, thresholds: Thresholds): string {
  if (averageMs < thresholds.fast) {
    return '🟢';
  }
  return averageMs < thresholds.warn ? '🟡' : '🔴';
}

export function absorb(state: LiveState, stats: RouteStats[], now: number): void {
  for (const s of stats) {
    if (s.mode === 'observed') {
      state.remembered.set(`${s.method} ${s.route}`, { stats: s, lastSeenAt: now });
    }
  }
}

export function renderLive(
  state: LiveState,
  stats: RouteStats[],
  loadResults: LoadResult[],
  thresholds: Thresholds,
  now: number,
  style: Style = PLAIN,
): string {
  absorb(state, stats, now);
  const live = new Set(
    stats.filter((s) => s.mode === 'observed').map((s) => `${s.method} ${s.route}`),
  );

  const observed = [...state.remembered.entries()]
    .sort(([, a], [, b]) => b.stats.averageMs - a.stats.averageMs)
    .map(([key, { stats: s, lastSeenAt }]) => {
      const cells = [
        light(s.averageMs, thresholds),
        key,
        String(s.count),
        ms(s.averageMs),
        ms(s.maxMs),
        percent(s.errorRate),
        rps(s.rps),
        live.has(key) ? 'live' : age(lastSeenAt, now),
      ];
      return live.has(key) ? cells : cells.map((c) => style.dim(c));
    });

  const load = [...loadResults]
    .sort((a, b) => b.completedAt - a.completedAt)
    .map((r) => {
      const when = `load · ${age(r.completedAt, now)}`;
      if (!r.stats) {
        return ['⚪', `${r.method} ${r.route}`, String(r.sent.responses), '—', '—', '—', '—', `${when} · ${r.note}`];
      }
      return [
        light(r.stats.averageMs, thresholds),
        `${r.method} ${r.route}`,
        String(r.stats.count),
        ms(r.stats.averageMs),
        ms(r.stats.maxMs),
        percent(r.stats.errorRate),
        rps(r.stats.rps),
        when,
      ];
    });

  const header = ['', 'route', 'count', 'avg', 'max', 'errors', 'req/s', 'when'];
  const sections: string[] = [];
  sections.push(
    observed.length
      ? `Observed traffic\n${renderTable(header, observed)}`
      : 'Observed traffic\nNo requests yet — send one to the app.',
  );
  if (load.length) {
    sections.push(`Load tests\n${renderTable(header, load)}`);
  }
  return sections.join('\n\n');
}
