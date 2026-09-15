-- Dados de teste deterministas.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.pt',    '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'operador@teste.pt', '{"full_name":"Bruno Operador"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'operador2@teste.pt','{"full_name":"Carla Operadora"}');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.companies (id, name, code, allocated_kits) values
  ('00000000-0000-0000-0000-0000000000c1', 'Empresa A', 'EMPA', 3),
  ('00000000-0000-0000-0000-0000000000c2', 'Empresa B', 'EMPB', 1);

insert into public.employees (id, employee_number, name, company_id) values
  ('00000000-0000-0000-0000-0000000000e1', '12345', 'João Silva', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000e2', '12346', 'Ana Costa',  '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000e3', '12347', 'Rui Sousa',  '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000e4', '12348', 'Sara Dias',  '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000e5', '98989', 'Paulo Reis', '00000000-0000-0000-0000-0000000000c2');

commit;
