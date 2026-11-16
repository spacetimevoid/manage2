import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeletionHistory, createDeleteConfirmation, fadeDeleted, revealRestored, installDeleteUndo } from '../src/deletion.js';

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

test('deletion gradually collapses row spacing before refreshing the surrounding list', async () => {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ paddingTop: '11px', paddingBottom: '11px', marginTop: '1px', marginBottom: '1px', borderTopWidth: '0px', borderBottomWidth: '0px' });
  let frames, options, finish, cancelled = false;
  try {
    const done = fadeDeleted([{ getBoundingClientRect: () => ({ height: 48 }), animate(value, settings) {
      frames = value; options = settings;
      return { finished: new Promise(resolve => { finish = resolve; }), cancel() { cancelled = true; } };
    } }]);
    assert.equal(frames[0].height, '48px'); assert.equal(frames[1].height, '0px');
    for (const key of ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom']) assert.equal(frames[1][key], '0px');
    assert.equal(options.fill, 'both'); assert.ok(options.duration > 180);
    assert.equal(cancelled, false); finish(); const cleanup = await done;
    assert.equal(cancelled, false, 'collapsed space persists until the list refresh');
    cleanup(); assert.equal(cancelled, true);
  } finally { globalThis.getComputedStyle = previous; }
});

test('undo expands restored rows from zero height and fades them in, then releases animation styles', async () => {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ paddingTop: '11px', paddingBottom: '11px', marginTop: '1px', marginBottom: '1px', borderTopWidth: '0px', borderBottomWidth: '0px' });
  let frames, finish, cancelled = false;
  try {
    const restored = revealRestored([{ getBoundingClientRect: () => ({ height: 48 }), animate(value) {
      frames = value; return { finished: new Promise(resolve => { finish = resolve; }), cancel() { cancelled = true; } };
    } }]);
    assert.equal(frames[0].height, '0px'); assert.equal(frames[0].opacity, 0);
    assert.equal(frames[1].height, '48px'); assert.equal(frames[1].opacity, 1);
    assert.equal(frames[1].marginTop, '1px'); assert.equal(cancelled, false);
    finish(); await restored; assert.equal(cancelled, true);
  } finally { globalThis.getComputedStyle = previous; }
});
