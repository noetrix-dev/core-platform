// Rota pública /agendar/meus-agendamentos (Spec C). Sem requireUser() —
// identidade só pelo cookie agendar_sessao (ver app/agendar/actions.ts).
import { redirect } from "next/navigation";
import { lerSessao, segredoConfigurado } from "@/lib/agendar/sessao";
import { carregarMeusAgendamentos, nomeDoCliente } from "@/lib/agendar/meus";
import { MeusAgendamentos } from "./MeusAgendamentos";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus agendamentos — StudiOLD" };

const ENTRAR = "/agendar?destino=meus-agendamentos";

export default async function MeusAgendamentosPage() {
  const sessao = segredoConfigurado() ? await lerSessao() : null;
  if (!sessao) redirect(ENTRAR);

  const [nome, lista] = await Promise.all([
    nomeDoCliente(sessao.clienteId),
    carregarMeusAgendamentos(sessao.clienteId),
  ]);
  if (!nome) redirect(ENTRAR); // cliente desativado depois da verificação

  return (
    <div className={styles.shell}>
      <MeusAgendamentos nome={nome} lista={lista} />
    </div>
  );
}
