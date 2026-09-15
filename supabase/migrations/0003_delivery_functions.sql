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
