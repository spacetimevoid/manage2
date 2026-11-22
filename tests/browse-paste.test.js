import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowsePaste } from '../src/browse-paste.js';
test('Browse paste accepts image/PDF for Problems and PDF for Sources while ignoring text and closed/edit forms', () => {
  let paste, view = 'problems', enabled = true, selected, error;
  installBrowsePaste({ addEventListener(_type, fn) { paste = fn; } }, { getView: () => view, enabled: () => enabled, onFile: file => { selected = file; }, onError: message => { error = message; } });
  const png = new File(['bytes'], 'clipboard.png', { type: 'image/png' });
  const pdf = new File(['%PDF'], 'file.pdf', { type: 'application/pdf' });
  const send = files => { selected = null; error = null; paste({ clipboardData: { files }, preventDefault() {} }); };
  send([png]); assert.equal(selected, png);
  send([pdf]); assert.equal(selected, pdf);
  view = 'sources'; send([png]); assert.equal(selected, null); assert.match(error, /PDF/);
  send([pdf]); assert.equal(selected, pdf);
  send([]); assert.equal(error, null);
  enabled = false; send([pdf]); assert.equal(selected, null);
});
