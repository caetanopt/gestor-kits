#!/usr/bin/env bash
# Testes de concorrência com processos psql verdadeiramente paralelos.
#
# É isto que distingue uma verificação aplicacional de uma garantia real:
# dezenas de sessões simultâneas a disputar o mesmo kit.
set -uo pipefail

PGH="${PGHOST_DIR:-/home/pgtest}"
DB=kits
OPER=00000000-0000-0000-0000-0000000000b1
CONC="${CONC:-30}"

pass=0
fail=0

q() { psql -h "$PGH" -U postgres -d "$DB" -tAX -c "$1" 2>&1; }

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf '  \033[32m✓\033[0m %s \033[2m(%s)\033[0m\n' "$label" "$actual"
    pass=$((pass + 1))
  else
    printf '  \033[31m✗\033[0m %s\n     esperado: %s\n     obtido:   %s\n' \
      "$label" "$expected" "$actual"
    fail=$((fail + 1))
  fi
}

setup() {
  local allocated="$1" employees="$2"
  psql -h "$PGH" -U postgres -tAX -c "drop database if exists $DB with (force);" >/dev/null 2>&1
  psql -h "$PGH" -U postgres -tAX -c "create database $DB;" >/dev/null
  psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f tests/sql/00_supabase_stub.sql
  for f in supabase/migrations/*.sql; do
    psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
  done
  psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email, raw_user_meta_data)
values ('$OPER', 'operador@teste.pt', '{"full_name":"Bruno Operador"}');
insert into public.companies (id, name, code, allocated_kits)
values ('00000000-0000-0000-0000-0000000000c1', 'Empresa A', 'EMPA', $allocated);
insert into public.employees (employee_number, name, company_id)
select i::text, 'Colaborador ' || i, '00000000-0000-0000-0000-0000000000c1'
from generate_series(1, $employees) i;
SQL
}

# Dispara N entregas em paralelo e devolve o número de sucessos.
storm() {
  local numbers="$1" outdir
  outdir=$(mktemp -d)
  local n=0
  while read -r num; do
    [[ -z "$num" ]] && continue
    n=$((n + 1))
    (
      psql -h "$PGH" -U postgres -d "$DB" -tAX \
        -c "set role authenticated; set request.jwt.claim.sub = '$OPER';
            select deliver_kit('$num', gen_random_uuid()) ->> 'repeated';" \
        >"$outdir/$n.out" 2>&1
    ) &
  done <<< "$numbers"
  wait
  grep -l '^false$' "$outdir"/*.out 2>/dev/null | wc -l
  rm -rf "$outdir"
}

echo
echo "═══ Corrida pelo último kit ═══"
echo "    $CONC operadores em simultâneo, 1 kit disponível, colaboradores diferentes"
setup 1 "$CONC"
succeeded=$(storm "$(seq 1 "$CONC")")
check "exatamente 1 entrega bem sucedida" "1" "$succeeded"
check "stock disponível não fica negativo" "0" "$(q "select available from public.company_stock where code='EMPA';")"
check "apenas 1 linha de entrega ativa" "1" "$(q "select count(*) from public.deliveries where reversed_at is null;")"
check "auditoria tem exatamente 1 DELIVERED" "1" "$(q "select count(*) from public.delivery_logs where action='DELIVERED';")"

echo
echo "═══ Corrida pelo MESMO colaborador ═══"
echo "    $CONC operadores em simultâneo sobre o colaborador 1, stock de sobra"
setup 500 1
succeeded=$(storm "$(for _ in $(seq 1 "$CONC"); do echo 1; done)")
check "exatamente 1 entrega bem sucedida" "1" "$succeeded"
check "o colaborador tem exatamente 1 kit" "1" "$(q "select count(*) from public.deliveries where reversed_at is null;")"

echo
echo "═══ Stock parcial sob carga ═══"
echo "    $((CONC * 2)) tentativas em simultâneo, 10 kits disponíveis"
setup 10 $((CONC * 2))
succeeded=$(storm "$(seq 1 $((CONC * 2)))")
check "entregou exatamente os 10 kits" "10" "$succeeded"
check "stock esgotado, nunca negativo" "0" "$(q "select available from public.company_stock where code='EMPA';")"
check "10 entregas registadas" "10" "$(q "select count(*) from public.deliveries where reversed_at is null;")"
check "sem excesso sobre o limite" "t" "$(q "select (delivered <= allocated) from public.company_stock where code='EMPA';")"

echo
echo "───────────────────────────────────"
printf 'passaram: %d   falharam: %d\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
