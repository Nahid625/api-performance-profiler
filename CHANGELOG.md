# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-09-27

### Added
- **VS Code Extension** (`api-profiler-vscode`):
  - Inline latency metrics rendered directly beside Express and NestJS routes.
  - "Load test" CodeLens above routes for 1-click background load testing.
  - Dedicated Activity Bar sidebar listing all observed routes, sorted by latency.
  - Setup wizard for 1-click middleware installation.
- **NestJS Support** (`@api-profiler/nestjs`):
  - Global `ProfilerInterceptor` for measuring execution times of NestJS controllers.
- **Express Support** (`@api-profiler/express`):
  - Zero-dependency middleware for Express applications.
- **CLI** (`api-profiler`):
  - Real-time terminal table for observed traffic.
  - Commands to trigger load tests and view historical load results.
- **Core Engine**:
  - In-memory request recording (headers, body, path).
  - Background load testing engine using recorded requests.
  - Local JSON channel (`http://127.0.0.1:4780`) for communication between the app and the tooling.
  - Safe production defaults (`NODE_ENV=production` disables recording).
