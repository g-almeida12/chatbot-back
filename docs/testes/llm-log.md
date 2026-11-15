# Log de interação com a LLM

- **LLM:** Claude
- **Modelo:** Claude Sonnet 5.5 (esforço médio)
- **Data:** 14/11/2026
- **Contexto enviado:** `rag.service.ts`, `rag.controller.ts`, `dto/query-rag.dto.ts`, `rag.constants.ts`, `rag.type.ts`, as 3 user stories com critérios de aceitação e a informação de que o framework é Vitest. A matriz de rastreabilidade **não** foi enviada, e os `.spec.ts` já existentes no repositório também não.
- **Saída:** 3 arquivos em `tests/v1-llm/`, preservados sem edição: `query-rag.dto.spec.ts` (25 testes), `rag.controller.spec.ts` (4) e `rag.service.spec.ts` (44).

## Rodadas de interação

| Rodada | Prompt (texto completo) | Resumo da resposta | Problemas observados |
|---|---|---|---|
| 1 | Ver "Prompt da rodada 1" abaixo. | Gerou os 3 arquivos de teste. DTO: US-01 CA1 a CA3, com `ZodValidationPipe` e `getStatus() === 400`. Controller: delegação ao service. Service: US-02 e US-03, com Pinecone, Gemini, embedding e ConfigService mockados e sem chamadas de rede. Cada teste traz comentário com a técnica e o critério. A LLM informou que **não executou** a suíte. | A própria LLM avisou que US-01 CA3 e US-03 CA3 não são cumpridos pelo código atual. Informou que o `vi.mock` não intercepta o `new Function('m','return import(m)')` do embedding, então injetou um extrator falso no campo privado `extractor`, o que acopla os testes a um detalhe interno. Avisou que o `vitest.config` poderia precisar de ajuste no `include` e o `tsconfig` de `experimentalDecorators`. Não verificou o nome do modelo Gemini, de propósito. |

Total de rodadas com a LLM: 1. Rodadas extras só para a suíte rodar: 0.

## Ajustes de configuração (não são rodadas da LLM)

| Ajuste | Motivo | Efeito nos testes da v1 |
|---|---|---|
| `vitest.config.ts`: `tests/**/*.spec.ts` adicionado ao `include` | A 1ª execução retornou `No test files found`, porque o `include` só cobria `src/` | Nenhuma alteração nos arquivos da v1 |
| Saída do terminal movida para `docs/testes/relatorios/saida-v1.txt` | Com a saída dentro da pasta de cobertura, o Vitest falhou com `EBUSY` ao limpar a pasta | Nenhum. Foi erro do comando, e os testes nem chegaram a rodar |

O `tsconfig` não precisou de alteração.

## Comando de execução e medição

```
npx vitest run tests/v1-llm --coverage --coverage.reportOnFailure=true --coverage.include=src/modules/rag/** --coverage.exclude=**/*.type.ts --coverage.reporter=text --coverage.reporter=html --coverage.reportsDirectory=docs/testes/relatorios/v1
```

## Resultados da execução da v1

- **Testes:** 73 gerados, 64 passando, 9 falhando, 0 não compilam.
- **Cobertura de `rag.service.ts`:** 95,12% de linhas e 82,75% de branches (24 de 29), com 9 testes falhando. Escopo: módulo `rag`, sem `*.type.ts`. O `rag.module.ts` (0%) é só configuração do Nest e não pertence a nenhuma user story.
- **Linhas não cobertas em `rag.service.ts`:** 30-31 (carregamento do modelo de embedding em `getExtractor`, nunca executado porque todos os testes injetam um extrator falso).
-  **Branches não cobertos (5 de 29):** linha 13 (`@Injectable()`, provável artefato do compilador); linhas 21 e 24 (`|| 'dummy-key'` no construtor); linha 29 (ramo verdadeiro de `if (!this.extractor)`, linhas 30-31); linha 55 (`|| ''` do nome do índice). As linhas 21, 24 e 55 têm a linha executada mas o branch do fallback não, porque a configuração falsa dos testes sempre entrega as três chaves.
- **Cobertura de requisitos:** 11/11 critérios com ao menos um teste (100%).
- **Casos da matriz exercitados:** 20/20 (100%), incluindo todos os limites (0.7999 e 0.80 no limiar; "" e "a" na pergunta; texto vazio no Gemini).
- **Testes sem asserção ou triviais:** 0 sem asserção e 0 triviais. 3 testes têm asserção fraca (`rejects.toThrow()` sem especificar o erro, em US-03 CA3).
- **Defeitos reais:** 2.

## Falhas investigadas

| Testes que falham | Critério | Causa | Classificação |
|---|---|---|---|
| 5 em `query-rag.dto.spec.ts` (1 espaço, vários espaços, tabulação, quebras de linha, mistura de whitespace) | US-01 CA3 | O schema `z.string().min(1)` aceita strings só com whitespace | **Defeito real do sistema** (falta `trim()`) |
| 4 em `rag.service.spec.ts` (texto vazio, `undefined`, `null` e "não devolve sucesso com fallback") | US-03 CA3 | `handleQuery` devolve sucesso com "Não foi possível gerar uma resposta." em vez de lançar erro | **Defeito real do sistema** |

Defeitos reais distintos: **2**. Nenhuma falha é de teste. Os dois critérios foram definidos pela equipe, porque não havia especificação do grupo. O código atual não foi alterado.

## Inspeção da v1 (oráculos e testes sem critério)

- **Oráculo vindo do requisito:** os 9 testes que falham mantêm o oráculo do requisito, mesmo com a LLM sabendo que o código falharia (comentário `OBS` nos testes). Nenhum teste passou validando um defeito.
- **Testes sem critério correspondente (7):** eles citam um critério no comentário, mas verificam detalhes tirados do código: `topK 5` e `includeMetadata` (1), prefixo `query: ` e opções do embedding (1), dimensão do embedding ±1 e zero (3), log de erro (1) e "5 documentos (limite: topK)" (1).
- **Oráculo possivelmente copiado do código (2):** "usa metadata.content quando text é string vazia" (o CA5 não define o caso, o teste fixa o comportamento do `||`) e o formato exato do prompt `Contexto:\nAAA\n\nPergunta:` (o CA2 exige só separador e pergunta).
- **Acoplamento:** todos os 44 testes do service dependem de `(service as any).extractor`, um campo privado.

## Prompt da rodada 1

```
Você é um engenheiro de testes. Gere uma suíte de testes automatizados com Vitest (TypeScript) para as user stories abaixo, usando o código que enviei (módulo RAG de um backend NestJS).

Requisitos da suíte:
- Aplique partições de equivalência, análise de valores-limite e cobertura dos critérios de aceitação.
- Em cada teste, coloque um comentário indicando a técnica usada e o critério de aceitação coberto.
- Use mocks para o Pinecone, o Gemini (@google/genai), o embedding e o ConfigService. Os testes não podem fazer chamadas de rede.
- Entregue os arquivos prontos para rodar, com os imports corretos a partir de tests/v1-llm/ (por exemplo '../../src/modules/rag/rag.service').

US-01: Consultar o chatbot
- CA1: Dado uma pergunta com texto, quando enviada, o sistema a aceita.
- CA2: Dado uma pergunta vazia, ausente ou de tipo inválido, o sistema recusa com erro 400.
- CA3: Dado uma pergunta só com espaços, o sistema recusa com erro 400, porque não há conteúdo para buscar.

US-02: Filtrar documentos por relevância
- CA1: Dado um match com score maior ou igual ao limiar (RELEVANCE_SCORE_THRESHOLD), ele é relevante e entra em sources.
- CA2: Dado um match com score menor que o limiar ou sem score, ele é descartado.
- CA3: Dado que nenhum match é relevante, o sistema responde apenas com a resposta padrão "não encontrado", sem sources, e não chama o Gemini.

US-03: Responder com base nas fontes
- CA1: Dado documentos relevantes, a resposta traz o texto do Gemini e sources com id, content e score.
- CA2: O contexto enviado ao Gemini concatena os conteúdos dos documentos separados por "\n---\n", junto com a pergunta.
- CA3: Dado que o Gemini devolve texto vazio, o sistema lança erro em vez de devolver sucesso com mensagem de fallback.
- CA4: Dado que a consulta ao Pinecone falha, o erro é propagado e o Gemini não é chamado.
- CA5: O content de cada fonte vem de metadata.text; se não existir, de metadata.content; se nenhum existir, é string vazia.
```
## Resultados da execução da v2

- **Testes:** 78 gerados, 64 passando, 14 falhando, 0 não compilam (service 49, DTO 25, controller 4). O DTO e o controller da v2 são cópias da v1 sem alteração.
- **Cobertura de `rag.service.ts`:** 95,12% de linhas e 93,10% de branches (27 de 29), com 14 testes falhando. Linhas não cobertas: 30-31 (carga do modelo de embedding). O branch restante é o de `@Injectable()`.
- **Falhas (14):** 5 de US-01 CA3, 3 de US-03 CA3 e 6 de US-04. Todas por defeito do sistema em relação ao requisito. Defeitos distintos: 3 (falta de `trim()`, fallback de resposta vazia do Gemini e fallback silencioso de configuração).
- **Aplicação das mudanças:** as mudanças da LLM foram aplicadas ao spec da v1 de forma mecânica, por substituição de intervalos de linhas conferidos, sem edição manual do conteúdo. A v1 não foi alterada.
- **Problemas da resposta da LLM que ficaram como entregues:** (1) G4(b): `['AAA'].join('\n---\n')` equivale a `'AAA'`, então o teste não verifica separador; (2) G4(a): o caso "text não existe" do novo `it.each` duplica o teste original `usa metadata.content quando text não existe`, e os dois continuam na suíte.
- **Ajustes manuais na v2:** nenhum.