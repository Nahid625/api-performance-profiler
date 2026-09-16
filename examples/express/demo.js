const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, DEMO_TOKEN } = require('./app');
const { formatTable } = require('./table');
const { formatRecordings } = require('./recordings');
const { formatLoadResults } = require('./loadresults');

async function hit(base, path, times) {
  await Promise.all(
    Array.from({ length: times }, async () => {
      const res = await fetch(base + path);
      await res.text();
    }),
  );
}

async function login(base, email, password, token) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, password }),
  });
  await res.text();
  return res.status;
}

function find(stats, route) {
  const entry = stats.find((s) => s.route === route);
  assert.ok(entry, `expected stats for ${route}`);
  return entry;
}

async function main() {
  const { app, profiler } = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  for (let id = 1; id <= 12; id++) {
    await hit(base, `/users/${id}`, 1);
  }
  await hit(base, '/slow', 3);
  await hit(base, '/error', 4);
  await hit(base, '/api/orders', 2);
  await hit(base, '/not-a-route', 1);

  assert.equal(await login(base, 'first@example.com', 'hunter2', DEMO_TOKEN), 200);
  assert.equal(await login(base, 'second@example.com', 'hunter2', DEMO_TOKEN), 200);
  assert.equal(await login(base, 'third@example.com', 'hunter2', 'wrong-token'), 401);

  // 'finish' can land a tick after the client has read the body.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const recordedBefore = profiler.recordings().find((r) => r.route === '/users/:id').recordedAt;
  const load = await profiler.loadTest('GET', '/users/:id', { target: base, connections: 5, duration: 2 });
  await assert.rejects(
    profiler.loadTest('POST', '/login', { target: base, connections: 2, duration: 1 }),
    /allowLoadOn/,
    'a POST route is refused unless allow-listed',
  );

  server.closeAllConnections();
  server.close();

  const result = profiler.stats();
  const recordings = profiler.recordings();
  const recordingsText = formatRecordings({
    recordings,
    stats: result,
    isRecording: profiler.isRecording,
  });

  console.log(formatTable(result));
  console.log(`\nRecordings\n${recordingsText}`);
  console.log(`\nLoad tests\n${formatLoadResults(profiler.loadResults())}`);

  const users = find(result, '/users/:id');
  assert.equal(users.count, 12, 'twelve different ids collapse into one template');
  assert.equal(users.rps, 12 / 5, 'rps is completed requests over the 5s window');

  const slow = find(result, '/slow');
  assert.ok(slow.averageMs >= 200, `/slow waits 200ms, measured ${slow.averageMs}`);
  assert.equal(slow.rps, null, 'under 10 samples reports no rps');

  assert.equal(find(result, '/error').errorRate, 1);
  assert.equal(find(result, '/api/orders').count, 2);
  assert.equal(find(result, '(unmatched)').count, 1);
  assert.equal(find(result, '/login').errorCount, 1, 'the bad token counted as one failure');

  const byRoute = Object.fromEntries(recordings.map((r) => [`${r.method} ${r.route}`, r]));
  const recorded = byRoute['POST /login'];
  assert.ok(recorded, 'a successful login was recorded');
  assert.equal(recorded.body.email, 'second@example.com', 'the newest successful request wins');
  assert.equal(recorded.body.password, 'hunter2', 'body kept as sent, even though the handler deleted it');
  assert.equal(recorded.headers.authorization, `Bearer ${DEMO_TOKEN}`, 'the working token is kept for replay');
  assert.equal(byRoute['GET /users/:id'].url, '/users/12', 'newest wins for GET as well');
  assert.equal(byRoute['GET /error'], undefined, 'a route that only failed has no recording');
  assert.equal(byRoute['GET (unmatched)'], undefined, 'unmatched requests are never recorded');
  assert.equal(recordings.length, 4, 'users, slow, orders and login');

  for (const secret of [DEMO_TOKEN, 'hunter2', 'second@example.com']) {
    assert.ok(!recordingsText.includes(secret), `"${secret}" must never be printed`);
  }
  assert.ok(recordingsText.includes('Bearer ••••••'), 'the token is shown masked');
  assert.ok(
    recordingsText.includes('GET /error') && recordingsText.includes('not recorded'),
    'a failing route is listed as not recorded',
  );

  assert.ok(load.stats, 'the load run reported server-side figures');
  assert.equal(load.stats.mode, 'load');
  assert.ok(load.stats.count > 100, `5 connections for 2s should complete far more than 100, got ${load.stats.count}`);
  assert.equal(load.stats.errorRate, 0, 'every replayed request succeeded');
  assert.equal(load.note, null);
  assert.equal(profiler.loadResults().length, 1);
  assert.equal(users.count, 12, 'observed figures are untouched by the load run');
  assert.equal(byRoute['GET /users/:id'].url, '/users/12', 'the recording is untouched by the load run');
  assert.equal(byRoute['GET /users/:id'].recordedAt, recordedBefore, 'thousands of replays never re-recorded the route');

  const allowed = createApp({ allowLoadOn: ['POST /login'] });
  const allowedServer = allowed.app.listen(0, '127.0.0.1');
  await once(allowedServer, 'listening');
  const allowedBase = `http://127.0.0.1:${allowedServer.address().port}`;
  try {
    assert.equal(await login(allowedBase, 'karim@example.com', 'hunter2', DEMO_TOKEN), 200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const postRecordedBefore = allowed.profiler.recordings()[0].recordedAt;
    const post = await allowed.profiler.loadTest('POST', '/login', { target: allowedBase, connections: 2, duration: 1 });
    assert.equal(post.stats.errorRate, 0, 'the replayed POST carried the working token and body');
    assert.equal(allowed.profiler.recordings()[0].recordedAt, postRecordedBefore, 'replays never overwrite the recording');
  } finally {
    allowedServer.closeAllConnections();
    allowedServer.close();
  }

  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const prod = createApp();
    assert.equal(prod.profiler.isRecording, false, 'production never records');
    await assert.rejects(
      prod.profiler.loadTest('GET', '/users/:id', { target: base }),
      /disabled when NODE_ENV/,
      'production never runs load',
    );
  } finally {
    if (env === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = env;
    }
  }

  console.log('\nAll figures match what was sent, no secret was printed, and the load run behaved.');
}

main().catch((error) => {
  console.error(`\nDemo check failed: ${error.message}`);
  process.exit(1);
});
