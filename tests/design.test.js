import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const original = fs.readFileSync(new URL('../reference/sources_pdf_directory.original.html', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('page markup matches the sketch apart from the requested additions', () => {
  const normalize = source => source
    .replace('<body class="is-starting">', '<body>')
    .replace('dd/mm/yyyy', 'DD/MM/YYYY')
    .replace('>Select source</label>', '>Select PDF</label>')
    .replace(/<button[^>]*id="modalSuggestTagsBtn"[^>]*>Suggest tags<\/button>/, '')
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<link rel="stylesheet" href="\/src\/styles.css">/, '')
    .replace(/<link rel="stylesheet" href="\/src\/navigation.css">/, '')
    .replace(/<link rel="stylesheet" href="\/src\/problem-detail.css">/, '')
    .replace(/<link rel="stylesheet" href="\/src\/image-zoom.css">/, '')
    .replace(/<link rel="stylesheet" href="\/src\/transitions.css">/, '')
    .replace(/<dialog class="image-zoom-dialog"[\s\S]*?<\/dialog>/, '')
    .replace(/<section class="problem-detail-page"[\s\S]*?(?=<script type="module" src="\/src\/app.js">)/, '')
    .replace(/<div class="manage-shell">\s*<nav class="manage-nav"[\s\S]*?<\/nav>/, '')
    .replace(/<\/div>\s*<\/div>\s*(<!-- Compact Vintage Mac OS X Upload Modal -->)/, '</div> $1')
    .replace(/(<button[^>]*id="uploadPdfBtn"[^>]*>)Upload<\/button>/, '$1Upload PDF</button>')
    .replace('<span id="modalCollectionName">', '<span>')
    .replace(/<div class="list-body">\s*/, '')
    .replace(/(<\/footer>)\s*<\/div>/, '$1')
    .replace(/\s*<div class="modal-field" id="modalDifficultyField"[\s\S]*?<\/div>/, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/\s+/g, ' ').trim();
  assert.equal(normalize(html), normalize(original));
});
test('styles match the sketch with only the hidden-state logic fix', () => {
  const originalCss = original.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal(css, originalCss + '\n/* Honor logical visibility even when an element has a display rule. */\n[hidden] { display: none !important; }\n');
});
test('removed additions are absent from the runtime', () => {
  for (const addition of ['library-notice', 'document-search', 'Demo PDF', 'Demo documents are included', 'Saved locally', 'toBlob(', '.png', 'maxLength', '50 MB']) {
    assert.equal(app.includes(addition), false, addition);
  }
});

test('problem detail markup and styles are copied from the supplied P.html design', () => {
  const reference = fs.readFileSync(new URL('../reference/problem-detail.inspiration.html', import.meta.url), 'utf8');
  const detailMarkup = source => source.slice(source.indexOf('    <section class="problem-detail-page"'), source.indexOf('    <script', source.indexOf('    <section class="problem-detail-page"'))).trim().replace(/\r\n/g, '\n');
  assert.equal(detailMarkup(html)
    .replace('>Add problem</button>', '>Add image</button>')
    .replace(/\n +<a class="doc-action-link" id="problemSourceLink" hidden>Open source<\/a>/, ''), detailMarkup(reference));
  const referenceCss = reference.match(/<style>([\s\S]*?)<\/style>/)[1];
  const start = referenceCss.indexOf('        .problem-detail-page {');
  const media = referenceCss.indexOf('        @media (max-width: 760px)', start);
  const end = referenceCss.lastIndexOf('/*', media);
  const mobile = referenceCss.slice(referenceCss.indexOf('            .problem-detail-topbar {', media), referenceCss.lastIndexOf('        }'));
  const actual = fs.readFileSync(new URL('../src/problem-detail.css', import.meta.url), 'utf8');
  const expected = (referenceCss.slice(start, end).trimEnd() + '\n\n@media (max-width: 760px) {\n' + mobile + '\n}\n')
    .replace('width: 100vw;', 'width: 100%;')
    .replace('overflow-y: auto;', 'overflow-y: auto;\n            overflow-x: hidden;');
  assert.equal(actual.replace(/\r\n/g, '\n')
    .replace(/\/\* Let the title shrink beside the source link on narrow screens\. \*\/\n[^\n]+\n[^\n]+\n/, ''), expected.replace(/\r\n/g, '\n'));
  assert.doesNotMatch(actual, /(?:^|\})\s*(?:body|\.manage-nav|\.app-layout|\.sidebar)\s*\{/);
});
