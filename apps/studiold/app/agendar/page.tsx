// Rota pública /agendar. Sem requireUser() — ver comentário no topo de
// ./actions.ts (intencional, não esquecido).

import { IdentificacaoForm } from "./IdentificacaoForm";
import styles from "@/app/agenda/agenda.module.css";

export const metadata = { title: "Agendar — StudiOLD" };

export default function AgendarPage() {
  return (
    <div className={styles.shell}>
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
        <h1 className={`${styles.pageTitle} mb-1`}>Agendar horário</h1>
        <p className={`${styles.msgQuiet} mb-6`}>
          Confirme seu telefone pra começar.
        </p>
        <IdentificacaoForm />
      </main>
    </div>
  );
}
