import { Icon } from "@/components/agenda/Icon";
import { tenantDb } from "@/lib/supabase/server";
import { fmtPreco } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "../actions";
import { EstoqueProdutoEditavel } from "../EstoqueProdutoEditavel";

export const dynamic = "force-dynamic";

type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_venda: number;
  quantidade_estoque: number;
  ativo: boolean;
};

export default async function ProdutosPage() {
  const res = await tenantDb()
    .from("produtos")
    .select("id, nome, descricao, preco_venda, quantidade_estoque, ativo")
    .order("nome");
  if (res.error) throw new Error(`configuracoes/produtos: ${res.error.message}`);
  const produtos = ((res.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    descricao: (p.descricao as string) ?? null,
    preco_venda: Number(p.preco_venda),
    quantidade_estoque: (p.quantidade_estoque as number) ?? 0,
    ativo: p.ativo as boolean,
  })) satisfies Produto[];

  return (
    <section className={styles.cfgSection}>
      <header>
        <Icon name="box" size={15} /> Produtos
      </header>

      <form action={A.criarProduto} className={styles.cfgAddbar}>
        <input
          name="nome"
          placeholder="Novo produto"
          aria-label="Nome do novo produto"
          required
          maxLength={120}
        />
        <input
          name="preco_venda"
          inputMode="decimal"
          pattern="[0-9.]*[0-9]([,][0-9]{1,2})?"
          title="Use apenas números, vírgula para centavos. Ex.: 25,90"
          placeholder="Preço (R$)"
          aria-label="Preço de venda do novo produto"
          required
        />
        <input
          name="descricao"
          placeholder="Descrição (opcional)"
          aria-label="Descrição do novo produto"
          maxLength={280}
        />
        <input
          type="number"
          name="quantidade_estoque"
          min={0}
          max={99999}
          defaultValue={0}
          placeholder="Estoque"
          aria-label="Estoque inicial do novo produto"
        />
        <button
          type="submit"
          className={`${styles.btn} ${styles["btn--primary"]}`}
        >
          <Icon name="plus" size={14} /> Adicionar
        </button>
      </form>

      {produtos.length === 0 && (
        <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
          Nenhum produto cadastrado.
        </p>
      )}

      {produtos.map((p) => (
        <div
          key={p.id}
          className={styles.cfgRow}
          data-inativo={p.ativo ? undefined : "true"}
        >
          <div>
            <p className={styles.cfgRow__nome}>{p.nome}</p>
            {p.descricao && (
              <p className={styles.cfgRow__meta}>{p.descricao}</p>
            )}
            <p className={styles.cfgRow__meta}>
              {fmtPreco(p.preco_venda)} · Estoque:{" "}
              <EstoqueProdutoEditavel
                id={p.id}
                valor={p.quantidade_estoque}
                nome={p.nome}
              />
            </p>
          </div>

          <div className={styles.cfgRow__acoes}>
            <form action={A.toggleProdutoAtivo}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="ativo" value={String(!p.ativo)} />
              <button
                type="submit"
                className={styles.cfgSwitch}
                data-on={p.ativo}
                aria-label={`${p.ativo ? "Desativar" : "Ativar"} ${p.nome}`}
              />
            </form>
          </div>

          <details className={styles.cfgEdit}>
            <summary
              className={`${styles.cfgSummary} ${styles.btn} ${styles["btn--ghost"]}`}
            >
              Editar
            </summary>
            <form action={A.editarProduto}>
              <input type="hidden" name="id" value={p.id} />
              <input
                name="nome"
                defaultValue={p.nome}
                aria-label={`Nome de ${p.nome}`}
                required
                maxLength={120}
              />
              <input
                name="preco_venda"
                inputMode="decimal"
                pattern="[0-9.]*[0-9]([,][0-9]{1,2})?"
                title="Use apenas números, vírgula para centavos. Ex.: 25,90"
                defaultValue={String(p.preco_venda).replace(".", ",")}
                aria-label={`Preço de ${p.nome}`}
                required
              />
              <input
                name="descricao"
                defaultValue={p.descricao ?? ""}
                placeholder="Descrição"
                aria-label={`Descrição de ${p.nome}`}
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
