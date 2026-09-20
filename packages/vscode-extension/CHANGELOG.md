# Changelog

## 0.1.0

First release.

- Routes sidebar: every route the running app has seen, slowest first, with 🟢🟡🔴, average, count, req/s and age; load-test results in their own section.
- Inline latency at the end of each route line (`🟢 84.0ms · live`), dimmed with its age once the route goes quiet; full figures on hover.
- Route discovery for Express (`app.get`, routers, `app.use('/prefix', router)` across files, `route()` chains) and NestJS (`@Controller` + `@Get`, `setGlobalPrefix`).
- `▶ Load test` CodeLens above each route that has a recording: replays the recorded request under load and reports the route's own figures.
- Onboarding when `@api-profiler/express` is not installed: Install, and Add `app.use(profiler())` with a diff preview.
- Commands: Refresh, Clear Metrics, Show Routes, Show Status, Toggle Inline Latency, Load Test Route.
- Settings: `apiProfiler.port`, `apiProfiler.decorations`, `apiProfiler.thresholds.fast/warn`, `apiProfiler.load.connections/duration`.
