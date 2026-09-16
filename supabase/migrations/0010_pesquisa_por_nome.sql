-- =============================================================================
-- Pesquisa por nome ou email no ecrã de distribuição.
--
-- Duas regras diferentes, de propósito:
--
--   * EMAIL — correspondência exata. Um email é um identificador: quem o
--     escreve sabe qual é, e a pesquisa parcial só serviria para descobrir
--     moradas alheias.
--
--   * NOME — parcial, mas apenas depois do primeiro espaço. Escrever "Ana"
--     não sugere nada; "Ana " já sugere. Exigir um nome próprio inteiro antes
--     de listar seja quem for é o que mantém esta pesquisa útil sem a
--     transformar num diretório de pessoas (secção 30 da especificação).
--
-- A pesquisa por número continua noutra função, com correspondência exata.
-- Nenhuma delas dá ao distribuidor leitura direta da tabela de colaboradores.
-- =============================================================================
create or replace function public.search_employees_for_delivery(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bruto      text := coalesce(p_query, '');
  v_termo      text := btrim(v_bruto);
  v_tem_espaco boolean;
  v_padrao     text;
  v_linhas     jsonb;
  v_total      integer;
begin
  if auth.uid() is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  if not public.is_active_user() then
    perform public.app_error('INACTIVE_ACCOUNT');
  end if;
  if v_termo = '' then
    return jsonb_build_object('results', '[]'::jsonb, 'total', 0, 'truncated', false);
  end if;

  -- 1. Email: correspondência exata.
  select count(*)::integer into v_total
    from public.employees e
   where lower(e.email) = lower(v_termo);

  if v_total > 0 then
    select jsonb_agg(
             jsonb_build_object(
               'id', e.id,
               'employeeNumber', e.employee_number,
               'name', e.name,
               'companyName', c.name,
               'kitDelivered', exists (
                 select 1 from public.deliveries d
                  where d.employee_id = e.id and d.reversed_at is null
               ),
               'email', e.email
             ) order by e.name
           )
      into v_linhas
      from public.employees e
      join public.companies c on c.id = e.company_id
     where lower(e.email) = lower(v_termo);

    return jsonb_build_object(
      'results', coalesce(v_linhas, '[]'::jsonb),
      'total', v_total,
      'truncated', false
    );
  end if;

  -- 2. Nome: só depois do primeiro espaço.
  --
  -- Repare que a verificação é sobre o texto POR APARAR: "Ana " tem espaço,
  -- "Ana" não. É essa a diferença entre estar a escrever e ter escrito.
  v_tem_espaco := v_bruto ~ '\S\s';

  if not v_tem_espaco then
    return jsonb_build_object(
      'results', '[]'::jsonb,
      'total', 0,
      'truncated', false,
      'aguarda', true
    );
  end if;

  -- `%`, `_` e `\` são especiais em ILIKE: escapados, para que uma pesquisa
  -- por curingas não devolva a base de dados inteira.
  v_padrao := replace(v_termo, '\', '\\');
  v_padrao := replace(v_padrao, '%', '\%');
  v_padrao := '%' || replace(v_padrao, '_', '\_') || '%';

  select count(*)::integer into v_total
    from public.employees e
   where e.name ilike v_padrao escape '\';

  select coalesce(jsonb_agg(linha order by linha ->> 'name'), '[]'::jsonb)
    into v_linhas
    from (
      select jsonb_build_object(
               'id', e.id,
               'employeeNumber', e.employee_number,
               'name', e.name,
               'companyName', c.name,
               'kitDelivered', exists (
                 select 1 from public.deliveries d
                  where d.employee_id = e.id and d.reversed_at is null
               ),
               -- Quem pesquisou por nome não precisa de ver as moradas de
               -- toda a gente.
               'email', null
             ) as linha
        from public.employees e
        join public.companies c on c.id = e.company_id
       where e.name ilike v_padrao escape '\'
       order by e.name
       limit 10
    ) t;

  return jsonb_build_object(
    'results', v_linhas,
    'total', v_total,
    'truncated', v_total > 10
  );
end;
$$;

revoke execute on function public.search_employees_for_delivery(text) from public, anon;
grant execute on function public.search_employees_for_delivery(text) to authenticated;
