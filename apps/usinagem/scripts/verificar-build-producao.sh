#!/usr/bin/env bash
# Prova que o seletor de dev não existe em produção, mesmo com ENABLE_DEV_SWITCHER=1:
# nenhum marcador do seletor no build e /dev/perfil (e variações) respondendo 404 no servidor de produção.
# Nunca imprime valores de variáveis de ambiente.
set -euo pipefail
cd "$(dirname "$0")/.."

PORTA=3999
BASE="http://127.0.0.1:$PORTA"
# Cookie de sessão falso: o proxy só olha a presença (barreira otimista), então as sondas não são desviadas para
# /entrar e nenhuma request chama auth(). Rota inexistente responde 404 sem tocar em sessão nem banco.
COOKIE="usinagem.session_token=sonda-do-verificador"

falha() {
  echo "FALHA: $1" >&2
  exit 1
}

if curl -s -o /dev/null --max-time 2 "$BASE/"; then
  falha "a porta $PORTA já está ocupada; encerre o processo antes de verificar."
fi

rm -rf .next
ENABLE_DEV_SWITCHER=1 NODE_ENV=production pnpm build

# Marcadores do seletor: nome do cookie, título da página (só o trecho exclusivo dela: o comentário de
# lib/dominio/seguranca/dev.ts também diz "Seletor de perfil" e vai nos source maps) e caminho da rota.
# .next/cache fica de fora (cache do compilador, não é servido).
for marcador in "usinagem_dev_usuario" "Seletor de perfil (somente desenvolvimento" "dev/perfil"; do
  if grep -rIlF --exclude-dir=cache "$marcador" .next >/dev/null; then
    falha "o marcador \"$marcador\" está no build de produção."
  fi
done

ENABLE_DEV_SWITCHER=1 NODE_ENV=production setsid node_modules/.bin/next start -H 127.0.0.1 -p "$PORTA" >/dev/null 2>&1 &
PID=$!
# setsid põe o servidor num grupo próprio: matar o grupo leva junto qualquer processo filho.
trap 'kill -- "-$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true' EXIT

pronto=""
for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 -H "Cookie: $COOKIE" "$BASE/sonda-inexistente-do-verificador"; then
    pronto=1
    break
  fi
  sleep 1
done
[ -n "$pronto" ] || falha "o servidor de produção não respondeu em $PORTA."

# -L segue o 308 de barra final; o código conferido é o da resposta final.
for caminho in "/dev/perfil" "/dev/perfil/" "/DEV/perfil"; do
  codigo=$(curl -s -L --max-redirs 3 -o /dev/null -w '%{http_code}' --max-time 10 -H "Cookie: $COOKIE" "$BASE$caminho")
  [ "$codigo" = "404" ] || falha "$caminho respondeu $codigo em produção (esperado 404)."
done

echo "OK: seletor de dev ausente do build de produção."
