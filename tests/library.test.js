import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, queryFiles, escapeHtml, validatePdf } from '../src/library.js';
import { ALL_FILES } from './fixtures/library-seed.js';

test('All includes every document counted by the sidebar', () => {
  assert.equal(queryFiles(ALL_FILES).total, ALL_FILES.length);
  assert.ok(ALL_FILES.length > 32);
  const allPages = Array.from({ length: queryFiles(ALL_FILES).pages }, (_, i) => queryFiles(ALL_FILES, { page: i + 1 }).items).flat();
  assert.equal(new Set(allPages.map(f => f.name)).size, ALL_FILES.length);
});
test('strict calendar validation, leap years and optional dates', () => {
  assert.ok(Number.isFinite(parseDate('29/02/2024')));
  for (const date of ['29/02/2026', '31/04/2026', '00/11/2026', '1/1/2026', '2026-11-15']) assert.ok(Number.isNaN(parseDate(date)), date);
  assert.equal(parseDate(''), null);
});
test('filter, sort and pagination compose without mutating library order', () => {
  const original = ALL_FILES.map(f => f.name);
  const math = queryFiles(ALL_FILES, { subject: 'math', sortKey: 'date', sortDir: 'desc', page: 999 });
  assert.equal(math.total, 14); assert.equal(math.page, 2); assert.equal(math.items.length, 4);
  assert.ok(math.items.every(f => f.subject === 'math'));
  assert.deepEqual(ALL_FILES.map(f => f.name), original);
  assert.ok(queryFiles(ALL_FILES, { query: 'QUANTUM' }).items.every(f => /quantum/i.test(`${f.name} ${f.subject} ${f.topic}`)));
  assert.equal(queryFiles(ALL_FILES, { query: 'no matching file here' }).total, 0);
});
test('unscheduled records stay after scheduled records in both sort directions', () => {
  const records = [{ name: 'unscheduled', dueDate: '', topic: '', subject: 'math' }, { name: 'scheduled', dueDate: '15/11/2026', topic: '', subject: 'math' }];
  for (const sortDir of ['asc', 'desc']) assert.equal(queryFiles(records, { sortKey: 'date', sortDir }).items[0].name, 'scheduled');
});
test('user content is escaped in text and attribute contexts', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">&\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});
test('upload rejects missing and disguised non-PDF files', async () => {
  await assert.rejects(validatePdf(null), /select a PDF/);
  await assert.rejects(validatePdf(new File(['hello'], 'fake.pdf')), /valid PDF/);
  await validatePdf(new File(['%PDF-1.7\n'], 'actual.PDF'));
});

test('Status ties always use earliest due date first, with undated sources last', () => {
  const records = [false, true].flatMap(done => [
    { name: 'late', done, dueDate: '01/01/2027' },
    { name: 'none', done, dueDate: '' },
    { name: 'early', done, dueDate: '30/11/2026' },
  ]);
  for (const sortDir of ['asc', 'desc']) {
    const sorted = queryFiles(records, { sortKey: 'status', sortDir }).allItems;
    assert.deepEqual(sorted.map(file => file.name), ['early', 'late', 'none', 'early', 'late', 'none']);
    assert.equal(sorted[0].done, sortDir === 'desc');
  }
});
