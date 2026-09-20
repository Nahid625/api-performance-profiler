import ts from 'typescript';

export const PACKAGE = '@api-profiler/express';

export interface Insertion {
  // 0-based line before which each line is inserted; the use line is relative to the original text.
  importAt: number;
  importLine: string;
  useAt: number;
  useLine: string;
}

// Works out where `app.use(profiler())` belongs in an Express or NestJS entry file, or null when it cannot tell.
export function planInsertion(file: string, text: string): Insertion | null {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  if (text.includes(PACKAGE)) {
    return null;
  }
  let app: { name: string; line: number; indent: string } | null = null;
  let lastImport = -1;
  let esm = false;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      esm = true;
      lastImport = Math.max(lastImport, endLine(source, node));
    } else if (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.initializer && isRequire(d.initializer))) {
      lastImport = Math.max(lastImport, endLine(source, node));
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && createsApp(node.initializer) && !app) {
      const statement = node.parent.parent;
      const line = endLine(source, statement);
      app = { name: node.name.text, line, indent: indentOf(source, statement) };
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (!app) {
    return null;
  }
  const found: { name: string; line: number; indent: string } = app;
  const importLine = esm ? `import { profiler } from '${PACKAGE}';` : `const { profiler } = require('${PACKAGE}');`;
  return {
    importAt: lastImport + 1,
    importLine,
    useAt: found.line + 1,
    useLine: `${found.indent}${found.name}.use(profiler());`,
  };
}

export function applyInsertion(text: string, plan: Insertion): string {
  const lines = text.split('\n');
  lines.splice(plan.useAt, 0, plan.useLine);
  lines.splice(plan.importAt, 0, plan.importLine);
  return lines.join('\n');
}

function isRequire(node: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return isRequire(node.expression);
  }
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require';
}

// `express()` or `await NestFactory.create(...)` (Nest on its default Express adapter).
function createsApp(node: ts.Expression): boolean {
  const call = ts.isAwaitExpression(node) ? node.expression : node;
  if (!ts.isCallExpression(call)) {
    return false;
  }
  if (ts.isIdentifier(call.expression)) {
    return call.expression.text === 'express' && call.arguments.length === 0;
  }
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === 'NestFactory' &&
    call.expression.name.text === 'create'
  );
}

function endLine(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getEnd()).line;
}

function indentOf(source: ts.SourceFile, node: ts.Node): string {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const lineStart = source.getPositionOfLineAndCharacter(start.line, 0);
  return source.text.slice(lineStart, lineStart + start.character).replace(/\S.*$/, '');
}
