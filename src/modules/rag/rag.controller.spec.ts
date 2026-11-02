import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOT_FOUND_RESPONSE } from './rag.constants';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

describe('RagController', () => {
  let controller: RagController;
  let ragServiceMock: { handleQuery: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ragServiceMock = {
      handleQuery: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RagController],
      providers: [
        {
          provide: RagService,
          useValue: ragServiceMock,
        },
      ],
    }).compile();

    controller = module.get<RagController>(RagController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  describe('query', () => {
    it('deve chamar o handleQuery do RagService com a pergunta correta', async () => {
      const dto = { question: 'Como funciona o processo de busca?' };
      const expectedResult = {
        answer: 'Conteúdo relevante encontrado com sucesso',
        sources: [
          {
            id: 'doc-1',
            content: 'Texto de exemplo',
            score: 0.85,
          },
        ],
      };

      ragServiceMock.handleQuery.mockResolvedValue(expectedResult);

      const result = await controller.query(dto);

      expect(ragServiceMock.handleQuery).toHaveBeenCalledWith(dto.question);
      expect(result).toEqual(expectedResult);
    });

    it('deve retornar a resposta padrão de não encontrado se o serviço indicar sem relevância', async () => {
      const dto = { question: 'Pergunta sem contexto na base' };
      const expectedResult = { answer: DEFAULT_NOT_FOUND_RESPONSE };

      ragServiceMock.handleQuery.mockResolvedValue(expectedResult);

      const result = await controller.query(dto);

      expect(ragServiceMock.handleQuery).toHaveBeenCalledWith(dto.question);
      expect(result).toEqual(expectedResult);
    });
  });
});
