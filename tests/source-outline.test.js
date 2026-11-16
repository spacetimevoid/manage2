import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceOutline } from '../src/source-outline.js';

test('hamburger toggles the saved list, keeps it open on updates and resets for another PDF', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, replaceChildren(...children) { this.children = children; } }) };
  let panel, toggle, jumped;
  try {
    const outline = createSourceOutline({ prepend(el) { panel = el; } }, async location => { jumped = location; }, { prepend(el) { toggle = el; } });
    const file = { id: 'p', name: 'Question.png', kind: 'problem', sourceLocation: { sourceId: 's', page: 1, rect: { x: 0, y: .2 } } };
    outline.render([file], { id: 's' });
    assert.equal(panel.hidden, true); assert.equal(toggle.disabled, false);
    toggle.onclick(); assert.equal(panel.hidden, false); assert.equal(toggle.attrs['aria-expanded'], 'true');
    await panel.children[0].onclick(); assert.deepEqual(jumped, file.sourceLocation);
    file.name = 'Renamed.png'; outline.render([file], { id: 's' });
    assert.equal(panel.hidden, false); assert.equal(panel.children[0].textContent, 'Renamed');
    toggle.onclick(); assert.equal(panel.hidden, true);
    toggle.onclick(); outline.render([file], { id: 'other' });
    assert.equal(panel.hidden, true); assert.equal(toggle.disabled, true);
  } finally { globalThis.document = previous; }
});
