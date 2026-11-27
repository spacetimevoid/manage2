import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readerRoute, readerHash } from '../src/library.js';
import { renderNoteMarkdown } from '../src/notes-markdown.js';
import { createLocalNotes } from '../src/notes-storage.js';
import { readNoteFile } from '../src/note-file.js';

test('note routes restore the directory and the chosen note', () => {
  const id = crypto.randomUUID();
  assert.deepEqual(readerRoute('#notes'), { view: 'notes', id: null });
  assert.deepEqual(readerRoute(readerHash('notes', id)), { view: 'notes', id });
  assert.deepEqual(readerRoute('#notes/%E0'), { view: 'notes', id: null });
});

test('Markdown import handles UTF-8 and keeps the original math source', async () => {
  const text = '# Tổ hợp\n\n$\\binom{n}{k}$';
  assert.deepEqual(await readNoteFile(new File([text], 'Tổ hợp.MD')), { title: 'Tổ hợp', markdown: text });
  await assert.rejects(readNoteFile(new File([text], 'Tổ hợp.tex')), /Choose a Markdown/);
  await assert.rejects(readNoteFile(new File([Uint8Array.from([0xff])], 'binary.md')), /UTF-8/);
});

test('note rendering handles inline and block math and treats markup, URLs and code as text where appropriate', () => {
  const html = renderNoteMarkdown('# Tổ hợp\n\n$x^2$\n\n$$\n\\frac{1}{2}\n$$\n\n`$x$`\n\n$\\badcommand$\n\n<script>unsafe</script>\n\n[unsafe](javascript:alert(1))\n\n![description](https://example.test/remote.png)');
  assert.match(html, /<h1>Tổ hợp<\/h1>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<code>\$x\$<\/code>/);
  assert.match(html, /badcommand/);
  assert.match(html, /description/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:/);
});

test('local persistence separates list metadata, rejects stale edits and restores the full note', async () => {
  const factory = new IDBFactory();
  const first = createLocalNotes(factory), second = createLocalNotes(factory);
  const original = await first.add({ id: crypto.randomUUID(), title: 'Tổ hợp', markdown: '$n!$', subjects: ['tổ-hợp'] });
  const [summary] = await second.list();
  assert.equal(summary.markdown, undefined);
  assert.equal((await second.read(original.id)).markdown, original.markdown);
  const edited = await second.update({ ...original, markdown: '$n^2$' });
  await assert.rejects(first.update(original), /changed in another session/);
  await assert.rejects(first.remove(original.id, original.revision), /changed in another session/);
  const removed = await first.remove(edited.id, edited.revision);
  assert.deepEqual(await second.list(), []);
  const restored = await first.add(removed);
  assert.notEqual(restored.revision, removed.revision);
  assert.deepEqual(await second.read(original.id), restored);
  assert.deepEqual(restored.subjects, ['tổ-hợp']);
  assert.equal(restored.markdown, '$n^2$');
});

test('SVG fences render as isolated images while ordinary code stays escaped', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"><animate attributeName="r" values="2;4" dur="1s"/></circle></svg>';
  const html = renderNoteMarkdown('```svg\n' + svg + '\n```');
  const image = html.match(/<img class="note-svg"[^>]+src="data:image\/svg\+xml;charset=utf-8,([^"]+)">/);
  assert.ok(image);
  assert.equal(decodeURIComponent(image[1]), svg);
  assert.doesNotMatch(html, /<svg|<animate/);
  assert.match(renderNoteMarkdown('```svg\nnot an SVG\n```'), /<pre><code/);
  assert.match(renderNoteMarkdown('```xml\n' + svg + '\n```'), /&lt;svg/);
});
