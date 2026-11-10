import type { NextConfig } from "next";
import { seletorDevAtivo } from "./lib/dominio/seguranca/dev";

const nextConfig: NextConfig = {
  // `*.dev.ts(x)` só vira rota com o gate ligado; fora dele `page.dev.tsx` não é rota e nada a importa, então o
  // seletor não entra no build (provado por scripts/verificar-build-producao.sh). "tsx"/"ts" seguem na lista:
  // page.tsx, route.ts e proxy.ts continuam reconhecidos.
  pageExtensions: seletorDevAtivo(process.env) ? ["dev.tsx", "dev.ts", "tsx", "ts"] : ["tsx", "ts"],
};

export default nextConfig;
