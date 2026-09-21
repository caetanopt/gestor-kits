# Distribuição de Kits — modo local

Um ficheiro só, `distribuicao-offline.html`. Duplo clique, abre no browser.
**Não precisa de internet nem de instalar nada.**

## No dia

1. Copie `distribuicao-offline.html` para o Ambiente de Trabalho do PC.
2. Duplo clique. Abre no browser.
3. **Carregar a lista** — escolha o CSV dos colaboradores. Colunas aceites:
   `numero`, `nome`, `empresa` e `email` (opcional). São aceites cabeçalhos em
   português e o separador `;` do Excel português.
4. Distribua: escreva o número, `Enter` para pesquisar, `Enter` outra vez
   (com o campo vazio) para entregar. `Esc` limpa.
5. **No fim, clique em "Exportar CSV".** Guarde o ficheiro. É o registo do dia.

## A regra "um kit por colaborador"

As entregas são guardadas num índice pelo número do colaborador, normalizado
sem espaços e em maiúsculas — a mesma regra da base de dados. Duas entregas ao
mesmo colaborador **não são recusadas por uma verificação: são impossíveis de
representar**. `9787`, ` 9787 ` e `9787 ` são a mesma pessoa.

Se tentar entregar a quem já recebeu, aparece um aviso laranja com a data e a
hora da primeira entrega, e o botão de entregar não existe.

Enganou-se? O cartão de quem já recebeu tem **"Anular esta entrega"**. O kit
volta a ficar por entregar.

## Acrescentar quem não está na lista

Pesquise pelo número, nome ou email. Se não existir, aparece o formulário **Não
está na lista**, já preenchido com o que escreveu. Escolha a empresa (ou crie
uma nova) e clique em *Acrescentar e abrir* — o cartão abre pronto a entregar.

Um número que já exista é recusado, com o nome de quem o tem.

## Onde os dados ficam, e como não os perder

Ficam guardados no browser, no próprio PC. **Sobrevivem a fechar a janela e a
desligar o computador** — testado com 2253 colaboradores e 300 entregas.

Não sobrevivem a:

- limpar os dados de navegação / histórico
- abrir o ficheiro numa **janela anónima**
- abrir noutro browser (o Chrome e o Edge não partilham nada)
- mudar de computador

Por isso:

- **Use sempre o mesmo browser e o mesmo PC.** Não abra em janela anónima.
- De 25 em 25 entregas, o ficheiro descarrega sozinho uma cópia de segurança
  para a pasta Transferências. Deixe-as ficar lá.
- Exporte o CSV ao almoço e no fim do dia.

## Avisos que podem aparecer

**"As entregas não estão a ser gravadas"** (vermelho, no topo) — o browser
recusou gravar. Exporte o CSV imediatamente e chame quem montou isto. Cada
gravação é confirmada por releitura, por isso este aviso significa mesmo que
algo está errado.

**"Há outra janela desta aplicação aberta"** — feche as restantes e use só uma.

## Depois do evento

Entregue o CSV exportado a quem gere a plataforma. As entregas são carregadas
na base de dados a partir dele.

## O que esta versão não faz

Não tem contas nem perfis: quem abre o ficheiro tem tudo.

Não fala com mais nenhum posto. **Um PC, um posto.** Se houver dois postos, cada
um tem a sua cópia e nada impede a mesma pessoa de receber kit nos dois — a
única forma segura de ter vários postos sem rede é dar a cada um uma lista
diferente, sem pessoas repetidas.
