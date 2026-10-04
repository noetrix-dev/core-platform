"use client";

// Wizard de /agendar: identificação (Spec A) → serviços → data e hora →
// confirmação → sucesso. Estado só em memória: reload recomeça na
// identificação (o cookie sozinho não pula a verificação, por desenho).
// Transições são disparadas por evento (sem useEffect de carga).

import { useState, useTransition } from "react";
import { proximoDia } from "@/lib/agendar/formato";
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

export function AgendarWizard() {
  const [passo, setPasso] = useState<Passo>("identificacao");
  const [nome, setNome] = useState("");
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [horarios, setHorarios] = useState<Horario[] | null>(null);
  const [temMais, setTemMais] = useState(true);
  const [horario, setHorario] = useState<Horario | null>(null);
  const [cortesiaId, setCortesiaId] = useState<string | null>(null);
  const [estiloId, setEstiloId] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoAgendamento | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

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
    setErro(null);
    setAviso(mensagem);
  }

  // true = falha tratada (sessão expirada → recomeça)
  function tratarSessao(r: FalhaAgendar): boolean {
    if (!r.sessaoExpirada) return false;
    recomecar(r.error);
    return true;
  }

  // Vai pra Serviços e (re)carrega o catálogo. Também é o caminho de volta
  // quando a busca de horários falha (serviço desativado no meio do fluxo).
  function abrirServicos(mensagem: string | null) {
    setAviso(mensagem);
    setCatalogo(null);
    setSelecionados([]);
    setPasso("servicos");
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

  function identificado(dados: { nome: string }) {
    setNome(dados.nome);
    abrirServicos(null);
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
      }).catch(() => FALHA_CONEXAO);
      if (r.ok) {
        setResumo(r.resumo);
        setPasso("sucesso");
        return;
      }
      if (tratarSessao(r)) return;
      if (r.motivo === "horario") return carregarHorarios(r.error);
      if (r.motivo === "cortesia") setCortesiaId(null);
      if (r.motivo === "estilo") setEstiloId(null);
      setErro(r.error);
    });
  }

  const voltar =
    passo === "horario"
      ? () => setPasso("servicos")
      : passo === "confirmacao"
        ? () => setPasso("horario")
        : undefined;

  return (
    <>
      <AgendarCabecalho etapa={ROTULO[passo]} onVoltar={pendente ? undefined : voltar} />
      <main className={css.corpo}>
        {passo === "identificacao" && (
          <>
            <h1 className={`${styles.pageTitle} mb-1`}>Agendar horário</h1>
            <p className={`${styles.msgQuiet} mb-6`}>Confirme seu telefone pra começar.</p>
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
                onClick={() => abrirServicos(null)}
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
          />
        )}
        {passo === "sucesso" && resumo && <EtapaSucesso resumo={resumo} onNovo={() => recomecar(null)} />}
      </main>
    </>
  );
}
