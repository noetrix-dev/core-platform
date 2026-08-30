import { Icon } from "@/components/agenda/Icon";
import { tenantDb } from "@/lib/supabase/server";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";

export const dynamic = "force-dynamic";

type Estilo = { id: string; nome: string; ativo: boolean };

export default async function EstilosPage() {
  const res = await tenantDb()
    .from("estilos_musica")
    .select("id, nome, ativo")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/estilos: ${res.error.message}`);
  const estilos = (res.data ?? []) as Estilo[];

  return (
    <section className={styles.cfgSection}>
      <header>
        <Icon name="music" size={15} /> Estilos de música
      </header>

      <form action={A.criarEstilo} className={styles.cfgAddbar}>
        <input
          name="nome"
          placeholder="Novo estilo"
          aria-label="Nome do novo estilo"
          required
          maxLength={120}
        />
        <button
          type="submit"
          className={`${styles.btn} ${styles["btn--primary"]}`}
        >
          <Icon name="plus" size={14} /> Adicionar
        </button>
      </form>

      {estilos.length === 0 && (
        <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
          Nenhum estilo cadastrado.
        </p>
      )}

      {estilos.map((e) => (
        <div
          key={e.id}
          className={styles.cfgRow}
          data-inativo={e.ativo ? undefined : "true"}
        >
          <p className={styles.cfgRow__nome}>{e.nome}</p>

          <div className={styles.cfgRow__acoes}>
            <form action={A.toggleEstiloAtivo}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="ativo" value={String(!e.ativo)} />
              <button
                type="submit"
                className={styles.cfgSwitch}
                data-on={e.ativo}
                aria-label={`${e.ativo ? "Desativar" : "Ativar"} ${e.nome}`}
              />
            </form>
          </div>

          <details className={styles.cfgEdit}>
            <summary
              className={`${styles.cfgSummary} ${styles.btn} ${styles["btn--ghost"]}`}
            >
              Editar
            </summary>
            <form action={A.editarEstilo}>
              <input type="hidden" name="id" value={e.id} />
              <input
                name="nome"
                defaultValue={e.nome}
                aria-label={`Nome de ${e.nome}`}
                required
                maxLength={120}
              />
              <button
                type="submit"
                className={`${styles.btn} ${styles["btn--primary"]}`}
              >
                Salvar
              </button>
            </form>
          </details>
        </div>
      ))}
    </section>
  );
}
