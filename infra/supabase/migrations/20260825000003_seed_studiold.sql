INSERT INTO barbearia_001.horarios_funcionamento (dia_semana, aberto, hora_abertura, hora_fechamento) VALUES
  (0, false, NULL, NULL),
  (1, true, '09:00', '17:00'),
  (2, false, NULL, NULL),
  (3, true, '09:00', '17:00'),
  (4, true, '09:00', '17:00'),
  (5, true, '09:00', '17:00'),
  (6, true, '08:00', '17:00');

INSERT INTO barbearia_001.bloqueios_fixos (descricao, dia_semana, hora_inicio, hora_fim, tipo) VALUES
  ('Almoço', NULL, '11:30', '12:30', 'suave');

INSERT INTO barbearia_001.servicos (nome, duracao_minutos, preco) VALUES
  ('Corte', 30, 55.00),
  ('Barba', 30, 55.00),
  ('Corte + Barba', 60, 100.00),
  ('Corte Infantil', 30, 60.00),
  ('Progressiva', 90, 120.00),
  ('Hidratação', 30, 35.00),
  ('Sobrancelha', 15, 20.00),
  ('Máscara Negra', 15, 20.00),
  ('Depilação Nariz + Orelhas', 15, 20.00),
  ('Corte + Barba + Sobrancelha', 75, 115.00),
  ('Corte + Barba + Máscara Negra', 75, 115.00),
  ('Corte + Barba + Nariz + Orelhas', 75, 115.00),
  ('StudiOLD Completo', 90, 130.00);