const summaryFields = 'id,title,subjects,revision,updated_at';
const detailFields = `${summaryFields},markdown`;
const changedMessage = 'This note changed in another session. Your changes are still here.';

function resultOf({ data, error }) {
  if (error) throw error;
  return data;
}

function requireCurrent(row) {
  if (!row) throw new Error(changedMessage);
  return row;
}

export function createCloudNotes(client, ownerId) {
  const table = () => client.from('library_notes');
  const owned = () => table().select(detailFields).eq('owner_id', ownerId);
  return {
    async list() {
      const notes = [];
      for (let offset = 0; ; offset += 500) {
        const page = resultOf(await table().select(summaryFields).eq('owner_id', ownerId)
          .order('id').range(offset, offset + 499));
        notes.push(...page);
        if (page.length < 500) return notes;
      }
    },
    async read(id) {
      return resultOf(await owned().eq('id', id).maybeSingle());
    },
    async add({ id, title, markdown, subjects, updated_at }) {
      return resultOf(await table().insert({
        owner_id: ownerId, id, title, markdown, subjects, ...(updated_at ? { updated_at } : {}),
      }).select(detailFields).single());
    },
    async update({ id, title, markdown, subjects, revision }) {
      const row = resultOf(await table().update({
        title, markdown, subjects, revision: crypto.randomUUID(), updated_at: new Date().toISOString(),
      }).eq('owner_id', ownerId).eq('id', id).eq('revision', revision).select(detailFields).maybeSingle());
      return requireCurrent(row);
    },
    async remove(id, revision) {
      const row = resultOf(await table().delete().eq('owner_id', ownerId).eq('id', id)
        .eq('revision', revision).select(detailFields).maybeSingle());
      return requireCurrent(row);
    },
  };
}

export function createLocalNotes(factory = indexedDB) {
  let database;
  function open() {
    return database ??= new Promise((resolve, reject) => {
      const request = factory.open('manage-markdown-notes', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('notes', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(request.error); };
    });
  }

  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('notes', mode);
      let result, error;
      const store = transaction.objectStore('notes');
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(error || transaction.error);
      function read(request, transform = value => value) {
        request.onsuccess = () => {
          try { result = transform(request.result); }
          catch (failure) { error = failure; transaction.abort(); }
        };
      }
      action(store, read);
    });
  }

  const withRevision = note => ({ ...note, revision: crypto.randomUUID() });
  function change(id, revision, action) {
    return transact('readwrite', (store, read) => read(store.get(id), current => {
      requireCurrent(current?.revision === revision && current);
      action(store, read, current);
    }));
  }

  return {
    async list() {
      const notes = await transact('readonly', (store, read) => read(store.getAll()));
      return notes.map(({ id, title, subjects, revision, updated_at }) => ({ id, title, subjects, revision, updated_at }));
    },
    read(id) { return transact('readonly', (store, read) => read(store.get(id))); },
    add(note) {
      const row = withRevision({ ...note, updated_at: note.updated_at || new Date().toISOString() });
      return transact('readwrite', (store, read) => read(store.add(row), () => row));
    },
    update(note) {
      const row = withRevision({ ...note, updated_at: new Date().toISOString() });
      return change(note.id, note.revision, (store, read) => read(store.put(row), () => row));
    },
    remove(id, revision) {
      return change(id, revision, (store, read, current) => read(store.delete(id), () => current));
    },
  };
}
