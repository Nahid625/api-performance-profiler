export type MetricMode = 'observed' | 'load';

export interface RouteMetric {
  method: string;
  route: string;
  timestamp: number;
  durationMs: number;
  statusCode: number;
  success: boolean;
  mode: MetricMode;
}

// One bucket for unmatched requests, so bot probes can't grow memory per URL.
export const UNMATCHED_ROUTE = '(unmatched)';

// Single source of truth, so success can never disagree with statusCode.
export function isSuccess(statusCode: number): boolean {
  return statusCode < 400;
}
