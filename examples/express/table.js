function formatTable(stats) {
  if (stats.length === 0) {
    return 'No requests in the last window yet.';
  }

  const rows = [...stats]
    .sort((a, b) => b.averageMs - a.averageMs)
    .map((s) => [
      s.mode,
      `${s.method} ${s.route}`,
      String(s.count),
      `${s.averageMs.toFixed(1)}ms`,
      `${s.maxMs.toFixed(1)}ms`,
      `${(s.errorRate * 100).toFixed(0)}%`,
      s.rps === null ? '--' : s.rps.toFixed(1),
    ]);

  const header = ['mode', 'route', 'count', 'avg', 'max', 'errors', 'req/s'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');

  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

module.exports = { formatTable };
