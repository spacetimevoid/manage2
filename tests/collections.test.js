import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { viewFromHash, collectionFiles, queryFiles, openLibrary, readDocuments, saveDocuments, dateOf, escapeHtml } from '../src/library.js';

test('URL preserves the selected view across reload and recognizes both navigation destinations', () => {
  for (const view of ['sources', 'problems']) {
    const url = new URL(`http://localhost/#${view}`);
    assert.equal(viewFromHash(new URL(url.href).hash), view);
  }
  assert.equal(viewFromHash(''), 'sources');
  assert.equal(viewFromHash('#unknown'), 'sources');
});
test('legacy sources stay in Sources and problem uploads persist separately with difficulty and added date', async () => {
  const factory = new IDBFactory();
  let db = await openLibrary(factory);
  await saveDocuments(db, [
    { id: 'source', name: 'Same.pdf', subject: 'math', dueDate: '20/11/2026', topic: 'Math', done: false },
    { id: 'problem', kind: 'problem', name: 'Same.pdf', subject: 'math', addedDate: '15/11/2026', difficulty: 'hard', topic: 'Math', blob: new Blob(['%PDF-1.7']) },
  ]);
  db.close(); db = await openLibrary(factory);
  const records = await readDocuments(db);
  assert.deepEqual(collectionFiles(records, 'sources').map(f => f.id), ['source']);
  const [problem] = collectionFiles(records, 'problems');
  assert.equal(problem.difficulty, 'hard');
  assert.equal(problem.addedDate, '15/11/2026');
  assert.equal(await problem.blob.text(), '%PDF-1.7');
  db.close();
});
test('Problems sorts by added date and ordered difficulty in both directions', () => {
  const records = [
    { kind: 'problem', name: 'Hard', subject: 'math', difficulty: 'hard', addedDate: '01/11/2026' },
    { kind: 'problem', name: 'Easy', subject: 'math', difficulty: 'easy', addedDate: '03/11/2026' },
    { kind: 'problem', name: 'Med', subject: 'math', difficulty: 'med', addedDate: '02/11/2026' },
  ];
  assert.deepEqual(queryFiles(records, { sortKey: 'difficulty' }).items.map(f => f.name), ['Easy', 'Med', 'Hard']);
  assert.deepEqual(queryFiles(records, { sortKey: 'difficulty', sortDir: 'desc' }).items.map(f => f.name), ['Hard', 'Med', 'Easy']);
  assert.deepEqual(queryFiles(records, { sortKey: 'date' }).items.map(f => f.name), ['Hard', 'Med', 'Easy']);
});

test('runtime navigation and reload keep headings, columns, counts and records in the selected collection', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  function mount(hash) {
    const makeElement = () => ({ textContent: '', innerHTML: '', dataset: {}, attrs: {}, classList: { remove() {} }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
    const elements = new Map();
    const $ = id => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); };
    const links = ['sources', 'problems'].map(view => Object.assign(makeElement(), { dataset: { view } }));
    const date = makeElement(), dateLabel = makeElement(), status = makeElement(), statusLabel = makeElement();
    status.querySelector = () => statusLabel;
    let onHashChange;
    const context = vm.createContext({
      SUBJECTS: ['math'], activeView: viewFromHash(hash), activeSubject: 'all', currentPage: 1, sortKey: null, sortDir: 'asc', searchQuery: '', activeFile: null,
      files: [
        { id: 's', name: 'Source.pdf', subject: 'math', topic: 'Source topic', dueDate: '20/11/2026', done: true },
        { id: 'p', kind: 'problem', name: 'Problem.pdf', subject: 'math', topic: 'Problem topic', addedDate: '15/11/2026', difficulty: 'hard' },
      ],
      location: { hash }, $, queryFiles, dateOf, esc: escapeHtml, viewFromHash, problemDetail: { isOpen: false },
      viewName: () => context.activeView === 'problems' ? 'Problems' : 'Sources',
      visibleFiles: () => collectionFiles(context.files, context.activeView),
      difficultyLabel: value => ({ easy: 'Easy', med: 'Med', hard: 'Hard' })[value],
      window: { addEventListener: (_event, callback) => { onHashChange = callback; } },
      document: {
        querySelectorAll: selector => selector === '[data-view]' ? links : [],
        querySelector: selector => ({ '[data-sort="date"] span': dateLabel, '[data-sort="date"]': date, '.footer-status': status })[selector],
      },
    });
    vm.runInContext(source.slice(source.indexOf('function subjects('), source.indexOf('function selectSubject(')), context);
    vm.runInContext('renderView()', context);
    return { context, $, dateLabel, statusLabel, links, navigate(hash) { context.location.hash = hash; onHashChange(); } };
  }
  const app = mount('#sources');
  assert.equal(app.$('breadcrumbReset').textContent, 'Sources');
  assert.match(app.$('fileList').innerHTML, /Source\.pdf/);
  assert.doesNotMatch(app.$('fileList').innerHTML, /Problem/);
  app.navigate('#problems');
  assert.equal(app.$('breadcrumbReset').textContent, 'Problems');
  assert.equal(app.dateLabel.textContent, 'Added Date');
  assert.equal(app.statusLabel.textContent, 'Difficulty');
  assert.equal(app.links[1].attrs['aria-current'], 'page');
  assert.match(app.$('fileList').innerHTML, />Problem<.*15\/11\/2026.*>Hard</);
  assert.doesNotMatch(app.$('fileList').innerHTML, /Source\.pdf|Problem\.pdf|Completed|Pending/);
  assert.match(app.$('subjectList').innerHTML, /subject-count">1</);
  const reloaded = mount(app.context.location.hash);
  assert.equal(reloaded.$('fileList').innerHTML, app.$('fileList').innerHTML);
  reloaded.navigate('#sources');
  assert.equal(reloaded.statusLabel.textContent, 'Status');
  assert.equal(reloaded.dateLabel.textContent, 'Due Date');
});
