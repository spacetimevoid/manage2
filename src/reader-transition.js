export function closeReader(element, finish) {
  const wasOpen = element.classList.contains('is-open');
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  return new Promise(resolve => {
    let timer, done = false;
    const complete = () => {
      if (done) return;
      done = true; clearTimeout(timer);
      element.removeEventListener('transitionend', onEnd);
      finish(); resolve();
    };
    const onEnd = event => { if (event.target === element && event.propertyName === 'opacity') complete(); };
    if (wasOpen && !reduced) {
      element.addEventListener('transitionend', onEnd);
      timer = setTimeout(complete, 200);
    }
    element.classList.remove('is-open');
    if (!wasOpen || reduced) complete();
  });
}
