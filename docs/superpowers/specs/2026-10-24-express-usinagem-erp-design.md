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

**Número exibido**: parte numérica sequencial do processo mais a letra da revisão comercial vigente (ex.: 357-A). O formato e a política são configuráveis. Nunca serve de chave.

**Letra**: rótulo de exibição da revisão comercial (A, B, C... até duas maiúsculas). Não ordena nada: a revisão vigente é a de maior `sequencia` (inteiro), porque em ordem de texto "AA" viria antes de "B". O processo não guarda a letra. O evento que avança a letra está pendente de validação (ver §12).

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

**RFQ**: pedido de cotação enviado a um parceiro para um item do processo, com prazo de resposta.

**Status macro**: estado único do processo para o painel, derivado dos três eixos e dos documentos (§5.2). Não é gravado; é calculado.

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
- `criado_em` e `atualizado_em`: `timestamptz NOT NULL DEFAULT now()`. `criado_por`: FK para `usuarios`, nullable, sem ação referencial (NO ACTION). Onde `criado_por` já nasceu obrigatório (processos, revisões comerciais), continua NOT NULL.
- Exceções documentadas:
  - tabelas append-only (`eventos_auditoria`, `movimentos_estoque`, `baixas`) não têm `atualizado_em`, porque não são alteradas; `eventos_auditoria` usa `autor_id` no lugar de `criado_por`;
  - `perfil_permissoes` tem só `criado_em`: a linha é concedida ou removida, nunca editada;
  - `perfis`, `permissoes` e `perfil_permissoes` não têm `criado_por`: são catálogo, semeado pelo sistema;
  - em `usuarios`, `criado_por` é nulo para o primeiro Admin (não há quem o crie).
- Tabela append-only não pode ter FK com `ON DELETE` ou `ON UPDATE` em `CASCADE`, `SET NULL` ou `SET DEFAULT`. A ação referencial roda com o privilégio da dona da tabela e alteraria ou apagaria linhas que a aplicação não pode tocar. Um teste reprova qualquer FK assim.
- Datas e horas em `timestamptz`, gravadas em UTC e exibidas em `America/Sao_Paulo`.
- Tabela de registro editável tem `versao integer` para concorrência otimista. A atualização exige a versão lida; se outra pessoa salvou antes, a operação falha com conflito e nada é sobrescrito.
- Dinheiro em centavos inteiros (`bigint`), nunca float. Percentual em pontos-base inteiros.
- Quantidade de peça vendável (item de revisão, pedido, OP, lote, reserva, remessa): inteira.
- Quantidade de matéria-prima e de compras (itens de compra, recebimentos de MP): `NUMERIC(14,3)`, trafegada como string decimal no TypeScript, nunca como float.
- Nada é apagado fisicamente em registro de negócio: cancelar, estornar e substituir mantêm o histórico.

### 4.1 Núcleo
- `usuarios` (nome, e-mail, e-mail verificado, ativo, perfil_id, fictício, versão). Tabela de usuário do Better Auth, mapeada por `fields` (PR 1D).
- `sessoes`, `contas`, `verificacoes` (tabelas do Better Auth com nomes mapeados; senha com hash só em `contas`) (PR 1D)
- `perfis` (5 fixos)
- `permissoes` (catálogo fixo em código; flag `travada_admin`)
- `perfil_permissoes` (perfil × permissão; editável pelo Admin, exceto as travadas)
- `eventos_auditoria` (autor, operação, entidade, `entidade_id` em texto, antes, depois, justificativa, data/hora). Só recebe insert. `entidade_id` é texto porque configurações, perfis e permissões têm chave textual; UUIDs entram como texto. Índice por (entidade, entidade_id, criado_em).
- `configuracoes` (letra, etapas padrão, modelos de proposta)
- `sequencias_numeracao` (nome, próximo número). Número inicial configurável pelo Admin para continuar a sequência já usada pela empresa.
- `chaves_idempotencia` (chave única, operação, resultado)

### 4.2 Comercial e processos
- `clientes`, `contatos_cliente`
- `processos` (número, cliente, situação, `derivado_de_processo_id` opcional). Sem letra: ela vem da revisão vigente.
- `revisoes_comerciais` (processo, `sequencia` inteira > 0 e única por processo, cuja maior define a vigente; letra de 1 a 2 maiúsculas, única por processo, só rótulo; estado `rascunho | preco_pendente | precificada | enviada | aprovada | recusada | substituida`, condições, validade, prazo, pagamento, impostos/frete, observações, quem precificou, quem aprovou)
- `itens_revisao` (revisão, descrição, quantidade, unidade, revisão técnica referenciada, preço unitário em centavos)
- `custos_estimados_item` (item, origem: cotação de fornecedor ou manual; campo de custo)
- `propostas` (revisão comercial congelada, PDF gerado, data de envio, destinatário)

### 4.3 Engenharia
- `desenhos` (código, descrição, processo de origem)
- `revisoes_tecnicas` (desenho, rótulo, caminho de rede, metadados do arquivo, aprovada_por, aprovada_em, liberada_parceiro_por, liberada_parceiro_em). O ERP guarda caminho e metadados, nunca o arquivo. Aprovar (`revisao_tecnica.aprovar`) e liberar para parceiro (`revisao_tecnica.liberar_parceiro`) são atos separados e auditados; só revisão aprovada pode ser liberada.
- `compatibilidades_revisao` (revisão A, revisão B, declarado_por, motivo)
- `produtos` (nasce na aprovação; revisão técnica vigente)

### 4.4 Parceiros e compras
- `parceiros` (papéis: fornecedor MP e/ou fabricante; contatos)
- `rfqs` (processo, item, parceiro, enviada_em, prazo_resposta, respondida_em, status `rascunho | enviada | respondida | sem_resposta | cancelada`). Enviar exige `rfq.enviar`. Vencido o prazo sem resposta, a RFQ aparece como atrasada.
- `cotacoes_fornecedor` (RFQ de origem, processo/item, parceiro, preço, prazo, validade, escolhida)
- `compras`, `itens_compra` (quantidade `NUMERIC(14,3)`), `recebimentos_mp` (quantidade `NUMERIC(14,3)`, `chave_idempotencia`) (PR 3)

### 4.5 Pedido formal e demanda (PR 3)
- `pedidos_cliente` (processo, número externo do cliente, data, situação)
- `pedido_itens` (pedido, produto + revisão técnica, quantidade contratada, preço, prazo)
- `vinculos_demanda_pedido` (item da revisão comercial ↔ item de pedido, quantidade). Impede contar a mesma demanda duas vezes.
- `aditivos_pedido` (mudança de quantidade ou cancelamento autorizado, com motivo)

### 4.6 Produção (PR 3 e PR 5)
- `ordens_producao`, `ordem_etapas` (parceiro, responsável, status, prazo prometido pelo parceiro, data real de conclusão, avaliação do parceiro de 1 a 5 com comentário, custo previsto/real). O atraso do parceiro é derivado de prazo prometido contra conclusão real e alimenta o histórico do parceiro.
- `alocacoes_producao` (OP → pedido_item ou estoque)
- `autorizacoes_excedente` (OP, quantidade acima do pedido, motivo, custo estimado, Admin)
- `lotes` (produto, revisão técnica, OP, quantidade, situação de qualidade)
- `inspecoes`, `nao_conformidades`, `retrabalhos`
- `custos_lote` (custo por lote/unidade, `metodo_custeio` como ponto de extensão; nada apropriado ao custo da venda até o Admin definir a regra)

### 4.7 Estoque (PR 5)
- `movimentos_estoque` (lote, tipo, quantidade com sinal, documento, autor, `chave_idempotencia` única)
- `reservas` (lote, produto + revisão, cliente, tipo `firme | estrategica`, pedido_item obrigatório se firme, quantidade, data de revisão opcional, motivo, autor, status `ativa | comprometida_bloqueio | consumida | liberada`)
- `reserva_movimentos` (criar, consumir, converter, liberar, transferir; atômico e auditado)
- `ocorrencias_estoque` (divergência física; o ajuste é movimento separado, feito pelo Admin)

### 4.8 Entregas (PR 4)
- `programacoes_entrega` (pedido, versão, autor, situação). Reprogramar cria versão nova e preserva a anterior.
- `programacao_itens` (pedido_item, data, quantidade, prioridade, destino)
- `remessas`, `remessa_itens` (expedido, recebido, aceito, recusado; `chave_idempotencia`)
- `comprovantes`, `ocorrencias_entrega` (atraso, recusa, devolução, divergência)

### 4.9 Fiscal e financeiro (PR 3)
- `documentos_fiscais` (número, série, data, valor, chave de acesso; única por chave/número+série, para não duplicar no reprocessamento)
- `documento_fiscal_itens` (NF ↔ remessa_item / pedido_item, quantidade)
- `titulos_pagar`, `titulos_receber`, `parcelas`, `baixas` (baixa parcial e estorno sem apagar histórico)

## 5. Estados

### 5.1 Eixos

Três eixos independentes, sem estado único de entrega:

| Eixo | Valores |
|---|---|
| Comercial (processo) | `cotacao_aberta → cotacao_enviada → aprovado → parcialmente_contratado / contratado → fechado`; `fechado → reaberto` (volta ao ciclo); `perdido`, `cancelado`, `suspenso` |
| Produção (por item/OP) | `nao_iniciada → em_execucao → liberada`; `com_bloqueio` |
| Entrega (por item de pedido) | `nao_programada → programada → parcialmente_entregue → entregue`; `entrega_atrasada` (derivado de data vencida com saldo) |

Estado da revisão comercial: `rascunho → preco_pendente → precificada → enviada → aprovada | recusada | substituida`.
- O Comercial cria a revisão como rascunho, sem preço.
- "Preço pendente" é estado explícito, mostrado em fila para o Admin.
- Só o Admin passa para `precificada`.
- PDF e envio de proposta só existem a partir de `precificada`.

Processo:
- **Cancelar** sempre exige motivo e gera evento de auditoria.
  - Com `processo.cancelar`, só antes de existir pedido formal, compra ou ordem de produção ligada ao processo.
  - Depois disso, só o Admin cancela.
  - O backend confere essa condição; não basta a permissão.
- **Fechar** com `processo.fechar` só é permitido quando o sistema confirma a conciliação:
  - saldo de entrega zerado em todos os itens de pedido;
  - aceites registrados;
  - NF registrada para o que foi aceito;
  - nenhuma devolução pendente.
- Sem conciliação, só o Admin fecha, com justificativa obrigatória e evento de auditoria. Fechar nunca é automático na primeira remessa.
- **Reabrir** (só Admin) leva `fechado` para `reaberto`, exige motivo e gera evento de auditoria. Um processo reaberto volta a ter o status macro calculado pelos documentos, como antes do fechamento.

### 5.2 Status macro (painel por status)

Calculado, nunca gravado, a partir dos três eixos e dos documentos. A primeira regra que casar vence:

| Ordem | Status macro | Condição |
|---|---|---|
| 1 | Cancelado / Perdido / Suspenso | situação comercial correspondente (fora das colunas do painel) |
| 2 | Fechado | situação comercial `fechado` |
| 3 | NF emitida | há pedido formal, saldo de entrega zero em todos os itens e toda quantidade aceita tem NF registrada |
| 4 | Pronto para entrega | há pedido formal com saldo e a reserva firme ativa cobre o saldo de todos os itens com saldo |
| 5 | Em fabricação | há pedido formal ativo |
| 6 | Cotação enviada | a revisão comercial vigente está `enviada` |
| 7 | Cotação aberta | qualquer outro caso (inclui rascunho e preço pendente) |

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
- **Bloqueio de lote com reserva ativa**: quando a qualidade bloqueia (quarentena ou rejeição) um lote que tem reservas ativas, essas reservas passam a `comprometida_bloqueio`.
  - A quantidade delas aparece como **déficit** na posição de estoque e num alerta para o Admin.
  - Nada é liberado nem realocado em silêncio. A reserva não volta para o livre e não é transferida para outro lote sem ato do Admin.
  - Se o lote voltar a ser liberado, as reservas comprometidas voltam a `ativa`.
  - Se o lote for rejeitado, o Admin decide: realocar para outro lote (sujeito ao livre) ou liberar a reserva.

### 6.5 Produção excedente e custo
- Fabricar acima do pedido formal exige `producao_excedente.autorizar` (Admin), com motivo, quantidade, custo estimado e finalidade.
- O custo é registrado por lote. O custo do lote inteiro nunca é lançado como custo da venda das unidades faturadas. A regra de apropriação fica pendente com o Admin (ponto de extensão `metodo_custeio`).

### 6.6 Fiscal e financeiro
- O ERP não emite NF: registra a NF real e a vincula a remessas e itens.
- Registrar a mesma NF de novo não duplica documento nem título (unicidade por chave de acesso ou número+série).
- AR nasce só de evento financeiro válido conforme regra aprovada. Demanda, produção para estoque e reserva estratégica nunca geram recebível.
- Baixa parcial, estorno, reajuste e cancelamento preservam o histórico.

### 6.7 Numeração
- O número exibido é gerado em transação por incremento atômico em `sequencias_numeracao`, é único e não se repete mesmo com geração concorrente.
- O número inicial é configurável (`configuracao.gerenciar`) para continuar a sequência já usada pela empresa. Só aceita valor maior que o maior número já usado.
- A letra exibida é a da revisão comercial vigente (maior `sequencia`). Uma revisão nova recebe a próxima `sequencia`. A regra final de quando nasce uma revisão nova (e portanto uma letra nova) está pendente.
- Processo derivado recebe número novo e guarda o vínculo de origem.

### 6.8 Dados e segurança
- Duas roles de banco:
  - **migração**: dona de todas as tabelas, com `CREATE` no schema `public` (cujo dono continua sendo `pg_database_owner`), roda DDL, usada só pelo `drizzle-kit migrate`;
  - **aplicação**: usada pelo app e pelo seed, só DML.
- A role de migração é dona de todas as tabelas; a role da aplicação não é dona de nenhuma e não cria tabelas.
- A role da aplicação não tem `UPDATE`, `DELETE` nem `TRUNCATE` em `eventos_auditoria`, `movimentos_estoque` e `baixas` (append-only). Correção de estoque ou de baixa é um novo registro de estorno, nunca `UPDATE`. A revogação vai numa migration custom gerada depois da que cria cada tabela. Um teste reprova qualquer uma das três que exista sem a revogação.
- FK que sai de tabela append-only nunca usa `CASCADE`, `SET NULL` nem `SET DEFAULT` (§4), porque a ação rodaria como dona da tabela e furaria a revogação.
- Toda Server Action e todo Route Handler passa por um wrapper de permissão com **deny by default**: sem permissão declarada, a chamada é recusada. Um teste falha se algum arquivo `"use server"` ou `route.ts` exportar função fora do wrapper.
- Concorrência otimista por `versao` (§4).

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
| rfq.enviar | ✓ | | ✓ | | | |
| cotacao_fornecedor.registrar | ✓ | | ✓ | | | |
| custo.ver | ✓ | | ✓ | ✓ (só AP) | | |
| margem.ver | ✓ | | | | | Sim |
| custo_lote.ver | ✓ | | | | | Sim |
| estoque.valorizacao.ver | ✓ | | | | | Sim |
| desenho.gerenciar | ✓ | | | | ✓ | |
| revisao_tecnica.criar | ✓ | | | | ✓ | |
| revisao_tecnica.aprovar | ✓ | | | | ✓ | |
| revisao_tecnica.liberar_parceiro | ✓ | | | | ✓ | |
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
- `processo.cancelar` e `processo.fechar` concedidas ao Comercial têm as condições do §5. Fora delas, só o Admin age.
- `retrabalho.abrir` para Compras/Produção e Técnico, e `processo.reabrir` travada no Admin: confirmados. `retrabalho.abrir`, `qualidade.inspecionar` e `qualidade.liberar` ficam como dado da matriz (atribuíveis pelo Admin, sem trava), porque o dono da qualidade ainda está pendente (§12).
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

Vazamentos laterais, todos bloqueados no servidor:
- **Histórico e auditoria**: outros perfis veem o evento (quem, quando, o quê), mas `antes` e `depois` saem sem os campos que o perfil não pode ver.
- **Ordenar, filtrar ou buscar por campo oculto**: recusado. A ordem de uma lista não pode revelar um valor que o perfil não vê.
- **Mensagens de erro**: nunca contêm valor de campo oculto nem dizem qual campo oculto causou a recusa. A recusa de consulta é uma mensagem genérica única.
- **Agregados**: soma, média, mínimo, máximo e contagem condicionada sobre campo oculto são recusados para o perfil, qualquer que seja o tamanho do grupo. Não há exceção para grupo grande, e um grupo de item único é tratado igual. Para o Financeiro, agregados de títulos não agrupam por processo ou pedido.
- **Exportações**: passam pelos mesmos serializadores. `dados.exportar` segue travada no Admin.
- **Processo derivado**: nasce com a revisão comercial em `preco_pendente`, itens sem preço e sem custo. Os valores do processo de origem só aparecem pelo vínculo, e só nos campos que a matriz permite ao perfil.

### 7.4 Invariantes de segurança
- A última conta Admin ativa não pode ser desativada nem perder permissões.
- `usuarios.gerenciar` e `permissoes.gerenciar` exigem reautenticação recente.
- Toda mudança em `perfil_permissoes` e em `usuarios` gera evento de auditoria com antes e depois.
- Login auditado: sucesso e falha geram evento (e-mail informado, resultado, data/hora, IP e user agent), sem gravar a senha. Usuário inativo não consegue sessão.
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
- **Autenticação** (PR 1D): Better Auth `1.6.33`, pino exato. É a 1.6.x mais nova com mais de 14 dias de publicação em 2026-10-24; a linha 1.7 inteira tinha menos de 14 dias. O aviso de peer do Vitest 5 (a 1.6.33 declara até ^4) é aceito, sem override global.
  - Adapter Drizzle, e-mail e senha, sessão no Postgres, `disableSignUp` (sem cadastro público).
  - IDs UUID (`advanced.database.generateId: "uuid"`).
  - Tabelas mapeadas por `modelName`/`fields` para `usuarios`, `sessoes`, `contas`, `verificacoes`, com colunas em snake_case.
  - Reautenticação recente pelo `session.freshAge` (10 minutos) nas ações de `usuarios.gerenciar` e `permissoes.gerenciar`.
  - Usuário real é criado por script local do responsável humano, nunca por tela pública.
- **Seletor de perfil de dev**: existe só com `NODE_ENV=development` **e** `ENABLE_DEV_SWITCHER=1`. Qualquer outra combinação falha fechado (sem sessão, sem permissão).
  - O código do seletor fica em arquivos `*.dev.ts(x)`, que só entram como rota quando as duas condições valem (`pageExtensions`).
  - No build de produção a rota do seletor responde 404 e o identificador do cookie de dev não aparece no bundle. Os dois são verificados por teste.
  - O seletor só aceita usuários marcados como fictícios.
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

## 9. Entregas por PR

O modelo acima cobre o sistema inteiro. A implementação vai por PRs, nesta ordem: chore, 1A, 1B, 1D, 1C, PR 2, PR 3, PR 4, PR 5. "Fundação" é o conjunto chore + 1A + 1B + 1D + 1C.

| PR | Conteúdo |
|---|---|
| **chore** | Rule `usinagem-database.md`, exceção do `frontend.md` para o usinagem, hook protegendo `apps/usinagem/drizzle/**`, fontes no `.gitignore`, nota de exceção no `PRODUCT.md`, script `typecheck` no app. Mudanças em guardrails (`.claude/**`, `.gitignore`) são entregues como patch e aplicadas pelo responsável humano. |
| **docs** | Esta especificação, os planos e o `apps/usinagem/CLAUDE.md` atualizado |
| **1A. Dados** | Docker Compose com Postgres 16 local, roles de migração e de aplicação, Drizzle, schema de núcleo e processo com `versao`, sequência de numeração, seed fictício, workflow de CI do GitHub Actions (typecheck, lint, Vitest com Postgres de serviço) |
| **1B. Domínio** | Contratos TS de todo o domínio, RBAC puro, sigilo por campo e vazamentos laterais, status macro, funções puras e testes dos 4 cenários V2.3, wrapper de permissão deny by default, `requirePermissao()` com usuário de dev atrás das duas condições |
| **1D. Identidade** | Better Auth, login e logout, auditoria de login, `proxy.ts`, reautenticação recente, seletor de perfil de dev excluído do build de produção, script de criação do Admin real |
| **1C. Shell de UI** | Layout, navegação, componentes base e entrada do seletor de dev, definidos no `/impeccable shape` |
| **PR 2. Comercial** | Clientes, processos, revisão comercial com preço pendente, itens, parceiros, RFQ e cotações de fornecedor, desenhos e revisões técnicas por caminho, proposta PDF |
| **PR 3. Execução e financeiro** | Pedido formal e vínculo de demanda, OP e etapas, compras e recebimentos, qualidade, NF registrada, AP/AR, margem Admin |
| **PR 4. Entregas** | Programação versionada, remessas, aceite, devoluções, reprogramação |
| **PR 5. Estoque** | Lotes, movimentos, reservas firme e estratégica, bloqueio com déficit, excedente, ocorrências e ajustes |

O schema de estoque só se estabiliza depois que os testes puros dos 4 cenários (1B) passam. Nenhum push sem confirmação explícita do responsável humano.

### 9.1 Escopo exato da fundação
1. **1A**:
   - Docker Compose com Postgres 16 local e script que cria as roles de migração e de aplicação.
   - Schema Drizzle de núcleo e processo: `usuarios`, `perfis`, `permissoes`, `perfil_permissoes`, `eventos_auditoria`, `configuracoes`, `sequencias_numeracao`, `clientes`, `processos`, `revisoes_comerciais`, `itens_revisao`, com `versao` nas editáveis.
   - Geração de número de processo atômica, com teste concorrente.
   - Seed fictício idempotente (5 usuários, clientes e processos marcados como fictícios), rodando com a role da aplicação.
   - Workflow de CI.
2. **1B**, em `lib/dominio`:
   - tipos de todas as entidades da §4;
   - funções puras de demanda, saldo de entrega, estoque/reservas (com bloqueio e déficit) e status macro;
   - regras de cancelar e fechar processo (§5) e de processo derivado;
   - catálogo de permissões e matriz padrão;
   - `pode(perfil, permissao)`;
   - serializadores com sigilo por campo e vazamentos laterais (§7.3);
   - formatação de data em `America/Sao_Paulo`;
   - wrapper de permissão e teste de cobertura das Server Actions;
   - Vitest cobrindo a §10.
3. **1D**: tudo da linha 1D da tabela, com migration gerada e aplicada pelo responsável humano.
4. **1C**, resultado do `/impeccable shape`:
   - sidebar grafite, topo, grid blueprint, tokens, fontes, pt-BR;
   - rotas: painel e lista de processos (só leitura do seed) e placeholders das outras áreas.

Pré-requisitos registrados para a Fase 2: Chrome instalado na máquina para o Playwright (aceitação visual em 375 px e 1280 px).

### 9.2 Pendências técnicas adiadas (revisão final do 1A, 2026-10-25)

| Pendência | Onde entra |
|---|---|
| A auditoria aceita `criado_em` informado no INSERT: a aplicação pode gravar evento com data retroativa. Fechar com INSERT só nas colunas permitidas ou com trigger `BEFORE INSERT` forçando `now()`. | PR 2 |
| Plano 1D: import duplicado de `index` no Step 3 e falta do `BETTER_AUTH_SECRET` descartável no workflow. | PR 1D (registrado no plano) |
| `.env.local` único entrega ao `next dev` a URL da role de migração e a senha do superusuário. Separar as senhas de banco (compose e migração) das variáveis do app. | Trilha de infraestrutura |
| Imagem `postgres:16-alpine` fixada por digest; gatilho `push` em `main`; aprovação obrigatória de workflows de colaboradores externos. | Depois do primeiro PR (plano 1A, Task 5) |
| Sentinela no seed contra banco com dado real (recusar se houver usuário com `ficticio = false` ou banco diferente do esperado). | PR 2 |
| Trava em `definirNumeroInicial`: hoje ele lê o maior número e faz o upsert sem lock, e pode rebaixar o `proximo`. Usar `SELECT ... FOR UPDATE` na linha da sequência e comparar com o `proximo` atual. | PR 2 |
| Check pendente com filtro de `paths`: se o workflow `usinagem` virar check obrigatório, um PR que não toca os `paths` fica esperando para sempre. Resolver com job "noop" ou gatilho sem `paths` antes de ligar a proteção de branch. | Antes de tornar o check obrigatório |
| `estrutura.test.ts`: comparar `conrelid::regclass::text` depende de o `search_path` incluir `public`. Com nome qualificado, o teste de FK append-only passaria sem checar nada. Trocar por `conrelid = any($1::regclass[])`. | Próximo commit que mexer no teste |
| `estrutura.test.ts`: o `fks.find` pega só a primeira FK em `criado_por` por tabela. Com mais de uma FK nessa coluna, as demais não seriam conferidas. Conferir todas, por exemplo com `filter` e `every`. | Próximo commit que mexer no teste |

## 10. Testes de aceite

Cenários V2.3 (1B, funções puras):
1. Pedido de 20 com remessas 5+5+10: formalizado 20; o saldo só muda com aceite; entregue após 20 aceitas; remessa expedida sem aceite não muda o saldo.
2. Pedido de 20 com entrega única de 20: 20 aceitas, saldo 0.
3. Demanda de 20 com pedido formal de 5: 5 contratadas, 15 não formalizadas, nenhuma NF ou AR. Novos pedidos de 5 e de 10 sobre a mesma demanda: contratado 20, não formalizado 0, sem dupla contagem.
4. Pedido de 20 e produção de 40, entregando 20: físico 20, livre ou reservado conforme decisão do Admin, sem receita extra.
   Combinado: demanda 20, pedido 5, produção 40, entrega 5 → físico 35, estratégica 15, livre 20, contratado 5.
   Variações: reservar as 35 dá livre 0; nenhuma reserva dá livre 35.

Regras também testadas na 1B:
- reserva acima do livre é recusada;
- duas reservas que juntas passam do livre: a segunda é recusada;
- converter estratégica em firme não cria peça;
- lote aguardando inspeção não entra no elegível;
- revisões incompatíveis não somam disponibilidade;
- a mesma remessa aplicada duas vezes (mesma chave) não muda o saldo;
- 20 peças em processo no parceiro dão estoque de acabados 0;
- bloqueio de lote com reserva ativa marca a reserva como `comprometida_bloqueio`, mostra o déficit, não devolve nada ao livre; reliberação devolve a reserva a `ativa`.

Status macro (1B): um caso por linha da tabela da §5.2, e processo reaberto volta ao status calculado pelos documentos.

Processo (1B):
- o Comercial cancela processo sem pedido, compra ou OP;
- o Comercial não cancela depois que existe pedido formal, compra ou OP (o Admin cancela);
- o Comercial fecha processo conciliado;
- o Comercial não fecha processo com saldo de entrega, aceite faltando, NF faltando ou devolução pendente;
- o Admin fecha processo não conciliado só com justificativa.

Permissões (1B):
- o Financeiro recebe "negado" em `margem.ver`, `custo_lote.ver` e `estoque.valorizacao.ver`;
- o serializador do Financeiro não emite custo em AR, preço em AP, nem vínculo de processo;
- permissão travada não pode ser concedida a outro perfil;
- a última conta Admin não pode ser desativada nem rebaixada;
- PDF e envio de proposta exigem revisão `precificada`;
- auditoria vista por perfil não Admin sai sem os campos ocultos em `antes`/`depois`;
- ordenar, filtrar ou buscar por campo oculto é recusado com mensagem genérica, sem nome nem valor do campo;
- agregado sobre campo oculto é recusado, inclusive com grupo de um item só; Financeiro não agrupa títulos por processo;
- exportação passa pelo serializador e é negada fora do Admin;
- processo derivado nasce em `preco_pendente`, sem preço nem custo nos itens;
- o teste de cobertura falha se uma Server Action ou Route Handler não usar o wrapper de permissão;
- o gate do seletor de dev é falso em toda combinação diferente de `NODE_ENV=development` + `ENABLE_DEV_SWITCHER=1`;
- data exibida em `America/Sao_Paulo`.

Dados (1A, contra o Postgres local e o do CI):
- a role da aplicação insere em `eventos_auditoria` e recebe erro de permissão ao tentar `UPDATE` ou `DELETE`;
- 20 gerações concorrentes de número de processo devolvem 20 números distintos e consecutivos;
- número inicial abaixo do maior já usado é recusado.

Identidade (1D):
- login com sucesso e com falha gera evento de auditoria, sem senha;
- usuário inativo não obtém sessão;
- cadastro público é recusado;
- no build de produção, a rota do seletor de dev responde 404 e o nome do cookie de dev não aparece no bundle;
- ação de `usuarios.gerenciar` com sessão mais velha que 10 minutos é recusada.

Ficam para os PRs seguintes (V2.2 e V2.3): replanejamento cria versão nova com autor; devolução de 1 ou 2 peças passa por inspeção antes de voltar a ser elegível; perfil sem permissão não altera cronograma nem confirma aceite; reatribuição de reserva exige autorização e preserva lotes.

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
11. Regras de pagamento: o que origina AP e AR (compra, recebimento, NF, aceite), número e datas de parcelas, adiantamentos.
12. Inventário do servidor de desenhos (estrutura de pastas, convenção de nomes) e política de backup dos arquivos CAD.
13. Expiração e suspensão de proposta: validade padrão, o que acontece ao vencer, quem suspende e reativa.
14. Armazenamento de anexos (fotos de inspeção, comprovantes de entrega, PDFs gerados): onde ficam, limite de tamanho por arquivo e total, e backup.
