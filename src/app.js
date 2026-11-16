import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createProblemDetail } from './problem-detail.js';
import { closeReader } from './reader-transition.js';
import { validateUpload, uploadName } from './uploads.js';
import { createContextMenu } from './context-menu.js';
import './context-menu.css';
import { problemTitle } from './problem-data.js';
import { escapeHtml as esc, parseDate, queryFiles, validatePdf, viewFromHash, collectionFiles, dateOf, readerRoute, readerHash, snapshotDocument, subjectNames, subjectRecords, makeSubject } from './library.js';
import { openLibrary, readDocuments, saveDocuments, deleteDocuments } from './storage.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
const $ = id => document.getElementById(id);
const app = document.querySelector('.manage-shell');
let activeView = viewFromHash(location.hash);
const viewName = () => activeView === 'problems' ? 'Problems' : 'Sources';
const visibleFiles = () => collectionFiles(files, activeView);
const difficultyLabel = value => ({ easy: 'Easy', med: 'Med', hard: 'Hard' })[value] || 'Easy';
let db, files = [], activeSubject = 'all', searchQuery = '', sortKey = null, sortDir = 'asc', currentPage = 1;
let activeFile = null, pdfDoc = null, loadingTask = null, viewerPage = 1, zoom = 100, viewerToken = 0;
let isPageNavigation = false;
let viewerClosing = false;
let viewerClosePromise = null, libraryReady = false, routeSequence = 0;
let zoomFrame = null;
let observer = null, renderTasks = new Set(), notesOpen = true, selectMode = false, selection = null;
let lastFocus, noteTimer, saveQueue = Promise.resolve();
$('pdfCanvasViewport').setAttribute('aria-live', 'off');
$('pdfViewerPage').setAttribute('role', 'dialog');
$('pdfViewerPage').setAttribute('aria-modal', 'true');
$('pdfNotesTextarea').setAttribute('aria-label', 'Document notes');

function subjects() { return subjectNames(files, activeView); }
function renderSidebar() {
  const q = searchQuery.trim().toLocaleLowerCase();
  const documents = visibleFiles();
  const rows = [{ name: 'all', label: 'All', count: documents.length }, ...subjects().map(s => ({ name: s, label: s, count: documents.filter(f => f.subject === s).length }))];
  $('subjectList').innerHTML = rows.filter(s => s.label.toLocaleLowerCase().includes(q)).map(s => `<button type="button" class="subject-item ${s.name === activeSubject ? 'is-active' : ''}" data-subject="${esc(s.name)}" aria-current="${s.name === activeSubject ? 'page' : 'false'}"><span class="subject-name">${esc(s.label)}</span><span class="subject-count">${s.count}</span></button>`).join('') || '<div class="sidebar-empty">No subjects found</div>';
  $('modalSubjectsDatalist').innerHTML = subjects().map(s => `<option value="${esc(s)}"></option>`).join('');
}
function renderFiles() {
  const result = queryFiles(visibleFiles(), { subject: activeSubject, sortKey, sortDir, page: currentPage });
  currentPage = result.page;
  $('fileList').innerHTML = result.items.map(f => `<a class="file-row" href="${esc(readerHash(activeView, f.id))}" data-id="${esc(f.id)}"><div class="file-info"><span class="filename">${esc(activeView === 'problems' ? problemTitle(f) : f.name)}</span></div><span class="topic-cell">${esc(f.topic)}</span><span class="due-date">${esc(dateOf(f))}</span><div class="status-cell"><span class="${activeView === 'problems' ? `difficulty difficulty-${esc(f.difficulty || 'easy')}` : `badge ${f.done ? 'badge-done' : 'badge-pending'}`}">${activeView === 'problems' ? difficultyLabel(f.difficulty) : f.done ? 'Completed' : 'Pending'}</span></div></a>`).join('') || '<div class="sidebar-empty" style="padding: 18px 10px;">No files in this subject</div>';
  $('paginationBar').hidden = result.pages <= 1;
  $('paginationInfo').textContent = `${result.page} / ${result.pages}`;
  $('prevPageBtn').disabled = currentPage <= 1;
  $('nextPageBtn').disabled = currentPage >= result.pages;
  $('breadcrumbDynamic').hidden = activeSubject === 'all';
  $('breadcrumbSubject').textContent = activeSubject === 'all' ? '' : activeSubject;
}
function renderView() {
  const problems = activeView === 'problems';
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
  history.replaceState(null, '', readerHash(view, file.id));
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
  persist,
  prepare: file => db?.cloud ? db.hydrate(file) : Promise.resolve(file),
  background: app,
  getItems: () => queryFiles(collectionFiles(files, 'problems'), { subject: activeSubject, sortKey, sortDir }).allItems,
  onChange: () => { renderSidebar(); renderFiles(); },
  onOpen: rememberReader,
  onClose: forgetReader,
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

function setModal(open, file = null) {
  setModal.file = open ? file : null;
  if (open) $('uploadModalBackdrop').classList.toggle('is-editing', !!file);
  $('uploadModalBackdrop').classList.toggle('is-open', open);
  $('uploadModalBackdrop').setAttribute('aria-hidden', String(!open));
  app.inert = open;
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) {
    lastFocus = document.activeElement;
    $('uploadPdfForm').reset(); $('pdfFileInput').value = '';
    $('modalCollectionName').textContent = viewName();
    $('modalDifficultyField').hidden = activeView !== 'problems';
    const problems = activeView === 'problems';
    document.querySelector('label[for="modalBrowseBtn"]').textContent = problems ? 'Select problem' : 'Select source';
    $('pdfFileInput').accept = problems ? 'image/*,application/pdf,.pdf' : 'application/pdf,.pdf';
    $('modalPathFileNameInput').placeholder = problems ? 'new-problem' : 'new-file.pdf';
    document.querySelector('label[for="modalDueDateInput"]').textContent = activeView === 'problems' ? 'Added date' : 'Due date';
    $('modalPathSubjectInput').value = activeSubject === 'all' ? '' : activeSubject;
    $('modalPathFileNameInput').value = '';
    const today = new Date();
    $('modalDueDateInput').value = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    $('modalErrorMsg').textContent = '';
    $('modalFileStatus').textContent = 'No file selected';
    if (file) {
      $('modalPathSubjectInput').value = file.subject;
      $('modalPathFileNameInput').value = file.name;
      $('modalTopicInput').value = file.topic;
      $('modalDueDateInput').value = dateOf(file) || '';
      $('modalDifficultyInput').value = file.difficulty || 'easy';
    }
    $('modalPathFileNameInput').focus();
  } else lastFocus?.focus();
}
$('uploadPdfBtn').onclick = () => setModal(true);
$('modalCancelBtn').onclick = () => setModal(false);
$('uploadModalBackdrop').onclick = e => { if (e.target === $('uploadModalBackdrop') && !$('modalCancelBtn').disabled) setModal(false); };
$('modalBrowseBtn').onclick = () => $('pdfFileInput').click();
$('pdfFileInput').onchange = () => {
  const file = $('pdfFileInput').files[0];
  $('modalFileStatus').textContent = file?.name || 'No file selected';
  if (file && !$('modalPathFileNameInput').value.trim()) $('modalPathFileNameInput').value = file.name;
};
for (const id of ['modalPathSubjectInput', 'modalPathFileNameInput']) $(id).onkeydown = e => {
  if (e.key === 'Enter') { e.preventDefault(); $('uploadPdfForm').requestSubmit(); }
};
$('uploadPdfForm').onsubmit = async e => {
  e.preventDefault();
  const submit = e.submitter || $('uploadPdfForm').querySelector('[type=submit]');
  if (submit.disabled) return;
  submit.disabled = true; $('modalCancelBtn').disabled = true;
  let validation;
  try {
    const editing = setModal.file;
    const blob = $('pdfFileInput').files[0];
    const mediaType = editing ? null : await validateUpload(blob, activeView);
    const subject = $('modalPathSubjectInput').value.trim().toLocaleLowerCase().replace(/\s+/g, '-');
    if (!subject || subject === 'all' || /[\\/\x00-\x1f]/.test(subject)) throw new Error('Enter a subject without slashes. “all” is reserved.');
    const name = editing ? $('modalPathFileNameInput').value.trim() : uploadName($('modalPathFileNameInput').value, blob, mediaType);
    if (!name) throw new Error('Enter a file name.');
    if (/[\\/\x00-\x1f]/.test(name)) throw new Error('File name cannot contain slashes or control characters.');
    if (visibleFiles().some(f => f.id !== editing?.id && !f.sample && f.subject === subject && f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A PDF with this name already exists in that subject.');
    let dueDate = $('modalDueDateInput').value.trim();
    if (Number.isNaN(parseDate(dueDate))) throw new Error('Enter a real date in dd/mm/yyyy format, or leave it blank.');
    if (!dueDate) {
      const now = new Date();
      dueDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    }
    if (editing) {
      const updated = { ...editing, name, subject, topic: $('modalTopicInput').value.trim() || 'General Notes' };
      if (editing.kind === 'problem') { updated.addedDate = dueDate; updated.difficulty = $('modalDifficultyInput').value; }
      else updated.dueDate = dueDate;
      await persist(updated);
      Object.assign(editing, updated);
      setModal(false); renderSidebar(); renderFiles();
      return;
    }
    const file = { id: crypto.randomUUID(), name, subject, topic: $('modalTopicInput').value.trim() || 'General Notes', dueDate, done: false, notes: '', sample: false, createdAt: Date.now() };
    if (mediaType === 'pdf') {
      validation = pdfjsLib.getDocument({ data: await blob.arrayBuffer() });
      const doc = await validation.promise;
      file.blob = blob; file.pageCount = doc.numPages;
    } else {
      file.statementImages = [{ id: crypto.randomUUID(), name: blob.name, blob }];
    }
    if (activeView === 'problems') {
      file.kind = 'problem'; file.addedDate = dueDate;
      file.difficulty = $('modalDifficultyInput').value;
      delete file.dueDate;
    }
    await persist(file);
    files.unshift(file);
    currentPage = 1;
    setModal(false); renderSidebar(); renderFiles();
  } catch (error) {
    $('modalErrorMsg').textContent = error.name === 'PasswordException' ? 'Password-protected PDFs are not supported yet.' : error.message || 'Unable to save PDF.';
  } finally {
    await validation?.destroy();
    submit.disabled = false; $('modalCancelBtn').disabled = false;
  }
};

const contextMenu = createContextMenu();
async function removeFiles(items) {
  const ids = items.map(file => file.id);
  const result = saveQueue.catch(() => {}).then(() => deleteDocuments(db, ids));
  saveQueue = result;
  await result;
  const removed = new Set(ids);
  files = files.filter(file => !removed.has(file.id));
  for (const file of items) if (file.blobUrl) URL.revokeObjectURL(file.blobUrl);
  if (activeSubject !== 'all' && !subjects().includes(activeSubject)) activeSubject = 'all';
  renderSidebar(); renderFiles();
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
async function addSubject() {
  const view = activeView;
  const name = window.prompt('Subject name');
  if (name === null) return;
  const subject = makeSubject(name, view, files);
  await persist(subject);
  files.unshift(subject);
  if (activeView === view) renderSidebar();
}
$('subjectList').closest('.sidebar').addEventListener('contextmenu', event => {
  const subject = event.target.closest('[data-subject]')?.dataset.subject;
  event.preventDefault();
  const actions = [{ label: 'Add', run: addSubject }];
  if (subject && subject !== 'all') {
    const items = [...visibleFiles(), ...subjectRecords(files, activeView)].filter(file => file.subject === subject);
    actions.push({ label: 'Delete', run: () => removeFiles(items) });
  }
  contextMenu.open(event, actions);
});

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12_000_000 / (vp.width * vp.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width * dpr); canvas.height = Math.ceil(vp.height * dpr);
    canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
    sheet.style.width = `${vp.width}px`; sheet.style.height = `${vp.height}px`;
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] });
    renderTasks.add(task);
    try { await task.promise; } finally { renderTasks.delete(task); }
    if (token === viewerToken) sheet.replaceChildren(canvas);
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
async function openViewer(file) {
  if (viewerClosing || activeFile) return;
  lastFocus = document.activeElement;
  activeFile = file; viewerPage = 1; zoom = 100;
  rememberReader(file);
  const token = ++viewerToken;
  let url = file.blobUrl || (file.blob instanceof Blob ? file.blobUrl = URL.createObjectURL(file.blob) : null);
  const collection = file.kind === 'problem' ? 'Problems' : 'Sources';
  $('viewerBackBtn').title = `Back to ${collection}`;
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
    if (db?.cloud) await db.hydrate(file);
    if (token !== viewerToken || activeFile !== file || viewerClosing) return;
    url = file.blobUrl || (file.blob ? file.blobUrl = URL.createObjectURL(file.blob) : null);
    if (url) $('viewerDownloadBtn').href = url;
    const task = pdfjsLib.getDocument({ url }); loadingTask = task;
    const doc = await task.promise;
    if (token !== viewerToken) { await doc.destroy(); return; }
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
  const task = loadingTask; loadingTask = null; pdfDoc = null; activeFile = null;
  $('pdfViewerPage').inert = true;
  $('pdfViewerPage').setAttribute('aria-hidden', 'true');
  viewerClosePromise = closeReader($('pdfViewerPage'), () => {
    task?.destroy().catch(() => {});
    $('pdfCanvasViewport').replaceChildren();
    $('pdfViewerPage').inert = false;
    app.inert = false; document.body.style.overflow = ''; setSelectMode(false);
    renderFiles(); lastFocus?.focus();
    viewerClosing = false;
  });
  return viewerClosePromise;
}
$('fileList').onclick = e => {
  const row = e.target.closest('[data-id]');
  if (row) {
    e.preventDefault();
    const file = files.find(f => f.id === row.dataset.id);
    if (file?.kind === 'problem') problemDetail.open(file);
    else if (file) openViewer(file);
  }
};
$('viewerBackBtn').onclick = closeViewer;
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
  if (open) $('pdfNotesTextarea').focus(); else $('viewerNotesToggleBtn').focus();
}
$('viewerNotesToggleBtn').onclick = () => setNotes(!notesOpen);
$('pdfNotesCloseBtn').onclick = () => setNotes(false);

// Keep the sketch's region-selection interaction without adding an export action.
function setSelectMode(on) {
  selectMode = on; selection = null;
  $('viewerSelectAreaBtn').classList.toggle('is-active', on);
  $('viewerSelectAreaBtn').setAttribute('aria-pressed', String(on));
  $('pdfCanvasViewport').classList.toggle('is-selecting', on);
  $('pdfAreaSelectionBox').style.display = 'none';
}
$('viewerSelectAreaBtn').onclick = () => setSelectMode(!selectMode);
$('pdfCanvasViewport').addEventListener('pointerdown', e => {
  if (!selectMode || e.button !== 0 || e.target.tagName !== 'CANVAS') return;
  e.preventDefault();
  const rect = e.target.getBoundingClientRect();
  selection = { canvas: e.target, rect, x: e.clientX - rect.left, y: e.clientY - rect.top };
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
$('pdfCanvasViewport').addEventListener('pointerup', e => {
  selection = null;
  if ($('pdfCanvasViewport').hasPointerCapture(e.pointerId)) $('pdfCanvasViewport').releasePointerCapture(e.pointerId);
});
$('pdfCanvasViewport').addEventListener('pointercancel', () => { selection = null; });

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
async function initialize() {
  $('uploadPdfBtn').disabled = true;
  try {
    db = await openLibrary();
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
