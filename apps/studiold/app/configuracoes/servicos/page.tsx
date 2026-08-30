import { Icon } from "@/components/agenda/Icon";
import { tenantDb } from "@/lib/supabase/server";
import { fmtPreco } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";

export const dynamic = "force-dynamic";

type Servico = {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
};

export default async function ServicosPage() {
  const res = await tenantDb()
    .from("servicos")
    .select("id, nome, preco, duracao_minutos, ativo")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/servicos: ${res.error.message}`);
  const servicos = ((res.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.id as string,
    nome: s.nome as string,
    preco: Number(s.preco),
    duracao_minutos: s.duracao_minutos as number,
    ativo: s.ativo as boolean,
  })) satisfies Servico[];

  return (
    <section className={styles.cfgSection}>
      <header>
        <Icon name="scissors" size={15} /> Serviços
      </header>

      <form action={A.criarServico} className={styles.cfgAddbar}>
        <input
          name="nome"
          placeholder="Novo serviço"
          aria-label="Nome do novo serviço"
          required
          maxLength={120}
        />
        <input
          name="preco"
          inputMode="decimal"
          pattern="[0-9.]*[0-9]([,][0-9]{1,2})?"
          title="Use apenas números, vírgula para centavos. Ex.: 55,50"
          placeholder="Preço (R$)"
          aria-label="Preço do novo serviço"
          required
        />
        <input
          type="number"
          name="duracao_minutos"
          min={1}
          max={600}
          placeholder="min"
          aria-label="Duração em minutos do novo serviço"
          required
        />
        <button
          type="submit"
          className={`${styles.btn} ${styles["btn--primary"]}`}
        >
          <Icon name="plus" size={14} /> Adicionar
        </button>
      </form>

      {servicos.length === 0 && (
        <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
          Nenhum serviço cadastrado.
        </p>
      )}

      {servicos.map((s) => (
        <div
          key={s.id}
          className={styles.cfgRow}
          data-inativo={s.ativo ? undefined : "true"}
        >
          <div>
            <p className={styles.cfgRow__nome}>{s.nome}</p>
            <p className={styles.cfgRow__meta}>
              {fmtPreco(s.preco)} · {s.duracao_minutos} min
            </p>
          </div>

          <div className={styles.cfgRow__acoes}>
            <form action={A.toggleServicoAtivo}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="ativo" value={String(!s.ativo)} />
              <button
                type="submit"
                className={styles.cfgSwitch}
                data-on={s.ativo}
                aria-label={`${s.ativo ? "Desativar" : "Ativar"} ${s.nome}`}
              />
            </form>
          </div>

          <details className={styles.cfgEdit}>
            <summary
              className={`${styles.cfgSummary} ${styles.btn} ${styles["btn--ghost"]}`}
            >
              Editar
            </summary>
            <form action={A.editarServico}>
              <input type="hidden" name="id" value={s.id} />
              <input
                name="nome"
                defaultValue={s.nome}
                aria-label={`Nome de ${s.nome}`}
                required
                maxLength={120}
              />
              <input
                name="preco"
                inputMode="decimal"
                pattern="[0-9.]*[0-9]([,][0-9]{1,2})?"
                title="Use apenas números, vírgula para centavos. Ex.: 55,50"
                defaultValue={String(s.preco).replace(".", ",")}
                aria-label={`Preço de ${s.nome}`}
                required
              />
              <input
                type="number"
                name="duracao_minutos"
                defaultValue={s.duracao_minutos}
                min={1}
                max={600}
                aria-label={`Duração de ${s.nome}`}
                required
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
