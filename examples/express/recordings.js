const { maskRecording, UNMATCHED_ROUTE } = require('@api-profiler/express');
const { renderTable } = require('./table');

function age(recordedAt) {
  return `${Math.max(0, Math.round((Date.now() - recordedAt) / 1000))}s ago`;
}

function describeBody(body) {
  if (body.kind === 'none') {
    return 'none';
  }
  if (body.kind === 'unavailable') {
    return 'not captured';
  }
  return `${body.contentType ?? 'unknown type'} · ${body.bytes} B`;
}

function formatRecordings({ recordings, stats, isRecording }) {
  if (!isRecording) {
    return 'Recording is off (NODE_ENV is not development or test).';
  }

  const masked = recordings.map(maskRecording).sort((a, b) => a.route.localeCompare(b.route));
  const recorded = new Set(masked.map((r) => `${r.method} ${r.route}`));

  const rows = masked.map((r) => [
    `${r.method} ${r.route}`,
    r.url,
    r.headers.authorization ?? '—',
    describeBody(r.body),
    age(r.recordedAt),
  ]);

  for (const s of stats) {
    const key = `${s.method} ${s.route}`;
    if (s.mode !== 'observed' || s.route === UNMATCHED_ROUTE || recorded.has(key)) {
      continue;
    }
    const why =
      s.errorCount === s.count
        ? `not recorded — no successful response yet (${s.count} failed)`
        : 'not recorded yet';
    rows.push([key, why, '', '', '']);
  }

  if (rows.length === 0) {
    return 'No recordings yet — send a successful request first.';
  }

  return renderTable(['route', 'url', 'auth', 'body', 'recorded'], rows);
}

module.exports = { formatRecordings };
