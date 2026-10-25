export const PERFIS = ["admin", "comercial", "compras_producao", "financeiro", "tecnico"] as const;
export type Perfil = (typeof PERFIS)[number];

export const NOME_PERFIL: Record<Perfil, string> = {
  admin: "Admin",
  comercial: "Comercial",
  compras_producao: "Compras/Produção",
  financeiro: "Financeiro",
  tecnico: "Desenhista/Técnico",
};
