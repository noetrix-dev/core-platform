// Agregação pura dos atendimentos de um cliente. Sem I/O — testada no
// check de node.

export interface AtendimentoRow {
  realizado_em: string;
  valor_cobrado: number;
  forma_pagamento: string;
  servico_id: string;
  servico_nome: string;
}

export interface VisitaHistorico {
  data: string; // realizado_em ISO
  servico: string;
  valor: number;
  forma_pagamento: string;
}

export interface ResumoCliente {
  total_gasto: number;
  total_visitas: number;
  ultima_visita: string | null;
  servico_mais_frequente: string | null;
  historico: VisitaHistorico[]; // <= 10, mais recente primeiro
}

export function resumirAtendimentos(rows: AtendimentoRow[]): ResumoCliente {
  const total_gasto = rows.reduce((s, r) => s + (Number(r.valor_cobrado) || 0), 0);
  const total_visitas = rows.length;

  let ultima_visita: string | null = null;
  for (const r of rows) {
    if (!ultima_visita || r.realizado_em > ultima_visita) ultima_visita = r.realizado_em;
  }

  // moda do nome do serviço; empate → primeiro visto
  const contagem = new Map<string, number>();
  for (const r of rows) {
    contagem.set(r.servico_nome, (contagem.get(r.servico_nome) ?? 0) + 1);
  }
  let servico_mais_frequente: string | null = null;
  let maior = 0;
  for (const [nome, n] of contagem) {
    if (n > maior) {
      maior = n;
      servico_mais_frequente = nome;
    }
  }

  const historico: VisitaHistorico[] = [...rows]
    .sort((a, b) => (a.realizado_em < b.realizado_em ? 1 : a.realizado_em > b.realizado_em ? -1 : 0))
    .slice(0, 10)
    .map((r) => ({
      data: r.realizado_em,
      servico: r.servico_nome,
      valor: Number(r.valor_cobrado) || 0,
      forma_pagamento: r.forma_pagamento,
    }));

  return { total_gasto, total_visitas, ultima_visita, servico_mais_frequente, historico };
}

export function visitasPorCliente(
  rows: { cliente_id: string; realizado_em: string }[],
): Map<string, { total: number; ultima: string }> {
  const m = new Map<string, { total: number; ultima: string }>();
  for (const r of rows) {
    const cur = m.get(r.cliente_id);
    if (!cur) {
      m.set(r.cliente_id, { total: 1, ultima: r.realizado_em });
    } else {
      cur.total += 1;
      if (r.realizado_em > cur.ultima) cur.ultima = r.realizado_em;
    }
  }
  return m;
}
