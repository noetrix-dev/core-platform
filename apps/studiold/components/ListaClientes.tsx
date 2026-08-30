"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PerfilClienteDrawer } from "@/components/PerfilClienteDrawer";
import { NovoClienteDrawer } from "@/components/NovoClienteDrawer";
import { Icon } from "@/components/agenda/Icon";
import { desde } from "@/lib/agenda/time";
import styles from "@/app/agenda/agenda.module.css";

type ClienteLista = {
  id: string;
  nome: string;
  telefone: string;
  total_visitas: number;
  ultima_visita: string | null;
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ListaClientes({ clientes }: { clientes: ClienteLista[] }) {
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const router = useRouter();

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return clientes;
    const qDigitos = q.replace(/\D/g, "");
    return clientes.filter(
      (c) =>
        normalizar(c.nome).includes(q) ||
        (qDigitos.length > 0 && c.telefone.replace(/\D/g, "").includes(qDigitos)),
    );
  }, [clientes, busca]);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className={`${styles.btn} ${styles["btn--primary"]} self-start`}
        onClick={() => setCriando(true)}
      >
        <Icon name="plus" size={15} /> Novo cliente
      </button>
      <input
        className={styles.clientesBusca}
        placeholder="Buscar por nome ou telefone"
        aria-label="Buscar cliente"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        autoComplete="off"
      />

      <div className={styles.tray}>
        {clientes.length === 0 ? (
          <p className={`${styles.msgQuiet} px-3.5 py-5`}>
            Nenhum cliente cadastrado.
          </p>
        ) : filtrados.length === 0 ? (
          <p className={`${styles.msgQuiet} px-3.5 py-5`}>
            Nenhum cliente encontrado.
          </p>
        ) : (
          filtrados.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.clientesRow}
              onClick={() => setSelecionado(c.id)}
            >
              <span className={styles.clientesRow__nome}>{c.nome}</span>
              <span className={`${styles.clientesRow__tel} ${styles.tnum}`}>
                {c.telefone}
              </span>
              <span className={styles.clientesRow__visitas}>
                {c.total_visitas === 0
                  ? "sem visitas"
                  : `${c.total_visitas} visita${c.total_visitas === 1 ? "" : "s"}` +
                    (c.ultima_visita ? ` · ${desde(c.ultima_visita)}` : "")}
              </span>
            </button>
          ))
        )}
      </div>

      {selecionado && (
        <PerfilClienteDrawer
          clienteId={selecionado}
          onClose={() => setSelecionado(null)}
        />
      )}

      {criando && (
        <NovoClienteDrawer
          onClose={() => setCriando(false)}
          onCriado={(id) => {
            setCriando(false);
            setSelecionado(id);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
