import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./login";

// Fica em lib/ (e não em app/entrar/destino.test.ts, como no brief): o vitest só inclui lib/** e scripts/**.
describe("destinoSeguro", () => {
  it.each([
    ["/processos", "/processos"],
    ["/x?y=1", "/x?y=1"],
    ["/x?q=a%2Fb", "/x?q=a%2Fb"],
    ["/x#secao", "/x#secao"],
    ["/", "/"],
    ["/entrarx", "/entrarx"],
    ["/apix", "/apix"],
  ])("aceita caminho relativo: %s", (entrada, saida) => {
    expect(destinoSeguro(entrada)).toBe(saida);
  });

  it.each([
    "//atacante.invalid",
    "/\\atacante.invalid",
    "https://atacante.invalid",
    "javascript:alert(1)",
    "",
    "processos",
    "?x=1",
    "#a",
    // codificados
    "/%2F%2Fatacante.invalid",
    "/%2f/atacante.invalid",
    "/%5Catacante.invalid",
    "/%5catacante.invalid",
    "/%252F%252Fatacante.invalid",
    "/%25252F%25252Fatacante.invalid",
    "/%E0%A4%A",
    // espaço e controle (o parser de URL tira \t e \n: "/\t/x" viraria "//x")
    "/\t/atacante.invalid",
    "/\n/atacante.invalid",
    "/\r/atacante.invalid",
    "/%09/atacante.invalid",
    " /processos",
    "/processos ",
    "/\u0000x",
    "/　x",
    "/%00x",
    // sem laço para a tela de entrada, sem API
    "/entrar",
    "/entrar?volta=/x",
    "/entrar/",
    "/entrar#x",
    "/%65ntrar",
    "/x/../entrar",
    "/./entrar",
    "/api",
    "/api/auth/sign-out",
    "/api/x?y=1",
    "/x/../api/auth/sign-out",
  ])("recusa %j", (entrada) => {
    expect(destinoSeguro(entrada)).toBe("/");
  });

  it("recusa entrada muito longa (mais de 2048)", () => {
    expect(destinoSeguro(`/${"a".repeat(2048)}`)).toBe("/");
    expect(destinoSeguro(`/${"a".repeat(2047)}`)).toBe(`/${"a".repeat(2047)}`);
  });

  it.each([undefined, null, 123, true, {}, ["/processos"], new URL("https://atacante.invalid/x"), new URL("http://localhost/processos")])(
    "não string vira /: %j",
    (entrada) => {
      expect(destinoSeguro(entrada)).toBe("/");
    },
  );
});
