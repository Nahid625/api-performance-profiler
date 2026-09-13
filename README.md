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

## Request recording and `NODE_ENV`

Locally, the profiler keeps the most recent successful request for each route
— including its auth headers — so it can be replayed later for load testing.
Recordings live in memory only and are masked wherever they are displayed.

Recording is on only when `NODE_ENV` is unset, `development` or `test`. Any
other value — `production`, `staging`, anything else — turns it off completely.

**Set `NODE_ENV=production` on your production servers.** If it is left unset
there, the profiler cannot tell it is running in production and will record
real users' requests in memory.

## License

MIT
