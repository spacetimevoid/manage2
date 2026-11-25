import { problemSummary, createProblemTagsPopover } from './problem-label.js';
import { subjectLabel } from './subject-picker.js';
import { installBrowsePaste } from './browse-paste.js';
import { suggestProblemTags } from './problem-tag-suggestions.js';
import { createSubjectTags, documentSubjects, hasSubject } from './subject-tags.js';
import './subject-tags.css';
import { createTopicPicker, existingTopics } from './topic-picker.js';
import { captureListMotion } from './list-motion.js';
import { createDeletionHistory, createDeleteConfirmation, installDeleteUndo, fadeDeleted, revealRestored } from './deletion.js';
import './deletion.css';
import { createMediaPreloader } from './media-preloader.js';
import { createPdfSession } from './pdf-session.js';
import { renderPdfText } from './pdf-text.js';
import './topic-picker.css';
import { selectedRegion, cropPage } from './source-extraction.js';
import { createSourceOutline } from './source-outline.js';
import './source-extraction.css';
import { enableSubjectDrag } from './subject-drag.js';
import { createSubjectModal } from './subject-modal.js';
import { normalizeSubject, todayDate, renamedDocument, documentTitle, validateDocumentName, difficultyLabel, normalizedDifficulty } from './metadata.js';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createProblemDetail } from './problem-detail.js';
import { closeReader } from './reader-transition.js';
import { validateUpload, uploadName, isImageFile } from './uploads.js';
import { createContextMenu } from './context-menu.js';
import './context-menu.css';
import { problemTitle } from './problem-data.js';
import { escapeHtml as esc, parseDate, queryFiles, validatePdf, viewFromHash, collectionFiles, dateOf, readerRoute, readerHash, snapshotDocument, subjectNames, subjectRecords, makeSubject, reorderedSubjects } from './library.js';
import { openLibrary, readDocuments, saveDocuments, deleteDocuments } from './storage.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
const $ = id => document.getElementById(id);
const app = document.querySelector('.manage-shell');
const showProblemTags = createProblemTagsPopover();
let activeView = viewFromHash(location.hash);
const viewName = () => activeView === 'problems' ? 'Problems' : 'Sources';
const visibleFiles = () => collectionFiles(files, activeView);
let db, files = [], activeSubject = 'all', searchQuery = '', sortKey = null, sortDir = 'asc', currentPage = 1;
let activeFile = null, pdfDoc = null, loadingTask = null, viewerPage = 1, zoom = 100, viewerToken = 0;
let isPageNavigation = false;
let viewerClosing = false;
let viewerClosePromise = null, libraryReady = false, routeSequence = 0;
let zoomFrame = null;
let observer = null, renderTasks = new Set(), notesOpen = true, selectMode = false, selection = null;
let lastFocus, noteTimer, saveQueue = Promise.resolve();
const mediaLoader = createMediaPreloader(file => db?.cloud ? db.hydrate(file) : file);
const pdfSession = createPdfSession(pdfjsLib);
const deletionHistory = createDeletionHistory(createDeleteConfirmation());
installDeleteUndo(deletionHistory);
$('pdfCanvasViewport').setAttribute('aria-live', 'off');
$('pdfViewerPage').setAttribute('role', 'dialog');
$('pdfViewerPage').setAttribute('aria-modal', 'true');
$('pdfNotesTextarea').setAttribute('aria-label', 'Document notes');

function subjects() { return subjectNames(files, activeView); }
function renderSidebar(animate = true) {
  const list = $('subjectList');
  // Subjects with the same name in different collections are separate rows.
  // Moving them from the old collection's positions can briefly overflow the
  // shorter destination list and create a scrollbar during the transition.
  const finishMotion = animate ? captureListMotion(list, { move: list.dataset.collection === activeView }) : () => {};
  list.dataset.collection = activeView;
  if (activeSubject !== 'all' && !subjects().includes(activeSubject)) { activeSubject = 'all'; currentPage = 1; }
  const q = searchQuery.trim().toLocaleLowerCase();
  const documents = visibleFiles();
  const rows = [{ name: 'all', label: 'All', count: documents.length }, ...subjects().map(s => ({ name: s, label: activeView === 'problems' ? subjectLabel(s) : s, count: documents.filter(f => hasSubject(f, s)).length }))];
  $('subjectList').innerHTML = rows.filter(s => s.label.toLocaleLowerCase().includes(q)).map(s => `<button type="button" class="subject-item ${s.name === activeSubject ? 'is-active' : ''}" data-subject="${esc(s.name)}" draggable="${s.name !== 'all'}" aria-current="${s.name === activeSubject ? 'page' : 'false'}"><span class="subject-name">${esc(s.label)}</span><span class="subject-count">${s.count}</span></button>`).join('') || '<div class="sidebar-empty">No subjects found</div>';
  $('modalSubjectsDatalist').innerHTML = subjects().map(s => `<option value="${esc(s)}"></option>`).join('');
  finishMotion();
}
function renderFiles(animate = true) {
  const finishMotion = animate ? captureListMotion($('fileList')) : () => {};
  const result = queryFiles(visibleFiles(), { subject: activeSubject, sortKey, sortDir, page: currentPage });
  currentPage = result.page;
  $('fileList').innerHTML = result.items.map(f => `<${activeView === 'problems' ? 'div role="link" tabindex="0"' : 'a'} class="file-row" href="${esc(readerHash(activeView, f.id))}" data-id="${esc(f.id)}"><div class="file-info"><span class="filename">${activeView === 'problems' ? problemSummary(f) : esc(f.name)}</span></div><span class="topic-cell">${esc(f.topic)}</span><span class="due-date">${esc(dateOf(f))}</span><div class="status-cell"><span class="${activeView === 'problems' ? `difficulty difficulty-${esc(normalizedDifficulty(f.difficulty))}` : `badge ${f.done ? 'badge-done' : 'badge-pending'}`}">${activeView === 'problems' ? difficultyLabel(f.difficulty) : f.done ? 'Completed' : 'Pending'}</span></div></${activeView === 'problems' ? 'div' : 'a'}>`).join('') || '<div class="sidebar-empty" style="padding: 18px 10px;">No files in this subject</div>';
  $('paginationBar').hidden = result.pages <= 1;
  $('paginationInfo').textContent = `${result.page} / ${result.pages}`;
  $('prevPageBtn').disabled = currentPage <= 1;
  $('nextPageBtn').disabled = currentPage >= result.pages;
  $('breadcrumbDynamic').hidden = activeSubject === 'all';
  $('breadcrumbSubject').textContent = activeSubject === 'all' ? '' : activeSubject;
  if (!readerRoute(location.hash).id) mediaLoader.warm(result.items);
  finishMotion();
}
function renderView() {
  const problems = activeView === 'problems';
  app.classList.toggle('is-problems', problems);
  document.querySelector('[data-sort="name"] span').textContent = problems ? 'Problem' : 'File name';
  $('breadcrumbReset').textContent = viewName();
  document.title = viewName();
  document.querySelectorAll('[data-view]').forEach(link => {
    if (link.dataset.view === activeView) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('[data-sort="date"] span').textContent = problems ? 'Added Date' : 'Due Date';
  const status = document.querySelector('.footer-status');
  status.dataset.sort = problems ? 'difficulty' : 'status';
  status.querySelector('span').textContent = problems ? 'Difficulty' : 'Status';
  document.querySelector('[data-sort="date"]').setAttribute('aria-label', problems ? 'Sort by added date' : 'Sort by due date');
  status.setAttribute('aria-label', problems ? 'Sort by difficulty' : 'Sort by status');
  renderSidebar(); renderFiles();
}
function rememberReader(file) {
  const view = file.kind === 'problem' ? 'problems' : 'sources';
  const hash = readerHash(view, file.id);
  history.replaceState(location.hash === hash ? history.state : null, '', hash);
}
function forgetReader(file) {
  const route = readerRoute(location.hash);
  const view = file.kind === 'problem' ? 'problems' : 'sources';
  // Closing an old reader must not overwrite a newer navigation destination.
  if (route.view === view && route.id === file.id) history.replaceState(null, '', readerHash(view));
}
async function applyRoute() {
  if (!libraryReady) return;
  const route = readerRoute(location.hash), sequence = ++routeSequence;
  if (problemDetail.isOpen && (route.view !== 'problems' || route.id !== problemDetail.activeId)) await problemDetail.close();
  if (activeFile && (route.view !== 'sources' || route.id !== activeFile.id)) await closeViewer();
  if (viewerClosing) await viewerClosePromise;
  if (sequence !== routeSequence) return;
  if (activeView !== route.view) {
    activeView = route.view; activeSubject = 'all'; currentPage = 1; sortKey = null; sortDir = 'asc';
    searchQuery = ''; $('subjectSearch').value = ''; $('searchClear').classList.remove('is-visible');
    document.querySelectorAll('.sort-btn').forEach(btn => { btn.classList.remove('is-active'); delete btn.dataset.dir; });
  }
  renderView();
  if (!route.id) return;
  const file = collectionFiles(files, route.view).find(file => file.id === route.id);
  if (!file) { history.replaceState(null, '', readerHash(route.view)); return; }
  if (file.kind === 'problem') {
    if (problemDetail.activeId !== file.id) await problemDetail.open(file);
  } else if (activeFile?.id !== file.id) await openViewer(file);
}
window.addEventListener('hashchange', () => applyRoute().catch(error => console.error('Unable to restore reader:', error)));
function openProblemSource(problem) {
  const sourceId = problem.sourceLocation.sourceId;
  history.pushState({ returnProblemId: problem.id }, '', readerHash('sources', sourceId));
  return applyRoute().catch(error => console.error('Unable to open the original source:', error));
}
function sourceReturnProblem(source) {
  if (!source || location.hash !== readerHash('sources', source.id)) return null;
  const problemId = history.state?.returnProblemId;
  return files.find(file => file.kind === 'problem' && file.id === problemId && file.sourceLocation?.sourceId === source.id);
}
function backFromSource() {
  if (sourceReturnProblem(activeFile)) return history.back();
  return closeViewer();
}
function selectSubject(subject) {
  activeSubject = subject; currentPage = 1;
  renderSidebar(); renderFiles();
}
$('subjectList').addEventListener('click', e => {
  const btn = e.target.closest('[data-subject]');
  if (btn) selectSubject(btn.dataset.subject);
});
$('subjectSearch').addEventListener('input', e => {
  searchQuery = e.target.value;
  $('searchClear').classList.toggle('is-visible', !!searchQuery);
  renderSidebar();
});
$('searchClear').addEventListener('click', () => {
  searchQuery = ''; $('subjectSearch').value = ''; $('searchClear').classList.remove('is-visible');
  renderSidebar(); $('subjectSearch').focus();
});
$('breadcrumbReset').addEventListener('click', () => selectSubject('all'));
document.querySelectorAll('.sort-btn').forEach(btn => btn.addEventListener('click', () => {
  sortDir = sortKey === btn.dataset.sort && sortDir === 'asc' ? 'desc' : 'asc';
  sortKey = btn.dataset.sort; currentPage = 1;
  document.querySelectorAll('.sort-btn').forEach(b => {
    b.classList.toggle('is-active', b === btn);
    b.dataset.dir = b === btn ? sortDir : '';
    b.setAttribute('aria-label', `Sort by ${b.dataset.sort}${b === btn ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`);
  });
  renderFiles();
}));
$('prevPageBtn').onclick = () => { currentPage--; renderFiles(); };
$('nextPageBtn').onclick = () => { currentPage++; renderFiles(); };

// Serialize snapshots so an earlier note edit can never overwrite a later edit.
function persist(file) {
  const snapshot = snapshotDocument(file);
  const result = saveQueue.catch(() => {}).then(() => {
    if (!db) throw new Error('Browser storage is unavailable.');
    return saveDocuments(db, [snapshot]);
  });
  saveQueue = result;
  return result;
}
const problemDetail = createProblemDetail({
  getFile: id => files.find(file => file.id === id),
  getSubjects: () => [...subjectNames(files, 'sources'), ...subjectNames(files, 'problems')],
  deletionHistory,
  persist,
  prepare: file => mediaLoader.load(file),
  background: app,
  getItems: () => queryFiles(collectionFiles(files, 'problems'), { subject: activeSubject, sortKey, sortDir }).allItems,
  onChange: () => { renderSidebar(); renderFiles(); },
  onOpen(file) { mediaLoader.warm([]); rememberReader(file); },
  onClose: forgetReader,
  onOpenSource: openProblemSource,
  async checkPdf(blob) {
    await validatePdf(blob);
    const task = pdfjsLib.getDocument({ data: await blob.arrayBuffer() });
    try { await task.promise; } finally { await task.destroy(); }
  },
});
function saveNote() {
  clearTimeout(noteTimer);
  if (!activeFile) return;
  const file = activeFile;
  $('pdfNotesSavedLabel').textContent = 'Saving…';
  persist(file).then(() => {
    if (activeFile === file) $('pdfNotesSavedLabel').textContent = file.notes?.trim() ? 'Saved' : 'Empty';
  }).catch(() => {
    if (activeFile === file) $('pdfNotesSavedLabel').textContent = 'Save failed';
    console.error('Could not save changes. Check browser storage space and permissions.');
  });
}
$('pdfNotesTextarea').oninput = () => {
  if (!activeFile) return;
  activeFile.notes = $('pdfNotesTextarea').value;
  $('pdfNotesSavedLabel').textContent = 'Unsaved';
  clearTimeout(noteTimer); noteTimer = setTimeout(saveNote, 300);
};
document.addEventListener('visibilitychange', () => { if (document.hidden && activeFile) saveNote(); });

function setModal(open, file = null, extraction = null) {
  topicPicker.close();
  const wasExtracting = !!setModal.extraction;
  setModal.extraction = open ? extraction : null;
  if (open) $('uploadModalBackdrop').classList.toggle('is-extracting', !!extraction);
  if (extraction || wasExtracting) $('pdfViewerPage').inert = open;
  setModal.file = open ? file : null;
  if (open) setModal.view = file ? (file.kind === 'problem' ? 'problems' : 'sources') : extraction ? 'problems' : activeView;
  if (open) $('uploadModalBackdrop').classList.toggle('is-editing', !!file);
  $('uploadModalBackdrop').classList.toggle('is-open', open);
  $('uploadModalBackdrop').setAttribute('aria-hidden', String(!open));
  app.inert = open || wasExtracting;
  document.body.style.overflow = open || wasExtracting ? 'hidden' : '';
  if (open) {
    setModal.returnFocus = document.activeElement;
    $('uploadPdfForm').reset(); $('pdfFileInput').value = '';
    setModal.pastedFile = null;
    $('modalCollectionName').textContent = setModal.view === 'problems' ? 'Problems' : 'Sources';
    $('modalDifficultyField').hidden = setModal.view !== 'problems';
    const problems = setModal.view === 'problems';
    $('uploadModalBackdrop').classList.toggle('is-problems', problems);
    subjectTags.set(file ? documentSubjects(file) : extraction ? documentSubjects(extraction.source) : activeSubject === 'all' ? [] : [activeSubject], problems);
    document.querySelector('label[for="modalBrowseBtn"]').textContent = problems ? 'Select problem' : 'Select source';
    $('pdfFileInput').accept = problems ? 'image/*,application/pdf,.pdf' : 'application/pdf,.pdf';
    $('modalPathFileNameInput').placeholder = problems ? 'new-problem' : 'new-file';
    document.querySelector('label[for="modalDueDateInput"]').textContent = problems ? 'Added date' : 'Due date';
    document.querySelector('label[for="modalDueDateInput"]').closest('.modal-field').hidden = problems;
    $('modalPathSubjectInput').value = activeSubject === 'all' ? '' : activeSubject;
    $('modalPathFileNameInput').value = '';
    $('modalDueDateInput').value = todayDate();
    $('modalErrorMsg').textContent = '';
    $('modalFileStatus').textContent = 'No file selected';
    if (file) {
      $('modalPathSubjectInput').value = file.subject;
      $('modalPathFileNameInput').value = documentTitle(file.name);
      $('modalTopicInput').value = file.topic;
      $('modalDueDateInput').value = dateOf(file) || '';
      $('modalDifficultyInput').value = normalizedDifficulty(file.difficulty);
    }
    if (extraction) {
      $('modalPathSubjectInput').value = extraction.source.subject;
      $('modalTopicInput').value = extraction.source.topic;
      $('modalFileStatus').textContent = extraction.blob.name;
    }
    if (problems) subjectTags.focus(); else $('modalPathFileNameInput').focus();
  } else setModal.returnFocus?.focus();
  resetTagSuggestion();
}
function selectedUpload() {
  return setModal.extraction?.blob || setModal.pastedFile || $('pdfFileInput').files?.[0];
}

let tagSuggestion;
function resetTagSuggestion() {
  tagSuggestion?.abort();
  tagSuggestion = null;
  const button = $('modalSuggestTagsBtn');
  button.hidden = setModal.view !== 'problems' || !!setModal.file;
  button.disabled = button.hidden || !isImageFile(selectedUpload()) || $('uploadPdfForm').querySelector('[type=submit]').disabled;
  button.textContent = 'Suggest tags';
}

$('modalSuggestTagsBtn').onclick = async () => {
  const button = $('modalSuggestTagsBtn');
  const file = selectedUpload();
  if (button.hidden || button.disabled || !isImageFile(file)) return;
  const request = new AbortController();
  tagSuggestion = request;
  button.disabled = true;
  button.textContent = 'Suggesting…';
  $('modalErrorMsg').textContent = '';
  try {
    const subjects = [...new Set([...subjectNames(files, 'problems'), ...subjectNames(files, 'sources')])];
    const tags = await suggestProblemTags(file, subjects, request.signal);
    if (request.signal.aborted) return;
    if (!tags.length) throw new Error('No tags suggested. You can add tags manually.');
    subjectTags.add(tags);
  } catch (error) {
    if (!request.signal.aborted) $('modalErrorMsg').textContent = error.message;
  } finally {
    if (tagSuggestion === request) {
      tagSuggestion = null;
      resetTagSuggestion();
    }
  }
};
$('uploadPdfBtn').onclick = () => setModal(true);
$('modalCancelBtn').onclick = () => setModal(false);
$('modalBrowseBtn').onclick = () => $('pdfFileInput').click();
$('pdfFileInput').onchange = () => {
  setModal.pastedFile = null;
  const file = selectedUpload();
  $('modalFileStatus').textContent = file?.name || 'No file selected';
  $('modalErrorMsg').textContent = '';
  resetTagSuggestion();
  if (file && !$('modalPathFileNameInput').value.trim()) $('modalPathFileNameInput').value = documentTitle(file.name);
};
for (const id of ['modalPathSubjectInput', 'modalPathFileNameInput']) $(id).onkeydown = e => {
  if (e.key === 'Enter') { e.preventDefault(); $('uploadPdfForm').requestSubmit(); }
};
$('uploadPdfForm').onsubmit = async e => {
  e.preventDefault();
  const submit = e.submitter || $('uploadPdfForm').querySelector('[type=submit]');
  if (submit.disabled) return;
  submit.disabled = true; $('modalCancelBtn').disabled = true;
  resetTagSuggestion();
  let validation;
  try {
    const editing = setModal.file;
    const view = setModal.view;
    const extraction = setModal.extraction;
    const blob = selectedUpload();
    if (!editing && !blob) throw new Error(view === 'problems' ? 'Please select an image or PDF.' : 'Please select a PDF file.');
    const problem = view === 'problems';
    const tags = problem ? subjectTags.get() : null;
    const topic = problem ? (editing?.topic || '') : $('modalTopicInput').value.trim() || 'General Notes';
    const difficulty = normalizedDifficulty($('modalDifficultyInput').value);
    const mediaType = editing ? null : (isImageFile(blob) && view === 'problems' ? 'image' : 'pdf');
    const subject = problem ? tags[0] : normalizeSubject($('modalPathSubjectInput').value);
    const name = problem ? (editing?.name || blob.name || `Problem-${crypto.randomUUID()}`) : editing ? renamedDocument($('modalPathFileNameInput').value, editing.name) : uploadName($('modalPathFileNameInput').value, blob, mediaType);
    if (!problem) validateDocumentName(name, subject, collectionFiles(files, view), editing?.id);
    let dueDate = view === 'problems' ? (editing?.addedDate || '') : $('modalDueDateInput').value.trim();
    if (Number.isNaN(parseDate(dueDate))) throw new Error('Enter a real date in dd/mm/yyyy format, or leave it blank.');
    if (!dueDate && !editing) dueDate = todayDate();
    if (editing) {
      const updated = { ...editing, name, subject, topic };
      if (problem) updated.subjects = tags;
      if (editing.kind === 'problem') { updated.addedDate = dueDate; updated.difficulty = difficulty; }
      else updated.dueDate = dueDate;
      await persist(updated);
      Object.assign(editing, updated);
      setModal(false); renderSidebar(); renderFiles(); renderSourceOutline();
      return;
    }
    await validateUpload(blob, view);
    const file = { id: crypto.randomUUID(), name, subject, topic, dueDate, done: false, notes: '', sample: false, createdAt: Date.now() };
    if (mediaType === 'pdf') {
      validation = pdfjsLib.getDocument({ data: await blob.arrayBuffer() });
      const doc = await validation.promise;
      file.blob = blob; file.pageCount = doc.numPages;
    } else {
      file.statementImages = [{ id: crypto.randomUUID(), name: blob.name, blob }];
    }
    if (view === 'problems') {
      file.kind = 'problem'; file.subjects = tags; file.addedDate = todayDate();
      file.difficulty = difficulty;
      delete file.dueDate;
    }
    if (extraction) {
      if (!files.some(source => source.id === extraction.location.sourceId)) throw new Error('The source no longer exists.');
      file.sourceLocation = extraction.location;
    }
    await persist(file);
    files.unshift(file);
    currentPage = 1;
    setModal(false); renderSidebar(); renderFiles(); renderSourceOutline();
  } catch (error) {
    $('modalErrorMsg').textContent = error.name === 'PasswordException' ? 'Password-protected PDFs are not supported yet.' : error.message || 'Unable to save file.';
  } finally {
    try { await validation?.destroy(); }
    finally {
      submit.disabled = false;
      $('modalCancelBtn').disabled = false;
      resetTagSuggestion();
    }
  }
};

const contextMenu = createContextMenu();
async function removeFiles(items) {
  return deletionHistory.remove(items.some(file => file.kind === 'subject') ? 'Delete this subject and all its sources/problems?' : 'Delete the selected source/problem?', async () => {
  // Keep complete attachments for undo before removing their private objects.
  for (const file of items) await mediaLoader.load(file);
  const saved = items.map(file => ({ file: snapshotDocument(file), index: files.indexOf(file) })).sort((a, b) => a.index - b.index);
  const ids = items.map(file => file.id);
  const result = saveQueue.catch(() => {}).then(() => deleteDocuments(db, ids));
  saveQueue = result;
  await result;
  const resetFade = await fadeDeleted([...document.querySelectorAll('[data-id], [data-subject]')].filter(element => ids.includes(element.dataset.id) || items.some(file => file.kind === 'subject' && file.subject === element.dataset.subject)));
  const removed = new Set(ids);
  files = files.filter(file => !removed.has(file.id));
  for (const file of items) if (file.blobUrl) URL.revokeObjectURL(file.blobUrl);
  if (activeSubject !== 'all' && !subjects().includes(activeSubject)) activeSubject = 'all';
  renderSidebar(false); renderFiles(false); renderSourceOutline(false);
  resetFade();
  return async () => {
    const result = saveQueue.catch(() => {}).then(() => saveDocuments(db, saved.map(entry => entry.file)));
    saveQueue = result; await result;
    for (const entry of saved) if (!files.some(file => file.id === entry.file.id)) files.splice(Math.max(0, entry.index), 0, entry.file);
    renderSidebar(false); renderFiles(false); renderSourceOutline(false);
    await revealRestored([...document.querySelectorAll('[data-id], [data-subject]')].filter(element => ids.includes(element.dataset.id) || items.some(file => file.kind === 'subject' && file.subject === element.dataset.subject)));
  };
  });
}
$('fileList').addEventListener('contextmenu', event => {
  const row = event.target.closest('[data-id]');
  const file = visibleFiles().find(file => file.id === row?.dataset.id);
  if (!file) return;
  event.preventDefault();
  contextMenu.open(event, [
    { label: 'Edit', run: () => setModal(true, file) },
    { label: 'Delete', run: () => removeFiles([file]) },
  ]);
});
const subjectModal = createSubjectModal(async (name, view) => {
  const subject = makeSubject(name, view, files);
  await persist(subject);
  files.unshift(subject);
  if (activeView === view) renderSidebar();
});
function addSubject() { return subjectModal.open(activeView); }
$('subjectList').closest('.sidebar').addEventListener('contextmenu', event => {
  const subject = event.target.closest('[data-subject]')?.dataset.subject;
  event.preventDefault();
  if (subject === 'all') { contextMenu.close?.(); return; }
  const actions = subject ? [] : [{ label: 'Add', run: addSubject }];
  if (subject && subject !== 'all') {
    const items = [...visibleFiles(), ...subjectRecords(files, activeView)].filter(file => hasSubject(file, subject));
    actions.push({ label: 'Delete', run: () => removeFiles(items) });
  }
  contextMenu.open(event, actions);
});

enableSubjectDrag($('subjectList'), async (view, from, to, after) => {
  const result = saveQueue.catch(() => {}).then(async () => {
    const records = reorderedSubjects(files, view, from, to, after);
    if (!records.length) return;
    await saveDocuments(db, records.map(snapshotDocument));
    const ids = new Set(records.map(record => record.id));
    files = [...files.filter(file => !ids.has(file.id)), ...records];
    if (activeView === view) renderSidebar();
  });
  saveQueue = result;
  await result;
}, () => activeView);

function syncToolbar() {
  const total = pdfDoc?.numPages || 0;
  $('viewerPageLabel').textContent = `${total ? viewerPage : 0} / ${total}`;
  $('viewerPrevPageBtn').disabled = !total || viewerPage <= 1;
  $('viewerNextPageBtn').disabled = !total || viewerPage >= total;
  $('viewerZoomLabel').textContent = `${zoom}%`;
  $('viewerZoomOutBtn').disabled = !total || zoom <= 25;
  $('viewerZoomInBtn').disabled = !total || zoom >= 300;
  $('viewerSelectAreaBtn').disabled = !total;
  if (activeFile) {
    $('viewerStatusToggle').hidden = activeFile.kind === 'problem';
    $('viewerStatusToggle').textContent = activeFile.done ? 'Completed' : 'Pending';
    $('viewerStatusToggle').className = `badge viewer-status-toggle ${activeFile.done ? 'badge-done' : 'badge-pending'}`;
    $('viewerStatusToggle').setAttribute('aria-pressed', String(activeFile.done));
  }
}
function cancelRenders() {
  if (zoomFrame !== null) { cancelAnimationFrame(zoomFrame); zoomFrame = null; }
  isPageNavigation = false;
  observer?.disconnect();
  for (const task of renderTasks) task.cancel();
  renderTasks.clear();
}
// Only rasterize pages close to the viewport. Release distant canvases to bound memory.
async function renderPages(anchorPage = 1, preservePosition = false) {
  cancelRenders();
  const token = ++viewerToken, doc = pdfDoc, scale = zoom / 100 * 1.25;
  if (!doc) return;
  const viewport = $('pdfCanvasViewport');
  const oldSheets = [...viewport.children].filter(sheet => sheet.dataset.pageNumber);
  const anchor = oldSheets.find(sheet => Number(sheet.dataset.pageNumber) === anchorPage);
  const anchorOffset = anchor ? (viewport.scrollTop - anchor.offsetTop) / anchor.offsetHeight : 0;
  const horizontalCenter = (viewport.scrollLeft + viewport.clientWidth / 2) / (viewport.scrollWidth || 1);
  const first = await doc.getPage(1);
  if (token !== viewerToken) return;
  const base = first.getViewport({ scale: 1 });
  let sheets = oldSheets;
  if (!sheets.length) {
    const fragment = document.createDocumentFragment();
    sheets = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const sheet = document.createElement('div');
      sheet.className = 'pdf-page-sheet'; sheet.dataset.pageNumber = n;
      sheets.push(sheet); fragment.append(sheet);
    }
    viewport.replaceChildren(fragment);
  }
  // Keep the previous bitmap visible, scaled to the new size, until its replacement is ready.
  for (const sheet of sheets) {
    delete sheet.dataset.rendering;
    sheet.style.width = `${Number(sheet.dataset.pdfWidth || base.width) * scale}px`;
    sheet.style.height = `${Number(sheet.dataset.pdfHeight || base.height) * scale}px`;
    const canvas = sheet.querySelector('canvas');
    if (canvas) { canvas.style.width = sheet.style.width; canvas.style.height = sheet.style.height; }
  }
  if (preservePosition && anchor) {
    viewport.scrollTo({
      top: anchor.offsetTop + anchorOffset * anchor.offsetHeight,
      left: horizontalCenter * viewport.scrollWidth - viewport.clientWidth / 2,
      behavior: 'instant',
    });
  } else goPage(anchorPage, false);
  async function renderSheet(sheet) {
    if (sheet.dataset.rendering || token !== viewerToken) return;
    sheet.dataset.rendering = 'true';
    const page = await doc.getPage(Number(sheet.dataset.pageNumber));
    if (token !== viewerToken) return;
    const vp = page.getViewport({ scale });
    sheet.dataset.pdfWidth = vp.width / scale;
    sheet.dataset.pdfHeight = vp.height / scale;
    const dpr = Math.min(Math.max(2, window.devicePixelRatio || 1), Math.sqrt(12_000_000 / (vp.width * vp.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width * dpr); canvas.height = Math.ceil(vp.height * dpr);
    canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
    sheet.style.width = `${vp.width}px`; sheet.style.height = `${vp.height}px`;
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] });
    renderTasks.add(task);
    try { await task.promise; } finally { renderTasks.delete(task); }
    if (token !== viewerToken) return;
    sheet.replaceChildren(canvas);
    renderPdfText(page, vp, sheet, canvas, renderTasks).catch(error => {
      if (token === viewerToken && error.name !== 'AbortException') console.warn('Unable to read PDF text:', error);
    });
  }
  // Prepare visible pages before revealing the reader, avoiding empty white sheets.
  const initialPaint = !oldSheets.length ? Promise.all(sheets
    .filter(sheet => sheet === sheets[anchorPage - 1] || (sheet.offsetTop < viewport.scrollTop + viewport.clientHeight && sheet.offsetTop + sheet.offsetHeight > viewport.scrollTop))
    .map(renderSheet)) : null;
  const visible = new Set();
  observer = new IntersectionObserver(entries => {
    if (token !== viewerToken) return;
    for (const entry of entries) {
      const sheet = entry.target;
      if (!entry.isIntersecting) { visible.delete(sheet); continue; }
      visible.add(sheet);
      renderSheet(sheet).catch(error => {
        if (token === viewerToken && error.name !== 'RenderingCancelledException' && !sheet.querySelector('canvas')) sheet.textContent = 'Unable to render this page. Download the PDF to view it.';
      });
    }
    for (const sheet of viewport.children) {
      if (!visible.has(sheet) && Math.abs(Number(sheet.dataset.pageNumber) - viewerPage) > 3 && sheet.firstChild) {
        sheet.replaceChildren(); delete sheet.dataset.rendering;
      }
    }
  }, { root: viewport, rootMargin: '500px 0px' });
  for (const sheet of viewport.children) observer.observe(sheet);
  await initialPaint;
}
let sourceNavigation = 0;
const sourceOutline = createSourceOutline($('pdfNotesPane'), async location => {
  if (!pdfDoc || !activeFile || location.sourceId !== activeFile.id) return;
  const sequence = ++sourceNavigation;
  const doc = pdfDoc, file = activeFile, page = await doc.getPage(location.page);
  if (sequence !== sourceNavigation || doc !== pdfDoc || file !== activeFile) return;
  const viewport = $('pdfCanvasViewport');
  const sheet = viewport.querySelector('[data-page-number="' + location.page + '"]');
  if (!sheet) return;
  const size = page.getViewport({ scale: zoom / 100 * 1.25 });
  sheet.dataset.pdfWidth = size.width / (zoom / 100 * 1.25); sheet.dataset.pdfHeight = size.height / (zoom / 100 * 1.25);
  sheet.style.width = size.width + 'px'; sheet.style.height = size.height + 'px';
  viewerPage = location.page; syncToolbar();
  const { x, y, width, height } = location.rect;
  viewport.querySelector('.has-problem-highlight')?.classList.remove('has-problem-highlight');
  sheet.style.setProperty('--problem-x', `${x * 100}%`);
  sheet.style.setProperty('--problem-y', `${y * 100}%`);
  sheet.style.setProperty('--problem-width', `${width * 100}%`);
  sheet.style.setProperty('--problem-height', `${height * 100}%`);
  sheet.classList.add('has-problem-highlight');
  const top = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, sheet.offsetTop + size.height * location.rect.y - 24));
  const left = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, sheet.offsetLeft + size.width * location.rect.x - 24));
  isPageNavigation = viewport.scrollTop !== top || viewport.scrollLeft !== left;
  viewport.scrollTo({ top, left, behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'instant' : 'smooth' });
}, (event, file) => {
  contextMenu.open(event, [{ label: 'Delete', run: () => removeFiles([file]) }]);
});
function renderSourceOutline(animate = true) { sourceOutline.render(files, activeFile, animate); }

async function openViewer(file) {
  if (viewerClosing || activeFile) return;
  lastFocus = document.activeElement;
  activeFile = file; viewerPage = 1; zoom = 100;
  renderSourceOutline();
  rememberReader(file);
  mediaLoader.warm([]);
  const token = ++viewerToken;
  let url = file.blobUrl || (file.blob instanceof Blob ? file.blobUrl = URL.createObjectURL(file.blob) : null);
  const collection = file.kind === 'problem' ? 'Problems' : 'Sources';
  $('viewerBackBtn').title = sourceReturnProblem(file) ? 'Back to Problem' : `Back to ${collection}`;
  $('pdfViewerTitle').innerHTML = `${collection}<span class="sep">/</span>${esc(file.subject)}<span class="sep">/</span>${esc(file.name)}`;
  $('pdfViewerSub').textContent = file.kind === 'problem' ? `${file.topic}  ·  Added ${file.addedDate}  ·  ${difficultyLabel(file.difficulty)}` : `${file.topic}  ·  Due ${file.dueDate}`;
  $('pdfNotesTextarea').value = file.notes || '';
  $('pdfNotesSavedLabel').textContent = file.notes ? 'Saved' : 'Empty';
  if (url) $('viewerDownloadBtn').href = url; else $('viewerDownloadBtn').removeAttribute('href');
  $('viewerDownloadBtn').download = file.name;
  app.inert = true; document.body.style.overflow = 'hidden';
  $('pdfCanvasViewport').textContent = 'Loading PDF\u2026';
  syncToolbar();
  try {
    await mediaLoader.load(file);
    if (token !== viewerToken || activeFile !== file || viewerClosing) return;
    url = file.blobUrl || (file.blob ? file.blobUrl = URL.createObjectURL(file.blob) : null);
    if (url) $('viewerDownloadBtn').href = url;
    const task = pdfSession.open(url); loadingTask = task;
    const doc = await task.promise;
    if (token !== viewerToken) return;
    pdfDoc = doc; syncToolbar(); await renderPages();
    if (activeFile !== file || pdfDoc !== doc || viewerClosing) return;
    $('pdfViewerPage').classList.add('is-open'); $('pdfViewerPage').setAttribute('aria-hidden', 'false');
    $('viewerBackBtn').focus();
  } catch (error) {
    console.error('Unable to open PDF:', error);
    if (activeFile === file && !viewerClosing) {
      $('pdfCanvasViewport').textContent = 'Unable to read this PDF. Use Download to open the original file.';
      $('pdfViewerPage').classList.add('is-open'); $('pdfViewerPage').setAttribute('aria-hidden', 'false');
      $('viewerBackBtn').focus();
    }
  }
}
function closeViewer() {
  if (viewerClosing) return viewerClosePromise;
  if (!activeFile) return;
  viewerClosing = true;
  saveNote(); ++viewerToken; cancelRenders();
  forgetReader(activeFile);
  loadingTask = null; pdfDoc = null; activeFile = null;
  $('pdfViewerPage').inert = true;
  $('pdfViewerPage').setAttribute('aria-hidden', 'true');
  viewerClosePromise = closeReader($('pdfViewerPage'), () => {
    $('pdfCanvasViewport').replaceChildren();
    $('pdfViewerPage').inert = false;
    app.inert = false; document.body.style.overflow = ''; setSelectMode(false);
    renderFiles(); lastFocus?.focus();
    viewerClosing = false;
  });
  return viewerClosePromise;
}
$('fileList').onclick = e => {
  const more = e.target.closest('[data-problem-tags]');
  if (more) {
    e.preventDefault();
    const file = files.find(file => file.id === more.dataset.problemTags);
    if (file) showProblemTags(more, file);
    return;
  }
  const row = e.target.closest('[data-id]');
  if (row) {
    e.preventDefault();
    const file = files.find(f => f.id === row.dataset.id);
    if (file?.kind === 'problem') problemDetail.open(file);
    else if (file) openViewer(file);
  }
};
for (const event of ['pointerover', 'focusin', 'touchstart']) $('fileList').addEventListener(event, e => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  const file = files.find(file => file.id === id);
  if (file) mediaLoader.load(file).catch(() => {});
}, { passive: true });
$('fileList').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('.file-row')) { event.preventDefault(); event.target.click(); }
});
$('viewerBackBtn').onclick = backFromSource;
function goPage(n, smooth = true) {
  if (!pdfDoc) return;
  viewerPage = Math.max(1, Math.min(pdfDoc.numPages, n));
  const viewport = $('pdfCanvasViewport');
  const sheet = viewport.querySelector(`[data-page-number="${viewerPage}"]`);
  if (sheet) {
    const top = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, sheet.offsetTop - 24));
    // Keep the requested page while smooth scrolling passes earlier pages.
    isPageNavigation = viewport.scrollTop !== top;
    viewport.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
  }
  syncToolbar();
}
$('viewerPrevPageBtn').onclick = () => goPage(viewerPage - 1);
$('viewerNextPageBtn').onclick = () => goPage(viewerPage + 1);
$('pdfCanvasViewport').onscroll = () => {
  selection = null;
  $('pdfAreaSelectionBox').style.display = 'none';
  if (isPageNavigation) return;
  const sheets = [...$('pdfCanvasViewport').children].filter(s => s.dataset.pageNumber);
  const top = $('pdfCanvasViewport').getBoundingClientRect().top + 80;
  const nearest = sheets.reduce((best, s) => !best || Math.abs(s.getBoundingClientRect().top - top) < Math.abs(best.getBoundingClientRect().top - top) ? s : best, null);
  if (nearest) { viewerPage = Number(nearest.dataset.pageNumber); syncToolbar(); }
};
$('pdfCanvasViewport').addEventListener('scrollend', () => { isPageNavigation = false; });
// Manual input takes over from button navigation immediately.
for (const type of ['wheel', 'pointerdown', 'touchstart']) {
  $('pdfCanvasViewport').addEventListener(type, () => { isPageNavigation = false; }, { passive: true });
}
$('pdfCanvasViewport').addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) isPageNavigation = false;
});
function setZoom(value) {
  if (!pdfDoc) return;
  const next = Math.max(25, Math.min(300, value));
  if (next === zoom) return;
  zoom = next; syncToolbar();
  if (zoomFrame !== null) return;
  zoomFrame = requestAnimationFrame(() => {
    zoomFrame = null;
    renderPages(viewerPage, true).catch(error => { console.error('Unable to render PDF zoom:', error); });
  });
}
$('viewerZoomOutBtn').onclick = () => setZoom(zoom - 15);
$('viewerZoomInBtn').onclick = () => setZoom(zoom + 15);
$('pdfViewerPage').addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 10 : -10)); }
}, { passive: false });
$('viewerStatusToggle').onclick = async () => {
  if (!activeFile) return;
  const file = activeFile, previous = file.done;
  file.done = !file.done; syncToolbar();
  $('viewerStatusToggle').disabled = true;
  try { await persist(file); renderFiles(); }
  catch { file.done = previous; console.error('Could not save completion status.'); }
  finally { $('viewerStatusToggle').disabled = false; syncToolbar(); }
};
function setNotes(open) {
  notesOpen = open;
  $('pdfNotesPane').classList.toggle('is-collapsed', !open);
  $('pdfNotesPane').inert = !open;
  $('viewerNotesToggleBtn').classList.toggle('is-active', open);
  $('viewerNotesToggleBtn').setAttribute('aria-expanded', String(open));
  if (open) sourceOutline.focus(); else $('viewerNotesToggleBtn').focus();
}
$('viewerNotesToggleBtn').onclick = () => setNotes(!notesOpen);
$('pdfNotesCloseBtn').onclick = () => setNotes(false);

// Select one region on a PDF page and save it as a linked problem.
function setSelectMode(on) {
  selectMode = on; selection = null;
  $('viewerSelectAreaBtn').classList.toggle('is-active', on);
  $('viewerSelectAreaBtn').setAttribute('aria-pressed', String(on));
  $('pdfCanvasViewport').classList.toggle('is-selecting', on);
  $('pdfAreaSelectionBox').style.display = 'none';
}
$('viewerSelectAreaBtn').onclick = () => setSelectMode(!selectMode);
$('pdfCanvasViewport').addEventListener('pointerdown', e => {
  if (!selectMode || extracting || e.button !== 0 || e.target.tagName !== 'CANVAS') return;
  e.preventDefault();
  const rect = e.target.getBoundingClientRect();
  selection = { page: Number(e.target.closest('[data-page-number]').dataset.pageNumber), canvas: e.target, rect, x: e.clientX - rect.left, y: e.clientY - rect.top };
  $('pdfCanvasViewport').setPointerCapture(e.pointerId);
});
$('pdfCanvasViewport').addEventListener('pointermove', e => {
  if (!selection) return;
  const s = selection, body = $('pdfViewerBody').getBoundingClientRect();
  const x = Math.max(0, Math.min(s.rect.width, e.clientX - s.rect.left));
  const y = Math.max(0, Math.min(s.rect.height, e.clientY - s.rect.top));
  s.crop = { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.abs(x - s.x), h: Math.abs(y - s.y) };
  Object.assign($('pdfAreaSelectionBox').style, { display: 'block', left: `${s.rect.left - body.left + s.crop.x}px`, top: `${s.rect.top - body.top + s.crop.y}px`, width: `${s.crop.w}px`, height: `${s.crop.h}px` });
});
let extracting = false;
$('pdfCanvasViewport').addEventListener('pointerup', async e => {
  const region = selection; selection = null;
  if ($('pdfCanvasViewport').hasPointerCapture(e.pointerId)) $('pdfCanvasViewport').releasePointerCapture(e.pointerId);
  $('pdfAreaSelectionBox').style.display = 'none';
  if (!region || !activeFile || !pdfDoc) return;
  const rect = selectedRegion(region.rect, { x: region.x, y: region.y }, { x: e.clientX - region.rect.left, y: e.clientY - region.rect.top });
  if (!rect) return;
  const source = activeFile, doc = pdfDoc;
  extracting = true; setSelectMode(false);
  try {
    const blob = await cropPage(doc, region.page, rect);
    if (activeFile !== source || pdfDoc !== doc || viewerClosing) return;
    setModal(true, null, { blob, source, location: { sourceId: source.id, page: region.page, rect } });
  } catch (error) { if (activeFile === source && !viewerClosing) window.alert(error.message || 'Unable to crop problem.'); }
  finally { extracting = false; }
});
$('pdfCanvasViewport').addEventListener('pointercancel', () => { selection = null; $('pdfAreaSelectionBox').style.display = 'none'; });

let drag;
$('pdfNotesHeader').onpointerdown = e => {
  if (e.button !== 0 || e.target.closest('button')) return;
  const rect = $('pdfNotesPane').getBoundingClientRect();
  drag = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  $('pdfNotesHeader').setPointerCapture(e.pointerId);
};
$('pdfNotesHeader').onpointermove = e => {
  if (!drag) return;
  const body = $('pdfViewerBody').getBoundingClientRect(), pane = $('pdfNotesPane');
  Object.assign(pane.style, { right: 'auto', left: `${Math.max(0, Math.min(body.width - pane.offsetWidth, e.clientX - body.left - drag.x))}px`, top: `${Math.max(0, Math.min(body.height - pane.offsetHeight, e.clientY - body.top - drag.y))}px` });
};
$('pdfNotesHeader').onpointerup = $('pdfNotesHeader').onpointercancel = () => { drag = null; };
window.addEventListener('resize', () => { $('pdfNotesPane').style.left = ''; $('pdfNotesPane').style.top = ''; $('pdfNotesPane').style.right = ''; });
window.addEventListener('keydown', e => {
  const modal = $('uploadModalBackdrop').classList.contains('is-open');
  const root = modal ? $('uploadModalBackdrop') : activeFile ? $('pdfViewerPage') : null;
  if (e.key === 'Escape') {
    if (modal && !$('modalCancelBtn').disabled) setModal(false);
    else if (activeFile && selectMode) setSelectMode(false);
    else if (activeFile) closeViewer();
  }
  if (e.key === 'Tab' && root) {
    const controls = [...root.querySelectorAll('button, a[href], input:not([type=file]), textarea, select, [tabindex="0"]')].filter(el => !el.disabled && !el.closest('[inert]') && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
  if (activeFile && (e.ctrlKey || e.metaKey) && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
    if (['=', '+', '-', '0'].includes(e.key)) { e.preventDefault(); setZoom(e.key === '0' ? 100 : zoom + (e.key === '-' ? -15 : 15)); }
  }
});
const subjectTags = createSubjectTags($('uploadPdfForm'), {
  getSuggestions: () => [...subjectNames(files, 'sources'), ...subjectNames(files, 'problems')],
  hideSelected: true,
  action: $('modalSuggestTagsBtn'),
});
installBrowsePaste($('uploadModalBackdrop'), {
  getView: () => setModal.view,
  enabled: () => $('uploadModalBackdrop').classList.contains('is-open') && !setModal.file && !setModal.extraction,
  onFile(file) {
    setModal.pastedFile = file;
    resetTagSuggestion();
    $('modalFileStatus').textContent = file.name || 'Pasted file';
    $('modalErrorMsg').textContent = '';
    if (!$('modalPathFileNameInput').value.trim()) $('modalPathFileNameInput').value = documentTitle(file.name);
  },
  onError(message) { $('modalErrorMsg').textContent = message; },
});
const topicPicker = createTopicPicker($('modalTopicInput'), () => existingTopics(files));

async function initialize() {
  $('uploadPdfBtn').disabled = true;
  try {
    db = await openLibrary();
    Promise.resolve().then(() => pdfSession.warm()).catch(() => {});
    files = await readDocuments(db);
    files.sort((a, b) => b.createdAt - a.createdAt);
    libraryReady = true;
    $('uploadPdfBtn').disabled = false;
  } catch {
    console.error('Browser storage is unavailable. Enable site storage, then reload to use your library.');
  }
  renderView(); syncToolbar();
  try { if (libraryReady) await applyRoute(); }
  finally { document.body.classList.remove('is-starting'); }
}
initialize();
