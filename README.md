<p align="center"><img src="media/logo.svg" width="128" alt="API Performance Profiler"></p>

# api-performance-profiler

### Inspired by Linus Torvalds

Lightweight API performance profiling for Node.js services. It measures real
request timings and status codes as they happen and aggregates them into
per-route metrics (request count, average latency, error rate).

**The core idea: hit the route once, we replay it a thousand times.** The
middleware sees the real request — the working token, the path param that
exists, the body the route accepts — records it in memory, and can replay it
under load. The results show up in the terminal or next to the route in
VS Code.

This is an npm workspaces monorepo:

| Package | What it is |
|---|---|
| `@api-profiler/express` | The middleware. This is what you install. |
| `api-profiler` | Terminal client: live table, `run GET /users/:id`. |
| **API Performance Profiler** (VS Code) | `🟢 84ms` at the end of each route line, `▶ Load test` above it. |
| `@api-profiler/core`, `@api-profiler/node` | Internal: types, store, recorder, load runner, local channel. |
| `@api-profiler/nestjs` | The NestJS interceptor. |

## Install

For Express:
```bash
npm install @api-profiler/express
```

For NestJS:
```bash
npm install @api-profiler/nestjs
```

## Usage

**Express:**
```js
const express = require('express');
const { profiler } = require('@api-profiler/express');

const app = express();
const p = profiler();
app.use(p);

app.listen(3000);
```

**NestJS:**
```ts
import { ProfilerInterceptor } from '@api-profiler/nestjs';

const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(new ProfilerInterceptor());

await app.listen(3000);
```

## The VS Code Extension (Recommended)

While the CLI and programmatic APIs are available, the **API Performance Profiler VS Code Extension** is the magic that brings these metrics directly into your editor. No terminal commands required!

1. **Install the extension** from the VS Code Marketplace: Search for "API Performance Profiler" (by Nahid).
2. Start your Node.js server (Express or NestJS) with the profiler middleware/interceptor attached.
3. Open a file containing your routes in VS Code.

The extension connects to your app automatically and provides:
- **Inline Latency:** See live metrics like `🟢 84.0ms` directly next to your route definitions (`app.get('/users')` or `@Get('users')`).
- **One-click Load Testing:** Click the `▶ Load test` CodeLens above any route to instantly replay it 1000 times in the background with the exact same body and headers it just received.
- **Routes Sidebar:** A dedicated view in your Activity Bar showing all observed routes in real-time, sorted slowest-first.

## Programmatic Load Testing (Advanced)

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

## CLI (Alternative to VS Code)

With the app running, open another terminal:

```bash
npx api-profiler                        # live table, refreshed every second
npx api-profiler run GET /users/:id     # replay the recorded request under load
npx api-profiler routes                 # routes seen so far and whether each has a recording
npx api-profiler stats                  # per-route figures for the last window
npx api-profiler load-results           # results of past load runs
npx api-profiler stats --json           # raw JSON
npx api-profiler --port 4790 …          # if you changed the channel port
```

```
api-profiler · app http://127.0.0.1:4780 · v0.1.0 · 14:32:10

Observed traffic
    route            count  avg      max      errors  req/s  when
🟢  GET /users/:id   12     1.7ms    8.9ms    0%      2.4    live
🟡  GET /slow        3      202.1ms  202.5ms  0%      --     40s ago

Load tests
🟢  GET /users/:id   10694  0.1ms    1.3ms    0%      3553   load · 2 min ago
```

🟢 below 200ms average, 🟡 below 500ms, 🔴 from there (`--fast`, `--warn` to
change). A route that stops receiving requests keeps its last figures, dimmed,
with their age — a stale number is never shown as current. The CLI has no
dependencies of its own; it only talks to the local channel below.

## Local channel

In development the profiler also opens a small JSON server on
`http://127.0.0.1:4780` (loopback only) so other local tools — the CLI, later
the VS Code extension — can read what it has measured:

```
GET  /health   GET  /stats   GET  /recordings (masked)   GET  /load-results
POST /load-runs   { "method": "GET", "route": "/users/:id" }
```

```js
profiler({ channel: { port: 4790 } });   // another port
profiler({ channel: false });            // no channel
p.channelUrl;                            // 'http://127.0.0.1:4780', or null
```

It never opens in production or under `NODE_ENV=test` unless you ask for it,
and if the port is busy it logs one warning and carries on without it.

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

## Performance (Overhead)

We designed this profiler to be as lightweight as possible. In synthetic benchmarks using `autocannon` (100 concurrent connections on a trivial Express JSON endpoint), the profiler adds less than **7ms** of median latency (p50).

- **Without Profiler:** ~13ms p50 latency, ~6000 requests/sec
- **With Profiler:** ~20ms p50 latency, ~3500 requests/sec

It is extremely fast for local development, and entirely disabled automatically in `NODE_ENV=production`.

## License

AGPL-3.0-only. Free to use, modify and self-host; if you offer a modified
version as a network service, you must publish its source under the same
license. Copyright (c) 2026 Nahid.
