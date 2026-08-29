"use client";

// Drawer de cadastro manual de cliente. Chama criarCliente; em sucesso ou
// em telefone duplicado, entrega um clienteId ao host via onCriado (o host
// abre o perfil desse cliente).

import { useState, useTransition, type FormEvent } from "react";
import { criarCliente } from "@/app/clientes/actions";
import { Drawer } from "@/components/agenda/Drawer";
import styles from "@/app/agenda/agenda.module.css";

export function NovoClienteDrawer({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: (clienteId: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [genero, setGenero] = useState("nao_informado");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    setAviso(null);
    const fd = new FormData();
    fd.set("nome", nome);
    fd.set("telefone", telefone);
    fd.set("genero", genero);
    iniciar(async () => {
      try {
        const r = await criarCliente(fd);
        if (r.ok) {
          onCriado(r.id);
          return;
        }
        if (r.clienteExistenteId) {
          onCriado(r.clienteExistenteId);
          return;
        }
        setAviso(r.error);
      } catch {
        setAviso("Falha de conexão. Tente de novo.");
      }
    });
  };

  return (
    <Drawer titulo="Novo cliente" onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="nc-nome">Nome</label>
          <input
            id="nc-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            maxLength={120}
            autoComplete="off"
          />
        </div>
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="nc-tel">Telefone</label>
          <input
            id="nc-tel"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="+55 11 90000-0000"
            required
            autoComplete="off"
          />
        </div>
        <div className={`${styles.field} flex flex-col gap-1.5`}>
          <label htmlFor="nc-genero">Gênero</label>
          <select
            id="nc-genero"
            value={genero}
            onChange={(e) => setGenero(e.target.value)}
          >
            <option value="nao_informado">Não informado</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
          </select>
        </div>

        {aviso && (
          <p className={styles.slip__meta} style={{ color: "var(--oxblood)" }}>
            {aviso}
          </p>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            className={`${styles.btn} ${styles["btn--primary"]}`}
            disabled={salvando}
          >
            {salvando ? "Salvando…" : "Cadastrar cliente"}
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
