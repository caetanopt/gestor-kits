# 0006 — Totais por empresa visíveis ao distribuidor

## Contexto

O dashboard mostrava `Colaboradores 0` a quem entrasse com uma conta de
distribuidor, com 2253 colaboradores na base de dados. As entregas e as
empresas apareciam corretamente; só os colaboradores é que vinham a zero.

Não era um erro de contagem. A vista `company_totals` foi criada com
`security_invoker = on`, ou seja, corre com as permissões de quem a consulta.
O RLS de `employees` reserva a tabela aos administradores (política
`employees_select_admin`, migração 0002), por decisão explícita: quem
distribui não deve poder listar nomes e emails de toda a gente. Resultado: a
subconsulta que conta colaboradores via zero linhas e devolvia zero.

## Decisão

Substituir a vista por `public.company_totals_list()`, uma função
`SECURITY DEFINER` que devolve as mesmas cinco colunas — id, nome, código,
entregues e número de colaboradores — a qualquer conta ativa.

A restrição de `employees` fica exatamente como estava. O que passa a existir
é um caminho que devolve **contagens** e nunca linhas: nome, email e número de
colaborador não aparecem em lado nenhum do resultado.

É o mesmo padrão já usado no ecrã de distribuição, onde
`find_employee_for_delivery` e `search_employees_for_delivery` devolvem o
colaborador certo sem dar acesso à tabela.

A vista é removida na mesma migração. Deixou de ter consumidores, e mantê-la
seria ficar com duas definições do mesmo cálculo a divergir com o tempo.

## Alternativa rejeitada

Acrescentar uma política de SELECT em `employees` para contas ativas. Resolvia
o número, mas dava a qualquer distribuidor a lista completa de colaboradores —
uma troca muito maior do que o problema.

## Verificação

Numa base com as catorze migrações aplicadas:

| Quem             | `company_totals_list()`           | `select * from employees` |
| ---------------- | --------------------------------- | ------------------------- |
| Administrador    | 3 e 1 colaboradores, 1 entregue   | as linhas todas           |
| Distribuidor     | os mesmos números                 | 0 linhas                  |
| Conta desativada | `INACTIVE_ACCOUNT`                | —                         |
| Sem sessão       | execução recusada pelo PostgreSQL | —                         |

Os testes em `tests/unit/totais-por-empresa.test.ts` guardam as duas metades:
que os totais vêm da função, e que a política de `employees` continua
restrita a administradores.

## Reversão

Recriar a vista a partir da migração 0011 e voltar a lê-la em
`listCompanyTotals`. A função pode ficar; não tem efeitos sobre o esquema.
