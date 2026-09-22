import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricStoreOptions, RouteStats, UNMATCHED_ROUTE } from '@api-profiler/core';
import {
  LOAD_HEADER,
  LoadResult,
  LocalChannelOptions,
  Profiler,
  RecordedRequest,
} from '@api-profiler/node';

export interface ProfilerOptions extends MetricStoreOptions {
  allowLoadOn?: string[];
  channel?: LocalChannelOptions | false;
}

export interface ProfilerInterceptorApi {
  stats(): RouteStats[];
  recordings(): RecordedRequest[];
  readonly isRecording: boolean;
  loadTest(method: string, route: string, options: unknown): Promise<LoadResult>;
  loadResults(): LoadResult[];
  loadResult(method: string, route: string): LoadResult | undefined;
  readonly channelUrl: string | null;
  readonly ready: Promise<string | null>;
  close(): Promise<void>;
}

@Injectable()
export class ProfilerInterceptor implements NestInterceptor, ProfilerInterceptorApi {
  private profiler: Profiler;

  constructor(options: ProfilerOptions = {}) {
    this.profiler = new Profiler(options);
  }

  // ProfilerInterceptorApi implementation
  stats(): RouteStats[] { return this.profiler.stats(); }
  recordings(): RecordedRequest[] { return this.profiler.recordings(); }
  get isRecording(): boolean { return this.profiler.isRecording; }
  loadTest(method: string, route: string, run: Record<string, unknown> = {}): Promise<LoadResult> { 
    return this.profiler.runLoad({ method, route, ...run }); 
  }
  loadResults(): LoadResult[] { return this.profiler.loadResults(); }
  loadResult(method: string, route: string): LoadResult | undefined { return this.profiler.loadResult(method, route); }
  get channelUrl(): string | null { return this.profiler.channelUrl; }
  get ready(): Promise<string | null> { return this.profiler.ready; }
  close(): Promise<void> { return this.profiler.close(); }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    
    // We start the timer here.
    const done = this.profiler.start();

    let routePath = UNMATCHED_ROUTE;
    if (req.route && req.route.path) {
      const baseUrl = req.baseUrl || '';
      routePath = baseUrl + String(req.route.path);
    } else {
      routePath = req.path || UNMATCHED_ROUTE; 
    }

    const method = req.method;
    const mode = req.headers?.[LOAD_HEADER.toLowerCase()] === '1' ? 'load' : 'observed';
    
    return next.handle().pipe(
      tap({
        next: () => {
          done({
            method,
            route: routePath,
            statusCode: res.statusCode || 200,
            mode,
            request: undefined
          });
        },
        error: (err: unknown) => {
          let statusCode = 500;
          if (err && typeof err === 'object') {
            if ('status' in err && typeof err.status === 'number') statusCode = err.status;
            else if ('statusCode' in err && typeof err.statusCode === 'number') statusCode = err.statusCode;
          }
          done({
            method,
            route: routePath,
            statusCode,
            mode,
            request: undefined
          });
        }
      })
    );
  }
}
