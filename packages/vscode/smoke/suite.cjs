// Runs inside the VS Code extension host (see run.mjs).
const assert = require('node:assert/strict');
const vscode = require('vscode');

exports.run = async () => {
  const ext = vscode.extensions.getExtension('morsadev.ai-sdlc');
  assert.ok(ext, 'extension morsadev.ai-sdlc is loaded');
  const api = await ext.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const c of ['aiSdlc.menu', 'aiSdlc.next', 'aiSdlc.approve', 'aiSdlc.quick', 'aiSdlc.doctorFix']) assert.ok(commands.includes(c), `${c} is registered`);
  await api.refresh();
  const state = api.state();
  assert.equal(state.next?.kind, 'approve', `next from the bundled CLI: ${JSON.stringify(state.next)}`);
  assert.equal(state.next.change, 'export');
  assert.deepEqual(state.changes.map((c) => [c.slug, c.stage]), [['export', 'spec-draft']]);
};
