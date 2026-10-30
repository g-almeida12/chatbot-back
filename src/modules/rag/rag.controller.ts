import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { QueryRagDto } from './dto/query-rag.dto';
import { RagService } from './rag.service';
import type { RagResponse } from './rag.type';

@ApiTags('RAG')
@ApiBearerAuth()
@Controller({ path: 'rag', version: '1' })
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Public()
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Realizar busca semântica na base de conhecimento (RAG)' })
  @ApiResponse({ status: 200, description: 'Consulta realizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados de requisição inválidos' })
  query(@Body() queryRagDto: QueryRagDto): Promise<RagResponse | { answer: string }> {
    return this.ragService.handleQuery(queryRagDto.question);
  }
}
