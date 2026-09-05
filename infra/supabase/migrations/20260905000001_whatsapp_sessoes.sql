-- Migration: whatsapp_sessoes
-- Schema: barbearia_001
-- Criado em: 2026-09-05

CREATE TABLE barbearia_001.whatsapp_sessoes (
  numero           TEXT PRIMARY KEY,
  cliente_id       UUID REFERENCES barbearia_001.clientes(id) ON DELETE SET NULL,
  modo             TEXT NOT NULL DEFAULT 'bot' CHECK (modo IN ('bot', 'humano')),
  estado_conversa  TEXT NOT NULL DEFAULT 'inicio',
  contexto         JSONB DEFAULT '{}',
  motivo_escalonamento TEXT,
  ultima_mensagem  TEXT,
  ultima_interacao TIMESTAMPTZ DEFAULT now(),
  escalado_em      TIMESTAMPTZ,
  assumido_em      TIMESTAMPTZ,
  devolvido_em     TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ DEFAULT now(),
  atualizado_em    TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON ALL TABLES IN SCHEMA barbearia_001 TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA barbearia_001 TO service_role;
NOTIFY pgrst, 'reload schema';
