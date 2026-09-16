-- =============================================================================
-- Correções para as falhas de login mais comuns.
--
-- Execute APENAS o bloco correspondente ao diagnóstico obtido em
-- diagnosticar-login.sql. Substitua sempre o email.
-- =============================================================================

-- ─── Caso 1: EMAIL POR CONFIRMAR ────────────────────────────────────────────
-- Acontece quando a conta é criada sem ligar "Auto Confirm User".
-- Alternativa pela interface: Authentication > Users > ... > Confirm email
update auth.users
   set email_confirmed_at = now()
 where email = 'o-seu@email.pt'
   and email_confirmed_at is null;

-- ─── Caso 2: SEM PERFIL ─────────────────────────────────────────────────────
-- Acontece se a conta foi criada ANTES de as migrações terem sido aplicadas,
-- porque o trigger ainda não existia. Cria o perfil em falta.
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, '', 'operator'
  from auth.users u
 where u.email = 'o-seu@email.pt'
   and not exists (select 1 from public.profiles p where p.id = u.id);

-- ─── Caso 3: CONTA DESATIVADA ───────────────────────────────────────────────
update public.profiles
   set is_active = true
 where email = 'o-seu@email.pt';

-- ─── Promover a administrador ───────────────────────────────────────────────
update public.profiles
   set role = 'admin'
 where email = 'o-seu@email.pt';

-- ─── Confirmar o resultado ──────────────────────────────────────────────────
select u.email, u.email_confirmed_at is not null as confirmado,
       p.role, p.is_active
  from auth.users u
  left join public.profiles p on p.id = u.id
 where u.email = 'o-seu@email.pt';
