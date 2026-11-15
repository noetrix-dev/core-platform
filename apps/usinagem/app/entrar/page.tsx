import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { destinoSeguro } from "../../lib/dominio/seguranca/login";
import { usuarioAtual } from "../../lib/servidor/sessao";
import { FormEntrar } from "./FormEntrar";

export const metadata: Metadata = { title: "Entrar | ERP Express" };

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const { volta, reautenticar } = await searchParams;
  const reautenticando = reautenticar === "1";
  const destino = destinoSeguro(volta);
  // Só sai daqui com usuário válido, nunca pela presença do cookie: o cookie de sessão obsoleta (senha trocada,
  // conta inativa) continua no navegador e passa pelo proxy; redirecionar por ele faria laço entre /entrar e o app.
  if (!reautenticando && (await usuarioAtual())) redirect(destino);
  return (
    <main>
      <h1>Entrar</h1>
      <FormEntrar reautenticar={reautenticando} volta={destino} />
    </main>
  );
}
