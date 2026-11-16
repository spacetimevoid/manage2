import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateUpload, uploadName } from '../src/uploads.js';
import { problemTitle, renameProblem } from '../src/problem-data.js';
import { dateOf, parseDate } from '../src/library.js';

const png = () => new File([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64'))], 'question.png', { type: 'image/png' });
function form(view) {
  const elements = new Map(), save = { disabled: false }, stored = [];
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, classList: { values: new Set(), add() {}, remove() {}, toggle(key, value) { if(value) this.values.add(key); else this.values.delete(key); } }, setAttribute() {}, focus() {},
      addEventListener() {}, reset() {}, querySelector: () => save });
    return elements.get(id);
  };
  const browseLabel = {}, dateLabel = {};
  let pdfLoads = 0;
  const context = vm.createContext({
    $, activeView: view, activeSubject: 'all', currentPage: 1, files: [], lastFocus: null, app: {}, crypto,
    viewName: () => context.activeView === 'problems' ? 'Problems' : 'Sources',
    document: { activeElement: null, body: { style: {} }, querySelector: selector => selector.includes('modalBrowseBtn') ? browseLabel : dateLabel },
    validateUpload: (file, view) => validateUpload(file, view, async () => {}), uploadName, parseDate, dateOf,
    visibleFiles: () => context.files, async persist(file) { stored.push(structuredClone(file)); }, renderSidebar() {}, renderFiles() {},
    pdfjsLib: { getDocument() { pdfLoads++; return { promise: Promise.resolve({ numPages: 4 }), async destroy() {} }; } },
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function setModal('), source.indexOf('const contextMenu =')), context);
  vm.runInContext('setModal(true)', context);
  return { $, context, browseLabel, stored, get pdfLoads() { return pdfLoads; }, async submit(file) {
    $('pdfFileInput').files = [file]; $('modalPathFileNameInput').value = file.name;
    $('modalPathSubjectInput').value = 'math';
    $('modalTopicInput').value = 'Geometry'; $('modalDueDateInput').value = ''; $('modalDifficultyInput').value = 'hard';
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
  assert.equal(app.$('modalPathFileNameInput').value, 'old.png');
  app.$('modalPathFileNameInput').value = 'edited.png'; app.$('modalTopicInput').value = 'New';
  await app.$('uploadPdfForm').onsubmit({ preventDefault() {} });
  assert.equal(app.stored.length, 1); assert.equal(app.context.files.length, 1);
  assert.equal(file.name, 'edited.png'); assert.equal(file.topic, 'New');
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
