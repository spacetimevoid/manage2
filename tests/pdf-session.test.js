import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfSession } from '../src/pdf-session.js';

test('PDF parsing and worker startup are reused; oldest documents are released and failed opens can retry', async () => {
  let workers = 0, fail = false;
  const opened = [];
  const session = createPdfSession({
    PDFWorker: class { constructor() { workers++; this.promise = Promise.resolve(); } destroy() { this.destroyed = true; } },
    getDocument({ url, worker }) {
      const task = { url, worker, destroyed: false, promise: fail ? Promise.reject(Error('broken')) : Promise.resolve({}), async destroy() { this.destroyed = true; } };
      opened.push(task); return task;
    },
  });
  await session.warm(); const a = session.open('a'), b = session.open('b');
  assert.equal(session.open('a'), a); session.open('c');
  assert.equal(workers, 1); assert.equal(a.destroyed, false); assert.equal(b.destroyed, true);
  fail = true; await assert.rejects(session.open('bad').promise); await Promise.resolve();
  fail = false; await session.open('bad').promise;
  assert.equal(opened.filter(task => task.url === 'bad').length, 2);
  await session.clear(); assert.ok(opened.every(task => task.destroyed)); assert.ok(a.worker.destroyed);
});
