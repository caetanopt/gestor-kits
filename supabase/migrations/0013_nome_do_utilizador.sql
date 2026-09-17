-- =============================================================================
-- O nome passa a identificar quem está com sessão iniciada.
--
-- O cabeçalho mostrava o email porque `full_name` estava vazio em todas as
-- contas: nunca houve por onde o preencher depois da criação. Passa a haver.
--
-- A escrita continua a não ser direta: `profiles` tem o UPDATE revogado a
-- `authenticated` desde a migração 0009, e todas as alterações a uma conta
-- passam por funções com verificação de administrador e registo de auditoria.
-- Esta é mais uma dessas.
--
-- Renomear não tem salvaguarda de "último administrador" porque não muda
-- quem pode administrar a aplicação — só a etiqueta por que essa pessoa é
-- conhecida.
-- =============================================================================

-- 1. Auditoria ----------------------------------------------------------
alter table public.delivery_logs drop constraint if exists delivery_logs_action_check;

alter table public.delivery_logs
  add constraint delivery_logs_action_check check (action in (
    'DELIVERED',
    'DELIVERY_REVERSED',
    'EMPLOYEE_CREATED',
    'EMPLOYEE_UPDATED',
    'EMPLOYEES_IMPORTED',
    'COMPANY_CREATED',
    'COMPANY_UPDATED',
    'COMPANY_LIMIT_UPDATED',
    'USER_CREATED',
    'USER_RENAMED',
    'USER_ROLE_CHANGED',
    'USER_ACTIVATED',
    'USER_DEACTIVATED'
  ));

-- 2. Alterar o nome de uma conta ----------------------------------------
create or replace function public.set_user_name(p_user_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_name    text := btrim(coalesce(p_name, ''));
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  -- O nome é o que identifica a pessoa no cabeçalho. Vazio devolveria o
  -- email, que é precisamente o que se quer deixar de mostrar.
  if v_name = '' or length(v_name) > 160 then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    perform public.app_error('USER_NOT_FOUND');
  end if;

  update public.profiles set full_name = v_name where id = p_user_id;

  insert into public.delivery_logs (action, performed_by, metadata)
  values (
    'USER_RENAMED', v_actor,
    jsonb_build_object(
      'userId', p_user_id,
      'email', v_profile.email,
      'from', v_profile.full_name,
      'to', v_name
    )
  );

  return jsonb_build_object('id', p_user_id, 'name', v_name);
end;
$$;

revoke execute on function public.set_user_name(uuid, text) from public, anon;
grant execute on function public.set_user_name(uuid, text) to authenticated;
