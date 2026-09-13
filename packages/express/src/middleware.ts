import type { Request, RequestHandler } from 'express';
import { MetricStoreOptions, RouteStats, UNMATCHED_ROUTE } from '@api-profiler/core';
import { Profiler } from '@api-profiler/node';

export interface ProfilerMiddleware extends RequestHandler {
  stats(): RouteStats[];
}

export function profiler(options: MetricStoreOptions = {}): ProfilerMiddleware {
  const instance = new Profiler(options);

  const middleware: RequestHandler = (req, res, next) => {
    const done = instance.start();
    const routeOf = trackRoute(req);
    // Aborted requests never emit 'finish', so they are deliberately not counted.
    res.once('finish', () => {
      done({ method: req.method, route: routeOf(), statusCode: res.statusCode });
    });
    next();
  };

  return Object.assign(middleware, { stats: () => instance.stats() });
}

// Express clears req.baseUrl while unwinding an error, so snapshot it when the route is matched.
function trackRoute(req: Request): () => string {
  let route: { path?: unknown } | undefined;
  let mountPath = '';

  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get: () => route,
    set: (value) => {
      route = value;
      mountPath = req.baseUrl ?? '';
    },
  });

  return () => (route?.path === undefined ? UNMATCHED_ROUTE : mountPath + String(route.path));
}
