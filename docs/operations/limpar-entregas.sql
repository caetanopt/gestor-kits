-- =============================================================================
-- Pôr o evento a zero: apagar as entregas e o histórico.
--
-- Para depois do ensaio: tira todas as entregas de teste (ativas e anuladas)
-- e o histórico, e deixa a aplicação exatamente como antes da primeira
-- entrega — com a lista de colaboradores, as empresas e as contas intactas.
--
-- O QUE APAGA
--   * public.delivery_logs  — o histórico todo
--   * public.deliveries     — todas as entregas, ativas e anuladas
--
-- O QUE NÃO TOCA
--   * public.employees      — os colaboradores importados ficam
--   * public.companies      — as empresas ficam
--   * public.profiles       — as contas ficam
--
-- A ORDEM
--   Histórico primeiro: delivery_logs referencia deliveries. Com ON DELETE SET
--   NULL não bloquearia, mas deixaria linhas órfãs pelo meio da transação.
--
-- Isto não tem anulação, exceto pelas cópias de segurança diárias do plano
-- Pro (Database → Backups no painel do Supabase).
-- =============================================================================

begin;

do $$
declare
  v_logs       integer;
  v_entregas   integer;
  v_ativas     integer;
  v_employees  integer;
  v_companies  integer;
  v_profiles   integer;
begin
  select count(*) into v_logs      from public.delivery_logs;
  select count(*) into v_entregas  from public.deliveries;
  select count(*) into v_ativas    from public.deliveries where reversed_at is null;
  select count(*) into v_employees from public.employees;
  select count(*) into v_companies from public.companies;
  select count(*) into v_profiles  from public.profiles;

  raise notice 'ANTES: % entregas (% ativas), % linhas de histórico.',
    v_entregas, v_ativas, v_logs;

  delete from public.delivery_logs;
  delete from public.deliveries;

  -- Rede de segurança: se alguma destas contas mudou, aborta tudo.
  if (select count(*) from public.employees) <> v_employees then
    raise exception 'Os colaboradores foram afetados. Nada foi apagado.';
  end if;
  if (select count(*) from public.companies) <> v_companies then
    raise exception 'As empresas foram afetadas. Nada foi apagado.';
  end if;
  if (select count(*) from public.profiles) <> v_profiles then
    raise exception 'As contas foram afetadas. Nada foi apagado.';
  end if;

  raise notice 'DEPOIS: 0 entregas, 0 linhas de histórico. % colaboradores, % empresas e % contas intactos.',
    v_employees, v_companies, v_profiles;
end $$;

commit;

select
  (select count(*) from public.deliveries)     as entregas,
  (select count(*) from public.delivery_logs)  as historico,
  (select count(*) from public.employees)      as colaboradores_intactos,
  (select count(*) from public.companies)      as empresas_intactas,
  (select count(*) from public.profiles)       as contas_intactas;
