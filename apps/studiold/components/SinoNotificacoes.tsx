"use client";

// Sino de notificações do painel: contador de não lidas por polling (30 s,
// só com a aba visível) e bandeja com as notificações (não lidas de qualquer
// data + lidas das últimas 24h). Abrir marca as mostradas como lidas; tocar
// numa linha leva ao dia do horário em /agenda?d=YYYY-MM-DD.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/agenda/Icon";
import {
  contarNaoLidas,
  listarNotificacoes,
  marcarLidas,
  type ItemNotificacao,
} from "@/app/notificacoes/actions";
import { rotuloCanal, rotuloTipo, tempoRelativo } from "@/lib/notificacoes/formato";
import { rotuloDia } from "@/lib/agendar/formato";
import styles from "@/app/agenda/agenda.module.css";

const POLL_MS = 30_000;

const ICONE = {
  agendamento_criado: "plus",
  agendamento_cancelado: "x",
  agendamento_remarcado: "clock",
} as const;

export function SinoNotificacoes() {
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<"carregando" | "erro" | "ok">("carregando");
  const [itens, setItens] = useState<ItemNotificacao[]>([]);
  const [agora, setAgora] = useState(0);
  const [, iniciar] = useTransition();
  const sinoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const pedido = useRef(0);
  const abertoRef = useRef(false);
  useEffect(() => {
    abertoRef.current = aberto;
  }, [aberto]);

  // Polling do contador: no mount, a cada 30 s com a aba visível e ao voltar
  // pra aba. Falha mantém o último número (erro já logado no servidor).
  useEffect(() => {
    let vivo = true;
    async function atualizar() {
      if (document.visibilityState !== "visible") return;
      const n = await contarNaoLidas().catch(() => null);
      if (vivo && n !== null) setNaoLidas(n);
    }
    function aoVoltar() {
      if (document.visibilityState === "visible") void atualizar();
    }
    void atualizar();
    const id = setInterval(() => void atualizar(), POLL_MS);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  // Esc fecha e devolve o foco ao sino; toque fora fecha sem roubar o foco.
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAberto(false);
        sinoRef.current?.focus();
      }
    }
    function aoTocar(e: PointerEvent) {
      const alvo = e.target as Node;
      if (!painelRef.current?.contains(alvo) && !sinoRef.current?.contains(alvo)) setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoTocar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoTocar);
    };
  }, [aberto]);

  function carregar() {
    const meu = ++pedido.current;
    setEstado("carregando");
    iniciar(async () => {
      const r = await listarNotificacoes().catch(() => ({ ok: false as const }));
      if (meu !== pedido.current) return;
      if (!r.ok) {
        setEstado("erro");
        return;
      }
      setAgora(Date.now());
      setItens(r.itens);
      setEstado("ok");
      const ids = r.itens.filter((i) => !i.lida).map((i) => i.id);
      if (ids.length > 0 && abertoRef.current) {
        await marcarLidas(ids).catch(() => undefined);
        if (meu !== pedido.current) return;
        const n = await contarNaoLidas().catch(() => null);
        if (n !== null) setNaoLidas(n);
      }
    });
  }

  function alternar() {
    if (aberto) {
      setAberto(false);
      return;
    }
    setAberto(true);
    carregar();
  }

  const novas = itens.filter((i) => !i.lida).length;

  return (
    <div className={styles.sino}>
      <button
        ref={sinoRef}
        type="button"
        className={`${styles.navbtn} ${styles.sinoBtn}`}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : "Notificações"}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={alternar}
      >
        <Icon name="bell" size={18} />
        {naoLidas > 0 && (
          <span className={styles.sinoBadge} aria-hidden="true">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div ref={painelRef} className={styles.sinoPainel} role="dialog" aria-label="Notificações">
          <div className={styles.tray__head}>
            <span>Notificações</span>
            {estado === "ok" && novas > 0 && (
              <span className={styles.tray__count}>
                {novas} {novas === 1 ? "nova" : "novas"}
              </span>
            )}
          </div>
          <div className={styles.sinoCorpo} aria-busy={estado === "carregando"}>
            {estado === "carregando" && [0, 1, 2].map((i) => <div key={i} className={styles.sinoEsqueleto} />)}
            {estado === "erro" && (
              <div className={styles.sinoVazio}>
                <p role="alert">Não foi possível carregar as notificações.</p>
                <button type="button" className={styles.btn} onClick={carregar}>
                  Tentar de novo
                </button>
              </div>
            )}
            {estado === "ok" && itens.length === 0 && (
              <p className={styles.sinoVazio}>Nenhuma notificação nas últimas 24h.</p>
            )}
            {estado === "ok" && itens.length > 0 && (
              <ul>
                {itens.map((i) => (
                  <li key={i.id}>
                    <LinhaNotificacao item={i} agora={agora} onIr={() => setAberto(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function detalhe(i: ItemNotificacao): ReactNode {
  const servicos = i.servicos.join(", ");
  const quando = i.data && i.hora ? `${rotuloDia(i.data)} às ${i.hora}` : "Horário removido";
  if (i.anterior) {
    return (
      <>
        {servicos && <span>{servicos} ·</span>}
        <s>
          {rotuloDia(i.anterior.data)} {i.anterior.hora}
        </s>
        <span>→ {i.data && i.hora ? `${rotuloDia(i.data)} ${i.hora}` : "Horário removido"}</span>
      </>
    );
  }
  return servicos ? `${servicos} · ${quando}` : quando;
}

function LinhaNotificacao({
  item: i,
  agora,
  onIr,
}: {
  item: ItemNotificacao;
  agora: number;
  onIr: () => void;
}) {
  const conteudo = (
    <>
      <span className={styles.sinoIcone} data-tipo={i.tipo} aria-hidden="true">
        <Icon name={ICONE[i.tipo]} size={14} />
      </span>
      <span className={styles.sinoTexto}>
        <span className={styles.sinoLinha1}>
          <strong>{i.cliente ?? "Cliente"}</strong>
          <span className={styles.sinoTempo}>{tempoRelativo(i.criadoEm, agora)}</span>
        </span>
        <span className={styles.sinoMeta}>
          {rotuloTipo(i.tipo)} ·{i.canal === "whatsapp_bot" && <Icon name="chat" size={12} />}
          {rotuloCanal(i.canal)}
        </span>
        <span className={styles.sinoMeta}>{detalhe(i)}</span>
      </span>
    </>
  );
  const lida = i.lida ? "true" : undefined;
  return i.data ? (
    <Link href={`/agenda?d=${i.data}`} className={styles.sinoItem} data-lida={lida} onClick={onIr}>
      {conteudo}
    </Link>
  ) : (
    <div className={styles.sinoItem} data-lida={lida}>
      {conteudo}
    </div>
  );
}
