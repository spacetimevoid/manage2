import { documentSubjects, hasSubject } from '../src/subject-tags.js';
import { normalizeSubject, todayDate, renamedDocument, validateDocumentName, normalizedDifficulty } from '../src/metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { problemTitle } from '../src/problem-data.js';
import { IDBFactory } from 'fake-indexeddb';
import { viewFromHash, collectionFiles, queryFiles, openLibrary, readDocuments, saveDocuments, dateOf, escapeHtml, readerHash, readerRoute, subjectNames, makeSubject, deleteDocuments } from '../src/library.js';

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

test('runtime navigation and reload keep headings, columns, counts and records in the selected collection', async () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  function mount(hash) {
    const makeElement = () => ({ textContent: '', innerHTML: '', dataset: {}, attrs: {}, classList: { remove() {} }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
    const elements = new Map();
    const $ = id => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); };
    const links = ['sources', 'problems'].map(view => Object.assign(makeElement(), { dataset: { view } }));
    const date = makeElement(), dateLabel = makeElement(), status = makeElement(), statusLabel = makeElement();
    status.querySelector = () => statusLabel;
    let onHashChange;
    const context = vm.createContext({ documentSubjects, hasSubject, captureListMotion: (element, options) => { if (options) element.motion = options; return () => {}; }, mediaLoader: { warm() {} }, app: { classList: { toggle() {} } },
      SUBJECTS: ['math'], activeView: viewFromHash(hash), activeSubject: 'all', currentPage: 1, sortKey: null, sortDir: 'asc', searchQuery: '', activeFile: null,
      files: [
        { id: 's', name: 'Source.pdf', subject: 'math', topic: 'Source topic', dueDate: '20/11/2026', done: true },
        { id: 'p', kind: 'problem', name: 'Problem.pdf', subject: 'math', topic: 'Problem topic', addedDate: '15/11/2026', difficulty: 'hard' },
      ],
      location: { hash }, $, queryFiles, collectionFiles, subjectNames, normalizedDifficulty, dateOf, esc: escapeHtml, viewFromHash, readerHash, readerRoute, problemTitle,
      libraryReady: true, routeSequence: 0, viewerClosing: false, viewerClosePromise: null,
      history: { replaceState(_state, _title, hash) { context.location.hash = hash; } },
      problemDetail: { isOpen: false, activeId: null },
      viewName: () => context.activeView === 'problems' ? 'Problems' : 'Sources',
      visibleFiles: () => collectionFiles(context.files, context.activeView),
      difficultyLabel: value => ({ easy: 'Easy', med: 'Med', hard: 'Hard' })[value],
      window: { addEventListener: (_event, callback) => { onHashChange = callback; } },
      document: {
        querySelectorAll: selector => selector === '[data-view]' ? links : [],
        querySelector: selector => ({ '[data-sort="date"] span': dateLabel, '[data-sort="date"]': date, '.footer-status': status })[selector],
      },
    });
    context.openViewer = async file => { context.activeFile = file; context.rememberReader(file); };
    context.closeViewer = async () => { context.forgetReader(context.activeFile); context.activeFile = null; };
    context.problemDetail.open = file => { context.problemDetail.isOpen = true; context.problemDetail.activeId = file.id; context.rememberReader(file); };
    context.problemDetail.close = async () => {
      const file = context.files.find(file => file.id === context.problemDetail.activeId);
      if (file) context.forgetReader(file);
      context.problemDetail.isOpen = false; context.problemDetail.activeId = null;
    };
    vm.runInContext(source.slice(source.indexOf('function subjects('), source.indexOf('function selectSubject(')), context);
    vm.runInContext('renderView()', context);
    return { context, $, dateLabel, statusLabel, links, navigate(hash) { context.location.hash = hash; return onHashChange(); } };
  }
  const app = mount('#sources');
  assert.equal(app.$('breadcrumbReset').textContent, 'Sources');
  assert.match(app.$('fileList').innerHTML, /Source\.pdf/);
  assert.doesNotMatch(app.$('fileList').innerHTML, /Problem/);
  await app.navigate('#problems');
  assert.equal(app.$('breadcrumbReset').textContent, 'Problems');
  assert.equal(app.$('subjectList').motion.move, false);
  app.context.renderSidebar();
  assert.equal(app.$('subjectList').motion.move, true);
  assert.equal(app.dateLabel.textContent, 'Added Date');
  assert.equal(app.statusLabel.textContent, 'Difficulty');
  assert.equal(app.links[1].attrs['aria-current'], 'page');
  assert.match(app.$('fileList').innerHTML, />Problem<.*15\/11\/2026.*>Hard</);
  assert.doesNotMatch(app.$('fileList').innerHTML, /Source\.pdf|Problem\.pdf|Completed|Pending/);
  assert.match(app.$('subjectList').innerHTML, /subject-count">1</);
  const reloaded = mount(app.context.location.hash);
  assert.equal(reloaded.$('fileList').innerHTML, app.$('fileList').innerHTML);
  await reloaded.navigate('#sources');
  assert.equal(reloaded.statusLabel.textContent, 'Status');
  assert.equal(reloaded.$('subjectList').motion.move, false);
  assert.equal(reloaded.dateLabel.textContent, 'Due Date');
  // Restore each reader after a fresh mount, then close without reopening it on reload.
  for (const [view, id] of [['sources', 's'], ['problems', 'p']]) {
    const restored = mount(readerHash(view, id));
    await restored.context.applyRoute();
    assert.equal(view === 'sources' ? restored.context.activeFile?.id : restored.context.problemDetail.activeId, id);
    if (view === 'sources') await restored.context.closeViewer(); else await restored.context.problemDetail.close();
    assert.equal(restored.context.location.hash, readerHash(view));
    const closed = mount(restored.context.location.hash);
    await closed.context.applyRoute();
    assert.equal(closed.context.activeFile, null); assert.equal(closed.context.problemDetail.isOpen, false);
  }
  const missing = mount('#problems/missing'); await missing.context.applyRoute();
  assert.equal(missing.context.location.hash, '#problems');
  const switching = mount('#problems/p'); await switching.context.applyRoute();
  await switching.navigate('#sources/s');
  assert.equal(switching.context.activeFile.id, 's');
  assert.equal(switching.context.location.hash, '#sources/s');
});

test('empty subjects persist separately by collection and never become documents or affect document counts', async () => {
  const factory = new IDBFactory(); let db = await openLibrary(factory);
  const source = makeSubject('Geometry', 'sources', []), problem = makeSubject('Geometry', 'problems', [source]);
  await saveDocuments(db, [source, problem]); db.close(); db = await openLibrary(factory);
  const records = await readDocuments(db);
  for (const view of ['sources', 'problems']) {
    assert.deepEqual(subjectNames(records, view), ['geometry']); assert.equal(collectionFiles(records, view).length, 0);
  }
  assert.throws(() => makeSubject('Geometry', 'sources', records), /already exists/);
  for (const invalid of ['all', ' ', 'a/b']) assert.throws(() => makeSubject(invalid, 'sources', records));
  await deleteDocuments(db, [source.id]);
  assert.deepEqual(subjectNames(await readDocuments(db), 'sources'), []);
  assert.deepEqual(subjectNames(await readDocuments(db), 'problems'), ['geometry']); db.close();
});
