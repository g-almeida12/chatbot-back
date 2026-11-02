export interface ChatLink {
  name: string;
  url: string;
}

export interface ChatResponse {
  answer: string;
  found: boolean;
  links: ChatLink[];
  contacts: Record<string, string>;
}
