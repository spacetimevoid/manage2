// Disposable copies, separate from the library/import database. Cache keys are
// scoped to the authenticated project/user and immutable cloud object paths.
export function createAttachmentCache(scope, factory = globalThis.indexedDB, maxBytes = 64 * 1024 * 1024) {
  let connection;
  function open() {
    if (!factory) return Promise.reject(new Error('Cache unavailable'));
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = factory.open(`manage-file-cache:${scope}`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'path' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = null; };
        resolve(db);
      };
    }).catch(error => { connection = null; throw error; });
    return connection;
  }
  async function transaction(work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error);
      work(tx.objectStore('files'), value => { result = value; });
    });
  }
  return {
    async get(path) {
      try {
        return await transaction((store, result) => {
          const request = store.get(path);
          request.onsuccess = () => {
            const record = request.result;
            if (record) { record.used = Date.now(); store.put(record); result(record.blob); }
          };
        });
      } catch { return undefined; }
    },
    async put(path, blob) {
      if (blob.size > maxBytes) return;
      try {
        await transaction(store => {
          const request = store.getAll();
          request.onsuccess = () => {
            const records = request.result.filter(record => record.path !== path).sort((a, b) => a.used - b.used);
            let bytes = records.reduce((total, record) => total + record.blob.size, blob.size);
            for (const record of records) {
              if (bytes <= maxBytes) break;
              store.delete(record.path); bytes -= record.blob.size;
            }
            store.put({ path, blob, used: Date.now() });
          };
        });
      } catch { /* Storage disabled/full must never prevent opening a file. */ }
    },
    async remove(paths) {
      try { await transaction(store => { for (const path of paths) store.delete(path); }); } catch {}
    },
    async close() { if (connection) { (await connection).close(); connection = null; } },
  };
}
