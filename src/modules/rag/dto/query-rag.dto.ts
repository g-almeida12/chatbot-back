import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const QueryRagSchema = z.object({
  question: z.string().min(1).describe('Pergunta do usuário para a base de conhecimento'),
});

export class QueryRagDto extends createZodDto(QueryRagSchema) {}
