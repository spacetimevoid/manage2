export function createSubjectModal(save) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop subject-modal-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.inert = true;
  backdrop.innerHTML = `<div class="apple-modal" role="dialog" aria-modal="true" aria-labelledby="subjectModalTitle">
    <h2 class="modal-breadcrumb" id="subjectModalTitle">Add subject</h2>
    <form novalidate>
      <div class="modal-field"><label class="modal-label" for="subjectNameInput">Subject</label><input class="classic-input" id="subjectNameInput" autocomplete="off" spellcheck="false" placeholder="subject"></div>
      <div class="modal-error" role="alert"></div>
      <div class="modal-actions"><button type="submit" class="classic-aqua-btn is-primary">Save</button><button type="button" class="classic-cancel-link">Cancel</button></div>
    </form>
  </div>`;
  document.body.append(backdrop);
  const form = backdrop.querySelector('form'), input = backdrop.querySelector('input');
  const error = backdrop.querySelector('[role=alert]'), submit = backdrop.querySelector('[type=submit]'), cancel = backdrop.querySelector('[type=button]');
  const shell = document.querySelector('.manage-shell');
  let view, origin, busy = false;
  function close() {
    if (busy) return;
    backdrop.classList.remove('is-open'); backdrop.setAttribute('aria-hidden', 'true'); backdrop.inert = true;
    shell.inert = false; document.body.style.overflow = ''; origin?.focus();
  }
  cancel.onclick = close;
  backdrop.onkeydown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === input) { event.preventDefault(); cancel.focus(); }
      else if (!event.shiftKey && document.activeElement === cancel) { event.preventDefault(); input.focus(); }
    }
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    busy = true; submit.disabled = cancel.disabled = input.disabled = true; error.textContent = '';
    try { await save(input.value, view); busy = false; close(); }
    catch (reason) { error.textContent = reason.message || 'Unable to save subject.'; }
    finally { busy = false; submit.disabled = cancel.disabled = input.disabled = false; }
  };
  return { open(collection) {
    if (busy) return;
    view = collection; origin = document.activeElement; form.reset(); error.textContent = '';
    backdrop.inert = false; backdrop.classList.add('is-open'); backdrop.setAttribute('aria-hidden', 'false');
    shell.inert = true; document.body.style.overflow = 'hidden'; input.focus();
  } };
}
