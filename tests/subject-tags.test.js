import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubjectTags, documentSubjects } from '../src/subject-tags.js';
import { queryFiles, subjectNames, openLibrary, saveDocuments, readDocuments } from '../src/library.js';
import { IDBFactory } from 'fake-indexeddb';

test('tag input commits Enter/comma, normalizes and deduplicates, removes tags and saves unfinished text', () => {
  const previous = globalThis.document;
  const elements = [];
  globalThis.document = { createElement() {
    const element = { children: [], value: '', setAttribute() {}, setCustomValidity() {}, reportValidity() {}, focus() {},
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } };
    elements.push(element); return element;
  } };
  try {
    const editor = createSubjectTags({ prepend() {} });
    editor.set([], true);
    const input = elements.find(item => item.id === 'problemSubjectTagsInput');
    input.value = 'Math, geometry, math'; input.onkeydown({ key: 'Enter', preventDefault() {} });
    assert.deepEqual(editor.get(), ['math', 'geometry']);
    const tags = elements.find(item => item.className === 'subject-tag-items');
    tags.children[0].children[1].onclick(); assert.deepEqual(editor.get(), ['geometry']);
    input.value = 'linear algebra'; assert.deepEqual(editor.get(), ['geometry', 'linear-algebra']);
    editor.set([], true); assert.throws(() => editor.get(), /subject/);
    input.value = 'a/b'; assert.throws(() => editor.get(), /slashes/);
  } finally { globalThis.document = previous; }
});

test('multiple subjects survive reload and each filters the same problem once; legacy Sources are unchanged', async () => {
  const file = { id: 'p', kind: 'problem', name: 'question.png', subject: 'math', subjects: ['math', 'geometry'], topic: '' };
  const db = await openLibrary(new IDBFactory()); await saveDocuments(db, [file]);
  const [restored] = await readDocuments(db); db.close();
  assert.deepEqual(subjectNames([restored], 'problems'), ['math', 'geometry']);
  for (const subject of restored.subjects) assert.equal(queryFiles([restored], { subject }).total, 1);
  assert.equal(queryFiles([restored]).total, 1);
  assert.deepEqual(documentSubjects({ kind: 'problem', subject: 'old' }), ['old']);
  assert.deepEqual(documentSubjects({ subject: 'math', subjects: ['ignored'] }), ['math']);
});
