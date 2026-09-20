# API Performance Profiler

See how fast your API routes actually are, next to where they are written.
Measured on real requests, never guessed.

```
17  app.get('/users/:id', (req, res) => {      🟢 1.8ms · live
21  app.get('/slow', async (req, res) => {     🟡 202.0ms · 3 min ago
30  app.post('/login', (req, res) => {         🟢 28.2ms · live
```

**The core idea: hit the route once, we replay it a thousand times.** The
profiler runs inside your app as middleware, so it sees the real request: the
working token, the path param that exists, the body the route accepts. It
records that request in memory and can replay it under load from a `▶ Load
test` lens above the route.

## Setup

1. In your Express (or NestJS-on-Express) app:

   ```bash
   npm install @api-profiler/express
   ```

   ```js
   const { profiler } = require('@api-profiler/express');
   app.use(profiler());   // before your routes
   ```

   Not installed yet? When the extension finds routes in a workspace without
   the profiler it asks once, and offers **Install** and **Add
   app.use(profiler())** (with a diff preview) — also in its sidebar and on
   every route line.

2. Start the app and send it a few requests.

3. Open the **API Profiler** view in the activity bar. Figures appear at the
   end of each route line and in the sidebar within a second.

## What you get

- **Inline latency** after every route line: `🟢 84.0ms · live`. A route that
  goes quiet keeps its last figure, dimmed, with its age. Hover for average,
  max, count, error rate and requests per second.
- **Routes sidebar**: all routes, slowest first; click one to jump to its line.
  Load-test results in their own section, never mixed with observed traffic.
- **▶ Load test** above each route that has a recording. One click replays
  the recorded request (10 connections × 5 s by default) and shows the
  route's server-side figures for the run.
- **Status bar**: connected, app not running, or setup needed.

Express routes are found through `app.METHOD`, routers, `app.use('/prefix',
router)` across files and `route()` chains; NestJS through `@Controller` +
`@Get` and `setGlobalPrefix`. When a mount prefix cannot be resolved the
route is matched by its tail and the hover says so.

## Rules that never bend

- A number that was not measured is never shown. Fewer than 10 samples →
  req/s is `--`; no recording → "send a request first".
- Latency and throughput are never mixed up, and every figure says which mode
  produced it: observed traffic or generated load.
- Load tests are off in production, localhost only, `GET` only unless a route
  is listed in `profiler({ allowLoadOn: ['POST /search'] })`.
- Recorded requests hold live credentials. They stay in your app's memory,
  are masked before the extension ever sees them, and nothing leaves your
  machine. There is no account, no telemetry, no server.

## Settings

| Setting | Default | |
|---|---|---|
| `apiProfiler.port` | `4780` | Port of the local channel the app opens |
| `apiProfiler.decorations` | `true` | Show latency at the end of route lines |
| `apiProfiler.thresholds.fast` | `200` | 🟢 below this average (ms) |
| `apiProfiler.thresholds.warn` | `500` | 🟡 below this, 🔴 from here (ms) |
| `apiProfiler.load.connections` | `10` | Concurrent connections for a load test |
| `apiProfiler.load.duration` | `5` | Seconds a load test runs |

## Also in the terminal

`npx api-profiler` gives the same live table without VS Code.

## Licence

AGPL-3.0-only. Source, issues and roadmap:
https://github.com/Nahid625/api-performance-profiler
