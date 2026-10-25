import { defineConfig } from "drizzle-kit";
import { urlLocal } from "./lib/servidor/db/url-local";

try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/servidor/db/schema.ts",
  out: "./drizzle",
  // Só o drizzle-kit usa a role de migração; app e seed usam DATABASE_URL.
  dbCredentials: { url: urlLocal(process.env.DATABASE_URL_MIGRACAO) },
});
