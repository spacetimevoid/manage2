import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaPreloader } from '../src/media-preloader.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
test('visible files warm with bounded concurrency and clicks bypass the queue without duplicate downloads', async () => {
  const files = Array.from({ length: 5 }, (_, id) => ({ id })), requests = new Map();
  const loader = createMediaPreloader(file => new Promise(resolve => requests.set(file.id, resolve)), { delay: 0 });
  loader.warm(files); await tick();
  assert.deepEqual([...requests.keys()], [0, 1]);
  const click = loader.load(files[4]);
  assert.equal(loader.load(files[4]), click);
  await tick(); assert.deepEqual([...requests.keys()], [0, 1, 4]);
  requests.get(4)(); await click;
  loader.warm([]);
  requests.get(0)(); requests.get(1)(); await tick();
  assert.deepEqual([...requests.keys()], [0, 1, 4], 'cancelled list does not keep downloading');
  loader.warm([files[0], files[1], files[4]]); await tick();
  assert.equal(requests.size, 3);
});

test('failed prefetch is retryable and replacing the list discards queued files from the old subject', async () => {
  const a = {}, b = {}; let attempts = 0;
  const loader = createMediaPreloader(async file => { assert.equal(file, b); if (++attempts === 1) throw Error('offline'); }, { delay: 0 });
  loader.warm([a]); loader.warm([b]); await tick();
  assert.equal(attempts, 1);
  assert.equal(await loader.load(b), b); assert.equal(attempts, 2);
});
