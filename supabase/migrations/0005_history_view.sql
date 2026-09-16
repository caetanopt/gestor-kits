-- =============================================================================
-- Vista do histórico.
--
-- A secção 21 pede colaborador, número, empresa, ação, operador, data e hora
-- numa só listagem. Uma vista resolve as junções de uma vez, em vez de
-- depender das relações inferidas pelo PostgREST — que teriam de ser
-- desambiguadas à mão porque `delivery_logs` referencia `profiles` e
-- `deliveries` referencia `profiles` duas vezes.
--
-- security_invoker: a vista respeita o RLS de quem consulta. Como
-- `delivery_logs` só é legível por administradores, o histórico também é.
-- =============================================================================
create view public.delivery_history
with (security_invoker = on) as
select
  l.id,
  l.action,
  l.performed_at,
  l.notes,
  l.metadata,
  l.employee_id,
  e.employee_number,
  e.name                                            as employee_name,
  l.company_id,
  c.name                                            as company_name,
  c.code                                            as company_code,
  l.delivery_id,
  d.reversed_at,
  -- Uma entrega ainda ativa é a única que pode ser anulada.
  (d.id is not null and d.reversed_at is null)      as is_active_delivery,
  l.performed_by,
  coalesce(nullif(p.full_name, ''), p.email, '—')   as performed_by_name
from public.delivery_logs l
left join public.employees e on e.id = l.employee_id
left join public.companies c on c.id = l.company_id
left join public.deliveries d on d.id = l.delivery_id
left join public.profiles  p on p.id = l.performed_by;

comment on view public.delivery_history is
  'Histórico legível: junta auditoria, colaborador, empresa, entrega e operador.';

revoke all on public.delivery_history from anon;
grant select on public.delivery_history to authenticated;
