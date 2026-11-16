import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('an empty library stays empty after initialization and reload', async () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const button = {};
  const context = vm.createContext({
    $: () => button, console, document: { body: { classList: { remove() {} } } }, files: [], db: null, libraryReady: false,
    async openLibrary() { return {}; }, async readDocuments() { return []; },
    async saveDocuments() { assert.fail('Initialization must not seed demo records'); },
    renderView() {}, syncToolbar() {}, async applyRoute() {},
  });
  const initialize = source.slice(source.indexOf('async function initialize()'), source.lastIndexOf('initialize();'));
  vm.runInContext(initialize, context);
  await context.initialize(); await context.initialize();
  assert.equal(context.files.length, 0); assert.equal(button.disabled, false);
  assert.doesNotMatch(source, /ALL_FILES|PROBLEM_FILES|buildSamplePdfBlobUrl/);
});

test('startup keeps the list concealed until the current reader route has finished restoring', async () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  let restored, revealed = false;
  const route = new Promise(resolve => { restored = resolve; });
  const context = vm.createContext({
    $: () => ({}), console, files: [], db: null, libraryReady: false,
    document: { body: { classList: { remove(name) { assert.equal(name, 'is-starting'); revealed = true; } } } },
    async openLibrary() { return {}; }, async readDocuments() { return [{ id: 'saved', createdAt: 1 }]; },
    renderView() {}, syncToolbar() {}, applyRoute() { return route; },
  });
  vm.runInContext(source.slice(source.indexOf('async function initialize()'), source.lastIndexOf('initialize();')), context);
  const initialized = context.initialize();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.libraryReady, true); assert.equal(revealed, false);
  restored(); await initialized; assert.equal(revealed, true);
});
