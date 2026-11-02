import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import type { ChatResponse } from './chat.type';
import { ChatRequestDto } from './dto/chat-request.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar uma pergunta ao chatbot' })
  @ApiResponse({ status: 200, description: 'Resposta do chatbot' })
  @ApiResponse({ status: 400, description: 'Pedido inválido' })
  ask(@Body() ChatRequestDto: ChatRequestDto): Promise<ChatResponse> {
    return this.chatService.ask(ChatRequestDto.message);
  }
}
