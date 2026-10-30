import { describe, expect, it } from "vitest";
import type { EventoAuditoria, ItemRevisao, TituloPagar, TituloReceber } from "../contratos";
import {
  MENSAGEM_CONSULTA_NEGADA, exportarLinhas, serializarEventoAuditoria, serializarItemRevisao,
  serializarTituloPagar, serializarTituloReceber, validarAgregado, validarConsulta,
} from "./serializar";
import { podeVerCampo } from "./campos";

const item: ItemRevisao = {
  id: "i1", revisaoId: "r1", ordem: 1, descricao: "Polia", quantidade: 20, unidade: "pç",
  revisaoTecnicaId: null, precoUnitarioCentavos: 10_000, custoEstimadoCentavos: 6_000,
};
const ap: TituloPagar = { id: "p1", parceiroId: "f1", processoId: "proc1", valorCentavos: 6_000, vencimento: "2026-11-10", situacao: "aberto", versao: 1 };
const ar: TituloReceber = { id: "r1", clienteId: "c1", processoId: "proc1", documentoFiscalId: "nf1", valorCentavos: 10_000, vencimento: "2026-11-20", situacao: "aberto", versao: 1 };
const evento = (entidade: string): EventoAuditoria => ({
  id: "e1", autorId: "u1", operacao: "editar", entidade, entidadeId: "i1",
  antes: { descricao: "Polia", precoUnitarioCentavos: 9_000, custoEstimadoCentavos: 5_000 },
  depois: { descricao: "Polia", precoUnitarioCentavos: 10_000, custoEstimadoCentavos: 6_000 },
  justificativa: null, criadoEm: "2026-10-24T12:00:00Z",
});

describe("sigilo por campo", () => {
  it("Admin vê preço e custo lado a lado", () => {
    const s = serializarItemRevisao(item, "admin")!;
    expect(s.precoUnitarioCentavos).toBe(10_000);
    expect(s.custoEstimadoCentavos).toBe(6_000);
  });
  it("Comercial vê preço, nunca custo", () => {
    const s = serializarItemRevisao(item, "comercial")!;
    expect(s.precoUnitarioCentavos).toBe(10_000);
    expect("custoEstimadoCentavos" in s).toBe(false);
  });
  it("Compras vê custo, nunca preço", () => {
    const s = serializarItemRevisao(item, "compras_producao")!;
    expect(s.custoEstimadoCentavos).toBe(6_000);
    expect("precoUnitarioCentavos" in s).toBe(false);
  });
  it("Financeiro não vê preço nem custo no item da revisão", () => {
    const s = serializarItemRevisao(item, "financeiro")!;
    expect("precoUnitarioCentavos" in s).toBe(false);
    expect("custoEstimadoCentavos" in s).toBe(false);
  });
  it("Financeiro opera AP e AR sem vínculo de processo", () => {
    const p = serializarTituloPagar(ap, "financeiro")!;
    const r = serializarTituloReceber(ar, "financeiro")!;
    expect(p.valorCentavos).toBe(6_000);
    expect(r.valorCentavos).toBe(10_000);
    expect("processoId" in p).toBe(false);
    expect("processoId" in r).toBe(false);
  });
  it("Admin vê processo nos títulos", () => {
    expect(serializarTituloPagar(ap, "admin")!.processoId).toBe("proc1");
  });
  it("perfil sem permissão de título recebe null (403)", () => {
    expect(serializarTituloPagar(ap, "comercial")).toBeNull();
    expect(serializarTituloReceber(ar, "tecnico")).toBeNull();
  });
});

describe("vazamentos laterais", () => {
  it("auditoria vista pelo Comercial sai sem custo em antes/depois", () => {
    const s = serializarEventoAuditoria(evento("itens_revisao"), "comercial")!;
    expect(s.operacao).toBe("editar");
    expect(s.antes).toEqual({ descricao: "Polia", precoUnitarioCentavos: 9_000 });
    expect(s.depois).toEqual({ descricao: "Polia", precoUnitarioCentavos: 10_000 });
  });
  it("auditoria vista por Compras sai sem preço", () => {
    const s = serializarEventoAuditoria(evento("itens_revisao"), "compras_producao")!;
    expect(s.depois).toEqual({ descricao: "Polia", custoEstimadoCentavos: 6_000 });
  });
  it("auditoria de entidade sem mapa de campos: fora do Admin, antes/depois somem (falha fechado)", () => {
    const s = serializarEventoAuditoria(evento("entidade_nova"), "comercial")!;
    expect(s.antes).toBeNull();
    expect(s.depois).toBeNull();
    expect(serializarEventoAuditoria(evento("entidade_nova"), "admin")!.antes).not.toBeNull();
  });
  it("auditoria com antes/depois null (criação/exclusão) não quebra", () => {
    const ev = { ...evento("itens_revisao"), antes: null, depois: null };
    const s = serializarEventoAuditoria(ev, "comercial")!;
    expect(s.antes).toBeNull();
    expect(s.depois).toBeNull();
  });
  it("ordenar, filtrar ou buscar por campo oculto é recusado", () => {
    expect(validarConsulta("comercial", "item_revisao", { ordenarPor: "custoEstimadoCentavos" }).ok).toBe(false);
    expect(validarConsulta("compras_producao", "item_revisao", { filtros: ["precoUnitarioCentavos"] }).ok).toBe(false);
    expect(validarConsulta("financeiro", "titulo_receber", { busca: ["processoId"] }).ok).toBe(false);
    expect(validarConsulta("comercial", "item_revisao", { ordenarPor: "precoUnitarioCentavos" }).ok).toBe(true);
  });
  it("consulta sem campos ocultos passa", () => {
    expect(validarConsulta("comercial", "item_revisao", {}).ok).toBe(true);
  });
  it("mensagem de recusa é genérica: sem nome nem valor do campo", () => {
    const a = validarConsulta("comercial", "item_revisao", { ordenarPor: "custoEstimadoCentavos" });
    const b = validarAgregado("comercial", "item_revisao", { campo: "custoEstimadoCentavos" });
    for (const r of [a, b]) {
      expect(r).toEqual({ ok: false, erro: MENSAGEM_CONSULTA_NEGADA });
    }
    expect(MENSAGEM_CONSULTA_NEGADA).not.toMatch(/custo|preco|preço|\d/i);
  });
  it("mensagem é idêntica em ordenar, filtrar, buscar e agrupar", () => {
    const rs = [
      validarConsulta("comercial", "item_revisao", { ordenarPor: "custoEstimadoCentavos" }),
      validarConsulta("comercial", "item_revisao", { filtros: ["custoEstimadoCentavos"] }),
      validarConsulta("comercial", "item_revisao", { busca: ["custoEstimadoCentavos"] }),
      validarAgregado("comercial", "item_revisao", { campo: "id", agruparPor: ["custoEstimadoCentavos"] }),
      validarAgregado("financeiro", "titulo_pagar", { campo: "valorCentavos", agruparPor: ["processoId"] }),
    ];
    for (const r of rs) expect(r).toEqual({ ok: false, erro: MENSAGEM_CONSULTA_NEGADA });
  });
  it("agregado sobre campo oculto é recusado, inclusive com grupo de um item", () => {
    expect(validarAgregado("comercial", "item_revisao", { campo: "custoEstimadoCentavos", agruparPor: ["id"] }).ok).toBe(false);
    expect(validarAgregado("compras_producao", "item_revisao", { campo: "precoUnitarioCentavos" }).ok).toBe(false);
    expect(validarAgregado("comercial", "item_revisao", { campo: "precoUnitarioCentavos" }).ok).toBe(true);
  });
  it("Financeiro não agrupa títulos por processo", () => {
    expect(validarAgregado("financeiro", "titulo_pagar", { campo: "valorCentavos", agruparPor: ["processoId"] }).ok).toBe(false);
    expect(validarAgregado("financeiro", "titulo_pagar", { campo: "valorCentavos", agruparPor: ["parceiroId"] }).ok).toBe(true);
  });
  it("exportação passa pelo serializador e é negada fora do Admin", () => {
    expect(exportarLinhas([item], "comercial", "item_revisao")).toBeNull();
    expect(exportarLinhas([ap], "financeiro", "titulo_pagar")).toBeNull();
    expect(exportarLinhas([item], "admin", "item_revisao")).toEqual([item]);
  });
});

describe("lista de permitidos (falha fechada)", () => {
  it("campo desconhecido some para Comercial e aparece para Admin", () => {
    const extra = { ...item, margemPontosBase: 10 };
    expect("margemPontosBase" in serializarItemRevisao(extra, "comercial")!).toBe(false);
    expect((serializarItemRevisao(extra, "admin") as Record<string, unknown>).margemPontosBase).toBe(10);
  });
  it("chave snake_case some para Comercial", () => {
    const extra = { ...item, custo_estimado_centavos: 6_000 };
    expect("custo_estimado_centavos" in serializarItemRevisao(extra, "comercial")!).toBe(false);
  });
  it("valor aninhado some para Comercial", () => {
    const extra = { ...item, itens: [{ custoEstimadoCentavos: 1 }] };
    expect("itens" in serializarItemRevisao(extra, "comercial")!).toBe(false);
  });
  it("auditoria de titulos_receber: Comercial recebe null", () => {
    expect(serializarEventoAuditoria(evento("titulos_receber"), "comercial")).toBeNull();
  });
  it("auditoria de titulos_receber: Financeiro vê valor, sem processoId, sem snake_case nem aninhado", () => {
    const ev: EventoAuditoria = {
      ...evento("titulos_receber"),
      antes: { valorCentavos: 1, processoId: "p", valor_centavos: 2, extra: { a: 1 } },
      depois: { valorCentavos: 3, processoId: "p" },
    };
    const s = serializarEventoAuditoria(ev, "financeiro")!;
    expect(s.antes).toEqual({ valorCentavos: 1 });
    expect(s.depois).toEqual({ valorCentavos: 3 });
  });
  it("consulta recusa caixa, snake_case, caminho com ponto e nome vazio", () => {
    for (const c of ["CustoEstimadoCentavos", "custo_estimado_centavos", "itens.custoEstimadoCentavos", ""]) {
      expect(validarConsulta("admin", "item_revisao", { ordenarPor: c }).ok).toBe(false);
      expect(validarConsulta("comercial", "item_revisao", { filtros: [c] }).ok).toBe(false);
    }
  });
  it("nome do protótipo não é campo", () => {
    expect(validarConsulta("admin", "item_revisao", { busca: ["constructor"] }).ok).toBe(false);
    expect(validarConsulta("admin", "item_revisao", { busca: ["__proto__"] }).ok).toBe(false);
  });
  it("Comercial consultando titulo_pagar é recusado", () => {
    expect(validarConsulta("comercial", "titulo_pagar", { ordenarPor: "vencimento" }).ok).toBe(false);
  });
  it("agregado com campo visível mas filtro ou busca oculto é recusado", () => {
    expect(validarAgregado("comercial", "item_revisao", { campo: "precoUnitarioCentavos", filtros: ["custoEstimadoCentavos"] }).ok).toBe(false);
    expect(validarAgregado("comercial", "item_revisao", { campo: "precoUnitarioCentavos", busca: ["custoEstimadoCentavos"] }).ok).toBe(false);
  });
  it("Comercial agregando vencimento de titulo_pagar é recusado", () => {
    expect(validarAgregado("comercial", "titulo_pagar", { campo: "vencimento" }).ok).toBe(false);
  });
  it("exportação sem leitura do contexto é nula", () => {
    expect(exportarLinhas([ap], "comercial", "titulo_pagar")).toBeNull();
  });
});

describe("permissões concedidas pelo banco", () => {
  it("Compras sem custo.ver concedido não vê custo", () => {
    const s = serializarItemRevisao(item, "compras_producao", ["processo.ver"])!;
    expect("custoEstimadoCentavos" in s).toBe(false);
  });
  it("Comercial sem processo.ver concedido recebe null", () => {
    expect(serializarItemRevisao(item, "comercial", ["preco.ver"])).toBeNull();
  });
  it("Financeiro sem titulo_receber.operar concedido: AR e auditoria dão null", () => {
    expect(serializarTituloReceber(ar, "financeiro", ["preco.ver"])).toBeNull();
    expect(serializarEventoAuditoria(evento("titulos_receber"), "financeiro", ["processo.ver", "preco.ver"])).toBeNull();
  });
  it("AP sem titulo_pagar.operar concedido dá null", () => {
    expect(serializarTituloPagar(ap, "financeiro", ["custo.ver"])).toBeNull();
  });
  it("permissão travada continua negada mesmo concedida", () => {
    expect(podeVerCampo("financeiro", "titulo_pagar", "processoId", ["titulo_pagar.operar"])).toBe(false);
  });
  it("consulta e agregado recusam quando concedidas tiram a permissão do campo", () => {
    expect(validarConsulta("compras_producao", "item_revisao", { ordenarPor: "custoEstimadoCentavos" }, ["processo.ver"]).ok).toBe(false);
    expect(validarAgregado("compras_producao", "item_revisao", { campo: "custoEstimadoCentavos" }, ["processo.ver"]).ok).toBe(false);
    expect(validarConsulta("compras_producao", "item_revisao", { ordenarPor: "custoEstimadoCentavos" }).ok).toBe(true);
  });
  it("exportação respeita concedidas (sem leitura do contexto, null)", () => {
    expect(exportarLinhas([item], "comercial", "item_revisao", ["dados.exportar"])).toBeNull();
  });
  it("entidade com nome do protótipo vale como entidade sem contexto", () => {
    const s = serializarEventoAuditoria(evento("constructor"), "comercial")!;
    expect(s).not.toBeNull();
    expect(s.antes).toBeNull();
    expect(s.depois).toBeNull();
  });
  it("concedidas vazio nega tudo a não-Admin, sem cair na matriz padrão", () => {
    expect(serializarItemRevisao(item, "comercial", [])).toBeNull();
    expect(serializarItemRevisao(item, "admin", [])).not.toBeNull();
    expect(podeVerCampo("compras_producao", "item_revisao", "descricao", [])).toBe(false);
    expect(validarConsulta("comercial", "item_revisao", { ordenarPor: "descricao" }, []).ok).toBe(false);
    expect(validarAgregado("comercial", "item_revisao", { campo: "descricao" }, []).ok).toBe(false);
    expect(serializarEventoAuditoria(evento("itens_revisao"), "comercial", [])).toBeNull();
  });

  it("dados.exportar concedida a não-Admin não destrava a exportação; Admin exporta", () => {
    expect(exportarLinhas([item], "comercial", "item_revisao", ["processo.ver", "dados.exportar"])).toBeNull();
    expect(exportarLinhas([item], "admin", "item_revisao", [])).toEqual([item]);
  });
});
