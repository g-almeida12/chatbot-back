import { registerAs } from '@nestjs/config';

export default registerAs('openrouter', () => ({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  model: process.env.OPENROUTER_MODEL ?? 'openrouter/free',
  url: 'https://openrouter.ai/api/v1/chat/completions',
  timeoutMs: Number.parseInt(process.env.OPENROUTER_TIMEOUT_MS ?? '30000', 10),
}));
