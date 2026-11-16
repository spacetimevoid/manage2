import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('outline clicks jump to the selected region at each zoom and ignore a closed source', async () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const sheet = { dataset: {}, style: {}, offsetTop: 2000, offsetLeft: 180 };
  const viewport = { scrollHeight: 20000, clientHeight: 700, scrollWidth: 3000, clientWidth: 800, scrollTop: 0, scrollLeft: 0, querySelector: () => sheet, scrollTo(value) { this.scroll = value; } };
  let jump;
  const context = vm.createContext({
    $: id => id === 'pdfCanvasViewport' ? viewport : {},
    createSourceOutline(body, callback) { jump = callback; return { render() {} }; },
    pdfDoc: { async getPage(number) { assert.equal(number, 3); return { getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }) }; } },
    activeFile: { id: 's' }, zoom: 100, isPageNavigation: false,
    sourceNavigation: 0, syncToolbar() {},
  });
  vm.runInContext(source.slice(source.indexOf('const sourceOutline ='), source.indexOf('async function openViewer(')), context);
  for (const zoom of [50, 100, 200]) {
    context.zoom = zoom;
    await jump({ sourceId: 's', page: 3, rect: { x: .2, y: .4 } });
    assert.equal(context.viewerPage, 3);
    assert.equal(viewport.scroll.top, 2000 + 800 * zoom / 100 * 1.25 * .4 - 24);
    assert.equal(sheet.dataset.pdfHeight, 800);
    assert.equal(viewport.scroll.behavior, 'smooth');
  }
  context.matchMedia = () => ({ matches: true });
  await jump({ sourceId: 's', page: 3, rect: { x: 0, y: 0 } });
  assert.equal(viewport.scroll.behavior, 'instant');
  const previous = viewport.scroll; context.activeFile = null;
  await jump({ sourceId: 's', page: 3, rect: { x: 0, y: 0 } });
  assert.equal(viewport.scroll, previous);
});
