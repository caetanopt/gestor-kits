-- =============================================================================
-- Limpar colaboradores, entregas e histórico, para uma importação de raiz.
--
-- ANTES DE CORRER: exporte a lista atual.
--   Dashboard → "Exportar lista (CSV)". É a sua única forma de voltar atrás:
--   isto não tem anulação.
--
-- O QUE APAGA
--   * public.employees      — todos os colaboradores
--   * public.deliveries     — todas as entregas, incluindo as anuladas
--   * public.delivery_logs  — o histórico
--
-- O QUE NÃO TOCA
--   * public.companies      — as empresas ficam
--   * public.profiles       — as contas de utilizador ficam
--   * auth.users            — os logins ficam
--
-- PORQUE ESTA ORDEM
--   `deliveries.employee_id` é ON DELETE RESTRICT: enquanto houver uma entrega,
--   o colaborador não se apaga. As entregas têm de sair primeiro.
--
--   `delivery_logs.employee_id` é ON DELETE SET NULL: apagar colaboradores NÃO
--   apaga o histórico, apenas lhe corta a referência. As linhas ficariam na
--   página Histórico com o nome e o número em branco. Por isso o histórico é
--   apagado explicitamente, e não deixado ao encargo das chaves estrangeiras.
--
-- Correr no SQL Editor do Supabase, no projeto da aplicação. Verifique o
-- projeto em /api/health (campo projectRef) antes de correr.
-- =============================================================================

begin;

do $$
declare
  v_employees integer;
  v_deliveries integer;
  v_logs integer;
  v_companies integer;
  v_profiles integer;
begin
  select count(*) into v_employees  from public.employees;
  select count(*) into v_deliveries from public.deliveries;
  select count(*) into v_logs       from public.delivery_logs;
  select count(*) into v_companies  from public.companies;
  select count(*) into v_profiles   from public.profiles;

  raise notice 'ANTES: % colaboradores, % entregas, % linhas de histórico',
    v_employees, v_deliveries, v_logs;
  raise notice 'INTACTOS: % empresas, % contas', v_companies, v_profiles;

  -- Histórico primeiro, para não ficarem linhas órfãs com o colaborador a
  -- null (a coluna é ON DELETE SET NULL, não CASCADE).
  --
  -- Isto apaga o histórico TODO, incluindo o registo de quem criou as
  -- empresas e as contas. Para poupar esses, troque a linha seguinte por:
  --
  --   delete from public.delivery_logs
  --    where action in ('DELIVERED','DELIVERY_REVERSED','EMPLOYEE_CREATED',
  --                     'EMPLOYEE_UPDATED','EMPLOYEES_IMPORTED');
  --
  delete from public.delivery_logs;

  -- Entregas antes de colaboradores: a chave estrangeira é RESTRICT.
  delete from public.deliveries;

  delete from public.employees;

  -- Rede de segurança: se alguma destas contas mudou, algo correu mal e é
  -- melhor abortar do que descobrir depois.
  if (select count(*) from public.companies) <> v_companies then
    raise exception 'As empresas foram afetadas. Nada foi apagado.';
  end if;
  if (select count(*) from public.profiles) <> v_profiles then
    raise exception 'As contas foram afetadas. Nada foi apagado.';
  end if;

  raise notice 'DEPOIS: % colaboradores, % entregas, % linhas de histórico',
    (select count(*) from public.employees),
    (select count(*) from public.deliveries),
    (select count(*) from public.delivery_logs);
end $$;

commit;

-- Confirmação final. As três primeiras colunas têm de estar a zero; as duas
-- últimas têm de ter os mesmos números de antes.
select
  (select count(*) from public.employees)      as colaboradores,
  (select count(*) from public.deliveries)     as entregas,
  (select count(*) from public.delivery_logs)  as historico,
  (select count(*) from public.companies)      as empresas_intactas,
  (select count(*) from public.profiles)       as contas_intactas;
