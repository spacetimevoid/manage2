import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary, readDocuments, saveDocuments } from '../src/library.js';

test('PDF bytes, notes, and status survive a database close/reopen', async () => {
  const factory = new IDBFactory();
  let db = await openLibrary(factory);
  const doc = { id: 'uploaded', name: 'Đề khó.pdf', subject: 'toán', notes: 'Bài 3, trang 2', done: false, blob: new Blob(['%PDF-1.7\nreal bytes']), blobUrl: 'blob:temporary' };
  await saveDocuments(db, [doc]);
  doc.done = true; doc.notes += ' — đã giải';
  await saveDocuments(db, [doc]);
  db.close(); db = await openLibrary(factory);
  const [stored] = await readDocuments(db);
  assert.equal(stored.done, true); assert.equal(stored.notes, doc.notes);
  assert.equal(await stored.blob.text(), '%PDF-1.7\nreal bytes');
  assert.equal(stored.blobUrl, undefined);
  assert.equal((await readDocuments(db)).length, 1);
  db.close();
});
