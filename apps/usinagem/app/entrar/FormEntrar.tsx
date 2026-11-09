"use client";
import { useState, type FormEvent } from "react";
import { SENHA_MAX, SENHA_MIN } from "../../lib/dominio/seguranca/login";
import { authCliente, entrarComSenha } from "../../lib/servidor/auth-cliente";

// Sem estilo: o visual vem na 1C. A lógica testável vive em entrarComSenha.
export function FormEntrar({ reautenticar, volta }: { reautenticar: boolean; volta: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    setEnviando(true);
    setErro(null);
    // Navegação completa: a próxima página é renderizada no servidor já com o cookie novo.
    const falha = await entrarComSenha(
      { email: String(dados.get("email") ?? ""), senha: String(dados.get("senha") ?? ""), reautenticar, volta },
      authCliente,
      (destino) => window.location.assign(destino),
    );
    if (falha) {
      setErro(falha);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      {reautenticar && <p>Confirme sua senha para continuar.</p>}
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
      <label htmlFor="senha">Senha</label>
      <input id="senha" name="senha" type="password" autoComplete="current-password" required minLength={SENHA_MIN} maxLength={SENHA_MAX} />
      <p role="alert">{erro}</p>
      <button type="submit" disabled={enviando}>
        Entrar
      </button>
    </form>
  );
}
