# Release Notes: API Performance Profiler v1.0.0 🚀

We are incredibly excited to announce the `1.0.0` stable release of **API Performance Profiler**!

This tool was built to solve a simple problem: backend developers often fly blind when building APIs locally. You write a route, but you don't really know how fast it runs until you leave your editor, set up Postman, or configure a heavy APM tool.

With v1.0.0, performance testing feels native and frictionless.

## Highlights in v1.0.0

- **VS Code Integration:** No more context switching. See real-time execution speeds (e.g., `🟢 84ms`) rendered right beside your route definitions in the code.
- **1-Click Load Testing:** A `▶ Load test` CodeLens sits directly above your route. Click it to instantly replay the last recorded request 1000 times under heavy load.
- **Express & NestJS Support:** Native middleware for Express and a global Interceptor for NestJS.
- **100% Local & Secure:** Everything is stored in local memory. No cloud accounts, no external dashboards, and no bloated dependencies.
- **Minimal Overhead:** In synthetic benchmarks, the profiler adds less than ~7ms of median latency under heavy load. It automatically turns off in `NODE_ENV=production`.

## Getting Started

Visit the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nahid625.api-profiler-vscode) to install the extension, or check out the [GitHub README](https://github.com/Nahid625/api-performance-profiler) for CLI usage.

Thank you to everyone who contributed to this milestone!
