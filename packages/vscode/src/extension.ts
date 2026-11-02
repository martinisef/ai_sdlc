// AI SDLC for VS Code and Cursor: a status bar with the next step, a sidebar of changes by stage,
// and commands that call the same `sdlc` CLI as the terminal, the hooks and CI.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Artifact, NextAction } from '@ai-native-sdlc/core';
import { resolveCli, runCli, shellLine, type Cli } from './cli.ts';
import { menuItems, parseNext, parseStatus, statusBar, treeGroups, type StatusLine, type TreeEntry, type TreeGroup } from './format.ts';

export interface State {
  next?: NextAction;
  changes: StatusLine[];
}

type Node = { group: TreeGroup } | { entry: TreeEntry };

class ChangesTree implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  groups: TreeGroup[] = [];

  update(groups: TreeGroup[]) {
    this.groups = groups;
    this.emitter.fire(undefined);
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.groups.map((group) => ({ group }));
    return 'group' in node ? node.group.entries.map((entry) => ({ entry })) : [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if ('group' in node) {
      const item = new vscode.TreeItem(`${node.group.label} (${node.group.entries.length})`, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'group';
      return item;
    }
    const e = node.entry;
    const item = new vscode.TreeItem(e.label, vscode.TreeItemCollapsibleState.None);
    item.description = e.description;
    item.contextValue = e.contextValue;
    item.iconPath = new vscode.ThemeIcon(e.contextValue === 'gate' ? 'pass' : 'file');
    item.tooltip = `${e.change}/${e.artifact}.md`;
    item.command = { command: 'aiSdlc.openArtifact', title: 'Open', arguments: [e.change, e.artifact] };
    return item;
  }
}

/** What `activate` returns: used by the smoke test, stable enough for other extensions. */
export interface AiSdlcApi {
  refresh(): Promise<void>;
  state(): State;
}

export function activate(context: vscode.ExtensionContext): AiSdlcApi | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  const root = folder.uri.fsPath;
  const output = vscode.window.createOutputChannel('AI SDLC');
  const cli = (): Cli => resolveCli(root, context.extensionPath, vscode.workspace.getConfiguration('aiSdlc').get<string>('cliPath') ?? '');
  const state: State = { changes: [] };

  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  bar.command = 'aiSdlc.menu';
  bar.text = '$(sync~spin) sdlc';
  bar.show();
  const tree = new ChangesTree();
  const view = vscode.window.createTreeView('aiSdlc.changes', { treeDataProvider: tree });

  const sdlc = async (args: string[]) => {
    const r = await runCli(cli(), root, args);
    if (r.code !== 0) output.appendLine(`sdlc ${args.join(' ')} → exit ${r.code}\n${r.stderr.trim()}`);
    return r;
  };

  const terminal = (args: string[], name = 'sdlc') => {
    const c = cli();
    const t = vscode.window.createTerminal({ name, cwd: root, env: { ...c.env, SDLC_PROJECT_DIR: root } });
    t.show();
    t.sendText(shellLine(c, args));
  };

  let refreshing: Promise<void> | undefined;
  const refresh = () =>
    (refreshing ??= (async () => {
      const [next, status] = await Promise.all([sdlc(['next', '--json']), sdlc(['status', '--json'])]);
      state.next = next.code === 0 ? parseNext(next.stdout) : undefined;
      state.changes = status.code === 0 ? parseStatus(status.stdout) : [];
      const b = statusBar(state.next);
      bar.text = b.text;
      bar.tooltip = b.tooltip;
      tree.update(treeGroups(state.changes, state.next));
      view.badge = state.next?.kind === 'approve' || state.next?.inbox.length
        ? { value: (state.next.kind === 'approve' ? 1 : 0) + state.next.inbox.length, tooltip: 'gates waiting on you' }
        : undefined;
    })().finally(() => (refreshing = undefined)));

  let timer: NodeJS.Timeout | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 400);
  };
  for (const glob of ['changes/**', '.git/HEAD', '.sdlc/config.json']) {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, glob));
    w.onDidChange(soon);
    w.onDidCreate(soon);
    w.onDidDelete(soon);
    context.subscriptions.push(w);
  }

  const openArtifact = async (change?: string, artifact?: Artifact) => {
    if (!change || !artifact) {
      const picks = state.changes.flatMap((c) =>
        ['intent', 'spec', 'plan']
          .filter((_, i) => (c.statuses.split('/')[i] ?? '-') !== '-')
          .map((a) => ({ label: `${c.slug}/${a}.md`, description: c.stage, change: c.change, artifact: a as Artifact })),
      );
      const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Open an artifact' });
      if (!pick) return;
      ({ change, artifact } = pick);
    }
    const file = join(root, change, `${artifact}.md`);
    if (!existsSync(file)) {
      vscode.window.showInformationMessage(`${change}/${artifact}.md is not in this checkout (it lives on its change branch).`);
      return;
    }
    await vscode.window.showTextDocument(vscode.Uri.file(file));
  };

  const decide = async (decision: 'approve' | 'reject', change?: string, artifact?: Artifact) => {
    if (!change || !artifact) {
      const gates = menuItems(state.next, state.changes).filter((m) => m.id === decision);
      if (!gates.length) return void vscode.window.showInformationMessage('No gate is waiting on you.');
      const pick = await vscode.window.showQuickPick(gates, { placeHolder: `${decision === 'approve' ? 'Approve' : 'Reject'} which gate?` });
      if (!pick) return;
      ({ change, artifact } = pick);
    }
    let comment: string | undefined;
    if (decision === 'reject') {
      comment = await vscode.window.showInputBox({ prompt: `Why reject the ${artifact} of ${change}?`, ignoreFocusOut: true });
      if (comment === undefined) return;
    } else {
      const ok = await vscode.window.showWarningMessage(`Approve the ${artifact} of ${change}? This records a commit with you as approver.`, { modal: true }, 'Approve');
      if (ok !== 'Approve') return;
    }
    const r = await sdlc([decision, change!, artifact!, ...(comment ? ['-m', comment] : [])]);
    if (r.code === 0) vscode.window.showInformationMessage(r.stdout.trim());
    else vscode.window.showErrorMessage(r.stderr.trim().replace(/^sdlc: /, '') || `sdlc ${decision} failed`);
    await refresh();
  };

  const quick = async () => {
    const what = await vscode.window.showInputBox({ prompt: 'What is the small change?', placeHolder: 'fix the typo in the signup email', ignoreFocusOut: true });
    if (what) terminal(['quick', what]);
  };

  const doNext = async () => {
    const n = state.next;
    if (!n) return refresh();
    if (n.kind === 'approve') return decide('approve', n.change, n.artifact);
    if (n.skill) {
      await vscode.env.clipboard.writeText(n.skill);
      vscode.window.showInformationMessage(`${n.message}. Copied ${n.skill}: paste it in your agent's chat.`);
      return;
    }
    if (n.command && !n.command.includes('<')) return terminal(n.command.replace(/^sdlc /, '').split(' '));
    vscode.window.showInformationMessage(n.message + (n.command ? ` (${n.command})` : ''));
  };

  const doctorFix = async () => {
    const r = await sdlc(['doctor', '--fix']);
    output.appendLine(r.stdout);
    output.show(true);
    await refresh();
  };

  const menu = async () => {
    await refresh();
    const pick = await vscode.window.showQuickPick(menuItems(state.next, state.changes), { placeHolder: state.next?.message ?? 'AI SDLC' });
    if (!pick) return;
    switch (pick.id) {
      case 'next':
        return doNext();
      case 'open':
        return openArtifact(pick.change, pick.artifact);
      case 'approve':
      case 'reject':
        return decide(pick.id, pick.change, pick.artifact);
      case 'quick':
        return quick();
      case 'dashboard':
        return terminal(['ui'], 'sdlc ui');
      case 'doctor':
        return doctorFix();
    }
  };

  const entryArgs = (n?: { entry: TreeEntry }): [string?, Artifact?] => (n?.entry ? [n.entry.slug, n.entry.artifact] : []);
  context.subscriptions.push(
    output,
    bar,
    view,
    vscode.commands.registerCommand('aiSdlc.menu', menu),
    vscode.commands.registerCommand('aiSdlc.refresh', refresh),
    vscode.commands.registerCommand('aiSdlc.next', doNext),
    vscode.commands.registerCommand('aiSdlc.openArtifact', openArtifact),
    vscode.commands.registerCommand('aiSdlc.quick', quick),
    vscode.commands.registerCommand('aiSdlc.approve', (n?: { entry: TreeEntry }) => decide('approve', ...entryArgs(n))),
    vscode.commands.registerCommand('aiSdlc.reject', (n?: { entry: TreeEntry }) => decide('reject', ...entryArgs(n))),
    vscode.commands.registerCommand('aiSdlc.dashboard', () => terminal(['ui'], 'sdlc ui')),
    vscode.commands.registerCommand('aiSdlc.doctorFix', doctorFix),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('aiSdlc') && soon()),
  );
  output.appendLine(`AI SDLC: using ${cli().label}`);
  void refresh();
  return { refresh, state: () => state };
}

export function deactivate() {}
