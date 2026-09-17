-- =============================================================================
-- Um pedido repetido deixa de inventar uma entrega na auditoria.
--
-- `deliver_kit` já garantia o essencial: a mesma chave de idempotência produz
-- uma única linha em `deliveries`. Mas quando dois pedidos idênticos corriam
-- ao mesmo tempo, o que perdia a corrida apanhava o unique_violation, adotava
-- a entrega do outro e *seguia em frente* — incluindo para o INSERT de
-- auditoria. Trinta toques repetidos davam uma entrega e vários registos
-- DELIVERED.
--
-- Isto não afeta stock nem impede ninguém de receber: é o histórico a contar
-- entregas que não aconteceram, e a página de Histórico lê dali.
--
-- A correção é devolver no próprio ramo da exceção, tal como já acontece na
-- verificação de idempotência feita antes do INSERT. Passa a haver um só
-- caminho que escreve auditoria: o de quem realmente entregou.
--
-- Encontrado por tests/sql/run-concurrency.sh, que já afirmava "um só registo
-- de auditoria" e estava a falhar.
--
-- A função é reposta por inteiro a partir da versão da migração 0011, com
-- essa única alteração. Para reverter, reaplicar a 0011.
-- =============================================================================

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
  v_actor    uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_company  public.companies%rowtype;
  v_existing public.deliveries%rowtype;
  v_delivery public.deliveries%rowtype;
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
      'totals', public.totals_snapshot(v_existing.company_id),
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

  -- 4. Empresa ----------------------------------------------------------------
  -- Sem `for update`. O bloqueio existia para serializar a contagem contra o
  -- limite; sem limite, só serializava entregas da mesma empresa umas atrás
  -- das outras, à porta de uma verificação que já não existe. A garantia de
  -- não duplicar nunca dependeu dele.
  select * into v_company
    from public.companies
   where id = v_employee.company_id;

  if not found then
    perform public.app_error('INVALID_COMPANY');
  end if;

  -- 5. Verificação explícita de duplicado (o índice é a rede de segurança) ----
  -- Duas entregas simultâneas ao mesmo colaborador passam ambas por aqui:
  -- nenhuma vê a inserção não confirmada da outra. Quem decide é o índice
  -- único parcial, no passo 6.
  if exists (
    select 1 from public.deliveries
     where employee_id = v_employee.id and reversed_at is null
  ) then
    perform public.app_error('ALREADY_DELIVERED');
  end if;

  -- 6. Entrega ----------------------------------------------------------------
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

    if not found then
      perform public.app_error('ALREADY_DELIVERED');
    end if;

    -- Devolver aqui, e não continuar: este pedido não entregou nada, foi o
    -- concorrente que entregou. A seguir vem o registo de auditoria, e
    -- escrevê-lo era dizer que houve mais uma entrega do que houve.
    return jsonb_build_object(
      'delivery', public.delivery_payload(v_existing.id),
      'employee', jsonb_build_object(
        'id', v_employee.id,
        'employeeNumber', v_employee.employee_number,
        'name', v_employee.name
      ),
      'company', jsonb_build_object(
        'id', v_company.id, 'name', v_company.name, 'code', v_company.code
      ),
      'totals', public.totals_snapshot(v_company.id),
      'repeated', true
    );
  end;

  -- 7. Auditoria --------------------------------------------------------------
  insert into public.delivery_logs
    (employee_id, company_id, delivery_id, action, performed_by)
  values
    (v_employee.id, v_company.id, v_delivery.id, 'DELIVERED', v_actor);

  -- 8. Resultado --------------------------------------------------------------
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
    'totals', public.totals_snapshot(v_company.id),
    'repeated', false
  );
end;
$$;
