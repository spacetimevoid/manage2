import { sourceEntries } from './source-extraction.js';
import { problemTitle } from './problem-data.js';

export function createSourceOutline(body, jump, toolbar) {
  const outline = document.createElement('nav');
  outline.id = 'sourceProblemOutline';
  outline.className = 'source-outline'; outline.setAttribute('aria-label', 'Saved problems'); outline.hidden = true;
  body.prepend(outline);
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'viewer-tool-btn source-outline-toggle';
  toggle.setAttribute('aria-label', 'Saved problems'); toggle.setAttribute('aria-controls', outline.id);
  toggle.title = 'Saved problems'; toggle.disabled = true;
  toggle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg>';
  toolbar.prepend(toggle);
  let opened = false, sourceId = null;
  function setOpen(value) {
    opened = value && !toggle.disabled;
    outline.hidden = !opened;
    toggle.setAttribute('aria-expanded', String(opened));
  }
  setOpen(false);
  toggle.onclick = () => setOpen(!opened);
  return { render(files, source) {
    if (sourceId !== source?.id) opened = false;
    sourceId = source?.id;
    const entries = source ? sourceEntries(files, source.id) : [];
    outline.replaceChildren(...entries.map(file => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = problemTitle(file);
      button.title = `Page ${file.sourceLocation.page}`;
      button.onclick = () => jump(file.sourceLocation).catch(error => console.error('Unable to jump to problem:', error));
      return button;
    }));
    toggle.disabled = !entries.length;
    setOpen(opened);
  } };
}
