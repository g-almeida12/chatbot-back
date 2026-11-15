import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pinecone } from '@pinecone-database/pinecone';
import {
  CONTEXT_SEPARATOR,
  DEFAULT_NOT_FOUND_RESPONSE,
  DEV_PLACEHOLDER_API_KEY,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  EMBEDDING_OPTIONS,
  EMBEDDING_QUERY_PREFIX,
  GEMINI_MODEL,
  GENERATION_FALLBACK_RESPONSE,
  PINECONE_TOP_K,
  RELEVANCE_SCORE_THRESHOLD,
} from './rag.constants';
import type { RagResponse, SourceDocument } from './rag.type';

type VectorMatch = {
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private pineconeClient: Pinecone;
  private ai: GoogleGenAI;
  private extractor: any;

  constructor(private readonly configService: ConfigService) {
    const pineconeApiKey = this.configService.get<string>('PINECONE_API_KEY') || DEV_PLACEHOLDER_API_KEY;
    this.pineconeClient = new Pinecone({ apiKey: pineconeApiKey });

    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY') || DEV_PLACEHOLDER_API_KEY;
    this.ai = new GoogleGenAI({ apiKey: geminiApiKey });
  }

  private async getExtractor() {
    if (!this.extractor) {
      const { pipeline } = await new Function('m', 'return import(m)')('@xenova/transformers');
      this.extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
    }
    return this.extractor;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(`${EMBEDDING_QUERY_PREFIX}${text}`, EMBEDDING_OPTIONS);

    const values = Array.from(output.data as Float32Array);
    if (values.length !== EMBEDDING_DIM) {
      throw new Error(`Embedding com dimensão inesperada: ${values.length}`);
    }
    return values;
  }

  private filterRelevantMatches(matches: VectorMatch[]): VectorMatch[] {
    return matches.filter((match) => (match.score ?? 0) >= RELEVANCE_SCORE_THRESHOLD);
  }

  private toSourceDocument(match: VectorMatch): SourceDocument {
    return {
      id: match.id,
      content: (match.metadata?.text as string) || (match.metadata?.content as string) || '',
      title: (match.metadata?.title as string) || undefined,
      score: match.score,
    };
  }

  async searchRelevantDocuments(question: string): Promise<{
    hasRelevantContent: boolean;
    documents: SourceDocument[];
  }> {
    try {
      const indexName = this.configService.get<string>('PINECONE_INDEX_NAME') || '';
      const index = this.pineconeClient.index(indexName);

      const queryVector = await this.generateEmbedding(question);

      const queryResponse = await index.query({
        vector: queryVector,
        topK: PINECONE_TOP_K,
        includeMetadata: true,
      });

      const matches = queryResponse.matches || [];

      // LOG TEMPORÁRIO: remover depois de calibrar o limiar
      this.logger.log(
        `Scores: [${matches.map((m) => (m.score ?? 0).toFixed(3)).join(', ')}] | limiar: ${RELEVANCE_SCORE_THRESHOLD} | pergunta: "${question}"`,
      );

      const relevantMatches = this.filterRelevantMatches(matches);

      if (relevantMatches.length === 0) {
        return {
          hasRelevantContent: false,
          documents: [],
        };
      }

      const documents = relevantMatches.map((match) => this.toSourceDocument(match));

      return {
        hasRelevantContent: true,
        documents,
      };
    } catch (error) {
      this.logger.error('Erro ao consultar o Pinecone', error);
      throw error;
    }
  }

  async handleQuery(question: string): Promise<RagResponse | { answer: string }> {
    const searchResult = await this.searchRelevantDocuments(question);

    if (!searchResult.hasRelevantContent) {
      return {
        answer: DEFAULT_NOT_FOUND_RESPONSE,
      };
    }

    const context = searchResult.documents.map((doc) => doc.content).join(CONTEXT_SEPARATOR);
    const prompt = `Responda à pergunta do utilizador com base apenas no contexto fornecido.\n\nContexto:\n${context}\n\nPergunta: ${question}`;

    const completion = await this.ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    return {
      answer: completion.text || GENERATION_FALLBACK_RESPONSE,
      sources: searchResult.documents,
    };
  }
}
