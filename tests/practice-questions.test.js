import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/practice-variant.js';
import { gradePracticeQuestions, parsePracticeQuestion } from '../src/practice-questions.js';

const variant = { question: 'What is 8 + 3?', options: ['9', '11', '10', '12'], correctIndex: 1, explanation: '8 + 3 = 11.' };

test('grading counts unanswered questions and validates the answer key', () => {
  assert.deepEqual(parsePracticeQuestion(variant), variant);
  assert.equal(parsePracticeQuestion({ ...variant, correctIndex: 4 }), null);
  assert.equal(parsePracticeQuestion({ ...variant, options: ['9', '11', '11', '12'] }), null);
  assert.deepEqual(gradePracticeQuestions([variant, variant, variant], [1, 0, null]), {
    score: 1, total: 3, results: [{ answer: 1, correct: true }, { answer: 0, correct: false }, { answer: null, correct: false }],
  });
});

test('variant route requires library membership and validates the Gemini response', async t => {
  for (const [key, value] of Object.entries({
    VITE_SUPABASE_URL: 'https://library.example', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-key', GEMINI_API_KEY: 'fixture-gemini',
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    });
  }
  let member = false, calls = 0, output = variant;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === 'library.example') {
      assert.equal(request.headers.get('authorization'), 'Bearer fixture-token');
      if (url.pathname === '/auth/v1/user') return Response.json({ email: 'fixture@example.com' });
      assert.equal(url.pathname, '/rest/v1/library_members');
      return Response.json(member ? [{ email: 'fixture@example.com' }] : []);
    }
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    assert.equal(request.headers.get('x-goog-api-key'), 'fixture-gemini');
    calls++;
    const body = await request.json();
    assert.deepEqual(body.contents[0].parts.map(part => part.inlineData.mimeType), ['application/pdf', 'image/png']);
    const parts = [{ thought: true, text: 'ignored' }, { text: JSON.stringify(output) }];
    return Response.json({ candidates: [{ content: { parts } }] });
  });
  function submit(token = 'fixture-token') {
    const body = new FormData();
    body.append('statement', new Blob(['pdf'], { type: 'application/pdf' }), 'statement.pdf');
    body.append('statement', new Blob(['image'], { type: 'image/png' }), 'statement.png');
    return handler.fetch(new Request('https://example.test/api/practice-variant', {
      method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {},
    }));
  }
  assert.equal((await submit(null)).status, 401);
  assert.equal((await submit()).status, 403);
  assert.equal(calls, 0);
  member = true;
  assert.deepEqual(await (await submit()).json(), { question: variant });
  output = { ...variant, correctIndex: -1 };
  assert.equal((await submit()).status, 422);
  assert.equal(calls, 2);
});
