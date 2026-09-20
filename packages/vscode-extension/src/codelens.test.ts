import { buildLenses } from './codelens';
import type { ConnectionState } from './connection';
import type { RouteLocation } from './discover';

const at = (method: string, route: string, line: number): RouteLocation => ({ method, route, file: 'app.js', line, prefixKnown: true });

function connected(recorded: string[]): ConnectionState {
  return { kind: 'connected', url: 'http://127.0.0.1:4780', version: '0.0.0', stats: [], loadResults: [], recorded };
}

describe('buildLenses', () => {
  const locations = [at('GET', '/users/:id', 17), at('POST', '/login', 30), at('ALL', '/health', 40)];

  it('offers nothing unless the app is connected', () => {
    expect(buildLenses(locations, { kind: 'unreachable', url: 'x' }, null)).toEqual([]);
    expect(buildLenses(locations, { kind: 'setup-needed', missing: 'package' }, null)).toEqual([]);
  });

  it('offers a run only for routes with a recording, and explains the rest', () => {
    const lenses = buildLenses(locations, connected(['GET /users/:id']), null);
    expect(lenses).toEqual([
      { line: 17, title: '$(play) Load test', command: { id: 'apiProfiler.loadTest', method: 'GET', route: '/users/:id' } },
      { line: 30, title: 'Load test (send a request first)', command: { id: 'apiProfiler.explainLoadTest', method: 'POST', route: '/login' } },
      { line: 40, title: 'Load test (needs a single method)' },
    ]);
  });

  it('still offers a POST once it is recorded; the app decides whether to allow it', () => {
    const [, login] = buildLenses(locations, connected(['POST /login']), null);
    expect(login.command?.id).toBe('apiProfiler.loadTest');
  });

  it('shows progress on the running route and blocks the others meanwhile', () => {
    const lenses = buildLenses(locations, connected(['GET /users/:id', 'POST /login']), 'GET /users/:id');
    expect(lenses[0]).toEqual({ line: 17, title: '$(sync~spin) Load test running…' });
    expect(lenses[1]).toEqual({ line: 30, title: 'Load test (another run is in progress)' });
  });

  it('emits one lens per line even when two locations share it', () => {
    const lenses = buildLenses([at('GET', '/a', 3), at('GET', '/a', 3)], connected([]), null);
    expect(lenses).toHaveLength(1);
  });
});
