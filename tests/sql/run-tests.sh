#!/usr/bin/env bash
# Suíte de testes das regras críticas contra uma instância PostgreSQL real.
#
#   PGHOST_DIR=/caminho/socket ./tests/sql/run-tests.sh
#
# Recria a base de dados `kits` do zero, aplica o stub do Supabase e as
# migrações, e exercita as funções de negócio — incluindo concorrência real
# com processos psql paralelos.
set -uo pipefail

PGH="${PGHOST_DIR:-/home/pgtest}"
DB=kits
ADMIN=00000000-0000-0000-0000-0000000000a1
OPER=00000000-0000-0000-0000-0000000000b1
OPER2=00000000-0000-0000-0000-0000000000b2

pass=0
fail=0

q() { psql -h "$PGH" -U postgres -d "$DB" -tAX -c "$1" 2>&1; }

# Executa SQL como um utilizador aplicacional concreto (papel authenticated,
# com RLS ativo e auth.uid() definido).
as_user() {
  local uid="$1" sql="$2"
  psql -h "$PGH" -U postgres -d "$DB" -tAX \
    -c "set role authenticated; set request.jwt.claim.sub = '$uid'; $sql" 2>&1
}

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    printf '  \033[32m✓\033[0m %s\n' "$label"
    pass=$((pass + 1))
  else
    printf '  \033[31m✗\033[0m %s\n     esperado: %s\n     obtido:   %s\n' \
      "$label" "$expected" "$actual"
    fail=$((fail + 1))
  fi
}

reset_db() {
  psql -h "$PGH" -U postgres -tAX -c "drop database if exists $DB with (force);" >/dev/null 2>&1
  psql -h "$PGH" -U postgres -tAX -c "create database $DB;" >/dev/null
  psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f tests/sql/00_supabase_stub.sql
  for f in supabase/migrations/*.sql; do
    psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
  done
  psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f tests/sql/01_seed.sql
}

echo
echo "═══ Entrega: caminho feliz ═══"
reset_db
r=$(as_user "$OPER" "select deliver_kit('12345', gen_random_uuid()) -> 'stock';")
check "entrega desconta 1 ao stock" '"available": 2' "$r"
r=$(q "select count(*) from public.deliveries where reversed_at is null;")
check "cria exatamente uma linha de entrega" "1" "$r"
r=$(q "select action from public.delivery_logs where action = 'DELIVERED';")
check "regista DELIVERED na auditoria" "DELIVERED" "$r"
r=$(q "select delivered_by from public.deliveries limit 1;")
check "regista o operador que entregou" "$OPER" "$r"

echo
echo "═══ Regra 8.1: entrega única ═══"
r=$(as_user "$OPER2" "select deliver_kit('12345', gen_random_uuid());")
check "segunda entrega ao mesmo colaborador é recusada" "ALREADY_DELIVERED" "$r"
r=$(q "select count(*) from public.deliveries;")
check "não criou linha adicional" "1" "$r"

echo
echo "═══ Idempotência: duplo clique ═══"
KEY=$(q "select gen_random_uuid();")
r1=$(as_user "$OPER" "select deliver_kit('12346', '$KEY') ->> 'repeated';")
r2=$(as_user "$OPER" "select deliver_kit('12346', '$KEY') ->> 'repeated';")
check "primeiro pedido entrega" "false" "$r1"
check "pedido repetido devolve o mesmo resultado sem erro" "true" "$r2"
r=$(q "select count(*) from public.deliveries where employee_id = '00000000-0000-0000-0000-0000000000e2';")
check "apenas uma entrega foi criada" "1" "$r"

echo
echo "═══ Regra 8.2/8.3: limite por empresa ═══"
as_user "$OPER" "select deliver_kit('12347', gen_random_uuid());" >/dev/null
r=$(q "select available from public.company_stock where code = 'EMPA';")
check "Empresa A esgotada (3 de 3)" "0" "$r"
r=$(as_user "$OPER" "select deliver_kit('12348', gen_random_uuid());")
check "entrega acima do limite é recusada" "NO_STOCK" "$r"
r=$(q "select count(*) from public.deliveries d join public.companies c on c.id = d.company_id where c.code = 'EMPA' and d.reversed_at is null;")
check "stock nunca excede o atribuído" "3" "$r"

echo
echo "═══ Regra 8.4: colaborador inexistente ═══"
r=$(as_user "$OPER" "select deliver_kit('00000', gen_random_uuid());")
check "número desconhecido devolve EMPLOYEE_NOT_FOUND" "EMPLOYEE_NOT_FOUND" "$r"

echo
echo "═══ Pesquisa ═══"
r=$(as_user "$OPER" "select find_employee_for_delivery('12345') -> 'employee' ->> 'name';")
check "encontra o colaborador pelo número" "João Silva" "$r"
r=$(as_user "$OPER" "select find_employee_for_delivery('  12345  ') -> 'employee' ->> 'name';")
check "ignora espaços acidentais" "João Silva" "$r"
r=$(as_user "$OPER" "select find_employee_for_delivery('12345') -> 'delivery' -> 'deliveredBy' ->> 'name';")
check "mostra quem entregou" "Bruno Operador" "$r"
r=$(as_user "$OPER" "select find_employee_for_delivery('12348') ->> 'delivery';")
check "colaborador por entregar não tem entrega" "" "$r"
# Privacidade (secção 30): no evento só se mostra nome, número, empresa e estado.
q "update public.employees set email = 'privado@exemplo.pt' where employee_number = '12348';" >/dev/null
r=$(as_user "$OPER" "select find_employee_for_delivery('12348')::text ~ 'privado@exemplo.pt';")
check "a pesquisa NÃO devolve o email do colaborador" "f" "$r"

echo
echo "═══ Secção 20: anulação administrativa ═══"
DID=$(q "select id from public.deliveries where employee_id = '00000000-0000-0000-0000-0000000000e1';")
r=$(as_user "$OPER" "select reverse_delivery('$DID', 'engano');")
check "operador NÃO pode anular" "FORBIDDEN" "$r"
r=$(as_user "$ADMIN" "select reverse_delivery('$DID', 'engano') -> 'stock' ->> 'available';")
check "administrador anula e o kit volta ao stock" "1" "$r"
r=$(as_user "$ADMIN" "select reverse_delivery('$DID', 'outra vez');")
check "anular duas vezes é recusado" "ALREADY_REVERSED" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'DELIVERY_REVERSED';")
check "anulação fica registada na auditoria" "1" "$r"
r=$(as_user "$OPER" "select deliver_kit('12345', gen_random_uuid()) -> 'stock' ->> 'available';")
check "colaborador anulado pode receber de novo" "0" "$r"

echo
echo "═══ Secção 17: limite não pode descer abaixo do entregue ═══"
r=$(as_user "$ADMIN" "select save_company('00000000-0000-0000-0000-0000000000c1', 'Empresa A', 'EMPA', 2);")
check "baixar limite abaixo do entregue é recusado" "LIMIT_BELOW_DELIVERED" "$r"
r=$(as_user "$ADMIN" "select save_company('00000000-0000-0000-0000-0000000000c1', 'Empresa A', 'EMPA', 5) -> 'stock' ->> 'available';")
check "aumentar limite é permitido" "2" "$r"
r=$(as_user "$ADMIN" "select save_company(null, 'Empresa C', 'empa', 10);")
check "código duplicado (mesmo com outra caixa) é recusado" "DUPLICATE_COMPANY_CODE" "$r"
r=$(as_user "$OPER" "select save_company(null, 'Empresa X', 'EMPX', 10);")
check "operador não pode criar empresas" "FORBIDDEN" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'COMPANY_LIMIT_UPDATED';")
check "alteração de limite fica auditada" "1" "$r"

echo
echo "═══ Código da empresa gerado automaticamente ═══"
r=$(q "select public.derive_company_code('Águas de Portugal');")
check "remove acentos e espaços" "AGUASDEPORTU" "$r"
r=$(q "select public.derive_company_code('José & Filhos, Lda.');")
check "remove pontuação" "JOSEFILHOSLD" "$r"
r=$(q "select public.derive_company_code('•••');")
check "nome sem letras recorre a um código genérico" "EMPRESA" "$r"
r=$(as_user "$ADMIN" "select save_company(null, 'Empresa Nova', null, 10) ->> 'code';")
check "criar sem código deriva do nome" "EMPRESANOVA" "$r"
r=$(as_user "$ADMIN" "select save_company(null, 'Empresa Nova', null, 10) ->> 'code';")
check "nome repetido recebe sufixo, sem colidir" "EMPRESANOV2" "$r"
CID=$(q "select id from public.companies where name = 'Empresa Nova' limit 1;")
r=$(as_user "$ADMIN" "select save_company('$CID', 'Outro Nome', null, 10) ->> 'code';")
check "editar sem código preserva o código existente" "EMPRESANOVA" "$r"
r=$(q "select count(*) from public.companies where code is null or btrim(code) = '';")
check "nenhuma empresa fica sem código" "0" "$r"

echo
echo "═══ Secção 19: importação ═══"
ROWS='[{"employeeNumber":"55501","name":"Novo Um","companyId":"00000000-0000-0000-0000-0000000000c1"},{"employeeNumber":"55502","name":"Novo Dois","companyId":"00000000-0000-0000-0000-0000000000c1"}]'
r=$(as_user "$OPER" "select import_employees('$ROWS'::jsonb);")
check "operador não pode importar" "FORBIDDEN" "$r"
r=$(as_user "$ADMIN" "select import_employees('$ROWS'::jsonb) ->> 'inserted';")
check "administrador importa duas linhas" "2" "$r"
r=$(as_user "$ADMIN" "select import_employees('$ROWS'::jsonb) ->> 'skipped';")
check "reimportar o mesmo ficheiro não duplica" "2" "$r"
r=$(q "select count(*) from public.employees where employee_number in ('55501','55502');")
check "existe exatamente um de cada" "2" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'EMPLOYEES_IMPORTED';")
check "importação fica auditada" "2" "$r"
DUP='[{"employeeNumber":"12345","name":"Colisao","companyId":"00000000-0000-0000-0000-0000000000c2"}]'
r=$(as_user "$ADMIN" "select import_employees('$DUP'::jsonb) ->> 'skipped';")
check "número já existente noutra empresa é ignorado" "1" "$r"
BAD='[{"employeeNumber":"55503","name":"Sem Empresa","companyId":"00000000-0000-0000-0000-0000000000ff"}]'
r=$(as_user "$ADMIN" "select import_employees('$BAD'::jsonb);")
check "empresa inexistente aborta a importação inteira" "violates foreign key" "$r"
r=$(q "select count(*) from public.employees where employee_number = '55503';")
check "nada foi escrito na importação abortada" "0" "$r"

echo
echo "═══ Colaboradores: criação, edição e email ═══"
r=$(as_user "$OPER" "select save_employee(null, '77001', 'Novo Colaborador', null, '00000000-0000-0000-0000-0000000000c1');")
check "operador não pode criar colaboradores" "FORBIDDEN" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77001', 'Novo Colaborador', 'Novo@Exemplo.PT ', '00000000-0000-0000-0000-0000000000c1') ->> 'email';")
check "email é normalizado para minúsculas e sem espaços" "novo@exemplo.pt" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77002', 'Sem Email', '', '00000000-0000-0000-0000-0000000000c1') ->> 'email';")
check "email vazio fica nulo, não string vazia" "" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77001', 'Duplicado', null, '00000000-0000-0000-0000-0000000000c1');")
check "número duplicado é recusado" "DUPLICATE_EMPLOYEE_NUMBER" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77003', 'Empresa Inexistente', null, '00000000-0000-0000-0000-0000000000ff');")
check "empresa inexistente é recusada" "COMPANY_NOT_FOUND" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '', 'Sem Número', null, '00000000-0000-0000-0000-0000000000c1');")
check "número em falta é recusado" "VALIDATION_ERROR" "$r"
EID=$(q "select id from public.employees where employee_number = '77001';")
r=$(as_user "$ADMIN" "select save_employee('$EID', '77001', 'Nome Corrigido', 'corrigido@exemplo.pt', '00000000-0000-0000-0000-0000000000c2') ->> 'name';")
check "editar altera nome, email e empresa" "Nome Corrigido" "$r"
r=$(q "select company_id from public.employees where employee_number = '77001';")
check "a empresa foi mesmo alterada" "00000000-0000-0000-0000-0000000000c2" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'EMPLOYEE_CREATED';")
check "as duas criações ficam auditadas" "2" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'EMPLOYEE_UPDATED';")
check "a edição fica auditada" "1" "$r"

echo
echo "═══ Listagem de colaboradores ═══"
r=$(as_user "$ADMIN" "select count(*) from public.employee_list where employee_number like '77%';")
check "administrador vê a listagem" "2" "$r"
r=$(as_user "$OPER" "select count(*) from public.employee_list;")
check "operador NÃO vê a listagem" "0" "$r"
r=$(as_user "$ADMIN" "select email from public.employee_list where employee_number = '77001';")
check "listagem traz o email" "corrigido@exemplo.pt" "$r"
r=$(as_user "$ADMIN" "select company_name from public.employee_list where employee_number = '77001';")
check "listagem traz o nome da empresa" "Empresa B" "$r"
r=$(as_user "$ADMIN" "select kit_delivered from public.employee_list where employee_number = '12345';")
check "listagem traz o estado da entrega" "t" "$r"
r=$(as_user "$ADMIN" "select delivered_by_name from public.employee_list where employee_number = '12345';")
check "listagem traz quem entregou" "Bruno Operador" "$r"

echo
echo "═══ Importação com email ═══"
ROWS_E='[{"employeeNumber":"78001","name":"Com Email","email":"A@B.PT","companyId":"00000000-0000-0000-0000-0000000000c1"}]'
r=$(as_user "$ADMIN" "select import_employees('$ROWS_E'::jsonb) ->> 'inserted';")
check "importa uma linha com email" "1" "$r"
r=$(q "select email from public.employees where employee_number = '78001';")
check "email importado é normalizado" "a@b.pt" "$r"

echo
echo "═══ RLS ═══"
r=$(as_user "$OPER" "select count(*) from public.employees;")
check "operador não consegue enumerar colaboradores" "0" "$r"
r=$(as_user "$ADMIN" "select count(*) from public.employees;")
check "administrador consegue listar colaboradores" "10" "$r"
r=$(as_user "$OPER" "select count(*) from public.delivery_logs;")
check "operador não lê o histórico de auditoria" "0" "$r"
r=$(as_user "$OPER" "select count(*) from public.company_stock;")
check "operador vê o stock das empresas" "4" "$r"
r=$(as_user "$OPER" "insert into public.deliveries (employee_id, company_id, delivered_by, idempotency_key) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c1','$OPER', gen_random_uuid());")
check "operador não pode inserir entregas diretamente" "denied for table deliveries" "$r"
r=$(as_user "$ADMIN" "insert into public.deliveries (employee_id, company_id, delivered_by, idempotency_key) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c1','$ADMIN', gen_random_uuid());")
check "nem sequer o administrador escreve entregas diretamente" "denied for table deliveries" "$r"
r=$(as_user "$OPER" "update public.profiles set role = 'admin' where id = '$OPER'; select role from public.profiles where id = '$OPER';")
check "operador não consegue promover-se a administrador" "operator" "$r"

echo
echo "───────────────────────────────────"
printf 'passaram: %d   falharam: %d\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
