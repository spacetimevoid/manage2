import { normalizeSubject } from './metadata.js';
import { createSubjectPicker, subjectLabel } from './subject-picker.js';

export const documentSubjects = file => file.kind === 'problem' && Array.isArray(file.subjects)
  ? [...new Set(file.subjects)] : file.subject ? [file.subject] : [];
export const hasSubject = (file, subject) => documentSubjects(file).includes(subject);
export const problemCode = file => {
  const short = String(file.id).replace(/-/g, '').slice(0, 8);
  if (!/^[a-f0-9]{8}$/i.test(short)) return `#${short.toUpperCase()}`;
  const digits = parseInt(short, 16).toString().padStart(10, '0');
  return `#${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export function createSubjectTags(form, { id = 'problemSubjectTagsInput', onChange = null, allowEmpty = false, getSuggestions = null, inline = false, onUndo = null } = {}) {
  const field = document.createElement('div'); field.className = 'modal-field problem-subject-field'; field.hidden = true;
  const label = document.createElement('label'); label.className = 'modal-label'; label.htmlFor = id; label.textContent = 'Subjects';
  const box = document.createElement('div'); box.className = 'subject-tags';
  const tags = document.createElement('div'); tags.className = 'subject-tag-items';
  const input = document.createElement('input'); input.id = id; input.placeholder = getSuggestions ? 'Search or create subject' : 'Add subject'; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Add subject with Enter or comma');
  box.append(tags, input); field.append(label, box); form.prepend(field);
  let values = [], confirmed = [], generation = 0, revision = 0, confirmedRevision = 0, picker = null, undo = [];
  async function changed(before) {
    if (!onChange) return;
    const version = generation;
    const change = ++revision, next = [...values];
    try {
      if (!allowEmpty && !next.length) throw new Error('Keep at least one subject.');
      await onChange(next, before);
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
      const name = document.createElement('span'); name.textContent = subjectLabel(value);
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
    if (!onChange) undo.push(before);
    render(); picker?.refresh(); input.setCustomValidity(''); input.focus(); return changed(before);
  }
  function commit() {
    if (!input.value.trim()) return;
    const before = [...values];
    const next = input.value.split(',').filter(value => value.trim()).map(normalizeSubject);
    values = [...new Set([...values, ...next])]; input.value = ''; input.setCustomValidity(''); render();
    picker?.close();
    return changed(before);
  }
  input.oninput = () => input.setCustomValidity('');
  input.onkeydown = event => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !input.value && (onUndo || undo.length)) {
      event.preventDefault(); event.stopPropagation?.();
      if (onUndo) Promise.resolve(onUndo()).catch(error => { input.setCustomValidity(error.message); input.reportValidity(); });
      else { values = undo.pop(); render(); picker?.refresh(); }
      return;
    }
    if (event.key === 'Backspace' && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && input.value === '' && values.length) {
      event.preventDefault(); event.stopPropagation?.(); return removeTag(values.at(-1));
    }
    if (event.isComposing || !['Enter', ','].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation?.();
    try { commit(); } catch (error) { input.setCustomValidity(error.message); input.reportValidity(); }
    input.focus();
  };
  if (getSuggestions) picker = createSubjectPicker(input, {
    getOptions: getSuggestions, getSelected: () => [...values], inline,
    toggle(value) { if (values.includes(value)) return removeTag(value); input.value = value; return commit(); },
    create(value) { input.value = value; return commit(); },
  });
  return {
    element: field,
    set(items, visible) { picker?.close(); undo = []; generation++; revision = confirmedRevision = 0; values = [...new Set(items)]; confirmed = [...values]; input.value = ''; input.setCustomValidity(''); field.hidden = !visible; render(); },
    get() { commit(); if (!allowEmpty && !values.length) throw new Error('Add at least one subject.'); return [...values]; },
    focus() { input.focus(); },
  };
}

export function createDetailSubjectTags(container, save, getSuggestions = null, onUndo = null) {
  const display = document.createElement('div'); display.className = 'detail-subject-display';
  let values = [], version = 0, expanded = false, more = null;
  const editor = createSubjectTags(container, {
    id: 'detailSubjectTagsInput',
    allowEmpty: true,
    getSuggestions,
    inline: true, onUndo,
    async onChange(next, previous) {
      const current = version, before = values;
      values = next; render();
      try { await save(next, previous); }
      catch (error) { if (current === version && values === next) { values = before; render(); } throw error; }
    },
  });
  const floating = typeof editor.element.showPopover === 'function';
  if (floating) {
    editor.element.setAttribute('popover', 'auto'); editor.element.classList.add('detail-subject-picker');
    editor.element.addEventListener('toggle', event => { if (event.newState === 'closed') editor.element.hidden = true; });
    window.addEventListener('resize', () => { if (editor.element.matches(':popover-open')) collapse(); });
    document.addEventListener('scroll', event => {
      if (editor.element.matches(':popover-open') && !editor.element.contains(event.target)) collapse();
    }, true);
  }
  function openEditor() {
    editor.set(values, true);
    if (floating) {
      editor.element.showPopover();
      editor.focus();
      const rect = container.getBoundingClientRect();
      editor.element.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - editor.element.offsetWidth - 8))}px`;
      editor.element.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - editor.element.offsetHeight - 8))}px`;
    } else { display.hidden = true; editor.focus(); }
  }
  container.prepend(display);
  function render() {
    display.classList?.toggle('is-expanded', expanded);
    display.replaceChildren(...(values.length ? values : [null]).map(value => {
      const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'subject-tag'; tag.textContent = subjectLabel(value);
      if (value === null) { tag.className = 'doc-action-link'; tag.textContent = 'Add subject'; }
      tag.setAttribute('aria-label', `Edit subjects: ${value}`);
      tag.onclick = openEditor;
      return tag;
    }));
    more = document.createElement('button'); more.type = 'button'; more.className = 'detail-subject-more'; more.textContent = '+1';
    more.setAttribute('aria-label', 'Show all subjects'); more.hidden = true;
    more.onclick = () => { expanded = !expanded; fit(); };
    display.append(more); fit();
  }
  function fit() {
    display.classList?.toggle('is-expanded', expanded);
    const tags = [...display.children].filter(tag => tag !== more);
    tags.forEach(tag => { tag.hidden = false; });
    more.hidden = true;
    if (expanded) {
      more.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 7.5 6 4.5 9 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    } else more.textContent = `+${Math.max(1, values.length - 1)}`;
    more.setAttribute('aria-label', expanded ? 'Collapse subjects' : 'Show all subjects');
    more.setAttribute('aria-expanded', String(expanded));
    if (expanded) { more.hidden = false; return; }
    if (display.hidden || !display.getBoundingClientRect) return;
    const width = display.getBoundingClientRect().width;
    if (!width) return;
    const sizes = tags.map(tag => tag.getBoundingClientRect().width);
    more.hidden = false;
    let count = tagRowCount(width, sizes, more.getBoundingClientRect().width);
    more.textContent = `+${tags.length - count}`;
    count = tagRowCount(width, sizes, more.getBoundingClientRect().width);
    more.textContent = `+${tags.length - count}`;
    tags.forEach((tag, index) => { tag.hidden = index >= count; });
    more.hidden = count === tags.length;
  }
  if (globalThis.ResizeObserver) new ResizeObserver(fit).observe(container);
  function collapse() { if (floating) editor.element.hidePopover(); editor.element.hidden = true; display.hidden = false; fit(); }
  editor.element.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); collapse(); display.firstElementChild?.focus(); }
  });
  editor.element.addEventListener('focusout', event => {
    if (floating) return;
    if (event.relatedTarget && container.contains(event.relatedTarget)) return;
    const current = version;
    // A microtask can run before the browser finishes transferring focus.
    setTimeout(() => {
      if (current !== version) return;
      if (container.contains(document.activeElement)) return;
      try { editor.get(); collapse(); } catch { /* Keep invalid input available for correction. */ }
    }, 0);
  });
  return { set(next) { if (floating) editor.element.hidePopover(); version++; expanded = false; values = [...next]; editor.set(values, false); display.hidden = false; render(); } };
}

export function tagRowCount(width, sizes, moreWidth, gap = 6) {
  if (sizes.reduce((sum, size) => sum + size, 0) + Math.max(0, sizes.length - 1) * gap <= width) return sizes.length;
  let used = 0, count = 0;
  for (const size of sizes) {
    if (used + size + gap + moreWidth > width) break;
    used += size + gap; count++;
  }
  return count;
}
