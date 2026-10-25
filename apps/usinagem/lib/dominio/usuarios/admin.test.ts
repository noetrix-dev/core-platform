import { describe, expect, it } from "vitest";
import { reautenticacaoRecente, validarAlteracaoUsuario } from "./admin";

const um = [
  { id: "a", perfil: "admin" as const, ativo: true },
  { id: "c", perfil: "comercial" as const, ativo: true },
];

describe("invariantes de usuário", () => {
  it("última conta Admin não pode ser desativada", () => {
    expect(validarAlteracaoUsuario(um, "a", { ativo: false }).ok).toBe(false);
  });
  it("última conta Admin não pode perder o perfil", () => {
    expect(validarAlteracaoUsuario(um, "a", { perfil: "financeiro" }).ok).toBe(false);
  });
  it("com outro Admin ativo, pode", () => {
    const dois = [...um, { id: "b", perfil: "admin" as const, ativo: true }];
    expect(validarAlteracaoUsuario(dois, "a", { ativo: false }).ok).toBe(true);
    expect(validarAlteracaoUsuario(dois, "a", { perfil: "financeiro" }).ok).toBe(true);
  });
  it("Admin inativo não conta como outro Admin", () => {
    const comInativo = [...um, { id: "b", perfil: "admin" as const, ativo: false }];
    expect(validarAlteracaoUsuario(comInativo, "a", { ativo: false }).ok).toBe(false);
  });
  it("alterar não Admin é livre", () => {
    expect(validarAlteracaoUsuario(um, "c", { ativo: false }).ok).toBe(true);
  });
  it("usuário alvo desconhecido é recusado", () => {
    expect(validarAlteracaoUsuario(um, "zzz", { ativo: false }).ok).toBe(false);
  });
  it("reautenticação vale 10 minutos", () => {
    const t0 = new Date("2026-10-24T10:00:00Z");
    expect(reautenticacaoRecente(t0, new Date("2026-10-24T10:09:59Z"))).toBe(true);
    expect(reautenticacaoRecente(t0, new Date("2026-10-24T10:10:01Z"))).toBe(false);
  });
  it("fronteira exata de 10 minutos ainda vale", () => {
    const t0 = new Date("2026-10-24T10:00:00Z");
    expect(reautenticacaoRecente(t0, new Date("2026-10-24T10:10:00Z"))).toBe(true);
  });
});
