# @api-profiler/express

See how fast your Express routes actually are — measured on real requests,
never guessed — and replay a recorded request under load with one call.

```bash
npm install @api-profiler/express
```

```js
const express = require('express');
const { profiler } = require('@api-profiler/express');

const app = express();
const p = profiler();
app.use(p);            // before your routes

app.listen(3000);
```

That is all. Send a few requests, then either:

- open the terminal: `npx api-profiler` (package `api-profiler`) for a live table;
- install the **API Performance Profiler** VS Code extension to see `🟢 84ms`
  at the end of each route line, and a `▶ Load test` lens above it;
- read the figures in code: `p.stats()`.

## What it measures

Per route (`GET /users/:id`, as written in your code) for the last 5 seconds:
request count, average and max latency, error rate, and requests per second
once there are enough samples. Observed traffic and generated load are kept
apart and always labelled.

## Load testing

Locally, the profiler keeps the most recent successful request per route in
memory — URL, headers (auth included) and body — so it can replay it:

```js
const result = await p.loadTest('GET', '/users/:id');   // 10 connections × 5s
result.stats;   // the route's own server-side figures for the run
```

Rules that never bend: off in production, localhost targets only, `GET` only
unless you opt a route in with `profiler({ allowLoadOn: ['POST /search'] })`
(replaying a `POST` writes real data). Every replayed request carries
`x-api-profiler-load: 1` so handlers can skip mail, payments and the like.

## Privacy

Recordings hold live credentials. They stay in memory, are never written to
disk or sent anywhere, and are masked wherever they are shown. With
`NODE_ENV=production` nothing is recorded at all. **Set `NODE_ENV=production`
on your servers**: an unset `NODE_ENV` counts as development.

In development a small JSON server opens on `http://127.0.0.1:4780` (loopback
only) for the CLI and the extension. `profiler({ channel: false })` turns it
off, `profiler({ channel: { port: 4790 } })` moves it.

## Options

```js
profiler({
  windowMs: 5000,                 // rolling window for the figures
  allowLoadOn: ['POST /search'],  // non-GET routes that may be replayed
  channel: { port: 4780 },        // or false
});
```

Works with Express 4 and 5, Node 18+. Zero overhead on the request path
beyond a timer and one in-memory update.

## Licence

AGPL-3.0-only. Source and issues: https://github.com/Nahid625/api-performance-profiler
