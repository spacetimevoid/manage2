import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary, saveDocuments, readDocuments, deleteDocuments } from '../src/library.js';

test('local deletion persists after reload without removing other documents', async () => {
  const db = await openLibrary(new IDBFactory());
  await saveDocuments(db, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  await deleteDocuments(db, ['a', 'c']);
  assert.deepEqual((await readDocuments(db)).map(file => file.id), ['b']);
  db.close();
});

function mount() {
  const handlers = {}, removed = [], files = [
    { id: 's1', subject: 'math' }, { id: 's2', subject: 'math' },
    { id: 's3', subject: 'physics' }, { id: 'p1', kind: 'problem', subject: 'math' },
  ];
  const context = vm.createContext({ files, activeSubject: 'math', db: {}, saveQueue: Promise.resolve(),
    $: id => ({ addEventListener(type, handler) { handlers[id] = handler; } }),
    createContextMenu: () => ({ open(event, actions) { context.actions = actions; } }),
    visibleFiles: () => context.files.filter(file => file.kind !== 'problem'),
    async deleteDocuments(db, ids) { if (context.fail) throw Error('Offline'); removed.push(...ids); },
    setModal(open, file) { context.editing = file; }, renderSidebar() {}, renderFiles() {}, URL,
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('const contextMenu ='), source.indexOf('function syncToolbar(')), context);
  return { context, removed, click(target, dataset) {
    let prevented = false;
    handlers[target]({ target: { closest: () => ({ dataset }) }, preventDefault() { prevented = true; } });
    return prevented;
  } };
}
test('row menu edits the selected document and deletes only that document', async () => {
  const app = mount(); assert.equal(app.click('fileList', { id: 's1' }), true);
  assert.deepEqual(Array.from(app.context.actions, action => action.label), ['Edit', 'Delete']);
  app.context.actions[0].run(); assert.equal(app.context.editing.id, 's1');
  await app.context.actions[1].run();
  assert.deepEqual(app.removed, ['s1']); assert.equal(app.context.files.length, 3);
});
test('subject menu deletes its collection documents, resets selection and never deletes All', async () => {
  const app = mount(); assert.equal(app.click('subjectList', { subject: 'all' }), false);
  app.click('subjectList', { subject: 'math' });
  assert.deepEqual(Array.from(app.context.actions, action => action.label), ['Delete']);
  await app.context.actions[0].run();
  assert.deepEqual(app.removed, ['s1', 's2']); assert.equal(app.context.activeSubject, 'all');
  assert.deepEqual(Array.from(app.context.files, file => file.id), ['s3', 'p1']);
});
test('delete failure leaves the visible library unchanged', async () => {
  const app = mount(); app.context.fail = true; app.click('fileList', { id: 's1' });
  await assert.rejects(app.context.actions[1].run(), /Offline/);
  assert.equal(app.context.files.length, 4); assert.equal(app.context.activeSubject, 'math');
});
