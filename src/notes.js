import './notes.css';
import { PAGE_SIZE, readerHash, escapeHtml } from './library.js';
import { createSubjectTags, hasSubject } from './subject-tags.js';
import { rowSubjectTags } from './problem-label.js';
import { fadeDeleted, revealRestored } from './deletion.js';
import { noteTitle, readNoteFile, validNoteId } from './note-file.js';

export function createNotesPage({ store, deletionHistory, contextMenu, showTags }) {
  const $ = id => document.getElementById(id);
  const listPage = $('notesListPage'), detailPage = $('notesDetailPage');
  const list = $('noteList'), sidebar = $('noteSubjects'), reader = $('noteRead');
  const form = $('noteForm'), titleInput = $('noteTitleInput'), markdownInput = $('noteMarkdownInput');
  const preview = $('notePreview'), error = $('noteError'), editors = $('noteEditors');
  const tabs = [...$('noteTabs').children];
  const compact = matchMedia('(max-width: 700px)');
  const tagNames = () => [...new Set(notes.flatMap(note => note.subjects))].sort((a, b) => a.localeCompare(b));
  const tagInput = createSubjectTags($('noteTagField'), {
    id: 'noteSubjectsInput', allowEmpty: true, hideSelected: true, getSuggestions: tagNames,
  });

  let notes = [], note = null, baseline = null;
  let subject = 'all', page = 1, route = '', listVersion = 0, routeVersion = 0;
  let editVersion = 0, importVersion = 0, previewVersion = 0, previewTimer, saving = false;
  let rendererPromise;

  function renderList() {
    const names = tagNames();
    if (subject !== 'all' && !names.includes(subject)) { subject = 'all'; page = 1; }
    const buckets = new Map();
    for (const entry of notes) {
      for (const name of entry.subjects) buckets.set(name, (buckets.get(name) ?? 0) + 1);
    }
    sidebar.innerHTML = [['all', 'All', notes.length], ...names.map(name => [name, name, buckets.get(name)])]
      .map(([value, label, count]) => `<button type="button" class="subject-item ${value === subject ? 'is-active' : ''}" data-subject="${escapeHtml(value)}" aria-current="${value === subject ? 'true' : 'false'}"><span class="subject-name">${escapeHtml(label)}</span><span class="subject-count">${count}</span></button>`).join('');
    const visible = notes.filter(entry => subject === 'all' || hasSubject(entry, subject))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    const total = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    page = Math.min(page, total);
    list.innerHTML = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(entry =>
      `<div class="file-row" data-id="${escapeHtml(entry.id)}"><div class="file-info"><div class="filename"><a class="source-file-link" href="${escapeHtml(readerHash('notes', entry.id))}">${escapeHtml(entry.title)}</a>${rowSubjectTags(entry)}</div></div></div>`
    ).join('') || ($('noteListStatus').textContent ? '' : '<div class="sidebar-empty">No notes in this subject</div>');
    $('notePagination').hidden = total <= 1;
    $('notePageInfo').textContent = `${page} / ${total}`;
    $('notePrevPage').disabled = page <= 1;
    $('noteNextPage').disabled = page >= total;
  }

  async function refreshList(announce = true) {
    const version = ++listVersion;
    if (announce) $('noteListStatus').textContent = 'Loading notes…';
    try {
      const items = await store.list();
      if (version !== listVersion) return;
      notes = items;
      $('noteListStatus').textContent = '';
      renderList();
    } catch {
      if (version === listVersion) $('noteListStatus').textContent = 'Unable to load notes. Reopen Notes to try again.';
    }
  }

  function updateList(saved, removedId = saved?.id) {
    $('noteListStatus').textContent = '';
    notes = notes.filter(entry => entry.id !== removedId);
    if (saved) {
      const { markdown, ...summary } = saved;
      notes.push(summary);
    }
    renderList();
    void refreshList(false);
  }

  async function renderMarkdown(target, markdown, isCurrent) {
    try {
      rendererPromise ??= Promise.all([import('./notes-markdown.js'), import('katex/dist/katex.min.css')]).then(([module]) => module);
      const { renderNoteMarkdown } = await rendererPromise;
      if (isCurrent()) target.innerHTML = renderNoteMarkdown(markdown);
    } catch {
      rendererPromise = null;
      if (isCurrent()) target.textContent = markdown;
    }
  }

  function selectPane(index, focus = false) {
    editors.dataset.pane = index === 0 ? 'edit' : 'preview';
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(index === i));
      tab.tabIndex = index === i ? 0 : -1;
    });
    if (focus) tabs[index].focus();
  }

  function labelPanes() {
    for (const tab of tabs) {
      const pane = $(tab.getAttribute('aria-controls'));
      if (compact.matches) {
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', tab.id);
      } else {
        pane.removeAttribute('role');
        pane.removeAttribute('aria-labelledby');
      }
    }
  }
  compact.addEventListener('change', labelPanes);
  labelPanes();

  function showDetail() {
    listPage.hidden = true;
    detailPage.hidden = false;
  }

  function showReader() {
    showDetail();
    closeEditor();
    error.textContent = '';
    const current = note;
    $('noteHeading').textContent = current.title;
    document.title = current.title + ' · Notes';
    $('noteEditBtn').hidden = false;
    $('noteReadTags').replaceChildren(...current.subjects.map(name => {
      const tag = document.createElement('span');
      tag.className = 'subject-tag';
      tag.textContent = name;
      return tag;
    }));
    reader.hidden = false;
    $('noteContent').replaceChildren();
    void renderMarkdown($('noteContent'), current.markdown, () => current === note && form.hidden);
  }

  function queuePreview(immediate = false) {
    clearTimeout(previewTimer);
    const version = ++previewVersion;
    const draw = () => void renderMarkdown(preview, markdownInput.value, () => version === previewVersion && !form.hidden);
    if (immediate) draw();
    else previewTimer = setTimeout(draw, 100);
  }

  function showEditor(source = null, imported = null) {
    showDetail();
    baseline = source ?? { title: '', markdown: '', subjects: [] };
    ++editVersion;
    $('noteHeading').textContent = source ? source.title : 'New note';
    $('noteEditBtn').hidden = true;
    reader.hidden = true;
    titleInput.value = imported?.title ?? baseline.title;
    markdownInput.value = imported?.markdown ?? baseline.markdown;
    tagInput.set(baseline.subjects, true);
    error.textContent = '';
    form.hidden = false;
    preview.replaceChildren();
    selectPane(0);
    queuePreview(true);
    (source || imported ? markdownInput : titleInput).focus({ preventScroll: true });
  }

  function closeEditor() {
    ++editVersion;
    ++previewVersion;
    clearTimeout(previewTimer);
    baseline = null;
    form.hidden = true;
    tagInput.set([], false);
  }

  function isDirty() {
    if (!baseline) return false;
    if (baseline.title !== titleInput.value || baseline.markdown !== markdownInput.value || $('noteSubjectsInput').value.trim()) return true;
    return JSON.stringify(baseline.subjects) !== JSON.stringify(tagInput.get());
  }

  function canNavigate(hash) {
    if (!route || hash === route) return true;
    if (saving || (isDirty() && !window.confirm('Discard unsaved changes to this note?'))) {
      history.replaceState(null, '', route);
      return false;
    }
    return true;
  }

  async function open(id, hash) {
    if (route === hash) return;
    route = hash;
    const version = ++routeVersion;
    ++importVersion;
    closeEditor();
    note = null;
    error.textContent = '';
    document.title = 'Notes';
    void refreshList();
    if (id === null) {
      detailPage.hidden = true;
      listPage.hidden = false;
      renderList();
      return;
    }
    showDetail();
    reader.hidden = true;
    $('noteHeading').textContent = 'Notes';
    $('noteEditBtn').hidden = true;
    try {
      const loaded = validNoteId(id) ? await store.read(id) : null;
      if (version !== routeVersion) return;
      if (!loaded) { error.textContent = 'Note not found.'; return; }
      note = loaded;
      showReader();
    } catch {
      if (version === routeVersion) error.textContent = 'Unable to open this note.';
    }
  }

  function leave() {
    if (!route) return;
    route = '';
    ++routeVersion;
    ++importVersion;
    ++listVersion;
    listPage.hidden = detailPage.hidden = true;
    closeEditor();
    note = null;
  }

  window.addEventListener('beforeunload', event => {
    if (!saving && !isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  $('noteNewBtn').onclick = () => { ++importVersion; showEditor(); };
  $('noteUploadBtn').onclick = () => $('noteFileInput').click();
  $('noteFileInput').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const version = ++importVersion;
    try {
      const imported = await readNoteFile(file);
      if (version === importVersion) showEditor(null, imported);
    } catch (failure) {
      if (version === importVersion) $('noteListStatus').textContent = failure.message;
    }
  };
  $('noteEditBtn').onclick = () => showEditor(note);
  function cancelEditor() {
    if (saving) return;
    if (isDirty() && !window.confirm('Discard unsaved changes to this note?')) return;
    if (note) return showReader();
    closeEditor();
    detailPage.hidden = true;
    listPage.hidden = false;
    $('noteNewBtn').focus();
  }
  $('noteCancelBtn').onclick = cancelEditor;
  $('noteBackLink').onclick = event => {
    if (route !== '#notes' || !baseline) return;
    event.preventDefault();
    cancelEditor();
  };
  markdownInput.addEventListener('input', () => queuePreview());
  tabs.forEach((tab, index) => {
    tab.onclick = () => selectPane(index);
    tab.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selectPane(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index, true);
    };
  });

  form.onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    const title = noteTitle(titleInput.value);
    if (!title) { error.textContent = 'Enter a title.'; titleInput.focus(); return; }
    const version = editVersion;
    const fieldset = $('noteFields');
    try {
      const draft = { id: note?.id ?? crypto.randomUUID(), title, markdown: markdownInput.value, subjects: tagInput.get() };
      saving = fieldset.disabled = true;
      error.textContent = '';
      const saved = note ? await store.update({ ...draft, revision: note.revision }) : await store.add(draft);
      const entryHash = readerHash('notes', saved.id);
      if (version !== editVersion) return;
      if (route !== entryHash) history.pushState(null, '', entryHash);
      route = entryHash;
      note = saved;
      updateList(saved);
      showReader();
    } catch (failure) {
      if (version === editVersion) error.textContent = failure.message || 'Unable to save this note.';
    } finally { saving = fieldset.disabled = false; }
  };

  sidebar.onclick = event => {
    const button = event.target.closest('[data-subject]');
    if (!button) return;
    subject = button.dataset.subject;
    page = 1;
    renderList();
    [...sidebar.children].find(item => item.dataset.subject === subject)?.focus();
  };
  $('notePrevPage').onclick = () => { --page; renderList(); };
  $('noteNextPage').onclick = () => { ++page; renderList(); };

  list.onclick = event => {
    const row = event.target.closest('[data-id]');
    if (!row) return;
    const button = event.target.closest('[data-problem-tags]');
    if (button) {
      const entry = notes.find(item => item.id === row.dataset.id);
      if (entry) showTags(button, entry);
    } else if (!event.target.closest('a') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      row.querySelector('a').click();
    }
  };

  function openRowMenu(event, row, position = event) {
    const entry = notes.find(item => item.id === row.dataset.id);
    if (!entry) return;
    event.preventDefault();
    contextMenu.open(position, [{ label: 'Delete', run: () => deletionHistory.remove(`Delete “${entry.title}”?`, async () => {
      const removed = await store.remove(entry.id, entry.revision);
      const cleanup = await fadeDeleted([row]);
      updateList(null, entry.id);
      cleanup();
      return async () => {
        const restored = await store.add(removed);
        updateList(restored);
        const restoredRow = [...list.children].find(item => item.dataset.id === restored.id);
        if (!listPage.hidden) await revealRestored([restoredRow]);
      };
    }) }]);
  }

  list.addEventListener('contextmenu', event => {
    const row = event.target.closest('[data-id]');
    if (row) openRowMenu(event, row);
  });
  list.addEventListener('keydown', event => {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    const row = event.target.closest('[data-id]');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    openRowMenu(event, row, { target: event.target, clientX: rect.left, clientY: rect.bottom });
  });

  return { open, leave, canNavigate };
}
