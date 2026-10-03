-- RASCUNHO PARA REVISÃO. infra/supabase/migrations/ é protegido (escrita à mão).
-- Aplicar: pnpm supabase migration new codigos_verificacao → colar → revisar → pnpm supabase db push
-- ORDEM: aplicar ANTES do deploy do app (Server Actions de /agendar dependem desta tabela).

create table barbearia_001.codigos_verificacao (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  codigo text not null,
  canal text not null default 'email' check (canal in ('email', 'whatsapp')),
  email text,
  tentativas integer not null default 0,
  expira_em timestamptz not null,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index idx_codigos_verificacao_telefone
  on barbearia_001.codigos_verificacao (telefone, usado, expira_em);

NOTIFY pgrst, 'reload schema';
