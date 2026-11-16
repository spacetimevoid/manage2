import { sourceEntries } from './source-extraction.js';
import { problemTitle } from './problem-data.js';

export function createSourceOutline(body, jump) {
  const outline = document.createElement('nav');
  outline.className = 'source-outline'; outline.setAttribute('aria-label', 'Saved problems'); outline.hidden = true;
  body.prepend(outline);
  return { render(files, source) {
    const entries = source ? sourceEntries(files, source.id) : [];
    outline.replaceChildren(...entries.map(file => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = problemTitle(file);
      button.title = `Page ${file.sourceLocation.page}`;
      button.onclick = () => jump(file.sourceLocation).catch(error => console.error('Unable to jump to problem:', error));
      return button;
    }));
    outline.hidden = !entries.length;
  } };
}
