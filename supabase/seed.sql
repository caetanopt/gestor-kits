-- Dados de demonstração para desenvolvimento local (`pnpm db:reset`).
-- NÃO é aplicado em produção.
--
-- Cria três empresas e alguns colaboradores. Os utilizadores são criados
-- através do registo normal; para promover o primeiro a administrador:
--
--   update public.profiles set role = 'admin' where email = 'o-seu@email.pt';

insert into public.companies (name, code, allocated_kits) values
  ('Empresa A', 'EMPA', 120),
  ('Empresa B', 'EMPB', 80),
  ('Empresa C', 'EMPC', 200)
on conflict do nothing;

insert into public.employees (employee_number, name, company_id)
select
  n.number,
  n.name,
  (select id from public.companies where code = n.code)
from (values
  ('12345', 'João Silva',  'EMPA'),
  ('12346', 'Ana Costa',   'EMPA'),
  ('12347', 'Rui Sousa',   'EMPA'),
  ('23456', 'Marta Lopes', 'EMPB'),
  ('23457', 'Pedro Nunes', 'EMPB'),
  ('34567', 'Inês Ramos',  'EMPC')
) as n(number, name, code)
on conflict do nothing;
