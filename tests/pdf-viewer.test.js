import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
// PDF.js provides this build for Node's missing browser runtime features.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildSamplePdfBlobUrl } from './fixtures/sample-pdf.js';

test('viewer opens a PDF URL with the installed PDF.js API, including after reopening', async () => {
  const file = { name: 'uploaded.pdf', subject: 'math', topic: 'General Notes', dueDate: '', done: false };
  const blobUrl = buildSamplePdfBlobUrl(file);
  const bytes = new Uint8Array(await (await fetch(blobUrl)).arrayBuffer());
  URL.revokeObjectURL(blobUrl);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length });
    res.end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', classList: { add() {} }, setAttribute() {}, focus() {},
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    pdfjsLib, Blob, db: null, console, activeFile: null, viewerClosing: false, viewerPage: 0, zoom: 0, viewerToken: 0,
    pdfDoc: null, loadingTask: null, lastFocus: null,
    file: { ...file, blobUrl: `http://127.0.0.1:${server.address().port}/uploaded.pdf` },
    $: element, esc: value => value, app: {},
    document: { activeElement: null, body: { style: {} } },
    syncToolbar() {},
    renderSourceOutline() {}, rememberReader() {},
    renderedPages: 0,
  });
  // Exercise the production openViewer function, rather than a separate loader.
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const openViewer = appSource.slice(appSource.indexOf('async function openViewer('), appSource.indexOf('function closeViewer('));
  vm.runInContext('async function renderPages() { renderedPages = pdfDoc.numPages; }\n' + openViewer, context);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await vm.runInContext('openViewer(file)', context);
      assert.equal(context.pdfDoc?.numPages, 3, element('pdfCanvasViewport').textContent);
      assert.equal(context.renderedPages, 3);
      await context.loadingTask.destroy();
      context.pdfDoc = null;
      context.activeFile = null;
      context.renderedPages = 0;
    }
  } finally {
    await context.loadingTask?.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
