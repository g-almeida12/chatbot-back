export interface SourceDocument {
  id?: string;
  title?: string;
  content: string;
  page?: number;
  score?: number;
}

export interface RagResponse {
  answer: string;
  sources: SourceDocument[];
}
