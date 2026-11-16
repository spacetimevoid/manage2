import { sourceEntries } from './source-extraction.js';
import { problemTitle } from './problem-data.js';
import { captureListMotion } from './list-motion.js';

export function createSourceOutline(pane, jump, contextMenu = null) {
  const notes = pane.querySelector('#pdfNotesTextarea'), saved = pane.querySelector('#pdfNotesSavedLabel');
  const header = pane.querySelector('.pdf-notes-header-left');
  const tabs = document.createElement('div');
  tabs.className = 'source-notes-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Notes and saved problems');
  const outline = document.createElement('div');
  outline.id = 'sourceProblemOutline'; outline.className = 'source-outline';
  outline.setAttribute('role', 'tabpanel'); outline.setAttribute('aria-labelledby', 'sourceProblemsTab'); outline.tabIndex = 0;
  notes.setAttribute('role', 'tabpanel'); notes.setAttribute('aria-labelledby', 'sourceNotesTab');
  function tab(label, id, panel) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'source-notes-tab'; button.textContent = label; button.id = id;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel);
    tabs.append(button); return button;
  }
  const notesTab = tab('Notes', 'sourceNotesTab', notes.id);
  const problemsTab = tab('Problems', 'sourceProblemsTab', outline.id);
  header.querySelector('.pdf-notes-title').replaceWith(tabs);
  pane.append(outline);
  let problems = false, sourceId = null;
  function select(value) {
    problems = value;
    notes.hidden = value; saved.hidden = value; outline.hidden = !value;
    notesTab.setAttribute('aria-selected', String(!value)); problemsTab.setAttribute('aria-selected', String(value));
    notesTab.tabIndex = value ? -1 : 0; problemsTab.tabIndex = value ? 0 : -1;
  }
  notesTab.onclick = () => select(false); problemsTab.onclick = () => select(true);
  tabs.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    select(event.key === 'Home' ? false : event.key === 'End' ? true : !problems);
    (problems ? problemsTab : notesTab).focus();
  };
  select(false);
  return {
    focus() { (problems ? problemsTab : notes).focus(); },
    render(files, source, animate = true) {
      const finishMotion = animate ? captureListMotion(outline) : () => {};
      if (sourceId !== source?.id) select(false);
      sourceId = source?.id;
      const entries = source ? sourceEntries(files, source.id) : [];
      outline.replaceChildren(...entries.map(file => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = problemTitle(file);
        button.title = 'Page ' + file.sourceLocation.page;
        button.setAttribute('data-id', file.id);
        button.onclick = () => jump(file.sourceLocation).catch(error => console.error('Unable to jump to problem:', error));
        button.oncontextmenu = event => {
          if (!contextMenu) return;
          event.preventDefault(); event.stopPropagation();
          contextMenu(event, file);
        };
        return button;
      }));
      finishMotion();
    },
  };
}
