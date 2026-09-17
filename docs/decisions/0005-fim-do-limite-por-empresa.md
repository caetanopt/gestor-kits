# 0005 — Fim do limite de kits por empresa

## Contexto

Cada empresa tinha um número de kits atribuído. `deliver_kit` contava as
entregas ativas dessa empresa e recusava com `NO_STOCK` quando chegavam ao
número. Era a regra que obrigava ao `SELECT … FOR UPDATE` na linha da empresa:
sem ele, dois operadores em simultâneo liam a mesma contagem e ambos concluíam
que havia stock.

Na prática o limite dizia o que a lista de colaboradores já dizia. Só recebe
kit quem está na lista da empresa, e a lista vem da importação — o limite era
uma segunda contagem a manter sincronizada à mão, com um erro possível:
atribuir de menos e bloquear pessoas que tinham direito ao kit.

## Decisão

Não há limite. Entrega-se sempre, e conta-se o que foi entregue.

O que se perde:

- a coluna `companies.allocated_kits` deixa de ser lida;
- os erros `NO_STOCK` e `LIMIT_BELOW_DELIVERED` deixam de existir;
- o campo "Kits atribuídos" sai do formulário de empresa;
- as colunas "Atribuídos" e "Disponíveis" saem das tabelas;
- o estado "STOCK ESGOTADO" sai do ecrã de distribuição.

O que fica, e é o que sempre importou: **um colaborador, um kit**. Essa
garantia nunca dependeu do limite — vem do índice único parcial
`deliveries_one_active_per_employee_idx` e da chave de idempotência.

## O bloqueio da empresa também sai

`deliver_kit` deixa de fazer `SELECT … FOR UPDATE` na empresa. O bloqueio
existia para serializar a contagem contra o limite; sem limite, só servia para
pôr as entregas da mesma empresa umas atrás das outras, à porta de uma
verificação que já não existe.

Não é uma perda de segurança, é o contrário: duas entregas a colaboradores
diferentes da mesma empresa deixam de esperar uma pela outra. Os testes de
concorrência foram reescritos para o provar com processos psql verdadeiramente
paralelos:

- 30 operadores em simultâneo sobre o mesmo colaborador → **1** entrega;
- 60 operadores em simultâneo sobre 60 colaboradores → **60** entregas, sem
  duplicados e sem nenhuma perdida;
- 30 pedidos com a mesma chave de idempotência → **1** entrega.

## Estratégia de migração e regresso atrás

A coluna `allocated_kits` **fica**, com os valores que tem hoje. Nada a lê.

É deliberado: apagá-la seria destrutivo e irreversível, e mantê-la faz do
regresso atrás uma questão de repor as funções antigas em vez de recuperar
dados apagados. Uma migração futura pode removê-la depois de o evento
confirmar que o limite não faz falta.

A ação de auditoria `COMPANY_LIMIT_UPDATED` continua no enum e no histórico,
pela mesma razão: os registos antigos contam o que aconteceu, e não devem
deixar de fazer sentido por a regra ter mudado.

## O que passa a mostrar-se

"Quantos kits é que cada empresa distribuiu" é agora a pergunta central, e
aparece a par do número de colaboradores — **48 de 120** diz o que **48** não
diz. Daí a coluna "Por levantar", que não é um limite: é quanta gente ainda
não passou pelo balcão.

## Alternativa considerada

**Tornar o limite opcional**, com `null` a significar "sem limite". Daria a
possibilidade de o reactivar por empresa sem uma migração nova. Ficou de fora:
ninguém o pediu, e manter dois caminhos na função crítica de entrega — um com
verificação e bloqueio, outro sem — é mais código a manter e mais estados a
testar do que o proveito justifica.
