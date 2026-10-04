"use client";

// Wizard de /agendar: identificação (Spec A) → serviços → data e hora →
// confirmação → sucesso. Com sessão válida (lida no servidor por page.tsx) o
// wizard começa em Serviços; `inicial.remarcar` liga o modo remarcar (Spec C):
// o antigo só é cancelado no servidor depois de o novo ser criado.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proximoDia, rotuloDia } from "@/lib/agendar/formato";
import { IdentificacaoForm } from "./IdentificacaoForm";
import { AgendarCabecalho } from "./AgendarCabecalho";
import { EtapaServicos } from "./EtapaServicos";
import { EtapaHorario } from "./EtapaHorario";
import { EtapaConfirmacao } from "./EtapaConfirmacao";
import { EtapaSucesso } from "./EtapaSucesso";
import {
  carregarCatalogo,
  buscarHorarios,
  confirmarAgendamento,
  encerrarSessao,
  type Catalogo,
  type FalhaAgendar,
  type Horario,
  type ResumoAgendamento,
} from "./actions";
import styles from "@/app/agenda/agenda.module.css";
import css from "./agendar.module.css";

type Passo = "identificacao" | "servicos" | "horario" | "confirmacao" | "sucesso";

const ROTULO: Record<Passo, string> = {
  identificacao: "Identificação",
  servicos: "Serviços · 1 de 3",
  horario: "Data e hora · 2 de 3",
  confirmacao: "Confirmação · 3 de 3",
  sucesso: "Agendado",
};

const FALHA_CONEXAO: FalhaAgendar = { ok: false, error: "Falha de conexão. Tente de novo." };

export type InicialWizard = {
  nome: string;
  servicoIds: string[];
  remarcar: { id: string; data: string; hora: string } | null;
  aviso: string | null;
};

export function AgendarWizard({
  inicial,
  destino,
}: {
  inicial: InicialWizard | null;
  destino: "meus-agendamentos" | null;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>(inicial ? "servicos" : "identificacao");
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>(inicial?.servicoIds ?? []);
  const [remarcar, setRemarcar] = useState<InicialWizard["remarcar"]>(inicial?.remarcar ?? null);
  const [horarios, setHorarios] = useState<Horario[] | null>(null);
  const [temMais, setTemMais] = useState(true);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(null);
  const [estiloId, setEstiloId] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoAgendamento | null>(null);
  const [aviso, setAviso] = useState<string | null>(inicial?.aviso ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const mainRef = useRef<HTMLElement>(null);
  const primeiro = useRef(true);

  // Troca de passo move o foco pro h1 (leitor de tela anuncia a etapa nova);
  // nunca no carregamento inicial.
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    mainRef.current?.querySelector("h1")?.focus();
  }, [passo]);

  function recomecar(mensagem: string | null) {
    setPasso("identificacao");
    setNome("");
    setCatalogo(null);
    setSelecionados([]);
    setHorarios(null);
    setTemMais(true);
    setHorario(null);
    setCortesiaId(null);
    setEstiloId(null);
    setResumo(null);
    setRemarcar(null);
    setErro(null);
    setAviso(mensagem);
  }

  // true = falha tratada (sessão expirada → recomeça)
  function tratarSessao(r: FalhaAgendar): boolean {
    if (!r.sessaoExpirada) return false;
    recomecar(r.error);
    return true;
  }

  // Carrega o catálogo (sem mexer na seleção). Usado ao entrar com sessão e
  // por abrirServicos.
  function carregarServicos() {
    iniciar(async () => {
      const r = await carregarCatalogo().catch(() => FALHA_CONEXAO);
      if (!r.ok) {
        if (!tratarSessao(r)) setAviso(r.error);
        return;
      }
      setCatalogo(r.catalogo);
      setCortesiaId(r.catalogo.cortesiaFavoritaId);
      setEstiloId(r.catalogo.estiloFavoritoId);
    });
  }

  // Vai pra Serviços e (re)carrega o catálogo. Também é o caminho de volta
  // quando a busca de horários falha (serviço desativado no meio do fluxo).
  function abrirServicos(mensagem: string | null) {
    setAviso(mensagem);
    setCatalogo(null);
    setSelecionados([]);
    setPasso("servicos");
    carregarServicos();
  }

  // Entrou com sessão (page.tsx): carrega o catálogo uma vez, mantendo a
  // pré-seleção do remarcar. setState só dentro da transição assíncrona.
  const carregouInicial = useRef(false);
  useEffect(() => {
    if (!inicial || carregouInicial.current) return;
    carregouInicial.current = true;
    carregarServicos();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só na montagem
  }, []);

  // `ir` vem da escolha do cliente existente ("Novo agendamento" / "Ver meus
  // agendamentos"); cliente novo sempre segue pra Serviços.
  function identificado(dados: { nome: string }, ir: "servicos" | "meus") {
    if (ir === "meus") {
      router.push("/agendar/meus-agendamentos");
      return;
    }
    // Remarcar com sessão expirada: recarrega a página inteira para o servidor
    // reconstruir `inicial` (dono/status conferidos em page.tsx) a partir do
    // ?remarcar que continua na URL.
    if (new URLSearchParams(window.location.search).has("remarcar")) {
      window.location.reload();
      return;
    }
    setNome(dados.nome);
    abrirServicos(null);
  }

  function sair() {
    iniciar(async () => {
      await encerrarSessao().catch(() => undefined);
      recomecar(null); // volta pra identificação limpando nome/catálogo/seleção
      router.replace("/agendar"); // derruba ?remarcar velho
    });
  }

  function alternar(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function carregarHorarios(mensagem: string | null) {
    setAviso(mensagem);
    setHorarios(null);
    setTemMais(true);
    setPasso("horario");
    iniciar(async () => {
      const r = await buscarHorarios(selecionados).catch(() => FALHA_CONEXAO);
      if (!r.ok) {
        // Falha de transporte: volta pra Serviços mantendo a seleção.
        if (r === FALHA_CONEXAO) {
          setPasso("servicos");
          setAviso(r.error);
          return;
        }
        if (!tratarSessao(r)) abrirServicos(r.error);
        return;
      }
      setHorarios(r.horarios);
      setTemMais(r.horarios.length > 0);
    });
  }

  function maisDias() {
    const ultimo = horarios?.at(-1)?.data;
    if (!ultimo) return;
    iniciar(async () => {
      const r = await buscarHorarios(selecionados, proximoDia(ultimo)).catch(() => FALHA_CONEXAO);
      if (!r.ok) {
        if (!tratarSessao(r)) setAviso(r.error);
        return;
      }
      setHorarios((atual) => [...(atual ?? []), ...r.horarios]);
      setTemMais(r.horarios.length > 0);
    });
  }

  function escolherHorario(h: Horario) {
    setHorario(h);
    setErro(null);
    setAviso(null);
    setPasso("confirmacao");
  }

  function confirmar() {
    if (!horario) return;
    setErro(null);
    iniciar(async () => {
      const r = await confirmarAgendamento({
        servicoIds: selecionados,
        inicio: horario.inicio,
        cortesiaId,
        estiloId,
        remarcarId: remarcar?.id ?? null,
      }).catch(() => FALHA_CONEXAO);
      if (r.ok) {
        setResumo(r.resumo);
        setPasso("sucesso");
        return;
      }
      if (tratarSessao(r)) return;
      if (r.motivo === "remarcar") setRemarcar(null); // vira agendamento novo; cliente confirma de novo
      if (r.motivo === "horario") return carregarHorarios(r.error);
      if (r.motivo === "cortesia") setCortesiaId(null);
      if (r.motivo === "estilo") setEstiloId(null);
      setErro(r.error);
    });
  }

  function novoAgendamento() {
    router.replace("/agendar");
    setRemarcar(null);
    setResumo(null);
    setHorario(null);
    abrirServicos(null);
  }

  const voltar =
    passo === "horario"
      ? () => {
          setAviso(null);
          setPasso("servicos");
        }
      : passo === "confirmacao"
        ? () => {
            setAviso(null);
            setPasso("horario");
          }
        : undefined;

  return (
    <>
      <AgendarCabecalho etapa={passo === "sucesso" && resumo?.remarcado ? "Remarcado" : ROTULO[passo]} onVoltar={pendente ? undefined : voltar} />
      <main ref={mainRef} className={css.corpo}>
        {remarcar && (passo === "servicos" || passo === "horario" || passo === "confirmacao") && (
          <p role="status" className={`${css.faixaRemarcando} text-sm`}>
            Remarcando {rotuloDia(remarcar.data)} às {remarcar.hora}. Seu horário atual só é liberado quando você
            confirmar o novo.
          </p>
        )}
        {passo === "identificacao" && (
          <>
            <h1 tabIndex={-1} className={`${styles.pageTitle} mb-1`}>
              {destino ? "Meus agendamentos" : "Agendar horário"}
            </h1>
            <p className={`${styles.msgQuiet} mb-6`}>
              {destino ? "Confirme seu telefone para ver seus agendamentos." : "Confirme seu telefone pra começar."}
            </p>
            {aviso && (
              <p role="alert" className={`${styles.msgQuiet} mb-4`} data-tom="erro">
                {aviso}
              </p>
            )}
            <IdentificacaoForm onIdentificado={identificado} />
          </>
        )}
        {passo === "servicos" && (
          <>
            {aviso && (
              <p role="alert" className={`${styles.msgQuiet} mb-4`} data-tom="erro">
                {aviso}
              </p>
            )}
            {aviso && !catalogo && !pendente && (
              <button
                type="button"
                className={`${styles.btn} ${css.cta} mb-4 w-full`}
                onClick={() => {
                  setAviso(null);
                  carregarServicos(); // mantém a seleção (pré-marcação do remarcar)
                }}
              >
                Tentar de novo
              </button>
            )}
            <EtapaServicos
              nome={nome}
              catalogo={catalogo}
              selecionados={selecionados}
              onAlternar={alternar}
              onContinuar={() => carregarHorarios(null)}
              onSair={sair}
              pendente={pendente}
            />
          </>
        )}
        {passo === "horario" && (
          <EtapaHorario
            horarios={horarios}
            carregando={pendente}
            temMais={temMais}
            aviso={aviso}
            onEscolher={escolherHorario}
            onMaisDias={maisDias}
          />
        )}
        {passo === "confirmacao" && catalogo && horario && (
          <EtapaConfirmacao
            catalogo={catalogo}
            servicoIds={selecionados}
            horario={horario}
            cortesiaId={cortesiaId}
            estiloId={estiloId}
            onCortesia={setCortesiaId}
            onEstilo={setEstiloId}
            onConfirmar={confirmar}
            pendente={pendente}
            erro={erro}
            antes={remarcar ? { data: remarcar.data, hora: remarcar.hora } : null}
          />
        )}
        {passo === "sucesso" && resumo && <EtapaSucesso resumo={resumo} onNovo={novoAgendamento} />}
      </main>
    </>
  );
}
