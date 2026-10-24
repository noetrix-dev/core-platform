# ERP Express Usinagem: especificação consolidada v1.0

Data: 2026-10-24. App: `apps/usinagem`. Branch: `feat/usinagem-fundacao`.

Esta especificação consolida as regras de negócio das versões v1.0, v2.0, V2.2 e V2.3 do material de produto, mais as decisões tomadas no brainstorm de 2026-10-24. Contém só regras de negócio e decisões técnicas do código. Infraestrutura de produção, contas, endereços e achados de segurança ficam fora deste repositório, que é público.

Estado: regras aprovadas para modelagem. Nada aqui autoriza dado real, banco de produção ou deploy.

---

## 1. Contexto

A Express Usinagem e Calderaria é uma intermediadora técnica. Não tem máquinas: desenvolve ou revisa desenhos CAD, compra matéria-prima, contrata parceiros externos para usinagem e tratamentos, confere as peças, registra a nota fiscal emitida em sistema fiscal externo e entrega ao cliente.

O ERP acompanha o trabalho desde a solicitação de cotação até o fechamento: engenharia, cotações de fornecedores, proposta, pedido formal, produção terceirizada, qualidade, estoque de acabados, entregas parciais, nota fiscal registrada, contas a pagar e a receber, e margem visível só ao Admin.

Dores que o sistema resolve:
- não há rastreio central de compras, recebimentos, parceiros, pedidos em fabricação e pedidos a faturar;
- não há visão confiável do resultado por pedido (o pagamento a fornecedor costuma vir antes do recebimento do cliente);
- desenhos e cotações antigas são buscados à mão, em WhatsApp, e-mail e na memória do dono;
- atrasos de parceiros sem histórico e follow-up irregular.

Fora do escopo do primeiro ciclo: multiempresa, assinatura, portal de cliente, integração automática com o sistema fiscal, conciliação bancária, centro de custos, DRE, previsão estatística de demanda, otimização de PCP, múltiplos depósitos complexos.

## 2. Glossário

**Empresa / tenant**: a Express Usinagem, dona do ERP e única empresa atendida nesta fase. "Empresa" nunca quer dizer o comprador.

**Cliente**: pessoa jurídica que compra da Express. Tem contatos. Nunca é usuário do ERP.

**Parceiro**: terceiro contratado pela Express. Dois papéis, que podem coexistir na mesma empresa:
- *fornecedor de matéria-prima* (MP);
- *parceiro fabricante* (usinagem, têmpera, tratamento superficial, pintura e afins).

**Usuário**: pessoa da equipe da Express com conta individual. Contas compartilhadas são proibidas.

**Perfil**: conjunto de permissões. São 5: Admin, Comercial, Compras/Produção, Financeiro, Desenhista/Técnico.

**Permissão**: ação nomeada (`modulo.acao`) verificada no backend.

**Processo**: registro de uma demanda de cliente, desde a solicitação de cotação. É a própria solicitação na fase de cotação. Tem identificador interno imutável (UUID) e número exibido (ex.: `357-A`).

**Número exibido**: parte numérica sequencial mais a letra. O formato e a política são configuráveis. Nunca serve de chave.

**Letra**: marca da revisão comercial vigente do processo (A, B, C...). O evento que avança a letra está pendente de validação (ver §12).

**Revisão comercial**: versão de quantidades, preços, prazos e condições do processo. Cada proposta enviada congela uma revisão.

**Revisão técnica**: versão do desenho (dimensões, material, tolerâncias, CAD). Independe da comercial.

**Retrabalho**: correção de peça não conforme depois da execução. Tem inspeção, não conformidade, causa, custo e responsável. Independe das outras duas revisões.

**Processo derivado**: processo novo aberto para repetir uma peça já feita. Copia desenho e valores do processo de origem e guarda o vínculo "derivado de".

**Produto**: peça vendável. Nasce na aprovação da proposta, ligado a uma revisão técnica do desenho. Estoque e reservas ficam ancorados em *produto + revisão técnica*, nunca no processo.

**Compatibilidade de revisões**: declaração, feita por Técnico ou Admin, de que duas revisões técnicas do mesmo produto são intercambiáveis. Sem a declaração, revisões não compartilham disponibilidade.

**Solicitação / demanda**: quantidade que o cliente pediu ou previu. Não cria venda, receita, NF nem conta a receber.

**Pedido formal**: pedido de compra do cliente aceito pela Express. Fixa quantidades, preços, prazos e obrigações. Um processo tem N pedidos formais, e cada um abate a demanda do processo.

**Ordem de produção (OP)**: autorização interna para fabricar uma quantidade, com destino planejado a pedidos e/ou estoque.

**Etapa de fabricação**: operação da OP (MP, usinagem, têmpera, tratamento superficial, pintura, controle de qualidade). Configurável por processo, parceiro e sequência. Pode rodar em paralelo.

**Lote**: quantidade física identificada por produto, revisão técnica, origem (OP), local, situação de qualidade e custo.

**Em processo**: peça ainda em fabricação, inclusive no parceiro. Não é estoque.

**Alocação**: destinação de quantidade de uma OP a um item de pedido ou ao estoque.

**Reserva firme**: quantidade de um lote vinculada a item de pedido formal. Nasce na liberação da qualidade, a partir da alocação.

**Reserva estratégica**: quantidade separada para um cliente sem pedido formal. Decisão exclusiva do Admin.

**Programação de entrega**: plano de datas e quantidades por item de pedido. Não move estoque nem saldo.

**Remessa**: saída física documentada de itens de um pedido.

**Aceite**: confirmação do cliente de quantidade recebida e aceita. É evento separado da remessa.

**NF registrada**: nota fiscal real, emitida fora do ERP, registrada e vinculada a remessas e itens.

**Título**: conta a pagar (AP) ou a receber (AR), com parcelas e baixas.

## 3. Precedência e histórico das fontes

Ordem de precedência (a de cima vence): decisões do brainstorm de 2026-10-24 → adendo V2.3 → adendo V2.2 → dossiê v2.0 → registro v1.0 → `apps/usinagem/CLAUDE.md` antigo.

| Versão | Contribuição | Substituído depois |
|---|---|---|
| v1.0 | Entrevistas, fluxo de referência, 6 macroestados, servidor local de desenhos, NF no sistema fiscal externo | 4 usuários fixos; AP/AR fora da v1; margem para o Financeiro; upload obrigatório de CAD; Supabase/Vercel obrigatórios; "retrabalho incrementa a letra" |
| v2.0 | 5 perfis, AP/AR operacional, sigilo de margem, três revisões independentes, proposta em PDF, Postgres próprio, roadmap 0 a 7 | Máquina de estados única (V2.2) |
| V2.2 | Entregas parciais, programação por item, três eixos de estado independentes, saldos separados | Leitura ambígua do exemplo "20 com pedido de 5" (V2.3) |
| V2.3 | Demanda contra pedido formal, produção excedente, estoque livre / reserva firme / reserva estratégica, 4 cenários, invariantes de estoque | Pontos respondidos no brainstorm (§12) |

Divergências resolvidas pelo brainstorm:
- **Estoque livre**: `fisico_elegivel` já exclui bloqueios. A fórmula não subtrai bloqueios uma segunda vez (§6.3).
- **Peça no parceiro**: é "em processo", nunca estoque. O cenário V2.3 "parceiro guarda 20 peças" vira "20 em processo no parceiro, estoque de acabados 0".
- **Validade de reserva estratégica**: nunca expira sozinha (§6.4).
- **Local do estoque físico**: sempre na Express.

## 4. Modelo de domínio

Convenções valem para todas as tabelas:
- PK `id uuid`, nunca reutilizada.
- `criado_em`, `criado_por`, `atualizado_em`.
- Dinheiro em centavos inteiros (`bigint`), nunca float. Percentual em pontos-base inteiros.
- Quantidade em inteiro na unidade do item. Unidade fracionária (kg, m) fica para quando aparecer.
- Nada é apagado fisicamente em registro de negócio: cancelar, estornar e substituir mantêm o histórico.

### 4.1 Núcleo
- `usuarios` (nome, e-mail, ativo, perfil_id)
- `perfis` (5 fixos)
- `permissoes` (catálogo fixo em código; flag `travada_admin`)
- `perfil_permissoes` (perfil × permissão; editável pelo Admin, exceto as travadas)
- `eventos_auditoria` (autor, operação, entidade, entidade_id, antes, depois, justificativa, data/hora). Só recebe insert.
- `configuracoes` (numeração e letra, etapas padrão, modelos de proposta)
- `chaves_idempotencia` (chave única, operação, resultado)

### 4.2 Comercial e processos
- `clientes`, `contatos_cliente`
- `processos` (número, letra vigente, cliente, situação, `derivado_de_processo_id` opcional)
- `revisoes_comerciais` (processo, letra, estado `rascunho | preco_pendente | precificada | enviada | aprovada | recusada | substituida`, condições, validade, prazo, pagamento, impostos/frete, observações, quem precificou, quem aprovou)
- `itens_revisao` (revisão, descrição, quantidade, unidade, revisão técnica referenciada, preço unitário em centavos)
- `custos_estimados_item` (item, origem: cotação de fornecedor ou manual; campo de custo)
- `propostas` (revisão comercial congelada, PDF gerado, data de envio, destinatário)

### 4.3 Engenharia
- `desenhos` (código, descrição, processo de origem)
- `revisoes_tecnicas` (desenho, rótulo, caminho de rede, metadados do arquivo, aprovado_por, liberado_para_parceiro_em). O ERP guarda caminho e metadados, nunca o arquivo.
- `compatibilidades_revisao` (revisão A, revisão B, declarado_por, motivo)
- `produtos` (nasce na aprovação; revisão técnica vigente)

### 4.4 Parceiros e compras
- `parceiros` (papéis: fornecedor MP e/ou fabricante; contatos)
- `cotacoes_fornecedor` (processo/item, parceiro, preço, prazo, validade, escolhida)
- `compras`, `itens_compra`, `recebimentos_mp` (fatia 2)

### 4.5 Pedido formal e demanda (fatia 2)
- `pedidos_cliente` (processo, número externo do cliente, data, situação)
- `pedido_itens` (pedido, produto + revisão técnica, quantidade contratada, preço, prazo)
- `vinculos_demanda_pedido` (item da revisão comercial ↔ item de pedido, quantidade). Impede contar a mesma demanda duas vezes.
- `aditivos_pedido` (mudança de quantidade ou cancelamento autorizado, com motivo)

### 4.6 Produção (fatia 2 e 4)
- `ordens_producao`, `ordem_etapas` (parceiro, prazo, responsável, status, custo previsto/real)
- `alocacoes_producao` (OP → pedido_item ou estoque)
- `autorizacoes_excedente` (OP, quantidade acima do pedido, motivo, custo estimado, Admin)
- `lotes` (produto, revisão técnica, OP, quantidade, situação de qualidade)
- `inspecoes`, `nao_conformidades`, `retrabalhos`
- `custos_lote` (custo por lote/unidade, `metodo_custeio` como ponto de extensão; nada apropriado ao custo da venda até o Admin definir a regra)

### 4.7 Estoque (fatia 4)
- `movimentos_estoque` (lote, tipo, quantidade com sinal, documento, autor, `chave_idempotencia` única)
- `reservas` (lote, produto + revisão, cliente, tipo `firme | estrategica`, pedido_item obrigatório se firme, quantidade, data de revisão opcional, motivo, autor, status)
- `reserva_movimentos` (criar, consumir, converter, liberar, transferir; atômico e auditado)
- `ocorrencias_estoque` (divergência física; o ajuste é movimento separado, feito pelo Admin)

### 4.8 Entregas (fatia 3)
- `programacoes_entrega` (pedido, versão, autor, situação). Reprogramar cria versão nova e preserva a anterior.
- `programacao_itens` (pedido_item, data, quantidade, prioridade, destino)
- `remessas`, `remessa_itens` (expedido, recebido, aceito, recusado; `chave_idempotencia`)
- `comprovantes`, `ocorrencias_entrega` (atraso, recusa, devolução, divergência)

### 4.9 Fiscal e financeiro (fatia 2)
- `documentos_fiscais` (número, série, data, valor, chave de acesso; única por chave/número+série, para não duplicar no reprocessamento)
- `documento_fiscal_itens` (NF ↔ remessa_item / pedido_item, quantidade)
- `titulos_pagar`, `titulos_receber`, `parcelas`, `baixas` (baixa parcial e estorno sem apagar histórico)

## 5. Estados

Três eixos independentes, sem estado único de entrega:

| Eixo | Valores |
|---|---|
| Comercial (processo) | `cotacao_aberta → cotacao_enviada → aprovado → parcialmente_contratado / contratado`; `perdido`, `cancelado`, `suspenso` |
| Produção (por item/OP) | `nao_iniciada → em_execucao → liberada`; `com_bloqueio` |
| Entrega (por item de pedido) | `nao_programada → programada → parcialmente_entregue → entregue`; `entrega_atrasada` (derivado de data vencida com saldo) |

Estado da revisão comercial: `rascunho → preco_pendente → precificada → enviada → aprovada | recusada | substituida`.
- O Comercial cria a revisão como rascunho, sem preço.
- "Preço pendente" é estado explícito, mostrado em fila para o Admin.
- Só o Admin passa para `precificada`.
- PDF e envio de proposta só existem a partir de `precificada`.

Processo:
- `processo.cancelar`: exige motivo.
- `processo.fechar`: exige conciliação de saldo comercial, quantidade aceita, devoluções, NF e critérios do cliente. Nunca é automático na primeira remessa.
- `processo.reabrir`: exige motivo e gera evento de auditoria.

## 6. Regras e invariantes

### 6.1 Demanda e pedido
- `formalizado = soma líquida dos pedido_itens vinculados (com aditivos e cancelamentos)`.
- `nao_formalizado = max(0, demanda - formalizado)`, com a vinculação garantindo que nada é contado duas vezes.
- Demanda nunca gera produção, NF, receita nem AR automaticamente.

### 6.2 Entrega
- `saldo_entrega = contratado_liquido - aceito_liquido`, contando devoluções e ajustes aprovados.
- Programação e remessa expedida sem aceite não mudam `aceito_liquido`.
- Aceite acima do saldo exige aditivo formal. Nunca esconder o excesso.
- Expedição baixa o físico e consome a reserva firme na mesma transação.
- Remessa e recebimento são idempotentes: a mesma chave repetida devolve o resultado anterior sem mexer em saldo.
- Aceite e NF são eventos separados. Uma NF pode cobrir várias remessas e uma remessa pode ter várias NFs.

### 6.3 Estoque
- `fisico_total` = entradas de lotes + retornos − saídas efetivas ± ajustes, por produto + revisão técnica, só na Express.
- `fisico_elegivel` = `fisico_total` − quantidade em `aguardando_inspecao | rejeitado | quarentena`.
- `estoque_livre` = `fisico_elegivel − reservas_firmes_ativas − reservas_estrategicas_ativas`.
- Uma unidade nunca está livre e reservada ao mesmo tempo. A soma das reservas ativas de um lote nunca passa da quantidade elegível dele: violar isso é erro, não estoque negativo.
- Reservar acima do livre é recusado. Duas reservas concorrentes nunca juntas passam do livre (lock de linha no lote ou constraint).
- OP em andamento, MP e peça no parceiro não são estoque.
- Revisões técnicas sem compatibilidade declarada nunca somam disponibilidade.

### 6.4 Reservas
- Reserva firme nasce na liberação da qualidade, a partir da alocação da OP ao pedido_item.
- Reserva estratégica: só Admin cria; data de revisão opcional que gera alerta; nunca expira sozinha; só Admin libera. Não gera pedido, receita, despesa nem NF.
- Converter estratégica em firme (pedido novo do mesmo cliente): reduz a estratégica e aumenta a firme, sem criar peça.
- Liberar reserva firme (`reserva_firme.liberar`, travada no Admin) e transferir reserva entre clientes exigem motivo e auditoria.

### 6.5 Produção excedente e custo
- Fabricar acima do pedido formal exige `producao_excedente.autorizar` (Admin), com motivo, quantidade, custo estimado e finalidade.
- O custo é registrado por lote. O custo do lote inteiro nunca é lançado como custo da venda das unidades faturadas. A regra de apropriação fica pendente com o Admin (ponto de extensão `metodo_custeio`).

### 6.6 Fiscal e financeiro
- O ERP não emite NF: registra a NF real e a vincula a remessas e itens.
- Registrar a mesma NF de novo não duplica documento nem título (unicidade por chave de acesso ou número+série).
- AR nasce só de evento financeiro válido conforme regra aprovada. Demanda, produção para estoque e reserva estratégica nunca geram recebível.
- Baixa parcial, estorno, reajuste e cancelamento preservam o histórico.

### 6.7 Numeração
- O número exibido é gerado em transação, é único e segue a política em `configuracoes`.
- A letra muda junto com a revisão comercial vigente. A regra final de avanço está pendente.
- Processo derivado recebe número novo e guarda o vínculo de origem.

## 7. Perfis, permissões e sigilo

### 7.1 Princípios
- RBAC por ação, verificado no servidor em toda consulta, comando, exportação, anexo e alteração. Esconder na UI é conveniência, nunca a barreira.
- O Admin tem todas as permissões e pode corrigir qualquer registro.
- As permissões travadas são só do Admin. Ficam fora da tela de atribuição e o backend recusa concedê-las a outro perfil.
- Seed de desenvolvimento: 5 usuários fictícios, um por perfil, claramente marcados como fictícios. Uso real nesta fase: só um Admin.

### 7.2 Matriz inicial

✓ = padrão do seed. "Sim" em "Travada" = só Admin.

| Permissão | Admin | Comercial | Compras/Produção | Financeiro | Desenhista/Técnico | Travada |
|---|---|---|---|---|---|---|
| processo.ver | ✓ | ✓ | ✓ | ✓ | ✓ | |
| processo.criar | ✓ | ✓ | | | | |
| processo.editar | ✓ | ✓ | | | | |
| processo.cancelar | ✓ | ✓ | | | | |
| processo.fechar | ✓ | ✓ | | | | |
| processo.reabrir | ✓ | | | | | Sim |
| cliente.gerenciar | ✓ | ✓ | | | | |
| revisao_comercial.criar | ✓ | ✓ | | | | |
| proposta.gerar_pdf | ✓ | ✓ | | | | |
| proposta.enviar | ✓ | ✓ | | | | |
| proposta.registrar_aprovacao | ✓ | ✓ | | | | |
| preco.ver | ✓ | ✓ | | ✓ (só AR) | | |
| preco.definir | ✓ | | | | | Sim |
| parceiro.gerenciar | ✓ | | ✓ | | | |
| cotacao_fornecedor.registrar | ✓ | | ✓ | | | |
| custo.ver | ✓ | | ✓ | ✓ (só AP) | | |
| margem.ver | ✓ | | | | | Sim |
| custo_lote.ver | ✓ | | | | | Sim |
| estoque.valorizacao.ver | ✓ | | | | | Sim |
| desenho.gerenciar | ✓ | | | | ✓ | |
| revisao_tecnica.criar | ✓ | | | | ✓ | |
| compatibilidade.declarar | ✓ | | | | ✓ | |
| pedido_formal.registrar | ✓ | ✓ | | | | |
| producao.registrar | ✓ | | ✓ | | | |
| compra.registrar | ✓ | | ✓ | | | |
| recebimento.registrar | ✓ | | ✓ | | | |
| alocacao.registrar | ✓ | | ✓ | | | |
| producao_excedente.autorizar | ✓ | | | | | Sim |
| retrabalho.abrir | ✓ | | ✓ | | ✓ | |
| qualidade.inspecionar | ✓ | | | | ✓ | |
| qualidade.liberar | ✓ | | | | ✓ | |
| nf.registrar | ✓ | | | ✓ | | |
| titulo_pagar.operar | ✓ | | | ✓ | | |
| titulo_receber.operar | ✓ | | | ✓ | | |
| entrega.programar | ✓ | ✓ | | | | |
| entrega.reprogramar | ✓ | ✓ | | | | |
| entrega.expedir | ✓ | | ✓ | | | |
| entrega.confirmar_aceite | ✓ | ✓ | | | | |
| devolucao.registrar | ✓ | ✓ | | | | |
| estoque.ver (só quantidades) | ✓ | ✓ | ✓ | ✓ | ✓ | |
| estoque.registrar_ocorrencia | ✓ | | ✓ | | ✓ | |
| estoque.ajustar | ✓ | | | | | Sim |
| reserva_estrategica.criar | ✓ | | | | | Sim |
| reserva_estrategica.liberar | ✓ | | | | | Sim |
| reserva_firme.liberar | ✓ | | | | | Sim |
| reserva.transferir | ✓ | | | | | Sim |
| dados.exportar | ✓ | | | | | Sim |
| configuracao.gerenciar | ✓ | | | | | Sim |
| usuarios.gerenciar | ✓ | | | | | Sim |
| permissoes.gerenciar | ✓ | | | | | Sim |
| auditoria.ver | ✓ | | | | | Sim |

Notas da matriz:
- `retrabalho.abrir` e `processo.reabrir` não vieram com perfil definido. Padrão adotado: retrabalho para Compras/Produção e Técnico (quem vê a não conformidade); reabrir travado no Admin. Revisar se discordar.
- A reserva firme não tem permissão de criação: nasce sozinha na liberação da qualidade.
- `dados.exportar` fica travada no Admin enquanto as exportações não passam pela matriz de campos (§7.3). Quando passarem, pode virar atribuível.
- `configuracao.gerenciar` cobre numeração e letra, etapas padrão e modelos de proposta.

### 7.3 Sigilo por campo
- Compras/Produção vê custo, nunca preço de venda.
- Comercial vê preço, nunca custo.
- Financeiro: `custo.ver` só em AP e `preco.ver` só em AR. Opera título a título, sem tela, filtro, exportação ou soma que cruze AP e AR do mesmo processo ou pedido. A serialização de títulos para o Financeiro não inclui vínculo de processo (pendente de validação, §12).
- Só o Admin vê custo e preço lado a lado, margem, custo de lote e valorização de estoque.
- O sigilo é aplicado na serialização do servidor: o campo proibido não sai na resposta. Não basta esconder na tela.
- Teste obrigatório: o Financeiro recebe 403 em margem, custo de lote e valorização de estoque, e nenhum agregado ao alcance dele permite deduzir margem.

### 7.4 Invariantes de segurança
- A última conta Admin ativa não pode ser desativada nem perder permissões.
- `usuarios.gerenciar` e `permissoes.gerenciar` exigem reautenticação recente.
- Toda mudança em `perfil_permissoes` e em `usuarios` gera evento de auditoria com antes e depois.
- Auditar no mínimo: preço e margem, parceiro, revisões de desenho, mudança de status, NF, pagamentos, reservas, autorização de excedente e ajuste de estoque.
- Depois da entrega do sistema, o Admin é o dono da Express. O acesso de suporte da Noetrix é separado do Admin, temporário, nominal e auditado.

## 8. Arquitetura técnica

- **App**: Next.js 16 (App Router; `proxy.ts` no lugar de `middleware.ts`; ler `node_modules/next/dist/docs` antes de codar), React 19, TypeScript estrito. Monólito modular em `apps/usinagem`.
- **UI**: Tailwind 4, shadcn/ui, React Hook Form + Zod (o mesmo schema Zod valida no cliente e na Server Action).
- **Dados**: PostgreSQL 16 em Docker local, Drizzle ORM.
  - Migrations SQL versionadas em `apps/usinagem/drizzle/`.
  - Geradas por `drizzle-kit` pelo responsável humano no terminal, nunca editadas por agente.
  - Aplicadas só no Postgres local.
- **Testes**: Vitest. Regras de domínio em funções puras, sem banco.
- **Autenticação**: Better Auth (adapter Drizzle, e-mail e senha, sessão no Postgres, sem cadastro público) entra na etapa de identidade. Até lá, a fundação usa um seletor dos 5 usuários fictícios, ativo só com `NODE_ENV=development`, que alimenta o mesmo `requirePermissao()` do backend.
- **Organização por domínio**:
  - `lib/dominio/<modulo>/` guarda funções puras e tipos;
  - `lib/servidor/` guarda acesso a dados (`server-only`);
  - `app/(erp)/<modulo>/` guarda as rotas;
  - `components/` guarda os componentes compartilhados.
- **Identidade visual**:
  - vermelho `#A81915`;
  - grafite `#191919` / `#1A1A1A`;
  - cobre `#B5652E`;
  - fundo `#EEF0EE` com grid blueprint de 28 px;
  - IBM Plex Sans e IBM Plex Mono;
  - pt-BR.
  - É diretriz inicial: o layout final será definido no `/impeccable shape`.
- **Desenhos**: o ERP guarda caminho de rede e metadados. Nenhum upload de CAD.
- **Proposta PDF**:
  - Conteúdo: cabeçalho e logo, número e letra, dados do cliente, itens, quantidade, unidade, descrição, preço unitário, totais, validade, prazo, pagamento, impostos e frete conforme regra, e observações.
  - O layout é validado com exemplos reais fora do repositório.

## 9. Entregas por fatias

O modelo acima cobre o sistema inteiro. A implementação vai por PRs:

| PR | Conteúdo |
|---|---|
| **0. Fundação** (este ciclo) | Layout, navegação, componentes base, contratos TS de todo o domínio, Docker + Drizzle com schema de núcleo e processo, seed fictício, RBAC puro + `requirePermissao()` + seletor de perfil de dev, funções puras e testes dos 4 cenários V2.3 |
| 1. Comercial | Clientes, processos, revisão comercial com preço pendente, itens, parceiros, cotações de fornecedor, desenhos por caminho, proposta PDF |
| 2. Execução e financeiro | Pedido formal e vínculo de demanda, OP e etapas, compras e recebimentos, qualidade, NF registrada, AP/AR, margem Admin; Better Auth |
| 3. Entregas | Programação versionada, remessas, aceite, devoluções, reprogramação |
| 4. Estoque | Lotes, movimentos, reservas firme e estratégica, excedente, ocorrências e ajustes |

O schema de estoque só se estabiliza depois que os testes puros dos 4 cenários passam.

### 9.1 Escopo exato do PR 0 (fundação)
1. Ajustes de tooling: script `typecheck` e `test` no app, rule de banco do usinagem, `apps/usinagem/drizzle/**` protegido no hook, fontes no `.gitignore`.
2. Shell visual (resultado do `/impeccable shape`): sidebar grafite, topo, grid blueprint, tokens, fontes, pt-BR. Rotas: painel e lista de processos (só leitura do seed) e placeholders das outras áreas.
3. `lib/dominio`:
   - tipos de todas as entidades da §4;
   - funções puras de demanda, saldo de entrega e estoque/reservas;
   - catálogo de permissões e matriz padrão;
   - `pode(perfil, permissao)`;
   - serializadores com sigilo por campo.
4. Docker Compose com Postgres 16 local. Schema Drizzle de núcleo e processo: `usuarios`, `perfis`, `permissoes`, `perfil_permissoes`, `eventos_auditoria`, `configuracoes`, `clientes`, `processos`, `revisoes_comerciais`, `itens_revisao`.
5. Seed fictício idempotente (5 usuários, clientes e processos marcados como fictícios).
6. Vitest cobrindo as regras abaixo.

## 10. Testes de aceite

Cenários V2.3 (PR 0, funções puras):
1. Pedido de 20 com remessas 5+5+10: formalizado 20; o saldo só muda com aceite; entregue após 20 aceitas; remessa expedida sem aceite não muda o saldo.
2. Pedido de 20 com entrega única de 20: 20 aceitas, saldo 0.
3. Demanda de 20 com pedido formal de 5: 5 contratadas, 15 não formalizadas, nenhuma NF ou AR. Novos pedidos de 5 e de 10 sobre a mesma demanda: contratado 20, não formalizado 0, sem dupla contagem.
4. Pedido de 20 e produção de 40, entregando 20: físico 20, livre ou reservado conforme decisão do Admin, sem receita extra.
   Combinado: demanda 20, pedido 5, produção 40, entrega 5 → físico 35, estratégica 15, livre 20, contratado 5.
   Variações: reservar as 35 dá livre 0; nenhuma reserva dá livre 35.

Regras também testadas no PR 0:
- reserva acima do livre é recusada;
- duas reservas que juntas passam do livre: a segunda é recusada;
- converter estratégica em firme não cria peça;
- lote aguardando inspeção não entra no elegível;
- revisões incompatíveis não somam disponibilidade;
- a mesma remessa aplicada duas vezes (mesma chave) não muda o saldo;
- 20 peças em processo no parceiro dão estoque de acabados 0.

Permissões (PR 0):
- o Financeiro recebe "negado" em `margem.ver`, `custo_lote.ver` e `estoque.valorizacao.ver`;
- o serializador do Financeiro não emite custo em AR, preço em AP, nem vínculo de processo;
- permissão travada não pode ser concedida a outro perfil;
- a última conta Admin não pode ser desativada nem rebaixada;
- PDF e envio de proposta exigem revisão `precificada`.

Ficam para as fatias seguintes (V2.2 e V2.3): replanejamento cria versão nova com autor; devolução de 1 ou 2 peças passa por inspeção antes de voltar a ser elegível; perfil sem permissão não altera cronograma nem confirma aceite; reatribuição de reserva exige autorização e preserva lotes.

## 11. Fora de escopo
Integração com o sistema fiscal, portal de cliente, multiempresa, conciliação bancária, centro de custos, DRE, notificações externas e upload de arquivos CAD.

## 12. Pendências para validar com o Admin (dono da Express)
1. Evento que avança a letra (A → B) e política de numeração.
2. Quem inspeciona e libera na qualidade: Técnico ou Compras/Produção.
3. Quem reprograma entregas.
4. Se o Financeiro vê o processo nos títulos.
5. Se o Comercial recebe um preço mínimo definido pelo Admin.
6. Método de custeio da produção excedente e apropriação ao custo da venda.
7. Política de devolução e de faturamento parcial no sistema fiscal.
8. Se o comprovante de entrega é obrigatório e quais tolerâncias de quantidade valem.
9. Fidelidade do layout do PDF aos exemplos 357-A e 358-A.
10. Condições para liberar reserva firme sem cancelar o pedido.
