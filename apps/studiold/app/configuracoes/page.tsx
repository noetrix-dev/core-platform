import { tenantDb } from "@/lib/supabase/server";
import { Icon } from "@/components/agenda/Icon";
import { Topbar } from "@/components/Topbar";
import { fmtPreco } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";
import * as A from "./actions";
import { EstoqueEditavel } from "./EstoqueEditavel";
import { HorariosForm } from "./HorariosForm";

export const dynamic = "force-dynamic";

type Cortesia = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  quantidade_estoque: number;
};
type Estilo = { id: string; nome: string; ativo: boolean };
type Servico = {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
};

export default async function ConfiguracoesPage() {
  const db = tenantDb();
  const [cRes, eRes, sRes, hRes, bRes] = await Promise.all([
    db
      .from("cortesias")
      .select("id, nome, descricao, ativo, quantidade_estoque")
      .order("nome"),
    db.from("estilos_musica").select("id, nome, ativo").order("nome"),
    db
      .from("servicos")
      .select("id, nome, preco, duracao_minutos, ativo")
      .order("nome"),
    db
      .from("horarios_funcionamento")
      .select("dia_semana, aberto, hora_abertura, hora_fechamento")
      .order("dia_semana"),
    db
      .from("bloqueios_fixos")
      .select("id, hora_inicio, hora_fim")
      .eq("tipo", "suave")
      .eq("ativo", true)
      .is("dia_semana", null)
      .limit(1),
  ]);
  if (cRes.error) throw new Error(`configuracoes/cortesias: ${cRes.error.message}`);
  if (eRes.error) throw new Error(`configuracoes/estilos: ${eRes.error.message}`);
  if (sRes.error) throw new Error(`configuracoes/servicos: ${sRes.error.message}`);
  if (hRes.error) throw new Error(`configuracoes/horarios: ${hRes.error.message}`);
  if (bRes.error) throw new Error(`configuracoes/bloqueios: ${bRes.error.message}`);

  const cortesias = (cRes.data ?? []) as Cortesia[];
  const estilos = (eRes.data ?? []) as Estilo[];
  const servicos = ((sRes.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.id as string,
    nome: s.nome as string,
    preco: Number(s.preco),
    duracao_minutos: s.duracao_minutos as number,
    ativo: s.ativo as boolean,
  })) satisfies Servico[];
  const dias = ((hRes.data ?? []) as Array<Record<string, unknown>>).map((h) => ({
    dia_semana: h.dia_semana as number,
    aberto: (h.aberto as boolean) ?? false,
    hora_abertura: ((h.hora_abertura as string) ?? "").slice(0, 5),
    hora_fechamento: ((h.hora_fechamento as string) ?? "").slice(0, 5),
  }));
  const b0 = ((bRes.data ?? []) as Array<Record<string, unknown>>)[0];
  const almoco = b0
    ? {
        id: b0.id as string,
        hora_inicio: (b0.hora_inicio as string).slice(0, 5),
        hora_fim: (b0.hora_fim as string).slice(0, 5),
      }
    : null;

  return (
    <div className={styles.shell}>
      <Topbar titulo="Configurações" />

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
        {/* ---- CORTESIAS ---- */}
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

        {/* ---- ESTILOS DE MÚSICA ---- */}
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

        {/* ---- SERVIÇOS ---- */}
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

        <HorariosForm key={JSON.stringify(dias)} dias={dias} almoco={almoco} />
      </main>
    </div>
  );
}
