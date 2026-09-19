import type { ConnectionState } from './connection';
import type { RouteLocation } from './discover';

export interface Lens {
  line: number;
  title: string;
  // Absent when the lens is informational only.
  command?: { id: string; method: string; route: string };
}

// One lens per route line. It only offers a run the app can actually perform right now.
export function buildLenses(locations: RouteLocation[], state: ConnectionState, running: string | null): Lens[] {
  if (state.kind !== 'connected') {
    return [];
  }
  const recorded = new Set(state.recorded);
  const lenses: Lens[] = [];
  const seen = new Set<string>();
  for (const location of locations) {
    const key = `${location.method} ${location.route}`;
    if (seen.has(`${location.line} ${key}`)) {
      continue;
    }
    seen.add(`${location.line} ${key}`);
    if (running === key) {
      lenses.push({ line: location.line, title: '$(sync~spin) Load test running…' });
    } else if (running !== null) {
      lenses.push({ line: location.line, title: 'Load test (another run is in progress)' });
    } else if (location.method === 'ALL') {
      lenses.push({ line: location.line, title: 'Load test (needs a single method)' });
    } else if (!recorded.has(key)) {
      lenses.push({ line: location.line, title: 'Load test (send a request first)', command: explain(location) });
    } else {
      lenses.push({ line: location.line, title: '$(play) Load test', command: { id: 'apiProfiler.loadTest', ...pick(location) } });
    }
  }
  return lenses;
}

function explain(location: RouteLocation): Lens['command'] {
  return { id: 'apiProfiler.explainLoadTest', ...pick(location) };
}

function pick(location: RouteLocation): { method: string; route: string } {
  return { method: location.method, route: location.route };
}
