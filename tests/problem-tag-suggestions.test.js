import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/problem-tags.js';

test('the tag route checks membership before sending an image or PDF to AI', async t => {
  const env = {
    VITE_SUPABASE_URL: 'https://library.example',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'example-publishable-key',
    AI_GATEWAY_API_KEY: 'test-gateway-key',
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  let member = false;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const request = new Request(input, options);
    const { hostname, pathname } = new URL(request.url);
    if (hostname === 'library.example') {
      assert.equal(request.headers.get('authorization'), 'Bearer test-token');
      if (pathname === '/auth/v1/user') return Response.json({ id: 'user-id', email: 'owner@example.com' });
      assert.equal(pathname, '/rest/v1/library_members');
      return Response.json(member ? [{ email: 'owner@example.com' }] : []);
    }
    assert.equal(hostname, 'ai-gateway.vercel.sh');
    assert.equal(request.headers.get('ai-language-model-id'), 'google/gemini-3.5-flash-lite');
    calls.push(await request.json());
    return Response.json({
      content: [{ type: 'text', text: JSON.stringify({ tags: ['linear-algebra', 'Matrix Rank', 'matrix-rank', 'all', 'two,tags', 'bad/tag'] }) }],
      finishReason: { unified: 'stop' },
      usage: { inputTokens: { total: 10 }, outputTokens: { total: 10 } },
      warnings: [],
    });
  });

  function upload(type, token = 'test-token') {
    const body = new FormData();
    body.append('file', new Blob(['synthetic exercise'], { type }), 'problem');
    body.append('subjects', JSON.stringify(['linear-algebra']));
    return handler.fetch(new Request('https://manage.example/api/problem-tags', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    }));
  }

  assert.equal((await upload('image/png', null)).status, 401);
  assert.equal((await upload('image/png')).status, 403);
  member = true;
  assert.equal((await upload('text/html')).status, 400);
  assert.equal(calls.length, 0);

  for (const type of ['image/png', 'application/pdf']) {
    const response = await upload(type);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual(result, { tags: ['linear-algebra', 'matrix-rank'] });
    const payload = calls.at(-1);
    const content = payload.prompt.find(message => message.role === 'user').content;
    assert.match(content[0].text, /linear-algebra/);
    assert.equal(content[1].mediaType, type);
    assert.equal(payload.providerOptions.gateway.zeroDataRetention, true);
  }
});
