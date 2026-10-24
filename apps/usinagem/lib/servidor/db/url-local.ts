const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

// Guarda contra conexão acidental com banco real: o ERP só fala com Postgres local nesta fase.
export function urlLocal(url: string | undefined): string {
  if (!url) throw new Error("URL do banco não definida.");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // Sem cause: o TypeError do Node guarda a URL inteira (com senha) em `input`.
    throw new Error("A URL do banco é inválida.");
  }
  if (!HOSTS_LOCAIS.has(host)) {
    throw new Error("A URL do banco precisa apontar para o Postgres local.");
  }
  return url;
}
