---
paths:
  - "apps/**/api/**/*.ts"
  - "packages/**/*.ts"
---

# Backend

- Validar toda entrada no limite da API (body, query, params, headers) antes de qualquer lógica. Requisição inválida retorna 4xx, nunca chega ao domínio.
- Nunca vazar stack trace ou detalhe interno na resposta. Erro para o cliente é mensagem genérica + código; o detalhe vai só para o log do servidor.
- Handlers devem ser idempotentes. Repetir a mesma requisição não pode duplicar agendamento, mensagem ou cobrança.
- Secrets só via variáveis de ambiente. Nunca hardcode de chave, token ou URL com credencial no código.
- Nunca chamar a Evolution API diretamente. Todo envio/consulta de WhatsApp passa por `packages/whatsapp`.
