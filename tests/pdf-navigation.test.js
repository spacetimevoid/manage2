import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function navigation({ scrollHeight = 3100 } = {}) {
  const listeners = new Map();
  const viewport = {
    scrollTop: 0, scrollHeight, clientHeight: 700,
    getBoundingClientRect: () => ({ top: 0 }),
    addEventListener(type, handler) { listeners.set(type, handler); },
    scrollTo(options) { this.destination = options; },
    querySelector(selector) {
      const page = Number(selector.match(/"(\d+)"/)[1]);
      return this.children.find(s => Number(s.dataset.pageNumber) === page);
    },
  };
  viewport.children = [1, 2, 3].map(n => ({
    dataset: { pageNumber: String(n) }, offsetTop: 24 + (n - 1) * 1020,
    getBoundingClientRect() { return { top: this.offsetTop - viewport.scrollTop }; },
  }));
  const elements = { pdfCanvasViewport: viewport, pdfAreaSelectionBox: { style: {} }, viewerPrevPageBtn: {}, viewerNextPageBtn: {} };
  const displayed = [];
  const context = vm.createContext({
    pdfDoc: { numPages: 3 }, viewerPage: 1, isPageNavigation: false,
    $: id => elements[id],
    syncToolbar() { displayed.push(context.viewerPage); },
  });
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function goPage('), source.indexOf('function setZoom(')), context);
  return { context, viewport, elements, displayed, emit: (type, event = {}) => listeners.get(type)?.(event),
    scroll(top) { viewport.scrollTop = top; viewport.onscroll(); } };
}

test('next page keeps page 2 through every intermediate smooth-scroll frame', () => {
  const nav = navigation();
  nav.elements.viewerNextPageBtn.onclick();
  assert.equal(nav.viewport.destination.top, 1020);
  for (const top of [0, 30, 150, 300, 700, 1020]) {
    nav.scroll(top);
    assert.equal(nav.context.viewerPage, 2);
  }
  nav.emit('scrollend');
  assert.equal(nav.context.isPageNavigation, false);
  assert.deepEqual(nav.displayed, [2]);
});

test('rapid next/previous clicks use the requested page, not an intermediate page', () => {
  const nav = navigation();
  nav.elements.viewerNextPageBtn.onclick(); nav.scroll(50);
  nav.elements.viewerNextPageBtn.onclick(); nav.scroll(100);
  assert.equal(nav.context.viewerPage, 3);
  nav.elements.viewerPrevPageBtn.onclick(); nav.scroll(90);
  assert.equal(nav.context.viewerPage, 2);
  assert.equal(nav.viewport.destination.top, 1020);
  assert.deepEqual(nav.displayed, [2, 3, 2]);
});

test('manual wheel, pointer, touch and keyboard scrolling can interrupt navigation', () => {
  for (const [type, event] of [['wheel', {}], ['pointerdown', {}], ['touchstart', {}], ['keydown', { key: 'PageUp' }]]) {
    const nav = navigation();
    nav.elements.viewerNextPageBtn.onclick();
    nav.emit(type, event); nav.scroll(0);
    assert.equal(nav.context.viewerPage, 1, type);
    nav.scroll(1020);
    assert.equal(nav.context.viewerPage, 2, type);
  }
});

test('last-page navigation clamps to the scrollable range without reverting the page label', () => {
  const nav = navigation({ scrollHeight: 2200 });
  vm.runInContext('goPage(3)', nav.context);
  assert.equal(nav.viewport.destination.top, 1500);
  nav.scroll(1500); nav.emit('scrollend');
  assert.equal(nav.context.viewerPage, 3);
  nav.elements.viewerNextPageBtn.onclick();
  assert.equal(nav.context.isPageNavigation, false);
  assert.equal(nav.context.viewerPage, 3);
});
