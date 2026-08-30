# /configuracoes em rotas separadas — Design

## Objetivo

Quebrar `/configuracoes` (uma página longa de 558 linhas com âncoras) em 5 rotas, uma por seção, sob um layout compartilhado com secondary nav. Sem Server Action nova, sem schema, sem mudar os sub-componentes client.

## Decisões (aprovadas no chat)

- **`requireUser()` no `configuracoes/layout.tsx`, uma vez** — cobre as 5 filhas. As Server Actions já têm `requireUser()` próprio (auth), então a escrita segue protegida.
- **Secondary nav = faixa de abas horizontal no layout** — componente client (`usePathname()` marca a ativa), scroll horizontal no mobile. Piso: `.chip`/`.chips` ou `.navItem`; visual fino pelo `/impeccable shape`.
- Rotas: `/configuracoes/cortesias`, `/produtos`, `/estilos`, `/servicos`, `/horarios`. `/configuracoes` (raiz) → `redirect("/configuracoes/cortesias")`.
- Isso reescreve a "Task 6" (menu Gerenciar em âncoras) da feature `produtos-itens-extras-menu` — que está em `main` local não-pushado.

## Estrutura de arquivos

**Novos:**
- `app/configuracoes/layout.tsx` — RSC. `await requireUser()`. Renderiza:
  ```
  <div className={styles.shell}>
    <Topbar titulo="Configurações" />
    <SecondaryNav />
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      {children}
    </main>
  </div>
  ```
- `app/configuracoes/SecondaryNav.tsx` — `"use client"`. Array das 5 seções (`href` da rota + `label`), `usePathname()` marca ativa (`pathname === href`). Faixa horizontal, `overflow-x-auto` no mobile. Ordem: Cortesias, Estilos de música, Serviços, Produtos, Horário de funcionamento.
- `app/configuracoes/cortesias/page.tsx` — `force-dynamic`. `tenantDb()` + `.from("cortesias").select("id, nome, descricao, ativo, quantidade_estoque").order("nome")` + guard + `const cortesias = (res.data ?? []) as Cortesia[]` (tipo inline). Renderiza só a `<section className={styles.cfgSection}>` de Cortesias (sem `id`, sem `scroll-mt-20`, sem `<Topbar>`, sem `<main>` — a moldura é do layout). Imports: `EstoqueEditavel`, `* as A from "../actions"`, `Icon`, `styles`.
- `app/configuracoes/estilos/page.tsx` — idem, `.from("estilos_musica").select("id, nome, ativo").order("nome")`, tipo `Estilo` inline, seção Estilos.
- `app/configuracoes/servicos/page.tsx` — `.from("servicos").select("id, nome, preco, duracao_minutos, ativo").order("nome")`, map `preco: Number(...)`, tipo `Servico` inline, `fmtPreco`, seção Serviços.
- `app/configuracoes/produtos/page.tsx` — `.from("produtos").select("id, nome, descricao, preco_venda, quantidade_estoque, ativo").order("nome")`, map `preco_venda: Number(...)`, tipo `Produto` inline, `EstoqueProdutoEditavel`, `fmtPreco`, seção Produtos.
- `app/configuracoes/horarios/page.tsx` — 2 queries num `Promise.all`: `horarios_funcionamento` (`select("dia_semana, aberto, hora_abertura, hora_fechamento").order("dia_semana")`) + `bloqueios_fixos` (`select("id, hora_inicio, hora_fim").eq("tipo","suave").eq("ativo",true).is("dia_semana",null).limit(1)`). Deriva `dias` e `almoco` (mesma lógica de hoje). Renderiza `<HorariosForm key={JSON.stringify(dias)} dias={dias} almoco={almoco} />`.

**Modificados:**
- `app/configuracoes/page.tsx` — passa a ser:
  ```tsx
  import { redirect } from "next/navigation";
  export default function ConfiguracoesPage() {
    redirect("/configuracoes/cortesias");
  }
  ```
  Perde `force-dynamic`, `requireUser()` (o layout cobre), todo o fetch e JSX.
- `app/configuracoes/HorariosForm.tsx` — remover `id="horarios"` e `scroll-mt-20` da `<section>` externa (viram inúteis com rota própria): `<section className={styles.cfgSection}>`.
- `components/Topbar.tsx` — `GERENCIAR` aponta pras 5 rotas reais (sem `#`):
  ```
  { href: "/configuracoes/cortesias", label: "Cortesias", icone: "cup" }
  { href: "/configuracoes/estilos", label: "Estilos de música", icone: "music" }
  { href: "/configuracoes/servicos", label: "Serviços", icone: "scissors" }
  { href: "/configuracoes/produtos", label: "Produtos", icone: "box" }
  { href: "/configuracoes/horarios", label: "Horário de funcionamento", icone: "clock" }
  ```
  `ativo(href)` volta a `pathname === href || pathname.startsWith(\`${href}/\`)` (tirar o `!href.includes("#") &&`).
- `app/configuracoes/actions.ts` — trocar as 16 chamadas `revalidatePath(ROTA)` por `revalidatePath(ROTA, "layout")`. Revalida o segmento `/configuracoes/*` inteiro, senão `criarProduto` (etc.) não reflete em `/configuracoes/produtos`. `ROTA` continua `"/configuracoes"`.

## Fetch

Cada rota faz seu próprio `tenantDb()` + 1 query (horarios = 2 num `Promise.all`). Sem `Promise.all` gigante compartilhado — cada rota carrega só o que mostra. Guard `if (res.error) throw new Error(\`configuracoes/<x>: ${res.error.message}\`)` igual ao de hoje.

## Erros / edge

- `/configuracoes` puro nunca renderiza conteúdo (redireciona antes). Layout roda no redirect? Não — `redirect()` aborta o render da página, o layout do `/configuracoes/cortesias` de destino é que roda.
- Link antigo com `#` (bookmark) → cai em `/configuracoes` → redireciona pra cortesias, hash ignorado. Aceitável.
- `SecondaryNav` com `usePathname()` numa rota fora de `/configuracoes/*` nunca acontece (só é montado pelo layout do segmento).
- Sem migration, sem deploy ordering — é só código.

## Teste

Zero lógica pura nova (é reorganização de fetch + JSX). `agenda.check.ts` não muda. Aceitação manual (checklist no plano): cada uma das 5 rotas carrega e mostra sua seção; `/configuracoes` redireciona pra cortesias; o secondary nav marca a aba certa e navega; os links do drawer Gerenciar vão pras rotas; um `criarProduto`/`criarCortesia`/etc. reflete na rota respectiva após o submit (revalidatePath "layout").

## Fora de escopo

Server Action nova; schema; mexer em `EstoqueEditavel`/`EstoqueProdutoEditavel`/`HorariosForm` (além de tirar o `id` do último); breadcrumb; state em `?query`; animação de troca de aba; extrair tipos pra `configuracoes/types.ts` (ficam inline, cada um usado numa rota só).
