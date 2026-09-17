# Distribuição de Kits

Aplicação web para gerir a distribuição de kits num evento: o operador
pesquisa o colaborador pelo número, pelo nome ou pelo email, confirma os
dados e entrega o kit. Não há limite por empresa: entrega-se sempre, e o que
cada empresa distribuiu é contado. Um colaborador recebe um kit e um só,
mesmo com vários operadores em simultâneo.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript estrito
- Tailwind CSS 4
- Supabase (PostgreSQL, Auth)
- Vitest + Testing Library

## Como as regras críticas são garantidas

A regra que não pode falhar — **um colaborador, um kit** — vive no
PostgreSQL, não em TypeScript. Verificar na aplicação "já recebeu? então
recusa" é uma condição de corrida: dois operadores leem "ainda não" ao mesmo
tempo e ambos entregam.

Duas defesas independentes:

| Defesa                                                                      | Impede                                    |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| Índice único parcial em `deliveries(employee_id) where reversed_at is null` | Duas entregas ativas ao mesmo colaborador |
| `idempotency_key` única por pesquisa                                        | Duplo clique e retries de rede            |

Provado com processos psql verdadeiramente paralelos em
`tests/sql/run-concurrency.sh`: 30 operadores em simultâneo sobre o mesmo
colaborador produzem exatamente uma entrega.

Detalhes em [`docs/decisions/0001-atomicidade-da-entrega.md`](docs/decisions/0001-atomicidade-da-entrega.md)
e, sobre o fim do limite por empresa, em
[`docs/decisions/0005-fim-do-limite-por-empresa.md`](docs/decisions/0005-fim-do-limite-por-empresa.md).

## Pré-requisitos

- Node.js 20.9 ou superior
- pnpm 10 ou superior
- Um projeto Supabase (ou a CLI do Supabase para correr localmente)

## Instalação

```bash
pnpm install
cp .env.example .env.local
```

Preencha `.env.local` com os dois valores do seu projeto Supabase
(**Project Settings → API**):

| Variável                        | Onde encontrar               |
| ------------------------------- | ---------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon` / `publishable` |

Não é preciso mais nada. Em particular, **a chave `service_role` não é
usada** e não deve ser configurada: toda a autorização assenta nas políticas
RLS e em funções `SECURITY DEFINER` invocadas com a sessão do próprio
utilizador. Não existe nenhum caminho de código que contorne o RLS.

Nenhuma das duas é um segredo, e nesta aplicação nem sequer chegam ao
browser: todo o acesso ao Supabase acontece no servidor. A segurança está nas
políticas RLS da base de dados.

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

1. **Empresas** — criar cada empresa com o nome. O código
   é gerado a partir do nome e serve para identificar a empresa nos ficheiros
   de importação; não muda quando a empresa é renomeada.
2. **Colaboradores** — adicionar um a um, ou importar um ficheiro (CSV ou
   Excel). O ficheiro é analisado primeiro; nada é escrito até confirmar. A
   listagem permite pesquisar por número, nome ou email, filtrar por empresa
   e por estado do kit, e editar qualquer colaborador. O email é obrigatório;
   o filtro "apenas sem email" encontra registos criados antes dessa regra.
3. **Distribuição** — os operadores entram e trabalham só neste ecrã.
4. **Depois do evento** — no Dashboard, "Exportar entregas (CSV)" descarrega
   quem recebeu kit: empresa, número, nome, email, data e operador. Cada linha
   da tabela tem também um link "CSV" com as entregas só dessa empresa, para
   enviar a cada uma a sua lista. Só administradores: o ficheiro leva nomes e
   emails de toda a gente. Entregas anuladas não aparecem.

### Formato do ficheiro de colaboradores

```csv
employee_number,name,company,email
12345,João Silva,Empresa A,joao.silva@empresa.pt
12346,Ana Costa,Empresa A,ana.costa@empresa.pt
98989,Rui Sousa,Empresa B,rui.sousa@empresa.pt
```

Todas as colunas são obrigatórias.

São aceites também:

- cabeçalhos em português: `número`, `nome`, `empresa`, `código`, `e-mail`;
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
- uma linha inválida não impede as restantes de serem importadas;
- uma linha sem email, ou com email malformado, é rejeitada.

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

### Pesquisar por nome ou email

O separador **Nome ou email** existe para quem chega sem saber o número. As
regras são diferentes das da pesquisa por número, e deliberadamente
restritivas:

- **email** — correspondência exata. Um email é um identificador: quem o
  escreve já o sabe, e a pesquisa parcial só serviria para descobrir moradas
  alheias;
- **nome** — parcial, mas só depois do primeiro espaço. Escrever `Ana` não
  sugere nada; `Ana ` já sugere. Exigir um nome próprio inteiro antes de
  listar seja quem for mantém a pesquisa útil sem a transformar num diretório
  de pessoas;
- no máximo 10 resultados, com o total real indicado;
- o email só aparece na lista quando foi ele que correspondeu.

As sugestões aparecem enquanto se escreve. Escolher um resultado abre o mesmo
cartão da pesquisa por número, e o `Enter` seguinte entrega o kit.

## Perfis

|                                      | Distribuidor | Administrador |
| ------------------------------------ | :----------: | :-----------: |
| Dashboard                            |      ✓       |       ✓       |
| Pesquisar colaborador e entregar kit |      ✓       |       ✓       |
| Listar, criar e editar colaboradores |      ✗       |       ✓       |
| Criar e editar empresas e limites    |      ✗       |       ✓       |
| Importar colaboradores               |      ✗       |       ✓       |
| Anular entregas                      |      ✗       |       ✓       |
| Consultar histórico                  |      ✗       |       ✓       |
| Gerir utilizadores                   |      ✗       |       ✓       |

Os distribuidores acedem a `/dashboard` e `/distribuicao`. Tudo o que está em
`/admin` exige perfil de administrador — a fronteira de permissões coincide
com a estrutura do URL, e é verificada no servidor em cada pedido.

O email do colaborador nunca é mostrado no ecrã de distribuição: durante o
evento só se mostram nome, número, empresa e estado do kit.

O distribuidor não consegue ler a tabela de colaboradores: se conseguisse,
podia enumerar toda a base de pessoas pela API do Supabase. A pesquisa do
ecrã de distribuição passa por uma função que exige correspondência exata
do número e devolve no máximo uma linha.

## Indexação por motores de busca

A aplicação declara `noindex` de três formas, porque cada uma cobre o que as
outras não cobrem:

| Onde                      | Cobre                                      |
| ------------------------- | ------------------------------------------ |
| Meta `robots` no `<head>` | Páginas HTML                               |
| Cabeçalho `X-Robots-Tag`  | Tudo, incluindo imagens e respostas de API |
| `robots.txt`              | Instruções de rastreio                     |

O `robots.txt` **não** tem `Disallow: /`, e é deliberado. O robots.txt
controla o rastreio, não a indexação: com `Disallow: /` o motor de busca nunca
chega a buscar as páginas e por isso nunca lê o `noindex` — e um URL
descoberto a partir de uma ligação externa pode acabar listado nos resultados
mesmo assim. Permitindo o rastreio, a diretiva é lida e as páginas ficam
efetivamente de fora.

## Utilizadores

A área **Utilizadores**, só para administradores, lista as contas e permite
trocar o perfil e desativar ou reativar cada uma.

Nunca é possível ficar sem administradores ativos: a última despromoção ou
desativação que deixaria a aplicação sem ninguém capaz de a gerir é recusada.
A verificação vive na base de dados, com a linha bloqueada — verificá-la na
aplicação seria uma condição de corrida entre dois administradores a
despromoverem-se ao mesmo tempo.

Uma conta desativada perde o acesso imediatamente, sem ter de terminar sessão.

### Criar contas

Criar contas a partir da aplicação exige a variável
`SUPABASE_SERVICE_ROLE_KEY`, porque só a API de administração do Supabase Auth
cria utilizadores. É **opcional**: sem ela a aplicação funciona na íntegra e
as contas criam-se em **Authentication → Users** no painel do Supabase,
aparecendo na lista como distribuidores.

A opção é sua. Essa chave contorna todas as políticas de segurança da base de
dados, por isso não é exigida só por comodidade. Se a configurar, é usada
exclusivamente para criar contas, a partir de uma rota já restrita a
administradores.

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

## Desativar temporariamente a autenticação

Para demonstrações e desenvolvimento é possível entrar automaticamente, sem
passar pelo ecrã de login. Defina as duas variáveis:

```bash
AUTH_BYPASS_EMAIL=conta@exemplo.pt
AUTH_BYPASS_PASSWORD=a-palavra-passe-dessa-conta
```

Para voltar a exigir login, apague-as e faça deploy outra vez.

> **Isto não remove a autenticação — automatiza-a.** A segurança desta
> aplicação vive na base de dados: todas as funções SQL verificam
> `auth.uid()` e o RLS filtra todas as leituras. Esconder o ecrã de login não
> daria uma aplicação sem autenticação, daria uma aplicação avariada. O que
> estas variáveis fazem é iniciar sessão automaticamente com a conta
> indicada.
>
> **Enquanto estiver ativo, qualquer pessoa que conheça o endereço entra com
> as permissões dessa conta** — incluindo ver os dados dos colaboradores e,
> se for uma conta de administrador, anular entregas. Nunca usar em produção
> com dados reais.
>
> Quando está ativo, aparece um aviso vermelho permanente no topo de todas as
> páginas e o botão "Sair" desaparece (o proxy voltaria a iniciar sessão no
> pedido seguinte).

## Diagnosticar falhas de login

A mensagem "Email ou palavra-passe incorretos" é deliberadamente vaga: se
distinguisse credenciais erradas de conta inexistente, permitiria descobrir
que emails estão registados. O motivo real fica nos logs do servidor.

Para diagnosticar a partir da base de dados, execute
[`docs/operations/diagnosticar-login.sql`](docs/operations/diagnosticar-login.sql)
no SQL Editor. A causa mais frequente é a conta ter sido criada sem ligar
**Auto Confirm User**;
[`docs/operations/corrigir-login.sql`](docs/operations/corrigir-login.sql) tem
a correção para cada caso.

Para não andar a adivinhar,
[`docs/operations/repor-conta-admin.sql`](docs/operations/repor-conta-admin.sql)
trata das três causas de uma só vez: define uma palavra-passe nova, confirma o
email e garante o perfil de administrador ativo. Basta alterar o email e a
palavra-passe nas duas primeiras linhas.
