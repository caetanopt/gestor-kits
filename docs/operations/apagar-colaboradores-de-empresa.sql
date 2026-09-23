-- =============================================================================
-- Apagar todos os colaboradores de UMA empresa.
--
-- A empresa fica; só os colaboradores dela saem, com as entregas e o
-- histórico deles. As outras empresas não são tocadas.
--
-- ANTES DE CORRER: exporte a lista dessa empresa.
--   Dashboard → botão "CSV" na linha da empresa. Isto não tem anulação.
--
-- Correr no SQL Editor do Supabase, no projeto da aplicação, em dois passos.
-- =============================================================================


-- ─── PASSO 1 — Identificar a empresa (só lê, não apaga nada) ────────────────
-- O identificador das empresas é um UUID, não um número. Esta lista numera
-- as empresas pela mesma ordem do Dashboard (por nome) e mostra o CÓDIGO, que
-- é o que o passo 2 usa. Confirme o nome antes de avançar.

select row_number() over (order by c.name) as n,
       c.name                              as empresa,
       c.code                              as codigo,
       count(e.id)                         as colaboradores,
       count(d.id)                         as kits_entregues
  from public.companies c
  left join public.employees e  on e.company_id = c.id
  left join public.deliveries d on d.employee_id = e.id and d.reversed_at is null
 group by c.id, c.name, c.code
 order by c.name;


-- ─── PASSO 2 — Apagar (selecione só este bloco e corra) ─────────────────────
-- 1. Troque COLE_AQUI_O_CODIGO pelo código da empresa (coluna "codigo" acima).
-- 2. Se a empresa já tiver kits entregues, o script PÁRA sem apagar nada.
--    Para apagar mesmo assim, entregas incluídas, mude v_apagar_entregas para
--    true — os totais do Dashboard descem esse número de kits.

begin;

do $$
declare
  v_codigo            text    := 'COLE_AQUI_O_CODIGO';
  v_apagar_entregas   boolean := false;

  v_empresa           public.companies%rowtype;
  v_colaboradores     integer;
  v_entregas_ativas   integer;
  v_entregas_todas    integer;
  v_historico         integer;
  v_outros_antes      integer;
  v_empresas_antes    integer;
begin
  select * into v_empresa
    from public.companies
   where code_key = upper(btrim(v_codigo));
  if not found then
    raise exception 'Não existe nenhuma empresa com o código "%". Nada foi apagado.', v_codigo;
  end if;

  select count(*) into v_colaboradores
    from public.employees where company_id = v_empresa.id;
  select count(*) filter (where d.reversed_at is null), count(*)
    into v_entregas_ativas, v_entregas_todas
    from public.deliveries d
    join public.employees e on e.id = d.employee_id
   where e.company_id = v_empresa.id;
  select count(*) into v_historico
    from public.delivery_logs l
    join public.employees e on e.id = l.employee_id
   where e.company_id = v_empresa.id;
  select count(*) into v_outros_antes
    from public.employees where company_id <> v_empresa.id;
  select count(*) into v_empresas_antes from public.companies;

  raise notice 'EMPRESA: % (código %)', v_empresa.name, v_empresa.code;
  raise notice 'A APAGAR: % colaboradores, % entregas (% ativas), % linhas de histórico',
    v_colaboradores, v_entregas_todas, v_entregas_ativas, v_historico;

  if v_entregas_ativas > 0 and not v_apagar_entregas then
    raise exception
      'A empresa % tem % kits entregues. Nada foi apagado. Para apagar mesmo assim, ponha v_apagar_entregas a true.',
      v_empresa.name, v_entregas_ativas;
  end if;

  -- Histórico destes colaboradores: a coluna é ON DELETE SET NULL, e sem
  -- isto ficavam linhas na página Histórico com nome e número em branco.
  delete from public.delivery_logs l
   using public.employees e
   where e.id = l.employee_id and e.company_id = v_empresa.id;

  -- Entregas antes dos colaboradores: a chave estrangeira é RESTRICT.
  delete from public.deliveries d
   using public.employees e
   where e.id = d.employee_id and e.company_id = v_empresa.id;

  delete from public.employees where company_id = v_empresa.id;

  -- Rede de segurança: nada fora desta empresa pode ter mudado.
  if (select count(*) from public.employees where company_id <> v_empresa.id) <> v_outros_antes then
    raise exception 'Colaboradores de outras empresas foram afetados. Nada foi apagado.';
  end if;
  if (select count(*) from public.companies) <> v_empresas_antes then
    raise exception 'As empresas foram afetadas. Nada foi apagado.';
  end if;

  raise notice 'FEITO: a empresa % ficou com % colaboradores. As outras continuam com %.',
    v_empresa.name,
    (select count(*) from public.employees where company_id = v_empresa.id),
    v_outros_antes;
end;
$$;

commit;
