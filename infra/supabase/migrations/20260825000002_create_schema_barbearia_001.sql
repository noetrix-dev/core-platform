CREATE SCHEMA IF NOT EXISTS barbearia_001;

CREATE TABLE barbearia_001.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL UNIQUE,
  genero TEXT CHECK (genero IN ('masculino', 'feminino', 'nao_informado')) DEFAULT 'nao_informado',
  data_nascimento DATE,
  observacoes TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE barbearia_001.servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  duracao_minutos INTEGER NOT NULL DEFAULT 60,
  preco NUMERIC(10,2) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE barbearia_001.horarios_funcionamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  aberto BOOLEAN NOT NULL DEFAULT false,
  hora_abertura TIME,
  hora_fechamento TIME,
  UNIQUE(dia_semana)
);

CREATE TABLE barbearia_001.bloqueios_fixos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  dia_semana INTEGER,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('suave', 'rigido')) DEFAULT 'rigido',
  ativo BOOLEAN DEFAULT true
);

CREATE TABLE barbearia_001.bloqueios_pontuais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT,
  data DATE NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE barbearia_001.slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_hora TIMESTAMPTZ NOT NULL,
  duracao_minutos INTEGER NOT NULL DEFAULT 60,
  disponivel BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(data_hora)
);

CREATE TABLE barbearia_001.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES barbearia_001.slots(id),
  cliente_id UUID NOT NULL REFERENCES barbearia_001.clientes(id),
  servico_id UUID NOT NULL REFERENCES barbearia_001.servicos(id),
  duracao_minutos INTEGER,
  status TEXT NOT NULL CHECK (status IN ('confirmado','pendente','cancelado','concluido','nao_compareceu')) DEFAULT 'confirmado',
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(slot_id)
);

CREATE TABLE barbearia_001.fila_espera (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES barbearia_001.clientes(id),
  data_desejada DATE NOT NULL,
  servico_id UUID REFERENCES barbearia_001.servicos(id),
  status TEXT NOT NULL CHECK (status IN ('aguardando','notificado','confirmado','expirado','cancelado')) DEFAULT 'aguardando',
  notificado_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ,
  posicao INTEGER NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE barbearia_001.pedidos_encaixe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES barbearia_001.clientes(id),
  servico_id UUID NOT NULL REFERENCES barbearia_001.servicos(id),
  horario_solicitado TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendente','confirmado','recusado','expirado')) DEFAULT 'pendente',
  expira_em TIMESTAMPTZ NOT NULL,
  agendamento_id UUID REFERENCES barbearia_001.agendamentos(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE barbearia_001.atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID REFERENCES barbearia_001.agendamentos(id),
  cliente_id UUID NOT NULL REFERENCES barbearia_001.clientes(id),
  servico_id UUID NOT NULL REFERENCES barbearia_001.servicos(id),
  valor_cobrado NUMERIC(10,2) NOT NULL,
  forma_pagamento TEXT CHECK (forma_pagamento IN ('pix','cartao_debito','cartao_credito','dinheiro')),
  realizado_em TIMESTAMPTZ DEFAULT now(),
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE barbearia_001.whatsapp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  para TEXT NOT NULL,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status TEXT CHECK (status IN ('enviado','erro','pendente')) DEFAULT 'pendente',
  erro_detalhe TEXT,
  enviado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agendamentos_slot ON barbearia_001.agendamentos(slot_id);
CREATE INDEX idx_agendamentos_cliente ON barbearia_001.agendamentos(cliente_id);
CREATE INDEX idx_agendamentos_status ON barbearia_001.agendamentos(status);
CREATE INDEX idx_slots_data ON barbearia_001.slots(data_hora);
CREATE INDEX idx_fila_status ON barbearia_001.fila_espera(status, posicao);
CREATE INDEX idx_atendimentos_data ON barbearia_001.atendimentos(realizado_em);
CREATE INDEX idx_pedidos_status ON barbearia_001.pedidos_encaixe(status, expira_em);