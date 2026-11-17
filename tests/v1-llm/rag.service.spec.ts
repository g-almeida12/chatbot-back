import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOT_FOUND_RESPONSE,
  EMBEDDING_DIM,
  RELEVANCE_SCORE_THRESHOLD,
} from '../../src/modules/rag/rag.constants';
import { RagService } from '../../src/modules/rag/rag.service';

/* -------------------------------------------------------------------------- */
/* Mocks (sem rede): Pinecone e Gemini                                         */
/* -------------------------------------------------------------------------- */

const mocks = vi.hoisted(() => ({
  pineconeIndex: vi.fn(),
  pineconeQuery: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {
    index = mocks.pineconeIndex;
  },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
  },
}));

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const INDEX_NAME = 'test-index';
const EPS = 0.0001;

type Match = { id: string; score?: number; metadata?: Record<string, unknown> };

const makeMatch = (id: string, score: number | undefined, metadata?: Record<string, unknown>): Match => ({
  id,
  score,
  metadata: metadata ?? { text: `conteúdo ${id}` },
});

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    PINECONE_API_KEY: 'pc-key',
    GEMINI_API_KEY: 'gm-key',
    PINECONE_INDEX_NAME: INDEX_NAME,
    ...overrides,
  };
  return { get: vi.fn((key: string) => values[key]) };
}

/**
 * O embedding é carregado via `new Function('m', 'return import(m)')`, que o vi.mock não intercepta.
 * Por isso injetamos um extrator falso no campo privado; getExtractor() o devolve sem importar nada.
 */
function makeService(config = makeConfig(), embeddingSize = EMBEDDING_DIM) {
  const service = new RagService(config as any);
  const extractor = vi.fn().mockResolvedValue({ data: new Float32Array(embeddingSize).fill(0.01) });
  (service as any).extractor = extractor;
  return { service, extractor, config };
}

const mockPinecone = (matches: Match[] | undefined) =>
  mocks.pineconeQuery.mockResolvedValue({ matches });

/* -------------------------------------------------------------------------- */

describe('RagService', () => {
  beforeEach(() => {
    mocks.pineconeIndex.mockReset().mockReturnValue({ query: mocks.pineconeQuery });
    mocks.pineconeQuery.mockReset();
    mocks.generateContent.mockReset().mockResolvedValue({ text: 'resposta do gemini' });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  /* ======================================================================== */
  /* US-02: Filtrar documentos por relevância                                  */
  /* ======================================================================== */
  describe('US-02 - Filtrar documentos por relevância', () => {
    describe('CA1 - score >= limiar é relevante e entra em sources', () => {
      it.each([
        ['exatamente o limiar (limite)', RELEVANCE_SCORE_THRESHOLD],
        ['limiar + epsilon (logo acima do limite)', RELEVANCE_SCORE_THRESHOLD + EPS],
        ['score máximo 1.0', 1],
      ])('mantém match com score %s', async (_nome, score) => {
        // Técnica: análise de valores-limite (fronteira superior do limiar, inclusive) + partição (classe relevante)
        // Critério: US-02 CA1
        mockPinecone([makeMatch('doc-1', score)]);
        const { service } = makeService();

        const result = await service.searchRelevantDocuments('pergunta');

        expect(result.hasRelevantContent).toBe(true);
        expect(result.documents).toHaveLength(1);
        expect(result.documents[0]).toMatchObject({ id: 'doc-1', score });
      });

      it('inclui o match relevante em sources da resposta final', async () => {
        // Técnica: partição de equivalência (classe relevante) - fluxo completo
        // Critério: US-02 CA1
        mockPinecone([makeMatch('doc-1', RELEVANCE_SCORE_THRESHOLD)]);
        const { service } = makeService();

        const response = (await service.handleQuery('pergunta')) as any;

        expect(response.sources.map((s: any) => s.id)).toEqual(['doc-1']);
      });
    });

    describe('CA2 - score < limiar ou sem score é descartado', () => {
      it.each([
        ['limiar - epsilon (logo abaixo do limite)', RELEVANCE_SCORE_THRESHOLD - EPS],
        ['score 0', 0],
        ['score 0.5', 0.5],
        ['score negativo', -0.1],
        ['score undefined (ausente)', undefined],
      ])('descarta match com %s', async (_nome, score) => {
        // Técnica: análise de valores-limite (fronteira inferior do limiar) + partição (classe irrelevante)
        // Critério: US-02 CA2
        mockPinecone([makeMatch('doc-x', score)]);
        const { service } = makeService();

        const result = await service.searchRelevantDocuments('pergunta');

        expect(result.hasRelevantContent).toBe(false);
        expect(result.documents).toEqual([]);
      });

      it('em lista mista mantém apenas os relevantes, preservando a ordem', async () => {
        // Técnica: partição de equivalência (classes mistas) + valores-limite (limiar, limiar - eps, sem score)
        // Critério: US-02 CA1 e CA2
        mockPinecone([
          makeMatch('alto', 0.95),
          makeMatch('no-limiar', RELEVANCE_SCORE_THRESHOLD),
          makeMatch('abaixo', RELEVANCE_SCORE_THRESHOLD - EPS),
          makeMatch('sem-score', undefined),
          makeMatch('zero', 0),
        ]);
        const { service } = makeService();

        const result = await service.searchRelevantDocuments('pergunta');

        expect(result.documents.map((d) => d.id)).toEqual(['alto', 'no-limiar']);
      });
    });

    describe('CA3 - nenhum match relevante: resposta padrão, sem sources, sem chamar o Gemini', () => {
      it.each([
        ['matches vazio', [] as Match[]],
        ['matches undefined', undefined],
        ['todos abaixo do limiar', [makeMatch('a', 0.1), makeMatch('b', RELEVANCE_SCORE_THRESHOLD - EPS)]],
        ['todos sem score', [makeMatch('a', undefined), makeMatch('b', undefined)]],
      ])('responde somente com a resposta padrão quando: %s', async (_nome, matches) => {
        // Técnica: partição de equivalência (classe "nenhum relevante") + valor-limite (lista vazia)
        // Critério: US-02 CA3
        mockPinecone(matches);
        const { service } = makeService();

        const response = await service.handleQuery('pergunta sem resposta');

        expect(response).toEqual({ answer: DEFAULT_NOT_FOUND_RESPONSE });
        expect(response).not.toHaveProperty('sources');
        expect(mocks.generateContent).not.toHaveBeenCalled();
      });
    });

    it('consulta o Pinecone no índice configurado, com topK 5 e metadata', async () => {
      // Técnica: partição de equivalência (configuração válida) - verificação de interação com o mock
      // Critério: US-02 CA1 (pré-condição da busca)
      mockPinecone([makeMatch('doc-1', 0.9)]);
      const { service, config } = makeService();

      await service.searchRelevantDocuments('pergunta');

      expect(config.get).toHaveBeenCalledWith('PINECONE_INDEX_NAME');
      expect(mocks.pineconeIndex).toHaveBeenCalledWith(INDEX_NAME);
      expect(mocks.pineconeQuery).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 5, includeMetadata: true }),
      );
      const { vector } = mocks.pineconeQuery.mock.calls[0][0];
      expect(vector).toHaveLength(EMBEDDING_DIM);
    });

    it('gera o embedding da pergunta com o prefixo "query: " (sem rede)', async () => {
      // Técnica: partição de equivalência (classe válida) - verificação do mock de embedding
      // Critério: US-02 CA1 (pré-condição da busca)
      mockPinecone([]);
      const { service, extractor } = makeService();

      await service.searchRelevantDocuments('minha pergunta');

      expect(extractor).toHaveBeenCalledWith('query: minha pergunta', {
        pooling: 'mean',
        normalize: true,
      });
    });

    it.each([
      ['dimensão menor (EMBEDDING_DIM - 1)', EMBEDDING_DIM - 1],
      ['dimensão maior (EMBEDDING_DIM + 1)', EMBEDDING_DIM + 1],
      ['dimensão zero', 0],
    ])('rejeita embedding com %s e não consulta o Pinecone', async (_nome, size) => {
      // Técnica: análise de valores-limite (EMBEDDING_DIM ± 1) + partição (classe inválida)
      // Critério: US-02 CA3 / US-03 CA4 (falha antes da busca é propagada)
      const { service } = makeService(makeConfig(), size);

      await expect(service.searchRelevantDocuments('pergunta')).rejects.toThrow(
        /dimensão inesperada/i,
      );
      expect(mocks.pineconeQuery).not.toHaveBeenCalled();
    });
  });

  /* ======================================================================== */
  /* US-03: Responder com base nas fontes                                      */
  /* ======================================================================== */
  describe('US-03 - Responder com base nas fontes', () => {
    describe('CA1 - resposta traz texto do Gemini e sources com id, content e score', () => {
      it('devolve answer do Gemini e sources completas', async () => {
        // Técnica: partição de equivalência (classe: documentos relevantes) - verificação de saída
        // Critério: US-03 CA1
        mockPinecone([
          makeMatch('doc-1', 0.91, { text: 'conteúdo um' }),
          makeMatch('doc-2', 0.85, { text: 'conteúdo dois' }),
        ]);
        mocks.generateContent.mockResolvedValue({ text: 'Resposta final' });
        const { service } = makeService();

        const response = await service.handleQuery('pergunta');

        expect(response).toEqual({
          answer: 'Resposta final',
          sources: [
            expect.objectContaining({ id: 'doc-1', content: 'conteúdo um', score: 0.91 }),
            expect.objectContaining({ id: 'doc-2', content: 'conteúdo dois', score: 0.85 }),
          ],
        });
        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
      });

      it('inclui o title na fonte quando existe em metadata', async () => {
        // Técnica: partição de equivalência (metadata com title)
        // Critério: US-03 CA1
        mockPinecone([makeMatch('doc-1', 0.9, { text: 'c', title: 'Manual' })]);
        const { service } = makeService();

        const response = (await service.handleQuery('pergunta')) as any;

        expect(response.sources[0].title).toBe('Manual');
      });

      it('funciona com exatamente 1 documento relevante (limite inferior de sources)', async () => {
        // Técnica: análise de valores-limite (1 documento)
        // Critério: US-03 CA1
        mockPinecone([makeMatch('unico', 0.9)]);
        const { service } = makeService();

        const response = (await service.handleQuery('pergunta')) as any;

        expect(response.sources).toHaveLength(1);
        expect(response.answer).toBe('resposta do gemini');
      });

      it('funciona com 5 documentos relevantes (limite superior: topK)', async () => {
        // Técnica: análise de valores-limite (topK = 5)
        // Critério: US-03 CA1
        mockPinecone([1, 2, 3, 4, 5].map((n) => makeMatch(`d${n}`, 0.9)));
        const { service } = makeService();

        const response = (await service.handleQuery('pergunta')) as any;

        expect(response.sources).toHaveLength(5);
      });
    });

    describe('CA2 - contexto concatenado com "\\n---\\n" junto com a pergunta', () => {
      const getPrompt = () => mocks.generateContent.mock.calls[0][0].contents as string;

      it('separa os conteúdos de 2+ documentos por "\\n---\\n"', async () => {
        // Técnica: partição de equivalência (classe: múltiplos documentos)
        // Critério: US-03 CA2
        mockPinecone([
          makeMatch('1', 0.9, { text: 'AAA' }),
          makeMatch('2', 0.9, { text: 'BBB' }),
          makeMatch('3', 0.9, { text: 'CCC' }),
        ]);
        const { service } = makeService();

        await service.handleQuery('Qual a resposta?');

        expect(getPrompt()).toContain('AAA\n---\nBBB\n---\nCCC');
      });

      it('com 1 documento não adiciona separador (limite)', async () => {
        // Técnica: análise de valores-limite (1 documento => 0 separadores)
        // Critério: US-03 CA2
        mockPinecone([makeMatch('1', 0.9, { text: 'AAA' })]);
        const { service } = makeService();

        await service.handleQuery('Qual a resposta?');

        expect(getPrompt()).toContain('Contexto:\nAAA\n\nPergunta:');
        expect(getPrompt()).not.toContain('---');
      });

      it('inclui a pergunta do usuário no prompt enviado ao Gemini', async () => {
        // Técnica: partição de equivalência (classe válida) - verificação de entrada do mock
        // Critério: US-03 CA2
        mockPinecone([makeMatch('1', 0.9, { text: 'AAA' })]);
        const { service } = makeService();

        await service.handleQuery('Qual o prazo de entrega?');

        expect(getPrompt()).toContain('Pergunta: Qual o prazo de entrega?');
      });

      it('não inclui no contexto o conteúdo de documentos descartados pelo limiar', async () => {
        // Técnica: partição de equivalência (relevante x irrelevante) integrada ao contexto
        // Critério: US-03 CA2 (+ US-02 CA2)
        mockPinecone([
          makeMatch('1', 0.9, { text: 'RELEVANTE' }),
          makeMatch('2', RELEVANCE_SCORE_THRESHOLD - EPS, { text: 'IRRELEVANTE' }),
        ]);
        const { service } = makeService();

        await service.handleQuery('pergunta');

        expect(getPrompt()).toContain('RELEVANTE');
        expect(getPrompt()).not.toContain('IRRELEVANTE');
      });
    });

    describe('CA3 - Gemini devolve texto vazio: lança erro em vez de fallback', () => {
      it.each([
        ['string vazia', ''],
        ['undefined', undefined],
        ['null', null],
      ])('lança erro quando completion.text é %s', async (_nome, text) => {
        // Técnica: análise de valores-limite (texto vazio / ausente) + partição (classe resposta inválida)
        // Critério: US-03 CA3
        // OBS: com o código atual este teste FALHA, pois o service devolve o fallback
        // 'Não foi possível gerar uma resposta.' em vez de lançar erro.
        mockPinecone([makeMatch('1', 0.9)]);
        mocks.generateContent.mockResolvedValue({ text });
        const { service } = makeService();

        await expect(service.handleQuery('pergunta')).rejects.toThrow();
      });

      it('não devolve sucesso com a mensagem de fallback', async () => {
        // Técnica: partição de equivalência (classe resposta inválida) - verificação negativa
        // Critério: US-03 CA3
        mockPinecone([makeMatch('1', 0.9)]);
        mocks.generateContent.mockResolvedValue({ text: '' });
        const { service } = makeService();

        const outcome = await service.handleQuery('pergunta').catch((e) => e);

        expect(outcome).toBeInstanceOf(Error);
      });

      it('aceita resposta com 1 caractere (limite mínimo válido do texto)', async () => {
        // Técnica: análise de valores-limite (length = 1 logo acima do vazio)
        // Critério: US-03 CA3
        mockPinecone([makeMatch('1', 0.9)]);
        mocks.generateContent.mockResolvedValue({ text: 'x' });
        const { service } = makeService();

        const response = await service.handleQuery('pergunta');

        expect(response).toMatchObject({ answer: 'x' });
      });
    });

    describe('CA4 - falha do Pinecone é propagada e o Gemini não é chamado', () => {
      it('propaga o mesmo erro lançado pelo Pinecone', async () => {
        // Técnica: partição de equivalência (classe: falha de dependência externa)
        // Critério: US-03 CA4
        const error = new Error('Pinecone fora do ar');
        mocks.pineconeQuery.mockRejectedValue(error);
        const { service } = makeService();

        await expect(service.handleQuery('pergunta')).rejects.toBe(error);
      });

      it('não chama o Gemini quando o Pinecone falha', async () => {
        // Técnica: partição de equivalência (classe: falha de dependência externa)
        // Critério: US-03 CA4
        mocks.pineconeQuery.mockRejectedValue(new Error('timeout'));
        const { service } = makeService();

        await service.handleQuery('pergunta').catch(() => undefined);

        expect(mocks.generateContent).not.toHaveBeenCalled();
      });

      it('registra o erro em log antes de propagá-lo', async () => {
        // Técnica: partição de equivalência (classe: falha de dependência externa)
        // Critério: US-03 CA4
        mocks.pineconeQuery.mockRejectedValue(new Error('falha'));
        const { service } = makeService();

        await service.handleQuery('pergunta').catch(() => undefined);

        expect(Logger.prototype.error).toHaveBeenCalled();
      });

      it('propaga falha ao obter o índice do Pinecone e não chama o Gemini', async () => {
        // Técnica: partição de equivalência (variante da falha de dependência: índice inválido)
        // Critério: US-03 CA4
        const error = new Error('índice inexistente');
        mocks.pineconeIndex.mockImplementation(() => {
          throw error;
        });
        const { service } = makeService();

        await expect(service.handleQuery('pergunta')).rejects.toBe(error);
        expect(mocks.generateContent).not.toHaveBeenCalled();
      });
    });

    describe('CA5 - origem do content: metadata.text > metadata.content > ""', () => {
      const contentOf = async (metadata: Record<string, unknown> | undefined) => {
        // score sempre acima do limiar para isolar a regra de extração do content
        mocks.pineconeQuery.mockResolvedValue({
          matches: [{ id: 'doc', score: 0.9, metadata }],
        });
        const { service } = makeService();
        const result = await service.searchRelevantDocuments('pergunta');
        return result.documents[0].content;
      };

      it('usa metadata.text quando existe', async () => {
        // Técnica: partição de equivalência (classe: text presente)
        // Critério: US-03 CA5
        expect(await contentOf({ text: 'do text' })).toBe('do text');
      });

      it('prefere metadata.text quando text e content existem', async () => {
        // Técnica: partição de equivalência (classe: ambos presentes) - prioridade
        // Critério: US-03 CA5
        expect(await contentOf({ text: 'do text', content: 'do content' })).toBe('do text');
      });

      it('usa metadata.content quando text não existe', async () => {
        // Técnica: partição de equivalência (classe: só content)
        // Critério: US-03 CA5
        expect(await contentOf({ content: 'do content' })).toBe('do content');
      });

      it('usa metadata.content quando text é string vazia (limite: vazio é falsy)', async () => {
        // Técnica: análise de valores-limite (text = "" => cai para content)
        // Critério: US-03 CA5
        expect(await contentOf({ text: '', content: 'do content' })).toBe('do content');
      });

      it.each([
        ['metadata sem text nem content', { outro: 'campo' }],
        ['metadata vazio', {}],
        ['metadata undefined', undefined],
        ['text e content vazios', { text: '', content: '' }],
      ])('devolve string vazia com %s', async (_nome, metadata) => {
        // Técnica: partição de equivalência (classe: nenhum campo de conteúdo) + valores-limite (vazio/ausente)
        // Critério: US-03 CA5
        expect(await contentOf(metadata)).toBe('');
      });
    });
  });
});
