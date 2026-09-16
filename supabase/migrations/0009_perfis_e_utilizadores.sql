-- =============================================================================
-- Perfis de utilizador e gestão de contas.
--
-- 1. O papel `operator` passa a chamar-se `distributor`, para corresponder ao
--    que a interface mostra ("Distribuidor"). Ter a base de dados e a
--    interface a chamar nomes diferentes à mesma coisa confunde quem lê o
--    histórico mais tarde.
--
-- 2. A alteração de papel e a ativação passam a funções com salvaguardas, e a
--    escrita direta em `profiles` é retirada. Sem isso, um administrador podia
--    despromover-se a si próprio e deixar a aplicação sem ninguém que a
--    consiga administrar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Renomear o papel
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'distributor' where role = 'operator';

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'distributor'));

alter table public.profiles alter column role set default 'distributor';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'distributor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Escrita em profiles apenas através de funções com salvaguardas
-- -----------------------------------------------------------------------------
drop policy if exists profiles_update_admin on public.profiles;
revoke update on public.profiles from authenticated;

/**
 * Quantos administradores ativos existem, excluindo opcionalmente um deles.
 *
 * Serve para impedir a última alteração que deixaria a aplicação sem ninguém
 * capaz de a administrar — incluindo gerir utilizadores.
 */
create or replace function public.active_admin_count(p_excluding uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.profiles
   where role = 'admin'
     and is_active
     and (p_excluding is null or id <> p_excluding);
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  if p_role not in ('admin', 'distributor') then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    perform public.app_error('USER_NOT_FOUND');
  end if;

  -- Despromover o último administrador ativo tranca toda a gente de fora da
  -- gestão da aplicação, sem forma de recuperar pela interface.
  if v_profile.role = 'admin' and p_role <> 'admin'
     and public.active_admin_count(p_user_id) = 0 then
    perform public.app_error('LAST_ADMIN');
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.delivery_logs (action, performed_by, metadata)
  values (
    'USER_ROLE_CHANGED', v_actor,
    jsonb_build_object(
      'userId', p_user_id, 'email', v_profile.email,
      'from', v_profile.role, 'to', p_role
    )
  );

  return jsonb_build_object('id', p_user_id, 'role', p_role);
end;
$$;

create or replace function public.set_user_active(p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN');
  end if;
  if p_active is null then
    perform public.app_error('VALIDATION_ERROR');
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    perform public.app_error('USER_NOT_FOUND');
  end if;

  if not p_active and v_profile.role = 'admin'
     and public.active_admin_count(p_user_id) = 0 then
    perform public.app_error('LAST_ADMIN');
  end if;

  update public.profiles set is_active = p_active where id = p_user_id;

  insert into public.delivery_logs (action, performed_by, metadata)
  values (
    case when p_active then 'USER_ACTIVATED' else 'USER_DEACTIVATED' end,
    v_actor,
    jsonb_build_object('userId', p_user_id, 'email', v_profile.email)
  );

  return jsonb_build_object('id', p_user_id, 'isActive', p_active);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Auditoria das ações sobre utilizadores
-- -----------------------------------------------------------------------------
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
    'USER_ROLE_CHANGED',
    'USER_ACTIVATED',
    'USER_DEACTIVATED'
  ));

revoke execute on function public.active_admin_count(uuid) from public, anon;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
revoke execute on function public.set_user_active(uuid, boolean) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;
