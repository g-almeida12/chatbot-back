# Log de análise: dívida técnica e qualidade

## Ferramentas e LLM usadas

| Tipo | Ferramenta | Configuração |
|---|---|---|
| LLM | Claude Sonnet 5.5, esforço médio | Conversa em 15/11/2026, com o contexto da Parte 1 (testes, cobertura e execução do spec original) |
| Análise estática | Biome (lint do projeto, executado pelo hook de pre-commit) | Regras recomendadas, sobre `rag.service.ts` na refatoração R3: 1 aviso (`lint/suspicious/noExplicitAny`, campo `extractor`) |
| Manual | Leitura guiada pelas tabelas do roteiro (propriedades de projeto, SOLID e code smells) | Módulo `rag` |

## Entrada fornecida à LLM

Foram enviados, sem texto adicional, o `rag.service.ts` e o `rag.service.spec.ts` originais, em resposta à oferta da LLM de montar a tabela de dívida técnica no formato do roteiro (`DT-01...`).

## O que a LLM propôs e o que a equipe fez com isso

| Achado ou proposta da LLM | Decisão | Motivo |
|---|---|---|
| 11 itens de dívida técnica (DT-01 a DT-11) | Aceitos, com linhas citadas para conferência | Cada um aponta trecho do código |
| Tratar o fallback `'dummy-key'` como defeito (na Parte 1) | **Rejeitado** e reclassificado como divergência de critério e dívida técnica | O `env.validation.ts` já exige as três variáveis na inicialização, então o fallback é código morto em produção |
| "Remover o fallback `'dummy-key'`" como refatoração | **Rejeitado** como refatoração | Muda comportamento |
| `catch` que relança, `(m.score ?? 0)` repetido, branch de `@Injectable()` | **Descartados** como falsos positivos | Ver `divida-tecnica.md` |
| DT-10 (concorrência em `getExtractor`) | Aceito como hipótese não confirmada | Veio da leitura do código, sem teste |

## Comparação entre as formas de identificação

O Biome apontou 1 dos 11 itens (DT-06, o `any` do `extractor`), e só no nível do tipo. Não apontou métodos longos, código duplicado, literais soltos, acoplamento (DIP) nem o spec desatualizado: as regras recomendadas não medem complexidade nem duplicação, e não enxergam responsabilidades misturadas. A LLM apontou os 11 itens, incluindo os de projeto (DIP, SRP, integridade conceitual). O spec desatualizado (DT-08) e o erro do nome do modelo (DT-04) foram confirmados pela execução dos testes.

## Revisão da equipe

- **Revisor:** Fabrício Fernandes
- **Data:** 15/11/2026
- **Base conferida:** branch `sprint3-testes`, a partir do commit `04214e9` (`rag.service.ts` e `rag.service.spec.ts` originais)
- **Como foi feita:** leitura dos arquivos no editor, conferindo cada trecho citado na tabela de dívida técnica
- **Resultado:** 10 itens confirmados e 1 mantido como hipótese (DT-10). Nenhum item foi descartado.

| ID | Situação | Linhas conferidas | Observação |
|---|---|---|---|
| DT-01 |  Confirmado | `rag.service.ts` L20-26 | Os clientes `Pinecone` e `GoogleGenAI` são criados no construtor |
| DT-02 |  Confirmado | `rag.service.ts` L50-99 | Função de 50 linhas que mistura 7 responsabilidades |
| DT-03 |  Confirmado | `rag.service.ts` L101-122 (prompt nas L110-111) | Template do prompt e separador ficam dentro de `handleQuery` |
| DT-04 |  Confirmado | `rag.service.ts` L21, L24, L38-40, L62, L110, L114, L119 | Literais conferidos um a um. O nome do modelo fixo no código causou o erro silencioso visto na execução |
| DT-05 |  Confirmado | `rag.service.ts` L21, L24, L55 | Mesmo padrão `get(...) \|\| fallback` nos 3 pontos. Em produção os fallbacks são código morto, porque o `env.validation.ts` exige as três variáveis |
| DT-06 |  Confirmado | `rag.service.ts` L18 e L28-48 | `new Function` e `extractor: any` conferidos. O Biome também aponta o `any` (`noExplicitAny`) |
| DT-07 |  Confirmado | `rag.type.ts`; `rag.service.ts` L101-122 | `sources` é obrigatório no tipo, e a resposta padrão não o devolve |
| DT-08 |  Confirmado | `rag.service.spec.ts` (original) L7, L39 e L96 | O spec mocka `openai`, usa `OPENAI_API_KEY` e espera um texto que o service atual não devolve |
| DT-09 |  Confirmado | `rag.service.ts` L68-71 | O log registra o texto da pergunta do usuário |
| DT-10 |  Hipótese | `rag.service.ts` L28-34 | Veio da leitura do código e não foi reproduzida com teste de concorrência |
| DT-11 |  Confirmado | `rag.service.ts` L113-116 | A chamada ao Gemini não tem `try/catch`, timeout nem nova tentativa |

**Itens propostos pela LLM que foram corrigidos ou rejeitados durante a análise**

- Fallback `dummy-key` tratado como defeito na Parte 1: reclassificado como divergência de critério e dívida técnica (DT-05), porque o `env.validation.ts` já exige as três variáveis.
- "Remover o fallback `dummy-key`" como refatoração: rejeitado, porque muda comportamento.

**Falsos positivos descartados** (detalhes em `divida-tecnica.md`): o `catch` que relança o erro, o `(m.score ?? 0)` repetido, o branch de `@Injectable()` e o `min(1)` do DTO (que é defeito de comportamento da Parte 1, não dívida de projeto).
