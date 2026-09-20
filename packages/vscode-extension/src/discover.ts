import * as path from 'node:path';
import ts from 'typescript';

export interface SourceFileInput {
  path: string;
  text: string;
}

export interface RouteLocation {
  method: string;
  route: string;
  file: string;
  line: number;
  // False when a mount prefix could not be resolved; `route` is then only the tail.
  prefixKnown: boolean;
}

const EXPRESS_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']);
const NEST_METHODS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);
const EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'];

interface Declared {
  method: string;
  path: string;
  receiver: string | null;
  line: number;
}

interface Mount {
  prefix: string | null;
  target: { kind: 'local'; receiver: string } | { kind: 'module'; spec: string };
  receiver: string | null;
}

interface FileFacts {
  file: string;
  routes: Declared[];
  mounts: Mount[];
  imports: Map<string, string>;
  exported: string | null;
  nest: Declared[];
  globalPrefix: string | null;
}

export function discoverRoutes(files: SourceFileInput[]): RouteLocation[] {
  const facts = new Map<string, FileFacts>();
  for (const file of files) {
    facts.set(normalize(file.path), analyze(normalize(file.path), file.text));
  }

  const globalPrefix = [...facts.values()].map((f) => f.globalPrefix).find((p) => p !== null) ?? null;
  const out: RouteLocation[] = [];

  for (const fact of facts.values()) {
    for (const route of fact.nest) {
      out.push({
        method: route.method,
        route: joinPath(globalPrefix ?? '', route.path),
        file: fact.file,
        line: route.line,
        prefixKnown: true,
      });
    }
    for (const route of fact.routes) {
      const prefixes = prefixesFor(fact, route.receiver, facts, 0);
      for (const prefix of prefixes) {
        out.push({
          method: route.method,
          route: prefix.known ? joinPath(prefix.value, route.path) : joinPath('', route.path),
          file: fact.file,
          line: route.line,
          prefixKnown: prefix.known,
        });
      }
    }
  }
  return dedupe(out);
}

// True when a file imports @api-profiler/express and passes profiler() to app.use.
export function usesProfiler(text: string): boolean {
  return text.includes('@api-profiler/express') && /\.use\(\s*profiler\(/.test(text);
}

export function matchRoute(
  locations: RouteLocation[],
  method: string,
  route: string,
): RouteLocation | undefined {
  const wanted = method.toUpperCase();
  const accepts = (l: RouteLocation) => l.method === wanted || l.method === 'ALL';
  return (
    locations.find((l) => accepts(l) && l.prefixKnown && l.route === route) ??
    locations.find((l) => accepts(l) && !l.prefixKnown && (route === l.route || route.endsWith(l.route)))
  );
}

interface Prefix {
  value: string;
  known: boolean;
}

// Follows app.use('/api', router) chains, including across files, to build each route's full path.
function prefixesFor(
  fact: FileFacts,
  receiver: string | null,
  all: Map<string, FileFacts>,
  depth: number,
): Prefix[] {
  if (depth > 5) {
    return [{ value: '', known: false }];
  }
  const mounts: { mount: Mount; owner: FileFacts }[] = [];
  for (const owner of all.values()) {
    for (const mount of owner.mounts) {
      if (mount.target.kind === 'local') {
        if (owner === fact && receiver !== null && mount.target.receiver === receiver) {
          mounts.push({ mount, owner });
        }
      } else if (fact.exported !== null && receiver === fact.exported) {
        const resolved = resolveModule(owner.file, mount.target.spec, all);
        if (resolved === fact.file) {
          mounts.push({ mount, owner });
        }
      }
    }
  }
  if (mounts.length === 0) {
    return [{ value: '', known: true }];
  }
  const result: Prefix[] = [];
  for (const { mount, owner } of mounts) {
    for (const outer of prefixesFor(owner, mount.receiver, all, depth + 1)) {
      if (mount.prefix === null || !outer.known) {
        result.push({ value: '', known: false });
      } else {
        result.push({ value: joinPath(outer.value, mount.prefix), known: true });
      }
    }
  }
  return result;
}

function analyze(file: string, text: string): FileFacts {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const fact: FileFacts = {
    file,
    routes: [],
    mounts: [],
    imports: new Map(),
    exported: null,
    nest: [],
    globalPrefix: null,
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      expressCall(node, source, fact);
    } else if (ts.isClassDeclaration(node)) {
      nestController(node, source, fact);
    } else if (ts.isImportDeclaration(node)) {
      recordImport(node, fact);
    } else if (ts.isVariableDeclaration(node)) {
      recordRequire(node, fact);
    } else if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      fact.exported = node.expression.text;
    } else if (ts.isBinaryExpression(node) && isModuleExports(node.left) && ts.isIdentifier(node.right)) {
      fact.exported = node.right.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return fact;
}

function expressCall(node: ts.CallExpression, source: ts.SourceFile, fact: FileFacts): void {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return;
  }
  const name = callee.name.text;
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  if (name === 'setGlobalPrefix') {
    const prefix = literal(node.arguments[0]);
    if (prefix !== null) {
      fact.globalPrefix = prefix;
    }
    return;
  }

  if (name === 'use' && node.arguments.length >= 2) {
    const prefix = literal(node.arguments[0]);
    const receiver = receiverName(callee.expression);
    const target = node.arguments[1];
    // A non-literal first argument may be a path variable or a middleware; either way the prefix is unknown.
    const mountPrefix = prefix ?? (isFunction(node.arguments[0]) ? '' : null);
    if (ts.isIdentifier(target)) {
      const spec = fact.imports.get(target.text);
      fact.mounts.push({
        prefix: mountPrefix,
        target: spec ? { kind: 'module', spec } : { kind: 'local', receiver: target.text },
        receiver,
      });
    } else if (ts.isCallExpression(target) && isRequire(target)) {
      const spec = literal(target.arguments[0]);
      if (spec !== null) {
        fact.mounts.push({ prefix: mountPrefix, target: { kind: 'module', spec }, receiver });
      }
    }
    return;
  }

  if (!EXPRESS_METHODS.has(name)) {
    return;
  }
  const method = name.toUpperCase();

  // router.route('/x').get(a).post(b): walk back through the chain to the route() call.
  const base = callee.expression;
  let chain: ts.Expression = base;
  while (ts.isCallExpression(chain) && ts.isPropertyAccessExpression(chain.expression) && EXPRESS_METHODS.has(chain.expression.name.text)) {
    chain = chain.expression.expression;
  }
  if (ts.isCallExpression(chain) && ts.isPropertyAccessExpression(chain.expression) && chain.expression.name.text === 'route') {
    const routePath = literal(chain.arguments[0]);
    if (routePath !== null) {
      fact.routes.push({ method, path: routePath, receiver: receiverName(chain.expression.expression), line });
    }
    return;
  }

  const routePath = literal(node.arguments[0]);
  if (routePath === null || node.arguments.length < 2) {
    return;
  }
  fact.routes.push({ method, path: routePath, receiver: receiverName(base), line });
}

function nestController(node: ts.ClassDeclaration, source: ts.SourceFile, fact: FileFacts): void {
  const controller = decorators(node).find((d) => d.name === 'Controller');
  if (!controller) {
    return;
  }
  const prefix = controller.arg ?? '';
  for (const member of node.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue;
    }
    for (const decorator of decorators(member)) {
      if (!NEST_METHODS.has(decorator.name)) {
        continue;
      }
      fact.nest.push({
        method: decorator.name.toUpperCase(),
        path: joinPath(prefix, decorator.arg ?? ''),
        receiver: null,
        line: source.getLineAndCharacterOfPosition(member.getStart(source)).line + 1,
      });
    }
  }
}

function decorators(node: ts.HasDecorators): { name: string; arg: string | null }[] {
  const out: { name: string; arg: string | null }[] = [];
  for (const decorator of ts.getDecorators(node) ?? []) {
    const expr = decorator.expression;
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
      out.push({ name: expr.expression.text, arg: literal(expr.arguments[0]) });
    } else if (ts.isIdentifier(expr)) {
      out.push({ name: expr.text, arg: null });
    }
  }
  return out;
}

function recordImport(node: ts.ImportDeclaration, fact: FileFacts): void {
  const spec = literal(node.moduleSpecifier);
  const clause = node.importClause;
  if (spec === null || !clause) {
    return;
  }
  if (clause.name) {
    fact.imports.set(clause.name.text, spec);
  }
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      fact.imports.set(element.name.text, spec);
    }
  }
}

function recordRequire(node: ts.VariableDeclaration, fact: FileFacts): void {
  if (!node.initializer || !ts.isIdentifier(node.name)) {
    return;
  }
  let init: ts.Expression = node.initializer;
  if (ts.isPropertyAccessExpression(init)) {
    init = init.expression;
  }
  if (ts.isCallExpression(init) && isRequire(init)) {
    const spec = literal(init.arguments[0]);
    if (spec !== null) {
      fact.imports.set(node.name.text, spec);
    }
  }
}

function isRequire(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === 'require';
}

function isModuleExports(node: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'module' &&
    node.name.text === 'exports'
  );
}

function receiverName(node: ts.Expression): string | null {
  return ts.isIdentifier(node) ? node.text : null;
}

function literal(node: ts.Expression | undefined): string | null {
  if (!node) {
    return null;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function isFunction(node: ts.Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function resolveModule(from: string, spec: string, all: Map<string, FileFacts>): string | null {
  if (!spec.startsWith('.')) {
    return null;
  }
  const base = normalize(path.join(path.dirname(from), spec));
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => all.has(c)) ?? null;
}

function joinPath(...parts: string[]): string {
  const segments = parts
    .flatMap((p) => p.split('/'))
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/\(.*\)$/, ''));
  return `/${segments.join('/')}`;
}

function normalize(file: string): string {
  return file.replace(/\\/g, '/');
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  return file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
}

function dedupe(locations: RouteLocation[]): RouteLocation[] {
  const seen = new Set<string>();
  return locations.filter((l) => {
    const key = `${l.method} ${l.route} ${l.file}:${l.line} ${l.prefixKnown}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
