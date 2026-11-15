import { describe, expect, it } from "vitest";
import { MATRIZ_PADRAO } from "../permissoes/catalogo";
import { serializarItemRevisao, serializarTituloPagar, serializarTituloReceber, serializarEventoAuditoria, serializar, validarConsulta, validarAgregado, exportarLinhas } from "./serializar";
import { podeLerContexto, podeVerCampo } from "./campos";
import { validarCancelamento, validarFechamento, validarReabertura, validarProposta, validarPrecificacao } from "../processo/regras";

const item = { id: "i1", revisaoId: "r1", descricao: "x", quantidade: 1, precoUnitarioCentavos: 100, custoEstimadoCentavos: 60 } as never;
const a = null as never;

describe("concedidas é obrigatório (sem matriz padrão implícita)", () => {
  it("chamadas sem concedidas não compilam", () => {
    /* eslint-disable @typescript-eslint/no-unused-expressions */
    // @ts-expect-error concedidas é obrigatório
    () => serializar(item, "compras_producao", "item_revisao");
    // @ts-expect-error concedidas é obrigatório
    () => serializarItemRevisao(item, "compras_producao");
    // @ts-expect-error concedidas é obrigatório
    () => serializarTituloPagar(a, "financeiro");
    // @ts-expect-error concedidas é obrigatório
    () => serializarTituloReceber(a, "financeiro");
    // @ts-expect-error concedidas é obrigatório
    () => serializarEventoAuditoria(a, "financeiro");
    // @ts-expect-error concedidas é obrigatório
    () => validarConsulta("financeiro", "item_revisao", { filtros: [] });
    // @ts-expect-error concedidas é obrigatório
    () => validarAgregado("financeiro", "item_revisao", { campo: "id" });
    // @ts-expect-error concedidas é obrigatório
    () => exportarLinhas([], "financeiro", "item_revisao");
    // @ts-expect-error concedidas é obrigatório
    () => podeLerContexto("financeiro", "item_revisao");
    // @ts-expect-error concedidas é obrigatório
    () => podeVerCampo("financeiro", "item_revisao", "id");
    // @ts-expect-error concedidas é obrigatório
    () => validarCancelamento("comercial", { pedidosFormais: 0, compras: 0, ordensProducao: 0 }, "motivo");
    // @ts-expect-error concedidas é obrigatório
    () => validarFechamento("comercial", a);
    // @ts-expect-error concedidas é obrigatório
    () => validarReabertura("admin", "motivo");
    // @ts-expect-error concedidas é obrigatório
    () => validarProposta("comercial", "proposta.enviar", "enviada");
    // @ts-expect-error concedidas é obrigatório
    () => validarPrecificacao("admin", []);
    expect(serializarItemRevisao(item, "compras_producao", MATRIZ_PADRAO.compras_producao)).not.toBeNull();
  });
});
