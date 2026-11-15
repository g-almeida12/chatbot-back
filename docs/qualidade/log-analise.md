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
