# 0008 — Tema visual do evento (80.º Aniversário)

## Contexto

Para o evento de 23/09/2026 (80.º Aniversário e Centenário do Fundador) foi
pedido um visual alinhado com o "Save the Date". Das propostas apresentadas
foi escolhida a 13 ("Moldura"), com duas indicações:

- só a cor mais escura do fundo, sem o degradê para azul claro do convite;
- o menu não pode partir, porque o cabeçalho tem pouco espaço.

## Decisão

- **Fundo liso `#000E2C`**, o azul mais escuro do convite. Um fundo em
  degradê faz o mesmo texto passar e deixar de passar nos rácios de
  contraste conforme a zona do ecrã.
- **Cartões continuam brancos.** Todo o trabalho (pesquisa, resultado,
  tabelas, formulários) fica como estava; muda o que está à volta.
- **Tema por variáveis, não por página.** A classe `tema-evento` troca os
  três tons de texto (`ink-900/800/700`) por versões claras e devolve os
  originais a tudo o que tem fundo claro. Evita reescrever cada página e
  garante que o que está dentro de um cartão não muda. O azul profundo não
  é trocado, porque também é o fundo dos botões principais.
- **Moldura dourada** à volta da página, interrompida pelo logótipo no topo.
  Escondida no telemóvel, onde o espaço faz falta ao conteúdo.
- **Menu.** Com duas opções (distribuidor) fica à esquerda do logótipo a
  partir de 1024 px. Com seis (administrador) não cabe ao lado do logótipo
  (~500 px disponíveis para ~600 px de opções), por isso passa para uma
  linha própria por baixo. As opções têm `whitespace-nowrap`: num ecrã
  estreito passam inteiras para a linha seguinte, nunca quebram a meio.
  Verificado a 390, 640, 768, 1024, 1280 e 1440 px nos dois perfis: todas as
  opções com 44 px de altura (uma linha), sem deslocamento horizontal e sem
  sobreposição com o logótipo.
- **Página atual** assinalada no menu a dourado com traço por baixo e
  `aria-current`, para não depender só da cor.
- **ENTREGAR KIT** em azul profundo com texto e contorno dourados (9,7:1).
- **Barra de progresso** da navegação passa a dourada: o azul profundo
  desaparecia sobre o fundo novo.

Contrastes fixados em `tests/unit/contraste.test.ts`.

## Reverter

O tema está concentrado em `app/globals.css` (bloco `tema-evento`),
`components/ui/app-shell.tsx` e `app/login/page.tsx`. Reverter o commit
devolve o visual anterior sem tocar em dados.
