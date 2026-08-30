import { tenantDb } from "@/lib/supabase/server";
import { Icon } from "@/components/agenda/Icon";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";
import { EstoqueEditavel } from "../EstoqueEditavel";

export const dynamic = "force-dynamic";

type Cortesia = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  quantidade_estoque: number;
};

export default async function CortesiasPage() {
  const res = await tenantDb()
    .from("cortesias")
    .select("id, nome, descricao, ativo, quantidade_estoque")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/cortesias: ${res.error.message}`);
  const cortesias = (res.data ?? []) as Cortesia[];

  return (
    <section className={styles.cfgSection}>
      <header>
        <Icon name="cup" size={15} /> Cortesias
      </header>

      <form action={A.criarCortesia} className={styles.cfgAddbar}>
        <input
          name="nome"
          placeholder="Nova cortesia"
          aria-label="Nome da nova cortesia"
          required
          maxLength={120}
        />
        <input
          name="descricao"
          placeholder="Descrição (opcional)"
          aria-label="Descrição da nova cortesia"
          maxLength={280}
        />
        <button
          type="submit"
          className={`${styles.btn} ${styles["btn--primary"]}`}
        >
          <Icon name="plus" size={14} /> Adicionar
        </button>
      </form>

      {cortesias.length === 0 && (
        <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
          Nenhuma cortesia cadastrada.
        </p>
      )}

      {cortesias.map((c) => (
        <div
          key={c.id}
          className={styles.cfgRow}
          data-inativo={c.ativo ? undefined : "true"}
        >
          <div>
            <p className={styles.cfgRow__nome}>{c.nome}</p>
            {c.descricao && (
              <p className={styles.cfgRow__meta}>{c.descricao}</p>
            )}
            <p className={styles.cfgRow__meta}>
              Estoque:{" "}
              <EstoqueEditavel
                id={c.id}
                valor={c.quantidade_estoque}
                nome={c.nome}
              />
            </p>
          </div>

          <div className={styles.cfgRow__acoes}>
            <form action={A.adicionarEstoque} className={styles.cfgEstoque}>
              <input type="hidden" name="id" value={c.id} />
              <input
                type="number"
                name="n"
                defaultValue={10}
                min={1}
                max={9999}
                aria-label={`Unidades a somar no estoque de ${c.nome}`}
              />
              <button
                type="submit"
                className={`${styles.btn} ${styles["btn--ghost"]}`}
                aria-label={`Somar ao estoque de ${c.nome}`}
              >
                <Icon name="plus" size={13} /> Adicionar
              </button>
            </form>

            <form action={A.toggleCortesiaAtivo}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="ativo" value={String(!c.ativo)} />
              <button
                type="submit"
                className={styles.cfgSwitch}
                data-on={c.ativo}
                aria-label={`${c.ativo ? "Desativar" : "Ativar"} ${c.nome}`}
              />
            </form>
          </div>

          <details className={styles.cfgEdit}>
            <summary
              className={`${styles.cfgSummary} ${styles.btn} ${styles["btn--ghost"]}`}
            >
              Editar
            </summary>
            <form action={A.editarCortesia}>
              <input type="hidden" name="id" value={c.id} />
              <input
                name="nome"
                defaultValue={c.nome}
                aria-label={`Nome de ${c.nome}`}
                required
                maxLength={120}
              />
              <input
                name="descricao"
                defaultValue={c.descricao ?? ""}
                placeholder="Descrição"
                aria-label={`Descrição de ${c.nome}`}
                maxLength={280}
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
