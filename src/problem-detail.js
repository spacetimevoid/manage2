import { problemCode } from './problem-label.js';
import { documentSubjects, createDetailSubjectTags } from './subject-tags.js';
import { DIFFICULTIES, normalizedDifficulty, difficultyLabel } from './metadata.js';
import { escapeHtml as esc, validatePdf } from './library.js';
import { ensureProblemData, renameProblem, renderMarkdown, problemTitle } from './problem-data.js';
import { createImageZoom } from './image-zoom.js';
import { closeReader } from './reader-transition.js';
import { fadeDeleted, revealRestored } from './deletion.js';
import { captureListMotion } from './list-motion.js';
import { isImageFile } from './uploads.js';
import { snapshotDocument } from './library.js';

export function createProblemDetail({ persist, getItems, onChange, background, getSubjects = null, deletionHistory = null, prepare = null, checkPdf = validatePdf, onOpen = () => {}, onClose = () => {}, hideReader = closeReader }) {
  const $ = id => document.getElementById(id);
  const page = $('problemDetailPage');
  const imageZoom = createImageZoom();
  let active = null, items = [], returnFocus = null;
  const subjectEditor = $('problemDetailBreadcrumb').prepend ? createDetailSubjectTags($('problemDetailBreadcrumb'), async subjects => {
      const file = active;
      if (!file) return;
      await persist({ ...file, subjects, subject: subjects[0] || '' });
      Object.assign(file, { subjects, subject: subjects[0] || '' }); onChange();
  }, getSubjects) : null;
  let contentAnimation = null, prefetchTimer = null;
  let closing = false, closingPromise = null, preparation = 0, pending = null;
  const readyImages = new Map(), decodingImages = new WeakMap();
  const urls = new Map(), timers = new Map(), pickerTargets = new Map();
  page.inert = true;
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  const urlFor = blob => {
    if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
    return urls.get(blob);
  };
  function releaseUrls(keep = new Set()) {
    imageZoom.close();
    $('statementPdfIframe').removeAttribute('src'); $('solutionPdfFrame').removeAttribute('src');
    $('statementImageGrid').replaceChildren(); $('solutionImageGrid').replaceChildren();
    for (const [blob, url] of urls) {
      if (!keep.has(blob)) { URL.revokeObjectURL(url); urls.delete(blob); }
    }
    for (const record of readyImages.keys()) if (!keep.has(record.blob)) readyImages.delete(record);
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
  async function prepareImages(file) {
    if (!globalThis.Image) return;
    await Promise.all([...(file.statementImages || []), ...(file.solution?.images || [])].map(async record => {
      const src = urlFor(record.blob);
      if (readyImages.get(record)?.src === src) return;
      const pending = decodingImages.get(record);
      if (pending?.src === src) return pending.promise;
      const image = new Image(); image.src = src;
      const promise = image.decode().then(() => {
        if (urls.get(record.blob) === src) readyImages.set(record, image);
      }).finally(() => {
        if (decodingImages.get(record)?.promise === promise) decodingImages.delete(record);
      });
      decodingImages.set(record, { src, promise });
      await promise;
    }));
  }
  function images(container, records, type) {
    container.innerHTML = records.map((image, index) => `<div class="doc-media-item" data-media-id="${esc(image.id || index)}"><img src="${esc(urlFor(image.blob))}" alt="${type === 'statement' ? 'Problem statement' : 'Solution'} image" tabindex="0" role="button" aria-label="Zoom ${type === 'statement' ? 'problem statement' : 'solution'} image"><div class="doc-media-meta"><button type="button" class="doc-action-link" data-remove-${type}="${index}">Remove</button></div></div>`).join('');
    container.querySelectorAll?.('img').forEach((placeholder, index) => {
      const image = readyImages.get(records[index]);
      if (!image || image.src !== urlFor(records[index].blob)) return;
      for (const attribute of placeholder.attributes) if (attribute.name !== 'src') image.setAttribute(attribute.name, attribute.value);
      placeholder.replaceWith(image);
    });
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
    const value = normalizedDifficulty(active.difficulty);
    $('problemDetailDiffBtn').className = `problem-diff-btn is-${value}`;
    $('problemDetailDiffBtn').textContent = difficultyLabel(value);
  }
  function markdownMode(mode) {
    page.querySelectorAll('[data-md-mode]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.mdMode === mode));
    $('solutionMdTextarea').hidden = mode === 'preview';
    $('solutionMdPreview').hidden = mode !== 'preview';
    if (mode === 'preview') $('solutionMdPreview').innerHTML = renderMarkdown(active.solution.markdown);
  }
  function show(file) {
    contentAnimation?.cancel(); contentAnimation = null;
    flush();
    const position = items.findIndex(item => item.id === file.id);
    const nearby = items.slice(Math.max(0, position - 1), position + 2);
    const media = nearby.flatMap(item => [...(item.statementImages || []), ...(item.solution?.images || [])].map(record => record.blob));
    releaseUrls(new Set([...media, file.blob, file.solution?.pdfBlob].filter(Boolean)));
    active = ensureProblemData(file); pending = null;
    const index = items.findIndex(item => item.id === active.id);
    $('problemDetailPosLabel').textContent = `${index + 1} / ${items.length}`;
    $('problemPrevItemBtn').disabled = index <= 0;
    $('problemNextItemBtn').disabled = index < 0 || index >= items.length - 1;
    if (subjectEditor) subjectEditor.set(documentSubjects(file), true);
    else $('problemDetailBreadcrumb').innerHTML = documentSubjects(file).map(tag => `<span class="subject-tag">${esc(tag)}</span>`).join(' ');
    $('problemDetailTitleInput').value = problemCode(file).replace(/^#/, '');
    $('problemDetailTitleInput').readOnly = true;
    $('problemDetailTitleInput').setCustomValidity(''); $('problemDetailTitleInput').title = '';
    $('problemDetailAddedDate').textContent = `Added ${file.addedDate}`;
    $('problemStatementNoteInput').value = file.notes;
    $('solutionMdTextarea').value = file.solution.markdown;
    $('solutionMdStatus').textContent = file.solution.markdown.trim() ? 'Saved' : 'Empty';
    $('solutionAddMenu').hidden = true;
    renderDifficulty(); renderStatement(); renderSolution(); markdownMode('write');
    page.scrollTop = 0;
    onOpen(file);
    // Prepare only the neighbouring problems, after the current one can paint.
    // No navigation/route changes and no alerts for speculative work.
    clearTimeout(prefetchTimer);
    if (prepare || globalThis.Image) {
      const sequence = preparation;
      prefetchTimer = setTimeout(() => {
        for (const next of nearby.filter(item => item !== file)) {
          Promise.resolve().then(() => prepare?.(next)).then(() => {
            if (sequence === preparation && active === file && !closing) return prepareImages(next);
          }).catch(() => {});
        }
      }, 0);
    }
  }

  function prepared(file, action) {
    const sequence = ++preparation;
    contentAnimation?.cancel(); contentAnimation = null;
    pending = file;
    if (!prepare && !globalThis.Image) return action(sequence);
    onOpen(file);
    return Promise.resolve(prepare?.(file)).then(() => { if (sequence === preparation) return prepareImages(file); }).then(() => { if (sequence === preparation) return action(sequence); }).catch(error => {
      if (sequence === preparation) { pending = null; if (active) onOpen(active); else onClose(file); window.alert(error.message || 'Unable to load problem.'); }
    });
  }
  function open(file) { if (closing) return closingPromise; return prepared(file, () => openReady(file)); }
  function openReady(file) {
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
    ++preparation;
    clearTimeout(prefetchTimer);
    if (pending) { onClose(pending); pending = null; }
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
  function transitionTo(file, sequence) {
    const container = page.querySelector('.problem-detail-container');
    if (!container?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) { show(file); return; }
    const fade = container.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
    contentAnimation = fade;
    return fade.finished.catch(() => {}).then(() => {
      if (sequence !== preparation || closing || !active) return;
      show(file);
      const reveal = container.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'both' });
      contentAnimation = reveal;
      return reveal.finished.catch(() => {}).then(() => {
        if (contentAnimation === reveal) { reveal.cancel(); contentAnimation = null; }
      });
    });
  }
  function navigate(step) {
    if (!active || closing) return;
    const index = items.findIndex(file => file.id === (pending || active).id) + step;
    if (items[index]) return prepared(items[index], sequence => transitionTo(items[index], sequence));
  }
  for (const [id, step] of [['problemPrevItemBtn', -1], ['problemNextItemBtn', 1]]) $(id).onclick = () => navigate(step);
  $('problemDetailTitleInput').oninput = e => { e.target.setCustomValidity(''); };
  function commitTitle() {
    if (!active || $('problemDetailTitleInput').readOnly) return;
    try {
      if (renameProblem(active, $('problemDetailTitleInput').value, getItems())) { save(active); onChange(); }
      $('problemDetailTitleInput').value = problemTitle(active);
    } catch (error) { $('problemDetailTitleInput').setCustomValidity(error.message); $('problemDetailTitleInput').reportValidity(); }
  }
  $('problemDetailTitleInput').onchange = commitTitle;
  $('problemDetailTitleInput').onblur = () => {
    if (active && !$('problemDetailTitleInput').value.trim()) $('problemDetailTitleInput').value = problemTitle(active);
  };
  $('problemDetailTitleInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); } };
  $('problemStatementNoteInput').oninput = e => { if (active) { active.notes = e.target.value; schedule(active); } };
  $('problemDetailDiffBtn').onclick = () => {
    if (!active) return;
    const levels = DIFFICULTIES;
    active.difficulty = levels[(levels.indexOf(normalizedDifficulty(active.difficulty)) + 1) % levels.length];
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
      void revealRestored([$('solutionPanelMarkdown')]);
    } else pick(btn.dataset.chooseSol === 'image' ? 'solutionImageInput' : 'solutionPdfInput');
  });
  async function upload(id, selected) {
    const file = pickerTargets.get(id); pickerTargets.delete(id);
    if (!file || file !== active || !selected.length) return;
    try {
      // Validate the whole selection before mutating the stored problem.
      for (const blob of selected) {
        if (id === 'solutionImageInput') {
          if (!isImageFile(blob) || !blob.size) throw new Error('Please select an image.');
        } else if (id === 'solutionPdfInput' || /\.pdf$/i.test(blob.name)) await checkPdf(blob);
        else if (!isImageFile(blob) || !blob.size) throw new Error('Please select an image or PDF.');
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
      await prepareImages(file);
      if (active !== file) { await save(file); return; }
      const finishStatement = captureListMotion($('statementImageGrid'));
      const finishSolution = captureListMotion($('solutionImageGrid'));
      const media = [...file.statementImages, ...file.solution.images].map(record => record.blob);
      releaseUrls(new Set(media)); renderStatement(); renderSolution();
      finishStatement(); finishSolution();
      if (id === 'solutionPdfInput' || (id === 'statementMediaInput' && selected.some(blob => /\.pdf$/i.test(blob.name)))) {
        void revealRestored([$(id === 'solutionPdfInput' ? 'solutionPanelPdf' : 'statementPdfEmbed')]);
      }
      await save(file);
    } catch (error) {
      const button = id === 'statementMediaInput' ? $('addStatementMediaBtn') : $('solutionAddBtn');
      button.title = error.message;
      console.error('Unable to attach problem media:', error);
    } finally { $(id).value = ''; }
  }
  for (const id of ['statementMediaInput', 'solutionImageInput', 'solutionPdfInput']) $(id).onchange = e => upload(id, [...e.target.files]);
  function removeMedia(element, keys, change) {
    const file = active;
    if (!file) return;
    if (!deletionHistory) { change(file); releaseUrls(); renderStatement(); renderSolution(); save(file); return; }
    return deletionHistory.remove('Delete this content from the problem?', async () => {
      flush();
      const before = Object.fromEntries(keys.map(key => [key, snapshotDocument(file[key])]));
      change(file);
      try { await persist(file); }
      catch (error) { Object.assign(file, before); throw error; }
      const reset = await fadeDeleted([element]);
      if (active === file) { releaseUrls(); renderStatement(); renderSolution(); $('solutionMdTextarea').value = file.solution.markdown; }
      reset();
      return async () => {
        const target = getItems().find(item => item.id === file.id);
        if (!target) throw new Error('Restore the deleted problem first.');
        const current = Object.fromEntries(keys.map(key => [key, target[key]]));
        Object.assign(target, snapshotDocument(before));
        try { await persist(target); }
        catch (error) { Object.assign(target, current); throw error; }
        if (active === target) {
          await prepareImages(target);
          if (active !== target) return;
          const media = [...target.statementImages, ...target.solution.images].map(record => record.blob);
          releaseUrls(new Set(media)); renderStatement(); renderSolution(); $('solutionMdTextarea').value = target.solution.markdown;
          const panels = keys.includes('statementImages') ? [$('statementImageGrid')] : keys.includes('blob') ? [$('statementPdfEmbed')] : [$('solutionPanelImage'), $('solutionPanelPdf'), $('solutionPanelMarkdown')].filter(panel => !panel.hidden);
          await revealRestored(panels);
        }
      };
    });
  }
  for (const [id, type] of [['statementImageGrid', 'statement'], ['solutionImageGrid', 'solution']]) $(id).onclick = e => {
    if (e.target.tagName === 'IMG') { imageZoom.open(e.target); return; }
    const button = e.target.closest(`[data-remove-${type}]`);
    if (!button || !active) return;
    const records = type === 'statement' ? active.statementImages : active.solution.images;
    const index = Number(button.dataset[type === 'statement' ? 'removeStatement' : 'removeSolution']);
    return removeMedia(button.closest?.('.doc-media-item') || $(id), [type === 'statement' ? 'statementImages' : 'solution'], file => {
      const images = type === 'statement' ? file.statementImages : file.solution.images;
      images.splice(index, 1);
      if (type === 'solution' && !images.length) file.solution.type = null;
    });
  };
  $('removeStatementPdfBtn').onclick = () => {
    if (!active) return;
    return removeMedia($('statementPdfEmbed'), ['blob', 'pageCount'], file => { delete file.blob; delete file.blobUrl; delete file.pageCount; });
  };
  $('removeSolutionPdfBtn').onclick = () => {
    if (!active) return;
    return removeMedia($('solutionPanelPdf'), ['solution'], file => { file.solution.pdfBlob = null; file.solution.pdfName = ''; file.solution.type = null; });
  };
  $('removeMarkdownSolutionBtn').onclick = () => {
    if (!active) return;
    return removeMedia($('solutionPanelMarkdown'), ['solution'], file => { file.solution.markdown = ''; file.solution.type = null; });
  };
  page.querySelectorAll('[data-md-mode]').forEach(btn => btn.onclick = () => { if (active) markdownMode(btn.dataset.mdMode); });
  $('solutionMdTextarea').oninput = e => {
    if (!active) return;
    active.solution.markdown = e.target.value; schedule(active, $('solutionMdStatus'));
  };
  page.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
        !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable && !document.querySelector?.('dialog[open]')) {
      e.preventDefault(); e.stopPropagation();
      navigate(e.key === 'ArrowLeft' ? -1 : 1); return;
    }
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
  return { open, close, get isOpen() { return !!active || !!pending || closing; }, get activeId() { return pending?.id || active?.id || null; } };
}
