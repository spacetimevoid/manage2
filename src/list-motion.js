const running = new WeakMap();
const selector = '[data-id], [data-subject], [data-media-id]';
const keyOf = element => element.dataset.id ?? element.dataset.subject ?? element.dataset.mediaId;

// Measure before replacing a list, then animate its new nodes from the old
// visible positions. No timers delay saving, navigation or user interaction.
export function captureListMotion(container, { move = true } = {}) {
  if (!container?.querySelectorAll || !container.getClientRects) return () => {};
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const previous = new Map([...container.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => [keyOf(element), element.getBoundingClientRect()]));
  for (const animation of running.get(container) || []) animation.cancel();
  running.delete(container);
  if (reduced) return () => {};
  return () => {
    const animations = [];
    for (const element of container.querySelectorAll(selector)) {
      if (!element.getClientRects().length || !element.animate) continue;
      const before = previous.get(keyOf(element)), after = element.getBoundingClientRect();
      let frames;
      if (!before || !move) frames = [{ opacity: 0 }, { opacity: 1 }];
      else {
        const x = before.left - after.left, y = before.top - after.top;
        if (Math.abs(x) < .5 && Math.abs(y) < .5) continue;
        frames = [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }];
      }
      const animation = element.animate(frames, { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
      animations.push(animation);
      animation.finished.catch(() => {}).then(() => animation.cancel());
    }
    running.set(container, animations);
  };
}
