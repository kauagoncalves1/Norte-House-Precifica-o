# Norte House Burger — Sistema de Gestão

Sistema interno desenvolvido para uma hamburgueria local, a Norte House Burger. A ideia começou simples: uma calculadora pra ajudar o dono a precificar os itens do cardápio. Com o tempo, conversando sobre o dia a dia da loja, o projeto foi crescendo até virar um painel de gestão completo.

## O que o sistema faz

O painel é dividido em cinco áreas principais:

**Precificação**
O dono cadastra os ingredientes de um item (nome, quantidade, unidade e custo), define a margem de lucro desejada e o custo fixo por unidade (embalagem, gás, etc). O sistema calcula o custo total do item e sugere um preço de venda.

**Simulador de pedido**
Uma tela pra montar pedidos combinando itens do cardápio, adicionais (como bacon extra ou molhos) e bebidas/acompanhamentos, mostrando o valor total. Serve tanto pra testar combinações antes de colocar algo novo no cardápio quanto pra montar um pedido rapidamente no dia a dia.

**Cardápio**
Cadastro dos itens que a loja vende, com foto, nome, preço, descrição, lista de ingredientes e custo. As fotos ficam salvas no Supabase Storage, então o dono consegue subir imagens direto do celular.

**Painel**
Dashboard com o desempenho do negócio: faturamento, ticket médio, margem de lucro, gráfico de faturamento dos últimos sete dias, comparação entre venda de hambúrguer e de bebida/acompanhamento, ranking dos itens mais vendidos e uma tabela detalhada de custo e lucro por item. Também é onde as vendas são registradas manualmente conforme acontecem no balcão.

**Assistente de IA**
Um chat simples que ajuda o dono a tirar dúvidas sobre precificação, sugerir nomes ou descrições pra itens novos do cardápio. Ele tem acesso ao contexto do cardápio e das vendas registradas, então as respostas levam em conta a situação real da loja.

## Tecnologias usadas

- Next.js (App Router) para o front-end e as rotas de back-end
- Supabase para banco de dados e armazenamento das fotos
- Groq para o modelo de IA usado no assistente
- Recharts para os gráficos do painel
- Vercel para hospedagem

## Como o projeto foi construído

O sistema não nasceu de uma lista de requisitos fechada. Cada funcionalidade foi adicionada a partir de uma necessidade que apareceu durante o uso real: primeiro foi só uma calculadora, depois surgiu a necessidade de guardar o cardápio, depois de acompanhar vendas, depois de visualizar esses dados de forma mais clara. O painel de custo e lucro por item, por exemplo, só existe porque, ao usar o sistema, ficou claro que faltava saber exatamente quanto cada hambúrguer estava dando de lucro, não só uma estimativa genérica.

## Rodando o projeto localmente

As instruções completas de configuração (variáveis de ambiente, banco de dados, deploy) estão no arquivo `SETUP.md`.
