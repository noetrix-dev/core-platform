import { describe, expect, it } from "vitest";
import { seletorDevAtivo } from "./dev";

describe("gate do seletor de dev", () => {
  it("só abre com development + ENABLE_DEV_SWITCHER=1", () => {
    expect(seletorDevAtivo({ NODE_ENV: "development", ENABLE_DEV_SWITCHER: "1" })).toBe(true);
  });
  it.each([
    [{ NODE_ENV: "production", ENABLE_DEV_SWITCHER: "1" }],
    [{ NODE_ENV: "test", ENABLE_DEV_SWITCHER: "1" }],
    [{ NODE_ENV: "development" }],
    [{ NODE_ENV: "development", ENABLE_DEV_SWITCHER: "true" }],
    [{ NODE_ENV: "development", ENABLE_DEV_SWITCHER: "0" }],
    [{ NODE_ENV: "development", ENABLE_DEV_SWITCHER: " 1" }],
    [{ NODE_ENV: "development", ENABLE_DEV_SWITCHER: "1 " }],
    [{ ENABLE_DEV_SWITCHER: "1" }],
    [{}],
  ])("falha fechado em %j", (env) => {
    expect(seletorDevAtivo(env)).toBe(false);
  });
});
