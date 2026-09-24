# Contributing to API Performance Profiler

First of all, thank you for your interest! We'd love to accept your patches and contributions to this project.

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Nahid625/api-performance-profiler.git
   cd api-performance-profiler
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Verify tests:**
   ```bash
   npm run verify
   ```

## Workspaces

This is an npm workspaces monorepo:
- `packages/core` - Shared logic and store
- `packages/node` - Node environment specifics
- `packages/express` - Express middleware
- `packages/nestjs` - NestJS interceptor
- `packages/cli` - Terminal UI
- `packages/vscode-extension` - The VS Code extension

When making changes, please ensure that `npm run verify` runs without any linter errors or test failures.

## Adding Features
- If adding a new framework (like Fastify), create a new workspace in `packages/`.
- Ensure there are no heavy dependencies added to the `core` logic to maintain our lightweight promise.

Thank you!
