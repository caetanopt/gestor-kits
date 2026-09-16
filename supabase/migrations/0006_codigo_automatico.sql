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
