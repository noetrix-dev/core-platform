// Roda a suíte no banco isolado `usinagem_test`. Carrega .env.test.local (sem sobrescrever variável já exportada) e só
// chama o Vitest se DATABASE_URL e DATABASE_URL_MIGRACAO apontarem para um banco cujo nome termina em _test; o
// loadEnvFile do vitest.config completa o resto a partir do .env.local. Mensagens fixas: nunca imprimem URL nem credencial.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ARQUIVO = ".env.test.local";

function falha(mensagem: string): never {
  console.error(`FALHA: ${mensagem}`);
  process.exit(1);
}

if (!existsSync(ARQUIVO)) falha(`${ARQUIVO} ausente; a suíte isolada não roda sem ele.`);
process.loadEnvFile(ARQUIVO);

for (const nome of ["DATABASE_URL", "DATABASE_URL_MIGRACAO"] as const) {
  let banco = "";
  try {
    banco = new URL(process.env[nome] ?? "").pathname;
  } catch {
    // URL ausente ou inválida: cai na falha abaixo.
  }
  if (!banco.endsWith("_test")) falha(`${nome} não aponta para um banco cujo nome termina em _test.`);
}

const resultado = spawnSync("pnpm", ["exec", "vitest", "run", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(resultado.status ?? 1);
