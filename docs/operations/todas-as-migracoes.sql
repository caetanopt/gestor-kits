-- =============================================================================
-- TODAS AS MIGRAÇÕES — aplicação de distribuição de kits
--
-- Ficheiro de conveniência: é a concatenação, por ordem, de tudo o que está em
-- supabase/migrations/. Serve para aplicar o esquema de uma só vez no SQL
-- Editor do Supabase.
--
-- Se usar a CLI do Supabase, prefira `supabase db push`, que aplica os
-- ficheiros individuais e regista o que já foi aplicado. Este ficheiro NÃO é
-- acompanhado pela tabela de migrações.
--
-- Pode ser executado uma única vez numa base de dados nova.
-- =============================================================================



-- ═════════════════════════════════════════════════════════════════════
-- 0001_initial_schema.sql
-- ═════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Esquema inicial da aplicação de distribuição de kits.
--
-- Decisões estruturais (ver docs/decisions/0001-modelo-de-dados.md):
--
--  * As entregas vivem numa tabela própria (`deliveries`) em vez de colunas
--    denormalizadas em `employees`. Isto dá-nos uma única fonte de verdade
--    para o stock e torna a anulação reversível sem perder histórico.
--  * A unicidade da entrega é garantida por um índice único PARCIAL, não por
--    verificação aplicacional: duas entregas ativas ao mesmo colaborador são
--    fisicamente impossíveis.
--  * Nunca guardamos "kits disponíveis". É sempre derivado de
--    allocated_kits - COUNT(entregas ativas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — extensão de auth.users com o papel aplicacional
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'operator' check (role in ('admin', 'operator')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Papel aplicacional de cada utilizador autenticado. As credenciais vivem em auth.users.';
comment on column public.profiles.is_active is
  'Permite suspender um operador sem apagar o histórico das suas entregas.';

-- -----------------------------------------------------------------------------
-- companies — empresas participantes e respetivo limite de kits
-- -----------------------------------------------------------------------------
create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  code            text not null check (length(btrim(code)) between 1 and 40),
  -- Chave normalizada: torna o código único independentemente de
  -- maiúsculas/minúsculas e de espaços acidentais na importação.
  code_key        text generated always as (upper(btrim(code))) stored,
  allocated_kits  integer not null default 0 check (allocated_kits >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index companies_code_key_idx on public.companies (code_key);
create index companies_name_idx on public.companies (lower(name));

-- -----------------------------------------------------------------------------
-- employees — colaboradores elegíveis
-- -----------------------------------------------------------------------------
create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  employee_number      text not null
                         check (length(btrim(employee_number)) between 1 and 40),
  -- Chave de pesquisa normalizada. O ecrã de distribuição procura sempre por
  -- aqui, o que torna a pesquisa insensível a maiúsculas e a espaços e
  -- permite servi-la por índice.
  employee_number_key  text generated always as (upper(btrim(employee_number))) stored,
  name                 text not null check (length(btrim(name)) between 1 and 160),
  company_id           uuid not null references public.companies (id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Número único globalmente: o fluxo do operador pesquisa apenas pelo número,
-- sem escolher empresa, por isso a unicidade global é um requisito do fluxo.
create unique index employees_number_key_idx on public.employees (employee_number_key);
create index employees_company_idx on public.employees (company_id);
create index employees_name_idx on public.employees (lower(name));

comment on column public.employees.company_id is
  'ON DELETE RESTRICT: não é possível apagar uma empresa com colaboradores.';

-- -----------------------------------------------------------------------------
-- deliveries — uma linha por entrega; a anulação é suave (reversed_at)
-- -----------------------------------------------------------------------------
create table public.deliveries (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees (id) on delete restrict,
  -- Empresa a que o kit foi debitado no momento da entrega. Guardada aqui de
  -- propósito: se o colaborador mudar de empresa mais tarde, o kit continua a
  -- contar para a empresa de onde saiu fisicamente.
  company_id       uuid not null references public.companies (id) on delete restrict,
  delivered_at     timestamptz not null default now(),
  delivered_by     uuid not null references public.profiles (id) on delete restrict,
  reversed_at      timestamptz,
  reversed_by      uuid references public.profiles (id) on delete restrict,
  reversal_reason  text check (reversal_reason is null or length(reversal_reason) <= 500),
  -- Gerada pelo cliente a cada pesquisa. Um duplo clique ou um retry de rede
  -- reutiliza a mesma chave e devolve o resultado original em vez de falhar.
  idempotency_key  uuid not null,

  constraint deliveries_reversal_coherent check (
    (reversed_at is null and reversed_by is null)
    or (reversed_at is not null and reversed_by is not null)
  )
);

-- ⚠️ A garantia central do sistema: no máximo UMA entrega ativa por
-- colaborador. Sobrevive a bugs aplicacionais e a condições de corrida.
create unique index deliveries_one_active_per_employee_idx
  on public.deliveries (employee_id)
  where reversed_at is null;

create unique index deliveries_idempotency_key_idx
  on public.deliveries (idempotency_key);

-- Serve a contagem de stock por empresa.
create index deliveries_company_active_idx
  on public.deliveries (company_id)
  where reversed_at is null;

create index deliveries_delivered_at_idx on public.deliveries (delivered_at desc, id desc);
create index deliveries_employee_idx on public.deliveries (employee_id);

-- -----------------------------------------------------------------------------
-- delivery_logs — trilho de auditoria, apenas acrescentável
-- -----------------------------------------------------------------------------
create table public.delivery_logs (
  id            bigint generated always as identity primary key,
  employee_id   uuid references public.employees (id) on delete set null,
  company_id    uuid references public.companies (id) on delete set null,
  delivery_id   uuid references public.deliveries (id) on delete set null,
  action        text not null check (action in (
                  'DELIVERED',
                  'DELIVERY_REVERSED',
                  'EMPLOYEE_CREATED',
                  'EMPLOYEE_UPDATED',
                  'EMPLOYEES_IMPORTED',
                  'COMPANY_CREATED',
                  'COMPANY_UPDATED',
                  'COMPANY_LIMIT_UPDATED'
                )),
  performed_by  uuid references public.profiles (id) on delete set null,
  performed_at  timestamptz not null default now(),
  notes         text,
  metadata      jsonb not null default '{}'::jsonb
);

create index delivery_logs_performed_at_idx on public.delivery_logs (performed_at desc, id desc);
create index delivery_logs_company_idx on public.delivery_logs (company_id, performed_at desc);
create index delivery_logs_employee_idx on public.delivery_logs (employee_id, performed_at desc);
create index delivery_logs_action_idx on public.delivery_logs (action, performed_at desc);

comment on table public.delivery_logs is
  'Auditoria. Nunca é atualizada nem apagada pela aplicação.';

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger companies_touch_updated_at
  before update on public.companies
  for each row execute function public.touch_updated_at();

create trigger employees_touch_updated_at
  before update on public.employees
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- company_stock — stock derivado, nunca armazenado
-- -----------------------------------------------------------------------------
create view public.company_stock
with (security_invoker = on) as
select
  c.id,
  c.name,
  c.code,
  c.allocated_kits                                       as allocated,
  d.delivered,
  greatest(c.allocated_kits - d.delivered, 0)            as available,
  e.employee_count
from public.companies c
-- Subconsultas laterais em vez de JOINs: dois LEFT JOIN a partir de
-- `companies` produziriam um produto cartesiano entre entregas e
-- colaboradores, inflacionando ambas as contagens.
left join lateral (
  select count(*)::integer as delivered
  from public.deliveries dd
  where dd.company_id = c.id and dd.reversed_at is null
) d on true
left join lateral (
  select count(*)::integer as employee_count
  from public.employees ee
  where ee.company_id = c.id
) e on true;

comment on view public.company_stock is
  'Stock derivado por empresa. security_invoker: respeita as políticas RLS de quem consulta.';


-- ═════════════════════════════════════════════════════════════════════
-- 0002_auth_and_rls.sql
-- ═════════════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════════════
-- 0003_delivery_functions.sql
-- ═════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Regras críticas de negócio, implementadas em PostgreSQL.
--
-- Porquê no PostgreSQL e não em TypeScript: uma verificação aplicacional do
-- tipo "ler contagem, decidir, escrever" é uma condição de corrida (TOCTOU).
-- Com dois operadores em simultâneo, ambos leem 119/120 e ambos inserem.
-- Só o motor de base de dados consegue serializar isto corretamente.
--
-- Todas as funções são SECURITY DEFINER com `search_path` vazio e nomes
-- totalmente qualificados, para não serem vulneráveis a manipulação do
-- search_path.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sinalização de erros
--
-- A mensagem da exceção é o código de erro estável da aplicação. O cliente
-- PostgREST recebe-o em `message` e o TypeScript mapeia-o para ErrorCode.
-- -----------------------------------------------------------------------------
create or replace function public.app_error(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- Leituras derivadas
-- -----------------------------------------------------------------------------
create or replace function public.stock_snapshot(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allocated', c.allocated_kits,
    'delivered', d.delivered,
    'available', greatest(c.allocated_kits - d.delivered, 0)
  )
  from public.companies c
  left join lateral (
    select count(*)::integer as delivered
    from public.deliveries dd
    where dd.company_id = c.id and dd.reversed_at is null
  ) d on true
  where c.id = p_company_id;
$$;

create or replace function public.delivery_payload(p_delivery_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id,
    'deliveredAt', d.delivered_at,
    'deliveredBy', jsonb_build_object(
      'id', p.id,
      'name', coalesce(nullif(p.full_name, ''), p.email)
    ),
    'reversedAt', d.reversed_at
  )
  from public.deliveries d
  join public.profiles p on p.id = d.delivered_by
  where d.id = p_delivery_id;
$$;

-- -----------------------------------------------------------------------------
-- find_employee_for_delivery — a pesquisa do ecrã de distribuição
--
-- Correspondência EXATA pelo número normalizado. Não existe pesquisa por
-- prefixo nem por nome de propósito: o operador não pode enumerar a base de
-- colaboradores (secção 30 da especificação).
-- -----------------------------------------------------------------------------
create or replace function public.find_employee_for_delivery(p_employee_number text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.employees%rowtype;
  v_company  public.companies%rowtype;
  v_active   public.deliveries%rowtype;
begin
  if auth.uid() is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_active_user() then
    perform public.app_error('INACTIVE_ACCOUNT');
  end if;

  select * into v_employee
    from public.employees
   where employee_number_key = upper(btrim(coalesce(p_employee_number, '')));

  if not found then
    perform public.app_error('EMPLOYEE_NOT_FOUND');
  end if;

  select * into v_company from public.companies where id = v_employee.company_id;
  if not found then
    perform public.app_error('INVALID_COMPANY');
  end if;

  select * into v_active
    from public.deliveries
   where employee_id = v_employee.id and reversed_at is null;

  return jsonb_build_object(
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'employeeNumber', v_employee.employee_number,
      'name', v_employee.name
    ),
    'company', jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'code', v_company.code
    ),
    'stock', public.stock_snapshot(v_company.id),
    'delivery', case
                  when v_active.id is null then null
                  else public.delivery_payload(v_active.id)
                end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- deliver_kit — a operação central
--
-- Três defesas independentes contra entregas duplicadas e stock negativo:
--
--   1. idempotency_key único       → duplo clique / retry de rede
--   2. SELECT ... FOR UPDATE       → serializa entregas da mesma empresa,
--                                    tornando a contagem de stock estável
--   3. índice único parcial        → duas entregas ativas ao mesmo
--                                    colaborador são impossíveis
--
-- Nota sobre o nível de isolamento: isto assume READ COMMITTED (o predefinido
-- do PostgreSQL e do Supabase). Nesse nível, cada instrução obtém um snapshot
-- novo, por isso a contagem executada DEPOIS de obter o bloqueio já vê as
-- entregas confirmadas pela transação que detinha o bloqueio antes.
-- -----------------------------------------------------------------------------
create or replace function public.deliver_kit(
  p_employee_number text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := auth.uid();
  v_employee  public.employees%rowtype;
  v_company   public.companies%rowtype;
  v_existing  public.deliveries%rowtype;
  v_delivery  public.deliveries%rowtype;
  v_delivered integer;
begin
  -- 1. Autorização ------------------------------------------------------------
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_active_user() then
    perform public.app_error('INACTIVE_ACCOUNT');
  end if;
  if p_idempotency_key is null then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  -- 2. Idempotência: pedido repetido devolve o resultado original -------------
  select * into v_existing
    from public.deliveries
   where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'delivery', public.delivery_payload(v_existing.id),
      'employee', (
        select jsonb_build_object(
          'id', e.id, 'employeeNumber', e.employee_number, 'name', e.name
        ) from public.employees e where e.id = v_existing.employee_id
      ),
      'company', (
        select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code)
        from public.companies c where c.id = v_existing.company_id
      ),
      'stock', public.stock_snapshot(v_existing.company_id),
      'repeated', true
    );
  end if;

  -- 3. Colaborador ------------------------------------------------------------
  select * into v_employee
    from public.employees
   where employee_number_key = upper(btrim(coalesce(p_employee_number, '')));

  if not found then
    perform public.app_error('EMPLOYEE_NOT_FOUND');
  end if;

  -- 4. Bloqueio da empresa ----------------------------------------------------
  -- A partir daqui, qualquer outra entrega a esta MESMA empresa espera.
  -- Empresas diferentes não se bloqueiam entre si.
  select * into v_company
    from public.companies
   where id = v_employee.company_id
     for update;

  if not found then
    perform public.app_error('INVALID_COMPANY');
  end if;

  -- 5. Verificação explícita de duplicado (o índice é a rede de segurança) ----
  if exists (
    select 1 from public.deliveries
     where employee_id = v_employee.id and reversed_at is null
  ) then
    perform public.app_error('ALREADY_DELIVERED');
  end if;

  -- 6. Stock ------------------------------------------------------------------
  select count(*)::integer into v_delivered
    from public.deliveries
   where company_id = v_company.id and reversed_at is null;

  if v_delivered >= v_company.allocated_kits then
    perform public.app_error('NO_STOCK');
  end if;

  -- 7. Entrega ----------------------------------------------------------------
  begin
    insert into public.deliveries
      (employee_id, company_id, delivered_by, idempotency_key)
    values
      (v_employee.id, v_company.id, v_actor, p_idempotency_key)
    returning * into v_delivery;
  exception when unique_violation then
    -- Ou um pedido idêntico concorrente (mesma chave de idempotência), ou uma
    -- entrega concorrente ao mesmo colaborador.
    select * into v_existing
      from public.deliveries
     where idempotency_key = p_idempotency_key;

    if found then
      v_delivery := v_existing;
    else
      perform public.app_error('ALREADY_DELIVERED');
    end if;
  end;

  -- 8. Auditoria --------------------------------------------------------------
  insert into public.delivery_logs
    (employee_id, company_id, delivery_id, action, performed_by)
  values
    (v_employee.id, v_company.id, v_delivery.id, 'DELIVERED', v_actor);

  -- 9. Resultado --------------------------------------------------------------
  return jsonb_build_object(
    'delivery', public.delivery_payload(v_delivery.id),
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'employeeNumber', v_employee.employee_number,
      'name', v_employee.name
    ),
    'company', jsonb_build_object(
      'id', v_company.id, 'name', v_company.name, 'code', v_company.code
    ),
    'stock', public.stock_snapshot(v_company.id),
    'repeated', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- reverse_delivery — anulação administrativa
--
-- Anulação suave: o histórico é preservado e o kit volta imediatamente ao
-- stock, porque o stock é derivado de `reversed_at is null`.
-- -----------------------------------------------------------------------------
create or replace function public.reverse_delivery(
  p_delivery_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_delivery public.deliveries%rowtype;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id
     for update;

  if not found then
    perform public.app_error('DELIVERY_NOT_FOUND');
  end if;

  -- Idempotente: anular duas vezes é um conflito explícito, não um erro
  -- silencioso que descontaria stock a mais.
  if v_delivery.reversed_at is not null then
    perform public.app_error('ALREADY_REVERSED');
  end if;

  update public.deliveries
     set reversed_at     = now(),
         reversed_by     = v_actor,
         reversal_reason = v_reason
   where id = p_delivery_id;

  insert into public.delivery_logs
    (employee_id, company_id, delivery_id, action, performed_by, notes)
  values
    (v_delivery.employee_id, v_delivery.company_id, v_delivery.id,
     'DELIVERY_REVERSED', v_actor, v_reason);

  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'employeeId', v_delivery.employee_id,
    'stock', public.stock_snapshot(v_delivery.company_id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- save_company — criação e edição com verificação transacional do limite
--
-- A regra "o limite não pode ficar abaixo do já entregue" (secção 17) tem
-- exatamente o mesmo problema de corrida que a entrega, por isso usa o mesmo
-- bloqueio de linha.
-- -----------------------------------------------------------------------------
create or replace function public.save_company(
  p_id uuid,
  p_name text,
  p_code text,
  p_allocated_kits integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := auth.uid();
  v_company   public.companies%rowtype;
  v_delivered integer;
  v_previous  integer;
  v_action    text;
  v_name      text := btrim(coalesce(p_name, ''));
  v_code      text := btrim(coalesce(p_code, ''));
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  if v_name = '' or v_code = ''
     or p_allocated_kits is null or p_allocated_kits < 0 then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  if p_id is null then
    begin
      insert into public.companies (name, code, allocated_kits)
      values (v_name, v_code, p_allocated_kits)
      returning * into v_company;
    exception when unique_violation then
      perform public.app_error('DUPLICATE_COMPANY_CODE');
    end;

    v_action := 'COMPANY_CREATED';
  else
    select * into v_company
      from public.companies
     where id = p_id
       for update;

    if not found then
      perform public.app_error('COMPANY_NOT_FOUND');
    end if;

    v_previous := v_company.allocated_kits;

    select count(*)::integer into v_delivered
      from public.deliveries
     where company_id = v_company.id and reversed_at is null;

    if p_allocated_kits < v_delivered then
      perform public.app_error('LIMIT_BELOW_DELIVERED');
    end if;

    begin
      update public.companies
         set name = v_name, code = v_code, allocated_kits = p_allocated_kits
       where id = p_id
       returning * into v_company;
    exception when unique_violation then
      perform public.app_error('DUPLICATE_COMPANY_CODE');
    end;

    v_action := case
                  when v_previous is distinct from p_allocated_kits
                    then 'COMPANY_LIMIT_UPDATED'
                  else 'COMPANY_UPDATED'
                end;
  end if;

  insert into public.delivery_logs (company_id, action, performed_by, metadata)
  values (
    v_company.id, v_action, v_actor,
    jsonb_build_object(
      'name', v_company.name,
      'code', v_company.code,
      'allocatedKits', v_company.allocated_kits,
      'previousAllocatedKits', v_previous
    )
  );

  return jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'code', v_company.code,
    'allocatedKits', v_company.allocated_kits,
    'stock', public.stock_snapshot(v_company.id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios de execução
-- -----------------------------------------------------------------------------
revoke execute on function public.app_error(text) from public, anon;
revoke execute on function public.stock_snapshot(uuid) from public, anon;
revoke execute on function public.delivery_payload(uuid) from public, anon;
revoke execute on function public.find_employee_for_delivery(text) from public, anon;
revoke execute on function public.deliver_kit(text, uuid) from public, anon;
revoke execute on function public.reverse_delivery(uuid, text) from public, anon;
revoke execute on function public.save_company(uuid, text, text, integer) from public, anon;

grant execute on function public.find_employee_for_delivery(text) to authenticated;
grant execute on function public.deliver_kit(text, uuid) to authenticated;
grant execute on function public.reverse_delivery(uuid, text) to authenticated;
grant execute on function public.save_company(uuid, text, text, integer) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 0004_import_employees.sql
-- ═════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Importação de colaboradores em lote.
--
-- A validação por linha (formato, duplicados no ficheiro, resolução da
-- empresa) acontece em TypeScript, onde é possível produzir mensagens de erro
-- úteis por linha. Esta função recebe apenas linhas já validadas e trata do
-- que tem mesmo de ser atómico: ou entram todas, ou não entra nenhuma.
--
-- Sem isto, uma importação interrompida a meio deixaria a base num estado
-- parcial difícil de reconciliar durante um evento.
-- =============================================================================
create or replace function public.import_employees(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_inserted integer := 0;
  v_skipped  integer := 0;
  v_row      jsonb;
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    -- ON CONFLICT DO NOTHING: uma linha que já exista (por exemplo porque
    -- outro administrador importou o mesmo ficheiro em simultâneo) é
    -- ignorada em vez de abortar a importação inteira.
    insert into public.employees (employee_number, name, company_id)
    values (
      btrim(v_row ->> 'employeeNumber'),
      btrim(v_row ->> 'name'),
      (v_row ->> 'companyId')::uuid
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  insert into public.delivery_logs (action, performed_by, metadata)
  values (
    'EMPLOYEES_IMPORTED',
    v_actor,
    jsonb_build_object(
      'submitted', jsonb_array_length(p_rows),
      'inserted', v_inserted,
      'skipped', v_skipped
    )
  );

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.import_employees(jsonb) from public, anon;
grant execute on function public.import_employees(jsonb) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 0005_history_view.sql
-- ═════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Vista do histórico.
--
-- A secção 21 pede colaborador, número, empresa, ação, operador, data e hora
-- numa só listagem. Uma vista resolve as junções de uma vez, em vez de
-- depender das relações inferidas pelo PostgREST — que teriam de ser
-- desambiguadas à mão porque `delivery_logs` referencia `profiles` e
-- `deliveries` referencia `profiles` duas vezes.
--
-- security_invoker: a vista respeita o RLS de quem consulta. Como
-- `delivery_logs` só é legível por administradores, o histórico também é.
-- =============================================================================
create view public.delivery_history
with (security_invoker = on) as
select
  l.id,
  l.action,
  l.performed_at,
  l.notes,
  l.metadata,
  l.employee_id,
  e.employee_number,
  e.name                                            as employee_name,
  l.company_id,
  c.name                                            as company_name,
  c.code                                            as company_code,
  l.delivery_id,
  d.reversed_at,
  -- Uma entrega ainda ativa é a única que pode ser anulada.
  (d.id is not null and d.reversed_at is null)      as is_active_delivery,
  l.performed_by,
  coalesce(nullif(p.full_name, ''), p.email, '—')   as performed_by_name
from public.delivery_logs l
left join public.employees e on e.id = l.employee_id
left join public.companies c on c.id = l.company_id
left join public.deliveries d on d.id = l.delivery_id
left join public.profiles  p on p.id = l.performed_by;

comment on view public.delivery_history is
  'Histórico legível: junta auditoria, colaborador, empresa, entrega e operador.';

revoke all on public.delivery_history from anon;
grant select on public.delivery_history to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 0006_codigo_automatico.sql
-- ═════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Código da empresa gerado automaticamente.
--
-- O código continua a existir — é a chave estável que a importação usa para
-- identificar a empresa mesmo que o nome mude — mas deixa de ser pedido a
-- quem cria a empresa. É derivado do nome.
-- =============================================================================

/**
 * Deriva um código a partir do nome: sem acentos, maiúsculas, apenas letras e
 * dígitos, no máximo 12 caracteres.
 *
 *   "Águas de Portugal"  →  "AGUASDEPORT"
 *   "Empresa A"          →  "EMPRESAA"
 */
create or replace function public.derive_company_code(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      left(
        regexp_replace(
          upper(
            translate(
              btrim(coalesce(p_name, '')),
              'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÑñÇç',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
            )
          ),
          '[^A-Z0-9]', '', 'g'
        ),
        12
      ),
      ''
    ),
    'EMPRESA'
  );
$$;

/**
 * save_company com código opcional.
 *
 * Ao criar sem código, é derivado do nome e desambiguado com um sufixo
 * numérico se já estiver ocupado. Ao editar sem código, o existente mantém-se:
 * o código é uma chave estável e mudar de nome não deve quebrar ficheiros de
 * importação já preparados.
 */
create or replace function public.save_company(
  p_id uuid,
  p_name text,
  p_code text,
  p_allocated_kits integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := auth.uid();
  v_company   public.companies%rowtype;
  v_delivered integer;
  v_previous  integer;
  v_action    text;
  v_name      text := btrim(coalesce(p_name, ''));
  v_code      text := btrim(coalesce(p_code, ''));
  v_base      text;
  v_tentativa integer;
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  if v_name = '' or p_allocated_kits is null or p_allocated_kits < 0 then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  if p_id is null then
    -- Sem código explícito: derivar do nome.
    if v_code = '' then
      v_base := public.derive_company_code(v_name);
      v_code := v_base;
      v_tentativa := 1;

      -- O índice único é a garantia; este ciclo evita o erro no caso comum.
      while exists (select 1 from public.companies c where c.code_key = v_code)
            and v_tentativa < 50
      loop
        v_tentativa := v_tentativa + 1;
        v_code := left(v_base, 10) || v_tentativa::text;
      end loop;
    end if;

    begin
      insert into public.companies (name, code, allocated_kits)
      values (v_name, v_code, p_allocated_kits)
      returning * into v_company;
    exception when unique_violation then
      perform public.app_error('DUPLICATE_COMPANY_CODE');
    end;

    v_action := 'COMPANY_CREATED';
  else
    select * into v_company
      from public.companies
     where id = p_id
       for update;

    if not found then
      perform public.app_error('COMPANY_NOT_FOUND');
    end if;

    -- Código omitido na edição: manter o que já existe.
    if v_code = '' then
      v_code := v_company.code;
    end if;

    v_previous := v_company.allocated_kits;

    select count(*)::integer into v_delivered
      from public.deliveries
     where company_id = v_company.id and reversed_at is null;

    if p_allocated_kits < v_delivered then
      perform public.app_error('LIMIT_BELOW_DELIVERED');
    end if;

    begin
      update public.companies
         set name = v_name, code = v_code, allocated_kits = p_allocated_kits
       where id = p_id
       returning * into v_company;
    exception when unique_violation then
      perform public.app_error('DUPLICATE_COMPANY_CODE');
    end;

    v_action := case
                  when v_previous is distinct from p_allocated_kits
                    then 'COMPANY_LIMIT_UPDATED'
                  else 'COMPANY_UPDATED'
                end;
  end if;

  insert into public.delivery_logs (company_id, action, performed_by, metadata)
  values (
    v_company.id, v_action, v_actor,
    jsonb_build_object(
      'name', v_company.name,
      'code', v_company.code,
      'allocatedKits', v_company.allocated_kits,
      'previousAllocatedKits', v_previous
    )
  );

  return jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'code', v_company.code,
    'allocatedKits', v_company.allocated_kits,
    'stock', public.stock_snapshot(v_company.id)
  );
end;
$$;

revoke execute on function public.derive_company_code(text) from public, anon;
revoke execute on function public.save_company(uuid, text, text, integer) from public, anon;
grant execute on function public.save_company(uuid, text, text, integer) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 0007_colaboradores.sql
-- ═════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Email do colaborador, criação manual e edição.
--
-- Até aqui os colaboradores só entravam por importação. Passa a ser possível
-- criá-los e editá-los um a um, e cada colaborador pode ter email.
-- =============================================================================

alter table public.employees
  add column if not exists email text
    check (email is null or length(email) between 3 and 254);

comment on column public.employees.email is
  'Opcional. NÃO é mostrado no ecrã de distribuição: durante o evento só se '
  'mostram nome, número, empresa e estado (secção 30 da especificação).';

-- Pesquisa por email no painel administrativo.
create index if not exists employees_email_idx on public.employees (lower(email));

-- -----------------------------------------------------------------------------
-- employee_list — listagem administrativa com empresa e estado da entrega
--
-- Uma vista resolve as junções de uma vez. security_invoker: como `employees`
-- só é legível por administradores, esta listagem também é — o operador
-- continua sem conseguir enumerar colaboradores.
-- -----------------------------------------------------------------------------
create or replace view public.employee_list
with (security_invoker = on) as
select
  e.id,
  e.employee_number,
  e.name,
  e.email,
  e.company_id,
  c.name                                          as company_name,
  c.code                                          as company_code,
  d.id                                            as delivery_id,
  d.delivered_at,
  coalesce(nullif(p.full_name, ''), p.email)      as delivered_by_name,
  (d.id is not null)                              as kit_delivered,
  e.created_at
from public.employees e
join public.companies c on c.id = e.company_id
left join public.deliveries d
  on d.employee_id = e.id and d.reversed_at is null
left join public.profiles p on p.id = d.delivered_by;

revoke all on public.employee_list from anon;
grant select on public.employee_list to authenticated;

-- -----------------------------------------------------------------------------
-- save_employee — criar ou editar um colaborador
-- -----------------------------------------------------------------------------
create or replace function public.save_employee(
  p_id uuid,
  p_employee_number text,
  p_name text,
  p_email text,
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_number   text := btrim(coalesce(p_employee_number, ''));
  v_name     text := btrim(coalesce(p_name, ''));
  v_email    text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_action   text;
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  if v_number = '' or v_name = '' or p_company_id is null then
    perform public.app_error('VALIDATION_ERROR');
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    perform public.app_error('COMPANY_NOT_FOUND');
  end if;

  if p_id is null then
    begin
      insert into public.employees (employee_number, name, email, company_id)
      values (v_number, v_name, v_email, p_company_id)
      returning * into v_employee;
    exception when unique_violation then
      perform public.app_error('DUPLICATE_EMPLOYEE_NUMBER');
    end;

    v_action := 'EMPLOYEE_CREATED';
  else
    -- Bloqueio da linha: uma entrega concorrente a este colaborador não pode
    -- apanhar o registo a meio de uma alteração de empresa.
    select * into v_employee from public.employees where id = p_id for update;
    if not found then
      perform public.app_error('EMPLOYEE_NOT_FOUND');
    end if;

    begin
      update public.employees
         set employee_number = v_number,
             name            = v_name,
             email           = v_email,
             company_id      = p_company_id
       where id = p_id
       returning * into v_employee;
    exception when unique_violation then
      perform public.app_error('DUPLICATE_EMPLOYEE_NUMBER');
    end;

    v_action := 'EMPLOYEE_UPDATED';
  end if;

  insert into public.delivery_logs
    (employee_id, company_id, action, performed_by, metadata)
  values (
    v_employee.id, v_employee.company_id, v_action, v_actor,
    jsonb_build_object(
      'employeeNumber', v_employee.employee_number,
      'name', v_employee.name
    )
  );

  return jsonb_build_object(
    'id', v_employee.id,
    'employeeNumber', v_employee.employee_number,
    'name', v_employee.name,
    'email', v_employee.email,
    'companyId', v_employee.company_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- import_employees — passa a aceitar o email de cada linha
-- -----------------------------------------------------------------------------
create or replace function public.import_employees(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_inserted integer := 0;
  v_skipped  integer := 0;
  v_row      jsonb;
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.employees (employee_number, name, email, company_id)
    values (
      btrim(v_row ->> 'employeeNumber'),
      btrim(v_row ->> 'name'),
      nullif(btrim(lower(coalesce(v_row ->> 'email', ''))), ''),
      (v_row ->> 'companyId')::uuid
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  insert into public.delivery_logs (action, performed_by, metadata)
  values (
    'EMPLOYEES_IMPORTED',
    v_actor,
    jsonb_build_object(
      'submitted', jsonb_array_length(p_rows),
      'inserted', v_inserted,
      'skipped', v_skipped
    )
  );

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.save_employee(uuid, text, text, text, uuid)
  from public, anon;
grant execute on function public.save_employee(uuid, text, text, text, uuid)
  to authenticated;
