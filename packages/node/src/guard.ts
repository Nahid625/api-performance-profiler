import { RecordedRequest } from './recorder';
import { recordingAllowed } from './profiler';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export interface LoadRunRequest {
  method: string;
  route: string;
  target: string;
  recording: RecordedRequest | undefined;
  allowLoadOn?: string[];
  env?: string | undefined;
}

export type LoadRunCheck = { ok: true } | { ok: false; reason: string };

// Every rule here runs before a single request is generated. Order matters:
// production first, so it is never hidden behind a "no recording" answer.
export function checkLoadRun(run: LoadRunRequest): LoadRunCheck {
  if (!recordingAllowed(run.env)) {
    return refuse(`load runs are disabled when NODE_ENV is ${JSON.stringify(run.env)}`);
  }

  const label = `${run.method} ${run.route}`;
  if (!run.recording) {
    return refuse(`${label} has no recording yet — send one successful request first`);
  }

  if (run.method !== 'GET' && !(run.allowLoadOn ?? []).includes(label)) {
    return refuse(`${label} is not GET; add "${label}" to allowLoadOn to replay it`);
  }

  const url = parseHttpUrl(run.target);
  if (!url) {
    return refuse(`target must be a full http(s) URL, got ${JSON.stringify(run.target)}`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return refuse(`target must be localhost, got ${url.hostname}`);
  }

  return { ok: true };
}

// "localhost:3000" parses as scheme "localhost:", so the protocol has to be checked too.
function parseHttpUrl(target: string): URL | null {
  try {
    const url = new URL(target);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url : null;
  } catch {
    return null;
  }
}

function refuse(reason: string): LoadRunCheck {
  return { ok: false, reason };
}
