import { documentSubjects, problemCode } from './subject-tags.js';
import './practice-exam.css';

export function installPracticeExam(button, dialog, { getProblems, loadProblem }) {
  const form = dialog.querySelector('#practiceExamForm');
  const choices = dialog.querySelector('#practiceExamChoices');
  const error = dialog.querySelector('#practiceExamError');
  const preview = dialog.querySelector('#practiceExamPreview');
  const questions = dialog.querySelector('#practiceExamQuestions');
  const submit = form.querySelector('[type="submit"]');
  const back = dialog.querySelector('#practiceExamBack');
  const urls = [];
  let problems = [];
  let generation = 0;

  function clearPreview() {
    questions.replaceChildren();
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  }

  function addMedia(question, blob, kind, index) {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const media = document.createElement(kind);
    media.src = url;
    if (kind === 'img') media.alt = `Question ${index} statement`;
    else media.title = `Question ${index} PDF`;
    question.append(media);
  }

  button.onclick = () => {
    ++generation;
    clearPreview();
    problems = getProblems();
    choices.replaceChildren(...problems.map(file => {
      const label = document.createElement('label');
      label.className = 'practice-exam-choice';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = file.id;
      const text = document.createElement('span');
      text.textContent = [problemCode(file), ...documentSubjects(file)].join(' · ');
      label.append(check, text);
      return label;
    }));
    if (!problems.length) choices.textContent = 'No problems in this subject.';
    error.textContent = '';
    form.hidden = false;
    preview.hidden = true;
    submit.disabled = !problems.length;
    dialog.showModal();
  };

  choices.onchange = () => { error.textContent = ''; };

  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const selected = new Set([...choices.querySelectorAll(':checked')].map(input => input.value));
    const picked = problems.filter(file => selected.has(file.id));
    if (!picked.length) {
      error.textContent = 'Select at least one problem.';
      return;
    }
    submit.disabled = true;
    error.textContent = '';
    const current = ++generation;
    try {
      for (const file of picked) {
        await loadProblem(file);
        if (current !== generation || !dialog.open) return;
      }
      const attachments = picked.map(file => ({
        pdf: file.blob,
        images: (file.statementImages || []).map(record => record.blob).filter(blob => blob instanceof Blob),
      }));
      const missing = attachments.findIndex(({ pdf, images }) => !(pdf instanceof Blob) && !images.length);
      if (missing !== -1) throw new Error(`${problemCode(picked[missing])} has no problem statement.`);
      attachments.forEach(({ pdf, images }, index) => {
        const question = document.createElement('li');
        if (pdf instanceof Blob) addMedia(question, pdf, 'iframe', index + 1);
        for (const image of images) addMedia(question, image, 'img', index + 1);
        questions.append(question);
      });
      form.hidden = true;
      preview.hidden = false;
      dialog.scrollTop = 0;
      back.focus({ preventScroll: true });
    } catch (cause) {
      if (current !== generation || !dialog.open) return;
      clearPreview();
      error.textContent = cause.message || 'Unable to load the selected problems.';
    } finally {
      if (current === generation) submit.disabled = false;
    }
  };

  back.onclick = () => {
    clearPreview();
    preview.hidden = true;
    form.hidden = false;
    dialog.scrollTop = 0;
    choices.querySelector(':checked')?.focus();
  };
  for (const close of dialog.querySelectorAll('[data-close-exam]')) close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    ++generation;
    clearPreview();
    problems = [];
  });
}
