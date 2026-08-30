import Link from "next/link";
import { tenantDb } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/agenda/Icon";
import { fmtPreco } from "@/lib/agenda/time";
import { requireUser } from "@/lib/supabase/auth";
import styles from "@/app/agenda/agenda.module.css";

export const dynamic = "force-dynamic";

const TZ_OFFSET = "-03:00"; // ponytail: SP sem horário de verão

type Periodo = "hoje" | "semana" | "mes";
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
];

const METODOS = [
  { key: "pix", label: "Pix", curto: "Pix" },
  { key: "cartao_debito", label: "Cartão débito", curto: "Débito" },
  { key: "cartao_credito", label: "Cartão crédito", curto: "Crédito" },
  { key: "dinheiro", label: "Dinheiro", curto: "Dinheiro" },
] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}
function fmtHoraSP(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function range(periodo: Periodo): { ini: string; fim: string } {
  const [y, m, d] = hojeSP().split("-").map(Number);
  const meiaNoite = `${y}-${pad(m)}-${pad(d)}T00:00:00${TZ_OFFSET}`;

  if (periodo === "mes") {
    const ini = new Date(`${y}-${pad(m)}-01T00:00:00${TZ_OFFSET}`);
    const my = m === 12 ? y + 1 : y;
    const mm = m === 12 ? 1 : m + 1;
    const fim = new Date(`${my}-${pad(mm)}-01T00:00:00${TZ_OFFSET}`);
    return { ini: ini.toISOString(), fim: fim.toISOString() };
  }

  if (periodo === "semana") {
    // segunda-feira desta semana (weekday da data-calendário, sem ruído de fuso)
    const dowMon0 = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    const ini = new Date(
      new Date(meiaNoite).getTime() - dowMon0 * 86_400_000,
    );
    const fim = new Date(ini.getTime() + 7 * 86_400_000);
    return { ini: ini.toISOString(), fim: fim.toISOString() };
  }

  const ini = new Date(meiaNoite);
  const fim = new Date(ini.getTime() + 86_400_000);
  return { ini: ini.toISOString(), fim: fim.toISOString() };
}

type Row = Record<string, unknown>;
function embNome(v: unknown): string | undefined {
  const o = Array.isArray(v) ? v[0] : v;
  return (o as { nome?: string } | null)?.nome ?? undefined;
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const periodo: Periodo = PERIODOS.some((p) => p.key === sp.periodo)
    ? (sp.periodo as Periodo)
    : "hoje";
  const { ini, fim } = range(periodo);

  const { data, error } = await tenantDb()
    .from("atendimentos")
    .select(
      "id, valor_cobrado, forma_pagamento, realizado_em, clientes(nome), servicos(nome), agendamentos(cortesias(nome))",
    )
    .gte("realizado_em", ini)
    .lt("realizado_em", fim)
    .order("realizado_em", { ascending: false });
  if (error) throw new Error(`financeiro: ${error.message}`);

  const linhas = ((data ?? []) as Row[]).map((a) => {
    const ag = Array.isArray(a.agendamentos) ? a.agendamentos[0] : a.agendamentos;
    return {
      id: a.id as string,
      valor: Number(a.valor_cobrado) || 0,
      metodo: (a.forma_pagamento as string) ?? "",
      realizado_em: a.realizado_em as string,
      cliente: embNome(a.clientes) ?? "Cliente",
      servico: embNome(a.servicos) ?? "Serviço",
      cortesia: embNome((ag as Row | null)?.cortesias),
    };
  });

  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const qtd = linhas.length;
  const ticket = qtd ? total / qtd : 0;

  const porMetodo = METODOS.map((m) => {
    const doMetodo = linhas.filter((l) => l.metodo === m.key);
    return {
      ...m,
      valor: doMetodo.reduce((s, l) => s + l.valor, 0),
      count: doMetodo.length,
    };
  });

  return (
    <div className={styles.shell}>
      <Topbar titulo="Caixa" />

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
        <nav className={styles.finTabs} aria-label="Período">
          {PERIODOS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "hoje" ? "/financeiro" : `/financeiro?periodo=${p.key}`}
              className={styles.finTab}
              data-active={p.key === periodo ? "true" : undefined}
              aria-current={p.key === periodo ? "page" : undefined}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <div className={styles.finCards}>
          <div className={styles.finCard} data-tom="total">
            <p className={styles.finCard__k}>Total faturado</p>
            <p className={styles.finCard__v}>{fmtPreco(total)}</p>
          </div>
          <div className={styles.finCard}>
            <p className={styles.finCard__k}>Atendimentos</p>
            <p className={styles.finCard__v}>{qtd}</p>
          </div>
          <div className={styles.finCard}>
            <p className={styles.finCard__k}>Ticket médio</p>
            <p className={styles.finCard__v}>{fmtPreco(ticket)}</p>
          </div>
        </div>

        <div className={styles.tray}>
          <div className={styles.tray__head}>
            <span>Formas de pagamento</span>
          </div>
          {porMetodo.map((m) => (
            <div key={m.key} className={styles.finBreakRow}>
              <span className={styles.finBreakRow__k}>{m.label}</span>
              <span className={styles.finBreakRow__c}>
                {m.count} {m.count === 1 ? "atend." : "atends."}
              </span>
              <span className={styles.finBreakRow__v}>{fmtPreco(m.valor)}</span>
            </div>
          ))}
        </div>

        <div className={styles.tray}>
          <div className={styles.tray__head}>
            <span>Atendimentos</span>
            <span className={`${styles.tray__count} ${styles.tnum}`}>{qtd}</span>
          </div>
          {linhas.length === 0 ? (
            <p className="px-3.5 py-6 text-sm" style={{ color: "var(--ink-2)" }}>
              Nenhum atendimento registrado neste período.
            </p>
          ) : (
            linhas.map((l) => {
              const meta = METODOS.find((m) => m.key === l.metodo);
              return (
                <div key={l.id} className={styles.finRow}>
                  <span className={styles.finRow__hora}>
                    {fmtHoraSP(l.realizado_em)}
                  </span>
                  <span>
                    <span className={styles.finRow__nome}>{l.cliente}</span>
                    <span className={styles.finRow__meta}> · {l.servico}</span>
                    {l.cortesia && (
                      <span className={`${styles.finRow__meta} flex items-center gap-1`}>
                        <Icon name="cup" size={12} /> {l.cortesia}
                      </span>
                    )}
                    <span
                      className={styles.finBadge}
                      data-m={l.metodo}
                      style={{ marginTop: "0.2rem" }}
                    >
                      {meta?.curto ?? l.metodo}
                    </span>
                  </span>
                  <span className={styles.finRow__val}>{fmtPreco(l.valor)}</span>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
