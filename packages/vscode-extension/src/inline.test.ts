import type { RouteLocation } from './discover';
import { buildInline, buildSetupInline } from './inline';
import type { Panel, Row } from './rows';

function row(overrides: Partial<Row>): Row {
  return {
    key: 'GET /users/:id',
    method: 'GET',
    route: '/users/:id',
    label: '🟢 GET /users/:id',
    description: '4.0ms · 12 req · -- req/s · live',
    tooltip: '**GET /users/:id** — observed traffic, live',
    inline: '🟢 4.0ms · live',
    stale: false,
    averageMs: 4,
    ...overrides,
  };
}

const at = (file: string, line: number, prefixKnown = true): RouteLocation => ({ method: 'GET', route: '/users/:id', file, line, prefixKnown });

function panel(observed: Row[], load: Row[] = []): Panel {
  const sections = [{ title: 'Observed traffic', rows: observed }];
  if (load.length) {
    sections.push({ title: 'Load tests', rows: load });
  }
  return { kind: 'sections', sections };
}

describe('buildInline', () => {
  it('shows nothing when the panel has only a message', () => {
    expect(buildInline({ kind: 'message', text: 'No requests yet' }, () => at('a.js', 1)).size).toBe(0);
  });

  it('places each row on its route line, grouped by file', () => {
    const find = (_m: string, route: string) => (route === '/users/:id' ? at('/w/app.js', 17) : at('/w/routes/orders.js', 3));
    const items = buildInline(panel([row({}), row({ route: '/orders', inline: '🔴 900.0ms · live' })]), find);
    expect([...items.keys()]).toEqual(['/w/app.js', '/w/routes/orders.js']);
    expect(items.get('/w/app.js')).toEqual([{ line: 17, text: '🟢 4.0ms · live', hover: '**GET /users/:id** — observed traffic, live', stale: false }]);
    expect(items.get('/w/routes/orders.js')?.[0]).toMatchObject({ line: 3, text: '🔴 900.0ms · live' });
  });

  it('skips rows whose source was not found', () => {
    expect(buildInline(panel([row({})]), () => undefined).size).toBe(0);
  });

  it('keeps observed text on the line and adds the load run to the hover', () => {
    const load = row({ key: 'load GET /users/:id', inline: '🟡 300.0ms · load · 2 min ago', tooltip: '**GET /users/:id** — load test' });
    const [item] = buildInline(panel([row({})], [load]), () => at('a.js', 5)) .get('a.js') ?? [];
    expect(item.text).toBe('🟢 4.0ms · live');
    expect(item.hover).toContain('observed traffic');
    expect(item.hover).toContain('---');
    expect(item.hover).toContain('load test');
  });

  it('uses the load run alone when nothing was observed', () => {
    const load = row({ key: 'load GET /users/:id', inline: '🟡 300.0ms · load · 2 min ago' });
    const [item] = buildInline(panel([], [load]), () => at('a.js', 5)).get('a.js') ?? [];
    expect(item.text).toBe('🟡 300.0ms · load · 2 min ago');
  });

  it('carries stale through and notes an unknown prefix in the hover', () => {
    const [item] = buildInline(panel([row({ stale: true, inline: '🟢 4.0ms · 40s ago' })]), () => at('a.js', 5, false)).get('a.js') ?? [];
    expect(item.stale).toBe(true);
    expect(item.hover).toContain('Mount prefix unknown');
  });

  it('normalises Windows paths so editors match', () => {
    const items = buildInline(panel([row({})]), () => at('C:\\w\\app.js', 2));
    expect([...items.keys()]).toEqual(['C:/w/app.js']);
  });
});

describe('buildSetupInline', () => {
  it('marks every route line once with the setup actions in the hover', () => {
    const items = buildSetupInline([at('/w/app.js', 3), at('/w/app.js', 3), { ...at('/w/app.js', 9), method: 'POST' }, at('C:\\w\\r.js', 1)], 'package');
    expect([...items.keys()]).toEqual(['/w/app.js', 'C:/w/r.js']);
    expect(items.get('/w/app.js')?.map((i) => i.line)).toEqual([3, 9]);
    const [item] = items.get('/w/app.js') ?? [];
    expect(item.text).toBe('⚠ profiler not installed');
    expect(item.text).not.toMatch(/\d/);
    expect(item.hover).toContain('command:apiProfiler.install');
    expect(item.hover).toContain('command:apiProfiler.addMiddleware');
    expect(item.stale).toBe(true);
  });

  it('asks only for the app.use line once the package is installed', () => {
    const [item] = buildSetupInline([at('/w/app.js', 3)], 'middleware').get('/w/app.js') ?? [];
    expect(item.text).toBe('⚠ add app.use(profiler())');
    expect(item.hover).toContain('command:apiProfiler.addMiddleware');
    expect(item.hover).not.toContain('command:apiProfiler.install');
  });
});
