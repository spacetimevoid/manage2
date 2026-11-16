import test from 'node:test';
import assert from 'node:assert/strict';
import { createProblemDetail } from '../src/problem-detail.js';
import { ensureProblemData, renameProblem, renderMarkdown } from '../src/problem-data.js';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary, readDocuments, saveDocuments } from '../src/library.js';

function mount(files, options = {}) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const elements = new Map(), writes = [];
  const make = () => ({
    hidden: false, disabled: false, value: '', style: {}, dataset: {}, attrs: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    removeAttribute(k) { delete this.attrs[k]; delete this[k]; },
    setCustomValidity(message) { this.validation = message; }, reportValidity() {},
    focus() { globalThis.document.activeElement = this; }, click() {},
    replaceChildren() { this.innerHTML = ''; }, addEventListener(type, callback) { this.listeners[type] = callback; }, contains() { return false; },
    getClientRects() { return [1]; },
  });
  const $ = id => { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); };
  const choices = ['image', 'pdf', 'markdown'].map(type => Object.assign(make(), { dataset: { chooseSol: type } }));
  const modes = ['write', 'preview'].map(mode => Object.assign(make(), { dataset: { mdMode: mode } }));
  $('problemDetailPage').querySelectorAll = selector => selector === '[data-choose-sol]' ? choices : selector === '[data-md-mode]' ? modes : [];
  $('problemDetailPage').querySelector = () => null;
  globalThis.document = { getElementById: $, activeElement: null, body: { style: {} }, addEventListener() {}, querySelectorAll: () => [] };
  globalThis.window = { addEventListener() {} };
  const background = {};
  const detail = createProblemDetail({ background, getItems: () => files, onChange() {},
    hideReader(page, finish) { page.classList.remove('is-open'); finish(); return Promise.resolve(); },
    async persist(file) { writes.push(structuredClone(file)); }, ...options });
  return { $, detail, background, writes, choices, modes,
    async attach(id, file) {
      $(id).files = [file];
      return $(id).onchange({ target: $(id) });
    },
    cleanup() { detail.close(); Object.assign(globalThis, previous); },
  };
}
const problem = id => ({ id, kind: 'problem', name: `${id}.pdf`, topic: 'Geometry', subject: 'math', difficulty: 'easy', addedDate: '15/11/2026', notes: '' });

test('problem details load the actual statement, navigate in supplied order and flush notes to the correct record', () => {
  const a = problem('a'), b = problem('b'); a.blob = new Blob(['%PDF-1.7']); a.notes = 'Existing notes';
  const app = mount([a, b]);
  try {
    app.detail.open(a);
    assert.equal(app.$('problemDetailTitleInput').value, 'a');
    assert.equal(app.$('problemStatementNoteInput').value, 'Existing notes');
    assert.equal(app.$('statementPdfEmbed').hidden, false);
    assert.match(app.$('statementPdfIframe').src, /^blob:/);
    assert.equal(app.$('problemPrevItemBtn').disabled, true);
    app.$('problemStatementNoteInput').oninput({ target: { value: 'Changed a' } });
    app.$('problemNextItemBtn').onclick();
    assert.equal(app.$('problemDetailPosLabel').textContent, '2 / 2');
    assert.equal(app.$('problemNextItemBtn').disabled, true);
    assert.equal(app.$('statementPdfEmbed').hidden, true);
    assert.equal(app.writes[0].id, 'a'); assert.equal(app.writes[0].notes, 'Changed a');
    assert.equal(b.notes, '');
    app.detail.close(); assert.equal(app.background.inert, false); assert.equal(app.detail.isOpen, false);
  } finally { app.cleanup(); }
});

test('title, difficulty, Markdown write/preview and removals operate on the active problem', () => {
  const file = problem('a'), app = mount([file]);
  try {
    app.detail.open(file);
    app.$('problemDetailTitleInput').value = 'Renamed'; app.$('problemDetailTitleInput').onchange();
    assert.equal(file.name, 'Renamed.pdf');
    app.$('problemDetailDiffBtn').onclick(); assert.equal(file.difficulty, 'med');
    app.choices[2].onclick();
    app.$('solutionMdTextarea').oninput({ target: { value: '# Proof\n**Done**' } });
    app.modes[1].onclick();
    assert.match(app.$('solutionMdPreview').innerHTML, /<h1>Proof<\/h1>.*<strong>Done<\/strong>/);
    assert.equal(app.$('solutionMdTextarea').hidden, true);
    app.$('removeMarkdownSolutionBtn').onclick(); assert.equal(file.solution.type, null);
    assert.equal(app.$('solutionEmptyState').hidden, false);
  } finally { app.cleanup(); }
});

test('statement images and solution PDFs use Blob records and removals do not regenerate deleted media', async () => {
  const file = problem('a'), app = mount([file]);
  try {
    app.detail.open(file); app.$('addStatementMediaBtn').onclick();
    await app.attach('statementMediaInput', new File(['image bytes'], 'question.png', { type: 'image/png' }));
    assert.equal(file.statementImages.length, 1);
    assert.ok(file.statementImages[0].blob instanceof Blob);
    app.$('statementImageGrid').onclick({ target: { closest: () => ({ dataset: { removeStatement: '0' } }) } });
    assert.equal(file.statementImages.length, 0);
    assert.equal(app.$('statementEmptyHint').hidden, false);
    app.choices[1].onclick();
    await app.attach('solutionPdfInput', new File(['%PDF-1.7\nbytes'], 'solution.pdf', { type: 'application/pdf' }));
    assert.equal(file.solution.type, 'pdf'); assert.ok(file.solution.pdfBlob instanceof Blob);
    assert.equal(app.$('solutionPanelPdf').hidden, false);
    app.$('removeSolutionPdfBtn').onclick(); assert.equal(file.solution.pdfBlob, null);
    app.detail.close(); app.detail.open(file); assert.equal(app.$('solutionPanelPdf').hidden, true);
    assert.ok(app.writes.every(record => !JSON.stringify(record).includes('blob:')));
  } finally { app.cleanup(); }
});

test('notes, statement media and solution content survive storage reopen', async () => {
  const factory = new IDBFactory(); let db = await openLibrary(factory);
  const file = ensureProblemData(problem('persisted'));
  file.notes = 'Independent notes'; file.statementImages.push({ name: 'problem.png', blob: new Blob(['image']) });
  file.solution = { type: 'pdf', markdown: 'Proof draft', images: [], pdfBlob: new Blob(['%PDF-1.7']), pdfName: 'proof.pdf' };
  await saveDocuments(db, [file]); db.close(); db = await openLibrary(factory);
  const [stored] = await readDocuments(db);
  assert.equal(stored.notes, 'Independent notes');
  assert.equal(await stored.statementImages[0].blob.text(), 'image');
  assert.equal(await stored.solution.pdfBlob.text(), '%PDF-1.7');
  assert.equal(stored.solution.markdown, 'Proof draft'); db.close();
});

test('Markdown escapes HTML and preserves code; renaming prevents empty and duplicate titles', () => {
  assert.doesNotMatch(renderMarkdown('<img src=x onerror="alert(1)">'), /<img/);
  assert.match(renderMarkdown('```\n**literal** <script>\n```'), /<pre><code>\*\*literal\*\* &lt;script&gt;/);
  const file = problem('a');
  assert.equal(renameProblem(file, ' ', []), false);
  assert.throws(() => renameProblem(file, 'folder/title', []), /slashes/);
  assert.throws(() => renameProblem(file, 'b', [file, problem('b')]), /already exists/);
});

test('problem close preserves media until the fade ends and reports the current item on next/previous navigation', async () => {
  const a = problem('a'), b = problem('b');
  a.blob = new Blob(['%PDF-1.7']);
  const opened = [], closed = [];
  let finishFade, settle;
  const app = mount([a, b], {
    onOpen: file => opened.push(file.id), onClose: file => closed.push(file.id),
    hideReader(_page, finish) {
      return new Promise(resolve => { finishFade = finish; settle = resolve; });
    },
  });
  try {
    app.detail.open(a);
    app.$('problemNextItemBtn').onclick(); app.$('problemPrevItemBtn').onclick();
    assert.deepEqual(opened, ['a', 'b', 'a']);
    const statementUrl = app.$('statementPdfIframe').src;
    const done = app.detail.close();
    assert.equal(app.detail.isOpen, true);
    assert.equal(app.background.inert, true);
    assert.equal(app.$('statementPdfIframe').src, statementUrl);
    assert.deepEqual(closed, ['a']);
    assert.equal(app.detail.close(), done, 'repeated close waits for the same animation');
    finishFade(); settle(); await done;
    assert.equal(app.detail.isOpen, false);
    assert.equal(app.$('statementPdfIframe').src, undefined);
    assert.equal(app.background.inert, false);
  } finally { app.cleanup(); }
});

test('restoring a problem waits for its media and cancelled loading never opens a stale problem', async () => {
  const file = problem('lazy'); let finish;
  const loaded = new Promise(resolve => { finish = resolve; });
  const routes = [];
  const app = mount([file], { prepare: () => loaded, onOpen: file => routes.push(file.id), onClose: () => routes.push('closed') });
  try {
    const opened = app.detail.open(file);
    assert.equal(app.detail.activeId, file.id); assert.equal(app.detail.isOpen, true);
    assert.equal(app.$('problemDetailTitleInput').value, '');
    app.detail.close(); finish(); await opened;
    assert.equal(app.detail.isOpen, false); assert.equal(app.$('problemDetailTitleInput').value, '');
    await app.detail.open(file);
    assert.equal(app.$('problemDetailTitleInput').value, 'lazy');
  } finally { app.cleanup(); }
});

test('rapid problem navigation follows the pending target and a failed load restores the visible route', async () => {
  const files = ['a', 'b', 'c'].map(problem), requests = new Map(), routes = [];
  const app = mount(files, { prepare: file => file.id === 'a' ? Promise.resolve() : new Promise((resolve, reject) => requests.set(file.id, { resolve, reject })), onOpen: file => routes.push(file.id) });
  globalThis.window.alert = () => {};
  try {
    await app.detail.open(files[0]);
    app.$('problemNextItemBtn').onclick(); app.$('problemNextItemBtn').onclick();
    assert.equal(app.detail.activeId, 'c');
    requests.get('b').resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.$('problemDetailTitleInput').value, 'a');
    requests.get('c').reject(Error('Offline')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.detail.activeId, 'a'); assert.equal(routes.at(-1), 'a');
    assert.equal(app.$('problemDetailTitleInput').value, 'a');
  } finally { app.cleanup(); }
});

test('left/right keys share navigation with buttons and preserve text cursor controls', () => {
  const files = ['a', 'b', 'c'].map(problem), app = mount(files);
  try {
    app.detail.open(files[0]);
    const key = (key, target = { tagName: 'BUTTON' }) => app.$('problemDetailPage').listeners.keydown({ key, target, preventDefault() {}, stopPropagation() {} });
    key('ArrowRight'); assert.equal(app.detail.activeId, 'b');
    key('ArrowLeft', { tagName: 'TEXTAREA' }); assert.equal(app.detail.activeId, 'b');
    key('ArrowLeft', { tagName: 'INPUT' }); assert.equal(app.detail.activeId, 'b');
    key('ArrowLeft'); assert.equal(app.detail.activeId, 'a');
    key('ArrowLeft'); assert.equal(app.detail.activeId, 'a');
    app.$('problemNextItemBtn').onclick(); assert.equal(app.detail.activeId, 'b');
  } finally { app.cleanup(); }
});

test('navigation retains the current problem until image decoding and fade-out finish, then fades in without translation', async () => {
  const beforeImage = globalThis.Image;
  let decoded;
  globalThis.Image = class { decode() { return new Promise(resolve => { decoded = resolve; }); } };
  const a = problem('a'), b = problem('b');
  b.statementImages = [{ blob: new Blob(['image']) }];
  const app = mount([a, b]);
  const animations = [];
  try {
    await app.detail.open(a);
    app.$('problemDetailPage').scrollTop = 400;
    app.$('problemDetailPage').querySelector = () => ({ animate(frames, options) {
      let finish; const finished = new Promise(resolve => { finish = resolve; });
      const animation = { frames, options, finished, finish, cancel() {} }; animations.push(animation); return animation;
    } });
    const changed = app.$('problemNextItemBtn').onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.$('problemDetailTitleInput').value, 'a'); assert.equal(animations.length, 0);
    assert.equal(app.$('problemDetailPage').scrollTop, 400);
    decoded(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(animations.length, 1); assert.equal(app.$('problemDetailTitleInput').value, 'a');
    animations[0].finish(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.$('problemDetailTitleInput').value, 'b'); assert.equal(animations.length, 2);
    assert.equal(app.$('problemDetailPage').scrollTop, 0);
    assert.ok(animations.every(animation => animation.frames.every(frame => frame.transform === undefined)));
    animations[1].finish(); await changed;
  } finally { app.cleanup(); if (beforeImage === undefined) delete globalThis.Image; else globalThis.Image = beforeImage; }
});


test('adjacent problem images decode before navigation and are reused when moving back', async () => {
  const beforeImage = globalThis.Image;
  let decodes = 0;
  globalThis.Image = class { async decode() { decodes++; } };
  const files = ['a', 'b', 'c', 'd'].map(id => ({ ...problem(id), statementImages: [{ blob: new Blob([id]) }] }));
  const app = mount(files);
  try {
    await app.detail.open(files[0]);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(decodes, 2, 'only current and next problem decode at the beginning');
    await app.$('problemNextItemBtn').onclick();
    assert.equal(decodes, 2, 'next problem already decoded');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(decodes, 3);
    await app.$('problemPrevItemBtn').onclick();
    assert.equal(decodes, 3, 'returning to previous problem reuses decoded pixels');
    assert.equal(app.$('problemDetailTitleInput').value, 'a');
  } finally { app.cleanup(); if (beforeImage === undefined) delete globalThis.Image; else globalThis.Image = beforeImage; }
});
