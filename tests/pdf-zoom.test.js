import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const frames = new Map(), observers = [], tasks = [];
  let frameId = 0;
  const viewport = {
    scrollTop: 1244, scrollLeft: 0, clientWidth: 800, clientHeight: 700, clears: 0,
    get scrollHeight() { return 48 + this.children.reduce((h, s) => h + s.offsetHeight + 20, 0); },
    get scrollWidth() { return Math.max(this.clientWidth, ...this.children.map(s => parseFloat(s.style.width))); },
    replaceChildren() { this.clears++; this.children = []; },
    scrollTo({ top, left }) { this.scrollTop = top; if (left !== undefined) this.scrollLeft = left; },
  };
  viewport.children = [1, 2, 3].map(n => ({
    dataset: { pageNumber: String(n), pdfWidth: 600, pdfHeight: 800 },
    style: { width: '750px', height: '1000px' }, bitmap: { id: `old-${n}`, style: {} },
    get offsetHeight() { return parseFloat(this.style.height); },
    get offsetTop() { return 24 + viewport.children.slice(0, n - 1).reduce((h, s) => h + s.offsetHeight + 20, 0); },
    get firstChild() { return this.bitmap; },
    querySelector() { return this.bitmap; },
    replaceChildren(bitmap) { this.bitmap = bitmap; },
  }));
  const elements = { pdfCanvasViewport: viewport };
  const context = vm.createContext({
    zoom: 100, zoomFrame: null, viewerPage: 2, viewerToken: 0,
    isPageNavigation: false, observer: null, renderTasks: new Set(), console,
    window: { devicePixelRatio: 1 }, $: id => elements[id], syncToolbar() {}, async renderPdfText() {},
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    document: { createElement() { return { style: {}, getContext: () => ({}) }; } },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {} disconnect() {}
    },
    pdfDoc: { numPages: 3, async getPage() { return {
      getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
      render() {
        let resolve, reject;
        const task = { promise: new Promise((yes, no) => { resolve = yes; reject = no; }),
          finish: () => resolve(), cancel: () => reject(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' })) };
        tasks.push(task); return task;
      },
    }; } },
  });
  vm.runInContext(source.slice(source.indexOf('function cancelRenders('), source.indexOf('const sourceOutline =')), context);
  vm.runInContext(source.slice(source.indexOf('function setZoom('), source.indexOf("$('viewerZoomOutBtn').onclick")), context);
  return { context, viewport, frames, observers, tasks,
    zoom(value) { vm.runInContext(`setZoom(${value})`, context); },
    frame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); },
    renderVisible() { observers.at(-1).callback([{ target: viewport.children[1], isIntersecting: true }]); },
  };
}

test('zoom retains the old bitmap until a replacement is fully rendered and keeps the reading position', async () => {
  const zoom = setup(), sheet = zoom.viewport.children[1], old = sheet.bitmap;
  zoom.zoom(150); zoom.frame(); await tick();
  assert.equal(zoom.viewport.clears, 0);
  assert.equal(sheet.bitmap, old);
  assert.equal(old.style.width, '1125px');
  assert.equal(zoom.viewport.scrollTop, 1844);
  zoom.renderVisible(); await tick();
  assert.equal(sheet.bitmap, old);
  zoom.tasks[0].finish(); await tick();
  assert.notEqual(sheet.bitmap, old);
  assert.equal(sheet.bitmap.width, 2250);
  assert.equal(zoom.viewport.clears, 0);
});

test('rapid wheel zoom coalesces per frame and cancelled renders never blank or overwrite the current image', async () => {
  const zoom = setup(), sheet = zoom.viewport.children[1], old = sheet.bitmap;
  zoom.zoom(110); zoom.zoom(120); zoom.zoom(130);
  assert.equal(zoom.frames.size, 1);
  zoom.frame(); await tick(); zoom.renderVisible(); await tick();
  zoom.zoom(150); zoom.frame(); await tick();
  assert.equal(sheet.bitmap, old);
  zoom.renderVisible(); await tick();
  zoom.tasks[1].finish(); await tick();
  const latest = sheet.bitmap;
  zoom.tasks[0].finish(); await tick();
  assert.equal(sheet.bitmap, latest);
  assert.equal(latest.width, 2250);
  assert.equal(zoom.viewport.clears, 0);
});

test('render cancellation also cancels queued zoom frames', () => {
  const zoom = setup();
  zoom.zoom(120);
  vm.runInContext('cancelRenders()', zoom.context);
  assert.equal(zoom.frames.size, 0);
  assert.equal(zoom.context.zoomFrame, null);
});

test('zoom at its existing value or limit does not restart rendering', () => {
  const zoom = setup();
  zoom.zoom(100); assert.equal(zoom.frames.size, 0);
  zoom.context.zoom = 300; zoom.zoom(310); assert.equal(zoom.frames.size, 0);
});

test('initial page preparation waits for visible canvas rendering instead of returning blank sheets', async () => {
  const setupResult = setup(), { context, viewport, tasks } = setupResult;
  viewport.children = []; viewport.scrollTop = 0;
  viewport.replaceChildren = fragment => { viewport.children = fragment.children; };
  context.goPage = n => { context.viewerPage = n; viewport.scrollTop = 0; };
  const canvasFactory = context.document.createElement;
  context.document.createDocumentFragment = () => ({ children: [], append(sheet) { this.children.push(sheet); } });
  context.document.createElement = tag => tag !== 'div' ? canvasFactory() : {
    style: {}, dataset: {},
    get offsetHeight() { return parseFloat(this.style.height); },
    get offsetTop() { return 24 + viewport.children.slice(0, viewport.children.indexOf(this)).reduce((sum, sheet) => sum + sheet.offsetHeight + 20, 0); },
    querySelector() { return this.bitmap; },
    replaceChildren(canvas) { this.bitmap = canvas; },
  };
  let ready = false;
  const prepared = vm.runInContext('renderPages()', context).then(() => { ready = true; });
  await tick();
  assert.equal(tasks.length, 1);
  assert.equal(ready, false);
  assert.equal(viewport.children[0].bitmap, undefined);
  tasks[0].finish(); await prepared;
  assert.equal(ready, true);
  assert.equal(viewport.children[0].bitmap.width, 1500);
});
