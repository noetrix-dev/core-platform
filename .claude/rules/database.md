---
paths:
  - "infra/supabase/**/*.sql"
  - "apps/**/lib/supabase/**/*.ts"
---

# Database

- Toda alteração de schema entra por migration nova em `infra/supabase/migrations/`. Nada de mudança de schema fora de migration.
- Nunca editar uma migration já aplicada. Correção é sempre uma migration nova por cima.
- Nunca SQL cru nos apps. Acesso a dados sempre pelo Supabase client (query builder / RPC).
- Operações de fila (`fila_espera`, `pedidos_encaixe`, alocação de `slots`) usam `SELECT ... FOR UPDATE` para travar a linha e evitar corrida entre dois atendimentos concorrentes.
