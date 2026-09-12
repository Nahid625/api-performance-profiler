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
const profiler = require('@api-profiler/express');

const app = express();
app.use(profiler());

app.listen(3000);
```

## License

MIT
