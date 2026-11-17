import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000).describe('Pergunta do usuário'),
});

export class ChatRequestDto extends createZodDto(ChatRequestSchema) {}
