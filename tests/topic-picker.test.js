import test from 'node:test';
import assert from 'node:assert/strict';
import { createTopicPicker, existingTopics } from '../src/topic-picker.js';

test('topics are shared across Sources and Problems, deduplicated and exclude subject records', () => {
  assert.deepEqual(existingTopics([{ topic: 'Algebra' }, { kind: 'problem', topic: 'Geometry' }, { topic: ' Algebra ' }, { kind: 'subject', topic: 'Ignore' }, { topic: '' }]), ['Algebra', 'Geometry']);
});

test('picker scrolls all suggestions, filters text, selects by mouse/keyboard and permits new topics', () => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const listeners = {}, events = {}, rect = { top: 100, bottom: 130 };
  const element = () => ({ attrs: {}, style: {}, children: [], setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; }, replaceChildren(...children) { this.children = children; }, scrollIntoView() {} });
  const field = { classList: { add() {} }, append(value) { this.list = value; }, contains: () => false, getBoundingClientRect: () => rect };
  const input = { ...element(), parentElement: field, value: '', getBoundingClientRect: () => rect, addEventListener(type, callback) { events[type] = callback; } };
  globalThis.document = { createElement: element, addEventListener(type, callback) { listeners[type] = callback; } };
  globalThis.window = { innerHeight: 800, addEventListener() {} };
  const topics = Array.from({ length: 12 }, (_, index) => `Topic ${index + 1}`);
  try {
    const picker = createTopicPicker(input, () => topics);
    events.focus(); assert.equal(field.list.children.length, 12); assert.equal(field.list.style.maxHeight, '194px');
    field.list.children[8].onclick(); assert.equal(input.value, 'Topic 9'); assert.equal(field.list.hidden, true);
    input.value = '12'; events.input(); assert.equal(field.list.children.length, 1);
    const key = value => events.keydown({ key: value, preventDefault() {}, stopPropagation() {} });
    key('ArrowDown'); key('Enter'); assert.equal(input.value, 'Topic 12');
    input.value = 'New topic'; events.input(); assert.equal(field.list.hidden, true); assert.equal(input.value, 'New topic');
    events.focus(); key('Escape'); assert.equal(field.list.hidden, true);
    events.focus(); listeners.pointerdown({ target: {} }); assert.equal(field.list.hidden, true);
    rect.top = 700; rect.bottom = 730; events.focus(); assert.equal(field.list.style.top, 'auto');
    picker.close(); assert.equal(input.attrs['aria-expanded'], 'false');
  } finally { Object.assign(globalThis, previous); }
});
