You are a senior backend performance engineer, Node.js developer, VS Code extension developer, and open-source maintainer.

I want you to build an open-source developer tool called **API Performance Profiler**.

Its purpose is to help backend developers understand the performance of their API routes directly inside VS Code.

## 1. Product Vision

A developer runs their backend locally.

The profiler instruments the application and collects performance information for API requests.

The VS Code extension displays performance information next to the relevant route/controller.

Example:

```ts
@Get('/users')
async getUsers() {
  return this.userService.getUsers();
}
```

VS Code should display something conceptually like:

```text
@Get('/users')          🟢 84ms
```

For a slower route:

```text
@Get('/orders')         🔴 1.82s
```

Another possible display:

```text
@Get('/products')       🟡 430ms | 87 req/s
```

The exact UI should use VS Code's native decoration APIs and should not make the editor visually noisy.

## 2. Important Distinction

Track separate performance metrics:

### Latency

```text
Average
P50
P95
P99
Maximum
```

### Throughput

```text
requests per second
```

### Reliability

```text
request count
error count
error rate
```

Never confuse:

```text
84ms latency
```

with:

```text
118 requests/second
```

They are different metrics.

## 3. V1 Technology Scope

Initially support:

- Node.js
- TypeScript
- Express
- NestJS
- Fastify

Do NOT support Python, Go, Java, etc. in V1.

Design the instrumentation architecture so other runtimes can be added later.

## 4. Architecture

Use two main components:

```text
api-profiler
     +
api-profiler-vscode
```

### Backend package

An npm package responsible for instrumentation.

Example:

```ts
import { profiler } from "api-profiler";

app.use(profiler());
```

For NestJS, provide an appropriate integration such as middleware/interceptor.

The package measures:

```text
request start
     ↓
route/controller
     ↓
service/business logic
     ↓
database/external calls where possible
     ↓
response
     ↓
request end
```

## 5. No Cloud in V1

The system must work locally.

Do NOT require:

- AWS
- DigitalOcean
- database
- external server
- SaaS account
- API key

for the basic experience.

Architecture:

```text
Local backend
     ↓
Profiler
     ↓
Local telemetry channel
     ↓
VS Code extension
```

Possible local communication mechanisms:

- localhost HTTP
- WebSocket
- Unix socket where appropriate

Choose the simplest reliable solution.

## 6. Telemetry

For each request collect something similar to:

```ts
interface RouteMetric {
  method: string;
  route: string;

  timestamp: number;

  durationMs: number;

  statusCode: number;

  success: boolean;
}
```

Aggregate metrics over a configurable rolling window.

Example:

```text
GET /users

Requests: 1,248
Average: 84ms
P50: 71ms
P95: 142ms
P99: 231ms
RPS: 118
Errors: 0.2%
```

## 7. Throughput Calculation

Do not display misleading RPS values.

Calculate:

```text
RPS = completed requests / measurement window in seconds
```

Use a meaningful rolling window.

If there is insufficient traffic, display:

```text
RPS: --
```

instead of pretending that a small sample is statistically meaningful.

## 8. Route Identification

The system must identify actual route templates.

For example:

```text
/users/123
/users/456
/users/789
```

should become:

```text
GET /users/:id
```

when the framework provides route metadata.

Do NOT create thousands of separate route entries for dynamic IDs.

## 9. Source Code Mapping

The major feature is mapping runtime routes back to source code.

For example:

Runtime:

```text
GET /users
```

should map to something like:

```text
src/users/users.controller.ts:24
```

The VS Code extension can then place a decoration near the relevant controller method.

For NestJS:

```ts
@Get('/users')
```

should ideally map to:

```text
users.controller.ts
```

For Express:

```ts
router.get("/users", getUsers);
```

map to the appropriate source location where reliably possible.

Do NOT use fragile regex-only mapping if the AST can provide a more reliable solution.

Use AST/source analysis where appropriate.

## 10. VS Code UI

Use VS Code native APIs.

Potential features:

### Inline decoration

```text
@Get('/users')   🟢 84ms
```

### Status levels

```text
🟢 Fast
🟡 Moderate
🔴 Slow
```

Thresholds must be configurable.

Example:

```json
{
  "apiProfiler.thresholds": {
    "fast": 200,
    "warning": 500,
    "slow": 1000
  }
}
```

## 11. Hover Information

When the developer hovers over the performance indicator:

```text
GET /users

Performance
──────────────

Average       84ms
P50           71ms
P95           142ms
P99           231ms

Requests      1,248
Throughput    118 req/s

Errors        0.2%
Last request  3 seconds ago
```

If no traffic has been recorded:

```text
No runtime data yet.

Send requests to:
GET /users

The profiler will collect performance metrics automatically.
```

## 12. Slow Route Diagnosis

V1 should focus primarily on latency.

If feasible, provide basic breakdowns:

```text
GET /orders

Total: 1.82s

Application: 320ms
Database: 1.31s
External HTTP: 190ms
```

However, do NOT pretend to know database/external API time unless the profiler actually measures those operations.

This is critical.

If database instrumentation is not enabled:

```text
Database: Not instrumented
```

rather than inventing a value.

## 13. Database Instrumentation

After basic HTTP profiling works, support optional instrumentation for:

- Prisma
- PostgreSQL
- MySQL

Example:

```text
GET /orders — 1.82s

Database
────────────
Queries: 43
Total DB time: 1.31s

⚠ Possible N+1 pattern
```

Do not claim N+1 unless there is evidence.

A future version can provide query-level diagnostics.

## 14. External HTTP Instrumentation

Eventually support:

```text
fetch
axios
undici
```

Example:

```text
GET /payment

Total: 940ms

External HTTP
──────────────
stripe.com       720ms
internal API     91ms
application      129ms
```

Again, only show measured data.

## 15. CLI

Provide a CLI for developers who do not use VS Code.

Example:

```bash
npx api-profiler
```

Potential output:

```text
⚡ API Performance Profiler

Active application detected.

Routes
────────────────────────────────────

GET  /users       🟢 84ms    118 req/s
GET  /products    🟡 430ms    52 req/s
GET  /orders      🔴 1.82s    11 req/s

Slowest route:
GET /orders

P95: 2.14s
```

Also support:

```bash
api-profiler routes
api-profiler stats
api-profiler --json
```

## 16. Framework Integration

### Express

Provide middleware:

```ts
app.use(profiler());
```

### NestJS

Provide an official integration.

Prefer:

```ts
app.use(profiler());
```

or a Nest-compatible module/interceptor depending on the architecture.

Make setup simple.

Target experience:

```text
Install
↓
Add one integration
↓
Start server
↓
Open VS Code
↓
Metrics appear
```

## 17. VS Code Extension

Create a proper VS Code extension.

Features:

- detect running profiler
- connect to local profiler
- route decorations
- hover metrics
- refresh metrics
- enable/disable decorations
- configurable thresholds
- clear metrics
- show all routes
- sort routes by latency
- show errors

Commands:

```text
API Profiler: Start
API Profiler: Stop
API Profiler: Clear Metrics
API Profiler: Show Routes
API Profiler: Toggle Decorations
```

## 18. Privacy

Everything should be local by default.

Never send source code or telemetry to a remote server in V1.

No account.

No API key.

No cloud dependency.

## 19. Performance

The profiler itself must have very low overhead.

Do not perform expensive work synchronously for every request.

Avoid:

- excessive file scanning
- synchronous blocking operations
- huge in-memory logs
- unbounded metric storage

Use bounded rolling buffers.

Make instrumentation overhead measurable.

Add a benchmark showing profiler overhead.

## 20. Monorepo

Use a monorepo:

```text
api-performance-profiler/
├── packages/
│   ├── core/
│   ├── node/
│   ├── express/
│   ├── nestjs/
│   └── vscode-extension/
├── examples/
│   ├── express/
│   └── nestjs/
├── tests/
├── docs/
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

You may modify the structure if you have a better design.

## 21. Testing

Create tests for:

- request timing
- route detection
- dynamic route normalization
- metrics aggregation
- P50/P95/P99
- RPS calculation
- error rate
- rolling windows
- Express integration
- NestJS integration
- local communication
- VS Code route mapping
- threshold classification

Create example applications for manual testing.

## 22. V1 Roadmap

### Phase 1

Build:

```text
Core metrics engine
Node instrumentation
Express middleware
```

Support:

- latency
- status
- errors
- request count
- RPS

### Phase 2

Add:

```text
NestJS integration
Route normalization
rolling windows
P50/P95/P99
CLI
```

### Phase 3

Build:

```text
VS Code extension
inline decorations
hover metrics
configuration
```

### Phase 4

Add:

```text
Prisma instrumentation
PostgreSQL instrumentation
external HTTP timing
```

### Phase 5

Polish:

```text
documentation
examples
benchmarks
tests
npm packages
VS Code Marketplace preparation
GitHub README
```

## 23. Future Features

Do not implement these in V1, but design for them:

- flame graphs
- request traces
- database query analysis
- N+1 detection
- memory usage
- CPU profiling
- event-loop lag
- WebSocket performance
- Redis performance
- production remote agents
- team dashboard
- historical metrics
- cloud SaaS
- CI performance regression detection
- GitHub PR comments

## 24. Important UX Principle

The extension must remain lightweight.

Do NOT fill the editor with huge amounts of information.

Default experience should be:

```text
@Get('/users')        🟢 84ms
@Get('/orders')       🔴 1.82s
```

Everything else should be available through hover/click.

## 25. Development Rules

Do NOT attempt to implement everything in one pass.

First inspect the architecture and explain the implementation plan.

Then implement Phase 1.

After each phase:

- run tests
- run TypeScript type checking
- build all packages
- run example applications
- verify actual metrics
- verify no obvious memory leaks
- verify profiler overhead

Do not fabricate runtime metrics.

Only display metrics that were actually measured.

The core product must work completely locally.

Keep the project MIT licensed and production-quality.
