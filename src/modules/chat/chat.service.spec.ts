import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RagService } from '@/modules/rag/rag.service';
import { CONTACTS, FALLBACK_LINKS } from './chat.constants';
import { ChatService } from './chat.service';

const configValues: Record<string, unknown> = {
  'openrouter.apiKey': 'test-key',
  'openrouter.model': 'test-model',
  'openrouter.url': 'https://openrouter.test/chat',
  'openrouter.timeoutMs': 1000,
};

const modelReply = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

describe('ChatService', () => {
  let service: ChatService;
  const searchRelevantDocuments = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(async () => {
    searchRelevantDocuments.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const configServiceMock = {
      get: vi.fn((key: string, fallback?: unknown) => configValues[key] ?? fallback),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: RagService, useValue: { searchRelevantDocuments } },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('ask', () => {
    it('deve retornar a resposta do modelo quando houver documentos relevantes', async () => {
      searchRelevantDocuments.mockResolvedValue({
        hasRelevantContent: true,
        documents: [{ content: 'O prazo é de 10 dias.', title: 'Regulamento' }],
      });
      fetchMock.mockResolvedValue(modelReply('O prazo é de 10 dias.'));

      const result = await service.ask('Qual o prazo?');

      expect(result.found).toBe(true);
      expect(result.answer).toBe('O prazo é de 10 dias.');
      expect(result.links).toEqual([]);
      expect(result.contacts).toEqual({});
    });

    it('deve enviar o conteúdo dos documentos como contexto para o modelo', async () => {
      searchRelevantDocuments.mockResolvedValue({
        hasRelevantContent: true,
        documents: [{ content: 'O prazo é de 10 dias.', title: 'Regulamento' }],
      });
      fetchMock.mockResolvedValue(modelReply('O prazo é de 10 dias.'));

      await service.ask('Qual o prazo?');

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.messages[1].content).toContain('O prazo é de 10 dias.');
      expect(body.messages[1].content).toContain('Qual o prazo?');
    });

    it('deve retornar a resposta padrão com links e contatos quando não houver conteúdo relevante', async () => {
      searchRelevantDocuments.mockResolvedValue({
        hasRelevantContent: false,
        documents: [],
      });

      const result = await service.ask('Pergunta fora do assunto');

      expect(result.found).toBe(false);
      expect(result.links).toEqual(FALLBACK_LINKS);
      expect(result.contacts).toEqual(CONTACTS);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('deve ignorar documentos com conteúdo vazio', async () => {
      searchRelevantDocuments.mockResolvedValue({
        hasRelevantContent: true,
        documents: [{ content: '   ' }],
      });

      const result = await service.ask('Qualquer pergunta');

      expect(result.found).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('deve retornar a resposta padrão quando o modelo responder NAO_SEI', async () => {
      searchRelevantDocuments.mockResolvedValue({
        hasRelevantContent: true,
        documents: [{ content: 'Algum trecho.' }],
      });
      fetchMock.mockResolvedValue(modelReply('NAO_SEI'));

      const result = await service.ask('Pergunta');

      expect(result.found).toBe(false);
      expect(result.links).toEqual(FALLBACK_LINKS);
      expect(result.contacts).toEqual(CONTACTS);
    });

    it('deve retornar a resposta padrão quando o OpenRouter responder com erro', async () => {
      searchRelevantDocuments.mockResolvedValue({
        hasRelevantContent: true,
        documents: [{ content: 'Algum trecho.' }],
      });
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      const result = await service.ask('Pergunta');

      expect(result.found).toBe(false);
    });

    it('deve retornar a resposta padrão quando a chamada ao OpenRouter falhar', async () => {
      searchRelevantDocuments.mockResolvedValue({
        hasRelevantContent: true,
        documents: [{ content: 'Algum trecho.' }],
      });
      fetchMock.mockRejectedValue(new Error('network down'));

      const result = await service.ask('Pergunta');

      expect(result.found).toBe(false);
    });

    it('deve retornar a resposta padrão quando a busca falhar', async () => {
      searchRelevantDocuments.mockRejectedValue(new Error('pinecone down'));

      const result = await service.ask('Pergunta');

      expect(result.found).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
