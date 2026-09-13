const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, DEMO_TOKEN } = require('./app');
const { formatTable } = require('./table');
const { formatRecordings } = require('./recordings');

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

  console.log('\nAll figures match what was sent, and no secret was printed.');
}

main().catch((error) => {
  console.error(`\nDemo check failed: ${error.message}`);
  process.exit(1);
});
