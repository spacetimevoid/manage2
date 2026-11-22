import { normalizeSubject } from './metadata.js';

export const documentSubjects = file => file.kind === 'problem' && Array.isArray(file.subjects)
  ? [...new Set(file.subjects)] : file.subject ? [file.subject] : [];
export const hasSubject = (file, subject) => documentSubjects(file).includes(subject);
export const problemCode = file => {
  const short = String(file.id).replace(/-/g, '').slice(0, 8);
  if (!/^[a-f0-9]{8}$/i.test(short)) return `#${short.toUpperCase()}`;
  const digits = parseInt(short, 16).toString().padStart(10, '0');
  return `#${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export function createSubjectTags(form, { id = 'problemSubjectTagsInput', onChange = null, allowEmpty = false } = {}) {
  const field = document.createElement('div'); field.className = 'modal-field problem-subject-field'; field.hidden = true;
  const label = document.createElement('label'); label.className = 'modal-label'; label.htmlFor = id; label.textContent = 'Subjects';
  const box = document.createElement('div'); box.className = 'subject-tags';
  const tags = document.createElement('div'); tags.className = 'subject-tag-items';
  const input = document.createElement('input'); input.id = id; input.placeholder = 'Add subject'; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Add subject with Enter or comma');
  box.append(tags, input); field.append(label, box); form.prepend(field);
  let values = [], confirmed = [], generation = 0, revision = 0, confirmedRevision = 0;
  async function changed(before) {
    if (!onChange) return;
    const version = generation;
    const change = ++revision, next = [...values];
    try {
      if (!allowEmpty && !next.length) throw new Error('Keep at least one subject.');
      await onChange(next);
      if (version === generation && change > confirmedRevision) { confirmed = next; confirmedRevision = change; }
    } catch (error) {
      if (version === generation && change === revision) {
        values = [...confirmed]; render(); input.setCustomValidity(error.message); input.reportValidity();
      }
    }
  }
  function render() {
    tags.replaceChildren(...values.map(value => {
      const tag = document.createElement('span'); tag.className = 'subject-tag';
      const name = document.createElement('span'); name.textContent = value;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${value}`);
      // Keep the input focused until click runs. Otherwise blur can collapse
      // the editor between pointerdown and click, leaving a display tag under
      // the pointer instead of the delete button.
      remove.onpointerdown = event => { if (event.button === 0) event.preventDefault(); };
      remove.onclick = event => { event?.preventDefault(); event?.stopPropagation(); return removeTag(value); };
      tag.append(name, remove); return tag;
    }));
  }
  function removeTag(value) {
    const before = [...values]; values = values.filter(item => item !== value);
    render(); input.setCustomValidity(''); input.focus(); return changed(before);
  }
  function commit() {
    if (!input.value.trim()) return;
    const before = [...values];
    const next = input.value.split(',').filter(value => value.trim()).map(normalizeSubject);
    values = [...new Set([...values, ...next])]; input.value = ''; input.setCustomValidity(''); render();
    return changed(before);
  }
  input.oninput = () => input.setCustomValidity('');
  input.onkeydown = event => {
    if (event.key === 'Backspace' && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && input.value === '' && values.length) {
      event.preventDefault(); event.stopPropagation?.(); return removeTag(values.at(-1));
    }
    if (event.isComposing || !['Enter', ','].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation?.();
    try { commit(); } catch (error) { input.setCustomValidity(error.message); input.reportValidity(); }
    input.focus();
  };
  return {
    element: field,
    set(items, visible) { generation++; revision = confirmedRevision = 0; values = [...new Set(items)]; confirmed = [...values]; input.value = ''; input.setCustomValidity(''); field.hidden = !visible; render(); },
    get() { commit(); if (!allowEmpty && !values.length) throw new Error('Add at least one subject.'); return [...values]; },
    focus() { input.focus(); },
  };
}

export function createDetailSubjectTags(container, save) {
  const display = document.createElement('div'); display.className = 'detail-subject-display';
  let values = [], version = 0;
  const editor = createSubjectTags(container, {
    id: 'detailSubjectTagsInput',
    allowEmpty: true,
    async onChange(next) {
      const current = version, before = values;
      values = next; render();
      try { await save(next); }
      catch (error) { if (current === version && values === next) { values = before; render(); } throw error; }
    },
  });
  container.prepend(display);
  function render() {
    display.replaceChildren(...(values.length ? values : [null]).map(value => {
      const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'subject-tag'; tag.textContent = value;
      if (value === null) { tag.className = 'doc-action-link'; tag.textContent = 'Add subject'; }
      tag.setAttribute('aria-label', `Edit subjects: ${value}`);
      tag.onclick = () => { display.hidden = true; editor.set(values, true); editor.focus(); };
      return tag;
    }));
  }
  function collapse() { editor.element.hidden = true; display.hidden = false; }
  editor.element.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); collapse(); display.firstElementChild?.focus(); }
  });
  editor.element.addEventListener('focusout', event => {
    if (event.relatedTarget && container.contains(event.relatedTarget)) return;
    const current = version;
    // A microtask can run before the browser finishes transferring focus.
    setTimeout(() => {
      if (current !== version) return;
      if (container.contains(document.activeElement)) return;
      try { editor.get(); collapse(); } catch { /* Keep invalid input available for correction. */ }
    }, 0);
  });
  return { set(next) { version++; values = [...next]; editor.set(values, false); display.hidden = false; render(); } };
}
