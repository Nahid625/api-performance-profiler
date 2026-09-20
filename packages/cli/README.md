# api-profiler

Terminal view of an app running `@api-profiler/express`: a live route table,
recordings, and load runs — no VS Code needed. Zero dependencies.

```bash
npm install @api-profiler/express   # in the app, then app.use(profiler())
npx api-profiler                    # in another terminal
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

## Commands

```
api-profiler                     live table, refreshed every second (Ctrl-C to stop)
api-profiler routes              routes seen by the app and whether each has a recording
api-profiler stats               per-route figures for the last window (observed and load)
api-profiler load-results        results of past load runs
api-profiler clear               forget all metrics, recordings and load results
api-profiler run GET /users/:id  replay the recorded request under load and report

--port <n>          channel port the app opened (default 4780)
--json              raw JSON instead of a table
--once              live mode: print one frame and exit
--fast <ms>         🟢 below this average (default 200)
--warn <ms>         🟡 below this average, 🔴 from here (default 500)
--connections <n>   run: concurrent connections (default 10)
--duration <s>      run: seconds (default 5)
--target <url>      run: override the recorded origin (localhost only)
```

`--` for requests per second means fewer than 10 samples: a number that was
not measured is never shown. A route that goes quiet keeps its last figures,
dimmed, with their age.

The CLI only talks to the app's local channel on `127.0.0.1`; it never opens
a port of its own and never sees a raw recording — the app masks them first.

## Licence

AGPL-3.0-only. Source and issues: https://github.com/Nahid625/api-performance-profiler
