const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

// Guarda contra conexão acidental com banco real: o ERP só fala com Postgres local nesta fase.
export function urlLocal(url: string | undefined): string {
  if (!url) throw new Error("URL do banco não definida.");
  if (!HOSTS_LOCAIS.has(new URL(url).hostname)) {
    throw new Error("A URL do banco precisa apontar para o Postgres local.");
  }
  return url;
}
