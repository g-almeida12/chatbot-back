import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryRagDto } from '../../src/modules/rag/dto/query-rag.dto';
import { RagController } from '../../src/modules/rag/rag.controller';
import type { RagService } from '../../src/modules/rag/rag.service';

/**
 * US-01 (CA1): o sistema aceita a pergunta com texto e a encaminha ao service.
 * O service é totalmente mockado: nenhum acesso a Pinecone, Gemini ou rede.
 */

describe('RagController - POST /v1/rag/query', () => {
  let ragService: { handleQuery: ReturnType<typeof vi.fn> };
  let controller: RagController;

  beforeEach(() => {
    ragService = { handleQuery: vi.fn() };
    controller = new RagController(ragService as unknown as RagService);
  });

  it('encaminha a pergunta ao RagService.handleQuery e devolve a resposta (US-01 CA1)', async () => {
    // Técnica: partição de equivalência (classe válida: pergunta com texto)
    // Critério: US-01 CA1
    const expected = { answer: 'resposta', sources: [{ id: '1', content: 'c', score: 0.9 }] };
    ragService.handleQuery.mockResolvedValue(expected);

    const dto = { question: 'Qual o prazo?' } as QueryRagDto;
    const result = await controller.query(dto);

    expect(ragService.handleQuery).toHaveBeenCalledTimes(1);
    expect(ragService.handleQuery).toHaveBeenCalledWith('Qual o prazo?');
    expect(result).toBe(expected);
  });

  it('aceita pergunta de 1 caractere e a repassa sem alterações (US-01 CA1)', async () => {
    // Técnica: análise de valores-limite (length = 1, limite mínimo válido)
    // Critério: US-01 CA1
    ragService.handleQuery.mockResolvedValue({ answer: 'não sei' });

    await controller.query({ question: 'a' } as QueryRagDto);

    expect(ragService.handleQuery).toHaveBeenCalledWith('a');
  });

  it('devolve { answer } sem sources quando o service não encontra conteúdo (US-02 CA3)', async () => {
    // Técnica: partição de equivalência (classe: resposta padrão "não encontrado")
    // Critério: US-02 CA3
    ragService.handleQuery.mockResolvedValue({ answer: 'não sei' });

    const result = await controller.query({ question: 'algo sem resposta' } as QueryRagDto);

    expect(result).toEqual({ answer: 'não sei' });
    expect(result).not.toHaveProperty('sources');
  });

  it('propaga o erro do service sem engoli-lo (US-03 CA4)', async () => {
    // Técnica: partição de equivalência (classe: falha de dependência externa)
    // Critério: US-03 CA4
    const error = new Error('Pinecone indisponível');
    ragService.handleQuery.mockRejectedValue(error);

    await expect(controller.query({ question: 'olá' } as QueryRagDto)).rejects.toBe(error);
  });
});
