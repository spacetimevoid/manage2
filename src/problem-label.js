import { documentSubjects, problemCode } from './subject-tags.js';
import { escapeHtml } from './library.js';

// Derived from the record ID, never from a filtered/sorted row position.
export { problemCode };
export function problemSummary(file) {
  const tags = documentSubjects(file);
  const visible = tags.slice(0, 2).map(tag => `<span class="problem-row-tag">${escapeHtml(tag)}</span>`).join('');
  return `<span class="problem-code">${escapeHtml(problemCode(file))}</span>${visible}${tags.length > 2 ? `<button type="button" class="problem-more-tags" data-problem-tags="${escapeHtml(file.id)}" aria-label="Show all ${tags.length} subjects" aria-expanded="false">+${tags.length - 2}</button>` : ''}`;
}

export function createProblemTagsPopover() {
  const popover = document.createElement('div'); popover.className = 'problem-tags-popover';
  popover.setAttribute('popover', 'auto'); popover.setAttribute('role', 'region'); popover.setAttribute('aria-label', 'All subjects');
  document.body.append(popover);
  let trigger;
  popover.addEventListener('toggle', event => { if (event.newState === 'closed') trigger?.setAttribute('aria-expanded', 'false'); });
  return (button, file) => {
    if (trigger === button && popover.matches(':popover-open')) { popover.hidePopover(); return; }
    popover.hidePopover(); trigger?.setAttribute('aria-expanded', 'false'); trigger = button;
    popover.replaceChildren(...documentSubjects(file).map(value => {
      const tag = document.createElement('span'); tag.className = 'subject-tag'; tag.textContent = value; return tag;
    }));
    popover.showPopover(); button.setAttribute('aria-expanded', 'true');
    const rect = button.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popover.offsetWidth - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - popover.offsetHeight - 8))}px`;
  };
}
