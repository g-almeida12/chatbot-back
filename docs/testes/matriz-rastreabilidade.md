# Matriz de rastreabilidade: requisito → partições/limites → casos de teste

Escopo: módulo `rag` do `chatbot-back` (`rag.service.ts`, `rag.controller.ts`, `dto/query-rag.dto.ts`).
Framework de testes: Vitest. Cobertura: `@vitest/coverage-v8`.
O projeto manual (critérios, partições, limites e casos esperados) foi commitado antes de qualquer geração por LLM. A coluna "Coberto pela v1?" foi preenchida depois da execução da v1.

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

**US-04: Configuração obrigatória** (adicionada depois da v1, a partir das lacunas de branch)
- CA1: Dado que `PINECONE_API_KEY` ou `GEMINI_API_KEY` está ausente ou vazia, o `RagService` lança erro ao ser criado, em vez de usar valor padrão.
- CA2: Dado que `PINECONE_INDEX_NAME` está ausente ou vazio, a busca lança erro e o Pinecone não é consultado com índice vazio.

## Matriz

| Requisito / critério | Variável | Partição ou limite | Caso de teste esperado | Coberto pela v1? | Coberto pela v2? |
|---|---|---|---|---|---|
| US-01 CA1 | question | válida (texto normal) | CT-01-01: "O que é teste de unidade?" → aceita | Sim (dto.spec: aceita texto simples) | |
| US-01 CA1 | question | limite mínimo válido (1 caractere) | CT-01-02: "a" → aceita | Sim (dto.spec: aceita pergunta com exatamente 1 caractere) | |
| US-01 CA2 | question | limite inferior inválido (0 caracteres) | CT-01-03: "" → recusa (400) | Sim (dto.spec: recusa string vazia) | |
| US-01 CA2 | question | campo ausente | CT-01-04: {} → recusa (400) | Sim (dto.spec: recusa pergunta ausente) | |
| US-01 CA2 | question | tipo inválido | CT-01-05: 123 → recusa (400) | Sim (dto.spec: recusa question com tipo inválido: número) | |
| US-01 CA3 | question | só espaços | CT-01-06: "   " → recusa (400) | Sim, mas **falha** (defeito real: falta trim) | |
| US-02 CA2 | score | limite inferior (limiar menos epsilon) | CT-02-01: score 0.79 → descartado | Sim (service.spec: descarta match com limiar - epsilon, usa 0.7999) | |
| US-02 CA1 | score | limite exato (0.80) | CT-02-02: score 0.80 → relevante | Sim (service.spec: mantém match com score exatamente o limiar) | |
| US-02 CA1 | score | acima do limite (0.95) | CT-02-03: score 0.95 → relevante | Sim (service.spec: score máximo 1.0 e lista mista com 0.95) | |
| US-02 CA2 | score | ausente (undefined) | CT-02-04: sem score → descartado | Sim (service.spec: descarta match com score undefined) | |
| US-02 CA1, CA2 | lista de matches | mistura (0.9, 0.5, 0.8) | CT-02-05: `sources` só com 0.9 e 0.8 | Sim (service.spec: em lista mista mantém apenas os relevantes) | |
| US-02 CA3 | lista de matches | vazia | CT-02-06: `{ answer: 'não sei' }`, sem `sources`, Gemini não chamado | Sim (service.spec: resposta padrão quando matches vazio) | |
| US-02 CA3 | lista de matches | todos abaixo (0.7, 0.6) | CT-02-07: mesmo resultado de CT-02-06 | Sim (service.spec: resposta padrão quando todos abaixo do limiar) | |
| US-03 CA1 | resposta do Gemini | texto presente | CT-03-01: `answer` = texto; `sources` com `id`, `content`, `score` | Sim (service.spec: devolve answer do Gemini e sources completas) | |
| US-03 CA2 | contexto | 2 ou mais documentos | CT-03-02: prompt contém os conteúdos separados por `\n---\n` e a pergunta | Sim (service.spec: separa os conteúdos de 2+ documentos) | |
| US-03 CA3 | resposta do Gemini | texto vazio ou indefinido | CT-03-03: `handleQuery` rejeita com erro | Sim, mas **falha** (defeito real: devolve sucesso com fallback) | |
| US-03 CA4 | consulta ao Pinecone | falha | CT-03-04: erro propagado; Gemini não chamado | Sim (service.spec: propaga o mesmo erro e não chama o Gemini) | |
| US-03 CA5 | metadata | só `text` | CT-03-05: `content` = `text` | Sim (service.spec: usa metadata.text quando existe) | |
| US-03 CA5 | metadata | só `content` | CT-03-06: `content` = `content` | Sim (service.spec: usa metadata.content quando text não existe) | |
| US-03 CA5 | metadata | nenhum dos dois | CT-03-07: `content` = "" | Sim (service.spec: devolve string vazia com metadata sem text nem content) | |
| US-04 CA1 | PINECONE_API_KEY | ausente (undefined) | CT-04-01: criar o service sem a chave → lança erro | Não | |
| US-04 CA1 | PINECONE_API_KEY | vazia (limite) | CT-04-02: chave "" → lança erro | Não | |
| US-04 CA1 | GEMINI_API_KEY | ausente (undefined) | CT-04-03: criar o service sem a chave → lança erro | Não | |
| US-04 CA2 | PINECONE_INDEX_NAME | ausente (undefined) | CT-04-04: `searchRelevantDocuments` rejeita; Pinecone não consultado | Não | |
| US-04 CA1, CA2 | configuração | completa (válida) | CT-04-05: com as três configuradas, o service é criado sem erro | Sim (implícito: todos os testes da v1 usam a configuração completa) | |

## Resumo

 User stories: 4 (a US-04 foi adicionada depois da v1). Critérios de aceitação: 13. Casos de teste esperados: 25.
- Decisões do projeto manual (sem especificação do grupo): CT-01-06 recusa pergunta só com espaços; CT-03-03 propaga erro quando o Gemini devolve texto vazio. Ambos divergem do código atual.
- Linha de base (suíte já existente no repositório): 18 testes, 17 passando e 1 falhando; `rag.service.ts` com 34,14% de linhas e 20,68% de branches.
- v1: 73 testes, 64 passando e 9 falhando (2 defeitos reais). Cobertura de requisitos 11/11 e de casos da matriz 20/20. `rag.service.ts` com 95,12% de linhas e 82,75% de branches.
- Indicadores da v1: medidos sobre a matriz original (3 user stories, 11 critérios, 20 casos). A v2 é medida sobre a matriz completa (4 user stories, 13 critérios, 25 casos).