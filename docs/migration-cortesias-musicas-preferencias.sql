-- RASCUNHO PARA REVISÃO. Não é uma migration ainda — o caminho
-- infra/supabase/migrations/ é protegido (escrita à mão).
--
-- Para aplicar:
--   pnpm supabase migration new cortesias_musicas_preferencias
--   (isso cria infra/supabase/migrations/<timestamp>_cortesias_musicas_preferencias.sql)
--   colar o conteúdo abaixo, revisar, e `pnpm supabase db push`
--
-- O timestamp pedido no chat era 20260828000002.
-- ============================================================================

-- Cortesias (bebidas oferecidas), estilos de música e preferências do cliente.

CREATE TABLE barbearia_001.cortesias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  quantidade_estoque INTEGER DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE barbearia_001.estilos_musica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true
);

ALTER TABLE barbearia_001.clientes
  ADD COLUMN IF NOT EXISTS cortesia_favorita_id UUID REFERENCES barbearia_001.cortesias(id),
  ADD COLUMN IF NOT EXISTS estilo_musica_id UUID REFERENCES barbearia_001.estilos_musica(id),
  ADD COLUMN IF NOT EXISTS observacoes_fixas TEXT;

ALTER TABLE barbearia_001.agendamentos
  ADD COLUMN IF NOT EXISTS cortesia_id UUID REFERENCES barbearia_001.cortesias(id);

INSERT INTO barbearia_001.cortesias (nome) VALUES
  ('Água'),
  ('Café'),
  ('Refrigerante'),
  ('Cerveja'),
  ('Suco'),
  ('Chá');

INSERT INTO barbearia_001.estilos_musica (nome) VALUES
  ('Funk'),
  ('Rap'),
  ('Sertanejo'),
  ('Pagode'),
  ('Rock'),
  ('Eletrônico'),
  ('Sem preferência');
