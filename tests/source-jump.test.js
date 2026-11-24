import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('outline clicks jump to the selected region at each zoom and ignore a closed source', async () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const makeSheet = () => ({
    dataset: {}, style: { setProperty(name, value) { this[name] = value; } },
    classList: new Set(), offsetTop: 2000, offsetLeft: 180,
  });
  const sheets = { 3: makeSheet(), 4: makeSheet() };
  const sheet = sheets[3];
  for (const page of Object.values(sheets)) page.classList.remove = page.classList.delete;
  const viewport = {
    scrollHeight: 20000, clientHeight: 700, scrollWidth: 3000, clientWidth: 800, scrollTop: 0, scrollLeft: 0,
    querySelector(selector) {
      if (selector === '.has-problem-highlight') return Object.values(sheets).find(page => page.classList.has(selector.slice(1)));
      return sheets[selector.match(/"(\d+)"/)[1]];
    },
    scrollTo(value) { this.scroll = value; },
  };
  let jump;
  const context = vm.createContext({
    $: id => id === 'pdfCanvasViewport' ? viewport : {},
    createSourceOutline(body, callback) { jump = callback; return { render() {} }; },
    pdfDoc: { async getPage(number) { assert.ok(sheets[number]); return { getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }) }; } },
    activeFile: { id: 's' }, zoom: 100, isPageNavigation: false,
    sourceNavigation: 0, syncToolbar() {},
  });
  vm.runInContext(source.slice(source.indexOf('const sourceOutline ='), source.indexOf('async function openViewer(')), context);
  for (const zoom of [50, 100, 200]) {
    context.zoom = zoom;
    await jump({ sourceId: 's', page: 3, rect: { x: .2, y: .4, width: .5, height: .1 } });
    assert.equal(context.viewerPage, 3);
    assert.equal(viewport.scroll.top, 2000 + 800 * zoom / 100 * 1.25 * .4 - 24);
    assert.equal(sheet.dataset.pdfHeight, 800);
    assert.equal(viewport.scroll.behavior, 'smooth');
    assert.ok(sheet.classList.has('has-problem-highlight'));
    assert.deepEqual(
      ['x', 'y', 'width', 'height'].map(key => sheet.style['--problem-' + key]),
      ['20%', '40%', '50%', '10%'],
    );
  }
  context.matchMedia = () => ({ matches: true });
  await jump({ sourceId: 's', page: 4, rect: { x: 0, y: 0, width: .5, height: .1 } });
  assert.equal(viewport.scroll.behavior, 'instant');
  assert.ok(sheets[4].classList.has('has-problem-highlight'));
  assert.equal(sheet.classList.has('has-problem-highlight'), false);
  const previous = viewport.scroll; context.activeFile = null;
  await jump({ sourceId: 's', page: 3, rect: { x: 0, y: 0 } });
  assert.equal(viewport.scroll, previous);
});
