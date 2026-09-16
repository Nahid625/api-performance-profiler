const { renderTable } = require('./table');

function age(at) {
  return `${Math.max(0, Math.round((Date.now() - at) / 1000))}s ago`;
}

function formatLoadResults(results) {
  if (results.length === 0) {
    return 'No load test has been run yet.';
  }

  const rows = results.map((r) => {
    if (!r.stats) {
      return [`${r.method} ${r.route}`, String(r.sent.responses), '—', '—', '—', '—', `${age(r.completedAt)} · ${r.note}`];
    }
    const s = r.stats;
    return [
      `${r.method} ${r.route}`,
      String(s.count),
      `${s.averageMs.toFixed(1)}ms`,
      `${s.maxMs.toFixed(1)}ms`,
      `${(s.errorRate * 100).toFixed(0)}%`,
      s.rps === null ? '--' : s.rps.toFixed(0),
      `${age(r.completedAt)} · ${r.connections} conn × ${r.durationSeconds.toFixed(0)}s`,
    ];
  });

  return renderTable(['route', 'count', 'avg', 'max', 'errors', 'req/s', 'run'], rows);
}

module.exports = { formatLoadResults };
