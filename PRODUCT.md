# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Monorepo Turborepo + pnpm workspaces. Apps em Next.js 16 / React 19 / Tailwind CSS 4.
Backend e dados em Supabase (Postgres com schema por tenant + RLS, Supabase Auth).
Stack já estabelecida pelo código existente; não é uma decisão em aberto.

## Users

Dois usuários primários, com peso igual:

- **Equipe do negócio** — dono e atendentes de barbearia (e, nas próximas verticais,
  oficina e usinagem). Operam agenda, cadastro de clientes, serviços, horários,
  bloqueios, fila de espera e encaixes por um dashboard web, durante o expediente,
  frequentemente no celular ou num computador de balcão entre atendimentos.
- **Cliente final do negócio** — agenda, reagenda, cancela, entra na fila de espera e
  pede encaixe conversando em linguagem natural pelo WhatsApp, sem instalar aplicativo
  nem criar conta.

Terceiro público: **operador da plataforma Noetrix** (app `admin`), que provisiona
tenants, domínios e a conexão de WhatsApp de cada um.

## Product Purpose

Noetrix é uma plataforma multi-tenant e multi-vertical para negócios locais que atendem
por horário marcado — barbearia como piloto (StudiOLD), oficina e usinagem como próximas
verticais. A proposta é uma agenda que se preenche sozinha: o cliente resolve tudo pelo
WhatsApp com um assistente de IA e a equipe apenas supervisiona e trata exceções pelo
dashboard. Sucesso significa menos buracos na agenda, menos no-show e quase nenhum
agendamento digitado à mão pela equipe.

## Positioning

Combinação de três mecanismos que, juntos, um concorrente próximo (Booksy, Trinks,
Calendly, agenda de papel) não replica de forma fiel:

1. **Agendamento nativo no WhatsApp com IA** — nada para o cliente baixar ou logar; a
   conversa resolve agendamento, fila e encaixe. Booksy e Trinks dependem de app ou
   portal próprio do cliente.
2. **Automação de fila de espera e encaixe** — as tabelas `fila_espera` e
   `pedidos_encaixe` carregam posição, notificação e expiração automáticas, preenchendo
   cancelamentos sem trabalho manual da equipe.
3. **Base white-label multi-vertical** — cada tenant com schema Postgres isolado, domínio
   próprio e regras da sua vertical, a partir de um único core.

## Operating Context

- Negócio pequeno, atendimento presencial por horário; a equipe consulta o painel no
  celular ou num computador de balcão entre clientes.
- O canal com o cliente é o WhatsApp (via Evolution API). O status da instância
  (`whatsapp_status` no tenant) pode cair e precisa ser visível para a equipe.
- Regras de agenda por tenant: `horarios_funcionamento` por dia da semana,
  `bloqueios_fixos` (tipo `suave` ou `rigido`) e `bloqueios_pontuais` por data, `slots`
  com duração, `servicos` com duração e preço.
- Fluxo de exceção central: cliente cancela → vaga abre → a fila de espera é notificada
  ou um encaixe é oferecido, sempre com janela de expiração.
- Pós-atendimento: `atendimentos` registra valor cobrado e forma de pagamento (pix,
  cartão de débito, cartão de crédito, dinheiro).
- Produto inteiro em pt-BR.

## Capabilities and Constraints

Confirmado nas migrações Supabase (`infra/supabase/migrations/`):

- Multi-tenant via `public.tenants` (slug, vertical, domínio, dados de WhatsApp, plano,
  flag `ativo`) e `public.tenant_usuarios` (roles `admin`, `operador`, `visualizador`),
  ambos com Row Level Security.
- Um schema Postgres por tenant (ex.: `barbearia_001`) contendo: `clientes`, `servicos`,
  `horarios_funcionamento`, `bloqueios_fixos`, `bloqueios_pontuais`, `slots`,
  `agendamentos`, `fila_espera`, `pedidos_encaixe`, `atendimentos`, `whatsapp_log`.
- Status de agendamento: `confirmado`, `pendente`, `cancelado`, `concluido`,
  `nao_compareceu`.
- Integrações previstas, com variáveis de ambiente já reservadas mas ainda não
  implementadas: Evolution API (WhatsApp) e OpenAI (assistente de conversa).

Explicitamente em aberto — não inventar:

- Modelo de planos e cobrança da plataforma.
- Se um tenant pode ter vários profissionais/cadeiras (o schema atual trata a barbearia
  como agenda única).
- Escopo funcional real dos apps `admin`, `oficinas` e `usinagem` (hoje diretórios
  vazios).
- Padrão de acessibilidade alvo.

## Brand Commitments

- Nome da plataforma: **Noetrix**. Domínio raiz `noetrix.com.br`, um subdomínio por
  tenant (ex.: `studiold.noetrix.com.br`).
- Primeiro tenant e cliente: **StudiOLD**, uma barbearia. A grafia "StudiOLD" é fixa
  (S-t-u-d-i-O-L-D).
- Voz da marca e identidade visual ainda não definidas — não assumir.

## Evidence on Hand

- Migrações Supabase reais em `infra/supabase/migrations/`: estrutura completa mais seed
  da StudiOLD (horários de funcionamento, bloqueio de almoço, 13 serviços com preços
  reais).
- O app `apps/studiold` roda, mas a UI ainda é o boilerplate do `create-next-app` — não
  é design incumbente do produto.
- `apps/studiold/.env.local` lista as integrações pretendidas (Supabase, Evolution API,
  OpenAI).
- Não há clientes além da StudiOLD, nem métricas de uso, depoimentos ou material de
  imprensa. Nenhum destes deve ser fabricado por trabalho futuro.

## Product Principles

1. **A conversa é a interface do cliente.** Tudo que o cliente final precisa fazer tem de
   caber num diálogo de WhatsApp; o portal web é da equipe.
2. **A agenda se autopreenche.** Uma vaga que abre deve virar oferta automática (fila ou
   encaixe) antes de exigir ação da equipe.
3. **Um tenant nunca enxerga outro.** Isolamento por schema e RLS é regra dura, não
   otimização.
4. **O core é da plataforma; a regra é da vertical.** Diferenças entre barbearia, oficina
   e usinagem vivem em configuração por tenant, não em forks de código.
5. **O estado do WhatsApp é sempre visível.** A equipe precisa saber, sem procurar, se o
   canal com o cliente está no ar.

## Accessibility & Inclusion

Nenhum requisito específico de produto foi estabelecido ainda.
