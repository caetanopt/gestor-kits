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
r=$(as_user "$OPER" "select deliver_kit('12345', gen_random_uuid()) -> 'totals' ->> 'delivered';")
check "entrega soma 1 ao total da empresa" "1" "$r"
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
echo "═══ Sem limite por empresa (migração 0011) ═══"
as_user "$OPER" "select deliver_kit('12347', gen_random_uuid());" >/dev/null
r=$(as_user "$OPER" "select deliver_kit('12348', gen_random_uuid()) -> 'totals' ->> 'delivered';")
check "entrega acima do antigo limite é aceite" "4" "$r"
r=$(q "select delivered from public.company_totals where code = 'EMPA';")
check "a vista conta o que foi entregue" "4" "$r"
r=$(q "select count(*) from public.deliveries d join public.companies c on c.id = d.company_id where c.code = 'EMPA' and d.reversed_at is null;")
check "todas as entregas ficam registadas" "4" "$r"

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
echo "═══ Pesquisa por nome ou email ═══"
q "update public.employees set email = 'joao.silva@empresa.pt' where employee_number = '12345';" >/dev/null
q "update public.employees set email = 'ana.costa@empresa.pt' where employee_number = '12346';" >/dev/null

echo "    — email: correspondência exata —"
r=$(as_user "$OPER" "select search_employees_for_delivery('ana.costa@empresa.pt') -> 'results' -> 0 ->> 'name';")
check "encontra pelo email completo" "Ana Costa" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('ANA.COSTA@EMPRESA.PT') -> 'results' -> 0 ->> 'name';")
check "não distingue maiúsculas" "Ana Costa" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('  ana.costa@empresa.pt  ') -> 'results' -> 0 ->> 'name';")
check "ignora espaços à volta" "Ana Costa" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('ana.costa') -> 'results';")
check "email parcial NÃO devolve nada" "[]" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('@empresa.pt') -> 'results';")
check "o domínio sozinho não lista toda a gente" "[]" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('ana.costa@empresa.pt') -> 'results' -> 0 ->> 'email';")
check "devolve o email quando foi ele que correspondeu" "ana.costa@empresa.pt" "$r"

echo "    — nome: só depois do primeiro espaço —"
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana') ->> 'aguarda';")
check "sem espaço, ainda não sugere" "true" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana') -> 'results';")
check "e não devolve resultados" "[]" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana ') -> 'results' -> 0 ->> 'name';")
check "com o espaço, já sugere" "Ana Costa" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana Costa') -> 'results' -> 0 ->> 'name';")
check "o nome completo restringe" "Ana Costa" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('joão silva') -> 'results' -> 0 ->> 'employeeNumber';")
check "não distingue maiúsculas no nome" "12345" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana ') -> 'results' -> 0 ->> 'email';")
check "NÃO devolve o email quando a correspondência foi pelo nome" "" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery(' ') -> 'results';")
check "só espaços não devolve nada" "[]" "$r"

echo "    — curingas e limites —"
r=$(as_user "$OPER" "select search_employees_for_delivery('% %') -> 'results';")
check "os curingas do ILIKE não devolvem toda a base de dados" "[]" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('_ _') -> 'results';")
check "o underscore também é escapado" "[]" "$r"
q "insert into public.employees (employee_number, name, email, company_id)
   select 'LIM' || i, 'Homonimo Teste ' || i, 'h' || i || '\@exemplo.pt',
          '00000000-0000-0000-0000-0000000000c1'
     from generate_series(1, 12) i;" >/dev/null
r=$(as_user "$OPER" "select jsonb_array_length(search_employees_for_delivery('Homonimo ') -> 'results');")
check "os resultados são limitados a 10" "10" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('Homonimo ') ->> 'total';")
check "o total real é reportado" "12" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('Homonimo ') ->> 'truncated';")
check "e assinala que há mais" "true" "$r"

echo "    — conteúdo dos resultados —"
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana ') -> 'results' -> 0 ->> 'kitDelivered';")
check "traz o estado da entrega" "true" "$r"
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana ') -> 'results' -> 0 ->> 'companyName';")
check "traz a empresa" "Empresa A" "$r"

echo "═══ Secção 20: anulação administrativa ═══"
DID=$(q "select id from public.deliveries where employee_id = '00000000-0000-0000-0000-0000000000e1';")
r=$(as_user "$OPER" "select reverse_delivery('$DID', 'engano');")
check "operador NÃO pode anular" "FORBIDDEN" "$r"
r=$(as_user "$ADMIN" "select reverse_delivery('$DID', 'engano') -> 'totals' ->> 'delivered';")
check "administrador anula e o total desce" "3" "$r"
r=$(as_user "$ADMIN" "select reverse_delivery('$DID', 'outra vez');")
check "anular duas vezes é recusado" "ALREADY_REVERSED" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'DELIVERY_REVERSED';")
check "anulação fica registada na auditoria" "1" "$r"
r=$(as_user "$OPER" "select deliver_kit('12345', gen_random_uuid()) -> 'totals' ->> 'delivered';")
check "colaborador anulado pode receber de novo" "4" "$r"

echo
echo "═══ Gravar empresa: nome e código ═══"
r=$(as_user "$ADMIN" "select save_company('00000000-0000-0000-0000-0000000000c1', 'Empresa A', 'EMPA') -> 'totals' ->> 'delivered';")
check "gravar devolve o que a empresa entregou" "4" "$r"
r=$(q "select allocated_kits from public.companies where code = 'EMPA';")
check "a coluna antiga fica intacta, apenas adormecida" "3" "$r"
r=$(as_user "$ADMIN" "select save_company(null, 'Empresa C', 'empa');")
check "código duplicado (mesmo com outra caixa) é recusado" "DUPLICATE_COMPANY_CODE" "$r"
r=$(as_user "$OPER" "select save_company(null, 'Empresa X', 'EMPX');")
check "operador não pode criar empresas" "FORBIDDEN" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'COMPANY_UPDATED';")
check "alteração fica auditada" "1" "$r"

echo
echo "═══ Código da empresa gerado automaticamente ═══"
r=$(q "select public.derive_company_code('Águas de Portugal');")
check "remove acentos e espaços" "AGUASDEPORTU" "$r"
r=$(q "select public.derive_company_code('José & Filhos, Lda.');")
check "remove pontuação" "JOSEFILHOSLD" "$r"
r=$(q "select public.derive_company_code('•••');")
check "nome sem letras recorre a um código genérico" "EMPRESA" "$r"
r=$(as_user "$ADMIN" "select save_company(null, 'Empresa Nova', null) ->> 'code';")
check "criar sem código deriva do nome" "EMPRESANOVA" "$r"
r=$(as_user "$ADMIN" "select save_company(null, 'Empresa Nova', null) ->> 'code';")
check "nome repetido recebe sufixo, sem colidir" "EMPRESANOV2" "$r"
CID=$(q "select id from public.companies where name = 'Empresa Nova' limit 1;")
r=$(as_user "$ADMIN" "select save_company('$CID', 'Outro Nome', null) ->> 'code';")
check "editar sem código preserva o código existente" "EMPRESANOVA" "$r"
r=$(q "select count(*) from public.companies where code is null or btrim(code) = '';")
check "nenhuma empresa fica sem código" "0" "$r"

echo
echo "═══ Secção 19: importação ═══"
ROWS='[{"employeeNumber":"55501","name":"Novo Um","email":"um@exemplo.pt","companyId":"00000000-0000-0000-0000-0000000000c1"},{"employeeNumber":"55502","name":"Novo Dois","email":"dois@exemplo.pt","companyId":"00000000-0000-0000-0000-0000000000c1"}]'
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
DUP='[{"employeeNumber":"12345","name":"Colisao","email":"c@exemplo.pt","companyId":"00000000-0000-0000-0000-0000000000c2"}]'
r=$(as_user "$ADMIN" "select import_employees('$DUP'::jsonb) ->> 'skipped';")
check "número já existente noutra empresa é ignorado" "1" "$r"
BAD='[{"employeeNumber":"55503","name":"Sem Empresa","email":"se@exemplo.pt","companyId":"00000000-0000-0000-0000-0000000000ff"}]'
r=$(as_user "$ADMIN" "select import_employees('$BAD'::jsonb);")
check "empresa inexistente aborta a importação inteira" "violates foreign key" "$r"
r=$(q "select count(*) from public.employees where employee_number = '55503';")
check "nada foi escrito na importação abortada" "0" "$r"

echo
echo "═══ Colaboradores: criação, edição e email ═══"
r=$(as_user "$OPER" "select save_employee(null, '77001', 'Novo Colaborador', 'op@exemplo.pt', '00000000-0000-0000-0000-0000000000c1');")
check "operador não pode criar colaboradores" "FORBIDDEN" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77001', 'Novo Colaborador', 'Novo@Exemplo.PT ', '00000000-0000-0000-0000-0000000000c1') ->> 'email';")
check "email é normalizado para minúsculas e sem espaços" "novo@exemplo.pt" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77002', 'Sem Email', '', '00000000-0000-0000-0000-0000000000c1');")
check "email vazio é recusado" "EMPLOYEE_EMAIL_REQUIRED" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77002', 'Com Email', 'dois@exemplo.pt', '00000000-0000-0000-0000-0000000000c1') ->> 'email';")
check "email preenchido é aceite" "dois@exemplo.pt" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77001', 'Duplicado', 'dup@exemplo.pt', '00000000-0000-0000-0000-0000000000c1');")
check "número duplicado é recusado" "DUPLICATE_EMPLOYEE_NUMBER" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '77003', 'Empresa Inexistente', 'x@exemplo.pt', '00000000-0000-0000-0000-0000000000ff');")
check "empresa inexistente é recusada" "COMPANY_NOT_FOUND" "$r"
r=$(as_user "$ADMIN" "select save_employee(null, '', 'Sem Número', 'y@exemplo.pt', '00000000-0000-0000-0000-0000000000c1');")
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
ROWS_S='[{"employeeNumber":"78002","name":"Sem Email","companyId":"00000000-0000-0000-0000-0000000000c1"}]'
r=$(as_user "$ADMIN" "select import_employees('$ROWS_S'::jsonb);")
check "importação recusa linha sem email" "EMPLOYEE_EMAIL_REQUIRED" "$r"
r=$(q "select count(*) from public.employees where employee_number = '78002';")
check "nada foi escrito nessa importação" "0" "$r"
r=$(q "select email from public.employees where employee_number = '78001';")
check "email importado é normalizado" "a@b.pt" "$r"

echo
echo "═══ Utilizadores: papéis e salvaguardas ═══"
r=$(q "select role from public.profiles where email = 'operador@teste.pt';")
check "o papel operator foi renomeado para distributor" "distributor" "$r"
r=$(as_user "$OPER" "select set_user_role('$OPER', 'admin');")
check "distribuidor não se pode promover" "FORBIDDEN" "$r"
r=$(as_user "$ADMIN" "select set_user_role('$OPER', 'admin') ->> 'role';")
check "administrador promove um distribuidor" "admin" "$r"
r=$(as_user "$ADMIN" "select set_user_role('$OPER', 'distributor') ->> 'role';")
check "administrador despromove de volta" "distributor" "$r"
r=$(as_user "$ADMIN" "select set_user_role('$ADMIN', 'inventado');")
check "papel desconhecido é recusado" "VALIDATION_ERROR" "$r"
r=$(as_user "$ADMIN" "select set_user_role('00000000-0000-0000-0000-0000000000ff', 'admin');")
check "utilizador inexistente é recusado" "USER_NOT_FOUND" "$r"

echo "    — salvaguarda do último administrador —"
r=$(as_user "$ADMIN" "select set_user_role('$ADMIN', 'distributor');")
check "o último administrador não se pode despromover" "LAST_ADMIN" "$r"
r=$(as_user "$ADMIN" "select set_user_active('$ADMIN', false);")
check "o último administrador não se pode desativar" "LAST_ADMIN" "$r"
as_user "$ADMIN" "select set_user_role('$OPER2', 'admin');" >/dev/null
r=$(as_user "$ADMIN" "select set_user_role('$ADMIN', 'distributor') ->> 'role';")
check "com outro administrador ativo, já pode despromover-se" "distributor" "$r"
as_user "$OPER2" "select set_user_role('$ADMIN', 'admin');" >/dev/null
r=$(q "select role from public.profiles where id = '$ADMIN';")
check "e o outro administrador consegue repor" "admin" "$r"

echo "    — ativação —"
r=$(as_user "$ADMIN" "select set_user_active('$OPER', false) ->> 'isActive';")
check "administrador desativa um distribuidor" "false" "$r"
r=$(as_user "$OPER" "select find_employee_for_delivery('12345');")
check "conta desativada perde acesso imediatamente" "INACTIVE_ACCOUNT" "$r"
# As rotas de distribuição confiam nesta verificação: o route handler só
# confirma que há sessão, quem decide se a conta está ativa é a função SQL.
r=$(as_user "$OPER" "select search_employees_for_delivery('Ana ');")
check "conta desativada também não pesquisa por nome" "INACTIVE_ACCOUNT" "$r"
r=$(as_user "$OPER" "select deliver_kit('12345', gen_random_uuid());")
check "conta desativada não entrega" "INACTIVE_ACCOUNT" "$r"
r=$(as_user "$ADMIN" "select set_user_active('$OPER', true) ->> 'isActive';")
check "administrador reativa" "true" "$r"
r=$(as_user "$OPER" "select find_employee_for_delivery('12345') -> 'employee' ->> 'name';")
check "e o acesso volta" "João Silva" "$r"

echo "    — escrita direta bloqueada —"
r=$(as_user "$ADMIN" "update public.profiles set role = 'admin' where id = '$OPER';")
check "nem o administrador altera perfis diretamente" "denied for table profiles" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'USER_ROLE_CHANGED';")
check "as mudanças de papel ficam auditadas" "5" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'USER_DEACTIVATED';")
check "a desativação fica auditada" "1" "$r"
r=$(q "select count(*) from public.delivery_logs where action = 'USER_ACTIVATED';")
check "a reativação fica auditada" "1" "$r"

echo
echo "═══ RLS ═══"
r=$(as_user "$OPER" "select count(*) from public.employees;")
check "operador não consegue enumerar colaboradores" "0" "$r"
# O que interessa é o contraste com o distribuidor, não o total exato — que
# muda sempre que um teste novo cria colaboradores.
r=$(as_user "$ADMIN" "select (count(*) > 0) from public.employees;")
check "administrador consegue listar colaboradores" "t" "$r"
r=$(as_user "$OPER" "select count(*) from public.delivery_logs;")
check "operador não lê o histórico de auditoria" "0" "$r"
r=$(as_user "$OPER" "select count(*) from public.company_totals;")
check "operador vê os totais das empresas" "4" "$r"
r=$(as_user "$OPER" "insert into public.deliveries (employee_id, company_id, delivered_by, idempotency_key) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c1','$OPER', gen_random_uuid());")
check "operador não pode inserir entregas diretamente" "denied for table deliveries" "$r"
r=$(as_user "$ADMIN" "insert into public.deliveries (employee_id, company_id, delivered_by, idempotency_key) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c1','$ADMIN', gen_random_uuid());")
check "nem sequer o administrador escreve entregas diretamente" "denied for table deliveries" "$r"
r=$(as_user "$OPER" "update public.profiles set role = 'admin' where id = '$OPER';")
check "distribuidor não consegue promover-se a administrador" "denied for table profiles" "$r"

echo
echo "═══ Entregas na última hora (cartão do dashboard) ═══"
# A consulta do dashboard tem duas condições e qualquer uma pode estar errada:
# a janela de uma hora e a exclusão das anuladas.
reset_db
as_user "$OPER" "select deliver_kit('12345', gen_random_uuid());" >/dev/null
CONTA="select count(*) from public.deliveries where reversed_at is null and delivered_at >= now() - interval '1 hour';"
r=$(q "$CONTA")
check "uma entrega acabada de fazer conta" "1" "$r"

# A alteração da data é verificada: uma que falhasse em silêncio deixaria o
# teste a passar pela razão errada.
r=$(q "update public.deliveries set delivered_at = now() - interval '3 hours'; $CONTA")
check "uma entrega de há três horas já não conta" "0" "$r"
r=$(q "update public.deliveries set delivered_at = now(); $CONTA")
check "reposta a hora, volta a contar" "1" "$r"

echo "    — documento exportado —"
# O documento leva toda a gente; o que distingue as duas metades é o
# kit_delivered de employee_list. Quem teve a entrega anulada passa para o
# lado de quem não recebeu, que é o que passou a ser verdade.
r=$(as_user "$ADMIN" "select count(*) from public.employee_list;")
check "o documento leva toda a gente" "5" "$r"
r=$(as_user "$ADMIN" "select count(*) from public.employee_list where kit_delivered;")
check "quem recebeu aparece como entregue" "1" "$r"
r=$(as_user "$ADMIN" "select count(*) from public.employee_list where not kit_delivered;")
check "e quem não recebeu também lá está" "4" "$r"
r=$(as_user "$ADMIN" "select name from public.employee_list where kit_delivered;")
check "com o nome, que o documento leva" "João Silva" "$r"
r=$(as_user "$ADMIN" "select company_name from public.employee_list where kit_delivered;")
check "e a empresa" "Empresa A" "$r"

# Anular pela função real, e não por um UPDATE à mão: o esquema exige que
# reversed_at e reversed_by andem juntos, e só a função os põe coerentes.
DID=$(q "select id from public.deliveries limit 1;")
as_user "$ADMIN" "select reverse_delivery('$DID', 'engano');" >/dev/null
r=$(q "$CONTA")
check "uma entrega anulada não conta, mesmo sendo recente" "0" "$r"
r=$(as_user "$ADMIN" "select kit_delivered from public.employee_list where employee_number = '12345';")
check "anulada deixa de contar como entregue" "f" "$r"
r=$(as_user "$ADMIN" "select count(*) from public.employee_list where kit_delivered;")
check "e o documento deixa de a contar como entregue" "0" "$r"
r=$(as_user "$ADMIN" "select count(*) from public.employee_list;")
check "sem deixar ninguém de fora da lista" "5" "$r"

echo
echo "───────────────────────────────────"
printf 'passaram: %d   falharam: %d\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
