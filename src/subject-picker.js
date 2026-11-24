import { normalizeSubject } from './metadata.js';

export const subjectLabel = value => String(value || '');

export function createSubjectPicker(input, { getOptions, getSelected, toggle, create, inline = false }) {
  const box = input.parentElement, list = document.createElement('div');
  box.classList.add('topic-picker-field');
  list.id = `${input.id}Suggestions`; list.className = `topic-picker-list subject-picker-list${inline ? ' is-inline' : ''}`;
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Subjects'); list.setAttribute('aria-multiselectable', 'true');
  box.append(list);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', list.id);
  let choices = [], cursor = -1, open = false;
  function close() { open = false; list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function choose(index) {
    const choice = choices[index]; if (!choice) return;
    if (choice.create) create(choice.value); else toggle(choice.value);
    input.value = ''; input.focus(); show();
  }
  function show() {
    const text = input.value.trim();
    let query;
    try { query = text ? normalizeSubject(text) : ''; } catch { close(); return; }
    const selected = getSelected();
    const all = [...new Set([...getOptions(), ...selected])].sort((a, b) => a.localeCompare(b));
    choices = all.filter(value => value.includes(query)).map(value => ({ value }));
    if (query && !all.includes(query)) choices.push({ value: query, create: true });
    list.replaceChildren(...choices.map((choice, index) => {
      const option = document.createElement('div'); option.className = 'topic-picker-option subject-picker-option'; option.id = `${list.id}Option${index}`;
      const checked = selected.includes(choice.value);
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(checked));
      const name = document.createElement('span'); name.textContent = choice.create ? `Create “${subjectLabel(choice.value)}”` : subjectLabel(choice.value);
      const mark = document.createElement('span'); mark.className = 'subject-picker-check'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = checked ? '✓' : choice.create ? '+' : '';
      option.append(name, mark);
      option.onpointerdown = event => event.preventDefault(); option.onclick = () => choose(index);
      return option;
    }));
    cursor = -1; input.removeAttribute('aria-activedescendant');
    if (!choices.length) { close(); return; }
    if (!inline) {
      const rect = box.getBoundingClientRect(), below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
      const up = below < 194 && above > below;
      list.style.top = up ? 'auto' : 'calc(100% + 4px)'; list.style.bottom = up ? 'calc(100% + 4px)' : 'auto';
      list.style.maxHeight = `${Math.max(0, Math.min(194, up ? above : below))}px`;
    }
    open = true; list.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  input.addEventListener('focus', show); input.addEventListener('click', () => { if (!open) show(); }); input.addEventListener('input', show);
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); if (!open) show(); if (!open) return;
      cursor = cursor < 0 ? (event.key === 'ArrowDown' ? 0 : choices.length - 1) : (cursor + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      [...list.children].forEach((row, index) => row.classList.toggle('is-highlighted', index === cursor));
      input.setAttribute('aria-activedescendant', list.children[cursor].id); list.children[cursor].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && open) {
      event.preventDefault(); event.stopImmediatePropagation();
      const exact = choices.findIndex(choice => subjectLabel(choice.value) === subjectLabel(input.value.trim().toLocaleLowerCase()));
      choose(cursor >= 0 ? cursor : exact >= 0 ? exact : choices.findIndex(choice => choice.create));
    } else if (event.key === 'Tab') close();
  }, true);
  input.addEventListener('blur', close);
  document.addEventListener('pointerdown', event => { if (!box.contains(event.target)) close(); });
  window.addEventListener('resize', close);
  close();
  return { close, refresh() { if (open) show(); } };
}
