# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16.3.3, React 19.2.8, TypeScript 5, Tailwind CSS 4, `@supabase/ssr` 0.12.5,
`@supabase/supabase-js` 2.112.4, pnpm 9.15.9. App sibling no monorepo Turborepo
`noetrix-platform` (`apps/financas`), mas produto e identidade visual próprios —
não herda o produto Noetrix (SaaS multi-tenant de agendamento) descrito no
`PRODUCT.md` da raiz do monorepo. Decisão já fixada no plano de implementação
(`docs/superpowers/plans/2026-09-04-financas-fase-1.md`), não uma escolha em aberto.

## Users

Usuário único: o Ewerton, dono e único usuário do app. Sem multitenancy, sem
signup, sem outros papéis. Acessa de qualquer lugar, majoritariamente pelo
celular (mobile-first obrigatório), em momentos de checagem financeira do dia a
dia e de lançamento de gastos/receitas.

## Product Purpose

Painel financeiro pessoal para o Ewerton administrar um cenário de déficit
estrutural real: renda menor que gastos fixos, dívida distribuída em 6 grupos.
A Fase 1 entrega o loop central de gestão de déficit — saber quanto entra,
quanto sai, o que vence, se o mês fecha no vermelho, e qual o tamanho do
passivo. Sucesso é o painel tornar essa realidade visível e acionável todo mês,
sem depender de planilha.

## Positioning

Não é um app de finanças pessoais genérico. É moldado por uma anamnese
financeira real e por cinco regras de comportamento que o produto inteiro
reforça (dinheiro sem destino some; pagar a si mesmo primeiro; nunca financiar
bem que deprecia; reserva de emergência antes de investimento; carro novo é
luxo). Um concorrente genérico (planilha, app de orçamento comum) não carrega
essas regras nem o comparativo 50/30/20 calculado sobre a renda efetivamente
recebida, nem o mapa de dívida por grupo específico da situação do Ewerton.

## Operating Context

- Uso solo, mobile-first: o Ewerton confere e lança dados pelo celular, em
  qualquer lugar.
- Contas reais em 4 bancos possíveis: Inter, Nubank, Bradesco, BTG.
- Lançamentos manuais (renda CLT, freela, Noetrix; gastos por categoria),
  compras parceladas, templates recorrentes com ação "gerar mês", e
  importação de extrato bancário via arquivo OFX.
- Cockpit mensal (seletor de mês): 6 KPIs (entradas, saídas, a vencer,
  vencidas, investimentos, saldo), rosca de gastos por categoria, rosca de
  distribuição do mês, comparativo 50/30/20 sobre a renda recebida, saldo
  projetado para o fim do mês, alerta quando a projeção fica negativa,
  próximas contas a vencer em 7 dias, bloco Noetrix (MRR, clientes pagantes,
  semáforo dos 3 gatilhos CLT — entrada manual), bloco Cartões Nubank/Inter
  (fatura atual e limite disponível — entrada manual), últimos lançamentos
  (7 dias por `payment_date`).
- Mapa de dívidas por grupo (FGTS, consignado, Serasa, pessoal, família,
  cartão), progresso de quitação, registro de pagamento.
- Situação real de base (seed, editável pela UI): renda CLT líquida ~R$
  4.597/mês, gastos fixos ~R$ 7.091/mês, déficit ~-R$ 2.494/mês, dívida total
  ~R$ 56.891 em 6 grupos.

## Capabilities and Constraints

- Fase 1 (este PRODUCT.md): Contas, Lançamentos (manual + import OFX),
  Cockpit (com blocos Cartões e Noetrix, entrada manual — decisão revisada
  durante o `/impeccable shape`, ver Evidence on Hand), Dívidas.
- Fora da Fase 1, registrado para não reabrir: Calendário de vencimentos,
  tela completa de Cartões (fatura linha a linha, parcelamento), import CSV
  por banco (Fase 2); Investimentos, tela de Metas CLT, Saúde
  financeira/score mensal (Fase 3); sem `fin_budgets` (o 50/30/20 é
  calculado, não orçado por linha); sem Open Finance.
- Rotas da Fase 1: `/cockpit`, `/lancamentos`, `/lancamentos/importar`,
  `/dividas`, `/configuracoes`, `/login`.
- Autenticação: usuário único criado à mão no Supabase; sem signup nem reset
  de senha no app.
- Todo o produto é pt-BR.
- Sem RLS no schema `financas`: isolamento é service-role só no servidor +
  gate de sessão (Path A, mesmo padrão do `apps/studiold`).

## Brand Commitments

Nome funcional: **Finanças** (sem marca própria — app pessoal, sem identidade
de marca separada da Noetrix). Fontes Barlow + Barlow Condensed já fixadas no
scaffold (mesmo setup do `apps/studiold`), mas isso é ponto de partida técnico,
não decisão de identidade visual — a direção visual de cada superfície é
resolvida pelo `/impeccable shape`.

## Evidence on Hand

- Spec completo aprovado:
  `docs/superpowers/specs/2026-09-04-financas-fase-1-design.md` — schema,
  fluxos, regras de cálculo de cada rota.
- Plano de implementação:
  `docs/superpowers/plans/2026-09-04-financas-fase-1.md`.
- Números do seed são reais (situação atual do Ewerton), não fabricados;
  editáveis depois pela UI.
- Nenhuma implementação visual existe ainda (`apps/financas` ainda não tem
  scaffold no branch `financas-fase-1`) — não há incumbente a preservar.

## Product Principles

1. **O painel diz a verdade do déficit.** Nunca esconder ou suavizar um saldo
   projetado negativo.
2. **Pague-se primeiro é regra de leitura, não automação (Fase 1).** O
   Cockpit mostra a meta de 20% e o quanto já foi investido; não cria lançamento
   sozinho.
3. **Um usuário, um dado.** Sem isolamento multi-tenant a resolver — a
   simplicidade do single-user é uma decisão de produto, não uma lacuna.
4. **Mobile-first é inegociável.** O Ewerton lança e confere dados no
   celular; qualquer tela que dependa de tela grande falhou.
5. **Dado real sobre dado bonito.** Os números partem da situação real; a UI
   nunca deve mascarar um número desconfortável para parecer mais organizada.

## Accessibility & Inclusion

Nenhum requisito específico além do mobile-first já registrado em Operating
Context. Sem padrão de acessibilidade formal definido.
