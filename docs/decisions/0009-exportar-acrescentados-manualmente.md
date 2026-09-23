# 0009 — Exportar os colaboradores acrescentados manualmente

## Contexto

Durante o evento, quem não está na lista é acrescentado à mão: no balcão de
distribuição ou na página Colaboradores. Foi pedida uma exportação só com
essas pessoas, para rever e completar os dados depois.

## Decisão

- **A origem sai do histórico, sem mudar o esquema.** A tabela `employees`
  não guarda de onde veio cada pessoa, mas as duas formas de acrescentar à
  mão (`save_employee` e `create_employee_for_delivery`) registam
  `EMPLOYEE_CREATED` com o colaborador, e a importação regista um único
  `EMPLOYEES_IMPORTED` para o ficheiro inteiro, sem colaborador. Uma coluna
  nova obrigaria a correr uma migração no dia do evento; esta regra não.
- **Onde:** o balcão marca o registo com `origem: "distribuicao"`; sem marca
  é a página Colaboradores.
- **Dados atuais**, não os do momento da criação: se alguém corrigiu o nome
  ou o email depois, sai a versão corrigida, com o estado do kit.
- **Só administradores**, como a exportação geral: rota com
  `requireApiAdmin` e ligação numa página com `requireAdmin`. O histórico e
  os colaboradores só são legíveis por administradores (RLS).
- Área na página Colaboradores, com a contagem e o botão "Exportar (CSV)".

Verificado numa base com todas as migrações: três importados, um
acrescentado na página e outro no balcão, e um importado editado. A leitura
devolve só os dois acrescentados, com a origem certa; um distribuidor lê 0.

## Limitação

Depende do histórico. Os scripts `docs/operations/limpar-historico.sql` e
`limpar-entregas.sql` apagam o histórico: quem foi acrescentado antes de os
correr deixa de ser reconhecido como tal. Não os correr depois do início
do evento.
