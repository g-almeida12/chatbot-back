import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOT_FOUND_RESPONSE } from './rag.constants';
import { RagService } from './rag.service';

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = { generateContent: generateContentMock };
    },
  };
});

vi.mock('@pinecone-database/pinecone', () => {
  return {
    Pinecone: class {
      index() {
        return {
          query: vi.fn().mockResolvedValue({ matches: [] }),
        };
      }
    },
  };
});

describe('RagService', () => {
  let service: RagService;

  beforeEach(async () => {
    const configServiceMock = {
      get: vi.fn((key: string) => {
        if (key === 'PINECONE_API_KEY') return 'test-pinecone-key';
        if (key === 'PINECONE_INDEX_NAME') return 'test-index';
        if (key === 'GEMINI_API_KEY') return 'test-gemini-key';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('handleQuery', () => {
    it('deve retornar a resposta padrão quando não houver conteúdo relevante', async () => {
      vi.spyOn(service, 'searchRelevantDocuments').mockResolvedValue({
        hasRelevantContent: false,
        documents: [],
      });

      const result = await service.handleQuery('Pergunta sem resposta');

      expect(result).toEqual({
        answer: DEFAULT_NOT_FOUND_RESPONSE,
      });
    });

    it('deve retornar os documentos quando encontrar conteúdo relevante', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          content: 'Conteúdo de teste',
          score: 0.9,
        },
      ];

      vi.spyOn(service, 'searchRelevantDocuments').mockResolvedValue({
        hasRelevantContent: true,
        documents: mockDocuments,
      });

      generateContentMock.mockResolvedValue({ text: 'Resposta mockada' });

      const result = await service.handleQuery('Pergunta válida');

      expect(generateContentMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        answer: 'Resposta mockada',
        sources: mockDocuments,
      });
    });
  });
});