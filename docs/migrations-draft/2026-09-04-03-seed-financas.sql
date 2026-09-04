-- Seed de referência da Fase 1. Números são ponto de partida; editar pela UI.

INSERT INTO financas.fin_accounts (name, bank, type, balance) VALUES
  ('Inter',    'inter',    'corrente', 0),
  ('Nubank',   'nubank',   'corrente', 0),
  ('Bradesco', 'bradesco', 'corrente', 0);

INSERT INTO financas.fin_categories (name, type, bucket) VALUES
  ('Salário CLT',            'income',     NULL),
  ('Freela',                 'income',     NULL),
  ('Noetrix',                'income',     NULL),
  ('Moradia',                'expense',    'necessidade'),
  ('Mercado',                'expense',    'necessidade'),
  ('Contas de casa',         'expense',    'necessidade'),
  ('Transporte',             'expense',    'necessidade'),
  ('Saúde',                  'expense',    'necessidade'),
  ('Educação',               'expense',    'necessidade'),
  ('Lazer',                  'expense',    'desejo'),
  ('Restaurantes',           'expense',    'desejo'),
  ('Assinaturas',            'expense',    'desejo'),
  ('Compras',                'expense',    'desejo'),
  ('Aporte investimento',    'investment', 'investimento'),
  ('Reserva de emergência',  'investment', 'investimento');

INSERT INTO financas.fin_debts (creditor, grupo, total_amount, remaining_amount, monthly_payment) VALUES
  ('Empréstimo consignado',   'consignado', 22000.00, 22000.00, 900.00),
  ('Saque-aniversário FGTS',  'fgts',        8000.00,  8000.00, NULL),
  ('Negociação Serasa',       'serasa',      9500.00,  9500.00, 400.00),
  ('Empréstimo pessoal',      'pessoal',     7891.00,  7891.00, 300.00),
  ('Dívida com família',      'familia',     4500.00,  4500.00, NULL),
  ('Rotativo de cartão',      'cartao',      5000.00,  5000.00, NULL);

NOTIFY pgrst, 'reload schema';
