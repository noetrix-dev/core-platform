"use client";

// 3 telas do Passo 1 do agendamento: telefone (+ e-mail quando preciso) →
// código → nome (só pra cadastro novo). "É você?" é uma resolução inline
// depois do código certo, não uma tela própria. Chama as Server Actions
// direto (sem useActionState) — mesmo padrão de app/configuracoes/HorariosForm.tsx.

import { useState, useTransition } from "react";
import {
  iniciarVerificacao,
  verificarCodigo,
  confirmarCadastro,
} from "./actions";
import styles from "@/app/agenda/agenda.module.css";

type Props = {
  onIdentificado?: (dados: { clienteId: string; nome: string; telefone: string }) => void;
};

type Etapa =
  | { tipo: "telefone" }
  | { tipo: "codigo"; telefone: string; email: string }
  | { tipo: "identidade"; telefone: string; nome: string; clienteId: string }
  | { tipo: "nome"; telefone: string; email: string }
  | { tipo: "pronto"; telefone: string; nome: string; clienteId: string };

const FALHA_CONEXAO = { ok: false as const, error: "Falha de conexão. Tente de novo." };

export function IdentificacaoForm({ onIdentificado }: Props) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "telefone" });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [telefoneInput, setTelefoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [precisaEmail, setPrecisaEmail] = useState(false);
  const [codigoInput, setCodigoInput] = useState("");
  const [nomeInput, setNomeInput] = useState("");

  function concluir(dados: { clienteId: string; nome: string; telefone: string }) {
    if (onIdentificado) return onIdentificado(dados);
    setEtapa({ tipo: "pronto", ...dados });
  }

  function recomecar() {
    setErro(null);
    setTelefoneInput("");
    setEmailInput("");
    setPrecisaEmail(false);
    setCodigoInput("");
    setNomeInput("");
    setEtapa({ tipo: "telefone" });
  }

  function enviarTelefone() {
    setErro(null);
    iniciar(async () => {
      const r = await iniciarVerificacao(telefoneInput, emailInput || undefined).catch(() => FALHA_CONEXAO);
      if (!r.ok) return setErro(r.error);
      if (r.precisaEmail) return setPrecisaEmail(true);
      setEtapa({ tipo: "codigo", telefone: r.telefone, email: emailInput });
    });
  }

  function enviarCodigo(dados: Extract<Etapa, { tipo: "codigo" }>) {
    setErro(null);
    iniciar(async () => {
      const r = await verificarCodigo(dados.telefone, codigoInput).catch(() => FALHA_CONEXAO);
      if (!r.ok) return setErro(r.error);
      setCodigoInput("");
      if (r.novo) {
        setEtapa({ tipo: "nome", telefone: dados.telefone, email: dados.email });
      } else {
        setEtapa({ tipo: "identidade", telefone: dados.telefone, nome: r.nome, clienteId: r.clienteId });
      }
    });
  }

  function reenviarCodigo(dados: Extract<Etapa, { tipo: "codigo" }>) {
    setErro(null);
    iniciar(async () => {
      const r = await iniciarVerificacao(dados.telefone, dados.email).catch(() => FALHA_CONEXAO);
      if (!r.ok) setErro(r.error);
    });
  }

  function enviarNome(dados: Extract<Etapa, { tipo: "nome" }>) {
    setErro(null);
    iniciar(async () => {
      const r = await confirmarCadastro(dados.telefone, nomeInput, dados.email).catch(() => FALHA_CONEXAO);
      if (!r.ok) return setErro(r.error);
      concluir({ clienteId: r.clienteId, nome: r.nome, telefone: dados.telefone });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <p role="alert" className={styles.msgQuiet} data-tom="erro">
          {erro}
        </p>
      )}

      {etapa.tipo === "telefone" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviarTelefone();
          }}
        >
          <div className={`${styles.field} flex flex-col gap-1.5`}>
            <label htmlFor="telefone">Telefone (WhatsApp)</label>
            <input
              id="telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              autoFocus
              value={telefoneInput}
              onChange={(e) => setTelefoneInput(e.target.value)}
            />
          </div>
          {precisaEmail && (
            <div className={`${styles.field} flex flex-col gap-1.5`}>
              <label htmlFor="email">E-mail (pra receber o código)</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                autoFocus
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </div>
          )}
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center py-3`}
            disabled={pendente}
          >
            {pendente ? "Enviando…" : precisaEmail ? "Enviar código" : "Continuar"}
          </button>
        </form>
      )}

      {etapa.tipo === "codigo" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviarCodigo(etapa);
          }}
        >
          <p className={styles.msgQuiet}>Enviamos um código de 6 dígitos pro seu e-mail.</p>
          <div className={`${styles.field} flex flex-col gap-1.5`}>
            <label htmlFor="codigo">Código</label>
            <input
              id="codigo"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center py-3`}
            disabled={pendente}
          >
            {pendente ? "Verificando…" : "Confirmar código"}
          </button>
          <button
            type="button"
            className={`${styles.btn} justify-center`}
            disabled={pendente}
            onClick={() => reenviarCodigo(etapa)}
          >
            Reenviar código
          </button>
          <button type="button" className={styles.msgQuiet} onClick={recomecar}>
            Trocar telefone
          </button>
        </form>
      )}

      {etapa.tipo === "identidade" && (
        <div className="flex flex-col gap-4">
          <p className={styles.pageTitle}>Olá, {etapa.nome}!</p>
          <p className={styles.msgQuiet}>É você?</p>
          <button
            type="button"
            className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center py-3`}
            onClick={() =>
              concluir({ clienteId: etapa.clienteId, nome: etapa.nome, telefone: etapa.telefone })
            }
          >
            Sim, sou eu
          </button>
          <button type="button" className={`${styles.btn} justify-center`} onClick={recomecar}>
            Não, não sou eu
          </button>
        </div>
      )}

      {etapa.tipo === "nome" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviarNome(etapa);
          }}
        >
          <p className={styles.msgQuiet}>Ainda não te conhecemos. Como você se chama?</p>
          <div className={`${styles.field} flex flex-col gap-1.5`}>
            <label htmlFor="nome">Nome</label>
            <input
              id="nome"
              autoComplete="name"
              required
              autoFocus
              value={nomeInput}
              onChange={(e) => setNomeInput(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]} w-full justify-center py-3`}
            disabled={pendente}
          >
            {pendente ? "Salvando…" : "Concluir cadastro"}
          </button>
        </form>
      )}

      {etapa.tipo === "pronto" && (
        <div className="flex flex-col gap-2">
          <p className={styles.pageTitle}>Prontinho, {etapa.nome}!</p>
          <p className={styles.msgQuiet}>
            Identidade confirmada. A escolha de serviço e horário chega na próxima parte do
            agendamento.
          </p>
        </div>
      )}
    </div>
  );
}
