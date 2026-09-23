-- =============================================================================
-- O número de colaborador deixa de ser obrigatório ao criar.
--
-- Pedido: ao acrescentar alguém à mão — no balcão ou na página Colaboradores
-- — o número pode ficar por preencher. Há quem chegue ao balcão sem o saber.
--
-- O número não pode, porém, ficar vazio na base de dados: é a chave única do
-- colaborador e é por ele que `deliver_kit` entrega. Sem número, a pessoa
-- ficava impossível de encontrar e de entregar. Por isso, quando vem vazio, a
-- base de dados atribui um automático: SN0001, SN0002… ("sem número").
--
-- Só na criação. Na edição continua obrigatório: apagar o número de alguém
-- que já existe não tem significado, e um novo automático mudaria a chave de
-- quem talvez já tenha kit.
--
-- A importação não muda: um ficheiro traz sempre números.
-- =============================================================================

create sequence if not exists public.employee_auto_number_seq;
revoke all on sequence public.employee_auto_number_seq from public, anon, authenticated;

-- Próximo número automático livre. `nextval` é seguro com vários operadores
-- ao mesmo tempo (nunca devolve o mesmo valor duas vezes); o ciclo salta um
-- valor que por acaso já exista, por exemplo escrito à mão.
create or replace function public.next_auto_employee_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero text;
begin
  loop
    v_numero := 'SN' || lpad(nextval('public.employee_auto_number_seq')::text, 4, '0');
    exit when not exists (
      select 1 from public.employees where employee_number_key = upper(v_numero)
    );
  end loop;
  return v_numero;
end;
$$;

comment on function public.next_auto_employee_number() is
  'Número automático para um colaborador criado sem número: SN0001, SN0002…';

-- Só as funções de criação abaixo a chamam (são security definer).
revoke execute on function public.next_auto_employee_number() from public, anon, authenticated;

-- 1. Balcão de distribuição -------------------------------------------------
create or replace function public.create_employee_for_delivery(
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
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_active_user() then
    perform public.app_error('INACTIVE_ACCOUNT');
  end if;
  if length(v_number) > 40
     or v_name = '' or length(v_name) > 160
     or p_company_id is null then
    perform public.app_error('VALIDATION_ERROR');
  end if;
  if v_email is not null
     and (length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    perform public.app_error('VALIDATION_ERROR');
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    perform public.app_error('COMPANY_NOT_FOUND');
  end if;

  -- Sem número: atribui-se um automático (ver cabeçalho).
  if v_number = '' then
    v_number := public.next_auto_employee_number();
  end if;

  -- Só cria. Se o número já existe, quem está ao balcão tem de o pesquisar,
  -- não de lhe passar por cima.
  begin
    insert into public.employees (employee_number, name, email, company_id)
    values (v_number, v_name, v_email, p_company_id)
    returning * into v_employee;
  exception when unique_violation then
    perform public.app_error('DUPLICATE_EMPLOYEE_NUMBER');
  end;

  insert into public.delivery_logs
    (employee_id, company_id, action, performed_by, metadata)
  values (
    v_employee.id, v_employee.company_id, 'EMPLOYEE_CREATED', v_actor,
    jsonb_build_object(
      'employeeNumber', v_employee.employee_number,
      'name', v_employee.name,
      'origem', 'distribuicao'
    )
  );

  return public.find_employee_for_delivery(v_employee.employee_number);
end;
$$;

-- 2. Página Colaboradores ---------------------------------------------------
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
  -- Número vazio só é aceite ao criar (p_id nulo).
  if (v_number = '' and p_id is not null) or v_name = '' or p_company_id is null then
    perform public.app_error('VALIDATION_ERROR');
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    perform public.app_error('COMPANY_NOT_FOUND');
  end if;

  if p_id is null then
    if v_number = '' then
      v_number := public.next_auto_employee_number();
    end if;

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
