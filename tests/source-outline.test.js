import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceOutline } from '../src/source-outline.js';

test('Notes and Problems tabs switch panels without losing notes, and entries still scroll the PDF', async () => {
  const previous = globalThis.document;
  const element = () => ({ attrs: {}, children: [], setAttribute(key, value) { this.attrs[key] = value; }, append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; }, focus() { this.focused = true; } });
  globalThis.document = { createElement: element };
  const notes = { ...element(), id: 'pdfNotesTextarea', value: 'Keep these notes' }, saved = element();
  let tabs, panel, jumped, menu;
  const header = { querySelector: () => ({ replaceWith(value) { tabs = value; } }) };
  const pane = { querySelector: selector => selector === '#pdfNotesTextarea' ? notes : selector === '#pdfNotesSavedLabel' ? saved : header, append(value) { panel = value; } };
  try {
    const outline = createSourceOutline(pane, async location => { jumped = location; }, (event, file) => { menu = { event, file }; });
    const file = { id: 'p', name: 'Question.png', kind: 'problem', sourceLocation: { sourceId: 's', page: 1, rect: { x: 0, y: .2 } } };
    outline.render([file], { id: 's' });
    const [notesTab, problemsTab] = tabs.children;
    assert.equal(notes.hidden, false); assert.equal(panel.hidden, true);
    problemsTab.onclick(); assert.equal(panel.hidden, false); assert.equal(notes.hidden, true); assert.equal(saved.hidden, true);
    assert.equal(problemsTab.attrs['aria-selected'], 'true');
    await panel.children[0].onclick(); assert.deepEqual(jumped, file.sourceLocation);
    let prevented = false, stopped = false;
    const event = { preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } };
    panel.children[0].oncontextmenu(event);
    assert.equal(prevented, true); assert.equal(stopped, true);
    assert.equal(menu.file, file); assert.equal(menu.event, event);
    assert.equal(panel.children[0].attrs['data-id'], file.id);
    outline.render([], { id: 's' }); assert.equal(panel.children.length, 0);
    file.name = 'Renamed.png'; outline.render([file], { id: 's' });
    assert.equal(panel.hidden, false); assert.equal(panel.children[0].textContent, 'Renamed');
    outline.focus(); assert.equal(problemsTab.focused, true);
    notesTab.onclick(); assert.equal(notes.hidden, false); assert.equal(notes.value, 'Keep these notes');
    tabs.onkeydown({ key: 'ArrowRight', preventDefault() {} }); assert.equal(panel.hidden, false);
    outline.render([], { id: 'other' }); assert.equal(panel.hidden, true); assert.equal(notes.hidden, false);
    problemsTab.onclick(); assert.equal(panel.hidden, false); assert.equal(panel.children.length, 0);
  } finally { globalThis.document = previous; }
});
