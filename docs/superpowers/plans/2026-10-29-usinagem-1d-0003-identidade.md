# Usinagem 1D (migration 0003): identidade com Better Auth, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Substitui** `2026-10-24-usinagem-1d-identidade.md`, escrito antes da 1B. Aquele plano fica como histórico. Os blocos de código dele não valem mais onde divergem deste.

**Goal:** login real com e-mail e senha, sem cadastro público. A sessão entrega ao wrapper as permissões concedidas do banco. Ações sensíveis exigem reautenticação de 10 minutos. O último Admin fica protegido por trava de linha, e o seletor de dev fica provadamente fora do build de produção.

**Architecture:**
- **Fábrica pura** `criarAuth({ banco, plugins })` em `lib/servidor/auth-config.ts`. Não usa `server-only` e é testada no Vitest contra o Postgres local.
- **Instância lazy do app** em `lib/servidor/auth.ts`.
- **Handler único** `app/api/auth/[...all]/route.ts`. Responde só a uma allowlist de caminhos do Better Auth; o resto dá 404.
- **Sessão autoritativa** em `requirePermissao`, que lê o usuário ativo e as concedidas a cada request (sem cache de cookie).
- **`proxy.ts`** é só barreira otimista.
- **Regras novas puras** em `lib/dominio/seguranca/login.ts`.

**Tech Stack:**
- better-auth 1.6.33 (pino exato);
- Next 16.3.4 (`proxy.ts`, `pageExtensions`);
- Drizzle 0.45.x com PostgreSQL 16 local;
- Zod 4.6.5;
- Vitest 5.0.5.

**Spec:** `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md`. Seções usadas: §4 (convenções), §4.1, §6.8 (roles), §7.4, §8 ("Autenticação" e "Seletor de perfil de dev"), §9.2 e §10 ("Identidade").

**Base:** `pr/1b` (`79c9aa1`). Ledger da execução: `.superpowers/sdd/2026-10-29-usinagem-1d-identidade/progress.md`.

## Desenho e decisões (aprovar antes de executar)

### D1. Reautenticação recente (10 min)
**Alternativas:**
- **(a) Reentrar.** A ação sensível recusa com `ErroReautenticacao`. A tela manda para `/entrar?reautenticar=1`, que encerra a sessão atual e faz login de novo. A sessão nova tem `createdAt` atual.
- **(b) Confirmar senha.** Uma Server Action chama `auth.api.verifyPassword` e grava `sessoes.reautenticado_em`.

**Recomendada: (a).**
- `auth.api.verifyPassword`, chamado no servidor, não passa pelo rate limit do Better Auth (que só vale no handler HTTP). A opção (b) criaria uma porta de força bruta de senha fora do limite e exigiria coluna extra.
- A opção (a) usa o caminho já limitado e auditado (`/sign-in/email`).
- Sair antes de entrar revoga a sessão velha, então um token roubado da sessão antiga morre junto.
- O frescor é `agora - session.createdAt <= REAUTENTICACAO_MAX_MS`, pela função `reautenticacaoRecente` já existente.

### D2. Superfície do Better Auth
**Alternativas:**
- **(a)** Usar `disabledPaths` para listar o que desligar.
- **(b)** Allowlist no handler.

**Recomendada: (b).** Deny by default, coerente com o wrapper. Só `POST /sign-in/email`, `POST /sign-out` e `GET /get-session` passam. O resto responde 404: `update-user` (o usuário poderia trocar o próprio nome sem auditoria nem `versao`), `change-email`, `change-password`, `delete-user`, `list-sessions`, reset de senha e `sign-up`. Uma versão nova do Better Auth que crie endpoint também cai no 404.

### D3. Expiração de sessão
**Recomendada:**
- `expiresIn` de 12 h com `disableSessionRefresh: true`. É uma expiração absoluta: novo login a cada jornada, e uma sessão ativa não se estende para sempre.
- `cookieCache` desligado (é o padrão). A desativação de usuário vale no request seguinte.
- **Alternativa:** janela deslizante (`updateAge` de 1 h). Rejeitada, porque um token roubado e usado continuamente nunca expira.

### D4. Rate limit de login
**Recomendada:**
- Rate limit do Better Auth por IP, em memória: `/sign-in/email` com 5 tentativas por 60 s, demais caminhos com 30 por 60 s.
- O IP vem só do header que o proxy reverso confiável define (`advanced.ipAddress.ipAddressHeaders`, configurável por env). Sem o env, o Better Auth não confia em `X-Forwarded-For`.
- Somado a isso, um **limite por e-mail** calculado sobre `eventos_auditoria`: 10 `login_falha` em 15 min recusam com a mesma mensagem genérica, sem nova tabela.

**Custo e trade-off:**
- Memória zera no restart e não é compartilhada entre instâncias. Hoje há uma instância só; trocar para `storage: "database"` quando houver mais de uma (fica registrado como `ponytail:`).
- O limite por e-mail permite que um atacante bloqueie o login do Admin por 15 min (DoS dirigido). A alternativa é só por IP, que não segura ataque distribuído.

**Decisão do responsável humano:** manter os dois limites (recomendação) ou só por IP.

### D5. Convenções das tabelas novas (§4)
Tabelas do Better Auth são escritas pela biblioteca, não pela aplicação. São exceção documentada, no mesmo espírito do catálogo.

| Tabela | criado_em | atualizado_em | criado_por | versao | FK usuario_id |
|---|---|---|---|---|---|
| `sessoes` | sim | sim | **não** (a sessão nasce do próprio login; `usuario_id` já identifica) | **não** (o Better Auth não usa lock otimista) | NO ACTION |
| `contas` | sim | sim | **não** (a autoria da criação fica em `eventos_auditoria`, `usuario_criado`) | **não** | NO ACTION |
| `verificacoes` | sim | sim | **não** | **não** | (sem FK) |

- **FK.** O padrão do Better Auth é `ON DELETE CASCADE`. Aqui fica NO ACTION, porque usuário nunca é apagado (§4: nada é apagado em registro de negócio; usuário é desativado). Tentar apagar falha alto.
- **`usuarios.criado_por`.** Continua nullable: o primeiro Admin, criado pelo script, não tem criador. Usuários criados depois recebem o Admin criador.
- **`contratos.ts`.** O tipo `Registro` exige `criadoPor: Id` não nulo e `Usuario` não usa `Registro`. Por isso `Usuario` ganha `criadoPor: Id | null` e `criadoEm: string` explícitos. `Sessao`, `Conta` e `Verificacao` não entram em `contratos.ts`: não são entidades do domínio.
- **Colunas novas em `usuarios`.** Entram `email_verificado` (exigida pelo Better Auth; fica `false`, porque não há verificação de e-mail) e `imagem` (nullable, exigida pelo modelo do Better Auth). A Task 3 confere no `.d.ts` instalado se `image` é obrigatória no schema. Se não for, `imagem` não é criada.

### D6. `concedidas` obrigatório
- **Alternativas:**
  - **(a)** Tornar o parâmetro posicional obrigatório (`perfil, ..., concedidas: readonly Permissao[]`).
  - **(b)** Receber `{ perfil, concedidas }` como objeto.
- **Recomendada: (a).** É o pedido literal e a menor mudança, e mantém a decisão da 1B ("`concedidas` como último parâmetro"). Os testes passam `MATRIZ_PADRAO[perfil]` de forma explícita.
- **Escopo:** sigilo inteiro (`podeLerContexto`, `podeVerCampo`, `serializar*`, `validarConsulta`, `validarAgregado`, `exportarLinhas`) e as 5 regras de processo em `regras.ts`, que são o mesmo defeito.
- **`pode()`** continua com `concedidas?` opcional, porque é a primitiva. A matriz padrão é a semântica documentada dela, e o catálogo a testa assim.
- **Decisão do responsável humano:** incluir ou não as regras de processo. A recomendação é incluir.

### D7. O que entra e o que fica para o PR 2 (restrição 5)
- **Entram no 1D:**
  - o `safeParse` dentro do `try` (restrição 3);
  - `concedidas` obrigatório (restrição 2);
  - a correção do `estrutura.test.ts` (`regclass` e `fks.find`), porque a Task 3 mexe nesse teste.
- **Ficam no PR 2, sem mudança:**
  - ordem estável na query de movimentos de estoque: a tabela e a query só existem no PR 5;
  - identificador do registro no log de `ErroDominio`: não há carregamento de entidade de domínio no 1D;
  - os demais itens da §9.2.

### D8. Perguntas 15 a 18 da §12
Nenhuma bloqueia nem depende do 1D. Todas são de domínio comercial ou de estoque:
- 15 trata de aditivo e revisão;
- 16 trata de quarentena;
- 17 trata de excedente no status;
- 18 trata de item zerado.

Elas tocam PR 2 (15, 17, 18) e PR 5 (16).

## Ajustes aprovados pelo responsável humano (2026-10-29)

Estes ajustes valem sobre o desenho acima e já estão refletidos nas tasks.

1. **D4 aprovada com condições: limite por IP e por e-mail.**
   - O limite por e-mail conta falhas **por usuário existente**. São linhas `login_falha` com `entidade_id` igual ao usuário, depois do último `login_desbloqueio` desse usuário.
   - E-mail inexistente **não cria linha de auditoria por tentativa**: vale só o limite por IP.
   - Na auditoria nunca vai o texto bruto digitado. O e-mail é normalizado e só é gravado se tiver formato válido; caso contrário, o campo fica `null`.
   - O script de operação `usuario:desbloquear <email>` limpa o bloqueio gravando `login_desbloqueio`. A auditoria é append-only e nada é apagado.
2. **D6 aprovada com inclusão.** `concedidas` passa a ser obrigatório também nas 5 regras de processo; `pode()` continua opcional. Um teste falha se `pode(` for chamado fora de uma allowlist de arquivos.
3. **Cookie de dev falha fechado.** Com `NODE_ENV === "production"`, o seletor e o cookie de dev ficam desligados, seja qual for o valor de qualquer outra variável. Há teste para isso. A remoção do seletor de dev entra no checklist de entrada em produção (spec §9.3).
4. **Tempo igual.** O hash de senha é calculado antes de checar usuário inexistente, inativo ou bloqueado. Um teste exige que as quatro respostas sejam idênticas (status, `code`, `message` e corpo) e que haja exatamente uma verificação de hash em cada caso:
   - senha errada;
   - e-mail inexistente;
   - usuário inativo;
   - e-mail bloqueado.
5. **Política de senha:** mínimo 12 e máximo 128 caracteres, com teste de borda (11, 12, 128 e 129).
6. **Sessões revogadas.** Trocar a senha ou o perfil, ou desativar o usuário, apaga as sessões do alvo na mesma transação.
   - A troca de senha entra no 1D só como redefinição pelo script de operação (`usuario:redefinir-senha`), solução provisória de recuperação.
   - A troca de senha pelo próprio usuário e a recuperação self-service ficam como pendência na spec §9.2.
7. **Checklist de produção (spec §9.3):** o rate limit em memória só vale para uma instância. O header de IP confiável é definido por variável (`AUTH_IP_HEADER`) e documentado para o proxy reverso.
8. **Fora do 1D.** A tela de gestão de usuários não entra aqui. A 1C precisa incluí-la antes de qualquer cliente real (spec §9.3).

## Riscos de segurança e como o plano os trata

| Risco | Tratamento | Onde |
|---|---|---|
| **Fixação de sessão** | O Better Auth cria um token novo a cada `sign-in`; um token anterior enviado pelo atacante nunca vira sessão autenticada. O cookie de dev é apagado no login real e ignorado fora do gate. A reautenticação sai antes de entrar. Teste: token antes e depois do login diferem, e o token antigo não autentica. | Tasks 5, 9 e 11 |
| **Cookies** | `httpOnly`, `SameSite=Lax` e `Secure` sempre que `BETTER_AUTH_URL` for `https` (`useSecureCookies`, com prefixo `__Secure-`). `cookiePrefix: "usinagem"`. Sem cookie entre subdomínios. Teste: atributos do `Set-Cookie`. | Task 5 |
| **Expiração** | Absoluta de 12 h, sem refresh (D3). Desativar o usuário apaga as sessões dele na mesma transação, e `requirePermissao` relê `ativo` a cada request. | Tasks 5, 9 e 10 |
| **Rate limit** | Por IP no handler (D4), com IP de header confiável; mais o limite por e-mail sobre a auditoria. Nenhuma Server Action verifica senha (D1), então nada contorna o limite. | Tasks 5, 6 e 8 |
| **Enumeração de usuário** | Mesma mensagem e mesmo status HTTP para e-mail inexistente, senha errada, usuário inativo e limite por e-mail. A tela mostra só "E-mail ou senha incorretos.". **Timing:** a Task 5 lê no fonte instalado se o `sign-in` faz hash fictício quando o usuário não existe. Se não fizer, o `hooks.before` gasta um hash equivalente. Tempo não vira teste (instável); vira leitura de fonte registrada no relatório. | Tasks 5 e 6 |
| **Superfície de endpoints** | Allowlist no handler (D2). | Task 8 |
| **CSRF e origem** | Checagem de origem do Better Auth ligada, com `trustedOrigins` igual a `BETTER_AUTH_URL`. As Server Actions do Next já conferem a origem. Nada é desligado. | Task 5 |
| **Segredo** | `BETTER_AUTH_SECRET` com 32 ou mais caracteres; sem ele, `auth()` lança (falha fechado). No CI, só valor descartável. | Tasks 5 e 12 |
| **Log e auditoria** | Senha nunca é gravada. E-mail normalizado. User agent cortado em 256 caracteres. IP só do header confiável. Falha de auth no wrapper segue a regra de log sem valor da 1B. | Tasks 4 e 5 |
| **Último Admin** | `SELECT ... FOR UPDATE` dos Admins ativos e do alvo na transação, com `validarAlteracaoUsuario` e erro genérico. Teste concorrente: duas desativações cruzadas dos dois últimos Admins resultam em exatamente uma recusa. | Task 10 |
| **Seletor de dev** | `pageExtensions` só com o gate ligado; script prova 404 e ausência do nome do cookie no build. | Task 12 |

## Global Constraints

- Better Auth `1.6.33` exato, sem `^` nem `~`. Aviso de peer do Vitest aceito, sem override.
- Zod `4.6.5` (já instalado).
- Roles: `usinagem_migracao` faz DDL e é usada só pelo `drizzle-kit migrate`, rodado pelo humano. `usinagem_app` faz DML e é usada pelo app, pelo seed e pelo Better Auth. Os privilégios padrão já concedem DML nas tabelas novas.
- O agente nunca gera, edita nem aplica migration, e nunca roda `pnpm db:*`, `docker`, `drizzle-kit` nem `psql`. Ao chegar na migration, para e avisa.
- Nenhuma mudança em `.github/workflows/`, `.env*`, `.claude/**` nem `.gitignore` sem parar e avisar. `package.json` e `next.config.ts` só nos passos listados aqui; a aprovação deste plano é a permissão.
- Mensagens em PT-BR, sem travessão, sem valor de campo nem detalhe de erro de biblioteca.
- Dados fictícios marcados. Nenhum banco real.
- Cada task: RED literal antes do código, mutação de prova, comandos exatos com exit code, contagem de testes antes e depois, e um commit novo com os trailers da sessão. Sem push.
- Comandos sempre com `cd` explícito na mesma linha: `cd /home/ewerton/projects/core-platform-usinagem/apps/usinagem && <cmd>`. Lint sem filtro: `rtk proxy pnpm lint; echo "lint_exit=$?"`.
- A tela `/entrar` é funcional e sem estilo próprio. O visual vem do `/impeccable shape` da 1C.

---

### Task 1: `safeParse` dentro do `try` no wrapper

**Files:**
- Modify: `apps/usinagem/lib/servidor/acao.ts` (função `executar`)
- Test: `apps/usinagem/lib/servidor/acao.test.ts`

**Interfaces:** nenhuma mudança de assinatura.

- [ ] **Step 1: Teste que falha**

Em `acao.test.ts`, no bloco de `acaoPublica`:

```ts
it("exceção dentro de transform do esquema vira resposta genérica, logada sem valor", async () => {
  const esquema = z.string().transform(() => {
    throw new Error('invalid input syntax for type uuid: "valor-secreto"');
  });
  const r = await acaoPublica(esquema, async () => 1)("x");
  expect(r).toEqual({ ok: false, erro: "Não foi possível concluir a operação." });
  expect(JSON.stringify(console.error.mock.calls)).not.toContain("valor-secreto");
});
```

Mais um teste igual para `acao(...)` com sessão permitida.

- [ ] **Step 2: RED literal**

Run: `cd /home/ewerton/projects/core-platform-usinagem/apps/usinagem && pnpm exec vitest run lib/servidor/acao.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
Expected: os 2 testes novos falham, porque a exceção escapa de `executar`.

- [ ] **Step 3: Implementar**

```ts
async function executar<E, S>(esquema: ZodType<E>, entrada: unknown, fn: (e: E) => Promise<S>): Promise<RespostaAcao<S>> {
  try {
    // Dentro do try: refine/transform podem lançar com valor da entrada na mensagem.
    const valida = esquema.safeParse(entrada);
    if (!valida.success) return { ok: false, erro: "Dados inválidos." };
    return { ok: true, dados: await fn(valida.data) };
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro(erro);
    return { ok: false, erro: ERRO_GENERICO };
  }
}
```

- [ ] **Step 4: GREEN e mutação**

- GREEN: o mesmo comando do Step 2, agora passando.
- Mutação: tirar o `safeParse` do `try` faz os 2 testes falharem. Colar a saída literal e restaurar.

- [ ] **Step 5: Gates e commit**

Rodar suíte, typecheck, lint sem filtro e build. Commit: `fix(usinagem): safeParse do wrapper dentro do try`.

**Critérios de aceite:**
- exceção em `refine` ou `transform` vira `ERRO_GENERICO`;
- o log segue sem valor;
- nenhum teste existente muda.

### Task 2: `concedidas` obrigatório no sigilo e nas regras de processo

**Files:**
- Modify: `apps/usinagem/lib/dominio/sigilo/campos.ts`, `apps/usinagem/lib/dominio/sigilo/serializar.ts`, `apps/usinagem/lib/dominio/processo/regras.ts`
- Modify (testes): `serializar.test.ts`, `campos.test.ts` se existir, `regras.test.ts`, `acao.test.ts`
- Test: `apps/usinagem/lib/dominio/sigilo/concedidas-obrigatorio.test.ts`

**Interfaces:**
- Produces:
  - `podeLerContexto(perfil, contexto, concedidas: readonly Permissao[])`;
  - `podeVerCampo(perfil, contexto, campo, concedidas)`;
  - `serializar(registro, perfil, contexto, concedidas)`;
  - `serializarItemRevisao(item, perfil, concedidas)`, `serializarTituloPagar(...)` e `serializarTituloReceber(...)`;
  - `serializarEventoAuditoria(ev, perfil, concedidas)`;
  - `validarConsulta(perfil, contexto, q, concedidas)`;
  - `validarAgregado(...)` e `exportarLinhas(...)`;
  - as 5 regras de `regras.ts`.

  Todas passam a ter `concedidas` sem `?` e sem padrão. `pode()` continua com `concedidas?`.

- [ ] **Step 1: Teste de tipo que falha**

`concedidas-obrigatorio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MATRIZ_PADRAO } from "../permissoes/catalogo";
import { serializarItemRevisao, validarConsulta } from "./serializar";
import { validarCancelamento } from "../processo/regras";

const item = { id: "i1", revisaoId: "r1", descricao: "x", quantidade: 1, precoUnitarioCentavos: 100, custoEstimadoCentavos: 60 } as never;

describe("concedidas é obrigatório (sem matriz padrão implícita)", () => {
  it("chamadas sem concedidas não compilam", () => {
    // @ts-expect-error concedidas é obrigatório
    serializarItemRevisao(item, "compras_producao");
    // @ts-expect-error concedidas é obrigatório
    validarConsulta("financeiro", "item_revisao", { campos: [] });
    // @ts-expect-error concedidas é obrigatório
    validarCancelamento("comercial", { pedidos: 0, compras: 0, ops: 0 }, "motivo");
    expect(serializarItemRevisao(item, "compras_producao", MATRIZ_PADRAO.compras_producao)).not.toBeNull();
  });
});
```

Ajuste os argumentos reais às assinaturas de `regras.ts` e `serializar.ts` lidas no código. O que importa é haver um `@ts-expect-error` por função pública alterada.

- [ ] **Step 2: RED literal**

Run: `cd /home/ewerton/projects/core-platform-usinagem/apps/usinagem && pnpm typecheck; echo "typecheck_exit=$?"`
Expected: `error TS2578: Unused '@ts-expect-error' directive.`, uma linha por diretiva, e `typecheck_exit=2`.

- [ ] **Step 3: Implementar**

- Trocar `concedidas?: readonly Permissao[]` por `concedidas: readonly Permissao[]` nas funções listadas, mantendo a posição.
- Repassar `concedidas` a todo `pode()` interno.
- Rodar `pnpm typecheck`. Cada chamada existente em teste que quebrar passa a usar `MATRIZ_PADRAO[perfil]` explícito, o mesmo valor que o padrão implícito usava.
- Registrar no relatório, em "Alteração de teste", cada arquivo de teste tocado, com o motivo "assinatura obrigatória; mesmo valor que o padrão implícito". Nenhuma expectativa muda.

- [ ] **Step 4: GREEN e mutação**

- GREEN: `typecheck_exit=0` e suíte inteira passando com a mesma contagem de expectativas.
- Mutação: voltar `?` em `serializarItemRevisao` faz o typecheck falhar com TS2578. Colar a saída e restaurar.

- [ ] **Step 4b: Uso de `pode(` restrito (ajuste 2)**

Teste em `scripts/cobertura-acoes.test.ts`, com uma função exportada `arquivosQueChamamPode()` no scanner. Ela percorre a AST e lista os arquivos (fora de testes) com chamada a `pode(` ou a um alias importado de `catalogo`.

O teste exige igualdade com `PODE_PERMITIDO`, a lista de arquivos que hoje chamam `pode` legitimamente, levantada no código e listada no relatório. Cada entrada leva um comentário com o motivo: catálogo, acesso, sigilo e regras de processo.

- RED: rodar com a lista vazia, colar a falha literal e então preencher.
- Mutação: uma chamada nova de `pode(` num arquivo de teste temporário fora da lista (por exemplo em `lib/dominio/x-temp.ts`) faz o teste falhar. Apagar o arquivo depois.

- [ ] **Step 5: Commit**

`refactor(usinagem): concedidas obrigatorio no sigilo e nas regras de processo`.

**Critérios de aceite:**
- nenhuma função de sigilo nem regra de processo aceita omitir `concedidas`;
- `pode()` inalterado;
- o teste de revogação da 1B (`acao.test.ts`, Compras sem `custo.ver`) continua passando;
- zero expectativa alterada.

### Task 3: Dependência, schema de identidade e contrato `Usuario` (PARA na migration)

**Files:**
- Modify: `apps/usinagem/package.json` e `pnpm-lock.yaml`, via `pnpm add`
- Modify: `apps/usinagem/lib/servidor/db/schema.ts`
- Modify: `apps/usinagem/lib/dominio/contratos.ts`
- Modify: `apps/usinagem/lib/servidor/db/estrutura.test.ts`

**Interfaces:**
- Produces: tabelas `sessoes`, `contas` e `verificacoes`; colunas `usuarios.emailVerificado` e `usuarios.imagem`; `Usuario` com `criadoPor: Id | null` e `criadoEm: string`.

- [ ] **Step 1: Instalar e registrar**

Run:
```bash
cd /home/ewerton/projects/core-platform-usinagem && pnpm --filter usinagem add --save-exact better-auth@1.6.33
npm view better-auth time dist-tags --json
```

- Conferir no `package.json`: `"better-auth": "1.6.33"`.
- Colar no relatório o aviso de peer do Vitest e as datas da 1.6.33 e da `latest`. Se a 1.6.33 tiver menos de 14 dias, ou se surgir outro motivo para trocar de versão, PARAR e perguntar.
- Ler `node_modules/better-auth/dist/**/*.d.ts` para os campos do modelo `user` (`image` obrigatória ou não) e para os nomes das opções `advanced.ipAddress`, `rateLimit` e `session`. Registrar no relatório.

- [ ] **Step 2: Teste de estrutura que falha**

Em `estrutura.test.ts`:
- acrescentar `sessoes`, `contas` e `verificacoes` à lista com `criado_em` e `atualizado_em`;
- criar `TABELAS_BETTER_AUTH = ["sessoes", "contas", "verificacoes"]`, que exige ausência de `criado_por` e de `versao`;
- criar um teste novo que exige FK de `sessoes.usuario_id` e `contas.usuario_id` com `confdeltype = 'a'` (NO ACTION).

Aplicar também as duas correções pendentes da §9.2:
- `conrelid = any($1::regclass[])` no lugar da comparação textual;
- `filter` mais `every` no lugar de `fks.find`.

- [ ] **Step 3: RED literal**

Run: `cd /home/ewerton/projects/core-platform-usinagem/apps/usinagem && pnpm exec vitest run lib/servidor/db/estrutura.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
Expected: os testes novos falham porque as tabelas não existem no banco local.

- [ ] **Step 4: Schema**

Em `schema.ts`, dentro de `usuarios`, depois de `email`:

```ts
    // Exigida pelo Better Auth; fica false: não há verificação de e-mail (sem cadastro público).
    emailVerificado: boolean("email_verificado").notNull().default(false),
    imagem: text("imagem"),
```

No fim do arquivo (`index` já está importado; não duplicar):

```ts
// ── Identidade (Better Auth 1.6.33, nomes mapeados em auth-config.ts) ──
// Exceção da §4: tabelas escritas pela biblioteca, sem criado_por nem versao (spec §4, D5 do plano 0003).
// FK sem CASCADE: usuário nunca é apagado, só desativado.
export const sessoes = pgTable(
  "sessoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip"),
    userAgent: text("user_agent"),
    userId: uuid("usuario_id").notNull().references(() => usuarios.id),
  },
  (t) => [index("sessoes_usuario_idx").on(t.userId)],
);

export const contas = pgTable(
  "contas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("conta_id").notNull(),
    providerId: text("provedor_id").notNull(),
    userId: uuid("usuario_id").notNull().references(() => usuarios.id),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expira_em", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expira_em", { withTimezone: true }),
    scope: text("escopo"),
    // Hash da senha, nunca a senha. Nunca sai em serialização nem em log.
    password: text("senha_hash"),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contas_usuario_idx").on(t.userId), unique("contas_provedor_conta_unique").on(t.providerId, t.accountId)],
);

export const verificacoes = pgTable(
  "verificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identificador").notNull(),
    value: text("valor").notNull(),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verificacoes_identificador_idx").on(t.identifier)],
);
```

Se o Step 1 mostrar que `image` não é obrigatória, remover `imagem` e registrar.

Em `contratos.ts`:

```ts
// criadoPor nulo só para o primeiro Admin (spec §4); por isso Usuario não usa Registro.
export type Usuario = Versionado & {
  id: Id; nome: string; email: string; perfil: Perfil; ativo: boolean; ficticio: boolean;
  criadoEm: string; criadoPor: Id | null;
};
```

Run: typecheck e lint, com exit 0.

- [ ] **Step 5: Commit e PARADA**

Commit: `feat(usinagem): schema de identidade do Better Auth 1.6.33 e contrato Usuario`.

**O agente PARA aqui** e pede ao humano:

```bash
cd apps/usinagem
pnpm db:generate --name identidade   # gera drizzle/0003_identidade.sql
pnpm db:migrate
git add drizzle && git commit -m "feat(usinagem): migration 0003 de identidade"
```

E acrescentar ao `.env.local`, à mão:

```
BETTER_AUTH_SECRET=<saída de: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
```

Depois disso, o mesmo comando do Step 3 deve passar (GREEN), e o controller cola a saída no relatório.

**Critérios de aceite:**
- pino exato confirmado;
- `0003_identidade.sql` revisado pelo humano antes de aplicar, sem `CASCADE` e sem `criado_por` ou `versao` nas 3 tabelas;
- `estrutura.test.ts` verde depois da migration;
- contrato `Usuario` atualizado.

### Task 4: Regras puras de login

**Files:**
- Create: `apps/usinagem/lib/dominio/seguranca/login.ts`
- Test: `apps/usinagem/lib/dominio/seguranca/login.test.ts`

**Interfaces:**
- Consumes: `reautenticacaoRecente` e `REAUTENTICACAO_MAX_MS` (de `usuarios/admin.ts`).
- Produces:
  - `MENSAGEM_LOGIN_FALHOU = "E-mail ou senha incorretos."`;
  - `normalizarEmail(email: unknown): string`, que faz trim e lowercase; para não string devolve `""`;
  - `emailParaAuditoria(email: unknown): string | null`, que devolve o e-mail normalizado só se casar com o formato de e-mail (o mesmo validador `z.email()` usado no resto do app) e tiver no máximo 254 caracteres; caso contrário devolve `null`;
  - `registroLogin(d: { email: unknown; sucesso: boolean; ip: string | null; userAgent: string | null; usuarioId: string })`, que devolve uma linha de `eventos_auditoria` com `operacao` `login_sucesso` ou `login_falha`, `entidadeId` e `autorId` iguais ao usuário, e `depois: { email: emailParaAuditoria(...), ip, userAgent }`. O user agent é cortado em 256 e a senha nunca entra. Só é chamada para usuário existente (ajuste 1);
  - `SENHA_MIN = 12`, `SENHA_MAX = 128` e `senhaValida(s: unknown): boolean`, verdadeiro só para string entre 12 e 128 caracteres (ajuste 5);
  - `exigeReautenticacao(sessaoCriadaEm: Date | null, agora: Date): boolean`, verdadeiro quando for `null` ou quando não for recente;
  - `excedeuFalhasPorEmail(falhasRecentes: number): boolean`, verdadeiro com 10 ou mais (`LIMITE_FALHAS_POR_EMAIL = 10`, `JANELA_FALHAS_MS = 15 * 60 * 1000`).

- [ ] **Step 1: Testes que falham**

```ts
import { describe, expect, it } from "vitest";
import { exigeReautenticacao, excedeuFalhasPorEmail, normalizarEmail, registroLogin } from "./login";

describe("registroLogin", () => {
  it("sucesso e falha viram operações distintas, e-mail normalizado, sem senha", () => {
    const ok = registroLogin({ email: " A@X.invalid ", sucesso: true, ip: "127.0.0.1", userAgent: "ua", usuarioId: "u1" });
    const ko = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: null, usuarioId: null });
    expect(ok).toMatchObject({ operacao: "login_sucesso", entidade: "usuarios", entidadeId: "u1", autorId: "u1" });
    expect(ko).toMatchObject({ operacao: "login_falha", entidadeId: null, autorId: null });
    expect(ok.depois).toEqual({ email: "a@x.invalid", ip: "127.0.0.1", userAgent: "ua" });
    expect(JSON.stringify([ok, ko])).not.toMatch(/senha|password/i);
  });
  it("user agent é cortado em 256 caracteres", () => {
    const r = registroLogin({ email: "a@x.invalid", sucesso: false, ip: null, userAgent: "x".repeat(1000), usuarioId: null });
    expect((r.depois as { userAgent: string }).userAgent).toHaveLength(256);
  });
  it("e-mail que não é string vira vazio", () => {
    expect(normalizarEmail(123)).toBe("");
    expect(normalizarEmail({ toString: () => "a@x" })).toBe("");
  });
});

describe("reautenticação recente (10 min)", () => {
  const agora = new Date("2026-10-29T10:20:00Z");
  it.each([
    ["5 min", "2026-10-29T10:15:00Z", false],
    ["exatamente 10 min", "2026-10-29T10:10:00Z", false],
    ["10 min e 1 s", "2026-10-29T10:09:59Z", true],
    ["no futuro", "2026-10-29T10:21:00Z", true],
  ])("sessão de %s", (_n, criada, exige) => {
    expect(exigeReautenticacao(new Date(criada), agora)).toBe(exige);
  });
  it("sem sessão real (seletor de dev) exige sempre", () => {
    expect(exigeReautenticacao(null, agora)).toBe(true);
  });
});

describe("limite por e-mail", () => {
  it.each([[0, false], [9, false], [10, true], [11, true]])("%i falhas: %s", (n, r) => {
    expect(excedeuFalhasPorEmail(n)).toBe(r);
  });
});

describe("e-mail na auditoria nunca é o texto bruto", () => {
  it.each([
    [" A@X.invalid ", "a@x.invalid"],
    ["nao-e-email <script>", null],
    ["a@x.invalid\nX-Injetado: 1", null],
    [`${"a".repeat(250)}@x.invalid`, null],
    [123, null],
  ])("%j vira %j", (entrada, esperado) => {
    expect(emailParaAuditoria(entrada)).toBe(esperado);
  });
});

describe("política de senha", () => {
  it.each([["x".repeat(11), false], ["x".repeat(12), true], ["x".repeat(128), true], ["x".repeat(129), false], [12, false]])(
    "%#", (s, ok) => expect(senhaValida(s)).toBe(ok),
  );
});
```

O import do teste passa a incluir `emailParaAuditoria` e `senhaValida`, e os casos de `registroLogin` usam sempre `usuarioId` não nulo.

- [ ] **Step 2: RED literal**

Run: `cd /home/ewerton/projects/core-platform-usinagem/apps/usinagem && pnpm exec vitest run lib/dominio/seguranca/login.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×|Error"`
Expected: `Cannot find module './login'`.

- [ ] **Step 3: Implementar**

```ts
import { reautenticacaoRecente } from "../usuarios/admin";

export const MENSAGEM_LOGIN_FALHOU = "E-mail ou senha incorretos.";
export const LIMITE_FALHAS_POR_EMAIL = 10;
export const JANELA_FALHAS_MS = 15 * 60 * 1000;
const MAX_USER_AGENT = 256;

export const normalizarEmail = (email: unknown): string => (typeof email === "string" ? email.trim().toLowerCase() : "");

export function registroLogin(d: { email: unknown; sucesso: boolean; ip: string | null; userAgent: string | null; usuarioId: string | null }) {
  return {
    autorId: d.usuarioId,
    operacao: d.sucesso ? "login_sucesso" : "login_falha",
    entidade: "usuarios",
    entidadeId: d.usuarioId,
    antes: null,
    depois: { email: normalizarEmail(d.email), ip: d.ip, userAgent: d.userAgent?.slice(0, MAX_USER_AGENT) ?? null },
    justificativa: null,
  };
}

/** Sem sessão Better Auth (null) conta como velha: o seletor de dev nunca faz ação sensível. */
export const exigeReautenticacao = (sessaoCriadaEm: Date | null, agora: Date): boolean =>
  !sessaoCriadaEm || !reautenticacaoRecente(sessaoCriadaEm, agora);

export const excedeuFalhasPorEmail = (falhasRecentes: number): boolean => falhasRecentes >= LIMITE_FALHAS_POR_EMAIL;
```

- [ ] **Step 4: GREEN, mutações e commit**

- GREEN: o mesmo comando do Step 2, passando.
- Mutações, com a saída literal de cada uma e restauradas:
  - trocar `>=` por `>` em `excedeuFalhasPorEmail` derruba o caso 10;
  - remover o `slice` derruba o teste de 256.
- Commit: `feat(usinagem): regras puras de login, reautenticacao e limite por e-mail`.

**Critérios de aceite:**
- bordas de 10 min exatos, futuro e `null` cobertas;
- e-mail não string tratado;
- senha nunca aparece na linha de auditoria.

### Task 5: Fábrica `criarAuth`: cookies, expiração, origem, inativo e auditoria

**Files:**
- Create: `apps/usinagem/lib/servidor/auth-config.ts`
- Create: `apps/usinagem/lib/servidor/auth.ts`
- Test: `apps/usinagem/lib/servidor/auth.test.ts` (Postgres local; usuários fictícios)

**Interfaces:**
- Consumes: `schema`, `urlLocal`, `bancoDisponivel`, `registroLogin`, `normalizarEmail`, `MENSAGEM_LOGIN_FALHOU`.
- Produces:
  - `criarAuth({ banco, plugins? }): Auth`;
  - `type Auth`;
  - `auth(): Auth` (lazy, `server-only`, `nextCookies()` por último);
  - `CAMINHOS_AUTH_PERMITIDOS = ["/sign-in/email", "/sign-out", "/get-session"] as const`.

- [ ] **Step 1: Ler fontes e registrar**

Ler em `node_modules/better-auth`:
- (a) o endpoint de `sign-in/email`: o que acontece quando o usuário não existe (há hash fictício?) e qual código e status de erro saem para usuário inexistente e para senha errada;
- (b) o erro e o status quando `databaseHooks.session.create.before` devolve `false`;
- (c) os nomes exatos de `advanced.ipAddress.ipAddressHeaders`, `advanced.useSecureCookies`, `advanced.cookiePrefix`, `session.disableSessionRefresh` e `trustedOrigins`.

Registrar no relatório, com arquivo e linha. Os passos seguintes usam o que foi lido, não a memória.

- [ ] **Step 2: Testes de integração que falham**

`auth.test.ts`. Estrutura igual à do 1A: no CI, sem banco ou sem segredo, lança; localmente, pula. Usuários criados direto pelo `internalAdapter` com `ficticio: true` e e-mail `teste-<uuid>@ficticio.invalid`.

Testes:
1. cadastro público recusado (`signUpEmail` rejeita);
2. login certo cria sessão e audita `login_sucesso` sem a senha;
3. senha errada: rejeita e audita `login_falha` sem a senha;
4. **enumeração:** e-mail inexistente e senha errada dão o mesmo `status` e o mesmo `body.code`. Comparar o objeto de erro inteiro (`status`, `code` e `message`), sem e-mail;
5. **inativo:** `ativo = false` faz o login falhar com o mesmo `status` e `code` do teste 4. Se o fonte lido no Step 1(b) mostrar erro diferente, o `hooks.after` mapeia para o erro genérico, e o teste prova a igualdade;
6. **fixação de sessão:** o token do login 1 e o do login 2 do mesmo usuário diferem; com um cookie de sessão inventado (`usinagem.session_token=forjado`), `getSession` devolve `null`;
7. **cookie:** usando `auth.handler(new Request(...))` em `/sign-in/email` com `BETTER_AUTH_URL` `https`, o `Set-Cookie` contém `HttpOnly`, `SameSite=Lax`, `Secure` e o prefixo `__Secure-usinagem`;
8. **expiração:** `session.expiresAt - session.createdAt` é 12 h, com tolerância de 5 s. Um `getSession` depois de mexer o relógio do teste (`vi.setSystemTime` mais 1 h) não altera `expiresAt` (sem refresh);
9. **origem:** um `POST /sign-in/email` com `Origin: https://atacante.invalid` é recusado.

- [ ] **Step 3: RED literal**

Run: `cd /home/ewerton/projects/core-platform-usinagem/apps/usinagem && pnpm exec vitest run lib/servidor/auth.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×|Error"`
Expected: `Cannot find module './auth-config'`.

- [ ] **Step 4: Implementar `auth-config.ts`**

```ts
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { registroLogin } from "../dominio/seguranca/login";
import * as schema from "./db/schema";

type Banco = NodePgDatabase<typeof schema>;

export const CAMINHOS_AUTH_PERMITIDOS = ["/sign-in/email", "/sign-out", "/get-session"] as const;
const DOZE_HORAS_S = 12 * 60 * 60;

function segredo(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  // Falha fechado: sem segredo forte não há auth.
  if (!s || s.length < 32) throw new Error("BETTER_AUTH_SECRET ausente ou curto.");
  return s;
}

export function criarAuth({ banco, plugins = [] }: { banco: Banco; plugins?: BetterAuthPlugin[] }) {
  const baseURL = process.env.BETTER_AUTH_URL;
  const cabecalhoIp = process.env.AUTH_IP_HEADER; // ex.: x-real-ip, definido pelo proxy reverso confiável
  return betterAuth({
    secret: segredo(),
    baseURL,
    trustedOrigins: baseURL ? [baseURL] : [],
    database: drizzleAdapter(banco, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: {
      modelName: "sessoes",
      expiresIn: DOZE_HORAS_S,
      // Expiração absoluta: token roubado não se estende com uso contínuo.
      disableSessionRefresh: true,
    },
    account: { modelName: "contas" },
    verification: { modelName: "verificacoes" },
    user: {
      modelName: "usuarios",
      fields: { name: "nome", emailVerified: "emailVerificado", image: "imagem", createdAt: "criadoEm", updatedAt: "atualizadoEm" },
      additionalFields: {
        perfilId: { type: "string", required: true, input: false },
        ativo: { type: "boolean", required: false, defaultValue: true, input: false },
        ficticio: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "usinagem",
      useSecureCookies: baseURL?.startsWith("https://") ?? false,
      ipAddress: cabecalhoIp ? { ipAddressHeaders: [cabecalhoIp] } : undefined,
    },
    // ponytail: limite em memória, uma instância; storage "database" quando houver mais de uma.
    rateLimit: { enabled: true, window: 60, max: 30, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    databaseHooks: {
      session: {
        create: {
          // Usuário inativo nunca recebe sessão.
          before: async (sessao) => {
            const [u] = await banco.select({ ativo: schema.usuarios.ativo }).from(schema.usuarios).where(eq(schema.usuarios.id, sessao.userId));
            return u?.ativo ? { data: sessao } : false;
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const sucesso = !isAPIError(ctx.context.returned) && Boolean(ctx.context.newSession);
        await banco.insert(schema.eventosAuditoria).values(
          registroLogin({
            email: (ctx.body as { email?: unknown } | undefined)?.email,
            sucesso,
            ip: ctx.context.session?.session.ipAddress ?? null,
            userAgent: ctx.request?.headers.get("user-agent") ?? null,
            usuarioId: ctx.context.newSession?.user.id ?? null,
          }),
        );
      }),
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof criarAuth>;
```

- O IP da auditoria vem do mesmo resolvedor que o Better Auth usa para o rate limit. Ajustar pela leitura do Step 1(c) e nunca ler `x-forwarded-for` cru.
- Se o Step 1(b) mostrar erro diferente para inativo, mapear no `hooks.after` para o mesmo erro de credencial inválida. A Task 6 completa o `hooks.before`.

`auth.ts`:

```ts
import "server-only";
import { nextCookies } from "better-auth/next-js";
import { criarAuth, type Auth } from "./auth-config";
import { db } from "./db";

let instancia: Auth | undefined;

// Lazy: `next build` importa sem segredo nem banco. nextCookies() precisa ser o último plugin.
export function auth(): Auth {
  instancia ??= criarAuth({ banco: db(), plugins: [nextCookies()] });
  return instancia;
}
```

- [ ] **Step 5: GREEN e mutações**

- GREEN: o mesmo comando do Step 3.
- Mutações, com a saída literal de cada uma e restauradas:
  - (m1) `disableSessionRefresh: false` faz o teste 8 falhar;
  - (m2) o hook de inativo devolvendo `{ data: sessao }` sempre faz o teste 5 falhar;
  - (m3) `trustedOrigins: ["*"]` ou origem desligada faz o teste 9 falhar.

- [ ] **Step 6: Commit**

`feat(usinagem): fabrica de auth com cookies seguros, expiracao absoluta, origem e login auditado`.

**Critérios de aceite:** os 9 testes passam; mesma resposta para inexistente, senha errada e inativo; o relatório traz a leitura do Step 1 com arquivo e linha, incluindo a resposta sobre hash fictício.

> **Ajustes 1, 4 e 5 sobre as Tasks 5 e 6** (valem sobre o código mostrado nelas):
> - **`hooks.after`:** grava `login_sucesso` ou `login_falha` só quando o e-mail normalizado corresponde a um usuário existente, usando `registroLogin` com o `usuarioId` dele. E-mail inexistente não grava nada.
> - **Teste 3 da Task 5:** passa a exigir também que uma tentativa com e-mail inexistente não crie linha em `eventos_auditoria`.
> - **Teste 4 da Task 5:** vira o teste das quatro respostas idênticas: senha errada, e-mail inexistente, inativo e bloqueado. Ele exige status, `code`, `message` e corpo iguais, e exatamente uma chamada de verificação de hash por tentativa (spy em `ctx.context.password.verify`).
> - **Hash antes da checagem:** o `hooks.before` faz a verificação de hash contra um hash fictício fixo, calculado uma vez na fábrica, sempre que o usuário não existe, está inativo ou está bloqueado. Só depois recusa com o erro de credencial inválida. Para usuário ativo e não bloqueado, quem verifica é o próprio Better Auth. Se a leitura do fonte (Task 5, Step 1) mostrar que o Better Auth já verifica para inexistente, o `before` não verifica de novo nesse caso: o critério é uma verificação por tentativa.
> - **Política de senha:** `minPasswordLength: SENHA_MIN` e `maxPasswordLength: SENHA_MAX` vêm de `login.ts`.

### Task 6: Limite por e-mail e tempo constante para usuário inexistente

**Files:**
- Modify: `apps/usinagem/lib/servidor/auth-config.ts` (`hooks.before`)
- Test: `apps/usinagem/lib/servidor/auth.test.ts`

**Interfaces:** consome `excedeuFalhasPorEmail`, `JANELA_FALHAS_MS` e `normalizarEmail`.

- [ ] **Step 1: Testes que falham**

1. Depois de 10 `login_falha` do usuário (inseridas direto em `eventos_auditoria`, com `entidade_id` igual ao usuário e `criado_em` dentro da janela), um login com a senha CERTA é recusado com a mesma resposta de credencial inválida, e audita `login_falha`.
2. Com as 10 falhas fora da janela (`criado_em` 16 min antes), o login certo passa.
3. O e-mail digitado é normalizado antes de achar o usuário: `A@X.invalid` bloqueia `a@x.invalid`.
4. Com um `login_desbloqueio` posterior às 10 falhas, o login certo passa (ajuste 1).
5. Com e-mail inexistente, 50 tentativas não criam linha de auditoria e são barradas só pelo limite por IP. A partir da 6ª dentro de 60 s, a resposta é a do rate limit.
6. As quatro respostas são idênticas, com uma verificação de hash cada (ajuste 4). Se esse teste já estiver na Task 5, apontar para ele.

Script de operação `scripts/desbloquear-usuario.ts`: grava `login_desbloqueio` com `entidade_id` igual ao usuário, `autor_id` nulo e justificativa "desbloqueio pelo script de operação". O e-mail vem por argumento e precisa existir; inexistente sai com código 1 e mensagem genérica. `package.json` ganha `"usuario:desbloquear"` no mesmo padrão de `usuario:criar`. Há um teste da função `desbloquearUsuario(banco, email)` (Postgres local).

- [ ] **Step 2: RED literal** (`auth.test.ts`, só os novos falhando).

- [ ] **Step 3: Implementar**

```ts
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const corpo = ctx.body as { email?: unknown; password?: unknown } | undefined;
        const email = normalizarEmail(corpo?.email);
        const [u] = await banco.select({ id: schema.usuarios.id, ativo: schema.usuarios.ativo }).from(schema.usuarios).where(eq(schema.usuarios.email, email));
        const bloqueado = u ? excedeuFalhasPorEmail(await falhasDesdeDesbloqueio(banco, u.id, new Date(Date.now() - JANELA_FALHAS_MS))) : false;
        if (!u || !u.ativo || bloqueado) {
          // Hash antes de recusar: tempo igual ao da senha errada (ajuste 4).
          await ctx.context.password.verify({ hash: hashFicticio, password: typeof corpo?.password === "string" ? corpo.password : "" });
          if (u) await banco.insert(schema.eventosAuditoria).values(registroLogin({ email: corpo?.email, sucesso: false, ip, userAgent, usuarioId: u.id }));
          // Mesma resposta da credencial inválida: não revela bloqueio, inatividade nem existência.
          throw erroCredencialInvalida();
        }
      }),
      after: /* da Task 5 */,
    },
```

- `erroCredencialInvalida()` devolve exatamente o mesmo `APIError` (status, `code` e `message`) que o Better Auth emite para senha errada, conforme a leitura da Task 5, Step 1(a).
- `hashFicticio` é calculado uma vez por instância (`await ctx.password.hash(<string aleatória>)` no primeiro uso).
- `ip` e `userAgent` vêm do mesmo resolvedor da Task 5.
- `falhasDesdeDesbloqueio(banco, usuarioId, desde)` conta `login_falha` do usuário com `criado_em >= max(desde, último login_desbloqueio do usuário)`.
- Como a recusa do inativo acontece no `before`, o `databaseHooks.session.create.before` da Task 5 continua como segunda barreira.
- **Índice:** a consulta filtra por `operacao`, pelo e-mail em `depois` e por `criado_em`. O índice existente cobre `entidade`, e não `operacao`. Com volume baixo, a varredura é aceitável. Fica `ponytail:` no código, com a saída: índice `(operacao, criado_em)` numa migration futura.

- [ ] **Step 4: GREEN e mutação**

- GREEN: os testes novos passando.
- Mutação: trocar o limite para 11 derruba o teste 1. Colar a saída literal e restaurar.

- [ ] **Step 5: Commit**

`feat(usinagem): limite de falhas por e-mail sem revelar bloqueio`.

**Critérios de aceite:**
- bloqueio por e-mail na janela;
- resposta idêntica à da credencial inválida;
- normalização aplicada;
- decisão do hash fictício registrada e provada.

### Task 7: Criação de usuário com senha e script local

**Files:**
- Create: `apps/usinagem/lib/servidor/usuarios-auth.ts`
- Create: `apps/usinagem/scripts/criar-usuario.ts`
- Modify: `apps/usinagem/package.json`, só a entrada `"usuario:criar"` em `scripts`
- Test: `apps/usinagem/lib/servidor/usuarios-auth.test.ts` (Postgres local)

**Interfaces:**
- Produces: `criarUsuarioComSenha(a: Auth, banco, d: { nome: string; email: string; senha: string; perfil: Perfil; ficticio: boolean; criadoPor: string | null }): Promise<string>`.
- Valida:
  - senha entre 12 e 128 caracteres;
  - perfil dentro de `PERFIS`;
  - e-mail normalizado.
- Grava, numa transação:
  - o usuário, com `criado_por`;
  - a conta `credential` com o hash;
  - o evento `usuario_criado`, com `autor_id = criadoPor` e `depois` sem a senha.

- [ ] **Step 1: Testes que falham**

1. A criação devolve um id, e o `senha_hash` da conta é diferente da senha e começa pelo prefixo do algoritmo lido no fonte.
2. O evento `usuario_criado` não contém a senha (`JSON.stringify`).
3. Senha de 11 caracteres é recusada, e nada fica gravado (contar `usuarios` antes e depois).
4. E-mail duplicado em caixa diferente é recusado, sem conta órfã.
5. `criadoPor` é gravado. Com `criadoPor: null`, a coluna fica nula.
6. Perfil inválido (`"visitante" as Perfil`) é recusado.

- [ ] **Step 2: RED literal.**

- [ ] **Step 3: Implementar**

- Usar `ctx.internalAdapter.createUser`, depois `ctx.password.hash` e depois `ctx.internalAdapter.linkAccount`. Esse é o padrão do plugin admin, confirmado no `.d.ts`.
- `criado_por` é gravado com um `update` logo depois do `createUser`, dentro da mesma transação, se o adapter aceitar `tx`. Se o adapter não participar de transação externa, criar com compensação: em falha do `linkAccount`, desativar o usuário criado (`ativo = false`) e lançar. O teste 4 prova que não sobra conta utilizável.
- Registrar a escolha no relatório.

`scripts/criar-usuario.ts`:
- a senha chega só pela entrada padrão, nunca por argumento;
- o uso é `printf '%s' "$SENHA" | pnpm usuario:criar "<nome>" <email> <perfil> [--ficticio]`;
- `criadoPor` vai `null`, porque é o bootstrap.

`package.json`: `"usuario:criar": "node --env-file=.env.local --import tsx scripts/criar-usuario.ts"`.

- [ ] **Step 4: GREEN e mutação**

- GREEN: os 6 testes passando.
- Mutação: remover a checagem de tamanho mínimo derruba o teste 3. Colar a saída literal e restaurar.

- [ ] **Step 5: Commit**

`feat(usinagem): criacao de usuario com senha e script local pela entrada padrao`.

**Ajustes 5 e 6:**
- A política de senha usa `senhaValida`. O teste 3 vira uma tabela de bordas (11 recusa, 12 aceita, 128 aceita, 129 recusa).
- Novo `redefinirSenha(a, banco, d: { email: string; novaSenha: string })`. Numa transação, ele:
  - valida com `senhaValida`;
  - atualiza `contas.senha_hash` da conta `credential`;
  - apaga as sessões do usuário;
  - grava o evento `senha_redefinida` sem a senha, com `autor_id` nulo e justificativa "redefinição pelo script de operação".
- Testes: a senha antiga deixa de funcionar e a nova funciona; as sessões anteriores somem; o evento não contém nenhuma das duas senhas; senha de 11 é recusada sem mudar nada.
- Script `scripts/redefinir-senha.ts`: nova senha só pela entrada padrão. `package.json` ganha `"usuario:redefinir-senha"`.
- É a recuperação provisória. A troca pelo próprio usuário e a recuperação self-service ficam pendentes na spec §9.2.

**Critérios de aceite:**
- senha nunca em argumento, log ou auditoria;
- falha não deixa usuário com credencial;
- `criado_por` correto;
- redefinição derruba as sessões.

O humano roda o script uma vez com usuário fictício para validar. O agente não roda (`.env.local`).

### Task 8: Handler com allowlist, `ROTAS_ISENTAS` e `proxy.ts`

**Files:**
- Create: `apps/usinagem/app/api/auth/[...all]/route.ts`
- Create: `apps/usinagem/lib/servidor/handler-auth.ts` (função pura e testável)
- Modify: `apps/usinagem/scripts/cobertura-acoes.ts` (`ROTAS_ISENTAS`)
- Create: `apps/usinagem/proxy.ts`
- Test: `apps/usinagem/lib/servidor/handler-auth.test.ts`

**Interfaces:**
- Produces: `filtrarCaminhoAuth(req: Request, base = "/api/auth"): boolean`. É verdadeiro só para os pares método e caminho permitidos:
  - `POST /sign-in/email`
  - `POST /sign-out`
  - `GET /get-session`

- [ ] **Step 1: Testes que falham**

- `it.each` com os 3 permitidos (true).
- `it.each` com os recusados (false):
  - `/sign-up/email`, `/update-user`, `/change-email`, `/change-password`, `/delete-user`;
  - `/list-sessions`, `/revoke-sessions`, `/request-password-reset`, `/reset-password`;
  - `GET /sign-in/email`;
  - `/sign-in/email/../update-user`;
  - `/SIGN-IN/EMAIL`;
  - `/sign-in/email/`, `/sign-in/email?x=1` (a query é ignorada, mas o path tem que ser exato).

- [ ] **Step 2: RED literal.**

- [ ] **Step 3: Implementar**

```ts
const PERMITIDOS = new Set(["POST /sign-in/email", "POST /sign-out", "GET /get-session"]);

/** Deny by default: só os endpoints do Better Auth que o ERP usa. O resto responde 404. */
export function filtrarCaminhoAuth(req: Request, base = "/api/auth"): boolean {
  const { pathname } = new URL(req.url);
  if (!pathname.startsWith(`${base}/`)) return false;
  return PERMITIDOS.has(`${req.method} ${pathname.slice(base.length)}`);
}
```

`route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/servidor/auth";
import { filtrarCaminhoAuth } from "@/lib/servidor/handler-auth";

// Isento do wrapper rota(): é o próprio endpoint de autenticação (ROTAS_ISENTAS).
// Allowlist de caminhos; rate limit e origem no auth-config.ts.
const naoEncontrado = () => new Response(null, { status: 404 });
export const GET = (req: Request) => (filtrarCaminhoAuth(req) ? toNextJsHandler(auth()).GET(req) : naoEncontrado());
export const POST = (req: Request) => (filtrarCaminhoAuth(req) ? toNextJsHandler(auth()).POST(req) : naoEncontrado());
```

`ROTAS_ISENTAS` recebe `"app/api/auth/[...all]/route.ts"`, com o comentário do motivo. O teste de cobertura do código real continua verde.

Ler `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` antes de escrever o `proxy.ts`:

```ts
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Barreira otimista; a autoritativa é o requirePermissao em cada ação e página.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_SWITCHER === "1") return NextResponse.next();
  if (getSessionCookie(request, { cookiePrefix: "usinagem" })) return NextResponse.next();
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  matcher: ["/((?!entrar|api/auth|dev/|_next/static|_next/image|favicon\\.ico).*)"],
};
```

- [ ] **Step 4: GREEN e mutação**

- GREEN: todos os casos do Step 1 passando.
- Mutação: trocar a comparação exata por `startsWith` derruba o caso `/sign-in/email/../update-user` ou a barra final. Colar a saída literal e restaurar.

- [ ] **Step 5: Commit**

`feat(usinagem): handler de auth com allowlist de caminhos e proxy`.

**Critérios de aceite:**
- só 3 endpoints vivos;
- cobertura do wrapper verde, com a isenção justificada;
- build verde.

### Task 9: Sessão real, `requirePermissaoSensivel` e `acaoSensivel`

**Files:**
- Modify: `apps/usinagem/lib/servidor/sessao.ts`
- Modify: `apps/usinagem/lib/servidor/acao.ts`
- Modify: `apps/usinagem/scripts/cobertura-acoes.ts` (aceitar `acaoSensivel` como forma válida)
- Test: `apps/usinagem/lib/servidor/sessao.test.ts`, `acao.test.ts`, `cobertura-acoes.test.ts`

**Interfaces:**
- Produces:
  - `SessaoAutorizada = UsuarioSessao & { concedidas: readonly Permissao[]; sessaoCriadaEm: Date | null }`;
  - `usuarioAtual()` usa a sessão do Better Auth e cai no dev só atrás do gate;
  - `class ErroReautenticacao extends ErroPermissao` (403, mensagem "Confirme sua senha para continuar.", incluída em `registrarErro` como mensagem segura);
  - `requirePermissaoSensivel(p): Promise<SessaoAutorizada>`;
  - `acaoSensivel(permissao, esquema, fn)`.

- [ ] **Step 1: Testes que falham**

Mocks de `./auth` e `next/headers`, como em `sessao-dev.test.ts`. Testes:
1. Com sessão real de usuário ativo, as concedidas vêm de `perfil_permissoes` e `sessaoCriadaEm` vem de `session.createdAt`.
2. Sessão real de usuário com `ativo = false` no banco: `null` e 401. Prova que não há cache.
3. Sem sessão real, fora do gate: 401. O cookie de dev é ignorado.
4. Sem sessão real, com o gate de dev ligado: usuário de dev com `sessaoCriadaEm: null`.
5. Sessão real e cookie de dev ao mesmo tempo: vence a real.
6. `requirePermissaoSensivel` com sessão de 5 min passa; com 11 min lança `ErroReautenticacao`; com o seletor de dev lança `ErroReautenticacao`.
7. `acaoSensivel` com sessão velha devolve `{ ok: false, erro: "Confirme sua senha para continuar." }` e a `fn` não é chamada.
8. O scanner aceita `export const x = acaoSensivel(...)` importado de `@/lib/servidor/acao` e recusa alias.
9. **Ajuste 3, falha fechada em produção:** com `NODE_ENV = "production"`, `ENABLE_DEV_SWITCHER = "1"` e o cookie de dev de um usuário fictício válido presentes, `usuarioAtual()` devolve `null` (401) e `usuarioDev` nem é importado (spy no import dinâmico, ou `vi.mock("./sessao-dev")` contando chamadas). Repetir com `NODE_ENV` indefinido e com `"test"`: também `null`. Em `sessao-dev.ts`, `usuarioDev()` ganha uma guarda própria: se `process.env.NODE_ENV !== "development"`, devolve `null` antes de ler o cookie (defesa em profundidade), e há teste disso.

- [ ] **Step 2: RED literal.**

- [ ] **Step 3: Implementar**

`usuarioAtual` passa a devolver também `sessaoCriadaEm`. Ordem de resolução:
- primeiro `auth().api.getSession({ headers: await headers() })`;
- depois relê `usuarios`, com `ativo = true`;
- por último o ramo de dev, com `NODE_ENV` literal, já existente.

`acaoSensivel` é igual a `acao`, trocando `requirePermissao` por `requirePermissaoSensivel`. Em `ErroReautenticacao`, devolve a mensagem dela.

- [ ] **Step 4: GREEN e mutações**

- GREEN: os 8 testes passando.
- Mutações, com a saída literal de cada uma e restauradas:
  - (m1) `usuarioAtual` sem o filtro de `ativo` derruba o teste 2;
  - (m2) `exigeReautenticacao` substituído por `false` derruba os testes 6 e 7.

- [ ] **Step 5: Commit**

`feat(usinagem): sessao real com concedidas, reautenticacao recente e acaoSensivel`.

**Critérios de aceite:**
- desativação vale no request seguinte;
- ação sensível sem login recente é recusada sem executar;
- o seletor de dev nunca passa em ação sensível.

### Task 10: Alteração de usuário com o último Admin travado

**Files:**
- Create: `apps/usinagem/lib/servidor/usuarios.ts`
- Test: `apps/usinagem/lib/servidor/usuarios.test.ts` (Postgres local)

**Interfaces:**
- Consumes: `validarAlteracaoUsuario` e `ErroDominio`.
- Produces: `alterarUsuario(banco, autor: SessaoAutorizada, alvoId: string, versaoLida: number, mudanca: { perfil?: Perfil; ativo?: boolean }): Promise<void>`.

Numa única transação:
1. `SELECT id, perfil_id, ativo, ficticio FROM usuarios WHERE (perfil_id = 'admin' AND ativo) OR id = $alvo FOR UPDATE`, com ordem estável por `id` para evitar deadlock;
2. `validarAlteracaoUsuario`; se falhar, lança `ErroDominio("Alteração de usuário recusada.")`, uma mensagem genérica registrada em `MENSAGENS_DE_DOMINIO` (spec §7.4: o motivo exato não vai ao cliente);
3. `UPDATE ... WHERE id = $alvo AND versao = $versaoLida`, com `versao + 1` e `atualizado_em = now()`; zero linhas lança `ErroDominio("Registro alterado por outra pessoa.")`;
4. se o usuário foi desativado ou trocou de perfil, `DELETE FROM sessoes WHERE usuario_id = $alvo`;
5. evento `usuario_alterado` com `antes` e `depois` (perfil e ativo) e `autor_id = autor.id`.

A exposição como ação (`acaoSensivel("usuarios.gerenciar", ...)`) fica com a tela de usuários, fora do 1D. Esta task entrega a função testada.

- [ ] **Step 1: Testes que falham**

1. Desativar o único Admin ativo é recusado com a mensagem genérica, e nada muda (nem `versao` nem evento).
2. Com dois Admins ativos, desativar um passa, as sessões dele somem e o evento traz `antes` e `depois`.
3. **Concorrência:** com exatamente dois Admins ativos A e B, `Promise.allSettled` de duas transações em conexões separadas (uma desativa A, outra desativa B). Exatamente uma é recusada e sobra um Admin ativo. Repetir 20 vezes para não passar por sorte.
4. Versão desatualizada é recusada e nada muda.
5. Trocar o perfil do último Admin para `comercial` é recusado.
6. Admin fictício não conta para proteger Admin real (regra já existente em `validarAlteracaoUsuario`, agora provada no banco).
7. A troca de perfil derruba as sessões do alvo.

- [ ] **Step 2: RED literal.**

- [ ] **Step 3: Implementar** (com `banco.transaction` e `sql` com parâmetros; nunca interpolação).

- [ ] **Step 4: GREEN e mutação**

- GREEN: os 7 testes passando.
- Mutação: remover o `FOR UPDATE` faz o teste 3 falhar em pelo menos uma das 20 rodadas. Colar a saída e restaurar. Se não falhar, o teste não prova a trava: forçar o entrelaçamento com `pg_sleep` dentro da transação de teste e registrar.

- [ ] **Step 5: Commit**

`feat(usinagem): alteracao de usuario com ultimo Admin travado e sessoes revogadas`.

**Critérios de aceite:**
- nunca fica zero Admin ativo, mesmo em concorrência;
- erro genérico ao cliente;
- desativação derruba as sessões.

### Task 11: `/entrar`, sair e reautenticação

**Files:**
- Create: `apps/usinagem/lib/servidor/auth-cliente.ts`
- Create: `apps/usinagem/app/entrar/page.tsx`
- Create: `apps/usinagem/app/entrar/FormEntrar.tsx`
- Create: `apps/usinagem/app/entrar/acoes.ts`
- Modify: `apps/usinagem/scripts/cobertura-acoes.ts` (`ACOES_PUBLICAS` recebe `app/entrar/acoes.ts`, com motivo)
- Test: `apps/usinagem/app/entrar/destino.test.ts`

**Interfaces:**
- Produces:
  - `destinoSeguro(volta: unknown): string`, pura, em `lib/dominio/seguranca/login.ts`. Só aceita caminho relativo que comece com `/` e não com `//` nem `/\`; o resto vira `/`. Evita redirecionamento aberto.
  - ação `sair`.

- [ ] **Step 1: Testes que falham** (`destinoSeguro`)

Casos:

| Entrada | Saída |
|---|---|
| `"/processos"` | `/processos` |
| `"//atacante.invalid"` | `/` |
| `"/\\atacante.invalid"` | `/` |
| `"https://atacante.invalid"` | `/` |
| `"javascript:alert(1)"` | `/` |
| `undefined` | `/` |
| `123` | `/` |
| `"/x?y=1"` | `/x?y=1` |

- [ ] **Step 2: RED literal.**

- [ ] **Step 3: Implementar**

- A tela tem formulário com e-mail e senha. Qualquer erro mostra só `MENSAGEM_LOGIN_FALHOU`.
- Com `?reautenticar=1`, o formulário chama `authCliente.signOut()` antes do `signIn.email` (D1) e depois volta para `destinoSeguro(volta)`.
- `sair` é `acaoPublica(z.object({}), ...)`: `auth().api.signOut` e depois `redirect("/entrar")`.
- Nenhum estilo próprio.

- [ ] **Step 4: GREEN, mutação e verificação manual registrada**

- GREEN: os casos do Step 1 passando.
- Mutação: aceitar `//` derruba o caso 2. Colar a saída e restaurar.
- O humano roda `pnpm dev` e confere:
  - `/` responde 307 para `/entrar`;
  - o login certo entra;
  - a senha errada mostra a mensagem genérica;
  - o sair volta para `/entrar`.

  O agente cola as saídas de `curl` que o humano fornecer.

- [ ] **Step 5: Commit**

`feat(usinagem): tela de entrada funcional, sair e reautenticacao por novo login`.

**Critérios de aceite:**
- sem redirecionamento aberto;
- mensagem única;
- cobertura do wrapper verde com a ação pública listada.

### Task 12: Seletor de dev fora do build de produção (PARA no workflow)

**Files:**
- Modify: `apps/usinagem/next.config.ts`
- Create: `apps/usinagem/app/dev/perfil/page.dev.tsx`
- Create: `apps/usinagem/app/dev/perfil/acoes.dev.ts`
- Create: `apps/usinagem/app/dev/perfil/BotaoPerfil.dev.tsx`
- Create: `apps/usinagem/scripts/verificar-build-producao.sh`
- Modify: `apps/usinagem/scripts/cobertura-acoes.ts` (`ACOES_PUBLICAS` recebe `app/dev/perfil/acoes.dev.ts`)
- **Patch para o humano** (o agente não edita): `.github/workflows/usinagem.yml`

**Interfaces:** consome `seletorDevAtivo`, `COOKIE_USUARIO_DEV` e `acaoPublica`.

- [ ] **Step 1: Ler** `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/pageExtensions.md`.

- [ ] **Step 2: Script que falha (RED)**

- Escrever `verificar-build-producao.sh`, igual ao do plano antigo (Task 4, Step 4): build com `ENABLE_DEV_SWITCHER=1`; grep do nome do cookie em `.next`; `/dev/perfil` precisa dar 404 com `pnpm start`.
- Rodar ANTES do `next.config.ts`, com uma `page.dev.tsx` já criada e `pageExtensions` incluindo sempre `dev.tsx`. Esperado: `FALHA`. Colar a saída.

- [ ] **Step 3: Implementar**

- `next.config.ts`:
  ```ts
  pageExtensions: seletorDevAtivo(process.env) ? ["dev.tsx", "dev.ts", "tsx", "ts"] : ["tsx", "ts"]
  ```
- `acoes.dev.ts`: `escolherPerfil` com `acaoPublica` e `z.object({ id: z.uuid() })`. Valida o gate, aceita só usuário fictício e ativo, e grava o cookie `httpOnly` com `sameSite: "strict"`.
- A página lista os fictícios ativos.

- [ ] **Step 4: GREEN e mutação**

- GREEN: o script imprime `OK: seletor de dev ausente do build de produção.`.
- Mutação: o `pageExtensions` sempre com `dev.tsx` faz o script imprimir `FALHA`. Colar a saída e restaurar.

- [ ] **Step 5: Commit e PARADA**

Commit: `feat(usinagem): seletor de dev excluido do build de producao com verificacao`.

O agente PARA e entrega ao humano o patch do workflow:
- `env` com `BETTER_AUTH_SECRET: ci_better_auth_descartavel_0123456789abcdef` e `BETTER_AUTH_URL: http://localhost:3999`;
- depois do `pnpm test`, o passo `bash scripts/verificar-build-producao.sh`.

**Critérios de aceite:**
- 404 e cookie ausente comprovados por script;
- o seletor só lista e aceita usuários fictícios e ativos;
- workflow alterado só pelo humano.

### Task 13: Fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-10-24-express-usinagem-erp-design.md`
- Modify: `apps/usinagem/CLAUDE.md` (via controller)

- [ ] **Spec §9.2:** mover para "entregue no 1D" as linhas de `safeParse`, de `concedidas` opcional e do plano 1D antigo. Registrar as exceções de convenção das tabelas do Better Auth na §4.
- [ ] **Spec §9.3 (checklist de entrada em produção):** conferir que os itens dos ajustes 3, 7 e 8 continuam lá. Marcar o que o 1D cumpriu e deixar o resto aberto.
- [ ] **Gate final:** suíte, typecheck, lint sem filtro, build e `verificar-build-producao.sh`, todos com exit 0.
- [ ] **Revisão Opus do 1D inteiro,** com o mesmo formato da 1B. Marcador `pr/1d` só depois do APPROVED. Sem push.

## Fora do 1D (registrado para o PR 2)

- Ordem estável na query de movimentos de estoque e identificador do registro no log de `ErroDominio` (D7).
- Tela de usuários e de permissões: expor `alterarUsuario` via `acaoSensivel("usuarios.gerenciar")` e editar `perfil_permissoes` via `acaoSensivel("permissoes.gerenciar")`, com auditoria de antes e depois.
- `storage: "database"` no rate limit, quando houver mais de uma instância.
- Índice `(operacao, criado_em)` em `eventos_auditoria`, se o volume de falhas crescer.
