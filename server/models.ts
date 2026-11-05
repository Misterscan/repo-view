import { type Express } from 'express';
import { GoogleGenAI } from '@google/genai';
import { json } from './auth.ts';
import { getModelProvider, MODELS, type ModelPart, type ModelProvider, type ModelRequest } from '../shared/models.ts';

type ProviderKeys = Record<ModelProvider, string>;
type Fetch = typeof globalThis.fetch;

class ModelError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function validateRequest(body: unknown): ModelRequest {
  const request = body as ModelRequest;
  if (!request || typeof request.model !== 'string' || !Array.isArray(request.contents) || !request.contents.length) {
    throw new ModelError('model and a non-empty contents array are required.');
  }
  try { getModelProvider(request.model); } catch { throw new ModelError(`Unsupported model: ${request.model}`); }
  for (const turn of request.contents) {
    if (!turn || !['user', 'model'].includes(turn.role) || !Array.isArray(turn.parts) || !turn.parts.length) {
      throw new ModelError('Each message must have a user/model role and non-empty parts.');
    }
    for (const part of turn.parts) {
      if (!part || (typeof part.text !== 'string' && !part.inlineData && !part.fileData)) {
        throw new ModelError('Each part must contain text or file data.');
      }
      if (part.inlineData && (typeof part.inlineData.data !== 'string' || typeof part.inlineData.mimeType !== 'string')) {
        throw new ModelError('Attachments require a MIME type and base64 data.');
      }
    }
  }
  return request;
}

function instructions(request: ModelRequest) {
  return request.config?.systemInstruction?.parts?.map(part => part.text).join('\n') || '';
}

function effort(request: ModelRequest) {
  const level = request.config?.thinkingConfig?.thinkingLevel?.toLowerCase();
  return level === 'high' ? 'high' : level === 'medium' ? 'medium' : 'low';
}

function attachment(part: ModelPart) {
  if (part.fileData) throw new ModelError('Provider-specific file URLs cannot be shared. Reattach the local file.');
  const data = part.inlineData!;
  if (data.mimeType === 'image/svg+xml' || /^(text\/|application\/(json|xml|javascript))/.test(data.mimeType)) {
    return { text: Buffer.from(data.data, 'base64').toString('utf8') };
  }
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'].includes(data.mimeType)) {
    throw new ModelError(`Unsupported attachment type: ${data.mimeType}. Attach text, an image, or a PDF.`);
  }
  return data;
}

export function buildOpenAIRequest(request: ModelRequest) {
  return {
    model: request.model,
    store: false,
    instructions: instructions(request),
    reasoning: { effort: effort(request) },
    tools: request.config?.tools?.length ? [{ type: 'web_search' }] : [],
    input: request.contents.map(turn => ({
      role: turn.role === 'model' ? 'assistant' : 'user',
      content: turn.parts.map(part => {
        const value = typeof part.text === 'string' ? { text: part.text } : attachment(part);
        if ('text' in value) return turn.role === 'model'
          ? { type: 'output_text', text: value.text, annotations: [] }
          : { type: 'input_text', text: value.text };
        if (turn.role === 'model') throw new ModelError('Assistant history attachments must be text.');
        if (value.mimeType === 'application/pdf') {
          return { type: 'input_file', filename: 'attachment.pdf', file_data: `data:application/pdf;base64,${value.data}` };
        }
        return { type: 'input_image', image_url: `data:${value.mimeType};base64,${value.data}`, detail: 'auto' };
      }),
    })),
  };
}

export function buildAnthropicRequest(request: ModelRequest) {
  return {
    model: request.model,
    max_tokens: 16384,
    system: instructions(request),
    thinking: { type: 'adaptive' },
    output_config: { effort: effort(request) },
    tools: request.config?.tools?.length ? [{ type: 'web_search_20260318', name: 'web_search', max_uses: 5 }] : [],
    messages: request.contents.map(turn => ({
      role: turn.role === 'model' ? 'assistant' : 'user',
      content: turn.parts.map(part => {
        const value = typeof part.text === 'string' ? { text: part.text } : attachment(part);
        if ('text' in value) return { type: 'text', text: value.text };
        return {
          type: value.mimeType === 'application/pdf' ? 'document' : 'image',
          source: { type: 'base64', media_type: value.mimeType, data: value.data },
        };
      }),
    })),
  };
}

async function providerRequest(fetcher: Fetch, url: string, key: string, body: unknown, anthropic = false) {
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anthropic ? { 'x-api-key': key, 'anthropic-version': '2026-10-21' } : { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const result = await response.json() as any;
  if (!response.ok) throw new ModelError(result.error?.message || `Model request failed (${response.status}).`, response.status);
  return result;
}

function textWithSources(blocks: any[]) {
  const texts: string[] = [];
  const sources = new Map<string, string>();
  for (const block of blocks) {
    if (block.type === 'refusal' && block.refusal) texts.push(block.refusal);
    if (block.type !== 'text' && block.type !== 'output_text') continue;
    if (block.text) texts.push(block.text);
    for (const citation of block.citations || block.annotations || []) {
      if (typeof citation.url === 'string' && /^https?:\/\//.test(citation.url)) sources.set(citation.url, citation.title || citation.url);
    }
  }
  const references = [...sources].map(([url, title]) => `- [${String(title).replace(/[[\]]/g, '')}](<${url.replace(/[<>\r\n]/g, '')}>)`);
  return texts.join('\n\n') + (references.length ? `\n\nSources:\n${references.join('\n')}` : '');
}

export async function generateContent(request: ModelRequest, keys: ProviderKeys, fetcher: Fetch = fetch) {
  const provider = getModelProvider(request.model);
  if (!keys[provider]) throw new ModelError(`${provider.toUpperCase()}_API_KEY is not configured.`, 503);
  if (provider === 'gemini') {
    // The existing Gemini route retains its SDK-native request contract.
    const config = { ...request.config };
    if (request.model === 'gemini-4-argon' && config.thinkingConfig?.thinkingLevel.toLowerCase() === 'minimal') {
      config.thinkingConfig = { thinkingLevel: 'LOW' };
    }
    const result = await new GoogleGenAI({ apiKey: keys.gemini }).models.generateContent({ ...request, config } as any);
    return result.text || '';
  }
  if (provider === 'openai') {
    const result = await providerRequest(fetcher, 'https://api.openai.com/v1/responses', keys.openai, buildOpenAIRequest(request));
    if (result.status === 'incomplete' || result.error) throw new ModelError(result.error?.message || 'OpenAI response was incomplete. Try a smaller request.', 502);
    return textWithSources((result.output || []).flatMap((item: any) => item.type === 'message' ? item.content || [] : []));
  }
  const body = buildAnthropicRequest(request);
  const blocks: any[] = [];
  // Server tools can pause a turn. Resume with the unchanged tool blocks.
  for (let turn = 0; turn < 5; turn++) {
    const result = await providerRequest(fetcher, 'https://api.anthropic.com/v1/messages', keys.anthropic, body, true);
    blocks.push(...(result.content || []));
    if (result.stop_reason === 'max_tokens') throw new ModelError('Claude reached its output limit. Try a smaller request.', 502);
    if (result.stop_reason !== 'pause_turn') return textWithSources(blocks);
    body.messages.push({ role: 'assistant', content: result.content });
  }
  throw new ModelError('Claude search did not finish. Try a more specific question.', 502);
}

export function registerModelRoutes(app: Express, keys: ProviderKeys, fetcher: Fetch = fetch) {
  app.get('/api/models', (_req, res) => json(res, 200, {
    models: MODELS,
    providers: Object.fromEntries(Object.entries(keys).map(([provider, key]) => [provider, { configured: Boolean(key) }])),
  }));
  app.post('/api/models/generate', async (req, res) => {
    try {
      const text = await generateContent(validateRequest(req.body), keys, fetcher);
      json(res, 200, { text });
    } catch (error: any) {
      json(res, error instanceof ModelError ? error.status : 502, { error: error.message || 'Model request failed.' });
    }
  });
}
