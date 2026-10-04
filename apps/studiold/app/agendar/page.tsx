// Rota pública /agendar. Sem requireUser() — ver comentário no topo de
// ./actions.ts (intencional, não esquecido).

import { AgendarWizard } from "./AgendarWizard";
import styles from "@/app/agenda/agenda.module.css";

export const metadata = { title: "Agendar — StudiOLD" };

export default function AgendarPage() {
  return (
    <div className={styles.shell}>
      <AgendarWizard />
    </div>
  );
}
