-- =============================================================================
-- O email do colaborador volta a ser opcional.
--
-- Reverte a migração 0008. Nem sempre há email para toda a gente — há empresas
-- que só entregam listas com número e nome — e exigi-lo obrigava a inventar
-- valores ou a deixar pessoas de fora da importação.
--
-- Não há nada a desfazer no esquema: a 0008 impôs a regra dentro das funções
-- de escrita e não como NOT NULL na coluna, precisamente para não tornar os
-- registos antigos impossiveis de editar. Basta retirar as duas verificações.
--
-- Os emails já gravados ficam intactos. O que muda é poder não haver.
--
-- A unicidade, se existir, continua a ser garantida pelo índice da coluna:
-- opcional não quer dizer repetível.
-- =============================================================================

-- 1. Criação e edição manual --------------------------------------------
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

-- 2. Importação ------------------------------------------------------
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
  v_email    text;
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
    v_email := nullif(btrim(lower(coalesce(v_row ->> 'email', ''))), '');

    insert into public.employees (employee_number, name, email, company_id)
    values (
      btrim(v_row ->> 'employeeNumber'),
      btrim(v_row ->> 'name'),
      v_email,
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
