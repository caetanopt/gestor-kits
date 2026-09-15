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
