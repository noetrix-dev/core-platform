import { describe, expect, it } from "vitest";
import { formatarDataHora } from "./formato";

describe("formatarDataHora", () => {
  it("exibe em America/Sao_Paulo (UTC-3)", () => {
    const s = formatarDataHora("2026-10-24T15:00:00Z");
    expect(s).toContain("24/10/2026");
    expect(s).toContain("12:00");
  });
  it("vira o dia corretamente", () => {
    expect(formatarDataHora("2026-10-25T01:30:00Z")).toContain("24/10/2026");
  });
});
