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
- **Menu.** Sempre numa linha própria por baixo do logótipo, para os dois
  perfis. (Chegou a ficar ao lado do logótipo para o distribuidor, que só
  tem duas opções; foi pedido o mesmo cabeçalho do administrador.) As
  opções têm `whitespace-nowrap`: num ecrã estreito passam inteiras para a
  linha seguinte, nunca quebram a meio. Os dados da sessão ficam a meio
  entre o filete da moldura e a linha do menu.
- **Página atual** assinalada no menu a dourado com traço por baixo e
  `aria-current`, para não depender só da cor.
- **ENTREGAR KIT** em azul profundo com texto e contorno dourados (9,7:1).
- **Barra de progresso** da navegação passa a dourada: o azul profundo
  desaparecia sobre o fundo novo.

## Cartões do ecrã de distribuição (proposta 3, "Convite")

Pedido a seguir: os cartões brancos da Distribuição com o desenho da
proposta 3.

- Cantos quase retos (4 px) e filete dourado `#E6C98F`, sem sombra.
- Separadores sublinhados; o ativo tem traço dourado, negrito e cor azul,
  para não depender só da cor.
- Campo de pesquisa creme `#FFFDF8` com filete dourado. O foco continua com
  o contorno ciano do resto da aplicação.
- Nome do colaborador, números e ENTREGAR KIT em Rubik, a letra do convite
  (PSD). O texto corrente continua em Montserrat.
- "KIT AINDA NÃO ENTREGUE" com contorno dourado e texto dourado escuro
  `#8A5A14` (5,9:1 sobre branco). "JÁ ENTREGUE" continua cheio a laranja:
  tem de se distinguir do outro estado à primeira vista.
- ENTREGAR KIT com filete dourado recolhido 1 px da borda.
- Os botões ganharam a opção `retos`, com o raio separado do tamanho, para
  não haver duas classes de raio a disputar o mesmo elemento.

Só o ecrã de distribuição muda; as outras páginas mantêm os cartões
arredondados.

## Dashboard (sugestão C, "Contadores sobre o escuro")

- Os quatro contadores deixam de ter cartão: ficam no fundo escuro, em Rubik
  fina e grande, separados por um filete dourado. Kits entregues a dourado
  (13,6:1), os outros a branco; rótulos em maiúsculas espaçadas (12,6:1).
- A tabela fica num cartão como os da distribuição: cantos retos, filete
  dourado, cabeçalho em dourado escuro, separadores dourados claros,
  números em Rubik, barra de progresso dourada, CSV com contorno.
- Rótulos e cálculos não mudam.

## Restantes páginas e foco

- Empresas, Colaboradores, Histórico, Utilizadores, Importar e login com o
  mesmo desenho: cartões de cantos retos com filete dourado, sem sombra,
  cabeçalhos de tabela em dourado escuro e maiúsculas, separadores
  dourados claros, títulos em Rubik.
- Etiquetas "Por entregar" e "Distribuidor" com contorno dourado;
  "Administrador" cheia a dourado claro. "Entregue" continua verde.
- Todos os botões com cantos retos; o secundário passa a contorno azul
  profundo, como o Pesquisar do convite.
- **Foco dourado `#A87323` em vez de ciano**, em toda a aplicação. O mesmo
  tom passa os 3:1 sobre branco (4,1:1), sobre o campo creme e sobre o
  fundo escuro (4,7:1). Os campos deixaram de ter um anel de foco próprio:
  fica só o contorno global, sem bordas duplas.
- Os avisos informativos mantêm o ciano da marca: não são foco nem estado.

Contrastes fixados em `tests/unit/contraste.test.ts`.

## Reverter

O tema está concentrado em `app/globals.css` (bloco `tema-evento`),
`components/ui/app-shell.tsx` e `app/login/page.tsx`. Reverter o commit
devolve o visual anterior sem tocar em dados.
