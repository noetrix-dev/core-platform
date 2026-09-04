-- Painel financeiro pessoal — schema financas (Fase 1).
-- ANTES DE APLICAR: trocar <UUID_EWERTON> pelo id do auth.users do Ewerton
-- (Authentication -> Users no dashboard). Todas as colunas user_id usam esse
-- valor como DEFAULT; o app nunca preenche user_id.

CREATE SCHEMA IF NOT EXISTS financas;

CREATE TABLE financas.fin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  name TEXT NOT NULL,
  bank TEXT NOT NULL CHECK (bank IN ('inter','nubank','bradesco','btg')),
  type TEXT NOT NULL CHECK (type IN ('corrente','poupanca','investimento')),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_updated_at TIMESTAMPTZ DEFAULT now(),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','investment')),
  bucket TEXT CHECK (bucket IN ('necessidade','desejo','investimento')),
  color TEXT,
  icon TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  category_id UUID NOT NULL REFERENCES financas.fin_categories(id),
  name TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  creditor TEXT NOT NULL,
  grupo TEXT NOT NULL CHECK (grupo IN ('fgts','consignado','serasa','pessoal','familia','cartao')),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  remaining_amount NUMERIC(14,2) NOT NULL CHECK (remaining_amount >= 0),
  monthly_payment NUMERIC(14,2),
  due_day INT CHECK (due_day BETWEEN 1 AND 31),
  status TEXT NOT NULL CHECK (status IN ('ativa','quitada')) DEFAULT 'ativa',
  notes TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_recurring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  movement TEXT NOT NULL CHECK (movement IN ('income','expense','investment')),
  category_id UUID REFERENCES financas.fin_categories(id),
  subcategory_id UUID REFERENCES financas.fin_subcategories(id),
  account_id UUID REFERENCES financas.fin_accounts(id),
  day_of_month INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  type TEXT NOT NULL CHECK (type IN ('fixed','variable','installment')) DEFAULT 'fixed',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE financas.fin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '<UUID_EWERTON>',
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  movement TEXT NOT NULL CHECK (movement IN ('income','expense','investment')),
  type TEXT NOT NULL CHECK (type IN ('fixed','variable','installment')) DEFAULT 'variable',
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','overdue')) DEFAULT 'pending',
  account_id UUID REFERENCES financas.fin_accounts(id),
  category_id UUID REFERENCES financas.fin_categories(id),
  subcategory_id UUID REFERENCES financas.fin_subcategories(id),
  card_id UUID,
  debt_id UUID REFERENCES financas.fin_debts(id),
  installment_current INT,
  installment_total INT,
  installment_group_id UUID,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_template_id UUID REFERENCES financas.fin_recurring_templates(id),
  source TEXT NOT NULL CHECK (source IN ('manual','ofx')) DEFAULT 'manual',
  external_id TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX uq_fin_transactions_external
  ON financas.fin_transactions(user_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX idx_fin_transactions_status_due ON financas.fin_transactions(status, due_date);
CREATE INDEX idx_fin_transactions_due ON financas.fin_transactions(due_date);
CREATE INDEX idx_fin_transactions_account ON financas.fin_transactions(account_id);
CREATE INDEX idx_fin_transactions_category ON financas.fin_transactions(category_id);
CREATE INDEX idx_fin_transactions_group ON financas.fin_transactions(installment_group_id);
CREATE INDEX idx_fin_transactions_movement_due ON financas.fin_transactions(movement, due_date);

GRANT USAGE ON SCHEMA financas TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA financas TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA financas TO service_role;
NOTIFY pgrst, 'reload schema';
