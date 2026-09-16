# 0002 — O Enter não pode entregar um kit por acidente

**Estado:** aceite · **Data:** 2026-09-15

## Contexto

A secção 27 da especificação sugere os atalhos:

```
Enter -> pesquisar
Enter -> confirmar entrega quando o cartão estiver ativo
Esc   -> limpar pesquisa
```

e acrescenta que dispensar a confirmação adicional é aceitável se isso
acelerar o processo.

Implementado à letra, isto tem um problema sério num evento real. Os leitores
de código de barras e de QR comportam-se como teclados: escrevem os dígitos e
terminam com **Enter**. Se o foco estivesse no botão `ENTREGAR KIT` depois de
uma pesquisa, passar o crachá da pessoa seguinte pelo leitor faria com que os
dígitos se perdessem (um botão não recebe texto) e o Enter final **entregasse
um kit à pessoa errada** — silenciosamente, e com o cartão certo ainda no
ecrã.

O mesmo acontece com um duplo Enter distraído.

## Decisão

O foco fica **sempre** no campo de pesquisa. O significado do Enter é
determinado pelo conteúdo do campo:

| Campo     | Enter faz                       |
| --------- | ------------------------------- |
| com texto | pesquisa                        |
| vazio     | entrega o kit do cartão visível |

O campo é limpo imediatamente após cada pesquisa e após cada entrega.

O fluxo rápido pretendido mantém-se — `número → Enter → Enter` — mas uma
leitura inesperada nunca entrega: preenche o campo e faz uma pesquisa nova.

O botão `ENTREGAR KIT` continua a existir, grande e com alvo de toque
generoso, para quem usa o ecrã tátil ou o rato.

## Outras defesas

- **Idempotência.** Cada pesquisa gera um `idempotencyKey`. Duplo clique,
  duplo Enter e retries de rede reutilizam a chave e recebem o resultado
  original em vez de uma segunda entrega ou de um erro confuso.
- **Estado do botão.** Fica desativado quando o colaborador já recebeu ou
  quando a empresa esgotou o stock, e o Enter respeita a mesma condição.
- **Servidor.** Nada disto é a defesa real — é ergonomia. A garantia está no
  índice único parcial da base de dados (ver decisão 0001).

## Desvio adicional à secção 26

A especificação pede que a confirmação apareça "durante 1 a 2 segundos" e que
a pesquisa seja limpa a seguir. Limpamos o campo e devolvemos o foco
**imediatamente**, mas deixamos a confirmação visível até à pesquisa seguinte.

O objetivo da secção — o operador poder começar já a escrever o número
seguinte — é cumprido, e evita-se que a confirmação desapareça antes de o
operador a conseguir ler quando há uma interrupção.

## Verificação

`tests/unit/distribution-screen.test.tsx` cobre explicitamente o cenário
perigoso: com o cartão do João aberto, escrever `12346{Enter}` (uma leitura de
crachá) faz uma pesquisa nova e **não** chama `/api/deliveries`.
