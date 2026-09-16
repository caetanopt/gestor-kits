-- =============================================================================
-- A palavra-passe que estou a escrever é mesmo a que está guardada?
--
-- Este teste é decisivo. Se devolver ✓ e o login continuar a falhar, então o
-- problema NÃO é a palavra-passe — é a aplicação não estar a falar com este
-- projeto Supabase, ou o login por email estar desativado nas definições de
-- autenticação.
--
-- Substitua o email e a palavra-passe pelos valores que está a usar no ecrã
-- de login. Só leitura: não altera nada.
-- =============================================================================

select
  u.email,
  case
    when u.encrypted_password is null
      then '✗ a conta não tem palavra-passe definida'
    when u.encrypted_password = extensions.crypt(
           'ESCREVA-AQUI-A-PASSWORD',           -- ← a palavra-passe que está a tentar
           u.encrypted_password
         )
      then '✓ a palavra-passe está correta — o problema é outro'
    else '✗ a palavra-passe NÃO corresponde'
  end as resultado,
  u.email_confirmed_at is not null as email_confirmado,
  u.banned_until,
  u.deleted_at
from auth.users u
where lower(u.email) = lower('o-seu@email.pt');  -- ← o seu email
