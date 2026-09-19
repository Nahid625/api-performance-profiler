import type { RouteLocation } from './discover';
import type { Panel, Row } from './rows';

export interface InlineItem {
  line: number;
  text: string;
  hover: string;
  stale: boolean;
}

type Find = (method: string, route: string) => RouteLocation | undefined;

// Groups the panel's rows by source file. Observed traffic wins the line; a load run joins the hover.
export function buildInline(panel: Panel, find: Find): Map<string, InlineItem[]> {
  const byFile = new Map<string, InlineItem[]>();
  if (panel.kind !== 'sections') {
    return byFile;
  }
  const placed = new Map<string, InlineItem>();
  for (const section of panel.sections) {
    for (const row of section.rows) {
      const location = find(row.method, row.route);
      if (!location) {
        continue;
      }
      const file = normalize(location.file);
      const key = `${file}:${location.line}`;
      const existing = placed.get(key);
      if (existing) {
        existing.hover += `\n\n---\n\n${hoverFor(row, location)}`;
        continue;
      }
      const item = { line: location.line, text: row.inline, hover: hoverFor(row, location), stale: row.stale };
      placed.set(key, item);
      const items = byFile.get(file) ?? [];
      items.push(item);
      byFile.set(file, items);
    }
  }
  return byFile;
}

// Before setup, every route line points at the two setup actions instead of a figure.
export function buildSetupInline(locations: RouteLocation[]): Map<string, InlineItem[]> {
  const byFile = new Map<string, InlineItem[]>();
  const hover = 'API Profiler is not installed in this workspace.\n\n[Install @api-profiler/express](command:apiProfiler.install) · [Add app.use(profiler())](command:apiProfiler.addMiddleware)';
  const seen = new Set<string>();
  for (const location of locations) {
    const file = normalize(location.file);
    const key = `${file}:${location.line}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const items = byFile.get(file) ?? [];
    items.push({ line: location.line, text: '⚠ profiler not installed', hover, stale: true });
    byFile.set(file, items);
  }
  return byFile;
}

export function normalize(file: string): string {
  return file.replace(/\\/g, '/');
}

function hoverFor(row: Row, location: RouteLocation): string {
  return location.prefixKnown ? row.tooltip : `${row.tooltip}\n\nMount prefix unknown, matched by path tail.`;
}
