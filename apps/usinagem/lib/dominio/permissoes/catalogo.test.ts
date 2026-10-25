import { describe, expect, it } from "vitest";
import { MATRIZ_PADRAO, PERMISSOES, pode, validarConcessao, type Permissao } from "./catalogo";
import type { Perfil } from "./perfis";

const travadas = (Object.keys(PERMISSOES) as Permissao[]).filter((p) => PERMISSOES[p]);

describe("catálogo de permissões", () => {
  it("tem 54 permissões, 16 travadas no Admin", () => {
    expect(Object.keys(PERMISSOES)).toHaveLength(54);
    expect(travadas).toHaveLength(16);
  });

  it("Admin pode tudo", () => {
    for (const p of Object.keys(PERMISSOES) as Permissao[]) expect(pode("admin", p)).toBe(true);
  });

  it("nenhum perfil não Admin recebe permissão travada no padrão", () => {
    for (const lista of Object.values(MATRIZ_PADRAO)) for (const p of lista) expect(PERMISSOES[p]).toBe(false);
  });

  it("permissão travada é negada mesmo se o banco a conceder", () => {
    expect(pode("financeiro", "margem.ver", ["margem.ver"])).toBe(false);
  });

  it("Financeiro: 403 em margem, custo de lote e valorização", () => {
    expect(pode("financeiro", "margem.ver")).toBe(false);
    expect(pode("financeiro", "custo_lote.ver")).toBe(false);
    expect(pode("financeiro", "estoque.valorizacao.ver")).toBe(false);
  });

  it("matriz da spec §7.2, amostra por perfil", () => {
    expect(pode("comercial", "processo.criar")).toBe(true);
    expect(pode("comercial", "custo.ver")).toBe(false);
    expect(pode("comercial", "preco.definir")).toBe(false);
    expect(pode("compras_producao", "custo.ver")).toBe(true);
    expect(pode("compras_producao", "rfq.enviar")).toBe(true);
    expect(pode("compras_producao", "preco.ver")).toBe(false);
    expect(pode("compras_producao", "entrega.expedir")).toBe(true);
    expect(pode("tecnico", "qualidade.liberar")).toBe(true);
    expect(pode("tecnico", "revisao_tecnica.aprovar")).toBe(true);
    expect(pode("tecnico", "revisao_tecnica.liberar_parceiro")).toBe(true);
    expect(pode("comercial", "revisao_tecnica.aprovar")).toBe(false);
    expect(pode("tecnico", "titulo_pagar.operar")).toBe(false);
    expect(pode("financeiro", "titulo_receber.operar")).toBe(true);
    for (const perfil of ["comercial", "compras_producao", "financeiro", "tecnico"] as const) {
      expect(pode(perfil, "estoque.ver")).toBe(true);
      expect(pode(perfil, "processo.ver")).toBe(true);
    }
  });

  it("retrabalho e qualidade são dado da matriz: o banco pode mudar quem tem", () => {
    expect(pode("compras_producao", "qualidade.liberar", ["qualidade.liberar"])).toBe(true);
    expect(pode("tecnico", "retrabalho.abrir", [])).toBe(false);
  });

  it("concessão de travada a outro perfil é recusada", () => {
    expect(validarConcessao("comercial", "reserva_firme.liberar").ok).toBe(false);
    expect(validarConcessao("comercial", "entrega.expedir").ok).toBe(true);
  });

  it("permissão inexistente nega acesso sem lançar exceção", () => {
    expect(() => pode("comercial", "nao.existe" as Permissao)).not.toThrow();
    expect(pode("comercial", "nao.existe" as Permissao)).toBe(false);
    expect(() => pode("admin", "nao.existe" as Permissao)).not.toThrow();
    expect(pode("admin", "nao.existe" as Permissao)).toBe(false);
    expect(() => pode("comercial", "toString" as Permissao)).not.toThrow();
    expect(pode("comercial", "toString" as Permissao)).toBe(false);
    expect(() => pode("comercial", "constructor" as Permissao)).not.toThrow();
    expect(pode("comercial", "constructor" as Permissao)).toBe(false);
  });

  it("perfil inexistente nega acesso sem lançar exceção", () => {
    expect(() => pode("visitante" as Perfil, "processo.ver")).not.toThrow();
    expect(pode("visitante" as Perfil, "processo.ver")).toBe(false);
    expect(() => pode("visitante" as Perfil, "processo.ver", ["processo.ver"])).not.toThrow();
    expect(pode("visitante" as Perfil, "processo.ver", ["processo.ver"])).toBe(false);
  });

  it("validarConcessao recusa permissão inexistente", () => {
    expect(() => validarConcessao("comercial", "nao.existe" as Permissao)).not.toThrow();
    expect(validarConcessao("comercial", "nao.existe" as Permissao).ok).toBe(false);
  });
});
