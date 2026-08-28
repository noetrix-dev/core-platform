# Security

Sempre ativo.

- Nunca expor secrets em log ou código — nem chave, token, senha, connection string, nem trecho de payload que contenha um deles.
- Nunca commitar `.env` ou qualquer arquivo `.env.*`. Segredo novo entra por variável de ambiente do provedor.
- Validar toda entrada no servidor. Validação de cliente é conveniência de UX, nunca a barreira de confiança.
- Nunca disparar WhatsApp sem intervalo aleatório entre mensagens. Envio em lote respeita jitter para não parecer robô e não queimar a instância.
- `infra/supabase/migrations/**` e arquivos `.env*` são protegidos: não editar por ferramenta automatizada. Migration é escrita e revisada à mão (`pnpm supabase migration new <nome>`); `.env` é editado à mão.
