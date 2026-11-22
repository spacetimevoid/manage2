export function existingTopics(files) {
  return [...new Set(files.filter(file => file.kind !== 'subject').map(file => file.topic?.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function createTopicPicker(input, getTopics, { id = 'topicSuggestions', label = 'Topics', onChoose = null, captureKeys = false } = {}) {
  const field = input.parentElement;
  field.classList.add('topic-picker-field');
  const list = document.createElement('div');
  list.id = id; list.className = 'topic-picker-list'; list.hidden = true;
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label); field.append(list);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  let selected = -1, choices = [];
  function close() {
    list.hidden = true; selected = -1;
    input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  }
  function choose(value) { input.value = value; close(); onChoose?.(value); }
  function open(filter = '') {
    choices = getTopics().filter(topic => topic.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
    selected = -1; input.removeAttribute('aria-activedescendant');
    list.replaceChildren(...choices.map((topic, index) => {
      const option = document.createElement('div');
      option.id = `${id}Option${index}`; option.className = 'topic-picker-option'; option.textContent = topic;
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      option.onpointerdown = event => event.preventDefault();
      option.onclick = () => choose(topic);
      return option;
    }));
    if (!choices.length) { close(); return; }
    const rect = input.getBoundingClientRect(), bounds = field.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
    const upward = below < 194 && above > below;
    list.style.top = upward ? 'auto' : 'calc(100% + 4px)';
    list.style.bottom = upward ? `${bounds.bottom - rect.top + 4}px` : 'auto';
    list.style.maxHeight = `${Math.max(0, Math.min(194, upward ? above : below))}px`;
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  input.addEventListener('focus', () => open());
  input.addEventListener('click', () => { if (list.hidden) open(); });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); if (list.hidden) open(input.value);
      if (list.hidden) return;
      selected = selected < 0 ? (event.key === 'ArrowDown' ? 0 : choices.length - 1) : (selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      [...list.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === selected)));
      input.setAttribute('aria-activedescendant', list.children[selected].id);
      list.children[selected].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !list.hidden && selected >= 0) {
      if (captureKeys) event.stopImmediatePropagation();
      event.preventDefault(); choose(choices[selected]);
    } else if (event.key === 'Tab') close();
  }, captureKeys);
  document.addEventListener('pointerdown', event => { if (!field.contains(event.target)) close(); });
  window.addEventListener('resize', close);
  close();
  return { close };
}
