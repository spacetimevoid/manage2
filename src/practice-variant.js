import { cloudClient } from './cloud.js';
import { prepareProblemImage } from './problem-tag-suggestions.js';
import { parsePracticeQuestion } from './practice-questions.js';

export async function generatePracticeVariant({ pdf, images }, signal) {
  const session = await cloudClient?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Sign in to generate variants.');
  signal.throwIfAborted();
  const body = new FormData();
  if (pdf instanceof Blob) body.append('statement', pdf.slice(0, pdf.size, 'application/pdf'), 'statement.pdf');
  for (const image of images) {
    const attachment = await prepareProblemImage(image);
    body.append('statement', attachment, 'statement');
  }
  const response = await fetch('/api/practice-variant', {
    method: 'POST', body, signal, headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 413) throw new Error('The problem statement is too large to send for variant generation.');
  const result = await response.json().catch(() => null);
  const question = parsePracticeQuestion(result?.question);
  if (!response.ok || !question) throw new Error(result?.error || 'Unable to generate a variant.');
  return question;
}
