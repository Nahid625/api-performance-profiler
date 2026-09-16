import type { RouteStats } from '@api-profiler/core';
import type { LoadResult, MaskedRecording } from '@api-profiler/node';

export function renderTable(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i] ?? ''))));
  const line = (cells: string[]) =>
    cells.map((c, i) => c + ' '.repeat(widths[i] - width(c))).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

// Emoji are double-width in most terminals; pad by what is actually displayed.
function width(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1;
  }
  return w;
}

export function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(1)}ms`;
}

export function percent(rate: number): string {
  return `${(rate * 100).toFixed(rate > 0 && rate < 0.01 ? 1 : 0)}%`;
}

export function rps(value: number | null): string {
  return value === null ? '--' : value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function age(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

export function formatStats(stats: RouteStats[]): string {
  if (stats.length === 0) {
    return 'No requests in the last window. Send a request to the app and try again.';
  }
  const rows = [...stats]
    .sort((a, b) => (a.mode === b.mode ? b.averageMs - a.averageMs : a.mode === 'observed' ? -1 : 1))
    .map((s) => [
      s.mode,
      `${s.method} ${s.route}`,
      String(s.count),
      ms(s.averageMs),
      ms(s.maxMs),
      percent(s.errorRate),
      rps(s.rps),
    ]);
  return renderTable(['mode', 'route', 'count', 'avg', 'max', 'errors', 'req/s'], rows);
}

function describeBody(body: MaskedRecording['body']): string {
  if (body.kind === 'none') {
    return 'none';
  }
  if (body.kind === 'unavailable') {
    return 'not captured';
  }
  return `${body.contentType ?? 'unknown type'} · ${body.bytes} B`;
}

export function formatRoutes(
  recordings: MaskedRecording[],
  stats: RouteStats[],
  now = Date.now(),
): string {
  const recorded = new Map(recordings.map((r) => [`${r.method} ${r.route}`, r]));
  const seen = new Set<string>();
  const rows: string[][] = [];

  for (const r of [...recordings].sort((a, b) => a.route.localeCompare(b.route))) {
    const key = `${r.method} ${r.route}`;
    seen.add(key);
    rows.push([key, 'recorded', r.url, r.headers.authorization ?? '—', describeBody(r.body), age(r.recordedAt, now)]);
  }
  for (const s of stats) {
    const key = `${s.method} ${s.route}`;
    if (s.mode !== 'observed' || s.route === '(unmatched)' || recorded.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const why =
      s.errorCount === s.count
        ? `not recorded — no successful response yet (${s.count} failed)`
        : 'not recorded yet';
    rows.push([key, why, '', '', '', '']);
  }

  if (rows.length === 0) {
    return 'No routes seen yet. Send a request to the app and try again.';
  }
  return renderTable(['route', 'status', 'url', 'auth', 'body', 'recorded'], rows);
}

export function formatLoadResults(results: LoadResult[], now = Date.now()): string {
  if (results.length === 0) {
    return 'No load test has been run yet.';
  }
  const rows = results.map((r) => {
    const run = `${age(r.completedAt, now)} · ${r.connections} conn × ${r.durationSeconds.toFixed(0)}s`;
    if (!r.stats) {
      return [`${r.method} ${r.route}`, String(r.sent.responses), '—', '—', '—', '—', `${run} · ${r.note}`];
    }
    return [
      `${r.method} ${r.route}`,
      String(r.stats.count),
      ms(r.stats.averageMs),
      ms(r.stats.maxMs),
      percent(r.stats.errorRate),
      rps(r.stats.rps),
      run,
    ];
  });
  return renderTable(['route', 'count', 'avg', 'max', 'errors', 'req/s', 'run'], rows);
}
