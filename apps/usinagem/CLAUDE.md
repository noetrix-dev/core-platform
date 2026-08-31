# CLAUDE.md — apps/usinagem

## Produto
Sistema de gestão de processos para Express Usinagem e Calderaria Ltda.
Cliente piloto: Roberto Almeida — Campo Grande, Rio de Janeiro.
Produto da Noetrix — monorepo core-platform, app separado do StudiOLD.

## Modelo de negócio do cliente
Intermediário técnico: não fabrica, terceiriza tudo.
Fluxo: recebe pedido → faz desenho → cota parceiros → compra MP → envia para fabricação → inspeciona → entrega.
Três atores por processo: Cliente / Matéria Prima / Parceiros Fabricantes.

## Stack
Next.js 15, TypeScript, Tailwind CSS 4, Supabase (São Paulo), Vercel (team: noetrix).
URL produção: usinagem.noetrix.com.br (a configurar no Cloudflare).

## Usuários e papéis
| Papel | Usuário | Permissões exclusivas |
|---|---|---|
| Admin | Roberto Almeida | Ver margem por processo, configurar usuários |
| Comercial | Ana Ferreira | Criar e editar processos, clientes |
| Compras/Produção | Marcos Lima | Atualizar cadeia de valor, parceiros |
| Financeiro | Fernanda Costa | Módulo financeiro completo, registrar NF |

## Máquina de estados do processo
cotacao_aberta → cotacao_enviada → em_fabricacao → pronto_entrega → nf_emitida → fechado
Retrabalho: incrementa letra do sufixo (421-A → 421-B).
Sub-status de fabricação: texto livre, atualizado por Compras/Produção.

## Servidor de arquivos
PC local na rede da empresa (\\SERVIDOR-EXPRESS\Processos\).
Sistema armazena o caminho de rede por processo — não os arquivos.
Não há integração direta.

## NF — Varitus
Emissão feita no Varitus (sistema externo).
Sistema registra NF (número + data) e gera conta a receber. Não emite diretamente.

## Fluxo obrigatório
1. /brainstorm → 2. /superpowers:writing-plans → 3. /impeccable shape → 4. SDD → 5. Review Opus → push

## Design system
Paleta: #191919 sidebar, #A81915 primário, #B5652E secundário, #EEF0EE fundo com grid blueprint 28px.
Tipografia: IBM Plex Sans + IBM Plex Mono.
Referência: prototype de validação em express-usinagem-sistema.html.
