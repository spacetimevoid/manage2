import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/problem-tags.js';

test('the tag route checks membership and sends only images to the configured model', async t => {
  const env = {
    VITE_SUPABASE_URL: 'https://library.example',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'example-publishable-key',
    PROBLEM_TAGS_API_KEY: 'test-api-key',
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
    assert.equal(hostname, '1gw.gwai.cloud');
    assert.equal(pathname, '/v1/messages');
    assert.equal(request.headers.get('x-api-key'), 'test-api-key');
    assert.equal(request.headers.get('anthropic-version'), '2023-06-01');
    calls.push(await request.json());
    return Response.json({
      content: [{ type: 'text', text: JSON.stringify({ tags: ['linear-algebra', 'Matrix Rank', 'matrix-rank', 'all', 'two,tags', 'bad/tag'] }) }],
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
  assert.equal((await upload('application/pdf')).status, 400);
  assert.equal(calls.length, 0);

  const response = await upload('image/png');
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.deepEqual(result, { tags: ['linear-algebra', 'matrix-rank'] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-haiku-5-5');
  const [image, catalog] = calls[0].messages[0].content;
  assert.deepEqual(image, { type: 'image', source: {
    type: 'base64', media_type: 'image/png', data: Buffer.from('synthetic exercise').toString('base64'),
  } });
  assert.match(catalog.text, /linear-algebra/);
});
