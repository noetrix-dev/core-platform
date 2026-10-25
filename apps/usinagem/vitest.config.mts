import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Carrega DATABASE_URL local para os testes de banco. Sem ela: fora do CI os testes de banco
// são pulados com aviso; no CI eles falham (política em lib/servidor/db/teste-banco.ts).
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  resolve: {
    // Em teste não há Next: o `server-only` aponta para o módulo vazio do próprio pacote.
    alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
