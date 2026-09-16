# API Performance Profiler

You are a senior backend performance engineer, Node.js developer, VS Code
extension developer, and open-source maintainer working on this project.

An open-source, local-first tool that tells backend developers how fast their
API routes actually are — measured, never guessed. It sits inside the
application as middleware, so it sees real requests: the working auth token, a
path param that exists in the database, a body the route accepts.

**The core idea: hit the route once, we replay it a thousand times.**

## Read these before planning work

- `docs/PROJECT.md` — the specification and phase roadmap. The authority on
  scope and sequencing.
- `docs/WORKING_STYLE.md` — how work is delivered here.
- `docs/checklist.md` — the current batch, reviewed before code starts.

## Rules that never bend

1. **Never display a number that was not measured.** Not enough traffic for
   RPS → `--`. No recorded request → "not recorded yet". Database not
   instrumented → say so. A profiler that guesses is not a profiler.
2. **Never conflate latency with throughput.** `84ms` and `118 req/s` are
   different metrics. Every figure also states which mode produced it —
   observed traffic or generated load.
3. **`@api-profiler/core` has zero runtime dependencies** and knows nothing
   about HTTP, frameworks or VS Code. Dependency direction never reverses:
   `express`/`nestjs`/`node` → `core`, never back.
4. **Load generation is off by default**, never runs in production, `GET` only
   unless a route is explicitly opted in, localhost targets only. Replaying a
   `POST` writes real data.
5. **Recorded requests hold live credentials.** Memory only, never written to
   disk, never sent anywhere, masked in any UI. In production the recorder is
   disabled entirely — nothing captured, nothing to leak.
6. **Production binds to `127.0.0.1` only**, never `0.0.0.0`. The dashboard is
   reached through an SSH tunnel. We ship no login, no session cookies, no
   public port — access control is SSH, which the server owner already manages.
7. **Bounded storage only.** This runs inside someone else's application.

## How to work here

- **Explain the unit in Bangla before writing any of its code** — what gets
  built, which decisions it settles — and wait for Nahid's go-ahead.
- One unit at a time. Build it, verify it, then **stop** — do not continue to
  the next item in the batch.
- **One branch per unit**, named `phase-<n>-unit-<n>` (e.g. `phase-1-unit-1`),
  branched from `main`. Once merged, delete it on GitHub and locally — only
  `main` and the current unit's branch should exist.
- Verify in this order: eslint → jest → build. Then run the example app and
  confirm the metrics are real.
- **Never push.** No `git push`, no `gh repo create`, no `gh pr create`. Print
  the command and let Nahid run it. He pushes, opens the PR, and merges.
- Minimal comments — one line only where something genuinely needs explaining.
  Heavy commenting makes commit diffs noisy.
- Deliberate over fast. The goal is avoiding a later fix pass, not speed.
- Reply to Nahid in Bangla; keep code, comments and commit messages in English.

## Current state

Phase 1 complete: `core` (types, rolling window store, aggregation), `node`
(request timer), `express` (middleware), `examples/express` (runnable app,
`npm run demo -w example-express` checks its own figures).

Phase 2 (request recorder) complete: `node` has the recorder, display masking
and the `Profiler` wiring; `express` captures url, headers and body from `req`
and re-exports `maskRecording`; the example app shows masked recordings and
checks them.

Phase 3 (load runner) complete: `node` has `checkLoadRun` (the safety gate),
`LoadRunner` (autocannon-backed replay tagged `x-api-profiler-load: 1`) and
`Profiler.runLoad()` (gate → replay → frozen per-route snapshot counting the
whole run); `express` tags load traffic, takes `allowLoadOn` and exposes
`p.loadTest()` / `p.loadResults()`; the example app runs and checks a real
load test (`npm run demo`) and offers `npm run load -- GET /users/42`.

Phase 4 (CLI) in progress: `node` has `LocalChannel`, a read-only JSON server
bound to `127.0.0.1` (default port 4780) serving `/health`, `/stats`,
`/recordings` (masked only), `/load-results` and `POST /load-runs`. `Profiler`
opens it automatically in development (`channel` option, `channelUrl`,
`ready`, `close()`), recordings carry the `origin` they arrived on so a run
needs no target, and Express passes it all through. `packages/cli` (npm name
`api-profiler`, zero dependencies) has `routes`, `stats`, `load-results`,
`--json`, `--port`. Next: `run` and the live table. `nestjs` and
`vscode-extension` are still empty.
