// Normaliza um telefone digitado por humano para o formato canônico
// +55 + DDD (2) + número (8 ou 9). Retorna null quando a entrada não é um
// fixo/celular brasileiro plausível.
//
// ponytail: heurística de comprimento + DDD sem zero; não valida DDD real
// nem faixa de operadora. Se um dia precisar rigor, trocar por libphonenumber.
export function normalizarTelefone(raw: string): string | null {
  const digitos = (raw ?? "").replace(/\D/g, "");
  let nacional: string;
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    nacional = digitos.slice(2);
  } else if (digitos.startsWith("0") && (digitos.length === 11 || digitos.length === 12)) {
    // trunk "0" na frente do DDD (ex.: 0 11 3220-1234)
    nacional = digitos.slice(1);
  } else {
    nacional = digitos;
  }
  if (nacional.length < 10 || nacional.length > 11) return null;
  // DDD sem zero (descarta 0800, 0300, 0500…)
  if (!/^[1-9][1-9]$/.test(nacional.slice(0, 2))) return null;
  // celular (11 dígitos) tem 9 como primeiro dígito do número
  if (nacional.length === 11 && nacional[2] !== "9") return null;
  return `+55${nacional}`;
}
