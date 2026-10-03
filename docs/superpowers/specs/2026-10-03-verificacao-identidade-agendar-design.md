# Verificação de Identidade — `/agendar` Passo 1 (Spec A) — Design

## Objetivo

Primeira tela da rota pública `/agendar` (agendamento self-service da StudiOLD): o cliente informa telefone, confirma identidade por um código de 6 dígitos enviado por e-mail, e chega ao Passo 2 com `{clienteId, nome, telefone}` resolvido — cliente existente reconhecido ou cliente novo cadastrado. O resto do wizard (Passos 2-5: serviços, data/hora, confirmação, sucesso) é a Spec B, separada, e consome o contrato de saída desta spec.

## Decisões (aprovadas no chat)

- **2 specs.** Esta (A) cobre só identificação/verificação. Spec B (agendamento) vem depois, já quase pronta pra virar plano — RPCs que ela usa (`fn_catalogo_servicos_v2`, `fn_buscar_disponibilidade`, `fn_confirmar_booking_whatsapp_v2`) já existem no banco, sem migration.
- **Só e-mail por ora.** Instância Evolution da `studiold-victorio` não está conectada. Sem seletor de canal "WhatsApp ou Email" — vai direto pro código por e-mail. Coluna `canal` na tabela nova aceita `'whatsapp'` por compatibilidade futura, mas só `'email'` é implementado.
- **Resend com domínio de teste** (`onboarding@resend.dev` ou equivalente) por ora; troca pra domínio próprio depois, sem mudança de schema.
- **Sem pacote novo.** `packages/notifications` e `packages/whatsapp` estão vazios, sem scaffold de package.json/tsconfig em nenhum pacote do monorepo hoje. Envio de e-mail fica em `apps/studiold/lib/email/resend.ts` — abstração de pacote só quando um segundo tenant precisar.
- **"É você? Não" → volta pro campo telefone.** `clientes.telefone` é `UNIQUE`; não existe "outro cadastro" pra oferecer na mesma tela.
- **Rate limit definido aqui** (não estava no briefing original): no máx 3 códigos pedidos por telefone em 10 minutos; no máx 5 tentativas erradas por código antes de invalidar e forçar reenvio. Contado na própria tabela nova, sem infra extra (sem Redis).
- **Exceção de auth só para `/agendar`.** `proxy.ts` hoje redireciona tudo que não é `/login`. Esta spec abre a única exceção nova.

## Arquitetura

Igual ao resto do app, "path A": sem RLS em `barbearia_001`, sem Supabase Auth para cliente final — isolamento é service-role só no servidor (`tenantDb()`). A diferença desta rota é que **nenhuma Server Action aqui chama `requireUser()`** — é a única área do app onde isso é intencional. Precisa de um comentário explícito no arquivo pra não ser "corrigido" por engano num review futuro (o padrão dominante do app é toda Server Action ter `requireUser()`, ver `MEMORY.md`).

Duas pontas novas:

1. **`apps/studiold/proxy.ts`** — `PUBLIC_PATHS` ganha `/agendar` (com `startsWith`, cobre sub-rotas futuras do wizard). Único arquivo de auth tocado.
2. **`apps/studiold/lib/email/resend.ts`** — wrapper fino sobre o SDK do Resend (`sendEmail({to, subject, html})`), lê `RESEND_API_KEY` do ambiente. Chamado só pelas Server Actions do `/agendar`.

RPC reaproveitada sem mudança: `fn_cadastrar_cliente_whatsapp_v2(p_numero, p_nome, p_email, p_genero)` — já aceita e-mail opcional, cobre o cadastro do cliente novo ao fim da verificação.

## Dados

Tabela nova, schema `barbearia_001`, draft em `docs/migrations-draft/` (SQL escrito aqui na spec; a Server Action nunca roda DDL — quem aplica no banco é você, à mão, via `pnpm supabase migration new` + `db push`, por regra de `.claude/rules/security.md`):

```sql
create table barbearia_001.codigos_verificacao (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  codigo text not null,
  canal text not null default 'email' check (canal in ('email', 'whatsapp')),
  email text,
  tentativas integer not null default 0,
  expira_em timestamptz not null,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index idx_codigos_verificacao_telefone
  on barbearia_001.codigos_verificacao (telefone, usado, expira_em);
```

`tentativas` é a adição desta spec sobre o schema original do briefing — suporte do rate limit de código errado.

## Arquivos

**Novos:**
- `apps/studiold/app/agendar/page.tsx` — RSC da rota pública, sem `requireUser()`. Passo 1 do wizard; passos 2-5 chegam na Spec B.
- `apps/studiold/app/agendar/actions.ts` — Server Actions: `iniciarVerificacao`, `verificarCodigo`, `confirmarCadastro`. Comentário no topo do arquivo explicando a ausência deliberada de `requireUser()`.
- `apps/studiold/app/agendar/IdentificacaoForm.tsx` — `"use client"`, os três sub-estados da tela (telefone → código → nome, quando novo).
- `apps/studiold/lib/email/resend.ts` — `sendEmail()`.
- `apps/studiold/lib/agendar/codigo.ts` — `gerarCodigo()` puro (6 dígitos), testável.
- `docs/migrations-draft/2026-10-03-codigos-verificacao.sql` — draft da tabela acima.

**Modificados:**
- `apps/studiold/proxy.ts` — `PUBLIC_PATHS = ['/login', '/agendar']`, checagem por `startsWith`.
- `apps/studiold/package.json` — `+ resend`.
- `apps/studiold/.env.local` — `+ RESEND_API_KEY` (editado à mão, não por esta implementação).

## Fluxo

1. Cliente digita telefone → `iniciarVerificacao(telefone, email?)`:
   - normaliza telefone (reusa `lib/clientes/telefone.ts` `normalizarTelefone`);
   - rate limit: conta códigos pedidos pro telefone nos últimos 10 min — acima de 3, devolve erro, sem gerar novo;
   - busca em `clientes` por telefone normalizado **com `ativo = true` na query** (inativo não entra no resultado, conta como não encontrado nesta etapa por construção);
     - **encontrado, com e-mail salvo** → usa esse e-mail, não pergunta de novo;
     - **encontrado, sem e-mail salvo** → pede e-mail na tela;
     - **não encontrado** → pede e-mail na tela, é cadastro novo (pode ser telefone nunca visto ou telefone com cadastro inativo — os dois seguem este ramo; o inativo só se revela no passo 4, na resposta da RPC de cadastro);
   - gera código (`gerarCodigo()`), grava linha (`telefone`, `codigo`, `canal='email'`, `email`, `expira_em = now()+10min`), envia por `sendEmail()`.
2. Cliente digita o código → `verificarCodigo(telefone, codigo)`:
   - busca linha mais recente não usada e não expirada pro telefone;
   - código errado → incrementa `tentativas`; na 5ª, invalida a linha (`usado=true` sem sucesso) e devolve erro pedindo reenvio;
   - código certo → marca `usado=true`;
     - cliente já existia → devolve `{clienteId, nome}` pra tela "Olá, [nome]! É você?";
     - cliente novo → devolve sinal de "novo", avança pra tela de nome.
3. **Existente, "é você? sim"** → segue pro Passo 2 (Spec B) com `{clienteId, nome, telefone}`.
   **"não"** → limpa estado, volta pro campo telefone.
4. **Novo, digita nome** → `confirmarCadastro(telefone, nome, email)` → `fn_cadastrar_cliente_whatsapp_v2(telefone, nome, email)`:
   - `CLIENTE_CRIADO` → segue pro Passo 2 com o `cliente_id` devolvido;
   - `CLIENTE_INATIVO` → telefone já tem cadastro inativo; mensagem específica pedindo contato direto com a barbearia, sem seguir;
   - qualquer outro `sucesso:false` → mensagem genérica, sem seguir.

## Erros / edge

- Código expirado (>10min) ou já usado → tratado igual a "código errado": mensagem + opção de reenviar.
- 5 tentativas erradas no mesmo código → invalida, força reenvio (volta pro passo de pedir código, contra o rate limit de reenvio).
- 3 reenvios em 10 min → bloqueia novo pedido até a janela passar; mensagem com tempo de espera.
- `CLIENTE_INATIVO` no cadastro (telefone pertence a um cadastro desativado) → mensagem pedindo contato direto, sem caminho de auto-recuperação nesta spec.
- `RESEND_API_KEY` ausente → `lib/email/resend.ts` lança erro claro no boot/chamada, mesmo padrão de `lib/supabase/server.ts`.
- Domínio de teste do Resend: confirmar nos docs atuais (Context7) se há restrição de destinatário/volume antes de testar com e-mail de cliente real — não assumir do treino, API muda.
- Sem JS no browser do cliente: validação client-side é só conveniência; `iniciarVerificacao`/`verificarCodigo`/`confirmarCadastro` revalidam tudo no servidor (telefone, formato de código, janela de rate limit) — nunca confiam no estado que a UI mandou.

## Teste

Sem Chrome nesta máquina (recorrente no projeto) — aceitação em browser (375px, os 3 ramos: existente, novo, "não sou eu") fica pra quem tiver. `gerarCodigo()` ganha assert no estilo `agenda.check.ts` (formato: 6 dígitos, string, sem zero-padding quebrado). Lógica de rate limit e expiração depende de `now()` do Postgres — não é pura, verificação é manual/integração, não unit test.

## Fora de escopo

Canal WhatsApp (entra quando a instância Evolution conectar — spec própria depois, reaproveitando `packages/whatsapp` que também não existe ainda); Passos 2-5 do agendamento (Spec B); domínio de e-mail próprio no Resend; "meus agendamentos" por telefone verificado; qualquer `packages/notifications`.
