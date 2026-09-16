# Distribuição de Kits

Aplicação web para gerir a distribuição de kits num evento: o operador
pesquisa o colaborador pelo número, confirma os dados e entrega o kit. O
stock de cada empresa é descontado automaticamente e nunca pode ficar
negativo nem haver entregas duplicadas, mesmo com vários operadores em
simultâneo.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript estrito
- Tailwind CSS 4
- Supabase (PostgreSQL, Auth)
- Vitest + Testing Library

## Como as regras críticas são garantidas

As regras que não podem falhar vivem no PostgreSQL, não em TypeScript.
Verificar na aplicação "há stock? então entrega" é uma condição de corrida:
dois operadores leem 119/120 ao mesmo tempo e ambos entregam.

Três defesas independentes:

| Defesa                                                                      | Impede                                    |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| Índice único parcial em `deliveries(employee_id) where reversed_at is null` | Duas entregas ativas ao mesmo colaborador |
| `SELECT ... FOR UPDATE` na empresa antes de contar o stock                  | Stock negativo                            |
| `idempotency_key` única por pesquisa                                        | Duplo clique e retries de rede            |

Detalhes em [`docs/decisions/0001-atomicidade-da-entrega.md`](docs/decisions/0001-atomicidade-da-entrega.md).

## Pré-requisitos

- Node.js 20.9 ou superior
- pnpm 10 ou superior
- Um projeto Supabase (ou a CLI do Supabase para correr localmente)

## Instalação

```bash
pnpm install
cp .env.example .env.local
```

Preencha `.env.local` com os valores do seu projeto Supabase
(**Project Settings → API**):

| Variável                        | Onde encontrar                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                                                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon` / publishable                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Chave `service_role` — **nunca** a exponha ao browser nem a coloque no repositório |

## Base de dados

### Supabase alojado

Aplique as migrações por ordem, no **SQL Editor** do painel Supabase:

```
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_auth_and_rls.sql
supabase/migrations/0003_delivery_functions.sql
supabase/migrations/0004_import_employees.sql
supabase/migrations/0005_history_view.sql
```

Em alternativa, para uma base de dados nova, cole de uma só vez o ficheiro
[`docs/operations/todas-as-migracoes.sql`](docs/operations/todas-as-migracoes.sql),
que é a concatenação das cinco migrações pela ordem correta.

Se tiver a CLI ligada ao projeto, prefira:

```bash
pnpm exec supabase db push
```

A CLI regista o que já foi aplicado; o ficheiro combinado não, por isso só
deve ser usado uma vez, numa base de dados nova.

### Supabase local

```bash
pnpm db:start     # precisa de Docker
pnpm db:reset     # aplica migrações + supabase/seed.sql
```

## Criar o primeiro administrador

O registo automático atribui sempre o perfil `operator`. Isto é
deliberado: promover automaticamente o primeiro utilizador seria uma via
de escalada de privilégios se o registo estiver aberto.

1. Crie o utilizador em **Authentication → Users → Add user** no painel
   Supabase (ou pelo registo normal).
2. Promova-o a administrador no **SQL Editor**:

```sql
update public.profiles
   set role = 'admin'
 where email = 'o-seu@email.pt';
```

Os operadores do evento são criados da mesma forma, ficando com o perfil
`operator` por omissão.

> Recomenda-se desligar o registo público em
> **Authentication → Providers → Email → Allow new users to sign up**
> assim que as contas do evento estiverem criadas.

## Desenvolvimento

```bash
pnpm dev          # http://localhost:3000
```

## Preparar um evento

1. **Empresas** — criar cada empresa com o respetivo limite de kits.
2. **Importar** — carregar o ficheiro de colaboradores (CSV ou Excel).
   O ficheiro é analisado primeiro; nada é escrito até confirmar.
3. **Distribuição** — os operadores entram e trabalham só neste ecrã.

### Formato do ficheiro de colaboradores

```csv
employee_number,name,company
12345,João Silva,Empresa A
12346,Ana Costa,Empresa A
98989,Rui Sousa,Empresa B
```

São aceites também:

- cabeçalhos em português: `número`, `nome`, `empresa`, `código`;
- as colunas por qualquer ordem, e colunas extra são ignoradas;
- separador `;` (o predefinido do Excel português) e BOM UTF-8;
- ficheiros `.xlsx` (lê a primeira folha);
- a empresa identificada por nome **ou** por código, sem distinguir
  acentos nem maiúsculas.

Regras da importação:

- a empresa tem de existir — linhas com empresas desconhecidas são
  rejeitadas, nunca criam a empresa em silêncio;
- números repetidos no ficheiro e colaboradores já existentes são
  reportados com o número da linha e ignorados;
- uma linha inválida não impede as restantes de serem importadas.

> **Zeros à esquerda:** se a coluna do número estiver formatada como
> número numa folha de Excel, o `012345` é guardado como `12345` e os
> zeros perdem-se antes de o ficheiro chegar à aplicação. Formate a
> coluna como **texto**, ou exporte em CSV.

## Fluxo do operador

```
número → Enter → confirmar → Enter → próximo
```

O foco fica sempre no campo de pesquisa e o Enter tem dois significados:

- **campo com texto** → pesquisa;
- **campo vazio** → entrega o kit do cartão visível.

Isto é deliberado. Os leitores de crachá escrevem os dígitos e terminam
com Enter; se o foco estivesse no botão, ler o crachá seguinte entregaria
um kit à pessoa errada. Ver
[`docs/decisions/0002-enter-nao-entrega-por-acidente.md`](docs/decisions/0002-enter-nao-entrega-por-acidente.md).

Atalhos: `Enter` pesquisa/entrega · `Esc` limpa.

## Perfis

|                                      | Operador | Administrador |
| ------------------------------------ | :------: | :-----------: |
| Pesquisar colaborador e entregar kit |    ✓     |       ✓       |
| Ver stock das empresas               |    ✓     |       ✓       |
| Listar colaboradores                 |    ✗     |       ✓       |
| Criar e editar empresas e limites    |    ✗     |       ✓       |
| Importar colaboradores               |    ✗     |       ✓       |
| Anular entregas                      |    ✗     |       ✓       |
| Consultar histórico                  |    ✗     |       ✓       |

O operador não consegue ler a tabela de colaboradores: se conseguisse,
podia enumerar toda a base de pessoas pela API do Supabase. A pesquisa do
ecrã de distribuição passa por uma função que exige correspondência exata
do número e devolve no máximo uma linha.

## Testes

```bash
pnpm check              # lint + typecheck + formatação + testes unitários
pnpm test               # apenas os testes unitários
```

As regras críticas são testadas contra um PostgreSQL verdadeiro, não
contra mocks:

```bash
PGHOST_DIR=/caminho/para/socket pnpm test:sql          # regras de negócio e RLS
PGHOST_DIR=/caminho/para/socket pnpm test:concurrency  # concorrência real
```

Os testes de concorrência lançam processos `psql` em paralelo e verificam,
entre outros casos, que 60 tentativas simultâneas sobre 10 kits entregam
exatamente 10.

Para levantar um PostgreSQL descartável sem Docker:

```bash
initdb -D /tmp/pgkits -U postgres --auth=trust
pg_ctl -D /tmp/pgkits -o "-k /tmp/pgkits -c listen_addresses=''" start
PGHOST_DIR=/tmp/pgkits pnpm test:sql
```

## Fora do âmbito desta versão

Exportação para CSV/Excel, gestão de utilizadores pela interface, edição
individual de colaboradores e modo offline não fazem parte deste MVP.

## Estrutura

```
app/
  (app)/                 área autenticada
    distribuicao/        ecrã do operador
    admin/               dashboard, empresas, importar, histórico
  api/                   route handlers
components/
  distribution/          ecrã de entrega
  admin/                 gestão e histórico
  ui/                    componentes base
lib/
  auth/                  sessão e guardas
  supabase/              clientes browser / servidor / admin
  import/                leitura e validação de ficheiros
  validation/            esquemas Zod
  api/                   envelope de resposta e códigos de erro
server/use-cases/        lógica aplicacional
supabase/migrations/     esquema versionado
tests/
  unit/                  Vitest
  sql/                   regras de negócio e concorrência
docs/decisions/          decisões de arquitetura
```
