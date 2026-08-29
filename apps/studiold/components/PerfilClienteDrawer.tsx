"use client";

// Painel de perfil de cliente. Auto-contido: chama getPerfilCliente no
// mount (e a cada troca de clienteId), edita as 3 preferências num bloco
// com botão Salvar, re-busca no sucesso.

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { getPerfilCliente, atualizarPreferencias } from "@/app/clientes/actions";
import type { PerfilCliente } from "@/lib/clientes/types";
import { Drawer } from "@/components/agenda/Drawer";
import { Icon } from "@/components/agenda/Icon";
import { fmtPreco } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";

const BADGE_CURTO: Record<string, string> = {
  pix: "Pix",
  cartao_debito: "Débito",
  cartao_credito: "Crédito",
  dinheiro: "Dinheiro",
};

function fmtData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

export function PerfilClienteDrawer({
  clienteId,
  onClose,
}: {
  clienteId: string;
  onClose: () => void;
}) {
  const [perfil, setPerfil] = useState<PerfilCliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciarCarga] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();

  // form de preferências (controlado)
  const [cortesiaId, setCortesiaId] = useState("");
  const [estiloId, setEstiloId] = useState("");
  const [obs, setObs] = useState("");
  const [avisoPref, setAvisoPref] = useState<string | null>(null);

  function carregar() {
    setErro(null);
    iniciarCarga(async () => {
      try {
        const r = await getPerfilCliente(clienteId);
        if (!r.ok) {
          setErro(r.error);
          return;
        }
        setPerfil(r.perfil);
        setCortesiaId(r.perfil.cortesia_favorita_id ?? "");
        setEstiloId(r.perfil.estilo_musica_id ?? "");
        setObs(r.perfil.observacoes_fixas ?? "");
        setAvisoPref(null);
      } catch {
        setErro("Não deu para carregar. Tente de novo.");
      }
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const dirty =
    perfil != null &&
    (cortesiaId !== (perfil.cortesia_favorita_id ?? "") ||
      estiloId !== (perfil.estilo_musica_id ?? "") ||
      obs !== (perfil.observacoes_fixas ?? ""));

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || salvando) return;
    setAvisoPref(null);
    iniciarSalvar(async () => {
      try {
        const r = await atualizarPreferencias(clienteId, {
          cortesiaFavoritaId: cortesiaId || null,
          estiloMusicaId: estiloId || null,
          observacoesFixas: obs || null,
        });
        if (!r.ok) {
          setAvisoPref("Não deu para salvar. Tente de novo.");
          return;
        }
        carregar();
      } catch {
        setAvisoPref("Não deu para salvar. Tente de novo.");
      }
    });
  };

  return (
    <Drawer titulo={perfil?.nome ?? "Cliente"} onClose={onClose}>
      {erro ? (
        <div className="flex flex-col gap-3">
          <p className={styles.slip__meta}>{erro}</p>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--ghost"]}`}
            onClick={carregar}
          >
            Tentar de novo
          </button>
        </div>
      ) : !perfil ? (
        <div className="flex flex-col gap-3">
          <div className={styles.perfilSkel} />
          <div className={styles.perfilSkel} />
          <div className={styles.perfilSkel} />
        </div>
      ) : perfil ? (
        <div className="flex flex-col gap-5">
          <p
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--ink-2)" }}
          >
            <Icon name="phone" size={14} />
            <span className={styles.tnum}>{perfil.telefone}</span>
          </p>

          <div className={styles.perfilResumo}>
            <div className={styles.perfilBloco}>
              <p className={styles.perfilBloco__k}>Visitas</p>
              <p className={styles.perfilBloco__v}>{perfil.resumo.total_visitas}</p>
              <p className={styles.slip__meta}>
                {perfil.resumo.ultima_visita
                  ? `última ${fmtData(perfil.resumo.ultima_visita)}`
                  : "sem visitas"}
              </p>
            </div>
            <div className={styles.perfilBloco} data-tom="gasto">
              <p className={styles.perfilBloco__k}>Total gasto</p>
              <p className={styles.perfilBloco__v}>
                {fmtPreco(perfil.resumo.total_gasto)}
              </p>
            </div>
            <div className={styles.perfilBloco}>
              <p className={styles.perfilBloco__k}>Serviço frequente</p>
              <p className={styles.perfilBloco__v}>
                {perfil.resumo.servico_mais_frequente ?? "—"}
              </p>
            </div>
          </div>

          <form onSubmit={salvar} className="flex flex-col gap-3">
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="pref-cortesia">Cortesia favorita</label>
              <select
                id="pref-cortesia"
                value={cortesiaId}
                onChange={(e) => setCortesiaId(e.target.value)}
              >
                <option value="">— nenhuma —</option>
                {perfil.cortesias_ativas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="pref-estilo">Estilo musical</label>
              <select
                id="pref-estilo"
                value={estiloId}
                onChange={(e) => setEstiloId(e.target.value)}
              >
                <option value="">— sem preferência —</option>
                {perfil.estilos_ativos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="pref-obs">Observações fixas</label>
              <textarea
                id="pref-obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            {avisoPref && (
              <p className={styles.slip__meta} style={{ color: "var(--oxblood)" }}>
                {avisoPref}
              </p>
            )}
            <button
              type="submit"
              className={`${styles.btn} ${styles["btn--primary"]}`}
              disabled={!dirty || salvando}
            >
              Salvar preferências
            </button>
          </form>

          <div className={styles.tray}>
            <div className={styles.tray__head}>
              <span>Últimas visitas</span>
            </div>
            {perfil.resumo.historico.length === 0 ? (
              <p className="px-3.5 py-5 text-sm" style={{ color: "var(--ink-2)" }}>
                Nenhuma visita registrada.
              </p>
            ) : (
              perfil.resumo.historico.map((v, i) => (
                <div key={i} className={styles.perfilHistRow}>
                  <span className={styles.perfilHistRow__data}>
                    {fmtData(v.data)}
                  </span>
                  <span className={styles.perfilHistRow__svc}>
                    {v.servico}{" "}
                    {v.forma_pagamento && (
                      <span
                        className={styles.finBadge}
                        data-m={v.forma_pagamento}
                        style={{ marginLeft: "0.25rem" }}
                      >
                        {BADGE_CURTO[v.forma_pagamento] ?? v.forma_pagamento}
                      </span>
                    )}
                  </span>
                  <span className={styles.perfilHistRow__val}>
                    {fmtPreco(v.valor)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
