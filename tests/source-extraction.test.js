import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedRegion, cropPage, sourceEntries } from '../src/source-extraction.js';
import { buildSamplePdfBlobUrl } from './fixtures/sample-pdf.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

test('selection works in either drag direction, clamps to the page and ignores empty selections', () => {
  const bounds = { width: 800, height: 1000 };
  const a = selectedRegion(bounds, { x: 80, y: 200 }, { x: 480, y: 500 });
  assert.deepEqual(a, { x: .1, y: .2, width: .5, height: .3 });
  assert.deepEqual(selectedRegion(bounds, { x: 480, y: 500 }, { x: 80, y: 200 }), a);
  assert.deepEqual(selectedRegion(bounds, { x: 0, y: 0 }, { x: 900, y: 1200 }), { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(selectedRegion(bounds, { x: 1, y: 1 }, { x: 1, y: 5 }), null);
});

test('cropped PNG contains the exact selected pixels from a real PDF page', async () => {
  const url = buildSamplePdfBlobUrl({ name: 'test.pdf', subject: 'math', topic: 'Algebra', dueDate: '' });
  const data = await (await fetch(url)).arrayBuffer(); URL.revokeObjectURL(url);
  const task = pdfjs.getDocument({ data });
  try {
    const doc = await task.promise, page = await doc.getPage(1), viewport = page.getViewport({ scale: 2 });
    const full = createCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: full.getContext('2d'), viewport }).promise;
    const file = await cropPage(doc, 1, { x: 80 / viewport.width, y: 120 / viewport.height, width: 600 / viewport.width, height: 300 / viewport.height }, () => {
      const canvas = createCanvas(1, 1);
      canvas.toBlob = callback => callback(new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }));
      return canvas;
    });
    const image = await loadImage(Buffer.from(await file.arrayBuffer()));
    assert.equal(image.width, 600); assert.equal(image.height, 300);
    const result = createCanvas(600, 300); result.getContext('2d').drawImage(image, 0, 0);
    const actual = result.getContext('2d').getImageData(0, 0, 600, 300).data;
    const expected = full.getContext('2d').getImageData(80, 120, 600, 300).data;
    assert.deepEqual(actual, expected);
    assert.ok(actual.some((value, index) => index % 4 !== 3 && value < 200));
  } finally { await task.destroy(); }
});

test('outline is ordered by PDF position and reflects renamed/deleted Problems without duplicating metadata', () => {
  const problem = (id, page, y) => ({ id, name: id, kind: 'problem', sourceLocation: { sourceId: 's', page, rect: { x: 0, y } } });
  const files = [problem('c', 2, .2), problem('b', 1, .6), problem('a', 1, .1), { ...problem('other', 1, 0), sourceLocation: { sourceId: 'different' } }];
  assert.deepEqual(sourceEntries(files, 's').map(file => file.id), ['a', 'b', 'c']);
  files[2].name = 'Renamed'; assert.equal(sourceEntries(files, 's')[0].name, 'Renamed');
  assert.deepEqual(sourceEntries(files.filter(file => file.id !== 'a'), 's').map(file => file.id), ['b', 'c']);
});
