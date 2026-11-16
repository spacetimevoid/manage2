import { normalizeSubject, DIFFICULTIES, normalizedDifficulty } from './metadata.js';
export const PAGE_SIZE = 10;
export function readerRoute(hash) {
  const [section, encodedId] = hash.replace(/^#/, '').split('/');
  const view = section === 'problems' ? 'problems' : 'sources';
  if (!['sources', 'problems'].includes(section)) return { view, id: null };
  try { return { view, id: encodedId ? decodeURIComponent(encodedId) : null }; }
  catch { return { view, id: null }; }
}
export const viewFromHash = hash => readerRoute(hash).view;
export const readerHash = (view, id = null) => `#${view}${id ? `/${encodeURIComponent(id)}` : ''}`;
export const collectionFiles = (files, view) => files.filter(file => file.kind !== 'subject' && (file.kind === 'problem' ? 'problems' : 'sources') === view);
export const subjectRecords = (files, view) => files.filter(file => file.kind === 'subject' && file.collection === view);
export function subjectNames(files, view) {
  const records = subjectRecords(files, view);
  const ranks = new Map(records.filter(file => Number.isFinite(file.position)).map(file => [file.subject, file.position]));
  return [...new Set([...records, ...collectionFiles(files, view)].map(file => file.subject))]
    .sort((a, b) => (ranks.get(a) ?? Infinity) - (ranks.get(b) ?? Infinity));
}
export function reorderedSubjects(files, view, from, to, after = false) {
  const names = subjectNames(files, view);
  if (from === to || !names.includes(from) || !names.includes(to)) return [];
  names.splice(names.indexOf(from), 1);
  names.splice(names.indexOf(to) + Number(after), 0, from);
  return names.map((subject, position) => ({
    ...(subjectRecords(files, view).find(file => file.subject === subject) || { id: crypto.randomUUID(), kind: 'subject', collection: view, subject, createdAt: Date.now() }),
    position,
  }));
}
export function makeSubject(value, view, files) {
  const subject = normalizeSubject(value);
  if (subjectNames(files, view).includes(subject)) throw new Error('This subject already exists.');
  return { id: crypto.randomUUID(), kind: 'subject', collection: view, subject, createdAt: Date.now() };
}
export const dateOf = file => file.kind === 'problem' ? file.addedDate : file.dueDate;
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function snapshotDocument(value) {
  if (value instanceof Blob || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(snapshotDocument);
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'blobUrl').map(([key, child]) => [key, snapshotDocument(child)]));
}
export function parseDate(value) {
  if (!value) return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return NaN;
  const [d, m, y] = value.split('/').map(Number);
  const date = new Date(y, m - 1, d);
  return y >= 1900 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date.getTime() : NaN;
}
export function queryFiles(files, { subject = 'all', query = '', sortKey = null, sortDir = 'asc', page = 1 } = {}) {
  const q = query.trim().toLocaleLowerCase();
  const items = files.filter(f => (subject === 'all' || f.subject === subject) && (!q || [f.name, f.topic, f.subject].some(s => s.toLocaleLowerCase().includes(q))));
  if (sortKey) items.sort((a, b) => {
    // Unscheduled records remain last in either direction.
    if (sortKey === 'date' && (!dateOf(a) || !dateOf(b))) return dateOf(a) ? -1 : dateOf(b) ? 1 : 0;
    const difficultyRank = file => DIFFICULTIES.indexOf(normalizedDifficulty(file.difficulty));
    const n = sortKey === 'date' ? parseDate(dateOf(a)) - parseDate(dateOf(b)) : sortKey === 'difficulty' ? difficultyRank(a) - difficultyRank(b) : sortKey === 'status' ? Number(a.done) - Number(b.done) : a[sortKey].localeCompare(b[sortKey], undefined, { numeric: true });
    return sortDir === 'asc' ? n : -n;
  });
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(pages, Math.max(1, page));
  return { items: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), allItems: items, total: items.length, pages, page: current };
}
export function openLibrary(factory = indexedDB) {
  return new Promise((resolve, reject) => {
    const req = factory.open('sources-library', 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('documents', { keyPath: 'id' });
      store.createIndex('subject', 'subject');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other Sources tabs and try again.'));
  });
}
export async function removeSampleDocuments(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const request = tx.objectStore('documents').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (cursor.value.sample === true) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Unable to remove sample records.'));
  });
}
export async function readDocuments(db) {
  await removeSampleDocuments(db);
  return new Promise((resolve, reject) => {
    const req = db.transaction('documents').objectStore('documents').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export function saveDocuments(db, docs) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    for (const doc of docs) {
      const { blobUrl, ...record } = doc;
      tx.objectStore('documents').put(record);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage transaction failed.'));
  });
}
export async function validatePdf(file) {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Please select a PDF file.');
  const head = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!head.includes('%PDF-')) throw new Error('This file does not contain a valid PDF header.');
}
export function deleteDocuments(db, ids) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    for (const id of ids) tx.objectStore('documents').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Unable to delete documents.'));
  });
}
