import { tenantDb } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { visitasPorCliente } from "@/lib/clientes/resumo";
import { ListaClientes } from "@/components/ListaClientes";
import { requireUser } from "@/lib/supabase/auth";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function ClientesPage() {
  await requireUser();
  const db = tenantDb();
  const [cliRes, atendRes] = await Promise.all([
    db.from("clientes").select("id, nome, telefone").eq("ativo", true).order("nome"),
    db
      .from("atendimentos")
      .select("cliente_id, realizado_em")
      // ponytail: teto explícito (PostgREST corta em db-max-rows silenciosamente).
      // Upgrade real: RPC/view com count(*) group by cliente_id.
      .limit(50000),
  ]);
  if (cliRes.error) throw new Error(`clientes: ${cliRes.error.message}`);
  if (atendRes.error) throw new Error(`clientes/atendimentos: ${atendRes.error.message}`);

  const vpc = visitasPorCliente(
    ((atendRes.data ?? []) as Row[]).map((a) => ({
      cliente_id: a.cliente_id as string,
      realizado_em: a.realizado_em as string,
    })),
  );

  const clientes = ((cliRes.data ?? []) as Row[]).map((c) => {
    const v = vpc.get(c.id as string);
    return {
      id: c.id as string,
      nome: c.nome as string,
      telefone: c.telefone as string,
      total_visitas: v?.total ?? 0,
      ultima_visita: v?.ultima ?? null,
    };
  });

  return (
    <div className={styles.shell}>
      <Topbar titulo="Clientes" />
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <ListaClientes clientes={clientes} />
      </main>
    </div>
  );
}
