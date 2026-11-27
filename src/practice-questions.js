export function parsePracticeQuestion(value) {
  if (!value || typeof value.question !== 'string' || !value.question.trim()
    || !Array.isArray(value.options) || value.options.length !== 4
    || !value.options.every(option => typeof option === 'string' && option.trim())
    || !Number.isInteger(value.correctIndex) || value.correctIndex < 0 || value.correctIndex >= 4
    || typeof value.explanation !== 'string' || !value.explanation.trim()) return null;
  const options = value.options.map(option => option.trim());
  if (new Set(options.map(option => option.normalize('NFC').toLowerCase())).size !== 4) return null;
  return { question: value.question.trim(), options, correctIndex: value.correctIndex, explanation: value.explanation.trim() };
}

export function gradePracticeQuestions(questions, answers) {
  const results = questions.map(({ correctIndex }, index) => {
    const answer = answers[index] ?? null;
    return { answer, correct: answer === correctIndex };
  });
  return { results, score: results.filter(result => result.correct).length, total: results.length };
}
