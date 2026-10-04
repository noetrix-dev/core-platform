// Rota pública /agendar. Sem requireUser() — ver comentário no topo de
// ./actions.ts (intencional, não esquecido). Com sessão válida (cookie
// agendar_sessao) o wizard abre direto em Serviços; ?remarcar=<id> pré-marca
// os serviços do agendamento (dono e status conferidos aqui, no servidor);
// ?destino=meus-agendamentos manda a identificação de volta pra lá.
import { lerSessao, segredoConfigurado } from "@/lib/agendar/sessao";
import { lerAgendamentoDoCliente, nomeDoCliente } from "@/lib/agendar/meus";
import { ehRemarcavel } from "@/lib/agendar/formato";
import { AgendarWizard, type InicialWizard } from "./AgendarWizard";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agendar — StudiOLD" };

// Fora do componente: o lint de pureza (react-hooks/purity) não aceita Date.now() no render.
const agora = () => Date.now();

type Busca = { remarcar?: string | string[]; destino?: string | string[] };

export default async function AgendarPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const destino = busca.destino === "meus-agendamentos" ? "meus-agendamentos" : null;
  const remarcarId = typeof busca.remarcar === "string" ? busca.remarcar : null;

  const sessao = segredoConfigurado() ? await lerSessao() : null;
  let inicial: InicialWizard | null = null;
  if (sessao) {
    const nome = await nomeDoCliente(sessao.clienteId);
    if (nome) {
      inicial = { nome, servicoIds: [], remarcar: null, aviso: null };
      if (remarcarId) {
        // id de outro cliente / inexistente / malformado → null → ignorado em silêncio
        const ag = await lerAgendamentoDoCliente(sessao.clienteId, remarcarId);
        if (ag && ehRemarcavel(ag, agora())) {
          inicial = { ...inicial, servicoIds: ag.servicoIds, remarcar: { id: ag.id, data: ag.data, hora: ag.hora } };
        } else if (ag) {
          inicial = { ...inicial, aviso: "Esse agendamento não pode mais ser remarcado. Escolha um novo horário." };
        }
      }
    }
  }

  return (
    <div className={styles.shell}>
      <AgendarWizard key={sessao?.clienteId ?? "anon"} inicial={inicial} destino={destino} />
    </div>
  );
}
