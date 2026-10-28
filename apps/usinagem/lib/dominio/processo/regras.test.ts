import { describe, expect, it } from "vitest";
import type { ItemRevisao } from "../contratos";
import {
  conciliado, prepararRevisaoDerivada, validarCancelamento, validarFechamento,
  validarPrecificacao, validarProposta, validarReabertura,
} from "./regras";

const semVinculo = { pedidosFormais: 0, compras: 0, ordensProducao: 0 };
const comPedido = { ...semVinculo, pedidosFormais: 1 };
const fechado = { saldoEntrega: 0, aceitesPendentes: 0, aceitoSemNf: 0, devolucoesPendentes: 0 };

describe("cancelar processo", () => {
  it("Comercial cancela sem pedido, compra ou OP", () => {
    expect(validarCancelamento("comercial", semVinculo, "Cliente desistiu").ok).toBe(true);
  });
  it("Comercial não cancela com pedido, compra ou OP", () => {
    expect(validarCancelamento("comercial", comPedido, "x").ok).toBe(false);
    expect(validarCancelamento("comercial", { ...semVinculo, compras: 1 }, "x").ok).toBe(false);
    expect(validarCancelamento("comercial", { ...semVinculo, ordensProducao: 2 }, "x").ok).toBe(false);
  });
  it("Admin cancela com pedido", () => {
    expect(validarCancelamento("admin", comPedido, "Acordo com cliente").ok).toBe(true);
  });
  it("Admin cancela com compra e com OP isoladas", () => {
    expect(validarCancelamento("admin", { ...semVinculo, compras: 1 }, "x").ok).toBe(true);
    expect(validarCancelamento("admin", { ...semVinculo, ordensProducao: 1 }, "x").ok).toBe(true);
  });
  it("motivo é obrigatório", () => {
    expect(validarCancelamento("admin", semVinculo, "  ").ok).toBe(false);
    expect(validarCancelamento("admin", semVinculo, "").ok).toBe(false);
    expect(validarCancelamento("comercial", semVinculo, "\t \n").ok).toBe(false);
  });
  it("Técnico sem permissão", () => {
    expect(validarCancelamento("tecnico", semVinculo, "x").ok).toBe(false);
  });
});

describe("fechar e reabrir processo", () => {
  it("Comercial fecha conciliado", () => {
    expect(conciliado(fechado)).toBe(true);
    expect(validarFechamento("comercial", fechado).ok).toBe(true);
  });
  it.each([
    ["saldo de entrega", { saldoEntrega: 3 }],
    ["aceite pendente", { aceitesPendentes: 1 }],
    ["NF faltando", { aceitoSemNf: 5 }],
    ["devolução pendente", { devolucoesPendentes: 1 }],
  ])("Comercial não fecha com %s", (_, parcial) => {
    expect(conciliado({ ...fechado, ...parcial })).toBe(false);
    expect(validarFechamento("comercial", { ...fechado, ...parcial }).ok).toBe(false);
  });
  it("Admin fecha não conciliado só com justificativa", () => {
    const aberto = { ...fechado, saldoEntrega: 2 };
    expect(validarFechamento("admin", aberto).ok).toBe(false);
    expect(validarFechamento("admin", aberto, "   ").ok).toBe(false);
    expect(validarFechamento("admin", aberto, "Cliente dispensou o saldo").ok).toBe(true);
  });
  it("perfil sem permissão não fecha, nem conciliado", () => {
    expect(validarFechamento("tecnico", fechado).ok).toBe(false);
  });
  it("só Admin reabre, com motivo", () => {
    expect(validarReabertura("comercial", "x").ok).toBe(false);
    expect(validarReabertura("admin", " ").ok).toBe(false);
    expect(validarReabertura("admin", "").ok).toBe(false);
    expect(validarReabertura("admin", "NF cancelada no fiscal").ok).toBe(true);
  });
});

describe("proposta", () => {
  it.each(["rascunho", "preco_pendente"] as const)("sem PDF nem envio em %s", (estado) => {
    expect(validarProposta("comercial", "proposta.gerar_pdf", estado).ok).toBe(false);
    expect(validarProposta("comercial", "proposta.enviar", estado).ok).toBe(false);
  });
  it.each(["precificada", "enviada", "aprovada"] as const)("PDF e envio em %s", (estado) => {
    expect(validarProposta("comercial", "proposta.gerar_pdf", estado).ok).toBe(true);
    expect(validarProposta("comercial", "proposta.enviar", estado).ok).toBe(true);
  });
  it.each(["recusada", "substituida"] as const)("sem PDF nem envio em %s", (estado) => {
    expect(validarProposta("comercial", "proposta.gerar_pdf", estado).ok).toBe(false);
    expect(validarProposta("comercial", "proposta.enviar", estado).ok).toBe(false);
  });
  it("Financeiro não gera PDF", () => {
    expect(validarProposta("financeiro", "proposta.gerar_pdf", "precificada").ok).toBe(false);
  });
  it("só Admin precifica, e todos os itens precisam de preço inteiro", () => {
    expect(validarPrecificacao("comercial", [{ precoUnitarioCentavos: 100 }]).ok).toBe(false);
    expect(validarPrecificacao("admin", []).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: null }]).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: 10.5 }]).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: -1 }]).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: 100 }, { precoUnitarioCentavos: null }]).ok).toBe(false);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: 0 }]).ok).toBe(true);
    expect(validarPrecificacao("admin", [{ precoUnitarioCentavos: 100 }]).ok).toBe(true);
  });
});

describe("processo derivado", () => {
  it("nasce em preco_pendente, sem preço nem custo, mantendo descrição e revisão técnica", () => {
    const origem: ItemRevisao[] = [{
      id: "i1", revisaoId: "r1", ordem: 1, descricao: "Polia", quantidade: 20, unidade: "pç",
      revisaoTecnicaId: "rt1", precoUnitarioCentavos: 10_000, custoEstimadoCentavos: 6_000,
    }];
    const d = prepararRevisaoDerivada(origem);
    expect(d.estado).toBe("preco_pendente");
    expect(d.itens).toEqual([{
      ordem: 1, descricao: "Polia", quantidade: 20, unidade: "pç", revisaoTecnicaId: "rt1",
      precoUnitarioCentavos: null, custoEstimadoCentavos: null,
    }]);
    expect(d.itens[0]).not.toHaveProperty("id");
    expect(d.itens[0]).not.toHaveProperty("revisaoId");
  });
  it("lista vazia gera revisão derivada sem itens", () => {
    expect(prepararRevisaoDerivada([])).toEqual({ estado: "preco_pendente", itens: [] });
  });
});
