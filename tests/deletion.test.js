import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeletionHistory, createDeleteConfirmation, fadeDeleted, installDeleteUndo } from '../src/deletion.js';

test('confirmation cancels safely, undo follows reverse order and a failed restore remains retryable', async () => {
  let confirm = false, fail = false; const restored = [];
  const history = createDeletionHistory(async () => confirm);
  await history.remove('', () => assert.fail('cancelled'));
  confirm = true;
  await history.remove('', async () => async () => restored.push('first'));
  await history.remove('', async () => async () => { if (fail) throw Error('offline'); restored.push('second'); });
  fail = true; await assert.rejects(history.undo(), /offline/); assert.equal(history.canUndo, true);
  fail = false; await history.undo(); await history.undo();
  assert.deepEqual(restored, ['second', 'first']); assert.equal(history.canUndo, false);
});

test('delete confirmation defaults to Cancel, ignores background click and Escape cancels', async () => {
  const previous = globalThis.document;
  const remove = {}, cancel = { focus() { this.focused = true; } }, message = {}, events = {};
  const dialog = { setAttribute() {}, querySelectorAll: () => [remove, cancel], querySelector: () => message,
    addEventListener(type, callback) { events[type] = callback; }, showModal() { this.open = true; }, close() { this.open = false; } };
  globalThis.document = { createElement: () => dialog, body: { append() {} } };
  try {
    const confirm = createDeleteConfirmation(); const cancelled = confirm('Delete subject?');
    assert.equal(cancel.focused, true); assert.equal(message.textContent, 'Delete subject?');
    assert.equal(dialog.onclick, undefined); events.cancel({ preventDefault() {} }); assert.equal(await cancelled, false);
    const accepted = confirm('Delete file?'); remove.onclick(); assert.equal(await accepted, true);
  } finally { globalThis.document = previous; }
});

test('Ctrl+Z restores deletions outside text fields and delete fade completes before removal', async () => {
  const previous = globalThis.document; let keydown, undos = 0, finish;
  globalThis.document = { querySelector: () => null };
  try {
    installDeleteUndo({ canUndo: true, async undo() { undos++; } }, { addEventListener(_type, listener) { keydown = listener; } });
    const key = tagName => ({ ctrlKey: true, key: 'z', target: { tagName }, preventDefault() {} });
    keydown(key('TEXTAREA')); assert.equal(undos, 0);
    keydown(key('BUTTON')); assert.equal(undos, 1);
    let cancelled = false;
    const fading = fadeDeleted([{ animate() { return { finished: new Promise(resolve => { finish = resolve; }), cancel() { cancelled = true; } }; } }]);
    assert.equal(cancelled, false); finish(); const reset = await fading; assert.equal(cancelled, false); reset(); assert.equal(cancelled, true);
  } finally { globalThis.document = previous; }
});
