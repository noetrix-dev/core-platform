import { defineConfig } from "vitest/config";

// Carrega DATABASE_URL local para os testes de integração; ausente = testes de banco pulados.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
