import type { Request, RequestHandler } from 'express';
import { MetricStoreOptions, RouteStats, UNMATCHED_ROUTE } from '@api-profiler/core';
import {
  CapturedRequest,
  LOAD_HEADER,
  LoadResult,
  Profiler,
  RecordedRequest,
} from '@api-profiler/node';

export interface ProfilerOptions extends MetricStoreOptions {
  allowLoadOn?: string[];
}

export interface LoadTestOptions {
  target: string;
  connections?: number;
  duration?: number;
}

export interface ProfilerMiddleware extends RequestHandler {
  stats(): RouteStats[];
  recordings(): RecordedRequest[];
  readonly isRecording: boolean;
  loadTest(method: string, route: string, options: LoadTestOptions): Promise<LoadResult>;
  loadResults(): LoadResult[];
  loadResult(method: string, route: string): LoadResult | undefined;
}

export function profiler(options: ProfilerOptions = {}): ProfilerMiddleware {
  const { allowLoadOn, ...storeOptions } = options;
  const instance = new Profiler(storeOptions);

  const middleware: RequestHandler = (req, res, next) => {
    const done = instance.start();
    const routeOf = trackRoute(req);
    const bodyOf = trackBody(req, instance.isRecording);
    // Aborted requests never emit 'finish', so they are deliberately not counted.
    res.once('finish', () => {
      done({
        method: req.method,
        route: routeOf(),
        statusCode: res.statusCode,
        mode: req.headers[LOAD_HEADER] === '1' ? 'load' : 'observed',
        request: capture(req, bodyOf()),
      });
    });
    next();
  };

  return Object.assign(middleware, {
    stats: () => instance.stats(),
    recordings: () => instance.recordings(),
    isRecording: instance.isRecording,
    loadTest: (method: string, route: string, run: LoadTestOptions) =>
      instance.runLoad({ method, route, ...run, allowLoadOn }),
    loadResults: () => instance.loadResults(),
    loadResult: (method: string, route: string) => instance.loadResult(method, route),
  });
}

function capture(req: Request, body: unknown): CapturedRequest {
  return {
    // originalUrl keeps the mount path and query that routers strip from req.url.
    url: req.originalUrl,
    headers: req.headers,
    body,
    bodyUnavailable: body === undefined && hasBody(req),
  };
}

function hasBody(req: Request): boolean {
  if (req.headers['transfer-encoding'] !== undefined) {
    return true;
  }
  const length = Number(req.headers['content-length']);
  return Number.isFinite(length) && length > 0;
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

// Snapshots the body the moment a parser sets it, before handlers can mutate or replace it.
function trackBody(req: Request, snapshot: boolean): () => unknown {
  let live: unknown = req.body;
  let parsed: unknown = snapshot ? copy(live) : live;
  let seen = live !== undefined;

  Object.defineProperty(req, 'body', {
    configurable: true,
    enumerable: true,
    get: () => live,
    set: (value) => {
      live = value;
      if (!seen && value !== undefined) {
        seen = true;
        parsed = snapshot ? copy(value) : value;
      }
    },
  });

  return () => parsed;
}

function copy(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
