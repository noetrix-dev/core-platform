const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);
// O pg deixa ?host=, ?hostaddr=, ?port= etc. sobrescreverem a URL: só estes são aceitos.
const PARAMS_PERMITIDOS = new Set(["sslmode", "application_name"]);

// Guarda contra conexão acidental com banco real: o ERP só fala com Postgres local nesta fase.
export function urlLocal(url: string | undefined): string {
  if (!url) throw new Error("URL do banco não definida.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Sem cause: o TypeError do Node guarda a URL inteira (com senha) em `input`.
    throw new Error("A URL do banco é inválida.");
  }
  for (const chave of parsed.searchParams.keys()) {
    if (!PARAMS_PERMITIDOS.has(chave)) throw new Error("A URL do banco é inválida.");
  }
  if (!HOSTS_LOCAIS.has(parsed.hostname)) {
    throw new Error("A URL do banco precisa apontar para o Postgres local.");
  }
  return url;
}
