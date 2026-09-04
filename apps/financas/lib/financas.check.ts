import assert from "node:assert/strict";
import { somaMesesISO, fimDoMesISO } from "./datas.ts";

// --- datas ---
assert.equal(somaMesesISO("2026-01-15", 1), "2026-02-15");
assert.equal(somaMesesISO("2026-01-31", 1), "2026-02-28", "clamp fev");
assert.equal(somaMesesISO("2026-11-30", 1), "2026-12-30");
assert.equal(somaMesesISO("2026-12-10", 1), "2027-01-10", "vira ano");
assert.equal(somaMesesISO("2026-01-31", 13), "2027-02-28", "clamp + ano");
assert.equal(fimDoMesISO("2026-02-10"), "2026-02-28");
assert.equal(fimDoMesISO("2024-02-10"), "2024-02-29", "bissexto");
assert.equal(fimDoMesISO("2026-07-01"), "2026-07-31");

console.log("financas.check: OK");
