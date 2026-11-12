import type { Provider } from '@/lib/types';

export const providerLabels: Record<Provider, string> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  huggingface: 'Hugging Face',
  deepseek: 'DeepSeek',
  zai: 'Z.ai / GLM',
};

export const providerOrder = Object.keys(providerLabels) as Provider[];

export const keyLinks = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://platform.claude.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  huggingface: 'https://huggingface.co/settings/tokens',
  deepseek: 'https://platform.deepseek.com/api_keys',
  zai: 'https://z.ai/manage-apikey/apikey-list',
};

export const tierLabels: Record<string, string> = {
  flagship: 'Higher capability',
  balanced: 'Balanced',
  fast: 'Faster',
  previous: 'Earlier model',
  local: 'Local',
};
