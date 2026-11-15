import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageZoom } from '../src/image-zoom.js';

function mount() {
  const before = { document: globalThis.document, window: globalThis.window }, elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, listeners: {}, clientWidth: 800, clientHeight: 600, captures: new Set(),
      addEventListener(type, callback) { this.listeners[type] = callback; },
      focus() { this.focused = true; }, removeAttribute(key) { delete this[key]; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      setPointerCapture(id) { this.captures.add(id); },
      hasPointerCapture(id) { return this.captures.has(id); },
      releasePointerCapture(id) { this.captures.delete(id); },
      showModal() { this.open = true; }, close() { this.open = false; this.onclose(); },
    });
    return elements.get(id);
  };
  globalThis.document = { getElementById: $ }; globalThis.window = { addEventListener() {} };
  const viewer = createImageZoom();
  const source = { src: 'blob:test-image', alt: 'Problem image', focus() { this.focused = true; } };
  viewer.open(source);
  return { $, viewer, source, cleanup() { viewer.close(); Object.assign(globalThis, before); } };
}
test('image opens in a modal, supports zoom controls and restores focus on close', () => {
  const app = mount();
  try {
    assert.equal(app.$('imageZoomDialog').open, true);
    assert.equal(app.$('imageZoomImage').src, app.source.src);
    app.$('imageZoomInBtn').onclick(); assert.equal(app.$('imageZoomLabel').textContent, '125%');
    app.$('imageZoomOutBtn').onclick(); assert.equal(app.$('imageZoomLabel').textContent, '100%');
    app.$('imageZoomCloseBtn').onclick();
    assert.equal(app.$('imageZoomDialog').open, false); assert.equal(app.source.focused, true);
    assert.equal(app.$('imageZoomImage').src, undefined);
  } finally { app.cleanup(); }
});
test('wheel zoom prevents browser scrolling, supports panning, and reset centers the image', () => {
  const app = mount();
  try {
    let prevented = false;
    app.$('imageZoomDialog').listeners.wheel({ deltaY: -200, deltaMode: 0, clientX: 400, clientY: 300, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.ok(parseInt(app.$('imageZoomLabel').textContent) > 100);
    const stage = app.$('imageZoomStage');
    stage.onpointerdown({ target: app.$('imageZoomImage'), button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    stage.onpointermove({ pointerId: 1, clientX: 450, clientY: 330 });
    assert.match(app.$('imageZoomImage').style.transform, /\+ 50px.*\+ 30px/);
    stage.onpointerup({ pointerId: 1 });
    app.$('imageZoomDialog').onclick({ target: stage });
    assert.equal(app.$('imageZoomDialog').open, true, 'ending a drag must not close the image');
    app.$('imageZoomDialog').listeners.keydown({ key: '0', preventDefault() {}, stopPropagation() {} });
    assert.equal(app.$('imageZoomLabel').textContent, '100%');
    assert.match(app.$('imageZoomImage').style.transform, /\+ 0px.*\+ 0px/);
  } finally { app.cleanup(); }
});
test('clicking an image under pointer capture stays open; background clicks close it', () => {
  const app = mount();
  try {
    const stage = app.$('imageZoomStage'), dialog = app.$('imageZoomDialog');
    stage.onpointerdown({ target: app.$('imageZoomImage'), button: 0, pointerId: 1, clientX: 200, clientY: 200 });
    stage.onpointerup({ pointerId: 1 }); dialog.onclick({ target: stage });
    assert.equal(dialog.open, true);
    stage.onpointerdown({ target: stage, button: 0, pointerId: 2, clientX: 10, clientY: 10 });
    stage.onpointerup({ pointerId: 2 }); dialog.onclick({ target: stage });
    assert.equal(dialog.open, false);
  } finally { app.cleanup(); }
});
test('two-finger pinch zoom works and each new image resets zoom', () => {
  const app = mount();
  try {
    const stage = app.$('imageZoomStage'), image = app.$('imageZoomImage');
    for (const [pointerId, clientX] of [[1, 300], [2, 500]]) stage.onpointerdown({ target: image, pointerType: 'touch', button: 0, pointerId, clientX, clientY: 300 });
    stage.onpointermove({ pointerId: 2, clientX: 600, clientY: 300 });
    assert.equal(app.$('imageZoomLabel').textContent, '150%');
    app.viewer.close(); app.viewer.open({ src: 'blob:second', alt: 'Solution image', focus() {} });
    assert.equal(app.$('imageZoomLabel').textContent, '100%');
    assert.equal(image.src, 'blob:second');
  } finally { app.cleanup(); }
});
