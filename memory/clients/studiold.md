# StudiOLD

Barbearia. Primeiro cliente e primeiro tenant da Noetrix.

- Grafia fixa: **StudiOLD** (S-t-u-d-i-O-L-D).
- Tenant: `barbearia_001`. Vertical: barbearia.
- Domínio: `studiold.noetrix.com.br`.
- Instância de WhatsApp (Evolution API): `barbearia_001`.
- App: `apps/studiold`. `NEXT_PUBLIC_TENANT` fixa o tenant.

## Horário de funcionamento

Fonte: seed `infra/supabase/migrations/20260825000003_seed_studiold.sql`.

| Dia | Aberto | Abre | Fecha |
| --- | --- | --- | --- |
| Domingo | não | | |
| Segunda | sim | 09:00 | 17:00 |
| Terça | não | | |
| Quarta | sim | 09:00 | 17:00 |
| Quinta | sim | 09:00 | 17:00 |
| Sexta | sim | 09:00 | 17:00 |
| Sábado | sim | 08:00 | 17:00 |

Bloqueio fixo: almoço 11:30 às 12:30, tipo `suave` (não bloqueia de forma rígida, pode ceder para encaixe).

## Serviços

13 serviços (seed real, preço em BRL):

| Serviço | Duração (min) | Preço |
| --- | --- | --- |
| Corte | 30 | 55,00 |
| Barba | 30 | 55,00 |
| Corte + Barba | 60 | 100,00 |
| Corte Infantil | 30 | 60,00 |
| Progressiva | 90 | 120,00 |
| Hidratação | 30 | 35,00 |
| Sobrancelha | 15 | 20,00 |
| Máscara Negra | 15 | 20,00 |
| Depilação Nariz + Orelhas | 15 | 20,00 |
| Corte + Barba + Sobrancelha | 75 | 115,00 |
| Corte + Barba + Máscara Negra | 75 | 115,00 |
| Corte + Barba + Nariz + Orelhas | 75 | 115,00 |
| StudiOLD Completo | 90 | 130,00 |

## Fluxos

- **Cliente final**: agenda, reagenda, cancela, entra na fila de espera e pede encaixe conversando em linguagem natural pelo WhatsApp da barbearia. Sem app, sem conta.
- **Equipe (dono e barbeiros)**: opera agenda, clientes, serviços, horários, bloqueios, fila e encaixes pelo dashboard web, no balcão ou no celular entre cortes. Só supervisiona e trata exceção.
- **Exceção central**: cliente cancela, vaga abre, a `fila_espera` é notificada ou um `pedido_encaixe` é oferecido, sempre com janela de expiração. A oferta é automática antes de exigir ação da equipe.
- **Pós-atendimento**: `atendimentos` registra valor cobrado e forma de pagamento (pix, cartão de débito, cartão de crédito, dinheiro).

## Regras de negócio

- Agenda é **fila única**: o schema atual não modela múltiplos barbeiros. Suporte a mais de um profissional está em aberto, não assumir.
- Status de agendamento: `confirmado`, `pendente`, `cancelado`, `concluido`, `nao_compareceu`.
- Bloqueio `suave` (almoço) pode ser cedido para encaixe; bloqueio `rigido` não.
- Config de agenda (horários, serviços, bloqueios) reflete a operação real e é editável pela equipe.
- Envio de WhatsApp em lote sempre com intervalo aleatório (jitter) entre mensagens.
- Produto inteiro em pt-BR.

## Em aberto (não inventar)

- Identidade visual da StudiOLD: logo, cores, tom de voz. Não fornecida.
- Suporte a múltiplos barbeiros / cadeiras.
- Sem logo, fotos ou depoimentos no repositório. Não fabricar.
