import { normalizeSubject } from './metadata.js';

export const documentSubjects = file => file.kind === 'problem' && Array.isArray(file.subjects)
  ? [...new Set(file.subjects)] : file.subject ? [file.subject] : [];
export const hasSubject = (file, subject) => documentSubjects(file).includes(subject);

export function createSubjectTags(form) {
  const field = document.createElement('div'); field.className = 'modal-field problem-subject-field'; field.hidden = true;
  const label = document.createElement('label'); label.className = 'modal-label'; label.htmlFor = 'problemSubjectTagsInput'; label.textContent = 'Subjects';
  const box = document.createElement('div'); box.className = 'subject-tags classic-input';
  const tags = document.createElement('div'); tags.className = 'subject-tag-items';
  const input = document.createElement('input'); input.id = 'problemSubjectTagsInput'; input.placeholder = 'Add subject'; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Add subject with Enter or comma');
  box.append(tags, input); field.append(label, box); form.prepend(field);
  let values = [];
  function render() {
    tags.replaceChildren(...values.map(value => {
      const tag = document.createElement('span'); tag.className = 'subject-tag';
      const name = document.createElement('span'); name.textContent = value;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${value}`);
      remove.onclick = () => { values = values.filter(item => item !== value); render(); input.focus(); };
      tag.append(name, remove); return tag;
    }));
  }
  function commit() {
    if (!input.value.trim()) return;
    const next = input.value.split(',').filter(value => value.trim()).map(normalizeSubject);
    values = [...new Set([...values, ...next])]; input.value = ''; input.setCustomValidity(''); render();
  }
  input.oninput = () => input.setCustomValidity('');
  input.onkeydown = event => {
    if (event.isComposing || !['Enter', ','].includes(event.key)) return;
    event.preventDefault();
    try { commit(); } catch (error) { input.setCustomValidity(error.message); input.reportValidity(); }
  };
  return {
    set(items, visible) { values = [...new Set(items)]; input.value = ''; input.setCustomValidity(''); field.hidden = !visible; render(); },
    get() { commit(); if (!values.length) throw new Error('Add at least one subject.'); return [...values]; },
    focus() { input.focus(); },
  };
}
