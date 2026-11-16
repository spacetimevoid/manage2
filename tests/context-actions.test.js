import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createDeletionHistory } from '../src/deletion.js';
import { snapshotDocument } from '../src/library.js';
import { sourceEntries } from '../src/source-extraction.js';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary, saveDocuments, readDocuments, deleteDocuments, subjectRecords, subjectNames, makeSubject } from '../src/library.js';

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
  const context = vm.createContext({ deletionHistory: createDeletionHistory(async () => context.confirm !== false), snapshotDocument, mediaLoader: { load: async file => file }, fadeDeleted: async () => () => {}, document: { querySelectorAll: () => [] }, async saveDocuments(_db, records) { if(context.fail) throw Error('Offline'); context.restored = records; }, enableSubjectDrag() {}, subjectRecords, makeSubject, activeView: 'sources',
    subjects: () => subjectNames(context.files, context.activeView),
    createSubjectModal: save => ({ async open(view) { if (context.promptValue !== null) await save(context.promptValue, view); } }), async persist(file) { if(context.fail) throw Error('Offline'); context.saved = file; },
    files, activeSubject: 'math', db: {}, saveQueue: Promise.resolve(),
    $: id => ({ addEventListener(type, handler) { handlers[id] = handler; }, closest() { return { addEventListener(type, handler) { handlers.sidebar = handler; } }; } }),
    createContextMenu: () => ({ open(event, actions) { context.actions = actions; } }),
    visibleFiles: () => context.files.filter(file => file.kind !== 'problem' && file.kind !== 'subject'),
    async deleteDocuments(db, ids) { if (context.fail) throw Error('Offline'); removed.push(...ids); },
    setModal(open, file) { context.editing = file; }, renderSidebar() {}, renderFiles() {}, renderSourceOutline() {}, URL,
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('const contextMenu ='), source.indexOf('function syncToolbar(')), context);
  return { context, removed, click(target, dataset) {
    let prevented = false;
    handlers[target === 'subjectList' ? 'sidebar' : target]({ target: { closest: () => ({ dataset }) }, preventDefault() { prevented = true; } });
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
  const app = mount(); assert.equal(app.click('subjectList', { subject: 'all' }), true);
  assert.equal(app.context.actions, undefined);
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

test('Add works on the subject area, preserves an empty subject and cancellation creates nothing', async () => {
  const app = mount();
  app.click('subjectList', {});
  assert.deepEqual(Array.from(app.context.actions, action => action.label), ['Add']);
  app.context.promptValue = null; await app.context.actions[0].run();
  assert.equal(app.context.files.length, 4);
  app.context.promptValue = 'Linear Algebra'; await app.context.actions[0].run();
  assert.equal(app.context.saved.kind, 'subject'); assert.equal(app.context.saved.subject, 'linear-algebra');
  assert.equal(app.context.files.length, 5);
  app.click('subjectList', { subject: 'linear-algebra' }); await app.context.actions[0].run();
  assert.equal(app.context.files.length, 4);
});
test('Add failure and duplicate names leave the subject list unchanged', async () => {
  const app = mount(); app.click('subjectList', {});
  app.context.promptValue = 'MATH'; await assert.rejects(app.context.actions[0].run(), /already exists/);
  app.context.promptValue = 'geometry'; app.context.fail = true;
  await assert.rejects(app.context.actions[0].run(), /Offline/);
  assert.equal(app.context.files.length, 4);
});


test('deleting a linked problem from either menu removes the same record and refreshes the source outline', async () => {
  for (const origin of ['outline', 'problems']) {
    const app = mount();
    const problem = app.context.files.find(file => file.id === 'p1');
    problem.sourceLocation = { sourceId: 's1', page: 1, rect: { x: 0, y: 0 } };
    let entries;
    app.context.renderSourceOutline = () => { entries = sourceEntries(app.context.files, 's1'); };
    if (origin === 'outline') {
      let menu;
      app.context.createSourceOutline = (_pane, _jump, context) => { menu = context; return {}; };
      const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
      vm.runInContext(source.slice(source.indexOf('const sourceOutline ='), source.indexOf('function renderSourceOutline()')), app.context);
      menu({}, problem);
      assert.deepEqual(Array.from(app.context.actions, action => action.label), ['Delete']);
    } else {
      app.context.visibleFiles = () => app.context.files.filter(file => file.kind === 'problem');
      app.click('fileList', { id: 'p1' });
    }
    await app.context.actions.find(action => action.label === 'Delete').run();
    assert.deepEqual(app.removed, ['p1']); assert.equal(entries.length, 0);
    assert.equal(app.context.files.some(file => file.id === 'p1'), false);
    assert.equal(app.context.files.some(file => file.id === 's1'), true);
  }
});

test('cancel prevents deletion and undo restores a deleted subject with every file', async () => {
  const app = mount(); app.context.confirm = false;
  await app.context.removeFiles([app.context.files[0]]);
  assert.equal(app.removed.length, 0); assert.equal(app.context.deletionHistory.canUndo, false);
  app.context.confirm = true;
  const deleted = app.context.files.filter(file => file.subject === 'math');
  await app.context.removeFiles(deleted);
  assert.equal(app.context.files.length, 1);
  await app.context.deletionHistory.undo();
  assert.equal(app.context.files.length, 4); assert.equal(app.context.restored.length, 3);
  assert.equal(app.context.deletionHistory.canUndo, false);
});
