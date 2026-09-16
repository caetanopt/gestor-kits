# 0004 — Cortar as idas ao Supabase no ecrã de distribuição

## Contexto

A pesquisa por nome faz um pedido por cada pausa na escrita. Cada pedido
custava quatro idas ao Supabase, em série:

1. o proxy chamava `auth.getUser()`;
2. o route handler chamava `requireApiUser()`, que chama `auth.getUser()`
   outra vez;
3. o mesmo `requireApiUser()` lia a linha de `profiles`;
4. finalmente, a função de pesquisa.

Medida contra um cluster PostgreSQL real com 5000 colaboradores, a consulta
demora entre 0,5 e 3 ms — incluindo o primeiro acesso, sem índices
dedicados. Nada do que se notava era base de dados. Era rede: três viagens a
preceder uma consulta de milissegundos.

## Decisão

Cortar as duas viagens que não decidiam nada, sem retirar nenhuma
verificação.

**O proxy deixa de correr em `/api/*`.** Já não redirecionava rotas de API
(devolveria HTML a quem espera JSON), e a renovação de sessão que fazia é
feita na mesma pelo route handler: o `getUser()` que este chama renova o
token, e o `setAll` do cliente de servidor grava os cookies atualizados na
resposta — coisa que só falha em Server Components, não em Route Handlers.

**As rotas de distribuição usam `requireApiSession()` em vez de
`requireApiUser()`.** A diferença é uma leitura de `profiles`, que existia
para confirmar `is_active`. Essa confirmação não desaparece: muda para o
único sítio onde é decisiva. `find_employee_for_delivery`,
`search_employees_for_delivery` e `deliver_kit` começam todas por
`is_active_user()`, dentro da mesma transação que lê os dados — enquanto a
do route handler respondia a partir de uma leitura anterior à consulta, e
podia já estar desatualizada quando a consulta acontecesse.

O route handler continua a exigir sessão válida. O que deixou de fazer foi
perguntar duas vezes a mesma coisa.

## Consequências

- Cada pesquisa passa de quatro idas ao Supabase para duas.
- O atraso das sugestões desce de 250 ms para 120 ms: com o pedido mais
  barato, era o atraso que dominava a espera.
- `mapPostgrestError` passa a traduzir 42501 e PGRST301/302 em
  `UNAUTHENTICATED`. Sem isso, um pedido cuja sessão tenha expirado daria
  500 e o operador veria "o servidor respondeu de forma inesperada" em vez
  de "a sessão expirou".
- Em modo de autenticação desativada, uma chamada direta a uma rota de API
  sem passar antes por uma página deixa de iniciar sessão automaticamente —
  esse início de sessão acontecia no proxy. Não afeta a aplicação, que
  carrega sempre uma página primeiro.
- As rotas de administração mantêm `requireApiAdmin()`: não são usadas em
  ciclo, e várias precisam mesmo de saber quem é o utilizador.

## Alternativas consideradas

**Tirar a verificação do route handler e deixar só a da base de dados.**
Defensável — a função SQL recusa `anon` e conta desativada de qualquer
forma — mas deixava o handler sem nenhuma verificação visível, e quem
lesse o ficheiro a seguir não tinha como saber que a porta estava fechada
noutro sítio. Poupava uma viagem das duas que restam.

**Verificar o cookie de sessão sem ir à rede.** Mais rápido, mas depende do
nome que o `@supabase/ssr` dá ao cookie. Se esse nome mudasse, a aplicação
recusava toda a gente — mau risco a correr por uma viagem.

**Índices de pesquisa (`pg_trgm`) e uma só passagem em vez de duas.** Não se
faz o que não é preciso: a medição mostra que a consulta não é o problema.
Fica registado para o dia em que o volume mudar isso.
