"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { getPreferenciasCliente } from "@/app/clientes/actions";
import type { PreferenciasCliente } from "@/lib/clientes/types";
import { useAgenda } from "@/lib/agenda/store";
import { vagasLivres } from "@/lib/agenda/timeline";
import { minToHm } from "@/lib/agenda/time";
import { Drawer } from "./Drawer";
import styles from "@/app/agenda/agenda.module.css";

export function AgendarDrawer({
  modo,
  onClose,
}: {
  modo: "walkin" | "agenda";
  onClose: () => void;
}) {
  const { state, dispatch } = useAgenda();
  const { data, dayKey } = state;

  const [servicoId, setServicoId] = useState(data.servicos[0].id);
  const [clienteId, setClienteId] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [naCadeira, setNaCadeira] = useState(modo === "walkin");
  const [horario, setHorario] = useState<number | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PreferenciasCliente | null>(null);
  const [autoCortesia, setAutoCortesia] = useState<string | null>(null);
  const [, carregarPrefs] = useTransition();

  const cortesiasDisponiveis = data.cortesias.filter(
    (c) => c.ativo && c.quantidade_estoque > 0,
  );

  const dur =
    data.servicos.find((s) => s.id === servicoId)?.duracao_minutos ?? 30;
  const vagas = useMemo(
    () => vagasLivres(data, dayKey, dur),
    [data, dayKey, dur],
  );

  const usaHorario = modo === "agenda" || !naCadeira;
  const clienteExistente = clienteId !== "";
  const podeEnviar =
    (clienteExistente || (nome.trim() !== "" && telefone.trim() !== "")) &&
    (!usaHorario || horario != null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!podeEnviar) return;
    const cli = clienteExistente
      ? data.clientes.find((c) => c.id === clienteId)
      : undefined;
    dispatch({
      type: "AGENDAR",
      origem: modo === "walkin" ? "walkin" : "whatsapp",
      clienteId: clienteExistente ? clienteId : undefined,
      nome: cli?.nome ?? nome,
      telefone: cli?.telefone ?? telefone,
      servicoId,
      cortesiaId: cortesiaId ?? undefined,
      inicioMin: usaHorario ? horario! : nowMinFallback(),
      naCadeira: modo === "walkin" ? naCadeira : false,
    });
    onClose();
  };

  return (
    <Drawer
      titulo={modo === "walkin" ? "Walk-in" : "Novo agendamento"}
      onClose={onClose}
    >
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="cli-exist">Cliente cadastrado</label>
          <select
            id="cli-exist"
            value={clienteId}
            onChange={(e) => {
              const id = e.target.value;
              setClienteId(id);
              setPrefs(null);
              setCortesiaId((atual) => (atual === autoCortesia ? null : atual));
              setAutoCortesia(null);
              if (!id) return;
              carregarPrefs(async () => {
                try {
                  const r = await getPreferenciasCliente(id);
                  if (!r.ok) return;
                  setPrefs(r.prefs);
                  if (
                    r.prefs.cortesiaFavoritaId &&
                    cortesiasDisponiveis.some(
                      (c) => c.id === r.prefs.cortesiaFavoritaId,
                    )
                  ) {
                    setCortesiaId(r.prefs.cortesiaFavoritaId);
                    setAutoCortesia(r.prefs.cortesiaFavoritaId);
                  }
                } catch {
                  // preferências são um extra; falha não bloqueia o agendamento
                }
              });
            }}
          >
            <option value="">— novo cliente —</option>
            {data.clientes
              .slice()
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </div>

        {clienteExistente && prefs && (
          <div
            className={`${styles.slip__meta} flex flex-col gap-0.5`}
            aria-live="polite"
          >
            <span>
              Cortesia favorita: {prefs.cortesiaNome ?? "—"}
              {prefs.cortesiaFavoritaId &&
                !cortesiasDisponiveis.some(
                  (c) => c.id === prefs.cortesiaFavoritaId,
                ) &&
                " (indisponível)"}
            </span>
            <span>Estilo musical: {prefs.estiloNome ?? "—"}</span>
            {prefs.observacoesFixas && <span>Obs.: {prefs.observacoesFixas}</span>}
          </div>
        )}

        {!clienteExistente && (
          <>
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="tel">Telefone</label>
              <input
                id="tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="+55 11 90000-0000"
                autoComplete="off"
              />
            </div>
          </>
        )}

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="svc">Serviço</label>
          <select
            id="svc"
            value={servicoId}
            onChange={(e) => {
              setServicoId(e.target.value);
              setHorario(null);
            }}
          >
            {data.servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome} · {s.duracao_minutos} min
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label>Cortesia (opcional)</label>
          {cortesiasDisponiveis.length === 0 ? (
            <p className={styles.slip__meta}>
              Nenhuma cortesia disponível no momento
            </p>
          ) : (
            <div
              className={styles.chips}
              role="radiogroup"
              aria-label="Cortesia"
            >
              <button
                type="button"
                className={styles.chip}
                data-on={cortesiaId === null}
                role="radio"
                aria-checked={cortesiaId === null}
                onClick={() => setCortesiaId(null)}
              >
                Nenhuma
              </button>
              {cortesiasDisponiveis.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={styles.chip}
                  data-on={cortesiaId === c.id}
                  role="radio"
                  aria-checked={cortesiaId === c.id}
                  onClick={() => setCortesiaId(c.id)}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        {modo === "walkin" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={naCadeira}
              onChange={(e) => setNaCadeira(e.target.checked)}
            />
            Já está na cadeira agora
          </label>
        )}

        {usaHorario && (
          <div className={`${styles.field} flex flex-col gap-1.5`}>
            <label>Horário livre</label>
            {vagas.length === 0 ? (
              <p className={styles.slip__meta}>
                Sem vão livre para {dur} min neste dia.
              </p>
            ) : (
              <div className={styles.chips} role="radiogroup" aria-label="Horário livre">
                {vagas.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={styles.chip}
                    data-on={horario === m}
                    role="radio"
                    aria-checked={horario === m}
                    onClick={() => setHorario(m)}
                  >
                    {minToHm(m)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]}`}
            disabled={!podeEnviar}
          >
            {modo === "walkin" ? "Adicionar walk-in" : "Criar agendamento"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--ghost"]}`}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// walk-in "na cadeira agora" sem horário escolhido: cai no próximo quarto de hora.
function nowMinFallback(): number {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  return Math.round(m / 15) * 15;
}
