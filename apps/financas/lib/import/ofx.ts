export type OfxTransacao = {
  dataIso: string;
  valor: number;
  memo: string;
  fitid: string | null;
  movimentoSugerido: "income" | "expense";
};

function tag(bloco: string, nome: string): string | null {
  // XML: <TAG>valor</TAG>  |  SGML: <TAG>valor (até < ou fim de linha)
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : null;
}

export function parseOfx(conteudo: string): OfxTransacao[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const out: OfxTransacao[] = [];

  for (const b of blocos) {
    const dtRaw = tag(b, "DTPOSTED");
    const amtRaw = tag(b, "TRNAMT");
    if (!dtRaw || !amtRaw) continue;

    const digitos = dtRaw.replace(/[^0-9]/g, "").slice(0, 8);
    if (digitos.length < 8) continue;
    const dataIso = `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`;

    const valor = Number(amtRaw.replace(",", "."));
    if (Number.isNaN(valor)) continue;

    const memo = tag(b, "MEMO") ?? tag(b, "NAME") ?? "";
    const fitid = tag(b, "FITID");

    out.push({
      dataIso,
      valor,
      memo,
      fitid: fitid || null,
      movimentoSugerido: valor < 0 ? "expense" : "income",
    });
  }
  return out;
}
