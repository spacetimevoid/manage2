import { documentSubjects, hasSubject } from '../src/subject-tags.js';
import { normalizeSubject, todayDate, renamedDocument, documentTitle, validateDocumentName, normalizedDifficulty } from '../src/metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateUpload, uploadName, isImageFile } from '../src/uploads.js';
import { problemTitle, renameProblem } from '../src/problem-data.js';
import { dateOf, parseDate, collectionFiles } from '../src/library.js';

const png = () => new File([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64'))], 'question.png', { type: 'image/png' });
function form(view) {
  const elements = new Map(), save = { disabled: false }, stored = [];
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, classList: { values: new Set(), add() {}, remove() {}, toggle(key, value) { if(value) this.values.add(key); else this.values.delete(key); } }, setAttribute() {}, focus() {},
      addEventListener() {}, reset() {}, prepend() {}, closest: () => dateField, querySelector: () => save });
    return elements.get(id);
  };
  const browseLabel = {}, dateField = { before() {} }, dateLabel = {};
  let pdfLoads = 0;
  const context = vm.createContext({ documentSubjects, hasSubject,
    $ , subjectTags: { set(items, visible) { this.items = items; this.visible = visible; }, get() { return this.items.length ? this.items : ['math']; }, focus() {} }, topicPicker: { close() {} }, activeView: view, activeSubject: 'all', currentPage: 1, files: [], lastFocus: null, app: {}, crypto,
    viewName: () => context.activeView === 'problems' ? 'Problems' : 'Sources',
    document: { activeElement: null, body: { style: {} }, querySelector: selector => selector.includes('modalBrowseBtn') ? browseLabel : dateLabel },
    validateUpload: (file, view) => validateUpload(file, view, async () => {}), uploadName, isImageFile, parseDate, dateOf, collectionFiles, normalizeSubject, todayDate, renamedDocument, documentTitle, validateDocumentName, normalizedDifficulty,
    visibleFiles: () => context.files, async persist(file) { stored.push(structuredClone(file)); }, renderSidebar() {}, renderFiles() {}, renderSourceOutline() {},
    pdfjsLib: { getDocument() { pdfLoads++; return { promise: Promise.resolve({ numPages: 4 }), async destroy() {} }; } },
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function setModal('), source.indexOf('const contextMenu =')), context);
  vm.runInContext('setModal(true)', context);
  return { $, context, browseLabel, dateField, stored, get pdfLoads() { return pdfLoads; }, async submit(file) {
    $('pdfFileInput').files = [file]; $('modalPathFileNameInput').value = file.name;
    $('modalDueDateInput').value = ''; $('modalDifficultyInput').value = 'hard';
    await $('uploadPdfForm').onsubmit({ preventDefault() {}, submitter: save });
  } };
}

test('Problems image upload uses an image/PDF picker and saves the image in Problem Statement without PDF parsing', async () => {
  const app = form('problems');
  assert.equal(app.browseLabel.textContent, 'Select problem');
  assert.equal(app.$('pdfFileInput').accept, 'image/*,application/pdf,.pdf');
  await app.submit(png());
  const [file] = app.stored;
  assert.equal(app.pdfLoads, 0); assert.equal(file.kind, 'problem'); assert.equal(file.difficulty, 'hard');
  assert.equal(file.blob, undefined); assert.equal(file.statementImages[0].blob.type, 'image/png');
  assert.equal(file.statementImages[0].blob.size, png().size);
  assert.equal(problemTitle(file), 'question');
  renameProblem(file, 'Renamed', []); assert.equal(file.name, 'Renamed.png');
});
test('Problems still accepts PDFs and Sources remains PDF-only', async () => {
  const pdf = new File(['%PDF-1.7\n'], 'exam.pdf', { type: 'application/pdf' });
  const problems = form('problems'); await problems.submit(pdf);
  assert.equal(problems.pdfLoads, 1); assert.equal(problems.stored[0].pageCount, 4);
  const sources = form('sources');
  assert.equal(sources.browseLabel.textContent, 'Select source'); assert.equal(sources.$('pdfFileInput').accept, 'application/pdf,.pdf');
  await sources.submit(png()); assert.equal(sources.stored.length, 0);
  await sources.submit(pdf); assert.equal(sources.stored[0].blob.type, 'application/pdf');
  assert.equal(sources.stored[0].kind, undefined);
});
test('AI suggestions are available for problem images, while PDFs still upload with manual tags', () => {
  const app = form('problems');
  const button = app.$('modalSuggestTagsBtn');
  const input = app.$('pdfFileInput');
  assert.equal(button.disabled, true);
  input.files = [png()];
  input.onchange();
  assert.equal(button.disabled, false);
  input.files = [new File(['%PDF-1.7\n'], 'exam.pdf', { type: 'application/pdf' })];
  input.onchange();
  assert.equal(button.disabled, true);
});
test('broken images are rejected and image uploads never receive a forced PDF extension', async () => {
  await assert.rejects(validateUpload(png(), 'problems', async () => { throw new Error('decode failed'); }), /valid image or PDF/);
  await assert.rejects(validateUpload(null, 'problems'), /image or PDF/);
  assert.equal(uploadName('custom', png(), 'image'), 'custom.png');
  assert.equal(uploadName('custom.pdf', png(), 'image'), 'custom.png');
  assert.equal(uploadName('exam', new File([], 'original.pdf'), 'pdf'), 'exam.pdf');
});

test('Edit saves metadata without requiring or replacing attachments and preserves notes', async () => {
  const app = form('problems');
  const file = { id: 'existing', name: 'old.png', subject: 'math', topic: 'Old', kind: 'problem', addedDate: '16/11/2026', difficulty: 'hard', notes: 'Keep', statementImages: [{ blob: png() }] };
  app.context.files.push(file); app.context.editTarget = file;
  app.$('pdfFileInput').files = [];
  vm.runInContext('setModal(true, editTarget)', app.context);
  assert.equal(app.$('modalPathFileNameInput').value, 'old');
  app.$('modalPathFileNameInput').value = 'edited.png';
  await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
  assert.equal(app.stored.length, 1); assert.equal(app.context.files.length, 1);
  assert.equal(file.name, 'old.png'); assert.equal(file.topic, 'Old');
  assert.equal(file.notes, 'Keep'); assert.equal(file.statementImages.length, 1); assert.equal(app.pdfLoads, 0);
});

test('cancel keeps Edit fields hidden throughout the closing transition and Upload resets them', () => {
  const app = form('sources');
  const now = new Date(), today = String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();
  assert.equal(app.$('modalDueDateInput').value, today);
  app.context.editTarget = { name: 'a.pdf', subject: 'math', dueDate: '01/01/2020' };
  vm.runInContext('setModal(true, editTarget)', app.context);
  assert.equal(app.$('modalDueDateInput').value, '01/01/2020');
  app.$('modalCancelBtn').onclick();
  assert.equal(app.$('uploadModalBackdrop').classList.values.has('is-editing'), true);
  app.$('uploadPdfBtn').onclick();
  assert.equal(app.$('uploadModalBackdrop').classList.values.has('is-editing'), false);
  assert.equal(app.$('modalDueDateInput').value, today);
});

test('Sources Edit preserves the original extension, optional dates and duplicate checks', async () => {
  for (const view of ['sources']) {
    const app = form(view);
    const file = { id: 'a', name: 'original.pdf', subject: 'math', topic: 'Topic', ...(view === 'problems' ? { kind: 'problem', addedDate: '' } : { dueDate: '' }) };
    app.context.files.push(file, { ...file, id: 'b', name: 'taken.pdf', subject: 'physics', subjects: ['physics', 'geometry'] }); app.context.editTarget = file;
    app.$('pdfFileInput').files = []; vm.runInContext('setModal(true, editTarget)', app.context);
    assert.deepEqual(Array.from(app.context.subjectTags.items), ['math']);
    app.context.subjectTags.items = ['math', 'geometry'];
    app.$('modalPathFileNameInput').value = 'TAKEN';
    await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
    assert.equal(app.stored.length, 0); assert.match(app.$('modalErrorMsg').textContent, /already exists/);
    app.$('modalPathFileNameInput').value = 'renamed';
    await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
    assert.equal(file.name, 'renamed.pdf'); assert.equal(dateOf(file), '');
    assert.equal(file.topic, 'Topic');
    assert.deepEqual(Array.from(file.subjects), ['math', 'geometry']);
  }
});
test('a slow problem upload uses the collection and metadata captured before navigation', async () => {
  const app = form('problems'); let finish;
  app.context.validateUpload = () => new Promise(resolve => { finish = resolve; });
  const saved = app.submit(png());
  app.context.activeView = 'sources';
  app.$('modalDifficultyInput').value = 'easy'; finish('image'); await saved;
  assert.equal(app.stored[0].kind, 'problem'); assert.equal(app.stored[0].topic, '');
  assert.equal(app.stored[0].difficulty, 'hard'); assert.equal(app.stored[0].statementImages.length, 1);
});

test('source extraction reuses the Problem upload form, saves one linked image and returns to its PDF', async () => {
  const app = form('sources');
  const source = { id: 'source', name: 'exam.pdf', subject: 'math', subjects: ['math', 'algebra'], topic: 'Algebra' };
  app.context.files.push(source);
  app.context.extracted = { source, blob: png(), location: { sourceId: source.id, page: 2, rect: { x: .1, y: .3, width: .5, height: .2 } } };
  app.$('pdfFileInput').files = [];
  vm.runInContext('setModal(true, null, extracted)', app.context);
  assert.equal(app.browseLabel.textContent, 'Select problem');
  assert.equal(app.$('modalFileNameField').hidden, true);
  assert.equal(app.$('pdfViewerPage').inert, true);
  app.$('modalPathFileNameInput').value = 'Question 1';
  await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
  assert.equal(app.stored.length, 1); const saved = app.stored[0];
  assert.equal(saved.kind, 'problem'); assert.equal(saved.sourceLocation.page, 2);
  assert.deepEqual(Array.from(saved.subjects), ['math', 'algebra']);
  assert.equal(saved.sourceLocation.sourceId, source.id); assert.equal(saved.statementImages.length, 1);
  assert.equal(app.$('pdfViewerPage').inert, false); assert.equal(app.context.app.inert, true);
  assert.equal(app.context.document.body.style.overflow, 'hidden');
});
test('cancel and failed saves create neither a linked problem nor an outline entry', async () => {
  const app = form('sources');
  const source = { id: 'source', subject: 'math', topic: 'Geometry' }; app.context.files.push(source);
  app.context.extracted = { source, blob: png(), location: { sourceId: source.id, page: 1, rect: { x: 0, y: 0, width: 1, height: .5 } } };
  vm.runInContext('setModal(true, null, extracted)', app.context); app.$('modalCancelBtn').onclick();
  assert.equal(app.stored.length, 0); assert.equal(app.context.files.length, 1);
  vm.runInContext('setModal(true, null, extracted)', app.context);
  app.context.persist = async () => { throw Error('Offline'); };
  await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
  assert.equal(app.context.files.length, 1); assert.equal(app.stored.length, 0);
  assert.match(app.$('modalErrorMsg').textContent, /Offline/);
  assert.equal(app.$('uploadModalBackdrop').classList.values.has('is-open'), true);
});

test('Problem date input is hidden and new Problems always use the date at save, while Sources keep Due date', async () => {
  const app = form('problems');
  assert.equal(app.dateField.hidden, true);
  app.context.todayDate = () => '01/01/2027';
  await app.submit(png());
  assert.equal(app.stored[0].addedDate, '01/01/2027');
  const sources = form('sources'); assert.equal(sources.dateField.hidden, false);
});
test('Problem Edit preserves the original added date and ignores the shared date input', async () => {
  const app = form('problems');
  const file = { id: 'p', name: 'old.png', subject: 'math', topic: 'Geometry', kind: 'problem', addedDate: '02/03/2025' };
  app.context.files.push(file); app.context.editTarget = file;
  app.$('pdfFileInput').files = [];
  vm.runInContext('setModal(true, editTarget)', app.context);
  app.$('modalDueDateInput').value = 'invalid';
  await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
  assert.equal(app.stored[0].addedDate, '02/03/2025');
});

test('Upload and Edit show only titles while saved PDF and image names preserve their format', async () => {
  for (const [view, name, type] of [['sources', 'Exam.v2.PDF', 'application/pdf'], ['problems', 'Question.png', 'image/png']]) {
    const app = form(view), file = { id: 'existing', name, subject: 'math', topic: 'Topic', kind: view === 'problems' ? 'problem' : undefined };
    app.context.editTarget = file;
    vm.runInContext('setModal(true, editTarget)', app.context);
    assert.equal(app.$('modalPathFileNameInput').value, documentTitle(name));
    vm.runInContext('setModal(true)', app.context);
    app.$('pdfFileInput').files = [new File(['bytes'], name, { type })];
    app.$('pdfFileInput').onchange();
    assert.equal(app.$('modalPathFileNameInput').value, documentTitle(name));
    app.$('modalPathFileNameInput').value = 'Custom title';
    app.$('pdfFileInput').onchange(); assert.equal(app.$('modalPathFileNameInput').value, 'Custom title');
    assert.equal(renamedDocument(documentTitle(name), name).toLowerCase(), name.toLowerCase());
  }
  assert.equal(documentTitle('Chapter 1.2'), 'Chapter 1.2');
});

test('images without MIME metadata upload as images instead of being parsed as PDFs', async () => {
  for (const type of ['', 'application/octet-stream']) {
    const image = new File([await png().arrayBuffer()], 'question.PNG', { type });
    assert.equal(await validateUpload(image, 'problems', async () => {}), 'image');
    const app = form('problems'); await app.submit(image);
    assert.equal(app.pdfLoads, 0); assert.equal(app.stored[0].statementImages[0].blob.size, image.size);
    await assert.rejects(validateUpload(image, 'sources'), /PDF/);
  }
  assert.equal(isImageFile(new File(['text'], 'text.png', { type: 'text/plain' })), false);
  await assert.rejects(validateUpload(new File(['bad'], 'bad.png'), 'problems', async () => { throw Error('invalid'); }), /valid image/);
});

test('Problems upload uses the file name automatically and persists all subject tags; edit preserves its name', async () => {
  const app = form('problems');
  app.context.subjectTags.items = ['math', 'geometry'];
  await app.submit(png());
  const file = app.context.files[0];
  assert.equal(file.name, 'question.png'); assert.deepEqual(Array.from(file.subjects), ['math', 'geometry']);
  app.context.editTarget = file; vm.runInContext('setModal(true, editTarget)', app.context);
  assert.deepEqual(Array.from(app.context.subjectTags.items), ['math', 'geometry']);
  app.context.subjectTags.items = ['algebra', 'math'];
  await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
  assert.equal(file.name, 'question.png'); assert.deepEqual(Array.from(file.subjects), ['algebra', 'math']);
});

test('pasted file is submitted through normal upload validation without a native file selection', async () => {
 const app=form('problems'); const image=png();
 app.context.pasted=image;
 vm.runInContext('setModal.pastedFile = pasted', app.context);
 app.$('pdfFileInput').files=[];
 await app.$('uploadPdfForm').onsubmit({preventDefault(){}});
 assert.equal(app.stored.length,1); assert.equal(app.stored[0].statementImages[0].blob.size,image.size);
 vm.runInContext('setModal(true)', app.context); assert.equal(app.context.setModal.pastedFile,null);
});
