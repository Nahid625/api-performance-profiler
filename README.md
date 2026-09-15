# api-performance-profiler

Lightweight API performance profiling for Node.js services. It measures real
request timings and status codes as they happen and aggregates them into
per-route metrics (request count, average latency, error rate).

This is an npm workspaces monorepo. Packages are published under the
`@api-profiler` scope:

- `@api-profiler/core` — framework-agnostic metrics types, aggregation engine, and storage.
- `@api-profiler/express` — Express middleware built on `@api-profiler/core`.
- `@api-profiler/node`, `@api-profiler/nestjs`, `@api-profiler/vscode-extension` — planned.

## Install

```bash
npm install @api-profiler/express
```

## Usage

```js
const express = require('express');
const { profiler } = require('@api-profiler/express');

const app = express();
const p = profiler();
app.use(p);

app.listen(3000);

// later: per-route count, average, max, error rate and RPS
p.stats();
```

## Load testing a route

Once a route has a recording, replay it under load — same URL, headers, token
and body — and get the route's own server-side figures for the whole run:

```js
const result = await p.loadTest('GET', '/users/:id', {
  target: 'http://127.0.0.1:3000',   // localhost only
  connections: 10,                   // default
  duration: 5,                       // seconds, default
});

result.stats;      // count, averageMs, maxMs, errorRate, rps for the run
p.loadResults();   // kept until the next run of that route
```

Runs are off by default, refused in production, and `GET`-only unless a route
is listed in `profiler({ allowLoadOn: ['POST /search'] })` — replaying a `POST`
writes real data. Every replayed request carries `x-api-profiler-load: 1`, so
your handlers can skip side effects (mail, payments) during a run.

## Request recording and `NODE_ENV`

Locally, the profiler keeps the most recent successful request for each route
— including its auth headers — so it can be replayed later for load testing.
Recordings live in memory only and are masked wherever they are displayed.

```js
const { profiler, maskRecording } = require('@api-profiler/express');

p.recordings();                     // raw, for replay — holds real tokens
p.recordings().map(maskRecording);  // safe to print or display
```

Recording is on only when `NODE_ENV` is unset, `development` or `test`. Any
other value — `production`, `staging`, anything else — turns it off completely.

**Set `NODE_ENV=production` on your production servers.** If it is left unset
there, the profiler cannot tell it is running in production and will record
real users' requests in memory.

## License

MIT
