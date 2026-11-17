# Suíte de testes do módulo RAG (Sprint 3)

## O que há aqui

| Onde | O quê |
|---|---|
| `tests/v1-llm/` | Suíte gerada por LLM, preservada sem edição (73 testes) |
| `tests/v2/` | Suíte melhorada pela equipe (78 testes). **É a que deve ser reaproveitada** |
| `tests/refatoracao/` | Teste de caracterização do nome do modelo do Gemini |
| `docs/testes/` | Matriz de rastreabilidade, log da LLM, relatórios de cobertura e relatório de análise crítica |
| `docs/qualidade/` | Dívida técnica (DT-01 a DT-11), log de análise, evidências e relatório de refatoração |

## Como rodar

```bash
npm install
npx vitest run tests/v2 tests/refatoracao
```

**Resultado esperado: 79 testes, 65 passando e 14 falhando.** Não rode `npx vitest run` sem argumentos: ele também executa a v1 e o spec original, que tem testes redundantes ou desatualizados.

## As 14 falhas são intencionais

Cada falha documenta um comportamento que o código atual não cumpre:

| Testes | Critério | Como corrigir no código |
|---|---|---|
| 5 em `tests/v2/query-rag.dto.spec.ts` | Pergunta só com espaços deve ser recusada | Trocar `z.string().min(1)` por `z.string().trim().min(1)` no DTO |
| 3 em `tests/v2/rag.service.spec.ts` (US-03 CA3) | Gemini sem texto deve lançar erro | Em `handleQuery`, lançar erro quando `completion.text` vier vazio, em vez de devolver o texto de fallback |
| 6 em `tests/v2/rag.service.spec.ts` (US-04) | Configuração ausente é erro | **Decisão pendente do grupo**: o `env.validation.ts` já exige as três variáveis, então o fallback `dummy-key` é código morto em produção. Ver DT-05 |

Ao corrigir o código, os testes correspondentes passam a verde e o total sobe de 65 para 79.

## Como adotar os testes no projeto

1. Copie `tests/v2/*.spec.ts` para `src/modules/rag/` e troque os imports `../../src/modules/rag/...` por `./...`. Assim eles rodam com `npm test`.
2. Substitua o spec original `src/modules/rag/rag.service.spec.ts`, que está desatualizado (DT-08).
3. Se o embedding virar um serviço injetável (DT-06), ajuste o helper `makeService` da v2: hoje ele injeta um extrator falso no campo privado `extractor`.

## Para entender o contexto

- Critérios de aceitação e casos de teste: `docs/testes/matriz-rastreabilidade.md`
- Cobertura (v1 e v2): `docs/testes/relatorios/`
- Dívida técnica e plano de pagamento: `docs/qualidade/divida-tecnica.md`
- Refatorações já feitas (DT-02, DT-04 e DT-05): `docs/qualidade/relatorio-refatoracao.pdf`