const { once } = require('node:events');
const { createApp } = require('./app');
const { formatLoadResults } = require('./loadresults');

function usage(message) {
  console.error(`${message}\n\nUsage: npm run load -w example-express -- GET /users/42 [--connections 10] [--duration 5]`);
  process.exit(1);
}

function parse(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = Number(argv[++i]);
    } else {
      positional.push(argv[i]);
    }
  }
  const [method = 'GET', path] = positional;
  if (!path) {
    usage('Give a real path to record and replay.');
  }
  if (path.includes(':')) {
    usage(`"${path}" is a route template — pass a real path such as /users/42.`);
  }
  return { method: method.toUpperCase(), path, connections: flags.connections, duration: flags.duration };
}

async function main() {
  const { method, path, connections, duration } = parse(process.argv.slice(2));
  const { app, profiler } = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const target = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await fetch(target + path, { method });
    await res.text();
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (!res.ok) {
      usage(`${method} ${path} answered ${res.status}; only a successful request can be recorded.`);
    }

    const recording = profiler.recordings().find((r) => r.method === method && r.url === path);
    if (!recording) {
      usage(`${method} ${path} was not recorded.`);
    }

    console.log(`Recorded ${method} ${recording.route} from ${path}. Running load test...\n`);
    const result = await profiler.loadTest(method, recording.route, { target, connections, duration });
    console.log(formatLoadResults([result]));
    console.log(`\nSent ${result.sent.requestsSent}, got ${result.sent.responses} responses, ${result.sent.non2xx} non-2xx, ${result.sent.errors} errors.`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

main().catch((error) => {
  console.error(`\nLoad run failed: ${error.message}`);
  process.exit(1);
});
