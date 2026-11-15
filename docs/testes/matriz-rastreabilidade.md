# Matriz de rastreabilidade: requisito → partições/limites → casos de teste

Escopo: módulo `rag` do `chatbot-back` (`rag.service.ts`, `rag.controller.ts`, `dto/query-rag.dto.ts`).
Framework de testes: Vitest. Cobertura: `@vitest/coverage-v8`.
O projeto manual (US-01 a US-03) foi commitado antes de qualquer geração por LLM. A US-04 foi adicionada depois da v1, a partir das lacunas de branch. As colunas v1 e v2 foram preenchidas depois das execuções.

## User stories e critérios de aceitação (premissas da equipe, sem especificação do grupo)

**US-01: Consultar o chatbot**
- CA1: Dado uma pergunta com texto, quando enviada, o sistema a aceita.
- CA2: Dado uma pergunta vazia, ausente ou de tipo inválido, o sistema recusa com erro 400.
- CA3: Dado uma pergunta só com espaços, o sistema recusa com erro 400, porque não há conteúdo para buscar.

**US-02: Filtrar documentos por relevância (limiar 0.8, regra `>=`)**
- CA1: Dado um match com score maior ou igual ao limiar, ele é relevante e entra em `sources`.
- CA2: Dado um match com score menor que o limiar ou sem score, ele é descartado.
- CA3: Dado que nenhum match é relevante, o sistema responde `{ answer: 'não sei' }`, sem `sources`, e não chama o Gemini.

**US-03: Responder com base nas fontes**
- CA1: Dado documentos relevantes, a resposta traz o texto do Gemini e `sources` com `id`, `content` e `score`.
- CA2: O contexto enviado ao Gemini concatena os conteúdos separados por `\n---\n`, junto com a pergunta.
- CA3: Dado que o Gemini devolve texto vazio, o sistema lança erro em vez de devolver sucesso com mensagem de fallback.
- CA4: Dado que a consulta ao Pinecone falha, o erro é propagado e o Gemini não é chamado.
- CA5: O `content` de cada fonte vem de `metadata.text`; se não existir ou for vazio, de `metadata.content`; se nenhum existir, é string vazia.

**US-04: Configuração obrigatória** (adicionada depois da v1)
- CA1: Dado que `PINECONE_API_KEY` ou `GEMINI_API_KEY` está ausente ou vazia, o `RagService` lança erro ao ser criado, em vez de usar valor padrão.
- CA2: Dado que `PINECONE_INDEX_NAME` está ausente ou vazio, a busca lança erro e o Pinecone não é consultado com índice vazio.

## Matriz

| Requisito / critério | Variável | Partição ou limite | Caso de teste esperado | Coberto pela v1? | Coberto pela v2? |
|---|---|---|---|---|---|
| US-01 CA1 | question | válida (texto normal) | CT-01-01: "O que é teste de unidade?" → aceita | Sim | Sim |
| US-01 CA1 | question | limite mínimo válido (1 caractere) | CT-01-02: "a" → aceita | Sim | Sim |
| US-01 CA2 | question | limite inferior inválido (0 caracteres) | CT-01-03: "" → recusa (400) | Sim | Sim |
| US-01 CA2 | question | campo ausente | CT-01-04: {} → recusa (400) | Sim | Sim |
| US-01 CA2 | question | tipo inválido | CT-01-05: 123 → recusa (400) | Sim | Sim |
| US-01 CA3 | question | só espaços | CT-01-06: "   " → recusa (400) | Sim, mas **falha** (defeito: falta trim) | Sim, mas **falha** |
| US-02 CA2 | score | limite inferior (limiar menos epsilon) | CT-02-01: score 0.79 → descartado | Sim (0.7999) | Sim |
| US-02 CA1 | score | limite exato (0.80) | CT-02-02: score 0.80 → relevante | Sim | Sim |
| US-02 CA1 | score | acima do limite (0.95) | CT-02-03: score 0.95 → relevante | Sim | Sim |
| US-02 CA2 | score | ausente (undefined) | CT-02-04: sem score → descartado | Sim | Sim |
| US-02 CA1, CA2 | lista de matches | mistura (0.9, 0.5, 0.8) | CT-02-05: `sources` só com 0.9 e 0.8 | Sim | Sim |
| US-02 CA3 | lista de matches | vazia | CT-02-06: `{ answer: 'não sei' }`, sem `sources`, Gemini não chamado | Sim | Sim |
| US-02 CA3 | lista de matches | todos abaixo (0.7, 0.6) | CT-02-07: mesmo resultado de CT-02-06 | Sim | Sim |
| US-03 CA1 | resposta do Gemini | texto presente | CT-03-01: `answer` = texto; `sources` com `id`, `content`, `score` | Sim | Sim |
| US-03 CA2 | contexto | 2 ou mais documentos | CT-03-02: prompt contém os conteúdos separados por `\n---\n` e a pergunta | Sim | Sim |
| US-03 CA3 | resposta do Gemini | texto vazio ou indefinido | CT-03-03: `handleQuery` rejeita com erro | Sim, mas **falha** (defeito: devolve sucesso com fallback) | Sim, mas **falha** (asserção reforçada na lacuna G2) |
| US-03 CA4 | consulta ao Pinecone | falha | CT-03-04: erro propagado; Gemini não chamado | Sim | Sim |
| US-03 CA5 | metadata | só `text` | CT-03-05: `content` = `text` | Sim | Sim |
| US-03 CA5 | metadata | só `content` | CT-03-06: `content` = `content` | Sim | Sim |
| US-03 CA5 | metadata | nenhum dos dois | CT-03-07: `content` = "" | Sim | Sim |
| US-04 CA1 | PINECONE_API_KEY | ausente (undefined) | CT-04-01: criar o service sem a chave → lança erro | Não | Sim, mas **falha** (defeito: fallback `dummy-key`) |
| US-04 CA1 | PINECONE_API_KEY | vazia (limite) | CT-04-02: chave "" → lança erro | Não | Sim, mas **falha** |
| US-04 CA1 | GEMINI_API_KEY | ausente (undefined) | CT-04-03: criar o service sem a chave → lança erro | Não | Sim, mas **falha** (a v2 testa também a chave vazia) |
| US-04 CA2 | PINECONE_INDEX_NAME | ausente (undefined) | CT-04-04: `searchRelevantDocuments` rejeita; Pinecone não consultado | Não | Sim, mas **falha** (a v2 testa também o nome vazio) |
| US-04 CA1, CA2 | configuração | completa (válida) | CT-04-05: com as três configuradas, o service é criado sem erro | Sim (implícito: todos os testes da v1 usam a configuração completa) | Sim |

## Resumo

- User stories: 4. Critérios de aceitação: 13. Casos de teste esperados: 25.
- Decisões do projeto manual (sem especificação do grupo): CT-01-06 recusa pergunta só com espaços; CT-03-03 propaga erro quando o Gemini devolve texto vazio; US-04 trata configuração ausente como erro (coerente com o `env.validation.ts`). Todas divergem do código atual e são defeitos em relação a esses requisitos.
- Linha de base (suíte já existente): 18 testes, 17 passando e 1 falhando; `rag.service.ts` com 34,14% de linhas e 20,68% de branches.
- v1: 73 testes, 64 passando e 9 falhando; requisitos 11/11 (matriz original) ou 11/13 (final); casos 20/20 (original) ou 21/25 (final); `rag.service.ts` com 95,12% de linhas e 82,75% de branches.
- v2: 78 testes, 64 passando e 14 falhando; requisitos 13/13; casos 25/25; `rag.service.ts` com 95,12% de linhas e 93,10% de branches.