import { describe, expect, it } from "vitest";
import { ErroDominio } from "../comum";
import { statusMacro, type EntradaStatusMacro } from "./status-macro";

const base: EntradaStatusMacro = { situacaoComercial: "cotacao_aberta", estadoRevisaoVigente: "rascunho", pedidosAtivos: 0, itens: [] };
const item = (saldoEntrega: number, reservaFirmeAtiva: number, aceitoSemNf: number) => ({ saldoEntrega, reservaFirmeAtiva, aceitoSemNf });
const ped = { ...base, situacaoComercial: "contratado" as const, pedidosAtivos: 1 };

describe("status macro (spec §5.2)", () => {
  it.each(["cancelado", "perdido", "suspenso"] as const)("%s fica fora das colunas", (s) => {
    expect(statusMacro({ ...base, situacaoComercial: s, pedidosAtivos: 1 })).toBe(s);
  });
  it("cancelado vence mesmo com pedido ativo e tudo entregue com NF", () => {
    expect(statusMacro({ ...ped, situacaoComercial: "cancelado", itens: [item(0, 0, 0)] })).toBe("cancelado");
  });
  it("fechado", () => {
    expect(statusMacro({ ...base, situacaoComercial: "fechado" })).toBe("fechado");
  });
  it("fechado vence com saldo pendente", () => {
    expect(statusMacro({ ...ped, situacaoComercial: "fechado", itens: [item(10, 10, 0)] })).toBe("fechado");
  });
  it("NF emitida: saldo zero e toda quantidade aceita com NF", () => {
    expect(statusMacro({ ...ped, itens: [item(0, 0, 0)] })).toBe("nf_emitida");
  });
  it("NF emitida vence pronto para entrega quando o saldo é zero", () => {
    expect(statusMacro({ ...ped, itens: [item(0, 5, 0)] })).toBe("nf_emitida");
  });
  it("saldo zero mas aceite sem NF não é NF emitida", () => {
    expect(statusMacro({ ...ped, itens: [item(0, 0, 5)] })).toBe("em_fabricacao");
  });
  it("sobre-entrega (saldo -2) sem NF pendente é em fabricação (caracterização, spec §5.2 regra 3: saldo zero; a confirmar com o Admin)", () => {
    expect(statusMacro({ ...ped, itens: [item(-2, 0, 0)] })).toBe("em_fabricacao");
  });
  it("sobre-entrega com aceite sem NF não é NF emitida", () => {
    expect(statusMacro({ ...ped, itens: [item(-2, 0, 1)] })).toBe("em_fabricacao");
  });
  it("pronto para entrega: reserva firme cobre o saldo de todos os itens com saldo", () => {
    expect(statusMacro({ ...ped, itens: [item(10, 10, 0), item(0, 0, 0)] })).toBe("pronto_para_entrega");
  });
  it("reserva maior que o saldo ainda é pronto para entrega", () => {
    expect(statusMacro({ ...ped, itens: [item(10, 12, 0)] })).toBe("pronto_para_entrega");
  });
  it("reserva parcial ainda é em fabricação", () => {
    expect(statusMacro({ ...ped, itens: [item(10, 4, 0)] })).toBe("em_fabricacao");
  });
  it("um item coberto e outro não é em fabricação", () => {
    expect(statusMacro({ ...ped, itens: [item(10, 10, 0), item(5, 0, 0)] })).toBe("em_fabricacao");
  });
  it("pedido ativo sem itens é em fabricação", () => {
    expect(statusMacro({ ...ped, itens: [] })).toBe("em_fabricacao");
  });
  it("pedido ativo com revisão vigente enviada é em fabricação (regra 5 antes da 6)", () => {
    expect(statusMacro({ ...ped, estadoRevisaoVigente: "enviada", itens: [item(5, 0, 0)] })).toBe("em_fabricacao");
  });
  it("cotação enviada", () => {
    expect(statusMacro({ ...base, situacaoComercial: "cotacao_enviada", estadoRevisaoVigente: "enviada" })).toBe("cotacao_enviada");
  });
  it.each(["rascunho", "preco_pendente", "precificada"] as const)("cotação aberta com revisão %s", (estado) => {
    expect(statusMacro({ ...base, estadoRevisaoVigente: estado })).toBe("cotacao_aberta");
  });
  it.each(["recusada", "aprovada"] as const)("revisão %s sem pedido é cotação aberta", (estado) => {
    expect(statusMacro({ ...base, estadoRevisaoVigente: estado })).toBe("cotacao_aberta");
  });
  it("sem revisão vigente é cotação aberta", () => {
    expect(statusMacro({ ...base, estadoRevisaoVigente: null })).toBe("cotacao_aberta");
  });
  it.each(["cancelado", "perdido", "suspenso", "fechado"] as const)("%s vence as regras 3, 4, 5 e 6", (s) => {
    const o = { ...base, situacaoComercial: s };
    expect(statusMacro({ ...o, pedidosAtivos: 1, itens: [item(0, 0, 0)] })).toBe(s); // regra 3
    expect(statusMacro({ ...o, pedidosAtivos: 1, itens: [item(10, 10, 0)] })).toBe(s); // regra 4
    expect(statusMacro({ ...o, pedidosAtivos: 1, itens: [item(10, 0, 0)] })).toBe(s); // regra 5
    expect(statusMacro({ ...o, pedidosAtivos: 1, itens: [] })).toBe(s); // regra 5, sem itens
    expect(statusMacro({ ...o, estadoRevisaoVigente: "enviada" })).toBe(s); // regra 6
  });
  it("processo reaberto volta ao status calculado pelos documentos", () => {
    expect(statusMacro({ ...base, situacaoComercial: "reaberto", pedidosAtivos: 1, itens: [item(3, 0, 0)] })).toBe("em_fabricacao");
    expect(statusMacro({ ...base, situacaoComercial: "reaberto", pedidosAtivos: 1, itens: [item(0, 0, 0)] })).toBe("nf_emitida");
    expect(statusMacro({ ...base, situacaoComercial: "reaberto" })).toBe("cotacao_aberta");
  });
});

describe("status macro: dado corrompido falha alto", () => {
  const MSG = "Entrada de status inválida.";
  const falha = (e: unknown) => expect(() => statusMacro(e as EntradaStatusMacro)).toThrow(new ErroDominio(MSG));

  it.each(["toString", "__proto__", "inventado", "", 3, null, undefined])("situacaoComercial inválida %s", (s) => {
    falha({ ...base, situacaoComercial: s });
  });
  it.each(["toString", "inventada", "", 3, undefined])("estadoRevisaoVigente inválido %s", (s) => {
    falha({ ...base, estadoRevisaoVigente: s });
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined])("pedidosAtivos inválido %s", (p) => {
    falha({ ...base, pedidosAtivos: p });
  });
  it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined])("saldoEntrega inválido %s", (v) => {
    falha({ ...ped, itens: [item(v as number, 0, 0)] });
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined])("reservaFirmeAtiva inválida %s", (v) => {
    falha({ ...ped, itens: [item(0, v as number, 0)] });
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined])("aceitoSemNf inválido %s", (v) => {
    falha({ ...ped, itens: [item(0, 0, v as number)] });
  });
  it("item inválido no meio da lista também falha", () => {
    falha({ ...ped, itens: [item(1, 0, 0), item(NaN, 0, 0)] });
  });
  it("valida mesmo quando a situação já decidiria (cancelado com item corrompido)", () => {
    falha({ ...base, situacaoComercial: "cancelado", pedidosAtivos: 1, itens: [item(NaN, 0, 0)] });
  });
  it("a mensagem não ecoa o valor", () => {
    expect(() => statusMacro({ ...base, situacaoComercial: "segredo-xyz" as never })).toThrow(/^Entrada de status inválida\.$/);
  });
});

describe("status macro: combinações inválidas dos eixos", () => {
  const falha = (e: EntradaStatusMacro) => expect(() => statusMacro(e)).toThrow(new ErroDominio("Entrada de status inválida."));

  it("(a) itens com pedidosAtivos 0", () => {
    falha({ ...base, itens: [item(0, 0, 0)] });
    falha({ ...base, situacaoComercial: "cancelado", itens: [item(1, 0, 0)] });
  });
  it("(d) cotacao_enviada sem revisão vigente", () => {
    falha({ ...base, situacaoComercial: "cotacao_enviada", estadoRevisaoVigente: null });
  });
  it("(b) vigente substituida sem pedido é cotação aberta (caracterização, spec não proíbe)", () => {
    expect(statusMacro({ ...base, estadoRevisaoVigente: "substituida" })).toBe("cotacao_aberta");
  });
  it("(c) cotacao_aberta com pedido ativo é em fabricação (caracterização, spec não proíbe)", () => {
    expect(statusMacro({ ...base, pedidosAtivos: 1 })).toBe("em_fabricacao");
  });
  it("(c) cotacao_enviada com revisão enviada e pedido ativo é em fabricação (caracterização)", () => {
    expect(statusMacro({ ...base, situacaoComercial: "cotacao_enviada", estadoRevisaoVigente: "enviada", pedidosAtivos: 1 })).toBe("em_fabricacao");
  });
  it("contrato: contratado cujo único pedido foi cancelado chega sem pedidos e sem itens", () => {
    expect(statusMacro({ ...base, situacaoComercial: "contratado", estadoRevisaoVigente: "enviada" })).toBe("cotacao_enviada");
    expect(statusMacro({ ...base, situacaoComercial: "contratado", estadoRevisaoVigente: "aprovada" })).toBe("cotacao_aberta");
  });
  it("continuam válidos: pedido ativo sem itens, aprovado/contratado/parcial sem pedido, reaberto com pedido", () => {
    expect(statusMacro({ ...ped, itens: [] })).toBe("em_fabricacao");
    for (const s of ["aprovado", "contratado", "parcialmente_contratado"] as const) {
      expect(statusMacro({ ...base, situacaoComercial: s })).toBe("cotacao_aberta");
    }
    expect(statusMacro({ ...base, situacaoComercial: "reaberto", pedidosAtivos: 2, itens: [item(1, 0, 0)] })).toBe("em_fabricacao");
  });
});

describe("status macro: lista de itens malformada lança o erro genérico, nunca TypeError", () => {
  const casos: [string, unknown][] = [
    ["itens null", null], ["itens undefined", undefined], ["itens objeto", {}], ["itens string", "abc"],
    ["item null", [null]], ["item sem campos", [{}]], ["item número", [3]], ["item string", ["x"]],
  ];
  it.each(casos)("%s", (_nome, itens) => {
    const e = { ...ped, itens } as unknown as EntradaStatusMacro;
    expect(() => statusMacro(e)).toThrow("Entrada de status inválida.");
    expect(() => statusMacro(e)).not.toThrow(TypeError);
  });
});

// Tabelas escritas à mão a partir da spec §5.2 (regras 1, 2, 3, 4, 5); nunca copiadas da saída.
describe("pares 1-2: situações terminais cruzadas com pedidos e itens", () => {
  const terminais = ["cancelado", "perdido", "suspenso", "fechado"] as const;
  const arranjos: [string, number, { saldoEntrega: number; reservaFirmeAtiva: number; aceitoSemNf: number }[]][] = [
    ["0 pedidos, sem itens", 0, []],
    ["1 pedido, sem itens", 1, []],
    ["1 pedido, item entregue", 1, [item(0, 0, 0)]],
    ["1 pedido, item com saldo coberto", 1, [item(5, 5, 0)]],
  ];
  const linhas = terminais.flatMap((s) => arranjos.map(([nome, p, itens]) => [s, nome, p, itens] as const));
  it.each(linhas)("%s com %s é o próprio %s", (s, _nome, p, itens) => {
    expect(statusMacro({ ...base, situacaoComercial: s, pedidosAtivos: p, itens: [...itens] })).toBe(s);
  });
});

describe("pares 3-4: NF emitida, pronto para entrega e em fabricação por saldo, reserva e aceite", () => {
  type Linha = [string, { saldoEntrega: number; reservaFirmeAtiva: number; aceitoSemNf: number }[], string];
  const linhas: Linha[] = [
    // 1 item: saldo -2
    ["saldo -2 reserva 0 aceite 0", [item(-2, 0, 0)], "em_fabricacao"],
    ["saldo -2 reserva 0 aceite 3", [item(-2, 0, 3)], "em_fabricacao"],
    ["saldo -2 reserva 5 aceite 0", [item(-2, 5, 0)], "em_fabricacao"],
    ["saldo -2 reserva 5 aceite 3", [item(-2, 5, 3)], "em_fabricacao"],
    // 1 item: saldo 0
    ["saldo 0 reserva 0 aceite 0", [item(0, 0, 0)], "nf_emitida"],
    ["saldo 0 reserva 0 aceite 3", [item(0, 0, 3)], "em_fabricacao"],
    ["saldo 0 reserva 5 aceite 0", [item(0, 5, 0)], "nf_emitida"],
    ["saldo 0 reserva 5 aceite 3", [item(0, 5, 3)], "em_fabricacao"],
    // 1 item: saldo 5
    ["saldo 5 reserva 0 aceite 0", [item(5, 0, 0)], "em_fabricacao"],
    ["saldo 5 reserva 0 aceite 3", [item(5, 0, 3)], "em_fabricacao"],
    ["saldo 5 reserva 5 aceite 0", [item(5, 5, 0)], "pronto_para_entrega"],
    ["saldo 5 reserva 5 aceite 3", [item(5, 5, 3)], "pronto_para_entrega"],
    // 2 itens: um sem saldo (0 ou -2) e outro com saldo 5
    ["[0,0,0] + [5,0,0]", [item(0, 0, 0), item(5, 0, 0)], "em_fabricacao"],
    ["[0,0,0] + [5,5,0]", [item(0, 0, 0), item(5, 5, 0)], "pronto_para_entrega"],
    ["[0,5,3] + [5,0,3]", [item(0, 5, 3), item(5, 0, 3)], "em_fabricacao"],
    ["[0,5,3] + [5,5,3]", [item(0, 5, 3), item(5, 5, 3)], "pronto_para_entrega"],
    ["[-2,0,0] + [5,0,0]", [item(-2, 0, 0), item(5, 0, 0)], "em_fabricacao"],
    ["[-2,0,0] + [5,5,0]", [item(-2, 0, 0), item(5, 5, 0)], "pronto_para_entrega"],
    ["[-2,5,3] + [5,0,3]", [item(-2, 5, 3), item(5, 0, 3)], "em_fabricacao"],
    ["[-2,5,3] + [5,5,3]", [item(-2, 5, 3), item(5, 5, 3)], "pronto_para_entrega"],
    ["[5,0,0] + [0,0,0] (ordem invertida)", [item(5, 0, 0), item(0, 0, 0)], "em_fabricacao"],
    ["[5,5,0] + [-2,0,0] (ordem invertida)", [item(5, 5, 0), item(-2, 0, 0)], "pronto_para_entrega"],
  ];
  it.each(linhas)("%s", (_nome, itens, esperado) => {
    expect(statusMacro({ ...ped, itens })).toBe(esperado);
  });
});
