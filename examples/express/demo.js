const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('./app');
const { formatTable } = require('./table');

async function hit(base, path, times) {
  await Promise.all(
    Array.from({ length: times }, async () => {
      const res = await fetch(base + path);
      await res.text();
    }),
  );
}

function find(stats, route) {
  const entry = stats.find((s) => s.route === route);
  assert.ok(entry, `expected stats for ${route}`);
  return entry;
}

async function main() {
  const { app, stats } = createApp();
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

  // 'finish' can land a tick after the client has read the body.
  await new Promise((resolve) => setTimeout(resolve, 50));
  server.closeAllConnections();
  server.close();

  const result = stats();
  console.log(formatTable(result));

  const users = find(result, '/users/:id');
  assert.equal(users.count, 12, 'twelve different ids collapse into one template');
  assert.equal(users.rps, 12 / 5, 'rps is completed requests over the 5s window');

  const slow = find(result, '/slow');
  assert.ok(slow.averageMs >= 200, `/slow waits 200ms, measured ${slow.averageMs}`);
  assert.equal(slow.rps, null, 'under 10 samples reports no rps');

  assert.equal(find(result, '/error').errorRate, 1);
  assert.equal(find(result, '/api/orders').count, 2);
  assert.equal(find(result, '(unmatched)').count, 1);

  console.log('\nAll figures match what was sent.');
}

main().catch((error) => {
  console.error(`\nDemo check failed: ${error.message}`);
  process.exit(1);
});
