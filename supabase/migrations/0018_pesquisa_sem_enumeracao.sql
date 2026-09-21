-- =============================================================================
-- Fechar a pesquisa por nome como porta de enumeração.
--
-- O RLS reserva a tabela `employees` aos administradores, para que ninguém
-- consiga listar 2253 pessoas. A pesquisa por nome contornava-o sem querer:
--
--   * bastava "a " — uma letra e um espaço — para receber dez nomes, e
--     variando a letra e o prefixo percorria-se a base toda;
--   * o campo `total` devolvia a contagem exata (2254 num teste real), o que
--     dizia a quem varria quantas pessoas faltavam.
--
-- Medido antes da correção, com um distribuidor que lê ZERO linhas da tabela:
--   "a "  -> total 2254, 10 devolvidos
--   "o "  -> total 2255, 10 devolvidos
--
-- Duas mudanças, ambas pequenas:
--   1. o termo passa a precisar de 3 caracteres, além do espaço;
--   2. o total só é exato quando a lista não foi cortada.
--
-- O que NÃO muda: a pesquisa por email continua exata, a pesquisa por número
-- continua noutra função, e o fluxo normal do balcão ("Miguel ", "Daniela S")
-- continua igual.
--
-- Nomes com menos de três letras — "Zé" — passam a precisar do apelido
-- ("Zé S") ou do número. É a troca, e é deliberada.
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
  --
  -- O espaço sozinho não chega: "a " tem espaço e devolvia dez nomes, o que
  -- fazia desta função a porta das traseiras do RLS de `employees`. Três
  -- caracteres não impedem quem esteja determinado, mas transformam uma
  -- varredura de 26 pesquisas numa de milhares — e nenhuma pesquisa legítima
  -- de balcão é mais curta do que isso.
  v_tem_espaco := v_bruto ~ '\S\s' and length(v_termo) >= 3;

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

  -- O total exato só sai quando cabe todo na resposta. Acima disso, dizer
  -- "2254" a quem só pode ver dez é entregar o tamanho do universo — e era
  -- com esse número que se sabia quando a varredura tinha acabado. A
  -- interface não precisa dele para dizer "refine a pesquisa".
  return jsonb_build_object(
    'results', v_linhas,
    'total', least(v_total, 11),
    'truncated', v_total > 10
  );
end;
$$;
