-- =============================================================================
-- Apagar o histórico (public.delivery_logs).
--
-- O QUE APAGA
--   * o histórico todo: entregas, anulações, importações, criação de
--     empresas e de contas — tudo o que aparece na página Histórico.
--
-- O QUE NÃO TOCA
--   * as entregas (public.deliveries)
--   * colaboradores, empresas e contas
--
-- UMA TRAVA DE SEGURANÇA
--   Se houver entregas ATIVAS, o script aborta sem apagar nada. Apagar o
--   histórico deixava essas pessoas marcadas como "já recebeu kit" sem
--   nenhuma linha a explicar quando nem por quem — no dia, um operador
--   recusava o kit a alguém e ninguém saberia dizer porquê.
--
--   Se as entregas ativas forem de teste, use antes limpar-entregas.sql,
--   que apaga as entregas e o histórico juntos.
--
-- Isto não tem anulação, exceto pelas cópias de segurança diárias do plano
-- Pro (Database → Backups no painel do Supabase).
-- =============================================================================

begin;

do $$
declare
  v_logs    integer;
  v_ativas  integer;
begin
  select count(*) into v_logs   from public.delivery_logs;
  select count(*) into v_ativas from public.deliveries where reversed_at is null;

  raise notice 'Histórico: % linhas. Entregas ativas: %.', v_logs, v_ativas;

  if v_ativas > 0 then
    raise exception
      'Há % entrega(s) ativa(s). Apagar o histórico deixava essas pessoas marcadas como "já recebeu" sem explicação. Nada foi apagado. Se forem entregas de teste, use limpar-entregas.sql.',
      v_ativas;
  end if;

  delete from public.delivery_logs;

  raise notice 'Histórico apagado: % linhas.', v_logs;
end $$;

commit;

select
  (select count(*) from public.delivery_logs)                          as historico,
  (select count(*) from public.deliveries where reversed_at is null)   as entregas_ativas,
  (select count(*) from public.employees)                              as colaboradores_intactos,
  (select count(*) from public.companies)                              as empresas_intactas,
  (select count(*) from public.profiles)                               as contas_intactas;
