import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { closeReader } from '../src/reader-transition.js';

function element(open = true) {
  const classes = new Set(open ? ['is-open'] : []), listeners = new Map();
  return {
    classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
    emit(type, event) { listeners.get(type)?.(event); },
    setAttribute() {}, focus() {}, replaceChildren() { this.cleared = true; },
  };
}

test('closing retains content until the reader opacity transition ends', async () => {
  const page = element(), viewport = element(false);
  const done = closeReader(page, () => viewport.replaceChildren());
  assert.equal(page.classList.contains('is-open'), false);
  assert.equal(viewport.cleared, undefined);
  page.emit('transitionend', { target: {}, propertyName: 'opacity' });
  assert.equal(viewport.cleared, undefined, 'child transitions must not clear the PDF');
  page.emit('transitionend', { target: page, propertyName: 'opacity' });
  await done; assert.equal(viewport.cleared, true);
});

test('reduced motion and closing an unopened reader finish without an animation delay', async () => {
  let finished = false;
  await closeReader(element(false), () => { finished = true; });
  assert.equal(finished, true);
  const before = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    finished = false;
    const promise = closeReader(element(), () => { finished = true; });
    assert.equal(finished, true); await promise;
  } finally {
    if (before) globalThis.matchMedia = before; else delete globalThis.matchMedia;
  }
});

test('opening waits for the first painted page; closing keeps the bitmap and background locked until the fade finishes', async () => {
  const elements = new Map();
  const $ = id => { if (!elements.has(id)) elements.set(id, element(false)); return elements.get(id); };
  let ready, finishClose;
  const firstPaint = new Promise(resolve => { ready = resolve; });
  let destroyed = false;
  const doc = { numPages: 3 };
  const task = { promise: Promise.resolve(doc), async destroy() { destroyed = true; } };
  const context = vm.createContext({
    $, Blob, db: null, viewerClosing: false, viewerClosePromise: null, activeFile: null, viewerToken: 0, loadingTask: null, pdfDoc: null,
    lastFocus: null, viewerPage: 1, zoom: 100,
    file: { name: 'test.pdf', subject: 'math', topic: 'Math', dueDate: '', blobUrl: 'blob:test' },
    pdfjsLib: { getDocument: () => task }, esc: value => value, console,
    document: { activeElement: null, body: { style: {} } }, app: {},
    syncToolbar() {}, renderPages: () => firstPaint, saveNote() {}, cancelRenders() {}, setSelectMode() {}, renderFiles() {},
    rememberReader() {}, forgetReader() {},
    closeReader(_page, finish) { $ ('pdfViewerPage').classList.remove('is-open'); finishClose = finish; },
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function openViewer('), source.indexOf("$('fileList').onclick")), context);
  const opened = vm.runInContext('openViewer(file)', context);
  await Promise.resolve();
  assert.equal($('pdfViewerPage').classList.contains('is-open'), false);
  assert.equal($('pdfCanvasViewport').textContent, 'Loading PDF\u2026');
  ready(); await opened;
  assert.equal($('pdfViewerPage').classList.contains('is-open'), true);
  vm.runInContext('closeViewer()', context);
  assert.equal($('pdfCanvasViewport').cleared, undefined);
  assert.equal(context.app.inert, true); assert.equal(destroyed, false);
  await vm.runInContext('openViewer(file)', context);
  assert.equal(context.activeFile, null, 'opening is guarded while the old reader is fading out');
  finishClose();
  assert.equal($('pdfCanvasViewport').cleared, true); assert.equal(destroyed, true);
  assert.equal(context.app.inert, false); assert.equal(context.viewerClosing, false);
});
