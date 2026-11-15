import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudStorage } from '../src/cloud-storage.js';
import { snapshotDocument } from '../src/library.js';

function fakeCloud() {
  const objects = new Map(), rows = new Map(), uploads = [], removals = [];
  let failWrite = false;
  const client = {
    storage: { from(name) {
      assert.equal(name, 'manage-files');
      return {
        async upload(path, blob) { objects.set(path, blob); uploads.push(path); return { data: { path }, error: null }; },
        async download(path) { return objects.has(path) ? { data: objects.get(path) } : { error: new Error('Missing attachment') }; },
        async remove(paths) { for (const path of paths) objects.delete(path); removals.push(...paths); return { data: [] }; },
      };
    } },
    from(table) {
      assert.equal(table, 'library_documents');
      let owner;
      return {
        select() { return this; }, eq(_key, value) { owner = value; return this; }, order() { return this; },
        async range(start, end) { return { data: [...rows.values()].filter(row => row.owner_id === owner).sort((a, b) => a.id.localeCompare(b.id)).slice(start, end + 1) }; },
        async upsert(records) {
          if (failWrite) return { error: new Error('Database unavailable') };
          for (const row of records) rows.set(`${row.owner_id}:${row.id}`, structuredClone(row));
          return { data: null };
        },
      };
    },
  };
  return { client, objects, rows, uploads, removals, fail() { failWrite = true; } };
}
test('cloud persists PDF, images, notes and solution and restores them from a new session', async () => {
  const fake = fakeCloud(), owner = { id: 'owner' };
  const storage = createCloudStorage(fake.client, owner);
  const file = { id: 'p', name: 'Problem.png', kind: 'problem', notes: 'Proof',
    blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }), blobUrl: 'blob:temporary',
    statementImages: [{ name: 'question.png', blob: new Blob(['pixels'], { type: 'image/png' }) }],
    solution: { type: 'pdf', markdown: '**Solution**', pdfBlob: new Blob(['%PDF-solution']) } };
  await storage.save([snapshotDocument(file)]);
  assert.equal(fake.uploads.length, 3);
  assert.ok(fake.uploads.every(path => path.startsWith('owner/')));
  assert.doesNotMatch(JSON.stringify([...fake.rows.values()]), /blob:temporary/);
  const restored = await createCloudStorage(fake.client, owner).read();
  assert.equal(await restored[0].blob.text(), '%PDF-1.7');
  assert.equal(await restored[0].statementImages[0].blob.text(), 'pixels');
  assert.equal(await restored[0].solution.pdfBlob.text(), '%PDF-solution');
  assert.equal(restored[0].notes, 'Proof');
  assert.deepEqual(await createCloudStorage(fake.client, { id: 'other' }).read(), []);
});
test('note changes reuse existing attachments; removing a file cleans up its private object', async () => {
  const fake = fakeCloud(), storage = createCloudStorage(fake.client, { id: 'owner' });
  const file = { id: 'doc', notes: '', blob: new Blob(['PDF']) };
  await storage.save([snapshotDocument(file)]);
  file.notes = 'Edited'; await storage.save([snapshotDocument(file)]);
  assert.equal(fake.uploads.length, 1);
  delete file.blob; await storage.save([snapshotDocument(file)]);
  assert.equal(fake.objects.size, 0); assert.equal(fake.removals.length, 1);
});
test('failed metadata writes roll back newly uploaded objects without losing the saved version', async () => {
  const fake = fakeCloud(), storage = createCloudStorage(fake.client, { id: 'owner' });
  await storage.save([{ id: 'doc', notes: 'Saved', blob: new Blob(['old']) }]);
  fake.fail();
  await assert.rejects(storage.save([{ id: 'doc', notes: 'Unsaved', blob: new Blob(['new']) }]), /Database unavailable/);
  assert.equal(fake.objects.size, 1); assert.equal(fake.rows.get('owner:doc').document.notes, 'Saved');
});
test('cloud reads every metadata page and rejects cross-owner attachment references', async () => {
  const fake = fakeCloud();
  for (let i = 0; i < 501; i++) fake.rows.set(`owner:${i}`, { owner_id: 'owner', id: String(i), document: { id: String(i) } });
  assert.equal((await createCloudStorage(fake.client, { id: 'owner' }).read()).length, 501);
  fake.rows.set('owner:bad', { owner_id: 'owner', id: 'bad', document: { id: 'bad', blob: { __manageFile: 'other/file' } } });
  await assert.rejects(createCloudStorage(fake.client, { id: 'owner' }).read(), /ownership/);
});
test('save snapshots freeze mutable metadata while preserving immutable Blob identity', () => {
  const blob = new Blob(['bytes']);
  const file = { id: 'p', notes: 'old', statementImages: [{ blob }], blobUrl: 'blob:discard' };
  const snapshot = snapshotDocument(file);
  file.notes = 'new'; file.statementImages.push({ blob });
  assert.equal(snapshot.notes, 'old'); assert.equal(snapshot.statementImages.length, 1);
  assert.equal(snapshot.statementImages[0].blob, blob); assert.equal(snapshot.blobUrl, undefined);
});
