---
version: 1
slug: "apps-financas-app-cockpit-page-tsx"
primary_target: "apps/financas/app/cockpit/page.tsx"
related_targets: ["apps/financas/app/login/page.tsx","apps/financas/app/lancamentos/page.tsx","apps/financas/app/lancamentos/importar/page.tsx","apps/financas/app/dividas/page.tsx","apps/financas/app/configuracoes/page.tsx"]
---

# Surface brief — Finanças Fase 1 (6 rotas)

## Escopo e modo
Rotas: `/login`, `/cockpit`, `/lancamentos`, `/lancamentos/importar`, `/dividas`, `/configuracoes`.
Modo: Operate em todas — visitante único (Ewerton) executa tarefa, nenhuma é venda. Login é gate puro de sessão, sem elemento de marca.

## Audiência, job, ação
Ewerton, celular a qualquer hora (dia/noite, sem padrão fixo de luz). Job: saber saldo, o que vence, lançar renda/gasto, quitar dívida — sem planilha.

## Direção visual (pinada pelo usuário, não é sorteio)
- Mundo: dark tech financeiro — sofisticado, denso, preciso.
- Tema: segue `prefers-color-scheme`, suporta claro e escuro, sem padrão fixo.
- Cor: accent azul elétrico `#00A8FF` (elementos ativos/interação). Dourado para destaques premium (bloco Noetrix, metas CLT). Semântica intocável e nunca decorativa fora dela: verde = pago/positivo, vermelho = vencido/negativo, âmbar = pendente/a vencer.
- Forma: cantos arredondados em todo componente.
- Tipografia: Barlow (texto/labels), JetBrains Mono (todo valor monetário, tabular-nums).
- Ícones: Lucide (interface/ações), Phosphor (categoria/status).

## Estrutura por rota
- **Cockpit — híbrido hero + ticker:** Saldo (Entradas − Saídas − Investimentos) como hero no topo, número gigante mono, cor semântica domina o card inteiro. Outros 5 KPIs (Entradas, Saídas, A vencer, Vencidas, Investimentos) em barra compacta tipo ticker/tabela logo abaixo. Ordem completa da página: seletor de mês → hero saldo + ticker KPIs → rosca 1 (gastos por categoria incl. investimentos) → rosca 2 (entradas/saídas/investimentos/dívidas não pagas) → barra 50/30/20 (atual vs ideal) → próximas contas a vencer em 7 dias → bloco Noetrix (clientes pagantes, MRR, semáforo 3 gatilhos CLT, dourado) → cartões Nubank/Inter (fatura manual + limite) → últimos lançamentos 7 dias por `payment_date`. Demais blocos em tratamento "cards elevados com glow": sombra suave, borda azul elétrico em glow sutil quando ativo, dourado como borda/ícone glow nos blocos premium (Noetrix, metas CLT).
  - Nota do usuário: pode revisitar pra tratamento B (cards elevados em tudo, sem hero) depois de ver C implementado — não travar excesso de acoplamento ao layout hero.
- **Lançamentos:** cards por lançamento (respiro, touch-friendly), não tabela. Filtro por mês controla volume por tela.
- **Importar (`/lancamentos/importar`):** duas abas no topo — **OFX** (extrato bancário, funcional na Fase 1) e **Excel** (lançamentos futuros parcelados, badge "em breve", desabilitada — funcional só Fase 2). Mesma tabela densa com checkbox por linha nas duas abas (fluxo de revisão em lote, não uso diário).
- **Dívidas:** cards por grupo (mesmo tratamento "elevado com glow"), progresso de quitação em barra dentro do card.
- **Configurações:** utilitário simples, sem tratamento visual especial, herda o sistema.
- **Login:** minimal, campo único de sessão, fundo dark tech, sem elemento de marca/venda.

## Estados
- Cockpit: rosca vazia = estado empty explícito (não gráfico quebrado). Mês não vigente = KPIs mostram fechamento real daquele mês; cartões e "próximas contas" usam dia 1 do mês selecionado em vez de "hoje".
- Overdue é sempre derivado na leitura (status, due_date, hoje) — nunca cor presa a um valor congelado no banco.

## Interação e layout
Mobile-first, 1 coluna em telas estreitas. Toque como interação primária (sem hover-dependente). Todo valor monetário em fonte tabular.

## Constraints
Next.js 16 RSC + Server Actions (sem client store), Tailwind 4, sem geração de imagem/asset autoral nesta fase, sem detector de design rodado ainda (roda durante build). pt-BR only.
