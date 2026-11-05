export const PROVIDERS = ['gemini', 'openai', 'anthropic'] as const;
export type ModelProvider = typeof PROVIDERS[number];
export const PROVIDER_NAMES: Record<ModelProvider, string> = {
  gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic',
};

export const MODELS: { id: string; label: string; provider: ModelProvider }[] = [
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon', provider: 'gemini' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'gemini' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'gemini' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', provider: 'openai' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai' },
  { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', provider: 'openai' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', provider: 'openai' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'anthropic' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'anthropic' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'anthropic' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'anthropic' },
];

export function getModelProvider(model: string): ModelProvider {
  const entry = MODELS.find(entry => entry.id === model);
  if (!entry) throw new Error(`Unsupported model: ${model}`);
  return entry.provider;
}

export type ModelPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
  _size?: number;
};

export type ModelRequest = {
  model: string;
  contents: { role: 'user' | 'model'; parts: ModelPart[] }[];
  config?: {
    systemInstruction?: { parts: { text: string }[] };
    tools?: { googleSearch: object }[];
    thinkingConfig?: { thinkingLevel: string };
  };
};

export type ModelAvailability = {
  providers: Record<ModelProvider, { configured: boolean }>;
};
