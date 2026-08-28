# Product

<!-- impeccable:product-schema 1 -->

Herda o `PRODUCT.md` da raiz do monorepo. Este arquivo restringe o escopo ao tenant
`barbearia_001` (StudiOLD) e registra só o que é específico dele.

## Platform

web

## Users

- **Equipe da StudiOLD** — dono e barbeiros. Operam agenda, clientes, serviços,
  horários, bloqueios, fila e encaixes pelo dashboard, no balcão ou no celular entre
  cortes.
- **Cliente da StudiOLD** — agenda, reagenda, cancela, entra na fila e pede encaixe pelo
  WhatsApp da barbearia.

## Product Purpose

Instância barbearia da plataforma Noetrix para a StudiOLD: a agenda da barbearia que o
cliente resolve pelo WhatsApp e a equipe supervisiona pelo painel. Sucesso local é agenda
cheia, cancelamentos reabsorvidos pela fila e pelo encaixe, e nenhum agendamento digitado
à mão.

## Positioning

A mesma da plataforma (WhatsApp com IA, automação de fila e encaixe, base multi-vertical),
aplicada a um único negócio de barbearia.

## Operating Context

- Horário da StudiOLD (seed): segunda, quarta, quinta e sexta 09:00–17:00; sábado
  08:00–17:00; domingo e terça fechados. Bloqueio suave de almoço 11:30–12:30.
- Catálogo real de 13 serviços, de Sobrancelha (15 min, R$ 20) a Progressiva (90 min,
  R$ 120) e "StudiOLD Completo" (90 min, R$ 130).
- Agenda tratada como fila única — o schema atual não modela múltiplos barbeiros.
- Domínio: `studiold.noetrix.com.br`. Instância de WhatsApp: `barbearia_001`.
- `NEXT_PUBLIC_TENANT` fixa o tenant deste app.

## Capabilities and Constraints

- Usa as tabelas do schema `barbearia_001` descritas no `PRODUCT.md` da raiz.
- Em aberto — não assumir: suporte a mais de um barbeiro; identidade visual da StudiOLD
  (logo, cores, tom).

## Brand Commitments

- Nome do negócio: **StudiOLD** (grafia fixa). É um tenant da Noetrix, não uma marca de
  software própria.
- Identidade visual ainda não fornecida.

## Evidence on Hand

- Seed real em `infra/supabase/migrations/20260825000003_seed_studiold.sql` (horários,
  almoço, 13 serviços com preço).
- `apps/studiold` roda; a UI atual é boilerplate do `create-next-app`, não design de
  produto.
- Sem logo, fotos ou depoimentos da StudiOLD no repositório. Não fabricar.

## Product Principles

Herda os princípios da plataforma. Ênfase local:

1. O cliente da barbearia faz tudo pelo WhatsApp; o painel é da equipe.
2. Cancelou, a fila ou o encaixe oferece a vaga antes de exigir ação do balcão.
3. Configuração (horários, serviços, bloqueios) reflete a operação real da StudiOLD e é
   editável pela equipe.

## Accessibility & Inclusion

Nenhum requisito específico estabelecido.
