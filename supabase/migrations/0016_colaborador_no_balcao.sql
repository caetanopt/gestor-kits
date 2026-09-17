-- =============================================================================
-- O distribuidor pode acrescentar um colaborador que não está na lista.
--
-- No evento aparece sempre alguém que a importação não trouxe: entrou na
-- semana passada, veio de outra empresa do grupo, ficou de fora do ficheiro.
-- Até aqui a única saída era chamar um administrador — ou não entregar o kit.
--
-- `save_employee` (migração 0012) exige `is_admin()` e continua a exigir: é a
-- função da página de Colaboradores, que também edita e por isso pode
-- reescrever quem já existe. Esta é outra coisa e fica com regras próprias:
--
--   * só cria, nunca edita — um número repetido é recusado, não atualizado;
--   * não recebe email, que ninguém pede a quem está à frente do balcão;
--   * fica auditada com origem 'distribuicao', para se distinguir no
--     histórico de quem foi importado ou criado na área administrativa.
--
-- Não abre a tabela: `employees` continua fechada à leitura direta para quem
-- não é administrador (política employees_select_admin, migração 0002). Quem
-- acrescenta um colaborador ao balcão continua sem poder listar os outros.
-- =============================================================================

create or replace function public.create_employee_for_delivery(
  p_employee_number text,
  p_name text,
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
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_active_user() then
    perform public.app_error('INACTIVE_ACCOUNT');
  end if;
  if v_number = '' or length(v_number) > 40
     or v_name = '' or length(v_name) > 160
     or p_company_id is null then
    perform public.app_error('VALIDATION_ERROR');
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    perform public.app_error('COMPANY_NOT_FOUND');
  end if;

  -- Só cria. Se o número já existe, quem está ao balcão tem de o pesquisar,
  -- não de lhe passar por cima: reescrever a linha mudaria a empresa ou o
  -- nome de alguém que talvez já tenha recebido kit.
  begin
    insert into public.employees (employee_number, name, email, company_id)
    values (v_number, v_name, null, p_company_id)
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

  -- O mesmo payload da pesquisa, para o ecrã seguir direto para o cartão de
  -- entrega sem uma segunda ida ao servidor.
  return public.find_employee_for_delivery(v_employee.employee_number);
end;
$$;

comment on function public.create_employee_for_delivery(text, text, uuid) is
  'Cria um colaborador a partir do ecrã de distribuição. Qualquer conta ativa, '
  'porque é quem está ao balcão que encontra os casos em falta. Só cria: '
  'número repetido é recusado com DUPLICATE_EMPLOYEE_NUMBER.';

revoke execute on function public.create_employee_for_delivery(text, text, uuid)
  from public, anon;
grant execute on function public.create_employee_for_delivery(text, text, uuid)
  to authenticated;
