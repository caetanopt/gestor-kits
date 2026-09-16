# 0003 — Aplicação da identidade Caetano

**Estado:** aceite · **Data:** 2026-09-16
**Fonte:** Brand Book Caetano, abril 2026

## Contexto

A aplicação foi construída com uma paleta genérica. Passa a seguir a
identidade Caetano.

## O que o manual dá, e o que não dá

O manual define sete cores e, para cada uma, cinco tintas **mais claras**,
pensadas para impressão. Não define nenhuma variante escura.

Isso decide o desenho digital, porque só duas cores da paleta passam o rácio
de contraste mínimo da WCAG (4.5:1) como texto:

| Cor                         | Sobre branco |
| --------------------------- | -----------: |
| azul profundo `#002E5D`     |    13.56:1 ✓ |
| cinza antracite `#2E3A46`   |    11.60:1 ✓ |
| azul cyan `#00AEEF`         |     2.53:1 ✗ |
| verde eco `#49B489`         |     2.57:1 ✗ |
| laranja dinâmico `#FFA931`  |     1.91:1 ✗ |
| amarelo liberdade `#FFD23F` |     1.44:1 ✗ |
| cinza médio `#9CAEB8`       |     2.29:1 ✗ |

Nenhuma delas suporta texto branco por cima. Mas **todas** funcionam com
antracite por cima (4.5:1 a 8.0:1).

## Decisão

Três regras, que evitam inventar cores fora do manual:

1. **Texto e ação principal** usam azul profundo ou antracite. O botão
   principal é azul profundo com texto branco, como no site institucional.
2. **As cores secundárias sinalizam estado como fundo**, com texto antracite
   por cima — nunca como cor de texto, nunca com texto branco.
3. **As tintas claras** são fundo de caixas de aviso, também com antracite.

Onde antes havia texto colorido, passa a haver uma pastilha preenchida: o
`0 disponíveis` esgotado, as ações no histórico, os estados da entrega. Fica
mais visível numa tabela e legível, ao contrário de laranja sobre branco.

### Hierarquia de texto

| Token     | Cor       | Uso                      | Contraste |
| --------- | --------- | ------------------------ | --------: |
| `ink-900` | `#002E5D` | títulos                  |    13.6:1 |
| `ink-800` | `#2E3A46` | texto corrente           |    11.6:1 |
| `ink-700` | `#58616B` | rótulos e texto auxiliar |     6.3:1 |

Do `ink-600` para baixo servem apenas fundos, contornos e separadores. O
cinza médio da marca dá 2.3:1 e por isso nunca é cor de texto — antes deste
trabalho estava a ser usado em 22 rótulos.

## Ausência de vermelho

A paleta não tem vermelho, e a aplicação precisa de sinalizar bloqueios
("já entregue", "stock esgotado") de forma inequívoca durante um evento.

Usa-se o **laranja dinâmico** como fundo com texto antracite. Mantêm-se os
sinais não cromáticos que já existiam — símbolo, texto explícito e botão
desativado — por isso o estado nunca depende só da cor (WCAG 1.4.1).

## Logótipo

Extraído em vetor do próprio manual para `components/brand/caetano-logo.tsx`.

Está em linha, e não como `<img>`, para que o `fill="currentColor"` permita as
três aplicações previstas em 04.3: branco sobre fundos escuros, cyan e azul
profundo sobre claros. Um `<img>` não herda a cor do contexto.

O manual é explícito (03): o lettering é desenho autoral, não deriva de
nenhuma família tipográfica e não pode ser substituído por uma fonte
parecida. Nunca é texto.

## Tipografia

Montserrat (300, 400, 500, 700), a tipografia secundária da marca, servida
pelo próprio domínio através de `next/font` — sem pedidos a servidores
externos e sem salto de layout.

## Verificação

`tests/unit/contraste.test.ts` fixa estas regras em 14 asserções, incluindo
que as cores secundárias _não_ passam como texto. Uma alteração futura de cor
que torne texto ilegível falha nos testes.
