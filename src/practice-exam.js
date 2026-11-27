import { documentSubjects, problemCode } from './subject-tags.js';
import { generatePracticeVariant } from './practice-variant.js';
import { gradePracticeQuestions } from './practice-questions.js';
import './practice-exam.css';

export function installPracticeExam(button, dialog, { getProblems, loadProblem }) {
  const form = dialog.querySelector('#practiceExamForm');
  const choices = dialog.querySelector('#practiceExamChoices');
  const error = dialog.querySelector('#practiceExamError');
  const preview = dialog.querySelector('#practiceExamPreview');
  const questions = dialog.querySelector('#practiceExamQuestions');
  const submit = form.querySelector('[type="submit"]');
  const generate = dialog.querySelector('#practiceExamGenerate');
  const review = dialog.querySelector('#practiceExamReview');
  const reviewList = review.querySelector('ol');
  const reviewError = review.querySelector('[role="alert"]');
  const attempt = dialog.querySelector('#practiceExamAttempt');
  const attemptList = attempt.querySelector('ol');
  const attemptSubmit = attempt.querySelector('[type="submit"]');
  const scoreLabel = dialog.querySelector('#practiceExamScore');
  const urls = [];
  let problems = [];
  let variants = [], exam = [], request;
  let generation = 0;

  function clearPreview() {
    questions.replaceChildren();
    reviewList.replaceChildren();
    attemptList.replaceChildren();
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  }

  function show(panel, focus) {
    for (const element of [form, preview, review, attempt]) element.hidden = element !== panel;
    dialog.scrollTop = 0;
    focus?.focus({ preventScroll: true });
  }

  function paragraph(parent, text, className) {
    const element = document.createElement('p');
    element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }

  function renderOriginal(parent, { pdf, images }, number) {
    if (pdf instanceof Blob) addMedia(parent, pdf, 'iframe', number);
    for (const image of images) addMedia(parent, image, 'img', number);
  }

  function renderVariantReview(entries) {
    variants = entries;
    reviewError.textContent = '';
    entries.forEach(({ source, attachments, question, error: issue }, index) => {
      const row = document.createElement('li');
      const original = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Original ${problemCode(source)}`;
      original.append(summary);
      renderOriginal(original, attachments, index + 1);
      row.append(original);
      if (issue) paragraph(row, issue, 'modal-error');
      else {
        paragraph(row, question.question, 'practice-exam-text');
        const options = document.createElement('ol');
        options.type = 'A';
        for (const [index, option] of question.options.entries()) {
          const item = document.createElement('li');
          item.textContent = option;
          if (index === question.correctIndex) item.className = 'practice-exam-correct';
          options.append(item);
        }
        row.append(options);
        paragraph(row, `Answer: ${String.fromCharCode(65 + question.correctIndex)}. ${question.explanation}`, 'practice-exam-text');
        const label = document.createElement('label');
        const approved = document.createElement('input');
        approved.type = 'checkbox';
        approved.value = index;
        label.append(approved, ' Include this variant');
        row.append(label);
      }
      reviewList.append(row);
    });
    const start = review.querySelector('[type="submit"]');
    start.disabled = entries.every(entry => !entry.question);
    show(review, review.querySelector('summary'));
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
    request?.abort();
    request = null;
    generate.textContent = 'Generate variants';
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
    submit.disabled = generate.disabled = !problems.length;
    show(form);
    dialog.showModal();
  };

  choices.onchange = () => { error.textContent = ''; };

  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const makeVariants = event.submitter === generate;
    const selected = new Set([...choices.querySelectorAll(':checked')].map(input => input.value));
    const picked = problems.filter(file => selected.has(file.id));
    if (!picked.length) {
      error.textContent = 'Select at least one problem.';
      return;
    }
    submit.disabled = generate.disabled = true;
    error.textContent = '';
    const current = ++generation;
    const controller = new AbortController();
    request = controller;
    try {
      const generated = [];
      for (const [index, file] of picked.entries()) {
        const attachments = { pdf: null, images: [] };
        try {
          if (makeVariants) generate.textContent = `Generating ${index + 1}/${picked.length}…`;
          await loadProblem(file);
          controller.signal.throwIfAborted();
          attachments.pdf = file.blob;
          attachments.images = (file.statementImages || []).map(record => record.blob).filter(blob => blob instanceof Blob);
          if (!(attachments.pdf instanceof Blob) && !attachments.images.length) throw new Error(`${problemCode(file)} has no problem statement.`);
          if (makeVariants) {
            const question = await generatePracticeVariant(attachments, controller.signal);
            generated.push({ source: file, attachments, question });
          } else {
            const question = document.createElement('li');
            renderOriginal(question, attachments, index + 1);
            questions.append(question);
          }
        } catch (issue) {
          if (!makeVariants || controller.signal.aborted) throw issue;
          generated.push({ source: file, attachments, error: issue.message });
        }
      }
      if (current !== generation || !dialog.open) return;
      if (makeVariants) renderVariantReview(generated);
      else show(preview, preview.querySelector('[data-back-exam]'));
    } catch (cause) {
      if (current !== generation || !dialog.open) return;
      clearPreview();
      error.textContent = cause.message || 'Unable to load the selected problems.';
    } finally {
      if (current === generation) {
        submit.disabled = generate.disabled = false;
        generate.textContent = 'Generate variants';
        request = null;
      }
    }
  };

  review.onchange = () => { reviewError.textContent = ''; };
  review.onsubmit = event => {
    event.preventDefault();
    exam = [...reviewList.querySelectorAll('input:checked')].map(input => variants[Number(input.value)].question);
    if (!exam.length) {
      reviewError.textContent = 'Include at least one variant.';
      return;
    }
    scoreLabel.hidden = true;
    scoreLabel.textContent = '';
    attemptSubmit.hidden = false;
    attemptList.replaceChildren(...exam.map((question, index) => {
      const row = document.createElement('li');
      const group = document.createElement('fieldset');
      group.className = 'practice-exam-picker';
      const prompt = paragraph(row, question.question, 'practice-exam-text');
      prompt.id = `practice-question-${index}`;
      group.setAttribute('aria-labelledby', prompt.id);
      question.options.forEach((option, choice) => {
        const label = document.createElement('label');
        label.className = 'practice-exam-choice';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `question-${index}`;
        radio.value = choice;
        label.append(radio, `${String.fromCharCode(65 + choice)}. ${option}`);
        group.append(label);
      });
      row.append(group);
      return row;
    }));
    show(attempt, attemptList.querySelector('input'));
  };

  attempt.onsubmit = event => {
    event.preventDefault();
    if (attemptSubmit.hidden) return;
    const answers = new FormData(attempt);
    const choices = exam.map((_, index) => {
      const answer = answers.get(`question-${index}`);
      return answer === null ? null : Number(answer);
    });
    const { score, total, results } = gradePracticeQuestions(exam, choices);
    [...attemptList.children].forEach((row, index) => {
      const { answer, correct } = results[index];
      for (const input of row.querySelectorAll('input')) input.disabled = true;
      const { correctIndex, explanation } = exam[index];
      const outcome = correct ? 'Correct' : answer === null ? 'Unanswered' : 'Incorrect';
      paragraph(row, `${outcome}. Answer: ${String.fromCharCode(65 + correctIndex)}. ${explanation}`, 'practice-exam-text');
    });
    attemptSubmit.hidden = true;
    scoreLabel.textContent = `Score: ${score}/${total}`;
    scoreLabel.hidden = false;
    scoreLabel.focus();
  };

  for (const back of dialog.querySelectorAll('[data-back-exam]')) back.onclick = () => {
    clearPreview();
    show(form, choices.querySelector(':checked'));
  };
  for (const close of dialog.querySelectorAll('[data-close-exam]')) close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    ++generation;
    request?.abort();
    request = null;
    generate.textContent = 'Generate variants';
    clearPreview();
    problems = [];
    variants = [];
    exam = [];
  });
}
