export async function fadeDeleted(elements, restoring = false) {
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  // Collapse the occupied space as well as fading the content, so siblings
  // follow the row upward throughout the animation, before the DOM refresh.
  const animations = elements.filter(Boolean).map(element => {
    const height = element.getBoundingClientRect?.().height;
    const style = globalThis.getComputedStyle?.(element);
    const frames = height && style ? [
      { opacity: 1, height: `${height}px`, minHeight: 0, boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0,
        paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
        marginTop: style.marginTop, marginBottom: style.marginBottom,
        borderTopWidth: style.borderTopWidth, borderBottomWidth: style.borderBottomWidth },
      { opacity: 0, height: '0px', minHeight: 0, boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0,
        paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' },
    ] : [{ opacity: 1 }, { opacity: 0 }];
    return element.animate?.(restoring ? frames.reverse() : frames, { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
  }).filter(Boolean);
  await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  return () => animations.forEach(animation => animation.cancel());
}

export async function revealRestored(elements) {
  const cleanup = await fadeDeleted(elements, true);
  cleanup();
}

export function createDeletionHistory(confirm) {
  const history = [];
  let busy = false;
  return {
    get canUndo() { return history.length > 0 && !busy; },
    async remove(message, action) {
      if (busy) return;
      busy = true;
      try {
        if (!await confirm(message)) return;
        const undo = await action();
        if (undo) history.push(undo);
      } finally { busy = false; }
    },
    async undo() {
      if (busy || !history.length) return;
      busy = true;
      try { await history.at(-1)(); history.pop(); }
      finally { busy = false; }
    },
  };
}

export function createDeleteConfirmation() {
  const dialog = document.createElement('dialog');
  dialog.className = 'apple-modal delete-confirmation';
  dialog.setAttribute('aria-labelledby', 'deleteConfirmationTitle');
  dialog.setAttribute('aria-describedby', 'deleteConfirmationMessage');
  dialog.innerHTML = `<h2 class="modal-breadcrumb" id="deleteConfirmationTitle">Delete?</h2><p id="deleteConfirmationMessage"></p><div class="modal-actions"><button type="button" class="classic-aqua-btn">Delete</button><button type="button" class="classic-cancel-link">Cancel</button></div>`;
  document.body.append(dialog);
  const [remove, cancel] = dialog.querySelectorAll('button');
  const message = dialog.querySelector('p');
  let resolve, origin;
  function finish(value) { dialog.close(); resolve?.(value); resolve = null; origin?.focus(); }
  remove.onclick = () => finish(true); cancel.onclick = () => finish(false);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
  return text => new Promise(done => {
    origin = document.activeElement; message.textContent = text; resolve = done;
    dialog.showModal(); cancel.focus();
  });
}

export function installDeleteUndo(history, target = document) {
  target.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z' || event.repeat) return;
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable || document.querySelector('dialog[open], .modal-backdrop.is-open') || !history.canUndo) return;
    event.preventDefault();
    history.undo().catch(error => window.alert(error.message || 'Unable to restore deleted content.'));
  });
}
