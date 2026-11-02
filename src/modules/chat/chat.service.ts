import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatResponse } from './chat.type';

const UNKNOWN_SIGNAL = 'NAO_SEI';

const SYSTEM_INSTRUCTIONS = `Você é um assistente de atendimento de uma secretaria.
Use o contexto fornecido para responder à pergunta.
Se o contexto contiver a informação, responda de forma curta e direta.
Somente se o contexto não possuir a informação, ou se a pergunta não for ligada às 
responsabilidades da secretaria, responda exatamente com a palavra ${UNKNOWN_SIGNAL} e nada mais.
Nunca invente informações.`;

const UNKNOWN_MESSAGE =
  'Desculpe, não encontrei essa informação. Você pode consultar os links abaixo ou entrar em contato conosco.';

const TEMPORARY_CONTEXT =
  'A secretaria funciona de segunda a sexta, das 8h às 18h. O telefone é (00) 00000-0000';

interface OpenRouterCompletion {
  choices?: { message?: { content?: string } }[];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly configService: ConfigService) {}

  async ask(message: string): Promise<ChatResponse> {
    const answer = await this.callModel(message, TEMPORARY_CONTEXT);

    if (!answer || answer.toUpperCase().includes(UNKNOWN_SIGNAL)) {
      return this.defaultAnswer();
    }

    return { answer, found: true, links: [], contacts: {} };
  }

  private defaultAnswer(): ChatResponse {
    return {
      answer: UNKNOWN_MESSAGE,
      found: false,
      links: [],
      contacts: {},
    };
  }

  private async callModel(message: string, context: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('openrouter.apiKey');
    const model = this.configService.get<string>('openrouter.model');
    const url = this.configService.get<string>('openrouter.url');
    const timeoutMs = this.configService.get<number>('openrouter.timeoutMs', 30000);

    if (!apiKey || !model || !url) {
      this.logger.error('Configuração do OpenrRouter incompleta (veja o .env).');
      return null;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTIONS },
            { role: 'user', content: `Contexto:\n${context}\n\nPergunta: ${message}` },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter respondeu ${response.status}`);
      }

      const data = (await response.json()) as OpenRouterCompletion;
      const text = data.choices?.[0]?.message?.content?.trim();

      if (!text) {
        throw new Error('Resposta do modelo veio vazia ou em formato inesperado.');
      }

      return text;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.error(`Erro ao chamar o OpenRouter: ${reason}`);
      return null;
    }
  }
}
