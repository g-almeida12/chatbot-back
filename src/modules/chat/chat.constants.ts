import type { ChatLink } from './chat.type';

//Substituir com os links úteis reais
export const FALLBACK_LINKS: ChatLink[] = [
  { name: 'Site oficial', url: 'https://example.com' },
  { name: 'Central de ajuda', url: 'https://example.com/ajuda' },
];

//Substituir com os contatos reais.
export const CONTACTS: Record<string, string> = {
  email: 'contact@example.com',
  phone: '(00) 00000-0000',
};
