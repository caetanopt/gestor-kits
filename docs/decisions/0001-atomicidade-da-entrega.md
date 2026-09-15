# 0001 — Atomicidade da entrega de kits

**Estado:** aceite · **Data:** 2026-09-15

## Contexto

A especificação (secções 8.3 e 15) exige que o stock nunca fique negativo e
que dois operadores não consigam entregar em simultâneo ao mesmo colaborador.
A aplicação será usada por vários operadores ao mesmo tempo durante um evento.

A abordagem ingénua — ler a contagem de entregas, decidir, escrever — é uma
condição de corrida clássica (_time-of-check to time-of-use_). Com dois
operadores em simultâneo, ambos leem 119/120, ambos concluem que há stock, e
ambos inserem. Resultado: 121 kits entregues de 120.

Envolver isso numa transação **não resolve o problema**. No nível de
isolamento `READ COMMITTED` (o predefinido do PostgreSQL e do Supabase) uma
transação não bloqueia linhas que ainda não existem, por isso as duas
inserções concorrentes continuam ambas a passar.

## Decisão

As regras críticas vivem em funções PostgreSQL `SECURITY DEFINER`, não em
TypeScript. A aplicação Next.js é uma casca fina que valida a entrada, chama
a função e traduz o resultado.

Três defesas independentes, cada uma suficiente por si só:

### 1. Índice único parcial — impede entregas duplicadas

```sql
create unique index deliveries_one_active_per_employee_idx
  on public.deliveries (employee_id)
  where reversed_at is null;
```

Duas entregas ativas ao mesmo colaborador são fisicamente impossíveis. Esta
garantia sobrevive a qualquer bug aplicacional, a qualquer ordem de execução
e a qualquer cliente que fale diretamente com a base de dados.

O predicado `where reversed_at is null` é o que faz a anulação funcionar: ao
marcar `reversed_at`, a linha sai do índice e o colaborador volta a poder
receber um kit, sem que o histórico se perca.

### 2. Bloqueio de linha — impede stock negativo

```sql
select * into v_company from public.companies
 where id = v_employee.company_id
   for update;
```

O `FOR UPDATE` serializa todas as entregas da **mesma** empresa. A contagem
de stock executada a seguir já é estável: em `READ COMMITTED` cada instrução
obtém um snapshot novo, por isso a contagem feita depois de obter o bloqueio
vê as entregas confirmadas pela transação que detinha o bloqueio antes.

Empresas diferentes não se bloqueiam entre si, portanto isto não limita o
débito do evento na prática.

### 3. Chave de idempotência — impede duplo clique e retries

```sql
create unique index deliveries_idempotency_key_idx
  on public.deliveries (idempotency_key);
```

O cliente gera uma chave por resultado de pesquisa. Um duplo clique, um
duplo Enter (relevante: leitores de código de barras terminam com Enter) ou
um retry de rede reutilizam a mesma chave e recebem o resultado original, em
vez de um erro confuso ou de uma segunda entrega.

## Consequências

- A lógica crítica deixa de ser testável apenas com mocks — exige uma base de
  dados real. Em troca, os testes que existem provam o comportamento
  verdadeiro. Ver `tests/sql/run-concurrency.sh`.
- Depende do nível de isolamento `READ COMMITTED`. Em `REPEATABLE READ` o
  bloqueio produziria um erro de serialização em vez de esperar; o sistema
  continuaria correto (nada de stock negativo) mas devolveria erros
  transitórios que teriam de ser repetidos.
- As funções são `SECURITY DEFINER` com `search_path` vazio e nomes
  totalmente qualificados, para não serem vulneráveis a manipulação do
  `search_path`.

## Verificação

`tests/sql/run-concurrency.sh` dispara processos `psql` verdadeiramente
paralelos:

| Cenário                                        | Resultado                              |
| ---------------------------------------------- | -------------------------------------- |
| 30 operadores, 1 kit, colaboradores diferentes | exatamente 1 entrega                   |
| 30 operadores, o mesmo colaborador             | exatamente 1 entrega                   |
| 60 tentativas, 10 kits                         | exatamente 10 entregas, disponível = 0 |

## Alternativas consideradas

**Contador `delivered_count` em `companies` com `CHECK`.** Seria mais rápido
de ler, mas introduz um segundo estado que pode divergir da realidade — e a
anulação passaria a ter de o decrementar corretamente em todos os caminhos.
A secção 14 da especificação pede explicitamente para não guardar stock.

**Isolamento `SERIALIZABLE`.** Correto, mas obriga a lógica de repetição em
toda a aplicação e degrada sob a carga de um evento.
