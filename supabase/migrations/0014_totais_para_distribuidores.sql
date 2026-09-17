-- =============================================================================
-- O distribuidor passa a ver quantos colaboradores há e quantos faltam.
--
-- O dashboard mostrava "Colaboradores 0" a quem entrasse como distribuidor,
-- com 2253 colaboradores na base de dados. Não era um erro de contagem: a
-- vista `company_totals` é `security_invoker`, e o RLS de `employees` só
-- deixa os administradores ler a tabela. O distribuidor via as entregas
-- (permitidas) e nenhum colaborador.
--
-- A restrição é deliberada e mantém-se: quem distribui não deve poder listar
-- nomes e emails de toda a gente. O que muda é haver um caminho que devolve
-- *só os totais* — números por empresa, sem uma única linha de `employees`.
-- É o mesmo padrão já usado na distribuição: uma função SECURITY DEFINER que
-- verifica a conta e devolve exatamente o que a interface precisa.
--
-- A vista deixa de ter consumidores e é removida, para não ficarem duas
-- definições do mesmo cálculo a divergir. Para reverter, basta recriá-la a
-- partir da migração 0011 e voltar a ler dela em listCompanyTotals.
-- =============================================================================

create or replace function public.company_totals_list()
returns table (
  id             uuid,
  name           text,
  code           text,
  delivered      integer,
  employee_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_active_user() then
    perform public.app_error('INACTIVE_ACCOUNT');
  end if;

  return query
  select
    c.id,
    c.name,
    c.code,
    d.delivered,
    e.employee_count
  from public.companies c
  left join lateral (
    select count(*)::integer as delivered
    from public.deliveries dd
    where dd.company_id = c.id and dd.reversed_at is null
  ) d on true
  left join lateral (
    select count(*)::integer as employee_count
    from public.employees ee
    where ee.company_id = c.id
  ) e on true
  order by c.name;
end;
$$;

comment on function public.company_totals_list() is
  'Kits entregues e colaboradores por empresa, para qualquer conta ativa. '
  'SECURITY DEFINER: devolve contagens e nunca linhas de employees, que o '
  'RLS continua a reservar aos administradores.';

revoke execute on function public.company_totals_list() from public, anon;
grant execute on function public.company_totals_list() to authenticated;

drop view if exists public.company_totals;
