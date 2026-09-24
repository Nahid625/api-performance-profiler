const express = require('express');
const { profiler } = require('../packages/express/dist/middleware.js');
const autocannon = require('autocannon');
const http = require('http');

async function runBenchmark(useProfiler) {
  const app = express();
  
  if (useProfiler) {
    app.use(profiler({ channel: false }));
  }

  app.get('/test', (req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  
  return new Promise((resolve) => {
    server.listen(3000, async () => {
      console.log(`\n--- Running Benchmark ${useProfiler ? 'WITH' : 'WITHOUT'} Profiler ---`);
      
      const instance = autocannon({
        url: 'http://localhost:3000/test',
        connections: 100,
        duration: 5
      });
      
      autocannon.track(instance, {renderProgressBar: false});
      
      instance.on('done', (result) => {
        console.log(`Requests/sec: ${result.requests.average}`);
        console.log(`Latency (p50): ${result.latency.p50} ms`);
        console.log(`Latency (p99): ${result.latency.p99} ms`);
        server.close();
        setTimeout(resolve, 500);
      });
    });
  });
}

async function main() {
  await runBenchmark(false);
  await runBenchmark(true);
}

main();
