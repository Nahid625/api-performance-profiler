import { RecordedRequest } from './recorder';

export const MASK = '••••••';

const SENSITIVE_NAME = /auth|token|key|secret|passw|session|cookie|credential|signature/i;

const AUTH_SCHEMES = new Set(['basic', 'bearer', 'digest', 'dpop', 'hoba', 'mutual', 'negotiate', 'ntlm', 'token']);

export type BodySummary =
  | { kind: 'none' }
  | { kind: 'unavailable' }
  | { kind: 'captured'; contentType: string | null; bytes: number };

export interface MaskedRecording {
  method: string;
  route: string;
  url: string;
  origin: string;
  headers: Record<string, string>;
  body: BodySummary;
  recordedAt: number;
}

export function maskRecording(recording: RecordedRequest): MaskedRecording {
  return {
    method: recording.method,
    route: recording.route,
    url: maskUrl(recording.url, recording.route),
    origin: recording.origin,
    headers: maskHeaders(recording.headers),
    body: summarizeBody(recording),
    recordedAt: recording.recordedAt,
  };
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    masked[name] = maskHeaderValue(name.toLowerCase(), value);
  }
  return masked;
}

function maskHeaderValue(name: string, value: string): string {
  if (name === 'cookie') {
    return value
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => (pair.includes('=') ? `${pair.slice(0, pair.indexOf('='))}=${MASK}` : MASK))
      .join('; ');
  }
  if (name === 'authorization' || name === 'proxy-authorization') {
    // Only a known scheme stays visible; an unknown first word could be part of the secret.
    const scheme = /^(\S+)\s+\S/.exec(value)?.[1];
    return scheme && AUTH_SCHEMES.has(scheme.toLowerCase()) ? `${scheme} ${MASK}` : MASK;
  }
  return SENSITIVE_NAME.test(name) ? MASK : value;
}

function maskUrl(url: string, route: string): string {
  const queryStart = url.indexOf('?');
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  const query = queryStart === -1 ? null : url.slice(queryStart + 1);

  const maskedPath = maskPathParams(path, route);
  return query === null ? maskedPath : `${maskedPath}?${maskQuery(query)}`;
}

// Uses the route template to find params like /reset/:token in the real path.
function maskPathParams(path: string, route: string): string {
  const actual = path.split('/');
  const template = route.split('/');
  if (actual.length !== template.length) {
    return path;
  }
  return actual
    .map((segment, i) => {
      const param = /^:(\w+)/.exec(template[i]);
      return param && SENSITIVE_NAME.test(param[1]) ? MASK : segment;
    })
    .join('/');
}

function maskQuery(query: string): string {
  return query
    .split('&')
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) {
        return part;
      }
      const rawKey = part.slice(0, eq);
      return SENSITIVE_NAME.test(safeDecode(rawKey)) ? `${rawKey}=${MASK}` : part;
    })
    .join('&');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function summarizeBody(recording: RecordedRequest): BodySummary {
  if (recording.bodyUnavailable) {
    return { kind: 'unavailable' };
  }
  if (recording.body === undefined) {
    return { kind: 'none' };
  }
  return {
    kind: 'captured',
    contentType: recording.headers['content-type'] ?? null,
    bytes: byteSize(recording.body),
  };
}

function byteSize(body: unknown): number {
  if (typeof body === 'string') {
    return Buffer.byteLength(body);
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }
  try {
    return Buffer.byteLength(JSON.stringify(body) ?? '');
  } catch {
    return 0;
  }
}
