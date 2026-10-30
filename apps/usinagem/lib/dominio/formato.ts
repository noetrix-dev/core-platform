const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Banco guarda timestamptz (UTC); a tela sempre mostra o horário de Brasília. */
export const formatarDataHora = (iso: string | Date): string => FORMATO.format(new Date(iso));
