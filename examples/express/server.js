const { createApp, DEMO_TOKEN } = require('./app');
const { formatTable } = require('./table');
const { formatRecordings } = require('./recordings');

const port = Number(process.env.PORT) || 3000;
const { app, profiler } = createApp();

app.listen(port, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${port}`;
  console.log(`Listening on ${base}`);
  console.log('From another terminal, try:');
  console.log(`  curl ${base}/users/1`);
  console.log(`  curl ${base}/slow`);
  console.log(`  curl ${base}/error`);
  console.log(`  curl ${base}/api/orders`);
  console.log(
    `  curl -X POST ${base}/login -H "content-type: application/json" ` +
      `-H "authorization: Bearer ${DEMO_TOKEN}" -d '{"email":"a@b.c","password":"x"}'`,
  );
  console.log('\nMetrics cover the last 5 seconds; recordings stay until the app restarts.\n');
});

setInterval(() => {
  const stats = profiler.stats();
  const recordings = formatRecordings({
    recordings: profiler.recordings(),
    stats,
    isRecording: profiler.isRecording,
  });
  console.log(`\n${new Date().toLocaleTimeString()}\n${formatTable(stats)}\n\nRecordings\n${recordings}`);
}, 5000);
