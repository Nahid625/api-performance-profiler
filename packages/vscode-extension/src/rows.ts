import type { RouteStats } from '@api-profiler/core';
import type { LoadResult } from '@api-profiler/node';
import { absorb, age, light, LiveState, ms, percent, rps, Thresholds } from 'api-profiler';
import type { ConnectionState } from './connection';

export interface Row {
  key: string;
  method: string;
  route: string;
  label: string;
  description: string;
  tooltip: string;
  // Short form for the editor: "🟢 84.0ms · live", never a number that was not measured.
  inline: string;
  stale: boolean;
  averageMs: number;
}

export interface Section {
  title: string;
  rows: Row[];
}

export interface Action {
  label: string;
  command: string;
}

export type Panel =
  | { kind: 'message'; text: string; detail?: string; setup?: true; actions?: Action[] }
  | { kind: 'sections'; sections: Section[] };

const INSTALL: Action = { label: 'Install @api-profiler/express', command: 'apiProfiler.install' };
const ADD: Action = { label: 'Add app.use(profiler()) to your app', command: 'apiProfiler.addMiddleware' };

export function setupActions(missing: 'package' | 'middleware'): Action[] {
  return missing === 'package' ? [INSTALL, ADD] : [ADD];
}

export function buildPanel(
  state: ConnectionState,
  live: LiveState,
  thresholds: Thresholds,
  now: number,
): Panel {
  switch (state.kind) {
    case 'setup-needed':
      return state.missing === 'package'
        ? {
            kind: 'message',
            text: 'Profiler not installed in this workspace',
            detail: 'npm install @api-profiler/express, then app.use(profiler())',
            setup: true,
            actions: setupActions('package'),
          }
        : {
            kind: 'message',
            text: 'One line left: app.use(profiler())',
            detail: '@api-profiler/express is installed; add app.use(profiler()) before your routes, then start the app.',
            setup: true,
            actions: setupActions('middleware'),
          };
    case 'unreachable':
      return {
        kind: 'message',
        text: 'App not running',
        detail: `Nothing answers at ${state.url}. Start the app with app.use(profiler()).`,
      };
    case 'connected':
      return sections(state.stats, state.loadResults, live, thresholds, now);
  }
}

function sections(
  stats: RouteStats[],
  loadResults: LoadResult[],
  live: LiveState,
  thresholds: Thresholds,
  now: number,
): Panel {
  absorb(live, stats, now);
  const inWindow = new Set(stats.filter((s) => s.mode === 'observed').map((s) => `${s.method} ${s.route}`));

  const observed = [...live.remembered.entries()]
    .map(([key, { stats: s, lastSeenAt }]) => {
      const stale = !inWindow.has(key);
      const when = stale ? age(lastSeenAt, now) : 'live';
      return {
        key,
        method: s.method,
        route: s.route,
        label: `${light(s.averageMs, thresholds)} ${key}`,
        description: `${ms(s.averageMs)} · ${s.count} req · ${rps(s.rps)} req/s · ${when}`,
        tooltip: tooltipFor(s, when, null),
        inline: `${light(s.averageMs, thresholds)} ${ms(s.averageMs)} · ${when}`,
        stale,
        averageMs: s.averageMs,
      };
    })
    .sort((a, b) => b.averageMs - a.averageMs);

  const load = [...loadResults]
    .sort((a, b) => b.completedAt - a.completedAt)
    .map((r) => {
      const key = `${r.method} ${r.route}`;
      const when = `load · ${age(r.completedAt, now)}`;
      if (!r.stats) {
        return {
          key: `load ${key}`,
          method: r.method,
          route: r.route,
          label: `⚪ ${key}`,
          description: `${r.sent.responses} responses · ${when}`,
          tooltip: `**${key}**\n\n${r.note}\n\nSent ${r.sent.requestsSent}, ${r.sent.responses} responses, ${r.sent.non2xx} non-2xx, ${r.sent.errors} errors.`,
          inline: `⚪ no figures · ${when}`,
          stale: false,
          averageMs: 0,
        };
      }
      return {
        key: `load ${key}`,
        method: r.method,
        route: r.route,
        label: `${light(r.stats.averageMs, thresholds)} ${key}`,
        description: `${ms(r.stats.averageMs)} · ${r.stats.count} req · ${rps(r.stats.rps)} req/s · ${when}`,
        tooltip: tooltipFor(r.stats, when, `${r.connections} connections × ${r.durationSeconds.toFixed(0)}s against ${r.target}`),
        inline: `${light(r.stats.averageMs, thresholds)} ${ms(r.stats.averageMs)} · ${when}`,
        stale: false,
        averageMs: r.stats.averageMs,
      };
    });

  if (observed.length === 0 && load.length === 0) {
    return { kind: 'message', text: 'No requests yet', detail: 'Send a request to the app and it will appear here.' };
  }
  const result: Section[] = [{ title: 'Observed traffic', rows: observed }];
  if (load.length) {
    result.push({ title: 'Load tests', rows: load });
  }
  return { kind: 'sections', sections: result };
}

function tooltipFor(s: RouteStats, when: string, run: string | null): string {
  const lines = [
    `**${s.method} ${s.route}** — ${s.mode === 'load' ? 'load test' : 'observed traffic'}, ${when}`,
    '',
    `Average ${ms(s.averageMs)} · Max ${ms(s.maxMs)}`,
    `Requests ${s.count} · Errors ${s.errorCount} (${percent(s.errorRate)})`,
    `Throughput ${s.rps === null ? '-- (fewer than 10 samples)' : `${rps(s.rps)} req/s`}`,
  ];
  if (run) {
    lines.push('', run);
  }
  return lines.join('\n');
}
