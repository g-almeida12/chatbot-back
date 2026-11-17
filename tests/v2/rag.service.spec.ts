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

      it('com 1 documento (limite) o prompt contém o conteúdo e a pergunta', async () => {
        // Técnica: análise de valores-limite (1 documento, menor conjunto a concatenar)
        // Critério: US-03 CA2: conteúdos separados por "\n---\n" e pergunta presente no prompt
        // Lacuna: G4(b)
        // Só verifica o que o critério exige, sem o rótulo "Contexto:"/"Pergunta:" nem o layout do template.
        mockPinecone([makeMatch('1', 0.9, { text: 'AAA' })]);
        const { service } = makeService();

        await service.handleQuery('Qual a resposta?');

        expect(getPrompt()).toContain(['AAA'].join('\n---\n'));
        expect(getPrompt()).toContain('Qual a resposta?');
      });

      it('inclui a pergunta do usuário no prompt enviado ao Gemini', async () => {
        // Técnica: partição de equivalência (classe válida) - verificação de entrada do mock
        // Critério: US-03 CA2
        mockPinecone([makeMatch('1', 0.9, { text: 'AAA' })]);
        const { service } = makeService();

        await service.handleQuery('Qual o prazo de entrega?');

        expect(getPrompt()).toContain('Qual o prazo de entrega?');
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
      const settle = (promise: Promise<unknown>) =>
        promise.then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        );

      it.each([
        ['string vazia', ''],
        ['undefined', undefined],
        ['null', null],
      ])('rejeita com Error e sem resposta de sucesso quando completion.text é %s', async (_nome, text) => {
        // Técnica: análise de valores-limite (texto vazio ou ausente) + partição (classe: resposta inválida do Gemini)
        // Critério: US-03 CA3
        // Lacuna: G2
        // ATENÇÃO: FALHA com o código atual. O service resolve com o fallback
        // 'Não foi possível gerar uma resposta.' e com sources, em vez de lançar erro.
        mockPinecone([makeMatch('1', 0.9)]);
        mocks.generateContent.mockResolvedValue({ text });
        const { service } = makeService();

        const outcome = await settle(service.handleQuery('pergunta'));

        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({ ok: false, error: expect.any(Error) });
        expect(outcome).not.toHaveProperty('value.sources');
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

      it.each([
        ['text não existe', { content: 'do content' }],
        ['text é vazio', { text: '', content: 'do content' }],
      ])('usa metadata.content quando %s', async (_nome, metadata) => {
        // Técnica: partição de equivalência (classes "text ausente" e "text vazio") + valor-limite (text = "")
        // Critério: US-03 CA5 (ajustado): se text não existir ou for vazio, usa content
        // Lacuna: G4(a)
        // Observação: este teste já passa com o código atual, que cumpre o critério ajustado.
        expect(await contentOf(metadata)).toBe('do content');
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

  /* ======================================================================== */
  /* US-04: Configuração obrigatória                                           */
  /* ======================================================================== */
  describe('US-04 - Configuração obrigatória', () => {
    const constructionError = (config: ReturnType<typeof makeConfig>): unknown => {
      try {
        new RagService(config as any);
        return undefined;
      } catch (error) {
        return error;
      }
    };

    describe('CA1 - chave de API ausente ou vazia impede a criação do service', () => {
      it.each([
        ['PINECONE_API_KEY', 'ausente', undefined],
        ['PINECONE_API_KEY', 'vazia', ''],
        ['GEMINI_API_KEY', 'ausente', undefined],
        ['GEMINI_API_KEY', 'vazia', ''],
      ])('lança erro ao criar o service com %s %s', (chave, _estado, valor) => {
        // Técnica: partição de equivalência (classes inválidas: ausente e vazia), aplicada a cada chave
        // Critério: US-04 CA1
        // Lacuna: G1 (linhas 21 e 24)
        // ATENÇÃO: FALHA com o código atual. O fallback "|| 'dummy-key'" cria o service sem erro.
        const error = constructionError(makeConfig({ [chave]: valor }));

        expect(error).toBeInstanceOf(Error);
      });

      it('cria o service sem erro com as três configurações presentes', () => {
        // Técnica: partição de equivalência (classe válida: todas as configurações presentes)
        // Critério: US-04 CA1 e CA2
        // Lacuna: G1 (ramo "sem fallback" das linhas 21, 24 e 55)
        expect(constructionError(makeConfig())).toBeUndefined();
      });
    });

    describe('CA2 - nome do índice ausente ou vazio impede a busca', () => {
      it.each([
        ['ausente', undefined],
        ['vazio', ''],
      ])(
        'lança erro e não consulta o Pinecone quando PINECONE_INDEX_NAME está %s',
        async (_estado, valor) => {
          // Técnica: partição de equivalência (classes inválidas: ausente e vazio)
          // Critério: US-04 CA2
          // Lacuna: G1 (linha 55)
          // ATENÇÃO: FALHA com o código atual. O fallback "|| ''" segue adiante e consulta com índice vazio.
          mockPinecone([makeMatch('doc-1', 0.9)]); // match relevante: a falha não pode vir de "sem resultados"
          const { service } = makeService(makeConfig({ PINECONE_INDEX_NAME: valor }));

          const error = await service.searchRelevantDocuments('pergunta').then(
            () => undefined,
            (e) => e,
          );

          expect(error).toBeInstanceOf(Error);
          expect(mocks.pineconeIndex).not.toHaveBeenCalledWith('');
          expect(mocks.pineconeQuery).not.toHaveBeenCalled();
        },
      );

      it('consulta o índice informado quando PINECONE_INDEX_NAME está presente', async () => {
        // Técnica: partição de equivalência (classe válida: índice informado)
        // Critério: US-04 CA2
        // Lacuna: G1 (e G3: a verificação do nome do índice saiu do teste de topK)
        mockPinecone([]);
        const { service } = makeService();

        await service.searchRelevantDocuments('pergunta');

        expect(mocks.pineconeIndex).toHaveBeenCalledWith(INDEX_NAME);
      });
    });
  });

  describe('Detalhes de implementação (fora dos critérios)', () => {
    it('consulta o Pinecone com topK 5, includeMetadata e vetor de EMBEDDING_DIM posições', async () => {
      // Técnica: partição de equivalência (classe válida), verificação de interação com o mock
      // Critério: nenhum (detalhe de implementação; includeMetadata sustenta indiretamente US-03 CA5)
      // Lacuna: G3
      mockPinecone([makeMatch('doc-1', 0.9)]);
      const { service } = makeService();

      await service.searchRelevantDocuments('pergunta');

      expect(mocks.pineconeQuery).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 5, includeMetadata: true }),
      );
      expect(mocks.pineconeQuery.mock.calls[0][0].vector).toHaveLength(EMBEDDING_DIM);
    });

    it('gera o embedding com prefixo "query: " e pooling/normalize', async () => {
      // Técnica: partição de equivalência (classe válida), verificação do mock de embedding
      // Critério: nenhum (detalhe de implementação, exigência do modelo e5)
      // Lacuna: G3
      mockPinecone([]);
      const { service, extractor } = makeService();

      await service.searchRelevantDocuments('minha pergunta');

      expect(extractor).toHaveBeenCalledWith('query: minha pergunta', {
        pooling: 'mean',
        normalize: true,
      });
    });

    it.each([
      ['EMBEDDING_DIM - 1', EMBEDDING_DIM - 1],
      ['EMBEDDING_DIM + 1', EMBEDDING_DIM + 1],
    ])('rejeita embedding com dimensão %s e não consulta o Pinecone', async (_nome, size) => {
      // Técnica: análise de valores-limite (EMBEDDING_DIM ± 1)
      // Critério: nenhum (guarda defensiva, detalhe de implementação)
      // Lacuna: G3
      const { service } = makeService(makeConfig(), size);

      await expect(service.searchRelevantDocuments('pergunta')).rejects.toThrow(/dimensão inesperada/i);
      expect(mocks.pineconeQuery).not.toHaveBeenCalled();
    });
  });
});
