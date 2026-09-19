import * as vscode from 'vscode';
import { applyInsertion, PACKAGE, planInsertion } from './onboarding';

const SCHEME = 'api-profiler-preview';
const SOURCES = '**/*.{js,ts,mjs,cjs}';
const IGNORED = '{**/node_modules/**,**/dist/**,**/build/**,**/out/**,**/.git/**,**/*.d.ts,**/*.test.*,**/*.spec.*}';

export function install(): void {
  const terminal = vscode.window.createTerminal('API Profiler');
  terminal.show();
  terminal.sendText(`npm install ${PACKAGE}`);
}

// Shows the proposed change as a diff and only writes it after an explicit "Apply".
export async function addMiddleware(previews: Previews): Promise<void> {
  const candidate = await pickEntryFile();
  if (!candidate) {
    void vscode.window.showWarningMessage(
      `API Profiler: no file with "express()" found. Add app.use(profiler()) right after the app is created, with: const { profiler } = require('${PACKAGE}');`,
    );
    return;
  }
  const { uri, text, plan } = candidate;
  const proposed = applyInsertion(text, plan);
  const preview = previews.set(uri, proposed);
  await vscode.commands.executeCommand('vscode.diff', uri, preview, `${basename(uri)}: add API Profiler`);
  const choice = await vscode.window.showInformationMessage(
    `Add app.use(profiler()) to ${basename(uri)}?`,
    { modal: true },
    'Apply',
  );
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  if (choice !== 'Apply') {
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  if (document.getText() !== text) {
    void vscode.window.showWarningMessage('API Profiler: the file changed while the preview was open. Nothing was written.');
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(plan.useAt, 0), `${plan.useLine}\n`);
  edit.insert(uri, new vscode.Position(plan.importAt, 0), `${plan.importLine}\n`);
  if (await vscode.workspace.applyEdit(edit)) {
    await vscode.window.showTextDocument(document);
  }
}

// Serves the proposed file contents to the diff view without touching the disk.
export class Previews implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly contents = new Map<string, string>();
  private readonly registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, this);

  set(original: vscode.Uri, text: string): vscode.Uri {
    const uri = original.with({ scheme: SCHEME });
    this.contents.set(uri.toString(), text);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  dispose(): void {
    this.registration.dispose();
  }
}

async function pickEntryFile(): Promise<{ uri: vscode.Uri; text: string; plan: ReturnType<typeof planInsertion> & object } | null> {
  const found: { uri: vscode.Uri; text: string; plan: NonNullable<ReturnType<typeof planInsertion>> }[] = [];
  for (const uri of await vscode.workspace.findFiles(SOURCES, IGNORED, 2000)) {
    try {
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      const plan = planInsertion(uri.fsPath, text);
      if (plan) {
        found.push({ uri, text, plan });
      }
    } catch {
      // unreadable file: skip it
    }
  }
  if (found.length === 0) {
    return null;
  }
  if (found.length === 1) {
    return found[0];
  }
  const picked = await vscode.window.showQuickPick(
    found.map((f) => ({ label: vscode.workspace.asRelativePath(f.uri), entry: f })),
    { placeHolder: 'Which file creates your Express app?' },
  );
  return picked?.entry ?? null;
}

function basename(uri: vscode.Uri): string {
  return uri.path.split('/').pop() ?? uri.path;
}
