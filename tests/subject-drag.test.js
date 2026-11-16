import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary, saveDocuments, readDocuments, subjectNames, reorderedSubjects, collectionFiles } from '../src/library.js';
import { enableSubjectDrag } from '../src/subject-drag.js';

test('subject reorder survives reopening without moving documents across subjects or collections', async () => {
  const factory = new IDBFactory(); let db = await openLibrary(factory);
  const files = ['math', 'physics', 'chemistry'].map(subject => ({ id: subject, name: `${subject}.pdf`, subject }));
  files.push({ id: 'p', kind: 'problem', subject: 'math' });
  await saveDocuments(db, files);
  await saveDocuments(db, reorderedSubjects(files, 'sources', 'chemistry', 'math'));
  db.close(); db = await openLibrary(factory);
  const restored = await readDocuments(db);
  assert.deepEqual(subjectNames(restored, 'sources'), ['chemistry', 'math', 'physics']);
  assert.deepEqual(subjectNames(restored, 'problems'), ['math']);
  assert.equal(collectionFiles(restored, 'sources').length, 3);
  assert.deepEqual(reorderedSubjects(restored, 'sources', 'all', 'math'), []);
  const moved = reorderedSubjects(restored, 'sources', 'chemistry', 'physics', true);
  await saveDocuments(db, moved);
  assert.deepEqual(subjectNames(await readDocuments(db), 'sources'), ['math', 'physics', 'chemistry']);
  db.close();
});

test('drag and drop sends the captured collection and drop position, excluding All and external drags', async () => {
  const handlers = {}, calls = []; let view = 'sources';
  enableSubjectDrag({ addEventListener(type, callback) { handlers[type] = callback; } }, async (...args) => calls.push(args), () => view);
  const event = (subject, clientY = 5) => ({ clientY, target: { closest: () => ({ dataset: { subject }, getBoundingClientRect: () => ({ top: 0, height: 20 }) }) }, preventDefault() { this.prevented = true; }, dataTransfer: { setData() {} } });
  await handlers.drop(event('math')); assert.equal(calls.length, 0);
  const all = event('all'); handlers.dragstart(all); assert.equal(all.prevented, true);
  handlers.dragstart(event('math')); await handlers.drop(event('physics', 15));
  assert.deepEqual(calls, [['sources', 'math', 'physics', true]]);
  handlers.dragstart(event('math')); view = 'problems'; await handlers.drop(event('physics'));
  assert.equal(calls.length, 1);
});
