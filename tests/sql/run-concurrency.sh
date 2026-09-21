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

# Ver a nota em run-tests.sh: uma suíte verde contra um servidor parado engana.
exigir_ligacao() {
  local sonda
  sonda=$(psql -h "$PGH" -U postgres -d postgres -tAX -c 'select 1;' 2>&1)
  if [[ "$sonda" != *"1"* ]]; then
    printf '\033[31mNão foi possível ligar ao PostgreSQL em %s\033[0m\n' "$PGH" >&2
    printf '  %s\n' "$sonda" >&2
    exit 2
  fi
}

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
  local employees="$1"
  psql -h "$PGH" -U postgres -tAX -c "drop database if exists $DB with (force);" >/dev/null 2>&1
  psql -h "$PGH" -U postgres -tAX -c "create database $DB;" >/dev/null
  psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f tests/sql/00_supabase_stub.sql
  for f in supabase/migrations/*.sql; do
    psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
  done
  psql -h "$PGH" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email, raw_user_meta_data)
values ('$OPER', 'operador@teste.pt', '{"full_name":"Bruno Operador"}');
insert into public.companies (id, name, code)
values ('00000000-0000-0000-0000-0000000000c1', 'Empresa A', 'EMPA');
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

# A migração 0011 acabou com o limite por empresa e, com ele, com o bloqueio
# da linha da empresa em `deliver_kit`. A garantia que resta — e que sempre
# foi a que interessava — é um colaborador, um kit. Nunca dependeu do
# bloqueio: vem do índice único parcial. É isso que estes testes provam, com
# processos psql verdadeiramente em paralelo.

echo
exigir_ligacao

echo "═══ Corrida pelo MESMO colaborador ═══"
echo "    $CONC operadores em simultâneo sobre o colaborador 1"
setup 1
succeeded=$(storm "$(for _ in $(seq 1 "$CONC"); do echo 1; done)")
check "exatamente 1 entrega bem sucedida" "1" "$succeeded"
check "o colaborador tem exatamente 1 kit" "1" "$(q "select count(*) from public.deliveries where reversed_at is null;")"
check "auditoria tem exatamente 1 DELIVERED" "1" "$(q "select count(*) from public.delivery_logs where action='DELIVERED';")"

echo
echo "═══ Colaboradores diferentes, sem limite a travar ═══"
echo "    $((CONC * 2)) operadores em simultâneo, $((CONC * 2)) colaboradores"
# Antes, 10 kits atribuídos travavam isto nos 10. Agora passam todos — e
# passam sem se atropelarem: sem o bloqueio da empresa deixam de esperar uns
# pelos outros, e mesmo assim não se perde nem se duplica nenhuma entrega.
setup $((CONC * 2))
succeeded=$(storm "$(seq 1 $((CONC * 2)))")
check "todas as entregas passam" "$((CONC * 2))" "$succeeded"
check "uma linha por colaborador, sem duplicados" "$((CONC * 2))" "$(q "select count(*) from public.deliveries where reversed_at is null;")"
check "os totais contam o mesmo" "$((CONC * 2))" "$(psql -h "$PGH" -U postgres -d "$DB" -tAX -c "set role authenticated; set request.jwt.claim.sub = '$OPER'; select delivered from public.company_totals_list() where code='EMPA';" 2>&1 | tail -1)"

echo
echo "═══ Mesma chave de idempotência em simultâneo ═══"
echo "    $CONC pedidos idênticos, como um duplo toque que se multiplicou"
setup 1
KEY=$(q "select gen_random_uuid();")
outdir=$(mktemp -d)
for i in $(seq 1 "$CONC"); do
  (
    psql -h "$PGH" -U postgres -d "$DB" -tAX \
      -c "set role authenticated; set request.jwt.claim.sub = '$OPER';
          select deliver_kit('1', '$KEY') ->> 'repeated';" \
      >"$outdir/$i.out" 2>&1
  ) &
done
wait
rm -rf "$outdir"
check "uma só entrega, apesar dos $CONC pedidos" "1" "$(q "select count(*) from public.deliveries;")"
check "e um só registo de auditoria" "1" "$(q "select count(*) from public.delivery_logs where action='DELIVERED';")"

echo
echo "───────────────────────────────────"
printf 'passaram: %d   falharam: %d\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
