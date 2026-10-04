# Agendamento self-service `/agendar` (Spec B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depois da identificação (Spec A), o cliente escolhe serviços, data/hora, cortesia e música, confirma, e recebe e-mail — com identidade lida só de um cookie httpOnly assinado.

**Architecture:** Cookie `agendar_sessao` assinado com HMAC (`node:crypto`) gravado pela Spec A ao concluir a verificação; Server Actions públicas (sem `requireUser()`) em `app/agendar/actions.ts` leem a identidade só do cookie e chamam `fn_catalogo_servicos_v2`, `fn_buscar_disponibilidade` e `fn_criar_agendamento_v2(..., 'site')` via `tenantDb()`. UI é um wizard client-side (`AgendarWizard`) numa rota só, com uma faixa preto-fosco com a logo e um componente por etapa.

**Tech Stack:** Next 16.3 (App Router, Server Actions, `cookies()` async), React 19.2, `@supabase/supabase-js` 2 (service-role), `resend` 6, CSS Modules + Tailwind 4 utilitário, check sem framework (`node --experimental-strip-types`).

**Spec:** `docs/superpowers/specs/2026-10-04-agendamento-agendar-design.md` (ler junto). Spec A: `docs/superpowers/specs/2026-10-03-verificacao-identidade-agendar-design.md`.

## Global Constraints

- **Pré-requisito manual (usuário, não o agente):** migration de `docs/migrations-draft/2026-10-03-codigos-verificacao.sql` aplicada (tabela `codigos_verificacao`, constraint `agendamentos_origem_check` com `'site'`, `fn_criar_agendamento_v2` recriada aceitando `'site'`); `RESEND_API_KEY` e `AGENDAR_COOKIE_SECRET` em `apps/studiold/.env.local` e na Vercel. Tasks 1-8 compilam sem isso; a Task 9 (integração) depende disso.
- **Nunca editar** `infra/supabase/migrations/**` nem `.env*` (hook `block-protected-paths.sh` bloqueia; regra `.claude/rules/security.md`).
- Nenhuma action de `/agendar` chama `requireUser()` (intencional, comentário no topo de `actions.ts`). Identidade das actions da Spec B vem **só** de `lerSessao()` — nunca de telefone/`clienteId` enviados pela UI.
- Erro de DB/API: `erroInterno(tag, mensagem)` (já existe em `actions.ts`) — detalhe só no log do servidor, mensagem fixa pt-BR pro cliente.
- Toda UI em pt-BR. Mobile-first (375px). Todo controle com label/`aria-label`. Alvos de toque ≥ 44px nas grades e linhas.
- Sem CSS global novo; `globals.css` intocado. Estilo novo só em `app/agendar/agendar.module.css`; tokens (`--matte`, `--matte-ink`, `--oxblood`, `--ink-2`, `--chrome`, `--enamel-hi`, `--r`) vêm do `.shell` de `app/agenda/agenda.module.css`, que envolve a página. Reusar `.btn`, `.btn--primary`, `.chip`, `.pageTitle`, `.msgQuiet`, `.field`, `.tnum`, `.cond` de lá.
- Sem dependência nova. HMAC por `node:crypto`.
- Imports relativos entre arquivos de `lib/` usam extensão `.ts` (o check roda com `--experimental-strip-types`); componentes/actions usam alias `@/`.
- Gate por task: `pnpm --filter studiold typecheck`, `pnpm --filter studiold lint`, `pnpm --filter studiold check`. Gate final adiciona `pnpm build` (raiz).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Desvio consciente da spec: os asserts do token de sessão e dos helpers de formato entram em `lib/agenda/agenda.check.ts` (padrão do repo — `gerarCodigo` já está lá), não num `sessao.check.ts` separado; o script `check` continua um só.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/agendar/sessao-token.ts` | criar | assinar/ler token `{clienteId, telefone, exp}` — puro, testável |
| `lib/agendar/sessao.ts` | criar | wrappers de cookie (`gravarSessao`, `lerSessao`, `apagarSessao`) sobre `cookies()` |
| `lib/agendar/formato.ts` | criar | helpers puros: máscara de e-mail, combo, turno, rótulo de dia, próximo dia, partes de data em São Paulo, escape HTML |
| `lib/agenda/agenda.check.ts` | modificar | asserts dos dois arquivos puros acima |
| `app/agendar/actions.ts` | modificar | gravar/apagar sessão na Spec A; actions novas `carregarCatalogo`, `buscarHorarios`, `confirmarAgendamento`, `encerrarSessao` |
| `app/agendar/IdentificacaoForm.tsx` | modificar | "Não, não sou eu" chama `encerrarSessao()` |
| `app/agendar/agendar.module.css` | criar | faixa, linhas de serviço, rodapé, dias, grade, comanda, esqueleto |
| `app/agendar/AgendarCabecalho.tsx` | criar | faixa preto-fosco com logo em máscara, etapa e voltar |
| `app/agendar/EtapaServicos.tsx` | criar | lista agrupada com multi-seleção + rodapé |
| `app/agendar/EtapaHorario.tsx` | criar | chips de dia + grade manhã/tarde + ver mais dias |
| `app/agendar/EtapaConfirmacao.tsx` | criar | comanda + chips cortesia/estilo + confirmar |
| `app/agendar/EtapaSucesso.tsx` | criar | "Agendado!" + comanda + linha do e-mail |
| `app/agendar/AgendarWizard.tsx` | criar | estado do wizard, transições, sessão expirada, horário ocupado |
| `app/agendar/page.tsx` | modificar | renderiza `AgendarWizard` dentro do `.shell` |

---

### Task 1: Token de sessão assinado (puro)

**Files:**
- Create: `apps/studiold/lib/agendar/sessao-token.ts`
- Modify: `apps/studiold/lib/agenda/agenda.check.ts` (import no topo; bloco novo antes de `console.log("agenda.check: OK")`)

**Interfaces:**
- Produces:
  - `export type DadosSessao = { clienteId: string; telefone: string; exp: number }` (`exp` = epoch ms)
  - `export function assinarSessao(dados: DadosSessao, secret: string): string`
  - `export function lerSessaoAssinada(valor: string, secret: string, agora: number): DadosSessao | null`

- [ ] **Step 1: Write the failing test** — em `lib/agenda/agenda.check.ts`, adicionar ao bloco de imports:

```ts
import { assinarSessao, lerSessaoAssinada } from "../agendar/sessao-token.ts";
```

e antes de `console.log("agenda.check: OK");`:

```ts
// --- token de sessão de /agendar ---------------------------------------
{
  const S = "segredo-de-teste-com-mais-de-32-caracteres!!";
  const dados = { clienteId: "c1", telefone: "11987654321", exp: 2_000 };
  const tok = assinarSessao(dados, S);
  assert.deepEqual(lerSessaoAssinada(tok, S, 1_000), dados, "ida e volta");
  assert.equal(lerSessaoAssinada(tok, S, 2_000), null, "exp == agora → expirado");
  assert.equal(lerSessaoAssinada(tok, "outro-segredo-de-teste-tambem-longo!!", 1_000), null, "segredo errado");
  const [corpo, sig] = tok.split(".");
  const corpoFalso = Buffer.from(JSON.stringify({ ...dados, clienteId: "c2" })).toString("base64url");
  assert.equal(lerSessaoAssinada(`${corpoFalso}.${sig}`, S, 1_000), null, "payload adulterado");
  assert.equal(lerSessaoAssinada(`${corpo}.${sig}x`, S, 1_000), null, "assinatura adulterada");
  assert.equal(lerSessaoAssinada("", S, 1_000), null, "vazio");
  assert.equal(lerSessaoAssinada("a.b.c", S, 1_000), null, "partes demais");
  assert.equal(lerSessaoAssinada("semponto", S, 1_000), null, "sem assinatura");
  const lixo = Buffer.from("não é json").toString("base64url");
  const sigLixo = assinarSessao(dados, S).split(".")[1];
  assert.equal(lerSessaoAssinada(`${lixo}.${sigLixo}`, S, 1_000), null, "corpo não-JSON");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter studiold check`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` para `../agendar/sessao-token.ts`.

- [ ] **Step 3: Write minimal implementation** — `lib/agendar/sessao-token.ts`:

```ts
// Token da sessão de agendamento de /agendar: prova, do lado do servidor,
// que o telefone passou pela verificação por código (Spec A). Formato:
// base64url(JSON) + "." + base64url(HMAC-SHA256(corpo)). Puro e testável —
// quem lê/grava cookie é lib/agendar/sessao.ts.
import { createHmac, timingSafeEqual } from "node:crypto";

export type DadosSessao = { clienteId: string; telefone: string; exp: number };

function assinatura(corpo: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(corpo).digest();
}

export function assinarSessao(dados: DadosSessao, secret: string): string {
  const corpo = Buffer.from(JSON.stringify(dados)).toString("base64url");
  return `${corpo}.${assinatura(corpo, secret).toString("base64url")}`;
}

export function lerSessaoAssinada(valor: string, secret: string, agora: number): DadosSessao | null {
  const partes = valor.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  const [corpo, sig] = partes;
  const esperado = assinatura(corpo, secret);
  const recebido = Buffer.from(sig, "base64url");
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;

  let d: unknown;
  try {
    d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const { clienteId, telefone, exp } = d as Record<string, unknown>;
  if (typeof clienteId !== "string" || typeof telefone !== "string" || typeof exp !== "number") return null;
  if (exp <= agora) return null;
  return { clienteId, telefone, exp };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter studiold check && pnpm --filter studiold typecheck && pnpm --filter studiold lint`
Expected: `agenda.check: OK`, typecheck e lint sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/lib/agendar/sessao-token.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat(studiold): token HMAC da sessão de agendamento de /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cookie de sessão + Spec A grava/apaga a sessão

**Files:**
- Create: `apps/studiold/lib/agendar/sessao.ts`
- Modify: `apps/studiold/app/agendar/actions.ts` (imports; `verificarCodigo` no ramo de cliente existente; `confirmarCadastro` no ramo `CLIENTE_CRIADO`; action nova `encerrarSessao` no fim do arquivo)
- Modify: `apps/studiold/app/agendar/IdentificacaoForm.tsx` (import; botão "Não, não sou eu")

**Interfaces:**
- Consumes: `assinarSessao`, `lerSessaoAssinada`, `DadosSessao` (Task 1).
- Produces:
  - `gravarSessao(d: { clienteId: string; telefone: string }): Promise<void>`
  - `lerSessao(): Promise<DadosSessao | null>`
  - `apagarSessao(): Promise<void>`
  - Server Action `encerrarSessao(): Promise<void>` em `app/agendar/actions.ts`

- [ ] **Step 1: Create `lib/agendar/sessao.ts`**

```ts
// Cookie da sessão de agendamento de /agendar. Só Server Actions de
// app/agendar/actions.ts chamam isto (cookies() só é gravável em Server
// Action / Route Handler). O segredo vem de AGENDAR_COOKIE_SECRET, editado à
// mão em .env.local e na Vercel — falha alto se faltar, mesmo padrão de
// lib/email/resend.ts.
import "server-only";
import { cookies } from "next/headers";
import { assinarSessao, lerSessaoAssinada, type DadosSessao } from "./sessao-token.ts";

const NOME = "agendar_sessao";
const DURACAO_MIN = 30;

function segredo(): string {
  const s = process.env.AGENDAR_COOKIE_SECRET;
  if (!s || s.length < 32) throw new Error("Falta AGENDAR_COOKIE_SECRET (>= 32 caracteres) no ambiente");
  return s;
}

export async function gravarSessao(d: { clienteId: string; telefone: string }): Promise<void> {
  const exp = Date.now() + DURACAO_MIN * 60_000;
  (await cookies()).set(NOME, assinarSessao({ ...d, exp }, segredo()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/agendar",
    maxAge: DURACAO_MIN * 60,
  });
}

export async function lerSessao(): Promise<DadosSessao | null> {
  const valor = (await cookies()).get(NOME)?.value;
  return valor ? lerSessaoAssinada(valor, segredo(), Date.now()) : null;
}

export async function apagarSessao(): Promise<void> {
  (await cookies()).delete({ name: NOME, path: "/agendar" });
}
```

Nota: o import `./sessao-token.ts` com extensão segue a convenção de `lib/` (`allowImportingTsExtensions` está ligado no `tsconfig.json`).

- [ ] **Step 2: Wire Spec A in `app/agendar/actions.ts`**

Adicionar aos imports:

```ts
import { gravarSessao, apagarSessao } from "@/lib/agendar/sessao";
```

Em `verificarCodigo`, no ramo `if (c) { ... }`, trocar a linha

```ts
    return { ok: true, novo: false, clienteId: c.id, nome: c.nome };
```

por

```ts
    await gravarSessao({ clienteId: c.id, telefone });
    return { ok: true, novo: false, clienteId: c.id, nome: c.nome };
```

Em `confirmarCadastro`, no ramo `CLIENTE_CRIADO`, trocar

```ts
    return { ok: true, clienteId: r.cliente_id, nome: r.nome ?? nome };
```

por

```ts
    await gravarSessao({ clienteId: r.cliente_id, telefone });
    return { ok: true, clienteId: r.cliente_id, nome: r.nome ?? nome };
```

No fim do arquivo:

```ts
// "É você? Não" — descarta a prova de verificação antes de voltar ao telefone.
export async function encerrarSessao(): Promise<void> {
  await apagarSessao();
}
```

- [ ] **Step 3: Wire the "não sou eu" button in `IdentificacaoForm.tsx`**

Import:

```ts
import {
  iniciarVerificacao,
  verificarCodigo,
  confirmarCadastro,
  encerrarSessao,
} from "./actions";
```

No bloco `etapa.tipo === "identidade"`, trocar o botão

```tsx
          <button type="button" className={`${styles.btn} justify-center`} onClick={recomecar}>
            Não, não sou eu
          </button>
```

por

```tsx
          <button
            type="button"
            className={`${styles.btn} justify-center`}
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                await encerrarSessao().catch(() => undefined);
                recomecar();
              })
            }
          >
            Não, não sou eu
          </button>
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check`
Expected: sem erros; `agenda.check: OK`.
Run: `grep -n "gravarSessao\|encerrarSessao" apps/studiold/app/agendar/actions.ts`
Expected: 2 chamadas de `gravarSessao` + definição de `encerrarSessao`.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/lib/agendar/sessao.ts apps/studiold/app/agendar/actions.ts apps/studiold/app/agendar/IdentificacaoForm.tsx
git commit -m "feat(studiold): /agendar grava cookie assinado ao verificar identidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Helpers puros de formato

**Files:**
- Create: `apps/studiold/lib/agendar/formato.ts`
- Modify: `apps/studiold/lib/agenda/agenda.check.ts` (import + bloco antes do `console.log` final)

**Interfaces:**
- Consumes: `parseYmd`, `ymd`, `DIAS_SEMANA_CURTO` de `lib/agenda/time.ts`.
- Produces:
  - `mascararEmail(email: string): string` — `"joao@gmail.com"` → `"j***@g***.com"`
  - `ehCombo(nome: string): boolean`
  - `turno(hora: string): "manha" | "tarde"` — `hora` em `"HH:MM"`
  - `rotuloDia(dataYmd: string): string` — `"2026-10-06"` → `"Ter 06/10"`
  - `proximoDia(dataYmd: string): string`
  - `partesSaoPaulo(iso: string): { data: string; hora: string }` — data `YYYY-MM-DD`, hora `HH:MM` no fuso `America/Sao_Paulo`
  - `escaparHtml(s: string): string`

- [ ] **Step 1: Write the failing test** — import:

```ts
import {
  mascararEmail,
  ehCombo,
  turno,
  rotuloDia,
  proximoDia,
  partesSaoPaulo,
  escaparHtml,
} from "../agendar/formato.ts";
```

bloco:

```ts
// --- formato de /agendar -------------------------------------------------
{
  assert.equal(mascararEmail("joao@gmail.com"), "j***@g***.com");
  assert.equal(mascararEmail("a@b.com.br"), "a***@b***.br", "só o último TLD fica visível");
  assert.equal(mascararEmail("x@localhost"), "x***@l***", "domínio sem ponto");
  assert.equal(mascararEmail("lixo"), "seu e-mail", "sem @ não vaza nada");
  assert.equal(ehCombo("Combo Corte + Barba"), true);
  assert.equal(ehCombo("combo   x"), true, "minúsculo também");
  assert.equal(ehCombo("Corte"), false);
  assert.equal(ehCombo("Combodo"), false, "precisa do espaço depois de combo");
  assert.equal(turno("09:00"), "manha");
  assert.equal(turno("11:59"), "manha");
  assert.equal(turno("12:00"), "tarde");
  assert.equal(rotuloDia("2026-10-06"), "Ter 06/10");
  assert.equal(rotuloDia("2026-10-10"), "Sáb 10/10");
  assert.equal(proximoDia("2026-10-31"), "2026-11-01", "vira o mês");
  assert.equal(proximoDia("2026-12-31"), "2027-01-01", "vira o ano");
  assert.deepEqual(partesSaoPaulo("2026-10-10T12:30:00Z"), { data: "2026-10-10", hora: "09:30" }, "UTC-3");
  assert.deepEqual(partesSaoPaulo("2026-10-10T02:00:00Z"), { data: "2026-10-09", hora: "23:00" }, "volta um dia");
  assert.equal(escaparHtml(`<b>"Zé" & 'cia'</b>`), "&lt;b&gt;&quot;Zé&quot; &amp; &#39;cia&#39;&lt;/b&gt;");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter studiold check`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` para `../agendar/formato.ts`.

- [ ] **Step 3: Write minimal implementation** — `lib/agendar/formato.ts`:

```ts
// Helpers puros de apresentação do wizard de /agendar. Datas chegam do banco
// como "YYYY-MM-DD" e horas como "HH:MM(:SS)" já no fuso da barbearia
// (fn_buscar_disponibilidade), então a UI não converte fuso. Só o e-mail,
// montado no servidor (Vercel = UTC), usa partesSaoPaulo().
import { DIAS_SEMANA_CURTO, parseYmd, ymd } from "../agenda/time.ts";

export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return "seu e-mail";
  const ponto = dominio.lastIndexOf(".");
  const nome = ponto > 0 ? dominio.slice(0, ponto) : dominio;
  const tld = ponto > 0 ? dominio.slice(ponto) : "";
  return `${usuario[0]}***@${nome[0]}***${tld}`;
}

// Mesmo critério da ordenação de fn_catalogo_servicos_v2.
export function ehCombo(nome: string): boolean {
  return nome.toLowerCase().startsWith("combo ");
}

export function turno(hora: string): "manha" | "tarde" {
  return hora < "12:00" ? "manha" : "tarde";
}

export function rotuloDia(dataYmd: string): string {
  const d = parseYmd(dataYmd);
  const dia = DIAS_SEMANA_CURTO[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${dd}/${mm}`;
}

export function proximoDia(dataYmd: string): string {
  const d = parseYmd(dataYmd);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

const FMT_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function partesSaoPaulo(iso: string): { data: string; hora: string } {
  const p = Object.fromEntries(FMT_SP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter studiold check && pnpm --filter studiold typecheck && pnpm --filter studiold lint`
Expected: `agenda.check: OK`; sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/lib/agendar/formato.ts apps/studiold/lib/agenda/agenda.check.ts
git commit -m "feat(studiold): helpers de formato do wizard de /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Server Actions da Spec B

**Files:**
- Modify: `apps/studiold/app/agendar/actions.ts` (imports; tipos e 3 actions novas no fim do arquivo)

**Interfaces:**
- Consumes: `lerSessao`, `apagarSessao` (Task 2); `mascararEmail`, `partesSaoPaulo`, `rotuloDia`, `escaparHtml` (Task 3); `tenantDb`, `sendEmail`, `erroInterno` (já existem); `fmtPreco` de `lib/agenda/time.ts`.
- Produces (exportados de `app/agendar/actions.ts`):

```ts
export type ServicoCatalogo = { id: string; nome: string; preco: number; duracaoMin: number };
export type OpcaoCatalogo = { id: string; nome: string };
export type Catalogo = {
  servicos: ServicoCatalogo[];
  cortesias: OpcaoCatalogo[];
  estilos: OpcaoCatalogo[];
  cortesiaFavoritaId: string | null;
  estiloFavoritoId: string | null;
};
export type Horario = { data: string; hora: string; inicio: string }; // data YYYY-MM-DD, hora HH:MM, inicio ISO
export type FalhaAgendar = {
  ok: false;
  error: string;
  sessaoExpirada?: true;
  motivo?: "horario" | "cortesia" | "estilo";
};
export type ResumoAgendamento = {
  servicos: string[];
  data: string;
  hora: string;
  duracaoMin: number;
  valorTotal: number;
  emailMascarado: string | null; // null = e-mail não enviado
};

carregarCatalogo(): Promise<{ ok: true; catalogo: Catalogo } | FalhaAgendar>
buscarHorarios(servicoIds: string[], dataInicio?: string): Promise<{ ok: true; horarios: Horario[] } | FalhaAgendar>
confirmarAgendamento(p: { servicoIds: string[]; inicio: string; cortesiaId: string | null; estiloId: string | null }): Promise<{ ok: true; resumo: ResumoAgendamento } | FalhaAgendar>
```

- [ ] **Step 1: Add imports** em `app/agendar/actions.ts`:

```ts
import { gravarSessao, apagarSessao, lerSessao } from "@/lib/agendar/sessao";
import { mascararEmail, partesSaoPaulo, rotuloDia, escaparHtml } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
```

(substitui o import de `gravarSessao, apagarSessao` da Task 2.)

- [ ] **Step 2: Append types, validators and `carregarCatalogo`** no fim do arquivo:

```ts
// ===========================================================================
// Spec B — Passos 2-5. Identidade vem SÓ de lerSessao() (cookie httpOnly
// assinado gravado acima). Telefone/clienteId vindos da UI nunca são aceitos.
// Ver docs/superpowers/specs/2026-10-04-agendamento-agendar-design.md
// ===========================================================================

export type ServicoCatalogo = { id: string; nome: string; preco: number; duracaoMin: number };
export type OpcaoCatalogo = { id: string; nome: string };
export type Catalogo = {
  servicos: ServicoCatalogo[];
  cortesias: OpcaoCatalogo[];
  estilos: OpcaoCatalogo[];
  cortesiaFavoritaId: string | null;
  estiloFavoritoId: string | null;
};
export type Horario = { data: string; hora: string; inicio: string };
export type FalhaAgendar = {
  ok: false;
  error: string;
  sessaoExpirada?: true;
  motivo?: "horario" | "cortesia" | "estilo";
};
export type ResumoAgendamento = {
  servicos: string[];
  data: string;
  hora: string;
  duracaoMin: number;
  valorTotal: number;
  emailMascarado: string | null;
};

const SEM_SESSAO: FalhaAgendar = {
  ok: false,
  sessaoExpirada: true,
  error: "Sua sessão expirou, confirme o telefone de novo.",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function servicoIdsValidos(ids: unknown): ids is string[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= 10 &&
    ids.every((x) => typeof x === "string" && UUID.test(x)) &&
    new Set(ids).size === ids.length
  );
}

function idOpcionalValido(id: unknown): id is string | null {
  return id === null || (typeof id === "string" && UUID.test(id));
}

export async function carregarCatalogo(): Promise<{ ok: true; catalogo: Catalogo } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;
  const db = tenantDb();

  const [cat, cortesias, estilos, cliente] = await Promise.all([
    db.rpc("fn_catalogo_servicos_v2"),
    db.from("cortesias").select("id, nome").eq("ativo", true).gt("quantidade_estoque", 0).order("nome"),
    db.from("estilos_musica").select("id, nome").eq("ativo", true).order("nome"),
    db
      .from("clientes")
      .select("cortesia_favorita_id, estilo_musica_id")
      .eq("id", sessao.clienteId)
      .eq("ativo", true)
      .maybeSingle(),
  ]);
  if (cat.error) return erroInterno("carregarCatalogo/rpc", cat.error.message);
  if (cortesias.error) return erroInterno("carregarCatalogo/cortesias", cortesias.error.message);
  if (estilos.error) return erroInterno("carregarCatalogo/estilos", estilos.error.message);
  if (cliente.error) return erroInterno("carregarCatalogo/cliente", cliente.error.message);
  if (!cliente.data) return SEM_SESSAO; // cliente desativado depois da verificação

  const r = cat.data as {
    servicos: { id: string; nome: string; preco: number | string; duracao_minutos: number }[];
  };
  const fav = cliente.data as { cortesia_favorita_id: string | null; estilo_musica_id: string | null };
  const listaCortesias = (cortesias.data ?? []) as OpcaoCatalogo[];
  const listaEstilos = (estilos.data ?? []) as OpcaoCatalogo[];

  return {
    ok: true,
    catalogo: {
      servicos: r.servicos.map((s) => ({
        id: s.id,
        nome: s.nome,
        preco: Number(s.preco),
        duracaoMin: s.duracao_minutos,
      })),
      cortesias: listaCortesias,
      estilos: listaEstilos,
      // favorito só vale se ainda está na lista (ativo / com estoque)
      cortesiaFavoritaId: listaCortesias.some((c) => c.id === fav.cortesia_favorita_id)
        ? fav.cortesia_favorita_id
        : null,
      estiloFavoritoId: listaEstilos.some((e) => e.id === fav.estilo_musica_id) ? fav.estilo_musica_id : null,
    },
  };
}
```

- [ ] **Step 3: Append `buscarHorarios`**

```ts
export async function buscarHorarios(
  servicoIds: string[],
  dataInicio?: string,
): Promise<{ ok: true; horarios: Horario[] } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;
  if (!servicoIdsValidos(servicoIds)) return { ok: false, error: "Escolha ao menos um serviço." };
  if (dataInicio !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
    return { ok: false, error: "Data inválida." };
  }

  const rpc = await tenantDb().rpc("fn_buscar_disponibilidade", {
    p_servicos: servicoIds,
    p_data_inicio: dataInicio ?? null,
    p_qtd_dias: 7,
  });
  if (rpc.error) return erroInterno("buscarHorarios", rpc.error.message);

  const linhas = (rpc.data ?? []) as { data: string; data_hora: string; hora: string }[];
  return {
    ok: true,
    horarios: linhas.map((l) => ({ data: l.data, hora: l.hora.slice(0, 5), inicio: l.data_hora })),
  };
}
```

- [ ] **Step 4: Append `confirmarAgendamento`**

```ts
export async function confirmarAgendamento(p: {
  servicoIds: string[];
  inicio: string;
  cortesiaId: string | null;
  estiloId: string | null;
}): Promise<{ ok: true; resumo: ResumoAgendamento } | FalhaAgendar> {
  const sessao = await lerSessao();
  if (!sessao) return SEM_SESSAO;
  if (!servicoIdsValidos(p.servicoIds)) return { ok: false, error: "Escolha ao menos um serviço." };
  if (typeof p.inicio !== "string" || Number.isNaN(Date.parse(p.inicio))) {
    return { ok: false, motivo: "horario", error: "Escolha um horário." };
  }
  if (!idOpcionalValido(p.cortesiaId) || !idOpcionalValido(p.estiloId)) {
    return { ok: false, error: "Opção inválida." };
  }

  const db = tenantDb();

  // Mesmas checagens de fn_confirmar_booking_whatsapp_v2, antes da RPC, pra
  // dar mensagem específica em vez da exceção genérica.
  if (p.cortesiaId) {
    const c = await db
      .from("cortesias")
      .select("id")
      .eq("id", p.cortesiaId)
      .eq("ativo", true)
      .gt("quantidade_estoque", 0)
      .maybeSingle();
    if (c.error) return erroInterno("confirmarAgendamento/cortesia", c.error.message);
    if (!c.data) {
      return { ok: false, motivo: "cortesia", error: "Essa cortesia acabou de esgotar. Escolha outra ou nenhuma." };
    }
  }
  if (p.estiloId) {
    const e = await db.from("estilos_musica").select("id").eq("id", p.estiloId).eq("ativo", true).maybeSingle();
    if (e.error) return erroInterno("confirmarAgendamento/estilo", e.error.message);
    if (!e.data) {
      return { ok: false, motivo: "estilo", error: "Esse estilo de música não está mais disponível." };
    }
  }

  const rpc = await db.rpc("fn_criar_agendamento_v2", {
    p_cliente_id: sessao.clienteId,
    p_servicos: p.servicoIds,
    p_inicio: p.inicio,
    p_cortesia_id: p.cortesiaId,
    p_estilo_musica_id: p.estiloId,
    p_origem: "site",
  });
  if (rpc.error) {
    const msg = rpc.error.message;
    console.error("[agendar/confirmarAgendamento]", msg);
    if (msg.includes("Horário indisponível")) {
      return { ok: false, motivo: "horario", error: "Esse horário acabou de ser ocupado, escolha outro." };
    }
    if (msg.includes("Cortesia")) {
      return { ok: false, motivo: "cortesia", error: "Essa cortesia acabou de esgotar. Escolha outra ou nenhuma." };
    }
    if (msg.includes("Estilo musical")) {
      return { ok: false, motivo: "estilo", error: "Esse estilo de música não está mais disponível." };
    }
    if (msg.includes("Cliente inexistente")) return SEM_SESSAO;
    return { ok: false, error: "Não foi possível completar essa etapa. Tente de novo em alguns segundos." };
  }

  const r = rpc.data as { inicio: string; duracao_total: number; valor_total: number | string };
  // Agendamento criado: a partir daqui nada desfaz ele. Sessão é de uso único.
  await apagarSessao();

  const [servicos, cliente] = await Promise.all([
    db.from("servicos").select("id, nome").in("id", p.servicoIds),
    db.from("clientes").select("nome, email").eq("id", sessao.clienteId).maybeSingle(),
  ]);
  const nomesPorId = new Map(((servicos.data ?? []) as { id: string; nome: string }[]).map((s) => [s.id, s.nome]));
  const nomes = p.servicoIds.map((id) => nomesPorId.get(id) ?? "Serviço");
  const { data, hora } = partesSaoPaulo(r.inicio);
  const valorTotal = Number(r.valor_total);
  const resumoBase = { servicos: nomes, data, hora, duracaoMin: r.duracao_total, valorTotal };

  const c = cliente.data as { nome: string; email: string | null } | null;
  let emailMascarado: string | null = null;
  if (c?.email) {
    const envio = await sendEmail({
      to: c.email,
      subject: `Agendado: ${rotuloDia(data)} às ${hora} — StudiOLD`,
      html:
        `<p>Olá, ${escaparHtml(c.nome)}! Seu horário na StudiOLD está marcado.</p>` +
        `<p><strong>${escaparHtml(rotuloDia(data))} às ${hora}</strong></p>` +
        `<ul>${nomes.map((n) => `<li>${escaparHtml(n)}</li>`).join("")}</ul>` +
        `<p>Total: ${escaparHtml(fmtPreco(valorTotal))} · ${r.duracao_total} min</p>`,
    });
    if (envio.ok) emailMascarado = mascararEmail(c.email);
    else console.error("[agendar/confirmarAgendamento/email]", envio.error);
  }

  return { ok: true, resumo: { ...resumoBase, emailMascarado } };
}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check`
Expected: sem erros.
Run: `grep -n "requireUser\|telefoneRaw" apps/studiold/app/agendar/actions.ts | grep -n "carregarCatalogo\|buscarHorarios\|confirmarAgendamento"`
Expected: nenhuma saída (as actions novas não recebem telefone nem chamam `requireUser`).

- [ ] **Step 6: Commit**

```bash
git add apps/studiold/app/agendar/actions.ts
git commit -m "feat(studiold): Server Actions de catálogo, horários e confirmação em /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Faixa do topo, CSS do wizard e etapa Serviços

**Files:**
- Create: `apps/studiold/app/agendar/agendar.module.css`
- Create: `apps/studiold/app/agendar/AgendarCabecalho.tsx`
- Create: `apps/studiold/app/agendar/EtapaServicos.tsx`

**Interfaces:**
- Consumes: `Catalogo`, `ServicoCatalogo` (Task 4); `ehCombo` (Task 3); `fmtPreco` de `@/lib/agenda/time`.
- Produces:
  - `AgendarCabecalho({ etapa, onVoltar }: { etapa: string; onVoltar?: () => void })`
  - `EtapaServicos({ nome, catalogo, selecionados, onAlternar, onContinuar, pendente }: { nome: string; catalogo: Catalogo | null; selecionados: string[]; onAlternar: (id: string) => void; onContinuar: () => void; pendente: boolean })`
  - classes CSS de `agendar.module.css` usadas nas Tasks 6-8: `faixa`, `faixaInner`, `faixaVoltar`, `logo`, `faixaEtapa`, `corpo`, `grupoTitulo`, `lista`, `linha`, `linhaCheck`, `linhaNome`, `linhaMeta`, `linhaPreco`, `rodape`, `rodapeInner`, `rodapeTotal`, `dias`, `dia`, `grade`, `slot`, `comanda`, `comandaLinha`, `comandaDestaque`, `comandaTotal`, `esqueleto`

- [ ] **Step 1: Create `app/agendar/agendar.module.css`**

```css
/* Wizard público de /agendar. Vive dentro do .shell de
   app/agenda/agenda.module.css e usa os tokens dele (--matte, --matte-ink,
   --oxblood, --chrome, --ink-2...). Faixa e rodapé preto-fosco são o momento
   de marca; o resto é ferramenta, oxblood só em ação/seleção. */

.faixa {
  background: var(--matte);
  color: var(--matte-ink);
  padding-top: env(safe-area-inset-top, 0px);
}
.faixaInner {
  max-width: 28rem;
  margin: 0 auto;
  padding: 0.85rem 1rem 0.7rem;
  display: grid;
  grid-template-columns: 2.75rem 1fr 2.75rem;
  align-items: center;
}
.faixaVoltar {
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  color: var(--matte-ink);
  border-radius: var(--r);
}
.faixaVoltar:hover { background: rgba(222, 217, 207, 0.08); }
.faixaVoltar:focus-visible { outline: 2px solid var(--oxblood-on-dark); outline-offset: 2px; }
.logo {
  justify-self: center;
  height: 28px;
  aspect-ratio: 830 / 159;
  background: var(--matte-ink);
  -webkit-mask: url("/studiold-logo.svg") no-repeat center / contain;
  mask: url("/studiold-logo.svg") no-repeat center / contain;
}
.faixaEtapa {
  grid-column: 1 / -1;
  justify-self: center;
  margin-top: 0.4rem;
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--matte-ink);
}

.corpo {
  max-width: 28rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 7rem;
}

.grupoTitulo {
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-2);
  margin: 1.25rem 0 0.4rem;
}
.lista {
  background: var(--enamel-hi);
  box-shadow: inset 0 0 0 1px var(--chrome);
  border-radius: var(--r);
}
.linha {
  display: grid;
  grid-template-columns: 1.5rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.25rem;
  padding: 0.6rem 0.85rem;
  cursor: pointer;
}
.linha + .linha { border-top: 1px solid var(--chrome); }
.linha:has(input:checked) { background: rgba(123, 45, 38, 0.06); }
.linhaCheck {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--oxblood);
}
.linhaNome { color: var(--ink); line-height: 1.25; }
.linhaMeta { display: block; font-size: 0.8rem; color: var(--ink-2); }
.linhaPreco {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-weight: 600;
}

.rodape {
  position: fixed;
  inset: auto 0 0 0;
  background: var(--matte);
  color: var(--matte-ink);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.rodapeInner {
  max-width: 28rem;
  margin: 0 auto;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.rodapeTotal {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  line-height: 1.2;
}

.dias {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.4rem;
  scroll-snap-type: x proximity;
}
.dia {
  flex-shrink: 0;
  white-space: nowrap;
  min-height: 2.75rem;
  scroll-snap-align: start;
}
.grade {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}
.slot {
  min-height: 2.75rem;
  justify-content: center;
  font-size: 0.95rem;
}

.comanda {
  background: var(--enamel-hi);
  box-shadow: inset 0 0 0 1px var(--chrome);
  border-radius: var(--r);
  padding: 1rem;
}
.comandaDestaque {
  font-family: var(--font-barlow-cond), var(--font-barlow), system-ui, sans-serif;
  font-weight: 700;
  font-size: 1.35rem;
  line-height: 1.1;
  margin-bottom: 0.75rem;
}
.comandaLinha {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0;
}
.comandaTotal {
  display: flex;
  justify-content: space-between;
  border-top: 1px dashed var(--chrome-dark);
  margin-top: 0.5rem;
  padding-top: 0.6rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.esqueleto {
  height: 3.25rem;
  background: linear-gradient(90deg, var(--enamel-lo), var(--enamel-hi), var(--enamel-lo));
  background-size: 200% 100%;
  animation: brilho 1.2s linear infinite;
}
.esqueleto + .esqueleto { border-top: 1px solid var(--chrome); }
@keyframes brilho { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .esqueleto { animation: none; }
}
```

- [ ] **Step 2: Create `app/agendar/AgendarCabecalho.tsx`**

```tsx
// Faixa preto-fosco do topo de /agendar: logo da StudiOLD (SVG monocromático
// pintado com --matte-ink via mask — o arquivo não muda), etapa atual e
// "Voltar" quando a etapa permite.
import css from "./agendar.module.css";

export function AgendarCabecalho({ etapa, onVoltar }: { etapa: string; onVoltar?: () => void }) {
  return (
    <header className={css.faixa}>
      <div className={css.faixaInner}>
        {onVoltar ? (
          <button type="button" className={css.faixaVoltar} aria-label="Voltar" onClick={onVoltar}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        ) : (
          <span />
        )}
        <span className={css.logo} role="img" aria-label="StudiOLD" />
        <span />
        <p className={css.faixaEtapa}>{etapa}</p>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `app/agendar/EtapaServicos.tsx`**

```tsx
"use client";

import { ehCombo } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { Catalogo, ServicoCatalogo } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Props = {
  nome: string;
  catalogo: Catalogo | null;
  selecionados: string[];
  onAlternar: (id: string) => void;
  onContinuar: () => void;
  pendente: boolean;
};

export function EtapaServicos({ nome, catalogo, selecionados, onAlternar, onContinuar, pendente }: Props) {
  const escolhidos = catalogo?.servicos.filter((s) => selecionados.includes(s.id)) ?? [];
  const total = escolhidos.reduce((t, s) => t + s.preco, 0);
  const minutos = escolhidos.reduce((t, s) => t + s.duracaoMin, 0);
  const combos = catalogo?.servicos.filter((s) => ehCombo(s.nome)) ?? [];
  const avulsos = catalogo?.servicos.filter((s) => !ehCombo(s.nome)) ?? [];

  function grupo(titulo: string, itens: ServicoCatalogo[]) {
    if (itens.length === 0) return null;
    return (
      <section aria-label={titulo}>
        <h2 className={css.grupoTitulo}>{titulo}</h2>
        <div className={css.lista}>
          {itens.map((s) => (
            <label key={s.id} className={css.linha}>
              <input
                type="checkbox"
                className={css.linhaCheck}
                checked={selecionados.includes(s.id)}
                onChange={() => onAlternar(s.id)}
              />
              <span className={css.linhaNome}>
                {s.nome}
                <span className={css.linhaMeta}>{s.duracaoMin} min</span>
              </span>
              <span className={css.linhaPreco}>{fmtPreco(s.preco)}</span>
            </label>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Olá, {nome}!</h1>
      <p className={styles.msgQuiet}>O que vamos fazer hoje? Pode escolher mais de um.</p>

      {catalogo ? (
        <>
          {grupo("Combos", combos)}
          {grupo("Serviços", avulsos)}
        </>
      ) : (
        <div className={`${css.lista} mt-5`} aria-busy="true" aria-label="Carregando serviços">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={css.esqueleto} />
          ))}
        </div>
      )}

      <div className={css.rodape}>
        <div className={css.rodapeInner}>
          <p className={css.rodapeTotal} aria-live="polite">
            {escolhidos.length === 0 ? (
              "Nenhum serviço"
            ) : (
              <>
                {fmtPreco(total)}
                <br />
                <span className="text-xs">{minutos} min</span>
              </>
            )}
          </p>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--primary"]} py-3`}
            disabled={escolhidos.length === 0 || pendente}
            onClick={onContinuar}
          >
            {pendente ? "Buscando…" : "Escolher horário"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint`
Expected: sem erros (componentes ainda não usados — tudo bem).

- [ ] **Step 5: Commit**

```bash
git add apps/studiold/app/agendar/agendar.module.css apps/studiold/app/agendar/AgendarCabecalho.tsx apps/studiold/app/agendar/EtapaServicos.tsx
git commit -m "feat(studiold): faixa com logo e etapa Serviços do wizard /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Etapa Data e hora

**Files:**
- Create: `apps/studiold/app/agendar/EtapaHorario.tsx`

**Interfaces:**
- Consumes: `Horario` (Task 4); `rotuloDia`, `turno` (Task 3); classes `dias`, `dia`, `grupoTitulo`, `grade`, `slot`, `lista`, `esqueleto` (Task 5).
- Produces: `EtapaHorario({ horarios, carregando, temMais, aviso, onEscolher, onMaisDias }: { horarios: Horario[] | null; carregando: boolean; temMais: boolean; aviso: string | null; onEscolher: (h: Horario) => void; onMaisDias: () => void })`

- [ ] **Step 1: Create `app/agendar/EtapaHorario.tsx`**

```tsx
"use client";

import { useState } from "react";
import { rotuloDia, turno } from "@/lib/agendar/formato";
import type { Horario } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Props = {
  horarios: Horario[] | null; // null = primeira carga
  carregando: boolean;
  temMais: boolean;
  aviso: string | null;
  onEscolher: (h: Horario) => void;
  onMaisDias: () => void;
};

export function EtapaHorario({ horarios, carregando, temMais, aviso, onEscolher, onMaisDias }: Props) {
  const dias = horarios ? [...new Set(horarios.map((h) => h.data))] : [];
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);
  const dia = diaEscolhido && dias.includes(diaEscolhido) ? diaEscolhido : (dias[0] ?? null);
  const doDia = horarios?.filter((h) => h.data === dia) ?? [];
  const manha = doDia.filter((h) => turno(h.hora) === "manha");
  const tarde = doDia.filter((h) => turno(h.hora) === "tarde");

  function bloco(titulo: string, itens: Horario[]) {
    if (itens.length === 0) return null;
    return (
      <section aria-label={titulo}>
        <h2 className={css.grupoTitulo}>{titulo}</h2>
        <div className={css.grade}>
          {itens.map((h) => (
            <button
              key={h.inicio}
              type="button"
              className={`${styles.btn} ${css.slot}`}
              aria-label={`${rotuloDia(h.data)} às ${h.hora}`}
              onClick={() => onEscolher(h)}
            >
              {h.hora}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Quando?</h1>
      {aviso && (
        <p role="alert" className={`${styles.msgQuiet} mt-1`} data-tom="erro">
          {aviso}
        </p>
      )}

      {horarios === null ? (
        <div className={`${css.lista} mt-5`} aria-busy="true" aria-label="Carregando horários">
          {[0, 1, 2].map((i) => (
            <div key={i} className={css.esqueleto} />
          ))}
        </div>
      ) : dias.length === 0 ? (
        <p className={`${styles.msgQuiet} mt-4`}>
          Não há horário livre nos próximos 60 dias para esses serviços. Fale direto com a barbearia pelo
          WhatsApp.
        </p>
      ) : (
        <>
          <div className={`${css.dias} mt-4`} role="group" aria-label="Dia">
            {dias.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.chip} ${css.dia}`}
                data-on={d === dia ? "true" : undefined}
                aria-pressed={d === dia}
                onClick={() => setDiaEscolhido(d)}
              >
                {rotuloDia(d)}
              </button>
            ))}
            {temMais && (
              <button
                type="button"
                className={`${styles.btn} ${styles["btn--ghost"]} ${css.dia}`}
                disabled={carregando}
                onClick={onMaisDias}
              >
                {carregando ? "Buscando…" : "Ver mais dias"}
              </button>
            )}
          </div>
          {bloco("Manhã", manha)}
          {bloco("Tarde", tarde)}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/studiold/app/agendar/EtapaHorario.tsx
git commit -m "feat(studiold): etapa Data e hora do wizard /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Etapas Confirmação e Sucesso

**Files:**
- Create: `apps/studiold/app/agendar/EtapaConfirmacao.tsx`
- Create: `apps/studiold/app/agendar/EtapaSucesso.tsx`

**Interfaces:**
- Consumes: `Catalogo`, `Horario`, `ResumoAgendamento`, `OpcaoCatalogo` (Task 4); `rotuloDia` (Task 3); `fmtPreco`; classes `comanda`, `comandaDestaque`, `comandaLinha`, `comandaTotal`, `grupoTitulo` (Task 5).
- Produces:
  - `EtapaConfirmacao({ catalogo, servicoIds, horario, cortesiaId, estiloId, onCortesia, onEstilo, onConfirmar, pendente, erro }: { catalogo: Catalogo; servicoIds: string[]; horario: Horario; cortesiaId: string | null; estiloId: string | null; onCortesia: (id: string | null) => void; onEstilo: (id: string | null) => void; onConfirmar: () => void; pendente: boolean; erro: string | null })`
  - `EtapaSucesso({ resumo, onNovo }: { resumo: ResumoAgendamento; onNovo: () => void })`

- [ ] **Step 1: Create `app/agendar/EtapaConfirmacao.tsx`**

```tsx
"use client";

import { rotuloDia } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { Catalogo, Horario, OpcaoCatalogo } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Props = {
  catalogo: Catalogo;
  servicoIds: string[];
  horario: Horario;
  cortesiaId: string | null;
  estiloId: string | null;
  onCortesia: (id: string | null) => void;
  onEstilo: (id: string | null) => void;
  onConfirmar: () => void;
  pendente: boolean;
  erro: string | null;
};

function Escolha({
  titulo,
  opcoes,
  valor,
  onEscolher,
}: {
  titulo: string;
  opcoes: OpcaoCatalogo[];
  valor: string | null;
  onEscolher: (id: string | null) => void;
}) {
  if (opcoes.length === 0) return null;
  const todas: { id: string | null; nome: string }[] = [...opcoes, { id: null, nome: "Nenhuma" }];
  return (
    <section>
      <h2 className={css.grupoTitulo} id={`escolha-${titulo}`}>
        {titulo}
      </h2>
      <div className={styles.chips} role="radiogroup" aria-labelledby={`escolha-${titulo}`}>
        {todas.map((o) => (
          <button
            key={o.id ?? "nenhuma"}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            className={`${styles.chip} min-h-11`}
            data-on={valor === o.id ? "true" : undefined}
            onClick={() => onEscolher(o.id)}
          >
            {o.nome}
          </button>
        ))}
      </div>
    </section>
  );
}

export function EtapaConfirmacao(p: Props) {
  const servicos = p.catalogo.servicos.filter((s) => p.servicoIds.includes(s.id));
  const total = servicos.reduce((t, s) => t + s.preco, 0);
  const minutos = servicos.reduce((t, s) => t + s.duracaoMin, 0);

  return (
    <>
      <h1 className={`${styles.pageTitle} mb-4`}>Confere?</h1>
      <div className={css.comanda}>
        <p className={css.comandaDestaque}>
          {rotuloDia(p.horario.data)} às {p.horario.hora}
        </p>
        {servicos.map((s) => (
          <div key={s.id} className={css.comandaLinha}>
            <span>{s.nome}</span>
            <span className={styles.tnum}>{fmtPreco(s.preco)}</span>
          </div>
        ))}
        <div className={css.comandaTotal}>
          <span>Total · {minutos} min</span>
          <span>{fmtPreco(total)}</span>
        </div>
      </div>

      <Escolha titulo="Cortesia" opcoes={p.catalogo.cortesias} valor={p.cortesiaId} onEscolher={p.onCortesia} />
      <Escolha titulo="Estilo de música" opcoes={p.catalogo.estilos} valor={p.estiloId} onEscolher={p.onEstilo} />

      {p.erro && (
        <p role="alert" className={`${styles.msgQuiet} mt-4`} data-tom="erro">
          {p.erro}
        </p>
      )}
      <button
        type="button"
        className={`${styles.btn} ${styles["btn--primary"]} mt-6 w-full justify-center py-3`}
        disabled={p.pendente}
        onClick={p.onConfirmar}
      >
        {p.pendente ? "Confirmando…" : "Confirmar agendamento"}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Create `app/agendar/EtapaSucesso.tsx`**

```tsx
"use client";

import { rotuloDia } from "@/lib/agendar/formato";
import { fmtPreco } from "@/lib/agenda/time";
import type { ResumoAgendamento } from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

export function EtapaSucesso({ resumo, onNovo }: { resumo: ResumoAgendamento; onNovo: () => void }) {
  return (
    <>
      <h1 className={`${styles.pageTitle} mb-4`}>Agendado!</h1>
      <div className={css.comanda}>
        <p className={css.comandaDestaque}>
          {rotuloDia(resumo.data)} às {resumo.hora}
        </p>
        {resumo.servicos.map((nome, i) => (
          <div key={`${nome}-${i}`} className={css.comandaLinha}>
            <span>{nome}</span>
          </div>
        ))}
        <div className={css.comandaTotal}>
          <span>Total · {resumo.duracaoMin} min</span>
          <span>{fmtPreco(resumo.valorTotal)}</span>
        </div>
      </div>
      {resumo.emailMascarado && (
        <p className={`${styles.msgQuiet} mt-3`}>Enviamos a confirmação para {resumo.emailMascarado}.</p>
      )}
      <button type="button" className={`${styles.btn} mt-6 w-full justify-center py-3`} onClick={onNovo}>
        Fazer outro agendamento
      </button>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/app/agendar/EtapaConfirmacao.tsx apps/studiold/app/agendar/EtapaSucesso.tsx
git commit -m "feat(studiold): etapas Confirmação e Sucesso do wizard /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wizard e página

**Files:**
- Create: `apps/studiold/app/agendar/AgendarWizard.tsx`
- Modify: `apps/studiold/app/agendar/page.tsx` (substituir o conteúdo)

**Interfaces:**
- Consumes: tudo das Tasks 2-7; `IdentificacaoForm` (prop `onIdentificado` já existe); `proximoDia` (Task 3).
- Produces: `AgendarWizard()` (sem props).

- [ ] **Step 1: Create `app/agendar/AgendarWizard.tsx`**

```tsx
"use client";

// Wizard de /agendar: identificação (Spec A) → serviços → data e hora →
// confirmação → sucesso. Estado só em memória: reload recomeça na
// identificação (o cookie sozinho não pula a verificação, por desenho).
// Transições são disparadas por evento (sem useEffect de carga).

import { useState, useTransition } from "react";
import { proximoDia } from "@/lib/agendar/formato";
import { IdentificacaoForm } from "./IdentificacaoForm";
import { AgendarCabecalho } from "./AgendarCabecalho";
import { EtapaServicos } from "./EtapaServicos";
import { EtapaHorario } from "./EtapaHorario";
import { EtapaConfirmacao } from "./EtapaConfirmacao";
import { EtapaSucesso } from "./EtapaSucesso";
import {
  carregarCatalogo,
  buscarHorarios,
  confirmarAgendamento,
  type Catalogo,
  type FalhaAgendar,
  type Horario,
  type ResumoAgendamento,
} from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Passo = "identificacao" | "servicos" | "horario" | "confirmacao" | "sucesso";

const ROTULO: Record<Passo, string> = {
  identificacao: "Identificação",
  servicos: "Serviços · 1 de 3",
  horario: "Data e hora · 2 de 3",
  confirmacao: "Confirmação · 3 de 3",
  sucesso: "Agendado",
};

const FALHA_CONEXAO: FalhaAgendar = { ok: false, error: "Falha de conexão. Tente de novo." };

export function AgendarWizard() {
  const [passo, setPasso] = useState<Passo>("identificacao");
  const [nome, setNome] = useState("");
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [horarios, setHorarios] = useState<Horario[] | null>(null);
  const [temMais, setTemMais] = useState(true);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(null);
  const [estiloId, setEstiloId] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoAgendamento | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function recomecar(mensagem: string | null) {
    setPasso("identificacao");
    setNome("");
    setCatalogo(null);
    setSelecionados([]);
    setHorarios(null);
    setTemMais(true);
    setHorario(null);
    setCortesiaId(null);
    setEstiloId(null);
    setResumo(null);
    setErro(null);
    setAviso(mensagem);
  }

  // true = falha tratada (sessão expirada → recomeça)
  function tratarSessao(r: FalhaAgendar): boolean {
    if (!r.sessaoExpirada) return false;
    recomecar(r.error);
    return true;
  }

  // Vai pra Serviços e (re)carrega o catálogo. Também é o caminho de volta
  // quando a busca de horários falha (serviço desativado no meio do fluxo).
  function abrirServicos(mensagem: string | null) {
    setAviso(mensagem);
    setCatalogo(null);
    setSelecionados([]);
    setPasso("servicos");
    iniciar(async () => {
      const r = await carregarCatalogo().catch(() => FALHA_CONEXAO);
      if (!r.ok) {
        if (!tratarSessao(r)) setAviso(r.error);
        return;
      }
      setCatalogo(r.catalogo);
      setCortesiaId(r.catalogo.cortesiaFavoritaId);
      setEstiloId(r.catalogo.estiloFavoritoId);
    });
  }

  function identificado(dados: { nome: string }) {
    setNome(dados.nome);
    abrirServicos(null);
  }

  function alternar(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function carregarHorarios(mensagem: string | null) {
    setAviso(mensagem);
    setHorarios(null);
    setTemMais(true);
    setPasso("horario");
    iniciar(async () => {
      const r = await buscarHorarios(selecionados).catch(() => FALHA_CONEXAO);
      if (!r.ok) {
        if (!tratarSessao(r)) abrirServicos(r.error);
        return;
      }
      setHorarios(r.horarios);
      setTemMais(r.horarios.length > 0);
    });
  }

  function maisDias() {
    const ultimo = horarios?.at(-1)?.data;
    if (!ultimo) return;
    iniciar(async () => {
      const r = await buscarHorarios(selecionados, proximoDia(ultimo)).catch(() => FALHA_CONEXAO);
      if (!r.ok) {
        if (!tratarSessao(r)) setAviso(r.error);
        return;
      }
      setHorarios((atual) => [...(atual ?? []), ...r.horarios]);
      setTemMais(r.horarios.length > 0);
    });
  }

  function escolherHorario(h: Horario) {
    setHorario(h);
    setErro(null);
    setPasso("confirmacao");
  }

  function confirmar() {
    if (!horario) return;
    setErro(null);
    iniciar(async () => {
      const r = await confirmarAgendamento({
        servicoIds: selecionados,
        inicio: horario.inicio,
        cortesiaId,
        estiloId,
      }).catch(() => FALHA_CONEXAO);
      if (r.ok) {
        setResumo(r.resumo);
        setPasso("sucesso");
        return;
      }
      if (tratarSessao(r)) return;
      if (r.motivo === "horario") return carregarHorarios(r.error);
      if (r.motivo === "cortesia") setCortesiaId(null);
      if (r.motivo === "estilo") setEstiloId(null);
      setErro(r.error);
    });
  }

  const voltar =
    passo === "horario"
      ? () => setPasso("servicos")
      : passo === "confirmacao"
        ? () => setPasso("horario")
        : undefined;

  return (
    <>
      <AgendarCabecalho etapa={ROTULO[passo]} onVoltar={pendente ? undefined : voltar} />
      <main className={css.corpo}>
        {passo === "identificacao" && (
          <>
            <h1 className={`${styles.pageTitle} mb-1`}>Agendar horário</h1>
            <p className={`${styles.msgQuiet} mb-6`}>Confirme seu telefone pra começar.</p>
            {aviso && (
              <p role="alert" className={`${styles.msgQuiet} mb-4`} data-tom="erro">
                {aviso}
              </p>
            )}
            <IdentificacaoForm onIdentificado={identificado} />
          </>
        )}
        {passo === "servicos" && (
          <>
            {aviso && (
              <p role="alert" className={`${styles.msgQuiet} mb-4`} data-tom="erro">
                {aviso}
              </p>
            )}
            <EtapaServicos
              nome={nome}
              catalogo={catalogo}
              selecionados={selecionados}
              onAlternar={alternar}
              onContinuar={() => carregarHorarios(null)}
              pendente={pendente}
            />
          </>
        )}
        {passo === "horario" && (
          <EtapaHorario
            horarios={horarios}
            carregando={pendente}
            temMais={temMais}
            aviso={aviso}
            onEscolher={escolherHorario}
            onMaisDias={maisDias}
          />
        )}
        {passo === "confirmacao" && catalogo && horario && (
          <EtapaConfirmacao
            catalogo={catalogo}
            servicoIds={selecionados}
            horario={horario}
            cortesiaId={cortesiaId}
            estiloId={estiloId}
            onCortesia={setCortesiaId}
            onEstilo={setEstiloId}
            onConfirmar={confirmar}
            pendente={pendente}
            erro={erro}
          />
        )}
        {passo === "sucesso" && resumo && <EtapaSucesso resumo={resumo} onNovo={() => recomecar(null)} />}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Replace `app/agendar/page.tsx`**

```tsx
// Rota pública /agendar. Sem requireUser() — ver comentário no topo de
// ./actions.ts (intencional, não esquecido).

import { AgendarWizard } from "./AgendarWizard";
import styles from "@/app/agenda/agenda.module.css";

export const metadata = { title: "Agendar — StudiOLD" };

export default function AgendarPage() {
  return (
    <div className={styles.shell}>
      <AgendarWizard />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter studiold typecheck && pnpm --filter studiold lint && pnpm --filter studiold check`
Expected: sem erros.
Run (raiz): `pnpm build`
Expected: build verde; `/agendar` listada entre as rotas.

- [ ] **Step 4: Commit**

```bash
git add apps/studiold/app/agendar/AgendarWizard.tsx apps/studiold/app/agendar/page.tsx
git commit -m "feat(studiold): wizard de agendamento self-service em /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Gate final, integração manual e memória

Depende dos pré-requisitos manuais (Global Constraints). Se a migration não estiver aplicada ou faltar `AGENDAR_COOKIE_SECRET`/`RESEND_API_KEY`, **parar e reportar** — não contornar.

**Files:**
- Modify: `MEMORY.md` (raiz) — seção "Onde parei"

- [ ] **Step 1: Confirmar pré-requisitos no banco (read-only)**

Via MCP Supabase `execute_sql` no projeto `nnybwmuhkaobsdtzospc`:

```sql
select to_regclass('barbearia_001.codigos_verificacao') is not null as tabela,
       pg_get_constraintdef((select oid from pg_constraint where conname = 'agendamentos_origem_check')) like '%site%' as constraint_ok,
       position('''site''' in pg_get_functiondef('barbearia_001.fn_criar_agendamento_v2'::regproc)) > 0 as funcao_ok;
```

Expected: `true, true, true`.

- [ ] **Step 2: Gate completo**

Run (raiz): `pnpm typecheck && pnpm lint && pnpm build && pnpm --filter studiold check`
Expected: tudo verde, `agenda.check: OK`.

- [ ] **Step 3: Integração manual (com o usuário, e-mail = dono da conta Resend)**

Com `pnpm --filter studiold dev`, em `http://localhost:3000/agendar` (375px se houver browser):
1. Telefone de cliente de teste com o e-mail do dono da conta Resend → código chega → "Sim, sou eu" → lista de serviços aparece com favoritos de cortesia/estilo pré-marcados na confirmação.
2. Escolher 1 serviço → horário → confirmar → tela "Agendado!" com linha "Enviamos a confirmação para …"; e-mail recebido.
3. Conferir no banco:

```sql
select a.id, a.origem, a.status, s.data_hora
from barbearia_001.agendamentos a join barbearia_001.slots s on s.id = a.slot_id
where a.origem = 'site' order by a.criado_em desc limit 1;
```

Expected: 1 linha, `origem = 'site'`, `status = 'agendado'`.
4. Apagar o agendamento de teste: pedir ao usuário para cancelar pelo painel `/agenda` (o painel já faz isso via Server Action) — não rodar DELETE via ferramenta.
5. Sessão: no DevTools, apagar o cookie `agendar_sessao` na etapa Serviços e clicar "Escolher horário" → volta à identificação com "Sua sessão expirou…".

Sem browser na máquina: registrar no MEMORY.md que a aceitação em browser ficou pendente (padrão do projeto).

- [ ] **Step 4: Atualizar `MEMORY.md`** — no topo de "## Onde parei", acrescentar um parágrafo no formato dos existentes: o que foi entregue (wizard `/agendar` Spec B, commits), cookie `agendar_sessao` (HMAC, 30 min, path `/agendar`, `AGENDAR_COOKIE_SECRET`), origem `'site'` (constraint + `fn_criar_agendamento_v2` recriada), pendências (aceitação em browser a 375px; domínio próprio no Resend; e-mail só chega ao dono da conta Resend até lá).

- [ ] **Step 5: Commit**

```bash
git add MEMORY.md
git commit -m "docs: memória do agendamento self-service /agendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
