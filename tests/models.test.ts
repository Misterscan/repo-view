import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Express } from 'express';
import { buildOpenAIRequest, buildAnthropicRequest, generateContent, registerModelRoutes } from '../server/models.ts';
import { type ModelRequest, MODELS, getModelProvider } from '../shared/models.ts';
import { retrieveByKeywords } from '../src/lib/retrieval.ts';
import { countModelTokens, generateModelContent } from '../src/lib/models.ts';

const keys = { gemini: '', openai: 'test-openai-secret', anthropic: 'test-anthropic-secret' };
function request(model = 'gpt-6.1-sol'): ModelRequest {
  return {
    model,
    contents: [
      { role: 'user', parts: [{ text: 'Earlier question' }] },
      { role: 'model', parts: [{ text: 'Earlier answer' }] },
      { role: 'user', parts: [{ text: 'Review this code' }] },
    ],
    config: {
      systemInstruction: { parts: [{ text: 'Use repository evidence.' }] },
      thinkingConfig: { thinkingLevel: 'MEDIUM' },
      tools: [{ googleSearch: {} }],
    },
  };
}

function routes(fetcher: typeof fetch = async () => { throw new Error('Unexpected external API call'); }) {
  const handlers = new Map<string, (req: any, res: any) => unknown>();
  const app = {
    get: (path: string, handler: any) => handlers.set(`GET ${path}`, handler),
    post: (path: string, handler: any) => handlers.set(`POST ${path}`, handler),
  } as unknown as Express;
  registerModelRoutes(app, keys, fetcher);
  return async (route: string, body?: unknown) => {
    let status = 0;
    let payload: any;
    const response = { status: (value: number) => { status = value; return response; }, json: (value: unknown) => { payload = value; } };
    await handlers.get(route)!({ body }, response);
    return { status, payload };
  };
}

test('catalog identifies every provider and exposes configuration without secrets', async () => {
  for (const model of MODELS) assert.equal(getModelProvider(model.id), model.provider);
  const result = await routes()('GET /api/models');
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.providers, { gemini: { configured: false }, openai: { configured: true }, anthropic: { configured: true } });
  assert.ok(!JSON.stringify(result.payload).includes('secret'));
});

test('invalid models, malformed messages, and missing keys fail without contacting a provider', async () => {
  const call = routes();
  for (const body of [null, {}, { model: 'gpt-6.1-sol', contents: {} }, { model: 'unknown', contents: request().contents }, { model: 'gpt-6.1-sol', contents: [{ role: 'system', parts: [] }] }]) {
    assert.equal((await call('POST /api/models/generate', body)).status, 400);
  }
  const missing = await call('POST /api/models/generate', request('gemini-4-argon'));
  assert.equal(missing.status, 503);
  assert.match(missing.payload.error, /GEMINI_API_KEY/);
});

test('OpenAI receives native Responses input, history, instructions, search, and images/PDF/text', async () => {
  const input = request();
  input.contents[2].parts.push(
    { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } },
    { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } },
    { inlineData: { mimeType: 'text/plain', data: Buffer.from('const value = 1;').toString('base64') } },
  );
  let calls = 0;
  const result = await routes(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal((options!.headers as Record<string, string>).Authorization, `Bearer ${keys.openai}`);
    const body = JSON.parse(String(options!.body));
    assert.equal(body.store, false);
    assert.equal(body.instructions, 'Use repository evidence.');
    assert.equal(body.input[1].role, 'assistant');
    assert.deepEqual(body.input[1].content, [{ type: 'output_text', text: 'Earlier answer', annotations: [] }]);
    assert.deepEqual(body.reasoning, { effort: 'medium' });
    assert.deepEqual(body.tools, [{ type: 'web_search' }]);
    assert.deepEqual(body.input[2].content.map((part: any) => part.type), ['input_text', 'input_image', 'input_file', 'input_text']);
    assert.equal(body.input[2].content[3].text, 'const value = 1;');
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Review complete.', annotations: [{ url: 'https://example.com/docs', title: 'Docs' }] }] }] });
  })('POST /api/models/generate', input);
  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.match(result.payload.text, /Review complete/);
  assert.match(result.payload.text, /https:\/\/example.com\/docs/);
});

test('OpenAI uses output_text for assistant greetings and each assistant turn in multi-turn history', () => {
  const input = request();
  input.contents.unshift({ role: 'model', parts: [{ text: 'Welcome to RepoView.' }] });
  input.contents.push(
    { role: 'model', parts: [{ text: 'First explanation.' }, { text: 'More details.' }] },
    { role: 'user', parts: [{ text: 'Explain the next step.' }] },
  );
  const body = buildOpenAIRequest(input);
  assert.deepEqual(body.input.map(message => message.role), ['assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
  for (const message of body.input) {
    for (const part of message.content) {
      assert.equal(part.type, message.role === 'assistant' ? 'output_text' : 'input_text');
    }
  }
  assert.equal(body.input[4].content.length, 2);
});

test('Anthropic receives Messages content and resumes paused search without losing tool blocks', async () => {
  const input = request('claude-sonnet-5-5');
  input.contents[2].parts.push({ inlineData: { mimeType: 'image/jpeg', data: 'aW1hZ2U=' } });
  const paused = [{ type: 'server_tool_use', id: 'tool-1', name: 'web_search', input: { query: 'docs' } }];
  let calls = 0;
  const result = await generateContent(input, keys, async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal((options!.headers as Record<string, string>)['x-api-key'], keys.anthropic);
    const body = JSON.parse(String(options!.body));
    assert.equal(body.system, 'Use repository evidence.');
    assert.equal(body.messages[1].role, 'assistant');
    assert.deepEqual(body.thinking, { type: 'adaptive' });
    assert.deepEqual(body.output_config, { effort: 'medium' });
    assert.equal(body.messages[2].content[1].source.media_type, 'image/jpeg');
    calls++;
    if (calls === 1) return Response.json({ stop_reason: 'pause_turn', content: paused });
    assert.deepEqual(body.messages[3], { role: 'assistant', content: paused });
    return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Claude result.', citations: [{ url: 'https://example.com/source', title: 'Source' }] }] });
  });
  assert.equal(calls, 2);
  assert.match(result, /Claude result/);
  assert.match(result, /https:\/\/example.com\/source/);
});

test('disabled grounding sends no search tools; minimal maps to supported low effort', () => {
  for (const build of [buildOpenAIRequest, buildAnthropicRequest]) {
    const input = request();
    input.config!.tools = [];
    input.config!.thinkingConfig = { thinkingLevel: 'MINIMAL' };
    const body = build(input);
    assert.deepEqual(body.tools, []);
    assert.equal('reasoning' in body ? body.reasoning.effort : body.output_config.effort, 'low');
  }
});

test('provider file URLs and unsupported attachments are rejected', () => {
  for (const build of [buildOpenAIRequest, buildAnthropicRequest]) {
    const input = request();
    input.contents[2].parts = [{ fileData: { mimeType: 'text/plain', fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/private' } }];
    assert.throws(() => build(input), /file URLs cannot be shared/);
    input.contents[2].parts = [{ inlineData: { mimeType: 'application/zip', data: 'aW1hZ2U=' } }];
    assert.throws(() => build(input), /Unsupported attachment/);
  }
});

test('provider errors retain status and truncated output is surfaced', async () => {
  const result = await routes(async () => Response.json({ error: { message: 'Rate limit reached.' } }, { status: 429 }))('POST /api/models/generate', request());
  assert.equal(result.status, 429);
  assert.equal(result.payload.error, 'Rate limit reached.');
  await assert.rejects(generateContent(request(), keys, async () => Response.json({ status: 'incomplete' })), /incomplete/);
  await assert.rejects(generateContent(request('claude-opus-5-5'), keys, async () => Response.json({ stop_reason: 'max_tokens', content: [] })), /output limit/);
});

test('keyword retrieval selects relevant repository context without embeddings', () => {
  const docs = [
    { file: 'src/style.css', text: 'body { margin: 0 }', vec: [] },
    { file: 'server/auth.ts', text: 'function verifyToken() { return token; }', vec: [] },
  ];
  assert.equal(retrieveByKeywords(docs, 'auth verifyToken', 1)[0].file, 'server/auth.ts');
  assert.deepEqual(retrieveByKeywords([], 'auth', 5), []);
});

test('OpenAI and Anthropic token estimates do not call Gemini or any external API', async (t) => {
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  assert.ok(await countModelTokens(request('gpt-6.1-sol')) > 0);
  assert.ok(await countModelTokens(request('claude-sonnet-5-5')) > 0);
  assert.equal(network.mock.callCount(), 0);
});

test('frontend generation uses the shared backend route for both new providers', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/models/generate');
    const body = JSON.parse(String(options.body));
    assert.ok(['gpt-6.1-sol', 'claude-sonnet-5-5'].includes(body.model));
    assert.equal(body.contents[1].role, 'model');
    assert.ok(!String(options.body).includes('secret'));
    return Response.json({ text: 'Provider answer' });
  });
  assert.equal(await generateModelContent(request('gpt-6.1-sol')), 'Provider answer');
  assert.equal(await generateModelContent(request('claude-sonnet-5-5')), 'Provider answer');
});
