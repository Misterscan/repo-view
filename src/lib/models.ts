import { readApiError, readApiJson } from './api';
import { estimateTokens } from './gemini';
import { getModelProvider, type ModelAvailability, type ModelRequest } from '../../shared/models';

export async function getModelAvailability(): Promise<ModelAvailability> {
  const response = await fetch('/api/models');
  if (!response.ok) await readApiError(response, 'Failed to load model configuration.');
  return readApiJson<ModelAvailability>(response);
}

export async function generateModelContent(request: ModelRequest): Promise<string> {
  const response = await fetch('/api/models/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) await readApiError(response, 'Failed to generate a response.');
  return (await readApiJson<{ text: string }>(response)).text;
}

export async function countModelTokens(request: ModelRequest): Promise<number> {
  if (getModelProvider(request.model) !== 'gemini') {
    // Token counts shown in the composer are estimates. Do not send draft text
    // to a provider on every keystroke merely to estimate its cost.
    return estimateTokens(JSON.stringify(request));
  }
  const response = await fetch('/api/gemini/countTokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) await readApiError(response, 'Failed to count tokens.');
  return (await readApiJson<{ totalTokens: number }>(response)).totalTokens;
}
