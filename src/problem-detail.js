import { escapeHtml as esc, validatePdf } from './library.js';
import { ensureProblemData, renameProblem, renderMarkdown } from './problem-data.js';
import { createImageZoom } from './image-zoom.js';
import { closeReader } from './reader-transition.js';

export function createProblemDetail({ persist, getItems, onChange, background, checkPdf = validatePdf, onOpen = () => {}, onClose = () => {}, hideReader = closeReader }) {
  const $ = id => document.getElementById(id);
  const page = $('problemDetailPage');
  const imageZoom = createImageZoom();
  let active = null, items = [], returnFocus = null;
  let contentAnimation = null;
  let closing = false, closingPromise = null;
  const urls = new Map(), timers = new Map(), pickerTargets = new Map();
  page.inert = true;
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  const urlFor = blob => {
    if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
    return urls.get(blob);
  };
  function releaseUrls() {
    imageZoom.close();
    $('statementPdfIframe').removeAttribute('src'); $('solutionPdfFrame').removeAttribute('src');
    $('statementImageGrid').replaceChildren(); $('solutionImageGrid').replaceChildren();
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  }
  async function save(file, status = null) {
    clearTimeout(timers.get(file.id)?.timer); timers.delete(file.id);
    if (status && active === file) status.textContent = 'Saving…';
    try {
      await persist(file);
      if (status && active === file) status.textContent = file.solution.markdown.trim() ? 'Saved' : 'Empty';
    } catch (error) {
      if (status && active === file) status.textContent = 'Save failed';
      if (active === file) $('problemDetailTitleInput').title = 'Unable to save changes. Check browser storage.';
      console.error('Unable to save problem:', error);
    }
  }
  function schedule(file, status = null) {
    clearTimeout(timers.get(file.id)?.timer);
    if (status) status.textContent = 'Saving…';
    timers.set(file.id, { file, status, timer: setTimeout(() => save(file, status), 300) });
  }
  function flush() {
    for (const entry of [...timers.values()]) save(entry.file, entry.status);
  }
  function images(container, records, type) {
    container.innerHTML = records.map((image, index) => `<div class="doc-media-item"><img src="${esc(urlFor(image.blob))}" alt="${type === 'statement' ? 'Problem statement' : 'Solution'} image" tabindex="0" role="button" aria-label="Zoom ${type === 'statement' ? 'problem statement' : 'solution'} image"><div class="doc-media-meta"><button type="button" class="doc-action-link" data-remove-${type}="${index}">Remove</button></div></div>`).join('');
  }
  function setFrame(frame, blob) {
    if (!blob) { frame.removeAttribute('src'); return; }
    const src = `${urlFor(blob)}#toolbar=0&navpanes=0`;
    if (frame.getAttribute('src') !== src) frame.src = src;
  }
  function renderStatement() {
    const hasPdf = !!active.blob;
    $('statementEmptyHint').hidden = hasPdf || !!active.statementImages.length;
    $('statementImageGrid').hidden = !active.statementImages.length;
    images($('statementImageGrid'), active.statementImages, 'statement');
    $('statementPdfEmbed').hidden = !hasPdf;
    setFrame($('statementPdfIframe'), active.blob);
  }
  function renderSolution() {
    const solution = active.solution;
    const markdown = solution.type === 'markdown';
    const image = solution.type === 'image' && solution.images.length > 0;
    const pdf = solution.type === 'pdf' && !!solution.pdfBlob;
    $('solutionEmptyState').hidden = markdown || image || pdf;
    $('solutionPanelMarkdown').hidden = !markdown;
    $('solutionPanelImage').hidden = !image;
    $('solutionPanelPdf').hidden = !pdf;
    images($('solutionImageGrid'), solution.images, 'solution');
    setFrame($('solutionPdfFrame'), pdf ? solution.pdfBlob : null);
  }
  function renderDifficulty() {
    const value = active.difficulty || 'easy';
    $('problemDetailDiffBtn').className = `problem-diff-btn is-${value}`;
    $('problemDetailDiffBtn').textContent = ({ easy: 'Easy', med: 'Med', hard: 'Hard' })[value];
  }
  function markdownMode(mode) {
    page.querySelectorAll('[data-md-mode]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.mdMode === mode));
    $('solutionMdTextarea').hidden = mode === 'preview';
    $('solutionMdPreview').hidden = mode !== 'preview';
    if (mode === 'preview') $('solutionMdPreview').innerHTML = renderMarkdown(active.solution.markdown);
  }
  function show(file, direction = 0) {
    contentAnimation?.cancel(); contentAnimation = null;
    flush(); releaseUrls(); active = ensureProblemData(file);
    const index = items.findIndex(item => item.id === active.id);
    $('problemDetailPosLabel').textContent = `${index + 1} / ${items.length}`;
    $('problemPrevItemBtn').disabled = index <= 0;
    $('problemNextItemBtn').disabled = index < 0 || index >= items.length - 1;
    $('problemDetailBreadcrumb').textContent = `Problems / ${file.subject} / ${file.topic}`;
    $('problemDetailTitleInput').value = file.name.replace(/\.pdf$/i, '');
    $('problemDetailTitleInput').setCustomValidity(''); $('problemDetailTitleInput').title = '';
    $('problemDetailAddedDate').textContent = `Added ${file.addedDate}`;
    $('problemStatementNoteInput').value = file.notes;
    $('solutionMdTextarea').value = file.solution.markdown;
    $('solutionMdStatus').textContent = file.solution.markdown.trim() ? 'Saved' : 'Empty';
    $('solutionAddMenu').hidden = true;
    renderDifficulty(); renderStatement(); renderSolution(); markdownMode('write');
    page.scrollTop = 0;
    onOpen(file);
    if (direction && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      contentAnimation = page.querySelector('.problem-detail-container')?.animate?.([
        { opacity: 0.75, transform: `translateX(${direction * 6}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ], { duration: 160, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    }
  }
  function open(file) {
    if (closing) return;
    if (!active) returnFocus = document.activeElement;
    items = getItems();
    if (!items.some(item => item.id === file.id)) items = [file];
    show(file);
    page.inert = false; page.classList.add('is-open'); page.setAttribute('aria-hidden', 'false');
    background.inert = true; document.body.style.overflow = 'hidden';
    $('problemDetailBackBtn').focus();
  }
  function close() {
    if (closing) return closingPromise;
    if (!active) return;
    closing = true;
    contentAnimation?.cancel(); contentAnimation = null;
    const file = active, id = file.id;
    flush(); imageZoom.close(); active = null; pickerTargets.clear();
    onClose(file);
    $('solutionAddMenu').hidden = true;
    page.inert = true; page.setAttribute('aria-hidden', 'true');
    closingPromise = hideReader(page, () => {
      releaseUrls(); background.inert = false; document.body.style.overflow = '';
      const row = [...document.querySelectorAll('[data-id]')].find(el => el.dataset.id === id);
      (row || (returnFocus?.isConnected ? returnFocus : document.getElementById('breadcrumbReset')))?.focus();
      closing = false;
    });
    return closingPromise;
  }
  $('problemDetailBackBtn').onclick = close;
  for (const [id, step] of [['problemPrevItemBtn', -1], ['problemNextItemBtn', 1]]) $(id).onclick = () => {
    if (!active) return;
    const index = items.findIndex(file => file.id === active.id) + step;
    if (items[index]) show(items[index], step);
  };
  $('problemDetailTitleInput').oninput = e => { e.target.setCustomValidity(''); };
  function commitTitle() {
    if (!active) return;
    try {
      if (renameProblem(active, $('problemDetailTitleInput').value, getItems())) { save(active); onChange(); }
      $('problemDetailTitleInput').value = active.name.replace(/\.pdf$/i, '');
    } catch (error) { $('problemDetailTitleInput').setCustomValidity(error.message); $('problemDetailTitleInput').reportValidity(); }
  }
  $('problemDetailTitleInput').onchange = commitTitle;
  $('problemDetailTitleInput').onblur = () => {
    if (active && !$('problemDetailTitleInput').value.trim()) $('problemDetailTitleInput').value = active.name.replace(/\.pdf$/i, '');
  };
  $('problemDetailTitleInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); } };
  $('problemStatementNoteInput').oninput = e => { if (active) { active.notes = e.target.value; schedule(active); } };
  $('problemDetailDiffBtn').onclick = () => {
    if (!active) return;
    const levels = ['easy', 'med', 'hard'];
    active.difficulty = levels[(levels.indexOf(active.difficulty || 'easy') + 1) % levels.length];
    renderDifficulty(); save(active); onChange();
  };
  function pick(id) {
    if (!active) return;
    pickerTargets.set(id, active); $(id).value = ''; $(id).click();
  }
  $('addStatementMediaBtn').onclick = () => pick('statementMediaInput');
  $('solutionAddBtn').onclick = () => { $('solutionAddMenu').hidden = !$('solutionAddMenu').hidden; };
  document.addEventListener('click', e => { if (!$('solutionAddWrap').contains(e.target)) $('solutionAddMenu').hidden = true; });
  page.querySelectorAll('[data-choose-sol]').forEach(btn => btn.onclick = () => {
    if (!active) return;
    $('solutionAddMenu').hidden = true;
    if (btn.dataset.chooseSol === 'markdown') {
      active.solution.type = 'markdown'; save(active); renderSolution(); markdownMode('write'); $('solutionMdTextarea').focus();
    } else pick(btn.dataset.chooseSol === 'image' ? 'solutionImageInput' : 'solutionPdfInput');
  });
  async function upload(id, selected) {
    const file = pickerTargets.get(id); pickerTargets.delete(id);
    if (!file || file !== active || !selected.length) return;
    try {
      // Validate the whole selection before mutating the stored problem.
      for (const blob of selected) {
        if (id === 'solutionImageInput') {
          if (!blob.type.startsWith('image/') || !blob.size) throw new Error('Please select an image.');
        } else if (id === 'solutionPdfInput' || /\.pdf$/i.test(blob.name)) await checkPdf(blob);
        else if (!blob.type.startsWith('image/') || !blob.size) throw new Error('Please select an image or PDF.');
      }
      if (active !== file) return;
      const image = blob => ({ id: crypto.randomUUID(), name: blob.name, blob });
      if (id === 'statementMediaInput') {
        for (const blob of selected) {
          if (/\.pdf$/i.test(blob.name)) { delete file.blobUrl; file.blob = blob; }
          else file.statementImages.push(image(blob));
        }
      } else if (id === 'solutionImageInput') {
        file.solution.type = 'image'; file.solution.images.push(...selected.map(image));
        file.solution.pdfBlob = null; file.solution.pdfName = '';
      } else {
        file.solution.type = 'pdf'; file.solution.pdfBlob = selected[0];
        file.solution.pdfName = selected[0].name; file.solution.images = [];
      }
      releaseUrls(); renderStatement(); renderSolution(); await save(file);
    } catch (error) {
      const button = id === 'statementMediaInput' ? $('addStatementMediaBtn') : $('solutionAddBtn');
      button.title = error.message;
      console.error('Unable to attach problem media:', error);
    } finally { $(id).value = ''; }
  }
  for (const id of ['statementMediaInput', 'solutionImageInput', 'solutionPdfInput']) $(id).onchange = e => upload(id, [...e.target.files]);
  for (const [id, type] of [['statementImageGrid', 'statement'], ['solutionImageGrid', 'solution']]) $(id).onclick = e => {
    if (e.target.tagName === 'IMG') { imageZoom.open(e.target); return; }
    const button = e.target.closest(`[data-remove-${type}]`);
    if (!button || !active) return;
    const records = type === 'statement' ? active.statementImages : active.solution.images;
    records.splice(Number(button.dataset[type === 'statement' ? 'removeStatement' : 'removeSolution']), 1);
    if (type === 'solution' && !records.length) active.solution.type = null;
    releaseUrls(); renderStatement(); renderSolution(); save(active);
  };
  $('removeStatementPdfBtn').onclick = () => {
    if (!active) return;
    delete active.blob; delete active.blobUrl; delete active.pageCount;
    releaseUrls(); renderStatement(); renderSolution(); save(active);
  };
  $('removeSolutionPdfBtn').onclick = () => {
    if (!active) return;
    active.solution.pdfBlob = null; active.solution.pdfName = ''; active.solution.type = null;
    releaseUrls(); renderStatement(); renderSolution(); save(active);
  };
  $('removeMarkdownSolutionBtn').onclick = () => {
    if (!active) return;
    active.solution.markdown = ''; active.solution.type = null;
    $('solutionMdTextarea').value = ''; renderSolution(); save(active);
  };
  page.querySelectorAll('[data-md-mode]').forEach(btn => btn.onclick = () => { if (active) markdownMode(btn.dataset.mdMode); });
  $('solutionMdTextarea').oninput = e => {
    if (!active) return;
    active.solution.markdown = e.target.value; schedule(active, $('solutionMdStatus'));
  };
  page.addEventListener('keydown', e => {
    if (e.target.tagName === 'IMG' && ['Enter', ' '].includes(e.key)) {
      e.preventDefault(); imageZoom.open(e.target); return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (!$('solutionAddMenu').hidden) { $('solutionAddMenu').hidden = true; $('solutionAddBtn').focus(); }
      else close();
    }
    if (e.key === 'Tab') {
      const controls = [...page.querySelectorAll('button, input:not([type=file]), textarea, img[tabindex]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
  return { open, close, get isOpen() { return !!active || closing; }, get activeId() { return active?.id || null; } };
}
