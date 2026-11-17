import { ZodValidationPipe } from 'nestjs-zod';
import { describe, expect, it } from 'vitest';
import { QueryRagDto, QueryRagSchema } from '../../src/modules/rag/dto/query-rag.dto';

/**
 * US-01: Consultar o chatbot
 * Valida o contrato de entrada (schema Zod) e o comportamento do pipe de
 * validação do NestJS, que é o que produz o HTTP 400.
 */

const pipe = new ZodValidationPipe();

/** Executa a validação como o Nest faria no @Body() e devolve o status HTTP do erro (ou undefined se aceitou). */
async function validationStatus(body: unknown): Promise<number | undefined> {
  try {
    await pipe.transform(body, { type: 'body', metatype: QueryRagDto });
    return undefined;
  } catch (error: any) {
    return typeof error?.getStatus === 'function' ? error.getStatus() : -1;
  }
}

describe('US-01 - Consultar o chatbot (QueryRagDto)', () => {
  describe('CA1 - pergunta com texto é aceita', () => {
    it.each([
      ['texto simples', 'Qual o prazo de entrega?'],
      ['texto com acentos e símbolos', 'Como funciona a política de devolução? (ção/ã/é)'],
      ['texto muito longo (5000 caracteres)', 'a'.repeat(5000)],
      ['texto com espaços nas bordas e conteúdo no meio', '  olá mundo  '],
    ])('aceita %s', async (_nome, question) => {
      // Técnica: partição de equivalência (classe válida: string não vazia)
      // Critério: US-01 CA1
      expect(QueryRagSchema.safeParse({ question }).success).toBe(true);
      expect(await validationStatus({ question })).toBeUndefined();
    });

    it('aceita pergunta com exatamente 1 caractere (limite inferior válido)', async () => {
      // Técnica: análise de valores-limite (length = 1, limite mínimo aceito)
      // Critério: US-01 CA1
      expect(QueryRagSchema.safeParse({ question: 'a' }).success).toBe(true);
      expect(await validationStatus({ question: 'a' })).toBeUndefined();
    });

    it('preserva o texto da pergunta após a validação', () => {
      // Técnica: partição de equivalência (classe válida) - verificação de saída
      // Critério: US-01 CA1
      const parsed = QueryRagSchema.parse({ question: 'Qual o horário?' });
      expect(parsed.question).toBe('Qual o horário?');
    });
  });

  describe('CA2 - pergunta vazia, ausente ou de tipo inválido é recusada com 400', () => {
    it('recusa string vazia (limite: length = 0, imediatamente abaixo do mínimo)', async () => {
      // Técnica: análise de valores-limite (length = 0) + partição inválida (vazio)
      // Critério: US-01 CA2
      expect(QueryRagSchema.safeParse({ question: '' }).success).toBe(false);
      expect(await validationStatus({ question: '' })).toBe(400);
    });

    it.each([
      ['corpo sem o campo question ({})', {}],
      ['question undefined', { question: undefined }],
      ['corpo undefined', undefined],
      ['corpo null', null],
      ['campo desconhecido no lugar de question', { pergunta: 'olá' }],
    ])('recusa pergunta ausente: %s', async (_nome, body) => {
      // Técnica: partição de equivalência (classe inválida: ausente)
      // Critério: US-01 CA2
      expect(QueryRagSchema.safeParse(body).success).toBe(false);
      expect(await validationStatus(body)).toBe(400);
    });

    it.each([
      ['null', null],
      ['número', 123],
      ['zero', 0],
      ['booleano true', true],
      ['booleano false', false],
      ['array de strings', ['olá']],
      ['objeto', { texto: 'olá' }],
    ])('recusa question com tipo inválido: %s', async (_nome, question) => {
      // Técnica: partição de equivalência (classe inválida: tipo não string)
      // Critério: US-01 CA2
      expect(QueryRagSchema.safeParse({ question }).success).toBe(false);
      expect(await validationStatus({ question })).toBe(400);
    });
  });

  describe('CA3 - pergunta só com espaços é recusada com 400', () => {
    it.each([
      ['1 espaço (limite: menor string não vazia só com whitespace)', ' '],
      ['vários espaços', '     '],
      ['tabulação', '\t'],
      ['quebras de linha', '\n\n'],
      ['mistura de whitespace', ' \t\n \r\n '],
    ])('recusa %s', async (_nome, question) => {
      // Técnica: partição de equivalência (classe inválida: só whitespace) + valor-limite (length = 1)
      // Critério: US-01 CA3
      // OBS: com o schema atual (z.string().min(1)) este teste FALHA, pois não há trim().
      expect(QueryRagSchema.safeParse({ question }).success).toBe(false);
      expect(await validationStatus({ question })).toBe(400);
    });

    it('aceita pergunta com espaços nas bordas desde que haja conteúdo (fronteira entre CA3 e CA1)', async () => {
      // Técnica: análise de valores-limite (fronteira entre "só espaços" e "tem conteúdo")
      // Critério: US-01 CA1/CA3
      expect(await validationStatus({ question: ' a ' })).toBeUndefined();
    });
  });
});
