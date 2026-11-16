import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createAttachmentCache } from '../src/attachment-cache.js';

test('cached bytes survive reload but remain isolated by project and account', async () => {
  const factory = new IDBFactory();
  const cache = createAttachmentCache('project/user', factory);
  await cache.put('user/file', new Blob(['PDF'])); await cache.close();
  const reopened = createAttachmentCache('project/user', factory);
  const otherUser = createAttachmentCache('project/other', factory), otherProject = createAttachmentCache('other/user', factory);
  assert.equal(await (await reopened.get('user/file')).text(), 'PDF');
  assert.equal(await otherUser.get('user/file'), undefined); assert.equal(await otherProject.get('user/file'), undefined);
  await reopened.remove(['user/file']); assert.equal(await reopened.get('user/file'), undefined);
  await Promise.all([reopened.close(), otherUser.close(), otherProject.close()]);
});

test('cache evicts old copies within its memory budget and disabled storage never blocks the reader', async () => {
  const cache = createAttachmentCache('test', new IDBFactory(), 5);
  await cache.put('a', new Blob(['aaa'])); await cache.put('b', new Blob(['bbb']));
  assert.equal(await cache.get('a'), undefined); assert.equal(await (await cache.get('b')).text(), 'bbb');
  await cache.put('large', new Blob(['123456'])); assert.equal(await cache.get('large'), undefined);
  await cache.close();
  const unavailable = createAttachmentCache('test', null);
  assert.equal(await unavailable.get('a'), undefined); await unavailable.put('a', new Blob(['a'])); await unavailable.remove(['a']);
});
