const BUCKET = 'manage-files';
const throwIfError = result => { if (result.error) throw result.error; return result.data; };

function attachmentPaths(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;
  if (value.__manageFile) { found.add(value.__manageFile); return found; }
  for (const child of Object.values(value)) attachmentPaths(child, found);
  return found;
}
async function mapLimited(values, callback, count = 4) {
  const result = new Array(values.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(count, values.length) }, async () => {
    while (index < values.length) { const i = index++; result[i] = await callback(values[i]); }
  }));
  return result;
}
export function createCloudStorage(client, user, cache = null) {
  const bucket = client.storage.from(BUCKET);
  const blobs = new WeakMap(), records = new Map(), downloads = new Map();
  const deletedPaths = new Set();
  async function decode(value) {
    if (!value || typeof value !== 'object') return value;
    if (value.__manageFile) {
      if (!value.__manageFile.startsWith(`${user.id}/`)) throw new Error('Invalid file ownership.');
      const path = value.__manageFile;
      if (!downloads.has(path)) downloads.set(path, (async () => {
        const cached = await cache?.get(path);
        if (cached instanceof Blob) return cached;
        const blob = throwIfError(await bucket.download(path));
        await cache?.put(path, blob);
        return blob;
      })().catch(error => { downloads.delete(path); throw error; }));
      const blob = await downloads.get(path);
      blobs.set(blob, value.__manageFile);
      return blob;
    }
    if (Array.isArray(value)) return Promise.all(value.map(decode));
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await decode(child)])));
  }
  async function encode(value, uploaded) {
    if (value instanceof Blob) {
      let path = blobs.get(value);
      if (deletedPaths.has(path)) path = null;
      if (!path) {
        path = `${user.id}/${crypto.randomUUID()}`;
        throwIfError(await bucket.upload(path, value, { contentType: value.type || 'application/octet-stream', upsert: false }));
        blobs.set(value, path); uploaded.push({ blob: value, path });
      }
      return { __manageFile: path };
    }
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const result = [];
      for (const child of value) result.push(await encode(child, uploaded));
      return result;
    }
    const entries = [];
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'blobUrl' && child !== undefined) entries.push([key, await encode(child, uploaded)]);
    }
    return Object.fromEntries(entries);
  }
  return {
    cloud: true,
    async remove(ids) {
      if (!ids.length) return;
      const previous = new Set();
      for (const id of ids) attachmentPaths(records.get(id), previous);
      throwIfError(await client.from('library_documents').delete().eq('owner_id', user.id).in('id', ids));
      for (const id of ids) records.delete(id);
      const referenced = new Set();
      for (const record of records.values()) attachmentPaths(record, referenced);
      const unused = [...previous].filter(path => !referenced.has(path));
      if (unused.length) {
        for (const path of unused) downloads.delete(path);
        for (const path of unused) deletedPaths.add(path);
        await cache?.remove(unused);
        const { error } = await bucket.remove(unused);
        if (error) console.error('Unable to remove deleted private attachments:', error);
      }
    },
    async hydrate(document) {
      async function visit(value) {
        if (!value || typeof value !== 'object' || value instanceof Blob) return value;
        if (value.__manageFile) return decode(value);
        await Promise.all(Object.keys(value).map(async key => {
          const original = value[key];
          const hydrated = await visit(original);
          // A background download must never overwrite an edit or resurrect
          // an attachment removed while its request was in flight.
          if (value[key] === original) value[key] = hydrated;
        }));
        return value;
      }
      return visit(document);
    },
    async read({ metadataOnly = false } = {}) {
      const rows = [];
      for (let start = 0; ; start += 500) {
        const page = throwIfError(await client.from('library_documents').select('id,document').eq('owner_id', user.id).order('id').range(start, start + 499));
        rows.push(...page); if (page.length < 500) break;
      }
      const result = await mapLimited(rows, async row => {
        records.set(row.id, row.document);
        return metadataOnly ? structuredClone(row.document) : decode(row.document);
      });
      return result;
    },
    async save(documents) {
      const uploaded = [], previous = new Set();
      try {
        const encoded = [];
        for (const document of documents) {
          attachmentPaths(records.get(document.id), previous);
          encoded.push({ owner_id: user.id, id: document.id, document: await encode(document, uploaded) });
        }
        throwIfError(await client.from('library_documents').upsert(encoded, { onConflict: 'owner_id,id' }));
        for (const row of encoded) records.set(row.id, row.document);
      } catch (error) {
        for (const item of uploaded) blobs.delete(item.blob);
        if (uploaded.length) await bucket.remove(uploaded.map(item => item.path));
        throw error;
      }
      const referenced = new Set();
      for (const record of records.values()) attachmentPaths(record, referenced);
      const unused = [...previous].filter(path => !referenced.has(path));
      if (unused.length) {
        for (const path of unused) downloads.delete(path);
        for (const path of unused) deletedPaths.add(path);
        await cache?.remove(unused);
        const { error } = await bucket.remove(unused);
        if (error) console.error('Unable to remove unused private attachments:', error);
      }
    },
  };
}
