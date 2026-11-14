# Matriz de rastreabilidade: requisito → partições/limites → casos de teste

Escopo: módulo `rag` do `chatbot-back` (`rag.service.ts`, `rag.controller.ts`, `dto/query-rag.dto.ts`).
Framework de testes: Vitest. Cobertura: `@vitest/coverage-v8`.
Esta matriz foi escrita antes de qualquer geração por LLM.

## User stories e critérios de aceitação (premissas a confirmar com o grupo)

**US-01: Consultar o chatbot**
- CA1: Dado uma pergunta com texto, quando enviada, então o sistema a aceita.
- CA2: Dado uma pergunta vazia, ausente ou de tipo inválido, então o sistema recusa com erro 400.
- CA3: Dado uma pergunta só com espaços, então o sistema recusa com erro 400, porque não há conteúdo para buscar.

**US-02: Filtrar documentos por relevância (limiar 0.8, regra `>=`)**
- CA1: Dado um match com score maior ou igual a 0.8, então ele é relevante e entra em `sources`.
- CA2: Dado um match com score menor que 0.8 ou sem score, então ele é descartado.
- CA3: Dado que nenhum match é relevante, então o sistema responde `{ answer: 'não sei' }`, sem `sources`, e não chama o Gemini.

**US-03: Responder com base nas fontes**
- CA1: Dado documentos relevantes, então a resposta traz o texto do Gemini e `sources` com `id`, `content` e `score`.
- CA2: O contexto enviado ao Gemini concatena os conteúdos separados por `\n---\n`, junto com a pergunta.
- CA3: Dado que o Gemini devolve texto vazio, então o sistema lança erro (resposta 5xx) em vez de devolver 200 com mensagem de fallback.
- CA4: Dado que a consulta ao Pinecone falha, então o erro é propagado e o Gemini não é chamado.
- CA5: O `content` de cada fonte vem de `metadata.text`; se não existir, de `metadata.content`; se nenhum existir, é vazio.

## Matriz

| Requisito / critério | Variável | Partição ou limite | Caso de teste esperado | Coberto pela v1? | Coberto pela v2? |
|---|---|---|---|---|---|
| US-01 CA1 | question | válida (texto normal) | CT-01-01: "O que é teste de unidade?" → aceita | | |
| US-01 CA1 | question | limite mínimo válido (1 caractere) | CT-01-02: "a" → aceita | | |
| US-01 CA2 | question | limite inferior inválido (0 caracteres) | CT-01-03: "" → recusa (400) | | |
| US-01 CA2 | question | campo ausente | CT-01-04: {} → recusa (400) | | |
| US-01 CA2 | question | tipo inválido | CT-01-05: 123 → recusa (400) | | |
| US-01 CA3 | question | só espaços | CT-01-06: "   " → recusa (400) | | |
| US-02 CA2 | score | limite inferior (0.79) | CT-02-01: score 0.79 → descartado | | |
| US-02 CA1 | score | limite exato (0.80) | CT-02-02: score 0.80 → relevante | | |
| US-02 CA1 | score | acima do limite (0.95) | CT-02-03: score 0.95 → relevante | | |
| US-02 CA2 | score | ausente (undefined) | CT-02-04: sem score → descartado | | |
| US-02 CA1, CA2 | lista de matches | mistura (0.9, 0.5, 0.8) | CT-02-05: `sources` só com 0.9 e 0.8 | | |
| US-02 CA3 | lista de matches | vazia | CT-02-06: `{ answer: 'não sei' }`, sem `sources`, Gemini não chamado | | |
| US-02 CA3 | lista de matches | todos abaixo (0.7, 0.6) | CT-02-07: mesmo resultado de CT-02-06 | | |
| US-03 CA1 | resposta do Gemini | texto presente | CT-03-01: `answer` = texto; `sources` com `id`, `content`, `score` | | |
| US-03 CA2 | contexto | 2 ou mais documentos | CT-03-02: prompt contém os conteúdos separados por `\n---\n` e a pergunta | | |
| US-03 CA3 | resposta do Gemini | texto vazio ou indefinido | CT-03-03: `handleQuery` rejeita com erro | | |
| US-03 CA4 | consulta ao Pinecone | falha | CT-03-04: erro propagado; Gemini não chamado | | |
| US-03 CA5 | metadata | só `text` | CT-03-05: `content` = `text` | | |
| US-03 CA5 | metadata | só `content` | CT-03-06: `content` = `content` | | |
| US-03 CA5 | metadata | nenhum dos dois | CT-03-07: `content` = "" | | |

## Resumo (para o relatório)

- User stories: 3. Critérios de aceitação: 11. Casos de teste esperados: 19.
- Decisões do projeto manual: CT-01-06 recusa pergunta só com espaços; CT-03-03 propaga erro quando o Gemini devolve texto vazio. Ambos divergem do código atual e são candidatos a defeito real.
- Pontos de partida: baseline com 18 testes existentes, 17 passando e 1 falhando; `rag.service.ts` com 34,14% de linhas e 20,68% de branches.