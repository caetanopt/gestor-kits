-- =============================================================================
-- Repor uma conta de administrador numa só passagem.
--
-- Trata dos três motivos possíveis para o login falhar:
--   1. palavra-passe errada       → define uma nova
--   2. email por confirmar        → confirma
--   3. perfil em falta ou inativo → cria/reativa e promove a admin
--
-- COMO USAR
--   1. Substitua o email e a palavra-passe nas duas primeiras linhas.
--   2. Execute tudo de uma vez no SQL Editor do Supabase.
--   3. A última consulta confirma o resultado: todas as colunas devem dar ✓.
--
-- A conta TEM DE EXISTIR primeiro (Authentication > Users > Add user).
-- Se ainda não existir, crie-a e execute isto a seguir.
--
-- Escolha uma palavra-passe forte: esta aplicação fica acessível na internet.
-- =============================================================================

do $$
declare
  -- ┌─────────────── ALTERE ESTAS DUAS LINHAS ───────────────┐
  v_email    text := 'o-seu@email.pt';
  v_password text := 'AlterePorFavor123!';
  -- └────────────────────────────────────────────────────────┘
  v_user_id  uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(btrim(v_email));

  if v_user_id is null then
    raise exception
      'Não existe nenhuma conta com o email %. Crie-a primeiro em Authentication > Users > Add user.',
      v_email;
  end if;

  -- 1 e 2: palavra-passe nova e email confirmado.
  update auth.users
     set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at         = now()
   where id = v_user_id;

  -- 3: perfil ativo e com papel de administrador.
  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, v_email, '', 'admin')
  on conflict (id) do update
     set role      = 'admin',
         is_active = true;

  raise notice 'Conta % reposta: palavra-passe alterada, email confirmado, perfil admin ativo.', v_email;
end
$$;

-- Confirmação. Todas as colunas devem mostrar ✓.
select
  u.email,
  case when u.email_confirmed_at is not null then '✓' else '✗' end as email_confirmado,
  case when u.encrypted_password is not null then '✓' else '✗' end as tem_password,
  case when p.role = 'admin'                 then '✓' else '✗ ' || coalesce(p.role, 'sem perfil') end as e_admin,
  case when p.is_active                      then '✓' else '✗' end as ativo
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;
