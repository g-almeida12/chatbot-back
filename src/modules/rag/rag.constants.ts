export const DEFAULT_NOT_FOUND_RESPONSE = 'não sei';

export const RELEVANCE_SCORE_THRESHOLD = 0.8;

export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-base';
export const EMBEDDING_DIM = 768;

export const DEV_PLACEHOLDER_API_KEY = 'dummy-key';

export const PINECONE_TOP_K = 5;

export const EMBEDDING_QUERY_PREFIX = 'query: ';
export const EMBEDDING_OPTIONS = { pooling: 'mean', normalize: true } as const;

export const GEMINI_MODEL = 'gemini-3.8-flash';
export const CONTEXT_SEPARATOR = '\n---\n';
export const GENERATION_FALLBACK_RESPONSE = 'Não foi possível gerar uma resposta.';
