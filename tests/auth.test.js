import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function mount({ session = null, allowed = true, loginError = null } = {}) {
  const shell = {}, controls = new Map();
  const get = selector => {
    if (!controls.has(selector)) controls.set(selector, { value: '', focus() {} });
    return controls.get(selector);
  };
  const gate = { setAttribute() {}, querySelector: get, remove() { this.removed = true; } };
  let signedOut = false;
  const user = { id: 'owner', email: 'owner@example.com' };
  const client = {
    auth: {
      async getSession() { return { data: { session } }; },
      async signOut() { signedOut = true; },
      async signInWithPassword() { return { data: { user, session: { user } }, error: loginError }; },
      async signUp() { return { data: { user, session: null }, error: null }; },
    },
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: allowed ? { email: user.email } : null, error: null }; } }; },
  };
  const context = vm.createContext({ document: { querySelector: () => shell, createElement: () => gate, body: { prepend() {} } } });
  const source = fs.readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8').replace("import './auth.css';", '').replace('export async function', 'async function');
  vm.runInContext(source, context);
  const ready = context.requirePrivateSession(client);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return { shell, gate, get, ready, tick, get signedOut() { return signedOut; } };
}
test('private library resumes only an approved existing session', async () => {
  const app = mount({ session: { user: { id: 'owner', email: 'owner@example.com' } } });
  assert.equal((await app.ready).id, 'owner'); assert.equal(app.shell.hidden, false);
});
test('successful login reveals the library; rejected accounts remain behind the gate', async () => {
  const app = mount(); await app.tick();
  assert.equal(app.shell.hidden, true);
  app.get('#authEmail').value = 'owner@example.com'; app.get('#authPassword').value = 'test password';
  await app.get('form').onsubmit({ preventDefault() {} }); await app.ready;
  assert.equal(app.shell.hidden, false); assert.equal(app.gate.removed, true);
  const denied = mount({ allowed: false }); await denied.tick();
  await denied.get('form').onsubmit({ preventDefault() {} });
  assert.equal(denied.shell.hidden, true); assert.equal(denied.signedOut, true);
  assert.match(denied.get('.auth-message').textContent, /does not have access/);
});
test('registration waits for confirmation rather than revealing private content', async () => {
  const app = mount(); await app.tick();
  app.get('[type=button]').onclick();
  await app.get('form').onsubmit({ preventDefault() {} });
  assert.equal(app.shell.hidden, true);
  assert.match(app.get('.auth-message').textContent, /confirm your account/);
  assert.equal(app.get('[type=submit]').textContent, 'Sign in');
});
