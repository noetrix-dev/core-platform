import { describe, expect, it } from "vitest";
import { filtrarCaminhoAuth } from "./handler-auth";

const ORIGEM = "http://localhost:3000";
const req = (metodo: string, caminho: string) => new Request(`${ORIGEM}${caminho}`, { method: metodo });

describe("filtrarCaminhoAuth", () => {
  // As 3 chamadas como o cliente do Better Auth as envia (client/config.mjs:62,70; client/session-atom.mjs:55).
  it.each([
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/sign-out"],
    ["GET", "/api/auth/get-session"],
    // useSession pode mandar query (session-atom.mjs:57): a query é ignorada, o caminho é exato.
    ["GET", "/api/auth/get-session?disableCookieCache=true"],
    ["POST", "/api/auth/sign-in/email?x=1"],
    // Método em minúsculas: o construtor do Request normaliza para maiúsculas (Fetch spec).
    ["post", "/api/auth/sign-out"],
    // WHATWG URL resolve `..` (também %2e%2e) antes de qualquer um ver o caminho; o roteador do Better Auth
    // usa o mesmo req.url (better-call router.mjs:29), então a decisão é a mesma dele: cai num permitido.
    ["POST", "/api/auth/x/%2e%2e/sign-out"],
    // WHATWG troca `\` por `/` em URL especial e remove tab e nova linha (URL Standard, path state e "remove all ASCII
    // tab or newline"). Request e o roteador do Better Auth (better-call router.mjs:29) leem o mesmo req.url já
    // normalizado, então `/sign-in/email` é o que os dois veem: aceito pelos dois.
    ["POST", "/api/auth/sign-in\\email"],
    ["POST", "/api/auth/sign-in/\temail"],
    ["POST", "/api/auth/sign-in/em\nail"],
  ])("%s %s é permitido", (metodo, caminho) => {
    expect(filtrarCaminhoAuth(req(metodo, caminho))).toBe(true);
  });

  it.each([
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/update-user"],
    ["POST", "/api/auth/change-email"],
    ["POST", "/api/auth/change-password"],
    ["POST", "/api/auth/delete-user"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/revoke-sessions"],
    ["POST", "/api/auth/request-password-reset"],
    ["POST", "/api/auth/reset-password"],
    // Método errado.
    ["GET", "/api/auth/sign-in/email"],
    ["GET", "/api/auth/sign-out"],
    ["POST", "/api/auth/get-session"],
    ["HEAD", "/api/auth/get-session"],
    ...["OPTIONS", "PATCH", "DELETE", "PUT"].flatMap((m) =>
      ["/api/auth/sign-in/email", "/api/auth/sign-out", "/api/auth/get-session"].map((c): [string, string] => [m, c]),
    ),
    // Parâmetro de caminho com ponto e vírgula: WHATWG mantém `;` no pathname; nem o filtro nem o roteador aceitam.
    ["POST", "/api/auth/sign-in/email;x=1"],
    ["GET", "/api/auth/get-session;jsessionid=a"],
    // Duplo encode: WHATWG decodifica nada; `%252e` e `%252F` seguem literais no pathname.
    ["POST", "/api/auth/%252e%252e/update-user"],
    ["POST", "/api/auth/sign-in%252Femail"],
    // `\` que normaliza para fora da lista continua recusado.
    ["POST", "/api/auth/sign-in\\email\\..\\..\\update-user"],
    // Dot segments resolvidos para fora da lista.
    ["POST", "/api/auth/sign-in/email/../update-user"],
    ["POST", "/api/auth/sign-in/email/%2e%2e/update-user"],
    ["POST", "/api/auth/sign-in/email/%2E%2E/update-user"],
    // Caixa, barra final, barra codificada, barra dupla.
    ["POST", "/api/auth/SIGN-IN/EMAIL"],
    ["POST", "/api/auth/Sign-Out"],
    ["POST", "/api/auth/sign-in/email/"],
    ["POST", "/api/auth/sign-in/email/?x=1"],
    ["POST", "/api/auth/sign-in%2Femail"],
    ["POST", "/api/auth/sign-in%2femail"],
    ["POST", "/api/auth//sign-out"],
    ["POST", "/api/auth/sign-in//email"],
    ["POST", "/api/auth/sign-out%00"],
    ["POST", "/api/auth/sign-out.json"],
    ["POST", "/api/auth/sign-out/x"],
    // Caminho percent-encoded de letra: WHATWG não decodifica; o roteador também não acharia.
    ["POST", "/api/auth/sign-o%75t"],
    // A base e vizinhos dela.
    ["GET", "/api/auth"],
    ["GET", "/api/auth/"],
    ["POST", "/api/authsign-out"],
    ["POST", "/api/authx/sign-out"],
    ["POST", "/API/AUTH/sign-out"],
    ["POST", "/sign-out"],
    ["POST", "/x/api/auth/sign-out"],
  ])("%s %s é recusado", (metodo, caminho) => {
    expect(filtrarCaminhoAuth(req(metodo, caminho))).toBe(false);
  });

  it("respeita a base passada", () => {
    expect(filtrarCaminhoAuth(req("POST", "/auth/sign-out"), "/auth")).toBe(true);
    expect(filtrarCaminhoAuth(req("POST", "/api/auth/sign-out"), "/auth")).toBe(false);
  });
});
