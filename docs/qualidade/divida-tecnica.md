# Dívida técnica: módulo `rag` (`chatbot-back`)

**Base analisada:** branch `sprint3-testes`, a partir do commit `04214e9` (`feat(rag): add rag module`). As linhas citadas são do `src/modules/rag/rag.service.ts` nessa base, salvo indicação.

## Escopo e método

- **Analisados:** `rag.service.ts`, `rag.controller.ts`, `dto/query-rag.dto.ts`, `rag.type.ts`, `rag.constants.ts` e o spec original `rag.service.spec.ts`. **Não analisados:** auth, task, health, config e filtros, porque a regra de negócio do chatbot está no módulo `rag`.
- **Identificação:** leitura manual guiada pelas tabelas do roteiro, apoio de uma LLM (ver `log-analise.md`) e evidências da Parte 1 (execução do spec original e relatórios de cobertura). Nenhuma ferramenta de análise estática foi executada.
- **Confirmação:** cada item cita arquivo e linhas para conferência no código.

## Itens identificados

| ID | Local | Problema | Categoria | Por que atrapalha | Como foi encontrado | Status |
|---|---|---|---|---|---|---|
| DT-01 | `rag.service.ts`, construtor (L20-26) | Cria `new Pinecone(...)` e `new GoogleGenAI(...)` dentro do construtor | DIP; acoplamento alto | Não há como trocar os clientes por falsos: o spec original chamou o Gemini de verdade e quebrou com `API key not valid`, e a v1 teve de mockar módulos inteiros. Trocar de provedor exige editar o service | Leitura manual, confirmada pela execução do spec original e por LLM | Aberto |
| DT-02 | `rag.service.ts`, `searchRelevantDocuments` (L50-99, 50 linhas) | Uma função lê configuração, gera o embedding, consulta o Pinecone, registra log, filtra por score, converte os resultados e trata erro | Long Method; SRP; baixa coesão | Mudar a regra de relevância ou a conversão do `content` obriga a mexer na função que também fala com o Pinecone. Testar o filtro exige montar Pinecone, embedding e configuração falsos | Leitura manual e LLM | Refatorado (R1) |
| DT-03 | `rag.service.ts`, `handleQuery` (L101-122; prompt nas L110-111) | O template do prompt e o separador ficam dentro do método que também decide a resposta padrão, chama o Gemini e monta a resposta | Long Method; coesão | Ajustar o texto do prompt exige editar o orquestrador, e o formato só pode ser conferido executando `handleQuery` inteiro | Leitura manual | Aberto |
| DT-04 | `rag.service.ts` (L21, L24, L38-40, L62, L110, L114, L119) | Literais soltos: `'dummy-key'` (2 vezes), `'query: '`, `'mean'`, `5`, `'\n---\n'`, `'gemini-3.8-flash'` e a mensagem de fallback | Magic Numbers; integridade conceitual (`rag.constants.ts` guarda só parte das constantes) | O nome do modelo fixo no código causou um erro silencioso durante o desenvolvimento: com um modelo errado (`-tts`) o Gemini devolveu texto vazio e a API respondeu 200 com a mensagem de fallback. Trocar `topK` ou o modelo exige caçar o valor no meio da lógica | Leitura manual e LLM; o erro do modelo foi observado na execução | Refatorado (R2) |
| DT-05 | `rag.service.ts`, construtor (L21, L24) e `searchRelevantDocuments` (L55) | O padrão `configService.get(KEY) \|\| fallback` aparece 3 vezes, com fallbacks diferentes, e o `env.validation.ts` já exige as 3 variáveis na inicialização | Duplicated Code; integridade conceitual (duas políticas: fail-fast na validação e fallback silencioso no service) | Mudar o tratamento de configuração ausente exige editar 3 pontos. Em produção os fallbacks são código morto, que só aparece em testes com `ConfigService` falso. Decidir se eles permanecem é pendência pré-implantação | Leitura manual; cobertura (branches das L21, L24 e L55 sem teste na v1) | Refatorado (R3 eliminou a duplicação; a política segue pendente) |
| DT-06 | `rag.service.ts`, `getExtractor` e `generateEmbedding` (L28-48) e campo `extractor` (L18) | O service carrega o modelo de embedding com `new Function('m', 'return import(m)')`, guarda o pipeline em `private extractor: any` e ainda faz embedding, busca e geração | Large Class e SRP; DIP; information hiding | `new Function` não pode ser mockado: as L30-31 nunca são cobertas e os 93 testes de service da v1 e da v2 injetam um valor no campo privado. Trocar o modelo de embedding exige mexer no service |Leitura manual; Biome no pre-commit (`noExplicitAny` no campo `extractor`); cobertura (L30-31)
| DT-07 | `rag.type.ts` e `handleQuery` (L101-122) | `handleQuery` devolve `RagResponse \| { answer: string }`: o tipo exige `sources`, mas a resposta padrão não o devolve | Integridade conceitual (contrato inconsistente) | Quem consome precisa tratar `sources` como opcional (descobrimos isso ao montar o contrato do front), e o tipo não diz isso | Leitura manual, durante o ajuste do front | Aberto |
| DT-08 | `src/modules/rag/rag.service.spec.ts` (original) | O spec está desatualizado: mocka `openai`, configura `OPENAI_API_KEY` e espera `'Conteúdo relevante encontrado com sucesso'`, que o service atual nunca devolve | Integridade conceitual (teste e código divergem) | Um teste falha sempre no `main`, e o resultado vermelho passa a ser aceito como normal, o que esconde regressões. Ele também chama o Gemini de verdade | Execução do spec e leitura | Aberto |
| DT-09 | `rag.service.ts`, `searchRelevantDocuments` (L68-71) | O "LOG TEMPORÁRIO" registra a pergunta do usuário e os scores a cada consulta | Código de depuração esquecido; information hiding (dado do usuário em log) | Em uso real grava o texto das perguntas dos usuários nos logs. O comentário manda remover após calibrar o limiar, mas não há dono nem prazo | Leitura manual | Aberto |
| DT-10 | `rag.service.ts`, `getExtractor` (L28-34) | A verificação e a atribuição de `this.extractor` têm um `await` no meio: duas primeiras requisições simultâneas passam pelo `if` antes da atribuição | Risco de concorrência (fora das categorias do roteiro) | Em produção, uma rajada de perguntas logo após subir pode carregar o modelo de embedding (centenas de MB) mais de uma vez. **Hipótese pela leitura do código, sem teste** | Leitura manual e LLM | Aberto (a confirmar) |
| DT-11 | `rag.service.ts`, `handleQuery` (L113-116) | A chamada ao Gemini não tem tratamento de erro, timeout nem nova tentativa | Robustez (fora das categorias do roteiro) | Uma falha do provedor vira `500 INTERNAL_ERROR` sem detalhe: o erro 403 de billing visto ao subir o back chegou assim ao cliente | Observado na execução | Aberto |

## Plano de refatoração

| Ref. | Item | Refatoração (catálogo) | Melhora | Por que este item | O que protege a mudança |
|---|---|---|---|---|---|
| R1 | DT-02 | Extract Function: `filterRelevantMatches` e `toSourceDocument` | SRP; Long Method | É o trecho com mais regra de negócio e o mais coberto pelos testes (US-02 e US-03 CA5) | Testes de US-02 e US-03 CA5 da v2 |
| R2 | DT-04 | Replace Magic Literal: constantes nomeadas em `rag.constants.ts` | Magic Numbers | Remove a causa de um erro real que tivemos e é a de menor risco | Testes de `topK`, prefixo e separador da v2, mais o teste de caracterização do nome do modelo (`tests/refatoracao/`). `'dummy-key'` e a mensagem de fallback não têm teste passando: os valores são copiados idênticos e conferidos no diff |
| R3 | DT-05 | Extract Function: `getConfig(key, fallback)` | Duplicated Code | Reduz 3 leituras de configuração a 1 e prepara a decisão da política antes da produção, sem mudar o comportamento (preserva o `\|\|`) | Os 6 testes de US-04 que falham servem de sentinela: se o fallback mudar, o conjunto de falhas muda |

### Resultado dos testes a cada passo (`npx vitest run tests/v2 tests/refatoracao`)

| Momento | Testes (total / passando / falhando) | Conjunto de falhas igual ao do início? |
|---|---|---|
| Antes (v2 + caracterização) | 79 / 65 / 14 | n/a |
| Depois de R1 | 79 / 65 / 14 | Sim (mesmos 14, por nome) |
| Depois de R2 | 79 / 65 / 14 | Sim (mesmos 14, por nome) |
| Depois de R3 | 79 / 65 / 14 | Sim (mesmos 14, por nome) |

## Itens que não serão refatorados agora

- **DT-01 e DT-06:** mudariam o construtor e o campo privado que os 93 testes de service usam. Exigem adaptar a suíte, então ficam como dívida registrada.
- **DT-07 e DT-09:** mudariam comportamento observável (contrato de resposta e conteúdo do log), então não são refatorações.
- **DT-05 (política):** a decisão de manter ou remover os fallbacks é do grupo e é pendência antes da implantação.
- **DT-03:** candidato a Extract Function (`buildPrompt`) se sobrar tempo.
- **DT-08:** os testes da v2 substituem o spec original, a ser decidido com o grupo.
- **DT-10 e DT-11:** fora do escopo de refatoração (correções de robustez).

## Achados descartados (falsos positivos)

| Achado | Motivo do descarte |
|---|---|
| "Remover o fallback `'dummy-key'`" como refatoração | Muda comportamento (o app deixaria de instanciar sem chave), então não é refatoração. Ficou registrado como pendência em DT-05 |
| `catch (error) { ...; throw error; }` (L95-98) parecia engolir erros | Relança o erro, então não engole. A mensagem "Erro ao consultar o Pinecone" também aparece para falhas do embedding, mas o impacto é baixo |
| `(m.score ?? 0)` repetido nas L70 e L74 | Duplicação mínima, sem custo de mudança relevante |
| Branch descoberto em `@Injectable()` na cobertura | Provável código gerado pelo compilador, sem lógica do projeto |
| `min(1)` do DTO aceita só espaços | É defeito de comportamento (US-01 CA3), tratado na Parte 1, e não dívida de projeto |
