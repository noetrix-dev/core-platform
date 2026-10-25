import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../lib/servidor/db/schema";
import { urlLocal } from "../lib/servidor/db/url-local";
import { NOME_PERFIL, PERFIS, type Perfil } from "../lib/dominio/permissoes/perfis";

// Todos os dados abaixo são FICTÍCIOS. Nenhum nome, CNPJ ou e-mail real.
export const USUARIOS_FICTICIOS: { id: string; perfil: Perfil; nome: string }[] = [
  { id: "00000000-0000-4000-8000-000000000001", perfil: "admin", nome: "[FICTÍCIO] Admin Teste" },
  { id: "00000000-0000-4000-8000-000000000002", perfil: "comercial", nome: "[FICTÍCIO] Comercial Teste" },
  { id: "00000000-0000-4000-8000-000000000003", perfil: "compras_producao", nome: "[FICTÍCIO] Compras Teste" },
  { id: "00000000-0000-4000-8000-000000000004", perfil: "financeiro", nome: "[FICTÍCIO] Financeiro Teste" },
  { id: "00000000-0000-4000-8000-000000000005", perfil: "tecnico", nome: "[FICTÍCIO] Técnico Teste" },
];

const CLIENTES = [
  { id: "00000000-0000-4000-8000-000000000101", razaoSocial: "[FICTÍCIO] Metalúrgica Alfa Ltda" },
  { id: "00000000-0000-4000-8000-000000000102", razaoSocial: "[FICTÍCIO] Indústria Beta S.A." },
];

const ADMIN = USUARIOS_FICTICIOS[0].id;
const COMERCIAL = USUARIOS_FICTICIOS[1].id;

// processos não guarda letra: o número exibido usa a letra da revisão de maior `sequencia`.
const PROCESSOS = [
  { id: "00000000-0000-4000-8000-000000000201", numero: 9001, clienteId: CLIENTES[0].id, titulo: "[FICTÍCIO] Polia dentada 40 dentes", situacaoComercial: "cotacao_aberta" },
  { id: "00000000-0000-4000-8000-000000000202", numero: 9002, clienteId: CLIENTES[1].id, titulo: "[FICTÍCIO] Eixo retificado", situacaoComercial: "cotacao_enviada" },
  { id: "00000000-0000-4000-8000-000000000203", numero: 9003, clienteId: CLIENTES[0].id, titulo: "[FICTÍCIO] Flange usinado", situacaoComercial: "aprovado" },
];

// 9002 tem duas revisões: A (sequencia 1, substituída) e B (sequencia 2, vigente). Exibe 9002-B.
const REVISOES = [
  { id: "00000000-0000-4000-8000-000000000301", processoId: PROCESSOS[0].id, sequencia: 1, letra: "A", estado: "preco_pendente", criadoPor: COMERCIAL },
  { id: "00000000-0000-4000-8000-000000000304", processoId: PROCESSOS[1].id, sequencia: 1, letra: "A", estado: "substituida", criadoPor: COMERCIAL, precificadaPor: ADMIN },
  { id: "00000000-0000-4000-8000-000000000302", processoId: PROCESSOS[1].id, sequencia: 2, letra: "B", estado: "enviada", criadoPor: COMERCIAL, precificadaPor: ADMIN },
  { id: "00000000-0000-4000-8000-000000000303", processoId: PROCESSOS[2].id, sequencia: 1, letra: "A", estado: "aprovada", criadoPor: COMERCIAL, precificadaPor: ADMIN, aprovadaPor: COMERCIAL },
];

const ITENS = [
  { id: "00000000-0000-4000-8000-000000000401", revisaoId: REVISOES[0].id, ordem: 1, descricao: "[FICTÍCIO] Polia dentada aço 1045", quantidade: 20, precoUnitarioCentavos: null },
  { id: "00000000-0000-4000-8000-000000000404", revisaoId: REVISOES[1].id, ordem: 1, descricao: "[FICTÍCIO] Eixo Ø40 x 300", quantidade: 10, precoUnitarioCentavos: 19_900 },
  { id: "00000000-0000-4000-8000-000000000402", revisaoId: REVISOES[2].id, ordem: 1, descricao: "[FICTÍCIO] Eixo Ø40 x 300", quantidade: 10, precoUnitarioCentavos: 18_500 },
  { id: "00000000-0000-4000-8000-000000000403", revisaoId: REVISOES[3].id, ordem: 1, descricao: "[FICTÍCIO] Flange DN100", quantidade: 40, precoUnitarioCentavos: 9_990 },
];

export async function semear(banco: NodePgDatabase<typeof schema>): Promise<void> {
  await banco.transaction(async (tx) => {
    await tx.insert(schema.perfis).values(PERFIS.map((id) => ({ id, nome: NOME_PERFIL[id] }))).onConflictDoNothing();
    await tx
      .insert(schema.usuarios)
      .values(USUARIOS_FICTICIOS.map((u) => ({ id: u.id, nome: u.nome, email: `${u.perfil}@ficticio.invalid`, perfilId: u.perfil, ficticio: true })))
      .onConflictDoNothing();
    await tx.insert(schema.clientes).values(CLIENTES.map((c) => ({ ...c, ficticio: true }))).onConflictDoNothing();
    await tx.insert(schema.processos).values(PROCESSOS.map((p) => ({ ...p, criadoPor: COMERCIAL, ficticio: true }))).onConflictDoNothing();
    await tx.insert(schema.revisoesComerciais).values(REVISOES).onConflictDoNothing();
    await tx.insert(schema.itensRevisao).values(ITENS).onConflictDoNothing();
    await tx.insert(schema.sequenciasNumeracao).values({ nome: "processo", proximo: 9004 }).onConflictDoNothing();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Role da aplicação (DATABASE_URL), nunca a de migração.
  const banco = drizzle(urlLocal(process.env.DATABASE_URL), { schema });
  semear(banco)
    .then(() => console.log("Seed fictício aplicado."))
    .finally(() => banco.$client.end());
}
