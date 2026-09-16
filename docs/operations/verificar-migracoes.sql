-- =============================================================================
-- Verificação pós-migração.
--
-- Cole no SQL Editor do Supabase depois de aplicar as migrações. Todas as
-- linhas devem mostrar ✓. Não escreve nada — é só leitura.
-- =============================================================================
select 'Tabelas' as verificacao,
       count(*) || ' de 5' as resultado,
       case when count(*) = 5 then '✓' else '✗ FALTAM' end as estado
  from pg_tables
 where schemaname = 'public'
   and tablename in ('profiles','companies','employees','deliveries','delivery_logs')

union all
select 'Vistas',
       count(*) || ' de 3',
       case when count(*) = 3 then '✓' else '✗ FALTAM' end
  from pg_views
 where schemaname = 'public'
   and viewname in ('company_stock','delivery_history','employee_list')

union all
select 'Funções de negócio',
       count(*) || ' de 17',
       case when count(*) = 17 then '✓' else '✗ FALTAM' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('deliver_kit','reverse_delivery','save_company',
                     'import_employees','find_employee_for_delivery',
                     'is_admin','is_active_user','handle_new_user',
                     'stock_snapshot','delivery_payload','app_error',
                     'touch_updated_at','derive_company_code','save_employee',
                     'set_user_role','set_user_active','active_admin_count')

union all
select 'RLS ativo em todas as tabelas',
       count(*) || ' de 5',
       case when count(*) = 5 then '✓' else '✗ FALTA ATIVAR' end
  from pg_tables
 where schemaname = 'public' and rowsecurity
   and tablename in ('profiles','companies','employees','deliveries','delivery_logs')

union all
select 'Perfis de utilizador',
       string_agg(distinct role, ', ' order by role),
       case when count(*) filter (where role not in ('admin','distributor')) = 0
            then '✓' else '✗ PAPEL DESCONHECIDO' end
  from public.profiles

union all
select 'Email obrigatório em colaboradores',
       count(*) || ' sem email',
       case when count(*) = 0 then '✓' else '⚠ corrigir na página Colaboradores' end
  from public.employees where email is null

union all
select 'Políticas RLS',
       count(*) || ' de 8',
       case when count(*) = 8 then '✓' else '✗ FALTAM' end
  from pg_policies where schemaname = 'public'

union all
select 'Índice único da entrega ativa',
       coalesce(max(indexname), '(ausente)'),
       case when count(*) = 1 then '✓' else '✗ CRÍTICO' end
  from pg_indexes
 where schemaname = 'public'
   and indexname = 'deliveries_one_active_per_employee_idx'

union all
select 'Trigger de criação de perfil',
       coalesce(max(tgname), '(ausente)'),
       case when count(*) = 1 then '✓' else '✗ CRÍTICO' end
  from pg_trigger
 where tgname = 'on_auth_user_created' and not tgisinternal

order by 1;
