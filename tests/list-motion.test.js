import test from 'node:test';
import assert from 'node:assert/strict';
import { captureListMotion } from '../src/list-motion.js';

function row(id, top, visible = true) {
  return { dataset: { id }, top, visible, animations: [], getClientRects() { return this.visible ? [1] : []; },
    getBoundingClientRect() { return { top: this.top, left: 0, height: 48 }; },
    animate(frames, options) {
      let finish, reject;
      const animation = { frames, options, cancelled: false, finished: new Promise((resolve, fail) => { finish = resolve; reject = fail; }), finish: () => finish(), cancel() { this.cancelled = true; reject(Error('cancelled')); } };
      this.animations.push(animation); return animation;
    },
  };
}
function list(rows) { return { rows, querySelectorAll() { return this.rows; }, getClientRects: () => [1] }; }

test('upload reveals the new row while existing rows move from their previous positions', async () => {
  const container = list([row('a', 0), row('b', 48)]);
  const finish = captureListMotion(container);
  container.rows = [row('new', 0), row('a', 48), row('b', 96)]; finish();
  assert.equal(container.rows[0].animations[0].frames[0].opacity, 0);
  for (const item of container.rows.slice(1)) assert.equal(item.animations[0].frames[0].transform, 'translate(0px, -48px)');
  for (const item of container.rows) item.animations[0].finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(container.rows.every(item => item.animations[0].cancelled));
});

test('sorting moves matched rows and a rapid rerender cancels previous motion without stacking', () => {
  const container = list([row('a', 0), row('b', 48)]);
  const finish = captureListMotion(container);
  container.rows = [row('b', 0), row('a', 48)]; finish();
  const prior = container.rows.flatMap(item => item.animations);
  assert.equal(prior[0].frames[0].transform, 'translate(0px, 48px)');
  const again = captureListMotion(container);
  assert.ok(prior.every(animation => animation.cancelled));
  container.rows = [row('b', 0), row('a', 48)]; again();
  assert.ok(container.rows.every(item => item.animations.length === 0));
});

test('first attachment animates after a hidden empty grid becomes visible; hidden panels and reduced motion stay still', () => {
  const container = list([]); container.getClientRects = () => [];
  const finish = captureListMotion(container);
  container.getClientRects = () => [1]; container.rows = [row('image', 0)]; finish();
  assert.equal(container.rows[0].animations.length, 1);
  container.rows[0].animations[0].finish();
  const hidden = list([row('a', 0, false)]), reveal = captureListMotion(hidden);
  hidden.rows = [row('b', 0, false)]; reveal(); assert.equal(hidden.rows[0].animations.length, 0);
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const reduced = captureListMotion(container); container.rows = [row('new', 0)]; reduced();
    assert.equal(container.rows[0].animations.length, 0);
  } finally { globalThis.matchMedia = previous; }
});
