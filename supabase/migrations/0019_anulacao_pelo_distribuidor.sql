-- =============================================================================
-- O distribuidor passa a poder anular uma entrega.
--
-- Até aqui a anulação era `is_admin()`, e vivia só na página de Histórico —
-- que um distribuidor não vê. Na prática, um kit entregue à pessoa errada
-- ficava entregue até alguém com acesso administrativo o corrigir, o que
-- durante um evento quer dizer: não é corrigido.
--
-- O que NÃO muda:
--   * a anulação continua suave — a entrega fica na tabela, com reversed_at,
--     reversed_by e o motivo;
--   * continua a ser impossível anular duas vezes (ALREADY_REVERSED);
--   * o `for update` continua a serializar duas anulações concorrentes;
--   * fica registado em delivery_logs quem anulou, e quando.
--
-- O que muda: quem pode. Passa a ser qualquer conta ativa.
--
-- Considerei limitar o distribuidor às entregas que ele próprio fez, ou a
-- uma janela de tempo. Ficou de fora: o engano mais provável num balcão com
-- vários postos é o operador A entregar mal e ser o operador B a dar por
-- isso, e uma regra dessas transformava a correção num impasse. A defesa
-- aqui é o rasto, não a permissão — e o rasto está completo.
-- =============================================================================

create or replace function public.reverse_delivery(
  p_delivery_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_delivery public.deliveries%rowtype;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then
    perform public.app_error('UNAUTHENTICATED');
  end if;
  -- Qualquer conta ativa, e já não só administradores.
  --
  -- Quem dá pelo engano é quem está ao balcão, no segundo a seguir: o kit
  -- ainda está na mão e a pessoa certa está à espera. Obrigar a chamar um
  -- administrador era garantir que o engano ficava por corrigir durante o
  -- evento e aparecia nos números no dia seguinte.
  --
  -- Nada se perde: a anulação continua a ser suave — a linha fica, com
  -- reversed_at, reversed_by e o motivo — e o registo DELIVERY_REVERSED diz
  -- quem anulou. O que muda é quem pode, não o que fica escrito.
  if not public.is_active_user() then
    perform public.app_error('INACTIVE_ACCOUNT');
  end if;

  select * into v_delivery
    from public.deliveries
   where id = p_delivery_id
     for update;

  if not found then
    perform public.app_error('DELIVERY_NOT_FOUND');
  end if;

  -- Idempotente: anular duas vezes é um conflito explícito, não um erro
  -- silencioso que descontaria stock a mais.
  if v_delivery.reversed_at is not null then
    perform public.app_error('ALREADY_REVERSED');
  end if;

  update public.deliveries
     set reversed_at     = now(),
         reversed_by     = v_actor,
         reversal_reason = v_reason
   where id = p_delivery_id;

  insert into public.delivery_logs
    (employee_id, company_id, delivery_id, action, performed_by, notes)
  values
    (v_delivery.employee_id, v_delivery.company_id, v_delivery.id,
     'DELIVERY_REVERSED', v_actor, v_reason);

  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'employeeId', v_delivery.employee_id,
    'totals', public.totals_snapshot(v_delivery.company_id)
  );
end;
$$;
