-- =============================================================================
-- Autorização: aprovisionamento de perfis + Row Level Security.
--
-- Princípio: o cliente NUNCA escreve diretamente nestas tabelas. Todas as
-- mutações passam por funções SECURITY DEFINER (migração 0003) invocadas a
-- partir do servidor. As políticas abaixo são defesa em profundidade e
-- controlam o que cada perfil consegue LER.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções auxiliares de autorização
--
-- São SECURITY DEFINER de propósito: ao contornarem o RLS evitam a recursão
-- infinita que aconteceria se uma política sobre `profiles` consultasse
-- `profiles`.
-- -----------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role = 'admin'
  );
$$;

comment on function public.is_admin is
  'SECURITY DEFINER para evitar recursão de RLS nas políticas sobre profiles.';

-- -----------------------------------------------------------------------------
-- Aprovisionamento automático do perfil
--
-- Novo utilizador em auth.users ganha um perfil com o papel 'operator'.
-- A promoção a administrador é deliberada e feita por SQL ou por outro
-- administrador — nunca automática, para não abrir uma via de escalada de
-- privilégios via registo.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'operator'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.companies     enable row level security;
alter table public.employees     enable row level security;
alter table public.deliveries    enable row level security;
alter table public.delivery_logs enable row level security;

-- profiles -------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- companies ------------------------------------------------------------------
-- Qualquer utilizador ativo lê empresas: o operador precisa de ver o stock.
create policy companies_select_active on public.companies
  for select to authenticated
  using (public.is_active_user());

create policy companies_write_admin on public.companies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- employees ------------------------------------------------------------------
-- ⚠️ Deliberadamente restrito a administradores.
--
-- O operador NÃO consegue ler a tabela de colaboradores diretamente: isso
-- permitir-lhe-ia enumerar toda a base de dados de pessoas através da API
-- REST do Supabase. A pesquisa do ecrã de distribuição é servida pela função
-- find_employee_for_delivery(), que devolve no máximo uma linha e exige
-- correspondência exata do número (secção 30 da especificação).
create policy employees_select_admin on public.employees
  for select to authenticated
  using (public.is_admin());

create policy employees_write_admin on public.employees
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- deliveries -----------------------------------------------------------------
-- Leitura para utilizadores ativos (necessária para a contagem de stock em
-- company_stock). Não contém dados pessoais — apenas identificadores e datas.
-- Não existe qualquer política de INSERT/UPDATE/DELETE: as entregas só podem
-- ser criadas ou anuladas através das funções SECURITY DEFINER.
create policy deliveries_select_active on public.deliveries
  for select to authenticated
  using (public.is_active_user());

-- delivery_logs --------------------------------------------------------------
-- Histórico é matéria administrativa. Sem políticas de escrita: apenas as
-- funções SECURITY DEFINER acrescentam registos.
create policy delivery_logs_select_admin on public.delivery_logs
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Privilégios de tabela
--
-- Declarados explicitamente em vez de depender dos GRANT que o Supabase cria
-- por omissão: assim o modelo de permissões é auditável a partir das
-- migrações e reproduzível em qualquer PostgreSQL.
--
-- Repare que `deliveries` e `delivery_logs` só recebem SELECT. As escritas
-- são recusadas ao nível do PRIVILÉGIO, antes sequer de o RLS ser avaliado —
-- só as funções SECURITY DEFINER lá conseguem escrever. É uma camada extra
-- em relação a "não existe política de INSERT".
-- -----------------------------------------------------------------------------

-- Esta aplicação não tem área pública: o papel anónimo não acede a nada.
revoke all on public.profiles, public.companies, public.employees,
              public.deliveries, public.delivery_logs
  from anon;
revoke all on public.company_stock from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select on public.deliveries to authenticated;
grant select on public.delivery_logs to authenticated;
grant select on public.company_stock to authenticated;
