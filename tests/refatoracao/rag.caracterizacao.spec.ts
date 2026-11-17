import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDING_DIM } from '../../src/modules/rag/rag.constants';
import { RagService } from '../../src/modules/rag/rag.service';

/**
 * Testes de caracterização: capturam o comportamento ATUAL do RagService antes das
 * refatorações da Sprint 3 (Parte 2). Não vêm de critério de aceitação; protegem o item
 * DT-04 (nome do modelo do Gemini), que a suíte v2 não verificava.
 */

const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
  },
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {
    index() {
      return {
        query: vi.fn().mockResolvedValue({
          matches: [{ id: '1', score: 0.9, metadata: { text: 'conteúdo' } }],
        }),
      };
    }
  },
}));

describe('RagService: caracterização antes das refatorações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  it('chama o Gemini com o modelo definido no código (protege DT-04)', async () => {
    // Técnica: teste de caracterização (captura o comportamento atual)
    // Critério: nenhum (detalhe de implementação)
    mocks.generateContent.mockResolvedValue({ text: 'resposta' });
    const values: Record<string, string> = {
      PINECONE_API_KEY: 'pc-key',
      GEMINI_API_KEY: 'gm-key',
      PINECONE_INDEX_NAME: 'idx',
    };
    const config = { get: vi.fn((key: string) => values[key]) };
    const service = new RagService(config as never);
    Reflect.set(service, 'extractor', vi.fn().mockResolvedValue({ data: new Float32Array(EMBEDDING_DIM) }));

    await service.handleQuery('pergunta');

    expect(mocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.8-flash' }),
    );
  });
});
