-- =============================================================================
-- Fim do limite de kits por empresa.
--
-- Até aqui cada empresa tinha um número de kits atribuído, e `deliver_kit`
-- recusava a entrega quando as entregas ativas chegavam a esse número. Passa a
-- não haver limite: entrega-se sempre, e o que interessa é a contagem do que
-- foi entregue por empresa.
--
-- O que NÃO muda, e é o que sempre importou: um colaborador recebe um kit e
-- um só. Essa garantia nunca dependeu do limite — vem do índice único parcial
-- `deliveries_one_active_per_employee_idx` e da chave de idempotência.
--
-- O limite deixa de existir, mas o teto real não desaparece: só recebe kit
-- quem está na lista de colaboradores da empresa. O limite era, na prática,
-- uma segunda contagem a dizer o que a lista já dizia.
--
-- ## Estratégia de migração
--
-- A coluna `companies.allocated_kits` FICA, com os valores que tem hoje.
-- Nada a lê a partir de agora. Fica assim de propósito: apagá-la seria
-- destrutivo e irreversível, e mantê-la torna o regresso atrás uma questão de
-- repor as funções antigas. Uma migração futura pode removê-la depois de o
-- evento confirmar que o limite não faz falta.
-- =============================================================================

-- 1. Contagens da empresa ----------------------------------------------------
-- Substitui `stock_snapshot`: já não há stock, há o que foi entregue. O total
-- de colaboradores vai junto por ser a leitura que dá sentido à contagem —
-- "48 de 120" diz muito mais do que "48".
drop function if exists public.stock_snapshot(uuid);

create or replace function public.totals_snapshot(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'delivered', d.delivered,
    'employees', e.employee_count
  )
  from public.companies c
  -- Subconsultas laterais e não JOINs: dois LEFT JOIN a partir de `companies`
  -- produziriam um produto cartesiano entre entregas e colaboradores.
  left join lateral (
    select count(*)::integer as delivered
    from public.deliveries dd
    where dd.company_id = c.id and dd.reversed_at is null
  ) d on true
  left join lateral (
    select count(*)::integer as employee_count
    from public.employees ee
    where ee.company_id = c.id
  ) e on true
  where c.id = p_company_id;
$$;

-- 2. Vista das empresas ------------------------------------------------------
drop view if exists public.company_stock;

create view public.company_totals
with (security_invoker = on) as
select
  c.id,
  c.name,
  c.code,
  d.delivered,
  e.employee_count
from public.companies c
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

comment on view public.company_totals is
  'Kits entregues e colaboradores por empresa. security_invoker: o RLS de '
  'companies, deliveries e employees continua a aplicar-se a quem consulta.';

revoke all on public.company_totals from anon;
grant select on public.company_totals to authenticated;

-- 3. Entrega -----------------------------------------------------------------
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

    if found then
      v_delivery := v_existing;
    else
      perform public.app_error('ALREADY_DELIVERED');
    end if;
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

-- 4. Consulta do colaborador --------------------------------------------------
-- Igual ao que era; só a chave do payload deixa de falar em stock.
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
    'totals', public.totals_snapshot(v_company.id),
    'delivery', case
                  when v_active.id is null then null
                  else public.delivery_payload(v_active.id)
                end
  );
end;
$$;

-- 5. Anulação de entrega ------------------------------------------------------
-- Igual ao que era; só a chave do payload deixa de falar em stock.
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
    'totals', public.totals_snapshot(v_delivery.company_id)
  );
end;
$$;

-- 6. Gravação de empresa ------------------------------------------------------
-- Sem o número de kits: uma empresa passa a ser nome e código.
--
-- Desaparecem com ele duas coisas: o erro LIMIT_BELOW_DELIVERED, que impedia
-- baixar o limite abaixo do já entregue, e a ação de auditoria
-- COMPANY_LIMIT_UPDATED. A ação continua no enum e no histórico: os registos
-- antigos contam o que aconteceu e não devem deixar de fazer sentido.
drop function if exists public.save_company(uuid, text, text, integer);

create or replace function public.save_company(
  p_id uuid,
  p_name text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := auth.uid();
  v_company   public.companies%rowtype;
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
  if v_name = '' then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  if p_id is null then
    -- Sem código explícito: derivar do nome (migração 0006).
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
      insert into public.companies (name, code)
      values (v_name, v_code)
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

    begin
      update public.companies
         set name = v_name, code = v_code
       where id = p_id
       returning * into v_company;
    exception when unique_violation then
      perform public.app_error('DUPLICATE_COMPANY_CODE');
    end;

    v_action := 'COMPANY_UPDATED';
  end if;

  insert into public.delivery_logs (company_id, action, performed_by, metadata)
  values (
    v_company.id, v_action, v_actor,
    jsonb_build_object('name', v_company.name, 'code', v_company.code)
  );

  return jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'code', v_company.code,
    'totals', public.totals_snapshot(v_company.id)
  );
end;
$$;

-- 7. Permissões ---------------------------------------------------------------
revoke execute on function public.totals_snapshot(uuid) from public, anon;
revoke execute on function public.save_company(uuid, text, text) from public, anon;
grant execute on function public.save_company(uuid, text, text) to authenticated;

comment on column public.companies.allocated_kits is
  'Adormecida. Era o limite de kits por empresa, que deixou de existir na '
  'migração 0011. Mantida para que o regresso atrás seja repor as funções '
  'antigas, e não recuperar dados apagados.';
