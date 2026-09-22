# 0007 — O distribuidor pode anular uma entrega

## Contexto

A anulação era `is_admin()` e vivia só na página de Histórico, que um
distribuidor não vê. Um kit entregue à pessoa errada ficava entregue até
alguém com acesso administrativo o corrigir — o que, durante um evento com
centenas de pessoas em fila, quer dizer: não é corrigido. O erro aparecia nos
números no dia seguinte, quando já ninguém se lembrava do contexto.

## Decisão

`reverse_delivery` passa a aceitar qualquer conta ativa (migração 0019), e a
anulação passa a estar no próprio cartão do colaborador, no ecrã de
distribuição, atrás de uma confirmação com o nome à vista.

Quem dá pelo engano é quem está ao balcão, no segundo a seguir: o kit ainda
está na mão e a pessoa certa está à espera.

## O que não muda

- A anulação continua **suave**: a linha fica em `deliveries`, com
  `reversed_at`, `reversed_by` e o motivo. Nada é apagado.
- Anular duas vezes continua a dar `ALREADY_REVERSED`.
- O `for update` continua a serializar duas anulações concorrentes.
- Fica um registo `DELIVERY_REVERSED` com quem anulou e quando.
- O distribuidor continua sem ler `employees` e sem ler `delivery_logs`.

## Alternativas rejeitadas

**Limitar o distribuidor às entregas que ele próprio fez.** Rejeitada: num
balcão com vários postos, o engano mais provável é o operador A entregar mal e
ser o operador B a dar por isso — e essa regra transformava a correção num
impasse, que é exatamente o problema que se está a resolver.

**Limitar a uma janela de tempo** (por exemplo, 10 minutos). Rejeitada pela
mesma razão, e porque uma pessoa que volta ao balcão meia hora depois a dizer
"afinal levei dois" é um caso real.

A defesa aqui é o **rasto**, não a permissão. O rasto está completo: nome,
hora e motivo de cada anulação, visíveis no Histórico para o administrador.

## Verificação

Na suíte SQL, com um distribuidor:

|                                                                   |                      |
| ----------------------------------------------------------------- | -------------------- |
| anula uma entrega                                                 | ✓                    |
| fica registado que foi ele (`reversed_by` → perfil `distributor`) | ✓                    |
| o motivo fica na auditoria                                        | ✓                    |
| anular duas vezes                                                 | `ALREADY_REVERSED`   |
| o kit pode voltar a ser entregue                                  | ✓                    |
| entrega inexistente                                               | `DELIVERY_NOT_FOUND` |
| continua sem ler `employees`                                      | 0 linhas             |
| continua sem ler `delivery_logs`                                  | 0 linhas             |
| continua sem escrever em `deliveries`                             | recusado             |

Na interface: a anulação pede confirmação, não chama a rota antes disso, e
quem ainda não recebeu kit não tem o botão.
