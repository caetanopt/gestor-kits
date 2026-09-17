-- =============================================================================
-- Confirmação da migração 0011 (fim do limite por empresa).
--
-- O `verificar-migracoes.sql` conta o que deve existir. Este ficheiro confirma
-- a outra metade, que é onde uma migração falha em silêncio: que o que devia
-- desaparecer desapareceu, e que o que devia ficar intacto ficou.
--
-- Todas as linhas devem dar ✓. Numa base de dados ainda sem a 0011, seis
-- delas acusam ✗ — foi assim que este ficheiro foi verificado.
--
-- Executar no SQL Editor do Supabase, no projeto da aplicação.
-- =============================================================================
-- A vista company_totals, criada pela 0011, foi substituída pela função
-- company_totals_list na 0014. O que a 0011 introduziu — totais por empresa
-- sem limite — continua a ter de existir; mudou o sítio.
select 'Totais por empresa existem' as verificacao,
       coalesce((select 'company_totals_list' from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='company_totals_list'
                  limit 1), '—') as valor,
       case when exists (select 1 from pg_proc p
                           join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname='public' and p.proname='company_totals_list')
            then '✓' else '✗ FALTA' end as estado
union all
select 'Vista company_stock removida',
       coalesce(to_regclass('public.company_stock')::text, 'removida'),
       case when to_regclass('public.company_stock') is null then '✓' else '✗ AINDA EXISTE' end
union all
select 'Função totals_snapshot existe',
       coalesce((select 'sim' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='totals_snapshot' limit 1), '—'),
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname='public' and p.proname='totals_snapshot')
            then '✓' else '✗ FALTA' end
union all
select 'Função stock_snapshot removida',
       coalesce((select 'ainda existe' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='stock_snapshot' limit 1), 'removida'),
       case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname='public' and p.proname='stock_snapshot')
            then '✓' else '✗ AINDA EXISTE' end
union all
select 'save_company com 3 argumentos (só uma versão)',
       (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='save_company'),
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='save_company') = 1
            and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname='public' and p.proname='save_company'
                               and pg_get_function_identity_arguments(p.oid) like '%integer%')
            then '✓' else '✗ VERSÃO ANTIGA PRESENTE' end
union all
select 'deliver_kit já não verifica limite',
       case when (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='deliver_kit') like '%NO_STOCK%'
            then 'ainda verifica' else 'sem limite' end,
       case when (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='deliver_kit') not like '%NO_STOCK%'
            then '✓' else '✗ VERSÃO ANTIGA' end
union all
select 'Coluna allocated_kits preservada (adormecida)',
       coalesce((select 'presente' from information_schema.columns
                  where table_schema='public' and table_name='companies'
                    and column_name='allocated_kits'), '—'),
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='companies'
                            and column_name='allocated_kits')
            then '✓' else '✗ APAGADA' end
union all
select 'Índice da entrega única intacto',
       coalesce((select indexname from pg_indexes
                  where schemaname='public'
                    and indexname='deliveries_one_active_per_employee_idx'), '—'),
       case when exists (select 1 from pg_indexes
                          where schemaname='public'
                            and indexname='deliveries_one_active_per_employee_idx')
            then '✓' else '✗ FALTA' end
order by 1;
