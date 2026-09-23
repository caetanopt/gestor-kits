# 0010 — Número de colaborador opcional ao criar

## Contexto

Pedido: ao acrescentar alguém à mão, o número de colaborador não deve ser
obrigatório. Há quem chegue ao balcão sem o saber.

## Decisão

- **Opcional no formulário, nunca vazio na base de dados.** O número é a
  chave única do colaborador e é por ele que `deliver_kit` entrega. Sem
  número, a pessoa não se encontrava nem recebia kit. Quando vem vazio, a
  base de dados atribui um automático: `SN0001`, `SN0002`… (migração 0020).
- **Sequência do PostgreSQL**, segura com vários operadores ao mesmo tempo:
  20 criações simultâneas deram 20 números distintos. Um valor que já
  exista (escrito à mão) é saltado.
- **Só ao criar**, no balcão e na página Colaboradores. Ao editar continua
  obrigatório. A importação não muda.
- A página Colaboradores mostra o número atribuído na mensagem de sucesso;
  no balcão, o cartão de entrega que abre a seguir já o mostra.
- Se a 0020 não estiver aplicada, criar sem número devolve "base de dados
  desatualizada" em vez de um erro de validação sem explicação.
- O gerador e a sequência não são acessíveis a nenhum perfil diretamente.

## Aplicar

Correr `supabase/migrations/0020_numero_automatico.sql` no SQL Editor. Pode
ser corrida mais de uma vez. `docs/operations/verificar-migracoes.sql` tem
uma linha para a confirmar.
