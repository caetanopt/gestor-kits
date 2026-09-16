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
