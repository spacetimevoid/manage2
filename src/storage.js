import * as local from './library.js';
import { cloudClient } from './cloud.js';
import { createCloudStorage } from './cloud-storage.js';
import { requirePrivateSession } from './auth.js';

export async function openLibrary() {
  if (!cloudClient) return local.openLibrary();
  const user = await requirePrivateSession(cloudClient);
  return createCloudStorage(cloudClient, user);
}
export async function readDocuments(db) {
  if (!db.cloud) return local.readDocuments(db);
  const remote = await db.read();
  // Import existing records from this browser origin without overwriting cloud edits.
  let browserDb;
  let existing = [];
  try {
    browserDb = await local.openLibrary();
    existing = await local.readDocuments(browserDb);
  } catch (error) {
    console.warn('Local library import is unavailable:', error);
  } finally { browserDb?.close(); }
  const known = new Set(remote.map(file => file.id));
  const missing = existing.filter(file => !file.sample && !known.has(file.id));
  if (missing.length) { await db.save(missing); remote.unshift(...missing); }
  return remote;
}
export const saveDocuments = (db, documents) => db.cloud ? db.save(documents) : local.saveDocuments(db, documents);
export async function deleteDocuments(db, ids) {
  if (!db.cloud) return local.deleteDocuments(db, ids);
  // Remove imported originals first so a reload cannot import deleted files again.
  const browserDb = await local.openLibrary();
  try { await local.deleteDocuments(browserDb, ids); } finally { browserDb.close(); }
  await db.remove(ids);
}
