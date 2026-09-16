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
