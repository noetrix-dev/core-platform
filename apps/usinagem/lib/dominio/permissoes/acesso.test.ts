import { describe, expect, it } from "vitest";
import type { Perfil } from "./perfis";
import { decidirAcesso } from "./acesso";

const fin = { id: "u4", nome: "Fin", perfil: "financeiro" as const };
const adm = { id: "u1", nome: "Adm", perfil: "admin" as const };

describe("decidirAcesso", () => {
  it("sem usuário: não autenticado", () => {
    expect(decidirAcesso(null, "processo.ver", [])).toBe("nao_autenticado");
  });
  it("usa as permissões concedidas no banco", () => {
    expect(decidirAcesso(fin, "nf.registrar", ["nf.registrar"])).toBe("permitido");
    expect(decidirAcesso(fin, "nf.registrar", [])).toBe("negado");
  });
  it("travada é negada mesmo concedida", () => {
    expect(decidirAcesso(fin, "margem.ver", ["margem.ver"])).toBe("negado");
  });
  it("admin com concedidas vazias é permitido, inclusive em travada", () => {
    expect(decidirAcesso(adm, "margem.ver", [])).toBe("permitido");
    expect(decidirAcesso(adm, "processo.ver", [])).toBe("permitido");
  });
  it("perfil desconhecido é negado; permissão desconhecida é negada", () => {
    const x = { id: "u9", nome: "X", perfil: "root" as unknown as Perfil };
    expect(decidirAcesso(x, "processo.ver", ["processo.ver"])).toBe("negado");
    expect(decidirAcesso(adm, "nao.existe" as never, [])).toBe("negado");
  });
});
