import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateUpload, uploadName } from '../src/uploads.js';
import { problemTitle, renameProblem } from '../src/problem-data.js';
import { parseDate } from '../src/library.js';

const png = () => new File([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64'))], 'question.png', { type: 'image/png' });
function form(view) {
  const elements = new Map(), save = { disabled: false }, stored = [];
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, focus() {},
      addEventListener() {}, reset() {}, querySelector: () => save });
    return elements.get(id);
  };
  const browseLabel = {}, dateLabel = {};
  let pdfLoads = 0;
  const context = vm.createContext({
    $, activeView: view, activeSubject: 'all', currentPage: 1, files: [], lastFocus: null, app: {}, crypto,
    viewName: () => context.activeView === 'problems' ? 'Problems' : 'Sources',
    document: { activeElement: null, body: { style: {} }, querySelector: selector => selector.includes('modalBrowseBtn') ? browseLabel : dateLabel },
    validateUpload: (file, view) => validateUpload(file, view, async () => {}), uploadName, parseDate,
    visibleFiles: () => context.files, async persist(file) { stored.push(structuredClone(file)); }, renderSidebar() {}, renderFiles() {},
    pdfjsLib: { getDocument() { pdfLoads++; return { promise: Promise.resolve({ numPages: 4 }), async destroy() {} }; } },
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function setModal('), source.indexOf('function syncToolbar(')), context);
  vm.runInContext('setModal(true)', context);
  return { $, context, browseLabel, stored, get pdfLoads() { return pdfLoads; }, async submit(file) {
    $('pdfFileInput').files = [file]; $('modalPathFileNameInput').value = file.name;
    $('modalTopicInput').value = 'Geometry'; $('modalDueDateInput').value = ''; $('modalDifficultyInput').value = 'hard';
    await $('uploadPdfForm').onsubmit({ preventDefault() {}, submitter: save });
  } };
}

test('Problems image upload uses an image/PDF picker and saves the image in Problem Statement without PDF parsing', async () => {
  const app = form('problems');
  assert.equal(app.browseLabel.textContent, 'Select image or PDF');
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
  assert.equal(sources.browseLabel.textContent, 'Select PDF'); assert.equal(sources.$('pdfFileInput').accept, 'application/pdf,.pdf');
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
