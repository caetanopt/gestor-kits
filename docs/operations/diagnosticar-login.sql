-- =============================================================================
-- Diagnóstico de falha no login.
--
-- Cole no SQL Editor do Supabase. Só leitura — não altera nada.
-- A coluna `diagnostico` diz o que está errado em cada conta.
-- =============================================================================
select
  u.email,
  case
    when u.email_confirmed_at is null
      then '✗ EMAIL POR CONFIRMAR — o login vai falhar'
    when p.id is null
      then '✗ SEM PERFIL — o trigger on_auth_user_created não correu'
    when not p.is_active
      then '✗ CONTA DESATIVADA'
    else '✓ pode entrar'
  end                                            as diagnostico,
  coalesce(p.role, '(sem perfil)')               as perfil,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;
